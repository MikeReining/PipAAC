/**
 * Ear-review state for elevenlabs-v4-lab (no file deletes — approve / reject flags).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { V4_LAB_BATCH } from "./elevenlabs_v4_lab.mjs";
import { repoRoot } from "./paths.mjs";

export const REVIEW_STATUSES = ["pending", "approved", "rejected"];

export function reviewDocPath(samplesRoot = join(repoRoot, "data/samples")) {
  return join(samplesRoot, V4_LAB_BATCH, "review.json");
}

export function loadReviewDoc(samplesRoot) {
  const path = reviewDocPath(samplesRoot);
  if (!existsSync(path)) {
    return { schemaVersion: 1, updatedAt: null, bySlug: {} };
  }
  const doc = JSON.parse(readFileSync(path, "utf8"));
  doc.bySlug = doc.bySlug ?? {};
  return doc;
}

export function saveReviewDoc(doc, samplesRoot) {
  const path = reviewDocPath(samplesRoot);
  mkdirSync(dirname(path), { recursive: true });
  const out = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    bySlug: doc.bySlug ?? {},
  };
  writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
  return out;
}

/** @param {string} slug */
export function reviewStatusForSlug(slug, doc) {
  const row = doc.bySlug?.[slug];
  const status = row?.status;
  if (REVIEW_STATUSES.includes(status) && status !== "pending") return status;
  return "pending";
}

/**
 * @param {string} slug
 * @param {"approved"|"rejected"|"pending"} status
 */
export function setReviewStatus(slug, status, samplesRoot) {
  if (!slug) throw new Error("slug is required");
  if (!REVIEW_STATUSES.includes(status)) throw new Error(`invalid review status: ${status}`);
  const doc = loadReviewDoc(samplesRoot);
  if (status === "pending") {
    delete doc.bySlug[slug];
  } else {
    doc.bySlug[slug] = { status, at: new Date().toISOString() };
  }
  return saveReviewDoc(doc, samplesRoot);
}

export function reviewSummary(doc) {
  const counts = { pending: 0, approved: 0, rejected: 0 };
  for (const row of Object.values(doc.bySlug ?? {})) {
    if (row?.status === "approved") counts.approved += 1;
    else if (row?.status === "rejected") counts.rejected += 1;
  }
  return counts;
}
