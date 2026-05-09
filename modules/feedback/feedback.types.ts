import type { Json } from "@/shared/supabase/database.types";

export interface PromptDiffLine {
  type: "unchanged" | "added" | "removed";
  text: string;
}

export interface PromptDiff {
  lines: PromptDiffLine[];
}

export type StoredPromptDiff = PromptDiff | Json;

export interface PromptEditInput {
  videoId: string;
  segmentId: string;
  generationId: string;
  promptBefore: string;
  feedbackMessage: string;
  requestedByUserId: string;
  isAllowlisted: boolean;
}

export interface PromptEditResult {
  promptBefore: string;
  promptAfter: string;
  diff: PromptDiff;
}

export interface CreateSegmentFeedbackInput {
  segmentId: string;
  generationId: string;
  message: string;
  promptBefore: string;
  promptAfter: string;
  diff: PromptDiff;
  applied?: boolean;
  createdBy?: string | null;
}

export interface SegmentFeedback {
  id: string;
  segmentId: string;
  generationId: string;
  message: string;
  promptBefore: string;
  promptAfter: string;
  diff: StoredPromptDiff;
  applied: boolean;
  createdBy?: string | null;
  createdAt: string;
}
