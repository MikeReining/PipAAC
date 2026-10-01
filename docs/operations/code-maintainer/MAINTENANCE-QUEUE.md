# Maintenance Queue

Seeded 2026-09-30 from the structure scout (`code_maintainer_scan.py --top 15`
+ 60-day churn). Founder-approved order: Q1 first, then board.js slices in
order, then Q7, Q8. One slice per batch; commit before moving on.

| ID | Status | Target | Notes |
| --- | --- | --- | --- |
| Q1 | done 2026-09-30 | `public/index.html` inline `<style>` (~763 ln) → `public/board/base.css` | `css_surface`: hand-owned CSS >500 ln across many selector families. Cheapest batch; matches per-module CSS convention. |
| Q2 | done 2026-09-30 | `public/board.js` speech/audio pipeline → `public/board/speech.js` | ~400 ln: `playClip`/`playBlob`/`speak`/`speakItem`/`speakSentence`, `transformAndSpeak`, tile-voice mint/sweep/prefetch, `voiceLicense`. board.js slice 1 of 5. |
| Q3 | open | `public/board.js` prediction strip + expand mode → `public/board/strip.js` | ~400 ln: `paintStrip`/`renderStrip`/`predCard`/faces/`stripCards`/`stripSlots`/`sizeStrip`/expand. Slice 2. |
| Q4 | open | `public/board.js` grid render + geometry → `public/board/grid.js` | ~450 ln: `wordTile`/`fitLabels`/`boardGeom`/`homeTile`/`renderGrid`/`applyLikely`/`cellEls`. Slice 3. |
| Q5 | open | `public/board.js` spotlight attention layer → `public/board/spotlight-layer.js` | ~250 ln: `layerMark`/`spotPulse`/`bindSpotSettings`/pick mode/modeling/`spotChrome`/`controlPress`. Slice 4. |
| Q6 | open | `public/board.js` remainder: PIN gate, settings-sync segs, edit/undo/toast, meta caches | Slice 5. End state: ~800–1,000-line boot + wiring coordinator. |
| Q7 | open | `src/worker/pictures.js` → find / draw / signals split | 1,137 ln, five route families. `pictures.test.mjs` + `pictures_draw.test.mjs` are the proof path. |
| Q8 | open | `public/shared/groups.mjs` → geometry / seeds / ops / entities split | 1,049 ln, ~50 exports, strong tests — safest big split, lowest urgency. |
| Q9 | watch | `editor-ui.js` (1,170), `devices-ui.js` (831), `word-card.js` (805), `relay.js` (730), `funnel.mjs` (655) | Cohesive enough today; re-score next scout. |
| Q10 | open | Ratchet: scanner report in `npm run check`, or growth-fail on flagged files | Would have flagged board.js crossing 2k. Decide shape at first lookback. |
