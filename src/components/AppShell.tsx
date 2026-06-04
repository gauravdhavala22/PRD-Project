import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, FolderKanban, GitCommit, Sparkles, LogOut, HardDrive, CheckCircle2, Unlink } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/decisions", label: "Decision Log", icon: GitCommit },
];

const DRIVE_SCOPES = "openid email profile https://www.googleapis.com/auth/drive.readonly";

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: driveConnected } = useQuery({
    queryKey: ["drive-connected"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data } = await supabase
        .from("profiles")
        .select("google_provider_token")
        .eq("id", u.user.id)
        .maybeSingle();
      return Boolean(data?.google_provider_token);
    },
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const handleConnectDrive = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin + "/connect-drive",
          scopes: DRIVE_SCOPES,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      if (error) throw error;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to connect Google Drive");
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnectDrive = async () => {
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { error } = await supabase
        .from("profiles")
        .update({ google_provider_token: null })
        .eq("id", u.user.id);
      if (error) throw error;
      toast.success("Google Drive disconnected");
      qc.invalidateQueries({ queryKey: ["drive-connected"] });
      qc.invalidateQueries({ queryKey: ["drive-folders"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to disconnect");
    } finally {
      setBusy(false);
    }
  };

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
                  "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all",
                  active
                    ? "bg-indigo-200/40 text-indigo-800"
                    : "text-slate-600 hover:bg-white/40 hover:text-slate-900",
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mb-2 rounded-xl bg-white/40 border border-white/50 p-2 space-y-1">
          {driveConnected ? (
            <>
              <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Drive connected
              </div>
              <button
                onClick={handleDisconnectDrive}
                disabled={busy}
                className="flex items-center gap-2 w-full rounded-lg px-2 py-1.5 text-xs text-slate-600 hover:bg-white/60 disabled:opacity-50"
              >
                <Unlink className="h-3.5 w-3.5" />
                Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={handleConnectDrive}
              disabled={busy}
              className="flex items-center gap-2 w-full rounded-lg px-2 py-2 text-xs font-medium text-indigo-700 hover:bg-white/60 disabled:opacity-50"
            >
              <HardDrive className="h-4 w-4" />
              {busy ? "Connecting…" : "Link Google Drive"}
            </button>
          )}
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all text-slate-600 hover:bg-white/40 hover:text-slate-900 mb-2 w-full"
        >
          <LogOut className="h-5 w-5" />
          Log out
        </button>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
