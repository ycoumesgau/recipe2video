/**
 * Generic GPT-Image 2 generation orchestrator. Two artifacts run through
 * this module:
 *
 *   1. `reference_image` (legacy) — recipe-specific Seedance references
 *      authored by the agent. Lives in `modules/references` and uses
 *      `orchestrate-reference-generation.ts` as its thin caller.
 *   2. `album_cover` (new) — streaming-publication artwork. Lives in
 *      `modules/song-cover` and uses `orchestrate-album-cover-generation.ts`.
 *
 * Both flows share the same Runway primitives (start → poll → finalize),
 * the same cost-logging surface, and the same conditioning anchor
 * resolver. The differences are:
 *
 *   * The ratio Runway is asked for (vertical 9:16 for references,
 *     square 1:1 for the album cover).
 *   * Which DB row gets updated when the task is queued / completed.
 *   * The conditioning context (`recipe_state` excludes character anchors;
 *     `album_cover` allows them — the mascot is the hero of the artwork).
 *
 * This module deliberately stays small. It does NOT own the per-artifact
 * row update or the persist step: those belong to the caller because
 * each artifact lives in its own table. The module just packages the
 * Runway primitives that are shared.
 *
 * Migration path: the legacy `reference_image` flow keeps its existing
 * use-case file untouched at this PR step to avoid disturbing the
 * reference test surface. The album cover flow consumes this helper
 * directly. A follow-up PR (PR-E polish) can migrate the reference flow
 * on top once the cover flow is dogfooded.
 */

import "server-only";

import type { CreateCostLogInput } from "@/modules/costs/cost.types";
import { estimateGptImage2Credits } from "@/modules/generation/runway.constants";
import { startReferenceImageGeneration } from "@/modules/generation/services/runway.service";
import type {
  ReferenceImageInput,
  RunwayImageModel,
  RunwayReferenceImage,
} from "@/modules/generation/runway.types";
import { RunwayServiceError } from "@/modules/generation/services/runway.errors";

export type GptImageArtifactKind = "reference_image" | "album_cover";

export interface GptImageGenerationRequest {
  artifactKind: GptImageArtifactKind;
  artifactId: string;
  videoId: string;
  requestedByUserId: string;
  promptText: string;
  /**
   * Ordered list of Runway ratio strings to try. The orchestrator
   * attempts them in order and stops at the first one that does not
   * trigger an `invalid_input`-class error. Useful for the album cover
   * Album cover uses `2048:2048` (2K tier); legacy rows may list
   * additional fallbacks in `ratioAttempts`.
   */
  ratioCandidates: string[];
  model?: RunwayImageModel;
  referenceImages?: RunwayReferenceImage[];
  /**
   * Optional structured metadata persisted alongside the cost log. Lets
   * the caller record artifact-specific provenance (e.g. conditioning
   * canonical names, fallback ratio used) without coupling this helper
   * to either artifact's domain types.
   */
  costMetadata?: Record<string, unknown>;
  /**
   * Cost-log writer (injected dep). Defaults to no-op in tests.
   */
  logCost?(input: CreateCostLogInput): Promise<unknown> | unknown;
}

export interface GptImageGenerationResult {
  runwayTaskId: string;
  ratioUsed: string;
  ratioAttempts: string[];
}

const FALLBACK_RATIO_ERROR_CODES = new Set<string>([
  "invalid_input",
  "validation_failed",
]);

/**
 * Starts a GPT-Image 2 task on Runway. Retries each ratio candidate in
 * order until one is accepted; if every candidate is rejected with a
 * known "this ratio is not supported" error code, the final error is
 * thrown so the caller can mark the artifact as `failed`.
 *
 * The `quality` parameter is intentionally NOT sent. Runway's default
 * (high for `gpt_image_2`) ships the right results today and stays in
 * sync with the existing reference-image pipeline which also omits it
 * (see `buildReferenceImageRequestBody` in `runway.service.ts`).
 */
export async function startGptImageGeneration(
  request: GptImageGenerationRequest,
): Promise<GptImageGenerationResult> {
  if (request.ratioCandidates.length === 0) {
    throw new RunwayServiceError({
      code: "invalid_input",
      message: "startGptImageGeneration: at least one ratio candidate is required.",
      retryable: false,
    });
  }

  const attempts: string[] = [];
  let lastError: unknown = null;

  for (const ratio of request.ratioCandidates) {
    attempts.push(ratio);
    try {
      const input: ReferenceImageInput = {
        promptText: request.promptText,
        ratio,
        model: request.model ?? "gpt_image_2",
        referenceImages: request.referenceImages,
      };

      const task = await startReferenceImageGeneration(input);

      if (request.logCost) {
        const estimatedCredits = estimateGptImage2Credits(ratio);
        await request.logCost({
          videoId: request.videoId,
          segmentId: null,
          provider: "runway",
          model: input.model ?? "gpt_image_2",
          operation:
            request.artifactKind === "album_cover"
              ? "album_cover_generation_started"
              : "reference_image_generation_started",
          creditsUsed: estimatedCredits,
          metadata: {
            ...(request.costMetadata ?? {}),
            artifactKind: request.artifactKind,
            artifactId: request.artifactId,
            ratio,
            ratioAttempts: attempts,
            runwayTaskId: task.id,
            endpoint: task.endpoint,
            estimated: true,
            estimatedCredits,
          },
          createdBy: request.requestedByUserId,
        });
      }

      return {
        runwayTaskId: task.id,
        ratioUsed: ratio,
        ratioAttempts: attempts,
      };
    } catch (error) {
      lastError = error;
      if (!shouldFallbackOnError(error)) {
        throw error;
      }
      // Loop to next candidate.
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new RunwayServiceError({
        code: "invalid_input",
        message: `startGptImageGeneration: every ratio candidate was rejected by Runway (${attempts.join(", ")}).`,
        retryable: false,
      });
}

function shouldFallbackOnError(error: unknown): boolean {
  if (error instanceof RunwayServiceError) {
    return FALLBACK_RATIO_ERROR_CODES.has(error.code);
  }
  return false;
}
