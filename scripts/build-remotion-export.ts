/**
 * Build the self-contained Remotion export worker used by Vercel Sandbox:
 * - `serve/` — `remotion bundle` output (entry `remotion/index.tsx`)
 * - `node_modules/` — `@remotion/renderer` + `remotion` (Chromium on first render)
 *
 * Run from repo root: `npx tsx scripts/build-remotion-export.ts`
 * Invoked automatically at the end of `npm run build`.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const exportDir = path.join(root, "remotion-export");
const serveDir = path.join(exportDir, "serve");

if (existsSync(serveDir)) {
  rmSync(serveDir, { recursive: true, force: true });
}
mkdirSync(serveDir, { recursive: true });

execSync(
  `npx remotion bundle remotion/index.tsx --out-dir "${serveDir}"`,
  { cwd: root, stdio: "inherit" },
);

execSync("npm install --omit=dev", {
  cwd: exportDir,
  stdio: "inherit",
});

console.log("remotion-export build complete:", serveDir);
