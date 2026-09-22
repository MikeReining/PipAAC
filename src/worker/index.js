import catalog from "../../data/catalog/catalog.json" with { type: "json" };

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
