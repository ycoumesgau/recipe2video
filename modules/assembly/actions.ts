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
import { updateVideoProjectStatus } from "@/modules/videos/repositories/video.repository";

import type {
  AssemblyTimelineState,
  SegmentPlacement,
} from "./assembly.types";
import {
  buildClipsFromPlacements,
  getEmptyTimelineState,
  readPlacementsState,
  readTimelineState,
} from "./timeline-state";
import {
  countPresetsByVideoId,
  deletePreset,
  getPresetById,
  renamePreset,
} from "./repositories/assembly-presets.repository";
import { tryClaimCompositionCloudRender } from "./repositories/assembly.repository";
import { completeSunoAudioUpload } from "./use-cases/complete-suno-audio-upload";
import { prepareSunoAudioUpload } from "./use-cases/prepare-suno-audio-upload";
import { uploadSunoAudio } from "./use-cases/upload-suno-audio";
import { getAssemblyPageData } from "./use-cases/get-assembly-data";
import { saveAssemblyPresetSettings } from "./use-cases/save-assembly-preset-settings";

export interface AssemblyActionState {
  status?: "success" | "error";
  message?: string;
  compositionId?: string;
  presetId?: string;
}

export interface SunoAudioUploadPrepareState {
  status?: "ready" | "error";
  message?: string;
  signedUrl?: string;
  token?: string;
  storagePath?: string;
}

export async function prepareSunoAudioUploadAction(input: {
  videoId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}): Promise<SunoAudioUploadPrepareState> {
  const videoId = input.videoId.trim();

  try {
    await assertCostlyActionAllowed();

    const prepared = await prepareSunoAudioUpload({
      supabase: createSupabaseAdminClient(),
      videoId,
      file: {
        name: input.fileName.trim() || "suno-audio.mp3",
        size: input.fileSize,
        type: input.mimeType,
      },
    });

    return {
      status: "ready",
      signedUrl: prepared.signedUrl,
      token: prepared.token,
      storagePath: prepared.storagePath,
    };
  } catch (error) {
    if (isAuthAccessError(error)) {
      return {
        status: "error",
        message: getSunoActionErrorMessage(error),
      };
    }

    return {
      status: "error",
      message: getSunoActionErrorMessage(error),
    };
  }
}

export async function completeSunoAudioUploadAction(input: {
  videoId: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}) {
  const videoId = input.videoId.trim();

  try {
    const { profile } = await assertCostlyActionAllowed();

    await completeSunoAudioUpload({
      supabase: createSupabaseAdminClient(),
      videoId,
      storagePath: input.storagePath.trim(),
      file: {
        name: input.fileName,
        size: input.fileSize,
        type: input.mimeType,
      },
      createdBy: profile.id,
    });

    revalidateAssemblyPaths(videoId);
    redirectWithNotice(videoId, "success", "Suno audio uploaded and linked.");
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    redirectWithNotice(videoId, "error", getSunoActionErrorMessage(error));
  }
}

/** @deprecated Prefer signed direct upload via prepare + complete actions (Vercel 4.5 MB limit). */
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

    redirectWithNotice(videoId, "error", getSunoActionErrorMessage(error));
  }
}

export async function saveAssemblySettingsAction(
  _previousState: AssemblyActionState,
  formData: FormData,
): Promise<AssemblyActionState> {
  try {
    const { profile } = await assertCostlyActionAllowed();
    const videoId = requireString(formData, "videoId");
    const presetIdFromForm = optionalString(formData, "presetId");
    const assemblyData = await getAssemblyPageData(videoId, {
      presetId: presetIdFromForm,
    });
    const presetId = presetIdFromForm ?? assemblyData.activePresetId;
    const { placements, timelineState, audioMediaAssetId } =
      parseAssemblyFormPayload(formData, assemblyData.availableSegments);

    const { preset, composition } = await saveAssemblyPresetSettings({
      supabase: createSupabaseAdminClient(),
      videoId,
      presetId,
      placements,
      timelineState,
      audioMediaAssetId,
      assemblyData,
      createdBy: profile.id,
    });

    await updateVideoProjectStatus(
      createSupabaseAdminClient(),
      videoId,
      "assembling",
    );

    revalidateAssemblyPaths(videoId);

    return {
      status: "success",
      message: `Assembly preset "${preset.name}" saved.`,
      compositionId: composition.id,
      presetId: preset.id,
    };
  } catch (error) {
    return formatAssemblyActionError(
      error,
      "Unable to save assembly settings.",
    );
  }
}

export async function saveAssemblyPresetAsNewAction(
  _previousState: AssemblyActionState,
  formData: FormData,
): Promise<AssemblyActionState> {
  try {
    const { profile } = await assertCostlyActionAllowed();
    const videoId = requireString(formData, "videoId");
    const presetName = requireString(formData, "presetName");
    const assemblyData = await getAssemblyPageData(videoId);
    const { placements, timelineState, audioMediaAssetId } =
      parseAssemblyFormPayload(formData, assemblyData.availableSegments);

    const { preset, composition } = await saveAssemblyPresetSettings({
      supabase: createSupabaseAdminClient(),
      videoId,
      presetId: null,
      presetName,
      placements,
      timelineState,
      audioMediaAssetId,
      assemblyData,
      createdBy: profile.id,
    });

    await updateVideoProjectStatus(
      createSupabaseAdminClient(),
      videoId,
      "assembling",
    );

    revalidateAssemblyPaths(videoId);

    return {
      status: "success",
      message: `New preset "${preset.name}" saved.`,
      compositionId: composition.id,
      presetId: preset.id,
    };
  } catch (error) {
    return formatAssemblyActionError(
      error,
      "Unable to save new assembly preset.",
    );
  }
}

export async function renameAssemblyPresetAction(
  _previousState: AssemblyActionState,
  formData: FormData,
): Promise<AssemblyActionState> {
  try {
    await assertCostlyActionAllowed();
    const videoId = requireString(formData, "videoId");
    const presetId = requireString(formData, "presetId");
    const presetName = requireString(formData, "presetName");
    const supabase = createSupabaseAdminClient();
    const preset = await getPresetById(supabase, presetId);

    if (!preset || preset.videoId !== videoId) {
      return { status: "error", message: "Assembly preset not found." };
    }

    const renamed = await renamePreset(supabase, presetId, presetName);
    revalidateAssemblyPaths(videoId);

    return {
      status: "success",
      message: `Preset renamed to "${renamed.name}".`,
      presetId: renamed.id,
    };
  } catch (error) {
    return formatAssemblyActionError(error, "Unable to rename assembly preset.");
  }
}

export async function deleteAssemblyPresetAction(
  _previousState: AssemblyActionState,
  formData: FormData,
): Promise<AssemblyActionState> {
  try {
    await assertCostlyActionAllowed();
    const videoId = requireString(formData, "videoId");
    const presetId = requireString(formData, "presetId");
    const supabase = createSupabaseAdminClient();
    const preset = await getPresetById(supabase, presetId);

    if (!preset || preset.videoId !== videoId) {
      return { status: "error", message: "Assembly preset not found." };
    }

    const presetCount = await countPresetsByVideoId(supabase, videoId);
    if (presetCount <= 1) {
      return {
        status: "error",
        message: "Cannot delete the last assembly preset for this video.",
      };
    }

    await deletePreset(supabase, presetId);
    revalidateAssemblyPaths(videoId);

    return {
      status: "success",
      message: `Preset "${preset.name}" deleted.`,
    };
  } catch (error) {
    return formatAssemblyActionError(error, "Unable to delete assembly preset.");
  }
}

export async function requestAssemblyRenderAction(
  _previousState: AssemblyActionState,
  formData: FormData,
): Promise<AssemblyActionState> {
  try {
    const { profile } = await assertCostlyActionAllowed();
    const videoId = requireString(formData, "videoId");
    const presetId = requireString(formData, "presetId");
    const assemblyData = await getAssemblyPageData(videoId, { presetId });
    const activePreset = assemblyData.activePreset;

    if (!activePreset || activePreset.id !== presetId) {
      return {
        status: "error",
        message: "Assembly preset not found for this video.",
      };
    }

    const { placements, timelineState, audioMediaAssetId } =
      parseAssemblyFormPayload(formData, assemblyData.availableSegments);

    const orderedClips = buildClipsFromPlacements(
      placements,
      new Map(
        assemblyData.availableSegments.map((segment) => [
          segment.segmentId,
          {
            segmentId: segment.segmentId,
            mediaAssetId: segment.mediaAssetId,
            generationId: segment.generationId,
            title: segment.title,
            durationSeconds: segment.durationSeconds,
            sourceUrl: segment.sourceUrl,
            storageBucket: segment.storageBucket,
            storagePath: segment.storagePath,
          },
        ]),
      ),
    );

    if (orderedClips.length === 0) {
      return {
        status: "error",
        message: "No accepted Supabase-stored segment clips are available yet.",
      };
    }

    const supabase = createSupabaseAdminClient();
    const { preset, composition } = await saveAssemblyPresetSettings({
      supabase,
      videoId,
      presetId,
      placements,
      timelineState,
      audioMediaAssetId,
      assemblyData,
      createdBy: profile.id,
    });

    const claimed = await tryClaimCompositionCloudRender(supabase, composition.id);
    if (!claimed) {
      revalidateAssemblyPaths(videoId);
      return {
        status: "success",
        message: `A cloud render is already running for preset "${preset.name}".`,
        compositionId: composition.id,
        presetId: preset.id,
      };
    }

    await updateVideoProjectStatus(supabase, videoId, "assembling");

    await inngest.send({
      name: INNGEST_EVENTS.compositionRenderRequested,
      data: {
        videoId,
        compositionId: composition.id,
        presetId: preset.id,
        presetName: preset.name,
        requestedByUserId: profile.id,
        isAllowlisted: true,
      },
    });

    revalidateAssemblyPaths(videoId);

    return {
      status: "success",
      message: `Preset "${preset.name}" saved and cloud render queued.`,
      compositionId: composition.id,
      presetId: preset.id,
    };
  } catch (error) {
    return formatAssemblyActionError(
      error,
      "Unable to queue assembly render.",
    );
  }
}

function revalidateAssemblyPaths(videoId: string) {
  revalidatePath(`/videos/${videoId}`);
  revalidatePath(`/videos/${videoId}/assembly`);
  revalidatePath(`/videos/${videoId}/music`);
}

function redirectWithNotice(
  videoId: string,
  type: "success" | "error",
  message: string,
): never {
  redirect(
    `/videos/${videoId}/music?notice=${type}&message=${encodeURIComponent(
      message,
    )}`,
  );
}

function getSunoActionErrorMessage(error: unknown) {
  if (isAuthAccessError(error)) {
    return error.code === "unauthenticated"
      ? "Authentication is required before uploading Suno audio."
      : "This user is not authorized to upload Suno audio.";
  }

  return error instanceof Error ? error.message : "Suno audio upload failed.";
}

function parseAssemblyFormPayload(
  formData: FormData,
  availableSegments: Array<{ segmentId: string; durationSeconds: number }>,
) {
  const placements = parsePlacementsPayload(
    formData.get("placements"),
    availableSegments,
  );
  const timelineState = parseTimelineState(formData.get("timelineState"));
  const audioMediaAssetId = optionalString(formData, "audioMediaAssetId");

  return { placements, timelineState, audioMediaAssetId };
}

function parsePlacementsPayload(
  value: FormDataEntryValue | null,
  availableSegments: Array<{ segmentId: string; durationSeconds: number }>,
): SegmentPlacement[] {
  const durations = new Map(
    availableSegments.map((segment) => [
      segment.segmentId,
      segment.durationSeconds,
    ]),
  );
  if (typeof value !== "string") {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return readPlacementsState(parsed, null, durations);
  } catch {
    return [];
  }
}

function parseTimelineState(
  value: FormDataEntryValue | null,
): AssemblyTimelineState {
  if (typeof value !== "string") {
    return getEmptyTimelineState();
  }

  try {
    const parsed = JSON.parse(value);
    return readTimelineState(parsed, {});
  } catch {
    return getEmptyTimelineState();
  }
}

function requireString(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) {
    throw new Error(`${key} is required.`);
  }

  return value;
}

function optionalString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatAssemblyActionError(
  error: unknown,
  fallbackMessage: string,
): AssemblyActionState {
  if (isAuthAccessError(error)) {
    return {
      status: "error",
      message:
        error.code === "unauthenticated"
          ? "Authentication is required for assembly export actions."
          : "This user is not authorized to run assembly export actions.",
    };
  }

  return {
    status: "error",
    message: error instanceof Error ? error.message : fallbackMessage,
  };
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
