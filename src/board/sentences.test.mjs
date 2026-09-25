/**
 * 006 slice 1 Works Test — local time and sentences.
 *
 * 1. The time-of-day term uses the child's local hour: a fringe noun
 *    picked at 08:20 local on three earlier days outranks one picked at
 *    13:20 local, at 08:20 today — in every timezone the family lives in.
 *    (Fails on the pre-slice code: strftime buckets events in UTC.)
 * 2. Speak ends the sentence: picks after it open a new one — no pair
 *    juice → go exists when pairs are read by sentence_id.
 * 3. Clear closes the sentence as 'cleared'.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import {
  closeSentence,
  logSelection,
  openSentence,
  stripRanked,
} from "../../public/shared/funnel.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const mapRaw = readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8");
const catalog = buildCatalog(lexicon, parseCoordinateMapMarkdown(mapRaw));

const openDb = () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
};

const DAY = 24 * 3600 * 1000;
/** Local wall time → ms, under whatever TZ the process is in. */
const localTime = (daysAgo, hour, min = 20) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, min, 0, 0);
  return d.getTime();
};

test.after?.(() => {}); // placeholder for node:test API variance
after(() => { process.env.TZ = "UTC"; });

test("the 90-minute window is the child's local time of day in every timezone", () => {
  for (const tz of ["UTC", "America/Chicago", "Europe/Berlin"]) {
    process.env.TZ = tz;
    const db = openDb();
    // Two real fringe nouns from the catalog — the fixture reads the data,
    // never the English text of a specific word.
    const [morning, afternoon] = db
      .prepare(
        `SELECT s.id FROM sense s
         JOIN label l ON l.sense_id = s.id
           AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = 'en'
         WHERE s.tier = 'primary_fringe' AND l.part_of_speech = 'Noun'
         ORDER BY s.id LIMIT 2`,
      )
      .all();
    assert.ok(morning && afternoon, "fixture needs two fringe nouns");
    const want = db
      .prepare(
        `SELECT s.id FROM sense s
         JOIN label l ON l.sense_id = s.id
           AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = 'en'
         WHERE l.text = 'want'`,
      )
      .all()[0];
    for (let d = 1; d <= 3; d++) {
      // 'want morning' at 08:20 each day, 'want afternoon' at 13:20.
      let s = openSentence(db, localTime(d, 8));
      logSelection(db, "sense", want.id, localTime(d, 8), { sentenceId: s, position: 0 });
      logSelection(db, "sense", morning.id, localTime(d, 8, 21), { sentenceId: s, position: 1 });
      closeSentence(db, s, localTime(d, 8, 22), "spoken");
      s = openSentence(db, localTime(d, 13));
      logSelection(db, "sense", want.id, localTime(d, 13), { sentenceId: s, position: 0 });
      logSelection(db, "sense", afternoon.id, localTime(d, 13, 21), { sentenceId: s, position: 1 });
      closeSentence(db, s, localTime(d, 13, 22), "spoken");
    }
    const { ranked } = stripRanked(
      db, [{ kind: "sense", id: want.id }], localTime(0, 8), "en",
    );
    const mi = ranked.findIndex((c) => c.id === morning.id);
    const ai = ranked.findIndex((c) => c.id === afternoon.id);
    assert.notEqual(mi, -1, `${tz}: the 08:20 word should be offered`);
    assert.equal(ranked[mi].src, "now", `${tz}: the 08:20 word is her-now`);
    assert.ok(
      mi < ai || ai === -1,
      `${tz}: 08:20 word must outrank the 13:20 word`,
    );
  }
});

/** Pair extraction, sentence-scoped — the query the bigram term will use. */
const sentencePairs = (db) =>
  db
    .prepare(
      `SELECT e1.item_id AS a, e2.item_id AS b
       FROM learner_event_log e1
       JOIN learner_event_log e2
         ON e2.sentence_id = e1.sentence_id AND e2.position = e1.position + 1
       WHERE e1.sentence_id IS NOT NULL`,
    )
    .all();

test("Speak ends the sentence: no pair crosses the boundary", () => {
  process.env.TZ = "UTC";
  const db = openDb();
  const [i, want, juice, go, outside] = db
    .prepare(
      `SELECT s.id, l.text FROM sense s
       JOIN label l ON l.sense_id = s.id
         AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = 'en'
       WHERE l.text IN ('I', 'want', 'juice', 'go', 'outside')`,
    )
    .all();
  const id = Object.fromEntries([i, want, juice, go, outside].map((r) => [r.text, r.id]));
  assert.equal(Object.keys(id).length, 5, "fixture words must exist");

  const s1 = openSentence(db);
  [id.I, id.want, id.juice].forEach((w, p) =>
    logSelection(db, "sense", w, Date.now(), { sentenceId: s1, position: p, source: "grid" }));
  closeSentence(db, s1, Date.now(), "spoken");

  const s2 = openSentence(db);
  [id.go, id.outside].forEach((w, p) =>
    logSelection(db, "sense", w, Date.now(), { sentenceId: s2, position: p, source: "grid" }));
  closeSentence(db, s2, Date.now(), "spoken");

  const pairs = sentencePairs(db).map((p) => `${p.a}→${p.b}`);
  assert.ok(pairs.includes(`${id.I}→${id.want}`));
  assert.ok(pairs.includes(`${id.go}→${id.outside}`));
  assert.ok(!pairs.includes(`${id.juice}→${id.go}`), "no pair crosses sentences");

  const rows = db.prepare("SELECT * FROM sentence ORDER BY id").all();
  assert.deepEqual(
    rows.map((r) => r.end_kind),
    ["spoken", "spoken"],
  );
});

test("Clear closes the sentence as 'cleared'", () => {
  process.env.TZ = "UTC";
  const db = openDb();
  const sid = openSentence(db);
  const juice = db
    .prepare(
      `SELECT s.id FROM sense s JOIN label l ON l.sense_id = s.id
       AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = 'en'
       WHERE l.text = 'juice'`,
    )
    .all()[0];
  logSelection(db, "sense", juice.id, Date.now(), { sentenceId: sid, position: 0, source: "grid" });
  closeSentence(db, sid, Date.now(), "cleared");
  const row = db.prepare("SELECT * FROM sentence WHERE id = ?").all(sid)[0];
  assert.equal(row.end_kind, "cleared");
  assert.ok(row.ended_at >= row.started_at);
});

test("every logged pick carries the tap's local offset", () => {
  process.env.TZ = "America/Chicago";
  const db = openDb();
  const sid = openSentence(db);
  logSelection(db, "sense", "sns_x", Date.now(), { sentenceId: sid, position: 0, source: "grid" });
  const row = db.prepare("SELECT tz_offset_min FROM learner_event_log").all()[0];
  assert.equal(row.tz_offset_min, -new Date().getTimezoneOffset());
});
