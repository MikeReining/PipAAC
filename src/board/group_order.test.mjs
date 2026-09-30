/**
 * One group order (docs/product/Motor_Grid_And_Art.md § Groups). Works
 * Test: the lists the adult actually reads — the board index, Settings →
 * Show groups, the editor sidebar, the Add a word picker — are painted
 * from the real catalog into a DOM and compared with each other, before
 * and after a drag in Settings. Nothing here asks the code what order it
 * thinks it used; it reads the rendered rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { installDom, findAll } from "./fake_dom.mjs";
import { mountGroups } from "../../public/board/groups-ui.js";
import { mountGroupShows } from "../../public/board/group-shows.js";
import { mountEditor } from "../../public/board/editor-ui.js";
import { mountAddFlow } from "../../public/board/add-flow.js";
import {
  groupIndex, moveGroupBlock, reorderGroups, setGroupHidden, shownOn,
} from "../../public/shared/groups.mjs";
import { applyOp } from "../../public/shared/ops.mjs";
import { coreCells } from "../../public/shared/coremove.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const catalog = buildCatalog(lexicon, parseCoordinateMapMarkdown(
  readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")));
const all = (database, sql, p = []) => database.prepare(sql).all(...p);
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
const MEALS = ["Breakfast", "Lunch", "Dinner", "Snack"];

/** One DOM per test: every surface mounts into it, so a held node stays live. */
let $dom = null;
const useDom = () => ($dom = installDom());

function openDb() {
  useDom();
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
}
const nameOf = (db, id) => {
  const g = groupIndex(db).find((x) => x.id === id);
  return g.name ?? all(db, "SELECT text FROM group_label WHERE group_id = ? AND locale = 'en'", [id])[0].text;
};
const slotsOf = (db) => Object.fromEntries(groupIndex(db).map((g) => [g.id, g.index_slot]));

/* --- the four surfaces, each read off its rendered rows --- */

function boardOrder(db) {
  const zg = $dom("groupgrid");
  const node = (extra = {}) => Object.assign(document.createElement("div"), extra);
  const ui = mountGroups({
    db, locale: "en", all,
    boardGeom: () => ({ name: "grid60", cols: 10, rows: 6, cells: 60 }),
    getEditing: () => false, getModelGlow: () => new Set(), getLikelyGroups: () => new Set(),
    setView() {}, open() {}, close() {}, toast() {},
    wordTile: ({ label }) => node({ textContent: label }), layerMark() {}, fitLabels() {}, tap() {},
    shownLabel: (id, label) => label,
    navCell(label) { return node({ textContent: label }); },
    editPointer() {}, xBadge: () => node(), openAddForm() {}, openWordCard() {},
    homeCells: () => coreCells(db, "grid60", "en"),
    homeTile: (c) => ({ el: node({ textContent: `home:${c.label}` }), say: c.label }),
    rerenderView() {}, async loadPhotoURL() { return null; }, async savePhoto() { return null; }, syncUploadBlob() {},
  });
  ui.renderGroupIndex();
  return zg.children.flatMap((cell) =>
    cell.children.filter((c) => c.className.includes("glabel")).map((c) => c.textContent));
}

function settingsHarness(db) {
  const $ = $dom;
  const toasts = [];
  const ui = mountGroupShows({ db, locale: "en", all, toast: (t, undo) => toasts.push({ t, undo }) });
  ui.render();
  const box = $("group-shows");
  const rows = () => box.children;
  const label = (r) => findAll(r, (n) => n.className === "seg-label")[0].textContent;
  const grip = (r) => findAll(r, (n) => n.className === "set-grip")[0];
  // Settings rows → group names, the Meals row expanded into its four.
  const names = () => rows().flatMap((r) =>
    label(r).startsWith("Meals: ") ? label(r).slice(7).split(" · ") : [label(r)]);
  /** A drag of a row's grip to just above row `i` (or below the last when i = length). */
  async function drag(from, to) {
    rows().forEach((r, i) => { r.getBoundingClientRect = () => ({ top: i * 40, height: 40, bottom: i * 40 + 40 }); });
    const g = grip(rows()[from]);
    const y = to >= rows().length ? rows().length * 40 + 20 : to * 40 + 5;
    g.setPointerCapture = () => {};
    await g.fire("pointerdown", { button: 0, pointerId: 1, currentTarget: g, clientY: from * 40 + 20 });
    await g.fire("pointermove", { clientY: y });
    await g.fire("pointerup", { clientY: y });
  }
  return { $, ui, box, rows, label, grip, names, drag, toasts };
}

function sidebarOrder(db) {
  const $ = $dom;
  const editor = mountEditor({
    db, locale: "en", all, catalog, me: { id: "u1", name: "Maya" }, userStore: null,
    flushDb: async () => {}, async paintGroupPage() { return 1; }, renderMainBoard() {}, homeCells: () => [],
    boardGeom: () => ({ cols: 10, name: "grid60", anchors: new Map() }),
    addFlow: {}, openWordCard() {}, closeCard() {}, setView() {}, openGroupView() {}, toast() {}, undoLast() {},
    syncState: () => ({ linked: false, pending: 0, online: true, flushError: null }),
    renderLibrary() {}, invalidateIndex() {}, renderStrip() {}, async savePhoto() { return null; },
    syncUploadBlob() {}, tile: null, async loadPhotoURL() { return null; }, artInto() { return false; },
  });
  editor.renderEditor();
  return findAll($("ed-groups"), (n) => n.className?.startsWith("ed-grow"))
    .map((n) => findAll(n, (k) => k.className === "ed-gname")[0]?.textContent);
}

function pickerOrder(db) {
  const $ = $dom;
  const add = mountAddFlow({
    db, locale: "en", all, catalog: { groups: [] }, open() {}, close() {}, toast() {},
    async savePhoto() { return null; }, syncUploadBlob() {}, async loadPhotoURL() { return null; },
    artInto() { return false; }, invalidateIndex() {}, rerenderView() {}, renderStrip() {}, renderLibrary() {},
  });
  add.openAddForm("grp_my_words");
  $("add-dest").fire("click");
  return findAll($("add-grouplist"), (n) => n.className === "pname").map((n) => n.textContent);
}

/** The groups a 60-cell board offers, as names: what every list should show. */
const onGrid60 = (db) => groupIndex(db).filter((g) => shownOn(db, g.id, "grid60")).map((g) => nameOf(db, g.id));
const keep = (db, list) => list.filter((n) => onGrid60(db).includes(n));

function assertOneOrder(db, settings, why) {
  const board = boardOrder(db);
  assert.deepEqual(board, onGrid60(db), `${why}: the painted board index follows index_slot`);
  assert.deepEqual(keep(db, settings.names()), board, `${why}: Settings rows match the board`);
  const side = sidebarOrder(db);
  assert.deepEqual(keep(db, side.filter((n) => n !== "Main board" && n !== "All words")), board, `${why}: editor sidebar matches the board`);
  const pick = pickerOrder(db);
  assert.deepEqual(keep(db, pick), board, `${why}: Add a word picker matches the board`);
}

test("seed: the default order is the shipped rows, and every list paints it", () => {
  const db = openDb();
  const s = settingsHarness(db);
  assertOneOrder(db, s, "new install");
  const board = boardOrder(db);
  assert.deepEqual(board.slice(0, 8),
    ["My Words", ...MEALS, "Drinks", "Treats", "Fruit"]);
  assert.equal(s.label(s.rows()[1]), "Meals: Breakfast · Lunch · Dinner · Snack",
    "the four meal groups are one Settings row, at their board place");
  assert.equal(s.rows().length, groupIndex(db).length - 3, "four meal groups fold to one row");
  // No list sorts A–Z any more: the picker would put Animals first.
  assert.notEqual(pickerOrder(db)[0], "Animals");
  // grid15- and grid30-only groups come after the ten-wide rows of the default layout.
  assert.deepEqual(groupIndex(db).slice(30).map((g) => g.id),
    ["grp_more_people", "grp_more_doing", "grp_more_where", "grp_more_describing",
      "grp_more_people_thirty", "grp_more_doing_thirty", "grp_more_where_thirty", "grp_more_describing_thirty"]);
});

test("Recent stays on top of All groups in the picker", () => {
  const db = openDb();
  const store = { "pip-add-recent": JSON.stringify(["grp_school"]) };
  const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
  });
  try {
    const $ = $dom;
    const add = mountAddFlow({
      db, locale: "en", all, catalog: { groups: [] }, open() {}, close() {}, toast() {},
      async savePhoto() { return null; }, syncUploadBlob() {}, async loadPhotoURL() { return null; },
      artInto() { return false; }, invalidateIndex() {}, rerenderView() {}, renderStrip() {}, renderLibrary() {},
    });
    add.openAddForm("grp_my_words");
    $("add-dest").fire("click");
    const kids = $("add-grouplist").children;
    const heads = kids.filter((n) => n.className === "add-grouphead").map((n) => n.textContent);
    assert.deepEqual(heads, ["Recent", "All groups"]);
    assert.equal(findAll(kids[1], (n) => n.className === "pname")[0].textContent, "School");
    const all_ = kids.slice(3).flatMap((n) => findAll(n, (k) => k.className === "pname")).map((n) => n.textContent);
    assert.equal(all_[0], "My Words");
    // typed search keeps filtering, in board order
    $("add-groupq").value = "ing";
    $("add-groupq").fire("input");
    const hits = findAll($("add-grouplist"), (n) => n.className === "pname").map((n) => n.textContent);
    const found = hits.filter((n) => n !== "New group");
    assert.ok(found.length && found.every((n) => /ing/i.test(n)), hits.join());
  } finally {
    if (had) Object.defineProperty(globalThis, "localStorage", had); else delete globalThis.localStorage;
  }
});

test("drag in Settings: the board, sidebar and picker follow; Undo puts it back", async () => {
  const db = openDb();
  const s = settingsHarness(db);
  const before = boardOrder(db);
  const rowOf = (name) => s.rows().findIndex((r) => s.label(r) === name);
  // Fruit (row 7 of the list) up to just before the meals row.
  await s.drag(rowOf("Fruit"), 1);
  const after = ["My Words", "Fruit", ...MEALS, "Drinks", "Treats"];
  assert.deepEqual(boardOrder(db).slice(0, 8), after, "the board index moved Fruit");
  assertOneOrder(db, s, "after drag");
  assert.deepEqual(keep(db, s.names()).slice(0, 8), after, "Settings re-rendered in the new order");
  assert.equal(s.toasts.at(-1).t, "Moved Fruit");
  // nothing outside the shifted window moved
  assert.deepEqual(boardOrder(db).slice(8), before.slice(8));
  s.toasts.at(-1).undo();
  assert.deepEqual(boardOrder(db), before, "Undo restores the order");
  assertOneOrder(db, s, "after undo");
});

test("the Meals row drags as one block, and its switch is occasions_visible", async () => {
  const db = openDb();
  const s = settingsHarness(db);
  const rowOf = (name) => s.rows().findIndex((r) => s.label(r).startsWith(name));
  await s.drag(rowOf("Meals"), rowOf("People"));
  const board = boardOrder(db);
  const i = board.indexOf("Breakfast");
  assert.deepEqual(board.slice(i, i + 4), MEALS, "the four stay together, in order");
  assert.equal(board[i + 4], "People");
  assert.equal(board[0], "My Words");
  assertOneOrder(db, s, "after meals drag");

  const sw = findAll(s.rows()[rowOf("Meals")], (n) => n.className === "set-switch")[0];
  assert.equal(sw.getAttribute("aria-checked"), "true");
  sw.onclick();
  assert.equal(all(db, "SELECT occasions_visible AS o FROM learner_profile WHERE id = 'prf_local'")[0].o, 0);
  assert.equal(sw.getAttribute("aria-checked"), "false");
});

test("keyboard: ArrowDown on a grip moves the row one place", async () => {
  const db = openDb();
  const s = settingsHarness(db);
  await s.grip(s.rows()[0]).fire("keydown", { key: "ArrowDown" });
  // My Words steps past the whole Meals row — the block is one row in the list.
  assert.deepEqual(boardOrder(db).slice(0, 6), [...MEALS, "My Words", "Drinks"]);
});

test("hidden groups stay in Settings and keep their place", () => {
  const db = openDb();
  setGroupHidden(db, "grp_fruit", true);
  const s = settingsHarness(db);
  assert.ok(s.names().includes("Fruit"));
  assert.equal(s.names().indexOf("Fruit"), groupIndex(db).findIndex((g) => g.id === "grp_fruit"));
});

/* --- the write owner --- */

test("moveGroupBlock: only the window shifts, slots stay unique, one synced op, replay matches", () => {
  const a = openDb();
  const b = openDb();
  const was = slotsOf(a);
  const { undo } = moveGroupBlock(a, ["grp_fruit"], "grp_breakfast");
  const now = slotsOf(a);
  assert.equal(new Set(Object.values(now)).size, Object.keys(now).length);
  assert.deepEqual(Object.values(now).sort((x, y) => x - y), Object.values(was).sort((x, y) => x - y),
    "the same slots, reassigned");
  for (const g of ["grp_school", "grp_people", "grp_more_people"]) assert.equal(now[g], was[g]);
  assert.equal(now.grp_fruit, was.grp_breakfast);
  const ops = all(a, "SELECT kind, args FROM sync_op WHERE kind = 'reorder_groups'");
  assert.equal(ops.length, 1);
  for (const op of ops) applyOp(b, op);
  assert.deepEqual(slotsOf(b), now, "a replica replaying the op lands the same order");
  undo();
  assert.deepEqual(slotsOf(a), was);
  // dropping a block where it already is does nothing and records nothing
  const n = all(a, "SELECT count(*) AS n FROM sync_op")[0].n;
  moveGroupBlock(a, ["grp_breakfast"], "grp_lunch");
  assert.equal(all(a, "SELECT count(*) AS n FROM sync_op")[0].n, n);
  assert.throws(() => reorderGroups(a, ["grp_nope", "grp_fruit"]), /no group/);
});

test("existing profiles keep their order: re-importing a newer seed never reshuffles", () => {
  const db = openDb();
  moveGroupBlock(db, ["grp_fruit"], "grp_breakfast");
  const mine = slotsOf(db);
  importCatalog(db, catalog);
  assert.deepEqual(slotsOf(db), mine);
});
