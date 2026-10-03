import sharp from "sharp";
import { writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

// Normalize near-white pixels to pure #FFFFFF
async function normalizeWhite(inputBuf, threshold = 238) {
  const img = sharp(inputBuf);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i] >= threshold && data[i + 1] >= threshold && data[i + 2] >= threshold) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    }
  }
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png()
    .toBuffer();
}

// 1. Bit: clean hand-only pinch gesture with pure white skin and background
async function polishBit() {
  const orig = sharp(`${BRAIN_DIR}/batch69_muse_bit_hand.png`);
  const { data, info } = await orig.raw().toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum >= 140) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    } else {
      const v = Math.min(255, Math.max(0, Math.round(lum * (255 / 140))));
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
    }
  }

  const buf = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png()
    .toBuffer();

  const clean = await normalizeWhite(buf);
  await sharp(clean).png().toFile(`${BRAIN_DIR}/batch69_norm_bit.png`);
  console.log("Polished bit");
}

// 2. Time: clean wrist and watch with green arrow pointing down, pure white skin and background
async function polishTime() {
  execFileSync("python3", ["scripts/art/polish_time_arrow.py"], { stdio: "inherit" });
  const clean = await normalizeWhite(`${BRAIN_DIR}/batch69_norm_time.png`);
  await sharp(clean).png().toFile(`${BRAIN_DIR}/batch69_norm_time.png`);
  console.log("Polished time");
}

// 3. Move: Pip running with green arrow contained in 1600x1600
async function polishMove() {
  const norm = await normalizeWhite(`${BRAIN_DIR}/batch69_muse_move.png`);
  await sharp(norm)
    .resize(1600, 1600, { fit: "contain", background: "#FFFFFF" })
    .png()
    .toFile(`${BRAIN_DIR}/batch69_norm_move.png`);
  console.log("Polished move");
}

// 4. Dear: pink torso bust grounded and normalized
async function polishDear() {
  const norm = await normalizeWhite(`${BRAIN_DIR}/batch69_muse_dear.png`);
  await sharp(norm)
    .resize(1600, 1600, { fit: "contain", background: "#FFFFFF" })
    .png()
    .toFile(`${BRAIN_DIR}/batch69_norm_dear.png`);
  console.log("Polished dear");
}

// 5. From: vector origin circle + pink arrow
async function polishFrom() {
  const svg = Buffer.from(`
    <svg width="1600" height="1600" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" fill="#ffffff"/>
      <g stroke="#111111" stroke-width="2.6" stroke-linejoin="miter">
        <!-- Origin circle with starting dot -->
        <circle cx="25" cy="50" r="14" fill="#ffffff" stroke="#111111" stroke-dasharray="3.2, 2.2" stroke-width="2.6"/>
        <circle cx="25" cy="50" r="5.5" fill="#111111"/>
        <!-- Arrow emerging from origin pointing right -->
        <polygon points="44,43.5 70,43.5 70,34 90,50 70,66 70,56.5 44,56.5" fill="#f16b93"/>
      </g>
    </svg>
  `);
  await sharp(svg).png().toFile(`${BRAIN_DIR}/batch69_norm_from.png`);
  console.log("Polished from");
}

// 6. Nice: Pip petting puppy contained in 1600x1600
async function polishNice() {
  const norm = await normalizeWhite(`${BRAIN_DIR}/batch69_muse_nice.png`);
  await sharp(norm)
    .resize(1600, 1600, { fit: "contain", background: "#FFFFFF" })
    .png()
    .toFile(`${BRAIN_DIR}/batch69_norm_nice.png`);
  console.log("Polished nice");
}

// 7. About: Pip from why.png with green shirt, both canonical arms, and floating vector speech bubble with ~80px air gap
async function polishAbout() {
  const whyImg = sharp("assets/symbols/why.png");
  const { data, info } = await whyImg.raw().toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > 190 && g < 150 && b > 120) {
      data[i] = 56;
      data[i + 1] = 161;
      data[i + 2] = 105;
    } else if (r > 160 && b > 100 && r > g + 25) {
      const blend = (r - g) / 100;
      data[i] = Math.round(data[i] * (1 - blend) + 56 * blend);
      data[i + 1] = Math.round(data[i + 1] * (1 - blend) + 161 * blend);
      data[i + 2] = Math.round(data[i + 2] * (1 - blend) + 105 * blend);
    }
  }

  const basePip = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png()
    .toBuffer();

  const svg = Buffer.from(`
    <svg width="480" height="480" viewBox="0 0 480 480" xmlns="http://www.w3.org/2000/svg">
      <path d="
        M 270,30
        A 175,175 0 0,1 445,205
        A 175,175 0 0,1 270,380
        A 175,175 0 0,1 155,340
        L 90,400
        L 125,310
        A 175,175 0 0,1 95,205
        A 175,175 0 0,1 270,30
        Z"
        fill="#ffffff"
        stroke="#111111"
        stroke-width="24"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
      <path d="M 270,305 A 100,100 0 1,1 365,170" fill="none" stroke="#111111" stroke-width="20" stroke-linecap="round"/>
      <polygon points="345,145 385,155 375,195" fill="#111111"/>
      <text x="268" y="245" font-family="system-ui, -apple-system, BlinkMacSystemFont, sans-serif" font-size="115" font-weight="900" fill="#111111" text-anchor="middle">?</text>
    </svg>
  `);
  const bubbleBuf = await sharp(svg).png().toBuffer();

  const comp = await sharp(basePip)
    .composite([{ input: bubbleBuf, left: 1110, top: 30 }])
    .png()
    .toBuffer();

  const clean = await normalizeWhite(comp);
  await sharp(clean).png().toFile(`${BRAIN_DIR}/batch69_norm_about.png`);
  console.log("Polished about");
}

// 8. Piece: clean red puzzle piece extracted from puzzle.png
async function polishPiece() {
  const orig = sharp("assets/symbols/puzzle.png");
  // Extract red piece [590, 360, 750, 590]
  const extracted = await orig
    .extract({ left: 590, top: 360, width: 750, height: 575 })
    .toBuffer();

  // Clean any pixels below y=555 in the extracted image
  const { data, info } = await sharp(extracted).raw().toBuffer({ resolveWithObject: true });
  for (let y = 555; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
    }
  }

  const pieceBuf = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .resize(1100, 850, { fit: "contain", background: "#FFFFFF" })
    .png()
    .toBuffer();

  // Center onto 1600x1600 pure white canvas
  await sharp({
    create: { width: 1600, height: 1600, channels: 4, background: "#FFFFFF" },
  })
    .composite([{ input: pieceBuf, left: 250, top: 375 }])
    .png()
    .toFile(`${BRAIN_DIR}/batch69_norm_piece.png`);
  console.log("Polished piece");
}

// 9. Mean: Pip bust scaled up to match standard bust scale
async function polishMean() {
  const norm = await normalizeWhite(`${BRAIN_DIR}/batch69_muse_mean.png`);
  // Extract Pip: [440, 250, 720, 1120]
  const cropped = await sharp(norm)
    .extract({ left: 440, top: 250, width: 720, height: 1120 })
    .resize(900, 1400, { fit: "contain", background: "#FFFFFF" })
    .toBuffer();

  await sharp({
    create: { width: 1600, height: 1600, channels: 4, background: "#FFFFFF" },
  })
    .composite([{ input: cropped, left: 350, top: 120 }])
    .png()
    .toFile(`${BRAIN_DIR}/batch69_norm_mean.png`);
  console.log("Polished mean");
}

// 10. Balloon: polished red balloon from out/extended_art/
async function polishBalloon() {
  const norm = await normalizeWhite("out/extended_art/balloon.png");
  await sharp(norm)
    .resize(1600, 1600, { fit: "contain", background: "#FFFFFF" })
    .png()
    .toFile(`${BRAIN_DIR}/batch69_norm_balloon.png`);
  console.log("Polished balloon");
}

// 11. Bathroom: room scene with toilet + pedestal sink + mirror
async function polishBathroom() {
  const norm = await normalizeWhite(`${BRAIN_DIR}/batch69_muse_bathroom.png`);
  await sharp(norm)
    .resize(1600, 1600, { fit: "contain", background: "#FFFFFF" })
    .png()
    .toFile(`${BRAIN_DIR}/batch69_norm_bathroom.png`);
  console.log("Polished bathroom");
}

// 12. Naptime: cozy couch nap with warm sun
async function polishNaptime() {
  const norm = await normalizeWhite(`${BRAIN_DIR}/batch69_muse_naptime.png`);
  await sharp(norm)
    .resize(1600, 1600, { fit: "contain", background: "#FFFFFF" })
    .png()
    .toFile(`${BRAIN_DIR}/batch69_norm_naptime.png`);
  console.log("Polished naptime");
}

export async function runAllPolish() {
  await polishBit();
  await polishTime();
  await polishMove();
  await polishDear();
  await polishFrom();
  await polishNice();
  await polishAbout();
  await polishPiece();
  await polishMean();
  await polishBalloon();
  await polishBathroom();
  await polishNaptime();
  console.log("\nAll 12 polished symbols successfully generated!");
}

if (process.argv[1]?.endsWith("build_batch69_polished.mjs")) {
  runAllPolish().catch(console.error);
}
