# Maintenance Queue

Seeded 2026-09-30 from the structure scout (`code_maintainer_scan.py --top 15`
+ 60-day churn). Founder-approved order: Q1 first, then board.js slices in
order, then Q7, Q8. One slice per batch; commit before moving on.

| ID | Status | Target | Notes |
| --- | --- | --- | --- |
| Q1 | done 2026-09-30 | `public/index.html` inline `<style>` (~763 ln) → `public/board/base.css` | `css_surface`: hand-owned CSS >500 ln across many selector families. Cheapest batch; matches per-module CSS convention. |
| Q2 | done 2026-09-30 | `public/board.js` speech/audio pipeline → `public/board/speech.js` | ~400 ln: `playClip`/`playBlob`/`speak`/`speakItem`/`speakSentence`, `transformAndSpeak`, tile-voice mint/sweep/prefetch, `voiceLicense`. board.js slice 1 of 5. |
| Q3 | done 2026-09-30 | `public/board.js` prediction strip + expand mode → `public/board/strip.js` | ~400 ln: `paintStrip`/`renderStrip`/`predCard`/faces/`stripCards`/`stripSlots`/`sizeStrip`/expand. Slice 2. Dropped dead `closeExpand`. |
| Q4 | done 2026-09-30 | `public/board.js` grid render + geometry → `public/board/grid.js` | ~450 ln: `wordTile`/`fitLabels`/`boardGeom`/`homeTile`/`renderGrid`/`applyLikely`/`cellEls`. Slice 3. |
| Q5 | done 2026-09-30 | `public/board.js` spotlight attention layer → `public/board/spotlight-layer.js` | ~250 ln: `layerMark`/`spotPulse`/`bindSpotSettings`/pick mode/modeling/`spotChrome`/`controlPress`. Slice 4. |
| Q6 | done 2026-09-30 | `public/board.js` remainder | PIN→`pin.js`, segs→`settings-sync.js`, edit/undo→`edit-shared.js`, caches→`meta-cache.js`. board.js 2,994→1,412 ln: taps + boot + mounts. |
| Q7 | done 2026-09-30 | `src/worker/pictures.js` → find / draw / signals split | pictures_shared.js (298 ln) + pictures_find.js (47) + pictures_signals.js (142) + pictures_draw.js (486); pictures.js barrel 226 ln. |
| Q8 | done 2026-09-30 | `public/shared/groups.mjs` → geometry / seeds / ops / entities split | groups_shared.mjs (266 ln cell math+plumbing) + groups_seed.mjs (79) + groups_ops.mjs (315); groups.mjs barrel+reads 430 ln. |
| Q9 | watch | `editor-ui.js` (1,170), `devices-ui.js` (831), `word-card.js` (805), `relay.js` (730), `funnel.mjs` (655) | Cohesive enough today; re-score next scout. |
| Q10 | done 2026-09-30 | Ratchet: scanner report in `npm run check`, or growth-fail on flagged files | Growth-fail shape: `--ratchet LINE_BUDGET.json` in scanner + `maintainer:line-budget` gate in check:fast. 27 files pinned; growth or new ≥500-ln files fail. |
