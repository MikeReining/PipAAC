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
