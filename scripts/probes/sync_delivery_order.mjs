/** Deterministic reproduction for the outstanding ordered-replay defect.
 * No relay, network, credentials or persistent family data is touched.
 * Exit 1 while replicas disagree; promote this into the sync proof on repair.
 */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { createDatabase, importCatalog } from "../../src/board/catalog.mjs";
import { createEntity, renameEntity } from "../../public/shared/groups.mjs";
import { drainOps, ensureBaseline, listOps } from "../../public/shared/ops.mjs";

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
    const pushed = replica(), ordered = replica();
    drainOps(pushed, setup);
    drainOps(ordered, setup);
    // sync.mjs currently drains a later live push before the catch-up fetch.
    drainOps(pushed, [renames[1]]);
    drainOps(pushed, renames);
    drainOps(ordered, renames);
    const name = (db) => db.prepare(
      "SELECT spoken_name FROM personal_entity WHERE id = 'ent_order_probe'",
    ).get().spoken_name;
    return { laterPushThenFetch: name(pushed), orderedFetch: name(ordered),
      sequences: renames.map((o) => o.relay_seq) };
  } finally { for (const db of databases) db.close(); }

}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = compareDeliveryOrder();
  console.log(JSON.stringify(result));
  assert.equal(result.laterPushThenFetch, result.orderedFetch,
    "the same relay log must produce the same final name");
}
