import { getCurrentProfile } from "@/modules/auth/assert-allowlisted-user";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { persistMediaAssetFile } from "@/modules/media-assets/use-cases/persist-media-asset";
import { persistAgentMessageAttachments } from "@/modules/media-assets/use-cases/persist-agent-message-attachments";
import {
  CURSOR_AGENT_DEFAULT_REASONING_BY_MODEL,
  CURSOR_AGENT_FAST_BY_MODEL,
  CURSOR_AGENT_MODEL_OPTIONS,
  CURSOR_AGENT_REASONING_OPTIONS,
  DEFAULT_CURSOR_AGENT_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_SFX_MODEL,
  DEFAULT_TTS_MODEL,
  DEFAULT_VIDEO_MODEL,
  MAX_COMPLEMENTARY_AGENT_INSTRUCTIONS_LENGTH,
  MAX_RECIPE_SOURCE_FILE_SIZE_BYTES,
  MAX_VIDEO_TITLE_LENGTH,
} from "@/modules/videos/video.constants";
import {
  archiveAllActiveVideoProjects,
  createVideoProject,
  getNextRecipeNumber,
} from "@/modules/videos/repositories/video.repository";
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
import {
  buildConversationBranchForSlug,
  resolveConversationDefaultsFromProject,
} from "@/modules/recipe-agent/use-cases/ensure-agent-conversation";
import { buildRecipeAgentWorkspace } from "@/modules/recipe-agent/recipe-agent.workspace";
import { insertAgentConversation } from "@/modules/recipe-agent/repositories/agent-conversations.repository";

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
  cursorAgentModel?: string;
  cursorAgentReasoning?: string;
  intent?: CreateVideoDraftIntent;
  /** Optional notes appended to the first recipe agent message when analyzing on create. */
  complementaryAgentInstructions?: string;
  /** Optional vision images for the first agent turn (Cursor SDK). */
  complementaryAgentAttachmentFiles?: File[];
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
  const complementaryAgentInstructions = normalizeOptionalText(
    input.complementaryAgentInstructions,
  )?.slice(0, MAX_COMPLEMENTARY_AGENT_INSTRUCTIONS_LENGTH);
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
    targetDurationSeconds: input.targetDurationSeconds,
    stylePreset: input.stylePreset ?? "asmr_food",
    videoModel: input.selectedVideoModel ?? DEFAULT_VIDEO_MODEL,
    imageModel: input.selectedImageModel ?? DEFAULT_IMAGE_MODEL,
    ttsModel: input.selectedTtsModel ?? DEFAULT_TTS_MODEL,
    sfxModel: input.selectedSfxModel ?? DEFAULT_SFX_MODEL,
    ...resolveCursorAgentDefaults({
      model: input.cursorAgentModel,
      reasoning: input.cursorAgentReasoning,
    }),
  };
  const title =
    manualTitle ??
    buildDraftTitle({ recipeUrl, pastedRecipeText, demoRecipeId });

  const recipeNumber = await getNextRecipeNumber(supabase);
  await archiveAllActiveVideoProjects(supabase);

  const project = await createVideoProject(supabase, {
    title,
    recipeNumber,
    slug: buildSlug(title, draftId),
    recipeUrl: recipeUrl ?? null,
    recipeData: {
      source: sourceSummary,
      productionDefaults,
      recipeExtractionRequested: false,
      agentPlanningRequested: intent === "analyze" && sourceSummary.type !== "demo",
      planningSource: "cursor_recipe_agent",
      ...(complementaryAgentInstructions
        ? { complementaryAgentInstructions }
        : {}),
    },
    selectedVideoModel: productionDefaults.videoModel,
    selectedImageModel: productionDefaults.imageModel,
    selectedTtsModel: productionDefaults.ttsModel,
    selectedSfxModel: productionDefaults.sfxModel,
    createdBy: profile.id,
  });

  const conversationDefaults = resolveConversationDefaultsFromProject(project);
  const workspace = buildRecipeAgentWorkspace(project.id);
  const initialConversation = await insertAgentConversation(supabase, {
    videoId: project.id,
    name: "Initial",
    slug: "initial",
    cursorAgentModel: conversationDefaults.model,
    cursorAgentReasoning: conversationDefaults.reasoning,
    cursorAgentFast: conversationDefaults.fast,
    customInstructions: complementaryAgentInstructions ?? null,
    includeAssetsManifest: false,
    isActive: true,
    agentWorkspacePath: workspace.workspacePath,
    agentGitBranch: buildConversationBranchForSlug(project.id, "initial"),
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

  const complementaryAttachments = await persistAgentMessageAttachments({
    supabase,
    videoId: project.id,
    files: input.complementaryAgentAttachmentFiles ?? [],
    createdBy: profile.id,
  });

  // Trigger the persistent recipe-agent workflow for url, photos, and text
  // sources. Demo fixtures keep their dedicated load action and do not need
  // Cursor/OpenAI.
  const agentPayload = buildRecipeAgentMessagePayload({
    videoId: project.id,
    conversationId: initialConversation.id,
    profileId: profile.id,
    sourceSummary,
    productionDefaults,
    pastedRecipeText,
    intent,
    complementaryAgentInstructions,
    attachmentMediaAssetIds: complementaryAttachments.map((asset) => asset.id),
    complementaryAttachmentFileNames: complementaryAttachments.map(
      (asset) => asset.originalFilename ?? "image",
    ),
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

function resolveCursorAgentDefaults(input: {
  model?: string;
  reasoning?: string;
}): Pick<
  VideoProductionDefaults,
  "cursorAgentModel" | "cursorAgentReasoning" | "cursorAgentFast"
> {
  const allowedModels = new Set<string>(
    CURSOR_AGENT_MODEL_OPTIONS.map((option) => option.value),
  );
  const model = allowedModels.has(input.model ?? "")
    ? (input.model as string)
    : DEFAULT_CURSOR_AGENT_MODEL;

  const modelReasoningOptions =
    CURSOR_AGENT_REASONING_OPTIONS[
      model as keyof typeof CURSOR_AGENT_REASONING_OPTIONS
    ] ?? [];
  const allowedReasoning = new Set<string>(
    modelReasoningOptions.map((option) => option.value),
  );
  const configuredDefaultReasoning =
    CURSOR_AGENT_DEFAULT_REASONING_BY_MODEL[
      model as keyof typeof CURSOR_AGENT_DEFAULT_REASONING_BY_MODEL
    ];
  const fallbackReasoning =
    modelReasoningOptions.find(
      (option) => option.value === configuredDefaultReasoning,
    )?.value ?? modelReasoningOptions[0]?.value;
  const reasoning = allowedReasoning.has(input.reasoning ?? "")
    ? (input.reasoning as string)
    : fallbackReasoning;
  const fastMode =
    CURSOR_AGENT_FAST_BY_MODEL[model as keyof typeof CURSOR_AGENT_FAST_BY_MODEL] ??
    "false";

  return {
    cursorAgentModel: model,
    cursorAgentReasoning: modelReasoningOptions.length === 0 ? undefined : reasoning,
    cursorAgentFast: fastMode,
  };
}
