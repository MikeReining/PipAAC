import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

// Single-dimension robust normalizer to 1600x1600 with 82% coverage
export async function normalize(inputBuf) {
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

  const targetMax = Math.round(1600 * 0.82);
  const resizeOptions = bw >= bh ? { width: targetMax } : { height: targetMax };

  const cropped = await sharp(inputBuf)
    .extract({ left: minX, top: minY, width: bw, height: bh })
    .resize(resizeOptions)
    .toBuffer();

  const croppedMeta = await sharp(cropped).metadata();

  return await sharp({
    create: {
      width: 1600,
      height: 1600,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      {
        input: cropped,
        top: Math.round((1600 - croppedMeta.height) / 2),
        left: Math.round((1600 - croppedMeta.width) / 2),
      },
    ])
    .png()
    .toBuffer();
}

// 1. LOCKED FIXED HORIZON
// Base at y=1600.
// Hill curve peaks at y=1070 and y=1180, valley at y=1200.
// 100% mathematically identical across all 4 images, zero vertical shift!
const HILL_PATH = `
  M 0 1600
  L 0 1350
  C 120 1200, 240 1080, 420 1090
  C 560 1100, 680 1210, 800 1200
  C 920 1190, 1000 1010, 1180 1020
  C 1300 1030, 1420 1190, 1500 1180
  C 1560 1170, 1600 1200, 1600 1250
  L 1600 1600
  Z
`;

const HILL_SVG = `<path d="${HILL_PATH}" fill="#22C55E" stroke="#1A1A1A" stroke-width="28" stroke-linejoin="round" />`;

// 2. SUN WITH 8 PILL-SHAPED CAPSULE RAYS (from founder's reference image)
function buildSun(cx, cy, color) {
  const r = 160;
  const rayStart = 200;
  const rayEnd = 275;
  let rays = "";
  for (let i = 0; i < 8; i++) {
    const angle = (i * 45 * Math.PI) / 180;
    const x1 = cx + rayStart * Math.cos(angle);
    const y1 = cy + rayStart * Math.sin(angle);
    const x2 = cx + rayEnd * Math.cos(angle);
    const y2 = cy + rayEnd * Math.sin(angle);
    // Outer black contour for capsule ray
    rays += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1A1A1A" stroke-width="48" stroke-linecap="round" />`;
    // Inner colored fill for capsule ray
    rays += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="28" stroke-linecap="round" />`;
  }
  return `
    <g id="sun">
      ${rays}
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="#1A1A1A" stroke-width="26" />
    </g>
  `;
}

// 3. BOLD, CHUNKY ARROWS WITH CLEAR SEPARATION
function chunkyUpArrow(x, y) {
  return `
    <g transform="translate(${x}, ${y}) rotate(45)">
      <path d="M -25 90 L 25 90 L 25 10 L 65 10 L 0 -80 L -65 10 L -25 10 Z" fill="#F8FAFC" stroke="#1A1A1A" stroke-width="24" stroke-linejoin="round" />
      <path d="M -20 85 L 20 85 L 20 15 L 55 15 L 0 -65 L -55 15 L -20 15 Z" fill="#FACC15" />
    </g>
  `;
}

function chunkyDownArrow(x, y) {
  return `
    <g transform="translate(${x}, ${y}) rotate(135)">
      <path d="M -25 90 L 25 90 L 25 10 L 65 10 L 0 -80 L -65 10 L -25 10 Z" fill="#F8FAFC" stroke="#1A1A1A" stroke-width="24" stroke-linejoin="round" />
      <path d="M -20 85 L 20 85 L 20 15 L 55 15 L 0 -65 L -55 15 L -20 15 Z" fill="#FB923C" />
    </g>
  `;
}

export function buildMorningSvg() {
  return `<svg width="1600" height="1600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1600" height="1600" fill="#FFFFFF" />
    ${buildSun(420, 1070, "#FACC15")}
    ${HILL_SVG}
    ${chunkyUpArrow(160, 720)}
  </svg>`;
}

export function buildAfternoonSvg() {
  return `<svg width="1600" height="1600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1600" height="1600" fill="#FFFFFF" />
    ${buildSun(800, 480, "#FACC15")}
    <g transform="translate(1080, 580) scale(1.15)">
      <path d="M 50 80 A 40 40 0 0 1 120 50 A 55 55 0 0 1 210 55 A 40 40 0 0 1 260 90 A 35 35 0 0 1 240 130 L 60 130 A 35 35 0 0 1 50 80 Z" fill="#F8FAFC" stroke="#1A1A1A" stroke-width="22" stroke-linejoin="round" />
    </g>
    ${HILL_SVG}
  </svg>`;
}

export function buildEveningSvg() {
  return `<svg width="1600" height="1600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1600" height="1600" fill="#FFFFFF" />
    ${buildSun(1180, 980, "#FB923C")}
    ${HILL_SVG}
    ${chunkyDownArrow(1440, 680)}
  </svg>`;
}

export function buildNightSvg() {
  return `<svg width="1600" height="1600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1600" height="1600" fill="#FFFFFF" />
    <path d="M 0 1600 L 0 1100 C 0 350, 1600 350, 1600 1100 L 1600 1600 Z" fill="#1E293B" stroke="#1A1A1A" stroke-width="28" stroke-linejoin="round" />
    <path d="
      M 1250 440
      A 250 250 0 1 1 1100 960
      C 1250 910, 1380 740, 1250 440
      Z
    " fill="#FACC15" stroke="#1A1A1A" stroke-width="26" stroke-linejoin="round" />
    <g transform="translate(680, 580) scale(1.6)">
      <polygon points="0,-25 7,-7 25,0 7,7 0,25 -7,7 -25,0 -7,-7" fill="#FDE047" stroke="#1A1A1A" stroke-width="6" stroke-linejoin="round" />
    </g>
    <g transform="translate(380, 720) scale(1.3)">
      <polygon points="0,-25 7,-7 25,0 7,7 0,25 -7,7 -25,0 -7,-7" fill="#FDE047" stroke="#1A1A1A" stroke-width="6" stroke-linejoin="round" />
    </g>
    <g transform="translate(500, 480) scale(1.1)">
      <polygon points="0,-25 7,-7 25,0 7,7 0,25 -7,7 -25,0 -7,-7" fill="#FDE047" stroke="#1A1A1A" stroke-width="6" stroke-linejoin="round" />
    </g>
    <g transform="translate(880, 780) scale(1.2)">
      <polygon points="0,-25 7,-7 25,0 7,7 0,25 -7,7 -25,0 -7,-7" fill="#FDE047" stroke="#1A1A1A" stroke-width="6" stroke-linejoin="round" />
    </g>
    <g transform="translate(1380, 680) scale(1.1)">
      <polygon points="0,-25 7,-7 25,0 7,7 0,25 -7,7 -25,0 -7,-7" fill="#FDE047" stroke="#1A1A1A" stroke-width="6" stroke-linejoin="round" />
    </g>
    ${HILL_SVG}
  </svg>`;
}

export const BATCH55 = [
  { slot: 545, word: "cool" },
  { slot: 546, word: "special" },
  { slot: 547, word: "ready" },
  { slot: 548, word: "favorite" },
  { slot: 549, word: "weird" },
  { slot: 550, word: "funny" },
  { slot: 553, word: "morning" },
  { slot: 554, word: "afternoon" },
  { slot: 555, word: "evening" },
  { slot: 556, word: "night" },
];

export async function normalizeAll() {
  for (const item of BATCH55) {
    if (item.word === "morning") {
      const buf = await sharp(Buffer.from(buildMorningSvg())).png().toBuffer();
      writeFileSync(`${BRAIN_DIR}/batch55_norm_morning.png`, buf);
      console.log(`Saved locked batch55_norm_morning.png`);
    } else if (item.word === "afternoon") {
      const buf = await sharp(Buffer.from(buildAfternoonSvg())).png().toBuffer();
      writeFileSync(`${BRAIN_DIR}/batch55_norm_afternoon.png`, buf);
      console.log(`Saved locked batch55_norm_afternoon.png`);
    } else if (item.word === "evening") {
      const buf = await sharp(Buffer.from(buildEveningSvg())).png().toBuffer();
      writeFileSync(`${BRAIN_DIR}/batch55_norm_evening.png`, buf);
      console.log(`Saved locked batch55_norm_evening.png`);
    } else if (item.word === "night") {
      const buf = await sharp(Buffer.from(buildNightSvg())).png().toBuffer();
      writeFileSync(`${BRAIN_DIR}/batch55_norm_night.png`, buf);
      console.log(`Saved locked batch55_norm_night.png`);
    } else {
      const src = `${BRAIN_DIR}/batch55_${item.word}.png`;
      let buf = readFileSync(src);

      if (item.word === "funny") {
        const whitePatch = await sharp({
          create: { width: 150, height: 150, channels: 3, background: { r: 255, g: 255, b: 255 } }
        }).png().toBuffer();

        buf = await sharp(buf)
          .composite([{ input: whitePatch, top: 1300, left: 1050 }])
          .png()
          .toBuffer();
      }

      const norm = await normalize(buf);
      writeFileSync(`${BRAIN_DIR}/batch55_norm_${item.word}.png`, norm);
      console.log(`Normalized batch55_norm_${item.word}.png`);
    }
  }
}

export async function buildReviewGrid() {
  const cols = 5;
  const rows = 2;
  const cardW = 320;
  const cardH = 370;
  const gridW = cols * cardW;
  const gridH = rows * cardH;

  const composites = [];
  for (let i = 0; i < BATCH55.length; i++) {
    const item = BATCH55[i];
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = c * cardW;
    const y = r * cardH;

    const imgPath = `${BRAIN_DIR}/batch55_norm_${item.word}.png`;
    const imgBuf = await sharp(imgPath).resize(280, 280).toBuffer();

    const cardSvg = `<svg width="${cardW}" height="${cardH}" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="8" width="${cardW - 16}" height="${cardH - 16}" rx="16" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="2" />
      <text x="${cardW / 2}" y="325" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="bold" fill="#0F172A" text-anchor="middle">#${item.slot} ${item.word}</text>
    </svg>`;

    composites.push({ input: Buffer.from(cardSvg), top: y, left: x });
    composites.push({ input: imgBuf, top: y + 20, left: x + 20 });
  }

  await sharp({
    create: { width: gridW, height: gridH, channels: 3, background: { r: 241, g: 245, b: 249 } }
  })
    .composite(composites)
    .png()
    .toFile(`${BRAIN_DIR}/batch55_grid.png`);

  const stripW = BATCH55.length * 64 + 16;
  const stripH = 64;
  const stripComposites = [];
  for (let i = 0; i < BATCH55.length; i++) {
    const item = BATCH55[i];
    const mini = await sharp(`${BRAIN_DIR}/batch55_norm_${item.word}.png`)
      .resize(48, 48, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
      .toBuffer();
    stripComposites.push({ input: mini, top: 8, left: i * 64 + 8 });
  }

  await sharp({
    create: { width: stripW, height: stripH, channels: 3, background: { r: 241, g: 245, b: 249 } }
  })
    .composite(stripComposites)
    .png()
    .toFile(`${BRAIN_DIR}/batch55_strip_48.png`);

  console.log("Built batch55_grid.png and batch55_strip_48.png");
}

async function main() {
  await normalizeAll();
  await buildReviewGrid();
  console.log("All 10 Batch 55 tiles assembled successfully!");
}

if (process.argv[1] && process.argv[1].endsWith("assemble_batch55.mjs")) {
  main().catch(console.error);
}
