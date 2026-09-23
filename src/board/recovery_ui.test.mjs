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

test("an unlinked user is told to link before a QR card", async () => {
  const body = el();
  const ids = ["recform", "rec-go", "rec-print", "rec-title", "dev-sheet", "dev-restore"];
  const nodes = { "rec-body": body };
  for (const id of ids) nodes[id] = el();
  globalThis.document = { getElementById: (id) => nodes[id] };
  globalThis.location = { origin: "http://test" };

  const rec = mountRecovery({
    me: { id: "usr_1" },
    async saveUser() {},
    userStore: {},
    async flushDb() {},
    toast() {},
    qrcode() {},
    async userClient() { throw new Error("no client"); },
  });

  await rec.showCard();
  assert.match(body.html, /Link this user first/);
});
