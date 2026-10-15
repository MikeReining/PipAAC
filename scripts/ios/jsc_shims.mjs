/**
 * Host shims for JavaScriptCore — imported FIRST by core_entry.mjs so
 * they land before any shared module evaluates. JSC supplies JS itself
 * (Promise, JSON, TextEncoder/TextDecoder, Map, WeakMap, Uint8Array…)
 * but not the Web API surface the browser gives the shared modules:
 * crypto, console, and a couple of encoders. Native code registers the
 * __pip* blocks before evaluating the bundle; the shims adapt them.
 *
 * A shared module needing a Web global this file does not provide is a
 * shim gap — add it here, never fork the module for the port.
 */

const g = globalThis;
const host = () => g.__pipHost;

/* crypto.randomUUID — op/entity ids. Uniqueness only; signing and key
 *  bytes never come from here (CryptoKit owns those on-device). */
if (typeof g.crypto !== "object" || g.crypto === null) g.crypto = {};
if (typeof g.crypto.randomUUID !== "function") {
  g.crypto.randomUUID = () => host().randomUUID();
}
if (typeof g.crypto.getRandomValues !== "function") {
  g.crypto.getRandomValues = (arr) => {
    const bytes = host().randomBytes(arr.byteLength);
    new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength).set(bytes);
    return arr;
  };
}

/* console — the app wants the lines, so route them to the host log. */
if (typeof g.console !== "object" || g.console === null) g.console = {};
for (const level of ["log", "info", "warn", "error", "debug"]) {
  if (typeof g.console[level] !== "function") {
    g.console[level] = (...args) =>
      host().log?.(level, args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" "));
  }
}

/* TextEncoder / TextDecoder — UTF-8 only, which is all the core uses.
 *  JSC ships the real ones on current OSes; these fill the gap if a
 *  build drops them rather than forking shared modules. */
if (typeof g.TextEncoder !== "function") {
  g.TextEncoder = class {
    encode(str = "") {
      const out = [];
      for (let i = 0; i < str.length; i++) {
        let c = str.charCodeAt(i);
        if (c < 0x80) out.push(c);
        else {
          if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) {
            const d = str.charCodeAt(i + 1);
            if (d >= 0xdc00 && d < 0xe000) {
              c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++;
            }
          }
          if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
          else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
          else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        }
      }
      return new Uint8Array(out);
    }
  };
}
if (typeof g.TextDecoder !== "function") {
  g.TextDecoder = class {
    decode(buf = new Uint8Array(0)) {
      const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
      let s = "";
      for (let i = 0; i < b.length;) {
        const c = b[i++];
        if (c < 0x80) { s += String.fromCharCode(c); continue; }
        const n = c >= 0xf0 ? 3 : c >= 0xe0 ? 2 : 1;
        let cp = c & (0x7f >> n);
        for (let j = 0; j < n && i < b.length; j++) cp = (cp << 6) | (b[i++] & 63);
        s += String.fromCodePoint(cp);
      }
      return s;
    }
  };
}

/* ------------------------------------------------------------------ *
 * 044 C2 — the sync loop's Web surface (Platforms § 2: "Swift supplies
 * its I/O"). sync.mjs / rotation.mjs / sync_client.mjs / bounded.mjs run
 * UNCHANGED; everything below is what they reach for that JSC lacks.
 *
 * ONE async mechanism: hostCall(op, args) allocates an id, parks
 * {resolve, reject} in `pending`, and hands (op, id, argsJSON) to
 * __pipHost.call. Swift finishes the work (any thread) and re-enters
 * ONLY through queue.async -> __pipSettle(id, ok, json). Swift never
 * holds a JSValue; a settled or aborted id is dropped from `pending`,
 * so a late completion for an aborted call is ignored.
 * Events (timer fire, socket frames, online/visible) re-enter the same
 * way through __pipFire / __pipWsEvent / __pipPlatformEvent.
 * ------------------------------------------------------------------ */

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_INV = new Int16Array(128).fill(-1);
for (let i = 0; i < 64; i++) B64_INV[B64.charCodeAt(i)] = i;

/** Standard base64 of bytes (padding kept). */
export function bytesToB64(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const out = [];
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    out.push(B64[(n >> 18) & 63] + B64[(n >> 12) & 63]
      + (i + 1 < b.length ? B64[(n >> 6) & 63] : "=")
      + (i + 2 < b.length ? B64[n & 63] : "="));
  }
  return out.join("");
}
/** Base64 or base64url (padding optional) -> Uint8Array. */
export function b64ToBytes(s) {
  const clean = String(s).replace(/-/g, "+").replace(/_/g, "/").replace(/[=\s]+$/g, "");
  const out = new Uint8Array(Math.floor(clean.length * 3 / 4));
  let o = 0, acc = 0, bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const v = B64_INV[clean.charCodeAt(i)];
    if (v === undefined || v < 0) throw new Error("invalid base64");
    acc = (acc << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (acc >> bits) & 255; acc &= (1 << bits) - 1; }
  }
  return out.subarray(0, o);
}
export const bytesToB64u = (bytes) =>
  bytesToB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
export const b64uToBytes = b64ToBytes;

if (typeof g.btoa !== "function") {
  g.btoa = (bin) => {
    const s = String(bin);
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c > 255) throw new Error("btoa: character out of range");
      b[i] = c;
    }
    return bytesToB64(b);
  };
}
if (typeof g.atob !== "function") {
  g.atob = (b64) => {
    const b = b64ToBytes(b64);
    let s = "";
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return s;
  };
}
if (typeof g.queueMicrotask !== "function") {
  g.queueMicrotask = (fn) => { Promise.resolve().then(fn); };
}

/** -> Uint8Array for the body shapes fetch accepts. */
const toBytes = (body) => {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  return new TextEncoder().encode(String(body));
};

/* -------- promise plumbing -------- */

let nextHostId = 1;
const pending = new Map(); // id -> { resolve, reject }

/** Run a host operation -> Promise of its JSON result. `signal` aborts:
 *  the promise rejects with signal.reason, Swift is told to cancel, and
 *  any late completion is dropped. */
export function hostCall(op, args = {}, signal = null) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const id = nextHostId++;
    let onAbort = null;
    const done = (fn) => (v) => {
      if (onAbort) signal.removeEventListener("abort", onAbort);
      fn(v);
    };
    pending.set(id, { resolve: done(resolve), reject: done(reject) });
    if (signal) {
      onAbort = () => {
        if (!pending.delete(id)) return;
        host().cancel?.(id);
        reject(signal.reason);
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }
    try { host().call(op, id, JSON.stringify(args)); }
    catch (err) { pending.delete(id); done(reject)(err); }
  });
}
g.__pipSettle = (id, ok, json) => {
  const p = pending.get(id);
  if (!p) return; // aborted or already settled
  pending.delete(id);
  if (ok) p.resolve(json === "" || json == null ? undefined : JSON.parse(json));
  else p.reject(new Error(String(json)));
};

/* -------- timers -------- */

const timers = new Map(); // id -> { fn, args, every }
let nextTimerId = 1;
const startTimer = (fn, ms, args, every) => {
  const id = nextTimerId++;
  const delay = Math.max(0, Number(ms) || 0);
  timers.set(id, { fn, args, every: every ? delay : null });
  host().timerStart(id, delay);
  return id;
};
/* typeof-guarded like every shim here: under node (parity tests import
 * these modules) the real timers stay. JSC has none, so these install. */
if (typeof g.setTimeout !== "function") {
  g.setTimeout = (fn, ms, ...args) => startTimer(fn, ms, args, false);
  g.setInterval = (fn, ms, ...args) => startTimer(fn, ms, args, true);
  g.clearTimeout = g.clearInterval = (id) => {
    if (timers.delete(id)) host().timerCancel(id);
  };
}
g.__pipFire = (id) => {
  const t = timers.get(id);
  if (!t) return; // cleared while the fire was in flight
  if (t.every == null) timers.delete(id);
  else host().timerStart(id, t.every);
  try { t.fn(...t.args); }
  catch (err) { console.error(`timer: ${err?.stack ?? err}`); }
};

/* -------- AbortController / AbortSignal -------- */

const abortError = () => Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
class AbortSignal {
  constructor() { this.aborted = false; this.reason = undefined; this.onabort = null; this._ls = []; }
  addEventListener(type, fn, opts) {
    if (type === "abort") this._ls.push({ fn, once: !!(opts && opts.once) });
  }
  removeEventListener(type, fn) {
    if (type === "abort") this._ls = this._ls.filter((l) => l.fn !== fn);
  }
  throwIfAborted() { if (this.aborted) throw this.reason; }
  _abort(reason) {
    if (this.aborted) return;
    this.aborted = true;
    this.reason = reason === undefined ? abortError() : reason;
    const ev = { type: "abort", target: this };
    const ls = this._ls; this._ls = ls.filter((l) => !l.once);
    for (const l of ls) { try { l.fn.call(this, ev); } catch (e) { console.error(`abort: ${e}`); } }
    try { this.onabort?.(ev); } catch (e) { console.error(`abort: ${e}`); }
  }
  static abort(reason) { const s = new AbortSignal(); s._abort(reason); return s; }
  static timeout(ms) {
    const s = new AbortSignal();
    setTimeout(() => s._abort(Object.assign(new Error("The operation timed out."), { name: "TimeoutError" })), ms);
    return s;
  }
}
class AbortController {
  constructor() { this.signal = new AbortSignal(); }
  abort(reason) { this.signal._abort(reason); }
}
if (typeof g.AbortController !== "function") { g.AbortController = AbortController; g.AbortSignal = AbortSignal; }

/* -------- URL (sync_client.wsUrl: new URL, .search=, .protocol=, toString) -------- */

if (typeof g.URL !== "function") {
  g.URL = class URL {
    constructor(href) {
      const m = /^([a-zA-Z][a-zA-Z0-9+.-]*:)\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/.exec(String(href));
      if (!m) throw new TypeError(`Invalid URL: ${href}`);
      this.protocol = m[1].toLowerCase(); this.host = m[2];
      this.pathname = m[3] || "/"; this.search = m[4] ?? ""; this.hash = m[5] ?? "";
    }
    get origin() { return `${this.protocol}//${this.host}`; }
    get href() { return this.toString(); }
    toString() { return `${this.protocol}//${this.host}${this.pathname}${this.search}${this.hash}`; }
  };
}

/* -------- location / lifecycle globals sync.mjs gates on -------- */

if (typeof g.location !== "object" || g.location === null) {
  const origin = (typeof host()?.baseURL === "string" && host().baseURL) || "https://app.pipaac.org";
  g.location = { origin, href: `${origin}/` };
}
/* sync.mjs wires onOnline/onVisible only behind these two typeof guards;
 * the real wiring is host/platform_host.mjs (Swift -> __pipPlatformEvent). */
if (typeof g.addEventListener !== "function") g.addEventListener = () => {};
if (typeof g.document === "undefined") g.document = { visibilityState: "visible", addEventListener() {} };

/* -------- fetch / Response / Headers -------- */

class Headers {
  constructor(init) {
    this._m = new Map();
    if (init instanceof Headers) init.forEach((v, k) => this.set(k, v));
    else if (Array.isArray(init)) for (const [k, v] of init) this.set(k, v);
    else if (init && typeof init === "object") for (const k of Object.keys(init)) this.set(k, init[k]);
  }
  set(k, v) { this._m.set(String(k).toLowerCase(), String(v)); }
  append(k, v) {
    const key = String(k).toLowerCase();
    this._m.set(key, this._m.has(key) ? `${this._m.get(key)}, ${v}` : String(v));
  }
  get(k) { return this._m.get(String(k).toLowerCase()) ?? null; }
  has(k) { return this._m.has(String(k).toLowerCase()); }
  delete(k) { this._m.delete(String(k).toLowerCase()); }
  forEach(fn) { for (const [k, v] of this._m) fn(v, k, this); }
  entries() { return this._m.entries(); }
  [Symbol.iterator]() { return this._m.entries(); }
}
/* Blob: bytes + a type, the shape the voice clients cache and replay.
 * `_file` is the host path once the bytes live in the cache (044 D4):
 * Swift plays that file; the core never decodes audio. */
class Blob {
  constructor(parts = [], opts = {}) {
    const chunks = parts.map((p) => (p instanceof Blob ? p._bytes : toBytes(p)));
    const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    this._bytes = out;
    this.type = String(opts.type ?? "");
    this._file = null;
  }
  get size() { return this._bytes.length; }
  arrayBuffer() { return Promise.resolve(this._bytes.slice().buffer); }
  text() { return Promise.resolve(new TextDecoder().decode(this._bytes)); }
}
if (typeof g.Blob !== "function") g.Blob = Blob;

class Response {
  constructor(body = null, init = {}) {
    this._blob = body instanceof Blob ? body : null;
    this._bytes = body == null ? new Uint8Array(0)
      : body instanceof Blob ? body._bytes : toBytes(body);
    this._file = null;
    this.status = init.status ?? 200;
    this.statusText = init.statusText ?? "";
    this.headers = new Headers(init.headers);
    if (this._blob?.type && !this.headers.has("content-type")) {
      this.headers.set("content-type", this._blob.type);
    }
    this.ok = this.status >= 200 && this.status < 300;
    // No live stream: the host hands over a finished body. A reader (the
    // draw client's SSE parse, pictures.mjs readDrawStream) gets it whole.
    const bytes = this._bytes;
    this.body = body == null ? null : {
      getReader() {
        let done = false;
        return { read: async () => (done ? { done: true, value: undefined }
          : (done = true, { done: false, value: bytes })) };
      },
    };
    this.bodyUsed = false;
  }
  arrayBuffer() { return Promise.resolve(this._bytes.slice().buffer); }
  text() { return Promise.resolve(new TextDecoder().decode(this._bytes)); }
  json() { return this.text().then((t) => JSON.parse(t)); }
  blob() {
    const b = new Blob([this._bytes], { type: this.headers.get("content-type") ?? "" });
    b._file = this._file;
    return Promise.resolve(b);
  }
}
if (typeof g.Headers !== "function") g.Headers = Headers;
if (typeof g.Response !== "function") g.Response = Response;

if (typeof g.fetch !== "function") {
  g.fetch = async (input, init = {}) => {
    let url = String(input?.url ?? input);
    // The web fetches same-origin paths ("/api/v1/transform"); URLSession
    // wants an absolute URL, so resolve against the app's origin.
    if (url.startsWith("/")) url = `${g.location.origin}${url}`;
    const headers = {};
    new Headers(init.headers).forEach((v, k) => { headers[k] = v; });
    const r = await hostCall("fetch", {
      url, method: String(init.method ?? "GET").toUpperCase(), headers,
      body: init.body == null ? null : bytesToB64(toBytes(init.body)),
    }, init.signal ?? null);
    return new Response(b64ToBytes(r.body), {
      status: r.status, statusText: r.statusText, headers: r.headers });
  };
}

/* -------- caches (044 D4) --------
 * Cache Storage over files: voice_sentence.mjs / voice_tile.mjs keep every
 * clip under https://voice.local/... in a named cache. Swift stores each
 * entry as a file (PipHostCache.swift); put/match hand back the file path
 * on `_file` so the speaker opens the very bytes the cache holds. */
const cacheUrl = (req) => String(req?.url ?? req);
if (typeof g.caches !== "object" || g.caches === null) {
  g.caches = {
    async open(name) {
      return {
        async match(req) {
          const r = await hostCall("cache", { op: "get", cache: name, url: cacheUrl(req) });
          if (!r) return undefined;
          const res = new Response(b64ToBytes(r.body), { headers: { "content-type": r.type } });
          res._file = r.file;
          return res;
        },
        async put(req, res) {
          const r = await hostCall("cache", {
            op: "put", cache: name, url: cacheUrl(req),
            type: res.headers.get("content-type") ?? "", body: bytesToB64(res._bytes) });
          if (res._blob) res._blob._file = r.file;
          res._file = r.file;
        },
        async delete(req) {
          return !!(await hostCall("cache", { op: "delete", cache: name, url: cacheUrl(req) }));
        },
        async keys() {
          return (await hostCall("cache", { op: "keys", cache: name })).map((url) => ({ url }));
        },
      };
    },
  };
}

/* -------- WebSocket (text frames) -------- */

const sockets = new Map();
class WebSocket {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  constructor(url) {
    this.url = String(url);
    this.readyState = 0;
    this.onopen = this.onmessage = this.onclose = this.onerror = null;
    this._id = nextHostId++;
    sockets.set(this._id, this);
    host().wsOpen(this._id, this.url);
  }
  send(data) {
    if (this.readyState !== 1) throw new Error("WebSocket is not open");
    host().wsSend(this._id, String(data));
  }
  close() {
    if (this.readyState >= 2) return;
    this.readyState = 2;
    host().wsClose(this._id);
  }
}
WebSocket.prototype.CONNECTING = 0; WebSocket.prototype.OPEN = 1;
WebSocket.prototype.CLOSING = 2; WebSocket.prototype.CLOSED = 3;
if (typeof g.WebSocket !== "function") g.WebSocket = WebSocket;
g.__pipWsEvent = (id, type, data) => {
  const ws = sockets.get(id);
  if (!ws) return;
  const ev = { type, target: ws };
  try {
    if (type === "open") { if (ws.readyState === 0) { ws.readyState = 1; ws.onopen?.(ev); } }
    else if (type === "message") { if (ws.readyState === 1) ws.onmessage?.({ ...ev, data }); }
    else if (type === "error") ws.onerror?.(ev);
    else if (type === "close") { ws.readyState = 3; sockets.delete(id); ws.onclose?.(ev); }
  } catch (err) { console.error(`websocket: ${err?.stack ?? err}`); }
};

/* -------- crypto.subtle.digest (SHA-256 only; all else is host crypto) -------- */

if (typeof g.crypto.subtle !== "object" || g.crypto.subtle === null) g.crypto.subtle = {};
if (typeof g.crypto.subtle.digest !== "function") {
  g.crypto.subtle.digest = async (alg, data) => {
    const name = typeof alg === "string" ? alg : alg?.name;
    if (name !== "SHA-256") throw new Error(`digest: ${name} unsupported (SHA-256 only)`);
    const out = await hostCall("sha256", { b64: bytesToB64u(toBytes(data)) });
    return b64ToBytes(out).slice().buffer;
  };
}
