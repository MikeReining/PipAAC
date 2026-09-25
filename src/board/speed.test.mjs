/**
 * 017 step 28 Works Test — passive timings (items 1–2, 4). The
 * Jev-timing natural experiment (item 3) left with the JEV path:
 * no rerank can arrive late when nothing reranks.
 *
 * A scripted session with known pick times is written into a database
 * holding ONLY the three tables the report may read: learner_event_log,
 * sentence, strip_impression. Every expected number below is computed
 * by hand in this file — the test asserts against arithmetic the code
 * cannot influence.
 *
 * Fixture (times in seconds from T0; cleared sentences' picks count —
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
 * Hand-computed (items 1–2):
 *   grid gaps  [10,20,30]s → q1 15s, median 20s, q3 25s, n 3
 *   strip gaps [8,20]s    → q1 11s, median 14s, q3 17s, n 2
 *   keyboard   [5]s       → all 5s, n 1
 *   group      [20]s      → all 20s, n 1
 *   wpm        [3.0,4.5,4.8,6.0] → q1 4.125, median 4.65, q3 5.1, n 4
 *
 * Wrong picks (item 4): strip@700 detached@705 counts; strip@710
 * detached@725 (15s) and a grid removal do not → wrongPicks = 1.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { pathTimes, wpmStats, wrongPicks } from "../../public/shared/stats.mjs";
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

const say = (db, kind, id, s, { sid = null, pos = null, src = "grid" } = {}) =>
  db.prepare(
    `INSERT INTO learner_event_log
       (item_kind, item_id, selected_at, sentence_id, position, source, tz_offset_min)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
  ).run(kind, id, T0 + s * S, sid, pos, src);

const bar = (db, start, end, kind) => {
  db.prepare(
    "INSERT INTO sentence (started_at, ended_at, end_kind, tz_offset_min) VALUES (?, ?, ?, 0)",
  ).run(T0 + start * S, T0 + end * S, kind);
  return db.prepare("SELECT last_insert_rowid() AS id").all()[0].id;
};

/** A v2 strip moment: the ranked rows and the keys the gate painted,
 *  chosen_* filled by the next pick. `cands` carries {kind,id,her,kid}
 *  so replayImpression can recompute the gate. */
const imp = (db, sid, pos, { local, cands = null, final = null, chosen, cap = 4, at = 0 }) =>
  db.prepare(
    `INSERT INTO strip_impression
       (sentence_id, position, shown_at, candidates, shown_local, shown_final,
        weight_set, shortlist_cap, chosen_kind, chosen_id, chosen_source)
     VALUES (?, ?, ?, ?, ?, ?, 'phrase_history', ?, ?, ?, 'strip')`,
  ).run(sid, pos, T0 + at * S,
    JSON.stringify(cands ?? local.map((k) => {
      const [kind, id] = k.split(":");
      return { kind, id, src: "kids", her: 0, kid: { share: 0.5, total: 100 } };
    })),
    JSON.stringify(local),
    final ? JSON.stringify(final) : null,
    cap, chosen.split(":")[0] === "entity" ? "entity" : "sense",
    chosen.split(":").pop());

const detach = (db, kind, id, s, src, ds) =>
  db.prepare(
    `INSERT INTO learner_event_log
       (item_kind, item_id, selected_at, sentence_id, position, source, tz_offset_min, detached_at)
     VALUES (?, ?, ?, NULL, NULL, ?, 0, ?)`,
  ).run(kind, id, T0 + s * S, src, T0 + ds * S);

function fixture() {
  const db = speedOnlyDb();

  const s1 = bar(db, 0, 40, "spoken");
  say(db, "sense", "want", 0, { sid: s1, pos: 0 });
  say(db, "sense", "juice", 10, { sid: s1, pos: 1 });
  say(db, "sense", "milk", 30, { sid: s1, pos: 2, src: "strip" });

  const s2 = bar(db, 100, 140, "spoken");
  say(db, "sense", "go", 100, { sid: s2, pos: 0, src: "group" });
  say(db, "sense", "home", 130, { sid: s2, pos: 1 });

  const s3 = bar(db, 200, 230, "spoken");
  say(db, "sense", "i", 200, { sid: s3, pos: 0 });
  say(db, "entity", "cookie", 205, { sid: s3, pos: 1, src: "keyboard" });
  say(db, "sense", "done", 225, { sid: s3, pos: 2, src: "group" });

  const s4 = bar(db, 300, 310, "cleared");
  say(db, "sense", "a", 300, { sid: s4, pos: 0 });
  say(db, "sense", "b", 308, { sid: s4, pos: 1, src: "strip" });

  const s5 = bar(db, 400, 425, "spoken");
  say(db, "sense", "eat", 400, { sid: s5, pos: 0 });
  say(db, "entity", "cookie2", 405); // detached by backspace — keeps usage, loses the seat
  say(db, "sense", "drink", 420, { sid: s5, pos: 1 });

  say(db, "entity", "zebra", 500, { src: "keyboard" }); // no sentence — never a gap

  // Strip moments at each pick: shown_local holds what was painted and
  // chosen_* the pick that followed — predictionReport reads these.
  imp(db, s1, 1, { local: ["sense:juice"], chosen: "sense:juice", at: 10 });
  imp(db, s1, 2, { local: ["sense:milk"], chosen: "sense:milk", at: 30 });
  imp(db, s2, 1, { local: ["sense:x"], chosen: "sense:home", at: 130 });
  imp(db, s3, 1, { local: ["entity:cookie"], chosen: "entity:cookie", at: 205 });
  imp(db, s3, 2, { local: ["sense:i"], chosen: "sense:done", at: 225 });
  imp(db, s5, 1, { local: ["sense:drink"], chosen: "sense:drink", at: 420 });

  // Item 4: a strip pick backspaced within a few seconds is a wrong
  // pick; a 15s removal and a grid removal are not.
  detach(db, "sense", "oops", 700, "strip", 705);
  detach(db, "sense", "meh", 710, "strip", 725);
  detach(db, "sense", "grid_miss", 720, "grid", 723);
  return db;
}

const PATHS = {
  grid: { q1: 15000, median: 20000, q3: 25000, n: 3 },
  strip: { q1: 11000, median: 14000, q3: 17000, n: 2 },
  keyboard: { q1: 5000, median: 5000, q3: 5000, n: 1 },
  group: { q1: 20000, median: 20000, q3: 20000, n: 1 },
};
const WPM = { q1: 4.125, median: 4.65, q3: 5.1, n: 4 };
const WIDE = { from: 0, to: T0 + 800 * S }; // covers the detach rows at 700s+

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

test("wrongPicks: only a fast strip-pick removal counts", () => {
  const db = fixture();
  assert.equal(wrongPicks(db, WIDE), 1);
  assert.equal(wrongPicks(db, { from: 0, to: T0 + 600 * S }), 0); // detaches start at 700s
});

test("predictionReport carries the same speed numbers under its window", () => {
  const db = fixture();
  const rep = predictionReport(db, WIDE);
  assert.deepEqual(rep.speed.paths, {
    ...PATHS,
  });
  assert.deepEqual(rep.speed.wpm, WPM);
  assert.equal(rep.wrongPicks, 1);

  // Pick-side numbers: 6 moments got a next pick; the chosen key was
  // shown in 4 of 6 (s1 juice+milk, s3 cookie, s5 drink — s2 home and
  // s3 done were painted something else).
  assert.equal(rep.picks, 6);
  assert.ok(Math.abs(rep.hitRate - 4 / 6) < 1e-9, `hitRate ${rep.hitRate}`);
  assert.ok(Math.abs(rep.shortlistRecall - 4 / 6) < 1e-9);
  assert.ok(Math.abs(rep.falseShowRate - 2 / 6) < 1e-9);
  assert.equal(rep.stripShare, 1); // every fixture pick came from the strip

  // The window is real: [90s, 250s) keeps s2+s3's spoken bars and the
  // picks inside them — s1, s4, s5 and the lone tap fall outside.
  const win = predictionReport(db, { from: T0 + 90 * S, to: T0 + 250 * S });
  assert.deepEqual(win.speed.paths, {
    keyboard: { q1: 5000, median: 5000, q3: 5000, n: 1 },
    group: { q1: 20000, median: 20000, q3: 20000, n: 1 },
    grid: { q1: 30000, median: 30000, q3: 30000, n: 1 },
  });
  assert.equal(win.speed.wpm.n, 2); // s2 (3.0) + s3 (6.0) → median 4.5
  assert.equal(win.speed.wpm.median, 4.5);
});
