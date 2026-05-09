const DEFAULT_RUNWAY_CONCURRENCY = 2;
const MAX_HACKATHON_RUNWAY_CONCURRENCY = 10;

export function getWorkflowConcurrency() {
  const configured = Number(process.env.RUNWAY_GENERATION_CONCURRENCY);

  if (!Number.isFinite(configured)) {
    return DEFAULT_RUNWAY_CONCURRENCY;
  }

  return Math.min(
    MAX_HACKATHON_RUNWAY_CONCURRENCY,
    Math.max(1, Math.floor(configured)),
  );
}

export function isGenerationQueuePaused() {
  return process.env.GENERATION_QUEUE_PAUSED === "true";
}
