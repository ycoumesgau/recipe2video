import type { SupabaseDataClient } from "@/shared/supabase/client.types";

import type { CostLog, CreateCostLogInput } from "./cost.types";
import {
  RUNWAY_REFERENCE_IMAGE_GENERATION_REFUNDED,
  RUNWAY_REFERENCE_IMAGE_GENERATION_STARTED,
  RUNWAY_SEGMENT_GENERATION_REFUNDED,
  RUNWAY_SEGMENT_GENERATION_STARTED,
} from "./runway-cost-operations";
import {
  listCostLogsBySegmentId,
  listCostLogsByVideoId,
  logCost,
} from "./repositories/cost.repository";

export interface RefundRunwaySegmentGenerationCostInput {
  videoId: string;
  segmentId: string;
  generationId: string;
  runwayTaskId: string;
  model: string;
  creditsToRefund: number;
  runwayTaskStatus: "FAILED" | "CANCELLED";
  createdBy?: string | null;
}

export interface RefundRunwayReferenceImageCostInput {
  videoId: string;
  referenceId: string;
  runwayTaskId: string;
  creditsToRefund: number;
  runwayTaskStatus: "FAILED" | "CANCELLED";
  createdBy?: string | null;
}

type CostLogger = (input: CreateCostLogInput) => Promise<CostLog>;

/**
 * Logs a negative credit row that cancels a prior `*_started` charge when
 * Runway terminates without billable output.
 */
export async function refundRunwaySegmentGenerationCost(
  logCostFn: CostLogger,
  input: RefundRunwaySegmentGenerationCostInput,
): Promise<CostLog | null> {
  if (input.creditsToRefund <= 0) {
    return null;
  }

  return logCostFn({
    videoId: input.videoId,
    segmentId: input.segmentId,
    provider: "runway",
    model: input.model,
    operation: RUNWAY_SEGMENT_GENERATION_REFUNDED,
    creditsUsed: -input.creditsToRefund,
    metadata: {
      generationId: input.generationId,
      runwayTaskId: input.runwayTaskId,
      runwayTaskStatus: input.runwayTaskStatus,
      generationStatus: "failed",
      refundsOperation: RUNWAY_SEGMENT_GENERATION_STARTED,
    },
    createdBy: input.createdBy ?? null,
  });
}

export async function refundRunwayReferenceImageCost(
  logCostFn: CostLogger,
  input: RefundRunwayReferenceImageCostInput,
): Promise<CostLog | null> {
  if (input.creditsToRefund <= 0) {
    return null;
  }

  return logCostFn({
    videoId: input.videoId,
    segmentId: null,
    provider: "runway",
    model: "gpt_image_2",
    operation: RUNWAY_REFERENCE_IMAGE_GENERATION_REFUNDED,
    creditsUsed: -input.creditsToRefund,
    metadata: {
      referenceId: input.referenceId,
      runwayTaskId: input.runwayTaskId,
      runwayTaskStatus: input.runwayTaskStatus,
      status: "failed",
      refundsOperation: RUNWAY_REFERENCE_IMAGE_GENERATION_STARTED,
    },
    createdBy: input.createdBy ?? null,
  });
}

export async function findRunwaySegmentGenerationStartedCredits(
  supabase: SupabaseDataClient,
  segmentId: string,
  generationId: string,
): Promise<number> {
  const logs = await listCostLogsBySegmentId(supabase, segmentId);
  const started = logs.find(
    (log) =>
      log.provider === "runway" &&
      log.operation === RUNWAY_SEGMENT_GENERATION_STARTED &&
      readMetadataString(log, "generationId") === generationId &&
      (log.creditsUsed ?? 0) > 0,
  );
  return started?.creditsUsed ?? 0;
}

export async function hasRunwayReferenceImageStartCostLog(
  supabase: SupabaseDataClient,
  videoId: string,
  referenceId: string,
  runwayTaskId: string,
): Promise<boolean> {
  const credits = await findRunwayReferenceImageStartedCredits(
    supabase,
    videoId,
    referenceId,
    runwayTaskId,
  );
  return credits > 0;
}

export async function findRunwayReferenceImageStartedCredits(
  supabase: SupabaseDataClient,
  videoId: string,
  referenceId: string,
  runwayTaskId: string,
): Promise<number> {
  const logs = await listCostLogsByVideoId(supabase, videoId);
  const started = logs.find(
    (log) =>
      log.provider === "runway" &&
      log.operation === RUNWAY_REFERENCE_IMAGE_GENERATION_STARTED &&
      readMetadataString(log, "referenceId") === referenceId &&
      readMetadataString(log, "runwayTaskId") === runwayTaskId &&
      (log.creditsUsed ?? 0) > 0,
  );
  return started?.creditsUsed ?? 0;
}

function readMetadataString(log: CostLog, key: string): string | null {
  const metadata = log.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}
