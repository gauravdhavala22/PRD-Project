import { Link, useLocation } from "@tanstack/react-router";
import { LayoutDashboard, FolderKanban, GitCommit, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/decisions", label: "Decision Log", icon: GitCommit },
];

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 flex flex-col sticky top-0 h-screen p-4 text-white shadow-2xl bg-gradient-to-br from-indigo-700 via-violet-800 to-fuchsia-900">
        <div className="mb-8 flex items-center gap-3 px-2 pt-2">
          <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur-md grid place-items-center">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold leading-tight tracking-tight">BA AI Assistant</div>
            <div className="text-[10px] opacity-60">Notes → PRDs</div>
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
                  "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all",
                  active
                    ? "bg-white/15 text-white"
                    : "text-white/70 hover:bg-white/10 hover:text-white",
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-2xl bg-white/10 p-4 backdrop-blur-sm border border-white/10">
          <p className="text-xs font-bold uppercase tracking-wider text-white/50">Tip</p>
          <p className="mt-2 text-xs leading-relaxed text-indigo-100">
            Link a Drive folder to auto-ingest meeting notes.
          </p>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
