/**
 * Spotlight page (013; Settings → Spotlight since 032): the running
 * session, saved lists, pick mode, and the synced look settings.
 * Picking happens on the board itself: taps choose targets, never speak.
 */
import {
  deleteSpotList, endSession, listItems, listTargets,
  saveSpotList, spotLists, spotSession, startSession, setItemTip, setListGoal,
  untilText,
} from "../shared/spotlight.mjs";
import { setSetting } from "../shared/groups.mjs";

const $ = (id) => document.getElementById(id);

export function mountSpotlightSheet({
  db, catalog, open, close, all, coachLabel, bindSpotSettings,
  renderGrid, renderStrip, rerenderView, setModeling, setPicking,
  getPicking, getSpotPulse, getModelSpeaks, onSettingsOpen, openSettings,
}) {
  bindSpotSettings();

  /** Start a spotlight and go look at it: Settings closes onto the board. */
  function startGlow(name, targets) {
    startSession(db, { name, targets });
    close("menu");
    renderGrid();
    rerenderView();
  }

  function renderSpotForm() {
    const s = spotSession(db);
    $("spot-running").hidden = !s;
    $("spot-off").hidden = !!s;
    if (s) $("spot-running-label").textContent = `🔦 “${s.name}” glows ${untilText(s)}.`;
    const lists = spotLists(db);
    const box = $("spot-lists");
    box.innerHTML = "";
    if (!lists.length) {
      box.innerHTML = '<p class="hint">No lists yet. Pick words, then Save to keep them for next time.</p>';
    }
    for (const l of lists) {
      const row = document.createElement("div");
      row.className = "spot-list-row";
      const name = document.createElement("span");
      name.className = "spot-list-name";
      name.textContent = `${l.name} (${l.n} word${l.n === 1 ? "" : "s"})`;
      const start = document.createElement("button");
      start.className = "btn secondary";
      start.textContent = "Start";
      start.addEventListener("click", () => startGlow(l.name, listTargets(db, l.id)));
      // 016 § 5: a list marked as a goal is tracked in the weekly
      // stats — target words on their own vs with the glow.
      const goal = document.createElement("button");
      goal.className = "btn secondary";
      goal.textContent = l.is_goal ? "✓ Tracking progress" : "Track progress";
      goal.title = "Show this list's words in Progress";
      goal.addEventListener("click", () => {
        setListGoal(db, l.id, !l.is_goal);
        renderSpotForm();
      });
      const del = document.createElement("button");
      del.className = "btn secondary";
      del.textContent = "Delete";
      del.addEventListener("click", () => { deleteSpotList(db, l.id); renderSpotForm(); });
      const tipsBtn = document.createElement("button");
      tipsBtn.className = "btn secondary";
      tipsBtn.textContent = "Coaching tips";
      // An SLP edits a list's tips here (013 § 5a): each word gets one
      // line; the shipped default sits as the placeholder, an empty field
      // falls back to it. Writes are synced set_setting-style ops.
      tipsBtn.addEventListener("click", () => {
        const next = row.nextSibling;
        if (next?.classList?.contains("spot-tips")) { next.remove(); return; }
        const items = listItems(db, l.id);
        const editor = document.createElement("div");
        editor.className = "spot-tips";
        for (const it of items) {
          const r = document.createElement("div");
          r.className = "spot-tip-row";
          const w = document.createElement("span");
          w.className = "spot-tip-word";
          w.textContent = coachLabel(it.kind, it.item_id);
          const input = document.createElement("input");
          input.value = it.tip ?? "";
          input.placeholder = catalog.coachTips?.[it.item_id]
            ?? "One-line tip, e.g. use it at snack time";
          input.dataset.key = `${it.kind}:${it.item_id}`;
          r.append(w, input);
          editor.appendChild(r);
        }
        const save = document.createElement("button");
        save.className = "btn secondary";
        save.textContent = "Save coaching tips";
        save.addEventListener("click", () => {
          for (const inp of editor.querySelectorAll("input")) {
            const [kind, id] = inp.dataset.key.split(":");
            const it = items.find((x) => x.kind === kind && x.item_id === id);
            const v = inp.value.trim() || null;
            if (v !== (it?.tip ?? null)) setItemTip(db, l.id, kind, id, v);
          }
          renderSpotForm();
        });
        editor.appendChild(save);
        row.after(editor);
      });
      row.append(name, start, tipsBtn, goal, del);
      box.appendChild(row);
    }
    const { spot_dim: dim = 45 } = all(db,
      "SELECT spot_dim FROM learner_profile WHERE id = 'prf_local'")[0] ?? {};
    for (const b of $("spot-pulse").querySelectorAll("button")) {
      b.classList.toggle("on", b.dataset.v === (getSpotPulse() ? "1" : "0"));
    }
    for (const b of $("spot-dim").querySelectorAll("button")) {
      b.classList.toggle("on", b.dataset.v === String(dim));
    }
    for (const b of $("model-speaks").querySelectorAll("button")) {
      b.classList.toggle("on", b.dataset.v === (getModelSpeaks() ? "1" : "0"));
    }
  }

  onSettingsOpen(renderSpotForm);
  $("spot-model").addEventListener("click", () => {
    setModeling(true);
    close("menu");
  });
  $("model-done").addEventListener("click", () => setModeling(false));
  $("spot-end").addEventListener("click", () => {
    endSession(db);
    renderSpotForm();
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
      renderSpotForm();
      renderGrid();
      renderStrip();
      rerenderView();
    });
  }
}
