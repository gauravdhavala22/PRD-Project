import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sparkles, FileText, GitCommit, FolderKanban } from "lucide-react";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "BA AI Assistant — Meeting notes to PRDs" },
      { name: "description", content: "Turn meeting notes into Product Requirement Documents with an auto-maintained Decision Log." },
      { property: "og:title", content: "BA AI Assistant" },
      { property: "og:description", content: "Turn meeting notes into PRDs with an auto-maintained Decision Log." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary text-primary-foreground grid place-items-center">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="font-semibold">BA AI Assistant</span>
          </div>
          <Button asChild size="sm"><Link to="/dashboard">Open app</Link></Button>
        </div>
      </header>
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <h1 className="text-5xl font-bold tracking-tight">
          Turn meeting notes into PRDs.
        </h1>
        <p className="mt-5 text-lg text-muted-foreground max-w-2xl mx-auto">
          The AI assistant for Business Analysts. Extract requirements, user stories,
          risks, and decisions from meeting notes — automatically.
        </p>
        <div className="mt-8 flex gap-3 justify-center">
          <Button asChild size="lg"><Link to="/dashboard">Get started</Link></Button>
        </div>
      </section>
      <section className="max-w-5xl mx-auto px-6 pb-24 grid md:grid-cols-3 gap-6">
        {[
          { icon: FolderKanban, title: "Organize by project", desc: "Group meeting notes per initiative and keep traceability." },
          { icon: FileText, title: "Auto-generated PRDs", desc: "Executive summary, goals, requirements, user stories, acceptance criteria." },
          { icon: GitCommit, title: "Decision Log", desc: "Every decision captured with source, date, and confidence score." },
        ].map((f) => (
          <div key={f.title} className="rounded-lg border p-5">
            <f.icon className="h-5 w-5 text-primary" />
            <h3 className="mt-3 font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
