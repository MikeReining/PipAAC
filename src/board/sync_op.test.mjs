/**
 * 011 slice 1 Works Test — every adult edit is an op, and replaying the
 * ops through the same write owners rebuilds the synced tables exactly.
 *
 * The lie-prone layer is an edit path that writes a table directly and
 * skips the op. This test finds it by comparing replay with reality: a
 * seeded random sequence of 500 edits across every edit path, replayed
 * into a fresh database — synced tables must be byte-identical. The seed
 * prints on failure; rerun with SYNC_SEED=<n> to reproduce.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import {
  createEntity,
  createGroup,
  deleteGroup,
  moveGroup,
  moveItem,
  geometryOf,
  placeItem,
  removeItem,
  removeItemUndoable,
  renameEntity,
  restoreEntity,
  retireEntity,
  setEntityPhoto,
  setSetting,
  swapGroups,
  swapItems,
} from "../../public/shared/groups.mjs";
import { listOps, replayOps } from "../../public/shared/ops.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const catalog = buildCatalog(lexicon, parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")));

const openDb = () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
};

/** Deterministic PRNG so a failure reproduces. */
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const CUSTOM = (db) =>
  db.prepare("SELECT id FROM board_group WHERE kind IN ('custom','my_words')").all().map((r) => r.id);
const ENTITIES = (db) =>
  db.prepare("SELECT id FROM personal_entity WHERE status='active'").all().map((r) => r.id);
const SENSES = (db) =>
  db.prepare("SELECT id FROM sense").all().map((r) => r.id);
const CELLS = (db, gid) =>
  db.prepare("SELECT item_kind, item_id, slot_index FROM group_cell WHERE group_id=? AND layout='grid60'").all(gid);
const GROUPS = (db) => db.prepare("SELECT id, index_slot FROM board_group").all();
const FREE_SLOTS = (db, gid) => {
  const used = new Set(
    db.prepare("SELECT slot_index FROM group_cell WHERE group_id=? AND layout='grid60' AND page=0")
      .all(gid).map((r) => r.slot_index),
  );
  return geometryOf(db, "grid60").content.filter((s) => !used.has(s));
};

const SYNCED_TABLES = [
  "personal_entity", "board_group", "group_membership", "group_cell", "group_seed_install",
  "clip_override", "entity_enrichment",
];

const dump = (db, t) =>
  db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all().map((r) => JSON.stringify(r));

/** learner_profile minus per-device secrets — the synced settings columns. */
const profileDump = (db) =>
  db.prepare(
    "SELECT preferred_voice_id, keyboard_mode, keyboard_order, highlight_next, locale FROM learner_profile",
  ).all();

test("seeded 500-edit storm: replay rebuilds synced tables byte-identical", () => {
  const seed = Number(process.env.SYNC_SEED ?? 20260923);
  const rng = mulberry32(seed);
  const db = openDb();
  // Baseline: a ready override + enrichment so renames have something to supersede.
  db.exec(
    `INSERT INTO personal_entity (id, spoken_name, added_at) VALUES ('ent_seed','Seed',1);
     INSERT INTO clip_override (id, entity_id, recorded_text, key, status) VALUES ('ovr_seed','ent_seed','Seed','aud_seed','ready');
     INSERT INTO entity_enrichment (id, entity_id, model, prompt_version, status) VALUES ('enr_seed','ent_seed','m','p1','ready');
     INSERT INTO group_membership (group_id,item_kind,item_id,added_at) VALUES ('grp_people','entity','ent_seed',1);
     INSERT INTO group_cell (group_id,layout,item_kind,item_id,page,slot_index) VALUES ('grp_people','grid60','entity','ent_seed',0,58);`,
  );

  const counts = {};
  const mark = (k) => { counts[k] = (counts[k] ?? 0) + 1; };
  const tryEdit = (kind, fn) => { try { fn(); mark(kind); } catch { /* refused edits are not edits */ } };

  for (let i = 0; i < 500; i++) {
    const action = Math.floor(rng() * 14);
    const custom = CUSTOM(db);
    const ents = ENTITIES(db);
    const senses = SENSES(db);
    const groups = GROUPS(db);
    switch (action) {
      case 0: // add entity + place it
        tryEdit("create_entity+place", () => {
          const id = `ent_storm_${i}`;
          createEntity(db, { id, name: `Storm ${i}`, hint: "test" });
          placeItem(db, pick(rng, custom.concat(groups.map((g) => g.id))), "entity", id);
        });
        break;
      case 1: // place a sense into a non-builtin group
        tryEdit("place_sense", () =>
          placeItem(db, pick(rng, custom), "sense", pick(rng, senses), null));
        break;
      case 2: // place an entity somewhere else
        tryEdit("place_entity", () => {
          if (!ents.length) throw new Error("none");
          placeItem(db, pick(rng, custom.concat(groups.map((g) => g.id))), "entity", pick(rng, ents));
        });
        break;
      case 3: // move an item to a free slot
        tryEdit("move_item", () => {
          const gid = pick(rng, custom.concat(groups.map((g) => g.id)));
          const cells = CELLS(db, gid);
          const free = FREE_SLOTS(db, gid);
          if (!cells.length || !free.length) throw new Error("none");
          const c = pick(rng, cells);
          moveItem(db, gid, c.item_kind, c.item_id, 0, pick(rng, free));
        });
        break;
      case 4: // swap two items
        tryEdit("swap_items", () => {
          const gid = pick(rng, custom.concat(groups.map((g) => g.id)));
          const cells = CELLS(db, gid);
          if (cells.length < 2) throw new Error("none");
          swapItems(db, gid, pick(rng, cells), pick(rng, cells));
        });
        break;
      case 5: // remove an item — from any group, built-ins too (027 § 3.4)
        tryEdit("remove_item", () => {
          const gid = pick(rng, groups.map((g) => g.id));
          const cells = CELLS(db, gid);
          if (!cells.length) throw new Error("none");
          const c = pick(rng, cells);
          removeItem(db, gid, c.item_kind, c.item_id);
        });
        break;
      case 6: // remove + undo
        tryEdit("remove+undo", () => {
          const gid = pick(rng, groups.map((g) => g.id));
          const cells = CELLS(db, gid);
          if (!cells.length) throw new Error("none");
          const c = pick(rng, cells);
          removeItemUndoable(db, gid, c.item_kind, c.item_id).undo();
        });
        break;
      case 7: // rename an entity (also supersedes override/enrichment)
        tryEdit("rename", () => {
          if (!ents.length) throw new Error("none");
          renameEntity(db, pick(rng, ents), `Renamed ${i}`);
        });
        break;
      case 8: // retire
        tryEdit("retire", () => {
          if (!ents.length) throw new Error("none");
          retireEntity(db, pick(rng, ents));
        });
        break;
      case 9: // restore
        tryEdit("restore", () => {
          const retired = db.prepare("SELECT id FROM personal_entity WHERE status='retired'").all();
          if (!retired.length) throw new Error("none");
          restoreEntity(db, pick(rng, retired).id);
        });
        break;
      case 10: // set entity photo key
        tryEdit("set_photo", () => {
          if (!ents.length) throw new Error("none");
          setEntityPhoto(db, pick(rng, ents), `photo_${i}`);
        });
        break;
      case 11: // create or delete a custom group
        tryEdit("group_lifecycle", () => {
          const customs = CUSTOM(db).filter((g) => g !== "grp_my_words");
          if (rng() < 0.6) createGroup(db, { name: `Storm grp ${i}` });
          else {
            if (!customs.length) throw new Error("none");
            deleteGroup(db, pick(rng, customs));
          }
        });
        break;
      case 12: // move or swap groups on the index
        tryEdit("group_arrange", () => {
          if (rng() < 0.5) {
            const freeIdx = [];
            for (let s = 10; s < 60; s++) freeIdx.push(s);
            const usedIdx = new Set(groups.map((g) => g.index_slot));
            const open = freeIdx.filter((s) => !usedIdx.has(s));
            if (!open.length) throw new Error("none");
            moveGroup(db, pick(rng, groups).id, pick(rng, open));
          } else {
            swapGroups(db, pick(rng, groups).id, pick(rng, groups).id);
          }
        });
        break;
      case 13: // a synced profile setting
        tryEdit("set_setting", () =>
          setSetting(db, pick(rng, ["keyboard_mode", "keyboard_order", "highlight_next"]),
            pick(rng, ["pip", "device", "standard", "abc", 0, 1])));
        break;
    }
  }

  const ops = listOps(db);
  assert.ok(ops.length > 300, `storm produced ${ops.length} ops (seed ${seed})`);

  // Replay into a fresh catalog baseline.
  const replay = openDb();
  replay.exec(
    `INSERT INTO personal_entity (id, spoken_name, added_at) VALUES ('ent_seed','Seed',1);
     INSERT INTO clip_override (id, entity_id, recorded_text, key, status) VALUES ('ovr_seed','ent_seed','Seed','aud_seed','ready');
     INSERT INTO entity_enrichment (id, entity_id, model, prompt_version, status) VALUES ('enr_seed','ent_seed','m','p1','ready');
     INSERT INTO group_membership (group_id,item_kind,item_id,added_at) VALUES ('grp_people','entity','ent_seed',1);
     INSERT INTO group_cell (group_id,layout,item_kind,item_id,page,slot_index) VALUES ('grp_people','grid60','entity','ent_seed',0,58);`,
  );
  replayOps(replay, ops);

  for (const t of SYNCED_TABLES) {
    if (process.env.SYNC_DEBUG) {
      const a = dump(db, t), b = dump(replay, t);
      const onlyA = a.filter((x) => !b.includes(x));
      const onlyB = b.filter((x) => !a.includes(x));
      if (onlyA.length || onlyB.length) {
        console.log(`${t}: only-orig`, onlyA.slice(0, 5), "only-replay", onlyB.slice(0, 5));
      }
    }
    assert.deepEqual(dump(replay, t), dump(db, t), `${t} diverged (seed ${seed}; ops ${JSON.stringify(counts)})`);
  }
  assert.deepEqual(profileDump(replay), profileDump(db), `profile diverged (seed ${seed})`);
});

test("an op carries intent: placement ids and timestamps survive replay", () => {
  const db = openDb();
  const { id } = createEntity(db, { name: "Cooper" });
  placeItem(db, "grp_people", "entity", id);
  const replay = openDb();
  replayOps(replay, listOps(db));
  const row = replay.prepare("SELECT * FROM group_cell WHERE item_id=?").all(id)[0];
  const orig = db.prepare("SELECT * FROM group_cell WHERE item_id=?").all(id)[0];
  assert.deepEqual(row, orig);
});
