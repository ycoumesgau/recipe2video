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

/**
 * Video reference shape accepted by Seedance 2's `text_to_video` endpoint
 * (up to 3 entries, combined duration <= 15s). Image references and video
 * references can coexist on the same request; the orchestrator splits the
 * resolved inputs into `references[]` (images) and `referenceVideos[]`
 * (videos) before calling Runway.
 */
export interface RunwaySeedanceVideoReference {
  uri: string;
  type?: "video";
  /**
   * Optional duration of the reference video in seconds, surfaced from
   * `media_assets.duration_seconds`. When set, the service-side validator
   * uses it to enforce the combined 15s cap; otherwise the call passes
   * through and Runway is the source of truth.
   */
  durationSeconds?: number;
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
  /**
   * Reference videos for the Seedance 2 `text_to_video` endpoint. Up to 3
   * videos, combined duration <= 15s. Mutually exclusive with `promptImage`
   * and `promptVideo`: those route to `image_to_video` / `video_to_video`
   * which do not accept this field.
   */
  referenceVideos?: RunwaySeedanceVideoReference[];
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
}
