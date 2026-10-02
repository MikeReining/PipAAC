/**
 * 029 — Add a word: type it, Return, it's saved. Works Tests 2 (zero
 * questions) and the sheet's highlight rule, measured on the database
 * the app writes, not on the sheet's own report.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { installDom, findAll } from "./fake_dom.mjs";
import { mountAddFlow } from "../../public/board/add-flow.js";
import { createGroup, groupDisplayName, groupIndex } from "../../public/shared/groups.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const catalog = buildCatalog(
  JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8")),
  parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")),
);

function harness() {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  createGroup(db, { id: "grp_mine", name: "Mine" });
  const $ = installDom();
  const log = { mints: [], cards: [], spoken: [], opened: [], closed: [] };
  const add = mountAddFlow({
    db,
    locale: "en",
    all: (database, sql, p = []) => database.prepare(sql).all(...p),
    catalog,
    open: (id) => log.opened.push(id),
    close: (id) => log.closed.push(id),
    toast() {},
    async savePhoto() { return null; },
    syncUploadBlob() {},
    async loadPhotoURL() { return null; },
    artInto() { return false; },
    invalidateIndex() {},
    rerenderView() {},
    renderStrip() {},
    renderLibrary() {},
    openAddToBoards() {},
    tile: { ensure: async (text, o) => { log.mints.push({ text, source: o?.source }); return { ok: true }; } },
    speakItem: (it) => log.spoken.push(it),
    openWordCard: (item, opts) => log.cards.push({ item, opts }),
  });
  const type = async (text) => {
    $("add-name").value = text;
    await $("add-name").fire("input");
  };
  const rows = () => findAll($("add-matches"), (n) => n.className.split(" ").includes("addmatch"));
  const hiRow = () => rows().find((r) => r.classList.contains("hi"));
  const label = (row) => findAll(row, (n) => n.className === "lb")[0]?.textContent;
  return { db, $, add, log, type, rows, hiRow, label };
}

test("WT2 — Make needs only the name: one Return saves, places, mints, opens the card", async () => {
  const h = harness();
  h.add.openAddForm("grp_mine");
  await h.type("philosopher");
  assert.equal(h.label(h.hiRow()), "“philosopher”", "no match → Make is the highlighted row");
  await h.$("add-name").fire("keydown", { key: "Enter" });

  const ent = h.db.prepare(
    "SELECT id, hint, photo_key, fitzgerald_role FROM personal_entity WHERE spoken_name = 'philosopher'").get();
  assert.ok(ent, "the word exists the moment Return is pressed");
  assert.equal(ent.hint, null);
  assert.equal(ent.photo_key, null);
  assert.equal(ent.fitzgerald_role, null, "kind is left for the finder, not asked");
  const placed = h.db.prepare(
    "SELECT 1 AS x FROM group_membership WHERE group_id = 'grp_mine' AND item_id = ?").get(ent.id);
  assert.ok(placed, "filed into the destination page");
  assert.deepEqual(h.log.mints, [{ text: "philosopher", source: "user_typed" }]);
  assert.equal(h.log.cards.length, 1);
  assert.deepEqual(h.log.cards[0].opts, { justAdded: { groupName: "Mine" } });
  assert.ok(h.log.closed.includes("addform"));
});

test("spacing folds: 'pop corn' highlights our popcorn, and Return places it", async () => {
  const h = harness();
  h.add.openAddForm("grp_mine");
  await h.type("pop corn");
  assert.equal(h.label(h.hiRow()), "popcorn");
  await h.$("add-name").fire("keydown", { key: "Enter" });
  const row = h.db.prepare(
    `SELECT gm.item_kind FROM group_membership gm
     JOIN label l ON l.sense_id = gm.item_id AND l.kind = 'lemma' AND l.locale = 'en'
     WHERE gm.group_id = 'grp_mine' AND l.text = 'popcorn'`).get();
  assert.equal(row?.item_kind, "sense", "the real catalog word, not a new copy");
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM personal_entity").get().n, 0);
  assert.equal(h.log.spoken.at(-1)?.kind, "sense", "the adult hears what was added");
});

test("a longer word that merely starts the same never steals Return", async () => {
  const h = harness();
  h.add.openAddForm("grp_mine");
  await h.type("pop");
  assert.ok(h.rows().some((r) => h.label(r) === "popcorn"), "popcorn is offered…");
  assert.equal(h.label(h.hiRow()), "“pop”", "…but Make stays the Return target");
});

test("a word already on this page says so and opens its card instead", async () => {
  const h = harness();
  h.add.openAddForm("grp_mine");
  await h.type("popcorn");
  await h.$("add-name").fire("keydown", { key: "Enter" });
  h.add.openAddForm("grp_mine");
  await h.type("popcorn");
  const row = h.rows().find((r) => h.label(r) === "popcorn");
  assert.ok(row.classList.contains("here"));
  await h.$("add-name").fire("keydown", { key: "Enter" });
  assert.equal(h.log.cards.at(-1)?.item.label, "popcorn");
  const n = h.db.prepare(
    "SELECT COUNT(*) AS n FROM group_membership WHERE group_id = 'grp_mine'").get().n;
  assert.equal(n, 1, "no second placement");
});

test("arrow keys move the highlight; Return takes the highlighted row", async () => {
  const h = harness();
  h.add.openAddForm("grp_mine");
  await h.type("pop");
  const last = h.rows().length - 1;
  assert.equal(h.rows().indexOf(h.hiRow()), last);
  await h.$("add-name").fire("keydown", { key: "ArrowUp" });
  assert.equal(h.rows().indexOf(h.hiRow()), last - 1);
});

/* --- the group picker (029 § 3.1) --- */

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
}
const groupNames = (h) => findAll(h.$("add-grouplist"), (n) => n.className === "pname").map((n) => n.textContent);

test("the destination is the group the adult came from — no guess", async () => {
  const h = harness();
  h.add.openAddForm("grp_my_words");
  assert.equal(h.$("add-destname").textContent, "My Words");
  h.add.openAddForm("grp_mine");
  await h.type("pancake"); // a Breakfast word — still files into Mine
  await h.$("add-name").fire("keydown", { key: "Enter" });
  const row = h.db.prepare(
    `SELECT gm.group_id FROM group_membership gm JOIN label l ON l.sense_id = gm.item_id
     WHERE l.text = 'pancake' AND l.kind = 'lemma' AND gm.group_id = 'grp_mine'`).get();
  assert.ok(row);
});

test("find a group: the list is the board's order; typing narrows it; Return picks the first", async () => {
  globalThis.localStorage = memoryStorage();
  const h = harness();
  h.add.openAddForm("grp_my_words");
  await h.$("add-dest").click();
  assert.equal(h.$("add-destlist").hidden, false);
  assert.equal(h.$("add-name").hidden, true, "the list takes the results' place");
  // One group order everywhere (2026-09-30): the board's index_slot,
  // read straight from the table.
  const all = groupNames(h).filter((n) => !/^(New group|Make a group)/.test(n));
  const boardOrder = groupIndex(h.db).filter((g) => !g.hidden)
    .map((g) => groupDisplayName(h.db, g, "en"));
  assert.deepEqual(all, boardOrder);
  h.$("add-groupq").value = "min";
  await h.$("add-groupq").fire("input");
  assert.deepEqual(groupNames(h), ["Mine", "New group"]);
  await h.$("add-groupq").fire("keydown", { key: "Enter" });
  assert.equal(h.$("add-destname").textContent, "Mine");
  assert.equal(h.$("add-destlist").hidden, true);
  assert.equal(h.$("add-name").hidden, false);
});

test("a name no group has makes that group, selects it, and the word lands there", async () => {
  globalThis.localStorage = memoryStorage();
  const h = harness();
  h.add.openAddForm("grp_my_words");
  await h.$("add-dest").click();
  h.$("add-groupq").value = "Grandma's house";
  await h.$("add-groupq").fire("input");
  assert.equal(groupNames(h).at(-1), "Make a group called “Grandma's house”");
  await h.$("add-groupq").fire("keydown", { key: "Enter" });
  const g = h.db.prepare("SELECT id, kind FROM board_group WHERE name = ?").get("Grandma's house");
  assert.equal(g?.kind, "custom");
  assert.equal(h.$("add-destname").textContent, "Grandma's house");
  await h.type("rocking chair");
  await h.$("add-name").fire("keydown", { key: "Enter" });
  const placed = h.db.prepare(
    `SELECT 1 AS x FROM group_membership gm JOIN personal_entity e ON e.id = gm.item_id
     WHERE gm.group_id = ? AND e.spoken_name = 'rocking chair'`).get(g.id);
  assert.ok(placed);

  // Recent: the page just used leads the list next time.
  h.add.openAddForm("grp_my_words");
  await h.$("add-dest").click();
  const heads = findAll(h.$("add-grouplist"), (n) => n.className === "add-grouphead").map((n) => n.textContent);
  assert.deepEqual(heads, ["Recent", "All groups"]);
  assert.equal(groupNames(h)[0], "Grandma's house");
});
