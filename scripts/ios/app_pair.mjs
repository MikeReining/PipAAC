/**
 * Pairing facade (phase 044 C3) — PIPCORE.pair. The web's two pairing
 * flows from public/board/devices-ui.js, minus the DOM: the protocol
 * itself is the shared modules' (pairClient, relayClient, wrapUserKey /
 * unwrapUserKey, putUserKey, recoveryProof), running in the core over
 * the C2 host shims. Results leave as host events (a JSC caller cannot
 * await):
 *   "pair.offer" { stage: "code"|"linked"|"done"|"refused"|"expired"|"error", ... }
 *   "pair.join"  { stage: "claimed"|"granted"|"refused"|"error", status?, message?, ... }
 *
 * MIRRORED from devices-ui.js (no shared module holds them — the web
 * keeps this orchestration inside mountDevices closures):
 *   ensureUser   ~L101-125  create the relay user (registry id = relay id)
 *   offerFlow    ~L824-945  owner check, free-limit check, offer, poll,
 *                           addDevice, wrap every held epoch, grant
 *   joinFlow     ~L694-755  claim; waitForGrant ~L760-808 poll + unwrap
 * Not mirrored: reconcilePlan's license-copy handling (purchase is out
 * of scope for C3) — lifetime is the relay's `entitlement` answer.
 */
import {
  ensureRecoveryRoot, exportDhPublic, exportPublicKey, getDeviceIdentity,
  getUserKey, openKeyStore, putUserKey, unwrapUserKey, wrapUserKey,
} from "./host/sync_crypto_host.mjs"; // the iOS build of sync_crypto (Swift CryptoKit behind handles)
import { pairClient, relayClient } from "../../public/shared/sync_client.mjs";
import { recoveryProof } from "../../public/shared/recovery.mjs";
import { hostCall } from "./jsc_shims.mjs";

const parse = (x) => (typeof x === "string" ? JSON.parse(x) : x);
const emit = (name, payload) => globalThis.__pipHost.emit(name, JSON.stringify(payload));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const POLL_MS = 2000; // devices-ui.js polls every 2 s

/** devices-ui.js cleanCode / showCode. */
export const cleanCode = (v) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
export const showCode = (c) => `${c.slice(0, 4)} ${c.slice(4)}`;

let offerGen = 0;
let joinGen = 0;
export function offerCancel() { offerGen++; return true; }
export function joinCancel() { joinGen++; return true; }

/* ---------------- this device is the NEW device: type a code ---------------- */

/** Claim a typed code, then wait for the grant and store the keys. Swift
 *  adds the registry row on "granted". */
export function join(baseUrl, codeArg, label) {
  const gen = ++joinGen;
  const code = cleanCode(codeArg);
  (async () => {
    const store = openKeyStore();
    const identity = await getDeviceIdentity(store);
    try {
      await pairClient(baseUrl).claim(code, {
        device_id: identity.deviceId,
        sig_pub: await exportPublicKey(identity.verify),
        dh_pub: await exportDhPublic(identity.dh.publicKey),
        label,
      });
    } catch (e) {
      emit("pair.join", { stage: "error", status: e.status ?? 0,
        message: e.status === 410
          ? "That code ran out. Make a new one on the other device."
          : e.status === 409
            ? "That code was already used. Make a new one on the other device."
            : e.status === 404
              ? "That code isn't open — check the letters, or make a new one."
              : `Could not reach Pip: ${e.message}` });
      return;
    }
    if (gen !== joinGen) return;
    emit("pair.join", { stage: "claimed", message: "Connected — finishing on the other device…" });
    while (gen === joinGen) {
      await sleep(POLL_MS);
      if (gen !== joinGen) return;
      try {
        const st = await pairClient(baseUrl).status(code);
        if (st.status === "refused") {
          emit("pair.join", { stage: "refused",
            message: st.grant?.refused ?? "The other device declined." });
          return;
        }
        if (st.status !== "granted") continue;
        const epoch = st.grant.epoch ?? 1;
        if (Array.isArray(st.grant.keys) && st.grant.keys.length) {
          for (const g of st.grant.keys) {
            if (!Number.isInteger(g?.epoch)) continue;
            const k = await unwrapUserKey(identity.dh.privateKey, g);
            await putUserKey(store, st.grant.user_id, k, g.epoch);
          }
        } else {
          const key = await unwrapUserKey(identity.dh.privateKey, st.grant);
          await putUserKey(store, st.grant.user_id, key, epoch);
        }
        emit("pair.join", { stage: "granted", userId: st.grant.user_id, epoch });
        return;
      } catch (e) {
        // The web swallows every poll error; a non-relay error here (not an HTTP
        // status) is not going to fix itself - say it instead of waiting forever.
        if (e?.status === undefined && !/fetch|network|timed out|Failed/i.test(String(e?.message))) {
          emit("pair.join", { stage: "error", status: 0, message: `Could not finish joining: ${e?.message ?? e}` });
          return;
        }
      }
    }
  })().catch((e) => emit("pair.join", { stage: "error", status: 0,
    message: `Could not reach Pip: ${e.message}` }));
  return { accepted: true };
}

/* ---------------- this device HAS the person: offer a code ---------------- */

/** userRow = { id, name, sync? }. Creates the relay user first when this
 *  person is not linked yet, then shows a code and grants on claim. */
export function offer(baseUrl, userRowJson, label) {
  const gen = ++offerGen;
  const me = parse(userRowJson);
  (async () => {
    const store = openKeyStore();
    const identity = await getDeviceIdentity(store);
    if (!me.sync?.userId) {
      const root = await ensureRecoveryRoot(store, me.id);
      const res = await fetch(`${baseUrl}/users`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user_id: me.id, device_id: identity.deviceId,
          pubkey: await exportPublicKey(identity.verify),
          dh_pub: await exportDhPublic(identity.dh.publicKey),
          recovery_proof: await recoveryProof(root), label,
        }),
      });
      if (!res.ok) throw new Error(`user create: ${res.status}`);
      const { user_id } = await res.json();
      me.sync = { userId: user_id, epoch: 1, cursor: 0 };
      await hostCall("saveUser", { userId: me.id, patch: { sync: me.sync } });
      emit("pair.offer", { stage: "linked", sync: me.sync });
    }
    const userKey = await getUserKey(store, me.id, me.sync.epoch ?? 1);
    const client = relayClient({ userId: me.sync.userId, baseUrl, identity, userKey });
    const who = me.name || "this board";
    const [{ devices }, self] = await Promise.all([client.listDevices(), client.selfKey()]);
    if (self?.owner === false) {
      emit("pair.offer", { stage: "refused", lines: [
        `Only ${who}'s owner can add devices. On the owner's phone or tablet: Settings → Team & devices → Add a device. It shows a code to type on the new device.`,
        "The owner can also make you an owner in Team & devices."] });
      return;
    }
    if (self?.entitlement !== "lifetime" && devices.length >= 1) {
      emit("pair.offer", { stage: "refused", lines: [
        `Free Pip is on one device. Pip Lifetime puts ${who} on every phone, laptop, and tablet — $49 once.`] });
      return;
    }
    const { pair } = await pairClient(baseUrl).offer();
    if (gen !== offerGen) return;
    emit("pair.offer", { stage: "code", code: pair, shown: showCode(pair), who,
      hint: `On the other device, go to ${new URL(baseUrl).host}/join and type this code.`,
      waiting: "Waiting for the other device… This code works for 10 minutes." });
    while (gen === offerGen) {
      await sleep(POLL_MS);
      if (gen !== offerGen) return;
      let st;
      try {
        st = await pairClient(baseUrl).status(pair);
      } catch (e) {
        if (e.status === 410) { emit("pair.offer", { stage: "expired", message: "This code ran out." }); return; }
        continue; // relay hiccup — poll again
      }
      if (st.status !== "claimed") continue;
      const name = st.label || "the other device";
      try {
        await client.addDevice(st.device_id, st.sig_pub, { dh_pub: st.dh_pub, label: st.label });
      } catch (e) {
        const msg = e.message === "upgrade_required"
          ? "Pip Lifetime is needed for more than one device."
          : `Pip refused the device: ${e.message}`;
        await pairClient(baseUrl).grant(pair, { refused: msg }).catch(() => {});
        emit("pair.offer", { stage: "refused", lines: [msg] });
        return;
      }
      const wrapped = await wrapUserKey(userKey, st.dh_pub);
      const keys = [];
      for (let e = 1; e <= (me.sync.epoch ?? 1); e++) {
        const k = await store.get(`user/${me.id}/key_e${e}`);
        if (k) keys.push({ epoch: e, ...(await wrapUserKey(k, st.dh_pub)) });
      }
      await pairClient(baseUrl).grant(pair, {
        user_id: me.sync.userId, by_device: identity.deviceId,
        epoch: me.sync.epoch ?? 1, ...wrapped, keys });
      emit("pair.offer", { stage: "done", message: `✓ ${who} is on ${name}.` });
      return;
    }
  })().catch((e) => emit("pair.offer", { stage: "error", message: `Could not reach Pip: ${e.message}` }));
  return { accepted: true };
}
