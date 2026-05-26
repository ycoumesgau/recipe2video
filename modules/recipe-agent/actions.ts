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
import { getAgentRunById } from "./repositories/recipe-agent.repository";
import { syncRecipeAgentArtifactsFromGithubOnly } from "./use-cases/sync-recipe-agent-from-github";
import { describeAppliedSyncBlocks } from "./use-cases/sync-recipe-agent-artifacts";
import { switchActiveConversation } from "./use-cases/switch-active-conversation";
import {
  buildAvailableAssetsManifest,
  commitAvailableAssetsManifest,
} from "./use-cases/build-available-assets-manifest";
import {
  buildConversationBranchForSlug,
  uniqueConversationName,
  uniqueConversationSlug,
} from "./use-cases/ensure-agent-conversation";
import { buildRecipeAgentWorkspace } from "./recipe-agent.workspace";
import { slugifyConversationName } from "./agent-conversation.utils";
import {
  countAgentConversationsByVideoId,
  findSoftDeletedAgentConversationByVideoAndName,
  getActiveAgentConversationByVideoId,
  insertAgentConversation,
  listAgentConversationsByVideoId,
  renameAgentConversation,
  softDeleteAgentConversation,
  updateAgentConversation,
} from "./repositories/agent-conversations.repository";
import {
  CURSOR_AGENT_FAST_BY_MODEL,
  CURSOR_AGENT_MODEL_OPTIONS,
  DEFAULT_CURSOR_AGENT_MODEL,
  MAX_COMPLEMENTARY_AGENT_INSTRUCTIONS_LENGTH,
} from "@/modules/videos/video.constants";

export interface RecipeAgentActionState {
  kind?: "success" | "error";
  message?: string;
  conversationId?: string;
}

export async function submitRecipeAgentMessageAction(
  _previousState: RecipeAgentActionState,
  formData: FormData,
): Promise<RecipeAgentActionState> {
  try {
    const { profile } = await assertCostlyActionAllowed();
    const videoId = requireFormString(formData, "videoId");
    const supabase = createSupabaseAdminClient();
    const conversationId =
      optionalFormString(formData, "conversationId") ??
      (await resolveActiveConversationIdForVideo(supabase, videoId));
    const stage = requireRecipeAgentStage(formData);
    const message = requireFormString(formData, "message");

    if (message.length < 6) {
      throw new Error("Add a little more detail before asking the recipe agent.");
    }

    const attachmentFiles = formData
      .getAll("agentAttachments")
      .filter((value): value is File => value instanceof File && value.size > 0);

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
        conversationId,
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

export async function cancelRecipeAgentRunAction(
  _previousState: RecipeAgentActionState,
  formData: FormData,
): Promise<RecipeAgentActionState> {
  try {
    const { profile } = await assertCostlyActionAllowed();
    const videoId = requireFormString(formData, "videoId");
    const agentRunId = requireFormString(formData, "agentRunId");
    const conversationId = optionalFormString(formData, "conversationId");
    const supabase = createSupabaseAdminClient();
    const run = await getAgentRunById(supabase, agentRunId);

    if (!run || run.videoId !== videoId) {
      throw new Error("Agent run not found for this project.");
    }

    if (
      conversationId &&
      run.agentConversationId &&
      run.agentConversationId !== conversationId
    ) {
      throw new Error("Agent run does not belong to this conversation.");
    }

    await inngest.send({
      name: INNGEST_EVENTS.recipeAgentRunCancelRequested,
      data: {
        agentRunId,
        videoId,
        requestedByUserId: profile.id,
        isAllowlisted: true,
      },
    });

    revalidateProjectPaths(videoId);

    return {
      kind: "success",
      message: "Agent run cancellation requested.",
    };
  } catch (error) {
    return toActionError(error, "Unable to cancel the recipe agent run.");
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
      const applied = describeAppliedSyncBlocks(syncPlan);
      if (applied.length > 0) {
        return {
          kind: "success",
          message: `Partial Git sync: wrote ${applied.join(", ")}. Some artifacts still invalid: ${preview}${more}`,
        };
      }
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
    const conversationId =
      optionalFormString(formData, "conversationId") ??
      (await resolveActiveConversationIdForVideo(
        createSupabaseAdminClient(),
        videoId,
      ));

    await inngest.send({
      name: INNGEST_EVENTS.recipeAgentCreateRequested,
      data: {
        videoId,
        conversationId,
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

export async function switchActiveConversationAction(
  videoId: string,
  conversationId: string,
): Promise<RecipeAgentActionState> {
  try {
    await assertCostlyActionAllowed();
    const supabase = createSupabaseAdminClient();
    await switchActiveConversation({ supabase, videoId, toConversationId: conversationId });
    revalidateProjectPaths(videoId);
    return {
      kind: "success",
      message: "Active conversation switched.",
      conversationId,
    };
  } catch (error) {
    return toActionError(error, "Unable to switch agent conversation.");
  }
}

export async function createAgentConversationAction(input: {
  videoId: string;
  name: string;
  cursorAgentModel: string;
  cursorAgentReasoning?: string | null;
  customInstructions?: string | null;
  includeAssetsManifest: boolean;
}): Promise<RecipeAgentActionState> {
  try {
    const { profile } = await assertCostlyActionAllowed();
    const supabase = createSupabaseAdminClient();
    const trimmedName = input.name.trim();
    const existing = await listAgentConversationsByVideoId(supabase, input.videoId);
    const takenNames = new Set(existing.map((conversation) => conversation.name));
    const takenSlugs = new Set(existing.map((conversation) => conversation.slug));
    const workspace = buildRecipeAgentWorkspace(input.videoId);
    const model = normalizeCursorAgentModel(input.cursorAgentModel);
    const fast =
      CURSOR_AGENT_FAST_BY_MODEL[
        model as keyof typeof CURSOR_AGENT_FAST_BY_MODEL
      ] === "true";
    const customInstructions =
      input.customInstructions?.slice(
        0,
        MAX_COMPLEMENTARY_AGENT_INSTRUCTIONS_LENGTH,
      ) ?? null;

    const activeConversation = existing.find((entry) => entry.isActive);
    const manifestSourceBranch =
      activeConversation?.agentGitBranch ??
      buildConversationBranchForSlug(input.videoId, "initial");

    const softDeleted = await findSoftDeletedAgentConversationByVideoAndName(
      supabase,
      input.videoId,
      trimmedName,
    );

    let conversation: Awaited<ReturnType<typeof insertAgentConversation>>;
    if (softDeleted) {
      const branch =
        softDeleted.agentGitBranch ??
        buildConversationBranchForSlug(input.videoId, softDeleted.slug);
      conversation = await updateAgentConversation(supabase, softDeleted.id, {
        deletedAt: null,
        cursorAgentModel: model,
        cursorAgentReasoning: input.cursorAgentReasoning ?? null,
        cursorAgentFast: fast,
        customInstructions,
        includeAssetsManifest: input.includeAssetsManifest,
        isActive: false,
        agentWorkspacePath: workspace.workspacePath,
        agentGitBranch: branch,
        agentStatus: "idle",
        cursorAgentId: null,
        cursorAgentRuntime: null,
      });
    } else {
      const name = uniqueConversationName(trimmedName, takenNames);
      const slug = uniqueConversationSlug(name, takenSlugs);
      const branch = buildConversationBranchForSlug(input.videoId, slug);

      conversation = await insertAgentConversation(supabase, {
        videoId: input.videoId,
        name,
        slug,
        cursorAgentModel: model,
        cursorAgentReasoning: input.cursorAgentReasoning ?? null,
        cursorAgentFast: fast,
        customInstructions,
        includeAssetsManifest: input.includeAssetsManifest,
        isActive: false,
        agentWorkspacePath: workspace.workspacePath,
        agentGitBranch: branch,
      });
    }

    const branch =
      conversation.agentGitBranch ??
      buildConversationBranchForSlug(input.videoId, conversation.slug);

    if (input.includeAssetsManifest) {
      const manifest = await buildAvailableAssetsManifest(supabase, {
        videoId: input.videoId,
        fromConversationId: activeConversation?.id ?? null,
      });
      await commitAvailableAssetsManifest({
        videoId: input.videoId,
        branch,
        fromBranch: manifestSourceBranch,
        manifest,
      });
    }

    await switchActiveConversation({
      supabase,
      videoId: input.videoId,
      toConversationId: conversation.id,
    });

    const messageParts = [
      "Start a fresh Recipe2Video planning pass for this recipe video project.",
      "Do not reuse storyboard, segment prompts, or decisions from previous conversations.",
      "Produce or update the required planning artifacts from scratch for this conversation branch.",
      ...(input.customInstructions
        ? ["", "Creator instructions for this conversation:", input.customInstructions]
        : []),
    ];

    await inngest.send({
      name: INNGEST_EVENTS.recipeAgentMessageRequested,
      data: {
        videoId: input.videoId,
        conversationId: conversation.id,
        stage: "general",
        message: messageParts.join("\n"),
        requestedByUserId: profile.id,
        isAllowlisted: true,
        includeAssetsManifestBriefing: input.includeAssetsManifest,
      },
    });

    revalidateProjectPaths(input.videoId);

    return {
      kind: "success",
      message: "New agent conversation created and initialization queued.",
      conversationId: conversation.id,
    };
  } catch (error) {
    return toActionError(error, "Unable to create agent conversation.");
  }
}

export async function renameAgentConversationAction(
  videoId: string,
  conversationId: string,
  name: string,
): Promise<RecipeAgentActionState> {
  try {
    await assertCostlyActionAllowed();
    const supabase = createSupabaseAdminClient();
    const slug = slugifyConversationName(name);
    await renameAgentConversation(supabase, conversationId, name, slug);
    revalidateProjectPaths(videoId);
    return { kind: "success", message: "Conversation renamed." };
  } catch (error) {
    return toActionError(error, "Unable to rename conversation.");
  }
}

export async function deleteAgentConversationAction(
  videoId: string,
  conversationId: string,
): Promise<RecipeAgentActionState> {
  try {
    await assertCostlyActionAllowed();
    const supabase = createSupabaseAdminClient();
    const count = await countAgentConversationsByVideoId(supabase, videoId);
    if (count <= 1) {
      throw new Error("At least one agent conversation must remain for this video.");
    }

    await softDeleteAgentConversation(supabase, conversationId);
    const remaining = await listAgentConversationsByVideoId(supabase, videoId);
    const fallback = remaining.find((conversation) => conversation.isActive) ?? remaining[0];
    if (fallback) {
      await switchActiveConversation({
        supabase,
        videoId,
        toConversationId: fallback.id,
      });
    }

    revalidateProjectPaths(videoId);
    return { kind: "success", message: "Conversation deleted." };
  } catch (error) {
    return toActionError(error, "Unable to delete conversation.");
  }
}

export async function refreshAssetsManifestAction(
  videoId: string,
  conversationId: string,
): Promise<RecipeAgentActionState> {
  try {
    await assertCostlyActionAllowed();
    const supabase = createSupabaseAdminClient();
    const conversation = await getActiveAgentConversationByVideoId(supabase, videoId);
    const target =
      (await listAgentConversationsByVideoId(supabase, videoId)).find(
        (entry) => entry.id === conversationId,
      ) ?? conversation;

    if (!target?.agentGitBranch) {
      throw new Error("Conversation has no Git branch configured yet.");
    }

    const manifest = await buildAvailableAssetsManifest(supabase, {
      videoId,
      fromConversationId: conversation?.id ?? null,
    });
    const fromBranch =
      conversation?.agentGitBranch ??
      buildConversationBranchForSlug(videoId, "initial");
    await commitAvailableAssetsManifest({
      videoId,
      branch: target.agentGitBranch,
      fromBranch,
      manifest,
      commitMessage: `Recipe2Video: refresh available-assets manifest (${target.name})`,
    });

    revalidateProjectPaths(videoId);
    return { kind: "success", message: "Assets manifest refreshed on Git branch." };
  } catch (error) {
    return toActionError(error, "Unable to refresh assets manifest.");
  }
}

function optionalFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function resolveActiveConversationIdForVideo(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  videoId: string,
) {
  const active = await getActiveAgentConversationByVideoId(supabase, videoId);
  if (active) {
    return active.id;
  }

  const { ensureActiveAgentConversation } = await import(
    "./use-cases/ensure-agent-conversation"
  );
  const conversation = await ensureActiveAgentConversation(supabase, videoId);
  return conversation.id;
}

function normalizeCursorAgentModel(
  model: string,
): (typeof CURSOR_AGENT_MODEL_OPTIONS)[number]["value"] {
  const match = CURSOR_AGENT_MODEL_OPTIONS.find((option) => option.value === model);
  return match?.value ?? DEFAULT_CURSOR_AGENT_MODEL;
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
  revalidatePath(`/videos/${videoId}/segments`);
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
