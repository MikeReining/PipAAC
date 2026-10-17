/** Word-tile label size (Design_System § Word tiles). The label comes from
 *  the tile, and its strip is one line of it — LABEL_LINE × the size,
 *  Andika's text box — so the art keeps everything else. A tall tile's art
 *  is bound by its width, so the label may grow into height the art could
 *  never use. Same-size tiles get the same size, so a board reads uniform.
 *  The floor keeps a 90-cell iPad board legible; tiny tiles (mini
 *  previews) scale below it. The iOS board mirrors this (TileView). */
export const LABEL_LINE = 1.6;

export function tileLabelPx(w, h) {
  const fit = Math.round(Math.max(
    Math.min(h * 0.16, w * 0.2),
    Math.min((h - w) / LABEL_LINE, w * 0.26),
  ));
  return Math.min(28, Math.max(fit, Math.min(11, Math.round(h * 0.22))));
}
