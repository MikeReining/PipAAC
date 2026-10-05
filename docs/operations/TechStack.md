# Tech Stack

Status: web app and sync relay are live at `app.pipaac.org`. Current work
and device-proof gaps are routed by `docs/phases/README.md`.

## Product direction

**LIVE.** PipAAC — see `docs/strategy/Vision.md`. The web app is in production
(`app.pipaac.org`, live 2026-10-01); the iOS build approach is open.

**DECIDED 2026-09-22** (not built). An iOS App Store app plus the web app in
this repo, sharing one SQLite schema; the iOS build approach is open
(`docs/product/Platforms_iOS_And_Web.md`). Sync relay on Cloudflare Workers —
Durable Objects (`RELAY` per user, `TILE_LEDGER` per-day mint counters,
`USAGE` fair-use reservations) and R2 (`BLOBS`, `VOICE`) are built and live
(`docs/product/Sync_And_Web_Editing.md`, `wrangler.jsonc`).

## Current

- Package manager: npm with `package-lock.json`
- Node: see `.nvmrc` (24 — `node:sqlite` drives tests and scripts)
- Runtime: Cloudflare Workers (`wrangler.jsonc`, `src/worker/index.js`)
- Test runner: `scripts/test.sh` + `node --test`
- Closeout gates: `npm run check` / `npm run check:fast`
- Commit handoff queue: `scripts/commit_handoff_queue.py` + `.wmd/commit-queue.jsonl`
- CI: `.github/workflows/check.yml`

## Local setup

```bash
npm ci
bash scripts/install-test-guard.sh   # once per machine; new shell after install
bash scripts/install_commit_queue_watcher.sh   # optional; for Codex handoff watcher
bash scripts/install_dev_slot0.sh    # optional; keeps the founder browse copy alive
```

Verify test guard in a **new** shell:

```bash
bash scripts/check-test-guard-liveness.sh
```

CI prepends `scripts/bin` to `PATH` so the guard-liveness gate can pass without
shell profile changes.

## Commands

| Command | Purpose |
| --- | --- |
| `npm test` | Full unit suite via protected runner |
| `npm run check:fast` | Cheap gates during iteration |
| `npm run check` | Closeout wall |
| `npm run dev` | Founder browse copy at `http://localhost:21087` |
| `npm run dev:agent` | Agent copy on the first free port 21088–21098 |
| `npm run dev:status` | Which local copies are listening |
| `bash scripts/install_dev_slot0.sh` | macOS LaunchAgent so the browse copy comes back if something kills it |
| `npm run dev:site` | Marketing site preview at `http://localhost:21200` (`site/`, 035) |
| `npm run deploy:site` | Deploy `pipaac.org` + `www.pipaac.org` (separate project `pipaac-site`) |
| `scripts/test.sh <paths>` | Targeted proof while iterating |
| `python3 scripts/commit_handoff_queue.py request ...` | Codex commit handoff |
| `npx wrangler deploy` | Production: `https://app.pipaac.org` (custom domain) + `pippaac.emailmike.workers.dev` |

## Production

Live 2026-10-01. `app.pipaac.org` is a Workers custom domain on `pippaac` —
origin-scoped local data makes `app.` a one-way decision (SSOT). Email
Sending is verified for `accounts@pipaac.org` (SPF/DKIM/DMARC on the zone;
`send_email` binding `EMAIL`). Prod secrets: `ELEVENLABS_API_KEY`,
`PIP_ADMIN_TOKEN`, `PIP_LICENSE_SECRET`, `PIP_UNLOCK_TOKEN`, `GROQ_API_KEY`,
`TYPESAFE_API_KEY`, `TILE_LIVE=1` (live tile mints, `TILE_DAY_MINTS=500`
cap). Mint a tester license: `node scripts/entitlement/mint.mjs <user-id>` —
the same `PIP_LICENSE_SECRET` is in `.dev.vars`, so minted keys verify in
prod. One-tap tester link: `https://app.pipaac.org/?unlock=<PIP_UNLOCK_TOKEN>`
turns Pip Lifetime on for the person that opens it (localhost: bare
`?unlock`; Stats_And_Progress § 4.2). Live drawing is on (founder
approved the cost 2026-10-02): `DRAW_LIVE=1` + `OPENROUTER_API_KEY`
(030). Spend is capped per person (5 free, 300 Lifetime) and by the
OpenRouter key's own limit — there is no global daily draw cap.
Payments (015 slice 6, built 2026-10-02): Stripe objects exist (see 015
slice 6 for ids — test + live products/prices/webhook endpoints on
`acct_1U43csFPjZdfZdLb`, the PipAAC account). Prod secrets pushed
2026-10-02: `STRIPE_WEBHOOK_SECRET` (live endpoint whsec),
`STRIPE_PRICE_ID` (live $49 price), `STRIPE_SECRET_KEY` (durable
`sk_live`, verified against live mode 2026-10-02). Checkout/webhook
routes are LIVE (deployed 2026-10-02); checkout sessions accept
promotion codes (`PIPTEST` = 100% off, in test and live). License codes (`POST /admin/v1/license-codes`,
Bearer `PIP_ADMIN_TOKEN`) and `POST /api/v1/license/redeem` work with
existing secrets. Self-serve codes (2026-10-03): `POST
/api/v1/checkout/codes` {count 1–200; $49 each under 10, half price 10+} — the pricing and schools pages form-POST it
for a 303 to Stripe — then the webhook mints the batch (`code_order` in
the accounts dir, sealed codes) and `/codes.html?session=` displays
them (`GET /api/v1/license/order`). Local dev: `.dev.vars` has the test-mode key + price;
`stripe listen --forward-to localhost:21087/api/v1/stripe/webhook`
supplies the webhook signing secret per session. Marketing
site: `pipaac.org` + `www.pipaac.org` are live on the separate project
`pipaac-site` (`site/`, deployed 2026-10-02); `npm run deploy:site`
pushes updates. Note the "works offline" copy shipped with the site —
036 § 5 makes the real-iPad Works Test the gate for that claim, so a
site redeploy before the device test should hold or soften it.

**Killed release / bad SW pin:** bump `RELEASE` in
`scripts/sw/sw_manifest.mjs` (the buildId `r<N>` prefix is the manual
escape hatch — `sw-manifest.json` and `sw-build.js` are generated, so
never hand-edit them), re-run `node scripts/sw/sw_manifest.mjs`,
redeploy. Clients pick up the fresh `pip-shell-r<N>-*` cache on the
next update check (036 § 6).

## Local preview

**DECIDED 2026-08-28.** One founder browse copy, always at
`http://localhost:21087` (moved off 8787 on 2026-09-28 — the 87xx block
collides with other wrangler projects on this Mac).
Agents and other processes start their own copy with `npm run dev:agent`.

Founder review URL: `http://localhost:21087/?reseed` — group seeds
install once per profile (027 § 4), so without the flag a running
profile shows its first-installed seed forever. `?reseed` drops
installed builtin seeds at boot and reinstalls from the shipped
catalog; custom groups, My Words and entities survive (`public/db.js`,
`shared/groups.mjs: reseedBuiltinGroups`). Plain `/` keeps the
profile's edits — use it when testing that they stick.

- Each copy has its own persist dir and inspector port. **BUILT** (`scripts/dev.mjs:51`)
- `npm run dev` on a live browse copy prints the URL and exits; it does not kill the founder tab. **BUILT** (`scripts/dev.mjs:231-232`)
- Wrangler secrets live in `.dev.vars` (see `.dev.vars.example`).

Once per Mac: `bash scripts/install_dev_slot0.sh` so a SIGTERM on the browse copy comes back.

## Auth / secrets

`.dev.vars` is gitignored. Copy `.dev.vars.example` when Worker secrets are needed.
