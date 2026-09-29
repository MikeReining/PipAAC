/**
 * American English IPA for ElevenLabs v4 via Groq (same model family as transform buttons).
 * Env: GROQ_API_KEY — never read .env from disk in library code; callers load .env in CLI/dev server.
 */

export const GROQ_IPA_MODEL = "qwen/qwen3.8-27b";
const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

/** @typedef {"isolated_tile" | "connected_speech"} IpaSpeechContext */

export function buildIpaSystemPrompt(context = "isolated_tile") {
  const isolated = context !== "connected_speech";
  const contextBlock = isolated
    ? `CONTEXT: AAC app tile — the child taps ONE word alone and hears it in isolation (not in a sentence).
- Use citation / dictionary / "learning" American English: clear vowels, full syllables.
- Do NOT use reduced weak forms (schwa) for function words spoken alone.
  Examples: "an" → /æn/ (one syllable, indefinite article — NOT the name "Anne"); "a" → /eɪ/ when letter name or clear /æ/ for article, not schwa /ə/; "the" → prefer /ðiː/ when isolated.
- One syllable per tile unless the label is a multi-word phrase.
- Articles, prepositions, pronouns, and helpers are still spoken as standalone words, not as they sound mid-sentence.
- American English: "laughs" → /lævz/ (NOT /lɔːɡz/ — that reads as "logs").
- Labels that name a body sound (cough, laugh, sneeze, burp, hiccup): IPA for the dictionary word only — never onomatopoeia or imitating the sound.`
    : `CONTEXT: Word or phrase as in natural connected speech (reduced vowels allowed when appropriate).`;

  return `You convert English into American English IPA for ElevenLabs v4 TTS.
Reply with ONLY valid JSON: {"ipa":"/.../","gloss":"optional ≤6 words if ambiguous"}

${contextBlock}

Rules:
- Wrap IPA in forward slashes with stress marks (ˈ ˌ) for multi-syllable words.
- For multi-word phrases, one IPA string for the whole phrase.
- If ambiguous (read, bow, lead), pick the most common AAC / child vocabulary sense and note it in gloss.`;
}

/** Default for Pip tile lab and gap-fill. */
export const IPA_SYSTEM_PROMPT = buildIpaSystemPrompt("isolated_tile");

/**
 * Eleven v4: grapheme plus IPA in slashes (see ElevenLabs best practices).
 * @param {string} spoken
 * @param {string} ipa e.g. /æn/
 */
export function formatElevenV4IpaLine(spoken, ipa) {
  const word = String(spoken ?? "").trim();
  const wrapped = normalizeIpaField(ipa);
  if (!word) return wrapped;
  // Single-word tiles: grapheme + IPA makes Eleven say both (e.g. "an /æn/" → "an" + "Anne").
  if (!/\s/.test(word)) return wrapped;
  return `${word} ${wrapped}`;
}

/**
 * @param {string} raw model message
 */
export function parseGroqIpaPayload(raw) {
  const text = String(raw ?? "").trim();
  if (!text) throw new Error("empty Groq IPA response");
  const jsonSlice = text.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonSlice ? jsonSlice[0] : text);
  const ipa = normalizeIpaField(parsed.ipa);
  const gloss = typeof parsed.gloss === "string" ? parsed.gloss.trim() : "";
  if (!ipa) throw new Error("Groq IPA JSON missing ipa");
  return { ipa, gloss };
}

/**
 * @param {string} ipa
 */
export function normalizeIpaField(ipa) {
  const raw = String(ipa ?? "").trim();
  if (!raw) return "";
  const inner = raw.replace(/^\/+|\/+$/g, "").trim();
  if (!inner) return "";
  if (!/^[\p{L}\p{M}\p{Nd}\sˈˌːʰʷʼ˞\-.,]+$/u.test(inner)) {
    throw new Error("ipa contains unexpected characters");
  }
  return `/${inner}/`;
}

function requireGroqKey(apiKey = process.env.GROQ_API_KEY) {
  const key = apiKey?.trim();
  if (!key) {
    throw new Error(
      "GROQ_API_KEY is not set. Add it to .env for auto-IPA in the v4 lab (Groq qwen/qwen3.8-27b).",
    );
  }
  return key;
}

/**
 * @param {{ text: string, apiKey?: string, model?: string, fetchImpl?: typeof fetch, context?: IpaSpeechContext }} opts
 */
export async function lookupIpaGroq({
  text,
  apiKey,
  model = GROQ_IPA_MODEL,
  fetchImpl = fetch,
  context = "isolated_tile",
} = {}) {
  const spoken = String(text ?? "").trim();
  if (!spoken) throw new Error("text is required");
  const res = await fetchImpl(GROQ_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireGroqKey(apiKey)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 120,
      messages: [
        { role: "system", content: buildIpaSystemPrompt(context) },
        { role: "user", content: spoken },
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message ?? `Groq HTTP ${res.status}`;
    throw new Error(`Groq IPA lookup failed: ${msg}`);
  }
  const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
  const { ipa, gloss } = parseGroqIpaPayload(raw);
  return { ipa, gloss, model, spoken, context };
}
