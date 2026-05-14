import "server-only";

import { Writable } from "node:stream";

import { Sandbox } from "@vercel/sandbox";

import type { AssemblyRemotionProps } from "@/modules/assembly/assembly.types";
import type {
  RenderPhase,
  RenderProgress,
} from "@/modules/assembly/render-progress";

import { REMOTION_HEADLESS_SHELL_AL2023_DNF_PACKAGES } from "./remotion-headless-shell-al2023-packages";
import { defaultSnapshotExpirationMs } from "./sandbox-snapshot-cache";

/**
 * Repo cloned by the sandbox to render the Remotion composition. When the
 * repo is public a shallow HTTPS clone is enough; when it goes private (post
 * hackathon), the sandbox uses HTTP basic auth with a PAT — see
 * {@link resolveSandboxGitAuth}.
 *
 * Override with `COMPOSITION_RENDER_GIT_URL` if the repo ever moves.
 */
const DEFAULT_REPO_URL = "https://github.com/ycoumesgau/recipe2video.git";

/** Where {@link Sandbox} clones the source. */
const REPO_ROOT = "/vercel/sandbox";

/**
 * The renderer is a **self-contained sub-package** with a minimal lockfile
 * (`@remotion/bundler`, `@remotion/renderer`, `remotion`, `react`,
 * `react-dom`). Every long sandbox command runs with this as `cwd` so:
 *
 * - `npm ci` installs ~170 packages (1 lockfile resolved against npm) instead
 *   of the ~800 of the full app — saves ~60–90 s per cold render.
 * - `node render.mjs` resolves `@remotion/*` from the sub-package's own
 *   `node_modules/`.
 *
 * The composition entrypoint at `remotion/index.tsx` (parent dir) is read by
 * the bundler via a relative path — type-only imports from `@/modules/...`
 * are stripped by esbuild before module resolution, so the bundler never
 * touches the app code.
 */
const WORKER_ROOT = `${REPO_ROOT}/remotion-export`;

const SANDBOX_TIMEOUT_MS = 25 * 60 * 1000;

/**
 * Pick the git revision (branch / SHA / tag) the sandbox should clone:
 *
 * 1. `COMPOSITION_RENDER_GIT_REF` — explicit override (useful locally while
 *    iterating on a feature branch from the dev machine);
 * 2. `VERCEL_GIT_COMMIT_SHA` — pinned to the exact commit when running on a
 *    Vercel deployment (avoids "main moved while a render was queued" races);
 * 3. `VERCEL_GIT_COMMIT_REF` — branch name on Vercel previews when the SHA is
 *    not surfaced;
 * 4. `main` — last-resort fallback.
 */
function resolveSandboxGitRevision(): string {
  const candidates = [
    process.env.COMPOSITION_RENDER_GIT_REF,
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.VERCEL_GIT_COMMIT_REF,
  ];
  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return "main";
}

interface SandboxGitAuth {
  username: string;
  password: string;
}

/**
 * Resolve credentials for cloning a private repo from inside the sandbox.
 *
 * When `COMPOSITION_RENDER_GIT_TOKEN` is set we return `{ username, password
 * }` — the token is sent as the HTTP basic-auth password (the GitHub
 * convention for fine-grained PATs). Username defaults to `x-access-token`
 * (works with both classic and fine-grained PATs and with GitHub App tokens),
 * but can be overridden with `COMPOSITION_RENDER_GIT_USERNAME`.
 *
 * Returns `null` when no token is configured, in which case the sandbox falls
 * back to an unauthenticated public clone — which is what we want as long as
 * the repo is public (current hackathon setup).
 */
function resolveSandboxGitAuth(): SandboxGitAuth | null {
  const token = process.env.COMPOSITION_RENDER_GIT_TOKEN?.trim();
  if (!token) return null;
  const username =
    process.env.COMPOSITION_RENDER_GIT_USERNAME?.trim() || "x-access-token";
  return { username, password: token };
}

function resolveRepoUrl(): string {
  return process.env.COMPOSITION_RENDER_GIT_URL?.trim() || DEFAULT_REPO_URL;
}

/**
 * Build a {@link Writable} that line-prefixes every chunk and forwards it to
 * `console.log`. Piped to `stdout` / `stderr` of long sandbox commands so the
 * orchestrator never sits on a quiet NDJSON stream (the main failure mode of
 * the previous architecture: TLS / idle disconnects during long quiet phases
 * like Remotion render).
 *
 * Optionally invokes `onLine` for every full line received — used by the
 * render-stdout writable to scrape Remotion's progress log lines and push
 * them to the orchestrator's progress callback.
 */
function createLogWritable(
  prefix: string,
  options: { onLine?: (line: string) => void } = {},
): Writable {
  let buffer = "";
  return new Writable({
    write(chunk: Buffer, _encoding, callback) {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.length === 0) continue;
        console.log(`${prefix} ${line}`);
        options.onLine?.(line);
      }
      callback();
    },
    final(callback) {
      if (buffer.length > 0) {
        console.log(`${prefix} ${buffer}`);
        options.onLine?.(buffer);
      }
      buffer = "";
      callback();
    },
  });
}

/**
 * Parsed view of a single `render.mjs` log line. Returns null for everything
 * we do not care about — keeps the orchestrator-side state machine simple.
 *
 * We do not match `RENDER_OK` here (the orchestrator transitions out of
 * `rendering` based on the command exit code, not stdout) because the line
 * comes after some encoding lag and we want the UI to show "finalizing"
 * separately when we are reading the MP4 back.
 */
interface RenderLogEvent {
  kind: "bundle_done" | "composition_selected" | "render_progress";
  totalFrames?: number;
  renderedFrames?: number;
  encodedFrames?: number;
}

const PROGRESS_LINE_RE =
  /^\[render\] progress rendered=(\d+)\/(\d+) encoded=(\d+)/;
const COMPOSITION_LINE_RE =
  /^\[render\] composition_selected duration_frames=(\d+)/;
const BUNDLE_DONE_LINE_RE = /^\[render\] bundle_done /;

function parseRenderLogLine(line: string): RenderLogEvent | null {
  const progressMatch = line.match(PROGRESS_LINE_RE);
  if (progressMatch) {
    return {
      kind: "render_progress",
      renderedFrames: Number(progressMatch[1]),
      totalFrames: Number(progressMatch[2]),
      encodedFrames: Number(progressMatch[3]),
    };
  }
  const compositionMatch = line.match(COMPOSITION_LINE_RE);
  if (compositionMatch) {
    return {
      kind: "composition_selected",
      totalFrames: Number(compositionMatch[1]),
    };
  }
  if (BUNDLE_DONE_LINE_RE.test(line)) {
    return { kind: "bundle_done" };
  }
  return null;
}

async function stopSandboxBestEffort(sandbox: Sandbox): Promise<void> {
  try {
    await sandbox.stop({ blocking: false });
  } catch (error) {
    console.error(
      "[renderAssemblyMp4InSandbox] sandbox.stop failed:",
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Throttled progress reporter. The orchestrator hands us a callback that
 * persists a {@link RenderProgress} snapshot to Supabase. We coalesce
 * frequent updates (every ~1.5 s for frame progress, immediate for phase
 * transitions) so we do not flood Postgres with writes while the Remotion
 * renderer is busy spitting out 30+ progress lines per second.
 */
function createProgressTracker(options: {
  sandboxId: string;
  sandboxStartedAt: string;
  onProgress: (progress: RenderProgress) => Promise<void> | void;
  intervalMs?: number;
}) {
  const intervalMs = options.intervalMs ?? 1_500;
  let phase: RenderPhase = "starting";
  let renderedFrames: number | null = null;
  let totalFrames: number | null = null;
  let encodedFrames: number | null = null;
  let renderStartedAt: string | null = null;
  let lastFlushAt = 0;
  let pending: Promise<void> = Promise.resolve();

  const buildSnapshot = (): RenderProgress => ({
    schema: "render_progress_v1",
    phase,
    renderedFrames,
    totalFrames,
    encodedFrames,
    sandboxId: options.sandboxId,
    sandboxStartedAt: options.sandboxStartedAt,
    renderStartedAt,
    updatedAt: new Date().toISOString(),
  });

  const flush = async () => {
    lastFlushAt = Date.now();
    const snapshot = buildSnapshot();
    try {
      await options.onProgress(snapshot);
    } catch (error) {
      console.error(
        "[renderAssemblyMp4InSandbox] onProgress failed (ignored):",
        error instanceof Error ? error.message : error,
      );
    }
  };

  const enqueueFlush = (force: boolean) => {
    if (!force && Date.now() - lastFlushAt < intervalMs) return;
    pending = pending.then(flush);
  };

  return {
    setPhase(next: RenderPhase) {
      phase = next;
      if (next === "rendering" && !renderStartedAt) {
        renderStartedAt = new Date().toISOString();
      }
      enqueueFlush(true);
    },
    setTotalFrames(value: number) {
      totalFrames = value;
      enqueueFlush(true);
    },
    setFrameProgress(rendered: number, encoded: number) {
      renderedFrames = rendered;
      encodedFrames = encoded;
      enqueueFlush(false);
    },
    /** Wait for any in-flight DB write to settle. */
    drain() {
      return pending;
    },
  };
}

export interface SandboxSnapshotHooks {
  /**
   * Stable cache key for the current cold-install state (lockfile +
   * composition + dnf + runtime hash). When `null`, the snapshot warm-start
   * path is fully disabled — the orchestrator always cold-installs and never
   * persists a snapshot. Pre-computed on the orchestrator side because the
   * sandbox itself has no view of the orchestrator's filesystem.
   */
  cacheKey: string | null;
  /** Return a cached snapshot id for `cacheKey`, or `null` to skip. */
  findSnapshotId(cacheKey: string): Promise<string | null>;
  /** Save `snapshotId` against `cacheKey` after a successful cold render. */
  persistSnapshotId(cacheKey: string, snapshotId: string): Promise<void>;
  /**
   * Called when restoring from a cached snapshot fails (e.g. snapshot
   * deleted upstream) so the orchestrator can drop the stale row and
   * fall back to a cold render.
   */
  invalidateSnapshot(cacheKey: string): Promise<void>;
  /** Optional best-effort hook to bump `last_used_at` on a cache hit. */
  touchSnapshot?(cacheKey: string): Promise<void>;
}

export interface RenderAssemblyMp4Options {
  /**
   * Called by the orchestrator on phase changes and ~every 1.5 s during the
   * `rendering` phase. The callback is allowed to be async; we await it
   * sequentially so progress writes never reorder.
   */
  onProgress?: (progress: RenderProgress) => Promise<void> | void;
  /**
   * Plugs in the Vercel Sandbox snapshot warm-start cache. When omitted the
   * orchestrator always cold-installs (clone → dnf → npm ci) on every render.
   */
  snapshotHooks?: SandboxSnapshotHooks;
}

/**
 * Renders the Remotion composition for a recipe assembly inside a Vercel
 * Sandbox MicroVM and returns the resulting MP4 as a Buffer.
 *
 * ## Two paths into the sandbox
 *
 * **Warm-start (cache hit)** — when `snapshotHooks.findSnapshotId` returns a
 * snapshot id for the current cache key, we create the sandbox from that
 * snapshot. Everything we cold-install (cloned repo + dnf libs + npm ci of
 * the slim `remotion-export/` worker) is already present, so we jump
 * straight to writing `props.json` and running the render. Typical warm
 * start time: a few seconds before the render itself.
 *
 * **Cold-start (cache miss / first run / snapshot expired)** — we fall back
 * to:
 *   1. **Clone the repo via `source: { type: "git" }`** so the sandbox
 *      starts pre-populated with the full source.
 *   2. **`dnf install`** the AL2023 system libs Chrome Headless Shell needs.
 *   3. **`npm ci --ignore-scripts`** inside `remotion-export/` (~170
 *      packages vs ~800 of the full app).
 *
 * Then both paths converge on:
 *   4. **Write `props.json`** into `remotion-export/`.
 *   5. **`node render.mjs`** (cwd = `remotion-export/`) — bundles the parent
 *      `../remotion/index.tsx` entry and renders the composition in a single
 *      Node process. The orchestrator scrapes its stdout to surface
 *      live frame-level progress via `options.onProgress`.
 *   6. **`readFileToBuffer`** the resulting MP4 and return it.
 *
 * After a successful **cold render**, the orchestrator cleans up the
 * render-specific files and calls `sandbox.snapshot()`, then persists the
 * resulting snapshot id against the cache key for future runs.
 *
 * Every long command pipes its stdout/stderr to `console.log`. This keeps the
 * sandbox API stream "busy" (avoiding the idle TLS disconnects we saw with the
 * previous architecture) and surfaces real progress in the Inngest / Vercel
 * logs and in the Sandbox dashboard activity tab.
 */
export async function renderAssemblyMp4InSandbox(
  props: AssemblyRemotionProps,
  options: RenderAssemblyMp4Options = {},
): Promise<Buffer> {
  const hooks = options.snapshotHooks;
  const cacheKey = hooks?.cacheKey ?? null;

  let sandbox: Sandbox | null = null;
  let usedSnapshot = false;
  let cachedSnapshotId: string | null = null;

  // ---- 1. Try warm-start from snapshot ----------------------------------
  if (hooks && cacheKey) {
    try {
      cachedSnapshotId = await hooks.findSnapshotId(cacheKey);
    } catch (error) {
      console.warn(
        "[renderAssemblyMp4InSandbox] findSnapshotId failed (falling back to cold):",
        error instanceof Error ? error.message : error,
      );
    }
    if (cachedSnapshotId) {
      try {
        console.log(
          `[renderAssemblyMp4InSandbox] creating sandbox source=snapshot snapshotId=${cachedSnapshotId} cacheKey=${cacheKey.slice(0, 12)}…`,
        );
        sandbox = await Sandbox.create({
          source: { type: "snapshot", snapshotId: cachedSnapshotId },
          resources: { vcpus: 4 },
          timeout: SANDBOX_TIMEOUT_MS,
        });
        usedSnapshot = true;
      } catch (error) {
        console.warn(
          `[renderAssemblyMp4InSandbox] snapshot ${cachedSnapshotId} unusable, invalidating and falling back to cold:`,
          error instanceof Error ? error.message : error,
        );
        await hooks
          .invalidateSnapshot(cacheKey)
          .catch((invalidateError) =>
            console.warn(
              "[renderAssemblyMp4InSandbox] invalidateSnapshot failed (ignored):",
              invalidateError instanceof Error
                ? invalidateError.message
                : invalidateError,
            ),
          );
      }
    }
  }

  // ---- 2. Cold-start from git source if the warm path did not give us a VM
  if (!sandbox) {
    const repoUrl = resolveRepoUrl();
    const revision = resolveSandboxGitRevision();
    const auth = resolveSandboxGitAuth();
    console.log(
      `[renderAssemblyMp4InSandbox] creating sandbox source=${repoUrl} revision=${revision} auth=${auth ? "pat" : "public"} cacheKey=${cacheKey ? cacheKey.slice(0, 12) + "…" : "none"}`,
    );

    const baseSource = {
      type: "git" as const,
      url: repoUrl,
      revision,
      depth: 1,
    };
    const gitSource = auth
      ? { ...baseSource, username: auth.username, password: auth.password }
      : baseSource;

    sandbox = await Sandbox.create({
      source: gitSource,
      runtime: "node24",
      resources: { vcpus: 4 },
      timeout: SANDBOX_TIMEOUT_MS,
    });
  }

  const sandboxId = sandbox.sandboxId;
  const sandboxStartedAt = new Date().toISOString();
  const tracker = createProgressTracker({
    sandboxId,
    sandboxStartedAt,
    onProgress: options.onProgress ?? (() => undefined),
  });

  const stepLog = (step: string, extra?: string) => {
    const suffix = extra ? ` ${extra}` : "";
    console.log(
      `[renderAssemblyMp4InSandbox] sandbox=${sandboxId} step=${step}${suffix}`,
    );
  };

  // When we snapshot the sandbox to persist the warm-start state, `snapshot()`
  // stops the VM as part of its lifecycle, so we must NOT call our own
  // `stopSandboxBestEffort` in the finally block. This flag tracks whether
  // snapshot() has already taken responsibility for stopping the sandbox.
  let stoppedBySnapshot = false;

  try {
    stepLog(
      "sandbox_ready",
      usedSnapshot
        ? `path=warm snapshotId=${cachedSnapshotId}`
        : "path=cold",
    );
    tracker.setPhase("starting");

    if (!usedSnapshot) {
      tracker.setPhase("dnf_install");
      const dnfResult = await sandbox.runCommand({
        cmd: "dnf",
        args: [
          "install",
          "-y",
          "--setopt=install_weak_deps=False",
          ...REMOTION_HEADLESS_SHELL_AL2023_DNF_PACKAGES,
        ],
        sudo: true,
        stdout: createLogWritable(`[sandbox=${sandboxId} dnf]`),
        stderr: createLogWritable(`[sandbox=${sandboxId} dnf!]`),
      });
      if (dnfResult.exitCode !== 0) {
        const err = await dnfResult.stderr();
        throw new Error(
          `Sandbox dnf install (Remotion / Chrome libs) failed (exit ${dnfResult.exitCode}): ${err}`,
        );
      }
      stepLog("dnf_done");

      tracker.setPhase("npm_install");
      const npmResult = await sandbox.runCommand({
        cmd: "npm",
        args: [
          "ci",
          "--no-audit",
          "--no-fund",
          "--ignore-scripts",
          "--prefer-offline",
        ],
        cwd: WORKER_ROOT,
        stdout: createLogWritable(`[sandbox=${sandboxId} npm]`),
        stderr: createLogWritable(`[sandbox=${sandboxId} npm!]`),
      });
      if (npmResult.exitCode !== 0) {
        const err = await npmResult.stderr();
        throw new Error(
          `Sandbox npm ci failed (exit ${npmResult.exitCode}): ${err}`,
        );
      }
      stepLog("npm_install_done");
    } else {
      stepLog("warm_start_skip_install");
      // Best-effort: bump last_used_at so we can later age out snapshots
      // that have not been touched in a long time.
      if (hooks && cacheKey && hooks.touchSnapshot) {
        await hooks.touchSnapshot(cacheKey).catch(() => undefined);
      }
    }

    await sandbox.writeFiles([
      {
        path: `${WORKER_ROOT}/props.json`,
        content: Buffer.from(JSON.stringify(props), "utf8"),
      },
    ]);
    stepLog("props_written");

    // The render command alternates through three sub-phases inside one
    // Node process (bundle → composition select → render). We scrape its
    // stdout to advance the orchestrator-side phase machine in real time.
    tracker.setPhase("bundling");
    const renderResult = await sandbox.runCommand({
      cmd: "node",
      args: ["render.mjs"],
      cwd: WORKER_ROOT,
      stdout: createLogWritable(`[sandbox=${sandboxId} render]`, {
        onLine: (line) => {
          const event = parseRenderLogLine(line);
          if (!event) return;
          if (event.kind === "bundle_done") {
            // Stay in `bundling` until composition_selected — gives the UI
            // a smoother transition than flipping straight to `rendering`.
          } else if (event.kind === "composition_selected") {
            if (event.totalFrames != null) {
              tracker.setTotalFrames(event.totalFrames);
            }
            tracker.setPhase("rendering");
          } else if (event.kind === "render_progress") {
            if (event.totalFrames != null) {
              tracker.setTotalFrames(event.totalFrames);
            }
            if (
              event.renderedFrames != null &&
              event.encodedFrames != null
            ) {
              tracker.setFrameProgress(
                event.renderedFrames,
                event.encodedFrames,
              );
            }
          }
        },
      }),
      stderr: createLogWritable(`[sandbox=${sandboxId} render!]`),
    });
    if (renderResult.exitCode !== 0) {
      const err = await renderResult.stderr();
      throw new Error(
        `Sandbox Remotion render failed (exit ${renderResult.exitCode}): ${err}`,
      );
    }
    stepLog("remotion_render_done");

    tracker.setPhase("finalizing");
    const out = await sandbox.readFileToBuffer({
      path: `${WORKER_ROOT}/out.mp4`,
    });
    if (!out || out.byteLength === 0) {
      throw new Error("Sandbox Remotion render produced an empty MP4.");
    }
    stepLog("read_mp4_done", `bytes=${out.byteLength}`);

    await tracker.drain();

    // ---- 3. Persist warm-start snapshot after a successful cold render ----
    // We only snapshot on the cold path: warm renders started from a snapshot
    // already point at the same cache key, so re-snapshotting them would
    // double-charge sandbox compute without adding value.
    if (
      !usedSnapshot &&
      hooks &&
      cacheKey &&
      process.env.COMPOSITION_RENDER_DISABLE_SNAPSHOT_CACHE !== "1"
    ) {
      try {
        // Strip render-specific artefacts so the snapshot only contains the
        // cold-install filesystem. `--force` so a missing file does not
        // abort the cleanup (defensive — these were just written above).
        await sandbox.runCommand({
          cmd: "rm",
          args: ["-f", `${WORKER_ROOT}/props.json`, `${WORKER_ROOT}/out.mp4`],
        });
        stepLog("snapshot_pre_cleanup_done");

        const snapshot = await sandbox.snapshot({
          expiration: defaultSnapshotExpirationMs(),
        });
        stoppedBySnapshot = true;
        stepLog("snapshot_taken", `snapshotId=${snapshot.snapshotId}`);

        await hooks.persistSnapshotId(cacheKey, snapshot.snapshotId);
        stepLog("snapshot_persisted");
      } catch (error) {
        // Never fail a successful render because the snapshot side
        // misbehaved — the user already has their MP4 and warm-start is just
        // an optimisation.
        console.error(
          "[renderAssemblyMp4InSandbox] snapshot persistence failed (ignored):",
          error instanceof Error ? error.message : error,
        );
      }
    }

    return Buffer.from(out);
  } finally {
    await tracker.drain().catch(() => undefined);
    if (sandbox && !stoppedBySnapshot) {
      await stopSandboxBestEffort(sandbox);
    }
  }
}
