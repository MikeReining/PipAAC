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
