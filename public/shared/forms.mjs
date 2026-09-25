/**
 * Grammar-help form choice (021): for a word that has forms, pick the
 * one the data says follows these words before. THE RULE: the longest
 * ending of the words before that has counts for this word → its top
 * form; for a verb with no per-word counts, the pooled verb table's
 * longest ending → that shape; otherwise the word's own default
 * (BASE). No threshold — the top form wins even at 51%.
 *
 * The table ships as data/prediction/form_table.en.json (counts on
 * sense ids, ctx = 1–4 preceding sense ids, '<s>' anchors at line
 * start, walls where a word isn't a catalog sense). Counted and chosen
 * by measure_forms.mjs on the held-out split.
 *
 * Decision 4 (the next word decides): when `nextSenseId` is given, the
 * verb's next-word table answers first — "what do" stays "do" until
 * "he" arrives, then reads "does". For the a-sense the next word is
 * the whole question, from caregiver lines only.
 */

/** Endings of the context longest-first, with the '<s>'-anchored twin
 *  of the ending that reaches sentence start. */
function ctxKeys(ctxIds) {
  const out = [];
  for (let len = Math.min(4, ctxIds.length); len >= 1; len--) {
    const key = ctxIds.slice(-len).join(" ");
    if (len === ctxIds.length && len <= 4) out.push("<s> " + key);
    out.push(key);
  }
  if (ctxIds.length === 0) out.push("<s>");
  return out;
}

const topForm = (counts) =>
  Object.entries(counts ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

/**
 * @param table  parsed form_table.en.json
 * @param ctxIds  sense ids of the items before this word (folded — the
 *                caller merges has->have etc. the same way the bar does)
 * @param senseId the word's sense id
 * @param nextSenseId the next word's sense id, when known (decision 4)
 * @returns the winning features tag ("BASE" = the lemma/default label)
 */
export function pickForm(table, ctxIds, senseId, nextSenseId = null) {
  if (!table?.contexts) return "BASE";

  // a / an is decided by the next word alone, learned from caregivers.
  if (senseId === table.aSense) {
    if (nextSenseId) {
      const pick = topForm(table.aAn?.[nextSenseId]);
      if (pick) return pick;
    }
    return "BASE";
  }

  const keys = ctxKeys(ctxIds);
  if (nextSenseId && table.nextVerb) {
    for (const ctx of keys) {
      const row = table.nextVerb[`${ctx}|${senseId}|${nextSenseId}`];
      const pick = row && topForm(row);
      if (pick) return pick;
    }
  }
  for (const ctx of keys) {
    const row = table.contexts[`${ctx}|${senseId}`];
    const pick = row && topForm(row);
    if (pick) return pick;
  }
  if (table.verbSenses?.includes(senseId)) {
    for (const ctx of keys) {
      const pick = topForm(table.verbFree?.[ctx]);
      if (pick) return pick;
    }
  }
  return "BASE";
}
