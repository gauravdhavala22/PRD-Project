import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Check, Pencil, Trash2, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { listSyncableProjects, syncProjectDrive } from "@/lib/drive.functions";

type Decision = {
  id: string;
  title: string;
  description: string;
  decision_date: string | null;
  confidence: number;
  status: string;
  project_id: string;
  meeting_note_id: string | null;
};

export const Route = createFileRoute("/_authenticated/decisions")({
  validateSearch: (s: Record<string, unknown>) => ({
    projectId: typeof s.projectId === "string" ? s.projectId : undefined,
  }),
  component: DecisionsPage,
});

function StatCard({ label, value, gradient }: { label: string; value: number; gradient: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-transparent ring-1 ring-border/40 bg-card p-5 shadow-sm`}>
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${gradient}`} />
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 text-3xl font-bold tracking-tight">{value}</div>
    </div>
  );
}

function DecisionsPage() {
  const { projectId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("all");
  const [editing, setEditing] = useState<Decision | null>(null);

  const { data: projects } = useQuery({
    queryKey: ["projects-options"],
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: notesMap } = useQuery({
    queryKey: ["notes-titles"],
    queryFn: async () => {
      const { data } = await supabase.from("meeting_notes").select("id, title");
      const map: Record<string, string> = {};
      (data ?? []).forEach((n) => { map[n.id] = n.title; });
      return map;
    },
  });

  const { data: decisions } = useQuery({
    queryKey: ["decisions", projectId, filter],
    queryFn: async () => {
      let q = supabase.from("decisions").select("*").order("created_at", { ascending: false });
      if (projectId) q = q.eq("project_id", projectId);
      if (filter !== "all") q = q.eq("status", filter);
      const { data, error } = await q;
      if (error) throw error;
      return data as Decision[];
    },
  });

  const update = useMutation({
    mutationFn: async (d: Partial<Decision> & { id: string }) => {
      const { error } = await supabase.from("decisions").update(d).eq("id", d.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["decisions"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("decisions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["decisions"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Decision deleted");
    },
  });

  const projectName = projects?.find((p) => p.id === projectId)?.name;

  const listProjectsFn = useServerFn(listSyncableProjects);
  const syncOneFn = useServerFn(syncProjectDrive);
  const sync = useMutation({
    mutationFn: async () => {
      const { projects: list } = await listProjectsFn({ data: undefined as never });
      let notesImported = 0;
      let decisionsCreated = 0;
      const errors: string[] = [];
      for (const p of list) {
        try {
          const res = await syncOneFn({ data: { projectId: p.id } });
          notesImported += res.notesImported;
          decisionsCreated += res.decisionsCreated;
          for (const e of res.errors) errors.push(`${p.name}: ${e}`);
        } catch (err) {
          errors.push(`${p.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      return { projectsScanned: list.length, notesImported, decisionsCreated, errors };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["decisions"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["notes-titles"] });
      const parts = [
        `${res.projectsScanned} project${res.projectsScanned === 1 ? "" : "s"} scanned`,
        `${res.notesImported} new note${res.notesImported === 1 ? "" : "s"}`,
        `${res.decisionsCreated} decision${res.decisionsCreated === 1 ? "" : "s"} added`,
      ];
      toast.success(parts.join(" · "));
      if (res.errors.length > 0) {
        toast.warning(`${res.errors.length} issue${res.errors.length === 1 ? "" : "s"}: ${res.errors[0]}`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadCsv = () => {
    if (!decisions || decisions.length === 0) {
      toast.error("No decisions to export");
      return;
    }
    const headers = ["Title", "Description", "Status", "Confidence", "Decision Date", "Source Note"];
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = decisions.map((d) => [
      d.title,
      d.description,
      d.status,
      `${(d.confidence * 100).toFixed(0)}%`,
      d.decision_date ?? "",
      (d.meeting_note_id && notesMap?.[d.meeting_note_id]) || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map(escape).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `decision-log-${projectName ?? "all"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight bg-gradient-to-r from-amber-500 via-rose-500 to-fuchsia-500 bg-clip-text text-transparent">
            Decision Log
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {projectName ? `Project: ${projectName}` : "All projects"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${sync.isPending ? "animate-spin" : ""}`} />
            {sync.isPending ? "Syncing…" : "Sync now"}
          </Button>
          <Button variant="outline" size="sm" onClick={downloadCsv}>
            <Download className="h-4 w-4 mr-1" /> Download CSV
          </Button>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {decisions && decisions.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">
          No decisions yet. Generate a PRD to extract decisions from your notes.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {decisions?.map((d) => (
            <Card key={d.id}>
              <CardHeader className="pb-2 flex flex-row items-start justify-between space-y-0">
                <div className="flex-1 min-w-0">
                  <CardTitle className="tracking-tight text-lg font-semibold bg-gradient-to-r from-amber-500 via-rose-500 to-fuchsia-500 bg-clip-text text-slate-700 bg-slate-800">
                    {d.title}
                  </CardTitle>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    <Badge variant={d.status === "approved" ? "default" : "secondary"}>{d.status}</Badge>
                    <Badge variant="outline">conf {(d.confidence * 100).toFixed(0)}%</Badge>
                    {d.decision_date && <Badge variant="outline">{d.decision_date}</Badge>}
                  </div>
                </div>
                <div className="flex gap-1">
                  {d.status !== "approved" && (
                    <Button size="sm" variant="outline" onClick={() => update.mutate({ id: d.id, status: "approved" })}>
                      <Check className="h-4 w-4 mr-1" /> Approve
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => setEditing(d)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove.mutate(d.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{d.description}</p>
                {d.meeting_note_id && notesMap?.[d.meeting_note_id] && (
                  <div className="mt-4 pt-3 border-t flex items-center gap-2">
                    <Badge variant="outline" className="bg-muted/50">
                      source: {notesMap[d.meeting_note_id]}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit decision</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              <Textarea
                rows={5}
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
              <Input
                type="date"
                value={editing.decision_date ?? ""}
                onChange={(e) => setEditing({ ...editing, decision_date: e.target.value || null })}
              />
              <Input
                type="number" step="0.05" min="0" max="1"
                value={editing.confidence}
                onChange={(e) => setEditing({ ...editing, confidence: Number(e.target.value) })}
              />
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => editing && update.mutate({
              id: editing.id,
              title: editing.title,
              description: editing.description,
              decision_date: editing.decision_date,
              confidence: editing.confidence,
            })}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
