/**
 * Welcome + first-run demo prompts are recorded once in the default
 * product voice (Eleven v4 — the voice row in tile_voices.json) and
 * shipped as bundled assets under public/audio/onramp/. No license, no
 * network, no device TTS — Pip never speaks in the cheap device voice
 * (founder 2026-10-01).
 *
 * The value is the exact text sent to ElevenLabs (after elevenSentenceLine
 * punctuation). The display text on cards may differ — "Tap ✨" shows the
 * icon but speaks "the sparkle". Mint: scripts/voice/mint_onramp.mjs.
 */
export const ONRAMP_CLIPS = {
  // welcome (onramp-ui.js)
  "welcome-setup": "Let's set up Pip. Who's it for?",
  "a-child": "A child.",
  "a-teen-or-adult": "A teen or adult.",
  "welcome-look": "How should the buttons look?",
  "pictures-and-words": "Pictures and words.",
  "words-only": "Words only.",
  // first-run demo (tour-ui.js)
  "tour-you": "Tap you.",
  "tour-want": "Tap want.",
  "tour-apple": "Now tap apple in the Smart bar.",
  "tour-fix": "Tap the sparkle to make it a sentence.",
  "tour-question": "Now tap the question mark to ask it.",
  "tour-done": "That's Pip. Now try your own.",
  // the scripted sentences the demo speaks — shipped clips, because a
  // first-run user has no license and the voice pipeline would be silent
  "you-want-an-apple": "You want an apple.",
  "do-you-want-an-apple": "Do you want an apple?",
  // 040 — the Lifetime page's "Hear the difference": the natural
  // sentence side. The free side plays the real word clips, no mint.
  "demo-sentence": "I want an apple.",
};

/** Path under public/ — playClip prepends the slash. */
export const onrampClipPath = (key) => `audio/onramp/${key}.mp3`;
