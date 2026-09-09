import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  LayoutDashboard,
  Building2,
  Search,
  Rocket,
  FileText,
  Megaphone,
  Boxes,
  Mail,
  ListTodo,
  BarChart3,
  Settings,
} from "lucide-react";
import { getSessionUser } from "@/lib/session";
import { getAdapter } from "@/lib/data/factory";
import { isSupabaseConfigured } from "@/lib/data/factory";
import { ROLE_LABELS } from "@/lib/permissions";
import { logoutAction } from "@/lib/actions";
import { Avatar, cn } from "./ui";

const NAV = [
  { href: "/today", label: "Today", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Building2 },
  { href: "/research", label: "Product Research", icon: Search },
  { href: "/launches", label: "Launches", icon: Rocket },
  { href: "/listings", label: "Listings", icon: FileText },
  { href: "/ads", label: "Ads", icon: Megaphone },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/messages", label: "Messages", icon: Mail },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export async function AppShell({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const adapter = getAdapter();
  const pendingApprovals = (await adapter.listApprovals(undefined, "pending")).length;

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2.5 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            A
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight text-slate-900">Amazon Ops</div>
            <div className="text-[11px] text-slate-400">Internal Platform</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <item.icon size={16} className="shrink-0 text-slate-400" />
              <span className="flex-1">{item.label}</span>
              {item.href === "/today" && pendingApprovals > 0 ? (
                <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700">
                  {pendingApprovals}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
            <Avatar name={user.full_name} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-800">{user.full_name}</div>
              <div className="truncate text-[11px] text-slate-400">{ROLE_LABELS[user.role]}</div>
            </div>
          </div>
          <form action={logoutAction}>
            <button className="mt-1 w-full rounded-lg px-3 py-1.5 text-left text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              Đăng xuất
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        {!isSupabaseConfigured() ? (
          <div className="flex items-center justify-center gap-2 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-800">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
            DEMO MODE — dữ liệu mẫu in-memory. Cấu hình <code className="mx-1 rounded bg-amber-100 px-1">NEXT_PUBLIC_SUPABASE_URL</code>
            để chuyển sang Supabase + RLS.
          </div>
        ) : null}
        <div className="mx-auto max-w-[1200px] px-6 py-6">{children}</div>
      </main>
    </div>
  );
}