import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import { toJson } from "@/shared/supabase/json";
import type { CostLogWriter } from "./cost.types";
import { logCost } from "./repositories/cost.repository";

export function createSupabaseOpenAiCostLogWriter(
  supabase: SupabaseDataClient,
): CostLogWriter {
  return {
    async logOpenAiUsage(input) {
      await logCost(supabase, {
        videoId: input.videoId,
        segmentId: input.segmentId ?? null,
        provider: "openai",
        model: input.model,
        operation: input.operation,
        costDollars: input.costDollars ?? null,
        tokensInput: input.tokensInput,
        tokensOutput: input.tokensOutput,
        metadata: input.metadata ? toJson(input.metadata) : null,
        createdBy: input.createdBy,
      });
    },
  };
}
