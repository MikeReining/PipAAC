/**
 * A move drawn as what you press (032 E5): the real board tiles and the
 * real ✨ / ❓ button, in order, with arrows — never the words "tap more".
 * Adults tap pictures, not labels, so instructions show pictures. Used
 * by Try it's cards and the Spotlight page's recipes.
 *
 * `steps` are targets ("sense:<id>" or "control:<name>");
 * `done` marks how many are already pressed; the next one is outlined.
 */
import { CONTROLS } from "../shared/spotlight.mjs";

export function moveRow(steps, { tileFor, done = -1, mark = {} } = {}) {
  const row = document.createElement("div");
  row.className = "move-row";
  row.setAttribute("aria-hidden", "true"); // the card's words say it too
  steps.forEach((key, i) => {
    if (i) {
      const arrow = document.createElement("span");
      arrow.className = "move-arrow";
      arrow.textContent = "→";
      row.append(arrow);
    }
    const [kind, id] = key.split(":");
    const step = kind === "control" ? controlTile(id) : tileFor(id);
    step.classList.add("move-step");
    if (mark[key]) step.classList.add(mark[key]); // e.g. glow / dimmed
    if (done >= 0) {
      if (i < done) step.classList.add("move-done");
      else if (i === done) step.classList.add("move-now");
    }
    row.append(step);
  });
  return row;
}

/** The sentence button as it looks in the top bar: its own icon, copied
 *  from the live button so the picture can never drift from the board. */
function controlTile(name) {
  const t = document.createElement("span");
  t.className = "move-ctl";
  const live = document.getElementById(CONTROLS[name]?.button);
  const svg = live?.querySelector("svg");
  if (svg) t.append(svg.cloneNode(true));
  else t.textContent = CONTROLS[name]?.label.split(" ")[0] ?? "";
  return t;
}
