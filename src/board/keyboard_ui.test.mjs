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

/** 028 Works Test 17 — typing "h-e-l-l-o" mints nothing; the commit
 *  (space) fires exactly one background ensure with source
 *  user_keyboard. */
test("a typed word mints on commit only — never per keystroke", () => {
  const db = createDatabase(":memory:");
  const nodes = {
    "kb-order-standard": el(), "kb-mode": el(), "kb-order": el(), "hl-next": el(),
  };
  globalThis.document = {
    getElementById: (id) => nodes[id],
    createElement: () => ({ getContext: () => ({}) }),
    body: { classList: { add() {}, remove() {}, toggle() {} } },
  };
  globalThis.window = { addEventListener() {} };

  const ensures = [];
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
    startFresh() {},
    speak() {},
    speakItem() {},
    speakSentence() {},
    isTxBusy: () => false,
    playClip() {},
    renderBar() {},
    renderStrip() {},
    tap() {},
    showGroupHint() {},
    applyLikely() {},
    fitLabels() {},
    senseById: () => null,
    tileEnsure: (text, opts) => {
      ensures.push({ text, opts });
      return Promise.resolve({ ok: true });
    },
    getHighlightNext: () => false,
    getView: () => "board",
    setViewName() {},
    renderGroupIndex() {},
    renderGroupPage() {},
    renderEditor() {},
  });

  for (const ch of ["h", "e", "l", "l", "o"]) kb.press(ch);
  assert.equal(ensures.length, 0); // keystrokes never mint

  kb.press(" ");
  assert.equal(ensures.length, 1);
  assert.equal(ensures[0].text, "hello");
  assert.equal(ensures[0].opts.source, "user_keyboard");

  // The next committed word mints its own clip, once.
  for (const ch of ["w", "o", "r", "l", "d"]) kb.press(ch);
  kb.press("Enter"); // Enter commits then speaks — still one mint
  assert.equal(ensures.length, 2);
  assert.equal(ensures[1].text, "world");
});

/** Device keyboard (Settings → Keyboard): the field mirrors the word in
 *  progress. Clear, or a tapped completion, empty the buffer from outside
 *  the field — the field has to follow, or the old letters come back with
 *  the next keystroke ("wa" + "x" -> "wax"). */
test("device keyboard: Clear and a tapped completion empty the field too", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(new URL("../../public/fresh_db.sqlite", import.meta.url).pathname,
    { readOnly: true });
  const listeners = {};
  let field = null;
  const node = () => ({
    style: {}, dataset: {}, children: [], value: "", getContext: () => ({}),
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {}, appendChild(c) { this.children.push(c); }, blur() {},
    querySelector: () => ({ textContent: "" }),
    querySelectorAll: () => [],
    addEventListener(type, fn) { if (this === field) listeners[type] = fn; },
  });
  const nodes = {
    "kb-order-standard": node(), "kb-mode": node(), "kb-order": node(), "hl-next": node(),
    kb: node(), "anchor-kb": node(),
  };
  globalThis.document = {
    getElementById: (id) => (id === "kb-device" ? field : nodes[id]),
    createElement: (tag) => {
      const el = node();
      if (tag === "textarea") field = el;
      return el;
    },
    body: { classList: { add() {}, remove() {}, toggle() {} } },
    fonts: { ready: Promise.resolve() },
  };
  globalThis.window = { addEventListener() {} };
  let tapped = null;
  const kb = mountKeyboard({
    db, locale: "en",
    profile: { keyboard_mode: "device", keyboard_order: "standard" },
    all: (database, sql, p = []) => database.prepare(sql).all(...(p ?? [])),
    sentence: [],
    getSentenceId: () => null, ensureSentence() {}, getSentencePicks: () => 0, setSentencePicks() {},
    startFresh() {}, speakItem() {}, speakSentence() {}, isTxBusy: () => false,
    renderBar() {}, renderStrip() {},
    tap: (text) => { tapped = text; },
    showGroupHint() {}, applyLikely() {}, fitLabels() {},
    senseById: () => null, tileFor: () => node(),
    getHighlightNext: () => false, getView: () => "board", setViewName() {},
    renderGroupIndex() {}, renderGroupPage() {}, renderEditor() {},
  });
  kb.openKb();
  assert.ok(field, "device mode builds the system-keyboard field");

  const type = (v) => { field.value = v; listeners.input(); };
  type("wa");
  assert.equal(kb.text, "wa");
  const comp = kb.completions();
  assert.ok(comp.length > 0, "'wa' offers completions");
  comp[0].onTap();
  assert.ok(tapped, "the completion was tapped in");
  assert.equal(kb.text, "");
  assert.equal(field.value, "", "the field follows the emptied buffer");

  type("wa");
  kb.text = ""; // board.js Clear
  assert.equal(field.value, "", "Clear empties the field");
  type("x");
  assert.equal(kb.text, "x", "the next keystroke starts a new word");
});
