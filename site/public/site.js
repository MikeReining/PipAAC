// pipaac.org — the only script on the site. Sticky CTA on phones: shown once
// the page's first CTA (#hero-cta) has scrolled away, hidden again while the
// closing CTA (#final-cta) is on screen. No tracking, no storage.
(() => {
  const bar = document.getElementById("sticky-cta");
  const hero = document.getElementById("hero-cta");
  const last = document.getElementById("final-cta");
  if (!bar || !hero || !last) return;
  const update = () => {
    const pastHero = hero.getBoundingClientRect().bottom < 0;
    const r = last.getBoundingClientRect();
    const lastVisible = r.top < innerHeight && r.bottom > 0;
    bar.classList.toggle("show", pastHero && !lastVisible);
  };
  addEventListener("scroll", update, { passive: true });
  update();
})();

// Home hero: a tap anywhere on the iPad holds the finished sentence and plays
// it in the app's voice. The clip is a take of the production sentence recipe
// (scripts/voice/mint_onramp.mjs --say, voi_default_en) — never device TTS.
(() => {
  const btn = document.getElementById("hero-hear");
  if (!btn) return;
  const stage = btn.closest(".device-stage");
  const clip = new Audio("/voice/hero-mimi-park.mp3");
  clip.preload = "metadata";
  // Until the clip ships (founder listen), a silent button is worse than none.
  clip.addEventListener("error", () => { btn.hidden = true; });
  const stop = () => stage.classList.remove("hearing");
  clip.addEventListener("ended", stop);
  btn.addEventListener("click", () => {
    clip.currentTime = 0;
    stage.classList.add("hearing");
    clip.play().catch(stop);
  });
})();

// schools.html license-code box: live total at $24.50 a code (Pricing § 4.5,
// half price from 10). The form itself is a plain POST to the app worker —
// no JS needed to buy; this only repaints the math and, in local preview,
// points the form at the local app copy.
(() => {
  const form = document.getElementById("buy-codes");
  if (!form) return;
  const count = document.getElementById("buy-count");
  const total = document.getElementById("buy-total");
  const each = document.getElementById("buy-each");
  const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const paint = () => {
    const n = Math.min(Math.max(parseInt(count.value, 10) || 10, 10), 200);
    total.textContent = usd.format(n * 24.5);
    each.textContent = `${n} codes × $24.50 — you save ${usd.format(n * 24.5)}`;
  };
  count.addEventListener("input", paint);
  paint();
  if (["localhost", "127.0.0.1"].includes(location.hostname)) {
    form.action = "http://localhost:21087/api/v1/checkout/codes";
  }
})();

// faq.html search (042): the same answers the app's Help shows, built
// from src/help/answers.en.json. Words match on the page at once; the
// app's search by meaning ("emotions" → feeling faces) refines it.
(() => {
  const input = document.getElementById("faq-q");
  if (!input) return;
  const items = [...document.querySelectorAll(".faq details[id]")];
  const none = document.getElementById("faq-none");
  const words = (s) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const text = new Map(items.map((d) => [d, words(d.textContent)]));
  let seq = 0;
  let timer = null;
  const paint = (show, top) => {
    for (const d of items) {
      d.hidden = !!show && !show.has(d.id);
      d.open = d.id === top;
    }
    for (const g of document.querySelectorAll(".faq")) {
      const empty = ![...g.querySelectorAll("details")].some((d) => !d.hidden);
      g.hidden = empty;
      for (let p = g.previousElementSibling; p && !p.classList.contains("faq"); p = p.previousElementSibling) {
        if (p.matches(".faq-group, .faq-intro")) p.hidden = empty;
        if (p.matches(".faq-group")) break;
      }
    }
    none.hidden = !show || show.size > 0;
  };
  input.addEventListener("input", () => {
    const my = ++seq;
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) { paint(null); return; }
    const qs = words(q);
    const local = new Set(items.filter((d) => qs.every((w) => text.get(d).some((t) => t.startsWith(w)))).map((d) => d.id));
    paint(local);
    if (q.length < 2) return;
    timer = setTimeout(async () => {
      try {
        const r = await fetch(`https://app.pipaac.org/api/v1/help/search?q=${encodeURIComponent(q)}`);
        const { hits = [] } = r.ok ? await r.json() : {};
        if (my !== seq) return;
        const ids = hits.filter((h) => h.id.startsWith("a:")).map((h) => h.id.slice(2))
          .filter((id) => document.getElementById(id)?.matches(".faq details"));
        paint(new Set([...ids, ...local]), ids[0]);
      } catch { /* offline: the word matches stand */ }
    }, 300);
  });
})();

// modeling.html demo: a tap on the phone lights that word on the iPad for
// a few seconds, or until it's pressed (the app's MODEL_FADE_MS is 4 s; the
// demo waits 6 so a reader can find the tile); a press on
// the iPad speaks and shows up as a count on the phone. The phone's light is
// silent, as in the app by default. Tips are the shipped ones
// (data/coach_tips.json); voice/ holds copies of the default voice's shipped
// clips (catalog.json clips, voi_default_en) — never device TTS. No storage,
// nothing sent.
(() => {
  const phone = document.getElementById("demo-phone");
  if (!phone) return;
  const ipad = document.getElementById("demo-ipad");
  const say = document.getElementById("demo-say");
  const bar = document.getElementById("demo-bar");
  const tip = document.getElementById("demo-tip");
  const reset = document.getElementById("demo-reset");
  const TIPS = {
    eat: "model \"eat\" while you take a bite yourself.",
    drink: "offer the cup, model \"drink\", and wait a beat before helping.",
    more: "pause mid-snack or mid-play, then model \"more crackers\" and wait.",
    "all done": "model it at the natural end of things: \"all done bath\", \"all done book\".",
    open: "at doors, jars, and boxes: model \"open\" and wait before opening.",
  };
  const START = say.innerHTML;
  const lit = new Map(); // word → fade timer
  const counts = new Map();
  const tile = (root, w) => root.querySelector(`[data-w="${w}"]`);
  const b = (w) => `<strong>${w}</strong>`;
  const clips = new Map();
  let playing = null;
  const speak = (w) => {
    if (!clips.has(w)) clips.set(w, new Audio(`/voice/${w.replace(" ", "-")}.mp3`));
    if (playing) { playing.pause(); playing.currentTime = 0; }
    playing = clips.get(w);
    playing.play().catch(() => { /* no sound allowed: the words still show */ });
  };

  const unlight = (w) => {
    clearTimeout(lit.get(w));
    lit.delete(w);
    tile(ipad, w)?.classList.remove("lit");
  };

  phone.addEventListener("click", (e) => {
    const w = e.target.closest("[data-w]")?.dataset.w;
    if (!w) return;
    unlight(w);
    tile(ipad, w).classList.add("lit");
    lit.set(w, setTimeout(() => {
      unlight(w);
      if (say.dataset.wait !== w) return;
      say.innerHTML = `The light faded on its own. It's an invitation, never a must. Light another word on your phone.`;
    }, 6000));
    tip.hidden = false;
    tip.innerHTML = `<strong>On your phone, the tip:</strong> ${b(w)} — ${TIPS[w]}`;
    say.innerHTML = `Now you're Theo. Tap ${b(w)} on the iPad.`;
    say.dataset.wait = w;
    reset.hidden = false;
  });

  ipad.addEventListener("click", (e) => {
    const w = e.target.closest("[data-w]")?.dataset.w;
    if (!w) return;
    const wasLit = lit.has(w);
    unlight(w);
    delete say.dataset.wait;
    speak(w);
    const word = document.createElement("span");
    word.className = "said";
    word.textContent = w;
    bar.querySelector(".demo-bar-empty")?.remove();
    bar.append(word);
    while (bar.children.length > 4) bar.firstElementChild.remove();
    const mine = tile(phone, w);
    if (mine) {
      counts.set(w, (counts.get(w) ?? 0) + 1);
      mine.dataset.n = counts.get(w);
    }
    say.innerHTML = wasLit
      ? `That's modeling. He saw ${b(w)} light up, then said it himself. The ${b(counts.get(w))} on your phone is his.`
      : `Pip says "${w}." Nothing on his board is turned off, so he can say anything${mine ? ", and it still counts" : ""}.`;
    reset.hidden = false;
  });

  reset.addEventListener("click", () => {
    for (const w of [...lit.keys()]) unlight(w);
    counts.clear();
    for (const t of phone.querySelectorAll("[data-n]")) delete t.dataset.n;
    bar.innerHTML = `<span class="demo-bar-empty">Theo's words show here</span>`;
    tip.hidden = true;
    reset.hidden = true;
    say.innerHTML = START;
    delete say.dataset.wait;
  });
})();

// add-any-word.html demo: one word placed in two groups. "Draw again" swaps
// the picture on every placement at once — the word owns its picture, the
// groups only point at it. Both pictures were drawn once, ahead of time, by
// the app's art pipeline (assets/site/); nothing is drawn or sent here.
(() => {
  const draw = document.getElementById("edit-draw");
  if (!draw) return;
  const say = document.getElementById("edit-say");
  const tiles = [...document.querySelectorAll(".tile.jack")];
  const PICS = { clown: "/tiles/jack-in-the-box.webp", puppy: "/tiles/jack-in-the-box-puppy.webp" };
  new Image().src = PICS.puppy;
  let puppy = false;
  draw.addEventListener("click", () => {
    puppy = !puppy;
    for (const t of tiles) {
      t.querySelector("img").src = puppy ? PICS.puppy : PICS.clown;
      t.classList.remove("redrawn");
      void t.offsetWidth;
      t.classList.add("redrawn");
    }
    draw.textContent = puppy ? "Undo" : "Draw again";
    say.innerHTML = puppy
      ? "Changed in <strong>My Words</strong> and <strong>Play</strong> at once. It's one word, so there's one picture."
      : "One word in two groups. Change it once.";
  });
})();
