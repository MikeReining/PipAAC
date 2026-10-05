/** Deterministic reproduction for ordered-replay convergence.
 * No relay, network, credentials or persistent family data is touched.
 * Exit 1 while replicas disagree.
 */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { createDatabase, importCatalog } from "../../src/board/catalog.mjs";
import { createEntity, renameEntity } from "../../public/shared/groups.mjs";
import { adoptSnapshot, confirmOps, drainOps, ensureBaseline, listOps, snapshotSynced } from "../../public/shared/ops.mjs";

const catalog = JSON.parse(readFileSync(new URL("../../public/catalog.json", import.meta.url), "utf8"));
export function compareDeliveryOrder() {
  const databases = [];
  function replica() {
    const db = createDatabase(":memory:");
    databases.push(db);
    importCatalog(db, catalog);
    ensureBaseline(db);
    return db;
  }
  try {
    const donor = replica();
    createEntity(donor, { id: "ent_order_probe", name: "Initial" });
    const setup = listOps(donor).map((o, i) => ({ ...o, relay_seq: i + 1 }));
    drainOps(donor, setup);
    renameEntity(donor, "ent_order_probe", "Older");
    renameEntity(donor, "ent_order_probe", "Newer");
    const renames = listOps(donor).filter((o) => o.relay_seq === null)
      .map((o, i) => ({ ...o, relay_seq: setup.length + 1 + i }));
    const pushed = replica(), ordered = replica(), acked = replica();
    drainOps(pushed, setup);
    drainOps(ordered, setup);
    drainOps(acked, setup);
    // A live push can land the later op before a catch-up fetch
    // delivers the earlier one. Pushes overlay onto live state without
    // folding — only fetched pages move coverage.
    drainOps(pushed, [renames[1]], { fetched: false });
    // ownAckThenFetch: the device edits locally — a real pending row —
    // the submit acknowledgement stamps its relay_seq via confirmOps
    // (the path client.submit's answer takes), and only then does a
    // fetched page deliver the earlier foreign op plus the relay's
    // echo of the device's own confirmed op.
    renameEntity(acked, "ent_order_probe", "Newer");
    const mine = listOps(acked).find((o) => o.relay_seq === null);
    confirmOps(acked, [{ op_id: mine.op_id, relay_seq: renames[1].relay_seq }]);
    drainOps(acked, [renames[0], { ...mine, relay_seq: renames[1].relay_seq }]);
    // A pending local edit must survive the order repair's re-replay.
    createEntity(pushed, { id: "ent_pending_probe", name: "Pending" });
    drainOps(pushed, renames);
    drainOps(ordered, renames);
    // A pushed op folded ahead of a snapshot adoption: the snapshot
    // covers only up to the earlier rename; the pushed op must replay
    // over the adopted state rather than stay flagged-and-lost.
    const snapDonor = replica();
    drainOps(snapDonor, setup);
    drainOps(snapDonor, [renames[0]]);
    const snapTables = snapshotSynced(snapDonor);
    const adop = replica();
    drainOps(adop, setup);
    drainOps(adop, [renames[1]], { fetched: false });
    adoptSnapshot(adop, snapTables, renames[0].relay_seq);
    drainOps(adop, []);
    const name = (db) => db.prepare(
      "SELECT spoken_name FROM personal_entity WHERE id = 'ent_order_probe'",
    ).get().spoken_name;
    return { laterPushThenFetch: name(pushed), ownAckThenFetch: name(acked),
      orderedFetch: name(ordered), snapshotThenTail: name(adop),
      pendingKept: !!pushed.prepare(
        "SELECT 1 FROM personal_entity WHERE id = 'ent_pending_probe'").get(),
      sequences: renames.map((o) => o.relay_seq) };
  } finally { for (const db of databases) db.close(); }

}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = compareDeliveryOrder();
  console.log(JSON.stringify(result));
  assert.equal(result.laterPushThenFetch, result.orderedFetch,
    "the same relay log must produce the same final name");
  assert.equal(result.ownAckThenFetch, result.orderedFetch);
  assert.equal(result.snapshotThenTail, result.orderedFetch,
    "a pushed op above the snapshot seq must replay over adopted state");
  assert.ok(result.pendingKept, "the order repair must keep pending edits");
}
