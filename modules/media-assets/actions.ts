"use server";

import { revalidatePath } from "next/cache";

import {
  assertCostlyActionAllowed,
  isAuthAccessError,
} from "@/modules/auth/assert-allowlisted-user";

import { uploadMediaAssetToMux } from "./use-cases/upload-media-asset-to-mux";

export interface MuxUploadActionState {
  status?: "success" | "error";
  message?: string;
  muxAssetId?: string;
  muxPlaybackId?: string;
}

export async function uploadMediaAssetToMuxAction(
  _previousState: MuxUploadActionState,
  formData: FormData,
): Promise<MuxUploadActionState> {
  const mediaAssetId = getString(formData, "mediaAssetId");

  if (!mediaAssetId) {
    return {
      status: "error",
      message: "Select or enter a media asset ID.",
    };
  }

  try {
    await assertCostlyActionAllowed();

    const result = await uploadMediaAssetToMux(mediaAssetId);

    revalidatePath("/mux-test");

    return {
      status: "success",
      message: "Mux upload succeeded. Playback ID is ready for review.",
      muxAssetId: result.muxAssetId,
      muxPlaybackId: result.muxPlaybackId,
    };
  } catch (error) {
    if (isAuthAccessError(error)) {
      return {
        status: "error",
        message:
          error.code === "unauthenticated"
            ? "Authentication is required before uploading to Mux."
            : "This user is not authorized to upload media to Mux.",
      };
    }

    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Unable to upload to Mux.",
    };
  }
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
