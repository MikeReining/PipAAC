/**
 * The one-tap progress report (016 slice 4, Stats_And_Progress § 4.2):
 * a small, self-contained PDF — the numbers, the trends, the goal
 * words, and the date range, for an IEP meeting. No library: the file
 * is plain Helvetica text on letter pages, built line by line.
 * Generated on the device, shared through the system share sheet.
 */

import { dashboard } from "./dashboard.mjs";

const te = new TextEncoder();
const esc = (s) => String(s).replace(/[\\()]/g, (c) => `\\${c}`);
const fmt = (n, digits = 1) =>
  n == null ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(digits);

/** Report text lines for a dashboard aggregate + range label. Pure —
 *  the same lines feed the PDF and the tests. */
export function reportLines(dash, { userName, fromLabel, toLabel }) {
  const lines = [
    `Pip progress report — ${userName}`,
    `${fromLabel} to ${toLabel}`,
    "",
    `${dash.words} words  ·  ${dash.different} different  ·  ${dash.newCount} new`,
    `Sentences spoken: ${dash.sentences}  ·  mean length ${fmt(dash.wordsPerSentence)} words  ·  longest ${dash.longest} words`,
    `Words per minute: ${fmt(dash.wpm)}`,
    "",
    "By week (newest last):",
    ...dash.weeks.map((w) =>
      `  w/c day ${w.week * 7}: ${w.words} words, ${w.different} different, ` +
      `mean sentence ${fmt(w.wordsPerSentence)}, wpm ${fmt(w.wpm)}`),
    "",
    `Top words: ${dash.topWords.map((t) => `${t.name} (${t.taps})`).join(", ") || "—"}`,
    `First time: ${[...dash.newWords].sort((a, b) => a.day - b.day).map((w) => w.name).join(", ") || "—"}`,
    "",
    `Core ${dash.core}  ·  fringe ${dash.fringe}  ·  own words ${dash.own}`,
    `Smart bar help: ${Math.round(dash.stripShare * 100)}% of taps`,
  ];
  if (dash.goals.length) {
    lines.push("", "Goal words:");
    for (const g of dash.goals) {
      lines.push(`  ${g.name}:`);
      for (const [week, targets] of Object.entries(g.weeks).sort()) {
        for (const [key, t] of Object.entries(targets)) {
          lines.push(`    week ${week}: ${key.split(":")[1]} — on their own ${t.own}, with the glow ${t.glow}`);
        }
      }
    }
  }
  return lines;
}

/** A valid single/multi-page PDF of `lines`. */
export function linesToPdf(lines) {
  const PER_PAGE = 44;
  const pages = [];
  for (let i = 0; i < lines.length; i += PER_PAGE) pages.push(lines.slice(i, i + PER_PAGE));
  if (!pages.length) pages.push([""]);

  const kids = pages.map((_, i) => 3 + i * 2);
  const fontObj = 3 + pages.length * 2;
  const objs = [];
  objs[0] = "<</Type/Catalog/Pages 2 0 R>>";
  objs[1] = `<</Type/Pages/Kids[${kids.map((k) => `${k} 0 R`).join(" ")}]/Count ${pages.length}>>`;
  pages.forEach((page, i) => {
    const content = `BT /F1 12 Tf 56 740 Td 16 TL\n${page.map((l) => `(${esc(l)}) Tj T*`).join("\n")}\nET`;
    objs[kids[i] - 1] =
      `<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents ${kids[i] + 1} 0 R` +
      `/Resources<</Font<</F1 ${fontObj} 0 R>>>>>>`;
    objs[kids[i]] = `<</Length ${te.encode(content).length}>>stream\n${content}\nendstream`;
  });
  objs[fontObj - 1] = "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>";

  let out = "%PDF-1.4\n";
  const xref = [0];
  objs.forEach((body, i) => {
    xref.push(te.encode(out).length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = te.encode(out).length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) out += `${String(xref[i]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xrefAt}\n%%EOF`;
  return te.encode(out);
}

/** The report for a range: aggregate → lines → PDF bytes. */
export function reportPdf(db, fromDay, toDay, meta, nameOf, mode) {
  const dash = dashboard(db, fromDay, toDay, { nameOf, mode });
  return { pdf: linesToPdf(reportLines(dash, meta)), dash };
}
