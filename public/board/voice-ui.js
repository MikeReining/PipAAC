/**
 * Settings → Talking → Voice, and the voice picker sheet. Owns the
 * picker only: which voices exist comes from shared/voices.mjs (catalog
 * `voice` rows + the coming-soon lineup); choosing writes
 * learner_profile.preferred_voice_id through board.js (synced).
 *
 * 040: choosing a voice is a paid feature. After the trial a
 * non-default card shows a lock and its tap opens the Lifetime page;
 * the board voice itself reverts to the default in board.js.
 */
import { voiceChoices, voiceName } from "../shared/voices.mjs";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/* 043 E — ask the service worker whether a voice's clips are fully
 *  cached (its pack carries a completion sentinel; the SW answers from
 *  storage, not a guess). Pushed progress re-renders the badge. */
const offlineState = (id) => new Promise((res) => {
  if (!navigator.serviceWorker) return res(null);
  navigator.serviceWorker.ready.then((reg) => {
    if (!reg.active) return res(null);
    const ch = new MessageChannel();
    const t = setTimeout(() => res(null), 4000);
    ch.port1.onmessage = (e) => { clearTimeout(t); res(e.data ?? null); };
    reg.active.postMessage({ type: "pip-voice-status", voice: id }, [ch.port2]);
  }).catch(() => res(null));
});

export function mountVoice({ db, locale, open, getVoiceId, chooseVoice, sample, locked = () => false, onLocked = () => {} }) {
  function renderRow() {
    $("voice-name").textContent = voiceName(db, getVoiceId());
  }

  function card(v, { coming }) {
    const c = el("div", `voice-card${coming ? " coming" : ""}${v.id === getVoiceId() ? " on" : ""}`);
    const text = el("div", "voice-text");
    text.append(el("b", null, v.id ? voiceName(db, v.id) : v.name), el("span", null, v.note ?? ""));
    c.append(text);
    if (coming) {
      c.append(el("span", "voice-badge", "Coming soon"));
      return c;
    }
    // 040 — the default voice is free forever; every other voice locks
    // when the trial ends. The lock opens the page, never a dead button.
    if (locked() && !v.is_default && v.id !== getVoiceId()) {
      const pick = el("button", "btn secondary voice-pick", "🔒 Pip Lifetime");
      pick.onclick = () => onLocked();
      c.append(pick);
      return c;
    }
    const play = el("button", "btn secondary voice-play", "▶ Hear it");
    play.setAttribute("aria-label", `Hear ${voiceName(db, v.id)}`);
    play.onclick = () => sample(v.id);
    c.append(play);
    if (v.id === getVoiceId()) {
      c.append(el("span", "voice-badge current", "In use"));
      // 043 E — adults see whether this voice speaks without Wi-Fi.
      // The SW answers from the pack's completion sentinel, not a guess.
      const off = el("span", "voice-badge voice-offline", "");
      off.hidden = true;
      c.append(off);
      offlineState(v.id).then((s) => {
        if (!s) return;
        off.hidden = false;
        off.textContent = s.ready ? "Works offline"
          : s.hasOlder ? "Older voice keeps working offline"
          : "Downloading for offline…";
        off.classList.toggle("warn", !s.ready);
      });
    } else if (!navigator.onLine) {
      // 041 A3 — the new voice's clips live on the network. Offline the
      // card greys and says why; it never pretends a switch can happen.
      const pick = el("button", "btn voice-pick", "Needs Wi-Fi");
      pick.disabled = true;
      c.classList.add("offline");
      c.append(pick);
    } else {
      const pick = el("button", "btn voice-pick", "Use this voice");
      // 028 § 5.4: chooseVoice waits for the new voice's clips before
      // swapping — the picker redraws when it lands (or stays put on
      // failure, with the old voice still checked).
      pick.onclick = async () => { await chooseVoice(v.id); renderSheet(); renderRow(); };
      c.append(pick);
    }
    return c;
  }

  function renderSheet() {
    const { available, coming } = voiceChoices(db, locale);
    const now = $("voice-now");
    now.replaceChildren(...available.map((v) => card(v, { coming: false })));
    $("voice-now-row").hidden = !now.children.length;
    const soon = $("voice-soon");
    soon.replaceChildren(...coming.map((v) => card(v, { coming: true })));
    $("voice-soon-row").hidden = !soon.children.length;
    let offlineNote = $("voice-offline-note");
    if (!offlineNote) {
      offlineNote = el("p", "hint");
      offlineNote.id = "voice-offline-note";
      offlineNote.textContent = "Changing voices needs Wi-Fi.";
      now.after(offlineNote);
    }
    offlineNote.hidden = navigator.onLine;
  }

  function openPicker() {
    renderSheet();
    open("voiceform");
  }

  // Wi-Fi state can change mid-pick — repaint the cards when it does.
  addEventListener("online", renderSheet);
  addEventListener("offline", renderSheet);

  $("voice-change").addEventListener("click", openPicker);
  $("voice-hear").addEventListener("click", () => sample(getVoiceId()));

  // Re-render whichever surface is showing — the SW pushes progress.
  const refresh = () => { renderRow(); renderSheet(); };
  return { renderRow, openPicker, refresh };
}
