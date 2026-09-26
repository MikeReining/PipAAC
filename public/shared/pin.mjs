/**
 * 023 §1e — the Settings PIN.
 *
 * A 4–6 digit gate on Parent corner: the child can't open Settings or
 * edit words; the parent types four digits and is in. It is a speed
 * bump for little fingers, not a security boundary — the honest
 * threat model is the communicator, and four digits is what adults
 * already know from their phone.
 *
 * First principles:
 * - **Created** on the first Parent-corner open on a device (or the
 *   first open after reset) — never factory-seeded; a known default
 *   PIN protects nobody and a forced setup flow adds a step before a
 *   child ever speaks.
 * - **Stored** as a SHA-256 hash under `user/<id>/pin` in the device
 *   keyStore — per device, never synced. The tablet's PIN belongs to
 *   the tablet; a sibling's iPad can have its own. (A synced setting
 *   would need a learner_profile column, and schemaSql ships with the
 *   Ara catalog — per-device is also just better.)
 * - **Recovered** with the license key — the same pip-life token that
 *   activated Pip, compared against the device-local copy 024 keeps.
 *   A child can't type a 20+-char license. If the device has no stored
 *   license (activated before 024 slice 2), the parent re-enters the
 *   key once in Parent corner → Devices, and it is kept thereafter.
 * - **Asked on every open.** No unlock session: mom finishes, hands
 *   the tablet back, and the very next tap is the child's again.
 */

import { recoverFromText } from "./recovery.mjs";
import { RECOVERY_WORDS } from "./recovery_words.mjs";

const te = new TextEncoder();
const hex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

const pinKey = (userId) => `user/${userId}/pin`;
const licenseKey = (userId) => `user/${userId}/license`;

export const PIN_RE = /^\d{4,6}$/;

async function hash(userId, pin) {
  return hex(await crypto.subtle.digest(
    "SHA-256", te.encode(`pip-pin:${userId}:${pin}`)));
}

export async function hasPin(store, userId) {
  return !!(await store.get(pinKey(userId)));
}

export async function setPin(store, userId, pin) {
  if (!PIN_RE.test(String(pin))) throw new Error("pin must be 4-6 digits");
  await store.put(pinKey(userId), await hash(userId, String(pin)));
}

export async function checkPin(store, userId, pin) {
  const stored = await store.get(pinKey(userId));
  if (!stored) return false;
  return stored === (await hash(userId, String(pin)));
}

/** Recovery: verify an adult credential, then the caller sets a new
 *  PIN. Two proofs, both things only a parent can produce:
 *  - the license key — verbatim compare against the device-local copy
 *    (issued by the server, verified at activation, never leaves);
 *  - the QR card / recovery sheet — decodes to the root, compared
 *    against the device's own `user/<id>/root`. Paired devices hold
 *    wrapped keys, not the root — they use the license instead. */
export async function verifyAdult(store, userId, text) {
  const t = String(text).trim();
  if (t.startsWith("pip-life-")) {
    return (await store.get(licenseKey(userId))) === t;
  }
  const rec = await recoverFromText(t, RECOVERY_WORDS).catch(() => null);
  if (!rec || rec.userId.toLowerCase() !== userId.toLowerCase()) return false;
  const stored = await store.get(`user/${userId}/root`);
  if (!stored || stored.length !== rec.root.length) return false;
  let same = true;
  for (let i = 0; i < stored.length; i++) if (stored[i] !== rec.root[i]) same = false;
  return same;
}
