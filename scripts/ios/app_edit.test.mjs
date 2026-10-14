/**
 * 044 E1 — the Edit-mode facade (scripts/ios/app_edit.mjs) leaves exactly
 * the expected rows in sync_op and the expected state in the tables.
 * Assertions read the DATABASE through a second connection, never the
 * facade's own return values (the code grading its own homework).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";

const root = new URL("../../", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "pip-edit-"));
const file = join(dir, "user.sqlite");
copyFileSync(join(root, "public/fresh_db.sqlite"), file);

const writer = new DatabaseSync(file);
const reader = new DatabaseSync(file); // the instrument the facade cannot influence
const bindable = (v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);
const host = {
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
// The BUILT bundle (what ships) in a bare vm realm, like sync_host.test.mjs.
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
const edit = facade("edit");

const catalog = readFileSync(join(root, "public/catalog.json"), "utf8");
const { appId } = app.appOpen(1, catalog, null, null);

const q = (sql, ...p) => reader.prepare(sql).all(...p);
const maxSeq = () => q("SELECT COALESCE(MAX(seq),0) AS m FROM sync_op")[0].m;
/** The pending ops recorded since `since`, as [kind, args]. */
const opsSince = (since) => q(
  "SELECT kind, args FROM sync_op WHERE seq > ? AND relay_seq IS NULL ORDER BY seq", since,
).map((r) => [r.kind, JSON.parse(r.args)]);
const cells = () => Object.fromEntries(
  app.appBoard(appId).cells.filter((c) => c.type === "word").map((c) => [c.id, c.slot]));

let ENT = null; // seated lazily: a seated person evicts "mom", which skews the swap test (web slotMap quirk)
const seat = () => { ENT ??= edit.testSeedPerson(appId, { name: "Nana" }).id; };

test("enter Edit mode reveals ghosts; leaving restores the child view", () => {
  const st = edit.editOpen(appId);
  assert.equal(st.editing, true);
  const before = maxSeq();
  edit.cardToggleHidden(appId, { id: "sns_0013" });
  assert.equal(app.appBoard(appId).cells.find((c) => c.id === "sns_0013")?.hidden, true,
    "adult view shows the hidden word as a ghost");
  edit.editClose(appId);
  const child = app.appBoard(appId).cells;
  assert.ok(!child.some((c) => c.id === "sns_0013"), "the child sees an empty cell");
  assert.deepEqual(opsSince(before), [["set_mask", { senseId: "sns_0013", hidden: true }]]);
  edit.editOpen(appId);
  edit.cardToggleHidden(appId, { id: "sns_0013" });
  assert.deepEqual(opsSince(before).at(-1), ["set_mask", { senseId: "sns_0013", hidden: false }]);
  assert.equal(q("SELECT status FROM sense_mask WHERE sense_id='sns_0013'")[0].status, "shown");
  edit.editClose(appId);
});

test("moving a word swaps the two cells; Undo swaps back", () => {
  edit.editOpen(appId);
  const c0 = cells();
  const a = "sns_0013"; // want
  const bId = Object.keys(c0).find((id) => id !== a && c0[id] === c0[a] + 1);
  const before = maxSeq();
  const st = edit.boardDrop(appId, { kind: "sense", id: a, toSlot: c0[bId] });
  const ops = opsSince(before);
  assert.deepEqual(ops.map((o) => o[0]), ["move_core"]);
  assert.deepEqual(ops[0][1], { layout: "grid60", kind: "sense", id: a, toSlot: c0[bId] });
  const rows = q("SELECT item_id, slot_index FROM core_override WHERE layout='grid60'");
  const slotOf = (id) => rows.find((r) => r.item_id === id)?.slot_index;
  assert.equal(slotOf(a), c0[bId]);
  assert.equal(slotOf(bId), c0[a]);
  const c1 = cells();
  assert.equal(c1[a], c0[bId]);
  assert.equal(c1[bId], c0[a]);
  edit.editUndo(appId, { token: st.toast.undo });
  assert.deepEqual(cells()[a], c0[a]);
  assert.equal(q("SELECT count(*) AS n FROM core_override WHERE layout='grid60' AND item_id IN (?,?)", a, bId)[0].n, 0);
  // dropping a word on its own cell is a no-op
  const mark = maxSeq();
  edit.boardDrop(appId, { kind: "sense", id: a, toSlot: c0[a] });
  assert.equal(maxSeq(), mark);
  edit.editClose(appId);
});

test("group page: remove with Undo, swap, and move", () => {
  const g = q(`SELECT group_id FROM group_cell WHERE layout='grid60' AND page=0
               GROUP BY group_id HAVING count(*) >= 3 ORDER BY group_id LIMIT 1`)[0].group_id;
  edit.editOpen(appId);
  app.appGroupPage(appId, g, 0);
  const items = q(`SELECT item_kind, item_id, slot_index FROM group_cell
                   WHERE group_id=? AND layout='grid60' AND page=0 ORDER BY slot_index`, g);
  const [x, y, z] = items;

  const b1 = maxSeq();
  edit.groupDrop(appId, { groupId: g, kind: x.item_kind, id: x.item_id, toSlot: y.slot_index });
  assert.deepEqual(opsSince(b1).map((o) => o[0]), ["swap_items"]);
  const at = (it) => q(`SELECT slot_index FROM group_cell WHERE group_id=? AND layout='grid60'
                        AND item_kind=? AND item_id=?`, g, it.item_kind, it.item_id)[0].slot_index;
  assert.equal(at(x), y.slot_index);
  assert.equal(at(y), x.slot_index);

  const free = q(`SELECT slot_index FROM group_cell WHERE group_id=? AND layout='grid60' AND page=0`, g)
    .map((r) => r.slot_index);
  const geomFree = Array.from({ length: 60 }, (_, i) => i)
    .find((i) => !free.includes(i) && app.appGroupPage(appId, g, 0).cells[i].type === "empty"
      && !app.appGroupPage(appId, g, 0).cells[i].reserved);
  const b2 = maxSeq();
  edit.groupDrop(appId, { groupId: g, kind: z.item_kind, id: z.item_id, toSlot: geomFree });
  const moved = opsSince(b2);
  assert.deepEqual(moved.map((o) => o[0]), ["move_item"]);
  assert.equal(at(z), geomFree);

  const b3 = maxSeq();
  const st = edit.leaveGroup(appId, { kind: z.item_kind, id: z.item_id, groupId: g, label: "w" });
  assert.deepEqual(opsSince(b3).map((o) => o[0]), ["remove_item"]);
  assert.equal(q("SELECT count(*) AS n FROM group_membership WHERE group_id=? AND item_id=?", g, z.item_id)[0].n, 0);
  edit.editUndo(appId, { token: st.toast.undo });
  assert.deepEqual(opsSince(b3).map((o) => o[0]), ["remove_item", "place_item"]);
  assert.equal(q("SELECT count(*) AS n FROM group_membership WHERE group_id=? AND item_id=?", g, z.item_id)[0].n, 1);
  edit.editClose(appId);
});
test("rename a personal word: one rename_entity op, row updated, no-ops record nothing", () => {
  seat();
  edit.editOpen(appId);
  const card = edit.cardOpen(appId, { kind: "entity", id: ENT }).card;
  assert.equal(card.canRename, true);
  const before = maxSeq();
  edit.cardRename(appId, { kind: "entity", id: ENT, name: "  Nana   Joy " });
  assert.deepEqual(opsSince(before), [["rename_entity", { id: ENT, name: "Nana Joy" }]]);
  assert.equal(q("SELECT spoken_name FROM personal_entity WHERE id=?", ENT)[0].spoken_name, "Nana Joy");
  const mid = maxSeq();
  edit.cardRename(appId, { kind: "entity", id: ENT, name: "Nana Joy" });
  edit.cardRename(appId, { kind: "entity", id: ENT, name: "   " });
  assert.equal(maxSeq(), mid, "empty or unchanged names write nothing");
  // a catalog word is not renamed on the card (web: "a new copy")
  edit.cardRename(appId, { kind: "sense", id: "sns_0013", name: "wish" });
  assert.equal(maxSeq(), mid);
  assert.ok(app.appBoard(appId).cells.some((c) => c.label === "Nana Joy"));
  edit.editClose(appId);
});

test("remove a personal word retires it; Undo restores it", () => {
  seat();
  edit.editOpen(appId);
  const before = maxSeq();
  const st = edit.cardRemove(appId, { id: ENT });
  assert.equal(q("SELECT status FROM personal_entity WHERE id=?", ENT)[0].status, "retired");
  assert.equal(st.toast.text, "Removed Nana Joy");
  assert.ok(st.toast.undo);
  edit.editUndo(appId, { token: st.toast.undo });
  assert.equal(q("SELECT status FROM personal_entity WHERE id=?", ENT)[0].status, "active");
  assert.deepEqual(opsSince(before).map((o) => o[0]), ["retire_entity", "restore_entity"]);
  const again = maxSeq();
  edit.editUndo(appId, { token: st.toast.undo }); // spent token: nothing
  assert.equal(maxSeq(), again);
  edit.editClose(appId);
});

test("a person moves with place_cell", () => {
  seat();
  edit.editOpen(appId);
  const c0 = cells();
  const target = c0.sns_0013;
  const before = maxSeq();
  edit.boardDrop(appId, { kind: "entity", id: ENT, toSlot: target });
  assert.deepEqual(opsSince(before).map((o) => o[0]), ["place_cell"]);
  assert.equal(cells()[ENT], target);
  edit.editClose(appId);
});

