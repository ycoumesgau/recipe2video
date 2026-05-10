import type {
  AgentOptions,
  RunResultStatus,
  SDKAgent,
  SDKArtifact,
} from "@cursor/sdk";

import type { RECIPE_AGENT_ARTIFACT_NAMES } from "./recipe-agent.constants";

export type RecipeAgentRuntime = "cloud" | "local";

export type RecipeAgentStage =
  | "recipe_ingest"
  | "storyboard_revision"
  | "seedance_segmentation"
  | "reference_planning"
  | "segment_prompt_revision"
  | "suno_prompt_revision"
  | "general";

export type RecipeAgentArtifactName =
  (typeof RECIPE_AGENT_ARTIFACT_NAMES)[number];

export interface RecipeAgentConfig {
  apiKey: string;
  runtime: RecipeAgentRuntime;
  model: string;
  modelThinking?: string;
  repoUrl?: string;
  startingRef?: string;
  localCwd?: string;
}

export interface RecipeAgentWorkspace {
  videoId: string;
  workspacePath: string;
  artifactPaths: Record<RecipeAgentArtifactName, string>;
}

export interface RecipeAgentSession {
  agentId: string;
  runtime: RecipeAgentRuntime;
  workspacePath: string;
  model: string;
}

export interface RecipeAgentArtifact {
  name: RecipeAgentArtifactName | string;
  path: string;
  sizeBytes?: number;
  updatedAt?: string;
  content?: string;
}

export interface CreateRecipeAgentInput {
  videoId: string;
  title?: string | null;
}

export interface SendRecipeAgentMessageInput {
  agentId: string;
  videoId: string;
  stage: RecipeAgentStage;
  message: string;
  includeArtifactContents?: boolean;
}

export interface RecipeAgentRunResult {
  agentId: string;
  runId: string;
  status: RunResultStatus;
  result?: string;
  durationMs?: number;
  workspacePath: string;
  artifacts: RecipeAgentArtifact[];
}

export interface CursorAgentSdkAdapter {
  create(options: AgentOptions): Promise<SDKAgent>;
  resume(agentId: string, options?: Partial<AgentOptions>): Promise<SDKAgent>;
}

export type CursorSdkArtifact = SDKArtifact;
