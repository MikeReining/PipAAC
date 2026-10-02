/**
 * The person's name survives restore and linking (2026-10-02): it rides
 * the synced profile. Device A names the person; its op log replays on a
 * fresh device B (what a card restore or a new link does); B's people
 * list picks the name up from the profile.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { drainOps, ensureBaseline, listOps } from "../../public/shared/ops.mjs";
import { followProfileName, nameToProfile, profileName } from "../../public/shared/person_name.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const catalog = buildCatalog(lexicon, parseCoordinateMapMarkdown(
  readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")));

const device = () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  ensureBaseline(db);
  return db;
};
const person = (fields = {}) => {
  const me = { name: "", ...fields };
  return { me, saveUser: async (patch) => { Object.assign(me, patch); nameToProfile(db0, patch); } };
};
let db0; // the db a person's saveUser writes through, set per device

test("a name set on one device reaches a restored device's people list", async () => {
  const a = device();
  db0 = a;
  const pa = person();
  await pa.saveUser({ name: "Maya" }); // the welcome's name step
  assert.equal(profileName(a), "Maya");
  const ops = listOps(a).filter((o) => o.kind === "set_setting");
  assert.equal(ops.length, 1, "one op for the name");
  assert.match(ops[0].args, /"person_name"/);

  // B: fresh device, nameless person (a card restore adds it unnamed).
  const b = device();
  db0 = b;
  const pb = person();
  drainOps(b, listOps(a).map((o, i) => ({ ...o, relay_seq: i + 1 })));
  await followProfileName(b, pb.me, pb.saveUser);
  assert.equal(pb.me.name, "Maya");
  assert.equal(listOps(b).filter((o) => o.relay_seq === null && o.kind === "set_setting").length,
    0, "following the profile records no new name op");
});

test("saving the same name again records nothing; a rename records once", async () => {
  const a = device();
  db0 = a;
  const p = person();
  await p.saveUser({ name: "Maya" });
  await p.saveUser({ name: "Maya" });
  await p.saveUser({ name: "Maya R" });
  const names = listOps(a).filter((o) => o.kind === "set_setting")
    .map((o) => JSON.parse(o.args).value);
  assert.deepEqual(names, ["Maya", "Maya R"]);
});

test("a rename made while the person wasn't open lands on their next open", async () => {
  const a = device();
  db0 = a;
  const p = person({ name: "Maya" });
  await followProfileName(a, p.me, p.saveUser); // first open backfills the profile
  assert.equal(profileName(a), "Maya");
  // Team & devices renamed them from another person's session.
  p.me.name = "Maya Lee";
  p.me.nameDirty = true;
  await followProfileName(a, p.me, p.saveUser);
  assert.equal(profileName(a), "Maya Lee");
  assert.equal(p.me.nameDirty, false);
});
