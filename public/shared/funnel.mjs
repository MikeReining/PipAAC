/**
 * Slice 3 strip — phrase-history ranking (smart bar v2).
 *
 * One rule: after every tap, walk the phrase's endings longest-first —
 * the whole phrase, then drop the first item, down to the last item —
 * and stop at the FIRST ending that has any following word in any
 * source. Show only the words that followed THAT ending: her-now by
 * count, then her-any by count, then children by count, deduplicated,
 * up to 4. A shorter ending is a different grammatical situation —
 * never fill missing slots from it. A mid-sentence phrase never falls
 * back to the empty phrase — "" means "start of a sentence".
 * No gate, no threshold, no model, no learned parameters: one spoken
 * sentence of hers is evidence.
 */

import { pathTimes, wpmStats, wrongPicks } from "./stats.mjs";

const STRIP_CAP = 4;
export { STRIP_CAP };

/** Her "now" table: sentence starts within +-90 minutes of the current
 *  local time of day, any day. */
export const HER_NOW_MIN = 90;

/** Ranked candidates kept on a strip moment for later evaluation. */
const RANKED_CAP = 16;

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

/** 025 § 5: spoken_feeling lands with the Ara catalog rebuild —
 *  ensureAdditiveColumns adds it at boot, but a db opened any other
 *  way still closes cleanly. */
const hasFeelingCol = new WeakMap();
const feelingCol = (db) => {
  let has = hasFeelingCol.get(db);
  if (has === undefined) {
    has = db.prepare("PRAGMA table_info(sentence)").all()
      .some((c) => c.name === "spoken_feeling");
    hasFeelingCol.set(db, has);
  }
  return has;
};

export function closeSentence(db, id, at = Date.now(), kind, feeling = null) {
  const open = db.prepare(
    "SELECT 1 AS ok FROM sentence WHERE id = ? AND end_kind IS NULL",
  ).all(id)[0];
  if (!open) return;
  if (feeling && feelingCol(db)) {
    db.prepare(
      "UPDATE sentence SET ended_at = ?, end_kind = ?, spoken_feeling = ? WHERE id = ? AND end_kind IS NULL",
    ).run(at, kind, feeling, id);
  } else {
    db.prepare(
      "UPDATE sentence SET ended_at = ?, end_kind = ? WHERE id = ? AND end_kind IS NULL",
    ).run(at, kind, id);
  }
  // Only spoken sentences become history — a cleared bar was never said.
  if (kind === "spoken") {
    recordPhraseHistory(db, id);
    const prev = phraseBuilt.get(db);
    if (prev !== undefined) phraseBuilt.set(db, Math.max(prev, id));
  }
}

const itemKey = (it) => `${it.kind}:${it.id}`;

/** One-meaning merges (021): "has" and "have" are the same sense, so a
 *  merged lemma's taps and its phrase contexts fold onto the kept
 *  sense. Read from the data, not a list — a form label whose text is
 *  itself a lemma says these two senses are one word. */
const mergeCache = new WeakMap(); // db -> Map<sense_id, kept sense_id>
export function senseMerge(db) {
  let m = mergeCache.get(db);
  if (m) return m;
  m = new Map();
  for (const r of db.prepare(
    `SELECT l.sense_id AS gone, f.sense_id AS kept
     FROM label f JOIN label l
       ON l.kind = 'lemma' AND l.status = 'approved'
      AND l.locale = f.locale AND l.normalized_text = f.normalized_text
     WHERE f.kind = 'form' AND f.status = 'approved' AND l.sense_id != f.sense_id`,
  ).all()) {
    m.set(r.gone, r.kept);
  }
  mergeCache.set(db, m);
  return m;
}
const foldItem = (db, it) =>
  it.kind === "sense" ? { kind: it.kind, id: senseMerge(db).get(it.id) ?? it.id } : it;
const itemKeyDb = (db, it) => itemKey(foldItem(db, it));
const ctxKeyDb = (db, items) => items.map((it) => itemKeyDb(db, it)).join(" ");

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
       (item_kind, item_id, selected_at, sentence_id, position, source, tz_offset_min, spotlit, label_id, group_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    kind, id, at,
    ctx.sentenceId ?? null, ctx.position ?? null, ctx.source ?? null,
    -new Date(at).getTimezoneOffset(), ctx.spotlit ? 1 : 0,
    ctx.labelId ?? null, ctx.groupId ?? null,
  );
}

/** 032 E4: one sentence-button press (✨ ❓ ⏪ ⏩). `spotlit`: the button
 *  glowed in a running Spotlight when pressed. */
export function logTransform(db, mode, spotlit, at = Date.now()) {
  db.prepare(
    `INSERT INTO transform_event (mode, pressed_at, tz_offset_min, spotlit)
     VALUES (?, ?, ?, ?)`,
  ).run(mode, at, -new Date(at).getTimezoneOffset(), spotlit ? 1 : 0);
}

/** One row per (ending, next item) pair of the spoken sentence: the
 *  empty ctx counts sentence-start items only; every other ctx is a
 *  SUFFIX of a prefix — "what came next after this ending" is what the
 *  bar asks, so endings are what gets stored. Plain counts — no decay,
 *  no weights; the evidence gate reads them raw.
 *  phrase_link keeps the same pairs per sentence with the start's
 *  minute-of-day — the ±90-minute "her now" window is then a pure
 *  `mod IN` index predicate instead of a per-tap rescan (044 A0). */
function recordPhraseHistory(db, sentenceId) {
  const picks = db.prepare(
    `SELECT item_kind AS kind, item_id AS id, selected_at AS at,
            tz_offset_min AS tz
     FROM learner_event_log
     WHERE sentence_id = ? AND position IS NOT NULL
     ORDER BY position`,
  ).all(sentenceId);
  const put = db.prepare(
    `INSERT INTO phrase_count (ctx, item_kind, item_id, n)
     VALUES (?, ?, ?, 1)
     ON CONFLICT (ctx, item_kind, item_id) DO UPDATE SET n = n + 1`,
  );
  const link = db.prepare(
    `INSERT INTO phrase_link (ctx, mod, sid, pos, item_kind, item_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const start = picks[0];
  const mod = start === undefined ? 0 : minuteOfDay(
    start.at, start.tz ?? -new Date(start.at).getTimezoneOffset());
  for (let j = 0; j < picks.length; j++) {
    const it = foldItem(db, picks[j]);
    for (let len = j === 0 ? 0 : 1; len <= j; len++) {
      const ctx = ctxKeyDb(db, picks.slice(j - len, j));
      put.run(ctx, it.kind, it.id);
      link.run(ctx, mod, sentenceId, j, it.kind, it.id);
    }
  }
}

/** phrase_count is a derived cache of learner_event_log. Kept current
 *  incrementally — synced sentences land as new local rows and are
 *  picked up by the id watermark. The full rebuild runs once-ever per
 *  install (persisted in phrase_watermark): rescanning every session
 *  cost ~80 s of CPU on a six-month history (044 A0). */
const phraseBuilt = new WeakMap(); // db -> highest spoken sentence id counted this session
function ensurePhraseHistory(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS phrase_watermark (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    built_to INTEGER NOT NULL)`);
  db.exec(`CREATE TABLE IF NOT EXISTS phrase_link (
    ctx TEXT NOT NULL,
    mod INTEGER NOT NULL CHECK (mod BETWEEN 0 AND 1439),
    sid INTEGER NOT NULL,
    pos INTEGER NOT NULL,
    item_kind TEXT NOT NULL CHECK (item_kind IN ('sense','entity')),
    item_id TEXT NOT NULL CHECK (length(item_id) > 0))`);
  db.exec(`CREATE INDEX IF NOT EXISTS phrase_link_ctx
    ON phrase_link(ctx, mod)`);
  let prev = phraseBuilt.get(db);
  if (prev === undefined) {
    prev = db.prepare(
      "SELECT built_to FROM phrase_watermark WHERE id = 1").all()[0]?.built_to;
    const empty = (t) => db.prepare(
      `SELECT 1 AS x FROM ${t} LIMIT 1`).all().length === 0;
    const spoken = db.prepare(
      "SELECT 1 AS x FROM sentence WHERE end_kind = 'spoken' LIMIT 1",
    ).all().length > 0;
    if (prev === undefined ||
        (spoken && (empty("phrase_count") || empty("phrase_link")))) {
      // Never built, or a derived table is missing rows (a pre-
      // phrase_link install counts as unbuilt) — rebuild once.
      db.exec("DELETE FROM phrase_count; DELETE FROM phrase_link");
      prev = 0;
    }
  }
  const sids = db.prepare(
    "SELECT id FROM sentence WHERE end_kind = 'spoken' AND id > ? ORDER BY id",
  ).all(prev);
  for (const s of sids) recordPhraseHistory(db, s.id);
  const to = Math.max(prev, sids.length ? sids[sids.length - 1].id : prev);
  phraseBuilt.set(db, to);
  db.prepare(
    `INSERT INTO phrase_watermark (id, built_to) VALUES (1, ?)
     ON CONFLICT(id) DO UPDATE SET built_to = excluded.built_to`,
  ).run(to);
}

/** Local clock minute of a timestamp (ms) under its own tz_offset_min. */
const minuteOfDay = (atMs, tzOffsetMin) => {
  const m = (Math.floor(atMs / 60000) + (tzOffsetMin ?? 0)) % 1440;
  return (m + 1440) % 1440;
};

/** Clock distance between two minutes of day — the window wraps
 *  midnight (23:59 and 00:01 are two minutes apart, not 1438). */
const minuteDist = (a, b) => Math.min(Math.abs(a - b), 1440 - Math.abs(a - b));

/** The ±90-minute "her now" table for the endings of one phrase — one
 *  indexed aggregate over phrase_link (each ctx probed, mod windows the
 *  start minute). Followers are stored folded, so the rows group
 *  straight into the Map the merge loop reads; first-encounter order
 *  is preserved by MIN(sid), MIN(pos) like the old event traversal. */
function herNowTable(db, endings, nowMin) {
  const keys = endings.map((e) => ctxKeyDb(db, e));
  const mods = [];
  for (let d = -HER_NOW_MIN; d <= HER_NOW_MIN; d++) {
    mods.push((((nowMin + d) % 1440) + 1440) % 1440);
  }
  const rows = db.prepare(
    `SELECT ctx, item_kind AS kind, item_id AS id, COUNT(*) AS n
     FROM phrase_link
     WHERE ctx IN (${keys.map(() => "?").join(",")})
       AND mod IN (${mods.join(",")})
     GROUP BY ctx, item_kind, item_id
     ORDER BY MIN(sid), MIN(pos)`,
  ).all(...keys);
  const table = new Map();
  for (const r of rows) {
    if (!table.has(r.ctx)) table.set(r.ctx, []);
    table.get(r.ctx).push({ kind: r.kind, id: r.id, n: r.n });
  }
  return table;
}

/** All-her-history rows for the phrase's endings only (a phrase has at
 *  most its own length + 1 endings to try). Returns Map ctx -> rows. */
function herAllRows(db, endings) {
  const table = new Map();
  const keys = endings.map((e) => ctxKeyDb(db, e));
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
 *  is missing. Group mode only (the main strip stops at the first
 *  ending with evidence). */
function lookupRanked(getRows, phrase) {
  const ranked = [];
  const seen = new Set();
  for (const ending of endingsOf(phrase)) {
    const rows = getRows(ending);
    if (!rows?.length) continue;
    const sorted = [...rows].sort((a, b) => b.n - a.n);
    for (const r of sorted) {
      const k = itemKey(r);
      if (seen.has(k)) continue;
      seen.add(k);
      ranked.push({ kind: r.kind, id: r.id, n: r.n });
    }
  }
  return ranked;
}

/** A children word shows only if it followed this ending at least this
 *  share of the times the ending was seen. Measured, not guessed:
 *  scripts/prediction/childes/measure_bar.mjs. */
export const KIDS_MIN_SHARE = 0.05;

/** The shipped children table lookup. Keys are space-joined sense ids;
 *  an ending holding an entity (or anything but senses) cannot be a
 *  children context — children in general never know her names.
 *  Returns { rows, seen } — seen is how often the ending occurred at
 *  all, so share = n / seen counts the times children said the ending
 *  and followed it with nothing we know. */
function kidsRows(kidsTable, ending, db) {
  if (!kidsTable?.contexts || ending.some((it) => it.kind !== "sense")) return null;
  const ids = ending.map((it) => foldItem(db, it).id);
  /* 041 B4 answer table: a prefix trie over b36 ids with the passing
   *  ordered list under "$" (a lone id ships bare). The 5% cut already
   *  ran at build — seen: 0 keeps every listed word. An ending whose
   *  candidates all failed the cut still won the longest-first race in
   *  the raw table — `had` keeps it winning here, painting nothing. */
  if (kidsTable.version?.startsWith("suggest-answers")) {
    let node = kidsTable.contexts;
    for (const id of ids) {
      node = node?.[parseInt(id.slice(4), 10).toString(36)];
      if (node == null) return null;
    }
    const v = node.$;
    if (v === undefined) return null;
    const arr = Array.isArray(v) ? v : [v];
    return {
      rows: arr.map((n) => ({ kind: "sense", id: `sns_${String(n).padStart(4, "0")}`, n: 1 })),
      seen: 0, had: true,
    };
  }
  const key = ids.join(" ");
  const row = kidsTable.contexts[key];
  if (!row) return null;
  const rows = Object.entries(row).map(([id, n]) => ({ kind: "sense", id, n }));
  return { rows, seen: kidsTable.seen?.[key] ?? 0, had: rows.length > 0 };
}

/** Senses the caregiver hid never enter the bar (Masking § 2). */
function maskedSenses(db) {
  return new Set(
    db.prepare("SELECT sense_id FROM sense_mask WHERE status = 'hidden'").all()
      .map((r) => r.sense_id));
}

/**
 * The strip's ranked candidates and the offer. THE RULE: the first
 * ending (longest first) with any following word in any source is the
 * only ending consulted — her-now rows by count, then her-any, then
 * children, deduplicated. Hidden senses are removed after the ending
 * is chosen; nothing falls back to replace a hidden word. `ending` is
 * the chosen ending's length — 0 means sentence start, null means no
 * ending had any follower anywhere.
 */
export function stripRanked(db, sentence, now, locale, kidsTable = null) {
  ensurePhraseHistory(db);
  const phrase = sentence.map((it) => ({ kind: it.kind, id: it.id }));
  const tzNow = -new Date(now).getTimezoneOffset();
  const nowMin = minuteOfDay(now, tzNow);
  const endings = endingsOf(phrase);

  const nowTbl = herNowTable(db, endings, nowMin);
  const allTbl = herAllRows(db, endings);
  const kids = locale === "en" ? kidsTable : null;

  let ending = null;
  const merged = [];
  const seen = new Set();
  for (const e of endings) {
    const kid = kidsRows(kids, e, db);
    const rows = [
      ["now", nowTbl.get(ctxKeyDb(db, e))],
      ["all", allTbl.get(ctxKeyDb(db, e))],
      ["kids", kid?.rows],
    ];
    if (!rows.some(([, r]) => r?.length) && !kid?.had) continue;
    ending = e.length;
    for (const [src, r] of rows) {
      // Stable by count: ties keep the source's own order (the children
      // table's rows are already in the build's encounter order).
      for (const c of [...(r ?? [])].sort((a, b) => b.n - a.n)) {
        const k = itemKey(c);
        if (seen.has(k)) continue;
        seen.add(k);
        // The 5% cutoff applies to children words only, AFTER the
        // ending is chosen — a long shot ("me" at 3% of "my mom and")
        // never paints, and an emptied ending never falls back further.
        // Her own words are never cut: she said them after this phrase.
        const share = src === "kids" && kid.seen ? c.n / kid.seen : null;
        const cut = share !== null && share < KIDS_MIN_SHARE ? 1 : 0;
        merged.push({ kind: c.kind, id: c.id, src, n: c.n, share, cut });
      }
    }
    break;
  }

  const masked = maskedSenses(db);
  const ranked = merged.map((c) => ({
    ...c, mask: c.kind === "sense" && masked.has(c.id) ? 1 : 0,
  }));
  const shown = ranked.filter((c) => !c.mask && !c.cut).slice(0, STRIP_CAP)
    .map(({ kind, id }) => ({ kind, id }));
  return { ranked: ranked.slice(0, RANKED_CAP), shown, ending };
}

/**
 * The strip tiles — up to STRIP_CAP, fewer when evidence is thin.
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
  const { shown } = stripRanked(db, sentence, now, locale, kidsTable);
  const top = shown[0];
  if (!top) return new Set();
  return new Set(
    db.prepare(
      "SELECT group_id FROM group_membership WHERE item_kind = ? AND item_id = ?",
    ).all(top.kind, top.id).map((r) => r.group_id),
  );
}

/**
 * The group bar: opening a group is intent — the bar narrows to that
 * group's members she has tapped at least once, ranked by her history
 * ONLY (children in general never enter group mode). Order, always by
 * frequency inside each tier:
 *   1. what she tapped next after this phrase (longest ending first)
 *      from her sentences inside the 90-minute window
 *   2. the same from all her sentences
 *   3. her raw tap counts of those words inside the window
 *   4. her raw tap counts of those words, any time
 * Up to STRIP_CAP: one used word paints one tile, none paints none.
 */
export function groupRanked(db, sentence, groupId, now = Date.now()) {
  ensurePhraseHistory(db);
  const members = new Set(
    db.prepare(
      "SELECT item_kind AS kind, item_id AS id FROM group_membership WHERE group_id = ?",
    ).all(groupId).map((it) => itemKeyDb(db, it)));
  if (!members.size) return { ranked: [], shown: [] };
  const masked = maskedSenses(db);
  const used = new Set(
    db.prepare(
      "SELECT DISTINCT item_kind, item_id FROM learner_event_log",
    ).all().map((r) => itemKeyDb(db, { kind: r.item_kind, id: r.item_id })));
  const offerable = (r) => {
    const it = foldItem(db, r);
    const k = itemKey(it);
    return members.has(k) && used.has(k)
      && !(it.kind === "sense" && masked.has(it.id));
  };

  const phrase = sentence.map((it) => ({ kind: it.kind, id: it.id }));
  const tzNow = -new Date(now).getTimezoneOffset();
  const nowMin = minuteOfDay(now, tzNow);
  const endings = endingsOf(phrase);

  const nowTbl = herNowTable(db, endings, nowMin);
  const allTbl = herAllRows(db, endings);
  const phraseNow = lookupRanked(
    (e) => nowTbl.get(ctxKeyDb(db, e))?.filter(offerable), phrase);
  const phraseAll = lookupRanked(
    (e) => allTbl.get(ctxKeyDb(db, e))?.filter(offerable), phrase);

  const freqNow = new Map(), freqAll = new Map();
  for (const e of db.prepare(
    "SELECT item_kind AS kind, item_id AS id, selected_at AS at, tz_offset_min AS tz FROM learner_event_log",
  ).all()) {
    const it = foldItem(db, { kind: e.kind, id: e.id });
    if (!offerable(it)) continue;
    const k = itemKey(it);
    freqAll.set(k, (freqAll.get(k) ?? 0) + 1);
    if (minuteDist(minuteOfDay(e.at, e.tz ?? tzNow), nowMin) <= HER_NOW_MIN) {
      freqNow.set(k, (freqNow.get(k) ?? 0) + 1);
    }
  }
  const freqRanked = (m) => [...m.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k, n]) => {
      const [kind, id] = k.split(":");
      return { kind, id, n };
    });

  const merged = [];
  const seen = new Set();
  const mark = (rows, src) => {
    for (const r of rows) {
      const k = itemKey(r);
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push({ kind: r.kind, id: r.id, src, her: r.n });
    }
  };
  mark(phraseNow, "now");
  mark(phraseAll, "all");
  mark(freqRanked(freqNow), "freqNow");
  mark(freqRanked(freqAll), "freq");

  return {
    ranked: merged,
    shown: merged.slice(0, STRIP_CAP).map(({ kind, id }) => ({ kind, id })),
  };
}

/**
 * 027 § 5 / B7 — the group bar in an empty sentence: first words. The
 * child's own first picks in this group (the first word of each spoken
 * sentence she started with it open) rank ahead as they accumulate;
 * then real children's first words in this group's context
 * (`starters`, the catalog's groupStarters table; a custom group uses
 * the pooled counts). Masked, retired and already-visible words are left
 * out and the next candidate backfills, up to `cap`. Missing priors only
 * mean fewer tiles — never a blocked grid.
 */
export function groupStarters(db, groupId, { starters = null, visible = new Set(), cap = STRIP_CAP } = {}) {
  const masked = maskedSenses(db);
  const offerable = (it) => {
    const k = itemKey(it);
    if (visible.has(k)) return false;
    if (it.kind === "sense") {
      return !masked.has(it.id) && !!db.prepare("SELECT 1 AS x FROM sense WHERE id = ?").all(it.id)[0];
    }
    return !!db.prepare("SELECT 1 AS x FROM personal_entity WHERE id = ? AND status = 'active'").all(it.id)[0];
  };
  const own = db.prepare(
    `SELECT e.item_kind AS kind, e.item_id AS id, COUNT(*) AS n
     FROM learner_event_log e JOIN sentence s ON s.id = e.sentence_id
     WHERE e.group_id = ? AND e.position = 0 AND e.detached_at IS NULL AND s.end_kind = 'spoken'
     GROUP BY e.item_kind, e.item_id
     ORDER BY n DESC, e.item_kind, e.item_id`,
  ).all(groupId).map((r) => ({ ...foldItem(db, { kind: r.kind, id: r.id }), src: "own", n: r.n }));
  const kind = db.prepare("SELECT kind FROM board_group WHERE id = ?").all(groupId)[0]?.kind;
  const prior = (kind === "builtin" ? starters?.groups?.[groupId] : starters?.pooled)?.first ?? [];
  const ranked = [];
  const seen = new Set();
  for (const r of [...own, ...prior.map((p) => ({ kind: "sense", id: p.sense, src: "children", n: p.n }))]) {
    const k = itemKey(r);
    if (seen.has(k) || !offerable(r)) continue;
    seen.add(k);
    ranked.push(r);
  }
  return { ranked, shown: ranked.slice(0, cap).map(({ kind: k, id }) => ({ kind: k, id })) };
}

/* --- The instrument (§ 5.7): strip_impression ------------------------ */

/**
 * One strip moment: the ranking the bar had and the tiles it showed.
 * `candidates` are stripRanked entries — {kind, id, src, n, mask};
 * `gate` carries {ending: n} — the ending length that spoke (0 =
 * sentence start, null = nothing matched). `chosen_*` stays NULL until
 * the next pick (fillChosen); a cleared sentence leaves them NULL:
 * metrics only, never a training example.
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
 * Replay a stored phrase-history moment: the shown tiles are the first
 * STRIP_CAP unhidden entries of the stored ranked list — the ending
 * choice is already baked into `candidates`. Pre-v2 rows (feature
 * vectors, weights) cannot replay under the new rule; they report as
 * such.
 */
export function replayImpression(row) {
  if (row.weight_set !== "phrase_history") {
    return { ok: false, diffs: [`weight_set ${row.weight_set} — pre-v2 row`] };
  }
  if (row.mode === "keyboard") {
    return { ok: false, diffs: ["keyboard row — continuations are metrics only"] };
  }
  const gj = row.gate ? JSON.parse(row.gate) : null;
  if (gj?.group) {
    return { ok: false, diffs: [`group bar row (${gj.group}) — ranked under the group rule`] };
  }
  if (gj == null || !("ending" in gj)) {
    return { ok: false, diffs: ["no ending recorded — pre-rule-change row"] };
  }
  const diffs = [];
  const cands = JSON.parse(row.candidates);
  const shown = cands
    .filter((c) => !c.mask && !c.cut)
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

