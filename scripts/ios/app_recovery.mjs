/**
 * Recovery card facade (phase 044 C5) - PIPCORE.recovery. The web's
 * public/board/recovery-ui.js minus the DOM. The protocol is the shared
 * modules': recovery.mjs (cardLink, keyToWords, recoverFromText,
 * recoveryProof), rotation.mjs (currentRecoveryRoot, resumeRecoveryCard,
 * replaceRecoveryCard), sync_client.mjs (relayClient, restoreByProof) and
 * the key store - all running in the core over the C2 host.
 *
 * MIRRORED from closures (no shared module holds them):
 *   showCard    recovery-ui.js ~L84-181   build the card (SY-9)
 *   replaceCard recovery-ui.js ~L187      replace, then show again
 *   doRestore   recovery-ui.js ~L195      root -> relay restore -> keys
 *   run         recovery-ui.js ~L255      text -> root, with the web's words
 *   ensureUser  devices-ui.js   ~L101     create the relay user quietly
 *   userClient  devices-ui.js   ~L824     signed relay client for a user
 * Not here (Swift): QR drawing, the card image, Photos/print/share, the
 * camera scan (the scanned TEXT arrives in restore()).
 *
 * Results leave as host events:
 *   "recovery.card"    { stage: "card", payload, words[], offline }
 *                      | { stage: "unavailable"|"error", message }
 *                      | { stage: "replaceFailed", message }
 *   "recovery.linked"  { sync }   first card turned the backup on; Swift
 *                                 refreshes the row and starts the loop
 *   "recovery.restore" { stage: "checking"|"notcard"|"error"|"restoring", message }
 *                      | { stage: "done", userId, epoch, moved }
 */
import {
  ensureRecoveryRoot, exportDhPublic, exportPublicKey, getDeviceIdentity,
  getUserKey, openEpochBundle, openKeyStore, putUserKey, userRootName,
} from "./host/sync_crypto_host.mjs";
import {
  cardLink, keyToWords, recoverFromText, recoveryProof,
} from "../../public/shared/recovery.mjs";
import { RECOVERY_WORDS } from "../../public/shared/recovery_words.mjs";
import { relayClient, restoreByProof } from "../../public/shared/sync_client.mjs";
import { currentRecoveryRoot, replaceRecoveryCard, resumeRecoveryCard } from "../../public/shared/rotation.mjs";
import { syncRekey } from "../../public/shared/sync.mjs";
import { hostCall } from "./jsc_shims.mjs";

const parse = (x) => (typeof x === "string" ? JSON.parse(x) : x);
const emit = (name, payload) => globalThis.__pipHost.emit(name, JSON.stringify(payload));

/** The web's saveUser: patch the registry row (Swift) and keep `me` current. */
const saverFor = (me) => async (patch) => {
  if (patch?.sync) me.sync = patch.sync;
  Object.assign(me, patch);
  await hostCall("saveUser", { userId: me.id, patch });
};

/** devices-ui.js ensureUser({quiet}): first backup action creates the
 *  relay user, minting the recovery root so the relay holds its proof. */
async function ensureUser(baseUrl, me, label, saveUser) {
  if (me.sync?.userId) return me.sync;
  const store = openKeyStore();
  const identity = await getDeviceIdentity(store);
  const root = await ensureRecoveryRoot(store, me.id);
  const res = await fetch(`${baseUrl}/users`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: me.id, device_id: identity.deviceId,
      pubkey: await exportPublicKey(identity.verify),
      dh_pub: await exportDhPublic(identity.dh.publicKey),
      recovery_proof: await recoveryProof(root), label }),
  });
  if (!res.ok) throw new Error(`user create: ${res.status}`);
  const { user_id } = await res.json();
  const next = { userId: user_id, epoch: 1, cursor: 0 };
  await saveUser({ sync: next });
  emit("recovery.linked", { sync: next });
  return next;
}

async function userClient(baseUrl, me) {
  const cfg = me.sync;
  if (!cfg?.userId) throw new Error("no linked user");
  const store = openKeyStore();
  const identity = await getDeviceIdentity(store);
  const userKey = await getUserKey(store, me.id, cfg.epoch ?? 1);
  return { client: relayClient({ userId: cfg.userId, baseUrl, identity, userKey }), store };
}

/* ---------------- show the card (SY-9) ---------------- */

async function buildCard(baseUrl, me, label, offline, saveUser) {
  // Asking for the card turns on the encrypted backup it restores from.
  if (!me.sync?.userId) {
    try { await ensureUser(baseUrl, me, label, saveUser); } catch { /* the board may exist on the relay */ }
    if (!me.sync?.userId) {
      return { stage: "unavailable", message:
        "Connect to the internet to make the card. Pip keeps an encrypted copy that only the card can open." };
    }
  }
  const store = openKeyStore();
  let root = await store.get(userRootName(me.id));
  if (root) {
    const { client } = await userClient(baseUrl, me);
    await resumeRecoveryCard({ store, user: me, client, saveUser, rekey: syncRekey });
    // An already stored card can still be printed offline. A staged
    // replacement must finish above before any card is shown.
    root = offline ? await store.get(userRootName(me.id))
      : await currentRecoveryRoot(store, me.id, client);
  }
  if (!root) {
    return { stage: "unavailable", message:
      "This device was linked by another device and cannot show the card — print it on the device that set up sync." };
  }
  const rootBytes = root instanceof Uint8Array ? root : new Uint8Array(root);
  const payload = await cardLink(baseUrl, rootBytes, RECOVERY_WORDS);
  const words = (await keyToWords(rootBytes, RECOVERY_WORDS)).split(" ");
  // Settings' checklist and Backup warning read this: the card has been
  // on screen on this device at least once (registry, device-local).
  if (!me.cardShownAt) saveUser({ cardShownAt: Date.now() }).catch(() => {});
  return { stage: "card", payload, words, offline: !!offline };
}

/** userRow = { id, name, sync?, cardShownAt? }. */
export function card(baseUrl, userRowJson, label, offline) {
  const me = parse(userRowJson);
  buildCard(baseUrl, me, label, !!offline, saverFor(me)).then(
    (m) => emit("recovery.card", m),
    (e) => emit("recovery.card", { stage: "error", message: `Could not build the card: ${e.message}` }));
  return { accepted: true };
}

/** Replace card: new root, the old proof dies at the relay, new epoch keys
 *  go to the remaining devices. Resumable - a half-done replacement
 *  finishes before any card is shown. */
export function replace(baseUrl, userRowJson, label) {
  const me = parse(userRowJson);
  const saveUser = saverFor(me);
  (async () => {
    try {
      const { client, store } = await userClient(baseUrl, me);
      await replaceRecoveryCard({ store, user: me, client, saveUser, rekey: syncRekey });
    } catch (err) {
      emit("recovery.card", { stage: "replaceFailed",
        message: `Card replacement is unfinished: ${err.message}. Connect and try again.` });
      return;
    }
    emit("recovery.card", await buildCard(baseUrl, me, label, false, saveUser));
  })().catch((e) => emit("recovery.card", { stage: "error", message: `Could not build the card: ${e.message}` }));
  return { accepted: true };
}

/* ---------------- restore from a card (SY-10) ---------------- */

/** recovery-ui.js doRestore: root -> relay restore -> keys on this device. */
async function doRestore(baseUrl, root, label) {
  const store = openKeyStore();
  const identity = await getDeviceIdentity(store);
  const r = await restoreByProof(baseUrl, {
    proof: await recoveryProof(root),
    device_id: identity.deviceId,
    pubkey: await exportPublicKey(identity.verify),
    dh_pub: await exportDhPublic(identity.dh.publicKey),
  });
  const userId = r.user_id;
  await store.put(userRootName(userId), root);
  if (r.recovery_bundle) {
    try {
      // Card replaced at least once - the bundle carries the keys for the
      // eras sealed under retired roots.
      for (const [e, k] of Object.entries(await openEpochBundle(root, r.recovery_bundle))) {
        await putUserKey(store, userId, k, Number(e));
      }
    } catch { /* a bundle this root can't open stays ignored */ }
  }
  await getUserKey(store, userId, r.epoch);
  return { userId, epoch: r.epoch, moved: !!r.moved, label };
}

/** `text` is whatever the card was carried as: the scanned link, a pasted
 *  link, or the 12 words (recovery.mjs recoverFromText). */
export function restore(baseUrl, text, label) {
  const say = (stage, message) => emit("recovery.restore", { stage, message });
  (async () => {
    say("checking", "Checking the card…");
    try {
      const found = await recoverFromText(String(text ?? ""), RECOVERY_WORDS);
      if (!found) {
        say("notcard", "That doesn't look like a recovery link — paste the link or the 12 words.");
        return;
      }
      const done = await doRestore(baseUrl, found.root, label);
      say("restoring", "Restoring the user…");
      emit("recovery.restore", { stage: "done", userId: done.userId, epoch: done.epoch, moved: done.moved });
    } catch (e) {
      say("error", /checksum|word/i.test(e.message)
        ? e.message
        : "That card doesn't open a user — make a fresh card on a linked device.");
    }
  })();
  return { accepted: true };
}
