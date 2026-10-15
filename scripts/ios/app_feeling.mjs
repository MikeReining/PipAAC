/**
 * The expressive-voice faces (phase 044 D4; BS-24, SN-10): speech.js
 * speakFeeling and settings-sync.js "Try the faces", over app_say.mjs's
 * session state and speak pipeline. Exported as PIPCORE.faces.
 */
import { appSession } from "./app.mjs";
import { FEELINGS } from "../../public/shared/feeling.mjs";
import {
  X, trialActive, licenseOf, painted, emit, speakCore, sentenceVoice, SPEAK_VOICE_WAIT_MS,
} from "./app_say.mjs";

/** speech.js entitledNow: paid features on = a license or the trial clock
 *  still running. */
const entitledNow = async (x) => !!((await licenseOf(x)) || trialActive(x));

/** speech.js speakFeeling: a face tap speaks the bar in that feeling,
 *  once. Ignored with an empty bar or while a transform/face is in
 *  flight (txBusy). Entitled -> speakSentence(feeling). After the trial
 *  the face speaks the bar the free way (word-by-word, neutral) and the
 *  adult gets the ask once a session (askOnce). Like the web it does not
 *  restore a past/future bar first. The outcome arrives as a "say" event
 *  (play + toast + state); the face is dark until it does (`done`). */
export function speak(appId, feeling) {
  const s = appSession(appId);
  const x = X(s);
  if (!FEELINGS.includes(feeling) || x.busy || !s.sentence.length) {
    emit({ appId: s.appId, done: "face" }); // ignored: the face un-presses at once
    return painted(s);
  }
  x.busy = true;
  void (async () => {
    let toast = null;
    let play = null;
    if (await entitledNow(x)) {
      play = await speakCore(s, x, feeling);
    } else {
      if (!x.askShown) {
        x.askShown = true;
        toast = "A feeling voice comes with Pip Lifetime — the free trial has ended.";
      }
      play = await speakCore(s, x);
    }
    return { toast, play };
  })().then(
    ({ toast, play }) => {
      x.busy = false;
      emit({ appId: s.appId, play, toast, state: painted(s), done: "face" });
    },
    (e) => {
      x.busy = false;
      console.error(`say.speakFeeling: ${e}`);
      emit({ appId: s.appId, done: "face" });
    });
  return painted(s);
}

/** settings-sync.js "Try the faces": the sample sentence in a feeling, in
 *  the chosen voice. No word-clip fallback for a feeling - a null answer
 *  is the web's "Couldn't play that — try again online." toast. */
const SAMPLE_TEXT = "I want an apple.";
export function sample(appId, feeling) {
  const s = appSession(appId);
  const x = X(s);
  if (!FEELINGS.includes(feeling) || x.tryBusy) return { ok: false };
  x.tryBusy = true;
  void (async () => {
    const blob = await sentenceVoice.request({
      userId: x.userId, license: await licenseOf(x), trial: trialActive(x),
      voice: s.voiceId, text: SAMPLE_TEXT, feeling, deadlineMs: SPEAK_VOICE_WAIT_MS,
    }).catch(() => null);
    return blob?._file
      ? { play: [{ type: "file", key: blob._file }] }
      : { toast: "Couldn't play that — try again online." };
  })().then(
    (r) => { x.tryBusy = false; emit({ appId: s.appId, ...r, done: "try" }); },
    (e) => {
      x.tryBusy = false;
      console.error(`say.sampleFeeling: ${e}`);
      emit({ appId: s.appId, done: "try" });
    });
  return { ok: true };
}

