/**
 * Try it (032 C): a spotlight on this person's own board, with three
 * coach cards. The adult sees the real thing instead of a video.
 *
 * Local layer only: no spotlight_session row and no sync op, so linked
 * devices never see it and it cannot outlive the demo. While it runs a
 * board tap speaks the word and nothing else — no sentence, no tap log —
 * because these are an adult's taps, not the child's. It ends on Done,
 * on the 🔦 chip, or by itself after two minutes, and any real session
 * that was running comes back.
 */
import { endSpotlight, resumeSession, spotlight, startSpotlight } from "../shared/spotlight.mjs";
import { STARTER_LISTS, starterTargets } from "../shared/spotlight_starters.mjs";

const STEPS = [
  { say: "These words glow. The rest dim.", note: "Nothing moved, and nothing is switched off.", go: "Next" },
  { say: "Tap a dimmed word.", note: "It still speaks. Spotlight never takes a word away.", go: "Next" },
  { say: "Tap 🔦 to end a spotlight.", note: "While one runs, this sits up top. Next, pick your own words in Settings → Spotlight.", go: "Done" },
];
const MAX_MS = 120000;

export function mountSpotlightDemo({ db, board, openSettings }) {
  let card = null;
  let step = 0;
  let timer = null;

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
    card.append(count, say, note, row);
    // The last card points at the chip; the others keep it plain.
    document.getElementById("spot-chip").classList.toggle("spot-demo-point", step === STEPS.length - 1);
    card.classList.toggle("top", step === STEPS.length - 1);
  }

  function next() {
    step += 1;
    paint();
  }

  function start() {
    board.showBoard();
    startSpotlight(db, starterTargets(STARTER_LISTS[0]), "Try it");
    board.setDemo({
      onTap(kind, id) {
        // Step 2 is done the moment a dimmed word speaks.
        const lit = spotlight()?.targets.has(`${kind}:${id}`);
        if (step === 1 && !lit) setTimeout(next, 700);
      },
      end,
    });
    step = 0;
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
