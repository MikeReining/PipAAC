/** Pinned group photos must reach the encrypted relay after their source word changes. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createDatabase } from "./catalog.mjs";
import { createGroup, createEntity, placeItem, removeItem, setEntityPhoto, setGroupGlyph } from "../../public/shared/groups.mjs";
import { ensureBaseline } from "../../public/shared/ops.mjs";
import { memoryKeyStore, getUserKey, openBlob } from "../../public/shared/sync_crypto.mjs";

test("a pinned group's photo is encrypted and uploaded even when no word refers to those bytes", async () => {
  const dir = join(import.meta.dirname, "../../public/shared");
  const realCrypto = pathToFileURL(join(dir, "sync_crypto.mjs")).href;
  const store = memoryKeyStore();
  const bytes = new TextEncoder().encode("the family's chosen group picture");
  const sha = createHash("sha256").update(bytes).digest("hex");
  const sent = [];
  globalThis.__pipGroupMedia = { store, bytes, sha, sent };
  const hooks = registerHooks({
    resolve(spec, ctx, next) {
      if (!ctx.parentURL?.includes("/public/shared/sync.mjs")) return next(spec, ctx);
      const map = { "../db.js": "virtual:group-db", "./platform.mjs": "virtual:group-platform",
        "./sync_crypto.mjs": "virtual:group-crypto", "./sync_client.mjs": "virtual:group-relay" };
      return map[spec] ? { url: map[spec], shortCircuit: true } : next(spec, ctx);
    },
    load(url, ctx, next) {
      const sources = {
        "virtual:group-db": `
          export const loadBlobBytes = async (sha) => sha === globalThis.__pipGroupMedia.sha ? globalThis.__pipGroupMedia.bytes : null;
          export const saveBlobBytes = async () => {};
          export const setBlobFetcher = () => {};`,
        "virtual:group-platform": "export const onOnline = () => {}; export const onVisible = () => {};",
        "virtual:group-crypto": `export * from ${JSON.stringify(realCrypto)};
          export const openKeyStore = () => globalThis.__pipGroupMedia.store;`,
        "virtual:group-relay": `export const relayClient = () => ({
          selfKey: async () => ({ current_epoch: 1, wrapped_keys: {} }),
          fetchOps: async () => ({ ops: [], snap_seq: 0 }),
          getSnapshot: async () => null, putSnapshot: async () => {},
          submit: async (ops) => ({ ops: ops.map((o, i) => ({ op_id: o.op_id, relay_seq: i + 1 })) }),
          putBlob: async (sealed) => { globalThis.__pipGroupMedia.sent.push(sealed); },
          getBlob: async () => { throw Object.assign(new Error("missing"), { status: 404 }); },
          wsUrl: async () => "wss://test.invalid"
        });`,
      };
      return sources[url] ? { format: "module", source: sources[url], shortCircuit: true } : next(url, ctx);
    },
  });
  globalThis.WebSocket = class {
    static OPEN = 1;
    readyState = 1;
    send() {}
  };
  const db = createDatabase(":memory:");
  db.exec(`INSERT INTO layout_shape (layout, cols, rows, frame) VALUES ('grid60', 10, 6, '[9,19,39,49]')`);
  ensureBaseline(db);
  createGroup(db, { id: "grp_pool", name: "Swimming" });
  const word = createEntity(db, { name: "Pool", photoKey: `blob:${sha}` }).id;
  placeItem(db, "grp_pool", "entity", word);
  setGroupGlyph(db, "grp_pool", `picture:blob:${sha}`);
  setEntityPhoto(db, word, null);
  removeItem(db, "grp_pool", "entity", word);
  const key = await getUserKey(store, "u-group");
  const user = { id: "u-group", sync: { userId: "relay-group", epoch: 1, cursor: 0 } };
  try {
    const { initSync } = await import(`${pathToFileURL(join(dir, "sync.mjs")).href}?group-media`);
    await initSync(db, user, async () => {}, "https://test.invalid");
    for (let i = 0; i < 100 && !sent.length; i++) await new Promise((r) => setTimeout(r, 5));
    assert.ok(sent.length, "the relay receives the group's remaining media reference");
    assert.equal(sent[0].sha, sha);
    assert.deepEqual(await openBlob(key, sent[0]), bytes, "the actual uploaded ciphertext contains the pinned photo");
  } finally {
    hooks.deregister();
  }
});
