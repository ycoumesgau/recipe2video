import type { SupabaseDataClient } from "@/shared/supabase/client.types";

import type { MediaStorageBucket } from "../media-asset.constants";
import type { MediaAsset } from "../media-asset.types";
import { tryCreateStorageSignedUrl } from "./storage-signed-url";

type PreviewableMediaAsset = Pick<
  MediaAsset,
  "mimeType" | "storageBucket" | "storagePath" | "metadata"
>;

/**
 * Storage path used for dashboard thumbnails. Image assets use their own
 * object; video library references use an optional poster frame stored
 * alongside the MP4 (see `previewStoragePath` metadata or the
 * `-poster.jpg` naming convention).
 */
export function resolveMediaAssetPreviewStoragePath(
  mediaAsset: PreviewableMediaAsset,
): string | null {
  if (!mediaAsset.storagePath) {
    return null;
  }

  if (mediaAsset.mimeType?.startsWith("video/")) {
    const metadataPath = readPreviewStoragePathFromMetadata(mediaAsset.metadata);
    if (metadataPath) {
      return metadataPath;
    }

    return deriveVideoPosterStoragePath(mediaAsset.storagePath);
  }

  return mediaAsset.storagePath;
}

export async function tryCreateMediaAssetPreviewSignedUrl(
  supabase: SupabaseDataClient,
  mediaAsset: PreviewableMediaAsset,
  options: { expiresInSeconds?: number } = {},
): Promise<string | null> {
  const previewPath = resolveMediaAssetPreviewStoragePath(mediaAsset);
  if (!mediaAsset.storageBucket || !previewPath) {
    return null;
  }

  return tryCreateStorageSignedUrl(supabase, {
    bucket: mediaAsset.storageBucket as MediaStorageBucket,
    path: previewPath,
    expiresInSeconds: options.expiresInSeconds,
  });
}

function readPreviewStoragePathFromMetadata(
  metadata: MediaAsset["metadata"],
): string | null {
  const value = metadata?.previewStoragePath;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/** `library/.../Foo.mp4` → `library/.../Foo-poster.jpg` */
export function deriveVideoPosterStoragePath(videoStoragePath: string): string | null {
  if (!videoStoragePath.toLowerCase().endsWith(".mp4")) {
    return null;
  }

  return videoStoragePath.replace(/\.mp4$/i, "-poster.jpg");
}
