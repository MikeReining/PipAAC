/**
 * The first-run tour is owed until it ends: the welcome writes
 * tourDone:false, tour end() writes true, and a boot with the saved false
 * (app closed mid-tour) starts it again.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { memoryUserStore, addUser, listUsers } from "../../public/shared/users.mjs";
import { mountTour, tourIsOwed } from "../../public/board/tour-ui.js";

test("the tour is owed after the welcome until it ends", () => {
  assert.equal(tourIsOwed({ needsSetup: false, tourDone: false }, false), true, "closed mid-tour: resume");
  assert.equal(tourIsOwed({ needsSetup: false, tourDone: true }, false), false, "finished: never again");
  assert.equal(tourIsOwed({ needsSetup: false }, false), false, "no flag ever written: not owed");
  assert.equal(tourIsOwed({ needsSetup: true, tourDone: false }, false), false, "still in the welcome");
  assert.equal(tourIsOwed({ needsSetup: false, tourDone: true }, true), true, "the welcome's one-shot flag still starts it");
});

test("ending the tour saves tourDone:true, which stops the resume", async () => {
  const store = memoryUserStore();
  const me = await addUser(store, { name: "Kid" });
  Object.assign(me, { needsSetup: false, tourDone: false });
  assert.equal(tourIsOwed(me, false), true);

  globalThis.document = { body: { classList: { remove() {} } } };
  const saved = [];
  const tour = mountTour({
    board: { setTour() {}, clearBar() {} },
    saveUser: async (patch) => { saved.push(patch); Object.assign(me, patch); },
  });
  await tour.end();
  assert.deepEqual(saved, [{ tourDone: true }]);
  assert.equal(tourIsOwed(me, false), false);
  assert.ok((await listUsers(store)).length === 1);
});
