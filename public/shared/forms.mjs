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
import { senseMerge } from "./funnel.mjs";

/** Endings of the context longest-first. Each level pairs the
 *  '<s>'-anchored twin (when the ending reaches sentence start) with the
 *  plain ending — the same phrase, narrower position. */
function ctxLevels(ctxIds) {
  const out = [];
  for (let len = Math.min(4, ctxIds.length); len >= 1; len--) {
    const key = ctxIds.slice(-len).join(" ");
    const lvl = [key];
    if (len === ctxIds.length && len <= 4) lvl.unshift("<s> " + key);
    out.push(lvl);
  }
  if (ctxIds.length === 0) out.push(["<s>"]);
  return out;
}

/** Top feature tag, or null when the data can't pick — either no counts
 *  or a top tie ("my mom" said like 2x and likes 2x). */
const topForm = (counts) => {
  const s = Object.entries(counts ?? {}).sort((a, b) => b[1] - a[1]);
  return s[0] && !(s[1] && s[1][1] === s[0][1]) ? s[0][0] : null;
};

/** Walk endings longest-first; `keyFor(ctx)` returns the count-map for
 *  a context key or undefined. A tie doesn't decide — the pick falls
 *  through to the shorter phrase ("my mom" ties like/likes 2-2, so
 *  "mom" answers: likes 97:85). The anchored twin keeps its priority
 *  within the same ending, but when the ending's broad evidence ties
 *  the whole ending is undecided — a thin line-start subset can't
 *  rescue a coin flip. */
function pickFromLevels(levels, keyFor) {
  for (const lvl of levels) {
    const broad = keyFor(lvl[lvl.length - 1]);
    if (broad && !topForm(broad)) continue;
    for (const ctx of lvl) {
      const pick = topForm(keyFor(ctx));
      if (pick) return pick;
    }
  }
  return null;
}

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

  const levels = ctxLevels(ctxIds);
  if (nextSenseId && table.nextVerb) {
    const pick = pickFromLevels(levels,
      (ctx) => table.nextVerb[`${ctx}|${senseId}|${nextSenseId}`]);
    if (pick) return pick;
  }
  const pick = pickFromLevels(levels,
    (ctx) => table.contexts[`${ctx}|${senseId}`]);
  if (pick) return pick;
  if (table.verbSenses?.includes(senseId)) {
    const pooled = pickFromLevels(levels, (ctx) => table.verbFree?.[ctx]);
    if (pooled) return pooled;
  }
  return "BASE";
}

/* --- 021 slice 4: the app's layer. `formFor` answers "what does this
 * word read and say right now" — the label the cell shows, the sentence
 * item stores, and the log row records. The sense id never changes;
 * only the label and its utterance do. Sense identity, phrase history,
 * and the bar's ctx keys are untouched — ranking still reads item ids.
 *
 * Merged senses (him folds into he) are fixed-form tiles: the cell
 * always shows the merged lemma's own text, and a tap adds the KEPT
 * sense wearing that form's label. */

const labelCache = new WeakMap(); // db -> { lemma: Map, forms: Map, merged: Map }
function labelsFor(db) {
  let c = labelCache.get(db);
  if (c) return c;
  c = { lemma: new Map(), forms: new Map(), merged: new Map() };
  for (const l of db.prepare(
    `SELECT id, sense_id, kind, text, features, utterance_id FROM label
      WHERE status = 'approved'`,
  ).all()) {
    if (l.kind === "lemma") c.lemma.set(l.sense_id, l);
    else if (l.kind === "form") {
      const key = `${l.sense_id}|${l.features}`;
      if (!c.forms.has(key)) c.forms.set(key, l);
    }
  }
  // Merged-sense tiles: 'him' is a sense AND a form of 'he' — the
  // merged cell is a fixed form, so a tap yields the kept sense + the
  // form label whose text is the merged lemma.
  for (const [gone, kept] of senseMerge(db)) {
    const goneLemma = c.lemma.get(gone);
    if (!goneLemma) continue;
    const lbl = [...c.forms.values()].find(
      (f) => f.sense_id === kept && f.text === goneLemma.text);
    c.merged.set(gone, { kept, lbl: lbl ?? c.lemma.get(kept) });
  }
  // Stand-in links (014): an entity the enrichment mapped to a catalog
  // word (Mama -> mom) contributes that word's grammar evidence —
  // "Mama need" picks like "mom need". An unlinked name is still a
  // wall. Latest ready suggestion wins, same as entityForSense.
  c.entitySense = new Map();
  for (const r of db.prepare(
    `SELECT r.entity_id AS e, r.sense_suggestion AS s
       FROM entity_enrichment r
       JOIN personal_entity p ON p.id = r.entity_id
      WHERE r.status = 'ready' AND p.status = 'active'
      ORDER BY r.rowid ASC`,
  ).all()) c.entitySense.set(r.e, r.s);
  labelCache.set(db, c);
  return c;
}

export function grammarHelpOn(db) {
  return (db.prepare(
    "SELECT grammar_help AS g FROM learner_profile WHERE id = 'prf_local'",
  ).all()[0]?.g ?? 1) === 1;
}

/** Fold the live sentence into ctx ids; walls (unlinked entities, typed
 *  words, unknown senses) break the context just like the table build
 *  did. A stand-in entity feeds its word's sense (Mama reads as mom). */
function ctxIdsOf(db, items) {
  const L = labelsFor(db);
  const ids = [];
  for (let i = items.length - 1; i >= 0 && ids.length < 4; i--) {
    const it = items[i];
    let id = it.kind === "sense" ? it.id
      : it.kind === "entity" ? L.entitySense.get(it.id) : null;
    if (!id) break;
    ids.unshift(senseMerge(db).get(id) ?? id);
  }
  return ids;
}

/**
 * The display/speech form of a sense right now.
 * @returns { senseId, labelId, text, utterance_id, features } — senseId
 *   is the kept sense for merged tiles (caller stores THAT in the item).
 *   BASE features = the lemma label (id so the log records it).
 */
export function formFor(db, table, sentenceItems, senseId, nextItem = null) {
  const L = labelsFor(db);
  const merged = L.merged.get(senseId);
  if (merged?.lbl) {
    return { senseId: merged.kept, labelId: merged.lbl.id,
      text: merged.lbl.text, utterance_id: merged.lbl.utterance_id,
      features: merged.lbl.features ?? "BASE", merged: true };
  }
  const ctxIds = ctxIdsOf(db, sentenceItems);
  const nextId = !nextItem ? null
    : nextItem.kind === "sense"
      ? (L.merged.get(nextItem.id)?.kept ?? nextItem.id)
      : nextItem.kind === "entity" ? (L.entitySense.get(nextItem.id) ?? null) : null;
  const features = pickForm(table, ctxIds, senseId, nextId);
  const lbl = (features === "BASE" ? null : L.forms.get(`${senseId}|${features}`))
    ?? L.lemma.get(senseId);
  return { senseId, labelId: lbl?.id ?? null, text: lbl?.text ?? null,
    utterance_id: lbl?.utterance_id ?? null, features };
}

/** What a word's label reads when Grammar help is off — the lemma. */
export function defaultForm(db, senseId) {
  const lbl = labelsFor(db).lemma.get(senseId);
  return { senseId, labelId: lbl?.id ?? null, text: lbl?.text ?? null,
    utterance_id: lbl?.utterance_id ?? null, features: "BASE" };
}
