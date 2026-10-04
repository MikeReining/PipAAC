/**
 * 036 — app-shell service worker. Owns cold offline boot: precaches the
 * generated manifest into a versioned cache at install, serves precached
 * files cache-first, and keeps `/api/v1/pictures/img/<id>` in a runtime
 * cache. Everything else — POSTs, /api/*, /admin/*, the relay WS — falls
 * through to the network; callers degrade honestly per the phase doc.
 *
 * Update path: no reload prompts. A new build precaches fully, then
 * skipWaiting()s and swaps the shell wholesale; open tabs are never
 * reloaded (a mid-session reload can lose a half-built sentence) — they
 * pick the new shell up on their next navigation. Waiting for every tab
 * to close stranded a device on a stale shell (2026-10-03: old `.png`
 * art keys after the WebP switch).
 * `self.SW_BUILD` comes from generated sw-build.js; bumping the manifest
 * bytes is what triggers the browser's update check (importScripts
 * resources are byte-compared).
 */
importScripts("/sw-build.js");
if (!self.SW_BUILD) throw new Error("sw-build.js missing SW_BUILD");

const SHELL = `pip-shell-${self.SW_BUILD}`;
const IMG_CACHE = "pip-img-v1";
const CHUNK = 48; // install fetches per parallel batch

/* fetch() transparently decodes content codings, so a stored response
 * whose headers still claim gzip would lie about its body (SW replays do
 * not re-run decoding). Strip the stale header — this is what makes
 * /form_table.en.json (Worker-served raw .gz) safe to precache. */
async function precachePut(cache, path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`precache ${path}: HTTP ${res.status}`);
  if (!res.headers.has("content-encoding")) return cache.put(path, res);
  const body = await res.arrayBuffer();
  const headers = new Headers(res.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  return cache.put(path, new Response(body, { status: res.status, headers }));
}

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const res = await fetch("/sw-manifest.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`sw-manifest: HTTP ${res.status}`);
    const { files } = await res.json();
    const cache = await caches.open(SHELL);
    for (let i = 0; i < files.length; i += CHUNK) {
      await Promise.all(files.slice(i, i + CHUNK).map((f) => precachePut(cache, f.path)));
    }
    await self.skipWaiting(); // only after the whole shell is cached
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((k) => k.startsWith("pip-shell-") && k !== SHELL)
      .map((k) => caches.delete(k)));
    await clients.claim();
  })());
});

/* Cached media must still answer Range requests — <audio> asks for
 * bytes=0- and a bare 200-to-range replay can wedge playback. */
async function maybeRange(req, res) {
  const range = req.headers.get("range");
  if (!range) return res;
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!m || (!m[1] && !m[2])) return res;
  const buf = await res.arrayBuffer();
  const size = buf.byteLength;
  let start, end;
  if (m[1]) {
    start = +m[1];
    end = m[2] ? Math.min(+m[2], size - 1) : size - 1;
  } else {
    start = Math.max(0, size - (+m[2]));
    end = size - 1;
  }
  if (start > end || start >= size) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  const headers = new Headers(res.headers);
  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  headers.set("Content-Length", String(end - start + 1));
  headers.delete("content-encoding");
  return new Response(buf.slice(start, end + 1), { status: 206, headers });
}

async function shellFirst(req) {
  const cache = await caches.open(SHELL);
  /* Exact-path lookup, never the scan-every-entry match option: an
   * unindexed match can't use the cache's URL index — on a multi-
   * thousand-entry shell that is hundreds of ms PER FILE on a repeat
   * launch (measured 2026-10-03: 463 ms vs 0 ms). The precache stores
   * each entry under its bare path, so origin+pathname is the same
   * answer, indexed. */
  const u = new URL(req.url);
  const hit = await cache.match(u.origin + u.pathname);
  if (hit) return maybeRange(req, hit);
  return fetch(req);
}

async function imgCacheFirst(req) {
  const cache = await caches.open(IMG_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.headers.get("upgrade") === "websocket") return;

  if (url.pathname.startsWith("/api/v1/pictures/img/")) {
    e.respondWith(imgCacheFirst(req));
    return;
  }
  // Dynamic/api surfaces never cache — callers degrade or queue offline.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin/")
      || url.pathname.startsWith("/accounts/")
      || ["/health", "/research", "/users", "/restore", "/pair"].includes(url.pathname)) {
    return;
  }
  if (req.mode === "navigate"
      && (url.pathname === "/" || url.pathname === "/index.html")) {
    e.respondWith(caches.open(SHELL)
      .then((c) => c.match("/index.html"))
      .then((hit) => hit || fetch(req)));
    return;
  }
  e.respondWith(shellFirst(req));
});
