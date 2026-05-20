import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { Database } from "@/shared/supabase/database.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";

import type { CostLog, CreateCostLogInput } from "../cost.types";

type CostLogRow = Database["public"]["Tables"]["cost_logs"]["Row"];

export async function logCost(
  supabase: SupabaseDataClient,
  input: CreateCostLogInput,
): Promise<CostLog> {
  const { data, error } = await supabase
    .from("cost_logs")
    .insert({
      video_id: input.videoId,
      segment_id: input.segmentId ?? null,
      provider: input.provider,
      model: input.model,
      operation: input.operation,
      credits_used: input.creditsUsed ?? null,
      cost_dollars: input.costDollars ?? null,
      tokens_input: input.tokensInput ?? null,
      tokens_output: input.tokensOutput ?? null,
      metadata: input.metadata ?? null,
      created_by: input.createdBy ?? null,
    })
    .select("*")
    .single();

  throwIfSupabaseError(error, "logCost failed");
  return mapCostLog(data);
}

export async function listCostLogsByVideoId(
  supabase: SupabaseDataClient,
  videoId: string,
): Promise<CostLog[]> {
  const { data, error } = await supabase
    .from("cost_logs")
    .select("*")
    .eq("video_id", videoId)
    .order("created_at", { ascending: false });

  throwIfSupabaseError(error, "listCostLogsByVideoId failed");
  return data.map(mapCostLog);
}

export async function listCostLogs(
  supabase: SupabaseDataClient,
  options: { limit?: number } = {},
): Promise<CostLog[]> {
  let query = supabase
    .from("cost_logs")
    .select("*")
    .order("created_at", { ascending: false });

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  throwIfSupabaseError(error, "listCostLogs failed");
  return data.map(mapCostLog);
}

export async function listCostLogsBySegmentId(
  supabase: SupabaseDataClient,
  segmentId: string,
): Promise<CostLog[]> {
  const { data, error } = await supabase
    .from("cost_logs")
    .select("*")
    .eq("segment_id", segmentId)
    .order("created_at", { ascending: false });

  throwIfSupabaseError(error, "listCostLogsBySegmentId failed");
  return data.map(mapCostLog);
}

/**
 * Sum every Runway credit ever logged in `cost_logs`. Lightweight enough to
 * call from the dashboard layout to power the live "Credits used / remaining"
 * badges without loading the full cost dashboard data.
 */
export async function sumRunwayCreditsUsed(
  supabase: SupabaseDataClient,
): Promise<number> {
  const { data, error } = await supabase
    .from("cost_logs")
    .select("credits_used")
    .eq("provider", "runway");

  throwIfSupabaseError(error, "sumRunwayCreditsUsed failed");

  return (data ?? []).reduce(
    (total, row) => total + (row.credits_used ?? 0),
    0,
  );
}

/**
 * Sum Runway credits logged per video. Used by dashboard project cards so
 * totals match the project cost overview (aggregated from cost_logs).
 */
export async function sumRunwayCreditsByVideoIds(
  supabase: SupabaseDataClient,
  videoIds: string[],
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (videoIds.length === 0) {
    return totals;
  }

  const { data, error } = await supabase
    .from("cost_logs")
    .select("video_id, credits_used")
    .eq("provider", "runway")
    .in("video_id", videoIds);

  throwIfSupabaseError(error, "sumRunwayCreditsByVideoIds failed");

  for (const row of data ?? []) {
    const current = totals.get(row.video_id) ?? 0;
    totals.set(row.video_id, current + (row.credits_used ?? 0));
  }

  return totals;
}

export function mapCostLog(row: CostLogRow): CostLog {
  return {
    id: row.id,
    videoId: row.video_id,
    segmentId: row.segment_id,
    provider: row.provider,
    model: row.model,
    operation: row.operation,
    creditsUsed: row.credits_used,
    costDollars: row.cost_dollars,
    tokensInput: row.tokens_input,
    tokensOutput: row.tokens_output,
    metadata: row.metadata,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}
