import "server-only";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { Database } from "@/shared/supabase/database.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";
import { createStorageSignedUrl } from "@/modules/media-assets/services/storage.service";
import type { MediaStorageBucket } from "@/modules/media-assets/media-asset.constants";

/**
 * Time-to-live for the signed URLs we hand to Runway. The Seedance API
 * downloads each reference within seconds of receiving the request, so
 * anything north of ~5 minutes is plenty. We use 15 minutes to give us
 * generous slack against clock skew and queue jitter without ever creating
 * a "long-lived" URL the user could leak.
 */
const RUNWAY_SIGNED_URL_TTL_SECONDS = 60 * 15;

export interface SeedanceReferenceInput {
  /** Stable position used to order references[] when calling Runway. */
  position: number;
  role: string;
  required: boolean;
  /**
   * Fresh, short-lived HTTPS URL Seedance can download. Never persisted:
   * regenerated on every retry to survive the 1h+ delays between user
   * approvals and Runway re-runs (per the user's spec: "potentiellement
   * on va relancer certains segments Seedance […], mon URL sera morte").
   */
  uri: string;
  canonicalName: string;
  /**
   * Every other name this reference is known by. Library entries surface
   * their `aliases[]` here (e.g. `["KitchenIslandDefault"]` for
   * `island_default`); recipe-specific entries return an empty array. The
   * downstream validator uses this list to match against the alias the agent
   * wrote in `segments.references[].name`, which is rarely the canonical
   * name. Without this, the validator rejects perfectly-wired data.
   */
  aliases: string[];
  /** Source we resolved from, useful for logging and debugging. */
  source: "asset_library" | "reference_assets";
  /**
   * Whether this reference is an image or a video, derived from
   * `media_assets.mime_type`. Drives the orchestrator split between
   * Seedance `references[]` (images, up to 9) and `referenceVideos[]`
   * (videos, up to 3, combined <= 15s) on `text_to_video`.
   */
  kind: "image" | "video";
  /**
   * Duration of the underlying media in seconds, surfaced for video
   * references so the service can enforce the combined 15s cap before
   * the Runway round-trip. Null for images and for video assets whose
   * row has no duration recorded yet.
   */
  durationSeconds: number | null;
  /**
   * Stored size of the reference media in bytes. Surfaced so the orchestrator
   * can enforce Runway's 16 MB-per-reference cap before issuing a request:
   * we'd otherwise wait for Runway to download the asset and respond with a
   * generic 400 ("Asset size exceeds 16.0MB"), wasting both queue time and
   * Inngest retries. May be 0 if the underlying media_assets row has no size
   * recorded yet (the validator treats that as "unknown" and lets it pass).
   */
  fileSizeBytes: number;
  /**
   * Stored MIME type of the reference media. Useful for the operator-facing
   * error message when the size cap is breached so they know whether to
   * convert (PNG -> JPEG) or just resize.
   */
  mimeType: string | null;
}

type SegmentReferenceJoinRow = {
  id: string;
  segment_id: string;
  position: number;
  role: string;
  required: boolean;
  library_asset_id: string | null;
  recipe_reference_id: string | null;
  asset_library:
    | {
        id: string;
        canonical_name: string;
        aliases: string[] | null;
        media_asset_id: string | null;
      }
    | null;
  reference_assets:
    | {
        id: string;
        canonical_name: string;
        media_asset_id: string | null;
      }
    | null;
};

type MediaAssetStoragePick = Pick<
  Database["public"]["Tables"]["media_assets"]["Row"],
  | "id"
  | "storage_bucket"
  | "storage_path"
  | "file_size_bytes"
  | "mime_type"
  | "duration_seconds"
>;

/**
 * Resolve the Seedance reference inputs for a segment, generating ONE fresh
 * signed URL per reference at call time. The function is idempotent and
 * stateless: the caller can invoke it any number of times (initial run,
 * retry, manual re-run hours later) and always get a brand-new URL set.
 *
 * Resolution order:
 *   1. Load `segment_references` for the segment with both joins
 *      (`asset_library`, `reference_assets`).
 *   2. Collect every media_asset id (library OR recipe) needed.
 *   3. Single-shot read of media_assets to fetch storage_bucket + path.
 *   4. Issue signed URLs in parallel.
 *
 * Throws if a row references a media asset that has no storage path: that
 * means the asset has not been uploaded yet, and Seedance cannot consume it.
 */
export async function resolveSegmentSeedanceReferences(
  supabase: SupabaseDataClient,
  segmentId: string,
): Promise<SeedanceReferenceInput[]> {
  const { data: links, error } = await supabase
    .from("segment_references")
    .select(
      "id, segment_id, position, role, required, library_asset_id, recipe_reference_id, asset_library:asset_library!segment_references_library_asset_id_fkey(id, canonical_name, aliases, media_asset_id), reference_assets:reference_assets!segment_references_recipe_reference_id_fkey(id, canonical_name, media_asset_id)",
    )
    .eq("segment_id", segmentId)
    .order("position", { ascending: true });

  throwIfSupabaseError(error, "resolveSegmentSeedanceReferences failed");

  const rows = (links ?? []) as unknown as SegmentReferenceJoinRow[];
  if (rows.length === 0) {
    return [];
  }

  const mediaAssetIds = Array.from(
    new Set(
      rows
        .map((row) => row.asset_library?.media_asset_id ?? row.reference_assets?.media_asset_id ?? null)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const mediaById = await fetchMediaAssetStorageLocations(supabase, mediaAssetIds);

  const results: SeedanceReferenceInput[] = [];
  for (const row of rows) {
    const isLibrary = Boolean(row.library_asset_id);
    const joined = isLibrary ? row.asset_library : row.reference_assets;
    if (!joined) {
      throw new Error(
        `segment_references row ${row.id} has neither asset_library nor reference_assets join populated (segment ${segmentId}).`,
      );
    }

    const mediaAssetId = joined.media_asset_id;
    if (!mediaAssetId) {
      throw new Error(
        `Reference '${joined.canonical_name}' on segment ${segmentId} is missing a media_asset_id; cannot generate a signed URL.`,
      );
    }

    const storage = mediaById.get(mediaAssetId);
    if (!storage?.storage_bucket || !storage.storage_path) {
      throw new Error(
        `media_asset ${mediaAssetId} for reference '${joined.canonical_name}' has no storage location yet.`,
      );
    }

    const uri = await createStorageSignedUrl(supabase, {
      bucket: storage.storage_bucket as MediaStorageBucket,
      path: storage.storage_path,
      expiresInSeconds: RUNWAY_SIGNED_URL_TTL_SECONDS,
    });

    const aliases = isLibrary
      ? Array.isArray(row.asset_library?.aliases)
        ? row.asset_library!.aliases
        : []
      : [];

    const mimeType = storage.mime_type ?? null;
    const kind: "image" | "video" =
      typeof mimeType === "string" && mimeType.toLowerCase().startsWith("video/")
        ? "video"
        : "image";
    const durationSecondsRaw = storage.duration_seconds;
    const durationSeconds =
      typeof durationSecondsRaw === "number"
        ? durationSecondsRaw
        : durationSecondsRaw == null
          ? null
          : Number(durationSecondsRaw);

    results.push({
      position: row.position,
      role: row.role,
      required: row.required,
      canonicalName: joined.canonical_name,
      aliases,
      uri,
      source: isLibrary ? "asset_library" : "reference_assets",
      kind,
      durationSeconds:
        typeof durationSeconds === "number" && !Number.isNaN(durationSeconds)
          ? durationSeconds
          : null,
      fileSizeBytes: storage.file_size_bytes ?? 0,
      mimeType,
    });
  }

  return results;
}

async function fetchMediaAssetStorageLocations(
  supabase: SupabaseDataClient,
  mediaAssetIds: string[],
): Promise<Map<string, MediaAssetStoragePick>> {
  const result = new Map<string, MediaAssetStoragePick>();
  if (mediaAssetIds.length === 0) {
    return result;
  }

  const { data, error } = await supabase
    .from("media_assets")
    .select(
      "id, storage_bucket, storage_path, file_size_bytes, mime_type, duration_seconds",
    )
    .in("id", mediaAssetIds);

  throwIfSupabaseError(error, "fetchMediaAssetStorageLocations failed");
  for (const row of data ?? []) {
    result.set(row.id, row as MediaAssetStoragePick);
  }
  return result;
}
