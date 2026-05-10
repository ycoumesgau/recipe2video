"use server";

import { redirect } from "next/navigation";

import { createVideoDraft } from "@/modules/videos/use-cases/create-video";

export interface NewVideoWizardActionState {
  message?: string;
}

export async function createVideoDraftAction(
  _previousState: NewVideoWizardActionState,
  formData: FormData
): Promise<NewVideoWizardActionState> {
  try {
    const result = await createVideoDraft({
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
