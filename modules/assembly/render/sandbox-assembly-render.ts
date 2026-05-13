import "server-only";

import { Writable } from "node:stream";

import { Sandbox } from "@vercel/sandbox";

import type { AssemblyRemotionProps } from "@/modules/assembly/assembly.types";

import { REMOTION_HEADLESS_SHELL_AL2023_DNF_PACKAGES } from "./remotion-headless-shell-al2023-packages";

/**
 * Repo cloned by the sandbox to render the Remotion composition. The repo is
 * public, so no credentials are required: the sandbox just does a shallow git
 * clone over HTTPS.
 *
 * See `resolveSandboxGitRevision()` for how the orchestrator picks which
 * branch / commit to clone.
 */
const REPO_URL = "https://github.com/ycoumesgau/recipe2video.git";

/** Where {@link Sandbox} clones the source — also the working dir we use. */
const WORK_ROOT = "/vercel/sandbox";

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

/**
 * Build a {@link Writable} that line-prefixes every chunk and forwards it to
 * `console.log`. Piped to `stdout` / `stderr` of long sandbox commands so the
 * orchestrator never sits on a quiet NDJSON stream (the main failure mode of
 * the previous architecture: TLS / idle disconnects during long quiet phases
 * like Remotion render).
 */
function createLogWritable(prefix: string): Writable {
  let buffer = "";
  return new Writable({
    write(chunk: Buffer, _encoding, callback) {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.length > 0) console.log(`${prefix} ${line}`);
      }
      callback();
    },
    final(callback) {
      if (buffer.length > 0) console.log(`${prefix} ${buffer}`);
      buffer = "";
      callback();
    },
  });
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
 * Renders the Remotion composition for a recipe assembly inside a fresh
 * Vercel Sandbox MicroVM and returns the resulting MP4 as a Buffer.
 *
 * ## Strategy
 *
 * 1. **Clone the repo via `source: { type: "git" }`** so the sandbox starts
 *    pre-populated with the full source — no local-to-sandbox file upload
 *    bottleneck (the previous architecture uploaded the `remotion-export/serve`
 *    bundle file-by-file from the orchestrator, which was the dominant cause
 *    of stalled / idle sandboxes in local dev and forbade ever running this
 *    on a Vercel function deployment).
 * 2. **`dnf install`** the AL2023 system libs Chrome Headless Shell needs.
 * 3. **`npm ci --omit=dev --ignore-scripts`** in the cloned repo. Skipping
 *    scripts avoids the `sqlite3` postinstall (used by `@cursor/sdk` on the
 *    web side, irrelevant for the renderer).
 * 4. **Write `props.json`** into the sandbox.
 * 5. **`node remotion-export/render.mjs`** — bundles and renders the
 *    composition in a single Node process inside the sandbox.
 * 6. **`readFileToBuffer`** the resulting MP4 and return it. The orchestrator
 *    then uploads it to Supabase Storage / Mux — the service-role key never
 *    leaves the orchestrator process.
 *
 * Every long command pipes its stdout/stderr to `console.log`. This keeps the
 * sandbox API stream "busy" (avoiding the idle TLS disconnects we saw with the
 * previous architecture) and surfaces real progress in the Inngest / Vercel
 * logs and in the Sandbox dashboard activity tab.
 */
export async function renderAssemblyMp4InSandbox(
  props: AssemblyRemotionProps,
): Promise<Buffer> {
  const revision = resolveSandboxGitRevision();
  console.log(
    `[renderAssemblyMp4InSandbox] creating sandbox source=${REPO_URL} revision=${revision}`,
  );

  const sandbox = await Sandbox.create({
    source: {
      type: "git",
      url: REPO_URL,
      revision,
      depth: 1,
    },
    runtime: "node24",
    resources: { vcpus: 4 },
    timeout: SANDBOX_TIMEOUT_MS,
  });

  const sandboxId = sandbox.sandboxId;
  const stepLog = (step: string, extra?: string) => {
    const suffix = extra ? ` ${extra}` : "";
    console.log(
      `[renderAssemblyMp4InSandbox] sandbox=${sandboxId} step=${step}${suffix}`,
    );
  };

  try {
    stepLog("sandbox_ready", `revision=${revision}`);

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

    const npmResult = await sandbox.runCommand({
      cmd: "npm",
      args: [
        "ci",
        "--omit=dev",
        "--no-audit",
        "--no-fund",
        "--ignore-scripts",
        "--prefer-offline",
      ],
      cwd: WORK_ROOT,
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

    await sandbox.writeFiles([
      {
        path: `${WORK_ROOT}/remotion-export/props.json`,
        content: Buffer.from(JSON.stringify(props), "utf8"),
      },
    ]);
    stepLog("props_written");

    const renderResult = await sandbox.runCommand({
      cmd: "node",
      args: ["remotion-export/render.mjs"],
      cwd: WORK_ROOT,
      stdout: createLogWritable(`[sandbox=${sandboxId} render]`),
      stderr: createLogWritable(`[sandbox=${sandboxId} render!]`),
    });
    if (renderResult.exitCode !== 0) {
      const err = await renderResult.stderr();
      throw new Error(
        `Sandbox Remotion render failed (exit ${renderResult.exitCode}): ${err}`,
      );
    }
    stepLog("remotion_render_done");

    const out = await sandbox.readFileToBuffer({
      path: `${WORK_ROOT}/remotion-export/out.mp4`,
    });
    if (!out || out.byteLength === 0) {
      throw new Error("Sandbox Remotion render produced an empty MP4.");
    }
    stepLog("read_mp4_done", `bytes=${out.byteLength}`);

    return Buffer.from(out);
  } finally {
    await stopSandboxBestEffort(sandbox);
  }
}
