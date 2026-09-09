import { getAdapter } from "@/lib/data/factory";
import { requireSessionUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { DEPARTMENT_LABELS } from "@/lib/permissions";
import { addCommentAction, createTaskAction, updateTaskStatusAction } from "@/lib/actions";
import { Flash } from "@/components/Flash";
import { Badge, Card, CardTitle, EmptyState, PageHeader } from "@/components/ui";
import type { TaskStatus } from "@/lib/types";

export const metadata = { title: "Tasks" };
export const dynamic = "force-dynamic";

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "backlog", label: "Backlog" },
  { status: "assigned", label: "Assigned" },
  { status: "in_progress", label: "In progress" },
  { status: "blocked", label: "Blocked" },
  { status: "in_review", label: "In review" },
  { status: "completed", label: "Completed" },
];

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requireSessionUser();
  const adapter = getAdapter();
  const [tasks, clients, profiles] = await Promise.all([
    adapter.listTasks(),
    adapter.listClients(),
    adapter.listProfiles(),
  ]);
  const canCreate = can(user.role, "tasks", "create");
  const canUpdate = can(user.role, "tasks", "update");

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle="Công việc liên bộ phận: mỗi task có owner, department, priority, due date, comments và activity history."
      />
      <Flash searchParams={sp} />

      {canCreate ? (
        <Card className="mb-6">
          <CardTitle>Tạo task</CardTitle>
          <form action={createTaskAction} className="grid gap-2 md:grid-cols-6">
            <input name="title" required placeholder="Tiêu đề task" className="input md:col-span-2" />
            <select name="client_account_id" className="input" required>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select name="department" className="input">
              {Object.entries(DEPARTMENT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select name="assignee_id" className="input">
              <option value="">— chưa gán —</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
            <select name="priority" className="input" defaultValue="medium">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <input name="due_at" type="date" className="input md:col-span-2" />
            <input name="description" placeholder="Mô tả" className="input md:col-span-3" />
            <div className="md:col-span-6">
              <button className="btn btn-primary">Tạo task</button>
            </div>
          </form>
        </Card>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {COLUMNS.map(({ status, label }) => {
          const items = tasks.filter((t) => t.status === status);
          return (
            <div key={status} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-xs font-semibold text-slate-700">{label}</span>
                <span className="text-xs text-slate-400">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((t) => {
                  const overdue =
                    t.due_at && Date.parse(t.due_at) < Date.now() && !["completed", "cancelled"].includes(t.status);
                  return (
                    <div
                      key={t.id}
                      className={`rounded-lg border p-2.5 ${overdue ? "border-rose-200 bg-rose-50/40" : "border-slate-100"}`}
                    >
                      <div className="mb-1 flex items-center gap-1">
                        {t.priority === "urgent" ? <Badge tone="red">urgent</Badge> : null}
                        {overdue ? <Badge tone="red">quá hạn</Badge> : null}
                      </div>
                      <div className="text-xs font-medium leading-snug text-slate-800">{t.title}</div>
                      <div className="mt-1 text-[10px] text-slate-400">
                        {profiles.find((p) => p.id === t.assignee_id)?.full_name ?? "chưa gán"}
                        {t.due_at ? ` · ${new Date(t.due_at).toLocaleDateString("vi-VN")}` : ""}
                      </div>
                      {t.department ? (
                        <div className="mt-1">
                          <Badge tone="slate">{DEPARTMENT_LABELS[t.department]}</Badge>
                        </div>
                      ) : null}

                      {canUpdate && status !== "completed" ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-[10px] text-brand-600">chuyển trạng thái</summary>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {COLUMNS.filter((c) => c.status !== status).map((c) => (
                              <form key={c.status} action={updateTaskStatusAction}>
                                <input type="hidden" name="id" value={t.id} />
                                <input type="hidden" name="status" value={c.status} />
                                <button className="btn btn-ghost btn-sm !px-1.5 !py-0.5 !text-[10px]">{c.label}</button>
                              </form>
                            ))}
                          </div>
                        </details>
                      ) : null}

                      {t.comments.length > 0 || canUpdate ? (
                        <details className="mt-1.5">
                          <summary className="cursor-pointer text-[10px] text-slate-400">
                            {t.comments.length} comment
                          </summary>
                          <div className="mt-1.5 space-y-1.5">
                            {t.comments.map((c) => (
                              <div key={c.id} className="rounded bg-slate-50 p-1.5 text-[10px] text-slate-600">
                                <span className="font-medium">
                                  {profiles.find((p) => p.id === c.author_id)?.full_name ?? c.author_id}:
                                </span>{" "}
                                {c.body}
                              </div>
                            ))}
                            {canUpdate ? (
                              <form action={addCommentAction} className="flex gap-1">
                                <input type="hidden" name="task_id" value={t.id} />
                                <input name="body" placeholder="comment…" className="input !px-2 !py-1 !text-[10px]" />
                                <button className="btn btn-ghost btn-sm !px-1.5 !py-0.5 !text-[10px]">Gửi</button>
                              </form>
                            ) : null}
                          </div>
                        </details>
                      ) : null}
                    </div>
                  );
                })}
                {items.length === 0 ? <div className="text-[11px] text-slate-300">trống</div> : null}
              </div>
            </div>
          );
        })}
      </div>

      {tasks.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="Chưa có task nào" />
        </div>
      ) : null}
    </div>
  );
}
