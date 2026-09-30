/**
 * 030 § 5.3 — the draw recipe, shared between `scripts/art/gen.mjs` and the
 * Worker's /api/v1/pictures/draw path. Pure module: no Node APIs, no fetch —
 * safe in the Worker, in scripts, and in tests. gen.mjs re-exports these
 * names so existing art scripts keep working.
 *
 * STYLE_VERSION keys the draw ledger (picture_index.drawKey): bump the
 * style bundle and every subject mints fresh.
 */
const IRREGULAR_PLURALS = new Set([
  "dice", "teeth", "children", "people", "feet", "mice", "geese",
  "men", "women", "scissors", "glasses", "pants", "shorts", "clothes",
]);

const NON_PLURALS_ENDING_IN_S = new Set([
  "yes", "this", "his", "us", "gas", "bus", "plus", "always",
  "sometimes", "perhaps", "pajamas", "pyjamas", "sunglasses", "sandals",
]);

export function isPluralWord(word) {
  const w = String(word ?? "").trim().toLowerCase();
  if (!w) return false;
  if (IRREGULAR_PLURALS.has(w)) return true;
  if (NON_PLURALS_ENDING_IN_S.has(w)) return false;
  if (!w.endsWith("s")) return false;
  if (w.endsWith("ss") || w.endsWith("us") || w.endsWith("is") || w.endsWith("ics")) return false;
  return true;
}

export const VALID_FRAMINGS = new Set(["face", "bust", "full", "diagram", "object", "contrast"]);
export const VALID_SOCIAL_SCALES = new Set(["zero", "solo", "pair", "group"]);

export const VALID_ENTITY_MODES = new Set([
  "concept_action",
  "organic_noun",
  "category_packshot",
  "cpg_brand",
  "anatomy_relational",
]);

export const VALID_PACKAGING = new Set([
  "pouch",
  "jar",
  "can",
  "box",
  "bottle",
  "tub",
  "bar",
  "carton",
  "bag",
  "none",
]);

export const VALID_HAND_MODES = new Set([
  "resting_ball",
  "pointing_mitten",
  "asl_v",
  "grip_mitten",
  "pincer_grasp",
  "open_palm_up",
  "press_down",
  "asl_head",
  "asl_body",
  "touch_cheeks",
]);

export function formatHandMode(mode) {
  switch (mode) {
    case "resting_ball":
      return "The stick figure's hands are simple featureless circles with no fingers.";
    case "pointing_mitten":
      return "One hand is in a pointing mitten pose with a single extended pointer finger.";
    case "asl_v":
      return "One hand has two extended fingers in a clear V shape (ASL V sign) pointing toward the eyes.";
    case "grip_mitten":
      return "The hands are mitten-shaped grips holding the object.";
    case "pincer_grasp":
      return "The hand shows a pincer grasp with thumb and index finger touching.";
    case "open_palm_up":
      return "Both hands are open cupped palms facing upward to receive.";
    case "press_down":
      return "The hand has an open flat palm pressing downward.";
    case "asl_head":
      return "One open flat hand is placed against the side of the head and temple in the ASL head gesture.";
    case "asl_body":
      return "Both open flat hands are resting against the chest and torso in the ASL body gesture.";
    case "touch_cheeks":
      return "Both open hands are cupping the cheeks to frame the face.";
    default:
      return null;
  }
}

/**
 * Builds the canonical Pip AAC icon prompt.
 *
 * 1. Teaching framing
 * 2. Locked style clause
 * 3. No text constraint
 * 4. Plural rule (if applicable)
 * 5. Framing lens clause (face, bust, full, diagram, object, contrast) based on social scale
 * 6. Fitzgerald torso rule (for stick figures with torso visible)
 * 7. Hand mode clause (for stick figures with hands visible)
 * 8. Scene hint (for abstract/preposition concepts)
 */
export function buildPrompt({
  word,
  torso = null,
  hint = null,
  framing = null,
  hand = null,
  social_scale = null,
  entity_mode = null,
  packaging = null,
  brand = null,
}) {
  if (entity_mode === "category_packshot") {
    const pack = packaging && packaging !== "none" ? packaging : "package";
    const subject = `a ${word} ${pack}`;
    const graphicClause = hint ? hint : `with a clean ${word} illustration on the front`;
    return [
      `A product photo of ${subject}, isolated on a plain white background, the product centred in frame, product photography as used on a supermarket website, no price stickers, no promotional text, no award badges, no dietary or health claims, no certification or callout badges, no text of any kind on the packaging, no letters, no words, ${graphicClause}.`,
    ].join("\n");
  }

  if (entity_mode === "cpg_brand") {
    const brandPrefix = brand ? `${brand} ` : "";
    const packSuffix = packaging && packaging !== "none" ? ` ${packaging}` : "";
    const subject = `${brandPrefix}${word}${packSuffix}`;
    const hintClause = hint ? `, ${hint}` : "";
    return [
      `A product photo of ${subject}, isolated on a plain white background, the product centred in frame, product photography as used on a supermarket website, faithful reproduction of authentic product packaging, brand logo, and typography, no price stickers, no promotional text${hintClause}.`,
    ].join("\n");
  }

  if (entity_mode === "anatomy_relational") {
    const hintClause = hint ? hint : `A simplified human body context with a bold clean black arrow pointing directly to the ${word}.`;
    return [
      `We are creating an image to teach the concept of: ${word}.`,
      "Draw it in exactly the same style as the reference images on a pure white background.",
      "Do not include any text in the image.",
      hintClause,
    ].join("\n");
  }

  const lines = [
    `We are creating an image to teach the concept of: ${word}.`,
    "Draw it in exactly the same style as the reference images on a pure white background.",
    "Do not include any text in the image.",
  ];

  if (isPluralWord(word)) {
    lines.push("Show more than one.");
  }

  if (framing === "contrast") {
    // Target filled, reference ghosted: the fill does the pointing, so no arrow.
    if (!torso) throw new Error("contrast framing needs --torso <target colour>");
    lines.push(
      `Two of the same thing side by side. Only the one this word is about is filled solid ${torso}; the other has the same black outline and a pale light grey fill. No arrows.`,
    );
  } else if (social_scale === "pair") {
    if (framing === "bust") {
      lines.push("Close-up shot of two stick figures from the chest up. Upper bodies and hands only, no legs.");
    } else if (framing === "full") {
      lines.push("Two full body stick figures side-by-side.");
    }
  } else if (social_scale === "group") {
    if (framing === "bust") {
      lines.push("Close-up shot of three stick figures from the chest up. Upper bodies and hands only, no legs.");
    } else if (framing === "full") {
      lines.push("Three full body stick figures standing together.");
    }
  } else if (social_scale === "zero") {
    if (framing === "diagram") {
      lines.push("A clean graphic diagram with no human figures.");
    } else if (framing !== "object") {
      lines.push("No human figures in the image.");
    }
  } else {
    if (framing === "face") {
      lines.push("Close-up shot of a stick figure face filling the frame. Head only, no body, no legs.");
    } else if (framing === "bust") {
      lines.push("Close-up shot of the stick figure from the chest up. Upper body and hands only, no legs.");
    } else if (framing === "full") {
      lines.push("Full body stick figure with complete posture and legs.");
    } else if (framing === "diagram") {
      lines.push("A clean graphic diagram with no human figures.");
    }
  }

  if (torso && social_scale !== "zero" && framing !== "face" && framing !== "diagram" && framing !== "object" && framing !== "contrast") {
    if (social_scale === "pair" || social_scale === "group") {
      if (!hint) {
        lines.push(`The primary stick figure's torso is solid ${torso}.`);
      }
    } else {
      lines.push(`The stick figure's torso is solid ${torso}.`);
    }
  }

  if (hand && social_scale !== "zero" && framing !== "face" && framing !== "diagram" && framing !== "object" && framing !== "contrast") {
    const handClause = formatHandMode(hand);
    if (handClause) lines.push(handClause);
  }

  if (hint) {
    lines.push(hint);
  }

  return lines.join("\n");
}

/* ------------------------- Jev draw classification ------------------------ */

/** The § 5.3 framing spec — entity mode, framing lens, hand, social scale,
 *  packaging, anchor — asked inside the same classify call as scope/kind/
 *  language (one Jev round-trip per draw). */
export const DRAW_JEV_QUESTIONS = {
  entity_mode: {
    type: "choice",
    instructions: "What visual modality should be used to illustrate this word/concept?",
    criteria: {
      concept_action: "Stick figure, person, action, macro body posture (body, head, face), emotion, gesture, or abstract relation (e.g. run, eat, happy, big, under)",
      organic_noun: "Standalone organic noun, animal, natural fresh food, hand tool, or standalone iconic organ (e.g. apple, dog, pizza, bread, eye, ear, mouth, hand, foot)",
      anatomy_relational: "Relational or dependent body part requiring a context silhouette and a directional pointer arrow (e.g. hair, neck, tummy, back, elbow, knee, toes, finger)",
      category_packshot: "Generic commodity food, pantry item, or product that only exists in packaging or is formless/messy without it (e.g. peanut butter, fruit snack, yogurt tub, jam, mayonnaise, cereal)",
      cpg_brand: "Specific commercial branded consumer packaged good (e.g. 7 Up, Frosted Flakes, Oreo, Cheerios, Coca-Cola)",
    },
  },
  packaging: {
    type: "choice",
    instructions: "If this is a packaged item, what is the canonical packaging container?",
    criteria: {
      pouch: "Flexible foil or plastic snack pouch/packet (e.g. fruit snack, gummy pouch)",
      jar: "Glass or plastic jar with screw lid (e.g. peanut butter, jam, mayonnaise)",
      can: "Metal beverage can or food tin (e.g. soda, soup, tuna)",
      box: "Cardboard cereal or snack box (e.g. cereal, crackers)",
      bottle: "Glass or plastic bottle with cap (e.g. ketchup, syrup, salad dressing)",
      tub: "Plastic tub with peel lid (e.g. yogurt, butter spread)",
      bar: "Wrapped candy or energy bar",
      none: "Not a packaged item",
    },
  },
  framing: {
    type: "choice",
    instructions: "Best visual framing lens for this AAC word. face/bust/full/contrast show people — only pick one if the scene contains a person.",
    criteria: {
      face: "Extreme close-up of facial expression only (emotions, feelings)",
      bust: "Upper chest, head, hands (fine motor, manual action, chest gestures — e.g. a person cooking, waving, eating)",
      full: "Full body stick figure with complete legs (locomotion, posture, walking)",
      diagram: "Graphic spatial diagram with box and arrow, no humans (prepositions)",
      object: "Standalone inanimate object or universal sign (nouns, stop sign)",
      contrast: "Two of the same thing, the target filled in colour and the reference pale grey (size, amount, near/far: big, little, more, some, all, this, that)",
    },
  },
  hand_mode: {
    type: "choice",
    instructions: "Optimal hand depiction for this action",
    criteria: {
      resting_ball: "Featureless smooth circle (passive, swinging, no fine fingers)",
      pointing_mitten: "Fist with single extended pointer finger (pointing, deictic)",
      grip_mitten: "Thumb and curled fingers grasping a physical prop",
      pincer_grasp: "Thumb and index finger touching to hold tiny item",
      open_palm_up: "Two open cupped palms facing upward to receive/beg/plead",
      press_down: "Flat palm or finger pressing downward onto a surface/button",
      asl_head: "One open flat hand touching the temple or side of the head (ASL head sign)",
      asl_body: "Both open flat hands resting flat against the chest or torso (ASL body sign)",
      touch_cheeks: "Both open hands cupping the cheeks to frame the face",
    },
  },
  proloquo_anchor: {
    type: "choice",
    instructions: "What physical anchor or visual crutch is needed to prevent semantic ambiguity?",
    criteria: {
      directional_arrow: "A bold directional arrow indicating movement direction (e.g. green arrival arrow for come, forward arrow for go)",
      action_button: "A large round pushbutton or checkmark switch being pressed (for abstract actions like do)",
      interlocking_blocks: "Two distinct toy blocks snapping together with mating studs (for make/build)",
      shelf_retrieval: "Reaching up to take an object off a shelf or surface with retrieval arrow (for get/take)",
      receiving_palms: "Open cupped palms held outward to receive an item (for need/want)",
      none: "No extra physical anchor needed; human posture or face is sufficient",
    },
  },
  imagery: {
    type: "choice",
    instructions: "Does this concept's picture name itself, or does it need an invented visual stand-in?",
    criteria: {
      literal: "The subject can be drawn exactly as it is — a concrete object, a self-evident action, or a state/quality visible on a thing (dog, train, running, a wet shirt, dirty laundry)",
      metaphor: "The concept has no canonical physical form — an abstract adjective, amount, relation, or idea that needs a chosen visual metaphor (easy, more, same, different, finished, enough, almost)",
    },
  },
  social_scale: {
    type: "choice",
    instructions: "How many human actors does this AAC concept need? A person is the LAST resort for states and qualities — but a human-performed ACTION always shows its actor: cooking, falling, waving and eating are done BY someone. If you chose a person framing (face/bust/full/contrast), the answer cannot be zero.",
    criteria: {
      zero: "No humans — diagrams, inanimate objects, universal signs (stop, in, on, off), and any state, texture, or quality that reads on a thing or scene alone (wet, dirty, hot, cold, empty, broken, new). Never zero for an action a person performs.",
      solo: "Exactly 1 person — human-performed actions (run, eat, cook, sit, fall), emotions and facial expressions (happy, sad), self-reference (I, me)",
      pair: "Exactly 2 people — only for 1-on-1 social transactions, hand-offs, or partner references (you, give, help)",
      group: "3 or more people — only for collective concepts and plural pronouns (we, they, all)",
    },
  },
};

/** Jev answer object → the buildPrompt inputs (defaults = gen.mjs's).
 *  Jev answers each question independently, so contradictory pairs can
 *  ship — e.g. "cooking" once returned framing:bust + social_scale:zero,
 *  a person-shot of zero people. The framing lens is the authority on
 *  whether a human is in frame (it describes what the camera sees):
 *  a person framing implies ≥1 person, an object/diagram lens implies
 *  none. Reconcile here so downstream code never sees the impossible
 *  pair. */
export function parseDrawSpec(answers = {}) {
  const spec = {
    entity_mode: answers?.entity_mode?.choice ?? "concept_action",
    packaging: answers?.packaging?.choice ?? "none",
    framing: answers?.framing?.choice ?? "full",
    hand_mode: answers?.hand_mode?.choice ?? "resting_ball",
    anchor: answers?.proloquo_anchor?.choice ?? "none",
    social_scale: answers?.social_scale?.choice ?? "solo",
    imagery: answers?.imagery?.choice ?? "metaphor",
  };
  if (spec.framing === "face" || spec.framing === "bust" || spec.framing === "full") {
    if (spec.social_scale === "zero") spec.social_scale = "solo";
  } else if (spec.framing === "object" || spec.framing === "diagram") {
    spec.social_scale = "zero";
  }
  return spec;
}

/** Jev's imagery verdict → which planner lane writes the hint.
 *  literal = the subject draws itself (fast lane); metaphor = the
 *  concept needs an invented visual stand-in (reasoning lane). Absent
 *  or unexpected answers route to the reasoning lane — a slow hint
 *  beats a shallow one. */
export function plannerLane(spec = {}) {
  return spec.imagery === "literal" ? "gptoss" : "spark";
}

/* --------------------------- vendor call shape ---------------------------- */

export const MUSE_MODEL = "meta/muse-image";
export const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/images";
export const OPENROUTER_APP_HOST = "artgen.pipaac.local";
export const OPENROUTER_APP_TITLE = "PipAAC art gen";

/**
 * OpenRouter app attribution (openrouter.ai/docs/app-attribution): the App
 * column in activity logs is keyed on HTTP-Referer, and apps group by origin —
 * so a per-lane subdomain gives each batch lane its own App row instead of
 * "Unknown". The host is an identifier only; it never receives traffic.
 */
export function appHeaders(lane = null) {
  const slug = lane ? String(lane).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") : "";
  const host = slug ? `${slug}.${OPENROUTER_APP_HOST}` : OPENROUTER_APP_HOST;
  return {
    "HTTP-Referer": `https://${host}`,
    "X-OpenRouter-Title": slug ? `${OPENROUTER_APP_TITLE} · ${slug}` : OPENROUTER_APP_TITLE,
    "X-OpenRouter-Categories": "image-gen",
    "X-OpenRouter-App-Visibility": "hidden",
  };
}

/** Ref-bundle rule, keyed on WHO is in the picture: packaged products
 *  draw without refs; any spec with humans (concept_action/anatomy with
 *  a non-zero social scale) gets the pip-v1 bundle — it holds the stick
 *  persona — and diagram framings get it too (the diagram ref lives
 *  there). Only genuine no-human subjects get the object bundle. Routing
 *  on framing alone sent the pencil/bread/dog refs to human scenes, which
 *  is how a "wet" draw produced a dog. null → no input_references. */
export function styleRefBundle(spec = {}) {
  if (spec.entity_mode === "category_packshot" || spec.entity_mode === "cpg_brand") return null;
  const humans = (spec.social_scale ?? "solo") !== "zero";
  if (spec.entity_mode === "anatomy_relational") return "pip-v1";
  if (spec.entity_mode === "concept_action") {
    return humans || spec.framing === "diagram" ? "pip-v1" : "object-v1";
  }
  return spec.framing === "object" || spec.entity_mode === "organic_noun"
    ? "object-v1" : "pip-v1";
}
