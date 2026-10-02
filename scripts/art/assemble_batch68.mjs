import sharp from "sharp";
import { writeFileSync, existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

export const BATCH68 = [
  { rank: 1, word: "say", fileKey: "say", count: "11,026" },
  { rank: 2, word: "hey", fileKey: "hey", count: "9,100" },
  { rank: 3, word: "well", fileKey: "well", count: "8,211" },
  { rank: 4, word: "let's", fileKey: "lets", count: "7,520" },
  { rank: 5, word: "gone", fileKey: "gone", count: "6,939" },
  { rank: 6, word: "let", fileKey: "let", count: "6,937" },
  { rank: 7, word: "said", fileKey: "said", count: "6,908" },
  { rank: 8, word: "way", fileKey: "way", count: "6,260" },
  { rank: 9, word: "watch", fileKey: "watch", count: "6,189" },
  { rank: 10, word: "try", fileKey: "try", count: "6,078" },
];

export async function assembleAll() {
  console.log("=== Assembling Review Grid and 48px Strip for Batch 68 ===");

  // Review Grid: 2 rows x 5 columns
  const cardW = 280;
  const cardH = 340;
  const gap = 16;
  const cols = 5;
  const rows = 2;
  const gridW = cols * cardW + (cols + 1) * gap;
  const gridH = rows * cardH + (rows + 1) * gap;

  const composites = [];

  for (let idx = 0; idx < BATCH68.length; idx++) {
    const item = BATCH68[idx];
    const normPath = `${BRAIN_DIR}/batch68_norm_${item.fileKey}.png`;
    if (!existsSync(normPath)) {
      console.warn(`[WARN] Missing ${normPath}`);
      continue;
    }

    const c = idx % cols;
    const r = Math.floor(idx / cols);
    const left = gap + c * (cardW + gap);
    const top = gap + r * (cardH + gap);

    // Card background with rounded outline
    const cardBgSvg = `
      <svg width="${cardW}" height="${cardH}" viewBox="0 0 ${cardW} ${cardH}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${cardW}" height="${cardH}" rx="16" fill="#FFFFFF" stroke="#3B82F6" stroke-width="2"/>
        <text x="${cardW / 2}" y="${cardH - 24}" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="700" fill="#0F172A" text-anchor="middle">#${item.rank} ${item.word}</text>
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

  writeFileSync(`${BRAIN_DIR}/batch68_grid.png`, gridBuf);
  console.log(`Wrote review grid to ${BRAIN_DIR}/batch68_grid.png`);

  // Build 48px motor strip
  const motorSize = 48;
  const motorGap = 12;
  const stripW = BATCH68.length * motorSize + (BATCH68.length + 1) * motorGap;
  const stripH = motorSize + motorGap * 2;
  const stripComposites = [];

  for (let idx = 0; idx < BATCH68.length; idx++) {
    const item = BATCH68[idx];
    const normPath = `${BRAIN_DIR}/batch68_norm_${item.fileKey}.png`;
    if (!existsSync(normPath)) continue;

    const left = motorGap + idx * (motorSize + motorGap);
    const top = motorGap;

    const tileSvg = `
      <svg width="${motorSize}" height="${motorSize}" viewBox="0 0 ${motorSize} ${motorSize}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${motorSize}" height="${motorSize}" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.5"/>
      </svg>
    `;
    const tileBgBuf = await sharp(Buffer.from(tileSvg)).png().toBuffer();
    stripComposites.push({ input: tileBgBuf, left, top });

    const innerSize = 40;
    const innerBuf = await sharp(normPath)
      .resize(innerSize, innerSize, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();
    stripComposites.push({ input: innerBuf, left: left + 4, top: top + 4 });
  }

  const stripBuf = await sharp({
    create: { width: stripW, height: stripH, channels: 4, background: { r: 241, g: 245, b: 249, alpha: 1 } }
  }).composite(stripComposites).png().toBuffer();

  writeFileSync(`${BRAIN_DIR}/batch68_strip_48.png`, stripBuf);
  console.log(`Wrote 48px strip to ${BRAIN_DIR}/batch68_strip_48.png`);
}

if (process.argv[1]?.endsWith("assemble_batch68.mjs")) {
  assembleAll().catch(console.error);
}
