import { getRunwayBudgetState } from "@/modules/costs/get-cost-dashboard-data";

import { ACTIONABLE_VIDEO_STATUSES } from "./video-status";
import type {
  ActiveGenerationQueueItem,
  VideoDashboardData,
  VideoDashboardProject,
} from "./video-dashboard.types";
import type { VideoProject } from "./video.types";

const SEEDED_PROJECTS: VideoDashboardProject[] = [
  {
    id: "paris-brest-demo",
    title: "Paris-Brest praline cream",
    recipeSourceKind: "demo_fixture",
    recipeSourceLabel: "Demo fixture",
    status: "review",
    thumbnailLabel: "Paris-Brest",
    thumbnailTone: "amber",
    acceptedSegments: 4,
    totalSegments: 8,
    activeTaskCount: 2,
    totalCostCredits: 3820,
    updatedAt: "2026-05-08T18:42:00.000Z",
    ownerName: "Yoann",
    nextAction: "Review Segment 5",
  },
  {
    id: "tarte-citron-reference-pass",
    title: "Tarte citron meringue texture pass",
    recipeSourceKind: "url",
    recipeSourceLabel: "Recipe URL",
    status: "references_ready",
    thumbnailLabel: "Lemon tart",
    thumbnailTone: "emerald",
    acceptedSegments: 0,
    totalSegments: 6,
    activeTaskCount: 1,
    totalCostCredits: 760,
    updatedAt: "2026-05-08T17:15:00.000Z",
    ownerName: "Licorn Ops",
    nextAction: "Approve references",
  },
  {
    id: "cookie-dough-storyboard",
    title: "Cookie dough ASMR hook",
    recipeSourceKind: "pasted_text",
    recipeSourceLabel: "Pasted text",
    status: "storyboard_ready",
    thumbnailLabel: "Cookie dough",
    thumbnailTone: "pink",
    acceptedSegments: 0,
    totalSegments: 7,
    activeTaskCount: 0,
    totalCostCredits: 220,
    updatedAt: "2026-05-08T15:30:00.000Z",
    ownerName: "Yoann",
    nextAction: "Review storyboard",
  },
];

const SEEDED_ACTIVE_QUEUE: ActiveGenerationQueueItem[] = [
  {
    id: "queue-paris-brest-segment-5",
    projectId: "paris-brest-demo",
    projectTitle: "Paris-Brest praline cream",
    targetLabel: "Segment 5",
    operation: "Polling Runway task",
    model: "seedance2",
    status: "processing",
    progress: 68,
    costEstimateCredits: 480,
    triggeredBy: "Yoann",
    startedAt: "2026-05-08T18:35:00.000Z",
  },
  {
    id: "queue-paris-brest-reference",
    projectId: "paris-brest-demo",
    projectTitle: "Paris-Brest praline cream",
    targetLabel: "Reference image",
    operation: "Uploading playback copy",
    model: "gpt_image_2",
    status: "queued",
    progress: 20,
    costEstimateCredits: 120,
    triggeredBy: "Yoann",
    startedAt: "2026-05-08T18:38:00.000Z",
  },
  {
    id: "queue-tarte-citron-reference",
    projectId: "tarte-citron-reference-pass",
    projectTitle: "Tarte citron meringue texture pass",
    targetLabel: "Meringue reference",
    operation: "Reference approval blocked",
    model: "gpt_image_2",
    status: "failed",
    progress: 100,
    costEstimateCredits: 90,
    triggeredBy: "Licorn Ops",
    startedAt: "2026-05-08T17:02:00.000Z",
  },
];

export function getVideoDashboardData(
  persistedProjects: VideoProject[] = [],
  thumbnailByProjectId: Map<string, string> = new Map(),
): VideoDashboardData {
  const projects = [
    ...persistedProjects.map((project) =>
      mapPersistedProject(project, thumbnailByProjectId.get(project.id) ?? null),
    ),
    ...SEEDED_PROJECTS,
  ];
  const activeVideos = projects.filter(
    (project) => project.status !== "exported" && project.status !== "failed",
  ).length;
  const segmentsGenerating = SEEDED_ACTIVE_QUEUE.filter(
    (task) => task.status === "processing" || task.status === "queued",
  ).length;
  const projectsWaitingForReview = projects.filter((project) =>
    ACTIONABLE_VIDEO_STATUSES.includes(project.status),
  ).length;
  const creditsUsed = projects.reduce(
    (total, project) => total + project.totalCostCredits,
    0,
  );
  const budget = getRunwayBudgetState(creditsUsed);
  const estimatedCreditsRemaining = budget.creditsRemaining;
  const videosCompleted = projects.filter(
    (project) => project.status === "exported",
  ).length;

  return {
    projects,
    activeQueue: SEEDED_ACTIVE_QUEUE,
    creditsUsed,
    estimatedCreditsRemaining,
    budgetWarningLevel: budget.warningLevel,
    budgetPercentRemaining: budget.percentRemaining,
    kpis: [
      {
        label: "Active videos",
        value: String(activeVideos),
        helper: "Drafts and projects before export",
      },
      {
        label: "Segments generating",
        value: String(segmentsGenerating),
        helper: "Queued or processing tasks",
      },
      {
        label: "Projects waiting for review",
        value: String(projectsWaitingForReview),
        helper: "Human checkpoint required",
      },
      {
        label: "Runway credits used",
        value: creditsUsed.toLocaleString("en-US"),
        helper: "Seeded estimate across projects",
      },
      {
        label: "Estimated credits remaining",
        value: estimatedCreditsRemaining.toLocaleString("en-US"),
        helper: `${budget.percentRemaining}% of hackathon credits left`,
      },
      {
        label: "Videos completed",
        value: String(videosCompleted),
        helper: "Exported final videos",
      },
    ],
  };
}

function mapPersistedProject(
  project: VideoProject,
  thumbnailUrl: string | null,
): VideoDashboardProject {
  const source = project.recipeData?.source as
    | { type?: string; demoRecipeId?: string | null; uploadedFileNames?: string[] }
    | undefined;
  const recipeSourceKind = getRecipeSourceKind(source?.type);

  return {
    id: project.id,
    title: project.title,
    recipeSourceKind,
    recipeSourceLabel: getRecipeSourceLabel(recipeSourceKind),
    status: project.status,
    thumbnailLabel: project.title,
    thumbnailTone: recipeSourceKind === "demo_fixture" ? "amber" : "sky",
    thumbnailUrl,
    acceptedSegments: 0,
    totalSegments: 0,
    activeTaskCount: 0,
    totalCostCredits: project.totalCostCredits,
    updatedAt: project.updatedAt,
    ownerName: "Licorn Ops",
    nextAction: "Analyze recipe",
  };
}

function getRecipeSourceKind(
  sourceType: string | undefined,
): VideoDashboardProject["recipeSourceKind"] {
  if (sourceType === "url") {
    return "url";
  }

  if (sourceType === "photos") {
    return "photos";
  }

  if (sourceType === "text") {
    return "pasted_text";
  }

  return "demo_fixture";
}

function getRecipeSourceLabel(
  sourceKind: VideoDashboardProject["recipeSourceKind"],
) {
  if (sourceKind === "url") {
    return "Recipe URL";
  }

  if (sourceKind === "photos") {
    return "Recipe photos";
  }

  if (sourceKind === "pasted_text") {
    return "Pasted text";
  }

  return "Demo fixture";
}
