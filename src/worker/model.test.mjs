/**
 * 013 slice 4 — live modeling relay leg: a tap rides the authenticated
 *  ws to the user's OTHER devices, sealed and transient. The relay
 *  stamps `from` itself, never stores the message, and ignores
 *  anything that is not a model envelope.
 *   node --test src/worker/model.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { UserRelay } from "./relay.js";

const ctxWithSockets = (...sockets) => {
  const db = new DatabaseSync(":memory:");
  return {
    storage: {
      sql: {
        exec: (q, ...params) => {
          const reads = /^\s*(SELECT|WITH)/i.test(q) || /RETURNING/i.test(q);
          if (reads || params.length) {
            const st = db.prepare(q);
            const rows = reads ? st.all(...params) : (st.run(...params), []);
            return { toArray: () => rows };
          }
          db.exec(q);
          return { toArray: () => [] };
        },
      },
      deleteAll: async () => {},
      getAlarm: async () => null,
      setAlarm: async () => {},
      deleteAlarm: async () => {},
    },
    blockConcurrencyWhile: (fn) => fn(),
    getWebSockets: () => sockets,
    acceptWebSocket: () => {},
    _db: db,
  };
};

// Only paired devices may relay (audit F07): register the sockets' devices.
const pair = (ctx, ...ids) => {
  for (const id of ids) {
    ctx._db.prepare("INSERT INTO device(device_id,pubkey,added_at) VALUES (?,'x',1)").run(id);
  }
};

const fakeSocket = (deviceId) => ({
  sent: [],
  send(m) { this.sent.push(m); },
  deserializeAttachment: () => ({ d: deviceId }),
});

test("a model tap broadcasts to the user's other sockets, stamped and unstored", () => {
  const a = fakeSocket("dev_a"), b = fakeSocket("dev_b"), c = fakeSocket("dev_c");
  const ctx = ctxWithSockets(a, b, c);
  const relay = new UserRelay(ctx, {});
  pair(ctx, "dev_a", "dev_b", "dev_c");
  const env = { iv: "aa", data: "bb" }; // sealOp's envelope object
  relay.webSocketMessage(a, JSON.stringify({ t: "model", e: 3, env }));
  assert.equal(a.sent.length, 0); // sender's socket is excluded
  assert.equal(c.sent.length, 1);
  const msg = JSON.parse(b.sent[0]);
  assert.deepEqual(JSON.parse(b.sent[0]), JSON.parse(c.sent[0]));
  assert.equal(msg.t, "model");
  assert.equal(msg.e, 3);
  assert.deepEqual(msg.env, env);
  assert.equal(msg.from, "dev_a"); // relay-stamped, not client-supplied
  // Nothing was stored — the message is transient by construction.
  const tables = ctx._db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table'").all();
  for (const t of tables) {
    if (t.name === "device") continue; // the pairing rows above
    assert.equal(ctx._db.prepare(`SELECT COUNT(*) c FROM ${t.name}`).get().c, 0);
  }
});

test("non-model and malformed messages are dropped", () => {
  const a = fakeSocket("dev_a"), b = fakeSocket("dev_b");
  const ctx = ctxWithSockets(a, b);
  const relay = new UserRelay(ctx, {});
  for (const m of [
    "not json",
    JSON.stringify({ t: "ops", env: { iv: "a" } }),
    JSON.stringify({ t: "model", env: 42 }),
    JSON.stringify({ t: "model", env: { iv: "x".repeat(5000) } }),
    JSON.stringify({ t: "model" }),
  ]) relay.webSocketMessage(a, m);
  assert.equal(b.sent.length, 0);
});

test("a client cannot forge `from` — the relay stamps the socket's device", () => {
  const a = fakeSocket("dev_a"), b = fakeSocket("dev_b");
  const ctx = ctxWithSockets(a, b);
  const relay = new UserRelay(ctx, {});
  pair(ctx, "dev_a", "dev_b");
  relay.webSocketMessage(a, JSON.stringify({ t: "model", env: { iv: "x" }, from: "dev_b" }));
  assert.equal(JSON.parse(b.sent[0]).from, "dev_a");
});
