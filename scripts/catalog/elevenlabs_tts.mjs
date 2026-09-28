/**
 * ElevenLabs TTS for Pip catalog backup voice (see data/catalog/voices.json).
 * Env: ELEVENLABS_API_KEY only — voice_id comes from committed config, not .env.
 */

const API = "https://api.elevenlabs.io/v1";

export const DEFAULT_MODEL = "eleven_v3";
export const DEFAULT_VOICE_SETTINGS = {
  stability: 0.4,
  similarity_boost: 0.8,
  style: 0,
  use_speaker_boost: true,
};

/** Eleven v4 accepts stability + similarity_boost only (no style / speaker_boost). */
export function voiceSettingsForModel(model, base = DEFAULT_VOICE_SETTINGS) {
  const stability = base.stability ?? DEFAULT_VOICE_SETTINGS.stability;
  const similarity_boost = base.similarity_boost ?? DEFAULT_VOICE_SETTINGS.similarity_boost;
  if (String(model).startsWith("eleven_v4")) {
    return { stability, similarity_boost };
  }
  return {
    stability,
    similarity_boost,
    style: base.style ?? 0,
    use_speaker_boost: base.use_speaker_boost ?? true,
  };
}

function requireKey(apiKey = process.env.ELEVENLABS_API_KEY) {
  const key = apiKey?.trim();
  if (!key) {
    throw new Error(
      "ELEVENLABS_API_KEY is not set. Add it to .env (gitignored), then: set -a && source .env && set +a",
    );
  }
  return key;
}

/**
 * @param {string} text
 * @param {{ voiceId: string, model?: string, voiceSettings?: object, apiKey?: string }} opts
 */
export async function synthesizeElevenLabs({ text, voiceId, model = DEFAULT_MODEL, voiceSettings = DEFAULT_VOICE_SETTINGS, apiKey } = {}) {
  if (!voiceId?.trim()) throw new Error("voiceId is required");
  const spoken = String(text ?? "").trim();
  if (!spoken) throw new Error("text is required");
  const res = await fetch(`${API}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": requireKey(apiKey),
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: spoken,
      model_id: model,
      voice_settings: voiceSettings,
    }),
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${(await res.text()).slice(0, 600)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
