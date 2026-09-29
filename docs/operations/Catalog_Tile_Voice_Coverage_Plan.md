# Catalog tile voice coverage — execution plan (not started)

**Status:** proposal 2026-09-29. **Do not mint or publish** from this doc without explicit founder approval per `AGENTS.md`.

Two related tracks, in order:

1. **Default tile voice** (`voices.json` → `tiles`, `WWMMC6k9tdar0BthUenK`, `eleven_v4`) — finish **every shippable single-word utterance** in the built catalog (launch + extended rows already in `catalog.json`). This is prerequisite coverage; the app assumes one bundled voice can speak the library.
2. **Additional voices** (e.g. male intake winner from voice selector) — same utterance set, **different `voice_id`**, separate clip rows and review batches. Product names (Adam, Bill, …) and `voice` table rows are step 2 after intake picks.

Voice selector step 1 is done for the first male round: winner **`c2`** → ElevenLabs `aGfQDyfOrmWWfC7ZnTbv` in `data/samples/elevenlabs-voice-selector/decisions.json`. That ID is **not** wired into `voices.json` or clip storage yet.

---

## Measured gaps (run before any bulk mint)

| Instrument | Command | What it measures |
| --- | --- | --- |
| Launch lexicon vs WBB + gap-fill | `npm run catalog:audio:coverage` | 712 launch rows; **7** still lack a `generated_audio.json` slot (multi-word snack labels, 2026-09-29). |
| Built catalog utterances vs ready clips | `node scripts/catalog/coverage.mjs` **(launch only today)** | **Proposed:** extend or add `catalog:audio:utterance-coverage` — count `catalog.json` `utterances` without a `clips` row `status: ready`. Snapshot: **1087** utterances, **1055** ready clips, **32** missing (mostly extended food labels, e.g. `cucumber`, `string cheese`). |
| ElevenLabs-owned clips | `npm run catalog:audio:elevenlabs-inventory` | Clips with `source: elevenlabs` across catalog, `generated_audio.json`, `forms_audio.json`, review `shipping.json`. |
| v4 regen lab | `npm run catalog:audio:elevenlabs-inventory` + v4 lab `review.json` | Default voice already ear-approved for ~352 legacy Eleven tiles; publish path exists (`catalog:v4-lab:publish`). |

Re-run the utterance-level count after `npm run catalog:build` whenever lexicon or extended import changes.

---

## Track 1 — Complete default tile voice (execute first)

**Goal:** Zero catalog utterances that should play bundled tiles but have no ready clip under the default ElevenLabs tile voice (WBB hits count; gap-fill + ear-ship fills the rest).

**Truth owners:** `data/catalog/catalog.json` (utterances + clips), `generated_audio.json`, `forms_audio.json`, R2 `workbookbench-catalog`.

### Existing pipeline (reuse, do not rewrite)

```text
audio_import.json misses  →  catalog:tiles:queue  →  recipes.json
       →  catalog:tiles:mint-batch  →  data/samples/elevenlabs-tiles-core/takes/
       →  review UI elevenlabs-tiles  →  shipping.json
       →  publish_catalog_tile / publish_elevenlabs_shortlist  →  generated_audio + R2
       →  catalog:build
```

Forms parallel: `catalog:forms:*` → `elevenlabs-forms-core`.

Bulk **v4 plain** regen for already-catalogued Eleven clips: `catalog:v4-lab:mint-batch` → v4 lab A/R → `catalog:v4-lab:publish`.

Unattended gap-fill (no ear gate): `generate_missing_audio.mjs` — prefer review path for tiles.

### Gaps in tooling (build when executing)

| Gap | Proposal |
| --- | --- |
| Queue only knows **launch WBB misses** (`build_elevenlabs_tile_queue.mjs` ← `audio_import.json`). | Add **`build_catalog_tile_queue.mjs`**: input = all `catalog.json` utterances missing ready clip (and optional `--layer launch\|extended\|all`). Output = `recipes.json` for a named batch folder. |
| No single “what’s left?” report for **full catalog**. | Add **`catalog:audio:utterance-coverage`** CLI wrapping utterance∩clip diff + JSON export for queue builder. |
| No one npm entry for “queue + mint + print review URL”. | Add **`catalog:tiles:master-mint`** = `utterance-coverage --json` → queue → `mint_elevenlabs_tile_batch.mjs --batch <id> --limit N` (founder sets `--limit`; max 10 per listen policy unless approved). |

**Batch id for default voice:** keep `elevenlabs-tiles-core` for launch gap-fill; add e.g. `elevenlabs-tiles-extended` for the 32 extended utterances so shipping logs stay separable.

**Review:** unchanged — [http://127.0.0.1:3747/audio-review/elevenlabs-tiles](http://127.0.0.1:3747/audio-review/elevenlabs-tiles) (`npm run catalog:audio:review`). Optional: route extended batch via same UI using existing `--batch` on mint CLI.

**Proof when done:** utterance coverage **0 misses** for tile surfaces; `catalog:build` clean; spot Works Test on extended words from `+ Add`.

---

## Track 2 — Male voice (and future named voices)

**Goal:** For each registered catalog `voice` row, one ready clip per utterance the default voice has (single-word tiles + forms policy TBD per phase 010 slice 4).

**Prerequisite:** Track 1 complete so the **utterance list is stable** and default clips are not still moving.

### Schema / product (step 2 — before bulk mint)

- Add **`voice` row** in catalog build (display name e.g. from intake, `voice_id` = `aGfQDyfOrmWWfC7ZnTbv`).
- Clip storage: today `generated_audio.json` is **single-voice** (`clip.voice`). Plan either per-voice sidecars (`generated_audio.<voiceKey>.json`) or extend entries with `voice_id` + composite slot key — align with `docs/product/Language_And_Voice_Schema.md` (`clip.voice_id` FK).
- App: `public/shared/voices.mjs` + settings picker already exist; wire resolve path to pick clip by `(utterance_id, voice_id)`.

### Mint + review (reuse pattern)

`mintTileVariation` already honors **`recipes.defaults.voice_id`** (`elevenlabs_tile_mint_core.mjs`). Same batch machinery with:

- `recipes.defaults.voice_id` = intake winner (or named voice id).
- Separate sample tree: e.g. `data/samples/elevenlabs-tiles-voice-male-001/` with its own `recipes.json`, `shipping.json`.
- **Master queue** copies utterance list from Track 1 manifest (not WBB misses only).

**Review options:**

| Mode | When |
| --- | --- |
| Full tile review UI | New words or questionable takes; same A/R → shortlist → publish as today. |
| Spot-check grid | After v4-style bulk mint, sample N words per category (reuse voice-selector probe idea at scale). |
| Diff listening | Play default vs new voice for same slug in review UI (future UX slice). |

**Do not** overwrite default tile R2 keys or `generated_audio.json` voice field when publishing alternate voice clips — new keys under voice-scoped paths (exact R2 layout = slice when implementing).

### Master orchestrator (proposed npm surface)

```bash
# Report only
npm run catalog:audio:utterance-coverage
npm run catalog:audio:utterance-coverage -- --json

# Default voice extended gap (example — scripts not implemented yet)
npm run catalog:tiles:master-queue -- --voice tiles --layer extended
npm run catalog:tiles:master-mint -- --batch elevenlabs-tiles-extended --limit 10

# Alternate voice (after voice row + sidecar design)
npm run catalog:tiles:master-queue -- --voice-id aGfQDyfOrmWWfC7ZnTbv --batch elevenlabs-tiles-voice-male-001
npm run catalog:tiles:master-mint -- --batch elevenlabs-tiles-voice-male-001 --limit 10
```

Implement as thin wrappers over queue builder + existing `mint_elevenlabs_tile_batch.mjs` + documented review URL.

---

## Suggested execution order (when approved)

1. **`catalog:audio:utterance-coverage`** — implement + fix launch **7** + extended **32** for default voice.
2. Mint/review/publish in **≤10 clip** batches until utterance coverage is green.
3. Register male voice in catalog + clip sidecar design (small schema slice).
4. **`master-queue` / `master-mint`** for male voice over full utterance list; ear-review in batches.
5. Enable voice in settings only after clip coverage gate passes for that voice.

---

## Related docs

- `docs/operations/ElevenLabs_Tile_Minting.md` — today’s tile gap-fill and review URLs.
- `docs/phases/010_Extended_Picture_Library.md` slice 4 — extended library voices.
- `docs/product/Language_And_Voice_Schema.md` — `voice` / `clip` model.
- Voice selector intake: `ElevenLabs_Tile_Minting.md` § Voice selector.
