import type { SDKImage } from "@cursor/sdk";

import { isAgentMessageAttachmentImage } from "@/modules/media-assets/agent-message-image-assets";
import {
  RECIPE_SOURCE_CURSOR_AGENT_MAX_IMAGES,
  RECIPE_SOURCE_CURSOR_AGENT_SIGNED_URL_TTL_SECONDS,
  type MediaStorageBucket,
} from "@/modules/media-assets/media-asset.constants";
import type { MediaAsset } from "@/modules/media-assets/media-asset.types";
import { listMediaAssetsByIds } from "@/modules/media-assets/repositories/media-asset.repository";
import { createStorageSignedUrl } from "@/modules/media-assets/services/storage-signed-url";
import type { SupabaseDataClient } from "@/shared/supabase/client.types";

export function mediaAssetToCursorImage(
  signedUrl: string,
  asset: MediaAsset,
): SDKImage {
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
 * Signed read URLs for explicit agent message attachment rows (any stage).
 */
export async function buildAgentAttachmentCursorImages(
  supabase: SupabaseDataClient | undefined,
  input: {
    videoId: string;
    mediaAssetIds: string[];
    maxImages?: number;
  },
): Promise<SDKImage[]> {
  if (!supabase || input.mediaAssetIds.length === 0) {
    return [];
  }

  const max = input.maxImages ?? RECIPE_SOURCE_CURSOR_AGENT_MAX_IMAGES;
  const assets = await listMediaAssetsByIds(supabase, input.mediaAssetIds);
  const imageAssets = assets.filter(
    (asset) =>
      asset.videoId === input.videoId &&
      isAgentMessageAttachmentImage(asset),
  );

  const results: SDKImage[] = [];

  for (const asset of imageAssets.slice(0, max)) {
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

    results.push(mediaAssetToCursorImage(signedUrl, asset));
  }

  return results;
}
