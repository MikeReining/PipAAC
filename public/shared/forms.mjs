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
 *
 * Whose/how-many (022): possessive senses also key on the next word's
 * class — noun pulls his/her's-style forms, EOS pulls mine/yours-style,
 * else base. Plurals need no extra path: "two dogs" is ordinary
 * context evidence (two|dog -> N;PL).
 */
import { senseMerge } from "./funnel.mjs";

/** Pass as `nextSenseId` to say "this word ends the sentence" — Speak
 *  re-picks the last word with it ("it is not my" -> "it is not mine"). */
export const EOS = "eos";

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
/** A row vetoes its ending only when it holds real counts and still
 *  can't pick — a genuine tie. An empty row is no data, not a veto. */
const tied = (counts) =>
  counts && Object.keys(counts).length > 1 && !topForm(counts);

function pickFromLevels(levels, keyFor) {
  for (const lvl of levels) {
    if (tied(keyFor(lvl[lvl.length - 1]))) continue;
    for (const ctx of lvl) {
      const pick = topForm(keyFor(ctx));
      if (pick) return pick;
    }
  }
  return null;
}

/* --- 041 B4 answer table ------------------------------------------------
 * The shipped form_answers table holds the answers the raw corpus
 * produces, keyed by (ending, word, next, worn) — "the longest matching
 * ending wins". Keys are b36 sense ids ("sns_0270" -> "7i") joined with
 * "."; "S." marks the '<s>'-anchored twin; values are index codes into
 * f[] — or null, the tie veto that skips the whole ending. */
const b36 = (id) => String(parseInt(id.slice(4), 10).toString(36));
const k36 = (ctx) =>
  ctx.split(" ").map((w) => (w === "<s>" ? "S" : b36(w))).join(".");
const ansSets = new WeakMap();
const setsFor = (t) => {
  let s = ansSets.get(t);
  if (!s) {
    s = { verbs: new Set(t.verbs), pl: new Set(t.pl),
      nouns: new Set(t.nouns), quants: new Set(t.quants) };
    ansSets.set(t, s);
  }
  return s;
};

function pickFromAns(table, ctxIds, senseId, nextSenseId, currentFeat) {
  const F = table.f, sets = setsFor(table);
  const snid = +senseId.slice(4), s = b36(senseId);
  const n = nextSenseId && nextSenseId !== EOS ? b36(nextSenseId) : null;
  if (snid === table.aSense) {
    const v = n !== null ? table.a?.[n] : undefined;
    return v !== undefined ? F[v] : "BASE";
  }
  if (nextSenseId) {
    if (nextSenseId === EOS) {
      const v = table.e?.[`${s}|${F.indexOf(currentFeat)}`];
      if (v !== undefined) return F[v];
      // The row existed: a worn form stands, BASE defers to context.
      if (table.e?.[`${s}|_`] !== undefined && currentFeat !== "BASE") {
        return currentFeat;
      }
    } else {
      const cls = sets.nouns.has(+nextSenseId.slice(4)) ? "N" : "X";
      const v = table.p?.[`${s}|${n}`] ?? table.p?.[`${s}|${cls}`];
      if (v !== undefined) return F[v];
    }
  }
  const levels = ctxLevels(ctxIds);
  if (n !== null) {
    for (const lvl of levels) {
      if (table.n?.[`${k36(lvl[lvl.length - 1])}|${s}|${n}`] === null) continue;
      for (const ctx of lvl) {
        const v = table.n?.[`${k36(ctx)}|${s}|${n}`];
        if (v !== undefined && v !== null) return F[v];
      }
    }
  }
  const poolName = sets.verbs.has(snid) ? "poolV"
    : sets.pl.has(snid) ? "poolP" : null;
  const quant = sets.quants;
  for (const lvl of levels) {
    if (table.c?.[`${k36(lvl[lvl.length - 1])}|${s}`] === null) continue;
    for (const ctx of lvl) {
      const key = k36(ctx);
      const own = table.c?.[`${key}|${s}`];
      if (own !== undefined && own !== null) return F[own];
      const pool = poolName === "poolP"
          && !ctx.split(" ").some((w) => w.startsWith("sns_") && quant.has(+w.slice(4)))
        ? undefined : poolName ? table[poolName]?.[key] : undefined;
      if (pool !== undefined) return F[pool];
    }
  }
  return "BASE";
}

/**
 * @param table  parsed form_answers.en.json (or the raw corpus table —
 *               the parity test drives both through one signature)
 * @param ctxIds  sense ids of the items before this word (folded — the
 *                caller merges has->have etc. the same way the bar does)
 * @param senseId the word's sense id
 * @param nextSenseId the next word's sense id, when known (decision 4)
 * @param currentFeat the feature the word already wears — EOS competes
 *                    against it ("not you" stays you on BASE 73k, while
 *                    "not your" lifts to yours: ABS 2806 > POSS 1099)
 * @returns the winning features tag ("BASE" = the lemma/default label)
 */
export function pickForm(table, ctxIds, senseId, nextSenseId = null,
  currentFeat = "BASE") {
  if (table?.c) {
    return pickFromAns(table, ctxIds, senseId, nextSenseId, currentFeat);
  }
  if (!table?.contexts) return "BASE";

  // a / an is decided by the next word alone, learned from caregivers.
  if (senseId === table.aSense) {
    if (nextSenseId) {
      const pick = topForm(table.aAn?.[nextSenseId]);
      if (pick) return pick;
    }
    return "BASE";
  }

  // Whose (022): a pronoun or 's-noun's form keys on the NEXT word —
  // a noun pulls the attributive form (his dog, mommy's knee), EOS pulls
  // the absolute form (it's mine). Other nexts are word-specific:
  // "your turn" wins its own row (turn is a Verb on paper), a thin row
  // falls back to the X class (you want -> you).
  if (nextSenseId) {
    const cls = nextSenseId === EOS ? "EOS"
      : table.nounSenses?.includes(nextSenseId) ? "N" : "X";
    // EOS is the app's Speak signal, not a natural position — the only
    // honest "lift" at sentence end is the whose-family (my -> mine,
    // your -> yours). The worn feature competes: candidates are the
    // current form plus the possessive class, and the data decides.
    // "that is her" stays her (ACC 16.7k out-speaks ABS 201); "it is
    // not your" becomes yours (ABS 2806 > POSS 1099); a bare "not you"
    // stays you because BASE's 73k dwarfs the whose rows.
    if (cls === "EOS") {
      const row = table.possNext?.[`${senseId}|EOS`];
      if (row) {
        const cands = { [currentFeat]: 1, "PRO;POSS": 1,
          "PRO;POSS;ABS": 1, "N;POSS": 1 };
        let best = null;
        for (const [feat, n] of Object.entries(row))
          if (cands[feat] && (!best || n > row[best])) best = feat;
        if (best && best !== currentFeat) return best;
        // No lift: a worn form stands ("that is her" stays her) — EOS
        // never flattens a picked form to base. A bare word defers to
        // the context endings, which still know "like him".
        if (currentFeat !== "BASE") return currentFeat;
      }
    } else {
      const pick = topForm(table.possNext?.[`${senseId}|x|${nextSenseId}`])
        ?? topForm(table.possNext?.[`${senseId}|${cls}`]);
      if (pick) return pick;
    }
  }

  const levels = ctxLevels(ctxIds);
  if (nextSenseId && table.nextVerb) {
    const pick = pickFromLevels(levels,
      (ctx) => table.nextVerb[`${ctx}|${senseId}|${nextSenseId}`]);
    if (pick) return pick;
  }
  // Every source speaks at the same phrase length before a shorter
  // phrase gets a say: the word's own row and the pooled row (all
  // verbs / all plural nouns) answer together at each ending. On a
  // disagreement the pool overturns own only when the pool clearly
  // prefers something else — its winner must beat the own pick's
  // share inside the pool 2:1 ("<s> you" says ING on 7% of verbs, so
  // BASE wins and "you turn" stays; "<s> mom" says 3SG nearly half
  // the time, so "mom wants" stands). A tied own-ending still vetoes
  // the whole level ("my mom" can't decide like/likes — "mom" does).
  const isPl = table.plSenses?.includes(senseId);
  const pooledTable = table.verbSenses?.includes(senseId) ? table.verbFree
    : isPl ? table.plFree : null;
  const quant = new Set(table.quantSenses ?? []);
  for (const lvl of levels) {
    if (tied(table.contexts[`${lvl[lvl.length - 1]}|${senseId}`])) continue;
    for (const ctx of lvl) {
      const own = table.contexts[`${ctx}|${senseId}`];
      // A plural pool row only exists where the phrase asks "how
      // many" — without a quantifier in the tapped ctx it was never
      // counted, so it must not answer either ("they house" stays).
      const pooled = (isPl && !ctx.split(" ").some((w) => quant.has(w)))
        ? null : pooledTable?.[ctx];
      const ownPick = topForm(own);
      const pooledPick = topForm(pooled);
      let pick = ownPick ?? pooledPick;
      if (ownPick && pooledPick && ownPick !== pooledPick
          && pooled[pooledPick] >= 2 * (pooled[ownPick] ?? 0)) {
        pick = pooledPick;
      }
      if (pick) return pick;
    }
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

const labelCache = new WeakMap(); // db -> Map(locale -> {lemma, forms, merged})
function labelsFor(db) {
  /* 043 G — every label this cache serves belongs to the profile's
   * speaking language; the profile row is the truth owner (schema
   * §6.1). Keying {db, lang} means a language switch can never serve
   * the old language's rows, and a German lemma in the catalog can
   * never surface on an English board (the "Saft" defect). */
  const locale = db.prepare(
    "SELECT locale AS l FROM learner_profile ORDER BY rowid LIMIT 1",
  ).all()[0]?.l ?? "en";
  let byLang = labelCache.get(db);
  if (!byLang) labelCache.set(db, byLang = new Map());
  let c = byLang.get(locale);
  if (c) return c;
  c = { lemma: new Map(), forms: new Map(), merged: new Map() };
  for (const l of db.prepare(
    `SELECT id, sense_id, kind, text, features, utterance_id FROM label
      WHERE status = 'approved' AND locale = ?`,
  ).all(locale)) {
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
  byLang.set(locale, c);
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
export function formFor(db, table, sentenceItems, senseId, nextItem = null,
  currentFeat = "BASE") {
  const L = labelsFor(db);
  const merged = L.merged.get(senseId);
  if (merged?.lbl) {
    return { senseId: merged.kept, labelId: merged.lbl.id,
      text: merged.lbl.text, utterance_id: merged.lbl.utterance_id,
      features: merged.lbl.features ?? "BASE", merged: true };
  }
  const ctxIds = ctxIdsOf(db, sentenceItems);
  const nextId = nextItem === EOS ? EOS
    : !nextItem ? null
    : nextItem.kind === "sense"
      ? (L.merged.get(nextItem.id)?.kept ?? nextItem.id)
      : nextItem.kind === "entity" ? (L.entitySense.get(nextItem.id) ?? null) : null;
  const features = pickForm(table, ctxIds, senseId, nextId, currentFeat);
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
