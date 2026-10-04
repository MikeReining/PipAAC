#!/usr/bin/env node
/**
 * 042 — build the help index and the site FAQ from one source.
 *
 *   node scripts/help/build_help.mjs           # write outputs
 *   node scripts/help/build_help.mjs --check   # drift gate (check:fast)
 *
 * Inputs (the truth):
 *   src/help/answers.en.json — authored answers, grouped by topic.
 *   public/index.html        — every Settings row (label + hint text).
 *
 * Outputs (derived, never hand-edited):
 *   public/help.en.json  — {version, topics, answers, settings}. The app
 *     renders it and searches it on the device; the Worker embeds it for
 *     search by meaning (src/worker/help.js).
 *   site/public/faq.html — the `site: true` answers, between the
 *     help:start / help:end markers, plus the FAQPage JSON-LD.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { repoRoot } from "../catalog/paths.mjs";

const SRC = join(repoRoot, "src/help/answers.en.json");
const HTML = join(repoRoot, "public/index.html");
const OUT = join(repoRoot, "public/help.en.json");
const FAQ = join(repoRoot, "site/public/faq.html");

// The site's group order (money first: it's what a visitor asks first).
const SITE_ORDER = ["money", "yours", "start", "normal", "using", "team", "trust"];

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
const clean = (html) => html
  .replace(/<!--[\s\S]*?-->/g, " ")
  .replace(/<span data-person-cap><\/span>/g, "Your child")
  .replace(/<span data-person><\/span>/g, "your child")
  .replace(/<[^>]+>/g, " ")
  .replace(/&[a-z#0-9]+;/g, (e) => ENTITIES[e] ?? " ")
  .replace(/\s+/g, " ")
  .trim();

/** Every labelled Settings row: its page, label, hint text, and an
 *  element id inside the row (the row's own id, or the first control
 *  after the label) — the app finds the row by its label, then this. */
export function settingsRows(html) {
  const rows = [];
  const secRe = /<section class="set-sec[^"]*" data-sec="([a-z]+)" data-title="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g;
  for (const [, sec, title, body] of html.matchAll(secRe)) {
    if (sec === "results" || sec === "help") continue;
    // The page itself: its title and one-line intro.
    const intro = /<p class="set-intro[^"]*"[^>]*>([\s\S]*?)<\/p>/.exec(body);
    rows.push({ sec, title: clean(title), label: clean(title), text: intro ? clean(intro[1]) : "", at: null });
    const labels = [...body.matchAll(/class="seg-label[^"]*"[^>]*>([\s\S]*?)<\/(?:span|label)>/g)];
    labels.forEach((m, i) => {
      const label = clean(m[1]);
      if (!label) return;
      // A row ends at the next label or the next row, whichever is first.
      const nextLabel = labels[i + 1]?.index ?? body.length;
      const nextRow = body.slice(m.index).search(/<div class="(?:seg-row|set-quick)/);
      const seg = body.slice(m.index, nextRow < 0 ? nextLabel : Math.min(nextLabel, m.index + nextRow));
      const before = body.slice(0, m.index);
      const rowOpen = [...before.matchAll(/<div class="seg-row[^"]*"([^>]*)>/g)].at(-1);
      const rowId = rowOpen && /\bid="([^"]+)"/.exec(rowOpen[1])?.[1];
      const at = rowId ?? /\bid="([^"]+)"/.exec(seg)?.[1] ?? null;
      const hints = [...seg.matchAll(/<p class="(?:hint|set-intro)[^"]*"[^>]*>([\s\S]*?)<\/p>/g)]
        .map((h) => clean(h[1])).filter(Boolean);
      const buttons = [...seg.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)]
        .map((b) => clean(b[1])).filter((t) => t && t.length < 40);
      rows.push({ sec, title: clean(title), label, text: [...hints, ...buttons].join(" "), at });
    });
  }
  return rows;
}

export function buildIndex(src, html) {
  const topics = new Set(src.topics.map((t) => t.id));
  const ids = new Set();
  for (const a of src.answers) {
    if (!topics.has(a.topic)) throw new Error(`help: ${a.id} has unknown topic ${a.topic}`);
    if (ids.has(a.id)) throw new Error(`help: duplicate id ${a.id}`);
    ids.add(a.id);
    if (a.go?.at && !html.includes(`id="${a.go.at}"`)) {
      throw new Error(`help: ${a.id} points at #${a.go.at}, which index.html doesn't have`);
    }
    if (a.go && !html.includes(`data-sec="${a.go.sec}"`)) {
      throw new Error(`help: ${a.id} points at Settings page ${a.go.sec}, which doesn't exist`);
    }
  }
  const body = {
    topics: src.topics,
    answers: src.answers.map(({ id, topic, q, a, go }) => ({ id, topic, q, a, ...(go ? { go } : {}) })),
    settings: settingsRows(html),
  };
  const version = createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 12);
  return { version, ...body };
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function buildFaq(src, faqHtml) {
  const site = src.answers.filter((a) => a.site);
  const groups = SITE_ORDER
    .map((id) => ({ topic: src.topics.find((t) => t.id === id), items: site.filter((a) => a.topic === id) }))
    .filter((g) => g.items.length);
  const missing = site.filter((a) => !SITE_ORDER.includes(a.topic));
  if (missing.length) throw new Error(`help: site topic not in SITE_ORDER: ${missing[0].topic}`);
  const paras = (a) => a.split("\n\n").map((p) => `            <p>${esc(p)}</p>`).join("\n");
  const sections = groups.map(({ topic, items }) => [
    `        <h2 class="faq-group">${esc(topic.title)}</h2>`,
    ...(topic.intro ? [`        <p class="faq-intro">${esc(topic.intro)}</p>`] : []),
    `        <div class="faq">`,
    ...items.map((a) => [
      `          <details id="${a.id}">`,
      `            <summary>${esc(a.q)}</summary>`,
      paras(a.a),
      `          </details>`,
    ].join("\n")),
    `        </div>`,
  ].join("\n")).join("\n\n");
  const ld = {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: groups.flatMap((g) => g.items).map((a) => ({
      "@type": "Question", name: a.q,
      acceptedAnswer: { "@type": "Answer", text: a.a.replace(/\n\n/g, " ") },
    })),
  };
  const ldTag = `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`;
  let out = faqHtml.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, ldTag);
  const start = "<!-- help:start (generated by scripts/help/build_help.mjs from src/help/answers.en.json) -->";
  const re = /<!-- help:start[^>]*-->[\s\S]*?<!-- help:end -->/;
  if (!re.test(out)) throw new Error("help: faq.html has no help:start / help:end markers");
  out = out.replace(re, `${start}\n${sections}\n        <!-- help:end -->`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes("--check");
  const src = JSON.parse(readFileSync(SRC, "utf8"));
  const index = `${JSON.stringify(buildIndex(src, readFileSync(HTML, "utf8")))}\n`;
  const faq = buildFaq(src, readFileSync(FAQ, "utf8"));
  const outputs = [[OUT, index], [FAQ, faq]];
  const drift = outputs.filter(([path, text]) => {
    try { return readFileSync(path, "utf8") !== text; } catch { return true; }
  });
  if (check) {
    for (const [path] of drift) console.error(`help: stale ${path.slice(repoRoot.length + 1)} — run node scripts/help/build_help.mjs`);
    process.exit(drift.length ? 1 : 0);
  }
  for (const [path, text] of drift) writeFileSync(path, text);
  console.log(`help: ${drift.length ? drift.map(([p]) => p.slice(repoRoot.length + 1)).join(", ") : "up to date"}`);
}
