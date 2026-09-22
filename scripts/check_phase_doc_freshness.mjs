#!/usr/bin/env node
// Phase-doc freshness gate.
//
// Root cause of doc pile-up (2026-07-11 audit): archival was coupled to phase
// "closeout" events that kept getting deferred, so DONE work lingered in
// docs/phases/ for weeks (e.g. 56/57 sat "subsumed by 62" long after 62 shipped).
// lint:archive-links only checks link *direction*; nothing caught the drift.
//
// This gate fails `npm run check` when a doc in docs/phases/ has a DONE Status
// (Complete / Superseded / Shipped / Archived) but still lives there. Fix by
// archiving it (extract -> sever -> move; docs/WORKING_RULES.md § Documentation
// Archive Boundary), OR — if it must stay because it still owns a live spec —
// add a `Keep-in-phases: <reason>` line to the doc to justify the retention.
//
// Run: npm run lint:phase-freshness  (wired into `npm run check`).

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const PHASES = fileURLToPath(new URL("../docs/phases/", import.meta.url));
const DONE = /\b(complete|superseded|shipped|archived)\b/i;

// The leading clause of the Status value = the actual status, before any
// parenthetical / dash / comma qualifier (so "Unblocked (59 done/archived)"
// reads as "Unblocked", not a false DONE hit on the parenthetical).
function statusLead(body) {
  const m = body.match(/^\*{0,2}\s*status\s*:?\*{0,2}\s*(.+)$/im);
  if (!m) return null;
  return m[1].replace(/\*/g, "").split(/[(—.,;]| - /)[0].trim();
}

const offenders = [];
for (const name of readdirSync(PHASES)) {
  if (!name.endsWith(".md") || name === "README.md") continue;
  const body = readFileSync(join(PHASES, name), "utf8");
  if (/^\s*Keep-in-phases\s*:/im.test(body)) continue; // explicit, justified retention
  const lead = statusLead(body);
  if (!lead || /code-complete/i.test(lead)) continue; // code-complete = live w/ follow-ups
  if (DONE.test(lead)) offenders.push({ name, lead });
}

if (offenders.length) {
  console.error(
    `\n✗ ${offenders.length} phase doc(s) read as DONE but still live in docs/phases/:`,
  );
  for (const o of offenders) console.error(`  ${o.name} — Status: "${o.lead}"`);
  console.error(
    `\nArchive it (extract -> sever -> move; docs/WORKING_RULES.md § Documentation` +
      ` Archive Boundary), or add a "Keep-in-phases: <reason>" line if it must stay` +
      ` (e.g. it still owns a live spec).\n`,
  );
  process.exit(1);
}
console.log("✓ No done-status phase docs lingering in docs/phases/.");
