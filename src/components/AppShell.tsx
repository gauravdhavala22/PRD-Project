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
      <aside className="w-64 border-r border-sidebar-border bg-sidebar/80 backdrop-blur-xl text-sidebar-foreground flex flex-col sticky top-0 h-screen">
        <div className="px-5 py-5 border-b border-sidebar-border flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white grid place-items-center shadow-lg shadow-violet-500/30">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight tracking-tight">BA AI Assistant</div>
            <div className="text-[11px] text-muted-foreground">Notes → PRDs</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const active = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all",
                  active
                    ? "bg-gradient-to-r from-indigo-500/15 via-violet-500/15 to-transparent text-foreground font-medium shadow-sm"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-gradient-to-b from-indigo-500 to-violet-500" />
                )}
                <item.icon className={cn("h-4 w-4 transition-colors", active && "text-violet-600 dark:text-violet-400")} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-sidebar-border">
          <div className="rounded-xl p-3 bg-gradient-to-br from-indigo-500/10 via-violet-500/10 to-fuchsia-500/10 border border-violet-500/20">
            <p className="text-[11px] font-medium text-foreground">Tip</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              Link a Drive folder to auto-ingest meeting notes.
            </p>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
