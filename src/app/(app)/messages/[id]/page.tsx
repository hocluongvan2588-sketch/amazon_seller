import { notFound } from "next/navigation";
import { getAdapter } from "@/lib/data/factory";
import { requireSessionUser } from "@/lib/session";
import { canSeeCustomerMessages, can } from "@/lib/permissions";
import { classifyThreadAction, markThreadStatusAction, submitReplyAction } from "@/lib/actions";
import { Flash } from "@/components/Flash";
import { Badge, Card, CardTitle, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireSessionUser();
  if (!canSeeCustomerMessages(user.role)) notFound();

  const adapter = getAdapter();
  const detail = await adapter.getThread(id);
  if (!detail) notFound();
  const { thread, messages } = detail;
  const canEdit = can(user.role, "customer_response", "update");
  const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound");

  return (
    <div>
      <PageHeader
        title={thread.subject ?? "Thread"}
        subtitle={`${thread.customer_reference} · ${thread.status} · priority ${thread.priority} · tin cuối ${new Date(thread.last_message_at).toLocaleString("vi-VN")}`}
        actions={
          canEdit ? (
            <div className="flex gap-2">
              <form action={markThreadStatusAction}>
                <input type="hidden" name="thread_id" value={thread.id} />
                <input type="hidden" name="status" value={thread.status === "closed" ? "open" : "closed"} />
                <button className="btn btn-secondary btn-sm">
                  {thread.status === "closed" ? "Mở lại" : "Đóng thread"}
                </button>
              </form>
              {lastInbound && lastInbound.status === "new" ? (
                <form action={classifyThreadAction}>
                  <input type="hidden" name="thread_id" value={thread.id} />
                  <button className="btn btn-primary btn-sm">Phân loại bằng AI</button>
                </form>
              ) : null}
            </div>
          ) : null
        }
      />
      <Flash searchParams={sp} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle right={<Badge>{messages.length} tin</Badge>}>Thread</CardTitle>
          <div className="space-y-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-xl p-3.5 ${
                  m.direction === "inbound" ? "bg-slate-50" : "bg-brand-50"
                }`}
              >
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <Badge tone={m.direction === "inbound" ? "slate" : "brand"}>
                    {m.direction === "inbound" ? "Khách hàng" : "Chúng ta"}
                  </Badge>
                  {m.intent ? <Badge tone="violet">{m.intent.replace(/_/g, " ")}</Badge> : null}
                  {m.urgency ? (
                    <Badge tone={m.urgency === "urgent" || m.urgency === "high" ? "red" : "slate"}>
                      urgency {m.urgency}
                    </Badge>
                  ) : null}
                  {m.status ? <Badge tone={m.status === "sent" ? "green" : m.status === "pending_approval" ? "amber" : "slate"}>{m.status}</Badge> : null}
                  <span className="ml-auto text-[11px] text-slate-400">
                    {new Date(m.created_at).toLocaleString("vi-VN")}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-slate-700">{m.message_text}</p>
                {m.ai_summary ? (
                  <div className="mt-2 rounded-lg border border-violet-100 bg-violet-50/60 p-2.5">
                    <div className="text-[10px] font-medium uppercase text-violet-500">AI summary</div>
                    <p className="mt-0.5 text-xs text-violet-900">{m.ai_summary}</p>
                  </div>
                ) : null}
                {m.policy_risk_level && m.policy_risk_level !== "none" ? (
                  <div className="mt-2 rounded-lg border border-rose-100 bg-rose-50 p-2.5">
                    <div className="text-[10px] font-medium uppercase text-rose-500">
                      Policy risk: {m.policy_risk_level}
                    </div>
                    <ul className="mt-1 list-inside list-disc text-xs text-rose-700">
                      {(m.policy_risk_notes ?? []).map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Card>

        <div>
          {canEdit && lastInbound ? (
            <Card>
              <CardTitle right={lastInbound.reply_draft ? <Badge tone="amber">draft</Badge> : null}>
                Reply draft {lastInbound.reply_draft ? "(AI đã soạn — chỉnh sửa rồi gửi duyệt)" : ""}
              </CardTitle>
              <form action={submitReplyAction} className="space-y-2">
                <input type="hidden" name="thread_id" value={thread.id} />
                <input type="hidden" name="message_id" value={lastInbound.id} />
                <textarea
                  name="reply"
                  rows={9}
                  className="input"
                  defaultValue={lastInbound.reply_draft ?? ""}
                  placeholder={lastInbound.reply_draft ?? "Chưa có draft — bấm 'Phân loại bằng AI' để sinh draft."}
                />
                <button className="btn btn-primary" disabled={!lastInbound.reply_draft}>
                  Gửi reviewer duyệt
                </button>
                <p className="text-[11px] text-slate-500">
                  MVP không tự gửi: sau khi reviewer duyệt (Today → Approval queue), CS copy vào Seller Central để gửi.
                  Không yêu cầu khách sửa/xóa review, không hứa refund ngoài policy, không đưa tin nhắn ra ngoài Amazon.
                </p>
              </form>
            </Card>
          ) : (
            <EmptyState title="Chờ customer service xử lý" />
          )}

          <Card className="mt-4">
            <CardTitle>Guardrail nội dung (spec §5.8)</CardTitle>
            <ul className="space-y-1.5 text-xs text-slate-600">
              <li>✗ Yêu cầu khách sửa/xóa review</li>
              <li>✗ Hứa refund ngoài policy Amazon</li>
              <li>✗ Chuyển liên lạc ra ngoài Amazon (email/phone/Zalo…)</li>
              <li>✗ Tư vấn y tế/pháp lý chắc chắn</li>
              <li>✗ Tự gửi khi chưa có approval</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
