/**
 * 023 §1e — the Settings PIN.
 *
 * A four-digit gate on Parent corner: the child can't open Settings or
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
 * - **Stored** as a SHA-256 hash under `device/pin` in the device
 *   keyStore — one PIN per device, never synced, shared by every person
 *   on it. The tablet's PIN belongs to the tablet; a sibling's iPad can
 *   have its own. An SLP's laptop with 14 clients has one PIN, not 14
 *   (Settings redesign, founder 2026-09-28).
 * - **Off until asked for** (founder 2026-09-28). A new board has no
 *   PIN: Settings opens with one tap until someone locks it (Settings →
 *   Backup & privacy, or the "Protect" card once the board is worth
 *   protecting). Turning it off clears it for everyone on the device.
 * - **Exactly four digits** (founder 2026-09-29). The threat is a curious
 *   child, not an attacker, so 10,000 combinations is plenty. Fixed
 *   length means the sheet checks on the fourth digit: no Open button,
 *   no length to choose.
 * - **Never shown.** Only the hash is kept, so the app cannot display
 *   the digits — the child watching is the threat, and adults reuse
 *   phone PINs. Settings changes it (no old PIN: the gate was just
 *   passed).
 * - **Forgot** is one path anyone holding the tablet can finish: type
 *   the reset phrase, then choose a new PIN. A young child can't read
 *   or spell it; an adult types it in two seconds. No license or QR
 *   card — most boards have neither, and a gate that can lock a family
 *   out of their own Settings for good is worse than the speed bump it
 *   protects (founder 2026-09-29). The board is never touched.
 * - **Asked on every open.** No unlock session: mom finishes, hands
 *   the tablet back, and the very next tap is the child's again.
 */

const te = new TextEncoder();
const hex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

const DEVICE_PIN = "device/pin";

export const PIN_RE = /^\d{4}$/;

async function hash(pin) {
  return hex(await crypto.subtle.digest("SHA-256", te.encode(`pip-pin:device:${pin}`)));
}

export async function hasPin(store) {
  return !!(await store.get(DEVICE_PIN));
}

export async function setPin(store, pin) {
  if (!PIN_RE.test(String(pin))) throw new Error("pin must be 4 digits");
  await store.put(DEVICE_PIN, await hash(String(pin)));
}

/** Turn the PIN off: Settings opens without one again. */
export async function clearPin(store) {
  await store.del(DEVICE_PIN);
}

export async function checkPin(store, pin) {
  const device = await store.get(DEVICE_PIN);
  return !!device && device === (await hash(String(pin)));
}

/** Forgot: the words an adult types to choose a new PIN. Case and
 *  spacing don't matter. */
export const RESET_PHRASE = "new pin";

export function isResetPhrase(text) {
  return String(text).trim().toLowerCase().replace(/\s+/g, " ") === RESET_PHRASE;
}
