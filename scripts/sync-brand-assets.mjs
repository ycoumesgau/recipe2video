/**
 * Génère `app/icon.png` (favicon onglet / App Router) à partir du logo marque.
 * Lancez après avoir remplacé `public/branding/app-logo.png`.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const src = path.join(root, "public/branding/app-logo.png");
const outDir = path.join(root, "app");

await mkdir(outDir, { recursive: true });
await sharp(src).resize(32, 32).png().toFile(path.join(outDir, "icon.png"));

console.log("app/icon.png mis à jour depuis public/branding/app-logo.png");
