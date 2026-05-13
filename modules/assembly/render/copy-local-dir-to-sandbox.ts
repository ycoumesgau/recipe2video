import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import type { Sandbox } from "@vercel/sandbox";

/** Limit tar chunks so each `writeFiles` stays a bounded upload. */
const WRITE_FILES_BATCH_MAX_FILES = 80;
const WRITE_FILES_BATCH_MAX_BYTES = 12 * 1024 * 1024;

async function* walkLeafFiles(
  localDir: string,
  remoteDir: string,
): AsyncGenerator<{ remotePath: string; content: Buffer }> {
  const entries = await fs.readdir(localDir, { withFileTypes: true });

  for (const entry of entries) {
    const localPath = path.join(localDir, entry.name);
    const remotePath = path.posix.join(remoteDir, entry.name);

    if (entry.isDirectory()) {
      yield* walkLeafFiles(localPath, remotePath);
    } else {
      const content = await fs.readFile(localPath);
      yield { remotePath, content };
    }
  }
}

/**
 * Recursively copies a local directory into the sandbox via
 * {@link Sandbox.writeFiles} in **batches** (one gzipped tar stream per batch).
 *
 * File-by-file {@link Sandbox.fs.writeFile} triggers one upload per file; a
 * large Remotion `serve/` tree then spends a long time with almost no new
 * commands in the Sandbox activity UI and risks idle disconnects. Batching
 * keeps uploads smaller and surfaces `tar` activity sooner.
 */
export async function copyLocalDirToSandbox(
  sandbox: Sandbox,
  localDir: string,
  remoteDir: string,
) {
  const batch: { path: string; content: Buffer }[] = [];
  let batchBytes = 0;

  async function flush() {
    if (batch.length === 0) return;
    await sandbox.writeFiles(
      batch.map((f) => ({ path: f.path, content: f.content })),
    );
    batch.length = 0;
    batchBytes = 0;
  }

  for await (const { remotePath, content } of walkLeafFiles(
    localDir,
    remoteDir,
  )) {
    const size = content.byteLength;

    if (size > WRITE_FILES_BATCH_MAX_BYTES) {
      await flush();
      await sandbox.writeFiles([{ path: remotePath, content }]);
      continue;
    }

    if (
      batch.length > 0 &&
      (batch.length >= WRITE_FILES_BATCH_MAX_FILES ||
        batchBytes + size > WRITE_FILES_BATCH_MAX_BYTES)
    ) {
      await flush();
    }

    batch.push({ path: remotePath, content });
    batchBytes += size;
  }

  await flush();
}
