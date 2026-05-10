import "server-only";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { MediaStorageBucket } from "@/modules/media-assets/media-asset.constants";
import { createStorageSignedUrl } from "@/modules/media-assets/services/storage.service";
import {
  getMediaAssetById,
  listMediaAssetsByVideoId,
} from "@/modules/media-assets/repositories/media-asset.repository";
import { listSegmentsByVideoId } from "@/modules/storyboard/repositories/segment.repository";
import type { SeedanceSegment } from "@/modules/storyboard/storyboard.types";

import type {
  ReferenceAsset,
  ReferenceAssetReviewItem,
  ReferenceReviewData,
} from "../reference.types";
import { listReferenceAssetsForVideo } from "../repositories/reference.repository";
import {
  buildSegmentReadiness,
  doesSegmentReferenceMatch,
} from "./reference-readiness";

export async function getReferenceReviewData(
  supabase: SupabaseDataClient,
  videoId: string,
): Promise<ReferenceReviewData> {
  const [references, videoMediaAssets, segments] = await Promise.all([
    listReferenceAssetsForVideo(supabase, videoId),
    listMediaAssetsByVideoId(supabase, videoId),
    listSegmentsByVideoId(supabase, videoId),
  ]);

  const mediaById = new Map(videoMediaAssets.map((asset) => [asset.id, asset]));
  const items = await Promise.all(
    references.map(async (reference) => {
      const mediaAsset =
        reference.mediaAssetId && mediaById.has(reference.mediaAssetId)
          ? mediaById.get(reference.mediaAssetId)
          : reference.mediaAssetId
            ? await getMediaAssetById(supabase, reference.mediaAssetId)
            : null;

      return {
        reference,
        mediaAsset,
        previewUrl: await createPreviewUrl(supabase, mediaAsset),
        usedInSegments: getUsedInSegments(reference, segments),
      } satisfies ReferenceAssetReviewItem;
    }),
  );

  return {
    globalReferences: items.filter(
      (item) => item.reference.videoId === null && item.reference.status !== "rejected",
    ),
    recipeReferences: items.filter(
      (item) => item.reference.videoId === videoId && item.reference.status !== "rejected",
    ),
    rejectedReferences: items.filter((item) => item.reference.status === "rejected"),
    missingReferences: items.filter((item) => isMissingReference(item)),
    segmentReadiness: buildSegmentReadiness(references, segments),
  };
}

function isMissingReference(item: ReferenceAssetReviewItem): boolean {
  const { reference } = item;

  if (reference.status === "rejected") {
    return false;
  }

  if (reference.status === "planned" || reference.status === "generating") {
    return true;
  }

  if (reference.status === "failed") {
    return true;
  }

  if (!reference.runwayUri) {
    return true;
  }

  return false;
}

function getUsedInSegments(
  reference: ReferenceAsset,
  segments: SeedanceSegment[],
) {
  return segments
    .filter((segment) =>
      segment.references.some((segmentReference) =>
        doesSegmentReferenceMatch(reference, segmentReference),
      ),
    )
    .map((segment) => segment.title);
}

async function createPreviewUrl(
  supabase: SupabaseDataClient,
  mediaAsset: ReferenceAssetReviewItem["mediaAsset"],
) {
  if (!mediaAsset?.storageBucket || !mediaAsset.storagePath) {
    return null;
  }

  return createStorageSignedUrl(supabase, {
    bucket: mediaAsset.storageBucket as MediaStorageBucket,
    path: mediaAsset.storagePath,
    expiresInSeconds: 60 * 15,
  });
}
