import catalog from "../../data/catalog/catalog.json" with { type: "json" };
import { UserRelay } from "./relay.js";
import { PairingLobby } from "./lobby.js";

export { UserRelay, PairingLobby };

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

    // Sync relay (Sync_And_Web_Editing § 6): one Durable Object per user
    // orders ops and fans them out. The relay stores ciphertext only.
    if (path === "/users" && request.method === "POST" && env?.RELAY) {
      const body = await request.json().catch(() => null);
      if (!body?.device_id || !body?.pubkey) {
        return json({ error: "bad_request" }, { status: 400 });
      }
      const userId = crypto.randomUUID();
      const stub = env.RELAY.get(env.RELAY.idFromName(userId));
      const init = await stub.fetch(new Request(
        `https://relay/users/${userId}/bootstrap`,
        { method: "POST", body: JSON.stringify({
          device_id: body.device_id, pubkey: body.pubkey,
          dh_pub: body.dh_pub, recovery_proof: body.recovery_proof }) }));
      if (!init.ok) return init;
      return json({ user_id: userId });
    }
    const userMatch = env?.RELAY && path.match(/^\/users\/([^/]+)(\/.*)?$/);
    if (userMatch) {
      const stub = env.RELAY.get(env.RELAY.idFromName(userMatch[1]));
      return stub.fetch(request);
    }

    // Jev rerank (Dual_Engine § 3.2): the device never holds the key —
    // the body is forwarded verbatim, the secret is added here, and
    // nothing about the request or response contents is logged.
    if (path === "/jev/rank" && request.method === "POST") {
      if (!env?.TYPESAFE_API_KEY) {
        return json({ error: "jev_unavailable" }, { status: 503 });
      }
      const body = await request.text();
      const upstream = await fetch("https://api.typesafe.ai/v1/systemone", {
        method: "POST",
        headers: {
          "authorization": `Bearer ${env.TYPESAFE_API_KEY}`,
          "content-type": "application/json",
        },
        body,
      });
      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
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
