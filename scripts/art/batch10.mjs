import { generateToFile } from "./gen.mjs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH = [
  {
    word: "oatmeal",
    prompt: [
      "We are trying to teach a child the concept of: oatmeal.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "A clean standalone bowl of warm oatmeal topped with berries, with no human figures.",
    ].join("\n"),
  },
  {
    word: "pancake",
    prompt: [
      "We are trying to teach a child the concept of: pancake.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "A clean standalone stack of two round fluffy pancakes with a square pat of butter on top, with no human figures.",
    ].join("\n"),
  },
  {
    word: "waffle",
    prompt: [
      "We are trying to teach a child the concept of: waffle.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "A clean standalone golden round waffle with a square grid pattern, with no human figures.",
    ].join("\n"),
  },
  {
    word: "bagel",
    prompt: [
      "We are trying to teach a child the concept of: bagel.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "A clean standalone round sliced bagel with white cream cheese spread, with no human figures.",
    ].join("\n"),
  },
  {
    word: "egg",
    prompt: [
      "We are trying to teach a child the concept of: egg.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "A clean standalone fried egg sunny side up with a bright yellow yolk, with no human figures.",
    ].join("\n"),
  },
  {
    word: "butter",
    prompt: [
      "We are trying to teach a child the concept of: butter.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "A clean standalone yellow block of butter on a small dish, with no human figures.",
    ].join("\n"),
  },
  {
    word: "jam",
    prompt: [
      "We are trying to teach a child the concept of: jam.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "A clean standalone glass jar of red strawberry jam with a lid, with no human figures.",
    ].join("\n"),
  },
  {
    word: "syrup",
    prompt: [
      "We are trying to teach a child the concept of: syrup.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "A clean standalone glass bottle of brown maple syrup with a handle, with no human figures.",
    ].join("\n"),
  },
  {
    word: "pizza",
    prompt: [
      "We are trying to teach a child the concept of: pizza.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "A clean standalone triangular slice of cheese and pepperoni pizza, with no human figures.",
    ].join("\n"),
  },
  {
    word: "pasta",
    prompt: [
      "We are trying to teach a child the concept of: pasta.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "A clean standalone bowl of yellow spaghetti pasta with red tomato sauce on top, with no human figures.",
    ].join("\n"),
  },
];

async function run() {
  console.log(`Starting Batch 10: ${BATCH.length} words, strictly 1 roll each...`);
  for (let i = 0; i < BATCH.length; i++) {
    const item = BATCH[i];
    const dest = `${BRAIN_DIR}/batch10_${item.word.replace(/\s+/g, "_")}.png`;
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
  console.log("Batch 10 generation complete.");
}

run().catch(console.error);
