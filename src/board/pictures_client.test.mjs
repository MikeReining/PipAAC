/**
 * 029 — the pure picture rules and the request bodies that leave the
 * device (captured at the fetch seam, not reported by the client).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  pictureAction, pictureClient, roleForKind, shouldConfirmDraws,
} from "../../public/shared/pictures.mjs";

const C = (id) => ({ image_id: id, asset: `/symbols/${id}.png` });

test("apply only what the server marked auto; the other three are alternatives", () => {
  const a = pictureAction({ candidates: [C("a"), C("b"), C("c"), C("d")], auto: "b", scope: "common", calibrated: true });
  assert.equal(a.kind, "apply");
  assert.equal(a.picture.image_id, "b");
  assert.deepEqual(a.others.map((c) => c.image_id), ["a", "c", "d"]);
});

test("draw only for a common word on a calibrated finder", () => {
  const base = { candidates: [C("a")], auto: null };
  assert.equal(pictureAction({ ...base, scope: "common", calibrated: true }).kind, "draw");
  assert.equal(pictureAction({ ...base, scope: "common", calibrated: false }).kind, "choose");
  assert.equal(pictureAction({ ...base, scope: "personal", calibrated: true }).kind, "choose");
  assert.equal(pictureAction({ ...base, scope: null, calibrated: true }).kind, "choose",
    "no scope answer never draws (fail closed)");
  assert.equal(pictureAction({ candidates: [], auto: null, scope: "personal", calibrated: true }).kind, "none");
});

test("a typo suggestion asks, never draws — even on a calibrated finder", () => {
  // "bananna" on a calibrated finder must NOT burn a drawing — the
  // adult confirms "did you mean banana?" or ignores it (030 § 4.2).
  const act = pictureAction({
    candidates: [C("img_banana"), C("b"), C("c")], auto: null,
    scope: "common", calibrated: true,
    suggestion: { text: "banana", image_id: "img_banana", asset: "/symbols/banana.png" },
  });
  assert.equal(act.kind, "choose");
  assert.equal(act.suggestion.text, "banana");
  assert.equal(act.others.length, 3);
});

test("paste asks before drawing more than 10, or more than are left", () => {
  assert.equal(shouldConfirmDraws(10, 300), false);
  assert.equal(shouldConfirmDraws(11, 300), true);
  assert.equal(shouldConfirmDraws(5, 4), true);
  assert.equal(shouldConfirmDraws(5, null), false);
});

test("Jev's kind maps to a board role; a fringe noun is a thing", () => {
  assert.equal(roleForKind("Green"), "Green");
  assert.equal(roleForKind("None"), "Yellow");
  assert.equal(roleForKind(null), null);
});

test("a photo rejection never carries the adult's picture id", async () => {
  const sent = [];
  const client = pictureClient({
    fetchFn: async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return { status: 204 }; },
  });
  await client.reject({ userId: "u", license: "l", text: "pip", ours: "img_a", action: "photo", theirs: "blob:secret" });
  assert.equal(sent.length, 1);
  assert.equal("theirs" in sent[0].body, false);
  assert.deepEqual(Object.keys(sent[0].body).sort(),
    ["action", "description", "license", "ours", "text", "user_id"]);
});
