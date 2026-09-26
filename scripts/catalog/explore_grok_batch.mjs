#!/usr/bin/env node
/**
 * Grok multi-take exploration: mint variation matrix → Whisper + acoustics → shortlist.
 *
 *   node scripts/catalog/explore_grok_batch.mjs --batch data/samples/batch-04-for
 *   node scripts/catalog/explore_grok_batch.mjs --batch data/samples/batch-04-for --phase score
 *   node scripts/catalog/explore_grok_batch.mjs --batch data/samples/batch-04-for --mint-max 10
 *
 * Layout:
 *   <batch>/recipes.json
 *   <batch>/takes/*.mp3
 *   <batch>/shortlist/*.mp3
 *   <batch>/exploration_report.json
 *   <batch>/manifest.json
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { buildGrokTtsBody, synthesizeGrokVoice } from "./grok_tts.mjs";
import { pickBestPerWord, scoreTake } from "./grok_exploration_score.mjs";
import { repoRoot } from "./paths.mjs";

function loadEnvOptional() {
  try {
    for (const line of readFileSync(join(repoRoot, ".env"), "utf8").split("\n")) {
      const m = /^([A-Z_]+)=(.+)$/.exec(line.trim());
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // rely on exported env
  }
}

function parseArgv(argv) {
  const out = {
    batch: null,
    phase: "all",
    mintMax: 10,
    dryRun: false,
    includeLegacy: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--batch") {
      out.batch = argv[i + 1];
      i += 1;
    } else if (arg === "--phase") {
      out.phase = argv[i + 1];
      i += 1;
    } else if (arg === "--mint-max") {
      out.mintMax = Number(argv[i + 1]);
      i += 1;
    } else if (arg === "--include-legacy") {
      out.includeLegacy = true;
    } else if (arg === "--dry-run") {
      out.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      out.help = true;
    }
  }
  return out;
}

const USAGE = `usage:
  node scripts/catalog/explore_grok_batch.mjs --batch data/samples/batch-04-for [--phase all|mint|score] [--mint-max 10] [--include-legacy]`;

export function expandRecipes(recipesDoc) {
  const defaults = recipesDoc.defaults ?? {};
  const rows = [];
  for (const wordEntry of recipesDoc.words ?? []) {
    for (const v of wordEntry.variations ?? []) {
      const body = { ...defaults, ...v.body };
      const file = `${wordEntry.slug}_${v.id}.mp3`;
      rows.push({
        word: wordEntry.word,
        slug: wordEntry.slug,
        variationId: v.id,
        file,
        body,
        recipe: wordEntry,
        spokenForGate: wordEntry.spokenForGate ?? wordEntry.word,
      });
    }
  }
  return rows;
}

async function transcribeGroq(apiKey, filePath) {
  const bytes = readFileSync(filePath);
  const form = new FormData();
  form.set("model", "whisper-large-v3-turbo");
  form.set("language", "en");
  form.set("response_format", "json");
  form.set("file", new Blob([bytes], { type: "audio/mpeg" }), basename(filePath));
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) return `FAIL ${res.status}`;
  const body = await res.json();
  return body.text ?? "";
}

export async function runExplore(argv, { stdout = console.log, stderr = console.error } = {}) {
  const args = parseArgv(argv);
  if (args.help || !args.batch) {
    stdout(USAGE);
    return args.help ? 0 : 1;
  }

  const batchDir = resolve(args.batch);
  const recipesPath = join(batchDir, "recipes.json");
  const takesDir = join(batchDir, "takes");
  const shortlistDir = join(batchDir, "shortlist");
  const reportPath = join(batchDir, "exploration_report.json");
  const manifestPath = join(batchDir, "manifest.json");

  mkdirSync(takesDir, { recursive: true });
  mkdirSync(shortlistDir, { recursive: true });

  const recipesDoc = JSON.parse(readFileSync(recipesPath, "utf8"));
  const planned = expandRecipes(recipesDoc);

  if (args.phase === "mint" || args.phase === "all") {
    loadEnvOptional();
    const apiKey = process.env.XAI_API_KEY?.trim();
    if (!apiKey && !args.dryRun) {
      stderr("XAI_API_KEY is not set");
      return 2;
    }
    let minted = 0;
    for (const row of planned) {
      const dest = join(takesDir, row.file);
      if (existsSync(dest) && !args.dryRun) continue;
      if (minted >= args.mintMax && !args.dryRun) {
        stdout(`mint cap ${args.mintMax} reached — re-run to continue`);
        break;
      }
      const body = buildGrokTtsBody(row.body.text, {
        voiceId: row.body.voice_id,
        language: row.body.language,
        speed: row.body.speed ?? 1,
        replace: row.body.replace ?? null,
      });
      if (args.dryRun) {
        stdout(`dry-run ${row.file} ${JSON.stringify(body)}`);
        minted += 1;
        continue;
      }
      const buf = await synthesizeGrokVoice(body, { apiKey });
      writeFileSync(dest, buf);
      stdout(`minted ${row.file} (${buf.length} bytes)`);
      minted += 1;
    }
  }

  if (args.phase === "score" || args.phase === "all") {
    loadEnvOptional();
    const groqKey = process.env.GROQ_API_KEY?.trim();
    if (!groqKey) {
      stderr("GROQ_API_KEY is not set — scoring acoustics only, whisper skipped");
    }

    const scored = [];
    const manifest = [];

    const candidates = [...planned];
    if (args.includeLegacy) {
      const legacyDir = join(repoRoot, "data/samples/batch-04");
      const legacyMap = [
        ["dont.mp3", "don't", "legacy_plain"],
        ["cant.mp3", "can't", "legacy_plain"],
        ["wont.mp3", "won't", "legacy_plain"],
        ["didnt.mp3", "didn't", "legacy_plain"],
        ["wind_ih.mp3", "wind", "legacy_ih"],
        ["wind_unrel.mp3", "wind", "legacy_unrel"],
      ];
      for (const [file, word, id] of legacyMap) {
        const p = join(legacyDir, file);
        if (!existsSync(p)) continue;
        const slug = word.replace(/'/g, "").replace(/[^a-z]/gi, "");
        candidates.push({
          word,
          slug,
          variationId: id,
          file: `legacy_${basename(file)}`,
          body: {},
          recipe: recipesDoc.words.find((w) => w.word === word) ?? { word },
          spokenForGate: word,
          legacyPath: p,
        });
      }
    }

    for (const row of candidates) {
      const filePath = row.legacyPath ?? join(takesDir, row.file);
      if (!existsSync(filePath)) continue;

      let whisperText = "";
      if (groqKey) {
        whisperText = await transcribeGroq(groqKey, filePath);
      }

      const result = scoreTake({
        word: row.word,
        recipe: row.recipe,
        filePath,
        whisperText,
        spokenForGate: row.spokenForGate,
      });

      const entry = {
        word: row.word,
        slug: row.slug,
        variationId: row.variationId,
        file: row.file,
        path: filePath,
        whisper: whisperText,
        score: result.score,
        notes: result.notes,
        durMs: result.acoustic?.durMs ?? null,
        tailBurst: result.acoustic?.burst?.burstDetected ?? null,
        pitchSlopeHz: result.acoustic?.metrics?.pitchSlopeHz ?? null,
        gate: result.acoustic?.gate?.outcome ?? null,
        body: row.body,
      };
      scored.push(entry);
      manifest.push({
        file: row.legacyPath ? row.file : join("takes", row.file),
        word: row.word,
        variation: row.variationId,
        text: row.body.text ?? null,
        replace: row.body.replace ?? null,
        speed: row.body.speed ?? 1,
        score: result.score,
        whisper: whisperText,
        notes: result.notes,
      });
      stdout(
        `${row.word}/${row.variationId}\tscore=${result.score}\t${whisperText ? `heard=${JSON.stringify(whisperText)}` : "no_whisper"}\t${result.notes.join(",")}`,
      );
    }

    const winners = pickBestPerWord(scored.filter((r) => r.score > -100));
    for (const w of winners) {
      const dest = join(shortlistDir, `${w.slug}_recommended.mp3`);
      copyFileSync(w.path, dest);
      stdout(`shortlist ${w.word} → ${basename(dest)} (${w.variationId}, score=${w.score})`);
    }

    const report = {
      schema: "pippaac.grok-exploration-report.v1",
      generatedAt: new Date().toISOString(),
      batchDir,
      scored,
      shortlist: winners.map((w) => ({
        word: w.word,
        variationId: w.variationId,
        source: w.path,
        shortlistFile: join("shortlist", `${w.slug}_recommended.mp3`),
        score: w.score,
        whisper: w.whisper,
        notes: w.notes,
      })),
    };
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    stdout(`\nreport: ${reportPath}`);
  }

  return 0;
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) {
  runExplore(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    },
  );
}
