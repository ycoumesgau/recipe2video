import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { Database } from "@/shared/supabase/database.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";

import type {
  AgentConversation,
  CreateAgentConversationInput,
  RecipeAgentRuntime,
  RecipeAgentStatus,
  UpdateAgentConversationInput,
} from "../recipe-agent.types";
import { updateVideoAgentSession } from "./recipe-agent.repository";

type AgentConversationRow =
  Database["public"]["Tables"]["agent_conversations"]["Row"];

export async function listAgentConversationsByVideoId(
  supabase: SupabaseDataClient,
  videoId: string,
): Promise<AgentConversation[]> {
  const { data, error } = await supabase
    .from("agent_conversations")
    .select("*")
    .eq("video_id", videoId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  throwIfSupabaseError(error, "listAgentConversationsByVideoId failed");
  return (data ?? []).map(mapAgentConversation);
}

export async function getAgentConversationById(
  supabase: SupabaseDataClient,
  conversationId: string,
): Promise<AgentConversation | null> {
  const { data, error } = await supabase
    .from("agent_conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle();

  throwIfSupabaseError(error, "getAgentConversationById failed");
  return data ? mapAgentConversation(data) : null;
}

export async function getActiveAgentConversationByVideoId(
  supabase: SupabaseDataClient,
  videoId: string,
): Promise<AgentConversation | null> {
  const { data, error } = await supabase
    .from("agent_conversations")
    .select("*")
    .eq("video_id", videoId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  throwIfSupabaseError(error, "getActiveAgentConversationByVideoId failed");
  return data ? mapAgentConversation(data) : null;
}

export async function countAgentConversationsByVideoId(
  supabase: SupabaseDataClient,
  videoId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("agent_conversations")
    .select("id", { count: "exact", head: true })
    .eq("video_id", videoId)
    .is("deleted_at", null);

  throwIfSupabaseError(error, "countAgentConversationsByVideoId failed");
  return count ?? 0;
}

export async function insertAgentConversation(
  supabase: SupabaseDataClient,
  input: CreateAgentConversationInput,
): Promise<AgentConversation> {
  const { data, error } = await supabase
    .from("agent_conversations")
    .insert(stripUndefined({
      video_id: input.videoId,
      name: input.name,
      slug: input.slug,
      cursor_agent_model: input.cursorAgentModel,
      cursor_agent_reasoning: input.cursorAgentReasoning ?? undefined,
      cursor_agent_fast: input.cursorAgentFast ?? false,
      custom_instructions: input.customInstructions ?? undefined,
      include_assets_manifest: input.includeAssetsManifest ?? true,
      is_active: input.isActive ?? false,
      agent_workspace_path: input.agentWorkspacePath ?? undefined,
      agent_git_branch: input.agentGitBranch ?? undefined,
    }))
    .select("*")
    .single();

  throwIfSupabaseError(error, "insertAgentConversation failed");
  return mapAgentConversation(data);
}

export async function updateAgentConversation(
  supabase: SupabaseDataClient,
  conversationId: string,
  input: UpdateAgentConversationInput,
): Promise<AgentConversation> {
  const { data, error } = await supabase
    .from("agent_conversations")
    .update(stripUndefined({
      name: input.name,
      slug: input.slug,
      cursor_agent_id: input.cursorAgentId,
      cursor_agent_runtime: input.cursorAgentRuntime,
      agent_workspace_path: input.agentWorkspacePath,
      agent_git_branch: input.agentGitBranch,
      agent_git_commit_sha: input.agentGitCommitSha,
      agent_status: input.agentStatus,
      last_agent_run_id: input.lastAgentRunId,
      last_agent_sync_at: input.lastAgentSyncAt,
      cursor_agent_model: input.cursorAgentModel,
      cursor_agent_reasoning: input.cursorAgentReasoning,
      cursor_agent_fast: input.cursorAgentFast,
      custom_instructions: input.customInstructions,
      include_assets_manifest: input.includeAssetsManifest,
      is_active: input.isActive,
      archived_at: input.archivedAt,
      deleted_at: input.deletedAt,
    }))
    .eq("id", conversationId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updateAgentConversation failed");
  return mapAgentConversation(data);
}

export async function renameAgentConversation(
  supabase: SupabaseDataClient,
  conversationId: string,
  name: string,
  slug: string,
): Promise<AgentConversation> {
  return updateAgentConversation(supabase, conversationId, { name, slug });
}

export async function softDeleteAgentConversation(
  supabase: SupabaseDataClient,
  conversationId: string,
): Promise<AgentConversation> {
  return updateAgentConversation(supabase, conversationId, {
    deletedAt: new Date().toISOString(),
    isActive: false,
  });
}

export async function findSoftDeletedAgentConversationByVideoAndName(
  supabase: SupabaseDataClient,
  videoId: string,
  name: string,
): Promise<AgentConversation | null> {
  const { data, error } = await supabase
    .from("agent_conversations")
    .select("*")
    .eq("video_id", videoId)
    .eq("name", name.trim())
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  throwIfSupabaseError(
    error,
    "findSoftDeletedAgentConversationByVideoAndName failed",
  );
  return data ? mapAgentConversation(data) : null;
}

/**
 * Mirror active conversation agent fields onto `videos` for backward compatibility.
 */
export async function mirrorActiveConversationToVideo(
  supabase: SupabaseDataClient,
  videoId: string,
  conversation: AgentConversation,
) {
  await updateVideoAgentSession(supabase, videoId, {
    cursorAgentId: conversation.cursorAgentId,
    cursorAgentRuntime: conversation.cursorAgentRuntime,
    agentWorkspacePath: conversation.agentWorkspacePath,
    lastAgentRunId: conversation.lastAgentRunId,
    lastAgentSyncAt: conversation.lastAgentSyncAt,
    agentStatus: conversation.agentStatus,
    agentGitBranch: conversation.agentGitBranch,
    agentGitCommitSha: conversation.agentGitCommitSha,
  });
}

export function mapAgentConversation(row: AgentConversationRow): AgentConversation {
  return {
    id: row.id,
    videoId: row.video_id,
    name: row.name,
    slug: row.slug,
    cursorAgentId: row.cursor_agent_id,
    cursorAgentRuntime: row.cursor_agent_runtime as RecipeAgentRuntime | null,
    agentWorkspacePath: row.agent_workspace_path,
    agentGitBranch: row.agent_git_branch,
    agentGitCommitSha: row.agent_git_commit_sha,
    agentStatus: row.agent_status as RecipeAgentStatus,
    lastAgentRunId: row.last_agent_run_id,
    lastAgentSyncAt: row.last_agent_sync_at,
    cursorAgentModel: row.cursor_agent_model,
    cursorAgentReasoning: row.cursor_agent_reasoning,
    cursorAgentFast: row.cursor_agent_fast,
    customInstructions: row.custom_instructions,
    includeAssetsManifest: row.include_assets_manifest,
    isActive: row.is_active,
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as T;
}
