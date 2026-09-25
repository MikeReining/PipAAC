import { generateToFile } from "./gen.mjs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const ITEMS = [
  {
    word: "hot_raw",
    displayName: "hot",
    torso: "blue",
    framing: "bust",
    hint: "A stick figure in a blue shirt with one bent arm raised wiping beads of sweat off their forehead with the back of their forearm, looking hot and flushed with mouth slightly open.",
    out: `${BRAIN_DIR}/batch20_hot_raw.png`,
  },
  {
    word: "dizzy",
    displayName: "dizzy",
    torso: "blue",
    framing: "bust",
    hint: "A stick figure in a blue shirt feeling dizzy, with spiral spiral swirl eyes (@ @), a slightly wavy mouth, and small golden stars circling above their tilted head.",
    out: `${BRAIN_DIR}/batch20_dizzy.png`,
  },
  {
    word: "headache",
    displayName: "headache",
    torso: "blue",
    framing: "bust",
    hint: "A stick figure in a blue shirt with both hands pressed firmly against the sides of their head and temples, squinted wincing eyes in pain, and small jagged ache starburst lines around their head.",
    out: `${BRAIN_DIR}/batch20_headache.png`,
  },
];

async function run() {
  for (const item of ITEMS) {
    console.log(`Generating "${item.word}"...`);
    const start = Date.now();
    await generateToFile({
      word: item.displayName,
      torso: item.torso,
      framing: item.framing,
      hint: item.hint,
      out: item.out,
    });
    console.log(`Done "${item.word}" in ${((Date.now() - start) / 1000).toFixed(1)}s -> ${item.out}`);
  }
}

run().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
