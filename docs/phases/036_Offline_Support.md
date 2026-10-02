# 036 — Works offline (app-shell service worker)

**Status:** PROPOSED 2026-10-02 — plan only, nothing built. This phase is
the gate for the "works offline" marketing claim; the 035 proposal's
claims table already flags it as untrue from a cold start.
**Sequenced after 037** (founder 2026-10-02): the payload diet lands
first so the precache covers every symbol, not just art seen before.
**Related:** `037_Shipped_Payload_Diet.md` (the § 3C input),
`docs/phases/035_Marketing_Site_Proposal.md` (claims table,
§ "Offline"), 024 (sentence clip cache — the pattern this copies), 028
(tile voice Cache Storage + offline queue), 015 (server-signed offline
license statement), `docs/product/SSOT.md` (the origin decision already
assumed a service-worker cache), `docs/product/Design_System.md`
(resting-Pip pose is the offline mark).
**Truth owner:** a real device cold-launching with the radio off and
painting the board (§ 5). **Lie-prone layer:**
`navigator.serviceWorker.controller` non-null, Lighthouse "installable"
checks, the DevTools offline checkbox on an already-loaded page — all
grade the plumbing, not a cold boot. Registration code can run and still
leave a shell that can't start.

## 1. The claim

"Works offline" means: airplane mode or a dead connection, app
relaunched cold → the board paints, catalog words and every
previously-heard word still speak, family edits save locally and sync on
reconnect.

It does **not** promise mint-on-demand, transforms, sync, picture draws,
or purchasing while offline — those already degrade honestly (queue +
retry, toast, or grey). First use must be online; that is true of every
installable web app and the copy should not overclaim it.

## 2. Already local — do not rebuild

| Layer | Mechanism | Owner |
| --- | --- | --- |
| Board data, groups, entities, op log | SQLite WASM exported to IndexedDB `pip-users` per write | `public/db.js`, `public/shared/users.mjs` |
| Tile word clips | Cache Storage `pip-tile-voice` + offline mint queue drained on `online` | `public/shared/voice_tile.mjs` |
| Sentence clips | Cache Storage `pip-voice`, every served clip lands | `public/shared/voice_sentence.mjs` |
| Catalog word audio | Shipped files under `public/audio/` (2,619 clips, ~41 MB) | `public/board/speech.js` `playClip` |
| Photos, recorded clips | OPFS `blob:` keys, lazy blob fetch | `db.js savePhoto`, `sync.mjs setBlobFetcher` |
| Sync | op log + WS relay, `GET /ops?after=` catch-up, "Offline — will sync" | `public/shared/sync.mjs` |
| Transforms | offline → speak the bar as built + toast | `public/board/speech.js` `transformAndSpeak` |
| License | server-signed statement verified offline | 015, `public/board/unlock.js` |
| Install surface | `manifest.webmanifest` + icons + `storage.persist()` at boot | shipped |

The only missing layer is **the app shell itself**. Boot fetches
`index.html`, ~50 modules under `/board/` + `/shared/`, sqlite-wasm,
`/catalog.json`, `/phrase_table.en.json`, `/form_table.en.json`, and
fonts — any one failing while offline is a dead page.
`grep serviceWorker public/` returns nothing.

## 3. Work orders

### A — Service worker + generated precache manifest

- `public/sw.js`: on install, precache the shell into a versioned cache
  (`pip-shell-v<N>`).
- No bundler → the file list is **generated**:
  `scripts/build/sw_manifest.mjs` writes `public/sw-manifest.json`
  (`{path, sha256, bytes}` per file), `sw.js` reads it at install.
  Drift-checked in `npm run check:fast` — a hand-maintained list will
  lie.
- Precache set ≈ **70 MB** (62 MB + ~8 MB symbols from 037): shell (index.html, `/board/*`, `/shared/*`,
  `/vendor/sqlite-wasm`, `/fonts`, `/brand`, `/icons`,
  `manifest.webmanifest`, `feeling_voice.json`, `/audio/onramp/*`)
  **plus** `catalog.json` (2.2 MB), `phrase_table.en.json` (12 MB),
  `form_table.en.json.gz` (5.3 MB), **and all of `/audio/*`** (41 MB) —
  precaching the catalog clips is what makes "every catalog word still
  speaks" true offline, not just words tapped before. **Plus all of
  `/symbols/*`** (~8 MB WebP after 037) — likewise for pictures.
- Navigations (`/`, `/index.html`) → cached shell. Single page, no
  SPA-fallback needed.

### B — Runtime caching

- Cache-first: `/api/v1/pictures/img/<id>` (drawn/extended art — not in
  the manifest). First view fills; repeats are local. `/symbols/*` is
  precached (§ C), so it needs no runtime rule once 037 lands.
- Never cache: `/api/*` POSTs, the relay WS upgrade, `/admin/*`,
  auth/passkey routes — all fall through to network; callers already
  degrade.
- Quota: `storage.persist()` already runs at boot — keep it; no new
  work.

### C — `/symbols/` strategy (resolved by 037)

**Decided: full precache.** `public/symbols/` is ~600 MB of
master-resolution PNGs today — not precacheable. **037** (building
first) ships ~8 MB of WebP, so the full symbol set joins the manifest
and every word's picture is offline from the first visit. 036 does not
start until 037's byte gate passes; there is no lazy-symbols fallback
to maintain. (If 037 is ever abandoned, reopen this section — don't
silently ship a lazy path under an "offline" claim.)

### D — Registration, updates, version pinning

- Register at boot (inline in `index.html` or early in `board.js`).
- Versioned caches; `activate` deletes `pip-shell-v<old>` and stale
  runtime entries.
- **Shell and catalog pin together.** `sw-manifest.json` carries a build
  id; a deploy swaps shell + `catalog.json` as one version — a new
  catalog under a stale shell (or vice versa) is a seed/drift mismatch.
- Update UX: `registration.update()` on boot; on `controllerchange`,
  apply on next cold start — never reload mid-session unprompted (a
  reload can lose a half-built sentence in a fullscreen app). If a
  grown-up-visible "update ready" toast is wanted it goes to the
  adult surface only. Decide at build time and record it here.
- `sw.js` itself stays outside `pip-shell-*` (browsers revalidate it on
  their own ≤24 h cycle).

### E — iOS install surface

- On iPad, "works offline" realistically means **Add to Home Screen** —
  installed PWAs get meaningfully better storage retention than a Safari
  tab. Where the nudge lives (marketing copy vs. in-app setup hint) is a
  founder call; the code is just the existing manifest.
- The Works Test runs from the home-screen icon, not a tab.

### F — Ops hygiene while we're here (small, optional)

- Confirm no asset path the SW depends on is served only through a
  Worker route — everything precached is a real file under `public/`
  today except `/form_table.en.json`, which the SW should cache as the
  `.gz` asset or let the Worker response land in the runtime cache.
- SW and `run_worker_first` don't conflict (SW is client-side), but note
  the header story: COOP/COEP/CORP are attached in `src/worker/index.js`
  — a served `sw.js` is same-origin and unaffected.

## 4. Explicitly out of scope

New voice mints offline (already queue), transforms (already degrade),
sync/pairing, picture finding/drawing, checkout/accounts — every one
already fails honestly. No device-TTS fallback gets added: silence on an
unminted word is the existing product ruling.

## 5. Works Test — the claim's proof

Owner-visible, measured on a real tablet:

1. **Online setup:** fresh profile, let seeds + tile prefetch settle.
   Add to Home Screen.
2. **Cold offline boot:** airplane mode → force-quit → launch from the
   icon. Board paints, no spinner, no blank tiles for viewed art.
3. **Speech:** tap 5 catalog words → shipped clips play. Speak a 3-word
   sentence → cached sentence clip or catalog word clips — never silence
   for shipped vocabulary.
4. **Offline edit:** add a word → it lands locally; the voice mint shows
   its queued state, not an error.
5. **Reconnect:** airplane mode off → mint queue drains, ops flush, no
   duplicate rows.
6. **Repeatable gate:** a scripted offline-reload check (Playwright/CDP
   network-offline after first load, or the manual checklist) joins the
   test suite per `docs/operations/Testing.md`. Honest limit: emulation
   is not Safari storage eviction — the device run in steps 2–5 stands
   alone.

The marketing claim goes live only after steps 2–5 pass on the real
tablet.

## 6. Honest limits / open questions

- **"After first open"** is the entire promise — a device that never
  opened Pip online has nothing. Same as every PWA; copy must not imply
  otherwise.
- **iOS eviction:** non-installed Safari tabs can lose storage under disk
  pressure. `persist()` + home-screen install mitigate; nothing
  guarantees.
- **COOP/COEP + crossOriginIsolated + service worker on iOS Safari** —
  verify on-device in slice A, not at the end.
- **A bad SW pins a broken shell** harder than a bad deploy. Keep the
  update path boring; a killed release is fixed by bumping
  `sw-manifest.json`'s build id, which clients pick up on the next
  update check.
- **Update while offline** is impossible by definition; the stale shell
  is the *correct* behavior there (that's the feature).
