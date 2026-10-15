/**
 * 044 E8 — Swap (LW-8), Colour (LW-13), "Sounds wrong" (LW-20), the
 * Library's Suggested tab (LW-17) and the editor save status (LW-22), in
 * the BUILT core (what ships) in a bare vm realm with a fake host.
 *
 * Instruments the facade cannot influence:
 *  - a second connection to the iPad's database file (rows, sync_op);
 *  - a TWIN database (VACUUM INTO of the same starting state) on which the
 *    WEB's own functions (public/shared/*.mjs, imported directly) do the
 *    same gesture — the iPad's resulting rows and recorded ops must equal
 *    the twin's;
 *  - the fake Worker's request log for the flag (no paid API is reachable).
 *
 * Run: scripts/test.sh scripts/ios/app_card.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { placeOnBoard } from "../../public/shared/coremove.mjs";
import { replaceGroupItem } from "../../public/shared/groups_ops.mjs";
import { createEntity, setEntityRole, activeLayout } from "../../public/shared/groups.mjs";
import { librarySuggested } from "../../public/shared/library.mjs";
import { editorStatus } from "../../public/board/editor-find.js";

const root = new URL("../../", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "pip-card-"));
const file = join(dir, "user.sqlite");
copyFileSync(join(root, "public/fresh_db.sqlite"), file);

const writer = new DatabaseSync(file);
const reader = new DatabaseSync(file);
const bindable = (v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);
const MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 1, 2, 3, 4]);
const USER = "11111111-2222-4333-8444-555555555555";

/* ---------------- the fake Worker + host ---------------- */

const worker = { log: [], flagStatus: 204 };
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const events = [];
const keystore = new Map();
const cancelled = new Set();
const timers = new Map();
let ctx;
const deliver = (fn) => setImmediate(fn);
async function workerHandle({ url, method, headers, body }) {
  const u = new URL(url);
  const text = body ? Buffer.from(body, "base64").toString("utf8") : "";
  worker.log.push({ path: u.pathname, method, headers, body: text ? JSON.parse(text) : null });
  const json = (o) => ({ status: 200, headers: [["content-type", "application/json"]],
    body: b64u(Buffer.from(JSON.stringify(o))) });
  switch (u.pathname) {
    case "/api/v1/trial/start": return json({ endsAt: Date.now() + 5 * 86_400_000 });
    case "/api/v1/trial": return json({ licensed: false, endsAt: Date.now() + 5 * 86_400_000 });
    case "/api/v1/voice/tile/flag": return { status: worker.flagStatus, headers: [], body: "" };
    case "/api/v1/voice/tile/replaced": return json({ ids: [], next: 1 });
    default: return { status: 404, headers: [], body: "" };
  }
}
const ops = {
  sha256: async ({ b64: x }) => b64u(await crypto.subtle.digest("SHA-256", Buffer.from(x, "base64url"))),
  "keystore.get": async ({ name }) => {
    const v = keystore.get(name);
    return v === undefined ? null : { k: "json", text: v };
  },
  "keystore.put": async ({ name, text }) => { keystore.set(name, text); },
  "keystore.del": async ({ name }) => { keystore.delete(name); },
  cache: async (a) => (a.op === "get" ? null : a.op === "list" ? [] : { file: `${dir}/c.mp3` }),
  fetch: async (req) => ({ statusText: "", ...(await workerHandle(req)) }),
};
const host = {
  baseURL: "https://worker.test",
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
  call(op, id, argsJson) {
    Promise.resolve().then(() => {
      if (!ops[op]) throw new Error(`fake host: no op ${op}`);
      return ops[op](JSON.parse(argsJson));
    }).then((v) => v, (e) => e).then((out) => {
      deliver(() => {
        if (cancelled.has(id)) return;
        if (out instanceof Error) ctx.__pipSettle(id, false, out.message);
        else ctx.__pipSettle(id, true, out === undefined ? "" : JSON.stringify(out));
      });
    });
  },
  cancel: (id) => { cancelled.add(id); },
  timerStart: (tid, ms) => {
    timers.set(tid, setTimeout(() => { timers.delete(tid); deliver(() => ctx.__pipFire(tid)); }, ms));
  },
  timerCancel: (tid) => { clearTimeout(timers.get(tid)); timers.delete(tid); },
  wsOpen() {}, wsSend() {}, wsClose() {},
  emit: (name, json) => { events.push({ name, ...JSON.parse(json) }); },
};
ctx = vm.createContext({ __pipHost: host, crypto: globalThis.crypto });
vm.runInContext(readFileSync(join(root, "apps/PipAAC/PipAAC/Core/pip-core.js"), "utf8"), ctx);
const facade = (ns) => new Proxy({}, {
  get: (_, fn) => (...args) => {
    ctx.__a = JSON.stringify(args);
    const out = vm.runInContext(`JSON.stringify(PIPCORE.${ns}.${String(fn)}(...JSON.parse(__a)))`, ctx);
    return out === undefined ? undefined : JSON.parse(out);
  },
});
const app = facade("app");
const edit = facade("edit");
const card = facade("card");
const lib = facade("lib");
const say = facade("say");

const catalog = readFileSync(join(root, "public/catalog.json"), "utf8");
const { appId } = app.appOpen(1, catalog, null, null);

/* ---------------- helpers ---------------- */

const q = (sql, ...p) => reader.prepare(sql).all(...p);
const maxSeq = () => q("SELECT COALESCE(MAX(seq),0) AS m FROM sync_op")[0].m;
const opsSince = (since) => q(
  "SELECT kind, args FROM sync_op WHERE seq > ? ORDER BY seq", since,
).map((r) => [r.kind, JSON.parse(r.args)]);
/** A twin of the iPad's database right now, for the web's functions to act on. */
let twinN = 0;
const twin = () => {
  const p = join(dir, `twin${twinN++}.sqlite`);
  writer.exec(`VACUUM INTO '${p}'`);
  return new DatabaseSync(p);
};
const rows = (d, sql, ...p) => d.prepare(sql).all(...p);
const tableState = (d) => ({
  cells: rows(d, "SELECT group_id, layout, page, slot_index, item_kind, item_id FROM group_cell ORDER BY 1,2,3,4,5,6"),
  members: rows(d, "SELECT group_id, item_kind, item_id FROM group_membership ORDER BY 1,2,3"),
  overrides: rows(d, "SELECT * FROM core_override ORDER BY 1,2,3,4"),
  roles: rows(d, "SELECT id, fitzgerald_role FROM personal_entity ORDER BY id"),
});
const wait = async (pred, what, ms = 4000) => {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) assert.fail(`timed out waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
};

/* ---------------- LW-8 Swap ---------------- */

test("LW-8 swap on the main board = web's placeOnBoard: same rows, same op, Undo restores", () => {
  edit.editOpen(appId);
  const board = app.appBoard(appId).cells.filter((c) => c.type === "word");
  const target = board.find((c) => c.id === "sns_0013"); // want
  const c = edit.cardOpen(appId, { kind: "sense", id: target.id, swap: true }).card;
  assert.deepEqual(c.swap, { where: "main", slot: target.slot }, "Swap is offered where the word holds a home cell");
  const list = card.swapList(appId, { kind: "sense", id: target.id });
  assert.equal(list.head.label, "want");
  assert.ok(list.rows.length > 0 && list.rows.length <= 30);
  const pick = list.rows[0];
  assert.ok(!board.some((b) => b.id === pick.id), "only words with no home cell are offered");

  const T = twin();
  const geom = "grid60";
  const twinFrom = T.prepare("SELECT COALESCE(MAX(seq),0) AS m FROM sync_op").get().m;
  placeOnBoard(T, geom, pick.kind, pick.id, target.slot, { anchors: new Set() });
  const webOps = T.prepare("SELECT kind, args FROM sync_op WHERE seq > ? ORDER BY seq").all(twinFrom)
    .map((r) => [r.kind, JSON.parse(r.args)]);
  const before = maxSeq();
  const st = card.swapPick(appId, {
    kind: "sense", id: target.id, label: "want", slot: target.slot,
    pickKind: pick.kind, pickId: pick.id, pickLabel: pick.label,
  });
  assert.equal(st.toast.text, `Placed ${pick.label}`);
  assert.deepEqual(tableState(reader), tableState(T), "the iPad's rows equal what the web's function leaves");
  const ops = opsSince(before);
  const noClock = (o) => o.map(([k, a]) => [k, JSON.parse(JSON.stringify(a, (key, v) => (key === "added_at" ? 0 : v)))]);
  assert.deepEqual(noClock(ops), noClock(webOps), "the recorded ops are the web function's, in order (clock aside)");
  assert.equal(ops.at(-1)[0], "place_cell");
  assert.deepEqual(ops.at(-1)[1], { layout: geom, kind: pick.kind, id: pick.id, toSlot: target.slot });
  assert.ok(app.appBoard(appId).cells.some((b) => b.id === pick.id && b.slot === target.slot));
  // Undo puts the first word back.
  edit.editUndo(appId, { token: st.toast.undo });
  assert.ok(app.appBoard(appId).cells.some((b) => b.id === target.id && b.slot === target.slot));
  edit.editClose(appId);
});

test("LW-8 swap in a group = web's replaceGroupItem: remove_item + place_item, Undo restores", () => {
  const g = q(`SELECT group_id FROM group_cell WHERE layout='grid60' AND page=0
               GROUP BY group_id HAVING count(*) >= 3 ORDER BY group_id LIMIT 1`)[0].group_id;
  edit.editOpen(appId);
  app.appGroupPage(appId, g, 0);
  const occ = q(`SELECT item_kind, item_id, page, slot_index FROM group_cell
                 WHERE group_id=? AND layout='grid60' AND page=0 ORDER BY slot_index LIMIT 1`, g)[0];
  const c = edit.cardOpen(appId, { kind: occ.item_kind, id: occ.item_id, swap: true }).card;
  assert.deepEqual(c.swap, { where: "group", groupId: g, page: occ.page, slot: occ.slot_index });
  const list = card.swapList(appId, { kind: occ.item_kind, id: occ.item_id, groupId: g });
  const members = new Set(q("SELECT item_kind||':'||item_id AS k FROM group_membership WHERE group_id=?", g).map((r) => r.k));
  assert.ok(list.rows.length && list.rows.every((r) => !members.has(r.key)), "only non-members are offered");
  const pick = list.rows[0];

  const T = twin();
  replaceGroupItem(T, g, { kind: occ.item_kind, id: occ.item_id }, { kind: pick.kind, id: pick.id },
    { page: occ.page, slot_index: occ.slot_index });
  const before = maxSeq();
  const st = card.swapPick(appId, {
    kind: occ.item_kind, id: occ.item_id, label: "old", groupId: g, page: occ.page, slot: occ.slot_index,
    pickKind: pick.kind, pickId: pick.id, pickLabel: pick.label,
  });
  assert.equal(st.toast.text, `Replaced old with ${pick.label}`);
  assert.deepEqual(tableState(reader), tableState(T));
  assert.deepEqual(opsSince(before).map((o) => o[0]), ["remove_item", "place_item"]);
  assert.deepEqual(q(`SELECT item_id FROM group_cell WHERE group_id=? AND layout='grid60' AND page=? AND slot_index=?`,
    g, occ.page, occ.slot_index).map((r) => r.item_id), [pick.id]);
  edit.editUndo(appId, { token: st.toast.undo });
  assert.deepEqual(q(`SELECT item_id FROM group_cell WHERE group_id=? AND layout='grid60' AND page=? AND slot_index=?`,
    g, occ.page, occ.slot_index).map((r) => r.item_id), [occ.item_id]);
  edit.editClose(appId);
});

test("LW-8 a word with no cell on this surface gets no Swap", () => {
  edit.editOpen(appId);
  const off = card.swapList(appId, { kind: "sense", id: "sns_0013" }).rows[0];
  const c = edit.cardOpen(appId, { kind: off.kind, id: off.id, swap: true }).card;
  assert.equal(c.swap, null, "an off-board word is not in a home cell");
  edit.editClose(appId);
});

/* ---------------- LW-13 Colour ---------------- */

let ENT;
test("LW-13 colour of a personal word = web's setEntityRole: same row, one set_entity_role op", () => {
  ENT = edit.testSeedPerson(appId, { name: "Nana" }).id;
  edit.editOpen(appId);
  const c = edit.cardOpen(appId, { kind: "entity", id: ENT }).card;
  assert.equal(c.canColour, true);
  assert.deepEqual(c.kinds.map((k) => [k.role, k.label]), [
    ["None", "Thing"], ["Yellow", "Person"], ["Green", "Action"], ["Blue", "Describing word"],
    ["Pink", "Little word"], ["Purple", "Question word"], ["Red", "Safety word"],
  ]);
  assert.equal(c.kindName, "Person"); // seeded as Yellow
  const T = twin();
  setEntityRole(T, ENT, "Green");
  const before = maxSeq();
  const st = card.cardSetKind(appId, { id: ENT, role: "Green" });
  assert.deepEqual(tableState(reader), tableState(T));
  assert.deepEqual(opsSince(before), [["set_entity_role", { id: ENT, role: "Green" }]]);
  assert.equal(st.card.kindName, "Action");
  assert.equal(st.card.role, "Green");
  assert.equal(app.appBoard(appId).cells.find((b) => b.id === ENT)?.role, "Green", "the tile repaints in the new band");
  // The same colour again records nothing.
  const mark = maxSeq();
  card.cardSetKind(appId, { id: ENT, role: "Green" });
  assert.equal(maxSeq(), mark);
  // A catalog word has no Colour row, and the facade refuses to write one.
  const w = edit.cardOpen(appId, { kind: "sense", id: "sns_0013" }).card;
  assert.equal(w.canColour, false);
  assert.deepEqual(w.kinds, []);
  edit.editClose(appId);
});

/* ---------------- LW-17 Suggested ---------------- */

test("LW-17 the Suggested tab is the web's librarySuggested, with the web's words", () => {
  const web = librarySuggested(reader, "en");
  const st = lib.libraryState(appId, { tab: "suggested", q: "" });
  assert.deepEqual(st.rows.map((r) => r.id), web.map((r) => r.id));
  assert.equal(st.total, web.length);
  assert.deepEqual(st.tabs.map((t) => t.label), ["Added", "Suggested", "All"]);
  assert.equal(st.empty,
    "Nothing here yet — words the device hears appear once the child does not have them yet.");
});

/* ---------------- LW-20 Sounds wrong ---------------- */

test("LW-20 the flag is offered for a personal word on a shared voice, and POSTs the web's body", async () => {
  edit.editOpen(appId);
  const c = edit.cardOpen(appId, { kind: "entity", id: ENT }).card;
  assert.equal(c.canFlag, true, "default voice is a shared clip voice");
  assert.equal(edit.cardOpen(appId, { kind: "sense", id: "sns_0013" }).card.canFlag, false, "personal words only");
  say.identify(appId, USER);
  await wait(() => worker.log.some((r) => r.path === "/api/v1/trial"), "boot trial");
  worker.log.length = 0;
  events.length = 0;
  say.flagTile(appId, "Nana");
  await wait(() => events.some((e) => e.name === "card.flag"), "flag answer");
  const req = worker.log.find((r) => r.path === "/api/v1/voice/tile/flag");
  assert.ok(req, "the flag reached the (stub) Worker");
  assert.equal(req.method, "POST");
  assert.deepEqual(Object.keys(req.body).sort(), ["locale", "text", "user_id", "voice"].sort()
    .concat(req.body.license ? ["license"] : []).sort());
  assert.equal(req.body.text, "Nana");
  assert.equal(req.body.user_id, USER);
  assert.equal(req.body.locale, "en");
  const ev = events.find((e) => e.name === "card.flag");
  assert.equal(ev.ok, true);
  assert.equal(ev.toast, "Flagged for review — it keeps playing meanwhile");

  // The Worker refuses: the web's other sentence.
  worker.flagStatus = 500;
  events.length = 0;
  say.flagTile(appId, "Nana");
  await wait(() => events.some((e) => e.name === "card.flag"), "flag failure");
  assert.equal(events[0].ok, false);
  assert.equal(events[0].toast, "Couldn't flag — try again when you're online");
  worker.flagStatus = 204;
  edit.editClose(appId);
});

test("LW-20 a device voice has nothing shared to flag", () => {
  const dv = q("SELECT id FROM voice WHERE source = 'device_tts' LIMIT 1")[0];
  if (!dv) return; // no device voice in this catalog: nothing to assert
  writer.prepare("UPDATE voice SET status='active' WHERE id = ?").run(dv.id);
  writer.prepare("UPDATE learner_profile SET preferred_voice_id = ?").run(dv.id);
  app.appRepaint(appId);
  edit.editOpen(appId);
  assert.equal(edit.cardOpen(appId, { kind: "entity", id: ENT }).card.canFlag, false);
  edit.editClose(appId);
});

/* ---------------- LW-22 save status ---------------- */

test("LW-22 the status is the web's editorStatus over the same inputs", () => {
  const pend = () => q("SELECT COUNT(*) AS n FROM sync_op WHERE relay_seq IS NULL")[0].n;
  // Unlinked device: nothing syncs, so "Saved on this device".
  assert.deepEqual(card.editorStatusOf(appId, { linked: false, online: true }),
    editorStatus({ linked: false, pending: pend(), online: true, saveBlocked: false, saveError: false, dirty: false }));
  assert.equal(card.editorStatusOf(appId, { linked: false, online: true }).text, "Saved on this device");
  // Linked with ops the relay has not accepted: pending.
  assert.ok(pend() > 0, "earlier gestures left unaccepted ops");
  assert.deepEqual(card.editorStatusOf(appId, { linked: true, online: true }),
    { text: "Saving…", tone: "busy" });
  assert.deepEqual(card.editorStatusOf(appId, { linked: true, online: false }),
    { text: "Offline — will sync", tone: "warn" });
  // Everything accepted: ✓ Saved.
  writer.prepare("UPDATE sync_op SET relay_seq = seq WHERE relay_seq IS NULL").run();
  assert.deepEqual(card.editorStatusOf(appId, { linked: true, online: true }),
    { text: "✓ Saved", tone: "ok" });
  // A write that threw outranks the sync states.
  assert.deepEqual(card.editorStatusOf(appId, { linked: true, online: true, saveError: true }),
    { text: "Couldn't save — keep this open", tone: "warn" });
  // A fresh edit is pending again, then offline.
  edit.editOpen(appId);
  card.cardSetKind(appId, { id: ENT, role: "Blue" });
  assert.equal(card.editorStatusOf(appId, { linked: true, online: true }).text, "Saving…");
  edit.editClose(appId);
});
