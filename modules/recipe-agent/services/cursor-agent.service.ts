import type { AgentOptions, ModelSelection, SDKAgent } from "@cursor/sdk";

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
  RecipeAgentSession,
  SendRecipeAgentMessageInput,
} from "../recipe-agent.types";
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

    async sendMessage(input) {
      const workspace = buildRecipeAgentWorkspace(input.videoId);
      const agent = await options.sdk.resume(
        input.agentId,
        buildResumeOptions(config),
      );

      try {
        const run = await agent.send(
          buildRecipeAgentUserMessage({
            stage: input.stage,
            message: input.message,
            workspacePath: workspace.workspacePath,
          }),
        );
        const result = await run.wait();
        const artifacts = await listRecipeArtifacts({
          agent,
          includeContents: input.includeArtifactContents ?? false,
          workspacePath: workspace.workspacePath,
        });

        return {
          agentId: input.agentId,
          runId: result.id,
          status: result.status,
          result: result.result,
          durationMs: result.durationMs,
          workspacePath: workspace.workspacePath,
          artifacts,
        };
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
    params: config.modelThinking
      ? [{ id: "thinking", value: config.modelThinking }]
      : undefined,
  };
}

async function listRecipeArtifacts(input: {
  agent: SDKAgent;
  includeContents: boolean;
  workspacePath: string;
}): Promise<RecipeAgentArtifact[]> {
  const artifacts = await input.agent.listArtifacts();
  const recipeArtifacts = artifacts.filter((artifact) =>
    normalizePath(artifact.path).startsWith(`${input.workspacePath}/`),
  );

  return Promise.all(
    recipeArtifacts.map(async (artifact) => ({
      name: getRecipeAgentArtifactName(artifact.path),
      path: artifact.path,
      sizeBytes: artifact.sizeBytes,
      updatedAt: artifact.updatedAt,
      content: input.includeContents
        ? await downloadArtifactText(input.agent, artifact.path)
        : undefined,
    })),
  );
}

async function downloadArtifactText(agent: SDKAgent, path: string) {
  const buffer = await agent.downloadArtifact(path);

  return buffer.toString("utf8");
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
