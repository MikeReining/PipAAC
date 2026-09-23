/**
 * Relay client (Sync_And_Web_Editing §§ 5–6). Knows how to sign a
 * request with the device key, seal ops with the board key, submit them,
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
 * client = { boardId, baseUrl, identity: {deviceId,sign,verify}, boardKey }
 */
export function relayClient({ boardId, baseUrl, identity, boardKey }) {
  const path = (suffix) => `/boards/${boardId}${suffix}`;
  const call = async (method, suffix, body) => {
    const bytes = body === undefined ? undefined : te.encode(JSON.stringify(body));
    const signedPath = path(suffix).split("?")[0]; // the DO signs pathname only
    const res = await fetch(`${baseUrl}${path(suffix)}`, {
      method,
      headers: { ...(bytes ? { "content-type": "application/json" } : {}),
                 ...(await signedHeaders(identity, method, signedPath, bytes)) },
      body: bytes,
    });
    if (!res.ok) throw new Error(`relay ${method}${suffix}: ${res.status}`);
    return res.json();
  };

  return {
    /** Register another device (signed by an allowed one). */
    addDevice: (device_id, pubkey) => call("POST", "/devices", { device_id, pubkey }),
    /** Seal and submit pending ops; returns their relay_seqs. */
    async submit(ops) {
      const sealed = [];
      for (const op of ops) sealed.push({ op_id: op.op_id, env: await sealOp(boardKey, op) });
      return call("POST", "/ops", { ops: sealed });
    },
    /** Catch-up: ops after a relay_seq. Envelopes stay sealed — caller decrypts. */
    fetchOps: (after) => call("GET", `/ops?after=${after}`),
    openOp: (env) => openOp(boardKey, env),
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
