"use server";

import { revalidatePath } from "next/cache";

import { inngest } from "@/inngest/client";
import { INNGEST_EVENTS } from "@/inngest/events";
import {
  assertCostlyActionAllowed,
  isAuthAccessError,
} from "@/modules/auth/assert-allowlisted-user";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import {
  getReferenceAssetById,
  updateReferenceAssetStatus,
} from "@/modules/references/repositories/reference.repository";
import {
  getSegmentById,
  updateSegmentStatus,
} from "@/modules/storyboard/repositories/segment.repository";

import {
  getGenerationById,
  updateGenerationStatus,
} from "./repositories/generation.repository";
import { setGenerationQueuePaused } from "./repositories/queue-state.repository";

export async function setQueuePauseAction(formData: FormData): Promise<void> {
  try {
    const { profile } = await assertCostlyActionAllowed();
    const desired = formData.get("paused");
    const paused = desired === "true";

    const supabase = createSupabaseAdminClient();
    await setGenerationQueuePaused(supabase, {
      paused,
      updatedBy: profile.id,
    });
  } catch (error) {
    if (isAuthAccessError(error)) {
      throw error;
    }
    throw error instanceof Error
      ? error
      : new Error("Unable to update queue pause state.");
  }

  revalidatePath("/active-generations");
  revalidatePath("/");
}

export async function retryGenerationAction(formData: FormData) {
  try {
    const { profile } = await assertCostlyActionAllowed();
    const generationId = requireString(formData, "generationId");
    const supabase = createSupabaseAdminClient();
    const generation = await getGenerationById(supabase, generationId);

    if (!generation) {
      throw new Error(`Generation ${generationId} not found.`);
    }

    // Bring the segment back to `queued` so the request workflow can proceed.
    await updateSegmentStatus(supabase, generation.segmentId, "queued");
    await updateGenerationStatus(supabase, {
      generationId: generation.id,
      status: "queued",
      runwayTaskStatus: "PENDING",
      runwayProgress: null,
    });

    await inngest.send({
      name: INNGEST_EVENTS.segmentGenerationRequested,
      data: {
        segmentId: generation.segmentId,
        requestedByUserId: profile.id,
        isAllowlisted: true,
      },
    });
  } catch (error) {
    if (isAuthAccessError(error)) {
      throw error;
    }
    throw error instanceof Error
      ? error
      : new Error("Unable to retry generation.");
  }

  revalidatePath("/active-generations");
}

export async function cancelGenerationAction(formData: FormData) {
  try {
    await assertCostlyActionAllowed();
    const generationId = requireString(formData, "generationId");
    const supabase = createSupabaseAdminClient();
    const generation = await getGenerationById(supabase, generationId);

    if (!generation) {
      throw new Error(`Generation ${generationId} not found.`);
    }

    const segment = await getSegmentById(supabase, generation.segmentId);

    await updateGenerationStatus(supabase, {
      generationId: generation.id,
      status: "cancelled",
      completedAt: new Date().toISOString(),
    });

    if (segment && segment.selectedGenerationId !== generation.id) {
      // Free up the segment so the user can plan a new variant. We do not
      // touch Runway here: in-flight tasks will still complete on Runway's
      // side, but the user has explicitly given up on this output.
      await updateSegmentStatus(supabase, generation.segmentId, "ready");
    }
  } catch (error) {
    if (isAuthAccessError(error)) {
      throw error;
    }
    throw error instanceof Error
      ? error
      : new Error("Unable to cancel generation.");
  }

  revalidatePath("/active-generations");
}

export async function cancelReferenceImageGenerationAction(formData: FormData) {
  const referenceId = requireString(formData, "referenceId");
  const videoId = requireString(formData, "videoId");

  try {
    await assertCostlyActionAllowed();
    const supabase = createSupabaseAdminClient();
    const reference = await getReferenceAssetById(supabase, referenceId);

    if (!reference) {
      throw new Error(`Reference ${referenceId} not found.`);
    }

    if (reference.videoId !== videoId) {
      throw new Error("Reference does not belong to this project.");
    }

    if (reference.status !== "generating") {
      revalidateAfterRecipeReferenceQueueChange(videoId);
      return;
    }

    await updateReferenceAssetStatus(supabase, {
      referenceId,
      status: "cancelled",
    });
  } catch (error) {
    if (isAuthAccessError(error)) {
      throw error;
    }
    throw error instanceof Error
      ? error
      : new Error("Unable to cancel reference image generation.");
  }

  revalidateAfterRecipeReferenceQueueChange(videoId);
}

export async function retryReferenceImageGenerationAction(formData: FormData) {
  const referenceId = requireString(formData, "referenceId");
  const videoId = requireString(formData, "videoId");

  try {
    const { profile } = await assertCostlyActionAllowed();
    const supabase = createSupabaseAdminClient();
    const reference = await getReferenceAssetById(supabase, referenceId);

    if (!reference) {
      throw new Error(`Reference ${referenceId} not found.`);
    }

    if (reference.videoId !== videoId) {
      throw new Error("Reference does not belong to this project.");
    }

    if (reference.source === "asset_library") {
      throw new Error("Library globals cannot be retried from this queue.");
    }

    if (reference.status === "generating") {
      throw new Error("This reference is already generating.");
    }

    if (!(reference.status === "failed" || reference.status === "cancelled")) {
      throw new Error(
        "Retry is only available for failed or cancelled recipe references.",
      );
    }

    if (!reference.prompt || reference.prompt.trim().length === 0) {
      throw new Error("Set a prompt on this reference before retrying.");
    }

    await inngest.send({
      name: INNGEST_EVENTS.videoReferenceGenerateRequested,
      data: {
        videoId,
        referenceId,
        requestedByUserId: profile.id,
        isAllowlisted: true,
      },
    });
  } catch (error) {
    if (isAuthAccessError(error)) {
      throw error;
    }
    throw error instanceof Error
      ? error
      : new Error("Unable to retry reference image generation.");
  }

  revalidateAfterRecipeReferenceQueueChange(videoId);
}

function revalidateAfterRecipeReferenceQueueChange(videoId: string) {
  revalidatePath("/active-generations");
  revalidatePath("/");
  revalidatePath(`/videos/${videoId}/references`);
  revalidatePath(`/videos/${videoId}/segments`);
  revalidatePath(`/videos/${videoId}`);
}

function requireString(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} is required.`);
  }
  return value.trim();
}
