import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { Database } from "@/shared/supabase/database.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";
import { fromJson, toJson } from "@/shared/supabase/json";
import { mapVideoProject } from "@/modules/videos/repositories/video.repository";
import type { VideoProject } from "@/modules/videos/video.types";

import type {
  AgentArtifact,
  AgentRun,
  AgentRunTimelineEvent,
  CreateAgentRunInput,
  RecipeAgentArtifactValidationStatus,
  RecipeAgentRunStatus,
  RecipeAgentStage,
  UpdateAgentRunInput,
  UpdateVideoAgentSessionInput,
  UpsertAgentArtifactInput,
} from "../recipe-agent.types";

type AgentRunRow = Database["public"]["Tables"]["agent_runs"]["Row"];
type AgentArtifactRow =
  Database["public"]["Tables"]["agent_artifacts"]["Row"];
type AgentRunEventRow =
  Database["public"]["Tables"]["agent_run_events"]["Row"];

export async function updateVideoAgentSession(
  supabase: SupabaseDataClient,
  videoId: string,
  input: UpdateVideoAgentSessionInput,
): Promise<VideoProject> {
  const { data, error } = await supabase
    .from("videos")
    .update(stripUndefined({
      cursor_agent_id: input.cursorAgentId,
      cursor_agent_runtime: input.cursorAgentRuntime,
      agent_workspace_path: input.agentWorkspacePath,
      last_agent_run_id: input.lastAgentRunId,
      last_agent_sync_at: input.lastAgentSyncAt,
      agent_status: input.agentStatus,
      agent_git_branch: input.agentGitBranch,
      agent_git_commit_sha: input.agentGitCommitSha,
    }))
    .eq("id", videoId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updateVideoAgentSession failed");
  return mapVideoProject(data);
}

export async function createAgentRun(
  supabase: SupabaseDataClient,
  input: CreateAgentRunInput,
): Promise<AgentRun> {
  const { data, error } = await supabase
    .from("agent_runs")
    .insert(stripUndefined({
      video_id: input.videoId,
      agent_conversation_id: input.agentConversationId,
      cursor_agent_id: input.cursorAgentId,
      cursor_run_id: input.cursorRunId ?? undefined,
      stage: input.stage,
      user_message: input.userMessage,
      status: input.status ?? "queued",
      result_summary: input.resultSummary ?? undefined,
      error: input.error ?? undefined,
      created_by: input.createdBy ?? undefined,
      started_at: input.startedAt,
      completed_at: input.completedAt ?? undefined,
      agent_git_branch: input.agentGitBranch ?? undefined,
      agent_git_commit_sha: input.agentGitCommitSha ?? undefined,
      needs_user_input: input.needsUserInput ?? undefined,
      user_chat_message_id: input.userChatMessageId ?? undefined,
      assistant_chat_message_id: input.assistantChatMessageId ?? undefined,
      cursor_run_started_at: input.cursorRunStartedAt ?? undefined,
      cursor_stream_last_seq: input.cursorStreamLastSeq ?? undefined,
      cursor_stream_last_event_signature:
        input.cursorStreamLastEventSignature ?? undefined,
      cursor_assistant_text_length: input.cursorAssistantTextLength ?? undefined,
      last_polled_at: input.lastPolledAt ?? undefined,
      poll_count: input.pollCount ?? undefined,
      cancel_requested: input.cancelRequested ?? undefined,
    }))
    .select("*")
    .single();

  throwIfSupabaseError(error, "createAgentRun failed");
  return mapAgentRun(data);
}

export async function updateAgentRun(
  supabase: SupabaseDataClient,
  agentRunId: string,
  input: UpdateAgentRunInput,
): Promise<AgentRun> {
  const { data, error } = await supabase
    .from("agent_runs")
    .update(stripUndefined({
      cursor_run_id: input.cursorRunId,
      status: input.status,
      result_summary: input.resultSummary,
      error: input.error,
      completed_at: input.completedAt,
      agent_git_branch: input.agentGitBranch,
      agent_git_commit_sha: input.agentGitCommitSha,
      needs_user_input: input.needsUserInput,
      user_chat_message_id: input.userChatMessageId,
      assistant_chat_message_id: input.assistantChatMessageId,
      cursor_run_started_at: input.cursorRunStartedAt,
      cursor_stream_last_seq: input.cursorStreamLastSeq,
      cursor_stream_last_event_signature: input.cursorStreamLastEventSignature,
      cursor_assistant_text_length: input.cursorAssistantTextLength,
      last_polled_at: input.lastPolledAt,
      poll_count: input.pollCount,
      cancel_requested: input.cancelRequested,
    }))
    .eq("id", agentRunId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updateAgentRun failed");
  return mapAgentRun(data);
}

export async function listAgentRunsByVideoId(
  supabase: SupabaseDataClient,
  videoId: string,
  options: { agentConversationId?: string; limit?: number } = {},
): Promise<AgentRun[]> {
  let query = supabase
    .from("agent_runs")
    .select("*")
    .eq("video_id", videoId)
    .order("created_at", { ascending: false });

  if (options.agentConversationId) {
    query = query.eq("agent_conversation_id", options.agentConversationId);
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  throwIfSupabaseError(error, "listAgentRunsByVideoId failed");
  return data.map(mapAgentRun);
}

export async function getAgentRunById(
  supabase: SupabaseDataClient,
  agentRunId: string,
): Promise<AgentRun | null> {
  const { data, error } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("id", agentRunId)
    .maybeSingle();

  throwIfSupabaseError(error, "getAgentRunById failed");
  return data ? mapAgentRun(data) : null;
}

const ACTIVE_AGENT_RUN_STATUSES = [
  "starting",
  "running",
  "finalizing",
] as const satisfies readonly RecipeAgentRunStatus[];

export async function hasActiveAgentRunForConversation(
  supabase: SupabaseDataClient,
  agentConversationId: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from("agent_runs")
    .select("id", { count: "exact", head: true })
    .eq("agent_conversation_id", agentConversationId)
    .in("status", [...ACTIVE_AGENT_RUN_STATUSES]);

  throwIfSupabaseError(error, "hasActiveAgentRunForConversation failed");
  return (count ?? 0) > 0;
}

export async function listStaleActiveAgentRuns(
  supabase: SupabaseDataClient,
  staleBeforeIso: string,
): Promise<AgentRun[]> {
  const { data, error } = await supabase
    .from("agent_runs")
    .select("*")
    .in("status", [...ACTIVE_AGENT_RUN_STATUSES])
    .lt("cursor_run_started_at", staleBeforeIso);

  throwIfSupabaseError(error, "listStaleActiveAgentRuns failed");
  return (data ?? []).map(mapAgentRun);
}

export async function upsertAgentArtifact(
  supabase: SupabaseDataClient,
  input: UpsertAgentArtifactInput,
): Promise<AgentArtifact> {
  const { data, error } = await supabase
    .from("agent_artifacts")
    .upsert(
      stripUndefined({
        video_id: input.videoId,
        agent_conversation_id: input.agentConversationId,
        artifact_name: input.artifactName,
        artifact_path: input.artifactPath,
        content: input.content,
        content_hash: input.contentHash ?? undefined,
        validation_status: input.validationStatus ?? "pending",
        validation_errors: toJson(input.validationErrors ?? []),
      }),
      { onConflict: "video_id,agent_conversation_id,artifact_name" },
    )
    .select("*")
    .single();

  throwIfSupabaseError(error, "upsertAgentArtifact failed");
  return mapAgentArtifact(data);
}

export async function insertAgentRunEvent(
  supabase: SupabaseDataClient,
  input: {
    agentRunId: string;
    seq: number;
    eventType: string;
    payload: Record<string, unknown>;
  },
): Promise<AgentRunTimelineEvent> {
  const { data, error } = await supabase
    .from("agent_run_events")
    .insert({
      agent_run_id: input.agentRunId,
      seq: input.seq,
      event_type: input.eventType,
      payload: toJson(input.payload),
    })
    .select("*")
    .single();

  throwIfSupabaseError(error, "insertAgentRunEvent failed");
  return mapAgentRunEvent(data);
}

export async function listAgentRunEventsByAgentRunId(
  supabase: SupabaseDataClient,
  agentRunId: string,
  options: { limit?: number } = {},
): Promise<AgentRunTimelineEvent[]> {
  let query = supabase
    .from("agent_run_events")
    .select("*")
    .eq("agent_run_id", agentRunId)
    .order("seq", { ascending: true });

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  throwIfSupabaseError(error, "listAgentRunEventsByAgentRunId failed");
  return data.map(mapAgentRunEvent);
}

export async function listAgentArtifactsByVideoId(
  supabase: SupabaseDataClient,
  videoId: string,
  options: { agentConversationId?: string } = {},
): Promise<AgentArtifact[]> {
  let query = supabase
    .from("agent_artifacts")
    .select("*")
    .eq("video_id", videoId);

  if (options.agentConversationId) {
    query = query.eq("agent_conversation_id", options.agentConversationId);
  }

  const { data, error } = await query.order("artifact_name", { ascending: true });

  throwIfSupabaseError(error, "listAgentArtifactsByVideoId failed");
  return data.map(mapAgentArtifact);
}

export function mapAgentRun(row: AgentRunRow): AgentRun {
  return {
    id: row.id,
    videoId: row.video_id,
    agentConversationId: row.agent_conversation_id,
    cursorAgentId: row.cursor_agent_id,
    cursorRunId: row.cursor_run_id,
    stage: row.stage as RecipeAgentStage,
    userMessage: row.user_message,
    status: row.status as RecipeAgentRunStatus,
    resultSummary: row.result_summary,
    error: row.error,
    createdBy: row.created_by,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    agentGitBranch: row.agent_git_branch ?? null,
    agentGitCommitSha: row.agent_git_commit_sha ?? null,
    needsUserInput: row.needs_user_input ?? false,
    userChatMessageId: row.user_chat_message_id ?? null,
    assistantChatMessageId: row.assistant_chat_message_id ?? null,
    cursorRunStartedAt: row.cursor_run_started_at ?? null,
    cursorStreamLastSeq: row.cursor_stream_last_seq ?? 0,
    cursorStreamLastEventSignature: row.cursor_stream_last_event_signature ?? null,
    cursorAssistantTextLength: row.cursor_assistant_text_length ?? 0,
    lastPolledAt: row.last_polled_at ?? null,
    pollCount: row.poll_count ?? 0,
    cancelRequested: row.cancel_requested ?? false,
  };
}

export function mapAgentRunEvent(row: AgentRunEventRow): AgentRunTimelineEvent {
  return {
    id: row.id,
    agentRunId: row.agent_run_id,
    seq: row.seq,
    eventType: row.event_type,
    payload: fromJson<Record<string, unknown>>(row.payload) ?? {},
    createdAt: row.created_at,
  };
}

export function mapAgentArtifact(row: AgentArtifactRow): AgentArtifact {
  return {
    id: row.id,
    videoId: row.video_id,
    agentConversationId: row.agent_conversation_id,
    artifactName: row.artifact_name,
    artifactPath: row.artifact_path,
    content: row.content,
    contentHash: row.content_hash,
    validationStatus:
      row.validation_status as RecipeAgentArtifactValidationStatus,
    validationErrors: fromJson<string[]>(row.validation_errors) ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as T;
}
