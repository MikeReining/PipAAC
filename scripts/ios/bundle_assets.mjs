#!/usr/bin/env node
/**
 * Slice B asset pack — assembles apps/PipAAC/SharedAssets/, the bundle
 * folder the app ships: the seed database, catalog + answer tables, the
 * default voice's tile clips (sw-audio.json's voi_default_en list —
 * exactly what the web precaches), every catalog symbol, and the svg
 * chrome/icons rasterized (iOS has no SVG renderer; qlmanage is the
 * zero-dep raster path — 512 px, deterministic).
 *
 * Paths inside SharedAssets/ mirror public/, so the db's `clip.key`
 * and `image.key` values are literal bundle paths.
 *
 *   node scripts/ios/bundle_assets.mjs          # write SharedAssets/
 *   node scripts/ios/bundle_assets.mjs --check  # fail on drift
 */
import {
  copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir as osTmpdir } from "node:os";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PUB = join(repo, "public");
const OUT = join(repo, "apps/PipAAC/SharedAssets");
const check = process.argv.includes("--check");

const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const put = (out, rel, buf) => {
  const p = join(out, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, buf);
};
const copy = (out, rel) => put(out, rel, readFileSync(join(PUB, rel)));

/** qlmanage -t renders svg → <file>.png at the -s pixel size. */
const rasterize = (svgAbs, pngAbs) => {
  mkdirSync(dirname(pngAbs), { recursive: true });
  execFileSync("qlmanage", ["-t", "-s", "512", "-o", dirname(pngAbs), svgAbs],
    { stdio: "pipe" });
  const made = join(dirname(pngAbs), `${svgAbs.split("/").pop()}.png`);
  if (!existsSync(made)) throw new Error(`qlmanage produced nothing for ${svgAbs}`);
  if (made !== pngAbs) copyFileSync(made, pngAbs);
};

function* walk(dir, base = dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p, base);
    else yield relative(base, p);
  }
}

function build(out) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const manifest = { generated: "scripts/ios/bundle_assets.mjs", files: {} };
  const note = (rel) => { manifest.files[rel] = sha(readFileSync(join(out, rel))); };

  // Boot + language tables — the files db.js fetches.
  for (const rel of [
    "fresh_db.sqlite", "catalog.json",
    "suggest_answers.en.json", "form_answers.en.json",
    "sw-audio.json", "feeling_voice.json",
  ]) { copy(out, rel); note(rel); }

  // The bundled default voice — the exact clip set the service worker
  // precaches (028 bundle rule: default voice in the app, the rest
  // download on choice).
  const audio = JSON.parse(readFileSync(join(PUB, "sw-audio.json"), "utf8"));
  for (const f of audio.voices.voi_default_en.files) {
    const rel = f.replace(/^\//, "");
    copy(out, rel); note(rel);
  }

  // Tile art — webp copies as-is; every svg gets a 512 px raster twin
  // (<name>.svg.png) which the loader prefers for .svg keys.
  for (const rel of walk(join(PUB, "symbols"))) {
    copy(out, `symbols/${rel}`); note(`symbols/${rel}`);
    if (rel.endsWith(".svg")) {
      const png = `symbols/${rel}.png`;
      rasterize(join(PUB, "symbols", rel), join(out, png));
      note(png);
    }
  }

  // Chrome + brand art — same raster rule.
  for (const dir of ["icons", "brand"]) {
    for (const rel of walk(join(PUB, dir))) {
      copy(out, `${dir}/${rel}`); note(`${dir}/${rel}`);
      if (rel.endsWith(".svg")) {
        const png = `${dir}/${rel}.png`;
        rasterize(join(PUB, dir, rel), join(out, png));
        note(png);
      }
    }
  }

  put(out, "manifest.json", Buffer.from(JSON.stringify(manifest, null, 1)));
}

function diff(a, b) {
  const files = new Set([...walk(a), ...walk(b)]);
  const bad = [];
  for (const rel of files) {
    const pa = join(a, rel), pb = join(b, rel);
    if (!existsSync(pa) || !existsSync(pb)) { bad.push(`missing: ${rel}`); continue; }
    if (sha(readFileSync(pa)) !== sha(readFileSync(pb))) bad.push(`differs: ${rel}`);
  }
  return bad;
}

if (check) {
  const tmp = mkdtempSync(join(osTmpdir(), "pip-assets-"));
  try {
    build(tmp);
    const bad = diff(tmp, OUT);
    if (bad.length) {
      console.error(`bundle_assets --check: ${bad.length} drifted\n${bad.slice(0, 10).join("\n")}`);
      process.exit(1);
    }
    console.log("bundle_assets --check: SharedAssets is current");
  } finally { rmSync(tmp, { recursive: true, force: true }); }
} else {
  build(OUT);
  const files = [...walk(OUT)];
  const bytes = files.reduce((n, f) => n + statSync(join(OUT, f)).size, 0);
  console.log(`wrote ${OUT} — ${files.length} files, ${(bytes / 1048576).toFixed(1)} MB`);
}
