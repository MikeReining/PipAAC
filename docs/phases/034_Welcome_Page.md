# 034 — Leave the panned document after the welcome

**Status:** ready to build (reviewed 2026-10-01). Replaces the earlier
`/new/` page proposal — see § Why not a `/new/` page.

## The bug

Fresh profile, `app.pipaac.org`, iPad Chrome: name → child/adult → Continue,
and the board shows with `#topbar` (sentence bar, Play, gear) off the top.
**A plain reload is correct every time.** DEBUGLOG
`2026-10-01 sentence-bar-offscreen-after-welcome` (T3).

Four deployed fixes failed on the device (scroll clamp, focus-aware clamp,
self-heal + banner, `#app` pinned to the visual viewport). All tried to
*measure and undo* the pan inside the poisoned document. Every metric read
normal while the render was shifted, so no in-page measurement can drive a
fix. The pan is **unproven theory**; the one proven fact is that a fresh
document renders correctly.

## Decision

Stop undoing the pan. **Discard the document the name field lived in.**

Continue → persist → hard navigation to `/` → the board boots as a returning
user (the path that already works) → the tour starts from a one-shot flag.

No new page, no new boot path, no new routes.

## Build

1. `public/board/onramp-ui.js` `finish()`: blur the field, `await
   saveUser({ needsSetup: false })` (look is already written by `setLook`
   before `finish`; both are synchronous kvvfs/localStorage writes under the
   awaited `putUser`), set `sessionStorage.pip_tour = "1"`, then
   `location.replace(location.pathname)`. A navigation, not
   `location.reload()`, so no scroll/viewport restoration is offered.
   Remove `wrap.remove()` / `wrap = null` / `onDone()` — the page is leaving.
2. `public/board.js`: drop `onDone`'s `renderGrid/renderStrip/tourUi.start`.
   After `tourUi` is mounted (line ~1272), where `onramp.start()` is
   decided: if `sessionStorage.pip_tour` is set, remove it and call
   `tourUi.start()`; else `if (me.needsSetup) onramp.start()`.
   Never start both. Consume the flag before starting so a refresh mid-tour
   does not replay it.
3. Revert the `appRoot()` plumbing for the **welcome** only
   (`onramp-ui.js` appends to `document.body` again); the tour keeps
   `appRoot()`.
4. Keep `viewport.js` as defense for adult-side inputs (Settings, add-word).
   Not touched.

## Honest limits

- This works only if a same-origin `location.replace` yields a fresh
  viewport. The founder's reload is the evidence; a replace is the same
  mechanism. If it fails on the device, the theory "the pan lives in the
  document" is dead and the next move is a keyboard-free name field (Pip
  keyboard) — not more pin logic. Log it in DEBUGLOG either way.
- The first board boot runs behind the welcome and is then thrown away
  (one extra boot, first run only). Accepted; it is the price of using the
  proven path.
- `pickPerson` for a new user with `needsSetup` is unchanged: it boots, shows
  the welcome, and navigates the same way.

## Why not a `/new/` page

It is the same mechanism (discard the document) plus a slim boot, art
resolution without the board DB, a worker route, a redirect ordering and
lock-release check, and deep-link handling. None of that is needed to get a
fresh document; `location.replace` gets it in two edited files. If
onboarding later outgrows `board.js` for its own reasons, split it then —
not as a bug fix.

## Works test

Founder, iPad Chrome, fresh/private profile at `app.pipaac.org`:
name → *A child* → Continue. Expect: page reloads itself, sentence bar at the
top, tour ring on *want*. Refresh mid-tour: no second tour, bar still there.
The device is the arbiter (§ Honest limits).

Automated: a boot-routing unit — `pip_tour` set → tour starts and flag is
consumed; `needsSetup` and no flag → welcome; neither → neither. Existing
`src/board/viewport.test.mjs` stays green.
