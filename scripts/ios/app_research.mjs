/**
 * "Share anonymous counts with Pip" (phase 044 E-int): the web's
 * public/shared/research.mjs `flushResearch`, unchanged, called from the
 * same places the web calls it:
 *   board.js refreshAndReport  -> after the stats days are recomputed
 *                                 (here: after a spoken sentence, app_say.mjs,
 *                                 and when the sync loop is up, app_sync.mjs)
 *   settings-sync.js           -> the switch turned On (app.mjs appSetSetting)
 * Fire-and-forget: a dead network never touches the board. The whitelist,
 * the research id and the off switch all live in flushResearch; the base URL
 * is the core's location.origin (the relay base the app was started with).
 * Exported to Swift as PIPCORE.research.
 */
import { flushResearch } from "../../public/shared/research.mjs";

/** Send what is pending, if the switch is on. Never throws, never awaited. */
export function report(db) {
  try {
    flushResearch(db).catch((e) => console.error(`research: ${e}`));
  } catch (e) { console.error(`research: ${e}`); }
}
