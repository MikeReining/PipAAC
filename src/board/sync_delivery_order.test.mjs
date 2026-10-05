import test from "node:test";
import assert from "node:assert/strict";
import { compareDeliveryOrder } from "../../scripts/probes/sync_delivery_order.mjs";

test("later-push-first delivery must converge with the relay's ordered history", {
  todo: "Known P1: sync developer; quarantine expiry 2026-10-07; see SYNC_DELIVERY_ORDER.md",
}, () => {
  const result = compareDeliveryOrder();
  assert.equal(result.orderedFetch, "Newer", "the ordered control must preserve the later rename");
  assert.equal(result.laterPushThenFetch, result.orderedFetch);
});
