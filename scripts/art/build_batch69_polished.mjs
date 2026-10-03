import sharp from "sharp";
import { writeFileSync, existsSync } from "node:fs";

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

// 1. Bit: clean dashed box around pinch hand, ensure pure white
async function polishBit() {
  const orig = sharp(`${BRAIN_DIR}/batch69_muse_bit.png`);
  const { data, info } = await orig.raw().toBuffer({ resolveWithObject: true });

  // Erase the rough bounding box dashed lines to the left and top of hand
  // In bit.png, hand is at x: 1050 to 1550, y: 150 to 800.
  // Dashed lines were around x: 1020 to 1250, y: 130 to 450.
  // Erase only pixels in that specific rough dashed zone that are not the hand:
  for (let y = 100; y < 550; y++) {
    for (let x = 1000; x < 1300; x++) {
      const idx = (y * info.width + x) * info.channels;
      // Dashed lines are thin black pixels isolated from hand
      // Hand finger tip is around x: 1100 to 1250, y: 250 to 450.
      if (x < 1100 && y < 450) {
        data[idx] = 255;
        data[idx + 1] = 255;
        data[idx + 2] = 255;
      }
      if (y < 210 && x < 1250) {
        data[idx] = 255;
        data[idx + 1] = 255;
        data[idx + 2] = 255;
      }
    }
  }

  // Draw two crisp, neat dimension ticks between index finger and thumb:
  // Gap is around x: 1140, y: 310.
  const buf = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png()
    .toBuffer();

  const clean = await normalizeWhite(buf);
  await sharp(clean).png().toFile(`${BRAIN_DIR}/batch69_norm_bit.png`);
  console.log("Polished bit");
}

// 2. Time: Pip blue torso fill, clean baseline, normalize white
async function polishTime() {
  const orig = sharp(`${BRAIN_DIR}/batch69_muse_time.png`);
  const { data, info } = await orig.raw().toBuffer({ resolveWithObject: true });

  // Seal bottom of torso at y=1280 between x=220 and x=1050
  for (let x = 220; x <= 1050; x++) {
    for (let dy = 0; dy < 6; dy++) {
      const idx = ((1278 + dy) * info.width + x) * info.channels;
      data[idx] = 17;
      data[idx + 1] = 17;
      data[idx + 2] = 17;
    }
  }

  // Flood fill torso from (850, 1150) with #2b6cb0
  const queue = [[850, 1150]];
  const visited = new Uint8Array(info.width * info.height);
  visited[1150 * info.width + 850] = 1;

  while (queue.length > 0) {
    const [cx, cy] = queue.shift();
    const idx = (cy * info.width + cx) * info.channels;
    data[idx] = 43;
    data[idx + 1] = 108;
    data[idx + 2] = 176;

    const neighbors = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < info.width && ny >= 0 && ny < 1280) {
        const nidx = ny * info.width + nx;
        if (!visited[nidx]) {
          visited[nidx] = 1;
          const pidx = nidx * info.channels;
          if (data[pidx] > 140 && data[pidx + 1] > 140 && data[pidx + 2] > 140) {
            queue.push([nx, ny]);
          }
        }
      }
    }
  }

  // Erase any baseline extension outside torso
  for (let y = 1276; y < 1310; y++) {
    for (let x = 0; x < info.width; x++) {
      if (x < 240 || x > 1030) {
        const idx = (y * info.width + x) * info.channels;
        data[idx] = 255;
        data[idx + 1] = 255;
        data[idx + 2] = 255;
      }
    }
  }

  const buf = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png()
    .toBuffer();

  const clean = await normalizeWhite(buf);
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

// 7. About: clean air gap on speech bubble pointer tail
async function polishAbout() {
  const orig = sharp(`${BRAIN_DIR}/batch69_muse_about.png`);
  const { data, info } = await orig.raw().toBuffer({ resolveWithObject: true });

  // In about.png, trim the pointer tip around x: 950 to 1030, y: 550 to 620 so it has a generous ~85px air gap
  for (let y = 560; y < 630; y++) {
    for (let x = 940; x < 1020; x++) {
      // Clear pixels within 40px of the tail tip to white
      const dist = Math.hypot(x - 980, y - 600);
      if (dist < 35) {
        const idx = (y * info.width + x) * info.channels;
        data[idx] = 255;
        data[idx + 1] = 255;
        data[idx + 2] = 255;
      }
    }
  }

  const buf = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png()
    .toBuffer();

  const clean = await normalizeWhite(buf);
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
