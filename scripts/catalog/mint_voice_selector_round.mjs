#!/usr/bin/env node
/**
 * Mint probe grid for the active voice-selector round (3 candidates × N probes).
 *
 *   node scripts/catalog/mint_voice_selector_round.mjs
 *   node scripts/catalog/mint_voice_selector_round.mjs --force
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  loadRoundConfig,
  mintVoiceSelectorProbe,
  probeSlug,
  probeTakeFilename,
  VOICE_SELECTOR_BATCH,
} from "./elevenlabs_voice_selector.mjs";
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
  if (!process.env.ELEVENLABS_API_KEY?.trim()) {
    throw new Error("ELEVENLABS_API_KEY is required in .env");
  }
  const force = process.argv.includes("--force");
  const samples = join(repoRoot, "data/samples");
  const round = loadRoundConfig(samples);
  const takesDir = join(samples, VOICE_SELECTOR_BATCH, "takes");

  console.log(
    `voice selector: round ${round.roundId} (${round.intentLabel}) — ${round.candidates.length} candidates × ${round.probes.length} probes`,
  );

  let minted = 0;
  let skipped = 0;
  let failed = 0;

  for (const probe of round.probes) {
    const slug = probeSlug(probe);
    for (const cand of round.candidates) {
      const outPath = join(takesDir, probeTakeFilename(slug, cand.id));
      if (!force && existsSync(outPath)) {
        skipped++;
        continue;
      }
      try {
        const r = await mintVoiceSelectorProbe({
          slug,
          spokenText: probe,
          candidateId: cand.id,
          voiceId: cand.voice_id,
          samplesRoot: samples,
        });
        minted++;
        console.log(`minted ${probe} ${cand.id} -> ${r.relOut} (${r.bytes} B)`);
      } catch (err) {
        failed++;
        console.error(`FAIL ${probe} ${cand.id}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  console.log(`done (${VOICE_SELECTOR_BATCH}): minted=${minted}, skipped=${skipped}, failed=${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
