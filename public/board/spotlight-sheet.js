/**
 * Spotlight sheet (013). Parent Corner → Spotlight opens saved lists,
 * pick mode, and the synced session settings. Picking happens on the
 * board itself: taps choose targets, never speak.
 */
import {
  deleteSpotList, endSession, listItems, listTargets,
  saveSpotList, spotLists, spotSession, startSession, setItemTip, setListGoal,
} from "../shared/spotlight.mjs";
import { setSetting } from "../shared/groups.mjs";

const $ = (id) => document.getElementById(id);

export function mountSpotlightSheet({
  db, catalog, open, close, all, coachLabel, bindSpotSettings,
  renderGrid, renderStrip, rerenderView, setModeling, setPicking,
  getPicking, getSpotPulse, getModelSpeaks,
}) {
  let spotMinutes = bindSpotSettings();

  function renderSpotForm() {
    const s = spotSession(db);
    $("spot-running").hidden = !s;
    if (s) {
      $("spot-running-label").textContent =
        `🔦 ${s.name} — ends ${new Date(s.ends_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    }
    const lists = spotLists(db);
    const box = $("spot-lists");
    box.innerHTML = "";
    if (!lists.length) {
      box.innerHTML = '<p class="hint">No saved lists yet.</p>';
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
      start.addEventListener("click", () => {
        startSession(db, { name: l.name, targets: listTargets(db, l.id), minutes: spotMinutes });
        close("spotform");
        renderGrid();
        rerenderView();
      });
      // 016 § 5: a list marked as a goal is tracked in the weekly
      // stats — target words on their own vs with the glow.
      const goal = document.createElement("button");
      goal.className = "btn secondary";
      goal.textContent = l.is_goal ? "✓ Goal" : "Goal";
      goal.title = "Track this list's words in the progress stats";
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
      tipsBtn.textContent = "Tips";
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
        save.textContent = "Save tips";
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
    const { spot_dim: dim = 45, spot_boost: boost = 1 } = all(db,
      "SELECT spot_dim, spot_boost FROM learner_profile WHERE id = 'prf_local'")[0] ?? {};
    for (const b of $("spot-minutes").querySelectorAll("button")) {
      b.classList.toggle("on", b.dataset.v === String(spotMinutes));
    }
    for (const b of $("spot-pulse").querySelectorAll("button")) {
      b.classList.toggle("on", b.dataset.v === (getSpotPulse() ? "1" : "0"));
    }
    for (const b of $("spot-dim").querySelectorAll("button")) {
      b.classList.toggle("on", b.dataset.v === String(dim));
    }
    for (const b of $("model-speaks").querySelectorAll("button")) {
      b.classList.toggle("on", b.dataset.v === (getModelSpeaks() ? "1" : "0"));
    }
    for (const b of $("spot-boost").querySelectorAll("button")) {
      b.classList.toggle("on", b.dataset.v === String(boost));
    }
  }

  $("open-spot").addEventListener("click", () => {
    renderSpotForm();
    open("spotform");
  });
  $("spot-model").addEventListener("click", () => {
    setModeling(true);
    close("spotform");
  });
  $("model-done").addEventListener("click", () => setModeling(false));
  $("spot-end").addEventListener("click", () => {
    endSession(db);
    renderSpotForm();
    renderGrid();
    rerenderView();
  });
  $("spot-pick").addEventListener("click", () => {
    close("spotform");
    setPicking(true);
  });
  $("spot-pick-cancel").addEventListener("click", () => setPicking(false));
  $("spot-pick-start").addEventListener("click", () => {
    const picking = getPicking();
    if (!picking?.size) return;
    const targets = new Set(picking);
    setPicking(false);
    startSession(db, { name: "Spotlight", targets, minutes: spotMinutes });
    renderGrid();
    rerenderView();
  });
  $("spot-pick-save").addEventListener("click", () => {
    const picking = getPicking();
    if (!picking?.size) return;
    $("spot-list-name").value = "";
    open("spotname");
  });
  $("spot-name-save").addEventListener("click", () => {
    const picking = getPicking();
    const name = $("spot-list-name").value.trim();
    if (!name || !picking?.size) return;
    saveSpotList(db, `spl_${crypto.randomUUID().replaceAll("-", "")}`, name, picking);
    close("spotname");
    setPicking(false);
    renderSpotForm();
    open("spotform");
  });
  // Session length, glow style, and dim are synced settings (§ 4) — each
  // writes its profile column on tap, like the keyboard segs.
  for (const seg of ["spot-minutes", "spot-pulse", "spot-dim", "spot-boost", "model-speaks"]) {
    $(seg).addEventListener("click", (e) => {
      const v = e.target.closest("button")?.dataset.v;
      if (v === undefined) return;
      setSetting(db, seg.replaceAll("-", "_"), Number(v));
      spotMinutes = bindSpotSettings();
      renderSpotForm();
      renderGrid();
      renderStrip();
      rerenderView();
    });
  }
}
