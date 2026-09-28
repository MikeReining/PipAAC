import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveLabWord } from "./elevenlabs_v4_lab.mjs";

test("resolveLabWord keeps cars when not in launch lexicon", () => {
  const r = resolveLabWord("cars");
  assert.equal(r.spokenText, "cars");
  assert.equal(r.slug, "cars");
  assert.equal(r.fromCatalog, false);
});
