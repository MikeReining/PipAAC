#!/usr/bin/env node
/**
 * Publish every *_recommended.mp3 in elevenlabs-forms-core/shortlist to R2 + forms_audio.json.
 *
 *   node scripts/catalog/publish_elevenlabs_forms_shortlist.mjs
 *   node scripts/catalog/publish_elevenlabs_forms_shortlist.mjs --dry-run
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { recipeWordForSlug, slugFromMp3 } from "./audio_review_dev.mjs";
import { FORMS_REVIEW_BATCH } from "./elevenlabs_tile_variations.mjs";
import { publishCatalogForm } from "./publish_catalog_form.mjs";
import { repoRoot } from "./paths.mjs";

function loadEnv() {
  try {
    for (const line of readFileSync(join(repoRoot, ".env"), "utf8").split("\n")) {
      const m = /^([A-Z_]+)=(.+)$/.exec(line.trim());
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // optional
  }
}

async function main() {
  loadEnv();
  const dryRun = process.argv.includes("--dry-run");
  const shortDir = join(repoRoot, "data/samples", FORMS_REVIEW_BATCH, "shortlist");
  if (!existsSync(shortDir)) throw new Error(`missing ${shortDir}`);

  const files = readdirSync(shortDir)
    .filter((f) => f.endsWith("_recommended.mp3"))
    .sort();

  let ok = 0;
  let failed = 0;
  for (const name of files) {
    const slug = slugFromMp3(name);
    const sourceMp3Path = join(shortDir, name);
    try {
      const { word, utterance_id } = recipeWordForSlug(FORMS_REVIEW_BATCH, slug);
      if (!utterance_id) throw new Error("no utterance_id in recipes.json");
      const result = publishCatalogForm({
        sourceMp3Path,
        utterance_id,
        spokenText: word,
        slug,
        dryRun,
      });
      ok++;
      console.log(
        `${dryRun ? "[dry-run] " : ""}published ${word} (${utterance_id}) -> ${result.clip.key}`,
      );
    } catch (err) {
      failed++;
      console.error(`FAIL ${slug}: ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`done: ${ok} published, ${failed} failed, ${files.length} shortlist files`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
