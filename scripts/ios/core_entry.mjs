/**
 * The iOS shared core (phase 044 § 6 A0-S1): the data-side modules of
 * public/shared/ bundled for JavaScriptCore — one file, evaluated once
 * per app process, never downloaded (App Review 2.5.2). Sync transport,
 * crypto, accounts, media and network clients stay native and are NOT
 * here — the platform doc's split table decides the boundary.
 *
 * Build: npm run ios:core (scripts/ios/build_core.mjs); the generated
 * pip-core.js is committed and gated by --check in check:fast.
 */
import "./jsc_shims.mjs"; // FIRST — installs host shims before module eval

export * as ops from "../../public/shared/ops.mjs";
export * as groups from "../../public/shared/groups.mjs";
export * as groupsOps from "../../public/shared/groups_ops.mjs";
export * as groups_shared from "../../public/shared/groups_shared.mjs";
export * as funnel from "../../public/shared/funnel.mjs";
export * as forms from "../../public/shared/forms.mjs";
export * as importer from "../../public/shared/import.mjs";
export * as migrate from "../../public/shared/migrate.mjs";
export * as normalize from "../../public/shared/normalize.mjs";
export * as voice from "../../public/shared/voice.mjs";
export * as images from "../../public/shared/images.mjs";
export * as spotlight from "../../public/shared/spotlight.mjs";
export * as coremove from "../../public/shared/coremove.mjs";
export * as movecost from "../../public/shared/movecost.mjs";
export * as families from "../../public/shared/families.mjs";
export * as stats from "../../public/shared/stats.mjs";
export * as teamNames from "../../public/shared/team_names.mjs";
export * as usecounts from "../../public/shared/usecounts.mjs";
export * as spelling from "../../public/shared/spelling.mjs";
export * as keyboard from "../../public/shared/keyboard.mjs";
export * as keymaps from "../../public/shared/keymaps.mjs";
export * as library from "../../public/shared/library.mjs";
export * as bar from "../../public/shared/bar.mjs";
export * as txbar from "../../public/shared/txbar.mjs";
export * as wincard from "../../public/shared/wincard.mjs";
export * as bulk from "../../public/shared/bulk.mjs";
export * as personName from "../../public/shared/person_name.mjs";
export * as dashboard from "../../public/shared/dashboard.mjs";
export * as report from "../../public/shared/report.mjs";
export * as helpSearch from "../../public/shared/help_search.mjs";
export * as nameShield from "../../public/shared/name_shield.mjs";
export * as feeling from "../../public/shared/feeling.mjs";
export * as voices from "../../public/shared/voices.mjs";
export * as onrampAudio from "../../public/shared/onramp_audio.mjs";
export * as spotlightStarters from "../../public/shared/spotlight_starters.mjs";
export * as recoveryWords from "../../public/shared/recovery_words.mjs";
export * as research from "../../public/shared/research.mjs";
export * as groupIcons from "../../public/shared/group-icon-library.mjs";

/** The app facade (scripts/ios/app.mjs) — the board.js child-mode tap
 *  path and the SwiftUI render models; bundled with the core so the app
 *  and the fixtures run the same rules. */
export * as app from "./app.mjs";

/**
 * The db seam (Platforms § 2): the exact adapt() shape public/db.js
 * hands the shared modules, over the app's bundled SQLite. `dbId` picks
 * the native handle; every call lands on the host's serial executor.
 *
 * prepare().run() re-prepares per call here exactly like the web adapter
 * (which prepares inside run), so callers see identical behavior.
 */
export function makeDb(dbId) {
  const rowify = (res) => {
    if (res?.__err) throw new Error(res.__err);
    const cols = res.columns;
    return res.rows.map((vals) => {
      const o = {};
      for (let i = 0; i < cols.length; i++) {
        const v = vals[i];
        // {__pipBytes:[…]} marks a SQLITE_BLOB — byte bridge, since JSC
        // lacks atob. Sort order in canon() treats it as a byte array.
        o[cols[i]] = v && typeof v === "object" && v.__pipBytes
          ? new Uint8Array(v.__pipBytes) : v;
      }
      return o;
    });
  };
  const wrap = (r) => { if (r?.__err) throw new Error(r.__err); return r; };
  return {
    exec: (sql) => wrap(globalThis.__pipHost.dbExec(dbId, sql)),
    prepare: (sql) => ({
      run: (...params) => wrap(globalThis.__pipHost.dbRun(dbId, sql, params)),
      all: (...params) => rowify(globalThis.__pipHost.dbAll(dbId, sql, params)),
    }),
    all: (sql, params = []) => rowify(globalThis.__pipHost.dbAll(dbId, sql, params)),
  };
}
