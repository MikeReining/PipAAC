// Source-map collector — Slice C: Gemini through the local `agy` CLI
// (installed via alln). No HTTP client here: agy is the engine's local app.
// A run only counts links when the event stream shows a web-search tool call
// fired — links printed without a search are model memory, not citations.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { parseAgyStream, extractMarkdownLinks } from "./serp.mjs";
import { linkRows, makeRow, assertInEvidence, slug } from "./rows.mjs";

const AGY_MODEL = "gemini-3.8-flash-medium";
const AGY_TIMEOUT_MS = 150_000;

function runAgy(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "agy",
      ["--print", prompt, "--model", AGY_MODEL, "--print-timeout", "120s", "--output-format", "stream-json"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(Object.assign(new Error("timed out"), { code: "TIMEOUT" }));
    }, AGY_TIMEOUT_MS);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(Object.assign(new Error(err.trim().slice(-300) || `agy exit ${code}`), { code: "EXIT" }));
    });
  });
}

export async function geminiPhrase(runDir, phrase, date, emit, notes) {
  const prompt = `${phrase}\n\nSearch the web first, then answer with links to the pages you found.`;
  const out = await runAgy(prompt);
  const { searched, response } = parseAgyStream(out);
  const file = path.join(runDir, `gemini-${slug(phrase)}.txt`);
  writeFileSync(file, `=== RAW STREAM ===\n${out}\n=== RESPONSE ===\n${response}\n`);
  const links = extractMarkdownLinks(response);
  const rows = links.length
    ? linkRows("Gemini", phrase, links, date)
    : [{ ...makeRow("Gemini", phrase, "", "", date), note: "no citations shown" }];
  if (!searched) notes.push(`gemini — "${phrase}": no web search performed`);
  if (!links.length) notes.push(`gemini — "${phrase}": no citations shown`);
  // Same proof as the browser engines: every emitted URL must be in the
  // saved artifact — re-extract from the written file.
  const savedLinks = new Set(extractMarkdownLinks(readFileSync(file, "utf8")).map((l) => l.url));
  assertInEvidence(rows, savedLinks, "gemini", phrase);
  emit(rows);
}
