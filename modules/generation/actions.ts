"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { inngest } from "@/inngest/client";
import { INNGEST_EVENTS } from "@/inngest/events";
import {
  assertCostlyActionAllowed,
  isAuthAccessError,
} from "@/modules/auth/assert-allowlisted-user";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import {
  getSegmentById,
  setSelectedGenerationForSegment,
  updateSegmentPrompt,
  updateSegmentStatus,
} from "@/modules/storyboard/repositories/segment.repository";
import { applyStandardOutroToSegment } from "@/modules/storyboard/use-cases/apply-standard-outro-to-segment";
import { getVideoProjectById } from "@/modules/videos/repositories/video.repository";
import { VIDEO_MODEL_OPTIONS } from "@/modules/videos/video.constants";

import {
  parseSegmentReferenceDraftsJson,
  updateSegmentReferencesForSegment,
} from "@/modules/references/use-cases/update-segment-references";

import { RUNWAY_DEFAULT_VIDEO_MODEL } from "./runway.constants";
import {
  getGenerationById,
  hasActiveGenerationForSegment,
} from "./repositories/generation.repository";

export async function acceptSegmentVariantAction(formData: FormData) {
  const ids = getSegmentReviewIds(formData);

  try {
    await assertCostlyActionAllowed();
    const supabase = createSupabaseAdminClient();
    const generation = await requireGenerationForSegment(
      supabase,
      ids.generationId,
      ids.segmentId,
    );

    if (generation.status !== "succeeded") {
      throw new Error("Only succeeded generations can be accepted.");
    }

    await setSelectedGenerationForSegment(
      supabase,
      ids.segmentId,
      generation.id,
    );
    await updateSegmentStatus(supabase, ids.segmentId, "accepted");

    revalidateSegmentReviewPaths(ids.videoId, ids.segmentId);
    redirectWithNotice(ids, "success", "Variant accepted for this segment.");
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    redirectWithNotice(ids, "error", getActionErrorMessage(error));
  }
}

export async function rejectSegmentVariantAction(formData: FormData) {
  const ids = getSegmentReviewIds(formData);

  try {
    await assertCostlyActionAllowed();
    const supabase = createSupabaseAdminClient();
    const generation = await requireGenerationForSegment(
      supabase,
      ids.generationId,
      ids.segmentId,
    );
    const segment = await requireSegment(supabase, ids.segmentId);

    if (segment.selectedGenerationId === generation.id) {
      await setSelectedGenerationForSegment(supabase, ids.segmentId, null);
    }

    await updateSegmentStatus(supabase, ids.segmentId, "rejected");

    revalidateSegmentReviewPaths(ids.videoId, ids.segmentId);
    redirectWithNotice(ids, "success", "Variant rejected for this segment.");
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    redirectWithNotice(ids, "error", getActionErrorMessage(error));
  }
}

export async function updateSegmentReferencesAction(formData: FormData) {
  const ids = {
    videoId: requireString(formData, "videoId"),
    segmentId: requireString(formData, "segmentId"),
  };

  try {
    await assertCostlyActionAllowed();
    const referencesJson = getString(formData, "referencesJson");
    const references = parseSegmentReferenceDraftsJson(referencesJson);

    await updateSegmentReferencesForSegment(createSupabaseAdminClient(), {
      videoId: ids.videoId,
      segmentId: ids.segmentId,
      references,
    });

    revalidateSegmentReviewPaths(ids.videoId, ids.segmentId);
    revalidatePath(`/videos/${ids.videoId}/references`);
    redirectWithNotice(
      ids,
      "success",
      references.length === 0
        ? "All references removed from this segment."
        : "Segment references saved. Request regeneration to apply the new wiring.",
    );
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    redirectWithNotice(ids, "error", getActionErrorMessage(error));
  }
}

export async function updateSegmentPromptAction(formData: FormData) {
  const ids = {
    videoId: requireString(formData, "videoId"),
    segmentId: requireString(formData, "segmentId"),
  };

  try {
    await assertCostlyActionAllowed();
    const promptRaw = getString(formData, "prompt");

    if (promptRaw.length === 0) {
      throw new Error("Prompt cannot be empty.");
    }

    const supabase = createSupabaseAdminClient();
    const segment = await requireSegment(supabase, ids.segmentId);

    if (segment.videoId !== ids.videoId) {
      throw new Error("Segment not found for this video.");
    }

    if (segment.prompt === promptRaw) {
      revalidateSegmentReviewPaths(ids.videoId, ids.segmentId);
      redirectWithNotice(ids, "success", "Prompt unchanged.");
      return;
    }

    await updateSegmentPrompt(supabase, ids.segmentId, promptRaw);

    revalidateSegmentReviewPaths(ids.videoId, ids.segmentId);
    redirectWithNotice(
      ids,
      "success",
      "Segment prompt saved. Request regeneration to apply.",
    );
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    redirectWithNotice(ids, "error", getActionErrorMessage(error));
  }
}

export async function requestSegmentRegenerationAction(formData: FormData) {
  const ids = {
    videoId: requireString(formData, "videoId"),
    segmentId: requireString(formData, "segmentId"),
  };
  const selectedVideoModel = requireString(formData, "selectedVideoModel");

  try {
    const { profile } = await assertCostlyActionAllowed();
    assertKnownVideoModel(selectedVideoModel);

    const supabase = createSupabaseAdminClient();
    const segment = await requireSegment(supabase, ids.segmentId);
    const project = await getVideoProjectById(supabase, ids.videoId);

    if (!project || segment.videoId !== project.id) {
      throw new Error("Project or segment was not found.");
    }

    if (selectedVideoModel !== project.selectedVideoModel) {
      throw new Error(
        `Selected model ${selectedVideoModel} is not the project generation model (${project.selectedVideoModel}). No fallback was used.`,
      );
    }

    if (selectedVideoModel !== RUNWAY_DEFAULT_VIDEO_MODEL) {
      throw new Error(
        `Selected model ${selectedVideoModel} is not supported by the current Segment generation workflow. No fallback was used.`,
      );
    }

    if (await hasActiveGenerationForSegment(supabase, ids.segmentId)) {
      throw new Error(
        "A generation is already running for this segment. Wait for completion before launching another one.",
      );
    }

    await updateSegmentStatus(supabase, ids.segmentId, "queued");
    await inngest.send({
      name: INNGEST_EVENTS.segmentGenerationRequested,
      data: {
        segmentId: ids.segmentId,
        requestedByUserId: profile.id,
        isAllowlisted: true,
      },
    });

    revalidateSegmentReviewPaths(ids.videoId, ids.segmentId);
    redirectWithNotice(
      ids,
      "success",
      `Regeneration requested with ${selectedVideoModel}.`,
    );
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    redirectWithNotice(ids, "error", getActionErrorMessage(error));
  }
}

export async function launchSelectedSegmentsAction(formData: FormData) {
  const videoId = requireString(formData, "videoId");
  const requestedSegmentIds = Array.from(
    new Set(
      formData
        .getAll("segmentIds")
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );

  try {
    const { profile } = await assertCostlyActionAllowed();

    if (requestedSegmentIds.length === 0) {
      throw new Error("Select at least one segment to launch.");
    }

    const supabase = createSupabaseAdminClient();
    const launchableStatuses = new Set([
      "ready",
      "review",
      "rejected",
      "failed",
      "accepted",
    ]);

    let launched = 0;
    let skipped = 0;

    for (const segmentId of requestedSegmentIds) {
      const segment = await getSegmentById(supabase, segmentId);
      if (!segment || segment.videoId !== videoId) {
        skipped += 1;
        continue;
      }

      if (!launchableStatuses.has(segment.status)) {
        skipped += 1;
        continue;
      }

      if (await hasActiveGenerationForSegment(supabase, segment.id)) {
        skipped += 1;
        continue;
      }

      await updateSegmentStatus(supabase, segment.id, "queued");
      await inngest.send({
        name: INNGEST_EVENTS.segmentGenerationRequested,
        data: {
          segmentId: segment.id,
          requestedByUserId: profile.id,
          isAllowlisted: true,
        },
      });
      launched += 1;
    }

    revalidatePath(`/videos/${videoId}`);
    revalidatePath(`/videos/${videoId}/segments`);

    const message =
      skipped > 0
        ? `${launched} segment(s) queued, ${skipped} skipped.`
        : `${launched} segment(s) queued.`;
    redirect(
      `/videos/${videoId}/segments?notice=success&message=${encodeURIComponent(
        message,
      )}`,
    );
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }
    const message = getActionErrorMessage(error);
    redirect(
      `/videos/${videoId}/segments?notice=error&message=${encodeURIComponent(
        message,
      )}`,
    );
  }
}

/**
 * Backfill the canonical Licorn outro on the last segment of a video.
 *
 * Visible on the segment-review screen for the segment of the highest
 * position. Rewrites prompt + references + duration + arc + status to
 * the canonical template via `applyStandardOutroToSegment`. Status is
 * reset to `pending` so the operator decides explicitly when to spend
 * the ~200 Runway credits required to regenerate.
 */
export async function applyStandardOutroAction(formData: FormData) {
  const ids = {
    videoId: requireString(formData, "videoId"),
    segmentId: requireString(formData, "segmentId"),
  };

  try {
    await assertCostlyActionAllowed();
    const supabase = createSupabaseAdminClient();
    const result = await applyStandardOutroToSegment(supabase, {
      segmentId: ids.segmentId,
    });

    revalidateSegmentReviewPaths(ids.videoId, ids.segmentId);
    redirect(
      `/videos/${ids.videoId}/segments/${ids.segmentId}?notice=success&message=${encodeURIComponent(
        `Standard outro applied (dish: ${truncate(result.finalDishDescription, 80)}). The segment is now in 'pending' — generate it when you're ready.`,
      )}`,
    );
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    redirect(
      `/videos/${ids.videoId}/segments/${ids.segmentId}?notice=error&message=${encodeURIComponent(
        getActionErrorMessage(error),
      )}`,
    );
  }
}

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

async function requireGenerationForSegment(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  generationId: string,
  segmentId: string,
) {
  const [generation, reviewSegment] = await Promise.all([
    getGenerationById(supabase, generationId),
    getSegmentById(supabase, segmentId),
  ]);

  if (!generation || !reviewSegment) {
    throw new Error("Generation was not found for this segment.");
  }

  if (generation.segmentId === segmentId) {
    return generation;
  }

  const sourceSegment = await getSegmentById(supabase, generation.segmentId);
  if (
    !sourceSegment ||
    sourceSegment.videoId !== reviewSegment.videoId ||
    sourceSegment.position !== reviewSegment.position
  ) {
    throw new Error("Generation was not found for this segment.");
  }

  return generation;
}

async function requireSegment(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  segmentId: string,
) {
  const segment = await getSegmentById(supabase, segmentId);

  if (!segment) {
    throw new Error("Segment was not found.");
  }

  return segment;
}

function getSegmentReviewIds(formData: FormData) {
  return {
    videoId: requireString(formData, "videoId"),
    segmentId: requireString(formData, "segmentId"),
    generationId: requireString(formData, "generationId"),
  };
}

function assertKnownVideoModel(model: string) {
  if (!VIDEO_MODEL_OPTIONS.some((option) => option.value === model)) {
    throw new Error(`Unknown video model ${model}.`);
  }
}

function revalidateSegmentReviewPaths(videoId: string, segmentId: string) {
  revalidatePath(`/videos/${videoId}`);
  revalidatePath(`/videos/${videoId}/segments`);
  revalidatePath(`/videos/${videoId}/segments/${segmentId}`);
}

function redirectWithNotice(
  ids: { videoId: string; segmentId: string },
  type: "success" | "error",
  message: string,
): never {
  redirect(
    `/videos/${ids.videoId}/segments/${
      ids.segmentId
    }?notice=${type}&message=${encodeURIComponent(message)}`,
  );
}

function getActionErrorMessage(error: unknown) {
  if (isAuthAccessError(error)) {
    return error.code === "unauthenticated"
      ? "Authentication is required before changing segment review state."
      : "This user is not authorized to change segment review state.";
  }

  return error instanceof Error ? error.message : "Segment review action failed.";
}

function requireString(formData: FormData, key: string) {
  const value = getString(formData, key);

  if (!value) {
    throw new Error(`${key} is required.`);
  }

  return value;
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isNextRedirectError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}
