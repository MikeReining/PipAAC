/**
 * The stats engine (docs/product/Stats_And_Progress.md § 3, § 6).
 *
 * Every number has one definition, computed the same way on every
 * device, from four device-local tables: learner_event_log (taps),
 * sentence (spoken/cleared bars), strip_impression (painted moments),
 * and transform_event (sentence-button presses, 032 E4) — plus
 * core_cell to split core from fringe. The module
 * reads nothing else: the Works Test runs it against a database
 * holding only those tables.
 *
 * Output is counts only. One `stats_day` row per local day: counts per
 * word (by id, never text), sentence-length counts, words-per-minute
 * inputs, source counts, spotlit counts, taps per hour. No times, no
 * sequences — the day row is the unit that syncs to supporters.
 *
 * A "day" is each event's own local day: selected_at + tz_offset_min
 * bucketed by calendar day, so travel and DST never move a tap.
 */

import { getDeviceId, recordOp } from "./ops.mjs";

const DAY_MS = 86_400_000;

/** Local-day index for one event under its own stored offset. */
const dayKeySql = (col, tz) => `(${col} + ${tz} * 60000) / ${DAY_MS}`;

export function dayIndex(at, tzOffsetMin) {
  return Math.floor((at + tzOffsetMin * 60000) / DAY_MS);
}

/** All taps on `day`: kind, id, source, spotlit — ids only. */
export function tapsOnDay(db, day) {
  return db
    .prepare(
      `SELECT item_kind AS kind, item_id AS id, source, spotlit
       FROM learner_event_log
       WHERE ${dayKeySql("selected_at", "COALESCE(tz_offset_min, 0)")} = ?`,
    )
    .all(day);
}

/** Spoken/cleared bars that ended on `day`, with their member count. */
export function sentencesOnDay(db, day) {
  return db
    .prepare(
      `SELECT s.id, s.started_at, s.ended_at, s.end_kind,
              (SELECT COUNT(*) FROM learner_event_log e
                WHERE e.sentence_id = s.id) AS words
       FROM sentence s
       WHERE s.end_kind IS NOT NULL
         AND ${dayKeySql("s.ended_at", "COALESCE(s.tz_offset_min, 0)")} = ?`,
    )
    .all(day);
}

/** Items whose first-ever tap happened on `day`. */
export function newItemsOnDay(db, day) {
  return db
    .prepare(
      `SELECT item_kind || ':' || item_id AS key FROM learner_event_log
       GROUP BY item_kind, item_id
       HAVING MIN(${dayKeySql("selected_at", "COALESCE(tz_offset_min, 0)")}) = ?`,
    )
    .all(day)
    .map((r) => r.key);
}

/** Core / fringe / own split for a set of taps (§ 3). A sense on any
 *  core layout is core; any other sense is fringe; entities are own. */
export function classifyTaps(db, taps) {
  const coreIds = new Set(
    db.prepare("SELECT DISTINCT sense_id FROM core_cell").all().map((r) => r.sense_id),
  );
  const out = { core: 0, fringe: 0, own: 0 };
  for (const t of taps) {
    if (t.kind === "entity") out.own++;
    else if (coreIds.has(t.id)) out.core++;
    else out.fringe++;
  }
  return out;
}

/** Interpolated percentile over a sorted array — index p·(n−1). */
function pct(sorted, p) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/** Median and quartiles of a sorted sample. */
function quartiles(sorted) {
  return { q1: pct(sorted, 0.25), median: pct(sorted, 0.5), q3: pct(sorted, 0.75) };
}

/** Words per minute, § 3: words ÷ (first tap → Speak) over spoken
 *  sentences of 2+ words; the day's median, quartiles, and sample
 *  count. A zero-duration sample is a clock artifact, not a rate —
 *  skipped. */
export function wpmStats(spoken) {
  const rates = spoken
    .filter((s) => s.words >= 2 && s.ended_at > s.started_at)
    .map((s) => s.words / ((s.ended_at - s.started_at) / 60000))
    .sort((a, b) => a - b);
  const q = quartiles(rates);
  return { wpm_median: q.median, wpm_q1: q.q1, wpm_q3: q.q3, wpm_samples: rates.length };
}

/** Time between picks inside a sentence, bucketed by the second pick's
 *  source (§ 3.1, 017 step 28): the pause before the pick plus the tap.
 *  The sentence's first pick has no in-sentence pause and never counts.
 *  A non-positive gap is a clock artifact — skipped. Per-path median,
 *  quartiles, and sample count. `day` buckets each pick by its own
 *  stored offset; `from`/`to` take a raw ms window. */
export function pathTimes(db, { day = null, from = 0, to = Number.MAX_SAFE_INTEGER } = {}) {
  const where = day == null
    ? "e.selected_at >= ? AND e.selected_at < ?"
    : `${dayKeySql("e.selected_at", "COALESCE(e.tz_offset_min, 0)")} = ?`;
  const rows = db.prepare(
    `SELECT e.source,
            e.selected_at - (
              SELECT p.selected_at FROM learner_event_log p
              WHERE p.sentence_id = e.sentence_id AND p.position = e.position - 1
            ) AS gap
     FROM learner_event_log e
     WHERE e.sentence_id IS NOT NULL AND e.position > 0 AND ${where}`,
  ).all(...(day == null ? [from, to] : [day]));
  const bySource = {};
  for (const r of rows) {
    if (!(r.gap > 0) || !r.source) continue;
    (bySource[r.source] ??= []).push(r.gap);
  }
  const out = {};
  for (const [src, gaps] of Object.entries(bySource)) {
    gaps.sort((a, b) => a - b);
    out[src] = { ...quartiles(gaps), n: gaps.length };
  }
  return out;
}

/** A strip pick the family removed within a few seconds is a wrong
 *  pick (017 step 28 item 4): faster must not hide "put words in the
 *  user's mouth". `detached_at` is stamped by detachEvent; the only
 *  removal path is the keyboard's ⌫ key. */
export const WRONG_PICK_MS = 10_000;

export function wrongPicks(db, { day = null, from = 0, to = Number.MAX_SAFE_INTEGER } = {}) {
  const where = day == null
    ? "selected_at >= ? AND selected_at < ?"
    : `${dayKeySql("selected_at", "COALESCE(tz_offset_min, 0)")} = ?`;
  return db.prepare(
    `SELECT COUNT(*) AS n FROM learner_event_log
     WHERE source = 'strip' AND detached_at IS NOT NULL
       AND detached_at - selected_at <= ? AND ${where}`,
  ).all(WRONG_PICK_MS, ...(day == null ? [from, to] : [day]))[0].n;
}

/** Sentence-button presses on `day` (032 E4), by mode: on their own vs
 *  while the button glowed in a Spotlight. Only modes pressed appear. */
export function transformsOnDay(db, day) {
  const out = {};
  for (const r of db.prepare(
    `SELECT mode, spotlit, COUNT(*) AS n FROM transform_event
     WHERE ${dayKeySql("pressed_at", "tz_offset_min")} = ?
     GROUP BY mode, spotlit`,
  ).all(day)) {
    const m = (out[r.mode] ??= { own: 0, glow: 0 });
    m[r.spotlit ? "glow" : "own"] += r.n;
  }
  return out;
}

/** One `stats_day` row for `day` — every § 3 number, counts only. */
export function dailyTotals(db, day, computedAt = Date.now()) {
  const taps = tapsOnDay(db, day);
  const sentences = sentencesOnDay(db, day);
  const spoken = sentences.filter((s) => s.end_kind === "spoken");

  const perWord = {};
  const sources = { grid: 0, strip: 0, group: 0, keyboard: 0 };
  const hours = Array(24).fill(0);
  const lengths = {};
  let spotlit = 0;
  for (const t of taps) {
    const key = `${t.kind}:${t.id}`;
    (perWord[key] ??= { taps: 0, spotlit: 0 }).taps++;
    if (t.spotlit) {
      perWord[key].spotlit++;
      spotlit++;
    }
    if (t.source) sources[t.source] = (sources[t.source] ?? 0) + 1;
  }
  for (const s of spoken) {
    lengths[s.words] = (lengths[s.words] ?? 0) + 1;
  }
  // Hour buckets use each tap's own offset — same query shape as taps.
  for (const r of db
    .prepare(
      `SELECT CAST(strftime('%H', selected_at / 1000 +
              COALESCE(tz_offset_min, 0) * 60, 'unixepoch') AS INTEGER) AS h
       FROM learner_event_log
       WHERE ${dayKeySql("selected_at", "COALESCE(tz_offset_min, 0)")} = ?`,
    )
    .all(day)) {
    hours[r.h]++;
  }

  const { core, fringe, own } = classifyTaps(db, taps);
  const { wpm_median, wpm_q1, wpm_q3, wpm_samples } = wpmStats(spoken);
  const totalWords = spoken.reduce((n, s) => n + s.words, 0);
  // First-ever taps get a flag on the word's entry — the win card names
  // them without re-reading the log.
  for (const key of newItemsOnDay(db, day)) {
    if (perWord[key]) perWord[key].first = 1;
  }

  return {
    day,
    computed_at: computedAt,
    words: taps.length,
    different: Object.keys(perWord).length,
    new: newItemsOnDay(db, day).length,
    sentences: spoken.length,
    words_per_sentence: spoken.length ? totalWords / spoken.length : null,
    longest_sentence: spoken.length ? Math.max(...spoken.map((s) => s.words)) : 0,
    wpm_median,
    wpm_q1,
    wpm_q3,
    wpm_samples,
    path_times: pathTimes(db, { day }),
    wrong_picks: wrongPicks(db, { day }),
    core,
    fringe,
    own,
    spotlit,
    sources,
    hours,
    lengths,
    per_word: perWord,
    transforms: transformsOnDay(db, day),
  };
}

/** Raw (day, device) row write — the op-replay path writes under the
 *  ORIGINATING device, so totals from several devices add up (§ 6.2). */
export function writeStatsDay(db, day, deviceId, computedAt, payload) {
  db.prepare(
    `INSERT INTO stats_day (day, device_id, computed_at, payload) VALUES (?, ?, ?, ?)
     ON CONFLICT(day, device_id) DO UPDATE SET computed_at = excluded.computed_at,
       payload = excluded.payload`,
  ).run(day, deviceId, computedAt,
    typeof payload === "string" ? payload : JSON.stringify(payload));
}

/** Compute and write this device's `stats_day` row for `day`, emitting
 *  a `put_stats_day` op so supporters see the same row. A recompute
 *  that changes nothing records no op — quiet days stay quiet. */
export function upsertStatsDay(db, day, computedAt = Date.now()) {
  const row = dailyTotals(db, day, computedAt);
  const deviceId = getDeviceId();
  const prev = db
    .prepare("SELECT payload FROM stats_day WHERE day = ? AND device_id = ?")
    .all(day, deviceId)[0]?.payload;
  const strip = (p) => JSON.stringify({ ...JSON.parse(p), computed_at: 0 });
  if (!prev || strip(prev) !== strip(JSON.stringify(row))) {
    writeStatsDay(db, day, deviceId, computedAt, row);
    recordOp(db, "put_stats_day", { day, computed_at: computedAt, payload: row });
  }
  return row;
}

/** Recompute today and yesterday — older days are fixed (016 § 1). The
 *  caller debounces; each call rewrites at most two rows. */
export function refreshStatsDays(db, now = Date.now()) {
  const tz = -new Date(now).getTimezoneOffset();
  const today = dayIndex(now, tz);
  return [upsertStatsDay(db, today - 1, now), upsertStatsDay(db, today, now)];
}
