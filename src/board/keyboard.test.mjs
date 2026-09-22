/**
 * Phase 004 slice 1 Works Test — every key map covers the 60 slots
 * exactly once, keeps the fixed skeleton (digits, space, ⌫, partner row),
 * and never loses a key between standard and ABC order.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { KEYMAPS } from "../../public/shared/keymaps.mjs";
import { keyMap, resolveKeymap } from "../../public/shared/keyboard.mjs";

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
