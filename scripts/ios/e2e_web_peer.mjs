/**
 * A "web device" for the 044 C3 sync E2E: the REAL public/shared/sync.mjs,
 * ops.mjs, sync_client.mjs and sync_crypto.mjs (node WebCrypto) against the
 * local Worker relay, with its own node:sqlite database. Only the three
 * browser seams are stubbed (db.js blob verbs, platform events, the key
 * store -> in-memory), exactly as src/board/sync_snapshot.test.mjs does.
 * It coordinates with the iPad XCUITest through files in a shared dir.
 *
 *   host <dir> <baseUrl> <licenseSecret>   creates a person, offers a code,
 *       grants the iPad, applies edits on cue, dumps its tables
 *   join <dir> <baseUrl>                   a third device: claims the code the
 *       IPAD offers (SY-3), syncs, dumps
 *
 * File protocol (all in <dir>): see FLOW below; every file is a marker or
 * a small JSON/text payload written atomically (tmp + rename).
 */
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = new URL("../../", import.meta.url).pathname;
const shared = join(root, "public/shared");
const [mode, dir, baseUrl, secret, scenario = "both-ways"] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });

globalThis.__peerStore = new Map();
registerHooks({
  resolve(spec, ctx, next) {
    if ((ctx.parentURL ?? "").includes("/public/shared/sync.mjs")) {
      const map = { "../db.js": "virtual:dbjs", "./platform.mjs": "virtual:platform", "./sync_crypto.mjs": "virtual:crypto" };
      if (map[spec]) return { url: map[spec], shortCircuit: true };
    }
    return next(spec, ctx);
  },
  load(url, ctx, next) {
    const realCrypto = pathToFileURL(join(shared, "sync_crypto.mjs")).href;
    const src = {
      "virtual:dbjs": `export const loadBlobBytes = async () => null;
        export const saveBlobBytes = async () => {};
        export const setBlobFetcher = () => {};`,
      "virtual:platform": `export const onOnline = () => {}; export const onVisible = () => {};`,
      "virtual:crypto": `export * from ${JSON.stringify(realCrypto)};
        export const openKeyStore = () => ({
          get: async (k) => globalThis.__peerStore.get(k),
          put: async (k, v) => { globalThis.__peerStore.set(k, v); },
          del: async (k) => { globalThis.__peerStore.delete(k); },
        });`,
    }[url];
    if (src) return { format: "module", source: src, shortCircuit: true };
    return next(url, ctx);
  },
});

process.on("unhandledRejection", (e) => console.error("[peer] unhandled rejection", e));
if (process.env.PEER_TRACE) { const f = globalThis.fetch; globalThis.fetch = async (u, o) => { const t = Date.now(); try { const r = await f(u, o); console.log("[fetch]", o?.method ?? "GET", String(u).replace(/^http:\/\/[^/]+/, ""), r.status, Date.now() - t, "ms"); return r; } catch (e) { console.log("[fetch] ERR", String(u), e.message); throw e; } }; }
/** The same Map the stubbed sync.mjs key store reads (the hook only rewires sync.mjs's own import). */
const peerStore = () => ({
  get: async (k) => globalThis.__peerStore.get(k),
  put: async (k, v) => { globalThis.__peerStore.set(k, v); },
  del: async (k) => { globalThis.__peerStore.delete(k); },
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const put = (name, text) => {
  writeFileSync(join(dir, name + ".tmp"), String(text));
  renameSync(join(dir, name + ".tmp"), join(dir, name));
};
const has = (name) => existsSync(join(dir, name));
const get = (name) => readFileSync(join(dir, name), "utf8");
async function waitFor(name, ms = 120000) {
  const end = Date.now() + ms;
  while (!has(name)) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${name}`);
    await sleep(100);
  }
  return get(name);
}
const log = (...a) => console.log(`[peer:${mode}]`, ...a);

const sc = await import(pathToFileURL(join(shared, "sync_crypto.mjs")).href);
const { relayClient, pairClient } = await import(pathToFileURL(join(shared, "sync_client.mjs")).href);
const { recoveryProof } = await import(pathToFileURL(join(shared, "recovery.mjs")).href);
const migrate = await import(pathToFileURL(join(shared, "migrate.mjs")).href);
const { importCatalog } = await import(pathToFileURL(join(shared, "import.mjs")).href);
const groups = await import(pathToFileURL(join(shared, "groups.mjs")).href);
const { seatSetupPeople } = await import(pathToFileURL(join(shared, "coremove.mjs")).href);
const opsMod = await import(pathToFileURL(join(shared, "ops.mjs")).href);
const { syncHealth, initSync } = await import(pathToFileURL(join(shared, "sync.mjs")).href);
const { dumpLines } = await import(pathToFileURL(join(root, "scripts/ios/e2e_dump.mjs")).href);
const { licenseFor } = await import(pathToFileURL(join(root, "src/worker/license.mjs")).href);

/** The app's own boot sequence (scripts/ios/app.mjs appOpen), in node. */
function openDb(file) {
  copyFileSync(join(root, "public/fresh_db.sqlite"), file);
  const db = new DatabaseSync(file);
  db.all = (sql, params = []) => db.prepare(sql).all(...params); // public/db.js adapter shape
  const catalog = JSON.parse(readFileSync(join(root, "public/catalog.json"), "utf8"));
  db.exec("PRAGMA foreign_keys = ON");
  migrate.migrateSchema(db, catalog.schemaSql, migrate.ADDITIVE_COLUMNS);
  db.exec(catalog.schemaSql);
  migrate.ensureAdditiveColumns(db);
  db.exec("DROP TABLE IF EXISTS history_count");
  db.exec("DROP TABLE IF EXISTS prediction_weights");
  importCatalog(db, catalog);
  return db;
}

const dumpTo = (db, name) => {
  const lines = dumpLines(db);
  put(name, lines.join("\n") + "\n");
  log(`${name}: ${lines.length} lines`);
};

async function startSync(db, me) {
  const saveUser = async (patch) => { Object.assign(me, patch); };
  await initSync(db, me, saveUser, baseUrl, () => {}, null, async () => true);
}

/* ----------------------------------------------------------------------
 * FLOW (host):
 *   host  -> code.txt                    the code the iPad types
 *   host  -> granted                     the iPad claimed + was granted
 *   ui    -> ui-linked                   the iPad board shows the person
 *   host  -> peer-edit.json {t0,...}     rename + setting applied locally
 *   ui    -> ui-saw-edit                 the iPad board shows both edits
 *   ui    -> ui-hid                      the iPad hid a word
 *   host  -> peer-saw-mask.json          the mask op landed here
 *   ui    -> ipad-code.txt               the iPad offers a code (SY-3)
 *   join  -> join-done                   third device synced + dumped
 *   ui    -> ui-done                     test finished
 *   host  -> peer.dump, host-done
 * ---------------------------------------------------------------------- */
async function hostMode() {
  const db = openDb(join(dir, "peer.sqlite"));
  const store = peerStore();
  const identity = await sc.getDeviceIdentity(store);
  const me = { id: crypto.randomUUID(), name: "Zed" };
  opsMod.setDeviceId(identity.deviceId);

  // A person with one personal word, seated on the board (onboarding).
  const { id: entityId } = groups.createEntity(db, { name: "Zed", role: "Yellow" });
  seatSetupPeople(db, [entityId], "en");

  // ensureUser (devices-ui.js): the relay user, recovery proof, lifetime.
  const root16 = await sc.ensureRecoveryRoot(store, me.id);
  const res = await fetch(`${baseUrl}/users`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: me.id, device_id: identity.deviceId,
      pubkey: await sc.exportPublicKey(identity.verify),
      dh_pub: await sc.exportDhPublic(identity.dh.publicKey),
      recovery_proof: await recoveryProof(root16), label: "Mac · e2e peer",
    }),
  });
  if (!res.ok) throw new Error(`user create: ${res.status}`);
  me.sync = { userId: (await res.json()).user_id, epoch: 1, cursor: 0 };
  const userKey = await sc.getUserKey(store, me.id, 1);
  const client = relayClient({ userId: me.sync.userId, baseUrl, identity, userKey });
  await client.setEntitlement(await licenseFor(secret, me.sync.userId)); // free = 1 device
  await startSync(db, me);
  log("synced user", me.sync.userId);
  await sleep(4000);
  log("health after start", JSON.stringify(syncHealth()),
    "pending ops:", db.prepare("SELECT COUNT(*) c FROM sync_op WHERE relay_seq IS NULL").all()[0].c);
  put("person.json", JSON.stringify({ id: me.id, entityId }));

  // offerFlow (devices-ui.js): code -> wait claim -> addDevice -> grant.
  const { pair } = await pairClient(baseUrl).offer();
  put("code.txt", pair);
  log("offered code", pair);
  for (;;) {
    const st = await pairClient(baseUrl).status(pair);
    if (st.status === "claimed") {
      await client.addDevice(st.device_id, st.sig_pub, { dh_pub: st.dh_pub, label: st.label });
      const wrapped = await sc.wrapUserKey(userKey, st.dh_pub);
      const keys = [{ epoch: 1, ...(await sc.wrapUserKey(userKey, st.dh_pub)) }];
      await pairClient(baseUrl).grant(pair, {
        user_id: me.sync.userId, by_device: identity.deviceId, epoch: 1, ...wrapped, keys });
      break;
    }
    await sleep(500);
  }
  put("granted", Date.now());
  log("granted the iPad");

  await waitFor("ui-linked");
  // Both edits go through the web's own write owners (they record the ops).
  const NEW_NAME = "Zedd";
  groups.renameEntity(db, entityId, NEW_NAME);
  groups.setSetting(db, "speech_rate", "faster");
  put("peer-edit.json", JSON.stringify({ t0: Date.now(), name: NEW_NAME, speech_rate: "faster" }));
  log("applied rename + setting");

  await waitFor("ui-saw-edit");
  if (scenario === "offline") {
    await waitFor("ui-done");
    await sleep(1500);
    dumpTo(db, "peer.dump");
    put("host-done", Date.now());
    process.exit(0);
  }
  const hid = JSON.parse(await waitFor("ui-hid"));
  const t0 = Date.now();
  for (;;) {
    const row = db.prepare("SELECT sense_id, status FROM sense_mask WHERE status = 'hidden'").all();
    if (row.length) {
      put("peer-saw-mask.json", JSON.stringify({ senses: row.map((r) => r.sense_id), ms: Date.now() - t0, label: hid.label }));
      log("mask applied here:", row.map((r) => r.sense_id).join(","));
      break;
    }
    if (Date.now() - t0 > 60000) throw new Error("mask op never arrived");
    await sleep(100);
  }

  // SY-3: the iPad offers a code; a third node device joins through it.
  const iPadCode = (await waitFor("ipad-code.txt")).trim();
  const child = spawn(process.execPath, [new URL(import.meta.url).pathname, "join", dir, baseUrl],
    { stdio: "inherit" });
  await new Promise((resolve) => child.on("exit", resolve));

  await waitFor("ui-done");
  await sleep(1500);
  dumpTo(db, "peer.dump");
  put("host-done", Date.now());
  log("health", JSON.stringify({ ...syncHealth(), iPadCode }));
  process.exit(0);
}

async function joinMode() {
  const db = openDb(join(dir, "peer2.sqlite"));
  const store = peerStore();
  const identity = await sc.getDeviceIdentity(store);
  opsMod.setDeviceId(identity.deviceId);
  const code = (get("ipad-code.txt")).trim();
  await pairClient(baseUrl).claim(code, {
    device_id: identity.deviceId,
    sig_pub: await sc.exportPublicKey(identity.verify),
    dh_pub: await sc.exportDhPublic(identity.dh.publicKey),
    label: "Mac · e2e third device",
  });
  let grant;
  for (;;) {
    const st = await pairClient(baseUrl).status(code);
    if (st.status === "granted") { grant = st.grant; break; }
    if (st.status === "refused") throw new Error(`refused: ${grant?.refused ?? JSON.stringify(st)}`);
    await sleep(500);
  }
  const epoch = grant.epoch ?? 1;
  for (const g of grant.keys ?? []) {
    await sc.putUserKey(store, grant.user_id, await sc.unwrapUserKey(identity.dh.privateKey, g), g.epoch);
  }
  const me = { id: grant.user_id, name: "", sync: { userId: grant.user_id, epoch, cursor: 0 } };
  await startSync(db, me);
  // Converged when the third device holds the rename and the mask.
  const want = JSON.parse(get("peer-saw-mask.json")).senses;
  const t0 = Date.now();
  for (;;) {
    const masked = db.prepare("SELECT sense_id FROM sense_mask WHERE status = 'hidden'").all().map((r) => r.sense_id);
    const named = db.prepare("SELECT 1 FROM personal_entity WHERE spoken_name = ?").all(JSON.parse(get("peer-edit.json")).name);
    if (want.every((s) => masked.includes(s)) && named.length) break;
    if (Date.now() - t0 > 60000) throw new Error("third device never converged");
    await sleep(200);
  }
  await sleep(1500);
  dumpTo(db, "peer2.dump");
  put("join-done", Date.now());
  process.exit(0);
}

try {
  if (mode === "host") await hostMode();
  else if (mode === "join") await joinMode();
  else throw new Error("usage: host|join <dir> <baseUrl> [secret]");
} catch (e) {
  console.error(`[peer:${mode}] FAILED`, e);
  put(`${mode}-failed`, e?.stack ?? e);
  process.exit(1);
}
