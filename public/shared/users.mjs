/**
 * The device-side user registry (Sync_And_Web_Editing § 12.2).
 *
 * One device holds many users. The registry lives in IndexedDB
 * `pip-users`: store `users` holds one row per user — id, display
 * name, photo, this device's home flag, last opened, and sync state
 * ({userId, epoch, cursor}) — and store `dbs` holds each user's
 * serialized database bytes.
 *
 * The registry id is made here at Add user and later becomes the
 * relay id when the user is linked (POST /users accepts it).
 *
 * Tests inject a Map-backed store (memoryUserStore); the browser uses
 * IndexedDB. Same contract as sync_crypto's key store, plus `all()`.
 */

export function memoryUserStore() {
  const m = new Map();
  return {
    async get(k) { return m.get(k); },
    async put(k, v) { m.set(k, v); },
    async del(k) { m.delete(k); },
    async keys() { return [...m.keys()]; },
  };
}

/** The platform store: IndexedDB `pip-users`, object store `kv`. */
export function openUserStore() {
  if (typeof indexedDB === "undefined") return memoryUserStore();
  const dbp = new Promise((res, rej) => {
    const req = indexedDB.open("pip-users", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  const wrap = (mode, fn) => dbp.then((idb) => new Promise((res, rej) => {
    const tx = idb.transaction("kv", mode);
    const req = fn(tx.objectStore("kv"));
    tx.oncomplete = () => res(req.result);
    tx.onerror = () => rej(tx.error);
  }));
  return {
    get: (k) => wrap("readonly", (s) => s.get(k)),
    put: (k, v) => wrap("readwrite", (s) => s.put(v, k)),
    del: (k) => wrap("readwrite", (s) => s.delete(k)),
    keys: () => wrap("readonly", (s) => s.getAllKeys()),
  };
}

const USER_PREFIX = "user/";
const DB_PREFIX = "db/";

/** All registry rows, last-opened first. */
export async function listUsers(store) {
  const keys = await store.keys();
  const rows = [];
  for (const k of keys) {
    if (typeof k === "string" && k.startsWith(USER_PREFIX)) {
      const row = await store.get(k);
      if (row) rows.push(row);
    }
  }
  return rows.sort((a, b) => (b.lastOpened ?? 0) - (a.lastOpened ?? 0));
}

export const getUser = (store, id) => store.get(USER_PREFIX + id);
export const putUser = (store, row) => store.put(USER_PREFIX + row.id, row);
export const delUser = (store, id) => store.del(USER_PREFIX + id);
export const getDbBytes = (store, id) => store.get(DB_PREFIX + id);
export const putDbBytes = (store, id, bytes) => store.put(DB_PREFIX + id, bytes);
export const delDbBytes = (store, id) => store.del(DB_PREFIX + id);

/**
 * Create a registry row. The id is the future relay id — a 128-bit
 * random UUID. `home` marks this device's user; only one row is home.
 */
export async function addUser(store, { id, name = "", photo = null, home = false, sync = null, role = null, needsSetup = false } = {}) {
  // Linking an already-known user (re-pair after removal) refreshes its
  // sync state rather than failing on the existing row.
  const existing = id ? await getUser(store, id) : null;
  if (existing) {
    const merged = { ...existing, name: name || existing.name, photo: photo ?? existing.photo,
      sync: sync ?? existing.sync, role: role ?? existing.role, lastOpened: Date.now() };
    await putUser(store, merged);
    if (home) await setHome(store, id); // after putUser — it rewrites flags
    return merged;
  }
  const row = {
    id: id ?? crypto.randomUUID(),
    name, photo, home, role, needsSetup,
    lastOpened: Date.now(),
    sync,
  };
  if (home) {
    for (const u of await listUsers(store)) {
      if (u.home) await putUser(store, { ...u, home: false });
    }
  }
  await putUser(store, row);
  return row;
}

/** Remove a user from this device — the row and its database bytes. */
export async function removeUser(store, id) {
  await delUser(store, id);
  await delDbBytes(store, id);
}

export async function setHome(store, id) {
  for (const u of await listUsers(store)) {
    await putUser(store, { ...u, home: u.id === id });
  }
}

export async function touchOpened(store, id) {
  const row = await getUser(store, id);
  if (row) await putUser(store, { ...row, lastOpened: Date.now() });
}

/**
 * Which user opens on boot: the home user; a single user is always it;
 * many users and no home means the picker shows (null).
 */
export function resolveActiveUser(rows) {
  const home = rows.find((u) => u.home);
  if (home) return home;
  if (rows.length === 1) return rows[0];
  return null;
}

/**
 * 015 slice 2 migration: a pre-multi-user install has its database in
 * kvvfs `local`, sync config in `pip_sync`, and flat key names
 * (`user_key*`/`board_key*`/`recovery_root`) in the key store. All of
 * it becomes user #1 — the home user — then the legacy stores clear.
 *
 * Deps are injected so tests drive it without IndexedDB/localStorage:
 *   storage: localStorage-like {getItem, key(i), removeItem, length}
 *   exportLegacyDb: async () → Uint8Array | null (kvvfs export)
 *   keyStore: the flat-name key store (sync_crypto's)
 *   userStore: the registry store
 */
export async function migrateLegacy({ storage, exportLegacyDb, keyStore, userStore }) {
  if ((await listUsers(userStore)).length) return null; // already migrated
  let hasKvvfs = false;
  for (let i = 0; i < storage.length; i++) {
    if (storage.key(i)?.startsWith("kvvfs-local-")) { hasKvvfs = true; break; }
  }
  let cfg = null;
  try { cfg = JSON.parse(storage.getItem("pip_sync") ?? "null"); } catch { /* bad json */ }
  if (cfg?.boardId && !cfg.userId) cfg = { ...cfg, userId: cfg.boardId };
  if (!hasKvvfs && !cfg?.userId) return null; // fresh install — nothing to carry

  const id = cfg?.userId ?? crypto.randomUUID();
  const bytes = hasKvvfs ? await exportLegacyDb().catch(() => null) : null;
  if (bytes) await putDbBytes(userStore, id, bytes);

  // Flat keys move under the user's scope. Epochs are contiguous; probe
  // a few past the configured epoch so a stale cfg can't strand a key.
  const maxEpoch = (cfg?.epoch ?? 1) + 2;
  for (let e = 1; e <= maxEpoch; e++) {
    for (const flat of e === 1 ? ["user_key", "board_key"] : [`user_key_e${e}`, `board_key_e${e}`]) {
      const k = await keyStore.get(flat);
      if (k) {
        await keyStore.put(`user/${id}/key_e${e}`, k);
        await keyStore.del(flat);
      }
    }
  }
  const root = await keyStore.get("recovery_root");
  if (root) {
    await keyStore.put(`user/${id}/root`, root);
    await keyStore.del("recovery_root");
  }

  await putUser(userStore, {
    id, name: "", photo: null, home: true, lastOpened: Date.now(),
    sync: cfg?.userId ? { userId: cfg.userId, epoch: cfg.epoch ?? 1, cursor: 0 } : null,
  });
  storage.removeItem("pip_sync");
  for (let i = storage.length - 1; i >= 0; i--) {
    const k = storage.key(i);
    if (k?.startsWith("kvvfs-local-")) storage.removeItem(k);
  }
  return id;
}
