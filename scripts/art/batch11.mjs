import { generateToFile } from "./gen.mjs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH = [
  {
    word: "macaroni",
    prompt: [
      "We are trying to teach a child the concept of: macaroni.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "A clean standalone ceramic bowl of yellow macaroni pasta. Do not include any text in the image.",
    ].join("\n"),
  },
  {
    word: "sandwich",
    prompt: [
      "We are trying to teach a child the concept of: sandwich.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "A clean standalone sandwich cut in half on white bread with lettuce, cheese, and tomato filling. Do not include any text in the image.",
    ].join("\n"),
  },
  {
    word: "chicken",
    prompt: [
      "We are trying to teach a child the concept of: chicken.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "A clean standalone cooked roasted chicken drumstick. Do not include any text in the image.",
    ].join("\n"),
  },
  {
    word: "nuggets",
    prompt: [
      "We are trying to teach a child the concept of: nuggets.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Show more than one.",
      "Three clean standalone golden breaded chicken nuggets. Do not include any text in the image.",
    ].join("\n"),
  },
  {
    word: "burger",
    prompt: [
      "We are trying to teach a child the concept of: burger.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "A clean standalone hamburger with a sesame bun, meat patty, and cheese. Do not include any text in the image.",
    ].join("\n"),
  },
  {
    word: "hot dog",
    prompt: [
      "We are trying to teach a child the concept of: hot dog.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "A clean standalone hot dog in a soft bun with a line of yellow mustard. Do not include any text in the image.",
    ].join("\n"),
  },
  {
    word: "soup",
    prompt: [
      "We are trying to teach a child the concept of: soup.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "A clean standalone bowl of warm vegetable soup with a spoon. Do not include any text in the image.",
    ].join("\n"),
  },
  {
    word: "rice",
    prompt: [
      "We are trying to teach a child the concept of: rice.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "A clean standalone bowl of white steamed rice. Do not include any text in the image.",
    ].join("\n"),
  },
  {
    word: "cheese",
    prompt: [
      "We are trying to teach a child the concept of: cheese.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "A clean standalone triangular wedge of yellow cheese with holes. Do not include any text in the image.",
    ].join("\n"),
  },
  {
    word: "meat",
    prompt: [
      "We are trying to teach a child the concept of: meat.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "A clean standalone cooked steak on a small white plate. Do not include any text in the image.",
    ].join("\n"),
  },
];

async function run() {
  console.log(`Starting Batch 11: ${BATCH.length} words, strictly 1 roll each...`);
  for (let i = 0; i < BATCH.length; i++) {
    const item = BATCH[i];
    const dest = `${BRAIN_DIR}/batch11_${item.word.replace(/\s+/g, "_")}.png`;
    console.log(`[${i + 1}/${BATCH.length}] Generating "${item.word}"...`);
    const started = Date.now();
    try {
      await generateToFile({
        word: item.word,
        prompt: item.prompt,
        out: dest,
        framing: "object",
      });
      console.log(`  -> wrote ${dest} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    } catch (err) {
      console.error(`  -> ERROR for ${item.word}:`, err.message);
    }
  }
  console.log("Batch 11 generation complete.");
}

run().catch(console.error);
