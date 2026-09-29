import sharp from "sharp";
import { renderFluidBarSvg } from "./render_fluid_bars.mjs";
import { writeFileSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

async function updateFastAndSlow() {
  // 1. Fast: Cheetah + 85% fluid bar
  // Let's extract cheetah from batch52_fast.png (top 1100 px)
  const fastSrc = `${BRAIN_DIR}/batch52_fast.png`;
  const cheetahCropped = await sharp(fastSrc)
    .extract({ left: 100, top: 100, width: 1400, height: 950 })
    .toBuffer();

  const fastBarSvg = renderFluidBarSvg(0.85);
  const fastBarBuf = await sharp(Buffer.from(fastBarSvg)).png().toBuffer();

  const fastCanvas = await sharp({
    create: {
      width: 1600,
      height: 1600,
      channels: 3,
      background: { r: 255, g: 255, b: 255 }
    }
  }).composite([
    { input: cheetahCropped, top: 160, left: 100 },
    { input: fastBarBuf, top: 1200, left: 200 }
  ]).png().toBuffer();

  writeFileSync(`${BRAIN_DIR}/batch52_fast_v2.png`, fastCanvas);

  // 2. Slow: Snail + 18% fluid bar
  const slowSrc = `${BRAIN_DIR}/batch52_slow.png`;
  const snailCropped = await sharp(slowSrc)
    .extract({ left: 100, top: 100, width: 1400, height: 950 })
    .toBuffer();

  const slowBarSvg = renderFluidBarSvg(0.18);
  const slowBarBuf = await sharp(Buffer.from(slowBarSvg)).png().toBuffer();

  const slowCanvas = await sharp({
    create: {
      width: 1600,
      height: 1600,
      channels: 3,
      background: { r: 255, g: 255, b: 255 }
    }
  }).composite([
    { input: snailCropped, top: 160, left: 100 },
    { input: slowBarBuf, top: 1200, left: 200 }
  ]).png().toBuffer();

  writeFileSync(`${BRAIN_DIR}/batch52_slow_v2.png`, slowCanvas);

  // Preview side-by-side
  const pFast = await sharp(fastCanvas).resize(600, 600).toBuffer();
  const pSlow = await sharp(slowCanvas).resize(600, 600).toBuffer();

  await sharp({
    create: {
      width: 1240,
      height: 640,
      channels: 3,
      background: { r: 245, g: 247, b: 250 }
    }
  }).composite([
    { input: pFast, top: 20, left: 15 },
    { input: pSlow, top: 20, left: 625 }
  ]).png().toFile(`${BRAIN_DIR}/speed_v2_preview.png`);

  await sharp(`${BRAIN_DIR}/speed_v2_preview.png`)
    .resize(96, 48, { fit: "contain" })
    .toFile(`${BRAIN_DIR}/speed_v2_preview_48.png`);

  console.log("Updated fast & slow v2!");
}

updateFastAndSlow().catch(console.error);
