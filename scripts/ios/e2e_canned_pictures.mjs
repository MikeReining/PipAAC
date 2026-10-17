/**
 * Canned Picture Finder answers for the sync E2E (044 E6b). The local Worker
 * has no image provider (and no paid API may be called), so scripts/ios/
 * e2e_proxy.mjs answers the finder's routes with these; the web-device peer
 * imports the same module to know, independently of the iPad, which bytes a
 * "picture chosen on the iPad" must be (by SHA-256).
 *
 * Deterministic: the same name always gives the same PNG, so a hash computed
 * here, in the proxy and in the peer agree without any of them asking the
 * iPad what it saved.
 */
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";

const table = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let x = 0xffffffff;
  for (const b of buf) x = table[(x ^ b) & 255] ^ (x >>> 8);
  return (x ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};

/** A 96x96 PNG whose pixels are derived from `name` (never two names alike). */
export function cannedPng(name) {
  const seed = createHash("sha256").update(name).digest();
  const w = 96, h = 96, rowLen = 1 + w * 3;
  const raw = Buffer.alloc(rowLen * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * rowLen + 1 + x * 3;
      raw[o] = seed[(x + y) % 32]; raw[o + 1] = seed[(x * 3 + y) % 32]; raw[o + 2] = seed[(x + y * 5) % 32];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

export const sha256Hex = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** The picture the iPad's Find offers and the test picks. */
export const IPAD_PICK = "img_e2e_ipad";
/** The picture the web device picks for another word. */
export const WEB_PICK = "img_e2e_web";

/** /api/v1/pictures/find answer: one close candidate, nothing automatic. */
export const findBody = () => ({
  candidates: [{ image_id: IPAD_PICK, asset: `/symbols/${IPAD_PICK}.png`, source: "ours", score: 0.9 }],
  auto: null, scope: "common", kind: "None", language: "en", calibrated: true,
});

/** path -> { status, type, body } for the finder routes the proxy answers, or null. */
export function cannedAnswer(method, path) {
  const json = (o, status = 200) => ({ status, type: "application/json", body: Buffer.from(JSON.stringify(o)) });
  if (path === "/api/v1/pictures/find") return json(findBody());
  if (path === "/api/v1/pictures/allowance") return json({ left: 5, total: 5 });
  if (path === "/api/v1/pictures/pick" || path === "/api/v1/pictures/reject") return { status: 204, type: "text/plain", body: Buffer.alloc(0) };
  const m = /^\/symbols\/(img_e2e_[a-z]+)\.png$/.exec(path);
  if (m && method === "GET") return { status: 200, type: "image/png", body: cannedPng(m[1]) };
  return null;
}
