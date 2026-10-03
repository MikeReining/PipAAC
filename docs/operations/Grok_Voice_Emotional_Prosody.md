# Grok Voice: Emotional Prosody & Speech Expressions

**Status:** locked & verified (2026-09-25).
**Applies to:** full sentences and dynamic utterances synthesized via xAI Grok Voice (`https://api.x.ai/v1/tts`) using voice `ara`.
**Truth owner:** double-confirmed by acoustic analysis (RMS envelopes, pitch tracking $F_0$) and founder listening tests on 2026-09-25.

---

## 1. The Core Law: Zero Sound Effects

**Never inject theatrical sound effect tags (`[laugh]`, `[cry]`, `[tsk]`, `[giggle]`).**

Early testing proved that sound effect tags turn speech into a melodramatic cartoon. Real human emotion is not pantomime theater; it is subtle acoustic shaping:
* Sadness is a downward pitch drop and energy deflation, not audible weeping.
* Joy is pitch brightness and rhythmic lift, not cackling after every statement.
* Frustration is forceful acoustic emphasis, not tongue-clicking.

All emotional range in Pip AAC is achieved exclusively through **pure wrapping tags** and **terminal punctuation**.

---

## 2. The Locked Emotional Formulas

| Emotion | Exact Tag Formula | Acoustic Proof & Why It Won | Sample Reference |
| :--- | :--- | :--- | :--- |
| **Positive / Joyful / Excited** | `<higher-pitch><emphasis>${text}!</emphasis></higher-pitch>` | Lifts fundamental pitch ($F_0$) into a cheerful register, shifts the acoustic crescendo onto the predicate word (energy peaks at 70% of duration), and resolves with natural bright exclamation prosody. | `data/samples/happy_emphasis_pitch.mp3` |
| **Sad / Somber** | `<emphasis>${text}.</emphasis>` | The neural model natively interprets `<emphasis>` on sad semantics as **subglottic deflation**: produces a massive **$-41\text{ Hz}$ downward pitch collapse** (237 Hz $\rightarrow$ 196 Hz) and trails off terminal energy without artificial vocal fry. | `data/samples/sad_emphasis.mp3` |
| **Angry / Frustrated** | `<loud><emphasis>${text}!</emphasis></loud>` | Sustains high acoustic energy (`avgRMS = 2414` vs `2057` baseline) across the entire sentence, ending with a sharp, punchy finish on the final operative word. Gives the child firm, commanding presence. | `data/samples/angry_best_guess.mp3` |
| ~~**Repeat Tap ("Be Heard")**~~ | `<loud>${text}!</loud>` | **Not used** (founder, 2026-09-25): tested, not audibly different enough from neutral. Kept only as a record. | `data/samples/happy_loud.mp3` |

---

## 3. Acoustic Findings: Why Rejected Tags Failed

During our double-blind testing, acoustic instrumentation ($F_0$ pitch tracking, RMS envelope slicing, crest factor analysis) revealed why alternative formulas failed:

1. **Why `<lower-pitch>` failed for Sad:**
   - `<lower-pitch>` artificially forces the speaker's vocal tract into the basement.
   - In testing, it dropped the pitch down to $84\text{ Hz}$, inducing severe **vocal fry and mechanical creak** (crest factor jumped to $6.71$).
   - In contrast, `<emphasis>` preserves the natural, warm timbre of the voice while letting the pitch slide downward naturally.
2. **Why `<slow>` failed for Sad:**
   - Saccadic slowdown without pitch modulation makes speech sound drunk or robotic rather than emotionally distressed.
3. **Why `<loud>` alone failed for Joy:**
   - Blasting volume is not joy; shouting without pitch elevation sounds aggressive. Joy requires `<higher-pitch>` to elevate the acoustic register.

---

## 4. Implementation Helper (Client / Worker)

**BUILT** (`src/worker/prosody.mjs`): `applyEmotionalProsody(text, feeling)`
applies these formulas on the Worker — the client sends the plain
sentence plus `feeling`, so the tags live in exactly one place. The
`?` rule is built in: a question keeps `?` in every feeling (a
❓-transformed bar stays rising). Reference:

```javascript
export function applyEmotionalProsody(text, feeling = "neutral") {
  const trimmed = String(text).trim();
  const clean = trimmed.replace(/[.!?]+$/, "").trim();
  const q = /\?$/.test(trimmed) ? "?" : null;
  switch (feeling) {
    case "happy":
      return `<higher-pitch><emphasis>${clean}${q ?? "!"}</emphasis></higher-pitch>`;
    case "sad":
      return `<emphasis>${clean}${q ?? "."}</emphasis>`;
    case "angry":
      return `<loud><emphasis>${clean}${q ?? "!"}</emphasis></loud>`;
    default:
      return `${clean}${q ?? "."}`;
  }
}
```

---

## 5. Request Payload Example

```json
{
  "text": "<higher-pitch><emphasis>I'm happy!</emphasis></higher-pitch>",
  "voice_id": "ara",
  "language": "en"
}
```

*Note:* Full-sentence emotional requests do **not** use the `replace` phonetics table. The surrounding sentence context naturally carries standard pronunciation.

---

## 6. Legacy — Grok was production until 2026-09-29

Sections § 1–5 remain the acoustic record for **Grok Ara** (`applyEmotionalProsody` in `src/worker/prosody.mjs`). New expressive sentences use Eleven v4 (§ 7).

---

## 7. Eleven v4 expressive sentences (025 — shipping target)

**Founder decision 2026-09-29:** migrate **all** sentence feelings (neutral + happy/sad/angry) to **ElevenLabs `eleven_v4`**, using the **same voice as tiles** (`tile_voices.json` — Pip default, Leo when selected). Rationale: better delivery, one voice identity (tiles + bar), cost amortized by **024-style cache** (mint once per sentence × feeling × voice, replay from R2/device). AAC users need a **narrow, repeatable** expressive range — the probe winners are sufficient.

**Truth owner for mint text:** `src/shared/expressive_eleven.mjs` (`elevenExpressiveMintText`). **Do not** send Grok XML to Eleven.

| Feeling | Eleven text (after `normalize` / bar text) |
| --- | --- |
| neutral | `{sentence}{end}` — plain, no tag |
| happy | `[cheerful, bright voice] {sentence}!` (or `?` if question) |
| sad | `[sad] {sentence}.` |
| angry | `[frustrated] {sentence}!` |

`{end}` / `?` rule unchanged from 025 § 4 (questions stay questions).

**Listen lab:** `npm run catalog:expressive-probe:mint -- --round compare-v1` → [expressive review](http://127.0.0.1:3747/audio-review/elevenlabs-expressive). Probe CLI: `scripts/catalog/elevenlabs_expressive_probe.mjs`.

**Worker (shipped 2026-09-29):** `src/worker/voice.js` — Eleven + `elevenExpressiveMintText`, `voice` = active `tile_voices.json` `voice_key`, cache model `eleven_v4-expressive-1`. Fair-use counts **spoken sentence text** (not tags). Grok Ara remains in `voices.json` for catalog exploration scripts only until retired.
