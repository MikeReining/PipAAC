# 044 — Native iOS app, through App Store release

**Status:** APPROVED — implementation not started, 2026-10-06.
**Next:** A0 — the three device tests (§ 6), on the base A16 iPad.
**Platforms:** iOS app; shared core build (`scripts/ios/`); backend
(`apple-app-site-association` on the site, App Store notifications on the
Worker).
**Architecture owner:** `docs/product/Platforms_iOS_And_Web.md` — read
it first. This phase owns sequence, status and proof; it is deleted at
closeout.

## 1. Outcome and boundaries

Ship Pip AAC as a native iPad app on the App Store: the full
communication experience, offline, with Pip's own recordings, native
accessibility, and customization from the desktop web app — pictures
and recordings included. The web app and backend remain supported.

Existing product owners keep feature semantics; do not copy their rules
into this file or into Swift. This phase does not authorize new pricing,
data retention, off-device processing, partner listening, location
prediction, Personal Voice, voice cloning, bulk art or voice generation.
iPhone pocket mode and other proposals are not silently added.

## 2. Decisions (founder, 2026-10-06)

| Decision | Ruling |
| --- | --- |
| Architecture | Native SwiftUI screens; the shared JavaScript rules run in JavaScriptCore (platform § 2). A0 verifies it on the floor device. |
| Minimum OS | iOS/iPadOS 26. Raise it as versions ship. |
| Slowest supported device | Base iPad (A16, 2025). Budgets in § 7 are measured on it. Older iPads that can install are not tested. |
| Devices in 1.0 | iPad only. iPhone follows once its layout is decided. |
| SQLite | Bundle the same SQLite version the web uses (`@sqlite.org/sqlite-wasm` 3.53.x, built from the amalgamation), not the system library. Same engine, same results. |
| Audio | `.playback` session; speaks with the silent switch on; stops other audio; recovers on route change. No Apple TTS anywhere. |
| Bundled audio | Default voice (Pip) in the app; other voices download on choice. |
| Keys | Keychain, this-device-only, after first unlock. New iPad = recovery card or supporter sign-in. |
| Passkeys | Same passkeys as web via Associated Domains on `pipaac.org`; PRF unlocks the account key. |
| Purchases | Consumable "Pip Lifetime for one user", server-validated (`Pricing_And_Packaging.md` § 4.5). No web checkout link in the app. |
| Background | No push notifications in 1.0; catch up on launch, resume and while open. |
| Store category | Not the Kids category. Parent gate before purchases and outside links. |
| Moving from Safari | QR card restore (free) or linking (Lifetime); no file export. |
| Shipping cadence | Every slice ends with a TestFlight build on a real iPad — the native form of "always deploy". |

**App identity (set 2026-10-06):** bundle ID `org.pipaac`, developer team
`LP5YNK7A36`; the app record exists in App Store Connect. Test targets
use `org.pipaac.tests` and `org.pipaac.uitests`.

## 3. Founder admin

- [x] Apple Developer Program account (team `LP5YNK7A36`).
- [x] App Store Connect app record, bundle ID `org.pipaac`.
- [ ] Add the developer to the team with App Manager access, and to an
  internal TestFlight group.
- [ ] Enroll in the App Store Small Business Program (15% instead of 30%).
- [ ] Buy a base iPad (A16). Until it arrives, A0 is built and run on
  the simulator and the founder's iPad 10th generation (A14, 2022); the
  pass/fail run waits for the A16.

## 4. Getting started (developer)

1. Read `AGENTS.md` (workflow, commit rules, Always deploy), then
   `docs/product/Platforms_iOS_And_Web.md`, then this file.
2. Tools: Xcode 26 or later; Node 24 (`.nvmrc`), `npm ci`. Web preview
   for comparison: `npm run dev:agent` (never `npm run dev`, the
   founder's copy). Tests: `scripts/test.sh <paths>`; rules in
   `docs/operations/Testing.md`.
3. Xcode project: `apps/PipAAC/PipAAC.xcodeproj`.
4. Passkeys only work on `pipaac.org` domains and there is no staging
   domain, so passkey tests (A0 S2, C, F) use test accounts on
   production `app.pipaac.org`. Delete them after.
5. Questions that change product behavior go to the founder; anything
   the owners in § 8 already answer does not. Leave a progress note in
   § 10 whenever work stops (`docs/operations/Execution-Playbook.md`
   § Progress Note Format).

## 5. Release scope

**1.0 (iPad):**
- First run, multiple users (people), Settings behind the PIN.
- Board, groups, keyboard, Smart bar, forms, sentence buttons
  (✨ ❓ ⏪ ▶ ⏩ per `docs/product/Sentence_Bar.md`), expressive voice,
  voice and speed choice.
- The board shows Spotlight glow/dim and live modeling that arrive from
  other devices.
- Supporter on iPad: add a word, take or pick a photo, record a voice,
  picture finder and Draw it for me, rename, move, hide; Library.
- Link devices, desktop edits including media, accounts, team roles,
  invites, removal, recovery card, account deletion.
- Purchase and restore; trial and free limits as on web; Help.

**1.1:** the Spotlight page and the Progress/report screens on iPad.
Their data records and syncs in 1.0 (stats days and Spotlight lists are
synced tables), so supporters use them on desktop meanwhile.

**Later:** iPhone layout; anything the A inventory marks secondary,
listed by name for founder approval.

## 6. Slices

Rough effort for one senior iOS developer: about four to five months to
1.0. Re-estimate after A0.

| Slice | Deliverable | Advances when |
| --- | --- | --- |
| **A0** | Three device tests: shared core, crypto + passkeys, tap to sound | Pass criteria below met on the A16 iPad, results in § 10 |
| **A** | Inventory file, parity fixtures, build/test commands, CI, platform-label lint, TestFlight pipeline | Every web workflow has a row; first TestFlight build installs |
| **B** | Native SQLite + core host, bundled catalog/audio, first board and groups speaking offline | P1, P2 on the A16 iPad; TestFlight |
| **C** | Pairing, two-way sync, media transfer, accounts/passkeys, QR card restore | P3, P4, P5; desktop customization works before the rest of the port |
| **D** | Smart bar, keyboard, forms, sentence buttons, expressive voice, voice/speed, people | P6; cloud failure leaves local speech working |
| **E** | Supporter flows: Settings/PIN, word card, photos, recording, picture finder, Library, first run, Help | Matching inventory rows verified on device; desktop and iPad edits stay compatible |
| **F** | Team roles, invites, removal, rotation, account deletion, StoreKit + Worker notifications endpoint | P7, P9 purchase cases; one entitlement owner |
| **G** | Whole-app acceptance, accessibility pass, upgrades, interrupted downloads | P1–P9 and § 7 budgets on the A16 iPad |
| **H** | Store material, privacy answers, review notes, submission, release | Approved build installed from the App Store passes P1, P3, P7 |

Accessibility (VoiceOver labels, Switch Control order, larger text,
Guided Access) is built into every screen slice from B; G is the full
pass, not the start.

### A0 — device tests (do first)

Run on the A16 iPad in a Release build. Also run on the founder's iPad
10th gen and record the numbers; they inform, they don't gate.

**S1 — shared core in JavaScriptCore.**

1. `scripts/ios/build_core.mjs` bundles a core entry
   (`scripts/ios/core_entry.mjs`, importing from `public/shared/`) into
   one file with esbuild (add it as a direct devDependency), written to
   `apps/PipAAC/PipAAC/Core/pip-core.js`. Generated, committed, with a
   `--check` mode (same idiom as `catalog:build:check`). Record which
   modules went in and which globals needed host shims.
2. Swift host: one `JSContext` on one serial executor; host functions
   for `crypto.randomUUID` and logging; the database adapter with the
   exact `adapt()` shape in `public/db.js` (`exec`, `prepare().run →
   { changes }`, `prepare().all`, `all`) over the bundled SQLite.
3. `scripts/ios/export_fixtures.mjs` writes fixtures (no paid APIs):
   - **Replay:** the fresh database, op streams from the
     `src/board/sync_merge.test.mjs` scenarios (several seeds, including
     the seed-install op and non-idempotent swaps), and the expected
     sorted dump of every table in `SYNCED_TABLES` after drain.
   - **Heavy use:** six months of daily taps built deterministically
     with `scripts/taps/sim.mjs` (it already drives the real catalog,
     `stripRanked`, `groupRanked` and `formFor`), plus 500 probe taps
     with the Smart bar contents (`stripCandidates`) and forms
     (`formFor`) node returns after each. Include the existing golden
     cases in `scripts/prediction/bar_examples.json` and
     `form_examples.json`.
4. iPad harness (Swift Testing target, Release configuration): replay
   and compare dumps; run the probes, timing each with `ContinuousClock`
   and Instruments signposts. These timings diagnose compute cost; the
   user-facing latency claims are P-tests with external instruments.
5. Optional baseline: the same probes in Safari on the same iPad
   against `npm run dev:agent`, to show what JavaScriptCore without JIT
   costs. Skip it if it needs a deployed page.

Pass: zero byte differences on every replay fixture and probe; core load
(evaluate bundle + open database) ≤ 300 ms; Smart bar + forms per tap
p95 ≤ 30 ms and p99 ≤ 60 ms; one edit with its op record p95 ≤ 30 ms; a
1,000-op catch-up ≤ 3 s off the main actor with the board still
responsive. A byte difference is a bug to fix (host shim, SQLite
build), never a reason to change the fixture. If a module misses its
speed budget, move only that module to Swift against the same fixtures;
ops replay stays in the core.

**S2 — crypto and passkeys.**

- Node writes envelope fixtures with fixed test keys: sealed ops (with
  and without `deflate-raw`), signed payloads, wrapped key grants and a
  PRF-sealed account key. Swift opens and verifies them; Swift writes
  its own; a node test opens and verifies those. Both directions, every
  primitive.
- Serve `apple-app-site-association` from
  `https://pipaac.org/.well-known/` on the site (`site/public/`, served
  as `application/json`, no redirect) with
  `{"webcredentials":{"apps":["LP5YNK7A36.org.pipaac"]}}`, and add
  `webcredentials:pipaac.org` to the app's Associated Domains. Deploy the
  site and smoke it: `curl` the file and Apple's CDN copy at
  `https://app-site-association.cdn-apple.com/a/v1/pipaac.org`.
- Create a passkey on the web, use it in the app: the PRF output opens
  the account key. Then the reverse.

Pass: everything opens and verifies both ways; the same passkey yields
the same PRF bytes on web and iPad.

**S3 — tap to sound.**

- Preloaded default-voice clips; `.playback` session.
- Measure tap to sound with a 240 fps video that shows finger and
  speaker (or a contact mic), 50 taps.
- Repeat with the silent switch on, under Guided Access, and across a
  Bluetooth speaker connect/disconnect.

Pass: p95 ≤ 100 ms on the A16 iPad; audible in every condition.

### A — inventory and plumbing

- `docs/phases/044_Native_iOS_Inventory.md`: one row per web workflow
  traced from its entrypoint — gesture, web call path, core vs Swift
  split, data/API/media effect, release (1.0 / 1.1 / later), slice,
  proof ID, status (planned / implemented / verified on device /
  released). Starting call paths are in § 8. Built behavior is separated
  from proposals and known bugs; do not port a bug to make clients match.
- Parity fixtures from A0 move to their permanent home and run in both
  `scripts/test.sh` and the Xcode test target.
- Record build/test commands in `docs/operations/TechStack.md`
  (`xcodebuild` scheme and destinations, fixture export, core bundle).
- GitHub Actions macOS job: build, unit tests, `build_core --check`.
- `scripts/check_platform_label.mjs` in `check:fast`: phase docs numbered
  045 and above must carry a `**Platforms:**` line (platform § 7).
- Signing, App Store Connect and an internal TestFlight upload.
- Decide VoiceOver behavior for tiles (Pip speaks the word; VoiceOver
  must not say it again) and Switch Control scan order; record in
  `docs/product/Design_System.md`.

### B–C — first working path

- Project settings: Swift 6 language mode, iPad-only device family,
  iOS 26 minimum; delete the SwiftData `Item` scaffold.
- Boot without an account or network into the real board. A failed
  database open never replaces the family's data with a fresh catalog;
  keep the last good file.
- Every edit runs through the core and commits the table change and its
  op in one transaction.
- User media lives in persistent files; a cache is never the only copy
  of a caregiver recording.
- Before sync work, read 043's open sync follow-ups (supporter-regrant
  resume, delivery-order repair) and reproduce them on two web clients
  first, so native work neither hides nor copies a known defect.
- Pair with the desktop through the current protocol. Reject an
  incompatible protocol version visibly, keep pending edits, resume on
  reconnect. A photo or recording counts as available offline only after
  its content hash matches.

### D–F — feature completion

- Fill every 1.0 inventory row. Settings that change density,
  presentation, masking, sentence controls or attention are included.
- Prediction and forms come from the core and the generated answer
  tables; backend model/prompt work stays shared. Nothing is rebuilt in
  Swift that the core or a service already does.
- Native photo picker, camera, recording and accessible controls. Keep
  per-user limits, PIN behavior, ownership and permissions. Face ID may
  stand in for typing the PIN; it does not change who may do what.
- Help answers come from `src/help/answers.en.json`; Help links map to
  native screens.
- Progress keeps counting native taps with the existing privacy
  boundaries. Live modeling is an attention event, not a board edit.
- StoreKit: purchase, duplicate delivery, refund/revocation through the
  Worker's App Store Server Notifications endpoint into `entitled()`.
  Deploy and smoke the Worker in the same slice.

## 7. Works Tests and budgets

Record device, OS, build, inputs, how it was observed and where the
evidence lives. UI messages and app logs are not proof of the outcome.

**Budgets** — base A16 iPad, Release build, measured externally (240 fps
video or equivalent):

| Measure | Budget |
| --- | --- |
| Tap to sound | p95 ≤ 100 ms |
| Tap to Smart bar updated | p95 ≤ 150 ms |
| Cold launch to a tappable board | ≤ 2 s |
| Desktop edit shown on an open iPad, normal Wi-Fi | ≤ 5 s |

| ID | User action | Independent observable result |
| --- | --- | --- |
| P1 — offline speech | Fresh install with radios off before first launch; tap words and forms, build a sentence, Speak; force-quit and repeat | Default labels and art render; Pip recordings are audible; no login or download needed |
| P2 — durable edits | Add, move, rename a word and record it; kill the app during a save; reopen | The file holds the last committed edit or the previous intact state, never half an edit; the board shows it and the recording plays |
| P3 — desktop customization | With iOS open, change on desktop a word, group/cell, voice/speed/bar setting, photo and recording; relaunch iOS offline | The iPad shows the edits in place and plays the new recording, no reload or network |
| P4 — convergence | Edit offline on both, including competing placement and swaps; reorder and duplicate deliveries; interrupt catch-up | Synced tables dumped from both devices are identical; local histories stay local; no edit lost behind an advanced cursor |
| P5 — media durability | Interrupt photo/recording upload and download; reconnect; restore to an empty install; go offline | Pictures match and recordings sound the same; hashes match; pending files are distinguished from lost ones |
| P6 — speech state | Rapid taps, backspace/clear, repeated Speak; change the bar during a slow transform; interrupt audio, change route | What is heard follows the latest request; stale replies never overwrite words or speak an abandoned sentence |
| P7 — recovery and access | Restore by card; import an account; resume an interrupted rotation; remove a supporter; Owner vs Team actions | Authorized devices get words and media back; removed ones cannot read new data; the relay rejects restricted actions |
| P8 — accessibility | Communicate, navigate groups and do key supporter tasks with VoiceOver, with Switch Control, under Guided Access, with largest text and reduced motion | Tasks complete with stable focus and scan order; no tile spoken twice; no word moves; video records failures as well as passes |
| P9 — release and upgrade | Install over an older customized build; interrupt a voice-pack update; purchase, restore, refund | Words, recordings, keys and pending edits survive; the working voice stays; purchases land in the same entitlement and refunds remove access |

Use fixtures, existing clips and the persistent paid-service tools; no
ad-hoc paid fan-out to verify the port.

## 8. Where the web behavior lives today

Starting call paths for the A inventory (paths under `public/`):

| Workflow | Web call path | iOS split |
| --- | --- | --- |
| Open a person, load words | `index.html` → `board.js` → `shared/users.mjs` + `db.js` → import/migrations | Swift user registry and file; core runs import/migrate |
| Board, groups, taps | `board.js` → `board/grid.js` / `board/groups-ui.js` → `tap()` | SwiftUI grid; layout queries from the core |
| Word and sentence playback | `tap()` / sentence controls → `board/speech.js` → `shared/voice*.mjs` | Swift playback and downloads; clip choice from the core |
| Smart bar, forms | `board/strip.js` → `shared/funnel.mjs`; `shared/forms.mjs` | Core |
| Sentence transforms, expressive voice | `board/speech.js` → `shared/txbar.mjs` → Worker handlers | Swift client and cancellation; backend unchanged |
| Library, edits, add a word | library/editor/add-flow/word-card mounts → shared write functions | SwiftUI screens; writes through the core |
| Pictures, photos, recordings | word-card picture/voice mounts → picture client / blob sync | Swift pickers, recorder, files; existing picture APIs |
| Link devices, sync, recovery | `board/devices-ui.js` / `board/recovery-ui.js` → `shared/sync.mjs` → `sync_client.mjs` / `sync_crypto.mjs` | Swift transport and CryptoKit; op semantics in the core |
| Accounts, roles | devices UI → `shared/account.mjs` + `sync_crypto.mjs` → Worker | Swift passkeys and keychain |
| First run, people, Settings | `board.js` → onramp/setup/people/settings mounts | SwiftUI; data writes through the core |
| Spotlight, modeling, progress | `shared/spotlight.mjs`, `stats.mjs`, `dashboard.mjs`, `report.mjs`; `board/coach-ui.js` | Core for data; 1.0 board renders attention, 1.1 screens |
| Help, purchases | `board/help-ui.js`, lifetime UI → help/trial/account APIs | Swift screens; StoreKit |

Feature rules stay in their owners:

| Area | Read before implementing |
| --- | --- |
| Positions, density, presentation | `docs/product/Motor_Grid_And_Art.md`, `docs/product/Core_Coordinate_Map.md`, `docs/phases/014_Grid_Density_And_Fit.md`, `docs/product/Profile_Presentation_Modes.md` |
| Labels, forms, recordings, voice | `docs/product/Language_And_Voice_Schema.md`, `docs/product/Sentence_Bar.md`, `docs/phases/028_Tile_Voice_Library.md` |
| Library, word cards, pictures | `docs/product/Word_Library.md`, `docs/product/Personal_Entities.md`, `docs/phases/029_Add_A_Word.md`, `docs/phases/030_Picture_Finder_And_Drawing.md` |
| Settings, attention, design | `docs/product/Design_System.md`, `docs/phases/032_Spotlight_Page.md` |
| Sync, accounts, recovery | `docs/product/Sync_And_Web_Editing.md`, `docs/phases/015_Accounts_And_One_Price.md`, `docs/phases/043_Foundation_Hardening.md` |
| Progress, pricing, Help | `docs/product/Stats_And_Progress.md`, `docs/product/Pricing_And_Packaging.md`, `docs/phases/042_Help.md` |

Generated catalog and audio come from existing build inputs; do not
hand-edit generated JSON or mint replacement assets for the port.

## 9. Done and retirement

- [ ] A0 passed (or named modules moved to Swift with fixtures) and the
  results are recorded in § 10.
- [ ] Every 1.0 inventory row implemented and verified on the A16 iPad;
  exclusions are named founder decisions.
- [ ] P1–P9 pass and § 7 budgets are met, with preserved evidence.
- [ ] The App Store build is installed from the store and passes P1, P3
  and P7.
- [ ] Lasting decisions live in the platform owner; build commands in
  `docs/operations/TechStack.md`; the platform-label lint is in
  `check:fast`.
- [ ] 1.1 scope moved to its own phase; this file and its index/router
  links removed per `docs/operations/Execution-Playbook.md`.

## 10. Progress

**2026-10-06:** plan revised after review — shared JavaScript core,
device floor (iOS 26, base A16 iPad), iPad-only 1.0, A0 device tests
first, founder admin list. Documentation only; no native code, CI,
fixtures or device results exist yet. Bundle ID `org.pipaac` set in
Xcode and App Store Connect. Next: A0 (§ 6), built on the simulator and
the iPad 10th gen until the A16 arrives.

**2026-10-06 (S1 build):** the shared core runs in JavaScriptCore with
the real adapter shape — A0-S1 is built, device run pending.

- Core bundle: `scripts/ios/build_core.mjs` (esbuild IIFE) emits
  `apps/PipAAC/PipAAC/Core/pip-core.js` (234 KB, 40 modules — data-side
  `public/shared/` only; network/crypto/account modules stay native).
  `npm run ios:core`; `--check` is a `check:fast` gate. Host shims in
  `scripts/ios/jsc_shims.mjs` cover `crypto.randomUUID`,
  `getRandomValues`, `console.*`, `TextEncoder/Decoder`; the only
  Web-API reference left in the bundle is a guarded `fetch` inside a
  `.catch` (never reached by the harness).
- Swift host: `apps/PipAAC/PipAAC/Core/PipCore.swift` — one `JSContext`
  on one serial `DispatchQueue` (`sync`/`enqueue` only; every host block
  runs on-queue). `PipDatabase.swift` wraps the vendored SQLite 3.53.4
  amalgamation (`Core/SQLite/`, verified SHA3-256 against sqlite.org)
  with the `public/db.js` adapter shape: `exec`, `run → {changes}`,
  `all → {columns, rows}`; `__err` results on failure. BLOB cells cross
  as `{__pipBytes}`; bools bind as 0/1, matching the node host.
- Fixture harness: `scripts/ios/harness.mjs` runs in both engines —
  node (fixture generation) and JSC (device verify) — so expected
  outputs come from the code under test, not a second implementation.
  `runReplay` / `dumpSynced` (all `SYNCED_TABLES`, canonical JSON),
  `probeBegin/Tap/…` (tap → form + decision-4 re-pick + log + Smart bar,
  mirroring `public/board.js`), `barGolden`/`formGolden`, `oneEdit`.
- Fixtures: `scripts/ios/export_fixtures.mjs` (`npm run ios:fixtures`,
  `--check` for drift). Deterministic — per-lane `crypto.randomUUID`
  and `Date.now` counters, `TZ=UTC` re-exec (log rows carry
  tz_offset_min). Emits `base.sqlite` (post-import replica), three
  merge-scenario replay fixtures + the pending-reapply case,
  `heavy.sqlite` (180 days × 191 corpus sentences synthesized at real
  row counts — the timing gate needs shape, not a real-path replay),
  500 probe taps, a ~1,400-op catch-up stream, and the resolved
  bar/form goldens against the *shipped* answer tables
  (`public/suggest_answers`, `form_answers` — what the device loads,
  not the build corpora).
- Extraction: `src/board/merge_scenario.mjs` now owns the merge storm
  (shared by `sync_merge.test.mjs` and the exporter); `ops.mjs` exports
  `SYNCED_TABLES`; `sim.mjs` `runCorpus` takes a `now` base clock.
- Node-side proof: all 4 replay fixtures verify byte-identical through
  the harness over `node:sqlite`; `sync_merge.test.mjs` still green
  after the extraction.
- Xcode: Swift 6, iPad-only (`TARGETED_DEVICE_FAMILY = 2`), iOS 26,
  bridging header for the vendored SQLite, SwiftData scaffold deleted.
  App + test targets build Release for the iPad (A16) simulator.
- S2 partial: `site/public/.well-known/apple-app-site-association`
  written (`webcredentials: LP5YNK7A36.org.pipaac`) + worker serves it
  `application/json`; app entitlements carry
  `webcredentials:pipaac.org`. Site deploy + Apple CDN smoke still owed.
- Still owed for A0: S2 needs the site deploy and a device passkey
  run; S3 needs physical hardware + 240 fps camera. Physical-A16
  confirmation of the simulator numbers below still owed.

**2026-10-06 (S1 device run — Smart bar answered):** the shared core is
fast enough on the floor device; nothing ports to Swift for speed.

- `xcodebuild test`, Release, iPad (A16) simulator — every
  `PipCoreParityTests` gate green: core load, replay byte-parity ×4,
  502 probe taps canon-identical, ~1,400-op catch-up drain, edit+op
  record, 27 bar + 72 form goldens.
- **Probe taps (six-month db): inside the 30/60 ms budget with ~5×
  headroom** — 502 taps in ~2 s (~4 ms mean). Phase split: append
  (form + re-pick + log write) p95 3 ms; strip (sentence → ranked bar)
  p95 5–7 ms; JS↔SQLite bridge floor 0.01–0.02 ms per call — the
  bridge was never the bottleneck.
- The 76 ms p95 found on the first run was *our* hot path, not the
  engine: `herNowTable` ferried every ±90-minute sentence's events to
  JS each paint. Two shared-code fixes (both benefit the web app too):
  - `phrase_link` (new device-local table): per-sentence ending→follower
    links written at close time with the start's minute-of-day — the
    "her now" window is one indexed `ctx/mod` aggregate per tap instead
    of an event rescan. Schema + `ADDITIVE_TABLES`; `ensurePhraseHistory`
    lazily creates it and rebuilds it when missing.
  - `phrase_watermark` (new singleton row): the `phrase_count` rebuild
    was a per-session WeakMap — ~80 s of CPU on a six-month history,
    every launch. Persisted, it's once-ever; incremental catches
    synced sentences by id as before.
- Verdict: JSC + native SQLite meets budgets with ~6× headroom on
  the probe path. Smart bar stays in the shared core; the plan's
  Swift-escape-hatch for it is not needed.

**2026-10-06 (S2 shipped + B1 — the app boots the real board):**
PipAAC launches into the working board on the iPad (A16) simulator,
fully offline.

- S2 done (infra half): `wrangler deploy` shipped the site; live
  `https://pipaac.org/.well-known/apple-app-site-association` returns
  200 `application/json` with `LP5YNK7A36.org.pipaac`, and Apple's CDN
  copy already serves it. The device passkey run is still owed once
  auth screens exist.
- JS app facade `scripts/ios/app.mjs` (exported as `PIPCORE.app`,
  bundle 256 KB/41 modules): `appOpen` (db + catalog + answer tables,
  the `loadCatalog`/`loadLanguage` boot path), `appBoard`, `appStrip`,
  `appBar`, `appTap`/`appBackspace`/`appClear`/`appSpeak` (the
  board.js child tap path — form, re-pick, log, resolveSlot),
  `appGroups`/`appGroupPage`/`appShowBoard`, `appOpenFamily`/
  `appFamilyPage`. Every mutation returns the whole painted state —
  Swift renders, never re-derives.
- Asset bundle `scripts/ios/bundle_assets.mjs` →
  `apps/PipAAC/SharedAssets/` (gitignored, `npm run ios:assets`,
  `--check` exists): fresh_db, catalog + answer tables, sw-audio
  manifest, the default voice's clips, symbols + icons + brand, the
  21 SVGs rasterized to PNG by `qlmanage`. ~1,970 files, ~30 MB.
- Swift shell: `PipAssets` (bundle lookup, art cache, user-db
  seeding — a failed open reports, never re-seeds), `PipSpeaker`
  (`.playback` session, clip slots, 400 ms silent slot — no TTS on
  tiles, per the audio law), `AppModel` (bridge + published state —
  MainActor UI, nonisolated `core.sync` calls on the pool; the Xcode
  template defaults everything to MainActor so models/assets are
  marked `nonisolated`), `BoardView`/`TileView` (cream bg, role
  border/fill pairs, label-strip-over-art tiles, strip cards, bar
  chips — the web palette verbatim).
- `PipCore.call` gained dotted-path resolution (`PIPCORE.app.x` —
  `objectForKeyedSubscript` is literal, not a path).
- Proven: `xcodebuild test` — all 8 parity tests still green with the
  new resolve path; `PipAACUITests.testBoardTapBar` passes — boots to
  real catalog tiles, tap arms backspace/play + resolves a clip,
  backspace/clear work, Groups anchor round-trips index→board.
- Not in B1: transform buttons (✨❓⏪⏩), keyboard surface, group-page
  header chrome, settings, sync — later slices per § 6.

**2026-10-06 (B2 — keyboard surface + transform chrome):** the board's
Keyboard anchor opens the real Pip key map; the sentence bar carries
the full control row (⌫ ✕ inside the bar, ✨ ❓ ⏪ ▶ ⏩ outside it, in
web order). All semantics run in shared JS — Swift renders keys and
buttons, never rules.

- Facade additions (`scripts/ios/app.mjs`): `appKbOpen`/`appKbClose`,
  `appKbPress` (keyboard.mjs `applyKey` — buffer, dead-key latch,
  punct-as-mark, ⌫ reopens the last word, Enter speaks),
  `appKbPartner` (yes/no tiles speak, never touch the sentence),
  `appTransform`. `state()` now carries `typing` (buffer + caret),
  `kb` (slot/span key model — partner keys arrive as board tiles),
  `controls` (`bar.barControls` — `learner_profile.bar_controls`,
  NULL = Everything), and `tense`/`question` for lit-state.
- Committed typed words take the web's `resolveTyped` path — approved
  label first (a form spelling pins), then active personal entities,
  else the word stays typed; grammar help still re-picks, and a
  commit logs + speaks like a tile tap. Mid-word, the strip switches
  to `spelling.suggest` completions (`mode: "complete"`); a completion
  tap clears the buffer and taps the suggested word (`source:
  "keyboard"` — a completion card's sense stays a sense, never an
  entity stand-in). `tileEnsure` (on-demand mint) is skipped — no
  transport yet.
- `barState` (txbar.mjs) now tracks `preTransform`/`tense`/`question`:
  `noteBarEdit` on every bar edit (tap, ⌫, clear, typed commit — the
  doc's rule; note web's `commitKbItem` doesn't void on typed words —
  a likely gap worth an upstream check), `restoreBar` inside `appSpeak`
  (▶ restores her taps on a past/future bar, no model call).
- Transforms have no transport yet, so `appTransform` takes the doc's
  offline path verbatim: a same-state press (❓ on a question, ⏪ on
  past, ⏩ on future) just re-speaks; otherwise `logTransform` + toast
  "needs the internet — spoke it as it was." + `speakNow` — every
  press produces audio, the bar never changes, nothing reads dead.
  When transport lands this adds the fetch + `sourceText` staleness
  check + `snapshotBar`/`applyTransform`; the shape is already right.
- Swift: `KbKeyModel`/`KeyboardModel`/`PaintedState` fields; `kbGrid`
  renders the 5×10 map with spans; transform buttons lit-state per
  `tense`/`question`; a 3.5 s toast overlay; `clips` and `speech`
  return values both handled (a sentence clip list owns the audio).
- Proven: `testKeyboardAndTransforms` UI test passes — anchor → key
  grid → "wan" → strip completes "want" → commit → ⏪ → toast + speak
  + bar unchanged → Board. All 8 parity tests green; `check:fast`
  clean. Found and fixed en route: two Realm `.cv` FIFO files inside
  other apps' sim containers were killing `xcodebuild`'s device clone
  — deleted the scratch files, clones work again.
- Still not built: the actual Worker transform call (needs transport
  + license), device-keyboard mode, keyboard settings (order lives in
  the profile already), settings surface, natural sentence voice.

**2026-10-06 (B3 — Settings surface + PIN):** the corner gear now opens
a real Settings sheet, and the Settings PIN gate/lock/change/reset
flows run natively. Every row is a synced `learner_profile` write
through `groups.setSetting` — the ops are already recorded for when
sync lands (Slice C).

- Facade (`scripts/ios/app.mjs`): `appSettings` returns the settings
  render model (toggles, enums, `BAR_PRESETS`/`BAR_CONTROLS`/
  `BAR_NAMES`, catalog `layouts`, the locale's standard keymap name);
  `appSetSetting` is one allowlisted write + `applyProfile` +
  repaint, and answers `speechRate` (the profile stores the word —
  slower/normal/faster — `appOpen` now maps it via speech.js's table;
  the earlier `Number()||1` always landed 1) and the refreshed
  settings model so the sheet never shows a value the db doesn't
  hold. Arrays serialize to JSON text inside the facade —
  `bar_controls`'s storage convention, same as settings-sync.js.
- Rows shipped: Grammar help, Start fresh after speaking, Speaking
  speed (segmented), Sentence bar presets + per-button toggles,
  Letter order (QWERTY/ABC), Cells (15/30/60/90), Top row on group
  pages, Occasions in Groups, Help improve Pip, and the Settings PIN
  card (lock/change/off).
- PIN (`Core/PipPin.swift`): the web's rules verbatim — 4 digits,
  SHA-256 of `pip-pin:device:<pin>`, device-local (UserDefaults is
  the native keyStore seat), never synced, every open asks, Forgot →
  "new pin" reset phrase → choose twice. UserDefaults, not Keychain:
  the threat model is a stray kid, not a stolen backup — matches the
  web keystore's durability class.
- Swift: `SettingsView` (Form sections) + `PinSheet` (check → forgot →
  new → confirm, auto-submit on the 4th digit, web's copy verbatim);
  the corner gear is small/muted/far-top-left per base.css, and
  becomes Home on index/group surfaces (web `#corner` dual role).
- Proven: `testSettingsSurface` UI test — gear → sheet → "Play +
  Question" preset → Done → bar shows Ask it + Clear only. Node smoke
  covers the write path (slower→0.8, abc reorder, grid30 repaint,
  empty bar_controls → Clear survives per bar.mjs). All parity + UI
  tests green; `check:fast` clean.
- Still not built: keyboard_mode=device (system keyboard), voice
  picker, person photo/name, sync/account/purchase sections (Slice
  C+), expressive-voice faces row (needs the strip faces first).

**2026-10-14 (A — inventory file):** `docs/phases/044_Native_iOS_Inventory.md` exists.

- Scope: slice A inventory only — docs, no code, fixtures or CI.
- Changed: new inventory, 156 rows in 13 areas, each traced from its web entrypoint (`board.js` and the mounts). Release: 149 at 1.0, 5 at 1.1 (Spotlight page, Progress, report), 2 later. Status: 46 implemented (B1–B3: board, groups, tap, Smart bar, keyboard, transform chrome, Settings, PIN), 110 planned, 0 verified on device, 0 released. Also lists web-only items with no native counterpart, known bugs not to port, and proposals.
- Verified: `npm run check:fast` (doc lints). No device proof; "implemented" rows rest on `scripts/ios/app.mjs`, the Swift files and the notes above.
- Left: Zero rows from Library & word cards, Pictures, Accounts, Purchases, Help are built. The "Someone else pays" unlock link (PU-9) conflicts with "no web checkout link in the app" and needs a founder decision.
- Next: A0 device tests, then the rest of slice A (fixtures home, build commands, CI, TestFlight); flip row status as slices land.

**2026-10-14 (E1 — Edit mode + word card):** an adult enters Edit through
Settings (behind the PIN) -> "Edit the board", taps a word to open its
card, and can rename, hide/show, remove (undo toast) and drag-move/swap.
Edits survive relaunch.

- Scope: LW-1, 6, 7, 9, 10, 11. Home board and group pages. Not in E1:
  add words, pictures/voice/colour/Swap rows, groups management, the
  on-demand clip mint after a rename (no transport).
- Changed: `scripts/ios/app_edit.mjs` (`PIPCORE.edit`, new) — each write
  is one call into the web's owner (`renameEntity`, `setMask`,
  `retireEntity`/`restoreEntity`, `removeItemUndoable`, `moveCore`/
  `placeOnBoard`, `moveItem`/`swapItems`) and returns the repainted edit
  state + a toast with an undo token. `app.mjs`: `s.editing` makes the
  board/group paint show hidden words as ghosts; 3 tiny exports
  (`appSession`, `appMeta`, `appGeom`). Swift: `EditMode.swift`,
  `WordCardView.swift` (new); small hooks in `AppModel`, `BoardView`,
  `SettingsView`. Test-only launch args `-pipUITestReset`,
  `-pipUITestSeedPerson <name>` (a personal word to act on).
- Verified: `scripts/ios/app_edit.test.mjs` (sync_op rows read through a
  second connection); XCUITests `testEditRenameSurvivesRelaunch`,
  `testEditRemoveWithUndo`, `testEditHideShowAndMove`; all earlier tests
  green (they now launch with `-pipUITestReset`).
- Left: Swap/Replace, colour, pictures, voice rows (later slices).
- Web quirk seen (not fixed): `coremove.slotMap` — with an evicted
  person (seated on "mom"'s cell), swapping two words puts "mom" on a
  vacated cell that another word now claims (two words, one slot).

**2026-10-14 (C2 — the web's sync loop in the core, Swift supplies the I/O):**

- Scope: `sync.mjs`, `rotation.mjs`, `sync_client.mjs` (and `bounded.mjs`) run UNCHANGED in `pip-core.js`; the iOS build swaps three imports, not code. No pairing/account/media UI, no real relay (next slice).
- Changed: `build_core.mjs` resolve plugin (`./sync_crypto.mjs`, `../db.js`, `./platform.mjs` -> `scripts/ios/host/{sync_crypto,db_blob,platform}_host.mjs` for importers in `public/shared/` only); `jsc_shims.mjs` (hostCall promise bridge, timers, AbortController, fetch/Response/Headers, WebSocket, URL, atob/btoa, location, `crypto.subtle.digest`); facade `app_sync.mjs` -> `PIPCORE.sync.syncStart(appId, userRow, baseUrl, opts)` / `syncHealth()` (results leave as `__pipHost.emit` events: `sync.started`, `sync.applied` = repaint, `sync.model`; registry `sync` patches go to `saveUser`); `PIPCORE.hostCrypto` / `hostio` exported for later slices. Swift: `PipHost.swift` (infra, queue rule), `PipHostCrypto.swift` (CryptoKit ops, handle table, keychain store by the web's names, blob files, saveUser), `PipHostNet.swift` (URLSession fetch, timers, URLSessionWebSocketTask); `PipCore` gained `post` (the only re-entry), `install`, `evaluate(source:)`.
- Rule: every completion re-enters JS via `queue.async`; Swift holds no JSValue (resolve/reject live in JS's pending table, dropped on settle/abort); `dispatchPrecondition(.onQueue)` at every JS touch.
- Verified: `scripts/ios/sync_host.test.mjs` (built bundle in a bare `node:vm`, fake `__pipHost`: catch-up, flush, WebSocket push + model frame, stalled fetch aborted by timedFetch's deadline, export-surface parity, signatures verified relay-side; asserts on table dumps); `PipHostTests` (openOp on every node.json op via the host module, fetch shim over URLProtocol, timers, keychain names, 600 overlapping promises with 64 concurrent `core.sync` calls, loopback WebSocket echo).
- Left: nothing calls `syncStart` yet — the D1 registry owns the row, the `saveUser` hook and the call; scenePhase -> `PipHost.notifyVisible()` and `startNetworkMonitor()` wiring; blob fetcher consumers (PP-9); the real-relay end-to-end run.
- Next: D1 (registry + start sync on launch), then pairing/recovery on `hostCrypto`.

**2026-10-14 (D1 — several people on one iPad):** Settings -> "People on
this device" adds (name prompt), switches and removes people; with two or
more and no "opens first", launch shows "Who's talking?".

- Scope: PF-5, PF-6, PF-7. Not in D1: person photo (PP-8), rename, locked /
  not-linked states (need sync), welcome tour, per-person voice.
- Changed: `Core/PeopleRegistry.swift` (new, `nonisolated`): `people.json`
  beside `Users/<id>.sqlite`, rows exactly users.mjs's (id, name, photo,
  home, role, needsSetup, lastOpened ms; `sync` arrives with Slice C);
  last-opened first; `resolveActive` = home, else a lone person, else the
  list; add seeds the person's file from fresh_db first; remove deletes
  row then file (+ -wal/-shm/.prev). Which person is open is in memory
  only (web: tab override), so a relaunch follows `resolveActive`. A
  missing person file is an error, never a re-seed. A pre-registry
  `Users/default.sqlite` becomes the first (home) person. `PeopleView.swift`
  (new): launch list + Settings > People + "When Pip opens". `AppModel`:
  `open(id)` opens the new file, then `appClose`s the old (a failed open
  leaves the current person); `-PipDataDir <path>` launch arg moves the
  data dir for tests. No JS changes; pip-core.js unchanged.
- Verified: `PeopleRegistryTests` (6 rules tests); XCUITest
  `PeopleUITests.testSeveralPeopleOnOneIPad` reads people.json and each
  SQLite file from disk (Sam's tap lands only in Sam's learner_event_log;
  relaunch opens the home person; "Show the list" -> launch list; Remove
  Sam -> file gone).
- Left: remove has no second PIN prompt (Settings itself asks on every
  open); rename a person; sync states.

**2026-10-14 (E2 — add a word + the Library):** in Edit mode an adult adds
a word the way the web does: "Add a word" (header) -> type -> matches from
the family's words and the catalog (Make always last, the exact match
highlighted, Return takes it) -> the destination chip opens the group
picker (Recent / All groups / "Make a group called ...") -> the word is
placed; tapping an empty group cell files the word into exactly that
cell. Make saves a personal word at once and opens its card ("Added to
..."). The card's "+ Group" and the add toast's "Add to other groups"
open the web's destinations sheet. "All words" opens the Library (Added /
Suggested / All, "Search words", "in ..." subtitles, a row opens the card,
Add a word).

- Scope: LW-2, 3, 4, 12, 16, 18. Not in E2: pictures, voice, pasted lists,
  suggested lists, group rename/delete, the Lifetime door on the free-word
  cap (message only; iOS has no license yet, `s.licensed` is the seam).
- Changed: `scripts/ios/app_library.mjs` (`PIPCORE.lib`, new; `library`
  is taken by shared/library.mjs): addState/addPlace/addMake/addMakeGroup,
  otherGroups/otherGroupsSave, libraryState, placeList/placePick; every
  write is one shared-owner call (placeItem, createEntity, createGroup,
  addToGroups, placeOnBoard). `app_edit.mjs` exports its paint/card/toast
  helpers; `app.mjs` marks anchor/reserved empties `locked`. Swift:
  `AddWordView.swift` (add form, other-groups, place sheet, empty-cell
  door), `LibraryView.swift` (new); one `EditSheets` modifier presents
  card/add/other/place as a single sheet so Make swaps the form for the card.
- Verified: `scripts/ios/app_library.test.mjs` (sync_op rows via a second
  connection); XCUITests `testAddCatalogWordToChosenGroup`,
  `testAddIntoTappedEmptyCell`, `testMakePersonalWordThenLibrary`.
- Left: a new word stays silent (no clip, never device TTS); the on-demand
  mint needs transport, and the card shows no "pending" line yet. The match
  rows' play preview is not built. LW-18 on the home board has no XCUITest
  (grid60 has no empty cell); node-covered.
- Web note: recent groups live in localStorage on the web, per session here.
**2026-10-14 (D3 — per-person voice choice and offline voice packs; BS-23, BS-25):**

- Scope: Settings -> Talking -> Voice picker (web `voice-ui.js` words, Hear it, Use this voice, Works offline, Coming soon) and downloadable voice packs. Pip bundled; Leo/Mia/Sam/Zoe/Tom download on choice from the web's own static URLs (`/sw-audio.json` + `/audio/...`, free files, no synthesis).
- Changed: core `scripts/ios/app_voice.mjs` -> `PIPCORE.voicepick.{voiceModel,voiceSample}` (over `shared/voices.mjs`, `profile.mjs`, `voice.mjs resolveSlot`); the choice is `appSetSetting("preferred_voice_id")`, written only after the pack verified. Swift: `Core/VoicePacks.swift` (staging -> verify -> atomic swap, `.complete` sentinel, excluded from backup, resume, update replaces only after verify), `VoiceSettingsView.swift`; `PipAssets.clipURL` falls back to packs; `PipSpeaker` plays `file` preview slots and traces played paths under `-PipTraceAudio`; `AppModel` gained `setSettingAwait`/`coreValue`.
- Verified: file names are the first 12 hex of SHA-256 of the bytes, so every file is verified. `app_voice.test.mjs` (built core in vm; DB re-read); `VoicePacksTests` (URLProtocol stub: interrupted download leaves no active pack and resumes without refetching, tampered file rejected, failed update keeps the old pack); `VoiceUITests` (loopback server with a 41-clip Mia slice: progress -> in use -> tap word -> played path is inside `VoicePacks/voi_mia_en/` -> setting on disk -> relaunch with server gone, still Mia). Manual `testRealDownloadOfOneVoice`: Sam, 1087 files, 18,142,519 bytes, 9.1 s (served locally from public/, see below).
- Pack sizes (sw-audio.json): Pip 13.2 MB (bundled), Leo 17.3, Mia 18.3, Sam 18.1, Zoe 16.4, Tom 16.5; 1087 clips each.
- Found: production app.pipaac.org 404s 4 clips per voice that sw-audio.json lists (colors, goodbye, gross, okay) until the next deploy; the strict download correctly fails on it. Real-network download therefore only works after a deploy.
- Left: the 040 paid-voice lock (native has no license state yet); update check runs only when the picker opens; BS-24 expressive faces.

**2026-10-14 (C3 - link this iPad, sync both ways for real):**

- Scope: SY-2 (type a code), SY-3 (offer a code), SY-4 (verified by the E2E), SY-15 (stats days). Not in C3: accounts, recovery card, media, device list/removal, rotation UI, buying Lifetime.
- Changed: `scripts/ios/app_pair.mjs` (`PIPCORE.pair.offer/join/offerCancel/joinCancel`; the web's `pairClient`, `relayClient`, `wrapUserKey`/`unwrapUserKey`, `putUserKey`, `recoveryProof` run in the core; crypto comes from `host/sync_crypto_host.mjs` because build_core only swaps imports of `public/shared/` importers). Mirrored from `devices-ui.js` (no shared module holds them): `ensureUser` ~L101, `offerFlow` ~L824, `joinFlow` ~L694, `waitForGrant` ~L760; the free-limit check uses the relay's `entitlement` answer (no license-copy handling). `app.mjs`: `appRepaint` hook, `refreshStatsDays` after Play. `app_sync.mjs`: stats refresh once the loop is up. `PeopleRegistry`: `sync` kept whole (sync.mjs adds keys), `patch` (atomic), `addLinked`, `rowJSON`. `LinkDevices.swift`: Settings -> "Team & devices" (Join with a code / Add a device, web copy), host install, `sync.applied` -> `appRepaint`, scenePhase -> `notifyVisible`, network monitor. Base URL `https://app.pipaac.org`; `-PipBaseURL <url>` overrides (tests); `Config/ATS.plist` allows local networking only. Fixes in C2 code found by the E2E: `key.unwrap` rejected grants with non-string extras (`epoch`, `keys`); `PipHost.call` raised a TypeError when a scene signal arrived before the bundle was evaluated.
- One loop per process: sync.mjs keeps a `running` singleton with no stop (the web reloads the page to switch people). A second linked person opened in the same run stays local until relaunch; the syncing person's db handle is kept open on switch. Needs a stop in sync.mjs to fix (not edited).
- Verified: `scripts/ios/e2e_sync.sh <udid>` - local Worker (`npm run dev:agent`), `e2e_web_peer.mjs` (real sync.mjs + sync_crypto.mjs in node, own node:sqlite db), `SyncE2ETests` (XCUITest) both-ways + offline catch-up; dumps of all SYNCED_TABLES from the node peer, a third node device and the iPad's SQLite file (read by `e2e_dump.mjs`, not the app) are identical. `app_pair.test.mjs`, `PeopleRegistryTests`.
- Left: Lifetime purchase for the 2nd device (free = one device, shown as the web's message); device list; rename a person; E2E latency is polled at ~50 ms by XCUITest.



**2026-10-14 (E3 — photos and voice for a word):** the word card gains the
web's Picture row (Photo: Take a photo / Choose a photo; "Use our picture"
when a catalog word wears a family photo) and Voice row (board voice /
Your voice / Record your voice -> Stop · 0:07 -> plays back once -> "Your
voice plays for ..." with Undo; "Again" re-records). Settings > People
shows the open person's photo (Add / Change / Remove).

- Scope: PP-4, PP-7, PP-8, LW-19 (recording part). Not in E3: finder and
  Draw it (PP-1..3), bulk photos, media upload/download (PP-9), voice mint.
- Changed: `scripts/ios/app_media.mjs` (`PIPCORE.media`: cardSetPhoto,
  cardUseOurPicture, voiceSave, voiceChoose, personPhotoSet; `mediaFor`
  rides on the card model). Every write is the web's owner
  (setImageOverride / setEntityPhoto / voice.setOverride / clearOverride /
  setProfilePhoto). Swift: `Core/PipBlobs.swift` (blob store = the sync
  host's folder, file name = SHA-256 of the raw bytes, key `blob:<sha>`;
  `-PipDataDir` now moves it for tests), `PhotoPickerView.swift`,
  `VoiceRecorder.swift` (injectable capture source; mic open only between
  Record and Stop), `MediaModel.swift`; `PipSpeaker` plays `blob:` clips;
  tiles/strip/bar/library draw `blob:` photos; Info.plist camera and
  microphone descriptions.
- Web formats found: photo = the picked file's raw bytes, no resize, no
  re-encode, no size cap (`db.js savePhoto`); recording = MediaRecorder's
  default (Chrome webm/opus, Safari/iPad MP4/AAC), no length cap; both
  stored as `blob:<sha256 of raw bytes>`, type sniffed on read
  (`mediatype.mjs`). iOS writes upright JPEG (long side <= 1600) and
  AAC .m4a (the Safari format) - both read by the web.
- Verified: `scripts/ios/app_media.test.mjs`; XCUITests
  `MediaUITests.testPickPhotoForAWordSurvivesRelaunch` (real PhotosPicker,
  blob on disk under its hash, relaunch), `testRecordAVoiceForAWord`,
  `testPersonPhoto`. The photo tests need a known image in the sim library
  (`xcrun simctl addmedia <udid> <png>`; the picker is tapped by position,
  first cell).
- Left: sync upload/download of these blobs (PP-9). Gap for that slice: a
  recording made in Chrome is webm/opus, which AVAudioPlayer cannot play -
  needs a decision when media sync lands. Real camera and microphone not
  exercised (simulator); the capture seam is tested. Entity photo "replaced"
  picture-learning note (web `replaced()`) is not recorded.

**2026-10-14 (C4 - switching people restarts sync; photos and recordings travel):**

- Scope: SY-6, PP-9, PP-10 plus the person-switch gap C3 left. Not in C4: a media upload/download progress screen; transcoding legacy webm recordings.
- Part 1 - `stopSync()` (`public/shared/sync.mjs`, exported, web does not call it): closes the socket, cancels every timer/debounce, gives an in-flight flush/ingest a bounded moment (default 5 s), then fences the rest out with the existing ticket. Pending ops stay pending (resent by the next start; relay dedupes by op_id), the cursor only moves with applied+saved ops, the media queue stays in the key store. A new `initSync` waits for a stop in progress. Handle also gained `pullBlob(sha)` (the lazy fetcher's pull, but errors surface so 404 is told from unreachable). iOS: `PIPCORE.sync.syncStop` -> event `sync.stopped`; `AppModel.open` stops the loop, closes the old file, opens the next person, starts their loop (`stopSyncLoop`, `startSyncIfLinked`).
- Part 2 - media: `scripts/ios/app_mediasync.mjs` (`PIPCORE.mediasync`): after every applied batch it pulls each referenced `blob:` sha that is not on disk (one at a time, through the loop's `pullBlob`: open + hash check against the requested sha), backoff retry 2 s..30 s; `queueUpload(key)` is called by E3's writers (`cardSetPhoto`, `voiceSave`, `personPhotoSet`) so an iPad photo/recording leaves promptly (the web's own queue/`reconcileBlobs` still covers anything missed). Swift: `blob.save` re-checks SHA-256 == file name and writes atomically (a file under its hash name IS available offline), new `blob.has`; `MediaSync.swift` (`media.ready` repaints tiles; `media.state` -> Team & devices line `team:media`: "Getting a photo or recording..." / "Sending..." / "A photo or recording hasn't arrived yet" / "Couldn't save a photo or recording"). Tiles keep the web's honest fallback (name + colour until the bytes land). Recording that cannot sound: bytes missing -> toast "This recording hasn't arrived yet."; bytes present but undecodable (webm/ogg) -> toast "Can't play this recording here." Never silence, never device TTS.
- Chrome recordings: new recordings are portable at the source - `word-card-voice.js` asks `MediaRecorder` for `audio/mp4;codecs=mp4a.40.2` / `audio/mp4` when `isTypeSupported` (`mediatype.mjs pickRecordingType`; webm only as the last resort; test `src/board/recording_type.test.mjs`). Legacy webm blobs still reach the iPad and show the honest state. Options for them (the relay only holds sealed bytes, so a Worker-side transcode is impossible): (a) a one-time web-side conversion with WebCodecs (AudioDecoder opus -> AudioEncoder AAC -> new blob + set_override op) when a Chrome device next opens the word, ~1 day, no iPad change; (b) on-device decode with libopus + libwebm (Swift package, ~0.4 MB) into AVAudioEngine, ~2-3 days, covers Firefox and old takes without a desktop; recommend (a).
- Verified: `scripts/test.sh src/board/sync_reliability.test.mjs` (4 new stop tests: start->stop->start another person->back with each person's ops on their own relay; armed timers never fire after stop; stop during a hung flush loses nothing and the next start resends; stop mid catch-up leaves the cursor); `scripts/ios/e2e_sync.sh <udid>` (local Worker behind `scripts/ios/e2e_proxy.mjs`, node web devices): both-ways, offline, **media** (peer sets a 68 KB photo, a recording and a webm take; the proxy cuts blob downloads mid-body; the iPad shows "Getting a photo or recording...", no file under the hash name; relay back -> file hashes to its name (shasum, read by the harness), tile draws the picture, tap plays the recording (file the speaker opened), webm tile says "Can't play this recording here."; the iPad's own photo and recording reach the peer, which pulls both by hash and opens them) and **two-people** (second linked person syncs without relaunch; 3 switches; edits made while a person was stopped arrive on switch; all four dumps IDENTICAL). `MediaHostTests` (blob.save refuses wrong-hash bytes).
- Fixed on the way: `scripts/ios/app_pair.mjs` used `pollPair` without importing it (main, c2060645) - pairing failed with "Can't find variable: pollPair".
- Left: a legacy-webm conversion (above); no per-file progress UI; `onOnline/onVisible` listeners from a stopped loop stay registered but inert (platform.mjs has no unsubscribe).
### D4 — the sentence buttons and the cloud voice (2026-10-14)

- Scope: SN-2, SN-6, SN-7, BS-6, BS-10, KB-8. SN-9 stays the web's client
  behavior: no pre-check; the Worker's `bad_license` gets the once-per-
  session toast ("... comes with Pip Lifetime - the free trial has ended.");
  the purchase door and the trial-countdown nudges are slice F.
- Changed: `scripts/ios/app_say.mjs` (`PIPCORE.say`: identify, transform,
  speak, tapSpeech, speakStart, tileEnsure) is `speech.js`
  transformAndSpeak / speakSentence / speakItem(tileclip) / tileApi.ensure /
  refreshTrial running over the web's OWN clients, unchanged: `txbar.mjs`,
  `name_shield.mjs`, `voice_sentence.mjs`, `voice_tile.mjs`. `jsc_shims.mjs`
  gained `Blob`, `Response.blob()`, Cache Storage (`caches`, files behind
  host op `cache`) and same-origin relative `fetch`. Swift: `SayBar.swift`
  (press -> core, one "say" host event back), `Core/PipHostCache.swift`
  (cache files, persistent, follow `-PipDataDir`). `app.mjs`: ▶ and the
  transform moved to `say`; `appSpeak`/`appTransform` removed; Enter,
  tile-library taps and typed-word commits route through `say`.
- P6: an outcome arrives as an event only if still wanted. `speakSeq` (newest
  speak owns the audio), `tapSeq` (a newer tap retires a pending tile
  fetch), the web's `sourceText` staleness check, and an AbortController
  deadline (15 s transform, 10 s sentence voice). As the web: a stale reply
  changes nothing on the bar, the press still speaks the CURRENT bar, and a
  bar that changed mid-speak is re-spoken - the abandoned reply's text is
  never sent to the voice nor played.
- Hermetic UI runs: a launch with `-pipUITestReset` or `-PipDataDir` and no
  `-PipBaseURL` points the relay at a refusing loopback port, so no test can
  reach production (the core then takes its honest offline path).
- Verified: `scripts/ios/app_say.test.mjs` (the BUILT core in a bare vm
  realm; fake Worker + host; asserts the requests sent: masked text, exact
  body keys, no license key when none stored, the cache file that plays, the
  stale/late/stalled/offline/not-entitled paths, tile mint and overtaken
  tile tap); XCUITests `SayUITests` against a stub Worker in the test
  process (fix -> bar + played file bytes; late ⏪ reply discarded and the current bar spoken; offline
  toast; typed word minted and spoken).
- Left: face-button feelings (`speakFeeling`), trial-countdown nudges and the
  Lifetime door (F), tile prefetch of entity names on boot (the family-name
  mint at add/rename belongs to the word-card slice), media sync of cached
  clips. (The web bug `voice_tile.sweepReplaced` dropping `trial` was fixed
  separately: `fix(voice): replaced-clip sweep runs for trial users too`.)

### E5 Help (HP-1..4)

- Scope: HP-1 read answers, HP-2 search (device, then by meaning), HP-3
  Write to us, HP-4 Show me / Settings hits open the right Settings row.
- Changed: `scripts/ios/app_help.mjs` (`PIPCORE.help`: load, home, search,
  meaningPath, writeCopy, writeItem, writeStatus, outboxPush; `ROUTES` maps
  web `sec/at` targets to native row ids). Search is the shared
  `help_search.mjs` (`localHits` + `mergeHits`). `bundle_assets.mjs` now
  ships `help.en.json` (the web's derived index) and
  `help/answers.en.json` (the authored truth). Swift: `HelpView.swift`
  (model, stubbable network, views), `ParentGate.swift` (reusable
  `.parentGate`), `SettingsView.swift` (Help row, search box above the
  list, `.settingsRow(route, focus)` ids + highlight, `NavigationStack(path:)`
  so Show me pops back and scrolls to the row).
- Behaviour: Show me and Settings hits exist only for rows that exist
  natively (voice, speed, grammar help, sentence bar, keyboard, cells, PIN,
  research, edit board, people, team); other answers have no button, as the
  web hides a Show me whose row is not shown. The web's offline outbox
  (<= 10) is kept in UserDefaults and flushed on reconnect / Help open.
  The only outside link in Help (`mailto:hello@pipaac.org`) is behind
  `ParentGate` (type three spelled-out digits); the web has no gate.
- Verified: `scripts/ios/app_help.test.mjs`; `HelpUITests` (offline
  "voice" -> body text equals answers.en.json -> Show me lands on the lit
  voice row, no Worker call made; "emotions" with a stubbed Worker shows
  its hit and the stub saw `/api/v1/help/search?q=emotions`; Write to us
  body read from the stub = message, email, 6 details keys; Settings
  search box; parent gate refuses wrong digits). The Worker is stubbed
  in-app (`-pipUITestHelpStub <dir>`); no production call from tests.
- Left: sentence-button glyphs (sparkle etc.) in answers render as the
  emoji, not the web's drawn icons; "Replay the tour" has no native tour;
  "Pip Lifetime" detail now follows the plan (F1);
  "This device" detail is always "the user's own".


**2026-10-14 (C5 - supporter accounts with passkeys, and the recovery card):**

- Scope: AC-1, AC-2, AC-3, SY-9, SY-10, SY-13. Not in C5: account deletion (AC-10, slice F), supporter invites, "Your name", Lifetime purchase.
- Changed: core `scripts/ios/app_account.mjs` (`PIPCORE.account.sendLink/land/shareBack`) and `app_recovery.mjs` (`PIPCORE.recovery.card/replace/restore`). `account.mjs` (`requestLink`, `claimToken`, `accountCredentials`, `importAccountUsers`, `shareUserToAccount`), `recovery.mjs`, `rotation.mjs`, `sync_client.mjs` run unchanged. Mirrored from closures: `accountLanding` devices-ui.js ~L369-436 (+ share-back), `joinWithToken` ~L444, `registerAccount`/`signInAccount` account.mjs ~L121/L140 (the ceremony is Swift's), `showCard` recovery-ui.js ~L84-181, `replaceCard` ~L187, `doRestore` ~L195, restore `run` ~L255, `ensureUser` devices-ui.js ~L101, `userClient` ~L824. Host: `account.create` / `account.open` take a PRF HANDLE (`{__pipPrf}`), the account private key comes back as an ECDH handle - neither the PRF nor the key bytes enter JS (`PipHostAccount.swift`; the web-shaped `account.gen/seal` verbs are not used). Swift: `PipPasskeys.swift` (ASAuthorizationPlatformPublicKeyCredentialProvider, rpId `pipaac.org`, PRF extension, iOS 18 API), `AccountFlow.swift`, `AccountViews.swift` (Settings -> Your account, Settings -> Backup & privacy, card sheet, restore sheet), `CardKit.swift` (QR, the card image = QR + 12 words at the web's 640 x 864, QR read-back with Vision then CIDetector). Shim: `fetch` resolves "/path" against `location.origin`; `platform_host` gained `kv`. `PeopleRegistry`: `addImported`, `cardShownAt`. Info.plist: Photos add-only string ("Pip saves the recovery card to your photos only when you tap Save image."), camera string now also names card scanning.
- Worker change (needs a deploy, not done here): `src/worker/webauthn.mjs assertionOrigins` + `index.js` - a native assertion's clientDataJSON origin is `https://pipaac.org` (Apple uses the rpId), the web's is `https://app.pipaac.org`; the verifier now accepts both. Without this deploy a real iPad sign-in is rejected with `bad_origin`. Unit-tested in `webauthn.test.mjs`.
- Verified: `scripts/ios/app_account.test.mjs` (12 tests; built core in a bare vm; software ES256 authenticator builds a real attestationObject and a real signed assertion with its own PRF; fake Worker records requests and checks the assertion with the REAL `verifyAssertion`; second "iPad" with the same passkey gets the first one's user key byte for byte; no-PRF locked path; add-passkey path; cancel makes no second passkey; web-sealed `node.json` accountPriv opens with its PRF and not another; restore by words/link/hyphens/typo/not-a-card; card words/link; "another device cannot show the card"). `AccountHostTests` (Swift: PRF handle never carries bytes yet opens the web-sealed account key; wrong PRF fails; create -> seal -> open; the saved/printed card IMAGE decodes to the card link). E2E on the local Worker (`scripts/ios/e2e_sync.sh`): `testRestoreFromWords` (fresh install, words typed, peer's rename + setting arrive, the card on the iPad shows the SAME 12 words, Replace card against the real relay gives 12 new words, dumps IDENTICAL), `testRestoreByScanningTheCard` (QR image fed through `-PipScanImage`, same checks), `AccountUITests` (link request -> Worker -> claim -> reaches the passkey step; the simulator then fails cleanly and stays signed out). The script now writes `ENVIRONMENT=development` into the generated `.dev.vars` so the account scenario can read the Worker's dev mailbox.
- Found: on the simulator the ceremony fails with "Application with identifier LP5YNK7A36.org.pipaac is not associated with domain pipaac.org" - expected for a development-signed build (Apple's AASA cache). For the device run, enable Settings -> Developer -> Associated Domains Development, or use TestFlight/release signing.
- Web notes (not fixed): the emailed link opens `https://app.pipaac.org/?signin=` in Safari, not the app - the app takes the pasted link (an `applinks:app.pipaac.org` entitlement + AASA `applinks` is the follow-up and needs a site deploy). The web's `getPasskey` failure path creates a new passkey even when the person cancelled; the app does not (cancel stops). `renderAccount` hides sign-in on the person's own synced home device (mirrored). `restoreFlow` refuses when the open person is already linked (mirrored; on iPad it checks the open person).
- Left: restore's "moved" notice (web sets `pip_restore_moved`; nothing shows it yet); account deletion and "Your name"; offline card print is wired (`PipHost.isOnline`) but untested; the copy "Unnamed never needs an account" uses the person's registry name; PRF salt hashing (WebAuthn prefix) assumed identical to Safari's - the manual script is the proof.
- MANUAL passkey script (real iPad, production `app.pipaac.org`; use a test email; delete the account after - Settings -> Your account on the web). Needs the Worker deploy above and a build whose entitlement domain is trusted (TestFlight or Associated Domains Development).
  1. On a Mac in Safari/Chrome open `https://app.pipaac.org`, Settings -> Your account (needs a synced person), Email me a sign-in link, open the email, create the passkey (iCloud Keychain). Note the person it shares.
  2. On the iPad (fresh install, or Settings -> Your account): type the same email, Email me a sign-in link, open the email in Mail, press and hold the sign-in link, Copy, paste into "Paste the link", Sign in. Expected: "Sign in with your passkey…", one Face ID, then "1 user(s) added." and the person's board opens from People. This proves the SAME passkey and the SAME PRF bytes opened the account key the web sealed (if PRF differed, the line says "1 locked until an Allow or QR card brings their keys").
  3. Reverse: on the iPad sign in first with a NEW email (creates the account, "Signed in."), and share a person (a linked person is shared at sign-in). Then on the Mac open the emailed link for that email and sign in with the iCloud passkey: the person must appear in the web's People list (unlocked, not "locked").
  4. Cancel Face ID on the sheet: the line must say "Sign-in was cancelled." and no second passkey appears in iCloud Keychain.
  5. Settings -> Backup & privacy -> Make the recovery card: compare the 12 words with the Mac's card for the same person; Save image lands in Photos (permission prompt names the card); Print opens the print sheet.
  6. Delete the test account on the web.

**2026-10-14 (F1 - buy and restore Pip Lifetime; App Store notifications into `entitled()`):**

- Scope: PU-3, PU-4, PU-5, PU-6, PU-7, PU-8 (doors), PU-10. PU-2 nudges followed in a separate commit (app_say.mjs nudgeFor, the web's words, once per mark, device-local). Not here: PU-9 (excluded), account deletion / invites (rest of F).
- Product: consumable `org.pipaac.lifetime.user` ("Pip Lifetime for one user"), ONE constant in `src/worker/appstore_product.mjs` (with bundle id `org.pipaac`); the Worker imports it, the core exposes it (`PIPCORE.purchase.productId()`), `apps/PipAAC/StoreKit/Pip.storekit` carries the same string (node test asserts all three). The purchase carries `appAccountToken` = the person's id.
- Worker (NOT deployed - PM deploys): `src/worker/appstore.mjs`. `POST /api/v1/appstore/redeem {jws, user_id}` and `POST /api/v1/appstore/notifications` (V2). JWS verified with WebCrypto over a small DER reader: ES256 signature by the leaf, every x5c link signed by the next, top = bundled Apple Root CA - G3 (sha256 asserted), Apple's marker OIDs on leaf/intermediate, validity at the transaction's `signedDate`; no secret. Checks bundle, product, environment (Production + Sandbox), `appAccountToken == user_id`. Grant goes to the user's relay `internal/appstore` (relay.js), which writes the same `entitlement` meta Stripe and codes write; ledger `apple_txns` by originalTransactionId: replay grants nothing; a refund before the redeem blocks the grant; REFUND/REVOKE revoke only if that transaction's grant is the license source (a Stripe/code license survives); REFUND_REVERSED restores; other types logged. `entitled()` unchanged - it reads the relay. Checked the real Apple WWDR G6 intermediate verifies against the bundled root with this parser (the leaf and a live JWS need a real purchase: founder TestFlight/sandbox run).
- App: `Core/PipLifetime.swift` (StoreKit 2 client, `Transaction.updates` listener started at launch, unfinished sweep, `LifetimeModel`: finish only after the Worker confirms or says 410 refunded; duplicate-safe), `Purchases.swift` (core bridge), `LifetimeView.swift` (page, Settings row, sheet, doors), core `scripts/ios/app_purchase.mjs` (`PIPCORE.purchase`: web copy model, relay entitlement reconcile as `devices-ui.js reconcilePlan`, redeem, code redeem, Hear the difference). `app_pair.mjs` exports `ensureRelayUser` (the purchase links the person like the web). Doors: Make-when-capped, toasts and the second-device refusal show "See Pip Lifetime"; Help's "Pip Lifetime" detail is real. `demo-sentence.mp3` added to the bundled assets.
- Verified: `src/worker/appstore.test.mjs` (9; test PKI injected via `APPSTORE_ROOTS`, production root asserted real), `scripts/ios/app_purchase.test.mjs` (5), `PurchaseTests` (StoreKitTest: gate before any purchase; finished only after Worker 200 - StoreKit's own unfinished queue; revoked-before-redeem grants nothing; refund reflected on next Worker read; other device's person left alone; restore), `LifetimeUITests` (real app/core/crypto against a stub Worker: gate, purchase, ownership survives relaunch, refund after relaunch, code, second-device door). StoreKitTest finding: it refunds only still-unfinished consumables, and a refunded finished consumable does not reach `Transaction.updates`, so refund truth is the Worker (notification + next read), as designed.
- Left / watch: the real Apple sandbox run (founder gates below); price tier (Apple has no $49.00, `.storekit` uses $48.99; the page shows the store's price on the button and "$49 once" in the lede like the web); PU-2 nudges; `CONSUMPTION_REQUEST` notifications (needs the App Store Server API key) are only logged; web quirk: `/api/v1/trial` answers `licensed:true` for a refunded user's still-valid token (the relay flag is only checked by `entitled()`); the iPad reconciles via the relay.

**2026-10-14 (F2 - team roles, invites, removal with rotation, devices, deletion):**

- Scope: AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, SY-7, SY-8, SY-14. Gating: all of it sits under Settings, so the Settings PIN (B3) already passed; destructive taps use the web's confirm words (Swift confirmationDialog / the "Delete this user?" sheet).
- Changed: core `scripts/ios/app_team.mjs` (`PIPCORE.team.refresh/act/resume/followMyName`, one named-action dispatcher; every action ends in a fresh `team.state` model). `rotation.mjs` (`completeRemovalRotation`, `resumeSupporterRegrant`), `account.mjs` (invites, grant, revoke, `deleteAccount`), `team_names.mjs`, `sync_client.mjs` run unchanged. Mirrored from devices-ui.js closures (ranges in the file header): renderDevices L161, renderEntitlement L264, rotateAfterRemoval L294, removeDeviceFlow L300, renderAccount L322, acct-delete L339, buildUserGrant L473, renderSupporters L493, allowInvite L571, regrantOps L593, removeSupporterFlow L606, sup-invite L624, dev-delete/undelete L1016, team-name-ui.js. **The iPad did NOT register `setSyncAccountOps` before; it does now** (`regrantOps` at core load; `app_sync` hands the loop's base URL to `noteBase`), so a journalled regrant drains on every sync recovery after a relaunch. Swift: `TeamFlow.swift` (events -> state, toast), `TeamViews.swift` (Team list, device list, Delete from Pip + sheet, Your name, Delete your account), small hooks in `LinkDevices.swift`/`AccountViews.swift`/`SettingsView.swift`/`AppModel.swift`; `UITestHooks.seedAccountIfRequested` (`-pipUITestSeedAccount <file>`) because the simulator cannot run a passkey ceremony. One line of copy the web lacks: the pending-regrant note ("Finishing the new key for your team...").
- Verified: `scripts/ios/app_team.test.mjs` (14; built core in a bare vm, fake Worker that enforces the relay's owner-only rule and records requests: invite/Allow bodies and that the supporter's account key opens the grant byte for byte; Make owner/team incl. 409 and 403 words; a Team screen has no owner buttons and the relay refuses direct calls; removal order cascade, revoke, rotate, regrant, new epoch = card-root derivation; regrant killed mid-way leaves `regrant/<id>` and the next drain finishes it; no session means the journal waits; device list/label/remove + rotation; delete + undo; delete account; names + "Your name" op). E2E `team` scenario (`scripts/ios/e2e_sync.sh`, LOCAL Worker, node peers in `e2e_team_peer.mjs`, `TeamE2ETests`): owner = the iPad; supporter 1 invited by email, accepts, Allowed, syncs the person's word; the RELAY answers 403 `owner_only` to that Team member, 200 once made owner, 403 again once back to Team; a second device joins by the iPad's code; supporter 2's name shows instead of the email; delete cloud data, device 2 reads `delete_at` (~30 days) from the relay, Undo clears it; supporter 1 removed with the proxy cutting the regrant leg, journal + on-screen note, app KILLED, relaunch drains by itself (supporter 2's account bundle: epochs [1] while cut, [1,2] after, and the new key opens a post-removal op); the removed supporter gets 403 from the relay and its epoch-1 key opens an old op but NOT the post-removal op; device 2's post-removal edit reaches the iPad; iPad/device 2/supporter 2 dumps IDENTICAL, the removed supporter's differs; device 2 removed gets 403; account deleted: the Worker answers 403 to the old session and lists no passkey.
- Web notes (not fixed): removeDeviceFlow's confirm prints the raw device id; the app prints the device's name. The web has no manual "name this device" (auto-label only when empty) - mirrored. The Team list is hidden until the person is linked (a card or first device does it). A paired owner (no recovery root) that removes someone only flags `rotate_min_epoch`; the root holder rotates and owns the regrant journal, which needs a signed-in session on that device - mirrored. On a person's own synced home device the web hides the account sign-in row, so after "Delete your account" the screen reads "Sign in on a supporter's device", not "Not signed in." (mirrored).
- Left: the invitee's side on the iPad (`inviteLanding`) needs the emailed link opened in the app (applinks follow-up from C5); the real passkey sign-in is still the manual C5 script; per-device rename UI. No Worker change.

- F2 fix to F1 code (found by the full E2E): `app_purchase.mjs sync` linked the open person to the relay on EVERY open (`ensure` -> `POST /users`), so a fresh install was already a relay user before it could Join with a code, Restore from a card, or sign in - every C3/C5 E2E scenario failed at its first assertion on main. A refresh now only reads when the person is already linked; linking stays on a user action (card, first device, invite, purchase, code), like the web's `ensureUser`. All 9 `e2e_sync.sh` scenarios pass after it. Layout note: the Team list sits below Devices on the iPad (the form is a lazy list; "Add a device" and the sign-in form stay where the older tests expect them).

**2026-10-14 (D5 - live modeling and the Spotlight glow on the board):**

- Scope: SY-5, SP-1, SP-2, SP-3, SP-4, SP-5, BS-26. Out: the Spotlight page (SP-6..10), Spotlight settings (ST-8).
- Changed: core `scripts/ios/app_spotlight.mjs` (`PIPCORE.spot`: `bind/unbind/tick/applied/end`, `onLive`, `childTap`, `modelTap`, `controlPress`, `state`) over the web's `shared/spotlight.mjs` + `shared/sync.mjs` unchanged; it holds what `spotlight-layer.js`/`coach-ui.js` keep in closures (4 s modeled fade, 700 ms echo, counts, tip, 30 s expiry tick) and returns ONE render model (`state(appId, keys)` = the web's `layerMark` class for class, Groups-anchor walk, ✨/❓ rings, chip text, supporter line/count). `app_sync.mjs` routes `onModel` and `onApplied` into it (the old `sync.model` event is gone; `spot.changed` replaces it). Child taps now pass `spotlit` and send the `{k:"tap"}` frame from `appTap`, `appKbPress`, `appKbPartner` and `say.transform` (before D5 the iPad logged every press as un-glowed). Swift `Spotlight.swift` draws the web's look (`--glow #e8a200`, 4 pt ring + 18 px halo, dim 0.45 from `spot_dim`, optional 2 s pulse, 6 pt/1 s modeled ring that overrides the dim, count badge, End chip, the dark line bar where the suggestions were); hooks in `AppModel` (`spot`, `bindSpot`, tap/transform route to modeling on a supporter's device), `BoardView` (marks, Groups/✨/❓ rings, chip, ModelBar), `LinkDevices` (events). Cells expose accessibility values `glowing | dimmed | modeled`. Live modeling writes nothing: asserted by a before/after dump of every synced table and the op count.
- Verified: `scripts/ios/app_spotlight.test.mjs` (11; built core in a bare vm + fake relay with live sockets: model lights exactly one cell and fades, nothing written; remote session glows/dims, supporter-started stays plain, ✨/❓ + Groups; restart survival; midnight and an old row's timer; End chip op; child taps arrive as sealed frames with the session start and are logged lit/unlit; supporter side: model frame, tip, counts per session). E2E `spotlight` and `spotlight-supporter` (`SpotlightE2ETests`, node peer with the real `sync.mjs`/`spotlight.mjs`): glow/dim read from cell accessibility values; kill + relaunch with the relay dead keeps the glow; the PEER reads the iPad's three taps off the relay (with this session's start) and the supporter-iPad's model frame; "lit when pressed" read from the iPad's SQLite file; End chip reaches the peer as `spot_end`; dumps identical. Screenshots `/tmp/pipaac-shots-d5/`.
- Web notes (not fixed): the supporter's ✨/❓ modeling press only works when the sentence bar has words (the buttons are disabled when it is empty). The coach counts live in `kv` (localStorage) so they survive a reload; on iPad they are memory-only and reset on restart. Goal-word Nest emits (`maybeEmitGoalWord`) are not wired on iPad (no Nest on iPad yet).
- Left: Speak-on-model (`model_speaks`) is wired (`spot.speak` -> speaker) but its setting row is ST-8; partner counts do not survive an app restart.

### E7 First run: the welcome, "their world", the demo tour (2026-10-15)

- Scope: PF-2, PF-3, PF-4, SN-11. Not here: ST-9 "Replay the tour" Settings row (SettingsView is E4's) - `FirstRunFlow.replayTour()` is the entry point it calls; Settings -> People & places row for the world pass (`PIPCORE.firstrun.worldOpen` + `WorldScreen` are reusable).
- Changed: core `scripts/ios/app_firstrun.mjs` (`PIPCORE.firstrun`: welcome, welcomeSave, setLook/lookOf, worldOpen/Preview/Apply, tourStart/Tap/Transform/End), mirroring onramp-ui.js, setup-ui.js, tour-ui.js (ranges in the file header) over `setup.mjs`, `bulk.mjs`, `person_name.mjs`, `txbar.applyTransform` unchanged. Swift `FirstRun.swift` (flow, welcome, look, world, tour card + ring), small hooks in AppModel (`tourCard`, `wordsOnly`, tap/transform/speak guards, `personOpened`), BoardView (`.tour`/`.tourQuiet`), TileView ("Words only" look: art hidden), ContentView overlay, `PeopleRegistry` (`audience`, `tourDone`), `bundle_assets.mjs` now ships every `ONRAMP_CLIPS` recording. `app_say.mjs` exports `artForWord`.
- Behaviour: first run shows only for a row with `needsSetup` (first boot's home person); leaving the welcome clears it; join/restore/sign-in/Settings-add rows never have it, and a welcome on screen when one opens goes away. The demo follows tour-ui.js CODE: you -> want -> apple (Smart bar) -> ✨ -> ❓ (not ⏪ - its header comment is stale); only the buttons the person has; scripted sentences from shipped clips; the demo's bar is the real bar but nothing is logged, no sentence/impression opens, no Worker call; the real Clear runs at the end like `#clear.click()`.
- Deviation to decide: the web never shows "their world" by itself (Settings only). The iPad packet asked for it in first run, so it follows the welcome with ✕/Skip on every step. One switch: `OFFER_WORLD_IN_FIRST_RUN` in app_firstrun.mjs.
- Tests: UI tests boot to the board unless they pass `-pipUITestFirstRun` (`UITestHooks.skipFirstRun`: hermetic and not asked); `-pipUITestPhotoFile <png>` is the face "picker" in tests.
- Left: tile-clip prefetch for the names typed in the world pass (network; same as E2's Make); picture finding for typed foods/places (`PIPCORE.pics`, E6); "Try other voices" opens Settings (no route to Voice yet); words-only text sizing is one fixed size, not the web's fit-to-smallest.


**2026-10-14 (E6 - pictures and pasted lists):**

- Scope: PP-1, PP-2, PP-3, PP-5, PP-6, LW-5.
- Changed: core `scripts/ios/app_pictures.mjs` (+ `_shared`, `_bulk`; `PIPCORE.pics`) runs the web's `pictureClient`, `picture-fill.js`, `bulk.mjs` and `pictureLine` unchanged and mirrors the closures of `word-card-pictures.js` / `add-flow.js` with line cites. Bytes are fetched by the core and stored as `blob:<sha256>`; writes go through `setEntityPhoto` / `setImageOverride` / `applyPasteRows` / `applyPhotoDrafts`. Results leave as one host event, "pic". Swift: `PicturesModel.swift`, `PicturesView.swift` (Picture row choices, Draw it, Find, paste form, photo names sheet, multi-select PhotosPicker); small hooks in `AppModel`, `AddWordView`, `LibraryView`, `PhotoPickerView`, `LinkDevices`. `jsc_shims.mjs`: a response now has a one-shot `body.getReader()` (the draw client parses SSE). `app_media.cardSetPhoto` tells pics so a photo replacing our pick sends the web's one reject.
- Verified: `app_pictures.test.mjs` (7) and `app_pictures_bulk.test.mjs` (5) on the built core with a fake Worker; `PicturesUITests` (5, in-process StubWorker, board cell accessibility + disk + request log); full xcodebuild suite; full `e2e_sync.sh`.
- Web notes (not fixed): free boards with a started trial get pictures with no license (a3ffc23a; the facade inherits it, tests cover a licence-less find); the paste form reads the allowance once per page and never again; opening a personal word's card runs a find every time; draw stages cannot be live on iPad (host buffers a response), the line says "Drawing...".
- Left: voice mint after a paste (web `tile.prefetch`), photo names from file names (PhotosPicker gives none, names start blank), no picture-sync e2e scenario, parked-offline picture list is in memory only. The "their world" foods and places (E7 `worldApply`) get no picture fill, same as the web (setup-ui.js never calls pictureFill); a card open fills them.

**2026-10-14 (E4 — managing groups, and the Settings the web has):**
Settings is now full screen: a section list beside one page (under 760 pt,
the list then the page with Back) with the web's names and order -
Overview, Words, Board, Talking, Language help, Team & devices, Backup &
privacy - each row's label and help text verbatim, a one-line state under
each section, and a search box over the web's Settings index. Groups can be
created, renamed, hidden, deleted (Undo), reordered and given an icon.

- Scope: LW-14, LW-15, ST-7, ST-4, ST-5, BS-22, BS-21.
- Changed: `scripts/ios/app_groups.mjs` (`PIPCORE.groupsEdit`: createGroupNamed,
  renameGroupTo, setGroupShown, setMealsShown, removeGroup, moveGroups,
  setIcon, iconChoices, countsSet, undoGroups, groupFace) - every write is
  the web's owner (createGroup / renameGroup / deleteGroupUndoable /
  setGroupHidden / moveGroupBlock / setGroupGlyph / setSetting).
  `app_settings.mjs` (`PIPCORE.settingsUi`: hub = sections + summaries +
  checklist + glance, search = `help_search.localHits` over the bundled
  `help.en.json` limited to rows a native page has, nameSet =
  `person_name.nameToProfile`). `app_edit.mjs` paint carries the 30-day tap
  count per home tile while the counts badge is on; `app.mjs` doors carry
  their face and now honor `occasions_visible` (the web hides the meal
  doors with it; native ignored it); `settingsModel.look`.
  Swift: `SettingsView.swift` (shell, search, PIN sheet), `SettingsPages.swift`,
  `GroupsEditView.swift` (editor: New group, row menu Rename / Move to the
  top / Change icon / Hide-Show / Delete, grips), `GroupIconPicker.swift`
  (icon sheet + Settings > Words > Show groups), `TileView.swift`
  (`wordsOnly` environment: pictures leave tiles, strip cards and bar chips;
  count pill), `EditMode.swift` (📊 button, "Edit groups" button),
  `bundle_assets.mjs` (+`help.en.json`).
- Moved rows (existing UI tests updated, nothing else): People, Team &
  devices -> the Team & devices page; Voice, Sentence bar -> Talking; so the
  tests tap `settingsSection:team` / `settingsSection:talking` first. The
  "Occasions in Groups" switch is now the Meals row of Show groups, as on
  the web; "Help improve Pip..." is "Share anonymous counts with Pip".
- Verified: `scripts/ios/app_groups.test.mjs`; XCUITests `GroupsUITests`
  (`testManageGroupsSurvivesRelaunch` create/rename/move first/icon, relaunch,
  db read-back + door icon; `testHideShowGroupInSettings`;
  `testWordsOnlyChangesTheLook`; `testCountsBadgeIsTheChildsOwnTaps` badge ==
  `learner_event_log` count; `testSettingsSectionsOverviewAndSearch`). Shots
  in /tmp/pipaac-shots-e4/.
- Left: the web's extra online icons (library.json) are not offered; Spotlight,
  Progress, Pip Lifetime, Your account, Help pages and the Overview's
  Protect line / win card / tour / update card (no native feature yet); search
  is the on-device pass only (no search by meaning), answers are not searched
  (no Help page), a hit opens its page without highlighting the row; Keyboard
  mode and "Outline likely next words" rows; "People & places" (setup flow).
  The Show-groups switch is a button drawn as a switch: a list in reorder
  mode swallowed a real Toggle's tap in XCUITest. Buttons-per-screen still
  writes `board_layout` directly (no move-cost confirmation; pre-existing).

### Integration of E4 + E6 + E7 + D5 (2026-10-15)

- Scope: make the merged tree whole; wire ST-9 "Replay the tour", Words -> "People & places", and the research upload (ST-6).
- Merge fallout: one test - `FirstRunUITests` read a tile's accessibility value as "family photo"; E4's Words-only look makes it "family photo, words only" (the tile is truthful; the assertion followed). Nothing else failed on the merged tree.
- Changed: Overview has the web's "Replay the tour" (`settings:replayTour`, calls `firstRun.replayTour()` after Settings closes); Words has "People & places" -> "Names, photos, and places" with the web's hint (`settings:peoplePlaces`, `FirstRunFlow.openWorldFromSettings()`; closing it does not start the tour). `-pipUITestFirstRunWorld` is gone; first run still never opens the world by itself. `scripts/ios/app_research.mjs` calls the web's `flushResearch` unchanged at the web's triggers: after a spoken sentence (`app_say`), when the sync loop is up (`app_sync`), and when the switch goes On (`appSetSetting`). Whitelist, research id and off-switch are `research.mjs`'s own; the base is the core's `location.origin` (the relay base, `-PipBaseURL` in tests). `INFOPLIST_KEY_ITSAppUsesNonExemptEncryption = NO` in both configurations.
- Verified: `app_research.test.mjs` (fake fetch, stub base: keys == RESEARCH_FIELDS, one POST per stats_day row, marked reported, none re-sent, nothing when Off); `FirstRunUITests.testReplayTourFromSettings` (tour card returns, `learner_event_log` stays 0) and `testWelcomeWorldTourBoard` (Grandma added from Settings -> Words -> People & places is on the board, in the db).
- Left: the web also flushes at boot (before any speech); on iPad an unlinked device flushes after its next spoken sentence, a linked one when sync is up. Tile-clip prefetch for world names still open (E7).
