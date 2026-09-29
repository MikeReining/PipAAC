import sharp from "sharp";
import { writeFileSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

async function makePerfectPencils() {
  const src = `${BRAIN_DIR}/batch52_long.png`;
  // Let's inspect the original image and extract just the top long pencil
  const { data, info } = await sharp(src).raw().toBuffer({ resolveWithObject: true });

  // Top pencil is located in y: 400 to 1100 approximately
  // Let's find bounding box of top pencil (y < info.height * 0.55)
  let minX = info.width, maxX = 0, minY = info.height, maxY = 0;
  for (let y = 0; y < Math.round(info.height * 0.55); y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      if (data[idx] < 245 || data[idx + 1] < 245 || data[idx + 2] < 245) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const pW = maxX - minX;
  const pH = maxY - minY;
  console.log(`Top pencil bbox: ${pW}x${pH} at (${minX}, ${minY})`);

  // Crop top pencil
  const longPencilBuf = await sharp(src)
    .extract({ left: minX, top: minY, width: pW, height: pH })
    .toBuffer();

  // Create short pencil from the long pencil:
  // Let's analyze pencil parts horizontally:
  // Tip: left 0 to ~32% of pW (wooden cone and lead)
  // Shaft: 32% to ~78% (blue body)
  // Ferrule & Eraser: ~78% to 100% (metal band and pink eraser)
  const tipW = Math.round(pW * 0.30);
  const eraserW = Math.round(pW * 0.22);
  const shortShaftW = Math.round(pW * 0.16); // very short blue/gray shaft

  const tipBuf = await sharp(longPencilBuf)
    .extract({ left: 0, top: 0, width: tipW, height: pH })
    .toBuffer();

  const midBuf = await sharp(longPencilBuf)
    .extract({ left: tipW, top: 0, width: shortShaftW, height: pH })
    .toBuffer();

  const eraserBuf = await sharp(longPencilBuf)
    .extract({ left: pW - eraserW, top: 0, width: eraserW, height: pH })
    .toBuffer();

  // Composite short pencil
  const shortPencilW = tipW + shortShaftW + eraserW;
  const rawShortBuf = await sharp({
    create: {
      width: shortPencilW,
      height: pH,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0 }
    }
  }).composite([
    { input: tipBuf, left: 0, top: 0 },
    { input: midBuf, left: tipW, top: 0 },
    { input: eraserBuf, left: tipW + shortShaftW, top: 0 }
  ]).png().toBuffer();

  // Turn blue pixels in short pencil to pale gray (#E2E8F0)
  const { data: sData, info: sInfo } = await sharp(rawShortBuf).raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < sData.length; i += sInfo.channels) {
    const r = sData[i];
    const g = sData[i + 1];
    const b = sData[i + 2];
    // Blue shaft
    if (b > 180 && r < 120 && g < 180) {
      sData[i] = 226;     // #E2
      sData[i + 1] = 232; // #E8
      sData[i + 2] = 240; // #F0
    }
  }

  const shortPencilGray = await sharp(sData, {
    raw: { width: sInfo.width, height: sInfo.height, channels: sInfo.channels }
  }).png().toBuffer();

  // Now create the combined canvas: 1600x1600
  // Place long pencil at top (y: 350)
  // Place short pencil at bottom (y: 850), aligned to right (or centered / aligned to left)
  // Let's center both pencils horizontally, or left-align! Left-aligning tips makes length comparison immediate!
  const canvasSize = 1600;
  const targetPW = 1350;
  const scale = targetPW / pW;
  const targetPH = Math.round(pH * scale);
  const targetShortW = Math.round(shortPencilW * scale);

  const scaledLong = await sharp(longPencilBuf).resize(targetPW, targetPH).toBuffer();
  const scaledShort = await sharp(shortPencilGray).resize(targetShortW, targetPH).toBuffer();

  const leftMargin = Math.round((canvasSize - targetPW) / 2);
  const shortLeft = leftMargin + (targetPW - targetShortW); // align erasers on right
  const outBuf = await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 3,
      background: { r: 255, g: 255, b: 255 }
    }
  }).composite([
    { input: scaledLong, top: 400, left: leftMargin },
    { input: scaledShort, top: 400 + targetPH + 160, left: shortLeft }
  ]).png().toBuffer();

  writeFileSync(`${BRAIN_DIR}/pencil_perfect.png`, outBuf);

  await sharp(outBuf)
    .resize(48, 48, { fit: "contain" })
    .toFile(`${BRAIN_DIR}/pencil_perfect_48.png`);

  console.log("Created pencil_perfect.png and pencil_perfect_48.png!");
}

makePerfectPencils().catch(console.error);
