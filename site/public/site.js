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
