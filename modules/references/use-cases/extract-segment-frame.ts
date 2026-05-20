import "server-only";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";
import { insertStoredMediaAsset } from "@/modules/media-assets/repositories/media-asset.repository";
import {
  buildExtractedFrameStoragePath,
  EXTRACTED_FRAME_DEFAULT_HEIGHT,
  EXTRACTED_FRAME_DEFAULT_WIDTH,
  EXTRACTED_FRAME_MIME_TYPE,
  EXTRACTED_FRAME_STORAGE_BUCKET,
  fetchMuxThumbnail,
} from "@/modules/media-assets/services/frame-extraction.service";
import { uploadStorageObject } from "@/modules/media-assets/services/storage.service";

import {
  getReferenceAssetByCanonicalNameForVideo,
  upsertExtractedFrameReferenceAsset,
} from "../repositories/reference.repository";
import type { ReferenceAsset } from "../reference.types";

export interface ExtractSegmentFrameInput {
  /** Source segment whose render the frame is pulled from. */
  sourceSegmentId: string;
  /** Timestamp in seconds. Clamped to >= 0; the service trusts Mux for the upper bound. */
  timestampSeconds: number;
  /**
   * Stable canonical name to surface the new reference under in
   * `reference-plan.json`-style flows. Defaults to a deterministic
   * `<sourceSegmentTitle>FrameAt<seconds>` slug if not provided.
   */
  canonicalName?: string;
  /** Optional human-facing description copied to `reference_assets.prompt`. */
  prompt?: string | null;
  createdBy: string;
}

export interface ExtractSegmentFrameResult {
  reference: ReferenceAsset;
  /** UUID of the freshly-created `media_assets` row. */
  mediaAssetId: string;
  /** Bucket + path of the stored PNG; useful for logs. */
  storagePath: string;
  storageBucket: string;
}

interface SegmentMediaAssetLookupRow {
  id: string;
  video_id: string | null;
  segments:
    | {
        id: string;
        video_id: string;
        title: string | null;
      }
    | null;
  mux_playback_id: string | null;
  duration_seconds: number | string | null;
}

/**
 * End-to-end frame extraction:
 *
 *   1. Look up the source segment's stored Mux playback id.
 *   2. Download the PNG thumbnail at the requested timestamp from Mux.
 *   3. Upload the PNG to `reference-images/<videoId>/extracted-frames/...`.
 *   4. Insert a `media_assets` row of type `reference_image`.
 *   5. Insert a recipe-specific `reference_assets` row with
 *      `kind = extracted_frame` and `source_segment_id` populated.
 *
 * Storage is idempotent on the same `(segment, timestamp)` path
 * (`upsert: true` overwrites the PNG at that path). Each call always
 * inserts a new `media_assets` row. The `reference_assets` row is keyed
 * by `canonical_name`: reusing a name updates the existing reference in
 * place (same id, new active image) so planner wiring and
 * `segment_references` links stay valid — the same semantics as clicking
 * Regenerate on the references page.
 *
 * Throws when the source segment has not been uploaded to Mux yet, or
 * when the Mux thumbnail endpoint refuses to serve the timestamp after
 * `MAX_THUMBNAIL_FETCH_ATTEMPTS` retries.
 */
export async function extractSegmentFrameToReferenceAsset(
  supabase: SupabaseDataClient,
  input: ExtractSegmentFrameInput,
): Promise<ExtractSegmentFrameResult> {
  const segmentMedia = await loadSegmentRunwayMediaAsset(
    supabase,
    input.sourceSegmentId,
  );

  if (!segmentMedia.mux_playback_id) {
    throw new Error(
      `Cannot extract a frame from segment ${input.sourceSegmentId}: no Mux playback id is recorded yet. Wait for the Mux upload step to finish before extracting.`,
    );
  }

  const segment = segmentMedia.segments;
  if (!segment) {
    throw new Error(
      `Cannot extract a frame: media_asset ${segmentMedia.id} is not linked to a segment row.`,
    );
  }

  const timestampSeconds = clampNonNegative(input.timestampSeconds);

  // Bound the timestamp to the recorded duration when available, so a
  // typo of "10s" on a 5s clip surfaces a precise error rather than a
  // silent Mux 404 buried in 5 retry attempts.
  const durationRaw = segmentMedia.duration_seconds;
  const durationSeconds =
    durationRaw === null || durationRaw === undefined
      ? null
      : Number(durationRaw);
  if (
    durationSeconds !== null &&
    Number.isFinite(durationSeconds) &&
    timestampSeconds > durationSeconds
  ) {
    throw new Error(
      `Timestamp ${timestampSeconds}s is past the segment duration (${durationSeconds.toFixed(2)}s). Pick a value between 0 and the segment duration.`,
    );
  }

  const canonicalName =
    input.canonicalName?.trim() ||
    buildDefaultExtractedFrameCanonicalName({
      sourceSegmentTitle: segment.title ?? null,
      sourceSegmentId: input.sourceSegmentId,
      timestampSeconds,
    });

  const existingReference = await getReferenceAssetByCanonicalNameForVideo(
    supabase,
    { videoId: segment.video_id, canonicalName },
  );

  const thumbnail = await fetchMuxThumbnail({
    muxPlaybackId: segmentMedia.mux_playback_id,
    timestampSeconds,
  });

  const storagePath = buildExtractedFrameStoragePath({
    videoId: segment.video_id,
    sourceSegmentId: input.sourceSegmentId,
    timestampSeconds,
  });

  await uploadStorageObject(supabase, {
    bucket: EXTRACTED_FRAME_STORAGE_BUCKET,
    path: storagePath,
    body: thumbnail.buffer,
    contentType: EXTRACTED_FRAME_MIME_TYPE,
    upsert: true,
  });

  const mediaAsset = await insertStoredMediaAsset(supabase, {
    videoId: segment.video_id,
    segmentId: null,
    generationId: null,
    type: "reference_image",
    provider: "mux",
    storageBucket: EXTRACTED_FRAME_STORAGE_BUCKET,
    storagePath,
    mimeType: EXTRACTED_FRAME_MIME_TYPE,
    fileSizeBytes: thumbnail.buffer.byteLength,
    width: EXTRACTED_FRAME_DEFAULT_WIDTH,
    height: EXTRACTED_FRAME_DEFAULT_HEIGHT,
    status: "stored",
    metadata: {
      source: "extracted_frame",
      ...(existingReference ? { referenceId: existingReference.id } : {}),
      sourceSegmentId: input.sourceSegmentId,
      sourceTimestampSeconds: timestampSeconds,
      muxPlaybackId: segmentMedia.mux_playback_id,
      thumbnailUrl: thumbnail.thumbnailUrl,
    },
    createdBy: input.createdBy,
  });

  const reference = await upsertExtractedFrameReferenceAsset(supabase, {
    videoId: segment.video_id,
    mediaAssetId: mediaAsset.id,
    canonicalName,
    sourceSegmentId: input.sourceSegmentId,
    sourceTimestampSeconds: timestampSeconds,
    prompt: input.prompt ?? null,
  });

  return {
    reference,
    mediaAssetId: mediaAsset.id,
    storagePath,
    storageBucket: EXTRACTED_FRAME_STORAGE_BUCKET,
  };
}

async function loadSegmentRunwayMediaAsset(
  supabase: SupabaseDataClient,
  segmentId: string,
): Promise<SegmentMediaAssetLookupRow> {
  // We pick the latest runway_output asset for the segment. Multiple
  // generations on the same segment are common (review → re-run); the
  // most recent one is the render the operator is actively reviewing.
  const { data, error } = await supabase
    .from("media_assets")
    .select(
      "id, video_id, mux_playback_id, duration_seconds, segments:segments!media_assets_segment_id_fkey(id, video_id, title)",
    )
    .eq("segment_id", segmentId)
    .eq("type", "runway_output")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  throwIfSupabaseError(error, "loadSegmentRunwayMediaAsset failed");

  if (!data) {
    throw new Error(
      `No Runway output media_asset found for segment ${segmentId}. Generate the segment before extracting a frame.`,
    );
  }

  return data as unknown as SegmentMediaAssetLookupRow;
}

function buildDefaultExtractedFrameCanonicalName(input: {
  sourceSegmentTitle: string | null;
  sourceSegmentId: string;
  timestampSeconds: number;
}): string {
  const titleSlug = (input.sourceSegmentTitle ?? "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .slice(0, 32);
  const safeBase = titleSlug.length > 0 ? titleSlug : "Segment";
  const timestampSlug = input.timestampSeconds.toFixed(2).replace(".", "_");
  return `${safeBase}FrameAt${timestampSlug}s`;
}

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}
