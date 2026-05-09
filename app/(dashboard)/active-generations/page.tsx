import Link from "next/link";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { getVideoDashboardData } from "@/modules/videos/get-video-dashboard-data";
import { listVideoProjects } from "@/modules/videos/repositories/video.repository";
import type { ActiveGenerationQueueItem } from "@/modules/videos/video-dashboard.types";

export const dynamic = "force-dynamic";

export default async function ActiveGenerationsPage() {
  const projects = await loadProjects();
  const data = getVideoDashboardData(projects);
  const queue = data.activeQueue;

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <Badge className="mb-3" variant="outline">
            Cross-project queue
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight">
            Active generations
          </h2>
          <p className="max-w-3xl text-muted-foreground">
            Every queued, running, failed, or blocked generation across projects
            stays visible here. Open a project to retry, cancel, or change the
            selected model. No silent fallback runs without explicit user
            approval.
          </p>
        </div>
      </section>

      <Alert>
        <Activity className="h-4 w-4" />
        <AlertTitle>Read-only queue overview during the hackathon</AlertTitle>
        <AlertDescription>
          Per-task retry, cancel, and global pause controls live inside each
          project segment review. This page is the cross-project visibility
          layer required by the UX contract.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Generation queue
          </CardTitle>
          <CardDescription>
            Status, model, cost estimate, and ownership for every async task.
            Failures stay surfaced instead of being silently retried.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {queue.length === 0 ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>No active tasks</AlertTitle>
              <AlertDescription>
                Generations triggered from project pages will appear here while
                Inngest workflows are running.
              </AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Operation</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead className="text-right">Cost est.</TableHead>
                  <TableHead>Triggered by</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell className="font-medium">
                      {task.projectTitle}
                    </TableCell>
                    <TableCell>{task.targetLabel}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {task.operation}
                    </TableCell>
                    <TableCell>{task.model}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(task.status)}>
                        {task.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="min-w-32">
                      <Progress value={task.progress} />
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCredits(task.costEstimateCredits)}
                    </TableCell>
                    <TableCell>{task.triggeredBy}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(task.startedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/videos/${task.projectId}`}>
                          Open project
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {hasFailedTasks(queue) ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed task visible above</AlertTitle>
          <AlertDescription>
            Failed Runway tasks remain visible until the user retries from the
            related project. Recipe2Video never silently switches model after a
            failure.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

async function loadProjects() {
  try {
    const supabase = createSupabaseAdminClient();
    return await listVideoProjects(supabase, { limit: 12 });
  } catch {
    return [];
  }
}

function statusBadgeVariant(
  status: ActiveGenerationQueueItem["status"],
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "failed") {
    return "destructive";
  }

  if (status === "succeeded") {
    return "secondary";
  }

  if (status === "queued") {
    return "outline";
  }

  return "default";
}

function hasFailedTasks(queue: ActiveGenerationQueueItem[]) {
  return queue.some((task) => task.status === "failed");
}

function formatCredits(credits: number) {
  return `${credits.toLocaleString("en-US")} cr`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}
