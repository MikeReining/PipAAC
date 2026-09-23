#!/usr/bin/env node
/**
 * gen_childlike.mjs — generate steered child-directed synthetic dialogues.
 *
 * Why: the opening book (017 step 23) needs child-register text. The legal
 * sources are thin here, so we author our own: the frame inventory below is
 * hand-written to match the *shape* of real child speech (single words and
 * short requests at the youngest stage; questions and narratives later)
 * from aggregate research patterns — no transcript text or counts are used.
 * Slot fillers come from our own vocabulary (data/launch_lexicon.json),
 * weighted toward early-acquired words via data/reference/aoa.csv.
 *
 * Output: data/prediction/sources/childlike_en.jsonl — one dialogue per line:
 *   {"band":"toddler","turns":[{"s":"a","t":"..."},{"s":"c","t":"..."}]}
 * Deterministic: same seed -> byte-identical file.
 *
 * Usage: node scripts/prediction/book/gen_childlike.mjs [--seed 7] [--n 6000]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = resolve(ROOT, "data/prediction/sources/childlike_en.jsonl");
const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, v) => [a.replace(/^--/, ""), v[i + 1]]),
);
const SEED = Number(args.seed ?? 7);
const N_PER_BAND = Number(args.n ?? 6000);

// ---------- deterministic rng ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const wpick = (items) => {
  // items: [value, weight][]
  let z = 0;
  for (const [, w] of items) z += w;
  let r = rng() * z;
  for (const [v, w] of items) { r -= w; if (r <= 0) return v; }
  return items[items.length - 1][0];
};

// ---------- vocabulary pools ----------
const lex = JSON.parse(readFileSync(resolve(ROOT, "data/launch_lexicon.json"), "utf8")).entries;
const aoa = {};
for (const line of readFileSync(resolve(ROOT, "data/reference/aoa.csv"), "utf8").trim().split("\n").slice(1)) {
  const i = line.lastIndexOf(",");
  aoa[line.slice(0, i)] = Number(line.slice(i + 1));
}
const all = lex.map((e) => e.spokenText.toLowerCase());
const byCat = {};
for (const e of lex) (byCat[e.category ?? "none"] ??= []).push(e.spokenText.toLowerCase());
const has = (w) => all.includes(w);
const only = (cat, list) => list.filter((w) => byCat[cat]?.includes(w));

const DRINKS = only("Food & Drink", ["water", "milk", "juice", "apple juice", "chocolate milk", "tea", "smoothie"]);
const FOODS = byCat["Food & Drink"].filter((w) => !DRINKS.includes(w));
const SNACKS = FOODS.filter((w) => /snack|cracker|cookie|cereal|toast|cheese|fruit|chip|pretzel|popcorn/.test(w));
const COLORS = only("Descriptors, Adjectives & Opposites",
  ["red", "blue", "green", "yellow", "orange", "purple", "pink", "black", "white", "brown", "gray", "grey"]);
const DESCS = byCat["Descriptors, Adjectives & Opposites"].filter((w) => !COLORS.includes(w));
const BODY = only("Body, Health & Hygiene",
  ["head", "face", "hair", "eye", "ear", "nose", "mouth", "teeth", "tongue", "hand", "finger",
   "arm", "leg", "foot", "toe", "stomach", "back", "knee", "elbow", "tummy"]);
const PEOPLE = only("People, Family & Roles",
  ["mom", "dad", "mama", "dada", "baby", "brother", "sister", "grandma", "grandpa",
   "friend", "teacher", "boy", "girl"]);
const KIN = only("People, Family & Roles", ["mom", "dad", "mama", "dada", "grandma", "grandpa", "baby"]);
const ACTIONS = byCat["Daily Actions & Activity Verbs"].filter((w) => !w.includes(" "));
const TIMES = byCat["Time, Calendar & Sequencing"];
const ANIMAL_SOUNDS = { dog: "woof woof", cat: "meow", cow: "moo", duck: "quack quack",
  sheep: "baa", horse: "neigh", pig: "oink", lion: "roar", bird: "tweet tweet",
  frog: "ribbit", bee: "buzz", snake: "hiss", chicken: "cluck cluck" };

// Early-acquired words are more likely fillers: rank pool by AoA, weight by decay.
function pool(words) {
  const sorted = [...words].sort((a, b) => (aoa[a.split(" ")[0]] ?? 12) - (aoa[b.split(" ")[0]] ?? 12));
  return sorted.map((w, i) => [w, 1 / (i + 4)]);
}
const P = {
  food: pool(FOODS), snack: pool(SNACKS.length ? SNACKS : FOODS), drink: pool(DRINKS),
  animal: pool(byCat["Animals & Nature"]), toy: pool(byCat["Toys, Play, Media & Leisure"]),
  thing: pool(byCat["Home, Household Objects & Daily Tools"]), cloth: pool(byCat["Clothing & Accessories"]),
  body: pool(BODY.length ? BODY : byCat["Body, Health & Hygiene"]), person: pool(PEOPLE), kin: pool(KIN),
  place: pool(byCat["Places, Rooms & Community"]), vehicle: pool(byCat["Vehicles & Transportation"]),
  color: pool(COLORS), desc: pool(DESCS), feel: pool(byCat["Feelings, Emotions & Sensory States"]),
  action: pool(ACTIONS), num: pool(byCat["Numbers & Counting"]), time: pool(TIMES),
};
// flat common pools for single-word utterances
const ONEWORD = pool([
  ...byCat["Animals & Nature"].slice(0, 14), ...byCat["Toys, Play, Media & Leisure"].slice(0, 12),
  ...FOODS.slice(0, 14), ...DRINKS, ...byCat["Vehicles & Transportation"].slice(0, 8),
  ...byCat["Home, Household Objects & Daily Tools"].slice(0, 12),
  ...byCat["Clothing & Accessories"].slice(0, 8), ...KIN, "ball", "book",
]);

// ---------- shared pragmatic utterances ----------
const CHILD_SHORT = [
  ["yeah", 9], ["yes", 4], ["no", 9], ["okay", 5], ["uh huh", 2], ["mhm", 2], ["oh", 3],
  ["wow", 2], ["yay", 2], ["whee", 1.5], ["oops", 2], ["uh oh", 3], ["oh no", 3], ["oh dear", 1],
  ["hi", 2], ["hello", 1.5], ["bye", 2], ["bye bye", 1.5], ["good night", 1], ["night night", 1.5],
  ["please", 3], ["thank you", 2], ["sorry", 1.5], ["excuse me", 0.7], ["you're welcome", 0.5],
  ["again", 3], ["more", 4], ["mine", 3], ["my turn", 2], ["your turn", 1],
  ["why", 2.5], ["what", 2.5], ["where", 2], ["who", 1], ["how", 0.6],
  ["here", 2.5], ["there", 3], ["look", 3], ["see", 2], ["watch", 1.5], ["listen", 0.6],
  ["help", 3], ["stop", 2], ["wait", 2], ["go", 2], ["come on", 1], ["hurry", 0.8],
  ["ouch", 1.5], ["ow", 1.5], ["all done", 3], ["all gone", 2], ["no more", 2],
  ["i don't know", 3], ["me", 1.5], ["me too", 1.5], ["i do", 1], ["i did", 1],
  ["one", 1.5], ["two", 1.5], ["one two three", 1], ["ready set go", 0.8],
  ["sure", 0.8], ["maybe", 0.8], ["nothing", 1], ["i know", 1.5], ["like that", 1.2],
  ["like this", 1.2], ["right there", 1], ["over there", 1], ["in there", 1.5], ["on there", 1],
  ["that one", 2.5], ["this one", 2], ["the end", 0.7], ["hmm", 1], ["shh", 0.5],
];

// ---------- child frames per band ----------
// {slot} fillers: food snack drink animal toy thing cloth body person kin
// place vehicle color desc feel action num time offer(echo)
const CHILD = {
  toddler: [
    // single words & naming — the dominant shape at this stage
    ["{oneword}", 22], ["{person}", 5], ["{color}", 2.5], ["{num}", 1.5],
    // requests / regulation
    ["more {food}", 4], ["more {drink}", 3], ["more {snack}", 3], ["{food} please", 3],
    ["{drink} please", 2.5], ["want {food}", 3], ["want {drink}", 2.5], ["want {toy}", 2.5],
    ["want more", 2], ["i want {food}", 2], ["i want {toy}", 1.5], ["want that", 1.5],
    ["no {food}", 2], ["no more {food}", 1.5], ["no {action}", 1.5], ["no {thing}", 1],
    ["my {toy}", 2.5], ["my {thing}", 2], ["my {food}", 1.5], ["mine {toy}", 1],
    // deictic / pointing
    ["that {animal}", 3], ["that {toy}", 2], ["that {thing}", 2], ["this {toy}", 1.5],
    ["that one", 3], ["this one", 2.5], ["{color} one", 1.5], ["big one", 1], ["little one", 0.8],
    ["a {animal}", 2], ["a {thing}", 1.5], ["the {toy}", 1.5],
    // locations / states
    ["{thing} gone", 2], ["{food} all gone", 2], ["all gone {drink}", 1.5], ["{animal} gone", 1],
    ["{toy} down", 1.5], ["fall down", 2], ["{thing} fell", 1], ["{food} down", 1],
    ["up", 2.5], ["up please", 2], ["down", 2], ["out", 2], ["in", 1.5], ["off", 2], ["on", 1.5],
    ["in there", 2], ["on there", 1.5], ["in the {place}", 1.5], ["on the {thing}", 1],
    ["{thing} stuck", 1.5], ["it's stuck", 1.5], ["stuck", 1.5],
    // actions / self-action
    ["open", 2.5], ["open {thing}", 1.5], ["open it", 1.5], ["close it", 1],
    ["{action}", 3], ["{action} again", 1.5], ["do it", 1.5], ["me do it", 1.5], ["i do it", 1],
    ["go {place}", 1.5], ["go outside", 1.5], ["go home", 1], ["go bye bye", 1],
    ["{animal} {action}", 1.5], ["{person} {action}", 1],
    // questions (early forms)
    ["what's that", 4], ["what's this", 3], ["what that", 1.5], ["who's that", 1.5],
    ["where {thing}", 2], ["where's {toy}", 1.5], ["where {person}", 1.5], ["where's {person}", 1.5],
    ["where'd it go", 1], ["what's that {animal}", 1],
    // descriptors / comments
    ["big {animal}", 1.5], ["little {animal}", 1], ["{color} {thing}", 1.5],
    ["hot", 1.5], ["too hot", 1], ["cold", 1], ["yucky", 1.5], ["yummy", 1.5],
    ["wet", 1.2], ["dirty", 1], ["messy", 1], ["loud", 1], ["dark", 0.8], ["stinky", 0.8],
    ["{thing} hot", 1], ["{food} hot", 1], ["nice {animal}", 0.8], ["bad {animal}", 0.8],
    ["{desc} {thing}", 1.5], ["{desc}", 1.5],
    // social / routines
    ["hi {person}", 1.5], ["bye {person}", 1.5], ["bye bye {animal}", 1],
    ["night night", 1.5], ["night night {person}", 1], ["good night {person}", 0.8],
    ["help me", 2], ["help please", 1.5], ["{person} help", 1],
    ["two {toy}", 1], ["more {toy}", 2], ["another one", 1.5], ["other one", 1],
    ["no night night", 1], ["no bed", 1], ["no bath", 1],
    ["{food} yummy", 1], ["my {cloth}", 1], ["{cloth} off", 1], ["{cloth} on", 0.8],
    ["boo", 0.6], ["peekaboo", 0.8], ["ah {animal}", 1],
  ],
  preschool: [
    // core request frames — "i want X" is the workhorse
    ["i want {food}", 5], ["i want {drink}", 3], ["i want {toy}", 4], ["i want {thing}", 2.5],
    ["i want to {action}", 3], ["i want to go {place}", 2], ["i want more {food}", 2],
    ["i want that", 2], ["i want that one", 1.5], ["i want it", 1.5], ["i want my {toy}", 1.5],
    ["i don't want {food}", 2.5], ["i don't want to {action}", 2], ["i don't want it", 1.5],
    ["don't want to go", 1.5], ["i don't like {food}", 1.5], ["i don't like it", 1.5],
    ["can i have {food}", 3.5], ["can i have some {food}", 2.5], ["can i have a {toy}", 2],
    ["can i {action}", 2.5], ["can we {action}", 2], ["can we go {place}", 1.5],
    ["can you {action}", 2], ["can you get it", 1.5], ["can you open it", 1.5],
    ["may i have {food}", 1], ["can i get {drink}", 1.5],
    // inability / negation
    ["i can't {action}", 3], ["i can't reach", 1.5], ["can't do it", 2], ["i can't do it", 2],
    ["it won't {action}", 1], ["it doesn't {action}", 1], ["don't {action}", 1.5],
    // declarations / ongoing
    ["i'm gonna {action}", 2.5], ["i'm going to {place}", 2], ["we're going to {place}", 1.5],
    ["i'm {action}ing", 1.5], ["i did it", 3], ["i did {action}", 1.5], ["i made it", 1.5],
    ["look what i did", 1.5], ["i have to {action}", 2], ["i hafta go", 1], ["i need to {action}", 2],
    ["i have a {thing}", 1.5], ["i've got {thing}", 1], ["i got {toy}", 1],
    ["i need {thing}", 2], ["i need help", 2], ["i need {drink}", 1.5], ["need {drink}", 1.5],
    // questions
    ["where is {thing}", 3], ["where's my {toy}", 2.5], ["where's {person}", 2],
    ["where did {thing} go", 1.5], ["where are you", 1.5], ["where are we going", 1.5],
    ["who's that", 2.5], ["who is it", 1.5], ["what is it", 2.5], ["what is that", 2.5],
    ["what's this", 2], ["what's that", 3], ["what are you doing", 2.5], ["what happened", 1.5],
    ["what's that {thing}", 1.5], ["what is this {thing}", 1], ["who is that {person}", 0.8],
    ["is it {desc}", 2], ["is it mine", 1.5], ["is it {time}", 1], ["is it hot", 1],
    ["is it ready", 1], ["what time is it", 1], ["how many", 1], ["which one", 1.5],
    ["do you like it", 1.5], ["do you see it", 1], ["did you see it", 1], ["are you {feel}", 1.2],
    ["why not", 2], ["why can't i {action}", 1.5], ["but why", 1.5], ["how come", 1.2],
    // comments / descriptions
    ["it's {desc}", 3], ["it is {desc}", 2], ["that's {desc}", 2.5], ["that's mine", 2.5],
    ["that's not mine", 1.5], ["that's my {thing}", 2], ["it's mine", 2], ["it's not mine", 1],
    ["it's too {desc}", 1.5], ["it's broken", 1.5], ["it's stuck", 1.5], ["not working", 1],
    ["it's raining", 0.8], ["it's dark", 1], ["too loud", 1], ["it's loud", 1],
    ["he {action}s", 1.5], ["she is {desc}", 1], ["he did it", 1], ["the {animal} is {desc}", 1.5],
    ["my {thing}", 2], ["your {thing}", 1.5], ["his {thing}", 1], ["her {thing}", 1],
    ["my {body} hurts", 1.5], ["my tummy hurts", 1.2], ["i hurt my {body}", 1],
    ["i'm {feel}", 2], ["i'm hungry", 2.5], ["i'm thirsty", 2], ["i'm tired", 2],
    ["i'm not tired", 1], ["i'm not sleepy", 1], ["i'm scared", 1.2], ["i'm bored", 1],
    // directives / play
    ["look at that {animal}", 2], ["look at me", 2], ["look at this", 2], ["i see {animal}", 1.5],
    ["i see a {animal}", 1.5], ["watch me", 2.5], ["watch this", 2], ["you watch", 1],
    ["you do it", 2], ["do it myself", 2], ["me do it", 1.5], ["i do it myself", 1.5],
    ["let me {action}", 2], ["let me see", 2], ["let me try", 1.5], ["let me go", 1],
    ["give me {thing}", 2], ["give me that", 2], ["give me a {toy}", 1.5], ["give it back", 1.5],
    ["get it", 1.5], ["get down", 1.5], ["pick it up", 1.5], ["put it down", 1.5],
    ["put it back", 1.5], ["put it {place}", 1], ["take it off", 1], ["turn it on", 1],
    ["come here", 1.5], ["come back", 1], ["wait for me", 1.5], ["hold on", 1.5],
    ["stop it", 1.5], ["don't do that", 1.5], ["don't touch", 1.5], ["leave it", 1],
    ["play with me", 2], ["play with me please", 1], ["let's {action}", 2], ["let's go {place}", 1.5],
    ["read it", 1.5], ["read me a book", 1], ["read this one", 1], ["sing it", 1], ["tell me", 1],
    // quantities / choices
    ["one more {food}", 2], ["two more", 1.5], ["some more {food}", 2], ["more {drink}", 2],
    ["another {toy}", 1.5], ["another one", 2], ["the {color} one", 1.5], ["a big one", 1],
    ["that one please", 1.5], ["this one", 2], ["both", 0.8], ["a little bit", 1],
    ["a lot", 1], ["some {food}", 1.5], ["no more {thing}", 1.5],
    // connectors / early complex
    ["because i {action}", 1.5], ["because it's {desc}", 1.2], ["and {thing}", 1.5],
    ["and this", 1.2], ["and a {toy}", 1], ["me too", 1.5], ["me first", 1],
    ["first {action}", 1], ["then {place}", 0.8], ["not yet", 1.5], ["not now", 1.5],
    ["later", 1.5], ["tomorrow", 1], ["right now", 1], ["it's my turn", 2], ["your turn", 1.5],
    // locations
    ["right there", 1.5], ["over there", 1.5], ["in here", 1], ["out there", 1],
    ["on the {thing}", 1.5], ["under the {thing}", 1], ["behind the {thing}", 1],
    ["in the {place}", 1.5], ["in my {place}", 1], ["up there", 1], ["down there", 1],
    // social / politeness
    ["yes please", 1.5], ["no thank you", 1.5], ["thank you {person}", 1],
    ["hi {person}", 1.5], ["bye {person}", 1], ["good job", 1], ["good boy", 0.8],
    ["be careful", 1], ["watch out", 1.2], ["it's hot", 1.5],
  ],
  older: [
    // full questions
    ["what are you doing", 4], ["what you doing", 2], ["what happened", 2],
    ["why can't i {action}", 2], ["how come {thing}", 1.5], ["how come i can't {action}", 1.5],
    ["do you know {thing}", 1.5], ["do you know what", 1.5], ["you know what", 2], ["know what", 2],
    ["where is it", 2.5], ["where did it go", 2], ["where's my {thing}", 2],
    ["when are we going", 1.5], ["when is {time}", 1], ["are we there yet", 1.5],
    ["can we go to {place}", 2], ["can we go to the {place}", 1.5], ["what time is it", 1.5],
    ["is it {time} yet", 1.5], ["who did that", 1.5], ["what's that sound", 1],
    ["how do you {action}", 1.5], ["what does it say", 1], ["which one is mine", 1.2],
    ["what about {thing}", 1.5], ["how about {food}", 1.5], ["what about me", 1.2],
    ["can i have some {food}", 3], ["can i have another {thing}", 2], ["can i get {drink}", 2],
    ["can i have a {toy}", 2], ["can we {action}", 2], ["can you help me", 2],
    ["did you see the {animal}", 1.5], ["did you {action}", 1.5], ["are you {feel}", 1.5],
    // wants / plans
    ["i want {food}", 3], ["i want to {action}", 3], ["i want to go {place}", 2.5],
    ["i want to go to the {place}", 2], ["i want some more", 2], ["i want that one", 2],
    ["i don't want to {action}", 2], ["i don't want to go {place}", 1.5],
    ["i'm going to {place}", 2.5], ["we're gonna {action}", 2], ["i'm gonna {action}", 2.5],
    ["let's {action}", 2.5], ["let's go to the {place}", 1.5], ["let's play {toy}", 2],
    ["i have to go {place}", 1.5], ["i have to go to the bathroom", 1], ["i need to {action}", 2],
    // past / narrative
    ["i was {action}ing", 2], ["he was {action}ing", 1.5], ["it was {desc}", 2],
    ["that was fun", 2], ["that was mine", 1.5], ["i did it", 3], ["i did that", 2],
    ["i did it myself", 1.5], ["look what i made", 1.5], ["i made a {thing}", 1.5],
    ["the {animal} {action}ed", 1.5], ["the {thing} fell down", 1.5], ["my {thing} broke", 1.5],
    ["remember when we {action}ed", 1.5], ["we went to {place}", 1.5], ["we saw a {animal}", 1.5],
    ["he took my {thing}", 1.5], ["she won't share", 1.2], ["he hit me", 1],
    // opinions / states
    ["i think it's {desc}", 1.5], ["i think so", 1.5], ["i don't think so", 1.5],
    ["maybe it's {desc}", 1], ["it's not {desc}", 2], ["that's not fair", 2],
    ["it's too {desc}", 2], ["it's really {desc}", 1.5], ["that's so {desc}", 1.5],
    ["i like that one", 2], ["i like the {color} one", 1.5], ["it's my favorite", 1.5],
    ["i don't like it", 2], ["it's yucky", 1.5], ["i don't like {food}", 1.5],
    ["it's {desc} in here", 1], ["it's dark", 1.2], ["i'm scared", 1.5], ["it's loud", 1.2],
    ["too loud", 1.2], ["it's noisy", 1], ["i'm hungry", 2.5], ["i'm thirsty", 2],
    ["i'm tired", 2], ["i'm not sleepy", 1.2], ["i'm bored", 1.5], ["my {body} hurts", 1.5],
    ["my tummy hurts", 1.2], ["i bumped my {body}", 1], ["i hurt my {body}", 1],
    // because / clauses
    ["because i want to", 2], ["because it's mine", 1.5], ["because i said", 1],
    ["because it's {desc}", 1.5], ["but i want {food}", 1.5], ["but it's mine", 1.5],
    ["first we {action}", 1.5], ["then we go {place}", 1.2], ["after {time} we {action}", 1],
    ["when {person} gets home", 1.2], ["if i {action}", 1], ["so i can {action}", 1],
    // play / pretend
    ["let's pretend", 2], ["pretend i'm a {animal}", 1.5], ["you be the {animal}", 1.5],
    ["i'm a {animal}", 1.5], ["i'm the {animal}", 1], ["pretend this is {place}", 1],
    ["play with me", 2], ["play with me please", 1.5], ["can we play {toy}", 2],
    ["let's play {toy}", 2], ["i win", 1.5], ["i won", 1.5], ["my turn", 2], ["it's my turn now", 1.5],
    ["your turn", 1.5], ["ready set go", 1], ["on your mark", 0.8], ["catch me", 1],
    ["guess what", 2], ["{person} look", 2], ["{person} watch", 1.5], ["hey {person}", 1.5],
    // social / routines / speech acts
    ["help me", 2], ["help me please", 1.5], ["i need help with this", 1.5],
    ["give it back", 1.5], ["that's mine", 2.5], ["give me my {thing}", 1.5],
    ["tell me a story", 1.5], ["read this one", 1.5], ["the end", 1], ["and that's the end", 1],
    ["almost done", 1.5], ["i'm done", 2], ["all finished", 1.5], ["i'm finished", 1],
    ["look at this", 2], ["look what i got", 1.5], ["come see", 1.5], ["come look", 1.5],
    ["watch out", 1.5], ["be careful", 1.5], ["careful", 1.5], ["it's hot", 1.5],
    ["yes i do", 1.5], ["no i don't", 1.5], ["i do too", 1], ["me neither", 1],
    ["what else", 1.5], ["something else", 1.2], ["nothing", 1.5], ["everything", 0.8],
    ["i don't know", 3], ["i know", 2], ["i know that", 1.5],
    ["it's my turn", 2], ["not yet", 1.5], ["wait a minute", 1.2], ["hold on", 1.5],
    ["one more minute", 1.2], ["five more minutes", 1.2], ["in a minute", 1],
    ["see you later", 1], ["good morning", 1], ["good night", 1.2], ["see you tomorrow", 0.8],
    ["it's time for {time}", 1], ["time for {time}", 1.2], ["is it {time} yet", 1.2],
  ],
};

// Determiner- and verb-phrase-rich frames: real children put articles,
// pronouns, and auxiliaries between the context word and the target noun —
// "i want A cookie", "where's THE ball". These carry the next-word contexts
// the bare-slot frames above miss. Merged into each band below.
const CHILD_DET = {
  toddler: [
    ["a {animal}", 4], ["the {animal}", 3], ["the {toy}", 3], ["a {thing}", 2.5],
    ["the {thing}", 2.5], ["a {food}", 2], ["some {food}", 2], ["my {thing}", 2],
    ["want a {toy}", 2], ["want the {toy}", 1.5], ["i want a {toy}", 1.5],
    ["want a {food}", 1.5], ["get the {thing}", 1], ["see the {animal}", 1],
    ["{action} the {thing}", 1.5], ["{action} it", 1.5], ["{action} me", 1],
    ["{person} {action}", 1.5], ["the {animal} {action}s", 1], ["{animal} go", 1],
    ["on the {thing}", 1.5], ["in my {place}", 1], ["to the {place}", 1],
    ["with {person}", 1], ["for {person}", 1], ["too {desc}", 1.5], ["so {desc}", 1],
    ["not mine", 1.5], ["not {desc}", 1], ["more {toy}", 1.5], ["another {toy}", 1.2],
    ["big {thing}", 1.5], ["little {thing}", 1.2], ["a big {animal}", 1],
    ["{person}!", 2], ["{kin}!", 1.5], ["{animal}!", 1.5], ["{toy}!", 1.5],
    ["{food}!", 1.5], ["{drink}!", 1.2], ["{thing}!", 1.5], ["{vehicle}!", 1.2],
    ["{cloth}!", 1], ["{body}!", 0.8], ["{place}!", 0.8],
  ],
  preschool: [
    ["i want a {toy}", 3], ["i want a {thing}", 2], ["i want a {animal}", 1.5],
    ["i want the {toy}", 2], ["i want the {thing}", 1.5], ["i want a {color} one", 1.5],
    ["i want some {food}", 2.5], ["i want some more", 1.5], ["i want a {drink}", 1.5],
    ["can i have a {toy}", 2.5], ["can i have the {thing}", 1.5], ["can i have a {drink}", 1.5],
    ["can i have some {food}", 2.5], ["where's the {thing}", 2.5], ["where's the {toy}", 2],
    ["where's my {thing}", 2], ["where did the {thing} go", 1.5], ["where's a {thing}", 1],
    ["i see a {animal}", 2.5], ["i see the {animal}", 2], ["look at the {animal}", 2.5],
    ["look at the {thing}", 2], ["look at my {thing}", 1.5], ["it's a {animal}", 2.5],
    ["that's a {animal}", 2.5], ["it's the {thing}", 2], ["that's my {thing}", 2],
    ["it's a {color} {thing}", 1.5], ["he's a {person}", 1], ["she's my {person}", 1],
    ["{action} the {thing}", 2], ["{action} it", 2], ["{action} me", 1.5], ["{action} that", 1],
    ["{action} a {thing}", 1.5], ["{action} my {thing}", 1.5], ["you {action} it", 1.5],
    ["let's {action} it", 1], ["gonna {action} it", 1], ["will {action}", 0.8],
    ["the {animal} is {desc}", 1.5], ["the {thing} is {desc}", 1.5], ["my {thing} is {desc}", 1.5],
    ["{person} is {desc}", 1.2], ["{person} has a {thing}", 1.2], ["{person}'s {thing}", 1.2],
    ["a {animal} can {action}", 1], ["the {animal} {action}s", 1.5], ["{animal}s can {action}", 0.8],
    ["on the {thing}", 2], ["in the {place}", 2], ["to the {place}", 1.5], ["at the {place}", 1.5],
    ["in my {place}", 1.5], ["with {person}", 1.5], ["with my {thing}", 1], ["for {person}", 1.5],
    ["for me", 1.5], ["too {desc}", 2], ["so {desc}", 1.5], ["very {desc}", 1.5],
    ["really {desc}", 1.2], ["not {desc}", 1.5], ["not mine", 1.5], ["not yours", 1],
    ["just a {thing}", 1], ["only one", 1], ["a lot of {food}", 1], ["some {animal}", 1.5],
    ["lots of {animal}", 0.8], ["every {animal}", 0.6], ["a little {thing}", 1],
    ["a big {thing}", 1.5], ["the {color} {thing}", 1.5], ["{num} {animal}", 1.5],
    ["{num} {thing}", 1.5], ["{kin}!", 1.5], ["{person}!", 1.5], ["{animal}!", 1.5],
    ["{toy}!", 1.5], ["{thing}!", 1.5], ["{food}!", 1.5], ["{vehicle}!", 1.2],
  ],
  older: [
    ["i want a {toy}", 2.5], ["i want the {thing}", 2], ["i want a {color} one", 1.5],
    ["i want to go to the {place}", 2], ["i want to {action} the {thing}", 1.5],
    ["i want to {action} it", 1.5], ["can i have a {thing}", 2], ["can i have the {toy}", 2],
    ["can i {action} the {thing}", 1.5], ["can we go to the {place}", 2],
    ["where's the {thing}", 2.5], ["where did the {thing} go", 2], ["where's my {thing}", 2],
    ["what's the {thing}", 1.5], ["what is that {thing}", 1.5], ["who's the {person}", 1],
    ["is that a {animal}", 1.5], ["is this my {thing}", 1.2], ["are those mine", 1],
    ["i see a {animal}", 2], ["i saw a {animal}", 1.5], ["look at the {animal}", 2],
    ["it's a {animal}", 2.5], ["that's a {animal}", 2], ["it's the {thing}", 2],
    ["that's the {thing}", 1.5], ["it's a {color} {thing}", 1.5], ["he's a {person}", 1.2],
    ["{action} the {thing}", 2], ["{action} it", 2.5], ["{action} me", 1.5],
    ["{action} a {thing}", 1.5], ["{action} my {thing}", 1.5], ["{action} that", 1.2],
    ["you {action} it", 1.5], ["i'm {action}ing it", 1.5], ["i'm {action}ing the {thing}", 1.2],
    ["gonna {action} it", 1.5], ["let's {action} it", 1.2], ["i'll {action} it", 1],
    ["the {animal} is {desc}", 1.5], ["the {thing} is {desc}", 1.5], ["my {thing} is {desc}", 1.5],
    ["{person} is {desc}", 1.2], ["{person} has a {thing}", 1.2], ["{person}'s {thing}", 1.2],
    ["the {animal} {action}s", 1.5], ["a {animal} can {action}", 1], ["{person} can {action}", 1],
    ["on the {thing}", 1.5], ["in the {place}", 2], ["to the {place}", 1.5],
    ["at the {place}", 1.5], ["with {person}", 1.5], ["with my {thing}", 1],
    ["for {person}", 1.5], ["for me", 1.5], ["too {desc}", 2], ["so {desc}", 1.5],
    ["very {desc}", 1.5], ["really {desc}", 1.2], ["kind of {desc}", 1], ["not {desc}", 1.5],
    ["just a {thing}", 1], ["a lot of {food}", 1], ["some {animal}", 1.5],
    ["the {color} {thing}", 1.5], ["{num} {animal}", 1.2], ["{num} {thing}", 1.2],
    ["the best {thing}", 1], ["the same {thing}", 0.8], ["a new {toy}", 1.2],
    ["{kin}!", 1.2], ["{person}!", 1.2], ["{animal}!", 1.2], ["{toy}!", 1.2],
  ],
};
for (const b of Object.keys(CHILD_DET)) CHILD[b] = CHILD[b].concat(CHILD_DET[b]);

// ---------- caregiver templates ----------
const ADULT_SHORT = [
  ["yeah", 5], ["yes", 4], ["no", 5], ["okay", 6], ["right", 4], ["mhm", 2], ["hm", 1],
  ["oh", 4], ["oh dear", 1.5], ["oh no", 2], ["uh oh", 2], ["oops", 1.5], ["wow", 2],
  ["that's right", 4], ["that's it", 3], ["good job", 3], ["good girl", 1.5], ["good boy", 1.5],
  ["well done", 1.5], ["very good", 1.5], ["nice", 1.5], ["good", 1.5], ["perfect", 1],
  ["there you go", 2.5], ["there we go", 2], ["here you go", 2], ["here you are", 1.5],
  ["here it is", 1.5], ["there it is", 1.5], ["right there", 1.5], ["over there", 1.5],
  ["all done", 2], ["all gone", 2], ["no more", 1.5], ["one more", 1.5], ["two more", 1],
  ["careful", 2.5], ["be careful", 2], ["gentle", 1.2], ["slow", 1], ["easy", 1],
  ["i see", 2], ["i know", 1.5], ["really", 1.5], ["is it", 1.5], ["it is", 2], ["it is?", 1],
  ["oh look", 1.5], ["look at that", 2], ["look at that {animal}", 1.5],
  ["let's see", 2], ["let's have a look", 1.5], ["go on", 1.5], ["go on then", 1],
  ["come on", 2], ["come on then", 1], ["come here", 2], ["what darling", 0.8],
  ["sorry", 1], ["excuse me", 1], ["bless you", 0.5], ["thank you", 1.5], ["please", 1],
  ["sure", 1], ["maybe", 1], ["later", 1.5], ["not now", 1.5], ["in a minute", 1.5],
  ["one minute", 1], ["two more minutes", 1.5], ["five more minutes", 1], ["hang on", 1.5],
  ["hold on", 1.5], ["wait", 1.5], ["wait a minute", 1], ["just a minute", 1],
  ["that's mine", 1], ["that's yours", 1], ["that's {person}'s", 1],
  ["say please", 1.5], ["say thank you", 1.5], ["what do you say", 1.5],
  ["say hi", 1], ["say bye bye", 1], ["say sorry", 0.8],
  ["night night", 1.5], ["good night", 1.5], ["i love you", 1.5], ["good morning", 1],
  ["that's enough", 1.2], ["no no", 1.5], ["no no no", 0.8], ["never mind", 1],
  ["i don't know", 1.5], ["who knows", 0.5], ["guess what", 1], ["listen", 1.5],
  ["look", 2.5], ["see", 1.5], ["watch", 1.5], ["watch this", 1.5], ["watch me", 1],
  ["hmm", 1], ["let me see", 1.5], ["i think so", 1], ["probably", 0.8],
  ["very good", 1.5], ["how nice", 1], ["that's nice", 1.5], ["that's funny", 1],
  ["silly", 1], ["you're silly", 1], ["that's okay", 1.5], ["it's okay", 2],
  ["it's fine", 1], ["don't worry", 1.2], ["it's alright", 1],
];
const ADULT_QUESTIONS = [
  ["what's that", 5], ["what's this", 4], ["what is it", 4], ["what is that", 3],
  ["who's that", 3], ["who is it", 1.5], ["who's this", 1.5],
  ["where's your {thing}", 2.5], ["where's the {thing}", 2], ["where is it", 2],
  ["where did it go", 1.5], ["where's {person}", 1.5], ["where are you", 1.2],
  ["what are you doing", 4], ["what happened", 2], ["what did you do", 1.5],
  ["what do you want", 3], ["what do you see", 1.5], ["what do you think", 1.5],
  ["what do you have", 1.5], ["what's in there", 1], ["what's the matter", 1],
  ["which one", 2], ["which one do you want", 2], ["what color", 1.5],
  ["what color is it", 1.2], ["how many", 1.5], ["can you count them", 1],
  ["how many {animal}", 1.2], ["what's that noise", 0.8], ["what did you say", 1],
  ["do you want {food}", 3.5], ["do you want some {food}", 2.5], ["do you want {drink}", 2.5],
  ["do you want more", 2], ["do you want more {food}", 2], ["want some {food}", 2],
  ["want {food}", 2], ["want more", 1.5], ["do you like {thing}", 2],
  ["do you like it", 2], ["do you like the {animal}", 1.5], ["do you need {thing}", 1.5],
  ["do you need help", 1.5], ["are you {feel}", 1.5], ["are you hungry", 2],
  ["are you thirsty", 1.2], ["are you tired", 1.5], ["are you sleepy", 1.5],
  ["are you done", 1.5], ["are you finished", 1], ["all done?", 2], ["are you okay", 1.5],
  ["are you ready", 1.5], ["is it {desc}", 1.5], ["is it hot", 1.2], ["is it yours", 1],
  ["is that yours", 1.2], ["is it good", 1.2], ["is it yummy", 1],
  ["did you {action}", 2], ["did you see the {animal}", 1.5], ["did you find it", 1],
  ["did you do it", 1.2], ["can you {action}", 2.5], ["can you see it", 1.5],
  ["can you say {oneword}", 1.5], ["can you reach it", 1], ["can you help me", 1],
  ["do you remember the {animal}", 1], ["do you remember", 1], ["do you hear that", 1.2],
  ["do you see it", 1.5], ["do you see the {animal}", 1.5], ["do you have it", 1],
  ["shall we {action}", 1], ["should we go", 1], ["why not", 1.5], ["why", 1.5],
  ["what else", 1], ["and then what", 1], ["or {food}?", 1.5], ["{food} or {food}?", 3],
  ["{drink} or {drink}?", 2], ["{toy} or {toy}?", 1.5], ["this one or that one?", 1.5],
  ["do you want this one or that one", 1.5],
];
const ADULT_UTTERANCES = [
  // imperatives / directives
  ["sit down", 2], ["stand up", 1.5], ["hold my hand", 2], ["hold on", 1.5],
  ["watch", 1.5], ["watch me", 1.5], ["watch this", 1.5], ["look at me", 2],
  ["look at this", 2], ["look at the {animal}", 2], ["look at your {thing}", 1.5],
  ["listen", 1.5], ["put it down", 2], ["put it back", 2], ["put it {place}", 1],
  ["put the {thing} {place}", 1.5], ["pick it up", 2], ["pick up your {toy}", 1.5],
  ["give me that", 1.5], ["give it to me", 1.5], ["give it to {person}", 1.2],
  ["give {person} some", 1], ["let's go", 2.5], ["let's see", 2], ["let's {action}", 2],
  ["let's have a look", 1.5], ["let's find your {thing}", 1.5], ["let's clean up", 1.5],
  ["clean up", 1.5], ["wash your hands", 2], ["wipe your hands", 1.2], ["wipe your face", 1],
  ["blow your nose", 0.8], ["eat your {food}", 2], ["drink your {drink}", 1.5],
  ["try it", 2], ["try some", 1.5], ["try some {food}", 1.5], ["have a bite", 1.5],
  ["one more bite", 2], ["take a bite", 1.2], ["have some {drink}", 1.2],
  ["share", 1.5], ["share with {person}", 1.2], ["be nice", 1.2], ["be gentle", 1.2],
  ["don't touch", 2], ["don't do that", 1.5], ["don't {action}", 1.5], ["stop", 2],
  ["stop it", 1.5], ["that's enough", 1.5], ["not now", 1.5], ["no thank you", 1],
  ["get your {cloth}", 1.5], ["put on your {cloth}", 2], ["take off your {cloth}", 1.5],
  ["close the {thing}", 1.5], ["open it", 1.5], ["open the {thing}", 1.2],
  ["turn it on", 1], ["turn it off", 1], ["leave it", 1], ["leave it alone", 1],
  ["put it away", 1.2], ["come back", 1.2], ["stay here", 1], ["wait for me", 1.5],
  ["get down", 1.5], ["come down", 1], ["get up", 1.2], ["lie down", 1.2],
  ["arms up", 1.2], ["feet up", 0.8], ["show me", 1.5], ["show me your {thing}", 1.2],
  ["tell me", 1.2], ["tell {person}", 1], ["ask {person}", 0.8],
  // statements / comments / expansions
  ["it's a {animal}", 2.5], ["that's a {animal}", 2.5], ["it's the {thing}", 1.5],
  ["it's a big {thing}", 1.5], ["a little {thing}", 1], ["it's {desc}", 2],
  ["that's {desc}", 2], ["it's too {desc}", 1.5], ["it's very {desc}", 1.5],
  ["the {animal} says {sound}", 1.5], ["the {animal} goes {sound}", 1.2],
  ["it's in the {place}", 1.5], ["it's on the {thing}", 1.5], ["it's under the {thing}", 1],
  ["it's behind the {thing}", 1], ["{person} has it", 1.5], ["{person} took it", 1],
  ["{person} has one", 1], ["we're going to {place}", 1.5], ["we're going to the {place}", 1.5],
  ["we'll go later", 1], ["not today", 1.2], ["tomorrow", 1.2], ["after {time}", 1.2],
  ["when {person} gets home", 1], ["because it's time", 1], ["because it's {desc}", 1],
  ["it's {time}", 1.5], ["time for {time}", 1.5], ["time to go", 1.5], ["time for bed", 1.5],
  ["it's bedtime", 1.5], ["nap time", 1], ["bath time", 1], ["snack time", 1],
  ["you want {food}", 1.5], ["you want more", 1.5], ["more {food}", 1.5], ["okay {food}", 1],
  ["here's your {drink}", 1.5], ["here's some {food}", 1.5], ["here's the {thing}", 1.2],
  ["you did it", 2], ["you did it!", 1.5], ["you're doing it", 1.2], ["good for you", 1],
  ["i like it", 1.2], ["i like your {thing}", 1.2], ["that's a nice {thing}", 1.2],
  ["it's a {color} one", 1.2], ["the {color} one", 1.2], ["which one is {color}", 0.8],
  ["it's hot", 1.2], ["it's cold", 1], ["it's yucky", 0.8], ["it's yummy", 1],
  ["it's wet", 1], ["it's dirty", 1], ["it's broken", 1], ["it fell", 1.2],
  ["it fell down", 1.2], ["it went {place}", 1], ["it's gone", 1.2], ["it's all gone", 1.2],
  ["there's no more", 1], ["that's all", 1.2], ["that's all gone", 1],
  ["i see a {animal}", 1.5], ["i see the {thing}", 1.2], ["i found it", 1],
  ["there's a {animal}", 1.5], ["there's your {thing}", 1.2], ["here comes {person}", 1],
  ["{person} is coming", 1], ["{person} is here", 0.8], ["say hi to {person}", 1],
  ["wave bye bye", 1], ["give {person} a hug", 1], ["give me a hug", 1.2],
  ["give me a kiss", 0.8], ["be nice to {person}", 0.8],
  ["it's your turn", 1.5], ["my turn", 1], ["{person}'s turn", 1],
  ["you're next", 0.8], ["wait your turn", 1.2], ["take turns", 1],
];

// ---------- scenarios: routine seeds bias slots and add lines ----------
const SCENARIOS = [
  { name: "mealtime", slots: ["food", "drink", "snack", "body"],
    adult: ["eat your {food}", "one more bite", "it's hot", "blow on it", "yummy",
      "sit down", "use your spoon", "all gone", "more {food}?", "finish your {drink}",
      "that's enough", "wipe your hands", "you're messy", "good eating"],
    child: ["more {food}", "all done", "yucky", "yummy", "i don't like it", "my {drink}"] },
  { name: "snack", slots: ["snack", "drink", "food"],
    adult: ["want a {snack}?", "{snack} or {snack}?", "just one", "that's enough",
      "here's your {snack}", "sit at the table"],
    child: ["i want {snack}", "more {snack}", "can i have {snack}", "please {snack}"] },
  { name: "bath", slots: ["body", "thing", "toy"],
    adult: ["wash your {body}", "close your eyes", "the water's warm", "don't splash",
      "splash splash", "all clean", "rub a dub dub", "get the towel", "wash your hair",
      "sit down please", "it's slippery"],
    child: ["splash", "bubbles", "no bath", "my {toy}", "water", "cold", "all clean"] },
  { name: "bedtime", slots: ["thing", "person", "toy", "time"],
    adult: ["time for bed", "brush your teeth", "one more book", "lie down",
      "close your eyes", "night night", "i love you", "sweet dreams", "get your {toy}",
      "under the covers", "it's late", "go to sleep"],
    child: ["no bed", "one more book", "i'm not tired", "my {toy}", "read it", "night night",
      "i'm scared", "it's dark", "stay with me"] },
  { name: "wakeup", slots: ["cloth", "time", "food"],
    adult: ["wake up", "good morning", "time to get up", "let's get dressed",
      "breakfast time", "did you sleep good", "rise and shine", "good morning sleepyhead"],
    child: ["i'm tired", "no get up", "good morning", "hungry", "i want {food}", "wake up"] },
  { name: "dressing", slots: ["cloth", "body", "place"],
    adult: ["put on your {cloth}", "arms up", "where's your {cloth}", "other foot",
      "it's cold outside", "you need your {cloth}", "let me help", "push it through"],
    child: ["no {cloth}", "i do it", "my {cloth}", "too tight", "don't want it", "me do it"] },
  { name: "potty", slots: ["body", "cloth"],
    adult: ["do you need the potty", "try the potty", "pull down your {cloth}",
      "good job", "flush it", "wash your hands", "almost", "big kid"],
    child: ["potty", "i need potty", "no potty", "i did it", "all done"] },
  { name: "blocks", slots: ["toy", "color", "desc"],
    adult: ["build a tower", "put it on top", "higher", "it fell", "crash",
      "my turn", "your turn", "what are you building", "careful", "another {toy}"],
    child: ["my turn", "it fell", "crash", "higher", "my tower", "more {toy}", "i did it"] },
  { name: "animals", slots: ["animal", "desc", "thing"],
    adult: ["what's that", "the {animal} says {sound}", "it's a {animal}",
      "where's the {animal}", "the {animal} is {desc}", "be gentle", "look at the {animal}"],
    child: ["{animal}", "the {animal}", "{animal} {sound}", "little {animal}", "my {animal}",
      "i see {animal}"] },
  { name: "park", slots: ["toy", "action", "vehicle"],
    adult: ["go down the slide", "higher", "hold on tight", "run run", "catch me",
      "your turn", "wait your turn", "don't climb that", "time to go soon", "one more time"],
    child: ["push me", "higher", "my turn", "catch me", "watch me", "again", "one more",
      "i want to swing"] },
  { name: "book", slots: ["animal", "thing", "color"],
    adult: ["what's that", "point to the {animal}", "where's the {animal}", "turn the page",
      "the {animal} says {sound}", "what do you see", "let's read it", "the end"],
    child: ["what's that", "the {animal}", "{animal}", "read it", "turn it", "the end",
      "that one", "where's the {animal}"] },
  { name: "car", slots: ["vehicle", "place", "thing"],
    adult: ["get in your seat", "buckle up", "we're going to {place}", "look out the window",
      "what do you see", "almost there", "sit back", "are we there yet"],
    child: ["{vehicle}", "big {vehicle}", "go go", "where are we going", "are we there yet",
      "i see {vehicle}", "my window"] },
  { name: "store", slots: ["food", "place", "thing"],
    adult: ["put it in the cart", "we need {food}", "don't touch", "stay with me",
      "that's not ours", "almost done", "what do you see", "hold my hand"],
    child: ["i want {food}", "that one", "can i have {food}", "i see {food}", "no no",
      "get down"] },
  { name: "cleanup", slots: ["toy", "thing", "place"],
    adult: ["clean up", "put it away", "put the {toy} {place}", "all done playing",
      "help me clean", "good helper", "put it in the box"],
    child: ["no", "i'm playing", "all done", "help me", "my {toy}", "not yet"] },
  { name: "drawing", slots: ["color", "thing", "desc"],
    adult: ["what are you drawing", "draw a {animal}", "use the {color} one",
      "that's pretty", "on the paper", "don't eat the crayon", "good drawing"],
    child: ["i draw {animal}", "{color} one", "my picture", "look", "i made it", "pretty"] },
  { name: "sick", slots: ["body", "feel", "drink"],
    adult: ["does it hurt", "poor baby", "let me see", "it's okay", "some {drink}",
      "lie down", "rest now", "you'll feel better"],
    child: ["my {body} hurts", "ow", "it hurts", "no", "i don't feel good", "mama"] },
  { name: "pretend", slots: ["animal", "person", "place", "toy"],
    adult: ["who are you", "are you a {animal}", "what does the {animal} say",
      "pretend you're a {animal}", "where does the {animal} live"],
    child: ["i'm a {animal}", "{sound}", "pretend i'm a {animal}", "you be the {animal}"] },
  { name: "outside", slots: ["animal", "thing", "desc", "vehicle"],
    adult: ["look at the {animal}", "it's {desc} out", "stay close", "don't go far",
      "come back", "what do you see", "pick it up", "that's a {animal}"],
    child: ["look", "a {animal}", "{vehicle}", "it's {desc}", "i see {animal}", "outside"] },
  { name: "goodbye", slots: ["person", "time"],
    adult: ["say bye bye", "wave bye", "{person} is going", "see you later",
      "give {person} a hug", "bye bye", "{person} will be back"],
    child: ["bye", "bye bye", "no go", "bye {person}", "come back", "stay"] },
];

// ---------- dialogue assembly ----------
const BANDS = {
  toddler: { echoP: 0.18, shortP: 0.5, minEx: 4, maxEx: 9 },
  preschool: { echoP: 0.13, shortP: 0.3, minEx: 4, maxEx: 10 },
  older: { echoP: 0.10, shortP: 0.2, minEx: 5, maxEx: 10 },
};

// frames where a template needs a real surface word, not a slot
const SPECIAL = {
  oneword: () => wpick(ONEWORD),
  sound: (echo) => {
    const a = echo?.animal && ANIMAL_SOUNDS[echo.animal] ? echo.animal : pick(Object.keys(ANIMAL_SOUNDS));
    if (echo) echo.animal = a;
    return ANIMAL_SOUNDS[a];
  },
};

function expand(template, echo) {
  return template.replace(/\{(\w+)\}/g, (m, k) => {
    if (k === "sound") return SPECIAL.sound(echo);
    if (k === "oneword") return SPECIAL.oneword();
    if (k === "offer" && echo?.word) return echo.word;
    const p = P[k];
    if (!p) return m;
    const w = wpick(p);
    if (/^(food|snack|drink|animal|toy|thing|cloth|vehicle|body|place)$/.test(k)) {
      if (echo) {
        echo.word = w;
        if (k === "animal") echo.animal = w;
      }
    }
    return w;
  });
}

function pickWeighted(list, scenarioBoost) {
  // scenarioBoost: array of template strings that get extra weight on match
  const items = list.map(([t, w]) => [t, w * (scenarioBoost?.includes(t) ? 2.5 : 1)]);
  return wpick(items);
}

function childTurn(band, scenario, echo) {
  const b = BANDS[band];
  // partner echo: repeat part of the adult's last offer
  if (echo?.word && rng() < b.echoP) {
    const w = echo.word;
    echo.word = null;
    const forms = {
      toddler: [w, `${w}!`, `want ${w}`, `more ${w}`, `my ${w}`, `${w} please`, `yeah ${w}`, `the ${w}`],
      preschool: [w, `want ${w}`, `more ${w}`, `my ${w}`, `i want ${w}`, `the ${w}`, `yeah ${w}`, `no ${w}`],
      older: [w, `the ${w}`, `i want ${w}`, `my ${w}`, `yeah ${w}`, `more ${w} please`, `it's a ${w}`],
    };
    return pick(forms[band]);
  }
  if (rng() < b.shortP) return expand(wpick(CHILD_SHORT), echo);
  const t = pickWeighted(CHILD[band], scenario?.child);
  return expand(t, echo);
}

function adultTurn(scenario, echo) {
  const r = rng();
  let t;
  if (scenario && r < 0.18 && scenario.adult?.length) t = pick(scenario.adult);
  else if (r < 0.52) t = wpick(ADULT_SHORT);
  else if (r < 0.82) t = wpick(ADULT_QUESTIONS);
  else t = wpick(ADULT_UTTERANCES);
  return expand(t, echo);
}

function dialogue(band) {
  const b = BANDS[band];
  const scenario = rng() < 0.65 ? pick(SCENARIOS) : null;
  const n = b.minEx + Math.floor(rng() * (b.maxEx - b.minEx + 1));
  const turns = [];
  const echo = { word: null, animal: null };
  let childFirst = rng() < 0.2;
  for (let i = 0; i < n; i++) {
    if (!childFirst || i > 0) {
      turns.push({ s: "a", t: adultTurn(scenario, echo) });
    }
    childFirst = false;
    turns.push({ s: "c", t: childTurn(band, scenario, echo) });
    if (rng() < 0.18) turns.push({ s: "c", t: expand(wpick(CHILD_SHORT), echo) }); // double child turn
  }
  return { band, turns };
}

// ---------- main ----------
mkdirSync(dirname(OUT), { recursive: true });
const lines = [];
for (const band of Object.keys(BANDS)) {
  for (let i = 0; i < N_PER_BAND; i++) lines.push(JSON.stringify(dialogue(band)));
}
writeFileSync(OUT, lines.join("\n") + "\n");
const nUtts = lines.reduce((s, l) => s + JSON.parse(l).turns.length, 0);
console.log(`wrote ${lines.length} dialogues, ${nUtts} utterances -> ${OUT}`);
