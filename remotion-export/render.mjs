import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderMedia, selectComposition } from "@remotion/renderer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serveUrl = join(__dirname, "serve");
const propsPath = join(__dirname, "props.json");
const outputPath = join(__dirname, "out.mp4");

const inputProps = JSON.parse(readFileSync(propsPath, "utf8"));

const composition = await selectComposition({
  serveUrl,
  id: "RecipeAssembly",
  inputProps,
});

await renderMedia({
  composition,
  serveUrl,
  codec: "h264",
  outputLocation: outputPath,
  inputProps,
  chromiumOptions: {
    disableWebSecurity: true,
  },
});

console.log("RENDER_OK", outputPath);
