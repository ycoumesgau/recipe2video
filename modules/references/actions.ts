"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  assertCostlyActionAllowed,
  isAuthAccessError,
} from "@/modules/auth/assert-allowlisted-user";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";

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
