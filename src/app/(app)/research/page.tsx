import Link from "next/link";
import { getAdapter } from "@/lib/data/factory";
import { requireSessionUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { createOpportunityAction } from "@/lib/actions";
import { Flash } from "@/components/Flash";
import { Badge, Card, CardTitle, EmptyState, PageHeader } from "@/components/ui";
import type { OpportunityStage } from "@/lib/types";

export const metadata = { title: "Product Research" };
export const dynamic = "force-dynamic";

const STAGE_LABELS: Record<OpportunityStage, string> = {
  idea: "Idea",
  screening: "Screening",
  researching: "Researching",
  supplier_validation: "Supplier validation",
  economics_review: "Economics review",
  risk_review: "Risk review",
  pending_decision: "Chờ quyết định",
  go: "GO",
  go_with_conditions: "GO (điều kiện)",
  need_more_evidence: "Cần thêm dữ liệu",
  no_go: "NO-GO",
  archived: "Archived",
};

const STAGE_TONES: Partial<Record<OpportunityStage, "green" | "amber" | "red" | "brand" | "slate">> = {
  go: "green",
  go_with_conditions: "green",
  need_more_evidence: "amber",
  no_go: "red",
  pending_decision: "brand",
};

export default async function ResearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await requireSessionUser();
  const adapter = getAdapter();
  const [opportunities, clients] = await Promise.all([
    adapter.listOpportunities(),
    adapter.listClients(),
  ]);
  const canCreate = can(user.role, "product_research", "create");

  const pipeline: OpportunityStage[] = [
    "idea", "screening", "researching", "supplier_validation",
    "economics_review", "risk_review", "pending_decision",
  ];

  return (
    <div>
      <PageHeader
        title="Product Research"
        subtitle="Research inbox — idea → evidence → economics → Go/No-Go (spec §5.2). Mọi kết luận đều phân biệt observed / derived / AI / assumption."
      />
      <Flash searchParams={params} />

      {canCreate ? (
        <Card className="mb-6">
          <CardTitle>Tạo product idea mới</CardTitle>
          <form action={createOpportunityAction} className="grid gap-3 sm:grid-cols-5">
            <div className="sm:col-span-2">
              <label className="label">Tên ý tưởng</label>
              <input name="name" required placeholder="VD: Bình giữ nhiệt 500ml vỏ thép" className="input" />
            </div>
            <div>
              <label className="label">Client</label>
              <select name="client_account_id" className="input" required>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Marketplace</label>
              <select name="marketplace" className="input">
                <option value="US">US</option>
                <option value="CA">CA</option>
                <option value="UK">UK</option>
                <option value="DE">DE</option>
                <option value="JP">JP</option>
              </select>
            </div>
            <div>
              <label className="label">Giá mục tiêu ($)</label>
              <input name="target_price" type="number" step="0.01" placeholder="26.99" className="input" />
            </div>
            <div className="sm:col-span-5">
              <button className="btn btn-primary">Tạo opportunity</button>
              <span className="ml-3 text-xs text-slate-400">
                Mục tiêu: tạo idea dưới 3 phút (acceptance criteria §5.2)
              </span>
            </div>
          </form>
        </Card>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {pipeline.map((stage) => {
          const items = opportunities.filter((o) => o.stage === stage);
          return (
            <div key={stage} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                {STAGE_LABELS[stage]}
              </div>
              <div className="text-xl font-semibold text-slate-800">{items.length}</div>
            </div>
          );
        })}
      </div>

      {opportunities.length === 0 ? (
        <EmptyState title="Chưa có opportunity nào" hint="Tạo idea đầu tiên để bắt đầu quy trình research." />
      ) : (
        <div className="grid gap-3">
          {opportunities.map((o) => (
            <Link
              key={o.id}
              href={`/research/${o.id}`}
              className="card group flex items-center gap-4 p-4 transition-colors hover:border-brand-300 hover:bg-brand-50/30"
            >
              <div
                className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl ${
                  o.opportunity_score === null
                    ? "bg-slate-100 text-slate-400"
                    : (o.opportunity_score ?? 0) >= 65
                      ? "bg-emerald-50 text-emerald-700"
                      : (o.opportunity_score ?? 0) >= 45
                        ? "bg-amber-50 text-amber-700"
                        : "bg-rose-50 text-rose-700"
                }`}
              >
                <span className="text-sm font-bold leading-none">
                  {o.opportunity_score === null ? "—" : Math.round(o.opportunity_score)}
                </span>
                <span className="mt-0.5 text-[9px] uppercase opacity-70">score</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-sm font-medium text-slate-900 group-hover:text-brand-700">
                    {o.name}
                  </h3>
                  <Badge tone={STAGE_TONES[o.stage] ?? "slate"}>{STAGE_LABELS[o.stage]}</Badge>
                  {o.decision ? <Badge tone={o.decision.startsWith("go") ? "green" : "red"}>{o.decision}</Badge> : null}
                </div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {o.client_name} · {o.marketplace} · {o.category ?? "chưa phân loại"} · evidence{" "}
                  {Math.round(o.evidence_completeness)}%
                  {o.decision_reason ? ` · ${o.decision_reason.slice(0, 60)}…` : ""}
                </div>
              </div>
              <div className="hidden shrink-0 text-right sm:block">
                <div className="text-[11px] text-slate-400">cập nhật</div>
                <div className="text-xs text-slate-600">
                  {new Date(o.updated_at).toLocaleDateString("vi-VN")}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
