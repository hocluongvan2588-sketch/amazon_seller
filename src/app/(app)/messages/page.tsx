import Link from "next/link";
import { getAdapter } from "@/lib/data/factory";
import { requireSessionUser } from "@/lib/session";
import { canSeeCustomerMessages } from "@/lib/permissions";
import { Flash } from "@/components/Flash";
import { Badge, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Messages" };
export const dynamic = "force-dynamic";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await requireSessionUser();
  const adapter = getAdapter();

  if (!canSeeCustomerMessages(user.role)) {
    return (
      <div>
        <PageHeader title="Messages" />
        <EmptyState
          title="Không có quyền truy cập tin nhắn khách hàng"
          hint="PII/customer message chỉ dành cho customer_service, account_manager, admin, owner và reviewer (spec §3.4)."
        />
      </div>
    );
  }

  const [threads, clients] = await Promise.all([adapter.listThreads(), adapter.listClients()]);

  return (
    <div>
      <PageHeader
        title="Customer Messages"
        subtitle="Phân loại intent → reply draft → approval TRƯỚC KHI gửi (spec §5.8). AI không bao giờ tự gửi."
      />
      <Flash searchParams={params} />

      {threads.length === 0 ? (
        <EmptyState title="Không có thread nào" />
      ) : (
        <div className="grid gap-3">
          {threads.map((t) => (
            <Link
              key={t.id}
              href={`/messages/${t.id}`}
              className="card group flex items-center gap-4 p-4 transition-colors hover:border-brand-300 hover:bg-brand-50/30"
            >
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium text-slate-900 group-hover:text-brand-700">
                    {t.subject ?? "(không có tiêu đề)"}
                  </h3>
                  <Badge tone={t.priority === "urgent" ? "red" : t.priority === "high" ? "amber" : "slate"}>
                    {t.priority}
                  </Badge>
                  <Badge tone={t.status === "open" ? "blue" : t.status === "closed" ? "slate" : "amber"}>
                    {t.status}
                  </Badge>
                </div>
                <div className="text-xs text-slate-400">
                  {t.customer_reference} · {clients.find((c) => c.id === t.client_account_id)?.name} · {t.marketplace} ·
                  tin cuối {new Date(t.last_message_at).toLocaleString("vi-VN")}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
