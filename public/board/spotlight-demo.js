/**
 * Try it (032 C, E): a spotlight on this person's own board, with four
 * coach cards. The adult sees the real thing instead of a video — and on
 * the third card, the move only Pip has: two words, then ✨.
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
import {
  SHOWCASE, showcaseLit,
} from "../shared/spotlight_starters.mjs";
import { moveRow } from "./move-row.js";

// One worked example from start to end (SHOWCASE): the Spotlight page's
// picture, then these cards, use the same tiles and the same glow. Card 1
// is a comparison — two labelled groups, no arrow (an arrow read as word
// order). Card 2 asks for the dimmed word the page's picture tapped.
// Card 3 builds the move from what they've seen: more (glowing) + that
// same word + ✨ — so its new glow reads as the next step, not a new
// example.
const GLOWS = SHOWCASE.tiles.filter(showcaseLit);
const DIMS = SHOWCASE.tiles.filter((id) => !showcaseLit(id));
const TAP = `sense:${SHOWCASE.tap}`;
const MOVE = [`sense:${SHOWCASE.lead}`, TAP, "control:fix"];
const STEPS = [
  { say: "These words glow. The rest dim.", note: "Nothing moved, and nothing is switched off.", go: "Next",
    compare: true },
  { say: "Tap a dimmed word, like this one.", note: "It still speaks. Spotlight never takes a word away.", go: "Next",
    show: () => ({ steps: [TAP], mark: { [TAP]: "dimmed" } }) },
  { say: "Now Spotlight lights a move. Tap these, in order.", note: "✨ turns two words into a whole sentence and says it.", go: "Next", move: true,
    show: (moved) => ({ steps: MOVE, done: moved }) },
  { say: "Tap this to end a spotlight.", note: "While one runs, it sits up top. Next, pick your own words in Settings → Spotlight.", go: "Done",
    chip: true },
];
const MAX_MS = 120000;

export function mountSpotlightDemo({ db, board, tileFor, openSettings }) {
  let card = null;
  let step = 0;
  let timer = null;
  let moved = 0; // how much of MOVE has been pressed, in order

  function paint() {
    const s = STEPS[step];
    card.replaceChildren();
    const count = document.createElement("p");
    count.className = "tour-note";
    count.textContent = `Try Spotlight · ${step + 1} of ${STEPS.length}`;
    const say = document.createElement("p");
    say.className = "tour-say";
    say.textContent = s.say;
    const note = document.createElement("p");
    note.className = "tour-note";
    note.textContent = s.note;
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
    go.onclick = () => (step < STEPS.length - 1 ? next() : end());
    row.append(stop, go);
    card.append(count, say, ...(picture ? [picture] : []), note, row);
    // The last card points at the chip; the others keep it plain. The
    // move card sits low, away from the top bar's ✨.
    document.getElementById("spot-chip").classList.toggle("spot-demo-point", step === STEPS.length - 1);
    card.classList.toggle("top", step === STEPS.length - 1);
  }

  /** Advance after a beat — unless Next or End got there first. */
  function later(ms) {
    const at = step;
    setTimeout(() => { if (card && step === at) next(); }, ms);
  }

  function next() {
    step += 1;
    moved = 0;
    if (STEPS[step].move) startSpotlight(db, MOVE, "Try it");
    else if (STEPS[step - 1].move) board.clearBar();
    paint();
    board.repaint();
  }

  function start() {
    board.showBoard();
    // Exactly the example's glowing tiles — the board, the page's picture,
    // and card 1 then show the same words lit (founder, 2026-09-30).
    startSpotlight(db, GLOWS.map((id) => `sense:${id}`), "Try it");
    board.setDemo({
      onTap(kind, id) {
        // Step 2 is done the moment a dimmed word speaks.
        const lit = spotlight()?.targets.has(`${kind}:${id}`);
        if (step === 1 && !lit) later(700);
        // The move card ticks off each tile pressed in order.
        if (STEPS[step]?.move && MOVE[moved] === `${kind}:${id}`) {
          moved += 1;
          paint();
        }
      },
      buildsBar: () => !!STEPS[step]?.move,
      // ✨ spoke the sentence: the move is done.
      onTransform: (mode) => {
        if (!STEPS[step]?.move) return;
        if (MOVE[moved] === `control:${mode}`) { moved += 1; paint(); }
        later(1200);
      },
      end,
    });
    step = 0;
    moved = 0;
    card = document.createElement("div");
    card.className = "tour-card spot-demo-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Try Spotlight");
    document.body.append(card);
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
