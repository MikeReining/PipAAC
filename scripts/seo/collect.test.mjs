// Source-map collector tests — parser fixtures are small HTML/text written
// for the test, never a saved Google page (spec § Proof).

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { parseHTML } from "linkedom";

import { domainFor, pageTypeFor, destinationFor } from "./destination.mjs";
import { loadSeeds, playbookSeeds, checkSeeds, expandPhrases } from "./phrases.mjs";
import {
  extractSuggestions,
  extractSerp,
  extractChatGPT,
  detectWall,
  pageEvidence,
  evidenceLinks,
  parseAgyStream,
  extractMarkdownLinks,
} from "./serp.mjs";
import { renderRunNote, mergeMap, parseTableRows, domainDiff } from "./mapfile.mjs";
import { acquireLock, releaseLock } from "./collect.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const doc = (html) => parseHTML(`<html><body>${html}</body></html>`).document;

// --- destination rules: every row of the spec table -----------------------

test("destination: named competitors, longest name wins", () => {
  assert.equal(
    destinationFor({ question: "q", url: "https://a.example.com", title: "Proloquo2Go vs Proloquo" }),
    "/compare/proloquo2go",
  );
  assert.equal(
    destinationFor({ question: "q", url: "https://a.example.com/proloquo2go-review", title: "x" }),
    "/compare/proloquo2go",
  );
  assert.equal(
    destinationFor({ question: "q", url: "https://a.example.com", title: "touch chat symbols" }),
    "/compare/touchchat",
  );
  assert.equal(
    destinationFor({ question: "q", url: "https://a.example.com", title: "LAMP Words for Life" }),
    "/compare/lamp-words-for-life",
  );
  assert.equal(
    destinationFor({ question: "q", url: "https://a.example.com", title: "tdsnap review" }),
    "/compare/td-snap",
  );
  assert.equal(
    destinationFor({ question: "q", url: "https://a.example.com", title: "cough drop aac" }),
    "/compare/coughdrop",
  );
  assert.equal(
    destinationFor({ question: "q", url: "https://a.example.com", title: "Proloquo coaching app" }),
    "/compare/proloquo",
  );
});

test("destination: unmatched pages stay blank", () => {
  assert.equal(
    destinationFor({ question: "q", url: "https://tobiidynavox.com/eye-gaze-manual", title: "Eye-gaze guide" }),
    "",
  );
  assert.equal(destinationFor({ question: "best AAC app", url: "https://a.example.com/x", title: "list" }), "");
});

test("destination: pricing/SLP/school rules only when no name matched", () => {
  assert.equal(
    destinationFor({ question: "AAC app without a subscription", url: "https://a.example.com/x", title: "t" }),
    "/pricing",
  );
  assert.equal(
    destinationFor({ question: "free AAC app", url: "https://a.example.com", title: "Proloquo2Go pricing" }),
    "/compare/proloquo2go",
  );
  assert.equal(
    destinationFor({ question: "q", url: "https://a.example.com", title: "tools for speech therapists" }),
    "/slps",
  );
  assert.equal(
    destinationFor({ question: "q", url: "https://a.example.com", title: "AAC for the classroom" }),
    "/schools",
  );
});

test("page type: spec hosts only", () => {
  assert.equal(pageTypeFor("https://www.reddit.com/r/aac/x"), "forum");
  assert.equal(pageTypeFor("https://youtu.be/abc"), "video");
  assert.equal(pageTypeFor("https://en.wikipedia.org/wiki/Augmentative"), "other");
  assert.equal(pageTypeFor("https://apps.apple.com/app/id1"), "directory");
  assert.equal(pageTypeFor("https://play.google.com/store/apps/x"), "directory");
  assert.equal(pageTypeFor("https://blog.example.com/post"), "");
});

test("domain: lowercase host, no leading www", () => {
  assert.equal(domainFor("https://WWW.Example.COM/path"), "example.com");
  assert.equal(domainFor("not a url"), "");
});

// --- parser fixtures --------------------------------------------------------

const SERP_HTML = `
<div id="search">
  <div class="g"><a href="https://example.org/best-aac"><h3>Best AAC apps 2026</h3></a></div>
  <div data-text-ad><a href="https://ad.example.com/buy"><h3>Sponsored pick</h3></a></div>
  <div class="g"><a href="https://www.reddit.com/r/aac/comments/1"><h3>reddit thread</h3></a></div>
  <a href="https://support.google.com/chrome/answer/1"><h3>google help</h3></a>
</div>
<div data-attrid="AIOverview"><p>summary</p><a href="https://cited.example.com/src">source</a></div>
<div><h2>People also ask</h2><div class="related-question-pair">is proloquo2go free</div></div>
<div><h2>Related searches</h2><a href="/search?q=aac+devices">aac devices</a><a href="/search?q=free+aac">free aac app</a></div>`;

test("parser: organic rows skip sponsored and google chrome", () => {
  const serp = extractSerp(doc(SERP_HTML));
  assert.deepEqual(
    serp.organic.map((r) => r.url),
    ["https://example.org/best-aac", "https://www.reddit.com/r/aac/comments/1"],
  );
  assert.equal(serp.organic[0].title, "Best AAC apps 2026");
  assert.deepEqual(serp.peopleAlsoAsk, ["is proloquo2go free"]);
  assert.deepEqual(serp.related, ["aac devices", "free aac app"]);
});

test("parser: AI overview links, and null when the box is absent", () => {
  assert.deepEqual(
    extractSerp(doc(SERP_HTML)).aiOverview.map((r) => r.url),
    ["https://cited.example.com/src"],
  );
  const noAi = extractSerp(doc(`<div id="search"><a href="https://x.example.com"><h3>t</h3></a></div>`));
  assert.equal(noAi.aiOverview, null);
});

test("parser: suggestion dropdown", () => {
  const d = doc(`<ul role="listbox"><li><div role="option">best aac app for ipad</div></li><li><div role="option">proloquo2go alternative</div></li></ul>`);
  assert.deepEqual(extractSuggestions(d), ["best aac app for ipad", "proloquo2go alternative"]);
});

test("parser: chatgpt citations are anchors, not prose", () => {
  const d = doc(`
    <div data-message-author-role="assistant"><p>see <b>prose.example.com</b></p>
      <a href="https://understood.example.org/aac">understood</a>
      <sup><a href="https://shop.example.com/x">1</a></sup></div>
    <div data-testid="sources-panel"><a href="https://panel.example.com/p">panel</a></div>
    <a href="https://chatgpt.com/c/abc">internal</a>`);
  assert.deepEqual(
    extractChatGPT(d).map((r) => r.url),
    ["https://understood.example.org/aac", "https://shop.example.com/x", "https://panel.example.com/p"],
  );
});

test("parser: walls and evidence", () => {
  const clean = doc(`<a href="https://a.example.com/x">t</a>`);
  assert.equal(detectWall(clean, "https://www.google.com/search?q=x"), null);
  assert.equal(detectWall(clean, "https://consent.google.com/m?x"), "consent");
  assert.equal(detectWall(clean, "https://www.google.com/sorry/index"), "captcha");
  assert.equal(detectWall(clean, "https://auth.openai.com/log-in"), "login");

  const evidence = pageEvidence(clean);
  assert.deepEqual([...evidenceLinks(evidence)], ["https://a.example.com/x"]);
});

// --- seeds and expansion ----------------------------------------------------

test("seeds: json matches the playbook's buyer questions", () => {
  const seeds = loadSeeds(path.join(ROOT, "docs/strategy/seo/buyer-questions.json"));
  const docSeeds = playbookSeeds(readFileSync(path.join(ROOT, "docs/strategy/SEO_Playbook.md"), "utf8"));
  assert.deepEqual(docSeeds.length, 7);
  assert.equal(checkSeeds(seeds, docSeeds).ok, true);
  assert.equal(checkSeeds([...seeds, "extra phrase"], docSeeds).ok, false);
  assert.equal(checkSeeds(seeds.slice(1), docSeeds).ok, false);
});

test("expansion: dedupe, cap 18 extras, count-then-order", () => {
  const seeds = ["s1", "s2"];
  const extrasPerSeed = [
    ["a", "B", "dup1", ...Array.from({ length: 30 }, (_, i) => `x${i}`)],
    ["a", "b", "dup2"],
  ];
  const { phrases, extras, dropped } = expandPhrases(seeds, extrasPerSeed);
  assert.equal(phrases[0], "s1");
  assert.ok(extras.includes("a") && extras.includes("B"));
  assert.equal(extras.length, 18);
  assert.equal(phrases.length, 20);
  assert.ok(dropped.length > 0);
  // "a" and "b" appeared under both seeds — kept ahead of single-seed phrases
  assert.deepEqual(extras.slice(0, 3), ["a", "B", "dup1"]);
});

// --- map file ---------------------------------------------------------------

test("map: append-only merge protects person-edited cells", () => {
  const existing = [
    "# Source map",
    "",
    "| question | engine | url | domain | page type | realistic | destination | checked |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    "| q1 | Google | https://a.example.com/ | a.example.com |  | Yes | /pricing | 2026-09-01 |",
    "",
  ].join("\n");
  const { text, added } = mergeMap(existing, [
    { question: "q1", engine: "Google", url: "https://a.example.com/", domain: "a.example.com", pageType: "", realistic: "", destination: "", checked: "2026-10-06" },
    { question: "q1", engine: "Google", url: "https://b.example.com/", domain: "b.example.com", pageType: "forum", realistic: "", destination: "/slps", checked: "2026-10-06" },
    { question: "q1", engine: "ChatGPT", url: "", domain: "", pageType: "", realistic: "", destination: "", checked: "2026-10-06" },
  ]);
  assert.equal(added.length, 1);
  assert.match(text, /Yes \| \/pricing \| 2026-09-01/);
  assert.match(text, /b\.example\.com \| forum \|  \| \/slps \| 2026-10-06/);
  assert.equal(parseTableRows(text).length, 2);
});

test("run note and domain diff", () => {
  const note = renderRunNote({
    date: "2026-10-06",
    seeds: ["s1"],
    phrases: ["s1", "extra1"],
    dropped: ["dropped1"],
    rows: [{ question: "s1", engine: "Google", url: "https://a.example.com/", domain: "a.example.com", pageType: "", realistic: "", destination: "", checked: "2026-10-06" }],
    notes: ["gemini: engine not available"],
  });
  assert.match(note, /## Dropped phrases\n\n- dropped1/);
  assert.match(note, /gemini: engine not available/);
  const diff = domainDiff(note, [{ domain: "new.example.com" }]);
  assert.deepEqual(diff, { added: ["new.example.com"], gone: ["a.example.com"] });
});

// --- gemini (agy CLI) --------------------------------------------------------

const AGY_STREAM = [
  '{"event":"init","init":{"model":"gemini-3.8-flash-medium"}}',
  '{"event":"step_update","step_update":{"step_index":2,"state":"DONE","step_type":"tool","tool_name":"search_web","tool_info":{"name":"search_web","parameters":{"query":"best AAC app for iPad"}}}}',
  '{"event":"result","result":{"status":"SUCCESS","response":"Top picks: [TouchChat](https://touchchatapp.com/) and [Proloquo2Go](https://www.assistiveware.com/products/proloquo2go)."}}',
].join("\n");

test("gemini: stream parse finds the search call and the response", () => {
  const { searched, response } = parseAgyStream(AGY_STREAM);
  assert.equal(searched, true);
  assert.match(response, /TouchChat/);
  const links = extractMarkdownLinks(response);
  assert.deepEqual(
    links.map((l) => l.url),
    ["https://touchchatapp.com/", "https://www.assistiveware.com/products/proloquo2go"],
  );
});

test("gemini: no search call means no citations count", () => {
  const { searched } = parseAgyStream(
    '{"event":"result","result":{"response":"I think Proloquo2Go is good."}}',
  );
  assert.equal(searched, false);
});

// --- lock and cli -----------------------------------------------------------

test("lock: second overlapping run is refused and names the lock", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "seo-lock-"));
  const lockFile = path.join(dir, "collect.lock");
  const sleeper = spawn("sleep", ["30"], { detached: true, stdio: "ignore" });
  try {
    writeFileSync(lockFile, `${sleeper.pid} ${new Date().toISOString()}\n`);
    const second = acquireLock(dir, lockFile);
    assert.equal(second.ok, false);
    assert.ok(second.holder.includes(String(sleeper.pid)));
    releaseLock(lockFile);
    assert.equal(acquireLock(dir, lockFile).ok, true);
    // a dead holder's lock is reclaimed
    releaseLock(lockFile);
    writeFileSync(lockFile, "99999999 stale\n");
    assert.equal(acquireLock(dir, lockFile).ok, true);
  } finally {
    sleeper.kill("SIGKILL");
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli: --dry-run prints the seeds and never opens a browser", () => {
  const r = spawnSync(process.execPath, ["scripts/seo/collect.mjs", "--dry-run"], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(r.status, 0, r.stderr);
  for (const s of loadSeeds(path.join(ROOT, "docs/strategy/seo/buyer-questions.json"))) {
    assert.ok(r.stdout.includes(s), s);
  }
});

// --- source scan: no API endpoints anywhere under scripts/seo ---------------

test("source scan: no paid/API endpoints in scripts/seo", () => {
  const forbidden = [
    ["suggest", "queries"],
    ["serp", "api"],
    ["ser", "per"],
    ["api.", "openai"],
    ["generative", "language"],
    ["api.", "perplexity"],
  ].map((p) => p.join(""));
  const dir = path.join(ROOT, "scripts/seo");
  for (const f of readdirSync(dir)) {
    const src = readFileSync(path.join(dir, f), "utf8");
    for (const token of forbidden) {
      assert.ok(!src.includes(token), `${f} must not mention ${token}`);
    }
  }
});
