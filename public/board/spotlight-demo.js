/**
 * Try it (032 C, E): a spotlight on this person's own board, with five
 * coach cards. The adult sees the real thing instead of a video — and on
 * cards 3 and 4, the moves only Pip has: two words, then ✨ adds the
 * little words; the same two words, then ❓ asks them.
 *
 * Local layer only: no spotlight_session row and no sync op, so linked
 * devices never see it and it cannot outlive the demo. While it runs a
 * board tap never reaches the tap log, the sentence row, or the ranker —
 * these are an adult's taps, not the child's. The child's bar is set
 * aside and comes back after. The ✨ press is a real transform (the
 * first-run tour already scripts one; this one is live). It ends on
 * Done, on the 🔦 chip, or by itself after two minutes, and any real
 * session that was running comes back.
 */
import { endSpotlight, resumeSession, spotlight, startSpotlight } from "../shared/spotlight.mjs";
import { barControls } from "../shared/bar.mjs";
import { appRoot } from "./viewport.js";
import {
  SHOWCASE, showcaseLit,
} from "../shared/spotlight_starters.mjs";
import { moveRow } from "./move-row.js";
import { withIcons } from "./inline-icons.js";

// One worked example from start to end (SHOWCASE): the Spotlight page's
// picture, then these cards, use the same tiles and the same glow. Card 1
// is a comparison — two labelled groups, no arrow (an arrow read as word
// order). Card 2 asks for the dimmed word the page's picture tapped.
// Cards 3 and 4 light the showcase pair: ✨ adds the little words ("We
// are playing."), then ❓ asks the same taps ("Are we playing?") — the
// wand law's grammar pass, both outputs proven in the battery. After each
// press the card shows her taps → what Pip said, so nothing is hidden.
const GLOWS = SHOWCASE.tiles.filter(showcaseLit);
const DIMS = SHOWCASE.tiles.filter((id) => !showcaseLit(id));
const TAP = `sense:${SHOWCASE.tap}`;
const PAIR = SHOWCASE.move.map((id) => `sense:${id}`);
const FIX = [...PAIR, "control:fix"];
const ASK = ["control:question"];
/* The cards are built per person (038): a card that teaches a button the
 *  bar hides is dropped. Without ✨ the ❓ card carries the whole move —
 *  two words, then the ask. */
function stepsFor(shown) {
  const steps = [
    { say: "These words glow. The rest dim.", note: "Nothing moved, and nothing is switched off.", go: "Next",
      compare: true },
    { say: "Tap a dimmed word, like this one.", note: "It still speaks. Spotlight never takes a word away.", go: "Next",
      show: () => ({ steps: [TAP], mark: { [TAP]: "dimmed" } }) },
  ];
  if (shown.has("fix")) {
    steps.push({ say: "Spotlight can light a move. Tap these, in order.",
      note: "✨ adds only the little words, like is, are, a, the. It never guesses or adds a word.",
      go: "Next", press: "fix", seq: FIX, lights: FIX, buildsBar: true });
  }
  if (shown.has("question")) {
    const solo = !shown.has("fix");
    steps.push({ say: solo ? "Spotlight can light a move. Tap these, in order." : "Now tap this.",
      note: solo
        ? "Two words, then ❓ asks them as a question. Nobody has to build it."
        : "❓ asks the same two words as a question. Nobody has to build it.",
      go: "Next", press: "question",
      seq: solo ? [...PAIR, ...ASK] : ASK, lights: [...PAIR, ...ASK],
      buildsBar: solo });
  }
  steps.push({ say: "Tap this to end a spotlight.", note: "While one runs, it sits up top. Next, pick your own words in Settings → Spotlight.", go: "Done",
    chip: true });
  return steps;
}
const MAX_MS = 120000;

export function mountSpotlightDemo({ db, board, tileFor, openSettings }) {
  let card = null;
  let step = 0;
  let steps = []; // built at start() from the person's bar setting (038)
  let timer = null;
  let moved = 0; // how much of this card's sequence has been pressed
  let before = ""; // the bar as tapped, before a button changed it
  let result = null; // "her taps" → "what Pip said", once pressed

  function paint() {
    const s = steps[step];
    card.replaceChildren();
    const count = document.createElement("p");
    count.className = "tour-note";
    count.textContent = `Try Spotlight · ${step + 1} of ${steps.length}`;
    const say = document.createElement("p");
    say.className = "tour-say";
    say.textContent = s.say;
    const note = document.createElement("p");
    note.className = "tour-note";
    withIcons(note, s.note);
    let picture = null;
    if (s.compare) {
      picture = document.createElement("div");
      picture.className = "move-compare";
      picture.setAttribute("aria-hidden", "true");
      for (const [label, ids, mark] of [["Glow", GLOWS, "glow"], ["Dim", DIMS, "dimmed"]]) {
        const group = document.createElement("div");
        group.className = "move-group";
        const tiles = document.createElement("div");
        tiles.className = "move-row";
        for (const id of ids) {
          const t = tileFor(id);
          t.classList.add(mark);
          tiles.append(t);
        }
        const cap = document.createElement("span");
        cap.className = "move-cap";
        cap.textContent = label;
        group.append(tiles, cap);
        picture.append(group);
      }
    } else if (s.show) {
      const { steps, done, mark } = s.show(moved);
      picture = moveRow(steps, { tileFor, done, mark });
    } else if (s.seq) {
      picture = moveRow(s.seq, { tileFor, done: moved });
    } else if (s.chip) {
      picture = document.createElement("div");
      picture.className = "move-row";
      const chip = document.createElement("span");
      chip.className = "move-chip";
      chip.textContent = document.getElementById("spot-chip").textContent;
      picture.append(chip);
    }
    const row = document.createElement("div");
    row.className = "tour-row";
    const stop = document.createElement("button");
    stop.className = "tour-skip";
    stop.textContent = "End";
    stop.onclick = () => end();
    const go = document.createElement("button");
    go.className = "btn";
    go.textContent = s.go;
    go.onclick = () => (step < steps.length - 1 ? next() : end());
    row.append(stop, go);
    // After the press: exactly what went in and what Pip said.
    const said = result ? [Object.assign(document.createElement("p"), {
      className: "move-result", textContent: result })] : [];
    card.append(count, say, ...(picture ? [picture] : []), ...said, note, row);
    // The last card points at the chip; the others keep it plain.
    document.getElementById("spot-chip").classList.toggle("spot-demo-point", step === steps.length - 1);
    requestAnimationFrame(place);
  }

  /** Never cover what the card asks for (founder, 2026-09-30: "play" sat
   *  behind the card). A tile to press in the lower part of the screen
   *  sends the card to the top — the first-run tour's rule. The chip
   *  card sits top, by the chip. */
  function place() {
    if (!card) return;
    const s = steps[step];
    const keys = s.seq ?? (s.show ? s.show(moved).steps : []);
    const low = keys.filter((k) => k.startsWith("sense:"))
      .map((k) => board.cellEl(k.slice(6))?.getBoundingClientRect())
      .some((r) => r && r.bottom > innerHeight * 0.55);
    card.classList.toggle("top", !!s.chip || low);
  }

  /** Advance after a beat — unless Next or End got there first. */
  function later(ms) {
    const at = step;
    setTimeout(() => { if (card && step === at) next(); }, ms);
  }

  function next() {
    step += 1;
    moved = 0;
    result = null;
    if (steps[step].lights) startSpotlight(db, steps[step].lights, "Try it");
    if (steps[step].chip) board.clearBar(); // the demo's sentence is done
    paint();
    board.repaint();
  }

  function start() {
    board.showBoard();
    steps = stepsFor(barControls(db));
    // Exactly the example's glowing tiles — the board, the page's picture,
    // and card 1 then show the same words lit (founder, 2026-09-30).
    startSpotlight(db, GLOWS.map((id) => `sense:${id}`), "Try it");
    board.setDemo({
      onTap(kind, id) {
        // Step 2 is done the moment a dimmed word speaks.
        const lit = spotlight()?.targets.has(`${kind}:${id}`);
        if (step === 1 && !lit) later(700);
        // A move card ticks off each tile pressed in order.
        const seq = steps[step]?.seq;
        if (seq && seq[moved] === `${kind}:${id}`) {
          moved += 1;
          before = board.barText();
          paint();
        }
      },
      buildsBar: () => !!steps[step]?.buildsBar,
      // The button spoke: show her taps → what Pip said, then move on.
      onTransform: (mode) => {
        const s = steps[step];
        if (s?.press !== mode) return;
        moved = s.seq.length;
        result = `“${before}” → “${board.barText()}”`;
        paint();
        later(2600);
      },
      end,
    });
    step = 0;
    moved = 0;
    card = document.createElement("div");
    card.className = "tour-card spot-demo-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Try Spotlight");
    appRoot().append(card);
    paint();
    board.repaint();
    timer = setTimeout(() => end(), MAX_MS);
  }

  function end() {
    if (!card) return;
    clearTimeout(timer);
    card.remove();
    card = null;
    document.getElementById("spot-chip").classList.remove("spot-demo-point");
    board.setDemo(null);
    endSpotlight();
    resumeSession(db); // a real session that was running relights
    board.repaint();
    openSettings("spotlight");
  }

  return { start, end, isOn: () => !!card };
}
