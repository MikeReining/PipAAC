/**
 * Keyboard board mode. The locale's key map renders into the grid in
 * place. Typing feeds prefix completions into the strip; space commits
 * the word and speaks it. The keyboard anchor toggles — there is no Done key.
 */
import { applyKey, keyMap, resolveKeymap } from "../shared/keyboard.mjs";
import { PARTNER_SENSES } from "../shared/keymaps.mjs";
import { buildIndex, suggest } from "../shared/spelling.mjs";
import { normalizeV1 } from "../shared/normalize.mjs";
import { detachEvent, fillChosen, logSelection } from "../shared/funnel.mjs";
import { spotlight } from "../shared/spotlight.mjs";
import { setSetting } from "../shared/groups.mjs";

const $ = (id) => document.getElementById(id);
const KB_DEV_TERM = /[\s.,!?¿¡]/;

export function mountKeyboard({
  db, locale, profile, all,
  sentence, getSentenceId, ensureSentence, getSentencePicks, setSentencePicks,
  startFresh,
  speakItem, speakSentence, renderBar, renderStrip, tap,
  isTxBusy,
  showGroupHint, applyLikely, fitLabels, senseById,
  grammar,
  getHighlightNext,
  getView, setViewName, renderGroupIndex, renderGroupPage, renderEditor,
}) {
  let kbMode = profile.keyboard_mode ?? "pip";
  let kbOrder = profile.keyboard_order ?? "standard";
  let kbOpen = false;
  let kbText = "";
  let kbBuilt = false;
  let kbPendingAccent = null;
  let kbLead = null;
  let kbDeadEl = null;
  let kbIndex = null;

  function syncKbSettings() {
    $("kb-order-standard").textContent = resolveKeymap(locale)?.standardName ?? "Standard";
    for (const b of $("kb-mode").querySelectorAll("button")) {
      b.classList.toggle("on", b.dataset.v === kbMode);
    }
    for (const b of $("kb-order").querySelectorAll("button")) {
      b.classList.toggle("on", b.dataset.v === kbOrder);
    }
    $("kb-order").classList.toggle("disabled", kbMode === "device");
    for (const b of $("hl-next").querySelectorAll("button")) {
      b.classList.toggle("on", b.dataset.v === (getHighlightNext() ? "1" : "0"));
    }
  }

  function rebuildKb() {
    kbBuilt = false;
    if (kbOpen) {
      buildKb();
      fitKbCaps();
    }
  }

  function setView(v) {
    setViewName(v);
    if (v !== "board" && kbOpen) closeKb();
    document.body.classList.toggle("groups", v === "groupIndex" || v === "group");
    document.body.classList.toggle("editor", v === "editor");
    if (v === "groupIndex") renderGroupIndex();
    else if (v === "group") renderGroupPage();
    else if (v === "editor") renderEditor();
    applyLikely();
  }

  function renderKbAnchor() {
    const a = $("anchor-kb");
    a.querySelector("span:last-child").textContent = kbOpen ? "Board" : "Keyboard";
    a.title = kbOpen ? "Board" : "Keyboard";
  }

  function buildKb() {
    kbBuilt = true;
    const kb = $("kb");
    kb.innerHTML = "";
    const keys = keyMap(locale, kbOrder);
    if (kbMode === "device" || !keys) {
      if (!keys) {
        console.warn(`keyboard: no key map for locale "${locale}" — device keyboard`);
      }
      buildKbDevice(kb);
      return;
    }
    for (const k of keys) {
      const el = kbCell(k);
      el.style.gridColumn = `${(k.slot % 10) + 1} / span ${k.span}`;
      el.style.gridRow = `${Math.floor(k.slot / 10) + 1}`;
      kb.appendChild(el);
    }
  }

  const kbCapCtx = document.createElement("canvas").getContext("2d");

  function fitKbCaps() {
    document.fonts.ready.then(() => {
      for (const key of $("kb").querySelectorAll(".kb-key:not(.kb-util)")) {
        const cap = key.querySelector(".kc");
        const r = key.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        kbCapCtx.font = '700 100px "Andika"';
        const emWidth = kbCapCtx.measureText(cap.textContent).width / 100 || 0.5;
        cap.style.fontSize = `${Math.min(r.height * 0.78, (r.width * 0.8) / emWidth)}px`;
      }
    });
  }

  function kbCell(k) {
    if (k.kind === "partner") return partnerCell(k.value);
    const el = document.createElement("button");
    const cap = document.createElement("span");
    cap.className = "kc";
    el.appendChild(cap);
    if (k.kind === "char") {
      el.className = "kb-key";
      cap.textContent = k.value;
    } else if (k.kind === "dead") {
      el.className = "kb-key kb-util";
      cap.textContent = k.value;
      kbDeadEl = el;
    } else if (k.kind === "space") {
      el.className = "kb-key kb-util kb-spacekey";
      cap.textContent = "␣";
      const sub = document.createElement("span");
      sub.className = "sub";
      sub.textContent = "space";
      el.appendChild(sub);
    } else {
      el.className = "kb-key kb-util";
      cap.textContent = "⌫";
    }
    el.addEventListener("click", () => kbPress(k.value));
    return el;
  }

  function partnerCell(senseId) {
    const s = senseById(senseId);
    const el = document.createElement("button");
    if (!s) {
      el.className = "gcell empty";
      el.disabled = true;
      return el;
    }
    el.className = `kb-key kb-partner r-${s.fitzgerald_role}`;
    const cap = document.createElement("span");
    cap.className = "kc";
    cap.textContent = s.label;
    el.appendChild(cap);
    el.addEventListener("mousedown", (e) => e.preventDefault());
    el.addEventListener("click", async () => {
      el.classList.add("flash");
      setTimeout(() => el.classList.remove("flash"), 350);
      logSelection(db, "sense", s.id, Date.now(), {
        sentenceId: getSentenceId(), position: null, source: "keyboard",
        spotlit: !!spotlight()?.targets.has(`sense:${s.id}`),
      });
      await speakItem({ kind: "sense", id: s.id });
    });
    return el;
  }

  function kbPress(key) {
    if (key !== "Enter") startFresh(key === "Backspace"); // ⌫ edits the spoken bar
    const prevLast = sentence[sentence.length - 1];
    const res = applyKey(
      { buffer: kbText, pendingAccent: kbPendingAccent, lead: kbLead, items: sentence },
      key,
      locale,
    );
    kbText = res.state.buffer;
    kbPendingAccent = res.state.pendingAccent;
    kbLead = res.state.lead;
    if (key === "Backspace" && res.state.items.length < sentence.length &&
        prevLast?.id && getSentenceId() !== null) {
      detachEvent(db, getSentenceId(), getSentencePicks() - 1);
      setSentencePicks(getSentencePicks() - 1);
    }
    sentence.splice(0, sentence.length, ...res.state.items);
    for (const e of res.effects) {
      if (e.type === "commit") commitKbItem(e.index);
      else if (e.type === "speak") { if (!isTxBusy()) speakSentence(); }
    }
    if (kbDeadEl) kbDeadEl.classList.toggle("latched", kbPendingAccent !== null);
    renderBar();
    renderStrip();
  }

  function resolveTyped(text) {
    const norm = normalizeV1(text);
    const hit = all(
      db,
      `SELECT s.id, l.text AS label, l.kind, l.id AS label_id
       FROM label l JOIN sense s ON s.id = l.sense_id
       WHERE l.normalized_text = ? AND l.locale = ? AND l.status = 'approved'
       ORDER BY (l.kind = 'lemma') DESC, l.default_for_text DESC`,
      [norm, locale],
    )[0];
    // A spelling that only a form label owns ("wants") is her chosen
    // form — pin it; lemma/alias hits let grammar help re-pick.
    if (hit) return { kind: "sense", id: hit.id,
      display: hit.kind === "lemma" ? hit.label : text,
      formLabel: hit.kind === "form" ? { id: hit.label_id, text } : null };
    const ent = all(db, "SELECT id, spoken_name FROM personal_entity WHERE status = 'active'").find(
      (e) => normalizeV1(e.spoken_name) === norm,
    );
    if (ent) return { kind: "entity", id: ent.id, display: ent.spoken_name };
    return { kind: "typed", id: null, display: text };
  }

  function commitKbItem(index) {
    const raw = sentence[index];
    const hit = resolveTyped(raw.text);
    let item = { kind: hit.kind, id: hit.id, text: hit.display };
    // Grammar help applies to typed words too — she typed the sense;
    // the form it wears is the data's pick. A spelling that matched a
    // form label is already her pick — pin it (typed "wants" stays).
    if (hit.kind === "sense" && hit.id && grammar?.on()) {
      if (hit.formLabel) {
        item = { kind: "sense", id: hit.id, text: hit.formLabel.text,
          labelId: hit.formLabel.id, fixed: true };
      } else {
        const f = grammar.forSense(sentence.slice(0, index), hit.id);
        item = { kind: "sense", id: f.senseId, text: f.text ?? item.text,
          labelId: f.labelId, fixed: !!f.merged };
      }
    }
    if (raw.punct) item.punct = raw.punct;
    if (raw.lead) item.lead = raw.lead;
    sentence[index] = item;
    speakItem(item);
    if (item.id) {
      ensureSentence();
      const position = getSentencePicks();
      setSentencePicks(position + 1);
      fillChosen(db, getSentenceId(), { kind: item.kind, id: item.id, source: "keyboard" });
      logSelection(db, item.kind, item.id, Date.now(), {
        sentenceId: getSentenceId(), position, source: "keyboard",
        spotlit: !!spotlight()?.targets.has(`${item.kind}:${item.id}`),
        labelId: item.labelId ?? null,
      });
      grammar?.revisit?.(index); // "what do" + typed he -> does
      showGroupHint(item.kind, item.id);
    }
  }

  function buildKbIndex() {
    const senses = all(
      db,
      `SELECT s.id, l.text AS label, l.kind AS label_kind, s.fitzgerald_role,
         (SELECT COUNT(*) FROM learner_event_log le
           WHERE le.item_kind = 'sense' AND le.item_id = s.id) AS freq
       FROM label l JOIN sense s ON s.id = l.sense_id
       WHERE l.status = 'approved' AND l.locale = ?
         AND NOT EXISTS (SELECT 1 FROM sense_mask m
                         WHERE m.sense_id = s.id AND m.status = 'hidden')`,
      [locale],
    ).map((w) => ({
      kind: "sense",
      id: w.id,
      text: w.label,
      labelKind: w.label_kind,
      freq: w.freq,
      role: w.fitzgerald_role,
    }));
    const ents = all(
      db,
      `SELECT e.*,
         (SELECT COUNT(*) FROM learner_event_log le
           WHERE le.item_kind = 'entity' AND le.item_id = e.id) AS freq
       FROM personal_entity e
       WHERE e.status = 'active'`,
    ).map((e) => ({ kind: "entity", id: e.id, text: e.spoken_name, freq: e.freq, entity: e }));
    return buildIndex([...senses, ...ents], locale);
  }

  function kbCompletions() {
    if (!kbText) return [];
    if (!kbIndex) kbIndex = buildKbIndex();
    return suggest(kbIndex, kbText, 4).map((e) =>
      e.kind === "entity"
        ? {
            entity: e.entity,
            freq: e.freq,
            onTap: () => {
              kbText = "";
              renderBar();
              tap(e.text, "entity", e.id, { hint: true, source: "keyboard" });
            },
          }
        : {
            id: e.id,
            label: e.text,
            role: e.role,
            freq: e.freq,
            onTap: () => {
              kbText = "";
              renderBar();
              tap(e.text, "sense", e.id, { hint: true, source: "keyboard" });
            },
          },
    );
  }

  function buildKbDevice(kb) {
    PARTNER_SENSES.forEach((id, i) => {
      const el = partnerCell(id);
      el.style.gridColumn = `${i * 2 + 1} / span 2`;
      el.style.gridRow = "1";
      kb.appendChild(el);
    });
    const ta = document.createElement("textarea");
    ta.id = "kb-device";
    ta.lang = locale;
    ta.setAttribute("autocapitalize", "sentences");
    ta.setAttribute("autocorrect", "on");
    ta.setAttribute("spellcheck", "true");
    ta.setAttribute("enterkeyhint", "go");
    ta.rows = 1;
    ta.style.gridColumn = "1 / -1";
    ta.style.gridRow = "2";
    kb.appendChild(ta);
    ta.addEventListener("input", kbDeviceInput);
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        deviceFeed("Enter");
      }
    });
  }

  function kbDeviceInput() {
    const ta = $("kb-device");
    const v = ta.value;
    if (v) startFresh();
    let last = -1;
    for (let i = 0; i < v.length; i++) if (KB_DEV_TERM.test(v[i])) last = i;
    kbPendingAccent = null;
    if (last < 0) {
      kbText = v;
      renderBar();
      renderStrip();
      return;
    }
    const done = v.slice(0, last + 1);
    const rest = v.slice(last + 1);
    kbText = "";
    for (const ch of done) kbPress(ch);
    ta.value = rest;
    kbText = rest;
    renderBar();
    renderStrip();
  }

  function deviceFeed(ch) {
    const ta = $("kb-device");
    if (ch === "Backspace") {
      if (ta.value) {
        ta.value = ta.value.slice(0, -1);
        kbDeviceInput();
      } else {
        kbPress("Backspace");
      }
      return;
    }
    if (ch === "Enter") {
      kbPress("Enter");
      ta.value = "";
      return;
    }
    ta.value += ch;
    kbDeviceInput();
  }

  function openKb() {
    if (!kbBuilt) buildKb();
    kbIndex ??= buildKbIndex();
    kbOpen = true;
    document.body.classList.add("kb");
    renderKbAnchor();
    fitKbCaps();
    renderBar();
    renderStrip();
  }

  function closeKb() {
    kbOpen = false;
    $("kb-device")?.blur();
    document.body.classList.remove("kb");
    renderKbAnchor();
    applyLikely();
  }

  $("kb-mode").addEventListener("click", (e) => {
    const v = e.target.closest("button")?.dataset.v;
    if (!v || v === kbMode) return;
    kbMode = v;
    setSetting(db, "keyboard_mode", v);
    rebuildKb();
    syncKbSettings();
  });
  $("kb-order").addEventListener("click", (e) => {
    const v = e.target.closest("button")?.dataset.v;
    if (!v || v === kbOrder) return;
    kbOrder = v;
    setSetting(db, "keyboard_order", v);
    rebuildKb();
    syncKbSettings();
  });

  window.addEventListener("resize", () => {
    if (kbOpen) fitKbCaps();
    fitLabels($("grid"));
    fitLabels($("tray"));
    fitLabels($("bar"));
    if (getView() !== "board") fitLabels($("groupgrid"));
  });

  syncKbSettings();

  return {
    isOpen: () => kbOpen,
    get text() { return kbText; },
    set text(v) { kbText = v; },
    get mode() { return kbMode; },
    set mode(v) { kbMode = v; },
    get order() { return kbOrder; },
    set order(v) { kbOrder = v; },
    invalidateIndex() { kbIndex = null; },
    press: kbPress,
    feed: deviceFeed,
    openKb,
    closeKb,
    setView,
    syncSettings: syncKbSettings,
    completions: kbCompletions,
    resolveTyped,
  };
}
