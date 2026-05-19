/**
 * Thin wrapper around the Seedance 2 `text_to_video` primitives shared
 * between two callers:
 *
 *   1. Segment generation (existing, lives in
 *      `modules/generation/use-cases/orchestrate-segment-generation.ts`).
 *      Segments keep their dedicated orchestrator because they also own
 *      a state machine, Mux upload, and feedback handling.
 *   2. Spotify Canvas generation (new, lives in
 *      `modules/song-cover/use-cases/orchestrate-spotify-canvas-generation.ts`).
 *      The Canvas has none of the segment-specific machinery (no Mux
 *      uploads at start, no timeline integration), so it consumes this
 *      runner directly.
 *
 * What this module IS:
 *   * A typed start helper that resolves which Seedance 2 endpoint to
 *     hit (text_to_video for the Canvas, since we always pass image and
 *     optional video references).
 *   * A cost-logging contract: the caller injects `logCost`.
 *
 * What this module is NOT:
 *   * It does NOT poll Runway. Polling is owned by Inngest functions
 *     so retries and backoff stay deterministic across deploys. Pollers
 *     use `pollRunwayTask` directly from `runway.service.ts`.
 *   * It does NOT persist the output. Each caller decides where the
 *     resulting MP4 goes (accepted-clips for segments, spotify-canvases
 *     for Canvases) and which row gets updated.
 */

import "server-only";

import type { CreateCostLogInput } from "@/modules/costs/cost.types";
import { startSeedanceGeneration } from "@/modules/generation/services/runway.service";
import {
  RUNWAY_DEFAULT_VIDEO_RATIO,
  RUNWAY_SEEDANCE2_CREDITS_PER_SECOND,
  RUNWAY_SEEDANCE2_MAX_DURATION_SECONDS,
  RUNWAY_SEEDANCE2_MIN_DURATION_SECONDS,
} from "@/modules/generation/runway.constants";
import type {
  RunwaySeedanceReference,
  RunwaySeedanceVideoReference,
  SeedanceGenerationInput,
} from "@/modules/generation/runway.types";
import { RunwayServiceError } from "@/modules/generation/services/runway.errors";

export type SeedanceArtifactKind = "segment" | "spotify_canvas";

export interface StartSeedanceVideoRequest {
  artifactKind: SeedanceArtifactKind;
  artifactId: string;
  videoId: string;
  requestedByUserId: string;
  promptText: string;
  durationSeconds: number;
  /**
   * Defaults to `RUNWAY_DEFAULT_VIDEO_RATIO` (1080:1920) — the value the
   * existing segment pipeline already uses in prod. The Canvas reuses it.
   */
  ratio?: string;
  references?: RunwaySeedanceReference[];
  referenceVideos?: RunwaySeedanceVideoReference[];
  seed?: number;
  costMetadata?: Record<string, unknown>;
  logCost?(input: CreateCostLogInput): Promise<unknown> | unknown;
}

export interface StartSeedanceVideoResult {
  runwayTaskId: string;
  ratio: string;
  estimatedCreditsUsed: number;
}

export async function startSeedanceVideo(
  request: StartSeedanceVideoRequest,
): Promise<StartSeedanceVideoResult> {
  assertDurationWithinSeedanceWindow(request.durationSeconds);

  const ratio = request.ratio ?? RUNWAY_DEFAULT_VIDEO_RATIO;
  const input: SeedanceGenerationInput = {
    promptText: request.promptText,
    durationSeconds: request.durationSeconds,
    model: "seedance2",
    ratio,
    references: request.references,
    referenceVideos: request.referenceVideos,
    seed: request.seed,
  };

  const task = await startSeedanceGeneration(input);

  const estimatedCreditsUsed =
    request.durationSeconds * RUNWAY_SEEDANCE2_CREDITS_PER_SECOND;

  if (request.logCost) {
    await request.logCost({
      videoId: request.videoId,
      segmentId: null,
      provider: "runway",
      model: "seedance2",
      operation:
        request.artifactKind === "spotify_canvas"
          ? "spotify_canvas_generation_started"
          : "seedance_video_generation_started",
      creditsUsed: estimatedCreditsUsed,
      metadata: {
        ...(request.costMetadata ?? {}),
        artifactKind: request.artifactKind,
        artifactId: request.artifactId,
        ratio,
        durationSeconds: request.durationSeconds,
        runwayTaskId: task.id,
        endpoint: task.endpoint,
        estimated: true,
      },
      createdBy: request.requestedByUserId,
    });
  }

  return {
    runwayTaskId: task.id,
    ratio,
    estimatedCreditsUsed,
  };
}

function assertDurationWithinSeedanceWindow(durationSeconds: number): void {
  if (!Number.isInteger(durationSeconds)) {
    throw new RunwayServiceError({
      code: "invalid_input",
      message: `Seedance 2 duration must be an integer number of seconds (got ${durationSeconds}).`,
      retryable: false,
    });
  }
  if (
    durationSeconds < RUNWAY_SEEDANCE2_MIN_DURATION_SECONDS ||
    durationSeconds > RUNWAY_SEEDANCE2_MAX_DURATION_SECONDS
  ) {
    throw new RunwayServiceError({
      code: "invalid_input",
      message: `Seedance 2 duration must be between ${RUNWAY_SEEDANCE2_MIN_DURATION_SECONDS}s and ${RUNWAY_SEEDANCE2_MAX_DURATION_SECONDS}s (got ${durationSeconds}s).`,
      retryable: false,
    });
  }
}
