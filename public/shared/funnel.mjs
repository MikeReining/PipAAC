/**
 * Slice 3 strip — the local candidate funnel
 * (docs/strategy/Dual_Engine_Predictive_Intelligence.md §5.2).
 *
 * On-device inputs only: sentence position, recency, routine/time-of-day.
 * Strip candidates are personal entities plus fringe senses with usage
 * evidence. Core continuations are never strip tiles — they are haloed on
 * the grid. Read-only against core_cell; ranking never writes the map.
 */

import { bookScores } from "./opening_book.mjs";
import { pathTimes, wpmStats } from "./stats.mjs";

const RECENT_WINDOW_MS = 15 * 60 * 1000;
/** 017-24 / R20: a partner turn is the words an adult tapped while
 *  modeling — one turn, ~2 minutes, memory only (never stored). */
export const ECHO_WINDOW_MS = 2 * 60 * 1000;
export const STRIP_CAP = 4;

const TO_SENSE_ID = "sns_0053"; // infinitival "to" — matched by sense id, never by English text

/**
 * Sentence-position rules per locale (docs/phases/003b slice 3). A locale
 * with no entry gets no invitations — the strip then ranks by recency,
 * time of day, and frequency only. A wrong rule is worse than no rule:
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
 * each pick belonged to and its position, so history contexts never
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
  db.prepare(
    "UPDATE sentence SET ended_at = ?, end_kind = ? WHERE id = ? AND end_kind IS NULL",
  ).run(at, kind, id);
}

/** A pick left the sentence (backspace reopened it): its event stays as
 *  usage evidence but is no longer a sentence member, and the rest of
 *  the sentence shifts down one position. */
export function detachEvent(db, sentenceId, position) {
  db.prepare(
    "UPDATE learner_event_log SET sentence_id = NULL, position = NULL WHERE sentence_id = ? AND position = ?",
  ).run(sentenceId, position);
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
  // 017-10: the user's own history as decayed running counts — what
  // followed the last 1, 2, and 3 items, plus overall (''). The n stored
  // is decayed to `at` on every write; readers decay again to their now.
  const preds = ctx.sentenceId == null ? [] : db
    .prepare(
      `SELECT item_kind AS k, item_id AS i FROM learner_event_log
       WHERE sentence_id = ? AND position < ? AND position IS NOT NULL
       ORDER BY position`,
    )
    .all(ctx.sentenceId, ctx.position ?? Number.MAX_SAFE_INTEGER);
  const key = (its) => its.map((x) => `${x.k}:${x.i}`).join(",");
  const ctxs = new Set([""]);
  for (const n of [1, 2, 3]) if (preds.length >= n) ctxs.add(key(preds.slice(-n)));
  const get = db.prepare(
    "SELECT n, last_at FROM history_count WHERE ctx = ? AND item_kind = ? AND item_id = ?");
  const put = db.prepare(
    `INSERT INTO history_count (ctx, item_kind, item_id, n, last_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (ctx, item_kind, item_id) DO UPDATE SET
       n = excluded.n, last_at = excluded.last_at`);
  for (const c of ctxs) {
    const row = get.all(c, kind, id)[0];
    const n = row ? row.n * decayW(row.last_at, at) + 1 : 1;
    put.run(c, kind, id, n, at);
  }
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

/* --- The local model (§ 5.3–5.4): features, softmax, show gate ------- */

const HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000; // counts decay over 30 days
const FRESH_MS = 24 * 60 * 60 * 1000;          // a new entity is fresh for a day
const SHORTLIST_CAP = 16;                      // § 5.2: measured, not assumed

export const MODEL_FEATURES = [
  "hist", "occasion", "hour", "recency",
  "freq", "invited", "echo", "fresh", "jev", "spot", "book",
];

const decayW = (at, now) => Math.pow(0.5, Math.max(0, now - at) / HALF_LIFE_MS);
const localDate = (at, tz) => new Date(at + tz * 60000);
const dayTypeOf = (at, tz) =>
  [0, 6].includes(localDate(at, tz).getUTCDay()) ? "weekend" : "school";
const hourDelta = (a, b) => {
  const d = Math.abs(a - b);
  return Math.min(d, 24 - d);
};
/** The opening book's band for this profile (017 item 9): the band whose
 *  book predicts best, seeded by supporter age — default mid (≈age 5). */
export function bookBand(db) {
  return (
    db.prepare("SELECT book_band AS b FROM learner_profile WHERE id = 'prf_local'").all()[0]?.b
    ?? "mlu_2_35"
  );
}

/** Per-strip-paint context (017 step 7): everything `features` needs that
 *  depends on the sentence, the clock, or the book — computed once, shared
 *  by every candidate (~700 of them), instead of re-queried per word. */
export function featureEnv(db, sentence, now, locale, spot = null, book = null, partner = null) {
  const tzNow = -new Date(now).getTimezoneOffset();
  const labelStmt = db.prepare(
    `SELECT part_of_speech AS p, normalized_text AS t FROM label
     WHERE sense_id = ? AND kind = 'lemma' AND status = 'approved' AND locale = ?`,
  );
  // The book's context: last-2 in-vocab lemmas; an entity or a word with
  // no lemma label breaks the run, like OOV in the scorer.
  const ctx = [];
  for (let i = sentence.length - 1; i >= 0 && ctx.length < 2; i--) {
    const it = sentence[i];
    const t = it?.kind === "sense" ? labelStmt.all(it.id, locale)[0]?.t ?? null : null;
    if (t === null) break;
    ctx.unshift(t);
  }
  const { pos, prevPos } = tailInfo(db, sentence, locale);
  const tail = sentence.at(-1);
  return {
    sentence, now, locale, spot,
    tzNow,
    nowHour: localDate(now, tzNow).getUTCHours(),
    nowDay: dayTypeOf(now, tzNow),
    // 017-24: the partner's last turn — a Set of 'kind:id' while it's
    // live, null when expired or absent. Lives only in the caller's
    // memory (R20): nothing about it touches a table.
    echoSet: partner && now - partner.at <= ECHO_WINDOW_MS ? partner.items : null,
    tailCtx: { pos, prevPos, tailId: tail?.kind === "sense" ? tail.id : null },
    bookScores: book ? bookScores(book, bookBand(db), ctx) : null,
    histStmt: db.prepare(
      `SELECT item_kind, item_id, n, last_at FROM history_count WHERE ctx = ?`,
    ),
    labelStmt,
    eventStmt: db.prepare(
      `SELECT selected_at, tz_offset_min, sentence_id, position
       FROM learner_event_log WHERE item_kind = ? AND item_id = ?`,
    ),
    addedStmt: db.prepare("SELECT added_at FROM personal_entity WHERE id = ?"),
  };
}

/**
 * One candidate's feature vector (§ 5.3): decayed counts enter as
 * log(1+count); recency is a 0–1 ramp over the 15-minute window;
 * invited/echo/fresh are 0/1. `occasion` and `jev` stay 0 until 007
 * occasions and a Jev answer exist; `echo` is 1 for words in the
 * partner's live modeling turn (017-24, memory only — R20). The feature
 * slot is recorded now so impressions from today fit tomorrow's model.
 * `spot` is the running session's target Set (or null): `x.spot` records
 * "was a spotlight target at offer time" — instrument truth, independent
 * of whether the § 4 boost setting scored it.
 * `book` is the book's interpolated P(word | context), 0–1 — a
 * probability, not a logP, because the softmax gate needs bounded
 * positive mass: a raw logP could never beat `none_bias`.
 */
export function features(db, item, env) {
  const { sentence, now, locale, tzNow, nowHour, nowDay, tailCtx } = env;
  const rows = env.eventStmt.all(item.kind, item.id);
  let freq = 0, hour = 0, last = 0;
  for (const e of rows) {
    const w = decayW(e.selected_at, now);
    freq += w;
    last = Math.max(last, e.selected_at);
    const tz = e.tz_offset_min ?? tzNow;
    if (dayTypeOf(e.selected_at, tz) === nowDay &&
        hourDelta(localDate(e.selected_at, tz).getUTCHours(), nowHour) <= 1) {
      hour += w;
    }
  }
  // 017-10 — the history expert: P(next | last n items) from the running
  // counts, per-item backoff 3 → 2 → 1 → overall. Counts decay to `now`
  // before normalizing so an old run can't outweigh a fresh one.
  const ctxKey = (n) =>
    sentence.slice(-n).map((s) => `${s.kind}:${s.id}`).join(",");
  let hist = 0;
  for (const n of [3, 2, 1]) {
    if (sentence.length < n) continue;
    const rows2 = env.histStmt.all(ctxKey(n));
    const tot = rows2.reduce((t, r) => t + r.n * decayW(r.last_at, now), 0);
    if (!tot) continue;
    const mine = rows2.find((r) => r.item_kind === item.kind && r.item_id === item.id);
    const p = mine ? (mine.n * decayW(mine.last_at, now)) / tot : 0;
    if (p > 0) { hist = p; break; }
  }
  if (!hist) {
    const rows2 = env.histStmt.all("");
    const tot = rows2.reduce((t, r) => t + r.n * decayW(r.last_at, now), 0);
    const mine = tot && rows2.find((r) => r.item_kind === item.kind && r.item_id === item.id);
    if (mine) hist = (mine.n * decayW(mine.last_at, now)) / tot;
  }
  const rules = GRAMMAR[locale];
  const label2 = item.kind === "entity"
    ? { p: "Noun", t: null }
    : env.labelStmt.all(item.id, locale)[0] ?? { p: null, t: null };
  const pos2 = label2.p;
  const invited = rules &&
    ((rules.invitesNoun(tailCtx) && pos2 === "Noun") ||
     (rules.invitesVerb(tailCtx) && pos2 === "Verb"));
  const addedAt = item.kind === "entity"
    ? env.addedStmt.all(item.id)[0]?.added_at
    : null;
  return {
    hist,
    occasion: 0,
    hour: Math.log1p(hour),
    recency: last ? Math.max(0, 1 - (now - last) / RECENT_WINDOW_MS) : 0,
    freq: Math.log1p(freq),
    invited: invited ? 1 : 0,
    echo: env.echoSet?.has(`${item.kind}:${item.id}`) ? 1 : 0,
    fresh: addedAt && now >= addedAt && now - addedAt < FRESH_MS ? 1 : 0,
    jev: 0,
    spot: env.spot?.has(`${item.kind}:${item.id}`) ? 1 : 0,
    book: env.bookScores?.get(label2.t) ?? 0,
  };
}

/** Softmax over the shortlist ∪ {none} (§ 5.3). `none` carries its
 *  learned bias plus `log P_Jev(none)` — weighted by the jev weight —
 *  when a Jev answer supplied it. Candidates with no positive support
 *  (logit ≤ 0) never enter the mass `none` competes against — with every
 *  word scored (step 7), counting e^0 ~700 times would make pNone a lie.
 *  Returns candidates sorted by p. */
export function scoreCandidates(rows, weights, jevNone = null) {
  const logit = (x) =>
    MODEL_FEATURES.reduce((t, f) => t + (weights[f] ?? 0) * (x[f] ?? 0), 0);
  const scored = rows.map((r) => ({ ...r, s: logit(r.x) }));
  const eNone = Math.exp(
    (weights.none_bias ?? 0) + (jevNone === null ? 0 : (weights.jev ?? 0) * jevNone));
  const Z = scored.reduce((t, r) => t + (r.s > 0 ? Math.exp(r.s) : 0), eNone);
  for (const r of scored) r.p = Math.exp(r.s) / Z;
  scored.sort((a, b) => b.p - a.p || a.id.localeCompare(b.id));
  return { candidates: scored, pNone: eNone / Z };
}

/** § 5.1 — fold a Jev answer into the local shortlist: criterion `cN`
 *  maps to shortlist position N; each candidate's `jev` feature becomes
 *  `log P_Jev(w)` and `none` folds in the same way. Re-scores under the
 *  `with_jev` weights and returns a fresh sorted result. */
export function applyJev(rows, probabilities, weights) {
  const logp = (p) => Math.log(Math.max(p ?? 0, 1e-9));
  const withJev = rows.map((r, i) => ({
    ...r,
    x: { ...r.x, jev: logp(probabilities[`c${i + 1}`]) },
  }));
  return scoreCandidates(withJev, weights, logp(probabilities.none));
}

/** The show gate (§ 5.4): nothing when P(none) ≥ τ_none; else the tiles
 *  that clear τ_tile AND carry support (s > 0 — a word with no positive
 *  feature is never offered), in rank order, capped at the strip's slot
 *  count (four on a ten-column board; the strip scales with the layout). */
export function showGate(candidates, pNone, tau, cap = STRIP_CAP) {
  if (pNone >= tau.none) return [];
  return candidates.filter((c) => c.s > 0 && c.p >= tau.tile).slice(0, cap);
}

/* --- 013 § 4 Smart bar boost: the running session's target words get a
 *  gentle Predict lift — a nudge into practice, never a takeover. --- */

/** The session's target keys, or null. Read from the synced row, not the
 *  layer: what a fresh boot would see is the truth the strip scores. */
function spotTargets(db) {
  const row = db
    .prepare("SELECT targets FROM spotlight_session WHERE id = 1")
    .all()[0];
  return row ? new Set(JSON.parse(row.targets)) : null;
}

/** The boost applies only while a session runs AND the synced setting is
 *  on — off means the strip ignores the spotlight entirely. */
function spotBoostOn(db, spot) {
  if (!spot?.size) return false;
  return (db
    .prepare("SELECT spot_boost FROM learner_profile WHERE id = 'prf_local'")
    .all()[0]?.spot_boost ?? 1) === 1;
}

/** The product default for the `spot` weight — evidence-level (a strong
 *  learned pattern still outranks it), so evidence decides favorites. A
 *  fitted `spot` weight wins over the default once the model learns one. */
const SPOT_BOOST = 1.5;

/** Scoring weights with the boost folded in: while a session runs and
 *  the synced `spot_boost` setting is on, `spot` carries SPOT_BOOST (or
 *  the fitted weight). No session or the setting off → weights unchanged. */
export function spotWeights(db, weights) {
  if (!spotBoostOn(db, spotTargets(db))) return weights;
  return { ...weights, spot: weights.spot ?? SPOT_BOOST };
}

/** The show gate with the § 4 bound: target tiles may not take over the
 *  bar — at most half the slots (floor, minimum one) can go to `x.spot`
 *  candidates; the rest always belong to plain prediction. */
export function spotGate(candidates, pNone, tau, cap = STRIP_CAP) {
  if (pNone >= tau.none) return [];
  const ok = candidates.filter((c) => c.s > 0 && c.p >= tau.tile);
  const spotCap = Math.max(1, Math.floor(cap / 2));
  let n = 0;
  return ok.filter((c) => !c.x?.spot || ++n <= spotCap).slice(0, cap);
}

/* --- R21 / Motor_Grid § 2.2: the "no" slot ------------------------------
 *  When a negation word (sense.negation — a catalog attribute, never a
 *  hand-kept list) ranks inside the top NO_WINDOW of likely candidates,
 *  it takes the LAST Predict slot; the others keep probability order.
 *  One shared function orders device strip and scorer alike — the
 *  lie-prone layer is a divergent copy. */

export const NO_WINDOW = 8;

/** The "no" rule on an already-eligible ranked list (pure — device and
 *  scorer share it verbatim). `isNeg` reads `c.neg` by default; the
 *  scorer passes a lemma-set predicate. Two-slot bars skip the rule —
 *  how likely "no" must be there is an open measurement question
 *  (§ 2.2), so a small bar stays plain probability order. */
export function noSlotOrder(ranked, cap, isNeg = (c) => !!c?.neg) {
  if (cap < 3) return ranked.slice(0, cap);
  const win = ranked.slice(0, NO_WINDOW).find(isNeg);
  if (!win) return ranked.slice(0, cap);
  return [...ranked.filter((c) => c !== win).slice(0, cap - 1), win];
}

/** The strip's final order: support gate → spotlight cap → the "no"
 *  slot. `noLast` is the paint-time setting — replay reads the stored
 *  flag on the impression, never the profile's current value. */
export function finalStrip(candidates, pNone, tau, cap = STRIP_CAP, { noLast = true } = {}) {
  if (pNone >= tau.none) return [];
  const ok = candidates.filter((c) => c.s > 0 && c.p >= tau.tile);
  const spotCap = Math.max(1, Math.floor(cap / 2));
  let n = 0;
  const allowed = ok.filter((c) => !c.x?.spot || ++n <= spotCap);
  return noLast ? noSlotOrder(allowed, cap) : allowed.slice(0, cap);
}

/** The profile's strip-order settings (all synced, § 6.2e): board words
 *  in the pool, the "no" slot, and sentence help. Defaults match the
 *  shipped column defaults so a fresh or partial row behaves the same. */
export function stripSettings(db) {
  const r = db
    .prepare(
      `SELECT show_board_words AS b, no_last_slot AS n, sentence_help AS h
       FROM learner_profile WHERE id = 'prf_local'`,
    )
    .all()[0] ?? {};
  return {
    boardWords: (r.b ?? 1) === 1,
    noLast: (r.n ?? 1) === 1,
    sentenceHelp: r.h ?? "one_step_up",
  };
}

/** Final strip order with the profile's live settings — the device call
 *  sites and stripCandidates share it so paint and replay can't drift. */
export function stripOrder(db, candidates, pNone, tau, cap = STRIP_CAP) {
  return finalStrip(candidates, pNone, tau, cap, { noLast: stripSettings(db).noLast });
}

/**
 * Rank strip candidates. Every offerable word — every non-core sense
 * with a lemma, not hidden, plus every active entity — is scored by the
 * blend (017 step 7: no retrieval stage). The opening book drives a
 * brand-new user's strip; history, recency, and grammar fit compete as
 * features once the user has them.
 *
 * @returns {Array<{kind:'sense'|'entity', id:string}>} the gated tiles.
 */
export function stripCandidates(db, sentence, now = Date.now(), locale, model, cap = STRIP_CAP) {
  const { candidates, pNone } = stripScored(db, sentence, now, locale, model);
  return stripOrder(db, candidates, pNone, model.tau, cap).map((r) => ({ kind: r.kind, id: r.id }));
}

/**
 * The scored shortlist — what the strip moment records on the impression
 * (schema §6.2d). `model` is ONE resolved weight set + τ:
 * `{weights: {<feature>: w, none_bias}, tau: {tile, none}}` — callers pick
 * `catalog.prediction.weights.local_only` or `.with_jev` and record the
 * name on the impression's `weight_set`.
 */
export function stripScored(db, sentence, now = Date.now(), locale, model) {
  if (typeof locale !== "string" || locale.length === 0) {
    throw new Error("locale is a required parameter");
  }
  if (!model?.weights || !model?.tau) {
    throw new Error("model is a required parameter");
  }
  const spot = spotTargets(db);
  const boostOn = spotBoostOn(db, spot);
  const weights = boostOn
    ? { ...model.weights, spot: model.weights.spot ?? SPOT_BOOST }
    : model.weights;
  const env = featureEnv(
    db, sentence, now, locale, spot, model.book ?? null, model.partner ?? null);
  const rows = [];
  // 017 step 7 — no retrieval stage: every offerable word is scored and
  // the blend picks the shortlist. The pool is every sense with a lemma
  // (the book and the grammar rule both read it) that isn't hidden, plus
  // every active entity. R21: root_core joins the pool when the profile's
  // Show board words is on — off, the bar stays fringe-only and core
  // words only glow in place. Ever-picked, recency, and grammar are
  // features in the blend now — not gates — so a brand-new user's strip
  // is driven by the opening book.
  const tiers = stripSettings(db).boardWords
    ? "('primary_fringe', 'root_core')"
    : "('primary_fringe')";
  for (const e of db
    .prepare("SELECT id FROM personal_entity WHERE status = 'active'")
    .all()) {
    rows.push({ kind: "entity", id: e.id, x: features(db, { kind: "entity", id: e.id }, env) });
  }
  for (const f of db
    .prepare(
      `SELECT s.id, s.negation AS neg FROM sense s
       WHERE s.tier IN ${tiers}
         AND EXISTS (SELECT 1 FROM label lb WHERE lb.sense_id = s.id
                     AND lb.kind = 'lemma' AND lb.status = 'approved' AND lb.locale = ?)
         AND NOT EXISTS (SELECT 1 FROM sense_mask m
                         WHERE m.sense_id = s.id AND m.status = 'hidden')`,
    )
    .all(locale)) {
    rows.push({ kind: "sense", id: f.id, neg: !!f.neg, x: features(db, { kind: "sense", id: f.id }, env) });
  }
  const { candidates, pNone } = scoreCandidates(rows, weights);
  return { candidates: candidates.slice(0, SHORTLIST_CAP), pNone };
}

/** 018 D9: the likely group for the group list's glow — the group the
 *  top-scored candidate lives in. Reads the same blend the strip uses,
 *  so the glow means "the next word probably lives here". Returns an
 *  empty Set when nothing has support or the top item is homeless. */
export function likelyGroups(db, sentence, now, locale, model) {
  const { candidates } = stripScored(db, sentence, now, locale, model);
  const top = candidates[0];
  if (!top) return new Set();
  return new Set(
    db.prepare(
      "SELECT group_id FROM group_cell WHERE item_kind = ? AND item_id = ?",
    ).all(top.kind, top.id).map((r) => r.group_id),
  );
}

/* --- The instrument (§ 5.7): strip_impression ------------------------ */

/**
 * One strip moment: the shortlist the ranker had and the tiles it showed.
 * Called when the strip's offer changes mid-sentence; `chosen_*` stays
 * NULL until the next pick (fillChosen) — a sentence that ends cleared
 * leaves them NULL: metrics only, never a training example.
 */
export function logImpression(db, {
  sentenceId, position, shownAt = Date.now(), candidates, shown,
  weightSet = "local_only", jevStatus = "off", jevModel = null, pNone = 0,
  mode = "picture", weightsLocal = null, shortlistCap = null,
}) {
  db.prepare(
    `INSERT INTO strip_impression
       (sentence_id, position, shown_at, candidates, shown_local, p_none,
        weight_set, jev_status, jev_model, mode, weights_local, shortlist_cap)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    sentenceId, position, shownAt,
    JSON.stringify(candidates), JSON.stringify(shown), pNone,
    weightSet, jevStatus, jevModel, mode,
    weightsLocal ? JSON.stringify(weightsLocal) : null, shortlistCap,
  );
  return db.prepare("SELECT last_insert_rowid() AS id").all()[0].id;
}

/** 017-5: a Jev answer updates the moment's row in place — raw answer,
 *  timing, the with-Jev weights used, and the merged candidates
 *  (per-entry jp/wp). `status` is 'answered' or 'late'; late answers
 *  are evidence too — they just never painted. */
export function updateImpressionJev(db, impressionId, {
  status, model = null, probs = null, latencyMs = null,
  promptVersion = null, weightsJev = null, pNoneJev = null,
  candidates = null,
}) {
  db.prepare(
    `UPDATE strip_impression SET jev_status = ?, jev_model = ?,
       jev_probs = COALESCE(?, jev_probs),
       jev_prompt_version = COALESCE(?, jev_prompt_version),
       jev_latency_ms = COALESCE(?, jev_latency_ms),
       weights_jev = COALESCE(?, weights_jev),
       p_none_jev = COALESCE(?, p_none_jev),
       candidates = COALESCE(?, candidates)
     WHERE id = ?`,
  ).run(
    status, model,
    probs ? JSON.stringify(probs) : null,
    promptVersion, latencyMs,
    weightsJev ? JSON.stringify(weightsJev) : null,
    pNoneJev,
    candidates ? JSON.stringify(candidates) : null,
    impressionId,
  );
}

/** What was actually painted — written by the painter, never the
 *  ranker, so a stored moment replays what was on screen (017-5). */
export function stampShownFinal(db, impressionId, shownKeys) {
  db.prepare(
    "UPDATE strip_impression SET shown_final = ? WHERE id = ?",
  ).run(JSON.stringify(shownKeys), impressionId);
}

const logitOf = (x, w) =>
  MODEL_FEATURES.reduce((t, f) => t + (w[f] ?? 0) * (x[f] ?? 0), 0);

/**
 * Replay a stored strip moment (017-5): recompute the local softmax
 * from the stored features and weights, the with-Jev ranking from the
 * stored probabilities, and the gate decisions — then compare against
 * what the row says was painted. Returns {ok, diffs} where diffs lists
 * every mismatch (empty when the row replays exactly).
 */
export function replayImpression(row, { gate } = {}) {
  const diffs = [];
  const cands = JSON.parse(row.candidates);
  const wl = row.weights_local ? JSON.parse(row.weights_local) : null;
  const cap = row.shortlist_cap ?? STRIP_CAP;
  const key = (c) => `${c.kind}:${c.id}`;
  if (!wl) return { ok: false, diffs: ["no weights_local stored"] };
  // R21: the "no" slot's paint-time state is stored on the moment
  // (weights_local.noLast) — replay applies the rule the painter used,
  // never the profile's current value. Pre-R21 rows default on, matching
  // the shipped setting.
  const noLast = (wl.noLast ?? 1) === 1;
  const gateFn = gate ?? ((cs, p, t, c) => finalStrip(cs, p, t, c, { noLast }));

  // Local ranking: recompute s and p from x · w, compare to stored.
  // Z counts only supported candidates (s > 0) — same rule as
  // scoreCandidates, or p_none drifts whenever the pool has dead mass.
  const s = cands.map((c) => logitOf(c.x, wl.w));
  const eN = Math.exp(wl.w.none_bias ?? 0);
  const Z = s.reduce((a, v) => a + (v > 0 ? Math.exp(v) : 0), eN);
  const order = cands
    .map((c, i) => ({ c, p: Math.exp(s[i]) / Z }))
    .sort((a, b) => b.p - a.p || a.c.id.localeCompare(b.c.id));
  for (const c of cands) {
    const re = order.find((o) => key(o.c) === key(c));
    if (c.s !== undefined && Math.abs(c.s - logitOf(c.x, wl.w)) > 1e-9)
      diffs.push(`${key(c)}: stored s ${c.s} != ${logitOf(c.x, wl.w)}`);
    if (c.p !== undefined && Math.abs(c.p - re.p) > 1e-9)
      diffs.push(`${key(c)}: stored p ${c.p} != ${re.p}`);
  }
  const pNone = eN / Z;
  if (Math.abs(pNone - row.p_none) > 1e-9)
    diffs.push(`p_none ${row.p_none} != ${pNone}`);
  const localShown = gateFn(
    order.map((o) => ({ ...o.c, p: o.p, s: logitOf(o.c.x, wl.w) })),
    pNone, wl.tau, cap)
    .map((r) => `${r.kind}:${r.id}`);
  const storedLocal = JSON.parse(row.shown_local);
  if (JSON.stringify(localShown) !== JSON.stringify(storedLocal))
    diffs.push(`shown_local ${JSON.stringify(storedLocal)} != ${JSON.stringify(localShown)}`);

  // With-Jev ranking when an answer is stored: jp/wp must match a fresh
  // applyJev over the same shortlist. The painted set follows it only
  // when the answer was delivered — a late answer never repainted.
  let finalShown = localShown;
  const probs = row.jev_probs ? JSON.parse(row.jev_probs) : null;
  const wj = row.weights_jev ? JSON.parse(row.weights_jev) : null;
  if (probs && wj) {
    const reranked = applyJev(
      cands.map((c) => ({ kind: c.kind, id: c.id, x: c.x })),
      probs, wj.w);
    for (const c of cands) {
      if (c.wp === undefined) continue;
      const i = cands.indexOf(c);
      const re = reranked.candidates.find((r) => `${r.kind}:${r.id}` === key(c));
      if (Math.abs(c.jp - (probs[`c${i + 1}`] ?? 0)) > 1e-9)
        diffs.push(`${key(c)}: stored jp ${c.jp} != ${probs[`c${i + 1}`]}`);
      if (re && Math.abs(c.wp - re.p) > 1e-9)
        diffs.push(`${key(c)}: stored wp ${c.wp} != ${re.p}`);
    }
    const jevShown = gateFn(reranked.candidates, reranked.pNone, wj.tau, cap)
      .map((r) => `${r.kind}:${r.id}`);
    if (row.jev_status === "answered"
        && JSON.stringify(jevShown) !== JSON.stringify(localShown))
      finalShown = jevShown;
  }
  const storedFinal = row.shown_final ? JSON.parse(row.shown_final) : null;
  if (storedFinal && JSON.stringify(finalShown) !== JSON.stringify(storedFinal))
    diffs.push(`shown_final ${JSON.stringify(storedFinal)} != ${JSON.stringify(finalShown)}`);

  return { ok: diffs.length === 0, diffs, localShown, finalShown };
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
  // Passive timings (017 step 28): real WPM and the pause before each
  // pick by path, both from timestamped rows — never the ranker's report.
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
  };
}

/* --- Slice 7 (004): next-word continuations while typing -------------
 * When the keyboard is open the grid is hidden, so the "core words never
 * in the strip" rule stops applying — the strip offers the likely next
 * word, core words included (Dual_Engine §5.2).
 */

const BIGRAM_WINDOW_MS = 20 * 1000;

/**
 * Candidates for the next word after the sentence's tail item, all by id:
 *  - bigrams: items picked right after the tail before — consecutive
 *    learner_event_log rows less than 20 s apart;
 *  - grammar invitation: the per-locale GRAMMAR table, extended to
 *    root_core senses (a pronoun tail invites core verbs);
 *  - stripCandidates: entities and fringe with evidence, unchanged.
 * Rank: bigram count, then invitation, then overall frequency, then
 * recency. Dedupe by kind:id. Cap 4.
 *
 * @param {Array<{kind:string, id:string}>} sentence
 * @returns {Array<{kind:'sense'|'entity', id:string}>}
 */
export function keyboardContinuations(db, sentence, locale, now = Date.now(), model) {
  if (typeof locale !== "string" || locale.length === 0) {
    throw new Error("locale is a required parameter");
  }
  const tail = sentence[sentence.length - 1];
  if (!tail) return [];

  // Hidden words leave the strip and completions (Masking § 2).
  const masked = new Set(
    db.prepare("SELECT sense_id FROM sense_mask WHERE status = 'hidden'").all()
      .map((r) => r.sense_id),
  );

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

  // 3. the board strip's candidates, unchanged
  for (const c of stripCandidates(db, sentence, now, locale, model)) {
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
