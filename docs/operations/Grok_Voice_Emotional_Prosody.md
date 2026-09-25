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

```javascript
/**
 * Wrap a spoken sentence with Pip AAC's locked emotional prosody tags.
 *
 * @param {string} text - Clean sentence text (e.g. "I'm happy", "I am sad", "I am angry")
 * @param {"neutral" | "positive" | "sad" | "angry" | "loud"} emotion
 * @returns {string} Fully tagged string ready for Grok TTS
 */
export function applyEmotionalProsody(text, emotion = "neutral") {
  const trimmed = text.trim();
  const clean = trimmed.replace(/[.!?]+$/, "").trim();
  // A question stays a question in every feeling (phase 025 § 4).
  const q = /\?$/.test(trimmed) ? "?" : null;

  switch (emotion) {
    case "positive":
    case "happy":
    case "excited":
      return `<higher-pitch><emphasis>${clean}${q ?? "!"}</emphasis></higher-pitch>`;

    case "sad":
    case "somber":
      return `<emphasis>${clean}${q ?? "."}</emphasis>`;

    case "angry":
    case "frustrated":
      return `<loud><emphasis>${clean}${q ?? "!"}</emphasis></loud>`;

    case "neutral":
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
