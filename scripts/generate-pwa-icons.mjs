/**
 * Régénère les icônes PWA à partir du favicon Licorn (192, 512, apple-touch 180).
 * Prérequis : devDependency `sharp`.
 * Usage : node scripts/generate-pwa-icons.mjs
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const src = path.join(root, "public/branding/favicon-licorn.png");
const outDir = path.join(root, "public/pwa");

await mkdir(outDir, { recursive: true });

const base = sharp(src);
await base.clone().resize(192, 192).png().toFile(path.join(outDir, "icon-192.png"));
await base.clone().resize(512, 512).png().toFile(path.join(outDir, "icon-512.png"));
await base.clone().resize(180, 180).png().toFile(path.join(outDir, "apple-touch-icon.png"));

console.log("Icônes PWA écrites dans public/pwa/");
