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
