/**
 * 044 E-int — "Share anonymous counts with Pip" on the iPad core.
 * The BUILT bundle (what ships) in a bare vm realm, a fake fetch standing
 * in for the Worker (the base URL is a dead loopback stub, never
 * production). Asserts what LEFT (the captured request bodies) and what
 * the database says was marked sent, not the facade's own return values.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";

const root = new URL("../../", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "pip-res-"));
const file = join(dir, "user.sqlite");
copyFileSync(join(root, "public/fresh_db.sqlite"), file);
const writer = new DatabaseSync(file);
const reader = new DatabaseSync(file);
const bindable = (v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);
const host = {
  baseURL: "http://127.0.0.1:9",
  log: () => {},
  randomUUID: () => crypto.randomUUID(),
  randomBytes: (n) => [...crypto.getRandomValues(new Uint8Array(n))],
  dbExec: (_id, sql) => { writer.exec(sql); return null; },
  dbRun: (_id, sql, p = []) => ({ changes: Number(writer.prepare(sql).run(...p.map(bindable)).changes) }),
  dbAll: (_id, sql, p = []) => {
    const rows = writer.prepare(sql).all(...p.map(bindable));
    const columns = rows.length ? Object.keys(rows[0]) : [];
    return { columns, rows: rows.map((r) => columns.map((c) =>
      r[c] instanceof Uint8Array ? { __pipBytes: [...r[c]] } : r[c])) };
  },
};
const sent = []; // { url, body }
const ctx = vm.createContext({
  __pipHost: host,
  fetch: async (url, init) => { sent.push({ url: String(url), body: JSON.parse(init.body) }); return { ok: true, status: 200 }; },
});
vm.runInContext(readFileSync(join(root, "apps/PipAAC/PipAAC/Core/pip-core.js"), "utf8"), ctx);
const app = new Proxy({}, {
  get: (_, fn) => (...args) => {
    ctx.__a = JSON.stringify(args);
    const out = vm.runInContext(`JSON.stringify(PIPCORE.app.${String(fn)}(...JSON.parse(__a)))`, ctx);
    return out === undefined ? undefined : JSON.parse(out);
  },
});
const { RESEARCH_FIELDS } = await import("../../public/shared/research.mjs");

const { appId } = app.appOpen(1, readFileSync(join(root, "public/catalog.json"), "utf8"), null, null);
const until = async (f, what) => {
  for (let i = 0; i < 100; i++) { if (f()) return; await new Promise((r) => setTimeout(r, 20)); }
  assert.fail(`timed out: ${what}`);
};
const day = (d) => writer.prepare(
  "INSERT INTO stats_day (day, device_id, computed_at, payload) VALUES (?, 'dev_local', 1, ?)",
).run(d, JSON.stringify({
  day: d, words: 3, per_word: { "sense:sns_0013": { taps: 2 }, "entity:ent_cooper": { taps: 1 } },
  lengths: { 2: 1 }, wpm_median: 9, wpm_samples: 2, sources: { strip: 1 },
}));
const unreported = () => reader.prepare("SELECT COUNT(*) AS n FROM stats_day WHERE reported = 0").all()[0].n;

test("switch off: nothing is sent, nothing is marked", async () => {
  day(20001); day(20002);
  app.appSetSetting(appId, "share_research", 0);
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(sent.length, 0);
  assert.equal(unreported(), 2);
});

test("switch on: one whitelisted payload per stats_day row, each marked, none twice", async () => {
  app.appSetSetting(appId, "share_research", 1);
  await until(() => sent.length === 2, "two rows sent");
  for (const s of sent) {
    assert.ok(s.url.startsWith("http://127.0.0.1:9/research"), s.url); // the stub base, never production
    assert.deepEqual(Object.keys(s.body).sort(), [...RESEARCH_FIELDS].sort());
  }
  assert.deepEqual(sent.map((s) => s.body.day), [20001, 20002]);
  assert.equal(new Set(sent.map((s) => s.body.rid)).size, 1);
  assert.match(sent[0].body.rid, /^res_/);
  assert.deepEqual(sent[0].body.words, { sns_0013: 2 });
  assert.equal(sent[0].body.own_taps, 1);
  assert.ok(!JSON.stringify(sent).includes("ent_cooper"));
  assert.equal(unreported(), 0);
  app.appSetSetting(appId, "share_research", 1);
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(sent.length, 2, "reported rows are not re-sent");
});

test("a new day after the switch is back off stays home", async () => {
  app.appSetSetting(appId, "share_research", 0);
  day(20003);
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(sent.length, 2);
  assert.equal(unreported(), 1);
});
