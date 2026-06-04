import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Cloud, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listDriveFolders } from "@/lib/drive.functions";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();
  const checkDrive = useServerFn(listDriveFolders);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const handleConnect = async () => {
    setLoading(true);
    try {
      await checkDrive({ data: {} });
      setConnected(true);
      toast.success("Google Drive connected");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not connect to Google Drive");
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = async () => {
    setFinishing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("profiles")
        .upsert({ id: user.id, email: user.email, onboarding_completed: true });
      if (error) throw error;
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not finish onboarding");
      setFinishing(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-muted/30 p-4">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-2 justify-center mb-6">
          <div className="h-9 w-9 rounded-md bg-primary text-primary-foreground grid place-items-center">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold">Welcome aboard</span>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Connect Google Drive</CardTitle>
            <CardDescription>
              We'll read meeting notes from your Drive folders to extract decisions and draft PRDs automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border p-4">
              <div className="h-10 w-10 rounded-md bg-muted grid place-items-center">
                {connected ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <Cloud className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1">
                <div className="font-medium text-sm">Google Drive</div>
                <div className="text-xs text-muted-foreground">
                  {connected ? "Connected and ready" : "Not connected"}
                </div>
              </div>
              <Button
                variant={connected ? "outline" : "default"}
                size="sm"
                onClick={handleConnect}
                disabled={loading || connected}
              >
                {loading ? "Connecting…" : connected ? "Connected" : "Connect"}
              </Button>
            </div>

            <Button
              className="w-full"
              onClick={handleFinish}
              disabled={!connected || finishing}
            >
              {finishing ? "Finishing…" : "Continue to dashboard"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
