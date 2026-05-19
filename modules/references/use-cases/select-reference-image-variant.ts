import "server-only";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import { getMediaAssetById } from "@/modules/media-assets/repositories/media-asset.repository";
import { referenceIdFromMediaAsset } from "@/modules/media-assets/reference-image-storage";

import type { ReferenceAsset } from "../reference.types";
import {
  getReferenceAssetById,
  updateReferenceAssetMedia,
} from "../repositories/reference.repository";

/**
 * Point a recipe-specific reference at a previously generated image variant
 * (same pattern as accepting a Seedance generation on a segment).
 */
export async function selectReferenceImageVariant(
  supabase: SupabaseDataClient,
  input: {
    referenceId: string;
    mediaAssetId: string;
  },
): Promise<ReferenceAsset> {
  const reference = await getReferenceAssetById(supabase, input.referenceId);

  if (!reference) {
    throw new Error("Reference asset not found.");
  }

  if (!reference.videoId) {
    throw new Error("Reference is not bound to a video.");
  }

  const mediaAsset = await getMediaAssetById(supabase, input.mediaAssetId);

  if (!mediaAsset) {
    throw new Error("Reference image variant not found.");
  }

  if (mediaAsset.type !== "reference_image") {
    throw new Error("The selected asset is not a reference image.");
  }

  if (mediaAsset.videoId !== reference.videoId) {
    throw new Error("This image belongs to another project.");
  }

  const assetReferenceId = referenceIdFromMediaAsset(mediaAsset);

  if (assetReferenceId !== reference.id) {
    throw new Error("This image does not belong to the selected reference.");
  }

  if (!mediaAsset.storageBucket || !mediaAsset.storagePath) {
    throw new Error("The selected variant is not stored in Supabase Storage.");
  }

  const switchingVariant = reference.mediaAssetId !== mediaAsset.id;
  const needsReReview =
    switchingVariant &&
    (reference.status === "approved" ||
      reference.status === "uploaded_to_runway");

  return updateReferenceAssetMedia(supabase, {
    referenceId: reference.id,
    mediaAssetId: mediaAsset.id,
    status: needsReReview ? "generated" : reference.status,
    clearRunwayUri: switchingVariant && Boolean(reference.runwayUri),
  });
}
