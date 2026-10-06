// Source-map collector — the dated run note and the living map.
// The living map is append-only for the collector: it may add a row whose
// question+engine+url is new, and must never delete a row, change `realistic`,
// or replace a destination a person has edited. The dated run note is
// regenerated from scratch each run.

export const MAP_HEADER = [
  "# Source map",
  "",
  "Living file. The collector (`npm run seo:collect`) may add rows; it never",
  "deletes a row and never overwrites `realistic` or a `destination` a person",
  "has set. Column meanings: docs/strategy/SEO_Playbook.md § The source map.",
  "",
];

const COLUMNS = ["question", "engine", "url", "domain", "page type", "realistic", "destination", "checked"];

function cell(s) {
  return String(s ?? "").replace(/\|/g, "/").trim();
}

export function rowKey(r) {
  return `${r.question}\u001c${r.engine}\u001c${r.url}`;
}

function rowLine(r) {
  return (
    "| " +
    [r.question, r.engine, r.url, r.domain, r.pageType, r.realistic, r.destination, r.checked]
      .map(cell)
      .join(" | ") +
    " |"
  );
}

export function parseTableRows(markdown) {
  const rows = [];
  for (const line of String(markdown).split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line
      .slice(1, line.endsWith("|") ? -1 : undefined)
      .split("|")
      .map((c) => c.trim());
    if (cells.length !== COLUMNS.length) continue;
    if (cells[0] === "question" || /^-+$/.test(cells[0])) continue;
    const [question, engine, url, domain, pageType, realistic, destination, checked] = cells;
    rows.push({ question, engine, url, domain, pageType, realistic, destination, checked });
  }
  return rows;
}

export function renderRunNote({ date, seeds, phrases, dropped, rows, notes }) {
  const lines = [
    `# Source map run — ${date}`,
    "",
    `Collector run of \`npm run seo:collect\`. The living map is`,
    `\`docs/strategy/seo/source-map.md\`; this note is regenerated, never curated.`,
    "",
    `## Phrases (${phrases.length})`,
    "",
    ...phrases.map((p) => `- ${p}${seeds.includes(p) ? " (seed)" : ""}`),
    "",
    "## Dropped phrases",
    "",
    ...(dropped.length ? dropped.map((p) => `- ${p}`) : ["- none"]),
    "",
    `## Rows (${rows.length})`,
    "",
    "| question | engine | url | domain | page type | realistic | destination | checked |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map(rowLine),
    "",
    "## Notes",
    "",
    ...(notes.length ? notes.map((n) => `- ${n}`) : ["- none"]),
    "",
  ];
  return lines.join("\n");
}

// Append-only merge: existing lines are preserved byte-for-byte; only rows
// whose question+engine+url are not already present get appended.
export function mergeMap(existing, newRows, date) {
  const hasFile = existing != null && String(existing).trim() !== "";
  const existingRows = hasFile ? parseTableRows(existing) : [];
  const seen = new Set(existingRows.map(rowKey));
  const added = [];
  for (const r of newRows) {
    if (!r.url || seen.has(rowKey(r))) continue;
    seen.add(rowKey(r));
    added.push(r);
  }
  let text;
  if (!hasFile) {
    text =
      MAP_HEADER.join("\n") +
      "\n| question | engine | url | domain | page type | realistic | destination | checked |\n" +
      "| --- | --- | --- | --- | --- | --- | --- | --- |\n";
  } else {
    text = String(existing).replace(/\s*$/, "\n");
  }
  if (added.length) text += added.map(rowLine).join("\n") + "\n";
  return { text, added, existingCount: existingRows.length };
}

// Domains in the newest prior run note vs this run — for the post-merge lists.
export function domainDiff(previousNoteMarkdown, rows) {
  const prev = new Set(parseTableRows(previousNoteMarkdown || "").map((r) => r.domain).filter(Boolean));
  const cur = new Set(rows.map((r) => r.domain).filter(Boolean));
  return {
    added: [...cur].filter((d) => !prev.has(d)).sort(),
    gone: [...prev].filter((d) => !cur.has(d)).sort(),
  };
}
