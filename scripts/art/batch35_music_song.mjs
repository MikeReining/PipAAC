import { generateToFile } from "./gen.mjs";
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

async function padToSquare(filePath) {
  const meta = await sharp(filePath).metadata();
  if (meta.width === meta.height) return;
  const maxDim = Math.max(meta.width, meta.height);
  const buf = await sharp(filePath)
    .resize(maxDim, maxDim, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();
  writeFileSync(filePath, buf);
}

async function run() {
  console.log("Generating song (headphones with music notes)...");
  const songOut = `${BRAIN_DIR}/batch35_song_roll2.png`;
  await generateToFile({
    word: "song",
    torso: null,
    framing: "object",
    hint: "A stylish pair of modern over-ear headphones in front view, with a bold pair of musical eighth notes floating neatly in the center space between the two padded earcups. Bold clean black outlines, sleek dark grey and black headphones with clean bold musical notes, pure white background. No human, no face, no text, no letters, no animals, no dogs, no pencils.",
    out: songOut,
  });
  await padToSquare(songOut);
  console.log("Done song ->", songOut);

  console.log("Generating music_roll2 (clean bold music notes)...");
  const musicOut = `${BRAIN_DIR}/batch35_music_roll2.png`;
  await generateToFile({
    word: "music",
    torso: null,
    framing: "object",
    hint: "The universal symbol for music: a clean, bold pair of beamed eighth musical notes (two musical note heads connected at the top by a thick horizontal beam). Bold clean black outlines, solid black note heads and beam, pure white background. Standalone clean graphic musical notes icon, no circular sound waves, no ripples, no headphones, no text, no animals, no dogs, no pencils.",
    out: musicOut,
  });
  await padToSquare(musicOut);
  console.log("Done music_roll2 ->", musicOut);
}

run().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
