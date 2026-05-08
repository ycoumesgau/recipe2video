import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { Database } from "@/shared/supabase/database.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";
import { fromJson, toJson } from "@/shared/supabase/json";

import type {
  MediaAsset,
  RecipeSourceMediaAssetInput,
} from "../media-asset.types";
import type { MediaAssetStatus } from "../media-asset-status";

type MediaAssetRow = Database["public"]["Tables"]["media_assets"]["Row"];

export async function insertRecipeSourceMediaAssets(
  supabase: SupabaseDataClient,
  assets: RecipeSourceMediaAssetInput[],
) {
  if (assets.length === 0) {
    return;
  }

  const { error } = await supabase.from("media_assets").insert(
    assets.map((asset) => ({
      video_id: asset.videoId,
      type: "recipe_source",
      provider: "supabase",
      storage_bucket: asset.storageBucket,
      storage_path: asset.storagePath,
      original_filename: asset.originalFilename,
      mime_type: asset.mimeType,
      file_size_bytes: asset.fileSizeBytes,
      status: "stored",
      metadata: {},
      created_by: asset.createdBy ?? null,
    })),
  );

  throwIfSupabaseError(error, "insertRecipeSourceMediaAssets failed");
}

export async function getMediaAssetById(
  supabase: SupabaseDataClient,
  mediaAssetId: string,
): Promise<MediaAsset | null> {
  const { data, error } = await supabase
    .from("media_assets")
    .select("*")
    .eq("id", mediaAssetId)
    .maybeSingle();

  throwIfSupabaseError(error, "getMediaAssetById failed");
  return data ? mapMediaAsset(data) : null;
}

export async function listMuxUploadCandidates(
  supabase: SupabaseDataClient,
  limit = 10,
): Promise<MediaAsset[]> {
  const { data, error } = await supabase
    .from("media_assets")
    .select("*")
    .not("storage_bucket", "is", null)
    .not("storage_path", "is", null)
    .is("mux_playback_id", null)
    .order("updated_at", { ascending: false })
    .limit(limit);

  throwIfSupabaseError(error, "listMuxUploadCandidates failed");
  return data.map(mapMediaAsset).filter(isLikelyMuxVideoAsset);
}

export async function listMuxPlayableMediaAssets(
  supabase: SupabaseDataClient,
  limit = 10,
): Promise<MediaAsset[]> {
  const { data, error } = await supabase
    .from("media_assets")
    .select("*")
    .not("mux_playback_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(limit);

  throwIfSupabaseError(error, "listMuxPlayableMediaAssets failed");
  return data.map(mapMediaAsset);
}

export async function updateMediaAssetMuxPlayback(
  supabase: SupabaseDataClient,
  input: {
    mediaAssetId: string;
    muxAssetId: string;
    muxPlaybackId: string;
    metadata?: Record<string, unknown> | null;
  },
): Promise<MediaAsset> {
  const { data, error } = await supabase
    .from("media_assets")
    .update({
      mux_asset_id: input.muxAssetId,
      mux_playback_id: input.muxPlaybackId,
      status: "uploaded_to_mux",
      metadata: input.metadata ? toJson(input.metadata) : undefined,
    })
    .eq("id", input.mediaAssetId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updateMediaAssetMuxPlayback failed");
  return mapMediaAsset(data);
}

export async function markMediaAssetFailed(
  supabase: SupabaseDataClient,
  input: {
    mediaAssetId: string;
    metadata?: Record<string, unknown> | null;
  },
): Promise<MediaAsset> {
  const { data, error } = await supabase
    .from("media_assets")
    .update({
      status: "failed",
      metadata: input.metadata ? toJson(input.metadata) : undefined,
    })
    .eq("id", input.mediaAssetId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "markMediaAssetFailed failed");
  return mapMediaAsset(data);
}

export function mapMediaAsset(row: MediaAssetRow): MediaAsset {
  return {
    id: row.id,
    videoId: row.video_id,
    segmentId: row.segment_id,
    generationId: row.generation_id,
    type: row.type as MediaAsset["type"],
    provider: row.provider as MediaAsset["provider"],
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    muxAssetId: row.mux_asset_id,
    muxPlaybackId: row.mux_playback_id,
    runwayOutputUrl: row.runway_output_url,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    durationSeconds: row.duration_seconds,
    width: row.width,
    height: row.height,
    status: row.status as MediaAssetStatus,
    metadata: fromJson<Record<string, unknown>>(row.metadata),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isLikelyMuxVideoAsset(asset: MediaAsset) {
  if (asset.mimeType?.startsWith("video/")) {
    return true;
  }

  return asset.originalFilename?.toLowerCase().endsWith(".mp4") ?? false;
}
