import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { WBB_R2_BUCKET } from "./paths.mjs";

export { WBB_R2_BUCKET as R2_BUCKET };

export function r2GetArgs(objectKey, destPath) {
  return [
    "r2",
    "object",
    "get",
    `${WBB_R2_BUCKET}/${objectKey}`,
    "--file",
    destPath,
    "--remote",
  ];
}

export function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

/** Local path mirroring an R2 audio key (`audio/word/hash.mp3`). */
export function localPathForAudioKey(cacheRoot, key) {
  if (typeof key !== "string" || !key.startsWith("audio/") || key.includes("..")) {
    throw new Error(`invalid audio object key: ${JSON.stringify(key)}`);
  }
  return join(cacheRoot, key);
}
