/**
 * 017 step 28 Works Test — passive timings (items 1–2).
 *
 * A scripted session with known pick times is written into a database
 * holding ONLY the three tables the report may read: learner_event_log,
 * sentence, strip_impression. Every expected number below is computed
 * by hand in this file — the test asserts against arithmetic the code
 * cannot influence.
 *
 * Fixture (times in seconds from t0; cleared sentences' picks count —
 * the pause happened whether or not the bar was later spoken):
 *
 *   s1 spoken: want(grid)@0 → juice(grid)@10 → milk(strip)@30 → Speak@40
 *     wpm 3/(40s) = 4.5 ; gaps grid 10s, strip 20s
 *   s2 spoken: go(group)@100 → home(grid)@130 → Speak@140
 *     wpm 2/(40s) = 3.0 ; gap grid 30s
 *   s3 spoken: i(grid)@200 → cookie(keyboard)@205 → done(group)@225 → Speak@230
 *     wpm 3/(30s) = 6.0 ; gaps keyboard 5s, group 20s
 *   s4 cleared: a(grid)@300 → b(strip)@308 → Clear@310
 *     gap strip 8s
 *   s5 spoken: eat(grid)@400 → [cookie2@405 detached] → drink(grid)@420 → Speak@425
 *     wpm 2/(25s) = 4.8 ; gap grid 20s (spans the removal — the pause is real)
 *   lone tap keyboard@500 — no sentence, never a gap
 *
 * Hand-computed:
 *   grid gaps  [10,20,30]s → q1 15s, median 20s, q3 25s, n 3
 *   strip gaps [8,20]s    → q1 11s, median 14s, q3 17s, n 2
 *   keyboard   [5]s       → all 5s, n 1
 *   group      [20]s      → all 20s, n 1
 *   wpm        [3.0,4.5,4.8,6.0] → q1 4.125, median 4.65, q3 5.1, n 4
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { pathTimes, wpmStats } from "../../public/shared/stats.mjs";
import { predictionReport } from "../../public/shared/funnel.mjs";

const SCHEMA = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "schema.sql"), "utf8",
);

function speedOnlyDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = OFF");
  for (const t of ["learner_event_log", "sentence", "strip_impression"]) {
    const ddl = SCHEMA.match(
      new RegExp(`CREATE TABLE IF NOT EXISTS ${t} \\([^;]+\\);`))?.[0];
    assert.ok(ddl, `schema for ${t}`);
    db.exec(ddl);
  }
  return db;
}

const T0 = Date.parse("2026-09-24T09:00:00Z");
const S = 1000;

function fixture() {
  const db = speedOnlyDb();
  const say = (kind, id, s, { sid = null, pos = null, src = "grid" } = {}) =>
    db.prepare(
      `INSERT INTO learner_event_log
         (item_kind, item_id, selected_at, sentence_id, position, source, tz_offset_min)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
    ).run(kind, id, T0 + s * S, sid, pos, src);
  const bar = (start, end, kind) => {
    db.prepare(
      "INSERT INTO sentence (started_at, ended_at, end_kind, tz_offset_min) VALUES (?, ?, ?, 0)",
    ).run(T0 + start * S, T0 + end * S, kind);
    return db.prepare("SELECT last_insert_rowid() AS id").all()[0].id;
  };

  const s1 = bar(0, 40, "spoken");
  say("sense", "want", 0, { sid: s1, pos: 0 });
  say("sense", "juice", 10, { sid: s1, pos: 1 });
  say("sense", "milk", 30, { sid: s1, pos: 2, src: "strip" });

  const s2 = bar(100, 140, "spoken");
  say("sense", "go", 100, { sid: s2, pos: 0, src: "group" });
  say("sense", "home", 130, { sid: s2, pos: 1 });

  const s3 = bar(200, 230, "spoken");
  say("sense", "i", 200, { sid: s3, pos: 0 });
  say("entity", "cookie", 205, { sid: s3, pos: 1, src: "keyboard" });
  say("sense", "done", 225, { sid: s3, pos: 2, src: "group" });

  const s4 = bar(300, 310, "cleared");
  say("sense", "a", 300, { sid: s4, pos: 0 });
  say("sense", "b", 308, { sid: s4, pos: 1, src: "strip" });

  const s5 = bar(400, 425, "spoken");
  say("sense", "eat", 400, { sid: s5, pos: 0 });
  say("entity", "cookie2", 405); // detached by backspace — keeps usage, loses the seat
  say("sense", "drink", 420, { sid: s5, pos: 1 });

  say("entity", "zebra", 500, { src: "keyboard" }); // no sentence — never a gap
  return db;
}

const PATHS = {
  grid: { q1: 15000, median: 20000, q3: 25000, n: 3 },
  strip: { q1: 11000, median: 14000, q3: 17000, n: 2 },
  keyboard: { q1: 5000, median: 5000, q3: 5000, n: 1 },
  group: { q1: 20000, median: 20000, q3: 20000, n: 1 },
};
const WPM = { q1: 4.125, median: 4.65, q3: 5.1, n: 4 };

test("pathTimes: every per-path number equals the hand-computed value", () => {
  const db = fixture();
  assert.deepEqual(pathTimes(db, { from: 0, to: T0 + 600 * S }), PATHS);
});

test("wpmStats: median and quartiles equal the hand-computed values", () => {
  const db = fixture();
  const spoken = db.prepare(
    `SELECT s.id, s.started_at, s.ended_at,
            (SELECT COUNT(*) FROM learner_event_log e WHERE e.sentence_id = s.id) AS words
     FROM sentence s WHERE s.end_kind = 'spoken'`,
  ).all();
  const w = wpmStats(spoken);
  assert.ok(Math.abs(w.wpm_median - WPM.median) < 1e-9, `median ${w.wpm_median}`);
  assert.ok(Math.abs(w.wpm_q1 - WPM.q1) < 1e-9, `q1 ${w.wpm_q1}`);
  assert.ok(Math.abs(w.wpm_q3 - WPM.q3) < 1e-9, `q3 ${w.wpm_q3}`);
  assert.equal(w.wpm_samples, WPM.n);
});

test("predictionReport carries the same speed numbers under its window", () => {
  const db = fixture();
  const rep = predictionReport(db, { from: 0, to: T0 + 600 * S });
  assert.deepEqual(rep.speed.paths, PATHS);
  assert.deepEqual(
    { q1: rep.speed.wpm.q1, median: rep.speed.wpm.median, q3: rep.speed.wpm.q3, n: rep.speed.wpm.n },
    WPM,
  );

  // The window is real: [90s, 250s) keeps s2+s3's spoken bars and the
  // picks inside them — s1, s4, s5 and the lone tap fall outside.
  const win = predictionReport(db, { from: T0 + 90 * S, to: T0 + 250 * S });
  assert.deepEqual(win.speed.paths, {
    grid: { q1: 30000, median: 30000, q3: 30000, n: 1 },
    keyboard: { q1: 5000, median: 5000, q3: 5000, n: 1 },
    group: { q1: 20000, median: 20000, q3: 20000, n: 1 },
  });
  assert.equal(win.speed.wpm.n, 2); // s2 (3.0) + s3 (6.0) → median 4.5
  assert.equal(win.speed.wpm.median, 4.5);
});
