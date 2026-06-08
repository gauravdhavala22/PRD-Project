import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const DRIVE_CONNECTOR_ID = "google_drive";

async function getCallerConnectionId(
  supabase: Awaited<ReturnType<typeof import("@/integrations/supabase/auth-middleware")["requireSupabaseAuth"]["server"]>> extends infer _ ? any : never,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("google_connection_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.google_connection_id as string | null) ?? null;
}

async function driveFetch(connectionId: string, path: string): Promise<Response> {
  const { callAsAppUser } = await import("@/integrations/lovable/appUserConnector");
  return callAsAppUser({
    gatewayBaseUrl: GATEWAY_BASE_URL,
    connectionId,
    connectorId: DRIVE_CONNECTOR_ID,
    path: `/drive/v3${path}`,
  });
}

/** Check if the signed-in user has a working per-user Drive connection. */
export const isDriveConnected = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const connectionId = await getCallerConnectionId(supabase, userId);
    if (!connectionId) return { connected: false as const, email: null, name: null };
    try {
      const res = await driveFetch(
        connectionId,
        `/about?fields=${encodeURIComponent("user(emailAddress,displayName)")}`,
      );
      if (!res.ok) return { connected: false as const, email: null, name: null };
      const json = (await res.json()) as {
        user?: { emailAddress?: string; displayName?: string };
      };
      return {
        connected: true as const,
        email: json.user?.emailAddress ?? null,
        name: json.user?.displayName ?? null,
      };
    } catch {
      return { connected: false as const, email: null, name: null };
    }
  });

/** List folders in the signed-in user's Drive, optionally filtered by name. */
export const listDriveFolders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ search: z.string().max(200).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const connectionId = await getCallerConnectionId(supabase, userId);
    if (!connectionId) {
      return { folders: [], notConnected: true as const };
    }

    const parts = [
      "mimeType='application/vnd.google-apps.folder'",
      "trashed=false",
    ];
    if (data.search && data.search.trim()) {
      const safe = data.search.replace(/['\\]/g, " ").trim();
      parts.push(`name contains '${safe}'`);
    }
    const q = encodeURIComponent(parts.join(" and "));
    const fields = encodeURIComponent("files(id,name,modifiedTime,parents)");
    const res = await driveFetch(
      connectionId,
      `/files?q=${q}&fields=${fields}&pageSize=50&orderBy=modifiedTime desc`,
    );
    if (!res.ok) {
      throw new Error(`Drive list folders failed (${res.status}): ${await res.text()}`);
    }
    const json = (await res.json()) as {
      files?: Array<{ id: string; name: string; modifiedTime?: string }>;
    };
    return { folders: json.files ?? [], notConnected: false as const };
  });

/** List Google Docs inside a Drive folder linked to a user-owned project. */
export const listDocsInFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        folderId: z.string().min(1).max(200),
        projectId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const connectionId = await getCallerConnectionId(supabase, userId);
    if (!connectionId) throw new Error("Google Drive is not connected for this account.");

    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("id, drive_folder_id")
      .eq("id", data.projectId)
      .single();
    if (projErr || !project) throw new Error("Project not found");
    if (project.drive_folder_id !== data.folderId) {
      throw new Error("Folder is not linked to this project");
    }

    const safeId = data.folderId.replace(/['\\]/g, "");
    const q = encodeURIComponent(
      `'${safeId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`,
    );
    const fields = encodeURIComponent("files(id,name,modifiedTime)");
    const res = await driveFetch(
      connectionId,
      `/files?q=${q}&fields=${fields}&pageSize=100&orderBy=modifiedTime desc` +
        `&includeItemsFromAllDrives=true&supportsAllDrives=true&corpora=allDrives`,
    );
    if (!res.ok) {
      throw new Error(`Drive list docs failed (${res.status}): ${await res.text()}`);
    }
    const json = (await res.json()) as {
      files?: Array<{ id: string; name: string; modifiedTime?: string }>;
    };
    return { docs: json.files ?? [] };
  });

/** Import the selected Google Docs into meeting_notes for a project. */
export const importDriveDocs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        docs: z
          .array(
            z.object({
              id: z.string().min(1).max(200),
              name: z.string().min(1).max(500),
              modifiedTime: z.string().max(50).optional(),
            }),
          )
          .min(1)
          .max(25),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const connectionId = await getCallerConnectionId(supabase, userId);
    if (!connectionId) throw new Error("Google Drive is not connected for this account.");

    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("id")
      .eq("id", data.projectId)
      .single();
    if (projErr || !project) throw new Error("Project not found");

    const ids = data.docs.map((d) => d.id);
    const { data: existing } = await supabase
      .from("meeting_notes")
      .select("google_doc_id")
      .eq("project_id", data.projectId)
      .in("google_doc_id", ids);
    const existingIds = new Set((existing ?? []).map((r) => r.google_doc_id));

    const toFetch = data.docs.filter((d) => !existingIds.has(d.id));
    if (toFetch.length === 0) {
      return { imported: 0, skipped: data.docs.length };
    }

    const fetched = await Promise.all(
      toFetch.map(async (doc) => {
        const res = await driveFetch(
          connectionId,
          `/files/${encodeURIComponent(doc.id)}/export?mimeType=text/plain`,
        );
        if (!res.ok) {
          throw new Error(
            `Failed to export "${doc.name}" (${res.status}): ${await res.text()}`,
          );
        }
        const text = await res.text();
        return {
          project_id: data.projectId,
          user_id: userId,
          google_doc_id: doc.id,
          title: doc.name,
          content: text,
          source: "google_drive",
          doc_modified_at: doc.modifiedTime ?? null,
        };
      }),
    );

    const { error: insErr } = await supabase.from("meeting_notes").insert(fetched);
    if (insErr) throw new Error(insErr.message);

    return { imported: fetched.length, skipped: data.docs.length - fetched.length };
  });

/** List all projects (for the signed-in user) that have a connected Drive folder. */
export const listSyncableProjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("projects")
      .select("id, name, drive_folder_id")
      .not("drive_folder_id", "is", null);
    if (error) throw new Error(error.message);
    return {
      projects: (data ?? []).map((p) => ({
        id: p.id as string,
        name: p.name as string,
        drive_folder_id: p.drive_folder_id as string,
      })),
    };
  });

/** Sync a single project's Drive folder: import new docs (decisions stay manual). */
export const syncProjectDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const connectionId = await getCallerConnectionId(supabase, userId);
    if (!connectionId) throw new Error("Google Drive is not connected for this account.");

    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("id, name, drive_folder_id")
      .eq("id", data.projectId)
      .single();
    if (projErr || !project) throw new Error("Project not found");
    const folderId = project.drive_folder_id as string | null;
    if (!folderId) return { notesImported: 0, decisionsCreated: 0, errors: [] };

    let notesImported = 0;
    const errors: string[] = [];

    try {
      const safeId = folderId.replace(/['\\]/g, "");
      const q = encodeURIComponent(
        `'${safeId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`,
      );
      const fields = encodeURIComponent("files(id,name,modifiedTime)");
      const listRes = await driveFetch(
        connectionId,
        `/files?q=${q}&fields=${fields}&pageSize=100&orderBy=modifiedTime desc` +
          `&includeItemsFromAllDrives=true&supportsAllDrives=true&corpora=allDrives`,
      );
      if (!listRes.ok) {
        return {
          notesImported: 0,
          decisionsCreated: 0,
          errors: [`list failed (${listRes.status})`],
        };
      }
      const listJson = (await listRes.json()) as {
        files?: Array<{ id: string; name: string; modifiedTime?: string }>;
      };
      const docs = listJson.files ?? [];
      if (docs.length === 0) return { notesImported, decisionsCreated: 0, errors };

      const { data: existing } = await supabase
        .from("meeting_notes")
        .select("google_doc_id")
        .eq("project_id", project.id)
        .in(
          "google_doc_id",
          docs.map((d) => d.id),
        );
      const existingIds = new Set((existing ?? []).map((r) => r.google_doc_id));
      const toFetch = docs.filter((d) => !existingIds.has(d.id));

      await Promise.all(
        toFetch.map(async (doc) => {
          const exportRes = await driveFetch(
            connectionId,
            `/files/${encodeURIComponent(doc.id)}/export?mimeType=text/plain`,
          );
          if (!exportRes.ok) {
            errors.push(`${doc.name}: export failed (${exportRes.status})`);
            return;
          }
          const content = await exportRes.text();
          const { error: insErr } = await supabase.from("meeting_notes").insert({
            project_id: project.id,
            user_id: userId,
            google_doc_id: doc.id,
            title: doc.name,
            content,
            source: "google_drive",
            doc_modified_at: doc.modifiedTime ?? null,
          });
          if (insErr) {
            errors.push(`${doc.name}: ${insErr.message}`);
            return;
          }
          notesImported += 1;
        }),
      );
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    return { notesImported, decisionsCreated: 0, errors };
  });
