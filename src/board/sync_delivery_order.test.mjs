import test from "node:test";
import assert from "node:assert/strict";
import { compareDeliveryOrder } from "../../scripts/probes/sync_delivery_order.mjs";

test("later-push-first and own-ack-first delivery converge with the relay's ordered history", () => {
  const result = compareDeliveryOrder();
  assert.equal(result.orderedFetch, "Newer", "the ordered control must preserve the later rename");
  assert.equal(result.laterPushThenFetch, result.orderedFetch);
  assert.equal(result.ownAckThenFetch, result.orderedFetch);
  assert.equal(result.snapshotThenTail, result.orderedFetch);
  assert.ok(result.pendingKept, "the order repair must keep pending edits");
});
