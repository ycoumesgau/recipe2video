import type { Json } from "@/shared/supabase/database.types";

import type { GenerationStatus } from "./generation-status";
import type { RunwayTaskStatusValue } from "./runway.types";

export interface Generation {
  id: string;
  segmentId: string;
  mediaAssetId?: string | null;
  model: string;
  modelParams: Record<string, unknown>;
  runwayTaskId?: string | null;
  runwayTaskStatus?: RunwayTaskStatusValue | null;
  runwayProgress?: number | null;
  status: GenerationStatus;
  costCredits?: number | null;
  durationSeconds?: number | null;
  triggeredBy?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

export interface CreateGenerationInput {
  segmentId: string;
  model: string;
  modelParams?: Json;
  runwayTaskId?: string | null;
  runwayTaskStatus?: RunwayTaskStatusValue | null;
  runwayProgress?: number | null;
  status?: GenerationStatus;
  costCredits?: number | null;
  durationSeconds?: number | null;
  triggeredBy?: string | null;
}

export interface UpdateGenerationStatusInput {
  generationId: string;
  status: GenerationStatus;
  mediaAssetId?: string | null;
  runwayTaskStatus?: RunwayTaskStatusValue | null;
  runwayProgress?: number | null;
  costCredits?: number | null;
  durationSeconds?: number | null;
  completedAt?: string | null;
  /** Replaces `model_params` when set (e.g. Runway failure details on terminal poll). */
  modelParams?: Record<string, unknown>;
}
