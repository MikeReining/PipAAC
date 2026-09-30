import { generateToFile } from "./gen.mjs";
import { existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

export const BATCH58_ITEMS = [
  {
    slot: 583,
    name: "batch58_hello",
    word: "hello",
    framing: "full",
    torso: "pink",
    hint: "The stick figure steps forward through an open doorway into the room, raising one hand high in a friendly open-palm wave to say hello.",
  },
  {
    slot: 584,
    name: "batch58_hi",
    word: "hi",
    framing: "bust",
    torso: "pink",
    hint: "The stick figure smiles cheerfully and raises one open hand high beside their head in a friendly wave.",
  },
  {
    slot: 585,
    name: "batch58_goodbye",
    word: "goodbye",
    framing: "full",
    torso: "pink",
    hint: "The stick figure steps out through an open doorway, walking away through the door while looking back over their shoulder with a raised hand waving farewell.",
  },
  {
    slot: 586,
    name: "batch58_bye",
    word: "bye",
    framing: "full",
    torso: "pink",
    hint: "The stick figure walks away in profile towards the right side of the frame, taking a stride away while turning their head back with a cheerful hand wave sign-off.",
  },
  {
    slot: 587,
    name: "batch58_thank_you",
    word: "thank you",
    framing: "bust",
    torso: "pink",
    hint: "The stick figure has a warm grateful smile, with one open flat hand touching the chin and moving gently forward in the sign for thank you.",
  },
  {
    slot: 588,
    name: "batch58_youre_welcome",
    word: "you're welcome",
    framing: "bust",
    torso: "pink",
    hint: "The stick figure smiles warmly and holds both hands open with palms facing upward and outward in a welcoming gesture.",
  },
  {
    slot: 589,
    name: "batch58_sorry",
    word: "sorry",
    framing: "bust",
    torso: "pink",
    hint: "The stick figure has their head tilted slightly with a gentle apologetic expression, placing a closed hand flat over their heart on their chest in the sign for sorry.",
  },
  {
    slot: 590,
    name: "batch58_excuse_me",
    word: "excuse me",
    framing: "bust",
    torso: "pink",
    hint: "The stick figure smiles politely and raises one hand near shoulder level with the index finger gently pointing upward in an attention-getting excuse-me gesture.",
  },
  {
    slot: 591,
    name: "batch58_good_morning",
    word: "good morning",
    framing: "diagram",
    torso: null,
    hint: "A bright golden-yellow sun rising up above the horizon, with warm radiant glowing sunbeams bursting outward like a cheerful morning greeting.",
  },
  {
    slot: 592,
    name: "batch58_good_night",
    word: "good night",
    framing: "diagram",
    torso: null,
    hint: "A peaceful golden-yellow crescent moon resting in the sky, fast asleep with gentle closed smiling eyes, wearing a soft cozy nightcap, surrounded by small twinkling stars.",
  },
];

async function run() {
  for (const item of BATCH58_ITEMS) {
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
  console.log("Batch 58 image generations completed!");
}

run().catch((err) => {
  console.error("Batch 58 generation error:", err);
  process.exit(1);
});
