/**
 * 016 slice 6 Works Test — "Help improve Pip" anonymous totals.
 *
 * The ban to prove (Stats_And_Progress § 7): research data cannot
 * identify a family. A scripted fixture of stats_day rows (own-word
 * entity taps, built-in sense taps, a photo-ish id, a user id) goes
 * through the real flush with a capture-fetch; every byte that left the
 * device is inspected. The Worker side is proven with the real
 * validator and handler: whitelist-only acceptance, extra field → 400,
 * entity/user/device ids can never appear in `words`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  dayPayload, ensureResearchId, flushResearch, RESEARCH_FIELDS,
} from "../../public/shared/research.mjs";
import { setSetting } from "../../public/shared/groups.mjs";
import { validateResearch, handleResearch } from "../../src/worker/research.js";

const SCHEMA = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "schema.sql"), "utf8",
);

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = OFF");
  for (const t of ["learner_profile", "stats_day", "sync_op"]) {
    const ddl = SCHEMA.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${t} \\([^;]+\\);`))?.[0];
    assert.ok(ddl, `schema for ${t}`);
    db.exec(ddl);
  }
  db.prepare(
    `INSERT INTO learner_profile (id, locale, preferred_voice_id)
     VALUES ('prf_local', 'en', 'voi_test')`,
  ).run();
  return db;
}

/** A stats_day row shaped like slice 1's engine writes, with the
 *  identifying material the ban cares about present in the source data:
 *  an own-word entity, a photo-key-shaped id, taps at real hours. */
function putDay(db, day, device, p) {
  db.prepare(
    `INSERT INTO stats_day (day, device_id, computed_at, payload)
     VALUES (?, ?, 1, ?)`,
  ).run(day, device, JSON.stringify({
    day, computed_at: 1, words: 0, different: 0, new: 0, sentences: 0,
    words_per_sentence: null, longest_sentence: 0, wpm_median: null, wpm_samples: 0,
    core: 0, fringe: 0, own: 0, spotlit: 0,
    sources: {}, hours: Array(24).fill(0), lengths: {}, per_word: {}, ...p,
  }));
}

const FORBIDDEN = ["Cooper", "ent_cooper", "usr_", "dev_", "photo_key", "9:14"];

test("flush sends whitelisted counts — no identifier survives", async () => {
  const db = fixture();
  putDay(db, 14000, "dev_local", {
    words: 13, sentences: 4, wpm_median: 5, wpm_samples: 4,
    wpm_q1: 3, wpm_q3: 7,
    path_times: {
      grid: { q1: 1200, median: 2000, q3: 3100, n: 9 },
      strip: { q1: 800, median: 1500, q3: 2200, n: 4 },
    },
    jev_timing: { shown: { median: 900, n: 6 }, late: { median: 2100, n: 3 } },
    wrong_picks: 2,
    sources: { grid: 9, strip: 4 }, hours: (() => { const h = Array(24).fill(0); h[9] = 13; return h; })(),
    lengths: { 2: 3, 3: 1 },
    per_word: {
      "sense:sns_want": { taps: 8, spotlit: 0 },
      "sense:sns_more": { taps: 2, spotlit: 2, first: 1 },
      "entity:ent_cooper": { taps: 3, spotlit: 0 }, // own word: a name
    },
  });
  putDay(db, 14001, "dev_local", { words: 5, sources: { grid: 5 },
    per_word: { "sense:sns_want": { taps: 5, spotlit: 0 } } });
  // A supporter replica's copy of the child's row — must never send.
  putDay(db, 14000, "dev_tablet", { words: 99 });

  const sent = [];
  const n = await flushResearch(db, {
    baseUrl: "https://t",
    fetchImpl: async (url, init) => {
      sent.push({ url, body: JSON.parse(init.body), raw: init.body });
      return { ok: true };
    },
  });
  assert.equal(n, 2); // both own rows; the replica row never leaves
  for (const s of sent) {
    assert.equal(s.url, "https://t/research");
    assert.deepEqual(Object.keys(s.body).sort(), [...RESEARCH_FIELDS].sort());
    for (const bad of FORBIDDEN) {
      assert.ok(!s.raw.includes(bad), `payload leaked: ${bad}`);
    }
    for (const id of Object.keys(s.body.words)) {
      assert.match(id, /^sns_/);
    }
  }
  const d0 = sent.find((s) => s.body.day === 14000).body;
  assert.equal(d0.words.sns_want, 8);
  assert.equal(d0.own_taps, 3);            // Cooper's taps: a number, never "Cooper"
  assert.equal(d0.wpm_q1, 3); assert.equal(d0.wpm_q3, 7);
  // Path timings leave as bare ms numbers — no times of day, no sequences.
  assert.deepEqual(d0.path_ms, {
    grid: { q1: 1200, median: 2000, q3: 3100, n: 9 },
    strip: { q1: 800, median: 1500, q3: 2200, n: 4 },
  });
  // The experiment's two medians and counts, and the wrong-pick count.
  assert.deepEqual(d0.jev_ms, { shown: { median: 900, n: 6 }, late: { median: 2100, n: 3 } });
  assert.equal(d0.wrong_n, 2);
  assert.equal(d0.strip_share, 4 / 13);
  assert.equal(d0.age_days, 0);            // first stats day
  assert.equal(sent.find((s) => s.body.day === 14001).body.age_days, 1);
  assert.match(d0.rid, /^res_/);

  // Send-once: a second flush posts nothing.
  const again = [];
  await flushResearch(db, {
    baseUrl: "https://t", fetchImpl: async (u, i) => { again.push(i); return { ok: true }; },
  });
  assert.equal(again.length, 0);
});

test("off means off — no research request at all", async () => {
  const db = fixture();
  putDay(db, 14000, "dev_local", { words: 3, per_word: { "sense:sns_want": { taps: 3 } } });
  setSetting(db, "share_research", 0);
  let calls = 0;
  const n = await flushResearch(db, { fetchImpl: async () => { calls++; return { ok: true }; } });
  assert.equal(n, 0);
  assert.equal(calls, 0);
});

test("the research id is random, synced, and stable", () => {
  const db = fixture();
  const rid = ensureResearchId(db);
  assert.match(rid, /^res_[0-9a-f-]{36}$/);
  assert.equal(ensureResearchId(db), rid); // second call keeps it
  const op = db.prepare("SELECT kind, args FROM sync_op").all()
    .map((r) => ({ ...r })).find((r) => r.kind === "set_setting");
  assert.ok(op, "the id syncs via a setting op");
  assert.ok(JSON.parse(op.args).value === rid);
});

test("the Worker accepts the real payload and rejects anything extra", () => {
  const db = fixture();
  putDay(db, 14000, "dev_local", {
    words: 3, lengths: { 2: 1 },
    per_word: { "sense:sns_want": { taps: 3 } },
  });
  const good = dayPayload(db, { day: 14000, payload: db.prepare(
    "SELECT payload FROM stats_day WHERE day = 14000").all()[0].payload },
    { rid: "res_00000000-0000-4000-8000-000000000000", firstDay: 14000 });
  assert.ok(validateResearch(good), "a real dayPayload must validate");

  assert.equal(validateResearch({ ...good, user_id: "usr_x" }), null);
  assert.equal(validateResearch({ ...good, words: { ent_cooper: 3 } }), null);
  assert.equal(validateResearch({ ...good, rid: "usr_abc" }), null);
  assert.equal(validateResearch({ ...good, strip_share: 2 }), null);
  assert.equal(validateResearch({ ...good, words: { sns_a: "three" } }), null);
  assert.equal(validateResearch({ ...good, wpm_q1: "fast" }), null);
  // path_ms: unknown path, missing field, and non-numeric all reject.
  const pt = { grid: { q1: 1, median: 2, q3: 3, n: 4 } };
  assert.ok(validateResearch({ ...good, path_ms: pt }));
  assert.equal(validateResearch({ ...good, path_ms: { pocket: pt.grid } }), null);
  assert.equal(validateResearch({ ...good, path_ms: { grid: { q1: 1, median: 2, q3: 3 } } }), null);
  assert.equal(validateResearch({ ...good, path_ms: { grid: { ...pt.grid, median: -1 } } }), null);
  // jev_ms: exactly {shown, late} × {median, n}.
  const jm = { shown: { median: 900, n: 6 }, late: { median: null, n: 0 } };
  assert.ok(validateResearch({ ...good, jev_ms: jm }));
  assert.equal(validateResearch({ ...good, jev_ms: { shown: jm.shown } }), null);
  assert.equal(validateResearch({ ...good, jev_ms: { shown: jm.shown, late: { median: -5, n: 1 } } }), null);
  assert.equal(validateResearch({ ...good, jev_ms: { shown: jm.shown, late: { median: 1 } } }), null);
  assert.equal(validateResearch({ ...good, wrong_n: -1 }), null);
  assert.equal(validateResearch("nope"), null);
});

test("the endpoint writes one datapoint and refuses the rest", async () => {
  const points = [];
  const env = { RESEARCH: { writeDataPoint: (dp) => points.push(dp) } };
  const db = fixture();
  putDay(db, 14000, "dev_local", {
    words: 3, per_word: { "sense:sns_want": { taps: 3 } },
  });
  const body = dayPayload(db, db.prepare(
    "SELECT day, payload FROM stats_day WHERE day = 14000").all()[0],
    { rid: "res_00000000-0000-4000-8000-000000000000", firstDay: 14000 });

  const ok = await handleResearch(new Request("https://t/research", {
    method: "POST", body: JSON.stringify(body),
  }), env);
  assert.equal(ok.status, 200);
  assert.equal(points.length, 1);
  assert.deepEqual(points[0].indexes, [body.rid]);
  assert.equal(JSON.parse(points[0].blobs[0]).sns_want, 3);

  const bad = await handleResearch(new Request("https://t/research", {
    method: "POST", body: JSON.stringify({ ...body, sneaky: 1 }),
  }), env);
  assert.equal(bad.status, 400);
  assert.equal(points.length, 1);

  const notJson = await handleResearch(new Request("https://t/research", {
    method: "POST", body: "{",
  }), env);
  assert.equal(notJson.status, 400);
  const wrongVerb = await handleResearch(new Request("https://t/research"), env);
  assert.equal(wrongVerb.status, 405);
});
