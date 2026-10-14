/**
 * The three imports the iOS core swaps (Platforms § 2: "The sync loop
 * runs in the core; Swift supplies its I/O"). Keyed by the specifier the
 * public/shared modules write; applied only when the importer lives in
 * public/shared/ (the host modules themselves import the real files).
 * One map for both consumers: the esbuild plugin in build_core.mjs and
 * registerHostSwaps() for node scripts that import core_entry.mjs.
 */
import { registerHooks } from "node:module";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const HOST_SWAPS = {
  "./sync_crypto.mjs": "scripts/ios/host/sync_crypto_host.mjs",
  "../db.js": "scripts/ios/host/db_blob_host.mjs",
  "./platform.mjs": "scripts/ios/host/platform_host.mjs",
};
const sharedDir = join(repoRoot, "public/shared") + sep;

/** The swapped absolute path for (specifier, importer file), or null. */
export function hostSwapTarget(spec, importerPath) {
  const target = HOST_SWAPS[spec];
  if (!target || !importerPath.startsWith(sharedDir)) return null;
  // ../db.js is only db.js from public/shared/ (one level below public/).
  if (spec === "../db.js" && resolve(dirname(importerPath), spec) !== join(repoRoot, "public/db.js")) return null;
  return join(repoRoot, target);
}

/** Node: resolve core_entry.mjs's imports the way the bundle does. */
export function registerHostSwaps() {
  registerHooks({
    resolve(spec, ctx, next) {
      const parent = ctx.parentURL?.startsWith("file:") ? fileURLToPath(ctx.parentURL) : "";
      const target = parent && hostSwapTarget(spec, parent);
      return target ? { url: pathToFileURL(target).href, shortCircuit: true } : next(spec, ctx);
    },
  });
}
