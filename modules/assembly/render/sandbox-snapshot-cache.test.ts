import { strict as assert } from "node:assert";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { computeSandboxRenderCacheKey } from "./sandbox-snapshot-cache-key";

// Spin up a temporary "repo root" with the four cache-key files at known
// content, then chdir into it before each call so `computeSandboxRenderCacheKey`
// reads from a deterministic location instead of the real workspace.

interface RepoFixture {
  root: string;
  cleanup: () => Promise<void>;
  withCwd<T>(fn: () => Promise<T>): Promise<T>;
}

async function makeRepo(files: {
  lockfile: string;
  packageJson: string;
  indexTsx: string;
  recipeTsx: string;
  renderMjs: string;
}): Promise<RepoFixture> {
  const root = await mkdtemp(join(tmpdir(), "sandbox-snapshot-test-"));
  await mkdir(join(root, "remotion-export"), { recursive: true });
  await mkdir(join(root, "remotion", "compositions"), { recursive: true });
  await Promise.all([
    writeFile(
      join(root, "remotion-export", "package-lock.json"),
      files.lockfile,
      "utf8",
    ),
    writeFile(
      join(root, "remotion-export", "package.json"),
      files.packageJson,
      "utf8",
    ),
    writeFile(
      join(root, "remotion-export", "render.mjs"),
      files.renderMjs,
      "utf8",
    ),
    writeFile(join(root, "remotion", "index.tsx"), files.indexTsx, "utf8"),
    writeFile(
      join(root, "remotion", "compositions", "recipe-assembly.tsx"),
      files.recipeTsx,
      "utf8",
    ),
  ]);
  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
    async withCwd(fn) {
      const previous = process.cwd();
      process.chdir(root);
      try {
        return await fn();
      } finally {
        process.chdir(previous);
      }
    },
  };
}

const defaultFiles = {
  lockfile: '{"name": "remotion-export", "lockfileVersion": 3}',
  packageJson: '{"name": "remotion-export", "version": "0.1.0"}',
  indexTsx: "export const x = 1;\n",
  recipeTsx: "export const y = 2;\n",
  renderMjs: 'console.log("render");\n',
};

test("computeSandboxRenderCacheKey is deterministic for identical inputs", async () => {
  const repo = await makeRepo(defaultFiles);
  try {
    const a = await repo.withCwd(() => computeSandboxRenderCacheKey());
    const b = await repo.withCwd(() => computeSandboxRenderCacheKey());
    assert.equal(typeof a, "string");
    assert.equal(a, b);
    assert.equal(a?.length, 64, "sha256 hex is 64 chars");
  } finally {
    await repo.cleanup();
  }
});

test("computeSandboxRenderCacheKey changes when lockfile content changes", async () => {
  const a = await (async () => {
    const repo = await makeRepo(defaultFiles);
    try {
      return await repo.withCwd(() => computeSandboxRenderCacheKey());
    } finally {
      await repo.cleanup();
    }
  })();
  const b = await (async () => {
    const repo = await makeRepo({
      ...defaultFiles,
      lockfile: '{"name": "remotion-export", "lockfileVersion": 4}',
    });
    try {
      return await repo.withCwd(() => computeSandboxRenderCacheKey());
    } finally {
      await repo.cleanup();
    }
  })();
  assert.notEqual(a, b);
});

test("computeSandboxRenderCacheKey changes when composition source changes", async () => {
  const a = await (async () => {
    const repo = await makeRepo(defaultFiles);
    try {
      return await repo.withCwd(() => computeSandboxRenderCacheKey());
    } finally {
      await repo.cleanup();
    }
  })();
  const b = await (async () => {
    const repo = await makeRepo({
      ...defaultFiles,
      recipeTsx: "export const y = 999;\n",
    });
    try {
      return await repo.withCwd(() => computeSandboxRenderCacheKey());
    } finally {
      await repo.cleanup();
    }
  })();
  assert.notEqual(a, b);
});

test("computeSandboxRenderCacheKey returns null when a file is missing", async () => {
  const repo = await makeRepo(defaultFiles);
  try {
    await rm(join(repo.root, "remotion-export", "package-lock.json"));
    const result = await repo.withCwd(() => computeSandboxRenderCacheKey());
    assert.equal(result, null);
  } finally {
    await repo.cleanup();
  }
});
