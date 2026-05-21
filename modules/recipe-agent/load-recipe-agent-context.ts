import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { StoryboardListScope } from "@/modules/storyboard/repositories/segment.repository";

import { resolveActiveConversation } from "./resolve-active-conversation";
import type { AgentConversation } from "./recipe-agent.types";
import {
  getActiveAgentConversationByVideoId,
  listAgentConversationsByVideoId,
} from "./repositories/agent-conversations.repository";
import { ensureActiveAgentConversation } from "./use-cases/ensure-agent-conversation";

export interface RecipeAgentContext {
  conversations: AgentConversation[];
  activeConversation: AgentConversation;
  serverActiveConversationId: string;
  storyboardScope: StoryboardListScope;
}

export async function loadRecipeAgentContext(
  supabase: SupabaseDataClient,
  videoId: string,
  requestedConversationId?: string | null,
): Promise<RecipeAgentContext> {
  let conversations = await listAgentConversationsByVideoId(supabase, videoId);

  if (conversations.length === 0) {
    const initial = await ensureActiveAgentConversation(supabase, videoId);
    conversations = [initial];
  }

  const serverActive =
    (await getActiveAgentConversationByVideoId(supabase, videoId)) ??
    conversations.find((conversation) => conversation.isActive) ??
    conversations[0];

  const activeConversation =
    resolveActiveConversation(conversations, requestedConversationId) ??
    serverActive;

  return {
    conversations,
    activeConversation,
    serverActiveConversationId: serverActive.id,
    storyboardScope: {
      agentConversationId: activeConversation.id,
      activeOnly: activeConversation.isActive,
    },
  };
}
