import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { MUX_BASIC_ESTIMATED_USD_PER_SECOND } from "@/modules/costs/cost.constants";
import { logCost } from "@/modules/costs/repositories/cost.repository";
import { updateGenerationMediaAsset } from "@/modules/generation/repositories/generation.repository";

import type { MediaAsset, MuxAssetResult } from "../media-asset.types";
import {
  getMediaAssetById,
  recordMuxUploadFailure,
  updateMediaAssetMuxPlayback,
} from "../repositories/media-asset.repository";
import { createMuxAssetFromUrl } from "../services/mux.service";

const MUX_SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function uploadMediaAssetToMux(
  mediaAssetId: string,
): Promise<MuxAssetResult> {
  const supabase = createSupabaseAdminClient();
  const mediaAsset = await getMediaAssetById(supabase, mediaAssetId);

  if (!mediaAsset) {
    throw new Error("Media asset not found.");
  }

  assertMuxUploadableMediaAsset(mediaAsset);

  try {
    const sourceUrl = await createSignedStorageUrl(mediaAsset);
    const muxAsset = await createMuxAssetFromUrl({
      mediaAssetId: mediaAsset.id,
      sourceUrl,
    });
    const metadata = {
      ...(mediaAsset.metadata ?? {}),
      mux: {
        assetId: muxAsset.muxAssetId,
        playbackId: muxAsset.muxPlaybackId,
        status: muxAsset.muxStatus,
        videoQuality: "basic",
      },
    };

    await updateMediaAssetMuxPlayback(supabase, {
      mediaAssetId: mediaAsset.id,
      muxAssetId: muxAsset.muxAssetId,
      muxPlaybackId: muxAsset.muxPlaybackId,
      metadata,
    });

    if (mediaAsset.generationId) {
      await updateGenerationMediaAsset(
        supabase,
        mediaAsset.generationId,
        mediaAsset.id,
      );
    }

    if (mediaAsset.videoId) {
      const estimatedDollars = estimateMuxCostDollars(mediaAsset.durationSeconds);

      await logCost(supabase, {
        videoId: mediaAsset.videoId,
        segmentId: mediaAsset.segmentId,
        provider: "mux",
        model: "basic-on-demand",
        operation: "media_asset_uploaded_to_mux",
        costDollars: estimatedDollars,
        metadata: {
          mediaAssetId: mediaAsset.id,
          muxAssetId: muxAsset.muxAssetId,
          muxPlaybackId: muxAsset.muxPlaybackId,
          estimatedDollarsPerSecond: MUX_BASIC_ESTIMATED_USD_PER_SECOND,
          estimated: true,
        },
        createdBy: mediaAsset.createdBy,
      });
    }

    return muxAsset;
  } catch (error) {
    // The Supabase original is intact; do NOT mark the media_asset as failed.
    // Per docs/technical-contracts.md § Storage Contract, Supabase Storage
    // remains the source of truth and the playback upload can be retried.
    await recordMuxUploadFailure(supabase, {
      mediaAssetId: mediaAsset.id,
      metadata: {
        ...(mediaAsset.metadata ?? {}),
        mux: {
          error: error instanceof Error ? error.message : "Mux upload failed.",
          failedAt: new Date().toISOString(),
          videoQuality: "basic",
        },
      },
    });

    throw error;
  }
}

/**
 * Estimate Mux Pay-as-you-go Basic delivery cost based on the asset duration.
 * Returns null when the duration is unknown so the cost log keeps a null value
 * rather than a misleading zero. The estimate is documented in
 * `MUX_BASIC_ESTIMATED_USD_PER_SECOND`.
 */
function estimateMuxCostDollars(
  durationSeconds: number | null | undefined,
): number | null {
  if (typeof durationSeconds !== "number" || durationSeconds <= 0) {
    return null;
  }
  return Number(
    (durationSeconds * MUX_BASIC_ESTIMATED_USD_PER_SECOND).toFixed(4),
  );
}

async function createSignedStorageUrl(mediaAsset: MediaAsset) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(mediaAsset.storageBucket!)
    .createSignedUrl(mediaAsset.storagePath!, MUX_SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw new Error(
      error
        ? `Unable to create Supabase signed URL: ${error.message}`
        : "Unable to create Supabase signed URL.",
    );
  }

  return data.signedUrl;
}

function assertMuxUploadableMediaAsset(mediaAsset: MediaAsset) {
  if (!mediaAsset.storageBucket || !mediaAsset.storagePath) {
    throw new Error(
      "Media asset must have a Supabase storage bucket and path before Mux upload.",
    );
  }

  if (mediaAsset.muxPlaybackId) {
    throw new Error("Media asset already has a Mux playback ID.");
  }

  const isVideoMimeType = mediaAsset.mimeType?.startsWith("video/") ?? false;
  const isMp4File =
    mediaAsset.originalFilename?.toLowerCase().endsWith(".mp4") ?? false;

  if (!isVideoMimeType && !isMp4File) {
    throw new Error("Mux upload expects a stored MP4 or video media asset.");
  }
}
