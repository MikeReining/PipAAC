# 044 A — Web → iOS parity inventory

**Purpose:** one row per user-facing web workflow, traced from its entrypoint, so every 1.0 row is built, proven and ticked on the iPad (phase `044_Native_iOS_App.md` §§ 5–7). Split follows `docs/product/Platforms_iOS_And_Web.md` § 2.
**Update status:** edit the Status cell only — `planned` → `implemented` (native has it, proof in § 10 of the phase doc) → `verified on device` (the row's Proof ID passed on the A16 iPad) → `released`. Re-trace a row if its web call path moves.
**Date:** 2026-10-14. Native evidence: `scripts/ios/app.mjs` (`PIPCORE.app.*`), `apps/PipAAC/PipAAC/*.swift`, phase § 10 (B1 board/groups/tap/bar, B2 keyboard + transform chrome, B3 Settings + PIN). Nothing is verified on device yet.

Key. **Split:** Core = shared JS in JavaScriptCore; Swift = native; Both = Core rules, Swift screen. **Release:** per phase § 5. **Slice:** phase § 6. **Proof:** P1–P9 per phase § 7; "unit" = node/Swift test, "UI test" = XCUITest. Paths are under `public/` unless prefixed. Web paths end with the function the gesture reaches; `board.js:N` is a line in the file at this date.

Not-a-spec rule: a row says what the web does today (traced), never what it ought to do. Proposals and known bugs are in the last two sections, not in the tables.

## Board & speech

| Workflow | Gesture / entry | Web call path | Split | Data / API / media effect | Release | Slice | Proof | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BS-1 Open the board with the last person, offline | Launch | `index.html` → `board.js` (`listUsers`, `resolveActiveUser`, `bootDb` `db.js:56`, `loadCatalog`) → `renderGrid` `board/grid.js:244` | Swift opens file; Core `import`/`migrate` | `fresh_db.sqlite` seeded once; catalog + answer tables loaded; no API | 1.0 | B | P1 | implemented (`appOpen`, `PipAssets` seeding) |
| BS-2 Tap a word: it speaks, joins the sentence | Tap tile | `board/grid.js:renderGrid` click → `board.js:tap` 636 → `speech.js:speakItem` 257 → `playClip` 218 | Swift audio; Core `resolveSlot`, `formFor`, log | `learner_event_log` row (device-local); clip file from bundle; no API | 1.0 | B | P1, P6 | implemented (`appTap`, `PipSpeaker`) |
| BS-3 Word picks its grammar form from the words before it | Tap (Grammar help on) | `board.js:tap` → `shared/forms.mjs:formFor`; `revisitPrev` 719 re-picks the previous word | Core | Rewrites the bar item and the log row's `label_id` | 1.0 | B | unit (fixtures) | implemented (`appTap`, `revisitPrev`) |
| BS-4 Backspace one word | Tap ⌫ | `board.js` `#backspace` handler → `renderBar` 482 → `renderStrip` | Both | Bar change; sentence log closes per `startFresh` | 1.0 | B | P6 | implemented (`appBackspace`) |
| BS-5 Clear the bar | Tap ✕ | `board.js` `#clear` handler → `startFresh` 271 | Both | Bar cleared; open sentence closed | 1.0 | B | P6 | implemented (`appClear`) |
| BS-6 Play the whole sentence in the voice | Tap ▶ | `board.js` `#play` → `speech.js:speakSentence` 398 → `shared/voice_sentence.mjs` → `/api/v1/voice/speak` (cloud) or per-word clips | Swift playback/cache; Core clip choice | Sentence audio cached locally; `learner_event_log`/sentence close; Worker `POST /api/v1/voice/speak` for a new sentence | 1.0 | B (word clips), D (cloud sentence) | P1, P6 | implemented (word-clip path + cloud sentence clip cached on disk; proof SayUITests.testFixItShows…, app_say.test.mjs) |
| BS-7 Sentence-final form ("mine" for "my") before speaking | Tap ▶ | `speech.js:speakSentence` → `forms.mjs:formFor(..., EOS)` | Core | Updates last bar item + `label_id` | 1.0 | B | unit | implemented (`speakNow`) |
| BS-8 Start fresh after speaking (setting) | Play, then next tap | `board.js` `freshAfterSpeak`/`startFresh` 271 | Core | Reads `learner_profile.fresh_after_speak` | 1.0 | B | P6 | implemented (`startFresh`) |
| BS-9 Speaking speed | Settings → Talking | `settings-sync.js` speed seg → `speech.js:syncSpeed` 35 | Both | `learner_profile.speech_rate` (synced); playback rate | 1.0 | B | P3 | implemented (`appSetSetting` speechRate) |
| BS-10 Words with no shipped clip speak from the tile voice library | Tap (typed/personal/new word) | `speech.js:tilePrefetch` 118, `tileSweep` 106 → `shared/voice_tile.mjs:voiceTile` → `/api/v1/voice/tile` | Swift download/cache; Core `resolveSlot` | Worker `POST /api/v1/voice/tile` (supporters, within budget); `tile/` clips saved locally | 1.0 | C/D | P5 | implemented (a tap fetches the tile clip behind the 900 ms deadline, cached; proof SayUITests.testTypedWord…, app_say.test.mjs) |
| BS-11 Offline: a missing clip is silent, never device TTS | Tap | `speech.js:speakItem` → `playClip`; `Platforms` § 3 | Swift | None | 1.0 | B | P1 | implemented (`PipSpeaker` 400 ms silent slot) |
| BS-12 Switch the board's layout size (cells per screen) | Settings → Board → Buttons per screen | `board/cells-sheet.js:mountCellsSheet` 10 → `renderGrid` | Both | `learner_profile.board_layout` (synced); core cells may move (`coremove.mjs`) | 1.0 | B | P3 | implemented (setting write + repaint; "Change the board?" confirm sheet not built) |
| BS-13 Home cells wear the right forms for the sentence | Any tap | `board/grid.js:homeTile` 211 → `shared/forms.mjs` | Core | None | 1.0 | B | unit | implemented (`boardModel`) |
| BS-14 Hidden words do not show | Board / group render | `groups.mjs:maskedSenseIds` 307 → `homeTile` | Core | Reads `sense_mask` | 1.0 | B | P3 | implemented (render side only; hiding is LW-9) |
| BS-15 Personal words (people, pets, places) show on the board with their photo | Tap | `grid.js:renderGrid` entity cell → `board.js:tap(..., "entity")`; `shared/images.mjs` | Both | `personal_entity`; photo file by hash | 1.0 | B/E | P3, P5 | implemented (entity tap/role/photo lookup in `app.mjs`); photo fetch from sync not built |
| BS-16 Groups index: see the groups, open one | Tap Groups anchor | `board/groups-ui.js:openGroupIndex` 185 → `renderGroupIndex` 125 | Both | Reads `board_group`, `group_membership`; none written | 1.0 | B | P1 | implemented (`appGroups`; UI test round-trip) |
| BS-17 Group page: tap words, page through | Tap group; tap pager | `groups-ui.js:openGroup` 189 → `renderGroupPage` 382 → `paintGroupPage` 321 → `board.js:tap` | Both | `learner_event_log.group_id` | 1.0 | B | P1 | implemented (`appGroupPage`); group-page header chrome not built |
| BS-18 Return Home from a group | Tap corner/Home | `board.js:syncCorner` 894 | Swift | None | 1.0 | B | P1 | implemented (Home button) |
| BS-19 Occasions groups on/off in Groups | Settings → Board | `settings-sync.js` → `groups-ui.js:isOccasion` 34 | Both | `learner_profile.occasions_visible` (synced) | 1.0 | B | P3 | implemented |
| BS-20 Keep top row in every group (setting) | Settings → Board | `settings-sync.js` → `groups-ui.js:profileFlag` 32 | Both | `learner_profile.group_top_row` (synced) | 1.0 | B | P3 | implemented |
| BS-21 Counts badge on tiles (child's own 30-day taps) | Edit mode → 📊 | `board.js` `#edit-counts` → `shared/usecounts.mjs:useCounts` | Core | Reads `learner_event_log` | 1.0 | E | UI test | planned |
| BS-22 Presentation modes (look of buttons) | Settings → Overview "Look" | `settings-sync.js` `#look-seg` → `setLook`; `shared/profile.mjs` | Both | `learner_profile` look columns (synced) | 1.0 | E | P3 | planned |
| BS-23 Per-person voice choice and sample | Settings → Talking → Voice → Change / Hear | `board/voice-ui.js:mountVoice` 35 → `board.js:sampleVoice` 1344 → `shared/voices.mjs` | Swift download; Core choice | `learner_profile.voice_id` (synced); voice pack download; sample clip | 1.0 | D | P3, P9 | implemented — `VoiceUITests.testChooseEveDownloadsPlaysFromPackAndSurvivesOffline`, `app_voice.test.mjs` |
| BS-24 Expressive voice feeling faces on the Smart bar and "Try the faces" | Tap face; Settings → Talking | `strip.js:faceCard` 137 → `speech.js:speakFeeling` 486 → `speakSentence(feeling)`; `shared/feeling.mjs` | Both | Feeling sentence audio via `/api/v1/voice/speak`; `learner_profile.expressive_voice` | 1.0 | D | P6 | planned (setting stored in `settingsModel`; faces/audio not built) |
| BS-25 Offline voice downloads (bundled Pip, other voices on choice) | Choose voice | `sw.js` audio cache, `sw-audio.json`; `board.js:announceVoice` 249 | Swift | Voice pack files, excluded from backup | 1.0 | D | P9 | implemented — `VoicePacksTests` (interrupt/resume/tamper/update), `VoiceUITests` |
| BS-26 Spotlight glow/dim and live modeling shown on the board | A supporter's device lights words | `board/spotlight-layer.js:mountSpotlightLayer` 14; `sync.mjs` `{t:"model"}` receive 593; `board.js:onSyncApplied` 176 | Core data; Swift render | `spotlight_session` (synced); transient live message; no board edit | 1.0 | C/D | P3 | planned |

## Smart bar & forms

| Workflow | Gesture / entry | Web call path | Split | Data / API / media effect | Release | Slice | Proof | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SB-1 Smart bar offers likely next words | Any bar change | `board/strip.js:renderStrip` 269 → `stripCards` 158 → `shared/funnel.mjs:stripRanked` + `suggest_answers.en.json` | Core | Reads `phrase_count`/`phrase_link`; none written | 1.0 | B | P6, unit | implemented (`appStrip`) |
| SB-2 Tap a Smart bar card | Tap card | `strip.js` card click (104) → `board.js:tap(..., source "strip")` | Both | Event log `source` | 1.0 | B | P6 | implemented (`stripButton`) |
| SB-3 Word-family expand ("more like this") | Tap family card | `strip.js:openExpand` 39 → `renderExpand` 219; `shared/families.mjs` | Both | Reads `bar_family`, `bar_family_item` | 1.0 | B | UI test | implemented (`appOpenFamily`/`appFamilyPage`) |
| SB-4 Ghost / empty-strip card | Empty bar | `strip.js:ghostCard` 109 | Both | None | 1.0 | B | UI test | implemented (`stripModel`) |
| SB-5 Strip impressions recorded for learning | Strip paint | `board.js:maybeImpression` 282 → `funnel.mjs` | Core | Local impression rows (device-local) | 1.0 | B | unit | implemented (`maybeImpression` in `app.mjs`) |
| SB-6 Strip shows completions while typing | Keyboard buffer non-empty | `keyboard-ui.js:kbCompletions` 285 → `shared/spelling.mjs:suggest` | Core | None | 1.0 | B | UI test | implemented (`mode: "complete"`) |
| SB-7 Word families: choose lead-with and members | Settings → Language help → Smart bar word families | `board/family-editor.js:mountFamilyEditor` 11 → `families.mjs:createFamily`/`setFamilyItems` | Both | `bar_family`, `bar_family_item` (synced) | 1.0 | E | P3 | planned |
| SB-8 Grammar help on/off | Settings → Language help | `settings-sync.js` `#grammar-help` 70 | Both | `learner_profile.grammar_help` (synced) | 1.0 | B | P3 | implemented |
| SB-9 Outline likely next words on the board | Settings → Language help | `settings-sync.js` → `board/grid.js:applyLikely` 419 | Both | `learner_profile` highlight flag (synced) | 1.0 | E | P3 | planned |
| SB-10 Prediction survives cloud failure | Offline | Smart bar/forms tables are local (`appOpen` loads them) | Core | None | 1.0 | D | P1 | implemented |

## Sentence buttons (✨ ❓ ⏪ ▶ ⏩; rules in `docs/product/Sentence_Bar.md`)

| Workflow | Gesture / entry | Web call path | Split | Data / API / media effect | Release | Slice | Proof | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SN-1 Button row shows, lit by tense/question | Bar render | `board.js:syncTxButtons` 315, `shared/txbar.mjs:barState` | Both | Reads `bar_controls` | 1.0 | B | UI test | implemented (`TxButton`, `state.tense/question`) |
| SN-2 Fix it ✨ / Ask it ❓ / Past ⏪ / Future ⏩ with the Worker | Tap button | `speech.js:transformAndSpeak` 312 → `POST /api/v1/transform` (masked names, `tense`, `question`) → `applyTransform` → `speakSentence` | Swift client + cancel; Core `txbar` | `learner_event_log` transform row (`logTransform`); Worker transform; stale-answer check via `sourceText` | 1.0 | D | P6 | implemented (proof SayUITests.testFixItShows… / testLateReply… / testOffline…, app_say.test.mjs) |
| SN-3 Offline press still speaks the bar | Tap button, no network | `transformAndSpeak` `.catch(() => null)` path | Both | Log row; toast | 1.0 | B | P1, P6 | implemented (`appTransform`) |
| SN-4 Same-state press re-speaks | ❓ on question, ⏪ on past | `transformAndSpeak` / `txbar.mjs` | Core | None | 1.0 | B | P6 | implemented |
| SN-5 Past/future/question bar restores on ▶ | Tap ▶ | `speech.js:speakSentence` → `txbar.mjs:restoreBar` | Core | None | 1.0 | B | P6 | implemented (`restoreBar` in `appSpeak`) |
| SN-6 Name masking before the model sees text | Tap button | `transformAndSpeak` → `shared/name_shield.mjs:maskNames` | Core | None (names never leave) | 1.0 | D | unit | implemented (proof app_say.test.mjs: wire text masked, bar unmasked) |
| SN-7 Bounded wait; abandoned reply never lands | Slow/interrupted transform | `speech.js` `TRANSFORM_WAIT_MS` + `AbortController` | Swift | None | 1.0 | D | P6 | implemented (15 s bound + abort; a stale reply is dropped; proof SayUITests.testLateReply…, app_say.test.mjs) |
| SN-8 Choose which buttons show (quick setups + toggles) | Settings → Talking → Sentence bar | `settings-sync.js` `#bar-preset` 259, `#bar-toggles` 263 → `shared/bar.mjs` | Both | `learner_profile.bar_controls` (synced) | 1.0 | B | P3 | implemented (`BAR_PRESETS`, toggles; UI test `testSettingsSurface`) |
| SN-9 Free-tier / trial gate on ✨ ❓ ⏪ ⏩ | Tap when not entitled | `speech.js:entitledNow` 301, `askOnce` 304 → Lifetime page | Both | Worker `GET /api/v1/trial`; entitlement | 1.0 | F | P9 | planned |
| SN-10 Expressive voice: speak with a feeling | Tap face then ▶ | `speech.js:speakFeeling` 486 | Both | See BS-24 | 1.0 | D | P6 | planned |
| SN-11 Fix-it demo is scripted (first-run tour only) | Tour | `board/tour-ui.js:mountTour` 40 | Swift | Nothing logged | 1.0 | E | UI test | planned (see PF-4) |

## Keyboard

| Workflow | Gesture / entry | Web call path | Split | Data / API / media effect | Release | Slice | Proof | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| KB-1 Open the on-screen Pip keyboard | Tap Keyboard anchor | `board/keyboard-ui.js:openKb` 383, `buildKb` 77 | Both | None | 1.0 | B | UI test | implemented (`appKbOpen`, `kbGrid`) |
| KB-2 Type letters, dead keys, punctuation, space, ⌫ | Tap key | `keyboard-ui.js:kbPress` 165 → `shared/keyboard.mjs:applyKey` | Core | Buffer only | 1.0 | B | UI test | implemented (`appKbPress`) |
| KB-3 Commit a typed word (approved label, form spelling, or personal word) | Space / Enter / completion | `keyboard-ui.js:resolveTyped` 191, `commitKbItem` 213 → `tap` | Core | Event log row `source: "keyboard"` | 1.0 | B | P6 | implemented (`resolveTyped`, `commitKbItem`) |
| KB-4 Partner yes/no tiles on the keyboard | Tap partner key | `keyboard-ui.js:partnerCell` 143 | Both | Speak only; sentence untouched | 1.0 | B | UI test | implemented (`appKbPartner`) |
| KB-5 Close keyboard, back to board | Tap Board | `keyboard-ui.js:closeKb` 394 | Swift | None | 1.0 | B | UI test | implemented (`appKbClose`) |
| KB-6 Letter order QWERTY / ABC | Settings → Talking → Keyboard | `keyboard-ui.js:syncKbSettings` 38; `#kb-order` 410 | Both | `learner_profile.keyboard_order` (synced) | 1.0 | B | P3 | implemented |
| KB-7 Device-keyboard mode (system keyboard types into the bar) | Settings → Keyboard mode | `keyboard-ui.js:buildKbDevice` 313, `kbDeviceInput` 340, `#kb-mode` 402 | Swift field; Core normalize | `learner_profile.keyboard_mode` (synced) | 1.0 | D | P6 | planned |
| KB-8 Typed word minted for voice on demand | Commit typed word | `board.js` `tile.ensure` / `voice_tile.mjs` | Swift; Core | Worker `POST /api/v1/voice/tile` (supporter, budgeted) | 1.0 | D | P5 | implemented (a committed typed word mints its tile clip; proof SayUITests.testTypedWord…, app_say.test.mjs) |
| KB-9 Locale-specific key maps | Open keyboard | `shared/keymaps.mjs:resolveKeymap` | Core | None | 1.0 | B | unit | implemented (`kbModel`) |

## Settings & PIN

| Workflow | Gesture / entry | Web call path | Split | Data / API / media effect | Release | Slice | Proof | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ST-1 Open Settings behind the PIN | Tap corner gear | `board.js:syncCorner` 894 → `pin.js:gatePin` 35 → `settings-ui.js:mountSettings` 46 `open` | Swift | Reads device PIN; none synced | 1.0 | E (surface in B3) | UI test | implemented (`SettingsView`, `PinSheet`) |
| ST-2 Set, change, remove the PIN; Forgot → reset phrase | Settings → Backup & privacy → Settings PIN | `board/pin.js` (`#pin-change` 125, `#pin-off` 126), `shared/pin.mjs:setPin/checkPin/isResetPhrase` | Swift (device-local, never synced) | Hash `pip-pin:device:<pin>` in device store; Keychain/Defaults seat on iOS | 1.0 | E (B3) | unit, P7 | implemented (`PipPin`; UserDefaults, not Keychain) |
| ST-3 Face ID may stand in for the PIN | Open Settings | New (phase § 6 D–F) — web has no equivalent | Swift | None | 1.0 | E | P8 | planned |
| ST-4 Settings navigation, sections, search | Gear, list, back | `settings-ui.js` nav 323, `runSearch` 375, section list (`index.html` `.set-sec`) | Swift | Reads `help.en.json` for search | 1.0 | E | UI test | planned (flat Form sheet shipped, not the sectioned/search layout) |
| ST-5 Overview: name, photo, set-up checklist, glance | Settings → Overview | `board/person-card.js:mountPersonCard` 13, `settings-ui.js` `facts`, `wincard-ui.js` | Both | `person` name/photo in user registry + blob upload | 1.0 | E | P3, P5 | planned |
| ST-6 Share anonymous counts with Pip (on by default) | Settings → Backup & privacy | `settings-sync.js` `#share-research` 142; `shared/research.mjs:flushResearch` | Both | `learner_profile.share_research` (synced); day payload to Worker when on | 1.0 | B | P3 | implemented (toggle); research upload not built |
| ST-7 Hide/show group shows, reorder | Settings → Words → Show groups | `board/group-shows.js:mountGroupShows` 21 → `groups.mjs:setGroupHidden`, `reorderGroups` | Both | `board_group.hidden`, group order (synced) | 1.0 | E | P3 | planned |
| ST-8 Spotlight settings (look, glow, dim, two-device) | Settings → Spotlight | `settings-sync.js`, `spotlight-layer.js:bindSpotSettings` 58 | Both | `learner_profile` spotlight columns (synced) | 1.0 | E | P3 | planned |
| ST-9 Replay the tour | Settings → Overview | `board.js` `#replay-tour` → `tourUi.start` | Swift | None | 1.0 | E | UI test | planned |

## People & first run

| Workflow | Gesture / entry | Web call path | Split | Data / API / media effect | Release | Slice | Proof | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PF-1 First launch with no account or network | Launch | `board.js` first boot: `addUser({ home:true, needsSetup:true })` → `bootDb` | Swift registry; Core seed | User registry row; `fresh_db.sqlite`; no API | 1.0 | B | P1 | implemented (boots to board; no registry/`needsSetup` yet) |
| PF-2 Welcome: name (optional) and who it is for; button look for teen/adult | First launch | `board/onramp-ui.js:mountOnramp` 29 `start`; clips `shared/onramp_audio.mjs` | Swift; shipped clips | `learner_profile`/user name+look; spoken prompts from bundled clips | 1.0 | E | UI test | planned |
| PF-3 "Tell us about their world" (people, pets, foods, places with pictures) | Settings → Words → People & places | `board/setup-ui.js:mountSetup` 21 → `coremove.mjs:seatSetupPeople` 190, `createEntity` | Both | `personal_entity`, `group_membership`, `group_cell` (synced); photos by hash | 1.0 | E | P3, P5 | planned |
| PF-4 Demo tour (want → apple → ✨ → ⏪) | After welcome | `board/tour-ui.js:mountTour` 40; `board.js:tap` returns early to `tour.onTap` | Swift | Nothing reaches log/stats | 1.0 | E | UI test | planned |
| PF-5 Several people on one device; switch | Settings header switcher | `board/people-ui.js:mountPeople` 64 `who` click 124 → reload with `pip_active_user` | Swift registry | Registry row per person; one DB file each | 1.0 | D | P2 | implemented |
| PF-6 "Who's talking?" launch list; choose which opens first | Launch with several people, no home | `people-ui.js:pickPerson` 38; `shared/users.mjs:setHome`/`resolveActiveUser` | Swift | Registry `home` flag | 1.0 | D | UI test | implemented |
| PF-7 Add / remove a person | Settings → Team & devices → People | `people-ui.js`, `users.mjs:addUser`/`removeUser` | Swift | Registry; new DB file; deleting a person is local | 1.0 | D | P2 | implemented |
| PF-8 One writer per person (second window told) | Open same person twice | `board.js` `navigator.locks` block | Swift | None | later | — | — | planned (iPad has no second tab; revisit with Split View) |
| PF-9 A failed DB open never replaces data with a fresh catalog | Launch with unreadable file | `db.js:bootDb`, `board/db-health.js:reportDbHealth`; phase § B–C | Swift | Keeps last good file | 1.0 | B | P2 | implemented (`PipAssets`: reports, never re-seeds) |

## Library & word cards

| Workflow | Gesture / entry | Web call path | Split | Data / API / media effect | Release | Slice | Proof | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LW-1 Edit mode: tap Edit, tiles take adult gestures | Corner Edit / "Edit the board" | `board.js` `#edit-groups` 920 → `kbUi.setView("editor")`; `edit-shared.js:setEditing` 11 | Swift | None | 1.0 | E | P2, P8 | implemented (E1: app_edit.mjs + EditMode/WordCardView; proof testEditRenameSurvivesRelaunch, testEditRemoveWithUndo, testEditHideShowAndMove, app_edit.test.mjs) |
| LW-2 Add a word: type, pick a match, place it | Anchor + / Settings → Add a word | `board.js` `#anchor-add` 907 → `board/add-flow.js:openAddForm` 60 → `renderAddMatches` 475 → `placeWord` 563 → `groups_ops.mjs:placeItem` / `coremove.mjs:placeOnBoard` | Swift screen; Core writes | `group_membership`/`group_cell` ops (synced) | 1.0 | E | P2, P3 | implemented (E2: testAddCatalogWordToChosenGroup, testAddIntoTappedEmptyCell, testMakePersonalWordThenLibrary; app_library.test.mjs) |
| LW-3 Make a personal word | Add field → "Make" | `add-flow.js:makeWord` 581 → `groups.mjs:createEntity` 248 | Core | `personal_entity` op (synced); per-person word limit (unlicensed) | 1.0 | E | P2, P3 | implemented (E2: testAddCatalogWordToChosenGroup, testAddIntoTappedEmptyCell, testMakePersonalWordThenLibrary; app_library.test.mjs) |
| LW-4 Choose which group a new word goes in (and make a group) | Add form destination | `add-flow.js:chooseGroup` 108, `makeGroup` 118 → `groups.mjs:createGroup` 316 | Core | `board_group` op (synced) | 1.0 | E | P3 | implemented (E2: testAddCatalogWordToChosenGroup, testAddIntoTappedEmptyCell, testMakePersonalWordThenLibrary; app_library.test.mjs) |
| LW-5 Add a list of words (paste) | Add → bulk | `add-flow.js:openBulkForm` 214 → `shared/bulk.mjs:resolvePasteRows` 36 / `applyPasteRows` 84 | Core | Many `personal_entity`/`group_membership` ops; optional `pictures/find-batch` | 1.0 | E | P2 | planned |
| LW-6 Open a word's card | Tap tile in Edit | `word-card.js:openWordCard` 213 (`editor-ui.js:showCard` 501 in the editor) | Swift | Reads override/image/mask | 1.0 | E | P3 | implemented (E1: app_edit.mjs + EditMode/WordCardView; proof testEditRenameSurvivesRelaunch, testEditRemoveWithUndo, testEditHideShowAndMove, app_edit.test.mjs) |
| LW-7 Rename a word | Card name field | `word-card.js:rename` 57 → `groups.mjs:renameEntity` 170 / `label` override | Core | `personal_entity` or `group_label` op (synced) | 1.0 | E | P3 | implemented (E1: app_edit.mjs + EditMode/WordCardView; proof testEditRenameSurvivesRelaunch, testEditRemoveWithUndo, testEditHideShowAndMove, app_edit.test.mjs) |
| LW-8 Swap / replace a word in its cell | Card "Swap" | `word-card.js` `#wc-replace` 277 → `place-ui.js:mountPlacePicker` 24 → `groups_ops.mjs:replaceGroupItem` 117 | Core | Group op (synced) | 1.0 | E | P3 | planned |
| LW-9 Hide / show a built-in word | Card "Hide this word" | `word-card.js` `#wc-hide` 313 → `groups.mjs:setMask` 298 | Core | `sense_mask` (synced) | 1.0 | E | P3 | implemented (E1: app_edit.mjs + EditMode/WordCardView; proof testEditRenameSurvivesRelaunch, testEditRemoveWithUndo, testEditHideShowAndMove, app_edit.test.mjs) |
| LW-10 Remove a word (undo toast) | Card "Remove" / tile × | `word-card.js` `#wc-remove` 328; `edit-shared.js:xBadge`/`undoLast`; `groups_ops.mjs:removeItemUndoable` 158 | Core | Group op; `retireEntity` for personal words | 1.0 | E | P2 | implemented (E1: app_edit.mjs + EditMode/WordCardView; proof testEditRenameSurvivesRelaunch, testEditRemoveWithUndo, testEditHideShowAndMove, app_edit.test.mjs) |
| LW-11 Move a word to another cell / swap two | Drag in Edit | `edit-shared.js:editPointer` → `groups_ops.mjs:moveItem` 72 / `swapItems` 92; core words `coremove.mjs:moveCore` 178 | Swift gesture; Core | `group_cell`/`core_override`/`move_mark` ops | 1.0 | E | P2, P4 | implemented (E1: app_edit.mjs + EditMode/WordCardView; proof testEditRenameSurvivesRelaunch, testEditRemoveWithUndo, testEditHideShowAndMove, app_edit.test.mjs) |
| LW-12 "Also in": add a word to other groups | Card → Also in; after add | `word-card.js:renderCardGroups` 132; `add-flow.js:offerOtherBoards` 723; `groups_ops.mjs:addToGroups` 190 | Core | `group_membership` ops | 1.0 | E | P3 | implemented (E2: testAddCatalogWordToChosenGroup, testAddIntoTappedEmptyCell, testMakePersonalWordThenLibrary; app_library.test.mjs) |
| LW-13 Word colour / kind (personal words) | Card → Colour | `word-card.js:paintKind` 105 → `groups.mjs:setEntityRole` 182 | Core | `personal_entity.role` (synced) | 1.0 | E | P3 | planned |
| LW-14 Create, rename, hide, delete, reorder groups | Groups index in Edit; `+` | `groups-ui.js:askDeleteGroup` 101, `#group-save` 441; `editor-ui.js:groupMenu` 198; `groups.mjs:createGroup/renameGroup/deleteGroupUndoable/setGroupHidden`; `groups_ops.mjs:reorderGroups` | Core | `board_group` ops (synced) | 1.0 | E | P3, P4 | planned |
| LW-15 Group icon (library icons or a word's picture) | Group menu → Change icon | `board/group-icon-picker.js:mountGroupIconPicker` 14 → `groups.mjs:setGroupGlyph` 385 | Both | `board_group` glyph (synced) | 1.0 | E | P3 | planned |
| LW-16 Library: browse all words, search, add | Settings → Words → All words | `board/library-ui.js:mountLibrary` 12 → `shared/library.mjs:libraryAll/librarySearch/libraryHomes` | Core | None until a word is placed | 1.0 | E | P3 | implemented (E2: testAddCatalogWordToChosenGroup, testAddIntoTappedEmptyCell, testMakePersonalWordThenLibrary; app_library.test.mjs) |
| LW-17 Suggested lists | Library tab | `library.mjs:librarySuggested` 92 | Core | None | 1.0 | E | UI test | planned |
| LW-18 Pick a place for a word on the board | Empty cell in Edit | `place-ui.js` `paint` → `onPick`/`onGroupPick` | Both | Group/placement op | 1.0 | E | P3 | implemented (E2: testAddCatalogWordToChosenGroup, testAddIntoTappedEmptyCell, testMakePersonalWordThenLibrary; app_library.test.mjs) |
| LW-19 Voice on the word card: base / mine / try | Card → Voice | `board/word-card-voice.js:mountCardVoice` 14 → `voice.mjs:setOverride/clearOverride` | Both | `clip_override` (synced) | 1.0 | E | P3, P5 | implemented (`MediaUITests`, `app_media.test.mjs`) |
| LW-20 "Sounds wrong" flag (personal words only) | Card foot | `word-card.js` `#wc-flag` 97 → `tile.flag` (`shared/voice_tile.mjs`) → `POST /api/v1/voice/tile/flag` | Swift | Worker flag record | 1.0 | E | UI test | planned |
| LW-21 Desktop board editor (side rooms, find field, drawer) | n/a on iPad | `board/editor-ui.js:mountEditor` 45 | Swift (iPad shape differs) | Same ops as above | 1.0 | E | P8 | planned (iPad gets Edit mode + sheets, not the 3-pane layout) |
| LW-22 Dock editor save status (pending / offline / save error) | Editor top bar | `board/editor-find.js:editorStatus` 17 | Swift | Reads `sync_op` pending; `db-health` | 1.0 | C/E | P4 | planned |

## Pictures, photos, recording

| Workflow | Gesture / entry | Web call path | Split | Data / API / media effect | Release | Slice | Proof | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PP-1 Find a picture by meaning for a word | Card → Picture → Find | `board/word-card-pictures.js:find` 338 → `shared/pictures.mjs:pictureClient.find` 144 → `POST /api/v1/pictures/find` | Swift client | Worker find; `image_override` (synced) on pick | 1.0 | E | P3 | planned |
| PP-2 Pick / reject a suggested picture | Tap thumbnail | `word-card-pictures.js:pick` 238 → `pictures/pick`, `pictures/reject` | Swift client; Core writes | `image_override` op; pick/reject Worker calls | 1.0 | E | P3 | planned |
| PP-3 Draw it for me | Card → dashed Draw tile | `word-card-pictures.js:draw` 354 → `GET /api/v1/pictures/img/<id>` | Swift client | Allowance (`refreshAllowance` 392); image file by hash | 1.0 | E | P5 | planned |
| PP-4 Take or pick a photo for a word | Card → Photo (`#wc-photo`) | `word-card-pictures.js` 447 → `db.js:savePhoto` 272 → `sync.mjs:syncUploadBlob` 647 | Swift picker/camera; Core `setEntityPhoto` | Local file by sha256; `/blobs/<sha>` upload; `personal_entity.photo` (synced) | 1.0 | E | P5 | implemented (`MediaUITests`, `app_media.test.mjs`) |
| PP-5 Add several photos as new words | Add → Photos | `add-flow.js` `#add-photos-input` 674, `renderPhotoDrafts` 375 → `bulk.mjs:applyPhotoDrafts` 108 | Swift picker; Core | Photo blobs + entities | 1.0 | E | P5 | planned |
| PP-6 Fill pictures for pasted words | After bulk add | `add-flow.js:fillPastedPictures` 653 → `pictures/find-batch` | Swift client | `image_override` ops | 1.0 | E | P3 | planned |
| PP-7 Record a voice for a word | Card → Record | `word-card-voice.js` `#wc-record` 104 → `MediaRecorder` → `db.js:savePhoto` 272 → `syncUploadBlob` → `voice.mjs:setOverride` | Swift recorder + files | Recording file by hash; `clip_override` (synced); `/blobs/<sha>` | 1.0 | E | P2, P5 | implemented (`MediaUITests`, `app_media.test.mjs`) |
| PP-8 Person photo | Settings → Overview | `person-card.js` `#person-photo` 36 → `savePhoto`/`syncUploadBlob` | Swift picker | User registry photo key + blob | 1.0 | E | P5 | implemented (`MediaUITests`, `app_media.test.mjs`) |
| PP-9 Show pictures from desktop edits (download by hash) | Receive synced edit | `db.js:setBlobFetcher` 270 / `loadBlobBytes` 291 → `sync_client.mjs` `GET /blobs/<sha>` | Swift transport | Verify hash before "available offline" | 1.0 | C | P3, P5 | implemented (C4: e2e_sync.sh media, SyncMediaE2ETests.testMediaBothWays) |
| PP-10 Pending vs missing media shown honestly | Open card / tile | `word-card.js` / `editor-ui.js:voiceState` 908 | Swift | Reads blob queue state | 1.0 | C/E | P5 | implemented (C4: e2e_sync.sh media, SyncMediaE2ETests.testMediaBothWays) |

## Sync, devices, recovery

| Workflow | Gesture / entry | Web call path | Split | Data / API / media effect | Release | Slice | Proof | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SY-1 Every edit becomes a recorded operation | Any synced write | `shared/ops.mjs` record/apply | Core | `sync_op` row with the table change in one transaction | 1.0 | B | P2, P4 | implemented (writes record ops; `setSetting` verified; sync not shipped) |
| SY-2 Link this device to a person (type a code) | Settings → Team & devices → Link | `board/devices-ui.js:joinFlow` 689 → `sync_client.mjs:pairClient.claim` → `waitForGrant` 761 → `joinDeviceWithToken` | Swift transport + crypto; Core ops | `POST /pair`, `/pair/<code>/claim`, `/grant`; wrapped user key | 1.0 | C | P3, P7 | implemented (C3: `PIPCORE.pair.join` over the web `pairClient`/`unwrapUserKey`; proof `SyncE2ETests.testLinkAndSyncBothWays` types a code from a node web device) |
| SY-3 Offer a code on this device so another links | Settings → Team & devices → Add a device | `devices-ui.js:offerFlow` 826 → `pairClient.offer/status/grant` | Swift | Relay pair rows; key grant | 1.0 | C | P7 | implemented (C3: `PIPCORE.pair.offer`; proof `SyncE2ETests.testLinkAndSyncBothWays` - a third node device joins with the code the iPad shows) |
| SY-4 Edits sync both ways and converge | Open app / edit | `shared/sync.mjs:initSync` 52 → `sync_client.mjs` `POST /users/<id>/ops`, `GET /ops?after=` → `ops.mjs` replay | Swift transport/CryptoKit; Core replay | Sealed ops; snapshots; cursor | 1.0 | C | P3, P4 | verified (C3 E2E `scripts/ios/e2e_sync.sh`: node web device <-> iPad both ways, dumps of every SYNCED_TABLES table identical; offline catch-up `testOfflineCatchUp`) |
| SY-5 Live messages (modeling, child taps) | Supporter taps; child taps | `sync.mjs` `syncSendLive` 634, `syncSendModel` 641; `coach-ui.js:onChildTap` | Swift ws | Transient; no table | 1.0 | C/D | P3 | planned |
| SY-6 Photos/recordings upload and download queue | Edit with media | `sync.mjs:syncUploadBlob` 647, `reconcileBlobs`; `sync_client.mjs` blobs | Swift | `/blobs/<sha>` PUT/GET; OPFS-like files in Application Support | 1.0 | C | P5 | implemented (C4: e2e_sync.sh media, SyncMediaE2ETests.testMediaBothWays) |
| SY-7 Device list, name this device, remove a device | Settings → Team & devices → Devices | `devices-ui.js:renderDevices` 161, `removeDeviceFlow` 300, `setLabel` | Swift | `GET/DELETE /users/<id>/devices`, `/label` | 1.0 | C/F | P7 | planned |
| SY-8 Key rotation after removal | Remove device/supporter | `devices-ui.js:rotateAfterRemoval` 294 → `rotation.mjs:completeRemovalRotation` 109 | Swift crypto | `POST /keys`; epoch bump; durable journal | 1.0 | F | P7 | planned |
| SY-9 QR recovery card: show, save, replace | Settings → Backup & privacy → Recovery card | `board/recovery-ui.js:showCard` 84, `replaceCard` 187 → `rotation.mjs:replaceRecoveryCard`; `recovery.mjs:cardLink` | Swift crypto/QR | `POST /users/<id>/recovery`; card image to Photos/Files | 1.0 | C/F | P7 | implemented (C5: `PIPCORE.recovery.card/replace`; Settings -> Backup & privacy; QR + 12 words, Email, Copy link, Save image (Photos add-only), Print, Replace card; proof `app_account.test.mjs`, `AccountHostTests` (card image decodes to the link), `SyncE2ETests.testRestoreFromWords` (words on the iPad == the peer's; Replace card against the local relay)) |
| SY-10 Restore from a card (scan, words, or paste) | Restore on a fresh install | `recovery-ui.js:restoreFlow` 240, `scanBitmap` 231, `doRestore` 195 → `recovery.mjs:recoverFromText` 99 → `sync_client.mjs` `restore` | Swift camera + crypto | `POST /users/<id>/restore`; snapshot + ops + blobs | 1.0 | C | P7, P5 | implemented (C5: `PIPCORE.recovery.restore`; scan (VisionKit), choose a photo, or paste words/link; proof `SyncE2ETests.testRestoreFromWords` and `testRestoreByScanningTheCard` - dumps IDENTICAL to the node peer; `app_account.test.mjs` for the word/link/typo cases) |
| SY-11 Backup status nudge ("protect these words") | Overview checklist | `settings-ui.js` `facts.invested`, `#set-protect` | Swift | Reads sync/recovery state | 1.0 | E | UI test | planned |
| SY-12 Incompatible protocol is refused visibly; pending edits kept | Sync against a newer relay | Phase § B–C; relay version check | Swift | None | 1.0 | C | P4, P9 | planned (new behavior, no web equivalent) |
| SY-13 Move from Safari to the app | New iPad | Restore card (SY-10) or Link (SY-2); no export | Swift | As those rows | 1.0 | C | P7 | implemented (C5: card restore is SY-10, linking is SY-2; no export. Proof as those rows) |
| SY-14 Delete a person's cloud data (30-day undo) | Settings → Team & devices | `devices-ui.js` `dev-delete` ~1015 → `client.deleteUser` `DELETE /users/<id>`; `dev-undelete` → `POST /undelete` | Swift | Relay schedule + undo | 1.0 | F | P7 | planned |
| SY-15 Stats days sync so a recovered device gets counts | Background | `stats.mjs:refreshStatsDays` 276 → `writeStatsDay` 248 → `stats_day` op | Core | `stats_day` (synced); raw log stays local | 1.0 | C | P4 | implemented (C3: `refreshStatsDays` at sync start and after Play; the `stats_day` rows are in the identical E2E dumps) |

## Accounts & team

| Workflow | Gesture / entry | Web call path | Split | Data / API / media effect | Release | Slice | Proof | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AC-1 Create a supporter account with a passkey | Settings → Your account → Sign in | `devices-ui.js:accountLanding` 369 → `account.mjs:requestLink` → `claimToken` → `registerAccount` 121 | Swift passkeys/Keychain | `POST /accounts/link`, `/claim`, `/<id>/register`, `/challenge`, `/credential` | 1.0 | C | P7 | implemented (C5: `PIPCORE.account.sendLink/land` over the web `requestLink`/`claimToken`; Swift runs the ASAuthorization ceremony, rpId `pipaac.org`, PRF seals the account key; proof `app_account.test.mjs` (software authenticator, real `verifyAssertion`), `AccountUITests`; real passkey = manual script, phase § 10 C5) |
| AC-2 Sign in on a new device (passkey) | Sign in | `account.mjs:signInAccount` 140 (`/challenge`, `/assert`); PRF opens the account key | Swift | `GET /accounts/<id>/state` | 1.0 | C | P7 | implemented (C5: `signInAccount` mirror - get() then the PRF handle opens the account key in Swift; new-device add-passkey and cancel paths; proof `app_account.test.mjs`, `AccountHostTests` (web-sealed fixture); real passkey = manual script) |
| AC-3 Share a person to my account / import my people | After sign-in | `account.mjs:shareUserToAccount` 169, `importAccountUsers` 190; `devices-ui.js:buildUserGrant` 473 | Swift | `POST /accounts/<id>/users`; wrapped grants | 1.0 | C | P7 | implemented (C5: `importAccountUsers` + `shareUserToAccount` run unchanged; share-back and join tokens mirrored from `accountLanding`; proof `app_account.test.mjs` "AC-1/AC-3" - the second iPad holds the first one's key byte for byte) |
| AC-4 Invite a supporter by email; they Allow/decline | Settings → Team | `devices-ui.js:renderSupporters` 493 → `account.mjs:createInvite` `POST /accounts/<id>/invites`; `inviteLanding` 644 | Swift | Invite rows; email via Worker | 1.0 | F | P7 | planned |
| AC-5 Owner approves (Allow) an invite | Settings → Team | `devices-ui.js:allowInvite` 571 → `grantInvite`; `relay.addSupporter` | Swift crypto | `POST /users/<id>/supporters`; wrapped key | 1.0 | F | P7 | planned |
| AC-6 Make a supporter Owner / back to Team | Settings → Team | `devices-ui.js` ~536 → `relay.setSupporterOwner` | Swift | `POST /supporters/<acct>/owner`; relay refuses the last owner | 1.0 | F | P7 | planned |
| AC-7 Remove a supporter (with rotation and regrant) | Settings → Team | `devices-ui.js:removeSupporterFlow` 606; `rotation.mjs:resumeSupporterRegrant` 140 | Swift crypto | `DELETE /supporters/<acct>`; `POST /keys` | 1.0 | F | P7 | planned |
| AC-8 Team members' names shown (supporter names) | Settings → Your account → Your name | `board/team-name-ui.js:mountMyName` 20 → `shared/team_names.mjs` | Core | `supporter_name` (synced) | 1.0 | F | P3 | planned |
| AC-9 Owner vs Team permissions enforced | Any restricted action | `devices-ui.js:applyOwner` 136, `renderRole` 146; relay rejects | Swift UI + relay | Relay 403 on restricted actions | 1.0 | F | P7 | planned |
| AC-10 Delete my account | Settings → Your account | `account.mjs:deleteAccount` 59 (removes this account's access on every user's relay, then the account; users, devices, license, cards untouched) | Swift | Account + relay supporter rows | 1.0 | F | P7 | planned |

## Purchases & trial

| Workflow | Gesture / entry | Web call path | Split | Data / API / media effect | Release | Slice | Proof | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PU-1 Trial clock starts and counts down | First launch online | `speech.js:refreshTrial` 511 → `POST /api/v1/trial/start`, `GET /api/v1/trial` | Swift | Worker trial record | 1.0 | F | P9 | planned |
| PU-2 Trial nudges (last two days, expiry) | Launch near end | `speech.js:trialNudge` 537; `lifetime-ui.js:mountTrialClock` 108 | Swift | Local marks `pip-trial-nudge` | 1.0 | F | UI test | planned |
| PU-3 Lifetime page: what it adds, hear the difference, countdown | Settings → Lifetime; any paid-feature door | `board/lifetime-ui.js:mountLifetime` 21 | Swift; shipped clips | None | 1.0 | F | UI test | planned |
| PU-4 Buy Lifetime | Lifetime page | Web: `unlock.js:checkoutFromUrl` 87 → `POST /api/v1/checkout`/`/checkout/codes` (Stripe). iOS: StoreKit consumable, server-validated | Swift StoreKit | Worker validation endpoint → `entitled()` | 1.0 | F | P9 | planned (no web checkout link in the app) |
| PU-5 Redeem a code | Lifetime page "Have a code?" | `devices-ui.js:activateLicense` 973 → `account.mjs:redeemLicense` → `POST /api/v1/license/redeem` | Swift | License on relay + device | 1.0 | F | P9 | planned |
| PU-6 Restore purchase | Lifetime page | New (phase § 2); web uses `claimPurchasedLicense` 1046 / `GET /api/v1/license/order` | Swift StoreKit | Entitlement refresh | 1.0 | F | P9 | planned |
| PU-7 Refund / revocation removes access | Apple notification | New: App Store Server Notifications endpoint → `entitled()` | Worker | Entitlement revoked | 1.0 | F | P9 | planned |
| PU-8 Free limits (words, supporters, devices) gate with a Lifetime door | Add past limit | `add-flow.js:ownLeft` 33; `board.js:wordLicensed` 1120; `devices-ui.js` walls | Both | Reads entitlement | 1.0 | F | P9 | planned |
| PU-9 Someone else pays ("Copy unlock link" for an SLP or grandparent) | Lifetime page `#life-link` | `index.html` `#life-link-row`; `lifetime-ui.js` link builder | Swift | A web checkout link — conflicts with phase § 2 "no web checkout link in the app" | later | F | — | planned (needs founder decision; see Proposals) |
| PU-10 Parent gate before purchases and outside links | Tap Buy / external link | New (phase § 2) | Swift | None | 1.0 | F | UI test | planned |

## Help

| Workflow | Gesture / entry | Web call path | Split | Data / API / media effect | Release | Slice | Proof | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HP-1 Read Help answers | Settings → Help | `board/help-ui.js:mountHelp` 30; content `help.en.json` (from `src/help/answers.en.json`) | Swift | None | 1.0 | E | UI test | implemented (`HelpUITests`, `app_help.test.mjs`) |
| HP-2 Search Help and Settings (on device, then by meaning) | Settings search field | `help-ui.js` input 161 → `shared/help_search.mjs`; online `GET /api/v1/help/search` | Core search; Swift client | Worker search when online | 1.0 | E | UI test | implemented (`HelpUITests`, `app_help.test.mjs`) |
| HP-3 Write to us | Help → Write to us | `help-ui.js` ~253 → `POST /api/v1/help/write` | Swift | Worker message | 1.0 | E | UI test | implemented (`HelpUITests`, `app_help.test.mjs`) |
| HP-4 Help links open the right Settings row | Tap a help link | `help-ui.js` pane click 300 → `settings-ui.js` `show` | Swift | None | 1.0 | E | UI test | implemented (`HelpUITests`, `app_help.test.mjs`) |

## Spotlight, modeling, progress

| Workflow | Gesture / entry | Web call path | Split | Data / API / media effect | Release | Slice | Proof | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SP-1 Board shows a Spotlight glow/dim from another device | Remote session | `shared/spotlight.mjs:spotlight/glowsHere` 60/70; `board.js` `renderGrid` | Core; Swift render | `spotlight_session` (synced) | 1.0 | D | P3 | planned |
| SP-2 Session resumes after restart; ends at timer/midnight | Relaunch | `board.js` `resumeSession` + 30 s interval; `spotlight.mjs:resumeSession` 298 | Core | `spotlight_session` | 1.0 | D | P3 | planned |
| SP-3 A supporter's tap lights a word on the child's board (live modeling) | Supporter taps in modeling mode | `board.js:tap` modeling branch → `syncSendModel` | Core + Swift | Transient message; no board edit | 1.0 | D | P3 | planned |
| SP-4 Tip shows when a word is modeled | Modeled word | `coach-ui.js` | Both | Local counts | 1.0 | D | UI test | planned |
| SP-5 Child taps count in the supporter's session | Child taps | `coach-ui.js:onChildTap`; `board.js:tap` `attention.childTap` | Core | Transient + local counts | 1.0 | D | P3 | planned |
| SP-6 Spotlight page: lists, start glow, goals, tips, picking words | Settings → Spotlight | `board/spotlight-sheet.js:mountSpotlightSheet` 34 → `spotlight.mjs:saveSpotList/startSession/setListGoal` | Both | `spotlight_list`, `spotlight_item`, `spotlight_session` (synced) | 1.1 | later phase | P3 | planned (data syncs in 1.0; desktop meanwhile) |
| SP-7 Spotlight "Try it" demo | Spotlight → Try it | `board/spotlight-demo.js:mountSpotlightDemo` 70 | Swift | Nothing logged | 1.1 | later phase | UI test | planned |
| SP-8 Progress: counts, ranges, sentences, glow bars | Settings → Progress | `board/progress-ui.js:mountProgress` 38 → `shared/dashboard.mjs:dashboard` 166 | Core data; Swift screen | Reads `stats_day` + log | 1.1 | later phase | UI test | planned |
| SP-9 Win card (what moved this week) | Settings → Overview | `board/wincard-ui.js:mountWincard` 18 | Swift | Reads `stats_day` | 1.1 | later phase | UI test | planned |
| SP-10 Share a progress report (PDF) | Progress → Share | `board/report-share.js:mountReportShare` 16 → `shared/report.mjs:reportPdf` 375 | Swift share sheet | PDF file | 1.1 | later phase | UI test | planned |
| SP-11 Native taps keep counting for Progress | Any tap | `board.js:tap` log + `stats.mjs:refreshStatsDays` | Core | `learner_event_log` local; `stats_day` synced | 1.0 | B/C | P4 | implemented (log written by `appTap`; day totals not refreshed or synced) |

## Web-only, no native counterpart

Not counted in the totals. Listed so no one searches for a missing row.

| Item | Why it does not port |
| --- | --- |
| App update card, "Update now" (`board/version.js`) | Service worker versioning; App Store updates replace it |
| Service worker, offline shell, install prompts (`sw.js`, `offline.html`, `manifest.webmanifest`) | PWA machinery; the app bundle is the offline copy |
| Viewport/keyboard pin (`board/viewport.js`) | Safari keyboard workaround; SwiftUI handles it |
| `?unlock=` / `?buy` / `?purchased` / `?order=` URL flows (`board/unlock.js`) | Web checkout redirects; replaced by StoreKit (PU-4) |
| Legacy KVVFS database export (`db.js:exportLegacyKvvfsDb`) | Migration from an old web store |
| One-writer web lock (`navigator.locks`) | iPad has one process per person (see PF-8) |
| Audio and picture review pages (`public/*review*.html`, `picture-*.html`, `sentence-lab.html`) | Founder tools |

## Known bugs / not to port

| Item | Source | Rule |
| --- | --- | --- |
| Web `commitKbItem` does not void a past/future/question bar when a typed word commits; the doc's rule says every bar edit should (B2 progress note: "a likely gap worth an upstream check") | `public/board/keyboard-ui.js:213`; `scripts/ios/app.mjs` `noteBarEdit` on typed commit | Native currently voids. Check upstream, fix the web owner, then fixtures; do not copy the gap |
| Sync defects still named by 043: the supporter-regrant gap is closed (`docs/operations/debugger/SUPPORTER_REGRANT_RESUME.md`) but remains device-local — a rotation finished on a device without an account session leaves the drain to a later session-bearing owner boot; a fresh supporter sign-in mid-gap fails with `no wrapped key` until drained | `public/shared/rotation.mjs:140` | Reproduce on two web clients before native sync (phase § B–C); do not hide or copy |
| Transform needs the network (offline: the bar speaks as built and says why) | `speech.js:transformAndSpeak` | Not a bug; D4 ships the online path too |

## Proposals (not built on web; not in 1.0 unless marked)

| Item | Where decided |
| --- | --- |
| Face ID in place of typing the PIN (ST-3) | Phase § 6 D–F |
| Native parent gate before purchases and links (PU-10) | Phase § 2 |
| Restore purchase, refund handling (PU-6, PU-7) | Phase § 2, § 6 F |
| Incompatible-protocol banner (SY-12) | Phase § 6 B–C |
| Replace PU-9 with a StoreKit-compatible gift path, or drop it from the app | Founder decision needed; phase § 2 |
| iPhone layout, Split View second window | Phase § 5 "Later" |
