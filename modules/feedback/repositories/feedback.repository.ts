import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { Database } from "@/shared/supabase/database.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";
import { fromJson, toJson } from "@/shared/supabase/json";

import type {
  CreateSegmentFeedbackInput,
  PromptDiff,
  SegmentFeedback,
} from "../feedback.types";

type SceneFeedbackRow = Database["public"]["Tables"]["scene_feedbacks"]["Row"];

export async function createSegmentFeedback(
  supabase: SupabaseDataClient,
  input: CreateSegmentFeedbackInput,
): Promise<SegmentFeedback> {
  const { data, error } = await supabase
    .from("scene_feedbacks")
    .insert({
      segment_id: input.segmentId,
      generation_id: input.generationId,
      message: input.message,
      prompt_before: input.promptBefore,
      prompt_after: input.promptAfter,
      diff: toJson(input.diff),
      applied: input.applied ?? false,
      created_by: input.createdBy ?? null,
    })
    .select("*")
    .single();

  throwIfSupabaseError(error, "createSegmentFeedback failed");
  return mapSegmentFeedback(data);
}

export async function getSegmentFeedbackById(
  supabase: SupabaseDataClient,
  feedbackId: string,
): Promise<SegmentFeedback | null> {
  const { data, error } = await supabase
    .from("scene_feedbacks")
    .select("*")
    .eq("id", feedbackId)
    .maybeSingle();

  throwIfSupabaseError(error, "getSegmentFeedbackById failed");
  return data ? mapSegmentFeedback(data) : null;
}

export async function listSegmentFeedbacksBySegmentId(
  supabase: SupabaseDataClient,
  segmentId: string,
): Promise<SegmentFeedback[]> {
  const { data, error } = await supabase
    .from("scene_feedbacks")
    .select("*")
    .eq("segment_id", segmentId)
    .order("created_at", { ascending: false });

  throwIfSupabaseError(error, "listSegmentFeedbacksBySegmentId failed");
  return data.map(mapSegmentFeedback);
}

export async function markSegmentFeedbackApplied(
  supabase: SupabaseDataClient,
  feedbackId: string,
  applied: boolean,
): Promise<SegmentFeedback> {
  const { data, error } = await supabase
    .from("scene_feedbacks")
    .update({ applied })
    .eq("id", feedbackId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "markSegmentFeedbackApplied failed");
  return mapSegmentFeedback(data);
}

export function mapSegmentFeedback(row: SceneFeedbackRow): SegmentFeedback {
  return {
    id: row.id,
    segmentId: row.segment_id,
    generationId: row.generation_id,
    message: row.message,
    promptBefore: row.prompt_before,
    promptAfter: row.prompt_after,
    diff: fromJson<PromptDiff>(row.diff) ?? row.diff,
    applied: row.applied,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}
