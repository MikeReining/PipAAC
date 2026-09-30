/**
 * Spotlight page (013; Settings → Spotlight since 032): what it is, the
 * running session, saved lists as cards, modeling from a phone, and the
 * synced look settings. Picking happens on the board itself: taps choose
 * targets, never speak.
 */
import {
  deleteSpotList, endSession, listItems, listTargets,
  saveSpotList, spotLists, spotSession, startSession, setItemTip, setListGoal,
  untilText,
} from "../shared/spotlight.mjs";
import { setSetting } from "../shared/groups.mjs";
import { STARTER_LISTS, starterFor, starterTargets } from "../shared/spotlight_starters.mjs";
import { moveRow } from "./move-row.js";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/* The hero: six real board tiles, two glowing. The tap lands on a dimmed
 * one — it still speaks. Sense ids are the shipped core words. */
const HERO = ["sns_0001", "sns_0013", "sns_0055", "sns_0015", "sns_0026", "sns_0025"]; // I want more go stop help
const HERO_GLOW = new Set(["sns_0055", "sns_0025"]); // more, help
const HERO_TAP = "sns_0026"; // stop

export function mountSpotlightSheet({
  db, catalog, me, open, close, all, coachLabel, tileFor, bindSpotSettings,
  renderGrid, renderStrip, rerenderView, setModeling, setPicking,
  getPicking, getSpotPulse, getModelSpeaks, onSettingsOpen, openSettings,
  startDemo,
}) {
  bindSpotSettings();

  /** Start a spotlight and go look at it: Settings closes onto the board. */
  function startGlow(name, targets) {
    startSession(db, { name, targets });
    close("menu");
    renderGrid();
    rerenderView();
  }

  const chips = (keys) => {
    const box = el("div", "spot-chips");
    for (const k of keys) box.append(el("span", "spot-chip", coachLabel(...k.split(":"))));
    return box;
  };
  const person = () => me.name?.trim() || "this person";
  /** A suggestion's example move as tiles, with its line under it. */
  const recipe = (x) => {
    const box = el("div", "spot-recipe");
    if (x.move) box.append(moveRow(x.move, { tileFor }));
    if (x.recipe) box.append(el("p", "hint", x.recipe));
    return box;
  };

  function renderHero() {
    $("spot-try").textContent = `▶ Try it on ${person()}'s board`;
    const box = $("spot-hero-tiles");
    if (box.childElementCount) return;
    for (const id of HERO) {
      const t = tileFor(id);
      t.classList.add(HERO_GLOW.has(id) ? "glow" : "dimmed");
      if (id === HERO_TAP) t.classList.add("spot-hero-tapped");
      box.append(t);
    }
    $("spot-hero-say").textContent = `“${coachLabel("sense", HERO_TAP)}”`;
  }

  function renderNow() {
    const s = spotSession(db);
    $("spot-running").hidden = !s;
    $("spot-off").hidden = !!s;
    $("spot-try").hidden = !!s; // the real thing is already on
    if (!s) return;
    $("spot-running-label").textContent = `🔦 “${s.name}” glows ${untilText(s)}.`;
    $("spot-running-words").replaceWith(Object.assign(chips(JSON.parse(s.targets)), { id: "spot-running-words" }));
  }

  function renderLists() {
    const box = $("spot-lists");
    box.replaceChildren();
    const lists = spotLists(db);
    if (!lists.length) box.append(el("p", "hint", "No lists of your own yet."));
    for (const l of lists) {
      const card = el("div", "spot-card");
      const head = el("div", "spot-card-head");
      head.append(el("b", "spot-list-name", l.name),
        el("span", "set-sum", `${l.n} word${l.n === 1 ? "" : "s"}`));
      const acts = el("div", "spot-card-acts");
      const start = el("button", "btn", "Start");
      start.addEventListener("click", () => startGlow(l.name, listTargets(db, l.id)));
      // 016 § 5: a list marked as a goal is tracked in the weekly
      // stats — target words on their own vs with the glow.
      const goal = el("button", "btn secondary spot-toggle", "Track progress");
      goal.setAttribute("aria-pressed", String(!!l.is_goal));
      goal.title = "Show this list's words in Progress";
      goal.addEventListener("click", () => {
        setListGoal(db, l.id, !l.is_goal);
        renderLists();
      });
      const tipsBtn = el("button", "btn secondary", "Coaching tips");
      tipsBtn.setAttribute("aria-expanded", "false");
      // An SLP edits a list's tips here (013 § 5a): each word gets one
      // line; the shipped default sits as the placeholder, an empty field
      // falls back to it. Writes are synced set_setting-style ops.
      tipsBtn.addEventListener("click", () => {
        const shown = card.querySelector(".spot-tips");
        tipsBtn.setAttribute("aria-expanded", String(!shown));
        if (shown) { shown.remove(); return; }
        const items = listItems(db, l.id);
        const editor = el("div", "spot-tips");
        editor.append(el("p", "hint",
          "One line per word: when to use it. It shows on a linked phone while this list glows."));
        for (const it of items) {
          const r = el("label", "spot-tip-row");
          const input = el("input");
          input.value = it.tip ?? "";
          input.placeholder = catalog.coachTips?.[it.item_id]
            ?? "e.g. use it at snack time";
          input.dataset.key = `${it.kind}:${it.item_id}`;
          r.append(el("span", "spot-tip-word", coachLabel(it.kind, it.item_id)), input);
          editor.append(r);
        }
        const save = el("button", "btn secondary", "Save coaching tips");
        save.addEventListener("click", () => {
          for (const inp of editor.querySelectorAll("input")) {
            const [kind, id] = inp.dataset.key.split(":");
            const it = items.find((x) => x.kind === kind && x.item_id === id);
            const v = inp.value.trim() || null;
            if (v !== (it?.tip ?? null)) setItemTip(db, l.id, kind, id, v);
          }
          renderLists();
        });
        editor.append(save);
        card.append(editor);
      });
      const del = el("button", "spot-del", "Delete");
      del.addEventListener("click", () => { deleteSpotList(db, l.id); renderLists(); });
      acts.append(start, goal, tipsBtn, del);
      card.append(head, chips(listTargets(db, l.id)));
      const from = starterFor(l.name);
      if (from?.recipe) card.append(recipe(from));
      card.append(acts);
      box.append(card);
    }
    // Suggested lists (032 C): one tap makes one theirs; an added one
    // leaves the suggestions.
    const saved = new Set(lists.map((l) => l.name));
    const ideas = STARTER_LISTS.filter((x) => !saved.has(x.name));
    if (ideas.length) box.append(el("span", "seg-label spot-sub", "Suggested"));
    for (const x of ideas) {
      const card = el("div", "spot-card spot-idea");
      const head = el("div", "spot-card-head");
      head.append(el("b", "spot-list-name", x.name));
      const add = el("button", "btn secondary", "Add to my lists");
      add.addEventListener("click", () => {
        saveSpotList(db, `spl_${crypto.randomUUID().replaceAll("-", "")}`, x.name, starterTargets(x));
        renderLists();
      });
      const acts = el("div", "spot-card-acts");
      acts.append(add);
      card.append(head, chips(starterTargets(x)));
      if (x.recipe) card.append(recipe(x));
      card.append(acts);
      box.append(card);
    }
  }

  /* Modeling needs two devices. Only a partner device (a linked phone or
   * a supporter's laptop) gets the button — on the child's own device
   * it would glow nothing anyone sees; there the row explains linking. */
  function renderModel() {
    const partner = me.role === "partner";
    const linked = !!me.sync?.userId;
    $("spot-model").hidden = !partner;
    $("spot-link").hidden = partner;
    $("spot-link").textContent = linked ? "Add a device" : "Link a phone";
    $("spot-model-title").textContent = partner ? "Model from this device" : "Model from your phone";
    $("spot-model-hint").textContent = partner
      ? `Tap a word here and it glows on ${person()}'s board for a few seconds. Say it out loud while you point. While a spotlight runs, its words also sit above the board here, with a tip for each.`
      : linked
        ? `On a linked phone, open Settings → Spotlight → Model from this device. Tap a word there and it glows here for a few seconds.`
        : `Link your phone to ${person()}'s board. Then tap a word on your phone and it glows here for a few seconds, while you say it out loud.`;
  }

  function renderLook() {
    const { spot_dim: dim = 45 } = all(db,
      "SELECT spot_dim FROM learner_profile WHERE id = 'prf_local'")[0] ?? {};
    const pulse = getSpotPulse();
    for (const b of $("spot-pulse").querySelectorAll("button")) {
      b.classList.toggle("on", b.dataset.v === (pulse ? "1" : "0"));
    }
    for (const b of $("spot-dim").querySelectorAll("button")) {
      b.classList.toggle("on", b.dataset.v === String(dim));
    }
    for (const b of $("model-speaks").querySelectorAll("button")) {
      b.classList.toggle("on", b.dataset.v === (getModelSpeaks() ? "1" : "0"));
    }
    const dimWord = $("spot-dim").querySelector("button.on")?.textContent.toLowerCase() ?? "";
    $("spot-look-sum").textContent = `${pulse ? "Pulsing" : "Steady"} glow · dim ${dimWord}`;
    // The preview is the board's own marks on the hero's tiles.
    const prev = $("spot-prev");
    if (!prev.childElementCount) {
      for (const id of HERO.slice(1, 5)) {
        const t = tileFor(id);
        t.classList.add(HERO_GLOW.has(id) ? "glow" : "dimmed");
        prev.append(t);
      }
    }
    for (const t of prev.querySelectorAll(".glow")) t.classList.toggle("pulse", pulse);
  }

  function renderSpotForm() {
    renderHero();
    renderNow();
    renderLists();
    renderModel();
    renderLook();
  }

  onSettingsOpen(renderSpotForm);
  $("spot-try").addEventListener("click", () => startDemo());
  $("spot-model").addEventListener("click", () => {
    setModeling(true);
    close("menu");
  });
  $("model-done").addEventListener("click", () => setModeling(false));
  $("spot-end").addEventListener("click", () => {
    endSession(db);
    renderNow();
    renderGrid();
    rerenderView();
  });
  $("spot-pick").addEventListener("click", () => {
    close("menu");
    setPicking(true);
  });
  $("spot-pick-cancel").addEventListener("click", () => setPicking(false));
  $("spot-pick-start").addEventListener("click", () => {
    const picking = getPicking();
    if (!picking?.size) return;
    const targets = new Set(picking);
    setPicking(false);
    startGlow(nameFor(targets), targets);
  });
  // A list is named for its first words until someone names it better.
  const nameFor = (targets) => {
    const words = [...targets].slice(0, 3).map((k) => coachLabel(...k.split(":")));
    return words.join(", ") + (targets.size > 3 ? "…" : "");
  };
  $("spot-pick-save").addEventListener("click", () => {
    const picking = getPicking();
    if (!picking?.size) return;
    $("spot-list-name").value = nameFor(picking);
    open("spotname");
    $("spot-list-name").select();
  });
  $("spot-name-save").addEventListener("click", () => {
    const picking = getPicking();
    const name = $("spot-list-name").value.trim();
    if (!name || !picking?.size) return;
    saveSpotList(db, `spl_${crypto.randomUUID().replaceAll("-", "")}`, name, picking);
    close("spotname");
    setPicking(false);
    openSettings("spotlight");
  });
  // Glow style, dim, and modeled-word sound are synced settings (§ 4) —
  // each writes its profile column on tap, like the keyboard segs.
  for (const seg of ["spot-pulse", "spot-dim", "model-speaks"]) {
    $(seg).addEventListener("click", (e) => {
      const v = e.target.closest("button")?.dataset.v;
      if (v === undefined) return;
      setSetting(db, seg.replaceAll("-", "_"), Number(v));
      bindSpotSettings();
      renderLook();
      renderGrid();
      renderStrip();
      rerenderView();
    });
  }
}
