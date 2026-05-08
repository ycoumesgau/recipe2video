import type { Json } from "@/shared/supabase/database.types";

export type PromptDiff = Json;

export interface SegmentFeedback {
  id: string;
  segmentId: string;
  generationId: string;
  message: string;
  promptBefore: string;
  promptAfter: string;
  diff: PromptDiff;
  applied: boolean;
  createdBy?: string | null;
  createdAt: string;
}
