export interface PromptDiffLine {
  type: "unchanged" | "added" | "removed";
  text: string;
}

export interface PromptDiff {
  lines: PromptDiffLine[];
}

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
