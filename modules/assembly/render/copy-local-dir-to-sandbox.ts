import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import type { Sandbox } from "@vercel/sandbox";

import { runDetachedMkdirP } from "./wait-for-detached-sandbox-command";

/**
 * Recursively copies a local directory into the sandbox filesystem via
 * {@link Sandbox.fs} (no Supabase secrets in the VM).
 */
export async function copyLocalDirToSandbox(
  sandbox: Sandbox,
  localDir: string,
  remoteDir: string,
  options: { orchestratorDeadlineAt: number },
) {
  const entries = await fs.readdir(localDir, { withFileTypes: true });

  for (const entry of entries) {
    const localPath = path.join(localDir, entry.name);
    const remotePath = path.posix.join(remoteDir, entry.name);

    if (entry.isDirectory()) {
      await runDetachedMkdirP(sandbox, remotePath, {
        deadlineAt: options.orchestratorDeadlineAt,
      });
      await copyLocalDirToSandbox(sandbox, localPath, remotePath, options);
    } else {
      await runDetachedMkdirP(sandbox, path.posix.dirname(remotePath), {
        deadlineAt: options.orchestratorDeadlineAt,
      });
      const buf = await fs.readFile(localPath);
      await sandbox.fs.writeFile(remotePath, buf);
    }
  }
}
