import { generateToFile } from "./gen.mjs";
import { existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

export const BATCH60_ITEMS = [
  {
    slot: 603,
    name: "batch60_emergency",
    word: "emergency",
    framing: "diagram",
    torso: null,
    hint: "A bright red emergency beacon siren light mounted on a compact dark base, with vivid yellow and red flashing light rays radiating outward, bold clean lines.",
  },
  {
    slot: 604,
    name: "batch60_no_way",
    word: "no way",
    framing: "bust",
    torso: "red",
    hint: "Stick figure with red torso, arms crossed firmly in an X shape over chest, head shaking with eyes closed in firm rejection, subtle curved motion lines showing vigorous head shake to say no way.",
  },
  {
    slot: 605,
    name: "batch60_dont",
    word: "don't",
    framing: "bust",
    torso: "red",
    hint: "Stick figure with red torso holding one hand raised high in front with palm facing directly forward in a clear stop and do-not-do-that gesture, serious firm protective expression.",
  },
  {
    slot: 616,
    name: "batch60_cant",
    word: "can't",
    framing: "full",
    torso: "red",
    hint: "Stick figure with red torso standing on tiptoes with both arms stretched high reaching upward for a colorful toy on a very high shelf that is clearly far out of reach, frustrated wincing mouth and small bead of sweat.",
  },
  {
    slot: 617,
    name: "batch60_wont",
    word: "won't",
    framing: "bust",
    torso: "red",
    hint: "Stick figure with red torso folding arms tightly across chest, head turned away to the side with chin raised stubbornly in the air and eyes shut in defiant refusal to say won't.",
  },
  {
    slot: 618,
    name: "batch60_didnt",
    word: "didn't",
    framing: "bust",
    torso: "red",
    hint: "Stick figure with red torso holding both hands open with empty palms facing outward and shoulders slightly raised in an innocent gesture showing they didn't do it, with a clean red cross mark beside them.",
  },
  {
    slot: 678,
    name: "batch60_ow",
    word: "ow",
    framing: "full",
    torso: "red",
    hint: "Stick figure with red torso hopping on one foot while clutching their other foot in both hands, wincing face with tightly closed eyes, mouth open in pain shouting ow, with small yellow star impact sparks by the hurt toe.",
  },
  {
    slot: 685,
    name: "batch60_wait_im_spelling",
    word: "wait, I'm spelling",
    framing: "bust",
    torso: "pink",
    hint: "Stick figure with pink torso holding up one flat palm in a polite wait gesture, while the other hand points to letter blocks spelling A B C on a surface below.",
  },
  {
    slot: 686,
    name: "batch60_guess_my_word",
    word: "guess my word",
    framing: "bust",
    torso: "pink",
    hint: "Stick figure with pink torso smiling playfully with one finger tapping chin, with a clean white thought bubble above showing a bold question mark and colorful letter blocks.",
  },
  {
    slot: 687,
    name: "batch60_oops",
    word: "oops",
    framing: "bust",
    torso: "pink",
    hint: "Stick figure with pink torso with both hands covering their mouth in sudden embarrassment, wide surprised eyes looking out, sheepish oops expression.",
  },
];

async function run() {
  for (const item of BATCH60_ITEMS) {
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
  console.log("Batch 60 image generations completed!");
}

run().catch((err) => {
  console.error("Batch 60 generation error:", err);
  process.exit(1);
});
