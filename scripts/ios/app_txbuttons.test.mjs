/**
 * 044 parity (web 60b062dc): the iPad bar buttons' enabled state IS the web's
 * txButtonDisabled, through the bundled core (PIPCORE.txbuttons.disabled).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const root = new URL("../../", import.meta.url).pathname;
const ctx = vm.createContext({ __pipHost: { log: () => {} } });
vm.runInContext(readFileSync(join(root, "apps/PipAAC/PipAAC/Core/pip-core.js"), "utf8"), ctx);
const disabled = (o) => {
  ctx.__a = JSON.stringify(o);
  return JSON.parse(vm.runInContext("JSON.stringify(PIPCORE.txbuttons.disabled('x', JSON.parse(__a)))", ctx));
};

test("an empty bar: all four are off, except ✨ and ❓ while a supporter models", () => {
  assert.deepEqual(disabled({}), { fix: true, question: true, past: true, future: true });
  assert.deepEqual(disabled({ modeling: true }), { fix: false, question: false, past: true, future: true });
});

test("words on the bar enable all four; offline greys them, except in the demo", () => {
  assert.deepEqual(disabled({ words: true }), { fix: false, question: false, past: false, future: false });
  assert.deepEqual(disabled({ words: true, offline: true }), { fix: true, question: true, past: true, future: true });
  assert.deepEqual(disabled({ words: true, offline: true, tour: true }), { fix: false, question: false, past: false, future: false });
  assert.equal(disabled({ modeling: true, offline: true }).fix, false, "a model press never needs the internet");
});
