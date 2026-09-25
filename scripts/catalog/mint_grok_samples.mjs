#!/usr/bin/env node
/**
 * Mint Grok TTS clips for rows in a sample-batch manifest (founder-run only).
 * Uses XAI_API_KEY from the environment — never reads .env from disk.
 *
 *   node scripts/catalog/mint_grok_samples.mjs --dir data/samples/batch-04 --only dont_unrel.mp3
 *   node scripts/catalog/mint_grok_samples.mjs --dir data/samples/batch-04 --note "unreleased final stop"
 */

import { readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { buildGrokTtsBody, synthesizeGrokVoice } from "./grok_tts.mjs";

function parseArgv(argv) {
  const out = { dir: null, only: [], note: null, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dir") {
      out.dir = argv[i + 1];
      i += 1;
    } else if (arg === "--only") {
      out.only.push(argv[i + 1]);
      i += 1;
    } else if (arg === "--note") {
      out.note = argv[i + 1];
      i += 1;
    } else if (arg === "--dry-run") {
      out.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      out.help = true;
    }
  }
  return out;
}

const USAGE = `usage:
  node scripts/catalog/mint_grok_samples.mjs --dir BATCH_DIR [--only file.mp3 ...] [--note "substring"]
  Requires XAI_API_KEY in the environment.`;

async function mintOne(apiKey, row, outPath, dryRun) {
  const body = buildGrokTtsBody(row.text ?? row.word, {
    voiceId: row.voice_id ?? "ara",
    language: row.language ?? "en",
    speed: row.speed ?? 1,
    replace: row.replace ?? null,
  });
  if (dryRun) {
    console.log(`dry-run ${basename(outPath)}`, JSON.stringify(body));
    return null;
  }
  const buf = await synthesizeGrokVoice(body, { apiKey });
  writeFileSync(outPath, buf);
  return buf.length;
}

async function main() {
  const args = parseArgv(process.argv.slice(2));
  if (args.help || !args.dir) {
    console.log(USAGE);
    process.exit(args.help ? 0 : 1);
  }
  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey && !args.dryRun) {
    console.error("XAI_API_KEY is not set");
    process.exit(2);
  }
  const dir = resolve(args.dir);
  const manifestPath = join(dir, "manifest.json");
  const rows = JSON.parse(readFileSync(manifestPath, "utf8"));
  const only = new Set(args.only);
  const targets = rows.filter((row) => {
    if (!row?.file || !row?.text) return false;
    if (only.size > 0 && !only.has(row.file)) return false;
    if (args.note && !String(row.note ?? "").includes(args.note)) return false;
    return true;
  });
  if (targets.length === 0) {
    console.error("no manifest rows matched");
    process.exit(1);
  }
  const byFile = new Map(rows.map((r) => [r.file, r]));
  for (const row of targets) {
    const outPath = join(dir, row.file);
    const bytes = await mintOne(apiKey, row, outPath, args.dryRun);
    if (bytes != null) {
      byFile.set(row.file, { ...row, bytes });
      console.log(`OK ${row.file} ${bytes}`);
    }
  }
  if (!args.dryRun) {
    writeFileSync(manifestPath, `${JSON.stringify([...byFile.values()], null, 2)}\n`);
  }
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
