# 037 — Shipped payload diet (ship the tile, not the master)

**Status:** EXECUTED 2026-10-02 in four commits (`e1ab297` transcode,
`d68f053` byte gate, `4c50b83` review page, `805abbc` `_headers`) —
founder gates below are open before deploy.
Sequenced **ahead of 036** (founder 2026-10-02): fix what we ship before
teaching the app to cache it. Both open decisions are closed in § 7.

**Landed:** emit/check half extracted to `scripts/catalog/symbol_emit.mjs`;
`catalog:build` emits 688 WebP + 21 SVGs (709 files, ~7.7 MB shipped,
largest 43 KB);
stamp file + orphan scan in `catalog:build:check`; byte gate in
`check:fast` (`scripts/check_symbol_bytes.mjs`); `public/_headers` +
`run_worker_first` removed (asset requests bypass the Worker, verified
locally); question glyph → `icons/question-mark.svg`; review page
`public/preview-symbol-diet.html` (34 rows).
**Done 2026-10-03:** serving check (§ 5.4) on a disposable preview
worker (`pippaac-prev037.emailmike.workers.dev`, since deleted):
index + assets carry COOP/COEP/CORP from `_headers`; `wrangler tail`
showed zero Worker invocations for `/`, `/index.html`, `/board.js`,
`/symbols/*.webp` — only `/form_table.en.json` (decoded JSON) and
`/health` invoked; `.png` symbol paths 404; the 036 offline probe
(`PIP_ORIGIN=<preview> scripts/probes/offline_probe.mjs`) passed —
3,522-file precache, board + art + tables + audio all local.
**Founder-gated, not yet done:** tile-size art review
(`http://localhost:21087/?reseed` + the preview page), the iPadOS 14+
device floor, `npx wrangler deploy`, then `npm run pictures:index` +
`pictures:index:calib` (paid Workers AI run, needs explicit yes),
then the find/suggest thumbnail check.
**Related:** `docs/operations/art-generator/SKILL.md` (pipeline owner —
"Shipping is the catalog build"), 036 (service worker; § 3C full precache —
decided and built), `docs/operations/TechStack.md`
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
| All **707** shippable raster masters (excl. 29 `_roll` alternates) → ≤512px WebP q82, measured 2026-10-02 | **7.9 MB total**, largest file 43 KB |

A cold board paint today pulls tens of MB to draw small tiles. The repo
carries ~1.2 GB of PNG between the two trees; every deploy ships it as
the assets payload. And with `run_worker_first`, each of the 3,549
static files under `public/` is a billed Worker invocation just to stamp headers
(§ 4).

Nobody chose 1 MB symbols — the pipeline lacks a transcode step. This
phase adds it.

## 2. Work order A — transcode in `catalog:build`

- `assets/symbols/` keeps the masters (source of truth — print, future
  sizes, re-rolls).
- `build_catalog.mjs` emits `public/symbols/<word>.webp` — **WebP q82,
  long edge ≤ 512 px, aspect preserved, never enlarged** (`sharp`
  `resize(512, 512, { fit: "inside", withoutEnlargement: true })`; 11%
  of masters (81 of 707) aren't square — 1920×1280, 664×833, 1404×1004,
  down to 580×1411 — so a fixed
  512×512 would distort or pad them). Alpha is kept (about a third of masters have
  it). 512 covers a 140 CSS px tile at 3× with headroom.
- **All raster masters transcode, including `.jpg`** (`run.jpg` ships
  today because it has no PNG sibling). `.svg` ships byte-for-byte.
  Extension preference (`SYMBOL_EXT_PREF`) still picks the master;
  the shipped extension follows the output (`.webp` or `.svg`).
- `image.key` in `catalog.json` becomes `symbols/<word>.webp`. Consumers
  of the suffix, audited 2026-10-02 — all must be updated in the flip:
  - `scripts/pictures/build_index.mjs` sets `asset: /${img.key}` into
    the **remote Vectorize index metadata**. After the flip every
    existing vector points at a `.png` that no longer exists → run
    `npm run pictures:index` (and `:calib`) right after deploy.
    Embeds ~700 captions via Workers AI (tiny, but a paid run — needs
    the founder's explicit yes per `Confirm before paid API runs`).
    Picture suggestions show broken thumbnails in the gap; nothing else
    breaks and there are no users to migrate (2026-10-02).
  - `src/board/symbol_art.test.mjs` asserts `symbols/*.png` paths —
    update to `.webp`.
  - `scripts/art/master_batch45.mjs`, `master_batch51.mjs` copy `.png`
    straight into `public/symbols/`. Collaborator-owned; after the flip
    the orphan gate (below) fails on them. Tell the owner; do not edit
    here. SKILL.md §148 ("copies the bytes") is rewritten to
    "transcodes" in the same commit.
  - A founder profile that already picked a catalog image stores the
    old `.png` key; `?reseed` or re-pick fixes it. No migration.
  Everything else (`artFor`, `metaFor`, word-card, add-flow,
  preview pages) reads `image.key` / `asset` opaquely.
- `image.sha256` keeps hashing the **master** — it's the approval
  identity of the art. If a shipped-bytes hash is ever needed, add a
  second field; don't repurpose the first.
- **Tooling: `sharp`** — see § 7.
- **Writes leave `buildImages`.** Today `buildImages` copies files as a
  side effect of `buildCatalog`, which `--check` also calls — check mode
  currently writes `public/symbols/`. Split: `buildImages` returns rows
  only; a new `emitSymbols(rows)` runs in non-check mode.
- **Stamp file `data/catalog/symbols_build.json`** (tracked): per shipped
  file `{ masterSha256, params }` where `params` = `"webp-q82-e512"`.
  Emit skips files whose stamp matches (rebuilds stay seconds, not a
  734-image re-encode) and re-encodes when the master or params change.
- `--check` fails when: a referenced symbol's stamp is missing or its
  `masterSha256` ≠ the master's; a shipped file is missing; or
  `public/symbols/` holds any file the catalog doesn't reference
  (orphans, stray `.png`s). It does **not** byte-compare encoder output —
  libwebp bytes can differ across sharp builds, and a gate that fails on
  encoder drift teaches people to ignore it.

### A — art review before the flip

512px is a *shipped-pixel* decision, not an art decision — but verify,
don't assume:

- A generated side-by-side page `public/preview-symbol-diet.html`
  (script: `scripts/catalog/symbol_diet_preview.mjs`, repo deliverable)
  shows master vs. shipped WebP at **60 CSS px** and **140 CSS px**,
  each at device-pixel ratio 3, for the fixed set in § 7. Founder and
  agent judge it together (`Judgment calls: review together`).
- Any symbol that fails gets a targeted exception (an `overrides` map of
  `{ word: edgePx }` in the build script, stamped as
  `webp-q82-e<px>`), not a global resolution bump.

### A — cleanup after the flip

- `git rm` the shipped `public/symbols/*.png` and `*.jpg` (the `.webp`s
  replace them; masters stay). Repo's tracked `public/` drops ~599 MB;
  history keeps it, so clone size doesn't shrink — only deploy payload
  and working tree do.
- Old PNGs linger harmlessly in device HTTP caches — no migration.

## 3. Work order B — serving headers without `run_worker_first`

`wrangler.jsonc` sets `run_worker_first: true` so `src/worker/index.js`
can stamp COOP/COEP/CORP on every response — needed for
`crossOriginIsolated` (SQLite/OPFS). Side effect: **every** request,
including each symbol/audio/css fetch, invokes the Worker — a billable
request (100k/day on the free plan; 10M/mo included on paid) plus added
latency. Static asset requests with no Worker in front are free.

- `public/_headers` (Workers static assets support it) carries the same
  three headers for `/*` (`Cross-Origin-Opener-Policy: same-origin`,
  `Cross-Origin-Embedder-Policy: require-corp`,
  `Cross-Origin-Resource-Policy: same-origin`); then `run_worker_first`
  is dropped from `wrangler.jsonc`. `_headers` itself is not served.
- The Worker's end-of-chain stamp (`src/worker/index.js`, `ASSETS.fetch`
  fallback) **stays** — it still covers 404s and Worker-routed
  responses; `Headers.set` is idempotent, so overlap is harmless.
- Asset hits then bypass the Worker entirely: uncounted, faster.
- `/api/*`, `/form_table.en.json`, relay, admin paths have no backing
  file → they still reach the Worker. Verify each in preview before
  deploy — especially `/form_table.en.json` (the Worker serves the `.gz`
  with `encodeBody: manual`; the path itself must still fall through).
- `index.html` navigation and asset headers are identical today (one
  uniform stamp), so `/*` in `_headers` is behavior-preserving.
- Any path that has both a file under `public/` and a Worker route would
  silently stop reaching the Worker. Audited 2026-10-02: Worker routes
  are `/health`, `/form_table.en.json`, `/api/*`, `/admin/*`,
  `/research`, `/users`, `/restore`, `/pair`, `/accounts/*` — none has a
  matching file (`/form_table.en.json.gz` exists; the unsuffixed path
  does not). Re-run this audit if a file is ever added under those
  names.

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

1. **Byte gate (deterministic):** total `public/symbols` ≤ 16 MB
   (2× the 7.9 MB measured); every shipped raster ≤ 96 KB (2× the
   largest, 43 KB); `catalog:build:check` passes. The first two live in
   `scripts/check_symbol_bytes.mjs`, wired into `npm run check:fast` —
   it `stat`s the shipped files, so it measures bytes, not the build's
   report of bytes.
2. **Render gate (owner-visible):** open
   `http://localhost:21087/?reseed` for the real board at `grid15` and
   `grid90`, plus `public/preview-symbol-diet.html` for the § 7 set.
   Ship-pixel fidelity is the bar, not master fidelity.
3. **Perf delta:** cold-load network bytes for a full board paint,
   before/after (DevTools Network total, cache disabled). Expect tens of
   MB → ≤ ~1 MB for the tiles painted (≈ 20 KB × tiles on screen).
4. **Serving gate (B only):** preview deploy — confirm `index.html`
   still arrives `crossOriginIsolated` (OPFS works, board boots), an
   asset response shows the headers with no Worker invocation, and
   `/form_table.en.json` still decodes.
5. **Picture finder:** after `npm run pictures:index`, a find/suggest
   returns thumbnails that load (no 404 on `/symbols/*.webp`).
6. After this lands: 036's manifest adds `/symbols/*` to the precache —
   the promise becomes "every word and its picture, offline, first
   visit" instead of "art you've seen before."

## 6. Honest limits / open questions

- WebP is Safari 14+ / iOS 14+; lossy+alpha likewise. Confirm the
  oldest iPad in use is on iPadOS 14+ before merge (iPad Air 2 and later
  reach iPadOS 15; iPad mini 2/3 and Air 1 stop at 12 and would show
  blank tiles).
- A bad transcode looks *fine* at review size if nobody renders at tile
  size — § 2A exists because the judge looks at masters.
- Ship `_headers` and the `run_worker_first` removal in the same deploy;
  with only one of them, either assets lose COOP/COEP (OPFS dies) or
  the Worker bill doesn't move.
- Request-count savings (B) depend on which Cloudflare plan this
  project is on — check the dashboard before and after; don't assume.

## 7. Decisions (closed 2026-10-02)

**1 — Transcode tool: `sharp`.** `sharp` 0.35.4 is already a pinned
devDependency and installed; `cwebp` is a Homebrew binary that CI and a
second contributor won't have. `sharp` is one `npm ci`, scriptable per
file, handles alpha/aspect, and the stamp-file gate (§ 2) removes the
only argument for the binary (byte-exact output). Measured on all 707
shippable masters with `sharp` 0.35.4: 7.9 MB total.

**2 — Art spot-check set: a fixed, rule-based list, not a judgment
call.** The fidelity risk is detail and thin text-like strokes, so the
set is picked by rule and rendered in `preview-symbol-diet.html`:

1. The 12 largest shipped WebPs by bytes (a proxy for detail) — today
   `mall, emergency, fries, snow, goldfish_crackers, doll, corn,
   cantaloupe, fan, board_game, special, park`.
2. The 10 most extreme aspect ratios among the 81 non-square masters
   (today `ketchup` 580×1411, `milkshake`, `crawl` 2240×1120,
   `together`, `pee`, `those`, `just`, …) — the aspect-handling path —
   plus the numeral words `one`…`ten` (664×833 glyph art, thin strokes).
3. `in.jpg` and `run.jpg` — the JPG→WebP path (the only lossy→lossy
   conversions; `in` also has a PNG, which wins the extension
   preference, so `run` is the one that ships).
4. Every master whose filename or art-generator mode is a brand/packshot
   (`cpg_brand`, `category_packshot`) — today there are none in
   `assets/symbols/` (they live in extended art, not the shipped set),
   so this rule is a standing guard that activates the first time one is
   approved. `goldfish_crackers` is the nearest current case and is in
   rule 1.
5. The past-tense `◀◀` badge is drawn by the board UI over the tile, not
   baked into symbol art — checked on the real board at `grid15`/`grid90`
   (Works Test 2), not in the symbol set.

The page shows each at 60 and 140 CSS px @3×, master beside WebP. A
failure gets a per-file edge override (§ 2A), never a global bump.
