/**
 * picture-fill.js: the finder is asked only when a personal word still
 * needs something from it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createDatabase } from "./catalog.mjs";
import { mountPictureFill } from "../../public/board/picture-fill.js";
import { createEntity } from "../../public/shared/groups.mjs";

function harness(entity) {
  const db = createDatabase(":memory:");
  createEntity(db, { id: "ent_x", name: "Zorp", ...entity });
  const finds = [];
  const client = {
    async find(a) { finds.push(a); return { candidates: [], auto: null, scope: "personal", kind: "None" }; },
    async draw() { return { ok: false, reason: "allowance" }; },
    async imageBlob() { return null; },
  };
  const fill = mountPictureFill({
    db, all: (d, sql, p = []) => d.prepare(sql).all(...p), locale: "en", client,
    creds: async () => ({ userId: "u", license: null }),
    savePhoto: async () => ({ key: "blob:1", bytes: new Uint8Array(1) }),
    syncUploadBlob: () => Promise.resolve(), storage: null,
  });
  return { fill, finds };
}

test("opening a word that already has its picture and kind does not run the finder", async () => {
  const { fill, finds } = harness({ photoKey: "blob:9", role: "Blue" });
  await fill.autoFill("ent_x");
  assert.equal(finds.length, 0);
});

test("a word still missing its picture runs the finder", async () => {
  const { fill, finds } = harness({});
  await fill.autoFill("ent_x");
  assert.equal(finds.length, 1);
});

test("a word with a picture but no kind still asks once for the kind", async () => {
  const { fill, finds } = harness({ photoKey: "blob:9" });
  await fill.autoFill("ent_x");
  assert.equal(finds.length, 1);
});
