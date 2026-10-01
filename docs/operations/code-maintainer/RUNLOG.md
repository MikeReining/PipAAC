# Code Maintainer Runlog

## 2026-08-15 — harness bootstrap

- Imported dev harness from Ikiro.Studio (operations playbooks, agents, scripts, gates).
- Baseline health snapshot recorded in `HEALTH.md`.

## 2026-09-30 — batch 1 (lens: structure, founder queue override)

- Scope: `public/index.html` inline `<style>` block (763 ln) →
  `public/board/base.css`. Class: Extraction (css_surface finding per the
  skill's CSS surface escalation).
- Queue: seeded from the structure scout; Q1 done.
- Suppressions added for generated/vendor paths (wrangler/, out/, data/,
  public/vendor/, catalog + phrase-table copies, phrase_jev results).
- Proof: byte-faithful move (diff vs `git show` — only uniform dedent +
  two normalized token indents); braces 174/174; `npm run check:fast` green.
- Cascade order preserved: `base.css` links last, where `<style>` sat.
- index.html: 1,747 → 984 lines.
- Ratchet answer: a max-lines gate on hand-owned files would have flagged
  both this and board.js crossing 2k — queued as Q10.
- Next lens pointer: founder-named queue order overrides; Q2 (board.js
  speech slice) next.

## 2026-09-30 — batch 2 (lens: structure, founder queue Q2)

- Scope: `public/board.js` speech/audio pipeline → new
  `public/board/speech.js` (435 ln). Class: Extraction.
- Moved: Audio element + rate, tile voice library (tileApi, sweep,
  prefetch, status repaint), license plumbing, speak/playClip/playBlob/
  speakItem/speakSentence/speakFeeling, transformAndSpeak, online/offline
  tx-button listeners, SPEAK_VOICE_WAIT_MS.
- Seam: shared scalars through `live` getters/setters; `sentence`/
  `barState` shared by reference; board callbacks injected.
  `speakFeeling` moved too — `txBusy` guards it, so board.js holds no
  dangling speech state.
- board.js: 2,994 → 2,627 lines.
- Proof: node --check both files; import graph resolves (fails only at
  browser-served /vendor path, pre-existing); 61/61 board tests green
  (voice_sentence, voice_tile, voices, feeling, txbar, strip,
  editor_ui, keyboard_ui); check:fast green.
- Test fix: voice_sentence.test.mjs text-contract now reads speech.js
  for the wait cap + speakSentence (behavior contract unchanged).
- Next: Q3 — prediction strip + expand mode → board/strip.js.

## 2026-09-30 — batch 3 (lens: structure, founder queue Q3)

- Scope: `public/board.js` prediction strip + expand mode → new
  `public/board/strip.js` (289 ln). Class: Extraction.
- Moved: stripSlots/sizeStrip, expand state + openExpand, predCard,
  ghostCard, facesOn, faceCard, stripCards, paintStrip, renderExpand,
  renderStrip, entityCat cache.
- `live` hoisted to a named const shared by the speech and strip mounts;
  added getters (editing, picking, modeling, view, expressiveVoice, kbUi,
  groupsUi). renderStrip crosses into mountSpeech as a lazy thunk —
  both mounts reference each other's returns (TDZ).
- Dead weight: `closeExpand` had zero callers — deleted, not moved.
- board.js: 2,627 → 2,382 lines.
- Test fix: design.test.mjs palette contract now reads board/base.css
  (the file the page serves; contract unchanged).
- Proof: 150 board tests pass, 1 pre-existing failure —
  `add_word.test.mjs` "find a group" A–Z list fails identically on HEAD
  (verified via stash); NOT introduced here. check:fast green.
- Skipped findings: pre-existing add_word failure (group list ordering)
  — bug, not maintenance; left for a fix slice.
- Next: Q4 — grid render + geometry → board/grid.js.

## 2026-09-30 — batch 4 (lens: structure, founder queue Q4)

- Scope: `public/board.js` grid render + geometry → new
  `public/board/grid.js` (437 ln). Class: Extraction.
- Moved: `boardGeom`, `artInto`, `wordTile`, `fitLabels` + the
  ResizeObserver, `homeTile`, `renderGrid`, `applyLikely`,
  `tileForSense`, `showGroupHint`/`clearGroupHint` + `hintTimer`.
- `cellEls` hoisted above `live` (shared Map, passed into mountGrid);
  `movedSet`/`likelySet`/`boardSenseIds`/`highlightNext`/`countsOn` stay
  as board lets — `layerMark`/`spotChrome` read them, grid writes via
  `live` setters. `editorUi`/`placeUi` added to `live` getters.
- Mount order speech → grid → strip: speech gets `renderGrid` as a lazy
  thunk, grid gets `sizeStrip`/`openExpand` thunks (TDZ).
- board.js: 2,382 → 2,000 lines. Dead imports pruned (moveMarks,
  moveCore, stripRanked, entityForSense, groupDisplayName,
  maskedSenseIds, tileStateBadge, familyRow).
- Proof: 86 board tests pass; check:fast green.
- Next: Q5 — spotlight attention layer → board/spotlight-layer.js.

## 2026-09-30 — batch 5 (lens: structure, founder queue Q5)

- Scope: `public/board.js` spotlight attention layer → new
  `public/board/spotlight-layer.js` (173 ln). Class: Extraction.
- Moved: `layerMark`, `bindSpotSettings`, `spotPulse`, pick mode
  (`picking`/`updatePickBar`/`setPicking`), live modeling (`modeling`,
  `modelSpeaks`, `modelGlow`, `modelSent`, `clearModel`, `setModeling`,
  `onModel`), `spotChrome`, `controlPress`.
- State ownership flipped: `picking`/`modeling` now live in the module;
  `live.picking`/`live.modeling` delegate to `attention.*`, board call
  sites read `attention.picking`/`attention.modeling`. `modelSent`/
  `modelGlow` are shared objects destructured back for tap/pip. Grid's
  halo Sets (`movedSet`/`likelySet`/`boardSenseIds`) stay in board.js —
  the layer reads them through `live`.
- Mount order speech → attention → grid → strip. `initSync` gets
  `(m) => attention.onModel(m)` (top-level, TDZ); grid's
  `layerMark`/`spotChrome` params are the destructured consts.
- board.js: 2,000 → 1,864 lines.
- Proof: spotlight + edit/groups/strip/layout/editor/keyboard/design
  suites green; check:fast green.
- Next: Q6 — PIN gate + overlay helpers → board/pin.js.

## 2026-09-30 — batch 6 (lens: structure, founder queue Q6a)

- Scope: `public/board.js` PIN gate + overlay helpers → new
  `public/board/pin.js` (136 ln). Class: Extraction.
- Moved: `gatePin`/`PIN_SHARE_HINT`, `pinOn`/`renderPinRow` + the
  pin-change/pin-off listeners, `open`/`close`, the [data-close] and
  overlay-backdrop wiring. The Escape/hotkey router stays — it routes
  views, not overlays.
- `settingsUi` reached lazily via `live.settingsUi` (mounts after pin);
  `pinOn` read as `pin.pinOn` in the settings facts callback.
- board.js: 1,864 → 1,754 lines. Dead import: shared/pin.mjs dropped
  from board.js (openKeyStore still used elsewhere).
- Proof: pin + settings_ui + edit_mode + keyboard_ui + groups_ui +
  spotlight + design suites green; check:fast green.
- Next: Q6b — settings-sync segs (corner, fresh, grammar, expressive,
  look, share) → board/settings-sync.js.

## 2026-09-30 — batch 7 (lens: structure, founder queue Q6b)

- Scope: `public/board.js` settings-synced segs → new
  `public/board/settings-sync.js` (174 ln). Class: Extraction.
- Moved: syncFreshSeg, syncGroupSegs, syncGrammarSeg, syncExpressiveSeg
  + syncTryFaces + try-faces/expressive listeners, syncShareSeg,
  syncLook/setLook + look-seg listener — with their boot-time calls.
  Kept: the Highlight seg (keyboard-ui paints it via syncSettings),
  syncCorner (mode chrome, not a settings seg).
- `live` gained setters: freshAfterSpeak, grammarHelp, expressiveVoice;
  `grammarHelp` hoisted beside the other shared lets (the mount's seg
  syncs write it before its old declaration site — TDZ).
- board.js: 1,754 → ~1,610 lines.
- Proof: settings/forms/feeling/keyboard/pin/edit/strip/spotlight/
  groups/design suites green (41 tests); check:fast green.
- Next: Q6c — edit mode + undo/toast + flashCell → board/edit-shared.js.

## 2026-09-30 — batch 8 (lens: structure, founder queue Q6c)

- Scope: `public/board.js` edit mode + undo/toast → new
  `public/board/edit-shared.js` (134 ln). Class: Extraction.
- Moved: `setEditing`, `navCell`, `editPointer` (drag gesture),
  `xBadge`, `undoStack`/`undoLast`/`toast`/`toastTimer`, `flashCell`.
  `rerenderView` stays — it dispatches every view, not just edit.
- `live` gained `set editing` / `set countsOn`. Mount order is now
  speech → attention → editShared → pin → grid → strip → settingsSync;
  editShared takes renderGrid/applyLikely as thunks (TDZ), and pin's
  `toast` is the destructured const.
- board.js: ~1,610 → 1,497 lines.
- Proof: edit/editor/groups/library/design suites green; check:fast
  green. Pre-existing failure noted (not mine): web_editor.test.mjs
  "paste resolves own words" — 'orange juice' resolves 'sense' vs 'new'
  on clean HEAD too (catalog drift, same class as add_word ordering).
- Next: Q6d — meta caches (senseMeta/wordArt/entityRole/entityPhoto/
  sensePos/entityForSense-adjacent) → board/meta-cache.js.

## 2026-09-30 — batch 9 (lens: structure, founder queue Q6d)

- Scope: `public/board.js` metadata caches → new
  `public/board/meta-cache.js` (109 ln). Class: Extraction.
- Moved: senseMeta/metaFor, wordArt/artForWord, entityRole/
  roleForEntity, entityPhoto/photoFor, sensePos/posOfSense, senseById.
  The Maps come back in the mount's return so the sync drain clears
  them wholesale — call sites unchanged.
- `senseById` was a late const → now a mount return, so mountGrid's
  thunk became a direct ref.
- board.js: 1,497 → 1,412 lines.
- Proof: forms/strip/groups/edit/image_override green; check:fast
  green. Pre-existing failure noted: image_override expects no img_0384
  in the override list — fails on clean HEAD (catalog drift).
- Next: Q7 — src/worker/pictures.js route-family split. board.js is now
  ~1,400 ln of taps + boot + mount wiring; scan again before deciding
  whether more extraction pays.

## 2026-09-30 — batch 10 (lens: structure, founder queue Q7)

- Scope: `src/worker/pictures.js` (1,137 ln) → five modules.
  Class: Extraction (route families).
- `pictures_shared.js` (298 ln): json/okUuid/cleanText, fair-use consts,
  Jev classify, bge-m3 embed, pictureStub/picPost, rankSignals, findOne,
  findGuard, isUnsafe + BLOCK_TERMS.
- `pictures_find.js` (47 ln): handleFind, handleFindBatch.
- `pictures_signals.js` (142 ln): handlePick, handleReject.
- `pictures_draw.js` (486 ln): allowance/entitlement, blocklist-adjacent
  draw pipeline (refs, synthesize, single-flight claim, planner lanes,
  runDraw, handleDraw).
- `pictures.js` (226 ln): barrel re-exports + handleAllowance,
  handlePictureImage, handlePicturesAdmin — index.js untouched.
- Proof: pictures.test.mjs + pictures_draw.test.mjs — 55/55 through the
  real worker entry; check:fast green.
- Next: Q8 — public/shared/groups.mjs split (geometry/seed/ops/CRUD).
