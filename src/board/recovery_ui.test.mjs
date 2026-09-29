/**
 * QR card. A user that has not been linked yet is told to link first.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { mountRecovery } from "../../public/board/recovery-ui.js";

function el() {
  const node = {
    hidden: false,
    html: "",
    textContent: "",
    classList: { add() {}, remove() {} },
    addEventListener() {},
    set innerHTML(value) { node.html = value; },
    get innerHTML() { return node.html; },
  };
  return node;
}

function mount(me, ensureUser) {
  const body = el();
  const ids = ["recform", "rec-go", "rec-print", "rec-title", "dev-sheet", "dev-restore"];
  const nodes = { "rec-body": body };
  for (const id of ids) nodes[id] = el();
  globalThis.document = { getElementById: (id) => nodes[id] };
  globalThis.location = { origin: "http://test" };
  const rec = mountRecovery({
    me,
    async saveUser() {},
    userStore: {},
    async flushDb() {},
    toast() {},
    qrcode() {},
    async userClient() { throw new Error("no client"); },
    ensureUser,
  });
  return { rec, body };
}

test("asking for the card on an unsynced board turns sync on first", async () => {
  // Founder 2026-09-28: the card restores from an encrypted copy only it
  // can open — making it turns that copy on, no "link first" detour.
  const me = { id: "usr_1" };
  let asked = 0;
  const { rec, body } = mount(me, async ({ quiet }) => {
    asked++;
    assert.equal(quiet, true);
    me.sync = { userId: "usr_1", epoch: 1, cursor: 0 };
    return me.sync;
  });
  await rec.showCard();
  assert.equal(asked, 1);
  assert.doesNotMatch(body.html, /Link this user first|Connect to the internet/);
});

test("offline: the card explains it needs the internet, once", async () => {
  const { rec, body } = mount({ id: "usr_1" }, async () => { throw new Error("offline"); });
  await rec.showCard();
  assert.match(body.html, /Connect to the internet to make the card/);
});
