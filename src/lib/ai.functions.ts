import { createServerFn } from "@tanstack/react-start";
import { generateObject } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const ExtractionSchema = z.object({
  executive_summary: z.string(),
  problem_statement: z.string(),
  business_goals: z.array(z.string()),
  functional_requirements: z.array(z.string()),
  user_stories: z.array(z.string()),
  acceptance_criteria: z.array(z.string()),
  risks: z.array(z.string()),
  assumptions: z.array(z.string()),
  open_questions: z.array(z.string()),
  decisions: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      decision_date: z.string().optional(),
      confidence: z.number().min(0).max(1),
      source_note_id: z.string(),
    }),
  ),
});

type Extraction = z.infer<typeof ExtractionSchema>;

export const generatePrdFromNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      projectId: z.string().uuid(),
      noteIds: z.array(z.string().uuid()).min(1).max(20),
      title: z.string().min(1).max(200).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("id, name")
      .eq("id", data.projectId)
      .single();
    if (projErr || !project) throw new Error("Project not found");

    const { data: notes, error: notesErr } = await supabase
      .from("meeting_notes")
      .select("id, title, content, doc_modified_at")
      .in("id", data.noteIds);
    if (notesErr || !notes || notes.length === 0) throw new Error("No notes found");

    const notesPayload = notes
      .map(
        (n) =>
          `=== NOTE id=${n.id} title="${n.title}" ===\n${(n.content || "").slice(0, 12000)}`,
      )
      .join("\n\n");

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");

    const { experimental_output: output } = await generateText({
      model,
      experimental_output: Output.object({ schema: ExtractionSchema }),
      system:
        "You are a senior business analyst. From meeting notes, extract structured PRD content. " +
        "For every decision include the source_note_id (use the exact id shown in the NOTE header). " +
        "Be concise but specific. Confidence reflects how clearly the decision is stated (0-1).",
      prompt: `Project: ${project.name}\n\nMeeting notes:\n${notesPayload}\n\nProduce a complete PRD plus a list of decisions extracted from these notes.`,
    });

    // Persist PRD
    const { data: prd, error: prdErr } = await supabase
      .from("prds")
      .insert({
        project_id: data.projectId,
        user_id: userId,
        title: data.title || `${project.name} PRD`,
        status: "draft",
        content: {
          executive_summary: output.executive_summary,
          problem_statement: output.problem_statement,
          business_goals: output.business_goals,
          functional_requirements: output.functional_requirements,
          user_stories: output.user_stories,
          acceptance_criteria: output.acceptance_criteria,
          risks: output.risks,
          assumptions: output.assumptions,
          open_questions: output.open_questions,
        },
        source_note_ids: data.noteIds,
      })
      .select("id")
      .single();
    if (prdErr || !prd) throw new Error(prdErr?.message || "Failed to save PRD");

    // Persist decisions
    if (output.decisions.length > 0) {
      const decisionRows = output.decisions.map((d) => ({
        project_id: data.projectId,
        user_id: userId,
        meeting_note_id: data.noteIds.includes(d.source_note_id) ? d.source_note_id : null,
        title: d.title.slice(0, 200),
        description: d.description,
        decision_date: d.decision_date && /^\d{4}-\d{2}-\d{2}/.test(d.decision_date)
          ? d.decision_date.slice(0, 10)
          : null,
        confidence: Math.max(0, Math.min(1, d.confidence)),
        status: "pending",
      }));
      await supabase.from("decisions").insert(decisionRows);
    }

    return { prdId: prd.id, decisionsCount: output.decisions.length };
  });
