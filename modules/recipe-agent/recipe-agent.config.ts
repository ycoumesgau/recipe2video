import {
  DEFAULT_RECIPE_AGENT_MODEL,
  DEFAULT_RECIPE_AGENT_RUNTIME,
  DEFAULT_RECIPE_AGENT_STARTING_REF,
} from "./recipe-agent.constants";
import type { RecipeAgentConfig, RecipeAgentRuntime } from "./recipe-agent.types";

export function resolveRecipeAgentConfig(
  env: Partial<Record<string, string | undefined>> = process.env,
): RecipeAgentConfig {
  const apiKey = env.CURSOR_API_KEY;
  const runtime = resolveRuntime(env.CURSOR_AGENT_RUNTIME);
  const model = env.CURSOR_AGENT_MODEL ?? DEFAULT_RECIPE_AGENT_MODEL;
  const modelReasoning = emptyToUndefined(
    env.CURSOR_AGENT_MODEL_REASONING ?? env.CURSOR_AGENT_MODEL_THINKING,
  );
  const modelContext = emptyToUndefined(env.CURSOR_AGENT_MODEL_CONTEXT);
  const modelFast = emptyToUndefined(env.CURSOR_AGENT_MODEL_FAST);
  const pollingMode = resolvePollingMode(env.RECIPE_AGENT_POLLING_MODE);
  const streamSliceEnabled =
    env.RECIPE_AGENT_STREAM_SLICE === "true" ||
    env.RECIPE_AGENT_STREAM_SLICE === "1";

  if (!apiKey) {
    throw new Error("CURSOR_API_KEY is required before creating recipe agents.");
  }

  if (runtime === "cloud") {
    const repoUrl = env.CURSOR_AGENT_REPO_URL;

    if (!repoUrl) {
      throw new Error(
        "CURSOR_AGENT_REPO_URL is required for cloud recipe agents.",
      );
    }

    return {
      apiKey,
      runtime,
      model,
      modelReasoning,
      modelContext,
      modelFast,
      repoUrl,
      startingRef:
        env.CURSOR_AGENT_STARTING_REF ?? DEFAULT_RECIPE_AGENT_STARTING_REF,
      githubToken: emptyToUndefined(
        env.RECIPE_AGENT_GITHUB_TOKEN ?? env.GITHUB_TOKEN,
      ),
      pollingMode,
      streamSliceEnabled,
    };
  }

  return {
    apiKey,
    runtime,
    model,
    modelReasoning,
    modelContext,
    modelFast,
    localCwd: env.CURSOR_AGENT_LOCAL_CWD ?? process.cwd(),
    pollingMode,
    streamSliceEnabled,
  };
}

function resolvePollingMode(
  value: string | undefined,
): "blocking" | "polling" {
  if (!value || value === "blocking") {
    return "blocking";
  }

  if (value === "polling") {
    return "polling";
  }

  throw new Error(
    `RECIPE_AGENT_POLLING_MODE must be "blocking" or "polling". Received "${value}".`,
  );
}

function resolveRuntime(value: string | undefined): RecipeAgentRuntime {
  if (!value) {
    return DEFAULT_RECIPE_AGENT_RUNTIME;
  }

  if (value === "cloud" || value === "local") {
    return value;
  }

  throw new Error(
    `CURSOR_AGENT_RUNTIME must be "cloud" or "local". Received "${value}".`,
  );
}

function emptyToUndefined(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}
