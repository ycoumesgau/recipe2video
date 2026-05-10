import type { SupabaseDataClient } from "@/shared/supabase/client.types";

import type { RecipeAgentStreamEvent } from "../recipe-agent.types";
import {
  appendRecipeAgentMessageContent,
  upsertRecipeAgentStep,
} from "../repositories/recipe-agent-chat.repository";

export async function applyRecipeAgentStreamToChat(
  supabase: SupabaseDataClient,
  input: {
    agentRunId: string;
    assistantMessageId: string;
    event: RecipeAgentStreamEvent;
  },
): Promise<void> {
  const { eventType, payload, seq } = input.event;

  if (
    eventType === "assistant" &&
    typeof payload.textPreview === "string" &&
    payload.textPreview.length > 0
  ) {
    await appendRecipeAgentMessageContent(
      supabase,
      input.assistantMessageId,
      payload.textPreview,
    );
    return;
  }

  if (
    eventType === "thinking" &&
    typeof payload.textPreview === "string"
  ) {
    await upsertRecipeAgentStep(supabase, {
      agentRunId: input.agentRunId,
      seq,
      stepType: "thinking",
      state: "done",
      label: "Reasoning",
      detail: payload.textPreview,
      payload,
      sourceEventSeq: seq,
    });
    return;
  }

  if (eventType === "tool_call") {
    const name =
      typeof payload.name === "string" ? payload.name : "Tool";
    const status =
      typeof payload.status === "string" ? payload.status : undefined;
    await upsertRecipeAgentStep(supabase, {
      agentRunId: input.agentRunId,
      seq,
      stepType: "tool_call",
      state: mapToolCallState(status),
      label: name,
      detail: status,
      payload,
      sourceEventSeq: seq,
    });
    return;
  }

  if (eventType === "status") {
    const status =
      typeof payload.status === "string" ? payload.status : "status";
    const message =
      typeof payload.message === "string" ? payload.message : undefined;
    await upsertRecipeAgentStep(supabase, {
      agentRunId: input.agentRunId,
      seq,
      stepType: "status",
      state: "done",
      label: status,
      detail: message,
      payload,
      sourceEventSeq: seq,
    });
    return;
  }

  if (eventType === "request") {
    await upsertRecipeAgentStep(supabase, {
      agentRunId: input.agentRunId,
      seq,
      stepType: "request",
      state: "running",
      label: "Needs input",
      detail:
        typeof payload.requestId === "string"
          ? `Request ${payload.requestId}`
          : undefined,
      payload,
      sourceEventSeq: seq,
    });
    return;
  }

  await upsertRecipeAgentStep(supabase, {
    agentRunId: input.agentRunId,
    seq,
    stepType: "unknown",
    state: "done",
    label: eventType,
    detail: safeJsonPreview(payload),
    payload,
    sourceEventSeq: seq,
  });
}

function mapToolCallState(
  status: string | undefined,
): "pending" | "running" | "done" | "error" {
  if (!status) {
    return "running";
  }
  const s = status.toLowerCase();
  if (s.includes("error") || s.includes("fail")) {
    return "error";
  }
  if (s.includes("done") || s.includes("complete") || s.includes("success")) {
    return "done";
  }
  if (s.includes("pending") || s.includes("queued")) {
    return "pending";
  }
  return "running";
}

function safeJsonPreview(payload: Record<string, unknown>): string {
  try {
    const json = JSON.stringify(payload);
    return json.length > 400 ? `${json.slice(0, 397)}…` : json;
  } catch {
    return "(payload)";
  }
}
