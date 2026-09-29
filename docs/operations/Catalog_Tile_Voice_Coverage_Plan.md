# Catalog tile voice coverage — execution plan (not started)

**Status:** proposal 2026-09-29 (revised same day — fixed extended vs shipped catalog scope). **Do not mint or publish** without explicit founder approval per `AGENTS.md`.

---

## Why the old “32 missing” number was misleading

Three different word lists exist. They must not be conflated.

| Layer | Source | Count (2026-09-29) | In `catalog.json`? | Default voice clips |
| --- | --- | ---: | --- | --- |
| **Launch board lexicon** | `data/launch_lexicon.json` | **712** words | Yes (~709 lemma utterances + forms add more surfaces) | WBB + `generated_audio.json` + Eleven gap-fill; **7** launch rows still lack a generated slot (`npm run catalog:audio:coverage`) |
| **Inflected forms** | `data/forms/en.json` → build | **378** form utterances (`utt_f*`) | Yes | **`forms_audio.json`** — ear path shipped; **0** missing ready clips in built catalog |
| **Extended library (planned)** | `data/extended_lexicon.json` ← `Extended_Vocabulary_Catalog.md` | **3,968** entries (3,571 `word`, 397 `phrase`; product target ~2,000 words + ~300 phrases in `Word_Library.md` § 6) | **Almost none** — only **~14** normalized labels overlap existing catalog utterances today | **Not applicable yet** — utterances are not in the shipped catalog build |

**Shipped catalog today:** `build_catalog.mjs` reads **`launch_lexicon.json` only** (not `extended_lexicon.json`). Snapshot after `catalog:build`:

- **1,087** utterances total (launch lemmas + shared surfaces + forms)
- **1,055** utterances with a **ready** clip in `catalog.json`
- **32** utterances **without** a ready clip — these are **launch-tier food/snack labels** already in the catalog (e.g. `cucumber`, `string cheese`, `goldfish crackers`), **not** “the extended library is almost done”

**Extended library today:** **~3,954** extended lexicon entries have **no** catalog utterance row yet. Phase 010 slice 3 (“tier in the catalog”) is **not built** — there are **zero** `secondary_fringe` senses in the shipped file. Audio minting for “the whole extended catalog” cannot mean “fix 32 clips”; it means **import extended into the catalog first**, then mint **thousands** of clips.

---

## Product goal (default tile voice)

**Default tile voice:** `data/catalog/voices.json` → `tiles` (`WWMMC6k9tdar0BthUenK`, `eleven_v4`).

When we say “default voice covers the full planned extended library,” we mean:

1. Every **launch** utterance + **form** utterance that ships today has a ready clip (finish the small launch tail).
2. Every **extended** entry we plan to ship (`extended_lexicon.json`) has a catalog **utterance** row and a ready **clip** for `voi_default_en` / tiles voice — **after** extended senses exist in `catalog.json` (and images where `art: draw`).

Alternate voices (male intake winner `aGfQDyfOrmWWfC7ZnTbv`, future Adam/Bill/Jake rows) repeat the **same utterance list** with a different ElevenLabs `voice_id` — **after** default coverage is stable.

---

## Phase A — Finish **shipped** catalog (launch + forms)

**Scope:** ~1,087 utterances already in `catalog.json`.

| Gap | Size | Fix |
| --- | ---: | --- |
| Launch WBB miss without `generated_audio` | **7** | `catalog:tiles:queue` → mint → elevenlabs-tiles review → publish (or v4 lab path for regen) |
| Launch utterances in catalog with no ready clip | **32** | Same tile review pipeline; queue from **utterance∩clip diff**, not `audio_import` alone |
| Forms | **0** missing in catalog snapshot | Maintain via `catalog:forms:*` when forms change |

**Tooling to add when executing:**

- **`catalog:audio:utterance-coverage`** — report misses in **built** `catalog.json` (launch + forms), JSON for queue builder.
- **`build_catalog_tile_queue.mjs`** — `--layer shipped` (default): all utterances missing ready clips.
- **`catalog:tiles:master-mint`** — coverage → queue → `mint_elevenlabs_tile_batch.mjs --limit N`.

**Proof:** utterance coverage **0** for rows present in `catalog.json`; `npm run catalog:audio:coverage` shows **0** launch rows still needing generated slots.

---

## Phase B — **Import** extended library into the catalog (prerequisite for bulk extended audio)

**Scope:** ~3,968 planned entries (minus launch duplicates already owned by launch lexicon).

**Owner:** phase **010 slice 3** — `build_catalog.mjs`, `secondary_fringe` tier, `+ Add` / Library import (`docs/phases/010_Extended_Picture_Library.md`).

Until this lands:

- Extended words are **not** addressable as catalog utterances.
- Tile mint scripts that read `catalog.json` or `audio_import.json` **cannot** see the full extended list.

### Art and audio are **not** the same gate (code + product)

Phase 010 slice 2’s Works Test (“reject fringe sense with no approved image”) is a **planned** import strictness, not how launch catalog works today.

**Today’s launch build** (`build_catalog.mjs` → `buildImages`): a sense ships **without** `default_image_id` when no file exists in `assets/symbols/`. The app already renders **label + Fitzgerald color** when art is null (`public/shared/images.mjs`, `public/board.js` metaFor).

**Playback today** (`public/shared/voice.mjs` → `resolveSlot`):

- Catalog **sense** + bundled voice + no ready **clip** → **`silence`** (not device TTS).
- **Personal entity** (Add → “New: scientist”) → **device TTS** on the spoken name — no catalog clip required.
- Catalog sense **with** clip → plays clip regardless of whether art exists.

So for a **seeded public library**, the right order is: **utterance row + clip** can ship **before** art. Art (`art: draw`) can trail on its own review track. `art: none` rows never need draw — only utterance + clip.

**Do not** block extended audio minting on completing ~3,370 drawings first. Do decide import rules explicitly (nullable `default_image_id` vs strict build) when slice 3 lands.

**Parallel dependency (slice 2):** drawings still needed for **`art: draw`** tiles to show pictures — not for audio to exist.

---

## Phase C — Default tile voice for **entire extended lexicon**

**Scope:** one ElevenLabs clip per extended **utterance** (each label/phrase = one utterance per schema § 8), same stability settings as tiles, **`eleven_v4`**.

**After Phase B**, expected mint volume ≈ **extended utterance count** (order **~3,900–4,000**, not 32).

### Reuse existing batch + review machinery

```text
extended utterance list (from catalog or extended_lexicon after import)
  →  build_catalog_tile_queue.mjs --layer extended --batch elevenlabs-tiles-extended
  →  mint_elevenlabs_tile_batch.mjs --batch elevenlabs-tiles-extended [--limit N]
  →  review (elevenlabs-tiles UI and/or batch A/R pattern from v4 lab)
  →  publish → per-utterance clip rows + R2
  →  catalog:build
```

**Review at scale:** Founder policy stays **≤10 new mints before listen** unless explicitly approved for a larger batch. For ~4k clips, plan **batch review** (v4-lab-style approve/reject JSON + publish approved only) or segmented category passes — not one marathon session.

**Storage truth:** Today `generated_audio.json` is **launch gap-fill by slot**; extended fringe clips will live in **`catalog.json` `clips`** (and R2) per schema once import exists. Inventory: extend `list_elevenlabs_catalog_audio.mjs` / new coverage CLI with `--layer extended`.

**WBB:** Extended rows will mostly be **ElevenLabs-only** (no WorkbookBench original).

### Master orchestrator (proposed npm — not implemented)

```bash
npm run catalog:audio:utterance-coverage              # shipped catalog only
npm run catalog:audio:extended-coverage             # extended_lexicon vs catalog utterances + clips (proposed)

npm run catalog:tiles:master-queue -- --layer shipped
npm run catalog:tiles:master-mint -- --batch elevenlabs-tiles-core --limit 10

# After phase 010 slice 3:
npm run catalog:tiles:master-queue -- --layer extended --batch elevenlabs-tiles-extended
npm run catalog:tiles:master-mint -- --batch elevenlabs-tiles-extended --limit 10
```

### On-demand mint (future — growth loop)

Not implemented in the Worker yet. Direction matches `docs/product/Clipart_Pipeline_And_Catalog_Growth.md` § 1 (audio synthesized once when a word enters the shared catalog).

**Recommended implementation:**

1. **Trigger:** missing ready clip for a **catalog** utterance under the active bundled voice (first tap or first promotion), not for Jev-`personal` entities.
2. **Mint:** ElevenLabs `eleven_v4` + tile settings from `voices.json`; same text rules as gap-fill.
3. **Persist:** R2 + catalog `clip` row; **dedupe** on `(voice_id, normalized_spoken_text)` so later users hit cache.
4. **Privacy:** personal names/places stay off the public library (entities keep device TTS today).
5. **Quality:** treat v4 plain as **good enough to ship on first mint** for on-demand; keep batch ear-review for pre-seeded launch/extended bulk; optional async spot-check.

Bundled voice + catalog sense without clip is **silence** today (`resolveSlot`) — so extended import must pair with either **pre-seed (Phase C)** or **on-demand fill**, not art.

---

## Phase D — Additional voices (male intake, etc.)

**Prerequisite:** Phases A + C complete for **default** voice (utterance list stable).

Same **`master-queue` / `master-mint`** with `recipes.defaults.voice_id` = intake winner; separate batch folder and **`shipping.json`** per voice; catalog **`voice`** rows + clip FK (`Language_And_Voice_Schema.md`). Do **not** overwrite default tile R2 keys.

Voice selector: round 1 winner **`c2`** → `aGfQDyfOrmWWfC7ZnTbv` in `data/samples/elevenlabs-voice-selector/decisions.json`.

---

## Suggested execution order (when approved)

1. **Phase A** — close **7 + 32** on **shipped** catalog (small, use existing tile review).
2. **Phase B** — extended **utterances** into `catalog.json` (images optional per row; do not block on art).
3. **Phase C** — default voice clips for full extended list (batch mint/review; can run **in parallel** with slice 2 art).
4. **Phase D** — repeat clip library for alternate voices.

---

## Related docs

- **`docs/phases/028_Catalog_Tile_Voice_Library_Proposal.md`** — review packet (economics, on-demand, Works Tests) before execution
- `docs/product/Word_Library.md` § 6 — extended library size and tier
- `docs/phases/010_Extended_Picture_Library.md` — slices 2–4 (art, catalog tier, voices)
- `docs/operations/ElevenLabs_Tile_Minting.md` — today’s launch gap-fill review URLs
- `docs/product/Language_And_Voice_Schema.md` — utterance / voice / clip
