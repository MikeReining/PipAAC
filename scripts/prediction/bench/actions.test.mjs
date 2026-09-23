/**
 * 017 step 16 — the real-board action/time model:
 *   - a word deeper in a group costs more than a page-one word
 *   - an always-wrong strip is slower than no strip at all
 *   - a hit with decoys costs more at the high scan setting
 *   - a familiar home word is found faster than a rare one
 *   - A0 (no prediction) lands near 10 WPM at the middle setting
 *   - recall_saving 0 vs 0.9 brackets the thinking-time saving
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { createDatabase, importCatalog } from "../../../src/board/catalog.mjs";
import { loadSimFixture } from "../../../src/board/sim_replay.mjs";
import { addPersonalEntity } from "../../../src/board/entities.mjs";
import { placeItem } from "../../../public/shared/groups.mjs";
import { loadSynthUsers, userToFixture } from "../synth/splits.mjs";
import {
  ACTION_DEFAULTS, actionModel, seedUserBoard, wpm,
} from "./actions.mjs";

const repoRoot = join(import.meta.dirname, "../../..");
const { catalog } = loadSimFixture(repoRoot);
const [user] = loadSynthUsers([1], { purpose: "fit" });

function seededBoard() {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  seedUserBoard(db, catalog, user);
  const fx = userToFixture(user);
  const ents = fx.entities.map((e) =>
    addPersonalEntity(db, { spokenName: e.name, category: e.category }));
  return { db, ents };
}

test("a group word on a later page costs more than one on page one", () => {
  const { db, ents } = seededBoard();
  // The seed fits every group on one page — make a genuinely deep board
  // by filling a group past the page boundary with real placements.
  const fillers = [];
  for (let i = 0; i < 60; i++) {
    const e = addPersonalEntity(db, { spokenName: `filler ${i}`, category: "Animals & Nature" });
    placeItem(db, "grp_animals", "entity", e.id);
    fillers.push(e);
  }
  const deepEnt = addPersonalEntity(db, { spokenName: "deep pet", category: "Animals & Nature" });
  placeItem(db, "grp_animals", "entity", deepEnt.id);
  const m = actionModel(db, catalog, [...ents, ...fillers, deepEnt]);
  const deepPath = m.wordPath("entity", deepEnt.id);
  assert.ok(deepPath.pages > 1, `deep item should sit past page one (pages ${deepPath.pages})`);
  const shallow = m.cost("cat");           // page-one group word
  const deep = m.cost("deep pet");
  assert.ok(deep.ms > shallow.ms,
    `deep ${deep.ms}ms should exceed page-one ${shallow.ms}ms`);
});

test("an always-wrong strip is slower than no strip", () => {
  const { db, ents } = seededBoard();
  const m = actionModel(db, catalog, ents);
  const wrong = ["sense:9999", "sense:9998", "sense:9997", "sense:9996"];
  const plain = m.costMessage({ words: ["want", "milk"], decidingMs: 1000 });
  const misled = m.costMessage({ words: ["want", "milk"], decidingMs: 1000 },
    () => wrong);
  assert.ok(misled.ms > plain.ms);
});

test("a shown hit with decoys costs more at the high scan setting", () => {
  const { db, ents } = seededBoard();
  const id = m => m.resolve("milk");
  const low = actionModel(db, catalog, ents, { stripScanMs: 150 });
  const high = actionModel(db, catalog, ents, { stripScanMs: 600 });
  const decoys = (sid) => ["sense:1", `sense:${sid.id}`, "sense:2", "sense:3"];
  const sid = low.resolve("milk");
  const cLow = low.cost("milk", { shown: decoys(sid) });
  const cHigh = high.cost("milk", { shown: decoys(sid) });
  assert.ok(cHigh.ms > cLow.ms);
});

test("a familiar home word is found faster than a rare one", () => {
  const { db, ents } = seededBoard();
  const m = actionModel(db, catalog, ents);
  m.cost("want"); m.cost("want"); m.cost("want");
  const rare = m.cost("want");       // count 3
  const first = actionModel(db, catalog, ents).cost("want"); // count 0
  assert.ok(rare.parts.find < first.parts.find);
});

test("A0 lands near 10 WPM at the middle setting on a fit user", () => {
  const { db, ents } = seededBoard();
  const m = actionModel(db, catalog, ents);
  let words = 0, ms = 0;
  for (const d of user.days) for (const msg of d.messages) {
    ms += m.costMessage(msg).ms;
    words += msg.words.length;
  }
  const v = wpm(words, ms);
  assert.ok(v > 7 && v < 14, `A0 mid WPM ${v.toFixed(1)} outside 7–14`);
});

test("recall_saving brackets the thinking-time saving", () => {
  const { db, ents } = seededBoard();
  const sid = actionModel(db, catalog, ents).resolve("milk");
  const shown = [`sense:${sid.id}`, "sense:1", "sense:2", "sense:3"];
  const zero = actionModel(db, catalog, ents, { recallSaving: 0 });
  const most = actionModel(db, catalog, ents, { recallSaving: 0.9 });
  const c0 = zero.cost("milk", { shown });
  const c9 = most.cost("milk", { shown });
  // At 0 the hit still saves finding + the group walk; at 0.9 it also
  // saves most of the recall — strictly cheaper.
  assert.ok(c9.ms < c0.ms);
  assert.ok(c0.parts.recall > 0, "no recall saving at 0");
});
