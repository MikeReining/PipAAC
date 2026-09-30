/**
 * The progress dashboard (docs/product/Stats_And_Progress.md § 4.2).
 *
 * Pure aggregation over stats_day rows — the device-local day totals
 * from stats.mjs, merged across the user's own devices. Reads stats_day
 * plus goal lists (via goalWords); never the tap log, sentences, or
 * sentence-button presses (their counts ride stats_day).
 * No comparisons to other children, no percentiles, no norms (§ 4.3).
 *
 * A "week" is the stats-day index bucket Math.floor(day / 7) — the same
 * bucket goalWords uses, so goals and trends line up.
 */

import { goalWords } from "./spotlight.mjs";

const DAY = 86_400_000;
export const WEEK_DAYS = 7;

/** Merge every (day, device) row in [fromDay, toDay] into one range
 *  aggregate — the same per-word add-up § 6.2 requires. */
export function rangeTotals(db, fromDay, toDay) {
  const rows = db
    .prepare("SELECT day, payload FROM stats_day WHERE day BETWEEN ? AND ?")
    .all(fromDay, toDay);
  const perWord = {};
  const sources = { grid: 0, strip: 0, group: 0, keyboard: 0 };
  const hours = Array(24).fill(0);
  const dows = Array(7).fill(0);
  const byWeek = new Map(); // weekIdx → {week, days:Set, words, different:Set, sentences, longest}
  const wpmPoints = []; // {median, samples} per day — weighted-median inputs
  const firstKeys = new Set();
  let words = 0, sentences = 0, sentenceWords = 0, longest = 0, spotlit = 0;
  let core = 0, fringe = 0, own = 0, newCount = 0;

  for (const r of rows) {
    const p = JSON.parse(r.payload);
    const wk = Math.floor(r.day / WEEK_DAYS);
    const w = byWeek.get(wk) ?? {
      week: wk, days: new Set(), words: 0, wordSet: new Set(),
      sentences: 0, sentenceWords: 0, longest: 0, wpm: [],
    };
    w.days.add(r.day);
    w.words += p.words;
    w.sentences += p.sentences;
    w.sentenceWords += p.sentences * (p.words_per_sentence ?? 0);
    w.longest = Math.max(w.longest, p.longest_sentence);
    if (p.wpm_median != null) w.wpm.push({ median: p.wpm_median, samples: p.wpm_samples });
    byWeek.set(wk, w);

    words += p.words;
    sentences += p.sentences;
    sentenceWords += p.sentences * (p.words_per_sentence ?? 0);
    longest = Math.max(longest, p.longest_sentence);
    spotlit += p.spotlit;
    core += p.core; fringe += p.fringe; own += p.own;
    newCount += p.new;
    if (p.wpm_median != null) wpmPoints.push({ median: p.wpm_median, samples: p.wpm_samples });
    for (const [k, v] of Object.entries(p.sources ?? {})) {
      if (k in sources) sources[k] += v;
    }
    (p.hours ?? []).forEach((n, h) => { hours[h] += n; });
    // Epoch day 0 was a Thursday: day-of-week (0 = Sunday) is (day+4)%7.
    dows[(r.day + 4) % 7] += p.words;
    for (const [key, e] of Object.entries(p.per_word ?? {})) {
      const m = (perWord[key] ??= { taps: 0, spotlit: 0 });
      m.taps += e.taps;
      m.spotlit += e.spotlit ?? 0;
      if (e.first) firstKeys.add(key);
      w.wordSet.add(key);
    }
  }

  const weeks = [...byWeek.values()].sort((a, b) => a.week - b.week).map((w) => ({
    week: w.week,
    days: w.days.size,
    words: w.words,
    different: w.wordSet.size,
    sentences: w.sentences,
    wordsPerSentence: w.sentences ? w.sentenceWords / w.sentences : null,
    longest: w.longest,
    wpm: weightedMedian(w.wpm),
  }));

  return {
    fromDay, toDay,
    words,
    different: Object.keys(perWord).length,
    newCount,
    firstKeys: [...firstKeys],
    sentences,
    wordsPerSentence: sentences ? sentenceWords / sentences : null,
    longest,
    wpm: weightedMedian(wpmPoints),
    core, fringe, own, spotlit,
    sources, hours, dows,
    weeks,
    topWords: Object.entries(perWord)
      .sort((a, b) => b[1].taps - a[1].taps)
      .slice(0, 10)
      .map(([key, v]) => ({ key, ...v })),
  };
}

/** Median of per-day medians weighted by sample count — the honest
 *  aggregate when per-sentence rates aren't stored (slice 1 keeps the
 *  day's median + n, not every sentence). */
export function weightedMedian(points) {
  const pts = points.filter((p) => p.samples > 0).sort((a, b) => a.median - b.median);
  const total = pts.reduce((n, p) => n + p.samples, 0);
  if (!total) return null;
  let acc = 0;
  for (const p of pts) {
    acc += p.samples;
    if (acc > total / 2) return p.median; // upper median on ties
  }
  return pts.at(-1).median;
}

/** The three headline numbers (§ 4.2): Label-Only users lead with rate;
 *  everyone else leads with breadth and sentence length. A supporter
 *  can change it — the caller passes the chosen mode. Each headline
 *  carries its weekly series so the screen can show the trend. */
export function headlines(totals, mode = "symbol") {
  const wk = (pick) => totals.weeks.map((w) => pick(w));
  const wpm = { label: "words per minute", value: totals.wpm,
    trend: wk((w) => w.wpm) };
  const breadth = { label: "different words", value: totals.different,
    trend: wk((w) => w.different) };
  const length = { label: "words per sentence", value: totals.wordsPerSentence,
    trend: wk((w) => w.wordsPerSentence) };
  const taps = { label: "words", value: totals.words, trend: wk((w) => w.words) };
  return mode === "label"
    ? [wpm, taps, breadth]
    : [breadth, length, taps];
}

/** The whole dashboard for [fromDay, toDay]. `nameOf(kind, id)` resolves
 *  item keys for new/top word lists; unresolvable items keep their key. */
export function dashboard(db, fromDay, toDay, { nameOf = () => null, mode = "symbol" } = {}) {
  const totals = rangeTotals(db, fromDay, toDay);
  const name = (key) => nameOf(...key.split(":")) ?? key.split(":")[1];
  return {
    ...totals,
    headline: headlines(totals, mode),
    newWords: totals.firstKeys.map((k) => ({ key: k, name: name(k) })),
    topWords: totals.topWords.map((t) => ({ ...t, name: name(t.key) })),
    stripShare: totals.words ? totals.sources.strip / totals.words : 0,
    goals: goalWords(db, fromDay, toDay),
    buttons: sentenceButtons(db, fromDay, toDay),
  };
}

/** 032 E4: sentence-button presses (✨ ❓ ⏪ ⏩) in [fromDay, toDay], by
 *  mode — on their own vs with the glow — in total and by week, summed
 *  across the user's devices like every other day total. */
export function sentenceButtons(db, fromDay, toDay) {
  const total = {};
  const weeks = {};
  for (const r of db
    .prepare("SELECT day, payload FROM stats_day WHERE day BETWEEN ? AND ?")
    .all(fromDay, toDay)) {
    const wk = Math.floor(r.day / WEEK_DAYS);
    for (const [mode, c] of Object.entries(JSON.parse(r.payload).transforms ?? {})) {
      for (const bucket of [(total[mode] ??= { own: 0, glow: 0 }),
        ((weeks[wk] ??= {})[mode] ??= { own: 0, glow: 0 })]) {
        bucket.own += c.own;
        bucket.glow += c.glow;
      }
    }
  }
  return { total, weeks };
}

/** Day index helpers shared with the UI's range picker. */
export const dayOf = (at, tzOffsetMin) => Math.floor((at + tzOffsetMin * 60000) / DAY);
export const rangeFor = (span, now = Date.now()) => {
  const tz = -new Date(now).getTimezoneOffset();
  const today = dayOf(now, tz);
  const days = span === "week" ? 7 : span === "month" ? 30 : 90;
  return { fromDay: today - days + 1, toDay: today, days };
};
