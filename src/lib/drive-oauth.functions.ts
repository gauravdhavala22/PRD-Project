import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR_ID = "google";
const DRIVE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.readonly",
];

/** Start the per-user Drive OAuth flow. Returns the gateway authorization URL. */
export const startDriveConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        targetOrigin: z.string().url().max(500),
        returnUrl: z.string().url().max(1000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const clientId = process.env.GOOGLE_APP_USER_CONNECTOR_CLIENT_ID;
    if (!clientId) {
      throw new Error(
        "GOOGLE_APP_USER_CONNECTOR_CLIENT_ID is not configured. Set up the Google App User Connector in Lovable.",
      );
    }
    const { authorizeAppUserOAuth } = await import(
      "@/integrations/lovable/appUserConnector"
    );
    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId: CONNECTOR_ID,
      appUserId: context.userId,
      connectorClientId: clientId,
      returnUrl: data.returnUrl,
      responseMode: "web_message",
      webMessageTargetOrigin: data.targetOrigin,
      credentialsConfiguration: { scopes: DRIVE_SCOPES },
    });
    return { authorizationUrl };
  });

/** Persist the per-user Drive connection on the user's profile. */
export const saveDriveConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ connectionId: z.string().min(1).max(200) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { callAsAppUser } = await import("@/integrations/lovable/appUserConnector");

    // Look up email/display name from Drive itself so we can show it in the UI.
    let email: string | null = null;
    let name: string | null = null;
    try {
      const res = await callAsAppUser({
        gatewayBaseUrl: GATEWAY_BASE_URL,
        connectionId: data.connectionId,
        connectorId: "google_drive",
        path: `/drive/v3/about?fields=${encodeURIComponent("user(emailAddress,displayName)")}`,
      });
      if (res.ok) {
        const json = (await res.json()) as {
          user?: { emailAddress?: string; displayName?: string };
        };
        email = json.user?.emailAddress ?? null;
        name = json.user?.displayName ?? null;
      }
    } catch {
      // Non-fatal — we still persist the connection_id.
    }

    const { error } = await supabase.from("profiles").upsert({
      id: userId,
      google_connection_id: data.connectionId,
      google_email: email,
      google_name: name,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const, email, name };
  });

/** Clear the user's Drive connection. */
export const disconnectDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({
        google_connection_id: null,
        google_email: null,
        google_name: null,
      })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
