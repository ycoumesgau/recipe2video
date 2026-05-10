import { Agent } from "@cursor/sdk";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import {
  getVideoProjectById,
} from "@/modules/videos/repositories/video.repository";
import type { VideoProject } from "@/modules/videos/video.types";

import {
  createAgentRun,
  updateAgentRun,
  updateVideoAgentSession,
} from "../repositories/recipe-agent.repository";
import type {
  AgentRun,
  CreateAgentRunInput,
  RecipeAgentRunStatus,
  RecipeAgentSession,
  RecipeAgentStage,
  UpdateAgentRunInput,
  UpdateVideoAgentSessionInput,
} from "../recipe-agent.types";
import type { CursorRecipeAgentService } from "../services/cursor-agent.service";
import { createCursorRecipeAgentService } from "../services/cursor-agent.service";
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
}

export interface RecipeAgentOrchestrationDependencies {
  getVideoProject(videoId: string): Promise<VideoProject | null>;
  updateVideoAgentSession(
    videoId: string,
    patch: UpdateVideoAgentSessionInput,
  ): Promise<VideoProject>;
  recipeAgentService: CursorRecipeAgentService;
  createAgentRun(input: CreateAgentRunInput): Promise<AgentRun>;
  updateAgentRun(id: string, patch: UpdateAgentRunInput): Promise<AgentRun>;
  syncArtifacts(
    supabase: SupabaseDataClient | undefined,
    input: Parameters<typeof syncRecipeAgentArtifacts>[1],
  ): Promise<RecipeAgentArtifactSyncPlan>;
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

  if (project.cursorAgentId && project.cursorAgentRuntime && project.agentWorkspacePath) {
    return {
      agentId: project.cursorAgentId,
      runtime: project.cursorAgentRuntime,
      workspacePath: project.agentWorkspacePath,
      model: "configured",
    };
  }

  const session = await deps.recipeAgentService.createRecipeAgent({
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

  const currentProject = project;
  let run: AgentRun | undefined;
  let session: RecipeAgentSession | undefined;

  try {
    const result = await sendMessageWithExistingOrNewAgent();
    const syncPlan = await deps.syncArtifacts(input.supabase, {
      videoId: input.videoId,
      artifacts: result.artifacts,
    });
    const runStatus: RecipeAgentRunStatus =
      result.status === "finished" ? "finished" : result.status;

    if (!run || !session) {
      throw new Error("Recipe agent run was not initialized.");
    }

    const updatedRun = await deps.updateAgentRun(run.id, {
      cursorRunId: result.runId,
      status: runStatus,
      resultSummary: result.result ?? null,
      error: runStatus === "error" ? result.result ?? "Cursor agent run failed." : null,
      completedAt: new Date().toISOString(),
    });

    await deps.updateVideoAgentSession(input.videoId, {
      lastAgentRunId: result.runId,
      lastAgentSyncAt: new Date().toISOString(),
      agentStatus: syncPlan.valid ? "idle" : "validation_failed",
    });

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

      await deps.updateVideoAgentSession(input.videoId, {
        agentStatus: "running",
      });

      try {
        return await deps.recipeAgentService.sendMessage({
          agentId: existingSession.agentId,
          videoId: input.videoId,
          stage: input.stage,
          message: input.message,
          includeArtifactContents: true,
        });
      } catch (error) {
        if (!isCursorAgentNotFoundError(error)) {
          throw error;
        }

        await deps.updateAgentRun(run.id, {
          status: "error",
          error: error instanceof Error ? error.message : "Cursor agent not found.",
          completedAt: new Date().toISOString(),
        });

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

    const created = await deps.recipeAgentService.createRecipeAgentAndSendMessage({
      videoId: input.videoId,
      title: currentProject.title,
      stage: input.stage,
      message: input.message,
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
      },
    });

    session = created.session;

    return created.result;
  }

  function createRunningAgentRun(agentSession: RecipeAgentSession) {
    return deps.createAgentRun({
      videoId: input.videoId,
      cursorAgentId: agentSession.agentId,
      stage: input.stage,
      userMessage: input.message,
      status: "running",
      createdBy: input.requestedByUserId,
    });
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

  return {
    getVideoProject: (videoId) => getVideoProjectById(supabase, videoId),
    updateVideoAgentSession: (videoId, patch) =>
      updateVideoAgentSession(supabase, videoId, patch),
    recipeAgentService: createCursorRecipeAgentService({
      sdk: {
        create: (options) => Agent.create(options),
        resume: (agentId, options) => Agent.resume(agentId, options),
      },
    }),
    createAgentRun: (input) => createAgentRun(supabase, input),
    updateAgentRun: (id, patch) => updateAgentRun(supabase, id, patch),
    syncArtifacts: (syncSupabase, input) =>
      syncRecipeAgentArtifacts(syncSupabase ?? supabase, input),
  };
}
