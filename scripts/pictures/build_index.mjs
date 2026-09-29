#!/usr/bin/env node
/**
 * 030 § 3.4 — build the picture index rows and upsert them into the
 * Vectorize index through the Worker's founder-only admin route (the
 * Worker embeds captions with Workers AI — this script never calls a
 * paid API itself).
 *
 *   node scripts/pictures/build_index.mjs              write rows only
 *   npm run pictures:index                             rows + upsert (main index)
 *   node scripts/pictures/build_index.mjs --calibration  rows + upsert, pending included
 *
 * Sources (change them, then rebuild — generated output is derived):
 *   data/catalog/catalog.json          images approved → source: catalog
 *   out/extended_art/review.json       founder 010 slice-2 verdicts
 *   out/extended_art/results.jsonl     label/section/spec per slug
 *   data/catalog/extended_art_r2.json  published R2 manifest (asset must exist)
 *   data/pictures/drawings.json        optional ledger export → source: drawn
 *
 * Upsert target: $PIP_PICTURE_ADMIN_URL/admin/v1/pictures/index with
 * Bearer $PIP_ADMIN_TOKEN (loaded from .env).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  captionForCatalog,
  captionForDrawing,
  captionForExtended,
} from "../../src/shared/picture_index.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CATALOG = join(repoRoot, "data/catalog/catalog.json");
const REVIEW = join(repoRoot, "out/extended_art/review.json");
const RESULTS = join(repoRoot, "out/extended_art/results.jsonl");
const MANIFEST = join(repoRoot, "data/catalog/extended_art_r2.json");
const DRAWINGS = join(repoRoot, "data/pictures/drawings.json");
const CFG_PATH = join(repoRoot, "data/catalog/picture_finder.json");
const OUT_DIR = join(repoRoot, "out/pictures");

function loadEnv() {
  try {
    for (const line of readFileSync(join(repoRoot, ".env"), "utf8").split("\n")) {
      const m = /^([A-Z_]+)=(.+)$/.exec(line.trim());
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch { /* optional */ }
}

function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

/** Rows for the picture index. calibration=true keeps unreviewed
 *  extended art as status:pending (the find path never serves it). */
export function buildRows({ calibration = false } = {}) {
  const catalog = readJson(CATALOG);
  const cfg = readJson(CFG_PATH);
  const rows = [];

  const senses = new Map(catalog.senses.map((s) => [s.id, s]));
  const labelsBySense = new Map();
  for (const l of catalog.labels) {
    if (l.locale !== "en" || !l.text) continue;
    if (!labelsBySense.has(l.sense_id)) labelsBySense.set(l.sense_id, []);
    labelsBySense.get(l.sense_id).push(l.text);
  }
  for (const img of catalog.images) {
    if (img.status !== "approved") continue;
    const sense = senses.get(img.sense_id) ?? {};
    const labels = labelsBySense.get(img.sense_id) ?? [];
    const caption = captionForCatalog(labels, sense.category);
    if (!caption) continue;
    rows.push({
      image_id: img.id,
      asset: `/${img.key}`,
      source: "catalog",
      status: "approved",
      caption,
      fitzgerald_role: sense.fitzgerald_role ?? "",
      lens: "",
      caption_version: cfg.caption_version,
    });
  }

  const review = readJson(REVIEW, {});
  const manifest = readJson(MANIFEST, { entries: {} }).entries ?? {};
  const meta = new Map(readJsonl(RESULTS).map((r) => [r.id, r]));
  for (const [id, verdict] of Object.entries(review)) {
    const approved = verdict === "approve";
    if (!approved && verdict === "reject") continue;
    const published = manifest[id]?.r2Key;
    if (approved && !published) continue; // the img route could not serve it
    if (!approved && !calibration) continue;
    const r = meta.get(id) ?? {};
    rows.push({
      image_id: `ext_${id}`,
      asset: approved
        ? `/api/v1/pictures/img/ext_${id}`
        : `/ext-local/${id}.png`,
      source: "extended",
      status: approved ? "approved" : "pending",
      caption: captionForExtended(r.label ?? id.replace(/_/g, " "), r.section, r.spec),
      fitzgerald_role: "",
      lens: r.spec?.framing ?? "",
      caption_version: cfg.caption_version,
    });
  }

  for (const d of readJson(DRAWINGS, []) ?? []) {
    if (d.status !== "ready" || !d.key) continue;
    const caption = captionForDrawing(d);
    if (!caption) continue;
    rows.push({
      image_id: `drw_${d.key}`,
      asset: `/api/v1/pictures/img/drw_${d.key}`,
      source: "drawn",
      status: "approved",
      caption,
      fitzgerald_role: d.kind ?? "",
      lens: d.lens ?? "",
      caption_version: cfg.caption_version,
    });
  }
  return rows;
}

async function upsert(rows, indexName) {
  loadEnv();
  const base = (process.env.PIP_PICTURE_ADMIN_URL ?? "").replace(/\/+$/, "");
  const token = process.env.PIP_ADMIN_TOKEN ?? "";
  if (!base) {
    console.log("PIP_PICTURE_ADMIN_URL unset — rows written, no upsert. "
      + "Point it at a running Worker (e.g. http://127.0.0.1:21088).");
    return 0;
  }
  let done = 0;
  for (let i = 0; i < rows.length; i += 128) {
    const batch = rows.slice(i, i + 128);
    const res = await fetch(`${base}/admin/v1/pictures/index`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ index: indexName, rows: batch }),
    });
    if (!res.ok) {
      throw new Error(`index upsert ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    done += (await res.json()).upserted;
  }
  return done;
}

function main() {
  const args = process.argv.slice(2);
  const calibration = args.includes("--calibration");
  const doUpsert = args.includes("--upsert") || process.env.PICTURES_UPSERT === "1";
  const rows = buildRows({ calibration });

  mkdirSync(OUT_DIR, { recursive: true });
  const name = calibration ? "index_rows.calibration.json" : "index_rows.json";
  writeFileSync(join(OUT_DIR, name), JSON.stringify(rows, null, 2));
  const byStatus = rows.reduce((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {});
  const bySource = rows.reduce((m, r) => ((m[r.source] = (m[r.source] ?? 0) + 1), m), {});
  console.log(`${rows.length} rows → out/pictures/${name}`);
  console.log(`  sources: ${JSON.stringify(bySource)}  status: ${JSON.stringify(byStatus)}`);

  if (doUpsert) {
    const indexName = calibration ? "calibration" : "main";
    return upsert(rows, indexName)
      .then((n) => console.log(`upserted ${n} vectors into ${indexName}`));
  }
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invoked) {
  Promise.resolve(main()).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
