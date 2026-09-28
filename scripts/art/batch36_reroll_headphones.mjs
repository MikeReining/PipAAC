import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

async function padToSquare(filePath) {
  const meta = await sharp(filePath).metadata();
  if (meta.width === meta.height) return;
  const maxDim = Math.max(meta.width, meta.height);
  const buf = await sharp(filePath)
    .resize(maxDim, maxDim, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();
  writeFileSync(filePath, buf);
}

async function run() {
  const out = `${BRAIN_DIR}/batch36_headphones.png`;
  console.log("Generating single headphones reroll...");
  await generateToFile({
    word: "headphones",
    torso: null,
    framing: "object",
    hint: "A single pair of modern over-ear audio headphones, perfectly centered: one curved padded headband arching over two plush circular earcups with metallic pivot yokes, and a single black audio cable extending down with a gold mini-jack. A single unified audio headset, standalone, centered in the frame. Zero musical notes, zero sound waves, absolutely NO second pair of headphones, exactly one headset only. Bold clean black outlines, graphite gray and matte black finishes, pure white background. No human head, no text, no animals, no dogs, no pencils.",
    out,
  });
  await padToSquare(out);
  console.log("Headphones reroll completed!");
}

run().catch((err) => {
  console.error("Headphones reroll failed:", err);
  process.exit(1);
});
