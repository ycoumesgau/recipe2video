import { getCurrentProfile } from "@/modules/auth/assert-allowlisted-user";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { persistMediaAssetFile } from "@/modules/media-assets/use-cases/persist-media-asset";
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_SFX_MODEL,
  DEFAULT_TTS_MODEL,
  DEFAULT_VIDEO_MODEL,
  MAX_RECIPE_SOURCE_FILE_SIZE_BYTES,
  MAX_VIDEO_TITLE_LENGTH,
} from "@/modules/videos/video.constants";
import { createVideoProject } from "@/modules/videos/repositories/video.repository";
import type {
  RecipeSourceSummary,
  VideoProductionDefaults,
} from "@/modules/videos/video.types";
import { inngest } from "@/inngest/client";
import { INNGEST_EVENTS } from "@/inngest/events";
import {
  buildRecipeAgentMessagePayload,
  type CreateVideoDraftIntent,
} from "./create-video-agent-message";

export interface CreateVideoDraftInput {
  /** When non-empty after trim, used as `videos.title` instead of `buildDraftTitle`. */
  recipeTitle?: string;
  recipeUrl?: string;
  pastedRecipeText?: string;
  demoRecipeId?: string;
  sourceFiles: File[];
  targetDurationSeconds?: number;
  stylePreset?: string;
  selectedVideoModel?: string;
  selectedImageModel?: string;
  selectedTtsModel?: string;
  selectedSfxModel?: string;
  intent?: CreateVideoDraftIntent;
}

export interface CreateVideoDraftResult {
  videoId: string;
}

export async function createVideoDraft(
  input: CreateVideoDraftInput
): Promise<CreateVideoDraftResult> {
  const manualTitle = normalizeOptionalText(input.recipeTitle)?.slice(
    0,
    MAX_VIDEO_TITLE_LENGTH,
  );
  const recipeUrl = normalizeOptionalText(input.recipeUrl);
  const pastedRecipeText = normalizeOptionalText(input.pastedRecipeText);
  const demoRecipeId = normalizeOptionalText(input.demoRecipeId);
  const sourceFiles = input.sourceFiles.filter(isRealFile);
  const intent = input.intent ?? "analyze";

  assertAtLeastOneRecipeSource({
    recipeUrl,
    pastedRecipeText,
    demoRecipeId,
    sourceFiles,
  });
  assertRecipeSourceFiles(sourceFiles);

  const profile = await getCurrentProfile();
  if (!profile) {
    throw new Error("Authentication is required to create a video draft.");
  }

  const supabase = createSupabaseAdminClient();
  const draftId = crypto.randomUUID();
  const sourceSummary = buildSourceSummary({
    recipeUrl,
    pastedRecipeText,
    demoRecipeId,
    sourceFiles,
  });
  const productionDefaults: VideoProductionDefaults = {
    targetDurationSeconds: input.targetDurationSeconds ?? 60,
    stylePreset: input.stylePreset ?? "asmr_food",
    videoModel: input.selectedVideoModel ?? DEFAULT_VIDEO_MODEL,
    imageModel: input.selectedImageModel ?? DEFAULT_IMAGE_MODEL,
    ttsModel: input.selectedTtsModel ?? DEFAULT_TTS_MODEL,
    sfxModel: input.selectedSfxModel ?? DEFAULT_SFX_MODEL,
  };
  const title =
    manualTitle ??
    buildDraftTitle({ recipeUrl, pastedRecipeText, demoRecipeId });

  const project = await createVideoProject(supabase, {
    title,
    slug: buildSlug(title, draftId),
    recipeUrl: recipeUrl ?? null,
    recipeData: {
      source: sourceSummary,
      productionDefaults,
      recipeExtractionRequested: false,
      agentPlanningRequested: intent === "analyze" && sourceSummary.type !== "demo",
      planningSource: "cursor_recipe_agent",
    },
    selectedVideoModel: productionDefaults.videoModel,
    selectedImageModel: productionDefaults.imageModel,
    selectedTtsModel: productionDefaults.ttsModel,
    selectedSfxModel: productionDefaults.sfxModel,
    createdBy: profile.id,
  });

  for (const [index, file] of sourceFiles.entries()) {
    await persistMediaAssetFile({
      supabase,
      type: "recipe_source",
      body: file,
      videoId: project.id,
      storageFilename: `${Date.now()}-${index}-${sanitizeFileName(file.name)}`,
      originalFilename: file.name,
      mimeType: file.type || null,
      fileSizeBytes: file.size,
      createdBy: profile.id,
    });
  }

  // Trigger the persistent recipe-agent workflow for url, photos, and text
  // sources. Demo fixtures keep their dedicated load action and do not need
  // Cursor/OpenAI.
  const agentPayload = buildRecipeAgentMessagePayload({
    videoId: project.id,
    profileId: profile.id,
    sourceSummary,
    productionDefaults,
    pastedRecipeText,
    intent,
  });
  if (agentPayload) {
    await inngest.send({
      name: INNGEST_EVENTS.recipeAgentMessageRequested,
      data: agentPayload,
    });
  }

  return { videoId: project.id };
}

function normalizeOptionalText(value: FormDataEntryValue | string | undefined) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isRealFile(value: File) {
  return value.size > 0 && value.name.length > 0;
}

function assertAtLeastOneRecipeSource(input: {
  recipeUrl?: string;
  pastedRecipeText?: string;
  demoRecipeId?: string;
  sourceFiles: File[];
}) {
  if (
    !input.recipeUrl &&
    !input.pastedRecipeText &&
    !input.demoRecipeId &&
    input.sourceFiles.length === 0
  ) {
    throw new Error(
      "Add at least one recipe source: URL, photos, pasted text, or demo recipe."
    );
  }
}

function assertRecipeSourceFiles(files: File[]) {
  const oversizedFile = files.find(
    (file) => file.size > MAX_RECIPE_SOURCE_FILE_SIZE_BYTES
  );

  if (oversizedFile) {
    throw new Error(
      `${oversizedFile.name} is too large. Keep recipe source photos under 16 MB.`
    );
  }
}

function buildSourceSummary(input: {
  recipeUrl?: string;
  pastedRecipeText?: string;
  demoRecipeId?: string;
  sourceFiles: File[];
}): RecipeSourceSummary {
  if (input.sourceFiles.length > 0) {
    return {
      type: "photos",
      recipeUrl: input.recipeUrl ?? null,
      pastedTextPreview: input.pastedRecipeText?.slice(0, 240) ?? null,
      demoRecipeId: input.demoRecipeId ?? null,
      uploadedFileNames: input.sourceFiles.map((file) => file.name),
    };
  }

  if (input.recipeUrl) {
    return {
      type: "url",
      recipeUrl: input.recipeUrl,
      pastedTextPreview: input.pastedRecipeText?.slice(0, 240) ?? null,
      demoRecipeId: input.demoRecipeId ?? null,
      uploadedFileNames: [],
    };
  }

  if (input.pastedRecipeText) {
    return {
      type: "text",
      recipeUrl: null,
      pastedTextPreview: input.pastedRecipeText.slice(0, 240),
      demoRecipeId: input.demoRecipeId ?? null,
      uploadedFileNames: [],
    };
  }

  return {
    type: "demo",
    recipeUrl: null,
    pastedTextPreview: null,
    demoRecipeId: input.demoRecipeId ?? null,
    uploadedFileNames: [],
  };
}

function buildDraftTitle(input: {
  recipeUrl?: string;
  pastedRecipeText?: string;
  demoRecipeId?: string;
}) {
  if (input.demoRecipeId === "paris-brest") {
    return "Paris-Brest recipe video";
  }

  if (input.recipeUrl) {
    try {
      const hostname = new URL(input.recipeUrl).hostname.replace(/^www\./, "");
      return `Recipe from ${hostname}`;
    } catch {
      return "Recipe URL draft";
    }
  }

  if (input.pastedRecipeText) {
    const firstLine = input.pastedRecipeText
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean);

    if (firstLine) {
      return firstLine.slice(0, 80);
    }
  }

  return "Untitled recipe video";
}

function buildSlug(title: string, videoId: string) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return `${base || "recipe-video"}-${videoId.slice(0, 8)}`;
}

function sanitizeFileName(fileName: string) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}
