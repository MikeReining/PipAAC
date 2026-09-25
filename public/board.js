/**
 * Board runtime: renders grid60 from the on-device SQLite, sentence bar,
 * groups, and the name+photo add flow. Catalog senses speak via bundled
 * clips (schema §7); personal entities use device TTS.
 */
import { bootDb, exportLegacyKvvfsDb, savePhoto, loadPhotoURL } from "./db.js";
import {
  closeSentence,
  detachEvent,
  EVIDENCE_GATE,
  fillChosen,
  keyboardContinuations,
  logImpression,
  likelyGroups,
  logSelection,
  openSentence,
  stampShownFinal,
  stripRanked,
} from "./shared/funnel.mjs";
import {
  coachTap, deleteSpotList, endSession, endSpotlight,
  listTargets, needsRouteWalk,
  resumeSession, saveSpotList, spotLists, spotlight,
  spotlightGroups, spotSession, startSession, startSpotlight,
} from "./shared/spotlight.mjs";
import { displaySentence, keyMap, resolveKeymap } from "./shared/keyboard.mjs";
import { resolveProfile } from "./shared/profile.mjs";
import {
  createEntity,
  entityForSense,
  groupDisplayName,
  groupIndex,
  maskedSenseIds,
  removeItem,
  setSetting,
} from "./shared/groups.mjs";
import { setDeviceId } from "./shared/ops.mjs";
import { getDeviceIdentity, openKeyStore } from "./shared/sync_crypto.mjs";
import { initSync, syncRekey, syncSendModel, syncUploadBlob } from "./shared/sync.mjs";
import { refreshStatsDays } from "./shared/stats.mjs";
import { flushResearch } from "./shared/research.mjs";
import { mountWincard } from "./board/wincard-ui.js";
import { mountProgress } from "./board/progress-ui.js";
import {
  addUser, listUsers, migrateLegacy, openUserStore, putUser,
  resolveActiveUser, touchOpened,
} from "./shared/users.mjs";
import { resolveSlot } from "./shared/voice.mjs";
import { SENSE_ART_SQL } from "./shared/images.mjs";
import { coreCells, moveCore, placeOnBoard, seatSetupPeople } from "./shared/coremove.mjs";
import { useCounts } from "./shared/usecounts.mjs";
import { bindLayouts, moveMarks } from "./shared/movecost.mjs";
import { mountCellsSheet } from "./board/cells-sheet.js";
import { mountSpotlightSheet } from "./board/spotlight-sheet.js";
import { mountKeyboard } from "./board/keyboard-ui.js";
import { mountGroups } from "./board/groups-ui.js";
import { mountAddFlow } from "./board/add-flow.js";
import { mountLibrary } from "./board/library-ui.js";
import { mountWordCard } from "./board/word-card.js";
import { mountDevices } from "./board/devices-ui.js";
import { mountPlacePicker } from "./board/place-ui.js";
import { mountRecovery } from "./board/recovery-ui.js";
import { mountEditor } from "./board/editor-ui.js";
import { mountCoach } from "./board/coach-ui.js";
import {
  family as familyRow, familyItems,
} from "./shared/families.mjs";
import { mountFamilyEditor } from "./board/family-editor.js";
import qrcode from "../vendor/qrcode.mjs";

const $ = (id) => document.getElementById(id);
const ALL = (db, sql, p = []) => db.all(sql, p);
const RUN = (db, sql, p = []) => db.prepare(sql).run(...p);

/* ------------------------------------------------------------------ *
 * Which user is this (015 slice 2): the registry holds one row per
 * user; this device's home user opens by default, a lone user opens
 * directly, and a shared device with no home user asks. A tab-level
 * override lets Parent Corner → Switch open another user without
 * changing the home flag.
 * ------------------------------------------------------------------ */
const userStore = openUserStore();

/** Shared device, no home user: ask who is playing. A plain full-screen
 * list — the child's page never carries a settings chrome. */
function pickUser(rows) {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.style.cssText = "position:fixed;inset:0;background:var(--cream);"
      + "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;z-index:99";
    const h = document.createElement("p");
    h.className = "hint";
    h.textContent = "Who is playing?";
    wrap.append(h);
    for (const u of rows) {
      const b = document.createElement("button");
      b.className = "btn";
      b.textContent = u.name || "This user";
      b.onclick = () => { wrap.remove(); resolve(u); };
      wrap.append(b);
    }
    document.body.append(wrap);
  });
}

await migrateLegacy({
  storage: localStorage,
  exportLegacyDb: exportLegacyKvvfsDb,
  keyStore: openKeyStore(),
  userStore,
});
let users = await listUsers(userStore);
let me = users.find((u) => u.id === sessionStorage.getItem("pip_active_user"))
  ?? resolveActiveUser(users);
if (!me && users.length === 0) {
  // First boot: a child's device opens straight to its board — the
  // first user is the home user, named later in Parent corner → Users.
  me = await addUser(userStore, { home: true });
}
if (!me) me = await pickUser(users); // shared device, no home — ask
sessionStorage.setItem("pip_active_user", me.id);
await touchOpened(userStore, me.id);
const saveUser = async (patch) => {
  Object.assign(me, patch);
  await putUser(userStore, me);
};

// One writer per user (§ 12.2): a second tab on the same user is told,
// not allowed to write over it.
if (navigator.locks?.request) {
  const locked = await new Promise((res) => {
    navigator.locks.request(`pip-user-${me.id}`, { ifAvailable: true }, (lock) => {
      if (!lock) return res(false);
      res(true);
      return new Promise(() => {}); // hold for the session
    });
  });
  if (!locked) {
    document.body.innerHTML = '<p class="hint" style="padding:40px;text-align:center">'
      + "This user is open in another tab — pick another user or close it there.</p>";
    throw new Error("user locked by another tab");
  }
}
navigator.storage?.persist?.().catch(() => {});

const { db, catalog, phrases, flush: flushDb } = await bootDb(userStore, me.id);
bindLayouts(catalog.layouts); // move-cost sectors need the column counts
// Device identity for the op log (sync § 4): the signing key's
// fingerprint, resolved from the platform keystore. Until it lands the
// log keeps 'dev_local'; ops written after carry the real device id.
getDeviceIdentity().then(({ deviceId }) => setDeviceId(deviceId))
  .catch((err) => console.warn("sync: device identity unavailable", err));
// If this user is already linked, start the sync loop (§ 5): catch up,
// flush pending ops, listen for the relay's fan-out.
/** Synced edits land in the DB via drainOps — repaint whatever's on
 *  screen. Debounced: a drain batch is one repaint, not one per op. */
let syncRepaintTimer = null;
function onSyncApplied() {
  clearTimeout(syncRepaintTimer);
  syncRepaintTimer = setTimeout(() => {
    entityPhoto.clear(); // photo_key may have changed
    entityRole.clear();  // kind picks may have landed
    senseMeta.clear();   // image overrides may have landed
    kbUi.invalidateIndex();      // masks and renames may have landed
    const p = ALL(db,
      "SELECT keyboard_mode, keyboard_order, highlight_next FROM learner_profile WHERE id = 'prf_local'",
    )[0] ?? {};
    kbUi.mode = p.keyboard_mode ?? kbUi.mode;
    kbUi.order = p.keyboard_order ?? kbUi.order;
    highlightNext = (p.highlight_next ?? 0) === 1;
    syncFreshSeg();
    bindSpotSettings();  // spotlight settings sync too
    resumeSession(db);   // a session started/ended elsewhere lands here
    renderCellsSeg();    // a Cells change may have landed
    renderGrid();
    renderStrip();
    rerenderView();
  }, 150);
}

initSync(db, me, saveUser, location.origin, onSyncApplied, onModel)
  .then(async (sync) => {
    if (!sync) return;
    // § 11 warning channel: a linked device returning inside the final
    // window (or while a deletion is pending) hears about it once.
    const self = await sync.client.selfKey().catch(() => null);
    if (self?.delete_at) {
      toast(`This user is scheduled for deletion on ${new Date(self.delete_at).toLocaleDateString()} — Parent corner → Delete to undo.`);
    } else if (self?.idle_delete_at) {
      toast(`This user has not synced in a long time and may be removed on ${new Date(self.idle_delete_at).toLocaleDateString()}.`);
    }
    // § 9 honest message: a free-user restore unlinked the other
    // devices — the card holder hears it on first boot.
    if (sessionStorage.getItem("pip_restore_moved")) {
      sessionStorage.removeItem("pip_restore_moved");
      toast("Restored — on a free user the other devices were unlinked. "
        + "Relink them from Parent corner.");
    }
  })
  .catch((err) => console.warn("sync unavailable", err));
// 016 slice 1: today's and yesterday's totals recompute on boot; older
// days are fixed. A spoken sentence schedules the same refresh. Slice 6:
// each refresh also flushes the whitelisted research totals — async and
// fire-and-forget, so a dead network never touches the board.
const refreshAndReport = () => {
  refreshStatsDays(db);
  flushResearch(db).catch(() => {});
};
refreshAndReport();
let statsTimer = null;
const scheduleStatsRefresh = () => {
  clearTimeout(statsTimer);
  statsTimer = setTimeout(refreshAndReport, 2000);
};
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
/* After Speak (fresh_after_speak): the spoken words stay up for a
 * repeat either way. With the setting on, the next new word empties
 * the bar first; Backspace or Clear means the user is editing, so the
 * pending fresh start is dropped. */
let freshAfterSpeak = false;
let freshNext = false;
const startFresh = (editing = false) => {
  if (freshNext && !editing) sentence.length = 0;
  freshNext = false;
};
/* Strip impressions (§ 5.7): renderStrip logs what the strip offered at
 * the next pick's position — one row per distinct offer, deduped by
 * (sentence, position, shown). The next logged pick fills chosen_*. */
let lastImpressionKey = null;
/* The open strip moment — one row per moment; the painter stamps
 * shown_final on it (017-5). */
let openImpressionId = null;
function maybeImpression(candidates, shown, { mode = "picture", cap = null } = {}) {
  if (sentenceId === null) return false;
  const shownKeys = shown.map((c) => `${c.kind}:${c.id}`);
  const key = `${sentenceId}:${sentencePicks}:${shownKeys.join()}`;
  if (key === lastImpressionKey) return false;
  lastImpressionKey = key;
  openImpressionId = logImpression(db, {
    sentenceId, position: sentencePicks,
    candidates, shown: shownKeys,
    mode, gate: EVIDENCE_GATE, shortlistCap: cap,
  });
  return true;
}
let view = "board";    // 'board' | 'groupIndex' | 'group' — groups are a board mode, not a modal
let editing = false; // caregiver Edit mode — same gesture on index and pages
let countsOn = false; // 018 D10: the 📊 badge — the child's own 30-day taps
const getCounts = () => useCounts(db);

const SILENT_SLOT_MS = 400;
const audio = new Audio();

function speak(text) {
  // device_tts lane — used for personal entities (§7.3). The utterance
  // carries the profile locale so names and typed words are spoken in
  // the profile's language, not the device's.
  const u = new SpeechSynthesisUtterance(text);
  u.lang = locale;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

/** Play a clip: catalog keys are shipped files; `blob:` keys are
 *  content-addressed bytes in OPFS (recorded overrides, synced photos)
 *  resolved through the blob loader, which lazy-fetches a sealed copy. */
async function playClip(key) {
  let src = `/${key}`;
  if (key.startsWith("blob:")) {
    src = await loadPhotoURL(key);
    if (!src) return;
  }
  return new Promise((resolve) => {
    audio.src = src;
    audio.onended = resolve;
    audio.onerror = resolve;
    audio.play().catch(resolve);
  });
}

/** Speak one tapped item — §7.2/7.3 resolution: override, voice clip,
 *  TTS, or a held 400 ms silent slot. */
async function speakItem(item) {
  const slot = resolveSlot(db, item, locale, voiceId);
  if (slot.type === "clip") return playClip(slot.key);
  if (slot.type === "tts") return speak(slot.text);
  return new Promise((r) => setTimeout(r, SILENT_SLOT_MS));
}

/** Sentence bar: one slot per item in order; misses hold 400 ms (§7.4).
 *  Speaking ends the logged sentence — the bar keeps its words, but the
 *  next pick opens a new sentence row. */
async function speakSentence() {
  freshNext = freshAfterSpeak;
  for (const item of [...sentence]) await speakItem(item);
  if (sentenceId !== null) {
    const sid = sentenceId;
    closeSentence(db, sid, Date.now(), "spoken");
    scheduleStatsRefresh();
    sentenceId = null;
    sentencePicks = 0;
    lastImpressionKey = null;
    openImpressionId = null;
    // 018 D4: the sentence is done — the next one starts at home.
    if (view !== "board") kbUi.setView("board");
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
        `SELECT s.fitzgerald_role AS role, ${SENSE_ART_SQL} AS art
         FROM sense s WHERE s.id = ?`,
        [senseId],
      )[0] ?? { role: null, art: null },
    );
  }
  return senseMeta.get(senseId);
}

/** Cache: entity id → fitzgerald_role — the family's kind pick (018 D7),
 *  Yellow until classified. */
const entityRole = new Map();
function roleForEntity(entityId) {
  if (!entityRole.has(entityId)) {
    entityRole.set(
      entityId,
      ALL(db, "SELECT fitzgerald_role AS r FROM personal_entity WHERE id = ?",
        [entityId])[0]?.r ?? "Yellow",
    );
  }
  return entityRole.get(entityId);
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
  // Each item renders as its picture with the word underneath in ink —
  // no role color (Design_System § Sentence bar).
  const texts = displaySentence(sentence, locale);
  sentence.forEach((item, i) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    const lb = document.createElement("span");
    lb.className = "clabel";
    lb.textContent = texts[i];
    const ar = document.createElement("span");
    ar.className = "cart";
    chip.append(ar, lb);
    if (item.kind === "sense") {
      const art = metaFor(item.id).art;
      if (art) {
        const img = document.createElement("img");
        img.alt = "";
        if (artInto(img, art)) chip.classList.add("photo");
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
  if (kbUi.text) {
    const p = document.createElement("span");
    p.className = "partial";
    p.textContent = kbUi.text + "▌";
    bar.appendChild(p);
  }
  if (!sentence.length && !kbUi.text) {
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
  $("clear").disabled = !sentence.length && !kbUi.text;
  $("backspace").disabled = !sentence.length && !kbUi.text;
  $("speak").disabled = !sentence.length;
  bar.scrollLeft = bar.scrollWidth; // the newest word stays in view
}
$("bar").addEventListener("click", () => {
  if (sentence.length) speakSentence();
});
$("clear").addEventListener("click", () => {
  startFresh(true);
  if (sentenceId !== null) {
    closeSentence(db, sentenceId, Date.now(), "cleared");

    sentenceId = null;
    sentencePicks = 0;
    lastImpressionKey = null;
    openImpressionId = null;
  }
  sentence.length = 0;
  kbUi.text = "";
  renderBar();
  renderStrip();
});
$("speak").addEventListener("click", () => {
  if (sentence.length) speakSentence();
});
/* Backspace takes the last whole word (or the word being typed). A
 * logged pick leaves the open sentence the same way the keyboard's ⌫
 * detaches it — its event stays as usage evidence (funnel detachEvent). */
$("backspace").addEventListener("click", () => {
  startFresh(true);
  if (kbUi.text) {
    kbUi.text = "";
    const dev = $("kb-device");
    if (dev) dev.value = "";
  } else {
    const last = sentence.pop();
    if (last?.id && sentenceId !== null && sentencePicks > 0) {
      detachEvent(db, sentenceId, sentencePicks - 1);
      sentencePicks--;
    }
  }
  renderBar();
  renderStrip();
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

/** The four resting cards shown when the sentence bar is empty, in
 *  priority order: the child's top person first (a call to a person is a
 *  young child's most common word — 014 § 7a), `help` last (it is a cell
 *  on every home board). A narrow bar keeps the front of the list. */
async function idleStarters() {
  const cards = [];
  const masked = maskedSenseIds(db);
  const top = ALL(
    db,
    `SELECT e.id, e.spoken_name, e.photo_key FROM personal_entity e
     LEFT JOIN learner_event_log l ON l.item_kind = 'entity' AND l.item_id = e.id
     WHERE e.status = 'active'
     GROUP BY e.id ORDER BY COUNT(l.id) DESC, MAX(l.selected_at) DESC, e.rowid LIMIT 1`,
  )[0];
  if (top) cards.push({ entity: top });
  const hello = masked.has(HELLO_SENSE_ID) ? null : senseById(HELLO_SENSE_ID);
  if (hello) {
    cards.push({ id: hello.id, label: hello.label, glyph: "👋", role: hello.fitzgerald_role,
      onTap: () => tap(hello.label, "sense", hello.id, { hint: true, source: "strip" }) });
  }
  const foodRow = ALL(db, "SELECT id, name FROM board_group WHERE id = 'grp_food'")[0];
  if (foodRow) {
    cards.push({ label: groupDisplayName(db, foodRow, locale), glyph: "🥞", role: "Pink",
      onTap: () => groupsUi.openGroup("grp_food") });
  }
  const help = masked.has(HELP_SENSE_ID) ? null : senseById(HELP_SENSE_ID);
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
  el.className = `pred${c.entity ? ` r-${roleForEntity(c.entity.id)}` : c.role ? ` r-${c.role}` : ""}`;
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
      img.alt = "";
      if (artInto(img, art)) el.classList.add("photo");
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

/** Strip items → card descriptors (entity tile or sense tile). */
function stripCards(items) {
  return items.map((c) => {
    if (c.kind === "entity") {
      return { entity: ALL(db, "SELECT * FROM personal_entity WHERE id = ?", [c.id])[0] };
    }
    // 014 slice 11: a family person stands in for the catalog word it
    // represents — the bar shows Mama's photo and her name in `mom`'s
    // place, at `mom`'s rank. The word's score is untouched; only the
    // tile and the voice change.
    const standIn = entityForSense(db, c.id);
    if (standIn) return { entity: standIn };
    const w = ALL(
      db,
      `SELECT s.id, l.text AS label, s.fitzgerald_role FROM sense s
       JOIN label l ON l.sense_id = s.id
         AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = ?
       WHERE s.id = ?`,
      [locale, c.id],
    )[0];
    return { id: w.id, label: w.label, role: w.fitzgerald_role,
      onTap: () => tap(w.label, "sense", w.id, { hint: true, source: "strip" }) };
  });
}

/** Paint the strip's slots — the only path that touches the tray.
 *  Stamps shown_final on the open strip moment: what was painted is
 *  the truth the stored row must replay (017-5). */
async function paintStrip(cards, slots = stripSlots(boardGeom().cols)) {
  const tray = $("tray");
  tray.style.gridTemplateColumns = `repeat(${slots}, 1fr)`;
  tray.querySelectorAll(".pred").forEach((n) => n.remove());
  for (let i = 0; i < slots; i++) {
    tray.appendChild(cards[i] ? await predCard(cards[i]) : ghostCard());
  }
  if (openImpressionId !== null) {
    stampShownFinal(db, openImpressionId, cards.slice(0, slots).map((c) =>
      c.entity ? `entity:${c.entity.id}` : `sense:${c.id}`));
  }
  fitLabels(tray);
  applyLikely();
}

/** Expand mode (014 § 5): the family's fixed-order tiles, one column
 *  wide; a family longer than the bar ends in a fixed `more ›` tile
 *  that pages it. A pick returns the bar to Predict. */
async function renderExpand() {
  const fam = familyRow(db, expand.familyId);
  if (!fam) { expand = null; return renderStrip(); }
  const items = familyItems(db, expand.familyId, locale, maskedSenseIds(db));
  const cap = expandCap(boardGeom().cols);
  // `more ›` only costs a slot when the family is longer than the bar.
  const pages = items.length > cap ? Math.ceil(items.length / (cap - 1)) : 1;
  const pageSize = pages > 1 ? cap - 1 : cap;
  expand.page = Math.min(expand.page, pages - 1);
  const shown = items.slice(expand.page * pageSize, expand.page * pageSize + pageSize);
  const cards = shown.map((it) => {
    if (it.kind === "family") {
      return {
        label: it.label, glyph: it.glyph,
        onTap: () => {
          // One level of chaining (Pain → how much → where), no deeper.
          if (it.speaks) speak(it.speaks);
          if (expand.depth < 1) openExpand(it.nextFamily, expand.depth + 1);
        },
      };
    }
    return {
      label: it.label, role: it.role,
      onTap: () => {
        expand = null;
        tap(it.label, it.kind, it.id, { hint: true, source: "strip" });
      },
    };
  });
  if (pages > 1) {
    cards.push({
      label: "more ›",
      onTap: () => { expand.page = (expand.page + 1) % pages; renderStrip(); },
    });
  }
  await paintStrip(cards, cap);
}

async function renderStrip() {
  if (expand) return renderExpand();
  const cap = stripSlots(boardGeom().cols);
  let cards;
  if (kbUi.text) {
    // mid-word: the strip switches from continuations to completions
    cards = kbUi.completions();
  } else {
    // Keyboard open with an empty buffer: next-word continuations, core
    // words included — the grid is hidden so board words belong in the
    // bar regardless of board cells (R21).
    const sents = sentence.map((s) => ({ kind: s.kind, id: s.id }));
    const ranked = kbUi.isOpen() ? null
      : stripRanked(db, sents, Date.now(), locale, phrases);
    const items = kbUi.isOpen()
      ? keyboardContinuations(db, sents, locale, Date.now(), phrases)
      : ranked.shown;
    if (sentence.length === 0 && !items.length) {
      // Nothing has evidence at position 0 — the resting cards still
      // fill the bar (person, hello, food, help). Once her history or
      // the children table supports an opener, the offer wins instead.
      cards = (await idleStarters()).slice(0, cap);
    } else {
      // Position-0 offers are real moments too (017-21): open the
      // sentence so the impression row can exist. A row with no picks
      // stays invisible to stats (end_kind IS NULL).
      if (ranked) ensureSentence();
      maybeImpression(
        ranked?.ranked ?? items.map((c) => ({ kind: c.kind, id: c.id })),
        items, { mode: kbUi.isOpen() ? "keyboard" : "picture", cap },
      );
      cards = stripCards(items);
    }
  }
  await paintStrip(cards);
}

function tap(text, kind = "sense", id = null, { hint = false, source = "grid" } = {}) {
  if (picking) {
    // Pick mode: a tap chooses a target, never speaks or appends.
    if (id) {
      const key = `${kind}:${id}`;
      picking.has(key) ? picking.delete(key) : picking.add(key);
      updatePickBar();
      renderGrid();
      rerenderView();
    }
    return;
  }
  if (modeling) {
    // Model mode: a tap glows the word on linked boards — never speaks
    // or appends here; the adult's voice is the audio (013 § 4).
    if (id) {
      const key = `${kind}:${id}`;
      syncSendModel(key, text);
      coachTap(db, kind, id); // the partner's tally — device-local (§ 5a)
      coachUi.renderCoachTally();
      modelSent.add(key);
      renderGrid();
      rerenderView();
      setTimeout(() => {
        modelSent.delete(key);
        renderGrid();
        rerenderView();
      }, 700);
    }
    return;
  }
  // The child tapping a word the partner just modeled ends its glow.
  clearModel(id ? `${kind}:${id}` : null);
  const item = { kind, id, text };
  expand = null; // any pick returns the bar to Predict (014 § 5)
  startFresh();
  sentence.push(item);
  renderBar();
  speakItem(item);
  if (id) {
    ensureSentence();
    fillChosen(db, sentenceId, { kind, id, source });
    logSelection(db, kind, id, Date.now(), {
      sentenceId, position: sentencePicks++, source,
      spotlit: !!spotlight()?.targets.has(`${kind}:${id}`),
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
    if (ALL(db, "SELECT 1 AS x FROM core_cell WHERE layout = ? AND sense_id = ?", [boardGeom().name, id]).length) return;
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

/** Set an <img> to a sense's art key: catalog keys are shipped asset
 *  paths; `blob:` keys are family photos in OPFS, resolved through the
 *  blob loader (which lazy-fetches a sealed copy). Returns true when the
 *  art is a photo — the caller adds the cover-fit `.photo` class. */
function artInto(img, art) {
  if (art.startsWith("blob:")) {
    loadPhotoURL(art).then((url) => { if (url) img.src = url; });
    return true;
  }
  img.src = `/${art}`;
  return false;
}

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
    img.alt = "";
    ar.appendChild(img);
    if (photoURL) {
      img.src = photoURL;
      el.classList.add("photo");
    } else if (artInto(img, art)) {
      el.classList.add("photo");
    }
  }
  el.append(lb, ar);
  return el;
}

/** Shrink-to-fit labels: Andika Bold on one line, stepping down until the
 *  text fits its strip — a word never breaks inside itself; multi-word
 *  labels may wrap between words. */
function fitLabels(root) {
  document.fonts.ready.then(() => {
    for (const lb of root.querySelectorAll(".tlabel, .plabel")) {
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

/** The profile's one Cells setting (014 § 3): which coordinate-map
 *  layout the board, group pages, and strip all draw at. Anything the
 *  catalog doesn't define falls back to grid60. */
function boardGeom() {
  const name = ALL(
    db, "SELECT board_layout AS l FROM learner_profile WHERE id = 'prf_local'",
  )[0]?.l ?? "grid60";
  const layout = catalog.layouts?.[name] ?? catalog.layouts?.grid60
    ?? { cols: 10, rows: 6, anchors: [] };
  return {
    name: catalog.layouts?.[name] ? name : "grid60",
    cols: layout.cols,
    rows: layout.rows,
    cells: layout.cols * layout.rows,
    anchors: new Map((layout.anchors ?? []).map((a) => [a.slot, a])),
  };
}
/** Prediction slots in the strip at this width (014 slice 1): four on a
 *  ten-column board, two on five — the Groups and Keyboard anchors keep
 *  one column each so the whole vocabulary stays reachable. */
function stripSlots(cols) {
  return Math.min(4, Math.max(2, Math.floor((cols - 2) / 2)));
}

/* --- Expand mode (014 § 5, Motor_Grid § 2.1): a family tile opens its
 *  family in the bar — fixed order, one-column tiles, never ranked,
 *  never trimmed. A pick returns the bar to Predict; a family item may
 *  chain one level deeper (Pain → how much → where), no more. --- */
let expand = null; // { familyId, page, depth } — null means Predict mode
const expandCap = (cols) => Math.max(4, cols - 2); // one-wide tiles
function openExpand(familyId, depth = 0) {
  expand = { familyId, page: 0, depth };
  renderStrip();
}
function closeExpand() { expand = null; renderStrip(); }

/* --- the attention layer (013 § 2): a running spotlight glows its
 *  target words and dims the rest — every cell stays tappable and
 *  speaks; masked cells are skipped entirely (never unmask). Slice 2
 *  owns lists/sessions; this is the layer itself. --- */

/** Pulse rides the synced glow-style setting (013 § 4). */
let spotPulse = false;

/* --- The attention layer's one mark pass (013 § 2, slice 7): every
 *  use of "brighten some words, dim the rest" applies here — spotlight
 *  targets, live-model glows, the picker's chosen words, and (board
 *  cells only) the 014 move marks and the prediction halos. No renderer
 *  sets these classes on its own. --- */
function layerMark(el, key, { board = false } = {}) {
  const [kind, id] = key.split(":");
  const s = spotlight();
  if (s) {
    if (s.targets.has(key)) {
      el.classList.add("glow");
      if (spotPulse) el.classList.add("pulse");
    } else {
      el.classList.add("dimmed");
    }
  }
  if (picking) el.classList.toggle("picked", picking.has(key));
  if (modelGlow.has(key) || modelSent.has(key)) el.classList.add("glow");
  if (board && kind === "sense" && movedSet.has(id)) el.classList.add("moved");
  if (board && kind === "sense" && likelySet.has(id)) el.classList.add("likely");
}

/** Read the spotlight settings and apply the dim token — called at boot
 *  and after a sync drain so a setting changed on the other device
 *  lands here. Returns the default session minutes. */
function bindSpotSettings() {
  const p = ALL(db,
    "SELECT spot_dim, spot_pulse, spot_minutes, model_speaks FROM learner_profile WHERE id = 'prf_local'",
  )[0] ?? {};
  document.documentElement.style.setProperty("--dim-o", (p.spot_dim ?? 45) / 100);
  spotPulse = (p.spot_pulse ?? 0) === 1;
  modelSpeaks = (p.model_speaks ?? 0) === 1;
  return p.spot_minutes ?? 0;
}

/* --- pick mode (013 slice 2): an adult taps words on the board or in
 *  groups to choose targets; taps never speak while picking. `picking`
 *  is the Set of "kind:id" being chosen, or null when off. --- */
let picking = null;
function updatePickBar() {
  $("spot-pick-count").textContent = `${picking?.size ?? 0} picked`;
  $("spot-pick-start").disabled = !picking?.size;
  $("spot-pick-save").disabled = !picking?.size;
}
function setPicking(on) {
  picking = on ? new Set() : null;
  document.body.classList.toggle("picking", on);
  $("spot-pickbar").hidden = !on;
  if (on) updatePickBar();
  renderGrid();
  rerenderView();
}

/* --- live modeling (013 slice 4, § 4): a tap on the partner's device
 *  rides the ws to the child's board, glows the word a few seconds,
 *  then fades — or ends the moment the child taps it. Never saved,
 *  never in the sync log; the glow is silent unless the family turns
 *  on Speak (model_speaks). --- */
let modeling = false;
let modelSpeaks = false;
const modelGlow = new Map(); // "kind:id" → fade timer
const modelSent = new Set(); // local echo on the partner's device
const MODEL_FADE_MS = 4000;

function clearModel(key) {
  const t = key ? modelGlow.get(key) : undefined;
  if (t === undefined) return;
  clearTimeout(t);
  modelGlow.delete(key);
  renderGrid();
  rerenderView();
}

function setModeling(on) {
  modeling = on;
  document.body.classList.toggle("modeling", on);
  $("modelbar").hidden = !on;
}

/** A modeled word arrived from the partner's device (ws, transient). */
function onModel(m) {
  if (m?.k !== "model" || typeof m.t !== "string") return;
  clearTimeout(modelGlow.get(m.t));
  modelGlow.set(m.t, setTimeout(() => {
    modelGlow.delete(m.t);
    renderGrid();
    rerenderView();
  }, MODEL_FADE_MS));
  const [kind, id] = m.t.split(":");
  if (modelSpeaks && m.w) speakItem({ kind, id, text: m.w });
  renderGrid();
  rerenderView();
}

/** The sense ids the home grid rendered — `spotChrome` walks routes
 *  against it from any view. */
let boardSenseIds = new Set();

/** Chrome the layer owns outside the cells: the Groups anchor glows when
 *  a target needs the route walk, and the end chip shows while running. */
function spotChrome() {
  const s = spotlight();
  const walk = (!!s && needsRouteWalk(s.targets, boardSenseIds)) ||
    (modelGlow.size > 0 && needsRouteWalk(new Set(modelGlow.keys()), boardSenseIds));
  $("anchor-groups").classList.toggle("glow", walk);
  const chip = $("spot-chip");
  chip.hidden = !s;
  if (s) chip.textContent = `🔦 ${s.name} · End`;
  coachUi.renderCoach();
}

/* Coach bar — public/board/coach-ui.js. Partner devices only. */
const coachUi = mountCoach({
  db, locale, all: ALL, catalog, me, syncSendModel,
});

/** The strip spans the board's columns; the tray holds the prediction
 *  slots and the two anchors keep a column each. */
function sizeStrip(cols) {
  $("strip").style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  const tray = $("tray");
  tray.style.gridColumn = `span ${cols - 2}`;
  tray.style.gridTemplateColumns = `repeat(${stripSlots(cols)}, 1fr)`;
}

/** Transition-highlight marks (014 § 4): refreshed each grid render so
 *  an accepted Cells change glows immediately and expired marks drop. */
let movedSet = new Set();

function renderGrid() {
  const geom = boardGeom();
  movedSet = moveMarks(db);
  const cells = coreCells(db, geom.name, locale);
  const bySlot = new Map(cells.map((c) => [c.slot_index, c]));
  const masked = maskedSenseIds(db);
  // 018 D10 📊: one query per repaint, a badge on every tile.
  const counts = editing && countsOn ? getCounts() : null;
  const withCount = (el, kind, id) => {
    if (!counts) return el;
    const n = document.createElement("span");
    n.className = "ucount";
    n.textContent = String(counts.get(`${kind}:${id}`) ?? 0);
    el.appendChild(n);
    return el;
  };
  const grid = $("grid");
  grid.style.gridTemplateColumns = `repeat(${geom.cols}, 1fr)`;
  grid.style.gridTemplateRows = `repeat(${geom.rows}, 1fr)`;
  sizeStrip(geom.cols);
  grid.innerHTML = "";
  cellEls.clear();
  // Every slot renders: a missing cell is a dashed placeholder, never a
  // collapsed gap — the coordinate map is the motor plan.
  for (let slot = 0; slot < geom.cells; slot++) {
    const anchor = geom.anchors.get(slot);
    if (anchor?.kind === "groups") {
      const el = document.createElement("button");
      el.className = "cell anchor-cell";
      el.innerHTML = `<span class="glyph">🗂️</span>`;
      el.addEventListener("click", groupsUi.openGroupIndex);
      grid.appendChild(el);
      continue;
    }
    if (anchor?.kind === "family") {
      // A Smart bar family tile (014 § 5): speaks its label if it has
      // one ("Pain" → "I'm in pain"; `?` opens silently), then opens the
      // family in the bar. Never a sentence pick, never a drop target.
      const f = familyRow(db, anchor.family);
      const el = document.createElement("button");
      el.className = "cell anchor-cell family-cell";
      el.innerHTML = `<span class="glyph">${f?.glyph ?? "▸"}</span><span class="lbl">${f?.name ?? "?"}</span>`;
      el.addEventListener("click", () => {
        if (picking) return;
        if (f?.speaks) speak(f.speaks);
        openExpand(anchor.family);
      });
      grid.appendChild(el);
      continue;
    }
    const c = bySlot.get(slot);
    if (!c) {
      const empty = document.createElement("div");
      empty.className = "cell empty";
      empty.dataset.slot = slot; // a legal drop target in Edit mode
      if (editing) {
        // 014 § 9: an empty cell takes whatever the adult picks — a word
        // or a person — via the place picker.
        empty.setAttribute("role", "button");
        empty.setAttribute("aria-label", "Place a word or person here");
        empty.addEventListener("click", () => placeUi.openPicker(slot));
      } else {
        empty.setAttribute("aria-hidden", "true");
      }
      grid.appendChild(empty);
      continue;
    }
    if (c.kind === "entity") {
      // A person in a home cell (014 § 9): the family's kind color
      // (018 D7 — Yellow until classified), photo when added.
      const el = wordTile({ label: c.label, role: c.fitzgerald_role ?? "Yellow" });
      el.dataset.slot = slot;
      loadPhotoURL(photoFor(c.entity_id)).then((url) => {
        if (!url) return;
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        el.querySelector(".tart").appendChild(img);
        el.classList.add("photo");
      });
      if (editing) {
        // D10: tap asks "what goes here" — the placement sheet. Drag
        // still moves; the ✎ inside the sheet opens the word card.
        editPointer(el, {
          onTap: () => placeUi.openPicker(slot,
            { kind: "entity", id: c.entity_id, label: c.label,
              role: c.fitzgerald_role }),
          onDrop: (to) => {
            const mv = placeOnBoard(db, geom.name, "entity", c.entity_id, to, {
              anchors: new Set(geom.anchors.keys()),
            });
            if (!mv) return;
            renderGrid();
            toast(`Moved ${c.label}`, () => {
              placeOnBoard(db, geom.name, "entity", c.entity_id, mv.from);
              renderGrid();
            });
          },
        });
      } else {
        el.addEventListener("click", () => tap(c.label, "entity", c.entity_id));
      }
      layerMark(el, `entity:${c.entity_id}`, { board: true });
      cellEls.set(c.entity_id, el);
      grid.appendChild(withCount(el, "entity", c.entity_id));
      continue;
    }
    // A hidden word keeps its slot as a ghost tile (Design_System mask
    // tokens — faded, never tappable or spoken); nothing moves into the
    // space (Masking § 2).
    if (masked.has(c.sense_id)) {
      const ghost = wordTile({ label: c.label, role: c.fitzgerald_role, art: metaFor(c.sense_id).art });
      ghost.classList.add("masked");
      ghost.disabled = true;
      grid.appendChild(withCount(ghost, "sense", c.sense_id));
      continue;
    }
    const el = wordTile({ label: c.label, role: c.fitzgerald_role, art: metaFor(c.sense_id).art });
    el.dataset.slot = slot;
    if (editing) {
      // Adult move (014 § 2 ruling 1): drag onto a word swaps, onto an
      // empty slot moves; anchors and reserved slots refuse. D10: a tap
      // opens the placement sheet — ✎ inside it opens the word card.
      editPointer(el, {
        onTap: () => placeUi.openPicker(slot,
          { kind: "sense", id: c.sense_id, label: c.label,
            role: c.fitzgerald_role }),
        onDrop: (to) => {
          const mv = moveCore(db, geom.name, c.sense_id, to, { anchors: new Set(geom.anchors.keys()) });
          if (!mv) return;
          renderGrid();
          toast(`Moved ${c.label}`, () => {
            moveCore(db, geom.name, c.sense_id, mv.from);
            renderGrid();
          });
        },
      });
    } else {
      el.addEventListener("click", () => tap(c.label, "sense", c.sense_id));
    }
    layerMark(el, `sense:${c.sense_id}`, { board: true });
    cellEls.set(c.sense_id, el);
    grid.appendChild(withCount(el, "sense", c.sense_id));
  }
  boardSenseIds = new Set(cells.map((c) => c.sense_id));
  spotChrome();
  fitLabels(grid);
}

/** "Highlight likely next words" (Parent Corner, default OFF): up to
 *  three core cells the ranker invites next get a thicker inner border
 *  in their own role color. Grid only — never while editing, in a
 *  group, or with the keyboard open (the grid isn't visible).
 *
 *  `likelySet` is the layer's halo state (013 § 2, Dual Engine § 7.4):
 *  it rides `layerMark` on every render, so halos survive a grid
 *  repaint instead of vanishing until the next strip paint. */
let highlightNext = false;
let likelySet = new Set();
function applyLikely() {
  const next = new Set();
  if (highlightNext && !editing && view === "board" && !kbUi.isOpen() && sentence.length) {
    const sents = sentence.map((s) => ({ kind: s.kind, id: s.id }));
    for (const c of keyboardContinuations(db, sents, locale, Date.now(), phrases)) {
      if (c.kind !== "sense") continue;
      // A stand-in person on the board takes the word's halo too —
      // Mama's cell glows when `mom` is likely (014 slice 11).
      const id = cellEls.has(c.id) ? c.id : (entityForSense(db, c.id)?.id ?? null);
      if (id === null || !cellEls.has(id)) continue;
      next.add(id);
      if (next.size === 3) break;
    }
  }
  for (const id of new Set([...likelySet, ...next])) {
    const el = cellEls.get(id);
    if (el) el.classList.toggle("likely", next.has(id));
  }
  likelySet = next;
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
    if (picking) {
      setPicking(false);
      return;
    }
    if (editing) {
      setEditing(false);
      rerenderView();
      return;
    }
    if (view === "group") return groupsUi.openGroupIndex();
    if (view === "groupIndex") return kbUi.setView("board");
    if (kbUi.isOpen()) kbUi.closeKb();
    return;
  }
  // Hardware keys work in any mode: a letter or digit opens the keyboard
  // and types itself. Never inside a form field, an open overlay, or a
  // meta/ctrl/alt chord.
  const t = e.target;
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
  if (document.querySelector(".overlay.open")) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const km = keyMap(locale, kbUi.order);
  const devField = $("kb-device");
  if (kbUi.isOpen() && devField) {
    // Device mode with the field unfocused (e.g. after a partner tap):
    // route the keystroke into the field model — a focused field handles
    // its own keys via `input` (filtered above).
    if (e.key.length === 1 || e.key === "Backspace" || e.key === "Enter") {
      e.preventDefault();
      kbUi.feed(e.key);
    }
    return;
  }
  if (e.key === "Backspace" || e.key === " " || e.key === "Enter") {
    if (!kbUi.isOpen()) return;
    e.preventDefault();
    kbUi.press(e.key);
    return;
  }
  if (e.key === "Dead") {
    // a real QWERTZ/AZERTY/Spanish keyboard's dead key arrives as "Dead"
    const dead = resolveKeymap(locale)?.dead;
    if (dead) {
      if (!kbUi.isOpen()) kbUi.openKb();
      kbUi.press(dead);
    }
    return;
  }
  if (e.key.length !== 1) return;
  const ch = e.key.toLowerCase();
  const isDigit = ch >= "0" && ch <= "9";
  const inMap = km ? km.some((k) => (k.kind === "char" || k.kind === "dead") && k.value === ch) : /[\p{L}\p{N}]/u.test(ch);
  if (!inMap && !isDigit) return;
  if (!kbUi.isOpen()) kbUi.openKb();
  if ($("kb-device")) kbUi.feed(e.key);
  else kbUi.press(e.key);
});
$("corner").addEventListener("click", () => {
  if (editing) {
    setEditing(false);
    rerenderView();
    return;
  }
  open("menu");
});
// 018 D10: 📊 puts the child's own 30-day taps on every tile.
$("edit-counts").addEventListener("click", () => {
  countsOn = !countsOn;
  $("edit-counts").classList.toggle("on", countsOn);
  renderGrid();
});
$("edit-groups").addEventListener("click", () => {
  close("menu");
  setEditing(true);
  groupsUi.openGroupIndex();
});
$("add-mywords").addEventListener("click", () => {
  close("menu");
  addUi.openAddForm("grp_my_words");
});

/* Keyboard — public/board/keyboard-ui.js. Highlight stays here: it is
 * a board setting that shares the corner's segmented controls, so this
 * block still paints it through syncSettings. */
const kbProfile = ALL(
  db,
  "SELECT keyboard_mode, keyboard_order, highlight_next FROM learner_profile WHERE id = 'prf_local'",
)[0] ?? {};
highlightNext = (kbProfile.highlight_next ?? 0) === 1;
let groupsUi;
let addUi;
let libUi;
let wordCard;
let editorUi;
const kbUi = mountKeyboard({
  db, locale, profile: kbProfile, all: ALL,
  sentence, getSentenceId: () => sentenceId, ensureSentence,
  startFresh,
  getSentencePicks: () => sentencePicks,
  setSentencePicks: (n) => { sentencePicks = n; },
  speak, speakItem, speakSentence, playClip, renderBar, renderStrip, tap,
  showGroupHint, applyLikely, fitLabels, senseById,
  getHighlightNext: () => highlightNext,
  getView: () => view,
  setViewName: (v) => { view = v; },
  renderGroupIndex: () => groupsUi.renderGroupIndex(),
  renderGroupPage: () => groupsUi.renderGroupPage(),
  renderEditor: () => editorUi.renderEditor(),
});

$("hl-next").addEventListener("click", (e) => {
  const v = e.target.closest("button")?.dataset.v;
  if (v === undefined) return;
  highlightNext = v === "1";
  setSetting(db, "highlight_next", highlightNext ? 1 : 0);
  kbUi.syncSettings();
  applyLikely();
});
/* After Speak — whether the next word adds on or starts a fresh bar. */
function syncFreshSeg() {
  freshAfterSpeak = (ALL(db,
    "SELECT fresh_after_speak AS f FROM learner_profile WHERE id = 'prf_local'",
  )[0]?.f ?? 0) === 1;
  if (!freshAfterSpeak) freshNext = false;
  for (const b of $("fresh-speak").querySelectorAll("button")) {
    b.classList.toggle("on", (b.dataset.v === "1") === freshAfterSpeak);
  }
}
$("fresh-speak").addEventListener("click", (e) => {
  const v = e.target.closest("button")?.dataset.v;
  if (v === undefined) return;
  setSetting(db, "fresh_after_speak", Number(v));
  syncFreshSeg();
});
syncFreshSeg();
/* "Help improve Pip" (016 slice 6) — the research-totals switch. Same
 * synced-setting mechanics as the seg above. */
const syncShareSeg = () => {
  const on = (ALL(db,
    "SELECT share_research AS s FROM learner_profile WHERE id = 'prf_local'",
  )[0]?.s ?? 1) === 1;
  for (const b of $("share-research").querySelectorAll("button")) {
    b.classList.toggle("on", (b.dataset.v === "1") === on);
  }
};
$("share-research").addEventListener("click", (e) => {
  const v = e.target.closest("button")?.dataset.v;
  if (v === undefined) return;
  setSetting(db, "share_research", v === "1" ? 1 : 0);
  syncShareSeg();
  if (v === "1") flushResearch(db); // turning it on sends what's pending
});
syncShareSeg();

/* Spotlight sheet — public/board/spotlight-sheet.js */
mountSpotlightSheet({
  db, catalog, open, close, all: ALL,
  coachLabel: (kind, id) => coachUi.coachLabel(kind, id),
  bindSpotSettings,
  renderGrid, renderStrip, rerenderView, setModeling, setPicking,
  getPicking: () => picking,
  getSpotPulse: () => spotPulse,
  getModelSpeaks: () => modelSpeaks,
});

/* Cells picker — public/board/cells-sheet.js. onSyncApplied repaints this. */
const renderCellsSeg = mountCellsSheet({
  db, catalog, locale, boardGeom, open, close, toast, renderGrid, rerenderView,
});

/* Smart bar family editor — public/board/family-editor.js */
mountFamilyEditor({ db, locale, open, close, toast, resolveTyped: kbUi.resolveTyped });

/* --- permanent utility anchors --- */
$("anchor-kb").addEventListener("click", () => {
  if (kbUi.isOpen()) return kbUi.closeKb(); // the same anchor that opened it closes it
  kbUi.setView("board");
  kbUi.openKb();
  // iOS shows the system keyboard only for a focus inside the user
  // gesture — synchronous, no await before it.
  $("kb-device")?.focus();
});
$("anchor-groups").addEventListener("click", () => groupsUi.openGroupIndex());
$("spot-chip").addEventListener("click", () => {
  endSession(db);
  renderGrid();
  rerenderView();
});

/* Edit mode and the undo toast are shared by the groups pages, the
   library, and the word card. The groups pages themselves live in
   public/board/groups-ui.js. */

/** One mode everywhere: entering Edit marks the body (dashed borders)
 *  and turns the corner button into ✓ Done (its glyph swaps on
 *  body.editing). */
function setEditing(on) {
  editing = on;
  countsOn = countsOn && on; // 📊 leaves with Edit mode
  document.body.classList.toggle("editing", on);
  $("edit-counts").hidden = !on;
  $("edit-counts").classList.toggle("on", countsOn);
  $("corner").title = on ? "Done editing" : "Parent corner";
  $("corner").setAttribute("aria-label", $("corner").title);
  renderGrid(); // the home grid takes edit gestures too (014 slice 3)
  applyLikely();
}

/** Re-render whatever view is on screen after a mode change or write. */
function rerenderView() {
  if (view === "groupIndex") groupsUi.renderGroupIndex();
  else if (view === "group") groupsUi.renderGroupPage();
  else if (view === "editor") editorUi.renderEditor();
  if ($("library").classList.contains("open")) libUi.renderLibrary();
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
        ?.closest("[data-slot]");
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
        ?.closest("[data-slot]");
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
  $("toast-undo").hidden = !undo;
  el.hidden = false;
  $("toast-undo").onclick = () => { el.hidden = true; undo?.(); };
  toastTimer = setTimeout(() => { el.hidden = true; }, 6000);
}

/** "Show on board" marks the cell for a beat after re-render. */
function flashCell(el) {
  if (!el) return;
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 1600);
}

/* Groups board mode — public/board/groups-ui.js */
groupsUi = mountGroups({
  db, locale, all: ALL, boardGeom, getEditing: () => editing, getModelGlow: () => modelGlow,
  getLikelyGroups: () => likelyGroups(
    db, sentence.map((s) => ({ kind: s.kind, id: s.id })),
    Date.now(), locale, phrases),
  setView: (v) => kbUi.setView(v), open, close, toast, wordTile, layerMark, fitLabels, tap,
  navCell, editPointer, xBadge,
  openAddForm: (groupId, cell) => addUi.openAddForm(groupId, cell),
  openWordCard: (item) => wordCard.openWordCard(item),
  loadPhotoURL, savePhoto, syncUploadBlob,
});

/* Add a word — public/board/add-flow.js */
addUi = mountAddFlow({
  db, locale, all: ALL, catalog, open, close, toast,
  savePhoto, syncUploadBlob, loadPhotoURL, artInto,
  invalidateIndex: () => kbUi.invalidateIndex(),
  rerenderView, renderStrip, renderLibrary: () => libUi.renderLibrary(),
});

/* Word library — public/board/library-ui.js */
libUi = mountLibrary({
  db, locale, open, loadPhotoURL, artInto,
  openWordCard: (item) => wordCard.openWordCard(item),
});

/* Word card — public/board/word-card.js */
wordCard = mountWordCard({
  db, locale, all: ALL, open, close, toast,
  metaFor, artInto, loadPhotoURL, savePhoto, syncUploadBlob, speakItem, xBadge,
  invalidateIndex: () => kbUi.invalidateIndex(),
  setView: (v) => kbUi.setView(v),
  rerenderView, renderStrip, renderGrid, flashCell,
  getCell: (id) => cellEls.get(id),
  getGroupKey: () => groupsUi.getGroupKey(),
  setGroup: (id, page) => groupsUi.setGroup(id, page),
  dropEntityPhoto: (id) => entityPhoto.delete(id),
  dropEntityRole: (id) => entityRole.delete(id),
  dropSenseMeta: (id) => senseMeta.delete(id),
});

/* Devices, users, and supporter sign-in — public/board/devices-ui.js */
const devicesUi = mountDevices({
  db, me, saveUser, userStore, flushDb, toast,
  initSync, onSyncApplied, onModel, qrcode, syncRekey,
});

/* The weekly win card and progress dashboard — public/board/wincard-ui.js
 * and progress-ui.js (016 slices 2 and 4). Item ids resolve to names
 * here so the shared modules stay off the label and entity tables. */
const statNameOf = (kind, id) => kind === "entity"
  ? ALL(db, "SELECT spoken_name AS t FROM personal_entity WHERE id = ?", [id])[0]?.t
  : ALL(db, `SELECT text AS t FROM label WHERE sense_id = ?
      AND kind = 'lemma' AND status = 'approved' AND locale = ?`, [id, locale])[0]?.t;
const relayEntitlement = async () =>
  (await devicesUi.userClient().then((u) => u?.client?.selfKey()))?.entitlement;
mountWincard({ db, me, toast, nameOf: statNameOf, entitlement: relayEntitlement });
mountProgress({ db, me, toast, open, nameOf: statNameOf, entitlement: relayEntitlement });

/* The placement sheet (018 D10): Edit mode, tap any tile or an empty
 * cell — the off-board list ranks by the child's own counts, the
 * children table's unigram on day one. The pick writes a placement
 * with an undo toast, same as a drag; ✎ in the head row opens the
 * word card. */
const kidsUni = (() => {
  const uni = {};
  for (const row of Object.values(phrases?.contexts ?? {})) {
    for (const [id, n] of Object.entries(row)) uni[id] = (uni[id] ?? 0) + n;
  }
  return uni;
})();
const placeUi = mountPlacePicker({
  db, locale,
  getLayout: () => boardGeom().name,
  getCounts,
  getUni: () => kidsUni,
  onPick: (slot, kind, id, label) => {
    const mv = placeOnBoard(db, boardGeom().name, kind, id, slot, {
      anchors: new Set(boardGeom().anchors.keys()),
    });
    close("placeform");
    if (!mv) return;
    renderGrid();
    toast(`Placed ${label}`, () => {
      placeOnBoard(db, boardGeom().name, kind, id, mv.from);
      renderGrid();
    });
  },
  onEdit: (item) => {
    close("placeform");
    wordCard.openWordCard({ item_kind: item.kind, item_id: item.id, label: item.label });
  },
});

/* First-open setup (014 § 9 ruling 1): a new user is asked "Who do
 * they call for?" once — up to three people, names now, photos later
 * from each person's card. The entities sync like any other. */
if (me.needsSetup) {
  $("setup-title").textContent = `Who does ${me.name || "your child"} call for?`;
  open("setupform");
}
$("setup-save").addEventListener("click", async () => {
  const names = [...document.querySelectorAll(".setup-name")]
    .map((i) => i.value.trim()).filter(Boolean).slice(0, 3);
  /* 018 slice 3 (D1): the first two people take the mom/dad cells —
   * the people this child calls for, side by side on every layout that
   * has them. A third stays an entity (reachable in My Words). */
  const ids = names.map((name) => createEntity(db, { name }).id);
  seatSetupPeople(db, ids, locale);
  if (names.length) { await flushDb(); renderGrid(); }
  await saveUser({ needsSetup: false });
  close("setupform");
});
$("setup-skip").addEventListener("click", async () => {
  await saveUser({ needsSetup: false });
  close("setupform");
});

/* QR card — public/board/recovery-ui.js */
mountRecovery({
  me, saveUser, userStore, flushDb, toast, qrcode,
  userClient: () => devicesUi.userClient(),
});

/* Web editor — public/board/editor-ui.js */
editorUi = mountEditor({
  db, locale, all: ALL, catalog, boardGeom,
  navCell, fitLabels,
  openAddForm: (groupId, cell) => addUi.openAddForm(groupId, cell),
  itemCell: (item, gKind, ctx) => groupsUi.itemCell(item, gKind, ctx),
  renderLibrary: () => libUi.renderLibrary(),
  invalidateIndex: () => kbUi.invalidateIndex(),
  setView: (v) => kbUi.setView(v),
  toast, close, savePhoto, syncUploadBlob,
});

// A session survives a restart (013 § 4): the synced row lights the
// glow again — unless its timer or midnight passed while away.
resumeSession(db);
renderGrid();
renderBar();
renderStrip();

// Timer/midnight expiry: the row's ends_at is the truth; the layer
// checks it on a slow tick (and on every sync drain) and ends itself.
setInterval(() => {
  const was = !!spotlight();
  resumeSession(db);
  if (was !== !!spotlight()) {
    renderGrid();
    rerenderView();
  }
}, 30000);

// On a wide screen the app opens to the editor (Sync § 7): the Library
// and word card overlays move into the editor panes — same nodes, same
// listeners — and the Library is always open there.
if (matchMedia("(min-width: 1100px)").matches) {
  $("ed-left").prepend($("library"));
  $("ed-right").prepend($("wordcard"));
  $("menu-editor").hidden = false;
  open("library");
  kbUi.setView("editor");
}

// Console handle for works tests and founder debugging — read-only access
// to the live db and resolved profile. Product truth still flows through
// the functions above; this exposes, it does not own.
window.pip = {
  db,
  catalog,
  locale,
  audio,
  get user() { return me; },
  users: () => listUsers(userStore),
  flushDb,
  repaint() { renderGrid(); renderStrip(); rerenderView(); },
  spotlight: {
    start(targets, name) {
      const r = startSpotlight(db, targets, name);
      renderGrid(); rerenderView();
      return r;
    },
    end() { endSpotlight(); renderGrid(); rerenderView(); },
    get active() { return spotlight(); },
    startSession(opts) {
      const r = startSession(db, opts);
      renderGrid(); rerenderView();
      return r;
    },
    endSession() { endSession(db); renderGrid(); rerenderView(); },
    resume() { const r = resumeSession(db); renderGrid(); rerenderView(); return r; },
    get session() { return spotSession(db); },
    lists: () => spotLists(db),
    listTargets: (id) => [...listTargets(db, id)],
    saveList: (name, targets) =>
      saveSpotList(db, `spl_${crypto.randomUUID().replaceAll("-", "")}`, name, targets),
    deleteList: (id) => { deleteSpotList(db, id); },
    get picking() { return picking ? [...picking] : null; },
    get modeling() { return modeling; },
    get modelGlow() { return [...modelGlow.keys()]; },
  },
  get sentence() {
    return sentence.map((i) => ({ ...i }));
  },
  get kbText() {
    return kbUi.text;
  },
  get kbOpen() {
    return kbUi.isOpen();
  },
};
