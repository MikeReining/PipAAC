# 044 — Native iOS app, through App Store release

**Status:** APPROVED — implementation not started, 2026-10-06.
**Next:** A — code-derived feature inventory and launch/device decisions.
**Architecture owner:** `docs/product/Platforms_iOS_And_Web.md`.
**Current deliverable:** planning only; no native feature is marked built
or proven by this document. The founder requested no implementation or
commit in the document-preparation session.

## 1. Outcome and boundaries

Deliver a native Swift/SwiftUI Pip AAC app with the approved web feature
set, local recordings and native accessibility. A supporter customizes
the user's device from the desktop web app, including pictures and
recordings; the changes persist and work offline on iOS. The web app and
existing backend remain supported.

This phase owns sequence, implementation status and proof. Existing
product owners retain feature semantics; do not copy their rules into
another permanent specification. Retire this file after release and
closeout, with git history as the archive.

Native architecture and clip playback are decided. No web-shell bake-off
is required. Early hardware work verifies the native implementation,
not whether Swift has permission to proceed.

This phase does not authorize new pricing, data retention, off-device
processing, partner listening, location prediction, Personal Voice,
voice cloning, bulk art or voice generation. Existing approval laws
remain in effect. iPhone pocket mode and other proposed features are
not silently added to parity scope.

## 2. Current implementation: entrypoints and reusable owners

Reviewed 2026-10-06. These are starting call paths for the full inventory,
not a claim that every workflow has been audited or proven on hardware.

| Workflow | Working source path to trace | Native/shared boundary |
| --- | --- | --- |
| Open a person and load their words | `public/index.html` → `public/board.js` → `shared/users.mjs` + `public/db.js` → catalog import/migrations | Native registry, on-disk SQLite and persistent media; reuse catalog/schema identities |
| Main board, groups and word taps | `public/board.js` → `board/grid.js` / `board/groups-ui.js` → `tap()` | Native fixed grid and navigation; same sense/form identities and motor rules |
| Word and sentence playback | `tap()` / sentence controls → `board/speech.js` → `shared/voice.mjs`, `voice_tile.mjs`, `voice_sentence.mjs` | Native playback/files; reuse recordings and voice endpoints, no Apple TTS |
| Smart bar and grammar forms | `board/strip.js` → `shared/funnel.mjs`; `tap()` → `shared/forms.mjs` | Port local behavior and consume existing generated answer tables; verify current code, not old prediction prose |
| Sentence transforms and expressive voice | sentence controls → `board/speech.js` → `shared/txbar.mjs` / voice clients → `src/worker/index.js` handlers | Native state/cancellation; keep backend prompts, voice generation and entitlement owner |
| Library, board edits and add a word | `public/board.js` → library/editor/add-flow/word-card mounts → shared domain write functions | Native supporter screens, same write semantics and recorded operations |
| Pictures, photos and recordings | word-card picture/voice mounts → picture client or media save → blob sync | Native pickers/recording and file persistence; existing picture APIs and encrypted user media |
| Link devices, desktop edits and recovery | `public/board.js` → `board/devices-ui.js` / recovery UI → `shared/sync.mjs` → op/crypto/relay clients | Native client of existing encrypted protocol; schema alone does not ensure interoperability |
| Accounts and supporter roles | devices UI → `shared/account.mjs` + `sync_crypto.mjs` → Worker accounts/relay | Native auth and secure storage; preserve encryption, role enforcement and recovery |
| Onboarding, profiles and Settings | `public/board.js` → onramp/setup/people/settings mounts | Native flows; Settings remains the supporter surface |
| Spotlight, modeling and progress | board mounts → shared spotlight/stats/dashboard/report modules; sync live messages | Native attention and reporting; keep local-history versus synced-total boundaries |
| Help and paid features | settings → `board/help-ui.js` / lifetime UI → help/trial/account APIs | Shared answer source/services; native Settings links and StoreKit integration |

`board/` and `shared/` above are relative to `public/`. The generated
catalog and audio package come from existing build inputs; do not hand
edit generated JSON or draw/mint replacement assets for the port.

Feature rules stay in these routed owners:

| Area | Read before implementing |
| --- | --- |
| Board positions, density and presentation | `docs/product/Motor_Grid_And_Art.md`, `docs/product/Core_Coordinate_Map.md`, `docs/phases/014_Grid_Density_And_Fit.md`, `docs/product/Profile_Presentation_Modes.md` |
| Labels, forms, recordings and voice resolution | `docs/product/Language_And_Voice_Schema.md`, `docs/product/Sentence_Bar.md`, `docs/phases/028_Tile_Voice_Library.md` |
| Library, word cards and pictures | `docs/product/Word_Library.md`, `docs/product/Personal_Entities.md`, `docs/phases/029_Add_A_Word.md`, `docs/phases/030_Picture_Finder_And_Drawing.md` |
| Settings, attention and visual design | `docs/product/Design_System.md`, `docs/phases/032_Spotlight_Page.md` |
| Sync, accounts and recovery | `docs/product/Sync_And_Web_Editing.md`, `docs/phases/015_Accounts_And_One_Price.md`, `docs/phases/043_Foundation_Hardening.md` |
| Progress, pricing and Help | `docs/product/Stats_And_Progress.md`, `docs/product/Pricing_And_Packaging.md`, `docs/phases/042_Help.md` |

The Xcode starter uses SwiftUI, a SwiftData `Item`, placeholder tests,
Swift 5 language mode, main-actor default isolation and an iOS 26 minimum.
It is scaffolding. Its build settings are not product decisions.

Before native sync implementation, inspect the current 043 recovery,
replay-anchor and key-rotation follow-ups. Reproduce relevant failures
with web clients first so native work neither hides nor copies a known
protocol defect. Do not block independent board work on unrelated ops
alerting or German vocabulary tasks.

## 3. Ordered slices

Each slice follows `docs/operations/Execution-Playbook.md`: one surface
owner, truth owner, narrow files, concrete Works Test, focused proof and
an honest stopping note. Record actual commands and results when the
runner exists; a planned test is not a passed test.

| Slice | Deliverable | Required proof before advancing |
| --- | --- | --- |
| A | Complete feature inventory, launch matrix, device/OS choice, parity scenarios and build/proof commands | Every observed workflow has a source owner, native disposition and acceptance scenario; unresolved product changes are explicit |
| B | Native catalog/database/audio foundation, first board and groups, observable state and automated build | P1 and P2 below on iPad; domain tests and UI launch checks actually exercise Pip |
| C | Pairing, bidirectional desktop/native sync and media persistence | P3–P5; desktop customization works before the remaining screen port |
| D | Remaining communication features: Smart bar, keyboard, forms, sentence controls, expressive voice and voice/speed settings | Shared behavior scenarios plus P6; online/cloud failure leaves local communication available |
| E | Complete supporter workflows: Library/editor/add/card, pictures/recordings, profiles, onboarding, Settings, Help, Spotlight/modeling/progress | All corresponding inventory rows verified end-to-end; desktop edits and native edits remain compatible |
| F | Account/team/recovery completion and StoreKit purchase/restore integration | Roles, account imports, recovery/card rotation, purchase and revocation cases verified; one backend entitlement truth |
| G | Whole-app hardware acceptance, iPhone/iPad layouts, accessibility, interrupted downloads and upgrades | P1–P9 on the agreed supported matrix; independent measurements meet the recorded acceptance budgets |
| H | Signed release build, TestFlight field testing, store assets/submission and released-app verification | Release-build proof, reviewed store material and a production installation exercise P1, P3 and P7 |

Accessibility starts in B, accompanies every screen slice, and receives
the full hardware pass in G. F's authentication and recovery foundations
must be brought forward when C needs them; the table is not permission
to use insecure temporary identities or postpone recovery until launch.

### A — decisions and executable inventory

- Trace every communication and supporter entrypoint in the current
  checkout. For each row record the gesture, current owner/call path,
  data/API/media impact, native surface owner, slice, proof ID and status.
  Use statuses: planned / implemented / verified on device / released.
- Identify built behavior separately from old proposals, held work,
  gaps and contradictions. Resolve differences against the product
  owner; do not port a bug solely to make both clients match.
- Choose supported OS/hardware, iPhone orientation/layout scope and
  measured performance budgets. Confirm product choices that alter
  reachability or motor layout against the existing owners. Keep older
  compatible AAC devices in the evaluation; iOS 26 is only the template
  minimum. The iPhone proposal is input, not a decided pocket layout.
- Select the SQLite binding, concurrency ownership and default bundled
  audio/art coverage using the real catalog. Record package size and
  missing clips. No replacement audio generation is needed to plan.
- Establish the native build/test commands, simulator and device targets,
  and reproducible asset packaging. StoreKit attribution must respect
  Pip Lifetime's per-user semantics instead of assuming one purchase
  unlocks every user on the device; route unresolved choices to pricing.
- Extract a small shared set of operation, normalization, voice/form and
  sentence scenarios from existing tests. Both clients consume equivalent
  inputs; no new public API or large rules framework is needed for this.

### B–C — first working vertical path

Boot without an account or network into the real board. Persist edits
transactionally with the corresponding outbound operations. A failed
database open must not replace the family's data with a fresh catalog.
Use persistent files for user media and referenced offline clips; caches
are not the only copy of a caregiver recording.

Then pair desktop and native clients through the current protocol.
Interoperability includes signing payload bytes, public-key/signature
encodings, AES envelopes, compression, hashes, key derivation/epochs,
snapshot versions and ordered operation replay. Exercise seal/open and
sign/verify in both directions. Inspect durable tables after reopen;
exclude intentionally local histories from cross-device comparisons.

Reject incompatible protocol versions visibly, preserve pending edits
and resume on reconnect. Complete media transfer and verify content
hashes before declaring a photo/recording available offline. Native
supporter edits must work locally, not depend on the desktop editor.

### D–F — feature completion

Fill every inventory row, including settings that change board density,
presentation, masking, sentence controls or attention. Keep built-in
positions and group/page behavior. Port prediction and form behavior
from the current runtime and generated tables; backend model/prompt
work stays shared. Do not rebuild those services in Swift.

Use native photo selection, recording, authentication and accessible
controls. Keep the existing per-user limits, PIN behavior, ownership and
permission rules. Biometric convenience must not invent a new recovery
or permission model. Backend authorization remains authoritative.

Help answers originate in `src/help/answers.en.json`; native navigation
targets require mapping to native screens rather than copying DOM IDs.
Progress must measure native taps/speech, with the existing privacy
boundaries. Live modeling is an attention event, not a durable board edit.

Complete supporter email/passkey account import and encrypted key access,
QR pairing/restore, invitations, removal and resumable rotation. Spike
native passkey/PRF interoperability early if it blocks C; preserve a
supported existing recovery/pairing route while resolving it.

StoreKit purchase, restoration, duplicate delivery, refund/revocation
and cross-platform entitlement use the existing backend owner. Recheck
current storefront requirements when implementing; do not paste the web
Stripe checkout UI into the app or introduce another entitlement flag.

## 4. Owner-visible Works Tests

Set setup details and acceptance budgets in A. Record device/OS, build,
inputs, observation method and evidence location for each run. UI status
messages and app-written success logs are not proof of the outcome.

| ID | User action and scenario | Independent observable result |
| --- | --- | --- |
| P1 — offline speech | Fresh native install; radios off before first launch; tap built-in words/forms, build a sentence and Speak; repeat after force-quit | Default catalog labels/art render and the expected Pip recordings are audible; no login or initial download required |
| P2 — durable edits | Add/move/rename a word and record it; terminate during a save, then reopen | Reopened tables/files contain the last committed edit or intact previous state, never a partial edit; see the board and hear the recording |
| P3 — desktop customization | Pair a desktop; change a word, group/cell, voice/speed/bar setting, photo and recording while iOS is open; then relaunch iOS offline | The actual native board shows the edits at the intended positions and plays the chosen recording without a reload or network |
| P4 — convergence | Edit offline on both clients, including competing placement and non-idempotent swaps; reorder/duplicate deliveries and interrupt catch-up | Independently reopened synced tables converge under existing rules; local histories stay local; no edit disappears behind an advanced cursor |
| P5 — media durability | Interrupt photo/recording upload/download; reconnect; switch to an empty native install and restore, then go offline | Images visibly match and recordings audibly match the sources; content hashes match; pending files are distinguished from proven loss |
| P6 — speech state | Rapid taps, backspace/clear and repeated Speak; change the bar during a delayed transform/sentence response; interrupt audio and reconnect a route | Audible output follows the current authorized speech request; stale replies do not overwrite words or speak an abandoned sentence; local fallback respects clip policy |
| P7 — recovery and access | Restore via card; import an account; resume interrupted key rotation; remove a supporter; test Owner/Team actions | Authorized clients regain words and media, pending work resumes, removed clients cannot access new protected data and restricted actions are rejected by the relay |
| P8 — native accessibility | Communicate, navigate groups and perform key supporter tasks with VoiceOver and Switch Control; evaluate reduced motion, text legibility and indirect input | A person can complete the tasks with stable focus/scan order and reachable controls; video/device observations document failures as well as successes |
| P9 — release and upgrade | Install a signed build over an older customized build; interrupt a voice-pack update; exercise purchase/restore/refund cases | Words, recordings, keys and pending edits survive; working audio stays available; verified purchases land in the same entitlement owner and revoked grants stop paid access |

For tap-to-sound and cold-launch measurements, use an external recording
or another instrument that observes the actual speaker and display.
App timestamps may help diagnose but do not establish the latency claim.
Use test fixtures, existing clips and persistent paid-service tools;
do not run scratch paid fan-out to verify the port.

## 5. Supporting checks and release gates

- Swift Testing exercises domain behavior and shared scenarios; XCTest
  UI automation exercises user workflows. Simulator checks complement
  physical-device and audible proof.
- A reproducible macOS build/test job and a verified signed release build
  are implementation deliverables. Record the actual commands after B
  establishes them; no native CI job is claimed to exist today.
- Existing focused web checks protect affected shared behavior. Use
  `docs/operations/Testing.md` for runner selection and full-wall approval;
  do not run the full suite automatically after every native slice.
- Browser verification of changed web flows uses `npm run dev:agent`.
  Founder review links use `http://localhost:21087/?reseed`.
- Any changed Worker, `public/` or `site/` surface must be deployed and
  production-smoked under the existing project laws in the same slice.
  Pure native changes use the installed native build as their surface.
- TestFlight distribution and App Store submission need the appropriate
  credentials and user authorization at execution time. This planning
  approval does not publish an app, send invitations or spend on batches.

## 6. Done and retirement

- [ ] Every approved feature-inventory row is implemented and verified;
  any exclusion is a named founder-approved scope decision.
- [ ] P1–P9 pass on the agreed device/OS matrix with preserved evidence.
- [ ] Desktop customization includes durable photos and recordings;
  bidirectional sync, recovery and upgrade compatibility are verified.
- [ ] The released artifact includes the default offline assets and
  preserves referenced media and the family's customized data.
- [ ] Accessibility and measured performance meet the recorded budgets;
  source inspection or self-reported readiness alone is insufficient.
- [ ] Accounts, roles and StoreKit resolve into the existing shared
  product rules; applicable release material has been reviewed.
- [ ] The app is distributed through the App Store and the production
  installation is smoke-verified. Implemented, TestFlight-tested and
  released remain separate statuses until this happens.
- [ ] Lasting platform decisions live in the platform owner, feature
  rulings in their owners, and native setup/build commands in the stack
  documentation. Store final proof in durable tests/release evidence.
- [ ] Remove this phase and its live index/router links at closeout per
  `docs/operations/Execution-Playbook.md`; repoint lasting links to owners.

## 7. Progress

**2026-10-06:** permanent architecture and this implementation plan prepared.
Scope: documentation only. Native app, CI, shared parity fixtures and
hardware proofs remain unimplemented. Next: execute A, then the B/C
vertical path. Do not treat the starter tests as product proof.
