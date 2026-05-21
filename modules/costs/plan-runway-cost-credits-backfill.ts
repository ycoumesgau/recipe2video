import type { CostLog } from "./cost.types";
import {
  HISTORICAL_FAILED_SEGMENT_REFUND_FRACTION,
  RUNWAY_REFERENCE_IMAGE_GENERATION_STARTED,
  RUNWAY_SEGMENT_GENERATION_REFUNDED,
  RUNWAY_SEGMENT_GENERATION_STARTED,
  RUNWAY_SEGMENT_GENERATION_SUCCEEDED,
} from "./runway-cost-operations";

export interface CostLogCreditsPatch {
  logId: string;
  creditsUsed: number | null;
  metadataPatch: Record<string, unknown>;
}

export interface CostLogRefundInsert {
  videoId: string;
  segmentId: string | null;
  provider: "runway";
  model: string;
  operation: string;
  creditsUsed: number;
  metadata: Record<string, unknown>;
  createdBy: string | null;
}

export interface RunwayCostCreditsBackfillPlan {
  zeroCreditsPatches: CostLogCreditsPatch[];
  refundInserts: CostLogRefundInsert[];
  skipped: Array<{ logId: string; reason: string }>;
}

export interface GenerationBillingContext {
  id: string;
  status: string;
  segmentId: string;
  videoId: string;
  model: string;
  runwayTaskId: string | null;
  triggeredBy: string | null;
}

export function planRunwayCostCreditsBackfill(input: {
  logs: CostLog[];
  generations: GenerationBillingContext[];
}): RunwayCostCreditsBackfillPlan {
  const zeroCreditsPatches: CostLogCreditsPatch[] = [];
  const refundInserts: CostLogRefundInsert[] = [];
  const skipped: Array<{ logId: string; reason: string }> = [];

  const generationById = new Map(
    input.generations.map((generation) => [generation.id, generation]),
  );

  planSeedanceDoubleCountDeduplication({
    logs: input.logs,
    zeroCreditsPatches,
    skipped,
  });

  planFailedSegmentPartialRefunds({
    logs: input.logs,
    generationById,
    refundInserts,
    skipped,
  });

  planDuplicateReferenceStartZeros({
    logs: input.logs,
    zeroCreditsPatches,
    skipped,
  });

  return { zeroCreditsPatches, refundInserts, skipped };
}

function planSeedanceDoubleCountDeduplication(input: {
  logs: CostLog[];
  zeroCreditsPatches: CostLogCreditsPatch[];
  skipped: Array<{ logId: string; reason: string }>;
}) {
  const seedanceLogs = input.logs.filter(
    (log) =>
      log.provider === "runway" &&
      (log.operation === RUNWAY_SEGMENT_GENERATION_STARTED ||
        log.operation === RUNWAY_SEGMENT_GENERATION_SUCCEEDED),
  );

  const byGenerationId = new Map<string, CostLog[]>();
  for (const log of seedanceLogs) {
    const generationId = readMetadataString(log, "generationId");
    if (!generationId) {
      input.skipped.push({ logId: log.id, reason: "seedance_missing_generation_id" });
      continue;
    }
    const group = byGenerationId.get(generationId) ?? [];
    group.push(log);
    byGenerationId.set(generationId, group);
  }

  for (const [generationId, group] of byGenerationId) {
    const started = group.filter(
      (log) =>
        log.operation === RUNWAY_SEGMENT_GENERATION_STARTED &&
        (log.creditsUsed ?? 0) > 0,
    );
    const succeeded = group.filter(
      (log) =>
        log.operation === RUNWAY_SEGMENT_GENERATION_SUCCEEDED &&
        (log.creditsUsed ?? 0) > 0,
    );

    if (started.length === 0 || succeeded.length === 0) {
      continue;
    }

    for (const log of started) {
      input.zeroCreditsPatches.push({
        logId: log.id,
        creditsUsed: 0,
        metadataPatch: {
          creditsDeduplicatedAt: new Date().toISOString(),
          creditsDeduplicatedReason: "paired_succeeded_log_bears_charge",
          pairedGenerationId: generationId,
        },
      });
    }
  }
}

function planFailedSegmentPartialRefunds(input: {
  logs: CostLog[];
  generationById: Map<string, GenerationBillingContext>;
  refundInserts: CostLogRefundInsert[];
  skipped: Array<{ logId: string; reason: string }>;
}) {
  const refundedGenerationIds = new Set(
    input.logs
      .filter((log) => log.operation === RUNWAY_SEGMENT_GENERATION_REFUNDED)
      .map((log) => readMetadataString(log, "generationId"))
      .filter((id): id is string => Boolean(id)),
  );

  for (const generation of input.generationById.values()) {
    if (generation.status !== "failed" || refundedGenerationIds.has(generation.id)) {
      continue;
    }

    const startedLogs = input.logs.filter(
      (log) =>
        log.provider === "runway" &&
        log.operation === RUNWAY_SEGMENT_GENERATION_STARTED &&
        readMetadataString(log, "generationId") === generation.id &&
        (log.creditsUsed ?? 0) > 0,
    );

    if (startedLogs.length === 0) {
      continue;
    }

    const started = startedLogs[0]!;
    const charged = started.creditsUsed ?? 0;
    const refundCredits = Math.round(
      charged * HISTORICAL_FAILED_SEGMENT_REFUND_FRACTION,
    );

    if (refundCredits <= 0) {
      input.skipped.push({
        logId: started.id,
        reason: "failed_segment_no_refund_needed",
      });
      continue;
    }

    input.refundInserts.push({
      videoId: generation.videoId,
      segmentId: generation.segmentId,
      provider: "runway",
      model: generation.model,
      operation: RUNWAY_SEGMENT_GENERATION_REFUNDED,
      creditsUsed: -refundCredits,
      metadata: {
        generationId: generation.id,
        runwayTaskId: generation.runwayTaskId,
        runwayTaskStatus: "FAILED",
        generationStatus: "failed",
        refundsOperation: RUNWAY_SEGMENT_GENERATION_STARTED,
        historicalBackfill: true,
        historicalRefundFraction: HISTORICAL_FAILED_SEGMENT_REFUND_FRACTION,
        refundedCredits: refundCredits,
        originalChargedCredits: charged,
      },
      createdBy: generation.triggeredBy,
    });
  }
}

function planDuplicateReferenceStartZeros(input: {
  logs: CostLog[];
  zeroCreditsPatches: CostLogCreditsPatch[];
  skipped: Array<{ logId: string; reason: string }>;
}) {
  const starts = input.logs
    .filter(
      (log) =>
        log.provider === "runway" &&
        log.operation === RUNWAY_REFERENCE_IMAGE_GENERATION_STARTED &&
        (log.creditsUsed ?? 0) > 0,
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const seen = new Set<string>();

  for (const log of starts) {
    const referenceId = readMetadataString(log, "referenceId");
    const runwayTaskId = readMetadataString(log, "runwayTaskId");
    if (!referenceId) {
      input.skipped.push({ logId: log.id, reason: "reference_missing_reference_id" });
      continue;
    }

    const key = `${referenceId}::${runwayTaskId ?? "no-task"}`;
    if (!seen.has(key)) {
      seen.add(key);
      continue;
    }

    input.zeroCreditsPatches.push({
      logId: log.id,
      creditsUsed: 0,
      metadataPatch: {
        creditsDeduplicatedAt: new Date().toISOString(),
        creditsDeduplicatedReason: "duplicate_reference_start_log",
        referenceId,
        runwayTaskId,
      },
    });
  }
}

function readMetadataString(log: CostLog, key: string): string | null {
  const metadata = log.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}
