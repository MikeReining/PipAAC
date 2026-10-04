/**
 * 036 — app-shell service worker. Owns cold offline boot: precaches the
 * generated manifest into a versioned cache at install, serves precached
 * files cache-first, and keeps `/api/v1/pictures/img/<id>` in a runtime
 * cache. Everything else — POSTs, /api/*, /admin/*, the relay WS — falls
 * through to the network; callers degrade honestly per the phase doc.
 *
 * 041 Slice A — audio is out of the shell. The offline promise is the
 * ACTIVE voice only: when the page announces it (postMessage
 * "pip-active-voice"), that voice's clips fill `pip-audio-<voice>-<hash>`
 * in the background — after the board, never before. `sw-audio.json`
 * carries each voice's clip list and its hash; a clip-list change gets a
 * new cache name, so a shell deploy never re-downloads audio and a stale
 * voice cache is pruned on the next fill. Voices already cached stay —
 * an online switch back is instant.
 *
 * Launch path: navigations take the network first; when it can't
 * answer they fall back to the shell, then /offline.html — a dead
 * home-screen launch (no browser chrome, no reload affordance) gets
 * a page with a retry instead of Safari's permanent error. Install
 * retries failed files once: a blip must not strand the worker.
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
const AUDIO_PREFIX = "pip-audio-"; // + <voice>-<clip-list-hash>
const CHUNK = 6; // install/fill fetches per parallel batch (041 A1)

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
    /* Every shell file is required — the manifest is the offline boot
     * promise; optional payloads (audio) live outside this install.
     * A failed file gets one more pass: a network blip during install
     * must not strand the whole worker — an uninstalled SW means a
     * home-screen launch hits the bare network error with no way back
     * (2026-10-04 founder report: the iPad icon went permanently dead). */
    const fetchAll = async (list) => {
      const failed = [];
      for (let i = 0; i < list.length; i += CHUNK) {
        await Promise.all(list.slice(i, i + CHUNK).map(async (f) => {
          try { await precachePut(cache, f.path); } catch { failed.push(f); }
        }));
      }
      return failed;
    };
    const failed = await fetchAll(files);
    const left = await fetchAll(failed);
    if (left.length) {
      throw new Error(`precache: ${left.length} file(s) failed — ${left[0].path}`);
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
    // The voice caches survive deploys — the shell build does not own
    // them (041 A4). Stale per-voice versions prune inside fillVoice.
    await clients.claim();
  })());
});

/* --- per-voice audio (041 A2) ------------------------------------ */
let audioMap = null;          // /sw-audio.json, memoized per SW lifetime
let activeVoice = null;
const filling = new Set();    // voice ids with a fill in flight

async function loadAudioMap() {
  if (!audioMap) {
    const res = await fetch("/sw-audio.json", { cache: "no-cache" });
    if (res.ok) audioMap = (await res.json()).voices ?? {};
  }
  return audioMap;
}

/** Fill the active voice's cache in the background — best effort: a
 *  clip that misses is skipped (that word mints or stays silent once),
 *  it never strands the others. Stale versions of THIS voice prune;
 *  other voices keep their caches. */
async function fillVoice(voice) {
  if (!voice || filling.has(voice)) return;
  const map = await loadAudioMap();
  const entry = map[voice];
  if (!entry) return;
  const name = `${AUDIO_PREFIX}${voice}-${entry.hash}`;
  filling.add(voice);
  try {
    const cache = await caches.open(name);
    for (const k of await caches.keys()) {
      if (k.startsWith(`${AUDIO_PREFIX}${voice}-`) && k !== name) await caches.delete(k);
    }
    for (let i = 0; i < entry.files.length; i += CHUNK) {
      await Promise.all(entry.files.slice(i, i + CHUNK).map(async (path) => {
        if (await cache.match(path)) return;
        try {
          const res = await fetch(path);
          if (res.ok) await cache.put(path, res);
        } catch { /* offline or a missing clip — skipped, see header */ }
      }));
    }
  } finally {
    filling.delete(voice);
  }
}

self.addEventListener("message", (e) => {
  if (e.data?.type === "pip-active-voice") {
    activeVoice = e.data.voice;
    e.waitUntil?.(fillVoice(activeVoice));
  }
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

/* Voice caches are content-keyed — a path is in one voice's list or
 * none. A network hit lands in the ACTIVE voice's cache when the map
 * owns the path (it would fetch it next anyway); otherwise the audio
 * plays once from the network and stays out of every cache. */
async function audioCacheFirst(req) {
  const u = new URL(req.url);
  const keys = (await caches.keys()).filter((k) => k.startsWith(AUDIO_PREFIX));
  for (const k of keys) {
    const hit = await (await caches.open(k)).match(u.origin + u.pathname);
    if (hit) return maybeRange(req, hit);
  }
  const res = await fetch(req);
  if (res.ok && activeVoice) {
    const entry = (await loadAudioMap().catch(() => null))?.[activeVoice];
    if (entry?.files.includes(u.pathname)) {
      const cache = await caches.open(`${AUDIO_PREFIX}${activeVoice}-${entry.hash}`);
      await cache.put(u.origin + u.pathname, res.clone());
    }
  }
  return res;
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
  if (url.pathname.startsWith("/audio/")) {
    e.respondWith(audioCacheFirst(req));
    return;
  }
  /* A navigation tries the network first — real documents (privacy,
   * admin) must keep their own responses and real 404s must stay 404s.
   * When the network can't answer — down, or the request is an app
   * route — fall back to the shell, then the offline page rather than
   * let the navigation reject: a home-screen web app has no browser
   * chrome and Safari's error page has no way back, so the fallback
   * carries the retry. (If the registration itself was evicted, nothing
   * can intercept — the honest limit.) The '/' path is precached as
   * 'index.html', so the shell answers offline. */
  if (req.mode === "navigate") {
    e.respondWith(serveNav(req));
    return;
  }
  e.respondWith(shellFirst(req));
});

async function serveNav(req) {
  const cache = await caches.open(SHELL);
  const u = new URL(req.url);
  const exact = await cache.match(u.pathname === "/" ? "/index.html" : u.pathname);
  if (exact) return exact;
  try {
    const res = await fetch(req);
    if (res.ok) return res;
  } catch { /* network down — fall through to the shell */ }
  return (await cache.match("/index.html"))
    ?? (await cache.match("/offline.html"))
    ?? new Response(
      "<!doctype html><title>Pip AAC</title>Pip can't reach the network — reconnect and reopen.",
      { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
}
