/** The attention layer (013 § 2): a running spotlight glows its target
 *  words and dims the rest — every cell stays tappable and speaks;
 *  masked cells are skipped entirely (never unmask). This module owns
 *  the layer itself: the mark pass every renderer calls, the pick mode
 *  Set, live-model glows, the board chrome (Groups-anchor glow, end
 *  chip, control rings), and the synced dim/pulse settings. Spotlight
 *  lists and sessions live in shared/spotlight.mjs; board.js owns the
 *  taps that feed it and the halo/move-mark Sets it reads via `live`. */
import { CONTROLS, glowsHere, needsRouteWalk, spotlight } from "../shared/spotlight.mjs";

const $ = (id) => document.getElementById(id);
const ALL = (db, sql, p = []) => db.all(sql, p);

export function mountSpotlightLayer({
  db, live, isSupporter,
  // shared/sync.mjs syncSendLive — injected: sync is browser-only.
  sendLive,
  speakItem, syncTxButtons, renderGrid, rerenderView,
}) {
  /** Pulse rides the synced glow-style setting (013 § 4). */
  let spotPulse = false;

  /* --- pick mode (013 slice 2): an adult taps words on the board or in
   *  groups to choose targets; taps never speak while picking. `picking`
   *  is the Set of "kind:id" being chosen, or null when off. --- */
  let picking = null;

  /* --- live modeling (013 slice 4, § 4): while a spotlight runs, every
   *  tap on a supporter's device rides the ws to the child's board,
   *  lights the word a few seconds, then fades — or ends the moment the
   *  child taps it. Never saved, never in the sync log; the light is
   *  silent unless the family turns on Speak (model_speaks). The child's
   *  taps ride back the same way and become the supporter's counts. --- */
  let modelSpeaks = false;
  /** Modeling is on exactly when a real session runs on a supporter's
   *  device — no separate switch (founder, 2026-10-04). */
  const modelingNow = () =>
    isSupporter() && !live.spotDemo && !!spotlight()?.session;
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
    if (glowsHere(s, isSupporter())) {
      if (s.targets.has(key)) {
        el.classList.add("glow");
        if (spotPulse) el.classList.add("pulse");
      } else {
        el.classList.add("dimmed");
      }
    }
    if (picking) el.classList.toggle("picked", picking.has(key));
    if (modelGlow.has(key)) el.classList.add("glow", "modeled");
    if (modelSent.has(key)) el.classList.add("glow");
    const n = countOf(key);
    if (n) el.dataset.spotCount = String(n);
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

  /** The child's presses this session, on a supporter's device. */
  const countOf = (key) => (isSupporter() ? live.coachUi?.countOf(key) ?? 0 : 0);

  /** A live message from another device (ws, transient): the child's
   *  tap reaches a supporter's counts; a modeled word lights here. */
  function onModel(m) {
    if (m?.k === "tap") return live.coachUi?.onChildTap(m);
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
    const steady = glowsHere(s, isSupporter());
    const walk = (steady && needsRouteWalk(s.targets, live.boardSenseIds)) ||
      (modelGlow.size > 0 && needsRouteWalk(new Set(modelGlow.keys()), live.boardSenseIds));
    $("anchor-groups").classList.toggle("glow", walk);
    // A supporter's spotlight leaves the child's board plain — no chip.
    const chip = $("spot-chip");
    chip.hidden = !steady;
    if (s) chip.textContent = `🔦 ${s.name} · End`;
    // 032 E: ✨ / ❓ are targets too — the same ring, never dimmed, and
    // the picker's ring while choosing.
    for (const [name, c] of Object.entries(CONTROLS)) {
      const key = `control:${name}`;
      const b = $(c.button);
      b.classList.toggle("glow", (steady && s.targets.has(key)) || modelGlow.has(key));
      b.classList.toggle("modeled", modelGlow.has(key));
      b.classList.toggle("picked", !!picking?.has(key));
      const n = countOf(key);
      if (n) b.dataset.spotCount = String(n); else delete b.dataset.spotCount;
    }
    const modeling = modelingNow();
    document.body.classList.toggle("modeling", modeling);
    $("modelbar").hidden = !modeling;
    if (modeling) live.coachUi?.renderBar();
  }

  /** The child pressed `key` (a word, or "control:fix" / "control:question")
   *  on their own board. Returns whether it was lit when pressed — the
   *  "with the glow" half of Progress — then ends its modeled light and,
   *  during a session, tells the supporter's devices. Never on a
   *  supporter's device: there a tap is a model. */
  function childTap(key) {
    const s = spotlight();
    const lit = (glowsHere(s, isSupporter()) && s.targets.has(key)) || modelGlow.has(key);
    if (s?.session && !isSupporter()) {
      sendLive({ k: "tap", t: key, s: s.startedAt }).catch(() => {});
    }
    clearModel(key);
    return lit;
  }

  /** A press on ✨ / ❓ that isn't a transform: in pick mode it chooses the
   *  button as a target; on a supporter's device during a spotlight it
   *  lights it on the child's board. True when the press was taken. */
  function controlPress(name) {
    const key = `control:${name}`;
    if (picking) {
      picking.has(key) ? picking.delete(key) : picking.add(key);
      updatePickBar();
      spotChrome();
      return true;
    }
    if (modelingNow()) {
      sendLive({ k: "model", t: key, w: CONTROLS[name].label }).catch(() => {});
      live.coachUi?.onModeled("control", name);
      modelSent.add(key);
      spotChrome();
      setTimeout(() => { modelSent.delete(key); spotChrome(); }, 700);
      return true;
    }
    return false; // the transform's own log calls childTap
  }

  return {
    layerMark, bindSpotSettings, updatePickBar, setPicking,
    onModel, spotChrome, controlPress, clearModel, childTap,
    modelGlow, modelSent,
    get picking() { return picking; },
    get modeling() { return modelingNow(); },
    get spotPulse() { return spotPulse; },
    get modelSpeaks() { return modelSpeaks; },
  };
}
