/**
 * A0-S2, Swift -> node direction: every envelope CryptoKit wrote into
 * swift.json must open/verify with the web's sync_crypto.mjs. (The
 * node -> Swift direction runs in PipCryptoTests.swift.) node.json is
 * checked too, so the shared verifier itself stays honest.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PRIMITIVES, verifyDoc } from "./crypto_verify.mjs";

const dir = join(dirname(fileURLToPath(import.meta.url)),
  "../../apps/PipAAC/PipAACTests/Fixtures/crypto");

for (const file of ["node.json", "swift.json"]) {
  test(`${file}: every primitive opens and verifies in sync_crypto.mjs`, async () => {
    const doc = JSON.parse(readFileSync(join(dir, file), "utf8"));
    assert.equal(doc.writer, file.replace(".json", ""));
    const counts = await verifyDoc(doc);
    assert.deepEqual(Object.keys(counts), PRIMITIVES);
  });
}
