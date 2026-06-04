import { Link, useLocation } from "@tanstack/react-router";
import { LayoutDashboard, FolderKanban, GitCommit, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const navItems = [
  { to: "/decisions", label: "Decision Log", icon: GitCommit, primary: true },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/projects", label: "Projects", icon: FolderKanban },
];

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 flex flex-col sticky top-0 h-screen p-4 shadow-2xl bg-gradient-to-br from-sky-100 via-indigo-100 to-violet-100">
        <div className="mb-8 flex items-center gap-3 px-2 pt-2">
          <div className="h-10 w-10 rounded-xl bg-white/50 backdrop-blur-md grid place-items-center shadow-sm">
            <Sparkles className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <div className="text-sm font-bold leading-tight tracking-tight text-slate-800">BA AI Assistant</div>
            <div className="text-[10px] text-slate-500">Notes → PRDs</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map((item) => {
            const active = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all relative",
                  active
                    ? item.primary
                      ? "bg-gradient-to-r from-amber-400/40 via-rose-400/40 to-fuchsia-400/40 text-rose-900 shadow-sm"
                      : "bg-indigo-200/40 text-indigo-800"
                    : item.primary
                      ? "text-rose-700 hover:bg-white/50"
                      : "text-slate-600 hover:bg-white/40 hover:text-slate-900",
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="flex-1">{item.label}</span>
                {item.primary && !active && (
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-2xl bg-white/40 p-4 backdrop-blur-sm border border-white/50 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Tip</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            Link a Drive folder to auto-ingest meeting notes.
          </p>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
