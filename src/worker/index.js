import catalog from "../../data/catalog/catalog.json" with { type: "json" };
import { BoardRelay } from "./relay.js";

export { BoardRelay };

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
