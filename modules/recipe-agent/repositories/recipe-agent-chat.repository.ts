import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { Database } from "@/shared/supabase/database.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";
import { fromJson, toJson } from "@/shared/supabase/json";

import type {
  RecipeAgentChatMessage,
  RecipeAgentChatMessageStatus,
  RecipeAgentChatRole,
  RecipeAgentStep,
  RecipeAgentStepState,
  RecipeAgentStepType,
  RecipeAgentThread,
} from "../recipe-agent.types";

type ThreadRow = Database["public"]["Tables"]["recipe_agent_threads"]["Row"];
type MessageRow = Database["public"]["Tables"]["recipe_agent_messages"]["Row"];
type StepRow = Database["public"]["Tables"]["recipe_agent_steps"]["Row"];

export async function getRecipeAgentThreadByVideoId(
  supabase: SupabaseDataClient,
  videoId: string,
): Promise<RecipeAgentThread | null> {
  const { data, error } = await supabase
    .from("recipe_agent_threads")
    .select("*")
    .eq("video_id", videoId)
    .maybeSingle();

  throwIfSupabaseError(error, "getRecipeAgentThreadByVideoId failed");
  return data ? mapThread(data) : null;
}

export async function ensureRecipeAgentThread(
  supabase: SupabaseDataClient,
  videoId: string,
): Promise<RecipeAgentThread> {
  const existing = await getRecipeAgentThreadByVideoId(supabase, videoId);
  if (existing) {
    return existing;
  }

  const { data, error } = await supabase
    .from("recipe_agent_threads")
    .insert({ video_id: videoId })
    .select("*")
    .single();

  throwIfSupabaseError(error, "ensureRecipeAgentThread failed");
  return mapThread(data);
}

export async function insertRecipeAgentMessage(
  supabase: SupabaseDataClient,
  input: {
    threadId: string;
    agentRunId: string | null;
    role: RecipeAgentChatRole;
    content?: string;
    status?: RecipeAgentChatMessageStatus;
    summary?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<RecipeAgentChatMessage> {
  const { data, error } = await supabase
    .from("recipe_agent_messages")
    .insert({
      thread_id: input.threadId,
      agent_run_id: input.agentRunId ?? undefined,
      role: input.role,
      content: input.content ?? "",
      status: input.status ?? "complete",
      summary: input.summary ?? undefined,
      metadata: toJson(input.metadata ?? {}),
    })
    .select("*")
    .single();

  throwIfSupabaseError(error, "insertRecipeAgentMessage failed");
  return mapMessage(data);
}

export async function appendRecipeAgentMessageContent(
  supabase: SupabaseDataClient,
  messageId: string,
  delta: string,
): Promise<void> {
  const { data: row, error: readErr } = await supabase
    .from("recipe_agent_messages")
    .select("content")
    .eq("id", messageId)
    .single();

  throwIfSupabaseError(readErr, "appendRecipeAgentMessageContent read failed");

  const next = `${row.content ?? ""}${delta}`;
  const { error } = await supabase
    .from("recipe_agent_messages")
    .update({ content: next })
    .eq("id", messageId);

  throwIfSupabaseError(error, "appendRecipeAgentMessageContent update failed");
}

export async function updateRecipeAgentMessage(
  supabase: SupabaseDataClient,
  messageId: string,
  patch: {
    content?: string;
    status?: RecipeAgentChatMessageStatus;
    summary?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<RecipeAgentChatMessage> {
  const { data, error } = await supabase
    .from("recipe_agent_messages")
    .update(
      stripUndefined({
        content: patch.content,
        status: patch.status,
        summary: patch.summary,
        metadata: patch.metadata !== undefined ? toJson(patch.metadata) : undefined,
      }),
    )
    .eq("id", messageId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updateRecipeAgentMessage failed");
  return mapMessage(data);
}

export async function listRecipeAgentMessagesByThreadId(
  supabase: SupabaseDataClient,
  threadId: string,
  options: { limit?: number } = {},
): Promise<RecipeAgentChatMessage[]> {
  let query = supabase
    .from("recipe_agent_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  throwIfSupabaseError(error, "listRecipeAgentMessagesByThreadId failed");
  return data.map(mapMessage);
}

export async function listRecipeAgentStepsByRunId(
  supabase: SupabaseDataClient,
  agentRunId: string,
): Promise<RecipeAgentStep[]> {
  const { data, error } = await supabase
    .from("recipe_agent_steps")
    .select("*")
    .eq("agent_run_id", agentRunId)
    .order("seq", { ascending: true });

  throwIfSupabaseError(error, "listRecipeAgentStepsByRunId failed");
  return data.map(mapStep);
}

export async function upsertRecipeAgentStep(
  supabase: SupabaseDataClient,
  input: {
    agentRunId: string;
    seq: number;
    stepType: RecipeAgentStepType;
    state?: RecipeAgentStepState;
    label?: string | null;
    detail?: string | null;
    payload?: Record<string, unknown>;
    sourceEventSeq?: number | null;
  },
): Promise<RecipeAgentStep> {
  const { data, error } = await supabase
    .from("recipe_agent_steps")
    .upsert(
      {
        agent_run_id: input.agentRunId,
        seq: input.seq,
        step_type: input.stepType,
        state: input.state ?? "running",
        label: input.label ?? undefined,
        detail: input.detail ?? undefined,
        payload: toJson(input.payload ?? {}),
        source_event_seq: input.sourceEventSeq ?? undefined,
      },
      { onConflict: "agent_run_id,seq" },
    )
    .select("*")
    .single();

  throwIfSupabaseError(error, "upsertRecipeAgentStep failed");
  return mapStep(data);
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as T;
}

function mapThread(row: ThreadRow): RecipeAgentThread {
  return {
    id: row.id,
    videoId: row.video_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: MessageRow): RecipeAgentChatMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    agentRunId: row.agent_run_id,
    role: row.role as RecipeAgentChatMessage["role"],
    content: row.content,
    status: row.status as RecipeAgentChatMessage["status"],
    summary: row.summary,
    metadata: fromJson<Record<string, unknown>>(row.metadata) ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStep(row: StepRow): RecipeAgentStep {
  return {
    id: row.id,
    agentRunId: row.agent_run_id,
    seq: row.seq,
    stepType: row.step_type as RecipeAgentStep["stepType"],
    state: row.state as RecipeAgentStep["state"],
    label: row.label,
    detail: row.detail,
    payload: fromJson<Record<string, unknown>>(row.payload) ?? {},
    sourceEventSeq: row.source_event_seq,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
