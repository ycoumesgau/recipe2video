import { setTimeout as delay } from "node:timers/promises";

import type { Command, Sandbox } from "@vercel/sandbox";

const DEFAULT_POLL_INTERVAL_MS = 8_000;

/**
 * Creates a directory tree with `mkdir -p` via a **detached** shell command
 * (not `sandbox.fs.mkdir`, which maps to a blocking `runCommand` stream).
 */
export async function runDetachedMkdirP(
  sandbox: Sandbox,
  posixPath: string,
  options: {
    deadlineAt: number;
    label?: string;
  },
): Promise<void> {
  const cmd = await sandbox.runCommand({
    cmd: "mkdir",
    args: ["-p", posixPath],
    detached: true,
  });
  const { exitCode } = await waitForDetachedSandboxCommandUntil(sandbox, cmd, {
    label: options.label ?? `Sandbox mkdir -p (${posixPath})`,
    deadlineAt: options.deadlineAt,
  });
  if (exitCode !== 0) {
    const err = await cmd.stderr();
    throw new Error(
      `Sandbox mkdir -p failed (${posixPath}, exit ${exitCode}): ${err}`,
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
