import type { Json } from "@/shared/supabase/database.types";

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
