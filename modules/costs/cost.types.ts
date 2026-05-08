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
  metadata?: Record<string, unknown>;
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
