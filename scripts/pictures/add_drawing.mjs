#!/usr/bin/env node
/**
 * Put a picture we already paid for into the extended library — one command.
 *
 *   npm run pictures:add -- crocs path/to/crocs.png --section Clothes
 *   npm run pictures:add -- crocs path/to/crocs.png --dry-run
 *
 * The same thing `art:review` + `art:publish-reviewed` do for a batch, for
 * one word, with the verdict already made: copy the PNG to
 * out/extended_art/<id>.png, record the label/section (results.jsonl) and an
 * approval (review.json), upload to the WBB R2 bucket + manifest, rebuild the
 * label map, and (with PIP_PICTURE_ADMIN_URL set) upsert that one index row.
 * The find path then applies it for that word, free, for everyone.
 *
 * The PNG is used as-is: drawings and extended art are both 1600×1600.
 */
import { spawnSync } from "node:child_process";
import {
  appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { repoRoot } from "../catalog/paths.mjs";
import { r2PutArgs, sha256File } from "../catalog/storage.mjs";
import {
  OUT, RESULTS_PATH, readReview, writeReview,
} from "../art/review_lane.mjs";
import { buildLabelMap, buildRows, loadEnv } from "./build_index.mjs";
import { captionForExtended } from "../../src/shared/picture_index.mjs";

const MANIFEST = join(repoRoot, "data/catalog/extended_art_r2.json");
const LABELS = join(repoRoot, "data/catalog/picture_labels.json");
const R2_PREFIX = "symbols/extended";
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

/** "Crocs" → "crocs", "ice cream" → "ice_cream" (the extended-art id). */
export const slugFor = (word) =>
  word.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export function checkPng(path) {
  if (!existsSync(path)) throw new Error(`no such file: ${path}`);
  const head = readFileSync(path).subarray(0, 4);
  if (!PNG_MAGIC.every((b, i) => head[i] === b)) throw new Error(`not a PNG: ${path}`);
}

function readManifest() {
  return existsSync(MANIFEST)
    ? JSON.parse(readFileSync(MANIFEST, "utf8"))
    : { schemaVersion: 1, publishedAt: null, entries: {} };
}

/** Everything but the R2 upload and the index call — local files only. */
export function recordLocally({ id, label, section, src, out = OUT, resultsPath = RESULTS_PATH }) {
  mkdirSync(out, { recursive: true });
  copyFileSync(src, join(out, `${id}.png`));
  const seen = existsSync(resultsPath) && readFileSync(resultsPath, "utf8")
    .split("\n").some((l) => l.startsWith(`{"id":${JSON.stringify(id)},`));
  if (!seen) {
    appendFileSync(resultsPath, `${JSON.stringify({
      id, label, section, spec: { source: "drawing-add" }, at: new Date().toISOString(),
      file: `${id}.png`,
    })}\n`);
  }
  const review = readReview(join(out, "review.json"));
  review[id] = "approve";
  writeReview(review, join(out, "review.json"));
}

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const dry = args.includes("--dry-run");
  const si = args.indexOf("--section");
  const section = si >= 0 ? args[si + 1] : "";
  const pos = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--section");
  const [word, file] = pos;
  if (!word || !file) {
    console.error("usage: pictures:add -- <word> <file.png> [--section <Name>] [--dry-run]");
    process.exit(2);
  }
  const id = slugFor(word);
  if (!id) throw new Error(`no usable word in ${JSON.stringify(word)}`);
  const src = resolve(file);
  checkPng(src);
  const manifest = readManifest();
  const sha256 = sha256File(src);
  const prev = manifest.entries[id];
  if (prev && prev.sha256 !== sha256) {
    throw new Error(`${id} is already in the library with a different picture — `
      + "remove its manifest entry first if you mean to replace it");
  }
  const key = `${R2_PREFIX}/${id}.png`;
  console.log(`${id}: "${word.trim()}" · ${section || "no section"} · ${sha256.slice(0, 12)}`);
  console.log(`  caption: ${captionForExtended(word.trim(), section)}`);
  if (dry) { console.log("dry run — nothing written"); return; }

  recordLocally({ id, label: word.trim(), section, src });
  if (!prev) {
    const put = spawnSync(join(repoRoot, "node_modules/.bin/wrangler"), r2PutArgs(key, src), {
      cwd: repoRoot, encoding: "utf8",
    });
    if (put.status !== 0) {
      throw new Error(`r2 put failed: ${(put.stderr || put.stdout || "").trim().slice(0, 400)}`);
    }
    manifest.entries[id] = {
      id, label: word.trim(), section, sha256, r2Key: key,
      localSource: `out/extended_art/${id}.png`, launchSlot: null,
      publishedAt: new Date().toISOString(),
    };
    manifest.publishedAt = manifest.entries[id].publishedAt;
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
    console.log(`  uploaded ${key}`);
  }
  // Merge only this word's entry — a full rebuild would also ship every
  // other approved-but-unshipped picture the committed map doesn't list.
  const map = JSON.parse(readFileSync(LABELS, "utf8"));
  for (const [norm, list] of Object.entries(buildLabelMap().labels)) {
    for (const entry of list.filter((e) => e.image_id === `ext_${id}`)) {
      const into = map.labels[norm] ??= [];
      if (!into.some((e) => e.image_id === entry.image_id)) into.push(entry);
    }
  }
  writeFileSync(LABELS, JSON.stringify(map, null, 1));
  console.log("  label map updated → data/catalog/picture_labels.json");

  const base = (process.env.PIP_PICTURE_ADMIN_URL ?? "").replace(/\/+$/, "");
  if (!base) {
    console.log("PIP_PICTURE_ADMIN_URL unset — run `npm run pictures:index` to index it.");
    return;
  }
  const rows = buildRows().filter((r) => r.image_id === `ext_${id}`);
  const res = await fetch(`${base}/admin/v1/pictures/index`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.PIP_ADMIN_TOKEN ?? ""}`,
    },
    body: JSON.stringify({ index: "main", rows }),
  });
  if (!res.ok) throw new Error(`index upsert ${res.status}: ${(await res.text()).slice(0, 300)}`);
  console.log(`  indexed ${(await res.json()).upserted} row`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
