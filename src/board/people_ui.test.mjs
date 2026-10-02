/**
 * People on this device (people-ui.js). Measured against the registry
 * rows and the storage the boot path reads — not the module's report:
 * "Show the list" leaves no home row, so boot resolves nobody and asks;
 * a switch writes the tab override and the one-shot reopen page.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { addUser, listUsers, memoryUserStore, resolveActiveUser } from "../../public/shared/users.mjs";
import { mountPeople, takeReopen, REOPEN_KEY } from "../../public/board/people-ui.js";

function el() {
  const node = {
    hidden: false, children: [], dataset: {}, textContent: "", attrs: {},
    listeners: {},
    classList: { toggle() {}, add() {}, remove() {} },
    append(...c) { node.children.push(...c); },
    replaceChildren() { node.children = []; },
    setAttribute(k, v) { node.attrs[k] = v; },
    addEventListener(t, fn) { node.listeners[t] = fn; },
  };
  return node;
}
function memStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
function dom() {
  const nodes = { "set-who": el(), "set-pop": el(), "opens-row": el(), "opens-seg": el(), "usr-add": el() };
  globalThis.document = {
    getElementById: (id) => nodes[id],
    createElement: () => el(),
    addEventListener() {},
  };
  return nodes;
}

test("Show the list: no one opens first, so boot asks who's talking", async () => {
  const nodes = dom();
  const store = memoryUserStore();
  const maya = await addUser(store, { name: "Maya", home: true });
  await addUser(store, { name: "Leo" });
  const ui = mountPeople({
    me: maya, userStore: store, keyStore: memoryUserStore(), flushDb: async () => {},
    settings: { current: () => "team", show() {} }, storage: memStorage(), reload() {},
  });
  await ui.renderOpens();
  assert.equal(nodes["opens-row"].hidden, false);
  const choices = nodes["opens-seg"].children;
  // People come most-recently-opened first (listUsers); the two were
  // added in the same breath, so only the set and the last choice are fixed.
  const labels = choices.map((b) => b.textContent);
  assert.deepEqual(labels.slice(0, 2).sort(), ["Leo", "Maya"]);
  assert.equal(labels[2], "Show the list");
  assert.equal(resolveActiveUser(await listUsers(store))?.name, "Maya");
  await choices[2].onclick();
  const rows = await listUsers(store);
  assert.equal(rows.some((u) => u.home), false);
  assert.equal(resolveActiveUser(rows), null);
  assert.equal(maya.home, false);
});

test("one person: the choice is hidden", async () => {
  const nodes = dom();
  const store = memoryUserStore();
  const maya = await addUser(store, { name: "Maya", home: true });
  const ui = mountPeople({
    me: maya, userStore: store, keyStore: memoryUserStore(), flushDb: async () => {},
    settings: { current: () => "overview", show() {} }, storage: memStorage(), reload() {},
  });
  await ui.renderOpens();
  assert.equal(nodes["opens-row"].hidden, true);
});

test("a switch writes the tab override and reopens the same page once", async () => {
  dom();
  const store = memoryUserStore();
  const maya = await addUser(store, { name: "Maya", home: true });
  const leo = await addUser(store, { name: "Leo" });
  const storage = memStorage();
  let reloaded = 0, flushed = 0;
  const ui = mountPeople({
    me: maya, userStore: store, keyStore: memoryUserStore(),
    flushDb: async () => { flushed++; },
    settings: { current: () => "board", show() {} }, storage, reload: () => { reloaded++; },
  });
  await ui.switchTo(leo.id, "board");
  assert.equal(storage.getItem("pip_active_user"), leo.id);
  assert.equal(storage.getItem(REOPEN_KEY), "board");
  assert.equal(flushed, 1);
  assert.equal(reloaded, 1);
  assert.equal(takeReopen(storage), "board");
  assert.equal(takeReopen(storage), null);
});
