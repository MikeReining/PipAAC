#!/usr/bin/env node
/**
 * 028 slice 7 (the free half) — register existing catalog clips as
 * tile-ledger rows so a typed word identical to a catalog utterance
 * hits shipped audio instead of minting. No vendor calls, no spend.
 *
 *   npm run tilevoice:seed-catalog -- --dry-run   # counts only
 *   npm run tilevoice:seed-catalog              # posts to the Worker
 *
 * Env (from .env): PIP_TILE_ADMIN_URL, PIP_ADMIN_TOKEN.
 * The DO derives each row's id — scripts never recompute the recipe.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

for (const line of readFileSync(path.join(repoRoot, ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const CATALOG = path.join(repoRoot, "data/catalog/catalog.json");

/** Ready bundled-voice clips → seed rows {voice_key, locale, text, r2_key}. */
export function catalogSeedRows(catalog) {
  const voices = new Map(catalog.voices.map((v) => [v.id, v]));
  const utterances = new Map(catalog.utterances.map((u) => [u.id, u]));
  const rows = [];
  const seen = new Set();
  for (const clip of catalog.clips ?? []) {
    if (clip.status !== "ready") continue;
    const voice = voices.get(clip.voice_id);
    if (!voice || voice.source !== "bundled") continue;
    const utt = utterances.get(clip.utterance_id);
    const text = utt?.normalized_spoken_text ?? utt?.spoken_text ?? clip.recorded_text;
    if (!text) continue;
    const key = `${clip.voice_id}|${utt?.locale ?? "en"}|${text}`;
    if (seen.has(key)) continue; // one clip per (voice, locale, text)
    seen.add(key);
    rows.push({
      voice_key: clip.voice_id, locale: utt?.locale ?? "en",
      text, r2_key: clip.key,
    });
  }
  return rows;
}

async function seed(base, rows) {
  let inserted = 0, skipped = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const res = await fetch(`${base}/admin/v1/tile-voice/seed`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.PIP_ADMIN_TOKEN ?? ""}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ rows: rows.slice(i, i + 200) }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(`seed batch ${i}: ${res.status} ${body?.error ?? "?"}`);
    }
    inserted += body.inserted ?? 0;
    skipped += body.skipped ?? 0;
  }
  return { inserted, skipped };
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  try {
    const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));
    const rows = catalogSeedRows(catalog);
    console.log(`catalog clips → ${rows.length} seed rows (deduped by voice|locale|text)`);
    if (process.argv.includes("--dry-run")) {
      for (const r of rows.slice(0, 5)) console.log(`  ${r.r2_key}  ←  "${r.text}"`);
      process.exit(0);
    }
    const base = (process.env.PIP_TILE_ADMIN_URL ?? "").replace(/\/+$/, "");
    if (!base) throw new Error("PIP_TILE_ADMIN_URL unset — point it at a Worker in .env");
    const { inserted, skipped } = await seed(base, rows);
    console.log(`seeded ${inserted} rows, skipped ${skipped} (existing rows kept)`);
  } catch (e) {
    console.error(`seed: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}
