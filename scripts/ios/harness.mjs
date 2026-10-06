/**
 * A0 fixture harness — evaluated inside the app's JSContext (as the
 * generated pip-harness.js bundle) AND imported by
 * scripts/ios/export_fixtures.mjs under node. One implementation of the
 * probe/replay orchestration on both engines is the whole point: an iOS
 * run that matches its fixtures proves JSC + the bundled SQLite give the
 * core the same answers node does, byte for byte.
 *
 * Host contract (registered natively before the bundles evaluate):
 *   __pipHost.dbExec(dbId, sql)
 *   __pipHost.dbRun(dbId, sql, params)   -> { changes }
 *   __pipHost.dbAll(dbId, sql, params)   -> { columns: [...], rows: [[...]] }
 *      (SQLITE_BLOB cells cross as { __pipBytes: number[] })
 * Under node the exporter supplies the same contract over node:sqlite.
 */

const PIP = () => globalThis.PIPCORE;
const HOST = () => globalThis.__pipHost;

/* Canonical JSON: object keys sorted recursively, byte arrays marked,
 * undefined dropped — the same string on V8 and JSC, so byte compares
 * are honest compares. */
export function canon(v) {
  if (v === null || typeof v === "number" || typeof v === "string"
      || typeof v === "boolean") return JSON.stringify(v);
  if (v instanceof Uint8Array) return canon({ b: [...v] });
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort()
    .map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`;
}

const adapters = new Map(); // dbId -> stable adapter (WeakMap caches key on it)
export function db(id) {
  if (!adapters.has(id)) adapters.set(id, PIP().makeDb(id));
  return adapters.get(id);
}
export function closeDb(id) { adapters.delete(id); }

const parse = (x) => (typeof x === "string" ? JSON.parse(x) : x);

/* Swift-side compares call these so canonicalization happens on the JS
 *  engine under test, not in Foundation. */
export function canonJson(json) { return canon(parse(json)); }
export function matchCanonJson(got, json) {
  return canon(got) === canon(parse(json));
}

/* ---------------- replay fixtures ---------------- */

/** Rebuild a replica's pre-drain state: its recorded ops apply through
 *  the same owners (recording suppressed), then land in the log as
 *  pending rows — exactly what recordOp produced on the writer. */
export function installPending(dbId, ops) {
  const d = db(dbId);
  const ins = d.prepare(
    "INSERT INTO sync_op (op_id, device_id, kind, args, created_at) VALUES (?, ?, ?, ?, ?)");
  for (const op of ops) {
    PIP().ops.applyOp(d, op);
    ins.run(op.op_id, op.device_id ?? "dev_local", op.kind,
      typeof op.args === "string" ? op.args : JSON.stringify(op.args),
      op.created_at ?? 0);
  }
}

/** Sorted dump of every synced table — the compare unit. */
export function dumpSynced(dbId) {
  const d = db(dbId);
  const out = {};
  for (const t of PIP().ops.SYNCED_TABLES) {
    out[t] = d.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all().map(canon);
  }
  return out;
}

/** Replay one fixture: install pending ops, drain the relay stream,
 *  dump, diff against expect. Returns { ok, diffs } — diffs carry the
 *  first few rows per table for the log, counts for the summary. */
export function runReplay(dbId, fixture) {
  const fx = parse(fixture);
  installPending(dbId, fx.localOps);
  PIP().ops.drainOps(db(dbId), fx.relay);
  const got = dumpSynced(dbId);
  const diffs = [];
  const tables = new Set([...Object.keys(fx.expect ?? {}), ...Object.keys(got)]);
  for (const t of tables) {
    const e = fx.expect?.[t] ?? [], g = got[t] ?? [];
    if (e.length !== g.length || e.some((r, i) => r !== g[i])) {
      diffs.push({ table: t, expectRows: e.length, gotRows: g.length,
        firstDiffAt: e.findIndex((r, i) => r !== g[i]),
        expectSample: e.filter((r) => !g.includes(r)).slice(0, 3),
        gotSample: g.filter((r) => !e.includes(r)).slice(0, 3) });
    }
  }
  return { ok: diffs.length === 0, diffs };
}

/** A timed catch-up: drain one big confirmed stream. Swift times the
 *  call; returns the row count applied so a test can assert it ran. */
export function runDrain(dbId, relay) {
  PIP().ops.drainOps(db(dbId), parse(relay));
  return dumpSynced(dbId);
}

/* ---------------- probes: tap -> strip + form ---------------- */

const sessions = new Map();
let nextSid = 1;

/* Fixtures are authored UTC (manifest.tz): the fixture db's tz_offset_min
 * rows are 0, and stripRanked's "her now" window reads the runtime zone.
 * Pin the probe session to UTC so a device in any zone replays the
 * fixture's arithmetic — an unpinned run selects a different window and
 * diverges on zone alone. */
const pinUtc = () => { Date.prototype.getTimezoneOffset = () => 0; };

/** One probe session over a db: the shipped answer tables live in it. */
export function probeBegin(dbId, kidsTable, formTable) {
  pinUtc();
  const sid = `s${nextSid++}`;
  sessions.set(sid, { d: db(dbId), kids: parse(kidsTable),
    forms: parse(formTable), sentence: [], sentenceId: null, pos: 0 });
  return sid;
}
export function probeSentenceStart(sid, at) {
  const s = sessions.get(sid);
  s.sentence = []; s.pos = 0;
  s.sentenceId = PIP().funnel.openSentence(s.d, at);
}
export function probeSentenceEnd(sid, at) {
  const s = sessions.get(sid);
  if (s.sentenceId != null) {
    PIP().funnel.closeSentence(s.d, s.sentenceId, at, "spoken");
    s.sentenceId = null;
  }
}

/* The board's own sense->POS lookup (forms decision 4 needs Noun). */
function posOfSense(d, senseId, locale) {
  return d.prepare(
    `SELECT part_of_speech AS p FROM label
     WHERE sense_id = ? AND kind = 'lemma' AND status = 'approved' AND locale = ?`,
  ).all(senseId, locale)[0]?.p ?? null;
}

/* board.js:686-744 — tap append + decision-4 re-pick + the log row.
 *  Mirrors the web tap path exactly; when the app path changes this
 *  moves with it (one harness, both engines). */
function appendAndLog(s, kind, id, text, at) {
  const { d, forms, sentence } = s;
  let item = { kind, id, text };
  let form = null;
  if (kind === "sense" && id) {
    form = PIP().forms.formFor(d, forms, sentence, id);
    item = { kind: "sense", id: form.senseId, text: form.text ?? text,
      labelId: form.labelId, fixed: form.merged, features: form.features };
  }
  sentence.push(item);
  const atIndex = sentence.length - 1;
  let repick = null;
  if (atIndex >= 1) {
    const prev = sentence[atIndex - 1], cur = sentence[atIndex];
    if (prev.kind === "entity" && cur?.kind === "sense" && cur.id
        && posOfSense(d, cur.id, s.locale ?? "en") === "Noun"
        && !prev.text.endsWith("'s")) {
      repick = { pos: atIndex - 1, text: `${prev.text}'s` };
      prev.text = repick.text;
    } else if (prev.kind === "sense" && prev.id && !prev.fixed) {
      const re = PIP().forms.formFor(d, forms, sentence.slice(0, atIndex - 1), prev.id, cur);
      if (re.text !== prev.text) {
        repick = { pos: atIndex - 1, text: re.text, labelId: re.labelId,
          features: re.features };
        prev.text = re.text; prev.labelId = re.labelId; prev.features = re.features;
        if (s.sentenceId != null) {
          const pos = sentence.slice(0, atIndex - 1).filter((it) => it.id).length;
          d.prepare(
            "UPDATE learner_event_log SET label_id = ? WHERE sentence_id = ? AND position = ?",
          ).run(re.labelId, s.sentenceId, pos);
        }
      }
    }
  }
  if (id) {
    if (s.sentenceId == null) { s.sentenceId = PIP().funnel.openSentence(s.d, at); }
    PIP().funnel.fillChosen?.(s.d, s.sentenceId, { kind, id: item.id ?? id, source: "grid" });
    PIP().funnel.logSelection(s.d, kind, item.id ?? id, at, {
      sentenceId: s.sentenceId, position: s.pos++, source: "grid",
      labelId: item.labelId ?? null, groupId: null });
  }
  return { item, form, repick };
}

/** One timed probe step: the tap append (form + re-pick + log) and the
 *  Smart bar after it. Swift times the whole call — "Smart bar + forms
 *  per tap" is this call. Returns the canonical result for the byte
 *  compare; the fixture's `expect` was computed by this same function. */
export function probeTap(sid, tap, at) {
  const s = sessions.get(sid);
  const { form, repick } = appendAndLog(s, tap.kind, tap.id, tap.text, at);
  const strip = PIP().funnel.stripCandidates(
    s.d, s.sentence, at, s.locale ?? "en", s.kids);
  return canon({ form, repick, strip });
}
export function probeFinish(sid) { sessions.delete(sid); }

/* ---------------- diagnostics ---------------- */

/** Bridge floor: n trivial queries through the adapter — the per-call
 *  cost everything else pays. */
export function benchHost(dbId, n = 200) {
  const st = db(dbId).prepare("SELECT 1 AS x");
  const t0 = Date.now();
  for (let i = 0; i < n; i++) st.all();
  return Date.now() - t0;
}

/** probeTap with phase split: { canon, appendMs, stripMs } — append is
 *  form + re-pick + the log write; strip is stripRanked. Diagnostics
 *  only; canon matches probes.json's expect for the same tap. */
export function probeTapTimed(sid, tap, at) {
  const s = sessions.get(sid);
  const t0 = Date.now();
  const { form, repick } = appendAndLog(s, tap.kind, tap.id, tap.text, at);
  const t1 = Date.now();
  const strip = PIP().funnel.stripCandidates(
    s.d, s.sentence, at, s.locale ?? "en", s.kids);
  return { canon: canon({ form, repick, strip }),
    appendMs: t1 - t0, stripMs: Date.now() - t1 };
}

/* ---------------- golden cases (bar + forms) ---------------- */

/** The table pair a probe/golden session reads — once per db. */
export function loadTables(sid, kidsTable, formTable, locale = "en") {
  const s = sessions.get(sid);
  s.kids = parse(kidsTable); s.forms = parse(formTable); s.locale = locale;
}

/** One bar_examples row: history sentences replayed through the real
 *  log calls, then stripRanked over the phrase. Fixture carries resolved
 *  sense ids; returns { shown, ending } for the compare. */
export function barGolden(dbId, k) {
  const d = db(dbId);
  for (const h of k.history) {
    const s = PIP().funnel.openSentence(d, h.at);
    h.items.forEach((it, i) =>
      PIP().funnel.logSelection(d, it.kind, it.id, h.at + i,
        { sentenceId: s, position: i }));
    PIP().funnel.closeSentence(d, s, h.at + h.items.length, "spoken");
  }
  const { shown, ending } = PIP().funnel.stripRanked(
    d, k.phrase, k.at, "en", parse(k.kids));
  return { shown, ending };
}

/** One form_examples row: taps through the board's append path (entity
 *  spec writes its rows like the runner's resolveItem), optional speak
 *  EOS re-pick, optional trailing bar list. Returns the texts. */
export function formGolden(dbId, k) {
  const d = db(dbId);
  const s = { d, forms: parse(k.forms), kids: null, sentence: [],
    sentenceId: null, pos: 0, locale: "en" };
  const t0 = k.at ?? Date.now();
  let ti = 0;
  for (const spec of k.taps) {
    const at = t0 + ti++ * 1000;
    if (spec.entity) {
      d.prepare(
        "INSERT INTO personal_entity (id, spoken_name, status) VALUES ('ent_leo', ?, 'active')",
      ).run(spec.entity);
      if (spec.link) {
        d.prepare(
          `INSERT INTO entity_enrichment
             (id, entity_id, sense_suggestion, model, prompt_version, status)
           VALUES ('enr_link', 'ent_leo', ?, 'manual', 'v1', 'ready')`,
        ).run(spec.link);
      }
      appendAndLog(s, "entity", "ent_leo", spec.entity, at);
    } else {
      appendAndLog(s, "sense", spec.sense, spec.text ?? null, at);
    }
  }
  if (k.speak && s.sentence.length) {
    const last = s.sentence[s.sentence.length - 1];
    if (last.kind === "sense" && last.id) {
      const f = PIP().forms.formFor(d, s.forms,
        s.sentence.slice(0, -1), last.id, PIP().forms.EOS, last.features);
      if (f.text !== last.text) {
        last.text = f.text; last.labelId = f.labelId; last.features = f.features;
      }
    }
  }
  let bar = null;
  if (k.barRank) {
    const { shown } = PIP().funnel.stripRanked(
      d, s.sentence.map((x) => ({ kind: x.kind, id: x.id })), k.at, "en",
      parse(k.kids));
    bar = shown.map((c) =>
      PIP().forms.formFor(d, s.forms, s.sentence, c.id).text ?? c.id);
  }
  return { texts: s.sentence.map((x) => x.text), last: s.sentence.at(-1)?.text, bar };
}

/** One recorded edit, for the op-record timing probe. `call` is a
 *  dotted PIPCORE export path ("groups.renameEntity"). */
export function oneEdit(dbId, call, args) {
  const fn = call.split(".").reduce((o, k) => o?.[k], PIP());
  if (typeof fn !== "function") throw new Error(`no core fn ${call}`);
  fn(db(dbId), ...(args ?? []));
  return true;
}
