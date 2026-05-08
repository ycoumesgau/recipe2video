import type { Json } from "@/shared/supabase/database.types";

import type { GenerationStatus } from "./generation-status";

export interface Generation {
  id: string;
  segmentId: string;
  mediaAssetId?: string | null;
  model: string;
  modelParams: Record<string, unknown>;
  runwayTaskId?: string | null;
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
  status?: GenerationStatus;
  costCredits?: number | null;
  durationSeconds?: number | null;
  triggeredBy?: string | null;
}

export interface UpdateGenerationStatusInput {
  generationId: string;
  status: GenerationStatus;
  mediaAssetId?: string | null;
  costCredits?: number | null;
  durationSeconds?: number | null;
  completedAt?: string | null;
}
