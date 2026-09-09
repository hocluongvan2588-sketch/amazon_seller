import { redirect } from "next/navigation";
import { getAdapter } from "@/lib/data/factory";
import { getSessionUser } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/data/factory";
import { ROLE_LABELS, DEPARTMENT_LABELS } from "@/lib/permissions";
import type { SystemRole } from "@/lib/types";
import { loginAsAction } from "@/lib/actions";
import { Avatar, Badge } from "@/components/ui";

export const metadata = { title: "Đăng nhập" };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/today");
  const adapter = getAdapter();
  const members = await adapter.listMembers();
  const demo = !isSupabaseConfigured();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-10">
      <div className="w-full max-w-3xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-xl font-bold text-white">
            A
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Amazon Internal Operations Platform
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Product Research · Unit Economics · Go/No-Go · Launch · PPC · Inventory · Customer Response
          </p>
        </div>

        {demo ? (
          <div className="card p-6">
            <div className="mb-1 flex items-center gap-2">
              <Badge tone="amber">DEMO MODE</Badge>
              <span className="text-sm font-medium text-slate-700">Chọn người dùng để đăng nhập</span>
            </div>
            <p className="mb-5 text-xs text-slate-500">
              Dữ liệu mẫu in-memory — mỗi user có quyền khác nhau theo ma trận §3.3 của đặc tả.
              Thử <strong>Nguyễn Bảo Châu</strong> (research), <strong>Đỗ Mai Phương</strong> (finance) hoặc{" "}
              <strong>Trịnh Văn Hùng</strong> (reviewer) để thấy phân quyền thay đổi.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {members
                .filter((m) => m.status === "active")
                .map((m) => (
                  <form key={m.id} action={loginAsAction}>
                    <input type="hidden" name="userId" value={m.user_id} />
                    <button
                      type="submit"
                      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40"
                    >
                      <Avatar name={m.profile?.full_name ?? "?"} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">
                          {m.profile?.full_name}
                        </span>
                        <span className="block truncate text-xs text-slate-400">
                          {ROLE_LABELS[m.role as SystemRole]} · {DEPARTMENT_LABELS[m.department]}
                        </span>
                      </span>
                      <Badge tone={m.role === "owner" || m.role === "admin" ? "brand" : "slate"}>
                        {ROLE_LABELS[m.role as SystemRole]}
                      </Badge>
                    </button>
                  </form>
                ))}
            </div>
          </div>
        ) : (
          <div className="card p-6 text-center">
            <p className="text-sm text-slate-600">
              Đăng nhập bằng Supabase Auth. Vui lòng liên hệ admin để được cấp tài khoản nội bộ.
            </p>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-slate-400">
          Nội bộ · Không public signup · Mọi truy cập dữ liệu chịu chi phối bởi RLS (spec §3.4)
        </p>
      </div>
    </div>
  );
}
