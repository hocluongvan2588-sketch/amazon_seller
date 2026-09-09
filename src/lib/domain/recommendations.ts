/**
 * PPC recommendation rules engine — spec §5.6.
 *
 * Recommendation-first, never autonomous: every proposal carries guardrails
 * (bid min/max, budget approval limit, minimum clicks) and must go through
 * the approval queue before execution.
 */

import type { AdCampaign, AdMetricsDaily, Recommendation } from "../types";

export interface PpcThresholds {
  minClicks: number;          // recommendation needs at least N clicks of data
  acosAlertThreshold: number; // ACOS above this raises an anomaly
  budgetUtilizationAlert: number; // spend vs daily budget ratio
  dailyBudgetApprovalLimit: number; // max budget increase without extra approval (USD)
  bidMin: number;             // hard guardrail
  bidMax: number;             // hard guardrail
}

export const DEFAULT_PPC_THRESHOLDS: PpcThresholds = {
  minClicks: 10,
  acosAlertThreshold: 0.35,
  budgetUtilizationAlert: 0.9,
  dailyBudgetApprovalLimit: 50,
  bidMin: 0.35,
  bidMax: 9.99,
};

export interface CampaignAggregate {
  campaign: AdCampaign;
  metrics: AdMetricsDaily[]; // sorted by date asc
  impressions: number;
  clicks: number;
  spend: number;
  orders: number;
  sales: number;
  ctr: number | null;
  cvr: number | null;
  acos: number | null;
  dateFrom: string;
  dateTo: string;
  lastNSpend: number;  // spend in the last 7 days
  lastNClicks: number; // clicks in the last 7 days
}

export function aggregateCampaignMetrics(
  campaign: AdCampaign,
  metrics: AdMetricsDaily[]
): CampaignAggregate {
  const sorted = [...metrics].sort((a, b) => a.metric_date.localeCompare(b.metric_date));
  const sum = (f: (m: AdMetricsDaily) => number) => sorted.reduce((s, m) => s + f(m), 0);
  const impressions = sum((m) => m.impressions);
  const clicks = sum((m) => m.clicks);
  const spend = sum((m) => m.spend);
  const orders = sum((m) => m.orders);
  const sales = sum((m) => m.sales);
  const last7 = sorted.slice(-7);
  return {
    campaign,
    metrics: sorted,
    impressions,
    clicks,
    spend,
    orders,
    sales,
    ctr: impressions > 0 ? clicks / impressions : null,
    cvr: clicks > 0 ? orders / clicks : null,
    acos: sales > 0 ? spend / sales : null,
    dateFrom: sorted[0]?.metric_date ?? "",
    dateTo: sorted[sorted.length - 1]?.metric_date ?? "",
    lastNSpend: last7.reduce((s, m) => s + m.spend, 0),
    lastNClicks: last7.reduce((s, m) => s + m.clicks, 0),
  };
}

function daysBetween(from: string, to: string): number {
  return Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000));
}

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Rules (spec §5.6 MVP):
 *  1. Campaign hết ngân sách — daily spend ≥ threshold × budget
 *  2. Spend cao nhưng chưa có order — spend > 0, orders == 0, clicks ≥ min
 *  3. ACOS vượt threshold — with enough orders/clicks
 *  4. CPC anomaly — last-7d CPC deviates > 40% from the prior window
 *  5. CVR anomaly — CVR drops by more than half with enough clicks
 */
export function generatePpcRecommendations(
  aggregates: CampaignAggregate[],
  thresholds: PpcThresholds = DEFAULT_PPC_THRESHOLDS
): Recommendation[] {
  const recs: Recommendation[] = [];
  const now = new Date().toISOString();

  for (const agg of aggregates) {
    const scope = agg.campaign.id;
    const guardrails = {
      bidMin: thresholds.bidMin,
      bidMax: thresholds.bidMax,
      dailyBudgetApprovalLimit: thresholds.dailyBudgetApprovalLimit,
      requiresApproval: true,
    };
    const dataWindow = agg.dateFrom && agg.dateTo ? `${agg.dateFrom} → ${agg.dateTo}` : "n/a";
    const freshness = agg.campaign.last_synced_at ?? agg.dateTo;

    // Rule 1 — campaign running out of budget
    if (agg.metrics.length > 0) {
      const windowDays = daysBetween(agg.dateFrom, agg.dateTo);
      const avgDailySpend = agg.spend / windowDays;
      if (avgDailySpend >= agg.campaign.daily_budget * thresholds.budgetUtilizationAlert) {
        const proposedBudget = Math.ceil(avgDailySpend * 1.2);
        recs.push({
          id: uid("rec"),
          client_account_id: agg.campaign.client_account_id,
          module: "ppc",
          recommendation_type: "campaign_budget_exhausted",
          title: `Campaign "${agg.campaign.name}" sắp hết ngân sách`,
          explanation:
            `Chi tiêu trung bình ${avgDailySpend.toFixed(2)}/ngày đã đạt ` +
            `${Math.round((avgDailySpend / agg.campaign.daily_budget) * 100)}% ngân sách ` +
            `${agg.campaign.daily_budget}/ngày. Campaign có thể bị mất impression vào cuối ngày. ` +
            `Dữ liệu: ${dataWindow}, sync lần cuối ${freshness?.slice(0, 10) ?? "n/a"}.`,
          evidence_ids: agg.metrics.slice(-7).map((m) => m.id),
          confidence: agg.lastNClicks >= thresholds.minClicks ? "high" : "medium",
          impact: agg.orders > 0 ? "high" : "medium",
          proposed_action: {
            type: "increase_daily_budget",
            campaign_id: scope,
            current_budget: agg.campaign.daily_budget,
            proposed_budget: proposedBudget,
            increase_amount: proposedBudget - agg.campaign.daily_budget,
          },
          guardrails: {
            ...guardrails,
            note:
              proposedBudget - agg.campaign.daily_budget > thresholds.dailyBudgetApprovalLimit
                ? `Mức tăng ${(proposedBudget - agg.campaign.daily_budget).toFixed(2)} vượt daily approval limit (${thresholds.dailyBudgetApprovalLimit}) — cần approval riêng.`
                : `Mức tăng nằm trong daily approval limit (${thresholds.dailyBudgetApprovalLimit}).`,
          },
          status: "analysis_ready",
          model_version: "rules-v1",
          created_at: now,
          updated_at: now,
        });
      }
    }

    // Rule 2 — spend without orders
    if (agg.spend > 0 && agg.orders === 0 && agg.clicks >= thresholds.minClicks) {
      recs.push({
        id: uid("rec"),
        client_account_id: agg.campaign.client_account_id,
        module: "ppc",
        recommendation_type: "spend_no_orders",
        title: `Campaign "${agg.campaign.name}" chi tiêu nhưng chưa có đơn`,
        explanation:
          `Đã chi ${agg.spend.toFixed(2)} cho ${agg.clicks} clicks nhưng 0 orders trong ${dataWindow}. ` +
          `Cần kiểm tra search term report và landing page trước khi tắt campaign.`,
        evidence_ids: agg.metrics.map((m) => m.id).slice(-14),
        confidence: "high",
        impact: "high",
        proposed_action: {
          type: "review_and_pause",
          campaign_id: scope,
          spend: agg.spend,
          suggested_action: "Review search terms; pause campaign nếu CVR = 0 sau khi đã đủ click.",
        },
        guardrails,
        status: "analysis_ready",
        model_version: "rules-v1",
        created_at: now,
        updated_at: now,
      });
    }

    // Rule 3 — ACOS above threshold
    if (
      agg.acos !== null &&
      agg.acos > thresholds.acosAlertThreshold &&
      agg.clicks >= thresholds.minClicks &&
      agg.orders >= 1
    ) {
      recs.push({
        id: uid("rec"),
        client_account_id: agg.campaign.client_account_id,
        module: "ppc",
        recommendation_type: "acos_above_threshold",
        title: `ACOS của "${agg.campaign.name}" vượt ngưỡng`,
        explanation:
          `ACOS ${(agg.acos * 100).toFixed(1)}% vượt ngưỡng cảnh báo ` +
          `${(thresholds.acosAlertThreshold * 100).toFixed(0)}% (${dataWindow}). ` +
          `Cần đối chiếu break-even ACOS từ cost profile trước khi giảm bid.`,
        evidence_ids: agg.metrics.map((m) => m.id).slice(-14),
        confidence: "high",
        impact: agg.acos > thresholds.acosAlertThreshold * 1.5 ? "high" : "medium",
        proposed_action: {
          type: "optimize_acos",
          campaign_id: scope,
          current_acos: agg.acos,
          threshold: thresholds.acosAlertThreshold,
          suggested_actions: ["Giảm bid 15–20% cho target ACOS cao", "Thêm negative keywords cho search term không chuyển đổi"],
        },
        guardrails: { ...guardrails, negative_keyword_requires_approval: true },
        status: "analysis_ready",
        model_version: "rules-v1",
        created_at: now,
        updated_at: now,
      });
    }

    // Rule 4/5 — CPC & CVR anomalies between the last 7 days and the prior window
    if (agg.metrics.length >= 10) {
      const last7 = agg.metrics.slice(-7);
      const prior = agg.metrics.slice(-14, -7);
      const avg = (arr: AdMetricsDaily[], f: (m: AdMetricsDaily) => number) =>
        arr.length ? arr.reduce((s, m) => s + f(m), 0) / arr.length : 0;

      const cpcLast = last7.reduce((s, m) => s + m.spend, 0) / Math.max(1, last7.reduce((s, m) => s + m.clicks, 0));
      const cpcPrior = prior.reduce((s, m) => s + m.spend, 0) / Math.max(1, prior.reduce((s, m) => s + m.clicks, 0));
      if (cpcPrior > 0 && cpcLast > cpcPrior * 1.4 && agg.lastNClicks >= thresholds.minClicks) {
        recs.push({
          id: uid("rec"),
          client_account_id: agg.campaign.client_account_id,
          module: "ppc",
          recommendation_type: "cpc_anomaly",
          title: `CPC của "${agg.campaign.name}" tăng bất thường`,
          explanation:
            `CPC 7 ngày gần nhất ${cpcLast.toFixed(2)} cao hơn 40% so với giai đoạn trước (${cpcPrior.toFixed(2)}). ` +
            `Có thể do cạnh tranh bid tăng — cần kiểm tra trước khi Adjust.`,
          evidence_ids: last7.map((m) => m.id),
          confidence: "medium",
          impact: "medium",
          proposed_action: {
            type: "investigate_cpc",
            campaign_id: scope,
            cpc_last7: Number(cpcLast.toFixed(2)),
            cpc_prior: Number(cpcPrior.toFixed(2)),
          },
          guardrails,
          status: "analysis_ready",
          model_version: "rules-v1",
          created_at: now,
          updated_at: now,
        });
      }

      const cvrLast = last7.reduce((s, m) => s + m.orders, 0) / Math.max(1, last7.reduce((s, m) => s + m.clicks, 0));
      const cvrPrior = prior.reduce((s, m) => s + m.orders, 0) / Math.max(1, prior.reduce((s, m) => s + m.clicks, 0));
      if (cvrPrior > 0.02 && cvrLast < cvrPrior * 0.5 && agg.lastNClicks >= thresholds.minClicks) {
        recs.push({
          id: uid("rec"),
          client_account_id: agg.campaign.client_account_id,
          module: "ppc",
          recommendation_type: "cvr_anomaly",
          title: `CVR của "${agg.campaign.name}" giảm mạnh`,
          explanation:
            `CVR 7 ngày gần nhất ${(cvrLast * 100).toFixed(1)}% chỉ bằng một nửa giai đoạn trước (${(cvrPrior * 100).toFixed(1)}%). ` +
            `Kiểm tra listing (giá, ảnh, review mới tiêu cực) và inventory.`,
          evidence_ids: last7.map((m) => m.id),
          confidence: "medium",
          impact: "high",
          proposed_action: {
            type: "investigate_cvr",
            campaign_id: scope,
            cvr_last7: Number((cvrLast * 100).toFixed(1)),
            cvr_prior: Number((cvrPrior * 100).toFixed(1)),
          },
          guardrails,
          status: "analysis_ready",
          model_version: "rules-v1",
          created_at: now,
          updated_at: now,
        });
      }
    }
  }

  return recs;
}

/** Clamp a proposed bid into the hard guardrails (spec §5.6). */
export function clampBid(proposed: number, thresholds: PpcThresholds = DEFAULT_PPC_THRESHOLDS): number {
  return Math.min(thresholds.bidMax, Math.max(thresholds.bidMin, proposed));
}
