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

const $ = (id) => document.getElementById(id);

const svg = (d) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const SECTION_ICONS = {
  overview: svg('<path d="M3.5 11.5 12 4l8.5 7.5"/><path d="M6 10v10h12V10"/>'),
  words: svg('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><path d="M16.5 13.5v6M13.5 16.5h6"/>'),
  board: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16M15 4v16"/>'),
  talking: svg('<path d="M5 9v6h3l5 4V5L8 9z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>'),
  lang: svg('<path d="M4 6h10M9 4v2M6 6c1 4 4 7 8 8M12 6c-1 4-4 7-8 8"/><path d="M14 20l3.5-8 3.5 8M15.2 17.5h4.6"/>'),
  progress: svg('<path d="M5 20V12M12 20V5M19 20v-8"/>'),
  team: svg('<circle cx="9" cy="8" r="3"/><path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5"/><rect x="15" y="7" width="6" height="10" rx="1.2"/>'),
  backup: svg('<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/><path d="M9 12l2 2 4-4"/>'),
  you: svg('<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-3.5 3.8-5.5 7-5.5s6 2 7 5.5"/>'),
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

export function mountSettings({ me, open, facts = () => ({ entities: 0 }) }) {
  const body = $("set-body");
  const nav = $("set-nav");
  const pane = $("set-pane");
  const sections = [...pane.querySelectorAll(".set-sec")];
  let current = "overview";
  const narrow = () => matchMedia(NARROW).matches;

  function paintNames() {
    const w = personWords(me.name);
    $("set-name").textContent = w.title;
    $("set-avatar").textContent = w.unnamed ? "" : w.title[0].toUpperCase();
    for (const el of pane.querySelectorAll("[data-person]")) el.textContent = w.inline;
    for (const el of pane.querySelectorAll("[data-person-cap]")) el.textContent = w.cap;
  }

  /** A page whose every block is hidden (e.g. Your account on the
   *  child's own device) drops out of the list. */
  const isEmpty = (sec) =>
    ![...sec.querySelectorAll(":scope > .seg-row, :scope > .set-quick, :scope > .wincard")]
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
    board: () => [onText("cells-seg") && `${onText("cells-seg")} buttons`, onText("kb-mode")].filter(Boolean).join(" · "),
    talking: () => `Feeling faces ${onOff("expressive-voice")} · ${onText("fresh-speak").toLowerCase()}`,
    lang: () => `Grammar help ${onOff("grammar-help")} · outlines ${onOff("hl-next")}`,
    backup: () => (cardMade() ? "Recovery card made" : "No recovery card yet"),
  };
  const WARN = { backup: () => !cardMade() };

  /* The setup checklist: only facts Pip can measure. It leaves once all
   * are done; the missing-card warning stays on the list regardless. */
  function checklist() {
    const f = facts();
    return [
      { done: !!me.name?.trim(), label: "Name who uses this board", hint: "Team & devices → Name", go: () => show("team") },
      { done: f.entities > 0, label: "Add their people and places", hint: "Names and photos Pip can suggest", go: () => $("open-setup").click() },
      { done: cardMade(), label: "Make the recovery card", hint: "If this device is lost or reset, the card brings everything back.", go: () => show("backup"), warn: true },
    ];
  }

  function renderOverview() {
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

  function renderNav() {
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

  function show(id, { focus = false } = {}) {
    current = id;
    for (const sec of sections) sec.classList.toggle("on", sec.dataset.sec === id);
    for (const b of nav.querySelectorAll(".set-nav-btn")) b.classList.toggle("on", b.dataset.sec === id);
    body.dataset.view = "pane";
    pane.scrollTop = 0;
    if (focus) pane.focus({ preventScroll: true });
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
  });
  // Rows hide and show as account / sync state resolves after open, and
  // a control's .on moves when its owner writes — the list follows both.
  let queued = false;
  new MutationObserver((muts) => {
    if (queued || !$("menu").classList.contains("open")) return;
    if (muts.every((m) => m.target.closest?.("#set-check, #set-glance"))) return;
    queued = true;
    queueMicrotask(() => { queued = false; renderNav(); });
  }).observe(pane, { subtree: true, attributes: true, attributeFilter: ["hidden", "class"] });

  /** Open Settings: fresh names, the list on a phone, Overview on a
   *  wide screen. */
  const onOpen = [];
  function openSettings(section = "overview") {
    if (section === "results") section = "overview";
    $("set-search").value = "";
    for (const fn of onOpen) fn();
    paintNames();
    current = section;
    renderNav();
    show(section);
    if (narrow() && section === "overview") body.dataset.view = "list";
    open("menu");
  }

  /* Search: every row's own words (label, hint, button text) plus the
   * everyday words people use for a page ("voice", "bigger", "teacher").
   * A hit opens the page and marks the row. */
  const SYNONYMS = {
    overview: "spotlight practice goal target model lesson add word edit",
    words: "vocabulary library photo picture name add list people places family meal breakfast lunch dinner snack groups folder hide",
    board: "cells size bigger smaller grid layout top row core keyboard typing letters spell qwerty abc alphabet",
    talking: "voice speak sound expressive emotion feelings happy sad angry tone play sentence clear fresh",
    lang: "grammar forms endings plural tense highlight predict prediction hint next smart bar question families",
    progress: "stats report iep evidence week numbers",
    team: "invite supporter slp teacher therapist share device link pair ipad phone tablet code person people user switch client add",
    backup: "backup qr restore lost recovery card pin lock password privacy research data anonymous delete remove erase",
    you: "account email sign login passkey license lifetime buy upgrade",
  };
  const search = $("set-search");
  const results = $("set-results");
  const rowText = (row) => row.textContent.replace(/\s+/g, " ").trim();
  function runSearch() {
    const q = search.value.trim().toLowerCase();
    if (!q) { show(current === "results" ? "overview" : current); return; }
    // Match at the start of a word: "pin" finds PIN, not "typing".
    const esc = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${esc}`, "iu");
    const hits = [];
    for (const sec of sections) {
      if (sec === results || isEmpty(sec)) continue;
      // Overview's checklist and summary repeat other pages' words.
      const rows = [...sec.querySelectorAll(":scope > .seg-row")]
        .filter((r) => !r.hidden && r.id !== "set-check" && !r.querySelector("#set-glance"));
      const matched = rows.filter((r) => re.test(rowText(r)));
      if (matched.length) {
        for (const r of matched) hits.push({ sec, row: r, label: r.querySelector(".seg-label")?.textContent || sec.dataset.title });
      } else if (re.test(SYNONYMS[sec.dataset.sec] ?? "") || re.test(sec.dataset.title)) {
        hits.push({ sec, row: null, label: sec.dataset.title });
      }
    }
    const list = $("set-results-list");
    list.replaceChildren();
    $("set-results-title").textContent = `Results for "${search.value.trim()}"`;
    for (const h of hits) {
      const b = document.createElement("button");
      b.className = "set-glance-row";
      const t = document.createElement("b");
      t.textContent = h.label;
      const v = document.createElement("span");
      v.textContent = h.row ? h.sec.dataset.title : "Open page";
      b.append(t, v);
      b.onclick = () => {
        search.value = "";
        show(h.sec.dataset.sec);
        if (h.row) {
          h.row.scrollIntoView({ block: "center" });
          h.row.classList.add("set-found");
          setTimeout(() => h.row.classList.remove("set-found"), 1600);
        }
      };
      list.append(b);
    }
    $("set-results-none").hidden = hits.length > 0;
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
  };
}
