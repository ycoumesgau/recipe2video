import "server-only";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import { logCost } from "@/modules/costs/repositories/cost.repository";
import {
  downloadRunwayOutput,
  pollRunwayTask,
  startReferenceImageGeneration,
} from "@/modules/generation/services/runway.service";
import {
  RUNWAY_MAX_REFERENCE_BYTES,
  RUNWAY_RECIPE_REFERENCE_IMAGE_RATIO,
} from "@/modules/generation/runway.constants";
import { normalizeRunwayProgress } from "@/modules/generation/runway-progress-normalize";
import { persistMediaAssetFile } from "@/modules/media-assets/use-cases/persist-media-asset";

import {
  getReferenceAssetById,
  updateReferenceAssetMedia,
  updateReferenceAssetRunwayPollState,
  updateReferenceAssetStatus,
} from "../repositories/reference.repository";
import type { ReferenceAsset } from "../reference.types";
import { buildReferenceImagePrompt } from "./build-reference-image-prompt";
import {
  resolveConditioningAnchors,
  type ConditioningAnchor,
} from "./resolve-conditioning-anchors";

const REFERENCE_IMAGE_GENERATION_TIMEOUT_MS = 5 * 60 * 1000;
const REFERENCE_IMAGE_MODEL = "gpt_image_2";

export interface GenerateReferenceImageInput {
  supabase: SupabaseDataClient;
  referenceId: string;
  requestedByUserId: string;
}

/**
 * Generate one recipe-specific reference image with GPT-Image 2 through
 * Runway, persist the original to Supabase Storage, link it to the
 * `reference_assets` row, and log the Runway cost. The reference must
 * already exist in the database with a non-empty prompt.
 *
 * Conditioning:
 *   - The reference's `conditioning_canonical_names` array is resolved
 *     against `asset_library` to fetch up to 16 visual anchors (kitchen,
 *     character sheet, cookware, utensils). Each anchor is exposed to
 *     Runway as a `referenceImages[]` entry with a `tag` matching the
 *     library's @-handle, AND the prompt is rewritten to explicitly invoke
 *     those tags so GPT-Image 2 does not silently drop them.
 *   - Anchors that cannot be resolved (typo, deprecated library entry,
 *     missing media) are recorded in the cost metadata for debugging but do
 *     not block the generation: a single bad anchor must not freeze the
 *     whole regen workflow.
 *
 * On Runway failure or timeout, the reference is marked as `failed`. The
 * caller is responsible for surfacing the failure in the UI.
 */
export async function generateReferenceImage(
  input: GenerateReferenceImageInput,
): Promise<ReferenceAsset> {
  const { supabase, referenceId, requestedByUserId } = input;
  const reference = await getReferenceAssetById(supabase, referenceId);

  if (!reference) {
    throw new Error(`Reference ${referenceId} not found.`);
  }

  if (!reference.prompt || reference.prompt.trim().length === 0) {
    throw new Error(
      `Reference ${referenceId} has no prompt; manual upload is required.`,
    );
  }

  if (!reference.videoId) {
    throw new Error(
      `Reference ${referenceId} is not bound to a video; cannot persist its media asset.`,
    );
  }

  await updateReferenceAssetStatus(supabase, {
    referenceId,
    status: "generating",
  });

  let anchors: ConditioningAnchor[] = [];
  let unresolvedAnchorNames: string[] = [];
  let excludedAnchors: Array<{
    canonicalName: string;
    requestedName: string;
    category: string;
  }> = [];

  try {
    const resolution = await resolveConditioningAnchors(
      supabase,
      reference.conditioningCanonicalNames ?? [],
    );
    anchors = resolution.anchors;
    unresolvedAnchorNames = resolution.unresolvedNames;
    excludedAnchors = resolution.excludedAnchors;

    assertConditioningAnchorsUnderRunwaySizeLimit(referenceId, anchors);

    const { promptText } = buildReferenceImagePrompt({
      storedPrompt: reference.prompt,
      anchors,
    });

    const task = await startReferenceImageGeneration({
      promptText,
      ratio: RUNWAY_RECIPE_REFERENCE_IMAGE_RATIO,
      model: REFERENCE_IMAGE_MODEL,
      referenceImages:
        anchors.length > 0
          ? anchors.map((anchor) => ({ uri: anchor.uri, tag: anchor.tag }))
          : undefined,
    });

    await logCost(supabase, {
      videoId: reference.videoId,
      segmentId: null,
      provider: "runway",
      model: REFERENCE_IMAGE_MODEL,
      operation: "reference_image_generation_started",
      creditsUsed: null,
      metadata: {
        referenceId,
        runwayTaskId: task.id,
        endpoint: task.endpoint,
        estimated: true,
        ratio: RUNWAY_RECIPE_REFERENCE_IMAGE_RATIO,
        conditioningRequested: reference.conditioningCanonicalNames ?? [],
        conditioningResolvedTags: anchors.map((anchor) => anchor.tag),
        conditioningUnresolved: unresolvedAnchorNames,
        // Explicitly traced so a future debugger can see "we dropped
        // `Character-sheet` from the anchors even though the agent / the
        // operator wrote it down — that's intentional per the
        // recipe-state conditioning policy".
        conditioningExcluded: excludedAnchors,
      },
      createdBy: requestedByUserId,
    });

    const finalTask = await pollRunwayTask({
      taskId: task.id,
      timeoutMs: REFERENCE_IMAGE_GENERATION_TIMEOUT_MS,
      onPoll: async (polled) => {
        const runwayProgress = normalizeRunwayProgress(
          polled.progress,
          polled.status,
        );
        await updateReferenceAssetRunwayPollState(supabase, {
          referenceId,
          runwayTaskId: task.id,
          runwayTaskStatus: polled.status,
          runwayProgress,
        });
      },
    });

    if (finalTask.status !== "SUCCEEDED" || !finalTask.output?.[0]) {
      throw new Error(
        finalTask.failure ??
          `Runway reference image task ${task.id} did not succeed (status ${finalTask.status}).`,
      );
    }

    const blob = await downloadRunwayOutput(finalTask.output[0]);

    const mediaAsset = await persistMediaAssetFile({
      supabase,
      type: "reference_image",
      provider: "runway",
      body: blob,
      videoId: reference.videoId,
      referenceId,
      mimeType: blob.type || "image/png",
      fileSizeBytes: blob.size,
      runwayOutputUrl: finalTask.output[0],
      metadata: {
        source: "runway_text_to_image",
        runwayTaskId: task.id,
        model: REFERENCE_IMAGE_MODEL,
        ratio: RUNWAY_RECIPE_REFERENCE_IMAGE_RATIO,
        prompt: promptText,
        conditioningAnchors: anchors.map((anchor) => ({
          canonicalName: anchor.canonicalName,
          tag: anchor.tag,
          requestedName: anchor.requestedName,
        })),
        conditioningUnresolved: unresolvedAnchorNames,
        conditioningExcluded: excludedAnchors,
      },
      createdBy: requestedByUserId,
    });

    // The reference may have been approved/uploaded on a previous round and
    // is now being regenerated. We always reset both the runway URI and the
    // status: the old `runway://` upload is gone (or stale) once we swap
    // the media asset, and we want the operator to re-approve + re-upload
    // the new image before it can ride into Seedance.
    const updated = await updateReferenceAssetMedia(supabase, {
      referenceId,
      mediaAssetId: mediaAsset.id,
      status: "generated",
      clearRunwayUri: true,
    });

    await logCost(supabase, {
      videoId: reference.videoId,
      segmentId: null,
      provider: "runway",
      model: REFERENCE_IMAGE_MODEL,
      operation: "reference_image_generation_succeeded",
      creditsUsed: null,
      metadata: {
        referenceId,
        runwayTaskId: task.id,
        mediaAssetId: mediaAsset.id,
        conditioningAnchorCount: anchors.length,
      },
      createdBy: requestedByUserId,
    });

    return updated;
  } catch (error) {
    await updateReferenceAssetStatus(supabase, {
      referenceId,
      status: "failed",
    });
    throw error;
  }
}

/**
 * Pre-flight validation of conditioning anchors against Runway's 16 MB
 * per-asset cap. Without this guard, an oversize library PNG (typical case:
 * a 4K kitchen render at ~17 MB) is handed to GPT-Image 2 as
 * `referenceImages[0]`, Runway downloads it, and rejects the entire request
 * with `Asset size exceeds 16.0MB.` — wasting an Inngest step and surfacing
 * an opaque SDK error. Segment generation already has the same guard via
 * `assertReferencesUnderRunwaySizeLimit` in `orchestrate-segment-generation`.
 */
function assertConditioningAnchorsUnderRunwaySizeLimit(
  referenceId: string,
  anchors: ConditioningAnchor[],
) {
  const oversize = anchors.filter(
    (anchor) => anchor.fileSizeBytes > RUNWAY_MAX_REFERENCE_BYTES,
  );

  if (oversize.length === 0) {
    return;
  }

  const limitMb = (RUNWAY_MAX_REFERENCE_BYTES / (1024 * 1024)).toFixed(1);
  const details = oversize
    .map((anchor) => {
      const sizeMb = (anchor.fileSizeBytes / (1024 * 1024)).toFixed(2);
      const mime = anchor.mimeType ? ` ${anchor.mimeType}` : "";
      return `${anchor.canonicalName} (@${anchor.tag}, ${sizeMb}MB${mime})`;
    })
    .join(", ");

  throw new Error(
    `Reference ${referenceId} has conditioning anchor(s) above Runway's ${limitMb}MB-per-asset limit: ${details}. Re-encode the library asset(s) (e.g. \`npm run normalize:asset-library\`) before regenerating.`,
  );
}
