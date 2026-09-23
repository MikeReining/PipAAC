/**
 * 015 slice 2 Works Test — the device-side user registry
 * (Sync_And_Web_Editing § 12.2): many users on one device, a home
 * user, active-user resolution, and the legacy single-user migration
 * (kvvfs db + pip_sync + flat keys → the first registry row).
 *
 * Run: scripts/test.sh src/board/users.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  addUser, getDbBytes, getUser, listUsers, memoryUserStore, migrateLegacy,
  putDbBytes, removeUser, resolveActiveUser, setHome, touchOpened,
} from "../../public/shared/users.mjs";
import { memoryKeyStore } from "../../public/shared/sync_crypto.mjs";

/** localStorage-shaped fake over a Map (migrateLegacy's `storage`). */
const fakeStorage = (entries = {}) => {
  const m = new Map(Object.entries(entries));
  return {
    getItem: (k) => m.get(k) ?? null,
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i],
    get length() { return m.size; },
    _m: m,
  };
};

test("add, list, resolve: one user resolves; home wins; none-home asks", async () => {
  const store = memoryUserStore();
  const a = await addUser(store, { name: "Ana" });
  // A lone user opens directly.
  assert.equal(resolveActiveUser(await listUsers(store))?.id, a.id);

  const b = await addUser(store, { name: "Ben" });
  assert.equal(resolveActiveUser(await listUsers(store)), null,
    "two users, no home → the picker shows");

  await setHome(store, b.id);
  assert.equal(resolveActiveUser(await listUsers(store)).id, b.id);
  // home is exclusive
  await setHome(store, a.id);
  const rows = await listUsers(store);
  assert.deepEqual(rows.map((r) => r.home).sort(), [false, true]);
  assert.equal(rows.find((r) => r.id === a.id).home, true);
});

test("a linked user lands with the relay id; re-adding refreshes sync", async () => {
  const store = memoryUserStore();
  const relay = "11111111-2222-3333-4444-555555555555";
  const u = await addUser(store, {
    id: relay, sync: { userId: relay, epoch: 1, cursor: 0 },
  });
  assert.equal(u.id, relay);
  assert.equal((await getUser(store, relay)).sync.userId, relay);

  // Re-pair after removal: same id, fresh sync state — not a second row.
  const again = await addUser(store, {
    id: relay, name: "Cooper", sync: { userId: relay, epoch: 4, cursor: 9 },
  });
  assert.equal(again.sync.epoch, 4);
  assert.equal((await listUsers(store)).length, 1);
});

test("removeUser drops the row and its database bytes", async () => {
  const store = memoryUserStore();
  const u = await addUser(store, {});
  await putDbBytes(store, u.id, new Uint8Array([1, 2, 3]));
  await removeUser(store, u.id);
  assert.equal(await getUser(store, u.id), undefined);
  assert.equal(await getDbBytes(store, u.id), undefined);
  assert.equal((await listUsers(store)).length, 0);
});

test("touchOpened orders the list most-recent first", async () => {
  const store = memoryUserStore();
  const tick = () => new Promise((r) => setTimeout(r, 5)); // ms timestamps
  const a = await addUser(store, {});
  await tick();
  const b = await addUser(store, {});
  assert.equal((await listUsers(store))[0].id, b.id);
  await tick();
  await touchOpened(store, a.id);
  assert.equal((await listUsers(store))[0].id, a.id);
});

test("migration: fresh install carries nothing", async () => {
  const store = memoryUserStore();
  const id = await migrateLegacy({
    storage: fakeStorage(),
    exportLegacyDb: async () => null,
    keyStore: memoryKeyStore(),
    userStore: store,
  });
  assert.equal(id, null);
  assert.equal((await listUsers(store)).length, 0);
});

test("migration: kvvfs db + pip_sync become the home user", async () => {
  const store = memoryUserStore();
  const keyStore = memoryKeyStore();
  const bytes = new Uint8Array([9, 8, 7, 6]);
  const storage = fakeStorage({
    "kvvfs-local-meta": "x", "kvvfs-local-data": "y",
    "pip_sync": JSON.stringify({ userId: "u-old", epoch: 3 }),
    "unrelated": "keep me",
  });

  const id = await migrateLegacy({
    storage,
    exportLegacyDb: async () => bytes,
    keyStore,
    userStore: store,
  });
  assert.equal(id, "u-old");

  const row = (await listUsers(store))[0];
  assert.equal(row.home, true);
  assert.deepEqual(row.sync, { userId: "u-old", epoch: 3, cursor: 0 });
  assert.deepEqual(await getDbBytes(store, "u-old"), bytes);

  // Legacy stores cleared; unrelated keys untouched.
  assert.equal(storage.getItem("pip_sync"), null);
  assert.equal(storage.getItem("kvvfs-local-meta"), null);
  assert.equal(storage.getItem("unrelated"), "keep me");

  // Second run is a no-op — users already exist.
  const again = await migrateLegacy({
    storage: fakeStorage({ "pip_sync": JSON.stringify({ userId: "x" }) }),
    exportLegacyDb: async () => bytes,
    keyStore,
    userStore: store,
  });
  assert.equal(again, null);
  assert.equal((await listUsers(store)).length, 1);
});

test("migration: a local-only board (no sync config) still carries", async () => {
  // kvvfs exists but pip_sync does not — the user was never linked.
  // It still becomes user #1, with a fresh id and no sync state.
  const store = memoryUserStore();
  const bytes = new Uint8Array([1]);
  const id = await migrateLegacy({
    storage: fakeStorage({ "kvvfs-local-0": "page" }),
    exportLegacyDb: async () => bytes,
    keyStore: memoryKeyStore(),
    userStore: store,
  });
  assert.ok(id);
  const row = await getUser(store, id);
  assert.equal(row.home, true);
  assert.equal(row.sync, null);
  assert.deepEqual(await getDbBytes(store, id), bytes);
});
