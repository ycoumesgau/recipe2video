import { Agent } from "@cursor/sdk";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import { getVideoProjectById } from "@/modules/videos/repositories/video.repository";
import type { VideoProject } from "@/modules/videos/video.types";

import { resolveRecipeAgentConfig } from "../recipe-agent.config";
import {
  createAgentRun,
  insertAgentRunEvent,
  updateAgentRun,
  updateVideoAgentSession,
} from "../repositories/recipe-agent.repository";
import type {
  AgentRun,
  CreateAgentRunInput,
  RecipeAgentArtifact,
  RecipeAgentRunStatus,
  RecipeAgentSession,
  RecipeAgentStage,
  RecipeAgentStreamEventHandler,
  UpdateAgentRunInput,
  UpdateVideoAgentSessionInput,
} from "../recipe-agent.types";
import { extractAssistantCheckpoint } from "../services/checkpoint-parse";
import type { CursorRecipeAgentService } from "../services/cursor-agent.service";
import { createCursorRecipeAgentService } from "../services/cursor-agent.service";
import {
  fetchCheckpointManifestFromGithub,
  parseGithubRepoFromUrl,
  supplementRecipeAgentArtifactsFromGithub,
} from "../services/github-recipe-artifacts.service";
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
  /**
   * Persist streamed Cursor SDK events for the current DB `agent_runs` row.
   * Defaults to Supabase insert when using `createDefaultDependencies`.
   */
  persistAgentRunStreamEvent?: (input: {
    agentRunId: string;
    seq: number;
    eventType: string;
    payload: Record<string, unknown>;
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
    });
  };

  try {
    const result = await sendMessageWithExistingOrNewAgent();
    const enriched = await enrichArtifactsWithGithub({
      result,
      project: currentProject,
    });
    const syncPlan = await deps.syncArtifacts(input.supabase, {
      videoId: input.videoId,
      artifacts: enriched.artifacts,
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
          getAgentRunId: () => run?.id,
          onStreamEvent: handleStreamEvent,
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
      userMessage: input.message,
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
}> {
  let artifacts = input.result.artifacts;
  let gitBranch: string | null = input.project.agentGitBranch ?? null;
  let gitSha: string | null = input.project.agentGitCommitSha ?? null;

  let config: ReturnType<typeof resolveRecipeAgentConfig> | undefined;

  try {
    config = resolveRecipeAgentConfig();
  } catch {
    return { artifacts, gitBranch, gitSha };
  }

  const assistantCheckpoint = extractAssistantCheckpoint(input.result.result);

  if (assistantCheckpoint?.recipe2videoCheckpoint.branch) {
    gitBranch = assistantCheckpoint.recipe2videoCheckpoint.branch;
  }

  if (assistantCheckpoint?.recipe2videoCheckpoint.commitSha) {
    gitSha = assistantCheckpoint.recipe2videoCheckpoint.commitSha;
  }

  const repo = config.repoUrl ? parseGithubRepoFromUrl(config.repoUrl) : null;
  const token = config.githubToken;

  if (!repo || !token) {
    return { artifacts, gitBranch, gitSha };
  }

  const workspacePath = input.result.workspacePath;
  const ref = gitSha ?? gitBranch;

  if (!ref) {
    return { artifacts, gitBranch, gitSha };
  }

  try {
    const manifest = await fetchCheckpointManifestFromGithub({
      owner: repo.owner,
      repo: repo.repo,
      workspacePath,
      ref,
      token,
    });

    const supplementRef = manifest?.commitSha ?? ref;

    artifacts = await supplementRecipeAgentArtifactsFromGithub({
      workspacePath,
      artifacts,
      artifactPaths: manifest?.artifactPaths,
      preferGithub: true,
      owner: repo.owner,
      repo: repo.repo,
      ref: supplementRef,
      token,
    });

    if (manifest?.branch) {
      gitBranch = manifest.branch;
    }

    if (manifest?.commitSha) {
      gitSha = manifest.commitSha;
    }
  } catch (error) {
    console.warn(
      "[recipe-agent] GitHub artifact sync failed; falling back to Cursor SDK artifacts:",
      error instanceof Error ? error.message : error,
    );
  }

  return { artifacts, gitBranch, gitSha };
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
    createAgentRun: (runInput) => createAgentRun(supabase, runInput),
    updateAgentRun: (id, patch) => updateAgentRun(supabase, id, patch),
    syncArtifacts: (syncSupabase, syncInput) =>
      syncRecipeAgentArtifacts(syncSupabase ?? supabase, syncInput),
    persistAgentRunStreamEvent: async (event) => {
      try {
        await insertAgentRunEvent(supabase, event);
      } catch (err) {
        if (process.env.NODE_ENV !== "development") {
          throw err;
        }

        console.warn(
          "[recipe-agent] Skipping agent_run_events row in development (table missing or RLS):",
          err instanceof Error ? err.message : err,
        );
      }
    },
  };
}
