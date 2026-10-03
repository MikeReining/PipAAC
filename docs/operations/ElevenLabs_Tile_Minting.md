# ElevenLabs: tile gap-fill and review

**Status:** operational 2026-09-26. Launch-lexicon WBB gap-fill **shipped** (66/66 ear-reviewed, 2026-09-26). **Eleven v4 catalog regen** ear-approved and published to R2 + `catalog.json` (2026-09-29).  
**Applies to:** single-word **launch lexicon** tiles that miss WorkbookBench R2 audio (`data/launch_lexicon.json`, 680 rows).  
**Not for:** sentence playback (Grok `ara` via phase 024 Worker) or Grok catalog exploration (`data/samples/batch-*-core`).

## Voices

| Role | Provider | Voice id | Config |
| --- | --- | --- | --- |
| Tiles / catalog gap-fill | ElevenLabs | `WWMMC6k9tdar0BthUenK` | `data/catalog/voices.json` → `tiles` |
| Grok explore backup only | ElevenLabs | `paOIq6PwrBInRivGXL1u` (Aga) | `voices.json` → `backup` |

API key: `ELEVENLABS_API_KEY` in `.env` only.

## Model and settings

Tile voice default model: **`eleven_v4`** in `data/catalog/voices.json` (`stability: 0.4`, `similarity_boost: 0.8`). v4 uses stability + similarity only at API time.

Eleven v4 does **not** use Grok-style XML (`<emphasis>`, `<loud>`). Single-word tile takes are **plain** (the spoken label); the lab adds an IPA line or a lexical guard only when plain fails (see *When plain fails* below). Model retired: **v3** — do not mint with it.

Docs: [ElevenLabs TTS best practices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices) (Prompting Eleven v4).

## Eleven v4 listen lab (non-shipping)

Founder-only A/B before any model change in `voices.json`:

```bash
npm run catalog:audio:review
```

Open [http://127.0.0.1:3747/audio-review/elevenlabs-v4-lab](http://127.0.0.1:3747/audio-review/elevenlabs-v4-lab).

- **Enter** mints **`v4_plain` only** (one API call). **Mint IPA fallback** runs Groq + `v4_ipa` when plain is not good enough.
- Takes write to `data/samples/elevenlabs-v4-lab/takes/` (gitignored). **Publish** approved rows with `catalog:v4-lab:publish` (same R2 + sidecars as tile review). The older tile review page `/audio-review/elevenlabs-tiles` remains for shipping-shortlist publish; its recipes are v4.
- Single-word takes show the same acoustic gate as ship path (`scripts/catalog/audio_review.mjs`); multi-word forms show gate n/a.
- **IPA fallback only** uses **Groq** `qwen/qwen3.8-27b` with **Isolated tile** citation pronunciation (e.g. `an` → `/æn/`). Single-word tiles send IPA alone to Eleven ([best practices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices#prompting-eleven-v4)).

### Bulk regen: which clips are ElevenLabs?

```bash
npm run catalog:audio:elevenlabs-inventory
npm run catalog:audio:elevenlabs-inventory -- --json
npm run catalog:v4-lab:mint-batch -- --limit 10
npm run catalog:v4-lab:mint-batch
npm run catalog:v4-lab:publish
npm run catalog:build
```

Counts clips with `source: elevenlabs` in built `catalog.json`, plus `generated_audio.json`, `forms_audio.json`, and review `shipping.json`. **Mint batch** writes `v4_plain` into `data/samples/elevenlabs-v4-lab/takes/` (skips existing unless `--force`). **Publish** uploads every **approved** row in `elevenlabs-v4-lab/review.json` to WBB R2 + updates `generated_audio.json` / `forms_audio.json`, then **catalog:build** refreshes `catalog.json` and `public/audio/`. WBB/Bitsboard originals are the rest.

### Lessons from v4 regen (2026-09)

**Product:** On a full ear pass over ~352 ElevenLabs tiles, **v4 plain was ~99% acceptable** — a step change vs v3. Default tile model stays **`eleven_v4`** in `voices.json`.

**Workflow:** Ear review (A/R) is the ship gate; the lab acoustic gate (`activity_after_silence`, etc.) is a **hint** only — red sidebar rows can still be good (e.g. trailing /s/ on “bags”).

**When plain fails (rare):**

| Pattern | Example | Fix |
| --- | --- | --- |
| Wrong IPA locale | `laughs` → sounded like “logs” (`/lɔːɡz/`) | US citation IPA **`/lævz/`** (see `ipaOverrideForSoundEffectLabel` in `elevenlabs_v4_lab.mjs`) |
| Same IPA on lemma | `laugh` → “laughs” when sent `/lævz/` | Lemma **`/læf/`**; keep `/lævz/` for **`laughs`** only |

### Tile mint recipe (SSOT: `src/shared/tile_recipe.mjs`)

Every launch label has **its own** mint string. **Do not copy IPA from another inflection** (singular vs plural vs -ing). Groq IPA lookup and manual overrides must match the **exact** `spokenText` row.

| Label (examples) | Sent to Eleven (plain variation) | Notes |
| --- | --- | --- |
| Plain word | the label | Default (~99% of launch lexicon) |
| **I** | `/aɪ/` | Plain **I** → “one” (Roman numeral) |
| **a** / **an** | `/æ/` / `/æn/` | Not letter name / not “Anne” |
| **laugh** | `/læf/` | Lemma only — **not** `/lævz/` |
| **laughs** | `/lævz/` | Plain sounded like “logs” |
| **laughing** | `/ˈlæfɪŋ/` | |
| **cough**, **coughs**, **coughing**, sneeze/burp/hiccup family | `[isolated dictionary word, do not make the sound] …` | Lexical guard — IPA alone can still perform the sound |

Audit launch overrides before bulk mint:

```bash
node -e "
import { listLaunchLemmaRows } from './scripts/catalog/launch_lexicon_rows.mjs';
import { tileMintTextForVariation } from './src/shared/tile_recipe.mjs';
import { normalizeV1 } from './public/shared/normalize.mjs';
for (const r of listLaunchLemmaRows()) {
  const n = normalizeV1(r.spokenText);
  const m = tileMintTextForVariation(r.spokenText, 'plain');
  if (m !== n) console.log(r.spokenText, '→', m);
}
"
```

All mint paths (Worker on-demand, `elevenlabs_tile_mint_core.mjs`, Leo seed) call **`tileMintTextForVariation`** — never raw labels to Eleven.
| Model imitates the thing, not the word | `coughing`, `coughs` | **Lexical guard** v4 line: `[isolated dictionary word, do not make the sound] coughing.` — not IPA-only |
| Citation / double speak | `an` | Single-word tiles: **IPA only** to Eleven, not `an /æn/` |

**Ops:** Inventory dedupes by R2 key; publish routes forms vs launch/generated slots (`publish_v4_lab_approved.mjs`). Rows with no catalog sidecar (e.g. a lab-only slug) cannot publish until catalogued.

## Voice selector (step 1 — intake only)

Always **three ElevenLabs candidates → pick one** per round. Working labels (e.g. “Men (first intake)”) and display names (Adam, Bill, Jake) can change later; **round id + voice_id** are what `decisions.json` records. Does **not** change Pip’s default tile voice or mint the full catalog library.

```bash
npm run catalog:audio:review
npm run catalog:voice-selector:mint
```

Open [http://127.0.0.1:3747/audio-review/elevenlabs-voice-selector](http://127.0.0.1:3747/audio-review/elevenlabs-voice-selector). Probes and candidate IDs live in `data/samples/elevenlabs-voice-selector/round.json`. Takes: `data/samples/elevenlabs-voice-selector/takes/` (gitignore). Winner: `decisions.json` in the same folder.

### Mint runs (batch spot-check)

After `catalog:tiles:mint-gaps` or `mint_elevenlabs_tile_batch.mjs --mint-run`, the CLI prints a review URL. In [tile review](http://127.0.0.1:3747/audio-review/elevenlabs-tiles): **Show → mint run (spot check)**, pick the run, **↑ / ↓** through spoken labels.

32 launch food/drink gaps (Pip):  
[http://127.0.0.1:3747/audio-review/elevenlabs-tiles?batch=elevenlabs-tiles-core&folder=takes&ship=mint-run&runId=gap-launch-food-2026-09-29](http://127.0.0.1:3747/audio-review/elevenlabs-tiles?batch=elevenlabs-tiles-core&folder=takes&ship=mint-run&runId=gap-launch-food-2026-09-29)

**Look up catalog** uses `launch_lexicon.json` + `generated_audio.json` (any launch label, including gap-fill rows not in `audio_import.json`).

**Full-library coverage (default + extra voices):** `docs/phases/028_Tile_Voice_Library.md` (decided: on-demand mint of typed words, review page, one mint core) (ops gaps: `docs/operations/Catalog_Tile_Voice_Coverage_Plan.md`).

### Leo seed (pilot — listen before bulk)

Male tile voice **Leo** (`4sAJvpuF0iHhO9nptfOD`, custom clone — see `data/catalog/tile_voices.json`) is minted in a **separate sample lane** (`elevenlabs-tiles-leo`). **Eve** (`94pmIckCYkqYPVrgIvUH`, younger female) is `planned`; **Sam** (younger male) is `planned` with no voice id yet. The lineup is Pip, Eve, Leo, Sam (founder 2026-10-03, `public/shared/voices.mjs`).

Founder review: `npm run catalog:audio:review` → [tile review](http://127.0.0.1:3747/audio-review/elevenlabs-tiles) → **Voice: Leo** → **Show: mint run (spot check)** → pick the run → **↑ / ↓**. **Reload list** after an off-screen mint. Agents mint with:

```bash
npm run catalog:tiles:mint-leo-seed -- --limit 10
npm run catalog:tiles:mint-leo-seed -- --limit 10 --offset 10
npm run catalog:tiles:mint-leo-seed -- --words cough,laugh --run-id my-probe --force
npm run catalog:tiles:mint-leo-seed -- --all --run-id leo-final-c3-full-seed
```

`--all` walks the full launch lemma list (~709), **skips** takes that already exist on disk, writes one mint-run manifest. Use `--force` only to remint. Full launch pre-seed only after founder OK on pilots (30-word gate passed 2026-09-29).
## Audio inventory (what is “missing”?)

| Layer | Command / file | Meaning |
| --- | --- | --- |
| **Launch lexicon vs WBB** | `npm run catalog:audio:coverage` | WBB manifest hits/misses. Misses stay “miss” in `audio_import.json` even after gap-fill — that is expected. |
| **Effective launch tiles** | same + `effective launch coverage` line | Misses covered by `data/catalog/generated_audio.json` count as shippable in `build_catalog.mjs`. |
| **Ear-shipped gap-fill** | `data/samples/elevenlabs-tiles-core/shipping.json` | One row per slug after **Publish** from the review UI (or `publish_elevenlabs_shortlist.mjs`). |
| **Inflected / form surfaces** | `forms_audio.json` `missing` + `elevenlabs-forms-core/shipping.json` | Mint: `npm run catalog:forms:mint-batch`. Publish shortlist: `npm run catalog:forms:publish-shortlist`. |
| **Extended / holiday words** | `data/extended_lexicon.json` | e.g. `christmas` — not in the 680-row launch lexicon until promoted; no tile audio until catalogued. |
| **Sentence + names (024)** | Grok `pippaac-voice` R2, slice 7 | Whole sentences and common names — different pipeline from tile clips. |

As of 2026-09-27: **680/680** launch lexicon rows have a clip path (614 WBB + 66 ElevenLabs gap-fill). **378/378** form utterances in `forms_audio.json` have clips (144 ear-shipped via **elevenlabs-forms-core** on 2026-09-27).

## Workflow

1. **Queue** — refresh recipes from `audio_import.json` misses:
   ```bash
   npm run catalog:tiles:queue
   ```
   Writes `data/samples/elevenlabs-tiles-core/recipes.json`.

2. **Mint batch** (founder listen policy: review before publish):
   ```bash
   npm run catalog:tiles:mint-batch
   ```
   Plain + period per word; `--emphasis` on `mint_elevenlabs_tile_batch.mjs` for caps on all words.

3. **Review** — `npm run catalog:audio:review` → [http://127.0.0.1:3747/audio-review/elevenlabs-tiles](http://127.0.0.1:3747/audio-review/elevenlabs-tiles)
   - **↑ / ↓** move the file list; **Space** replay.
   - **Show:** *needs publish* vs *published via review* (`shipping.json`).
   - **Look up** any launch label to hear live R2/local catalog audio; **Remint** if replacing a bad clip.
   - **Approve → shortlist** (optional pick per word) or publish straight from **takes**.
   - **Publish → R2 + catalog** updates `generated_audio.json`, `assets/catalog/audio/`, and `workbookbench-catalog` R2.

4. **Publish shortlist in bulk** (after one `*_recommended.mp3` per slug):
   ```bash
   node scripts/catalog/publish_elevenlabs_shortlist.mjs
   ```

5. **Bundle** — `npm run catalog:build` copies merged clips into `public/audio/`.

Grok explore review (unchanged): [http://127.0.0.1:3747/audio-review](http://127.0.0.1:3747/audio-review).

Bulk `generate_missing_audio.mjs` can mint unattended into `generated_audio.json` without `shipping.json`; prefer the review path for ear-approved tiles.

## Voice policy (do not swap)

**Default tile voice** = ElevenLabs catalog clone (`tiles` in `voices.json`). **Grok `ara`** = sentences + exploration batches only. Grok may become a **second (or third) user-selectable voice** later; it **must not** replace or overwrite the default tile clips without a new, explicit product slice. See phase 024 §2 and `Grok_Voice_Synthesis_Best_Practices.md`.

## Grok catalog exploration

Grok batches under `data/samples/batch-*-core` and `data/samples/approved/` are **exploration only**, not ship path for default tiles.
