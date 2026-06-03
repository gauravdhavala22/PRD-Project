import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, FileText, Sparkles, Trash2, ArrowLeft, Folder, Download } from "lucide-react";
import { toast } from "sonner";
import { generatePrdFromNotes } from "@/lib/ai.functions";
import { listDocsInFolder, importDriveDocs } from "@/lib/drive.functions";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  component: ProjectDetail,
});

function ProjectDetail() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openAdd, setOpenAdd] = useState(false);
  const [openImport, setOpenImport] = useState(false);
  const [pickedDocs, setPickedDocs] = useState<Set<string>>(new Set());
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const generateFn = useServerFn(generatePrdFromNotes);
  const listDocsFn = useServerFn(listDocsInFolder);
  const importFn = useServerFn(importDriveDocs);

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", projectId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: notes } = useQuery({
    queryKey: ["notes", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meeting_notes")
        .select("id, title, content, imported_at, source")
        .eq("project_id", projectId)
        .order("imported_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: prds } = useQuery({
    queryKey: ["prds", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prds")
        .select("id, title, status, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const addNote = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await supabase.from("meeting_notes").insert({
        project_id: projectId,
        user_id: u.user.id,
        title: noteTitle.trim(),
        content: noteContent,
        source: "manual",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Note added");
      setOpenAdd(false); setNoteTitle(""); setNoteContent("");
      qc.invalidateQueries({ queryKey: ["notes", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteNote = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("meeting_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes", projectId] }),
  });

  const generate = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      if (ids.length === 0) throw new Error("Select at least one note");
      return await generateFn({ data: { projectId, noteIds: ids } });
    },
    onSuccess: (res) => {
      if (res.error || !res.prdId) {
        toast.error(res.error || "PRD generation failed");
        return;
      }
      toast.success(`PRD generated · ${res.decisionsCount} decision(s) extracted`);
      qc.invalidateQueries({ queryKey: ["prds", projectId] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      navigate({ to: "/projects/$projectId/prd/$prdId", params: { projectId, prdId: res.prdId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const driveDocs = useQuery({
    queryKey: ["drive-docs", project?.drive_folder_id],
    queryFn: () => listDocsFn({ data: { folderId: project!.drive_folder_id! } }),
    enabled: openImport && !!project?.drive_folder_id,
  });

  const importDocs = useMutation({
    mutationFn: async () => {
      const docs = (driveDocs.data?.docs ?? []).filter((d) => pickedDocs.has(d.id));
      if (docs.length === 0) throw new Error("Pick at least one document");
      return await importFn({ data: { projectId, docs } });
    },
    onSuccess: (res) => {
      toast.success(`Imported ${res.imported} doc(s)${res.skipped ? ` · ${res.skipped} skipped (already imported)` : ""}`);
      setOpenImport(false);
      setPickedDocs(new Set());
      qc.invalidateQueries({ queryKey: ["notes", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };
  const toggleDoc = (id: string) => {
    const next = new Set(pickedDocs);
    next.has(id) ? next.delete(id) : next.add(id);
    setPickedDocs(next);
  };

  return (
    <div className="p-8 max-w-6xl">
      <Link to="/projects" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3">
        <ArrowLeft className="h-3 w-3" /> Projects
      </Link>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{project?.name}</h1>
          {project?.description && <p className="text-sm text-muted-foreground mt-1">{project.description}</p>}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/decisions" search={{ projectId } as never}>View decisions</Link>
          </Button>
          <Button
            onClick={() => generate.mutate()}
            disabled={selected.size === 0 || generate.isPending}
          >
            <Sparkles className="h-4 w-4 mr-1" />
            {generate.isPending ? "Generating..." : `Generate PRD${selected.size ? ` (${selected.size})` : ""}`}
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Meeting notes</CardTitle>
              {project?.drive_folder_name && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Folder className="h-3 w-3" /> {project.drive_folder_name}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {project?.drive_folder_id && (
                <Dialog open={openImport} onOpenChange={(o) => { setOpenImport(o); if (!o) setPickedDocs(new Set()); }}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline"><Download className="h-4 w-4 mr-1" /> Import from Drive</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl flex flex-col max-h-[85vh]">
                    <DialogHeader>
                      <DialogTitle>Import from Google Drive</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 flex-1 min-h-0 flex flex-col">
                      <p className="text-xs text-muted-foreground">
                        Google Docs in <span className="font-medium">{project.drive_folder_name}</span>.
                      </p>
                      <div className="flex-1 min-h-0 overflow-y-auto rounded-md border divide-y">
                        {driveDocs.isLoading ? (
                          <div className="p-4 text-sm text-muted-foreground">Loading documents…</div>
                        ) : driveDocs.error ? (
                          <div className="p-4 text-sm text-destructive">{(driveDocs.error as Error).message}</div>
                        ) : (driveDocs.data?.docs.length ?? 0) === 0 ? (
                          <div className="p-4 text-sm text-muted-foreground">No Google Docs in this folder.</div>
                        ) : (
                          driveDocs.data!.docs.map((d) => (
                            <label key={d.id} className="flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer">
                              <Checkbox checked={pickedDocs.has(d.id)} onCheckedChange={() => toggleDoc(d.id)} />
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm truncate">{d.name}</div>
                                {d.modifiedTime && (
                                  <div className="text-[11px] text-muted-foreground">
                                    {new Date(d.modifiedTime).toLocaleString()}
                                  </div>
                                )}
                              </div>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={() => importDocs.mutate()} disabled={pickedDocs.size === 0 || importDocs.isPending}>
                        {importDocs.isPending ? "Importing..." : `Import ${pickedDocs.size || ""}`}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
              <Dialog open={openAdd} onOpenChange={setOpenAdd}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" /> Add note</Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader><DialogTitle>Add meeting note</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="n-title">Title</Label>
                      <Input id="n-title" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="Kickoff meeting 2026-06-01" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="n-content">Notes content</Label>
                      <Textarea
                        id="n-content"
                        rows={14}
                        value={noteContent}
                        onChange={(e) => setNoteContent(e.target.value)}
                        placeholder="Paste meeting notes here..."
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={() => addNote.mutate()} disabled={!noteTitle.trim() || !noteContent.trim() || addNote.isPending}>
                      Save
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {notes && notes.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No notes yet. Add one to generate a PRD.
              </p>
            ) : (
              <ul className="divide-y">
                {notes?.map((n) => (
                  <li key={n.id} className="py-3 flex items-start gap-3">
                    <Checkbox
                      checked={selected.has(n.id)}
                      onCheckedChange={() => toggle(n.id)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{n.title}</div>
                      <div className="text-xs text-muted-foreground line-clamp-2">{n.content.slice(0, 200)}</div>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {new Date(n.imported_at).toLocaleString()} · {n.source}
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => deleteNote.mutate(n.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">PRDs</CardTitle></CardHeader>
          <CardContent>
            {prds && prds.length === 0 ? (
              <p className="text-sm text-muted-foreground">No PRDs yet.</p>
            ) : (
              <ul className="divide-y">
                {prds?.map((p) => (
                  <li key={p.id} className="py-2">
                    <Link
                      to="/projects/$projectId/prd/$prdId"
                      params={{ projectId, prdId: p.id }}
                      className="flex items-start gap-2 hover:bg-accent rounded p-1.5 -m-1.5"
                    >
                      <FileText className="h-4 w-4 mt-0.5 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium">{p.title}</div>
                        <div className="text-[11px] text-muted-foreground">{new Date(p.created_at).toLocaleDateString()} · {p.status}</div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
