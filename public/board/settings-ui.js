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

export function mountSettings({ me, open }) {
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
      b.append(t);
      nav.append(b);
    }
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
  // Rows hide and show as account / sync state resolves after open.
  new MutationObserver(renderNav).observe(pane, {
    subtree: true, attributes: true, attributeFilter: ["hidden"],
  });

  /** Open Settings: fresh names, the list on a phone, Overview on a
   *  wide screen. */
  const onOpen = [];
  function openSettings(section = "overview") {
    for (const fn of onOpen) fn();
    paintNames();
    current = section;
    renderNav();
    show(section);
    if (narrow() && section === "overview") body.dataset.view = "list";
    open("menu");
  }

  return {
    open: openSettings, show, paintNames, renderNav,
    current: () => current,
    onOpen: (fn) => onOpen.push(fn),
  };
}
