#!/usr/bin/env node
/**
 * 028 slice 5 / WT9 — the tile-voice reconcile.
 *
 * Compares what the ledger asked ElevenLabs to synthesize in a window
 * (SUM(LENGTH(mint_text)) over clips minted in [from, to)) against the
 * ElevenLabs usage counter's delta over the same window. Prints both,
 * the gap, and the measured credits per ledger character — the plan
 * sizing input for bulk seeding (a word's minted chars ≠ its display
 * length once IPA markup wraps it).
 *
 * Usage:
 *   npm run tilevoice:reconcile                 # current UTC day
 *   npm run tilevoice:reconcile -- --days 7
 *   npm run tilevoice:reconcile -- --from 2026-09-28 --to 2026-09-29
 *
 * Env (from .env): PIP_TILE_ADMIN_URL, PIP_ADMIN_TOKEN,
 * ELEVENLABS_API_KEY.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

for (const line of readFileSync(path.join(repoRoot, ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

/* --------------------------- pure parts --------------------------- */

/** Vendor totals from a workspace analytics body — the deprecated
 *  /v1/usage/character-stats 500s on this account (2026-09-29), so the
 *  instrument reads POST /v1/workspace/analytics/query/
 *  usage-by-product-over-time: `{columns, rows}` where `total_usage`
 *  carries the requested metric (credits or tts_characters). The key
 *  has no user_read scope — workspace analytics is what it can read. */
export function vendorTotal(body) {
  const idx = (body?.columns ?? []).indexOf("total_usage");
  if (idx < 0) return 0;
  return (body.rows ?? []).reduce((a, r) => a + (Number(r[idx]) || 0), 0);
}

/** The comparison for one window. The vendor side is account-wide —
 *  catalog mints and lab runs share it — so creditsPerChar is an
 *  upper bound on what one minted tile char really costs. */
export function reconcile({ ledgerChars, ledgerMints, vendorChars, vendorCredits }) {
  return {
    ledgerChars,
    ledgerMints,
    vendorChars,
    vendorCredits,
    charsGap: vendorChars - ledgerChars,
    // credits per ledger char — the seed-plan sizing input. >1 means
    // IPA markup/v4 metering inflates the bill vs naive text length.
    creditsPerChar: ledgerChars ? vendorCredits / ledgerChars : null,
    creditsPerVendorChar: vendorChars ? vendorCredits / vendorChars : null,
    charsPerMint: ledgerMints ? ledgerChars / ledgerMints : null,
  };
}

/* --------------------------- live parts --------------------------- */

const DAY = 86_400_000;

/** Window args: --from/--to accept ms or YYYY-MM-DD (UTC midnight); no
 *  args = the current UTC day. */
export function parseWindow(argv, now = Date.now()) {
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const ts = (v, endOfDay = false) => {
    if (v === undefined) return undefined;
    if (/^\d+$/.test(v)) return Number(v);
    const t = Date.parse(`${v}T00:00:00Z`);
    if (Number.isNaN(t)) throw new Error(`bad date: ${v}`);
    return t + (endOfDay ? DAY : 0);
  };
  let from = ts(arg("--from"));
  let to = ts(arg("--to"), true);
  const days = Number(arg("--days") ?? 0);
  if (days) {
    const dayStart = now - (now % DAY);
    to = dayStart + DAY;
    from = to - days * DAY;
  }
  from ??= now - (now % DAY);           // default: today UTC
  to ??= from + DAY;
  return { from, to };
}

async function ledgerUsage({ from, to }) {
  const base = (process.env.PIP_TILE_ADMIN_URL ?? "").replace(/\/+$/, "");
  if (!base) throw new Error("PIP_TILE_ADMIN_URL unset — point it at a Worker in .env");
  const res = await fetch(
    `${base}/admin/v1/tile-voice/usage?from=${from}&to=${to}`, {
      headers: { authorization: `Bearer ${process.env.PIP_ADMIN_TOKEN ?? ""}` },
    });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`tile admin ${res.status}: ${body?.error ?? "?"}`);
  return body;
}

async function vendorUsage({ from, to }, metric) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY unset — add it to .env");
  // interval_seconds must keep the bucket count ≤ 1000.
  const interval = Math.max(86400, Math.ceil((to - from) / 1000 / 1000));
  const res = await fetch(
    "https://api.elevenlabs.io/v1/workspace/analytics/query/usage-by-product-over-time",
    {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        start_time: from, end_time: to, metric, interval_seconds: interval,
      }),
    });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`elevenlabs ${res.status}: ${JSON.stringify(body)?.slice(0, 200)}`);
  }
  return body;
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  try {
    const win = parseWindow(process.argv.slice(2));
    const [led, vendChars, vendCredits] = await Promise.all([
      ledgerUsage(win),
      vendorUsage(win, "tts_characters"),
      vendorUsage(win, "credits"),
    ]);
    const r = reconcile({
      ledgerChars: led.chars, ledgerMints: led.mints,
      vendorChars: vendorTotal(vendChars), vendorCredits: vendorTotal(vendCredits),
    });
    const fmt = (n) => (n ?? 0).toLocaleString("en-US");
    console.log(`window  ${new Date(win.from).toISOString()} → ${new Date(win.to).toISOString()}`);
    console.log(`ledger  ${fmt(r.ledgerMints)} mints, ${fmt(r.ledgerChars)} minted chars`);
    console.log(`vendor  ${fmt(r.vendorChars)} tts chars, ${fmt(r.vendorCredits)} credits (account-wide — lab/catalog traffic shares it)`);
    console.log(`gap     ${fmt(r.charsGap)} chars`);
    if (r.creditsPerChar !== null) {
      console.log(`credits/ledger-char  ${r.creditsPerChar.toFixed(3)} (upper bound)  ·  credits/vendor-char ${r.creditsPerVendorChar?.toFixed(3) ?? "—"}  ·  chars/mint  ${r.charsPerMint.toFixed(1)}`);
    } else {
      console.log("credits/ledger-char  — (no ledger-billed chars in window)");
    }
  } catch (e) {
    console.error(`reconcile: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}
