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

test("ensureRecipeAgent prefers project-scoped service when provided", async () => {
  const deps = createDeps({ project: baseProject });
  let factoryCalls = 0;
  deps.getRecipeAgentService = (project) => {
    factoryCalls += 1;
    assert.equal(project.id, "video-1");
    return {
      async createRecipeAgent() {
        return {
          agentId: "bc-scoped",
          runtime: "cloud",
          workspacePath: "agent-recipes/video-1",
          model: "composer-2",
        };
      },
      async createRecipeAgentAndSendMessage() {
        throw new Error("not used");
      },
      async sendMessage() {
        throw new Error("not used");
      },
    };
  };

  const session = await ensureRecipeAgent(
    { videoId: "video-1", requestedByUserId: "user-1" },
    deps,
  );

  assert.equal(factoryCalls, 1);
  assert.equal(session.agentId, "bc-scoped");
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
  assert.equal(deps.streamEvents.length, 1);
  assert.equal(deps.streamEvents[0]?.agentRunId, "agent-run-1");
});

test("sendRecipeAgentMessage sends the first message on the newly created agent", async () => {
  const deps = createDeps({
    project: baseProject,
    agentArtifacts: [
      {
        name: "recipe-analysis.json",
        path: "agent-recipes/video-1/recipe-analysis.json",
        content: "{\"ok\":true}",
        source: "github",
      },
    ],
    resultText:
      'Done\n```json\n{"recipe2videoCheckpoint":{"branch":"recipe2video/video-1","commitSha":"abc1234567"}}\n```',
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
  assert.equal(deps.statusUpdates.at(-1)?.status, "recipe_ingested");
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
    agentArtifacts: [
      {
        name: "recipe-analysis.json",
        path: "agent-recipes/video-1/recipe-analysis.json",
        content: "{\"ok\":true}",
        source: "github",
      },
    ],
    resultText:
      'Done\n```json\n{"recipe2videoCheckpoint":{"branch":"recipe2video/video-1","commitSha":"abc1234567"}}\n```',
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
  assert.equal(deps.statusUpdates.at(-1)?.status, "recipe_ingested");
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
        source: "github",
      },
    ],
    resultText:
      'Done\n```json\n{"recipe2videoCheckpoint":{"branch":"recipe2video/video-1","commitSha":"abc1234567"}}\n```',
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

test("sendRecipeAgentMessage fails recipe ingest when analysis artifact is missing", async () => {
  const deps = createDeps({
    project: {
      ...baseProject,
      cursorAgentId: "bc-existing",
      cursorAgentRuntime: "cloud",
      agentWorkspacePath: "agent-recipes/video-1",
    },
    agentArtifacts: [],
    resultText:
      'Done\n```json\n{"recipe2videoCheckpoint":{"branch":"recipe2video/video-1","commitSha":"abc1234567"}}\n```',
  });

  await assert.rejects(
    () =>
      sendRecipeAgentMessage(
        {
          videoId: "video-1",
          requestedByUserId: "user-1",
          stage: "recipe_ingest",
          message: "Analyze recipe.",
        },
        deps,
      ),
    /recipe-analysis\.json/,
  );

  assert.equal(deps.updatedRuns.at(-1)?.patch.status, "error");
  assert.equal(deps.sessionUpdates.at(-1)?.agentStatus, "failed");
});

test("sendRecipeAgentMessage fails recipe ingest without assistant checkpoint", async () => {
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
        content: "{\"ok\":true}",
        source: "github",
      },
    ],
    resultText: "Done",
  });

  await assert.rejects(
    () =>
      sendRecipeAgentMessage(
        {
          videoId: "video-1",
          requestedByUserId: "user-1",
          stage: "recipe_ingest",
          message: "Analyze recipe.",
        },
        deps,
      ),
    /requires a Git checkpoint/i,
  );
});

test("sendRecipeAgentMessage prefers GitHub artifact contents at the checkpoint SHA", async () => {
  const restore = installRecipeAgentEnv();
  const originalFetch = globalThis.fetch;
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
        content: "{\"truncated\":",
      },
    ],
    resultText:
      'Done\n```json\n{"recipe2videoCheckpoint":{"branch":"recipe2video/video-1","commitSha":"abc1234567","manifestPath":"agent-recipes/video-1/checkpoint-manifest.json"}}\n```',
  });

  globalThis.fetch = (async (url) => {
    const href = String(url);

    if (href.includes("checkpoint-manifest.json")) {
      return jsonFileResponse({
        branch: "recipe2video/video-1",
        commitSha: "abc1234567",
        artifactPaths: ["agent-recipes/video-1/recipe-analysis.json"],
      });
    }

    if (href.includes("recipe-analysis.json")) {
      return textFileResponse("{\"title\":\"GitHub version\"}");
    }

    return new Response(null, { status: 404 });
  }) as typeof fetch;

  try {
    await sendRecipeAgentMessage(
      {
        videoId: "video-1",
        requestedByUserId: "user-1",
        stage: "recipe_ingest",
        message: "Analyze recipe.",
      },
      deps,
    );
  } finally {
    globalThis.fetch = originalFetch;
    restore();
  }

  const synced = deps.syncedArtifactBatches[0] as Array<{ name: string; content?: string }>;
  const recipeAnalysis = synced.find((artifact) => artifact.name === "recipe-analysis.json");

  assert.equal(recipeAnalysis?.content, "{\"title\":\"GitHub version\"}");
  assert.equal(deps.updatedRuns.at(-1)?.patch.agentGitCommitSha, "abc1234567");
  assert.equal(deps.sessionUpdates.at(-1)?.agentGitBranch, "recipe2video/video-1");
});

test("sendRecipeAgentMessage rejects SDK JSON fallback when GitHub sync fails", async () => {
  const restore = installRecipeAgentEnv();
  const originalFetch = globalThis.fetch;
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
        content: "{\"title\":\"SDK version\"}",
        source: "sdk",
      },
    ],
    resultText:
      'Done\n```json\n{"recipe2videoCheckpoint":{"branch":"recipe2video/video-1","commitSha":"abc1234567","manifestPath":"agent-recipes/video-1/checkpoint-manifest.json"}}\n```',
  });

  globalThis.fetch = (async () =>
    new Response("rate limited", { status: 429 })) as typeof fetch;

  try {
    await assert.rejects(
      () =>
        sendRecipeAgentMessage(
          {
            videoId: "video-1",
            requestedByUserId: "user-1",
            stage: "recipe_ingest",
            message: "Analyze recipe.",
          },
          deps,
        ),
      /recipe-analysis\.json/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
    restore();
  }
  assert.equal(deps.updatedRuns.at(-1)?.patch.status, "error");
  assert.equal(deps.sessionUpdates.at(-1)?.agentStatus, "failed");
});

test("sendRecipeAgentMessage keeps SDK markdown fallback on general stage", async () => {
  const restore = installRecipeAgentEnv();
  const originalFetch = globalThis.fetch;
  const deps = createDeps({
    project: {
      ...baseProject,
      cursorAgentId: "bc-existing",
      cursorAgentRuntime: "cloud",
      agentWorkspacePath: "agent-recipes/video-1",
    },
    agentArtifacts: [
      {
        name: "decisions.md",
        path: "agent-recipes/video-1/decisions.md",
        content: "# Decisions\n\n- SDK fallback.",
        source: "sdk",
      },
    ],
    resultText:
      'Done\n```json\n{"recipe2videoCheckpoint":{"branch":"recipe2video/video-1","commitSha":"abc1234567","manifestPath":"agent-recipes/video-1/checkpoint-manifest.json"}}\n```',
  });

  globalThis.fetch = (async () =>
    new Response("rate limited", { status: 429 })) as typeof fetch;

  try {
    await sendRecipeAgentMessage(
      {
        videoId: "video-1",
        requestedByUserId: "user-1",
        stage: "general",
        message: "Update decisions.",
      },
      deps,
    );
  } finally {
    globalThis.fetch = originalFetch;
    restore();
  }

  const synced = deps.syncedArtifactBatches[0] as Array<{ name: string; content?: string }>;
  const decisions = synced.find((artifact) => artifact.name === "decisions.md");

  assert.equal(decisions?.content, "# Decisions\n\n- SDK fallback.");
  assert.equal(deps.updatedRuns.at(-1)?.patch.status, "finished");
});

test("sendRecipeAgentMessage recovers artifacts from the branch head when manifest SHA is stale", async () => {
  const restore = installRecipeAgentEnv();
  const originalFetch = globalThis.fetch;
  const branchHeadSha = "def7654321";
  const staleSha = "abc1234567";
  const deps = createDeps({
    project: {
      ...baseProject,
      cursorAgentId: "bc-existing",
      cursorAgentRuntime: "cloud",
      agentWorkspacePath: "agent-recipes/video-1",
    },
    agentArtifacts: [],
    resultText:
      'Done\n```json\n{"recipe2videoCheckpoint":{"branch":"cursor/checkpoint-test","commitSha":"abc1234567","workspace":"agent-recipes/video-1","status":"completed"}}\n```',
  });

  globalThis.fetch = (async (url) => {
    const href = String(url);

    if (href.includes("/git/ref/heads/cursor/checkpoint-test")) {
      return Response.json({ object: { sha: branchHeadSha } });
    }

    if (href.includes("checkpoint-manifest.json") && href.includes(staleSha)) {
      return new Response(null, { status: 404 });
    }

    if (href.includes("checkpoint-manifest.json") && href.includes(branchHeadSha)) {
      return jsonFileResponse({
        workspace: "agent-recipes/video-1",
        branch: "cursor/checkpoint-test",
        commitSha: staleSha,
        manifestPath: "agent-recipes/video-1/checkpoint-manifest.json",
        artifactPaths: ["agent-recipes/video-1/decisions.md"],
      });
    }

    if (href.includes("decisions.md") && href.includes(branchHeadSha)) {
      return textFileResponse("# Decisions\n\n- GitHub branch head version.");
    }

    return new Response(null, { status: 404 });
  }) as typeof fetch;

  try {
    await sendRecipeAgentMessage(
      {
        videoId: "video-1",
        requestedByUserId: "user-1",
        stage: "general",
        message: "Write checkpoint.",
      },
      deps,
    );
  } finally {
    globalThis.fetch = originalFetch;
    restore();
  }

  const synced = deps.syncedArtifactBatches[0] as Array<{ name: string; content?: string }>;
  const decisions = synced.find((artifact) => artifact.name === "decisions.md");

  assert.equal(decisions?.content, "# Decisions\n\n- GitHub branch head version.");
  assert.equal(deps.updatedRuns.at(-1)?.patch.agentGitCommitSha, branchHeadSha);
  assert.equal(deps.sessionUpdates.at(-1)?.agentGitBranch, "cursor/checkpoint-test");
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
  agentArtifacts?: Array<{
    name: string;
    path: string;
    content: string;
    source?: "sdk" | "github";
  }>;
  resultText?: string;
  sendMessageError?: Error;
}) {
  const createdAgents: unknown[] = [];
  const sessionUpdates: Array<Record<string, unknown>> = [];
  const createdRuns: CreateAgentRunInput[] = [];
  const updatedRuns: Array<{ id: string; patch: UpdateAgentRunInput }> = [];
  const syncedArtifactBatches: unknown[] = [];
  const sentFirstMessages: unknown[] = [];
  const statusUpdates: Array<{ videoId: string; status: string }> = [];

  const streamEvents: Array<{
    agentRunId: string;
    seq: number;
    eventType: string;
    payload: Record<string, unknown>;
  }> = [];

  const deps: RecipeAgentOrchestrationDependencies & {
    createdAgents: unknown[];
    sessionUpdates: Array<Record<string, unknown>>;
    createdRuns: CreateAgentRunInput[];
    updatedRuns: Array<{ id: string; patch: UpdateAgentRunInput }>;
    syncedArtifactBatches: unknown[];
    sentFirstMessages: unknown[];
    statusUpdates: typeof statusUpdates;
    streamEvents: typeof streamEvents;
  } = {
    createdAgents,
    sessionUpdates,
    createdRuns,
    updatedRuns,
    syncedArtifactBatches,
    sentFirstMessages,
    statusUpdates,
    streamEvents,
    persistAgentRunStreamEvent: async (event) => {
      streamEvents.push(event);
    },
    async getVideoProject() {
      return input.project;
    },
    async updateVideoAgentSession(videoId, patch) {
      sessionUpdates.push({ videoId, ...patch });
      return { ...input.project, ...patch };
    },
    async updateVideoStatus(videoId, status) {
      statusUpdates.push({ videoId, status });
      return { ...input.project, status };
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

        await agentInput.onStreamEvent?.({
          seq: 0,
          eventType: "status",
          payload: { ok: true },
        });

        return {
          session,
          result: {
            agentId: "bc-created",
            runId: "cursor-run-1",
            status: "finished",
            result: input.resultText ?? "Done",
            durationMs: 100,
            workspacePath: "agent-recipes/video-1",
            artifacts: input.agentArtifacts ?? [],
          },
        };
      },
      async sendMessage(opts) {
        if (input.sendMessageError) {
          throw input.sendMessageError;
        }

        await opts.onStreamEvent?.({
          seq: 0,
          eventType: "status",
          payload: { ok: true },
        });

        return {
          agentId: "bc-existing",
          runId: "cursor-run-1",
          status: "finished",
          result: input.resultText ?? "Done",
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
        agentGitBranch: null,
        agentGitCommitSha: null,
        needsUserInput: false,
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
        agentGitBranch: patch.agentGitBranch ?? null,
        agentGitCommitSha: patch.agentGitCommitSha ?? null,
        needsUserInput: patch.needsUserInput ?? false,
      };
    },
    async syncArtifacts(_supabase, syncInput) {
      syncedArtifactBatches.push(syncInput.artifacts);
      const artifactRecords = syncInput.artifacts.map((artifact) => ({
        artifactName: String(artifact.name),
        videoId: "video-1",
        artifactPath: artifact.path,
        content: artifact.content ?? "",
        contentHash: null,
        validationStatus: "valid" as const,
        validationErrors: [],
      }));
      const hasRecipeAnalysis = artifactRecords.some(
        (artifact) => artifact.artifactName === "recipe-analysis.json",
      );
      const hasLogicalScenes = artifactRecords.some(
        (artifact) => artifact.artifactName === "logical-scenes.json",
      );
      const hasSeedanceSegments = artifactRecords.some(
        (artifact) => artifact.artifactName === "seedance-segments.json",
      );
      const isInvalid = syncInput.artifacts.some((artifact) => artifact.content === "{}");
      return {
        valid: !isInvalid,
        artifactRecords,
        recipePatch: hasRecipeAnalysis
          ? {
              normalized: {} as never,
              clarifyingQuestions: [] as never,
              agentSyncedAt: "2026-05-10T00:00:00.000Z",
            }
          : null,
        logicalScenes: hasLogicalScenes ? [{}] : [],
        segments: hasSeedanceSegments ? [{}] : [],
        references: [],
        sunoPrompt: null,
        errors: [],
      } as never;
    },
  };

  return deps;
}

function installRecipeAgentEnv() {
  const previous = {
    CURSOR_API_KEY: process.env.CURSOR_API_KEY,
    CURSOR_AGENT_REPO_URL: process.env.CURSOR_AGENT_REPO_URL,
    RECIPE_AGENT_GITHUB_TOKEN: process.env.RECIPE_AGENT_GITHUB_TOKEN,
  };

  process.env.CURSOR_API_KEY = "cursor-key";
  process.env.CURSOR_AGENT_REPO_URL = "https://github.com/acme/recipe2video-agent-workspace.git";
  process.env.RECIPE_AGENT_GITHUB_TOKEN = "github-token";

  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

function jsonFileResponse(value: unknown) {
  return textFileResponse(JSON.stringify(value));
}

function textFileResponse(value: string) {
  return Response.json({
    type: "file",
    encoding: "base64",
    content: Buffer.from(value, "utf8").toString("base64"),
  });
}
