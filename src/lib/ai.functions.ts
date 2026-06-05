import { createServerFn } from "@tanstack/react-start";
import { generateObject, generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const DecisionSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  decision_date: z.string().optional(),
  confidence: z.number().optional(),
  source_note_id: z.string().optional(),
  category: z.enum(["Product & Business", "Technical", "Process"]),
});

const RawExtractionSchema = z.object({
  executive_summary: z.unknown().optional(),
  problem_statement: z.unknown().optional(),
  business_goals: z.unknown().optional(),
  functional_requirements: z.unknown().optional(),
  risks: z.unknown().optional(),
  assumptions: z.unknown().optional(),
  open_questions: z.unknown().optional(),
  decisions: z.array(DecisionSchema).optional(),
});

type Extraction = {
  executive_summary: string;
  problem_statement: string;
  business_goals: string[];
  functional_requirements: string[];
  risks: string[];
  assumptions: string[];
  open_questions: string[];
  decisions: Array<{
    title: string;
    description: string;
    decision_date?: string;
    confidence: number;
    source_note_id: string;
    category: string;
  }>;
};

const ALLOWED_CATEGORIES = ["Product & Business", "Technical", "Process"] as const;
const normalizeCategory = (value: unknown): string => {
  const text = toText(value).toLowerCase();
  const match = ALLOWED_CATEGORIES.find((c) => c.toLowerCase() === text);
  return match ?? "Uncategorized";
};

const toText = (value: unknown) => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
};

const toTextArray = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item : toText((item as { title?: unknown; description?: unknown })?.title) || toText((item as { description?: unknown })?.description)))
      .map((item) => item.replace(/^[-*•\d.)\s]+/, "").trim())
      .filter(Boolean);
  }
  const text = toText(value);
  return text
    ? text.split(/\n|;/).map((item) => item.replace(/^[-*•\d.)\s]+/, "").trim()).filter(Boolean)
    : [];
};

const normalizeExtraction = (raw: z.infer<typeof RawExtractionSchema>): Extraction => ({
  executive_summary: toText(raw.executive_summary),
  problem_statement: toText(raw.problem_statement),
  business_goals: toTextArray(raw.business_goals),
  functional_requirements: toTextArray(raw.functional_requirements),
  risks: toTextArray(raw.risks),
  assumptions: toTextArray(raw.assumptions),
  open_questions: toTextArray(raw.open_questions),
  decisions: Array.isArray(raw.decisions)
    ? raw.decisions.reduce<Extraction["decisions"]>((acc, item) => {
          const decision = item as Record<string, unknown>;
          const title = toText(decision.title) || toText(decision.description);
          if (!title) return acc;
          const confidence = Number(decision.confidence);
          acc.push({
            title,
            description: toText(decision.description),
            decision_date: toText(decision.decision_date) || undefined,
            confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
            source_note_id: toText(decision.source_note_id),
            category: normalizeCategory(decision.category),
          });
          return acc;
        }, [])
    : [],
});

const parseJsonObject = (text: string) => {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("AI response was not valid JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
};

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
          `=== NOTE id=${n.id} title="${n.title}" ===\n${n.content || ""}`,
      )
      .join("\n\n");

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");

    const systemPrompt =
      "You are a senior business analyst turning raw meeting notes into a comprehensive PRD. " +
      "Notes can arrive in ANY format: bullet points, transcripts, Gemini auto-notes, free prose, fragments, or even just chat logs. " +
      "Infer intent generously — paraphrase, group related ideas, and synthesize when content is implicit. " +
      "Be EXHAUSTIVE: capture every important point, requirement, goal, risk, assumption, story, and acceptance criterion present in the notes. Do NOT summarize away or drop details — prefer completeness over brevity. There is no length limit on any field; include as many list items and as much detail as the notes warrant. " +
      "Return a JSON object only, with keys: executive_summary, problem_statement, business_goals, functional_requirements, user_stories, acceptance_criteria, risks, assumptions, open_questions, decisions. " +
      "Use strings for summaries (write multi-paragraph prose when the notes support it) and arrays of strings for lists (include every distinct item — do not cap the count). If a section has no relevant content, return an empty array or empty string (never null). " +
      "For every decision include title, description, confidence, source_note_id using the exact id shown in the NOTE header, and category. " +
      "The category MUST be exactly one of: 'Product & Business' (features, scope, UX, user-facing behavior, pricing, GTM, partnerships, budget, strategy, monetization), 'Technical' (architecture, tools, stack, infra, implementation, data models, security), or 'Process' (timelines, ownership, workflow, meeting cadence, team operations, hiring, release process). Pick the single best fit. " +
      "Whenever the notes mention specific people tied to a decision (decision-maker, owner, who agreed), include their full names in the description (e.g. 'John Smith decided…', 'Agreed by Jane Doe and Alex Kim'). Use the exact names from the notes; if no person is named, omit names rather than guessing. " +
      "Omit decision_date entirely if no date is mentioned. Confidence (0-1) reflects how clearly the decision is stated.";

    let output: Extraction;
    try {
      const { object } = await generateObject({
        model,
        schema: RawExtractionSchema,
        maxOutputTokens: 32768,
        system: systemPrompt,
        prompt: `Project: ${project.name}\n\nMeeting notes (varied formats — extract whatever signal you can):\n${notesPayload}\n\nProduce the most complete and detailed PRD possible plus a full list of decisions. Capture every important point — do not omit details for brevity.`,
      });
      output = normalizeExtraction(object);
    } catch (error) {
      console.error("Structured PRD extraction failed, retrying as JSON text", error);
      try {
        const { text } = await generateText({
          model,
          maxOutputTokens: 32768,
          system: systemPrompt,
          prompt: `Project: ${project.name}\n\nMeeting notes:\n${notesPayload}\n\nReturn only the JSON object. No markdown, no commentary.`,
        });

        output = normalizeExtraction(RawExtractionSchema.parse(parseJsonObject(text)));
      } catch (fallbackError) {
        console.error("PRD extraction retry failed", fallbackError);
        return { prdId: null, decisionsCount: 0, error: "I couldn't turn these notes into a PRD yet. Try selecting fewer or more detailed notes." };
      }
    }

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
        category: d.category,
        status: "pending",
      }));
      await supabase.from("decisions").insert(decisionRows);
    }

    return { prdId: prd.id, decisionsCount: output.decisions.length, error: null };
  });
