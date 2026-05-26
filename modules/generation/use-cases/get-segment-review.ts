import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { SegmentFeedback } from "@/modules/feedback/feedback.types";
import { listSegmentFeedbacksBySegmentId } from "@/modules/feedback/repositories/feedback.repository";
import type { MediaAsset } from "@/modules/media-assets/media-asset.types";
import type { MediaStorageBucket } from "@/modules/media-assets/media-asset.constants";
import {
  listMediaAssetsByGenerationIds,
  listMediaAssetsByIds,
} from "@/modules/media-assets/repositories/media-asset.repository";
import { tryCreateLibraryStorageSignedUrl } from "@/modules/media-assets/services/create-library-storage-signed-url";
import { tryCreateMediaAssetPreviewSignedUrl } from "@/modules/media-assets/services/media-asset-preview-url";
import { listLogicalScenesByVideoId } from "@/modules/storyboard/repositories/logical-scene.repository";
import {
  getSegmentById,
  listSegmentsByVideoId,
} from "@/modules/storyboard/repositories/segment.repository";
import { listLogicalScenesForSegment } from "@/modules/storyboard/services/resolve-logical-scene-ids";
import type { SeedanceSegment } from "@/modules/storyboard/storyboard.types";
import { listAssetLibrary } from "@/modules/references/repositories/asset-library.repository";
import { listReferenceAssetsForVideo } from "@/modules/references/repositories/reference.repository";
import { matchesReference } from "@/modules/references/reference-matching";
import type { ReferenceStatus } from "@/modules/references/reference-status";
import { throwIfSupabaseError } from "@/shared/supabase/errors";
import type { RunwayTaskStatusValue } from "@/modules/generation/runway.types";
import type { VideoProject } from "@/modules/videos/video.types";
import { getVideoProjectById } from "@/modules/videos/repositories/video.repository";

import type { Generation } from "../generation.types";
import {
  getGenerationById,
  listGenerationsBySegmentIds,
} from "../repositories/generation.repository";

export interface SegmentVariantReviewItem {
  generation: Generation;
  mediaAsset: MediaAsset | null;
  /** Segment row that produced this generation (may differ from the review page segment). */
  sourceSegmentId: string;
  /** Agent conversation label for the source segment row. */
  conversationName: string | null;
  /** True when this generation is the accepted take on its source segment row. */
  isAcceptedOnSourceSegment: boolean;
}

/**
 * Resolved state for a single reference declared on `segments.references[]`.
 * Lets the segment review UI show whether each reference can actually be fed
 * to Runway (storage path present, source identified) instead of relying on
 * the legacy `runwayUri` field which is no longer used: the pipeline mints a
 * fresh signed URL just-in-time at generation time.
 */
export interface SegmentReferenceResolutionItem {
  /**
   * Index of the segment_references row inside the segment, used to keep the
   * UI ordering stable. Null if the agent declared a reference name that
   * could not be resolved against either source.
   */
  position: number | null;
  /** The name as declared by the agent on `segments.references[].name`. */
  declaredName: string;
  /** Friendly label, falls back to declaredName. */
  declaredLabel: string;
  /** Role tag the agent attached to this reference. */
  role: string;
  /** Whether the segment marks this reference as required. */
  required: boolean;
  /** Resolved canonical name (`island_default`, `RawChouxCrownFrame`, ...). */
  resolvedCanonicalName: string | null;
  /** Source we resolved against. */
  resolvedSource: "asset_library" | "reference_assets" | null;
  /** True when the matched media has a storage path → Runway can read it JIT. */
  hasStorage: boolean;
  /** Populated when this row resolves to a recipe-specific `reference_assets` entry. */
  recipeReferenceId: string | null;
  recipeReferenceStatus: ReferenceStatus | null;
  runwayTaskStatus: RunwayTaskStatusValue | null;
  runwayProgress: number | null;
}

/** One wired reference row for the segment review editor (source of truth: DB links). */
export interface SegmentReferenceEditorRow {
  libraryAssetId: string | null;
  recipeReferenceId: string | null;
  role: string;
  required: boolean;
  canonicalName: string;
  displayLabel: string;
  source: "asset_library" | "reference_assets";
  hasStorage: boolean;
  recipeReferenceStatus: ReferenceStatus | null;
  /** Signed Supabase Storage URL for dashboard preview (short TTL). */
  previewUrl: string | null;
}

export interface SegmentReferencePickerOption {
  pickerKey: string;
  libraryAssetId: string | null;
  recipeReferenceId: string | null;
  canonicalName: string;
  label: string;
  source: "asset_library" | "reference_assets";
  isLibraryGlobal: boolean;
  previewUrl: string | null;
}

export interface SegmentNavigationPeer {
  segmentId: string;
  position: number;
  title: string;
}

/** Ordered prev/next peers for slideshow-style segment review navigation. */
export interface SegmentReviewNavigation {
  currentIndex: number;
  totalCount: number;
  previous: SegmentNavigationPeer | null;
  next: SegmentNavigationPeer | null;
}

export interface SegmentReviewData {
  project: VideoProject | null;
  segment: SeedanceSegment | null;
  /** Prev/next segment links in storyboard order (`position` ascending). */
  navigation: SegmentReviewNavigation | null;
  variants: SegmentVariantReviewItem[];
  hasActiveGeneration: boolean;
  /**
   * True when at least one recipe-specific reference tied to this segment is
   * mid Runway GPT-Image 2 generation (`reference_assets.status === generating`).
   */
  hasActiveReferenceImageGeneration: boolean;
  feedbacks: SegmentFeedback[];
  /**
   * Per-reference resolution status used by the segment review UI to show
   * "ready / not in storage / not found" instead of the misleading
   * "Missing Runway URI" label, which made users think they needed an
   * upload action that does not exist for library globals.
   */
  referenceResolutions: SegmentReferenceResolutionItem[];
  /** Current wiring for the editable references panel. */
  referenceEditorRows: SegmentReferenceEditorRow[];
  /** Assets the operator can attach when editing segment references. */
  referencePickerOptions: SegmentReferencePickerOption[];
  /**
   * True when this segment has the highest position in its video; used
   * by the segment-review UI to gate the "Apply standard outro" backfill
   * button so the operator cannot rewrite a creative middle segment by
   * mistake.
   */
  isLastSegmentOfVideo: boolean;
  /** Editorial scene numbers (1-based `position`) included in this segment. */
  segmentLogicalScenePositions: number[];
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
      hasActiveGeneration: false,
      hasActiveReferenceImageGeneration: false,
      feedbacks: [],
      referenceResolutions: [],
      referenceEditorRows: [],
      referencePickerOptions: [],
      isLastSegmentOfVideo: false,
      navigation: null,
      segmentLogicalScenePositions: [],
    };
  }

  const [
    project,
    feedbacks,
    referenceResolutions,
    referenceEditorBundle,
    allSegments,
    logicalScenes,
  ] = await Promise.all([
    getVideoProjectById(supabase, input.videoId),
    listSegmentFeedbacksBySegmentId(supabase, input.segmentId),
    resolveSegmentReferenceStatuses(supabase, segment),
    loadSegmentReferenceEditorBundle(supabase, {
      videoId: input.videoId,
      segmentId: segment.id,
    }),
    listSegmentsByVideoId(supabase, input.videoId, { activeOnly: true }),
    listLogicalScenesByVideoId(supabase, input.videoId, { activeOnly: true }),
  ]);

  const segmentsAtPosition = await listSegmentsByVideoId(supabase, input.videoId, {
    activeOnly: false,
  });
  const peerSegmentIds = segmentsAtPosition
    .filter((candidate) => candidate.position === segment.position)
    .map((candidate) => candidate.id);
  const conversationNameBySegmentId = await loadConversationNamesBySegmentIds(
    supabase,
    peerSegmentIds,
  );
  const peerSegmentById = new Map(
    segmentsAtPosition
      .filter((candidate) => candidate.position === segment.position)
      .map((candidate) => [candidate.id, candidate]),
  );

  const generations = await listGenerationsBySegmentIds(supabase, peerSegmentIds);
  const segmentLogicalScenePositions = listLogicalScenesForSegment(
    segment,
    logicalScenes,
    allSegments,
  )
    .map((scene) => scene.position)
    .sort((left, right) => left - right);
  const maxPosition = allSegments.reduce(
    (acc, current) => Math.max(acc, current.position),
    -Infinity,
  );
  const isLastSegmentOfVideo =
    Number.isFinite(maxPosition) && segment.position === maxPosition;
  const selectedGeneration =
    segment.selectedGenerationId &&
    !generations.some((g) => g.id === segment.selectedGenerationId)
      ? await getGenerationById(supabase, segment.selectedGenerationId)
      : null;

  const allGenerations = selectedGeneration
    ? [selectedGeneration, ...generations.filter((g) => g.id !== selectedGeneration.id)]
    : generations;

  const mediaAssets = await listMediaAssetsByGenerationIds(
    supabase,
    allGenerations.map((generation) => generation.id),
  );
  const mediaAssetByGenerationId = new Map(
    mediaAssets.flatMap((asset) =>
      asset.generationId ? [[asset.generationId, asset] as const] : [],
    ),
  );
  const mediaAssetById = new Map(mediaAssets.map((asset) => [asset.id, asset]));

  const hasActiveReferenceImageGeneration = referenceResolutions.some(
    (row) => row.recipeReferenceStatus === "generating",
  );

  return {
    project,
    segment,
    navigation: buildSegmentReviewNavigation(allSegments, segment.id),
    hasActiveGeneration: generations.some((generation) =>
      ["pending", "queued", "processing"].includes(generation.status),
    ),
    hasActiveReferenceImageGeneration,
    feedbacks,
    referenceResolutions,
    referenceEditorRows: referenceEditorBundle.rows,
    referencePickerOptions: referenceEditorBundle.pickerOptions,
    isLastSegmentOfVideo,
    segmentLogicalScenePositions,
    variants: allGenerations.map((generation) => {
      const sourceSegment = peerSegmentById.get(generation.segmentId);
      return {
        generation,
        mediaAsset:
          (generation.mediaAssetId
            ? mediaAssetById.get(generation.mediaAssetId)
            : null) ??
          mediaAssetByGenerationId.get(generation.id) ??
          null,
        sourceSegmentId: generation.segmentId,
        conversationName:
          conversationNameBySegmentId.get(generation.segmentId) ?? null,
        isAcceptedOnSourceSegment:
          sourceSegment?.selectedGenerationId === generation.id,
      };
    }),
  };
}

async function loadConversationNamesBySegmentIds(
  supabase: SupabaseDataClient,
  segmentIds: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (segmentIds.length === 0) {
    return names;
  }

  const { data, error } = await supabase
    .from("segments")
    .select("id, agent_conversations(name)")
    .in("id", segmentIds);

  throwIfSupabaseError(error, "loadConversationNamesBySegmentIds failed");

  for (const row of data ?? []) {
    const joined = row.agent_conversations as { name?: string } | null;
    if (joined?.name) {
      names.set(row.id, joined.name);
    }
  }

  return names;
}

function buildSegmentReviewNavigation(
  orderedSegments: SeedanceSegment[],
  currentSegmentId: string,
): SegmentReviewNavigation | null {
  if (orderedSegments.length === 0) {
    return null;
  }

  const currentIndex = orderedSegments.findIndex(
    (candidate) => candidate.id === currentSegmentId,
  );
  if (currentIndex < 0) {
    return null;
  }

  const toPeer = (segment: SeedanceSegment): SegmentNavigationPeer => ({
    segmentId: segment.id,
    position: segment.position,
    title: segment.title,
  });

  return {
    currentIndex,
    totalCount: orderedSegments.length,
    previous:
      currentIndex > 0 ? toPeer(orderedSegments[currentIndex - 1]!) : null,
    next:
      currentIndex < orderedSegments.length - 1
        ? toPeer(orderedSegments[currentIndex + 1]!)
        : null,
  };
}

interface SegmentReferencesJoinRow {
  position: number;
  role: string;
  required: boolean;
  library_asset_id: string | null;
  recipe_reference_id: string | null;
  asset_library:
    | {
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
        status: string;
        runway_task_status: string | null;
        runway_progress: number | null;
      }
    | null;
}

/**
 * Build a per-reference resolution view for the segment review UI. We read
 * `segment_references` (the source of truth wired by the agent sync) joined
 * to `asset_library` / `reference_assets`, then check that the matched
 * media_asset has a storage path. The UI uses this to display "ready",
 * "no storage yet" or "not declared" without ever falling back to the
 * legacy `runwayUri` column, which is no longer populated for globals.
 */
async function loadSegmentReferenceEditorBundle(
  supabase: SupabaseDataClient,
  input: { videoId: string; segmentId: string },
): Promise<{
  rows: SegmentReferenceEditorRow[];
  pickerOptions: SegmentReferencePickerOption[];
}> {
  const [linkRows, libraryCatalog, recipeCatalog] = await Promise.all([
    fetchSegmentReferenceJoinRows(supabase, input.segmentId),
    listAssetLibrary(supabase),
    listReferenceAssetsForVideo(supabase, input.videoId),
  ]);

  const mediaAssetIds = uniqueMediaAssetIds([
    ...linkRows.map(
      (row) =>
        row.asset_library?.media_asset_id ??
        row.reference_assets?.media_asset_id ??
        null,
    ),
    ...libraryCatalog.map((entry) => entry.mediaAssetId),
    ...recipeCatalog.map((reference) => reference.mediaAssetId),
  ]);
  const [storageById, previewUrlByMediaAssetId] = await Promise.all([
    fetchMediaAssetStorageMap(supabase, mediaAssetIds),
    buildSegmentReferencePreviewUrlMap(supabase, {
      libraryCatalog,
      recipeCatalog,
      mediaAssetIds,
    }),
  ]);

  const rows: SegmentReferenceEditorRow[] = linkRows.map((row) => {
    const isLibrary = Boolean(row.library_asset_id);
    const joined = isLibrary ? row.asset_library : row.reference_assets;
    const canonicalName = joined?.canonical_name ?? "(unknown)";
    const aliases =
      isLibrary && Array.isArray(row.asset_library?.aliases)
        ? row.asset_library!.aliases
        : [];
    const mediaAssetId = joined?.media_asset_id ?? null;
    const recipeRef = row.reference_assets;

    return {
      libraryAssetId: row.library_asset_id,
      recipeReferenceId: row.recipe_reference_id,
      role: row.role,
      required: row.required,
      canonicalName,
      displayLabel: aliases[0] ?? canonicalName,
      source: isLibrary ? "asset_library" : "reference_assets",
      hasStorage: mediaAssetId ? Boolean(storageById.get(mediaAssetId)) : false,
      recipeReferenceStatus:
        !isLibrary && recipeRef
          ? (recipeRef.status as ReferenceStatus)
          : null,
      previewUrl: mediaAssetId
        ? (previewUrlByMediaAssetId.get(mediaAssetId) ?? null)
        : null,
    };
  });

  const pickerOptions: SegmentReferencePickerOption[] = [
    ...libraryCatalog.map((entry) => ({
      pickerKey: `library:${entry.id}`,
      libraryAssetId: entry.id,
      recipeReferenceId: null,
      canonicalName: entry.canonicalName,
      label: entry.aliases[0] ?? entry.canonicalName,
      source: "asset_library" as const,
      isLibraryGlobal: true,
      previewUrl: entry.mediaAssetId
        ? (previewUrlByMediaAssetId.get(entry.mediaAssetId) ?? null)
        : null,
    })),
    ...recipeCatalog
      .filter((reference) => reference.status !== "rejected")
      .map((reference) => ({
        pickerKey: `recipe:${reference.id}`,
        libraryAssetId: null,
        recipeReferenceId: reference.id,
        canonicalName: reference.canonicalName,
        label: reference.canonicalName,
        source: "reference_assets" as const,
        isLibraryGlobal: false,
        previewUrl: reference.mediaAssetId
          ? (previewUrlByMediaAssetId.get(reference.mediaAssetId) ?? null)
          : null,
      })),
  ].sort((left, right) => left.label.localeCompare(right.label));

  return { rows, pickerOptions };
}

async function fetchSegmentReferenceJoinRows(
  supabase: SupabaseDataClient,
  segmentId: string,
): Promise<SegmentReferencesJoinRow[]> {
  const { data, error } = await supabase
    .from("segment_references")
    .select(
      "position, role, required, library_asset_id, recipe_reference_id, asset_library:asset_library!segment_references_library_asset_id_fkey(canonical_name, aliases, media_asset_id), reference_assets:reference_assets!segment_references_recipe_reference_id_fkey(id, canonical_name, media_asset_id, status, runway_task_status, runway_progress)",
    )
    .eq("segment_id", segmentId)
    .order("position", { ascending: true });

  throwIfSupabaseError(error, "fetchSegmentReferenceJoinRows failed");
  return (data ?? []) as unknown as SegmentReferencesJoinRow[];
}

async function resolveSegmentReferenceStatuses(
  supabase: SupabaseDataClient,
  segment: SeedanceSegment,
): Promise<SegmentReferenceResolutionItem[]> {
  const rows = await fetchSegmentReferenceJoinRows(supabase, segment.id);

  const mediaAssetIds = Array.from(
    new Set(
      rows
        .map(
          (row) =>
            row.asset_library?.media_asset_id ??
            row.reference_assets?.media_asset_id ??
            null,
        )
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const storageById = await fetchMediaAssetStorageMap(supabase, mediaAssetIds);

  // We iterate over the segment's declared references because that's how the
  // user thinks about "what does this segment need?". For each, we look up
  // the matching segment_references row by name (alias-aware) and report
  // whether it has storage.
  return segment.references.map((segmentReference) => {
    const match = rows.find((row) => {
      const candidate = row.library_asset_id
        ? row.asset_library
        : row.reference_assets;
      if (!candidate) {
        return false;
      }

      const aliases =
        row.library_asset_id && Array.isArray(row.asset_library?.aliases)
          ? row.asset_library!.aliases
          : [];

      return (
        matchesReference(
          { canonicalName: candidate.canonical_name, aliases },
          segmentReference.name,
        ) ||
        matchesReference(
          { canonicalName: candidate.canonical_name, aliases },
          segmentReference.label,
        )
      );
    });

    if (!match) {
      return {
        position: null,
        declaredName: segmentReference.name,
        declaredLabel:
          segmentReference.label ?? segmentReference.name ?? "(unnamed)",
        role: segmentReference.role,
        required: segmentReference.required ?? true,
        resolvedCanonicalName: null,
        resolvedSource: null,
        hasStorage: false,
        recipeReferenceId: null,
        recipeReferenceStatus: null,
        runwayTaskStatus: null,
        runwayProgress: null,
      };
    }

    const isLibrary = Boolean(match.library_asset_id);
    const joined = isLibrary ? match.asset_library : match.reference_assets;
    const mediaAssetId = joined?.media_asset_id ?? null;
    const recipeRef = match.reference_assets;
    const recipeReferenceId = match.recipe_reference_id;
    const recipeReferenceStatus = !isLibrary && recipeRef
      ? (recipeRef.status as ReferenceStatus)
      : null;
    const runwayTaskStatus =
      !isLibrary && recipeRef?.runway_task_status
        ? (recipeRef.runway_task_status as RunwayTaskStatusValue)
        : null;
    const runwayProgress =
      !isLibrary && recipeRef && recipeRef.runway_progress != null
        ? Number(recipeRef.runway_progress)
        : null;

    return {
      position: match.position,
      declaredName: segmentReference.name,
      declaredLabel:
        segmentReference.label ?? segmentReference.name ?? "(unnamed)",
      role: match.role,
      required: match.required,
      resolvedCanonicalName: joined?.canonical_name ?? null,
      resolvedSource: isLibrary ? "asset_library" : "reference_assets",
      hasStorage: mediaAssetId
        ? Boolean(storageById.get(mediaAssetId))
        : false,
      recipeReferenceId,
      recipeReferenceStatus,
      runwayTaskStatus,
      runwayProgress,
    };
  });
}

const SEGMENT_REFERENCE_PREVIEW_TTL_SECONDS = 60 * 15;

function uniqueMediaAssetIds(
  values: Array<string | null | undefined>,
): string[] {
  return Array.from(
    new Set(values.filter((id): id is string => Boolean(id))),
  );
}

/**
 * Mint short-lived signed URLs for every library/recipe media asset shown in
 * the segment references editor. Library globals use legacy path fallbacks;
 * recipe-specific rows use poster-aware preview paths for video assets.
 */
async function buildSegmentReferencePreviewUrlMap(
  supabase: SupabaseDataClient,
  input: {
    libraryCatalog: Awaited<ReturnType<typeof listAssetLibrary>>;
    recipeCatalog: Awaited<ReturnType<typeof listReferenceAssetsForVideo>>;
    mediaAssetIds: string[];
  },
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (input.mediaAssetIds.length === 0) {
    return result;
  }

  const libraryCanonicalByMediaAssetId = new Map(
    input.libraryCatalog.flatMap((entry) =>
      entry.mediaAssetId
        ? [[entry.mediaAssetId, entry.canonicalName] as const]
        : [],
    ),
  );

  const mediaAssets = await listMediaAssetsByIds(
    supabase,
    input.mediaAssetIds,
  );

  await Promise.all(
    mediaAssets.map(async (mediaAsset) => {
      const libraryCanonicalName = libraryCanonicalByMediaAssetId.get(
        mediaAsset.id,
      );
      const previewUrl =
        libraryCanonicalName != null
          ? mediaAsset.storageBucket && mediaAsset.storagePath
            ? await tryCreateLibraryStorageSignedUrl(supabase, {
                bucket: mediaAsset.storageBucket as MediaStorageBucket,
                path: mediaAsset.storagePath,
                libraryCanonicalName,
                expiresInSeconds: SEGMENT_REFERENCE_PREVIEW_TTL_SECONDS,
              })
            : null
          : await tryCreateMediaAssetPreviewSignedUrl(supabase, mediaAsset, {
              expiresInSeconds: SEGMENT_REFERENCE_PREVIEW_TTL_SECONDS,
            });

      result.set(mediaAsset.id, previewUrl);
    }),
  );

  return result;
}

async function fetchMediaAssetStorageMap(
  supabase: SupabaseDataClient,
  mediaAssetIds: string[],
): Promise<Map<string, true>> {
  const result = new Map<string, true>();
  if (mediaAssetIds.length === 0) {
    return result;
  }

  const { data, error } = await supabase
    .from("media_assets")
    .select("id, storage_path")
    .in("id", mediaAssetIds);

  throwIfSupabaseError(error, "fetchMediaAssetStorageMap failed");

  for (const row of data ?? []) {
    if (row.storage_path) {
      result.set(row.id, true);
    }
  }
  return result;
}
