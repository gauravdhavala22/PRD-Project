import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, FolderKanban, Folder, Search } from "lucide-react";
import { toast } from "sonner";
import { listDriveFolders } from "@/lib/drive.functions";

export const Route = createFileRoute("/_authenticated/projects/")({
  component: ProjectsPage,
});

function ProjectsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const listFolders = useServerFn(listDriveFolders);

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, description, created_at, drive_folder_name")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const folders = useQuery({
    queryKey: ["drive-folders", search],
    queryFn: () => listFolders({ data: { search } }),
    enabled: open,
  });

  const createProject = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await supabase.from("projects").insert({
        user_id: u.user.id,
        name: name.trim(),
        description: description.trim() || null,
        drive_folder_id: folderId,
        drive_folder_name: folderName,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Project created");
      setOpen(false);
      setName(""); setDescription(""); setFolderId(null); setFolderName(null); setSearch("");
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 bg-clip-text text-transparent">
            Projects
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Group meeting notes by initiative.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-indigo-500 to-violet-500 hover:opacity-90 text-white border-0 shadow-lg shadow-violet-400/20"><Plus className="h-4 w-4 mr-1" /> New project</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New project</DialogTitle>
              <DialogDescription>Name your project and optionally link a Google Drive folder.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="p-name">Name</Label>
                <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mobile App Redesign" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-desc">Description (optional)</Label>
                <Textarea id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Google Drive folder (optional)</Label>
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Search your Drive folders..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-48 overflow-y-auto rounded-md border divide-y">
                  {folders.isLoading ? (
                    <div className="p-3 text-xs text-muted-foreground">Loading folders…</div>
                  ) : folders.error ? (
                    <div className="p-3 text-xs text-destructive">{(folders.error as Error).message}</div>
                  ) : (folders.data?.folders.length ?? 0) === 0 ? (
                    <div className="p-3 text-xs text-muted-foreground">No folders found.</div>
                  ) : (
                    folders.data!.folders.map((f) => {
                      const selected = folderId === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => {
                            if (selected) { setFolderId(null); setFolderName(null); }
                            else { setFolderId(f.id); setFolderName(f.name); }
                          }}
                          className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-accent ${selected ? "bg-accent" : ""}`}
                        >
                          <Folder className="h-4 w-4 text-muted-foreground" />
                          <span className="truncate">{f.name}</span>
                        </button>
                      );
                    })
                  )}
                </div>
                {folderName && (
                  <p className="text-xs text-muted-foreground">Selected: <span className="font-medium">{folderName}</span></p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => createProject.mutate()} disabled={!name.trim() || createProject.isPending}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {projects && projects.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FolderKanban className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">No projects yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects?.map((p, i) => {
            const gradients = [
              "from-indigo-400 to-violet-400",
              "from-sky-400 to-cyan-400",
              "from-amber-400 to-rose-400",
              "from-emerald-400 to-teal-400",
              "from-fuchsia-400 to-pink-400",
              "from-violet-400 to-purple-400",
            ];
            const g = gradients[i % gradients.length];
            return (
              <Link key={p.id} to="/projects/$projectId" params={{ projectId: p.id }} className="group">
                <Card className="relative overflow-hidden border-transparent ring-1 ring-border/60 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:ring-violet-500/30">
                  <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${g}`} />
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${g} text-white grid place-items-center font-semibold shadow-sm shrink-0`}>
                        {p.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium truncate group-hover:text-foreground">{p.name}</h3>
                        {p.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{p.description}</p>
                        )}
                      </div>
                    </div>
                    {p.drive_folder_name && (
                      <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                        <Folder className="h-3 w-3" /> {p.drive_folder_name}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(p.created_at).toLocaleDateString()}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
