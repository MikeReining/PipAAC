/**
 * The sentence buttons and the cloud voice (phase 044 D4). Exported from
 * core_entry.mjs as PIPCORE.say.
 *
 * This is public/board/speech.js's transformAndSpeak / speakSentence /
 * speakItem(tileclip) / tileApi.ensure / refreshTrial, running over the
 * SAME shared clients the web uses, unchanged: txbar.mjs (bar state,
 * `sourceText` staleness), name_shield.mjs (masking), voice_sentence.mjs
 * (`/api/v1/voice/speak`) and voice_tile.mjs (`/api/v1/voice/tile`). The
 * iPad is not a new kind of client: the request bodies, headers, deadlines
 * and the cache keys are the web's (jsc_shims.mjs supplies fetch, timers,
 * Blob and Cache Storage over the host).
 *
 * A JSC caller cannot await a Promise, so every entry here returns at
 * once and the outcome leaves as ONE host event, "say":
 *   { appId, play: [slot] | null, toast: string | null, state: <painted> | null }
 * `play` is what the speaker should say now: a `file` slot (a cached cloud
 * clip - sentence or tile) or the word-by-word `clip` slots. Swift only
 * plays and paints.
 *
 * P6 (what is heard follows the latest request): `speakSeq` makes the
 * newest speak own the audio, `tapSeq` retires a pending tile fetch, and a
 * transform lands only if the bar still holds exactly what was sent. A
 * stale reply changes nothing on the bar, and (as speech.js) the press
 * still speaks the CURRENT bar - the abandoned reply's text is never sent
 * to the voice nor played.
 */
import { voiceSentence, sentenceSpeakText } from "../../public/shared/voice_sentence.mjs";
import { voiceTile } from "../../public/shared/voice_tile.mjs";
import { entityNames, maskNames } from "../../public/shared/name_shield.mjs";
import { normalizeV1 } from "../../public/shared/normalize.mjs";
import {
  applyTransform, restoreBar, snapshotBar, sourceText, wordLemmaCandidates,
} from "../../public/shared/txbar.mjs";
import { logTransform } from "../../public/shared/funnel.mjs";
import { refreshStatsDays } from "../../public/shared/stats.mjs";
import { openKeyStore } from "./host/sync_crypto_host.mjs";
import { onOnline } from "./host/platform_host.mjs";
import { appSession, appSpeakParts } from "./app.mjs";

/* speech.js constants - same numbers. */
const SPEAK_VOICE_WAIT_MS = 10_000;
const TRANSFORM_WAIT_MS = 15_000;

const sentenceVoice = voiceSentence();
const tileVoice = voiceTile();
const keys = openKeyStore();

const emit = (payload) =>
  globalThis.__pipHost.emit("say", JSON.stringify({ play: null, toast: null, state: null, ...payload }));

/** Per-session voice state (speech.js's closure variables). */
const sessions = new Map();
function X(s) {
  let x = sessions.get(s.appId);
  if (!x) {
    x = { userId: null, trialEndsAt: null, busy: false, askShown: false,
      speakSeq: 0, tapSeq: 0 };
    sessions.set(s.appId, x);
  }
  return x;
}
const trialActive = (x) => (x.trialEndsAt ?? 0) > Date.now();

/** speech.js voiceLicense, minus the localhost dev mint: the stored
 *  license (undefined when there is none, so the key drops out of the
 *  request body exactly as it does on the web). */
const licenseOf = async (x) => {
  try { return (await keys.get(`user/${x.userId}/license`)) || undefined; }
  catch { return undefined; }
};

const painted = (s) => appSpeakParts.state(s);

/* ---------------- identity + trial (speech.js refreshTrial) ---------------- */

/** The open person's id is the Worker's `user_id` (the web's `me.id`);
 *  the iPad's registry id is a UUID, as the Worker requires. Starts the
 *  trial clock (idempotent server side), mirrors it, drains queued mints
 *  and runs the daily replaced-clip sweep. */
export function identify(appId, userId) {
  const s = appSession(appId);
  const x = X(s);
  x.userId = userId;
  void boot(s, x);
  return { ok: true };
}

async function refreshTrial(x) {
  const license = await licenseOf(x);
  const okKey = `user/${x.userId}/trial-ok`;
  if (!(await keys.get(okKey).catch(() => null)) && !license) {
    const res = await fetch("/api/v1/trial/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id: x.userId }),
    }).catch(() => null);
    if (res?.ok) await keys.put(okKey, "1").catch(() => {});
  }
  const res = await fetch("/api/v1/trial", {
    headers: { "x-pip-user": x.userId, "x-pip-license": license ?? "" },
  }).catch(() => null);
  if (!res?.ok) return false;
  const body = await res.json().catch(() => ({}));
  x.trialLicensed = body.licensed === true;
  x.trialEndsAt = typeof body.endsAt === "number" ? body.endsAt : null;
  return true;
}

async function drain(x) {
  await tileVoice.drainQueue({
    userId: x.userId, license: await licenseOf(x), trial: trialActive(x) }).catch(() => {});
}

/** speech.js tileSweep: once a day per voice, evict the clips the Worker
 *  lists as replaced or withheld. */
async function sweep(s, x) {
  const key = `user/${x.userId}/tile-sweep:${s.voiceId}`;
  const since = Number(await keys.get(key).catch(() => 0) ?? 0);
  if (since && Date.now() - since < 86_400_000) return;
  const res = await tileVoice.sweepReplaced({
    userId: x.userId, license: await licenseOf(x), trial: trialActive(x),
    voice: s.voiceId, since,
  }).catch(() => null);
  if (res?.next) await keys.put(key, String(res.next)).catch(() => {});
}

async function boot(s, x) {
  await refreshTrial(x).catch(() => false);
  await drain(x);
  await sweep(s, x).catch(() => {});
}

/* The web's "online" listener: the offline queue drains on reconnect, and
 * a first run that started offline gets its trial clock now. */
onOnline(() => {
  for (const [id, x] of sessions) {
    if (!x.userId) continue;
    void (async () => {
      if (!trialActive(x)) await refreshTrial(x).catch(() => false);
      await drain(x);
    })();
    void id;
  }
});

/* ---------------- tile library (BS-10, KB-8) ---------------- */

/** speech.js tileApi.ensure - fire and forget. A committed typed word
 *  mints (supporter action; the Worker's entitled() + caps decide);
 *  transient failures queue for reconnect or the UTC roll. */
export function tileEnsure(s, text, source = "user_typed") {
  const x = X(s);
  if (!x.userId) return;
  void (async () => {
    await tileVoice.ensure({
      userId: x.userId, license: await licenseOf(x), trial: trialActive(x),
      voice: s.voiceId, locale: s.locale, text, source,
    }).catch(() => ({ ok: false, reason: "failed" }));
  })();
}

/** A tile-library slot -> a file slot (cache hit, or one ledger fetch
 *  behind the 900 ms tap deadline) or null = the silent slot. Tiles never
 *  speak through a device voice. */
async function tileFile(x, slot) {
  const r = await tileVoice.request({
    userId: x.userId, license: await licenseOf(x), trial: trialActive(x),
    voice: slot.voice, locale: slot.locale, text: slot.text,
  }).catch(() => null);
  return r?.ok && r.blob?._file ? { type: "file", key: r.blob._file } : null;
}

/** A tapped word's sound (speakItem for one tap). Returns the slot to
 *  play NOW; a tile-library word returns null and arrives later as a
 *  "say" event, unless another tap or speak came first. */
export function tapSpeech(s, speech) {
  const x = X(s);
  const t = ++x.tapSeq;
  if (speech?.type !== "tileclip") return speech;
  void (async () => {
    const file = await tileFile(x, speech);
    if (t !== x.tapSeq || !file) return;
    emit({ appId: s.appId, play: [file] });
  })();
  return null;
}

/* ---------------- speaking (speech.js speakSentence) ---------------- */

/** One speak. Resolves to the slots to play, or null when a newer
 *  request/edit owns the audio. A sentence of two or more words waits (up
 *  to SPEAK_VOICE_WAIT_MS) for the whole-sentence recording; anything else
 *  - offline, not entitled, over budget, stalled - falls to the word clips
 *  so she is always heard. */
async function speakCore(s, x) {
  const { prepareSpeak, finishSpeak, barSlots } = appSpeakParts;
  const seq = ++x.speakSeq;
  x.tapSeq++;
  prepareSpeak(s);
  const text = sentenceSpeakText(s.sentence);
  let play = null;
  if (s.sentence.length >= 2) {
    const blob = await sentenceVoice.request({
      userId: x.userId,
      license: await licenseOf(x),
      trial: trialActive(x),
      voice: s.voiceId,
      text,
      feeling: "neutral",
      deadlineMs: SPEAK_VOICE_WAIT_MS,
    });
    if (seq !== x.speakSeq) return null;
    // The bar changed mid-request: speak what it holds now, never the
    // stale recording (speech.js).
    if (text !== sentenceSpeakText(s.sentence)) return speakCore(s, x);
    if (blob?._file) play = [{ type: "file", key: blob._file }];
  }
  if (!play) {
    play = [];
    for (const slot of barSlots(s)) {
      if (slot.type === "tileclip") {
        const file = await tileFile(x, slot);
        if (seq !== x.speakSeq || text !== sentenceSpeakText(s.sentence)) return null;
        play.push(file ?? { type: "silence" });
      } else {
        play.push(slot);
      }
    }
  }
  finishSpeak(s);
  try { refreshStatsDays(s.d); } catch (e) { console.error(`stats: ${e}`); }
  return play;
}

/** Speak the bar as it stands (Enter on the keyboard, a same-state press);
 *  the outcome arrives as a "say" event. */
export function speakStart(s) {
  const x = X(s);
  void speakCore(s, x).then(
    (play) => { if (play) emit({ appId: s.appId, play, state: painted(s) }); },
    (e) => console.error(`say.speak: ${e}`));
}

/** ▶ - her exact words, never the model. On a past/future bar it first
 *  restores her taps. Ignored while a transform is in flight (it speaks on
 *  landing; a press now would read the pre-transform bar). */
export function speak(appId) {
  const s = appSession(appId);
  const x = X(s);
  if (!s.sentence.length || x.busy) return painted(s);
  restoreBar(s.sentence, s.barState);
  speakStart(s);
  return painted(s);
}

/* ---------------- ✨ ❓ ⏪ ⏩ (speech.js transformAndSpeak) ---------------- */

const NAMES = {
  fix: "Fix it", question: "Ask it",
  past: "Say it in the past", future: "Say it in the future",
};

/** txbar's display-only art for a model-supplied token (meta-cache.js
 *  artForWord): a label hit shows that sense's symbol; never a wrong one. */
function artForWord(s, word) {
  const w = normalizeV1(
    String(word).replace(/^[^\p{L}\p{N}'-]+|[^\p{L}\p{N}'-]+$/gu, ""));
  if (!w) return null;
  for (const cand of wordLemmaCandidates(w)) {
    const row = s.d.prepare(
      `SELECT l.sense_id FROM label l
       WHERE l.normalized_text = ? AND l.locale = ? AND l.status = 'approved'
       ORDER BY (l.kind = 'lemma') DESC, l.default_for_text DESC LIMIT 1`,
    ).all(cand, s.locale)[0];
    if (row) return appSpeakParts.metaFor(s, row.sense_id).art;
  }
  return null;
}

async function transformCore(s, x, mode) {
  const raw = sourceText(s.sentence, s.barState);
  const { masked, unmask } = maskNames(raw, entityNames(s.d));
  /* 043 D - bounded wait: a stalled transform must not pin `busy` or land
   * after the bar moved on. Aborted reads as null below. */
  let timedOut = false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, TRANSFORM_WAIT_MS);
  const res = x.userId
    ? await fetch("/api/v1/transform", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        user_id: x.userId, license: await licenseOf(x), mode, text: masked,
        // ❓ asks in the bar's tense; ⏪/⏩ on a question keep it one.
        tense: s.barState.tense,
        question: s.barState.question,
      }),
    }).catch(() => null)
    : null;
  clearTimeout(timer);
  const body = res ? await res.json().catch(() => ({})) : {};
  const out = res?.ok ? body.text : null;
  /* The bar must still hold exactly what we sent - a tap, typed word or
   * clear since then means this answer is stale and is dropped. */
  const fresh = sourceText(s.sentence, s.barState) === raw;
  let toast = null;
  if (out && fresh) {
    snapshotBar(s.sentence, s.barState); // her taps, saved before replace
    applyTransform(s.sentence, unmask(out), mode, s.barState);
    for (const it of s.sentence) {
      if (it.kind === "typed") it.art = artForWord(s, it.text);
    }
  } else if (!out) {
    const name = NAMES[mode] ?? "That button";
    if (!res) {
      toast = timedOut
        ? `${name} took too long — spoke it as it was.`
        : `${name} needs the internet — spoke it as it was.`;
    } else if (body?.error === "bad_license") {
      // 040 § 4 - trial over: the press still speaks the bar as built; the
      // adult gets the ask once per session, never a wall.
      if (!x.askShown) {
        x.askShown = true;
        toast = `${name} comes with Pip Lifetime — the free trial has ended.`;
      }
    } else if (body?.error === "fair_use") {
      toast = `${name} reached today's limit — it will be back tomorrow.`;
    } else {
      toast = `${name} couldn't work just now — spoke it as it was.`;
    }
  }
  // As the web: a stale reply changes nothing on the bar, but the press
  // still speaks - the CURRENT bar, never the abandoned reply's text.
  return { toast, play: await speakCore(s, x) };
}

/** One transform press. Same-state presses (❓ on a question, ⏪ on past,
 *  ⏩ on future) just re-speak, as board.js does. */
export function transform(appId, mode) {
  const s = appSession(appId);
  const x = X(s);
  if (!s.sentence.length || x.busy) return painted(s);
  const settled = (mode === "question" && s.barState.question)
    || (mode === "past" && s.barState.tense === "past")
    || (mode === "future" && s.barState.tense === "future");
  if (settled) { speakStart(s); return painted(s); }
  x.busy = true;
  logTransform(s.d, mode, 0);
  void transformCore(s, x, mode).then(
    ({ toast, play }) => {
      x.busy = false;
      if (toast || play) emit({ appId: s.appId, play, toast, state: painted(s) });
      else emit({ appId: s.appId, state: painted(s) });
    },
    (e) => { x.busy = false; console.error(`say.transform: ${e}`); });
  return painted(s);
}
