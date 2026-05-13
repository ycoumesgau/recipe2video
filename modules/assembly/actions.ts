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
import { MEDIA_STORAGE_BUCKETS } from "@/modules/media-assets/media-asset.constants";
import { insertStoredMediaAsset } from "@/modules/media-assets/repositories/media-asset.repository";
import { uploadStorageObject } from "@/modules/media-assets/services/storage.service";
import { buildMediaStoragePath } from "@/modules/media-assets/storage-paths";
import { uploadMediaAssetToMux } from "@/modules/media-assets/use-cases/upload-media-asset-to-mux";
import { updateVideoProjectStatus } from "@/modules/videos/repositories/video.repository";

import type {
  AssemblyTimelineState,
  SegmentPlacement,
} from "./assembly.types";
import {
  buildClipsFromPlacements,
  getEmptyTimelineState,
  projectLegacyAudioSync,
  readPlacementsState,
  readTimelineState,
} from "./timeline-state";
import {
  createComposition,
  tryClaimCompositionCloudRender,
  updateCompositionExport,
  upsertDraftComposition,
} from "./repositories/assembly.repository";
import { uploadSunoAudio } from "./use-cases/upload-suno-audio";
import {
  buildRemotionProps,
  getAssemblyPageData,
} from "./use-cases/get-assembly-data";

export interface AssemblyActionState {
  status?: "success" | "error";
  message?: string;
  compositionId?: string;
  mediaAssetId?: string;
  muxPlaybackId?: string;
}

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
    const assemblyData = await getAssemblyPageData(videoId);
    const placements = parsePlacementsPayload(
      formData.get("placements"),
      assemblyData.availableSegments,
    );
    const timelineState = parseTimelineState(formData.get("timelineState"));
    const audioMediaAssetId = optionalString(formData, "audioMediaAssetId");

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

    // Use upsertDraftComposition so repeated saves update the same row
    // instead of stacking a new composition history every click.
    const composition = await upsertDraftComposition(
      createSupabaseAdminClient(),
      {
        videoId,
        placements,
        audioMediaAssetId,
        audioSync: projectLegacyAudioSync(timelineState.audioClips),
        timelineState,
        remotionProps: buildRemotionProps({
          segments: orderedClips,
          audioTrack: assemblyData.audioTrack,
          audioClips: timelineState.audioClips,
        }),
        exportStatus: "pending",
        createdBy: profile.id,
      },
    );

    await updateVideoProjectStatus(
      createSupabaseAdminClient(),
      videoId,
      "assembling",
    );

    revalidateAssemblyPaths(videoId);

    return {
      status: "success",
      message: "Assembly settings saved for Remotion preview.",
      compositionId: composition.id,
    };
  } catch (error) {
    return formatAssemblyActionError(
      error,
      "Unable to save assembly settings.",
    );
  }
}

export async function requestAssemblyRenderAction(
  _previousState: AssemblyActionState,
  formData: FormData,
): Promise<AssemblyActionState> {
  try {
    const { profile } = await assertCostlyActionAllowed();
    const videoId = requireString(formData, "videoId");
    const assemblyData = await getAssemblyPageData(videoId);
    const placements = parsePlacementsPayload(
      formData.get("placements"),
      assemblyData.availableSegments,
    );
    const timelineState = parseTimelineState(formData.get("timelineState"));
    const audioMediaAssetId = optionalString(formData, "audioMediaAssetId");

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
    const composition = await upsertDraftComposition(supabase, {
      videoId,
      placements,
      audioMediaAssetId,
      audioSync: projectLegacyAudioSync(timelineState.audioClips),
      timelineState,
      remotionProps: buildRemotionProps({
        segments: orderedClips,
        audioTrack: assemblyData.audioTrack,
        audioClips: timelineState.audioClips,
      }),
      createdBy: profile.id,
    });

    const claimed = await tryClaimCompositionCloudRender(supabase, composition.id);
    if (!claimed) {
      revalidateAssemblyPaths(videoId);
      return {
        status: "success",
        message:
          "A cloud render is already running for this assembly. You will be notified when it finishes.",
        compositionId: composition.id,
      };
    }

    await updateVideoProjectStatus(supabase, videoId, "assembling");

    await inngest.send({
      name: INNGEST_EVENTS.compositionRenderRequested,
      data: {
        videoId,
        compositionId: composition.id,
        requestedByUserId: profile.id,
        isAllowlisted: true,
      },
    });

    revalidateAssemblyPaths(videoId);

    return {
      status: "success",
      message:
        "Assembly saved and cloud render queued. This page refreshes while the export runs.",
      compositionId: composition.id,
    };
  } catch (error) {
    return formatAssemblyActionError(
      error,
      "Unable to queue assembly render.",
    );
  }
}

export async function uploadFinalExportAction(
  _previousState: AssemblyActionState,
  formData: FormData,
): Promise<AssemblyActionState> {
  const videoId = optionalString(formData, "videoId");
  const compositionId = crypto.randomUUID();

  try {
    const { profile } = await assertCostlyActionAllowed();
    const finalExport = formData.get("finalExport");

    if (!videoId) {
      return { status: "error", message: "Missing video project ID." };
    }

    if (!(finalExport instanceof File) || finalExport.size === 0) {
      return {
        status: "error",
        message: "Select a final MP4 export before uploading.",
      };
    }

    if (
      finalExport.type &&
      finalExport.type !== "video/mp4" &&
      !finalExport.name.toLowerCase().endsWith(".mp4")
    ) {
      return {
        status: "error",
        message: "Final export must be an MP4 file.",
      };
    }

    const assemblyData = await getAssemblyPageData(videoId);
    const placements = parsePlacementsPayload(
      formData.get("placements"),
      assemblyData.availableSegments,
    );
    const timelineState = parseTimelineState(formData.get("timelineState"));
    const audioMediaAssetId = optionalString(formData, "audioMediaAssetId");
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
    const remotionProps = buildRemotionProps({
      segments: orderedClips,
      audioTrack: assemblyData.audioTrack,
      audioClips: timelineState.audioClips,
    });

    if (orderedClips.length === 0) {
      return {
        status: "error",
        message: "No accepted Supabase-stored segment clips are available yet.",
      };
    }

    const supabase = createSupabaseAdminClient();
    const composition = await createComposition(supabase, {
      id: compositionId,
      videoId,
      placements,
      audioMediaAssetId,
      audioSync: projectLegacyAudioSync(timelineState.audioClips),
      timelineState,
      remotionProps,
      exportStatus: "rendering",
      createdBy: profile.id,
    });
    const storagePath = buildMediaStoragePath({
      type: "final_export",
      videoId,
      compositionId: composition.id,
      filename: finalExport.name,
      mimeType: finalExport.type || "video/mp4",
    });

    await uploadStorageObject(supabase, {
      bucket: MEDIA_STORAGE_BUCKETS.finalExports,
      path: storagePath,
      body: finalExport,
      contentType: finalExport.type || "video/mp4",
    });

    const mediaAsset = await insertStoredMediaAsset(supabase, {
      videoId,
      type: "final_export",
      provider: "supabase",
      storageBucket: MEDIA_STORAGE_BUCKETS.finalExports,
      storagePath,
      originalFilename: finalExport.name,
      mimeType: finalExport.type || "video/mp4",
      fileSizeBytes: finalExport.size,
      status: "stored",
      metadata: {
        compositionId: composition.id,
        placements,
        timelineState,
        source: "assembly_final_export_upload",
      },
      createdBy: profile.id,
    });

    const muxResult = await uploadMediaAssetToMux(mediaAsset.id);

    await updateCompositionExport(supabase, {
      compositionId: composition.id,
      exportMediaAssetId: mediaAsset.id,
      exportStatus: "completed",
      remotionProps,
    });
    await updateVideoProjectStatus(supabase, videoId, "exported");

    revalidateAssemblyPaths(videoId);

    return {
      status: "success",
      message: "Final MP4 stored in Supabase Storage and uploaded to Mux.",
      compositionId: composition.id,
      mediaAssetId: mediaAsset.id,
      muxPlaybackId: muxResult.muxPlaybackId,
    };
  } catch (error) {
    if (videoId) {
      await updateCompositionExport(createSupabaseAdminClient(), {
        compositionId,
        exportStatus: "failed",
      }).catch(() => undefined);
      revalidateAssemblyPaths(videoId);
    }

    return formatAssemblyActionError(error, "Unable to store final export.");
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

/**
 * Decode the placements payload from the form. Validates against the
 * available segment catalogue (drops placements pointing to a missing
 * segmentId) using the same tolerant reader as the page-level loader, so
 * the action can ingest both the new shape and the legacy ones.
 */
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
