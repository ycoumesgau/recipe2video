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

function requireString(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} is required.`);
  }
  return value.trim();
}
