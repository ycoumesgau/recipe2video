import type { Json } from "@/shared/supabase/database.types";

export interface OpenAiTokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface OpenAiCostLogInput {
  videoId: string;
  segmentId?: string | null;
  model: string;
  operation: string;
  costDollars?: number | null;
  tokensInput: number;
  tokensOutput: number;
  metadata?: Record<string, unknown> | null;
  createdBy: string;
}

export interface CostLogWriter {
  logOpenAiUsage(input: OpenAiCostLogInput): Promise<void>;
}

export const noopCostLogWriter: CostLogWriter = {
  async logOpenAiUsage() {
    // Database-backed cost logging is wired by the data access issue.
  },
};

export interface CostLog {
  id: string;
  videoId: string;
  segmentId?: string | null;
  provider: string;
  model: string;
  operation: string;
  creditsUsed?: number | null;
  costDollars?: number | null;
  tokensInput?: number | null;
  tokensOutput?: number | null;
  metadata?: Json | null;
  createdBy?: string | null;
  createdAt: string;
}

export interface CreateCostLogInput {
  videoId: string;
  segmentId?: string | null;
  provider: string;
  model: string;
  operation: string;
  creditsUsed?: number | null;
  costDollars?: number | null;
  tokensInput?: number | null;
  tokensOutput?: number | null;
  metadata?: Json | null;
  createdBy?: string | null;
}
