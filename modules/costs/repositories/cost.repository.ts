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
