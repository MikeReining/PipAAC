# 029 — Add a word: type it, tap once, it's finished (PROPOSAL)

**Status:** **PROPOSAL, awaiting founder review (2026-09-29).** Nothing built.
No paid generation (image or voice) runs from this doc; every live mint stays
founder-gated until the § 6 decisions are made.
**Trigger:** founder test 2026-09-29 — typed "apple sauce" into Add to My Words
and got a confusing sheet: the right action (the dashed "New" row) looked like
the weakest thing on screen, and after tapping it the form asked questions
with no stated purpose (kind, photo, hint), said nothing about sound, nothing
about a picture, and nothing about where the word would go.
**Composes (does not replace):** 028 (tile voice mint), 010 slice 6 (Draw it
for me), 010 slices 2–3 (extended library), `Personal_Entities.md`
(enrichment).
**Truth owners:** the local database (the tile exists the moment it is
saved), the R2 object (the clip or drawing exists), and a stopwatch on a real
tablet (§ 7).

---

## 1. The bar

> Type **applesauce**, press Return. Within a few seconds the tile is on the
> board with **our drawing** and **the board's voice** saying it. No question
> was asked. Anything the adult wants to change is one tap away on the same
> card.

The adult supplies only what a model cannot know (Design Invariants § 7):
the word, and optionally a photo or a sentence about what it is. Everything
else — color/kind, picture, voice, filing — has a default made for them.

Competitors add a button through an edit mode, a label field, a symbol
search, a save, and a recorded or device voice. We have not timed them
ourselves; § 7 Works Test 1 times ours, and a side-by-side timing of one
incumbent is a cheap follow-up if the founder wants the claim.

## 2. What's wrong today (code truth)

Traced from `public/board/add-flow.js` (`openAddForm` → `renderAddMatches` →
`#add-save` → `createEntity` + `placeItem`) and `public/index.html` § addform.

| # | Problem | Where |
| --- | --- | --- |
| 1 | The creating action is a dashed, low-contrast row; three full-width outlined buttons (Paste a list, Add photos, Cancel) outrank it. | `#add-new` vs `#add-bulk`, `#add-photos`, `data-close` |
| 2 | "New" opens a form instead of creating. Save is a second tap after three questions. | `#add-new` click only unhides `#add-newfields` |
| 3 | **Hint is stored and read by nothing.** Its only intended consumer, entity enrichment, is not built (`Personal_Entities.md` § enrichment; no client/Worker code calls it). The adult is asked for input that does nothing. | `createEntity(... hint)` → `personal_entity.hint` |
| 4 | "What kind of word is it?" contradicts `Personal_Entities.md` ban table ("No type … UI") — added in 018 D7 for tile color. A model can infer it. | `#add-kind` |
| 5 | A new word **speaks with device TTS**. 028 (mint in the board voice) is decided, not built. | `resolveSlot` entity branch, `public/shared/voice.mjs` |
| 6 | A new word **has no picture** unless the adult uploads a photo. Draw it for me (010 slice 6) is decided, not built — no Worker route exists. | `src/worker/` has no draw route |
| 7 | "applesauce" **already has a drawing** — `out/extended_art/applesauce.png` is one of 1,934 unreviewed extended images — but none ship, so the catalog can't match it. | 010 slice 2 review not done; slice 3 not built |
| 8 | "apple sauce" (space) would not match "applesauce" even once it ships. | `catalogMatches` uses normalized text; no compound folding |
| 9 | Where the word goes is only the sheet title ("Add to My Words"); other groups are offered in a toast after the sheet closes. | `offerOtherBoards` |
| 10 | No way to hear a match before adding it. | match rows have no ▶ |

## 3. Gap map: documented vs. missing

| Capability | Status | Doc |
| --- | --- | --- |
| Voice minted once in the board's voice, shared by text | **Decided, not built** | 028 (slices 1–2) |
| Drawing in house style (Jev lens → Muse Image → R2) | **Decided, not built** | 010 slice 6, `Clipart_Pipeline_And_Catalog_Growth.md`, `Word_Library.md` § 6.1 |
| Extended library (3,400 drawn words) | **Words done, art generated but unreviewed, not shipped** | 010 slices 2–3 |
| Enrichment (what the hint is for) | **Decided, not built** | `Personal_Entities.md`, `Dual_Engine_Predictive_Intelligence.md` § 5.6 |
| Drawing **automatically** on every new word | **Not documented** — 010 slice 6 is a button, 5 free / 300 lifetime | needs § 6 decision 1–2 |
| Drawings **minted once and shared** (cache hit before generating) | **Not documented** — pipeline always generates; reuse only after k ≥ 20 review | this doc § 5 |
| The add sheet and the "just added" card | **Not documented** | this doc § 4 |
| Compound/spacing match ("apple sauce") | **Not documented** | this doc § 4.1 |
| Kind inferred instead of asked | **Contradiction** between `Personal_Entities.md` and 018 D7 | this doc § 6 decision 3 |

So: most of the engine is specified. What's missing is (a) the experience
that ties it together, (b) the decision to draw automatically, and (c)
mint-once economics for pictures, matching what 028 already does for voice.

## 4. The design

### 4.1 Step 1 — Type (the sheet)

```text
┌──────────────────────────────────────────────┐
│ Add a word                         to My Words ▾   ✕ │
│ ┌──────────────────────────────────────────┐ │
│ │ apple sauce▍                             │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│  ┌──────┐  applesauce                    ▶   │  ← best match, highlighted,
│  │ 🥣   │  our picture · our voice      [Add]│    Return adds it
│  └──────┘                                    │
│  ┌──────┐  applesauce pouch              ▶   │
│  └──────┘                                    │
│  ┌ ─ ─ ─┐  "apple sauce" — make a new word   │  ← always last; primary
│  │  +   │  we'll draw it and voice it  [Make]│    when there is no match
│  └ ─ ─ ─┘                                    │
│                                              │
│  Adding lots?  Paste a list · Add photos     │  ← quiet text links
└──────────────────────────────────────────────┘
```

- **One primary action, always the top row.** Return does it. With a match,
  it's the match; with none, it's Make.
- **Destination is a chip in the header** ("to My Words ▾"), changeable
  before adding (multi-select, reuses 027 add-to-boards). No post-hoc toast
  needed for the common case.
- **▶ on every match row** plays the clip that will speak.
- **Paste a list / Add photos** become one quiet text line. **Cancel** is ✕
  (and Esc / tap outside).
- **Near-match folding:** compare with spaces and hyphens removed as a second
  key ("apple sauce" ⇄ "applesauce", "ice-cream" ⇄ "ice cream"). This is
  string normalization, not a language rule.

### 4.2 Step 2 — Make (no form; the tile is created)

Tapping Make (or Return) **saves immediately** (offline-first, same
`createEntity` + `placeItem`) and turns the sheet into the word card for the
new tile:

```text
┌──────────────────────────────────────────────┐
│  ✓ Added to My Words                     Done │
│                                              │
│        ┌────────────────┐                    │
│        │   (drawing…)   │  ← shimmer → our   │
│        │                │    drawing appears │
│        │  apple sauce   │  ← tile, real size │
│        └────────────────┘    and real color  │
│                                              │
│  🔊  Making Eve's voice…  →  ▶ plays once    │
│                                              │
│  Picture   [↻ Draw again] [📷 Photo] [✎ Describe it] │
│  Voice     [▶] [🎙 Record your own]          │
│  Kind      [● thing ▾]   Also in [+ group]   │
└──────────────────────────────────────────────┘
```

- **Voice** (028 § 5.2): "Making {voice}'s voice…", then it plays once
  automatically so the adult hears it without asking. Hit = instant.
  Failure/held = message + Record. Never device TTS.
- **Picture**: if a shared drawing exists (catalog, extended, or a prior
  mint of the same text), it appears at once. Otherwise it draws (§ 5).
  **People and pets** (Jev scope = `personal`, e.g. "Grandma Rosa",
  "Cooper") are not auto-drawn: the picture slot shows the initial and a
  prominent **Add a photo**, with **Draw it** secondary — people are best as
  photos (`Word_Library.md` § 6.1).
- **✎ Describe it** replaces the Hint field and says what it's for:
  *"Tell us what it is — we'll draw it again. e.g. our golden retriever."*
  The same text feeds enrichment when that lands. One field, one visible
  purpose.
- **Kind** is inferred (Jev, same call as the drawing's framing lens) and
  shown as a color chip; tap to change. Offline default: thing (Yellow),
  corrected when the call returns — never after the adult changed it.
- **Done** closes. Leaving without Done keeps everything — nothing waits on
  this card.

### 4.3 Many words at once

Paste a list and Add photos keep their sheets. After save, each new row
voices and draws in the background with one progress line ("Drawing and
voicing 12 of 40"); the words are usable (label + color) immediately.

### 4.4 The child never waits and never sees churn

Minting happens on the adult side (028 § 5.2). A tile whose drawing is still
coming shows its label and color, then the picture fills in once. It is
never removed or hidden (memory: never interfere with the child).

## 5. Pictures minted once (amends 010 slice 6)

Mirror 028's ledger for images:

```text
key   = sha256( style_version | lens | normalizedText | normalizedHint )
hit   → R2 object, free
miss  → Jev (scope, lens, kind) → Muse Image (gen.mjs settings, pip-v1 refs)
        → R2 `drawing/<key>.png` → ready
```

- **No identity in the key or ledger** (same rule as 028 § 2.2). Two
  families who type "applesauce" pay once; the second gets it instantly.
- **Re-roll** creates a new variant under the same key (`v2`, `v3`); the
  family's choice is a per-entity picture override and does not change what
  others get.
- **Personal-scope text** ("Cooper" + "our golden retriever") is still keyed
  and cached by text only — a drawing of a golden retriever reveals nothing —
  but never enters the k ≥ 20 catalog review queue (unchanged).
- Safety check on word + hint before generating (unchanged, 010 slice 6).
- One ledger for both assets is attractive (`AssetLedger`, kind =
  `audio|image`); decide at 028 slice 1 so voice isn't built twice.

## 6. Decisions for the founder

1. **Draw automatically on every new non-person word?** *Recommend yes.*
   About 1¢ a miss, $0 a hit, and it is the wow. 010 slice 6 currently makes
   it a button.
2. **What counts against the drawing allowance** (5 free / 300 Lifetime,
   `Pricing_And_Packaging.md` § 4.2)? *Recommend: cache misses and re-rolls
   only; shared hits are free.* Open sub-question: does a free user's
   auto-draw stop after 5 (then the card offers Photo), or is the auto-draw
   free and only re-rolls are metered? This is a pricing call.
3. **Remove the kind question; infer it.** *Recommend yes* — resolves the
   `Personal_Entities.md` vs 018 D7 contradiction; the chip keeps the
   override.
4. **Replace "Hint" with "Describe it" on the picture.** *Recommend yes.*
5. **Review the 1,934 already-generated extended images** (010 slice 2, no
   new generation). This is the cheapest wow: every common word becomes an
   instant hit with no cost and no wait. Founder time, not money.

"In your voice" here means the board's chosen voice (Eve, etc.) per 028 —
not a cloned parent voice. Say so if you meant a clone; that's a separate
decision.

## 7. Works Tests

1. **Stopwatch.** On a real iPad, fresh profile, network on: type
   "applesauce" + Return → tile on the board with drawing and clip playing.
   Record wall time for (a) a shared hit and (b) a cold mint. Report both;
   no target invented.
2. **Two taps, zero questions.** The add path from typing to a saved,
   placed entity requires no field other than the name (DOM test: Make with
   only `#add-name` filled creates `personal_entity` + placement).
3. **Offline add.** Network off: Make saves, tile shows label + color,
   card shows "will draw and voice when online"; reconnect → both fill in.
   No device TTS (spy = 0).
4. **Mint once (instrument the code can't influence).** Two profiles make
   "applesauce": OpenRouter's usage log shows one image call; ElevenLabs'
   counter shows one clip (028 WT 9).
5. **Person words aren't auto-drawn.** "Grandma Rosa" → zero image calls;
   card leads with Add a photo.
6. **Near-match.** "apple sauce" lists catalog "applesauce" first once the
   extended library ships.
7. **Child board untouched.** During a pending draw, the child's grid never
   loses or moves the tile; picture swaps in place once.

## 8. Slices (proposed order)

| # | Slice | Needs money? | Depends on |
| --- | --- | --- | --- |
| A | Sheet + "just added" card (§ 4.1–4.2), near-match folding, ▶ on matches, kind chip (default Yellow until Jev), Describe it field. Pure client. | No | — |
| B | 028 slices 0–2 (voice mint) wired into the card. | Stubbed in dev; live ≤10 founder-gated | 028 |
| C | 010 slice 2 founder review of existing images → slice 3 ship as `secondary_fringe` | No (review only) | Founder time |
| D | Drawing Worker route with mint-once ledger (§ 5), Jev scope/lens/kind, auto-draw from the card. Amends 010 slice 6. | Stubbed in dev; live ≤10 founder-gated | Decisions 1–2 |
| E | Background draw/voice for Paste a list and Add photos (§ 4.3) | Budget caps | B, D |
| F | Enrichment reads "Describe it" | Jev | `Personal_Entities.md` |

A is shippable tomorrow and alone fixes the confusion in the founder's
screenshots. B + C + D make it category-defining.

## 9. Docs this would amend on acceptance

- `010_Extended_Picture_Library.md` slice 6: button → automatic; mint-once
  ledger; allowance counting.
- `Word_Library.md` § 6.1, `Clipart_Pipeline_And_Catalog_Growth.md` § 1–2:
  cache check before generating.
- `Personal_Entities.md`: hint → "Describe it"; kind inferred + chip.
- `018_Core_Board_V2_And_Groups.md` D7: kind select → inferred chip.
- `Pricing_And_Packaging.md` § 4.2: what a "drawing" counts.
