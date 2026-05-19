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
import {
  SPOTIFY_CANVAS_MAX_DURATION_SECONDS,
  SPOTIFY_CANVAS_MIN_DURATION_SECONDS,
} from "@/modules/recipe-agent/song-cover-plan.schema";
import { persistMediaAssetFile } from "@/modules/media-assets/use-cases/persist-media-asset";
import { parseConditioningNames } from "@/modules/references/use-cases/parse-conditioning-names";

import {
  getSongCoverArtifactById,
  updateSongCoverArtifact,
} from "./repositories/song-cover.repository";
import type { SongCoverArtifactKind } from "./song-cover.types";

const ALLOWED_KINDS: SongCoverArtifactKind[] = [
  "album_cover",
  "spotify_canvas",
];

export async function updateSongCoverPromptAction(formData: FormData) {
  const videoId = requireString(formData, "videoId");
  try {
    await assertCostlyActionAllowed();
    const artifactId = requireString(formData, "artifactId");
    const promptRaw = getString(formData, "prompt");
    if (promptRaw.length === 0) {
      throw new Error("Prompt cannot be empty. Edit and save again.");
    }
    const artifact = await getSongCoverArtifactById(
      createSupabaseAdminClient(),
      artifactId,
    );
    assertArtifactBelongsToVideo(artifact, videoId);

    await updateSongCoverArtifact(createSupabaseAdminClient(), artifactId, {
      prompt: promptRaw,
    });

    revalidateSongCoverPath(videoId);
    redirectWithNotice(videoId, "success", "Prompt saved. Regenerate to apply.");
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    redirectWithNotice(videoId, "error", getActionErrorMessage(error));
  }
}

export async function updateSongCoverImageReferencesAction(formData: FormData) {
  const videoId = requireString(formData, "videoId");
  try {
    await assertCostlyActionAllowed();
    const artifactId = requireString(formData, "artifactId");
    const raw = getString(formData, "imageReferenceCanonicalNames");
    const names = parseConditioningNames(raw);

    const supabase = createSupabaseAdminClient();
    const artifact = await getSongCoverArtifactById(supabase, artifactId);
    assertArtifactBelongsToVideo(artifact, videoId);

    // The DB CHECK constraint guarantees the loop anchor is in the
    // image refs list, but a manual edit could remove the anchor name
    // accidentally. Surface a clear error before we hit Postgres.
    if (
      artifact!.kind === "spotify_canvas" &&
      artifact!.loopAnchorReferenceName &&
      !names.includes(artifact!.loopAnchorReferenceName)
    ) {
      throw new Error(
        `Loop anchor '${artifact!.loopAnchorReferenceName}' must be present in the image references. Either keep it in the list or change the loop anchor first.`,
      );
    }
    if (names.length > 9) {
      throw new Error(
        "Seedance accepts at most 9 image references per generation.",
      );
    }
    if (artifact!.kind === "album_cover" && names.length > 16) {
      throw new Error(
        "GPT-Image 2 accepts at most 16 reference images per generation.",
      );
    }

    await updateSongCoverArtifact(supabase, artifactId, {
      imageReferenceCanonicalNames: names,
    });

    revalidateSongCoverPath(videoId);
    redirectWithNotice(
      videoId,
      "success",
      `Image references updated (${names.length}). Regenerate to apply.`,
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    redirectWithNotice(videoId, "error", getActionErrorMessage(error));
  }
}

export async function updateSongCoverVideoReferencesAction(formData: FormData) {
  const videoId = requireString(formData, "videoId");
  try {
    await assertCostlyActionAllowed();
    const artifactId = requireString(formData, "artifactId");
    const raw = getString(formData, "videoReferenceCanonicalNames");
    const names = parseConditioningNames(raw);

    const supabase = createSupabaseAdminClient();
    const artifact = await getSongCoverArtifactById(supabase, artifactId);
    assertArtifactBelongsToVideo(artifact, videoId);

    if (artifact!.kind !== "spotify_canvas") {
      throw new Error(
        "Video references are only valid on the spotify_canvas artifact.",
      );
    }
    if (names.length > 3) {
      throw new Error(
        "Seedance accepts at most 3 video references per generation.",
      );
    }

    await updateSongCoverArtifact(supabase, artifactId, {
      videoReferenceCanonicalNames: names,
    });

    revalidateSongCoverPath(videoId);
    redirectWithNotice(
      videoId,
      "success",
      `Video references updated (${names.length}). Regenerate to apply.`,
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    redirectWithNotice(videoId, "error", getActionErrorMessage(error));
  }
}

export async function updateSongCanvasLoopSettingsAction(formData: FormData) {
  const videoId = requireString(formData, "videoId");
  try {
    await assertCostlyActionAllowed();
    const artifactId = requireString(formData, "artifactId");
    const loopAnchorReferenceName = getString(
      formData,
      "loopAnchorReferenceName",
    );
    const durationRaw = getString(formData, "durationSeconds");
    const durationSeconds = Number(durationRaw);

    if (!loopAnchorReferenceName) {
      throw new Error("Pick a loop anchor before saving.");
    }
    if (
      !Number.isInteger(durationSeconds) ||
      durationSeconds < SPOTIFY_CANVAS_MIN_DURATION_SECONDS ||
      durationSeconds > SPOTIFY_CANVAS_MAX_DURATION_SECONDS
    ) {
      throw new Error(
        `Duration must be an integer between ${SPOTIFY_CANVAS_MIN_DURATION_SECONDS} and ${SPOTIFY_CANVAS_MAX_DURATION_SECONDS} seconds.`,
      );
    }

    const supabase = createSupabaseAdminClient();
    const artifact = await getSongCoverArtifactById(supabase, artifactId);
    assertArtifactBelongsToVideo(artifact, videoId);
    if (artifact!.kind !== "spotify_canvas") {
      throw new Error(
        "Loop settings are only valid on the spotify_canvas artifact.",
      );
    }
    if (!artifact!.imageReferenceCanonicalNames.includes(loopAnchorReferenceName)) {
      throw new Error(
        `Loop anchor '${loopAnchorReferenceName}' must be one of the current image references (${artifact!.imageReferenceCanonicalNames.join(", ") || "<empty>"}).`,
      );
    }

    await updateSongCoverArtifact(supabase, artifactId, {
      loopAnchorReferenceName,
      durationSeconds,
    });

    revalidateSongCoverPath(videoId);
    redirectWithNotice(
      videoId,
      "success",
      `Loop anchor and duration updated. Regenerate to apply.`,
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    redirectWithNotice(videoId, "error", getActionErrorMessage(error));
  }
}

export async function generateSongCoverAction(formData: FormData) {
  const videoId = requireString(formData, "videoId");
  try {
    const { profile } = await assertCostlyActionAllowed();
    const artifactId = requireString(formData, "artifactId");
    const kindRaw = requireString(formData, "kind");
    if (!ALLOWED_KINDS.includes(kindRaw as SongCoverArtifactKind)) {
      throw new Error(`Unknown song-cover kind '${kindRaw}'.`);
    }
    const kind = kindRaw as SongCoverArtifactKind;

    const supabase = createSupabaseAdminClient();
    const artifact = await getSongCoverArtifactById(supabase, artifactId);
    assertArtifactBelongsToVideo(artifact, videoId);
    if (artifact!.kind !== kind) {
      throw new Error(
        `Artifact ${artifactId} has kind '${artifact!.kind}' but the form requested '${kind}'.`,
      );
    }
    if (!artifact!.prompt || artifact!.prompt.trim().length === 0) {
      throw new Error(
        `Set a prompt on this ${kind === "album_cover" ? "album cover" : "Spotify Canvas"} before generating.`,
      );
    }
    if (artifact!.status === "generating") {
      revalidateSongCoverPath(videoId);
      redirectWithNotice(
        videoId,
        "success",
        "A generation is already running for this artifact.",
      );
    }

    if (kind === "album_cover") {
      await inngest.send({
        name: INNGEST_EVENTS.songCoverGenerateRequested,
        data: {
          videoId,
          requestedByUserId: profile.id,
          isAllowlisted: true,
        },
      });
    } else {
      if (!artifact!.loopAnchorReferenceName || !artifact!.durationSeconds) {
        throw new Error(
          "Canvas needs a loop anchor and a duration before generating. Save loop settings first.",
        );
      }
      await inngest.send({
        name: INNGEST_EVENTS.songCanvasGenerateRequested,
        data: {
          videoId,
          requestedByUserId: profile.id,
          isAllowlisted: true,
        },
      });
    }

    revalidateSongCoverPath(videoId);
    redirectWithNotice(
      videoId,
      "success",
      `Generation queued. The ${kind === "album_cover" ? "album cover" : "Canvas"} will appear on this card once Runway finishes.`,
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    redirectWithNotice(videoId, "error", getActionErrorMessage(error));
  }
}

export async function uploadSongCoverManualOverrideAction(formData: FormData) {
  const videoId = requireString(formData, "videoId");
  try {
    const { profile } = await assertCostlyActionAllowed();
    const artifactId = requireString(formData, "artifactId");
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new Error("Choose a file before uploading the manual override.");
    }

    const supabase = createSupabaseAdminClient();
    const artifact = await getSongCoverArtifactById(supabase, artifactId);
    assertArtifactBelongsToVideo(artifact, videoId);

    if (artifact!.kind === "album_cover") {
      if (!file.type.startsWith("image/")) {
        throw new Error(
          `Album cover override must be an image (got ${file.type || "unknown MIME"}).`,
        );
      }
    } else if (artifact!.kind === "spotify_canvas") {
      if (!file.type.startsWith("video/")) {
        throw new Error(
          `Canvas override must be a video (got ${file.type || "unknown MIME"}).`,
        );
      }
    }

    const variantId = `manual-${Date.now().toString(36)}`;
    const mediaAsset = await persistMediaAssetFile({
      supabase,
      type:
        artifact!.kind === "album_cover"
          ? "album_cover_image"
          : "spotify_canvas_video",
      provider: "manual",
      body: file,
      videoId,
      songCoverArtifactId: artifact!.id,
      songCoverVariantId: variantId,
      mimeType: file.type,
      fileSizeBytes: file.size,
      originalFilename: file.name,
      durationSeconds:
        artifact!.kind === "spotify_canvas" ? artifact!.durationSeconds : null,
      createdBy: profile.id,
      metadata: {
        source: "manual_upload",
        songCoverArtifactId: artifact!.id,
        songCoverArtifactKind: artifact!.kind,
      },
    });

    await updateSongCoverArtifact(supabase, artifactId, {
      status: "generated",
      activeMediaAssetId: mediaAsset.id,
    });

    revalidateSongCoverPath(videoId);
    redirectWithNotice(
      videoId,
      "success",
      `${artifact!.kind === "album_cover" ? "Album cover" : "Canvas"} uploaded manually and set as active variant.`,
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    redirectWithNotice(videoId, "error", getActionErrorMessage(error));
  }
}

export async function requestSongCoverPlanFromAgentAction(formData: FormData) {
  const videoId = requireString(formData, "videoId");
  try {
    const { profile } = await assertCostlyActionAllowed();

    await inngest.send({
      name: INNGEST_EVENTS.recipeAgentMessageRequested,
      data: {
        videoId,
        stage: "publication_planning",
        message:
          "Plan the Spotify publication assets for this recipe per contracts/song-cover.md. Produce or update agent-recipes/{videoId}/song-cover-plan.json: full album cover prompt (square, mascot allowed), full Spotify Canvas prompt with explicit first-frame = last-frame loop instruction, image and optional video references (canonical names from asset_library or reference-plan.json), loop anchor reference, duration 5-8s, mascot appearance mode. Follow the spotify-publication-assets skill for direction and the Spotify guardrails.",
        requestedByUserId: profile.id,
        isAllowlisted: true,
      },
    });

    revalidateSongCoverPath(videoId);
    redirectWithNotice(
      videoId,
      "success",
      "Asked the agent to plan publication assets. The Cover & Canvas tab will populate after the next checkpoint sync.",
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    redirectWithNotice(videoId, "error", getActionErrorMessage(error));
  }
}

export async function selectSongCoverVariantAction(formData: FormData) {
  const videoId = requireString(formData, "videoId");
  try {
    await assertCostlyActionAllowed();
    const artifactId = requireString(formData, "artifactId");
    const mediaAssetId = requireString(formData, "mediaAssetId");

    const supabase = createSupabaseAdminClient();
    const artifact = await getSongCoverArtifactById(supabase, artifactId);
    assertArtifactBelongsToVideo(artifact, videoId);

    await updateSongCoverArtifact(supabase, artifactId, {
      activeMediaAssetId: mediaAssetId,
    });

    revalidateSongCoverPath(videoId);
    redirectWithNotice(videoId, "success", "Variant selected.");
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    redirectWithNotice(videoId, "error", getActionErrorMessage(error));
  }
}

function assertArtifactBelongsToVideo(
  artifact:
    | Awaited<ReturnType<typeof getSongCoverArtifactById>>
    | null,
  videoId: string,
): void {
  if (!artifact) {
    throw new Error("Song-cover artifact not found.");
  }
  if (artifact.videoId !== videoId) {
    throw new Error("Artifact does not belong to this video project.");
  }
}

function revalidateSongCoverPath(videoId: string) {
  revalidatePath(`/videos/${videoId}`);
  revalidatePath(`/videos/${videoId}/cover-and-canvas`);
}

function redirectWithNotice(
  videoId: string,
  type: "success" | "error",
  message: string,
): never {
  redirect(
    `/videos/${videoId}/cover-and-canvas?notice=${type}&message=${encodeURIComponent(
      message,
    )}`,
  );
}

function getActionErrorMessage(error: unknown) {
  if (isAuthAccessError(error)) {
    return error.code === "unauthenticated"
      ? "Authentication is required before changing publication assets."
      : "This user is not authorized to change publication assets.";
  }
  return error instanceof Error
    ? error.message
    : "Cover & Canvas action failed.";
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
