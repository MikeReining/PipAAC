# Phase 013 — Spotlight and Partner Modeling

**Status:** All 7 slices built (the layer; one-device lists, sessions,
timer; the adult's device — mirror, remote start/end; live modeling;
Smart bar boost; Coach view; shared uses — 014 move marks and
prediction halos render through the same `layerMark` pass). The
design below is **DECIDED 2026-09-22** (founder; not built). Slices are
**PROPOSED**.

Founder intake: `docs/founder/2026-09-22_Spotlight_Partner_Modeling.md`.
Renamed from "Spotlight Practice Mode" the same day, when live partner
modeling joined it.

| Topic | Owner |
| --- | --- |
| The attention layer, Spotlight, live modeling | this doc |
| Masking (hidden words) | `docs/product/Vocabulary_Masking_And_Safety.md` |
| Grid stability; Smart bar | `docs/product/Motor_Grid_And_Art.md` §§ 1, 2.1 |
| Prediction halos (fading prompt) | `docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 7.4 |
| Upgrade highlight | `docs/phases/014_Grid_Density_And_Fit.md` § 4 |
| Sync, linked devices, relay | `docs/product/Sync_And_Web_Editing.md` |
| Edit mode (changing the board) | `docs/phases/009_Word_Library_And_Customize.md` |

---

## 1. Why this phase exists

Adults need to point a learner at words: a lesson's targets, a word they
are modeling, a word that moved. The old answers were bad. Hiding the
other words turns the board into blank holes and silences the child;
taking the child's device to model takes their voice away.

Children learn language by hearing it for thousands of hours before they
speak. AAC learners need the same immersion on their own system: partners
model words on the board while talking (aided language input, Vision
§ 2.5). Pip can do that from the partner's own device, without touching
the child's.

## 2. One attention layer

"Brighten some words, dim the rest, disable nothing" is one layer with four
uses:

| Use | Triggered by | Owner |
| --- | --- | --- |
| **Spotlight** | an adult starts a list of target words | this doc |
| **Live modeling** | an adult taps a word on their device | this doc |
| **Upgrade highlight** | an adult accepts a Cells change; moved words glow for a while | `docs/phases/014_Grid_Density_And_Fit.md` § 4 |
| **Prediction halo** | likely core words glow in place and fade as independent use grows | `docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 7.4 |

One visual language and one set of laws for all four.

### 2.1 Laws

1. **Never a muzzle.** A dimmed word stays 100% tappable, speaks, and joins
   the sentence. The layer changes how words look, never what the child can
   say.
2. **Never moves.** No cell moves, grows, or shrinks.
3. **Never changes the board.** No layer write touches the coordinate map,
   groups, or words. Changing the board is Edit mode (§ 5).
4. **Never unmasks.** A masked word stays masked; the adult is told it was
   skipped.
5. **Gentle.** Steady glow by default; pulse is optional; no flashing,
   strobing, or sound cues.

## 3. What a spotlight is

**A spotlight is a list of words, not a board or a group.** It shows on
the child's device wherever those words appear:

- **The word is on the current page:** its cell glows.
- **The word is inside a group:** the glow walks the route — the
  `🗂️ Groups` anchor, then the group's tile, then the word inside. The
  child learns the motor path to the word, not just the word.

The same route rule applies to live modeling.

## 4. Where it lives, who controls it, how long it lasts

**Shown on the child's device. Controlled from either device.**

| | Child's device | Adult's phone or laptop |
| --- | --- | --- |
| Shows the glow | ✓ | a mirror of the child's board, for aiming |
| Start a spotlight | Parent Corner | ✓ |
| End it | one tap on the chip | ✓ |
| Saved lists and settings | Parent Corner | ✓ (the natural place) |

**Turning it on is an adult action; turning it off is always one tap.**
Ending only restores the normal board, so the chip needs no PIN. The chip
appears only while a spotlight is running: `🔦 Brown Bear · End`, on both
devices. Nothing else about the layer is visible to the child.

**Three lifetimes.**

| Kind | Started by | Lasts |
| --- | --- | --- |
| **Live modeling** | an adult taps a word on their device | a few seconds, then fades, or until the child taps it. Never saved. |
| **Session** | an adult starts a saved list, or a quick pick | until someone ends it, a timer runs out, or local midnight at the latest. Survives an app restart; never becomes silently permanent. |
| **Saved list** | "Brown Bear", "Snack time" | until deleted. The list is saved; the glow is not. |

**Live modeling is silent by default.** The adult says the words aloud while
pointing, as in aided language modeling; their voice is the audio. Speaking
on the child's device is an option.

**Settings** (per profile, synced, editable on either device): dim level,
glow style (steady default; pulse optional; no motion), default session
length, whether the Smart bar gives target words a gentle Predict boost,
and whether live modeling speaks on the child's device. No fixed cap on
list length; the picker suggests keeping it short.

**Sync.** Saved lists, settings, and whether a session is running are
profile data and sync like any other edit. Live modeling taps pass through
the relay as encrypted, transient messages and are never written to the
sync log.

## 5. Not Edit mode

Both show the child's real board and take taps. Their purpose is opposite,
so they are separate modes with separate entry points.

| | Edit (✎, phase 009) | Spotlight (🔦, this phase) |
| --- | --- | --- |
| Changes the board | yes: add, move, remove, rename | never |
| A tap on a word | opens its word card | glows or unglows it |
| Drag, × badges | yes | none |
| Lasts | permanently | temporarily |
| Who sees it | the adult | the child |

They share one component: the board mirror on the adult's device (same
renderer, different gestures).

## 5a. Coach view (partner device)

**DECIDED 2026-09-22** (founder; not built). **Free — part of the product,
never a paid add-on.** Adults are the bottleneck in AAC: a child learns
from seeing words modeled, and most partners are unsure how. The partner's
board mirror becomes a quiet coach, for the adult only; nothing here shows
on the child's device.

- **Today's words to model.** The running Spotlight list (or the current
  routine's list, below) sits at the top of the mirror, each word one tap
  to model live.
- **One short tip per word, in plain language,** shown when the adult picks
  it: when to use it and a sample line ("`more` — pause mid-snack, then
  model *more crackers*"). Pip ships defaults; an SLP can edit a list's
  tips.
- **The basics, one line at a time:** point while you talk, model without
  expecting a response, wait. Shown once each, then out of the way.
- **The adult's own tally:** words the adult modeled today. It measures the
  partner, not the child, and stays on the partner's device.

**Routines** carry their own list: when a routine is on (morning circle,
snack, bedtime — occasions, `docs/phases/007_Occasions.md`), the Coach view
offers that routine's saved list.

## 6. Flows

1. **Prepare.** On a laptop: Spotlight → New list → tap words on the mirror
   or search → name it "Brown Bear" → Save. It syncs to the child's device.
2. **Start.** On either device: Spotlight → Brown Bear → Start. The child's
   board glows; the chip appears on both devices.
3. **Model live.** The partner switches the mirror to Model and taps
   `look`. On the child's device `look` glows, walking the route if it is
   in a group, then fades.
4. **End.** The chip on either device, the timer, or midnight.
5. **One device only.** Parent Corner → Spotlight → tap words on the board
   (or pick a saved list) → Start. The same picker as the partner device.

## 7. Withdrawn from the earlier draft

- The 1–5 target word cap: a default suggestion, not a limit.
- "Dimming to 30% is clinically beneficial for CVI": unsourced. CVI
  guidance tends to favor high contrast and motion, so the dim level is
  adjustable and Pip makes no clinical claim.
- Authoring presets only on the child's device: the adult's own device is
  the natural place, so no one takes the child's voice away to set up a
  lesson.

## 8. Vocabulary for code and docs

| Use | Never use |
| --- | --- |
| Attention layer, glow, dimmed | Disabled, locked, inactive (for dimmed words) |
| Spotlight, saved list, session | Focus Mode (AssistiveWare trademark), lesson lock |
| Live modeling, Model (on the mirror) | Remote control, takeover |
| Board mirror | Remote screen |
| Target words | Locked words, active keys |

## 9. Slices (proposed)

1. **The layer.** Glow and dim tokens, the laws in § 2.1, the route walk
   through groups. Works test: with a spotlight on, tap every dimmed cell —
   each speaks and joins the sentence; the coordinate map is byte-identical
   before and after.

   **DONE.** `public/shared/spotlight.mjs` owns the layer: a spotlight is
   a Set of `kind:id` targets, in-memory session state (lists and sync
   are slices 2–3); `startSpotlight` reports masked targets as skipped
   and refuses an all-masked list. `spotMark` glows/dims cells in
   `renderGrid`, `itemCell`, and `groupIndexCell`; `spotChrome` glows the
   `🗂️ Groups` anchor when a target needs the route walk
   (`needsRouteWalk` — any target in a group but off the board) and shows
   the `🔦 name · End` chip, whose one tap ends it. Tokens `--glow` /
   `--dim-o` in `public/index.html`. `window.pip.spotlight` is the
   start/end API slices 2–5 drive. Works Tests:
   `src/board/spotlight.test.mjs` (masked skipped, route groups found,
   maps untouched) and `scripts/probes/spotlight_probe.mjs` (1 glow + 59
   dimmed, a dimmed tap speaks and appends, index glows the containing
   groups, `juice` glows inside its group, chip clears all, map
   byte-identical).
2. **Spotlight on one device.** Saved lists, quick pick, session with timer
   and midnight end, the chip. Works test: start, restart the app — still
   on; pass midnight — off.

   **DONE.** Saved lists are `spotlight_list` + `spotlight_item`; the
   running session is one `spotlight_session` row holding name, resolved
   targets, `started_at`, and `ends_at = min(start + minutes, local
   midnight)` — all synced tables (`SYNCED_TABLES`), so a session started
   or ended on either side lands through `spot_start`/`spot_end` ops.
   `public/shared/spotlight.mjs` owns the lifecycle: `saveSpotList`,
   `deleteSpotList`, `spotLists`, `startSession`, `endSession`,
   `resumeSession` — the last reconciles the layer with the synced row
   at boot and after every sync drain: a live row relights the glow
   (restart survival), an expired row ends it (midnight or timer passed
   while away), no row means off. Parent Corner → Spotlight opens the
   sheet: saved lists (Start/Delete), **Pick words…** pick mode (taps
   choose targets on the board and inside groups, never speak —
   `picking` intercepts `tap`), and the synced settings segs:
   session length (until ended / 15 / 30 / 60), glow (steady / pulse —
   `spot_pulse`), dim (`spot_dim` → `--dim-o`). The chip ends the
   session row, not just the in-memory layer. Works Tests:
   `src/board/spot_session.test.mjs` (list CRUD through synced rows,
   midnight bound, timer math, resume/expiry, cross-db op replay) and
   `scripts/probes/spot_session_probe.mjs` (real UI: pick 2 → save →
   start from list → reload → still glowing → expire → reload → off;
   picks never append to the sentence).
3. **Adult device.** The board mirror, lists and settings from a linked
   device, start and end from either side. Works test: end on the phone,
   the iPad's glow clears.

   **DONE.** The mirror is the same renderer on the linked device: a
   paired phone shows the synced board, the glow, and the `🔦 name ·
   End` chip — no second component (Edit/Model gestures are slices 4+).
   Saved lists, settings, and the session row were already synced
   profile data (slice 2), so the gap this slice closed was the wire:
   `spot_start`/`spot_end` ops broadcast over ws land through
   `drainOps` → `onSyncApplied` → `resumeSession` + repaint on the
   other device (`public/board.js:197`). The probe surfaced one real
   bug: reopening Add a device mid-status-check let the detached
   input's late reply revive Allow bound to the new form's empty
   `pending` — guarded with `input.isConnected`
   (`public/board.js:3289`). Works Test:
   `scripts/probes/spot_mirror_probe.mjs` — two Chrome profiles pair
   over the real relay (Lifetime on the granter — free users are
   single-device); the phone starts the synced list from its own
   Spotlight sheet and the iPad shows 2 glow + 58 dimmed + the chip;
   the phone's chip tap clears the iPad; the reverse leg (iPad start,
   phone glow, iPad end, phone clears) passes too.
4. **Live modeling.** Model mode on the mirror; transient relay messages.
   Works test: a tap on the phone glows the word on the iPad and fades; the
   sync log has no new row.

   **DONE.** Spotlight → **Model — tap board words** puts the partner's
   board in Model mode (`#modelbar`, `setModeling`): taps send, never
   speak or append. The message is a `sealOp` envelope under the current
   epoch key sent up the authenticated ws (`sendModel` in
   `public/shared/sync.mjs`); the relay's `webSocketMessage` rebroadcasts
   it to the user's other sockets stamped `from` the sender's device —
   transient, never stored (`src/worker/relay.js`). The child's board
   opens it (`onModel`): the word's cell glows 4 s (`modelGlow`,
   `MODEL_FADE_MS`), the route walk lights for in-group words (Groups
   anchor + containing group tile), a child tap ends the glow early, and
   `model_speaks` (synced learner_profile column, Spotlight sheet seg —
   silent default per § 4) optionally speaks the word. Works Tests:
   `src/worker/model.test.mjs` (broadcast excludes sender, `from` stamped
   not forged, malformed dropped, nothing stored) and
   `scripts/probes/spot_model_probe.mjs` (paired phone taps `stop` →
   iPad glows and fades; `juice` inside Drinks lights the route walk;
   `sync_op` and `learner_event_log` unchanged on both devices; no
   speech while silent).
5. **Smart bar boost** for target words in Predict, never taking over the
   bar.

   **DONE.** While a session runs, the funnel flags target candidates
   `x.spot` (a recorded feature — impressions capture the flag, a fitted
   `spot` weight can replace the default later) and, when the synced
   `spot_boost` profile setting is on (default), scores them with
   `SPOT_BOOST = 1.5` — phrase-level, so evidence still outranks a
   boosted zero-evidence target (`public/shared/funnel.mjs`,
   `spotBoostOn`/`spotWeights`). The boost also lifts the evidence
   requirement: a never-picked fringe target becomes a candidate (tier,
   label, and mask rules still apply); core targets stay on the glowing
   grid and never enter the strip. `spotGate` replaces `showGate` at the
   strip and in the Jev rerank: at most half the slots (floor, minimum
   one) can be target tiles — the bar is never taken over. The toggle is
   a seg in the Spotlight sheet (`spot_boost`, `SYNCED_SETTINGS`);
   off means the strip ignores the session entirely. Works Tests:
   `src/board/spot_boost.test.mjs` (eligibility, ordering, cap,
   setting off, session end) and
   `scripts/probes/spot_boost_probe.mjs` (real board: tap "want" →
   rendered tray shows ≤ 2 of 4 targets, none before/after, setting
   honored, `core_cell` untouched).
6. **Coach view** (§ 5a): today's words, per-word tips, the basics, the
   adult's tally. Works test: open the mirror during a Spotlight — the
   list's words are at the top, and the child's device shows no coach
   content.

   **DONE.** A registry user that joins by link carries `role:
   "partner"` (`users.mjs`, `linkThisDevice`) — the partner device.
   During a session its board gains `#coachbar` under the topbar
   (`renderCoach`, called from `spotChrome`): the session's words as
   chips, one tap → the same transient `syncSendModel` path as Model
   mode, so the word glows on the child's board. A tapped word shows its
   tip — `spotlight_item.tip` (an SLP's per-list edit, synced op
   `spot_item_tip`) wins, then `catalog.coachTips` (47 shipped lines,
   `data/coach_tips.json`), then a generic line; the sheet's **Tips**
   button edits a list's tips and re-saving a list preserves them.
   The basics rotate through five one-liners, each dismissed once per
   device (`coach_basics_seen`, localStorage). The tally counts distinct
   words modeled today in `coach_event` — deliberately **not** in
   `SYNCED_TABLES`, so it measures the partner and never reaches the
   child's board; Model-mode taps count too. The child's device renders
   none of it (its user row has no role; restored devices get no role —
   a board by default). Routines stay deferred to 007. Works Tests:
   `src/board/coach.test.mjs` (tip sync/replay, re-save preservation,
   tally boundary, drain survival, resolution order) and
   `scripts/probes/spot_coach_probe.mjs` (paired phone shows 2 chips at
   the top, coach tap glows the route walk on the iPad, tip + tally +
   basics on B only, `coach_event` 1 on B / 0 on A, `sync_op` unchanged).
7. **Shared uses.** The 014 upgrade highlight and the prediction halos
   render through the same layer.

   **DONE.** `layerMark(el, key, { board })` in `public/board.js` is the
   layer's one mark pass: spotlight targets, live-model glows, the
   picker's chosen words, and — board cells only — the 014 `.moved`
   ring and the `.likely` prediction halos all paint through it; no
   renderer sets an attention class on its own. Marks compose (one cell
   can carry `glow` + `moved` + `likely`), the visual language stays
   distinct per meaning, and every law holds — dimmed cells still tap
   and speak, nothing moves, masked stays masked. `applyLikely` now
   owns `likelySet` state so halos ride `layerMark` on every render —
   previously a grid repaint dropped them until the next strip paint —
   and passes the local model `keyboardContinuations` requires, which
   it never did: the seg had thrown on every call, so halos had never
   rendered at all. Works Test:
   `scripts/probes/layer_shared_probe.mjs` (seeded history → 3 halos
   survive a repaint; `want` carries `glow`+`moved`+`likely`; 59 dimmed
   all tappable; session end clears only spotlight marks). DOM-bound
   change — the live probe is the focused proof.
