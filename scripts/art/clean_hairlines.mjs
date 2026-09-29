import sharp from "sharp";
import { writeFileSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

async function cleanHairline(filePath) {
  const { data, info } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);

  // Check columns from 1445 to info.width:
  for (let x = 1445; x < info.width; x++) {
    for (let y = 0; y < info.height; y++) {
      const idx = (y * info.width + x) * info.channels;
      out[idx] = 255;
      out[idx + 1] = 255;
      out[idx + 2] = 255;
    }
  }

  // Check columns from 0 to 120:
  for (let x = 0; x < 120; x++) {
    for (let y = 0; y < info.height; y++) {
      const idx = (y * info.width + x) * info.channels;
      out[idx] = 255;
      out[idx + 1] = 255;
      out[idx + 2] = 255;
    }
  }

  await sharp(out, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png()
    .toFile(filePath);
  console.log(`Cleaned hairlines for ${filePath}`);
}

async function main() {
  const files = [
    "batch52_fast.png",
    "batch52_slow.png",
    "batch52_tall.png",
    "batch52_short.png",
    "batch52_long.png",
    "batch52_heavy.png",
    "batch52_light.png",
    "batch52_thick.png",
    "batch52_thin.png",
    "batch52_wide.png",
  ];

  for (const f of files) {
    await cleanHairline(`${BRAIN_DIR}/${f}`);
  }
}

main().catch(console.error);
