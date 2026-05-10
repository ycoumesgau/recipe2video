import type { RecipeAgentStreamEvent } from "../recipe-agent.types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const MAX_EVENT_JSON = 14000;

export function summarizeCursorStreamEvent(
  raw: unknown,
  seq: number,
): RecipeAgentStreamEvent {
  if (!isRecord(raw)) {
    return { seq, eventType: "unknown", payload: { valueType: typeof raw } };
  }

  const type = typeof raw.type === "string" ? raw.type : "unknown";

  if (type === "assistant" && isRecord(raw.message)) {
    const content = raw.message.content;
    let text = "";

    if (Array.isArray(content)) {
      for (const block of content) {
        if (isRecord(block) && block.type === "text" && typeof block.text === "string") {
          text += block.text;
        }
      }
    }

    return {
      seq,
      eventType: "assistant",
      payload: {
        textPreview: text.slice(0, 2000),
        truncated: text.length > 2000,
      },
    };
  }

  if (type === "thinking" && typeof raw.text === "string") {
    return {
      seq,
      eventType: "thinking",
      payload: {
        textPreview: raw.text.slice(0, 1200),
        truncated: raw.text.length > 1200,
      },
    };
  }

  if (type === "tool_call") {
    return {
      seq,
      eventType: "tool_call",
      payload: {
        name: typeof raw.name === "string" ? raw.name : undefined,
        status: typeof raw.status === "string" ? raw.status : undefined,
        truncated: raw.truncated,
      },
    };
  }

  if (type === "status") {
    return {
      seq,
      eventType: "status",
      payload: {
        status: typeof raw.status === "string" ? raw.status : undefined,
        message: typeof raw.message === "string" ? raw.message : undefined,
      },
    };
  }

  if (type === "request") {
    return {
      seq,
      eventType: "request",
      payload: {
        requestId:
          typeof raw.request_id === "string" ? raw.request_id : undefined,
      },
    };
  }

  let slim: Record<string, unknown>;

  try {
    const json = JSON.stringify(raw);
    slim =
      json.length > MAX_EVENT_JSON
        ? { truncated: true, preview: json.slice(0, MAX_EVENT_JSON) }
        : { ...raw };
  } catch {
    slim = { truncated: true };
  }

  return { seq, eventType: type, payload: slim };
}
