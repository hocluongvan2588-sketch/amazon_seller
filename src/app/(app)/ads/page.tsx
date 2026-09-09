import { getAdapter } from "@/lib/data/factory";
import { requireSessionUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import {
  decideRecommendationAction,
  executeRecommendationAction,
  refreshRecommendationsAction,
} from "@/lib/actions";
import { Flash } from "@/components/Flash";
import {
  Badge,
  Card,
  CardTitle,
  EmptyState,
  MiniBar,
  Money,
  PageHeader,
  Pct,
  StatCard,
} from "@/components/ui";

export const metadata = { title: "Ads (PPC)" };
export const dynamic = "force-dynamic";

export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requireSessionUser();
  const adapter = getAdapter();
  const [campaigns, recommendations, clients] = await Promise.all([
    adapter.listCampaigns(),
    adapter.listRecommendations(),
    adapter.listClients(),
  ]);
  const canEdit = can(user.role, "ppc", "update");

  const totals = campaigns.reduce(
    (acc, c) => ({
      spend: acc.spend + c.totals.spend,
      sales: acc.sales + c.totals.sales,
      orders: acc.orders + c.totals.orders,
      clicks: acc.clicks + c.totals.clicks,
      impressions: acc.impressions + c.totals.impressions,
    }),
    { spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 }
  );
  const ppcRecs = recommendations.filter((r) => r.module === "ppc");
  const pending = ppcRecs.filter((r) => ["analysis_ready", "pending_review"].includes(r.status));
  const approved = ppcRecs.filter((r) => r.status === "approved");

  return (
    <div>
      <PageHeader
        title="Ads (PPC)"
        subtitle="Recommendation-first: rules engine phát hiện anomaly → người duyệt → execute với guardrail (spec §5.6). Không tự đổi bid/budget."
        actions={
          canEdit && clients.length > 0 ? (
            <form action={refreshRecommendationsAction} className="flex items-center gap-2">
              <select name="client_id" className="input h-9 w-48 py-1 text-sm">
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button className="btn btn-primary btn-sm">Chạy rules engine</button>
            </form>
          ) : null
        }
      />
      <Flash searchParams={sp} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatCard label="Spend (30 ngày)" value={<Money value={totals.spend} />} />
        <StatCard label="Sales (30 ngày)" value={<Money value={totals.sales} />} />
        <StatCard
          label="Blended ACOS"
          value={<Pct value={totals.sales > 0 ? totals.spend / totals.sales : null} />}
          tone={totals.sales > 0 && totals.spend / totals.sales > 0.35 ? "bad" : "good"}
        />
        <StatCard label="Orders" value={totals.orders} />
        <StatCard label="CTR" value={<Pct value={totals.impressions > 0 ? totals.clicks / totals.impressions : null} />} />
        <StatCard label="CVR" value={<Pct value={totals.clicks > 0 ? totals.orders / totals.clicks : null} />} />
      </div>

      <Card className="mb-6">
        <CardTitle right={<Badge tone="amber">{pending.length} chờ review · {approved.length} chờ execute</Badge>}>
          Recommendation queue
        </CardTitle>
        {pending.length === 0 && approved.length === 0 ? (
          <EmptyState
            title="Không có recommendation nào"
            hint="Nhấn 'Chạy rules engine' để phân tích campaign: hết budget, spend không order, ACOS cao, CPC/CVR anomaly."
          />
        ) : (
          <div className="space-y-3">
            {[...pending, ...approved].map((r) => (
              <div key={r.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge tone={r.status === "approved" ? "blue" : "amber"}>{r.status}</Badge>
                      <Badge tone={r.confidence === "high" ? "green" : "slate"}>confidence {r.confidence}</Badge>
                      <Badge tone={r.impact === "high" ? "red" : r.impact === "medium" ? "amber" : "slate"}>
                        impact {r.impact}
                      </Badge>
                      <span className="text-[11px] text-slate-400">{r.recommendation_type}</span>
                    </div>
                    <h3 className="text-sm font-medium text-slate-900">{r.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">{r.explanation}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                      <span>evidence: {r.evidence_ids.length} records</span>
                      <span>·</span>
                      <span>model {r.model_version}</span>
                      <span>·</span>
                      <span>
                        guardrail: bid {String((r.guardrails as { bidMin?: number }).bidMin ?? "—")}–
                        {String((r.guardrails as { bidMax?: number }).bidMax ?? "—")}
                        {(r.guardrails as { note?: string }).note ? ` · ${(r.guardrails as { note?: string }).note}` : ""}
                      </span>
                    </div>
                  </div>
                  {canEdit ? (
                    <div className="flex shrink-0 gap-2">
                      {r.status !== "approved" ? (
                        <>
                          <form action={decideRecommendationAction}>
                            <input type="hidden" name="id" value={r.id} />
                            <button name="decision" value="approved" className="btn btn-primary btn-sm">Duyệt</button>
                          </form>
                          <form action={decideRecommendationAction}>
                            <input type="hidden" name="id" value={r.id} />
                            <button name="decision" value="rejected" className="btn btn-ghost btn-sm">Từ chối</button>
                          </form>
                        </>
                      ) : (
                        <form action={executeRecommendationAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <button className="btn btn-primary btn-sm">Execute</button>
                        </form>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle right={<Badge>{campaigns.length} campaigns</Badge>}>Campaign performance (30 ngày)</CardTitle>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Campaign</th>
                <th className="text-right">Impr.</th>
                <th className="text-right">Clicks</th>
                <th className="text-right">Spend</th>
                <th className="text-right">Orders</th>
                <th className="text-right">Sales</th>
                <th className="text-right">ACOS</th>
                <th className="text-right">CVR</th>
                <th>Trend spend</th>
                <th className="text-right">Budget</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map(({ campaign, metrics, totals: t }) => {
                const dailyBudgetUtil =
                  metrics.length > 0
                    ? t.spend / Math.max(1, Math.round((Date.parse(metrics[metrics.length - 1].metric_date) - Date.parse(metrics[0].metric_date)) / 86_400_000)) / campaign.daily_budget
                    : 0;
                return (
                  <tr key={campaign.id}>
                    <td>
                      <div className="max-w-[220px]">
                        <div className="truncate text-sm font-medium text-slate-800">{campaign.name}</div>
                        <div className="text-[11px] text-slate-400">
                          {campaign.campaign_type === "sponsored_products" ? "SP" : campaign.campaign_type === "sponsored_brands" ? "SB" : "SD"} ·{" "}
                          {campaign.status}
                          {campaign.last_synced_at ? ` · sync ${new Date(campaign.last_synced_at).toLocaleDateString("vi-VN")}` : ""}
                        </div>
                      </div>
                    </td>
                    <td className="text-right tabular-nums">{t.impressions.toLocaleString()}</td>
                    <td className="text-right tabular-nums">{t.clicks.toLocaleString()}</td>
                    <td className="text-right"><Money value={t.spend} /></td>
                    <td className="text-right tabular-nums">{t.orders}</td>
                    <td className="text-right"><Money value={t.sales} /></td>
                    <td className="text-right">
                      <span className={t.acos && t.acos > 0.35 ? "font-semibold text-rose-600" : ""}>
                        <Pct value={t.acos} />
                      </span>
                    </td>
                    <td className="text-right"><Pct value={t.cvr} /></td>
                    <td><MiniBar values={metrics.map((m) => m.spend)} /></td>
                    <td className="text-right">
                      <Money value={campaign.daily_budget} />
                      {dailyBudgetUtil > 0.9 ? <Badge tone="amber">sắp hết</Badge> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-slate-400">
          Ngưỡng cảnh báo do admin cấu hình trong platform_settings (min clicks, ACOS threshold, budget utilization) —
          mọi recommendation hiển thị date range &amp; data freshness (guardrail §5.6).
        </p>
      </Card>
    </div>
  );
}
