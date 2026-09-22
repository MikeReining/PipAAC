/**
 * normalize_v1 — uniqueness normalizer (schema doc §4).
 * NFC -> trim -> casefold -> collapse whitespace runs to one space.
 * Apostrophes and hyphens stay. No stemming. JS has no full casefold;
 * toLowerCase covers the launch lexicon. A fold change is a new version.
 */
export function normalizeV1(text) {
  return text.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
}
