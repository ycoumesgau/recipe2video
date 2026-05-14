import type { Json } from "@/shared/supabase/database.types";

/**
 * Lifecycle phase of a cloud render orchestrated by
 * `renderAssemblyMp4InSandbox`.
 *
 * - `starting`         — sandbox `Sandbox.create` returned but no command run yet
 * - `dnf_install`      — installing AL2023 system libs (Chrome headless-shell)
 * - `npm_install`      — `npm ci` in the cloned repo
 * - `bundling`         — `@remotion/bundler` is building the composition serve URL
 * - `rendering`        — Remotion `renderMedia` is iterating frames (the only
 *                        phase where we can report a frame counter)
 * - `finalizing`       — render finished, reading the MP4 back to the orchestrator
 */
export type RenderPhase =
  | "starting"
  | "dnf_install"
  | "npm_install"
  | "bundling"
  | "rendering"
  | "finalizing";

export interface RenderProgress {
  schema: "render_progress_v1";
  phase: RenderPhase;
  /** Frames actually drawn by Chromium. Only meaningful during `rendering`. */
  renderedFrames?: number | null;
  /** Total frames to draw, set when entering `rendering`. */
  totalFrames?: number | null;
  /** Frames already encoded by ffmpeg. Trails `renderedFrames` slightly. */
  encodedFrames?: number | null;
  sandboxId?: string | null;
  /** ISO 8601 — when the orchestrator first acknowledged the sandbox. */
  sandboxStartedAt?: string | null;
  /** ISO 8601 — when Remotion `renderMedia` actually started. */
  renderStartedAt?: string | null;
  /** ISO 8601 — last time the orchestrator pushed an update. */
  updatedAt: string;
}

/** Human label for each render phase, surfaced in the UI. */
export const RENDER_PHASE_LABELS: Record<RenderPhase, string> = {
  starting: "Starting sandbox",
  dnf_install: "Installing Chrome libraries",
  npm_install: "Installing Node dependencies",
  bundling: "Bundling Remotion composition",
  rendering: "Rendering frames",
  finalizing: "Reading rendered MP4",
};

/** Approximate share of total work each phase represents, used by the UI to
 * draw a continuous progress bar even outside the `rendering` phase where we
 * have a real frame counter. Sums to 1. */
export const RENDER_PHASE_WEIGHTS: Record<RenderPhase, number> = {
  starting: 0.02,
  dnf_install: 0.08,
  npm_install: 0.2,
  bundling: 0.1,
  rendering: 0.55,
  finalizing: 0.05,
};

const PHASE_ORDER: RenderPhase[] = [
  "starting",
  "dnf_install",
  "npm_install",
  "bundling",
  "rendering",
  "finalizing",
];

/**
 * Read a {@link RenderProgress} back from the raw JSONB column. Returns null
 * for anything we don't recognize so old rows never crash the page.
 */
export function readRenderProgress(raw: unknown): RenderProgress | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (value.schema !== "render_progress_v1") return null;
  const phase = value.phase;
  if (typeof phase !== "string") return null;
  if (!PHASE_ORDER.includes(phase as RenderPhase)) return null;

  const updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : null;
  if (!updatedAt) return null;

  return {
    schema: "render_progress_v1",
    phase: phase as RenderPhase,
    renderedFrames: numericOrNull(value.renderedFrames),
    totalFrames: numericOrNull(value.totalFrames),
    encodedFrames: numericOrNull(value.encodedFrames),
    sandboxId: typeof value.sandboxId === "string" ? value.sandboxId : null,
    sandboxStartedAt:
      typeof value.sandboxStartedAt === "string"
        ? value.sandboxStartedAt
        : null,
    renderStartedAt:
      typeof value.renderStartedAt === "string" ? value.renderStartedAt : null,
    updatedAt,
  };
}

/** Serialize as JSON column value (`Json`) for Supabase writes. */
export function serializeRenderProgress(progress: RenderProgress): Json {
  return progress as unknown as Json;
}

function numericOrNull(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

export interface RenderProgressDisplay {
  /** Overall completion ratio in [0, 1]. */
  ratio: number;
  /** Same as `ratio` but rounded to an integer percent for UI labels. */
  percent: number;
  /** Estimated remaining time in seconds, or null when we cannot estimate. */
  etaSeconds: number | null;
  /** Estimated frames-per-second on the current render, or null. */
  fps: number | null;
  /** Elapsed wall-clock time since the cloud render began, in seconds. */
  elapsedSeconds: number;
  /** Whether the orchestrator stopped reporting and the row looks stale. */
  isStale: boolean;
}

const STALE_AFTER_MS = 60_000;

/**
 * Compute a UI-ready snapshot from raw {@link RenderProgress}. Pure function
 * intentionally — the component re-runs this every render against the latest
 * polled row and decides what to display.
 */
export function computeRenderProgressDisplay(
  progress: RenderProgress,
  now: Date = new Date(),
): RenderProgressDisplay {
  const phaseRatio = phaseStartRatio(progress.phase);
  const phaseWeight = RENDER_PHASE_WEIGHTS[progress.phase];
  let withinPhase = 0;
  if (
    progress.phase === "rendering" &&
    progress.totalFrames &&
    progress.totalFrames > 0 &&
    progress.renderedFrames != null
  ) {
    withinPhase = clamp(progress.renderedFrames / progress.totalFrames, 0, 1);
  }
  const ratio = clamp(phaseRatio + phaseWeight * withinPhase, 0, 1);
  const percent = Math.round(ratio * 100);

  const renderStartedAtMs = progress.renderStartedAt
    ? Date.parse(progress.renderStartedAt)
    : null;
  const sandboxStartedAtMs = progress.sandboxStartedAt
    ? Date.parse(progress.sandboxStartedAt)
    : null;
  const elapsedRefMs =
    sandboxStartedAtMs ?? renderStartedAtMs ?? Date.parse(progress.updatedAt);
  const elapsedSeconds = Math.max(0, (now.getTime() - elapsedRefMs) / 1000);

  let fps: number | null = null;
  let etaSeconds: number | null = null;
  if (
    progress.phase === "rendering" &&
    progress.renderedFrames != null &&
    progress.renderedFrames > 0 &&
    progress.totalFrames != null &&
    progress.totalFrames > 0 &&
    renderStartedAtMs != null
  ) {
    const renderElapsedSeconds = Math.max(
      0.1,
      (now.getTime() - renderStartedAtMs) / 1000,
    );
    fps = progress.renderedFrames / renderElapsedSeconds;
    const remainingFrames = Math.max(
      0,
      progress.totalFrames - progress.renderedFrames,
    );
    etaSeconds = fps > 0 ? remainingFrames / fps : null;
  }

  const isStale =
    now.getTime() - Date.parse(progress.updatedAt) > STALE_AFTER_MS;

  return { ratio, percent, etaSeconds, fps, elapsedSeconds, isStale };
}

function phaseStartRatio(phase: RenderPhase): number {
  let cumulative = 0;
  for (const candidate of PHASE_ORDER) {
    if (candidate === phase) return cumulative;
    cumulative += RENDER_PHASE_WEIGHTS[candidate];
  }
  return 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Format a duration in seconds as `mm:ss` or `h:mm:ss`. Used for both ETA and
 * elapsed time. Returns `--:--` when the input is null/NaN.
 */
export function formatDurationSeconds(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "--:--";
  const total = Math.max(0, Math.round(value));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}
