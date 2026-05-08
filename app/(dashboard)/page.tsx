import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clapperboard,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getSupabaseServiceClient } from "@/shared/config/supabase";
import { listRecentVideoProjects } from "@/modules/videos/repositories/video.repository";

export default async function DashboardPage() {
  const { projects, dataError } = await loadDashboardProjects();
  const stats = [
    { label: "Active videos", value: String(projects.length) },
    { label: "Segments generating", value: "0" },
    {
      label: "Waiting for review",
      value: String(
        projects.filter((project) => project.status === "storyboard_ready")
          .length
      ),
    },
    {
      label: "Runway credits used",
      value: String(
        projects.reduce(
          (total, project) => total + project.totalCostCredits,
          0
        )
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <Badge className="mb-3" variant="outline">
            Production cockpit
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">
            Manage recipe video projects, background generations, costs, and
            checkpoints from one place.
          </p>
        </div>
        <Button asChild>
          <Link href="/videos/new">Create video</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className="text-3xl">{stat.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clapperboard className="h-5 w-5" />
              Project library
            </CardTitle>
            <CardDescription>
              Supabase-backed project cards will appear here once the data layer
              lands.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {dataError ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Project data unavailable</AlertTitle>
                <AlertDescription>{dataError}</AlertDescription>
              </Alert>
            ) : projects.length > 0 ? (
              <div className="grid gap-3">
                {projects.map((project) => (
                  <Link
                    className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
                    href={`/videos/${project.id}`}
                    key={project.id}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h3 className="font-medium">{project.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          Updated {formatDate(project.updatedAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{project.status}</Badge>
                        <Badge variant="outline">
                          {project.selectedVideoModel}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {project.totalCostCredits} credits
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <h3 className="font-medium">No video projects yet.</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create your first recipe video or load the Paris-Brest demo
                  fixture after the demo mode issue is implemented.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Active generation queue
            </CardTitle>
            <CardDescription>
              Every async job must expose status and next action.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={0} />
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No active tasks</AlertTitle>
              <AlertDescription>
                Inngest workflows and Runway polling are not wired yet.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

async function loadDashboardProjects() {
  try {
    const supabase = getSupabaseServiceClient();
    const projects = await listRecentVideoProjects(supabase);

    return { projects, dataError: null };
  } catch (error) {
    return {
      projects: [],
      dataError:
        error instanceof Error
          ? error.message
          : "Unable to load project data.",
    };
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
