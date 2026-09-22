# Phase 008 — Partner Listening

**Status:** Ready to execute. Not started. Start after
`docs/phases/006_Prediction_Engine.md` slice 3 (the `echo` feature exists
there with value 0).

**DECIDED 2026-09-22** (founder: "the device is not always listening …
sometimes you want the device to be listening, other times you don't …
some users never want the device to be listening"). Intake:
`docs/founder/2026-09-22_Prediction_Blend_Privacy_Listening.md`.

Product truth this phase implements:

| Topic | Owner |
| --- | --- |
| Listening states, on-device speech, partner-word lifetime | `docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 6 |
| What reaches Jev when something was heard | `docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 3.2 |
| Listen key layout rules | `docs/product/Motor_Grid_And_Art.md` § 2 |
| `listening` setting column | `docs/product/Language_And_Voice_Schema.md` § 6.2e |

---

## Why this phase exists

The strongest single signal for the next word is what the partner just
said: "pancakes or waffles?" should put both on the strip. But a device
that always listens is unacceptable to many families and schools. The
family must control it, and prediction must stay good without it.

## Vocabulary for code and docs

| Use | Never use |
| --- | --- |
| listening setting (on/off, Parent corner) | mic mode, ambient mode |
| Listen key | mic button, hot mic |
| listening (the live state) | recording |
| partner words (text of one turn) | transcript, partner utterance log |

---

## Slice 1 — The setting and the Listen key (no microphone yet)

Goal: a family can turn listening on or off in the Parent corner; when on,
a Listen key appears and toggles a visible listening state.

**Founder call before building:** the key's position in the top bar.
Recommendation: next to Speak, on the side away from ⌫ and the Forms key,
so a partner reaching from across the table finds it without touching the
child's word keys.

Files: `src/board/schema.sql` (§ 6.2e `listening` column),
`public/index.html`, `public/board.js` (Parent corner toggle, key render,
toggle state), `listening.test.mjs` (new, in src/board).

1. Setting off: the key is not rendered and nothing calls
   `getUserMedia`.
2. Setting on: the key is rendered in every board state (index, groups,
   keyboard) at the same position.
3. Tap toggles the live state; the key shows an indicator that cannot be
   missed while live.

Surface owner: `public/board.js` (the top bar render).

Lie-prone layer: a key hidden with CSS while the microphone code still
runs. Assert on calls, not on visibility.

Works Test: with the setting off, a stubbed `getUserMedia` is never called
in any state and the key is absent from the DOM. With it on, the core
grid's cell rectangles are identical before and after toggling live on and
off (zero layout shift), and the key is present in every state.

Proof command: `scripts/test.sh` on the new test.

Done when: that passes and a person can turn the setting on, see the key,
and toggle it.

---

## Slice 2 — On-device speech to text (spike, then build)

Goal: pick a speech-to-text engine that runs on the device on the target
browsers (iPad Safari first, then Chrome), and prove no audio leaves.

**UNVERIFIED** at intake: which browser engines recognize speech on the
device. The Web Speech API may send audio to a vendor server on some
browsers; a Whisper-class model in WebGPU/WASM runs locally but costs a
download. The spike decides with measurements, not documentation.

Files: `docs/phases/008_Partner_Listening.md` (§ Spike result),
`public/shared/listen.mjs` (new).

Measure per candidate engine: network requests during recognition
(captured from the browser's network log while speaking — the instrument
is the network, not the engine's claim), latency from end of speech to
text, word accuracy on 20 recorded partner questions, download size.

Works Test: during a recognition run with the chosen engine, the captured
network log contains no request carrying audio.

Done when: the result table is under § Spike result and the founder has
accepted the engine.

---

## Slice 3 — Partner words into prediction

Goal: what the partner said shapes the strip for one turn, locally and
(with sharing on) through Jev, and is never stored.

Files: `public/shared/listen.mjs`, `public/shared/funnel.mjs` (`echo`
feature), `public/shared/jev.mjs` (`partner_said` field),
`partner_words.test.mjs` (new, in src/board).

1. Recognized text becomes the current partner words, replacing any
   earlier ones.
2. `echo` = 1 for shortlist items named in the partner words; items named
   there are added to the shortlist if missing.
3. With Jev sharing on, `partner_said` joins the request (§ 3.2).
4. Partner words expire when the child speaks or clears the sentence, or
   after a timeout (starting value 60 s, tuned by use).
5. Never written to SQLite, OPFS, or any log; impressions keep only `echo`.

Lie-prone layer: text that is "not stored" but lands in an impression's
JSON or a console log that is persisted.

Works Test: with a stub engine that "hears" *Do you want pancakes or
waffles?*, the strip offers both; the captured Jev body (sharing on)
contains `partner_said`; after Speak, the next captured body does not. Then
read the raw database file bytes and assert the partner text does not
appear anywhere.

Done when: that passes and a person can say a question aloud with
listening on and see its items in the strip.

---

## Slice 4 — Listening stops on its own

Goal: listening never outlives the conversation.

Rules: stop on key tap; on app leaving the foreground
(`visibilitychange`); after a stretch with no speech (starting value 5
minutes). The indicator goes off with it.

Works Test: each stop condition, simulated, turns the live state off and
releases the microphone track (stub asserts `track.stop()` called).

Done when: that passes on the test and on a device.

---

## Spike result

Filled in by slice 2.

## Out of scope

Caregiver Co-Pilot (partner on their own phone). Speaker identification.
Always-on listening without a key. Partner words in any history.
