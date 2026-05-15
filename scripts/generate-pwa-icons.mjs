/**
 * Icônes PWA + Apple Touch à partir du logo marque (fond crème pour logos transparents).
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const src = path.join(root, "public/branding/app-logo.png");
const outDir = path.join(root, "public/pwa");
/** Fond Pantry crème — évite une tuile « vide » si le logo a beaucoup de transparence. */
const pad = { r: 241, g: 233, b: 221, alpha: 1 };

await mkdir(outDir, { recursive: true });

const sizes = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
];

for (const [filename, size] of sizes) {
  await sharp(src)
    .resize(size, size, { fit: "contain", background: pad })
    .png()
    .toFile(path.join(outDir, filename));
}

console.log("Icônes PWA écrites dans public/pwa/");
