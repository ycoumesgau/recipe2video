import "server-only";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";

const QUEUE_PAUSE_KEY = "generation_queue_paused";

/**
 * Read the current generation queue pause flag from `app_settings`.
 * Falls back to `process.env.GENERATION_QUEUE_PAUSED === "true"` so a deploy
 * env var still wins when the table is not yet seeded.
 */
export async function getGenerationQueuePaused(
  supabase: SupabaseDataClient,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", QUEUE_PAUSE_KEY)
    .maybeSingle();

  throwIfSupabaseError(error, "getGenerationQueuePaused failed");

  if (!data) {
    return process.env.GENERATION_QUEUE_PAUSED === "true";
  }

  return data.value === true;
}

export async function setGenerationQueuePaused(
  supabase: SupabaseDataClient,
  input: { paused: boolean; updatedBy?: string | null },
): Promise<boolean> {
  const { data, error } = await supabase
    .from("app_settings")
    .upsert(
      {
        key: QUEUE_PAUSE_KEY,
        value: input.paused,
        updated_by: input.updatedBy ?? null,
      },
      { onConflict: "key" },
    )
    .select("value")
    .single();

  throwIfSupabaseError(error, "setGenerationQueuePaused failed");
  return data.value === true;
}
