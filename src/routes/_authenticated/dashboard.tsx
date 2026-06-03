import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FolderKanban, FileText, GitCommit, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { data } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [{ count: projects }, { count: prds }, { count: pending }, { data: recent }] = await Promise.all([
        supabase.from("projects").select("*", { count: "exact", head: true }),
        supabase.from("prds").select("*", { count: "exact", head: true }),
        supabase.from("decisions").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("projects").select("id, name, created_at").order("created_at", { ascending: false }).limit(5),
      ]);
      return { projects: projects ?? 0, prds: prds ?? 0, pending: pending ?? 0, recent: recent ?? [] };
    },
  });

  const stats = [
    { label: "Projects", value: data?.projects ?? 0, icon: FolderKanban },
    { label: "PRDs", value: data?.prds ?? 0, icon: FileText },
    { label: "Pending decisions", value: data?.pending ?? 0, icon: GitCommit },
  ];

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Overview of your projects and PRDs.</p>
        </div>
        <Button asChild><Link to="/projects"><Plus className="h-4 w-4 mr-1" /> New project</Link></Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Recent projects</CardTitle></CardHeader>
        <CardContent>
          {data?.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects yet. Create one to get started.</p>
          ) : (
            <ul className="divide-y">
              {data?.recent.map((p) => (
                <li key={p.id} className="py-2.5 flex items-center justify-between">
                  <Link to="/projects/$projectId" params={{ projectId: p.id }} className="text-sm font-medium hover:underline">
                    {p.name}
                  </Link>
                  <span className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
