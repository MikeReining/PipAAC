import { generateToFile } from "./gen.mjs";
import { existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

export const BATCH74_MUSE_ITEMS = [
  {
    rank: 63,
    word: "yet",
    fileKey: "yet",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of 'yet' (still happening, not yet finished) on a pure white background. A classic clear glass hourglass standing upright, with golden sand actively trickling down through the narrow neck into the bottom bulb, half full. A small neat green forward arrow points to the right next to the hourglass. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 64,
    word: "wear",
    fileKey: "wear",
    framing: "bust",
    social_scale: "solo",
    torso: "green",
    hint: "A minimalist stick figure bust actively putting on and wearing clothes on a pure white background. Pip has head poking through the neck hole of a bright yellow crewneck sweater, pulling it down over the shoulders with both hands. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 65,
    word: "end",
    fileKey: "end",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of 'the end' on a pure white background. A classic black-and-white checkered finish line ribbon tape stretched across, with a red post marker. Crisp clear symbol of finishing and ending. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 66,
    word: "wheel",
    fileKey: "wheel",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of a wheel on a pure white background. A vehicle wheel with a thick black rubber tire with tread grooves, a silver metallic rim with five spokes, and a center hubcap. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 67,
    word: "leave",
    fileKey: "leave",
    framing: "full",
    social_scale: "solo",
    torso: "green",
    hint: "A minimalist stick figure with a solid green torso actively leaving on a pure white background. Pip is walking purposefully through an open rectangular doorway exit threshold away from the room, seen from the side, with a bold green forward arrow at feet pointing out through the door. Crisp action verb of departure, no cheerful waving goodbye. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 68,
    word: "point",
    fileKey: "point",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of the action 'point' on a pure white background. A simple stick figure hand with an extended index finger pointing directly forward at a crisp bright red circular target with a center bullseye dot. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 70,
    word: "shop",
    fileKey: "shop",
    framing: "full",
    social_scale: "solo",
    torso: "green",
    hint: "A minimalist stick figure with a solid green torso actively shopping on a pure white background. Pip is walking forward pushing a clean silver wire shopping cart with wheels, containing groceries like a red apple and a cereal box. Crisp action verb of shopping. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 71,
    word: "kind",
    fileKey: "kind",
    framing: "bust",
    social_scale: "solo",
    torso: "green",
    hint: "A minimalist stick figure bust showing kindness on a pure white background. Pip has a solid green torso and a warm caring gentle smile, holding out a single vibrant red flower with green stem in both hands toward the viewer as a friendly, loving gift. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 72,
    word: "as",
    fileKey: "as",
    framing: "object",
    social_scale: "zero",
    hint: "A clean minimalist depiction of 'as' (meaning 'same as / equal to') on a pure white background. Two identical simple blue solid pillars of exactly the same height standing side by side, with a bold crisp black equals sign '=' floating centered between them. Pure white background, bold black outline, monoline vector clipart.",
  },
  {
    rank: 73,
    word: "miss",
    fileKey: "miss",
    framing: "bust",
    social_scale: "solo",
    torso: "green",
    hint: "A minimalist stick figure bust showing the emotion 'miss' (longing for someone) on a pure white background. Pip has a solid green torso, gently hugging and holding a small rectangular framed portrait photo of a smiling stick figure face close to the chest, with a tender wistful smile and a small soft red heart nearby. Pure white background, bold black outline, monoline vector clipart.",
  },
];

export async function runBatch74Muse() {
  for (const item of BATCH74_MUSE_ITEMS) {
    const outPath = `${BRAIN_DIR}/batch74_muse_${item.fileKey}.png`;
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
  runBatch74Muse();
}
