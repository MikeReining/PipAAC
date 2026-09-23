/**
 * Keyboard resolution. An unknown string stays typed; it is not replaced
 * with a guess. Known labels are covered by the spelling and keyboard tests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createDatabase } from "./catalog.mjs";
import { mountKeyboard } from "../../public/board/keyboard-ui.js";

function el() {
  return {
    textContent: "",
    dataset: {},
    on: false,
    disabled: false,
    classList: {
      toggle(name, force) { if (name === "on") this.on = !!force; if (name === "disabled") this.disabled = !!force; },
      add() {},
      remove() {},
    },
    querySelectorAll() { return this.buttons ?? []; },
    addEventListener() {},
    buttons: [],
  };
}

test("an unknown keyboard string stays typed", () => {
  const db = createDatabase(":memory:");
  const mode = el();
  const order = el();
  const pip = el();
  pip.dataset.v = "pip";
  mode.buttons = [pip];
  const nodes = {
    "kb-order-standard": el(),
    "kb-mode": mode,
    "kb-order": order,
    "hl-next": el(),
    "jev-share": el(),
  };
  globalThis.document = {
    getElementById: (id) => nodes[id],
    createElement: () => ({ getContext: () => ({}) }),
    body: { classList: { add() {}, remove() {}, toggle() {} } },
  };
  globalThis.window = { addEventListener() {} };

  const kb = mountKeyboard({
    db,
    locale: "en",
    profile: { keyboard_mode: "pip", keyboard_order: "standard" },
    all: (database, sql, p = []) => database.prepare(sql).all(...(p ?? [])),
    sentence: [],
    getSentenceId: () => null,
    ensureSentence() {},
    getSentencePicks: () => 0,
    setSentencePicks() {},
    speak() {},
    speakItem() {},
    speakSentence() {},
    playClip() {},
    renderBar() {},
    renderStrip() {},
    tap() {},
    showGroupHint() {},
    applyLikely() {},
    fitLabels() {},
    senseById: () => null,
    getHighlightNext: () => false,
    getJevSharing: () => true,
    getView: () => "board",
    setViewName() {},
    renderGroupIndex() {},
    renderGroupPage() {},
    renderEditor() {},
  });

  assert.deepEqual(kb.resolveTyped("zzz"), { kind: "typed", id: null, display: "zzz" });
  assert.equal(pip.classList.on, true);
  assert.equal(nodes["kb-order-standard"].textContent, "QWERTY");
});
