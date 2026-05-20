"use server";

import { revalidatePath } from "next/cache";

import {
  assertCostlyActionAllowed,
  isAuthAccessError,
} from "@/modules/auth/assert-allowlisted-user";
import { inngest } from "@/inngest/client";
import { INNGEST_EVENTS } from "@/inngest/events";

import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { createSupabaseServerClient } from "@/modules/auth/supabase/server";
import { persistAgentMessageAttachments } from "@/modules/media-assets/use-cases/persist-agent-message-attachments";

import type { RecipeAgentStage } from "./recipe-agent.types";
import { syncRecipeAgentArtifactsFromGithubOnly } from "./use-cases/sync-recipe-agent-from-github";

export interface RecipeAgentActionState {
  kind?: "success" | "error";
  message?: string;
}

export async function submitRecipeAgentMessageAction(
  _previousState: RecipeAgentActionState,
  formData: FormData,
): Promise<RecipeAgentActionState> {
  try {
    const { profile } = await assertCostlyActionAllowed();
    const videoId = requireFormString(formData, "videoId");
    const stage = requireRecipeAgentStage(formData);
    const message = requireFormString(formData, "message");

    if (message.length < 6) {
      throw new Error("Add a little more detail before asking the recipe agent.");
    }

    const attachmentFiles = formData
      .getAll("agentAttachments")
      .filter((value): value is File => value instanceof File && value.size > 0);

    const supabase = createSupabaseAdminClient();
    const attachments = await persistAgentMessageAttachments({
      supabase,
      videoId,
      files: attachmentFiles,
      createdBy: profile.id,
    });

    await inngest.send({
      name: INNGEST_EVENTS.recipeAgentMessageRequested,
      data: {
        videoId,
        stage,
        message,
        requestedByUserId: profile.id,
        isAllowlisted: true,
        ...(attachments.length > 0
          ? { attachmentMediaAssetIds: attachments.map((asset) => asset.id) }
          : {}),
      },
    });

    revalidateProjectPaths(videoId);

    return {
      kind: "success",
      message:
        "Recipe agent message queued. The agent will update project artifacts; no Runway generation was launched.",
    };
  } catch (error) {
    return toActionError(error, "Unable to queue recipe agent message.");
  }
}

export async function syncRecipeAgentArtifactsFromGithubAction(
  _previousState: RecipeAgentActionState,
  formData: FormData,
): Promise<RecipeAgentActionState> {
  try {
    await assertCostlyActionAllowed();
    const videoId = requireFormString(formData, "videoId");
    const supabase = await createSupabaseServerClient();
    const syncPlan = await syncRecipeAgentArtifactsFromGithubOnly(supabase, {
      videoId,
    });

    revalidateProjectPaths(videoId);

    if (!syncPlan.valid) {
      const preview = syncPlan.errors.slice(0, 3).join(" · ");
      const more =
        syncPlan.errors.length > 3
          ? ` (+${syncPlan.errors.length - 3} more)`
          : "";
      return {
        kind: "error",
        message: `Git sync finished but validation failed: ${preview}${more}`,
      };
    }

    return {
      kind: "success",
      message:
        "Artifacts pulled from GitHub and written to the project (including storyboard tables when JSON is valid).",
    };
  } catch (error) {
    return toActionError(error, "Unable to sync artifacts from GitHub.");
  }
}

export async function createRecipeAgentAction(
  _previousState: RecipeAgentActionState,
  formData: FormData,
): Promise<RecipeAgentActionState> {
  try {
    const { profile } = await assertCostlyActionAllowed();
    const videoId = requireFormString(formData, "videoId");

    await inngest.send({
      name: INNGEST_EVENTS.recipeAgentCreateRequested,
      data: {
        videoId,
        requestedByUserId: profile.id,
        isAllowlisted: true,
      },
    });

    revalidateProjectPaths(videoId);

    return {
      kind: "success",
      message: "Recipe agent initialization queued.",
    };
  } catch (error) {
    return toActionError(error, "Unable to queue recipe agent creation.");
  }
}

function requireRecipeAgentStage(formData: FormData): RecipeAgentStage {
  const value = requireFormString(formData, "stage");
  const allowed = new Set<RecipeAgentStage>([
    "recipe_ingest",
    "storyboard_revision",
    "seedance_segmentation",
    "reference_planning",
    "segment_prompt_revision",
    "suno_prompt_revision",
    "general",
  ]);

  if (!allowed.has(value as RecipeAgentStage)) {
    throw new Error(`Unsupported recipe agent stage: ${value}.`);
  }

  return value as RecipeAgentStage;
}

function requireFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing ${key}.`);
  }

  return value.trim();
}

function revalidateProjectPaths(videoId: string) {
  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);
  revalidatePath(`/videos/${videoId}/storyboard`);
  revalidatePath(`/videos/${videoId}/references`);
  revalidatePath(`/videos/${videoId}/music`);
  revalidatePath(`/videos/${videoId}/assembly`);
}

function toActionError(
  error: unknown,
  fallback: string,
): RecipeAgentActionState {
  if (isAuthAccessError(error)) {
    return {
      kind: "error",
      message:
        error.code === "unauthenticated"
          ? "Authentication is required before using the recipe agent."
          : "This user is not authorized to use the recipe agent.",
    };
  }

  return {
    kind: "error",
    message: error instanceof Error ? error.message : fallback,
  };
}
