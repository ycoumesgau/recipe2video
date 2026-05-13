import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { Sandbox } from "@vercel/sandbox";

import type { AssemblyRemotionProps } from "@/modules/assembly/assembly.types";

import { copyLocalDirToSandbox } from "./copy-local-dir-to-sandbox";
import { REMOTION_HEADLESS_SHELL_AL2023_DNF_PACKAGES } from "./remotion-headless-shell-al2023-packages";
import {
  runBlockingMkdirP,
  waitForDetachedSandboxCommandUntil,
} from "./wait-for-detached-sandbox-command";

const WORK_ROOT = "/vercel/sandbox/recipe2video-export";

/** Shared orchestrator deadline (slightly under the VM `Sandbox.create` timeout). */
const ORCHESTRATOR_DEADLINE_BUFFER_MS = 24 * 60 * 1000;

async function stopSandboxBestEffort(sandbox: Sandbox): Promise<void> {
  const errors: unknown[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await sandbox.stop({ blocking: true });
      return;
    } catch (error) {
      errors.push(error);
      await delay(2000);
    }
  }
  console.error(
    "[renderAssemblyMp4InSandbox] sandbox.stop failed after retries:",
    errors,
  );
}

/**
 * Runs the pre-built Remotion bundle (`remotion-export/serve` from `npm run
 * build`) inside a Vercel Sandbox: `dnf install` for Chrome Headless Shell
 * libs (Amazon Linux 2023), `npm install` for renderer deps, then
 * `render.mjs`. Long commands use **detached** execution plus polling so the
 * Sandbox API is not held on one long NDJSON stream (avoids TLS / idle
 * disconnects during long Remotion renders). Returns the rendered MP4 as a
 * buffer on the **orchestrator** side (no Supabase service key inside the
 * sandbox).
 */
export async function renderAssemblyMp4InSandbox(
  props: AssemblyRemotionProps,
): Promise<Buffer> {
  const repoRoot = process.cwd();
  const localServe = path.join(repoRoot, "remotion-export", "serve");
  const pkgPath = path.join(repoRoot, "remotion-export", "package.json");
  const renderPath = path.join(repoRoot, "remotion-export", "render.mjs");

  await fs.access(localServe).catch(() => {
    throw new Error(
      "remotion-export/serve is missing. Run `npm run build` so the Remotion bundle is produced before deploying.",
    );
  });

  const sandbox = await Sandbox.create({
    timeout: 25 * 60 * 1000,
    resources: { vcpus: 2 },
  });

  try {
    const orchestratorDeadlineAt = Date.now() + ORCHESTRATOR_DEADLINE_BUFFER_MS;

    await runBlockingMkdirP(sandbox, `${WORK_ROOT}/serve`, {
      label: "Sandbox mkdir export tree",
    });

    await copyLocalDirToSandbox(sandbox, localServe, `${WORK_ROOT}/serve`);

    const [pkg, renderScript] = await Promise.all([
      fs.readFile(pkgPath, "utf8"),
      fs.readFile(renderPath, "utf8"),
    ]);

    await sandbox.writeFiles([
      { path: `${WORK_ROOT}/package.json`, content: pkg },
      { path: `${WORK_ROOT}/render.mjs`, content: renderScript },
    ]);

    const systemDepsCmd = await sandbox.runCommand({
      cmd: "dnf",
      args: [
        "install",
        "-y",
        ...REMOTION_HEADLESS_SHELL_AL2023_DNF_PACKAGES,
      ],
      sudo: true,
      detached: true,
    });
    const dnfOutcome = await waitForDetachedSandboxCommandUntil(
      sandbox,
      systemDepsCmd,
      {
        label: "Sandbox dnf install (Remotion / Chrome libs)",
        deadlineAt: orchestratorDeadlineAt,
      },
    );
    if (dnfOutcome.exitCode !== 0) {
      const err = await systemDepsCmd.stderr();
      throw new Error(
        `Sandbox dnf install (Remotion / Chrome libs) failed (exit ${dnfOutcome.exitCode}): ${err}`,
      );
    }

    const installCmd = await sandbox.runCommand({
      cmd: "npm",
      args: ["install", "--omit=dev", "--prefix", WORK_ROOT],
      detached: true,
    });
    const npmOutcome = await waitForDetachedSandboxCommandUntil(
      sandbox,
      installCmd,
      {
        label: "Sandbox npm install",
        deadlineAt: orchestratorDeadlineAt,
      },
    );
    if (npmOutcome.exitCode !== 0) {
      const err = await installCmd.stderr();
      throw new Error(
        `Sandbox npm install failed (exit ${npmOutcome.exitCode}): ${err}`,
      );
    }

    await sandbox.fs.writeFile(
      `${WORK_ROOT}/props.json`,
      JSON.stringify(props),
      "utf8",
    );

    const renderCmd = await sandbox.runCommand({
      cmd: "node",
      args: [`${WORK_ROOT}/render.mjs`],
      cwd: WORK_ROOT,
      detached: true,
    });
    const renderOutcome = await waitForDetachedSandboxCommandUntil(
      sandbox,
      renderCmd,
      {
        label: "Sandbox Remotion render",
        deadlineAt: orchestratorDeadlineAt,
      },
    );
    if (renderOutcome.exitCode !== 0) {
      const err = await renderCmd.stderr();
      throw new Error(
        `Sandbox Remotion render failed (exit ${renderOutcome.exitCode}): ${err}`,
      );
    }

    const out = await sandbox.readFileToBuffer({ path: `${WORK_ROOT}/out.mp4` });
    if (!out || out.byteLength === 0) {
      throw new Error("Sandbox Remotion render produced an empty MP4.");
    }

    return out;
  } finally {
    await stopSandboxBestEffort(sandbox);
  }
}
