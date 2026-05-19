import type { MediaAsset } from "./media-asset.types";

/**
 * Parse the recipe `reference_assets.id` encoded in a reference_image storage
 * path. Supports:
 *   - legacy: `{videoId}/{referenceId}.png`
 *   - variants: `{videoId}/{referenceId}/{variantId}.png`
 */
export function getReferenceIdFromReferenceImageStoragePath(
  storagePath: string,
  videoId: string,
): string | null {
  const prefix = `${videoId}/`;
  if (!storagePath.startsWith(prefix)) {
    return null;
  }

  const remainder = storagePath.slice(prefix.length);
  const slashIndex = remainder.indexOf("/");

  if (slashIndex === -1) {
    const dotIndex = remainder.lastIndexOf(".");
    return dotIndex > 0 ? remainder.slice(0, dotIndex) : remainder || null;
  }

  return remainder.slice(0, slashIndex) || null;
}

export function referenceIdFromMediaAsset(
  asset: Pick<MediaAsset, "videoId" | "storagePath" | "metadata">,
): string | null {
  const metadata = asset.metadata ?? {};
  const fromMetadata =
    typeof metadata.referenceId === "string" ? metadata.referenceId : null;
  if (fromMetadata) {
    return fromMetadata;
  }

  if (!asset.videoId || !asset.storagePath) {
    return null;
  }

  return getReferenceIdFromReferenceImageStoragePath(
    asset.storagePath,
    asset.videoId,
  );
}
