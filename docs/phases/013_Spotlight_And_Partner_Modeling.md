# Phase 013 — Spotlight and Partner Modeling

**Status:** Ready for slice 1 (the layer). The design below is **DECIDED
2026-09-22** (founder; not built). Slices are **PROPOSED**.

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
2. **Spotlight on one device.** Saved lists, quick pick, session with timer
   and midnight end, the chip. Works test: start, restart the app — still
   on; pass midnight — off.
3. **Adult device.** The board mirror, lists and settings from a linked
   device, start and end from either side. Works test: end on the phone,
   the iPad's glow clears.
4. **Live modeling.** Model mode on the mirror; transient relay messages.
   Works test: a tap on the phone glows the word on the iPad and fades; the
   sync log has no new row.
5. **Smart bar boost** for target words in Predict, never taking over the
   bar.
6. **Coach view** (§ 5a): today's words, per-word tips, the basics, the
   adult's tally. Works test: open the mirror during a Spotlight — the
   list's words are at the top, and the child's device shows no coach
   content.
7. **Shared uses.** The 014 upgrade highlight and the prediction halos
   render through the same layer.
