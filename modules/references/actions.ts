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
  getVideoProjectById,
  updateVideoProjectStatus,
} from "@/modules/videos/repositories/video.repository";

import {
  getReferenceAssetById,
  listReferenceAssetsForVideo,
  updateReferenceAssetConditioning,
  updateReferenceAssetPrompt,
} from "./repositories/reference.repository";
import { appendSegmentReferenceLink } from "./repositories/segment-references.repository";
import { getReferenceReviewData } from "./use-cases/get-reference-review";
import { parseConditioningNames } from "./use-cases/parse-conditioning-names";
import {
  approveReferenceAsset,
  createManualReferenceUpload,
  updateReferenceReviewStatus,
  uploadReferenceAssetToRunway,
} from "./use-cases/manage-reference-review";
import { selectReferenceImageVariant } from "./use-cases/select-reference-image-variant";
import { extractSegmentFrameToReferenceAsset } from "./use-cases/extract-segment-frame";

/**
 * Statuses that mean "this recipe-specific reference still needs (or could
 * use) a GPT-Image 2 pass". Must match the filter in
 * `generateReferencesWorkflow` so the operator's "Generate all missing"
 * click and the workflow agree on what counts as "missing".
 */
const PENDING_GENERATION_STATUSES = new Set(["planned", "failed"]);

export async function uploadManualReferenceAction(formData: FormData) {
  const videoId = requireString(formData, "videoId");

  try {
    const { profile } = await assertCostlyActionAllowed();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new Error("Choose an image file before uploading a reference.");
    }

    await createManualReferenceUpload(createSupabaseAdminClient(), {
      videoId,
      file,
      canonicalName: requireString(formData, "canonicalName"),
      role: requireString(formData, "role"),
      prompt: getString(formData, "prompt"),
      createdBy: profile.id,
    });

    revalidateReferencePath(videoId);
    redirectWithNotice(videoId, "success", "Manual reference uploaded.");
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    redirectWithNotice(videoId, "error", getActionErrorMessage(error));
  }
}

export async function approveReferenceAction(formData: FormData) {
  const videoId = requireString(formData, "videoId");

  try {
    await assertCostlyActionAllowed();
    await approveReferenceAsset(
      createSupabaseAdminClient(),
      requireString(formData, "referenceId"),
    );

    revalidateReferencePath(videoId);
    redirectWithNotice(videoId, "success", "Reference approved.");
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    redirectWithNotice(videoId, "error", getActionErrorMessage(error));
  }
}

export async function selectReferenceImageVariantAction(formData: FormData) {
  const videoId = requireString(formData, "videoId");

  try {
    await assertCostlyActionAllowed();
    const referenceId = requireString(formData, "referenceId");
    const mediaAssetId = requireString(formData, "mediaAssetId");
    const supabase = createSupabaseAdminClient();
    const reference = await getReferenceAssetById(supabase, referenceId);

    if (!reference) {
      throw new Error("Reference asset not found.");
    }

    if (reference.videoId !== videoId) {
      throw new Error("Reference does not belong to this project.");
    }

    await selectReferenceImageVariant(supabase, {
      referenceId,
      mediaAssetId,
    });

    revalidateReferencePath(videoId);
    redirectWithNotice(videoId, "success", "Reference image variant selected.");
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    redirectWithNotice(videoId, "error", getActionErrorMessage(error));
  }
}

export async function rejectReferenceAction(formData: FormData) {
  const videoId = requireString(formData, "videoId");

  try {
    await assertCostlyActionAllowed();
    await updateReferenceReviewStatus(createSupabaseAdminClient(), {
      referenceId: requireString(formData, "referenceId"),
      status: "rejected",
    });

    revalidateReferencePath(videoId);
    redirectWithNotice(videoId, "success", "Reference rejected.");
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    redirectWithNotice(videoId, "error", getActionErrorMessage(error));
  }
}

/**
 * Trigger a real GPT-Image 2 (re)generation for ONE recipe-specific
 * reference. Replaces the previous `requestReferenceRegenerationAction`
 * which only flipped status back to `planned` without ever calling Runway
 * — that was the source of the "I clicked Regenerate but nothing
 * happened" confusion.
 *
 * The image generation runs asynchronously through Inngest so the request
 * does not block the browser; the UI will re-render with the new image
 * after the worker persists it.
 */
export async function generateReferenceImageAction(formData: FormData) {
  const videoId = requireString(formData, "videoId");

  try {
    const { profile } = await assertCostlyActionAllowed();
    const referenceId = requireString(formData, "referenceId");
    const supabase = createSupabaseAdminClient();
    const reference = await getReferenceAssetById(supabase, referenceId);

    if (!reference) {
      throw new Error("Reference asset not found.");
    }

    if (reference.videoId !== videoId) {
      throw new Error(
        "Reference does not belong to this project; refusing to generate.",
      );
    }

    if (!reference.prompt || reference.prompt.trim().length === 0) {
      throw new Error(
        "Set a prompt on this reference before requesting generation, or upload a manual image instead.",
      );
    }

    if (reference.status === "generating") {
      // Idempotent: a second click while the first task is still running
      // would create a duplicate Runway charge. Surface the in-flight
      // state instead.
      revalidateReferencePath(videoId);
      redirectWithNotice(
        videoId,
        "success",
        "A generation is already running for this reference.",
      );
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

    revalidateReferencePath(videoId);
    redirectWithNotice(
      videoId,
      "success",
      "Generation queued. The image will appear on this card once Runway finishes.",
    );
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    redirectWithNotice(videoId, "error", getActionErrorMessage(error));
  }
}

/**
 * Trigger GPT-Image 2 generation for every recipe-specific reference of a
 * project that is still `planned` or `failed` and has a prompt. Lets the
 * operator kick off all pending images in one click without committing to
 * the storyboard sign-off / project-status flip (that's still the job of
 * `markReferencesReadyAction`).
 */
export async function generateAllMissingReferencesAction(formData: FormData) {
  const videoId = requireString(formData, "videoId");

  try {
    const { profile } = await assertCostlyActionAllowed();
    const supabase = createSupabaseAdminClient();
    const references = await listReferenceAssetsForVideo(supabase, videoId);

    const candidates = references.filter(
      (reference) =>
        Boolean(reference.prompt && reference.prompt.trim().length > 0) &&
        PENDING_GENERATION_STATUSES.has(reference.status),
    );

    if (candidates.length === 0) {
      revalidateReferencePath(videoId);
      redirectWithNotice(
        videoId,
        "success",
        "No recipe-specific references are waiting for generation right now.",
      );
    }

    await inngest.send({
      name: INNGEST_EVENTS.videoReferencesGenerateRequested,
      data: {
        videoId,
        requestedByUserId: profile.id,
        isAllowlisted: true,
        generateAllMissing: true,
        flipStatusOnCompletion: false,
      },
    });

    revalidateReferencePath(videoId);
    redirectWithNotice(
      videoId,
      "success",
      `Generation queued for ${candidates.length} reference${candidates.length === 1 ? "" : "s"}. Project status is unchanged.`,
    );
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    redirectWithNotice(videoId, "error", getActionErrorMessage(error));
  }
}

/**
 * Update the list of `asset_library` canonical names used as visual anchors
 * when (re)generating this reference. Stored verbatim; resolution against
 * the live library happens at generation time.
 *
 * The form posts the names as a single newline- or comma-separated string
 * so the textarea stays small and friendly. We normalize to a unique,
 * trimmed array here.
 */
export async function updateReferenceConditioningAction(formData: FormData) {
  const videoId = requireString(formData, "videoId");

  try {
    await assertCostlyActionAllowed();
    const referenceId = requireString(formData, "referenceId");
    const raw = getString(formData, "conditioningCanonicalNames");
    const conditioningCanonicalNames = parseConditioningNames(raw);

    await updateReferenceAssetConditioning(createSupabaseAdminClient(), {
      referenceId,
      conditioningCanonicalNames,
    });

    revalidateReferencePath(videoId);
    redirectWithNotice(
      videoId,
      "success",
      conditioningCanonicalNames.length > 0
        ? `Conditioning updated (${conditioningCanonicalNames.length} anchor${conditioningCanonicalNames.length === 1 ? "" : "s"}). Regenerate to apply.`
        : "Conditioning cleared. Regenerate to apply.",
    );
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    redirectWithNotice(videoId, "error", getActionErrorMessage(error));
  }
}

export async function uploadReferenceToRunwayAction(formData: FormData) {
  const videoId = requireString(formData, "videoId");

  try {
    await assertCostlyActionAllowed();
    await uploadReferenceAssetToRunway(
      createSupabaseAdminClient(),
      requireString(formData, "referenceId"),
    );

    revalidateReferencePath(videoId);
    redirectWithNotice(videoId, "success", "Reference uploaded to Runway.");
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    redirectWithNotice(videoId, "error", getActionErrorMessage(error));
  }
}

export async function markReferencesReadyAction(formData: FormData) {
  const videoId = requireString(formData, "videoId");

  try {
    const { profile } = await assertCostlyActionAllowed();
    const supabase = createSupabaseAdminClient();
    const project = await getVideoProjectById(supabase, videoId);

    if (!project) {
      throw new Error("Project was not found.");
    }

    if (project.status === "references_ready") {
      // Idempotent: another tab / refresh may already have flipped the
      // status. Don't surface an error in that case, just nudge the user
      // forward.
      revalidateReferencePath(videoId);
      redirectWithNotice(
        videoId,
        "success",
        "References are already marked ready. You can move on to segments.",
      );
    }

    if (project.status !== "storyboard_approved") {
      throw new Error(
        `References can only be marked ready while the project is in storyboard_approved (current: ${project.status}).`,
      );
    }

    const reviewData = await getReferenceReviewData(supabase, videoId);
    const blockingSegments = reviewData.segmentReadiness.filter(
      (segment) =>
        segment.exceedsReferenceLimit ||
        segment.missingApprovedReferences.length > 0 ||
        segment.missingRunwayUploads.length > 0,
    );

    if (blockingSegments.length > 0) {
      const summary = blockingSegments
        .slice(0, 3)
        .map((segment) => {
          const issues = [
            segment.exceedsReferenceLimit
              ? "exceeds 9 references"
              : null,
            segment.missingApprovedReferences.length > 0
              ? `missing approval: ${segment.missingApprovedReferences.join(", ")}`
              : null,
            segment.missingRunwayUploads.length > 0
              ? `missing Runway upload: ${segment.missingRunwayUploads.join(", ")}`
              : null,
          ].filter(Boolean);
          return `${segment.segmentTitle} (${issues.join("; ")})`;
        })
        .join(" — ");

      throw new Error(
        `${blockingSegments.length} segment${blockingSegments.length === 1 ? "" : "s"} still need work before references can be marked ready: ${summary}`,
      );
    }

    // Recipe-specific references with `status === "planned"` and a prompt
    // are auto-generated by the references workflow; the same handler then
    // flips the project to `references_ready`. When there is nothing to
    // generate (the most common case once the agent moves to alias-only
    // globals), the workflow flips immediately. We always go through the
    // event so that path stays the single source of truth for the
    // transition.
    await inngest.send({
      name: INNGEST_EVENTS.videoReferencesGenerateRequested,
      data: {
        videoId,
        requestedByUserId: profile.id,
        isAllowlisted: true,
        generateAllMissing: false,
        flipStatusOnCompletion: true,
      },
    });

    // The Inngest workflow updates the status asynchronously. To keep the
    // UI snappy when there is nothing to generate (the ONLY case we hit in
    // the alias-only globals path), we also flip the status here. The
    // workflow remains the source of truth and is idempotent.
    const hasPlannedReferences = reviewData.recipeReferences.some(
      (item) => item.reference.status === "planned" && Boolean(item.reference.prompt),
    );

    if (!hasPlannedReferences) {
      await updateVideoProjectStatus(supabase, videoId, "references_ready");
    }

    revalidateReferencePath(videoId);
    redirectWithNotice(
      videoId,
      "success",
      hasPlannedReferences
        ? "Reference generation queued. The project will move to references_ready once every planned image has been generated."
        : "References are ready. You can now generate Seedance segments.",
    );
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    redirectWithNotice(videoId, "error", getActionErrorMessage(error));
  }
}

export async function updateReferencePromptAction(formData: FormData) {
  const videoId = requireString(formData, "videoId");

  try {
    await assertCostlyActionAllowed();
    const referenceId = requireString(formData, "referenceId");
    const promptRaw = getString(formData, "prompt");
    const prompt = promptRaw.length > 0 ? promptRaw : null;

    await updateReferenceAssetPrompt(createSupabaseAdminClient(), {
      referenceId,
      prompt,
    });

    revalidateReferencePath(videoId);
    redirectWithNotice(
      videoId,
      "success",
      prompt ? "Reference prompt updated." : "Reference prompt cleared.",
    );
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    redirectWithNotice(videoId, "error", getActionErrorMessage(error));
  }
}

/**
 * Extract a single frame from a previously-rendered segment and persist
 * it as a recipe-specific `reference_assets` row. Returns the new
 * reference id via a redirect notice so the operator can attach it to a
 * downstream segment in a follow-up action.
 *
 * Frame extraction is treated as a costly action because it does (small)
 * Mux + Supabase Storage IO; the cost guard reuses the same allowlist
 * used for Runway generations.
 */
export async function extractSegmentFrameAction(formData: FormData) {
  const videoId = requireString(formData, "videoId");

  try {
    const { profile } = await assertCostlyActionAllowed();
    const sourceSegmentId = requireString(formData, "sourceSegmentId");
    const timestampSecondsRaw = requireString(formData, "timestampSeconds");
    const timestampSeconds = Number(timestampSecondsRaw);
    if (!Number.isFinite(timestampSeconds) || timestampSeconds < 0) {
      throw new Error(
        `Invalid timestamp '${timestampSecondsRaw}'; expected a non-negative number of seconds.`,
      );
    }
    const canonicalNameRaw = getString(formData, "canonicalName");
    const promptRaw = getString(formData, "prompt");

    const result = await extractSegmentFrameToReferenceAsset(
      createSupabaseAdminClient(),
      {
        sourceSegmentId,
        timestampSeconds,
        canonicalName: canonicalNameRaw.length > 0 ? canonicalNameRaw : undefined,
        prompt: promptRaw.length > 0 ? promptRaw : null,
        createdBy: profile.id,
      },
    );

    revalidateReferencePath(videoId);
    revalidatePath(`/videos/${videoId}/segments`);
    redirectWithNotice(
      videoId,
      "success",
      `Frame extracted at ${timestampSeconds.toFixed(2)}s as '${result.reference.canonicalName}'. Attach it to a downstream segment to consume it.`,
    );
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    redirectWithNotice(videoId, "error", getActionErrorMessage(error));
  }
}

/**
 * Combine extraction + attachment in a single round-trip. The new
 * reference is created on the source segment and immediately linked to
 * the target segment via `segment_references` with the supplied role.
 */
export async function extractSegmentFrameAndAttachAction(formData: FormData) {
  const videoId = requireString(formData, "videoId");

  try {
    const { profile } = await assertCostlyActionAllowed();
    const sourceSegmentId = requireString(formData, "sourceSegmentId");
    const targetSegmentId = requireString(formData, "targetSegmentId");
    const timestampSecondsRaw = requireString(formData, "timestampSeconds");
    const timestampSeconds = Number(timestampSecondsRaw);
    if (!Number.isFinite(timestampSeconds) || timestampSeconds < 0) {
      throw new Error(
        `Invalid timestamp '${timestampSecondsRaw}'; expected a non-negative number of seconds.`,
      );
    }
    const role = getString(formData, "role") || "extracted continuity frame";
    const canonicalNameRaw = getString(formData, "canonicalName");
    const promptRaw = getString(formData, "prompt");

    const supabase = createSupabaseAdminClient();
    const result = await extractSegmentFrameToReferenceAsset(supabase, {
      sourceSegmentId,
      timestampSeconds,
      canonicalName: canonicalNameRaw.length > 0 ? canonicalNameRaw : undefined,
      prompt: promptRaw.length > 0 ? promptRaw : null,
      createdBy: profile.id,
    });

    await appendSegmentReferenceLink(supabase, {
      segmentId: targetSegmentId,
      recipeReferenceId: result.reference.id,
      role,
      required: true,
    });

    revalidateReferencePath(videoId);
    revalidatePath(`/videos/${videoId}/segments`);
    redirectWithNotice(
      videoId,
      "success",
      `Frame extracted at ${timestampSeconds.toFixed(2)}s and attached to the target segment as '${result.reference.canonicalName}'.`,
    );
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    redirectWithNotice(videoId, "error", getActionErrorMessage(error));
  }
}

function revalidateReferencePath(videoId: string) {
  revalidatePath(`/videos/${videoId}`);
  revalidatePath(`/videos/${videoId}/references`);
  revalidatePath(`/videos/${videoId}/segments`);
}

function redirectWithNotice(
  videoId: string,
  type: "success" | "error",
  message: string,
): never {
  redirect(
    `/videos/${videoId}/references?notice=${type}&message=${encodeURIComponent(
      message,
    )}`,
  );
}

function getActionErrorMessage(error: unknown) {
  if (isAuthAccessError(error)) {
    return error.code === "unauthenticated"
      ? "Authentication is required before changing references."
      : "This user is not authorized to change references.";
  }

  return error instanceof Error ? error.message : "Reference action failed.";
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
