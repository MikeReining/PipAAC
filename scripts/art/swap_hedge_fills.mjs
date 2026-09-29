import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

async function swapFills() {
  const imgPath = `${BRAIN_DIR}/test_tall_hedge.png`;
  const { data, info } = await sharp(imgPath).raw().toBuffer({ resolveWithObject: true });

  // Clone data buffer for short hedge
  const outData = Buffer.from(data);

  // Analyze pixels in tall hedge:
  // Blue pixels: high blue, lower red/green. Let's find sample blue:
  // Let's identify the blue range: r < 100, g < 180, b > 180
  // Pale gray range: r > 210 && r < 250, g > 215 && g < 250, b > 220 && b < 255 (not pure white)

  for (let i = 0; i < outData.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Check if blueish (tall hedge fill)
    if (b > 180 && r < 120 && g < 180) {
      // Turn to pale gray: #E5E9EE
      outData[i] = 230;
      outData[i + 1] = 235;
      outData[i + 2] = 242;
    }
    // Check if pale gray (short hedge fill)
    else if (r > 210 && r < 250 && g > 215 && g < 250 && b > 220 && b < 255) {
      // Turn to descriptor blue: #1E88E5
      outData[i] = 30;
      outData[i + 1] = 136;
      outData[i + 2] = 229;
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
    .toFile(`${BRAIN_DIR}/hedge_short_cloned.png`);

  console.log("Created hedge_short_cloned.png");

  // Create side-by-side
  const tall = await sharp(imgPath).resize(600, 600).toBuffer();
  const short = await sharp(`${BRAIN_DIR}/hedge_short_cloned.png`).resize(600, 600).toBuffer();

  await sharp({
    create: {
      width: 1240,
      height: 640,
      channels: 3,
      background: { r: 245, g: 247, b: 250 },
    },
  })
    .composite([
      { input: tall, top: 20, left: 15 },
      { input: short, top: 20, left: 625 },
    ])
    .png()
    .toFile(`${BRAIN_DIR}/hedge_pair_exact.png`);

  await sharp(`${BRAIN_DIR}/hedge_pair_exact.png`)
    .resize(96, 48, { fit: "contain" })
    .toFile(`${BRAIN_DIR}/hedge_pair_exact_48.png`);

  console.log("Created hedge_pair_exact.png and hedge_pair_exact_48.png");
}

swapFills().catch(console.error);
