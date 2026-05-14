import Link from "next/link";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Film,
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
import type { Composition } from "@/modules/assembly/assembly.types";
import {
  RENDER_PHASE_LABELS,
  computeRenderProgressDisplay,
  formatDurationSeconds,
  readRenderProgress,
  type RenderProgress,
} from "@/modules/assembly/render-progress";
import { listInFlightCompositionRenders } from "@/modules/assembly/repositories/assembly.repository";
import { GenerationRscSync } from "@/modules/generation/ui/generation-rsc-sync";
import {
  cancelGenerationAction,
  retryGenerationAction,
  setQueuePauseAction,
} from "@/modules/generation/queue-actions";
import { listActiveGenerations } from "@/modules/generation/repositories/generation.repository";
import type { Generation } from "@/modules/generation/generation.types";
import type { GenerationStatus } from "@/modules/generation/generation-status";
import { getGenerationQueuePaused } from "@/modules/generation/repositories/queue-state.repository";
import type { RunwayTaskStatusValue } from "@/modules/generation/runway.types";
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
  runwayTaskStatus: RunwayTaskStatusValue | null;
  runwayProgress: number | null;
}

interface ActiveCloudRenderRow {
  compositionId: string;
  videoId: string;
  videoTitle: string;
  progress: RenderProgress | null;
  updatedAt: string;
}

export default async function ActiveGenerationsPage() {
  const { rows, paused, error, cloudRenders } = await loadActiveGenerations();

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

      <GenerationRscSync
        enabled={rows.length > 0 || cloudRenders.length > 0}
      />

      {cloudRenders.length > 0 ? (
        <CloudRendersCard renders={cloudRenders} />
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
                  <TableHead>Runway</TableHead>
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
                    <TableCell>
                      {task.runwayTaskStatus ? (
                        <Badge
                          variant={
                            task.runwayTaskStatus === "THROTTLED"
                              ? "destructive"
                              : "outline"
                          }
                        >
                          {task.runwayTaskStatus}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="min-w-32">
                      <Progress
                        value={progressForGeneration(task.status, task.runwayProgress)}
                      />
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
    const [generations, paused, compositions] = await Promise.all([
      listActiveGenerations(supabase, { limit: 50 }),
      getGenerationQueuePaused(supabase),
      listInFlightCompositionRenders(supabase, { limit: 20 }),
    ]);

    const rows = await Promise.all(
      generations.map(async (generation) =>
        decorateGeneration(supabase, generation),
      ),
    );

    const cloudRenders = await Promise.all(
      compositions.map(async (composition) =>
        decorateCloudRender(supabase, composition),
      ),
    );

    return {
      rows: rows.filter((row): row is ActiveTaskRow => Boolean(row)),
      paused,
      error: null as string | null,
      cloudRenders,
    };
  } catch (error) {
    return {
      rows: [] as ActiveTaskRow[],
      paused: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to load active generations.",
      cloudRenders: [] as ActiveCloudRenderRow[],
    };
  }
}

async function decorateCloudRender(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  composition: Composition,
): Promise<ActiveCloudRenderRow> {
  const video = await getVideoProjectById(supabase, composition.videoId).catch(
    () => null,
  );
  return {
    compositionId: composition.id,
    videoId: composition.videoId,
    videoTitle: video?.title ?? "Untitled project",
    progress: readRenderProgress(composition.renderProgress ?? null),
    updatedAt: composition.updatedAt,
  };
}

function CloudRendersCard({ renders }: { renders: ActiveCloudRenderRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Film className="h-5 w-5" />
          Cloud renders in progress
        </CardTitle>
        <CardDescription>
          Vercel Sandbox sessions assembling the final MP4 for an
          `assembly.composition`. Polled every few seconds while at least one
          composition row is in `rendering`.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Phase</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Frames</TableHead>
              <TableHead>Speed</TableHead>
              <TableHead>ETA</TableHead>
              <TableHead>Elapsed</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {renders.map((render) => (
              <CloudRenderRow key={render.compositionId} render={render} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CloudRenderRow({ render }: { render: ActiveCloudRenderRow }) {
  const progress = render.progress;
  const display = progress
    ? computeRenderProgressDisplay(progress, new Date())
    : null;
  const phaseLabel = progress ? RENDER_PHASE_LABELS[progress.phase] : "Queued";
  const frames =
    progress?.totalFrames && progress.renderedFrames != null
      ? `${progress.renderedFrames.toLocaleString("en-US")} / ${progress.totalFrames.toLocaleString("en-US")}`
      : progress?.totalFrames
        ? `0 / ${progress.totalFrames.toLocaleString("en-US")}`
        : "—";
  return (
    <TableRow>
      <TableCell className="font-medium">{render.videoTitle}</TableCell>
      <TableCell>
        <Badge variant={display?.isStale ? "destructive" : "outline"}>
          {phaseLabel}
        </Badge>
      </TableCell>
      <TableCell className="min-w-32">
        <div className="flex items-center gap-2">
          <Progress className="w-24" value={display?.percent ?? 0} />
          <span className="font-mono text-xs">
            {display ? `${display.percent}%` : "—"}
          </span>
        </div>
      </TableCell>
      <TableCell className="font-mono text-xs">{frames}</TableCell>
      <TableCell className="font-mono text-xs">
        {display?.fps ? `${display.fps.toFixed(1)} fps` : "—"}
      </TableCell>
      <TableCell className="font-mono text-xs">
        {display?.etaSeconds != null
          ? formatDurationSeconds(display.etaSeconds)
          : "—"}
      </TableCell>
      <TableCell className="font-mono text-xs">
        {display ? formatDurationSeconds(display.elapsedSeconds) : "—"}
      </TableCell>
      <TableCell className="text-right">
        <Button asChild size="sm" variant="outline">
          <Link href={`/videos/${render.videoId}/assembly`}>
            Open assembly
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  );
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
    runwayTaskStatus: generation.runwayTaskStatus ?? null,
    runwayProgress: generation.runwayProgress ?? null,
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

function progressForGeneration(
  status: GenerationStatus,
  runwayProgress: number | null,
): number {
  if (typeof runwayProgress === "number") {
    return Math.max(0, Math.min(100, runwayProgress));
  }

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
