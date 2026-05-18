import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { Database } from "@/shared/supabase/database.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";

import type { RunwayTaskStatusValue } from "@/modules/generation/runway.types";

import type {
  ReferenceAsset,
  ReferenceAssetKind,
} from "../reference.types";
import type { ReferenceStatus } from "../reference-status";

type ReferenceAssetRow =
  Database["public"]["Tables"]["reference_assets"]["Row"];

export interface CreateReferenceAssetInput {
  id?: string;
  videoId?: string | null;
  mediaAssetId?: string | null;
  type: string;
  canonicalName: string;
  source: string;
  runwayUri?: string | null;
  prompt?: string | null;
  status?: ReferenceStatus;
  conditioningCanonicalNames?: string[];
}

/**
 * Return the recipe-specific reference_assets for a video. Used to live with
 * `OR video_id IS NULL` so legacy globals stored in this table appeared too,
 * but globals now live in `asset_library`; callers compose the two sources
 * (library + recipe-specific) themselves via `getReferenceReviewData`.
 */
export async function listReferenceAssetsForVideo(
  supabase: SupabaseDataClient,
  videoId: string,
): Promise<ReferenceAsset[]> {
  const { data, error } = await supabase
    .from("reference_assets")
    .select("*")
    .eq("video_id", videoId)
    .order("created_at", { ascending: true });

  throwIfSupabaseError(error, "listReferenceAssetsForVideo failed");
  return data.map(mapReferenceAsset);
}

export async function getReferenceAssetById(
  supabase: SupabaseDataClient,
  referenceId: string,
): Promise<ReferenceAsset | null> {
  const { data, error } = await supabase
    .from("reference_assets")
    .select("*")
    .eq("id", referenceId)
    .maybeSingle();

  throwIfSupabaseError(error, "getReferenceAssetById failed");
  return data ? mapReferenceAsset(data) : null;
}

export async function insertReferenceAsset(
  supabase: SupabaseDataClient,
  input: CreateReferenceAssetInput,
): Promise<ReferenceAsset> {
  const row = {
    ...(input.id ? { id: input.id } : {}),
    video_id: input.videoId ?? null,
    media_asset_id: input.mediaAssetId ?? null,
    type: input.type,
    canonical_name: input.canonicalName,
    source: input.source,
    runway_uri: input.runwayUri ?? null,
    prompt: input.prompt ?? null,
    status: input.status ?? "planned",
    conditioning_canonical_names: input.conditioningCanonicalNames ?? [],
  };

  const { data, error } = await supabase
    .from("reference_assets")
    .insert(row)
    .select("*")
    .single();

  throwIfSupabaseError(error, "insertReferenceAsset failed");
  return mapReferenceAsset(data);
}

export async function replaceAgentReferenceAssetsForVideo(
  supabase: SupabaseDataClient,
  videoId: string,
  references: CreateReferenceAssetInput[],
): Promise<ReferenceAsset[]> {
  const { error: deleteError } = await supabase
    .from("reference_assets")
    .delete()
    .eq("video_id", videoId)
    .eq("source", "agent_reference_plan");

  throwIfSupabaseError(
    deleteError,
    "replaceAgentReferenceAssetsForVideo delete failed",
  );

  if (references.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("reference_assets")
    .insert(
      references.map((reference) => ({
        ...(reference.id ? { id: reference.id } : {}),
        video_id: videoId,
        media_asset_id: reference.mediaAssetId ?? null,
        type: reference.type,
        canonical_name: reference.canonicalName,
        source: "agent_reference_plan",
        runway_uri: reference.runwayUri ?? null,
        prompt: reference.prompt ?? null,
        status: reference.status ?? "planned",
        conditioning_canonical_names:
          reference.conditioningCanonicalNames ?? [],
      })),
    )
    .select("*")
    .order("created_at", { ascending: true });

  throwIfSupabaseError(
    error,
    "replaceAgentReferenceAssetsForVideo insert failed",
  );
  return data.map(mapReferenceAsset);
}

export async function updateReferenceAssetStatus(
  supabase: SupabaseDataClient,
  input: {
    referenceId: string;
    status: ReferenceStatus;
  },
): Promise<ReferenceAsset> {
  const { data, error } = await supabase
    .from("reference_assets")
    .update({
      status: input.status,
      runway_task_id: null,
      runway_task_status: null,
      runway_progress: null,
    })
    .eq("id", input.referenceId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updateReferenceAssetStatus failed");
  return mapReferenceAsset(data);
}

/**
 * Persists Runway task id + latest poll snapshot while a recipe-specific
 * reference image is generating.
 */
export async function updateReferenceAssetRunwayPollState(
  supabase: SupabaseDataClient,
  input: {
    referenceId: string;
    runwayTaskId: string;
    runwayTaskStatus: string;
    runwayProgress: number | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from("reference_assets")
    .update({
      runway_task_id: input.runwayTaskId,
      runway_task_status: input.runwayTaskStatus,
      runway_progress: input.runwayProgress,
    })
    .eq("id", input.referenceId);

  throwIfSupabaseError(error, "updateReferenceAssetRunwayPollState failed");
}

export async function listGeneratingReferenceAssets(
  supabase: SupabaseDataClient,
  options: { limit?: number } = {},
): Promise<ReferenceAsset[]> {
  let query = supabase
    .from("reference_assets")
    .select("*")
    .eq("status", "generating")
    .order("created_at", { ascending: false });

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  throwIfSupabaseError(error, "listGeneratingReferenceAssets failed");
  return (data ?? []).map(mapReferenceAsset);
}

export async function countGeneratingReferenceAssetsForVideo(
  supabase: SupabaseDataClient,
  videoId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("reference_assets")
    .select("id", { count: "exact", head: true })
    .eq("video_id", videoId)
    .eq("status", "generating");

  throwIfSupabaseError(error, "countGeneratingReferenceAssetsForVideo failed");
  return count ?? 0;
}

export async function countGeneratingReferenceAssets(
  supabase: SupabaseDataClient,
): Promise<number> {
  const { count, error } = await supabase
    .from("reference_assets")
    .select("id", { count: "exact", head: true })
    .eq("status", "generating");

  throwIfSupabaseError(error, "countGeneratingReferenceAssets failed");
  return count ?? 0;
}

export async function updateReferenceAssetMedia(
  supabase: SupabaseDataClient,
  input: {
    referenceId: string;
    mediaAssetId: string;
    status?: ReferenceStatus;
    /**
     * When true, clear `runway_uri` alongside the media update. Set on
     * regeneration so the old ephemeral Runway upload (now pointing at a
     * stale image) can never be reused for a Seedance call. The operator
     * must re-approve and re-upload the new image explicitly.
     */
    clearRunwayUri?: boolean;
  },
): Promise<ReferenceAsset> {
  const update: Database["public"]["Tables"]["reference_assets"]["Update"] = {
    media_asset_id: input.mediaAssetId,
    runway_task_id: null,
    runway_task_status: null,
    runway_progress: null,
  };
  if (input.status !== undefined) {
    update.status = input.status;
  }
  if (input.clearRunwayUri) {
    update.runway_uri = null;
  }

  const { data, error } = await supabase
    .from("reference_assets")
    .update(update)
    .eq("id", input.referenceId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updateReferenceAssetMedia failed");
  return mapReferenceAsset(data);
}

export async function updateReferenceAssetPrompt(
  supabase: SupabaseDataClient,
  input: {
    referenceId: string;
    prompt: string | null;
  },
): Promise<ReferenceAsset> {
  const { data, error } = await supabase
    .from("reference_assets")
    .update({ prompt: input.prompt })
    .eq("id", input.referenceId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updateReferenceAssetPrompt failed");
  return mapReferenceAsset(data);
}

export async function updateReferenceAssetRunwayUri(
  supabase: SupabaseDataClient,
  input: {
    referenceId: string;
    runwayUri: string;
  },
): Promise<ReferenceAsset> {
  const { data, error } = await supabase
    .from("reference_assets")
    .update({
      runway_uri: input.runwayUri,
      status: "uploaded_to_runway",
      runway_task_id: null,
      runway_task_status: null,
      runway_progress: null,
    })
    .eq("id", input.referenceId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updateReferenceAssetRunwayUri failed");
  return mapReferenceAsset(data);
}

export function mapReferenceAsset(row: ReferenceAssetRow): ReferenceAsset {
  // The `kind`, `source_segment_id`, and `source_timestamp_seconds`
  // columns are added by migration 20260518200000. We cast through a
  // partial extension so this maps cleanly even before
  // `database.types.ts` has been regenerated; the runtime values are
  // still validated against `ReferenceAssetKind` to surface schema drift.
  const extendedRow = row as ReferenceAssetRow & {
    kind?: string | null;
    source_segment_id?: string | null;
    source_timestamp_seconds?: number | string | null;
  };

  const kindValue = extendedRow.kind;
  const allowedKinds: ReferenceAssetKind[] = [
    "generated_image",
    "extracted_frame",
    "external_image",
    "extracted_frame_pending",
  ];
  const kind: ReferenceAssetKind | undefined =
    typeof kindValue === "string" &&
    allowedKinds.includes(kindValue as ReferenceAssetKind)
      ? (kindValue as ReferenceAssetKind)
      : undefined;

  const timestampRaw = extendedRow.source_timestamp_seconds;
  const sourceTimestampSeconds: number | null =
    timestampRaw === null || timestampRaw === undefined
      ? null
      : Number(timestampRaw);

  return {
    id: row.id,
    videoId: row.video_id,
    mediaAssetId: row.media_asset_id,
    type: row.type,
    canonicalName: row.canonical_name,
    kind,
    sourceSegmentId: extendedRow.source_segment_id ?? null,
    sourceTimestampSeconds:
      sourceTimestampSeconds !== null && Number.isFinite(sourceTimestampSeconds)
        ? sourceTimestampSeconds
        : null,
    source: row.source,
    runwayUri: row.runway_uri,
    prompt: row.prompt,
    status: row.status as ReferenceStatus,
    conditioningCanonicalNames: row.conditioning_canonical_names ?? [],
    createdAt: row.created_at,
    runwayTaskId: row.runway_task_id ?? null,
    runwayTaskStatus: (row.runway_task_status as RunwayTaskStatusValue | null) ?? null,
    runwayProgress:
      row.runway_progress === null || row.runway_progress === undefined
        ? null
        : Number(row.runway_progress),
  };
}

export interface PendingExtractedFrameDescriptor {
  referenceAssetId: string;
  canonicalName: string;
  sourceSegmentId: string | null;
  sourceTimestampSeconds: number | null;
}

/**
 * Return every `reference_assets` row tied to a segment via
 * `segment_references` whose `kind` is `extracted_frame_pending`. Used
 * by the orchestrator to refuse generation when an upstream frame has
 * not been extracted yet, and by the segment-review UI to render the
 * "awaiting frame from segment-X" banner.
 */
export async function listPendingExtractedFramesForSegment(
  supabase: SupabaseDataClient,
  segmentId: string,
): Promise<PendingExtractedFrameDescriptor[]> {
  // Two-step query: first list every recipe_reference_id wired to the
  // segment, then re-fetch the matching reference_assets rows. We do
  // not embed the relation in a single Supabase select because the FK
  // type generator in CI does not always include
  // `segment_references_recipe_reference_id_fkey`, which surfaces as a
  // `SelectQueryError<"could not find the relation between
  // segment_references and reference_assets">` at type-check time.
  const { data: links, error: linksError } = await supabase
    .from("segment_references")
    .select("recipe_reference_id")
    .eq("segment_id", segmentId)
    .not("recipe_reference_id", "is", null);

  throwIfSupabaseError(linksError, "listPendingExtractedFramesForSegment failed");

  const referenceIds = (links ?? [])
    .map((row) => row.recipe_reference_id)
    .filter((id): id is string => Boolean(id));
  if (referenceIds.length === 0) {
    return [];
  }

  const { data: refs, error: refsError } = await supabase
    .from("reference_assets")
    .select("*")
    .in("id", referenceIds);

  throwIfSupabaseError(refsError, "listPendingExtractedFramesForSegment refs failed");

  return (refs ?? [])
    .map((row) => mapReferenceAsset(row as ReferenceAssetRow))
    .filter((reference) => reference.kind === "extracted_frame_pending")
    .map((reference) => ({
      referenceAssetId: reference.id,
      canonicalName: reference.canonicalName,
      sourceSegmentId: reference.sourceSegmentId ?? null,
      sourceTimestampSeconds: reference.sourceTimestampSeconds ?? null,
    }));
}

export interface InsertExtractedFrameReferenceAssetInput {
  videoId: string;
  mediaAssetId: string;
  canonicalName: string;
  sourceSegmentId: string;
  sourceTimestampSeconds: number;
  prompt?: string | null;
}

/**
 * Insert a recipe-specific reference asset that points at a frame
 * extracted from another segment's render. The row is created with
 * `kind = 'extracted_frame'` and `status = 'approved'` so it is
 * immediately usable as a Seedance reference once linked to a
 * `segment_references` row.
 */
export async function insertExtractedFrameReferenceAsset(
  supabase: SupabaseDataClient,
  input: InsertExtractedFrameReferenceAssetInput,
): Promise<ReferenceAsset> {
  const insertRow: Record<string, unknown> = {
    video_id: input.videoId,
    media_asset_id: input.mediaAssetId,
    type: "recipe_extracted_frame",
    canonical_name: input.canonicalName,
    source: "extracted_frame",
    prompt: input.prompt ?? null,
    status: "approved" as ReferenceStatus,
    kind: "extracted_frame" satisfies ReferenceAssetKind,
    source_segment_id: input.sourceSegmentId,
    source_timestamp_seconds: input.sourceTimestampSeconds,
  };

  const { data, error } = await supabase
    .from("reference_assets")
    // Cast through unknown because the generated Database types do not
    // yet include the columns added by migration 20260518200000.
    .insert(insertRow as unknown as Database["public"]["Tables"]["reference_assets"]["Insert"])
    .select("*")
    .single();

  throwIfSupabaseError(error, "insertExtractedFrameReferenceAsset failed");
  return mapReferenceAsset(data);
}

/**
 * Update the conditioning anchors for a recipe-specific reference asset.
 * Used by the references UI when the operator tweaks which library globals
 * should ground the next GPT-Image 2 regeneration. The list is stored as
 * given (no dedupe/casing) and resolved against `asset_library` at
 * generation time, so the operator can paste either canonical names or
 * aliases.
 */
export async function updateReferenceAssetConditioning(
  supabase: SupabaseDataClient,
  input: {
    referenceId: string;
    conditioningCanonicalNames: string[];
  },
): Promise<ReferenceAsset> {
  const { data, error } = await supabase
    .from("reference_assets")
    .update({
      conditioning_canonical_names: input.conditioningCanonicalNames,
    })
    .eq("id", input.referenceId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updateReferenceAssetConditioning failed");
  return mapReferenceAsset(data);
}
