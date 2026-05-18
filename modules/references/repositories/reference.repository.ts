import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { Database } from "@/shared/supabase/database.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";

import type { RunwayTaskStatusValue } from "@/modules/generation/runway.types";

import type { ReferenceAsset } from "../reference.types";
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
  return {
    id: row.id,
    videoId: row.video_id,
    mediaAssetId: row.media_asset_id,
    type: row.type,
    canonicalName: row.canonical_name,
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
