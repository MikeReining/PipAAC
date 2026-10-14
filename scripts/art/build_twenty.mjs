import sharp from "sharp";
import { writeFileSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const BLUE = "#2563EB";        // Pip Blue canonical
const BLACK = "#0F172A";       // Monoline outline ink
const WHITE = "#FFFFFF";

export function buildTwentySvg() {
  const cellW = 46;
  const cellH = 56;
  const startY = 740;
  const frame1X = 256;
  const frame2X = 538;

  let cells = "";
  // Frame 1 (10 cells)
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 5; c++) {
      cells += `<rect x="${frame1X + c * cellW}" y="${startY + r * cellH}" width="${cellW}" height="${cellH}" rx="6" fill="${BLUE}" stroke="${BLACK}" stroke-width="8"/>`;
    }
  }
  // Frame 2 (10 cells)
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 5; c++) {
      cells += `<rect x="${frame2X + c * cellW}" y="${startY + r * cellH}" width="${cellW}" height="${cellH}" rx="6" fill="${BLUE}" stroke="${BLACK}" stroke-width="8"/>`;
    }
  }

  return `
  <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    <rect width="1024" height="1024" fill="${WHITE}"/>
    <!-- Pip Blue Numeral Card (matching Batch 63 & 64) -->
    <rect x="220" y="120" width="584" height="520" rx="48" fill="${BLUE}" stroke="${BLACK}" stroke-width="26"/>
    <!-- Large bold white numeral 20 -->
    <text x="512" y="515" font-family="system-ui, -apple-system, sans-serif" font-size="330" font-weight="900" fill="${WHITE}" text-anchor="middle" dominant-baseline="alphabetic">20</text>
    <!-- Pedagogical Double 2x5 Ten-Frame Grid (20 blocks) -->
    <g>
      ${cells}
    </g>
  </svg>
  `;
}

// Content-fit tight crop with 3.5% margin matching Batch 63 & 64
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

export async function buildTwenty() {
  const svg = buildTwentySvg();
  const rawPng = await sharp(Buffer.from(svg)).png().toBuffer();
  const cropped = await tightCropBuffer(rawPng);
  const outPath = `${BRAIN_DIR}/batch78_twenty.png`;
  writeFileSync(outPath, cropped);
  console.log(`Saved twenty -> ${outPath}`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  buildTwenty();
}
