import { generateToFile } from "./gen.mjs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const ITEMS = [
  {
    word: "money",
    out: `${BRAIN_DIR}/batch73_muse_money_v2.png`,
    framing: "object",
    social_scale: "zero",
    hint: "Authentic money on a pure white background. A realistic crisp paper US dollar bill showing the detailed green ornate border, central portrait oval, and '$' numerals, resting next to a few shiny minted silver and gold coins with embossed relief and ridged edges. Pure white background, bold outline, clean commercial product clipart clarity.",
  },
  {
    word: "game",
    out: `${BRAIN_DIR}/batch73_muse_game_v2.png`,
    framing: "object",
    social_scale: "zero",
    hint: "A clean classic board game on a pure white background. A square folding cardboard game board lying flat on a surface, with a colorful track of spaces running around the perimeter, two small colorful playing pawns standing on spaces, and a pair of white dice with black dots resting in the center. Pure white background, bold outline, warm storybook vector clipart.",
  },
  {
    word: "much",
    out: `${BRAIN_DIR}/batch73_muse_much_v2.png`,
    framing: "object",
    social_scale: "zero",
    hint: "A clean hanging price tag on a pure white background, representing how much something costs. A tilted rectangular paper price tag with clipped corners, a reinforced eyelet hole with a curved blue string loop at the top, and a bold clear dollar sign '$' displayed prominently in the center. Pure white background, bold black outline, monoline vector clipart.",
  },
];

async function run() {
  for (const item of ITEMS) {
    console.log(`[muse] Generating ${item.word} -> ${item.out}`);
    try {
      await generateToFile({
        word: item.word,
        hint: item.hint,
        framing: item.framing,
        out: item.out,
      });
      console.log(`[muse] Done: ${item.word}`);
    } catch (err) {
      console.error(`[muse] Failed: ${item.word}`, err);
    }
  }
}

run();
