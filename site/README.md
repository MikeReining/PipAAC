# pipaac.org — marketing site

The first-contact site for families and supporters. It is a **separate
Cloudflare project** from the app: `pipaac.org` serves these static files,
`app.pipaac.org` serves the app. The split is deliberate (SSOT — domain):

- Marketing never shares an origin with child data — no app cookies, no
  analytics pointed at `app.` (COPPA posture).
- A site deploy can never break the offline app.

## Layout

```txt
site/
  wrangler.jsonc   — project "pipaac-site", routes pipaac.org + www→apex
  src/index.js     — www redirect + security headers only; no logic lives here
  public/          — the whole site. Static HTML/CSS/assets, folder-native:
                     /foo.html → pipaac.org/foo.html
  README.md        — this file
```

## Working on it

```bash
npm run dev:site      # local preview at http://localhost:21200
npm run deploy:site   # deploy to pipaac.org (uses the repo's wrangler auth)
```

## For the designer / copywriter

- Everything user-facing lives in `site/public/` — plain HTML + one
  stylesheet (`styles.css`) + `site.js` (sticky phone CTA only). No build
  step, no framework.
- **Header and footer are copied into every page.** Change nav or footer
  in `index.html`, then make the same edit in every other `.html` file
  (`grep -l site-nav site/public -r`).
- Pages: `index`, `method`, `modeling`, `add-any-word`, `slps`, `pricing`, `faq`, `schools`, `about`,
  `404`, `compare/` (hub + one page per competitor).
- **`compare/*.html` are generated.** Edit `site/compare-data.json` (the
  feature matrix, ratings 0–4 as Harvey balls) and run `npm run
  site:compare`; `check:fast` fails if the pages drift. The generator also
  copies the header, footer, and the `ONLY-IN-PIP` section from
  `index.html`, so rerun it after changing those. Spec and copy source:
  `docs/phases/035_Marketing_Site_Proposal.md`.
- Art: bird poses as transparent WebP in `pip/`, tile art in `tiles/`
  (from `public/symbols/`). Fonts are Andika latin subsets. `voice/` holds
  copies of the default voice's shipped clips for the /modeling demo (from
  `public/audio/`, keys in `catalog.json` clips) — recopy if a clip is replaced.
- Brand tokens are CSS custom properties at the top of `styles.css`; they
  trace to `docs/product/Design_System.md`. The Pip marks and poses are in
  `site/public/brand/` (masters in `assets/brand/`).
- **Factual claims** (price, free tier, "never a subscription") must match
  `docs/product/Pricing_And_Packaging.md` § 4 — that doc is the truth owner.
- **Discovery** (search, AI answers, pitches, links) follows
  `docs/strategy/SEO_Playbook.md`. Change the playbook when the plan
  changes. A new page still needs a job the playbook's destination
  table does not already cover.
- New pages: add `public/<name>.html` and link it — no routing config.
- Keep it fast and static. Anything interactive or tracked needs a founder
  call first (COPPA posture above).
