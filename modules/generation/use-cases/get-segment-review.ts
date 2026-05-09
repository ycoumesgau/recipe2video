import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { MediaAsset } from "@/modules/media-assets/media-asset.types";
import { listMediaAssetsByGenerationIds } from "@/modules/media-assets/repositories/media-asset.repository";
import type { SeedanceSegment } from "@/modules/storyboard/storyboard.types";
import { getSegmentById } from "@/modules/storyboard/repositories/segment.repository";
import type { VideoProject } from "@/modules/videos/video.types";
import { getVideoProjectById } from "@/modules/videos/repositories/video.repository";

import type { Generation } from "../generation.types";
import { listGenerationsBySegmentId } from "../repositories/generation.repository";

export interface SegmentVariantReviewItem {
  generation: Generation;
  mediaAsset: MediaAsset | null;
}

export interface SegmentReviewData {
  project: VideoProject | null;
  segment: SeedanceSegment | null;
  variants: SegmentVariantReviewItem[];
}

export async function getSegmentReviewData(
  supabase: SupabaseDataClient,
  input: {
    videoId: string;
    segmentId: string;
  },
): Promise<SegmentReviewData> {
  const segment = await getSegmentById(supabase, input.segmentId);

  if (!segment || segment.videoId !== input.videoId) {
    return {
      project: null,
      segment: null,
      variants: [],
    };
  }

  const [project, generations] = await Promise.all([
    getVideoProjectById(supabase, input.videoId),
    listGenerationsBySegmentId(supabase, input.segmentId),
  ]);
  const mediaAssets = await listMediaAssetsByGenerationIds(
    supabase,
    generations.map((generation) => generation.id),
  );
  const mediaAssetByGenerationId = new Map(
    mediaAssets.flatMap((asset) =>
      asset.generationId ? [[asset.generationId, asset] as const] : [],
    ),
  );
  const mediaAssetById = new Map(mediaAssets.map((asset) => [asset.id, asset]));

  return {
    project,
    segment,
    variants: generations.map((generation) => ({
      generation,
      mediaAsset:
        (generation.mediaAssetId
          ? mediaAssetById.get(generation.mediaAssetId)
          : null) ??
        mediaAssetByGenerationId.get(generation.id) ??
        null,
    })),
  };
}
