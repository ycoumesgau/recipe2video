import { Agent } from "@cursor/sdk";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import {
  getVideoProjectById,
  updateVideoProjectStatus,
} from "@/modules/videos/repositories/video.repository";
import type { VideoProject } from "@/modules/videos/video.types";
import type { VideoStatus } from "@/modules/videos/video-status";
import {
  CURSOR_AGENT_DEFAULT_REASONING_BY_MODEL,
  CURSOR_AGENT_FAST_BY_MODEL,
  CURSOR_AGENT_MODEL_OPTIONS,
  CURSOR_AGENT_REASONING_OPTIONS,
  DEFAULT_CURSOR_AGENT_MODEL,
} from "@/modules/videos/video.constants";

import { resolveRecipeAgentConfig } from "../recipe-agent.config";
import {
  createAgentRun,
  insertAgentRunEvent,
  updateAgentRun,
  updateVideoAgentSession,
} from "../repositories/recipe-agent.repository";
import { applyRecipeAgentStreamToChat } from "../services/recipe-agent-chat-ingest";
import { finalizeRecipeAgentChatTurn } from "./finalize-recipe-agent-chat-turn";
import {
  buildRecipeAgentUserChatContent,
  seedRecipeAgentChatTurn,
} from "./seed-recipe-agent-chat-turn";
import { buildAgentAttachmentCursorImages } from "../services/agent-attachment-cursor-images";
import { buildRecipeSourceCursorImagesForAgent } from "../services/recipe-source-cursor-images";
import { RECIPE_SOURCE_CURSOR_AGENT_MAX_IMAGES } from "@/modules/media-assets/media-asset.constants";
import type {
  AgentRun,
  CreateAgentRunInput,
  RecipeAgentConfig,
  RecipeAgentArtifact,
  RecipeAgentRunStatus,
  RecipeAgentSession,
  RecipeAgentStage,
  RecipeAgentStreamEventHandler,
  UpdateAgentRunInput,
  UpdateVideoAgentSessionInput,
} from "../recipe-agent.types";
import type { CursorRecipeAgentService } from "../services/cursor-agent.service";
import { createCursorRecipeAgentService } from "../services/cursor-agent.service";
import {
  fetchRecipeAgentArtifactsFromGithub,
  resolveVideoStatusAfterAgentSync,
  selectArtifactsForStage,
} from "./sync-recipe-agent-from-github";
import {
  syncRecipeAgentArtifacts,
  type RecipeAgentArtifactSyncPlan,
} from "./sync-recipe-agent-artifacts";

interface EnsureRecipeAgentInput {
  supabase?: SupabaseDataClient;
  videoId: string;
  requestedByUserId: string;
}

interface SendRecipeAgentMessageInput extends EnsureRecipeAgentInput {
  stage: RecipeAgentStage;
  message: string;
  attachmentMediaAssetIds?: string[];
}

export interface RecipeAgentOrchestrationDependencies {
  getVideoProject(videoId: string): Promise<VideoProject | null>;
  updateVideoAgentSession(
    videoId: string,
    patch: UpdateVideoAgentSessionInput,
  ): Promise<VideoProject>;
  updateVideoStatus(videoId: string, status: VideoStatus): Promise<VideoProject>;
  recipeAgentService: CursorRecipeAgentService;
  getRecipeAgentService?: (project: VideoProject) => CursorRecipeAgentService;
  createAgentRun(input: CreateAgentRunInput): Promise<AgentRun>;
  updateAgentRun(id: string, patch: UpdateAgentRunInput): Promise<AgentRun>;
  syncArtifacts(
    supabase: SupabaseDataClient | undefined,
    input: Parameters<typeof syncRecipeAgentArtifacts>[1],
  ): Promise<RecipeAgentArtifactSyncPlan>;
  /**
   * Persist streamed Cursor SDK events for the current DB `agent_runs` row.
   * Defaults to Supabase insert when using `createDefaultDependencies`.
   */
  persistAgentRunStreamEvent?: (input: {
    agentRunId: string;
    seq: number;
    eventType: string;
    payload: Record<string, unknown>;
    assistantMessageId?: string;
  }) => Promise<void>;
}

export async function ensureRecipeAgent(
  input: EnsureRecipeAgentInput,
  dependencies?: RecipeAgentOrchestrationDependencies,
): Promise<RecipeAgentSession> {
  const deps = dependencies ?? createDefaultDependencies(input.supabase);
  const project = await deps.getVideoProject(input.videoId);

  if (!project) {
    throw new Error(`Video ${input.videoId} not found.`);
  }
  const recipeAgentService =
    deps.getRecipeAgentService?.(project) ?? deps.recipeAgentService;

  if (project.cursorAgentId && project.cursorAgentRuntime && project.agentWorkspacePath) {
    return {
      agentId: project.cursorAgentId,
      runtime: project.cursorAgentRuntime,
      workspacePath: project.agentWorkspacePath,
      model: "configured",
    };
  }

  const session = await recipeAgentService.createRecipeAgent({
    videoId: input.videoId,
    title: project.title,
  });

  await deps.updateVideoAgentSession(input.videoId, {
    cursorAgentId: session.agentId,
    cursorAgentRuntime: session.runtime,
    agentWorkspacePath: session.workspacePath,
    agentStatus: "idle",
  });

  return session;
}

export async function sendRecipeAgentMessage(
  input: SendRecipeAgentMessageInput,
  dependencies?: RecipeAgentOrchestrationDependencies,
) {
  const deps = dependencies ?? createDefaultDependencies(input.supabase);
  const project = await deps.getVideoProject(input.videoId);

  if (!project) {
    throw new Error(`Video ${input.videoId} not found.`);
  }
  const recipeAgentService =
    deps.getRecipeAgentService?.(project) ?? deps.recipeAgentService;

  const currentProject = project;
  const recipeSourceImages = await buildRecipeSourceCursorImagesForAgent(
    input.supabase,
    currentProject,
    input.stage,
  );
  const attachmentImages = await buildAgentAttachmentCursorImages(
    input.supabase,
    {
      videoId: input.videoId,
      mediaAssetIds: input.attachmentMediaAssetIds ?? [],
    },
  );
  const cursorImages = [
    ...recipeSourceImages,
    ...attachmentImages,
  ].slice(0, RECIPE_SOURCE_CURSOR_AGENT_MAX_IMAGES);
  const seedUserMessage = buildRecipeAgentUserChatContent(
    input.message,
    cursorImages.length,
  );

  let run: AgentRun | undefined;
  let session: RecipeAgentSession | undefined;
  let chatAssistantMessageId: string | undefined;

  async function attachChatTurnToRun(current: AgentRun): Promise<AgentRun> {
    if (!input.supabase) {
      return current;
    }

    const ids = await seedRecipeAgentChatTurn(input.supabase, {
      videoId: input.videoId,
      agentRunId: current.id,
      userMessage: seedUserMessage,
      stage: input.stage,
    });
    chatAssistantMessageId = ids.assistantMessageId;
    return deps.updateAgentRun(current.id, {
      userChatMessageId: ids.userMessageId,
      assistantChatMessageId: ids.assistantMessageId,
    });
  }

  const handleStreamEvent: RecipeAgentStreamEventHandler = async (event) => {
    const runId = run?.id;

    if (!runId) {
      return;
    }

    await deps.persistAgentRunStreamEvent?.({
      agentRunId: runId,
      seq: event.seq,
      eventType: event.eventType,
      payload: event.payload,
      assistantMessageId: chatAssistantMessageId,
    });
  };

  try {
    const result = await sendMessageWithExistingOrNewAgent();
    const enriched = await enrichArtifactsWithGithub({
      result,
      project: currentProject,
    });
    const artifactsToSync = selectArtifactsForStage(input.stage, enriched.artifacts);
    const syncPlan = await deps.syncArtifacts(input.supabase, {
      videoId: input.videoId,
      artifacts: artifactsToSync,
    });
    assertRecipeAgentSyncReadiness({
      stage: input.stage,
      syncPlan,
      artifacts: artifactsToSync,
      gitSha: enriched.gitSha,
      hasAssistantCheckpoint: enriched.hasAssistantCheckpoint,
    });

    const needsUserInput = result.streamMeta?.needsUserInput ?? false;

    const runStatus: RecipeAgentRunStatus =
      result.status === "finished" ? "finished" : result.status;

    if (!run || !session) {
      throw new Error("Recipe agent run was not initialized.");
    }

    const updatedRun = await deps.updateAgentRun(run.id, {
      cursorRunId: result.runId,
      status: runStatus,
      resultSummary: result.result ?? null,
      error:
        runStatus === "error"
          ? result.result ?? "Cursor agent run failed."
          : null,
      completedAt: new Date().toISOString(),
      agentGitBranch: enriched.gitBranch ?? null,
      agentGitCommitSha: enriched.gitSha ?? null,
      needsUserInput,
    });

    const nextAgentWorkspacePath =
      enriched.resolvedWorkspacePath ?? result.workspacePath?.trim() ?? undefined;

    await deps.updateVideoAgentSession(input.videoId, {
      lastAgentRunId: result.runId,
      lastAgentSyncAt: new Date().toISOString(),
      agentGitBranch: enriched.gitBranch ?? null,
      agentGitCommitSha: enriched.gitSha ?? null,
      agentStatus: needsUserInput
        ? "needs_input"
        : syncPlan.valid
          ? "idle"
          : "validation_failed",
      ...(nextAgentWorkspacePath
        ? { agentWorkspacePath: nextAgentWorkspacePath }
        : {}),
    });

    if (input.supabase && chatAssistantMessageId) {
      await finalizeRecipeAgentChatTurn(input.supabase, {
        run: updatedRun,
        assistantMessageId: chatAssistantMessageId,
        runStatus,
        resultSummary: result.result ?? updatedRun.resultSummary,
        error:
          runStatus === "error"
            ? (updatedRun.error ??
                result.result ??
                "Cursor agent run failed.")
            : null,
      });
    }

    const nextVideoStatus = resolveVideoStatusAfterAgentSync({
      stage: input.stage,
      syncPlan,
    });

    if (nextVideoStatus) {
      await deps.updateVideoStatus(input.videoId, nextVideoStatus);
    }

    return {
      session,
      run: updatedRun,
      syncPlan,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown recipe agent error.";

    const updatedRun = run
      ? await deps.updateAgentRun(run.id, {
          status: "error",
          error: message,
          completedAt: new Date().toISOString(),
        })
      : undefined;

    if (input.supabase && chatAssistantMessageId && updatedRun) {
      await finalizeRecipeAgentChatTurn(input.supabase, {
        run: updatedRun,
        assistantMessageId: chatAssistantMessageId,
        runStatus: "error",
        error: message,
      });
    }

    await deps.updateVideoAgentSession(input.videoId, {
      agentStatus: "failed",
    });

    throw Object.assign(error instanceof Error ? error : new Error(message), {
      run: updatedRun,
    });
  }

  async function sendMessageWithExistingOrNewAgent() {
    const existingSession = getExistingRecipeAgentSession(currentProject);

    if (existingSession) {
      session = existingSession;
      run = await createRunningAgentRun(existingSession);
      run = await attachChatTurnToRun(run);

      await deps.updateVideoAgentSession(input.videoId, {
        agentStatus: "running",
      });

      try {
        return await recipeAgentService.sendMessage({
          agentId: existingSession.agentId,
          videoId: input.videoId,
          stage: input.stage,
          message: input.message,
          cursorImages: cursorImages.length > 0 ? cursorImages : undefined,
          includeArtifactContents: true,
          getAgentRunId: () => run?.id,
          onStreamEvent: handleStreamEvent,
        });
      } catch (error) {
        if (!isCursorAgentNotFoundError(error)) {
          throw error;
        }

        const failedRun = await deps.updateAgentRun(run.id, {
          status: "error",
          error: error instanceof Error ? error.message : "Cursor agent not found.",
          completedAt: new Date().toISOString(),
        });

        if (input.supabase && chatAssistantMessageId) {
          await finalizeRecipeAgentChatTurn(input.supabase, {
            run: failedRun,
            assistantMessageId: chatAssistantMessageId,
            runStatus: "error",
            error: failedRun.error ?? "Cursor agent not found.",
          });
        }

        await deps.updateVideoAgentSession(input.videoId, {
          cursorAgentId: null,
          cursorAgentRuntime: null,
          agentWorkspacePath: null,
          agentStatus: "running",
        });

        session = undefined;
        run = undefined;
      }
    }

    const created = await recipeAgentService.createRecipeAgentAndSendMessage({
      videoId: input.videoId,
      title: currentProject.title,
      stage: input.stage,
      message: input.message,
      cursorImages: cursorImages.length > 0 ? cursorImages : undefined,
      includeArtifactContents: true,
      onSessionCreated: async (createdSession) => {
        session = createdSession;

        await deps.updateVideoAgentSession(input.videoId, {
          cursorAgentId: createdSession.agentId,
          cursorAgentRuntime: createdSession.runtime,
          agentWorkspacePath: createdSession.workspacePath,
          agentStatus: "running",
        });

        run = await createRunningAgentRun(createdSession);
        run = await attachChatTurnToRun(run);
      },
      onStreamEvent: handleStreamEvent,
    });

    session = created.session;

    return created.result;
  }

  function createRunningAgentRun(agentSession: RecipeAgentSession) {
    return deps.createAgentRun({
      videoId: input.videoId,
      cursorAgentId: agentSession.agentId,
      stage: input.stage,
      userMessage: seedUserMessage,
      status: "running",
      createdBy: input.requestedByUserId,
    });
  }
}

async function enrichArtifactsWithGithub(input: {
  result: {
    artifacts: RecipeAgentArtifact[];
    result?: string;
    workspacePath: string;
  };
  project: VideoProject;
}): Promise<{
  artifacts: RecipeAgentArtifact[];
  gitBranch: string | null;
  gitSha: string | null;
  hasAssistantCheckpoint: boolean;
  resolvedWorkspacePath: string | null;
}> {
  return fetchRecipeAgentArtifactsFromGithub({
    project: input.project,
    cursorSessionWorkspacePath: input.result.workspacePath,
    seedArtifacts: input.result.artifacts,
    assistantResultText: input.result.result,
  });
}

function assertRecipeAgentSyncReadiness(input: {
  stage: RecipeAgentStage;
  syncPlan: RecipeAgentArtifactSyncPlan;
  artifacts: RecipeAgentArtifact[];
  gitSha: string | null;
  hasAssistantCheckpoint: boolean;
}) {
  if (input.stage !== "recipe_ingest") {
    return;
  }

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

  const recipeAnalysisArtifact = input.artifacts.find(
    (artifact) => artifact.name === "recipe-analysis.json",
  );

  if (recipeAnalysisArtifact?.source !== "github") {
    throw new Error(
      "Recipe ingest requires recipe-analysis.json from GitHub checkpoint (SDK JSON fallback is disabled).",
    );
  }
}

function getExistingRecipeAgentSession(
  project: VideoProject,
): RecipeAgentSession | null {
  if (project.cursorAgentId && project.cursorAgentRuntime && project.agentWorkspacePath) {
    return {
      agentId: project.cursorAgentId,
      runtime: project.cursorAgentRuntime,
      workspacePath: project.agentWorkspacePath,
      model: "configured",
    };
  }

  return null;
}

function isCursorAgentNotFoundError(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const code = "code" in error ? error.code : undefined;

  if (code === "agent_not_found") {
    return true;
  }

  return error instanceof Error && error.message.includes("agent_not_found");
}

function createDefaultDependencies(
  supabase: SupabaseDataClient | undefined,
): RecipeAgentOrchestrationDependencies {
  if (!supabase) {
    throw new Error("Supabase client is required for recipe agent orchestration.");
  }

  const sdkAdapter = {
    create: (options: Parameters<typeof Agent.create>[0]) => Agent.create(options),
    resume: (agentId: string, options?: Parameters<typeof Agent.resume>[1]) =>
      Agent.resume(agentId, options),
  };
  const baseConfig = resolveRecipeAgentConfig();
  const baseRecipeAgentService = createCursorRecipeAgentService({
    sdk: sdkAdapter,
    config: baseConfig,
  });

  return {
    getVideoProject: (videoId) => getVideoProjectById(supabase, videoId),
    updateVideoAgentSession: (videoId, patch) =>
      updateVideoAgentSession(supabase, videoId, patch),
    updateVideoStatus: (videoId, status) =>
      updateVideoProjectStatus(supabase, videoId, status),
    recipeAgentService: baseRecipeAgentService,
    getRecipeAgentService: (project) => {
      const override = resolveProjectRecipeAgentConfigOverride(project);
      if (!override) {
        return baseRecipeAgentService;
      }

      return createCursorRecipeAgentService({
        sdk: sdkAdapter,
        config: {
          ...baseConfig,
          ...override,
        },
      });
    },
    createAgentRun: (runInput) => createAgentRun(supabase, runInput),
    updateAgentRun: (id, patch) => updateAgentRun(supabase, id, patch),
    syncArtifacts: (syncSupabase, syncInput) =>
      syncRecipeAgentArtifacts(syncSupabase ?? supabase, syncInput),
    persistAgentRunStreamEvent: async (event) => {
      try {
        await insertAgentRunEvent(supabase, {
          agentRunId: event.agentRunId,
          seq: event.seq,
          eventType: event.eventType,
          payload: event.payload,
        });
        if (event.assistantMessageId) {
          await applyRecipeAgentStreamToChat(supabase, {
            agentRunId: event.agentRunId,
            assistantMessageId: event.assistantMessageId,
            event: {
              seq: event.seq,
              eventType: event.eventType,
              payload: event.payload,
            },
          });
        }
      } catch (err) {
        if (process.env.NODE_ENV !== "development") {
          throw err;
        }

        console.warn(
          "[recipe-agent] Skipping agent_run_events / chat ingest in development (table missing or RLS):",
          err instanceof Error ? err.message : err,
        );
      }
    },
  };
}

function resolveProjectRecipeAgentConfigOverride(
  project: VideoProject,
): Pick<RecipeAgentConfig, "model" | "modelReasoning" | "modelFast"> | null {
  const defaults = getProductionDefaults(project.recipeData);
  if (!defaults?.cursorAgentModel) {
    return null;
  }

  const model = defaults.cursorAgentModel.trim();
  if (model.length === 0) {
    return null;
  }
  const allowedModels = new Set<string>(
    CURSOR_AGENT_MODEL_OPTIONS.map((option) => option.value),
  );
  const resolvedModel = allowedModels.has(model)
    ? model
    : DEFAULT_CURSOR_AGENT_MODEL;

  const modelKey = resolvedModel as keyof typeof CURSOR_AGENT_REASONING_OPTIONS;
  const allowedReasoning =
    CURSOR_AGENT_REASONING_OPTIONS[modelKey]?.map((option) => option.value) ?? [];
  const reasoningRaw = defaults.cursorAgentReasoning?.trim();
  const reasoning =
    reasoningRaw &&
    allowedReasoning.some((value) => value === reasoningRaw)
      ? reasoningRaw
      : CURSOR_AGENT_DEFAULT_REASONING_BY_MODEL[
          resolvedModel as keyof typeof CURSOR_AGENT_DEFAULT_REASONING_BY_MODEL
        ];
  const fastMode =
    CURSOR_AGENT_FAST_BY_MODEL[
      resolvedModel as keyof typeof CURSOR_AGENT_FAST_BY_MODEL
    ] ??
    "false";

  return {
    model: resolvedModel,
    modelReasoning: reasoning ? reasoning : undefined,
    modelFast: fastMode,
  };
}

function getProductionDefaults(
  recipeData: VideoProject["recipeData"],
): {
  cursorAgentModel?: string;
  cursorAgentReasoning?: string;
  cursorAgentFast?: string;
} | null {
  if (!isRecord(recipeData)) {
    return null;
  }

  const productionDefaults = recipeData.productionDefaults;
  if (!isRecord(productionDefaults)) {
    return null;
  }

  return {
    cursorAgentModel:
      typeof productionDefaults.cursorAgentModel === "string"
        ? productionDefaults.cursorAgentModel
        : undefined,
    cursorAgentReasoning:
      typeof productionDefaults.cursorAgentReasoning === "string"
        ? productionDefaults.cursorAgentReasoning
        : undefined,
    cursorAgentFast:
      typeof productionDefaults.cursorAgentFast === "string"
        ? productionDefaults.cursorAgentFast
        : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
