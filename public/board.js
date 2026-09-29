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
  groupRanked, groupStarters,
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
import { voiceName } from "./shared/voices.mjs";
import { sentenceSpeakText, voiceSentence } from "./shared/voice_sentence.mjs";
import { tileStateBadge, tileStateMessage, voiceTile } from "./shared/voice_tile.mjs";
import { normalizeV1 } from "./shared/normalize.mjs";
import { PIN_RE, RESET_PHRASE, checkPin, clearPin, hasPin, isResetPhrase, setPin } from "./shared/pin.mjs";
import { entityNames, maskNames } from "./shared/name_shield.mjs";
import { applyTransform, wordLemmaCandidates } from "./shared/txbar.mjs";
import { EOS, formFor, grammarHelpOn } from "./shared/forms.mjs";
import {
  FEELINGS, expressiveOn, loadFeelingData, suggestedFeeling,
} from "./shared/feeling.mjs";
import { SENSE_ART_SQL } from "./shared/images.mjs";
import { coreCells, moveCore, placeOnBoard } from "./shared/coremove.mjs";
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
import { mountSetup } from "./board/setup-ui.js";
import { mountRecovery } from "./board/recovery-ui.js";
import { mountEditor } from "./board/editor-ui.js";
import { mountCoach } from "./board/coach-ui.js";
import {
  family as familyRow, familyItems,
} from "./shared/families.mjs";
import { mountFamilyEditor } from "./board/family-editor.js";
import { mountSettings } from "./board/settings-ui.js";
import { mountPeople, pickPerson, takeReopen } from "./board/people-ui.js";
import { mountGroupShows } from "./board/group-shows.js";
import { mountOnramp } from "./board/onramp-ui.js";
import { mountTour } from "./board/tour-ui.js";
import { mountVoice } from "./board/voice-ui.js";
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
if (!me) me = await pickPerson(users); // shared device, no home — ask
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

const { db, catalog, phrases, formTable, flush: flushDb } = await bootDb(userStore, me.id);
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
    voiceId = resolveProfile(db).voiceId; // a voice chosen on another device
    syncSpeed();
    voiceUi.renderRow();
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
let view = "board";    // 'board' | 'groupIndex' | 'group' — groups are a board mode, not a modal
let editing = false; // caregiver Edit mode — same gesture on index and pages
let countsOn = false; // 018 D10: the 📊 badge — the child's own 30-day taps
const getCounts = () => useCounts(db);

const SILENT_SLOT_MS = 400;
const audio = new Audio();
// Speaking speed (Settings → Talking; learner_profile.speech_rate,
// synced). Browsers keep pitch at a changed playbackRate by default.
const SPEECH_RATES = { slower: 0.8, normal: 1, faster: 1.2 };
let speechRate = 1;
function syncSpeed() {
  const v = ALL(db, "SELECT speech_rate AS r FROM learner_profile WHERE id = 'prf_local'")[0]?.r ?? "normal";
  speechRate = SPEECH_RATES[v] ?? 1;
  audio.defaultPlaybackRate = speechRate;
  audio.playbackRate = speechRate;
  for (const b of document.querySelectorAll("#speed-seg button")) b.classList.toggle("on", b.dataset.v === v);
}

// 024: whole-sentence voice — Tier 1 Cache Storage + ~300 ms deadline,
// word clips always the fallback (rule 1). The Grok voice id is a
// per-child setting in the doc's rule 3; the `grok_voice` profile
// column ships with the Ara catalog rebuild (schemaSql rides in
// catalog.json), so the id is one named seam until then.
const sentenceVoice = voiceSentence();
const grokVoice = "ara";
// 028: tile voice library — entity names and committed typed words play
// minted clips from Cache Storage + the ledger; never device TTS.
const tileVoice = voiceTile();
/* § 5.2 — the mint triggers are supporter actions (add, rename, bulk,
   setup, a committed typed word); a child tap only ever fetches. The
   states this tracks are what the tile badge and the word card show. */
const tileApi = {
  name: () => voiceName(db, voiceId),
  status: (text) => tileVoice.status(voiceId, text),
  message: (state, text) => tileStateMessage(state, voiceName(db, voiceId), text),
  onStatus: (cb) => tileVoice.onStatus(cb),
  /** Fire-and-forget mint for one word — returns the outcome so the
   *  caller can message; failures that can heal are already queued. */
  ensure: async (text, { source = "user_typed" } = {}) =>
    tileVoice.ensure({
      userId: me.id, license: await voiceLicense(),
      voice: voiceId, locale, text, source,
    }).catch(() => ({ ok: false, reason: "failed" })),
  /** Sequential ensures (§ 5.3 bulk/prefetch) — hits are free, a budget
   *  answer pauses the run. `voice` overrides the board voice for the
   *  switch prefetch. */
  prefetch: (texts, { voice = voiceId, onProgress } = {}) =>
    voiceLicense().then((license) => tileVoice.prefetch({
      userId: me.id, license, voice, locale, texts, onProgress,
    })),
};
let tileBadgeTimer = null;
tileVoice.onStatus(() => {
  // Mint completions repaint the badge — debounced so a bulk run is one
  // repaint, not fifty.
  clearTimeout(tileBadgeTimer);
  tileBadgeTimer = setTimeout(() => { renderGrid(); renderStrip(); rerenderView(); }, 200);
});
/* § 5.3 — prefetch on boot (idle) and the offline queue drain on
   reconnect. Active entity names are the family's own words: hits are
   free, misses mint inside the caps. */
const tilePrefetch = async () => {
  const texts = ALL(db,
    "SELECT spoken_name AS t FROM personal_entity WHERE status = 'active'")
    .map((r) => r.t);
  await tileVoice.drainQueue({
    userId: me.id, license: await voiceLicense() }).catch(() => {});
  tileApi.prefetch(texts).catch(() => {});
};
if (typeof requestIdleCallback === "function") {
  requestIdleCallback(() => tilePrefetch(), { timeout: 8000 });
} else {
  setTimeout(tilePrefetch, 3000);
}
addEventListener("online", () => {
  voiceLicense().then((license) =>
    tileVoice.drainQueue({ userId: me.id, license })).catch(() => {});
});
// 023: the bar's current shape — which tense it holds and whether it
// is a question — drives the trio's selected state. Reset whenever
// the bar empties (clear, backspace, after-speak fresh start).
const barState = { tense: "present", question: false };
let licenseP = null;
const LOCALHOST = ["localhost", "127.0.0.1", "[::1]"];
const voiceLicense = () => {
  // openKeyStore() returns the store itself, not a promise — calling
  // .then on it threw, so every multi-word Speak died before a sound.
  // Localhost self-activates: no stored license → mint one from the
  // dev-only endpoint and keep it, so preview needs no paste ritual.
  licenseP ??= Promise.resolve()
    .then(() => openKeyStore().get(`user/${me.id}/license`))
    .then(async (lic) => {
      if (lic || !LOCALHOST.includes(location.hostname)) return lic;
      const res = await fetch("/api/v1/voice/dev-license", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_id: me.id }),
      }).catch(() => null);
      const fresh = res?.ok ? (await res.json().catch(() => ({}))).license : null;
      if (fresh) {
        await openKeyStore().put(`user/${me.id}/license`, fresh).catch(() => {});
      }
      return fresh;
    })
    .catch(() => null);
  return licenseP;
};

function speak(text) {
  // device_tts lane — used for personal entities (§7.3). The utterance
  // carries the profile locale so names and typed words are spoken in
  // the profile's language, not the device's. Returns a promise that
  // resolves when the word ends — the sentence loop awaits it, or every
  // queued speak() cancels the last and only the final word is heard.
  // The timeout is a wedge guard only (a stuck engine can't hang Speak).
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = locale;
    u.rate = speechRate;
    u.onend = resolve;
    u.onerror = resolve;
    setTimeout(resolve, Math.max(4000, text.length * 300));
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  });
}

/* One audio element — a new play cancels the old. Resolve the old
 * wait too, or its caller hangs forever (face tap mid-▶, 023 § 1h's
 * "pressing another speaking button restarts audio"). */
let playingResolve = null;
let playGen = 0; // a new play invalidates waits started under the old
// `chained`: the sentence loop's own next word — it takes the element
// without invalidating the loop that asked for it (else ▶ stopped after
// the first word).
const endPlaying = ({ chained = false } = {}) => {
  if (!chained) playGen++;
  playingResolve?.();
  playingResolve = null;
  // Resolving the wait isn't enough — actually silence both lanes, or a
  // blob mid-play (or a TTS word from an abandoned clip loop) keeps
  // talking under the new speaker.
  audio.pause();
  speechSynthesis.cancel();
};

/** Play a clip: catalog keys are shipped files; `blob:` keys are
 *  content-addressed bytes in OPFS (recorded overrides, synced photos)
 *  resolved through the blob loader, which lazy-fetches a sealed copy. */
async function playClip(key, { chained = false } = {}) {
  let src = `/${key}`;
  if (key.startsWith("blob:")) {
    src = await loadPhotoURL(key);
    if (!src) return;
  }
  endPlaying({ chained });
  return new Promise((resolve) => {
    playingResolve = () => resolve("cut");
    audio.src = src;
    audio.playbackRate = speechRate;
    audio.onended = () => resolve(true);
    audio.onerror = () => resolve(false);
    audio.play().catch(() => resolve(false));
  });
}

/** Play a fetched audio blob through the same element clips use. */
async function playBlob(blob, { chained = false } = {}) {
  const src = URL.createObjectURL(blob);
  try {
    endPlaying({ chained });
    return await new Promise((resolve) => {
      playingResolve = () => resolve("cut");
      audio.src = src;
      audio.playbackRate = speechRate;
      audio.onended = () => resolve(true);
      audio.onerror = () => resolve(false);
      audio.play().catch(() => resolve(false));
    });
  } finally {
    URL.revokeObjectURL(src);
  }
}

/** Speak one tapped item — §7.2/7.3 resolution: override, voice clip,
 *  TTS, or a held 400 ms silent slot. A clip the element refuses to
 *  start (autoplay policy, a missing file) falls back to the device
 *  voice — a tap is never silent when a word exists to say. */
async function speakItem(item, { chained = false } = {}) {
  const slot = resolveSlot(db, item, locale, voiceId);
  if (slot.type === "clip") {
    if (await playClip(slot.key, { chained })) return;
    if (!slot.text) return;
  }
  if (slot.type === "tileclip") {
    // 028 § 5.1: cache hit plays; a miss is one ledger fetch behind a
    // deadline — the fill lands for the next tap. Any failure is the
    // silent slot; tiles never speak through the device voice.
    const r = await tileVoice.request({
      userId: me.id, license: await voiceLicense(),
      voice: slot.voice, locale: slot.locale, text: slot.text,
    }).catch(() => null);
    if (r?.ok && (await playBlob(r.blob, { chained })) !== false) return;
    return new Promise((r2) => setTimeout(r2, SILENT_SLOT_MS));
  }
  if (slot.type === "tts" || slot.type === "clip") {
    endPlaying({ chained });
    return speak(slot.text);
  }
  return new Promise((r) => setTimeout(r, SILENT_SLOT_MS));
}

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
    $(id).disabled = !sentence.length || (offline && !tour);
  }
}
addEventListener("online", () => { syncTxButtons(); renderStrip(); });
addEventListener("offline", () => { syncTxButtons(); renderStrip(); });

/** One transform press: mask her names → the Worker/Groq does the
 *  grammar → the result replaces the bar as typed words → it speaks
 *  through the 024 pipeline. A failed or offline call still speaks —
 *  the bar as built, per § 1's every-press-produces-audio rule. */
let txBusy = false;
/* The first-run demo (public/board/tour-ui.js) owns taps, the Smart bar
 * and the transform buttons while it runs — its taps never reach the
 * tap log, stats or the ranker. Null the rest of the time. */
let tour = null;
async function transformAndSpeak(mode) {
  if (tour) return tour.onTransform(mode);
  if (txBusy || !sentence.length) return;
  txBusy = true;
  const btn = $(mode === "present" ? "speak" : `tx-${mode}`);
  btn?.classList.add("speaking");
  try {
    const raw = sentence.map((it) => it.text).join(" ");
    const { masked, unmask } = maskNames(raw, entityNames(db));
    const res = await fetch("/api/v1/transform", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: me.id, license: await voiceLicense(), mode, text: masked,
      }),
    }).catch(() => null);
    const out = res?.ok ? (await res.json().catch(() => ({}))).text : null;
    if (out) {
      applyTransform(sentence, unmask(out), mode, barState);
      for (const it of sentence) {
        if (it.kind === "typed") it.art = artForWord(it.text);
      }
      renderBar();
      renderStrip();
    }
    await speakSentence();
  } finally {
    txBusy = false;
    btn?.classList.remove("speaking");
    syncTxButtons();
  }
}

/** Sentence bar: one slot per item in order; misses hold 400 ms (§7.4).
 *  Speaking ends the logged sentence — the bar keeps its words, but the
 *  next pick opens a new sentence row. */
/* Speaks serialize: the newest call owns the audio. A request in flight
 * for text the bar no longer holds is dropped — never played (the blob
 * is still cached under its own key, so nothing is wasted). */
let speakSeq = 0;
async function speakSentence(feeling = null) {
  const seq = ++speakSeq;
  freshNext = freshAfterSpeak;
  // 022: Speak is sentence-final — the last word may take its absolute
  // form ("it is not my" -> "it is not mine"). Picked once, before
  // speaking, same as a tap's decision-4 but with EOS as the next word.
  if (grammarHelp && sentence.length) {
    const last = sentence[sentence.length - 1];
    if (last.kind === "sense" && last.id) {
      const f = formFor(db, formTable, sentence.slice(0, -1), last.id, EOS,
        last.features);
      if (f.text !== last.text) {
        last.text = f.text;
        last.labelId = f.labelId;
        last.features = f.features;
        if (sentenceId !== null) {
          const pos = sentence.slice(0, -1).filter((it) => it.id).length;
          RUN(db,
            "UPDATE learner_event_log SET label_id = ? WHERE sentence_id = ? AND position = ?",
            [f.labelId, sentenceId, pos]);
        }
        renderStrip();
      }
    }
  }
  // 024 rule 1: one whole-sentence utterance when it's ready — a single
  // word is its own clip, so the pipeline only ever races real phrases.
  // A face tap races every length: the shortest messages (*No!*, *Stop!*)
  // are often the most emotional (025 § 1). A null answer (deadline,
  // offline, unlicensed, over budget) falls through to the clip loop —
  // she is always heard, the feeling is the extra (025 § 2).
  let spoken = false;
  if (sentence.length >= 2 || feeling) {
    const text = sentenceSpeakText(sentence);
    const blob = await sentenceVoice.request({
      userId: me.id,
      license: await voiceLicense(),
      voice: grokVoice,
      text,
      feeling: feeling ?? "neutral",
      // § 2: a face waits ~1 s for its feeling before neutral clips.
      deadlineMs: feeling ? 1000 : 300,
    });
    if (seq !== speakSeq) return; // a newer speak owns the audio now
    if (text !== sentenceSpeakText(sentence)) {
      // The bar changed mid-request — speak what it holds now, never
      // the stale recording.
      return speakSentence(feeling);
    }
    if (blob) {
      // true = played to the end, "cut" = a newer play owns the element
      // (counts as spoken so the clip loop doesn't talk over it), and
      // false = the element refused to start — fall through so the bar
      // still speaks word by word.
      spoken = (await playBlob(blob)) !== false;
    }
  }
  if (!spoken) {
    endPlaying(); // this speak takes the element from any older one
    const gen = playGen;
    const text = sentenceSpeakText(sentence);
    for (const item of [...sentence]) {
      // A newer speak or tap took the element, or the bar changed —
      // either way this loop no longer speaks the bar as it stands.
      if (playGen !== gen || sentenceSpeakText(sentence) !== text) break;
      await speakItem(item, { chained: true });
    }
  }
  if (sentenceId !== null) {
    const sid = sentenceId;
    closeSentence(db, sid, Date.now(), "spoken", feeling);
    scheduleStatsRefresh();
    sentenceId = null;
    sentencePicks = 0;
    lastImpressionKey = null;
    openImpressionId = null;
    // 027 B10: Speak stays in the current group and page — no navigation
    // here, so a late callback can never undo where the user went since.
    renderStrip();
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

/** Cache: normalized transform token → art key | null. A model-supplied
 *  word that resolves to a label ("wanted" lemmas to want) shows that
 *  sense's symbol — the bar stays readable after a transform. The item
 *  stays typed; the art is display only. */
const wordArt = new Map();
function artForWord(word) {
  const w = normalizeV1(
    String(word).replace(/^[^\p{L}\p{N}'-]+|[^\p{L}\p{N}'-]+$/gu, ""));
  if (!w) return null;
  if (!wordArt.has(w)) {
    let art = null;
    for (const cand of wordLemmaCandidates(w)) {
      const row = ALL(
        db,
        `SELECT l.sense_id FROM label l
         WHERE l.normalized_text = ? AND l.locale = ? AND l.status = 'approved'
         ORDER BY (l.kind = 'lemma') DESC, l.default_for_text DESC LIMIT 1`,
        [cand, locale],
      )[0];
      if (row) { art = metaFor(row.sense_id).art; break; }
    }
    wordArt.set(w, art);
  }
  return wordArt.get(w);
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

/* Grammar help (021): every place a sense's label is PAINTED for the
 * child — grid cell, strip tile, group cell — shows the form the
 * sentence calls for; what she taps is what the item wears and says.
 * Lemma labels rule while editing (caregivers see canonical words) and
 * when the setting is off. */
let grammarHelp = true;
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
  if (!sentence.length) { barState.tense = "present"; barState.question = false; }
  syncTxButtons();
  bar.scrollLeft = bar.scrollWidth; // the newest word stays in view
}
$("bar").addEventListener("click", (e) => {
  // The in-bar Backspace/Clear have their own jobs — their taps never
  // speak the sentence. Mid-transform the press would read the stale
  // bar aloud; the transform speaks the new one moments later.
  if (e.target.closest("#bar-btns")) return;
  if (sentence.length && !txBusy) speakSentence();
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
  renderGrid();
  renderStrip();
});
/* 023 transform buttons: every press produces audio. ▶ speaks the bar
 * as built when it already holds present; from another tense it first
 * returns the sentence to present, then speaks (§ 1d). */
$("speak").addEventListener("click", () => {
  // txBusy: a transform is mid-flight and speaks on landing — a press
  // now would read the pre-transform bar aloud.
  if (!sentence.length || txBusy) return;
  if (barState.tense !== "present" && navigator.onLine !== false) {
    transformAndSpeak("present");
  } else {
    speakSentence();
  }
});
$("tx-fix").addEventListener("click", () => transformAndSpeak("fix"));
$("tx-question").addEventListener("click", () => {
  if (txBusy) return;
  // § 4.1: ❓ on an existing question just re-speaks it.
  if (barState.question) speakSentence();
  else transformAndSpeak("question");
});
$("tx-past").addEventListener("click", () => {
  if (txBusy) return;
  if (barState.tense === "past") speakSentence();
  else transformAndSpeak("past");
});
$("tx-future").addEventListener("click", () => {
  if (txBusy) return;
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
    if (last?.id && sentenceId !== null && sentencePicks > 0) {
      detachEvent(db, sentenceId, sentencePicks - 1);
      sentencePicks--;
    }
  }
  renderBar();
  renderGrid();
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

/* 025 § 1: the three faces own the strip's last slot — from the first
 *  word, when the setting is on, online, and not mid-typed-word.
 *  Edit/pick/model modes keep every tap a selection, never speech. */
function facesOn() {
  return !!(!tour && feelingData && sentence.length && expressiveVoice
    && navigator.onLine !== false && !kbUi.text
    && !picking && !modeling && !editing);
}

/** Cache: entity id → category — a people/pets entity (or an
 *  unclassified family add) counts as a people word for § 3. */
const entityCat = new Map();
function entityCategory(entityId) {
  if (!entityCat.has(entityId)) {
    entityCat.set(entityId, ALL(db,
      "SELECT category AS c FROM personal_entity WHERE id = ?",
      [entityId])[0]?.c ?? null);
  }
  return entityCat.get(entityId);
}

function faceCard() {
  const el = document.createElement("div");
  el.className = "pred faces";
  // § 3: the lit face is the suggestion — recomputed every paint.
  const lit = suggestedFeeling(sentence, feelingData,
    (id) => posOfSense(id) === "Pronoun", entityCategory);
  for (const f of FEELINGS) {
    const b = document.createElement("button");
    b.className = `face${lit === f ? " lit" : ""}`;
    b.setAttribute("aria-label", `Say it ${f}`);
    const img = document.createElement("img");
    img.src = `/icons/${lit === f ? "selected/" : ""}voice-${f}.svg`;
    img.alt = "";
    b.appendChild(img);
    b.addEventListener("click", () => speakFeeling(f, b));
    el.appendChild(b);
  }
  return el;
}

/** § 2: a face tap speaks the bar in that feeling, once — pressed at
 *  once, dark until the audio ends, and only one control is dark at a
 *  time. Nothing stays on. */
async function speakFeeling(feeling, btn) {
  if (txBusy || !sentence.length) return;
  txBusy = true;
  document.querySelectorAll(".speaking")
    .forEach((n) => n.classList.remove("speaking"));
  const img = btn.querySelector("img");
  const normal = img.src;
  btn.classList.add("speaking");
  img.src = `/icons/selected/voice-${feeling}.svg`;
  try {
    await speakSentence(feeling);
  } finally {
    txBusy = false;
    btn.classList.remove("speaking");
    img.src = normal;
  }
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
    const label = shownLabel(w.id, w.label);
    return { id: w.id, label, role: w.fitzgerald_role,
      onTap: () => tap(label, "sense", w.id, { hint: true, source: "strip" }) };
  });
}

/** Paint the strip's slots — the only path that touches the tray.
 *  Stamps shown_final on the open strip moment: what was painted is
 *  the truth the stored row must replay (017-5). Card building awaits
 *  art; two renders can overlap, so the tray swap is single-flight —
 *  a superseded paint never touches the DOM. */
let stripPaint = 0;
async function paintStrip(cards, slots = stripSlots(boardGeom().cols)) {
  const mine = ++stripPaint;
  // 025 § 1: the last slot is the three faces whenever they show —
  // word suggestions fill the slots before it, same in every mode.
  const wordSlots = slots - (facesOn() ? 1 : 0);
  const els = [];
  for (let i = 0; i < wordSlots; i++) {
    els.push(cards[i] ? await predCard(cards[i]) : ghostCard());
  }
  if (wordSlots < slots) els.push(faceCard());
  if (mine !== stripPaint) return;
  const tray = $("tray");
  tray.style.gridTemplateColumns = `repeat(${slots}, 1fr)`;
  tray.replaceChildren(...els);
  if (openImpressionId !== null) {
    // shown_final replays what was painted — the face slot is not a word.
    stampShownFinal(db, openImpressionId, cards.slice(0, wordSlots).map((c) =>
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
  if (tour) return paintStrip(stripCards(tour.stripItems()));
  if (expand) return renderExpand();
  const cap = stripSlots(boardGeom().cols);
  let cards;
  if (kbUi.text) {
    // mid-word: the strip switches from continuations to completions
    cards = kbUi.completions();
  } else {
    // One question, one answer: "what does she say next after this
    // phrase" — the same rule paints the bar whether the keyboard is
    // open or not. (Mid-word letters still get spelling completions
    // above; that's not next-word prediction.)
    const sents = sentence.map((s) => ({ kind: s.kind, id: s.id }));
    // Open group: an empty sentence (or one that starts fresh after
    // Speak) offers first words — her own starts here, then children's
    // (027 § 5); after the first pick the bar narrows to that group's
    // used words, her history only (group mode, 2026-09-24).
    const groupId = view === "group" ? groupsUi.getGroupKey() : null;
    const starting = !sents.length || freshNext;
    const ranked = !groupId
      ? stripRanked(db, sents, Date.now(), locale, phrases)
      : starting
        ? groupStarters(db, groupId, { starters: catalog.groupStarters, visible: groupsUi.visibleKeys() })
        : groupRanked(db, sents, groupId, Date.now());
    const items = ranked.shown;
    // Position-0 offers are real moments too (017-21): open the
    // sentence so the impression row can exist. A row with no picks
    // stays invisible to stats (end_kind IS NULL). An empty bar —
    // start or mid-sentence — stays empty: no resting-card guesses
    // (founder call, 2026-09-25).
    ensureSentence();
    maybeImpression(
      ranked.ranked,
      items, { mode: kbUi.isOpen() ? "keyboard" : "picture", cap,
        gate: groupId ? { group: groupId } : { ending: ranked.ending } },
    );
    cards = stripCards(items);
  }
  await paintStrip(cards);
}

function tap(text, kind = "sense", id = null, { hint = false, source = "grid" } = {}) {
  if (tour) return tour.onTap(kind, id);
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
  // 021: the sense keeps its identity — only its label changes. A form
  // pick (wants, him) stores the KEPT sense id plus the label she saw
  // and heard; merged tiles (the 'him' cell) carry their fixed form.
  let item = { kind, id, text };
  if (kind === "sense" && id && grammarHelp) {
    const f = formFor(db, formTable, sentence, id);
    item = { kind: "sense", id: f.senseId, text: f.text ?? text,
      labelId: f.labelId, fixed: f.merged, features: f.features };
  }
  expand = null; // any pick returns the bar to Predict (014 § 5)
  startFresh();
  sentence.push(item);
  revisitPrev(sentence.length - 1); // decision 4: the next word may re-pick the last one
  renderBar();
  speakItem(item);
  if (id) {
    ensureSentence();
    fillChosen(db, sentenceId, { kind, id: item.id ?? id, source });
    logSelection(db, kind, item.id ?? id, Date.now(), {
      sentenceId, position: sentencePicks++, source,
      spotlit: !!spotlight()?.targets.has(`${kind}:${id}`),
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
/** Cache: sense id → lemma part_of_speech (noun-test for the whose rule). */
const sensePos = new Map();
function posOfSense(senseId) {
  if (!sensePos.has(senseId)) {
    sensePos.set(senseId, ALL(db,
      `SELECT part_of_speech AS p FROM label
       WHERE sense_id = ? AND kind = 'lemma' AND status = 'approved' AND locale = ?`,
      [senseId, locale])[0]?.p ?? null);
  }
  return sensePos.get(senseId);
}

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
      `SELECT g.id, g.name FROM group_membership gm JOIN board_group g ON g.id = gm.group_id
       WHERE gm.item_kind = 'sense' AND gm.item_id = ? AND g.kind = 'builtin'
       ORDER BY g.index_slot`,
      [id],
    )[0];
    if (row) name = groupDisplayName(db, row, locale);
  } else if (kind === "entity") {
    const row = ALL(
      db,
      `SELECT g.id, g.name FROM group_membership gm JOIN board_group g ON g.id = gm.group_id
       WHERE gm.item_kind = 'entity' AND gm.item_id = ?
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

/** Uniform-size labels: every label on a board renders at the same size —
 *  two lines fit the strip at nominal, so a long label wraps (long words
 *  hyphenate) instead of shrinking. The shrink loop is the last resort
 *  for a label that can't fit even wrapped. Text is measured with a
 *  Range — scrollHeight reports the flex item's quirks, not the glyphs. */
function fitLabels(root) {
  document.fonts.ready.then(() => {
    const range = document.createRange();
    for (const lb of root.querySelectorAll(".tlabel, .plabel")) {
      const maxW = lb.clientWidth;
      const maxH = lb.clientHeight;
      if (!maxW || !maxH) continue;
      // Tile labels: nominal fits two lines in the strip. Bar labels are
      // single-line horizontal cards — keep the old one-line target.
      let px = Math.floor(maxH * (lb.classList.contains("tlabel") ? 0.38 : 0.8));
      lb.style.fontSize = `${px}px`;
      for (let guard = 18; guard > 0 && px > 8; guard--) {
        range.selectNodeContents(lb);
        const r = range.getBoundingClientRect();
        if (r.width <= maxW && r.height <= maxH) break;
        px = Math.max(8, Math.floor(px * 0.86));
        lb.style.fontSize = `${px}px`;
      }
    }
    // Words only: one text size across the tiles, so "I" isn't huge
    // beside "make" — the smallest one-word fit sets it; two-word labels
    // keep their own fit, never larger than that.
    if (document.body.classList.contains("words-only")) {
      const tiles = [...root.querySelectorAll(".cell .tlabel")];
      const one = tiles.filter((lb) => !lb.textContent.trim().includes(" "));
      const px = Math.min(...one.map((lb) => parseFloat(lb.style.fontSize) || Infinity));
      if (Number.isFinite(px)) {
        for (const lb of tiles) {
          lb.style.fontSize = `${Math.min(px, parseFloat(lb.style.fontSize) || px)}px`;
        }
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
  // Groups and Keyboard always; Add joins them in Edit mode on a group (027 B5).
  tray.style.gridColumn = `span ${cols - ($("anchor-add").hidden ? 2 : 3)}`;
  tray.style.gridTemplateColumns = `repeat(${stripSlots(cols)}, 1fr)`;
}

/** Transition-highlight marks (014 § 4): refreshed each grid render so
 *  an accepted Cells change glows immediately and expired marks drop. */
let movedSet = new Set();

/**
 * One effective home cell's tile, without gestures — the core grid and
 * every group page's reserved cells (027 B3) draw the same tile. A person
 * shows the family's kind color (018 D7 — Yellow until classified) and
 * photo; a hidden word keeps its slot as a ghost (Design_System mask
 * tokens — faded, never tappable or spoken; Masking § 2). `say` is what a
 * tap speaks, null for a ghost.
 */
function homeTile(c, masked = maskedSenseIds(db)) {
  if (c.kind === "entity") {
    const el = wordTile({ label: c.label, role: c.fitzgerald_role ?? "Yellow" });
    // 028 § 5.2: the supporter sees the voice state on the tile while a
    // mint is in flight or queued. The child hears silence until ready.
    const vst = tileApi.status(c.label);
    if (vst && vst !== "ready") {
      const b = document.createElement("span");
      b.className = "vbadge";
      b.textContent = tileStateBadge(vst);
      el.appendChild(b);
    }
    loadPhotoURL(photoFor(c.entity_id)).then((url) => {
      if (!url) return;
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      el.querySelector(".tart").appendChild(img);
      el.classList.add("photo");
    });
    return { el, say: c.label };
  }
  if (masked.has(c.sense_id)) {
    const ghost = wordTile({ label: c.label, role: c.fitzgerald_role, art: metaFor(c.sense_id).art });
    ghost.classList.add("masked");
    ghost.disabled = true;
    return { el: ghost, say: null };
  }
  const say = shownLabel(c.sense_id, c.label);
  return { el: wordTile({ label: say, role: c.fitzgerald_role, art: metaFor(c.sense_id).art }), say };
}

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
  grid.style.gridTemplateColumns = `repeat(${geom.cols}, minmax(0, 1fr))`;
  grid.style.gridTemplateRows = `repeat(${geom.rows}, minmax(0, 1fr))`;
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
      el.innerHTML = `<span class="glyph"><img class="gicon" src="/icons/folder.svg" alt=""></span>`;
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
      const { el } = homeTile(c, masked);
      el.dataset.slot = slot;
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
    const { el, say: cellLabel } = homeTile(c, masked);
    if (cellLabel === null) {
      grid.appendChild(withCount(el, "sense", c.sense_id));
      continue;
    }
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
      el.addEventListener("click", () => tap(cellLabel, "sense", c.sense_id));
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
    for (const c of stripRanked(db, sents, Date.now(), locale, phrases).shown) {
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
/** 023 §1e — the Settings PIN gates Settings. Every open asks once a
 *  PIN is set. Forgot: type the reset phrase, then choose a new PIN
 *  twice — the words are never touched. `change` (from Settings →
 *  Backup & privacy) asks for the new PIN twice and never for the old
 *  one: the gate was just passed. */
const PIN_SHARE_HINT = "Pick one you're happy to share with the team. Don't reuse your phone or bank PIN.";
async function gatePin(onOk, { change = false } = {}) {
  const overlay = $("pinform"), input = $("pin-input"),
        err = $("pin-error"), hint = $("pin-hint"),
        title = $("pin-title"), go = $("pin-go"), forgot = $("pin-forgot");
  const store = await openKeyStore();
  const locked = await hasPin(store);
  // No PIN yet: Settings opens with one tap (founder 2026-09-28).
  if (!change && !locked) return onOk();
  let mode = change ? "new" : "check";
  let reset = false;
  let first = "";
  const render = () => {
    const phrase = mode === "forgot";
    err.textContent = "";
    input.value = "";
    input.type = phrase ? "text" : "password";
    input.inputMode = phrase ? "text" : "numeric";
    input.maxLength = phrase ? 20 : 4;
    go.hidden = !phrase;
    input.classList.toggle("phrase", phrase);
    input.placeholder = phrase ? "" : mode === "check" ? "" : "4 digits";
    forgot.hidden = mode !== "check";
    if (mode === "new") {
      title.textContent = reset ? "Choose a new PIN" : locked ? "New Settings PIN" : "Choose a PIN";
      hint.textContent = "4 digits, for everyone on this device. " + PIN_SHARE_HINT;
    } else if (mode === "confirm") {
      title.textContent = "Type it again";
      hint.textContent = "The same 4 digits, to be sure.";
    } else if (mode === "check") {
      title.textContent = "Settings PIN";
      hint.textContent = "";
    } else {
      title.textContent = "Forgot the PIN?";
      const word = document.createElement("strong");
      word.textContent = RESET_PHRASE;
      hint.replaceChildren("Your words stay just as they are. To choose a new PIN, type ",
        word, " below.");
      go.textContent = "Continue";
    }
    input.focus();
  };
  const finish = () => { overlay.classList.remove("open"); onOk(); };
  go.onclick = async () => {
    const v = input.value.trim();
    if (mode === "check") {
      if (await checkPin(store, v)) return finish();
      input.value = "";
      err.textContent = "Not that PIN.";
      return;
    }
    if (mode === "forgot") {
      if (isResetPhrase(v)) { reset = true; mode = "new"; render(); }
      else err.textContent = `Type the two words: ${RESET_PHRASE}`;
      return;
    }
    if (!PIN_RE.test(v)) { err.textContent = "4 digits."; return; }
    if (mode === "new") { first = v; mode = "confirm"; render(); return; }
    if (mode === "confirm" && v !== first) {
      mode = "new"; render();
      err.textContent = "Those didn't match. Start again.";
      return;
    }
    await setPin(store, v);
    if (reset) toast("New PIN saved.");
    else if (change) toast(locked ? "Settings PIN changed." : "Settings is locked with a PIN.");
    finish();
  };
  input.onkeydown = (e) => { if (e.key === "Enter") go.click(); };
  // Four digits is the whole PIN: act on the fourth, no button.
  input.oninput = () => {
    if (mode !== "forgot" && /^\d{4}$/.test(input.value)) go.click();
  };
  forgot.onclick = () => { mode = "forgot"; render(); };
  render();
  overlay.classList.add("open");
  input.focus();
}

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
        'set_family_items', 'spot_list_save', 'set_group_hidden', 'move_group', 'swap_groups',
        'delete_group') LIMIT 1`)[0],
    pinOn,
  }),
});
/** Settings → Backup & privacy → Settings PIN: lock, change, or off. */
let pinOn = false; // Settings' Protect card reads it; renderPinRow keeps it
async function renderPinRow() {
  const on = await hasPin(await openKeyStore());
  pinOn = on;
  settingsUi.renderNav();
  $("pin-state").textContent = on
    ? "Settings is locked with a PIN."
    : "No PIN yet: Settings opens with one tap.";
  $("pin-change").textContent = on ? "Change PIN" : "Lock Settings with a PIN";
  $("pin-off").hidden = !on;
}
$("pin-change").addEventListener("click", () => gatePin(renderPinRow, { change: true }));
$("pin-off").addEventListener("click", async () => {
  await clearPin(await openKeyStore());
  toast("PIN turned off. Settings opens with one tap.");
  renderPinRow();
});
settingsUi.onOpen(renderPinRow);
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
  isTxBusy: () => txBusy,
  showGroupHint, applyLikely, fitLabels, senseById,
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
  setViewName: (v) => { view = v; syncCorner(); renderStrip(); },
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
/* Groups (027 B6, B8): the home top row on every group page, and the
 * four meal groups in the index. Both default ON; neither moves a cell —
 * off leaves the top-row cells empty and the meal doors' slots kept. */
function syncGroupSegs() {
  const p = ALL(db,
    "SELECT group_top_row AS t, occasions_visible AS o FROM learner_profile WHERE id = 'prf_local'",
  )[0] ?? {};
  for (const [id, on] of [["group-toprow", (p.t ?? 1) === 1], ["group-occasions", (p.o ?? 1) === 1]]) {
    for (const b of $(id).querySelectorAll("button")) b.classList.toggle("on", (b.dataset.v === "1") === on);
  }
}
for (const [id, key] of [["group-toprow", "group_top_row"], ["group-occasions", "occasions_visible"]]) {
  $(id).addEventListener("click", (e) => {
    const v = e.target.closest("button")?.dataset.v;
    if (v === undefined) return;
    setSetting(db, key, Number(v));
    syncGroupSegs();
    rerenderView();
  });
}
syncGroupSegs();
/* Grammar help (021) — forms on/off. Off is instant: tiles, bar, and
 * speech fall back to lemma labels on the next paint. */
function syncGrammarSeg() {
  grammarHelp = grammarHelpOn(db);
  for (const b of $("grammar-help").querySelectorAll("button")) {
    b.classList.toggle("on", (b.dataset.v === "1") === grammarHelp);
  }
}
$("grammar-help").addEventListener("click", (e) => {
  const v = e.target.closest("button")?.dataset.v;
  if (v === undefined) return;
  setSetting(db, "grammar_help", Number(v));
  syncGrammarSeg();
  renderBar();
  renderGrid();
  renderStrip();
  rerenderView();
});
syncGrammarSeg();
/* Expressive voice (025 § 6) — the feeling faces. Off is instant: the
 * last slot returns to word suggestions, everything speaks neutral. */
function syncExpressiveSeg() {
  expressiveVoice = expressiveOn(db);
  for (const b of $("expressive-voice").querySelectorAll("button")) {
    b.classList.toggle("on", (b.dataset.v === "1") === expressiveVoice);
  }
}
$("expressive-voice").addEventListener("click", (e) => {
  const v = e.target.closest("button")?.dataset.v;
  if (v === undefined) return;
  setSetting(db, "expressive_voice", Number(v));
  syncExpressiveSeg();
  renderStrip();
});
syncExpressiveSeg();
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
$("anchor-groups").addEventListener("click", () =>
  view === "groupIndex" ? kbUi.setView("board") : groupsUi.openGroupIndex());
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
  syncCorner();
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
  // A tile's picture is an <img>: a mouse drag would start the browser's
  // native image drag, which cancels the pointer stream (pointercancel)
  // before the move ever registers. The edit gesture owns the drag.
  el.addEventListener("dragstart", (e) => e.preventDefault());
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
function toast(text, undo, { actionLabel = null, onAction = null } = {}) {
  const el = $("toast");
  clearTimeout(toastTimer);
  $("toast-text").textContent = text;
  $("toast-undo").hidden = !undo;
  $("toast-act").hidden = !onAction;
  $("toast-act").textContent = actionLabel ?? "";
  el.hidden = false;
  $("toast-undo").onclick = () => { el.hidden = true; undo?.(); };
  $("toast-act").onclick = () => { el.hidden = true; onAction?.(); };
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
  shownLabel,
  navCell, editPointer, xBadge,
  openAddForm: (groupId, cell) => addUi.openAddForm(groupId, cell),
  openWordCard: (item) => wordCard.openWordCard(item),
  homeCells: () => coreCells(db, boardGeom().name, locale),
  homeTile,
  rerenderView: () => rerenderView(),
  loadPhotoURL, savePhoto, syncUploadBlob,
});

/* Add a word — public/board/add-flow.js */
addUi = mountAddFlow({
  db, locale, all: ALL, catalog, open, close, toast,
  savePhoto, syncUploadBlob, loadPhotoURL, artInto,
  invalidateIndex: () => kbUi.invalidateIndex(),
  rerenderView, renderStrip, renderLibrary: () => libUi.renderLibrary(),
  openAddToBoards: (item) => groupsUi.openAddToBoards(item),
  tile: tileApi,
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
  tile: tileApi,
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
});

/* Devices, users, and supporter sign-in — public/board/devices-ui.js */
const devicesUi = mountDevices({
  db, me, saveUser, userStore, flushDb, toast,
  initSync, onSyncApplied, onModel, qrcode, syncRekey,
});

/* People — public/board/people-ui.js: the Settings header switcher and
 * "When Pip opens". */
const peopleUi = mountPeople({
  me, userStore, keyStore: openKeyStore(), flushDb, settings: settingsUi,
  onHomeChanged: () => { devicesUi.renderAccount(); devicesUi.renderUsers(); },
});
settingsUi.onOpen(() => { peopleUi.closePop(); peopleUi.renderOpens(); });
/* Show groups — public/board/group-shows.js (Settings → Words). */
const groupShows = mountGroupShows({ db, locale, all: ALL, onChange: () => rerenderView() });
settingsUi.onOpen(() => groupShows.render());

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

/* First-open setup (014 § 9 ruling 1 + 009 slice 11, Word_Library §
 * 5.6): a new user gets the "Tell us about their world" guided pass —
 * People (names seat at mom/dad, 018 D1), Pets, Favorite foods, Places;
 * each step is skippable and files into its built-in group. The Parent
 * Corner offers the same pass again ("Tell us about their world"). */
const setupUi = mountSetup({
  db, locale, catalog, open, close, toast,
  savePhoto, syncUploadBlob, me, saveUser, flushDb,
  tile: tileApi,
  invalidateIndex: () => kbUi.invalidateIndex(),
  renderGrid, rerenderView, renderStrip,
});
$("open-setup").addEventListener("click", () => {
  close("menu");
  setupUi.openWizard();
});
/* Words only (Profile_Presentation_Modes § 2.2):
 * learner_profile.presentation_mode, synced. A display filter only — the
 * body class hides every picture (index.html .words-only); no cell moves. */
function syncLook() {
  const m = ALL(db,
    "SELECT presentation_mode AS m FROM learner_profile WHERE id = 'prf_local'",
  )[0]?.m ?? "symbol";
  document.body.classList.toggle("words-only", m === "label");
  for (const b of $("look-seg").querySelectorAll("button")) b.classList.toggle("on", b.dataset.v === m);
}
function setLook(v) {
  setSetting(db, "presentation_mode", v);
  syncLook();
  renderGrid();
  renderBar();
  renderStrip();
  rerenderView();
}
$("look-seg").addEventListener("click", (e) => {
  const v = e.target.closest("button")?.dataset.v;
  if (v) setLook(v);
});
syncLook();
/* Voice — public/board/voice-ui.js (Settings → Talking). One voice per
 * board: word clips and sentence voice together; the sample is the
 * demo sentence. */
const SAMPLE_TEXT = "I want an apple.";
async function sampleVoice(id) {
  if (id !== voiceId) return; // only the board's voice can speak today
  const blob = await sentenceVoice.request({
    userId: me.id, license: await voiceLicense(), voice: grokVoice,
    text: SAMPLE_TEXT, feeling: "neutral", deadlineMs: 1500,
  }).catch(() => null);
  if (blob) return playBlob(blob);
  // Offline or unlicensed: the word clips, in the same voice.
  endPlaying();
  for (const [text, sid] of [["I", senseIdOf("I")], ["want", "sns_0013"], ["apple", "sns_0128"]]) {
    await speakItem({ kind: sid ? "sense" : "typed", id: sid, text }, { chained: true });
  }
}
function senseIdOf(text) {
  return ALL(db, `SELECT sense_id AS id FROM label WHERE text = ? AND kind = 'lemma'
    AND status = 'approved' AND locale = ?`, [text, locale])[0]?.id ?? null;
}
const voiceUi = mountVoice({
  db, locale, open,
  getVoiceId: () => voiceId,
  chooseVoice: async (id) => {
    if (id === voiceId) return;
    // 028 § 5.4: the old voice keeps playing while the new voice's clips
    // fill (hits for seeded words, mints for the family's own). Only a
    // clean fill swaps — failures leave the old voice active.
    const texts = ALL(db,
      "SELECT spoken_name AS t FROM personal_entity WHERE status = 'active'")
      .map((r) => r.t);
    toast(`Making ${voiceName(db, id)}'s voice…`);
    const res = await tileApi.prefetch(texts, {
      voice: id,
      onProgress: (p) =>
        toast(`Making ${voiceName(db, id)}'s voice, ${p.done + p.failed} of ${texts.length}`),
    });
    if (res.failed) {
      toast(`Couldn't finish ${voiceName(db, id)}'s voice — try again when you're online.`);
      return;
    }
    setSetting(db, "preferred_voice_id", id);
    voiceId = resolveProfile(db).voiceId;
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
  setLook,
  say: (text) => speak(text), // the welcome talks — users can't read
  tileFor: (senseId) => {
    const w = senseById(senseId);
    return wordTile({ label: w?.label ?? "", role: w?.fitzgerald_role, art: metaFor(senseId).art });
  },
  fitLabels,
  onDone: () => { renderGrid(); renderStrip(); tourUi.start(); },
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
    say: (text) => speak(text), // instruction cards — the device voice
    openVoices: () => gatePin(() => { settingsUi.open("talking"); voiceUi.openPicker(); }),
  },
});
$("replay-tour").addEventListener("click", () => { close("menu"); tourUi.start(); });
if (me.needsSetup) onramp.start();

/* QR card — public/board/recovery-ui.js */
mountRecovery({
  me, saveUser, userStore, flushDb, toast, qrcode,
  userClient: () => devicesUi.userClient(),
  ensureUser: (o) => devicesUi.ensureUser(o),
});

/* Web editor — public/board/editor-ui.js */
editorUi = mountEditor({
  db, locale, all: ALL, catalog,
  openAddForm: (groupId, cell) => addUi.openAddForm(groupId, cell),
  paintGroupPage: (zg, opts) => groupsUi.paintGroupPage(zg, opts),
  renderLibrary: () => libUi.renderLibrary(),
  invalidateIndex: () => kbUi.invalidateIndex(),
  setView: (v) => kbUi.setView(v),
  toast, close, savePhoto, syncUploadBlob,
  tile: tileApi,
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
