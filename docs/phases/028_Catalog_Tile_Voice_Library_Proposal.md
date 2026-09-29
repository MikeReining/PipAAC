# 028 — Catalog tile voice library (proposal)

**Status:** **Proposed — awaiting review before execution** (2026-09-29).  
**Reviewers:** assign a second pair of eyes (product + engineering) before any bulk mint, R2 publish, or Worker on-demand path ships.

**Not executing yet.** This doc is the packet for that review. Operational detail and measured gaps: `docs/operations/Catalog_Tile_Voice_Coverage_Plan.md`.  
**Related:** phase 010 (extended library), 024 (sentence Grok cache — **different** pipeline), `docs/product/Clipart_Pipeline_And_Catalog_Growth.md` § 1, `docs/product/Language_And_Voice_Schema.md`, `docs/operations/ElevenLabs_Tile_Minting.md`.

---

## 1. Problem we are solving

Families customize. They add words, phrases, and (via transforms) sentences. They expect **a consistent tile voice** — human ElevenLabs for catalog tiles (`voices.json` → `tiles`, `eleven_v4`), not silence.

**Economics:** ElevenLabs (and any cloud TTS) must run **once per shared asset**, not once per user. If every custom add triggered a fresh mint for every account, marginal cost scales with users × vocabulary and the model in `Clipart_Pipeline_And_Catalog_Growth.md` (“generate once, benefit forever”) breaks.

**Today (code truth):**

| Path | Image | Audio (bundled default voice) |
| --- | --- | --- |
| Launch / catalog **sense** with ready **clip** | Symbol if shipped; else label + color | Plays clip (`public/shared/voice.mjs` → `resolveSlot`) |
| Catalog sense **without** clip | Same | **Silence** — no device TTS fallback for senses |
| **Personal entity** (Add → “New: …”) | Photo or initial glyph | **Device TTS** on the name |
| **Sentence** ▶ / transforms | n/a | Grok + R2 sentence cache (024) — not this proposal |

Extended library rows (~**3,968** in `data/extended_lexicon.json`) are **not** in shipped `catalog.json` yet (~**1,087** utterances today: launch + forms). Finishing “default voice for the whole planned extended catalog” is a **large clip library** plus import — not the small **32**-utterance launch tail often confused with extended scope.

---

## 2. Product principles (proposed)

1. **Mint once, reuse forever** for anything in the **shared public catalog** (launch, extended fringe, demand-promoted candidates). Store in R2 + catalog `clip` rows; dedupe on stable keys.
2. **Customization must speak immediately** where product allows — but **personal** content must not pollute the shared library or burn API budget on duplicate private names.
3. **Audio does not require art.** Utterance + clip can ship before a drawn symbol; UI already falls back to label + Fitzgerald color (`public/shared/images.mjs`, `public/board.js`). Art (`art: draw`) follows on its own review track.
4. **Default tile voice first**, then alternate voices (male intake winner and future named voices). Same utterance inventory; different ElevenLabs `voice_id` and clip rows — no silent swap of default tiles (024 § 2, project laws).
5. **Quality gate split:** founder ear-review for **bulk pre-seed** batches; **v4 plain** acceptable to **ship on first mint** for **on-demand / promotion** with optional async spot-check (consistent with v4 regen experience ~99% plain).

---

## 3. Two complementary supply modes

### 3.1 Pre-seeded batch library (bulk)

**What:** Generate clips for a **known list** — launch gap-fill, forms (existing path), and after phase 010 import, the full extended utterance list (~4k).

**How (reuse):** queue → `mint_elevenlabs_tile_batch.mjs` → local review (`elevenlabs-tiles` / v4-lab A/R at scale) → publish → R2 + `catalog.json` / sidecars → `catalog:build`.

**When:** Before launch needs extended words speakable at scale; before alternate voices copy the inventory.

**Cost:** O(unique utterances × voices pre-seeded) — predictable, one-time per voice.

### 3.2 On-demand mint (lazy fill + growth loop)

**What:** The **first** time a **shared catalog** utterance needs a bundled-voice clip and none exists, mint once, upload, register `clip`, forever after serve from cache.

**Triggers (proposed):**

- Extended/import utterance first played or first placed from Library before batch pre-seed caught it.
- **Demand promotion:** word crosses catalog growth threshold (`Clipart_Pipeline_And_Catalog_Growth.md` § 4, `$k`-anonymity) — audio mint accompanies promotion, not every typing session.
- **Not** every keystroke in Add, and **not** personal entities (see § 4).

**Dedupe (required for economics):**

```text
dedupe_key = (voice_id, locale, normalized_spoken_text, model_generation_profile)
```

- Second user, same promoted word → **cache hit**, zero ElevenLabs call.
- Content-addressed R2 keys (sha256 prefix) match existing catalog discipline.
- Worker or a small mint service holds `ELEVENLABS_API_KEY`; clients never mint directly.

**Default quality:** `eleven_v4` + tile stability settings; plain spoken label (same as tile gap-fill). Fail closed to silence + logged retry if API fails — do not loop mint per tap.

---

## 4. Privacy and what never enters the shared library

**Personal entities** (Add → New name, family photos, Jev `scope: personal` from Draw it for me) stay **device TTS or private blobs** — **no** upload to public R2 clip library.

**Catalog candidates** (`scope: catalog_candidate`) and imported extended/launch rows are eligible for shared mint after promotion rules pass.

This preserves customization (“Cooper” speaks on the device) without minting “Cooper” thousands of times for unrelated families.

---

## 5. Scope boundaries

| In scope (028) | Out of scope (other docs) |
| --- | --- |
| Single-word tiles, form surfaces, extended **phrases as one utterance** | Sentence ▶ / transform Grok + R2 (024) |
| ElevenLabs tile voice + future alternate tile voices | Grok `ara` as default tile replacement |
| Pre-seed batch + on-demand **catalog** clips | Unlimited Draw-it-for-me image generation economics (010 slice 6) |
| Voice selector intake → named catalog voices (step 2) | Changing bundled-voice TTS fallback for senses without clips (would be schema/product change) |

---

## 6. Execution phases (after approval)

Order preserves economics and stable utterance IDs.

| Phase | Goal | Approx. scale |
| --- | --- | --- |
| **A** | Default voice completes **shipped** `catalog.json` (launch tail + forms) | ~7 launch generated slots + ~32 utterances missing ready clips (re-measure before mint) |
| **B** | Import extended **utterances** into catalog (`secondary_fringe`); **images optional** per row | ~3,954 new utterances vs today (minus launch overlap) |
| **C** | Pre-seed default-voice clips for full extended list | ~4k ElevenLabs calls (one per utterance), batch review policy |
| **D** | Alternate voices (e.g. male intake `aGfQDyfOrmWWfC7ZnTbv`) | Same utterance count × each shipped voice |
| **E** | Worker on-demand mint + dedupe for promotions and lazy gaps | O(new shared labels over time), not O(users) |

**Tooling to build (not started):** `catalog:audio:utterance-coverage`, `catalog:audio:extended-coverage`, `build_catalog_tile_queue.mjs`, `catalog:tiles:master-queue` / `master-mint`, Worker route + idempotent mint ledger.

**Voice selector:** round 1 winner recorded in `data/samples/elevenlabs-voice-selector/decisions.json` — does not change default tiles until phase D product slice.

---

## 7. Review gates and founder policy

| Action | Gate |
| --- | --- |
| Bulk mint >10 clips | Explicit founder approval (`AGENTS.md`, ElevenLabs doc) |
| R2 publish / replace catalog audio | Explicit founder approval |
| On-demand **public** clip creation | Approved architecture (this doc) + rate limits + dedupe tests |
| Alternate voice overwrites default | **Forbidden** without new product slice |

**Reviewer checklist:**

- [ ] Dedupe story prevents per-user re-mint for the same catalog utterance and voice.
- [ ] Personal entities cannot write to shared clip namespace.
- [ ] Pre-seed vs on-demand split matches cost model (bulk once; lazy for long tail / promotions).
- [ ] Art decoupled from clip requirement is acceptable for fringe import build rules.
- [ ] Phase order (A→B→C before D; E after shared utterances exist) makes sense.
- [ ] Works Tests below are sufficient proof for first execution slice.

---

## 8. Works Tests (proof when executing)

1. **Instrument:** `catalog:audio:utterance-coverage` (and extended variant) reports **0** missing ready clips for default voice on all imported extended utterances intended to speak.
2. **Dedupe:** Two simulated clients request the same promoted label; second request performs **zero** ElevenLabs calls (assert via mock or ledger).
3. **Personal add:** New entity “Scientist” speaks via **TTS**; no new row in public R2 clip index.
4. **Catalog add:** Placing a fringe sense with pre-seeded clip plays **clip**; with on-demand enabled and no clip, first tap mints once, second tap hits cache.
5. **No art:** Sense with clip but `default_image_id` null renders label+color and **plays audio**.
6. **Alternate voice:** Choosing male voice plays **male clip row**, not default clip, for the same utterance.

---

## 9. Open questions for reviewers

1. **Sidecar format** for multi-voice clips before full `clip.voice_id` migration — nested in catalog build vs `generated_audio.<voiceKey>.json`.
2. **On-demand without ear review:** accept v4 plain as shipped default, or require async human spot-check queue?
3. **Forms + extended phrases:** same mint pipeline as lemmas; any IPA/lexical guards from v4 lab apply to phrase list?
4. **Rate limits** on Worker mint (per account, per day) as abuse guard alongside dedupe.

---

## 10. After review

- **Approve** → move execution into phased slices (update `docs/phases/README.md` § Next when a slice starts); implement phase A tooling first.
- **Revise** → amend this doc; do not bulk mint until consensus.
- **Reject on-demand** → still execute pre-seed only; accept higher pre-seed completeness requirement before fringe words speak.

---

## Related links

- `docs/operations/Catalog_Tile_Voice_Coverage_Plan.md` — measured inventory, script names, ops commands
- `docs/operations/ElevenLabs_Tile_Minting.md` — current review URLs and gap-fill
- `docs/phases/010_Extended_Picture_Library.md` — extended import and art slices
- `docs/phases/024_Sentence_TTS_And_Audio_Cache.md` — sentences (not tiles)
