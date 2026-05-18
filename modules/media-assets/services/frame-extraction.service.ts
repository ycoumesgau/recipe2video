import { MEDIA_STORAGE_BUCKETS } from "../media-asset.constants";

const MUX_THUMBNAIL_BASE_URL = "https://image.mux.com";

/**
 * Default vertical 9:16 dimensions for thumbnails extracted from
 * Recipe2Video segments. Mux generates the thumbnail at the requested
 * resolution; we lock to the same canvas Seedance produces so the
 * extracted frame can be reused as a Seedance image reference without
 * any post-processing.
 */
const DEFAULT_THUMBNAIL_WIDTH = 1080;
const DEFAULT_THUMBNAIL_HEIGHT = 1920;

/**
 * Mux generates thumbnails on demand. For the very first request after a
 * fresh asset upload the response can be 412/404 for a few seconds; we
 * retry with exponential backoff so the operator does not have to retry
 * manually from the UI.
 */
const MAX_THUMBNAIL_FETCH_ATTEMPTS = 5;
const INITIAL_RETRY_DELAY_MS = 500;

export class MuxThumbnailFetchError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "MuxThumbnailFetchError";
  }
}

export interface MuxThumbnailFetchInput {
  /** Mux playback id (public policy) of the source video. */
  muxPlaybackId: string;
  /** Timestamp (in seconds) of the frame to extract. */
  timestampSeconds: number;
  /** Optional override for the rendered thumbnail width (default 1080). */
  width?: number;
  /** Optional override for the rendered thumbnail height (default 1920). */
  height?: number;
}

export interface MuxThumbnailFetchResult {
  /** PNG bytes returned by Mux. */
  buffer: Buffer;
  /** Final URL hit (useful for debugging and propagating to metadata). */
  thumbnailUrl: string;
}

/**
 * Build the Mux thumbnail URL for a given playback id, timestamp, and
 * canvas size. Exposed separately so the UI can render a live preview
 * before the operator commits to extracting the frame.
 */
export function buildMuxThumbnailUrl(input: MuxThumbnailFetchInput): string {
  const width = input.width ?? DEFAULT_THUMBNAIL_WIDTH;
  const height = input.height ?? DEFAULT_THUMBNAIL_HEIGHT;
  const time = clampNonNegative(input.timestampSeconds);
  const params = new URLSearchParams({
    time: time.toString(),
    width: width.toString(),
    height: height.toString(),
  });
  return `${MUX_THUMBNAIL_BASE_URL}/${encodeURIComponent(
    input.muxPlaybackId,
  )}/thumbnail.png?${params.toString()}`;
}

/**
 * Download a PNG thumbnail at the given timestamp. Retries on transient
 * 4xx/5xx so a freshly uploaded Mux asset's thumbnail-cache priming
 * doesn't surface as a hard error in the UI.
 */
export async function fetchMuxThumbnail(
  input: MuxThumbnailFetchInput,
): Promise<MuxThumbnailFetchResult> {
  const thumbnailUrl = buildMuxThumbnailUrl(input);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_THUMBNAIL_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(thumbnailUrl, {
        headers: { Accept: "image/png" },
      });
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        return { buffer: Buffer.from(arrayBuffer), thumbnailUrl };
      }
      // Mux returns 412 while the playback id is being primed and 404 if
      // the timestamp falls outside the asset's actual duration. Both are
      // worth retrying once because Mux is eventually consistent for the
      // first few seconds after an asset uploads.
      lastError = new MuxThumbnailFetchError(
        `Mux thumbnail fetch returned ${response.status} for ${thumbnailUrl}.`,
        response.status,
      );
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error(String(error));
    }
    await sleep(INITIAL_RETRY_DELAY_MS * 2 ** attempt);
  }

  throw (
    lastError ??
    new MuxThumbnailFetchError(
      `Mux thumbnail fetch failed for ${thumbnailUrl} after ${MAX_THUMBNAIL_FETCH_ATTEMPTS} attempts.`,
    )
  );
}

/**
 * Build the Storage path for an extracted frame. Lives under the
 * `reference-images` bucket so the existing signed-url plumbing works
 * unchanged.
 *
 * Path layout:
 *   reference-images/<videoId>/extracted-frames/<segmentId>/<timestamp>.png
 */
export function buildExtractedFrameStoragePath(input: {
  videoId: string;
  sourceSegmentId: string;
  timestampSeconds: number;
}): string {
  const safeTimestamp = clampNonNegative(input.timestampSeconds)
    .toFixed(2)
    .replace(".", "_");
  return `${input.videoId}/extracted-frames/${input.sourceSegmentId}/${safeTimestamp}.png`;
}

/**
 * Bucket where extracted frames live. Re-exported for symmetry with the
 * rest of `media-asset.constants` so callers don't have to know it's
 * the same bucket as recipe-specific reference images.
 */
export const EXTRACTED_FRAME_STORAGE_BUCKET =
  MEDIA_STORAGE_BUCKETS.referenceImages;

export const EXTRACTED_FRAME_DEFAULT_WIDTH = DEFAULT_THUMBNAIL_WIDTH;
export const EXTRACTED_FRAME_DEFAULT_HEIGHT = DEFAULT_THUMBNAIL_HEIGHT;
export const EXTRACTED_FRAME_MIME_TYPE = "image/png";

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
