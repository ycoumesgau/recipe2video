/**
 * Icônes PWA + Apple Touch à partir du logo marque.
 *
 * Les pixels transparents du logo (y compris aux coins du carré) sont affichés
 * en noir par iOS pour « Ajouter à l’écran d’accueil ». On compose donc le logo
 * redimensionné sur un carré opaque (crème Pantry) pour éviter ce plateau noir.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const src = path.join(root, "public/branding/app-logo.png");
const outDir = path.join(root, "public/pwa");
const plate = { r: 241, g: 233, b: 221, alpha: 1 };

await mkdir(outDir, { recursive: true });

/**
 * @param {string} filename
 * @param {number} size
 */
async function emitOnPlate(filename, size) {
  const scaled = await sharp(src)
    .resize(size, size, { fit: "contain" })
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: plate,
    },
  })
    .composite([{ input: scaled, gravity: "center" }])
    .png()
    .toFile(path.join(outDir, filename));
}

await emitOnPlate("icon-192.png", 192);
await emitOnPlate("icon-512.png", 512);
await emitOnPlate("apple-touch-icon.png", 180);

console.log("Icônes PWA écrites dans public/pwa/");
