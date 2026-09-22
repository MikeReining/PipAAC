# Roadmap

Sequence map only. Live execution scope is the phase doc, not this file.

## Phase 0 — Harness (complete)

- Shared Ikiro dev harness, health Worker stub, CI green wall.
- Proof: `npm run check:fast` after `npm ci`.
- Archive: `docs/archive/phases/001_Harness_Bootstrap.md`.

## Phase 002 — Core board and the Cooper proof (executing)

**DECIDED 2026-09-22.** Revised the same day. Owner: `docs/phases/002_Core_Board_And_Customize.md`.

Order, and it is the only order:

1. Core board — the `grid60` default layout, labels and color (map: `docs/product/Core_Coordinate_Map.md`).
2. Add Cooper on the child's iPad — name, photo, one confirm; filed by context.
3. A local strip that can offer him.

The 599-word library, drawings included, waits until that proof has passed.

Next slice: 1 — core board. See `docs/phases/README.md`.

## Prediction track (decided 2026-09-22)

**DECIDED 2026-09-22** (not built). Owner: `docs/strategy/Dual_Engine_Predictive_Intelligence.md`.

1. 006 — Prediction engine: fix local time, track sentences, log impressions and measure, the learned local model, on-device learning, then Jev behind the sharing setting (on by default) (`docs/phases/006_Prediction_Engine.md`).
2. 007 — Occasions: breakfast experiment (LLM vs. Jev), then an occasion prior and each child's own windows (`docs/phases/007_Occasions.md`).
3. 008 — Partner listening: setting, Listen key, on-device speech, partner words for one turn (`docs/phases/008_Partner_Listening.md`).
4. No phase yet: core-cell halos as a fading prompt and the SLP independence report (strategy doc § 7.4).

## Customization track (decided 2026-09-22)

**DECIDED 2026-09-22** (not built). Owners: `docs/product/Word_Library.md`, `docs/product/Sync_And_Web_Editing.md`, `docs/product/Platforms_iOS_And_Web.md`. Intake: `docs/founder/2026-09-22_Customization_Library_Sync.md`.

1. 009 — Word Library and customization: every meaning as pictures on add (P1), home-screen Edit mode and the word card, the Library, Record my own, picture overrides, bulk paste, many photos, Hide, suggested words, first-run setup; the voice picker after launch (`docs/phases/009_Word_Library_And_Customize.md`).
2. 010 — Extended picture library: 2,000 drawn words + 300 phrases, found on add, and Draw it for me (`docs/phases/010_Extended_Picture_Library.md`).
3. 011 — Sync and web editing: edit on a computer, the iPad gets it; no accounts; free backup and recovery sheet (`docs/phases/011_Sync_And_Web_Editing.md`).
4. No phase yet: the iOS App Store app. The build approach is open (`docs/product/Platforms_iOS_And_Web.md` § 3).

Phase numbers here follow `docs/phases/`; the "Later" list below predates them and reuses 003–005 for other work.

## Later — Phased sequence (proposed)

**PROPOSED.** Detailed sequencing following completion of Phase 002:

### Phase 003 — Multi-Device Pairing, Cloudflare Backup & Desktop Web Remote Edit
**Superseded 2026-09-22** by phase 011 above (`docs/product/Sync_And_Web_Editing.md`).
- Linking a second device (parent/educator phone or Mac/PC browser) via short-lived QR.
- Cloudflare Workers carrying encrypted ciphertext (zero-PII, zero-knowledge edge sync).
- Immediate restoration on broken hardware (the "shattered iPad" solution).
- Desktop web browser remote editing: manage vocabulary on a computer with real keyboard/mouse.

### Phase 004 — Vocabulary Masking, Parental Safety & Presentation Modes
- Vocabulary Masking: hide developmentally sensitive words without shifting adjacent cell coordinates.
- Accidental Deletion Defense: Parent Corner biometrics (WebAuthn Touch ID / Face ID) + PIN, backed by "Retire, Never Delete" trash restore bin.
- Profile Presentation Modes: Symbol+Label (default) vs. Label-Only (dignified clean text mode for literate adults, ALS, aphasia).
- Owners: `docs/product/Vocabulary_Masking_And_Safety.md`, `docs/product/Profile_Presentation_Modes.md`.

### Phase 005 — Voice Cloning & Multilingual Expansion
- Instant Voice Cloning via ElevenLabs API (Mom's voice / SLP benchmark voice / ALS voice banking) from 10–15 second audio sample.
- Batch pre-synthesis of 656 catalog words cached in local OPFS/SQLite (`clip` table) for 0ms offline speech.
- Multilingual localized label/utterance expansion (Spanish, French, regional dialects) on the language-independent sense graph.
- Owners: `docs/product/Voice_Cloning_And_Synthesis.md`, `docs/product/Language_And_Voice_Schema.md`.

Context river, visual scenes, and live partner modeling stay in `docs/strategy/Vision.md` until later phases name them.
