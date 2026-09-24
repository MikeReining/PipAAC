/**
 * Supporter sign-in row. A device that is not signed in says so.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { mountDevices } from "../../public/board/devices-ui.js";

function el() {
  const node = {
    hidden: false,
    html: "",
    value: "",
    classList: { add() {}, remove() {} },
    addEventListener() {},
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
