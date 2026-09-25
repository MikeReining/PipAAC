/**
 * Small children-phrase-table fixtures for tests — the same shape as
 * data/prediction/phrase_table.en.json:
 *   { contexts: { "sns_x sns_y": { "sns_z": n } } }
 * ctx "" is the sentence start. Rows are given as lemma words and
 * resolved to catalog sense ids through the test database.
 */
import { senseMerge } from "../../public/shared/funnel.mjs";

const senseId = (db, lemma) =>
  db.prepare(
    `SELECT sense_id AS id FROM label
     WHERE normalized_text = ? AND kind = 'lemma' AND status = 'approved' AND locale = 'en'`,
  ).all(lemma)[0]?.id;

/** rows: [{ ctx: [lemmas], next: { lemma: n } }]. Merged surfaces
 *  (am/has/him) fold onto the kept sense — the shipped table is built
 *  the same way, so merged ids never appear in real ctx or items. */
export function makeKids(db, rows) {
  const merge = senseMerge(db);
  const idOf = (lemma) => {
    const id = senseId(db, lemma);
    if (!id) throw new Error(`test fixture: no sense for "${lemma}"`);
    return merge.get(id) ?? id;
  };
  const contexts = {};
  for (const { ctx, next } of rows) {
    const key = ctx.map(idOf).join(" ");
    const row = (contexts[key] ??= {});
    for (const [lemma, n] of Object.entries(next)) row[idOf(lemma)] = n;
  }
  return { contexts };
}
