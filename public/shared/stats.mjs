/**
 * The stats engine (docs/product/Stats_And_Progress.md § 3, § 6).
 *
 * Every number has one definition, computed the same way on every
 * device, from two device-local tables: learner_event_log (taps) and
 * sentence (spoken/cleared bars) — plus core_cell to split core from
 * fringe. The module reads nothing else: the Works Test runs it against
 * a database holding only those tables.
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

/** Words per minute, § 3: words ÷ (first tap → Speak) over spoken
 *  sentences of 2+ words; the day's median and its sample count. A
 *  zero-duration sample is a clock artifact, not a rate — skipped. */
export function wpmStats(spoken) {
  const rates = spoken
    .filter((s) => s.words >= 2 && s.ended_at > s.started_at)
    .map((s) => s.words / ((s.ended_at - s.started_at) / 60000))
    .sort((a, b) => a - b);
  const median = rates.length
    ? rates.length % 2
      ? rates[(rates.length - 1) / 2]
      : (rates[rates.length / 2 - 1] + rates[rates.length / 2]) / 2
    : null;
  return { wpm_median: median, wpm_samples: rates.length };
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
  const { wpm_median, wpm_samples } = wpmStats(spoken);
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
    wpm_samples,
    core,
    fringe,
    own,
    spotlit,
    sources,
    hours,
    lengths,
    per_word: perWord,
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
