import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HardDrive } from "lucide-react";
import { toast } from "sonner";
import { connectAppUser } from "@/integrations/lovable/appUserConnectorClient";
import { startDriveConnect, saveDriveConnection } from "@/lib/drive-oauth.functions";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";

export const Route = createFileRoute("/_authenticated/connect-drive")({
  head: () => ({
    meta: [
      { title: "Connect Google Drive — BA AI Assistant" },
      { name: "description", content: "Connect your Google Drive to import meeting notes." },
    ],
  }),
  component: ConnectDrivePage,
});

function ConnectDrivePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const start = useServerFn(startDriveConnect);
  const save = useServerFn(saveDriveConnection);
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    setLoading(true);
    try {
      const result = await connectAppUser({
        connectorId: "google",
        gatewayBaseUrl: GATEWAY_BASE_URL,
        start: (targetOrigin) =>
          start({
            data: {
              targetOrigin,
              returnUrl: `${window.location.origin}/connect-drive`,
            },
          }),
      });
      if (!result.success || !result.connectionId) {
        toast.error(result.error ?? "Failed to connect Google Drive");
        return;
      }
      const saved = await save({ data: { connectionId: result.connectionId } });
      qc.invalidateQueries({ queryKey: ["drive-connected"] });
      qc.invalidateQueries({ queryKey: ["drive-folders"] });
      toast.success(
        saved.email ? `Connected to ${saved.email}` : "Google Drive connected",
      );
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
            Sign in with Google to give this app read-only access to your own Drive.
            Each user connects their own account — your files are private to you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button className="w-full" onClick={handleConnect} disabled={loading}>
            {loading ? "Connecting…" : "Connect Google Drive"}
          </Button>
          <Button variant="ghost" className="w-full" onClick={handleSkip} disabled={loading}>
            Skip for now
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
