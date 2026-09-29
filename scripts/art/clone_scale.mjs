import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

async function cloneScale() {
  const lightPath = `${BRAIN_DIR}/batch52_light.png`;
  const { data, info } = await sharp(lightPath).raw().toBuffer({ resolveWithObject: true });
  const outData = Buffer.from(data);

  // In batch52_light.png:
  // Feather on right has blue pixels: r < 120, g < 180, b > 180
  // Kettlebell on left has pale gray pixels: r > 210 && r < 245, g > 215 && g < 245, b > 220 && b < 250 (inside kettlebell)
  // Let's swap them:
  // Blue pixels -> Pale gray (#E5E9EE)
  // Pale gray pixels inside kettlebell (x < info.width * 0.45) -> Descriptor Blue (#1E88E5)

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Feather on right side (x > 500) with blue pixels
      if (x > info.width * 0.5 && b > 180 && r < 120 && g < 180) {
        outData[idx] = 230;
        outData[idx + 1] = 235;
        outData[idx + 2] = 242;
      }
      // Kettlebell on left side (x < 550, y between 900 and 1350)
      else if (x < info.width * 0.45 && y > 900 && y < 1330 && r > 160 && r < 245 && g > 170 && g < 245 && b > 170 && b < 250) {
        outData[idx] = 30;
        outData[idx + 1] = 136;
        outData[idx + 2] = 229;
      }
    }
  }

  await sharp(outData, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  })
    .png()
    .toFile(`${BRAIN_DIR}/scale_heavy_cloned.png`);

  console.log("Created scale_heavy_cloned.png");
}

cloneScale().catch(console.error);
