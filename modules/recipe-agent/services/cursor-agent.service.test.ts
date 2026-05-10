import assert from "node:assert/strict";
import test from "node:test";

import type { AgentOptions, Run, RunResult, SDKAgent } from "@cursor/sdk";

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
  assert.equal(config.model, "composer-2");
});

test("resolveRecipeAgentConfig carries optional model thinking parameter", () => {
  const config = resolveRecipeAgentConfig({
    CURSOR_API_KEY: "cursor-test",
    CURSOR_AGENT_REPO_URL: "https://github.com/ycoumesgau/recipe2video.git",
    CURSOR_AGENT_MODEL: "gpt-5.5",
    CURSOR_AGENT_MODEL_THINKING: "high",
  });

  assert.equal(config.model, "gpt-5.5");
  assert.equal(config.modelThinking, "high");
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
      modelThinking: "high",
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
    params: [{ id: "thinking", value: "high" }],
  });
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
      modelThinking: "high",
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
    params: [{ id: "thinking", value: "high" }],
  });
  assert.equal(result.runId, "run-1");
  assert.equal(result.status, "finished");
  assert.equal(result.artifacts.length, 1);
  assert.equal(result.artifacts[0]?.content, "{\"ok\":true}");
  assert.match(sdk.resumedAgent.sentMessage ?? "", /Stage: storyboard_revision/);
  assert.equal(sdk.resumedAgent.disposed, true);
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

  constructor(readonly agentId: string) {}

  async send(message: string): Promise<Run> {
    this.sentMessage = message;
    return new FakeRun(this.agentId);
  }

  close(): void {}

  async reload(): Promise<void> {}

  async listArtifacts() {
    return [
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

  constructor(readonly agentId: string) {}

  supports(): boolean {
    return false;
  }

  unsupportedReason(): string | undefined {
    return undefined;
  }

  async *stream() {}

  async conversation() {
    return [];
  }

  async wait(): Promise<RunResult> {
    return {
      id: this.id,
      status: "finished",
      result: "updated",
      durationMs: 10,
    };
  }

  async cancel(): Promise<void> {}

  onDidChangeStatus(): () => void {
    return () => {};
  }
}
