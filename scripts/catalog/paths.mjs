import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, "../..");

export const DEFAULT_LEXICON_PATH = join(repoRoot, "data/launch_lexicon.json");
export const DEFAULT_OVERRIDES_PATH = join(repoRoot, "data/wbb_audio_overrides.json");
export const DEFAULT_AUDIO_IMPORT_PATH = join(repoRoot, "data/catalog/audio_import.json");
export const DEFAULT_GENERATED_AUDIO_PATH = join(repoRoot, "data/catalog/generated_audio.json");
export const DEFAULT_AUDIO_CACHE_ROOT = join(repoRoot, "assets/catalog");

export const WBB_MANIFEST_REL = "assets/catalog/manifest.json";
export const WBB_LOOKUP_REL = "scripts/board/lookup.mjs";
export const WBB_R2_BUCKET = "workbookbench-catalog";

/** @returns {string} absolute path to WorkbookBench repo root */
export function resolveWorkbookBenchRoot() {
  const fromEnv = process.env.WORKBOOKBENCH_ROOT?.trim();
  if (fromEnv) {
    const root = resolve(fromEnv);
    assertWbbRoot(root);
    return root;
  }
  const candidates = [
    join(repoRoot, "../WorkbookBench"),
    join(repoRoot, "../../Documents/GitHub/WorkbookBench"),
  ];
  for (const candidate of candidates) {
    const root = resolve(candidate);
    if (existsSync(join(root, WBB_MANIFEST_REL))) return root;
  }
  throw new Error(
    "WorkbookBench root not found. Set WORKBOOKBENCH_ROOT to a clone that contains assets/catalog/manifest.json",
  );
}

function assertWbbRoot(root) {
  if (!existsSync(join(root, WBB_MANIFEST_REL))) {
    throw new Error(`WORKBOOKBENCH_ROOT is not a WorkbookBench clone (missing ${WBB_MANIFEST_REL}): ${root}`);
  }
}
