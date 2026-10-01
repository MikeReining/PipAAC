/** The attention layer (013 § 2): a running spotlight glows its target
 *  words and dims the rest — every cell stays tappable and speaks;
 *  masked cells are skipped entirely (never unmask). This module owns
 *  the layer itself: the mark pass every renderer calls, the pick mode
 *  Set, live-model glows, the board chrome (Groups-anchor glow, end
 *  chip, control rings), and the synced dim/pulse settings. Spotlight
 *  lists and sessions live in shared/spotlight.mjs; board.js owns the
 *  taps that feed it and the halo/move-mark Sets it reads via `live`. */
import { CONTROLS, needsRouteWalk, spotlight } from "../shared/spotlight.mjs";
import { syncSendModel } from "../shared/sync.mjs";

const $ = (id) => document.getElementById(id);
const ALL = (db, sql, p = []) => db.all(sql, p);

export function mountSpotlightLayer({
  db, live,
  speakItem, syncTxButtons, renderGrid, rerenderView,
}) {
  /** Pulse rides the synced glow-style setting (013 § 4). */
  let spotPulse = false;

  /* --- pick mode (013 slice 2): an adult taps words on the board or in
   *  groups to choose targets; taps never speak while picking. `picking`
   *  is the Set of "kind:id" being chosen, or null when off. --- */
  let picking = null;

  /* --- live modeling (013 slice 4, § 4): a tap on the partner's device
   *  rides the ws to the child's board, glows the word a few seconds,
   *  then fades — or ends the moment the child taps it. Never saved,
   *  never in the sync log; the glow is silent unless the family turns
   *  on Speak (model_speaks). --- */
  let modeling = false;
  let modelSpeaks = false;
  const modelGlow = new Map(); // "kind:id" → fade timer
  const modelSent = new Set(); // local echo on the partner's device
  const MODEL_FADE_MS = 4000;

  /* --- The attention layer's one mark pass (013 § 2, slice 7): every
   *  use of "brighten some words, dim the rest" applies here — spotlight
   *  targets, live-model glows, the picker's chosen words, and (board
   *  cells only) the 014 move marks and the prediction halos. No renderer
   *  sets these classes on its own. --- */
  function layerMark(el, key, { board = false } = {}) {
    const [kind, id] = key.split(":");
    const s = spotlight();
    if (s) {
      if (s.targets.has(key)) {
        el.classList.add("glow");
        if (spotPulse) el.classList.add("pulse");
      } else {
        el.classList.add("dimmed");
      }
    }
    if (picking) el.classList.toggle("picked", picking.has(key));
    if (modelGlow.has(key) || modelSent.has(key)) el.classList.add("glow");
    if (board && kind === "sense" && live.movedSet.has(id)) el.classList.add("moved");
    if (board && kind === "sense" && live.likelySet.has(id)) el.classList.add("likely");
  }

  /** Read the spotlight settings and apply the dim token — called at boot
   *  and after a sync drain so a setting changed on the other device
   *  lands here. */
  function bindSpotSettings() {
    const p = ALL(db,
      "SELECT spot_dim, spot_pulse, model_speaks FROM learner_profile WHERE id = 'prf_local'",
    )[0] ?? {};
    document.documentElement.style.setProperty("--dim-o", (p.spot_dim ?? 45) / 100);
    spotPulse = (p.spot_pulse ?? 0) === 1;
    modelSpeaks = (p.model_speaks ?? 0) === 1;
  }

  function updatePickBar() {
    const n = picking?.size ?? 0;
    $("spot-pick-count").textContent = n
      ? `${n} picked` : "Tap the words you'll teach. Taps won't speak.";
    $("spot-pick-start").disabled = !picking?.size;
    $("spot-pick-save").disabled = !picking?.size;
  }
  function setPicking(on) {
    // Picking happens on the board: the editor has no pick marks.
    if (on && live.view === "editor") live.kbUi.setView("board");
    picking = on ? new Set() : null;
    syncTxButtons(); // ✨ / ❓ become choosable
    document.body.classList.toggle("picking", on);
    $("spot-pickbar").hidden = !on;
    if (on) updatePickBar();
    renderGrid();
    rerenderView();
  }

  function clearModel(key) {
    const t = key ? modelGlow.get(key) : undefined;
    if (t === undefined) return;
    clearTimeout(t);
    modelGlow.delete(key);
    renderGrid();
    rerenderView();
  }

  function setModeling(on) {
    modeling = on;
    document.body.classList.toggle("modeling", on);
    $("modelbar").hidden = !on;
  }

  /** A modeled word arrived from the partner's device (ws, transient). */
  function onModel(m) {
    if (m?.k !== "model" || typeof m.t !== "string") return;
    clearTimeout(modelGlow.get(m.t));
    modelGlow.set(m.t, setTimeout(() => {
      modelGlow.delete(m.t);
      renderGrid();
      rerenderView();
    }, MODEL_FADE_MS));
    const [kind, id] = m.t.split(":");
    // A modeled ✨ / ❓ only glows — a button has no word to say.
    if (modelSpeaks && m.w && kind !== "control") speakItem({ kind, id, text: m.w });
    renderGrid();
    rerenderView();
  }

  /** Chrome the layer owns outside the cells: the Groups anchor glows when
   *  a target needs the route walk, and the end chip shows while running. */
  function spotChrome() {
    const s = spotlight();
    const walk = (!!s && needsRouteWalk(s.targets, live.boardSenseIds)) ||
      (modelGlow.size > 0 && needsRouteWalk(new Set(modelGlow.keys()), live.boardSenseIds));
    $("anchor-groups").classList.toggle("glow", walk);
    const chip = $("spot-chip");
    chip.hidden = !s;
    if (s) chip.textContent = `🔦 ${s.name} · End`;
    // 032 E: ✨ / ❓ are targets too — the same ring, never dimmed, and
    // the picker's ring while choosing.
    for (const [name, c] of Object.entries(CONTROLS)) {
      const key = `control:${name}`;
      $(c.button).classList.toggle("glow", !!s?.targets.has(key) || modelGlow.has(key));
      $(c.button).classList.toggle("picked", !!picking?.has(key));
    }
    live.coachUi.renderCoach();
  }

  /** A press on ✨ / ❓ that isn't a transform: in pick mode it chooses the
   *  button as a target; in Model mode it glows it on linked boards. True
   *  when the press was taken. */
  function controlPress(name) {
    const key = `control:${name}`;
    if (picking) {
      picking.has(key) ? picking.delete(key) : picking.add(key);
      updatePickBar();
      spotChrome();
      return true;
    }
    if (modeling) {
      syncSendModel(key, CONTROLS[name].label);
      modelSent.add(key);
      spotChrome();
      setTimeout(() => { modelSent.delete(key); spotChrome(); }, 700);
      return true;
    }
    clearModel(key); // the child pressed the glowing button — its glow is done
    return false;
  }

  return {
    layerMark, bindSpotSettings, updatePickBar, setPicking, setModeling,
    onModel, spotChrome, controlPress, clearModel,
    modelGlow, modelSent,
    get picking() { return picking; },
    get modeling() { return modeling; },
    get spotPulse() { return spotPulse; },
    get modelSpeaks() { return modelSpeaks; },
  };
}
