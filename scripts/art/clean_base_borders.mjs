import sharp from "sharp";
import { writeFileSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

// Clean border region (outer 40px) of any base image
async function cleanBorders(filePath, rightCutoff = null) {
  const { data, info } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);

  const cutoff = rightCutoff ?? (info.width - 40);

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      // If within 30px of top, bottom, left or past cutoff on right
      if (x < 30 || x > cutoff || y < 30 || y > info.height - 30) {
        out[idx] = 255;
        out[idx + 1] = 255;
        out[idx + 2] = 255;
      }
    }
  }

  await sharp(out, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png()
    .toFile(filePath);
  console.log(`Cleaned borders for ${filePath}`);
}

async function run() {
  await cleanBorders(`${BRAIN_DIR}/trees_tall_short.png`, 1850);
  await cleanBorders(`${BRAIN_DIR}/kettlebell_feather.png`, 2030);
  await cleanBorders(`${BRAIN_DIR}/books_thick_thin.png`, 1720);
  await cleanBorders(`${BRAIN_DIR}/wide_gate.png`, 1860);
  console.log("All borders cleaned!");
}

run().catch(console.error);
