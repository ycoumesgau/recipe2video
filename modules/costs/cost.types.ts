import type { Json } from "@/shared/supabase/database.types";

export type CostProvider = "runway" | "openai" | "mux";

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
  provider: CostProvider | string;
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
  provider: CostProvider | string;
  model: string;
  operation: string;
  creditsUsed?: number | null;
  costDollars?: number | null;
  tokensInput?: number | null;
  tokensOutput?: number | null;
  metadata?: Json | null;
  createdBy?: string | null;
}

export interface CostDashboardProjectRef {
  id: string;
  title: string;
  status: string;
}

export interface CostBudgetState {
  budgetCredits: number;
  runwayCreditsUsed: number;
  creditsRemaining: number;
  percentRemaining: number;
  warningLevel: 20 | 10 | null;
  /** When false, creditsRemaining is a placeholder — configure RUNWAYML_API_SECRET. */
  runwayBalanceKnown: boolean;
}

export interface CostSummaryMetric {
  label: string;
  value: string;
  helper: string;
}

export interface CostBreakdownRow {
  key: string;
  label: string;
  provider?: string;
  model?: string;
  segmentId?: string | null;
  creditsUsed: number;
  costDollars: number;
  tokensInput: number;
  tokensOutput: number;
  logCount: number;
  failedOrRejectedCredits: number;
  failedOrRejectedCostDollars: number;
}

export interface CostDashboardData {
  scope: "global" | "project";
  projectId?: string;
  projectTitle?: string;
  logs: CostLog[];
  recentLogs: CostLog[];
  budget: CostBudgetState;
  summaryMetrics: CostSummaryMetric[];
  byProvider: CostBreakdownRow[];
  byModel: CostBreakdownRow[];
  bySegment: CostBreakdownRow[];
  failedOrRejected: CostBreakdownRow;
  providerOptions: string[];
  modelOptions: string[];
}
