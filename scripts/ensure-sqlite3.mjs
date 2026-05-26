/**
 * @cursor/sdk depends on sqlite3 native bindings. On Windows / newer Node,
 * pnpm install sometimes leaves sqlite3 without a built .node file. Re-run
 * sqlite3's install script (prebuild-install || node-gyp) when missing.
 *
 * On Vercel, prebuild-install often downloads a Linux binary linked against a
 * newer glibc than the serverless runtime (e.g. GLIBC_2.38 vs AL2023 ~2.34).
 * We always recompile with node-gyp on the builder so the .node matches prod.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

const forceSourceBuild =
  process.env.VERCEL === "1" ||
  process.env.FORCE_SQLITE3_SOURCE_BUILD === "1";

let root;
try {
  root = dirname(require.resolve("sqlite3/package.json"));
} catch {
  process.exit(0);
}

const binary = join(root, "build", "Release", "node_sqlite3.node");

if (forceSourceBuild) {
  execSync("npm run rebuild", {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, npm_config_build_from_source: "true" },
  });
  process.exit(0);
}

if (existsSync(binary)) {
  process.exit(0);
}

execSync("npm run install", {
  cwd: root,
  stdio: "inherit",
});
