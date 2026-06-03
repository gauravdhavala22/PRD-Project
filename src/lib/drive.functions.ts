import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive/drive/v3";

function authHeaders() {
  const lovable = process.env.LOVABLE_API_KEY;
  const drive = process.env.GOOGLE_DRIVE_API_KEY;
  if (!lovable) throw new Error("LOVABLE_API_KEY not configured");
  if (!drive) throw new Error("Google Drive is not connected (GOOGLE_DRIVE_API_KEY missing)");
  return {
    Authorization: `Bearer ${lovable}`,
    "X-Connection-Api-Key": drive,
  } as Record<string, string>;
}

async function driveGet(path: string): Promise<Response> {
  return fetch(`${GATEWAY}${path}`, { headers: authHeaders() });
}

/** List folders in the developer's Drive, optionally filtered by name. */
export const listDriveFolders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ search: z.string().max(200).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
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
    const res = await driveGet(
      `/files?q=${q}&fields=${fields}&pageSize=50&orderBy=modifiedTime desc`,
    );
    if (!res.ok) {
      throw new Error(`Drive list folders failed (${res.status}): ${await res.text()}`);
    }
    const json = (await res.json()) as {
      files?: Array<{ id: string; name: string; modifiedTime?: string }>;
    };
    return { folders: json.files ?? [] };
  });

/** List Google Docs inside a Drive folder. */
export const listDocsInFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ folderId: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data }) => {
    const safeId = data.folderId.replace(/['\\]/g, "");
    const q = encodeURIComponent(
      `'${safeId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`,
    );
    const fields = encodeURIComponent("files(id,name,modifiedTime)");
    const res = await driveGet(
      `/files?q=${q}&fields=${fields}&pageSize=100&orderBy=modifiedTime desc`,
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
    z.object({
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
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify project belongs to user (RLS will enforce too).
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("id")
      .eq("id", data.projectId)
      .single();
    if (projErr || !project) throw new Error("Project not found");

    // Skip docs we've already imported for this project.
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

    const rows: Array<{
      project_id: string;
      user_id: string;
      google_doc_id: string;
      title: string;
      content: string;
      source: string;
      doc_modified_at: string | null;
    }> = [];

    for (const doc of toFetch) {
      const res = await driveGet(
        `/files/${encodeURIComponent(doc.id)}/export?mimeType=text/plain`,
      );
      if (!res.ok) {
        throw new Error(
          `Failed to export "${doc.name}" (${res.status}): ${await res.text()}`,
        );
      }
      const text = await res.text();
      rows.push({
        project_id: data.projectId,
        user_id: userId,
        google_doc_id: doc.id,
        title: doc.name,
        content: text,
        source: "google_drive",
        doc_modified_at: doc.modifiedTime ?? null,
      });
    }

    const { error: insErr } = await supabase.from("meeting_notes").insert(rows);
    if (insErr) throw new Error(insErr.message);

    return { imported: rows.length, skipped: data.docs.length - rows.length };
  });
