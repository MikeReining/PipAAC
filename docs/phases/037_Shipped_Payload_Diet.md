# 037 — Shipped payload diet (ship the tile, not the master)

**Status:** PROPOSED 2026-10-02 — plan only, nothing built. Sequenced
**ahead of 036** (founder 2026-10-02): fix what we ship before teaching
the app to cache it.
**Related:** `docs/operations/art-generator/SKILL.md` (pipeline owner —
"Shipping is the catalog build"), 036 (service worker; § 3C resolves to
full precache once this lands), `docs/operations/TechStack.md`
(deploy/serving notes).
**Truth owner:** measured bytes at the network layer and rendered tiles
on a real device. Lie-prone layer: the art judge — it approves masters,
not shipped files; a WebP regression passes review unless someone looks
at the shipped bytes rendered at tile size.

## 1. The problem

`scripts/catalog/build_catalog.mjs` copies `assets/symbols/` masters into
`public/symbols/` **byte-for-byte** (`copyFileSync`). Masters are
1600–1920px PNGs; tiles render at 48–140 CSS px (≈400 device px at 3×).
Result, measured 2026-10-02:

| Fact | Number |
| --- | --- |
| `public/symbols/` shipped | ~599 MB, 725 files (702 PNG, 22 SVG, 1 JPG) |
| `assets/symbols/` masters in git | ~610 MB, 757 files |
| Typical master | 1–2.5 MB each |
| `carrot.png` 1600px → 512px WebP q82 | 2.1 MB → **12.8 KB** (~160×) |
| `popcorn.png` 1600px → 512px WebP q82 | 2.3 MB → **20 KB** (~115×) |
| Projected shipped set at 512px WebP | **~15–25 MB** |

A cold board paint today pulls tens of MB to draw small tiles. The repo
carries ~1.2 GB of PNG between the two trees; every deploy ships it as
the assets payload. And with `run_worker_first`, each of the ~3,300
static files is a billed Worker invocation just to stamp headers
(§ 4).

Nobody chose 1 MB symbols — the pipeline lacks a transcode step. This
phase adds it.

## 2. Work order A — transcode in `catalog:build`

- `assets/symbols/` keeps the masters (source of truth — print, future
  sizes, re-rolls).
- `build_catalog.mjs` emits `public/symbols/<word>.webp` — **512×512
  WebP, q82** (512 covers 140 CSS px at 3× with headroom; measured
  ~13–20 KB/file).
- `image.key` in `catalog.json` becomes `symbols/<word>.webp`. Audit
  every `image.key` / `art` consumer for `.png` suffix assumptions
  (`metaFor`, `artInto`, meta-cache, review pages, preview pages) before
  shipping.
- SVGs and the one JPG: ship as-is (SVG is already vector; review the
  JPG when it's identified).
- `image.sha256` keeps hashing the **master** — it's the approval
  identity of the art. If a shipped-bytes hash is ever needed, add a
  second field; don't repurpose the first.
- Tooling decision at build time: `cwebp` is not a guaranteed host dep —
  use `sharp` (npm devDependency) or vendor a documented binary. Pick
  one; record it here.
- `--check` gate (existing `catalog:build:check` pattern) fails when
  shipped files don't match what the masters would produce — a stale
  `public/symbols/` becomes a CI failure, not a quiet drift.

### A — art review before the flip

512px is a *shipped-pixel* decision, not an art decision — but verify,
don't assume:

- Render pass on the preview pages at `grid15` (largest tile) and
  `grid90` (smallest): spot-check dense scenes, the past-tense `◀◀`
  badge, `category_packshot` pack labels, `cpg_brand` logos.
- Any symbol that fails gets a targeted exception (e.g. 768px for that
  file), not a global resolution bump.

### A — cleanup after the flip

- `git rm` the shipped `.png`s (the `.webp`s replace them; masters stay).
  Repo drops ~599 MB of tracked bytes.
- Old PNGs linger harmlessly in device HTTP caches — no migration.

## 3. Work order B — serving headers without `run_worker_first`

`wrangler.jsonc` sets `run_worker_first: true` so `src/worker/index.js`
can stamp COOP/COEP/CORP on every response — needed for
`crossOriginIsolated` (SQLite/OPFS). Side effect: **every** request,
including each symbol/audio/css fetch, invokes the Worker — a billable
request (100k/day free plan; 10M/mo on paid) plus added latency.

- `public/_headers` (Workers static assets support it) carries the same
  headers for `/*`; then `run_worker_first` is dropped.
- Asset hits then bypass the Worker entirely: uncounted, faster.
- `/api/*`, `/form_table.en.json`, relay, admin paths have no backing
  file → they still reach the Worker. Verify each in preview before
  deploy — especially `/form_table.en.json` (the Worker serves the `.gz`
  with `encodeBody: manual`; the path itself must still fall through).
- Decide whether `index.html` navigation headers differ from asset
  headers today — they don't (same stamp applied uniformly), so `/*` in
  `_headers` is behavior-preserving.

## 4. Explicitly out of scope

- Re-rolling or re-generating any art — this changes encoding and size
  only, never content.
- Masters' storage location (in-repo vs. elsewhere) — the repo weight is
  fixed by removing `public/symbols/*.png`; `assets/` policy is a
  separate conversation.
- `/audio/*` clips (~16 KB avg) — already reasonable.
- Image *content* diet (fewer symbols) — vocabulary decisions belong to
  010, not a byte-budget phase.

## 5. Works Test

1. **Byte gate (deterministic):** `du -sh public/symbols` ≤ 30 MB;
   every shipped `.webp` ≤ 96 KB; `catalog:build:check` passes.
   Script the first two into `npm run check` — measured bytes, not a
   report of bytes.
2. **Render gate (owner-visible):** preview page at `grid15` and
   `grid90` — spot-check the categories in § 2A's list. Compare against
   masters side-by-side at tile size; ship-pixel fidelity is the bar,
   not master fidelity.
3. **Perf delta:** cold-load network bytes for a full board paint,
   before/after (DevTools Network total). Expect tens of MB → ~1–2 MB.
4. **Serving gate (B only):** preview deploy — confirm `index.html`
   still arrives `crossOriginIsolated` (OPFS works, board boots), an
   asset response shows the headers with no Worker invocation, and
   `/form_table.en.json` still decodes.
5. After this lands: 036's manifest adds `/symbols/*` to the precache —
   the promise becomes "every word and its picture, offline, first
   visit" instead of "art you've seen before."

## 6. Honest limits / open questions

- WebP is iOS 14+ / universal in modern browsers — safe for the app's
  stated floor; confirm the oldest family iPad on record before merge.
- A bad transcode looks *fine* at review size if nobody renders at tile
  size — § 2A exists because the judge looks at masters.
- `_headers` and Worker-stamped headers must not double-apply during the
  transition: ship `_headers` and the `run_worker_first` removal in the
  same deploy.
- Request-count savings (B) depend on which Cloudflare plan this
  project is on — check the dashboard before and after; don't assume.
