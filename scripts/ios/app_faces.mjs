/**
 * strip.js facesOn + faceCard (025 § 1), as data: the three feeling faces
 * own the strip's last slot from the first word, when the setting is on
 * and the keyboard isn't mid-word. (Edit mode, the supporter's modeling
 * bar and the tour hide the faces here too, as facesOn does; offline
 * is the NWPath verdict the host tells the core.) -> { lit: "happy"|"sad"|"angry"|null, feelings } or null.
 */
import { tourActive } from "./app_firstrun.mjs";
import { modelingActive } from "./app_spotlight.mjs";
import { FEELINGS, expressiveOn, suggestedFeeling } from "../../public/shared/feeling.mjs";

export function facesModel(s) {
  const data = s.catalog.feelingVoice;
  if (!data?.feelings || !s.sentence.length || s.kbBuffer) return null;
  // strip.js facesOn: !live.tour, !live.modeling, !live.editing - hidden AND
  // the slot released, so Edit mode / modeling / the tour show words, no ghost.
  if (s.editing || modelingActive() || tourActive(s.appId).active) return null;
  // strip.js facesOn: `navigator.onLine !== false`. Offline the faces are
  // gone AND their slot is released (renderStrip/renderExpand count
  // facesOn() for the cap), so the family page never leaves a ghost cell.
  if (globalThis.__pipOnline === false) return null;
  if (!expressiveOn(s.d)) return null;
  const pos = (id) => s.d.prepare(
    `SELECT part_of_speech AS p FROM label
     WHERE sense_id = ? AND kind = 'lemma' AND status = 'approved' AND locale = ?`,
  ).all(id, s.locale)[0]?.p ?? null;
  const lit = suggestedFeeling(s.sentence, data,
    (id) => pos(id) === "Pronoun",
    (id) => s.d.prepare("SELECT category AS c FROM personal_entity WHERE id = ?")
      .all(id)[0]?.c ?? null);
  return { lit, feelings: FEELINGS };
}
