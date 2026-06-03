import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/projects/$projectId/prd/$prdId")({
  component: PrdViewer,
});

type Content = {
  executive_summary: string;
  problem_statement: string;
  business_goals: string[];
  functional_requirements: string[];
  user_stories: string[];
  acceptance_criteria: string[];
  risks: string[];
  assumptions: string[];
  open_questions: string[];
};

const sections: { key: keyof Content; label: string }[] = [
  { key: "executive_summary", label: "Executive Summary" },
  { key: "problem_statement", label: "Problem Statement" },
  { key: "business_goals", label: "Business Goals" },
  { key: "functional_requirements", label: "Functional Requirements" },
  { key: "user_stories", label: "User Stories" },
  { key: "acceptance_criteria", label: "Acceptance Criteria" },
  { key: "risks", label: "Risks" },
  { key: "assumptions", label: "Assumptions" },
  { key: "open_questions", label: "Open Questions" },
];

function PrdViewer() {
  const { projectId, prdId } = Route.useParams();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState<Content | null>(null);
  const [status, setStatus] = useState("draft");
  const [sources, setSources] = useState<{ id: string; title: string }[]>([]);

  const { data } = useQuery({
    queryKey: ["prd", prdId],
    queryFn: async () => {
      const { data, error } = await supabase.from("prds").select("*").eq("id", prdId).single();
      if (error) throw error;
      const { data: notes } = await supabase
        .from("meeting_notes")
        .select("id, title")
        .in("id", data.source_note_ids ?? []);
      return { prd: data, notes: notes ?? [] };
    },
  });

  useEffect(() => {
    if (data) {
      setTitle(data.prd.title);
      setContent(data.prd.content as Content);
      setStatus(data.prd.status);
      setSources(data.notes);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("prds")
        .update({ title, content: content as object, status, updated_at: new Date().toISOString() })
        .eq("id", prdId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("PRD saved");
      qc.invalidateQueries({ queryKey: ["prd", prdId] });
      qc.invalidateQueries({ queryKey: ["prds", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!content) return <div className="p-8">Loading...</div>;

  const update = (key: keyof Content, value: string | string[]) =>
    setContent({ ...content, [key]: value } as Content);

  return (
    <div className="p-8 max-w-4xl">
      <Link to="/projects/$projectId" params={{ projectId }} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3">
        <ArrowLeft className="h-3 w-3" /> Back to project
      </Link>
      <div className="flex items-start gap-4 mb-6">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-xl font-semibold" />
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
      </div>

      {sources.length > 0 && (
        <div className="mb-6">
          <div className="text-xs uppercase text-muted-foreground mb-2">Source meeting notes</div>
          <div className="flex flex-wrap gap-2">
            {sources.map((s) => (
              <Badge key={s.id} variant="secondary">{s.title}</Badge>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-5">
        {sections.map(({ key, label }) => {
          const value = content[key];
          const isArray = Array.isArray(value);
          return (
            <Card key={key}>
              <CardHeader className="pb-2"><CardTitle className="text-base">{label}</CardTitle></CardHeader>
              <CardContent>
                {isArray ? (
                  <Textarea
                    rows={Math.max(3, value.length + 1)}
                    value={value.join("\n")}
                    onChange={(e) => update(key, e.target.value.split("\n").filter(Boolean))}
                    placeholder="One item per line"
                  />
                ) : (
                  <Textarea
                    rows={4}
                    value={value as string}
                    onChange={(e) => update(key, e.target.value)}
                  />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
