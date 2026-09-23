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

/**
 * Rank strip candidates. Sentence position decides what the tail invites:
 * a Verb or Preposition tail invites noun-ish candidates (entities +
 * fringe nouns); a Pronoun tail or an infinitival "to" after a verb
 * invites fringe verbs.
 *
 * Eligibility differs by kind: personal entities surface on invitation or
 * recency alone (few, high-value — a fresh add must be reachable);
 * fringe senses additionally need evidence (ever selected or recent), so
 * the strip doesn't fill with arbitrary unused words.
 *
 * @returns {Array<{kind:'sense'|'entity', id:string}>} capped at STRIP_CAP.
 */
export function stripCandidates(db, sentence, now = Date.now(), locale) {
  return stripScored(db, sentence, now, locale)
    .slice(0, STRIP_CAP)
    .map((r) => ({ kind: r.kind, id: r.id }));
}

function scoreRow(r, invited, now) {
  return {
    last: r.last_selected ?? 0,
    score:
      (invited ? 100 : 0) + (r.recent ? 20 : 0) + (r.same_hour ?? 0) * 5 +
      (r.freq ?? 0) * 2 +
      (r.last_selected ? Math.max(0, 10 - (now - r.last_selected) / 60000) : 0),
  };
}

/**
 * The shortlist with its features — what the strip moment records on
 * the impression (schema §6.2d). Same ranking as stripCandidates, but
 * the rows keep the evidence the score was built from. `p` stays absent
 * until slice 3's softmax — there is no probability yet.
 */
export function stripScored(db, sentence, now = Date.now(), locale) {
  if (typeof locale !== "string" || locale.length === 0) {
    throw new Error("locale is a required parameter");
  }
  const { pos, prevPos } = tailInfo(db, sentence, locale);
  const tail = sentence[sentence.length - 1];
  const ctx = { pos, prevPos, tailId: tail?.kind === "sense" ? tail.id : null };
  const rules = GRAMMAR[locale];
  const invitesNoun = rules ? rules.invitesNoun(ctx) : false;
  const invitesVerb = rules ? rules.invitesVerb(ctx) : false;
  const recentCutoff = now - RECENT_WINDOW_MS;
  const hour = new Date(now).getHours();
  const tzNow = -new Date(now).getTimezoneOffset();

  const pack = (r, invited) => ({
    kind: r.kind, id: r.id,
    x: {
      invited: invited ? 1 : 0,
      recent: r.recent ?? 0,
      same_hour: r.same_hour ?? 0,
      freq: r.freq ?? 0,
    },
    last: r.last_selected ?? 0,
    score: scoreRow(r, invited, now).score,
  });

  const entityRows = db
    .prepare(
      `SELECT e.id,
         MAX(CASE WHEN l.selected_at > ? THEN 1 ELSE 0 END) AS recent,
         SUM(CASE WHEN CAST(strftime('%H', l.selected_at / 1000 + COALESCE(l.tz_offset_min, ?) * 60, 'unixepoch') AS INTEGER) = ?
              THEN 1 ELSE 0 END) AS same_hour,
         COUNT(l.id) AS freq,
         MAX(l.selected_at) AS last_selected
       FROM personal_entity e
       LEFT JOIN learner_event_log l
         ON l.item_kind = 'entity' AND l.item_id = e.id
       WHERE e.status = 'active'
       GROUP BY e.id`,
    )
    .all(recentCutoff, tzNow, hour)
    .filter((r) => invitesNoun || r.recent === 1)
    .map((r) => pack({ ...r, kind: "entity" }, invitesNoun));

  const fringeRows = db
    .prepare(
      `SELECT s.id, lb.part_of_speech AS pos,
         MAX(CASE WHEN l.selected_at > ? THEN 1 ELSE 0 END) AS recent,
         SUM(CASE WHEN CAST(strftime('%H', l.selected_at / 1000 + COALESCE(l.tz_offset_min, ?) * 60, 'unixepoch') AS INTEGER) = ?
              THEN 1 ELSE 0 END) AS same_hour,
         COUNT(l.id) AS freq,
         MAX(l.selected_at) AS last_selected
       FROM sense s
       JOIN label lb ON lb.sense_id = s.id
         AND lb.kind = 'lemma' AND lb.status = 'approved' AND lb.locale = ?
       LEFT JOIN learner_event_log l
         ON l.item_kind = 'sense' AND l.item_id = s.id
       WHERE s.tier = 'primary_fringe'
       GROUP BY s.id`,
    )
    .all(recentCutoff, tzNow, hour, locale)
    .filter(
      (r) =>
        (r.freq > 0 || r.recent === 1) &&
        ((invitesNoun && r.pos === "Noun") || (invitesVerb && r.pos === "Verb")),
    )
    .map((r) => pack({ ...r, kind: "sense" }, invitesNoun || invitesVerb));

  return [...entityRows, ...fringeRows]
    .sort((a, b) => b.score - a.score || b.last - a.last || a.id.localeCompare(b.id));
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
}) {
  db.prepare(
    `INSERT INTO strip_impression
       (sentence_id, position, shown_at, candidates, shown, p_none,
        weight_set, jev_status, jev_model)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    sentenceId, position, shownAt,
    JSON.stringify(candidates), JSON.stringify(shown), pNone,
    weightSet, jevStatus, jevModel,
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
export function keyboardContinuations(db, sentence, locale, now = Date.now()) {
  if (typeof locale !== "string" || locale.length === 0) {
    throw new Error("locale is a required parameter");
  }
  const tail = sentence[sentence.length - 1];
  if (!tail) return [];

  const merged = new Map(); // "kind:id" -> {kind, id, bigrams, invited, freq, last}
  const put = (kind, id, { bigrams = 0, invited = false } = {}) => {
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
  for (const c of stripCandidates(db, sentence, now, locale)) {
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
