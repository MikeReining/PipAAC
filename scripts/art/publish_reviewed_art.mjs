#!/usr/bin/env node
/**
 * Ship founder-reviewed extended art:
 *   - Launch gaps: copy approved PNGs into assets/symbols/ (catalog build ships them).
 *   - Extended library: upload approved PNGs to WBB R2 + write data/catalog/extended_art_r2.json
 *
 *   node scripts/art/publish_reviewed_art.mjs --dry-run
 *   node scripts/art/publish_reviewed_art.mjs
 *   node scripts/art/publish_reviewed_art.mjs --launch-only
 *   node scripts/art/publish_reviewed_art.mjs --r2-only
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { computeCoreGaps } from "./art_gaps.mjs";
import { loadGlyphWords } from "./gen.mjs";
import { readReview, OUT, RESULTS_PATH, loadResultsMeta } from "./review_lane.mjs";
import { repoRoot, DEFAULT_LEXICON_PATH } from "../catalog/paths.mjs";
import { r2PutArgs, sha256File } from "../catalog/storage.mjs";

const SYMBOLS_DIR = join(repoRoot, "assets/symbols");
const MANIFEST_PATH = join(repoRoot, "data/catalog/extended_art_r2.json");
const R2_PREFIX = "symbols/extended";

function wranglerBin() {
  return join(repoRoot, "node_modules/.bin/wrangler");
}

function runR2Put(key, sourcePath) {
  const result = spawnSync(wranglerBin(), r2PutArgs(key, sourcePath), {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(
      `r2 put failed for ${key}: ${(result.stderr || result.stdout || "").trim().slice(0, 400)}`,
    );
  }
}

function launchMissingBySlug() {
  const lexicon = JSON.parse(readFileSync(DEFAULT_LEXICON_PATH, "utf8"));
  const gaps = computeCoreGaps(lexicon, SYMBOLS_DIR, loadGlyphWords());
  const map = new Map();
  for (const m of gaps.missing) {
    if (m.note) continue;
    map.set(m.spokenText.toLowerCase().replace(/\s+/g, "_"), m);
  }
  return map;
}

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    return { schemaVersion: 1, publishedAt: null, entries: {} };
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

function main() {
  const dry = process.argv.includes("--dry-run");
  const launchOnly = process.argv.includes("--launch-only");
  const r2Only = process.argv.includes("--r2-only");
  const review = readReview();
  const meta = loadResultsMeta(RESULTS_PATH);
  const launchSlugs = launchMissingBySlug();
  const manifest = loadManifest();
  const now = new Date().toISOString();

  const approved = Object.entries(review)
    .filter(([, v]) => v === "approve")
    .map(([id]) => id)
    .sort();

  let launchCopied = 0;
  let r2Uploaded = 0;
  let skipped = 0;
  const errors = [];

  if (!r2Only) {
    mkdirSync(SYMBOLS_DIR, { recursive: true });
    for (const id of approved) {
      const src = join(OUT, `${id}.png`);
      if (!existsSync(src)) {
        skipped++;
        continue;
      }
      const launch = launchSlugs.get(id);
      if (!launch) continue;
      const destName = `${id}.png`;
      const dest = join(SYMBOLS_DIR, destName);
      if (dry) {
        console.log(`[dry-run] launch copy ${id} → assets/symbols/${destName} (#${launch.slot} ${launch.spokenText})`);
      } else {
        copyFileSync(src, dest);
      }
      launchCopied++;
    }
  }

  if (!launchOnly) {
    for (const id of approved) {
      const src = join(OUT, `${id}.png`);
      if (!existsSync(src)) {
        skipped++;
        continue;
      }
      const sha256 = sha256File(src);
      const key = `${R2_PREFIX}/${id}.png`;
      const prev = manifest.entries[id];
      if (prev?.sha256 === sha256 && prev?.r2Key === key) {
        continue;
      }
      const row = meta.get(id) ?? {};
      const entry = {
        id,
        label: row.label ?? id.replace(/_/g, " "),
        section: row.section ?? "",
        sha256,
        r2Key: key,
        localSource: `out/extended_art/${id}.png`,
        launchSlot: launchSlugs.get(id)?.slot ?? null,
        publishedAt: now,
      };
      if (dry) {
        console.log(`[dry-run] r2 put ${key}`);
      } else {
        try {
          runR2Put(key, src);
          manifest.entries[id] = entry;
          r2Uploaded++;
          if (r2Uploaded % 50 === 0) {
            manifest.publishedAt = now;
            writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
            console.log(`… ${r2Uploaded} uploaded (checkpoint)`);
          }
        } catch (err) {
          errors.push(`${id}: ${err.message}`);
        }
      }
    }
  }

  if (!dry) {
    manifest.publishedAt = now;
    manifest.schemaVersion = 1;
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  }

  console.log("\nSummary:");
  console.log(`  approved in review.json: ${approved.length}`);
  console.log(`  launch copies → assets/symbols/: ${launchCopied}`);
  console.log(`  R2 uploads (${R2_PREFIX}/): ${dry ? "(dry-run)" : r2Uploaded}`);
  console.log(`  skipped (approved but no PNG): ${skipped}`);
  if (errors.length) {
    console.log(`  errors: ${errors.length} (first: ${errors[0]})`);
    process.exit(1);
  }
  if (!dry && !launchOnly && launchCopied > 0) {
    console.log("\nNext: npm run catalog:build");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
