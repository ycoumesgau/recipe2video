import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { VideoProject } from "@/modules/videos/video.types";
import { RECIPE_SOURCE_CURSOR_AGENT_MAX_IMAGES } from "@/modules/media-assets/media-asset.constants";

import {
  RECIPE_AGENT_POLL_MAX_DELAY_SECONDS,
  RECIPE_AGENT_POLL_MIN_DELAY_SECONDS,
  RECIPE_AGENT_RECONCILE_STUCK_AFTER_MS,
  resolveRecipeAgentRunMaxDurationMs,
} from "../recipe-agent.constants";
import type {
  AgentConversation,
  AgentRun,
  RecipeAgentConfig,
  RecipeAgentRunResult,
  RecipeAgentRunStatus,
  RecipeAgentSession,
  RecipeAgentStage,
} from "../recipe-agent.types";
import type { SDKImage } from "@cursor/sdk";
import {
  getAgentConversationById,
  mirrorActiveConversationToVideo,
  updateAgentConversation,
} from "../repositories/agent-conversations.repository";
import {
  getAgentRunById,
  hasActiveAgentRunForConversation,
  listStaleActiveAgentRuns,
  updateAgentRun,
} from "../repositories/recipe-agent.repository";
import { buildAgentAttachmentCursorImages } from "../services/agent-attachment-cursor-images";
import { buildRecipeSourceCursorImagesForAgent } from "../services/recipe-source-cursor-images";
import type { CursorRecipeAgentService } from "../services/cursor-agent.service";
import { finalizeRecipeAgentChatTurn } from "./finalize-recipe-agent-chat-turn";
import {
  buildRecipeAgentUserChatContent,
  seedRecipeAgentChatTurn,
} from "./seed-recipe-agent-chat-turn";
import { buildConversationBranchForSlug } from "./ensure-agent-conversation";
import { ensureActiveAgentConversation } from "./ensure-agent-conversation";
import {
  fetchRecipeAgentArtifactsFromGithub,
  resolveVideoStatusAfterAgentSync,
  selectArtifactsForStage,
} from "./sync-recipe-agent-from-github";
import type { RecipeAgentArtifactSyncPlan } from "./sync-recipe-agent-artifacts";
import type { RecipeAgentOrchestrationDependencies } from "./orchestrate-recipe-agent";
import { createDefaultDependencies } from "./orchestrate-recipe-agent";

export interface RecipeAgentPollingWorkflowEvent {
  name:
    | "recipe.agent.run.poll.requested"
    | "recipe.agent.run.finalize.requested";
  data: Record<string, unknown>;
}

interface StartRecipeAgentRunInput {
  supabase: SupabaseDataClient;
  videoId: string;
  conversationId?: string;
  requestedByUserId: string;
  stage: RecipeAgentStage;
  message: string;
  attachmentMediaAssetIds?: string[];
  includeAssetsManifestBriefing?: boolean;
}

interface RecipeAgentPollingDeps extends RecipeAgentOrchestrationDependencies {
  supabase: SupabaseDataClient;
  getAgentConversation?(
    videoId: string,
    conversationId?: string,
  ): Promise<AgentConversation | null>;
  buildCursorImages?(
    input: StartRecipeAgentRunInput,
    project: VideoProject,
  ): Promise<SDKImage[]>;
  seedRecipeAgentChatTurnHook?: (
    input: Parameters<typeof seedRecipeAgentChatTurn>[1],
  ) => Promise<{ userMessageId: string; assistantMessageId: string }>;
  hasActiveAgentRunForConversation(
    conversationId: string,
  ): Promise<boolean>;
  getAgentRunById(agentRunId: string): Promise<AgentRun | null>;
  sendEvent(event: RecipeAgentPollingWorkflowEvent): Promise<void>;
  now(): string;
}

export function shouldUsePollingOrchestration(config: RecipeAgentConfig) {
  return config.pollingMode === "polling" && config.runtime === "cloud";
}

export async function startRecipeAgentRunWorkflow(
  input: StartRecipeAgentRunInput,
  deps: RecipeAgentPollingDeps,
) {
  const project = await deps.getVideoProject(input.videoId);
  if (!project) {
    throw new Error(`Video ${input.videoId} not found.`);
  }

  const conversation = deps.getAgentConversation
    ? await deps.getAgentConversation(input.videoId, input.conversationId)
    : input.conversationId
      ? await getAgentConversationById(input.supabase, input.conversationId)
      : await ensureActiveAgentConversation(input.supabase, input.videoId, project);

  if (!conversation || conversation.videoId !== input.videoId) {
    throw new Error(`Agent conversation not found for video ${input.videoId}.`);
  }

  if (await deps.hasActiveAgentRunForConversation(conversation.id)) {
    return { alreadyActive: true as const };
  }

  const recipeAgentService =
    deps.getRecipeAgentService?.(conversation) ?? deps.recipeAgentService;
  const gitBranch =
    conversation.agentGitBranch ??
    buildConversationBranchForSlug(input.videoId, conversation.slug);
  const cursorImages = deps.buildCursorImages
    ? await deps.buildCursorImages(input, project)
    : await buildCursorImages(input, project);
  const seedUserMessage = buildRecipeAgentUserChatContent(
    input.message,
    cursorImages.length,
  );

  let agentRun: AgentRun | undefined;
  let chatAssistantMessageId: string | undefined;
  let session: RecipeAgentSession | undefined;

  try {
    const existingSession = getExistingRecipeAgentSession(conversation);

    if (existingSession) {
      session = existingSession;
      agentRun = await deps.createAgentRun({
        videoId: input.videoId,
        agentConversationId: conversation.id,
        cursorAgentId: existingSession.agentId,
        stage: input.stage,
        userMessage: seedUserMessage,
        status: "starting",
        createdBy: input.requestedByUserId,
      });
      agentRun = await attachChatTurn(
        deps,
        input.supabase,
        input,
        conversation,
        agentRun,
        seedUserMessage,
        (assistantMessageId) => {
          chatAssistantMessageId = assistantMessageId;
        },
      );

      await updateConversationAgentStatus(
        deps,
        input.supabase,
        conversation,
        input.videoId,
        "running",
      );

      const started = await recipeAgentService.startMessage({
        agentId: existingSession.agentId,
        videoId: input.videoId,
        stage: input.stage,
        message: input.message,
        cursorImages: cursorImages.length > 0 ? cursorImages : undefined,
      });

      agentRun = await deps.updateAgentRun(agentRun.id, {
        cursorRunId: started.runId,
        cursorRunStartedAt: started.cursorRunStartedAt,
        status: "running",
      });
    } else {
      const created = await recipeAgentService.startMessageWithNewAgent({
        videoId: input.videoId,
        title: project.title,
        conversationId: conversation.id,
        conversationName: conversation.name,
        conversationSlug: conversation.slug,
        gitBranch,
        includeAssetsManifest:
          input.includeAssetsManifestBriefing ?? conversation.includeAssetsManifest,
        stage: input.stage,
        message: input.message,
        cursorImages: cursorImages.length > 0 ? cursorImages : undefined,
      });

      session = created.session;

      const updatedConversation = await updateAgentConversation(
        input.supabase,
        conversation.id,
        {
          cursorAgentId: created.session.agentId,
          cursorAgentRuntime: created.session.runtime,
          agentWorkspacePath: created.session.workspacePath,
          agentGitBranch: gitBranch,
          agentStatus: "running",
        },
      );
      await mirrorActiveConversationToVideo(
        input.supabase,
        input.videoId,
        updatedConversation,
      );

      agentRun = await deps.createAgentRun({
        videoId: input.videoId,
        agentConversationId: conversation.id,
        cursorAgentId: created.session.agentId,
        stage: input.stage,
        userMessage: seedUserMessage,
        status: "running",
        createdBy: input.requestedByUserId,
        cursorRunId: created.runId,
        cursorRunStartedAt: created.cursorRunStartedAt,
      });
      agentRun = await attachChatTurn(
        deps,
        input.supabase,
        input,
        conversation,
        agentRun,
        seedUserMessage,
        (assistantMessageId) => {
          chatAssistantMessageId = assistantMessageId;
        },
      );
    }

    await deps.sendEvent({
      name: "recipe.agent.run.poll.requested",
      data: {
        agentRunId: agentRun.id,
        videoId: input.videoId,
        conversationId: conversation.id,
        cursorAgentId: agentRun.cursorAgentId,
        cursorRunId: agentRun.cursorRunId,
        stage: input.stage,
        pollStartedAt: agentRun.cursorRunStartedAt ?? deps.now(),
        nextPollDelaySeconds: 6,
        requestedByUserId: input.requestedByUserId,
        isAllowlisted: true,
      },
    });

    return {
      agentRunId: agentRun.id,
      session,
      cursorRunId: agentRun.cursorRunId,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown recipe agent error.";

    if (agentRun) {
      await deps.updateAgentRun(agentRun.id, {
        status: "error",
        error: message,
        completedAt: deps.now(),
      });
    } else if (session?.agentId) {
      const failedRun = await deps.createAgentRun({
        videoId: input.videoId,
        agentConversationId: conversation.id,
        cursorAgentId: session.agentId,
        stage: input.stage,
        userMessage: seedUserMessage,
        status: "error",
        error: message,
        createdBy: input.requestedByUserId,
        completedAt: deps.now(),
      });
      await attachChatTurn(
        deps,
        input.supabase,
        input,
        conversation,
        failedRun,
        seedUserMessage,
        () => undefined,
      ).catch(() => undefined);
    }

    await updateConversationAgentStatus(
      deps,
      input.supabase,
      conversation,
      input.videoId,
      "failed",
    );

    throw error;
  }
}

export async function pollRecipeAgentRunWorkflow(
  data: {
    agentRunId: string;
    videoId: string;
    conversationId: string;
    cursorAgentId: string;
    cursorRunId: string;
    stage: RecipeAgentStage;
    pollStartedAt: string;
    nextPollDelaySeconds?: number;
    requestedByUserId: string;
  },
  deps: RecipeAgentPollingDeps & {
    recipeAgentService: CursorRecipeAgentService;
    config: RecipeAgentConfig;
  },
) {
  const agentRun = await deps.getAgentRunById(data.agentRunId);
  if (!agentRun) {
    throw new Error(`Agent run ${data.agentRunId} not found.`);
  }

  if (
    agentRun.status !== "starting" &&
    agentRun.status !== "running" &&
    agentRun.status !== "finalizing"
  ) {
    return { terminal: true, status: agentRun.status };
  }

  if (hasExceededAgentRunPollBudget(data.pollStartedAt, data.stage)) {
    await deps.recipeAgentService.cancelRun({
      agentId: data.cursorAgentId,
      runId: data.cursorRunId,
    });
    await deps.sendEvent({
      name: "recipe.agent.run.finalize.requested",
      data: {
        agentRunId: data.agentRunId,
        videoId: data.videoId,
        conversationId: data.conversationId,
        cursorAgentId: data.cursorAgentId,
        cursorRunId: data.cursorRunId,
        stage: data.stage,
        terminalStatus: "timed_out",
        requestedByUserId: data.requestedByUserId,
        isAllowlisted: true,
      },
    });
    return { terminal: true, status: "timed_out" as const };
  }

  if (agentRun.cancelRequested) {
    await deps.recipeAgentService.cancelRun({
      agentId: data.cursorAgentId,
      runId: data.cursorRunId,
    });
  }

  const polled = await deps.recipeAgentService.pollRun({
    agentId: data.cursorAgentId,
    runId: data.cursorRunId,
    streamLastSeq: agentRun.cursorStreamLastSeq,
    streamLastEventSignature: agentRun.cursorStreamLastEventSignature,
    assistantTextLength: agentRun.cursorAssistantTextLength,
    enableStreamSlice: deps.config.streamSliceEnabled,
    onStreamEvent: async (event) => {
      if (!agentRun.assistantChatMessageId) {
        return;
      }

      await deps.persistAgentRunStreamEvent?.({
        agentRunId: agentRun.id,
        seq: event.seq,
        eventType: event.eventType,
        payload: event.payload,
        assistantMessageId: agentRun.assistantChatMessageId,
      });
    },
  });

  await deps.updateAgentRun(agentRun.id, {
    lastPolledAt: deps.now(),
    pollCount: agentRun.pollCount + 1,
    cursorStreamLastSeq: polled.cursorStreamLastSeq,
    cursorStreamLastEventSignature: polled.cursorStreamLastEventSignature,
    needsUserInput: polled.needsUserInput,
    cursorAssistantTextLength: polled.cursorAssistantTextLength,
  });

  if (polled.needsUserInput) {
    const needsInputConversation = await updateAgentConversation(
      deps.supabase,
      data.conversationId,
      {
        agentStatus: "needs_input",
      },
    );
    await mirrorActiveConversationToVideo(
      deps.supabase,
      data.videoId,
      needsInputConversation,
    );
  }

  const terminalStatuses = new Set(["finished", "error", "cancelled"]);
  if (terminalStatuses.has(polled.status)) {
    await deps.sendEvent({
      name: "recipe.agent.run.finalize.requested",
      data: {
        agentRunId: data.agentRunId,
        videoId: data.videoId,
        conversationId: data.conversationId,
        cursorAgentId: data.cursorAgentId,
        cursorRunId: data.cursorRunId,
        stage: data.stage,
        terminalStatus: polled.status,
        requestedByUserId: data.requestedByUserId,
        isAllowlisted: true,
      },
    });
    return { terminal: true, status: polled.status };
  }

  await deps.sendEvent({
    name: "recipe.agent.run.poll.requested",
    data: {
      agentRunId: data.agentRunId,
      videoId: data.videoId,
      conversationId: data.conversationId,
      cursorAgentId: data.cursorAgentId,
      cursorRunId: data.cursorRunId,
      stage: data.stage,
      pollStartedAt: data.pollStartedAt,
      nextPollDelaySeconds: computeAgentPollDelaySeconds(polled.status, agentRun.pollCount + 1),
      requestedByUserId: data.requestedByUserId,
      isAllowlisted: true,
    },
  });

  return { terminal: false, status: polled.status };
}

export async function finalizeRecipeAgentRunWorkflow(
  data: {
    agentRunId: string;
    videoId: string;
    conversationId: string;
    cursorAgentId: string;
    cursorRunId: string;
    stage: RecipeAgentStage;
    terminalStatus: "finished" | "error" | "cancelled" | "timed_out";
    requestedByUserId: string;
  },
  deps: RecipeAgentPollingDeps & {
    supabase: SupabaseDataClient;
    recipeAgentService: CursorRecipeAgentService;
  },
) {
  const agentRun = await deps.getAgentRunById(data.agentRunId);
  if (!agentRun) {
    throw new Error(`Agent run ${data.agentRunId} not found.`);
  }

  const project = await deps.getVideoProject(data.videoId);
  if (!project) {
    throw new Error(`Video ${data.videoId} not found.`);
  }

  const conversation = await getAgentConversationById(
    deps.supabase,
    data.conversationId,
  );
  if (!conversation) {
    throw new Error(`Agent conversation ${data.conversationId} not found.`);
  }

  await deps.updateAgentRun(agentRun.id, { status: "finalizing" });

  let result: RecipeAgentRunResult;
  if (data.terminalStatus === "timed_out") {
    result = {
      agentId: data.cursorAgentId,
      runId: data.cursorRunId,
      status: "error",
      result: "Cursor agent run exceeded the configured wall-clock budget.",
      workspacePath:
        conversation.agentWorkspacePath ??
        `agent-recipes/${data.videoId}`,
      artifacts: [],
      streamMeta: { needsUserInput: false },
    };
  } else {
    result = await deps.recipeAgentService.finalizeRun({
      agentId: data.cursorAgentId,
      runId: data.cursorRunId,
      videoId: data.videoId,
      stage: data.stage,
      message: agentRun.userMessage,
      includeArtifactContents: true,
      streamMeta: {
        needsUserInput: agentRun.needsUserInput,
      },
    });
  }

  const enriched = await fetchRecipeAgentArtifactsFromGithub({
    project,
    cursorSessionWorkspacePath: result.workspacePath,
    seedArtifacts: result.artifacts,
    assistantResultText: result.result,
  });
  const artifactsToSync = selectArtifactsForStage(data.stage, enriched.artifacts);
  const syncPlan = await deps.syncArtifacts(deps.supabase, {
    videoId: data.videoId,
    agentConversationId: conversation.id,
    syncStoryboardTables: conversation.isActive,
    artifacts: artifactsToSync,
  });

  if (data.stage === "recipe_ingest" && data.terminalStatus === "finished") {
    assertRecipeIngestReadiness({
      syncPlan,
      artifacts: artifactsToSync,
      gitSha: enriched.gitSha,
      hasAssistantCheckpoint: enriched.hasAssistantCheckpoint,
    });
  }

  const runStatus = mapTerminalStatus(data.terminalStatus, result.status);
  const updatedRun = await deps.updateAgentRun(agentRun.id, {
    status: runStatus,
    resultSummary: result.result ?? null,
    error:
      runStatus === "error" || runStatus === "timed_out"
        ? result.result ?? agentRun.error ?? "Cursor agent run failed."
        : null,
    completedAt: deps.now(),
    agentGitBranch: enriched.gitBranch ?? null,
    agentGitCommitSha: enriched.gitSha ?? null,
    needsUserInput: result.streamMeta?.needsUserInput ?? agentRun.needsUserInput,
  });

  const updatedConversation = await updateAgentConversation(
    deps.supabase,
    conversation.id,
    {
      lastAgentRunId: result.runId,
      lastAgentSyncAt: deps.now(),
      agentGitBranch: enriched.gitBranch ?? conversation.agentGitBranch ?? null,
      agentGitCommitSha: enriched.gitSha ?? null,
      agentStatus: updatedRun.needsUserInput
        ? "needs_input"
        : syncPlan.valid
          ? "idle"
          : "validation_failed",
      ...(enriched.resolvedWorkspacePath
        ? { agentWorkspacePath: enriched.resolvedWorkspacePath }
        : {}),
    },
  );
  await mirrorActiveConversationToVideo(deps.supabase, data.videoId, updatedConversation);

  if (agentRun.assistantChatMessageId) {
    await finalizeRecipeAgentChatTurn(deps.supabase, {
      run: updatedRun,
      assistantMessageId: agentRun.assistantChatMessageId,
      runStatus,
      resultSummary: result.result ?? updatedRun.resultSummary,
      error:
        runStatus === "error" || runStatus === "timed_out"
          ? updatedRun.error
          : null,
    });
  }

  const nextVideoStatus = resolveVideoStatusAfterAgentSync({
    stage: data.stage,
    syncPlan,
  });
  if (nextVideoStatus) {
    await deps.updateVideoStatus(data.videoId, nextVideoStatus);
  }

  return { run: updatedRun, syncPlan };
}

export async function cancelRecipeAgentRunWorkflow(
  data: { agentRunId: string; videoId: string },
  deps: RecipeAgentPollingDeps & { recipeAgentService: CursorRecipeAgentService },
) {
  const agentRun = await deps.getAgentRunById(data.agentRunId);
  if (!agentRun || agentRun.videoId !== data.videoId) {
    throw new Error(`Agent run ${data.agentRunId} not found.`);
  }

  if (!agentRun.cursorRunId) {
    throw new Error(`Agent run ${data.agentRunId} has no Cursor run id.`);
  }

  await deps.updateAgentRun(agentRun.id, { cancelRequested: true });
  await deps.recipeAgentService.cancelRun({
    agentId: agentRun.cursorAgentId,
    runId: agentRun.cursorRunId,
  });
}

export async function reconcileStaleRecipeAgentRunsWorkflow(
  deps: RecipeAgentPollingDeps & {
    supabase: SupabaseDataClient;
    listStaleActiveAgentRuns?: (
      staleBefore: string,
    ) => Promise<AgentRun[]>;
  },
) {
  const staleBefore = new Date(
    Date.now() - RECIPE_AGENT_RECONCILE_STUCK_AFTER_MS,
  ).toISOString();
  const staleRuns = deps.listStaleActiveAgentRuns
    ? await deps.listStaleActiveAgentRuns(staleBefore)
    : await listStaleActiveAgentRuns(deps.supabase, staleBefore);

  for (const run of staleRuns) {
    if (!run.cursorRunId || !run.agentConversationId) {
      continue;
    }

    await deps.sendEvent({
      name: "recipe.agent.run.poll.requested",
      data: {
        agentRunId: run.id,
        videoId: run.videoId,
        conversationId: run.agentConversationId,
        cursorAgentId: run.cursorAgentId,
        cursorRunId: run.cursorRunId,
        stage: run.stage,
        pollStartedAt: run.cursorRunStartedAt ?? run.startedAt,
        nextPollDelaySeconds: RECIPE_AGENT_POLL_MIN_DELAY_SECONDS,
        requestedByUserId: "system",
        isAllowlisted: true,
      },
    });
  }

  return { reconciledCount: staleRuns.length };
}

function hasExceededAgentRunPollBudget(
  pollStartedAt: string,
  stage: RecipeAgentStage,
) {
  const startedMs = Date.parse(pollStartedAt);
  if (!Number.isFinite(startedMs)) {
    return false;
  }

  return Date.now() - startedMs > resolveRecipeAgentRunMaxDurationMs(stage);
}

function computeAgentPollDelaySeconds(status: string, pollCount: number) {
  if (pollCount > 20) {
    return RECIPE_AGENT_POLL_MAX_DELAY_SECONDS;
  }

  if (status === "running") {
    return 10;
  }

  return RECIPE_AGENT_POLL_MIN_DELAY_SECONDS;
}

function mapTerminalStatus(
  terminalStatus: "finished" | "error" | "cancelled" | "timed_out",
  resultStatus: RecipeAgentRunResult["status"],
): RecipeAgentRunStatus {
  if (terminalStatus === "timed_out") {
    return "timed_out";
  }

  if (terminalStatus === "cancelled") {
    return "cancelled";
  }

  if (resultStatus === "finished") {
    return "finished";
  }

  return "error";
}

function assertRecipeIngestReadiness(input: {
  syncPlan: RecipeAgentArtifactSyncPlan;
  artifacts: Awaited<ReturnType<typeof selectArtifactsForStage>>;
  gitSha: string | null;
  hasAssistantCheckpoint: boolean;
}) {
  if (!input.hasAssistantCheckpoint || !input.gitSha) {
    throw new Error(
      "Recipe ingest requires a Git checkpoint commit SHA in the assistant final response.",
    );
  }

  const hasRecipeAnalysis = input.syncPlan.artifactRecords.some(
    (artifact) => artifact.artifactName === "recipe-analysis.json",
  );

  if (!hasRecipeAnalysis) {
    throw new Error(
      "Recipe ingest finished without syncing recipe-analysis.json. The agent output is not exploitable yet.",
    );
  }
}

async function buildCursorImages(
  input: StartRecipeAgentRunInput,
  project: VideoProject,
) {
  const recipeSourceImages = await buildRecipeSourceCursorImagesForAgent(
    input.supabase,
    project,
    input.stage,
  );
  const attachmentImages = await buildAgentAttachmentCursorImages(
    input.supabase,
    {
      videoId: input.videoId,
      mediaAssetIds: input.attachmentMediaAssetIds ?? [],
    },
  );

  return [...recipeSourceImages, ...attachmentImages].slice(
    0,
    RECIPE_SOURCE_CURSOR_AGENT_MAX_IMAGES,
  );
}

function getExistingRecipeAgentSession(
  conversation: AgentConversation,
): RecipeAgentSession | null {
  if (
    conversation.cursorAgentId &&
    conversation.cursorAgentRuntime &&
    conversation.agentWorkspacePath
  ) {
    return {
      agentId: conversation.cursorAgentId,
      runtime: conversation.cursorAgentRuntime,
      workspacePath: conversation.agentWorkspacePath,
      model: conversation.cursorAgentModel,
    };
  }

  return null;
}

async function attachChatTurn(
  deps: RecipeAgentPollingDeps,
  supabase: SupabaseDataClient,
  input: StartRecipeAgentRunInput,
  conversation: AgentConversation,
  agentRun: AgentRun,
  seedUserMessage: string,
  onAssistantMessageId: (assistantMessageId: string) => void,
) {
  const ids = deps.seedRecipeAgentChatTurnHook
    ? await deps.seedRecipeAgentChatTurnHook({
        videoId: input.videoId,
        agentConversationId: conversation.id,
        agentRunId: agentRun.id,
        userMessage: seedUserMessage,
        stage: input.stage,
      })
    : await seedRecipeAgentChatTurn(supabase, {
        videoId: input.videoId,
        agentConversationId: conversation.id,
        agentRunId: agentRun.id,
        userMessage: seedUserMessage,
        stage: input.stage,
      });
  onAssistantMessageId(ids.assistantMessageId);
  return deps.updateAgentRun(agentRun.id, {
    userChatMessageId: ids.userMessageId,
    assistantChatMessageId: ids.assistantMessageId,
  });
}

async function updateConversationAgentStatus(
  deps: RecipeAgentPollingDeps,
  supabase: SupabaseDataClient,
  conversation: AgentConversation,
  videoId: string,
  agentStatus: AgentConversation["agentStatus"],
) {
  if (deps.updateAgentConversationRecord) {
    const updated = await deps.updateAgentConversationRecord(conversation.id, {
      agentStatus,
    });
    await deps.mirrorAgentConversationToVideo?.(videoId, updated);
    return;
  }

  const updated = await updateAgentConversation(supabase, conversation.id, {
    agentStatus,
  });
  await mirrorActiveConversationToVideo(supabase, videoId, updated);
}

export function createRecipeAgentPollingDeps(
  supabase: SupabaseDataClient,
  sendEvent: (event: RecipeAgentPollingWorkflowEvent) => Promise<void>,
): RecipeAgentPollingDeps {
  const baseDeps = createDefaultDependencies(supabase);

  return {
    ...baseDeps,
    supabase,
    hasActiveAgentRunForConversation: (conversationId) =>
      hasActiveAgentRunForConversation(supabase, conversationId),
    getAgentRunById: (agentRunId) => getAgentRunById(supabase, agentRunId),
    sendEvent,
    now: () => new Date().toISOString(),
  };
}
