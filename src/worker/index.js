import catalog from "../../data/catalog/catalog.json" with { type: "json" };
import { BoardRelay } from "./relay.js";
import { PairingLobby } from "./lobby.js";

export { BoardRelay, PairingLobby };

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";

    if (path === "/health") {
      return json({ ok: true, service: "pippaac" });
    }

    if (path === "/catalog.json") {
      return json(catalog);
    }

    // Sync relay (Sync_And_Web_Editing § 6): one Durable Object per board
    // orders ops and fans them out. The relay stores ciphertext only.
    if (path === "/boards" && request.method === "POST" && env?.RELAY) {
      const body = await request.json().catch(() => null);
      if (!body?.device_id || !body?.pubkey) {
        return json({ error: "bad_request" }, { status: 400 });
      }
      const boardId = crypto.randomUUID();
      const stub = env.RELAY.get(env.RELAY.idFromName(boardId));
      const init = await stub.fetch(new Request(
        `https://relay/boards/${boardId}/bootstrap`,
        { method: "POST", body: JSON.stringify({ device_id: body.device_id, pubkey: body.pubkey }) }));
      if (!init.ok) return init;
      return json({ board_id: boardId });
    }
    const boardMatch = env?.RELAY && path.match(/^\/boards\/([^/]+)(\/.*)?$/);
    if (boardMatch) {
      const stub = env.RELAY.get(env.RELAY.idFromName(boardMatch[1]));
      return stub.fetch(request);
    }

    // Pairing lobby (§ 3): a short-lived code stands up a lobby; the new
    // device polls it; the linked device writes the wrapped-key grant.
    if (path === "/pair" && request.method === "POST" && env?.PAIR) {
      const body = await request.json().catch(() => null);
      if (!body?.device_id || !body?.sig_pub || !body?.dh_pub) {
        return json({ error: "bad_request" }, { status: 400 });
      }
      // 8-char code, unambiguous alphabet — the adult types this.
      const ABC = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
      const bytes = crypto.getRandomValues(new Uint8Array(8));
      const code = [...bytes].map((b) => ABC[b % ABC.length]).join("");
      const stub = env.PAIR.get(env.PAIR.idFromName(code));
      const init = await stub.fetch(new Request(`https://lobby/pair/${code}/init`, {
        method: "POST", body: JSON.stringify(body) }));
      if (!init.ok) return init;
      return json({ pair: code });
    }
    const pairMatch = env?.PAIR && path.match(/^\/pair\/([A-Z0-9]{8})(\/.*)?$/);
    if (pairMatch) {
      const stub = env.PAIR.get(env.PAIR.idFromName(pairMatch[1]));
      return stub.fetch(request);
    }

    // Static shell. COOP/COEP make the page cross-origin isolated so the
    // SQLite WASM OPFS database can persist on-device.
    if (!env?.ASSETS) {
      return json({ error: "not_found", path }, { status: 404 });
    }
    const res = await env.ASSETS.fetch(request);
    const headers = new Headers(res.headers);
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    headers.set("Cross-Origin-Embedder-Policy", "require-corp");
    headers.set("Cross-Origin-Resource-Policy", "same-origin");
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  },
};
