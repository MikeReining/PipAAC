/**
 * iOS build of the blob verbs sync.mjs takes from public/db.js (044 C2).
 * Bytes live in Swift-owned files under Application Support — user media
 * is persistent, never cache-only. The fetcher registry stays in JS: it
 * is a closure over the running sync's relay client.
 */
import { b64uToBytes, bytesToB64u, hostCall } from "../jsc_shims.mjs";

let blobFetcher = null;
export const setBlobFetcher = (fn) => { blobFetcher = fn; };
/** Facade accessor: the lazy relay pull for a sha not yet on disk. */
export const getBlobFetcher = () => blobFetcher;

export async function saveBlobBytes(sha, bytes) {
  await hostCall("blob.save", { sha, b64: bytesToB64u(bytes) });
}

export async function loadBlobBytes(sha) {
  const b64 = await hostCall("blob.load", { sha }).catch(() => null);
  return b64 == null ? null : b64uToBytes(b64);
}
