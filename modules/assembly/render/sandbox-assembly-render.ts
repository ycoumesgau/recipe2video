import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { Sandbox } from "@vercel/sandbox";

import type { AssemblyRemotionProps } from "@/modules/assembly/assembly.types";

import { copyLocalDirToSandbox } from "./copy-local-dir-to-sandbox";

const WORK_ROOT = "/vercel/sandbox/recipe2video-export";

/**
 * Runs the pre-built Remotion bundle (`remotion-export/serve` from `npm run
 * build`) inside a Vercel Sandbox: `npm install` for renderer deps, then
 * `render.mjs`. Returns the rendered MP4 as a buffer on the **orchestrator**
 * side (no Supabase service key inside the sandbox).
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
    await sandbox.fs.mkdir(WORK_ROOT, { recursive: true });
    await sandbox.fs.mkdir(`${WORK_ROOT}/serve`, { recursive: true });

    await copyLocalDirToSandbox(sandbox, localServe, `${WORK_ROOT}/serve`);

    const [pkg, renderScript] = await Promise.all([
      fs.readFile(pkgPath, "utf8"),
      fs.readFile(renderPath, "utf8"),
    ]);

    await sandbox.writeFiles([
      { path: `${WORK_ROOT}/package.json`, content: pkg },
      { path: `${WORK_ROOT}/render.mjs`, content: renderScript },
    ]);

    const install = await sandbox.runCommand("npm", [
      "install",
      "--omit=dev",
      "--prefix",
      WORK_ROOT,
    ]);
    if (install.exitCode !== 0) {
      const err = await install.stderr();
      throw new Error(
        `Sandbox npm install failed (exit ${install.exitCode}): ${err}`,
      );
    }

    await sandbox.fs.writeFile(
      `${WORK_ROOT}/props.json`,
      JSON.stringify(props),
      "utf8",
    );

    const render = await sandbox.runCommand({
      cmd: "node",
      args: [`${WORK_ROOT}/render.mjs`],
      cwd: WORK_ROOT,
    });
    if (render.exitCode !== 0) {
      const err = await render.stderr();
      throw new Error(
        `Sandbox Remotion render failed (exit ${render.exitCode}): ${err}`,
      );
    }

    const out = await sandbox.readFileToBuffer({ path: `${WORK_ROOT}/out.mp4` });
    if (!out || out.byteLength === 0) {
      throw new Error("Sandbox Remotion render produced an empty MP4.");
    }

    return out;
  } finally {
    await sandbox.stop({ blocking: true }).catch(() => undefined);
  }
}
