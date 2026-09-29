import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyMark,
  localImagePath,
  mergeFinderConfig,
} from "./calibration_dev.mjs";

test("applyMark: matches on text+description, stores image_id or 'none'", () => {
  const queries = [
    { text: "apple" },
    { text: "Cooper", description: "our golden retriever" },
  ];
  const row = applyMark(queries, { text: "Cooper", description: "our golden retriever", mark: "img_0001" });
  assert.equal(row.mark, "img_0001");
  // description must match — same name with a different description is a
  // different row
  assert.equal(applyMark(queries, { text: "Cooper", description: "", mark: "x" }), null);
  const none = applyMark(queries, { text: "apple", mark: "none" });
  assert.equal(none.mark, "none");
  assert.equal(applyMark(queries, { text: "missing", mark: "x" }), null);
  assert.equal(applyMark(queries, { text: "", mark: "x" }), null);
  assert.equal(applyMark(queries, { text: "apple", mark: "" }), null);
});

test("mergeFinderConfig: writes only the four calibration fields", () => {
  const cfg = {
    schemaVersion: 1, embed_model: "@cf/baai/bge-m3", auto_cutoff: 1.01,
    auto_cutoff_by_lang: {}, pick_weight: 0.05, reject_weight: 0.1,
    top_k: 4, fetch_k: 12,
  };
  const merged = mergeFinderConfig(cfg, {
    auto_cutoff: 0.74,
    auto_cutoff_by_lang: { de: 0.7, fr: null, es: 0.68 },
    pick_weight: 0.02, reject_weight: 0.15,
  });
  assert.equal(merged.auto_cutoff, 0.74);
  assert.deepEqual(merged.auto_cutoff_by_lang, { de: 0.7, es: 0.68 });
  assert.equal(merged.pick_weight, 0.02);
  assert.equal(merged.reject_weight, 0.15);
  // untouched fields survive
  assert.equal(merged.embed_model, "@cf/baai/bge-m3");
  assert.equal(merged.top_k, 4);
  // WT4: the saved cutoff is data — no code path changes
  assert.equal(mergeFinderConfig(cfg, {
    auto_cutoff: 0.5, pick_weight: 0.05, reject_weight: 0.1,
  }).auto_cutoff, 0.5);
});

test("mergeFinderConfig: rejects out-of-range and malformed values", () => {
  const cfg = { auto_cutoff: 1.01, auto_cutoff_by_lang: {} };
  assert.equal(mergeFinderConfig(cfg, { auto_cutoff: "high" }), null);
  assert.equal(mergeFinderConfig(cfg, { auto_cutoff: 2.5 }), null);
  assert.equal(mergeFinderConfig(cfg, { auto_cutoff: 0.7, pick_weight: -1 }), null);
  assert.equal(mergeFinderConfig(cfg, {
    auto_cutoff: 0.7, auto_cutoff_by_lang: { english: 0.7 },
  }), null);
  assert.equal(mergeFinderConfig(cfg, {
    auto_cutoff: 0.7, auto_cutoff_by_lang: { de: "low" },
  }), null);
});

test("localImagePath: ext_ from out/extended_art, img_ via catalog key, drw_ none", () => {
  const cat = new Map([["img_0001", "symbols/apple.png"]]);
  assert.match(localImagePath("ext_applesauce", cat), /out\/extended_art\/applesauce\.png$/);
  assert.match(localImagePath("img_0001", cat), /public\/symbols\/apple\.png$/);
  assert.equal(localImagePath("drw_" + "a".repeat(64), cat), null);
  assert.equal(localImagePath("ext_../../etc", cat), null);
  assert.equal(localImagePath("img_9999", cat), null);
  assert.equal(localImagePath("nonsense", cat), null);
});

test("030 § 7: the shipped queries cover the required cases", async () => {
  const { readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const repo = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const { queries } = JSON.parse(
    readFileSync(join(repo, "data/pictures/calibration_queries.json"), "utf8"));
  const byText = (t) => queries.find((q) => q.text === t);

  // personal/description rows — the description path must be exercised
  assert.equal(byText("Cooper")?.description, "our golden retriever");
  assert.equal(byText("Grandma Rosa")?.description, "my mom's mom");
  assert.ok(queries.filter((q) => q.description).length >= 2);

  // ≥15 rows each for de/es/fr — identified by the shipped word blocks
  const de = ["Apfel","Hund","Katze","Wasser","Milch","Brot","Haus","rot",
    "groß","danke","spielen","schlafen","Banane","Saft","Gift"];
  const es = ["manzana","perro","gato","agua","leche","pan","casa","rojo",
    "grande","gracias","jugar","dormir","plátano","jugo","más"];
  const fr = ["pomme","chien","chat","eau","lait","pain","maison","rouge",
    "grand","merci","jouer","dormir","banane","jus","beurre"];
  for (const w of [...de, ...es, ...fr]) {
    assert.ok(byText(w), `missing language row: ${w}`);
  }
});
