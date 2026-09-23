/**
 * Relay client (Sync_And_Web_Editing §§ 5–6). Knows how to sign a
 * request with the device key, seal ops with the user key, submit them,
 * catch up on missed ops, and listen on the WebSocket for new ones.
 * The relay sees ciphertext only; openOps happen on this side.
 */
import { sealOp, openOp, signPayload } from "./sync_crypto.mjs";

const te = new TextEncoder();
const hex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function signedHeaders(identity, method, path, body) {
  const ts = Date.now();
  const bodyHash = hex(await crypto.subtle.digest(
    "SHA-256", body ?? new Uint8Array()));
  const sig = await signPayload(identity.sign, `${method}\n${path}\n${ts}\n${bodyHash}`);
  return { "x-pip-device": identity.deviceId, "x-pip-ts": String(ts), "x-pip-sig": sig };
}

/**
 * client = { userId, baseUrl, identity: {deviceId,sign,verify}, userKey }
 */
export function relayClient({ userId, baseUrl, identity, userKey }) {
  const path = (suffix) => `/users/${userId}${suffix}`;
  const call = async (method, suffix, body) => {
    const bytes = body === undefined ? undefined : te.encode(JSON.stringify(body));
    const signedPath = path(suffix).split("?")[0]; // the DO signs pathname only
    const res = await fetch(`${baseUrl}${path(suffix)}`, {
      method,
      headers: { ...(bytes ? { "content-type": "application/json" } : {}),
                 ...(await signedHeaders(identity, method, signedPath, bytes)) },
      body: bytes,
    });
    if (!res.ok) {
      // The relay answers {error} — carry the code so callers can tell
      // "upgrade_required" from a dead relay.
      const body = await res.json().catch(() => null);
      const err = new Error(body?.error ?? `relay ${method}${suffix}: ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  };

  return {
    /** Register another device (signed by an allowed one). */
    addDevice: (device_id, pubkey, extra = {}) =>
      call("POST", "/devices", { device_id, pubkey, ...extra }),
    /** The user's device list (device_id, epoch, added_at). */
    listDevices: () => call("GET", "/devices"),
    /** The calling device's own row — wrapped user key + epoch. */
    selfKey: () => call("GET", "/devices/self"),
    /** Remove a device (signed). Rotate keys after — it keeps old ops. */
    removeDevice: (device_id) => call("DELETE", `/devices/${device_id}`),
    /** Mint n single-use join tokens for the account bundle (§ 12.3). */
    mintJoinTokens: (n = 4) => call("POST", "/join_tokens", { n }),
    /** Post a new key epoch: { epoch, wrapped: { device_id: grant } }. */
    rotateKeys: (epoch, wrapped) => call("POST", "/keys", { epoch, wrapped }),
    /** Activate Pip Lifetime with a user-bound license key (dev path). */
    setEntitlement: (license) => call("POST", "/entitlement", { license }),
    /** Replace the QR card: new proof + the epoch-key bundle sealed to
     *  the new root — old cards stop restoring (015/3). */
    replaceRecovery: (proof, bundle) =>
      call("POST", "/recovery", { recovery_proof: proof, recovery_bundle: bundle }),
    /** Schedule user deletion — 30-day undo; undelete cancels. */
    deleteUser: () => call("DELETE", ""),
    undeleteUser: () => call("POST", "/undelete"),
    /** Seal and submit pending ops; returns their relay_seqs. */
    async submit(ops) {
      const sealed = [];
      for (const op of ops) sealed.push({ op_id: op.op_id, env: await sealOp(userKey, op) });
      return call("POST", "/ops", { ops: sealed });
    },
    /** Catch-up: ops after a relay_seq. Envelopes stay sealed — caller decrypts. */
    fetchOps: (after) => call("GET", `/ops?after=${after}`),
    openOp: (env) => openOp(userKey, env),
    /** Blob transport — the envelope's sha is the address. */
    async putBlob(sealed) {
      const p = path(`/blobs/${sealed.sha}`);
      const body = te.encode(JSON.stringify(sealed.env));
      const res = await fetch(`${baseUrl}${p}`, {
        method: "PUT",
        headers: { "content-type": "application/json", ...(await signedHeaders(identity, "PUT", p, body)) },
        body,
      });
      if (!res.ok) throw new Error(`relay PUT blob: ${res.status}`);
      return res.json();
    },
    async getBlob(sha) {
      const p = path(`/blobs/${sha}`);
      const res = await fetch(`${baseUrl}${p}`, {
        headers: await signedHeaders(identity, "GET", p, null),
      });
      if (!res.ok) throw new Error(`relay GET blob: ${res.status}`);
      return JSON.parse(await res.text());
    },
    /** WS URL with the signature in the query (no headers on WS). */
    async wsUrl() {
      const ts = Date.now();
      const p = path("/ws");
      const sig = await signPayload(identity.sign, `GET\n${p}\n${ts}`);
      const u = new URL(`${baseUrl}${p}`);
      u.search = `?device=${identity.deviceId}&ts=${ts}&sig=${sig}`;
      u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
      return u.toString();
    },
  };
}

/** Recovery-sheet restore (§ 9): unsigned — the proof stands in for a
 *  device signature. Registers the device at the current epoch. */
export async function restoreDevice(baseUrl, userId, { proof, device_id, pubkey, dh_pub }) {
  const res = await fetch(`${baseUrl}/users/${userId}/restore`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ device_id, pubkey, dh_pub, proof }),
  });
  if (!res.ok) throw new Error(`restore: ${res.status}`);
  return res.json(); // { ok, epoch }
}

/** Account sign-in (§ 12.3): unsigned — the single-use join token a
 *  linked device minted stands in for a device signature. Registers
 *  non-destructively like a Lifetime restore. */
export async function joinDeviceWithToken(baseUrl, userId, { token, device_id, pubkey, dh_pub }) {
  const res = await fetch(`${baseUrl}/users/${userId}/devices`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ device_id, pubkey, dh_pub, join_token: token }),
  });
  if (!res.ok) throw new Error(`join: ${res.status}`);
  return res.json();
}

/**
 * The pairing lobby (§ 3) — user-less routes. The new device posts a
 * request; the linked device reads it and writes the grant; the new
 * device polls status until granted or expired.
 */
export function pairClient(baseUrl) {
  return {
    request: async (device_id, sig_pub, dh_pub) => {
      const res = await fetch(`${baseUrl}/pair`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ device_id, sig_pub, dh_pub }),
      });
      if (!res.ok) throw new Error(`pair request: ${res.status}`);
      return res.json(); // { pair: "ABCD2345" }
    },
    status: async (code) => {
      const res = await fetch(`${baseUrl}/pair/${code}`);
      if (!res.ok) throw new Error(`pair status: ${res.status}`);
      return res.json();
    },
    grant: async (code, g) => {
      const res = await fetch(`${baseUrl}/pair/${code}/grant`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(g),
      });
      if (!res.ok) throw new Error(`pair grant: ${res.status}`);
      return res.json();
    },
  };
}
