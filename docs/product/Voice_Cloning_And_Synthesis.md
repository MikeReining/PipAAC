# Voice Cloning, Personal Voices & Speech Synthesis

**DECIDED 2026-09-22** (not built).
Intake: `docs/founder/2026-09-22_Customization_Pricing_VoiceCloning.md`.
Schema foundation: `docs/product/Language_And_Voice_Schema.md`.
Fact map: `docs/product/SSOT.md`.

---

## 1. Clinical & Emotional Foundation: The Right to a Familiar Voice

A person's voice is intimately tied to identity, comfort, and emotional connection:
* **The Mother's / Caregiver's Voice:** For a young non-verbal autistic child, hearing the calm, familiar cadence of their mother's voice provides immediate sensory regulation and emotional connection, contrasting sharply with cold, mechanical robotic voices.
* **The SLP Benchmark Voice:** Pip AAC's default voice prototype is proven by a voice clone generated from a 15-second audio recording of the founding Speech-Language Pathologist (SLP).
* **Voice Banking for Degenerative Conditions:** For communicators diagnosed with ALS, Parkinson's, or vocal cord trauma, cloning their own voice from a 10–15 second sample allows them to preserve their distinct vocal identity before speech deteriorates.

---

## 2. Architecture: Instant Cloning to Offline Cache

```text
+-------------------------------------------------------------------------------+
| 1. RECORDING CAPTURE (Parent Corner)                                          |
|    - Adult or communicator speaks for 10 to 15 seconds into device microphone |
|    - E.g. "The quick brown fox jumps over the lazy dog..."                    |
+-------------------------------------------------------------------------------+
                                       |
                                       v
+-------------------------------------------------------------------------------+
| 2. INSTANT VOICE CLONING (ElevenLabs API / Modern Neural TTS)                 |
|    - Creates a private Voice ID in seconds                                    |
|    - Preserves unique pitch, warmth, accent, and natural vocal timbre         |
+-------------------------------------------------------------------------------+
                                       |
                                       v
+-------------------------------------------------------------------------------+
| 3. CATALOG PRE-SYNTHESIS & LOCAL OPFS CACHING                                 |
|    - Batch synthesis generates the 677 catalog words/utterances               |
|    - Compressed audio (.opus / .mp3) downloads once into local SQLite/OPFS    |
|    - Stored in the `clip` table linked to `voice_id`                          |
+-------------------------------------------------------------------------------+
                                       |
                                       v
+-------------------------------------------------------------------------------+
| 4. ZERO-LATENCY OFFLINE PLAYBACK                                              |
|    - Tapping a button plays the local cached audio in <10ms                   |
|    - 100% functional without cellular or Wi-Fi connectivity                   |
|    - Device OS TTS (`speechSynthesis`) remains immediate unblocked fallback   |
+-------------------------------------------------------------------------------+
```

---

## 3. Storage & Schema Integration

In accordance with [`docs/product/Language_And_Voice_Schema.md:36-44`](file:///Users/mike/dev/PipAAC/docs/product/Language_And_Voice_Schema.md#L36-L44):
* **Voice picker BUILT 2026-09-29** (Settings → Talking → Voice; `docs/product/Design_System.md` § Settings → Voice). A cloned or banked voice joins it as one more active `voice` row.
* **One Voice per Profile:** A user profile selects one active voice (`learner_profile.preferred_voice_id`). A cloned voice is one more `voice` row, chosen in the same voice picker as the catalog voices (`docs/product/Word_Library.md` § 7; UI in `docs/phases/009_Word_Library_And_Customize.md` slice 5).
* **The `voice` Row:** columns and rules are owned by `docs/product/Language_And_Voice_Schema.md` § 5.5. *Correction 2026-09-22:* an earlier example here used columns (`name`, `kind`, `provider`, `provider_voice_id`) that the schema does not have. A cloned voice plays from clips, so it is shaped like any clip-backed voice; any provider id it needs is an amendment to § 5.5 made when cloning is built, not a second definition here.
* **Recording one word instead:** a caregiver recording of a single word or name is a `clip_override` (schema § 6.3), not a cloned voice. It wins in every voice for that word.
* **The `clip` Rows:**
  Each utterance in `catalog.json` receives a corresponding binary audio clip stored in local OPFS storage (`/audio/{voice_id}/{utterance_id}.opus`), indexed in the `clip` table.

---

## 4. Cost, Packaging & Privacy Invariants

| Law | Rule |
| --- | --- |
| **Speaking is never gated** | While a cloned voice's clips are generating or downloading, the profile keeps its current voice; it switches when the clips are ready. *Correction 2026-09-22:* this replaces "fall back to OS `speechSynthesis`", which would mix two speakers inside one voice, banned by `docs/product/Language_And_Voice_Schema.md` § 5.5 and § 7. |
| **One-time generation cost** | Batch-generating 677 short single-word utterances on modern neural engines costs pennies (~$0.30–$0.60 per voice library). It is packaged as an affordable one-time add-on or creator credit. |
| **Privacy & Consent** | Audio samples uploaded for voice cloning require explicit adult consent in the Parent Corner and are never shared with third parties or used for public model training. |

*Synthesis best practices & short-word phonetics guide:* [`docs/operations/Grok_Voice_Synthesis_Best_Practices.md`](../operations/Grok_Voice_Synthesis_Best_Practices.md) (§10 **backup voice** — ElevenLabs Aga clone in `data/catalog/voices.json`).
