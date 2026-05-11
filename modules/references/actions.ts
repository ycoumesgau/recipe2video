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

import { updateReferenceAssetPrompt } from "./repositories/reference.repository";
import { getReferenceReviewData } from "./use-cases/get-reference-review";
import {
  approveReferenceAsset,
  createManualReferenceUpload,
  updateReferenceReviewStatus,
  uploadReferenceAssetToRunway,
} from "./use-cases/manage-reference-review";

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

export async function requestReferenceRegenerationAction(formData: FormData) {
  const videoId = requireString(formData, "videoId");

  try {
    await assertCostlyActionAllowed();
    await updateReferenceReviewStatus(createSupabaseAdminClient(), {
      referenceId: requireString(formData, "referenceId"),
      status: "planned",
    });

    revalidateReferencePath(videoId);
    redirectWithNotice(
      videoId,
      "success",
      "Reference marked for regeneration. Image generation remains a separate workflow.",
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

function revalidateReferencePath(videoId: string) {
  revalidatePath(`/videos/${videoId}`);
  revalidatePath(`/videos/${videoId}/references`);
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
