import Link from "next/link";
import { getAdapter } from "@/lib/data/factory";
import { requireSessionUser } from "@/lib/session";
import { can, canApprove, ROLE_LABELS } from "@/lib/permissions";
import {
  createReorderAction,
  decideApprovalAction,
  markCardReadAction,
  updateTaskStatusAction,
} from "@/lib/actions";
import { Flash } from "@/components/Flash";
import {
  Badge,
  Card,
  CardTitle,
  EmptyState,
  PageHeader,
  SeverityBadge,
  StatCard,
  Avatar,
} from "@/components/ui";
import type { TodayCard } from "@/lib/types";

export const metadata = { title: "Today" };
export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<TodayCard["category"], string> = {
  overdue_task: "Task quá hạn",
  pending_approval: "Chờ duyệt",
  product_risk: "Rủi ro sản phẩm",
  listing_review: "Listing review",
  ppc_anomaly: "PPC anomaly",
  stockout_risk: "Stockout risk",
  customer_message: "Tin nhắn khách",
  data_freshness: "Data freshness",
  opportunity: "Cơ hội",
};

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await requireSessionUser();
  const adapter = getAdapter();

  const [cards, approvals, clients, kpis] = await Promise.all([
    adapter.getTodayCards(user),
    adapter.listApprovals(undefined, "pending"),
    adapter.listClients(),
    adapter.getKpis(),
  ]);

  const canDecide = canApprove(user.role, "approvals") || user.role === "admin" || user.role === "owner";

  const grouped = {
    critical: cards.filter((c) => c.severity === "critical"),
    high: cards.filter((c) => c.severity === "high"),
    medium: cards.filter((c) => c.severity === "medium"),
    low: cards.filter((c) => c.severity === "low"),
  };

  // Quick actions theo quyền create của từng role (ma trận §3.3)
  const quickActions = [
    can(user.role, "product_research", "create") && { href: "/research#new-idea", label: "+ Product idea" },
    can(user.role, "client_profile", "create") && { href: "/clients#new-client", label: "+ Client" },
    can(user.role, "tasks", "create") && { href: "/tasks#new-task", label: "+ Task" },
    can(user.role, "ppc", "update") && { href: "/ads", label: "Chạy PPC rules" },
  ].filter((x): x is { href: string; label: string } => x !== false);

  return (
    <div>
      <PageHeader
        title={`Chào ${user.full_name.split(" ").slice(-1)[0]} — Today`}
        subtitle={
          <>
            {ROLE_LABELS[user.role]} · Ưu tiên theo Impact × Urgency × Confidence — điểm số thô không hiển thị,
            chỉ nhãn mức độ (spec §5.1).
          </>
        }
      />
      <Flash searchParams={params} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Việc cần xử lý" value={cards.length} hint="Trong phạm vi client được cấp" />
        <StatCard label="Chờ duyệt" value={kpis.approvalsPending} tone={kpis.approvalsPending > 3 ? "warn" : "default"} />
        <StatCard label="Task quá hạn" value={kpis.tasksOverdue} tone={kpis.tasksOverdue > 0 ? "bad" : "good"} />
        <StatCard label="Stockout risk" value={kpis.stockoutRiskCount} tone={kpis.stockoutRiskCount > 0 ? "bad" : "good"} />
        <StatCard
          label="Data freshness issues"
          value={kpis.dataFreshnessIssues}
          tone={kpis.dataFreshnessIssues > 0 ? "warn" : "good"}
        />
      </div>

      {quickActions.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Hành động nhanh:</span>
          {quickActions.map((a) => (
            <Link key={a.href} href={a.href} className="btn btn-secondary btn-sm">
              {a.label}
            </Link>
          ))}
        </div>
      ) : null}

      {/* Approval queue đặt lên đầu — nơi owner/reviewer hành động nhiều nhất */}
      <div id="approvals" className="mb-6 scroll-mt-6">
        <Card>
          <CardTitle right={<Badge tone="brand">{approvals.length} pending</Badge>}>
            Approval queue {canDecide ? "— bạn có thể duyệt" : "— chờ reviewer quyết"}
          </CardTitle>
          {approvals.length === 0 ? (
            <EmptyState title="Không có approval nào đang chờ" />
          ) : (
            <div className="space-y-3">
              {approvals.map((a) => (
                <div key={a.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge tone="violet">{a.request_type.replace(/_/g, " ")}</Badge>
                        <span className="text-xs text-slate-400">
                          {clients.find((c) => c.id === a.client_account_id)?.name} · hết hạn{" "}
                          {a.expires_at ? new Date(a.expires_at).toLocaleDateString("vi-VN") : "—"}
                        </span>
                      </div>
                      <h3 className="text-sm font-medium text-slate-900">{a.title}</h3>
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
                          Xem payload snapshot
                        </summary>
                        <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600">
                          {JSON.stringify(a.payload_snapshot, null, 2)}
                        </pre>
                      </details>
                    </div>
                    {canDecide ? (
                      <form action={decideApprovalAction} className="flex w-full max-w-md items-start gap-2">
                        <input type="hidden" name="id" value={a.id} />
                        <input
                          name="reason"
                          placeholder="Lý do (bắt buộc lưu vào audit)"
                          className="input flex-1"
                          required
                        />
                        <button name="decision" value="approved" className="btn btn-primary btn-sm whitespace-nowrap">
                          Duyệt
                        </button>
                        <button name="decision" value="rejected" className="btn btn-danger btn-sm whitespace-nowrap">
                          Từ chối
                        </button>
                      </form>
                    ) : (
                      <Badge tone="slate">Chờ reviewer quyết</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {(["critical", "high", "medium", "low"] as const).map((sev) =>
        grouped[sev].length === 0 ? null : (
          <div key={sev} className="mb-6">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <SeverityBadge severity={sev} />
              <span className="text-slate-400">{grouped[sev].length} việc</span>
            </h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {grouped[sev].map((card) => (
                <Card key={card.id} className={card.read ? "opacity-60" : ""}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-1 flex items-center gap-2">
                        <Badge tone="slate">{CATEGORY_LABELS[card.category]}</Badge>
                        {card.due_at ? (
                          <span className="text-xs text-slate-400">
                            due {new Date(card.due_at).toLocaleDateString("vi-VN")}
                          </span>
                        ) : null}
                      </div>
                      <h3 className="text-sm font-medium leading-snug text-slate-900">{card.title}</h3>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">{card.explanation}</p>
                    </div>
                    {card.owner_user_id ? <Avatar name={card.owner_user_id} size={28} /> : null}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Link href={card.action_href} className="btn btn-primary btn-sm">
                      {card.action_label}
                    </Link>
                    {card.evidence_href ? (
                      <Link href={card.evidence_href} className="btn btn-ghost btn-sm">
                        Evidence
                      </Link>
                    ) : null}

                    {/* --- Nút hành động ngay trên card (theo quyền role) --- */}
                    {card.category === "pending_approval" && card.entity_id && canDecide ? (
                      <form action={decideApprovalAction} className="flex items-center gap-1">
                        <input type="hidden" name="id" value={card.entity_id} />
                        <input
                          name="reason"
                          placeholder="Lý do…"
                          required
                          className="input h-8 w-36 px-2 py-0 text-xs"
                        />
                        <button name="decision" value="approved" className="btn btn-primary btn-sm">
                          Duyệt
                        </button>
                        <button name="decision" value="rejected" className="btn btn-danger btn-sm">
                          Từ chối
                        </button>
                      </form>
                    ) : null}
                    {card.category === "overdue_task" && card.entity_id && can(user.role, "tasks", "update") ? (
                      <form action={updateTaskStatusAction}>
                        <input type="hidden" name="id" value={card.entity_id} />
                        <input type="hidden" name="status" value="completed" />
                        <button className="btn btn-secondary btn-sm">✓ Hoàn thành</button>
                      </form>
                    ) : null}
                    {card.category === "stockout_risk" && card.entity_id && can(user.role, "inventory_logistics", "update") ? (
                      <form action={createReorderAction}>
                        <input type="hidden" name="sku_id" value={card.entity_id} />
                        <button className="btn btn-secondary btn-sm">Tạo reorder draft</button>
                      </form>
                    ) : null}
                    {card.category === "customer_message" && card.entity_id && can(user.role, "customer_response", "update") ? (
                      <Link href={`/messages/${card.entity_id}`} className="btn btn-secondary btn-sm">
                        Phản hồi
                      </Link>
                    ) : null}

                    <span className="ml-auto text-[11px] text-slate-300">
                      {clients.find((c) => c.id === card.client_account_id)?.name ?? ""}
                    </span>
                    {!card.read ? (
                      <form action={markCardReadAction}>
                        <input type="hidden" name="card_id" value={card.id} />
                        <button className="btn btn-ghost btn-sm" title="Đánh dấu đã đọc">
                          ✓
                        </button>
                      </form>
                    ) : null}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )
      )}

      {cards.length === 0 ? (
        <EmptyState
          title="Không có việc gì cần xử lý ngay"
          hint="Khi có task quá hạn, approval chờ duyệt, rủi ro stockout… chúng sẽ xuất hiện ở đây theo mức ưu tiên."
        />
      ) : null}
    </div>
  );
}
