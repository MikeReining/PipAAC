#!/usr/bin/env node
/**
 * 037 § 7 art review — generates public/preview-symbol-diet.html: master
 * vs shipped WebP side by side at 60 and 140 CSS px for the fixed,
 * rule-picked set (largest shipped files, extreme aspect ratios +
 * numerals, the JPG→WebP path, brand/packshot guard).
 *
 *   node scripts/catalog/symbol_diet_preview.mjs
 *
 * Run after `npm run catalog:build` so public/symbols/ is current.
 * Masters are inlined as ≤512px WebP data URIs — assets/ is not served,
 * and what matters is tile-size fidelity, not master bytes.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";

import { repoRoot } from "./paths.mjs";

const MASTERS = join(repoRoot, "assets/symbols");
const SHIPPED = join(repoRoot, "public/symbols");
const OUT = join(repoRoot, "public/preview-symbol-diet.html");
const SIZES = [60, 140];
const RASTER = /\.(png|jpe?g)$/i;

const masters = readdirSync(MASTERS)
  .filter((f) => !/_roll\d*\./.test(f) && /\.(png|svg|jpe?g)$/i.test(f));

/* Rule 1 — the 12 largest shipped WebPs by bytes. */
const largest = readdirSync(SHIPPED)
  .filter((f) => f.endsWith(".webp"))
  .map((f) => ({ f, size: statSync(join(SHIPPED, f)).size }))
  .sort((a, b) => b.size - a.size)
  .slice(0, 12)
  .map(({ f }) => f.slice(0, -".webp".length));

/* Rule 2 — the 10 most extreme aspect ratios among non-square raster
 * masters, plus the numeral words one…ten (thin-stroke glyph art). */
const dims = [];
for (const f of masters.filter((f) => RASTER.test(f))) {
  const { width, height } = await sharp(join(MASTERS, f)).metadata();
  if (width && height && width !== height) {
    dims.push({ stem: f.slice(0, f.lastIndexOf(".")), ratio: Math.max(width, height) / Math.min(width, height) });
  }
}
const extremes = dims.sort((a, b) => b.ratio - a.ratio).slice(0, 10).map((d) => d.stem);
const numerals = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]
  .filter((w) => masters.some((f) => f.startsWith(`${w}.`)));

/* Rule 3 — the JPG masters (lossy→lossy). */
const jpgs = masters.filter((f) => /\.jpe?g$/i.test(f))
  .map((f) => f.slice(0, f.lastIndexOf(".")));

/* Rule 4 — brand/packshot guard: none in assets/symbols today; the
 * tokens below trip it the first time one is approved. */
const BRAND_HINTS = /^(pepsi|dr_?pepper|7_?up|mountain_?dew|fanta|sprite|coke|coca_?cola|cheerios|oreo|doritos|cheetos|goldfish(?!_crackers))/i;
const brands = masters.filter((f) => BRAND_HINTS.test(f))
  .map((f) => f.slice(0, f.lastIndexOf(".")));

const set = new Map(); // stem -> reasons
const add = (stem, reason) =>
  set.set(stem, [...(set.get(stem) ?? []), reason]);
for (const s of largest) add(s, "largest shipped");
for (const s of extremes) add(s, "extreme aspect");
for (const s of numerals) add(s, "numeral glyph");
for (const s of jpgs) add(s, "JPG→WebP");
for (const s of brands) add(s, "brand/packshot");

const dataUri = (buf, mime) => `data:${mime};base64,${buf.toString("base64")}`;

const rows = [];
for (const [stem, reasons] of [...set.entries()].sort()) {
  const masterFile = masters.find((f) => f.startsWith(`${stem}.`));
  const shippedFile = readdirSync(SHIPPED).find((f) => f.startsWith(`${stem}.`));
  const masterBuf = await sharp(join(MASTERS, masterFile))
    .resize(512, 512, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 90 })
    .toBuffer();
  /* `in.jpg`: the PNG master wins the preference, so no shipped file
   * derives from the JPG — transcode it here for display only. */
  const shippedBuf = shippedFile
    ? readFileSync(join(SHIPPED, shippedFile))
    : await sharp(join(MASTERS, masterFile))
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  rows.push({
    stem,
    reasons: reasons.join(", "),
    shipped: shippedFile ?? "(not shipped — another ext won)",
    master: dataUri(masterBuf, "image/webp"),
    webp: dataUri(shippedBuf, shippedFile?.endsWith(".svg") ? "image/svg+xml" : "image/webp"),
  });
}

const cells = (row) => SIZES.map((px) => `
      <td><img src="${row.master}" width="${px}" height="${px}" alt=""></td>
      <td><img src="${row.webp}" width="${px}" height="${px}" alt=""></td>`).join("");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Symbol diet review — 037</title>
<style>
body { font: 15px/1.5 system-ui; margin: 24px; background: #f6f4ef; color: #1a1a1a; }
table { border-collapse: collapse; background: #fff; }
th, td { border: 1px solid #d8d4c8; padding: 8px; text-align: center; }
td:first-child { text-align: left; font-weight: 600; }
img { display: block; margin: auto; }
h1 { font-size: 20px; } p { max-width: 70ch; }
.note { color: #5b5348; font-size: 13px; }
</style></head><body>
<h1>Symbol diet review — master vs shipped WebP</h1>
<p>Each row: master (resized for display) beside the file that ships in
public/symbols/, rendered at 60 and 140 CSS px — the tile sizes. Judge at
tile size, not master fidelity. Rule set: docs/phases/037_Shipped_Payload_Diet.md § 7.
Brand/packshot guard: ${brands.length ? brands.join(", ") : "no matches today"}.</p>
<table>
<thead><tr><th>word / rule</th>${SIZES.map((px) => `<th colspan="2">${px} CSS px<br><span class="note">master · shipped</span></th>`).join("")}</tr></thead>
<tbody>${rows.map((r) => `
  <tr><td>${r.stem}<br><span class="note">${r.reasons}<br>${r.shipped}</span></td>${cells(r)}</tr>`).join("")}
</tbody></table>
<p class="note">Generated by scripts/catalog/symbol_diet_preview.mjs — ${rows.length} rows.</p>
</body></html>
`;

writeFileSync(OUT, html, "utf8");
console.log(`Wrote ${OUT} — ${rows.length} rows (${[...set.values()].flat().length} rule hits)`);
