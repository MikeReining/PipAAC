/**
 * F01/F02 regression — the baseline checkpoint must make replay honest.
 *
 * Before the watermark, drainOps replayed the WHOLE confirmed log on top
 * of a baseline that already contained it: a second drain undid swaps
 * and re-ran renames that superseded recordings. And the cursor lived in
 * the registry while the state lived in the database — a failed save
 * still advanced it, so a restart skipped edits that never persisted.
 *
 * These tests run the real drainOps over real tables and assert the
 * actual cells/rows — red on the old replay-all code, green under the
 * contiguous-suffix watermark.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import {
  createEntity,
  createGroup,
  placeItem,
  renameEntity,
  swapGroups,
} from "../../public/shared/groups.mjs";
import { setOverride } from "../../public/shared/voice.mjs";
import * as opsNs from "../../public/shared/ops.mjs";

const { adoptSnapshot, drainOps, listOps, snapshotSynced } = opsNs;
// Missing on pre-fix code: the fallback lets the red run show the real
// replay bugs instead of dying at import.
const appliedSeqOf = opsNs.appliedSeqOf ?? (() => 0);
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const catalog = buildCatalog(
  lexicon,
  parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")),
);

const openReplica = () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
};
const relay = (db, start = 1) =>
  listOps(db).map((o, i) => ({ ...o, relay_seq: start + i }));
const slot = (db, id) =>
  db.prepare("SELECT index_slot AS s FROM board_group WHERE id = ?").all(id)[0]?.s;
const dumpSynced = (db) =>
  Object.fromEntries(
    Object.entries(snapshotSynced(db)).map(([t, rows]) => [t, rows.map((r) => JSON.stringify(r))]),
  );

test("a confirmed swap is not undone by a second drain", () => {
  const a = openReplica();
  const b = openReplica();
  createGroup(a, { name: "Ga", id: "grp_wa", indexSlot: 80 });
  createGroup(b, { name: "Gb", id: "grp_wb", indexSlot: 81 });
  const setup = [...relay(a, 1), ...relay(b, 3)];
  for (const d of [a, b]) drainOps(d, setup);
  assert.equal(slot(a, "grp_wa"), 80);
  assert.equal(slot(a, "grp_wb"), 81);

  swapGroups(a, "grp_wa", "grp_wb");
  const swap = listOps(a).filter((o) => o.relay_seq === null)
    .map((o, i) => ({ ...o, relay_seq: 5 + i }));
  drainOps(a, swap);
  assert.equal(slot(a, "grp_wa"), 81, "the swap must apply once");
  // Repeated delivery — the same confirmed rows again (live push +
  // catch-up overlap is the normal path, not an edge case).
  drainOps(a, swap);
  assert.equal(slot(a, "grp_wa"), 81, "the second drain must not undo the swap");
  assert.equal(slot(a, "grp_wb"), 80);
});

test("replayed renames do not retire a ready recording", () => {
  const a = openReplica();
  createEntity(a, { id: "ent_rec", name: "Middle" });
  renameEntity(a, "ent_rec", "New");
  // A recording made against the final name: replaying the historical
  // renames a second time must not flip it back to superseded.
  const stream = relay(a);
  drainOps(a, stream);
  setOverride(a, {
    itemKind: "entity", itemId: "ent_rec",
    recordedText: "New", key: "clip_test_rec",
  });
  const ready = () =>
    a.prepare(
      "SELECT status FROM clip_override WHERE entity_id = 'ent_rec'",
    ).all()[0]?.status;
  assert.equal(ready(), "ready");
  const overrideOp = listOps(a).filter((o) => o.relay_seq === null)
    .map((o, i) => ({ ...o, relay_seq: stream.length + 1 + i }));
  drainOps(a, overrideOp);
  drainOps(a, [...stream, ...overrideOp]); // repeated full delivery
  assert.equal(ready(), "ready", "a duplicate drain must not supersede the recording");
});

test("the whole synced state is identical after duplicate and rebatched drains", () => {
  const a = openReplica();
  const b = openReplica();
  createEntity(a, { id: "ent_m1", name: "One" });
  createGroup(a, { name: "S2", id: "grp_s2", indexSlot: 82 });
  placeItem(a, "grp_s2", "entity", "ent_m1");
  renameEntity(a, "ent_m1", "One renamed");
  const stream = relay(a);
  drainOps(b, stream);
  const once = dumpSynced(b);
  // Same stream again, then split into halves as a second delivery.
  drainOps(b, stream);
  drainOps(b, stream.slice(0, 2));
  assert.deepEqual(dumpSynced(b), once, "duplicate/batched delivery must converge identically");
});

test("sparse streams apply each op once — a late op is never skipped", () => {
  // Relay numbering is not dense: a deduped resubmit burns a seq, and
  // a live push can land ahead of catch-up. What the checkpoint must
  // guarantee is per-op once-ness — not dense contiguity.
  const a = openReplica();
  const b = openReplica();
  createEntity(a, { id: "ent_gap", name: "Gap" });
  createEntity(a, { id: "ent_late", name: "Late" });
  const stream = relay(a); // seed_install + 2 creates → seqs 1..3
  const [seed, gap, late] = stream;
  // Deliver seq 1 and seq 3 — seq 2 is still in flight (or burned).
  drainOps(b, [seed, late]);
  assert.ok(
    b.prepare("SELECT 1 AS x FROM personal_entity WHERE id = 'ent_late'").all()[0],
    "a gap must not block the ops that did arrive",
  );
  // The missing seq catches up — it is applied, never skipped, and a
  // repeated delivery does not apply anything twice.
  drainOps(b, [gap]);
  assert.ok(b.prepare("SELECT 1 AS x FROM personal_entity WHERE id = 'ent_gap'").all()[0]);
  const once = dumpSynced(b);
  drainOps(b, stream); // full redelivery
  assert.deepEqual(dumpSynced(b), once, "redelivery converges identically");
  assert.equal(appliedSeqOf(b), stream.length, "the watermark reflects applied coverage");
});

test("legacy baselines (NULL watermark) upgrade without double-apply or loss", () => {
  const a = openReplica();
  const b = openReplica();
  createGroup(a, { name: "La", id: "grp_la", indexSlot: 83 });
  const stream = relay(a);
  drainOps(b, stream);
  // Forge the pre-watermark world: a baseline that contains the
  // confirmed stream but carries no stamp.
  b.prepare("UPDATE sync_baseline SET applied_seq = NULL WHERE id = 1").run();
  assert.ok(
    b.prepare("SELECT applied_seq FROM sync_baseline WHERE id = 1").all()[0].applied_seq === null,
  );
  createGroup(b, { name: "Lb", id: "grp_lb", indexSlot: 84 });
  swapGroups(b, "grp_la", "grp_lb");
  const swap = listOps(b).filter((o) => o.relay_seq === null)
    .map((o, i) => ({ ...o, relay_seq: stream.length + 1 + i }));
  drainOps(b, swap);
  assert.equal(slot(b, "grp_la"), 84, "the post-upgrade drain must not replay the old prefix");
  // A legacy EMPTY baseline (095302a3 damage): the device carries the
  // confirmed stream in its log but the stored baseline contains none
  // of it. Full replay is the honest heal — and the boards come back.
  const c = openReplica();
  drainOps(c, stream); // once-healthy: confirmed ops 1..N in the log
  const emptyTables = Object.fromEntries(
    Object.keys(snapshotSynced(c)).map((t) => [t, []]),
  );
  c.exec(`DELETE FROM group_cell; DELETE FROM group_membership;
          DELETE FROM board_group; DELETE FROM group_seed_install`);
  // The schema upgrade leaves every op unflagged — the same state a
  // migrated damaged device is actually in.
  c.exec("UPDATE sync_op SET applied = 0");
  c.prepare("UPDATE sync_baseline SET tables = ?, applied_seq = NULL WHERE id = 1")
    .run(JSON.stringify(emptyTables));
  createEntity(a, { id: "ent_heal", name: "Heal" });
  // Only the new op is new to the relay — it takes the next seq.
  const heal = [{ ...listOps(a).at(-1), relay_seq: stream.length + 1 }];
  drainOps(c, heal);
  assert.ok(c.prepare("SELECT 1 AS x FROM personal_entity WHERE id = 'ent_heal'").all()[0],
    "a legacy empty baseline must replay the whole log");
  assert.ok(c.prepare("SELECT 1 AS x FROM board_group WHERE id = 'grp_la'").all()[0],
    "the replayed stream rebuilds what the empty baseline lost");
  assert.equal(appliedSeqOf(c), stream.length + heal.length, "the heal stamps the watermark");
});

test("a failed replay leaves the baseline and watermark untouched", () => {
  const a = openReplica();
  createEntity(a, { id: "ent_ok", name: "Ok" });
  drainOps(a, relay(a));
  const applied0 = appliedSeqOf(a);
  const before = dumpSynced(a);
  // An op kind from a newer app version — applyOp throws mid-replay.
  const bad = [{ op_id: "op_future", device_id: "dev_x", kind: "never_heard_of",
    args: "{}", created_at: 1, relay_seq: applied0 + 1 }];
  assert.throws(() => drainOps(a, bad));
  assert.equal(appliedSeqOf(a), applied0, "the watermark must not move on failure");
  assert.deepEqual(dumpSynced(a), before, "a partial replay must not persist");
});

test("adoptSnapshot stamps its watermark and keeps pending edits applied", () => {
  const donor = openReplica();
  createEntity(donor, { id: "ent_donor", name: "Donor" });
  const recipient = openReplica();
  createEntity(recipient, { id: "ent_pending", name: "Pending" });
  adoptSnapshot(recipient, snapshotSynced(donor), 500);
  assert.equal(appliedSeqOf(recipient), 500, "the baseline claims exactly what it adopted");
  assert.ok(
    recipient.prepare("SELECT 1 AS x FROM personal_entity WHERE id = 'ent_pending'").all()[0],
    "a pending edit must be re-applied after adoption wipes it",
  );
  assert.ok(
    recipient.prepare("SELECT 1 AS x FROM personal_entity WHERE id = 'ent_donor'").all()[0],
    "the adopted state must be present",
  );
  // Ops at or below the snapshot's seq must not replay over it.
  drainOps(recipient, [{ op_id: "op_old", device_id: "dev_x", kind: "rename_entity",
    args: JSON.stringify({ id: "ent_pending", name: "Hijack" }),
    created_at: 1, relay_seq: 499 }]);
  assert.equal(
    recipient.prepare("SELECT spoken_name AS n FROM personal_entity WHERE id = 'ent_pending'")
      .all()[0].n,
    "Pending",
    "an op covered by the adopted watermark must not re-apply",
  );
});
