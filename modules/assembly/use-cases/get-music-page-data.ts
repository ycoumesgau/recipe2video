import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import type { MediaAsset } from "@/modules/media-assets/media-asset.types";
import { listMediaAssetsByVideoId } from "@/modules/media-assets/repositories/media-asset.repository";
import { getStoryboardReviewData } from "@/modules/storyboard/use-cases/load-storyboard-fixture";
import { getVideoProjectById } from "@/modules/videos/repositories/video.repository";
import type { VideoProject } from "@/modules/videos/video.types";

import type { Composition } from "../assembly.types";
import { getLatestCompositionByVideoId } from "../repositories/assembly.repository";

export interface MusicPageData {
  project: VideoProject | null;
  logicalScenes: Awaited<
    ReturnType<typeof getStoryboardReviewData>
  >["logicalScenes"];
  seedanceSegments: Awaited<
    ReturnType<typeof getStoryboardReviewData>
  >["seedanceSegments"];
  sunoAudioAssets: MediaAsset[];
  composition: Composition | null;
}

export async function getMusicPageData(videoId: string): Promise<MusicPageData> {
  const supabase = createSupabaseAdminClient();
  const [project, storyboardData, mediaAssets, composition] = await Promise.all([
    getVideoProjectById(supabase, videoId),
    getStoryboardReviewData(videoId),
    listMediaAssetsByVideoId(supabase, videoId),
    getLatestCompositionByVideoId(supabase, videoId),
  ]);

  return {
    project,
    logicalScenes: storyboardData.logicalScenes,
    seedanceSegments: storyboardData.seedanceSegments,
    sunoAudioAssets: mediaAssets.filter((asset) => asset.type === "suno_audio"),
    composition,
  };
}

