# 024 — Sentence TTS and Audio Cache (Grok Voice + Cloudflare R2)

**Status:** decided direction, reviewed 2026-09-25 (founder + CTO review).
Ready to slice once 023's transform buttons are being wired; it can start
earlier because ▶ benefits on its own.
**Context:** paired with `023_Transform_Buttons.md` (Groq sentence rewrites).
Grok Voice synthesis notes: `docs/operations/Grok_Voice_Synthesis_Best_Practices.md`.
**Truth owner:** measured API latency and cost (Grok Voice `ara`), measured
cache behavior on real children's sentences (§ 4), and what plays on a real
tablet.

---

## 1. What we're building

1. **Whole-sentence speech with Grok Voice.** ▶ and the transform buttons
   speak the sentence as one natural utterance instead of gluing word clips
   together.
2. **One voice everywhere.** The single-word catalog clips are re-made in the
   same Grok voice, so a tapped word, a spoken sentence and a transformed
   sentence all sound like the same person. This answers 023 § 5 item 1.
3. **A cache** so repeated sentences play fast and work offline: on her
   device first, then a shared Cloudflare R2 cache for sentences made only of
   Pip's own words (§ 5).

## 2. Why gluing clips hits a wall

1. **Robotic cadence:** clips don't blend into each other the way speech does.
2. **Questions need a rising tune** across the whole sentence (*"Do you want
   to play? ↗"*). Flat clips can't make it.
3. **Transformed sentences contain words we don't have clips for**
   (*"Daddy's"*, *"didn't"*, *"I'm going to"*).

## 3. Rules (founder-reviewed, 2026-09-25)

1. **▶ never waits on the network.** Today ▶ plays instantly and offline from
   clips. That must not get worse: if the whole-sentence audio isn't ready
   within about **300 ms**, play the word clips immediately. A single-word tap
   always plays its clip. Sentence audio is an upgrade when it's there, never
   something she depends on.
2. **The cache key includes the voice.** Key = `sha256(voice id + voice
   settings + model version + text)`. The text keeps its punctuation
   (*"?"* gives the rising tune) and is otherwise normalized (case, spaces).
   Without the voice in the key, adding a second voice would play the old
   voice from cache.
3. **Voice is a per-child setting.** Families choose from the Grok voices
   available now (a boy can pick the male voice today). Grok has no child's
   voice yet and no voice cloning in Canada. When any provider offers a
   child's voice, it's a new voice id plus a re-made clip set (about 870
   words: pennies at $4.20 per million characters). No redesign.
4. **The shared cache holds only sentences made entirely of Pip's own words**
   (§ 5).
5. **No subscription.** Voice and transform buttons are part of the one price
   ($49 once per user, phase 015). Founder, 2026-09-25: no subscription,
   given the cost numbers in § 6.

## 4. The pipeline

```text
She taps ▶ (or a transform button; 023 rewrites the text first)
   │
   ├─ Tier 1: her device cache (IndexedDB / OPFS) ── hit → play now
   │
   ├─ Tier 2: shared R2 cache (only for Pip-words-only sentences, § 5) ── hit → stream, save to Tier 1
   │
   ├─ Tier 3: Grok Voice TTS via the Worker ── play, save to Tier 1, and to Tier 2 if eligible
   │
   └─ Deadline: nothing playing after ~300 ms → play the word clips now (rule 1)
```

The Grok key lives in the Worker, never in the client. Requests carry no
user, device or account id.

### How often the cache will hit (measured 2026-09-25)

The earlier draft claimed the top 100 sentences are 70–80% of everything
said. On 486,189 real children's sentences from CHILDES (2+ words, every
word a Pip word), that's not true:

| | Earlier draft | Measured |
| --- | --- | --- |
| Top 100 sentences cover | 70–80% | **13%** |
| Top 1,000 | – | **28%** |
| Top 10,000 | – | **47%** |
| Shared-cache hit rate | 85%+ by day 90 | **~43%** after 100,000 sentences |

The most common: *I don't know*, *what's that*, *what's this*, *that one*,
*thank you*, *come on*. AAC sentences are shorter and more repetitive than
speaking children's, so real hit rates will probably be higher, and her own
device cache catches her own repeats. Plan for about half of sentences being
synthesized live. **The number that matters is the p95 time from a real
tablet to first sound on a cache miss**, not the ~190 ms measured from a
server.

## 5. Privacy: the shared-cache line

**A sentence goes into the shared cache only if every word in it is a Pip
catalog word or one of its forms.** A sentence with a name she added
(`personal_entity`) or a word she typed is cached on her device only.

Why this line: the cache is shared, so a fast answer to a sentence reveals
that someone said it before. For *"I want a cookie"* that reveals nothing.
For *"Aoife hit me"* it can point at a child. Pip's vocabulary is public;
her people's names and her typed words are hers.

- No name list to maintain (replaces the earlier options A, B and C).
- Almost no cost to hit rate: most sentences are vocabulary-only.
- Names are still spoken in the same voice. They are sent for synthesis
  without any id, just never shared.

## 6. Cost

Measured prices: Groq rewrite ~50 tokens ≈ $0.00001 per call; Grok Voice
$4.20 per 1M characters (~25 characters per sentence ≈ $0.000105); R2
storage $0.015 per GB-month, zero egress.

Heavy user, 60 sentences a day, a year (21,900 sentences):

| | Cost per year |
| --- | --- |
| Transforms (every sentence, worst case) | ~$0.22 |
| Speech with **no** cache hits at all | ~$2.30 |
| Speech at the measured ~43% hit rate | ~$1.31 |
| R2 storage | ~$0.10 |

So the cache is about **speed and offline, not money**: even with no cache
at all, a heavy user costs about $2.50 a year. $49 once covers that for
decades, which is why there is no subscription (rule 5).

## 7. Replacing ElevenLabs for the catalog clips

ElevenLabs costs $30–100+ per 1M characters; Grok Voice $4.20. Grok (`ara`)
was tested on the hardest single function words (*a, an, the, in, to, and*)
with IPA replacements (`replace: { "a": "/ə/" }`) and `<soft>` tags: natural
lengths (0.60–0.84 s), no background noise, and 100% correct when
transcribed back with Groq Whisper. Transcription proves the words are
understandable; whether they sound natural is judged by listening.

Re-making the clips changes every word's voice once, which is why it happens
before launch. The existing pipeline stays (WorkbookBench is no longer the
first source for this voice, since its clips are a different voice).

## 8. Slices

1. **Worker endpoint** `POST /api/v1/voice/speak`: builds the cache key
   (rule 2), checks R2 for eligible sentences (§ 5), otherwise calls Grok
   Voice, returns audio, stores it in R2 when eligible. No ids in the
   request.
2. **Client:** Tier 1 cache (IndexedDB / OPFS), the ~300 ms deadline with
   word-clip fallback (rule 1), and the per-child voice setting (rule 3).
3. **Transform buttons** (023) speak through this pipeline, auto-speak on.
4. **Catalog re-make:** `scripts/catalog/generate_missing_audio.mjs` switches
   to Grok Voice with the phonetics table, one clip set per voice.
5. **Measure on a real tablet:** p95 time to first sound for a cache hit, a
   cache miss, and the clip fallback; plus the Tier 1 and Tier 2 hit rates
   in real use.
