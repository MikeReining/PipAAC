# Debugger Log

| Date | Tier | Summary | Truth owner | Resolution |
| --- | --- | --- | --- | --- |
| 2026-09-22 | T2 | Browser DB never persisted: `OpfsDb` can't install on the main thread (worker-only `Atomics.wait`/`createSyncAccessHandle`), so the board silently ran `:memory:` and every entity/arrangement was lost on reload | `public/db.js` storage backend | Switched to `JsStorageDb("local")` (kvvfs → localStorage), the only vendored main-thread VFS; `persistent` now gated on `localStorage instanceof Storage` because kvvfs fabricates in-memory storage when blocked. Commit c2c2fd2 |

## 2026-09-22 opfs-main-thread

Tier: T2
Truth owner: `public/db.js` — which sqlite-wasm VFS backs the on-device DB
Lie-prone layer: the `sqlite3.oo1.OpfsDb && self.crossOriginIsolated` guard — the first half was always undefined, so the "persistent" branch never ran; the console.warn fallback was the only honest signal and nobody watched it
Proof: node --test src/board/groups.test.mjs; live CDP probe on dev:agent — `OpfsDb`/`sqlite3.opfs` undefined, OPFS root empty, a `JsStorageDb` row and caregiver edits surviving reload (commit c2c2fd2)
Pattern candidate: a capability check that only runs when the feature is missing is self-sealing — assert the positive path ("a row survives reload"), not the constructor's existence

## Template

```text
## YYYY-MM-DD <fingerprint>

Tier: T1|T2|T3
Truth owner:
Lie-prone layer:
Proof: npm test
Pattern candidate: (optional)
```
