import type { SDKImage } from "@cursor/sdk";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import {
  RECIPE_SOURCE_CURSOR_AGENT_MAX_IMAGES,
  RECIPE_SOURCE_CURSOR_AGENT_SIGNED_URL_TTL_SECONDS,
  type MediaStorageBucket,
} from "@/modules/media-assets/media-asset.constants";
import { isRecipeSourceImageFile } from "@/modules/media-assets/recipe-source-image-assets";
import { listRecipeSourceMediaAssetsByVideoIdAsc } from "@/modules/media-assets/repositories/media-asset.repository";
import { createStorageSignedUrl } from "@/modules/media-assets/services/storage-signed-url";
import type { MediaAsset } from "@/modules/media-assets/media-asset.types";
import type { VideoProject } from "@/modules/videos/video.types";
import { getRecipeSourceSummaryFromRecipeData } from "@/modules/videos/recipe-source-from-recipe-data";

import type { RecipeAgentStage } from "../recipe-agent.types";

function toCursorImage(signedUrl: string, asset: MediaAsset): SDKImage {
  const w = asset.width;
  const h = asset.height;

  if (
    typeof w === "number" &&
    typeof h === "number" &&
    Number.isFinite(w) &&
    Number.isFinite(h) &&
    w > 0 &&
    h > 0
  ) {
    return { url: signedUrl, dimension: { width: w, height: h } };
  }

  return { url: signedUrl };
}

/**
 * When `recipe_ingest` + recipe source type `photos`, returns signed read URLs for stored recipe images
 * (SDK vision). Empty otherwise.
 */
export async function buildRecipeSourceCursorImagesForAgent(
  supabase: SupabaseDataClient | undefined,
  project: VideoProject,
  stage: RecipeAgentStage,
): Promise<SDKImage[]> {
  if (!supabase || stage !== "recipe_ingest") {
    return [];
  }

  const summary = getRecipeSourceSummaryFromRecipeData(project.recipeData);
  if (summary?.type !== "photos") {
    return [];
  }

  const assets = await listRecipeSourceMediaAssetsByVideoIdAsc(
    supabase,
    project.id,
  );
  const imageAssets = assets.filter(isRecipeSourceImageFile);
  const capped = imageAssets.slice(0, RECIPE_SOURCE_CURSOR_AGENT_MAX_IMAGES);

  const results: SDKImage[] = [];

  for (const asset of capped) {
    const bucketRaw = asset.storageBucket ?? undefined;
    const path = asset.storagePath ?? undefined;

    if (!bucketRaw || !path) {
      continue;
    }

    const signedUrl = await createStorageSignedUrl(supabase, {
      bucket: bucketRaw as MediaStorageBucket,
      path,
      expiresInSeconds: RECIPE_SOURCE_CURSOR_AGENT_SIGNED_URL_TTL_SECONDS,
    });

    results.push(toCursorImage(signedUrl, asset));
  }

  return results;
}
