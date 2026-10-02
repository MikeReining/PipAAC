# 035 — The marketing site (pipaac.org)

**Executing.** Slice A (skeleton) BUILT 2026-10-02. **Slice B (design +
copy) BUILT 2026-10-02** per `035_Marketing_Site_Proposal.md`: home, /method,
/slps, /pricing, /faq, /compare (hub + 6), /schools, /about, 404. Next:
founder story for /about, /privacy (founder + legal), `hello@pipaac.org`
routing, then the DNS fix and `npm run deploy:site`.

Intake: founder 2026-10-02 — "set up the skeleton … designer and
copywriter take over once the back-end main website is set up."

Truth owners:

| Topic | Owner |
| --- | --- |
| Domain split, origin isolation | `docs/product/SSOT.md` (domain row) + `docs/strategy/Vision.md` |
| Factual claims (price, free tier) | `docs/product/Pricing_And_Packaging.md` § 4 |
| Brand marks, tokens | `docs/product/Design_System.md`, `assets/brand/` |
| How to work in `site/` | `site/README.md` |

## Decision (SSOT, 2026-10-01)

`pipaac.org` root = marketing; `app.pipaac.org` = app. Marketing never
shares an origin with child data and deploys as a **separate project** —
`site/wrangler.jsonc` (`pipaac-site`) is that project, living in this repo
so the brand assets and the pricing truth stay next to the product.

## Slice A — skeleton

**BUILT 2026-10-02.**

- `site/wrangler.jsonc` — assets + thin worker, routes `pipaac.org` and
  `www.pipaac.org` (custom domains).
- `site/src/index.js` — www→apex 301 + security headers; no logic.
- `site/public/` — `index.html` (semantic skeleton, `TODO(copy)` markers),
  `styles.css` (Design_System tokens), `brand/` (mark, hero pose, icons).
- `site/README.md` — designer/copywriter handoff: commands, layout,
  truth-owner links, COPPA constraint.
- npm scripts: `dev:site` (localhost:21200), `deploy:site`.

Works Test: `npx wrangler dev --config site/wrangler.jsonc --port 21200`
serves `/`, `/styles.css`, `/brand/*` 200 with the security headers
(verified locally 2026-10-02).

Deploy 2026-10-02: `pipaac-site` uploaded and live at
`pipaac-site.emailmike.workers.dev`. **Custom domains blocked:** apex and
`www` hold stale A/CNAME records proxied to a dead origin (both return
525 today). Founder step: delete the `pipaac.org`/`www` records in the
zone's DNS page, then `npm run deploy:site` attaches both domains — no
API token on this machine covers zone DNS.

## Slice B — design + copy

**BUILT 2026-10-02.** Spec: `035_Marketing_Site_Proposal.md`. Static pages in
`site/public/`; one stylesheet, one tiny script (`site.js`, sticky phone CTA,
no tracking). Every primary CTA → `app.pipaac.org` (board first; the account
ask is the app's Protect card). Home first paint 147 KB (fonts are latin
subsets; below-fold images lazy). Works Test: `npm run dev:site`, every
internal link 200 except `/privacy` (owed), unknown paths serve the 404 page.
Compare pages are generated from `site/compare-data.json` by
`scripts/site/build_compare.mjs` (`npm run site:compare`; `--check` in
`check:fast`). Offline is claimed on the site: it ships before launch
(founder, 2026-10-02; `036_Offline_Support.md`).

## Still owed (not this repo's agents — people)

- Founder story for /about (`<!-- TODO(founder) -->` in `about.html`).
- `/privacy` — founder + legal (footer links to it today).
- Email Routing for `hello@pipaac.org` (schools CTA and /about use it).
- First production deploy (`npm run deploy:site`) once DNS/custom domains
  are confirmed on the Cloudflare zone.
- Legal pages (privacy policy) — founder call, COPPA-sensitive claims.

## Out of scope

Analytics, ads, forms that collect personal data, blog/CMS. Any of those
needs a founder ruling first — the no-tracking posture on child-adjacent
surface is a decided invariant.
