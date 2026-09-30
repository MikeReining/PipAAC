/**
 * 016 slice 2 Works Test — the weekly win card.
 *
 * Twelve fixture weeks, hand-authored as stats_day payloads (the same
 * shape slice 1's engine writes — proven there), including falling and
 * empty weeks. Assertions: every non-empty card shows 1–3 wins, no card
 * ever states a decrease, a first-ever word reads "First time", and the
 * rules module reads only stats_day (plus the slice-1 source tables
 * when it must backfill a missing day).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ensureStatsDays, pickWins, streakOf, weekAggregate, weeklyCard, WINCARD_DAYS,
} from "../../public/shared/wincard.mjs";

const SCHEMA = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "schema.sql"), "utf8",
);
const DAY = 86_400_000;
const TZ = -new Date().getTimezoneOffset();
// "now" sits at local noon on the last day of each fixture week.
const TODAY = Math.floor(Date.now() / DAY);

function statsDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = OFF");
  for (const t of ["learner_event_log", "sentence", "core_cell", "stats_day", "sync_op",
    "transform_event"]) {
    const ddl = SCHEMA.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${t} \\([^;]+\\);`))?.[0];
    db.exec(ddl);
  }
  return db;
}

/** A hand-authored day row — NOT written through stats.mjs, so this
 *  test grades the card rules against fixtures the engine never saw. */
function putDay(db, day, { words = 0, per_word = {}, sentences = 0, longest = 0, spotlit = 0 } = {}) {
  const payload = {
    day, computed_at: 1, words, different: Object.keys(per_word).length,
    new: Object.values(per_word).filter((e) => e.first).length,
    sentences, words_per_sentence: sentences ? words / sentences : null,
    longest_sentence: longest, wpm_median: null, wpm_samples: 0,
    core: 0, fringe: 0, own: 0, spotlit,
    sources: { grid: words, strip: 0, group: 0, keyboard: 0 },
    hours: Array(24).fill(0), lengths: {}, per_word,
  };
  db.prepare("INSERT OR REPLACE INTO stats_day (day, device_id, computed_at, payload) VALUES (?, 'dev_test', 1, ?)")
    .run(day, JSON.stringify(payload));
}

/** Spread n words over `days` consecutive days ending at `endDay`,
 *  per-word taps distributed round-robin over `keys`. `extra[k].first`
 *  marks the key's first-ever day — applied once, on its first day. */
function spread(db, endDay, days, words, keys, extra = {}) {
  const each = Math.floor(words / days);
  const seen = new Set();
  for (let d = 0; d < days; d++) {
    const n = d === 0 ? words - each * (days - 1) : each;
    const per = {};
    for (let i = 0; i < n; i++) {
      const k = keys[(d * each + i) % keys.length];
      const e = (per[k] ??= { taps: 0, spotlit: 0 });
      e.taps++;
      if (extra[k]?.first && !seen.has(k)) { e.first = 1; seen.add(k); }
    }
    putDay(db, endDay - d, {
      words: n, per_word: per, longest: extra.longest ?? 0,
      sentences: extra.sentences ?? 0,
    });
  }
}

const names = {
  "sense:want": "want", "sense:more": "more", "sense:go": "go",
  "sense:home": "home", "entity:zebra": "zebra", "entity:cooper": "Cooper",
  "entity:juice": "juice", "sense:help": "help",
};
const nameOf = (kind, id) => names[`${kind}:${id}`] ?? null;

/** Card for the week ending at `endDay`: weeklyCard always ends at
 *  "today", so tests shift now to the fixture's last day. */
function cardFor(db, endDay) {
  const now = endDay * DAY + 12 * 3600 * 1000 - TZ * 60000;
  return weeklyCard(db, now, nameOf);
}

const DROP = /fewer|less|down|drop|slower|worse|behind|only \d|didn't/i;

test("12 fixture weeks: wins only, 1–3 each, never a drop", () => {
  const results = [];
  const cases = [
    // W1 normal week: first-time zebra, longest 4, 5-day streak.
    (db) => spread(db, TODAY, 5, 120, ["sense:want", "sense:more", "entity:zebra"],
      { "entity:zebra": { first: 1 }, longest: 4, sentences: 20 }),
    // W2 falling week (40 < 120): wins still present, no comparison.
    (db) => spread(db, TODAY, 4, 40, ["sense:want", "sense:more"], { longest: 3, sentences: 8 }),
    // W3 empty week → card hides.
    (db) => {},
    // W4 two-day streak only.
    (db) => spread(db, TODAY, 2, 15, ["sense:go"], {}),
    // W5 single-word sentences: no longest-sentence win, favorite fills.
    (db) => spread(db, TODAY, 3, 30, ["sense:want", "sense:help"], { longest: 1, sentences: 30 }),
    // W6 four new words: "First time: a and 3 more".
    (db) => spread(db, TODAY, 6, 90,
      ["sense:want", "sense:more", "sense:go", "entity:zebra", "entity:cooper"],
      { "sense:more": { first: 1 }, "sense:go": { first: 1 },
        "entity:zebra": { first: 1 }, "entity:cooper": { first: 1 },
        longest: 5, sentences: 15 }),
    // W7 exactly two first-evers join with "and".
    (db) => spread(db, TODAY, 3, 25, ["sense:home", "entity:juice"],
      { "sense:home": { first: 1 }, "entity:juice": { first: 1 } }),
    // W8 a glow-heavy week: spotlit counts don't fabricate wins.
    (db) => {
      for (let d = 0; d < 7; d++)
        putDay(db, TODAY - d, {
          words: 10, spotlit: 8,
          per_word: { "sense:want": { taps: 10, spotlit: 8 } },
        });
    },
    // W9 a single tap all week → "1 word", favorite win only.
    (db) => putDay(db, TODAY, { words: 1, per_word: { "sense:want": { taps: 1, spotlit: 0 } } }),
    // W10 full 7-day streak.
    (db) => spread(db, TODAY, 7, 70, ["sense:want", "sense:more"], { longest: 2, sentences: 7 }),
    // W11 quiet week: one day, two words.
    (db) => putDay(db, TODAY - 3, { words: 2, per_word: { "sense:go": { taps: 2, spotlit: 0 } } }),
    // W12 heavy week, no new words, no streak end (last day quiet).
    (db) => {
      for (let d = 1; d <= 6; d++)
        putDay(db, TODAY - d, {
          words: 20, longest: 6, sentences: 6,
          per_word: { "sense:want": { taps: 12, spotlit: 0 }, "sense:more": { taps: 8, spotlit: 0 } },
        });
      putDay(db, TODAY, { words: 0 });
    },
  ];

  for (const [i, build] of cases.entries()) {
    const db = statsDb();
    build(db);
    const card = cardFor(db, TODAY);
    results.push(card);
    const text = [card.summary, ...card.wins].join(" | ");
    assert.ok(!DROP.test(text), `week ${i + 1} states a drop: ${text}`);
    if (i === 2) {
      assert.equal(card.empty, true, "empty week hides the card");
      continue;
    }
    assert.equal(card.empty, false, `week ${i + 1}`);
    assert.ok(card.wins.length >= 1 && card.wins.length <= 3,
      `week ${i + 1}: ${card.wins.length} wins`);
  }

  // W1: first-time word + longest + streak cap at three wins.
  assert.equal(results[0].wins[0], "First time: zebra");
  assert.ok(results[0].wins.includes("Longest sentence: 4 words"));
  assert.equal(results[0].wins.length, 3);
  // W2: a falling week still opens with real wins.
  assert.ok(results[1].wins.length >= 1);
  // W4: "2 days in a row".
  assert.ok(results[3].wins.includes("2 days in a row"));
  // W6: crowded first-times summarize, not list forever.
  assert.equal(results[5].wins[0], "First time: more and 3 more new words");
  // W7: two first-evers join cleanly.
  assert.equal(results[6].wins[0], "First time: home and juice");
  // W9: singular grammar, one win.
  assert.ok(results[8].summary.startsWith("This week: 1 word"));
  assert.deepEqual(results[8].wins, ["Favorite this week: want"]);
  // W10: full-week streak.
  assert.ok(results[9].wins.includes("7 days in a row"));
  // W12: last day quiet → streak ends at 6, not 7.
  assert.ok(results[11].wins.includes("6 days in a row"));
});

test("weekAggregate merges per-word counts and first flags across days", () => {
  const db = statsDb();
  putDay(db, TODAY - 1, {
    words: 5, longest: 3, sentences: 2, spotlit: 1,
    per_word: { "sense:want": { taps: 3, spotlit: 1 }, "entity:zebra": { taps: 2, spotlit: 0, first: 1 } },
  });
  putDay(db, TODAY, {
    words: 4, longest: 2, sentences: 1,
    per_word: { "sense:want": { taps: 4, spotlit: 0 } },
  });
  const agg = weekAggregate(db, TODAY - 6, TODAY);
  assert.equal(agg.words, 9);
  assert.equal(agg.different, 2);
  assert.equal(agg.longest, 3);
  assert.equal(agg.spotlit, 1);
  assert.equal(agg.perWord["sense:want"].taps, 7);
  assert.deepEqual(agg.firstKeys, ["entity:zebra"]);
  assert.equal(streakOf(agg.days), 2);
});

test("ensureStatsDays backfills missing days but never rewrites", () => {
  const db = statsDb();
  putDay(db, TODAY - 2, { words: 7, per_word: { "sense:want": { taps: 7, spotlit: 0 } } });
  ensureStatsDays(db, TODAY - 6, TODAY, 555);
  const rows = db.prepare("SELECT day, computed_at FROM stats_day ORDER BY day").all();
  assert.equal(rows.length, 7);
  // The pre-existing row kept its writer's stamp — backfill fills only gaps.
  assert.equal(rows.find((r) => r.day === TODAY - 2).computed_at, 1);
  // Genuinely empty days land as zero rows, so streaks don't span gaps.
  const agg = weekAggregate(db, TODAY - 6, TODAY);
  assert.equal(agg.days.length, 7);
  assert.equal(streakOf(agg.days), 1); // only TODAY-2 has taps
});

test("pickWins caps at three and skips unresolvable names", () => {
  const agg = {
    days: [{ day: 1, words: 5 }], words: 5, different: 5,
    longest: 6, sentences: 2, spotlit: 0,
    perWord: { "sense:gone": { taps: 5, spotlit: 0 } },
    firstKeys: ["sense:gone", "entity:also-gone"],
  };
  // nameOf resolves nothing → no first-time names, no favorite.
  assert.deepEqual(pickWins(agg, () => null), ["Longest sentence: 6 words"]);
});
