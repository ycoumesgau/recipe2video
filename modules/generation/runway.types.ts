import type { GenerationStatus } from "./generation-status";

export type RunwayTaskStatusValue =
  | "PENDING"
  | "THROTTLED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

export type RunwayTaskEndpoint =
  | "text_to_video"
  | "image_to_video"
  | "video_to_video"
  | "text_to_image";

export type RunwayImageModel =
  | "gpt_image_2"
  | "gen4_image"
  | "gen4_image_turbo"
  | "gemini_2.5_flash"
  | "gemini_image3_pro";

export interface RunwayReferenceImage {
  uri: string;
  tag?: string;
}

export interface RunwaySeedanceReference {
  uri: string;
  type?: "image";
}

export interface RunwayPromptFrame {
  uri: string;
  position?: "first" | "last";
}

export type RunwayPromptImage = string | RunwayPromptFrame[];

export interface CreateRunwayUploadOptions {
  fileName?: string;
  fileMetadata?: Record<string, unknown>;
}

export interface SeedanceGenerationInput {
  promptText: string;
  durationSeconds: number;
  model?: "seedance2";
  ratio?: string;
  promptImage?: RunwayPromptImage;
  promptVideo?: string;
  references?: RunwaySeedanceReference[];
  seed?: number;
}

export interface ReferenceImageInput {
  promptText: string;
  model?: RunwayImageModel;
  ratio?: string;
  referenceImages?: RunwayReferenceImage[];
  outputCount?: number;
  quality?: "low" | "medium" | "high" | "auto";
  background?: "opaque" | "auto";
  seed?: number;
}

export interface RunwayTask {
  id: string;
  endpoint?: RunwayTaskEndpoint;
  generationStatus?: GenerationStatus;
}

export interface RunwayTaskStatus extends RunwayTask {
  status: RunwayTaskStatusValue;
  generationStatus: GenerationStatus;
  createdAt?: string;
  progress?: number;
  output?: string[];
  failure?: string;
  failureCode?: string;
  isTerminal: boolean;
}

export interface PollRunwayTaskOptions {
  taskId: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  /**
   * Invoked after every non-terminal poll (and once with the terminal task
   * before returning). Lets callers persist Runway status/progress to the DB
   * while long tasks run (e.g. recipe reference images).
   */
  onPoll?: (task: RunwayTaskStatus) => void | Promise<void>;
  /**
   * When this resolves true, polling stops and throws
   * {@link RunwayServiceError} with code `poll_aborted` (cooperative cancel).
   */
  shouldAbort?: () => boolean | Promise<boolean>;
}
