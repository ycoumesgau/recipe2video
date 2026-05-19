import "server-only";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { MediaStorageBucket } from "@/modules/media-assets/media-asset.constants";
import { tryCreateStorageSignedUrl } from "@/modules/media-assets/services/storage.service";
import { listSegmentsByVideoId } from "@/modules/storyboard/repositories/segment.repository";
import { throwIfSupabaseError } from "@/shared/supabase/errors";
import type { MediaAsset } from "@/modules/media-assets/media-asset.types";
import {
  groupReferenceImageVariantsByReferenceId,
  listReferenceImageMediaAssetsByVideoId,
} from "@/modules/media-assets/repositories/media-asset.repository";
import type { Database } from "@/shared/supabase/database.types";

import type {
  ConditioningAnchorPreview,
  ReferenceAsset,
  ReferenceAssetReviewItem,
  ReferenceImageVariantItem,
  ReferenceReviewData,
} from "../reference.types";
import { listReferenceAssetsForVideo } from "../repositories/reference.repository";
import { listSegmentReferencesForVideo } from "../repositories/segment-references.repository";
import {
  findAssetLibraryByCanonicalNames,
  type AssetLibraryEntry,
} from "../repositories/asset-library.repository";
import { isConditioningExcludedCategory } from "./conditioning-category-policy";
import { buildSegmentReadiness } from "./reference-readiness";

type MediaAssetRow = Database["public"]["Tables"]["media_assets"]["Row"];
type AssetLibraryRow = Database["public"]["Tables"]["asset_library"]["Row"];

/**
 * Build the data backing the per-video references page. The shape distinguishes
 * three groups:
 *   - `globalReferences`: library assets ACTUALLY used by this video's
 *     segments. We resolve them through `segment_references.library_asset_id`
 *     so the page only surfaces what the storyboard needs, not the full 67-row
 *     library. They are read-only on this page.
 *   - `recipeReferences`: per-video assets in `reference_assets` (recipe
 *     states, custom inputs). The page exposes the full action surface
 *     (approve, regenerate, upload to Runway) on these.
 *   - `rejectedReferences`: recipe-specific entries explicitly rejected.
 *
 * The previous implementation pulled everything from `reference_assets` with
 * `video_id IS NULL OR video_id = X`, which produced duplicate cards per
 * canonical name (one per segment that referenced it). The new code dedupes
 * by id and aggregates `usedInSegments` from `segment_references`.
 */
export async function getReferenceReviewData(
  supabase: SupabaseDataClient,
  videoId: string,
): Promise<ReferenceReviewData> {
  const [recipeReferences, segments, segmentReferenceLinks] = await Promise.all([
    listReferenceAssetsForVideo(supabase, videoId),
    listSegmentsByVideoId(supabase, videoId),
    listSegmentReferencesForVideo(supabase, videoId),
  ]);

  const libraryAssetIds = unique(
    segmentReferenceLinks
      .map((link) => link.libraryAssetId)
      .filter((id): id is string => Boolean(id)),
  );

  const [libraryEntries, mediaAssets, referenceImageVariants, conditioningIndex] =
    await Promise.all([
      fetchAssetLibraryEntries(supabase, libraryAssetIds),
      fetchMediaAssetsForReferences({
        supabase,
        videoId,
        libraryAssetIds,
        recipeReferences,
      }),
      listReferenceImageMediaAssetsByVideoId(supabase, videoId).then(
        groupReferenceImageVariantsByReferenceId,
      ),
      resolveConditioningIndex(supabase, recipeReferences),
    ]);

  const segmentTitleById = new Map(segments.map((segment) => [segment.id, segment.title]));
  const usageByLibraryAsset = aggregateUsage(
    segmentReferenceLinks,
    "libraryAssetId",
    segmentTitleById,
  );
  const usageByRecipeReference = aggregateUsage(
    segmentReferenceLinks,
    "recipeReferenceId",
    segmentTitleById,
  );

  const globalItems = await Promise.all(
    libraryEntries.map((entry) =>
      buildLibraryReviewItem({
        supabase,
        entry,
        mediaAsset: mediaAssets.get(entry.mediaAssetId ?? "") ?? null,
        usedInSegments: usageByLibraryAsset.get(entry.id) ?? [],
      }),
    ),
  );

  const recipeItems = await Promise.all(
    recipeReferences.map((reference) =>
      buildRecipeReviewItem({
        supabase,
        reference,
        mediaAsset: mediaAssets.get(reference.mediaAssetId ?? "") ?? null,
        variantAssets: referenceImageVariants.get(reference.id) ?? [],
        usedInSegments: usageByRecipeReference.get(reference.id) ?? [],
        conditioningIndex,
      }),
    ),
  );

  return {
    globalReferences: globalItems.filter(
      (item) => item.reference.status !== "rejected",
    ),
    recipeReferences: recipeItems.filter(
      (item) => item.reference.status !== "rejected",
    ),
    rejectedReferences: recipeItems.filter(
      (item) => item.reference.status === "rejected",
    ),
    missingReferences: [...globalItems, ...recipeItems].filter(isMissingReference),
    segmentReadiness: buildSegmentReadiness(
      // The readiness check still works against ReferenceAsset shapes. Globals
      // are presented as approved-by-construction references so the check
      // does not flag them as missing.
      [
        ...recipeReferences,
        ...globalItems.map((item) => item.reference),
      ],
      segments,
    ),
  };
}

function isMissingReference(item: ReferenceAssetReviewItem): boolean {
  // Library globals are uploaded to Supabase Storage during seed and exposed
  // to Runway just-in-time via signed URLs, so they are never "missing" from
  // the user's perspective on this page.
  if (item.isLibraryGlobal) {
    return false;
  }

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

  if (reference.status === "generated") {
    return true;
  }

  if (
    reference.status === "approved" ||
    reference.status === "uploaded_to_runway"
  ) {
    return !reference.mediaAssetId;
  }

  return true;
}

function aggregateUsage(
  links: Awaited<ReturnType<typeof listSegmentReferencesForVideo>>,
  targetField: "libraryAssetId" | "recipeReferenceId",
  segmentTitleById: Map<string, string>,
): Map<string, string[]> {
  const usage = new Map<string, Set<string>>();
  for (const link of links) {
    const target = link[targetField];
    if (!target) {
      continue;
    }
    const title = segmentTitleById.get(link.segmentId);
    if (!title) {
      continue;
    }
    if (!usage.has(target)) {
      usage.set(target, new Set());
    }
    usage.get(target)!.add(title);
  }

  const result = new Map<string, string[]>();
  for (const [id, titles] of usage.entries()) {
    result.set(id, Array.from(titles));
  }
  return result;
}

async function fetchAssetLibraryEntries(
  supabase: SupabaseDataClient,
  ids: string[],
): Promise<AssetLibraryEntry[]> {
  if (ids.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("asset_library")
    .select("*")
    .in("id", ids)
    .order("category", { ascending: true })
    .order("canonical_name", { ascending: true });

  throwIfSupabaseError(error, "fetchAssetLibraryEntries failed");

  return (data ?? []).map((row) => mapAssetLibraryRow(row as AssetLibraryRow));
}

interface FetchMediaAssetsInput {
  supabase: SupabaseDataClient;
  videoId: string;
  libraryAssetIds: string[];
  recipeReferences: ReferenceAsset[];
}

async function fetchMediaAssetsForReferences(
  input: FetchMediaAssetsInput,
): Promise<Map<string, MediaAsset>> {
  const mediaIds = unique([
    ...input.recipeReferences
      .map((reference) => reference.mediaAssetId)
      .filter((id): id is string => Boolean(id)),
  ]);

  // Library entries don't expose `media_asset_id` until we read them; we'll
  // fetch them lazily after the library entries arrive.
  const result = new Map<string, MediaAsset>();
  if (mediaIds.length === 0) {
    return result;
  }

  const { data, error } = await input.supabase
    .from("media_assets")
    .select("*")
    .in("id", mediaIds);

  throwIfSupabaseError(error, "fetchMediaAssetsForReferences failed");

  for (const row of data ?? []) {
    result.set(row.id, mapMediaAssetRow(row as MediaAssetRow));
  }
  return result;
}

async function buildLibraryReviewItem(input: {
  supabase: SupabaseDataClient;
  entry: AssetLibraryEntry;
  mediaAsset: MediaAsset | null;
  usedInSegments: string[];
}): Promise<ReferenceAssetReviewItem> {
  // Library entries need a one-off media_assets fetch when the bulk fetch
  // above did not include them (it only seeded itself from recipe-specific
  // references). Doing it inline keeps the function self-contained.
  const mediaAsset =
    input.mediaAsset ??
    (input.entry.mediaAssetId
      ? await getMediaAssetByIdInline(input.supabase, input.entry.mediaAssetId)
      : null);

  return {
    reference: librarytoReference(input.entry),
    mediaAsset,
    previewUrl: await createPreviewUrl(input.supabase, mediaAsset),
    usedInSegments: input.usedInSegments,
    isLibraryGlobal: true,
  };
}

async function buildRecipeReviewItem(input: {
  supabase: SupabaseDataClient;
  reference: ReferenceAsset;
  mediaAsset: MediaAsset | null;
  variantAssets: MediaAsset[];
  usedInSegments: string[];
  conditioningIndex: ConditioningIndex;
}): Promise<ReferenceAssetReviewItem> {
  const mediaAsset =
    input.mediaAsset ??
    (input.reference.mediaAssetId
      ? await getMediaAssetByIdInline(input.supabase, input.reference.mediaAssetId)
      : null);

  const conditioning = await resolveReferenceConditioning(
    input.supabase,
    input.reference,
    input.conditioningIndex,
  );

  const imageVariants = await buildReferenceImageVariants({
    supabase: input.supabase,
    reference: input.reference,
    variantAssets: input.variantAssets,
    activeMediaAssetId: mediaAsset?.id ?? input.reference.mediaAssetId ?? null,
  });

  return {
    reference: input.reference,
    mediaAsset,
    previewUrl: await createPreviewUrl(input.supabase, mediaAsset),
    imageVariants,
    usedInSegments: input.usedInSegments,
    isLibraryGlobal: false,
    conditioningAnchors: conditioning.anchors,
    conditioningUnresolved: conditioning.unresolved,
    conditioningExcluded: conditioning.excluded,
  };
}

async function buildReferenceImageVariants(input: {
  supabase: SupabaseDataClient;
  reference: ReferenceAsset;
  variantAssets: MediaAsset[];
  activeMediaAssetId: string | null;
}): Promise<ReferenceImageVariantItem[]> {
  if (input.variantAssets.length === 0) {
    return [];
  }

  const variants: ReferenceImageVariantItem[] = [];

  for (const asset of input.variantAssets) {
    variants.push({
      mediaAsset: asset,
      previewUrl: await createPreviewUrl(input.supabase, asset),
      isActive: asset.id === input.activeMediaAssetId,
    });
  }

  return variants;
}

interface ConditioningIndex {
  /**
   * Map from each name the agent referenced (canonical or alias) to the
   * resolved library entry. Built once for the whole page so we don't make
   * a library query per card.
   */
  libraryByName: Map<string, AssetLibraryEntry>;
  /** Storage info per resolved library entry, keyed by `mediaAssetId`. */
  mediaById: Map<string, { storageBucket: string | null; storagePath: string | null }>;
}

/**
 * Pre-resolve every conditioning name across every recipe-specific
 * reference of the video so we can render the anchor previews without
 * issuing N additional queries. Misses are tolerated: an unresolved name
 * just means the operator will see a "missing" badge on the card.
 */
async function resolveConditioningIndex(
  supabase: SupabaseDataClient,
  recipeReferences: ReferenceAsset[],
): Promise<ConditioningIndex> {
  const names = unique(
    recipeReferences.flatMap(
      (reference) => reference.conditioningCanonicalNames ?? [],
    ),
  );

  if (names.length === 0) {
    return {
      libraryByName: new Map(),
      mediaById: new Map(),
    };
  }

  const libraryByName = await findAssetLibraryByCanonicalNames(supabase, names);

  const mediaAssetIds = unique(
    Array.from(new Set(libraryByName.values()))
      .map((entry) => entry.mediaAssetId)
      .filter((id): id is string => Boolean(id)),
  );

  const mediaById = new Map<
    string,
    { storageBucket: string | null; storagePath: string | null }
  >();

  if (mediaAssetIds.length > 0) {
    const { data, error } = await supabase
      .from("media_assets")
      .select("id, storage_bucket, storage_path")
      .in("id", mediaAssetIds);

    throwIfSupabaseError(error, "resolveConditioningIndex media fetch failed");
    for (const row of data ?? []) {
      mediaById.set(row.id, {
        storageBucket: row.storage_bucket ?? null,
        storagePath: row.storage_path ?? null,
      });
    }
  }

  return { libraryByName, mediaById };
}

async function resolveReferenceConditioning(
  supabase: SupabaseDataClient,
  reference: ReferenceAsset,
  index: ConditioningIndex,
): Promise<{
  anchors: ConditioningAnchorPreview[];
  unresolved: string[];
  excluded: Array<{ canonicalName: string; category: string }>;
}> {
  const requested = reference.conditioningCanonicalNames ?? [];
  if (requested.length === 0) {
    return { anchors: [], unresolved: [], excluded: [] };
  }

  const seenEntryIds = new Set<string>();
  const anchors: ConditioningAnchorPreview[] = [];
  const unresolved: string[] = [];
  const excluded: Array<{ canonicalName: string; category: string }> = [];

  for (const requestedName of requested) {
    const trimmed = requestedName.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const entry = index.libraryByName.get(trimmed);
    if (!entry) {
      unresolved.push(trimmed);
      continue;
    }
    if (seenEntryIds.has(entry.id)) {
      continue;
    }
    seenEntryIds.add(entry.id);

    // Mirror the resolver's category policy so the UI shows the operator
    // exactly which anchors will be sent to GPT-Image 2 vs which were
    // silently dropped on purpose.
    if (isConditioningExcludedCategory(entry.category)) {
      excluded.push({
        canonicalName: entry.canonicalName,
        category: entry.category,
      });
      continue;
    }

    const storage = entry.mediaAssetId
      ? index.mediaById.get(entry.mediaAssetId)
      : null;
    const previewUrl =
      storage?.storageBucket && storage.storagePath
        ? await tryCreateStorageSignedUrl(supabase, {
            bucket: storage.storageBucket as MediaStorageBucket,
            path: storage.storagePath,
            expiresInSeconds: 60 * 15,
          })
        : null;

    anchors.push({
      canonicalName: entry.canonicalName,
      tag: entry.aliases[0]?.trim() || entry.canonicalName,
      category: entry.category,
      previewUrl,
    });
  }

  return { anchors, unresolved, excluded };
}

/**
 * Synthesize a ReferenceAsset shape from an asset_library entry so the UI can
 * render globals through the same `ReferenceCard` component. Library globals
 * carry an "approved" status by construction: their media is stored, the
 * agent treats them as ready inputs, and the page suppresses approval
 * actions on them anyway.
 */
function librarytoReference(entry: AssetLibraryEntry): ReferenceAsset {
  // We display the friendlier alias (typically PascalCase, e.g.
  // `KitchenIslandDefault`) when available because that's how the agent
  // names the reference in storyboards and prompts. The canonical name
  // (snake_case storage key) is preserved in `aliases` so the matcher can
  // still recognize segments that point at it directly.
  const primaryName = entry.aliases[0] ?? entry.canonicalName;
  const otherAliases = entry.aliases.filter((alias) => alias !== primaryName);
  const aliases = [
    ...(primaryName === entry.canonicalName ? [] : [entry.canonicalName]),
    ...otherAliases,
  ];

  return {
    id: entry.id,
    videoId: null,
    mediaAssetId: entry.mediaAssetId,
    type: entry.category,
    canonicalName: primaryName,
    aliases,
    source: "asset_library",
    runwayUri: null,
    prompt: entry.description,
    status: entry.status === "deprecated" ? "rejected" : "approved",
    createdAt: entry.createdAt,
  };
}

function mapAssetLibraryRow(row: AssetLibraryRow): AssetLibraryEntry {
  return {
    id: row.id,
    canonicalName: row.canonical_name,
    aliases: row.aliases ?? [],
    category: row.category,
    mediaAssetId: row.media_asset_id,
    description: row.description,
    status: row.status as "active" | "deprecated",
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMediaAssetRow(row: MediaAssetRow): MediaAsset {
  return {
    id: row.id,
    videoId: row.video_id,
    segmentId: row.segment_id,
    generationId: row.generation_id,
    type: row.type as MediaAsset["type"],
    provider: row.provider as MediaAsset["provider"],
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    runwayOutputUrl: row.runway_output_url,
    muxAssetId: row.mux_asset_id,
    muxPlaybackId: row.mux_playback_id,
    durationSeconds: row.duration_seconds,
    width: row.width,
    height: row.height,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    originalFilename: row.original_filename,
    status: row.status as MediaAsset["status"],
    metadata: (row.metadata ?? {}) as MediaAsset["metadata"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

async function getMediaAssetByIdInline(
  supabase: SupabaseDataClient,
  mediaAssetId: string,
): Promise<MediaAsset | null> {
  const { data, error } = await supabase
    .from("media_assets")
    .select("*")
    .eq("id", mediaAssetId)
    .maybeSingle();

  throwIfSupabaseError(error, "getMediaAssetByIdInline failed");
  return data ? mapMediaAssetRow(data as MediaAssetRow) : null;
}

async function createPreviewUrl(
  supabase: SupabaseDataClient,
  mediaAsset: ReferenceAssetReviewItem["mediaAsset"],
) {
  if (!mediaAsset?.storageBucket || !mediaAsset.storagePath) {
    return null;
  }

  return tryCreateStorageSignedUrl(supabase, {
    bucket: mediaAsset.storageBucket as MediaStorageBucket,
    path: mediaAsset.storagePath,
    expiresInSeconds: 60 * 15,
  });
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}
