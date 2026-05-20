import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { Database } from "@/shared/supabase/database.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";
import { fromJson, toJson } from "@/shared/supabase/json";

import { referenceIdFromMediaAsset } from "../reference-image-storage";
import type {
  MediaAsset,
  MediaAssetStorageLocation,
  RecipeSourceMediaAssetInput,
  StoredMediaAssetInput,
} from "../media-asset.types";
import type { MediaAssetStatus } from "../media-asset-status";

type MediaAssetRow = Database["public"]["Tables"]["media_assets"]["Row"];

export async function insertRecipeSourceMediaAssets(
  supabase: SupabaseDataClient,
  assets: RecipeSourceMediaAssetInput[],
): Promise<MediaAsset[]> {
  if (assets.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("media_assets")
    .insert(
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
        metadata: toJson({}),
        created_by: asset.createdBy ?? null,
      })),
    )
    .select("*");

  throwIfSupabaseError(error, "insertRecipeSourceMediaAssets failed");
  return data.map(mapMediaAsset);
}

export async function insertStoredMediaAsset(
  supabase: SupabaseDataClient,
  input: StoredMediaAssetInput,
): Promise<MediaAsset> {
  const { data, error } = await supabase
    .from("media_assets")
    .insert({
      video_id: input.videoId ?? null,
      segment_id: input.segmentId ?? null,
      generation_id: input.generationId ?? null,
      type: input.type,
      provider: input.provider,
      storage_bucket: input.storageBucket,
      storage_path: input.storagePath,
      runway_output_url: input.runwayOutputUrl ?? null,
      original_filename: input.originalFilename ?? null,
      mime_type: input.mimeType ?? null,
      file_size_bytes: input.fileSizeBytes ?? null,
      duration_seconds: input.durationSeconds ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      status: input.status ?? "stored",
      metadata: toJson(input.metadata ?? {}),
      created_by: input.createdBy ?? null,
    })
    .select("*")
    .single();

  throwIfSupabaseError(error, "insertStoredMediaAsset failed");

  if (input.generationId) {
    await linkGenerationMediaAsset(supabase, input.generationId, data.id);
  }

  return mapMediaAsset(data);
}

export async function listMediaAssetsByIds(
  supabase: SupabaseDataClient,
  mediaAssetIds: string[],
): Promise<MediaAsset[]> {
  if (mediaAssetIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("media_assets")
    .select("*")
    .in("id", mediaAssetIds);

  throwIfSupabaseError(error, "listMediaAssetsByIds failed");
  return (data ?? []).map(mapMediaAsset);
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

export async function getMediaAssetStorageLocation(
  supabase: SupabaseDataClient,
  mediaAssetId: string,
): Promise<MediaAssetStorageLocation | null> {
  const { data, error } = await supabase
    .from("media_assets")
    .select("id, storage_bucket, storage_path")
    .eq("id", mediaAssetId)
    .maybeSingle();

  throwIfSupabaseError(error, "getMediaAssetStorageLocation failed");

  if (!data?.storage_bucket || !data.storage_path) {
    return null;
  }

  return {
    id: data.id,
    storageBucket: data.storage_bucket,
    storagePath: data.storage_path,
  };
}

export async function listMediaAssetsByVideoId(
  supabase: SupabaseDataClient,
  videoId: string,
): Promise<MediaAsset[]> {
  const { data, error } = await supabase
    .from("media_assets")
    .select("*")
    .eq("video_id", videoId)
    .order("created_at", { ascending: false });

  throwIfSupabaseError(error, "listMediaAssetsByVideoId failed");
  return data.map(mapMediaAsset);
}

/** Recipe source rows for a video, oldest first (upload order). */
export async function listRecipeSourceMediaAssetsByVideoIdAsc(
  supabase: SupabaseDataClient,
  videoId: string,
): Promise<MediaAsset[]> {
  const { data, error } = await supabase
    .from("media_assets")
    .select("*")
    .eq("video_id", videoId)
    .eq("type", "recipe_source")
    .order("created_at", { ascending: true });

  throwIfSupabaseError(error, "listRecipeSourceMediaAssetsByVideoIdAsc failed");
  return data.map(mapMediaAsset);
}

/**
 * All stored reference_image rows for a video, newest first. Used to build
 * per-reference variant galleries (regenerations keep prior files).
 */
export async function listReferenceImageMediaAssetsByVideoId(
  supabase: SupabaseDataClient,
  videoId: string,
): Promise<MediaAsset[]> {
  const { data, error } = await supabase
    .from("media_assets")
    .select("*")
    .eq("video_id", videoId)
    .eq("type", "reference_image")
    .order("created_at", { ascending: false });

  throwIfSupabaseError(error, "listReferenceImageMediaAssetsByVideoId failed");
  return data.map(mapMediaAsset);
}

export async function getReferenceImageMediaAssetByRunwayTaskId(
  supabase: SupabaseDataClient,
  input: {
    videoId: string;
    referenceId: string;
    runwayTaskId: string;
  },
): Promise<MediaAsset | null> {
  const { data, error } = await supabase
    .from("media_assets")
    .select("*")
    .eq("video_id", input.videoId)
    .eq("type", "reference_image")
    .contains("metadata", {
      referenceId: input.referenceId,
      runwayTaskId: input.runwayTaskId,
    })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  throwIfSupabaseError(
    error,
    "getReferenceImageMediaAssetByRunwayTaskId failed",
  );
  return data ? mapMediaAsset(data) : null;
}

export function groupReferenceImageVariantsByReferenceId(
  assets: MediaAsset[],
): Map<string, MediaAsset[]> {
  const grouped = new Map<string, MediaAsset[]>();

  for (const asset of assets) {
    const referenceId = referenceIdFromMediaAsset(asset);
    if (!referenceId) {
      continue;
    }
    const bucket = grouped.get(referenceId) ?? [];
    bucket.push(asset);
    grouped.set(referenceId, bucket);
  }

  return grouped;
}

export async function listMediaAssetsByGenerationIds(
  supabase: SupabaseDataClient,
  generationIds: string[],
): Promise<MediaAsset[]> {
  if (generationIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("media_assets")
    .select("*")
    .in("generation_id", generationIds)
    .order("created_at", { ascending: false });

  throwIfSupabaseError(error, "listMediaAssetsByGenerationIds failed");
  return data.map(mapMediaAsset);
}

async function linkGenerationMediaAsset(
  supabase: SupabaseDataClient,
  generationId: string,
  mediaAssetId: string,
) {
  const { error } = await supabase
    .from("generations")
    .update({ media_asset_id: mediaAssetId })
    .eq("id", generationId);

  throwIfSupabaseError(error, "linkGenerationMediaAsset failed");
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

/**
 * Build a map of `videoId -> mux_playback_id` so the dashboard can show a
 * Mux-generated thumbnail per project card. We pick the first accepted clip
 * with a Mux playback ID per video; runway_output rows are ignored to favour
 * user-validated content.
 */
export async function getProjectThumbnailPlaybackIds(
  supabase: SupabaseDataClient,
  videoIds: string[],
): Promise<Map<string, string>> {
  if (videoIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("media_assets")
    .select("video_id,mux_playback_id,type,updated_at")
    .in("video_id", videoIds)
    .eq("type", "accepted_clip")
    .not("mux_playback_id", "is", null)
    .order("updated_at", { ascending: false });

  throwIfSupabaseError(error, "getProjectThumbnailPlaybackIds failed");

  const result = new Map<string, string>();
  for (const row of data ?? []) {
    if (!row.video_id || !row.mux_playback_id) continue;
    if (!result.has(row.video_id)) {
      result.set(row.video_id, row.mux_playback_id);
    }
  }
  return result;
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

/**
 * Record a Mux upload failure WITHOUT changing the media asset status. The
 * Supabase Storage original is still the durable source of truth per
 * `docs/technical-contracts.md` § Storage Contract: "If Mux upload fails, the
 * Supabase Storage original remains the source of truth and can be re-uploaded
 * later." Only metadata.mux is updated so we keep the failure trace and can
 * retry the playback upload later.
 */
export async function recordMuxUploadFailure(
  supabase: SupabaseDataClient,
  input: {
    mediaAssetId: string;
    metadata: Record<string, unknown>;
  },
): Promise<MediaAsset> {
  const { data, error } = await supabase
    .from("media_assets")
    .update({
      metadata: toJson(input.metadata),
    })
    .eq("id", input.mediaAssetId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "recordMuxUploadFailure failed");
  return mapMediaAsset(data);
}

function isLikelyMuxVideoAsset(asset: MediaAsset) {
  if (asset.mimeType?.startsWith("video/")) {
    return true;
  }

  return asset.originalFilename?.toLowerCase().endsWith(".mp4") ?? false;
}
