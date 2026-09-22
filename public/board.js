/**
 * Slice 1 board render: grid60 cells, label + Fitzgerald color.
 * The catalog JSON is generated from docs/product/Core_Coordinate_Map.md;
 * the DB-side coordinate table is proven identical by core_map.test.mjs.
 */
const res = await fetch("/catalog.json");
const catalog = await res.json();

const layout = catalog.layouts.grid60;
const senseById = new Map(catalog.senses.map((s) => [s.id, s]));
const labelBySense = new Map(
  catalog.labels
    .filter((l) => l.kind === "lemma" && l.status === "approved" && l.locale === "en")
    .map((l) => [l.sense_id, l.text]),
);

const grid = document.getElementById("grid");
grid.style.gridTemplateColumns = `repeat(${layout.cols}, 1fr)`;
grid.style.gridTemplateRows = `repeat(${layout.rows}, 1fr)`;

for (const cell of catalog.coreCells.filter((c) => c.layout === "grid60")) {
  const sense = senseById.get(cell.sense_id);
  const el = document.createElement("div");
  el.className = `cell r-${sense.fitzgerald_role}`;
  el.textContent = labelBySense.get(cell.sense_id);
  el.style.order = cell.slot_index;
  grid.appendChild(el);
}
