/**
 * Supporter sign-in row. A device that is not signed in says so.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { deviceName, mountDevices } from "../../public/board/devices-ui.js";
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
    "acct-danger", "acct-delete", "my-name-row",
    "usr-join", "dev-add", "corner", "dev-activate", "dev-license",
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

test("Add a user opens their board directly — no first-open setup (041 B5)", async () => {
  const ids = [
    "pairform", "pair-body", "pair-title", "pair-go",
    "usr-add", "acct-send", "acct-email", "acct-form", "acct-row",
    "acct-danger", "acct-delete", "my-name-row",
    "usr-join", "dev-add", "corner", "dev-activate", "dev-license",
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
  // 041 B5: the welcome is for a new family — a person added on a
  // device that already has one opens their board, no setup question.
  assert.equal(row.needsSetup ?? false, false, "an added person skips the welcome");
  assert.equal(reloaded, true);
});

test("devices are named the way a family says them", () => {
  const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
  // iPadOS Safari reports a Mac — touch points give it away.
  assert.equal(deviceName({ userAgent: mac, maxTouchPoints: 5 }), "iPad · Safari");
  assert.equal(deviceName({ userAgent: mac, maxTouchPoints: 0 }), "Mac · Safari");
  assert.equal(deviceName({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36", maxTouchPoints: 0 }), "Mac · Chrome");
  assert.equal(deviceName({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1", maxTouchPoints: 5 }), "iPhone · Chrome");
  assert.equal(deviceName({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0", maxTouchPoints: 0 }), "Windows PC · Edge");
});
