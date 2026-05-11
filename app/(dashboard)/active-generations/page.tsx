import Link from "next/link";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  PauseCircle,
  PlayCircle,
  RefreshCcw,
  XCircle,
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
import {
  cancelGenerationAction,
  retryGenerationAction,
  setQueuePauseAction,
} from "@/modules/generation/queue-actions";
import { listActiveGenerations } from "@/modules/generation/repositories/generation.repository";
import type { Generation } from "@/modules/generation/generation.types";
import type { GenerationStatus } from "@/modules/generation/generation-status";
import { getGenerationQueuePaused } from "@/modules/generation/repositories/queue-state.repository";
import { getSegmentById } from "@/modules/storyboard/repositories/segment.repository";
import { getVideoProjectById } from "@/modules/videos/repositories/video.repository";

export const dynamic = "force-dynamic";

interface ActiveTaskRow {
  generationId: string;
  segmentId: string;
  segmentTitle: string;
  videoId: string;
  videoTitle: string;
  model: string;
  status: GenerationStatus;
  costCredits: number | null;
  startedAt: string;
  triggeredBy: string | null;
  runwayTaskId: string | null;
}

export default async function ActiveGenerationsPage() {
  const { rows, paused, error } = await loadActiveGenerations();

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <Badge className="mb-3" variant="outline">
            Cross-project queue
          </Badge>
          <h2 className="licorn-page-title">
            Active generations
          </h2>
          <p className="max-w-3xl text-muted-foreground">
            Live view of every queued, processing, failed, or pending Runway
            task across projects. Pause new generations, retry, or cancel
            without leaving this screen.
          </p>
        </div>

        <form action={setQueuePauseAction}>
          <input
            name="paused"
            type="hidden"
            value={paused ? "false" : "true"}
          />
          <Button
            size="sm"
            type="submit"
            variant={paused ? "default" : "outline"}
          >
            {paused ? (
              <>
                <PlayCircle className="h-4 w-4" />
                Resume queue
              </>
            ) : (
              <>
                <PauseCircle className="h-4 w-4" />
                Pause queue
              </>
            )}
          </Button>
        </form>
      </section>

      {paused ? (
        <Alert variant="destructive">
          <PauseCircle className="h-4 w-4" />
          <AlertTitle>New generations are paused</AlertTitle>
          <AlertDescription>
            New `segment.generation.requested` events keep their segment in the
            `blocked` status until the queue is resumed. In-flight tasks
            continue to poll until they reach a terminal state.
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Active queue unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

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
          {rows.length === 0 ? (
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
                  <TableHead>Segment</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead className="text-right">Cost est.</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((task) => (
                  <TableRow key={task.generationId}>
                    <TableCell className="font-medium">
                      {task.videoTitle}
                    </TableCell>
                    <TableCell>{task.segmentTitle}</TableCell>
                    <TableCell>{task.model}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(task.status)}>
                        {task.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="min-w-32">
                      <Progress value={progressForStatus(task.status)} />
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCredits(task.costCredits)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(task.startedAt)}
                    </TableCell>
                    <TableCell className="flex flex-wrap justify-end gap-2">
                      <form action={retryGenerationAction}>
                        <input
                          name="generationId"
                          type="hidden"
                          value={task.generationId}
                        />
                        <Button
                          size="sm"
                          type="submit"
                          variant="outline"
                          disabled={paused || task.status === "queued" || task.status === "processing"}
                        >
                          <RefreshCcw className="h-4 w-4" />
                          Retry
                        </Button>
                      </form>
                      <form action={cancelGenerationAction}>
                        <input
                          name="generationId"
                          type="hidden"
                          value={task.generationId}
                        />
                        <Button size="sm" type="submit" variant="ghost">
                          <XCircle className="h-4 w-4" />
                          Cancel
                        </Button>
                      </form>
                      <Button asChild size="sm" variant="outline">
                        <Link
                          href={`/videos/${task.videoId}/segments/${task.segmentId}`}
                        >
                          Open segment
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

      {hasFailedTasks(rows) ? (
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

async function loadActiveGenerations() {
  try {
    const supabase = createSupabaseAdminClient();
    const [generations, paused] = await Promise.all([
      listActiveGenerations(supabase, { limit: 50 }),
      getGenerationQueuePaused(supabase),
    ]);

    const rows = await Promise.all(
      generations.map(async (generation) =>
        decorateGeneration(supabase, generation),
      ),
    );

    return { rows: rows.filter((row): row is ActiveTaskRow => Boolean(row)), paused, error: null as string | null };
  } catch (error) {
    return {
      rows: [] as ActiveTaskRow[],
      paused: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to load active generations.",
    };
  }
}

async function decorateGeneration(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  generation: Generation,
): Promise<ActiveTaskRow | null> {
  const segment = await getSegmentById(supabase, generation.segmentId);
  if (!segment) {
    return null;
  }

  const video = await getVideoProjectById(supabase, segment.videoId);

  return {
    generationId: generation.id,
    segmentId: segment.id,
    segmentTitle: `S${segment.position}. ${segment.title}`,
    videoId: segment.videoId,
    videoTitle: video?.title ?? "Untitled project",
    model: generation.model,
    status: generation.status,
    costCredits: generation.costCredits ?? null,
    startedAt: generation.createdAt,
    triggeredBy: generation.triggeredBy ?? null,
    runwayTaskId: generation.runwayTaskId ?? null,
  };
}

function statusBadgeVariant(
  status: GenerationStatus,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "failed" || status === "cancelled" || status === "expired") {
    return "destructive";
  }
  if (status === "succeeded") {
    return "secondary";
  }
  if (status === "queued" || status === "pending") {
    return "outline";
  }
  return "default";
}

function progressForStatus(status: GenerationStatus): number {
  if (status === "succeeded") return 100;
  if (status === "processing") return 65;
  if (status === "queued" || status === "pending") return 25;
  if (status === "failed" || status === "cancelled" || status === "expired")
    return 100;
  return 0;
}

function hasFailedTasks(rows: ActiveTaskRow[]) {
  return rows.some((row) => row.status === "failed");
}

function formatCredits(credits: number | null) {
  if (credits == null) return "-";
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
