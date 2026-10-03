/**
 * The first-run demo (founder 2026-09-28): the wow before any setup.
 * want → apple (placed on the Smart bar for the tour) → ✨ Fix it →
 * "I want an apple." → ⏪ → "I wanted an apple." → "Now try your own."
 *
 * Scripted on purpose: it plays offline and instantly, and never
 * depends on what a model returns that day. Honesty rules:
 * - the scripted results must match what the live Fix it / past
 *   transform return for these words (founder check before launch);
 * - tour taps never reach the tap log, stats or the ranker — board.js
 *   routes taps, the Smart bar and transforms here while `active`;
 * - the last card says Fix it needs the internet on your own words.
 * Optional recorded clips (`/audio/onramp/<name>.mp3`) play when they
 * ship — founder listens first (AGENTS.md); until then the sentence
 * speaks through the normal sentence voice. The cards' instructions are
 * said aloud through shipped recordings in the product voice
 * (shared/onramp_audio.mjs — `clip` per step), never device TTS. Each
 * instruction speaks after the audio it follows so they never overlap.
 */

import { withIcons } from "./inline-icons.js";
import { appRoot } from "./viewport.js";

const $ = (id) => document.getElementById(id);

export const SCRIPT = {
  want: "sns_0013",
  apple: "sns_0128",
  fix: "I want an apple.",
  past: "I wanted an apple.",
};

export function mountTour({ board, saveUser }) {
  let step = -1;
  let ring = null;
  let card = null;
  let timer = null;
  let target = () => null;

  // `say` is the card's display text (withIcons renders ✨/⏪ as icons);
  // `clip` is the recording's key in shared/onramp_audio.mjs.
  // 038: only the buttons the person has — read at start() so a Replay
  // after a Settings change walks the bar as it is now. ⏪'s scripted
  // sentence follows ✨'s ("I want an apple" → "I wanted an apple"), so
  // it needs both.
  let steps = [];
  function buildSteps() {
    const shown = board.shownControls?.() ?? new Set(["fix", "past"]);
    steps = [
      { id: "want", say: "Tap want.", clip: "tour-want", target: () => board.cellEl(SCRIPT.want) },
      { id: "apple", say: "Now tap apple in the Smart bar.", clip: "tour-apple", target: () => document.querySelector("#tray .pred:not(.ghost)") },
    ];
    if (shown.has("fix")) {
      steps.push({ id: "fix", say: "Tap ✨ to make it a sentence.", clip: "tour-fix", target: () => $("tx-fix") });
    }
    if (shown.has("fix") && shown.has("past")) {
      steps.push({ id: "past", say: "Now tap ⏪ to say it in the past.", clip: "tour-past", target: () => $("tx-past") });
    }
    steps.push({ id: "done", say: "That's Pip. Now try your own.", clip: "tour-done", target: () => null, done: true });
  }

  function place() {
    const t = target();
    if (!ring) return;
    if (!t) { ring.hidden = true; return; }
    const r = t.getBoundingClientRect();
    // The ring is position:fixed inside #app, whose origin is the visual
    // viewport — subtract that origin so a leftover pan doesn't park the
    // ring a bar above the tile.
    const host = document.getElementById("app")?.getBoundingClientRect();
    ring.hidden = false;
    Object.assign(ring.style, {
      left: `${r.left - (host?.left ?? 0) - 6}px`,
      top: `${r.top - (host?.top ?? 0) - 6}px`,
      width: `${r.width + 12}px`, height: `${r.height + 12}px`,
    });
    const vh = window.visualViewport?.height ?? innerHeight;
    // The card sits away from the target: bottom unless the target is low.
    card.classList.toggle("top", r.top > vh * 0.55);
  }

  function show(i) {
    step = i;
    const s = steps[i];
    target = s.target;
    card.replaceChildren();
    const text = document.createElement("p");
    text.className = "tour-say";
    withIcons(text, s.say); // ✨ shows as the button's icon, not the emoji
    card.append(text);
    const row = document.createElement("div");
    row.className = "tour-row";
    if (s.done) {
      const note = document.createElement("p");
      note.className = "tour-note";
      withIcons(note, !steps.some((x) => x.id === "fix" || x.id === "past")
        ? "Build a sentence and ▶ speaks it."
        : navigator.onLine === false
          ? "✨ and the time buttons need the internet to work on your own sentences. Connect when you can."
          : "✨ and the time buttons work on any sentence you build.");
      card.append(note);
      // The first sentence is when a parent notices the voice: offer the
      // rest right here (founder 2026-09-29).
      const voices = document.createElement("button");
      voices.className = "btn secondary";
      voices.textContent = "Try other voices";
      voices.onclick = async () => { await end(); board.openVoices(); };
      const go = document.createElement("button");
      go.className = "btn";
      go.textContent = "Start talking";
      go.onclick = () => end();
      row.append(voices, go);
    } else {
      const skip = document.createElement("button");
      skip.className = "tour-skip";
      skip.textContent = "Skip";
      skip.onclick = () => end();
      row.append(skip);
    }
    card.append(row);
    place();
  }

  /** Play the shipped clip through the app's shared audio element — the
   *  same path every instruction clip uses, so play() runs inside the
   *  tap's gesture window. A fresh Audio element after an awaited HEAD
   *  fetch loses iOS user activation and never sounds. Missing or
   *  refused clips fall back to the live voice pipeline. */
  async function sayBar(name) {
    if (!(await board.say(name))) await board.speakBar();
  }

  // Board hooks while the tour runs (board.js checks `active`).
  const hooks = {
    async onTap(kind, id) {
      // Advance first: adding the word repaints the Smart bar, which
      // must already see the next step's card. The next instruction
      // speaks after the word's own audio lands.
      if (steps[step]?.id === "want" && id === SCRIPT.want) {
        show(step + 1); await board.addWord(SCRIPT.want); board.say(steps[step].clip);
      } else if (steps[step]?.id === "apple" && id === SCRIPT.apple) {
        show(step + 1); await board.addWord(SCRIPT.apple); board.say(steps[step].clip);
      }
    },
    stripItems: () => (steps[step]?.id === "apple" ? [{ kind: "sense", id: SCRIPT.apple }] : []),
    async onTransform(mode) {
      if (steps[step]?.id === "fix" && mode === "fix") {
        board.setBar(SCRIPT.fix, "fix");
        show(step + 1);
        await sayBar("i-want-an-apple");
        board.say(steps[step].clip);
      } else if (steps[step]?.id === "past" && mode === "past") {
        board.setBar(SCRIPT.past, "past");
        show(step + 1);
        await sayBar("i-wanted-an-apple");
        board.say(steps[step].clip);
      }
    },
  };

  async function end() {
    clearInterval(timer);
    ring?.remove();
    card?.remove();
    ring = card = null;
    document.body.classList.remove("touring");
    board.setTour(null);
    board.clearBar();
    await saveUser({ tourDone: true });
  }

  function start() {
    board.showBoard();
    buildSteps();
    board.setTour(hooks);
    document.body.classList.add("touring");
    ring = document.createElement("div");
    ring.className = "tour-ring";
    card = document.createElement("div");
    card.className = "tour-card";
    card.setAttribute("role", "status");
    appRoot().append(ring, card);
    show(0);
    board.say(steps[0].clip);
    timer = setInterval(place, 250);
  }

  return { start, end };
}
