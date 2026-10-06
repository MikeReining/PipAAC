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
