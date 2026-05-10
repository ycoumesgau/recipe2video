import type { ThreadAssistantMessagePart, ThreadMessage } from "@assistant-ui/core";

import type { RecipeAgentChatMessage } from "../recipe-agent.types";

export function recipeAgentMessagesToThreadMessages(
  messages: RecipeAgentChatMessage[],
): ThreadMessage[] {
  const out: ThreadMessage[] = [];

  for (const m of messages) {
    if (m.role === "user") {
      out.push({
        id: m.id,
        role: "user",
        content: [{ type: "text", text: m.content }],
        attachments: [],
        metadata: { custom: { ...(m.metadata ?? {}) } },
        createdAt: new Date(m.createdAt),
      } as ThreadMessage);
      continue;
    }

    if (m.role === "assistant") {
      const status =
        m.status === "streaming"
          ? { type: "running" as const }
          : m.status === "error"
            ? { type: "incomplete" as const, reason: "error" as const }
            : m.status === "cancelled"
              ? {
                  type: "incomplete" as const,
                  reason: "cancelled" as const,
                }
            : { type: "complete" as const, reason: "unknown" as const };

      const parts: ThreadAssistantMessagePart[] = [
        {
          type: "text",
          text:
            m.content || (m.status === "streaming" ? "Working…" : ""),
        },
      ];

      if (m.summary) {
        parts.push({ type: "reasoning", text: m.summary });
      }

      out.push({
        id: m.id,
        role: "assistant",
        content: parts,
        status,
        metadata: {
          unstable_state: {},
          unstable_annotations: [],
          unstable_data: [],
          steps: [],
          custom: {},
        },
        createdAt: new Date(m.createdAt),
      } as ThreadMessage);
    }
  }

  return out;
}
