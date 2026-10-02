import sharp from "sharp";
import { writeFileSync, existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const ASSETS_DIR = "assets/symbols";
const PUBLIC_DIR = "public/symbols";

const BLUE = "#2563EB";        // Pip Blue canonical
const GREY = "#E2E8F0";        // Neutral ten-frame empty cell
const BLACK = "#0F172A";       // Monoline outline ink
const WHITE = "#FFFFFF";

export const BATCH64 = [
  { slot: 651, word: "five", buildSvg: () => buildTenFrameNumberSvg(5) },
  { slot: 652, word: "six", buildSvg: () => buildTenFrameNumberSvg(6) },
  { slot: 653, word: "seven", buildSvg: () => buildTenFrameNumberSvg(7) },
  { slot: 654, word: "eight", buildSvg: () => buildTenFrameNumberSvg(8) },
  { slot: 655, word: "nine", buildSvg: () => buildTenFrameNumberSvg(9) },
  { slot: 656, word: "ten", buildSvg: () => buildTenFrameNumberSvg(10) },
  { slot: 657, word: "breakfast", isImage: true, imagePath: `${BRAIN_DIR}/batch64_muse_breakfast.png` },
  { slot: 658, word: "lunch", isImage: true, imagePath: `${BRAIN_DIR}/batch64_muse_lunch.png` },
  { slot: 659, word: "dinner", isImage: true, imagePath: `${BRAIN_DIR}/batch64_muse_dinner.png` },
  { slot: 660, word: "food", isImage: true, imagePath: `${BRAIN_DIR}/batch64_muse_food_v2.png` },
];

export function buildTenFrameNumberSvg(n) {
  const cellW = 100;
  const cellH = 70;
  const startX = 262;
  const startY = 740;
  
  let cells = "";
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 5; c++) {
      const idx = r * 5 + c;
      const fill = idx < n ? BLUE : GREY;
      cells += `<rect x="${startX + c * cellW}" y="${startY + r * cellH}" width="${cellW}" height="${cellH}" rx="6" fill="${fill}" stroke="${BLACK}" stroke-width="12"/>`;
    }
  }

  return `
  <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    <rect width="1024" height="1024" fill="${WHITE}"/>
    <!-- Pip Blue Numeral Card (Exact same dimensions and position as Batch 63) -->
    <rect x="220" y="120" width="584" height="520" rx="48" fill="${BLUE}" stroke="${BLACK}" stroke-width="26"/>
    <!-- Large bold white numeral -->
    <text x="512" y="515" font-family="system-ui, -apple-system, sans-serif" font-size="${n === 10 ? 330 : 390}" font-weight="900" fill="${WHITE}" text-anchor="middle" dominant-baseline="alphabetic">${n}</text>
    <!-- Pedagogical 2x5 Ten-Frame Grid -->
    <g>
      ${cells}
    </g>
  </svg>
  `;
}

// Content-fit tight crop with 3.5% margin
export async function tightCropBuffer(pngBuf, marginPct = 0.035) {
  const trimmed = await sharp(pngBuf).trim({ threshold: 10 }).toBuffer();
  const meta = await sharp(trimmed).metadata();
  const pad = Math.max(12, Math.round(Math.max(meta.width, meta.height) * marginPct));
  return await sharp(trimmed)
    .extend({
      top: pad,
      bottom: pad,
      left: pad,
      right: pad,
      background: { r: 255, g: 255, b: 255 },
    })
    .png()
    .toBuffer();
}

export async function assembleAll() {
  for (const item of BATCH64) {
    let rawPngBuf;
    if (item.isImage) {
      if (!existsSync(item.imagePath)) {
        console.warn(`[WARN] Skipping ${item.word}: ${item.imagePath} not found yet.`);
        continue;
      }
      rawPngBuf = await sharp(item.imagePath).png().toBuffer();
    } else {
      const svg = item.buildSvg();
      rawPngBuf = await sharp(Buffer.from(svg)).png().toBuffer();
    }

    const normBuf = await tightCropBuffer(rawPngBuf, 0.035);
    const normPath = `${BRAIN_DIR}/batch64_norm_${item.word}.png`;
    writeFileSync(normPath, normBuf);
    console.log(`Generated & normalized #${item.slot} ${item.word}`);
  }

  // Create review grid (2 rows x 5 columns)
  const cardW = 280;
  const cardH = 340;
  const gap = 16;
  const cols = 5;
  const rows = 2;
  const gridW = cols * cardW + (cols + 1) * gap;
  const gridH = rows * cardH + (rows + 1) * gap;

  const composites = [];

  for (let idx = 0; idx < BATCH64.length; idx++) {
    const item = BATCH64[idx];
    const normPath = `${BRAIN_DIR}/batch64_norm_${item.word}.png`;
    if (!existsSync(normPath)) continue;

    const c = idx % cols;
    const r = Math.floor(idx / cols);
    const left = gap + c * (cardW + gap);
    const top = gap + r * (cardH + gap);

    // Card background with rounded outline
    const cardBgSvg = `
      <svg width="${cardW}" height="${cardH}" viewBox="0 0 ${cardW} ${cardH}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${cardW}" height="${cardH}" rx="16" fill="#FFFFFF" stroke="#3B82F6" stroke-width="2"/>
        <text x="${cardW / 2}" y="${cardH - 24}" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="700" fill="#0F172A" text-anchor="middle">#${item.slot} ${item.word}</text>
      </svg>
    `;
    const cardBgBuf = await sharp(Buffer.from(cardBgSvg)).png().toBuffer();
    composites.push({ input: cardBgBuf, left, top });

    // Inner symbol resized to 240x240 inside card
    const symbolBuf = await sharp(normPath)
      .resize(240, 240, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();
    composites.push({ input: symbolBuf, left: left + 20, top: top + 20 });
  }

  const gridBuf = await sharp({
    create: { width: gridW, height: gridH, channels: 4, background: { r: 248, g: 250, b: 252, alpha: 1 } }
  }).composite(composites).png().toBuffer();

  writeFileSync(`${BRAIN_DIR}/batch64_grid.png`, gridBuf);

  // Build 48px motor strip
  const motorSize = 48;
  const motorGap = 12;
  const stripW = BATCH64.length * motorSize + (BATCH64.length + 1) * motorGap;
  const stripH = motorSize + motorGap * 2;
  const stripComposites = [];

  for (let idx = 0; idx < BATCH64.length; idx++) {
    const item = BATCH64[idx];
    const normPath = `${BRAIN_DIR}/batch64_norm_${item.word}.png`;
    if (!existsSync(normPath)) continue;

    const left = motorGap + idx * (motorSize + motorGap);
    const top = motorGap;

    const tileBuf = await sharp(normPath)
      .resize(motorSize, motorSize, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer();

    stripComposites.push({ input: tileBuf, left, top });
  }

  const stripBuf = await sharp({
    create: { width: stripW, height: stripH, channels: 4, background: { r: 241, g: 245, b: 249, alpha: 1 } }
  }).composite(stripComposites).png().toBuffer();

  writeFileSync(`${BRAIN_DIR}/batch64_strip_48.png`, stripBuf);
  console.log("Built batch64_grid.png and batch64_strip_48.png\n");
}

if (process.argv[1]?.endsWith("assemble_batch64.mjs")) {
  assembleAll().catch(console.error);
}
