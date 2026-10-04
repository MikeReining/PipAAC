# 041 — First load is the product (speed audit + plan)

**Status:** AUDIT COMPLETE 2026-10-03 — findings verified against code
and live headers on `app.pipaac.org`. Awaiting founder review and
sequencing. Nothing is built.

**Founder rulings (2026-10-03):**
1. **"Talks without Wi-Fi" means the voice that is active.** One voice's
   clips, not the whole library. Switching voices may require Wi-Fi —
   and the picker should not pretend otherwise when offline (honest
   affordance, same as the greyed transform buttons).
2. **Precaching every voice is rejected.** Eight voices × ~1,000 clips
   each does not scale; it is already 114 MB at six voices.
3. **First load of the main board must be fast.** That is the first
   impression of the product. Anything the first interactive frame does
   not need loads asynchronously after it — never inside it.

**Related:** `036_Offline_Support.md` (the precache this trims),
`037_Shipped_Payload_Diet.md` (the WebP switch — confirmed *not* the
regression), `028_Tile_Voice_Library.md` (the clip set being
over-precached), `docs/operations/Testing.md` (proof rules).

---

## 0 — The one-paragraph answer to "why is it slow now"

The images got faster — 600 MB of PNG masters became 8.8 MB of WebP.
What got slower is everything around them. The service worker now
downloads **124 MB across 6,792 files** at install — nearly double the
70 MB it was designed and measured at, because three voices shipped
their full libraries the same day — and it does this in 48-parallel
fetch bursts while the first board is trying to render. Worse, the
precache key is a hash of the manifest: **every catalog, audio, or art
change re-downloads all 124 MB on the device's next visit.** Underneath
that, the board's boot path was already heavy: ~61 MB of JSON parsed
and ~20,000 database inserts before the first tile can paint, and
every asset is served `must-revalidate`, so any load the service
worker isn't yet controlling costs ~140 network round-trips.

## 1 — Audit findings (each verified, file:line cited)

### 1.1 The critical path today (name added → board visible)

`switchTo` (`public/board/people-ui.js:76-81`) does `location.reload()`.
The whole boot re-runs. In order, before the first tile paints:

1. `index.html` + **18 render-blocking stylesheets**.
2. `/board.js` evaluates **~117 unminified ES modules** eagerly —
   every Settings page, the editor, progress charts, coach, recovery —
   most of which paint nothing until opened.
3. `bootDb` (`public/db.js:48-59`) top-level-awaits, in one `Promise.all`:
   - SQLite WASM init (`vendor/sqlite-wasm/sqlite3.wasm`, 869 KB)
   - `catalog.json` — **3.75 MB**
   - `phrase_table.en.json` — **12.3 MB** (90,235 contexts)
   - `form_table.en.json` — **~45 MB decoded** (served gzipped, 5.5 MB
     on the wire, `cache-control: no-store`)
   - the user's saved DB bytes from IndexedDB
4. `importCatalog` + `installSeedGroups` run on the main thread
   (§ 1.3 — ~20k statements, every boot, new or old user).
5. `renderGrid` builds ~60 cells; each tile's `<img src="/symbols/x.webp">`
   is only *discovered* here — the image requests start at the end of a
   multi-second serial chain (`public/board/grid.js:55-81`).

Then, on `load`, the service worker registers and begins the install
storm (§ 1.2) — overlapping whatever tile images are still arriving.

### 1.2 The service worker precache (the regression)

`public/sw.js`, `scripts/sw/sw_manifest.mjs`:

- **124 MB / 6,792 files** precached at install. Breakdown: `/audio`
  5,882 files / ~114 MB; `/symbols` 709 / 8.8 MB; the rest ~1.5 MB of
  shell. Design measured 70 MB / 3,522 files (036 banner) — audio alone
  nearly tripled when Sam, Zoe, and Tom shipped their full libraries
  the same day (2026-10-03).
- **Every voice is precached.** ~1,283 word folders × ~4–5 clips each.
  A device only ever plays one voice's set; the other five voices are
  ~95 MB of bytes the child will never hear.
- **Install storms the network:** 48 parallel fetches per chunk
  (`sw.js:23,46-48`), each `cache.put` writing to disk. On a first
  visit the page is *not yet controlled* — its tile images compete
  with the storm for bandwidth and the device CPU/disk.
- **The whole thing re-downloads on any content change.** `SW_BUILD`
  is a manifest hash (`sw_manifest.mjs`); one new clip or symbol bumps
  it and the next visit re-precaches all 124 MB. Frequent deploys mean
  frequent storms.
- **One bad fetch aborts the entire install** (`sw.js:31` throws on any
  non-OK) → the next visit retries all 124 MB. Flaky Wi-Fi can loop
  forever.
- **Update path does protect open tabs** — the old SW keeps serving its
  cache while the new one installs (`bc42a58d`), so repeat visits are
  not broken, just competing.

### 1.3 "The 19,000 prepared statements," in plain English

`public/shared/import.mjs` — `importCatalog(db, catalog)` runs on
**every boot, for every user**. It walks the shipped catalog and runs
one INSERT (or INSERT … ON CONFLICT UPDATE) per row — senses, labels,
utterances, images, all 6,522 clips, board cells, group seeds:

| Table rows written | Count |
| --- | --- |
| senses / images / default-art updates | ~2,100 |
| utterances / labels | ~2,200 |
| clips | 6,522 |
| core cells / layouts / group meta | ~220 |
| group seed cells + labels | ~3,370 |
| seed-group install (new users) — groups, members, cells | ~4,200 |
| **Total per boot** | **~18–20k individual statements** |

Why it exists: the import doubles as the *reconcile* — a device whose
saved DB was written against an older catalog converges on re-run
(missing rows inserted, renamed keys upserted). That job is real. The
lie is that it runs unconditionally: when the catalog hasn't changed —
which is almost every boot — ~20k statements execute to produce zero
deltas. On a low-end classroom tablet this is a large share of the
main-thread boot cost, and it scales with catalog size forever.

First-principles fix: ask "did the catalog change?" first — one stored
fingerprint vs. one read — and skip the reconcile when it didn't. The
full seed still runs once per new user, because that work is real.

### 1.4 No HTTP caching anywhere

Live headers on `app.pipaac.org`: **every** asset is
`cache-control: public, max-age=0, must-revalidate` — Worker-stamped
COOP/COEP/CORP only (`src/worker/index.js:565-570`, `public/_headers`).
Any load the SW isn't controlling costs a conditional GET per file —
~140 round-trips before paint. `/api/v1/pictures/img/*` is the only
route with a real cache header (`pictures.js:79`).

`form_table.en.json` is additionally `no-store`
(`src/worker/index.js:65`) — a deliberate guard against an edge cache
that ignores `vary: accept-encoding`, but it means every uncontrolled
load re-downloads 5.5 MB.

### 1.5 Smaller items

- Tile `<img>`s get no `decoding="async"` — decode contends with the
  boot thread (`grid.js:75-79`).
- `speech.js:114-127` fires a tile-voice prefetch + ledger sweep on
  `requestIdleCallback` — correctly backgrounded, no action.
- `catalog.json` is re-parsed every boot even though the reconcile is
  its only consumer on repeat boots (with § 1.3 gated, the runtime only
  needs `catalog.layouts`, `groups`, `families` — the small parts).

---

## 2 — The work list

Ordered: A fixes the regression and the scalability lie; B makes first
paint fast; C cleans the network layer; D proves it. Each slice names
its proof.

### Slice A — Precache only the promise

**A1. Active-voice audio only.** `sw_manifest.mjs` filters
`catalog.clips` to the *default* voice's set (~1,000 clips, ~19–20 MB
instead of 5,882 / ~114 MB). Precache drops to roughly **~30 MB**.
Non-default voices live in a per-voice runtime cache
(`pip-voice-<id>`, same pattern as `pip-img-v1`): filled lazily on
play, bulk-filled in the background when a family picks that voice.

**A2. Voice switch is online-only and downloads itself.** The voice
picker disables offline with honest copy ("needs Wi-Fi to change
voices"). On switch (online), the new voice's clip set downloads in
the background into its cache — the child's words keep speaking from
the old set until coverage lands. A voice *row* in the UI can show
download state.

**A3. Split the caches so deploys stop re-downloading audio.**
`pip-audio-<voice>` keyed by that voice's clip-manifest hash; it
survives `pip-shell-<build>` rebuilds. A code-only or symbol-only
deploy then re-precaches ~10 MB, not 124 MB.

**A4. Install must not be all-or-nothing.** Shell files, catalog data,
and symbols are required — fail loudly. Audio entries are
best-effort: a clip that fails to cache just means that word mints or
silences once; log and continue. Order the manifest shell → data →
symbols → audio so the board is self-contained earliest.

*Proof:* regenerated manifest shows ≤ ~1,100 audio files, ~30 MB
total; offline probe still passes on a fresh origin; a symbol-only
manifest bump does not touch `pip-audio-*` (assert via cache keys).

### Slice B — First frame first

**B1. Grammar tables load after first paint.** `bootDb` splits:
`bootCore` = wasm + catalog + saved bytes (+ first-boot seed), then
`loadGrammar` fetches `phrase_table` + `form_table` post-render. The
strip paints its base cards and re-ranks when `phrases` lands;
transform buttons render their honest "needs the network/not ready"
state until `formTable` lands — the affordance already exists
(`syncTxButtons`, `board.js:301-314`). ~57 MB of parse leaves the
critical path.

**B2. Version-gate the reconcile.** Store the catalog fingerprint
(`schemaVersion` + a content hash the build already computes) in a
`catalog_meta` row; `importCatalog` short-circuits when it matches.
Every subsequent boot skips ~16k statements; a real catalog change
still converges. New-user seeds are unaffected — that's real work.

**B3. (Deeper, optional) Ship a pre-seeded DB.** The catalog build
already produces `catalog.json`; it could also emit a post-import
SQLite snapshot. New-user boot = `sqlite3_deserialize` of shipped
bytes → zero seed statements, and even the first-ever boot skips
§ 1.3 entirely. Requires a build artifact + drift gate; do only if B2
leaves first-boot still visibly slow.

**B4. Lazy-mount what doesn't paint the board.** Editor, Settings
panes, progress charts, coach, recovery, devices — `import()` on
first open. `board.js`'s static import list (~90 imports) shrinks to
the board, strip, groups, and speech. Cheap version first: measure
parse/eval cost on a tablet before deciding how far to split.

**B5. `decoding="async"` on tile images** (`grid.js` `wordTile`).

*Proof:* the probe in Slice D reports time-to-first-tile and counts
requests issued before first paint; both drop measurably per slice.

### Slice C — Network hygiene

**C1. Cache-Control on stable dirs.** `/symbols`, `/audio`, `/icons`,
`/fonts` → `public, max-age=3600` (or `stale-while-revalidate`). These
change only on deploy, and the SW owns the controlled path anyway —
this closes the uncontrolled window (first visit, SW updating) that
today costs ~140 conditional round-trips. Worker stamps it where it
stamps the isolation headers (`index.js:565-570`).

**C2. `form_table` delivery.** `no-store` is honest for direct fetches
(edge ignores `vary`), but with B1 it's fetched once, post-render, and
the SW already caches it. Keep `no-store` and let the SW be the cache —
*or* shard the table if its parse still shows. Decision at build time.

**C3. (Deferred decision) A bundler.** ~117 unminified modules help no
one pre-SW. esbuild is the boring choice; nothing in the repo bundles
today (devDeps: `sharp`, `wrangler` only). Decide after B4's numbers —
if module eval is a few hundred ms of the boot, it's worth it.

### Slice D — Measure the actual thing

Per the project law: a stopwatch on the founder's iPad is the verdict,
but the wall needs a repeatable instrument first.

**D1.** Extend `scripts/probes/` with a boot-timing probe: cold profile
→ time to first painted tile, time to interactive, request count and
bytes before first paint. Assert budgets in `check:fast` so a
regression can't slip back in silently.

**D2.** Real-device Works Test: cold launch on the iPad → board
usable; repeat launch → visibly instant; add a name → board; switch
voice offline → honest refusal; switch voice online → background
download, words keep speaking.

Suggested budgets (tune on first measurement — don't guess): first
tile under 2 s on the iPad over Wi-Fi; ≤ 15 requests before first
paint; boot blocking JSON ≤ catalog + wasm.

---

## 3 — Explicitly not in this phase

- Changing tile art again — 037 is done and correct; WebP stays.
- The `?reseed` founder-review reload — a dev affordance, not the user
  path (it deliberately re-runs the reconcile).
- Service worker update UX — the no-reload, activate-on-next-nav path
  stays; this phase only shrinks and splits what install downloads.
- Dropping the offline promise — it narrows to the *active* voice, per
  founder ruling; it does not disappear.

## 4 — Decisions log

| Date | Ruling |
| --- | --- |
| 2026-10-03 | Founder: active-voice-only audio offline; voice switching may require Wi-Fi; all-voice precache rejected as unscalable; first board load is the product's first impression and outranks background work. |
