import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { Database } from "@/shared/supabase/database.types";

import {
  RECIPE_SOURCE_DASHBOARD_IMAGE_SIGNED_URL_TTL_SECONDS,
  type MediaStorageBucket,
} from "@/modules/media-assets/media-asset.constants";
import { isRecipeSourceImageFile } from "@/modules/media-assets/recipe-source-image-assets";
import type { MediaAsset } from "@/modules/media-assets/media-asset.types";
import { tryCreateStorageSignedUrl } from "@/modules/media-assets/services/storage-signed-url";
import { getMuxThumbnailUrl } from "@/modules/media-assets/services/mux.service";
import { throwIfSupabaseError } from "@/shared/supabase/errors";

import {
  pickProjectCardThumbnail,
  type ProjectCardThumbnailReferenceRow,
} from "../project-card-thumbnail";

type ReferenceAssetRow = Pick<
  Database["public"]["Tables"]["reference_assets"]["Row"],
  "video_id" | "canonical_name" | "media_asset_id" | "created_at"
>;

type MediaAssetRow = Database["public"]["Tables"]["media_assets"]["Row"];

/**
 * Signed thumbnail URLs for dashboard project cards. Recipe-specific photos
 * (especially `FinalDishVisual`) win over Mux clip thumbnails.
 */
export async function resolveProjectCardThumbnailUrls(
  supabase: SupabaseDataClient,
  videoIds: string[],
  muxPlaybackIdByVideoId: Map<string, string> = new Map(),
): Promise<Map<string, string>> {
  if (videoIds.length === 0) {
    return new Map();
  }

  const [referencesByVideoId, recipeSourceByVideoId] = await Promise.all([
    loadReferenceRowsByVideoId(supabase, videoIds),
    loadRecipeSourceImageIdsByVideoId(supabase, videoIds),
  ]);

  const result = new Map<string, string>();
  const mediaAssetIds = new Set<string>();
  const pendingMediaPicks = new Map<string, string>();

  for (const videoId of videoIds) {
    const pick = pickProjectCardThumbnail({
      references: referencesByVideoId.get(videoId) ?? [],
      recipeSourceImageAssetIds: recipeSourceByVideoId.get(videoId) ?? [],
      muxPlaybackId: muxPlaybackIdByVideoId.get(videoId) ?? null,
    });

    if (!pick) {
      continue;
    }

    if (pick.kind === "mux") {
      result.set(videoId, getMuxThumbnailUrl(pick.playbackId));
      continue;
    }

    mediaAssetIds.add(pick.mediaAssetId);
    pendingMediaPicks.set(videoId, pick.mediaAssetId);
  }

  const mediaById = await loadMediaAssetsByIds(supabase, [...mediaAssetIds]);

  for (const [videoId, mediaAssetId] of pendingMediaPicks) {
    const signedUrl = await signMediaAssetForDashboard(
      supabase,
      mediaById.get(mediaAssetId),
    );
    if (signedUrl) {
      result.set(videoId, signedUrl);
    }
  }

  return result;
}

async function loadReferenceRowsByVideoId(
  supabase: SupabaseDataClient,
  videoIds: string[],
): Promise<Map<string, ProjectCardThumbnailReferenceRow[]>> {
  const { data, error } = await supabase
    .from("reference_assets")
    .select("video_id,canonical_name,media_asset_id,created_at")
    .in("video_id", videoIds)
    .order("created_at", { ascending: true });

  throwIfSupabaseError(error, "loadReferenceRowsByVideoId failed");

  const grouped = new Map<string, ProjectCardThumbnailReferenceRow[]>();
  for (const row of (data ?? []) as ReferenceAssetRow[]) {
    if (!row.video_id) {
      continue;
    }
    const bucket = grouped.get(row.video_id) ?? [];
    bucket.push({
      canonicalName: row.canonical_name,
      mediaAssetId: row.media_asset_id,
      createdAt: row.created_at,
    });
    grouped.set(row.video_id, bucket);
  }
  return grouped;
}

async function loadRecipeSourceImageIdsByVideoId(
  supabase: SupabaseDataClient,
  videoIds: string[],
): Promise<Map<string, string[]>> {
  const { data, error } = await supabase
    .from("media_assets")
    .select("*")
    .in("video_id", videoIds)
    .eq("type", "recipe_source")
    .order("created_at", { ascending: true });

  throwIfSupabaseError(error, "loadRecipeSourceImageIdsByVideoId failed");

  const grouped = new Map<string, string[]>();
  for (const row of data ?? []) {
    if (!row.video_id) {
      continue;
    }
    const asset = mapMediaAssetRow(row as MediaAssetRow);
    if (!isRecipeSourceImageFile(asset)) {
      continue;
    }
    if (!asset.storageBucket || !asset.storagePath) {
      continue;
    }
    const bucket = grouped.get(row.video_id) ?? [];
    bucket.push(asset.id);
    grouped.set(row.video_id, bucket);
  }
  return grouped;
}

async function loadMediaAssetsByIds(
  supabase: SupabaseDataClient,
  mediaAssetIds: string[],
): Promise<Map<string, MediaAsset>> {
  if (mediaAssetIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("media_assets")
    .select("*")
    .in("id", mediaAssetIds)
    .not("storage_bucket", "is", null)
    .not("storage_path", "is", null);

  throwIfSupabaseError(error, "loadMediaAssetsByIds failed");

  const result = new Map<string, MediaAsset>();
  for (const row of data ?? []) {
    result.set(row.id, mapMediaAssetRow(row as MediaAssetRow));
  }
  return result;
}

async function signMediaAssetForDashboard(
  supabase: SupabaseDataClient,
  media: MediaAsset | undefined,
): Promise<string | null> {
  if (!media?.storageBucket || !media.storagePath) {
    return null;
  }

  return tryCreateStorageSignedUrl(supabase, {
    bucket: media.storageBucket as MediaStorageBucket,
    path: media.storagePath,
    expiresInSeconds: RECIPE_SOURCE_DASHBOARD_IMAGE_SIGNED_URL_TTL_SECONDS,
  });
}

function mapMediaAssetRow(row: MediaAssetRow): MediaAsset {
  return {
    id: row.id,
    videoId: row.video_id,
    segmentId: row.segment_id,
    generationId: row.generation_id,
    type: row.type as MediaAsset["type"],
    provider: row.provider as MediaAsset["provider"],
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    runwayOutputUrl: row.runway_output_url,
    muxAssetId: row.mux_asset_id,
    muxPlaybackId: row.mux_playback_id,
    durationSeconds: row.duration_seconds,
    width: row.width,
    height: row.height,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    originalFilename: row.original_filename,
    status: row.status as MediaAsset["status"],
    metadata: (row.metadata ?? {}) as MediaAsset["metadata"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}
