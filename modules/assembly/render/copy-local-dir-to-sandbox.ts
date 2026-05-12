import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import type { Sandbox } from "@vercel/sandbox";

/**
 * Recursively copies a local directory into the sandbox filesystem via
 * {@link Sandbox.fs} (no Supabase secrets in the VM).
 */
export async function copyLocalDirToSandbox(
  sandbox: Sandbox,
  localDir: string,
  remoteDir: string,
) {
  const entries = await fs.readdir(localDir, { withFileTypes: true });

  for (const entry of entries) {
    const localPath = path.join(localDir, entry.name);
    const remotePath = path.posix.join(remoteDir, entry.name);

    if (entry.isDirectory()) {
      await sandbox.fs.mkdir(remotePath, { recursive: true });
      await copyLocalDirToSandbox(sandbox, localPath, remotePath);
    } else {
      await sandbox.fs.mkdir(path.posix.dirname(remotePath), {
        recursive: true,
      });
      const buf = await fs.readFile(localPath);
      await sandbox.fs.writeFile(remotePath, buf);
    }
  }
}
