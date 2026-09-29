#!/usr/bin/env node
/**
 * 030 slice 4 — publishes the frozen style bundles the Worker's draw path
 * needs (it cannot read assets/): uploads assets/style-refs/{pip-v1,object-v1}
 * to R2 `pippaac-voice` under `style-refs/` and writes the manifest
 * `style-refs/manifest.json` that src/worker/pictures.js loadDrawRefs reads.
 *
 * Additive and idempotent — a dedicated prefix, nothing else lives there.
 *
 *   node scripts/pictures/publish_style_refs.mjs          # upload
 *   node scripts/pictures/publish_style_refs.mjs --dry-run
 */
import { readdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const BUCKET = "pippaac-voice";
const REF_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../assets/style-refs");
const BUNDLES = ["pip-v1", "object-v1"];
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

const dry = process.argv.includes("--dry-run");
const files = [];
for (const bundle of BUNDLES) {
  const dir = join(REF_DIR, bundle);
  for (const f of readdirSync(dir).filter((n) => MIME[extname(n)]).sort()) {
    files.push({ name: `${bundle}/${f}`, mime: MIME[extname(f)], path: join(dir, f) });
  }
}
if (!files.length) throw new Error(`no style refs under ${REF_DIR}`);

const put = (key, file, mime) => {
  console.log(`${dry ? "[dry] " : ""}put ${BUCKET}/${key}`);
  if (dry) return;
  execFileSync("npx", [
    "wrangler", "r2", "object", "put", `${BUCKET}/${key}`,
    "--file", file, "--content-type", mime, "--remote",
  ], { stdio: "inherit" });
};

for (const f of files) put(`style-refs/${f.name}`, f.path, f.mime);

const manifest = JSON.stringify({ files: files.map(({ name, mime }) => ({ name, mime })) }, null, 2);
const tmp = join(mkdtempSync(join(tmpdir(), "pip-refs-")), "manifest.json");
writeFileSync(tmp, manifest);
put("style-refs/manifest.json", tmp, "application/json");
console.log(`${files.length} refs + manifest ${dry ? "(dry run)" : "published"}`);
