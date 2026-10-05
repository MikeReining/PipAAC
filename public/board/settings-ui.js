/**
 * Settings — the redesign of Parent corner. Owns navigation only: the
 * section list, which page shows, the person's name in the chrome, and
 * proxy buttons. Every control inside a page keeps its id and stays
 * wired by the module that owns it (board.js, devices-ui, keyboard-ui…),
 * so moving a control here never changes what it does.
 *
 * Layout law (index.html + settings-ui.css): wide screens show the list
 * beside one page; under 760px the list, then the page with Back.
 */

import { untilText } from "../shared/spotlight.mjs";
import { paintAvatar } from "./avatar.js";
import { mountHelp } from "./help-ui.js";

const $ = (id) => document.getElementById(id);

const svg = (d) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const SECTION_ICONS = {
  overview: svg('<path d="M3.5 11.5 12 4l8.5 7.5"/><path d="M6 10v10h12V10"/>'),
  words: svg('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><path d="M16.5 13.5v6M13.5 16.5h6"/>'),
  spotlight: svg('<path d="M9 3h6l-1 6h-4z"/><path d="M10 9l-1.5 11h7L14 9"/><path d="M4.5 5.5 6.5 7M19.5 5.5 17.5 7M3 11h2.5M21 11h-2.5"/>'),
  board: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16M15 4v16"/>'),
  talking: svg('<path d="M5 9v6h3l5 4V5L8 9z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>'),
  lang: svg('<path d="M4 6h10M9 4v2M6 6c1 4 4 7 8 8M12 6c-1 4-4 7-8 8"/><path d="M14 20l3.5-8 3.5 8M15.2 17.5h4.6"/>'),
  progress: svg('<path d="M5 20V12M12 20V5M19 20v-8"/>'),
  team: svg('<circle cx="9" cy="8" r="3"/><path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5"/><rect x="15" y="7" width="6" height="10" rx="1.2"/>'),
  backup: svg('<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/><path d="M9 12l2 2 4-4"/>'),
  lifetime: svg('<path d="M12 3l2.5 5.6L20.5 9.5l-4.3 4 1.2 6-5.4-3.1-5.4 3.1 1.2-6-4.3-4 6-0.9z"/>'),
  you: svg('<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-3.5 3.8-5.5 7-5.5s6 2 7 5.5"/>'),
  help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><path d="M12 17.2v.1"/>'),
};

/** The words the chrome uses for the person: their name, or a neutral
 *  fallback — never a role ("your child"). */
export function personWords(name) {
  const n = (name ?? "").trim();
  return n
    ? { title: n, inline: n, cap: n }
    : { title: "This person", inline: "this person", cap: "This person", unnamed: true };
}

const NARROW = "(max-width: 760px)";

export function mountSettings({ me, open, facts = () => ({ entities: 0, invested: false, pinOn: false }), trial = () => ({ licensed: false, endsAt: null }) }) {
  const body = $("set-body");
  const nav = $("set-nav");
  const pane = $("set-pane");
  const sections = [...pane.querySelectorAll(".set-sec")];
  let current = "overview";
  const narrow = () => matchMedia(NARROW).matches;

  function paintNames() {
    const w = personWords(me.name);
    $("set-name").textContent = w.title;
    paintAvatar($("set-avatar"), { name: w.unnamed ? "" : w.title, photo: me.photo });
    for (const el of document.querySelectorAll("#menu [data-person]")) el.textContent = w.inline;
    for (const el of pane.querySelectorAll("[data-person-cap]")) el.textContent = w.cap;
  }

  /** A page whose every block is hidden (e.g. Your account on the
   *  child's own device) drops out of the list. */
  const isEmpty = (sec) =>
    ![...sec.querySelectorAll(":scope > .seg-row, :scope > .set-quick, :scope > .wincard, :scope > .prog")]
      .some((el) => !el.hidden);

  /* One-line state per page, read from the controls themselves (their
   * owners keep them current) — so an SLP reads the whole setup from
   * the list without opening a page. */
  const onText = (id) => {
    const b = $(id)?.querySelector("button.on");
    return (b?.querySelector(".set-opt") ?? b)?.textContent?.trim() ?? "";
  };
  const isOn = (id) => $(id)?.querySelector('button[data-v="1"]')?.classList.contains("on");
  const onOff = (id) => (isOn(id) ? "on" : "off");
  const cardMade = () => !!me.cardShownAt;
  const SUMMARIES = {
    board: () => [onText("cells-seg") && `${onText("cells-seg")} buttons`,
      onText("look-seg") === "Words only" ? "words only" : "", onText("kb-mode")].filter(Boolean).join(" · "),
    talking: () =>
      `${$("voice-name")?.textContent ?? "Voice"} · ${$("bar-row")?.dataset.summary ?? "Everything"} · feeling faces ${onOff("expressive-voice")}`,
    // 040 — the trial countdown sits under the sidebar's first item;
    // licensed it becomes the quiet confirmation lower in the list.
    lifetime: () => {
      const t = trial();
      if (t.licensed) return "Paid · every device, every helper";
      const days = t.endsAt ? Math.ceil((t.endsAt - Date.now()) / 86_400_000) : 0;
      return days > 0
        ? `$49 once · ${days} day${days === 1 ? "" : "s"} free`
        : "$49 once · no subscription";
    },
    lang: () => `Grammar help ${onOff("grammar-help")} · outlines ${onOff("hl-next")}`,
    backup: () => (team() ? "Owners keep the recovery card" : cardMade() ? "Recovery card made" : "No recovery card yet"),
    spotlight: () => {
      const { session, lists = 0 } = facts().spot ?? {};
      if (session) return `On · ${session.name} · ${untilText(session)}`;
      return lists ? `Off · ${lists} list${lists === 1 ? "" : "s"}` : "Off";
    },
    overview: () => ({
      available: "Update available",
      ready: "Update ready",
      failed: "Update needs a retry",
    })[updatePhase] ?? "",
  };
  // The recovery card is an owner's job: a Team device (me.owner false,
  // set from the relay by devices-ui) is never nagged about it.
  const team = () => me.owner === false;
  // Protection is offered once the board is worth protecting (founder
  // 2026-09-28): `invested` = something was customized, never before.
  const needsCard = () => !team() && !cardMade() && !!facts().invested;
  /* The update phase arrives from board/version.js (setUpdatePhase):
   * the Overview nav item wears the attention dot and a summary while a
   * pending update wants an adult — available, ready, or failed.
   * "downloading" doesn't badge: it's resolving itself. */
  let updatePhase = null;
  const updateAttention = () =>
    ["available", "ready", "failed"].includes(updatePhase);
  const WARN = { backup: needsCard, overview: updateAttention };

  /* The setup checklist: only facts Pip can measure. It leaves once
   * both are done. The PIN and the recovery card are not setup — they
   * arrive on the Protect line after the first customization. */
  function checklist() {
    const f = facts();
    return [
      { done: !!me.name?.trim(), label: "Name who uses Pip", hint: "Name and photo, top of this page", go: () => $("person-name").focus() },
      { done: f.entities > 0, label: "Add their people and places", hint: "Names and photos Pip can suggest", go: () => $("open-setup").click() },
    ];
  }

  /* Protect: after the first customization, one line naming whatever
   * is still missing — a PIN, the recovery card. Owners only. The
   * controls live on Backup & privacy; the line is its door. */
  function renderProtect() {
    const box = $("set-protect");
    const f = facts();
    const pinOff = !f.pinOn, noCard = !cardMade();
    box.hidden = team() || !f.invested || !(pinOff || noCard);
    if (box.hidden) return;
    const mark = document.createElement("span");
    mark.className = "set-check-mark";
    mark.textContent = "!";
    const txt = document.createElement("span");
    txt.className = "set-navtext";
    const t = document.createElement("b");
    const w = personWords(me.name);
    t.textContent = `Protect ${w.unnamed ? "this person's" : `${w.inline}'s`} words`;
    const s = document.createElement("span");
    s.className = "set-sum";
    s.textContent = pinOff && noCard ? "Add a Settings PIN and make the recovery card"
      : pinOff ? "Add a Settings PIN" : "Make the recovery card";
    const go = document.createElement("span");
    go.className = "set-chev";
    go.textContent = "›";
    txt.append(t, s);
    box.replaceChildren(mark, txt, go);
  }

  /* A running spotlight leads Overview: what is on, and one tap to end
   * it (End proxies the Spotlight page's own button). */
  function renderSpotNow() {
    const box = $("set-spot-now");
    const s = facts().spot?.session;
    box.hidden = !s;
    if (!s) return;
    box.replaceChildren();
    const h = document.createElement("span");
    h.className = "seg-label";
    h.textContent = "🔦 Spotlight is on";
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = `“${s.name}” glows ${untilText(s)}. The other words are dimmed but still speak.`;
    const row = document.createElement("div");
    row.className = "row";
    const end = document.createElement("button");
    end.className = "btn secondary";
    end.textContent = "End spotlight";
    end.dataset.click = "spot-end";
    const go = document.createElement("button");
    go.className = "btn secondary";
    go.textContent = "Open Spotlight";
    go.onclick = () => show("spotlight", { focus: true });
    row.append(end, go);
    box.append(h, p, row);
  }

  function renderOverview() {
    renderSpotNow();
    renderProtect();
    const box = $("set-check");
    const items = checklist();
    const left = items.filter((i) => !i.done).length;
    box.hidden = left === 0;
    box.replaceChildren();
    if (left) {
      const h = document.createElement("span");
      h.className = "seg-label";
      h.textContent = `Finish setting up · ${items.length - left} of ${items.length} done`;
      box.append(h);
      for (const it of items) {
        const b = document.createElement("button");
        b.className = "set-check-item" + (it.done ? " done" : it.warn ? " warn" : "");
        b.disabled = it.done;
        const mark = document.createElement("span");
        mark.className = "set-check-mark";
        mark.textContent = it.done ? "✓" : it.warn ? "!" : "";
        const txt = document.createElement("span");
        txt.className = "set-navtext";
        const t = document.createElement("b");
        t.textContent = it.label;
        const s = document.createElement("span");
        s.className = "set-sum";
        s.textContent = it.hint;
        txt.append(t, s);
        b.append(mark, txt);
        if (!it.done) b.onclick = it.go;
        box.append(b);
      }
    }
    const glance = $("set-glance");
    glance.replaceChildren();
    for (const sec of sections) {
      const sum = SUMMARIES[sec.dataset.sec];
      if (!sum || isEmpty(sec)) continue;
      // The unlicensed Lifetime offer already leads the sidebar.
      if (sec.dataset.sec === "lifetime" && !trial().licensed) continue;
      const b = document.createElement("button");
      b.className = "set-glance-row";
      const t = document.createElement("b");
      t.textContent = sec.dataset.title;
      const v = document.createElement("span");
      v.textContent = sum();
      if (WARN[sec.dataset.sec]?.()) v.className = "set-warn";
      b.append(t, v);
      b.onclick = () => show(sec.dataset.sec, { focus: true });
      glance.append(b);
    }
  }

  /* 040 — the Lifetime item is the sidebar's first row while unlicensed
   *  (accent, the trial countdown under it); after purchase it turns
   *  into a quiet "Pip Lifetime ✓" at the end of the person's group —
   *  the license is the person's, not the adult's. Position is DOM
   *  order — the section node moves and the nav follows. */
  function syncLifetimeSpot() {
    const life = sections.find((s) => s.dataset.sec === "lifetime");
    const you = sections.find((s) => s.dataset.sec === "you");
    if (!life) return;
    if (trial().licensed && you) {
      if (life.dataset.group !== "person") life.dataset.group = "person";
      if (life.dataset.title !== "Pip Lifetime ✓") life.dataset.title = "Pip Lifetime ✓";
      if (life.nextElementSibling !== you) {
        pane.insertBefore(life, you);
        const li = sections.indexOf(life);
        sections.splice(li, 1);
        sections.splice(sections.indexOf(you), 0, life);
      }
    } else if (!trial().licensed) {
      if (life.dataset.group !== "person") life.dataset.group = "person";
      if (life.dataset.title !== "Get Pip Lifetime") life.dataset.title = "Get Pip Lifetime";
      if (sections[0] !== life) {
        pane.insertBefore(life, sections[0]);
        sections.unshift(...sections.splice(sections.indexOf(life), 1));
      }
    }
  }

  function renderNav() {
    syncLifetimeSpot();
    nav.replaceChildren();
    let grp = null;
    for (const sec of sections) {
      if (isEmpty(sec)) continue;
      const g = sec.dataset.group ?? "person";
      if (g !== grp) {
        grp = g;
        const h = document.createElement("div");
        h.className = "set-grp";
        h.textContent = g === "you" ? "You" : personWords(me.name).cap;
        nav.append(h);
      }
      const b = document.createElement("button");
      b.className = "set-nav-btn" + (sec.dataset.sec === current ? " on" : "");
      if (sec.dataset.sec === "lifetime" && !trial().licensed) {
        b.classList.add("set-nav-accent");
      }
      b.dataset.sec = sec.dataset.sec;
      b.innerHTML = SECTION_ICONS[sec.dataset.sec] ?? "";
      const t = document.createElement("span");
      t.className = "set-navtext";
      t.textContent = sec.dataset.title;
      const sum = SUMMARIES[sec.dataset.sec]?.();
      if (sum) {
        const s = document.createElement("span");
        s.className = "set-sum";
        s.textContent = sum;
        t.append(s);
      }
      b.append(t);
      if (WARN[sec.dataset.sec]?.()) {
        const dot = document.createElement("span");
        dot.className = "set-dot";
        dot.title = "Needs attention";
        b.append(dot);
      }
      nav.append(b);
    }
    renderOverview();
  }

  const onShow = [];
  function show(id, { focus = false } = {}) {
    current = id;
    for (const sec of sections) sec.classList.toggle("on", sec.dataset.sec === id);
    for (const b of nav.querySelectorAll(".set-nav-btn")) b.classList.toggle("on", b.dataset.sec === id);
    body.dataset.view = "pane";
    pane.scrollTop = 0;
    if (focus) pane.focus({ preventScroll: true });
    for (const fn of onShow) fn(id);
  }

  nav.addEventListener("click", (e) => {
    const b = e.target.closest(".set-nav-btn");
    if (b) show(b.dataset.sec, { focus: true });
  });
  $("set-back").addEventListener("click", () => { body.dataset.view = "list"; });
  // Proxy buttons: a second door to a control that lives elsewhere
  // (Add a word on Overview and on Words) — one owner, one handler.
  pane.addEventListener("click", (e) => {
    const b = e.target.closest("[data-click]");
    if (b) $(b.dataset.click)?.click();
    // A door to another page (Spotlight → See progress).
    const to = e.target.closest("[data-show]");
    if (to) show(to.dataset.show, { focus: true });
  });
  // Rows hide and show as account / sync state resolves after open, and
  // a control's .on moves when its owner writes — the list follows both.
  let queued = false;
  new MutationObserver((muts) => {
    if (queued || !$("menu").classList.contains("open")) return;
    if (muts.every((m) => m.target.closest?.("#set-check, #set-glance, #set-protect, #set-spot-now, #set-mini, #prog-page"))) return;
    queued = true;
    queueMicrotask(() => { queued = false; renderNav(); });
  }).observe(pane, { subtree: true, attributes: true, attributeFilter: ["hidden", "class"] });

  /** Open Settings: fresh names, the list on a phone, Overview on a
   *  wide screen. */
  const onOpen = [];
  function openSettings(section = "overview") {
    if (section === "results") section = "overview";
    $("set-search").value = "";
    help.reset();
    for (const fn of onOpen) fn();
    paintNames();
    current = section;
    renderNav();
    show(section);
    if (narrow() && section === "overview") body.dataset.view = "list";
    open("menu");
  }

  /* Search: answers and Settings rows together (042, help-ui.js) —
   * words on the device at once, then search by meaning online. A
   * Settings hit opens its page and marks the row. */
  const help = mountHelp({ pane, show, me, trial });
  const search = $("set-search");
  function runSearch() {
    const q = search.value.trim();
    if (!q) { show(current === "results" ? "overview" : current); return; }
    $("set-results-title").textContent = `Results for "${q}"`;
    help.search(search.value, $("set-results-list"), $("set-results-none"));
    show("results");
  }
  search.addEventListener("input", runSearch);

  /* On/off rows (`.seg[data-switch]`, Off = data-v 0, On = data-v 1)
   * show one switch beside their label. The two buttons stay in the DOM,
   * hidden: the switch clicks the one it means, so the owning module's
   * handler still writes the setting, and it mirrors their `.on` class,
   * so a synced change repaints it too. */
  for (const seg of pane.querySelectorAll(".seg[data-switch]")) {
    const row = seg.closest(".seg-row");
    const label = row.querySelector(".seg-label");
    const btn = (v) => seg.querySelector(`button[data-v="${v}"]`);
    const sw = document.createElement("button");
    sw.className = "set-switch";
    sw.setAttribute("role", "switch");
    sw.setAttribute("aria-label", label.textContent);
    const sync = () => sw.setAttribute("aria-checked", String(btn("1").classList.contains("on")));
    sw.addEventListener("click", () => btn(sw.getAttribute("aria-checked") === "true" ? "0" : "1").click());
    new MutationObserver(sync).observe(seg, { subtree: true, attributes: true, attributeFilter: ["class"] });
    sync();
    const head = document.createElement("div");
    head.className = "set-head";
    label.replaceWith(head);
    head.append(label, sw);
    seg.hidden = true;
  }

  return {
    open: openSettings, show, paintNames, renderNav,
    current: () => current,
    onOpen: (fn) => onOpen.push(fn),
    onShow: (fn) => onShow.push(fn),
    /* version.js pushes the update phase; the nav re-renders only on a
     * real change (renders can repeat while downloading). */
    setUpdatePhase: (p) => {
      if (p === updatePhase) return;
      updatePhase = p;
      renderNav();
    },
  };
}
