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

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const QUERIES_PATH = join(repoRoot, "data/pictures/calibration_queries.json");
const FINDER_PATH = join(repoRoot, "data/catalog/picture_finder.json");
const CATALOG_PATH = join(repoRoot, "data/catalog/catalog.json");
const PAGE_PATH = join(repoRoot, "public/picture-calibration.html");
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
