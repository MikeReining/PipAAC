#!/usr/bin/env node
/**
 * One-time: mint run manifest for launch gap batch (slots 688+) already published 2026-09-29.
 */

import { writeMintRun } from "./elevenlabs_mint_run.mjs";
import { loadShippingDoc } from "./tile_catalog_lookup.mjs";
import { catalogSlug } from "./elevenlabs_tile_variations.mjs";

const doc = loadShippingDoc();
const items = Object.entries(doc.bySlug ?? {})
  .map(([slug, row]) => ({ slug, ...row }))
  .filter((row) => row.slot >= 688)
  .sort((a, b) => a.slot - b.slot)
  .map((row) => ({
    slot: row.slot,
    spokenText: row.spokenText,
    slug: row.slug ?? catalogSlug(row.spokenText),
    publishedAt: row.publishedAt ?? null,
    review: row.publishedAt ? "published_before_run_ui" : null,
  }));

const run = writeMintRun({
  runId: "gap-launch-food-2026-09-29",
  label: "Launch food/drink gaps (32) — Pip",
  note: "Retroactive manifest for spot-check; clips were mint+published before mint-run UI existed.",
  items,
});

console.log(`Wrote mint run ${run.runId} (${run.items.length} items)`);
