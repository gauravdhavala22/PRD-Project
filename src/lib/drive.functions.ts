import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive/drive/v3";

function gatewayHeaders(): HeadersInit {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const driveKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!lovableKey || !driveKey) {
    throw new Error(
      "Google Drive isn't connected. Please link the Google Drive connector in Lovable.",
    );
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": driveKey,
  };
}

async function driveGet(_unused: unknown, path: string): Promise<Response> {
  return fetch(`${GATEWAY}${path}`, { headers: gatewayHeaders() });
}

/** Check if the Google Drive connector is linked. */
export const isDriveConnected = createServerFn({ method: "GET" })
  .handler(async () => {
    return {
      connected: Boolean(process.env.LOVABLE_API_KEY && process.env.GOOGLE_DRIVE_API_KEY),
    };
  });

/** List folders in the signed-in user's Drive, optionally filtered by name. */
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
    const res = await driveGet(null,
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

/** List Google Docs inside a Drive folder. */
export const listDocsInFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ folderId: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const safeId = data.folderId.replace(/['\\]/g, "");
    const q = encodeURIComponent(
      `'${safeId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`,
    );
    const fields = encodeURIComponent("files(id,name,modifiedTime)");
    const res = await driveGet(null,
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
      const res = await driveGet(null,
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

const DecisionExtractionSchema = z.object({
  decisions: z
    .array(
      z.object({
        title: z.string(),
        description: z.string().optional(),
        decision_date: z.string().optional(),
        confidence: z.number().optional(),
      }),
    )
    .optional(),
});

async function extractDecisionsFromNote(
  apiKey: string,
  noteTitle: string,
  noteContent: string,
): Promise<
  Array<{ title: string; description: string; decision_date: string | null; confidence: number }>
> {
  const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
  const { generateObject } = await import("ai");
  const gateway = createLovableAiGatewayProvider(apiKey);
  const model = gateway("google/gemini-3-flash-preview");

  try {
    const { object } = await generateObject({
      model,
      schema: DecisionExtractionSchema,
      maxOutputTokens: 2048,
      system:
        "You extract concrete DECISIONS from meeting notes. " +
        "A decision is a choice that was made (not an open question, action item, or idea). " +
        "Return JSON with key 'decisions' as an array. Each decision has: title (short), description (1-2 sentences), " +
        "optional decision_date (YYYY-MM-DD if explicitly mentioned), confidence (0-1 based on how clearly stated). " +
        "IMPORTANT: Whenever the notes mention specific people (decision-maker, owner, attendees who agreed, person responsible), " +
        "include their full names in the description (e.g. 'John Smith decided…', 'Agreed by Jane Doe and Alex Kim'). " +
        "Use the exact names as written in the notes. If no person is named for a decision, omit names rather than guessing. " +
        "If no decisions are present, return an empty array.",
      prompt: `Note title: ${noteTitle}\n\nNote content:\n${noteContent.slice(0, 12000)}`,
    });
    return (object.decisions ?? []).reduce<
      Array<{ title: string; description: string; decision_date: string | null; confidence: number }>
    >((acc, d) => {
      const title = (d.title || "").trim();
      if (!title) return acc;
      const dateOk = d.decision_date && /^\d{4}-\d{2}-\d{2}/.test(d.decision_date);
      const conf = Number(d.confidence);
      acc.push({
        title: title.slice(0, 200),
        description: (d.description || "").trim(),
        decision_date: dateOk ? d.decision_date!.slice(0, 10) : null,
        confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.5,
      });
      return acc;
    }, []);
  } catch (err) {
    console.error("Decision extraction failed for note", noteTitle, err);
    return [];
  }
}

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

/** Sync a single project's Drive folder: import new docs and auto-extract decisions. */
export const syncProjectDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("id, name, drive_folder_id")
      .eq("id", data.projectId)
      .single();
    if (projErr || !project) throw new Error("Project not found");
    const folderId = project.drive_folder_id as string | null;
    if (!folderId) return { notesImported: 0, decisionsCreated: 0, errors: [] };

    let notesImported = 0;
    let decisionsCreated = 0;
    const errors: string[] = [];

    try {
      const safeId = folderId.replace(/['\\]/g, "");
      const q = encodeURIComponent(
        `'${safeId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`,
      );
      const fields = encodeURIComponent("files(id,name,modifiedTime)");
      const listRes = await driveGet(null,
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
      if (docs.length === 0) return { notesImported, decisionsCreated, errors };

      const { data: existing } = await supabase
        .from("meeting_notes")
        .select("google_doc_id")
        .eq("project_id", project.id)
        .in("google_doc_id", docs.map((d) => d.id));
      const existingIds = new Set((existing ?? []).map((r) => r.google_doc_id));
      const toFetch = docs.filter((d) => !existingIds.has(d.id));

      for (const doc of toFetch) {
        const exportRes = await driveGet(null,
          `/files/${encodeURIComponent(doc.id)}/export?mimeType=text/plain`,
        );
        if (!exportRes.ok) {
          errors.push(`${doc.name}: export failed (${exportRes.status})`);
          continue;
        }
        const content = await exportRes.text();
        const { data: inserted, error: insErr } = await supabase
          .from("meeting_notes")
          .insert({
            project_id: project.id,
            user_id: userId,
            google_doc_id: doc.id,
            title: doc.name,
            content,
            source: "google_drive",
            doc_modified_at: doc.modifiedTime ?? null,
          })
          .select("id")
          .single();
        if (insErr || !inserted) {
          errors.push(`${doc.name}: ${insErr?.message ?? "insert failed"}`);
          continue;
        }
        notesImported += 1;

        const decisions = await extractDecisionsFromNote(apiKey, doc.name, content);
        if (decisions.length > 0) {
          const rows = decisions.map((d) => ({
            project_id: project.id,
            user_id: userId,
            meeting_note_id: inserted.id,
            title: d.title,
            description: d.description,
            decision_date: d.decision_date,
            confidence: d.confidence,
            status: "pending",
          }));
          const { error: decErr } = await supabase.from("decisions").insert(rows);
          if (decErr) {
            errors.push(`${doc.name}: decisions ${decErr.message}`);
          } else {
            decisionsCreated += decisions.length;
          }
        }
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    return { notesImported, decisionsCreated, errors };
  });
