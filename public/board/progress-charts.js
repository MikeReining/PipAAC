/**
 * The Progress page's small charts (Stats_And_Progress § 4.2): a trend
 * line, a column chart, and the own-vs-glow weekly bars. Each returns
 * SVG markup drawn on one scale from the values it is given — no axis
 * label names a value the chart doesn't reach. Ink carries data; the
 * Spotlight glow amber means "with the glow" and nothing else
 * (Design_System.md: hue in the product means grammar only).
 * Colors come from classes in progress-ui.css so the page owns them.
 */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[c]};`);
const f1 = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** A trend line over `values` (nulls are gaps — a quiet period's rate
 *  has no value, so the line breaks instead of inventing one). The
 *  latest point is marked. `labels[i]` names each point for hover. */
export function sparkline(values, labels, aria) {
  const W = 200, H = 48, pad = 5, base = H - 3;
  const real = values.filter((v) => v != null);
  const max = Math.max(...real, 0) || 1;
  const x = (i) => pad + (i * (W - 2 * pad)) / Math.max(values.length - 1, 1);
  const y = (v) => base - (v / max) * (H - 10);
  const runs = [];
  let run = [];
  values.forEach((v, i) => {
    if (v == null) { if (run.length) runs.push(run); run = []; } else run.push(i);
  });
  if (run.length) runs.push(run);
  let s = `<line class="pc-grid" x1="${pad}" x2="${W - pad}" y1="${base}" y2="${base}"/>`;
  for (const r of runs) {
    const pts = r.map((i) => `${x(i).toFixed(1)},${y(values[i]).toFixed(1)}`);
    if (r.length > 1) {
      s += `<path class="pc-area" d="M${x(r[0]).toFixed(1)},${base} L${pts.join(" L")} L${x(r.at(-1)).toFixed(1)},${base} Z"/>`;
      s += `<polyline class="pc-line" points="${pts.join(" ")}"/>`;
    } else {
      s += `<circle class="pc-ink" cx="${x(r[0])}" cy="${y(values[r[0]])}" r="2"/>`;
    }
  }
  const last = values.findLastIndex((v) => v != null);
  if (last >= 0) s += `<circle class="pc-end" cx="${x(last)}" cy="${y(values[last])}" r="3.5"/>`;
  values.forEach((v, i) => {
    s += `<circle class="pc-hit" cx="${x(i)}" cy="${v == null ? base : y(v)}" r="8"><title>${esc(labels[i])}: ${v == null ? "—" : f1(v)}</title></circle>`;
  });
  return `<svg class="pc-spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">${s}</svg>`;
}

/** Columns for `values`, the tallest (or `highlight`) in ink and the
 *  rest in edge grey; every `every`-th label sits under its column.
 *  `ticks` draws faint value lines (only values the scale reaches) with
 *  their labels in a left gutter. `width` is the drawn width in CSS
 *  pixels, so text renders at its real size. */
export function columns(values, labels, { every = 1, highlight = null, ticks = [], unit = "", aria = "", width = 320 } = {}) {
  const W = Math.max(160, Math.round(width)), H = 96, foot = 14, n = values.length;
  const left = ticks.length ? 14 : 0;
  const gap = n > 14 ? 2 : n > 8 ? 4 : 6;
  const bw = (W - left - gap * (n - 1)) / n;
  const max = Math.max(...values.map((v) => v ?? 0), ...ticks, 0) || 1;
  const top = 8;
  const y = (v) => H - foot - (v / max) * (H - foot - top);
  const hi = highlight ?? values.indexOf(Math.max(...values.map((v) => v ?? 0)));
  let s = "";
  for (const t of ticks) {
    s += `<line class="pc-grid" x1="${left}" x2="${W}" y1="${y(t)}" y2="${y(t)}"/><text class="pc-txt" x="0" y="${y(t) + 3.5}">${f1(t)}</text>`;
  }
  s += `<line class="pc-grid" x1="${left}" x2="${W}" y1="${H - foot}" y2="${H - foot}"/>`;
  values.forEach((v, i) => {
    const x = left + i * (bw + gap);
    const h = v ? (H - foot) - y(v) : 0;
    s += `<g><title>${esc(labels[i])}: ${v == null ? "—" : f1(v)}${unit}</title>`
      + `<rect class="pc-hit" x="${x}" y="0" width="${bw}" height="${H - foot}"/>`
      + (h > 0 ? `<rect class="${i === hi ? "pc-ink" : "pc-edge"}" x="${x}" y="${y(v)}" width="${bw}" height="${h}" rx="${Math.min(3, bw / 3)}"/>` : "")
      + "</g>";
    if (i % every === 0) {
      s += `<text class="pc-txt" x="${x + bw / 2}" y="${H}" text-anchor="middle">${esc(labels[i])}</text>`;
    }
  });
  return `<svg class="pc-cols" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">${s}</svg>`;
}

/** One target's weekly bars: on their own (ink) under with the glow
 *  (amber), a 2px gap between, on a `max` shared by every row so rows
 *  compare. A week with neither gets a hairline, not nothing. */
export function ownGlowBars(own, glow, max, labels, aria) {
  const W = 320, H = 40, n = own.length;
  // At least eight slots, newest on the right: two weeks draw as two
  // bars, not two slabs.
  const slots = Math.max(n, 8), lead = slots - n;
  const gap = slots > 14 ? 2 : 5;
  const bw = (W - gap * (slots - 1)) / slots;
  const m = max || 1;
  let s = "";
  own.forEach((o, i) => {
    const g = glow[i], x = (lead + i) * (bw + gap);
    const ho = (o / m) * (H - 2), hg = (g / m) * (H - 2);
    const yo = H - ho, yg = yo - hg - (o && g ? 2 : 0);
    s += `<g><title>${esc(labels[i])}: on their own ${o}, with the glow ${g}</title>`
      + `<rect class="pc-hit" x="${x}" y="0" width="${bw}" height="${H}"/>`
      + (o ? `<rect class="pc-ink" x="${x}" y="${yo}" width="${bw}" height="${ho}" rx="2"/>` : "")
      + (g ? `<rect class="pc-glow" x="${x}" y="${yg}" width="${bw}" height="${hg}" rx="2"/>` : "")
      + (!o && !g ? `<rect class="pc-none" x="${x}" y="${H - 2}" width="${bw}" height="2"/>` : "")
      + "</g>";
  });
  return `<svg class="pc-og" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(aria)}">${s}</svg>`;
}
