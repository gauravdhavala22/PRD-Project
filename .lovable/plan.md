# Per-User Google Drive OAuth

Every signed-in app user grants their own Drive access. Each user sees only their own Drive folders; no shared workspace credential.

## Prerequisite (you do this — required before anything works)

1. In Lovable → Connectors → **App User Connectors**, create a Google OAuth client for the `google` connector.
2. Configure scopes: `openid`, `email`, `profile`, `https://www.googleapis.com/auth/drive.readonly`.
3. Lovable will give you a **connector client ID**. I'll add it as a secret named `GOOGLE_APP_USER_CONNECTOR_CLIENT_ID`.

Tell me when this is done (and paste the client ID) — I won't proceed until then because the OAuth call needs it.

## What I'll change

**New files**
- `src/integrations/lovable/appUserConnector.ts` — server-only helper (`authorizeAppUserOAuth`, `callAsAppUser`).
- `src/integrations/lovable/appUserConnectorClient.ts` — browser popup helper (`connectAppUser`).
- `src/lib/drive-oauth.functions.ts` — server fns: `startDriveConnect`, `saveDriveConnection`, `disconnectDrive`.

**Schema migration (`profiles` table)**
- Add `google_connection_id text` (the per-user `connectionId` returned by OAuth).
- Add `google_email text`, `google_name text` for display.
- Drop `google_provider_token` (dead column from the previous flow).

**Rewrite `src/lib/drive.functions.ts`**
- Replace every `driveGet(...)` call with `callAsAppUser({ connectionId, connectorId: "google_drive", path })`.
- `isDriveConnected` reads `google_connection_id` from the caller's profile, then probes `/about` as that user.
- All five fns (`isDriveConnected`, `listDriveFolders`, `listDocsInFolder`, `importDriveDocs`, `syncProjectDrive`) become per-user — RLS already scopes their reads/writes to `auth.uid()`.
- Remove the workspace gateway code path entirely.

**Rewrite `src/routes/_authenticated/connect-drive.tsx`**
- Replace `supabase.auth.signInWithOAuth(...)` with a button that calls `connectAppUser(...)` (popup flow, iframe-safe in the editor).
- On success, call `saveDriveConnection({ connectionId, email, name })` to persist on profile, then redirect to `/dashboard`.
- Add a "Disconnect Drive" action.

**Update `src/components/AppShell.tsx`**
- "Drive connected" pill reads the per-user status (same `isDriveConnected` query, now per-user).

**Cleanup**
- Remove the workspace `google_drive` connector once you confirm per-user works.

## Trade-offs you should know

- Existing imported notes/decisions stay in the DB (they're keyed by `project_id` + `user_id`, not the Drive account).
- Re-syncing folders only works for users who have re-consented via the new flow.
- The current workspace connector becomes obsolete — keep it linked during rollout, drop after.

## Order of operations

1. You set up the App User Connector + give me the client ID.
2. I run the migration (you approve).
3. I write the helpers + new server fns + UI.
4. You sign in, click "Connect Google Drive", grant access — only your own Drive shows up.
5. We drop the workspace connector.
