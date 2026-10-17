// 025 § 1: when the feeling faces own the strip's last slot (feeling.mjs facesShown, used by strip.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { facesShown } from "../../public/shared/feeling.mjs";

const live = (o = {}) => ({ tour: false, expressiveVoice: true, kbUi: { text: "" },
  picking: false, modeling: false, editing: false, view: "board", ...o });
const on = (o, extra = {}) => facesShown({ live: live(o), ready: true, words: 2, online: true, ...extra });

test("faces show on the board from the first word, online, with the setting on", () => {
  assert.equal(on({}), true);
  assert.equal(on({}, { words: 0 }), false);
  assert.equal(on({}, { online: false }), false);
  assert.equal(on({ expressiveVoice: false }), false);
  assert.equal(on({ kbUi: { text: "ca" } }), false, "mid-typed-word");
});

test("the editor view is Edit mode: no faces there (every tap is a selection)", () => {
  assert.equal(on({ view: "editor" }), false);
  assert.equal(on({ editing: true }), false);
  assert.equal(on({ modeling: true }), false);
  assert.equal(on({ picking: true }), false);
  assert.equal(on({ tour: true }), false);
});
