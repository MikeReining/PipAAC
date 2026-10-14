#!/usr/bin/env node
/**
 * One-time: move the on-demand tile-voice library from one voice_key to
 * another (founder 2026-10-14: voi_eve_en → voi_mia_en). Additive only —
 * old R2 objects and old ledger rows are never deleted or edited.
 *
 *   node scripts/catalog/migrate_tile_voice_key.mjs --from voi_eve_en --to voi_mia_en --dry-run
 *   node scripts/catalog/migrate_tile_voice_key.mjs --from voi_eve_en --to voi_mia_en
 *
 * Env (from .env, or --env-file <path>): PIP_TILE_ADMIN_URL, PIP_ADMIN_TOKEN.
 * Never calls ElevenLabs; never mints.
 *
 * Why a copy + re-register, not a rename: the ledger id is
 * sha256(voice_key|locale|profile|text) (tileClipId, tile_ledger.mjs), so
 * the same words under the new key have NEW ids. Rows left under the old
 * key are orphaned and every typed word would mint again (paid). So for
 * each ready minted row (user_typed / user_keyboard / catalog_lazy):
 *   1. copy R2 pippaac-voice  tile/<from>/<oldId>[.vN].mp3
 *                          -> tile/<to>/<newId>[.vN].mp3
 *   2. POST /admin/v1/tile-voice/seed {voice_key:<to>, locale, text,
 *      mint_text, r2_key:<new key>} — the DO derives <newId> itself (same
 *      function this script imports to name the object), so the new row
 *      points at the copied object and nothing re-mints.
 * Copy happens before registering, so a row never points at a missing
 * object. Re-running is safe (put overwrites identical bytes; seed never
 * clobbers an existing row).
 *
 * What does NOT carry over (seed rows are born source=seed, review=approved,
 * hits=0, version=1): the original source/review/hit/flag state. Withheld,
 * rejected and still-minting rows are skipped, not resurrected.
 *
 * Catalog seed rows (source=seed, r2_key audio/…) are not copied — they
 * point at shipped catalog audio. Re-create them under the new key with
 * `npm run tilevoice:seed-catalog` after the renamed catalog is deployed.
 *
 * R2 has no list command in wrangler 4.x, and every minted object has a
 * ledger row, so the object list is the ledger's (admin /recent, per source).
 */
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { tileClipId } from "../../src/worker/tile_ledger.mjs";

const run = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const VOICE_BUCKET = "pippaac-voice"; // wrangler.jsonc r2_buckets VOICE
const MINTED_SOURCES = ["user_typed", "user_keyboard", "catalog_lazy"];

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

/** The new r2 key: same shape, new voice dir and new id. */
export function targetKey(row, from, to, newId) {
  const prefix = `tile/${from}/${row.id}`;
  if (!row.r2_key.startsWith(prefix)) return null;
  return `tile/${to}/${newId}${row.r2_key.slice(prefix.length)}`;
}

async function adminGet(base, pathAndQuery) {
  const res = await fetch(`${base}${pathAndQuery}`, {
    headers: { authorization: `Bearer ${process.env.PIP_ADMIN_TOKEN ?? ""}` },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${pathAndQuery}: ${res.status} ${body?.error ?? "?"}`);
  return body;
}

/** Ready minted rows under `from`, paged by created_at (admin caps pages at 100). */
async function listRows(base, from) {
  const found = new Map();
  const skipped = { notReady: 0, notTileKey: 0 };
  let seen = 0;
  for (const source of MINTED_SOURCES) {
    let before = null;
    for (;;) {
      const q = `source=${source}&limit=100${before ? `&before=${before}` : ""}`;
      const { rows } = await adminGet(base, `/admin/v1/tile-voice/recent?${q}`);
      if (!rows.length) break;
      for (const r of rows) {
        seen++;
        if (r.voice_key !== from) continue;
        if (r.status !== "ready") { skipped.notReady++; continue; }
        if (!r.r2_key?.startsWith(`tile/${from}/`)) { skipped.notTileKey++; continue; }
        found.set(r.id, r);
      }
      const next = Math.min(...rows.map((r) => r.created_at));
      if (rows.length < 100 || next === before) break;
      before = next;
    }
  }
  return { rows: [...found.values()], skipped, seen };
}

const wrangler = (args) => run(
  path.join(repoRoot, "node_modules/.bin/wrangler"), args, { cwd: repoRoot });

async function copyObject(fromKey, toKey, tmp) {
  await wrangler(["r2", "object", "get", `${VOICE_BUCKET}/${fromKey}`, "--file", tmp, "--remote"]);
  if (!statSync(tmp).size) throw new Error(`empty download for ${fromKey}`);
  await wrangler(["r2", "object", "put", `${VOICE_BUCKET}/${toKey}`, "--file", tmp,
    "--content-type", "audio/mpeg", "--remote"]);
}

async function seed(base, rows) {
  let inserted = 0, skipped = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const res = await fetch(`${base}/admin/v1/tile-voice/seed`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.PIP_ADMIN_TOKEN ?? ""}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ rows: rows.slice(i, i + 200) }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`seed batch ${i}: ${res.status} ${body?.error ?? "?"}`);
    inserted += body.inserted ?? 0;
    skipped += body.skipped ?? 0;
  }
  return { inserted, skipped };
}

async function main() {
  const from = arg("--from");
  const to = arg("--to");
  const dryRun = argv.includes("--dry-run");
  if (!from || !to || from === to) {
    throw new Error("usage: --from <voice_key> --to <voice_key> [--dry-run] [--env-file <path>]");
  }
  loadEnv(arg("--env-file") ?? path.join(repoRoot, ".env"));
  const base = (process.env.PIP_TILE_ADMIN_URL ?? "").replace(/\/+$/, "");
  if (!base) throw new Error("PIP_TILE_ADMIN_URL unset — point it at a Worker in .env");

  const { rows, skipped, seen } = await listRows(base, from);
  const plan = [];
  for (const r of rows) {
    const newId = await tileClipId(to, r.locale, r.text);
    plan.push({ row: r, newId, toKey: targetKey(r, from, to, newId) });
  }
  const bad = plan.filter((p) => !p.toKey);
  if (bad.length) throw new Error(`${bad.length} rows whose r2_key does not start tile/${from}/<id> (first: ${bad[0].row.id})`);

  console.log(`${from} -> ${to}${dryRun ? " [dry-run]" : ""}`);
  console.log(`ledger rows scanned: ${seen}; under ${from}: ${rows.length + skipped.notReady + skipped.notTileKey}`);
  console.log(`would copy ${plan.length} R2 objects  ${VOICE_BUCKET}/tile/${from}/…  ->  ${VOICE_BUCKET}/tile/${to}/…`);
  console.log(`would register ${plan.length} ledger rows under ${to} (ids re-derived; old rows and objects kept)`);
  console.log(`skipped: ${skipped.notReady} not ready (withheld/minting), ${skipped.notTileKey} not under tile/${from}/`);
  for (const p of plan.slice(0, 3)) {
    console.log(`  ${p.row.r2_key}  ->  ${p.toKey}   "${p.row.text}"`);
  }
  console.log(`catalog seed rows are separate: run npm run tilevoice:seed-catalog after the catalog deploy`);
  if (dryRun) return;

  const dir = mkdtempSync(path.join(tmpdir(), "tile-voice-migrate-"));
  const tmp = path.join(dir, "clip.mp3");
  try {
    const out = [];
    let n = 0;
    for (const p of plan) {
      await copyObject(p.row.r2_key, p.toKey, tmp);
      out.push({
        voice_key: to, locale: p.row.locale, text: p.row.text,
        mint_text: p.row.mint_text, r2_key: p.toKey,
        bytes: p.row.bytes ?? undefined, duration_ms: p.row.duration_ms ?? undefined,
      });
      if (++n % 50 === 0) console.log(`  copied ${n}/${plan.length}`);
    }
    const { inserted, skipped: kept } = await seed(base, out);
    console.log(`registered ${inserted} rows, ${kept} already existed (kept)`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  main().catch((e) => {
    console.error(`migrate: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  });
}
