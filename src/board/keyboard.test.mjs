/**
 * Phase 004 slice 1 Works Test — every key map covers the 60 slots
 * exactly once, keeps the fixed skeleton (digits, space, ⌫, partner row),
 * and never loses a key between standard and ABC order.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { KEYMAPS } from "../../public/shared/keymaps.mjs";
import {
  applyKey,
  displaySentence,
  keyMap,
  resolveKeymap,
} from "../../public/shared/keyboard.mjs";

const LOCALES = Object.keys(KEYMAPS);
const ORDERS = ["standard", "abc"];

test("every slot 0–59 is covered by exactly one key", () => {
  for (const locale of LOCALES) {
    for (const order of ORDERS) {
      const cover = new Array(60).fill(0);
      for (const k of keyMap(locale, order)) {
        for (let s = k.slot; s < k.slot + k.span; s++) cover[s]++;
      }
      cover.forEach((n, s) =>
        assert.equal(n, 1, `${locale}/${order}: slot ${s} covered ${n} times`),
      );
    }
  }
});

test("every alphabet letter and every digit appears exactly once", () => {
  for (const locale of LOCALES) {
    for (const order of ORDERS) {
      const keys = keyMap(locale, order);
      const chars = keys.filter((k) => k.kind === "char" || k.kind === "dead").map((k) => k.value);
      for (const ch of KEYMAPS[locale].alphabet) {
        assert.equal(
          chars.filter((c) => c === ch).length,
          1,
          `${locale}/${order}: alphabet char ${JSON.stringify(ch)} count`,
        );
      }
      for (const d of "0123456789") {
        assert.equal(
          chars.filter((c) => c === d).length,
          1,
          `${locale}/${order}: digit ${d} count`,
        );
      }
    }
  }
});

test("⌫ is fixed at 48–49; space ends at 47 and is at least 4 wide", () => {
  for (const locale of LOCALES) {
    for (const order of ORDERS) {
      const keys = keyMap(locale, order);
      const back = keys.find((k) => k.kind === "backspace");
      assert.equal(back.slot, 48, `${locale}/${order}: ⌫ slot`);
      assert.equal(back.span, 2, `${locale}/${order}: ⌫ span`);
      const space = keys.find((k) => k.kind === "space");
      assert.equal(space.slot + space.span - 1, 47, `${locale}/${order}: space ends at 47`);
      assert.ok(space.span >= 4, `${locale}/${order}: space at least 4 wide`);
    }
  }
});

test("rows 1 and 6 are identical across all locales and orders", () => {
  const baseline = keyMap("en", "standard")
    .filter((k) => k.slot < 10 || k.slot >= 50)
    .map((k) => `${k.slot}:${k.span}:${k.kind}:${k.value}`);
  for (const locale of LOCALES) {
    for (const order of ORDERS) {
      const rows = keyMap(locale, order)
        .filter((k) => k.slot < 10 || k.slot >= 50)
        .map((k) => `${k.slot}:${k.span}:${k.kind}:${k.value}`);
      assert.deepEqual(rows, baseline, `${locale}/${order} rows 1 and 6`);
    }
  }
});

test("standard and abc of a locale hold the same key set", () => {
  for (const locale of LOCALES) {
    const set = (order) =>
      keyMap(locale, order)
        .map((k) => `${k.kind}:${k.value}`)
        .sort()
        .join("|");
    assert.equal(set("standard"), set("abc"), `${locale}: order switch must not lose a key`);
  }
});

test("resolveKeymap: exact tag, then language subtag, else null", () => {
  assert.equal(resolveKeymap("de-AT"), KEYMAPS.de);
  assert.equal(resolveKeymap("de"), KEYMAPS.de);
  assert.equal(resolveKeymap("ja"), null);
  assert.equal(resolveKeymap(""), null);
});

/* --- slice 2: typing that behaves ------------------------------------ */

/** Feed keystrokes through the reducer; returns the final state and the
 *  concatenated effects. */
function type(keys, locale, seed = {}) {
  let state = { buffer: "", pendingAccent: null, lead: null, items: [], ...seed };
  const effects = [];
  for (const k of keys) {
    const res = applyKey(state, k, locale);
    state = res.state;
    effects.push(...res.effects);
  }
  return { state, effects };
}

test("en: 'i want juice.' capitalizes the head and parks the mark", () => {
  const { state, effects } = type([..."i", " ", ..."want", " ", ..."juice", "."], "en");
  assert.equal(effects.filter((e) => e.type === "commit").length, 3);
  assert.equal(state.buffer, "");
  assert.equal(displaySentence(state.items, "en").join(" "), "I want juice.");
  // stored text is untouched — display only
  assert.deepEqual(
    state.items.map((i) => i.text),
    ["i", "want", "juice"],
  );
  assert.equal(state.items[2].punct, ".");
});

test("en: standalone i and i'm display as I…", () => {
  const { state } = type([..."i'm", " ", "i", " "], "en");
  assert.equal(displaySentence(state.items, "en").join(" "), "I'm I");
});

test("es: dead key accents the next vowel; twice cancels", () => {
  assert.equal(type(["´", "a"], "es").state.buffer, "á");
  assert.equal(type(["´", "´", "a"], "es").state.buffer, "a");
  // ´ then a consonant types the consonant with no accent
  assert.equal(type(["´", "s"], "es").state.buffer, "s");
});

test("es: ¿ attaches to the next item; capital follows the mark", () => {
  const { state } = type(["¿", ..."que", "?"], "es");
  assert.equal(state.items[0].lead, "¿");
  assert.equal(state.items[0].punct, "?");
  assert.equal(displaySentence(state.items, "es").join(" "), "¿Que?");
});

test("fr: narrow no-break space before ?", () => {
  const { state } = type([..."quoi", "?"], "fr");
  assert.equal(displaySentence(state.items, "fr").join(" "), "Quoi ?");
});

test("de: a stored capital noun keeps its capital mid-sentence", () => {
  const { state } = type([..."saft", " "], "de", {
    items: [{ kind: "sense", id: "sns_x", text: "ich" }],
  });
  state.items[1].text = "Saft"; // a lemma hit stores the lemma's text
  assert.equal(displaySentence(state.items, "de").join(" "), "Ich Saft");
});

test("⌫ empty buffer: takes the mark, then reopens the item", () => {
  let { state } = type([..."hi", "."], "en");
  assert.equal(displaySentence(state.items, "en").join(" "), "Hi.");
  ({ state } = type(["Backspace"], "en", { items: state.items }));
  assert.equal(state.items.at(-1).punct, undefined);
  assert.equal(state.buffer, "");
  ({ state } = type(["Backspace"], "en", { items: state.items }));
  assert.equal(state.items.length, 0);
  assert.equal(state.buffer, "hi");
  ({ state } = type(["Backspace"], "en", { buffer: state.buffer }));
  assert.equal(state.buffer, "h");
});

test("Enter commits the buffer and speaks the sentence", () => {
  const { effects } = type([..."go", "Enter"], "en");
  assert.deepEqual(
    effects.map((e) => e.type),
    ["commit", "speak"],
  );
});

test("digits are word characters; punctuation never enters the buffer", () => {
  const { state } = type(["3", " ", ..."hi5"], "en");
  assert.equal(state.items[0].text, "3");
  assert.equal(state.buffer, "hi5");
});
