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

## Open blockers

| # | Blocker | Notes |
| --- | --- | --- |
| 1 | **No deploy** — the app only exists on localhost; nothing is published to a URL a tester can open | `wrangler.jsonc` bindings exist (DO/R2/AE) but `wrangler deploy` has never run; needs account/domain decisions — **stop/ask: publishing** |
| 2 | **First-run path unverified** — setup → board has never been walked end-to-end in a clean browser/profile | needs a manual pass on a live server once dev infra is healthy |
| 3 | **Dev-server hygiene** — multiple hung workerd processes squatted agent slots; slot-0 (8787, founder's copy) was hung and untouched | stale processes gave false "listening" signals |
| 4 | **Persistence unverified end-to-end** — IndexedDB save/restore across reload is coded but not browser-proven | part of the blocker-2 pass |

## Landed slices

- **Symbols shipped (2026-09-24):** `build_catalog.mjs` turns canonical
  `assets/symbols/<word>.<ext>` files into approved image rows (matching on
  spoken text, `_`→` `, `_rollN` excluded, png > svg > jpg) and copies bytes
  to `public/symbols/`. Sources committed so `catalog:build --check`
  reproduces on a clean checkout. `symbol_art.test.mjs` proves rows → files →
  `SENSE_ART_SQL` → home-board coverage.
