import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { Database } from "@/shared/supabase/database.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";
import { fromJson } from "@/shared/supabase/json";

import type {
  CreateGenerationInput,
  Generation,
  UpdateGenerationStatusInput,
} from "../generation.types";
import type { GenerationStatus } from "../generation-status";
import type { RunwayTaskStatusValue } from "../runway.types";

type GenerationRow = Database["public"]["Tables"]["generations"]["Row"];

export async function createGeneration(
  supabase: SupabaseDataClient,
  input: CreateGenerationInput,
): Promise<Generation> {
  const { data, error } = await supabase
    .from("generations")
    .insert({
      segment_id: input.segmentId,
      model: input.model,
      model_params: input.modelParams ?? {},
      runway_task_id: input.runwayTaskId ?? null,
      runway_task_status: input.runwayTaskStatus ?? null,
      runway_progress: input.runwayProgress ?? null,
      status: input.status ?? "pending",
      cost_credits: input.costCredits ?? null,
      duration_seconds: input.durationSeconds ?? null,
      triggered_by: input.triggeredBy ?? null,
    })
    .select("*")
    .single();

  throwIfSupabaseError(error, "createGeneration failed");
  return mapGeneration(data);
}

export async function getGenerationById(
  supabase: SupabaseDataClient,
  generationId: string,
): Promise<Generation | null> {
  const { data, error } = await supabase
    .from("generations")
    .select("*")
    .eq("id", generationId)
    .maybeSingle();

  throwIfSupabaseError(error, "getGenerationById failed");
  return data ? mapGeneration(data) : null;
}

export async function listGenerationsBySegmentId(
  supabase: SupabaseDataClient,
  segmentId: string,
): Promise<Generation[]> {
  return listGenerationsBySegmentIds(supabase, [segmentId]);
}

export async function listGenerationsBySegmentIds(
  supabase: SupabaseDataClient,
  segmentIds: string[],
): Promise<Generation[]> {
  if (segmentIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("generations")
    .select("*")
    .in("segment_id", segmentIds)
    .order("created_at", { ascending: false });

  throwIfSupabaseError(error, "listGenerationsBySegmentIds failed");
  return data.map(mapGeneration);
}

export async function countGenerationsBySegmentIds(
  supabase: SupabaseDataClient,
  segmentIds: string[],
): Promise<number> {
  if (segmentIds.length === 0) {
    return 0;
  }

  const { count, error } = await supabase
    .from("generations")
    .select("id", { count: "exact", head: true })
    .in("segment_id", segmentIds);

  throwIfSupabaseError(error, "countGenerationsBySegmentIds failed");
  return count ?? 0;
}

export async function countGenerationsByVideoPosition(
  supabase: SupabaseDataClient,
  videoId: string,
): Promise<Map<number, number>> {
  const { data: segmentRows, error: segmentError } = await supabase
    .from("segments")
    .select("id, position")
    .eq("video_id", videoId);

  throwIfSupabaseError(segmentError, "countGenerationsByVideoPosition segments failed");

  const segments = segmentRows ?? [];
  if (segments.length === 0) {
    return new Map();
  }

  const positionBySegmentId = new Map(
    segments.map((segment) => [segment.id, segment.position]),
  );
  const { data, error } = await supabase
    .from("generations")
    .select("segment_id")
    .in(
      "segment_id",
      segments.map((segment) => segment.id),
    );

  throwIfSupabaseError(error, "countGenerationsByVideoPosition generations failed");

  const counts = new Map<number, number>();
  for (const row of data ?? []) {
    if (!row.segment_id) {
      continue;
    }
    const position = positionBySegmentId.get(row.segment_id);
    if (position === undefined) {
      continue;
    }
    counts.set(position, (counts.get(position) ?? 0) + 1);
  }

  return counts;
}

const ACTIVE_GENERATION_STATUSES: GenerationStatus[] = [
  "pending",
  "queued",
  "processing",
];

/**
 * Count generations that are still in flight across the whole workspace.
 * Used by the dashboard header to surface a live "active tasks" count
 * instead of the previous static `0 active tasks` badge.
 */
export async function countActiveGenerations(
  supabase: SupabaseDataClient,
): Promise<number> {
  const { count, error } = await supabase
    .from("generations")
    .select("id", { count: "exact", head: true })
    .in("status", ACTIVE_GENERATION_STATUSES);

  throwIfSupabaseError(error, "countActiveGenerations failed");
  return count ?? 0;
}

export async function listActiveGenerations(
  supabase: SupabaseDataClient,
  options: { limit?: number } = {},
): Promise<Generation[]> {
  let query = supabase
    .from("generations")
    .select("*")
    .in("status", ACTIVE_GENERATION_STATUSES)
    .order("created_at", { ascending: false });

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  throwIfSupabaseError(error, "listActiveGenerations failed");
  return data.map(mapGeneration);
}

export async function countActiveGenerationsForSegments(
  supabase: SupabaseDataClient,
  segmentIds: string[],
): Promise<number> {
  if (segmentIds.length === 0) {
    return 0;
  }

  const { count, error } = await supabase
    .from("generations")
    .select("id", { count: "exact", head: true })
    .in("segment_id", segmentIds)
    .in("status", ACTIVE_GENERATION_STATUSES);

  throwIfSupabaseError(error, "countActiveGenerationsForSegments failed");
  return count ?? 0;
}

/**
 * Active generation counts keyed by segment id (for dashboard card rollups).
 */
export async function countActiveGenerationsBySegmentIds(
  supabase: SupabaseDataClient,
  segmentIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (segmentIds.length === 0) {
    return counts;
  }

  const { data, error } = await supabase
    .from("generations")
    .select("segment_id")
    .in("segment_id", segmentIds)
    .in("status", ACTIVE_GENERATION_STATUSES);

  throwIfSupabaseError(error, "countActiveGenerationsBySegmentIds failed");

  for (const row of data ?? []) {
    if (!row.segment_id) {
      continue;
    }
    counts.set(row.segment_id, (counts.get(row.segment_id) ?? 0) + 1);
  }

  return counts;
}

export async function hasActiveGenerationForSegment(
  supabase: SupabaseDataClient,
  segmentId: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from("generations")
    .select("id", { count: "exact", head: true })
    .eq("segment_id", segmentId)
    .in("status", ACTIVE_GENERATION_STATUSES);

  throwIfSupabaseError(error, "hasActiveGenerationForSegment failed");
  return (count ?? 0) > 0;
}

export async function updateGenerationStatus(
  supabase: SupabaseDataClient,
  input: UpdateGenerationStatusInput,
): Promise<Generation> {
  const updates: Database["public"]["Tables"]["generations"]["Update"] = {
    status: input.status,
  };

  if (input.mediaAssetId !== undefined) {
    updates.media_asset_id = input.mediaAssetId;
  }

  if (input.runwayTaskStatus !== undefined) {
    updates.runway_task_status = input.runwayTaskStatus;
  }

  if (input.runwayProgress !== undefined) {
    updates.runway_progress = input.runwayProgress;
  }

  if (input.costCredits !== undefined) {
    updates.cost_credits = input.costCredits;
  }

  if (input.durationSeconds !== undefined) {
    updates.duration_seconds = input.durationSeconds;
  }

  if (input.completedAt !== undefined) {
    updates.completed_at = input.completedAt;
  }

  const { data, error } = await supabase
    .from("generations")
    .update(updates)
    .eq("id", input.generationId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updateGenerationStatus failed");
  return mapGeneration(data);
}

export async function updateGenerationMediaAsset(
  supabase: SupabaseDataClient,
  generationId: string,
  mediaAssetId: string | null,
): Promise<Generation> {
  const { data, error } = await supabase
    .from("generations")
    .update({ media_asset_id: mediaAssetId })
    .eq("id", generationId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updateGenerationMediaAsset failed");
  return mapGeneration(data);
}

export function mapGeneration(row: GenerationRow): Generation {
  return {
    id: row.id,
    segmentId: row.segment_id,
    mediaAssetId: row.media_asset_id,
    model: row.model,
    modelParams: fromJson<Record<string, unknown>>(row.model_params) ?? {},
    runwayTaskId: row.runway_task_id,
    runwayTaskStatus: row.runway_task_status as RunwayTaskStatusValue | null,
    runwayProgress: row.runway_progress,
    status: row.status as GenerationStatus,
    costCredits: row.cost_credits,
    durationSeconds: row.duration_seconds,
    triggeredBy: row.triggered_by,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}
