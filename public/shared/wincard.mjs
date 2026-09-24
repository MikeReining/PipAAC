/**
 * The weekly win card (docs/product/Stats_And_Progress.md § 4.1).
 *
 * A preview of the dashboard, free for every user: a summary line plus
 * up to three wins picked from the week's `stats_day` totals —
 * first-time words, the longest sentence, a streak, the week's favorite.
 * The law is wins only: nothing here compares a week to another, so no
 * card can ever state a decrease.
 *
 * Pure rules over stats_day payloads; the only tables read are
 * stats_day and — when backfilling a missing day — the same tables
 * stats.mjs reads. Item keys resolve to display names through an
 * injected `nameOf`, so this module never touches label or entity
 * tables.
 */
import { dayIndex, upsertStatsDay } from "./stats.mjs";

export const WINCARD_DAYS = 7;

/** Fill missing stats_day rows in [fromDay, toDay] — INSERT-only; a
 *  written day is never rewritten here (older days are fixed). */
export function ensureStatsDays(db, fromDay, toDay, now = Date.now()) {
  const have = new Set(
    db.prepare("SELECT day FROM stats_day WHERE day BETWEEN ? AND ?")
      .all(fromDay, toDay)
      .map((r) => r.day),
  );
  for (let d = fromDay; d <= toDay; d++) {
    if (!have.has(d)) upsertStatsDay(db, d, now);
  }
}

/** Merge the week's day rows into one aggregate — per-word counts add
 *  up exactly across devices and days (§ 6.2). */
export function weekAggregate(db, fromDay, toDay) {
  const rows = db
    .prepare("SELECT day, payload FROM stats_day WHERE day BETWEEN ? AND ? ORDER BY day")
    .all(fromDay, toDay);
  const perWord = {};
  const firstKeys = [];
  let words = 0, sentences = 0, longest = 0, spotlit = 0;
  const byDay = new Map(); // rows are (day, device) — merge to per-day words
  for (const r of rows) {
    const p = JSON.parse(r.payload);
    byDay.set(r.day, (byDay.get(r.day) ?? 0) + p.words);
    words += p.words;
    sentences += p.sentences;
    longest = Math.max(longest, p.longest_sentence);
    spotlit += p.spotlit;
    for (const [key, e] of Object.entries(p.per_word ?? {})) {
      const m = (perWord[key] ??= { taps: 0, spotlit: 0 });
      m.taps += e.taps;
      m.spotlit += e.spotlit ?? 0;
      if (e.first) firstKeys.push(key);
    }
  }
  return {
    days: [...byDay.entries()].sort((a, b) => a[0] - b[0])
      .map(([day, w]) => ({ day, words: w })),
    words, sentences, longest, spotlit, perWord, firstKeys,
    different: Object.keys(perWord).length,
  };
}

/** Consecutive days with at least one tap, measured back from the
 *  newest active day — a quiet today doesn't erase a live streak. */
export function streakOf(days) {
  let i = days.length - 1;
  while (i >= 0 && days[i].words <= 0) i--;
  let streak = 0;
  for (; i >= 0 && days[i].words > 0; i--) streak++;
  return streak;
}

/** Up to three wins from a week aggregate — § 4.1: "wins only". Every
 *  line is absolute; no rule compares to another week, so a quieter
 *  week still reads as wins, never a drop. `nameOf(kind, id)` resolves
 *  an item to its display name; unknown items are skipped. */
export function pickWins(agg, nameOf = () => null) {
  const wins = [];
  if (agg.firstKeys.length) {
    const names = agg.firstKeys
      .map((k) => nameOf(...k.split(":")))
      .filter(Boolean);
    if (names.length && names.length <= 2) wins.push(`First time: ${names.join(" and ")}`);
    else if (names.length) wins.push(`First time: ${names[0]} and ${names.length - 1} more new words`);
  }
  if (agg.longest >= 2) wins.push(`Longest sentence: ${agg.longest} words`);
  const streak = streakOf(agg.days);
  if (streak >= 2) wins.push(`${streak} days in a row`);
  const top = Object.entries(agg.perWord).sort((a, b) => b[1].taps - a[1].taps)[0];
  const topName = top ? nameOf(...top[0].split(":")) : null;
  if (topName) wins.push(`Favorite this week: ${topName}`);
  return wins.slice(0, 3);
}

/** The card for the week ending today (rolling 7 local days). Returns
 *  `{ summary, wins, empty }` — `empty` means no taps at all; the UI
 *  hides the card rather than show a quiet week as a failure. */
export function weeklyCard(db, now = Date.now(), nameOf = () => null) {
  const today = dayIndex(now, -new Date(now).getTimezoneOffset());
  ensureStatsDays(db, today - (WINCARD_DAYS - 1), today, now);
  const agg = weekAggregate(db, today - (WINCARD_DAYS - 1), today);
  if (!agg.words) return { summary: "", wins: [], empty: true };
  const parts = [
    `${agg.words} word${agg.words === 1 ? "" : "s"}`,
    `${agg.different} different`,
  ];
  if (agg.longest >= 2) parts.push(`longest sentence ${agg.longest} words`);
  return {
    summary: `This week: ${parts.join(", ")}`,
    wins: pickWins(agg, nameOf),
    empty: false,
  };
}
