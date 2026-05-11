import type { SupabaseDataClient } from "@/shared/supabase/client.types";

import type { RecipeAgentStage } from "../recipe-agent.types";
import {
  ensureRecipeAgentThread,
  insertRecipeAgentMessage,
} from "../repositories/recipe-agent-chat.repository";
import { updateAgentRun } from "../repositories/recipe-agent.repository";

/** Text-only chat row; avoids storing signed URLs. */
export function buildRecipeAgentUserChatContent(
  message: string,
  attachedImageCount: number,
): string {
  if (attachedImageCount <= 0) {
    return message;
  }

  return `${message}\n\n(${attachedImageCount} recipe source image(s) attached to the Cursor SDK call; signed URLs are not stored in chat.)`;
}

export async function seedRecipeAgentChatTurn(
  supabase: SupabaseDataClient,
  input: {
    videoId: string;
    agentRunId: string;
    userMessage: string;
    stage: RecipeAgentStage;
  },
): Promise<{ userMessageId: string; assistantMessageId: string }> {
  const thread = await ensureRecipeAgentThread(supabase, input.videoId);

  const userRow = await insertRecipeAgentMessage(supabase, {
    threadId: thread.id,
    agentRunId: input.agentRunId,
    role: "user",
    content: input.userMessage,
    status: "complete",
    metadata: { stage: input.stage },
  });

  const assistantRow = await insertRecipeAgentMessage(supabase, {
    threadId: thread.id,
    agentRunId: input.agentRunId,
    role: "assistant",
    content: "",
    status: "streaming",
    metadata: { stage: input.stage },
  });

  await updateAgentRun(supabase, input.agentRunId, {
    userChatMessageId: userRow.id,
    assistantChatMessageId: assistantRow.id,
  });

  return {
    userMessageId: userRow.id,
    assistantMessageId: assistantRow.id,
  };
}
