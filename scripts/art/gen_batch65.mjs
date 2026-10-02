import { generateToFile } from "./gen.mjs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

export const BATCH65_ITEMS = [
  {
    slot: 661,
    word: "ketchup",
    framing: "object",
    social_scale: "zero",
    hint: "A red plastic squeeze bottle of ketchup with a pointed nozzle tip, clean and upright.",
  },
  {
    slot: 662,
    word: "fries",
    framing: "object",
    social_scale: "zero",
    hint: "A red paper carton filled with hot golden crispy french fries.",
  },
  {
    slot: 663,
    word: "poop",
    framing: "object",
    social_scale: "zero",
    hint: "A clean, smooth, stylized swirled brown icon with a neat black outline on a pure white background, calm and dignified clinical clipart.",
  },
  {
    slot: 664,
    word: "pee",
    framing: "object",
    social_scale: "zero",
    hint: "A clean bright golden yellow liquid droplet with a small ripple underneath, clear and simple clipart.",
  },
  {
    slot: 665,
    word: "hit",
    framing: "full",
    torso: "green",
    social_scale: "solo",
    hint: "A stick figure with green torso punching forward with a clenched fist, with a small starburst impact mark.",
  },
  {
    slot: 666,
    word: "bite",
    framing: "bust",
    torso: "green",
    social_scale: "solo",
    hint: "A stick figure with green torso biting down on an apple showing clear teeth and a sharp bite mark.",
  },
  {
    slot: 667,
    word: "break",
    framing: "full",
    torso: "green",
    social_scale: "solo",
    hint: "A stick figure with green torso snapping a wooden stick in half with both hands, showing two broken pieces with a jagged crack.",
  },
  {
    slot: 668,
    word: "scratch",
    framing: "full",
    torso: "green",
    social_scale: "solo",
    hint: "A stick figure with green torso using fingers to scratch their forearm.",
  },
  {
    slot: 669,
    word: "close",
    framing: "object",
    social_scale: "zero",
    hint: "A bright blue wooden door swinging closed into its doorway with a curved motion arrow.",
  },
  {
    slot: 670,
    word: "shut",
    framing: "object",
    social_scale: "zero",
    hint: "A bright blue wooden door firmly shut and closed completely inside its doorframe with a round door handle.",
  },
];

async function run() {
  console.log(`Starting Batch 65 generation: 10 words, strictly 1 roll each...`);
  for (let i = 0; i < BATCH65_ITEMS.length; i++) {
    const item = BATCH65_ITEMS[i];
    const dest = `${BRAIN_DIR}/batch65_muse_${item.word}.png`;
    console.log(`[${i + 1}/10] Generating #${item.slot} "${item.word}"...`);
    const started = Date.now();
    try {
      await generateToFile({
        word: item.word,
        torso: item.torso,
        framing: item.framing,
        social_scale: item.social_scale,
        hint: item.hint,
        out: dest,
      });
      console.log(`  -> wrote ${dest} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    } catch (err) {
      console.error(`  -> ERROR for ${item.word}:`, err.message);
    }
  }
  console.log("Batch 65 generation complete.");
}

if (process.argv[1]?.endsWith("gen_batch65.mjs")) {
  run().catch(console.error);
}
