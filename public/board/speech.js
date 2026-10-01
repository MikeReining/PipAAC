/** Speech pipeline: the one Audio element, device-TTS lane, tile and
 *  sentence voice clips (Cache Storage + Worker mints), transform→speak,
 *  and the license plumbing. board.js owns the bar and the strip; this
 *  module owns everything that makes sound. Shared scalars arrive
 *  through `live` getters/setters; the object refs (sentence, barState)
 *  are shared directly. */
import { closeSentence, logTransform } from "../shared/funnel.mjs";
import { spotlight } from "../shared/spotlight.mjs";
import { openKeyStore } from "../shared/sync_crypto.mjs";
import { loadPhotoURL } from "../db.js";
import { resolveSlot } from "../shared/voice.mjs";
import { voiceName } from "../shared/voices.mjs";
import { sentenceSpeakText, voiceSentence } from "../shared/voice_sentence.mjs";
import { armUtcRollRetry, tileStateMessage, voiceTile } from "../shared/voice_tile.mjs";
import { entityNames, maskNames } from "../shared/name_shield.mjs";
import { applyTransform, snapshotBar, transformSource } from "../shared/txbar.mjs";
import { EOS, formFor } from "../shared/forms.mjs";

const $ = (id) => document.getElementById(id);
const ALL = (db, sql, p = []) => db.all(sql, p);
const RUN = (db, sql, p = []) => db.prepare(sql).run(...p);

export function mountSpeech({
  db, me, locale, sentence, barState, live,
  renderBar, renderStrip, renderGrid, rerenderView,
  scheduleStatsRefresh, artForWord, syncTxButtons,
}) {
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

  // 024/025: whole-sentence voice — Tier 1 Cache Storage + deadline.
  // Same voice_key as tiles (preferred_voice_id → voi_*_en).
  const sentenceVoice = voiceSentence();
  /* 024 rule 1, revised 2026-09-30 (founder): word-at-a-time clips are the
   * failure path, never the normal one — a speak waits for the whole-
   * sentence recording. A fresh ElevenLabs mint lands in a second or two;
   * this cap only bounds a genuinely stalled request. Offline, unlicensed,
   * and fair-use answers come back fast and fall to the clip loop at once —
   * she is always heard. */
  const SPEAK_VOICE_WAIT_MS = 10_000;
  // 028: tile voice library — entity names and committed typed words play
  // minted clips from Cache Storage + the ledger; never device TTS.
  const tileVoice = voiceTile();
  /* § 5.2 — the mint triggers are supporter actions (add, rename, bulk,
     setup, a committed typed word); a child tap only ever fetches. The
     states this tracks are what the tile badge and the word card show. */
  const tileApi = {
    name: () => voiceName(db, live.voiceId),
    status: (text) => tileVoice.status(live.voiceId, text),
    message: (state, text) => tileStateMessage(state, voiceName(db, live.voiceId), text),
    onStatus: (cb) => tileVoice.onStatus(cb),
    /** Fire-and-forget mint for one word — returns the outcome so the
     *  caller can message; failures that can heal are already queued. */
    ensure: async (text, { source = "user_typed" } = {}) =>
      tileVoice.ensure({
        userId: me.id, license: await voiceLicense(),
        voice: live.voiceId, locale, text, source,
      }).catch(() => ({ ok: false, reason: "failed" })),
    /** Sequential ensures (§ 5.3 bulk/prefetch) — hits are free, a budget
     *  answer pauses the run. `voice` overrides the board voice for the
     *  switch prefetch. */
    prefetch: (texts, { voice = live.voiceId, onProgress } = {}) =>
      voiceLicense().then((license) => tileVoice.prefetch({
        userId: me.id, license, voice, locale, texts, onProgress,
      })),
    /** § 5.5 — "Sounds wrong": flags the shared clip for founder review;
     *  the tile keeps playing meanwhile (a signal, never a takedown). */
    flag: async (text) => tileVoice.flag({
      userId: me.id, license: await voiceLicense(),
      voice: live.voiceId, locale, text,
    }).catch(() => false),
    /** Shared library voice on the board (not device TTS) → tiles resolve
     *  to minted clips, so flagging and the sweep apply. */
    shared: () =>
      ALL(db, "SELECT source AS s FROM voice WHERE id = ?", [live.voiceId])[0]?.s
        !== "device_tts",
  };
  let tileBadgeTimer = null;
  tileVoice.onStatus(() => {
    // Mint completions repaint the badge — debounced so a bulk run is one
    // repaint, not fifty.
    clearTimeout(tileBadgeTimer);
    tileBadgeTimer = setTimeout(() => { renderGrid(); renderStrip(); rerenderView(); }, 200);
  });
  /* § 5.3 — once a day per voice: evict hashes the Worker lists as
     replaced or withheld, so a rejected clip is not replayed from Cache
     Storage forever. `since` rides in localStorage; the first sweep asks
     for everything and afterwards it is a delta. */
  const tileSweep = async (voice = live.voiceId) => {
    const key = `pip-tile-sweep:${voice}`;
    const since = Number(localStorage.getItem(key) ?? 0);
    if (since && Date.now() - since < 86_400_000) return;
    const res = await tileVoice.sweepReplaced({
      userId: me.id, license: await voiceLicense(), voice, since,
    }).catch(() => null);
    if (res?.next) localStorage.setItem(key, String(res.next));
  };
  /* § 5.3 — prefetch on boot (idle) and the offline queue drain on
     reconnect. Active entity names are the family's own words: hits are
     free, misses mint inside the caps. */
  const tilePrefetch = async () => {
    const texts = ALL(db,
      "SELECT spoken_name AS t FROM personal_entity WHERE status = 'active'")
      .map((r) => r.t);
    await tileVoice.drainQueue({
      userId: me.id, license: await voiceLicense() }).catch(() => {});
    await tileSweep();
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
  /* The per-day budget rolls on the UTC day — queued "ready tomorrow"
     mints retry at the roll, not just on boot/reconnect (§ 5.2). */
  armUtcRollRetry(async () =>
    tileVoice.drainQueue({ userId: me.id, license: await voiceLicense() }));
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
  async function speakItem(item, { chained = false, voice = live.voiceId } = {}) {
    const slot = resolveSlot(db, item, locale, voice);
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

  addEventListener("online", () => { syncTxButtons(); renderStrip(); });
  addEventListener("offline", () => { syncTxButtons(); renderStrip(); });

  /** One transform press: mask her names → the Worker/Groq does the
   *  grammar → the result replaces the bar as typed words → it speaks
   *  through the 024 pipeline. A failed or offline call still speaks —
   *  the bar as built, per § 1's every-press-produces-audio rule.
   *  Every transform reads her saved taps (transformSource), never the
   *  last model output — chains can't compound a guess. */
  let txBusy = false;
  async function transformAndSpeak(mode) {
    if (live.tour) return live.tour.onTransform(mode);
    if (txBusy || !sentence.length) return;
    txBusy = true;
    // 032 E4: her press is the move Progress counts — never Try it's.
    if (!live.spotDemo) {
      logTransform(db, mode, !!spotlight()?.targets.has(`control:${mode}`));
      scheduleStatsRefresh();
    }
    const btn = $(`tx-${mode}`);
    btn?.classList.add("speaking");
    try {
      const raw = transformSource(sentence, barState)
        .map((it) => it.text).join(" ");
      const { masked, unmask } = maskNames(raw, entityNames(db));
      const res = await fetch("/api/v1/transform", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user_id: me.id, license: await voiceLicense(), mode, text: masked,
          // ❓ asks in the bar's tense; ⏪/⏩ on a question keep it one.
          tense: barState.tense,
          question: barState.question,
        }),
      }).catch(() => null);
      const out = res?.ok ? (await res.json().catch(() => ({}))).text : null;
      if (out) {
        snapshotBar(sentence, barState); // her taps, saved before replace
        applyTransform(sentence, unmask(out), mode, barState);
        for (const it of sentence) {
          if (it.kind === "typed") it.art = artForWord(it.text);
        }
        renderBar();
        renderStrip();
      }
      await speakSentence();
      live.spotDemo?.onTransform?.(mode);
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
    live.freshNext = live.freshAfterSpeak;
    // 022: Speak is sentence-final — the last word may take its absolute
    // form ("it is not my" -> "it is not mine"). Picked once, before
    // speaking, same as a tap's decision-4 but with EOS as the next word.
    if (live.grammarHelp && sentence.length) {
      const last = sentence[sentence.length - 1];
      if (last.kind === "sense" && last.id) {
        const f = formFor(db, live.formTable, sentence.slice(0, -1), last.id, EOS,
          last.features);
        if (f.text !== last.text) {
          last.text = f.text;
          last.labelId = f.labelId;
          last.features = f.features;
          if (live.sentenceId !== null) {
            const pos = sentence.slice(0, -1).filter((it) => it.id).length;
            RUN(db,
              "UPDATE learner_event_log SET label_id = ? WHERE sentence_id = ? AND position = ?",
              [f.labelId, live.sentenceId, pos]);
          }
          renderStrip();
        }
      }
    }
    // 024 rule 1 (revised 2026-09-30): the sentence voice is the speech —
    // wait out the mint, don't glue word clips. A single word is its own
    // clip, so the pipeline only ever requests real phrases; a face tap
    // requests every length: the shortest messages (*No!*, *Stop!*) are
    // often the most emotional (025 § 1). A null answer (stalled request,
    // offline, unlicensed, over budget) falls through to the clip loop —
    // she is always heard, the feeling is the extra (025 § 2).
    let spoken = false;
    if (sentence.length >= 2 || feeling) {
      const text = sentenceSpeakText(sentence);
      const blob = await sentenceVoice.request({
        userId: me.id,
        license: await voiceLicense(),
        voice: live.voiceId,
        text,
        feeling: feeling ?? "neutral",
        deadlineMs: SPEAK_VOICE_WAIT_MS,
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
    if (live.sentenceId !== null) {
      const sid = live.sentenceId;
      closeSentence(db, sid, Date.now(), "spoken", feeling);
      scheduleStatsRefresh();
      live.sentenceId = null;
      live.sentencePicks = 0;
      live.lastImpressionKey = null;
      live.openImpressionId = null;
      // 027 B10: Speak stays in the current group and page — no navigation
      // here, so a late callback can never undo where the user went since.
      renderStrip();
    }
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

  return {
    speak, speakItem, speakSentence, speakFeeling, transformAndSpeak,
    playClip, playBlob, endPlaying,
    tileApi, tileSweep, voiceLicense, syncSpeed,
    audio, sentenceVoice, SPEAK_VOICE_WAIT_MS,
    isTxBusy: () => txBusy,
  };
}
