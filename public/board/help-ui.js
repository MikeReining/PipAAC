/**
 * 042 — Help: the answers, one search for answers and Settings, and
 * Write to us. The content is public/help.en.json (built from
 * src/help/answers.en.json + index.html); search is two passes
 * (public/shared/help_search.mjs): words on the device at once, then
 * the Worker's search by meaning when online.
 *
 * Settings owns navigation; this module renders into the Help page
 * (#help-ask's section) and into the search results page, and opens a
 * Settings row through `show`.
 */
import { localHits, mergeHits } from "../shared/help_search.mjs";
import { withIcons } from "./inline-icons.js";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const OUTBOX = "pip-help-outbox";
const EMAIL_KEY = "pip-help-email";
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

export function mountHelp({ pane, show, me, trial }) {
  const page = $("help-ask").closest(".set-sec");
  let help = null;
  let loading = null;
  const load = () => (loading ??= fetch("/help.en.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((h) => { help = h; if (!h) loading = null; return h; })
    .catch(() => { loading = null; return null; }));

  /* A Settings entry's live row: found by its label on its page (labels
   * are what the index was built from), else by the element id. */
  function rowFor(s) {
    const sec = pane.querySelector(`.set-sec[data-sec="${s.sec}"]`);
    if (!sec || s.label === s.title) return null;
    const label = [...sec.querySelectorAll(".seg-label")].find((l) => l.textContent.trim() === s.label);
    return (label ?? (s.at && $(s.at)))?.closest(".seg-row") ?? null;
  }
  const shown = (node) => !!node && !node.closest("[hidden]");
  const pageShown = (sec) => {
    const s = pane.querySelector(`.set-sec[data-sec="${sec}"]`);
    return !!s && [...s.querySelectorAll(":scope > .seg-row, :scope > .set-quick")].some((n) => !n.hidden);
  };

  function goTo(sec, row) {
    $("set-search").value = "";
    show(sec, { focus: true });
    if (!row) return;
    row.scrollIntoView({ block: "center" });
    row.classList.add("set-found");
    setTimeout(() => row.classList.remove("set-found"), 1600);
  }

  function answerEl(a, { open = false } = {}) {
    const d = el("details", "help-a");
    d.open = open;
    d.dataset.id = a.id;
    d.append(withIcons(el("summary"), a.q));
    const body = el("div", "help-a-body");
    for (const p of a.a.split("\n\n")) body.append(withIcons(el("p"), p));
    const target = a.go && (a.go.at ? $(a.go.at)?.closest(".seg-row") ?? null : null);
    if (a.go && pageShown(a.go.sec) && (!a.go.at || shown(target))) {
      const b = el("button", "btn secondary help-go", "Show me");
      b.onclick = () => goTo(a.go.sec, target);
      body.append(b);
    }
    d.append(body);
    return d;
  }

  function settingEl(s, row) {
    const b = el("button", "set-glance-row help-set");
    b.append(el("b", null, s.label), el("span", null, s.label === s.title ? "Open page" : `Settings › ${s.title}`));
    b.onclick = () => goTo(s.sec, row);
    return b;
  }

  /** Render hits into `list`; false when nothing could be shown. */
  function paint(list, hits) {
    list.replaceChildren();
    let firstAnswer = true;
    for (const { id } of hits) {
      if (list.childElementCount >= 7) break;
      if (id.startsWith("a:")) {
        const a = help.answers.find((x) => x.id === id.slice(2));
        if (!a) continue;
        list.append(answerEl(a, { open: firstAnswer }));
        firstAnswer = false;
      } else {
        const s = help.settings[Number(id.slice(2))];
        if (!s || !pageShown(s.sec)) continue;
        const row = rowFor(s);
        if (row && !shown(row)) continue;
        list.append(settingEl(s, row));
      }
    }
    return list.childElementCount > 0;
  }

  /* One search, two passes: local words now, meaning when it lands.
   * Each new query voids the last one's late answer. */
  let seq = 0;
  let timer = null;
  let ctl = null;
  async function search(q, list, none) {
    const my = ++seq;
    clearTimeout(timer);
    ctl?.abort();
    if (!(await load()) || my !== seq) return;
    const local = localHits(help, q);
    const paintAll = (meaning) => {
      const ok = paint(list, mergeHits(meaning, local));
      none.hidden = ok;
      if (!ok) paintNone(none, q);
    };
    paintAll([]);
    if (!navigator.onLine || q.trim().length < 2) return;
    timer = setTimeout(async () => {
      ctl = new AbortController();
      try {
        const r = await fetch(`/api/v1/help/search?q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal });
        const { hits = [], version } = r.ok ? await r.json() : {};
        if (my !== seq) return;
        // A Worker on another help version names other entries.
        if (version === help.version) paintAll(hits);
      } catch { /* offline or aborted: the local pass stands */ }
    }, 250);
  }

  function paintNone(box, q) {
    box.replaceChildren(el("span", null, `No answer for “${q.trim()}” yet. `));
    const b = el("button", "set-link", "Ask us");
    b.onclick = () => openWrite(`About “${q.trim()}”: `);
    box.append(b);
  }

  /* ---- The Help page ---- */
  const ask = $("help-ask");
  const input = el("input");
  Object.assign(input, { type: "search", id: "help-q", autocomplete: "off",
    placeholder: "Ask in your own words: feelings, bigger buttons, teacher…" });
  input.setAttribute("aria-label", "Ask a question");
  const hits = el("div", "help-list");
  const none = el("p", "set-intro help-none");
  none.hidden = true;
  ask.append(input, hits, none);

  const browse = el("div", "seg-row help-browse");
  const write = el("div", "seg-row help-write");
  const more = el("div", "seg-row");
  page.append(browse, write, more);

  input.addEventListener("input", () => {
    const q = input.value;
    browse.hidden = !!q.trim();
    if (!q.trim()) { hits.replaceChildren(); none.hidden = true; return; }
    search(q, hits, none);
  });

  /* Start here: what this adult most likely needs right now. */
  function suggested() {
    const t = trial();
    if (!navigator.onLine) return ["offline", "word-by-word"];
    if (me.role === "partner") return ["modeling", "touch-board", "school-home"];
    if (!t.licensed && t.endsAt && t.endsAt < Date.now()) return ["week-ends", "word-by-word", "not-using"];
    return ["first-week", "modeling", "not-using"];
  }

  async function renderBrowse() {
    if (!(await load())) {
      browse.replaceChildren(el("p", "hint", "Help needs the internet the first time it opens."));
      return;
    }
    browse.replaceChildren();
    const byId = (id) => help.answers.find((a) => a.id === id);
    browse.append(el("h3", "help-topic", "Start here"));
    for (const a of suggested().map(byId)) if (a) browse.append(answerEl(a));
    // Topics fold, so Write to us stays a short scroll away.
    for (const t of help.topics) {
      const answers = help.answers.filter((a) => a.topic === t.id);
      const d = el("details", "help-topics");
      const sum = el("summary");
      sum.append(el("b", null, t.title), el("span", null, `${answers.length}`));
      d.append(sum);
      if (t.intro) d.append(el("p", "hint", t.intro));
      for (const a of answers) d.append(answerEl(a));
      browse.append(d);
    }
  }

  /* ---- Write to us ---- */
  write.append(el("span", "seg-label", "Write to us"),
    el("p", "hint", "A question, something that isn't working, or an idea. It goes straight to the Pip team."));
  const msg = el("textarea", "help-msg");
  Object.assign(msg, { id: "help-msg", rows: 5, maxLength: 5000, placeholder: "What's on your mind?" });
  msg.setAttribute("aria-label", "Your message");
  const email = el("input", "help-email");
  Object.assign(email, { type: "email", id: "help-email", autocomplete: "email",
    placeholder: "Your email, so we can write back", value: store.get(EMAIL_KEY, "") });
  email.setAttribute("aria-label", "Your email");
  const detailsBox = el("label", "help-check");
  const details = el("input");
  Object.assign(details, { type: "checkbox", id: "help-details", checked: true });
  const detailsText = el("span");
  detailsBox.append(details, detailsText);
  const send = el("button", "btn", "Send");
  const status = el("p", "hint help-status");
  status.hidden = true;
  const sendRow = el("div", "row");
  sendRow.append(send);
  write.append(msg, email, detailsBox, sendRow, status);

  more.append(el("span", "seg-label", "More help"));
  const moreRow = el("div", "row");
  const tour = el("button", "btn secondary", "Replay the tour");
  tour.dataset.click = "replay-tour";
  const mail = el("a", "set-link", "hello@pipaac.org");
  mail.href = "mailto:hello@pipaac.org";
  moreRow.append(tour, mail);
  more.append(moreRow);

  const who = () => (me.name?.trim() ? `${me.name.trim()}'s` : "your child's");
  // The build: the Settings version line when it exists, else the
  // service worker's shell caches (one per installed build).
  const build = async () => $("set-version")?.textContent?.trim()
    || (await caches?.keys().catch(() => []) ?? []).filter((k) => k.startsWith("pip-shell-")).join(", ")
    || "unknown";
  async function appDetails() {
    const t = trial();
    return {
      "Pip version": await build(),
      Device: navigator.userAgent.slice(0, 160),
      Screen: `${innerWidth}×${innerHeight}`,
      Online: navigator.onLine ? "yes" : "no",
      "Pip Lifetime": t.licensed ? "yes" : t.endsAt && t.endsAt > Date.now() ? "free week" : "no",
      "This device": me.role === "partner" ? "a helper's" : "the user's own",
    };
  }

  async function post(item) {
    const r = await fetch("/api/v1/help/write", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(item),
    });
    if (r.status >= 500 || r.status === 429) throw new Error(`help_write_${r.status}`);
    return r.ok;
  }
  async function flush() {
    const box = store.get(OUTBOX, []);
    if (!box.length || !navigator.onLine) return;
    const left = [];
    for (const item of box) { try { await post(item); } catch { left.push(item); } }
    store.set(OUTBOX, left);
  }
  addEventListener("online", flush);

  const say = (text) => { status.textContent = text; status.hidden = false; };
  send.onclick = async () => {
    const text = msg.value.trim();
    if (!text) { msg.focus(); return; }
    const item = { message: text, email: email.value.trim(), details: details.checked ? await appDetails() : null };
    store.set(EMAIL_KEY, item.email);
    send.disabled = true;
    try {
      if (!navigator.onLine) throw new Error("offline");
      if (!(await post(item))) { say("That didn't send. Check the message and try again."); return; }
      msg.value = "";
      say(item.email ? "Sent. Thank you." : "Sent. Thank you. Add your email next time if you'd like a reply.");
    } catch {
      store.set(OUTBOX, [...store.get(OUTBOX, []), item].slice(-10));
      msg.value = "";
      say("Saved. It will send when this device is back online.");
    } finally {
      send.disabled = false;
    }
  };

  function openWrite(prefill = "") {
    input.value = "";
    hits.replaceChildren();
    none.hidden = true;
    browse.hidden = false;
    show("help", { focus: true });
    if (prefill && !msg.value.trim()) msg.value = prefill;
    write.scrollIntoView({ block: "center" });
    msg.focus();
  }

  pane.addEventListener("click", (e) => {
    if (e.target.closest("[data-help-write]")) openWrite();
  });

  return {
    search,
    load,
    openWrite,
    /** Fresh every time Settings opens: suggestions follow state. */
    reset() {
      input.value = "";
      hits.replaceChildren();
      none.hidden = true;
      browse.hidden = false;
      status.hidden = true;
      detailsText.textContent = ` Include app details: version, device, and whether Pip Lifetime is on. Never ${who()} words.`;
      renderBrowse();
      flush();
    },
  };
}
