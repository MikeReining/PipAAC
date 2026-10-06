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
 *
 * The scenario itself lives in ./merge_scenario.mjs — the iOS parity
 * fixtures (scripts/ios/export_fixtures.mjs, phase 044 A0) generate from
 * the same code so the two proofs can never drift.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildScenario,
  openReplica,
} from "./merge_scenario.mjs";
import {
  createEntity,
  geometryOf,
  placeItem,
} from "../../public/shared/groups.mjs";
import { drainOps, listOps } from "../../public/shared/ops.mjs";

const SYNCED_TABLES = [
  "learner_profile", "personal_entity", "board_group", "group_label",
  "clip_override", "entity_enrichment", "group_membership", "group_cell", "group_seed_install",
];
const dump = (db, t) =>
  db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all().map((r) => JSON.stringify(r));

test("two replicas, colliding edits, one relay order: byte-identical", () => {
  const seed = Number(process.env.SYNC_SEED ?? 20260923);
  const { a, b, relay } = buildScenario(seed);

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
    // Every position belongs to a member and sits on a content cell —
    // no merge ever lands a word on a reserved cell (027 § 3.2).
    const content = new Set(geometryOf(db, "grid60").content);
    const stray = db.prepare(
      `SELECT c.group_id, c.item_id, c.slot_index FROM group_cell c WHERE NOT EXISTS
       (SELECT 1 FROM group_membership m WHERE m.group_id=c.group_id
          AND m.item_kind=c.item_kind AND m.item_id=c.item_id)`,
    ).all();
    assert.deepEqual(stray, [], `${tag}: positions without membership (seed ${seed})`);
    const reserved = db.prepare("SELECT group_id, item_id, slot_index FROM group_cell WHERE layout='grid60'")
      .all().filter((c) => !content.has(c.slot_index));
    assert.deepEqual(reserved, [], `${tag}: a position on a reserved cell (seed ${seed})`);
    // The storm edits only custom groups: built-in membership is unchanged.
    const fresh = openReplica();
    for (const g of db.prepare("SELECT id FROM board_group WHERE kind='builtin'").all()) {
      const now = db.prepare(
        "SELECT item_id FROM group_membership WHERE group_id=? AND item_kind='sense' ORDER BY item_id",
      ).all(g.id).map((r) => r.item_id);
      const was = fresh.prepare(
        "SELECT item_id FROM group_membership WHERE group_id=? AND item_kind='sense' ORDER BY item_id",
      ).all(g.id).map((r) => r.item_id);
      assert.deepEqual(now, was, `${tag}: builtin ${g.id} lost a sense (seed ${seed})`);
    }
    // Core map untouched.
    assert.deepEqual(dump(db, "core_cell"), dump(fresh, "core_cell"),
      `${tag}: core_cell changed (seed ${seed})`);
  }

  // The doomed group's fate is deterministic on both; B's add into it is
  // skipped, not redirected (027 § 3.4).
  const doomedA = a.prepare("SELECT 1 AS x FROM board_group WHERE id='grp_doomed'").all()[0];
  const doomedB = b.prepare("SELECT 1 AS x FROM board_group WHERE id='grp_doomed'").all()[0];
  assert.deepEqual(doomedA, doomedB);
});

test("a replica's pending ops re-apply on top of the confirmed stream", () => {
  const a = openReplica();
  const b = openReplica();
  // a's own offline edit, never sent: pending — must survive the drain.
  createEntity(a, { id: "ent_a1", name: "Ay" });
  placeItem(a, "grp_shared", "entity", "ent_a1", { page: 0, slot_index: 10 });
  // b claims the same slot and gets confirmed first.
  createEntity(b, { id: "ent_b1", name: "Bee" });
  placeItem(b, "grp_shared", "entity", "ent_b1", { page: 0, slot_index: 10 });
  const relay = listOps(b).map((o, k) => ({ ...o, device_id: "dev_b", relay_seq: k + 1 }));
  drainOps(a, relay);
  drainOps(a, relay); // same stream again — idempotent
  const row = a.prepare(
    "SELECT slot_index FROM group_cell WHERE group_id='grp_shared' AND item_id='ent_a1'",
  ).all()[0];
  assert.ok(row, "pending placement was lost in rebase");
  assert.notEqual(row.slot_index, 10, "pending op displaced the confirmed item");
});
