# Founder Intake: Customization, the Word Library, and sync

**Intake date:** 2026-09-22.
Source: founder brainstorm session on customization friction (competitor
comparison with Proloquo2Go, then two rounds of founder rulings).
Intake workflow: `docs/workflows/SSOT_Founder_Input_Workflow.md`.
Nothing in this file is the truth owner. Routed claims live in the docs named
below.

## Founder intent

1. Adding items is a huge friction today in Proloquo2Go. Pip should make it
   dramatically better and faster. Nailing customization wins a key area.
2. A word does not belong to a group in Pip (groups, My Words, occasions).
   That is more powerful, but a parent must be able to answer: where did my
   word go, how do I find it again, how do I edit it. Agreed: the Photos app
   model (Library + albums + info panel).
3. Editing is missing: open a group, change words, remove, reposition,
   rename, re-photo.
4. Voices: the schema already lets a profile pick a preferred voice (our
   default, a male voice, a little girl's voice …). ElevenLabs voices for
   every word. A recording of your own is an override for that word.
5. Multiple photos at once: yes. Question: can we read the iPhone's People
   names? (Answer: no; see Audit findings.)
6. Save-from-sentence: **rejected** ("the user doesn't type sentences").
7. Bulk mode: one word per row, then pictures.
8. A much bigger clipart library (1,000–2,000 images plus phrases) so a new
   word usually comes with our picture. "A thousand images only cost us
   $10 … high leverage and high wow." Clipart first; real photos not the
   default.
9. With listening on, overheard words become suggestions in the Library:
   **single words only, local, on the device only.**
10. **Platform:** an iOS app in the App Store, 100%. The web app also
    exists and differs a little. Offering both, with editing in the
    browser, is a differentiator.
11. Sync, so a user can edit on a computer and have it on the iPad.

## Product value

- An adult adds a word in seconds, usually with a picture already drawn,
  and can find and change it later from one place.
- One word can live in many groups without copies that drift apart.
- Families and SLPs edit at a real computer, and the child's iPad gets it.

## Audit findings that fed this intake

- **BUILT** already (the founder thought these were missing): many-to-many
  groups, Edit mode with move, swap, remove and add
  (`public/shared/groups.mjs`; Edit mode in `public/board.js`).
- **BUILT defect.** `+ Add` matches catalog senses only
  (`catalogMatches` in `public/shared/groups.mjs`). Typing an
  existing entity's name creates a duplicate, so an entity cannot reach a
  second group from the UI. Routed to 009 slice 1.
- **Correction accepted.** Preferred voice (`learner_profile.preferred_voice_id`)
  and `clip_override` are decided and in the schema
  (`docs/product/Language_And_Voice_Schema.md` § 6.1, § 6.3). What was
  missing is the picker and recorder UI, listed as not in the first build
  (§ 9, § 10 of that doc).
- **Drift.** `docs/product/Voice_Cloning_And_Synthesis.md` § 3 shows a
  `voice` insert with columns the schema does not have. Corrected to point
  at the schema.
- **Competitors record audio per button.** Proloquo2Go lets a button play
  a recording (a name, a joke, a doorbell)
  ([AssistiveWare](https://www.assistiveware.com/support/proloquo2go/organize/buttons/record-audio)).
  Table stakes, not a differentiator.
- **iOS People names are not available.** PhotoKit exposes no person or
  face-tag data to third-party apps
  ([Apple Developer Forums](https://forums.developer.apple.com/forums/thread/126711)).
  The system picker's own search can still be used to choose photos.
- **Contradiction found.** `docs/strategy/Vision.md` § 4.4 promises zero
  loss when an iPad breaks. The 002 pairing sketch says a board with no
  linked device is gone. Resolved by a proposed recovery sheet, pending a
  founder ruling.
- **Rule change.** Partner words were "never stored". Keeping single
  suggested words changes that. The sentence is still never stored.

## Routed decisions

- **DECIDED 2026-09-22** (not built). Word Library, word card, add paths,
  extended library, voices and recordings, suggested words:
  `docs/product/Word_Library.md`.
- **DECIDED 2026-09-22.** iOS App Store app plus web app:
  `docs/product/Platforms_iOS_And_Web.md`. The iOS build approach is open.
- **Direction DECIDED 2026-09-22, design PROPOSED.** Sync and web editing:
  `docs/product/Sync_And_Web_Editing.md`, with five open rulings in § 11.
- **DECIDED 2026-09-22.** Suggested words kept on device:
  `docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 6 (amended).
- **PROPOSED.** Schema additions (`image_override`, `secondary_fringe`
  tier, `heard_word`): `docs/product/Language_And_Voice_Schema.md` § 14.

## Execution

| Phase | Doc |
| --- | --- |
| 009 — Word Library and customization | `docs/phases/009_Word_Library_And_Customize.md` |
| 010 — Extended picture library | `docs/phases/010_Extended_Picture_Library.md` |
| 011 — Sync and web editing | `docs/phases/011_Sync_And_Web_Editing.md` |

## Round 2 rulings (same day)

The founder asked for a product-owner, first-principles pass ("think about
our users, think about our goal of winning"), then accepted every
recommendation ("all agreed").

1. **Duplicates: one meaning, one record, while the spelling may repeat.**
   Founder: "Bat. I might be talking about the flying animal. Bat. I might
   be talking about baseball … that's not a violation." We adopt
   WorkbookBench's rules: the context disambiguates, dedupe by meaning and
   never by spelling, and alternatives are pictures, never a blocking
   question. The silent second record is the bug, and fixing it is **P1**.
   → `docs/product/Word_Library.md` § 5.1; 009 slice 1.
2. **Retention.** Founder: keep data a long time, because customizing
   takes a ton of time. Ruled: a board is never deleted because of
   payment; deleted on request; idle boards after 3 years (longer than the
   founder's 1–2, because with no accounts the app is the only warning
   channel and storage costs pennies). → `docs/product/Sync_And_Web_Editing.md`
   § 6.
3. **Backup and the recovery sheet are free for every board.** Pip Lifetime
   adds more devices and the web editor. History stays on the device. The
   iPad's own backup is a second recovery path.
   → `docs/product/Sync_And_Web_Editing.md` § 9, § 11;
   `docs/product/Pricing_And_Packaging.md` § 2.
4. **Voices.** Launch with one default voice; add more quickly after
   launch. Record my own stays in 009. → `docs/product/Word_Library.md` § 7.
5. **Extended library:** at least 2,000 words and 300 phrases; invest in
   a fast review page. → `docs/phases/010_Extended_Picture_Library.md`.
6. **Draw it for me** for Pip Lifetime owners (founder: "a really killer
   idea"). The founder's first idea was a silent meter with a cutoff at
   100–200. Ruled instead: fair use with a 30-a-day abuse limit and about
   1,000 a year, shown only near a limit, never a silent cutoff; three
   versions to pick from; word plus hint; a safety check; 5 free drawings
   as a taste; a word drawn for 20 or more boards joins the library after
   review; more drawings by in-app purchase, priced later.
   → `docs/product/Word_Library.md` § 6.1; 010 slice 6.
7. **Editing.** Founder: removing an item frees its slot and never
   reshuffles; "remove and shuffle" is not a feature; drag to rearrange one
   at a time. Ruled: the iPhone home-screen model (drag, tap for the card,
   × to remove, tap an empty slot to add there), except removal never
   reflows. → `docs/product/Motor_Grid_And_Art.md` § Groups; 009 slice 2.
8. **First-run setup** "Tell us about their world" (People, Pets,
   Favorite foods, Places), proven with a stopwatch against Proloquo2Go.
   → `docs/product/Word_Library.md` § 5.6; 009 slice 11.

## Open questions for the founder

All six questions from round 1 were answered in round 2. Still open, and
decided when their slice starts:

1. Which voices come after launch, and their price (009 slice 5).
2. The in-app purchase price for drawings past fair use (010 slice 6).
3. How Apple School Manager and grant purchases interact with the
   Lifetime in-app purchase (`docs/product/Sync_And_Web_Editing.md` § 11).
4. The iOS build approach (`docs/product/Platforms_iOS_And_Web.md` § 3).
