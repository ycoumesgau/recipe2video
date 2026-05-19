import type { RecipeAgentStatus } from "@/modules/recipe-agent/recipe-agent.types";
import type { VideoStatus } from "./video-status";

export type RecipeSourceKind = "url" | "photos" | "pasted_text" | "demo_fixture";

export type DashboardSortKey = "updated" | "cost" | "completion" | "status";

export interface VideoDashboardProject {
  id: string;
  title: string;
  recipeSourceKind: RecipeSourceKind;
  recipeSourceLabel: string;
  status: VideoStatus;
  agentStatus: RecipeAgentStatus;
  thumbnailLabel: string;
  thumbnailTone: "pink" | "amber" | "emerald" | "sky";
  /**
   * Mux thumbnail URL for the project's first accepted clip when available.
   * Mux generates thumbnails on-demand from the public playback ID via
   * `https://image.mux.com/{playbackId}/thumbnail.jpg`. Falls back to the
   * gradient placeholder when no playback is available yet.
   */
  thumbnailUrl?: string | null;
  acceptedSegments: number;
  totalSegments: number;
  activeTaskCount: number;
  totalCostCredits: number;
  updatedAt: string;
  ownerName: string;
  nextAction: string;
  archivedAt?: string | null;
  /** Real persisted rows (Supabase) can be archived; seeded demos cannot. */
  canArchive: boolean;
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

export interface VideoLibraryPagination {
  page: number;
  pageSize: number;
  totalProjects: number;
  totalPages: number;
}

export interface VideoDashboardData {
  projects: VideoDashboardProject[];
  activeQueue: ActiveGenerationQueueItem[];
  kpis: DashboardKpi[];
  creditsUsed: number;
  estimatedCreditsRemaining: number;
  budgetWarningLevel: 20 | 10 | null;
  budgetPercentRemaining: number;
  /** True when seeded demo cards/queue are mixed into this dashboard view. */
  usesMockDashboardDemos: boolean;
  /** Mirrors Runway GET /v1/organization creditBalance availability. */
  runwayBalanceKnown: boolean;
  pagination: VideoLibraryPagination;
}
