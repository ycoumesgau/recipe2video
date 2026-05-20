import {
  RUNWAY_RECIPE_REFERENCE_IMAGE_RATIO,
  estimateGptImage2Credits,
} from "@/modules/generation/runway.constants";

import type { CostLog } from "./cost.types";

/** Operations that should carry `credits_used` in totals (one per Runway task). */
export const GPT_IMAGE_CREDIT_BEARING_OPERATIONS = new Set([
  "reference_image_generation_started",
  "album_cover_generation_started",
  "reference_image_generated",
  "reference_image_generation_recovered",
  "album_cover_generation_recovered",
]);

/** Audit-only rows: only backfill when no matching credit-bearing row exists. */
export const GPT_IMAGE_AUDIT_ONLY_OPERATIONS = new Set([
  "reference_image_generation_succeeded",
  "album_cover_generation_succeeded",
]);

export interface GptImageCostBackfillCandidate {
  logId: string;
  videoId: string;
  operation: string;
  ratio: string;
  creditsUsed: number;
  metadataPatch: Record<string, unknown>;
}

export interface GptImageCostBackfillPlan {
  candidates: GptImageCostBackfillCandidate[];
  skipped: Array<{ logId: string; reason: string }>;
}

export function planGptImageCostCreditsBackfill(
  logs: CostLog[],
): GptImageCostBackfillPlan {
  const runwayGptLogs = logs.filter(
    (log) =>
      log.provider === "runway" &&
      log.model === "gpt_image_2" &&
      (log.creditsUsed === null || log.creditsUsed === undefined),
  );

  const creditBearingTaskIds = new Set(
    runwayGptLogs
      .filter((log) => GPT_IMAGE_CREDIT_BEARING_OPERATIONS.has(log.operation))
      .map((log) => readRunwayTaskId(log))
      .filter((taskId): taskId is string => Boolean(taskId)),
  );

  const candidates: GptImageCostBackfillCandidate[] = [];
  const skipped: Array<{ logId: string; reason: string }> = [];

  for (const log of runwayGptLogs) {
    if (GPT_IMAGE_CREDIT_BEARING_OPERATIONS.has(log.operation)) {
      const ratio = resolveGptImageRatio(log);
      const creditsUsed = estimateGptImage2Credits(ratio);
      candidates.push({
        logId: log.id,
        videoId: log.videoId,
        operation: log.operation,
        ratio,
        creditsUsed,
        metadataPatch: buildBackfillMetadataPatch(log, ratio, creditsUsed),
      });
      continue;
    }

    if (GPT_IMAGE_AUDIT_ONLY_OPERATIONS.has(log.operation)) {
      const taskId = readRunwayTaskId(log);
      if (taskId && creditBearingTaskIds.has(taskId)) {
        skipped.push({
          logId: log.id,
          reason: "paired_started_log_exists",
        });
        continue;
      }

      const ratio = resolveGptImageRatio(log);
      const creditsUsed = estimateGptImage2Credits(ratio);
      candidates.push({
        logId: log.id,
        videoId: log.videoId,
        operation: log.operation,
        ratio,
        creditsUsed,
        metadataPatch: buildBackfillMetadataPatch(log, ratio, creditsUsed),
      });
      continue;
    }

    skipped.push({
      logId: log.id,
      reason: "unknown_operation",
    });
  }

  return { candidates, skipped };
}

export function resolveGptImageRatio(log: CostLog): string {
  const metadataRatio = readMetadataString(log, "ratio");
  if (metadataRatio) {
    return metadataRatio;
  }

  const ratioAttempts = readMetadataStringArray(log, "ratioAttempts");
  if (ratioAttempts.length > 0) {
    return ratioAttempts[ratioAttempts.length - 1]!;
  }

  if (log.operation.startsWith("album_cover")) {
    return "2048:2048";
  }

  return RUNWAY_RECIPE_REFERENCE_IMAGE_RATIO;
}

function buildBackfillMetadataPatch(
  log: CostLog,
  ratio: string,
  creditsUsed: number,
): Record<string, unknown> {
  const base =
    log.metadata && typeof log.metadata === "object" && !Array.isArray(log.metadata)
      ? { ...(log.metadata as Record<string, unknown>) }
      : {};

  return {
    ...base,
    estimated: true,
    ratio,
    estimatedCredits: creditsUsed,
    creditsBackfilledAt: new Date().toISOString(),
  };
}

function readRunwayTaskId(log: CostLog): string | null {
  return readMetadataString(log, "runwayTaskId");
}

function readMetadataString(log: CostLog, key: string): string | null {
  const value = readMetadataValue(log, key);
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readMetadataStringArray(log: CostLog, key: string): string[] {
  const value = readMetadataValue(log, key);
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function readMetadataValue(log: CostLog, key: string): unknown {
  const metadata = log.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  return (metadata as Record<string, unknown>)[key];
}
