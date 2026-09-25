/**
 * Slice 3 strip — phrase-history ranking (smart bar v2).
 *
 * One rule: after every tap, rank candidate next items by the RELATIVE
 * frequency of what came next after the ENTIRE phrase built so far —
 * never the previous word, never total frequency. Three tables merged
 * in order, deduplicated:
 *   1. her own sentences that started within 90 minutes of now (any day)
 *   2. her own sentences, any time
 *   3. children in general (the shipped CHILDES phrase table)
 * An unseen phrase backs off to its longest seen ending, then shorter
 * endings, down to the last item; a mid-sentence phrase never falls
 * back to the empty phrase — "" means "start of a sentence". A word
 * shows only with evidence (EVIDENCE_GATE): an empty slot beats a weak
 * word. No model, no weights, no learned parameters.
 */

import { pathTimes, wpmStats, wrongPicks } from "./stats.mjs";

const STRIP_CAP = 4;
export { STRIP_CAP };

/** Her "now" table: sentence starts within +-90 minutes of the current
 *  local time of day, any day. */
export const HER_NOW_MIN = 90;

/** The evidence gate — starting values, to be confirmed on the
 *  reference replay: she tapped it after this ending at least
 *  `herMin` times, or children follow this ending with it at least
 *  `kidShare` of the time AND that ending was seen `kidMin` times.
 *  Values set on the 20-row Ava gate check (scripts/prediction/
 *  phrase_jev/gate_check_v2.mjs): 3% let CHILDES-attested noise through
 *  ("go"->"go" at 6.4%); 8% cost a real hit ("i want"->"a"); 7% is the
 *  edge that drops the nonsense tile without losing hits. */
export const EVIDENCE_GATE = { herMin: 2, kidShare: 0.07, kidMin: 30 };

/** Ranked candidates kept on a strip moment for later evaluation. */
const RANKED_CAP = 16;

const TO_SENSE_ID = "sns_0053"; // infinitival "to" — matched by sense id, never by English text

/**
 * Sentence-position rules per locale (docs/phases/003b slice 3). A locale
 * with no entry gets no invitations — keyboard continuations then rank
 * by bigrams and frequency only. A wrong rule is worse than no rule:
 * German word order is not English word order.
 */
export const GRAMMAR = {
  en: {
    invitesNoun: ({ pos }) => pos === "Verb" || pos === "Preposition",
    invitesVerb: ({ pos, prevPos, tailId }) =>
      pos === "Pronoun" || (pos === "Preposition" && tailId === TO_SENSE_ID && prevPos === "Verb"),
  },
};

/**
 * Sentence lifecycle (schema §6.2c): a sentence opens on the first pick
 * of a bar and ends spoken or cleared. The log records which sentence
 * each pick belonged to and its position, so phrase contexts never
 * cross a Speak or Clear.
 */
export function openSentence(db, at = Date.now()) {
  db.prepare("INSERT INTO sentence (started_at, tz_offset_min) VALUES (?, ?)").run(
    at,
    -new Date(at).getTimezoneOffset(),
  );
  return db.prepare("SELECT last_insert_rowid() AS id").all()[0].id;
}

export function closeSentence(db, id, at = Date.now(), kind) {
  const open = db.prepare(
    "SELECT 1 AS ok FROM sentence WHERE id = ? AND end_kind IS NULL",
  ).all(id)[0];
  if (!open) return;
  db.prepare(
    "UPDATE sentence SET ended_at = ?, end_kind = ? WHERE id = ? AND end_kind IS NULL",
  ).run(at, kind, id);
  // Only spoken sentences become history — a cleared bar was never said.
  if (kind === "spoken") {
    recordPhraseHistory(db, id);
    const prev = phraseBuilt.get(db);
    if (prev !== undefined) phraseBuilt.set(db, Math.max(prev, id));
  }
}

const itemKey = (it) => `${it.kind}:${it.id}`;
const ctxKey = (items) => items.map(itemKey).join(" ");

/** A pick left the sentence (backspace reopened it): its event stays as
 *  usage evidence but is no longer a sentence member, and the rest of
 *  the sentence shifts down one position. `detached_at` stamps when it
 *  left — a fast strip-pick removal is a wrong pick (017-28). Detached
 *  events carry position NULL and never enter phrase history. */
export function detachEvent(db, sentenceId, position, at = Date.now()) {
  db.prepare(
    "UPDATE learner_event_log SET sentence_id = NULL, position = NULL, detached_at = ? WHERE sentence_id = ? AND position = ?",
  ).run(at, sentenceId, position);
  db.prepare(
    "UPDATE learner_event_log SET position = position - 1 WHERE sentence_id = ? AND position > ?",
  ).run(sentenceId, position);
}

export function logSelection(db, kind, id, at = Date.now(), ctx = {}) {
  db.prepare(
    `INSERT INTO learner_event_log
       (item_kind, item_id, selected_at, sentence_id, position, source, tz_offset_min, spotlit)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    kind, id, at,
    ctx.sentenceId ?? null, ctx.position ?? null, ctx.source ?? null,
    -new Date(at).getTimezoneOffset(), ctx.spotlit ? 1 : 0,
  );
}

/** One row per (ending, next item) pair of the spoken sentence: the
 *  empty ctx counts sentence-start items only; every other ctx is a
 *  SUFFIX of a prefix — "what came next after this ending" is what the
 *  bar asks, so endings are what gets stored. Plain counts — no decay,
 *  no weights; the evidence gate reads them raw. */
function recordPhraseHistory(db, sentenceId) {
  const picks = db.prepare(
    `SELECT item_kind AS kind, item_id AS id
     FROM learner_event_log
     WHERE sentence_id = ? AND position IS NOT NULL
     ORDER BY position`,
  ).all(sentenceId);
  const put = db.prepare(
    `INSERT INTO phrase_count (ctx, item_kind, item_id, n)
     VALUES (?, ?, ?, 1)
     ON CONFLICT (ctx, item_kind, item_id) DO UPDATE SET n = n + 1`,
  );
  for (let j = 0; j < picks.length; j++) {
    for (let len = j === 0 ? 0 : 1; len <= j; len++) {
      put.run(ctxKey(picks.slice(j - len, j)), picks[j].kind, picks[j].id);
    }
  }
}

/** phrase_count is a derived cache of learner_event_log. Rebuild it
 *  once per app session (cheap insurance against drift), then keep it
 *  current incrementally — synced sentences land as new local rows and
 *  are picked up by the id watermark the same way. */
const phraseBuilt = new WeakMap(); // db -> highest spoken sentence id counted
function ensurePhraseHistory(db) {
  const prev = phraseBuilt.get(db);
  if (prev === undefined) {
    db.exec("DELETE FROM phrase_count");
    const sids = db.prepare(
      "SELECT id FROM sentence WHERE end_kind = 'spoken' ORDER BY id").all();
    for (const s of sids) recordPhraseHistory(db, s.id);
    phraseBuilt.set(db, sids.length ? sids[sids.length - 1].id : 0);
    return;
  }
  const sids = db.prepare(
    "SELECT id FROM sentence WHERE end_kind = 'spoken' AND id > ? ORDER BY id",
  ).all(prev);
  for (const s of sids) recordPhraseHistory(db, s.id);
  if (sids.length) phraseBuilt.set(db, sids[sids.length - 1].id);
}

/** Local clock minute of a timestamp (ms) under its own tz_offset_min. */
const minuteOfDay = (atMs, tzOffsetMin) => {
  const m = (Math.floor(atMs / 60000) + (tzOffsetMin ?? 0)) % 1440;
  return (m + 1440) % 1440;
};

/** Her sentences that started within HER_NOW_MIN of `nowMin`: built
 *  live per paint — the window is small, so the set of sentences and
 *  their member events is a short list. Returns Map ctx -> rows. */
function herNowTable(db, nowMin, tzNow) {
  const starts = db.prepare(
    `SELECT e.sentence_id AS sid, e.selected_at AS at, e.tz_offset_min AS tz
     FROM learner_event_log e JOIN sentence s ON s.id = e.sentence_id
     WHERE e.position = 0 AND s.end_kind = 'spoken'`,
  ).all();
  const ids = starts
    .filter((r) => Math.abs(minuteOfDay(r.at, r.tz ?? tzNow) - nowMin) <= HER_NOW_MIN)
    .map((r) => r.sid);
  const table = new Map();
  if (!ids.length) return table;
  const add = (ctx, kind, id) => {
    if (!table.has(ctx)) table.set(ctx, []);
    const rows = table.get(ctx);
    const hit = rows.find((r) => r.kind === kind && r.id === id);
    if (hit) hit.n++; else rows.push({ kind, id, n: 1 });
  };
  let cur = null;
  for (const e of db.prepare(
    `SELECT sentence_id AS sid, item_kind AS kind, item_id AS id
     FROM learner_event_log
     WHERE sentence_id IN (${ids.map(Number).join(",")})
       AND position IS NOT NULL
     ORDER BY sid, position`,
  ).all()) {
    if (cur === null || cur.sid !== e.sid) cur = { sid: e.sid, pos: 0, items: [] };
    for (let len = cur.pos === 0 ? 0 : 1; len <= cur.pos; len++) {
      add(ctxKey(cur.items.slice(cur.pos - len)), e.kind, e.id);
    }
    cur.items.push({ kind: e.kind, id: e.id });
    cur.pos++;
  }
  return table;
}

/** All-her-history rows for the phrase's endings only (a phrase has at
 *  most its own length + 1 endings to try). Returns Map ctx -> rows. */
function herAllRows(db, endings) {
  const table = new Map();
  const keys = endings.map(ctxKey);
  if (!keys.length) return table;
  for (const r of db.prepare(
    `SELECT ctx, item_kind AS kind, item_id AS id, n
     FROM phrase_count WHERE ctx IN (${keys.map(() => "?").join(",")})`,
  ).all(...keys)) {
    if (!table.has(r.ctx)) table.set(r.ctx, []);
    table.get(r.ctx).push({ kind: r.kind, id: r.id, n: r.n });
  }
  return table;
}

/** The phrase's endings longest-first: a non-empty phrase walks itself
 *  down to its last item and never reaches "" — the empty phrase means
 *  "start of a sentence". */
function endingsOf(phrase) {
  const out = [];
  const last = phrase.length ? phrase.length - 1 : 0;
  for (let s = 0; s <= last; s++) out.push(phrase.slice(s));
  return out;
}

/** Ranked next items under one table: walk the whole ending chain —
 *  a longer ending's followers first, shorter endings only fill what
 *  is missing. Each item carries the count, share, and total of the
 *  ending that first contributed it. */
function lookupRanked(getRows, phrase) {
  const ranked = [];
  const seen = new Set();
  for (const ending of endingsOf(phrase)) {
    const rows = getRows(ending);
    if (!rows?.length) continue;
    const total = rows.reduce((a, r) => a + r.n, 0);
    const sorted = [...rows].sort(
      (a, b) => b.n - a.n || itemKey(a).localeCompare(itemKey(b)));
    for (const r of sorted) {
      const k = itemKey(r);
      if (seen.has(k)) continue;
      seen.add(k);
      ranked.push({ kind: r.kind, id: r.id, n: r.n, share: r.n / total, total });
    }
  }
  return ranked;
}

/** The shipped children table lookup. Keys are space-joined sense ids;
 *  an ending holding an entity (or anything but senses) cannot be a
 *  children context — children in general never know her names. */
function kidsRows(kidsTable, ending) {
  if (!kidsTable?.contexts || ending.some((it) => it.kind !== "sense")) return null;
  const row = kidsTable.contexts[ending.map((it) => it.id).join(" ")];
  if (!row) return null;
  return Object.entries(row).map(([id, n]) => ({ kind: "sense", id, n }));
}

/** Senses the caregiver hid never enter the bar (Masking § 2). */
function maskedSenses(db) {
  return new Set(
    db.prepare("SELECT sense_id FROM sense_mask WHERE status = 'hidden'").all()
      .map((r) => r.sense_id));
}

/**
 * The strip's ranked candidates with their evidence, and the gated
 * offer. Merged table order: her-now, her-any, children. A candidate's
 * `her` field is its best count after its contributing ending across
 * her two tables; `kid` is the children ending's share and total.
 */
export function stripRanked(db, sentence, now, locale, kidsTable = null) {
  ensurePhraseHistory(db);
  const phrase = sentence.map((it) => ({ kind: it.kind, id: it.id }));
  const tzNow = -new Date(now).getTimezoneOffset();
  const nowMin = minuteOfDay(now, tzNow);
  const endings = endingsOf(phrase);

  const nowTbl = herNowTable(db, nowMin, tzNow);
  const allTbl = herAllRows(db, endings);
  const kids = locale === "en" ? kidsTable : null;

  const herNow = lookupRanked((e) => nowTbl.get(ctxKey(e)), phrase);
  const herAll = lookupRanked((e) => allTbl.get(ctxKey(e)), phrase);
  const kidRank = lookupRanked((e) => kidsRows(kids, e), phrase);

  const merged = [];
  const seen = new Set();
  const sources = new Map(); // item key -> {her, kid:{share,total}}
  const mark = (ranked, src) => {
    for (const r of ranked) {
      const k = itemKey(r);
      const rec = sources.get(k) ?? {};
      if (src === "kids") rec.kid = { share: r.share, total: r.total };
      else rec.her = Math.max(rec.her ?? 0, r.n);
      sources.set(k, rec);
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push({ kind: r.kind, id: r.id, src });
    }
  };
  mark(herNow, "now");
  mark(herAll, "all");
  mark(kidRank, "kids");

  const masked = maskedSenses(db);
  const ranked = merged.map((c) => {
    const ev = sources.get(itemKey(c)) ?? {};
    return {
      ...c, her: ev.her ?? 0, kid: ev.kid ?? null,
      mask: c.kind === "sense" && masked.has(c.id) ? 1 : 0,
    };
  });
  const gated = ranked
    .filter((c) => c.her >= EVIDENCE_GATE.herMin
      || (c.kid && c.kid.share >= EVIDENCE_GATE.kidShare && c.kid.total >= EVIDENCE_GATE.kidMin))
    .filter((c) => !c.mask)
    .slice(0, STRIP_CAP);
  const shown = gated.map((c) => ({ kind: c.kind, id: c.id }));
  // The stored list keeps the top RANKED_CAP plus every shown tile —
  // a gated item beyond the cap still records its evidence on the row.
  const stored = ranked.slice(0, RANKED_CAP);
  for (const c of gated) if (!stored.includes(c)) stored.push(c);
  return { ranked: stored, shown };
}

/**
 * The gated strip tiles — up to STRIP_CAP, fewer when evidence is thin.
 *
 * @returns {Array<{kind:'sense'|'entity', id:string}>}
 */
export function stripCandidates(db, sentence, now = Date.now(), locale, kidsTable = null, cap = STRIP_CAP) {
  if (typeof locale !== "string" || locale.length === 0) {
    throw new Error("locale is a required parameter");
  }
  return stripRanked(db, sentence, now, locale, kidsTable).shown.slice(0, cap);
}

/** The group of the top-ranked candidate, for the group list's glow —
 *  "the next word probably lives here". Empty when the bar is empty. */
export function likelyGroups(db, sentence, now, locale, kidsTable = null) {
  const { shown, ranked } = stripRanked(db, sentence, now, locale, kidsTable);
  const top = shown[0] ?? ranked[0];
  if (!top) return new Set();
  return new Set(
    db.prepare(
      "SELECT group_id FROM group_cell WHERE item_kind = ? AND item_id = ?",
    ).all(top.kind, top.id).map((r) => r.group_id),
  );
}

/* --- The instrument (§ 5.7): strip_impression ------------------------ */

/**
 * One strip moment: the ranking the bar had and the tiles it showed.
 * `candidates` are stripRanked entries — {kind, id, src, her, kid} —
 * enough evidence for the stored gate to replay exactly. `chosen_*`
 * stays NULL until the next pick (fillChosen); a cleared sentence
 * leaves them NULL: metrics only, never a training example.
 */
export function logImpression(db, {
  sentenceId, position, shownAt = Date.now(), candidates, shown,
  mode = "picture", gate = null, shortlistCap = null,
}) {
  db.prepare(
    `INSERT INTO strip_impression
       (sentence_id, position, shown_at, candidates, shown_local,
        weight_set, mode, gate, shortlist_cap)
     VALUES (?, ?, ?, ?, ?, 'phrase_history', ?, ?, ?)`,
  ).run(
    sentenceId, position, shownAt,
    JSON.stringify(candidates), JSON.stringify(shown), mode,
    gate ? JSON.stringify(gate) : null, shortlistCap,
  );
  return db.prepare("SELECT last_insert_rowid() AS id").all()[0].id;
}

/** What was actually painted — written by the painter, never the
 *  ranker, so a stored moment replays what was on screen (017-5). */
export function stampShownFinal(db, impressionId, shownKeys) {
  db.prepare(
    "UPDATE strip_impression SET shown_final = ? WHERE id = ?",
  ).run(JSON.stringify(shownKeys), impressionId);
}

/**
 * Replay a stored phrase-history moment: recompute the gate from the
 * stored candidates and compare against shown_local — and, when the
 * painter stamped it, shown_final. Pre-v2 rows (feature vectors,
 * weights) cannot replay under the new rule; they report as such.
 */
export function replayImpression(row) {
  if (row.weight_set !== "phrase_history") {
    return { ok: false, diffs: [`weight_set ${row.weight_set} — pre-v2 row`] };
  }
  if (row.mode === "keyboard") {
    return { ok: false, diffs: ["keyboard row — continuations are metrics only"] };
  }
  const diffs = [];
  const cands = JSON.parse(row.candidates);
  const g = { ...EVIDENCE_GATE, ...(row.gate ? JSON.parse(row.gate) : {}) };
  const shown = cands
    .filter((c) => (c.her ?? 0) >= g.herMin
      || (c.kid && c.kid.share >= g.kidShare && c.kid.total >= g.kidMin))
    .filter((c) => !c.mask)
    .slice(0, row.shortlist_cap ?? STRIP_CAP)
    .map((c) => `${c.kind}:${c.id}`);
  const stored = JSON.parse(row.shown_local);
  if (JSON.stringify(shown) !== JSON.stringify(stored))
    diffs.push(`shown_local ${JSON.stringify(stored)} != ${JSON.stringify(shown)}`);
  const fin = row.shown_final ? JSON.parse(row.shown_final) : null;
  if (fin && JSON.stringify(fin) !== JSON.stringify(stored)
      && JSON.stringify(fin) !== JSON.stringify(shown))
    diffs.push(`shown_final ${JSON.stringify(fin)} != shown`);
  return { ok: diffs.length === 0, diffs, localShown: shown, finalShown: fin ?? shown };
}

/** The child's next pick is the label for the strip moment before it. */
export function fillChosen(db, sentenceId, { kind, id, source }) {
  db.prepare(
    `UPDATE strip_impression SET chosen_kind = ?, chosen_id = ?, chosen_source = ?
     WHERE id = (
       SELECT id FROM strip_impression
       WHERE sentence_id = ? AND chosen_id IS NULL
       ORDER BY position DESC, id DESC LIMIT 1)`,
  ).run(kind, id, source, sentenceId);
}

/**
 * What the strip is worth (§ 5.7), measured on what was picked — never
 * on the ranker's own report. Only impressions that got a next pick
 * count toward the denominators.
 */
export function predictionReport(db, { from = 0, to = Number.MAX_SAFE_INTEGER } = {}) {
  const rows = db
    .prepare(
      `SELECT candidates, COALESCE(shown_final, shown_local) AS shown,
         chosen_kind, chosen_id, chosen_source
       FROM strip_impression
       WHERE shown_at >= ? AND shown_at < ? AND chosen_id IS NOT NULL`,
    )
    .all(from, to);
  const picks = rows.length;
  let recall = 0, hits = 0, falseShows = 0, stripPicks = 0;
  for (const r of rows) {
    const cands = JSON.parse(r.candidates).map((c) => `${c.kind}:${c.id}`);
    const shown = JSON.parse(r.shown);
    const key = `${r.chosen_kind}:${r.chosen_id}`;
    if (cands.includes(key)) recall++;
    if (shown.includes(key)) hits++;
    if (shown.length && !shown.includes(key)) falseShows++;
    if (r.chosen_source === "strip") stripPicks++;
  }
  const spoken = db
    .prepare(
      `SELECT s.id, s.started_at, s.ended_at,
              (SELECT COUNT(*) FROM learner_event_log e
                WHERE e.sentence_id = s.id) AS words
       FROM sentence s
       WHERE s.end_kind = 'spoken' AND s.ended_at >= ? AND s.ended_at < ?`,
    )
    .all(from, to);
  const w = wpmStats(spoken);
  return {
    picks,
    shortlistRecall: picks ? recall / picks : 0,
    hitRate: picks ? hits / picks : 0,
    falseShowRate: picks ? falseShows / picks : 0,
    stripShare: picks ? stripPicks / picks : 0,
    speed: {
      wpm: { median: w.wpm_median, q1: w.wpm_q1, q3: w.wpm_q3, n: w.wpm_samples },
      paths: pathTimes(db, { from, to }),
    },
    // Wrong picks (017-28 item 4): strip picks backspaced within a few
    // seconds — they count against prediction.
    wrongPicks: wrongPicks(db, { from, to }),
  };
}

/* --- Slice 7 (004): next-word continuations while typing -------------
 * When the keyboard is open the grid is hidden, so the strip offers the
 * likely next word, core words included (Dual_Engine §5.2).
 */

const BIGRAM_WINDOW_MS = 20 * 1000;

/**
 * Candidates for the next word after the sentence's tail item, all by id:
 *  - bigrams: items picked right after the tail before — consecutive
 *    learner_event_log rows less than 20 s apart;
 *  - grammar invitation: the per-locale GRAMMAR table, extended to
 *    root_core senses (a pronoun tail invites core verbs);
 *  - stripRanked: the phrase-history offer, unchanged.
 * Rank: bigram count, then invitation, then overall frequency, then
 * recency. Dedupe by kind:id. Cap 4.
 *
 * @param {Array<{kind:string, id:string}>} sentence
 * @returns {Array<{kind:'sense'|'entity', id:string}>}
 */
export function keyboardContinuations(db, sentence, locale, now = Date.now(), kidsTable = null) {
  if (typeof locale !== "string" || locale.length === 0) {
    throw new Error("locale is a required parameter");
  }
  const tail = sentence[sentence.length - 1];
  if (!tail) return [];

  // Hidden words leave the strip and completions (Masking § 2).
  const masked = maskedSenses(db);

  const merged = new Map(); // "kind:id" -> {kind, id, bigrams, invited, freq, last}
  const put = (kind, id, { bigrams = 0, invited = false } = {}) => {
    if (kind === "sense" && masked.has(id)) return;
    const key = `${kind}:${id}`;
    const r = merged.get(key) ?? { kind, id, bigrams: 0, invited: false, freq: 0, last: 0 };
    r.bigrams += bigrams;
    r.invited ||= invited;
    merged.set(key, r);
  };

  // 1. bigrams — the row that followed each past selection of the tail
  //    (consecutive ids, < 20 s apart). Ids only: language-free.
  for (const b of db
    .prepare(
      `SELECT e2.item_kind AS kind, e2.item_id AS id, COUNT(*) AS cnt
       FROM learner_event_log e1
       JOIN learner_event_log e2
         ON e2.id = (SELECT MIN(n.id) FROM learner_event_log n WHERE n.id > e1.id)
       WHERE e1.item_kind = ? AND e1.item_id = ?
         AND e2.selected_at - e1.selected_at < ?
       GROUP BY e2.item_kind, e2.item_id`,
    )
    .all(tail.kind, tail.id, BIGRAM_WINDOW_MS)) {
    put(b.kind, b.id, { bigrams: b.cnt });
  }

  // 2. grammar invitation — same rules as the board strip, but extended
  //    to root_core senses (no evidence required: the suggestion itself
  //    is the service).
  const { pos, prevPos } = tailInfo(db, sentence, locale);
  const ctx = { pos, prevPos, tailId: tail.kind === "sense" ? tail.id : null };
  const rules = GRAMMAR[locale];
  const invitesNoun = rules ? rules.invitesNoun(ctx) : false;
  const invitesVerb = rules ? rules.invitesVerb(ctx) : false;
  if (invitesNoun || invitesVerb) {
    for (const r of db
      .prepare(
        `SELECT s.id, l.part_of_speech AS pos FROM sense s
         JOIN label l ON l.sense_id = s.id
           AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = ?`,
      )
      .all(locale)) {
      if ((invitesNoun && r.pos === "Noun") || (invitesVerb && r.pos === "Verb")) {
        put("sense", r.id, { invited: true });
      }
    }
    if (invitesNoun) {
      for (const e of db.prepare("SELECT id FROM personal_entity WHERE status = 'active'").all()) {
        put("entity", e.id, { invited: true });
      }
    }
  }

  // 3. the board strip's offer, unchanged
  for (const c of stripCandidates(db, sentence, now, locale, kidsTable)) {
    put(c.kind, c.id, {});
  }

  // overall frequency + recency for every candidate
  for (const r of merged.values()) {
    const s = db
      .prepare(
        "SELECT COUNT(*) AS freq, MAX(selected_at) AS last FROM learner_event_log WHERE item_kind = ? AND item_id = ?",
      )
      .all(r.kind, r.id)[0];
    r.freq = s.freq;
    r.last = s.last ?? 0;
  }

  return [...merged.values()]
    .sort(
      (a, b) =>
        b.bigrams - a.bigrams ||
        Number(b.invited) - Number(a.invited) ||
        b.freq - a.freq ||
        b.last - a.last ||
        a.id.localeCompare(b.id),
    )
    .slice(0, STRIP_CAP)
    .map((r) => ({ kind: r.kind, id: r.id }));
}

/** Tail item's part of speech and text; entities are nominal. */
function tailInfo(db, sentence, locale) {
  if (sentence.length === 0) return { pos: null, prevPos: null };
  const tail = sentence[sentence.length - 1];
  const prev = sentence.length > 1 ? sentence[sentence.length - 2] : null;
  const posOf = (item) => {
    if (!item) return null;
    if (item.kind === "entity") return "Noun";
    return (
      db
        .prepare(
          `SELECT l.part_of_speech AS pos FROM label l
           WHERE l.sense_id = ? AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = ?`,
        )
        .all(item.id, locale)[0]?.pos ?? null
    );
  };
  return { pos: posOf(tail), prevPos: posOf(prev) };
}
