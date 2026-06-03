import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FolderKanban, FileText, GitCommit, Plus, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

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
    {
      label: "Projects",
      value: data?.projects ?? 0,
      icon: FolderKanban,
      to: "/projects" as const,
      search: undefined,
      gradient: "from-indigo-500 to-violet-500",
      ring: "ring-indigo-500/20",
      iconBg: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
      hint: "Browse all projects",
    },
    {
      label: "PRDs",
      value: data?.prds ?? 0,
      icon: FileText,
      to: "/projects" as const,
      search: undefined,
      gradient: "from-sky-500 to-cyan-500",
      ring: "ring-sky-500/20",
      iconBg: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
      hint: "Open a project to view its PRDs",
    },
    {
      label: "Pending decisions",
      value: data?.pending ?? 0,
      icon: GitCommit,
      to: "/decisions" as const,
      search: undefined,
      gradient: "from-amber-500 to-rose-500",
      ring: "ring-amber-500/20",
      iconBg: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
      hint: "Review pending decisions",
    },
  ];

  return (
    <div className="relative min-h-screen">
      {/* Decorative gradient background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-32 -left-24 h-80 w-80 rounded-full bg-indigo-400/20 blur-3xl" />
        <div className="absolute -top-24 right-0 h-72 w-72 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="absolute top-1/3 left-1/2 h-72 w-72 rounded-full bg-rose-400/10 blur-3xl" />
      </div>

      <div className="p-8 max-w-6xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-600 bg-clip-text text-transparent">
              Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Overview of your projects and PRDs.
            </p>
          </div>
          <Button asChild className="shadow-lg shadow-indigo-500/20 bg-gradient-to-r from-indigo-600 to-violet-600 hover:opacity-90 text-white border-0">
            <Link to="/projects">
              <Plus className="h-4 w-4 mr-1" /> New project
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 items-stretch">
          {stats.map((s) => (
            <Link
              key={s.label}
              to={s.to}
              className="group block focus:outline-none h-full"
            >
              <Card
                className={cn(
                  "relative overflow-hidden border-transparent ring-1 transition-all duration-300 h-full flex flex-col",
                  "hover:-translate-y-0.5 hover:shadow-xl",
                  s.ring,
                )}
              >
                {/* gradient top accent */}
                <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", s.gradient)} />
                {/* hover wash */}
                <div
                  className={cn(
                    "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br",
                    s.gradient,
                  )}
                  style={{ mixBlendMode: "overlay" }}
                />
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 gap-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground truncate">
                    {s.label}
                  </CardTitle>
                  <div className={cn("h-9 w-9 shrink-0 rounded-lg grid place-items-center", s.iconBg)}>
                    <s.icon className="h-4 w-4" />
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-between">
                  <div className="text-4xl font-bold tracking-tight leading-none">{s.value}</div>
                  <div className="mt-4 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{s.hint}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </CardContent>

              </Card>
            </Link>
          ))}
        </div>

        <Card className="border-transparent ring-1 ring-border/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Recent projects</CardTitle>
            <Link
              to="/projects"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {data?.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No projects yet. Create one to get started.
              </p>
            ) : (
              <ul className="divide-y">
                {data?.recent.map((p) => (
                  <li key={p.id}>
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: p.id }}
                      className="py-3 px-2 -mx-2 rounded-md flex items-center justify-between group hover:bg-accent/60 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 rounded-md bg-gradient-to-br from-indigo-500 to-violet-500 text-white grid place-items-center text-xs font-semibold shadow-sm">
                          {p.name.slice(0, 1).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium truncate group-hover:text-foreground">
                          {p.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">
                          {new Date(p.created_at).toLocaleDateString()}
                        </span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
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
