import assert from "node:assert/strict";
import test from "node:test";

import type { VideoProject } from "@/modules/videos/video.types";

import type {
  AgentConversation,
  AgentRun,
  CreateAgentRunInput,
  RecipeAgentRunStatus,
  UpdateAgentRunInput,
} from "../recipe-agent.types";
import type { RecipeAgentOrchestrationDependencies } from "./orchestrate-recipe-agent";
import {
  cancelRecipeAgentRunWorkflow,
  pollRecipeAgentRunWorkflow,
  reconcileStaleRecipeAgentRunsWorkflow,
  shouldUsePollingOrchestration,
  startRecipeAgentRunWorkflow,
  type RecipeAgentPollingWorkflowEvent,
} from "./orchestrate-recipe-agent-polling";

const baseProject: VideoProject = {
  id: "video-1",
  title: "Test recipe",
  status: "draft",
  sourceType: "text",
  recipeUrl: null,
  recipeText: "Mix flour",
  photoDescriptions: null,
  targetDurationSeconds: 60,
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
  ownerId: "user-1",
  cursorAgentId: "bc-existing",
  cursorAgentRuntime: "cloud",
  agentWorkspacePath: "agent-recipes/video-1",
  agentStatus: "idle",
  agentGitBranch: "recipe2video/video-1",
  agentGitCommitSha: null,
  lastAgentRunId: null,
  lastAgentSyncAt: null,
};

const baseConversation: AgentConversation = {
  id: "conv-1",
  videoId: "video-1",
  name: "Main",
  slug: "main",
  isActive: true,
  includeAssetsManifest: false,
  cursorAgentId: "bc-existing",
  cursorAgentRuntime: "cloud",
  cursorAgentModel: "gpt-5.5",
  cursorAgentReasoning: null,
  cursorAgentFast: false,
  agentWorkspacePath: "agent-recipes/video-1",
  agentGitBranch: "recipe2video/video-1",
  agentGitCommitSha: null,
  agentStatus: "idle",
  lastAgentRunId: null,
  lastAgentSyncAt: null,
  complementaryInstructions: null,
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
  deletedAt: null,
};

test("shouldUsePollingOrchestration is true only for cloud polling mode", () => {
  assert.equal(
    shouldUsePollingOrchestration({
      runtime: "cloud",
      pollingMode: "polling",
    } as never),
    true,
  );
  assert.equal(
    shouldUsePollingOrchestration({
      runtime: "cloud",
      pollingMode: "blocking",
    } as never),
    false,
  );
  assert.equal(
    shouldUsePollingOrchestration({
      runtime: "local",
      pollingMode: "polling",
    } as never),
    false,
  );
});

test("startRecipeAgentRunWorkflow skips when conversation already has active run", async () => {
  const deps = createPollingDeps({
    hasActiveRun: true,
  });

  const result = await startRecipeAgentRunWorkflow(
    {
      supabase: {} as never,
      videoId: "video-1",
      conversationId: "conv-1",
      requestedByUserId: "user-1",
      stage: "general",
      message: "Please analyze the recipe in detail.",
    },
    deps,
  );

  assert.deepEqual(result, { alreadyActive: true });
  assert.equal(deps.sentEvents.length, 0);
});

test("startRecipeAgentRunWorkflow emits poll event after Cursor send", async () => {
  const deps = createPollingDeps({});

  const result = await startRecipeAgentRunWorkflow(
    {
      supabase: {} as never,
      videoId: "video-1",
      conversationId: "conv-1",
      requestedByUserId: "user-1",
      stage: "general",
      message: "Please analyze the recipe in detail.",
    },
    deps,
  );

  assert.equal(result.alreadyActive, undefined);
  assert.equal(result.agentRunId, "run-db-1");
  assert.equal(deps.sentEvents.length, 1);
  assert.equal(deps.sentEvents[0]?.name, "recipe.agent.run.poll.requested");
  assert.equal(deps.sentEvents[0]?.data.cursorRunId, "cursor-run-1");
  assert.equal(deps.updatedRuns.some((patch) => patch.status === "running"), true);
  assert.equal(
    deps.updatedRuns.some((patch) => patch.cursorRunStartedAt === "2026-05-10T00:00:00.000Z"),
    true,
  );
});

function recentPollStartedAt() {
  return new Date(Date.now() - 60_000).toISOString();
}

test("pollRecipeAgentRunWorkflow re-emits poll while Cursor run is running", async () => {
  const deps = createPollingDeps({});
  const agentRun = createAgentRunRecord({ status: "running", pollCount: 3 });

  const result = await pollRecipeAgentRunWorkflow(
    {
      agentRunId: agentRun.id,
      videoId: "video-1",
      conversationId: "conv-1",
      cursorAgentId: "bc-existing",
      cursorRunId: "cursor-run-1",
      stage: "general",
      pollStartedAt: recentPollStartedAt(),
      requestedByUserId: "user-1",
    },
    {
      ...deps,
      config: { streamSliceEnabled: false } as never,
      recipeAgentService: {
        pollRun: async () => ({
          status: "running",
          needsUserInput: false,
          cursorStreamLastSeq: 1,
          cursorAssistantTextLength: 10,
        }),
        cancelRun: async () => {},
      } as never,
      getAgentRunById: async () => agentRun,
    },
  );

  assert.equal(result.terminal, false);
  assert.equal(deps.sentEvents.length, 1);
  assert.equal(deps.sentEvents[0]?.name, "recipe.agent.run.poll.requested");
  assert.equal(deps.updatedRuns[0]?.pollCount, 4);
});

test("pollRecipeAgentRunWorkflow emits finalize on terminal Cursor status", async () => {
  const deps = createPollingDeps({});
  const agentRun = createAgentRunRecord({ status: "running" });

  const result = await pollRecipeAgentRunWorkflow(
    {
      agentRunId: agentRun.id,
      videoId: "video-1",
      conversationId: "conv-1",
      cursorAgentId: "bc-existing",
      cursorRunId: "cursor-run-1",
      stage: "general",
      pollStartedAt: recentPollStartedAt(),
      requestedByUserId: "user-1",
    },
    {
      ...deps,
      config: { streamSliceEnabled: false } as never,
      recipeAgentService: {
        pollRun: async () => ({
          status: "finished",
          needsUserInput: false,
          cursorStreamLastSeq: 2,
          cursorAssistantTextLength: 20,
        }),
        cancelRun: async () => {},
      } as never,
      getAgentRunById: async () => agentRun,
    },
  );

  assert.equal(result.terminal, true);
  assert.equal(deps.sentEvents[0]?.name, "recipe.agent.run.finalize.requested");
  assert.equal(deps.sentEvents[0]?.data.terminalStatus, "finished");
});

test("pollRecipeAgentRunWorkflow times out when wall-clock budget exceeded", async () => {
  const deps = createPollingDeps({});
  const agentRun = createAgentRunRecord({ status: "running" });
  let cancelled = false;

  const result = await pollRecipeAgentRunWorkflow(
    {
      agentRunId: agentRun.id,
      videoId: "video-1",
      conversationId: "conv-1",
      cursorAgentId: "bc-existing",
      cursorRunId: "cursor-run-1",
      stage: "recipe_ingest",
      pollStartedAt: "2026-05-10T00:00:00.000Z",
      requestedByUserId: "user-1",
    },
    {
      ...deps,
      now: () => "2026-05-10T00:31:00.000Z",
      config: { streamSliceEnabled: false } as never,
      recipeAgentService: {
        pollRun: async () => {
          throw new Error("pollRun should not run after timeout");
        },
        cancelRun: async () => {
          cancelled = true;
        },
      } as never,
      getAgentRunById: async () => agentRun,
    },
  );

  assert.equal(result.terminal, true);
  assert.equal(result.status, "timed_out");
  assert.equal(cancelled, true);
  assert.equal(deps.sentEvents[0]?.data.terminalStatus, "timed_out");
});

test("cancelRecipeAgentRunWorkflow marks run and calls Cursor cancel", async () => {
  const deps = createPollingDeps({});
  let cancelCalled = false;
  const agentRun = createAgentRunRecord({
    status: "running",
    cursorRunId: "cursor-run-1",
  });

  await cancelRecipeAgentRunWorkflow(
    { agentRunId: agentRun.id, videoId: "video-1" },
    {
      ...deps,
      getAgentRunById: async () => agentRun,
      recipeAgentService: {
        cancelRun: async () => {
          cancelCalled = true;
        },
      } as never,
    },
  );

  assert.equal(cancelCalled, true);
  assert.equal(deps.updatedRuns[0]?.cancelRequested, true);
});

test("reconcileStaleRecipeAgentRunsWorkflow re-emits poll for stale runs", async () => {
  const deps = createPollingDeps({});
  const staleRun = createAgentRunRecord({
    status: "running",
    agentConversationId: "conv-1",
    cursorRunStartedAt: "2026-05-10T00:00:00.000Z",
  });

  const result = await reconcileStaleRecipeAgentRunsWorkflow({
    ...deps,
    supabase: {} as never,
    listStaleActiveAgentRuns: async () => [staleRun],
  });

  assert.equal(result.reconciledCount, 1);
  assert.equal(deps.sentEvents[0]?.name, "recipe.agent.run.poll.requested");
});

function createAgentRunRecord(
  overrides: Partial<AgentRun> = {},
): AgentRun {
  return {
    id: "run-db-1",
    videoId: "video-1",
    agentConversationId: "conv-1",
    cursorAgentId: "bc-existing",
    cursorRunId: "cursor-run-1",
    stage: "general",
    userMessage: "hello",
    status: "running",
    resultSummary: null,
    error: null,
    createdBy: "user-1",
    startedAt: "2026-05-10T00:00:00.000Z",
    completedAt: null,
    agentGitBranch: null,
    agentGitCommitSha: null,
    needsUserInput: false,
    userChatMessageId: null,
    assistantChatMessageId: "assistant-1",
    cursorRunStartedAt: "2026-05-10T00:00:00.000Z",
    cursorStreamLastSeq: 0,
    cursorStreamLastEventSignature: null,
    cursorAssistantTextLength: 0,
    lastPolledAt: null,
    pollCount: 0,
    cancelRequested: false,
    ...overrides,
  };
}

function createPollingDeps(options: { hasActiveRun?: boolean }) {
  const sentEvents: RecipeAgentPollingWorkflowEvent[] = [];
  const createdRuns: AgentRun[] = [];
  const updatedRuns: UpdateAgentRunInput[] = [];

  const deps: RecipeAgentOrchestrationDependencies & {
    supabase: unknown;
    hasActiveAgentRunForConversation: (conversationId: string) => Promise<boolean>;
    getAgentRunById: (agentRunId: string) => Promise<AgentRun | null>;
    sendEvent: (event: RecipeAgentPollingWorkflowEvent) => Promise<void>;
    now: () => string;
    sentEvents: RecipeAgentPollingWorkflowEvent[];
    createdRuns: AgentRun[];
    updatedRuns: UpdateAgentRunInput[];
  } = {
    supabase: {},
    sentEvents,
    createdRuns,
    updatedRuns,
    getVideoProject: async () => baseProject,
    updateVideoAgentSession: async (videoId, patch) => ({
      ...baseProject,
      ...patch,
      id: videoId,
    }),
    updateVideoStatus: async (videoId, status) => ({
      ...baseProject,
      id: videoId,
      status,
    }),
    recipeAgentService: {
      startMessage: async () => ({
        agentId: "bc-existing",
        runId: "cursor-run-1",
        cursorRunStartedAt: "2026-05-10T00:00:00.000Z",
      }),
      startMessageWithNewAgent: async () => ({
        session: {
          agentId: "bc-created",
          runtime: "cloud",
          workspacePath: "agent-recipes/video-1",
        },
        runId: "cursor-run-1",
        cursorRunStartedAt: "2026-05-10T00:00:00.000Z",
      }),
    } as never,
    createAgentRun: async (input: CreateAgentRunInput) => {
      const run = createAgentRunRecord({
        status: (input.status ?? "queued") as RecipeAgentRunStatus,
        stage: input.stage,
        userMessage: input.userMessage,
        cursorRunId: input.cursorRunId ?? null,
        cursorRunStartedAt: input.cursorRunStartedAt ?? null,
      });
      createdRuns.push(run);
      return run;
    },
    updateAgentRun: async (_id, patch) => {
      updatedRuns.push(patch);
      return createAgentRunRecord({
        ...patch,
        status: (patch.status ?? "running") as RecipeAgentRunStatus,
        pollCount: patch.pollCount ?? 0,
        cancelRequested: patch.cancelRequested ?? false,
      });
    },
    syncArtifacts: async () => ({
      valid: true,
      artifactRecords: [],
      errors: [],
    }),
    hasActiveAgentRunForConversation: async () => options.hasActiveRun ?? false,
    getAgentConversation: async () => baseConversation,
    buildCursorImages: async () => [],
    seedRecipeAgentChatTurnHook: async () => ({
      userMessageId: "user-msg-1",
      assistantMessageId: "assistant-1",
    }),
    updateAgentConversationRecord: async (_id, patch) => ({
      ...baseConversation,
      ...patch,
    }),
    mirrorAgentConversationToVideo: async () => {},
    getAgentRunById: async () => createAgentRunRecord(),
    sendEvent: async (event) => {
      sentEvents.push(event);
    },
    now: () => "2026-05-10T00:00:10.000Z",
  };

  return deps;
}
