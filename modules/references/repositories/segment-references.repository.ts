import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { Database } from "@/shared/supabase/database.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";

type SegmentReferenceRow =
  Database["public"]["Tables"]["segment_references"]["Row"];

export interface SegmentReferenceMapping {
  segmentId: string;
  libraryAssetId?: string | null;
  recipeReferenceId?: string | null;
  role: string;
  position: number;
  required: boolean;
}

export interface SegmentReferenceLink {
  id: string;
  segmentId: string;
  libraryAssetId: string | null;
  recipeReferenceId: string | null;
  role: string;
  position: number;
  required: boolean;
  createdAt: string;
}

function mapSegmentReferenceRow(row: SegmentReferenceRow): SegmentReferenceLink {
  return {
    id: row.id,
    segmentId: row.segment_id,
    libraryAssetId: row.library_asset_id,
    recipeReferenceId: row.recipe_reference_id,
    role: row.role,
    position: row.position,
    required: row.required,
    createdAt: row.created_at,
  };
}

/**
 * Replace every segment_reference row that targets the supplied segments with
 * the provided mappings. Used at agent sync time after the segments table has
 * been re-populated. The CASCADE on segment_references.segment_id already
 * removes stale rows when segments are deleted by `replaceSegmentsForVideo`,
 * but we issue an explicit delete here to make the function safe to call
 * after segments have only been *updated* rather than fully replaced.
 */
export async function replaceSegmentReferencesForSegments(
  supabase: SupabaseDataClient,
  input: {
    segmentIds: string[];
    mappings: SegmentReferenceMapping[];
  },
): Promise<SegmentReferenceLink[]> {
  if (input.segmentIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("segment_references")
      .delete()
      .in("segment_id", input.segmentIds);

    throwIfSupabaseError(
      deleteError,
      "replaceSegmentReferencesForSegments delete failed",
    );
  }

  if (input.mappings.length === 0) {
    return [];
  }

  assertMappingsAreValid(input.mappings);

  const { data, error } = await supabase
    .from("segment_references")
    .insert(
      input.mappings.map((mapping) => ({
        segment_id: mapping.segmentId,
        library_asset_id: mapping.libraryAssetId ?? null,
        recipe_reference_id: mapping.recipeReferenceId ?? null,
        role: mapping.role,
        position: mapping.position,
        required: mapping.required,
      })),
    )
    .select("*");

  throwIfSupabaseError(
    error,
    "replaceSegmentReferencesForSegments insert failed",
  );
  return data.map(mapSegmentReferenceRow);
}

export async function listSegmentReferencesForSegments(
  supabase: SupabaseDataClient,
  segmentIds: string[],
): Promise<SegmentReferenceLink[]> {
  if (segmentIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("segment_references")
    .select("*")
    .in("segment_id", segmentIds)
    .order("segment_id", { ascending: true })
    .order("position", { ascending: true });

  throwIfSupabaseError(error, "listSegmentReferencesForSegments failed");
  return data.map(mapSegmentReferenceRow);
}

/**
 * Single-roundtrip read of every segment_reference row tied to a video. We
 * join against `segments` server-side via the FK relation and filter on
 * `segments.video_id`. Caller is responsible for resolving
 * `library_asset_id` / `recipe_reference_id` against their respective tables.
 */
export async function listSegmentReferencesForVideo(
  supabase: SupabaseDataClient,
  videoId: string,
): Promise<SegmentReferenceLink[]> {
  const { data, error } = await supabase
    .from("segment_references")
    .select("*, segments!inner(video_id)")
    .eq("segments.video_id", videoId)
    .order("segment_id", { ascending: true })
    .order("position", { ascending: true });

  throwIfSupabaseError(error, "listSegmentReferencesForVideo failed");
  // The PostgREST join surfaces `segments` as a nested object on each row;
  // strip it before returning so the caller only deals with the link shape.
  return data.map((row) => mapSegmentReferenceRow(row as unknown as SegmentReferenceRow));
}

function assertMappingsAreValid(mappings: SegmentReferenceMapping[]) {
  for (const mapping of mappings) {
    const hasLibrary = Boolean(mapping.libraryAssetId);
    const hasRecipe = Boolean(mapping.recipeReferenceId);

    if (hasLibrary === hasRecipe) {
      throw new Error(
        `segment_references requires exactly one of libraryAssetId or recipeReferenceId (segment ${mapping.segmentId}, role ${mapping.role}).`,
      );
    }
  }

  const seen = new Set<string>();
  for (const mapping of mappings) {
    const positionKey = `${mapping.segmentId}#${mapping.position}`;
    if (seen.has(positionKey)) {
      throw new Error(
        `segment_references positions must be unique per segment (segment ${mapping.segmentId}, position ${mapping.position}).`,
      );
    }
    seen.add(positionKey);
  }
}
