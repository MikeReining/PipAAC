import { generateToFile } from "./gen.mjs";
import sharp from "sharp";
import { existsSync, writeFileSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

async function run() {
  console.log("Generating mom (ASL chin touch, yellow torso)...");
  await generateToFile({
    word: "mom",
    torso: "yellow",
    framing: "bust",
    hint: "The stick figure has a friendly gentle smile. One hand is an open hand with fingers spread upward, with its thumb resting directly against the stick figure's chin and lower jaw in the American Sign Language (ASL) sign for mother. The other arm rests straight down along the side of the yellow torso.",
    out: `${BRAIN_DIR}/test_mom.png`,
  });
  console.log("Done test_mom.png");

  console.log("Generating dad (ASL forehead touch, yellow torso)...");
  await generateToFile({
    word: "dad",
    torso: "yellow",
    framing: "bust",
    hint: "The stick figure has a friendly gentle smile. One hand is an open hand with fingers spread upward, with its thumb resting directly against the stick figure's forehead and temple in the American Sign Language (ASL) sign for father. The other arm rests straight down along the side of the yellow torso.",
    out: `${BRAIN_DIR}/test_dad.png`,
  });
  console.log("Done test_dad.png");

  // Create side-by-side preview
  const tileSize = 350;
  const pad = 16;
  const w = tileSize * 2 + pad * 3;
  const h = tileSize + pad * 2;

  const momBuf = await sharp(`${BRAIN_DIR}/test_mom.png`)
    .resize(tileSize, tileSize, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
    .toBuffer();

  const dadBuf = await sharp(`${BRAIN_DIR}/test_dad.png`)
    .resize(tileSize, tileSize, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
    .toBuffer();

  await sharp({
    create: {
      width: w,
      height: h,
      channels: 3,
      background: { r: 241, g: 245, b: 249 },
    },
  })
    .composite([
      { input: momBuf, top: pad, left: pad },
      { input: dadBuf, top: pad, left: pad * 2 + tileSize },
    ])
    .png()
    .toFile(`${BRAIN_DIR}/mom_dad_preview.png`);

  console.log("Saved mom_dad_preview.png");

  // Create 48x48 strip preview
  const mom48 = await sharp(`${BRAIN_DIR}/test_mom.png`)
    .resize(48, 48, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
    .toBuffer();

  const dad48 = await sharp(`${BRAIN_DIR}/test_dad.png`)
    .resize(48, 48, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
    .toBuffer();

  await sharp({
    create: {
      width: 128,
      height: 64,
      channels: 3,
      background: { r: 248, g: 250, b: 252 },
    },
  })
    .composite([
      { input: mom48, top: 8, left: 8 },
      { input: dad48, top: 8, left: 72 },
    ])
    .png()
    .toFile(`${BRAIN_DIR}/mom_dad_strip_48.png`);

  console.log("Saved mom_dad_strip_48.png");
}

run().catch((err) => {
  console.error("Error generating mom and dad:", err);
  process.exit(1);
});
