# Phase 003b — Groups 2.0 language follow-up

**Status:** Complete 2026-09-22 — slices 1–3 landed as `f203693`,
`cfcd0a9`, `5c971c4`; `npm run check` green at closeout.

**DECIDED 2026-09-22** (founder: "Please do all of the updates above … we
will fix the group section before working on the keyboard section", after
the locale review in the same session). A separate doc so it does not
collide with Groups 2.0 work already in progress.

**Order:** Groups 2.0 (phase 003) is complete and archived as of
`0555aa9`, so this phase is next. Finish it before
`docs/phases/004_Keyboard.md` begins. Slices 2 and 3 touch
the same files as the keyboard phase, so doing them first keeps the
keyboard work single-locale-clean.

Product truth this phase implements:

| Topic | Owner |
| --- | --- |
| Locale model, voice resolution, "a miss is a miss" | `docs/product/Language_And_Voice_Schema.md` § 1, § 7, § 13 |
| Groups, built-in seed, group index | `docs/product/Motor_Grid_And_Art.md` § Groups |

---

## Why this phase exists

The schema was designed for many languages: every meaning is one
language-neutral sense, labels and utterances carry a locale, triggers
reject cross-locale clips and profile voices, and the event log stores ids
only. The runtime and the Groups 2.0 seed do not use that design yet.
Reviewed 2026-09-22 at `0555aa9` (Groups 2.0 complete):

1. **Built-in group names are stored as English text.** The seed
   (`data/group_seed.json`) carries `"name": "Food"`, and `seedGroups` in
   `public/shared/groups.mjs` copies it into `board_group.name` on each
   device. A German profile would show "Food" forever, and a later rename in
   the seed never reaches existing devices.
2. **The runtime never reads the profile locale.** Every label query in
   `public/board.js`, `public/shared/funnel.mjs`, and
   `public/shared/groups.mjs` hard-codes `l.locale = 'en'`. `clipKeyFor`
   hard-codes `voi_default_en`. Nothing reads `learner_profile.locale` or
   `preferred_voice_id`, so the voice-resolution rule in schema § 7.1 is not
   implemented.
3. **Device TTS has no language.** `speak()` builds a
   `SpeechSynthesisUtterance` without setting `lang`, so entity names and
   typed words are spoken in the iPad's system language, not the profile's.
   `<html lang="en">` is fixed in `public/index.html`.
4. **The strip contains an English word as a grammar rule.**
   `stripCandidates` in `public/shared/funnel.mjs` checks
   `tailText === "to"`. That is English grammar keyed on English text.
5. **The idle strip has English literals.** `idleStarters` in `board.js`
   looks up `"hello"` and `"help"` by English lemma and hard-codes a
   `"Food"` card.

None of this breaks English. All of it blocks the second language, and
items 1 and 5 put English text into on-device data that would need a
migration later. Fixing it now costs one small phase.

## Rules this phase makes true

- **Display text comes from a locale-keyed source or from the caregiver,
  never from an English string in code or seed data copied to the device.**
- **The profile locale and voice are resolved once at boot** (schema § 7.1)
  and passed to every query and speech call.
- **Catalog content is referenced by id in code**, never by English lemma.
  Build-time source files may use English lemmas as authoring keys, as long
  as the build resolves each one to exactly one sense and fails otherwise
  (`buildGroups` already does this).
- **`sense.category` is an internal key and is never displayed.**

---

## Slice 1 — Built-in group names by locale

Goal: Built-in group names come from the catalog in the profile's locale.
A caregiver's own name for a group always wins.

Files: `data/group_seed.json`, `scripts/catalog/build_catalog.mjs`,
`src/board/schema.sql`, `public/shared/groups.mjs`,
`public/shared/import.mjs`, `public/board.js`, `groups.test.mjs` (src/board).

1. **Seed shape.** Replace `"name": "Food"` with a per-locale map:
   ```json
   { "key": "food", "names": { "en": "Food" }, "glyph": "🍎", "category": "Food & Drink", "except": [...] }
   ```
   The build fails if any group lacks a name for any locale the catalog
   ships (today: `en`).
2. **Catalog table** — shipped with the catalog, replaced on import, never
   edited on device:
   ```sql
   CREATE TABLE IF NOT EXISTS group_label (
     group_id TEXT NOT NULL CHECK (group_id GLOB 'grp_*'),
     locale TEXT NOT NULL CHECK (length(locale) > 0),
     text TEXT NOT NULL CHECK (length(text) > 0),
     PRIMARY KEY (group_id, locale)
   );
   ```
3. **`board_group.name` becomes the caregiver override.** It is `NULL` for
   built-in and My Words groups until a caregiver renames one. It is always
   set for custom groups:
   ```sql
   name TEXT CHECK (name IS NULL OR length(name) > 0),
   CHECK (kind != 'custom' OR name IS NOT NULL)
   ```
   `seedGroups` inserts built-ins with `name = NULL`.
4. **Migration** (in `groups.mjs`, inside the existing savepoint pattern):
   for `kind IN ('builtin', 'my_words')`, set `name = NULL` where `name`
   equals that group's `en` seed name. A different value means a caregiver
   renamed it, so keep it. Run it once and make it idempotent.
5. **One resolver.** `groupDisplayName(db, row, locale)` in `groups.mjs`
   returns `row.name ?? group_label(row.id, locale) ?? ""`. An empty result
   renders glyph-only; it never falls back to another locale. Every place
   that shows a group name uses it: the group index, the group page title,
   the delete sheet, and the "show me where" caption (Groups slice 6).

Works Test (`groups.test.mjs`, node):
- Import the catalog plus a test-only `group_label` row
  `('grp_food', 'de', 'Essen')`. `groupDisplayName` returns `Food` for `en`
  and `Essen` for `de`, and `""` for `fr` (no fallback to English).
- Rename `grp_food` to `Snacks`; every locale returns `Snacks`.
- Migration: a device DB whose `grp_food.name = 'Food'` ends with `NULL`;
  one whose name is `Yummy` keeps `Yummy`. Running the migration twice
  gives the same result.
- The build rejects a seed group with no `en` name (see the gate fail once,
  then fix).

Done when: the tests pass and `npm run catalog:build:check` is green.

---

## Slice 2 — Profile locale and voice, end to end

Goal: The runtime reads the profile's locale and voice. There is no English
literal in any label query or speech call.

Files: `public/board.js`, `public/shared/funnel.mjs`,
`public/shared/groups.mjs`, `public/index.html`,
`check_locale_literals.mjs` (new, in the scripts folder), `scripts/check_fast.mjs`.

1. **Resolve once at boot:** `const { locale, voiceId } =
   resolveProfile(db)` in a small shared helper. It implements schema
   § 7.1 exactly: `preferred_voice_id` when that voice is active and has the
   same locale; else the active default voice for the profile locale; else
   `voiceId = null` (every slot is silent). Never another locale's voice.
2. **Bind, don't hard-code.** Every `l.locale = 'en'` becomes
   `l.locale = ?` bound to `locale`. `clipKeyFor` uses `voiceId`. Functions
   in `funnel.mjs` and `groups.mjs` that query labels take `locale` as a
   parameter (a required last argument with no default, so a missed caller
   fails loudly).
3. **Device TTS speaks the profile language:** in `speak()`, set
   `u.lang = locale` on the utterance. Set `document.documentElement.lang =
   locale` at boot.
4. **Idle strip by id.** `idleStarters` references *hello* and *help* by
   sense id (constants with a comment naming the word), and builds the Food
   card from the `grp_food` row using `groupDisplayName`.
5. **Gate** — `check_locale_literals.mjs`, added to
   `npm run check:fast`: fails on `locale = 'en'`, `locale='en'`, or
   `voi_default_en` anywhere under `public/` except `public/vendor/`.
   **Run it before the fix and record that it fails**, then make it pass.

Works Test (node, new cases next to `src/board/strip.test.mjs`): build a DB
with the English catalog, then add a test locale `de` with one active
bundled voice and German labels for three senses (`want` → `will`,
`juice` → `Saft`, `hello` → `hallo`). Set the profile to `de`.
- Strip and group queries return only `de` text. No English string appears
  for those three senses.
- A sense with no `de` label renders its picture and plays silence, never
  the English clip (schema § 7.2, "a miss is a miss").
- `resolveProfile` returns the `de` voice. Pointing `preferred_voice_id` at
  the English voice is rejected by the existing trigger.

Works Test (manual, recorded, `dev:agent`): English behaves exactly as
before (tap *want*, *juice*; open Food; the strip starters are unchanged).

Done when: both tests pass and the locale-literal gate is green after being
seen to fail.

---

## Slice 3 — Strip grammar rules by locale

Goal: The strip's sentence-position rules are per locale, and they never
match on English text.

Files: `public/shared/funnel.mjs`, `src/board/strip.test.mjs`.

1. Move the invitation rules (a verb/preposition tail invites nouns, a
   pronoun tail invites verbs, infinitival *to* after a verb invites verbs)
   into `GRAMMAR = { en: { invitesNoun(ctx), invitesVerb(ctx) } }`.
2. The infinitival-*to* check compares the tail's **sense id** with the
   *to* sense id (a named constant), not `tailText === "to"`. Delete
   `tailTextOf` if nothing else uses it.
3. A locale with no entry in `GRAMMAR` gets no invitations. The strip then
   ranks by recency, time of day, and frequency only. This is correct:
   German word order is not English word order, and a wrong rule is worse
   than no rule.

Works Test: the existing strip tests pass unchanged for `en` (behavior
preserved). A new case with profile locale `de` and tail *want* shows no
noun invitation, only recency ranking.

Done when: `scripts/test.sh src/board/strip.test.mjs` passes.

---

## Out of scope (owned elsewhere)

- Keyboard locale work: `docs/phases/004_Keyboard.md`.
- Normalizer v2 (`ß`), per-locale lexicon sources, per-locale core layouts
  for function words, morphology: `docs/product/Language_And_Voice_Schema.md`
  § 13. These are PROPOSED and wait for the first second-locale phase.
- Shipping any German, Spanish, or French content.

## Closeout checklist

- [ ] Slices 1–3 done; `npm run check` green.
- [ ] `docs/product/Language_And_Voice_Schema.md` § 13 table rows for these
      gaps flipped to **BUILT** with citations.
- [ ] Archive this doc per `docs/operations/Execution-Playbook.md` § Phase
      Archive.
