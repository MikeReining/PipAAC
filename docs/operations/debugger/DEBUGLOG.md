# Debugger Log

| Date | Tier | Summary | Truth owner | Resolution |
| --- | --- | --- | --- | --- |
| 2026-10-01 | T2 | Tour's ✨/⏪ set the bar but played no sentence audio — reported for both buttons | `sayBar` in `public/board/tour-ui.js`; clip inventory in `public/shared/onramp_audio.mjs` | The two clip keys were never minted (404), and `sayBar` burned the gesture window on a HEAD fetch then played a fresh `Audio()` element iOS refused. Now it rides `board.say` → the shared element (play() inside the tap), with `speakBar` fallback. `src/board/tour_audio.test.mjs` |
| 2026-10-01 | T2 | After changing Buttons per screen, the Smart bar wrapped to two rows with faces filling half, and group doors lost their labels — all healed by reload | `renderStrip` in `public/board/strip.js` is the sole owner of tray contents; `cells-sheet.js` resized the template without repainting, and `stripSlots` let the bar collapse to 2 cards on sparse boards | Apply now calls `renderStrip()` after `renderGrid()`; `stripSlots` is `min(4, max(3, cols − 2))` — a 3–4 card promise at every size — clamped to the tray's real span so Edit mode's third anchor can't wrap it. `src/board/cells_density.test.mjs` + `scripts/probes/density_probe.mjs` |
| 2026-10-01 | T3 | Sentence bar missing after the welcome name on iPad Chrome: the keyboard pans the visual viewport and can leave it panned with every JS metric reading normal — in-page repair is untrustworthy | The document, not a measurement — `finish()` in `public/board/onramp-ui.js` | The welcome's Continue leaves the document: persist, flush, `pip_tour` flag, `location.replace` (034). The board boots as a returning user — the path a reload proved correct every time |
| 2026-10-01 | T1 | Wand press changed nothing: a failed first dev-license mint cached `null` forever in `licenseP`, and the transform's `res?.ok` gate turned every refusal into a silent speak-as-built — a license problem looked exactly like a dead button | `voiceLicense` + `transformAndSpeak` in `public/board/speech.js` | `licenseP` clears on null so the next press retries; a refused transform toasts in product voice — `bad_license` is the Lifetime upsell with an Open Settings action, not an error code. CDP probe: stubbed 403 → toast, live "want I" → "I want." |
| 2026-09-30 | T1 | ✨ fix-it (and every first-time sentence) spoke word by word instead of one ElevenLabs utterance — the 300 ms race always expired before a fresh mint landed | `speakSentence` deadline in `public/board.js` (024 rule 1) | Founder revised rule 1: speaks wait out the mint (10 s cap); word clips are the failure path only. `src/board/voice_sentence.test.mjs` |
| 2026-09-24 | T2 | Predict strip offers words that don't continue the sentence (`want` after `go do play want`): the open sentence trains `history_count` on every tap, and `hist` falls through to a word's lifetime share when that word never followed the context | `history_count` + `hist` in `public/shared/funnel.mjs` | History is written only when a sentence closes spoken. `hist` is Witten-Bell interpolation. `src/board/strip_history.test.mjs` |
| 2026-09-24 | T2 | Board stays blank: boot throws before `renderGrid` because a persisted DB is missing columns the shipped schema added (`spotlit`, `share_research`) | `public/shared/migrate.mjs` | Catalog regenerated from `schema.sql`. Migration now parses `CREATE TABLE` past semicolons in comments, and drops triggers that name a table being rebuilt so `ALTER RENAME` can finish. `src/board/migrate.test.mjs` |
| 2026-09-24 | T2 | `stats.test.mjs` red on clean HEAD: `logSelection` gained a `history_count` write (017 step 10) while the test's table whitelist only enumerated the read surface | `public/shared/funnel.mjs` (`logSelection`) | Added `history_count` to the fixture tables. Fixture whitelists must cover every table the exercised code path *writes*, not only what the module under test reads |
| 2026-09-22 | T2 | Browser DB never persisted: `OpfsDb` can't install on the main thread (worker-only `Atomics.wait`/`createSyncAccessHandle`), so the board silently ran `:memory:` and every entity/arrangement was lost on reload | `public/db.js` storage backend | Switched to `JsStorageDb("local")` (kvvfs → localStorage), the only vendored main-thread VFS; `persistent` now gated on `localStorage instanceof Storage` because kvvfs fabricates in-memory storage when blocked. Commit c2c2fd2 |

## 2026-09-22 opfs-main-thread

Tier: T2
Truth owner: `public/db.js` — which sqlite-wasm VFS backs the on-device DB
Lie-prone layer: the `sqlite3.oo1.OpfsDb && self.crossOriginIsolated` guard — the first half was always undefined, so the "persistent" branch never ran; the console.warn fallback was the only honest signal and nobody watched it
Proof: node --test src/board/groups.test.mjs; live CDP probe on dev:agent — `OpfsDb`/`sqlite3.opfs` undefined, OPFS root empty, a `JsStorageDb` row and caregiver edits surviving reload (commit c2c2fd2)
Pattern candidate: a capability check that only runs when the feature is missing is self-sealing — assert the positive path ("a row survives reload"), not the constructor's existence

## 2026-09-24 blank-board-stale-schema

Tier: T2
Truth owner: `src/board/schema.sql`, shipped to the browser as `catalog.schemaSql`
Lie-prone layer: `migrateSchema` treated the first semicolon as the end of `CREATE TABLE`, so a comment in `learner_profile` hid every later column; `ALTER TABLE … RENAME` then failed while a trigger still named the dropped table
Proof: node --test src/board/migrate.test.mjs
Pattern candidate: a DDL scanner that stops at `;` cannot see columns written after a comment semicolon — assert the column exists on a database created from the previous statement

## 2026-09-24 stale-fixture-write-surface

Tier: T2
Truth owner: `public/shared/funnel.mjs` — `logSelection` writes `history_count` since 017 step 10
Lie-prone layer: `statsOnlyDb`'s comment promised "ONLY the tables the module may read" — true for `stats.mjs`, but the same fixture feeds `logSelection`, whose write surface grew without the fixture noticing
Proof: node --test src/board/stats.test.mjs — failed on clean HEAD (`no such table: history_count`); green after adding the table
Pattern candidate: a minimal-table fixture must enumerate what the exercised code writes, not just what the module under test reads — a writer that gains a table breaks every fixture that whitelists only the reader's surface

## 2026-09-24 predict-strip-repeats-the-sentence

Tier: T2
Truth owner: `history_count`, written from a spoken sentence; the `hist` feature in `public/shared/funnel.mjs`
Lie-prone layer: `logSelection` wrote `history_count` on every tap (so the open sentence counted itself, and Clear/backspace never undid it), and the per-word backoff dropped to the lifetime share whenever that one word had not followed the context
Proof: node --test src/board/strip_history.test.mjs — fresh `go do play want` offers none of those words; after spoken `want` continuations, `juice`/`more`/`cookie` lead and `hist(juice) > hist(want)`; a cleared sentence leaves `history_count` unchanged
Pattern candidate: a running count trained on the open bar will echo the bar back — assert the strip against a sentence that is logged but not spoken

## Template

```text
## YYYY-MM-DD <fingerprint>

Tier: T1|T2|T3
Truth owner:
Lie-prone layer:
Proof: npm test
Pattern candidate: (optional)
```
## 2026-10-01 sentence-bar-offscreen-after-welcome

Tier: T3
Truth owner: the document. A keyboard pan that no JS metric can see cannot be repaired by JS — the welcome's Continue must leave the document (`public/board/onramp-ui.js`).
Lie-prone layer: every in-page measurement. Four deployed fixes all failed on the device — scroll clamp (`bce6acc`), focus-aware re-clamp (`d71abac`), self-heal + metrics banner (`afab0f6`), `#app` pinned to the visualViewport rect (`d16b031`). `scrollY`, `visualViewport.offsetTop`, and `getBoundingClientRect` can all read normal while the render stays shifted.
Proof: node --test src/board/onramp_exit.test.mjs — red on the old wiring (`finish()` removed the overlay and stayed), green when it navigates and boot gates the tour on the consumed `pip_tour` flag. Device proof is the founder's iPad per `docs/phases/034_Welcome_Page.md` § Works test — desktop cannot reproduce the pan.
Resolution (034): `finish()` blurs, `await saveUser`, `await flushDb` (sqlite debounce), sets `pip_tour`, `location.replace(location.pathname)`. The board boots as a returning user and starts the tour from the flag. `viewport.js` stays as defense for adult-side inputs.
Follow-up same day: the bar was back but the grid sat scrunched above dead space — the fresh boot pinned `#app` to a `vv.height` read while the keyboard was still animating closed, and no reliable `resize` ever corrected it. `applyVisualFrame` now writes only `top`/`left`; CSS (`height: 100%`) owns the size so a stale measurement can never be baked in. Same law: never write a viewport measurement into durable state.
Pattern candidate: when the observable layer is the suspect, stop measuring and discard the state — a fresh document inherits nothing. If this still fails on the device, the pan is not document-bound and the next move is a keyboard-free name field (Pip keyboard), never more pin logic.

## 2026-10-01 strip-slots-shrink-with-board

Tier: T2
Truth owner: `stripSlots` in `public/board/strip.js`
Lie-prone layer: the geometry itself — `floor((cols - 2) / 2)` looked like honest proportionality but quietly made suggestion count a function of grid density. On grid30 the tray's two slots meant one word + the faces: the least prediction for the children with the highest motor cost per tap, exactly backwards.
Fix: `stripSlots` is now `clamp(3..4, cols - 2)` — the smart bar's job is a fixed promise, cards go one column wide on sparse boards. grid30: 3 words + faces; grid15: 2 words + faces; grid60/90 unchanged. Faces get a full column (~57px per face on iPad grid30) — no squeeze, since fewer columns means wider ones.
Proof: node --test src/board/cells_density.test.mjs (new source assertion pins the floor); live CDP scripts/probes/density_probe.mjs on dev:agent — after Apply to grid30 the tray is `repeat(4, 1fr)` spanning cols 1–4, and with a word in the sentence the tray holds am/want/have + faces.
Pattern candidate: when a control's capacity derives from an unrelated axis (grid density), ask what the control's own job needs — derive the floor from the job, not the neighbor's geometry.

## 2026-10-01 tour-sentence-audio-silent

Tier: T2
Truth owner: `sayBar` in `public/board/tour-ui.js` for playback; `ONRAMP_CLIPS` in `public/shared/onramp_audio.mjs` for the shipped-clip inventory
Lie-prone layer: two stacked failures hid each other. (1) `sayBar("i-want-an-apple")` / `("i-wanted-an-apple")` fetched clips that were never added to ONRAMP_CLIPS — so they were never minted and 404'd in prod. (2) Even with the files shipped, `sayBar` awaited a HEAD fetch before calling `new Audio().play()` — the tap's gesture window is spent by then, so iPad WebKit refuses the play and the code falls into `speakSentence()`, a license-gated pipeline a first-run user can't satisfy. Instruction clips played because they use `board.say` → `playClip` → the shared element inside the gesture.
Proof: node --test src/board/tour_audio.test.mjs — sayBar must ride board.say and never open a fresh Audio or fetch gate; both clip keys must exist in ONRAMP_CLIPS. Deployed clips verified 200 audio/mpeg on prod.
Resolution: `sayBar` is now `if (!(await board.say(name))) await board.speakBar()` — the shared element plays synchronously in the tap handler; a missing clip (falsy say) still falls back to live speech. Clips minted via scripts/voice/mint_onramp.mjs and shipped.
Pattern candidate: a "check then play" fetch inside a gesture-dependent path silently forfeits the gesture — play through the element the first tap already unlocked, and let the shared player's error path be the existence check.

## 2026-10-01 strip-stale-after-density-switch

Tier: T2
Truth owner: `renderStrip` in `public/board/strip.js` — tray contents (predictions, faces, expand) derive from `stripSlots(boardGeom().cols)`
Lie-prone layer: `cells-apply` called `setBoardLayout` → `renderGrid` → `rerenderView`, which *looks* like a full repaint — but `renderGrid` only rewrites the strip's grid template via `sizeStrip`. The tray's children stayed painted for the old density, so grid60→grid30 left 4 cards in a `repeat(2, 1fr)` tray that wrapped into a second row. `stripSlots` also dropped the bar to 2 cards on sparse boards — a density choice quietly shrank a product promise.
Proof: node --test src/board/cells_density.test.mjs — red on the old wiring (no renderStrip in the apply path; 2-card floor), green after. Live CDP probe scripts/probes/density_probe.mjs on dev:agent: before fix trayCols repeat(2, 1fr) held 4 stale children after Apply; after fix grid30 paints 3 word cards + faces across a span-4 tray. Group-door labels never clipped in headless Chromium at either density — that half is device-verified only, plausible same-cause (a wrapped strip row steals grid height on WebKit, clipping .glabel under overflow:hidden).
Resolution detail: `stripSlots` is now min(4, max(3, cols − 2)) per Motor_Grid § Strip, and `paintStrip`/`sizeStrip` clamp slots to `traySpan(cols)` — the painted count can never exceed the tray's physical columns, so Edit mode's third anchor can't wrap it.
Pattern candidate: geometry writes and content writes are different renders — any caller that resizes a grid template must also repaint the contents sized by it. "Looks like a full repaint" is not a repaint.

## 2026-10-01 wand-silent-403

Tier: T1
Truth owner: `voiceLicense` and `transformAndSpeak` in `public/board/speech.js`
Lie-prone layer: `licenseP ??=` cached the resolved value — including `null` — so one failed dev-license mint (server mid-reload, offline boot, non-loopback host) wedged every transform for the rest of the session; and `res?.ok ? … : null` discarded the refusal, so 403/503/network all looked identical: bar unchanged, speaks as built
Proof: node --test src/worker/transform.test.mjs src/board/txbar.test.mjs — 17/17; plus live CDP probe on dev:agent: "want I" → "I want." still lands; stubbed 403 → toast "Fix it comes with Pip Lifetime — a grown-up can unlock it in Settings" with an Open Settings action into the license row's section; rejected fetch → "needs the internet"
Same-day revision: the first wording named error codes ("no license on this device") — true but not product voice. Refusals now speak like the product: plan name, grown-up unlock path, gentle reason.
Pattern candidate: a cached promise that resolves null is a permanent wedge — only cache successes, or clear the slot when it resolves empty

## 2026-09-30 speak-races-300ms-plays-word-clips

Tier: T1
Truth owner: `speakSentence` in `public/board.js` — the deadline passed to `sentenceVoice.request` (product intent: 024 rule 1)
Lie-prone layer: the 300 ms race looked like "▶ never waits", but a fresh ElevenLabs mint takes ~1–3 s, so *every* first-time and transformed sentence (✨ fix-it included) silently fell to the word-clip loop — the mint landed only for the second press
Proof: node --test src/board/voice_sentence.test.mjs — the board source assertion is red on the old `deadlineMs: 300` wiring, green with `SPEAK_VOICE_WAIT_MS`; the mint-inside-budget test guards the wait behavior itself
Pattern candidate: a deadline chosen for a cache hit silently decides behavior on a cache miss — measure the miss path (mint latency) before writing "instant" into a rule

## 2026-09-29 do-sql-exec-variadic-not-arrays

Tier: T2
Truth owner: `src/worker/tile_ledger.mjs` — every `sql.exec` call against the Durable Object's SQLite
Lie-prone layer: call sites passed params as one array (`sql.exec(q, [a, b])`); the real DO's `sql.exec` is variadic, so `node:sqlite` read the array as named parameters and threw `Unknown named parameter '0'` — only at the first real `wrangler dev` run, not in review
Proof: node --test src/worker/tile.heavy.test.mjs — failed on the DO path before the fix, green after converting all call sites to `sql.exec(q, a, b)`
Pattern candidate: code written for a DO storage API must be exercised against the real `wrangler dev` binding at least once — a light-test shim that accepts array params hides the contract mismatch

## 2026-09-29 ready-row-missing-r2-object-loops-forever

Tier: T1
Truth owner: `src/worker/tile.js` `serveClip` — the ready→R2→hit path
Lie-prone layer: "R2 object gone — fall through and re-mint it" looked safe, but `claimMint` refuses `ready` rows, so the rerun recursed until the request died (live: 62 s → 503 on a seeded clip whose object was absent from local R2)
Proof: node --test src/worker/tile.test.mjs — seeded row + missing object now demotes via `missingObject` and re-mints once (`x-tile-cache: mint`)
Pattern candidate: a "fall through and retry" path must verify the retry gate can actually open — if the state the gate checks is the same state that triggered the fall-through, the loop is infinite; demote first

## 2026-09-29 heavy-test-inherits-dev-vars

Tier: T3
Truth owner: `src/worker/tile.heavy.test.mjs` — spawns its own `wrangler dev`
Lie-prone layer: the spawned wrangler read the developer's `.dev.vars`, so a later `TILE_LIVE=1` turned the "stub mint" assertion into a real vendor call
Proof: node --test src/worker/tile.heavy.test.mjs — green with `--env-file` pointed at a minimal vars file the test writes itself
Pattern candidate: a test that launches a real server must control the server's env file, not inherit the developer's — `.dev.vars` drifts as features ship
