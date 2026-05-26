"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  assertAuthenticatedUser,
  assertAllowlistedUser,
  getCurrentProfile,
} from "@/modules/auth/assert-allowlisted-user";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import {
  getVideoProjectById,
  isRecipeNumberTaken,
  setVideoProjectArchived,
  updateVideoProjectRecipeNumber,
  updateVideoProjectTitle,
} from "@/modules/videos/repositories/video.repository";
import { parseRecipeNumberInput } from "@/modules/videos/recipe-number";
import { createVideoDraft } from "@/modules/videos/use-cases/create-video";
import { MAX_VIDEO_TITLE_LENGTH } from "@/modules/videos/video.constants";

export interface NewVideoWizardActionState {
  message?: string;
}

export async function createVideoDraftAction(
  _previousState: NewVideoWizardActionState,
  formData: FormData
): Promise<NewVideoWizardActionState> {
  try {
    const result = await createVideoDraft({
      recipeTitle: getString(formData, "recipeTitle"),
      recipeUrl: getString(formData, "recipeUrl"),
      pastedRecipeText: getString(formData, "pastedRecipeText"),
      demoRecipeId: normalizeDemoRecipeId(getString(formData, "demoRecipeId")),
      sourceFiles: formData
        .getAll("recipePhotos")
        .filter((value): value is File => value instanceof File),
      targetDurationSeconds: getNumber(formData, "targetDurationSeconds"),
      stylePreset: getString(formData, "stylePreset"),
      selectedVideoModel: getString(formData, "selectedVideoModel"),
      selectedImageModel: getString(formData, "selectedImageModel"),
      selectedTtsModel: getString(formData, "selectedTtsModel"),
      selectedSfxModel: getString(formData, "selectedSfxModel"),
      cursorAgentModel: getString(formData, "cursorAgentModel"),
      cursorAgentReasoning: getString(formData, "cursorAgentReasoning"),
      intent: normalizeIntent(getString(formData, "intent")),
      complementaryAgentInstructions: getString(
        formData,
        "complementaryAgentInstructions",
      ),
      complementaryAgentAttachmentFiles: formData
        .getAll("complementaryAgentAttachments")
        .filter((value): value is File => value instanceof File),
    });

    redirect(`/videos/${result.videoId}`);
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    return {
      message:
        error instanceof Error
          ? error.message
          : "Unable to create video draft.",
    };
  }
}

export async function archiveVideoProjectAction(videoId: string) {
  const user = await assertAuthenticatedUser();
  await assertAllowlistedUser(user.id);

  const supabase = createSupabaseAdminClient();
  await setVideoProjectArchived(supabase, videoId, true);
  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);
}

export async function unarchiveVideoProjectAction(videoId: string) {
  const user = await assertAuthenticatedUser();
  await assertAllowlistedUser(user.id);

  const supabase = createSupabaseAdminClient();
  await setVideoProjectArchived(supabase, videoId, false);
  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

function normalizeDemoRecipeId(raw: string | undefined) {
  if (raw === undefined || raw === "" || raw === "__no_demo") {
    return undefined;
  }
  return raw;
}

function getNumber(formData: FormData, key: string) {
  const value = getString(formData, key);
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeIntent(value: string | undefined) {
  return value === "draft" ? "draft" : "analyze";
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

export type UpdateVideoTitleResult =
  | { ok: true }
  | { ok: false; message: string };

export async function updateVideoProjectTitleAction(
  videoId: string,
  rawTitle: string,
): Promise<UpdateVideoTitleResult> {
  const trimmed = rawTitle.trim().slice(0, MAX_VIDEO_TITLE_LENGTH);
  if (!trimmed) {
    return { ok: false, message: "Title cannot be empty." };
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, message: "Authentication is required." };
  }

  const supabase = createSupabaseAdminClient();
  const project = await getVideoProjectById(supabase, videoId);
  if (!project) {
    return { ok: false, message: "Project not found." };
  }
  if (project.createdBy !== profile.id) {
    return { ok: false, message: "You cannot rename this project." };
  }

  await updateVideoProjectTitle(supabase, videoId, trimmed);
  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);
  return { ok: true };
}

export type UpdateVideoRecipeNumberResult =
  | { ok: true }
  | { ok: false; message: string };

export async function updateVideoProjectRecipeNumberAction(
  videoId: string,
  rawRecipeNumber: string,
): Promise<UpdateVideoRecipeNumberResult> {
  const trimmed = rawRecipeNumber.trim();

  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, message: "Authentication is required." };
  }

  const supabase = createSupabaseAdminClient();
  const project = await getVideoProjectById(supabase, videoId);
  if (!project) {
    return { ok: false, message: "Project not found." };
  }
  if (project.createdBy !== profile.id) {
    return { ok: false, message: "You cannot edit this project number." };
  }

  if (!trimmed) {
    if (project.recipeNumber == null) {
      return { ok: true };
    }
    await updateVideoProjectRecipeNumber(supabase, videoId, null);
    revalidatePath("/");
    revalidatePath(`/videos/${videoId}`);
    return { ok: true };
  }

  const recipeNumber = parseRecipeNumberInput(trimmed);
  if (recipeNumber == null) {
    return {
      ok: false,
      message: "Enter a whole number between 1 and 999999, or leave empty.",
    };
  }

  if (project.recipeNumber === recipeNumber) {
    return { ok: true };
  }

  const taken = await isRecipeNumberTaken(supabase, recipeNumber, videoId);
  if (taken) {
    return {
      ok: false,
      message: `Recipe number ${recipeNumber} is already used by another project.`,
    };
  }

  try {
    await updateVideoProjectRecipeNumber(supabase, videoId, recipeNumber);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update recipe number.";
    if (
      message.includes("videos_recipe_number_key") ||
      message.includes("videos_recipe_number_active_key")
    ) {
      return {
        ok: false,
        message: `Recipe number ${recipeNumber} is already used by another project.`,
      };
    }
    return { ok: false, message };
  }

  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);
  return { ok: true };
}
