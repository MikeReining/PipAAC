/**
 * The prompt planner — the model lane that writes the ONE-sentence
 * "hint" inside the draw scaffold. `buildPrompt` (draw_prompt.mjs) owns
 * the scaffold — the teaching line, the locked style clause, the no-text
 * rule, every framing/hand/social-scale clause — and Jev's `imagery`
 * answer picks the lane via `plannerLane`: literal → gptoss (fast),
 * metaphor → spark (reasons). The planner's only output is the hint:
 * WHAT to draw, never how.
 *
 * PLANNER_SYSTEM is the bundled copy of
 * data/pictures/draw_planner_prompt.md. The Picture Lab re-reads that
 * file per call so edits go live without a restart; the Worker cannot
 * read disk, so it ships this const. lab.test.mjs asserts the two are
 * identical — edit the md, then sync it here in the same commit.
 */
import { appHeaders } from "./draw_prompt.mjs";

/* eslint-disable -- the md body verbatim; the test pins it. */
export const PLANNER_SYSTEM = `You write the hint sentence for an AAC (augmented communication) picture
pipeline serving non-verbal communicators aged 7 to adult. Given a
concept, an optional adult description, and a classifier spec, you return
ONE simple, natural English sentence naming the canonical form of the
thing to draw (art-generator SKILL.md §4C).

Example of the shape, for \`dining chair\`:
"A wooden dining chair with a slatted backrest."

Rules:

- ONE sentence. Plain declarative English. No preamble, no quotes, no
  markdown, no explanation.
- Name the archetype: its parts, materials, and distinguishing details
  ("a round backyard trampoline with a black jumping mat, blue padded
  ring, and short metal legs"). The renderer already knows the canonical
  viewing angle — never police it.
- The sentence describes WHAT to draw, never HOW to draw it.

Banned — every one of these fights the reference images or breaks the
renderer (SKILL.md §4B–§4F):

- Style or technique words: "flat", "vector", "outline(s)", "stroke",
  "shading", "solid colour", "high contrast", "friendly style", "icon",
  "clipart", "illustration style", "minimalist".
- Camera policing: "centered", "symmetrical", "front-facing", "straight-
  on", "in 3/4 perspective", "filling the frame", "close-up".
- Negative laundry lists: "no text", "no people", "no background",
  "without …". Never use "no" or "without" — the scaffold owns every
  exclusion.
- Fluff adjectives: "clean", "simple", "cute", "vibrant" used as style
  decoration rather than a physical fact. ("A wooden chair" is fine;
  "a clean minimal chair" is not.)
- The word "cut" applied to produce — say "whole, uncut" or "a slice"
  instead (§4A: "cut" makes the model incise the fruit).

By spec \`entity_mode\`, the sentence's job changes:

- \`organic_noun\` / framing \`object\`: name the standalone thing — the
  sentence IS the subject. Never a person, never a body part.
- \`concept_action\`: check \`social_scale\` first. \`zero\` means the
  classifier already decided no person belongs — describe the scene,
  object, or sign alone and NEVER mention a person, stick figure, or
  body ("rain falling on a jacket"). Otherwise the actor IS a stick
  figure — name it: "a stick figure standing in the rain", "a stick
  figure pressing a button". Never write "a person" or "a child" — that
  draws a naturalistic human, which is not our lane. Hand pose, head
  count, and camera come from the scaffold — never mention them.
- \`anatomy_relational\`: name the body part plus the context it sits on
  and a black arrow pointing at it ("a person's neck on a simple upper-
  body silhouette, with a bold black arrow pointing at the neck"). Keep
  it vague on geometry — the arrow lives in empty space (§4F).
- \`category_packshot\`: describe the picture on the front of the package
  only ("a peanut and spread illustration on the front"). The container
  itself is already named by the scaffold.
- \`cpg_brand\`: say "authentic [brand] packaging" and nothing more.

Other fields:

- \`description\`, when present, IS the subject — the family's actual
  thing ("our golden retriever", "my mom's mom"). Write the sentence
  about that: "a golden retriever sitting". The person's name never
  appears.
- \`proloquo_anchor\` other than \`none\`: name its prop plainly in the
  sentence (a bold green directional arrow, a large round pushbutton,
  two toy blocks snapping together, open cupped palms held out to
  receive).

Output: ONE sentence. Nothing else.`;
/* eslint-enable */

export const OPENROUTER_CHAT = "https://openrouter.ai/api/v1/chat/completions";

/** The planner lanes — same system prompt, same one-sentence contract,
 *  different brains. Jev's `imagery` spec picks between them in
 *  production; the lab can run all three to compare speed and quality.
 *  qwen/gptoss ride OpenRouter to Groq with thinking off — a hint is
 *  not a reasoning task. */
export const PLANNER_MODELS = {
  spark: { model: "meta/muse-spark-1.3-contributor" },
  qwen: {
    model: "qwen/qwen3-32b",
    provider: { order: ["Groq"], allow_fallbacks: true },
    reasoning: { effort: "none" },
  },
  gptoss: {
    model: "openai/gpt-oss-120b",
    provider: { order: ["Groq"], allow_fallbacks: true },
    reasoning: { effort: "low" },
  },
};

/** What the planner sees: the concept, the family's description (the
 *  subject for personal scope), and Jev's draw spec. No ids exist on
 *  this path. */
export function plannerChatBody({ lane = "spark", text, description, spec, system }) {
  const cfg = PLANNER_MODELS[lane];
  if (!cfg) throw new Error(`unknown planner lane ${lane}`);
  return {
    ...cfg,
    messages: [
      { role: "system", content: system ?? PLANNER_SYSTEM },
      {
        role: "user",
        content: JSON.stringify({
          concept: String(text ?? ""),
          description: description || null,
          spec,
        }, null, 2),
      },
    ],
  };
}

/** Pull the hint sentence out of the chat response; planners may wrap it
 *  in quotes or add whitespace — strip that, keep the sentence. */
export function parseSparkHint(payload) {
  const msg = payload?.choices?.[0]?.message?.content;
  const text = String(msg ?? "").trim().replace(/^["'`]+|["'`]+$/g, "").trim();
  if (!text) throw new Error(`no prompt in response: ${JSON.stringify(payload).slice(0, 200)}`);
  return text;
}

/** The skill's banned moves (art-generator SKILL.md §4B–§4F): style
 *  words that fight the reference images, camera policing, and negative
 *  laundry lists. A hint that trips these gets flagged in the lab before
 *  a paid mint. */
export const BANNED_HINT_PATTERNS = [
  /\bflat\b/i, /\bvector\b/i, /\boutlines?\b/i, /\bstrokes?\b/i,
  /\bshad(e|ed|ing)\b/i, /\bsolid colou?rs?\b/i, /\bcontrast(y|ing)?\b/i,
  /\bclip ?art\b/i, /\bicon(ic)? style\b/i, /\bminimalist\b/i,
  /\bcentered\b/i, /\bcentred\b/i, /\bsymmetric/i, /\bfront[- ]facing\b/i,
  /\bstraight[- ]on\b/i, /\bperspective\b/i, /\bclose[- ]up\b/i,
  /\bfilling the frame\b/i, /\bfills? the frame\b/i,
  /\bno\s+\w/i, /\bwithout\b/i, /\bdo not\b/i, /\bdon't\b/i,
];

export function lintHint(hint) {
  return BANNED_HINT_PATTERNS.filter((re) => re.test(hint)).map((re) => re.source);
}

/** social_scale "zero" is Jev saying no humans belong — a hint naming a
 *  person, stick figure, or body part fights the spec. */
const HUMAN_WORDS =
  /\b(person|people|man|woman|child|children|boy|girl|kid|baby|adult|figure|stick\s*figure|hand|hands|face|arms?|legs?|feet|foot)\b/i;

export function lintSpecFit(hint, spec = {}) {
  if ((spec.social_scale ?? "solo") !== "zero") return [];
  return HUMAN_WORDS.test(hint) ? ["humans in a zero-human spec"] : [];
}

/** One planner lane → { hint, ms }. `app` names the OpenRouter app row
 *  ("picture-lab" for the lab, "pictures" for the production draw). */
export async function askPlanner({
  lane = "spark", text, description, spec,
  apiKey,
  fetchImpl = globalThis.fetch,
  system, signal, app = "pictures",
} = {}) {
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  const t0 = Date.now();
  const res = await fetchImpl(OPENROUTER_CHAT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      ...appHeaders(app),
    },
    body: JSON.stringify(plannerChatBody({ lane, text, description, spec, system })),
    signal,
  });
  if (!res.ok) {
    throw new Error(`${lane} HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  return { hint: parseSparkHint(await res.json()), ms: Date.now() - t0 };
}
