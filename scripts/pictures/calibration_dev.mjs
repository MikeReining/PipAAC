#!/usr/bin/env node
/**
 * 030 § 7 — picture-finder calibration page. Dev only — binds localhost.
 *
 *   npm run pictures:calibrate
 *   http://127.0.0.1:3757/picture-calibration
 *
 * Runs the real find pipeline (Jev + bge-m3 + Vectorize) through the
 * Worker's founder-only /admin/v1/pictures/find route against the
 * CALIBRATION index (includes pending extended art). Embedding calls are
 * Workers AI — no Muse calls exist on this path.
 *
 * Marks save beside the queries in data/pictures/calibration_queries.json;
 * the saved cutoffs/weights land in data/catalog/picture_finder.json.
 */
import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  adoptLabTake, askPlanner, composePrompt, labImagePath, labSpec,
  lintHint, lintSpecFit, listLabTakes, mintLabTake, setTakeVerdict,
  LAB_TAKES_DIR, PLANNER_MODELS,
} from "./lab.mjs";
import {
  listRuns, runTransformSuite, saveRun, setCellVerdict,
} from "../sentences/lab.mjs";
import { computeCoreGaps } from "../art/art_gaps.mjs";
import { loadGlyphWords } from "../art/gen.mjs";
import { plannerLane } from "../../src/shared/draw_prompt.mjs";
import { DEFAULT_LEXICON_PATH } from "../catalog/paths.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const QUERIES_PATH = join(repoRoot, "data/pictures/calibration_queries.json");
const FINDER_PATH = join(repoRoot, "data/catalog/picture_finder.json");
const CATALOG_PATH = join(repoRoot, "data/catalog/catalog.json");
const PAGE_PATH = join(repoRoot, "public/picture-calibration.html");
const DISAGREE_PAGE_PATH = join(repoRoot, "public/picture-disagreements.html");
const LAB_PAGE_PATH = join(repoRoot, "public/picture-lab.html");
const SENTENCE_LAB_PAGE_PATH = join(repoRoot, "public/sentence-lab.html");
const EXT_DIR = join(repoRoot, "out/extended_art");
const PUBLIC_DIR = join(repoRoot, "public");

const PORT = Number(process.env.PIP_PICTURE_CALIB_PORT) || 3757;
const BATCH = 25; // admin route caps at 50; smaller chunks stream progress

/* ------------------------------- helpers ------------------------------- */

function loadEnv() {
  for (const name of [".env", ".dev.vars"]) {
    try {
      for (const line of readFileSync(join(repoRoot, name), "utf8").split("\n")) {
        const m = /^([A-Z_]+)=(.+)$/.exec(line.trim());
        if (m && process.env[m[1]] === undefined) {
          process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
        }
      }
    } catch { /* optional */ }
  }
}

const readJson = (path, fallback) =>
  (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback);

const writeJson = (path, data) =>
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");

const json = (res, status, data) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
};

const readBody = (req) => new Promise((resolve) => {
  let buf = "";
  req.on("data", (c) => (buf += c));
  req.on("end", () => {
    try { resolve(JSON.parse(buf || "{}")); } catch { resolve(null); }
  });
});

/** A query row is identified by its text + description — the same pair the
 *  find pipeline embeds. mark: image_id of the right answer, or "none". */
export function applyMark(queries, { text, description = "", mark }) {
  const t = String(text ?? ""), d = String(description ?? "");
  if (!t || typeof mark !== "string" || !mark) return null;
  const row = queries.find((q) => q.text === t && (q.description ?? "") === d);
  if (!row) return null;
  if (mark === "none") row.mark = "none"; else row.mark = mark;
  return row;
}

/** Only the four § 7 fields the page owns; everything else in
 *  picture_finder.json survives a save untouched. */
export function mergeFinderConfig(cfg, patch) {
  const num = (v, min, max) =>
    (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null);
  const out = { ...cfg };
  const cutoff = num(patch?.auto_cutoff, 0, 2);
  if (cutoff === null) return null;
  out.auto_cutoff = cutoff;
  const byLang = {};
  for (const [lang, v] of Object.entries(patch?.auto_cutoff_by_lang ?? {})) {
    if (!/^[a-z]{2}$/.test(lang)) return null;
    if (v === null) continue;
    const n = num(v, 0, 2);
    if (n === null) return null;
    byLang[lang] = n;
  }
  out.auto_cutoff_by_lang = byLang;
  const pw = num(patch?.pick_weight, 0, 1), rw = num(patch?.reject_weight, 0, 1);
  if (pw === null || rw === null) return null;
  out.pick_weight = pw;
  out.reject_weight = rw;
  return out;
}

/** image_id → local file to show on the page. Extended art always lives in
 *  out/extended_art/ (published or pending); catalog under public/. */
export function localImagePath(imageId, catalogImages) {
  if (typeof imageId !== "string") return null;
  if (imageId.startsWith("ext_")) {
    const slug = imageId.slice(4);
    return /^[a-z0-9_]+$/.test(slug) ? join(EXT_DIR, `${slug}.png`) : null;
  }
  if (imageId.startsWith("img_")) {
    const key = catalogImages.get(imageId);
    return key ? join(PUBLIC_DIR, key) : null;
  }
  return null; // drw_* has no local file yet
}

/* ------------------------------- server -------------------------------- */

function buildHandler() {
  const catalog = readJson(CATALOG_PATH, { images: [] });
  const catalogImages = new Map(catalog.images.map((i) => [i.id, i.key]));

  return async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname;

    if (path === "/") {
      res.writeHead(302, { location: "/picture-calibration" });
      return res.end();
    }
    if (path === "/picture-calibration") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(readFileSync(PAGE_PATH));
    }
    // § 5.5 — the second tab: "where families disagreed with us".
    if (path === "/picture-disagreements") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(readFileSync(DISAGREE_PAGE_PATH));
    }
    // The lab tab: type any word → live find + draw spec + prompts → mint.
    if (path === "/picture-lab") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(readFileSync(LAB_PAGE_PATH));
    }
    // The sentence lab: a fragment → every wand mode × both models, timed.
    if (path === "/sentence-lab") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(readFileSync(SENTENCE_LAB_PAGE_PATH));
    }

    const adminProxy = async (method, workerPath, body = null) => {
      const base = (process.env.PIP_PICTURE_ADMIN_URL ?? "").replace(/\/+$/, "");
      const token = process.env.PIP_ADMIN_TOKEN ?? "";
      if (!base || !token) {
        return json(res, 503, {
          error: "no_worker",
          hint: "set PIP_PICTURE_ADMIN_URL + PIP_ADMIN_TOKEN (.env)",
        });
      }
      const r = await fetch(`${base}${workerPath}`, {
        method,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      }).catch(() => null);
      if (!r) return json(res, 502, { error: "worker_unreachable" });
      return json(res, r.status, r.status === 204 ? { ok: true } : await r.json());
    };

    if (path === "/api/disagreements" && req.method === "GET") {
      return adminProxy("GET", "/admin/v1/pictures/disagreements");
    }
    if (path === "/api/disagreement-action" && req.method === "POST") {
      const body = await readBody(req);
      const action = String(body?.action ?? "");
      if (!["pin", "unpin", "block", "unblock", "dismiss", "promote", "redraw"]
        .includes(action)) {
        return json(res, 400, { error: "bad_action" });
      }
      return adminProxy("POST", `/admin/v1/pictures/disagreements/${action}`, body);
    }

    if (path === "/api/state" && req.method === "GET") {
      return json(res, 200, {
        queries: readJson(QUERIES_PATH, { queries: [] }),
        config: readJson(FINDER_PATH, {}),
      });
    }

    if (path === "/api/find" && req.method === "POST") {
      const body = await readBody(req);
      const items = Array.isArray(body?.items) ? body.items : null;
      if (!items || !items.length || items.length > 50) {
        return json(res, 400, { error: "bad_items" });
      }
      const base = (process.env.PIP_PICTURE_ADMIN_URL ?? "").replace(/\/+$/, "");
      const token = process.env.PIP_ADMIN_TOKEN ?? "";
      if (!base || !token) {
        return json(res, 503, {
          error: "no_worker",
          hint: "set PIP_PICTURE_ADMIN_URL + PIP_ADMIN_TOKEN (.env)",
        });
      }
      const results = [];
      for (let i = 0; i < items.length; i += BATCH) {
        const r = await fetch(`${base}/admin/v1/pictures/find`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            index: "calibration",
            items: items.slice(i, i + BATCH),
          }),
        }).catch(() => null);
        if (!r?.ok) {
          return json(res, 502, {
            error: "worker_find_failed",
            status: r?.status ?? 0,
            detail: r ? (await r.text()).slice(0, 200) : "unreachable",
          });
        }
        results.push(...(await r.json()).results);
      }
      return json(res, 200, { results });
    }

    if (path === "/api/mark" && req.method === "POST") {
      const body = await readBody(req);
      const data = readJson(QUERIES_PATH, null);
      if (!data) return json(res, 500, { error: "queries_missing" });
      const row = applyMark(data.queries, {
        text: body?.text, description: body?.description, mark: body?.mark,
      });
      if (!row) return json(res, 400, { error: "bad_mark" });
      writeJson(QUERIES_PATH, data);
      return json(res, 200, { ok: true, row });
    }

    if (path === "/api/save" && req.method === "POST") {
      const body = await readBody(req);
      const cfg = readJson(FINDER_PATH, null);
      if (!cfg) return json(res, 500, { error: "config_missing" });
      const merged = mergeFinderConfig(cfg, body);
      if (!merged) return json(res, 400, { error: "bad_config" });
      writeJson(FINDER_PATH, merged);
      return json(res, 200, { ok: true, config: merged });
    }

    /* --------------------------- picture lab ---------------------------
       Type anything → the real find (calibration index) + Jev's draw
       spec, then a prompt from each lane: the buildPrompt template, and
       spark (data/pictures/draw_planner_prompt.md). Mints are one paid
       call per click, saved as takes with sidecars in out/draw_lab. */

    if (path === "/api/lab/probe" && req.method === "POST") {
      const body = await readBody(req);
      const text = String(body?.text ?? "").trim();
      const description = String(body?.description ?? "").trim() || null;
      if (!text) return json(res, 400, { error: "bad_text" });
      const base = (process.env.PIP_PICTURE_ADMIN_URL ?? "").replace(/\/+$/, "");
      const token = process.env.PIP_ADMIN_TOKEN ?? "";
      let find = null, spec = null;
      const errors = {};
      if (base && token) {
        const r = await fetch(`${base}/admin/v1/pictures/find`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            index: "calibration",
            items: [{ text, description }],
          }),
        }).catch(() => null);
        if (r?.ok) find = (await r.json()).results?.[0] ?? null;
        else errors.find = `worker ${r?.status ?? "unreachable"}`;
      } else {
        errors.find = "no_worker";
      }
      try {
        spec = await labSpec({ text, description });
      } catch (e) {
        errors.spec = String(e?.message ?? e);
      }
      return json(res, 200, {
        find, spec, errors,
        // Which planner Jev's imagery verdict routes to (literal→gptoss,
        // metaphor→spark) — the production decision, shown in the lab.
        plan_lane: spec ? plannerLane(spec) : null,
      });
    }

    /** The template lane — exactly what handleDraw would build for this
     *  subject: personal scope prompts from the description alone, the
     *  torso from Jev's kind. */
    if (path === "/api/lab/prompt" && req.method === "POST") {
      const body = await readBody(req);
      const text = String(body?.text ?? "").trim();
      const description = String(body?.description ?? "").trim() || null;
      const scope = body?.scope === "personal" ? "personal" : "common";
      if (!text) return json(res, 400, { error: "bad_text" });
      try {
        return json(res, 200, {
          prompt: composePrompt({
            text, description, scope, kind: body?.kind, spec: body?.spec ?? {},
          }),
        });
      } catch (e) {
        return json(res, 400, { error: "prompt_failed", detail: String(e?.message ?? e) });
      }
    }

    /** The planner lanes — every lane in PLANNER_MODELS writes the ONE
     *  hint sentence in parallel, timed; the same buildPrompt scaffold
     *  composes each Muse prompt. Warnings flag banned style words and
     *  humans-in-a-zero-spec before a paid mint. */
    if (path === "/api/lab/plan" && req.method === "POST") {
      const body = await readBody(req);
      const text = String(body?.text ?? "").trim();
      const description = String(body?.description ?? "").trim() || null;
      const scope = body?.scope === "personal" ? "personal" : "common";
      const spec = body?.spec ?? {};
      if (!text) return json(res, 400, { error: "bad_text" });
      const lanes = body?.lane ? [body.lane] : Object.keys(PLANNER_MODELS);
      const settled = await Promise.allSettled(
        lanes.map((lane) => askPlanner({ lane, text, description, spec })),
      );
      const plans = {};
      for (const [i, s] of settled.entries()) {
        const lane = lanes[i];
        plans[lane] = s.status === "fulfilled"
          ? {
              hint: s.value.hint,
              ms: s.value.ms,
              warnings: [...lintHint(s.value.hint), ...lintSpecFit(s.value.hint, spec)],
              prompt: composePrompt({
                text, description, scope, kind: body?.kind, spec, hint: s.value.hint,
              }),
            }
          : { error: String(s.reason?.message ?? s.reason) };
      }
      return json(res, 200, { plans });
    }

    /** One paid Muse call per click — never a batch. */
    if (path === "/api/lab/mint" && req.method === "POST") {
      const body = await readBody(req);
      const source = ["template", "custom", ...Object.keys(PLANNER_MODELS)]
        .includes(body?.source) ? body.source : "custom";
      try {
        const meta = await mintLabTake({
          word: String(body?.word ?? body?.text ?? ""),
          description: String(body?.description ?? "").trim() || null,
          prompt: String(body?.prompt ?? "").trim(),
          spec: body?.spec ?? {},
          source,
          scope: body?.scope === "personal" ? "personal" : "common",
        });
        return json(res, 200, { take: meta });
      } catch (e) {
        return json(res, 502, { error: "mint_failed", detail: String(e?.message ?? e) });
      }
    }

    if (path === "/api/lab/takes" && req.method === "GET") {
      return json(res, 200, { takes: listLabTakes() });
    }

    /** Launch words still missing a symbol (art_gaps) — the lab's "what
     *  should I work on" dropdown. */
    if (path === "/api/lab/gaps" && req.method === "GET") {
      const lexicon = readJson(DEFAULT_LEXICON_PATH, { entries: [] });
      const gaps = computeCoreGaps(
        lexicon, join(repoRoot, "assets/symbols"), loadGlyphWords());
      return json(res, 200, {
        total: gaps.totalEntries,
        have: gaps.haveSymbol,
        missing: gaps.missing.filter((m) => !m.note).map((m) => ({
          word: m.spokenText, slot: m.slot,
          pos: m.partOfSpeech ?? null, cat: m.category ?? null,
        })),
        glyph_only: gaps.missing.filter((m) => m.note).length,
      });
    }

    /** "Use this one" — copy the take into assets/symbols/ where
     *  catalog:build ships it as a real image (SKILL.md §6.4). */
    if (path === "/api/lab/adopt" && req.method === "POST") {
      const body = await readBody(req);
      try {
        const meta = adoptLabTake({ file: body?.file });
        return json(res, 200, { take: meta });
      } catch (e) {
        const msg = String(e?.message ?? e);
        const status = msg === "not_found" ? 404
          : msg === "personal_take" ? 422
          : msg.startsWith("symbol_exists") ? 409 : 400;
        return json(res, status, { error: msg });
      }
    }

    if (path === "/api/lab/verdict" && req.method === "POST") {
      const body = await readBody(req);
      try {
        const meta = setTakeVerdict({ file: body?.file, verdict: body?.verdict ?? null });
        if (!meta) return json(res, 404, { error: "not_found" });
        return json(res, 200, { take: meta });
      } catch (e) {
        return json(res, 400, { error: String(e?.message ?? e) });
      }
    }

    /** A probe worth keeping becomes a calibration query. */
    if (path === "/api/lab/add-query" && req.method === "POST") {
      const body = await readBody(req);
      const text = String(body?.text ?? "").trim();
      const description = String(body?.description ?? "").trim() || null;
      if (!text) return json(res, 400, { error: "bad_text" });
      const data = readJson(QUERIES_PATH, null);
      if (!data) return json(res, 500, { error: "queries_missing" });
      const row = { text, ...(description ? { description } : {}) };
      data.queries.push(row);
      writeJson(QUERIES_PATH, data);
      return json(res, 200, { ok: true, row });
    }

    /* --------------------------- sentence lab ---------------------------
       One fragment → every magic-wand mode × both candidate models, in
       parallel, timed. Same Groq endpoint + prompts as the production
       transform route — the lab measures the real thing. Runs persist in
       out/sentence_lab/ so ✓/✗ verdicts survive restarts. */

    if (path === "/api/slab/run" && req.method === "POST") {
      const body = await readBody(req);
      const text = String(body?.text ?? "").trim();
      try {
        const suite = await runTransformSuite({ text });
        return json(res, 200, { run: saveRun({ input: text, suite }) });
      } catch (e) {
        const msg = String(e?.message ?? e);
        return json(res, msg === "bad_text" ? 400 : 502,
          { error: "run_failed", detail: msg });
      }
    }

    if (path === "/api/slab/runs" && req.method === "GET") {
      return json(res, 200, { runs: listRuns() });
    }

    if (path === "/api/slab/verdict" && req.method === "POST") {
      const body = await readBody(req);
      try {
        const rec = setCellVerdict({
          file: body?.file, mode: body?.mode,
          lane: body?.lane, verdict: body?.verdict ?? null,
        });
        if (!rec) return json(res, 404, { error: "not_found" });
        return json(res, 200, { run: rec });
      } catch (e) {
        return json(res, 400, { error: String(e?.message ?? e) });
      }
    }

    const labImg = path.match(/^\/lab-img\/([A-Za-z0-9_.-]+)$/);
    if (labImg && req.method === "GET") {
      const file = labImagePath(labImg[1]);
      if (!file || !existsSync(file)) return json(res, 404, { error: "not_found" });
      res.writeHead(200, { "content-type": "image/png", "cache-control": "no-cache" });
      return res.end(readFileSync(file));
    }

    if (path === "/api/reindex" && req.method === "POST") {
      const run = spawnSync(process.execPath,
        ["scripts/pictures/build_index.mjs", "--calibration", "--upsert"],
        { cwd: repoRoot, encoding: "utf8", timeout: 600_000 });
      return json(res, run.status === 0 ? 200 : 500, {
        status: run.status, out: (run.stdout ?? "") + (run.stderr ?? ""),
      });
    }

    const imgMatch = path.match(/^\/img\/([A-Za-z0-9_]+)$/);
    if (imgMatch && req.method === "GET") {
      const file = localImagePath(imgMatch[1], catalogImages);
      if (!file || !existsSync(file)) return json(res, 404, { error: "not_found" });
      res.writeHead(200, {
        "content-type": "image/png", "cache-control": "no-cache",
      });
      return res.end(readFileSync(file));
    }

    return json(res, 404, { error: "not_found" });
  };
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invoked) {
  loadEnv();
  createServer(buildHandler()).listen(PORT, "127.0.0.1", () => {
    console.log(`picture calibration → http://127.0.0.1:${PORT}/picture-calibration`);
    console.log(`finds proxy to ${process.env.PIP_PICTURE_ADMIN_URL || "(PIP_PICTURE_ADMIN_URL unset)"}`);
  });
}
