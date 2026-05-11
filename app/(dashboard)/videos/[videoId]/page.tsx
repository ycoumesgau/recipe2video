import Link from "next/link";
import { AlertTriangle } from "lucide-react";

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
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { loadProjectCostDashboardData } from "@/modules/costs/load-cost-dashboard-data";
import type { CostDashboardData } from "@/modules/costs/cost.types";
import { readDashboardDataMode } from "@/modules/dashboard/dashboard-data-mode";
import { countActiveGenerationsForSegments } from "@/modules/generation/repositories/generation.repository";
import {
  getRecipeAgentThreadByVideoId,
  listRecipeAgentMessagesByThreadId,
  listRecipeAgentStepsByRunId,
} from "@/modules/recipe-agent/repositories/recipe-agent-chat.repository";
import {
  listAgentArtifactsByVideoId,
  listAgentRunEventsByAgentRunId,
  listAgentRunsByVideoId,
} from "@/modules/recipe-agent/repositories/recipe-agent.repository";
import { RecipeAgentPanel } from "@/modules/recipe-agent/ui/recipe-agent-panel";
import { getStoryboardReviewData } from "@/modules/storyboard/use-cases/load-storyboard-fixture";
import { listRecipeSourceImagePreviewUrls } from "@/modules/media-assets/use-cases/list-recipe-source-image-preview-urls";
import { getVideoProjectById } from "@/modules/videos/repositories/video.repository";
import { getRecipeSourceSummaryFromRecipeData } from "@/modules/videos/recipe-source-from-recipe-data";
import type { RecipeSourceSummary, VideoProject } from "@/modules/videos/video.types";
import { EditableProjectTitle } from "@/modules/videos/ui/editable-project-title";
import { ProjectPipelineProgress } from "@/modules/videos/ui/project-pipeline-progress";
import { ProjectDetailArchiveControls } from "@/modules/videos/ui/project-detail-archive-controls";
import { RecipeSourcePhotoThumbnails } from "@/modules/videos/ui/recipe-source-photo-thumbnails";
import { VideoProjectRscSync } from "@/modules/videos/ui/video-project-rsc-sync";

export default async function VideoDetailPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const { videoId } = await params;
  const {
    project,
    costData,
    dataError,
    seedanceSegments,
    activeTaskCount,
    agentRuns,
    agentArtifacts,
    latestRunTimelineEvents,
    chatMessages,
    latestRunSteps,
    recipeSourcePhotoPreviews,
  } = await loadProject(videoId);

  const acceptedSegments = seedanceSegments.filter(
    (segment) => segment.status === "accepted",
  ).length;
  const recipeSource = readRecipeSourceSummary(project);
  const nextAction = project
    ? computeNextAction({
        project,
        acceptedCount: acceptedSegments,
        totalCount: seedanceSegments.length,
      })
    : null;

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant="outline">Overview</Badge>
          {project ? (
            <Badge variant="outline">Project {project.status}</Badge>
          ) : (
            <Badge variant="outline">{videoId}</Badge>
          )}
        </div>
        {project ? (
          <EditableProjectTitle
            initialTitle={project.title}
            videoId={project.id}
          />
        ) : (
          <h2 className="licorn-page-title">
            Project overview
          </h2>
        )}
        <p className="text-muted-foreground">
          This cockpit reserves the structure for storyboard, references,
          segments, assembly, costs, and logs.
        </p>
      </div>

      {project ? (
        <ProjectDetailArchiveControls
          archivedAt={project.archivedAt ?? null}
          videoId={project.id}
        />
      ) : null}

      {dataError ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Project data unavailable</AlertTitle>
          <AlertDescription>{dataError}</AlertDescription>
        </Alert>
      ) : null}

      {project && nextAction ? (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-4">
            <VideoProjectRscSync
              agentPlanningRequested={readAgentPlanningRequested(project)}
              agentRunCount={agentRuns.length}
              agentStatus={project.agentStatus}
              cursorAgentId={project.cursorAgentId ?? null}
              projectStatus={project.status}
            />
            <Card>
              <CardHeader>
                <CardTitle>Next required action</CardTitle>
                <CardDescription>{nextAction.detail}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <ProjectPipelineProgress
                  acceptedSegmentCount={acceptedSegments}
                  activeTaskCount={activeTaskCount}
                  status={project.status}
                  totalSegmentCount={seedanceSegments.length}
                />
                <div className="flex flex-wrap gap-2">
                  {nextAction.href ? (
                    <Button asChild>
                      <Link href={nextAction.href}>{nextAction.cta}</Link>
                    </Button>
                  ) : (
                    <Button disabled>{nextAction.cta}</Button>
                  )}
                  <Button asChild variant="outline">
                    <Link href="/">Back to dashboard</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <RecipeAgentPanel
              artifacts={agentArtifacts}
              chatMessages={chatMessages}
              latestRunSteps={latestRunSteps}
              latestRunTimelineEvents={latestRunTimelineEvents}
              project={project}
              runs={agentRuns}
            />
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recipe source</CardTitle>
                <CardDescription>
                  What the agent ingested for this project.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <OverviewItem label="Source type" value={recipeSource.label} />
                {recipeSource.detail ? (
                  <OverviewItem label="Reference" value={recipeSource.detail} />
                ) : null}
                {recipeSourcePhotoPreviews.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Preview
                    </p>
                    <RecipeSourcePhotoThumbnails
                      previews={recipeSourcePhotoPreviews}
                    />
                    <p className="text-xs text-muted-foreground">
                      Files remain in Supabase Storage. Signed links for this page
                      refresh on each visit; they are independent from the Cursor agent
                      URLs.
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Selected models</CardTitle>
                <CardDescription>
                  No silent fallback: failures surface here instead of
                  switching model behind the user.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2">
                  <OverviewItem
                    label="Video"
                    value={project.selectedVideoModel}
                  />
                  <OverviewItem
                    label="Image"
                    value={project.selectedImageModel}
                  />
                  <OverviewItem
                    label="TTS"
                    value={project.selectedTtsModel}
                  />
                  <OverviewItem
                    label="SFX"
                    value={project.selectedSfxModel}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cost summary</CardTitle>
                <CardDescription>
                  Aggregated from `cost_logs` for this project.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ProjectCostSummary data={costData} />
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No project data is loaded yet.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

async function loadProject(videoId: string) {
  const useMockFallback = (await readDashboardDataMode()) === "mock";

  try {
    const supabase = createSupabaseAdminClient();
    const project = await getVideoProjectById(supabase, videoId);
    const [{ seedanceSegments }, costData] = await Promise.all([
      getStoryboardReviewData(videoId),
      loadProjectCostDashboardData(videoId, { useMockFallback }),
    ]);
    const activeTaskCount = await countActiveGenerationsForSegments(
      supabase,
      seedanceSegments.map((segment) => segment.id),
    );
    const recipeSourcePhotoPreviews =
      project &&
      getRecipeSourceSummaryFromRecipeData(project.recipeData)?.type === "photos"
        ? await listRecipeSourceImagePreviewUrls(supabase, project.id)
        : [];
    const [agentRuns, agentArtifacts, latestRunTimelineEvents, chatMessages, latestRunSteps] =
      project
        ? await (async () => {
            const runs = await listAgentRunsByVideoId(supabase, videoId);
            const artifacts = await listAgentArtifactsByVideoId(supabase, videoId);
            const latestRunId = runs[0]?.id;
            const timeline =
              latestRunId !== undefined
                ? await listAgentRunEventsByAgentRunId(supabase, latestRunId)
                : [];
            const thread = await getRecipeAgentThreadByVideoId(supabase, videoId);
            const messages = thread
              ? await listRecipeAgentMessagesByThreadId(supabase, thread.id)
              : [];
            const steps =
              latestRunId !== undefined
                ? await listRecipeAgentStepsByRunId(supabase, latestRunId)
                : [];
            return [runs, artifacts, timeline, messages, steps] as const;
          })()
        : [[], [], [], [], []];

    return {
      project,
      costData,
      dataError: null,
      seedanceSegments,
      activeTaskCount,
      agentRuns,
      agentArtifacts,
      latestRunTimelineEvents,
      chatMessages,
      latestRunSteps,
      recipeSourcePhotoPreviews,
    };
  } catch (error) {
    return {
      project: null,
      costData: await loadProjectCostDashboardData(videoId, { useMockFallback }),
      seedanceSegments: [],
      dataError:
        error instanceof Error
          ? error.message
          : "Unable to load project data.",
      activeTaskCount: 0,
      agentRuns: [],
      agentArtifacts: [],
      latestRunTimelineEvents: [],
      chatMessages: [],
      latestRunSteps: [],
      recipeSourcePhotoPreviews: [],
    };
  }
}

function ProjectCostSummary({ data }: { data: CostDashboardData }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {data.summaryMetrics.slice(0, 4).map((metric) => (
        <div
          key={metric.label}
          className="rounded-lg border bg-background/60 p-3"
        >
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {metric.label}
          </p>
          <p className="mt-1 font-heading font-bold">{metric.value}</p>
          <p className="text-xs text-muted-foreground">{metric.helper}</p>
        </div>
      ))}
    </div>
  );
}

function readAgentPlanningRequested(project: VideoProject) {
  const data = project.recipeData;
  if (!data || typeof data !== "object") {
    return false;
  }
  return (data as { agentPlanningRequested?: unknown }).agentPlanningRequested === true;
}

function readRecipeSourceSummary(project: VideoProject | null) {
  const source = project?.recipeData as
    | { source?: RecipeSourceSummary }
    | null
    | undefined;
  const summary = source?.source;

  if (!summary) {
    return { label: "No source recorded yet", detail: null as string | null };
  }

  if (summary.type === "url") {
    return {
      label: "Recipe URL",
      detail: summary.recipeUrl ?? null,
    };
  }
  if (summary.type === "photos") {
    return {
      label: "Recipe photos",
      detail: summary.uploadedFileNames?.length
        ? `${summary.uploadedFileNames.length} files (${summary.uploadedFileNames.slice(0, 3).join(", ")}${summary.uploadedFileNames.length > 3 ? "..." : ""})`
        : null,
    };
  }
  if (summary.type === "text") {
    return {
      label: "Pasted text",
      detail: summary.pastedTextPreview ?? null,
    };
  }
  return {
    label: "Demo fixture",
    detail: summary.demoRecipeId ?? null,
  };
}

function computeNextAction(input: {
  project: VideoProject;
  acceptedCount: number;
  totalCount: number;
}) {
  const { project } = input;

  if (project.agentStatus === "needs_input") {
    return {
      detail:
        "The recipe agent asked for clarification in Cursor. Reply via Recipe Agent below, then refresh when the follow-up run completes.",
      cta: "Answer agent request",
      href: `/videos/${project.id}`,
    };
  }

  if (project.agentStatus === "validation_failed") {
    return {
      detail:
        "The recipe agent produced artifacts that failed validation. Ask the same agent to repair them before approving downstream checkpoints.",
      cta: "Open Recipe Agent",
      href: `/videos/${project.id}`,
    };
  }

  if (project.agentStatus === "running") {
    return {
      detail:
        "The recipe agent is currently updating planning artifacts. Refresh this project after the run completes.",
      cta: "Agent running",
      href: null as string | null,
    };
  }

  if (project.status === "draft") {
    return {
      detail: "Recipe ingest is queued through Inngest.",
      cta: "Awaiting recipe ingest",
      href: null as string | null,
    };
  }
  if (project.status === "clarification_needed") {
    return {
      detail: "Answer the clarifying questions before generating the storyboard.",
      cta: "Open project storyboard",
      href: `/videos/${project.id}/storyboard`,
    };
  }
  if (project.status === "recipe_ingested" || project.status === "storyboard_ready") {
    return {
      detail: "Review the proposed storyboard and approve it before any Runway spend.",
      cta: "Review storyboard",
      href: `/videos/${project.id}/storyboard`,
    };
  }
  if (project.status === "storyboard_approved") {
    return {
      detail: "Approve and upload the kitchen + recipe-state references.",
      cta: "Open references",
      href: `/videos/${project.id}/references`,
    };
  }
  if (project.status === "references_ready" || project.status === "generating" || project.status === "review") {
    return {
      detail: `Review Seedance segment variants (${input.acceptedCount}/${input.totalCount} accepted).`,
      cta: "Open segments",
      href: `/videos/${project.id}/segments`,
    };
  }
  if (project.status === "assembling") {
    return {
      detail: "Assemble accepted clips with Suno music and prepare the final export.",
      cta: "Open assembly",
      href: `/videos/${project.id}/assembly`,
    };
  }
  if (project.status === "exported") {
    return {
      detail: "Final export delivered. Re-open the assembly to download the master.",
      cta: "Open assembly",
      href: `/videos/${project.id}/assembly`,
    };
  }
  return {
    detail: "A workflow step failed; inspect the logs and retry.",
    cta: "Open costs and logs",
    href: `/videos/${project.id}/costs`,
  };
}

function OverviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

