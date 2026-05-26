import type { AgentOptions, GetRunOptions, ModelSelection, Run, RunStatus, SDKAgent } from "@cursor/sdk";

import { RECIPE_AGENT_STREAM_SLICE_MAX_MS } from "../recipe-agent.constants";
import { resolveRecipeAgentConfig } from "../recipe-agent.config";
import {
  buildRecipeAgentGuardianSubagentPrompt,
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

export interface StartRecipeAgentMessageResult {
  agentId: string;
  runId: string;
  cursorRunStartedAt: string;
}

export interface PollRecipeAgentRunInput {
  agentId: string;
  runId: string;
  streamLastSeq?: number;
  streamLastEventSignature?: string | null;
  assistantTextLength?: number;
  onStreamEvent?: SendRecipeAgentMessageInput["onStreamEvent"];
  enableStreamSlice?: boolean;
  maxStreamSliceMs?: number;
}

export interface PollRecipeAgentRunResult {
  status: RunStatus;
  needsUserInput: boolean;
  cursorStreamLastSeq: number;
  cursorStreamLastEventSignature?: string | null;
  cursorAssistantTextLength: number;
  assistantText?: string;
  durationMs?: number;
  result?: string;
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
  startMessage(
    input: SendRecipeAgentMessageInput,
  ): Promise<StartRecipeAgentMessageResult>;
  startMessageWithNewAgent(
    input: CreateRecipeAgentInput &
      Omit<SendRecipeAgentMessageInput, "agentId">,
  ): Promise<{
    session: RecipeAgentSession;
    runId: string;
    cursorRunStartedAt: string;
  }>;
  pollRun(input: PollRecipeAgentRunInput): Promise<PollRecipeAgentRunResult>;
  finalizeRun(
    input: SendRecipeAgentMessageInput & {
      runId: string;
      streamMeta?: RecipeAgentRunStreamMeta;
    },
  ): Promise<RecipeAgentRunResult>;
  cancelRun(input: { agentId: string; runId: string }): Promise<void>;
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
          gitBranch: input.gitBranch,
          includeAssetsManifest: input.includeAssetsManifest,
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
          gitBranch: input.gitBranch,
          includeAssetsManifest: input.includeAssetsManifest,
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
            cursorImages: input.cursorImages,
            includeArtifactContents: input.includeArtifactContents,
            workspacePath: workspace.workspacePath,
            includeAssetsManifestBriefing: input.includeAssetsManifest,
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
          cursorImages: input.cursorImages,
          includeArtifactContents: input.includeArtifactContents,
          workspacePath: workspace.workspacePath,
          onStreamEvent: input.onStreamEvent,
        });
      } finally {
        await disposeAgent(agent);
      }
    },

    async startMessage(input) {
      const workspace = buildRecipeAgentWorkspace(input.videoId);
      const agent = await options.sdk.resume(
        input.agentId,
        buildResumeOptions(config),
      );

      try {
        return await startMessageWithAgent({
          agent,
          agentId: input.agentId,
          videoId: input.videoId,
          stage: input.stage,
          message: input.message,
          cursorImages: input.cursorImages,
          workspacePath: workspace.workspacePath,
        });
      } finally {
        await disposeAgent(agent);
      }
    },

    async startMessageWithNewAgent(input) {
      const workspace = buildRecipeAgentWorkspace(input.videoId);
      const configuredAttempts = listModelParamAttempts(config);
      const paramAttempts: Array<ModelSelection["params"] | undefined> =
        configuredAttempts.length > 0 ? configuredAttempts : [undefined];
      let lastError: unknown;

      for (let attemptIndex = 0; attemptIndex < paramAttempts.length; attemptIndex += 1) {
        const modelParams = paramAttempts[attemptIndex];
        const agent = await options.sdk.create(
          buildAgentOptions({
            config,
            name: buildAgentName(input),
            workspacePath: workspace.workspacePath,
            videoId: input.videoId,
            gitBranch: input.gitBranch,
            includeAssetsManifest: input.includeAssetsManifest,
            modelParams,
          }),
        );
        const session = {
          agentId: agent.agentId,
          runtime: config.runtime,
          workspacePath: workspace.workspacePath,
          model: config.model,
        };

        try {
          const started = await startMessageWithAgent({
            agent,
            agentId: session.agentId,
            videoId: input.videoId,
            stage: input.stage,
            message: input.message,
            cursorImages: input.cursorImages,
            workspacePath: workspace.workspacePath,
            includeAssetsManifestBriefing: input.includeAssetsManifest,
          });

          return {
            session,
            runId: started.runId,
            cursorRunStartedAt: started.cursorRunStartedAt,
          };
        } catch (error) {
          lastError = error;
          const hasAnotherAttempt = attemptIndex < paramAttempts.length - 1;
          if (!hasAnotherAttempt || !isCursorInvalidModelError(error)) {
            throw error;
          }
        } finally {
          await disposeAgent(agent);
        }
      }

      throw lastError instanceof Error
        ? lastError
        : new Error("Failed to start recipe agent with any model configuration.");
    },

    async pollRun(input) {
      const run = await getCloudRun(options.sdk, config, input.agentId, input.runId);
      const enableStreamSlice =
        input.enableStreamSlice ?? config.streamSliceEnabled ?? false;
      const streamSlice = enableStreamSlice
        ? await consumeAgentRunStreamSlice(run, {
            startSeq: input.streamLastSeq ?? 0,
            startAssistantTextLength: input.assistantTextLength ?? 0,
            startEventSignature: input.streamLastEventSignature ?? null,
            onStreamEvent: input.onStreamEvent,
            maxDurationMs:
              input.maxStreamSliceMs ?? RECIPE_AGENT_STREAM_SLICE_MAX_MS,
          })
        : {
            needsUserInput: false,
            cursorStreamLastSeq: input.streamLastSeq ?? 0,
            cursorStreamLastEventSignature:
              input.streamLastEventSignature ?? null,
            cursorAssistantTextLength: input.assistantTextLength ?? 0,
          };

      return {
        status: run.status,
        needsUserInput: streamSlice.needsUserInput,
        cursorStreamLastSeq: streamSlice.cursorStreamLastSeq,
        cursorStreamLastEventSignature: streamSlice.cursorStreamLastEventSignature,
        cursorAssistantTextLength: streamSlice.cursorAssistantTextLength,
        assistantText: streamSlice.assistantText,
        durationMs: run.durationMs,
        result: run.result,
      };
    },

    async finalizeRun(input) {
      const workspace = buildRecipeAgentWorkspace(input.videoId);
      const agent = await options.sdk.resume(
        input.agentId,
        buildResumeOptions(config),
      );
      const run = await getCloudRun(options.sdk, config, input.agentId, input.runId);

      try {
        const waitResult =
          run.status === "running"
            ? await run.wait()
            : {
                id: run.id,
                status:
                  run.status === "finished" ||
                  run.status === "error" ||
                  run.status === "cancelled"
                    ? run.status
                    : "error",
                result: run.result,
                durationMs: run.durationMs,
              };
        const streamMeta = input.streamMeta ?? { needsUserInput: false };
        const artifacts = await listRecipeArtifacts({
          agent,
          run,
          includeContents: input.includeArtifactContents ?? false,
          workspacePath: workspace.workspacePath,
        });

        return {
          agentId: input.agentId,
          runId: waitResult.id,
          status: waitResult.status,
          result: pickRunResultText(
            waitResult.result,
            streamMeta.assistantText,
          ),
          durationMs: waitResult.durationMs,
          workspacePath: workspace.workspacePath,
          artifacts,
          streamMeta,
        };
      } finally {
        await disposeAgent(agent);
      }
    },

    async cancelRun(input) {
      const run = await getCloudRun(options.sdk, config, input.agentId, input.runId);
      await run.cancel();
    },
  };
}

function buildAgentOptions(input: {
  config: RecipeAgentConfig;
  name: string;
  workspacePath: string;
  videoId: string;
  gitBranch: string;
  includeAssetsManifest?: boolean;
  modelParams?: ModelSelection["params"];
}): AgentOptions {
  const base = {
    apiKey: input.config.apiKey,
    model: buildModelSelection(input.config, input.modelParams),
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

  const systemPrompt = buildRecipeAgentGuardianSubagentPrompt({
    videoId: input.videoId,
    workspacePath: input.workspacePath,
    branchName: input.gitBranch,
    includeAssetsManifest: input.includeAssetsManifest,
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

function buildModelSelection(
  config: RecipeAgentConfig,
  paramsOverride?: ModelSelection["params"],
): ModelSelection {
  return {
    id: config.model,
    params: paramsOverride ?? buildModelParams(config),
  };
}

/** Exported for unit tests. */
export function buildModelParams(
  config: RecipeAgentConfig,
): ModelSelection["params"] | undefined {
  if (config.model === "composer-2" || config.model === "composer-2.5") {
    // Cost guardrail: Composer models are only allowed in fast mode.
    return [{ id: "fast", value: "true" }];
  }

  if (config.model === "gpt-5.5" || config.model === "gpt-5-5") {
    const reasoning = config.modelReasoning ?? "high";
    return [
      { id: "context", value: config.modelContext ?? "272k" },
      { id: "reasoning", value: reasoning },
      { id: "fast", value: config.modelFast ?? "false" },
    ];
  }

  if (config.model === "claude-sonnet-4-6" || config.model === "claude-opus-4-7") {
    const defaultEffort = config.model === "claude-sonnet-4-6" ? "medium" : "high";
    return buildClaudeContextEffortModelParams({
      model: config.model,
      effort: config.modelReasoning ?? defaultEffort,
      context: config.modelContext,
    });
  }

  if (!config.modelReasoning) {
    return undefined;
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

function buildClaudeContextEffortModelParams(input: {
  model: "claude-sonnet-4-6" | "claude-opus-4-7";
  effort: string;
  context?: string;
}): ModelSelection["params"] {
  const defaultContext = input.model === "claude-opus-4-7" ? "300k" : "200k";

  return [
    { id: "thinking", value: "true" },
    { id: "context", value: input.context ?? defaultContext },
    { id: "effort", value: input.effort },
  ];
}

/** Fallback order when Cursor rejects a variant (e.g. effort tier unavailable). */
export function listModelParamAttempts(
  config: RecipeAgentConfig,
): Array<NonNullable<ModelSelection["params"]>> {
  const primary = buildModelParams(config);
  if (!primary) {
    return [];
  }

  if (config.model !== "claude-sonnet-4-6" && config.model !== "claude-opus-4-7") {
    return [primary];
  }

  const effort = primary.find((param) => param.id === "effort")?.value;
  if (!effort || effort === "medium") {
    return [primary];
  }

  return [
    primary,
    primary.map((param) =>
      param.id === "effort" ? { ...param, value: "medium" } : param,
    ),
  ];
}

export function isCursorInvalidModelError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return (
    message.includes("[invalid_model]") ||
    message.includes("does not match a known variant") ||
    message.includes("not available or invalid")
  );
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

async function startMessageWithAgent(input: {
  agent: SDKAgent;
  agentId: string;
  videoId: string;
  stage: SendRecipeAgentMessageInput["stage"];
  message: string;
  cursorImages?: SendRecipeAgentMessageInput["cursorImages"];
  workspacePath: string;
  includeAssetsManifestBriefing?: boolean;
}): Promise<StartRecipeAgentMessageResult> {
  const text = buildRecipeAgentUserMessage({
    stage: input.stage,
    message: input.message,
    workspacePath: input.workspacePath,
    includeAssetsManifestBriefing: input.includeAssetsManifestBriefing,
  });
  const payload =
    input.cursorImages && input.cursorImages.length > 0
      ? { text, images: input.cursorImages }
      : text;
  const run = await input.agent.send(payload);

  return {
    agentId: input.agentId,
    runId: run.id,
    cursorRunStartedAt: new Date().toISOString(),
  };
}

async function getCloudRun(
  sdk: CursorAgentSdkAdapter,
  config: RecipeAgentConfig,
  agentId: string,
  runId: string,
): Promise<Run> {
  const options: GetRunOptions =
    config.runtime === "cloud"
      ? { runtime: "cloud", agentId, apiKey: config.apiKey }
      : { runtime: "local", cwd: config.localCwd };

  return sdk.getRun(runId, options);
}

async function consumeAgentRunStreamSlice(
  run: Run,
  input: {
    startSeq: number;
    startAssistantTextLength: number;
    startEventSignature: string | null;
    onStreamEvent?: SendRecipeAgentMessageInput["onStreamEvent"];
    maxDurationMs: number;
  },
): Promise<
  RecipeAgentRunStreamMeta & {
    cursorStreamLastSeq: number;
    cursorStreamLastEventSignature: string | null;
    cursorAssistantTextLength: number;
  }
> {
  if (!run.supports("stream")) {
    return {
      needsUserInput: false,
      cursorStreamLastSeq: input.startSeq,
      cursorStreamLastEventSignature: input.startEventSignature,
      cursorAssistantTextLength: input.startAssistantTextLength,
    };
  }

  let seq = input.startSeq;
  let needsUserInput = false;
  let assistantText = "";
  let lastEventSignature = input.startEventSignature;
  const deadline = Date.now() + input.maxDurationMs;

  for await (const event of run.stream()) {
    if (Date.now() >= deadline) {
      break;
    }

    seq += 1;
    const signature = buildStreamEventSignature(event, seq);
    if (
      seq <= input.startSeq ||
      (lastEventSignature !== null && signature === lastEventSignature)
    ) {
      continue;
    }

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

    await input.onStreamEvent?.(summarized);
    lastEventSignature = signature;
  }

  const combinedAssistantText =
    assistantText.length > 0 ? assistantText : undefined;

  return {
    needsUserInput,
    assistantText: combinedAssistantText,
    cursorStreamLastSeq: seq,
    cursorStreamLastEventSignature: lastEventSignature,
    cursorAssistantTextLength:
      input.startAssistantTextLength + assistantText.length,
  };
}

function buildStreamEventSignature(event: unknown, seq: number) {
  if (!isRecord(event)) {
    return `seq:${seq}`;
  }

  const callId =
    getNestedString(event, ["call_id"]) ??
    getNestedString(event, ["request_id"]) ??
    getNestedString(event, ["run_id"]);

  return callId ? `${callId}:${seq}` : `seq:${seq}`;
}

async function sendMessageWithAgent(input: {
  agent: SDKAgent;
  agentId: string;
  videoId: string;
  stage: SendRecipeAgentMessageInput["stage"];
  message: string;
  cursorImages?: SendRecipeAgentMessageInput["cursorImages"];
  includeArtifactContents?: boolean;
  workspacePath: string;
  includeAssetsManifestBriefing?: boolean;
  onStreamEvent?: SendRecipeAgentMessageInput["onStreamEvent"];
}): Promise<RecipeAgentRunResult> {
  const text = buildRecipeAgentUserMessage({
    stage: input.stage,
    message: input.message,
    workspacePath: input.workspacePath,
    includeAssetsManifestBriefing: input.includeAssetsManifestBriefing,
  });
  const payload =
    input.cursorImages && input.cursorImages.length > 0
      ? { text, images: input.cursorImages }
      : text;
  const run = await input.agent.send(payload);
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
    result: pickRunResultText(result.result, streamMeta.assistantText),
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
  const conversationSuffix =
    input.conversationName?.trim() || input.conversationSlug?.trim() || "Initial";

  if (title) {
    return `Recipe2Video: ${title} — ${conversationSuffix}`;
  }

  return `Recipe2Video: ${input.videoId} — ${conversationSuffix}`;
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

function pickRunResultText(
  waitResult: string | undefined,
  streamedAssistantText: string | undefined,
) {
  if (typeof waitResult === "string" && waitResult.trim().length > 0) {
    return waitResult;
  }

  return streamedAssistantText;
}
