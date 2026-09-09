import { getAdapter } from "@/lib/data/factory";
import { requireSessionUser } from "@/lib/session";
import { can, canSeeFinanceData } from "@/lib/permissions";
import { Flash } from "@/components/Flash";
import { Badge, Card, CardTitle, EmptyState, PageHeader, StatCard } from "@/components/ui";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await requireSessionUser();
  const adapter = getAdapter();
  const [kpis, audit, aiRuns, clients] = await Promise.all([
    adapter.getKpis(),
    adapter.listAuditEvents(undefined, 30),
    adapter.listAiRuns(undefined, 15),
    adapter.listClients(),
  ]);
  const canAudit = can(user.role, "audit_log", "read");

  return (
    <div>
      <PageHeader
        title="Reports & KPI"
        subtitle="KPI vận hành nội bộ + KPI khách hàng (spec §13). Số liệu do metrics engine tính, không phải LLM."
      />
      <Flash searchParams={params} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Task completion rate"
          value={`${(kpis.taskCompletionRate * 100).toFixed(0)}%`}
          tone={kpis.taskCompletionRate > 0.7 ? "good" : "warn"}
          hint={`${kpis.tasksTotal} tasks · ${kpis.tasksOverdue} quá hạn`}
        />
        <StatCard
          label="Approval turnaround"
          value={kpis.avgApprovalTurnaroundHours !== null ? `${kpis.avgApprovalTurnaroundHours.toFixed(1)}h` : "—"}
          hint={`${kpis.approvalsPending} đang chờ`}
        />
        <StatCard
          label="Recommendation acceptance"
          value={kpis.recommendationAcceptanceRate !== null ? `${(kpis.recommendationAcceptanceRate * 100).toFixed(0)}%` : "—"}
          tone={kpis.recommendationAcceptanceRate !== null && kpis.recommendationAcceptanceRate > 0.5 ? "good" : "warn"}
        />
        <StatCard
          label="Data freshness issues"
          value={kpis.dataFreshnessIssues}
          tone={kpis.dataFreshnessIssues > 0 ? "warn" : "good"}
        />
      </div>

      {canSeeFinanceData(user.role) ? (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Avg contribution margin"
            value={kpis.avgContributionMarginPct !== null ? `${kpis.avgContributionMarginPct.toFixed(1)}%` : "—"}
            tone={(kpis.avgContributionMarginPct ?? 0) > 20 ? "good" : "warn"}
          />
          <StatCard
            label="Avg break-even ACOS"
            value={kpis.avgBreakEvenAcosPct !== null ? `${kpis.avgBreakEvenAcosPct.toFixed(1)}%` : "—"}
          />
          <StatCard
            label="Blended ACOS"
            value={kpis.blendedAcos !== null ? `${(kpis.blendedAcos * 100).toFixed(1)}%` : "—"}
            tone={kpis.blendedAcos !== null && kpis.blendedAcos > 0.35 ? "bad" : "good"}
          />
          <StatCard label="Stockout risk SKUs" value={kpis.stockoutRiskCount} tone={kpis.stockoutRiskCount > 0 ? "bad" : "good"} />
        </div>
      ) : (
        <Card className="mb-6">
          <EmptyState title="KPI finance bị ẩn theo quyền" hint="Contribution margin, break-even ACOS… chỉ dành cho finance/admin/owner/reviewer (spec §3.4)." />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {canAudit ? (
          <Card>
            <CardTitle right={<Badge>{audit.length}</Badge>}>Audit log (30 events gần nhất)</CardTitle>
            {audit.length === 0 ? (
              <EmptyState title="Chưa có audit event" />
            ) : (
              <div className="max-h-[420px] space-y-1.5 overflow-y-auto">
                {audit.map((a) => (
                  <details key={a.id} className="rounded-lg border border-slate-100 p-2.5">
                    <summary className="cursor-pointer">
                      <span className="font-mono text-[11px] text-brand-700">{a.action}</span>
                      <span className="ml-2 text-[11px] text-slate-400">
                        {a.actor_user_id ?? "system"} · {new Date(a.created_at).toLocaleString("vi-VN")} ·{" "}
                        {clients.find((c) => c.id === a.client_account_id)?.name ?? ""}
                      </span>
                    </summary>
                    <div className="mt-2 grid gap-1 text-[10px]">
                      {a.before_json ? (
                        <pre className="overflow-x-auto rounded bg-slate-50 p-2 text-slate-500">
                          before: {JSON.stringify(a.before_json)}
                        </pre>
                      ) : null}
                      {a.after_json ? (
                        <pre className="overflow-x-auto rounded bg-slate-50 p-2 text-slate-500">
                          after: {JSON.stringify(a.after_json)}
                        </pre>
                      ) : null}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </Card>
        ) : null}

        <Card>
          <CardTitle right={<Badge>{aiRuns.length}</Badge>}>AI runs (gần nhất)</CardTitle>
          {aiRuns.length === 0 ? (
            <EmptyState title="Chưa có AI run" />
          ) : (
            <div className="max-h-[420px] space-y-1.5 overflow-y-auto">
              {aiRuns.map((r) => (
                <div key={r.id} className="rounded-lg border border-slate-100 p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="violet">{r.use_case}</Badge>
                    <Badge tone={r.status === "succeeded" ? "green" : r.status === "insufficient_evidence" ? "amber" : "red"}>
                      {r.status}
                    </Badge>
                    <span className="text-[11px] text-slate-400">
                      {r.model_name} · prompt {r.prompt_version} · {new Date(r.created_at).toLocaleString("vi-VN")}
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] text-slate-400">
                    inputs: {r.input_record_ids.slice(0, 5).join(", ")}
                    {r.input_record_ids.length > 5 ? ` +${r.input_record_ids.length - 5}` : ""}
                    {r.reviewed_by ? ` · reviewed bởi ${r.reviewed_by}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-slate-400">
            Mọi AI output lưu prompt version, model, input record IDs, output JSON, reviewer và timestamp (spec §5.3).
          </p>
        </Card>
      </div>
    </div>
  );
}
