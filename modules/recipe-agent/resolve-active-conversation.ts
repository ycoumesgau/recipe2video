import type { AgentConversation } from "./recipe-agent.types";

export function resolveActiveConversation(
  conversations: AgentConversation[],
  requestedConversationId?: string | null,
): AgentConversation | null {
  const visible = conversations.filter((conversation) => !conversation.deletedAt);

  if (visible.length === 0) {
    return null;
  }

  if (requestedConversationId) {
    const match = visible.find(
      (conversation) => conversation.id === requestedConversationId,
    );
    if (match) {
      return match;
    }
  }

  return (
    visible.find((conversation) => conversation.isActive) ??
    visible[0] ??
    null
  );
}
