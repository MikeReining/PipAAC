#!/usr/bin/env node
/**
 * Extended art review lane — one image, keyboard shortcuts, no paid API.
 *
 *   npm run art:review
 *   open http://127.0.0.1:21188/
 *
 *   ↑ / ↓ or j / k — previous / next (no decision)
 *   A — approve (keeps PNG, records in review.json)
 *   R — reject (moves PNG to out/extended_art/rejected/, records reject)
 *
 * Queue: every out/extended_art/<id>.png not yet in review.json.
 * Metadata from the latest line in results.jsonl for that id.
 */
import { createServer } from "node:http";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { computeCoreGaps } from "./art_gaps.mjs";
import { loadGlyphWords } from "./gen.mjs";
import { repoRoot, DEFAULT_LEXICON_PATH } from "../catalog/paths.mjs";

export const ART_REVIEW_PORT = Number(process.env.PIP_ART_REVIEW_PORT) || 21188;
export const OUT = join(repoRoot, "out/extended_art");
export const REVIEW_PATH = join(OUT, "review.json");
export const REJECTED_DIR = join(OUT, "rejected");
export const RESULTS_PATH = join(OUT, "results.jsonl");

const SYMBOLS_ROOT = join(repoRoot, "assets/symbols");
const ID_RE = /^[a-z0-9_]+$/;

export function readReview(path = REVIEW_PATH) {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

export function writeReview(review, path = REVIEW_PATH) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(review, null, 1));
}

/** Latest results.jsonl row per id. */
export function loadResultsMeta(resultsPath = RESULTS_PATH) {
  /** @type {Map<string, { label?: string, section?: string, spec?: object }>} */
  const meta = new Map();
  if (!existsSync(resultsPath)) return meta;
  for (const line of readFileSync(resultsPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row?.id) meta.set(row.id, row);
    } catch {
      // skip bad line
    }
  }
  return meta;
}

/** Launch words still missing assets/symbols/ (slug = id with underscores as spaces). */
export function launchMissingSlugs() {
  if (!existsSync(DEFAULT_LEXICON_PATH)) return new Set();
  const lexicon = JSON.parse(readFileSync(DEFAULT_LEXICON_PATH, "utf8"));
  const gaps = computeCoreGaps(lexicon, SYMBOLS_ROOT, loadGlyphWords());
  const slugs = new Set();
  for (const m of gaps.missing) {
    if (m.note) continue;
    slugs.add(m.spokenText.toLowerCase().replace(/\s+/g, "_"));
  }
  return slugs;
}

/**
 * @param {string} outDir
 * @param {Record<string, string>} review
 * @param {Map<string, object>} resultsMeta
 * @param {Set<string>} launchSlugs
 */
export function buildPendingQueue(outDir, review, resultsMeta, launchSlugs) {
  if (!existsSync(outDir)) return [];
  const ids = readdirSync(outDir)
    .filter((f) => f.endsWith(".png"))
    .map((f) => f.slice(0, -4))
    .filter((id) => ID_RE.test(id) && !review[id])
    .sort((a, b) => a.localeCompare(b));

  return ids.map((id) => {
    const row = resultsMeta.get(id) ?? {};
    const mode = row.spec?.entity_mode ?? null;
    return {
      id,
      label: row.label ?? id.replace(/_/g, " "),
      section: row.section ?? "",
      entityMode: mode,
      launchCandidate: launchSlugs.has(id),
    };
  });
}

export function rejectArt(id, outDir = OUT, rejectedDir = REJECTED_DIR, reviewPath = REVIEW_PATH) {
  if (!ID_RE.test(id)) throw new Error("invalid id");
  const src = join(outDir, `${id}.png`);
  if (!existsSync(src)) throw new Error(`missing ${id}.png`);
  mkdirSync(rejectedDir, { recursive: true });
  const dest = join(rejectedDir, `${id}.png`);
  if (existsSync(dest)) {
    renameSync(src, join(rejectedDir, `${id}.${Date.now()}.png`));
  } else {
    renameSync(src, dest);
  }
  const review = readReview(reviewPath);
  review[id] = "reject";
  writeReview(review, reviewPath);
}

export function approveArt(id, reviewPath = REVIEW_PATH) {
  if (!ID_RE.test(id)) throw new Error("invalid id");
  const review = readReview(reviewPath);
  review[id] = "approve";
  writeReview(review, reviewPath);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Extended art review</title>
<style>
  :root { --bg: #0f172a; --panel: #1e293b; --text: #e2e8f0; --muted: #94a3b8; --ok: #22c55e; --bad: #ef4444; --accent: #38bdf8; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--text); font: 15px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  header { display: flex; flex-wrap: wrap; gap: 12px 20px; align-items: center; padding: 14px 20px; background: var(--panel); border-bottom: 1px solid #334155; }
  header b { font-size: 17px; }
  .pill { font-size: 12px; padding: 3px 8px; border-radius: 6px; background: #334155; color: var(--muted); }
  .pill.launch { background: #422006; color: #fcd34d; }
  main { display: grid; grid-template-columns: 1fr 280px; gap: 20px; padding: 20px; max-width: 1100px; margin: 0 auto; }
  @media (max-width: 800px) { main { grid-template-columns: 1fr; } }
  .stage { background: #fff; border-radius: 16px; padding: 24px; display: flex; align-items: center; justify-content: center; min-height: 320px; border: 1px solid #475569; }
  .stage img { max-width: 100%; max-height: 280px; object-fit: contain; }
  .motor { margin-top: 12px; display: flex; align-items: center; gap: 12px; color: var(--muted); font-size: 13px; }
  .motor-box { width: 48px; height: 48px; background: #fff; border: 1px solid #475569; border-radius: 8px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .motor-box img { width: 48px; height: 48px; object-fit: contain; }
  aside { background: var(--panel); border-radius: 12px; padding: 16px; border: 1px solid #334155; }
  aside h2 { margin: 0 0 8px; font-size: 22px; color: var(--accent); word-break: break-word; }
  aside .meta { font-size: 13px; color: var(--muted); margin-bottom: 16px; }
  aside kbd { background: #0f172a; padding: 2px 6px; border-radius: 4px; font-size: 12px; border: 1px solid #475569; }
  .actions { display: flex; flex-direction: column; gap: 10px; }
  button { font: inherit; cursor: pointer; border: none; border-radius: 10px; padding: 12px 16px; font-weight: 600; }
  .approve { background: var(--ok); color: #052e16; }
  .reject { background: var(--bad); color: #450a0a; }
  .nav { background: #334155; color: var(--text); }
  #flash { min-height: 1.2em; font-size: 13px; color: var(--accent); margin-top: 12px; }
  .empty { padding: 40px; text-align: center; color: var(--muted); }
</style>
</head>
<body>
<header>
  <b>Extended art review</b>
  <span class="pill" id="count">…</span>
  <span class="pill" id="stats">…</span>
  <span class="pill launch" id="launchTag" hidden>Launch catalog candidate</span>
</header>
<main id="main">
  <div>
    <div class="stage"><img id="hero" alt="" /></div>
    <div class="motor"><span>48px motor target</span><div class="motor-box"><img id="mini" alt="" /></div></div>
  </div>
  <aside>
    <h2 id="label">…</h2>
    <div class="meta" id="meta"></div>
    <div class="actions">
      <button type="button" class="approve" id="btnA">Approve (A)</button>
      <button type="button" class="reject" id="btnR">Reject (R)</button>
      <button type="button" class="nav" id="btnPrev">Previous (↑ / k)</button>
      <button type="button" class="nav" id="btnNext">Next (↓ / j)</button>
    </div>
    <p id="flash"></p>
    <p style="font-size:12px;color:var(--muted);margin:16px 0 0">Reject moves the PNG to <code>rejected/</code>. Approve keeps it for extended or launch promotion later.</p>
  </aside>
</main>
<script>
let queue = [], index = 0, stats = { approve: 0, reject: 0 };

function imgUrl(id) { return "/img/" + encodeURIComponent(id) + ".png?t=" + Date.now(); }

function render() {
  const launchTag = document.getElementById("launchTag");
  if (!queue.length) {
    document.getElementById("main").innerHTML = '<div class="empty"><h2>Queue empty</h2><p>All PNGs in out/extended_art/ are reviewed, or none remain.</p></div>';
    document.getElementById("count").textContent = "0 left";
    return;
  }
  index = Math.max(0, Math.min(index, queue.length - 1));
  const it = queue[index];
  document.getElementById("count").textContent = (queue.length - index) + " left · " + (index + 1) + " / " + queue.length;
  document.getElementById("stats").textContent = stats.approve + " approved · " + stats.reject + " rejected (session)";
  document.getElementById("label").textContent = it.label;
  document.getElementById("meta").textContent = [it.section, it.entityMode].filter(Boolean).join(" · ") || it.id;
  launchTag.hidden = !it.launchCandidate;
  document.getElementById("hero").src = imgUrl(it.id);
  document.getElementById("mini").src = imgUrl(it.id);
}

async function refresh() {
  const r = await (await fetch("/api/queue")).json();
  queue = r.items;
  stats = r.stats;
  if (r.index != null) index = r.index;
  render();
}

async function decide(decision) {
  if (!queue.length) return;
  const it = queue[index];
  const r = await fetch("/api/decide", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: it.id, decision }),
  });
  if (!r.ok) {
    document.getElementById("flash").textContent = await r.text();
    return;
  }
  const body = await r.json();
  stats = body.stats;
  queue = body.items;
  document.getElementById("flash").textContent = decision === "approve" ? "Approved " + it.label : "Rejected — moved to rejected/";
  if (index >= queue.length) index = Math.max(0, queue.length - 1);
  render();
}

document.getElementById("btnA").onclick = () => decide("approve");
document.getElementById("btnR").onclick = () => decide("reject");
document.getElementById("btnPrev").onclick = () => { index--; render(); };
document.getElementById("btnNext").onclick = () => { index++; render(); };

document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea")) return;
  const k = e.key.toLowerCase();
  if (k === "a") { e.preventDefault(); decide("approve"); }
  else if (k === "r") { e.preventDefault(); decide("reject"); }
  else if (e.key === "ArrowUp" || k === "k") { e.preventDefault(); index--; render(); }
  else if (e.key === "ArrowDown" || k === "j") { e.preventDefault(); index++; render(); }
});

refresh();
</script>
</body>
</html>`;

function reviewStats(review) {
  let approve = 0;
  let reject = 0;
  for (const v of Object.values(review)) {
    if (v === "approve") approve++;
    else if (v === "reject") reject++;
  }
  return { approve, reject };
}

function startServer(port = ART_REVIEW_PORT) {
  mkdirSync(OUT, { recursive: true });
  const launchSlugs = launchMissingSlugs();

  createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    try {
      if (url.pathname === "/" || url.pathname === "/index.html") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(HTML);
        return;
      }
      if (url.pathname === "/api/queue") {
        const review = readReview();
        const meta = loadResultsMeta();
        const items = buildPendingQueue(OUT, review, meta, launchSlugs);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ items, stats: reviewStats(review), index: 0 }));
        return;
      }
      if (url.pathname.startsWith("/img/")) {
        const raw = decodeURIComponent(url.pathname.slice(5)).replace(/\\/g, "");
        if (!/^[\w.]+\.png$/.test(raw)) {
          res.writeHead(400).end();
          return;
        }
        const file = join(OUT, raw);
        if (!existsSync(file)) {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
        res.end(readFileSync(file));
        return;
      }
      if (url.pathname === "/api/decide" && req.method === "POST") {
        const body = await readBody(req);
        const { id, decision } = body;
        if (!ID_RE.test(id) || !["approve", "reject"].includes(decision)) {
          res.writeHead(400).end("bad request");
          return;
        }
        if (decision === "reject") rejectArt(id);
        else approveArt(id);
        const review = readReview();
        const meta = loadResultsMeta();
        const items = buildPendingQueue(OUT, review, meta, launchSlugs);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ items, stats: reviewStats(review) }));
        return;
      }
      res.writeHead(404).end();
    } catch (err) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(err instanceof Error ? err.message : String(err));
    }
  }).listen(port, "127.0.0.1", () => {
    console.log(`Extended art review: http://127.0.0.1:${port}/`);
    console.log("Keys: ↑/↓ or j/k navigate · A approve · R reject (moves PNG to rejected/)");
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = process.argv.includes("--port")
    ? Number(process.argv[process.argv.indexOf("--port") + 1])
    : ART_REVIEW_PORT;
  startServer(port);
}
