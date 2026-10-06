/**
 * The two-replica collision scenario, shared by sync_merge.test.mjs (the
 * Works Test) and scripts/ios/export_fixtures.mjs (the iOS parity
 * fixtures — phase 044 A0). One owner on purpose: fixtures must not
 * drift from what the test proves. Rerun with SYNC_SEED=<n>.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import {
  createEntity,
  createGroup,
  deleteGroup,
  moveItem,
  geometryOf,
  placeItem,
  removeItem,
  renameEntity,
  restoreEntity,
  retireEntity,
  setEntityPhoto,
  setSetting,
  swapGroups,
  swapItems,
} from "../../public/shared/groups.mjs";
import { ensureBaseline, listOps } from "../../public/shared/ops.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const catalog = buildCatalog(lexicon, parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")));

export function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

/** Shared starting state: catalog + one shared custom group + one entity.
 *  Pass a file path to persist the replica (fixture export). */
export const openReplica = (path = ":memory:") => {
  const db = createDatabase(path);
  importCatalog(db, catalog);
  db.exec(
    `INSERT INTO personal_entity (id, spoken_name, added_at) VALUES ('ent_shared','Shared',1);
     INSERT INTO board_group (id, kind, name, index_slot) VALUES ('grp_shared','custom','Shared grp',50);
     INSERT INTO group_membership (group_id,item_kind,item_id,added_at) VALUES ('grp_shared','entity','ent_shared',1);
     INSERT INTO group_cell (group_id,layout,item_kind,item_id,page,slot_index) VALUES ('grp_shared','grid60','entity','ent_shared',0,57);`,
  );
  // import took the rebase baseline before these fixture rows — retake it
  // so both replicas start from the same shared state.
  db.exec("DELETE FROM sync_baseline");
  ensureBaseline(db);
  return db;
};

const CUSTOM = (db) =>
  db.prepare("SELECT id FROM board_group WHERE kind IN ('custom','my_words')").all().map((r) => r.id);
const ENTITIES = (db) =>
  db.prepare("SELECT id FROM personal_entity WHERE status='active'").all().map((r) => r.id);
const SENSES = (db) => db.prepare("SELECT id FROM sense").all().map((r) => r.id);
const CELLS = (db, gid) =>
  db.prepare("SELECT item_kind, item_id, slot_index FROM group_cell WHERE group_id=? AND layout='grid60'").all(gid);
const FREE_SLOTS = (db, gid) => {
  const used = new Set(
    db.prepare("SELECT slot_index FROM group_cell WHERE group_id=? AND layout='grid60' AND page=0")
      .all(gid).map((r) => r.slot_index),
  );
  return geometryOf(db, "grid60").content.filter((s) => !used.has(s));
};

/** Forced collisions — deterministic, so every seed exercises them. */
export function forcedCollisions(a, b) {
  // Same cell in the same group: one op wins, the loser lands first-free.
  createEntity(a, { id: "ent_a_slot", name: "A slot" });
  placeItem(a, "grp_shared", "entity", "ent_a_slot", { page: 0, slot_index: 10 });
  createEntity(b, { id: "ent_b_slot", name: "B slot" });
  placeItem(b, "grp_shared", "entity", "ent_b_slot", { page: 0, slot_index: 10 });
  // Same entity renamed on both replicas: the later relay seq wins.
  renameEntity(a, "ent_shared", "Shared by A");
  renameEntity(b, "ent_shared", "Shared by B");
  // A deletes grp_doomed while B adds to it.
  createGroup(a, { name: "doomed", id: "grp_doomed", indexSlot: 51 });
  createGroup(b, { name: "doomed", id: "grp_doomed", indexSlot: 51 });
  createEntity(b, { id: "ent_b_doomed", name: "B doomed" });
  placeItem(b, "grp_doomed", "entity", "ent_b_doomed");
  deleteGroup(a, "grp_doomed");
  // Same index slot claimed by two different new groups.
  createGroup(a, { name: "A idx", id: "grp_a_idx", indexSlot: 52 });
  createGroup(b, { name: "B idx", id: "grp_b_idx", indexSlot: 52 });
  /* Non-idempotent swaps ride the stream too (044 A0): a swap re-applied
   *  undoes itself, so every replay path must apply it exactly once.
   *  Each replica's swaps land on groups/items that exist there; the
   *  other replica's replay skips them (its targets never arrived). */
  swapItems(a, "grp_shared",
    { item_kind: "entity", item_id: "ent_shared" },
    { item_kind: "entity", item_id: "ent_a_slot" }, "grid60");
  swapGroups(a, "grp_a_idx", "grp_shared");
  swapItems(b, "grp_shared",
    { item_kind: "entity", item_id: "ent_shared" },
    { item_kind: "entity", item_id: "ent_b_slot" }, "grid60");
  swapGroups(b, "grp_doomed", "grp_b_idx");
}

/** A random offline storm on one replica — disjoint entity ids by tag. */
export function storm(db, r, tag, n) {
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
}

/** The fake relay: merge two streams preserving each device's order,
 *  assign one sequence (a relay sees ops in arrival order per device). */
export function mergeStreams(rng, opsA, opsB) {
  const relay = [];
  let i = 0, j = 0;
  while (i < opsA.length || j < opsB.length) {
    if (j >= opsB.length || (i < opsA.length && rng() < 0.5)) relay.push(opsA[i++]);
    else relay.push(opsB[j++]);
  }
  relay.forEach((op, k) => { op.relay_seq = k + 1; });
  return relay;
}

/**
 * The full pre-drain scenario: two replicas, forced collisions, a storm
 * on each, and the merged relay stream. Returns the live dbs and their
 * recorded ops so callers can replay or snapshot any pre-drain state.
 */
export function buildScenario(seed) {
  const rng = mulberry32(seed);
  const a = openReplica();
  const b = openReplica();
  forcedCollisions(a, b);
  storm(a, mulberry32(seed + 1), "a", 120);
  storm(b, mulberry32(seed + 2), "b", 120);
  const opsA = listOps(a).map((o) => ({ ...o, device_id: "dev_a" }));
  const opsB = listOps(b).map((o) => ({ ...o, device_id: "dev_b" }));
  const relay = mergeStreams(rng, opsA, opsB);
  return { a, b, opsA, opsB, relay };
}
