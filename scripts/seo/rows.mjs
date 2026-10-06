// Source-map collector — row construction and the evidence proof shared by
// every engine. A row is one line of the source map; columns per
// docs/strategy/SEO_Playbook.md § The source map.

import { domainFor, pageTypeFor, destinationFor } from "./destination.mjs";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const slug = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export function makeRow(engine, question, url, title, date) {
  return {
    question,
    engine,
    url,
    domain: domainFor(url),
    pageType: pageTypeFor(url),
    realistic: "",
    destination: destinationFor({ question, url, title }),
    checked: date,
  };
}

export function linkRows(engine, question, links, date) {
  return links.map(({ url, title }) => makeRow(engine, question, url, title, date));
}

// The smoke-check proof: a URL the parser emitted must appear in the saved
// page/CLI evidence — otherwise the tool claimed a link the source never
// showed, and the run fails.
export function assertInEvidence(rows, evidenceUrls, engine, question) {
  for (const r of rows) {
    if (r.url && !evidenceUrls.has(r.url)) {
      throw new Error(`proof failed: ${engine} row url not on the page for "${question}": ${r.url}`);
    }
  }
}
