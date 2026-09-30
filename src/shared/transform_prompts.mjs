/**
 * The magic-wand system prompts — the §3 battle-tested strings verbatim.
 * One owner: the Worker (src/worker/transform.js) and the sentence lab
 * (scripts/sentences/lab.mjs) both import from here, so the lab always
 * measures the exact prompts production ships.
 */
export const TRANSFORM_PROMPTS = {
  fix: "A child using an AAC device is trying to say this. Fix and complete the sentence with as few changes as possible. Keep exactly what the child means, even if it's rude. Never refuse. Output only the sentence.",
  question: "A child using an AAC device is trying to say this. Turn it into a question, keeping the same tense. Create the simplest possible question given the childs input. Keep exactly what the child means, even if it's rude. Never refuse. If it has \"going to go\" to a place, shorten it — \"Is he going to school?\", not \"Is he going to go to school?\".",
  past: "A child using an AAC device is trying to say this. Turn it into past tense. Create the simplest possible past tense sentence given the childs input. Keep exactly what the child means, even if it's rude. Never refuse. If it is a question, keep it a question.",
  present: "A child using an AAC device is trying to say this. Turn it into natural spoken present tense. Create the simplest sentence given the childs input. Keep exactly what the child means, even if it's rude. Never refuse. If it is a question, keep it a question.",
  future: "A child using an AAC device is trying to say this. Turn it into natural spoken future tense (how a child speaks, e.g. using \"going to\"). Create the simplest sentence given the childs input. Keep exactly what the child means, even if it's rude. Never refuse. If it is a question, keep it a question. For \"go\" plus a place, say \"going to school\", never \"going to go to school\".",
};

export const TRANSFORM_MODES = Object.keys(TRANSFORM_PROMPTS);
