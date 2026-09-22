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
|    - Batch synthesis generates the 656 catalog words/utterances               |
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
* **One Voice per Profile:** A user profile selects one active `voice_id`.
* **The `voice` Row:**
  ```sql
  INSERT INTO voice (voice_id, name, kind, locale, provider, provider_voice_id)
  VALUES ('voi_mom_01', 'Mom (Cloned)', 'cloned', 'en-US', 'elevenlabs', '21m00Tcm4TlvDq8ikWAM');
  ```
* **The `clip` Rows:**
  Each utterance in `catalog.json` receives a corresponding binary audio clip stored in local OPFS storage (`/audio/{voice_id}/{utterance_id}.opus`), indexed in the `clip` table.

---

## 4. Cost, Packaging & Privacy Invariants

| Law | Rule |
| --- | --- |
| **Speaking is never gated** | If cloud voice generation is offline or pending, the device speaks immediately using built-in OS `speechSynthesis`. |
| **One-time generation cost** | Batch-generating 656 short single-word utterances on modern neural engines costs pennies (~$0.30–$0.60 per voice library). It is packaged as an affordable one-time add-on or creator credit. |
| **Privacy & Consent** | Audio samples uploaded for voice cloning require explicit adult consent in the Parent Corner and are never shared with third parties or used for public model training. |
