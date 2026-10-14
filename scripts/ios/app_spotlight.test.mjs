/**
 * 044 D5 proof: live modeling and the Spotlight glow on the board (SY-5,
 * SP-1..SP-5, BS-26) - the BUILT core (pip-core.js in a bare node:vm realm)
 * with a fake relay that keeps live WebSockets (app_spotlight.fakes.mjs).
 *
 * What is measured, and by whom: the relay's own frames (opened here with an
 * independently held key) for what the iPad SENDS; the iPad's database
 * (a sorted dump of every synced table) for "no board edit"; the
 * render model `PIPCORE.spot.state` for what Swift draws. The relay is a
 * fake; the real Worker is exercised by e2e_sync.sh's `spotlight` scenario.
 *
 * Run: scripts/test.sh scripts/ios/app_spotlight.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import { createDatabase } from "../../src/board/catalog.mjs";
import { ensureBaseline, pendingOps } from "../../public/shared/ops.mjs";
import { startSession, nextMidnight } from "../../public/shared/spotlight.mjs";
import * as real from "../../public/shared/sync_crypto.mjs";
import { dumpLines } from "./e2e_dump.mjs";
import { FakeRelay, makeHost, sleep } from "./app_spotlight.fakes.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const BUNDLE = readFileSync(join(root, "apps/PipAAC/PipAAC/Core/pip-core.js"), "utf8");
const CATALOG = readFileSync(join(root, "public/catalog.json"), "utf8");
const until = async (pred, what, ms = 6000) => {
  const t0 = Date.now();
  while (!(await pred())) {
    if (Date.now() - t0 > ms) assert.fail(`timed out waiting for: ${what}`);
    await sleep(10);
  }
};

/** The catalog's real tiles: two core words and the group anchor. */
const CELL_A = "sense:sns_0013";
const CELL_B = "sense:sns_0014";

/** Boot the iPad: fresh replica file + the bundle in a bare realm + the
 *  sync loop + appOpen + spot.bind, as AppModel.open does. */
async function boot({ relay, userKey, role = null, file, name = "Zed", cursor = 0 }) {
  if (!file) {
    file = join(mkdtempSync(join(tmpdir(), "pip-spot-")), "user.sqlite");
    copyFileSync(join(root, "public/fresh_db.sqlite"), file);
  }
  const sqlite = new DatabaseSync(file);
  const dbs = new Map([[1, sqlite]]);
  const h = makeHost({ relay, dbs });
  h.provision("user/u1/key_e1", userKey);
  const ctx = vm.createContext({ __pipHost: h.host });
  h.attach(ctx);
  vm.runInContext(BUNDLE, ctx);
  const run = (src) => vm.runInContext(src, ctx);
  ctx.__cat = CATALOG;
  const { appId } = JSON.parse(run(`JSON.stringify(PIPCORE.app.appOpen(1, __cat, null, null))`));
  const user = { id: "u1", role, sync: { userId: "ur1", epoch: 1, cursor } };
  ctx.__args = JSON.stringify(user);
  run(`PIPCORE.sync.syncStart(${JSON.stringify(appId)}, __args, "https://relay.test", "{}")`);
  await until(() => h.events.some(([n]) => n === "sync.started"), "sync.started");
  await until(() => relay.sockets.length >= 1, "socket opened");
  run(`PIPCORE.spot.bind(${JSON.stringify(appId)}, ${JSON.stringify(role)}, ${JSON.stringify(name)})`);
  const dev = {
    ...h, ctx, run, appId, sqlite, file, relay, userKey,
    json: (src) => JSON.parse(run(`JSON.stringify(${src})`)),
    /** The board's word cells as Swift lists them: "kind:id". */
    keys: () => dev.json(`PIPCORE.app.appBoard(${JSON.stringify(appId)})`).cells
      .filter((c) => c.type === "word").map((c) => `${c.kind}:${c.id}`),
    spot: () => dev.json(`PIPCORE.spot.state(${JSON.stringify(appId)}, ${JSON.stringify(JSON.stringify(dev.keys()))})`),
    changes: () => h.events.filter(([n]) => n === "spot.changed").length,
    /** Frames the iPad sent up its socket, opened with the key the relay never holds. */
    sent: async () => {
      const out = [];
      for (const f of relay.sockets.flatMap((s) => s.frames)) {
        if (f.t === "model") out.push(await real.openOp(userKey, f.env));
      }
      return out;
    },
    close() { for (const s of [...relay.sockets]) relay.sockets = relay.sockets.filter((x) => x !== s); run(`PIPCORE.sync.syncStop("{}")`); },
  };
  return dev;
}

/** A live message from another device, sealed as sync.mjs sealLive does. */
const push = async (relay, userKey, plain) =>
  relay.sockets[0].push({ t: "model", from: "dev_other", e: 1, env: await real.sealOp(userKey, plain) });

/** The ops another device authored when it started a Spotlight session. */
function sessionOps(session) {
  const b = createDatabase(":memory:");
  ensureBaseline(b);
  startSession(b, session);
  return pendingOps(b, 50);
}

const fresh = async (opts = {}) => {
  const userKey = opts.userKey ?? await real.newUserKey();
  const relay = opts.relay ?? new FakeRelay(userKey);
  return boot({ relay, userKey, ...opts });
};
/** The cursor the registry row last saved (what AppModel hands the next launch). */
const savedCursor = (d) => d.savedUsers.map((s) => s.patch.sync?.cursor).filter((c) => c != null).at(-1) ?? 0;

/* ---------------- tests ---------------- */

test("SP-3/SY-5: a model message lights exactly that cell, then fades - and writes nothing to the board", async () => {
  const d = await fresh();
  const keys = d.keys();
  assert.ok(keys.includes(CELL_A) && keys.includes(CELL_B), "the catalog board has the test tiles");
  const before = dumpLines(d.sqlite);
  const opsBefore = d.sqlite.prepare("SELECT COUNT(*) c FROM sync_op").all()[0].c;
  assert.equal(Object.values(d.spot().marks).filter((m) => m.glow || m.dimmed || m.modeled).length, 0, "plain board at rest");

  const n = d.changes();
  await push(d.relay, d.userKey, { k: "model", t: CELL_A, w: "more" });
  await until(() => d.changes() > n, "spot.changed after the model frame");
  const st = d.spot();
  assert.equal(st.marks[CELL_A].modeled, true);
  assert.equal(st.marks[CELL_A].glow, true);
  for (const k of keys.filter((x) => x !== CELL_A)) {
    assert.deepEqual([st.marks[k].glow, st.marks[k].modeled, st.marks[k].dimmed], [false, false, false], `${k} untouched`);
  }
  assert.equal(st.on, false, "a modeled word is not a session");
  assert.equal(st.modeling, false, "the child's board shows no coach bar");

  // The light fades by itself after MODEL_FADE_MS (4 s; 80 ms on the compressed clock).
  await until(() => d.spot().marks[CELL_A].modeled === false, "the modeled light fades");
  assert.equal(d.spot().marks[CELL_A].glow, false);

  // An attention event is not a board edit: not one table row, not one op.
  assert.deepEqual(dumpLines(d.sqlite), before, "synced tables unchanged");
  assert.equal(d.sqlite.prepare("SELECT COUNT(*) c FROM sync_op").all()[0].c, opsBefore, "no op recorded");
});

test("SP-3: the child tapping a modeled word ends its light (and a ✨ model rings the button)", async () => {
  const d = await fresh();
  await push(d.relay, d.userKey, { k: "model", t: CELL_B, w: "go" });
  await push(d.relay, d.userKey, { k: "model", t: "control:fix", w: "✨ fix it" });
  await until(() => d.spot().marks[CELL_B].modeled && d.spot().controls.fix.modeled, "both lit");
  assert.equal(d.spot().controls.question.glow, false);
  d.run(`PIPCORE.app.appTap(${JSON.stringify(d.appId)}, { kind: "sense", id: "sns_0014", text: "go", source: "grid" })`);
  assert.equal(d.spot().marks[CELL_B].modeled, false, "her tap ends its light at once");
  assert.equal(d.spot().controls.fix.modeled, true, "the other light keeps its own fade");
  // A modeled word is lit when pressed: Progress counts it "with the glow".
  const row = d.sqlite.prepare("SELECT spotlit FROM learner_event_log ORDER BY rowid DESC LIMIT 1").all()[0];
  assert.equal(row.spotlit, 1);
});

test("SP-1: a session started elsewhere glows its words and dims the rest; a supporter's session leaves the board plain", async () => {
  const d = await fresh();
  const targets = [CELL_A, "sense:sns_0015"];
  const n = d.changes();
  await d.relay.addOps(sessionOps({ name: "Mealtime", targets, by_supporter: 0 }));
  await until(() => d.spot().on, "the session arrived through the sync loop");
  assert.ok(d.changes() > n);
  let st = d.spot();
  assert.equal(st.steady, true);
  assert.equal(st.chip, "🔦 Mealtime · End");
  assert.equal(st.marks[CELL_A].glow, true);
  assert.equal(st.marks[CELL_A].dimmed, false);
  assert.equal(st.marks[CELL_B].dimmed, true);
  assert.equal(st.marks[CELL_B].glow, false);
  assert.equal(st.dim, 0.45);
  // The dim level is a synced setting.
  d.sqlite.prepare("UPDATE learner_profile SET spot_dim = 20, spot_pulse = 1 WHERE id = 'prf_local'").run();
  st = d.spot();
  assert.equal(st.dim, 0.2);
  assert.equal(st.marks[CELL_A].pulse, true);
  // Never a muzzle: a dimmed word still taps and speaks.
  const tap = d.json(`PIPCORE.app.appTap(${JSON.stringify(d.appId)}, { kind: "sense", id: "sns_0014", text: "go", source: "grid" })`);
  assert.ok(tap.speech, "the dimmed word spoke");
  assert.equal(tap.bar.length, 1);

  // Started on a supporter's device: the child's board stays plain (013).
  const e = await fresh();
  await e.relay.addOps(sessionOps({ name: "Coach", targets, by_supporter: 1 }));
  await until(() => e.sqlite.prepare("SELECT COUNT(*) c FROM spotlight_session").all()[0].c === 1, "row synced");
  await sleep(50);
  const plain = e.spot();
  assert.equal(plain.on, true);
  assert.equal(plain.steady, false);
  assert.equal(plain.chip, null);
  assert.ok(Object.values(plain.marks).every((m) => !m.glow && !m.dimmed), "no glow, no dim");
  await push(e.relay, e.userKey, { k: "model", t: CELL_B, w: "go" });
  await until(() => e.spot().marks[CELL_B].modeled, "...but a modeled word lights");
});

test("SP-1: ✨ and ❓ are targets too, and the Groups button glows when a target lives in a group", async () => {
  const d = await fresh();
  await d.relay.addOps(sessionOps({ name: "Buttons", targets: ["control:fix", "sense:sns_zzzz_not_on_board"], by_supporter: 0 }));
  await until(() => d.spot().on, "session");
  const st = d.spot();
  assert.equal(st.controls.fix.glow, true);
  assert.equal(st.controls.question.glow, false);
  assert.equal(st.groups, true, "a target that is not on the board walks through Groups");
});

test("SP-2: the session survives a restart, and ends at midnight or at an old row's timer", async () => {
  const d = await fresh();
  await d.relay.addOps(sessionOps({ name: "Mealtime", targets: [CELL_A], by_supporter: 0 }));
  await until(() => d.spot().on, "session");
  const row = d.sqlite.prepare("SELECT started_at, ends_at FROM spotlight_session").all()[0];
  assert.equal(row.ends_at, nextMidnight(row.started_at), "a session always ends at local midnight");
  await until(() => savedCursor(d) >= 1, "the cursor was checkpointed");
  d.close();
  d.sqlite.close();
  const same = { relay: d.relay, userKey: d.userKey, file: d.file, cursor: savedCursor(d) };

  // Relaunch: a new process (new realm) over the same file lights it again.
  const again = await fresh(same);
  const st = again.spot();
  assert.equal(st.on, true, "resumed after restart");
  assert.equal(st.marks[CELL_A].glow, true);
  assert.equal(st.marks[CELL_B].dimmed, true);
  again.close();
  again.sqlite.close();

  // Midnight passed while away: the row's end is in the past - the layer ends and the end syncs.
  const late = new DatabaseSync(d.file);
  const yesterdayEve = new Date(); yesterdayEve.setDate(yesterdayEve.getDate() - 1); yesterdayEve.setHours(23, 0, 0, 0);
  late.prepare("UPDATE spotlight_session SET started_at = ?, ends_at = ?").run(yesterdayEve.getTime(), nextMidnight(yesterdayEve.getTime()));
  late.close();
  const gone = await fresh(same);
  assert.equal(gone.spot().on, false, "ended at midnight");
  assert.equal(gone.sqlite.prepare("SELECT COUNT(*) c FROM spotlight_session").all()[0].c, 0, "the row is deleted");
  assert.ok(gone.sqlite.prepare("SELECT kind FROM sync_op WHERE kind = 'spot_end'").all().length >= 1, "the end is a synced op");
  gone.close();
});

test("SP-2: a running board notices the end by itself on the slow tick (an old row's timer)", async () => {
  const d = await fresh();
  const soon = Date.now() + 100; // a row synced from an older device with a short timer
  await d.relay.addOps(sessionOps({ name: "Short", targets: [CELL_A], by_supporter: 0, started_at: Date.now() - 1000, ends_at: soon }));
  await until(() => d.spot().on || d.sqlite.prepare("SELECT COUNT(*) c FROM spotlight_session").all()[0].c === 1, "row arrived");
  // The tick is 30 s (600 ms on the compressed clock); by then ends_at has passed.
  await until(() => d.sqlite.prepare("SELECT COUNT(*) c FROM spotlight_session").all()[0].c === 0, "the tick ended it", 4000);
  assert.equal(d.spot().on, false);
});

test("SP-1: the End chip ends the session for everyone (a synced spot_end op)", async () => {
  const d = await fresh();
  await d.relay.addOps(sessionOps({ name: "Mealtime", targets: [CELL_A], by_supporter: 0 }));
  await until(() => d.spot().on, "session");
  d.run(`PIPCORE.spot.end()`);
  assert.equal(d.spot().on, false);
  await until(() => d.sqlite.prepare("SELECT relay_seq FROM sync_op WHERE kind = 'spot_end'").all()[0]?.relay_seq != null, "end confirmed by the relay");
});

test("SP-5/SY-5: the child's taps ride the relay as sealed 'tap' frames carrying the session's start, and are logged as lit or not", async () => {
  const d = await fresh();
  await d.relay.addOps(sessionOps({ name: "Mealtime", targets: [CELL_A], by_supporter: 0 }));
  await until(() => d.spot().on, "session");
  const startedAt = d.sqlite.prepare("SELECT started_at FROM spotlight_session").all()[0].started_at;
  const tap = (id, text) =>
    d.run(`PIPCORE.app.appTap(${JSON.stringify(d.appId)}, { kind: "sense", id: ${JSON.stringify(id)}, text: ${JSON.stringify(text)}, source: "grid" })`);
  const spotOps = () => d.sqlite.prepare("SELECT COUNT(*) c FROM sync_op WHERE kind LIKE 'spot%'").all()[0].c;
  const spotOpsBefore = spotOps();
  tap("sns_0013", "more");   // lit
  tap("sns_0014", "go");     // dimmed
  tap("sns_0013", "more");
  await until(async () => (await d.sent()).filter((m) => m.k === "tap").length === 3, "three tap frames at the relay");
  const frames = (await d.sent()).filter((m) => m.k === "tap");
  assert.deepEqual(frames, [
    { k: "tap", t: CELL_A, s: startedAt },
    { k: "tap", t: CELL_B, s: startedAt },
    { k: "tap", t: CELL_A, s: startedAt },
  ]);
  const log = d.sqlite.prepare("SELECT item_id, spotlit FROM learner_event_log ORDER BY rowid").all().map((r) => [r.item_id, r.spotlit]);
  assert.deepEqual(log, [["sns_0013", 1], ["sns_0014", 0], ["sns_0013", 1]]);
  assert.equal(spotOps(), spotOpsBefore, "a tap makes no op: live frames are not ops");
});

test("SP-5: no session, no frames - the child's taps are not broadcast outside a spotlight", async () => {
  const d = await fresh();
  d.run(`PIPCORE.app.appTap(${JSON.stringify(d.appId)}, { kind: "sense", id: "sns_0013", text: "more", source: "grid" })`);
  await sleep(100);
  assert.deepEqual(await d.sent(), []);
});

test("SP-4/SP-5: a supporter's device - taps model (sealed frame), the tip shows, the child's presses are counted per session", async () => {
  const d = await fresh({ role: "partner", name: "Zed" });
  await d.relay.addOps(sessionOps({ name: "Mealtime", targets: [CELL_A], by_supporter: 1 }));
  await until(() => d.spot().modeling, "modeling is on while a real session runs");
  const startedAt = d.sqlite.prepare("SELECT started_at FROM spotlight_session").all()[0].started_at;
  let st = d.spot();
  assert.equal(st.line, "Your taps light up on Zed's board. Say each word as you tap it.");
  assert.equal(st.steady, true, "a supporter's own device glows");
  assert.equal(st.count, "");

  const before = dumpLines(d.sqlite);
  assert.equal(d.run(`PIPCORE.spot.modelTap("sense", "sns_0013", "more")`), true);
  await until(async () => (await d.sent()).some((m) => m.k === "model"), "model frame at the relay");
  assert.deepEqual((await d.sent()).filter((m) => m.k === "model"), [{ k: "model", t: CELL_A, w: "more" }]);
  st = d.spot();
  assert.equal(st.marks[CELL_A].glow, true, "the 700 ms local echo");
  assert.notEqual(st.line, "Your taps light up on Zed's board. Say each word as you tap it.", "the tip replaced the bar line");
  assert.match(st.line, /\S/);
  assert.deepEqual(dumpLines(d.sqlite), before, "modeling edits nothing");

  // ✨ keeps its own coach line (shared/spotlight.mjs CONTROLS).
  d.run(`PIPCORE.spot.controlPress("fix")`);
  assert.equal(d.spot().line, "✨ — after two words, tap ✨. It adds only the little words, like is, a, the — never a guess. Say it along with Pip.");

  // The child's presses arrive as 'tap' frames from the child's device and count.
  await push(d.relay, d.userKey, { k: "tap", t: CELL_A, s: startedAt });
  await push(d.relay, d.userKey, { k: "tap", t: CELL_A, s: startedAt });
  await push(d.relay, d.userKey, { k: "tap", t: CELL_B, s: startedAt });
  await push(d.relay, d.userKey, { k: "tap", t: CELL_B, s: startedAt + 99 }); // another session
  await until(() => d.spot().count === "Zed pressed 3 times", "three presses counted");
  assert.equal(d.spot().marks[CELL_A].count, 2);
  assert.equal(d.spot().marks[CELL_B].count, 1);
  // A supporter's own tap on the child's board is a model, never a child press.
  assert.equal((await d.sent()).filter((m) => m.k === "tap").length, 0);
});

test("SP-5: a child's board ignores 'tap' frames (they are the supporter's counts), and a plain 'model' without a session still lights", async () => {
  const d = await fresh();
  await push(d.relay, d.userKey, { k: "tap", t: CELL_A, s: 1 });
  await sleep(100);
  assert.equal(d.spot().marks[CELL_A].count, 0);
});
