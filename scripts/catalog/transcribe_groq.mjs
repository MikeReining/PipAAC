#!/usr/bin/env node
/**
 * Whisper intelligibility check via Groq (founder QA, not naturalness).
 * Uses GROQ_API_KEY from the environment — never reads .env from disk.
 *
 *   node scripts/catalog/transcribe_groq.mjs data/samples/batch-04/dont_trim.mp3
 */

import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

async function transcribe(apiKey, filePath) {
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
  if (!res.ok) return { file: filePath, text: `FAIL ${res.status}`, ok: false };
  const body = await res.json();
  return { file: filePath, text: body.text ?? "", ok: true };
}

async function main() {
  const files = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  if (files.length === 0) {
    console.log("usage: node scripts/catalog/transcribe_groq.mjs <file.mp3> ...");
    process.exit(1);
  }
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    console.error("GROQ_API_KEY is not set");
    process.exit(2);
  }
  for (const file of files) {
    const r = await transcribe(apiKey, resolve(file));
    console.log(`HEARD ${basename(r.file)}\t${JSON.stringify(r.text)}`);
  }
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
