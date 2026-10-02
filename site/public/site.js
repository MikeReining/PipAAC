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
