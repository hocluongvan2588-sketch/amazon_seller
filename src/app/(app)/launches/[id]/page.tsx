import { notFound } from "next/navigation";
import Link from "next/link";
import { getAdapter } from "@/lib/data/factory";
import { requireSessionUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { toggleChecklistAction, updateLaunchStageAction } from "@/lib/actions";
import { Flash } from "@/components/Flash";
import { Badge, Card, CardTitle, EmptyState, KV, PageHeader } from "@/components/ui";
import type { LaunchStage } from "@/lib/types";

export const dynamic = "force-dynamic";

const STAGES: LaunchStage[] = [
  "created", "onboarding", "listing_preparation", "content_review",
  "inventory_preparation", "ppc_preparation", "ready_to_launch",
  "launching", "stabilizing", "scaling", "paused", "completed",
];

export default async function LaunchDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireSessionUser();
  const adapter = getAdapter();
  const detail = await adapter.getLaunch(id);
  if (!detail) notFound();
  const { launch, product, asin, skus, tasks, opportunity } = detail;
  const canEdit = can(user.role, "listing", "update");

  return (
    <div>
      <PageHeader
        title={product?.name ?? "Launch project"}
        subtitle={`Stage: ${launch.stage} · health: ${launch.health_status} · target ${launch.target_launch_date ?? "—"}`}
        actions={
          canEdit ? (
            <form action={updateLaunchStageAction} className="flex items-center gap-2">
              <input type="hidden" name="id" value={launch.id} />
              <select name="stage" defaultValue={launch.stage} className="input h-9 w-52 py-1 text-sm">
                {STAGES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <button className="btn btn-secondary btn-sm">Cập nhật stage</button>
            </form>
          ) : null
        }
      />
      <Flash searchParams={sp} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle right={<Badge tone="brand">{launch.checklist.filter((c) => c.done).length}/{launch.checklist.length}</Badge>}>
            Checklist (theo bộ phận)
          </CardTitle>
          <div className="space-y-2">
            {launch.checklist.map((item) => (
              <form key={item.key} action={toggleChecklistAction} className="flex items-center gap-3 rounded-lg border border-slate-100 p-2.5">
                <input type="hidden" name="launch_id" value={launch.id} />
                <input type="hidden" name="item_key" value={item.key} />
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-md border text-xs ${
                    item.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white text-transparent"
                  }`}
                >
                  ✓
                </span>
                <span className={`flex-1 text-sm ${item.done ? "text-slate-400 line-through" : "text-slate-800"}`}>
                  {item.label}
                </span>
                <Badge tone="slate">{item.department}</Badge>
                {canEdit ? <button className="btn btn-ghost btn-sm">{item.done ? "Bỏ tick" : "Tick"}</button> : null}
              </form>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardTitle>Master data</CardTitle>
            <KV label="Product">{product?.name ?? "—"} ({product?.status ?? "—"})</KV>
            <KV label="ASIN">{asin?.asin ?? "chưa có"} ({asin?.status ?? "—"})</KV>
            <KV label="SKUs">
              {skus.length > 0 ? skus.map((s) => s.sku).join(", ") : "chưa có"}
            </KV>
            <KV label="Owner">{launch.owner_user_id}</KV>
            <KV label="Ngày launch thực tế">{launch.actual_launch_date ?? "—"}</KV>
            {opportunity ? (
              <p className="mt-3 text-xs text-slate-400">
                Nguồn gốc:{" "}
                <Link href={`/research/${opportunity.id}`} className="text-brand-600 hover:underline">
                  {opportunity.name} (opportunity)
                </Link>{" "}
                — dữ liệu research được giữ nguyên khi chuyển (spec §5.2).
              </p>
            ) : null}
          </Card>

          <Card>
            <CardTitle right={<Link href="/tasks" className="btn btn-ghost btn-sm">Tasks</Link>}>
              Tasks liên quan client
            </CardTitle>
            {tasks.length === 0 ? (
              <EmptyState title="Chưa có task" />
            ) : (
              <div className="space-y-1.5">
                {tasks.slice(0, 6).map((t) => (
                  <div key={t.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-2.5 py-2">
                    <Badge tone={t.status === "completed" ? "green" : t.status === "blocked" ? "red" : "slate"}>
                      {t.status}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{t.title}</span>
                    {t.due_at ? (
                      <span className={`text-[11px] ${Date.parse(t.due_at) < Date.now() && t.status !== "completed" ? "text-rose-500" : "text-slate-400"}`}>
                        {new Date(t.due_at).toLocaleDateString("vi-VN")}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
