"use server";

import { revalidatePath } from "next/cache";

import { getCurrentProfile } from "@/modules/auth/assert-allowlisted-user";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { updateVideoProjectStatus } from "@/modules/videos/repositories/video.repository";

import { listLogicalScenesByVideoId } from "./repositories/logical-scene.repository";
import { listSegmentsByVideoId } from "./repositories/segment.repository";
import { loadParisBrestStoryboardFixture } from "./use-cases/load-storyboard-fixture";

export interface StoryboardActionState {
  message?: string;
  kind?: "success" | "error";
}

export async function loadParisBrestStoryboardFixtureAction(
  _previousState: StoryboardActionState,
  formData: FormData,
): Promise<StoryboardActionState> {
  try {
    const profile = await requireProfile();
    const videoId = requireFormString(formData, "videoId");

    await loadParisBrestStoryboardFixture({
      videoId,
      requestedByUserId: profile.id,
    });
    revalidateStoryboardPaths(videoId);

    return {
      kind: "success",
      message: "Paris-Brest fixture storyboard loaded for review.",
    };
  } catch (error) {
    return toActionError(error, "Unable to load the fixture storyboard.");
  }
}

export async function approveStoryboardAction(
  _previousState: StoryboardActionState,
  formData: FormData,
): Promise<StoryboardActionState> {
  try {
    await requireProfile();
    const videoId = requireFormString(formData, "videoId");
    const supabase = createSupabaseAdminClient();
    const [logicalScenes, seedanceSegments] = await Promise.all([
      listLogicalScenesByVideoId(supabase, videoId),
      listSegmentsByVideoId(supabase, videoId),
    ]);

    if (logicalScenes.length === 0 || seedanceSegments.length === 0) {
      throw new Error(
        "Load or generate logical scenes and Seedance segments before approving.",
      );
    }

    await updateVideoProjectStatus(supabase, videoId, "storyboard_approved");
    revalidateStoryboardPaths(videoId);

    return {
      kind: "success",
      message:
        "Storyboard approved. Seedance generation remains unavailable until the generation workflow is connected.",
    };
  } catch (error) {
    return toActionError(error, "Unable to approve storyboard.");
  }
}

export async function requestStoryboardRevisionAction(
  _previousState: StoryboardActionState,
  formData: FormData,
): Promise<StoryboardActionState> {
  try {
    await requireProfile();
    requireFormString(formData, "videoId");
    const revisionRequest = requireFormString(formData, "revisionRequest");

    if (revisionRequest.length < 10) {
      throw new Error("Add a short revision note before asking the agent.");
    }

    return {
      kind: "success",
      message:
        "Revision request captured in the UI. No OpenAI call was made from this issue scope.",
    };
  } catch (error) {
    return toActionError(error, "Unable to request storyboard revision.");
  }
}

async function requireProfile() {
  const profile = await getCurrentProfile();

  if (!profile) {
    throw new Error("Authentication is required.");
  }

  return profile;
}

function requireFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing ${key}.`);
  }

  return value.trim();
}

function revalidateStoryboardPaths(videoId: string) {
  revalidatePath(`/videos/${videoId}`);
  revalidatePath(`/videos/${videoId}/storyboard`);
}

function toActionError(error: unknown, fallback: string): StoryboardActionState {
  return {
    kind: "error",
    message: error instanceof Error ? error.message : fallback,
  };
}
