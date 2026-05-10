import type { AgentOptions, ModelSelection, Run, SDKAgent } from "@cursor/sdk";

import { resolveRecipeAgentConfig } from "../recipe-agent.config";
import {
  buildRecipeAgentSystemPrompt,
  buildRecipeAgentUserMessage,
} from "../recipe-agent.instructions";
import type {
  CreateRecipeAgentInput,
  CursorAgentSdkAdapter,
  RecipeAgentArtifact,
  RecipeAgentConfig,
  RecipeAgentRunResult,
  RecipeAgentRunStreamMeta,
  RecipeAgentSession,
  SendRecipeAgentMessageInput,
} from "../recipe-agent.types";
import { summarizeCursorStreamEvent } from "./cursor-agent-stream";
import {
  buildRecipeAgentWorkspace,
  getRecipeAgentArtifactName,
} from "../recipe-agent.workspace";

interface CreateCursorRecipeAgentServiceOptions {
  config?: RecipeAgentConfig;
  sdk: CursorAgentSdkAdapter;
}

export interface CursorRecipeAgentService {
  createRecipeAgent(input: CreateRecipeAgentInput): Promise<RecipeAgentSession>;
  createRecipeAgentAndSendMessage(
    input: CreateRecipeAgentInput &
      Omit<SendRecipeAgentMessageInput, "agentId"> & {
        onSessionCreated?: (session: RecipeAgentSession) => Promise<void>;
      },
  ): Promise<{
    session: RecipeAgentSession;
    result: RecipeAgentRunResult;
  }>;
  sendMessage(input: SendRecipeAgentMessageInput): Promise<RecipeAgentRunResult>;
}

export function createCursorRecipeAgentService(
  options: CreateCursorRecipeAgentServiceOptions,
): CursorRecipeAgentService {
  const config = options.config ?? resolveRecipeAgentConfig();

  return {
    async createRecipeAgent(input) {
      const workspace = buildRecipeAgentWorkspace(input.videoId);
      const agent = await options.sdk.create(
        buildAgentOptions({
          config,
          name: buildAgentName(input),
          workspacePath: workspace.workspacePath,
          videoId: input.videoId,
        }),
      );

      try {
        return {
          agentId: agent.agentId,
          runtime: config.runtime,
          workspacePath: workspace.workspacePath,
          model: config.model,
        };
      } finally {
        await disposeAgent(agent);
      }
    },

    async createRecipeAgentAndSendMessage(input) {
      const workspace = buildRecipeAgentWorkspace(input.videoId);
      const agent = await options.sdk.create(
        buildAgentOptions({
          config,
          name: buildAgentName(input),
          workspacePath: workspace.workspacePath,
          videoId: input.videoId,
        }),
      );
      const session = {
        agentId: agent.agentId,
        runtime: config.runtime,
        workspacePath: workspace.workspacePath,
        model: config.model,
      };

      try {
        await input.onSessionCreated?.(session);

        return {
          session,
          result: await sendMessageWithAgent({
            agent,
            agentId: session.agentId,
            videoId: input.videoId,
            stage: input.stage,
            message: input.message,
            includeArtifactContents: input.includeArtifactContents,
            workspacePath: workspace.workspacePath,
            onStreamEvent: input.onStreamEvent,
          }),
        };
      } finally {
        await disposeAgent(agent);
      }
    },

    async sendMessage(input) {
      const workspace = buildRecipeAgentWorkspace(input.videoId);
      const agent = await options.sdk.resume(
        input.agentId,
        buildResumeOptions(config),
      );

      try {
        return await sendMessageWithAgent({
          agent,
          agentId: input.agentId,
          videoId: input.videoId,
          stage: input.stage,
          message: input.message,
          includeArtifactContents: input.includeArtifactContents,
          workspacePath: workspace.workspacePath,
          onStreamEvent: input.onStreamEvent,
        });
      } finally {
        await disposeAgent(agent);
      }
    },
  };
}

function buildAgentOptions(input: {
  config: RecipeAgentConfig;
  name: string;
  workspacePath: string;
  videoId: string;
}): AgentOptions {
  const base = {
    apiKey: input.config.apiKey,
    model: buildModelSelection(input.config),
    name: input.name,
    agents: {
      "recipe-scene-verifier": {
        description:
          "Reviews Recipe2Video storyboard and Seedance segment artifacts for creative quality, food physics, reference discipline, and generation risk.",
        prompt:
          "Act as a skeptical food video production reviewer. Check hook quality, texture cadence, Seedance reference readiness, visible hands, fragile geometry, and Suno/video separation.",
        model: "inherit" as const,
      },
    },
  } satisfies AgentOptions;

  const systemPrompt = buildRecipeAgentSystemPrompt({
    videoId: input.videoId,
    workspacePath: input.workspacePath,
  });

  if (input.config.runtime === "local") {
    return {
      ...base,
      local: {
        cwd: input.config.localCwd,
        settingSources: ["project"],
      },
      agents: {
        ...base.agents,
        "recipe-project-guardian": {
          description:
            "Ensures the recipe agent only edits allowed recipe artifact files.",
          prompt: systemPrompt,
          model: "inherit",
        },
      },
    };
  }

  return {
    ...base,
    cloud: {
      repos: [
        {
          url: input.config.repoUrl!,
          startingRef: input.config.startingRef,
        },
      ],
      autoCreatePR: false,
      skipReviewerRequest: true,
    },
    agents: {
      ...base.agents,
      "recipe-project-guardian": {
        description:
          "Ensures the recipe agent only edits allowed recipe artifact files.",
        prompt: systemPrompt,
        model: "inherit",
      },
    },
  };
}

function buildResumeOptions(config: RecipeAgentConfig): Partial<AgentOptions> {
  if (config.runtime === "local") {
    return {
      apiKey: config.apiKey,
      model: buildModelSelection(config),
      local: {
        cwd: config.localCwd,
        settingSources: ["project"],
      },
    };
  }

  return {
    apiKey: config.apiKey,
    model: buildModelSelection(config),
  };
}

function buildModelSelection(config: RecipeAgentConfig): ModelSelection {
  return {
    id: config.model,
    params: buildModelParams(config),
  };
}

function buildModelParams(config: RecipeAgentConfig): ModelSelection["params"] {
  if (!config.modelReasoning) {
    return undefined;
  }

  if (config.model === "gpt-5.5" || config.model === "gpt-5-5") {
    return [
      { id: "context", value: config.modelContext ?? "272k" },
      { id: "reasoning", value: config.modelReasoning },
      { id: "fast", value: config.modelFast ?? "false" },
    ];
  }

  if (config.model.startsWith("gpt-") || config.model.includes("codex")) {
    return [{ id: "reasoning", value: config.modelReasoning }];
  }

  if (config.model.startsWith("claude-")) {
    return [
      { id: "thinking", value: "true" },
      { id: "effort", value: config.modelReasoning },
    ];
  }

  return [{ id: "thinking", value: config.modelReasoning }];
}

async function listRecipeArtifacts(input: {
  agent: SDKAgent;
  run?: Run;
  includeContents: boolean;
  workspacePath: string;
}): Promise<RecipeAgentArtifact[]> {
  const artifacts = await input.agent.listArtifacts();
  const recipeArtifacts = artifacts.filter((artifact) =>
    normalizePath(artifact.path).startsWith(`${input.workspacePath}/`),
  );

  const downloadedArtifacts = await Promise.all(
    recipeArtifacts.map(async (artifact) => ({
      name: getRecipeAgentArtifactName(artifact.path),
      path: artifact.path,
      sizeBytes: artifact.sizeBytes,
      updatedAt: artifact.updatedAt,
      content: input.includeContents
        ? await downloadArtifactText(input.agent, artifact.path)
        : undefined,
      source: "sdk" as const,
    })),
  );

  if (downloadedArtifacts.length > 0 || !input.run) {
    return downloadedArtifacts;
  }

  return listRecipeArtifactsFromConversation({
    run: input.run,
    includeContents: input.includeContents,
    workspacePath: input.workspacePath,
  });
}

async function downloadArtifactText(agent: SDKAgent, path: string) {
  const buffer = await agent.downloadArtifact(path);

  return buffer.toString("utf8");
}

async function listRecipeArtifactsFromConversation(input: {
  run: Run;
  includeContents: boolean;
  workspacePath: string;
}): Promise<RecipeAgentArtifact[]> {
  let conversation: Awaited<ReturnType<Run["conversation"]>>;

  try {
    conversation = await input.run.conversation();
  } catch {
    return [];
  }
  const artifactsByPath = new Map<string, RecipeAgentArtifact>();

  for (const item of walkUnknownValues(conversation)) {
    const artifact = extractConversationReadArtifact(item, input);

    if (artifact) {
      artifactsByPath.set(artifact.path, artifact);
    }
  }

  return [...artifactsByPath.values()];
}

function extractConversationReadArtifact(
  value: unknown,
  input: {
    includeContents: boolean;
    workspacePath: string;
  },
): RecipeAgentArtifact | null {
  if (!isRecord(value)) {
    return null;
  }

  const path = getConversationArtifactPath(value);
  if (!path) {
    return null;
  }

  const content = getConversationArtifactContent(path, value);

  if (content === undefined || content.length === 0) {
    return null;
  }

  if (path.endsWith(".json") && !isValidJson(content)) {
    return null;
  }

  const normalizedPath = normalizeWorkspacePath(path);

  if (!normalizedPath.startsWith(`${input.workspacePath}/`)) {
    return null;
  }

  const sizeBytes =
    getNestedNumber(value, ["result", "value", "fileSize"]) ??
    getNestedNumber(value, ["result", "value", "sizeBytes"]) ??
    Buffer.byteLength(content, "utf8");

  return {
    name: getRecipeAgentArtifactName(normalizedPath),
    path: normalizedPath,
    sizeBytes,
    content: input.includeContents ? content : undefined,
    source: "sdk",
  };
}

function* walkUnknownValues(value: unknown): Generator<unknown> {
  yield value;

  if (Array.isArray(value)) {
    for (const item of value) {
      yield* walkUnknownValues(item);
    }

    return;
  }

  if (isRecord(value)) {
    for (const item of Object.values(value)) {
      yield* walkUnknownValues(item);
    }
  }
}

function getNestedString(value: Record<string, unknown>, path: string[]) {
  const nested = getNestedValue(value, path);

  return typeof nested === "string" ? nested : undefined;
}

function getConversationArtifactPath(value: Record<string, unknown>) {
  return (
    getNestedString(value, ["args", "path"]) ??
    getNestedString(value, ["path"]) ??
    getNestedString(value, ["message", "args", "path"])
  );
}

function getConversationArtifactContent(
  artifactPath: string,
  value: Record<string, unknown>,
) {
  const candidate =
    getNestedString(value, ["result", "value", "content"]) ??
    getNestedString(value, ["result", "value", "newContent"]) ??
    getNestedString(value, ["result", "value", "updatedContent"]) ??
    getNestedString(value, ["result", "value", "fileContent"]) ??
    getNestedString(value, ["result", "value", "text"]) ??
    getNestedString(value, ["args", "content"]) ??
    getNestedString(value, ["message", "args", "content"]);

  if (candidate !== undefined) {
    return candidate;
  }

  if (artifactPath.endsWith(".json")) {
    return undefined;
  }

  const argsNewString =
    getNestedString(value, ["args", "new_string"]) ??
    getNestedString(value, ["message", "args", "new_string"]);

  return argsNewString;
}

function getNestedNumber(value: Record<string, unknown>, path: string[]) {
  const nested = getNestedValue(value, path);

  return typeof nested === "number" ? nested : undefined;
}

function getNestedValue(value: Record<string, unknown>, path: string[]) {
  let current: unknown = value;

  for (const part of path) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[part];
  }

  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function sendMessageWithAgent(input: {
  agent: SDKAgent;
  agentId: string;
  videoId: string;
  stage: SendRecipeAgentMessageInput["stage"];
  message: string;
  includeArtifactContents?: boolean;
  workspacePath: string;
  onStreamEvent?: SendRecipeAgentMessageInput["onStreamEvent"];
}): Promise<RecipeAgentRunResult> {
  const run = await input.agent.send(
    buildRecipeAgentUserMessage({
      stage: input.stage,
      message: input.message,
      workspacePath: input.workspacePath,
    }),
  );
  const streamMeta = await consumeAgentRunStream(run, input.onStreamEvent);
  const result = await run.wait();
  const artifacts = await listRecipeArtifacts({
    agent: input.agent,
    run,
    includeContents: input.includeArtifactContents ?? false,
    workspacePath: input.workspacePath,
  });

  return {
    agentId: input.agentId,
    runId: result.id,
    status: result.status,
    result: result.result ?? streamMeta.assistantText,
    durationMs: result.durationMs,
    workspacePath: input.workspacePath,
    artifacts,
    streamMeta,
  };
}

async function consumeAgentRunStream(
  run: Run,
  onStreamEvent?: SendRecipeAgentMessageInput["onStreamEvent"],
): Promise<RecipeAgentRunStreamMeta> {
  if (!run.supports("stream")) {
    return { needsUserInput: false };
  }

  let seq = 0;
  let needsUserInput = false;
  let assistantText = "";

  for await (const event of run.stream()) {
    seq += 1;
    const summarized = summarizeCursorStreamEvent(event, seq);

    if (summarized.eventType === "request") {
      needsUserInput = true;
    }

    if (
      summarized.eventType === "assistant" &&
      typeof summarized.payload.textPreview === "string"
    ) {
      assistantText += summarized.payload.textPreview;
    }

    await onStreamEvent?.(summarized);
  }

  return {
    needsUserInput,
    assistantText: assistantText.length > 0 ? assistantText : undefined,
  };
}

function buildAgentName(input: CreateRecipeAgentInput) {
  const title = input.title?.trim();

  return title ? `Recipe2Video: ${title}` : `Recipe2Video: ${input.videoId}`;
}

async function disposeAgent(agent: SDKAgent) {
  await agent[Symbol.asyncDispose]();
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/");
}

function normalizeWorkspacePath(path: string) {
  return normalizePath(path).replace(/^\/?workspace\//, "");
}

function isValidJson(content: string) {
  try {
    JSON.parse(content);
    return true;
  } catch {
    return false;
  }
}
