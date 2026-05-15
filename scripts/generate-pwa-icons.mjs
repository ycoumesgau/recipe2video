/**
 * Icônes PWA + Apple Touch à partir du logo marque (transparence conservée).
 * Pas de fond opaque : le PNG source pilote les zones transparentes.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const src = path.join(root, "public/branding/app-logo.png");
const outDir = path.join(root, "public/pwa");

await mkdir(outDir, { recursive: true });

const sizes = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
];

for (const [filename, size] of sizes) {
  await sharp(src)
    .resize(size, size, { fit: "contain" })
    .png()
    .toFile(path.join(outDir, filename));
}

console.log("Icônes PWA écrites dans public/pwa/");
