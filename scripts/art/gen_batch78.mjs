import { generateToFile } from "./gen.mjs";
import { existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

export const BATCH78_MUSE_ITEMS = [
  {
    rank: 115,
    word: "already",
    fileKey: "already",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of 'already' (completed/done) on a pure white background. A neat clipboard checklist with three items, each marked with a crisp bright green checkmark beside it. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 121,
    word: "monster",
    fileKey: "monster",
    framing: "object",
    social_scale: "zero",
    hint: "A friendly, cute little cartoon monster on a pure white background. Round fluffy body, two small silly horns, two big friendly eyes, and a wide happy smile. Non-scary, child-friendly, pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 124,
    word: "place",
    fileKey: "place",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of 'place' (location) on a pure white background. A classic bright red teardrop map pin standing upright on a simple folded paper map with light grey grid lines. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 125,
    word: "bridge",
    fileKey: "bridge",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist stone arch bridge on a pure white background. A graceful curved bridge crossing over calm blue river water ripples below. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 127,
    word: "tail",
    fileKey: "tail",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of an animal tail on a pure white background. A playful bushy red fox tail with a distinctive fluffy white tip, viewed from behind with two small curved motion lines showing a wag. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 128,
    word: "coffee",
    fileKey: "coffee",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist ceramic coffee mug on a pure white background. A classic warm ceramic mug with a sturdy handle, filled with coffee, and two gentle curved steam swirls rising from the top. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 129,
    word: "bump",
    fileKey: "bump",
    framing: "bust",
    social_scale: "solo",
    torso: "green",
    hint: "A minimalist stick figure bust with a solid green torso rubbing a bump on a pure white background. Pip has one hand holding an ice pack gently to a small comical round bump on the forehead, with a mild wincing expression. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 130,
    word: "part",
    fileKey: "part",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of mechanical parts on a pure white background. A classic threaded metal bolt and a matching hexagonal nut sitting side-by-side. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 131,
    word: "rock",
    fileKey: "rock",
    framing: "object",
    social_scale: "zero",
    hint: "A clean solid natural rock on a pure white background. A smooth gray stone boulder with clean geometric facets and subtle shading. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 133,
    word: "party",
    fileKey: "party",
    framing: "object",
    social_scale: "zero",
    hint: "A clean festive celebration icon on a pure white background. A colorful striped cone party hat with a fluffy pom-pom on top, surrounded by cheerful confetti swirls and a curled party horn blower. Pure white background, bold black outline, monoline vector clipart.",
  },
];

export async function runBatch78Muse() {
  for (const item of BATCH78_MUSE_ITEMS) {
    const outPath = `${BRAIN_DIR}/batch78_muse_${item.fileKey}.png`;
    if (existsSync(outPath)) {
      console.log(`[skip] Already exists: ${outPath}`);
      continue;
    }
    console.log(`[muse] Generating #${item.rank} "${item.word}" -> ${outPath}`);
    const opts = {
      word: item.word,
      hint: item.hint,
      framing: item.framing,
      social_scale: item.social_scale,
      out: outPath,
    };
    if (item.torso) opts.torso = item.torso;
    try {
      await generateToFile(opts);
      console.log(`[muse] Done: ${item.word}`);
    } catch (err) {
      console.error(`[muse] Failed for ${item.word}:`, err);
    }
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  runBatch78Muse();
}
