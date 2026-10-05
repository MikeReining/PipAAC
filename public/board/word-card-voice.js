/**
 * The word card's Voice row: the board voice and the family's own
 * recording side by side — tap one to hear it, and it becomes the voice
 * the child hears. 🎙 Record is the dashed tile at the end. After Stop
 * the recording plays back once, by itself, so a recording that can't
 * play is found the moment it's made, not on the child's board.
 * Switching back to the board voice keeps the recording offered: its
 * bytes stay (voice.mjs), so switching back costs nothing.
 */
import { clearOverride, latestRecording, overrideFor, setOverride } from "../shared/voice.mjs";

const $ = (id) => document.getElementById(id);

export function mountCardVoice({
  db, locale, all, toast, savePhoto, syncUploadBlob, speakItem, tile, getItem, isEnt,
}) {
  let recorder = null;
  let recChunks = [];
  let recStart = 0;
  let recTimer = null;

  /** What the recording binds to — an entity's id + spoken_name, or the
   *  locale lemma's utterance + spoken_text for a catalog word. */
  function target() {
    const it = getItem();
    if (!it) return null;
    if (it.item_kind === "entity") {
      const e = all(db, "SELECT spoken_name FROM personal_entity WHERE id = ?", [it.item_id])[0];
      return e ? { itemKind: "entity", itemId: it.item_id, text: e.spoken_name } : null;
    }
    const l = all(db,
      `SELECT l.utterance_id, u.spoken_text FROM label l
       JOIN utterance u ON u.id = l.utterance_id
       WHERE l.sense_id = ? AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = ?`,
      [it.item_id, locale])[0];
    return l ? { itemKind: "utterance", itemId: l.utterance_id, text: l.spoken_text } : null;
  }

  const recording = () => {
    const t = target();
    return t ? latestRecording(db, t.itemKind, t.itemId, t.text) : null;
  };
  const mineOn = () => {
    const t = target();
    return !!(t && overrideFor(db, t.itemKind, t.itemId));
  };
  const say = () => {
    const it = getItem();
    if (it) speakItem({ kind: it.item_kind, id: it.item_id });
  };

  /** 028 — the row's news (making / held …) with Try again where it heals. */
  function paint() {
    const it = getItem();
    if (!it) return;
    const mine = mineOn();
    const state = isEnt() ? tile?.status(it.label) : null;
    const status = $("wc-voice");
    status.textContent = state && state !== "ready" ? tile?.message(state, it.label) ?? "" : "";
    status.classList?.toggle("busy", state === "minting");
    $("wc-voicetry").hidden = !["failed", "offline", "unavailable"].includes(state);
    $("wc-voicename").textContent = tile?.name?.() ?? "Pip";
    $("wc-voicebase").classList.toggle("sel", !mine);
    $("wc-voicebase").setAttribute?.("aria-pressed", String(!mine));
    $("wc-voicemine").hidden = !recording();
    $("wc-voicemine").classList.toggle("sel", mine);
    $("wc-voicemine").setAttribute?.("aria-pressed", String(mine));
    const rec = recorder?.state === "recording";
    const b = $("wc-record");
    b.classList.toggle("rec", rec);
    b.classList.toggle("wc-add", !rec);
    if (rec) {
      const secs = Math.floor((Date.now() - recStart) / 1000);
      b.innerHTML = `<span class="wc-dot" aria-hidden="true"></span>Stop · 0:${String(secs).padStart(2, "0")}`;
    } else {
      b.textContent = recording() ? "🎙 Again" : "🎙 Record your voice";
    }
  }

  $("wc-voicebase").addEventListener("click", () => {
    const t = target();
    if (t && mineOn()) clearOverride(db, t.itemKind, t.itemId);
    paint();
    say();
  });

  $("wc-voicemine").addEventListener("click", () => {
    const t = target();
    const r = recording();
    if (t && r && !mineOn()) {
      setOverride(db, { itemKind: t.itemKind, itemId: t.itemId, key: r.key, recordedText: t.text });
    }
    paint();
    say();
  });

  $("wc-voicetry").addEventListener("click", () => {
    const it = getItem();
    if (!isEnt()) return;
    tile?.ensure(it.label, { source: "user_typed" }).catch(() => {});
    paint();
  });

  $("wc-record").addEventListener("click", async () => {
    if (recorder?.state === "recording") { recorder.stop(); return; }
    const t = target();
    if (!t) return;
    $("wc-rechint").hidden = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const before = overrideFor(db, t.itemKind, t.itemId)?.key ?? null;
      recorder = new MediaRecorder(stream);
      recChunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
      recorder.onstop = async () => {
        clearInterval(recTimer);
        stream.getTracks().forEach((tr) => tr.stop());
        paint();
        const blob = new Blob(recChunks, { type: recorder.mimeType });
        if (!blob.size) return;
        const { key, bytes } = await savePhoto(blob);
        syncUploadBlob(bytes).catch(() => {});
        setOverride(db, { itemKind: t.itemKind, itemId: t.itemId, key, recordedText: t.text });
        paint();
        say();
        toast(`Your voice plays for “${t.text}”`, () => {
          if (before) setOverride(db, { itemKind: t.itemKind, itemId: t.itemId, key: before, recordedText: t.text });
          else clearOverride(db, t.itemKind, t.itemId);
          paint();
        });
      };
      recorder.start();
      recStart = Date.now();
      clearInterval(recTimer);
      recTimer = setInterval(() => (recorder?.state === "recording" ? paint() : clearInterval(recTimer)), 500);
      paint();
    } catch {
      $("wc-rechint").hidden = false;
      $("wc-rechint").textContent = "No microphone — the browser did not allow it.";
    }
  });

  /** A card closing mid-take stops the take; nothing half-saved. */
  function stop() {
    if (recorder?.state === "recording") recorder.stop();
  }

  return { paint, stop };
}
