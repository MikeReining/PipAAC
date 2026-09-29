import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

// Normalize image to 1600x1600 with ~82% coverage
async function normalize(inputBuf) {
  const { data, info } = await sharp(inputBuf).raw().toBuffer({ resolveWithObject: true });
  let minX = info.width, maxX = 0, minY = info.height, maxY = 0;
  for (let y = 0; y < info.height; y++) {
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
  const bw = maxX - minX;
  const bh = maxY - minY;
  if (bw <= 0 || bh <= 0) return inputBuf;

  const maxDim = Math.max(bw, bh);
  const canvasSize = 1600;
  const scale = (canvasSize * 0.82) / maxDim;
  const targetW = Math.round(bw * scale);
  const targetH = Math.round(bh * scale);

  const cropped = await sharp(inputBuf)
    .extract({ left: minX, top: minY, width: bw, height: bh })
    .resize(targetW, targetH, { fit: "contain" })
    .toBuffer();

  return await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      {
        input: cropped,
        top: Math.round((canvasSize - targetH) / 2),
        left: Math.round((canvasSize - targetW) / 2),
      },
    ])
    .png()
    .toBuffer();
}

// 1. Process Trees for tall & short
async function processTrees() {
  const src = `${BRAIN_DIR}/trees_tall_short.png`;
  const { data, info } = await sharp(src).raw().toBuffer({ resolveWithObject: true });

  const tallData = Buffer.from(data);
  const shortData = Buffer.from(data);

  // In trees_tall_short.png, green foliage pixels: g > 150 && r < 100 && b < 100
  // Left foliage (tall tree): x < info.width * 0.65
  // Right foliage (short tree): x > info.width * 0.65
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const isGreen = g > 130 && r < 120 && b < 120;
      if (isGreen) {
        if (x < 1100) {
          // Tall tree foliage:
          // In tall: Blue (#1E88E5)
          tallData[idx] = 30;
          tallData[idx + 1] = 136;
          tallData[idx + 2] = 229;

          // In short: Pale Gray (#E2E8F0)
          shortData[idx] = 226;
          shortData[idx + 1] = 232;
          shortData[idx + 2] = 240;
        } else {
          // Short tree foliage:
          // In tall: Pale Gray (#E2E8F0)
          tallData[idx] = 226;
          tallData[idx + 1] = 232;
          tallData[idx + 2] = 240;

          // In short: Blue (#1E88E5)
          shortData[idx] = 30;
          shortData[idx + 1] = 136;
          shortData[idx + 2] = 229;
        }
      }
    }
  }

  const tallBuf = await sharp(tallData, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer();
  const shortBuf = await sharp(shortData, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer();

  const normTall = await normalize(tallBuf);
  const normShort = await normalize(shortBuf);

  writeFileSync(`${BRAIN_DIR}/batch52_tall.png`, normTall);
  writeFileSync(`${BRAIN_DIR}/batch52_short.png`, normShort);
  console.log("Processed batch52_tall.png and batch52_short.png");
}

// 2. Process Kettlebell & Feather for heavy & light
async function processKettlebellFeather() {
  const src = `${BRAIN_DIR}/kettlebell_feather.png`;
  const { data, info } = await sharp(src).raw().toBuffer({ resolveWithObject: true });

  const heavyData = Buffer.from(data);
  const lightData = Buffer.from(data);

  // Kettlebell is on left (x < 950): dark gray body
  // Feather is on right (x >= 950): white/light gray body
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Kettlebell interior (gray: 40 < r < 140, 40 < g < 140, 40 < b < 140)
      if (x < 950 && r > 40 && r < 140 && g > 40 && g < 140 && b > 40 && b < 140) {
        // In heavy: Blue (#1E88E5)
        heavyData[idx] = 30;
        heavyData[idx + 1] = 136;
        heavyData[idx + 2] = 229;

        // In light: Pale Gray (#E2E8F0)
        lightData[idx] = 226;
        lightData[idx + 1] = 232;
        lightData[idx + 2] = 240;
      }

      // Feather interior (light gray/white: 180 < r < 250, 180 < g < 250, 180 < b < 250)
      if (x >= 950 && r > 180 && r < 250 && g > 180 && g < 250 && b > 180 && b < 250) {
        // In heavy: Pale Gray (#E2E8F0)
        heavyData[idx] = 226;
        heavyData[idx + 1] = 232;
        heavyData[idx + 2] = 240;

        // In light: Blue (#1E88E5)
        lightData[idx] = 30;
        lightData[idx + 1] = 136;
        lightData[idx + 2] = 229;
      }
    }
  }

  const heavyBuf = await sharp(heavyData, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer();
  const lightBuf = await sharp(lightData, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer();

  const normHeavy = await normalize(heavyBuf);
  const normLight = await normalize(lightBuf);

  writeFileSync(`${BRAIN_DIR}/batch52_heavy.png`, normHeavy);
  writeFileSync(`${BRAIN_DIR}/batch52_light.png`, normLight);
  console.log("Processed batch52_heavy.png and batch52_light.png");
}

// 3. Process Books for thick & thin
async function processBooks() {
  const src = `${BRAIN_DIR}/books_thick_thin.png`;
  const { data, info } = await sharp(src).raw().toBuffer({ resolveWithObject: true });

  const thickData = Buffer.from(data);
  const thinData = Buffer.from(data);

  // In books_thick_thin.png:
  // Thick book cover on left (x < info.width * 0.65) is dark blue/navy: r < 60, g < 100, b > 50
  // Thin book cover on right (x > info.width * 0.60) is orange/peach: r > 180, g > 100 && g < 180, b < 120
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Thick book cover (left side)
      if (x < info.width * 0.65 && r < 60 && g < 100 && b > 60) {
        // In thick: Descriptor Blue (#1E88E5)
        thickData[idx] = 30;
        thickData[idx + 1] = 136;
        thickData[idx + 2] = 229;

        // In thin: Pale Gray (#E2E8F0)
        thinData[idx] = 226;
        thinData[idx + 1] = 232;
        thinData[idx + 2] = 240;
      }

      // Thin book cover (right side)
      if (x > info.width * 0.60 && r > 180 && g > 100 && g < 190 && b < 150) {
        // In thick: Pale Gray (#E2E8F0)
        thickData[idx] = 226;
        thickData[idx + 1] = 232;
        thickData[idx + 2] = 240;

        // In thin: Descriptor Blue (#1E88E5)
        thinData[idx] = 30;
        thinData[idx + 1] = 136;
        thinData[idx + 2] = 229;
      }
    }
  }

  const thickBuf = await sharp(thickData, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer();
  const thinBuf = await sharp(thinData, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer();

  const normThick = await normalize(thickBuf);
  const normThin = await normalize(thinBuf);

  writeFileSync(`${BRAIN_DIR}/batch52_thick.png`, normThick);
  writeFileSync(`${BRAIN_DIR}/batch52_thin.png`, normThin);
  console.log("Processed batch52_thick.png and batch52_thin.png");
}

// 4. Process Wide Gate
async function processWideGate() {
  const src = `${BRAIN_DIR}/wide_gate.png`;
  const buf = readFileSync(src);
  const norm = await normalize(buf);
  writeFileSync(`${BRAIN_DIR}/batch52_wide.png`, norm);
  console.log("Processed batch52_wide.png");
}

// 5. Copy fast, slow, long
async function copyRemaining() {
  writeFileSync(`${BRAIN_DIR}/batch52_fast.png`, readFileSync(`${BRAIN_DIR}/batch52_fast_v2.png`));
  writeFileSync(`${BRAIN_DIR}/batch52_slow.png`, readFileSync(`${BRAIN_DIR}/batch52_slow_v2.png`));
  writeFileSync(`${BRAIN_DIR}/batch52_long.png`, readFileSync(`${BRAIN_DIR}/pencil_perfect.png`));
  console.log("Copied fast, slow, long!");
}

async function main() {
  await processTrees();
  await processKettlebellFeather();
  await processBooks();
  await processWideGate();
  await copyRemaining();
  console.log("All 10 Batch 52 v2 symbols assembled successfully!");
}

main().catch(console.error);
