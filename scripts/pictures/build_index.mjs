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
  labelKey,
} from "../../src/shared/picture_index.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CATALOG = join(repoRoot, "data/catalog/catalog.json");
const REVIEW = join(repoRoot, "out/extended_art/review.json");
const RESULTS = join(repoRoot, "out/extended_art/results.jsonl");
const MANIFEST = join(repoRoot, "data/catalog/extended_art_r2.json");
const DRAWINGS = join(repoRoot, "data/pictures/drawings.json");
const CFG_PATH = join(repoRoot, "data/catalog/picture_finder.json");
const LABELS_PATH = join(repoRoot, "data/catalog/picture_labels.json");
const OUT_DIR = join(repoRoot, "out/pictures");

export function loadEnv() {
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
 *  extended art as status:pending (the find path never serves it).
 *  `paths` overrides the source files (tests). */
export function buildRows({ calibration = false, paths = {} } = {}) {
  const catalog = readJson(paths.catalog ?? CATALOG);
  const cfg = readJson(paths.cfg ?? CFG_PATH);
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

  const review = readJson(paths.review ?? REVIEW, {});
  const manifest = readJson(paths.manifest ?? MANIFEST, { entries: {} }).entries ?? {};
  const meta = new Map(readJsonl(paths.results ?? RESULTS).map((r) => [r.id, r]));
  // Every generated slug (results) plus any verdict without a results row.
  // Unreviewed slugs are pending — they calibrate but never serve in find.
  const extIds = new Set([...meta.keys(), ...Object.keys(review)]);
  const serveMismatches = [];
  for (const id of extIds) {
    const verdict = review[id];
    if (verdict === "reject") continue;
    const approved = verdict === "approve";
    const published = manifest[id]?.r2Key;
    // 030 slice 6: the manifest and the img route must agree — the route
    // serves exactly `symbols/extended/<id>.png`, so any other r2Key is a
    // broken asset no matter what the manifest says.
    const served = `symbols/extended/${id}.png`;
    if (approved && !published) continue; // the img route could not serve it
    if (approved && published !== served) {
      serveMismatches.push(`${id}: manifest ${published}`);
      continue;
    }
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

  for (const d of readJson(paths.drawings ?? DRAWINGS, []) ?? []) {
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
  if (serveMismatches.length) {
    console.warn(`extended manifest/serve disagreement (${serveMismatches.length} skipped):`,
      serveMismatches.slice(0, 10).join(", "));
  }
  return rows;
}

/** The lexical label map (§ 4.2 tier 1): normalized English label → the
 *  image(s) that literally answer to it, built from the same sources as
 *  the index rows. Identity lookup — no vector involved — so a symbol
 *  whose embedding ranks below fetch_k ("eat", "no") still applies.
 *  Entries carry `sense` so the find path can tell a same-sense
 *  duplicate from a true homograph (label on two senses — "orange" the
 *  colour vs the fruit — never auto-applies; the adult picks).
 *  Pending extended art is excluded: it calibrates but never serves.
 *  Personal drawings contribute their DESCRIPTION only — the name is
 *  never a label (§ 3.3). */
export function buildLabelMap({ paths = {} } = {}) {
  const catalog = readJson(paths.catalog ?? CATALOG);
  const review = readJson(paths.review ?? REVIEW, {});
  const manifest = readJson(paths.manifest ?? MANIFEST, { entries: {} }).entries ?? {};
  const meta = new Map(readJsonl(paths.results ?? RESULTS).map((r) => [r.id, r]));
  const labels = {};
  const push = (norm, entry) => {
    if (!norm) return;
    const list = labels[norm] ??= [];
    if (!list.some((e) => e.image_id === entry.image_id)) list.push(entry);
  };

  const imgsBySense = new Map();
  for (const img of catalog.images) {
    if (img.status !== "approved") continue;
    let list = imgsBySense.get(img.sense_id);
    if (!list) { list = []; imgsBySense.set(img.sense_id, list); }
    list.push(img);
  }
  const senseById = new Map(catalog.senses.map((s) => [s.id, s]));
  const labelsBySenseId = new Map();
  for (const l of catalog.labels) {
    if (l.locale !== "en" || !l.text) continue;
    let list = labelsBySenseId.get(l.sense_id);
    if (!list) { list = []; labelsBySenseId.set(l.sense_id, list); }
    list.push(l.text);
  }
  for (const l of catalog.labels) {
    if (l.locale !== "en" || !l.text) continue;
    const caption = captionForCatalog(
      labelsBySenseId.get(l.sense_id) ?? [],
      senseById.get(l.sense_id)?.category);
    for (const img of imgsBySense.get(l.sense_id) ?? []) {
      push(labelKey(l.text), { image_id: img.id, asset: `/${img.key}`,
        source: "catalog", caption, sense: l.sense_id,
        label: String(l.text).trim() });
    }
  }
  for (const [id, r] of meta) {
    if (review[id] !== "approve" || manifest[id]?.r2Key !== `symbols/extended/${id}.png`) continue;
    const extLabel = r.label ?? id.replace(/_/g, " ");
    push(labelKey(extLabel), {
      image_id: `ext_${id}`, asset: `/api/v1/pictures/img/ext_${id}`,
      source: "extended",
      caption: captionForExtended(extLabel, r.section, r.spec),
      sense: `ext_${id}`, label: String(extLabel).trim(),
    });
  }
  for (const d of readJson(paths.drawings ?? DRAWINGS, []) ?? []) {
    if (d.status !== "ready" || !d.key) continue;
    const norm = d.scope === "personal"
      ? labelKey(d.description ?? "")
      : labelKey(d.text ?? "");
    push(norm, {
      image_id: `drw_${d.key}`, asset: `/api/v1/pictures/img/drw_${d.key}`,
      source: "drawn", caption: captionForDrawing(d), sense: `drw_${norm}`,
      label: String(d.scope === "personal" ? d.description ?? "" : d.text ?? "").trim(),
    });
  }
  return { version: 1, labels };
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

  // § 4.2 tier 1 — the lexical label map the Worker bundles; identity
  // lookups never wait on the embedding to surface the same word.
  const labelMap = buildLabelMap();
  writeFileSync(LABELS_PATH, JSON.stringify(labelMap, null, 1));
  console.log(`${Object.keys(labelMap.labels).length} labels → data/catalog/picture_labels.json`);

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
