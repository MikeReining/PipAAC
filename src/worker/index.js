import catalog from "../../data/catalog/catalog.json" with { type: "json" };

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) },
  });

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";

    if (path === "/health") {
      return json({ ok: true, service: "pippaac" });
    }

    if (path === "/catalog.json") {
      return json(catalog);
    }

    return json({ error: "not_found", path }, { status: 404 });
  },
};
