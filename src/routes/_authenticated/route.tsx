import { createFileRoute, Outlet } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) return { user: data.user };
    // No account flow — silently create an anonymous session so the app "just works".
    const { data: anon, error } = await supabase.auth.signInAnonymously();
    if (error || !anon.user) throw new Error(error?.message ?? "Could not start session");
    return { user: anon.user };
  },
  component: () => (
    <AppShell>
      <Outlet />
      <Toaster />
    </AppShell>
  ),
});
