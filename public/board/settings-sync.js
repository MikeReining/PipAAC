/** Settings-synced segmented controls: each seg reads the synced
 *  learner_profile column, paints its buttons, and its click writes the
 *  column back — so a change made on a linked device lands here after a
 *  sync drain. The product state each seg sets (freshNext, grammarHelp,
 *  expressiveVoice, highlight-next lives in board.js) crosses through
 *  `live`. The Highlight seg stays in board.js — keyboard-ui paints it
 *  through syncSettings. */
import { setSetting } from "../shared/groups.mjs";
import { grammarHelpOn } from "../shared/forms.mjs";
import { expressiveOn } from "../shared/feeling.mjs";
import { flushResearch } from "../shared/research.mjs";
import { BAR_EXAMPLE } from "../shared/bar_example.mjs";
import { BAR_BUTTON, BAR_CONTROLS, BAR_PRESETS, barControls, barLabel, barPreset } from "../shared/bar.mjs";

const $ = (id) => document.getElementById(id);
const ALL = (db, sql, p = []) => db.all(sql, p);

export function mountSettingsSync({
  db, live, toast, sampleVoice, renderBar, renderGrid, renderStrip, rerenderView,
}) {
  /* After Speak — whether the next word adds on or starts a fresh bar. */
  function syncFreshSeg() {
    live.freshAfterSpeak = (ALL(db,
      "SELECT fresh_after_speak AS f FROM learner_profile WHERE id = 'prf_local'",
    )[0]?.f ?? 0) === 1;
    if (!live.freshAfterSpeak) live.freshNext = false;
    for (const b of $("fresh-speak").querySelectorAll("button")) {
      b.classList.toggle("on", (b.dataset.v === "1") === live.freshAfterSpeak);
    }
  }
  $("fresh-speak").addEventListener("click", (e) => {
    const v = e.target.closest("button")?.dataset.v;
    if (v === undefined) return;
    setSetting(db, "fresh_after_speak", Number(v));
    syncFreshSeg();
  });
  syncFreshSeg();

  /* Groups (027 B6, B8): the home top row on every group page, and the
   * four meal groups in the index (its switch is the Meals row of Show
   * groups). Both default ON; neither moves a cell — off leaves the top-row
   * cells empty and the meal doors' slots kept. */
  function syncGroupSegs() {
    const p = ALL(db,
      "SELECT group_top_row AS t FROM learner_profile WHERE id = 'prf_local'",
    )[0] ?? {};
    for (const [id, on] of [["group-toprow", (p.t ?? 1) === 1]]) {
      for (const b of $(id).querySelectorAll("button")) b.classList.toggle("on", (b.dataset.v === "1") === on);
    }
  }
  for (const [id, key] of [["group-toprow", "group_top_row"]]) {
    $(id).addEventListener("click", (e) => {
      const v = e.target.closest("button")?.dataset.v;
      if (v === undefined) return;
      setSetting(db, key, Number(v));
      syncGroupSegs();
      rerenderView();
    });
  }
  syncGroupSegs();

  /* Grammar help (021) — forms on/off. Off is instant: tiles, bar, and
   * speech fall back to lemma labels on the next paint. */
  function syncGrammarSeg() {
    live.grammarHelp = grammarHelpOn(db);
    for (const b of $("grammar-help").querySelectorAll("button")) {
      b.classList.toggle("on", (b.dataset.v === "1") === live.grammarHelp);
    }
  }
  $("grammar-help").addEventListener("click", (e) => {
    const v = e.target.closest("button")?.dataset.v;
    if (v === undefined) return;
    setSetting(db, "grammar_help", Number(v));
    syncGrammarSeg();
    renderBar();
    renderGrid();
    renderStrip();
    rerenderView();
  });
  syncGrammarSeg();

  /* Expressive voice (025 § 6) — the feeling faces. Off is instant: the
   * last slot returns to word suggestions, everything speaks neutral. */
  function syncExpressiveSeg() {
    live.expressiveVoice = expressiveOn(db);
    for (const b of $("expressive-voice").querySelectorAll("button")) {
      b.classList.toggle("on", (b.dataset.v === "1") === live.expressiveVoice);
    }
    syncTryFaces();
  }
  /* Settings → Talking: the board's faces, live on the sample sentence.
   * Off dims and disables them; offline they stay but say why. */
  function syncTryFaces() {
    const online = navigator.onLine !== false;
    const active = live.expressiveVoice && online;
    $("try-faces").classList.toggle("off", !active);
    for (const b of $("try-faces").querySelectorAll(".face")) b.disabled = !active;
    const note = $("try-faces-note");
    note.dataset.full ??= note.innerHTML;
    note.innerHTML = !live.expressiveVoice
      ? "Off — the Smart bar shows word suggestions instead."
      : !online ? "Needs internet to hear." : note.dataset.full;
  }
  window.addEventListener("online", syncTryFaces);
  window.addEventListener("offline", syncTryFaces);
  let tryBusy = false;
  $("try-faces").addEventListener("click", async (e) => {
    const b = e.target.closest(".face");
    if (!b || b.disabled || tryBusy) return;
    tryBusy = true;
    const img = b.querySelector("img");
    const normal = img.src;
    b.classList.add("speaking");
    img.src = `/icons/selected/voice-${b.dataset.f}.svg`;
    try {
      if ((await sampleVoice(live.voiceId, b.dataset.f)) === false) toast("Couldn't play that — try again online.");
    } finally {
      tryBusy = false;
      b.classList.remove("speaking");
      img.src = normal;
    }
  });
  $("expressive-voice").addEventListener("click", (e) => {
    const v = e.target.closest("button")?.dataset.v;
    if (v === undefined) return;
    setSetting(db, "expressive_voice", Number(v));
    syncExpressiveSeg();
    renderStrip();
  });
  syncExpressiveSeg();

  /* "Help improve Pip" (016 slice 6) — the research-totals switch. Same
   * synced-setting mechanics as the seg above. */
  const syncShareSeg = () => {
    const on = (ALL(db,
      "SELECT share_research AS s FROM learner_profile WHERE id = 'prf_local'",
    )[0]?.s ?? 1) === 1;
    for (const b of $("share-research").querySelectorAll("button")) {
      b.classList.toggle("on", (b.dataset.v === "1") === on);
    }
  };
  $("share-research").addEventListener("click", (e) => {
    const v = e.target.closest("button")?.dataset.v;
    if (v === undefined) return;
    setSetting(db, "share_research", v === "1" ? 1 : 0);
    syncShareSeg();
    if (v === "1") flushResearch(db); // turning it on sends what's pending
  });
  syncShareSeg();

  /* Words only (Profile_Presentation_Modes § 2.2):
   * learner_profile.presentation_mode, synced. A display filter only — the
   * body class hides every picture (index.html .words-only); no cell moves. */
  function syncLook() {
    const m = ALL(db,
      "SELECT presentation_mode AS m FROM learner_profile WHERE id = 'prf_local'",
    )[0]?.m ?? "symbol";
    document.body.classList.toggle("words-only", m === "label");
    for (const b of $("look-seg").querySelectorAll("button")) b.classList.toggle("on", b.dataset.v === m);
  }
  function setLook(v) {
    setSetting(db, "presentation_mode", v);
    syncLook();
    renderGrid();
    renderBar();
    renderStrip();
    rerenderView();
  }
  $("look-seg").addEventListener("click", (e) => {
    const v = e.target.closest("button")?.dataset.v;
    if (v) setLook(v);
  });
  syncLook();

  /* Sentence bar (038): which buttons the person sees. The synced
   * bar_controls column is the truth — these paint it and the top bar
   * renders it. Play is never a toggle. Hidden buttons leave the layout,
   * and Play grows into the freed top-bar space (--play-grow counts the
   * hidden model buttons; Backspace and Clear free chip room inside the
   * bar instead). */
  /* The settings bar is drawn from the real bar's own icons (cloned from
   * the live buttons), so it can never drift from what the person sees. */
  const iconOf = (id) => $(id)?.querySelector("svg")?.cloneNode(true);
  for (const b of $("bar-toggles").querySelectorAll(".bar-t")) {
    const ico = iconOf(b.dataset.c === "play" ? "speak" : BAR_BUTTON[b.dataset.c]);
    if (ico) b.querySelector(".bar-ico").append(ico);
  }
  for (const m of $("bar-preset").querySelectorAll(".bar-mini")) {
    for (const id of m.dataset.ids.split(" ")) {
      const ico = iconOf(id);
      if (ico) m.append(ico);
    }
  }
  /* The fixed example (shared/bar_example.mjs), drawn with the same
   * cloned icons wherever a [data-bar-example] slot exists. */
  for (const slot of document.querySelectorAll("[data-bar-example]")) {
    const taps = document.createElement("p");
    taps.className = "bar-ex-taps";
    taps.append("They tap ");
    for (const w of BAR_EXAMPLE.taps) {
      const chip = document.createElement("i");
      chip.textContent = w;
      taps.append(chip);
    }
    const list = document.createElement("ul");
    list.className = "bar-ex-rows";
    for (const r of BAR_EXAMPLE.rows) {
      const li = document.createElement("li");
      const ico = document.createElement("span");
      ico.className = "bar-ex-ico";
      ico.append(iconOf(BAR_BUTTON[r.c]) ?? "");
      const name = document.createElement("b");
      name.textContent = r.name;
      const out = document.createElement("span");
      out.className = "bar-ex-out";
      out.textContent = r.out;
      li.append(ico, name, out);
      list.append(li);
    }
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = "Pip only uses the words they tap.";
    slot.append(taps, list, note);
  }
  function syncBarSeg() {
    const shown = barControls(db);
    for (const b of $("bar-toggles").querySelectorAll("button")) {
      const on = b.dataset.c === "play" || shown.has(b.dataset.c);
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
      if (b.dataset.c !== "play") b.querySelector(".bar-st").textContent = on ? "" : "Off";
    }
    const preset = barPreset(shown);
    for (const b of $("bar-preset").querySelectorAll("button")) {
      b.classList.toggle("on", b.dataset.v === preset?.id);
    }
    let grow = 0;
    for (const c of BAR_CONTROLS) {
      const el = $(BAR_BUTTON[c]);
      el.hidden = !shown.has(c);
      if (el.hidden && el.classList.contains("tx")) grow++;
    }
    $("topbar").style.setProperty("--play-grow", grow);
    // An empty in-bar dock keeps no space — renderBar re-seats it either way.
    $("bar-btns").hidden = !shown.has("backspace") && !shown.has("clear");
    $("bar-warn").hidden = shown.has("backspace");
    $("bar-row").dataset.summary = barLabel(db); // the nav list reads this
  }
  function setBar(shown) {
    setSetting(db, "bar_controls",
      JSON.stringify(BAR_CONTROLS.filter((c) => shown.has(c))));
    syncBarSeg();
  }
  $("bar-preset").addEventListener("click", (e) => {
    const p = BAR_PRESETS.find((x) => x.id === e.target.closest("button")?.dataset.v);
    if (p) setBar(new Set(p.controls));
  });
  $("bar-toggles").addEventListener("click", (e) => {
    const c = e.target.closest("button")?.dataset.c;
    if (!c || c === "play") return; // Play never hides
    const shown = barControls(db);
    shown.has(c) ? shown.delete(c) : shown.add(c);
    setBar(shown);
  });
  syncBarSeg();

  return { syncFreshSeg, syncGrammarSeg, syncExpressiveSeg, syncLook, setLook, syncBarSeg };
}
