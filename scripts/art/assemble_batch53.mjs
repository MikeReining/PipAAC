import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

// Normalize any image buffer to 1600x1600 with 82% coverage
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

// 1. #525 narrow (from wide_gate.png)
async function buildNarrow() {
  const wideSrc = `${BRAIN_DIR}/wide_gate.png`;
  const leftPillar = await sharp(wideSrc)
    .extract({ left: 145, top: 140, width: 315, height: 1020 })
    .toBuffer();
  const rightPillar = await sharp(leftPillar).flop().toBuffer();

  const arrowSvg = `<svg width="1920" height="1280" xmlns="http://www.w3.org/2000/svg">
    <!-- Black background for shaft -->
    <line x1="880" y1="650" x2="1040" y2="650" stroke="#1A1A1A" stroke-width="52" stroke-linecap="round" />
    <!-- Blue shaft -->
    <line x1="880" y1="650" x2="1040" y2="650" stroke="#1E88E5" stroke-width="32" stroke-linecap="round" />
    <!-- Left arrowhead -->
    <polygon points="905,585 825,650 905,715 880,650" fill="#1E88E5" stroke="#1A1A1A" stroke-width="14" stroke-linejoin="round" />
    <!-- Right arrowhead -->
    <polygon points="1015,585 1095,650 1015,715 1040,650" fill="#1E88E5" stroke="#1A1A1A" stroke-width="14" stroke-linejoin="round" />
  </svg>`;

  const comp = await sharp({
    create: { width: 1920, height: 1280, channels: 3, background: { r: 255, g: 255, b: 255 } }
  })
    .composite([
      { input: Buffer.from(arrowSvg), top: 0, left: 0 },
      { input: leftPillar, left: 540, top: 140 },
      { input: rightPillar, left: 1065, top: 140 },
    ])
    .png()
    .toBuffer();

  const norm = await normalize(comp);
  writeFileSync(`${BRAIN_DIR}/batch53_narrow.png`, norm);
  console.log("Built batch53_narrow.png");
}

// 2. #526 hard (from anvil_hard.png)
async function buildHard() {
  const src = `${BRAIN_DIR}/anvil_hard.png`;
  const buf = readFileSync(src);
  const norm = await normalize(buf);
  writeFileSync(`${BRAIN_DIR}/batch53_hard.png`, norm);
  console.log("Built batch53_hard.png");
}

// 3. #527 wet & #528 dry (from sponges_wet_dry.png)
async function buildSponges() {
  const src = `${BRAIN_DIR}/sponges_wet_dry.png`;
  // Left wet sponge: x: 80, top: 230, w: 890, h: 870
  const wetCrop = await sharp(src)
    .extract({ left: 80, top: 230, width: 890, height: 870 })
    .png()
    .toBuffer();
  // Ensure the dripping water and puddle are vivid Descriptor Blue (#1E88E5)
  const { data: wData, info: wInfo } = await sharp(wetCrop).raw().toBuffer({ resolveWithObject: true });
  for (let y = 0; y < wInfo.height; y++) {
    for (let x = 0; x < wInfo.width; x++) {
      const idx = (y * wInfo.width + x) * wInfo.channels;
      const r = wData[idx], g = wData[idx + 1], b = wData[idx + 2];
      if (b > 180 && r < 100) {
        wData[idx] = 30;
        wData[idx + 1] = 136;
        wData[idx + 2] = 229;
      }
    }
  }
  const cleanWet = await sharp(wData, { raw: { width: wInfo.width, height: wInfo.height, channels: wInfo.channels } }).png().toBuffer();
  const normWet = await normalize(cleanWet);
  writeFileSync(`${BRAIN_DIR}/batch53_wet.png`, normWet);

  // Right dry sponge: x: 960, top: 260, w: 880, h: 780
  const dryCrop = await sharp(src)
    .extract({ left: 960, top: 260, width: 880, height: 780 })
    .png()
    .toBuffer();
  const normDry = await normalize(dryCrop);
  writeFileSync(`${BRAIN_DIR}/batch53_dry.png`, normDry);

  console.log("Built batch53_wet.png and batch53_dry.png");
}

// 4. #529 clean & #530 dirty (from plates_clean_dirty.png)
async function buildPlates() {
  const src = `${BRAIN_DIR}/plates_clean_dirty.png`;
  // Left clean plate
  const { data: cData, info: cInfo } = await sharp(src)
    .extract({ left: 40, top: 150, width: 900, height: 950 })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Flood fill star at (669, 311) to pure Descriptor Blue (#1E88E5)
  const queue = [[669, 311]];
  const visited = new Uint8Array(cInfo.width * cInfo.height);
  visited[311 * cInfo.width + 669] = 1;

  while (queue.length > 0) {
    const [cx, cy] = queue.pop();
    const idx = (cy * cInfo.width + cx) * 3;
    cData[idx] = 30;
    cData[idx + 1] = 136;
    cData[idx + 2] = 229;

    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx >= 0 && nx < cInfo.width && ny >= 0 && ny < cInfo.height) {
        const nPos = ny * cInfo.width + nx;
        if (!visited[nPos]) {
          visited[nPos] = 1;
          const nIdx = nPos * 3;
          const nr = cData[nIdx], ng = cData[nIdx + 1], nb = cData[nIdx + 2];
          const intensity = (nr + ng + nb) / 3;
          if (intensity >= 65) {
            queue.push([nx, ny]);
          }
        }
      }
    }
  }

  const cleanCrop = await sharp(cData, { raw: { width: cInfo.width, height: cInfo.height, channels: 3 } }).png().toBuffer();
  const normClean = await normalize(cleanCrop);
  writeFileSync(`${BRAIN_DIR}/batch53_clean.png`, normClean);

  // Right dirty plate
  const dirtyCrop = await sharp(src)
    .extract({ left: 980, top: 150, width: 900, height: 950 })
    .png()
    .toBuffer();
  const normDirty = await normalize(dirtyCrop);
  writeFileSync(`${BRAIN_DIR}/batch53_dirty.png`, normDirty);

  console.log("Built batch53_clean.png and batch53_dirty.png");
}

// 5. #531 smooth (from hand_smooth_pebble.png)
async function buildSmooth() {
  const src = `${BRAIN_DIR}/hand_smooth_pebble.png`;
  // Scale to height: 1600 so arm bleeds off canvas edge naturally, matching rough.png
  const scaled = await sharp(src)
    .resize(2400, 1600)
    .toBuffer();

  const cropped = await sharp(scaled)
    .extract({ left: 350, top: 0, width: 1600, height: 1600 })
    .png()
    .toBuffer();

  writeFileSync(`${BRAIN_DIR}/batch53_smooth.png`, cropped);
  console.log("Built batch53_smooth.png");
}

// 6. #532 broken & #533 fixed (from mugs_broken_fixed.png)
async function buildMugs() {
  const src = `${BRAIN_DIR}/mugs_broken_fixed.png`;
  // Left broken mug (flop so handle is on right, perfectly matching fixed mug)
  const brokenCrop = await sharp(src)
    .extract({ left: 60, top: 220, width: 880, height: 850 })
    .flop()
    .png()
    .toBuffer();
  const normBroken = await normalize(brokenCrop);
  writeFileSync(`${BRAIN_DIR}/batch53_broken.png`, normBroken);

  // Right fixed mug with bandaid
  const fixedCrop = await sharp(src)
    .extract({ left: 980, top: 220, width: 880, height: 850 })
    .toBuffer();

  const bandaidSvg = `<svg width="880" height="850" xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(440, 520) rotate(-25)">
      <rect x="-140" y="-45" width="280" height="90" rx="45" fill="#FBBF24" stroke="#1A1A1A" stroke-width="12" />
      <rect x="-45" y="-45" width="90" height="90" fill="#FEF3C7" stroke="#1A1A1A" stroke-width="8" />
      <circle cx="-90" cy="-15" r="6" fill="#D97706" />
      <circle cx="-90" cy="15" r="6" fill="#D97706" />
      <circle cx="90" cy="-15" r="6" fill="#D97706" />
      <circle cx="90" cy="15" r="6" fill="#D97706" />
    </g>
  </svg>`;

  const mugWithBandaid = await sharp(fixedCrop)
    .composite([{ input: Buffer.from(bandaidSvg), top: 0, left: 0 }])
    .png()
    .toBuffer();

  const normFixed = await normalize(mugWithBandaid);
  writeFileSync(`${BRAIN_DIR}/batch53_fixed.png`, normFixed);

  console.log("Built batch53_broken.png and batch53_fixed.png");
}

// 7. #534 empty (from glass_empty.png)
async function buildEmpty() {
  const src = `${BRAIN_DIR}/glass_empty.png`;
  const buf = readFileSync(src);
  const norm = await normalize(buf);
  writeFileSync(`${BRAIN_DIR}/batch53_empty.png`, norm);
  console.log("Built batch53_empty.png");
}

const BATCH53 = [
  { slot: 525, word: "narrow" },
  { slot: 526, word: "hard" },
  { slot: 527, word: "wet" },
  { slot: 528, word: "dry" },
  { slot: 529, word: "clean" },
  { slot: 530, word: "dirty" },
  { slot: 531, word: "smooth" },
  { slot: 532, word: "broken" },
  { slot: 533, word: "fixed" },
  { slot: 534, word: "empty" },
];

async function buildReviewGrid() {
  const cols = 5;
  const rows = 2;
  const cardW = 320;
  const cardH = 370;
  const gridW = cols * cardW;
  const gridH = rows * cardH;

  const composites = [];
  for (let i = 0; i < BATCH53.length; i++) {
    const item = BATCH53[i];
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = c * cardW;
    const y = r * cardH;

    const imgPath = `${BRAIN_DIR}/batch53_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch53_grid.png`);

  const stripW = BATCH53.length * 64 + 16;
  const stripH = 64;
  const stripComposites = [];
  for (let i = 0; i < BATCH53.length; i++) {
    const item = BATCH53[i];
    const mini = await sharp(`${BRAIN_DIR}/batch53_${item.word}.png`)
      .resize(48, 48, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
      .toBuffer();
    stripComposites.push({ input: mini, top: 8, left: i * 64 + 8 });
  }

  await sharp({
    create: { width: stripW, height: stripH, channels: 3, background: { r: 241, g: 245, b: 249 } }
  })
    .composite(stripComposites)
    .png()
    .toFile(`${BRAIN_DIR}/batch53_strip_48.png`);

  console.log("Built batch53_grid.png and batch53_strip_48.png");
}

async function main() {
  await buildNarrow();
  await buildHard();
  await buildSponges();
  await buildPlates();
  await buildSmooth();
  await buildMugs();
  await buildEmpty();
  await buildReviewGrid();
  console.log("All 10 Batch 53 tiles assembled successfully!");
}

main().catch(console.error);
