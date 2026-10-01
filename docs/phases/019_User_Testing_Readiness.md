# 019 — User-Testing Readiness

**Status:** executing (opened 2026-09-24)
**Truth owner:** the app as it behaves from a cold start — not docs, not intent.
**Why this phase exists:** the founder's call — "we don't even have an app that I
can send anyone." Work backwards from a tester opening a URL and tapping a
sentence. Anything that blocks that is the priority; nothing else is.

## Done when

A caregiver with no repo access can open a shared URL, finish setup, and have
their child tap words that speak — on a board of real pictures — and it still
works after a reload.

## Verified working (measured, not assumed)

- App shell boots and serves (`/`, `board.js`, `catalog.json` — 200s, fresh
  agent slot 8794, 2026-09-24).
- Audio is wired end-to-end: 677 ready clips + one bundled voice ship in the
  catalog; bytes materialize into `public/audio/`; entities fall back to
  device TTS.
- Symbols are shipped: 197 approved `image` rows + `sense.default_image_id`,
  bytes in `public/symbols/` — every home-board cell paints a picture except
  `mom`/`dad` (setup fills them with the child's own people).
  Proof: `src/board/symbol_art.test.mjs`.
- A board saved before the v2 map opens onto the shipped grid (2026-09-24,
  agent slot 8795): 60 cells, 58 pictures loaded, tap on **want** played
  `audio/want/de5c5fd03583.mp3` to `ended`, Speak played it again, and a
  reload restored the grid plus that tap in `learner_event_log`.
  Proof: `src/board/core_place.test.mjs` (stale tier + stale slot) and that
  browser pass.

## Open blockers

| # | Blocker | Notes |
| --- | --- | --- |
| 1 | ~~**No deploy**~~ — resolved 2026-10-01: `app.pipaac.org` is a Workers custom domain on `pippaac`; Email Sending verified for `pipaac.org` (`accounts@pipaac.org`); prod secrets pushed (`PIP_LICENSE_SECRET`, `GROQ_API_KEY`, `TYPESAFE_API_KEY`, `TILE_LIVE=1` — live mints, 500/day cap) | `https://app.pipaac.org/?reseed` on the tester device; license via `scripts/entitlement/mint.mjs` |
| 2 | ~~**First-run setup**~~ — fixed 2026-09-28: the automatic first user is created with `needsSetup` and the "Who do they call for?" sheet opens on first boot | proven on screen: fresh profile → setupform open, save closed it (agent slot 8797) |
| 3 | **Dev-server hygiene** — slot-0 (8787, founder's copy) still accepts TCP and never answers HTTP (workerd pid 19014, 2026-09-24). `npm run dev` treats that as already running | a working copy is on 8795 |

## Landed slices

- **Symbols shipped (2026-09-24):** `build_catalog.mjs` turns canonical
  `assets/symbols/<word>.<ext>` files into approved image rows (matching on
  spoken text, `_`→` `, `_rollN` excluded, png > svg > jpg) and copies bytes
  to `public/symbols/`. Sources committed so `catalog:build --check`
  reproduces on a clean checkout. `symbol_art.test.mjs` proves rows → files →
  `SENSE_ART_SQL` → home-board coverage.
- **Saved boards open on the shipped map (2026-09-24):** `importCatalog`
  refreshes catalog-owned sense fields and replaces `core_cell` for each
  shipped layout. Adult placements stay in `core_override`. Without this,
  a device saved before a word joined root core aborted import
  (`core cell requires a root_core sense`) and the grid never painted.
- **Top bar readable, controls as glyphs (2026-09-24):** sentence words are
  picture + 20px ink word with no role color, bar 68px; 🗑 · ⌫ · 🔊 · 📊 · ✚
  are ink SVG glyphs; ⌫ detaches the last pick; "After Speak, the next
  word" (`fresh_after_speak`, default Adds on). Browser pass on agent slot
  8797: bar reads I/want/go, ⌫ detached `go` in `learner_event_log`,
  Adds on → "I want more", Starts fresh → "Go", ⌫ cancels a fresh start.
  Audio to `ended` unproven there (tab hidden — Chrome never loaded media).
  Spec: `docs/product/Design_System.md` § Sentence bar.
