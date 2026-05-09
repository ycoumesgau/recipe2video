"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  assertCostlyActionAllowed,
  isAuthAccessError,
} from "@/modules/auth/assert-allowlisted-user";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";

import { uploadSunoAudio } from "./use-cases/upload-suno-audio";

export async function uploadSunoAudioAction(formData: FormData) {
  const videoId = requireString(formData, "videoId");

  try {
    const { profile } = await assertCostlyActionAllowed();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new Error("Choose a Suno audio file before uploading.");
    }

    await uploadSunoAudio({
      supabase: createSupabaseAdminClient(),
      videoId,
      file,
      createdBy: profile.id,
    });

    revalidateAssemblyPaths(videoId);
    redirectWithNotice(videoId, "success", "Suno audio uploaded and linked.");
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    redirectWithNotice(videoId, "error", getActionErrorMessage(error));
  }
}

function revalidateAssemblyPaths(videoId: string) {
  revalidatePath(`/videos/${videoId}`);
  revalidatePath(`/videos/${videoId}/assembly`);
}

function redirectWithNotice(
  videoId: string,
  type: "success" | "error",
  message: string,
): never {
  redirect(
    `/videos/${videoId}/assembly?notice=${type}&message=${encodeURIComponent(
      message,
    )}`,
  );
}

function getActionErrorMessage(error: unknown) {
  if (isAuthAccessError(error)) {
    return error.code === "unauthenticated"
      ? "Authentication is required before uploading Suno audio."
      : "This user is not authorized to upload Suno audio.";
  }

  return error instanceof Error ? error.message : "Suno audio upload failed.";
}

function requireString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required.`);
  }

  return value.trim();
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
