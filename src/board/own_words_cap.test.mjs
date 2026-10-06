/**
 * 015 slice 6 — the free-word cap (Pricing § 4.2, amended 2026-10-06:
 * 10 live own words, was 20). The lie-prone layer is a counter that
 * drifts from the write — so this measures the shared write owners on a
 * real db: liveOwnWords counts active rows only, retiring frees a slot,
 * bulk/photo/setup applies refuse rows past the allowance but still place
 * matches, and the add sheet's Make at the cap creates nothing and routes
 * to the Lifetime offer.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createDatabase } from "./catalog.mjs";
import { addPersonalEntity } from "./entities.mjs";
import {
  liveOwnWords, OWN_WORDS_FREE, retireEntity,
} from "../../public/shared/groups.mjs";
import { applyPasteRows, applyPhotoDrafts, resolvePasteRows } from "../../public/shared/bulk.mjs";
import { applySetupPeople } from "../../public/shared/setup.mjs";
import { mountAddFlow } from "../../public/board/add-flow.js";
import { installDom } from "./fake_dom.mjs";

const openDb = () => {
  const db = createDatabase(":memory:");
  // Geometry is catalog data the import writes — placeItem needs it.
  db.exec(`INSERT INTO layout_shape (layout, cols, rows, frame) VALUES
    ('grid60', 10, 6, '[9,19,39,49]')`);
  db.prepare(
    `INSERT INTO board_group (id, kind, name, glyph, index_slot)
     VALUES ('grp_people', 'custom', 'People', '👤', 10)`,
  ).run();
  return db;
};
const fill = (db, n) => {
  for (let i = 0; i < n; i++) addPersonalEntity(db, { spokenName: `word${i}` });
};

test("the counter counts live words; a retired word frees its slot", () => {
  const db = openDb();
  fill(db, 3);
  assert.equal(liveOwnWords(db), 3);
  const id = db.prepare("SELECT id FROM personal_entity WHERE spoken_name = 'word0'").get().id;
  retireEntity(db, id);
  assert.equal(liveOwnWords(db), 2, "retired is not live");
});

test("paste apply: rows past the allowance are refused, matches still place", () => {
  const db = openDb();
  addPersonalEntity(db, { spokenName: "Cooper" });
  fill(db, OWN_WORDS_FREE - 1); // one slot left — Cooper included? no: Cooper + 9 = 10
  assert.equal(liveOwnWords(db), OWN_WORDS_FREE);

  const rows = resolvePasteRows(db, "Cooper\nNana\nGogo", { groupId: "grp_people", locale: "en" });
  const res = applyPasteRows(db, rows, { groupId: "grp_people", maxNew: 1 });
  assert.equal(res.created, 1, "only the first new word lands");
  assert.equal(res.refused, 1);
  assert.equal(res.placed, 2, "the existing Cooper still places");
  assert.equal(liveOwnWords(db), OWN_WORDS_FREE + 1);
});

test("photo drafts past the allowance are refused, not saved", () => {
  const db = openDb();
  fill(db, OWN_WORDS_FREE);
  const res = applyPhotoDrafts(db, [
    { name: "grandma", photoKey: "blob:g" },
    { name: "grandpa", photoKey: "blob:p" },
  ], { groupId: "grp_people", maxNew: 1 });
  assert.equal(res.saved, 1);
  assert.equal(res.refused, 1);
  assert.equal(liveOwnWords(db), OWN_WORDS_FREE + 1);
});

test("setup people: new rows past the allowance refuse; renames still write", () => {
  const db = openDb();
  const { id } = addPersonalEntity(db, { spokenName: "Mom" });
  fill(db, OWN_WORDS_FREE - 2); // Mom + 8 = 9 live — one free slot left
  const res = applySetupPeople(db, {
    people: [
      { id, name: "Mama" },                 // rename — never consumes a slot
      { name: "Dad" },                      // the last free slot
      { name: "Grandma" },                  // refused
    ],
    locale: "en",
    maxNew: 1,
  });
  assert.equal(res.added, 1);
  assert.equal(res.updated, 1);
  assert.equal(res.refused, 1);
  assert.equal(liveOwnWords(db), OWN_WORDS_FREE);
  assert.equal(
    db.prepare("SELECT spoken_name AS n FROM personal_entity WHERE id = ?").get(id).n, "Mama");
});

const mountSheet = (db, { licensed = false } = {}) => {
  db.prepare(
    `INSERT INTO board_group (id, kind, name, glyph, index_slot)
     VALUES ('grp_snacks', 'custom', 'Snacks', '🍎', 12)`,
  ).run();
  const $ = installDom();
  const toasts = [];
  const settings = [];
  const add = mountAddFlow({
    db,
    locale: "en",
    all: (database, sql, p = []) => database.prepare(sql).all(...p),
    catalog: { groups: [] },
    open() {},
    close() {},
    toast: (text, undo, opts) => toasts.push({ text, opts }),
    async savePhoto() { return null; },
    syncUploadBlob() {},
    async loadPhotoURL() { return null; },
    artInto() { return false; },
    invalidateIndex() {},
    rerenderView() {},
    renderStrip() {},
    renderLibrary() {},
    licensed: () => licensed,
    openSettings: (sec) => settings.push(sec),
  });
  return { $, add, toasts, settings };
};

test("the 11th own word is refused with the offer; nothing is written", async () => {
  const db = openDb();
  fill(db, OWN_WORDS_FREE);
  const { $, add, toasts, settings } = mountSheet(db);

  add.openAddForm("grp_snacks");
  assert.equal($("add-count").textContent, `All ${OWN_WORDS_FREE} free words used — Pip Lifetime adds unlimited.`);
  $("add-word").value = "Gogo";
  await $("add-word").fire("input");
  await $("add-word").fire("keydown", { key: "Enter" });

  assert.equal(liveOwnWords(db), OWN_WORDS_FREE, "the 11th word never lands");
  assert.equal(toasts.length, 1);
  assert.match(toasts[0].text, /free words/);
  toasts[0].opts.onAction(); // the dead end routes to the Lifetime page
  assert.deepEqual(settings, ["lifetime"]);
});

test("under the cap Make lands and the counter reads 'n of 10'", async () => {
  const db = openDb();
  fill(db, 3);
  const { $, add } = mountSheet(db);

  add.openAddForm("grp_snacks");
  assert.equal($("add-count").textContent, "3 of 10 free words");
  $("add-word").value = "Gogo";
  await $("add-word").fire("input");
  await $("add-word").fire("keydown", { key: "Enter" });
  assert.equal(liveOwnWords(db), 4);
});

test("a licensed board adds past the cap", async () => {
  const db = openDb();
  fill(db, OWN_WORDS_FREE);
  const { $, add } = mountSheet(db, { licensed: true });

  add.openAddForm("grp_snacks");
  assert.equal($("add-count").hidden, true, "licensed boards see no counter");
  $("add-word").value = "Gogo";
  await $("add-word").fire("input");
  await $("add-word").fire("keydown", { key: "Enter" });
  assert.equal(liveOwnWords(db), OWN_WORDS_FREE + 1);
});
