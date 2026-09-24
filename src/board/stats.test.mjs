/**
 * 016 slice 1 Works Test — the stats engine.
 *
 * A scripted fixture of taps and sentences over three local days —
 * including a cleared sentence, a backspace (detached pick), Smart bar
 * picks, a glow window, and a single-word sentence — is written into a
 * database holding ONLY the tables the module may read:
 * learner_event_log, sentence, core_cell, stats_day. If stats.mjs
 * queries anything else, the test fails at SQLite — the module cannot
 * grade its own homework. Every expected value below is computed by
 * hand in this file, not by the module.
 *
 * Fixture (tz offset T = the machine's offset; local hours are literal):
 *
 *   Day B-2 ("older"):
 *     s1 spoken 3 words: want(grid,core)@9:00:00 juice(grid,fringe)@9:00:20
 *                        milk(grid,fringe)@9:00:40 → Speak @9:00:50
 *     s2 cleared: go(grid,core)@10:00:00 more(strip,core,SPOTLIT)@10:00:10
 *                 → Clear @10:00:15
 *     s3 spoken 2 members: eat(grid,fringe)@11:00:00, cookie(entity)@11:00:05
 *                          detached by backspace, drink(grid,fringe)@11:00:20
 *                          → Speak @11:00:25  (cookie still counts as a tap)
 *   Day B-1 ("yesterday"):
 *     want@8:00, want@8:05 (grid), cooper(entity,group)@15:00
 *   Day B ("today"):
 *     s5 spoken 3 words: want@17:00:00 cookie(strip)@17:00:15 more@17:00:30
 *                        → Speak @17:00:45   (wpm 4.0)
 *     s6 spoken 2 words: go(group)@18:00:00 home(grid,fringe)@18:00:20
 *                        → Speak @18:00:30   (wpm 4.0)
 *     zebra(entity,keyboard,SPOTLIT)@19:00 — no sentence, first-ever tap
 *     home is also first-ever today → new = 2
 *   Travel row: want@(B)23:30 UTC with stored offset T+60 → local day B+1,
 *     so it belongs to no computed day here and proves per-event bucketing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  dailyTotals, dayIndex, newItemsOnDay, refreshStatsDays, sentencesOnDay,
  tapsOnDay, upsertStatsDay,
} from "../../public/shared/stats.mjs";
import { logSelection } from "../../public/shared/funnel.mjs";

const SCHEMA = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "schema.sql"), "utf8",
);
const TZ = -new Date().getTimezoneOffset(); // fixture rows carry the machine offset
const DAY = 86_400_000;
const B = Math.floor(Date.now() / DAY); // "today" under tz 0 arithmetic below

/** Only the tables stats.mjs may read — plus sync_op, which the writer
 *  records into (write-only; the module never reads it). */
function statsOnlyDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = OFF"); // core_cell's sense ref is absent by design
  for (const t of ["learner_event_log", "sentence", "core_cell", "stats_day", "sync_op"]) {
    const ddl = SCHEMA.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${t} \\([^;]+\\);`))?.[0];
    assert.ok(ddl, `schema for ${t}`);
    db.exec(ddl);
  }
  return db;
}

/** Local wall-time on `day` at h:m:s under the fixture offset. */
const at = (day, h, m = 0, s = 0) => day * DAY + (h * 3600 + m * 60 + s) * 1000 - TZ * 60000;

function tap(db, kind, id, ts, { src = "grid", spot = 0, sid = null, pos = null, tz = TZ } = {}) {
  db.prepare(
    `INSERT INTO learner_event_log
       (item_kind, item_id, selected_at, sentence_id, position, source, tz_offset_min, spotlit)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(kind, id, ts, sid, pos, src, tz, spot);
  return db.prepare("SELECT last_insert_rowid() AS id").all()[0].id;
}

function sentence(db, startedAt, endedAt, kind) {
  db.prepare(
    "INSERT INTO sentence (started_at, ended_at, end_kind, tz_offset_min) VALUES (?, ?, ?, ?)",
  ).run(startedAt, endedAt, kind, TZ);
  return db.prepare("SELECT last_insert_rowid() AS id").all()[0].id;
}

/** The three-day fixture. Returns the db and the day indices. */
function fixture() {
  const db = statsOnlyDb();
  [["cel_w", "want"], ["cel_g", "go"], ["cel_m", "more"]].forEach(([id, sense], slot) =>
    db.prepare("INSERT INTO core_cell (id, layout, sense_id, slot_index) VALUES (?, 'default', ?, ?)")
      .run(id, sense, slot));

  const d0 = B - 2, d1 = B - 1, d2 = B;

  const s1 = sentence(db, at(d0, 9), at(d0, 9, 0, 50), "spoken");
  tap(db, "sense", "want", at(d0, 9, 0, 0), { sid: s1, pos: 0 });
  tap(db, "sense", "juice", at(d0, 9, 0, 20), { sid: s1, pos: 1 });
  tap(db, "sense", "milk", at(d0, 9, 0, 40), { sid: s1, pos: 2 });

  const s2 = sentence(db, at(d0, 10), at(d0, 10, 0, 15), "cleared");
  tap(db, "sense", "go", at(d0, 10, 0, 0), { sid: s2, pos: 0 });
  tap(db, "sense", "more", at(d0, 10, 0, 10), { sid: s2, pos: 1, src: "strip", spot: 1 });

  const s3 = sentence(db, at(d0, 11), at(d0, 11, 0, 25), "spoken");
  tap(db, "sense", "eat", at(d0, 11, 0, 0), { sid: s3, pos: 0 });
  // Backspace: cookie's event stays as usage, loses its sentence seat.
  tap(db, "entity", "cookie", at(d0, 11, 0, 5), { sid: null, pos: null });
  tap(db, "sense", "drink", at(d0, 11, 0, 20), { sid: s3, pos: 1 });

  tap(db, "sense", "want", at(d1, 8, 0));
  tap(db, "sense", "want", at(d1, 8, 5));
  tap(db, "entity", "cooper", at(d1, 15, 0), { src: "group" });

  const s5 = sentence(db, at(d2, 17), at(d2, 17, 0, 45), "spoken");
  tap(db, "sense", "want", at(d2, 17, 0, 0), { sid: s5, pos: 0 });
  tap(db, "entity", "cookie", at(d2, 17, 0, 15), { sid: s5, pos: 1, src: "strip" });
  tap(db, "sense", "more", at(d2, 17, 0, 30), { sid: s5, pos: 2 });

  const s6 = sentence(db, at(d2, 18), at(d2, 18, 0, 30), "spoken");
  tap(db, "sense", "go", at(d2, 18, 0, 0), { sid: s6, pos: 0, src: "group" });
  tap(db, "sense", "home", at(d2, 18, 0, 20), { sid: s6, pos: 1 });

  tap(db, "entity", "zebra", at(d2, 19, 0), { src: "keyboard", spot: 1 });

  // Travel: UTC 23:30 on d2, stored offset T+60 → local day d2+1.
  tap(db, "sense", "want", at(d2, 23, 30), { tz: TZ + 60 });

  return { db, d0, d1, d2 };
}

test("tapsOnDay buckets by each event's own offset", () => {
  const { db, d0, d2 } = fixture();
  assert.equal(tapsOnDay(db, d0).length, 8);
  // The travel tap (local day d2+1) appears on neither d0 nor d2.
  assert.equal(tapsOnDay(db, d2).length, 6);
  assert.equal(tapsOnDay(db, d2 + 1).length, 1);
  assert.equal(tapsOnDay(db, d2 + 1)[0].id, "want");
});

test("sentencesOnDay returns spoken and cleared bars with member counts", () => {
  const { db, d0 } = fixture();
  const rows = sentencesOnDay(db, d0);
  assert.equal(rows.length, 3);
  const spoken = rows.filter((r) => r.end_kind === "spoken");
  assert.deepEqual(spoken.map((s) => s.words).sort(), [2, 3]); // backspace excluded cookie
  assert.equal(rows.filter((r) => r.end_kind === "cleared")[0].words, 2);
});

test("dailyTotals: every number equals the hand-computed value", () => {
  const { db, d0, d1, d2 } = fixture();

  const r0 = dailyTotals(db, d0, 999);
  assert.deepEqual(
    { ...r0, computed_at: 0, per_word: 0, hours: 0, lengths: 0, sources: 0, wpm_median: 0 },
    {
      day: d0, computed_at: 0, words: 8, different: 8, new: 8,
      sentences: 2, words_per_sentence: 2.5, longest_sentence: 3,
      wpm_median: 0, wpm_samples: 2,
      core: 3, fringe: 4, own: 1, spotlit: 1,
      sources: 0, hours: 0, lengths: 0, per_word: 0,
    },
  );
  // wpm: s1 3 words / 50 s = 3.6, s3 2 / 25 s = 4.8 → median 4.2
  assert.ok(Math.abs(r0.wpm_median - 4.2) < 1e-9, `wpm ${r0.wpm_median}`);
  assert.deepEqual(r0.sources, { grid: 7, strip: 1, group: 0, keyboard: 0 });
  assert.deepEqual(r0.lengths, { 2: 1, 3: 1 });
  assert.equal(r0.hours[9], 3); assert.equal(r0.hours[10], 2);
  assert.equal(r0.hours[11], 3);
  assert.equal(r0.hours.reduce((a, b) => a + b), 8);
  assert.equal(r0.per_word["sense:more"].spotlit, 1);
  assert.equal(r0.per_word["sense:want"].taps, 1);

  const r1 = dailyTotals(db, d1, 999);
  assert.equal(r1.words, 3); assert.equal(r1.different, 2);
  assert.equal(r1.new, 1); // cooper's first-ever tap
  assert.equal(r1.sentences, 0); assert.equal(r1.words_per_sentence, null);
  assert.equal(r1.wpm_median, null); assert.equal(r1.wpm_samples, 0);
  assert.equal(r1.core, 2); assert.equal(r1.own, 1); assert.equal(r1.fringe, 0);
  assert.equal(r1.hours[8], 2); assert.equal(r1.hours[15], 1);

  const r2 = dailyTotals(db, d2, 999);
  assert.equal(r2.words, 6); assert.equal(r2.different, 6);
  assert.equal(r2.new, 2); // home and zebra, first-ever today
  assert.equal(r2.sentences, 2); assert.equal(r2.words_per_sentence, 2.5);
  assert.equal(r2.longest_sentence, 3);
  assert.ok(Math.abs(r2.wpm_median - 4.0) < 1e-9, `wpm ${r2.wpm_median}`);
  assert.equal(r2.wpm_samples, 2);
  assert.equal(r2.core, 3); assert.equal(r2.fringe, 1); assert.equal(r2.own, 2);
  assert.equal(r2.spotlit, 1);
  assert.deepEqual(r2.sources, { grid: 3, strip: 1, group: 1, keyboard: 1 });
  assert.deepEqual(r2.lengths, { 2: 1, 3: 1 });
  assert.equal(r2.hours[17], 3); assert.equal(r2.hours[18], 2); assert.equal(r2.hours[19], 1);
  assert.equal(r2.per_word["entity:zebra"].spotlit, 1);

  // The local day index matches the module's own definition of a day.
  assert.equal(dayIndex(at(d2, 12), TZ), d2);
});

test("newItemsOnDay sees first-ever taps only", () => {
  const { db, d0, d2 } = fixture();
  assert.equal(newItemsOnDay(db, d0).length, 8);
  assert.deepEqual(newItemsOnDay(db, d2).sort(), ["entity:zebra", "sense:home"]);
});

test("upsertStatsDay persists one row; refresh rewrites only today+yesterday", () => {
  const { db, d0, d1, d2 } = fixture();
  upsertStatsDay(db, d0, 111);
  upsertStatsDay(db, d0, 222); // replace, not duplicate
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM stats_day").all()[0].n, 1);
  // An unchanged recompute records no second op — quiet days stay quiet.
  const opsAfterFirst = db.prepare(
    "SELECT COUNT(*) AS n FROM sync_op WHERE kind = 'put_stats_day'").all()[0].n;
  upsertStatsDay(db, d0, 333);
  assert.equal(db.prepare(
    "SELECT COUNT(*) AS n FROM sync_op WHERE kind = 'put_stats_day'").all()[0].n,
    opsAfterFirst);
  const row = db.prepare("SELECT payload FROM stats_day WHERE day = ?").all(d0)[0];
  assert.equal(JSON.parse(row.payload).words, 8);

  // now = local noon on d2 → today d2, yesterday d1 only; d0 stays.
  const now = d2 * DAY + 12 * 3600 * 1000 - TZ * 60000;
  refreshStatsDays(db, now);
  const days = db.prepare("SELECT day FROM stats_day ORDER BY day").all().map((r) => r.day);
  assert.deepEqual(days, [d0, d1, d2]);
});

test("logSelection writes the spotlit flag", () => {
  const db = statsOnlyDb();
  logSelection(db, "sense", "want", Date.now(), { source: "grid", spotlit: true });
  logSelection(db, "sense", "go", Date.now(), { source: "grid" });
  const rows = db.prepare("SELECT item_id, spotlit FROM learner_event_log ORDER BY id").all()
    .map((r) => ({ ...r }));
  assert.deepEqual(rows, [{ item_id: "want", spotlit: 1 }, { item_id: "go", spotlit: 0 }]);
});
