"use server";

import { revalidatePath } from "next/cache";

import {
  assertCostlyActionAllowed,
  isAuthAccessError,
} from "@/modules/auth/assert-allowlisted-user";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { createSupabaseOpenAiCostLogWriter } from "@/modules/costs/log-openai-usage";
import { generatePromptDiff } from "@/modules/feedback/generate-prompt-diff";
import type { PromptDiff, PromptEditResult } from "@/modules/feedback/feedback.types";
import {
  createSegmentFeedback,
  getSegmentFeedbackById,
  markSegmentFeedbackApplied,
} from "@/modules/feedback/repositories/feedback.repository";
import { getGenerationById } from "@/modules/generation/repositories/generation.repository";
import {
  getSegmentById,
  updateSegmentPrompt,
} from "@/modules/storyboard/repositories/segment.repository";
import { inngest } from "@/inngest/client";
import { INNGEST_EVENTS } from "@/inngest/events";

export interface SegmentFeedbackActionState {
  kind?: "success" | "error";
  message?: string;
  proposal?: {
    feedbackId: string;
    promptBefore: string;
    promptAfter: string;
    diff: PromptDiff;
  };
}

export async function submitSegmentFeedbackAction(
  _previousState: SegmentFeedbackActionState,
  formData: FormData,
): Promise<SegmentFeedbackActionState> {
  try {
    const { profile } = await assertCostlyActionAllowed();
    const videoId = requireFormString(formData, "videoId");
    const segmentId = requireFormString(formData, "segmentId");
    const generationId = requireFormString(formData, "generationId");
    const feedbackMessage = requireFormString(formData, "feedbackMessage");

    if (feedbackMessage.length < 6) {
      throw new Error("Add a little more detail before asking the agent.");
    }

    const supabase = createSupabaseAdminClient();
    const [segment, generation] = await Promise.all([
      getSegmentById(supabase, segmentId),
      getGenerationById(supabase, generationId),
    ]);

    if (!segment || segment.videoId !== videoId) {
      throw new Error("Segment not found for this video.");
    }

    if (!generation || generation.segmentId !== segment.id) {
      throw new Error("Generation not found for this segment.");
    }

    const edit = normalizePromptEditResult(
      await generatePromptDiff(
        {
          videoId,
          segmentId,
          generationId,
          promptBefore: segment.prompt,
          feedbackMessage,
          requestedByUserId: profile.id,
          isAllowlisted: true,
        },
        {
          costLogWriter: createSupabaseOpenAiCostLogWriter(supabase),
          mode: "live",
        },
      ),
      segment.prompt,
    );

    const feedback = await createSegmentFeedback(supabase, {
      segmentId,
      generationId,
      message: feedbackMessage,
      promptBefore: edit.promptBefore,
      promptAfter: edit.promptAfter,
      diff: edit.diff,
      applied: false,
      createdBy: profile.id,
    });

    revalidateSegmentReview(videoId, segmentId);

    return {
      kind: "success",
      message: "Prompt diff generated. Review it before spending Runway credits.",
      proposal: {
        feedbackId: feedback.id,
        promptBefore: edit.promptBefore,
        promptAfter: edit.promptAfter,
        diff: edit.diff,
      },
    };
  } catch (error) {
    return toActionError(error, "Unable to generate a prompt diff.");
  }
}

export async function applyPromptDiffAction(
  _previousState: SegmentFeedbackActionState,
  formData: FormData,
): Promise<SegmentFeedbackActionState> {
  try {
    const { profile } = await assertCostlyActionAllowed();
    const videoId = requireFormString(formData, "videoId");
    const segmentId = requireFormString(formData, "segmentId");
    const feedbackId = requireFormString(formData, "feedbackId");

    const supabase = createSupabaseAdminClient();
    const [feedback, segment] = await Promise.all([
      getSegmentFeedbackById(supabase, feedbackId),
      getSegmentById(supabase, segmentId),
    ]);

    if (!segment || segment.videoId !== videoId) {
      throw new Error("Segment not found for this video.");
    }

    if (!feedback || feedback.segmentId !== segment.id) {
      throw new Error("Feedback proposal not found for this segment.");
    }

    await updateSegmentPrompt(supabase, segment.id, feedback.promptAfter);
    await markSegmentFeedbackApplied(supabase, feedback.id, true);

    await inngest.send({
      name: INNGEST_EVENTS.segmentFeedbackApplyRequested,
      data: {
        segmentId: segment.id,
        generationId: feedback.generationId,
        requestedByUserId: profile.id,
        isAllowlisted: true,
      },
    });

    revalidateSegmentReview(videoId, segmentId);

    return {
      kind: "success",
      message:
        "Prompt updated. Regeneration was queued with the selected video model.",
    };
  } catch (error) {
    return toActionError(error, "Unable to apply the prompt diff.");
  }
}

export async function rejectPromptDiffAction(
  _previousState: SegmentFeedbackActionState,
  formData: FormData,
): Promise<SegmentFeedbackActionState> {
  try {
    await assertCostlyActionAllowed();
    const videoId = requireFormString(formData, "videoId");
    const segmentId = requireFormString(formData, "segmentId");
    const feedbackId = requireFormString(formData, "feedbackId");

    const supabase = createSupabaseAdminClient();
    const feedback = await getSegmentFeedbackById(supabase, feedbackId);

    if (!feedback || feedback.segmentId !== segmentId) {
      throw new Error("Feedback proposal not found for this segment.");
    }

    await markSegmentFeedbackApplied(supabase, feedback.id, false);
    revalidateSegmentReview(videoId, segmentId);

    return {
      kind: "success",
      message: "Diff rejected. The segment prompt was not changed.",
    };
  } catch (error) {
    return toActionError(error, "Unable to reject the prompt diff.");
  }
}

function normalizePromptEditResult(
  result: PromptEditResult,
  promptBefore: string,
): PromptEditResult {
  const promptAfter = result.promptAfter?.trim();

  if (!promptAfter) {
    throw new Error("OpenAI did not return a revised prompt.");
  }

  return {
    promptBefore: result.promptBefore || promptBefore,
    promptAfter,
    diff: isPromptDiff(result.diff)
      ? result.diff
      : buildLineDiff(promptBefore, promptAfter),
  };
}

function isPromptDiff(value: unknown): value is PromptDiff {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    Array.isArray((value as PromptDiff).lines) &&
    (value as PromptDiff).lines.every(
      (line) =>
        line &&
        typeof line.text === "string" &&
        (line.type === "unchanged" ||
          line.type === "added" ||
          line.type === "removed"),
    )
  );
}

function buildLineDiff(before: string, after: string): PromptDiff {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const firstChangedIndex = beforeLines.findIndex(
    (line, index) => line !== afterLines[index],
  );
  const prefixLength =
    firstChangedIndex === -1 ? beforeLines.length : firstChangedIndex;

  return {
    lines: [
      ...beforeLines
        .slice(0, prefixLength)
        .map((text) => ({ type: "unchanged" as const, text })),
      ...beforeLines
        .slice(prefixLength)
        .map((text) => ({ type: "removed" as const, text })),
      ...afterLines
        .slice(prefixLength)
        .map((text) => ({ type: "added" as const, text })),
    ],
  };
}

function requireFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing ${key}.`);
  }

  return value.trim();
}

function revalidateSegmentReview(videoId: string, segmentId: string) {
  revalidatePath(`/videos/${videoId}`);
  revalidatePath(`/videos/${videoId}/segments/${segmentId}`);
}

function toActionError(
  error: unknown,
  fallback: string,
): SegmentFeedbackActionState {
  if (isAuthAccessError(error)) {
    return {
      kind: "error",
      message:
        error.code === "unauthenticated"
          ? "Authentication is required before generating or applying prompt diffs."
          : "This user is not authorized to generate or apply prompt diffs.",
    };
  }

  return {
    kind: "error",
    message: error instanceof Error ? error.message : fallback,
  };
}
