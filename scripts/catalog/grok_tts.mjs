/**
 * Shared xAI Grok Voice TTS client for catalog exploration and minting.
 */

const TTS_URL = "https://api.x.ai/v1/tts";

/**
 * @param {string} text
 * @param {{ voiceId?: string, language?: string, speed?: number, replace?: Record<string, string> | null }} [opts]
 */
export function buildGrokTtsBody(text, { voiceId = "ara", language = "en", speed = 1, replace = null } = {}) {
  const body = {
    text: String(text),
    voice_id: voiceId,
    language,
    speed,
  };
  if (replace && Object.keys(replace).length > 0) body.replace = replace;
  return body;
}

/** @param {object} body Full API body (from buildGrokTtsBody or exploration recipes). */
export async function synthesizeGrokVoice(body, { apiKey = process.env.XAI_API_KEY } = {}) {
  const key = apiKey?.trim();
  if (!key) throw new Error("XAI_API_KEY is not set");
  const res = await fetch(TTS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Grok TTS failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
