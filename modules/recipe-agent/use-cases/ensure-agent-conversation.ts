import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import {
  DEFAULT_CURSOR_AGENT_MODEL,
  CURSOR_AGENT_DEFAULT_REASONING_BY_MODEL,
  CURSOR_AGENT_FAST_BY_MODEL,
  CURSOR_AGENT_MODEL_OPTIONS,
  CURSOR_AGENT_REASONING_OPTIONS,
} from "@/modules/videos/video.constants";
import type { VideoProject } from "@/modules/videos/video.types";

import {
  buildConversationGitBranch,
  buildLegacyConversationGitBranch,
  slugifyConversationName,
} from "../agent-conversation.utils";
import { buildRecipeAgentWorkspace } from "../recipe-agent.workspace";
import type { AgentConversation } from "../recipe-agent.types";
import {
  getActiveAgentConversationByVideoId,
  insertAgentConversation,
  listAgentConversationsByVideoId,
  mirrorActiveConversationToVideo,
  updateAgentConversation,
} from "../repositories/agent-conversations.repository";

export async function ensureActiveAgentConversation(
  supabase: SupabaseDataClient,
  videoId: string,
  project?: VideoProject | null,
): Promise<AgentConversation> {
  const active = await getActiveAgentConversationByVideoId(supabase, videoId);
  if (active) {
    return active;
  }

  const existing = await listAgentConversationsByVideoId(supabase, videoId);
  if (existing.length > 0) {
    const first = existing[0];
    const activated = await updateAgentConversation(supabase, first.id, {
      isActive: true,
    });
    await mirrorActiveConversationToVideo(supabase, videoId, activated);
    return activated;
  }

  const defaults = resolveConversationDefaultsFromProject(project);
  const workspace = buildRecipeAgentWorkspace(videoId);
  const slug = "initial";
  const conversation = await insertAgentConversation(supabase, {
    videoId,
    name: "Initial",
    slug,
    cursorAgentModel: defaults.model,
    cursorAgentReasoning: defaults.reasoning,
    cursorAgentFast: defaults.fast,
    customInstructions: defaults.customInstructions,
    includeAssetsManifest: true,
    isActive: true,
    agentWorkspacePath: workspace.workspacePath,
    agentGitBranch: buildLegacyConversationGitBranch(videoId),
  });

  if (project?.cursorAgentId) {
    const hydrated = await updateAgentConversation(supabase, conversation.id, {
      cursorAgentId: project.cursorAgentId,
      cursorAgentRuntime: project.cursorAgentRuntime ?? null,
      agentGitBranch: project.agentGitBranch ?? conversation.agentGitBranch,
      agentGitCommitSha: project.agentGitCommitSha ?? null,
      agentStatus: project.agentStatus,
      lastAgentRunId: project.lastAgentRunId ?? null,
      lastAgentSyncAt: project.lastAgentSyncAt ?? null,
    });
    await mirrorActiveConversationToVideo(supabase, videoId, hydrated);
    return hydrated;
  }

  await mirrorActiveConversationToVideo(supabase, videoId, conversation);
  return conversation;
}

export function resolveConversationDefaultsFromProject(
  project?: VideoProject | null,
): {
  model: string;
  reasoning?: string | null;
  fast: boolean;
  customInstructions?: string | null;
} {
  const productionDefaults = readProductionDefaults(project?.recipeData);
  const modelCandidate = productionDefaults?.cursorAgentModel ?? "";
  const model =
    CURSOR_AGENT_MODEL_OPTIONS.find((option) => option.value === modelCandidate)
      ?.value ?? DEFAULT_CURSOR_AGENT_MODEL;

  const reasoningOptions =
    CURSOR_AGENT_REASONING_OPTIONS[
      model as keyof typeof CURSOR_AGENT_REASONING_OPTIONS
    ] ?? [];
  const reasoningCandidate = productionDefaults?.cursorAgentReasoning ?? "";
  const reasoning =
    reasoningOptions.find((option) => option.value === reasoningCandidate)
      ?.value ??
    CURSOR_AGENT_DEFAULT_REASONING_BY_MODEL[
      model as keyof typeof CURSOR_AGENT_DEFAULT_REASONING_BY_MODEL
    ];

  const fastRaw = productionDefaults?.cursorAgentFast;
  const fast =
    fastRaw === "true" ||
    (CURSOR_AGENT_FAST_BY_MODEL[
      model as keyof typeof CURSOR_AGENT_FAST_BY_MODEL
    ] === "true" &&
      fastRaw !== "false");

  const customInstructions = readCustomInstructions(project?.recipeData);

  return {
    model,
    reasoning: reasoningOptions.length > 0 ? reasoning : null,
    fast,
    customInstructions,
  };
}

export function buildNewConversationDefaults(input: {
  model: string;
  reasoning?: string | null;
  fast?: boolean;
}) {
  return {
    model: input.model,
    reasoning: input.reasoning ?? null,
    fast: input.fast ?? false,
  };
}

export function buildConversationBranchForSlug(videoId: string, slug: string) {
  return slug === "initial"
    ? buildLegacyConversationGitBranch(videoId)
    : buildConversationGitBranch(videoId, slug);
}

export function uniqueConversationSlug(name: string, taken: Set<string>) {
  const base = slugifyConversationName(name);
  if (!taken.has(base)) {
    return base;
  }

  let index = 2;
  while (taken.has(`${base}-${index}`)) {
    index += 1;
  }

  return `${base}-${index}`;
}

export function uniqueConversationName(name: string, taken: Set<string>) {
  const base = name.trim();
  if (!taken.has(base)) {
    return base;
  }

  let index = 2;
  while (taken.has(`${base} (${index})`)) {
    index += 1;
  }

  return `${base} (${index})`;
}

function readProductionDefaults(recipeData: VideoProject["recipeData"]) {
  if (!recipeData || typeof recipeData !== "object") {
    return null;
  }

  const productionDefaults = (recipeData as Record<string, unknown>)
    .productionDefaults;
  if (!productionDefaults || typeof productionDefaults !== "object") {
    return null;
  }

  const defaults = productionDefaults as Record<string, unknown>;
  return {
    cursorAgentModel:
      typeof defaults.cursorAgentModel === "string"
        ? defaults.cursorAgentModel
        : undefined,
    cursorAgentReasoning:
      typeof defaults.cursorAgentReasoning === "string"
        ? defaults.cursorAgentReasoning
        : undefined,
    cursorAgentFast:
      typeof defaults.cursorAgentFast === "string"
        ? defaults.cursorAgentFast
        : undefined,
  };
}

function readCustomInstructions(recipeData: VideoProject["recipeData"]) {
  if (!recipeData || typeof recipeData !== "object") {
    return null;
  }

  const value = (recipeData as Record<string, unknown>)
    .complementaryAgentInstructions;
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}
