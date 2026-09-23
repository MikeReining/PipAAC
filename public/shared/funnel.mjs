/**
 * Slice 3 strip — the local candidate funnel
 * (docs/strategy/Dual_Engine_Predictive_Intelligence.md §5.2).
 *
 * On-device inputs only: sentence position, recency, routine/time-of-day.
 * Strip candidates are personal entities plus fringe senses with usage
 * evidence. Core continuations are never strip tiles — they are haloed on
 * the grid. Read-only against core_cell; ranking never writes the map.
 */

const RECENT_WINDOW_MS = 15 * 60 * 1000;
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
 * each pick belonged to and its position, so pairs and phrases never
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
       (item_kind, item_id, selected_at, sentence_id, position, source, tz_offset_min)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    kind, id, at,
    ctx.sentenceId ?? null, ctx.position ?? null, ctx.source ?? null,
    -new Date(at).getTimezoneOffset(),
  );
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
  "phrase", "pair", "occasion", "hour", "recency",
  "freq", "invited", "echo", "fresh", "jev", "spot",
];

const decayW = (at, now) => Math.pow(0.5, Math.max(0, now - at) / HALF_LIFE_MS);
const localDate = (at, tz) => new Date(at + tz * 60000);
const dayTypeOf = (at, tz) =>
  [0, 6].includes(localDate(at, tz).getUTCDay()) ? "weekend" : "school";
const hourDelta = (a, b) => {
  const d = Math.abs(a - b);
  return Math.min(d, 24 - d);
};
const sameItem = (a, b) => a && b && a.k === b.kind && a.i === b.id;

/**
 * One candidate's feature vector (§ 5.3): decayed counts enter as
 * log(1+count); recency is a 0–1 ramp over the 15-minute window;
 * invited/echo/fresh are 0/1. `occasion`, `echo` and `jev` stay 0 until
 * 007 occasions, 008 listening, and a Jev answer exist — the feature
 * slot is recorded now so impressions from today fit tomorrow's model.
 * `spot` is the running session's target Set (or null): `x.spot` records
 * "was a spotlight target at offer time" — instrument truth, independent
 * of whether the § 4 boost setting scored it.
 */
export function features(db, item, sentence, now, locale, spot = null) {
  const tzNow = -new Date(now).getTimezoneOffset();
  const nowHour = localDate(now, tzNow).getUTCHours();
  const nowDay = dayTypeOf(now, tzNow);
  const rows = db
    .prepare(
      `SELECT selected_at, tz_offset_min, sentence_id, position
       FROM learner_event_log WHERE item_kind = ? AND item_id = ?`,
    )
    .all(item.kind, item.id);
  const predsStmt = db.prepare(
    `SELECT item_kind AS k, item_id AS i FROM learner_event_log
     WHERE sentence_id = ? AND position < ? AND position IS NOT NULL
     ORDER BY position`,
  );
  let freq = 0, hour = 0, pair = 0, phrase = 0, last = 0;
  for (const e of rows) {
    const w = decayW(e.selected_at, now);
    freq += w;
    last = Math.max(last, e.selected_at);
    const tz = e.tz_offset_min ?? tzNow;
    if (dayTypeOf(e.selected_at, tz) === nowDay &&
        hourDelta(localDate(e.selected_at, tz).getUTCHours(), nowHour) <= 1) {
      hour += w;
    }
    if (e.sentence_id == null || e.position == null || !sentence.length) continue;
    const preds = predsStmt.all(e.sentence_id, e.position);
    if (sameItem(preds.at(-1), sentence.at(-1))) pair += w;
    for (const n of [3, 2, 1]) {
      if (sentence.length < n || preds.length < n) continue;
      if (preds.slice(-n).every((p, i) => sameItem(p, sentence[sentence.length - n + i]))) {
        phrase += w;
        break; // longest match wins
      }
    }
  }
  const { pos, prevPos } = tailInfo(db, sentence, locale);
  const rules = GRAMMAR[locale];
  const tail = sentence.at(-1);
  const ctx = { pos, prevPos, tailId: tail?.kind === "sense" ? tail.id : null };
  const pos2 = item.kind === "entity"
    ? "Noun"
    : db
        .prepare(
          `SELECT part_of_speech AS p FROM label
           WHERE sense_id = ? AND kind = 'lemma' AND status = 'approved' AND locale = ?`,
        )
        .all(item.id, locale)[0]?.p ?? null;
  const invited = rules &&
    ((rules.invitesNoun(ctx) && pos2 === "Noun") ||
     (rules.invitesVerb(ctx) && pos2 === "Verb"));
  const addedAt = item.kind === "entity"
    ? db.prepare("SELECT added_at FROM personal_entity WHERE id = ?").all(item.id)[0]?.added_at
    : null;
  return {
    phrase: Math.log1p(phrase),
    pair: Math.log1p(pair),
    occasion: 0,
    hour: Math.log1p(hour),
    recency: last ? Math.max(0, 1 - (now - last) / RECENT_WINDOW_MS) : 0,
    freq: Math.log1p(freq),
    invited: invited ? 1 : 0,
    echo: 0,
    fresh: addedAt && now - addedAt < FRESH_MS ? 1 : 0,
    jev: 0,
    spot: spot?.has(`${item.kind}:${item.id}`) ? 1 : 0,
  };
}

/** Softmax over the shortlist ∪ {none} (§ 5.3). `none` carries its
 *  learned bias plus `log P_Jev(none)` — weighted by the jev weight —
 *  when a Jev answer supplied it. Returns candidates sorted by p. */
export function scoreCandidates(rows, weights, jevNone = null) {
  const logit = (x) =>
    MODEL_FEATURES.reduce((t, f) => t + (weights[f] ?? 0) * (x[f] ?? 0), 0);
  const scored = rows.map((r) => ({ ...r, s: logit(r.x) }));
  const eNone = Math.exp(
    (weights.none_bias ?? 0) + (jevNone === null ? 0 : (weights.jev ?? 0) * jevNone));
  const Z = scored.reduce((t, r) => t + Math.exp(r.s), eNone);
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
 *  that clear τ_tile, in rank order, capped at the strip's slot count
 *  (four on a ten-column board; the strip scales with the layout). */
export function showGate(candidates, pNone, tau, cap = STRIP_CAP) {
  if (pNone >= tau.none) return [];
  return candidates.filter((c) => c.p >= tau.tile).slice(0, cap);
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

/** The product default for the `spot` weight — phrase-level (the fitted
 *  phrase weight is ~1.55), so evidence still decides real favorites. A
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
  const ok = candidates.filter((c) => c.p >= tau.tile);
  const spotCap = Math.max(1, Math.floor(cap / 2));
  let n = 0;
  return ok.filter((c) => !c.x?.spot || ++n <= spotCap).slice(0, cap);
}

/**
 * Rank strip candidates. Sentence position decides what the tail invites:
 * a Verb or Preposition tail invites noun-ish candidates (entities +
 * fringe nouns); a Pronoun tail or an infinitival "to" after a verb
 * invites fringe verbs.
 *
 * Eligibility differs by kind: personal entities surface on invitation or
 * recency alone (few, high-value — a fresh add must be reachable);
 * fringe senses additionally need evidence (ever picked or recent) plus
 * an invitation, so the strip doesn't fill with arbitrary unused words.
 *
 * @returns {Array<{kind:'sense'|'entity', id:string}>} the gated tiles.
 */
export function stripCandidates(db, sentence, now = Date.now(), locale, model, cap = STRIP_CAP) {
  const { candidates, pNone } = stripScored(db, sentence, now, locale, model);
  return spotGate(candidates, pNone, model.tau, cap).map((r) => ({ kind: r.kind, id: r.id }));
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
  const rows = [];
  for (const e of db
    .prepare("SELECT id FROM personal_entity WHERE status = 'active'")
    .all()) {
    const x = features(db, { kind: "entity", id: e.id }, sentence, now, locale, spot);
    if (x.invited || x.recency > 0 || (x.spot && boostOn)) {
      rows.push({ kind: "entity", id: e.id, x });
    }
  }
  // A never-picked target is still a candidate (§ 4: the strip offers the
  // practice words) — the evidence requirement lifts for target senses
  // only; tier, label, and mask rules still apply.
  const spotSenses = boostOn
    ? [...spot].filter((k) => k.startsWith("sense:")).map((k) => k.slice(6))
    : [];
  const spotIn = spotSenses.length
    ? ` OR s.id IN (${spotSenses.map(() => "?").join(",")})`
    : "";
  for (const f of db
    .prepare(
      `SELECT s.id FROM sense s
       WHERE s.tier = 'primary_fringe'
         AND EXISTS (SELECT 1 FROM label lb WHERE lb.sense_id = s.id
                     AND lb.kind = 'lemma' AND lb.status = 'approved' AND lb.locale = ?)
         AND NOT EXISTS (SELECT 1 FROM sense_mask m
                         WHERE m.sense_id = s.id AND m.status = 'hidden')
         AND (EXISTS (SELECT 1 FROM learner_event_log l
                     WHERE l.item_kind = 'sense' AND l.item_id = s.id)${spotIn})`,
    )
    .all(locale, ...spotSenses)) {
    const x = features(db, { kind: "sense", id: f.id }, sentence, now, locale, spot);
    if (((x.freq > 0 || x.recency > 0) && x.invited) || (x.spot && boostOn)) {
      rows.push({ kind: "sense", id: f.id, x });
    }
  }
  const { candidates, pNone } = scoreCandidates(rows, weights);
  return { candidates: candidates.slice(0, SHORTLIST_CAP), pNone };
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
  mode = "picture",
}) {
  db.prepare(
    `INSERT INTO strip_impression
       (sentence_id, position, shown_at, candidates, shown, p_none,
        weight_set, jev_status, jev_model, mode)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    sentenceId, position, shownAt,
    JSON.stringify(candidates), JSON.stringify(shown), pNone,
    weightSet, jevStatus, jevModel, mode,
  );
  return db.prepare("SELECT last_insert_rowid() AS id").all()[0].id;
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
      `SELECT candidates, shown, chosen_kind, chosen_id, chosen_source
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
  return {
    picks,
    shortlistRecall: picks ? recall / picks : 0,
    hitRate: picks ? hits / picks : 0,
    falseShowRate: picks ? falseShows / picks : 0,
    stripShare: picks ? stripPicks / picks : 0,
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
