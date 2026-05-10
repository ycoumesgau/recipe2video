import assert from "node:assert/strict";
import test from "node:test";

import type {
  AgentOptions,
  Run,
  RunResult,
  SDKAgent,
  SDKMessage,
} from "@cursor/sdk";

import { resolveRecipeAgentConfig } from "../recipe-agent.config";
import { buildRecipeAgentSystemPrompt } from "../recipe-agent.instructions";
import type { CursorAgentSdkAdapter } from "../recipe-agent.types";
import { buildRecipeAgentWorkspace } from "../recipe-agent.workspace";
import { createCursorRecipeAgentService } from "./cursor-agent.service";

test("resolveRecipeAgentConfig requires Cursor API key", () => {
  assert.throws(
    () =>
      resolveRecipeAgentConfig({
        CURSOR_AGENT_REPO_URL: "https://github.com/ycoumesgau/recipe2video.git",
      }),
    /CURSOR_API_KEY/,
  );
});

test("resolveRecipeAgentConfig requires repo URL for cloud runtime", () => {
  assert.throws(
    () =>
      resolveRecipeAgentConfig({
        CURSOR_API_KEY: "cursor-test",
      }),
    /CURSOR_AGENT_REPO_URL/,
  );
});

test("resolveRecipeAgentConfig supports local dev runtime", () => {
  const config = resolveRecipeAgentConfig({
    CURSOR_API_KEY: "cursor-test",
    CURSOR_AGENT_RUNTIME: "local",
    CURSOR_AGENT_LOCAL_CWD: "/tmp/recipe2video",
  });

  assert.equal(config.runtime, "local");
  assert.equal(config.localCwd, "/tmp/recipe2video");
  assert.equal(config.model, "gpt-5.5");
});

test("resolveRecipeAgentConfig carries optional model reasoning parameter", () => {
  const config = resolveRecipeAgentConfig({
    CURSOR_API_KEY: "cursor-test",
    CURSOR_AGENT_REPO_URL: "https://github.com/ycoumesgau/recipe2video.git",
    CURSOR_AGENT_MODEL: "gpt-5.5",
    CURSOR_AGENT_MODEL_REASONING: "high",
  });

  assert.equal(config.model, "gpt-5.5");
  assert.equal(config.modelReasoning, "high");
});

test("resolveRecipeAgentConfig accepts legacy model thinking env as reasoning", () => {
  const config = resolveRecipeAgentConfig({
    CURSOR_API_KEY: "cursor-test",
    CURSOR_AGENT_REPO_URL: "https://github.com/ycoumesgau/recipe2video.git",
    CURSOR_AGENT_MODEL: "gpt-5.5",
    CURSOR_AGENT_MODEL_THINKING: "high",
  });

  assert.equal(config.modelReasoning, "high");
});

test("buildRecipeAgentWorkspace scopes artifacts under one recipe folder", () => {
  const workspace = buildRecipeAgentWorkspace("Video 123 / Paris-Brest");

  assert.equal(workspace.workspacePath, "agent-recipes/video-123-paris-brest");
  assert.equal(
    workspace.artifactPaths["seedance-segments.json"],
    "agent-recipes/video-123-paris-brest/seedance-segments.json",
  );
});

test("buildRecipeAgentSystemPrompt forbids generation and app code edits", () => {
  const prompt = buildRecipeAgentSystemPrompt({
    videoId: "video-1",
    workspacePath: "agent-recipes/video-1",
  });

  assert.match(prompt, /Do not call Runway/);
  assert.match(prompt, /Do not modify application source code/);
  assert.match(prompt, /reference-plan\.json before any Seedance generation/);
});

test("createRecipeAgent creates a cloud Cursor agent without PR automation", async () => {
  const sdk = new FakeCursorSdkAdapter();
  const service = createCursorRecipeAgentService({
    sdk,
    config: {
      apiKey: "cursor-test",
      runtime: "cloud",
      model: "gpt-5.5",
      modelReasoning: "high",
      repoUrl: "https://github.com/ycoumesgau/recipe2video.git",
      startingRef: "main",
    },
  });

  const session = await service.createRecipeAgent({
    videoId: "video-1",
    title: "Paris-Brest",
  });

  assert.equal(session.agentId, "agent-created");
  assert.equal(session.workspacePath, "agent-recipes/video-1");
  assert.equal(sdk.createdOptions?.cloud?.autoCreatePR, false);
  assert.equal(sdk.createdOptions?.cloud?.skipReviewerRequest, true);
  assert.deepEqual(sdk.createdOptions?.model, {
    id: "gpt-5.5",
    params: [
      { id: "context", value: "272k" },
      { id: "reasoning", value: "high" },
      { id: "fast", value: "false" },
    ],
  });
  assert.equal(sdk.createdAgent.disposed, true);
});

test("createRecipeAgentAndSendMessage sends the first message before disposing", async () => {
  const sdk = new FakeCursorSdkAdapter();
  const createdSessions: unknown[] = [];
  const service = createCursorRecipeAgentService({
    sdk,
    config: {
      apiKey: "cursor-test",
      runtime: "cloud",
      model: "gpt-5.5",
      repoUrl: "https://github.com/ycoumesgau/recipe2video.git",
      startingRef: "main",
    },
  });

  const result = await service.createRecipeAgentAndSendMessage({
    videoId: "video-1",
    title: "Paris-Brest",
    stage: "recipe_ingest",
    message: "Analyze recipe.",
    includeArtifactContents: true,
    onSessionCreated: async (session) => {
      createdSessions.push(session);
    },
  });

  assert.equal(sdk.createdAgent.sentMessage?.includes("Stage: recipe_ingest"), true);
  assert.equal(sdk.resumedAgentId, undefined);
  assert.equal(result.session.agentId, "agent-created");
  assert.equal(result.result.agentId, "agent-created");
  assert.equal(result.result.runId, "run-1");
  assert.equal(result.result.artifacts[0]?.content, "{\"ok\":true}");
  assert.deepEqual(createdSessions, [result.session]);
  assert.equal(sdk.createdAgent.disposed, true);
});

test("sendMessage resumes the same agent and returns recipe artifacts", async () => {
  const sdk = new FakeCursorSdkAdapter();
  const service = createCursorRecipeAgentService({
    sdk,
    config: {
      apiKey: "cursor-test",
      runtime: "cloud",
      model: "gpt-5.5",
      modelReasoning: "high",
      repoUrl: "https://github.com/ycoumesgau/recipe2video.git",
      startingRef: "main",
    },
  });

  const result = await service.sendMessage({
    agentId: "bc-existing",
    videoId: "video-1",
    stage: "storyboard_revision",
    message: "Corrige l'ouverture.",
    includeArtifactContents: true,
  });

  assert.equal(sdk.resumedAgentId, "bc-existing");
  assert.deepEqual(sdk.resumedOptions?.model, {
    id: "gpt-5.5",
    params: [
      { id: "context", value: "272k" },
      { id: "reasoning", value: "high" },
      { id: "fast", value: "false" },
    ],
  });
  assert.equal(result.runId, "run-1");
  assert.equal(result.status, "finished");
  assert.equal(result.artifacts.length, 1);
  assert.equal(result.artifacts[0]?.content, "{\"ok\":true}");
  assert.match(sdk.resumedAgent.sentMessage ?? "", /Stage: storyboard_revision/);
  assert.equal(sdk.resumedAgent.disposed, true);
});

test("sendMessage falls back to conversation file reads when cloud artifacts are empty", async () => {
  const sdk = new FakeCursorSdkAdapter();
  sdk.resumedAgent.artifacts = [];
  sdk.resumedAgent.conversationArtifacts = [
    {
      path: "/workspace/agent-recipes/video-1/decisions.md",
      content: "# Decisions\n\n- Diagnostic artifact test.",
      fileSize: 39,
    },
    {
      path: "/workspace/unrelated.md",
      content: "Ignore me.",
      fileSize: 10,
    },
  ];
  const service = createCursorRecipeAgentService({
    sdk,
    config: {
      apiKey: "cursor-test",
      runtime: "cloud",
      model: "gpt-5.5",
      repoUrl: "https://github.com/ycoumesgau/recipe2video.git",
      startingRef: "main",
    },
  });

  const result = await service.sendMessage({
    agentId: "bc-existing",
    videoId: "video-1",
    stage: "general",
    message: "Write diagnostic files.",
    includeArtifactContents: true,
  });

  assert.deepEqual(result.artifacts, [
    {
      name: "decisions.md",
      path: "agent-recipes/video-1/decisions.md",
      sizeBytes: 39,
      content: "# Decisions\n\n- Diagnostic artifact test.",
      source: "sdk",
    },
  ]);
});

test("sendMessage recovers artifact content from conversation write steps", async () => {
  const sdk = new FakeCursorSdkAdapter();
  sdk.resumedAgent.artifacts = [];
  sdk.resumedAgent.conversationSteps = [
    {
      type: "toolCall",
      message: {
        type: "write",
        args: {
          path: "/workspace/agent-recipes/video-1/recipe-analysis.json",
          content: '{"title":"Recovered from write"}',
        },
        result: {
          status: "success",
          value: {
            fileSize: 32,
          },
        },
      },
    },
  ];
  const service = createCursorRecipeAgentService({
    sdk,
    config: {
      apiKey: "cursor-test",
      runtime: "cloud",
      model: "gpt-5.5",
      repoUrl: "https://github.com/ycoumesgau/recipe2video.git",
      startingRef: "main",
    },
  });

  const result = await service.sendMessage({
    agentId: "bc-existing",
    videoId: "video-1",
    stage: "recipe_ingest",
    message: "Analyze recipe.",
    includeArtifactContents: true,
  });

  assert.deepEqual(result.artifacts, [
    {
      name: "recipe-analysis.json",
      path: "agent-recipes/video-1/recipe-analysis.json",
      sizeBytes: 32,
      content: '{"title":"Recovered from write"}',
      source: "sdk",
    },
  ]);
});

test("sendMessage uses streamed assistant text when wait result is empty", async () => {
  const sdk = new FakeCursorSdkAdapter();
  sdk.resumedAgent.assistantStreamText =
    'Done\n```json\n{"recipe2videoCheckpoint":{"branch":"recipe2video/video-1","commitSha":"abc1234567"}}\n```';
  sdk.resumedAgent.waitResult = undefined;
  const service = createCursorRecipeAgentService({
    sdk,
    config: {
      apiKey: "cursor-test",
      runtime: "cloud",
      model: "gpt-5.5",
      repoUrl: "https://github.com/ycoumesgau/recipe2video.git",
      startingRef: "main",
    },
  });

  const result = await service.sendMessage({
    agentId: "bc-existing",
    videoId: "video-1",
    stage: "general",
    message: "Write checkpoint.",
    includeArtifactContents: true,
  });

  assert.match(result.result ?? "", /recipe2videoCheckpoint/);
  assert.equal(
    result.streamMeta?.assistantText,
    sdk.resumedAgent.assistantStreamText,
  );
});

test("sendMessage uses streamed assistant text when wait result is blank string", async () => {
  const sdk = new FakeCursorSdkAdapter();
  sdk.resumedAgent.assistantStreamText =
    'Done\n```json\n{"recipe2videoCheckpoint":{"branch":"recipe2video/video-1","commitSha":"abc1234567"}}\n```';
  sdk.resumedAgent.waitResult = "   ";
  const service = createCursorRecipeAgentService({
    sdk,
    config: {
      apiKey: "cursor-test",
      runtime: "cloud",
      model: "gpt-5.5",
      repoUrl: "https://github.com/ycoumesgau/recipe2video.git",
      startingRef: "main",
    },
  });

  const result = await service.sendMessage({
    agentId: "bc-existing",
    videoId: "video-1",
    stage: "general",
    message: "Write checkpoint.",
    includeArtifactContents: true,
  });

  assert.match(result.result ?? "", /recipe2videoCheckpoint/);
});

test("createRecipeAgent maps Composer 2 to forced fast mode", async () => {
  const sdk = new FakeCursorSdkAdapter();
  const service = createCursorRecipeAgentService({
    sdk,
    config: {
      apiKey: "cursor-test",
      runtime: "cloud",
      model: "composer-2",
      modelFast: "false",
      repoUrl: "https://github.com/ycoumesgau/recipe2video.git",
      startingRef: "main",
    },
  });

  await service.createRecipeAgent({
    videoId: "video-1",
    title: "Paris-Brest",
  });

  assert.deepEqual(sdk.createdOptions?.model, {
    id: "composer-2",
    params: [{ id: "fast", value: "true" }],
  });
});

class FakeCursorSdkAdapter implements CursorAgentSdkAdapter {
  createdOptions?: AgentOptions;
  resumedOptions?: Partial<AgentOptions>;
  resumedAgentId?: string;
  createdAgent = new FakeSdkAgent("agent-created");
  resumedAgent = new FakeSdkAgent("bc-existing");

  async create(options: AgentOptions): Promise<SDKAgent> {
    this.createdOptions = options;
    return this.createdAgent;
  }

  async resume(agentId: string, options?: Partial<AgentOptions>): Promise<SDKAgent> {
    this.resumedAgentId = agentId;
    this.resumedOptions = options;
    return this.resumedAgent;
  }
}

class FakeSdkAgent implements SDKAgent {
  readonly model = { id: "composer-2" };
  disposed = false;
  sentMessage?: string;
  artifacts = [
    {
      path: "agent-recipes/video-1/recipe-analysis.json",
      sizeBytes: 11,
      updatedAt: "2026-05-10T00:00:00.000Z",
    },
    {
      path: "elsewhere/ignored.json",
      sizeBytes: 2,
      updatedAt: "2026-05-10T00:00:00.000Z",
    },
  ];
  conversationArtifacts: Array<{
    path: string;
    content: string;
    fileSize: number;
  }> = [];
  conversationSteps: Array<Record<string, unknown>> = [];
  assistantStreamText?: string;
  waitResult: string | undefined = "updated";

  constructor(readonly agentId: string) {}

  async send(message: string): Promise<Run> {
    this.sentMessage = message;
    return new FakeRun(
      this.agentId,
      this.conversationArtifacts,
      this.conversationSteps,
      this.assistantStreamText,
      this.waitResult,
    );
  }

  close(): void {}

  async reload(): Promise<void> {}

  async listArtifacts() {
    return this.artifacts;
  }

  async downloadArtifact(path: string): Promise<Buffer> {
    assert.equal(path, "agent-recipes/video-1/recipe-analysis.json");
    return Buffer.from("{\"ok\":true}", "utf8");
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.disposed = true;
  }
}

class FakeRun implements Run {
  readonly id = "run-1";
  readonly status = "finished";

  constructor(
    readonly agentId: string,
    private readonly conversationArtifacts: Array<{
      path: string;
      content: string;
      fileSize: number;
    }>,
    private readonly conversationSteps: Array<Record<string, unknown>>,
    private readonly assistantStreamText: string | undefined,
    private readonly waitResult: string | undefined,
  ) {}

  supports(operation?: string): boolean {
    return (
      (operation === "conversation" &&
        (this.conversationArtifacts.length > 0 ||
          this.conversationSteps.length > 0)) ||
      (operation === "stream" && this.assistantStreamText !== undefined)
    );
  }

  unsupportedReason(): string | undefined {
    return undefined;
  }

  async *stream() {
    if (!this.assistantStreamText) {
      return;
    }

    for (const text of ["Done\n", this.assistantStreamText.slice(5)]) {
      yield {
        type: "assistant",
        message: {
          content: [{ type: "text", text }],
        },
      } as unknown as SDKMessage;
    }
  }

  async conversation() {
    if (this.conversationSteps.length > 0) {
      return [
        {
          type: "agentConversationTurn",
          turn: {
            steps: this.conversationSteps,
          },
        },
      ] as unknown as Awaited<ReturnType<Run["conversation"]>>;
    }

    return [
      {
        type: "agentConversationTurn",
        turn: {
          steps: this.conversationArtifacts.map((artifact) => ({
            type: "toolCall",
            message: {
              type: "read",
              args: {
                path: artifact.path,
              },
              result: {
                status: "success",
                value: {
                  content: artifact.content,
                  fileSize: artifact.fileSize,
                },
              },
            },
          })),
        },
      },
    ] as unknown as Awaited<ReturnType<Run["conversation"]>>;
  }

  async wait(): Promise<RunResult> {
    return {
      id: this.id,
      status: "finished",
      result: this.waitResult,
      durationMs: 10,
    };
  }

  async cancel(): Promise<void> {}

  onDidChangeStatus(): () => void {
    return () => {};
  }
}
