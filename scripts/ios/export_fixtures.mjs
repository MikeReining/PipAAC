#!/usr/bin/env node
/**
 * A0 fixtures for the iOS parity harness (phase 044 § 6). Emits the
 * files apps/PipAAC/PipAACTests/Fixtures/ carries: one pre-drain replica
 * per seed (base.sqlite + its pending ops), the six-month heavy database
 * with 500 timed probe taps, a 1000-op catch-up stream, and the resolved
 * golden cases — every expected value computed by the SAME harness code
 * (./harness.mjs) the device runs, over the same db seam.
 *
 *   node scripts/ios/export_fixtures.mjs          write fixtures
 *   node scripts/ios/export_fixtures.mjs --check  verify committed, exit 1 on drift
 *
 * Determinism is a fixture property: crypto.randomUUID and Date.now are
 * stubbed with counters for the whole run, and the script re-execs under
 * TZ=UTC — log rows carry tz_offset_min, so a fixture authored in one
 * zone replays in it (the manifest records the zone).
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
if (process.env.TZ !== "UTC") {
  const r = spawnSync(process.execPath, [SELF, ...process.argv.slice(2)],
    { stdio: "inherit", env: { ...process.env, TZ: "UTC" } });
  process.exit(r.status ?? 1);
}

const { DatabaseSync } = await import("node:sqlite");
const repoRoot = join(dirname(SELF), "../..");
const OUT = join(repoRoot, "apps/PipAAC/PipAACTests/Fixtures");
const CHECK = process.argv.includes("--check");

/* Deterministic ids/clock — ops record resolved ids and added_at stamps,
 *  so these two globals are the only drift sources. Lanes scope both
 *  counters per section, so a section's fixture bytes don't depend on
 *  what ran before it. */
const lanes = new Map();      // lane -> uuid counter
const laneClocks = new Map(); // lane -> last ms
let lane = "boot";
const EPOCH = Date.parse("2026-04-01T12:00:00Z");
const setLane = (name, now0 = EPOCH) => {
  lane = name;
  if (!laneClocks.has(name)) laneClocks.set(name, now0);
};
const laneTag = (name) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h.toString(16).padStart(8, "0");
};
crypto.randomUUID = () => {
  const n = (lanes.get(lane) ?? 0) + 1;
  lanes.set(lane, n);
  return `${laneTag(lane)}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
};
Date.now = () => {
  const t = (laneClocks.get(lane) ?? EPOCH) + 977;
  laneClocks.set(lane, t);
  return t;
};

const {
  forcedCollisions, mergeStreams, openReplica, storm, mulberry32,
} = await import("../../src/board/merge_scenario.mjs");
const { listOps, drainOps } = await import("../../public/shared/ops.mjs");
const { createEntity, placeItem } = await import("../../public/shared/groups.mjs");
const { boardModel } = await import("../taps/sim.mjs");
const { normalizeV1 } = await import("../../public/shared/normalize.mjs");

/* The harness under node: __pipHost over node:sqlite, PIPCORE = the real
 *  modules — identical call path to the JSC bundle on device. */
const dbs = new Map();
let nextDbId = 1;
const registerDb = (db) => { const id = nextDbId++; dbs.set(id, db); return id; };
const bindable = (v) =>
  v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v;
globalThis.__pipHost = {
  dbExec: (id, sql) => { dbs.get(id).exec(sql); return null; },
  dbRun: (id, sql, params = []) => {
    const r = dbs.get(id).prepare(sql).run(...params.map(bindable));
    return { changes: Number(r.changes) };
  },
  dbAll: (id, sql, params = []) => {
    const rows = dbs.get(id).prepare(sql).all(...params.map(bindable));
    const columns = rows.length ? Object.keys(rows[0]) : [];
    return { columns, rows: rows.map((r) => columns.map((c) =>
      r[c] instanceof Uint8Array ? { __pipBytes: [...r[c]] } : r[c])) };
  },
};
globalThis.PIPCORE = await import("./core_entry.mjs");
const H = await import("./harness.mjs");

/* ---- output helpers ------------------------------------------------ */

const tmpDir = join(repoRoot, "out/ios-fixtures-tmp");
rmSync(tmpDir, { recursive: true, force: true });
rmSync(OUT, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });
mkdirSync(OUT, { recursive: true });
let stale = 0;
const outPath = (name) => join(OUT, name);
const putText = (name, text) => {
  if (CHECK) {
    let cur = null;
    try { cur = readFileSync(outPath(name)); } catch { /* missing */ }
    if (cur?.toString("utf8") !== text) { console.error(`stale: ${name}`); stale++; }
    return;
  }
  writeFileSync(outPath(name), text);
};
const putDb = (name, db) => {
  const tmp = join(tmpDir, `export-${name}`);
  db.exec(`VACUUM INTO '${tmp.replaceAll("'", "''")}'`);
  if (CHECK) {
    let cur = null;
    try { cur = readFileSync(outPath(name)); } catch { /* missing */ }
    if (!cur?.equals(readFileSync(tmp))) { console.error(`stale: ${name}`); stale++; }
    return;
  }
  copyFileSync(tmp, outPath(name));
};
/** A consistent snapshot of a live db at a new path (VACUUM INTO is a
 *  single-file checkpoint — safe while the source is open). */
const cloneDb = (db, path) =>
  db.exec(`VACUUM INTO '${path.replaceAll("'", "''")}'`);

/* The shipped answer tables — what a device loads (loadLanguage), not
 *  the raw build corpora under data/prediction/. */
const kidsPath = join(repoRoot, "public/suggest_answers.en.json");
const formsPath = join(repoRoot, "public/form_answers.en.json");
const kids = JSON.parse(readFileSync(kidsPath, "utf8"));
const formTable = JSON.parse(readFileSync(formsPath, "utf8"));

const manifest = {
  format: 1, tz: "UTC",
  tables: { kids: "public/suggest_answers.en.json", forms: "public/form_answers.en.json" },
  replay: [], probeTaps: 0, catchupOps: 0, golden: {},
};

/* ---- base.sqlite: the shared post-import replica state ---- */
setLane("base");
const base = openReplica(join(tmpDir, "base.sqlite"));
putDb("base.sqlite", base);
registerDb(base);

const opsFile = (a, excludeIds) =>
  listOps(a).filter((o) => !excludeIds.has(o.op_id))
    .map(({ op_id, device_id, kind, args, created_at }) =>
      ({ op_id, device_id, kind, args, created_at }));

/* ---- replay fixtures: several seeds through the merge scenario ---- */
for (const seed of [20260923, 7, 424242]) {
  const rng = mulberry32(seed);
  setLane(`replay-${seed}`);
  const a = openReplica(join(tmpDir, `replay-a-${seed}.sqlite`));
  /* a's own import ops are its "already in base" set — the device
   *  starts from base.sqlite (equivalent state, different op_ids) and
   *  re-applies only what came later. */
  const aBaseIds = new Set(listOps(a).map((o) => o.op_id));
  const b = openReplica(":memory:");
  forcedCollisions(a, b);
  storm(a, mulberry32(seed + 1), "a", 120);
  storm(b, mulberry32(seed + 2), "b", 120);
  const opsA = listOps(a).map((o) => ({ ...o, device_id: "dev_a" }));
  const opsB = listOps(b).map((o) => ({ ...o, device_id: "dev_b" }));
  const relay = mergeStreams(rng, opsA, opsB);
  const localOps = opsFile(a, aBaseIds);
  drainOps(a, relay);
  const expect = H.dumpSynced(registerDb(a));
  putText(`replay_${seed}.json`, JSON.stringify({
    name: `seed-${seed}`, base: "base.sqlite", localOps, relay, expect }));
  manifest.replay.push({ seed, ops: relay.length, localOps: localOps.length });
}

/* The pending-reapply case (sync_merge.test.mjs's second test). */
setLane("pending");
{
  const a = openReplica(join(tmpDir, "pending-a.sqlite"));
  const aBaseIds = new Set(listOps(a).map((o) => o.op_id));
  const b = openReplica(":memory:");
  createEntity(a, { id: "ent_a1", name: "Ay" });
  placeItem(a, "grp_shared", "entity", "ent_a1", { page: 0, slot_index: 10 });
  createEntity(b, { id: "ent_b1", name: "Bee" });
  placeItem(b, "grp_shared", "entity", "ent_b1", { page: 0, slot_index: 10 });
  const localOps = opsFile(a, aBaseIds);
  const relay = listOps(b).map((o, k) =>
    ({ ...o, device_id: "dev_b", relay_seq: k + 1 }));
  drainOps(a, relay);
  drainOps(a, relay); // idempotent second delivery, as in the test
  const expect = H.dumpSynced(registerDb(a));
  putText("replay_pending.json", JSON.stringify({
    name: "pending-reapply", base: "base.sqlite", localOps, relay, expect }));
  manifest.replay.push({ seed: "pending", ops: relay.length, localOps: localOps.length });
}

/* ---- heavy.sqlite: a six-month-shaped history, synthesized ----
 *  The probes measure QUERY cost, which depends on row counts and
 *  distributions — not on which taps produced them. Replaying 34k
 *  sentences through the real strip path costs ~an hour of CPU to
 *  learn what bulk inserts learn in seconds. The corpus resolves to
 *  folded sense ids once (~700 lookups), then each sentence is stamped
 *  across 180 days at the sim's cadence (09:00 UTC, two minutes apart)
 *  so the ±90-minute "her now" window filters a realistic slice.
 *  phrase_count is left empty on purpose: stripRanked's
 *  ensurePhraseHistory rebuilds it from the event log on first use —
 *  the same once-per-session cost a device pays. */
const corpus = [
  ...JSON.parse(readFileSync(join(repoRoot, "scripts/taps/corpus.en.json"), "utf8")).sentences,
  ...JSON.parse(readFileSync(join(repoRoot, "src/board/fixtures/typing_sentences.en.json"), "utf8")).sentences,
].map((s) => s.trim().toLowerCase());
setLane("heavy");
const heavy = openReplica(":memory:");
const M = boardModel(heavy);
const resolved = corpus.map((sent) => {
  const ws = sent.split(/\s+/);
  const ids = [];
  for (let k = 0; k < ws.length;) {
    let hit = null;
    for (let len = Math.min(3, ws.length - k); len > 0; len--) {
      const id = M.lemmaByNorm.get(normalizeV1(ws.slice(k, k + len).join(" ")));
      if (id) { hit = { id: M.fold(id), len }; break; }
    }
    if (hit) ids.push(hit.id);
    k += hit ? hit.len : 1;
  }
  return ids;
}).filter((a) => a.length);
const DAY0 = Date.parse("2026-04-10T09:00:00Z");
const insSentence = heavy.prepare(
  `INSERT INTO sentence (started_at, ended_at, end_kind, tz_offset_min)
   VALUES (?, ?, 'spoken', 0)`);
const insEvent = heavy.prepare(
  `INSERT INTO learner_event_log
     (item_kind, item_id, selected_at, sentence_id, position, source, tz_offset_min, spotlit)
   VALUES ('sense', ?, ?, ?, ?, ?, 0, 0)`);
const lastId = heavy.prepare("SELECT last_insert_rowid() AS id");
const SOURCES = ["grid", "strip", "group"];
heavy.exec("BEGIN");
for (let day = 0; day < 180; day++) {
  for (let s = 0; s < resolved.length; s++) {
    const start = DAY0 + day * 86400000 + s * 120000;
    insSentence.run(start, start + 1000);
    const sidRow = lastId.all()[0].id;
    resolved[s].forEach((id, p) =>
      insEvent.run(id, start, sidRow, p, SOURCES[(p + s) % 3]));
  }
}
heavy.exec("COMMIT");
/* Build phrase_count + persist its watermark — a real six-month install
 *  carries both, so the probe measures steady-state taps rather than the
 *  once-ever rebuild. */
PIPCORE.funnel.stripCandidates(heavy, [], Date.now(), "en");
/* One editable entity for the op-record timing probe. */
createEntity(heavy, { id: "ent_probe", name: "Probe" });
putDb("heavy.sqlite", heavy);
const heavyId = registerDb(heavy);

/* ---- probes.json: 500 taps on the heavy db ----
 *  expect is this harness's own canonical output — the device runs the
 *  same code, so a byte difference is an engine divergence, not a spec
 *  reading. 500 taps = the first sentences of the corpus, resolved the
 *  way sim.mjs's ideal user resolves them (folded lemma senses). */
setLane("probes");
const probeSentences = [];
let tapCount = 0;
for (const sent of corpus) {
  const ws = sent.split(/\s+/);
  const taps = [];
  for (let k = 0; k < ws.length;) {
    let hit = null;
    for (let len = Math.min(3, ws.length - k); len > 0; len--) {
      const id = M.lemmaByNorm.get(normalizeV1(ws.slice(k, k + len).join(" ")));
      if (id) { hit = { w: ws.slice(k, k + len).join(" "), id: M.fold(id), len }; break; }
    }
    if (hit) taps.push({ kind: "sense", id: hit.id, text: hit.w });
    k += hit ? hit.len : 1;
  }
  if (taps.length) probeSentences.push(taps);
  tapCount += taps.length;
  if (tapCount >= 500) break;
}
const sid = H.probeBegin(heavyId, kids, formTable);
let probeAt = Date.parse("2026-10-01T09:00:00Z");
const probeRows = [];
for (const taps of probeSentences) {
  H.probeSentenceStart(sid, probeAt);
  const row = { at: probeAt, taps: [] };
  for (const t of taps) {
    row.taps.push({ tap: t, at: probeAt, expect: H.probeTap(sid, t, probeAt) });
    probeAt += 3000;
  }
  H.probeSentenceEnd(sid, probeAt);
  probeAt += 120000;
  probeRows.push(row);
}
H.probeFinish(sid);
manifest.probeTaps = probeRows.reduce((n, r) => n + r.taps.length, 0);
putText("probes.json", JSON.stringify({ sentences: probeRows }));

/* ---- edits.json: the op-record timing probe (one edit + its op) ---- */
const edits = [];
for (let i = 0; i < 120; i++) {
  edits.push({ call: "groups.renameEntity", args: ["ent_probe", `Probe ${i}`] });
}
putText("edits.json", JSON.stringify({ edits }));

/* ---- catchup.json: a 1,000+ op confirmed stream ----
 *  Drained onto the heavy state — the realistic six-month device
 *  catching up. learner_* tables are device-local, so the expected dump
 *  holds whether or not probes ran first. */
setLane("catchup");
{
  const c = openReplica(":memory:");
  storm(c, mulberry32(905), "c", 1400);
  const relay = listOps(c)
    .map((o, k) => ({ op_id: o.op_id, device_id: "dev_c", kind: o.kind,
      args: o.args, created_at: o.created_at, relay_seq: k + 1 }));
  drainOps(heavy, relay);
  const expect = H.dumpSynced(heavyId);
  putText("catchup.json", JSON.stringify({ relay, expect }));
  manifest.catchupOps = relay.length;
}

/* ---- goldens: bar + forms, resolved against the fixture db ---- */
setLane("goldens");
const lemmaSense = new Map();
const anySense = new Map();
const lemmaOf = new Map();
for (const l of base.prepare(
  `SELECT sense_id AS id, normalized_text AS n, kind, text
   FROM label WHERE status = 'approved' AND locale = 'en' ORDER BY rowid`,
).all()) {
  if (l.kind === "lemma" && !lemmaSense.has(l.n)) lemmaSense.set(l.n, l.id);
  const rank = { lemma: 0, alias: 1, form: 2 }[l.kind] ?? 3;
  const cur = anySense.get(l.n);
  if (!cur || rank < cur.rank) anySense.set(l.n, { id: l.id, rank });
  if (l.kind === "lemma") lemmaOf.set(l.id, l.text);
}
const S = (w) => {
  const id = lemmaSense.get(w);
  if (!id) throw new Error(`golden: no lemma for "${w}"`);
  return { kind: "sense", id };
};
const SA = (w) => {
  const hit = anySense.get(w);
  if (!hit) throw new Error(`golden: no label for "${w}"`);
  return { kind: "sense", id: hit.id };
};
/** Each golden row gets the base state fresh, like the runners do. */
const freshCaseDb = (tag) => {
  const p = join(tmpDir, `case-${tag}.sqlite`);
  cloneDb(base, p);
  return new DatabaseSync(p);
};

const GOLD_NOW = Date.parse("2026-09-24T08:20:00");
const TODDLER = [
  ["want", "milk"], ["want", "milk"], ["more", "milk"],
  ["mom", "up"], ["want", "up"], ["all done"],
];

const barRows = JSON.parse(
  readFileSync(join(repoRoot, "scripts/prediction/bar_examples.json"), "utf8"));
const goldenBar = [];
let barMiss = 0;
for (const [i, row] of barRows.entries()) {
  const hist = row.history === "toddler" ? TODDLER : row.history;
  const history = hist.map((words, j) => ({
    at: GOLD_NOW - 86400000 + j * 60000,
    items: words.map((w) => S(w)),
  }));
  const phrase = row.phrase.map(S);
  const fh = freshCaseDb(`bar-${i}`);
  const node = H.barGolden(registerDb(fh), { history, phrase, at: GOLD_NOW, kids });
  fh.close();
  const actual = node.shown.map((c) => lemmaOf.get(c.id) ?? c.id);
  const setOk = actual.length === row.expected.length
    && new Set(actual).size === actual.length
    && actual.every((w) => row.expected.includes(w));
  if (!setOk) barMiss++;
  goldenBar.push({ history, phrase, at: GOLD_NOW, expected: row.expected,
    node, expectedSetOk: setOk });
}
manifest.golden.bar = { cases: goldenBar.length, expectedSetMisses: barMiss };
putText("goldens_bar.json", JSON.stringify({ cases: goldenBar }));

const formRows = JSON.parse(
  readFileSync(join(repoRoot, "scripts/prediction/form_examples.json"), "utf8"));
const goldenForm = [];
let formMiss = 0;
for (const [i, row] of formRows.entries()) {
  const taps = (row.bar ? row.bar.map((w) => ({ sense: SA(w).id }))
    : (row.taps ?? [...row.before, row.tap]).map((spec) =>
      typeof spec === "string" ? { sense: SA(spec).id }
        : { entity: spec.entity, link: spec.link ? SA(spec.link).id : null }));
  const fh = freshCaseDb(`form-${i}`);
  const node = H.formGolden(registerDb(fh), {
    taps, speak: !!row.speak, barRank: row.bar ? taps.map((t) => t.sense) : null,
    at: GOLD_NOW, kids, forms: formTable });
  fh.close();
  const expected = row.expectedSentence ?? row.expected;
  const actual = row.expectedSentence ? node.texts.join(" ")
    : row.bar ? node.bar : node.last;
  const match = JSON.stringify(actual) === JSON.stringify(expected);
  if (!match) formMiss++;
  goldenForm.push({ taps, speak: !!row.speak,
    barRank: row.bar ? taps.map((t) => t.sense) : null, at: GOLD_NOW,
    expected, node, ok: match });
}
manifest.golden.forms = { cases: goldenForm.length, expectedMisses: formMiss };
putText("goldens_form.json", JSON.stringify({ cases: goldenForm }));

/* ---- shipped tables + manifest ---- */
const copyTable = (name, src) => {
  if (CHECK) {
    let cur = null;
    try { cur = readFileSync(outPath(name)); } catch { /* missing */ }
    if (!cur?.equals(readFileSync(src))) { console.error(`stale: ${name}`); stale++; }
  } else {
    copyFileSync(src, outPath(name));
  }
};
copyTable("suggest_answers.en.json", kidsPath);
copyTable("form_answers.en.json", formsPath);
putText("manifest.json", JSON.stringify(manifest, null, 2));

if (CHECK) {
  if (stale) { console.error(`${stale} stale fixture file(s)`); process.exit(1); }
  console.log("ios fixtures: all current");
} else {
  console.log(`fixtures -> ${OUT}`);
  console.log(JSON.stringify(manifest, null, 2));
}
process.exit(0);
