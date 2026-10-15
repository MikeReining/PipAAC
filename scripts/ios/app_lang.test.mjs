/**
 * 044 E9 — the remaining Settings rows (scripts/ios/app_lang.mjs and the
 * app.mjs keyboard/settings hooks): ST-8 Spotlight look, SB-7 Smart bar
 * families, SB-9 outline likely next words, KB-7 device keyboard.
 *
 * The BUILT bundle (what ships) runs in a bare vm realm over person A's
 * db file. A TWIN db file (a copy of the same fresh db) is driven by the
 * REAL web modules (public/shared/groups.mjs, families.mjs, funnel.mjs)
 * imported directly under node, called the way the web's click handlers
 * call them. Assertions compare rows read from the files (never the
 * facade's return values): same learner_profile row, same sync_op
 * kind+args, same family rows. The outline cell set is compared with the
 * rule of board/grid.js applyLikely, written out against the same db
 * through the web's own functions.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";

import { setSetting, entityForSense } from "../../public/shared/groups.mjs";
import { setFamilyItems, families as webFamilies, familyItems as webFamilyItems } from "../../public/shared/families.mjs";
import { stripRanked } from "../../public/shared/funnel.mjs";
import { coreCells } from "../../public/shared/coremove.mjs";

const root = new URL("../../", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "pip-lang-"));
const file = join(dir, "user.sqlite");
const twinFile = join(dir, "twin.sqlite");
copyFileSync(join(root, "public/fresh_db.sqlite"), file);
copyFileSync(join(root, "public/fresh_db.sqlite"), twinFile);

const writer = new DatabaseSync(file);
const reader = new DatabaseSync(file);
const twin = new DatabaseSync(twinFile);
const bindable = (v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);
const host = {
  log: () => {},
  emit: () => {},
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
const ctx = vm.createContext({ __pipHost: host });
vm.runInContext(readFileSync(join(root, "apps/PipAAC/PipAAC/Core/pip-core.js"), "utf8"), ctx);
const facade = (ns) => new Proxy({}, {
  get: (_, fn) => (...args) => {
    ctx.__a = JSON.stringify(args);
    const out = vm.runInContext(`JSON.stringify(PIPCORE.${ns}.${String(fn)}(...JSON.parse(__a)))`, ctx);
    return out === undefined ? undefined : JSON.parse(out);
  },
});
const app = facade("app");
const lang = facade("lang");
const spot = facade("spot");
const settingsUi = facade("settingsUi");

/** A web-shaped db handle (db.js adapt()) over a node:sqlite file. */
const webDb = (sqlite) => ({
  exec: (sql) => sqlite.exec(sql),
  prepare: (sql) => ({
    run: (...p) => sqlite.prepare(sql).run(...p.map(bindable)),
    all: (...p) => sqlite.prepare(sql).all(...p.map(bindable)),
  }),
  all: (sql, p = []) => sqlite.prepare(sql).all(...p.map(bindable)),
});
const web = webDb(twin);
const seen = webDb(reader);

const catalog = readFileSync(join(root, "public/catalog.json"), "utf8");
const phrasesText = readFileSync(join(root, "public/suggest_answers.en.json"), "utf8");
const phrases = JSON.parse(phrasesText);
const { appId } = app.appOpen(1, catalog, phrasesText, null);

const q = (sql, ...p) => reader.prepare(sql).all(...p);
const qt = (sql, ...p) => twin.prepare(sql).all(...p);
const opsOf = (sqlite) => sqlite.prepare(
  "SELECT kind, args FROM sync_op ORDER BY seq").all().map((r) => [r.kind, JSON.parse(r.args)]);
const profile = (sqlite) => sqlite.prepare("SELECT * FROM learner_profile WHERE id = 'prf_local'").all()[0];

/* ---------------- the synced settings: same row, same ops ---------------- */

test("ST-8 / SB-9 / KB-7: each setting writes the web's learner_profile column and op", () => {
  const writes = [
    ["spot_pulse", 1], ["spot_dim", 30], ["spot_dim", 60], ["model_speaks", 1],
    ["highlight_next", 1], ["keyboard_mode", "device"], ["keyboard_mode", "pip"],
    ["highlight_next", 0], ["spot_pulse", 0], ["model_speaks", 0], ["spot_dim", 45],
  ];
  for (const [k, v] of writes) {
    app.appSetSetting(appId, k, v);          // the iPad's Settings row
    setSetting(web, k, v);                   // the web's click handler
  }
  assert.deepEqual(profile(reader), profile(twin), "the whole profile row is identical");
  const mine = opsOf(reader).filter((o) => o[0] === "set_setting");
  assert.deepEqual(mine, opsOf(twin).filter((o) => o[0] === "set_setting"));
  assert.deepEqual(mine.map((o) => o[1].key), writes.map((w) => w[0]));
  // A value outside the allowlist is refused by the shared owner, not Swift.
  assert.throws(() => app.appSetSetting(appId, "spot_hacked", 1));
});

test("ST-8: the settings model carries the new columns", () => {
  app.appSetSetting(appId, "spot_pulse", 1);
  app.appSetSetting(appId, "spot_dim", 30);
  app.appSetSetting(appId, "model_speaks", 1);
  const m = app.appSettings(appId);
  assert.equal(m.spotPulse, true);
  assert.equal(m.spotDim, 30);
  assert.equal(m.modelSpeaks, true);
  assert.equal(m.keyboardMode, "pip");
  assert.equal(m.highlightNext, false);
  assert.equal(q("SELECT spot_pulse p, spot_dim d, model_speaks m FROM learner_profile")[0].d, 30);
});

test("ST-8: the Spotlight page copy and the Look summary are the web's", () => {
  const device = lang.spotlightPage(appId, { role: null, name: "Maya" });
  assert.equal(device.roleNow, "This is Maya's board.");
  assert.equal(device.modelHint,
    "A spotlight started here glows on this board. Started from a supporter's device, nothing glows here until the supporter taps a word. Then that word lights up for a few seconds.");
  assert.equal(device.lookSummary, "Pulsing glow · dim a lot");
  const sup = lang.spotlightPage(appId, { role: "partner", name: "" });
  assert.equal(sup.roleNow, "This is a supporter's device.");
  assert.match(sup.modelHint, /^Start a spotlight here\. Its words light up on this screen, with a number for each time this person presses it\./);
  app.appSetSetting(appId, "spot_pulse", 0);
  app.appSetSetting(appId, "spot_dim", 60);
  assert.equal(lang.spotlightPage(appId, {}).lookSummary, "Steady glow · dim a little");
  const hub = settingsUi.hub(appId, {});
  const sec = hub.sections.find((s) => s.id === "spotlight");
  assert.equal(sec.title, "Spotlight");
  assert.equal(sec.intro, "Light up the words you're teaching. Everything else dims, but still speaks.");
  assert.equal(sec.summary, "Off");
});

test("ST-8: the iPad Spotlight reads the columns - dim and pulse change with the setting", () => {
  const key = "sense:sns_0013", other = "sense:sns_0128";
  app.appSetSetting(appId, "spot_dim", 45);
  app.appSetSetting(appId, "spot_pulse", 0);
  vm.runInContext(`PIPCORE.spot.attach(PIPCORE.makeDb(1), null)`, ctx);
  // A session on this board (the way the web starts one).
  vm.runInContext(
    `PIPCORE.spotlight.startSession(PIPCORE.makeDb(1), { name: "t", targets: new Set(["${key}"]), by_supporter: 0 })`, ctx);
  const keys = JSON.stringify([key, other]);
  let st = spot.state(appId, keys);
  assert.equal(st.dim, 0.45);
  assert.equal(st.marks[key].glow, true);
  assert.equal(st.marks[key].pulse, false);
  assert.equal(st.marks[other].dimmed, true);
  app.appSetSetting(appId, "spot_dim", 30);
  app.appSetSetting(appId, "spot_pulse", 1);
  st = spot.state(appId, keys);
  assert.equal(st.dim, 0.3, "A lot = 30% opacity");
  assert.equal(st.marks[key].pulse, true, "the pulsing glow");
  assert.equal(settingsUi.hub(appId, {}).sections.find((s) => s.id === "spotlight").summary.startsWith("On · t · until"), true);
  vm.runInContext(`PIPCORE.spotlight.endSession(PIPCORE.makeDb(1))`, ctx);
  app.appSetSetting(appId, "spot_dim", 45);
  app.appSetSetting(appId, "spot_pulse", 0);
});

/* ---------------- SB-7 families ---------------- */

test("SB-7: the family list, editor and Save are the web's functions", () => {
  const list = lang.families(appId);
  assert.deepEqual(list.map((f) => f.id), webFamilies(seen).map((f) => f.id), "same families, same order");
  assert.ok(list.length > 0);
  const fam = webFamilies(seen)[0];
  const open = lang.familyOpen(appId, fam.id);
  assert.equal(open.title, `${fam.name} — fixed order`);
  assert.deepEqual(open.items.map((i) => [i.kind, i.id]),
    webFamilyItems(seen, fam.id, "en").map((i) => [i.kind, i.id]));

  // Reverse the order, drop one, add "want" — then Save.
  const items = [...open.items].reverse().slice(1);
  const hit = lang.familyResolve(appId, "want");
  assert.deepEqual(hit, { ok: true, item: { kind: "sense", id: "sns_0013", label: "want" } });
  items.push(hit.item);
  assert.deepEqual(lang.familyResolve(appId, "zzzq"), { ok: false, toast: "No such word" });

  const before = opsOf(reader).length;
  const out = lang.familySave(appId, fam.id, items);
  assert.equal(out.toast, "Family saved");
  setFamilyItems(web, fam.id, items.map((i) => ({ kind: i.kind, id: i.id })));   // the web's #fam-save
  const rows = (sqlite) => sqlite.prepare(
    "SELECT position, item_kind, item_id FROM bar_family_item WHERE family_id = ? ORDER BY position").all(fam.id);
  assert.deepEqual(rows(reader), rows(twin));
  assert.deepEqual(rows(reader).map((r) => r.item_id), items.map((i) => i.id));
  const newOps = opsOf(reader).slice(before);
  assert.deepEqual(newOps, [["set_family_items", { familyId: fam.id, items: items.map((i) => ({ kind: i.kind, id: i.id })) }]]);
  assert.deepEqual(newOps[0], opsOf(twin).at(-1));
});

/* ---------------- SB-9 the outline ---------------- */

/** board/grid.js applyLikely, against the same db through the web's own
 *  functions: the cells the web would toggle `.likely` on. */
function webLikely(sentence, locale = "en") {
  const geom = app.appBoard(appId);
  const cellEls = new Set(geom.cells.filter((c) => c.type === "word").map((c) => c.id));
  const next = new Set();
  const sents = sentence.map((s) => ({ kind: s.kind, id: s.id }));
  for (const c of stripRanked(seen, sents, Date.now(), locale, phrases).shown) {
    if (c.kind !== "sense") continue;
    const id = cellEls.has(c.id) ? c.id : (entityForSense(seen, c.id)?.id ?? null);
    if (id === null || !cellEls.has(id)) continue;
    next.add(id);
    if (next.size === 3) break;
  }
  return [...next];
}
const tap = (id, text) => app.appTap(appId, { kind: "sense", id, text });

test("SB-9: the outline is off by default, then exactly applyLikely's cells", () => {
  app.appClear(appId);
  let r = tap("sns_0013", "want");
  assert.deepEqual(r.likely, [], "off by default (default OFF)");
  app.appSetSetting(appId, "highlight_next", 1);
  r = tap("sns_0128", "apple");               // two words in the bar
  const expected = webLikely([{ kind: "sense", id: "sns_0013" }, { kind: "sense", id: "sns_0128" }]);
  assert.deepEqual(r.likely, expected);
  assert.ok(r.likely.length <= 3);
  const drawn = new Set(r.board.cells.filter((c) => c.type === "word").map((c) => c.id));
  for (const id of r.likely) assert.ok(drawn.has(id), `${id} is a drawn board cell`);

  app.appClear(appId);
  r = tap("sns_0013", "want");
  const afterWant = webLikely([{ kind: "sense", id: "sns_0013" }]);
  assert.deepEqual(r.likely, afterWant);
  assert.ok(r.likely.length > 0, "'want' invites some board words next");
  assert.deepEqual(app.appSettings(appId).highlightNext, true);

  // Never with an empty bar, in a group, or with the keyboard open.
  app.appClear(appId);
  assert.deepEqual(app.appBoard(appId) && app.appRepaint(appId).likely, []);
  tap("sns_0013", "want");
  assert.ok(app.appRepaint(appId).likely.length > 0);
  assert.deepEqual(app.appKbOpen(appId).likely, [], "keyboard open: no outline");
  assert.ok(app.appKbClose(appId).likely.length > 0);
  app.appSetSetting(appId, "highlight_next", 0);
  assert.deepEqual(app.appRepaint(appId).likely, []);
  app.appClear(appId);
});

/* ---------------- KB-7 device keyboard ---------------- */

test("KB-7: device mode keeps the answer keys and types through the same commit path", () => {
  app.appClear(appId);
  const pipKb = app.appKbOpen(appId).kb;
  assert.equal(pipKb.mode, "pip");
  assert.ok(pipKb.keys.length > 20);
  app.appKbClose(appId);

  app.appSetSetting(appId, "keyboard_mode", "device");
  const dev = app.appKbOpen(appId).kb;
  assert.equal(dev.mode, "device");
  assert.deepEqual(dev.keys.map((k) => [k.slot, k.kind, k.senseId]),
    [[8, "partner", "sns_0073"], [9, "partner", "sns_0072"]], "answer keys at columns 9-10 of row 1");

  // Typing without a word-ender only fills the buffer (the strip completes it).
  let r = app.appKbDevice(appId, "wa");
  assert.equal(r.typing, "wa");
  assert.equal(r.rest, "wa");
  assert.equal(r.bar.length, 0);
  // A space commits the word and leaves the field empty — the Pip-key result.
  r = app.appKbDevice(appId, "want ");
  assert.equal(r.rest, "");
  assert.equal(r.typing, null);
  assert.deepEqual(r.bar.map((c) => c.display), ["Want"]);
  // A pasted run: "to go" + "." keep the unfinished tail in the field.
  r = app.appKbDevice(appId, "to go. ju");
  assert.equal(r.rest, "ju");
  assert.equal(r.typing, "ju");
  assert.deepEqual(r.bar.map((c) => c.display), ["Want", "to", "go."]);
  app.appKbPress(appId, "Enter");

  // The same keystrokes through the Pip keys give the same bar.
  const deviceBar = app.appRepaint(appId).bar.map((c) => c.display);
  app.appClear(appId);
  app.appSetSetting(appId, "keyboard_mode", "pip");
  app.appKbClose(appId);
  app.appKbOpen(appId);
  for (const ch of "want to go. ju") app.appKbPress(appId, ch);
  app.appKbPress(appId, "Enter");
  assert.deepEqual(app.appRepaint(appId).bar.map((c) => c.display), deviceBar);
  assert.equal(q("SELECT keyboard_mode m FROM learner_profile")[0].m, "pip");
  app.appKbClose(appId);
  app.appClear(appId);
});
