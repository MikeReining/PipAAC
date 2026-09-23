/**
 * Board runtime: renders grid60 from the on-device SQLite, sentence bar,
 * groups, and the name+photo add flow. Catalog senses speak via bundled
 * clips (schema §7); personal entities use device TTS.
 */
import { bootDb, savePhoto, loadPhotoURL } from "./db.js";
import {
  closeSentence,
  detachEvent,
  fillChosen,
  keyboardContinuations,
  logImpression,
  logSelection,
  openSentence,
  STRIP_CAP,
  stripScored,
} from "./shared/funnel.mjs";
import { applyKey, displaySentence, keyMap, resolveKeymap } from "./shared/keyboard.mjs";
import { PARTNER_SENSES } from "./shared/keymaps.mjs";
import { buildIndex, suggest } from "./shared/spelling.mjs";
import { normalizeV1 } from "./shared/normalize.mjs";
import { resolveProfile } from "./shared/profile.mjs";
import {
  libraryAdded,
  libraryAll,
  libraryHomes,
  librarySearch,
  librarySuggested,
} from "./shared/library.mjs";
import {
  catalogMatches,
  createEntity,
  entityMatches,
  createGroup,
  deleteGroup,
  entityGroups,
  groupDisplayName,
  groupIndex,
  groupPage,
  moveGroup,
  moveItem,
  pageCount,
  placeItem,
  removeItem,
  removeItemUndoable,
  renameEntity,
  restoreEntity,
  retireEntity,
  senseGroups,
  setEntityPhoto,
  setSetting,
  swapGroups,
  swapItems,
} from "./shared/groups.mjs";
import { setDeviceId } from "./shared/ops.mjs";
import {
  exportDhPublic,
  exportPublicKey,
  getBoardKey,
  getDeviceIdentity,
  newBoardKey,
  openKeyStore,
  putBoardKey,
  unwrapBoardKey,
  wrapBoardKey,
} from "./shared/sync_crypto.mjs";
import { pairClient, relayClient } from "./shared/sync_client.mjs";
import { initSync, setSyncConfig, syncConfig, syncUploadBlob } from "./shared/sync.mjs";
import qrcode from "../vendor/qrcode.mjs";

const $ = (id) => document.getElementById(id);
const ALL = (db, sql, p = []) => db.all(sql, p);
const RUN = (db, sql, p = []) => db.prepare(sql).run(...p);

const { db, catalog } = await bootDb();
// Device identity for the op log (sync § 4): the signing key's
// fingerprint, resolved from the platform keystore. Until it lands the
// log keeps 'dev_local'; ops written after carry the real device id.
getDeviceIdentity().then(({ deviceId }) => setDeviceId(deviceId))
  .catch((err) => console.warn("sync: device identity unavailable", err));
// If this board is already linked, start the sync loop (§ 5): catch up,
// flush pending ops, listen for the relay's fan-out.
/** Synced edits land in the DB via drainOps — repaint whatever's on
 *  screen. Debounced: a drain batch is one repaint, not one per op. */
let syncRepaintTimer = null;
function onSyncApplied() {
  clearTimeout(syncRepaintTimer);
  syncRepaintTimer = setTimeout(() => {
    entityPhoto.clear(); // photo_key may have changed
    renderGrid();
    renderStrip();
    rerenderView();
  }, 150);
}

initSync(db, location.origin, onSyncApplied)
  .catch((err) => console.warn("sync unavailable", err));
// Profile locale and voice resolve once at boot (schema §7.1) and bind
// into every label query and speech call — never a literal, never
// another locale's voice.
const { locale, voiceId } = resolveProfile(db);
document.documentElement.lang = locale;
const sentence = []; // [{kind, id, text}]

/* Sentence tracking (schema §6.2c): one `sentence` row per bar the
 * child builds. Speak closes it 'spoken', Clear closes it 'cleared';
 * the bar may keep its words after Speak, but the next pick opens a
 * new sentence — pairs never cross a Speak or Clear. */
let sentenceId = null;
let sentencePicks = 0; // member events so far — the next pick's position
const ensureSentence = () => (sentenceId ??= openSentence(db));
/* Strip impressions (§ 5.7): renderStrip logs what the strip offered at
 * the next pick's position — one row per distinct offer, deduped by
 * (sentence, position, shown). The next logged pick fills chosen_*. */
let lastImpressionKey = null;
function maybeImpression(candidates, shown) {
  if (sentenceId === null) return;
  const shownKeys = shown.map((c) => `${c.kind}:${c.id}`);
  const key = `${sentenceId}:${sentencePicks}:${shownKeys.join()}`;
  if (key === lastImpressionKey) return;
  lastImpressionKey = key;
  logImpression(db, {
    sentenceId, position: sentencePicks,
    candidates: candidates.map((c) => ({ kind: c.kind, id: c.id, x: c.x ?? {} })),
    shown: shownKeys,
  });
}
let addTarget = null;  // board_group id the add form files into
let addCell = null;    // {page, slot_index} when + came from tapping an empty slot
let view = "board";    // 'board' | 'groupIndex' | 'group' — groups are a board mode, not a modal
let groupKey = null;   // board_group id of the open group page
let groupPageNo = 0;   // current page of the open group
let editing = false; // caregiver Edit mode — same gesture on index and pages

const SILENT_SLOT_MS = 400;
const audio = new Audio();

/** Resolve the ready clip for a sense under the profile voice (§7.2).
 *  No clip under that voice → silence, never another locale's clip. */
function clipKeyFor(senseId) {
  const row = ALL(
    db,
    `SELECT c.key FROM clip c
     JOIN label l ON l.utterance_id = c.utterance_id
     WHERE l.sense_id = ? AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = ?
       AND c.voice_id = ? AND c.status = 'ready'`,
    [senseId, locale, voiceId],
  )[0];
  return row?.key ?? null;
}

function speak(text) {
  // device_tts lane — used for personal entities (§7.3). The utterance
  // carries the profile locale so names and typed words are spoken in
  // the profile's language, not the device's.
  const u = new SpeechSynthesisUtterance(text);
  u.lang = locale;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

function playClip(key) {
  return new Promise((resolve) => {
    audio.src = `/${key}`;
    audio.onended = resolve;
    audio.onerror = resolve;
    audio.play().catch(resolve);
  });
}

/** Speak one tapped item: bundled clip for senses, device TTS for entities. */
async function speakItem(item) {
  if (item.kind === "sense") {
    const key = clipKeyFor(item.id);
    if (key) return playClip(key);
    return new Promise((r) => setTimeout(r, SILENT_SLOT_MS)); // §7 silent slot
  }
  speak(item.text);
}

/** Sentence bar: one slot per item in order; misses hold 400 ms (§7.4).
 *  Speaking ends the logged sentence — the bar keeps its words, but the
 *  next pick opens a new sentence row. */
async function speakSentence() {
  for (const item of sentence) await speakItem(item);
  if (sentenceId !== null) {
    closeSentence(db, sentenceId, Date.now(), "spoken");
    sentenceId = null;
    sentencePicks = 0;
    lastImpressionKey = null;
  }
}

/** Cache: sense id → { role, art } — the label-strip color and the
 *  approved symbol key (null while no art is shipped). */
const senseMeta = new Map();
function metaFor(senseId) {
  if (!senseMeta.has(senseId)) {
    senseMeta.set(
      senseId,
      ALL(
        db,
        `SELECT s.fitzgerald_role AS role,
           (SELECT i.key FROM image i WHERE i.id = s.default_image_id AND i.status = 'approved') AS art
         FROM sense s WHERE s.id = ?`,
        [senseId],
      )[0] ?? { role: null, art: null },
    );
  }
  return senseMeta.get(senseId);
}

/** Cache: entity id → photo_key (entities are few; the row rarely changes). */
const entityPhoto = new Map();
function photoFor(entityId) {
  if (!entityPhoto.has(entityId)) {
    entityPhoto.set(
      entityId,
      ALL(db, "SELECT photo_key FROM personal_entity WHERE id = ?", [entityId])[0]
        ?.photo_key ?? null,
    );
  }
  return entityPhoto.get(entityId);
}

function renderBar() {
  const bar = $("bar");
  bar.innerHTML = "";
  // Display-only: capitalization and ¿¡/?! marks live on the items as
  // lead/punct; item.text and spoken text are unchanged (slice 2 rule 7).
  // Each item renders as a miniature word tile — role border and a
  // role-tinted label strip, art underneath (Design_System § Tiles).
  const texts = displaySentence(sentence, locale);
  sentence.forEach((item, i) => {
    const role =
      item.kind === "entity"
        ? "Yellow"
        : item.kind === "sense"
          ? metaFor(item.id).role
          : null;
    const chip = document.createElement("span");
    chip.className = `chip r-${role ?? "None"}`;
    const lb = document.createElement("span");
    lb.className = "clabel";
    lb.textContent = texts[i];
    const ar = document.createElement("span");
    ar.className = "cart";
    chip.append(lb, ar);
    if (item.kind === "sense") {
      const art = metaFor(item.id).art;
      if (art) {
        const img = document.createElement("img");
        img.src = `/${art}`;
        img.alt = "";
        ar.appendChild(img);
      }
    } else if (item.kind === "entity") {
      loadPhotoURL(photoFor(item.id)).then((url) => {
        if (!url) return;
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        ar.appendChild(img);
        chip.classList.add("photo");
      });
    }
    bar.appendChild(chip);
  });
  if (kbText) {
    const p = document.createElement("span");
    p.className = "partial";
    p.textContent = kbText + "▌";
    bar.appendChild(p);
  }
  if (!sentence.length && !kbText) {
    // The ink bird (never the gold one near the grid) holds the empty bar.
    const img = document.createElement("img");
    img.className = "pip-ink";
    img.src = "/brand/pip-mark-ink.svg";
    img.alt = "";
    const note = document.createElement("span");
    note.className = "empty-note";
    note.textContent = "Tap a word to start.";
    bar.append(img, note);
  }
  $("clear").disabled = !sentence.length && !kbText;
  $("speak").disabled = !sentence.length;
  fitLabels(bar);
}
$("bar").addEventListener("click", () => {
  if (sentence.length) speakSentence();
});
$("clear").addEventListener("click", () => {
  if (sentenceId !== null) {
    closeSentence(db, sentenceId, Date.now(), "cleared");
    sentenceId = null;
    sentencePicks = 0;
    lastImpressionKey = null;
  }
  sentence.length = 0;
  kbText = "";
  renderBar();
  renderStrip();
});
$("speak").addEventListener("click", () => {
  if (sentence.length) speakSentence();
});

const senseById = (senseId) =>
  ALL(
    db,
    `SELECT s.id, l.text AS label, s.fitzgerald_role FROM sense s
     JOIN label l ON l.sense_id = s.id
       AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = ?
     WHERE s.id = ?`,
    [locale, senseId],
  )[0];

// Idle-strip starters referenced by sense id — never by English text.
const HELLO_SENSE_ID = "sns_0583"; // hello
const HELP_SENSE_ID = "sns_0025";  // help

/** The four resting cards shown when the sentence bar is empty. */
async function idleStarters() {
  const cards = [];
  const hello = senseById(HELLO_SENSE_ID);
  if (hello) {
    cards.push({ id: hello.id, label: hello.label, glyph: "👋", role: hello.fitzgerald_role,
      onTap: () => tap(hello.label, "sense", hello.id, { hint: true, source: "strip" }) });
  }
  const foodRow = ALL(db, "SELECT id, name FROM board_group WHERE id = 'grp_food'")[0];
  if (foodRow) {
    cards.push({ label: groupDisplayName(db, foodRow, locale), glyph: "🥞", role: "Pink",
      onTap: () => openGroup("grp_food") });
  }
  const top = ALL(
    db,
    `SELECT e.id, e.spoken_name, e.photo_key FROM personal_entity e
     LEFT JOIN learner_event_log l ON l.item_kind = 'entity' AND l.item_id = e.id
     WHERE e.status = 'active'
     GROUP BY e.id ORDER BY COUNT(l.id) DESC, MAX(l.selected_at) DESC, e.rowid LIMIT 1`,
  )[0];
  if (top) cards.push({ entity: top });
  const help = senseById(HELP_SENSE_ID);
  if (help) {
    cards.push({ id: help.id, label: help.label, glyph: "🆘", role: help.fitzgerald_role,
      onTap: () => tap(help.label, "sense", help.id, { hint: true, source: "strip" }) });
  }
  return cards.slice(0, 4);
}

/** A strip card is an ordinary word tile turned sideways: art on a white
 *  square at left, the label on the role fill at right (Design_System §
 *  Strip). Senses show their approved symbol when one ships, else a
 *  glyph or the label's initial. */
async function predCard(c) {
  const el = document.createElement("button");
  el.className = `pred${c.entity ? " r-Yellow" : c.role ? ` r-${c.role}` : ""}`;
  const part = document.createElement("span");
  part.className = "part";
  const lb = document.createElement("span");
  lb.className = "plabel";
  if (c.entity) {
    const url = await loadPhotoURL(c.entity.photo_key);
    if (url) {
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      part.appendChild(img);
      el.classList.add("photo");
    } else {
      part.textContent = c.entity.spoken_name[0].toUpperCase();
    }
    lb.textContent = c.entity.spoken_name;
  } else {
    const art = c.id ? metaFor(c.id).art : null;
    if (art) {
      const img = document.createElement("img");
      img.src = `/${art}`;
      img.alt = "";
      part.appendChild(img);
    } else {
      part.textContent = c.glyph ?? c.label[0].toUpperCase();
    }
    lb.textContent = c.label;
  }
  el.append(part, lb);
  const onTap =
    c.onTap ??
    (c.entity ? () => tap(c.entity.spoken_name, "entity", c.entity.id, { hint: true, source: "strip" }) : () => {});
  el.addEventListener("click", onTap);
  return el;
}

/** Ghost card: a dashed placeholder — the tray never collapses. */
function ghostCard() {
  const el = document.createElement("div");
  el.className = "pred ghost";
  el.setAttribute("aria-hidden", "true");
  return el;
}

async function renderStrip() {
  const tray = $("tray");
  tray.querySelectorAll(".pred").forEach((n) => n.remove());
  let cards;
  if (kbText) {
    // mid-word: the strip switches from continuations to completions
    cards = kbCompletions();
  } else if (sentence.length === 0) {
    cards = await idleStarters();
  } else {
    // Keyboard open with an empty buffer: next-word continuations, core
    // words included — the grid is hidden so the no-core rule doesn't
    // apply (slice 7, Dual_Engine §5.2).
    const sents = sentence.map((s) => ({ kind: s.kind, id: s.id }));
    const scored = kbOpen ? null : stripScored(db, sents, Date.now(), locale);
    const items = kbOpen
      ? keyboardContinuations(db, sents, locale, Date.now())
      : scored.slice(0, STRIP_CAP).map((r) => ({ kind: r.kind, id: r.id }));
    maybeImpression(scored ?? items.map((c) => ({ kind: c.kind, id: c.id, x: {} })), items);
    cards = [];
    for (const c of items) {
      if (c.kind === "entity") {
        cards.push({
          entity: ALL(db, "SELECT * FROM personal_entity WHERE id = ?", [c.id])[0],
        });
      } else {
        const w = ALL(
          db,
          `SELECT s.id, l.text AS label, s.fitzgerald_role FROM sense s
           JOIN label l ON l.sense_id = s.id
             AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = ?
           WHERE s.id = ?`,
          [locale, c.id],
        )[0];
        cards.push({ id: w.id, label: w.label, role: w.fitzgerald_role,
          onTap: () => tap(w.label, "sense", w.id, { hint: true, source: "strip" }) });
      }
    }
  }
  for (let i = 0; i < 4; i++) {
    tray.appendChild(cards[i] ? await predCard(cards[i]) : ghostCard());
  }
  fitLabels(tray);
  applyLikely();
}

function tap(text, kind = "sense", id = null, { hint = false, source = "grid" } = {}) {
  const item = { kind, id, text };
  sentence.push(item);
  renderBar();
  speakItem(item);
  if (id) {
    ensureSentence();
    fillChosen(db, sentenceId, { kind, id, source });
    logSelection(db, kind, id, Date.now(), {
      sentenceId, position: sentencePicks++, source,
    });
  }
  if (hint && id) showGroupHint(kind, id);
  renderStrip();
}

/* --- "Show me where": when a non-core word arrives from the strip or
   the keyboard, halo the Groups anchor and caption the path (Groups ›
   Food) for 1.5 s. Out-of-flow and pointer-events:none — no sound, no
   blocking, no layout shift. A new tap cancels it. --- */
let hintTimer = null;

function clearGroupHint() {
  clearTimeout(hintTimer);
  hintTimer = null;
  $("anchor-groups").classList.remove("halo");
  $("pathhint").hidden = true;
}

function showGroupHint(kind, id) {
  let name = null;
  if (kind === "sense") {
    // core words need no backup route — they are always on screen
    if (ALL(db, "SELECT 1 AS x FROM core_cell WHERE layout = 'grid60' AND sense_id = ?", [id]).length) return;
    const row = ALL(
      db,
      `SELECT g.id, g.name FROM group_cell gc JOIN board_group g ON g.id = gc.group_id
       WHERE gc.item_kind = 'sense' AND gc.item_id = ? AND g.kind = 'builtin'
       ORDER BY g.index_slot`,
      [id],
    )[0];
    if (row) name = groupDisplayName(db, row, locale);
  } else if (kind === "entity") {
    const row = ALL(
      db,
      `SELECT g.id, g.name FROM group_cell gc JOIN board_group g ON g.id = gc.group_id
       WHERE gc.item_kind = 'entity' AND gc.item_id = ?
       ORDER BY g.index_slot`,
      [id],
    )[0];
    if (row) name = groupDisplayName(db, row, locale);
  }
  if (!name) return;
  const anchor = $("anchor-groups");
  const r = anchor.getBoundingClientRect();
  const hint = $("pathhint");
  hint.textContent = `Groups › ${name}`;
  hint.style.left = `${r.left + r.width / 2}px`;
  hint.style.top = `${r.bottom + 4}px`;
  hint.hidden = false;
  anchor.classList.add("halo");
  clearTimeout(hintTimer);
  hintTimer = setTimeout(clearGroupHint, 1500);
}
document.addEventListener("pointerdown", clearGroupHint, { capture: true });

/** One word tile (Design_System § Tiles): role-tinted label strip on
 *  top, art on white below. Photos fill the art area edge to edge. */
function wordTile({ label, role, art = null, photoURL = null }) {
  const el = document.createElement("button");
  el.className = `cell r-${role ?? "None"}`;
  const lb = document.createElement("span");
  lb.className = "tlabel";
  lb.textContent = label;
  const ar = document.createElement("span");
  ar.className = "tart";
  if (art || photoURL) {
    const img = document.createElement("img");
    img.src = photoURL ?? `/${art}`;
    img.alt = "";
    ar.appendChild(img);
    if (photoURL) el.classList.add("photo");
  }
  el.append(lb, ar);
  return el;
}

/** Shrink-to-fit labels: Andika Bold on one line, stepping down until the
 *  text fits its strip — a word never breaks inside itself; multi-word
 *  labels may wrap between words. */
function fitLabels(root) {
  document.fonts.ready.then(() => {
    for (const lb of root.querySelectorAll(".tlabel, .plabel, .clabel")) {
      const maxW = lb.clientWidth;
      const maxH = lb.clientHeight;
      if (!maxW || !maxH) continue;
      let px = Math.floor(maxH * 0.8);
      lb.style.fontSize = `${px}px`;
      for (let guard = 14; guard > 0 && px > 8; guard--) {
        if (lb.scrollWidth <= maxW && lb.scrollHeight <= maxH) break;
        px = Math.max(8, Math.floor(px * 0.86));
        lb.style.fontSize = `${px}px`;
      }
    }
  });
}

/** sense_id → its grid element, for the likely-next halo pass. */
const cellEls = new Map();

function renderGrid() {
  const cells = ALL(
    db,
    `SELECT cc.slot_index, cc.sense_id, l.text AS label, s.fitzgerald_role
     FROM core_cell cc
     JOIN sense s ON s.id = cc.sense_id
     JOIN label l ON l.sense_id = cc.sense_id
       AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = ?
     WHERE cc.layout = 'grid60'
     ORDER BY cc.slot_index`,
    [locale],
  );
  const bySlot = new Map(cells.map((c) => [c.slot_index, c]));
  const grid = $("grid");
  grid.style.gridTemplateColumns = "repeat(10, 1fr)";
  grid.style.gridTemplateRows = "repeat(6, 1fr)";
  grid.innerHTML = "";
  cellEls.clear();
  // Every slot renders: a missing cell is a dashed placeholder, never a
  // collapsed gap — the coordinate map is the motor plan.
  for (let slot = 0; slot < 60; slot++) {
    const c = bySlot.get(slot);
    if (!c) {
      const empty = document.createElement("div");
      empty.className = "cell empty";
      empty.setAttribute("aria-hidden", "true");
      grid.appendChild(empty);
      continue;
    }
    const el = wordTile({ label: c.label, role: c.fitzgerald_role, art: metaFor(c.sense_id).art });
    el.addEventListener("click", () => tap(c.label, "sense", c.sense_id));
    cellEls.set(c.sense_id, el);
    grid.appendChild(el);
  }
  fitLabels(grid);
}

/** "Highlight likely next words" (Parent Corner, default OFF): up to
 *  three core cells the ranker invites next get a thicker inner border
 *  in their own role color. Grid only — never while editing, in a
 *  group, or with the keyboard open (the grid isn't visible). */
let highlightNext = false;
function applyLikely() {
  for (const el of cellEls.values()) el.classList.remove("likely");
  if (!highlightNext || editing || view !== "board" || kbOpen || !sentence.length) return;
  const sents = sentence.map((s) => ({ kind: s.kind, id: s.id }));
  let marked = 0;
  for (const c of keyboardContinuations(db, sents, locale, Date.now())) {
    if (c.kind !== "sense") continue;
    const el = cellEls.get(c.id);
    if (!el) continue;
    el.classList.add("likely");
    if (++marked === 3) break;
  }
}

/* --- overlays --- */
const open = (id) => $(id).classList.add("open");
const close = (id) => $(id).classList.remove("open");
document.querySelectorAll("[data-close]").forEach((b) =>
  b.addEventListener("click", () => b.closest(".overlay").classList.remove("open")),
);
// Backdrop tap and Escape dismiss any open overlay — a modal that can't be
// dismissed strands the learner.
document.querySelectorAll(".overlay").forEach((o) =>
  o.addEventListener("click", (e) => {
    if (e.target === o) o.classList.remove("open");
  }),
);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const anyOverlay = document.querySelector(".overlay.open");
    if (anyOverlay) {
      document.querySelectorAll(".overlay.open").forEach((o) => o.classList.remove("open"));
      return;
    }
    if (editing) {
      setEditing(false);
      rerenderView();
      return;
    }
    if (view === "group") return openGroupIndex();
    if (view === "groupIndex") return setView("board");
    if (kbOpen) closeKb();
    return;
  }
  // Hardware keys work in any mode: a letter or digit opens the keyboard
  // and types itself. Never inside a form field, an open overlay, or a
  // meta/ctrl/alt chord.
  const t = e.target;
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
  if (document.querySelector(".overlay.open")) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const km = keyMap(locale, kbOrder);
  const devField = $("kb-device");
  if (kbOpen && devField) {
    // Device mode with the field unfocused (e.g. after a partner tap):
    // route the keystroke into the field model — a focused field handles
    // its own keys via `input` (filtered above).
    if (e.key.length === 1 || e.key === "Backspace" || e.key === "Enter") {
      e.preventDefault();
      deviceFeed(e.key);
    }
    return;
  }
  if (e.key === "Backspace" || e.key === " " || e.key === "Enter") {
    if (!kbOpen) return;
    e.preventDefault();
    kbPress(e.key);
    return;
  }
  if (e.key === "Dead") {
    // a real QWERTZ/AZERTY/Spanish keyboard's dead key arrives as "Dead"
    const dead = resolveKeymap(locale)?.dead;
    if (dead) {
      if (!kbOpen) openKb();
      kbPress(dead);
    }
    return;
  }
  if (e.key.length !== 1) return;
  const ch = e.key.toLowerCase();
  const isDigit = ch >= "0" && ch <= "9";
  const inMap = km ? km.some((k) => (k.kind === "char" || k.kind === "dead") && k.value === ch) : /[\p{L}\p{N}]/u.test(ch);
  if (!inMap && !isDigit) return;
  if (!kbOpen) openKb();
  if ($("kb-device")) deviceFeed(e.key);
  else kbPress(e.key);
});
$("corner").addEventListener("click", () => {
  if (editing) {
    setEditing(false);
    rerenderView();
    return;
  }
  open("menu");
});
$("edit-groups").addEventListener("click", () => {
  close("menu");
  setEditing(true);
  openGroupIndex();
});
$("add-mywords").addEventListener("click", () => {
  close("menu");
  openAddForm("grp_my_words");
});

/* Keyboard settings: two segmented controls in the Parent corner. Each
 * writes its column on tap — no Save button. Letter order is disabled
 * while Device keyboard is selected, and the first segment shows the
 * locale's real layout name (QWERTY/QWERTZ/AZERTY), never "standard".
 * `standard` is the locale's national layout, so a stored value stays
 * correct across a locale change. */
const kbProfile = ALL(
  db,
  "SELECT keyboard_mode, keyboard_order, highlight_next FROM learner_profile WHERE id = 'prf_local'",
)[0] ?? {};
let kbMode = kbProfile.keyboard_mode ?? "pip";
let kbOrder = kbProfile.keyboard_order ?? "standard";
highlightNext = (kbProfile.highlight_next ?? 0) === 1;

function syncKbSettings() {
  $("kb-order-standard").textContent = resolveKeymap(locale)?.standardName ?? "Standard";
  for (const b of $("kb-mode").querySelectorAll("button")) {
    b.classList.toggle("on", b.dataset.v === kbMode);
  }
  for (const b of $("kb-order").querySelectorAll("button")) {
    b.classList.toggle("on", b.dataset.v === kbOrder);
  }
  $("kb-order").classList.toggle("disabled", kbMode === "device");
  for (const b of $("hl-next").querySelectorAll("button")) {
    b.classList.toggle("on", b.dataset.v === (highlightNext ? "1" : "0"));
  }
}
syncKbSettings();

/** Rebuild the keyboard surface after a settings or locale change. */
function rebuildKb() {
  kbBuilt = false;
  if (kbOpen) {
    buildKb();
    fitKbCaps();
  }
}

$("kb-mode").addEventListener("click", (e) => {
  const v = e.target.closest("button")?.dataset.v;
  if (!v || v === kbMode) return;
  kbMode = v;
  setSetting(db, "keyboard_mode", v);
  rebuildKb();
  syncKbSettings();
});
$("kb-order").addEventListener("click", (e) => {
  const v = e.target.closest("button")?.dataset.v;
  if (!v || v === kbOrder) return;
  kbOrder = v;
  setSetting(db, "keyboard_order", v);
  rebuildKb();
  syncKbSettings();
});
$("hl-next").addEventListener("click", (e) => {
  const v = e.target.closest("button")?.dataset.v;
  if (v === undefined) return;
  highlightNext = v === "1";
  setSetting(db, "highlight_next", highlightNext ? 1 : 0);
  syncKbSettings();
  applyLikely();
});

/* --- permanent utility anchors --- */
$("anchor-kb").addEventListener("click", () => {
  if (kbOpen) return closeKb(); // the same anchor that opened it closes it
  setView("board");
  openKb();
  // iOS shows the system keyboard only for a focus inside the user
  // gesture — synchronous, no await before it.
  $("kb-device")?.focus();
});
$("anchor-groups").addEventListener("click", openGroupIndex);

/* --- keyboard: a board mode, not a modal. The locale's key map renders
   into the grid in place (same 10×6 geometry). Typing feeds prefix
   completions into the strip; space commits the word (and speaks it);
   the ⌨ anchor toggles — there is no Done key. */
let kbOpen = false;
let kbText = ""; // the buffer — the word in progress
let kbBuilt = false;
let kbPendingAccent = null; // dead key latched, waiting for its vowel
let kbLead = null; // opening mark (¿ ¡) waiting for the next committed item
let kbDeadEl = null; // the dead key's element, for the latched style
let kbIndex = null; // completion index — built once when the keyboard opens,
// rebuilt after an entity add or a locale change (Profile_Presentation_Modes §4.4)

/** Grid-area view swap: board | groupIndex | group render into
 *  #groupgrid, keyboard into #kb — same physical space, strip and bar
 *  never move. */
function setView(v) {
  view = v;
  if (v !== "board" && kbOpen) closeKb();
  document.body.classList.toggle("groups", v !== "board");
  if (v === "groupIndex") renderGroupIndex();
  else if (v === "group") renderGroupPage();
  applyLikely();
}

function openKb() {
  if (!kbBuilt) buildKb();
  kbIndex ??= buildKbIndex();
  kbOpen = true;
  document.body.classList.add("kb");
  renderKbAnchor();
  fitKbCaps();
  renderBar();
  renderStrip();
}
function closeKb() {
  kbOpen = false;
  $("kb-device")?.blur();
  document.body.classList.remove("kb");
  renderKbAnchor();
  applyLikely();
}

/** While the keyboard is open the anchor that opened it becomes the way
 *  back — same element, same position, only its text changes. */
function renderKbAnchor() {
  const a = $("anchor-kb");
  a.querySelector(".glyph").textContent = kbOpen ? "▦" : "⌨";
  a.querySelector("span:last-child").textContent = kbOpen ? "Board" : "Keyboard";
  a.title = kbOpen ? "Board" : "Keyboard";
}

function buildKb() {
  kbBuilt = true;
  const kb = $("kb");
  kb.innerHTML = "";
  const keys = keyMap(locale, kbOrder);
  if (kbMode === "device" || !keys) {
    if (!keys) {
      // A locale with no key map gets Device keyboard mode — never
      // English keys (Profile_Presentation_Modes §4.1).
      console.warn(`keyboard: no key map for locale "${locale}" — device keyboard`);
    }
    buildKbDevice(kb);
    return;
  }
  for (const k of keys) {
    const el = kbCell(k);
    el.style.gridColumn = `${(k.slot % 10) + 1} / span ${k.span}`;
    el.style.gridRow = `${Math.floor(k.slot / 10) + 1}`;
    kb.appendChild(el);
  }
}

/* Letter size is per-key, not per-row: a narrow "i" on a portrait key can
 * stand taller than a wide "w" on the same key. measureText gives each
 * cap's em width once Andika is ready; the cap then takes the largest
 * size that fits ~78% of the key's height AND ~80% of its width. */
const kbCapCtx = document.createElement("canvas").getContext("2d");

function fitKbCaps() {
  document.fonts.ready.then(() => {
    for (const key of $("kb").querySelectorAll(".kb-key:not(.kb-util)")) {
      const cap = key.querySelector(".kc");
      const r = key.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      kbCapCtx.font = '700 100px "Andika"';
      const emWidth = kbCapCtx.measureText(cap.textContent).width / 100 || 0.5;
      cap.style.fontSize = `${Math.min(r.height * 0.78, (r.width * 0.8) / emWidth)}px`;
    }
  });
}
window.addEventListener("resize", () => {
  if (kbOpen) fitKbCaps();
  fitLabels($("grid"));
  fitLabels($("tray"));
  fitLabels($("bar"));
  if (view !== "board") fitLabels($("groupgrid"));
});

/** One key of the Pip-keys map. Char keys are white with a big cap;
 *  space, ⌫, and the dead key wear the utility colors. Partner cells are
 *  built by partnerCell. */
function kbCell(k) {
  if (k.kind === "partner") return partnerCell(k.value);
  const el = document.createElement("button");
  const cap = document.createElement("span");
  cap.className = "kc";
  el.appendChild(cap);
  if (k.kind === "char") {
    el.className = "kb-key";
    cap.textContent = k.value;
  } else if (k.kind === "dead") {
    el.className = "kb-key kb-util";
    cap.textContent = k.value;
    kbDeadEl = el;
  } else if (k.kind === "space") {
    el.className = "kb-key kb-util kb-spacekey";
    cap.textContent = "␣";
    const sub = document.createElement("span");
    sub.className = "sub";
    sub.textContent = "space";
    el.appendChild(sub);
  } else {
    // backspace
    el.className = "kb-key kb-util";
    cap.textContent = "⌫";
  }
  el.addEventListener("click", () => kbPress(k.value));
  return el;
}

/* Partner row (slice 4): the speller talks ABOUT the typing — yes/no and
 * the spelling-negotiation phrases speak immediately and never touch the
 * sentence or the buffer. A locale with no label for a partner sense
 * renders the key disabled, never text from another language. */
function partnerCell(senseId) {
  const s = senseById(senseId);
  const el = document.createElement("button");
  if (!s) {
    el.className = "gcell empty";
    el.disabled = true;
    return el;
  }
  el.className = `kb-key kb-partner r-${s.fitzgerald_role}`;
  const cap = document.createElement("span");
  cap.className = "kc";
  cap.textContent = s.label;
  el.appendChild(cap);
  // Don't let the tap steal focus — in device mode that would dismiss the
  // system keyboard the speller is typing on.
  el.addEventListener("mousedown", (e) => e.preventDefault());
  el.addEventListener("click", async () => {
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 350);
    // Partner talk about the typing — never a sentence member, but it
    // did happen while a sentence may have been open.
    logSelection(db, "sense", s.id, Date.now(), {
      sentenceId, position: null, source: "keyboard",
    });
    // Clip under the profile voice, else device TTS in the profile locale —
    // partner keys never take the 400 ms silent slot.
    const key = clipKeyFor(s.id);
    if (key) await playClip(key);
    else speak(s.label);
  });
  return el;
}

/** One keystroke, from screen or hardware: the pure reducer updates
 *  buffer/marks/items, then this does the side effects — resolve each
 *  committed word, speak it, log it, re-render. */
function kbPress(key) {
  const prevLast = sentence[sentence.length - 1];
  const res = applyKey(
    { buffer: kbText, pendingAccent: kbPendingAccent, lead: kbLead, items: sentence },
    key,
    locale,
  );
  kbText = res.state.buffer;
  kbPendingAccent = res.state.pendingAccent;
  kbLead = res.state.lead;
  // ⌫ pops the last bar item into the buffer — if it was a logged pick,
  // detach its event and shift the rest of the sentence down (§6.2c).
  if (key === "Backspace" && res.state.items.length < sentence.length &&
      prevLast?.id && sentenceId !== null) {
    detachEvent(db, sentenceId, sentencePicks - 1);
    sentencePicks--;
  }
  sentence.splice(0, sentence.length, ...res.state.items);
  for (const e of res.effects) {
    if (e.type === "commit") commitKbItem(e.index);
    else if (e.type === "speak") speakSentence();
  }
  if (kbDeadEl) kbDeadEl.classList.toggle("latched", kbPendingAccent !== null);
  renderBar();
  renderStrip();
}

/**
 * Commit resolution (slice 2 rule 4), on the normalized buffer in the
 * profile locale: an approved label (lemma or alias) → an exact entity
 * spoken_name → the typed string through device TTS. An alias hit keeps
 * the typed text in the bar, so `3` stays `3` while the *three* clip
 * plays. Never replaces what was typed with a guess.
 */
function resolveTyped(text) {
  const norm = normalizeV1(text);
  const hit = ALL(
    db,
    `SELECT s.id, l.text AS label, l.kind
     FROM label l JOIN sense s ON s.id = l.sense_id
     WHERE l.normalized_text = ? AND l.locale = ? AND l.status = 'approved'
     ORDER BY (l.kind = 'lemma') DESC, l.default_for_text DESC`,
    [norm, locale],
  )[0];
  if (hit) return { kind: "sense", id: hit.id, display: hit.kind === "lemma" ? hit.label : text };
  const ent = ALL(db, "SELECT id, spoken_name FROM personal_entity WHERE status = 'active'").find(
    (e) => normalizeV1(e.spoken_name) === norm,
  );
  if (ent) return { kind: "entity", id: ent.id, display: ent.spoken_name };
  return { kind: "typed", id: null, display: text };
}

/** Replace the placeholder item applyKey committed with the resolved
 *  item, then speak/log it — the same side effects as a grid tap. */
function commitKbItem(index) {
  const raw = sentence[index];
  const hit = resolveTyped(raw.text);
  const item = { kind: hit.kind, id: hit.id, text: hit.display };
  if (raw.punct) item.punct = raw.punct;
  if (raw.lead) item.lead = raw.lead;
  sentence[index] = item;
  speakItem(item);
  if (item.id) {
    ensureSentence();
    fillChosen(db, sentenceId, { kind: item.kind, id: item.id, source: "keyboard" });
    logSelection(db, item.kind, item.id, Date.now(), {
      sentenceId, position: sentencePicks++, source: "keyboard",
    });
    showGroupHint(item.kind, item.id);
  }
}

/** Snapshot the catalog's approved labels (lemma + alias) and entities
 *  into the pure matcher index. Freqs are learner_event_log counts
 *  captured at build time — the keystroke path never touches SQL. */
function buildKbIndex() {
  const senses = ALL(
    db,
    `SELECT s.id, l.text AS label, s.fitzgerald_role,
       (SELECT COUNT(*) FROM learner_event_log le
         WHERE le.item_kind = 'sense' AND le.item_id = s.id) AS freq
     FROM label l JOIN sense s ON s.id = l.sense_id
     WHERE l.status = 'approved' AND l.locale = ?`,
    [locale],
  ).map((w) => ({
    kind: "sense",
    id: w.id,
    text: w.label,
    freq: w.freq,
    role: w.fitzgerald_role,
  }));
  const ents = ALL(
    db,
    `SELECT e.*,
       (SELECT COUNT(*) FROM learner_event_log le
         WHERE le.item_kind = 'entity' AND le.item_id = e.id) AS freq
     FROM personal_entity e
     WHERE e.status = 'active'`,
  ).map((e) => ({ kind: "entity", id: e.id, text: e.spoken_name, freq: e.freq, entity: e }));
  return buildIndex([...senses, ...ents], locale);
}

/** Forgiving completions for the strip while a word is in progress. */
function kbCompletions() {
  if (!kbText) return [];
  if (!kbIndex) kbIndex = buildKbIndex();
  return suggest(kbIndex, kbText, 4).map((e) =>
    e.kind === "entity"
      ? {
          entity: e.entity,
          freq: e.freq,
          onTap: () => {
            kbText = "";
            renderBar();
            tap(e.text, "entity", e.id, { hint: true, source: "keyboard" });
          },
        }
      : {
          id: e.id,
          label: e.text,
          role: e.role,
          freq: e.freq,
          onTap: () => {
            kbText = "";
            renderBar();
            tap(e.text, "sense", e.id, { hint: true, source: "keyboard" });
          },
        },
  );
}

/** Device keyboard mode (slice 6): the partner row moves to the top
 *  because the system keyboard covers the bottom of the screen; one
 *  textarea holds the word in progress; rows 3–6 stay empty. `lang` makes
 *  iOS autocorrect and spellcheck use the profile's language. */
function buildKbDevice(kb) {
  PARTNER_SENSES.forEach((id, i) => {
    const el = partnerCell(id);
    el.style.gridColumn = `${i * 2 + 1} / span 2`;
    el.style.gridRow = "1";
    kb.appendChild(el);
  });
  const ta = document.createElement("textarea");
  ta.id = "kb-device";
  ta.lang = locale;
  ta.setAttribute("autocapitalize", "sentences");
  ta.setAttribute("autocorrect", "on");
  ta.setAttribute("spellcheck", "true");
  ta.setAttribute("enterkeyhint", "go");
  ta.rows = 1;
  ta.style.gridColumn = "1 / -1";
  ta.style.gridRow = "2";
  kb.appendChild(ta);
  ta.addEventListener("input", kbDeviceInput);
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      deviceFeed("Enter");
    }
  });
}

/** Whitespace and sentence marks end a token; ¿¡ are leads. */
const KB_DEV_TERM = /[\s.,!?¿¡]/;

/** The field is the buffer. On input: completed tokens and marks run
 *  through applyKey (autocorrect-safe — the field is authoritative, so
 *  the buffer is cleared and the completed text replayed); the field then
 *  holds only what is left. kbText mirrors the field, so strip
 *  completions work unchanged. */
function kbDeviceInput() {
  const ta = $("kb-device");
  const v = ta.value;
  let last = -1;
  for (let i = 0; i < v.length; i++) if (KB_DEV_TERM.test(v[i])) last = i;
  kbPendingAccent = null; // the system keyboard produces accents itself
  if (last < 0) {
    kbText = v;
    renderBar();
    renderStrip();
    return;
  }
  const done = v.slice(0, last + 1);
  const rest = v.slice(last + 1);
  kbText = "";
  for (const ch of done) kbPress(ch);
  ta.value = rest;
  kbText = rest;
  renderBar();
  renderStrip();
}

/** Route a hardware keystroke into the device field when it is not the
 *  event target (the field itself handles its own keys via input). */
function deviceFeed(ch) {
  const ta = $("kb-device");
  if (ch === "Backspace") {
    if (ta.value) {
      ta.value = ta.value.slice(0, -1);
      kbDeviceInput();
    } else {
      kbPress("Backspace"); // empty field: step back over the space
    }
    return;
  }
  if (ch === "Enter") {
    kbPress("Enter"); // commits the buffer and speaks; field mirrors next
    ta.value = "";
    return;
  }
  ta.value += ch;
  kbDeviceInput();
}

/* --- groups: an in-place board mode, not a modal. The group index and
   each group page render into #groupgrid — the same physical space and
   cell size as the core grid. Slot 0 is always "back"; slot 1 is the
   Edit-mode action, rendered only while editing so the child never sees
   adult controls. Group positions persist in board_group.index_slot and
   items in group_cell — the same motor-memory law as core_cell: slots
   only move in Edit mode (drag to move/swap, tap opens the card or the
   group, × removes with Undo). All writes go through shared/groups.mjs. --- */

/** One mode everywhere: entering Edit marks the body (dashed borders)
 *  and turns the corner button into ✓ Done. */
function setEditing(on) {
  editing = on;
  document.body.classList.toggle("editing", on);
  $("corner").textContent = on ? "✓ Done" : "✚";
  $("corner").title = on ? "Done editing" : "Parent corner";
  applyLikely();
}

/** Re-render whatever view is on screen after a mode change or write. */
function rerenderView() {
  if (view === "groupIndex") renderGroupIndex();
  else if (view === "group") renderGroupPage();
  if ($("library").classList.contains("open")) renderLibrary();
}

function navCell(label, onTap) {
  const el = document.createElement("button");
  el.className = "gcell nav";
  el.textContent = label;
  el.addEventListener("click", onTap);
  return el;
}

/** Live pointer-drag for Edit mode: a clone follows the finger; the slot
 *  under the release point decides the landing. `onDrop(slot)` gets the
 *  target's data-slot; `onTap` fires when the press never became a drag. */
function editPointer(el, { onDrop, onTap }) {
  let lastPointer = 0;
  // Keyboard/AT Enter fires click with no pointer events — treat it as a tap.
  el.addEventListener("click", () => {
    if (Date.now() - lastPointer > 400) onTap?.();
  });
  el.addEventListener("pointerdown", (e) => {
    lastPointer = Date.now();
    if (e.button !== 0 || e.target.closest(".x")) return;
    const startX = e.clientX, startY = e.clientY;
    let dragging = false, clone = null, hinted = null;
    const clearHint = () => { hinted?.classList.remove("drop-hint"); hinted = null; };
    const move = (ev) => {
      if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 10) return;
      if (!dragging) {
        dragging = true;
        const r = el.getBoundingClientRect();
        clone = el.cloneNode(true);
        clone.classList.add("drag-clone");
        clone.style.width = `${r.width}px`;
        clone.style.height = `${r.height}px`;
        document.body.appendChild(clone);
        el.classList.add("drag-src");
      }
      clone.style.left = `${ev.clientX - clone.offsetWidth / 2}px`;
      clone.style.top = `${ev.clientY - clone.offsetHeight / 2}px`;
      clearHint();
      const t = document.elementFromPoint(ev.clientX, ev.clientY)
        ?.closest("#groupgrid [data-slot]");
      if (t && t !== el) { hinted = t; t.classList.add("drop-hint"); }
    };
    const finish = (ev, cancelled) => {
      document.removeEventListener("pointermove", move);
      clearHint();
      clone?.remove();
      el.classList.remove("drag-src");
      if (!dragging) { if (!cancelled && onTap) onTap(); return; }
      if (cancelled) return;
      const t = document.elementFromPoint(ev.clientX, ev.clientY)
        ?.closest("#groupgrid [data-slot]");
      if (t && t !== el) onDrop(Number(t.dataset.slot));
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", (ev) => finish(ev, false), { once: true });
    document.addEventListener("pointercancel", (ev) => finish(ev, true), { once: true });
  });
}

function xBadge(onRemove) {
  const x = document.createElement("button");
  x.className = "x";
  x.textContent = "×";
  x.title = "Remove";
  x.addEventListener("click", (e) => { e.stopPropagation(); onRemove(); });
  x.addEventListener("pointerdown", (e) => e.stopPropagation());
  return x;
}

/** One pending undo at a time. */
let toastTimer = null;
function toast(text, undo) {
  const el = $("toast");
  clearTimeout(toastTimer);
  $("toast-text").textContent = text;
  el.hidden = false;
  $("toast-undo").onclick = () => { el.hidden = true; undo(); };
  toastTimer = setTimeout(() => { el.hidden = true; }, 6000);
}

/** "Show on board" marks the cell for a beat after re-render. */
function flashCell(el) {
  if (!el) return;
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 1600);
}

/** One group on the index. `row` is a board_group row; the label and
 *  glyph come from the row — custom groups show their photo, else 🗂️. */
function groupIndexCell(row) {
  const el = document.createElement("button");
  el.className = "gcell";
  el.dataset.slot = row.index_slot;
  el.dataset.group = row.id;
  const g = document.createElement("span");
  g.className = "glyph";
  g.textContent = row.glyph ?? "🗂️";
  if (row.photo_key) {
    loadPhotoURL(row.photo_key).then((url) => {
      if (!url) return;
      const img = document.createElement("img");
      img.src = url;
      g.replaceChildren(img);
    });
  }
  const lb = document.createElement("span");
  lb.className = "glabel";
  lb.textContent = groupDisplayName(db, row, locale);
  el.appendChild(g);
  el.appendChild(lb);
  if (!editing) {
    el.addEventListener("click", () => openGroup(row.id));
    return el;
  }
  // Edit mode: tap opens the group, drag moves/swaps index slots, ×
  // deletes a custom group (confirmed — its items land in My Words).
  if (row.kind === "custom") {
    el.appendChild(xBadge(() => askDeleteGroup(row)));
  }
  editPointer(el, {
    onTap: () => openGroup(row.id),
    onDrop: (slot) => {
      if (slot < 10) return;
      const other = groupIndex(db).find((g) => g.index_slot === slot);
      if (other) swapGroups(db, row.id, other.id);
      else moveGroup(db, row.id, slot);
      renderGroupIndex();
    },
  });
  return el;
}

/** Slot 1 is reserved in both modes: the Edit-mode action while
 *  editing, a disabled blank otherwise — items never shift. */
function editSlotCell(label, onTap) {
  if (label && onTap) return navCell(label, onTap);
  const blank = document.createElement("button");
  blank.className = "gcell empty";
  blank.disabled = true;
  return blank;
}

/** Delete confirmation is an in-sheet two-button ask, never
 *  window.confirm — the learner can't be left inside a dialog. */
function askDeleteGroup(row) {
  $("del-title").textContent = `Delete ${groupDisplayName(db, row, locale)}?`;
  $("del-yes").onclick = () => {
    deleteGroup(db, row.id);
    close("delform");
    renderGroupIndex();
  };
  open("delform");
}

function renderGroupIndex() {
  const zg = $("groupgrid");
  zg.innerHTML = "";
  const rows = groupIndex(db);
  const placed = new Map(rows.map((g) => [g.index_slot, g]));
  for (let slot = 0; slot < 60; slot++) {
    if (slot === 0) {
      zg.appendChild(navCell("← Board", () => setView("board")));
      continue;
    }
    if (slot === 1) {
      zg.appendChild(editSlotCell(editing && "+ Group", () => open("groupform")));
      continue;
    }
    const row = placed.get(slot);
    if (row) {
      zg.appendChild(groupIndexCell(row));
      continue;
    }
    const empty = document.createElement("button");
    empty.className = "gcell empty";
    empty.dataset.slot = slot; // drag target for group moves
    empty.disabled = true;
    zg.appendChild(empty);
  }
}

function openGroupIndex() {
  setView("groupIndex");
}

async function openGroup(groupId) {
  groupKey = groupId;
  groupPageNo = 0;
  setView("group");
}

function senseCell(w, onTap) {
  const el = wordTile({ label: w.label, role: w.fitzgerald_role, art: w.art ?? null });
  el.addEventListener("click", onTap);
  return el;
}

async function entityCell(e, onTap) {
  const el = wordTile({ label: e.spoken_name, role: "Yellow" });
  const url = await loadPhotoURL(e.photo_key);
  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    el.querySelector(".tart").appendChild(img);
    el.classList.add("photo");
  }
  el.addEventListener("click", onTap);
  return el;
}

/** One item on a group page — a catalog sense or a personal entity at its
 *  stored slot. In Edit mode a tap opens the word card, a drag moves or
 *  swaps it, and × removes it from this group (Undo brings it back). */
async function itemCell(item, gKind) {
  // Speak taps exist only outside Edit — inside it the pointer owns the
  // cell (tap = card, drag = move/swap, × = remove).
  const onSpeak = editing
    ? () => {}
    : () => tap(item.label, item.item_kind, item.item_id, { source: "group" });
  const el = item.item_kind === "sense"
    ? senseCell(
        { fitzgerald_role: item.fitzgerald_role, label: item.label, art: item.art },
        onSpeak,
      )
    : await entityCell(
        { spoken_name: item.label, photo_key: item.photo_key },
        onSpeak,
      );
  el.dataset.slot = item.slot_index;
  el.dataset.item = `${item.item_kind}:${item.item_id}`;
  if (!editing) return el;

  // Removal is only offered where it can succeed: a sense never leaves a
  // built-in group (the findability guarantee), and an entity's last cell
  // is My Words, so it has no × there — the card's Remove retires it.
  const removable =
    item.item_kind === "entity" ? groupKey !== "grp_my_words" : gKind !== "builtin";
  if (removable) {
    el.appendChild(xBadge(() => {
      const undo = removeItemUndoable(db, groupKey, item.item_kind, item.item_id);
      renderGroupPage();
      toast(`Removed ${item.label}`, () => { undo.undo(); renderGroupPage(); });
    }));
  }
  editPointer(el, {
    onTap: () => openWordCard(item),
    onDrop: (slot) => {
      const target = groupPage(db, groupKey, groupPageNo, locale)
        .find((r) => r.slot_index === slot);
      if (target) {
        swapItems(db, groupKey, item, { item_kind: target.item_kind, item_id: target.item_id });
      } else {
        moveItem(db, groupKey, item.item_kind, item.item_id, groupPageNo, slot);
      }
      renderGroupPage();
    },
  });
  return el;
}

/** Group page: slot 0 = back to index, slot 1 = `+ Add` while editing,
 *  items at their stored (page, slot_index) in 2–58, slot 59 = Next ›
 *  when the group has a second page. Tapping an empty slot while editing
 *  opens + Add aimed at that slot — the slot is the picker. Word taps
 *  speak and stay in the group — leaving is one learned gesture. */
async function renderGroupPage() {
  const zg = $("groupgrid");
  zg.innerHTML = "";
  const items = new Map(
    groupPage(db, groupKey, groupPageNo, locale).map((r) => [r.slot_index, r]),
  );
  const pages = pageCount(db, groupKey);
  const gKind = ALL(db, "SELECT kind FROM board_group WHERE id = ?", [groupKey])[0]?.kind;

  for (let slot = 0; slot < 60; slot++) {
    if (slot === 0) {
      zg.appendChild(navCell("← Groups", openGroupIndex));
      continue;
    }
    if (slot === 1) {
      zg.appendChild(editSlotCell(editing && "+ Add", () => openAddForm(groupKey)));
      continue;
    }
    if (slot === 59) {
      if (pages > 1) {
        const el = navCell("Next ›", () => {
          groupPageNo = (groupPageNo + 1) % pages;
          renderGroupPage();
        });
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = `${groupPageNo + 1}/${pages}`;
        el.appendChild(badge);
        zg.appendChild(el);
      } else {
        const blank = document.createElement("div");
        blank.className = "gcell empty";
        zg.appendChild(blank);
      }
      continue;
    }
    const item = items.get(slot);
    if (!item) {
      const empty = document.createElement("div");
      empty.className = "gcell empty";
      if (editing) {
        empty.dataset.slot = slot; // drag target
        empty.addEventListener("click", () => {
          openAddForm(groupKey, { page: groupPageNo, slot_index: slot });
        });
      }
      zg.appendChild(empty);
      continue;
    }
    zg.appendChild(await itemCell(item, gKind));
  }
  fitLabels(zg);
}

/* --- custom groups: + Group on the group index --- */
$("group-save").addEventListener("click", async () => {
  const name = $("group-name").value.trim();
  if (!name) return;
  const file = $("group-photo").files[0];
  const photo = file ? await savePhoto(file) : null;
  if (photo) syncUploadBlob(photo.bytes).catch(() => {});
  createGroup(db, { name, photoKey: photo?.key ?? null });
  $("group-name").value = "";
  $("group-photo").value = "";
  close("groupform");
  renderGroupIndex();
});

/* --- add flow: one field, type → match → place. A catalog match places
   the real sense (its color, its voice); "New" makes a personal entity.
   The adult never picks a folder — the group they are standing in is the
   target. No type, pronoun, or category picker. --- */
function openAddForm(groupId, cell = null) {
  addTarget = groupId;
  addCell = cell;
  const row = ALL(db, "SELECT id, name FROM board_group WHERE id = ?", [groupId])[0];
  const name = row ? groupDisplayName(db, row, locale) : "";
  $("add-title").textContent = name ? `Add to ${name}` : "Add";
  $("add-name").value = "";
  $("add-photo").value = "";
  $("add-hint").value = "";
  $("add-newfields").hidden = true;
  $("add-matches").innerHTML = "";
  $("add-new").hidden = true;
  open("addform");
}

/** Re-render the match list and the always-present New row as the adult
 *  types. Every existing meaning is a picture row — the family's own
 *  entities first (with where they already are), then catalog senses.
 *  Picking a row places that same record here; only New creates one.
 *  Local query only — a save never touches the network. */
function renderAddMatches() {
  const text = $("add-name").value.trim();
  const box = $("add-matches");
  box.innerHTML = "";
  const newBtn = $("add-new");
  if (!text) {
    newBtn.hidden = true;
    $("add-newfields").hidden = true;
    return;
  }
  newBtn.hidden = false;
  newBtn.textContent = `New: '${text}'`;
  const seed = catalog.groups.find((g) => g.id === addTarget)?.category ?? null;

  const pic = (row, cls) => {
    const el = document.createElement("span");
    el.className = `pic ${cls}`;
    return el;
  };
  const place = (kind, id) => () => {
    placeItem(db, addTarget, kind, id, addCell);
    close("addform");
    rerenderView();
    renderStrip();
  };

  for (const m of entityMatches(db, text, addTarget, locale, seed)) {
    const row = document.createElement("button");
    row.className = "addmatch";
    const p = pic(row, "r-Yellow");
    if (m.photo_key) {
      loadPhotoURL(m.photo_key).then((url) => {
        if (!url) return;
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        p.replaceChildren(img);
        p.classList.add("photo");
      });
    } else {
      p.textContent = m.name[0].toUpperCase();
    }
    const txt = document.createElement("span");
    txt.className = "txt";
    const lb = document.createElement("span");
    lb.textContent = m.name;
    txt.appendChild(lb);
    if (m.groups.length) {
      const sub = document.createElement("span");
      sub.className = "sub";
      sub.textContent = `in ${m.groups.join(", ")}`;
      txt.appendChild(sub);
    }
    row.append(p, txt);
    row.addEventListener("click", place("entity", m.id));
    box.appendChild(row);
  }

  for (const m of catalogMatches(db, text, addTarget, locale, seed)) {
    const row = document.createElement("button");
    row.className = "addmatch";
    const p = pic(row, `r-${m.fitzgerald_role}`);
    if (m.art) {
      const img = document.createElement("img");
      img.src = `/${m.art}`;
      img.alt = "";
      p.appendChild(img);
    }
    const txt = document.createElement("span");
    txt.className = "txt";
    const lb = document.createElement("span");
    lb.textContent = m.label;
    txt.appendChild(lb);
    row.append(p, txt);
    row.addEventListener("click", place("sense", m.id));
    box.appendChild(row);
  }
}
$("add-name").addEventListener("input", renderAddMatches);
$("add-new").addEventListener("click", () => {
  $("add-newfields").hidden = false;
});

/* --- the Word Library (Word_Library § 3): Parent Corner → Words. Three
   tabs, one search field across all of them; a row tap opens the card.
   All reads through shared/library.mjs — this surface cannot write. --- */
let libTab = "added";

function libRowPic(r) {
  const p = document.createElement("span");
  p.className = `pic r-${r.role ?? "None"}`;
  if (r.photo_key) {
    loadPhotoURL(r.photo_key).then((url) => {
      if (!url) return;
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      p.replaceChildren(img);
      p.classList.add("photo");
    });
  } else if (r.art) {
    const img = document.createElement("img");
    img.src = `/${r.art}`;
    img.alt = "";
    p.appendChild(img);
  } else {
    p.textContent = r.label[0].toUpperCase();
  }
  return p;
}

function renderLibrary() {
  const q = $("lib-q").value.trim();
  const list = $("lib-list");
  list.innerHTML = "";
  const rows = q
    ? librarySearch(db, q, locale, normalizeV1) // the field searches the whole library
    : libTab === "added" ? libraryAdded(db, locale)
    : libTab === "all" ? libraryAll(db, locale)
    : librarySuggested(db, locale);
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.id = "lib-empty";
    empty.textContent = q ? "No matches."
      : libTab === "suggested" ? "Nothing here yet — words the device hears appear once the child does not have them yet."
      : "Nothing here yet.";
    list.appendChild(empty);
    return;
  }
  for (const r of rows) {
    const row = document.createElement("button");
    row.className = "addmatch";
    const txt = document.createElement("span");
    txt.className = "txt";
    const lb = document.createElement("span");
    lb.textContent = r.label;
    txt.appendChild(lb);
    const homes = libraryHomes(db, r.kind, r.id, locale);
    if (homes.length) {
      const sub = document.createElement("span");
      sub.className = "sub";
      sub.textContent = `in ${homes.join(", ")}`;
      txt.appendChild(sub);
    }
    row.append(libRowPic(r), txt);
    row.addEventListener("click", () =>
      openWordCard({ item_kind: r.kind, item_id: r.id, label: r.label, photo_key: r.photo_key }),
    );
    list.appendChild(row);
  }
}

$("lib-tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-t]");
  if (!b) return;
  libTab = b.dataset.t;
  for (const t of $("lib-tabs").querySelectorAll("button")) {
    t.classList.toggle("on", t === b);
  }
  renderLibrary();
});
$("lib-q").addEventListener("input", renderLibrary);
$("open-library").addEventListener("click", () => {
  $("lib-q").value = "";
  renderLibrary();
  open("library");
});

$("add-save").addEventListener("click", async () => {
  const name = $("add-name").value.trim();
  if (!name) return;
  const id = `ent_${crypto.randomUUID().replaceAll("-", "")}`;
  const file = $("add-photo").files[0];
  const photo = file ? await savePhoto(file) : null;
  if (photo) syncUploadBlob(photo.bytes).catch(() => {});
  const photoKey = photo?.key ?? null;
  const hint = $("add-hint").value.trim() || null;
  // The record's home category — a classifier input, never displayed —
  // is the seed category of a built-in target group, else null.
  const category = catalog.groups.find((g) => g.id === addTarget)?.category ?? null;
  createEntity(db, { id, name, photoKey, category, hint });
  placeItem(db, addTarget, "entity", id, addCell);
  kbIndex = null; // new entity joins the completion index
  close("addform");
  rerenderView();
  renderStrip();
});

/* --- the word card (Word_Library § 4): where the word is, how it
   sounds, what can change. Entities rename/photo/retire; catalog words
   are read-only here — masking is the Hide slice. --- */
let cardItem = null; // { item_kind, item_id, label } currently shown

function cardGroups() {
  return cardItem.item_kind === "entity"
    ? entityGroups(db, cardItem.item_id, locale)
    : senseGroups(db, cardItem.item_id, locale);
}

function renderCardGroups() {
  const box = $("wc-groups");
  box.innerHTML = "";
  for (const g of cardGroups()) {
    const chip = document.createElement("span");
    chip.className = "wchip";
    chip.textContent = g.name;
    const removable =
      cardItem.item_kind === "entity"
        ? g.id !== "grp_my_words" // last cell is My Words — Remove retires
        : g.kind !== "builtin"; // senses never leave built-ins
    if (removable) {
      chip.appendChild(xBadge(() => {
        const undo = removeItemUndoable(db, g.id, cardItem.item_kind, cardItem.item_id);
        renderCardGroups();
        rerenderView();
        toast(`Removed from ${g.name}`, () => { undo.undo(); renderCardGroups(); rerenderView(); });
      }));
    }
    box.appendChild(chip);
  }
}

function openWordCard(item) {
  cardItem = { item_kind: item.item_kind, item_id: item.item_id, label: item.label };
  const isEnt = item.item_kind === "entity";
  const meta = isEnt ? { role: "Yellow" } : metaFor(item.item_id);
  const pic = $("wc-pic");
  pic.className = `pic r-${meta.role ?? "None"}`;
  pic.replaceChildren();
  $("wc-name").value = item.label;
  $("wc-name").disabled = !isEnt; // a catalog word is renamed by a new copy, not here
  $("wc-role").textContent = isEnt ? "personal word" : "catalog word";
  $("wc-photolabel").hidden = !isEnt;
  $("wc-photo").value = "";
  $("wc-remove").hidden = !isEnt;
  $("wc-grouplist").hidden = true;
  if (isEnt && item.photo_key) {
    loadPhotoURL(item.photo_key).then((url) => {
      if (!url) return;
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      pic.replaceChildren(img);
      pic.classList.add("photo");
    });
  } else if (!isEnt && meta.art) {
    const img = document.createElement("img");
    img.src = `/${meta.art}`;
    img.alt = "";
    pic.appendChild(img);
  } else {
    pic.textContent = item.label[0].toUpperCase();
  }
  renderCardGroups();
  open("wordcard");
}

$("wc-name").addEventListener("change", () => {
  if (!cardItem || cardItem.item_kind !== "entity") return;
  const name = $("wc-name").value.trim();
  if (!name || name === cardItem.label) { $("wc-name").value = cardItem.label; return; }
  renameEntity(db, cardItem.item_id, name);
  cardItem.label = name;
  kbIndex = null; // completions index the old spelling
  rerenderView();
  renderStrip();
});

$("wc-photo").addEventListener("change", async () => {
  const file = $("wc-photo").files[0];
  if (!file || !cardItem) return;
  const photo = await savePhoto(file);
  syncUploadBlob(photo.bytes).catch(() => {});
  setEntityPhoto(db, cardItem.item_id, photo.key);
  entityPhoto.delete(cardItem.item_id);
  rerenderView();
});

$("wc-play").addEventListener("click", () => {
  if (!cardItem) return;
  if (cardItem.item_kind === "sense") {
    const key = clipKeyFor(cardItem.item_id);
    if (key) return playClip(key);
  }
  speak(cardItem.label);
});

/** Groups the item is not yet in — one tap places it at the next free
 *  cell of that group. */
$("wc-addgroup").addEventListener("click", () => {
  const list = $("wc-grouplist");
  list.hidden = !list.hidden;
  if (list.hidden) return;
  list.innerHTML = "";
  const member = new Set(cardGroups().map((g) => g.id));
  for (const g of groupIndex(db)) {
    if (member.has(g.id)) continue;
    const chip = document.createElement("button");
    chip.className = "wchip";
    chip.textContent = groupDisplayName(db, g, locale);
    chip.addEventListener("click", () => {
      placeItem(db, g.id, cardItem.item_kind, cardItem.item_id);
      renderCardGroups();
      list.hidden = true;
      rerenderView();
    });
    list.appendChild(chip);
  }
});

/** Show on board: jump to where the word lives and mark its cell for a
 *  beat. An entity or custom-group sense flashes in the group we opened
 *  the card from (else its first group); a built-in sense flashes on the
 *  core board. */
$("wc-show").addEventListener("click", () => {
  const it = cardItem;
  close("wordcard");
  const onBoard = it.item_kind === "sense" &&
    ALL(db, "SELECT 1 AS x FROM core_cell WHERE sense_id = ?", [it.item_id])[0];
  if (onBoard) {
    setView("board");
    flashCell(cellEls.get(it.item_id));
    return;
  }
  const homes = cardItem.item_kind === "entity"
    ? entityGroups(db, it.item_id, locale)
    : senseGroups(db, it.item_id, locale);
  const target = homes.find((g) => g.id === groupKey) ?? homes[0];
  if (!target) { setView("board"); return; }
  groupKey = target.id;
  const cell = ALL(
    db,
    "SELECT page FROM group_cell WHERE group_id = ? AND item_kind = ? AND item_id = ?",
    [groupKey, it.item_kind, it.item_id],
  )[0];
  groupPageNo = cell?.page ?? 0;
  setView("group");
  // Render is async; flash once the cells exist.
  requestAnimationFrame(() =>
    flashCell($("groupgrid").querySelector(`[data-item="${it.item_kind}:${it.item_id}"]`)),
  );
});

/** Remove = retire (never delete). The row, photo, and placements stay;
 *  Undo restores it. */
$("wc-remove").addEventListener("click", () => {
  const it = cardItem;
  retireEntity(db, it.item_id);
  close("wordcard");
  kbIndex = null;
  rerenderView();
  renderStrip();
  toast(`Removed ${it.label}`, () => {
    restoreEntity(db, it.item_id);
    kbIndex = null;
    rerenderView();
    renderStrip();
  });
});

/* ------------------------------------------------------------------ *
 * Linked devices + pairing (sync § 3). The new device shows an 8-char
 * code (and QR); a linked device types or scans it, taps Allow, and the
 * board key travels wrapped to the new device's dh key through the
 * pairing lobby — the relay never sees it.
 * ------------------------------------------------------------------ */

const relayBase = location.origin;
const pairOverlay = $("pairform");
const pairBody = $("pair-body");
const pairTitle = $("pair-title");
const pairGo = $("pair-go");
let pairPoll = null;

const openPair = (title) => {
  pairTitle.textContent = title;
  pairBody.innerHTML = "";
  pairGo.hidden = true;
  pairOverlay.classList.add("open");
};
const closePair = () => {
  clearInterval(pairPoll);
  pairPoll = null;
  pairOverlay.classList.remove("open");
};
pairOverlay.addEventListener("click", (e) => {
  if (e.target === pairOverlay || e.target.closest("[data-close]")) closePair();
});

/** First linked-device action on a board creates it on the relay. */
async function ensureBoard() {
  const cfg = syncConfig();
  if (cfg?.boardId) return cfg;
  const store = openKeyStore();
  const identity = await getDeviceIdentity(store);
  const res = await fetch(`${relayBase}/boards`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      device_id: identity.deviceId,
      pubkey: await exportPublicKey(identity.verify),
      dh_pub: await exportDhPublic(identity.dh.publicKey),
    }),
  });
  if (!res.ok) throw new Error(`board create: ${res.status}`);
  const { board_id } = await res.json();
  const next = { boardId: board_id, epoch: 1 };
  setSyncConfig(next);
  await initSync(db, location.origin, onSyncApplied);
  return next;
}

async function renderDevices() {
  const list = $("dev-list");
  const cfg = syncConfig();
  if (!cfg?.boardId) {
    list.innerHTML = '<p class="hint">This board is only on this device.</p>';
    return;
  }
  try {
    const store = openKeyStore();
    const identity = await getDeviceIdentity(store);
    const boardKey = await getBoardKey(store, cfg.epoch ?? 1);
    const client = relayClient({ boardId: cfg.boardId, baseUrl: relayBase, identity, boardKey });
    const { devices } = await client.listDevices();
    list.innerHTML = "";
    for (const d of devices) {
      const row = document.createElement("div");
      row.className = "dev-row";
      const name = document.createElement("span");
      name.className = "dev-id";
      name.textContent = d.device_id === identity.deviceId
        ? `${d.device_id} (this device)` : d.device_id;
      row.append(name);
      if (d.device_id !== identity.deviceId) {
        const rm = document.createElement("button");
        rm.className = "btn secondary";
        rm.textContent = "Remove";
        rm.onclick = () => removeDeviceFlow(client, store, identity, d.device_id);
        row.append(rm);
      }
      list.append(row);
    }
  } catch (err) {
    list.innerHTML = '<p class="hint">Relay unreachable — devices cannot be listed.</p>';
  }
}

/** Remove locks the door; rotating the board key means the removed
 *  device cannot read anything written after. */
async function removeDeviceFlow(client, store, identity, targetId) {
  if (!confirm(`Remove ${targetId}? It keeps what it already saw.`)) return;
  const { devices } = await client.listDevices();
  await client.removeDevice(targetId);
  const remaining = devices.filter((d) => d.device_id !== targetId && d.dh_pub);
  const epoch = (syncConfig()?.epoch ?? 1) + 1;
  const key = await newBoardKey();
  const wrapped = {};
  for (const d of remaining) wrapped[d.device_id] = await wrapBoardKey(key, d.dh_pub);
  await client.rotateKeys(epoch, wrapped);
  await putBoardKey(store, key, epoch);
  setSyncConfig({ ...syncConfig(), epoch });
  await renderDevices();
}

/** This device is the NEW device: post keys, show code + QR, poll. */
async function linkThisDevice() {
  const store = openKeyStore();
  const identity = await getDeviceIdentity(store);
  const { pair } = await pairClient(relayBase).request(
    identity.deviceId,
    await exportPublicKey(identity.verify),
    await exportDhPublic(identity.dh.publicKey),
  );
  openPair("Link this device");
  const code = document.createElement("div");
  code.className = "pair-code";
  code.textContent = pair;
  pairBody.append(code);
  const qr = document.createElement("div");
  qr.className = "pair-qr";
  const q = qrcode(0, "M");
  q.addData(JSON.stringify({ pair }));
  q.make();
  qr.innerHTML = q.createSvgTag({ cellSize: 4, margin: 8, scalable: true });
  pairBody.append(qr);
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = "On the other device: Parent corner → Add a device → type this code → Allow.";
  pairBody.append(hint);
  const status = document.createElement("p");
  status.className = "hint";
  status.textContent = "Waiting for Allow…";
  pairBody.append(status);

  pairPoll = setInterval(async () => {
    try {
      const st = await pairClient(relayBase).status(pair);
      if (st.status !== "granted") return;
      clearInterval(pairPoll);
      pairPoll = null;
      const key = await unwrapBoardKey(identity.dh.privateKey, st.grant);
      await putBoardKey(store, key, 1);
      setSyncConfig({ boardId: st.grant.board_id, epoch: 1 });
      status.textContent = "Linked — syncing…";
      await initSync(db, location.origin, onSyncApplied);
      status.textContent = "Linked. This board now syncs to this device.";
      await renderDevices();
    } catch { /* expired or relay hiccup — poll again */ }
  }, 2000);
}

/** This device is the LINKED device: type the code the new one shows. */
async function addDeviceFlow() {
  await ensureBoard();
  openPair("Add a device");
  pairBody.innerHTML = `
    <p class="hint">Type the 8-letter code the new device is showing.</p>
    <input type="text" id="pair-code" maxlength="8" autocomplete="off"
      style="text-transform:uppercase; letter-spacing:4px; font-size:22px; text-align:center;" />`;
  const input = pairBody.querySelector("#pair-code");
  input.focus();
  let pending = null;
  input.addEventListener("input", async () => {
    const code = input.value.trim().toUpperCase();
    if (code.length !== 8) return;
    try {
      const req = await pairClient(relayBase).status(code);
      pending = { code, req };
      pairBody.querySelector(".hint").textContent =
        `Allow ${req.device_id.slice(0, 12)}… to edit this board?`;
      pairGo.hidden = false;
      pairGo.textContent = "Allow";
    } catch {
      pairBody.querySelector(".hint").textContent = "That code is not open — check it and retry.";
    }
  });
  pairGo.onclick = async () => {
    if (!pending) return;
    const cfg = syncConfig();
    const store = openKeyStore();
    const identity = await getDeviceIdentity(store);
    const boardKey = await getBoardKey(store, cfg.epoch ?? 1);
    const client = relayClient({ boardId: cfg.boardId, baseUrl: relayBase, identity, boardKey });
    const wrapped = await wrapBoardKey(boardKey, pending.req.dh_pub);
    await client.addDevice(pending.req.device_id, pending.req.sig_pub, { dh_pub: pending.req.dh_pub });
    await pairClient(relayBase).grant(pending.code, {
      board_id: cfg.boardId, by_device: identity.deviceId, ...wrapped });
    closePair();
    await renderDevices();
  };
}

$("dev-link").onclick = () => linkThisDevice().catch((e) => {
  openPair("Link this device");
  pairBody.innerHTML = `<p class="hint">Could not reach the relay: ${e.message}</p>`;
});
$("dev-add").onclick = () => addDeviceFlow().catch((e) => {
  openPair("Add a device");
  pairBody.innerHTML = `<p class="hint">Could not reach the relay: ${e.message}</p>`;
});
$("corner").addEventListener("click", renderDevices);

renderGrid();
renderBar();
renderStrip();

// Console handle for works tests and founder debugging — read-only access
// to the live db and resolved profile. Product truth still flows through
// the functions above; this exposes, it does not own.
window.pip = {
  db,
  catalog,
  locale,
  audio,
  get sentence() {
    return sentence.map((i) => ({ ...i }));
  },
  get kbText() {
    return kbText;
  },
  get kbOpen() {
    return kbOpen;
  },
};
