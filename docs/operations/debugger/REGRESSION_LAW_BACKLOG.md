# Regression Law Backlog

Regression laws promoted from debugger patterns. Each entry must name a
`wallCommand` reachable from `npm run check` or `npm test`.

| Law | wallCommand | Status |
| --- | --- | --- |
| A flow that opened the device keyboard must never reveal the board in the same document — the welcome's Continue navigates (`location.replace`) and the tour resumes via the consumed `pip_tour` flag | `node --test src/board/onramp_exit.test.mjs` | open |
| An open or cleared sentence must not train next-word history, and a word that never followed the context must not inherit its lifetime share | `scripts/test.sh src/board/strip_history.test.mjs` | open |
