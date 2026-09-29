import assert from "node:assert/strict";
import test from "node:test";

import { listLaunchLemmaRows } from "./launch_lexicon_rows.mjs";

test("listLaunchLemmaRows has one owner row per launch lemma", () => {
  const rows = listLaunchLemmaRows();
  assert.ok(rows.length >= 700, `expected ~712 launch rows, got ${rows.length}`);
  const slots = new Set(rows.map((r) => r.slot));
  assert.equal(slots.size, rows.length);
  assert.equal(rows[0].slot, 1);
  assert.ok(rows[0].slug && rows[0].spokenText);
});
