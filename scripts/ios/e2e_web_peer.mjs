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
      "virtual:dbjs": `globalThis.__peerBlobs ??= new Map();
        export const loadBlobBytes = async (sha) => globalThis.__peerBlobs.get(sha) ?? null;
        export const saveBlobBytes = async (sha, b) => { globalThis.__peerBlobs.set(sha, b); };
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
const { syncHealth, initSync, syncUploadBlob } = await import(pathToFileURL(join(shared, "sync.mjs")).href);
const { dumpLines } = await import(pathToFileURL(join(root, "scripts/ios/e2e_dump.mjs")).href);
const voiceMod = await import(pathToFileURL(join(shared, "voice.mjs")).href);
const zlib = await import("node:zlib");
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
  const NAME = process.env.PEER_NAME ?? "Zed";
  const me = { id: crypto.randomUUID(), name: NAME };
  opsMod.setDeviceId(identity.deviceId);

  // A person with one personal word, seated on the board (onboarding).
  const { id: entityId } = groups.createEntity(db, { name: NAME, role: "Yellow" });
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
  put("person.json", JSON.stringify({ id: me.id, entityId, userId: me.sync.userId }));

  if (scenario === "restore") {
    // 044 C5 (SY-10, SY-9, SY-13): a fresh iPad restores this person from the
    // recovery card. The peer's edits are flushed first so they are in the
    // snapshot/ops the iPad pulls; the card is written as words and as the link.
    groups.renameEntity(db, entityId, "Zedd");
    groups.setSetting(db, "speech_rate", "faster");
    for (let i = 0; i < 100; i++) {
      if (db.prepare("SELECT COUNT(*) c FROM sync_op WHERE relay_seq IS NULL").all()[0].c === 0) break;
      await sleep(100);
    }
    const { keyToWords, cardLink } = await import(pathToFileURL(join(shared, "recovery.mjs")).href);
    const { RECOVERY_WORDS } = await import(pathToFileURL(join(shared, "recovery_words.mjs")).href);
    put("words.txt", await keyToWords(root16, RECOVERY_WORDS));
    put("link.txt", await cardLink(baseUrl, root16, RECOVERY_WORDS));
    log("card written; waiting for the iPad to restore");
    await waitFor("ui-done", 240000);
    await sleep(1500);
    dumpTo(db, "peer.dump");
    put("host-done", Date.now());
    process.exit(0);
  }

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
  const NEW_NAME = NAME + "d";
  groups.renameEntity(db, entityId, NEW_NAME);
  groups.setSetting(db, "speech_rate", "faster");
  put("peer-edit.json", JSON.stringify({ t0: Date.now(), name: NEW_NAME, speech_rate: "faster" }));
  log("applied rename + setting");

  await waitFor("ui-saw-edit");
  if (scenario === "person") return personFlow(db, entityId, NAME, dumpTo);
  if (scenario === "media") return mediaFlow(db, entityId, client, userKey, dumpTo);
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

/* --- 044 C4: two linked people on one iPad. FLOW (per peer, own dir):
 *   ui -> ui-go-edit2   -> peer renames again (the iPad has another person open)
 *   host -> peer-edit2.json (written once the relay accepted the op)
 *   ui -> ui-saw-edit2, ui-go-edit3 -> rename while this person is open
 *   host -> peer-edit3.json; ui -> ui-saw-edit3; ui-done -> dump
 */
async function personFlow(db, entityId, NAME, dumpTo) {
  const settle = async () => {
    for (let i = 0; i < 100 && db.prepare("SELECT COUNT(*) c FROM sync_op WHERE relay_seq IS NULL").all()[0].c; i++) await sleep(100);
  };
  for (const [go, saw, file, suffix] of [
    ["ui-go-edit2", "ui-saw-edit2", "peer-edit2.json", "dd"],
    ["ui-go-edit3", "ui-saw-edit3", "peer-edit3.json", "ddd"],
  ]) {
    await waitFor(go, 400000);
    groups.renameEntity(db, entityId, NAME + suffix);
    await settle(); // the relay holds it before the iPad is told
    put(file, JSON.stringify({ t0: Date.now(), name: NAME + suffix }));
    log("applied", file);
    await waitFor(saw, 400000);
  }
  await waitFor("ui-done");
  await sleep(1500);
  dumpTo(db, "peer.dump");
  put("host-done", Date.now());
  process.exit(0);
}

/* --- 044 C4: photos and recordings. FLOW:
 *   ui -> ui-cut-on          the proxy now cuts every blob download mid-body
 *   host sets a picture (noise PNG) and a recording (WAV) on the person's
 *        word and a Chrome-style webm recording on a second word, writes the
 *        files the iPad's test hook will attach (ipad-photo.png, ipad-voice.wav)
 *        -> peer-media.json
 *   ui -> ui-media-verified  the iPad drew, played, and said "can't play" for webm
 *   ui -> ui-sent-media {photoSha, voiceSha}  (set on the iPad)
 *   host pulls both from the relay BY HASH, opens (hash checked), compares
 *        -> peer-verified-ipad-media.json
 */
const sha256 = async (bytes) => sc.sha256Hex(bytes);
function makePng(w, h) {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let x = 0xffffffff;
    for (const b of buf) x = table[(x ^ b) & 255] ^ (x >>> 8);
    return (x ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rowLen = 1 + w * 3;
  const raw = Buffer.alloc(rowLen * h);
  for (let y = 0; y < h; y++) crypto.getRandomValues(raw.subarray(y * rowLen + 1, (y + 1) * rowLen));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
function makeWav(freq = 440, ms = 400) {
  const rate = 8000, n = Math.floor(rate * ms / 1000), data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(8000 * Math.sin(2 * Math.PI * freq * i / rate)), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
const makeWebm = () => Buffer.concat([
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]), crypto.getRandomValues(Buffer.alloc(600))]);

async function mediaFlow(db, entityId, client, userKey, dumpTo) {
  await waitFor("ui-cut-on");
  const photo = new Uint8Array(makePng(150, 150));
  const rec = new Uint8Array(makeWav());
  const webm = new Uint8Array(makeWebm());
  const sent = {};
  for (const [name, bytes] of [["photo", photo], ["rec", rec], ["webm", webm]]) {
    sent[name] = await sha256(bytes);
    globalThis.__peerBlobs.set(sent[name], bytes);
    await syncUploadBlob(bytes); // the web's own queue -> sealed PUT /blobs/<sha>
  }
  for (let i = 0; i < 200 && syncHealth().mediaPending; i++) await sleep(100);
  if (syncHealth().mediaPending) throw new Error("peer media never uploaded");
  const web = groups.createEntity(db, { name: "Webby", role: "Green" });
  seatSetupPeople(db, [web.id], "en");
  const ipadPhoto = makePng(120, 120), ipadVoice = makeWav(660, 500);
  writeFileSync(join(dir, "ipad-photo.png"), ipadPhoto);
  writeFileSync(join(dir, "ipad-voice.wav"), ipadVoice);
  // Edits through the web's own writers (they record the ops).
  groups.setEntityPhoto(db, entityId, `blob:${sent.photo}`);
  const ent = db.prepare("SELECT spoken_name FROM personal_entity WHERE id = ?").all(entityId)[0].spoken_name;
  voiceMod.setOverride(db, { itemKind: "entity", itemId: entityId, key: `blob:${sent.rec}`, recordedText: ent });
  voiceMod.setOverride(db, { itemKind: "entity", itemId: web.id, key: `blob:${sent.webm}`, recordedText: "Webby" });
  put("peer-media.json", JSON.stringify({ photoSha: sent.photo, recSha: sent.rec, webmSha: sent.webm,
    webEntity: web.id, photoBytes: photo.length }));
  log("set photo", sent.photo.slice(0, 12), "recording", sent.rec.slice(0, 12), "webm", sent.webm.slice(0, 12));
  await waitFor("ui-media-verified", 240000);

  const want = JSON.parse(await waitFor("ui-sent-media", 240000));
  const t0 = Date.now();
  const checks = {};
  for (const [label, sha] of [["photo", want.photoSha], ["voice", want.voiceSha]]) {
    let bytes = null;
    for (;;) {
      try {
        const env = await client.getBlob(sha);
        bytes = await sc.openBlob(userKey, { sha, env }); // throws on a hash mismatch
        break;
      } catch (e) {
        if (Date.now() - t0 > 90000) throw new Error(`iPad ${label} never reached the relay: ${e.message}`);
        await sleep(500);
      }
    }
    checks[label] = { sha, hashMatches: (await sha256(new Uint8Array(bytes))) === sha, bytes: bytes.length };
  }
  // The ops arrived too: the same keys sit in this peer's tables.
  for (let i = 0; i < 100; i++) {
    const img = db.prepare("SELECT COUNT(*) c FROM image_override WHERE photo_key = ?").all(`blob:${want.photoSha}`)[0].c;
    const clip = db.prepare("SELECT COUNT(*) c FROM clip_override WHERE key = ?").all(`blob:${want.voiceSha}`)[0].c;
    checks.opsArrived = { photoRows: img, clipRows: clip };
    if (img && clip) break;
    await sleep(200);
  }
  put("peer-verified-ipad-media.json", JSON.stringify(checks));
  log("verified iPad media", JSON.stringify(checks));
  await waitFor("ui-done");
  await sleep(1500);
  dumpTo(db, "peer.dump");
  put("host-done", Date.now());
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
