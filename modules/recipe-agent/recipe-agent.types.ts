import type {
  AgentOptions,
  GetRunOptions,
  Run,
  RunResultStatus,
  SDKAgent,
  SDKArtifact,
  SDKImage,
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
  | "publication_planning"
  | "general";

export type RecipeAgentStatus =
  | "idle"
  | "running"
  | "needs_sync"
  | "validation_failed"
  | "failed"
  | "needs_input";

export type RecipeAgentRunStatus =
  | "queued"
  | "starting"
  | "running"
  | "finalizing"
  | "finished"
  | "error"
  | "cancelled"
  | "timed_out";

export type RecipeAgentArtifactValidationStatus =
  | "pending"
  | "valid"
  | "invalid";

export type RecipeAgentArtifactName =
  (typeof RECIPE_AGENT_ARTIFACT_NAMES)[number];

export interface RecipeAgentConfig {
  apiKey: string;
  runtime: RecipeAgentRuntime;
  model: string;
  modelReasoning?: string;
  modelContext?: string;
  modelFast?: string;
  repoUrl?: string;
  startingRef?: string;
  localCwd?: string;
  /**
   * Fine-grained PAT with read access to `repoUrl` for artifact sync by commit SHA.
   */
  githubToken?: string;
  /** Cloud orchestration: blocking (legacy) or polling (Inngest start→poll→finalize). */
  pollingMode?: "blocking" | "polling";
  /** When pollingMode=polling, ingest stream events between poll ticks. */
  streamSliceEnabled?: boolean;
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
  source?: "sdk" | "github";
}

export interface AgentConversation {
  id: string;
  videoId: string;
  name: string;
  slug: string;
  cursorAgentId?: string | null;
  cursorAgentRuntime?: RecipeAgentRuntime | null;
  agentWorkspacePath?: string | null;
  agentGitBranch?: string | null;
  agentGitCommitSha?: string | null;
  agentStatus: RecipeAgentStatus;
  lastAgentRunId?: string | null;
  lastAgentSyncAt?: string | null;
  cursorAgentModel: string;
  cursorAgentReasoning?: string | null;
  cursorAgentFast: boolean;
  customInstructions?: string | null;
  includeAssetsManifest: boolean;
  isActive: boolean;
  archivedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentConversationInput {
  videoId: string;
  name: string;
  slug: string;
  cursorAgentModel: string;
  cursorAgentReasoning?: string | null;
  cursorAgentFast?: boolean;
  customInstructions?: string | null;
  includeAssetsManifest?: boolean;
  isActive?: boolean;
  agentWorkspacePath?: string | null;
  agentGitBranch?: string | null;
}

export interface UpdateAgentConversationInput {
  name?: string;
  slug?: string;
  cursorAgentId?: string | null;
  cursorAgentRuntime?: RecipeAgentRuntime | null;
  agentWorkspacePath?: string | null;
  agentGitBranch?: string | null;
  agentGitCommitSha?: string | null;
  agentStatus?: RecipeAgentStatus;
  lastAgentRunId?: string | null;
  lastAgentSyncAt?: string | null;
  cursorAgentModel?: string;
  cursorAgentReasoning?: string | null;
  cursorAgentFast?: boolean;
  customInstructions?: string | null;
  includeAssetsManifest?: boolean;
  isActive?: boolean;
  archivedAt?: string | null;
  deletedAt?: string | null;
}

export interface CreateRecipeAgentInput {
  videoId: string;
  title?: string | null;
  conversationId: string;
  conversationName: string;
  conversationSlug: string;
  gitBranch: string;
  includeAssetsManifest?: boolean;
}

export interface SendRecipeAgentMessageInput {
  agentId: string;
  videoId: string;
  stage: RecipeAgentStage;
  message: string;
  /**
   * Optional vision inputs for `agent.send({ text, images })` (e.g. signed Supabase URLs).
   */
  cursorImages?: SDKImage[];
  includeArtifactContents?: boolean;
  /**
   * Set after the DB run row exists so streamed Cursor events can be persisted.
   */
  getAgentRunId?: () => string | undefined;
  onStreamEvent?: RecipeAgentStreamEventHandler;
}

export type RecipeAgentStreamEventHandler = (
  event: RecipeAgentStreamEvent,
) => void | Promise<void>;

export interface RecipeAgentStreamEvent {
  seq: number;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface RecipeAgentRunResult {
  agentId: string;
  runId: string;
  status: RunResultStatus;
  result?: string;
  durationMs?: number;
  workspacePath: string;
  artifacts: RecipeAgentArtifact[];
  streamMeta?: RecipeAgentRunStreamMeta;
}

export interface RecipeAgentRunStreamMeta {
  needsUserInput: boolean;
  assistantText?: string;
}

export interface CursorAgentSdkAdapter {
  create(options: AgentOptions): Promise<SDKAgent>;
  resume(agentId: string, options?: Partial<AgentOptions>): Promise<SDKAgent>;
  getRun(runId: string, options?: GetRunOptions): Promise<Run>;
}

export type CursorSdkArtifact = SDKArtifact;

export type RecipeAgentChatRole = "user" | "assistant" | "system";

export type RecipeAgentChatMessageStatus =
  | "streaming"
  | "complete"
  | "error"
  | "cancelled";

export type RecipeAgentStepType =
  | "thinking"
  | "tool_call"
  | "status"
  | "request"
  | "unknown";

export type RecipeAgentStepState = "pending" | "running" | "done" | "error";

export interface RecipeAgentThread {
  id: string;
  videoId: string;
  agentConversationId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeAgentChatMessage {
  id: string;
  threadId: string;
  agentRunId: string | null;
  role: RecipeAgentChatRole;
  content: string;
  status: RecipeAgentChatMessageStatus;
  summary: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeAgentStep {
  id: string;
  agentRunId: string;
  seq: number;
  stepType: RecipeAgentStepType;
  state: RecipeAgentStepState;
  label: string | null;
  detail: string | null;
  payload: Record<string, unknown>;
  sourceEventSeq: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRun {
  id: string;
  videoId: string;
  agentConversationId?: string | null;
  cursorAgentId: string;
  cursorRunId?: string | null;
  stage: RecipeAgentStage;
  userMessage: string;
  status: RecipeAgentRunStatus;
  resultSummary?: string | null;
  error?: string | null;
  createdBy?: string | null;
  startedAt: string;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  agentGitBranch?: string | null;
  agentGitCommitSha?: string | null;
  needsUserInput: boolean;
  userChatMessageId?: string | null;
  assistantChatMessageId?: string | null;
  cursorRunStartedAt?: string | null;
  cursorStreamLastSeq: number;
  cursorStreamLastEventSignature?: string | null;
  cursorAssistantTextLength: number;
  lastPolledAt?: string | null;
  pollCount: number;
  cancelRequested: boolean;
}

export interface CreateAgentRunInput {
  videoId: string;
  agentConversationId: string;
  cursorAgentId: string;
  cursorRunId?: string | null;
  stage: RecipeAgentStage;
  userMessage: string;
  status?: RecipeAgentRunStatus;
  resultSummary?: string | null;
  error?: string | null;
  createdBy?: string | null;
  startedAt?: string;
  completedAt?: string | null;
  agentGitBranch?: string | null;
  agentGitCommitSha?: string | null;
  needsUserInput?: boolean;
  userChatMessageId?: string | null;
  assistantChatMessageId?: string | null;
  cursorRunStartedAt?: string | null;
  cursorStreamLastSeq?: number;
  cursorStreamLastEventSignature?: string | null;
  cursorAssistantTextLength?: number;
  lastPolledAt?: string | null;
  pollCount?: number;
  cancelRequested?: boolean;
}

export interface UpdateAgentRunInput {
  cursorRunId?: string | null;
  status?: RecipeAgentRunStatus;
  resultSummary?: string | null;
  error?: string | null;
  completedAt?: string | null;
  agentGitBranch?: string | null;
  agentGitCommitSha?: string | null;
  needsUserInput?: boolean;
  userChatMessageId?: string | null;
  assistantChatMessageId?: string | null;
  cursorRunStartedAt?: string | null;
  cursorStreamLastSeq?: number;
  cursorStreamLastEventSignature?: string | null;
  cursorAssistantTextLength?: number;
  lastPolledAt?: string | null;
  pollCount?: number;
  cancelRequested?: boolean;
}

export interface AgentArtifact {
  id: string;
  videoId: string;
  agentConversationId?: string | null;
  artifactName: string;
  artifactPath: string;
  content: string;
  contentHash?: string | null;
  validationStatus: RecipeAgentArtifactValidationStatus;
  validationErrors: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UpsertAgentArtifactInput {
  videoId: string;
  agentConversationId: string;
  artifactName: string;
  artifactPath: string;
  content: string;
  contentHash?: string | null;
  validationStatus?: RecipeAgentArtifactValidationStatus;
  validationErrors?: string[];
}

export interface UpdateVideoAgentSessionInput {
  cursorAgentId?: string | null;
  cursorAgentRuntime?: RecipeAgentRuntime | null;
  agentWorkspacePath?: string | null;
  lastAgentRunId?: string | null;
  lastAgentSyncAt?: string | null;
  agentStatus?: RecipeAgentStatus;
  agentGitBranch?: string | null;
  agentGitCommitSha?: string | null;
}

export interface AgentRunTimelineEvent {
  id: string;
  agentRunId: string;
  seq: number;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}
