/**
 * 011 slice 2 Works Test — one order, same functions (§ 5 merge).
 *
 * Two replicas each make edits offline — including collisions: the same
 * slot taken twice, the same entity renamed twice, a group deleted while
 * the other replica adds to it. A fake relay interleaves the two op
 * streams (preserving each device's own order, as a real relay sees them
 * arrive) and hands back one sequence. Both devices drain it. After the
 * drain the synced tables must be byte-identical, invariants must hold,
 * and the core map must be untouched. The seed prints on failure; rerun
 * with SYNC_SEED=<n> to reproduce.
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
  moveItem,
  placeItem,
  removeItem,
  renameEntity,
  retireEntity,
  restoreEntity,
  setEntityPhoto,
  setSetting,
} from "../../public/shared/groups.mjs";
import { drainOps, ensureBaseline, listOps } from "../../public/shared/ops.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const catalog = buildCatalog(lexicon, parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")));

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

/** Shared starting state: catalog + one shared custom group + one entity. */
const openReplica = () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  db.exec(
    `INSERT INTO personal_entity (id, spoken_name, added_at) VALUES ('ent_shared','Shared',1);
     INSERT INTO board_group (id, kind, name, index_slot) VALUES ('grp_shared','custom','Shared grp',40);
     INSERT INTO group_cell (group_id,item_kind,item_id,page,slot_index,added_at) VALUES ('grp_shared','entity','ent_shared',0,57,1);`,
  );
  ensureBaseline(db);
  return db;
};

const CUSTOM = (db) =>
  db.prepare("SELECT id FROM board_group WHERE kind IN ('custom','my_words')").all().map((r) => r.id);
const ENTITIES = (db) =>
  db.prepare("SELECT id FROM personal_entity WHERE status='active'").all().map((r) => r.id);
const SENSES = (db) => db.prepare("SELECT id FROM sense").all().map((r) => r.id);
const CELLS = (db, gid) =>
  db.prepare("SELECT item_kind, item_id, slot_index FROM group_cell WHERE group_id=?").all(gid);
const FREE_SLOTS = (db, gid) => {
  const used = new Set(
    db.prepare("SELECT slot_index FROM group_cell WHERE group_id=? AND page=0").all(gid).map((r) => r.slot_index),
  );
  const out = [];
  for (let s = 2; s <= 58; s++) if (!used.has(s)) out.push(s);
  return out;
};

const SYNCED_TABLES = [
  "learner_profile", "personal_entity", "board_group", "group_label",
  "clip_override", "entity_enrichment", "group_cell",
];
const dump = (db, t) =>
  db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all().map((r) => JSON.stringify(r));

test("two replicas, colliding edits, one relay order: byte-identical", () => {
  const seed = Number(process.env.SYNC_SEED ?? 20260923);
  const rng = mulberry32(seed);
  const a = openReplica();
  const b = openReplica();

  // Forced collisions — deterministic, so every seed exercises them.
  // Same slot in the same group: one op wins, the loser lands next-free.
  createEntity(a, { id: "ent_a_slot", name: "A slot" });
  placeItem(a, "grp_shared", "entity", "ent_a_slot", { page: 0, slot_index: 2 });
  createEntity(b, { id: "ent_b_slot", name: "B slot" });
  placeItem(b, "grp_shared", "entity", "ent_b_slot", { page: 0, slot_index: 2 });
  // Same entity renamed on both replicas: the later relay seq wins.
  renameEntity(a, "ent_shared", "Shared by A");
  renameEntity(b, "ent_shared", "Shared by B");
  // A deletes grp_doomed while B adds to it.
  createGroup(a, { name: "doomed", id: "grp_doomed", indexSlot: 41 });
  createGroup(b, { name: "doomed", id: "grp_doomed", indexSlot: 41 });
  createEntity(b, { id: "ent_b_doomed", name: "B doomed" });
  placeItem(b, "grp_doomed", "entity", "ent_b_doomed");
  deleteGroup(a, "grp_doomed");
  // Same index slot claimed by two different new groups.
  createGroup(a, { name: "A idx", id: "grp_a_idx", indexSlot: 42 });
  createGroup(b, { name: "B idx", id: "grp_b_idx", indexSlot: 42 });

  // Then a random offline storm on each replica — disjoint entity ids.
  const storm = (db, r, tag, n) => {
    const tryEdit = (fn) => { try { fn(); } catch { /* refused edits are not edits */ } };
    for (let i = 0; i < n; i++) {
      const action = Math.floor(r() * 10);
      const custom = CUSTOM(db);
      const ents = ENTITIES(db);
      const senses = SENSES(db);
      switch (action) {
        case 0:
          tryEdit(() => {
            const id = `ent_${tag}_${i}`;
            createEntity(db, { id, name: `${tag} ${i}` });
            placeItem(db, pick(r, custom), "entity", id);
          });
          break;
        case 1:
          tryEdit(() => placeItem(db, pick(r, custom), "sense", pick(r, senses)));
          break;
        case 2:
          tryEdit(() => {
            const gid = pick(r, custom);
            const cells = CELLS(db, gid), free = FREE_SLOTS(db, gid);
            if (!cells.length || !free.length) throw new Error("none");
            const c = pick(r, cells);
            moveItem(db, gid, c.item_kind, c.item_id, 0, pick(r, free));
          });
          break;
        case 3:
          tryEdit(() => {
            const gid = pick(r, custom);
            const cells = CELLS(db, gid);
            if (!cells.length) throw new Error("none");
            const c = pick(r, cells);
            removeItem(db, gid, c.item_kind, c.item_id);
          });
          break;
        case 4:
          tryEdit(() => renameEntity(db, pick(r, ents), `${tag} rn ${i}`));
          break;
        case 5:
          tryEdit(() => retireEntity(db, pick(r, ents)));
          break;
        case 6:
          tryEdit(() => {
            const retired = db.prepare("SELECT id FROM personal_entity WHERE status='retired'").all();
            if (!retired.length) throw new Error("none");
            restoreEntity(db, pick(r, retired).id);
          });
          break;
        case 7:
          tryEdit(() => setEntityPhoto(db, pick(r, ents), `photo_${tag}_${i}`));
          break;
        case 8:
          tryEdit(() => {
            if (r() < 0.6) createGroup(db, { name: `${tag} grp ${i}` });
            else {
              const victims = custom.filter((g) => g !== "grp_my_words");
              if (!victims.length) throw new Error("none");
              deleteGroup(db, pick(r, victims));
            }
          });
          break;
        case 9:
          tryEdit(() =>
            setSetting(db, pick(r, ["keyboard_mode", "highlight_next"]),
              pick(r, ["pip", "device", "standard", 0, 1])));
          break;
      }
    }
  };
  storm(a, mulberry32(seed + 1), "a", 120);
  storm(b, mulberry32(seed + 2), "b", 120);

  // The fake relay: merge the two streams preserving each device's order
  // (a relay sees ops in arrival order per device), assign one sequence.
  const opsA = listOps(a).map((o) => ({ ...o, device_id: "dev_a" }));
  const opsB = listOps(b).map((o) => ({ ...o, device_id: "dev_b" }));
  const relay = [];
  let i = 0, j = 0;
  while (i < opsA.length || j < opsB.length) {
    if (j >= opsB.length || (i < opsA.length && rng() < 0.5)) relay.push(opsA[i++]);
    else relay.push(opsB[j++]);
  }
  relay.forEach((op, k) => { op.relay_seq = k + 1; });

  drainOps(a, relay);
  drainOps(b, relay);

  for (const t of SYNCED_TABLES) {
    if (process.env.SYNC_DEBUG) {
      const x = dump(a, t), y = dump(b, t);
      const onlyA = x.filter((r) => !y.includes(r));
      const onlyB = y.filter((r) => !x.includes(r));
      if (onlyA.length || onlyB.length) {
        console.log(`${t}: only-A`, onlyA.slice(0, 5), "only-B", onlyB.slice(0, 5));
      }
    }
    assert.deepEqual(dump(a, t), dump(b, t), `${t} diverged (seed ${seed})`);
  }

  // Invariants after merge, on both replicas.
  for (const [tag, db] of [["a", a], ["b", b]]) {
    // No orphan entity: every active entity lives in at least one group.
    const orphans = db.prepare(
      `SELECT e.id FROM personal_entity e WHERE e.status='active' AND NOT EXISTS
       (SELECT 1 FROM group_cell c WHERE c.item_kind='entity' AND c.item_id=e.id)`,
    ).all();
    assert.deepEqual(orphans, [], `${tag}: orphan entities (seed ${seed})`);
    // Built-in group membership unchanged: no seeded sense left its group.
    const fresh = openReplica();
    for (const g of db.prepare("SELECT id FROM board_group WHERE kind='builtin'").all()) {
      const now = db.prepare(
        "SELECT item_id FROM group_cell WHERE group_id=? AND item_kind='sense' ORDER BY item_id",
      ).all(g.id).map((r) => r.item_id);
      const was = fresh.prepare(
        "SELECT item_id FROM group_cell WHERE group_id=? AND item_kind='sense' ORDER BY item_id",
      ).all(g.id).map((r) => r.item_id);
      assert.deepEqual(now, was, `${tag}: builtin ${g.id} lost a sense (seed ${seed})`);
    }
    // Core map untouched.
    assert.deepEqual(dump(db, "core_cell"), dump(fresh, "core_cell"),
      `${tag}: core_cell changed (seed ${seed})`);
  }

  // The doomed group's fate is deterministic on both — and its entity
  // kept a home wherever the merge put it.
  const doomedA = a.prepare("SELECT 1 AS x FROM board_group WHERE id='grp_doomed'").all()[0];
  const doomedB = b.prepare("SELECT 1 AS x FROM board_group WHERE id='grp_doomed'").all()[0];
  assert.deepEqual(doomedA, doomedB);
});

test("a replica's pending ops re-apply on top of the confirmed stream", () => {
  const a = openReplica();
  const b = openReplica();
  // a's own offline edit, never sent: pending — must survive the drain.
  createEntity(a, { id: "ent_a1", name: "Ay" });
  placeItem(a, "grp_shared", "entity", "ent_a1", { page: 0, slot_index: 2 });
  // b claims the same slot and gets confirmed first.
  createEntity(b, { id: "ent_b1", name: "Bee" });
  placeItem(b, "grp_shared", "entity", "ent_b1", { page: 0, slot_index: 2 });
  const relay = listOps(b).map((o, k) => ({ ...o, device_id: "dev_b", relay_seq: k + 1 }));
  drainOps(a, relay);
  drainOps(a, relay); // same stream again — idempotent
  const row = a.prepare(
    "SELECT slot_index FROM group_cell WHERE group_id='grp_shared' AND item_id='ent_a1'",
  ).all()[0];
  assert.ok(row, "pending placement was lost in rebase");
  assert.notEqual(row.slot_index, 2, "pending op displaced the confirmed item");
});
