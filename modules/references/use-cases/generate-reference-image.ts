import "server-only";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import { logCost } from "@/modules/costs/repositories/cost.repository";
import {
  downloadRunwayOutput,
  pollRunwayTask,
  startReferenceImageGeneration,
} from "@/modules/generation/services/runway.service";
import { persistMediaAssetFile } from "@/modules/media-assets/use-cases/persist-media-asset";

import {
  getReferenceAssetById,
  updateReferenceAssetMedia,
  updateReferenceAssetStatus,
} from "../repositories/reference.repository";
import type { ReferenceAsset } from "../reference.types";

const REFERENCE_IMAGE_GENERATION_TIMEOUT_MS = 5 * 60 * 1000;
const REFERENCE_IMAGE_RATIO = "1024:1024";
const REFERENCE_IMAGE_MODEL = "gpt_image_2";

export interface GenerateReferenceImageInput {
  supabase: SupabaseDataClient;
  referenceId: string;
  requestedByUserId: string;
}

/**
 * Generate one missing reference image with GPT-Image 2 through the Runway
 * API, persist the original to Supabase Storage, link it to the
 * `reference_assets` row, and log the Runway cost. The reference must already
 * exist in the database with a non-empty prompt.
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

  try {
    const task = await startReferenceImageGeneration({
      promptText: reference.prompt,
      ratio: REFERENCE_IMAGE_RATIO,
      model: REFERENCE_IMAGE_MODEL,
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
      },
      createdBy: requestedByUserId,
    });

    const finalTask = await pollRunwayTask({
      taskId: task.id,
      timeoutMs: REFERENCE_IMAGE_GENERATION_TIMEOUT_MS,
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
        prompt: reference.prompt,
      },
      createdBy: requestedByUserId,
    });

    const updated = await updateReferenceAssetMedia(supabase, {
      referenceId,
      mediaAssetId: mediaAsset.id,
      status: "generated",
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
