/**
 * Supporter sign-in row. A device that is not signed in says so.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { mountDevices } from "../../public/board/devices-ui.js";
import { listUsers, memoryUserStore } from "../../public/shared/users.mjs";

function el() {
  const node = {
    hidden: false,
    html: "",
    value: "",
    listeners: {},
    classList: { add() {}, remove() {} },
    addEventListener(ev, fn) { node.listeners[ev] = fn; },
    set innerHTML(value) { node.html = value; },
    get innerHTML() { return node.html; },
  };
  return node;
}

test("the account row says when nobody is signed in", () => {
  const state = el();
  const ids = [
    "pairform", "pair-body", "pair-title", "pair-go",
    "usr-add", "acct-send", "acct-email", "acct-form", "acct-row",
    "acct-danger", "acct-delete",
    "dev-link", "dev-add", "corner", "dev-activate", "dev-license",
    "dev-delete", "dev-undelete",
    "sup-row", "sup-list", "sup-form", "sup-email", "sup-invite",
  ];
  const nodes = { "acct-state": state };
  for (const id of ids) nodes[id] = el();
  globalThis.document = { getElementById: (id) => nodes[id] };
  globalThis.location = { origin: "http://test", search: "", pathname: "/" };
  globalThis.history = { replaceState() {} };
  globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };

  const devices = mountDevices({
    db: {},
    me: { id: "usr_1", home: false },
    async saveUser() {},
    userStore: {},
    async flushDb() {},
    toast() {},
    initSync() {},
    onSyncApplied() {},
    onModel() {},
    qrcode() {},
  });

  devices.renderAccount();
  assert.equal(nodes["acct-row"].hidden, false);
  assert.match(state.html, /Not signed in/);
});

test("Add a user flags first-open setup — 'Who do they call for?'", async () => {
  const ids = [
    "pairform", "pair-body", "pair-title", "pair-go",
    "usr-add", "acct-send", "acct-email", "acct-form", "acct-row",
    "acct-danger", "acct-delete",
    "dev-link", "dev-add", "corner", "dev-activate", "dev-license",
    "dev-delete", "dev-undelete",
    "sup-row", "sup-list", "sup-form", "sup-email", "sup-invite",
  ];
  const nodes = { "acct-state": el() };
  for (const id of ids) nodes[id] = el();
  const userStore = memoryUserStore();
  let reloaded = false;
  globalThis.document = { getElementById: (id) => nodes[id] };
  globalThis.location = { origin: "http://test", search: "", pathname: "/", reload() { reloaded = true; } };
  globalThis.history = { replaceState() {} };
  globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  globalThis.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  globalThis.prompt = () => "Kid";

  mountDevices({
    db: {},
    me: { id: "usr_1", home: true },
    async saveUser() {},
    userStore,
    async flushDb() {},
    toast() {},
    initSync() {},
    onSyncApplied() {},
    onModel() {},
    qrcode() {},
  });

  await nodes["usr-add"].onclick();
  const row = (await listUsers(userStore))[0];
  assert.equal(row.name, "Kid");
  assert.equal(row.needsSetup, true, "the setup question is armed for first open");
  assert.equal(reloaded, true);
});
