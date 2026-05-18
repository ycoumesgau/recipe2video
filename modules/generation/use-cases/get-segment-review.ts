import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { SegmentFeedback } from "@/modules/feedback/feedback.types";
import { listSegmentFeedbacksBySegmentId } from "@/modules/feedback/repositories/feedback.repository";
import type { MediaAsset } from "@/modules/media-assets/media-asset.types";
import { listMediaAssetsByGenerationIds } from "@/modules/media-assets/repositories/media-asset.repository";
import type { SeedanceSegment } from "@/modules/storyboard/storyboard.types";
import {
  getSegmentById,
  listSegmentsByVideoId,
} from "@/modules/storyboard/repositories/segment.repository";
import { matchesReference } from "@/modules/references/reference-matching";
import type { ReferenceStatus } from "@/modules/references/reference-status";
import { throwIfSupabaseError } from "@/shared/supabase/errors";
import type { RunwayTaskStatusValue } from "@/modules/generation/runway.types";
import type { VideoProject } from "@/modules/videos/video.types";
import { getVideoProjectById } from "@/modules/videos/repositories/video.repository";

import type { Generation } from "../generation.types";
import { listGenerationsBySegmentId } from "../repositories/generation.repository";

export interface SegmentVariantReviewItem {
  generation: Generation;
  mediaAsset: MediaAsset | null;
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

export interface SegmentReviewData {
  project: VideoProject | null;
  segment: SeedanceSegment | null;
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
  /**
   * True when this segment has the highest position in its video; used
   * by the segment-review UI to gate the "Apply standard outro" backfill
   * button so the operator cannot rewrite a creative middle segment by
   * mistake.
   */
  isLastSegmentOfVideo: boolean;
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
      isLastSegmentOfVideo: false,
    };
  }

  const [project, generations, feedbacks, referenceResolutions, allSegments] = await Promise.all([
    getVideoProjectById(supabase, input.videoId),
    listGenerationsBySegmentId(supabase, input.segmentId),
    listSegmentFeedbacksBySegmentId(supabase, input.segmentId),
    resolveSegmentReferenceStatuses(supabase, segment),
    listSegmentsByVideoId(supabase, input.videoId),
  ]);
  const maxPosition = allSegments.reduce(
    (acc, current) => Math.max(acc, current.position),
    -Infinity,
  );
  const isLastSegmentOfVideo =
    Number.isFinite(maxPosition) && segment.position === maxPosition;
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

  const hasActiveReferenceImageGeneration = referenceResolutions.some(
    (row) => row.recipeReferenceStatus === "generating",
  );

  return {
    project,
    segment,
    hasActiveGeneration: generations.some((generation) =>
      ["pending", "queued", "processing"].includes(generation.status),
    ),
    hasActiveReferenceImageGeneration,
    feedbacks,
    referenceResolutions,
    isLastSegmentOfVideo,
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
async function resolveSegmentReferenceStatuses(
  supabase: SupabaseDataClient,
  segment: SeedanceSegment,
): Promise<SegmentReferenceResolutionItem[]> {
  const { data, error } = await supabase
    .from("segment_references")
    .select(
      "position, role, required, library_asset_id, recipe_reference_id, asset_library:asset_library!segment_references_library_asset_id_fkey(canonical_name, aliases, media_asset_id), reference_assets:reference_assets!segment_references_recipe_reference_id_fkey(id, canonical_name, media_asset_id, status, runway_task_status, runway_progress)",
    )
    .eq("segment_id", segment.id)
    .order("position", { ascending: true });

  throwIfSupabaseError(error, "resolveSegmentReferenceStatuses failed");

  const rows = (data ?? []) as unknown as SegmentReferencesJoinRow[];

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
