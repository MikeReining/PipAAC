/**
 * 044 E4 — the group-management + Settings facades (scripts/ios/app_groups.mjs,
 * app_settings.mjs) leave exactly the expected rows in sync_op and the
 * expected state in the tables. Assertions read the DATABASE through a
 * second connection, never the facade's own return values.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";

const root = new URL("../../", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "pip-grp-"));
const file = join(dir, "user.sqlite");
copyFileSync(join(root, "public/fresh_db.sqlite"), file);

const writer = new DatabaseSync(file);
const reader = new DatabaseSync(file);
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
// The BUILT bundle (what ships) in a bare vm realm.
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
const groupsEdit = facade("groupsEdit");
const settingsUi = facade("settingsUi");

const catalog = readFileSync(join(root, "public/catalog.json"), "utf8");
const { appId } = app.appOpen(1, catalog, null, null);

const q = (sql, ...p) => reader.prepare(sql).all(...p);
const maxSeq = () => q("SELECT COALESCE(MAX(seq),0) AS m FROM sync_op")[0].m;
const opsSince = (since) => q(
  "SELECT kind, args FROM sync_op WHERE seq > ? AND relay_seq IS NULL ORDER BY seq", since,
).map((r) => [r.kind, JSON.parse(r.args)]);
const order = () => q("SELECT id FROM board_group ORDER BY index_slot").map((r) => r.id);
const grp = (id) => q("SELECT * FROM board_group WHERE id = ?", id)[0];
const doors = () => app.appGroups(appId).pages.flatMap((p) => p.cells)
  .filter((c) => c.type === "group").map((c) => c.groupId);

test("SY-11: the Protect line appears once the board is worth protecting, names what is missing, and goes quiet when done", () => {
  const has = (o) => settingsUi.hub(appId, { name: "Maya", ...o }).protect;
  assert.deepEqual(has({}), { visible: false, title: "", summary: "" }, "nothing customized yet: no nudge");
  groupsEdit.createGroupNamed(appId, { name: "Sy11" }); // a create_group op: the board is theirs now
  assert.deepEqual(has({}), { visible: true, title: "Protect Maya's words",
    summary: "Add a Settings PIN and make the recovery card" });
  assert.equal(settingsUi.hub(appId, { name: "" }).protect.title, "Protect this person's words");
  assert.equal(has({ pinOn: true }).summary, "Make the recovery card");
  assert.equal(has({ cardMade: true }).summary, "Add a Settings PIN");
  assert.equal(has({ pinOn: true, cardMade: true }).visible, false, "both done: gone");
  assert.equal(has({ team: true }).visible, false, "a Team device is never nagged");
});

test("create, rename, reorder first, set the icon: the db and the ops hold exactly that", () => {
  let before = maxSeq();
  const made = groupsEdit.createGroupNamed(appId, { name: "Park" });
  assert.deepEqual(opsSince(before).map((o) => o[0]), ["create_group"]);
  const id = made.createdId;
  assert.equal(grp(id).name, "Park");
  assert.equal(grp(id).kind, "custom");
  assert.equal(made.toast.text, "New group “Park” — its door is in Groups");

  before = maxSeq();
  groupsEdit.renameGroupTo(appId, { id, name: "Playground" });
  assert.deepEqual(opsSince(before), [["rename_group", { groupId: id, name: "Playground" }]]);
  assert.equal(grp(id).name, "Playground");

  before = maxSeq();
  const first = order()[0];
  assert.notEqual(first, id);
  groupsEdit.moveGroups(appId, { ids: [id], beforeId: first });
  assert.equal(order()[0], id, "Playground is the first door");
  assert.deepEqual(opsSince(before).map((o) => o[0]), ["reorder_groups"]);

  before = maxSeq();
  const picker = groupsEdit.iconChoices(appId, { id });
  assert.ok(picker.icons.length >= 30 && picker.categories.length > 5);
  groupsEdit.setIcon(appId, { id, glyph: "icon:animals" });
  assert.equal(grp(id).glyph, "icon:animals");
  assert.deepEqual(opsSince(before), [["set_group_glyph", { groupId: id, glyph: "icon:animals" }]]);
  const st = groupsEdit.groupsEditState(appId);
  assert.equal(st.groups[0].id, id);
  assert.equal(st.groups[0].face.icon, "icons/groups/animals.svg");
  // the animals icon is also Animals' default: the picker says who uses it
  const again = groupsEdit.iconChoices(appId, { id: "grp_home" });
  assert.match(again.icons.find((i) => i.name === "animals").usedBy, /Playground/);
  assert.ok(groupsEdit.iconChoices(appId, { id, query: "zebra" }).icons.length < picker.icons.length);
});

test("Undo brings the old name and the old order back", () => {
  const id = order()[0];
  const was = order();
  const r = groupsEdit.moveGroups(appId, { ids: [id], beforeId: null });
  assert.equal(order().at(-1), id);
  groupsEdit.undoGroups(appId, { token: r.toast.undo });
  assert.deepEqual(order(), was);
  const n = groupsEdit.renameGroupTo(appId, { id, name: "Swings" });
  groupsEdit.undoGroups(appId, { token: n.toast.undo });
  assert.equal(grp(id).name, "Playground");
});

test("hide and show keep the group; Meals is one row bound to occasions_visible", () => {
  let before = maxSeq();
  groupsEdit.setGroupShown(appId, { id: "grp_animals", shown: false });
  assert.equal(grp("grp_animals").hidden, 1);
  assert.deepEqual(opsSince(before), [["set_group_hidden", { groupId: "grp_animals", hidden: true }]]);
  assert.ok(!doors().includes("grp_animals"));
  groupsEdit.setGroupShown(appId, { id: "grp_animals", shown: true });
  assert.equal(grp("grp_animals").hidden, 0);
  assert.ok(doors().includes("grp_animals"));

  const st = groupsEdit.groupsEditState(appId);
  const meals = st.shows.filter((r) => r.meals);
  assert.equal(meals.length, 1);
  assert.equal(meals[0].ids.length, 4);
  assert.match(meals[0].label, /^Meals: /);
  assert.equal(st.shows.length, st.groups.length - 3);
  before = maxSeq();
  groupsEdit.setMealsShown(appId, { on: false });
  assert.equal(q("SELECT occasions_visible AS o FROM learner_profile")[0].o, 0);
  assert.deepEqual(opsSince(before), [["set_setting", { key: "occasions_visible", value: 0 }]]);
  assert.ok(!doors().includes("grp_breakfast"), "meal doors leave the index with the switch");
  groupsEdit.setMealsShown(appId, { on: true });
  assert.ok(doors().includes("grp_breakfast"));
});

test("a family group deletes with Undo; a built-in cannot be deleted", () => {
  const id = groupsEdit.createGroupNamed(appId, { name: "Trip" }).createdId;
  let before = maxSeq();
  const r = groupsEdit.removeGroup(appId, { id });
  assert.equal(q("SELECT count(*) AS n FROM board_group WHERE id=?", id)[0].n, 0);
  assert.equal(opsSince(before)[0][0], "delete_group");
  groupsEdit.undoGroups(appId, { token: r.toast.undo });
  assert.equal(grp(id).name, "Trip");
  before = maxSeq();
  groupsEdit.removeGroup(appId, { id: "grp_animals" });
  assert.deepEqual(opsSince(before), [], "a built-in group is hidden, never deleted");
  assert.ok(grp("grp_animals"));
});

test("counts: the badge is the child's own 30-day taps from learner_event_log", () => {
  for (let i = 0; i < 3; i++) app.appTap(appId, { kind: "sense", id: "sns_0013", text: "want" });
  app.appTap(appId, { kind: "sense", id: "sns_0128", text: "apple" });
  edit.editOpen(appId);
  const on = groupsEdit.countsSet(appId, { on: true });
  assert.equal(on.countsOn, true);
  const tile = (p, id) => p.board.cells.find((c) => c.id === id);
  const dbCount = (id) => q(
    "SELECT count(*) AS n FROM learner_event_log WHERE item_id=? AND selected_at >= ?",
    id, Date.now() - 30 * 86400000)[0].n;
  assert.ok(dbCount("sns_0013") >= 3);
  assert.equal(tile(on, "sns_0013").count, dbCount("sns_0013"));
  assert.equal(tile(on, "sns_0128")?.count ?? dbCount("sns_0128"), dbCount("sns_0128"));
  const off = groupsEdit.countsSet(appId, { on: false });
  assert.equal(tile(off, "sns_0013").count, undefined);
  groupsEdit.countsSet(appId, { on: true });
  assert.equal(edit.editClose(appId).countsOn, false, "the badge leaves with Edit mode");
});

test("presentation mode is the synced presentation_mode column", () => {
  const before = maxSeq();
  assert.equal(app.appSettings(appId).look, "symbol");
  const r = app.appSetSetting(appId, "presentation_mode", "label");
  assert.equal(r.settings.look, "label");
  assert.equal(q("SELECT presentation_mode AS m FROM learner_profile")[0].m, "label");
  assert.deepEqual(opsSince(before), [["set_setting", { key: "presentation_mode", value: "label" }]]);
  app.appSetSetting(appId, "presentation_mode", "symbol");
});

test("Settings hub: sections, checklist, glance", () => {
  const h = settingsUi.hub(appId, { name: "", pinOn: false });
  assert.deepEqual(h.sections.map((s) => s.title),
    ["Get Pip Lifetime", "Overview", "Words", "Spotlight", "Board", "Talking", "Language help", "Team & devices", "Backup & privacy",
      "Your account", "Help"]);
  assert.equal(h.sections[2].intro, "What this person can say, and where it lives.");
  assert.equal(h.checklist.visible, true);
  assert.equal(h.checklist.title, "Finish setting up · 0 of 2 done");
  assert.match(h.glance.find((g) => g.sec === "board").summary, /^60 buttons · Pip keyboard$/);
  assert.match(h.glance.find((g) => g.sec === "talking").summary, /feeling faces on$/);
  const named = settingsUi.hub(appId, { name: "Maya", pinOn: true });
  assert.equal(named.sections[2].intro, "What Maya can say, and where it lives.");
  assert.equal(named.checklist.title, "Finish setting up · 1 of 2 done");

  assert.deepEqual(h.sections.map((s) => s.group),
    ["person", "person", "person", "person", "person", "person", "person", "person", "person", "you", "you"]);
  assert.equal(h.sections[9].intro, "About you, the adult. This person never needs an account.");
  assert.equal(named.sections[9].intro, "About you, the adult. Maya never needs an account.");
});

test("person name is the synced person_name", () => {
  const before = maxSeq();
  settingsUi.nameSet(appId, { name: "  Maya " });
  assert.equal(q("SELECT person_name AS n FROM learner_profile")[0].n, "Maya");
  assert.deepEqual(opsSince(before), [["set_setting", { key: "person_name", value: "Maya" }]]);
  settingsUi.nameSet(appId, { name: "   " });
  assert.equal(q("SELECT person_name AS n FROM learner_profile")[0].n, "Maya", "a name can't be blank");
});

test("Pip Lifetime: first in the list while unlicensed, a quiet check before Your account once bought", () => {
  const free = settingsUi.hub(appId, { name: "", licensed: false }).sections.map((s) => s.title);
  assert.equal(free[0], "Get Pip Lifetime");
  const paid = settingsUi.hub(appId, { name: "", licensed: true }).sections.map((s) => s.title);
  assert.equal(paid[0], "Overview");
  assert.equal(paid.at(-3), "Pip Lifetime ✓");
  assert.equal(paid.at(-2), "Your account");
});
