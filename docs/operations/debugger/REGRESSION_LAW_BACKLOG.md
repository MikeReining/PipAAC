# Regression Law Backlog

Regression laws promoted from debugger patterns. Each entry must name a
`wallCommand` reachable from `npm run check` or `npm test`.

| Law | wallCommand | Status |
| --- | --- | --- |
| Do not repair an iOS keyboard pan with `scrollTo`. The sentence bar stays on screen only when `#app` occupies the visual viewport; a pan with `scrollY` 0 still hides the bar until that frame moves | `scripts/test.sh src/board/viewport.test.mjs` | open |
| An open or cleared sentence must not train next-word history, and a word that never followed the context must not inherit its lifetime share | `scripts/test.sh src/board/strip_history.test.mjs` | open |
