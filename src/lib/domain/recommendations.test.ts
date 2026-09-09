import { describe, expect, it } from "vitest";
import {
  aggregateCampaignMetrics,
  clampBid,
  DEFAULT_PPC_THRESHOLDS,
  generatePpcRecommendations,
  type CampaignAggregate,
} from "./recommendations";
import type { AdCampaign, AdMetricsDaily } from "../types";

function campaign(overrides: Partial<AdCampaign> = {}): AdCampaign {
  return {
    id: "camp-1",
    client_account_id: "client-1",
    amazon_account_id: null,
    marketplace: "US",
    campaign_id: "123456789",
    name: "Exact - Core",
    campaign_type: "sponsored_products",
    daily_budget: 20,
    status: "enabled",
    last_synced_at: "2026-09-08T00:00:00Z",
    created_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function metric(day: number, overrides: Partial<AdMetricsDaily> = {}): AdMetricsDaily {
  return {
    id: `m-${day}`,
    campaign_id: "camp-1",
    metric_date: `2026-08-${String(day).padStart(2, "0")}`,
    impressions: 2000,
    clicks: 30,
    spend: 15,
    orders: 2,
    sales: 60,
    ctr: null,
    cvr: null,
    acos: null,
    tacos: null,
    source_report_id: null,
    ...overrides,
  };
}

describe("aggregateCampaignMetrics", () => {
  it("sums impressions, clicks, spend, orders and sales over the window", () => {
    const agg = aggregateCampaignMetrics(campaign(), [
      metric(1, { clicks: 10, spend: 5, orders: 1, sales: 20 }),
      metric(2, { clicks: 30, spend: 15, orders: 2, sales: 60 }),
    ]);
    expect(agg.clicks).toBe(40);
    expect(agg.spend).toBe(20);
    expect(agg.orders).toBe(3);
    expect(agg.sales).toBe(80);
    expect(agg.ctr).toBeCloseTo(40 / 4000, 5);
    expect(agg.cvr).toBeCloseTo(3 / 40, 5);
    expect(agg.acos).toBeCloseTo(20 / 80, 5);
  });
});

describe("generatePpcRecommendations", () => {
  it("rule 1: flags campaigns about to exhaust their daily budget", () => {
    const metrics = Array.from({ length: 14 }, (_, i) =>
      metric(i + 1, { spend: 19, clicks: 25, orders: 1, sales: 40 })
    );
    const recs = generatePpcRecommendations([aggregateCampaignMetrics(campaign(), metrics)]);
    const budget = recs.find((r) => r.recommendation_type === "campaign_budget_exhausted");
    expect(budget).toBeDefined();
    expect((budget!.proposed_action as { proposed_budget: number }).proposed_budget).toBeGreaterThan(20);
    expect(budget!.evidence_ids.length).toBeGreaterThan(0);
  });

  it("rule 2: flags spend with zero orders once minimum clicks are met", () => {
    const metrics = Array.from({ length: 14 }, (_, i) =>
      metric(i + 1, { spend: 10, clicks: 5, orders: 0, sales: 0 })
    );
    const recs = generatePpcRecommendations([aggregateCampaignMetrics(campaign(), metrics)]);
    expect(recs.find((r) => r.recommendation_type === "spend_no_orders")).toBeDefined();
  });

  it("rule 2: does not flag low-click noise (guardrail minClicks)", () => {
    const metrics = Array.from({ length: 7 }, (_, i) =>
      metric(i + 1, { spend: 2, clicks: 1, orders: 0, sales: 0 }) // 7 clicks total < 10
    );
    const recs = generatePpcRecommendations([aggregateCampaignMetrics(campaign(), metrics)]);
    expect(recs.find((r) => r.recommendation_type === "spend_no_orders")).toBeUndefined();
  });

  it("rule 3: flags ACOS above threshold", () => {
    const metrics = Array.from({ length: 14 }, (_, i) =>
      metric(i + 1, { spend: 36, clicks: 40, orders: 1, sales: 60 }) // ACOS 60%
    );
    const recs = generatePpcRecommendations([aggregateCampaignMetrics(campaign(), metrics)]);
    const acos = recs.find((r) => r.recommendation_type === "acos_above_threshold");
    expect(acos).toBeDefined();
    expect(acos!.impact).toBe("high");
  });

  it("rule 4: flags a CPC jump of more than 40% in the last 7 days", () => {
    const metrics = [
      ...Array.from({ length: 7 }, (_, i) => metric(i + 1, { clicks: 30, spend: 15 })), // CPC 0.5
      ...Array.from({ length: 7 }, (_, i) => metric(i + 8, { clicks: 20, spend: 18 })), // CPC 0.9
    ];
    const recs = generatePpcRecommendations([aggregateCampaignMetrics(campaign(), metrics)]);
    expect(recs.find((r) => r.recommendation_type === "cpc_anomaly")).toBeDefined();
  });

  it("rule 5: flags a CVR collapse in the last 7 days", () => {
    const metrics = [
      ...Array.from({ length: 7 }, (_, i) => metric(i + 1, { clicks: 40, orders: 4, sales: 120 })),
      ...Array.from({ length: 7 }, (_, i) => metric(i + 8, { clicks: 40, orders: 1, sales: 30 })),
    ];
    const recs = generatePpcRecommendations([aggregateCampaignMetrics(campaign(), metrics)]);
    expect(recs.find((r) => r.recommendation_type === "cvr_anomaly")).toBeDefined();
  });

  it("every recommendation requires approval and carries guardrails", () => {
    const metrics = Array.from({ length: 14 }, (_, i) =>
      metric(i + 1, { spend: 19, clicks: 25, orders: 0, sales: 0 })
    );
    const recs = generatePpcRecommendations([aggregateCampaignMetrics(campaign(), metrics)]);
    for (const r of recs) {
      expect((r.guardrails as { requiresApproval: boolean }).requiresApproval).toBe(true);
      expect((r.guardrails as { bidMin: number }).bidMin).toBe(DEFAULT_PPC_THRESHOLDS.bidMin);
      expect((r.guardrails as { bidMax: number }).bidMax).toBe(DEFAULT_PPC_THRESHOLDS.bidMax);
      expect(r.evidence_ids.length).toBeGreaterThan(0);
      expect(r.model_version).toBe("rules-v1");
    }
  });

  it("includes the data window and freshness in the explanation", () => {
    const metrics = [metric(1), metric(2)];
    const recs = generatePpcRecommendations([aggregateCampaignMetrics(campaign(), metrics)]);
    for (const r of recs) expect(r.explanation).toMatch(/2026-08-01 → 2026-08-02/);
  });
});

describe("clampBid", () => {
  it("clamps proposals into the hard bid guardrails", () => {
    expect(clampBid(0.1)).toBe(0.35);
    expect(clampBid(25)).toBe(9.99);
    expect(clampBid(2.5)).toBe(2.5);
  });
});
