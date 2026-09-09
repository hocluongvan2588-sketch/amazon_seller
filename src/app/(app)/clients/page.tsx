import { getAdapter } from "@/lib/data/factory";
import { requireSessionUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { createClientAction } from "@/lib/actions";
import { Flash } from "@/components/Flash";
import { Badge, Card, CardTitle, EmptyState, KV, PageHeader, StatCard } from "@/components/ui";

export const metadata = { title: "Clients" };
export const dynamic = "force-dynamic";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await requireSessionUser();
  const adapter = getAdapter();
  const [clients, opportunities, launches, tasks, campaigns, inventory] = await Promise.all([
    adapter.listClients(),
    adapter.listOpportunities(),
    adapter.listLaunches(),
    adapter.listTasks(),
    adapter.listCampaigns(),
    adapter.listInventory(),
  ]);

  const canUpdate = can(user.role, "client_profile", "update");
  const canCreate = can(user.role, "client_profile", "create");

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle="Chỉ hiển thị client bạn được cấp trong user_client_access — dữ liệu khác bị chặn ở RLS (spec §3.4)."
      />
      <Flash searchParams={params} />

      {canCreate ? (
        <Card className="mb-6" id="new-client">
          <CardTitle>Tạo client mới</CardTitle>
          <form action={createClientAction} className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Tên client *</label>
              <input name="name" required placeholder="VD: TLC Home Living" className="input" />
            </div>
            <div>
              <label className="label">Tên doanh nghiệp</label>
              <input name="business_name" placeholder="Công ty TNHH…" className="input" />
            </div>
            <div>
              <label className="label">Marketplace chính</label>
              <select name="marketplace" className="input">
                <option value="US">US</option>
                <option value="CA">CA</option>
                <option value="UK">UK</option>
                <option value="DE">DE</option>
                <option value="JP">JP</option>
              </select>
            </div>
            <div>
              <label className="label">Liên hệ chính</label>
              <input name="primary_contact_name" placeholder="Họ tên" className="input" />
            </div>
            <div>
              <label className="label">Email liên hệ</label>
              <input name="primary_contact_email" type="email" placeholder="email@congty.vn" className="input" />
            </div>
            <div className="flex items-end">
              <button className="btn btn-primary w-full">Tạo client</button>
            </div>
          </form>
        </Card>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Clients trong phạm vi" value={clients.length} />
        <StatCard label="Đang onboarding" value={clients.filter((c) => c.status === "onboarding").length} tone="warn" />
        <StatCard label="Đang hoạt động" value={clients.filter((c) => c.status === "active").length} tone="good" />
        <StatCard label="Opportunities" value={opportunities.length} />
      </div>

      {clients.length === 0 ? (
        <EmptyState title="Chưa được cấp client nào" hint="Liên hệ admin để được thêm vào user_client_access." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {clients.map((c) => {
            const ops = opportunities.filter((o) => o.client_account_id === c.id);
            const ls = launches.filter((l) => l.client_account_id === c.id);
            const ts = tasks.filter((t) => t.client_account_id === c.id && !["completed", "cancelled"].includes(t.status));
            const cams = campaigns.filter((x) => x.campaign.client_account_id === c.id);
            const stockRisk = inventory.filter((i) => i.product.client_account_id === c.id && ["high", "critical"].includes(i.severity));
            return (
              <Card key={c.id}>
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">{c.name}</h2>
                    <p className="text-xs text-slate-400">{c.business_name}</p>
                  </div>
                  <Badge tone={c.status === "active" ? "green" : c.status === "onboarding" ? "amber" : "slate"}>
                    {c.status}
                  </Badge>
                </div>
                <div className="mb-3 grid grid-cols-4 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 p-2">
                    <div className="text-lg font-semibold text-slate-800">{ops.length}</div>
                    <div className="text-[10px] uppercase text-slate-400">Research</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2">
                    <div className="text-lg font-semibold text-slate-800">{ls.length}</div>
                    <div className="text-[10px] uppercase text-slate-400">Launches</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2">
                    <div className={`text-lg font-semibold ${ts.length > 3 ? "text-amber-600" : "text-slate-800"}`}>{ts.length}</div>
                    <div className="text-[10px] uppercase text-slate-400">Tasks mở</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2">
                    <div className={`text-lg font-semibold ${stockRisk.length > 0 ? "text-rose-600" : "text-slate-800"}`}>
                      {stockRisk.length}
                    </div>
                    <div className="text-[10px] uppercase text-slate-400">Stockout risk</div>
                  </div>
                </div>
                <KV label="Marketplace chính">{c.marketplace}</KV>
                <KV label="Liên hệ chính">{c.primary_contact?.name ?? "—"}</KV>
                <KV label="Campaigns đang track">{cams.length}</KV>
                {canUpdate ? (
                  <p className="mt-3 text-xs text-slate-400">
                    Cập nhật hồ sơ client (RU): admin quản lý trong Settings · {c.owner_user_id ? "có AM phụ trách" : "chưa gán AM"}
                  </p>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
