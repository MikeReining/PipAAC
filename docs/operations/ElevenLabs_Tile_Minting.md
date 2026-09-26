# ElevenLabs: tile gap-fill and review

**Status:** operational 2026-09-26.  
**Applies to:** single-word launch-lexicon tiles that miss WorkbookBench R2 audio.  
**Not for:** sentence playback (Grok `ara` via phase 024 Worker) or Grok catalog exploration (`data/samples/batch-*-core`).

## Voices

| Role | Provider | Voice id | Config |
| --- | --- | --- | --- |
| Tiles / catalog gap-fill | ElevenLabs | `WWMMC6k9tdar0BthUenK` | `data/catalog/voices.json` → `tiles` |
| Grok explore backup only | ElevenLabs | `paOIq6PwrBInRivGXL1u` (Aga) | `voices.json` → `backup` |

API key: `ELEVENLABS_API_KEY` in `.env` only.

## Model and settings

Match WorkbookBench catalog mints: **`eleven_v3`**, `stability: 0.4`, `similarity_boost: 0.8`, `use_speaker_boost: true`.

Eleven v3 does **not** use Grok-style XML (`<emphasis>`, `<loud>`). For tile takes we mint:

| Variation | TTS text | Notes |
| --- | --- | --- |
| `plain` | spoken label | Default tile playback text |
| `period` | `word.` | Punctuation shapes delivery on v3 |
| `emphasis` | `WORD` (caps) | v3 capitalization emphasis — listen; may be too strong for some tiles |

Optional v3 **[audio tags]** (`[whispers]`, etc.) are not in the default matrix; tags can be spoken or unreliable on PVCs. Add per-word rows in `recipes.json` only after a listen.

Docs: [ElevenLabs TTS best practices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices) (Prompting Eleven v3).

## Workflow

1. **Queue** — build recipes from `audio_import.json` misses:
   ```bash
   node scripts/catalog/build_elevenlabs_tile_queue.mjs
   ```
   Writes `data/samples/elevenlabs-tiles-core/recipes.json` (all miss slots).

2. **Mint** (≤10 words per founder session; same policy as Grok explore):
   ```bash
   node scripts/catalog/mint_elevenlabs_tile.mjs --slug all_done --all
   ```
   Or one variation: `--variation period`.

3. **Review** — dedicated UI (Grok explore review is unchanged):
   ```bash
   npm run catalog:audio:review
   ```
   Open: `http://127.0.0.1:3747/audio-review/elevenlabs-tiles`

   - **Plain + period** are auto-minted when you open a word (catalog voice).
   - Optional **caps emphasis** is a separate ElevenLabs take (ALL CAPS — not Grok `<emphasis>`).
   - **Show** filter on takes: *needs publish* (default) vs *published via review* — tracked in `elevenlabs-tiles-core/shipping.json` (not bulk `generate_missing_audio` alone).
   - **Look up** any tile label (e.g. `christmas`, `all done`) to play the live catalog clip from local cache or R2, **remint all variants**, then trim and **Publish**.
   - Trim, optional **Approve → shortlist**, then **Publish → R2 + catalog** (`generated_audio.json` + `workbookbench-catalog` R2).

   Grok batches: `http://127.0.0.1:3747/audio-review` — Aga backup + Grok emphasis as before.

4. **Bundle** — after publish, run `npm run catalog:build` so `public/audio/` picks up the new key.

Bulk `generate_missing_audio.mjs` remains for unattended gap-fill; **ear-approved** tiles should go through this review path before **Publish**.

## Grok catalog exploration

Grok batches under `data/samples/batch-*-core` and `data/samples/approved/` stay for a possible future catalog voice swap (phase 024 slice 4). **On hold** until the founder resumes that track. Do not delete exploration audio.
