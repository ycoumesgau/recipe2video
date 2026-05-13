import { setTimeout as delay } from "node:timers/promises";

import type { Command, Sandbox } from "@vercel/sandbox";

const DEFAULT_POLL_INTERVAL_MS = 8_000;

/**
 * `mkdir -p` via a **blocking** `runCommand` (not detached). The NDJSON
 * stream closes in milliseconds, so it does not hit the long-idle TLS
 * disconnect issues we avoid for `dnf` / `npm` / Remotion. Prefer this over
 * detached+poll for mkdir, which could leave the orchestrator waiting with no
 * visible sandbox progress.
 */
export async function runBlockingMkdirP(
  sandbox: Sandbox,
  posixPath: string,
  options?: { label?: string },
): Promise<void> {
  const result = await sandbox.runCommand({
    cmd: "mkdir",
    args: ["-p", posixPath],
  });
  if (result.exitCode !== 0) {
    const err = await result.stderr();
    throw new Error(
      `${options?.label ?? "Sandbox mkdir -p"} failed (${posixPath}, exit ${result.exitCode}): ${err}`,
    );
  }
}

/**
 * Waits for a **detached** sandbox command using short `getCommand` polls.
 *
 * `runCommand` with default `wait: true` keeps an NDJSON stream open for the
 * whole command. Long quiet phases (e.g. Remotion rendering) can exceed proxy /
 * TLS idle limits and surface as `UND_ERR_SOCKET` / "other side closed" on the
 * orchestrator. Polling avoids that long-lived stream.
 */
export async function waitForDetachedSandboxCommandUntil(
  sandbox: Sandbox,
  command: Command,
  options: {
    label: string;
    /** Wall-clock limit (`Date.now()`), shared across several commands in one VM. */
    deadlineAt: number;
    pollIntervalMs?: number;
  },
): Promise<{ exitCode: number }> {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  while (Date.now() < options.deadlineAt) {
    const latest = await sandbox.getCommand(command.cmdId);
    if (latest.exitCode !== null) {
      return { exitCode: latest.exitCode };
    }
    const remaining = options.deadlineAt - Date.now();
    await delay(Math.min(pollIntervalMs, Math.max(1_000, remaining)));
  }

  throw new Error(
    `${options.label}: timed out waiting for detached command (orchestrator deadline).`,
  );
}
