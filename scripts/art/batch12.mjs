import { generateToFile } from "./gen.mjs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH = [
  {
    word: "fish",
    framing: "object",
    hint: "A cooked fish on an oval white plate with a lemon slice.",
  },
  {
    word: "snack",
    framing: "object",
    hint: "A small ceramic bowl with bite-sized snack crackers and pretzels.",
  },
  {
    word: "cracker",
    framing: "object",
    hint: "A crisp square golden cracker with perforated holes.",
  },
  {
    word: "cookie",
    framing: "object",
    hint: "A round golden chocolate chip cookie with dark chocolate chips.",
  },
  {
    word: "chips",
    framing: "object",
    hint: "A small ceramic bowl filled with crispy golden potato chips.",
  },
  {
    word: "popcorn",
    framing: "object",
    hint: "A classic red-and-white striped bucket overflowing with fluffy white popcorn.",
  },
  {
    word: "pretzel",
    framing: "object",
    hint: "A traditional knotted salted brown pretzel with coarse salt grains.",
  },
  {
    word: "yogurt",
    framing: "object",
    hint: "A small single-serve yogurt cup with the foil lid peeled open and a spoon.",
  },
  {
    word: "fruit snack",
    framing: "object",
    hint: "A small handful of chewy gummy fruit treats shaped like little berries.",
  },
  {
    word: "ice cream",
    framing: "object",
    hint: "A waffle cone topped with two round scoops of ice cream.",
  },
];

async function run() {
  console.log(`Starting Batch 12: ${BATCH.length} words, strictly 1 roll each...`);
  for (let i = 0; i < BATCH.length; i++) {
    const item = BATCH[i];
    const dest = `${BRAIN_DIR}/batch12_${item.word.replace(/\s+/g, "_")}.png`;
    console.log(`[${i + 1}/${BATCH.length}] Generating "${item.word}"...`);
    const started = Date.now();
    try {
      await generateToFile({
        word: item.word,
        framing: item.framing,
        hint: item.hint,
        out: dest,
      });
      const ms = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`[${i + 1}/${BATCH.length}] Done "${item.word}" in ${ms}s -> ${dest}`);
    } catch (err) {
      console.error(`[${i + 1}/${BATCH.length}] FAILED "${item.word}":`, err.message);
    }
  }
  console.log("Batch 12 complete.");
}

run();
