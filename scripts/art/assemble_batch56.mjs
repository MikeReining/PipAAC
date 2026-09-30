import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

export const BATCH56 = [
  { slot: 557, word: "bedtime", type: "gen" },
  { slot: 558, word: "naptime", type: "gen" },
  { slot: 559, word: "now", type: "timeline", activeIdx: 0 },
  { slot: 560, word: "later", type: "timeline", activeIdx: 3 },
  { slot: 561, word: "soon", type: "timeline", activeIdx: 1 },
  { slot: 562, word: "today", type: "calendar", calType: "today" },
  { slot: 563, word: "tomorrow", type: "calendar", calType: "tomorrow" },
  { slot: 564, word: "yesterday", type: "calendar", calType: "yesterday" },
  { slot: 565, word: "before", type: "sequence", seqType: "before" },
  { slot: 566, word: "after", type: "sequence", seqType: "after" },
];

// Robust auto-centering normalizer to 1600x1600 with 82% coverage
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

// ---------------------------------------------------------------------------
// 1. TIMELINE TRIAD: now, soon, later
// ---------------------------------------------------------------------------
export function buildTimelineSvg(activeIdx) {
  const nodeXs = [320, 600, 880, 1160];
  const lineY = 1150;

  let nodesSvg = "";
  for (let i = 0; i < 4; i++) {
    const x = nodeXs[i];
    if (i === activeIdx) {
      // Bold, massive active solid blue node (~50% bigger: r=120)
      nodesSvg += `
        <!-- Active solid blue node (r=120) -->
        <circle cx="${x}" cy="${lineY}" r="120" fill="#2563EB" stroke="#0F172A" stroke-width="32" />
        <circle cx="${x - 30}" cy="${lineY - 30}" r="32" fill="#93C5FD" opacity="0.75" />
      `;
    } else {
      // Inactive open node
      nodesSvg += `
        <!-- Inactive open node -->
        <circle cx="${x}" cy="${lineY}" r="50" fill="#FFFFFF" stroke="#1E293B" stroke-width="24" />
      `;
    }
  }

  return `
    <svg width="1600" height="1600" viewBox="0 0 1600 1600" xmlns="http://www.w3.org/2000/svg">
      <rect width="1600" height="1600" fill="#FFFFFF" />

      <!-- Centered Invariant Clock (3:00 category anchor) -->
      <g id="clock">
        <!-- Clock outer ring -->
        <circle cx="800" cy="480" r="240" fill="#FFFFFF" stroke="#1E293B" stroke-width="42" />
        
        <!-- Hour tick markers (12, 3, 6, 9) -->
        <line x1="800" y1="275" x2="800" y2="315" stroke="#94A3B8" stroke-width="24" stroke-linecap="round" />
        <line x1="1005" y1="480" x2="965" y2="480" stroke="#94A3B8" stroke-width="24" stroke-linecap="round" />
        <line x1="800" y1="685" x2="800" y2="645" stroke="#94A3B8" stroke-width="24" stroke-linecap="round" />
        <line x1="595" y1="480" x2="635" y2="480" stroke="#94A3B8" stroke-width="24" stroke-linecap="round" />

        <!-- Minute hand (pointing to 12) -->
        <line x1="800" y1="480" x2="800" y2="300" stroke="#1E293B" stroke-width="44" stroke-linecap="round" />
        <!-- Hour hand (pointing to 3) -->
        <line x1="800" y1="480" x2="950" y2="480" stroke="#1E293B" stroke-width="44" stroke-linecap="round" />

        <!-- Center hub -->
        <circle cx="800" cy="480" r="30" fill="#1E293B" />
      </g>

      <!-- Horizontal Timeline Track -->
      <g id="timeline">
        <!-- Horizontal line -->
        <line x1="160" y1="${lineY}" x2="1340" y2="${lineY}" stroke="#1E293B" stroke-width="32" stroke-linecap="round" />

        <!-- Arrowhead pointing right with clean breathing room -->
        <polygon points="1320,1040 1480,1150 1320,1260" fill="#1E293B" stroke="#1E293B" stroke-width="20" stroke-linejoin="round" />

        <!-- Nodes -->
        ${nodesSvg}
      </g>
    </svg>
  `;
}

// ---------------------------------------------------------------------------
// 2. CALENDAR STRIP TRIAD: yesterday, today, tomorrow
// ---------------------------------------------------------------------------
export function buildCalendarSvg(calType) {
  const binderY = 320;
  const pageY = 470;

  const isYesterday = calType === "yesterday";
  const isToday = calType === "today";
  const isTomorrow = calType === "tomorrow";

  const colY = 530;
  const colH = 750;
  const colW = 320;

  // Col 1 (Yesterday: 10, x=270)
  const c1Fill = isYesterday ? "#FED7AA" : "#F8FAFC";
  const c1Stroke = isYesterday ? "#F97316" : "#E2E8F0";
  const c1StrokeW = isYesterday ? 32 : 20;
  const c1TextFill = isYesterday ? "#9A3412" : "#94A3B8";

  // Col 2 (Today: 11, x=640)
  const c2Fill = isToday ? "#FEF08A" : "#F8FAFC";
  const c2Stroke = isToday ? "#EAB308" : "#CBD5E1";
  const c2StrokeW = isToday ? 34 : 20;
  const c2TextFill = isToday ? "#854D0E" : "#64748B";

  // Col 3 (Tomorrow: 12, x=1010)
  const c3Fill = isTomorrow ? "#BBF7D0" : "#F8FAFC";
  const c3Stroke = isTomorrow ? "#22C55E" : "#E2E8F0";
  const c3StrokeW = isTomorrow ? 32 : 20;
  const c3TextFill = isTomorrow ? "#166534" : "#94A3B8";

  let heroSvg = "";
  if (isYesterday) {
    // Amber arrow arching UP and OVER from Today (Col 2) to Yesterday (Col 1)
    heroSvg = `
      <g id="leap-yesterday">
        <path d="M 760 1100 C 760 920, 480 920, 480 1060" fill="none" stroke="#1E293B" stroke-width="54" stroke-linecap="round" />
        <path d="M 760 1100 C 760 920, 480 920, 480 1060" fill="none" stroke="#F97316" stroke-width="36" stroke-linecap="round" />
        <polygon points="410,1020 480,1130 550,1020" fill="#F97316" stroke="#1E293B" stroke-width="18" stroke-linejoin="round" />
      </g>
    `;
  } else if (isTomorrow) {
    // Green arrow arching UP and OVER from Today (Col 2) to Tomorrow (Col 3)
    heroSvg = `
      <g id="leap-tomorrow">
        <path d="M 840 1100 C 840 920, 1120 920, 1120 1060" fill="none" stroke="#1E293B" stroke-width="54" stroke-linecap="round" />
        <path d="M 840 1100 C 840 920, 1120 920, 1120 1060" fill="none" stroke="#22C55E" stroke-width="36" stroke-linecap="round" />
        <polygon points="1050,1020 1120,1130 1190,1020" fill="#22C55E" stroke="#1E293B" stroke-width="18" stroke-linejoin="round" />
      </g>
    `;
  } else if (isToday) {
    // Large golden star in center box
    heroSvg = `
      <g id="today-star">
        <polygon points="800,940 835,1020 920,1030 855,1090 872,1175 800,1130 728,1175 745,1090 680,1030 765,1020" fill="#FACC15" stroke="#1E293B" stroke-width="22" stroke-linejoin="round" />
      </g>
    `;
  }

  return `
    <svg width="1600" height="1600" viewBox="0 0 1600 1600" xmlns="http://www.w3.org/2000/svg">
      <rect width="1600" height="1600" fill="#FFFFFF" />

      <!-- Calendar Backing Sheet -->
      <rect x="230" y="${pageY}" width="1140" height="840" rx="32" fill="#FFFFFF" stroke="#1E293B" stroke-width="28" />

      <!-- 3 Day Columns -->
      <!-- Left (Yesterday: 10) -->
      <rect x="270" y="${colY}" width="${colW}" height="${colH}" rx="24" fill="${c1Fill}" stroke="${c1Stroke}" stroke-width="${c1StrokeW}" />
      <text x="430" y="740" font-family="system-ui, -apple-system, sans-serif" font-size="140" font-weight="900" fill="${c1TextFill}" text-anchor="middle">10</text>

      <!-- Center (Today: 11) -->
      <rect x="640" y="${colY}" width="${colW}" height="${colH}" rx="24" fill="${c2Fill}" stroke="${c2Stroke}" stroke-width="${c2StrokeW}" />
      <text x="800" y="740" font-family="system-ui, -apple-system, sans-serif" font-size="140" font-weight="900" fill="${c2TextFill}" text-anchor="middle">11</text>

      <!-- Right (Tomorrow: 12) -->
      <rect x="1010" y="${colY}" width="${colW}" height="${colH}" rx="24" fill="${c3Fill}" stroke="${c3Stroke}" stroke-width="${c3StrokeW}" />
      <text x="1170" y="740" font-family="system-ui, -apple-system, sans-serif" font-size="140" font-weight="900" fill="${c3TextFill}" text-anchor="middle">12</text>

      <!-- Hero transition / star -->
      ${heroSvg}

      <!-- Top Red Binder Header -->
      <rect x="230" y="${binderY}" width="1140" height="170" rx="28" fill="#EF4444" stroke="#1E293B" stroke-width="28" />

      <!-- Binder Spirals (4 loops) -->
      ${[380, 660, 940, 1220].map((rx) => `
        <rect x="${rx - 22}" y="260" width="44" height="130" rx="22" fill="#FFFFFF" stroke="#1E293B" stroke-width="22" />
      `).join("")}
    </svg>
  `;
}

// ---------------------------------------------------------------------------
// 3. SEQUENCE STEPS: before, after
// ---------------------------------------------------------------------------
export function buildSequenceSvg(seqType) {
  const isBefore = seqType === "before";

  // Step 1 styling (Left, x=260)
  const s1Fill = isBefore ? "#2563EB" : "#F1F5F9";
  const s1Stroke = isBefore ? "#0F172A" : "#94A3B8";
  const s1StrokeW = isBefore ? 28 : 20;
  const s1NumFill = isBefore ? "#FFFFFF" : "#64748B";

  // Step 2 styling (Right, x=860)
  const s2Fill = !isBefore ? "#2563EB" : "#F1F5F9";
  const s2Stroke = !isBefore ? "#0F172A" : "#94A3B8";
  const s2StrokeW = !isBefore ? 28 : 20;
  const s2NumFill = !isBefore ? "#FFFFFF" : "#64748B";

  // Sweeping Arch Arrow
  let archSvg = "";
  if (isBefore) {
    // Arrow starts at Step 2 and arches OVER to point directly at Step 1 (Leftward)
    archSvg = `
      <g id="arch-before">
        <path d="M 1100 640 C 1100 300, 520 300, 520 580" fill="none" stroke="#1E293B" stroke-width="56" stroke-linecap="round" />
        <path d="M 1100 640 C 1100 300, 520 300, 520 580" fill="none" stroke="#2563EB" stroke-width="38" stroke-linecap="round" />
        <polygon points="440,540 520,660 590,560" fill="#2563EB" stroke="#1E293B" stroke-width="20" stroke-linejoin="round" />
      </g>
    `;
  } else {
    // Arrow starts at Step 1 and arches OVER to point directly at Step 2 (Rightward)
    archSvg = `
      <g id="arch-after">
        <path d="M 500 640 C 500 300, 1080 300, 1080 580" fill="none" stroke="#1E293B" stroke-width="56" stroke-linecap="round" />
        <path d="M 500 640 C 500 300, 1080 300, 1080 580" fill="none" stroke="#2563EB" stroke-width="38" stroke-linecap="round" />
        <polygon points="1160,540 1080,660 1010,560" fill="#2563EB" stroke="#1E293B" stroke-width="20" stroke-linejoin="round" />
      </g>
    `;
  }

  return `
    <svg width="1600" height="1600" viewBox="0 0 1600 1600" xmlns="http://www.w3.org/2000/svg">
      <rect width="1600" height="1600" fill="#FFFFFF" />

      <!-- Sweeping Transition Arch -->
      ${archSvg}

      <!-- Step 1 Card (Left) -->
      <rect x="260" y="680" width="480" height="560" rx="36" fill="${s1Fill}" stroke="${s1Stroke}" stroke-width="${s1StrokeW}" />
      <text x="500" y="1040" font-family="system-ui, -apple-system, sans-serif" font-size="240" font-weight="900" fill="${s1NumFill}" text-anchor="middle">1</text>

      <!-- Step 2 Card (Right) -->
      <rect x="860" y="680" width="480" height="560" rx="36" fill="${s2Fill}" stroke="${s2Stroke}" stroke-width="${s2StrokeW}" />
      <text x="1100" y="1040" font-family="system-ui, -apple-system, sans-serif" font-size="240" font-weight="900" fill="${s2NumFill}" text-anchor="middle">2</text>
    </svg>
  `;
}

// ---------------------------------------------------------------------------
// Main Assembly & Normalization
// ---------------------------------------------------------------------------
export async function normalizeAll() {
  for (const item of BATCH56) {
    if (item.type === "timeline") {
      const svg = buildTimelineSvg(item.activeIdx);
      const buf = await sharp(Buffer.from(svg)).png().toBuffer();
      writeFileSync(`${BRAIN_DIR}/batch56_norm_${item.word}.png`, buf);
      console.log(`Saved timeline batch56_norm_${item.word}.png`);
    } else if (item.type === "calendar") {
      const svg = buildCalendarSvg(item.calType);
      const buf = await sharp(Buffer.from(svg)).png().toBuffer();
      writeFileSync(`${BRAIN_DIR}/batch56_norm_${item.word}.png`, buf);
      console.log(`Saved calendar batch56_norm_${item.word}.png`);
    } else if (item.type === "sequence") {
      const svg = buildSequenceSvg(item.seqType);
      const buf = await sharp(Buffer.from(svg)).png().toBuffer();
      writeFileSync(`${BRAIN_DIR}/batch56_norm_${item.word}.png`, buf);
      console.log(`Saved sequence batch56_norm_${item.word}.png`);
    } else {
      const src = `${BRAIN_DIR}/batch56_${item.word}.png`;
      const buf = readFileSync(src);
      const norm = await normalize(buf);
      writeFileSync(`${BRAIN_DIR}/batch56_norm_${item.word}.png`, norm);
      console.log(`Normalized batch56_norm_${item.word}.png`);
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
  for (let i = 0; i < BATCH56.length; i++) {
    const item = BATCH56[i];
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = c * cardW;
    const y = r * cardH;

    const imgPath = `${BRAIN_DIR}/batch56_norm_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch56_grid.png`);

  const stripW = BATCH56.length * 64 + 16;
  const stripH = 64;
  const stripComposites = [];
  for (let i = 0; i < BATCH56.length; i++) {
    const item = BATCH56[i];
    const mini = await sharp(`${BRAIN_DIR}/batch56_norm_${item.word}.png`)
      .resize(48, 48, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
      .toBuffer();
    stripComposites.push({ input: mini, top: 8, left: i * 64 + 8 });
  }

  await sharp({
    create: { width: stripW, height: stripH, channels: 3, background: { r: 241, g: 245, b: 249 } }
  })
    .composite(stripComposites)
    .png()
    .toFile(`${BRAIN_DIR}/batch56_strip_48.png`);

  console.log("Built batch56_grid.png and batch56_strip_48.png");
}

async function main() {
  await normalizeAll();
  await buildReviewGrid();
  console.log("All 10 Batch 56 tiles assembled successfully!");
}

if (process.argv[1] && process.argv[1].endsWith("assemble_batch56.mjs")) {
  main().catch(console.error);
}
