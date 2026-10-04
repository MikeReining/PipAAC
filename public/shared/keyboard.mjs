/**
 * Pip keys — the board-mode keyboard (docs/product/Profile_Presentation_Modes.md
 * § 4). Pure module: no DOM, no db. Key maps are data per locale in
 * keymaps.mjs; this module resolves them and lays out the 50 slots
 * (5 rows of 10).
 */
import { KEYMAPS, PARTNER_SENSES } from "./keymaps.mjs";

const DIGITS = "1234567890";
const ROW5_START = 40;
const BACKSPACE_SLOT = 47;
const ANSWER_START = 48; // yes, no — the bottom-right corner

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
 * Space's span is computed so it always ends at slot 46.
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
  keys.push({ slot: BACKSPACE_SLOT, span: 1, kind: "backspace", value: "Backspace" });
  PARTNER_SENSES.forEach((id, i) => {
    keys.push({ slot: ANSWER_START + i, span: 1, kind: "partner", value: id });
  });
  return keys;
}

/* --- Typing semantics (004 slice 2) ------------------------------------
 * The reducer is pure: it never speaks, never touches the DOM or db, and
 * never replaces what was typed with a guess. Corrections are offered in
 * the strip, never applied.
 */

const OPEN_PUNCT = new Set(["¿", "¡"]);
const SENTENCE_PUNCT = new Set([",", ".", "?", "!"]);
const SENTENCE_END = new Set([".", "?", "!"]);
const WORD_EXTRA = new Set(["'", "-"]);
const NNBSP = "\u202F";
const DEAD_ACCENTS = { "´": { a: "á", e: "é", i: "í", o: "ó", u: "ú" } };

/**
 * Word characters: the locale's alphabet, digits, `'`, `-`. A locale with
 * no key map (Device keyboard) accepts any Unicode letter/number — the
 * buffer model must not depend on a Pip-keys map existing.
 */
function isWordChar(ch, entry) {
  const c = ch.toLowerCase();
  if (entry) {
    return entry.alphabet.includes(c) || (c >= "0" && c <= "9") || WORD_EXTRA.has(c);
  }
  return /[\p{L}\p{N}]/u.test(ch) || WORD_EXTRA.has(ch);
}

/**
 * One keystroke against { buffer, pendingAccent, lead, items }.
 * `items` are the sentence bar's items ({ kind, id, text, punct?, lead? }).
 *
 * @returns {{ state: object, effects: object[] }} effects in order:
 *   { type: "commit", index } — items[index] holds the raw typed text;
 *     the caller resolves it (label → entity → typed) and speaks it.
 *   { type: "speak" } — Enter: speak the whole sentence.
 */
export function applyKey(state, key, locale) {
  const entry = resolveKeymap(locale);
  const st = {
    buffer: state.buffer ?? "",
    pendingAccent: state.pendingAccent ?? null,
    lead: state.lead ?? null,
    items: (state.items ?? []).map((i) => ({ ...i })),
  };
  const effects = [];
  const commit = () => {
    if (!st.buffer) return;
    const item = { kind: "typed", id: null, text: st.buffer };
    st.buffer = "";
    if (st.lead) {
      item.lead = st.lead;
      st.lead = null;
    }
    st.items.push(item);
    effects.push({ type: "commit", index: st.items.length - 1 });
  };

  if (key === "Backspace") {
    if (st.pendingAccent) {
      st.pendingAccent = null;
    } else if (st.buffer) {
      st.buffer = [...st.buffer].slice(0, -1).join("");
    } else {
      // Step back over the space like a real keyboard: take the mark off
      // the last item first, else reopen the item into the buffer without
      // deleting a character yet — the next ⌫ deletes a character.
      const last = st.items[st.items.length - 1];
      if (last?.punct) delete last.punct;
      else if (last) {
        st.items.pop();
        st.buffer = last.text;
      }
    }
    return { state: st, effects };
  }
  if (key === "Enter") {
    st.pendingAccent = null;
    commit();
    effects.push({ type: "speak" });
    return { state: st, effects };
  }
  if (key === " ") {
    st.pendingAccent = null;
    commit();
    return { state: st, effects };
  }
  if (typeof key !== "string" || [...key].length !== 1) return { state: st, effects };

  // Dead key (es ´): tap to latch, tap again to cancel — two taps in a
  // fixed order, never a long-press.
  if (entry?.dead && key === entry.dead) {
    st.pendingAccent = st.pendingAccent === key ? null : key;
    return { state: st, effects };
  }
  if (st.pendingAccent) {
    // Any other key clears the pending accent and then acts normally;
    // a vowel takes its accented form.
    const accented = DEAD_ACCENTS[st.pendingAccent]?.[key.toLowerCase()];
    st.pendingAccent = null;
    if (accented) {
      st.buffer += key === key.toLowerCase() ? accented : accented.toUpperCase();
      return { state: st, effects };
    }
  }
  if (isWordChar(key, entry)) {
    st.buffer += key;
  } else if (SENTENCE_PUNCT.has(key)) {
    // Commit the buffer, then the mark belongs to the last item — display
    // only, one mark per item, never spoken as a word.
    commit();
    const last = st.items[st.items.length - 1];
    if (last) last.punct = key;
  } else if (OPEN_PUNCT.has(key)) {
    // Opening marks attach to the NEXT committed item.
    commit();
    st.lead = key;
  }
  return { state: st, effects };
}

/**
 * Display-only capitalization for the sentence bar. Stored item.text and
 * spoken text are unchanged — this computes what the bar shows.
 *
 * All locales: first letter of the sentence, and first letter after an
 * item whose punct is `. ? !`. A leading ¿/¡ is skipped (it hangs on the
 * item as `lead`, ahead of the letter). en: standalone i / i'm / i'll /
 * i've / i'd → I…. fr: narrow no-break space before ? !.
 *
 * @returns {string[]} one display string per item; join with " ".
 */
export function displaySentence(items, locale) {
  const lang = String(locale ?? "").split("-")[0];
  let capNext = true;
  return items.map((item) => {
    let body = item.text;
    if (lang === "en" && /^i(?:'m|'ll|'ve|'d)?$/.test(body)) body = `I${body.slice(1)}`;
    if (capNext) body = body.replace(/\p{L}/u, (c) => c.toUpperCase());
    capNext = SENTENCE_END.has(item.punct);
    let tail = item.punct ?? "";
    if (lang === "fr" && (item.punct === "?" || item.punct === "!")) {
      tail = `${NNBSP}${item.punct}`;
    }
    return `${item.lead ?? ""}${body}${tail}`;
  });
}
