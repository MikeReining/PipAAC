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
 * speaks through the normal sentence voice. The cards' words are said
 * aloud through the device voice — users can't read, so every step is
 * heard, not just seen. Each instruction speaks after the audio it
 * follows so they never overlap.
 */

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

  const steps = [
    { say: "Tap want.", target: () => board.cellEl(SCRIPT.want) },
    { say: "Now tap apple in the Smart bar.", target: () => document.querySelector("#tray .pred:not(.ghost)") },
    { say: "Tap ✨ to make it a sentence.", target: () => $("tx-fix") },
    { say: "Now tap ⏪ to say it in the past.", target: () => $("tx-past") },
    { say: "That's Pip. Now try your own.", target: () => null, done: true },
  ];

  function place() {
    const t = target();
    if (!ring) return;
    if (!t) { ring.hidden = true; return; }
    const r = t.getBoundingClientRect();
    ring.hidden = false;
    Object.assign(ring.style, {
      left: `${r.left - 6}px`, top: `${r.top - 6}px`,
      width: `${r.width + 12}px`, height: `${r.height + 12}px`,
    });
    // The card sits away from the target: bottom unless the target is low.
    card.classList.toggle("top", r.top > innerHeight * 0.55);
  }

  function show(i) {
    step = i;
    const s = steps[i];
    target = s.target;
    card.replaceChildren();
    const text = document.createElement("p");
    text.className = "tour-say";
    text.textContent = s.say;
    card.append(text);
    const row = document.createElement("div");
    row.className = "tour-row";
    if (s.done) {
      const note = document.createElement("p");
      note.className = "tour-note";
      note.textContent = navigator.onLine === false
        ? "✨ and the time buttons need the internet to work on your own sentences. Connect when you can."
        : "✨ and the time buttons work on any sentence you build.";
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

  /** Play a recorded clip if it ships; else speak the bar. */
  async function sayBar(name) {
    try {
      const res = await fetch(`/audio/onramp/${name}.mp3`, { method: "HEAD" });
      if (res.ok && res.headers.get("content-type")?.startsWith("audio/")) {
        const a = new Audio(`/audio/onramp/${name}.mp3`);
        const played = await a.play().then(() => true, () => false);
        if (played) {
          await new Promise((r) => { a.onended = r; a.onerror = r; });
          return;
        }
      }
    } catch { /* offline or missing — the voice path below */ }
    await board.speakBar();
  }

  // Board hooks while the tour runs (board.js checks `active`).
  const hooks = {
    async onTap(kind, id) {
      // Advance first: adding the word repaints the Smart bar, which
      // must already see the next step's card. The next instruction
      // speaks after the word's own audio lands.
      if (step === 0 && id === SCRIPT.want) {
        show(1); await board.addWord(SCRIPT.want); board.say(steps[1].say);
      } else if (step === 1 && id === SCRIPT.apple) {
        show(2); await board.addWord(SCRIPT.apple); board.say(steps[2].say);
      }
    },
    stripItems: () => (step === 1 ? [{ kind: "sense", id: SCRIPT.apple }] : []),
    async onTransform(mode) {
      if (step === 2 && mode === "fix") {
        board.setBar(SCRIPT.fix, "fix");
        show(3);
        await sayBar("i-want-an-apple");
        board.say(steps[3].say);
      } else if (step === 3 && mode === "past") {
        board.setBar(SCRIPT.past, "past");
        show(4);
        await sayBar("i-wanted-an-apple");
        board.say(steps[4].say);
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
    board.setTour(hooks);
    document.body.classList.add("touring");
    ring = document.createElement("div");
    ring.className = "tour-ring";
    card = document.createElement("div");
    card.className = "tour-card";
    card.setAttribute("role", "status");
    document.body.append(ring, card);
    show(0);
    board.say(steps[0].say);
    timer = setInterval(place, 250);
  }

  return { start, end };
}
