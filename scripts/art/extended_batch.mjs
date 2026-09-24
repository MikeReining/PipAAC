// DO NOT RUN without explicit founder approval for that exact run. It spends real
// money (Muse via OpenRouter + one Jev call per row). On 2026-09-24 an unapproved
// run drew ~1,950 images and exhausted the OpenRouter daily budget. Art is made one
// image at a time, ten at most (docs/operations/art-generator/SKILL.md § 7).
//
// Phase 010 slice 2: draw every `art: draw` row in the extended catalog.
// Source: docs/product/Extended_Vocabulary_Catalog.md. Output: out/extended_art/
// (gitignored; review before anything moves into assets/).
//
//   node scripts/art/extended_batch.mjs [--section <name>] [--limit N] [--concurrency N] [--dry] [--reroll] --founder-approved
//
// --reroll: rows marked "reroll" in review.json (scripts/art/review_server.mjs) move
// to rejected/ and are drawn again with the same spec.
//
// Resumable: a row whose PNG exists is skipped. Every attempt appends one line
// to results.jsonl (spec, prompt, file or error), so a re-roll can reuse the spec.
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyWithJev, generateToFile, buildPrompt } from "./gen.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CATALOG = join(repoRoot, "docs/product/Extended_Vocabulary_Catalog.md");
const OUT = join(repoRoot, "out/extended_art");
const SPECS = join(OUT, "specs.json");
const RESULTS = join(OUT, "results.jsonl");
const REVIEW = join(OUT, "review.json");

// Fitzgerald torso colour by section (docs/product/Design_System.md).
const TORSO = {
  Actions: "green",
  "Describing words": "blue",
  "Sounds and exclamations": "pink",
  "Phrases: daily routines": "green",
  "Phrases: urgent and body": "pink",
  "Phrases: scripts and feelings": "pink",
  "Phrases: social": "pink",
};
const BRAND_SECTIONS = new Set(["Brand foods and drinks", "Brand toys and things", "Restaurants and stores"]);
const VENUES = new Set([
  "Target", "Walmart", "Costco", "Sam's Club", "Kroger", "Publix", "Trader Joe's", "Whole Foods", "Aldi",
  "H-E-B", "Safeway", "Walgreens", "CVS", "Home Depot", "Lowe's", "IKEA", "Five Below", "Dollar Tree",
  "GameStop", "Michaels", "Hobby Lobby", "PetSmart", "Petco", "Old Navy", "Build-A-Bear Workshop",
  "Disney World", "Disneyland", "Legoland", "SeaWorld", "Six Flags", "Sky Zone", "YMCA", "Great Wolf Lodge",
  "Sesame Place", "Universal Studios", "Kohl's", "Macy's", "TJ Maxx", "Marshalls", "Ross", "Burlington",
  "Barnes and Noble", "Best Buy", "Apple Store", "Dick's Sporting Goods", "Academy", "Bass Pro", "Cabela's",
  "Carter's", "Gap Kids", "Children's Place", "Claire's", "Bath and Body Works", "Sephora", "Ulta", "JCPenney",
  "Dillard's", "Nordstrom", "Meijer", "Wegmans", "Food Lion", "Stop and Shop", "ShopRite", "Albertsons",
  "Vons", "Ralphs", "Winn-Dixie", "Hy-Vee", "Sprouts", "Fresh Market", "Dollar General", "Family Dollar",
  "Big Lots", "Joann", "Party City", "Toys R Us", "Chuck E. Cheese", "Dave and Buster's", "Medieval Times",
  "Main Event", "Round1", "Urban Air", "My Gym", "The Little Gym", "Gymboree", "Rainforest Cafe",
]);
const BRAND_HINTS = {
  Amazon: "a brown Amazon delivery box with the smile logo",
  "Happy Meal": "the red Happy Meal box with golden arches handle",
};

export function parseCatalog(md) {
  const rows = [];
  const seen = new Set();
  for (const sec of md.split(/\n(?=## )/).filter((s) => s.startsWith("## "))) {
    const lines = sec.split("\n");
    const section = lines[0].slice(3).trim();
    const artLine = lines.find((l) => l.startsWith("art:"));
    if (!artLine) continue;
    const art = artLine.slice(4).trim();
    const body = lines.slice(lines.indexOf(artLine) + 1).filter((l) => !/^(---|# )/.test(l) && !l.startsWith("Each phrase"));
    for (const label of body.join(" ").split(",").map((s) => s.trim()).filter(Boolean)) {
      let id = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      while (seen.has(id)) id += "_x";
      seen.add(id);
      rows.push({ id, label, spoken: label.replace(/\s*\(.*\)$/, ""), section, art });
    }
  }
  return rows;
}

function brandSpec(row) {
  let hint = BRAND_HINTS[row.label] ?? null;
  if (!hint && row.section === "Restaurants and stores") {
    hint = VENUES.has(row.label)
      ? "the storefront entrance with its sign, seen from the parking lot"
      : "the restaurant's branded takeout bag and drink cup";
  }
  return { entity_mode: "cpg_brand", hint, source: "section" };
}

const isPhrase = (row) => row.section.startsWith("Phrases");

// gen.mjs reads a trailing "s" as plural; for a phrase ("my head hurts") that is wrong.
export function promptFor(row, spec) {
  const text = buildPrompt({ word: row.label, ...spec });
  return isPhrase(row) ? text.replace(/\nShow more than one\./, "") : text;
}

async function specFor(row) {
  if (BRAND_SECTIONS.has(row.section)) return brandSpec(row);
  const c = await classifyWithJev({ word: row.label });
  // A phrase is not a body part; the anatomy prompt would read "arrow pointing to the my tummy hurts".
  if (isPhrase(row) && c.entity_mode === "anatomy_relational") c.entity_mode = "concept_action";
  const torso = TORSO[row.section] ?? "yellow";
  const figure = ["bust", "full", "contrast"].includes(c.framing);
  return {
    entity_mode: c.entity_mode,
    framing: c.framing,
    social_scale: c.social_scale,
    hand: figure && c.framing !== "contrast" ? c.hand_mode : null,
    packaging: c.packaging !== "none" ? c.packaging : null,
    torso: figure || c.entity_mode === "concept_action" ? torso : null,
    source: c.model,
  };
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

async function retry(fn, tries = 4) {
  for (let t = 1; ; t++) {
    try { return await fn(); } catch (err) {
      const transient = /HTTP (429|5\d\d)|fetch failed|ECONNRESET|ETIMEDOUT|no image/.test(String(err));
      if (!transient || t >= tries) throw err;
      await new Promise((r) => setTimeout(r, 5000 * t));
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.includes("--founder-approved")) {
    console.error("Refusing: batch art generation spends real money. Run only with explicit founder approval, and pass --founder-approved.");
    process.exit(1);
  }
  const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const section = opt("--section", null);
  const limit = Number(opt("--limit", Infinity));
  const concurrency = Number(opt("--concurrency", 8));
  const dry = args.includes("--dry");

  mkdirSync(OUT, { recursive: true });
  if (args.includes("--reroll") && existsSync(REVIEW)) {
    const review = JSON.parse(readFileSync(REVIEW, "utf8"));
    mkdirSync(join(OUT, "rejected"), { recursive: true });
    for (const [id, state] of Object.entries(review)) {
      if (state !== "reroll") continue;
      const file = join(OUT, `${id}.png`);
      if (existsSync(file)) renameSync(file, join(OUT, "rejected", `${id}.${Date.now()}.png`));
      delete review[id];
    }
    writeFileSync(REVIEW, JSON.stringify(review, null, 1));
  }
  let rows = parseCatalog(readFileSync(CATALOG, "utf8")).filter((r) => r.art === "draw");
  if (section) rows = rows.filter((r) => r.section === section);
  const todo = rows.filter((r) => !existsSync(join(OUT, `${r.id}.png`))).slice(0, limit);
  console.log(`${rows.length} drawable rows, ${todo.length} to draw, concurrency ${concurrency}`);

  const specs = existsSync(SPECS) ? JSON.parse(readFileSync(SPECS, "utf8")) : {};
  await pool(todo.filter((r) => !specs[r.id]), 8, async (r) => {
    try { specs[r.id] = await retry(() => specFor(r)); } catch (err) { console.error(`spec ${r.id}: ${err.message}`); }
  });
  writeFileSync(SPECS, JSON.stringify(specs, null, 1));
  if (dry) {
    for (const r of todo.slice(0, 20)) console.log(r.label, JSON.stringify(specs[r.id]), "\n  ", promptFor(r, specs[r.id]).replace(/\n/g, " | "));
    return;
  }

  let done = 0, failed = 0;
  const t0 = Date.now();
  await pool(todo.filter((r) => specs[r.id]), concurrency, async (r) => {
    const spec = specs[r.id];
    const file = join(OUT, `${r.id}.png`);
    const rec = { id: r.id, label: r.label, section: r.section, spec, at: new Date().toISOString() };
    try {
      const { prompt } = await retry(() => generateToFile({ word: r.label, ...spec, prompt: promptFor(r, spec), out: file, lane: "extended-batch" }));
      Object.assign(rec, { file: `${r.id}.png`, prompt });
      done++;
    } catch (err) {
      rec.error = String(err.message).slice(0, 300);
      failed++;
    }
    appendFileSync(RESULTS, JSON.stringify(rec) + "\n");
    const n = done + failed;
    if (n % 25 === 0 || rec.error) {
      const rate = n / ((Date.now() - t0) / 60000);
      console.log(`${n}/${todo.length} done=${done} failed=${failed} ${rate.toFixed(1)}/min${rec.error ? ` ERR ${r.id}: ${rec.error.slice(0, 120)}` : ""}`);
    }
  });
  console.log(`finished: ${done} drawn, ${failed} failed`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
