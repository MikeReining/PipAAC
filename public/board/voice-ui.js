/**
 * Settings → Talking → Voice, and the voice picker sheet. Owns the
 * picker only: which voices exist comes from shared/voices.mjs (catalog
 * `voice` rows + the coming-soon lineup); choosing writes
 * learner_profile.preferred_voice_id through board.js (synced).
 */
import { VOICE_FILTERS, voiceChoices, voiceName } from "../shared/voices.mjs";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export function mountVoice({ db, locale, open, getVoiceId, chooseVoice, sample }) {
  let filter = "all";

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
    const play = el("button", "btn secondary voice-play", "▶ Hear it");
    play.setAttribute("aria-label", `Hear ${voiceName(db, v.id)}`);
    play.onclick = () => sample(v.id);
    c.append(play);
    if (v.id === getVoiceId()) {
      c.append(el("span", "voice-badge current", "In use"));
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
    const chips = $("voice-filters");
    chips.replaceChildren();
    for (const [key, label] of VOICE_FILTERS) {
      const b = el("button", key === filter ? "on" : "", label);
      b.onclick = () => { filter = key; renderSheet(); };
      chips.append(b);
    }
    const keep = (v) => filter === "all" || v.group === filter;
    const now = $("voice-now");
    now.replaceChildren(...available.filter(keep).map((v) => card(v, { coming: false })));
    $("voice-now-row").hidden = !now.children.length;
    const soon = $("voice-soon");
    soon.replaceChildren(...coming.filter(keep).map((v) => card(v, { coming: true })));
    $("voice-soon-row").hidden = !soon.children.length;
  }

  function openPicker() {
    filter = "all";
    renderSheet();
    open("voiceform");
  }

  $("voice-change").addEventListener("click", openPicker);
  $("voice-hear").addEventListener("click", () => sample(getVoiceId()));

  return { renderRow, openPicker };
}
