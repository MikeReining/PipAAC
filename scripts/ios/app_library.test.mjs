/**
 * 044 E2 — the add-a-word / Library facade (scripts/ios/app_library.mjs)
 * leaves exactly the expected rows in sync_op and the expected state in
 * the tables. Assertions read the DATABASE through a second connection,
 * never the facade's own return values.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = new URL("../../", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "pip-lib-"));
const file = join(dir, "user.sqlite");
copyFileSync(join(root, "public/fresh_db.sqlite"), file);

const writer = new DatabaseSync(file);
const reader = new DatabaseSync(file);
const bindable = (v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);
globalThis.__pipHost = {
  dbExec: (_id, sql) => { writer.exec(sql); return null; },
  dbRun: (_id, sql, p = []) => ({ changes: Number(writer.prepare(sql).run(...p.map(bindable)).changes) }),
  dbAll: (_id, sql, p = []) => {
    const rows = writer.prepare(sql).all(...p.map(bindable));
    const columns = rows.length ? Object.keys(rows[0]) : [];
    return { columns, rows: rows.map((r) => columns.map((c) =>
      r[c] instanceof Uint8Array ? { __pipBytes: [...r[c]] } : r[c])) };
  },
};
globalThis.PIPCORE = await import("./core_entry.mjs");
const { app, edit, lib } = globalThis.PIPCORE;

const catalog = readFileSync(join(root, "public/catalog.json"), "utf8");
const { appId } = app.appOpen(1, catalog, null, null);

const q = (sql, ...p) => reader.prepare(sql).all(...p);
const maxSeq = () => q("SELECT COALESCE(MAX(seq),0) AS m FROM sync_op")[0].m;
const opsSince = (since) => q(
  "SELECT kind, args FROM sync_op WHERE seq > ? AND relay_seq IS NULL ORDER BY seq", since,
).map((r) => [r.kind, JSON.parse(r.args)]);
const members = (g, id) =>
  q("SELECT count(*) AS n FROM group_membership WHERE group_id=? AND item_id=?", g, id)[0].n;

test("typing offers the catalog match, with Make last; the exact match is the default", () => {
  const st = lib.addState(appId, { groupId: "grp_my_words", text: "pizza" });
  assert.equal(st.target.name, "My Words");
  assert.ok(st.matches.length >= 2, "a catalog match plus Make");
  assert.equal(st.matches.at(-1).kind, "make");
  const hi = st.matches.filter((m) => m.highlighted);
  assert.equal(hi.length, 1);
  assert.equal(hi[0].label.toLowerCase(), "pizza");
  assert.deepEqual(lib.addState(appId, { text: "  " }).matches, []);
  const none = lib.addState(appId, { text: "qzxv" });
  assert.equal(none.matches.length, 1, "nothing matches: Make alone");
  assert.equal(none.matches[0].highlighted, true);
});

test("placing a catalog match writes one place_item op and the membership + cell", () => {
  const pizza = lib.addState(appId, { groupId: "grp_breakfast", text: "pizza" })
    .matches.find((m) => m.kind === "sense" && m.label.toLowerCase() === "pizza");
  assert.ok(pizza);
  const before = maxSeq();
  const st = lib.addPlace(appId, {
    groupId: "grp_breakfast", kind: "sense", id: pizza.id, label: pizza.label });
  const ops = opsSince(before);
  assert.deepEqual(ops.map((o) => o[0]), ["place_item"]);
  assert.equal(ops[0][1].groupId, "grp_breakfast");
  assert.equal(ops[0][1].id, pizza.id);
  assert.equal(members("grp_breakfast", pizza.id), 1);
  const cell = ops[0][1].cells[0];
  assert.equal(q("SELECT count(*) AS n FROM group_cell WHERE group_id='grp_breakfast' AND item_id=? AND page=? AND slot_index=?",
    pizza.id, cell.page, cell.slot_index)[0].n, 1);
  assert.equal(st.toast.actionLabel, "Add to other groups");
  const again = lib.addState(appId, { groupId: "grp_breakfast", text: "pizza" })
    .matches.find((m) => m.id === pizza.id);
  assert.equal(again.here, true);
  assert.equal(again.action, "Open");
});

test("placing at a chosen empty cell lands exactly there; a taken cell changes nothing", () => {
  const page = app.appGroupPage(appId, "grp_breakfast", 0);
  const free = page.cells.filter((c) => c.type === "empty" && !c.locked).at(-1).slot;
  const taken = page.cells.find((c) => c.type === "word").slot;
  const want = lib.addState(appId, { groupId: "grp_breakfast", text: "dog" })
    .matches.find((m) => m.kind === "sense");
  let before = maxSeq();
  lib.addPlace(appId, { groupId: "grp_breakfast", cell: { page: 0, slot_index: taken },
    kind: "sense", id: want.id, label: want.label });
  assert.deepEqual(opsSince(before), [], "an occupied cell is refused, no op");
  before = maxSeq();
  lib.addPlace(appId, { groupId: "grp_breakfast", cell: { page: 0, slot_index: free },
    kind: "sense", id: want.id, label: want.label });
  assert.equal(q("SELECT slot_index FROM group_cell WHERE group_id='grp_breakfast' AND item_id=?", want.id)[0].slot_index, free);
  assert.deepEqual(opsSince(before).map((o) => o[0]), ["place_item"]);
});

test("Make a personal word: create_entity + place_item; the card says where; it stays silent", () => {
  const before = maxSeq();
  const st = lib.addMake(appId, { groupId: "grp_my_words", text: "Grandpa Lou" });
  const ops = opsSince(before);
  assert.deepEqual(ops.map((o) => o[0]), ["create_entity", "place_item"]);
  const ent = q("SELECT id, status FROM personal_entity WHERE spoken_name='Grandpa Lou'");
  assert.equal(ent.length, 1);
  assert.equal(ent[0].status, "active");
  assert.equal(ops[1][1].id, ent[0].id);
  assert.equal(ops[1][1].kind, "entity");
  assert.equal(st.card.label, "Grandpa Lou");
  assert.equal(st.card.justAdded.groupName, "My Words");
  const sp = edit.cardSpeech(appId, { kind: "entity", id: ent[0].id, text: "Grandpa Lou" }).speech;
  assert.notEqual(sp?.type, "tts", "never the device voice");
  assert.notEqual(sp?.type, "clip", "no recording exists yet");
});

test("Library finds the new word by search and lists it under Added", () => {
  const found = lib.libraryState(appId, { q: "grandpa" });
  assert.ok(found.rows.some((r) => r.label === "Grandpa Lou" && r.sub === "in My Words"));
  assert.ok(lib.libraryState(appId, { tab: "added" }).rows.some((r) => r.label === "Grandpa Lou"));
  assert.ok(lib.libraryState(appId, { tab: "all" }).total > 100);
  assert.equal(lib.libraryState(appId, { q: "zzzzqq" }).empty, "No matches.");
});

test("making a group from the picker writes create_group; the word lands in it", () => {
  const st = lib.addState(appId, { groupId: "grp_my_words", picker: "Road trip" });
  assert.equal(st.picker.make.canMake, true);
  assert.equal(st.picker.make.label, "Make a group called “Road trip”");
  const before = maxSeq();
  const { groupId } = lib.addMakeGroup(appId, { name: "  Road   trip " });
  assert.deepEqual(opsSince(before).map((o) => o[0]), ["create_group"]);
  assert.equal(q("SELECT name FROM board_group WHERE id=?", groupId)[0].name, "Road trip");
  lib.addMake(appId, { groupId, text: "Gas station" });
  assert.deepEqual(q("SELECT item_kind FROM group_membership WHERE group_id=?", groupId)
    .map((m) => m.item_kind), ["entity"]);
});

test("Also in: add to other groups is one op; Undo removes only those", () => {
  const ent = q("SELECT id FROM personal_entity WHERE spoken_name='Grandpa Lou'")[0].id;
  const model = lib.otherGroups(appId, { kind: "entity", id: ent, label: "Grandpa Lou" });
  assert.ok(!model.groups.some((g) => g.id === "grp_my_words"), "groups holding it are left out");
  assert.equal(model.title, "Add Grandpa Lou to other groups");
  assert.ok(model.groups.some((g) => g.id === "grp_breakfast"));
  const before = maxSeq();
  const st = lib.otherGroupsSave(appId, { kind: "entity", id: ent, label: "Grandpa Lou",
    groupIds: ["grp_breakfast"] });
  assert.deepEqual(opsSince(before).map((o) => o[0]), ["add_to_groups"]);
  assert.equal(members("grp_breakfast", ent), 1);
  assert.ok(st.toast.undo);
  edit.editUndo(appId, { token: st.toast.undo });
  assert.equal(members("grp_breakfast", ent), 0);
  assert.equal(members("grp_my_words", ent), 1);
});

test("an empty board cell: the off-board list, then Place writes a place_cell op", () => {
  // grid60 ships full (60 of 60); a free cell exists on grid90/after a
  // move. The owner's rule for a taken cell is the web's: place + displace.
  const cells = app.appBoard(appId).cells;
  const empty = (cells.find((c) => c.type === "empty" && !c.locked)
    ?? cells.find((c) => c.type === "word" && c.kind === "sense")).slot;
  const list = lib.placeList(appId, { q: "" });
  assert.ok(list.rows.length > 0 && list.rows.length <= 30);
  const ent = q("SELECT id FROM personal_entity WHERE spoken_name='Grandpa Lou'")[0].id;
  assert.ok(lib.placeList(appId, { q: "grandpa" }).rows.some((r) => r.id === ent),
    "a personal word with no home cell is offered");
  const before = maxSeq();
  const st = lib.placePick(appId, { slot: empty, kind: "entity", id: ent, label: "Grandpa Lou" });
  assert.deepEqual(opsSince(before).at(-1),
    ["place_cell", { layout: "grid60", kind: "entity", id: ent, toSlot: empty }]);
  assert.equal(q("SELECT slot_index FROM core_override WHERE item_id=?", ent)[0].slot_index, empty);
  assert.equal(st.toast.text, "Placed Grandpa Lou");
  edit.editUndo(appId, { token: st.toast.undo });
  assert.equal(q("SELECT count(*) AS n FROM core_override WHERE item_id=?", ent)[0].n, 0);
});

test("the free-word cap refuses Make past the limit and writes nothing", () => {
  const n0 = q("SELECT count(*) AS n FROM personal_entity WHERE status='active'")[0].n;
  for (let i = n0; i < 10; i++) lib.addMake(appId, { groupId: "grp_my_words", text: `Filler ${i}` });
  const st = lib.addState(appId, { groupId: "grp_my_words", text: "one more" });
  assert.equal(st.matches.at(-1).capped, true);
  assert.equal(st.matches.at(-1).action, "See Pip Lifetime");
  const before = maxSeq();
  const r = lib.addMake(appId, { groupId: "grp_my_words", text: "one more" });
  assert.deepEqual(opsSince(before), []);
  assert.match(r.toast.text, /free words/);
});
