# 034 — The welcome gets its own page

**Status:** proposal — awaiting review. Written after the sixth failed fix
for the missing sentence bar on first run (iPad Chrome). Nothing here is
built.

## The bug

On a fresh profile at `app.pipaac.org` on iPad Chrome: finish the welcome
(name → child/adult → Continue) and the board appears with `#topbar` off
the top of the screen — sentence bar, Play, and the settings gear all
gone — the grid shifted up and dead space at the bottom. The on-ramp tour
is running and functional; only the shell's top is missing. **A plain
reload renders correctly every time** (founder, repeated).

DEBUGLOG entry: `2026-10-01 sentence-bar-offscreen-after-welcome` (T3).

## What we have tried (all deployed, all failed on the real iPad)

| Commit | Theory | Result |
| --- | --- | --- |
| `bce6acc` | Document scrolled — clamp `scrollTo(0,0)` | No: `scrollY` was already 0 |
| `d71abac` | Clamp yields while a field is focused, re-clamps on focusout; welcome card lifts on focus | No |
| `afab0f6` | Self-healing check: measure `#topbar`'s rect, re-pin, banner with real metrics if still off | No — and every metric reportedly looked fine while the bar was visually gone |
| `d16b031` | Pan is a `visualViewport` offset `scrollTo` can't express: pin `#app` to the vv rect, correct by the measured bar gap, blur the name field before the overlay removes | No — same screenshot as before |

`src/board/viewport.test.mjs` proves the arithmetic, not the device. The
DEBUGLOG itself says: desktop Chrome cannot produce the iOS keyboard pan —
**unproven on real hardware.**

## Working theory — and why it may be unfalsifiable from inside

Focusing a real `<input>` opens the software keyboard; WKWebView pans the
visual viewport to reveal the field. The pan is supposed to unwind when
the keyboard closes. Everything we can measure — `scrollY`,
`visualViewport.offsetTop`, `getBoundingClientRect` — can report normal
while the rendering stays shifted. If the residue is invisible to JS, no
measurement-based self-heal can ever work, and we cannot tell the
difference between "our fix is wrong" and "the platform is lying" from
inside the page.

That is the stopping condition `docs/operations/Debugger.md` names: after
repeated reclassification, stop patching and change the boundary.

## The proposal

**The welcome becomes its own document, `/new/`.** The board never hosts
onboarding; onboarding never inherits the board's pinned shell.

The mechanism is not "we finally cleared the pan correctly." It is "the
document that got panned is discarded." A navigation to a fresh document
carries no viewport state — this is exactly why the founder's reload is
correct every single time. The proposal converts the proven-good recovery
path into the normal path, so the fix does not depend on the pan theory
being right: whatever onboarding poisoned lives in a document that no
longer exists.

### Flow

```text
/ boots → resolve user → me.needsSetup → location.replace("/new/")
/new/ → name + who (+ look for adult) → write registry row →
        sessionStorage tour flag → location.replace("/")
/ boots → needsSetup false → board renders → tour starts from flag
```

### What `/new/` needs (slim boot, no board.js)

- `openUserStore` + the active user id (`sessionStorage pip_active_user`,
  already set before the redirect), `putUser`.
- The recorded say-clips (`shared/onramp_audio.mjs`) — unchanged.
- The two look-preview tiles (`sns_0013` want, `sns_0128` apple): real
  catalog art without booting the board DB — resolve art URLs directly.
- The existing welcome markup/CSS moves over largely intact
  (`onramp-ui.js` becomes the new page's module; `onramp-ui.css` loads
  there instead of in `index.html`).

### What changes in `board.js`

- Redirect placed right after `me` resolution + `touchOpened`, before the
  heavy mounts — the redirect should be fast, not after a full board boot.
- `mountOnramp` and `if (me.needsSetup) onramp.start()` deleted.
- Boot reads the tour flag: `needsSetup` finished on `/new/` →
  `tourUi.start()` where `onDone` ran it today.
- `pickPerson` is unchanged: `pip_active_user` is set before the redirect,
  so a newly picked user with `needsSetup` still lands on `/new/` for the
  right person.

### What it deletes

- `onramp-ui.js`'s `appRoot()` plumbing and the blur-before-remove dance —
  the page's own document owns its fields.
- The whole class of "overlay contained by `#app`'s transform" wiring for
  the welcome. (The tour's `appRoot()` stays — the tour still runs on the
  board inside `#app`.)

### What it does not fix — honest limits

- The device keyboard still exists on `/new/`. If a residual pan could
  somehow survive a same-origin navigation (we believe it cannot — fresh
  WebCore viewport per document), the theory dies with it and the fallback
  is a keyboard-free name field (Pip keyboard), not more pin logic.
- Adult-side real inputs (Settings email, license key, add-word in
  device-keyboard mode) can still pan the board page. The viewport pin in
  `public/board/viewport.js` stays as defense-in-depth. This proposal
  removes the trigger from the first-run path only.

## Why not just `location.reload()` after Continue

Same mechanism, honest version: a reload flag on `finish()` would work
(`needsSetup` is persisted before the overlay closes). We choose the page
because the reload keeps the god-file shape — onboarding code still lives
inside `board.js`, still owns a piece of its boot, still fights `#app`.
The page is the same fix plus separation of concerns; the reload remains
the fallback if the review finds the split premature.

## Sanity checks for the reviewer

1. WKWebView viewport state across a same-origin forward navigation —
  confirm it cannot be inherited. `history.scrollRestoration = "manual"`
  is already set; bfcache/pageshow restore is the path to check.
2. Redirect ordering in `board.js`: everything before it (migrate, user
   resolution, the per-user write lock) must still run; the lock must not
   be held across the navigation (it is session-scoped — verify release).
3. `/new/` must be reachable directly (deep link / refresh mid-flow) and
   route to `/` when the active user is not `needsSetup`.
4. Confirm the worker serves `/new/` as a static route.
5. Tour flag lifetime: `sessionStorage` so a stale flag can't fire a tour
   on a later boot.

## Works test

On the failing iPad, fresh profile: land on `/`, redirected to `/new/`;
type a name on the real keyboard; pick *A child* → Continue. Expected:
`/ ` loads, sentence bar at the top, tour ring on *want*. Founder check is
the arbiter — no test substitutes for the device (established above).

Plus automated: existing `src/board/viewport.test.mjs` stays green; add a
boot-routing assertion (`needsSetup` → `/new/`, tour flag → tour starts)
if a harness exists for it.
