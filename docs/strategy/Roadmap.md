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

## Later — Phased sequence (proposed)

**PROPOSED.** Detailed sequencing following completion of Phase 002:

### Phase 003 — Multi-Device Pairing, Cloudflare Backup & Desktop Web Remote Edit
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
