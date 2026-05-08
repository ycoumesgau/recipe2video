import type { MediaAssetStatus } from "./media-asset-status";

export type MediaAssetType =
  | "recipe_source"
  | "reference_image"
  | "runway_output"
  | "accepted_clip"
  | "suno_audio"
  | "final_export";

export type MediaAssetProvider =
  | "supabase"
  | "mux"
  | "runway"
  | "suno"
  | "manual";

export interface MediaAsset {
  id: string;
  videoId?: string | null;
  segmentId?: string | null;
  generationId?: string | null;
  type: MediaAssetType;
  provider: MediaAssetProvider;
  storageBucket?: string | null;
  storagePath?: string | null;
  muxAssetId?: string | null;
  muxPlaybackId?: string | null;
  runwayOutputUrl?: string | null;
  originalFilename?: string | null;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
  durationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
  status: MediaAssetStatus;
  metadata?: Record<string, unknown> | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeSourceMediaAssetInput {
  videoId: string;
  storageBucket: string;
  storagePath: string;
  originalFilename: string;
  mimeType: string | null;
  fileSizeBytes: number;
  createdBy?: string | null;
}
