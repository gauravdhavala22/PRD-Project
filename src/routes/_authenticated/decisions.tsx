import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation, useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Check, Pencil, Trash2, Download, RefreshCw, Search, ChevronDown, ChevronRight, FolderOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { listSyncableProjects, syncProjectDrive } from "@/lib/drive.functions";

type Decision = {
  id: string;
  title: string;
  description: string;
  decision_date: string | null;
  created_at: string;
  confidence: number;
  status: string;
  category: string;
  project_id: string;
  meeting_note_id: string | null;
};

const PAGE_SIZE = 10;

const CATEGORIES = ["Product & Business", "Technical", "Process", "Uncategorized"] as const;
const CATEGORY_STYLES: Record<string, string> = {
  "Product & Business": "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
  Technical: "bg-sky-100 text-sky-700 border-sky-200",
  Process: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Uncategorized: "bg-muted text-muted-foreground",
};

type Filters = {
  projectId?: string;
  status: string;
  category: string;
  search: string;
};

function sanitizeIlike(input: string) {
  // Strip PostgREST filter delimiters and ilike wildcards so user input
  // can't broaden the search or break the .or() expression.
  return input.replace(/[%_\\,():*]/g, " ").trim();
}

function buildBaseQuery(filters: Filters) {
  let q = supabase.from("decisions").select("*", { count: "exact" }).order("created_at", { ascending: false });
  if (filters.projectId) q = q.eq("project_id", filters.projectId);
  if (filters.status !== "all") q = q.eq("status", filters.status);
  if (filters.category !== "all") q = q.eq("category", filters.category);
  if (filters.search) {
    const escaped = sanitizeIlike(filters.search);
    if (escaped) q = q.or(`title.ilike.%${escaped}%,description.ilike.%${escaped}%`);
  }
  return q;
}

export const Route = createFileRoute("/_authenticated/decisions")({
  validateSearch: (s: Record<string, unknown>) => ({
    projectId: typeof s.projectId === "string" ? s.projectId : undefined,
  }),
  component: DecisionsPage,
});

function DecisionsPage() {
  const { projectId } = Route.useSearch();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const [editing, setEditing] = useState<Decision | null>(null);
  const [selected, setSelected] = useState<Decision | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const filters: Filters = { projectId, status: filter, category: categoryFilter, search: debouncedSearch };

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

  // Lightweight query: project_ids matching filters, used to build groups + counts.
  const { data: projectGroups } = useQuery({
    queryKey: ["decision-projects", projectId, filter, categoryFilter, debouncedSearch],
    queryFn: async () => {
      let q = supabase.from("decisions").select("project_id");
      if (projectId) q = q.eq("project_id", projectId);
      if (filter !== "all") q = q.eq("status", filter);
      if (categoryFilter !== "all") q = q.eq("category", categoryFilter);
      if (debouncedSearch) {
        const escaped = debouncedSearch.replace(/[%,()]/g, " ");
        q = q.or(`title.ilike.%${escaped}%,description.ilike.%${escaped}%`);
      }
      const { data, error } = await q.limit(10000);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((row: { project_id: string }) => {
        counts[row.project_id] = (counts[row.project_id] ?? 0) + 1;
      });
      return counts;
    },
  });

  const update = useMutation({
    mutationFn: async (d: Partial<Decision> & { id: string }) => {
      const { error } = await supabase.from("decisions").update(d).eq("id", d.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["decision-projects"] });
      qc.invalidateQueries({ queryKey: ["project-decisions"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setEditing(null);
      setSelected((s) => (s && s.id === vars.id ? { ...s, ...vars } as Decision : s));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("decisions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["decision-projects"] });
      qc.invalidateQueries({ queryKey: ["project-decisions"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setSelected((s) => (s && s.id === id ? null : s));
      toast.success("Decision deleted");
    },
  });

  const projectName = projects?.find((p) => p.id === projectId)?.name;
  const projectNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    (projects ?? []).forEach((p) => { m[p.id] = p.name; });
    return m;
  }, [projects]);

  const grouped = useMemo(() => {
    const entries = Object.entries(projectGroups ?? {});
    return entries.sort(([a], [b]) =>
      (projectNameMap[a] ?? "").localeCompare(projectNameMap[b] ?? ""),
    );
  }, [projectGroups, projectNameMap]);

  const totalDecisions = useMemo(
    () => grouped.reduce((sum, [, n]) => sum + n, 0),
    [grouped],
  );

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
      qc.invalidateQueries({ queryKey: ["decision-projects"] });
      qc.invalidateQueries({ queryKey: ["project-decisions"] });
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

  const downloadCsv = async () => {
    const { data, error } = await buildBaseQuery(filters).limit(10000);
    if (error) {
      toast.error(error.message);
      return;
    }
    const rowsData = (data ?? []) as Decision[];
    if (rowsData.length === 0) {
      toast.error("No decisions to export");
      return;
    }
    const headers = ["Project", "Title", "Description", "Category", "Status", "Confidence", "Decision Date", "Source Note"];
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = rowsData.map((d) => [
      projectNameMap[d.project_id] ?? "",
      d.title,
      d.description,
      d.category || "Uncategorized",
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

  const toggleGroup = (id: string) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));
  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    grouped.forEach(([id]) => { next[id] = true; });
    setCollapsed(next);
  };
  const expandAll = () => setCollapsed({});

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight bg-gradient-to-r from-amber-500 via-rose-500 to-fuchsia-500 bg-clip-text text-transparent">
            Decision Log
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {projectName ? `Project: ${projectName}` : "All projects"}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
            <RefreshCw className={`h-4 w-4 mr-1 ${sync.isPending ? "animate-spin" : ""}`} />
            {sync.isPending ? "Syncing…" : "Sync now"}
          </Button>
          <Button variant="outline" size="sm" onClick={downloadCsv}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>
      </div>

      {/* Sticky toolbar */}
      <div className="sticky top-0 z-10 -mx-2 px-2 py-3 mb-4 bg-background/80 backdrop-blur border-b">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search title or description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
            </SelectContent>
          </Select>
          {grouped.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const allCollapsed = grouped.every(([id]) => collapsed[id]);
                if (allCollapsed) expandAll();
                else collapseAll();
              }}
            >
              {grouped.every(([id]) => collapsed[id]) ? "Expand all" : "Collapse all"}
            </Button>
          )}
        </div>
        {totalDecisions > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            {totalDecisions} decision{totalDecisions === 1 ? "" : "s"} across {grouped.length} project{grouped.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {/* Project jump-chips */}
      {grouped.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {grouped.map(([pid, count]) => (
            <a
              key={pid}
              href={`#proj-${pid}`}
              className="text-xs px-2.5 py-1 rounded-full border bg-muted/40 hover:bg-muted transition"
            >
              {projectNameMap[pid] ?? "Untitled"} <span className="text-muted-foreground">· {count}</span>
            </a>
          ))}
        </div>
      )}

      {grouped.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">
          {projectGroups && Object.keys(projectGroups).length === 0
            ? (debouncedSearch || filter !== "all" || categoryFilter !== "all"
                ? "No decisions match your search."
                : "No decisions yet. Generate a PRD to extract decisions from your notes.")
            : "Loading…"}
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(([pid, count]) => (
            <ProjectGroup
              key={pid}
              projectId={pid}
              projectName={projectNameMap[pid] ?? "Untitled project"}
              total={count}
              filters={filters}
              isOpen={!collapsed[pid]}
              onToggle={() => toggleGroup(pid)}
              selectedId={selected?.id}
              onSelect={setSelected}
            />
          ))}
        </div>
      )}

      {/* Detail drawer */}
      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="pr-6">{selected.title}</SheetTitle>
                <SheetDescription>
                  {projectNameMap[selected.project_id] ?? "Untitled project"}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={CATEGORY_STYLES[selected.category] ?? CATEGORY_STYLES.Uncategorized}>
                    {selected.category || "Uncategorized"}
                  </Badge>
                  <Badge variant={selected.status === "approved" ? "default" : "secondary"}>{selected.status}</Badge>
                  <Badge variant="outline">conf {(selected.confidence * 100).toFixed(0)}%</Badge>
                  {selected.decision_date && <Badge variant="outline">{selected.decision_date}</Badge>}
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Description</h4>
                  <p className="text-sm whitespace-pre-wrap">{selected.description}</p>
                </div>

                {selected.meeting_note_id && notesMap?.[selected.meeting_note_id] && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Source</h4>
                    <Badge variant="outline" className="bg-muted/50">
                      {notesMap[selected.meeting_note_id]}
                    </Badge>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-4 border-t">
                  {selected.status !== "approved" && (
                    <Button size="sm" onClick={() => update.mutate({ id: selected.id, status: "approved" })}>
                      <Check className="h-4 w-4 mr-1" /> Approve
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setEditing(selected)}>
                    <Pencil className="h-4 w-4 mr-1" /> Edit
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => remove.mutate(selected.id)}>
                    <Trash2 className="h-4 w-4 mr-1" /> Delete
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

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

function ProjectGroup({
  projectId, projectName, total, filters, isOpen, onToggle, selectedId, onSelect,
}: {
  projectId: string;
  projectName: string;
  total: number;
  filters: Filters;
  isOpen: boolean;
  onToggle: () => void;
  selectedId?: string;
  onSelect: (d: Decision) => void;
}) {
  const groupFilters: Filters = { ...filters, projectId };
  const infinite = useInfiniteQuery({
    queryKey: ["project-decisions", projectId, filters.status, filters.category, filters.search],
    enabled: isOpen,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = (pageParam as number) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await buildBaseQuery(groupFilters).range(from, to);
      if (error) throw error;
      return (data ?? []) as Decision[];
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.length;
    },
  });

  const rows = useMemo(
    () => (infinite.data?.pages ?? []).flat(),
    [infinite.data],
  );

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && infinite.hasNextPage && !infinite.isFetchingNextPage) {
        infinite.fetchNextPage();
      }
    }, { rootMargin: "200px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [isOpen, infinite.hasNextPage, infinite.isFetchingNextPage, infinite]);

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <div id={`proj-${projectId}`} className="scroll-mt-24">
        <CollapsibleTrigger className="w-full flex items-center gap-2 py-2 px-3 rounded-md hover:bg-muted/50 transition group">
          {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">{projectName}</span>
          <Badge variant="secondary" className="ml-1">{total}</Badge>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 space-y-2 pl-2 border-l-2 border-muted ml-2 max-h-[520px] overflow-y-auto pr-2">
            {rows.map((d) => {
              const dateValue = d.decision_date ?? d.created_at.slice(0, 10);
              const dateLabel = d.decision_date ? new Date(d.decision_date).toLocaleDateString() : new Date(d.created_at).toLocaleDateString();
              return (
                <button
                  key={d.id}
                  onClick={() => onSelect(d)}
                  className={`w-full text-left rounded-md border bg-card hover:border-primary/50 hover:shadow-sm transition p-3 ${
                    selectedId === d.id ? "border-primary ring-1 ring-primary/20" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-sm truncate">{d.title}</div>
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0" title={dateValue}>
                          {dateLabel}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{d.description}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <Badge variant="outline" className={`text-[10px] ${CATEGORY_STYLES[d.category] ?? CATEGORY_STYLES.Uncategorized}`}>
                          {d.category || "Uncategorized"}
                        </Badge>
                        <Badge variant={d.status === "approved" ? "default" : "secondary"} className="text-[10px]">{d.status}</Badge>
                        <Badge variant="outline" className="text-[10px]">conf {(d.confidence * 100).toFixed(0)}%</Badge>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}

            {/* Sentinel + status */}
            <div ref={sentinelRef} className="py-2 text-center text-xs text-muted-foreground">
              {infinite.isFetching && (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                </span>
              )}
              {!infinite.isFetching && infinite.hasNextPage && (
                <Button size="sm" variant="ghost" onClick={() => infinite.fetchNextPage()}>
                  Load more
                </Button>
              )}
              {!infinite.hasNextPage && rows.length > 0 && rows.length >= PAGE_SIZE && (
                <span>All {rows.length} loaded</span>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
