/**
 * Pip keys — the board-mode keyboard (docs/product/Profile_Presentation_Modes.md
 * § 4). Pure module: no DOM, no db. Key maps are data per locale in
 * keymaps.mjs; this module resolves them and lays out the 60 slots.
 */
import { KEYMAPS, PARTNER_SENSES } from "./keymaps.mjs";

const DIGITS = "1234567890";
const ROW5_START = 40;
const BACKSPACE_SLOT = 48;
const PARTNER_ROW_START = 50;

/**
 * Key-map lookup: exact BCP 47 tag first, then the language subtag
 * (`de-AT` → `de`). Never another language — a locale with no map falls
 * back to Device keyboard mode, never to English keys.
 */
export function resolveKeymap(locale) {
  if (typeof locale !== "string" || locale.length === 0) return null;
  const tag = locale.toLowerCase();
  return KEYMAPS[tag] ?? KEYMAPS[tag.split("-")[0]] ?? null;
}

/**
 * One entry per key (not per cell): { slot, span, kind, value }.
 * kind: "char" | "dead" | "space" | "backspace" | "partner".
 * Space's span is computed so it always ends at slot 47.
 *
 * @returns {object[] | null} null when the locale has no key map.
 */
export function keyMap(locale, order = "standard") {
  const entry = resolveKeymap(locale);
  if (!entry) return null;
  const spec = entry[order] ?? entry.standard;

  const keys = [];
  let slot = 0;
  for (const ch of DIGITS) {
    keys.push({ slot: slot++, span: 1, kind: "char", value: ch });
  }
  for (const row of spec.rows) {
    for (const ch of row) {
      keys.push({ slot: slot++, span: 1, kind: ch === entry.dead ? "dead" : "char", value: ch });
    }
  }
  slot = ROW5_START;
  for (const ch of spec.punct) {
    keys.push({ slot: slot++, span: 1, kind: "char", value: ch });
  }
  keys.push({ slot, span: BACKSPACE_SLOT - slot, kind: "space", value: " " });
  keys.push({ slot: BACKSPACE_SLOT, span: 2, kind: "backspace", value: "Backspace" });
  PARTNER_SENSES.forEach((id, i) => {
    keys.push({ slot: PARTNER_ROW_START + i * 2, span: 2, kind: "partner", value: id });
  });
  return keys;
}
