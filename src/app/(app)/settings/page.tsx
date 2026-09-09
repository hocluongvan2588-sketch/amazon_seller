import { getAdapter } from "@/lib/data/factory";
import { requireSessionUser } from "@/lib/session";
import {
  DEPARTMENT_LABELS,
  ROLE_LABELS,
  can,
  canManageUsers,
  canSeeCustomerMessages,
  canSeeFinanceData,
} from "@/lib/permissions";
import { Flash } from "@/components/Flash";
import { Avatar, Badge, Card, CardTitle, KV, PageHeader } from "@/components/ui";
import type { SystemRole } from "@/lib/types";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

const MATRIX_MODULES = [
  ["client_profile", "Client profile"],
  ["product_research", "Product Research"],
  ["supplier_sample", "Supplier & Sample"],
  ["economics", "Economics"],
  ["listing", "Listing"],
  ["ppc", "PPC"],
  ["inventory_logistics", "Inventory"],
  ["customer_response", "Customer Response"],
  ["tasks", "Tasks"],
  ["approvals", "Approvals"],
  ["reports", "Reports"],
  ["user_role", "User & Role"],
  ["audit_log", "Audit Log"],
] as const;

const ROLES: SystemRole[] = [
  "owner", "admin", "account_manager", "product_research", "sourcing",
  "content_seo", "ppc_operator", "inventory_logistics", "customer_service",
  "finance", "reviewer", "viewer",
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await requireSessionUser();
  const adapter = getAdapter();
  const [members, clients] = await Promise.all([adapter.listMembers(), adapter.listClients()]);
  const { ROLE_MATRIX } = await import("@/lib/permissions");

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle={`Tổ chức · thành viên · ma trận quyền. Chế độ: ${adapter.mode === "demo" ? "DEMO (in-memory)" : "Supabase + RLS"}.`}
      />
      <Flash searchParams={params} />

      <Card className="mb-6">
        <CardTitle right={<Badge>{clients.length} clients</Badge>}>Thành viên tổ chức</CardTitle>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Thành viên</th>
                <th>Role hệ thống</th>
                <th>Bộ phận</th>
                <th>Trạng thái</th>
                <th>Phạm vi dữ liệu đặc biệt</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={m.profile?.full_name ?? "?"} size={28} />
                      <div>
                        <div className="text-sm font-medium text-slate-800">{m.profile?.full_name}</div>
                        <div className="text-[11px] text-slate-400">{m.profile?.email}</div>
                      </div>
                    </div>
                  </td>
                  <td><Badge tone={m.role === "owner" || m.role === "admin" ? "brand" : "slate"}>{ROLE_LABELS[m.role]}</Badge></td>
                  <td className="text-xs text-slate-500">{DEPARTMENT_LABELS[m.department]}</td>
                  <td><Badge tone={m.status === "active" ? "green" : "amber"}>{m.status}</Badge></td>
                  <td className="text-xs text-slate-400">
                    {canSeeFinanceData(m.role) ? "finance data · " : ""}
                    {canSeeCustomerMessages(m.role) ? "customer PII" : ""}
                    {!canSeeFinanceData(m.role) && !canSeeCustomerMessages(m.role) ? "—" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!canManageUsers(user.role) ? (
          <p className="mt-3 text-[11px] text-slate-400">
            Chỉ admin/owner được quản lý user &amp; role (ma trận §3.3). Trong Supabase mode, phân quyền thật nằm ở RLS.
          </p>
        ) : null}
      </Card>

      <Card className="mb-6">
        <CardTitle right={<Badge tone="brand">spec §3.3</Badge>}>Ma trận quyền theo bộ phận</CardTitle>
        <div className="overflow-x-auto">
          <table className="table-base text-[11px]">
            <thead>
              <tr>
                <th>Module</th>
                {ROLES.map((r) => (
                  <th key={r} className="whitespace-nowrap">{ROLE_LABELS[r]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIX_MODULES.map(([module, label]) => (
                <tr key={module}>
                  <td className="whitespace-nowrap font-medium text-slate-700">{label}</td>
                  {ROLES.map((role) => {
                    const perms = ROLE_MATRIX[role][module];
                    const text = perms.length === 0 ? "—" : perms.map((p) => p[0].toUpperCase()).join("");
                    const tone = perms.includes("approve")
                      ? "bg-violet-50 font-semibold text-violet-700"
                      : perms.length === 0
                        ? "text-slate-300"
                        : "text-slate-600";
                    return (
                      <td key={role} className={`text-center ${tone}`} title={perms.join(", ") || "không có quyền"}>
                        {text}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          C = create · R = read · U = update · D = delete · A = approve. Frontend chỉ là UX hint — RLS ở database mới là
          biện pháp bảo mật thật (spec §3.4).
        </p>
      </Card>

      <Card>
        <CardTitle>Hạ tầng & chế độ chạy</CardTitle>
        <KV label="Chế độ dữ liệu">
          {adapter.mode === "demo" ? "DEMO — in-memory mirror schema SQL" : "Supabase PostgreSQL"}
        </KV>
        <KV label="Auth">Supabase Auth (email/magic link) — demo dùng cookie user switcher</KV>
        <KV label="RLS">{adapter.mode === "demo" ? "Mô phỏng ở adapter layer" : "Bật trên 30+ bảng (migration 0002)"}</KV>
        <KV label="Storage">5 private bucket: research-files, listing-assets, supplier-documents, reports, customer-attachments</KV>
        <KV label="AI provider">Heuristic engine mặc định; AI_PROVIDER_* env để bật LLM ngoài (server-side only)</KV>
        <KV label="Kiểm tra quyền của bạn">
          {can(user.role, "product_research", "create") ? "research ✓ " : ""}
          {can(user.role, "economics", "create") ? "economics ✓ " : ""}
          {can(user.role, "listing", "create") ? "listing ✓ " : ""}
          {can(user.role, "ppc", "update") ? "ppc ✓ " : ""}
          {can(user.role, "inventory_logistics", "create") ? "inventory ✓ " : ""}
          {can(user.role, "customer_response", "create") ? "cs ✓ " : ""}
        </KV>
      </Card>
    </div>
  );
}
