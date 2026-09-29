/**
 * Owner-slot rows from the launch lexicon (one row per spoken lemma).
 */

import { normalizeV1 } from "../../public/shared/normalize.mjs";
import { catalogSlug } from "./elevenlabs_tile_variations.mjs";
import { loadLexicon } from "./wbb_audio.mjs";

/** @returns {Array<{ slot: number, spokenText: string, slug: string, utterance_id: string }>} */
export function listLaunchLemmaRows() {
  const lexicon = loadLexicon();
  const ownerSlotByNorm = new Map();
  for (const e of lexicon.entries) {
    const n = normalizeV1(e.spokenText);
    ownerSlotByNorm.set(n, Math.min(ownerSlotByNorm.get(n) ?? Infinity, e.slot));
  }
  const rows = [];
  for (const e of lexicon.entries) {
    const owner = ownerSlotByNorm.get(normalizeV1(e.spokenText));
    if (owner !== e.slot) continue;
    rows.push({
      slot: e.slot,
      spokenText: e.spokenText,
      slug: catalogSlug(e.spokenText),
      utterance_id: `utt_${String(owner).padStart(4, "0")}`,
    });
  }
  rows.sort((a, b) => a.slot - b.slot);
  return rows;
}
