"use server";

import { revalidatePath } from "next/cache";

import {
  assertCostlyActionAllowed,
  isAuthAccessError,
} from "@/modules/auth/assert-allowlisted-user";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { insertStoredMediaAsset } from "@/modules/media-assets/repositories/media-asset.repository";
import { uploadStorageObject } from "@/modules/media-assets/services/storage.service";
import { MEDIA_STORAGE_BUCKETS } from "@/modules/media-assets/media-asset.constants";
import { buildMediaStoragePath } from "@/modules/media-assets/storage-paths";
import { uploadMediaAssetToMux } from "@/modules/media-assets/use-cases/upload-media-asset-to-mux";
import { updateVideoProjectStatus } from "@/modules/videos/repositories/video.repository";

import type { AssemblyAudioSync } from "./assembly.types";
import {
  createComposition,
  updateCompositionExport,
} from "./repositories/assembly.repository";
import {
  buildRemotionProps,
  getAssemblyPageData,
  getDefaultAudioSync,
} from "./use-cases/get-assembly-data";

export interface AssemblyActionState {
  status?: "success" | "error";
  message?: string;
  compositionId?: string;
  mediaAssetId?: string;
  muxPlaybackId?: string;
}

export async function saveAssemblySettingsAction(
  _previousState: AssemblyActionState,
  formData: FormData,
): Promise<AssemblyActionState> {
  try {
    const { profile } = await assertCostlyActionAllowed();
    const videoId = requireString(formData, "videoId");
    const segmentOrder = parseSegmentOrder(formData.get("segmentOrder"));
    const audioSync = parseAudioSync(formData.get("audioSync"));
    const audioMediaAssetId = optionalString(formData, "audioMediaAssetId");
    const assemblyData = await getAssemblyPageData(videoId);
    const orderedSegments = orderClips(
      assemblyData.availableSegments,
      segmentOrder,
    );

    if (orderedSegments.length === 0) {
      return {
        status: "error",
        message: "No accepted Supabase-stored segment clips are available yet.",
      };
    }

    const composition = await createComposition(createSupabaseAdminClient(), {
      videoId,
      segmentOrder,
      audioMediaAssetId,
      audioSync,
      remotionProps: buildRemotionProps({
        segments: orderedSegments,
        audioTrack: assemblyData.audioTrack,
        audioSync,
      }),
      exportStatus: "pending",
      createdBy: profile.id,
    });

    await updateVideoProjectStatus(
      createSupabaseAdminClient(),
      videoId,
      "assembling",
    );

    revalidatePath(`/videos/${videoId}/assembly`);
    revalidatePath(`/videos/${videoId}`);

    return {
      status: "success",
      message: "Assembly settings saved for Remotion preview.",
      compositionId: composition.id,
    };
  } catch (error) {
    return formatActionError(error, "Unable to save assembly settings.");
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

    const segmentOrder = parseSegmentOrder(formData.get("segmentOrder"));
    const audioSync = parseAudioSync(formData.get("audioSync"));
    const audioMediaAssetId = optionalString(formData, "audioMediaAssetId");
    const assemblyData = await getAssemblyPageData(videoId);
    const orderedSegments = orderClips(
      assemblyData.availableSegments,
      segmentOrder,
    );
    const remotionProps = buildRemotionProps({
      segments: orderedSegments,
      audioTrack: assemblyData.audioTrack,
      audioSync,
    });

    if (orderedSegments.length === 0) {
      return {
        status: "error",
        message: "No accepted Supabase-stored segment clips are available yet.",
      };
    }

    const supabase = createSupabaseAdminClient();
    const composition = await createComposition(supabase, {
      id: compositionId,
      videoId,
      segmentOrder,
      audioMediaAssetId,
      audioSync,
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
        segmentOrder,
        audioSync,
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

    revalidatePath(`/videos/${videoId}/assembly`);
    revalidatePath(`/videos/${videoId}`);

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
      revalidatePath(`/videos/${videoId}/assembly`);
    }

    return formatActionError(error, "Unable to store final export.");
  }
}

function orderClips<T extends { segmentId: string; position: number }>(
  clips: T[],
  segmentOrder: string[],
) {
  const clipBySegmentId = new Map(clips.map((clip) => [clip.segmentId, clip]));
  const ordered = segmentOrder
    .map((segmentId) => clipBySegmentId.get(segmentId))
    .filter((clip): clip is T => Boolean(clip));
  const remaining = clips.filter(
    (clip) => !segmentOrder.includes(clip.segmentId),
  );

  return [...ordered, ...remaining.sort((a, b) => a.position - b.position)];
}

function parseSegmentOrder(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function parseAudioSync(value: FormDataEntryValue | null): AssemblyAudioSync {
  if (typeof value !== "string") {
    return getDefaultAudioSync();
  }

  try {
    const parsed = JSON.parse(value) as Partial<AssemblyAudioSync>;
    return {
      offsetSeconds: readNumber(parsed.offsetSeconds),
      cutFromSeconds: readNumber(parsed.cutFromSeconds),
      fadeInSeconds: readNumber(parsed.fadeInSeconds),
      fadeOutSeconds: readNumber(parsed.fadeOutSeconds),
    };
  } catch {
    return getDefaultAudioSync();
  }
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function requireString(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) {
    throw new Error(`Missing required field: ${key}`);
  }

  return value;
}

function optionalString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatActionError(
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
