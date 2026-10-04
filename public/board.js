/**
 * Board runtime: renders grid60 from the on-device SQLite, sentence bar,
 * groups, and the name+photo add flow. Catalog senses speak via bundled
 * clips (schema §7); personal entities use device TTS.
 */
import { bootDb, exportLegacyKvvfsDb, savePhoto, loadPhotoURL } from "./db.js";
import {
  closeSentence,
  detachEvent,
  fillChosen,
  logImpression,
  likelyGroups,
  logSelection,
  openSentence,
} from "./shared/funnel.mjs";
import {
  deleteSpotList, endSession, endSpotlight,
  listTargets,
  resumeSession, saveSpotList, spotLists, spotlight,
  spotlightGroups, spotSession, startSession, startSpotlight,
} from "./shared/spotlight.mjs";
import { displaySentence, keyMap, resolveKeymap } from "./shared/keyboard.mjs";
import { resolveProfile } from "./shared/profile.mjs";
import {
  groupIndex,
  removeItem,
  replaceGroupItem,
  setSetting,
} from "./shared/groups.mjs";
import { setDeviceId } from "./shared/ops.mjs";
import { redeemLicense } from "./shared/account.mjs";
import { getDeviceIdentity, openKeyStore } from "./shared/sync_crypto.mjs";
import { initSync, syncHealth, syncRekey, syncSendLive, syncSendModel, syncUploadBlob } from "./shared/sync.mjs";
import { refreshStatsDays } from "./shared/stats.mjs";
import { followProfileName, nameToProfile as nameToProfileDb } from "./shared/person_name.mjs";
import { flushResearch } from "./shared/research.mjs";
import { mountWincard } from "./board/wincard-ui.js";
import { mountProgress } from "./board/progress-ui.js";
import {
  addUser, listUsers, migrateLegacy, openUserStore, putUser,
  resolveActiveUser, touchOpened,
} from "./shared/users.mjs";
import { voiceName } from "./shared/voices.mjs";

import {
  applyTransform, noteBarEdit, restoreBar,
} from "./shared/txbar.mjs";
import { EOS, formFor } from "./shared/forms.mjs";
import { expressiveOn, loadFeelingData } from "./shared/feeling.mjs";
import { barControls } from "./shared/bar.mjs";

import { coreCells, placeOnBoard } from "./shared/coremove.mjs";
import { useCounts } from "./shared/usecounts.mjs";
import { bindLayouts } from "./shared/movecost.mjs";
import { mountCellsSheet } from "./board/cells-sheet.js";
import { mountSpotlightSheet } from "./board/spotlight-sheet.js";
import { mountSpotlightDemo } from "./board/spotlight-demo.js";
import { mountKeyboard } from "./board/keyboard-ui.js";
import { mountGroups } from "./board/groups-ui.js";
import { mountAddFlow } from "./board/add-flow.js";
import { mountLibrary } from "./board/library-ui.js";
import { mountWordCard } from "./board/word-card.js";
import { mountDevices } from "./board/devices-ui.js";
import { checkoutFromUrl, orderFromUrl, purchasedFromUrl, unlicensedFromUrl, unlockFromUrl } from "./board/unlock.js";
import { mountPlacePicker } from "./board/place-ui.js";
import { mountSetup } from "./board/setup-ui.js";
import { mountRecovery } from "./board/recovery-ui.js";
import { mountEditor } from "./board/editor-ui.js";
import { mountCoach } from "./board/coach-ui.js";
import { mountFamilyEditor } from "./board/family-editor.js";
import { mountSettings } from "./board/settings-ui.js";
import { mountPeople, pickPerson, takeReopen } from "./board/people-ui.js";
import { mountGroupShows } from "./board/group-shows.js";
import { installViewportPin } from "./board/viewport.js";
import { mountOnramp } from "./board/onramp-ui.js";
import { mountTour } from "./board/tour-ui.js";
import { showVersion } from "./board/version.js";
import { mountVoice } from "./board/voice-ui.js";
import { mountLifetime, mountTrialClock } from "./board/lifetime-ui.js";
import { mountPictureFill } from "./board/picture-fill.js";
import { mountSpeech } from "./board/speech.js";
import { mountSpotlightLayer } from "./board/spotlight-layer.js";
import { mountPin } from "./board/pin.js";
import { mountEditShared } from "./board/edit-shared.js";
import { mountMetaCache } from "./board/meta-cache.js";
import { mountSettingsSync } from "./board/settings-sync.js";
import { mountGrid } from "./board/grid.js";
import { mountStrip } from "./board/strip.js";
import { pictureClient } from "./shared/pictures.mjs";
import qrcode from "../vendor/qrcode.mjs";

const $ = (id) => document.getElementById(id);
installViewportPin();
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
  // needsSetup arms the same "Who do they call for?" first-open that a
  // Parent-Corner add gets (014 § 9 ruling 1, 019 blocker 2).
  me = await addUser(userStore, { home: true, needsSetup: true });
}
if (!me) me = await pickPerson(users, loadPhotoURL); // shared device, no home — ask
sessionStorage.setItem("pip_active_user", me.id);
await touchOpened(userStore, me.id);
let nameToProfile = () => {}; // set once the db is open (below)
const saveUser = async (patch) => {
  Object.assign(me, patch);
  await putUser(userStore, me);
  nameToProfile(patch);
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

const { db, catalog, flush: flushDb, loadLanguage } = await bootDb(userStore, me.id);
// 041 B3 — the language tables load after the first frame; until they
// land a tap speaks the base word and the strip uses her own history.
let phrases = null, formTable = null;

// The person's name syncs (public/shared/person_name.mjs).
nameToProfile = (patch) => nameToProfileDb(db, patch);
const followName = () => followProfileName(db, me, saveUser);
await followName();
// 025: the lit-face map — catalog.feelingVoice when the Ara rebuild
// ships it, /feeling_voice.json until then.
const feelingData = await loadFeelingData(catalog);
let expressiveVoice = expressiveOn(db);
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
  followName().then(() => peopleUi.follow()).catch(() => {}); // names, photos
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
    syncGrammarSeg();    // Grammar help syncs like the other segs
    syncLook();          // Words only syncs too
    syncBarSeg();        // the bar's button set syncs too (038)
    voiceId = resolveProfile(db).voiceId; // a voice chosen on another device
    syncSpeed();
    voiceUi.renderRow();
    bindSpotSettings();  // spotlight settings sync too
    if (!spotDemo) resumeSession(db); // a session started/ended elsewhere lands here
    renderCellsSeg();    // a Cells change may have landed
    renderGrid();
    renderStrip();
    rerenderView();
  }, 150);
}

initSync(db, me, saveUser, location.origin, onSyncApplied, (m) => attention.onModel(m))
  .then(async (sync) => {
    if (!sync) return;
    // § 11 warning channel: a linked device returning inside the final
    // window (or while a deletion is pending) hears about it once.
    const self = await sync.client.selfKey().catch(() => null);
    if (self?.delete_at) {
      toast(`This user is scheduled for deletion on ${new Date(self.delete_at).toLocaleDateString()} — Settings → Backup & privacy → Undo deletion.`);
    } else if (self?.idle_delete_at) {
      toast(`This user has not synced in a long time and may be removed on ${new Date(self.idle_delete_at).toLocaleDateString()}.`);
    }
    // § 9 honest message: a free-user restore unlinked the other
    // devices — the card holder hears it on first boot.
    if (sessionStorage.getItem("pip_restore_moved")) {
      sessionStorage.removeItem("pip_restore_moved");
      toast("Restored — on a free user the other devices were unlinked. "
        + "Relink them from Settings → Team & devices.");
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
const { locale } = resolveProfile(db);
// The board's voice (Settings → Talking → Voice); a synced change re-resolves it.
let { voiceId } = resolveProfile(db);
/* 041 A2 — tell the service worker which voice this person speaks with,
 * so its clips fill their `pip-audio-<voice>` cache in the background.
 * Fires once the SW controls the page; every voice switch re-announces. */
const announceVoice = () => {
  navigator.serviceWorker?.ready
    .then((reg) => reg.active?.postMessage({ type: "pip-active-voice", voice: voiceId }))
    .catch(() => {});
};
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
let grammarHelp = true; // synced from learner_profile by settings-sync.js
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
function maybeImpression(candidates, shown, { mode = "picture", cap = null, gate = null } = {}) {
  if (sentenceId === null) return false;
  const shownKeys = shown.map((c) => `${c.kind}:${c.id}`);
  const key = `${sentenceId}:${sentencePicks}:${shownKeys.join()}`;
  if (key === lastImpressionKey) return false;
  lastImpressionKey = key;
  openImpressionId = logImpression(db, {
    sentenceId, position: sentencePicks,
    candidates, shown: shownKeys,
    mode, gate, shortlistCap: cap,
  });
  return true;
}
// Try it (032 C) while it runs: { onTap, end } from spotlight-demo.js.
// A tap then speaks and nothing else — the adult's taps are not logged.
let spotDemo = null;
let demoBar = null; // the child's bar, set aside while Try it runs
let view = "board";    // 'board' | 'groupIndex' | 'group' — groups are a board mode, not a modal
let editing = false; // caregiver Edit mode — same gesture on index and pages
let countsOn = false; // 018 D10: the 📊 badge — the child's own 30-day taps
// 040: the 7-day trial — endsAt in ms while unlicensed; the server is
// the truth and speech.js mirrors it into these for UI reads.
let trialEndsAt = null;
let trialLicensed = false;
const getCounts = () => useCounts(db);

// 023: the bar's current shape — which tense it holds and whether it
// is a question — drives the trio's selected state. Reset whenever
// the bar empties (clear, backspace, after-speak fresh start).
const barState = { tense: "present", question: false, preTransform: null };
/** 023: which tense the bar holds — exactly one trio member wears ink;
 *  ❓ lights while the bar is a question; the model buttons grey out
 *  offline (▶ never does — speaking never needs the network). */
function syncTxButtons() {
  const trio = { past: "tx-past", present: "speak", future: "tx-future" };
  for (const [t, id] of Object.entries(trio)) {
    $(id).classList.toggle("sel", barState.tense === t);
  }
  $("tx-question").classList.toggle("sel", barState.question);
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  for (const id of ["tx-fix", "tx-question", "tx-past", "tx-future"]) {
    $(id).classList.toggle("offline", offline);
    // In pick mode ✨ / ❓ are choosable targets, with or without words.
    const pickable = !!attention.picking && (id === "tx-fix" || id === "tx-question");
    $(id).disabled = !pickable && (!sentence.length || (offline && !tour));
  }
}
addEventListener("online", () => { syncTxButtons(); renderStrip(); });
addEventListener("offline", () => { syncTxButtons(); renderStrip(); });

/* The first-run demo (public/board/tour-ui.js) owns taps, the Smart bar
 * and the transform buttons while it runs — its taps never reach the
 * tap log, stats or the ranker. Null the rest of the time. */
let tour = null;

/** sense_id → its grid element, for the likely-next halo pass. */
const cellEls = new Map();

/* Shared scalars cross module boundaries through `live` — the mounted
 * modules (speech, strip) read and write the board's real state. Object
 * refs (sentence, barState, cellEls) are shared directly. */
const live = {
  get voiceId() { return voiceId; },
  get sentenceId() { return sentenceId; },
  set sentenceId(v) { sentenceId = v; },
  get sentencePicks() { return sentencePicks; },
  set sentencePicks(v) { sentencePicks = v; },
  get freshAfterSpeak() { return freshAfterSpeak; },
  set freshAfterSpeak(v) { freshAfterSpeak = v; },
  get freshNext() { return freshNext; },
  set freshNext(v) { freshNext = v; },
  get lastImpressionKey() { return lastImpressionKey; },
  set lastImpressionKey(v) { lastImpressionKey = v; },
  get openImpressionId() { return openImpressionId; },
  set openImpressionId(v) { openImpressionId = v; },
  get grammarHelp() { return grammarHelp; },
  set grammarHelp(v) { grammarHelp = v; },
  get formTable() { return formTable; },
  get phrases() { return phrases; },
  get tour() { return tour; },
  get spotDemo() { return spotDemo; },
  get picking() { return attention.picking; },
  get view() { return view; },
  get editing() { return editing; },
  get modeling() { return attention.modeling; },
  childTap: (key) => attention.childTap(key),
  get coachUi() { return coachUi; },
  get settingsUi() { return settingsUi; },
  get expressiveVoice() { return expressiveVoice; },
  set expressiveVoice(v) { expressiveVoice = v; },
  get kbUi() { return kbUi; },
  get groupsUi() { return groupsUi; },
  get editorUi() { return editorUi; },
  get placeUi() { return placeUi; },
  get countsOn() { return countsOn; },
  set countsOn(v) { countsOn = v; },
  get trialEndsAt() { return trialEndsAt; },
  set trialEndsAt(v) { trialEndsAt = v; },
  get trialLicensed() { return trialLicensed; },
  set trialLicensed(v) { trialLicensed = v; },
  set editing(v) { editing = v; },
  get highlightNext() { return highlightNext; },
  get boardSenseIds() { return boardSenseIds; },
  set boardSenseIds(v) { boardSenseIds = v; },
  get movedSet() { return movedSet; },
  set movedSet(v) { movedSet = v; },
  get likelySet() { return likelySet; },
  set likelySet(v) { likelySet = v; },
};

/* Read-through metadata caches — public/board/meta-cache.js. The Maps
 * come back so the sync drain can clear them wholesale. */
const {
  senseMeta, wordArt, entityRole, entityPhoto, sensePos,
  metaFor, artForWord, roleForEntity, photoFor, posOfSense, senseById, artUrlOf,
} = mountMetaCache({ db, locale });

/* Speech, tile voices, transforms — public/board/speech.js. */
const {
  speak, speakItem, speakSentence, speakFeeling, transformAndSpeak,
  playClip, playBlob, endPlaying, sayClip,
  tileApi, tileSweep, voiceLicense, syncSpeed, refreshTrial, trialNudge,
  trialActive, entitledNow, resetLicense,
  audio, sentenceVoice, isTxBusy, SPEAK_VOICE_WAIT_MS,
} = mountSpeech({
  db, me, locale, sentence, barState, live,
  renderBar, rerenderView,
  renderGrid: (...a) => renderGrid(...a), // grid mounts below — lazy
  renderStrip: (...a) => renderStrip(...a), // strip mounts below — lazy
  scheduleStatsRefresh, artForWord, syncTxButtons, toast: (...a) => toast(...a),
  openSettings: (sec) => gatePin(() => settingsUi.open(sec)), // mounts below — lazy
});

/* Spotlight attention layer: marks, pick mode, model glows, chrome —
 * public/board/spotlight-layer.js. */
const attention = mountSpotlightLayer({
  db, live, isSupporter: () => me.role === "partner", sendLive: syncSendLive,
  speakItem, syncTxButtons, rerenderView,
  renderGrid: (...a) => renderGrid(...a), // grid mounts below — lazy
});
const {
  layerMark, bindSpotSettings, updatePickBar, setPicking,
  onModel, spotChrome, controlPress, modelSent, modelGlow,
} = attention;

/* Edit mode, undo toast, shared cell helpers — public/board/edit-shared.js. */
const {
  setEditing, navCell, editPointer, xBadge, undoLast, toast, flashCell,
} = mountEditShared({
  live, syncCorner,
  renderGrid: (...a) => renderGrid(...a), // grid mounts below — lazy
  applyLikely: (...a) => applyLikely(...a),
});

/* Settings PIN gate + overlay helpers — public/board/pin.js. */
const pin = mountPin({ live, toast });
const { open, close, gatePin, renderPinRow } = pin;

/* Grid render, tile primitives, likely-next halo — public/board/grid.js. */
const {
  renderGrid, boardGeom, wordTile, artInto, fitLabels,
  homeTile, tileForSense, applyLikely, showGroupHint,
} = mountGrid({
  db, locale, catalog, sentence, live, cellEls,
  speak, tileApi,
  tap, shownLabel, metaFor, photoFor, senseById,
  getCounts, editPointer, toast, layerMark, spotChrome,
  sizeStrip: (...a) => sizeStrip(...a), // strip mounts below — lazy
  openExpand: (...a) => openExpand(...a),
});

/* Prediction strip, feeling faces, expand mode — public/board/strip.js. */
const {
  renderStrip, sizeStrip, openExpand, clearExpand,
} = mountStrip({
  db, locale, catalog, feelingData, sentence, live,
  speak, speakFeeling,
  tap, shownLabel, metaFor, roleForEntity, posOfSense,
  artInto, fitLabels, applyLikely, boardGeom,
  ensureSentence, maybeImpression,
});

/* Settings-synced seg controls — public/board/settings-sync.js. */
const { syncFreshSeg, syncGrammarSeg, syncExpressiveSeg, syncLook, setLook, syncBarSeg } =
  mountSettingsSync({
    db, live, toast, sampleVoice,
    renderBar, renderGrid, renderStrip, rerenderView,
  });

/* Grammar help (021): every place a sense's label is PAINTED for the
 * child — grid cell, strip tile, group cell — shows the form the
 * sentence calls for; what she taps is what the item wears and says.
 * Lemma labels rule while editing (caregivers see canonical words) and
 * when the setting is off. */
function shownLabel(senseId, fallback) {
  if (!grammarHelp || editing) return fallback;
  return formFor(db, formTable, sentence, senseId).text ?? fallback;
}

function renderBar() {
  const bar = $("bar");
  const barBtns = $("bar-btns");
  bar.innerHTML = "";
  bar.appendChild(barBtns); // innerHTML detached the button dock — re-seat it last
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
    } else if (item.art) {
      // Typed word that resolved to a catalog sense (post-transform)
      const img = document.createElement("img");
      img.alt = "";
      if (artInto(img, item.art)) chip.classList.add("photo");
      ar.appendChild(img);
    }
    bar.insertBefore(chip, barBtns);
  });
  if (kbUi.text) {
    const p = document.createElement("span");
    p.className = "partial";
    p.textContent = kbUi.text + "▌";
    bar.insertBefore(p, barBtns);
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
    bar.insertBefore(img, barBtns);
    bar.insertBefore(note, barBtns);
  }
  $("clear").disabled = !sentence.length && !kbUi.text;
  $("backspace").disabled = !sentence.length && !kbUi.text;
  $("speak").disabled = !sentence.length;
  if (!sentence.length) {
    barState.tense = "present"; barState.question = false;
    barState.preTransform = null; // nothing to restore to
  }
  syncTxButtons();
  bar.scrollLeft = bar.scrollWidth; // the newest word stays in view
}
$("bar").addEventListener("click", (e) => {
  // The in-bar Backspace/Clear have their own jobs — their taps never
  // speak the sentence. Mid-transform the press would read the stale
  // bar aloud; the transform speaks the new one moments later.
  if (e.target.closest("#bar-btns")) return;
  if (sentence.length && !isTxBusy()) speakSentence();
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
  noteBarEdit(barState);
  kbUi.text = "";
  renderBar();
  renderGrid();
  renderStrip();
});
/* 023 transform buttons: every press produces audio. ▶ speaks the bar
 * as built; while a transform holds it restores her saved taps first —
 * no model call, works offline, her exact words (§ 1d). */
$("speak").addEventListener("click", () => {
  // txBusy: a transform is mid-flight and speaks on landing — a press
  // now would read the pre-transform bar aloud.
  if (!sentence.length || isTxBusy()) return;
  if (restoreBar(sentence, barState)) {
    renderBar();
    renderStrip();
  }
  speakSentence();
});
$("tx-fix").addEventListener("click", () => {
  if (controlPress("fix")) return;
  transformAndSpeak("fix");
});
$("tx-question").addEventListener("click", () => {
  if (controlPress("question")) return;
  if (isTxBusy()) return;
  // § 4.1: ❓ on an existing question just re-speaks it.
  if (barState.question) speakSentence();
  else transformAndSpeak("question");
});
$("tx-past").addEventListener("click", () => {
  if (isTxBusy()) return;
  if (barState.tense === "past") speakSentence();
  else transformAndSpeak("past");
});
$("tx-future").addEventListener("click", () => {
  if (isTxBusy()) return;
  if (barState.tense === "future") speakSentence();
  else transformAndSpeak("future");
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
    noteBarEdit(barState);
    if (last?.id && sentenceId !== null && sentencePicks > 0) {
      detachEvent(db, sentenceId, sentencePicks - 1);
      sentencePicks--;
    }
  }
  renderBar();
  renderGrid();
  renderStrip();
});


function tap(text, kind = "sense", id = null, { hint = false, source = "grid" } = {}) {
  if (tour) return tour.onTap(kind, id);
  if (spotDemo) {
    // Try it: a tap speaks; on the ✨ card it also builds the bar — never
    // the tap log, the sentence row, or the ranker (the bar was set aside).
    if (id && spotDemo.buildsBar?.()) {
      sentence.push({ kind, id, text });
      noteBarEdit(barState);
      renderBar();
      syncTxButtons();
    }
    if (id) speakItem({ kind, id, text });
    spotDemo.onTap(kind, id);
    return;
  }
  if (attention.picking) {
    // Pick mode: a tap chooses a target, never speaks or appends.
    if (id) {
      const key = `${kind}:${id}`;
      attention.picking.has(key) ? attention.picking.delete(key) : attention.picking.add(key);
      updatePickBar();
      renderGrid();
      rerenderView();
    }
    return;
  }
  if (attention.modeling) {
    // A supporter's spotlight: a tap lights the word on the child's board
    // — never speaks or appends here; the adult's voice is the audio.
    if (id) {
      const key = `${kind}:${id}`;
      syncSendModel(key, text);
      coachUi.onModeled(kind, id);
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
  // Lit when pressed? (Progress's "with the glow"); ends a modeled
  // light and tells the supporter's devices during a session.
  const lit = id ? attention.childTap(`${kind}:${id}`) : false;
  // 021: the sense keeps its identity — only its label changes. A form
  // pick (wants, him) stores the KEPT sense id plus the label she saw
  // and heard; merged tiles (the 'him' cell) carry their fixed form.
  let item = { kind, id, text };
  if (kind === "sense" && id && grammarHelp) {
    const f = formFor(db, formTable, sentence, id);
    item = { kind: "sense", id: f.senseId, text: f.text ?? text,
      labelId: f.labelId, fixed: f.merged, features: f.features };
  }
  clearExpand(); // any pick returns the bar to Predict (014 § 5)
  startFresh();
  sentence.push(item);
  noteBarEdit(barState);
  revisitPrev(sentence.length - 1); // decision 4: the next word may re-pick the last one
  renderBar();
  speakItem(item);
  if (id) {
    ensureSentence();
    fillChosen(db, sentenceId, { kind, id: item.id ?? id, source });
    logSelection(db, kind, item.id ?? id, Date.now(), {
      sentenceId, position: sentencePicks++, source,
      spotlit: lit,
      labelId: item.labelId ?? null,
      groupId: view === "group" ? groupsUi.getGroupKey() : null,
    });
  }
  if (hint && id) showGroupHint(kind, item.id ?? id);
  renderGrid(); // cells wear the new context's forms
  rerenderView(); // a group page's cells repaint too
  renderStrip();
}

/** Grammar help, decision 4 (021 §7): the word at `atIndex` settles the
 *  one before it — "what do" + he -> does. Re-picks the previous sense
 *  item only (her fixed form picks and typed words never move); a
 *  changed form rewrites the bar item and the log row's label. */
function revisitPrev(atIndex) {
  if (!grammarHelp || atIndex < 1) return;
  const prev = sentence[atIndex - 1];
  const cur = sentence[atIndex];
  // 022: a name + a noun wears 's — "Leo car" reads "Leo's car". Entity
  // text only (the device voice says the name as always); the corpus
  // rule is the same as people nouns — a noun follows, so it's a whose.
  if (prev.kind === "entity" && cur?.kind === "sense" && cur.id
      && posOfSense(cur.id) === "Noun" && !prev.text.endsWith("'s")) {
    prev.text = `${prev.text}'s`;
    return;
  }
  if (prev.kind !== "sense" || !prev.id || prev.fixed) return;
  const f = formFor(db, formTable, sentence.slice(0, atIndex - 1), prev.id, cur);
  if (f.text === prev.text) return;
  prev.text = f.text;
  prev.labelId = f.labelId;
  prev.features = f.features;
  if (sentenceId !== null) {
    // Positions follow the seated logged picks — count them up to prev.
    const pos = sentence.slice(0, atIndex - 1).filter((it) => it.id).length;
    RUN(db,
      "UPDATE learner_event_log SET label_id = ? WHERE sentence_id = ? AND position = ?",
      [f.labelId, sentenceId, pos]);
  }
}

/** The sense ids the home grid rendered — `spotChrome` walks routes
 *  against it from any view. */
let boardSenseIds = new Set();

/* The supporter's side of a spotlight — public/board/coach-ui.js. */
const coachUi = mountCoach({
  db, locale, all: ALL, catalog, me,
  repaint: () => { renderGrid(); rerenderView(); },
});


/** Transition-highlight marks (014 § 4): refreshed each grid render so
 *  an accepted Cells change glows immediately and expired marks drop. */
let movedSet = new Set();

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
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const anyOverlay = document.querySelector(".overlay.open");
    if (anyOverlay) {
      document.querySelectorAll(".overlay.open").forEach((o) => o.classList.remove("open"));
      return;
    }
    if (attention.picking) {
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
/* Settings — public/board/settings-ui.js owns the page navigation;
 * every control inside keeps its own module's wiring. */
const settingsUi = mountSettings({
  me, open,
  facts: () => ({
    entities: ALL(db, "SELECT count(*) AS n FROM personal_entity")[0]?.n ?? 0,
    // Invested: something of theirs is on the board — people, words,
    // groups, pictures, hidden or moved words, saved practice lists.
    // Settings flips and the demo don't count.
    invested: (ALL(db, "SELECT count(*) AS n FROM personal_entity")[0]?.n ?? 0) > 0
      || !!ALL(db, `SELECT 1 AS x FROM sync_op WHERE kind IN ('create_entity',
        'set_entity_photo', 'create_group', 'add_to_groups', 'place_item', 'move_item',
        'swap_items', 'set_image_override', 'set_override', 'set_mask', 'rename_entity',
        'set_family_items', 'spot_list_save', 'set_group_hidden', 'move_group', 'swap_groups', 'reorder_groups',
        'delete_group') LIMIT 1`)[0],
    pinOn: pin.pinOn,
    spot: { session: spotSession(db), lists: spotLists(db).length },
  }),
  // 040: the Lifetime page's countdown — the nav item's subtitle and
  // its accent styling read this; the server is the truth.
  trial: () => ({ licensed: trialLicensed, endsAt: trialEndsAt }),
});
settingsUi.onOpen(renderPinRow);
// 040: refresh the trial state on open, then repaint the summaries —
// the fetch lands after renderNav's first paint.
settingsUi.onOpen(() => {
  refreshTrial().then((ok) => { if (ok) { trialClock.syncTrialVoice(); settingsUi.renderNav(); } });
});
// Set only by the post-switch reopen below: the corner click then skips
// the PIN (it was just entered in this tab) and opens that page, so every
// module's corner-click refresh runs as on a normal open.
let reopenSection = null;
$("corner").addEventListener("click", () => {
  if (reopenSection) {
    const section = reopenSection;
    reopenSection = null;
    settingsUi.open(section);
    return;
  }
  // 027 B5: while a group or the index is open the corner is Home — one
  // action back to the home board, outside the grid. In Edit mode it
  // keeps editing, so the home board is one tap away; Done is the home
  // board's corner.
  if (view === "group" || view === "groupIndex") {
    kbUi.setView("board");
    return;
  }
  if (editing) {
    setEditing(false);
    rerenderView();
    return;
  }
  gatePin(() => settingsUi.open());
});
/** The corner's job and label follow the mode: Home while a group or the
 *  index is open, else ✓ Done while editing, else Parent corner (its
 *  glyph swaps on body.groups / body.editing). */
function syncCorner() {
  const inGroups = view === "group" || view === "groupIndex";
  $("corner").title = inGroups ? "Home" : editing ? "Done editing" : "Settings";
  $("corner").setAttribute("aria-label", $("corner").title);
  // Groups toggles like Keyboard: on the groups screen the anchor offers
  // the way back — the label names the destination, never where you are.
  const onIndex = view === "groupIndex";
  $("anchor-groups").querySelector("span:last-child").textContent = onIndex ? "Board" : "Groups";
  $("anchor-groups").title = onIndex ? "Board" : "Groups";
  // 027 B5: Add sits beside Groups, in Edit mode only.
  $("anchor-add").hidden = !(editing && inGroups);
  sizeStrip(boardGeom().cols);
}
$("anchor-add").addEventListener("click", () => {
  if (view === "group") addUi.openAddForm(groupsUi.getGroupKey());
  else if (view === "groupIndex") open("groupform");
});
// 018 D10: 📊 puts the child's own 30-day taps on every tile.
$("edit-counts").addEventListener("click", () => {
  countsOn = !countsOn;
  $("edit-counts").classList.toggle("on", countsOn);
  renderGrid();
});
// 031 G: one editor on every screen — "Edit the board" opens it; wide
// screens get side room, narrow ones a drawer and a bottom sheet. From
// inside the editor it just closes Settings: the editor keeps its place.
$("edit-groups").addEventListener("click", () => {
  close("menu");
  if (view !== "editor") kbUi.setView("editor");
});
// The editor's gear: Settings through the same PIN gate as the board's
// corner — the editor is never a way around the PIN. Settings opens over
// the editor; closing it returns to the same place.
$("ed-settings").addEventListener("click", () => gatePin(() => settingsUi.open()));
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
  db, locale, profile: kbProfile, all: ALL, childTap: (key) => attention.childTap(key),
  sentence, getSentenceId: () => sentenceId, ensureSentence,
  startFresh,
  getSentencePicks: () => sentencePicks,
  setSentencePicks: (n) => { sentencePicks = n; },
  speak, speakItem, speakSentence, playClip, renderBar, renderStrip, tap,
  isTxBusy,
  showGroupHint, applyLikely, fitLabels, senseById, tileFor: tileForSense,
  grammar: {
    on: () => grammarHelp,
    forSense: (ctxItems, senseId, nextItem = null) =>
      formFor(db, formTable, ctxItems, senseId, nextItem),
    revisit: (index) => revisitPrev(index),
  },
  // 028 § 5.6: a committed typed word mints in the background — never
  // per keystroke.
  tileEnsure: (text, opts) => tileApi.ensure(text, opts),
  getHighlightNext: () => highlightNext,
  getView: () => view,
  // Every view change repaints the bar: opening a group is intent — the
  // group bar must appear on that tap, before anything inside is picked;
  // leaving returns the main rule.
  setViewName: (v) => {
    const was = view;
    view = v;
    if (was === "editor" && v !== "editor") editorUi?.leave();
    syncCorner();
    renderStrip();
  },
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
/* Try it — public/board/spotlight-demo.js. */
const spotDemoUi = mountSpotlightDemo({
  db,
  tileFor: tileForSense,
  board: {
    // The child's bar is set aside while Try it runs and comes back after:
    // demo words never join her sentence, and hers never reach the demo.
    setDemo: (h) => {
      if (h && !spotDemo) {
        demoBar = { items: sentence.splice(0), sentenceId, sentencePicks, bar: { ...barState } };
        sentenceId = null;
        sentencePicks = 0;
        noteBarEdit(barState); // no tense, no question, no snapshot of hers
      } else if (!h && demoBar) {
        sentence.splice(0, sentence.length, ...demoBar.items);
        ({ sentenceId, sentencePicks } = demoBar);
        Object.assign(barState, demoBar.bar);
        demoBar = null;
      }
      spotDemo = h;
      renderBar();
      syncTxButtons();
      renderStrip();
    },
    showBoard: () => { close("menu"); if (view !== "board") kbUi.setView("board"); },
    repaint: () => { renderGrid(); rerenderView(); },
    // What the bar says right now — the card shows taps → result.
    barText: () => sentence.map((it) => it.text).join(" "),
    // A word's tile on the board, so a card never covers it.
    cellEl: (senseId) => cellEls.get(senseId) ?? null,
    // The move card's words leave the bar when the demo moves on.
    clearBar: () => {
      sentence.length = 0;
      noteBarEdit(barState);
      renderBar();
      syncTxButtons();
      renderStrip();
    },
  },
  openSettings: (section) => gatePin(() => settingsUi.open(section)),
});

/* Spotlight page — public/board/spotlight-sheet.js */
mountSpotlightSheet({
  db, catalog, me, open, close, all: ALL, tileFor: tileForSense,
  coachLabel: (kind, id) => coachUi.coachLabel(kind, id),
  bindSpotSettings,
  renderGrid, renderStrip, rerenderView, setPicking,
  getPicking: () => attention.picking,
  getSpotPulse: () => attention.spotPulse,
  getModelSpeaks: () => attention.modelSpeaks,
  onSettingsOpen: settingsUi.onOpen,
  openSettings: (section) => gatePin(() => settingsUi.open(section)),
  startDemo: () => spotDemoUi.start(),
});

/* Cells picker — public/board/cells-sheet.js. onSyncApplied repaints this. */
const renderCellsSeg = mountCellsSheet({
  db, catalog, locale, boardGeom, open, close, toast, renderGrid, renderStrip, rerenderView,
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
$("anchor-groups").addEventListener("click", () =>
  view === "groupIndex" ? kbUi.setView("board") : groupsUi.openGroupIndex());
$("spot-chip").addEventListener("click", () => {
  if (spotDemo) return spotDemo.end();
  endSession(db);
  renderGrid();
  rerenderView();
});

/** Re-render whatever view is on screen after a mode change or write. */
function rerenderView() {
  if (view === "groupIndex") groupsUi.renderGroupIndex();
  else if (view === "group") groupsUi.renderGroupPage();
  else if (view === "editor") editorUi.renderEditor();
  if ($("library").classList.contains("open")) libUi.renderLibrary();
}

/* Groups board mode — public/board/groups-ui.js */
groupsUi = mountGroups({
  db, locale, all: ALL, boardGeom, getEditing: () => editing, getModelGlow: () => modelGlow,
  isSupporter: () => me.role === "partner",
  getLikelyGroups: () => likelyGroups(
    db, sentence.map((s) => ({ kind: s.kind, id: s.id })),
    Date.now(), locale, live.phrases),
  setView: (v) => kbUi.setView(v), open, close, toast, wordTile, layerMark, fitLabels, tap,
  shownLabel,
  navCell, editPointer, xBadge,
  openAddForm: (groupId, cell) => addUi.openAddForm(groupId, cell),
  // 031: in the editor a tile tap selects (the card follows); elsewhere
  // it opens the card as before.
  openWordCard: (item) => (view === "editor" ? editorUi.select(item) : wordCard.openWordCard(item)),
  homeCells: () => coreCells(db, boardGeom().name, locale),
  homeTile,
  rerenderView: () => rerenderView(),
  loadPhotoURL, savePhoto, syncUploadBlob,
});

/* 029/030 — pictures for personal words: find by meaning, apply a close
   match free, draw when nothing is close. One path for the card and
   Paste a list; parked words retry on reconnect. */
const pictures = pictureClient();
const pictureCreds = async () => ({ userId: me.id, license: await voiceLicense() });
const pictureFill = mountPictureFill({
  db, all: ALL, locale, client: pictures, creds: pictureCreds,
  savePhoto, syncUploadBlob,
  onChanged: (id) => {
    entityPhoto.delete(id);
    entityRole.delete(id);
    rerenderView();
    renderStrip();
    renderGrid();
  },
});
addEventListener("online", () => pictureFill.drainPending().catch(() => {}));
setTimeout(() => pictureFill.drainPending().catch(() => {}), 5000);

/* Add a word — public/board/add-flow.js */
addUi = mountAddFlow({
  db, locale, all: ALL, catalog, open, close, toast,
  savePhoto, syncUploadBlob, loadPhotoURL, artInto,
  invalidateIndex: () => kbUi.invalidateIndex(),
  rerenderView, renderStrip, renderLibrary: () => libUi.renderLibrary(),
  openAddToBoards: (item) => groupsUi.openAddToBoards(item),
  tile: tileApi,
  speakItem: (item) => speakItem(item),
  openWordCard: (item, opts) => wordCard.openWordCard(item, opts),
  pictures, pictureFill, creds: pictureCreds,
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
  tile: tileApi, pictures, pictureFill, creds: pictureCreds,
  invalidateIndex: () => kbUi.invalidateIndex(),
  setView: (v) => kbUi.setView(v),
  rerenderView, renderStrip, renderGrid, flashCell,
  getCell: (id) => cellEls.get(id),
  getGroupKey: () => groupsUi.getGroupKey(),
  setGroup: (id, page) => groupsUi.setGroup(id, page),
  dropEntityPhoto: (id) => entityPhoto.delete(id),
  dropEntityRole: (id) => entityRole.delete(id),
  dropSenseMeta: (id) => senseMeta.delete(id),
  openAddToBoards: (item) => groupsUi.openAddToBoards(item),
  isOnMainBoard: (kind, id) => coreCells(db, boardGeom().name, locale)
    .some((c) => (kind === "entity" ? c.entity_id === id : c.sense_id === id)),
});

/* Devices, users, and supporter sign-in — public/board/devices-ui.js */
// The Lifetime page mounts below; the relay's plan answer can land first.
let renderLifePage = () => {};
const devicesUi = mountDevices({
  db, me, saveUser, userStore, flushDb, toast,
  initSync, onSyncApplied, onModel, qrcode, settings: settingsUi, syncRekey,
  renderUsers: () => peopleUi.renderUsers(),
  onRoleChange: () => { renderGrid(); rerenderView(); },
  // One answer to "has Pip Lifetime?": the relay's, for every screen.
  onPlan: ({ lifetime }) => {
    trialLicensed = lifetime;
    settingsUi.renderNav();
    renderLifePage();
  },
  resetLicense,
});
// ?unlock — the test link that turns Pip Lifetime on (public/board/unlock.js).
// ?unlicensed — the 040 trial preview: no dev-license self-mint.
unlicensedFromUrl({ me });
unlockFromUrl({ me, activateLicense: devicesUi.activateLicense, toast });
// ?purchased — back from Stripe Checkout; the webhook grants lifetime
// and the device picks its license copy up from the relay.
purchasedFromUrl({ me, claimPurchasedLicense: devicesUi.claimPurchasedLicense, toast });
// ?buy — the "Send an unlock link" URL: a hosted $49 code checkout,
// no account, nothing personal in the link (040 § 8).
checkoutFromUrl({ toast });
// ?order=cs_… — the app's own Buy returning: redeem the minted code
// for this board automatically.
orderFromUrl({ me, ensureUser: devicesUi.ensureUser, redeemLicense,
  claimPurchasedLicense: devicesUi.claimPurchasedLicense, toast });

/* 040 — the Pip Lifetime page (public/board/lifetime-ui.js): the one
 * destination for every upgrade door, and the countdown's home. */
const lifeUi = mountLifetime({
  me, sayClip, toast,
  /* The free side of "Hear the difference" is the real thing: the
   * word clips for "I want an apple", exactly as a free Play speaks. */
  hearFree: async () => {
    endPlaying();
    for (const text of ["I", "want", "an", "apple"]) {
      const sid = senseIdOf(text);
      await speakItem({ kind: sid ? "sense" : "typed", id: sid, text },
        { chained: true, voice: voiceId });
    }
  },
  trial: () => ({ licensed: trialLicensed, endsAt: trialEndsAt }),
});
renderLifePage = () => lifeUi.renderTrial();
settingsUi.onOpen(() => lifeUi.renderTrial());
// A synced person's plan is the relay's: ask once at boot so the
// sidebar and the Lifetime page never contradict Add a device.
if (navigator.onLine && me.sync?.userId) devicesUi.refreshPlan();
/* 040 — the trial clock lives with its owner page (lifetime-ui.js):
 * boot() starts the clock at install/first-online and mirrors
 * {licensed, endsAt}; expiry reverts a locked voice to the default. */
const trialClock = mountTrialClock({
  me, db, locale, refreshTrial, trialNudge,
  isEntitled: () => trialLicensed || trialActive(),
  getVoiceId: () => voiceId,
  setVoiceId: (id) => {
    setSetting(db, "preferred_voice_id", id);
    voiceId = resolveProfile(db).voiceId;
  },
  repaint: () => { settingsUi.renderNav(); voiceUi.renderRow(); },
});
if (navigator.onLine) trialClock.boot();
addEventListener("online", () => { if (!trialActive()) trialClock.boot(); });

/* People — public/board/people-ui.js: the Settings header switcher and
 * "When Pip opens". */
const peopleUi = mountPeople({
  me, userStore, keyStore: openKeyStore(), flushDb, settings: settingsUi, saveUser,
  db, savePhoto, syncUploadBlob, loadPhoto: loadPhotoURL, // names and photos
  onHomeChanged: () => { devicesUi.renderAccount(); peopleUi.renderUsers(); },
});
settingsUi.onOpen(() => { peopleUi.closePop(); peopleUi.renderOpens(); peopleUi.follow(); });
/* Show groups — public/board/group-shows.js (Settings → Words). */
const groupShows = mountGroupShows({ db, locale, all: ALL, toast, onChange: () => rerenderView() });
settingsUi.onOpen(() => groupShows.render());

/* The weekly win card and progress dashboard — public/board/wincard-ui.js
 * and progress-ui.js (016 slices 2 and 4). Item ids resolve to names
 * here so the shared modules stay off the label and entity tables. */
const statNameOf = (kind, id) => kind === "entity"
  ? ALL(db, "SELECT spoken_name AS t FROM personal_entity WHERE id = ?", [id])[0]?.t
  : ALL(db, `SELECT text AS t FROM label WHERE sense_id = ?
      AND kind = 'lemma' AND status = 'approved' AND locale = ?`, [id, locale])[0]?.t;
const statRoleOf = (kind, id) => kind === "entity" ? roleForEntity(id)
  : kind === "sense" ? ALL(db, "SELECT fitzgerald_role AS r FROM sense WHERE id = ?", [id])[0]?.r
  : "None";
const relayEntitlement = async () =>
  (await devicesUi.userClient().then((u) => u?.client?.selfKey()))?.entitlement;
/* 040 § 3 — Progress is a trial feature too: "shown in full, locked
 * back to the preview after". The win card and the dashboard read the
 * same answer: lifetime on the relay, or the trial clock still running. */
const fullProgress = async () =>
  (await relayEntitlement().catch(() => null)) === "lifetime" || trialActive()
    ? "lifetime" : null;
mountWincard({ db, me, toast, nameOf: statNameOf, entitlement: fullProgress, settings: settingsUi });
mountProgress({ db, me, nameOf: statNameOf, roleOf: statRoleOf, artOf: artUrlOf, entitlement: fullProgress, settings: settingsUi });

/* The placement sheet (018 D10): Edit mode, tap any tile or an empty
 * cell — the off-board list ranks by the child's own counts, the
 * children table's unigram on day one. The pick writes a placement
 * with an undo toast, same as a drag; ✎ in the head row opens the
 * word card. */
// 041 B3 — lazy: the place picker asks after the tables have landed.
let kidsUniCache = null;
const kidsUni = () => {
  if (kidsUniCache) return kidsUniCache;
  const uni = {};
  if (phrases?.uni) {
    // 041 B4 — the answer table carries the same unigram prior as b36 ids.
    for (const [k, n] of Object.entries(phrases.uni)) {
      uni[`sns_${String(parseInt(k, 36)).padStart(4, "0")}`] = n;
    }
    return (kidsUniCache = uni);
  }
  for (const row of Object.values(phrases?.contexts ?? {})) {
    for (const [id, n] of Object.entries(row)) uni[id] = (uni[id] ?? 0) + n;
  }
  return (kidsUniCache = uni);
};
const placeUi = mountPlacePicker({
  db, locale,
  getLayout: () => boardGeom().name,
  getCounts,
  getUni: kidsUni,
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
  /* Replace inside a group (031): the picked word takes the tapped word's
   * exact cell — a remove_item + place_item pair, Undo restores both. */
  onGroupPick: (groupId, cell, occ, kind, id, label) => {
    let rep;
    try {
      rep = replaceGroupItem(db, groupId, { kind: occ.kind, id: occ.id }, { kind, id }, cell);
    } catch {
      return; // the cell refused — nothing changed
    }
    close("placeform");
    rerenderView();
    toast(`Replaced ${occ.label} with ${label}`, () => { rep.undo(); rerenderView(); });
  },
});

/* First-open setup (014 § 9 ruling 1 + 009 slice 11, Word_Library §
 * 5.6): a new user gets the "Tell us about their world" guided pass —
 * People (names seat at mom/dad, 018 D1), Pets, Favorite foods, Places;
 * each step is skippable and files into its built-in group. The Parent
 * Corner offers the same pass again ("Tell us about their world"). */
const setupUi = mountSetup({
  db, locale, catalog, open, close, toast,
  savePhoto, syncUploadBlob, loadPhotoURL, artInto, me, saveUser, flushDb,
  tile: tileApi,
  dropEntityPhoto: (id) => entityPhoto.delete(id),
  invalidateIndex: () => kbUi.invalidateIndex(),
  renderGrid, rerenderView, renderStrip,
});
$("open-setup").addEventListener("click", () => {
  close("menu");
  setupUi.openWizard();
});
/* Voice — public/board/voice-ui.js (Settings → Talking). One voice per
 * board: word clips and sentence voice together; the sample is the
 * demo sentence. */
const SAMPLE_TEXT = "I want an apple.";
async function sampleVoice(id, feeling = "neutral") {
  const blob = await sentenceVoice.request({
    userId: me.id, license: await voiceLicense(), voice: id,
    text: SAMPLE_TEXT, feeling, deadlineMs: SPEAK_VOICE_WAIT_MS,
  }).catch(() => null);
  if (blob) return playBlob(blob);
  if (feeling !== "neutral") return false; // a feeling has no word-clip fallback
  // Offline or unlicensed: the word clips, in the voice being previewed
  // (028 slice 6 — Hear it must audition a voice before it is picked).
  endPlaying();
  for (const [text, sid] of [["I", senseIdOf("I")], ["want", "sns_0013"], ["apple", "sns_0128"]]) {
    await speakItem({ kind: sid ? "sense" : "typed", id: sid, text }, { chained: true, voice: id });
  }
}
function senseIdOf(text) {
  return ALL(db, `SELECT sense_id AS id FROM label WHERE text = ? AND kind = 'lemma'
    AND status = 'approved' AND locale = ?`, [text, locale])[0]?.id ?? null;
}
const voiceUi = mountVoice({
  db, locale, open,
  getVoiceId: () => voiceId,
  /* 040: choosing a voice is a paid feature — after the trial a
   *  non-default card is locked and its tap opens the Lifetime page. */
  locked: () => !(trialLicensed || trialActive()),
  onLocked: () => { close("voiceform"); settingsUi.show("lifetime"); },
  chooseVoice: async (id) => {
    if (id === voiceId) return;
    // 041 A3 — a new voice's clips need the network; offline the picker
    // greys and this is the backstop. Honest, never a silent stall.
    if (!navigator.onLine) {
      toast("Changing voices needs Wi-Fi.");
      return;
    }
    // 028 § 5.4: the old voice keeps playing while the new voice's clips
    // fill (hits for seeded words, mints for the family's own). Only a
    // clean fill swaps — failures leave the old voice active.
    const texts = ALL(db,
      "SELECT spoken_name AS t FROM personal_entity WHERE status = 'active'")
      .map((r) => r.t);
    // Catalog words already ship in this voice — only the family's own
    // names (people, pets, places) mint. No names → nothing to make.
    if (texts.length) toast(`Making ${voiceName(db, id)}'s voice…`);
    const res = await tileApi.prefetch(texts, {
      voice: id,
      onProgress: (p) =>
        toast(`Making ${voiceName(db, id)}'s voice, ${p.done + p.failed} of ${texts.length}`),
    });
    if (res.failed) {
      toast(`Couldn't finish ${voiceName(db, id)}'s voice — try again when you're online.`);
      return;
    }
    tileSweep(id).catch(() => {}); // evict the new voice's rejects too
    setSetting(db, "preferred_voice_id", id);
    voiceId = resolveProfile(db).voiceId;
    announceVoice(); // 041 A3 — the new voice's clips fill in the background
    settingsUi.renderNav();
  },
  sample: sampleVoice,
});
settingsUi.onOpen(() => voiceUi.renderRow());
$("speed-seg").addEventListener("click", (e) => {
  const v = e.target.closest("button")?.dataset.v;
  if (!v) return;
  setSetting(db, "speech_rate", v);
  syncSpeed();
  sampleVoice(voiceId); // hear the new speed at once
});
syncSpeed();

/* The welcome — public/board/onramp-ui.js: a name and "Who's it for?"
 * (plus the button look for a teen or adult) on a new person, then
 * straight to the board. The old "their world" form is Settings-only. */
const onramp = mountOnramp({
  me, saveUser,
  setLook, flushDb,
  say: sayClip, // recorded clips in the product voice, never device TTS
  tileFor: tileForSense,
  fitLabels,
  join: () => devicesUi.join(),
});
/* The demo — public/board/tour-ui.js. The board side: add a word, set
 * the bar to a scripted sentence, speak it — none of it logged. */
const tourUi = mountTour({
  saveUser,
  board: {
    setTour: (h) => { tour = h; syncTxButtons(); renderStrip(); },
    showBoard: () => { if (view !== "board") kbUi.setView("board"); },
    cellEl: (senseId) => cellEls.get(senseId) ?? null,
    addWord: (senseId) => {
      const w = senseById(senseId);
      const item = { kind: "sense", id: senseId, text: w?.label ?? "" };
      sentence.push(item);
      renderBar();
      const p = speakItem(item);
      syncTxButtons();
      renderStrip();
      return p;
    },
    setBar: (text, mode) => {
      applyTransform(sentence, text, mode, barState);
      for (const it of sentence) {
        if (it.kind === "typed") it.art = artForWord(it.text);
      }
      renderBar();
      syncTxButtons();
    },
    speakBar: () => speakSentence(),
    clearBar: () => $("clear").click(),
    say: sayClip, // instruction cards — recorded clips, never device TTS
    openVoices: () => gatePin(() => { settingsUi.open("talking"); voiceUi.openPicker(); }),
    // 038: the tour only walks buttons the person actually has.
    shownControls: () => barControls(db),
  },
});
$("replay-tour").addEventListener("click", () => { close("menu"); tourUi.start(); });
settingsUi.onShow((id) => { if (id === "overview") showVersion(); }); // stale shells show
// 034: the welcome's Continue navigates away (a fresh document is the only
// proven fix for the iPad keyboard-pan residue); the flag resumes the tour
// on that boot. Consume before starting so a mid-tour refresh can't replay.
if (sessionStorage.getItem("pip_tour")) {
  sessionStorage.removeItem("pip_tour");
  tourUi.start();
} else if (me.needsSetup) onramp.start();

/* QR card — public/board/recovery-ui.js */
mountRecovery({
  me, saveUser, userStore, flushDb, toast, qrcode,
  userClient: () => devicesUi.userClient(),
  ensureUser: (o) => devicesUi.ensureUser(o),
});

/* Board editor — public/board/editor-ui.js (031) */
editorUi = mountEditor({
  db, locale, all: ALL, catalog, me, userStore, flushDb,
  paintGroupPage: (zg, opts) => groupsUi.paintGroupPage(zg, opts),
  renderMainBoard: () => renderGrid(),
  homeCells: () => coreCells(db, boardGeom().name, locale),
  boardGeom,
  addFlow: addUi,
  openWordCard: (item, opts) => wordCard.openWordCard(item, opts),
  closeCard: () => close("wordcard"),
  replaceOnBoard: (slot, occ) => placeUi.openPicker(slot, occ),
  replaceInGroup: (groupId, occ, cell) => placeUi.openGroupPicker(groupId, cell, occ),
  setView: (v) => kbUi.setView(v),
  openGroupView: (id, page = 0) => { groupsUi.setGroup(id, page); kbUi.setView("group"); },
  toast, undoLast,
  syncState: () => ({
    linked: !!me.sync?.userId,
    pending: ALL(db, "SELECT COUNT(*) AS n FROM sync_op WHERE relay_seq IS NULL")[0]?.n ?? 0,
    online: navigator.onLine,
    flushError: syncHealth().flushError,
  }),
  renderLibrary: () => libUi.renderLibrary(),
  invalidateIndex: () => kbUi.invalidateIndex(),
  renderStrip,
  savePhoto, syncUploadBlob,
  tile: tileApi, loadPhotoURL, artInto, flashCell,
});

// A session survives a restart (013 § 4): the synced row lights the
// glow again — unless its timer or midnight passed while away.
resumeSession(db);
renderGrid();
renderBar();
renderStrip();
// A switch from Settings reloads into the chosen person and lands back
// on the same Settings page (people-ui.js) — unless the new person's
// first-open setup is showing.
{
  const reopen = takeReopen();
  if (reopen && !me.needsSetup) {
    reopenSection = reopen;
    $("corner").click();
  }
}

// Timer/midnight expiry: the row's ends_at is the truth; the layer
// checks it on a slow tick (and on every sync drain) and ends itself.
setInterval(() => {
  if (spotDemo) return; // Try it has no session row to check
  const was = !!spotlight();
  resumeSession(db);
  if (was !== !!spotlight()) {
    renderGrid();
    rerenderView();
  }
}, 30000);

/* 041 A1/A2 — the service worker and the active voice's offline audio
 * wait for the first board frame. board-ready fires once the first
 * tile picture is actually on screen (or a slow-image cap — a stuck
 * decode must not hold offline support hostage). The voice announce
 * goes once the SW controls us; each later voice switch re-announces. */
{
  let readyFired = false;
  const fireBoardReady = () => {
    if (readyFired) return;
    readyFired = true;
    dispatchEvent(new Event("pip:board-ready"));
  };
  const armReady = () => {
    if (readyFired) return;
    const img = document.querySelector("#grid .cell .tart img");
    if (!img || (img.complete && img.naturalWidth > 0)) return fireBoardReady();
    img.addEventListener("load", fireBoardReady, { once: true });
    setTimeout(fireBoardReady, 2500);
  };
  // RAF can starve on a hidden or heavily throttled page — the timer is
  // the honest fallback either way.
  requestAnimationFrame(armReady);
  setTimeout(armReady, 600);
  addEventListener("pip:board-ready", announceVoice, { once: true });
  navigator.serviceWorker?.addEventListener("controllerchange", announceVoice);
  // 041 B3 — grammar + suggestions land now, never on the paint path:
  // the strip and form picks quietly upgrade, no reload.
  loadLanguage().then((lang) => {
    phrases = lang.phrases;
    formTable = lang.formTable;
    renderStrip();
    window.pip && (window.pip.languageReady = performance.now());
  }).catch((err) => console.warn("lang: load failed", err));
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
    get picking() { return attention.picking ? [...attention.picking] : null; },
    get modeling() { return attention.modeling; },
    get modelGlow() { return [...modelGlow.keys()]; },
    count: (key) => coachUi.countOf(key),
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
