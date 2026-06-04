import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HardDrive } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/connect-drive")({
  head: () => ({
    meta: [
      { title: "Connect Google Drive — BA AI Assistant" },
      { name: "description", content: "Connect your Google Drive to import meeting notes." },
    ],
  }),
  component: ConnectDrivePage,
});

const DRIVE_SCOPES = "openid email profile https://www.googleapis.com/auth/drive.readonly";

function ConnectDrivePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);

  // After Google OAuth redirects back here, persist the provider token.
  useEffect(() => {
    let cancelled = false;
    const persistToken = async () => {
      const { data: sess } = await supabase.auth.getSession();
      const providerToken = sess.session?.provider_token;
      const user = sess.session?.user;
      if (!user || !providerToken || cancelled) return;
      const { error } = await supabase.from("profiles").upsert({
        id: user.id,
        email: user.email,
        google_provider_token: providerToken,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      qc.invalidateQueries({ queryKey: ["drive-connected"] });
      qc.invalidateQueries({ queryKey: ["drive-folders"] });
      toast.success("Google Drive connected");
      navigate({ to: "/dashboard", replace: true });
    };
    persistToken();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") persistToken();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [navigate, qc]);


  const handleConnect = async () => {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/connect-drive",
        extraParams: {
          scope: DRIVE_SCOPES,
          access_type: "offline",
          prompt: "consent",
        },
      });
      if (result.error) {
        throw result.error instanceof Error ? result.error : new Error(String(result.error));
      }
      if (result.redirected) return;

      const { data: sess } = await supabase.auth.getSession();
      const providerToken = sess.session?.provider_token;
      const user = sess.session?.user;
      if (user) {
        await supabase.from("profiles").upsert({
          id: user.id,
          email: user.email,
          ...(providerToken ? { google_provider_token: providerToken } : {}),
        });
      }
      toast.success("Google Drive connected");
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to connect Google Drive");
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    navigate({ to: "/dashboard", replace: true });
  };

  return (
    <div className="min-h-[80vh] grid place-items-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="h-12 w-12 rounded-md bg-primary/10 text-primary grid place-items-center mb-3">
            <HardDrive className="h-6 w-6" />
          </div>
          <CardTitle>Connect Google Drive</CardTitle>
          <CardDescription>
            Connect your Google Drive so we can import meeting notes and turn them into PRDs. You can skip this and do it later.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button className="w-full" onClick={handleConnect} disabled={loading}>
            {loading ? "Redirecting…" : "Connect Google Drive"}
          </Button>
          <Button variant="ghost" className="w-full" onClick={handleSkip} disabled={loading}>
            Skip for now
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
