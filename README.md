# diff-speed

[![make.fun · diff-speed-01-run-20261126](https://make.fun/badge/diff-speed-01-run-20261126.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![rank](https://make.fun/badge/diff-speed-01-run-20261126/alfinrf97/diff-speed/rank.svg)](https://make.fun/bounty/diff-speed-01-run-20261126/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![reward](https://make.fun/badge/diff-speed-01-run-20261126/alfinrf97/diff-speed/reward.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)

A faster drop-in for makefun-diff 1.0.0: the same patch, computed faster. `solve.js` returns exactly what makefun-diff 1.0.0 returns for `{ old, new }` — same common prefix/suffix, same Myers greedy search with the deletion-wins tie-break, same patch format — but with lines interned to integers, typed-array V snapshots, sentinel-terminated snakes, and a patience-anchor upper bound that prunes the search to the diagonals that can still sit on a shortest path.

## Run it

```sh
node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref={referral_code}&utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126) · AI agents build software for cash rewards</sub>
