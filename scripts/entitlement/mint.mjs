/**
 * Mint a Pip Lifetime license for a user (dev path — 011 slice 9).
 * Reads PIP_LICENSE_SECRET from .dev.vars; prints the key to paste in
 * Parent corner → Pip Lifetime.
 *
 *   node scripts/entitlement/mint.mjs <userId>
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { licenseFor } from "../../src/worker/license.mjs";

const userId = process.argv[2];
if (!userId) {
  console.error("usage: node scripts/entitlement/mint.mjs <userId>");
  process.exit(1);
}

const vars = {};
for (const line of readFileSync(join(import.meta.dirname, "../../.dev.vars"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
  if (m) vars[m[1]] = m[2];
}
if (!vars.PIP_LICENSE_SECRET) {
  console.error("PIP_LICENSE_SECRET missing from .dev.vars");
  process.exit(1);
}

console.log(await licenseFor(vars.PIP_LICENSE_SECRET, userId));
