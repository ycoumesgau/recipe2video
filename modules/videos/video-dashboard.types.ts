import type { VideoStatus } from "./video-status";

export type RecipeSourceKind = "url" | "photos" | "pasted_text" | "demo_fixture";

export type DashboardSortKey = "updated" | "cost" | "completion" | "status";

export interface VideoDashboardProject {
  id: string;
  title: string;
  recipeSourceKind: RecipeSourceKind;
  recipeSourceLabel: string;
  status: VideoStatus;
  thumbnailLabel: string;
  thumbnailTone: "pink" | "amber" | "emerald" | "sky";
  acceptedSegments: number;
  totalSegments: number;
  activeTaskCount: number;
  totalCostCredits: number;
  updatedAt: string;
  ownerName: string;
  nextAction: string;
}

export interface ActiveGenerationQueueItem {
  id: string;
  projectId: string;
  projectTitle: string;
  targetLabel: string;
  operation: string;
  model: string;
  status: "queued" | "processing" | "failed" | "succeeded";
  progress: number;
  costEstimateCredits: number;
  triggeredBy: string;
  startedAt: string;
}

export interface DashboardKpi {
  label: string;
  value: string;
  helper: string;
}

export interface VideoDashboardData {
  projects: VideoDashboardProject[];
  activeQueue: ActiveGenerationQueueItem[];
  kpis: DashboardKpi[];
  creditsUsed: number;
  estimatedCreditsRemaining: number;
  budgetWarningLevel: 20 | 10 | null;
  budgetPercentRemaining: number;
}
