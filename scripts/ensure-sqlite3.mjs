/**
 * @cursor/sdk depends on sqlite3 native bindings. On Windows / newer Node,
 * pnpm install sometimes leaves sqlite3 without a built .node file. Re-run
 * sqlite3's install script (prebuild-install || node-gyp) when missing.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

let root;
try {
  root = dirname(require.resolve("sqlite3/package.json"));
} catch {
  process.exit(0);
}

const binary = join(root, "build", "Release", "node_sqlite3.node");
if (existsSync(binary)) {
  process.exit(0);
}

execSync("npm run install", {
  cwd: root,
  stdio: "inherit",
});
