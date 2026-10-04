# 041 — First load is the product (speed plan)

**Status:** DONE 2026-10-04. All slices landed and deployed; every § 1
budget verified by the probe (which stays in `npm run check` as the
permanent gate). Founder verdict on real iPad: "loaded fine, loaded
fast." Post-phase addition: navigation fallback + resilient install
(`8c0fd07b`) for the dead home-screen launch. This file retires — git
history is the archive; the budgets live on in
`scripts/probes/speed_budgets.json`.

**Owner of the truth:** the boot path in `public/board.js` →
`public/db.js` (`bootDb`) and the service worker `public/sw.js` +
`scripts/sw/sw_manifest.mjs`. **Lie-prone layer:** the boot watchdog in
`index.html` (it reported a healthy slow boot as a failure, then was
widened to 45 s to stop the false alarm — which also hides a slow boot).
**Missing proof:** there is no timed boot test. Slice D adds one, and it
gates the wall.

## 0 — Founder rulings

1. **The first board appears way under 8 seconds — target 2.** A new
   family on fast internet sees their board, its pictures, and the
   welcome guide almost at once. Anything the first frame doesn't need
   downloads in the background, after it, and never delays it.
2. **"Talks without Wi-Fi" means the voice that is active.** One
   voice's clips, not the whole library. Switching voices may need
   Wi-Fi, and the picker says so honestly when offline.
3. **Precaching every voice is rejected.** It does not scale (eight
   voices × ~1,000 clips); it is already 108 MB.
4. **The welcome guide is for a new family, not a new person.** Adding
   a second person on a device opens their board directly — the adult
   already knows the app. (2026-10-03)
5. **A second person loads fast too.** Adding a person is a first
   impression of its own; it gets the same budget.

**Related:** `036_Offline_Support.md` (the precache this trims),
`037_Shipped_Payload_Diet.md` (WebP — not the regression),
`028_Tile_Voice_Library.md` (the clips being over-precached),
`docs/operations/Testing.md` (proof rules).

## 1 — Budgets (the definition of done)

Measured by the Slice D probe: headless Chrome, a fresh profile, iPad
landscape metrics, **4× CPU throttle** (stands in for a classroom
iPad), fast Wi-Fi network profile. The founder's iPad stopwatch is the
final verdict.

| Moment | Today (measured) | Budget |
| --- | --- | --- |
| First visit — board + pictures + welcome visible | 13.6 s | **≤ 2.0 s** |
| Repeat launch — board visible | 19.5–21.8 s | **≤ 1.0 s** |
| Add a person — their board visible, no welcome | ~6.5 s+ (see § 2.4) | **≤ 1.5 s** |
| Tap a word → it speaks, on any of the above | after the board | **≤ 0.3 s** after it appears |
| Grammar help + suggestions ready | with the board | ≤ 5 s after the board, without blocking it |
| Requests before first paint (first visit) | 142 | ≤ 40 |

"Today" figures were measured 2026-10-03 on an M-series Mac against a
local copy (`wrangler dev`, no network latency, no CPU throttle) — so
they are the *best case*. A classroom iPad over real Wi-Fi is slower.

## 2 — What is slow and why (measured)

Method: fresh browser origins on the local copy, timings read from
`performance` resource entries and polling for the first `#grid .cell`
and `window.pip.db`; piece costs timed directly in the page.

### 2.1 The offline cache answers every file in half a second (repeat launches)

**This is the single biggest problem, and it is one line.** On a repeat
launch the service worker serves every file from its cache with
`cache.match(req, { ignoreSearch: true })` (`public/sw.js:92`).
`ignoreSearch` cannot use Chrome's URL index, so each lookup scans all
**7,879 cached entries**:

| Lookup on the live 7,879-entry cache | Time per file |
| --- | --- |
| `cache.match(url, { ignoreSearch: true })` (today) | **463 ms** |
| `cache.match(url)` (exact) | **0 ms** |

`board.js` alone took 3.3 s to come out of the cache; the 99 modules
arrive in waves ~0.4 s apart and finish at 16 s; the data files don't
even *start* until 14.7–16 s. Repeat launch: **19.5–21.8 s**. The same
repeat launch with no service worker: **5.3–5.8 s**.

The cache is also far too big (§ 2.3), which is why the scan is long.

### 2.2 First visit: the offline download fights the boot

A first visit isn't served by the service worker yet, but it registers
on `load` and immediately downloads the whole precache — **141 MB,
7,879 files**, 48 at a time (`sw.js:23,46-48`), each written to disk —
while the board is booting.

| First visit, fresh origin | Board + welcome visible |
| --- | --- |
| Today | **13.6 s** |
| Same, service worker registration switched off | **6.5 s** |

So ~7 s of the first impression is the offline download competing for
the network, CPU and disk. The other 6.5 s is § 2.3–2.4.

### 2.3 What the first frame waits for that it doesn't need

`bootDb` (`public/db.js`) awaits all of this before the first tile:

| Item | On the wire | Decoded | Device cost (fast Mac) | Needed for the first frame? |
| --- | --- | --- | --- | --- |
| `form_table.en.json` (grammar forms) | 5.5 MB gzip, `no-store` | **45 MB** | **1.0 s** to parse | **No** — used only after a tap |
| `phrase_table.en.json` (suggestions) | 2.0 MB br | 12.3 MB | 0.15 s | **No** — used only after a tap |
| `catalog.json` | 0.47 MB br | 3.8 MB | 0.02 s | Only to seed/reconcile (§ 2.4) |
| `sqlite3.wasm` | 0.41 MB br | 0.87 MB | — | Yes |
| The precache (§ 2.2) | 141 MB | — | ~7 s of contention | **No** |
| The other voices' audio (inside the precache) | ~90 MB | — | — | **No — never, on this device** |

**What the "grammar table" actually is (first principles).** It is a
statistics table from a children's-speech corpus: for each run of up to
five previous words, how often a child said *want* vs *wants* (and
similar). It serves just **91 verbs and 357 nouns**, yet holds
**477,000 phrase contexts (25 MB) and 318,000 "what comes next" rows
(18 MB)**, written as JSON with the same feature names (`"V;PRS;3;SG"`)
repeated ~800,000 times. Two things are wrong with that:

1. It is never needed to draw the board — grammar only acts after a tap.
2. **It ships the evidence instead of the answers.** The counts were
   needed to *decide* which form follows which words; the app only
   needs the decisions. And most decisions are redundant: a long
   context only matters if it picks a *different* form than the
   shorter context the lookup falls back to (`pickForm`,
   `public/shared/forms.mjs:86`).

The suggestions table is the same story: 90,235 contexts with raw
counts plus a 3.4 MB `seen` table, **70% with a single next word** —
when the bar only needs, per phrase, the ordered words that pass its 5%
share rule.

### 2.4 The ~20,000 statements every launch, and every new person

`importCatalog` (`public/shared/import.mjs`) runs on **every boot, for
every person**: one INSERT/UPSERT per catalog row (senses, labels,
6,522 clips, cells, group seeds) — ~18–20k statements. Its job is real
(an older saved DB converges on a newer catalog), but it runs even when
nothing changed, which is almost always.

| Measured on a booted DB (fast Mac) | Time |
| --- | --- |
| `importCatalog` reconcile with nothing to change | **2.4 s** |

A **new person** gets a brand-new, empty database (one per person), so
they pay the full import plus the seed-group install (~4,200 more
statements) — that is most of the 6.5 s first-visit figure, and it is
why adding a second person is slow even on a device that already has
everything cached. A fresh person's finished database is only
**3.6 MB** (441 pages × 8 KB) — small enough to ship ready-made.

### 2.5 Smaller items (verified)

- Every asset is `cache-control: public, max-age=0, must-revalidate`
  (`src/worker/index.js:565-570`); `form_table` is `no-store`
  (`index.js:65`). Uncontrolled loads revalidate every file.
- 18 render-blocking stylesheets; 99 unbundled modules evaluated
  eagerly — Settings, editor, progress, coach, recovery included.
- One failed fetch aborts the whole precache install (`sw.js:31`); the
  next visit retries everything.
- Any content change bumps the build hash and re-downloads the whole
  precache, audio included (`sw_manifest.mjs`).
- Tile `<img>`s have no `decoding="async"` (`public/board/grid.js`).
- Every new person goes through the welcome (`needsSetup: true` in
  `public/board/devices-ui.js:217`), against ruling 4.

## 3 — The work, in order

Each slice is small enough to ship alone, ends with its proof, and is
deployed. Re-run the Slice D probe after each and record the numbers in
§ 5.

### Slice 0 — Exact cache lookups (do first; hours)

- `public/sw.js` `shellFirst`: look up by the URL without its query —
  `cache.match(url.origin + url.pathname)` (or a `Request` built from
  it) — instead of `{ ignoreSearch: true }`. Same answer, indexed.
- Audit every other `match(` in `sw.js` for `ignoreSearch` / `ignoreVary`.

*Proof:* a test asserts `sw.js` contains no `ignoreSearch`; the probe
shows a repeat launch at or under the no-service-worker figure
(~5.5 s best case today) before any other slice lands.

### Slice A — Precache only the promise, and only after the board

**A1. Register the service worker after the board is up.** Move the
`register("/sw.js")` from `load` to after the first board frame is
interactive (a `pip:board-ready` event fired by `board.js`, then
`requestIdleCallback`). Drop install concurrency from 48 to 6.

**A2. Active-voice audio only.** `sw_manifest.mjs` emits the shell
manifest *without* audio. Each voice's clips live in their own cache,
`pip-audio-<voice_key>`, keyed by that voice's clip-list hash, filled in
the background for the voice the open person uses. Precache drops from
141 MB to ~10 MB (shell + symbols); the active voice adds ~18 MB in the
background.

**A3. Switching voice.** Online: the new voice downloads in the
background into its own cache; words keep speaking in the old voice
until each clip lands. Offline: the picker greys the other voices with
the honest line "Changing voices needs Wi-Fi."

**A4. Deploys stop re-downloading audio.** A code or picture change
rebuilds `pip-shell-<build>` only; `pip-audio-*` caches survive unless
that voice's clip list changed.

**A5. Install isn't all-or-nothing.** Shell, data and symbols are
required; an audio clip that fails is logged and skipped (that word
mints or stays silent once). Order: shell → data → symbols.

*Proof:* the regenerated manifest has 0 audio entries and ≤ ~12 MB; a
test asserts a symbol-only manifest change leaves `pip-audio-*` keys
untouched; `scripts/probes/offline_probe.mjs` still passes (the active
voice plays offline after its background fill); first visit in the
probe shows **no precache request before the board is visible**.

### Slice B — The first frame needs only the board

**B1. Ship a ready-made database.** The catalog build
(`scripts/catalog/build_catalog.mjs`) also emits
`public/fresh_db.sqlite` — the exact database a new person gets after
import + seed today (3.6 MB raw, ~1 MB compressed). A new person's boot
is `sqlite3_deserialize` of those bytes: zero import or seed statements.
This one change serves the first visit *and* adding a person.
A drift gate in `check:fast` rebuilds it and fails if it differs from
the committed file (same pattern as `sw:manifest`).

**B2. Skip the reconcile when nothing changed.** Store the catalog
fingerprint (the hash the build already computes) in a one-row
`catalog_meta` table; `importCatalog` returns at once when it matches.
A real catalog change still converges, once.

**B3. Grammar and suggestions load after the board.** `bootDb` splits
into `bootCore` (wasm + saved bytes or `fresh_db.sqlite`) and
`loadLanguage` (form + phrase tables), started after the board paints.
Until they land, a tap speaks the base word and the suggestion strip
shows its base cards; both quietly upgrade when the tables arrive.
The ✨/❓ honest-disabled state already exists (`syncTxButtons`,
`board.js:301-314`).

**B4. Ship answers, not the corpus (founder, 2026-10-03).** The corpus
counts are build-time *evidence*; the app only needs the *answers* they
produce. We skipped the step that turns one into the other. Add it:

- **Grammar.** A build step runs today's `pickForm` over every context
  the corpus holds and writes a **decision table**: phrase ending +
  word (+ next word, where that rule reads it) → the form to show, kept
  only where the answer differs from what the shorter ending already
  gives. No counts ship. The runtime lookup becomes "longest matching
  ending wins" — a few lines, no arithmetic. The one rule that weighs
  a live input at runtime (sentence-end *my → mine*, which compares
  against the form currently worn, `forms.mjs:114-127`) keeps its own
  small row (`possNext`, 0.3 MB today) or is compiled per worn form.
- **Suggestions.** For each phrase ending, ship the **ordered list of
  sense ids that pass the 5% share rule** (`KIDS_MIN_SHARE`,
  `funnel.mjs`), at most 20 by definition — no counts, no `seen` table
  (3.4 MB today). The bar's rules stay exactly as they are: her own
  rows first, children after, hidden words removed after the ending is
  chosen (`stripRanked`) — which is why the list keeps every passing
  word, not just four.
- **Target:** both tables together **≤ 2 MB decoded** (from 57 MB).
- The raw tables stay in the repo as **build inputs** (`data/`), never
  in `public/`. Regenerating them is a build step with a drift gate.

*Proof (deterministic, not judgment):* a test drives the old code on
the raw tables and the new lookup on the answer tables over **every
context the corpus holds** — each with its words and next words, and
for suggestions each with a set of hidden words — and requires
identical answers. Any difference fails the build.

**B5. The second person skips the welcome.** "Add a person" sets
`needsSetup` only when the device has no other person. Their people and
places step stays on the Overview checklist.

**B6. Lazy-load what doesn't draw the board.** Editor, Settings pages,
progress, coach, recovery, devices — `import()` on first open. Measure
first: do it only if module evaluation is still visible in the probe
after B1–B5.

**B7.** `decoding="async"` on tile images.

*Proof:* the probe meets the § 1 budgets for first visit, repeat launch
and add-a-person; a Works Test adds a second person and asserts no
welcome card.

### Slice C — Network hygiene

**C1.** `public, max-age=3600, stale-while-revalidate=86400` on
`/symbols`, `/icons`, `/fonts`, `/audio` (they change only on deploy;
the service worker still owns the controlled path), stamped where the
Worker stamps the isolation headers (`index.js:565-570`).

**C2.** With B4 the form table is small; serve it like every other
asset (brotli, no `no-store`, no pre-gzipped special case).

**C3.** Bundler: no. Revisit only if the probe shows module loading is
still a visible share of the first visit after Slices 0–B.

### Slice D — Measure the actual thing (lands with Slice 0)

**D1. `scripts/probes/speed_probe.mjs`** — extends
`chrome_boot_probe.mjs` (CDP, headless Chrome): fresh profile, iPad
metrics, `Emulation.setCPUThrottlingRate` 4, a fast-Wi-Fi network
profile. It reports, for **first visit**, **repeat launch** and **add a
person**: time to first painted tile with pictures, time to welcome
card (first visit) or its absence (add a person), requests and bytes
before first paint, and when grammar became ready. It exits non-zero
over a § 1 budget.

**D2. Gate.** `npm run check` runs the probe against an agent copy;
over budget fails the wall. The budgets live in one file the probe
reads.

**D3. The watchdog goes back to being an alarm.** Once the budgets
pass, the `index.html` boot watchdog reports at 8 s again whatever the
cause — a slow boot is a bug, not a state to wait out.

**D4. Founder Works Test (iPad).** Cold first visit → board + welcome;
repeat launch → instant; add a person → their board, no welcome; switch
voice offline → honest refusal; switch voice online → background
download, words keep speaking.

## 4 — Not in this phase

- Tile art (037 is done; WebP stays).
- The `?reseed` founder reload (a dev affordance; it re-runs the seed
  on purpose).
- Service worker update UX (activate-on-next-launch stays).
- Changing what grammar help or suggestions *decide* — B4 is proven
  answer-preserving; any behavior change is a separate phase.

## 5 — Measurements log

| Date | Build | First visit | Repeat launch | Add a person | Notes |
| --- | --- | --- | --- | --- | --- |
| 2026-10-03 | `3fd2efe` | 13.6 s (6.5 s with SW off) | 19.5–21.8 s (5.3–5.8 s with SW off) | not timed separately | Fast Mac, local, no throttle. `ignoreSearch` lookup 463 ms vs exact 0 ms on 7,879 entries; form table parse 1.0 s; reconcile 2.4 s. |
| 2026-10-03 | `a101334a` | 4456 ms (probe, 4× CPU) | 6613 ms | 4839 ms (welcome shown — B5 gap) | Slice D baseline, before B. 205 requests before the board; the ~57 MB corpus parse dominated. |
| 2026-10-03 | `a101334a` | **1391 ms** | **395 ms** | **349 ms, no welcome** | Slices 0+D+A+B landed. 37 requests before first paint, 0 audio requests before the board, SW registered at 693 ms (after the board), answer tables 2.65 MB vs the 57 MB corpus. All § 1 budgets pass. |
| 2026-10-04 | `8c0fd07b` | — | — | — | Closeout: tap→speak 88 ms cold / instant warm (budget 300 ms); nav fallback + offline retry page + install retry for the dead home-screen launch (evicted-shell navigation proven in-browser); C1 headers + 8 s watchdog live (`22a5faff`). Answer tables waived at 2.65 MB vs the 2 MB target (founder). |

## 6 — Decisions log

| Date | Ruling |
| --- | --- |
| 2026-10-03 | Founder: active-voice-only audio offline; voice switching may need Wi-Fi; all-voice precache rejected; the first board load is the first impression and outranks background work. |
| 2026-10-03 | Founder: first board way under 8 s (target 2 s on fast internet), pictures and welcome included; background downloads never delay it; a second person skips the welcome and gets the same speed budget. |
| 2026-10-03 | Founder: the app ships derived answers, never the raw corpus — the counts were for deriving; the shipped tables are the small answer index (B4). |
