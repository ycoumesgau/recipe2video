import { getRunwayBudgetState } from "@/modules/costs/get-cost-dashboard-data";
import type { RunwayOrganizationBalance } from "@/modules/costs/runway-organization-balance";

import { ACTIONABLE_VIDEO_STATUSES } from "./video-status";
import type {
  ActiveGenerationQueueItem,
  VideoDashboardData,
  VideoDashboardProject,
  VideoLibraryPagination,
} from "./video-dashboard.types";
import type { VideoLibraryCardMetricsByVideoId } from "./video-library-card-metrics.types";
import type { VideoLibraryStats, VideoProject } from "./video.types";
import type { RecipeAgentStatus } from "@/modules/recipe-agent/recipe-agent.types";

const SEEDED_PROJECTS: VideoDashboardProject[] = [
  {
    id: "paris-brest-demo",
    title: "Paris-Brest praline cream",
    recipeNumber: 1,
    recipeSourceKind: "demo_fixture",
    recipeSourceLabel: "Demo fixture",
    status: "review",
    agentStatus: "idle",
    thumbnailLabel: "Paris-Brest",
    thumbnailTone: "amber",
    acceptedSegments: 4,
    totalSegments: 8,
    activeTaskCount: 2,
    totalCostCredits: 3820,
    updatedAt: "2026-05-08T18:42:00.000Z",
    ownerName: "Yoann",
    nextAction: "Open segments",
    nextActionHref: "/videos/paris-brest-demo/segments",
    archivedAt: null,
    canArchive: false,
  },
  {
    id: "tarte-citron-reference-pass",
    title: "Tarte citron meringue texture pass",
    recipeNumber: 2,
    recipeSourceKind: "url",
    recipeSourceLabel: "Recipe URL",
    status: "references_ready",
    agentStatus: "idle",
    thumbnailLabel: "Lemon tart",
    thumbnailTone: "emerald",
    acceptedSegments: 0,
    totalSegments: 6,
    activeTaskCount: 1,
    totalCostCredits: 760,
    updatedAt: "2026-05-08T17:15:00.000Z",
    ownerName: "Licorn Ops",
    nextAction: "Open references",
    nextActionHref: "/videos/tarte-citron-reference-pass/references",
    archivedAt: null,
    canArchive: false,
  },
  {
    id: "cookie-dough-storyboard",
    title: "Cookie dough ASMR hook",
    recipeNumber: 3,
    recipeSourceKind: "pasted_text",
    recipeSourceLabel: "Pasted text",
    status: "storyboard_ready",
    agentStatus: "idle",
    thumbnailLabel: "Cookie dough",
    thumbnailTone: "pink",
    acceptedSegments: 0,
    totalSegments: 7,
    activeTaskCount: 0,
    totalCostCredits: 220,
    updatedAt: "2026-05-08T15:30:00.000Z",
    ownerName: "Yoann",
    nextAction: "Review storyboard",
    nextActionHref: "/videos/cookie-dough-storyboard/storyboard",
    archivedAt: null,
    canArchive: false,
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
  options: {
    includeSeededDemos?: boolean;
    runwayBalance?: RunwayOrganizationBalance | null;
    runwayCreditsUsedLogged?: number;
    libraryStats?: VideoLibraryStats;
    pagination?: Pick<VideoLibraryPagination, "page" | "pageSize" | "totalProjects">;
    cardMetricsByVideoId?: VideoLibraryCardMetricsByVideoId;
  } = {},
): VideoDashboardData {
  const includeSeededDemos = options.includeSeededDemos ?? false;
  const cardMetricsByVideoId = options.cardMetricsByVideoId ?? new Map();
  const activeQueue = includeSeededDemos ? SEEDED_ACTIVE_QUEUE : [];
  const projects = [
    ...persistedProjects.map((project) =>
      mapPersistedProject(
        project,
        thumbnailByProjectId.get(project.id) ?? null,
        cardMetricsByVideoId.get(project.id),
      ),
    ),
    ...(includeSeededDemos ? SEEDED_PROJECTS : []),
  ];

  const page = options.pagination?.page ?? 1;
  const pageSize = options.pagination?.pageSize ?? Math.max(projects.length, 1);
  const persistedTotal =
    options.pagination?.totalProjects ?? persistedProjects.length;
  const totalProjects = includeSeededDemos
    ? persistedTotal + SEEDED_PROJECTS.length
    : persistedTotal;
  const totalPages = Math.max(1, Math.ceil(totalProjects / pageSize));
  const pagination: VideoLibraryPagination = {
    page,
    pageSize,
    totalProjects,
    totalPages,
  };

  const activeVideos =
    options.libraryStats?.activeVideos ??
    projects.filter(
      (project) => project.status !== "exported" && project.status !== "failed",
    ).length;
  const segmentsGenerating = activeQueue.filter(
    (task) => task.status === "processing" || task.status === "queued",
  ).length;
  const projectsWaitingForReview =
    options.libraryStats?.projectsWaitingForReview ??
    projects.filter((project) =>
      ACTIONABLE_VIDEO_STATUSES.includes(project.status),
    ).length;
  const creditsUsedProjectTotals = projects.reduce(
    (total, project) => total + project.totalCostCredits,
    0,
  );
  const runwayCreditsUsedLogged =
    options.runwayCreditsUsedLogged ?? creditsUsedProjectTotals;
  const budget = getRunwayBudgetState(runwayCreditsUsedLogged, {
    runwayCreditBalance: options.runwayBalance?.creditBalance ?? null,
    maxMonthlyCreditSpend: options.runwayBalance?.maxMonthlyCreditSpend ?? null,
  });
  const estimatedCreditsRemaining = budget.creditsRemaining;
  const videosCompleted =
    options.libraryStats?.videosCompleted ??
    projects.filter((project) => project.status === "exported").length;

  const creditsDisplayed = includeSeededDemos
    ? creditsUsedProjectTotals
    : runwayCreditsUsedLogged;
  const creditsHelper = includeSeededDemos
    ? "Includes seeded demo projects"
    : "Runway credits logged in cost_logs for this workspace";

  const remainingHelper = budget.runwayBalanceKnown
    ? options.runwayBalance?.maxMonthlyCreditSpend
      ? `${budget.percentRemaining}% vs Runway monthly spend cap`
      : `${budget.percentRemaining}% vs balance + app-logged usage`
    : "Runway balance unavailable — set RUNWAYML_API_SECRET";

  return {
    projects,
    activeQueue,
    creditsUsed: creditsDisplayed,
    estimatedCreditsRemaining,
    budgetWarningLevel: budget.warningLevel,
    budgetPercentRemaining: budget.percentRemaining,
    usesMockDashboardDemos: includeSeededDemos,
    runwayBalanceKnown: budget.runwayBalanceKnown,
    pagination,
    kpis: [
      {
        label: "Active videos",
        value: String(activeVideos),
        helper: "Drafts and projects before export",
      },
      {
        label: "Segments generating",
        value: String(segmentsGenerating),
        helper: includeSeededDemos
          ? "Queued or processing (seeded queue)"
          : "From the active generations queue",
      },
      {
        label: "Projects waiting for review",
        value: String(projectsWaitingForReview),
        helper: "Human checkpoint required",
      },
      {
        label: "Runway credits used",
        value: creditsDisplayed.toLocaleString("en-US"),
        helper: creditsHelper,
      },
      {
        label: "Runway credits remaining",
        value: budget.runwayBalanceKnown
          ? estimatedCreditsRemaining.toLocaleString("en-US")
          : "n/a",
        helper: remainingHelper,
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
  metrics?: {
    acceptedSegments: number;
    totalSegments: number;
    activeTaskCount: number;
    totalCostCredits: number;
    ownerName: string;
    nextAction: string;
    nextActionHref: string | null;
  },
): VideoDashboardProject {
  const source = project.recipeData?.source as
    | { type?: string; demoRecipeId?: string | null; uploadedFileNames?: string[] }
    | undefined;
  const recipeSourceKind = getRecipeSourceKind(source?.type);

  return {
    id: project.id,
    title: project.title,
    recipeNumber: project.recipeNumber,
    recipeSourceKind,
    recipeSourceLabel: getRecipeSourceLabel(recipeSourceKind),
    status: project.status,
    agentStatus: normalizeAgentStatus(project.agentStatus),
    thumbnailLabel: project.title,
    thumbnailTone: recipeSourceKind === "demo_fixture" ? "amber" : "sky",
    thumbnailUrl,
    acceptedSegments: metrics?.acceptedSegments ?? 0,
    totalSegments: metrics?.totalSegments ?? 0,
    activeTaskCount: metrics?.activeTaskCount ?? 0,
    totalCostCredits: metrics?.totalCostCredits ?? project.totalCostCredits,
    updatedAt: project.updatedAt,
    ownerName: metrics?.ownerName ?? "Licorn Ops",
    nextAction: metrics?.nextAction ?? "Awaiting recipe ingest",
    nextActionHref: metrics?.nextActionHref ?? null,
    archivedAt: project.archivedAt ?? null,
    canArchive: true,
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

function normalizeAgentStatus(
  status: VideoProject["agentStatus"] | undefined,
): RecipeAgentStatus {
  if (
    status === "idle" ||
    status === "running" ||
    status === "needs_sync" ||
    status === "validation_failed" ||
    status === "failed"
  ) {
    return status;
  }

  return "idle";
}
