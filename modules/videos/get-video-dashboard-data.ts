import { ACTIONABLE_VIDEO_STATUSES } from "./video-status";
import type {
  ActiveGenerationQueueItem,
  VideoDashboardData,
  VideoDashboardProject,
} from "./video-dashboard.types";

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

export function getVideoDashboardData(): VideoDashboardData {
  const activeVideos = SEEDED_PROJECTS.filter(
    (project) => project.status !== "exported" && project.status !== "failed",
  ).length;
  const segmentsGenerating = SEEDED_ACTIVE_QUEUE.filter(
    (task) => task.status === "processing" || task.status === "queued",
  ).length;
  const projectsWaitingForReview = SEEDED_PROJECTS.filter((project) =>
    ACTIONABLE_VIDEO_STATUSES.includes(project.status),
  ).length;
  const creditsUsed = SEEDED_PROJECTS.reduce(
    (total, project) => total + project.totalCostCredits,
    0,
  );
  const estimatedCreditsRemaining = 50000 - creditsUsed;
  const videosCompleted = SEEDED_PROJECTS.filter(
    (project) => project.status === "exported",
  ).length;

  return {
    projects: SEEDED_PROJECTS,
    activeQueue: SEEDED_ACTIVE_QUEUE,
    creditsUsed,
    estimatedCreditsRemaining,
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
        helper: "From 50,000 hackathon credits",
      },
      {
        label: "Videos completed",
        value: String(videosCompleted),
        helper: "Exported final videos",
      },
    ],
  };
}
