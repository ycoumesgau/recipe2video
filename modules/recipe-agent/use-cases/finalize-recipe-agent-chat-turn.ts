import type { SupabaseDataClient } from "@/shared/supabase/client.types";

import type { AgentRun, RecipeAgentRunStatus } from "../recipe-agent.types";
import { buildRecipeAgentRunCondensedSummary } from "../services/recipe-agent-chat-condense";
import {
  listRecipeAgentStepsByRunId,
  updateRecipeAgentMessage,
} from "../repositories/recipe-agent-chat.repository";

export async function finalizeRecipeAgentChatTurn(
  supabase: SupabaseDataClient,
  input: {
    run: AgentRun;
    assistantMessageId: string;
    runStatus: RecipeAgentRunStatus;
    resultSummary?: string | null;
    error?: string | null;
  },
): Promise<void> {
  const steps = await listRecipeAgentStepsByRunId(supabase, input.run.id);
  const summary = buildRecipeAgentRunCondensedSummary({
    steps,
    resultSummary: input.resultSummary ?? input.run.resultSummary,
    error: input.error ?? input.run.error,
    stage: input.run.stage,
  });

  let messageStatus: "complete" | "error" | "cancelled" = "complete";
  if (input.runStatus === "error") {
    messageStatus = "error";
  } else if (input.runStatus === "cancelled") {
    messageStatus = "cancelled";
  }

  await updateRecipeAgentMessage(supabase, input.assistantMessageId, {
    status: messageStatus,
    summary,
  });
}
