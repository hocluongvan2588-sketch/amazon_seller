import Link from "next/link";
import { getAdapter } from "@/lib/data/factory";
import { requireSessionUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { toggleChecklistAction, updateLaunchStageAction } from "@/lib/actions";
import { Flash } from "@/components/Flash";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import type { LaunchStage } from "@/lib/types";

export const metadata = { title: "Launches" };
export const dynamic = "force-dynamic";

const STAGES: LaunchStage[] = [
  "created", "onboarding", "listing_preparation", "content_review",
  "inventory_preparation", "ppc_preparation", "ready_to_launch",
  "launching", "stabilizing", "scaling", "paused", "completed",
];

const STAGE_LABELS: Record<LaunchStage, string> = {
  created: "Created",
  onboarding: "Onboarding",
  listing_preparation: "Listing prep",
  content_review: "Content review",
  inventory_preparation: "Inventory prep",
  ppc_preparation: "PPC prep",
  ready_to_launch: "Ready to launch",
  launching: "Launching",
  stabilizing: "Stabilizing",
  scaling: "Scaling",
  paused: "Paused",
  completed: "Completed",
};

export default async function LaunchesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await requireSessionUser();
  const adapter = getAdapter();
  const launches = await adapter.listLaunches();
  const canEdit = can(user.role, "listing", "update");

  const columns = STAGES.map((stage) => ({
    stage,
    items: launches.filter((l) => l.stage === stage),
  }));

  return (
    <div>
      <PageHeader
        title="Launches"
        subtitle="Kanban theo launch stage (spec §4.2, §11) — mỗi project có checklist, owner, due date và blockers."
      />
      <Flash searchParams={params} />

      {launches.length === 0 ? (
        <EmptyState title="Chưa có launch project" hint="Chuyển một product opportunity GO thành launch project từ trang Research." />
      ) : (
        <div className="mb-6 grid gap-3 lg:grid-cols-2">
          {launches.map((l) => {
            const done = l.checklist.filter((c) => c.done).length;
            return (
              <Link
                key={l.id}
                href={`/launches/${l.id}`}
                className="card group p-4 transition-colors hover:border-brand-300 hover:bg-brand-50/30"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-medium text-slate-900 group-hover:text-brand-700">{l.product_name}</h3>
                    <div className="text-xs text-slate-400">
                      {l.client_name} · target {l.target_launch_date ?? "—"}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Badge tone={l.health_status === "on_track" ? "green" : l.health_status === "at_risk" ? "amber" : "red"}>
                      {l.health_status.replace("_", " ")}
                    </Badge>
                  </div>
                </div>
                <div className="mb-2 flex items-center gap-2">
                  <Badge tone="brand">{STAGE_LABELS[l.stage]}</Badge>
                  <span className="text-[11px] text-slate-400">
                    checklist {done}/{l.checklist.length}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${done === l.checklist.length ? "bg-emerald-500" : "bg-brand-500"}`}
                    style={{ width: `${l.checklist.length ? (done / l.checklist.length) * 100 : 0}%` }}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
        {columns.map(({ stage, items }) => (
          <div key={stage} className="rounded-xl border border-slate-200 bg-white p-2.5">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                {STAGE_LABELS[stage]}
              </span>
              <span className="text-xs font-semibold text-slate-700">{items.length}</span>
            </div>
            {items.map((l) => (
              <div key={l.id} className="mb-1 truncate rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
                {l.product_name}
              </div>
            ))}
          </div>
        ))}
      </div>
      {canEdit ? (
        <p className="mt-3 text-xs text-slate-400">
          Thay đổi stage trong trang chi tiết từng launch — mọi thay đổi được ghi audit.
        </p>
      ) : null}
      <div className="mt-6">
        <Card>
          <h2 className="section-title mb-3">Checklist chuẩn cho mọi launch</h2>
          <div className="grid gap-2 text-xs text-slate-500 md:grid-cols-2">
            <div>• Chốt supplier &amp; PO (sourcing)</div>
            <div>• Listing draft hoàn chỉnh (content)</div>
            <div>• Cost profile được duyệt (finance)</div>
            <div>• Shipment đầu tiên lên đường (inventory)</div>
            <div>• Campaign launch sẵn sàng (PPC)</div>
            <div>• Báo cáo tuần đầu gửi client (management)</div>
          </div>
        </Card>
      </div>
    </div>
  );
}
