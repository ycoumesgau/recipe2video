/**
 * Sandbox-side Remotion render worker.
 *
 * Bundles the Remotion composition (`remotion/index.tsx` at the repo root)
 * and renders the recipe assembly to `out.mp4` next to this file. Both bundle
 * and render run in a single Node.js process so we can stream readable
 * progress logs to the orchestrator without juggling subprocesses.
 *
 * Inputs / outputs (paths relative to this file):
 *   - `props.json`  → `AssemblyRemotionProps` JSON, written by the orchestrator
 *   - `out.mp4`     → rendered H.264 video, read back by the orchestrator
 *
 * Required Node deps live in the **repo root** `node_modules/` (installed by
 * `npm ci --omit=dev` inside the sandbox): `@remotion/bundler`,
 * `@remotion/renderer`, `remotion`, `react`, `react-dom`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(__dirname);
const entryPoint = join(repoRoot, "remotion", "index.tsx");
const propsPath = join(__dirname, "props.json");
const outputPath = join(__dirname, "out.mp4");

const inputProps = JSON.parse(readFileSync(propsPath, "utf8"));

console.log(`[render] start entry=${entryPoint}`);
console.log(
  `[render] input_props segments=${inputProps.segments?.length ?? 0} audio_clips=${inputProps.audioClips?.length ?? 0} fps=${inputProps.fps} size=${inputProps.width}x${inputProps.height}`,
);

const bundleStartedAt = Date.now();
const serveUrl = await bundle({
  entryPoint,
  webpackOverride: (config) => config,
});
console.log(
  `[render] bundle_done elapsed_ms=${Date.now() - bundleStartedAt} serve_url=${serveUrl}`,
);

const composition = await selectComposition({
  serveUrl,
  id: "RecipeAssembly",
  inputProps,
});
console.log(
  `[render] composition_selected duration_frames=${composition.durationInFrames} fps=${composition.fps} size=${composition.width}x${composition.height}`,
);

const renderStartedAt = Date.now();
let lastProgressLogAt = 0;

await renderMedia({
  composition,
  serveUrl,
  codec: "h264",
  outputLocation: outputPath,
  inputProps,
  chromiumOptions: {
    enableMultiProcessOnLinux: true,
  },
  onProgress: ({ renderedFrames, encodedFrames }) => {
    const now = Date.now();
    if (now - lastProgressLogAt < 2_000) return;
    lastProgressLogAt = now;
    console.log(
      `[render] progress rendered=${renderedFrames}/${composition.durationInFrames} encoded=${encodedFrames}`,
    );
  },
});

console.log(
  `[render] render_done elapsed_ms=${Date.now() - renderStartedAt} output=${outputPath}`,
);
console.log("RENDER_OK", outputPath);
