import assert from "node:assert/strict";
import test from "node:test";

import type { VideoProject } from "@/modules/videos/video.types";

import {
  ensureRecipeAgent,
  sendRecipeAgentMessage,
  type RecipeAgentOrchestrationDependencies,
} from "./orchestrate-recipe-agent";
import type {
  CreateAgentRunInput,
  UpdateAgentRunInput,
} from "../recipe-agent.types";

test("ensureRecipeAgent reuses an existing recipe agent session", async () => {
  const deps = createDeps({
    project: {
      ...baseProject,
      cursorAgentId: "bc-existing",
      cursorAgentRuntime: "cloud",
      agentWorkspacePath: "agent-recipes/video-1",
    },
  });

  const session = await ensureRecipeAgent(
    { videoId: "video-1", requestedByUserId: "user-1" },
    deps,
  );

  assert.equal(session.agentId, "bc-existing");
  assert.equal(deps.createdAgents.length, 0);
  assert.equal(deps.sessionUpdates.length, 0);
});

test("ensureRecipeAgent creates and stores a recipe agent when missing", async () => {
  const deps = createDeps({ project: baseProject });

  const session = await ensureRecipeAgent(
    { videoId: "video-1", requestedByUserId: "user-1" },
    deps,
  );

  assert.equal(session.agentId, "bc-created");
  assert.equal(deps.createdAgents.length, 1);
  assert.deepEqual(deps.sessionUpdates[0], {
    videoId: "video-1",
    cursorAgentId: "bc-created",
    cursorAgentRuntime: "cloud",
    agentWorkspacePath: "agent-recipes/video-1",
    agentStatus: "idle",
  });
});

test("sendRecipeAgentMessage records run, syncs valid artifacts, and marks idle", async () => {
  const deps = createDeps({
    project: {
      ...baseProject,
      cursorAgentId: "bc-existing",
      cursorAgentRuntime: "cloud",
      agentWorkspacePath: "agent-recipes/video-1",
    },
    agentArtifacts: [
      {
        name: "suno-prompt.md",
        path: "agent-recipes/video-1/suno-prompt.md",
        content: "# Suno",
      },
    ],
  });

  const result = await sendRecipeAgentMessage(
    {
      videoId: "video-1",
      requestedByUserId: "user-1",
      stage: "suno_prompt_revision",
      message: "Update Suno prompt.",
    },
    deps,
  );

  assert.equal(result.run.status, "finished");
  assert.equal(result.syncPlan.valid, true);
  assert.deepEqual(deps.createdRuns[0], {
    videoId: "video-1",
    cursorAgentId: "bc-existing",
    stage: "suno_prompt_revision",
    userMessage: "Update Suno prompt.",
    status: "running",
    createdBy: "user-1",
  });
  assert.equal(deps.updatedRuns[0]?.patch.status, "finished");
  assert.equal(deps.syncedArtifactBatches.length, 1);
  assert.equal(deps.sessionUpdates.at(-1)?.agentStatus, "idle");
});

test("sendRecipeAgentMessage sends the first message on the newly created agent", async () => {
  const deps = createDeps({
    project: baseProject,
    agentArtifacts: [
      {
        name: "recipe-analysis.json",
        path: "agent-recipes/video-1/recipe-analysis.json",
        content: "{\"ok\":true}",
      },
    ],
  });

  const result = await sendRecipeAgentMessage(
    {
      videoId: "video-1",
      requestedByUserId: "user-1",
      stage: "recipe_ingest",
      message: "Analyze recipe.",
    },
    deps,
  );

  assert.equal(result.run.status, "finished");
  assert.equal(deps.createdAgents.length, 0);
  assert.equal(deps.sentFirstMessages.length, 1);
  assert.deepEqual(deps.createdRuns[0], {
    videoId: "video-1",
    cursorAgentId: "bc-created",
    stage: "recipe_ingest",
    userMessage: "Analyze recipe.",
    status: "running",
    createdBy: "user-1",
  });
  assert.deepEqual(deps.sessionUpdates[0], {
    videoId: "video-1",
    cursorAgentId: "bc-created",
    cursorAgentRuntime: "cloud",
    agentWorkspacePath: "agent-recipes/video-1",
    agentStatus: "running",
  });
  assert.equal(deps.updatedRuns[0]?.patch.status, "finished");
  assert.equal(deps.sessionUpdates.at(-1)?.agentStatus, "idle");
});

test("sendRecipeAgentMessage recreates stale Cursor agents reported as missing", async () => {
  const staleAgentError = Object.assign(new Error("[agent_not_found] Agent not found"), {
    code: "agent_not_found",
  });
  const deps = createDeps({
    project: {
      ...baseProject,
      cursorAgentId: "bc-stale",
      cursorAgentRuntime: "cloud",
      agentWorkspacePath: "agent-recipes/video-1",
    },
    sendMessageError: staleAgentError,
  });

  const result = await sendRecipeAgentMessage(
    {
      videoId: "video-1",
      requestedByUserId: "user-1",
      stage: "recipe_ingest",
      message: "Analyze recipe.",
    },
    deps,
  );

  assert.equal(result.run.cursorAgentId, "bc-created");
  assert.equal(deps.createdRuns.length, 2);
  assert.deepEqual(deps.createdRuns.map((run) => run.cursorAgentId), [
    "bc-stale",
    "bc-created",
  ]);
  assert.equal(deps.updatedRuns[0]?.patch.status, "error");
  assert.match(deps.updatedRuns[0]?.patch.error ?? "", /agent_not_found/);
  assert.deepEqual(deps.sessionUpdates[1], {
    videoId: "video-1",
    cursorAgentId: null,
    cursorAgentRuntime: null,
    agentWorkspacePath: null,
    agentStatus: "running",
  });
  assert.equal(deps.sentFirstMessages.length, 1);
  assert.equal(deps.updatedRuns.at(-1)?.patch.status, "finished");
});

test("sendRecipeAgentMessage preserves invalid artifacts and marks validation_failed", async () => {
  const deps = createDeps({
    project: {
      ...baseProject,
      cursorAgentId: "bc-existing",
      cursorAgentRuntime: "cloud",
      agentWorkspacePath: "agent-recipes/video-1",
    },
    agentArtifacts: [
      {
        name: "recipe-analysis.json",
        path: "agent-recipes/video-1/recipe-analysis.json",
        content: "{}",
      },
    ],
  });

  const result = await sendRecipeAgentMessage(
    {
      videoId: "video-1",
      requestedByUserId: "user-1",
      stage: "recipe_ingest",
      message: "Analyze recipe.",
    },
    deps,
  );

  assert.equal(result.syncPlan.valid, false);
  assert.equal(deps.sessionUpdates.at(-1)?.agentStatus, "validation_failed");
});

const baseProject: VideoProject = {
  id: "video-1",
  title: "Paris-Brest",
  slug: "paris-brest",
  recipeUrl: null,
  recipeData: null,
  status: "draft",
  storyboard: null,
  seedanceSegments: null,
  selectedVideoModel: "seedance2",
  selectedImageModel: "gpt_image_2",
  selectedTtsModel: "eleven_multilingual_v2",
  selectedSfxModel: "eleven_text_to_sound_v2",
  totalCostCredits: 0,
  totalCostOpenai: 0,
  createdBy: "user-1",
  createdAt: "2026-05-10T00:00:00.000Z",
  updatedAt: "2026-05-10T00:00:00.000Z",
  agentStatus: "idle",
};

function createDeps(input: {
  project: VideoProject;
  agentArtifacts?: Array<{ name: string; path: string; content: string }>;
  sendMessageError?: Error;
}) {
  const createdAgents: unknown[] = [];
  const sessionUpdates: Array<Record<string, unknown>> = [];
  const createdRuns: CreateAgentRunInput[] = [];
  const updatedRuns: Array<{ id: string; patch: UpdateAgentRunInput }> = [];
  const syncedArtifactBatches: unknown[] = [];
  const sentFirstMessages: unknown[] = [];

  const deps: RecipeAgentOrchestrationDependencies & {
    createdAgents: unknown[];
    sessionUpdates: Array<Record<string, unknown>>;
    createdRuns: CreateAgentRunInput[];
    updatedRuns: Array<{ id: string; patch: UpdateAgentRunInput }>;
    syncedArtifactBatches: unknown[];
    sentFirstMessages: unknown[];
  } = {
    createdAgents,
    sessionUpdates,
    createdRuns,
    updatedRuns,
    syncedArtifactBatches,
    sentFirstMessages,
    async getVideoProject() {
      return input.project;
    },
    async updateVideoAgentSession(videoId, patch) {
      sessionUpdates.push({ videoId, ...patch });
      return { ...input.project, ...patch };
    },
    recipeAgentService: {
      async createRecipeAgent(agentInput) {
        createdAgents.push(agentInput);
        return {
          agentId: "bc-created",
          runtime: "cloud",
          workspacePath: "agent-recipes/video-1",
          model: "gpt-5.5",
        };
      },
      async createRecipeAgentAndSendMessage(agentInput) {
        sentFirstMessages.push(agentInput);
        const session = {
          agentId: "bc-created",
          runtime: "cloud" as const,
          workspacePath: "agent-recipes/video-1",
          model: "gpt-5.5",
        };

        await agentInput.onSessionCreated?.(session);

        return {
          session,
          result: {
            agentId: "bc-created",
            runId: "cursor-run-1",
            status: "finished",
            result: "Done",
            durationMs: 100,
            workspacePath: "agent-recipes/video-1",
            artifacts: input.agentArtifacts ?? [],
          },
        };
      },
      async sendMessage() {
        if (input.sendMessageError) {
          throw input.sendMessageError;
        }

        return {
          agentId: "bc-existing",
          runId: "cursor-run-1",
          status: "finished",
          result: "Done",
          durationMs: 100,
          workspacePath: "agent-recipes/video-1",
          artifacts: input.agentArtifacts ?? [],
        };
      },
    },
    async createAgentRun(runInput) {
      createdRuns.push(runInput);
      return {
        id: "agent-run-1",
        videoId: runInput.videoId,
        cursorAgentId: runInput.cursorAgentId,
        cursorRunId: null,
        stage: runInput.stage,
        userMessage: runInput.userMessage,
        status: runInput.status ?? "queued",
        resultSummary: null,
        error: null,
        createdBy: runInput.createdBy,
        startedAt: "2026-05-10T00:00:00.000Z",
        completedAt: null,
        createdAt: "2026-05-10T00:00:00.000Z",
        updatedAt: "2026-05-10T00:00:00.000Z",
      };
    },
    async updateAgentRun(id, patch) {
      updatedRuns.push({ id, patch });
      const latestRunInput = createdRuns.at(-1);

      return {
        id,
        videoId: "video-1",
        cursorAgentId: latestRunInput?.cursorAgentId ?? "bc-existing",
        cursorRunId: patch.cursorRunId ?? null,
        stage: "general",
        userMessage: "Message",
        status: patch.status ?? "finished",
        resultSummary: patch.resultSummary,
        error: patch.error,
        createdBy: "user-1",
        startedAt: "2026-05-10T00:00:00.000Z",
        completedAt: patch.completedAt,
        createdAt: "2026-05-10T00:00:00.000Z",
        updatedAt: "2026-05-10T00:00:00.000Z",
      };
    },
    async syncArtifacts(_supabase, syncInput) {
      syncedArtifactBatches.push(syncInput.artifacts);
      return {
        valid: !syncInput.artifacts.some((artifact) => artifact.content === "{}"),
        artifactRecords: [],
        recipePatch: null,
        logicalScenes: [],
        segments: [],
        references: [],
        sunoPrompt: null,
        errors: [],
      };
    },
  };

  return deps;
}
