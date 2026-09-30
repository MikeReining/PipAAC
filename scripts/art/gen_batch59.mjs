import { generateToFile } from "./gen.mjs";
import { existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

export const BATCH59_ITEMS = [
  {
    slot: 593,
    name: "batch59_okay",
    word: "okay",
    framing: "bust",
    torso: "pink",
    hint: "The stick figure smiles cheerfully and raises one hand beside their head, forming the crisp universally recognized OK gesture with thumb and index finger forming a circle and the other three fingers extended upward.",
  },
  {
    slot: 594,
    name: "batch59_ready_to_go",
    word: "ready to go",
    framing: "full",
    torso: "pink",
    hint: "The stick figure is standing at an open doorway ready to leave, wearing a backpack strapped on their back and shoes on their feet, taking an energetic forward step through the door with an excited ready posture.",
  },
  {
    slot: 595,
    name: "batch59_wow",
    word: "wow",
    framing: "bust",
    torso: "pink",
    hint: "The stick figure has an expression of pure delightful amazement and wonder: wide open eyes, mouth open in a round 'O' shape of awe, with both hands raised touching the cheeks in excitement.",
  },
  {
    slot: 596,
    name: "batch59_really",
    word: "really",
    framing: "bust",
    torso: "pink",
    hint: "The stick figure tilts their head quizzically with one raised eyebrow in curiosity, resting one hand under their chin thoughtfully, with a clean question mark floating near their head.",
  },
  {
    slot: 597,
    name: "batch59_maybe",
    word: "maybe",
    framing: "bust",
    torso: "pink",
    hint: "The stick figure tilts their head slightly while holding both hands open outward at different heights like a balance scale (one hand held higher, one hand held lower), thoughtfully weighing two possibilities.",
  },
  {
    slot: 598,
    name: "batch59_i_dont_know",
    word: "I don't know",
    framing: "bust",
    torso: "pink",
    hint: "The stick figure performs a classic symmetrical shrug: shoulders hunched up high, both arms bent with open palms facing upward to the sides, a puzzled neutral expression, and a bold question mark floating directly above their head.",
  },
  {
    slot: 599,
    name: "batch59_look_at_this",
    word: "look at this",
    framing: "full",
    torso: "pink",
    hint: "The stick figure leans forward, with their head tilted down looking intently at a bright solid yellow 3D cube resting on the ground in front of them, pointing their outstretched arm and index finger directly down at the yellow cube.",
  },
  {
    slot: 600,
    name: "batch59_my_turn",
    word: "my turn",
    framing: "bust",
    torso: "pink",
    hint: "The stick figure proudly points one thumb or index finger inward towards their own chest to claim their turn, with a bright colorful round game piece token resting in front of them.",
  },
  {
    slot: 601,
    name: "batch59_your_turn",
    word: "your turn",
    framing: "bust",
    torso: "pink",
    hint: "The stick figure smiles and extends one hand forward, gently presenting and sliding the bright round game piece token outward toward the viewer, with a subtle curved motion arrow pointing forward to indicate it is their turn next.",
  },
  {
    slot: 602,
    name: "batch59_careful",
    word: "careful",
    framing: "bust",
    torso: "pink",
    hint: "The stick figure holds up a bright yellow triangular caution warning sign with a bold black exclamation mark (caution symbol) in front of their chest with both hands, looking alert and focused to warn someone to be careful.",
  },
];

async function run() {
  for (const item of BATCH59_ITEMS) {
    const out = `${BRAIN_DIR}/${item.name}.png`;
    if (existsSync(out)) {
      console.log(`${item.name}.png already exists, skipping.`);
      continue;
    }
    console.log(`Generating #${item.slot} ${item.name}...`);
    await generateToFile({
      word: item.word,
      torso: item.torso,
      framing: item.framing,
      hint: item.hint,
      out,
    });
    console.log(`Saved ${out}`);
  }
  console.log("Batch 59 image generations completed!");
}

run().catch((err) => {
  console.error("Batch 59 generation error:", err);
  process.exit(1);
});
