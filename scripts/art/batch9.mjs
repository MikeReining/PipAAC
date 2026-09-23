import { generateToFile } from "./gen.mjs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH = [
  {
    word: "water",
    prompt: [
      "We are trying to teach a child the concept of: water.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "A clean standalone clear drinking glass filled with water, with no human figures.",
    ].join("\n"),
  },
  {
    word: "milk",
    prompt: [
      "We are trying to teach a child the concept of: milk.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "A clean standalone carton of milk, with no human figures.",
    ].join("\n"),
  },
  {
    word: "juice",
    prompt: [
      "We are trying to teach a child the concept of: juice.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "A clean standalone glass of orange juice with a straw, with no human figures.",
    ].join("\n"),
  },
  {
    word: "apple juice",
    prompt: [
      "We are trying to teach a child the concept of: apple juice.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "A clean standalone juice box with a straw and an apple emblem on it, with no human figures.",
    ].join("\n"),
  },
  {
    word: "chocolate milk",
    prompt: [
      "We are trying to teach a child the concept of: chocolate milk.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "A clean standalone glass of brown chocolate milk, with no human figures.",
    ].join("\n"),
  },
  {
    word: "tea",
    prompt: [
      "We are trying to teach a child the concept of: tea.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "A clean standalone ceramic mug of tea with a tea bag tag hanging over the rim, with no human figures.",
    ].join("\n"),
  },
  {
    word: "smoothie",
    prompt: [
      "We are trying to teach a child the concept of: smoothie.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "A clean standalone fruit smoothie in a cup with a thick straw, with no human figures.",
    ].join("\n"),
  },
  {
    word: "bread",
    prompt: [
      "We are trying to teach a child the concept of: bread.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "A clean standalone loaf of sliced bread, with no human figures.",
    ].join("\n"),
  },
  {
    word: "toast",
    prompt: [
      "We are trying to teach a child the concept of: toast.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "A clean standalone slice of golden toasted bread, with no human figures.",
    ].join("\n"),
  },
  {
    word: "cereal",
    prompt: [
      "We are trying to teach a child the concept of: cereal.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "A clean standalone bowl of cereal with a spoon resting in it, with no human figures.",
    ].join("\n"),
  },
];

async function run() {
  console.log(`Starting Batch 9: ${BATCH.length} words, strictly 1 roll each...`);
  for (let i = 0; i < BATCH.length; i++) {
    const item = BATCH[i];
    const dest = `${BRAIN_DIR}/batch9_${item.word.replace(/\s+/g, "_")}.png`;
    console.log(`[${i + 1}/${BATCH.length}] Generating "${item.word}"...`);
    const started = Date.now();
    try {
      await generateToFile({
        word: item.word,
        prompt: item.prompt,
        out: dest,
      });
      console.log(`  -> wrote ${dest} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    } catch (err) {
      console.error(`  -> ERROR for ${item.word}:`, err.message);
    }
  }
  console.log("Batch 9 generation complete.");
}

run().catch(console.error);
