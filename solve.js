// diff-speed: a faster drop-in for makefun-diff 1.0.0.
// Hand-written in this session. run(input) returns exactly what makefun-diff
// 1.0.0 returns for { old, new }: the common prefix of lines is kept, then
// the common suffix of the lines left; between them, Myers's greedy search
// from the first lines, keeping on each diagonal the path reaching furthest
// into the old text and, on a tie between a deletion and an insertion reaching
// the same point, the deletion's; never past either text's end; no edge
// diagonal pruned; every run of equal lines followed as far as it goes; the
// first path to reach both ends is the script. The patch is
// "makefun-diff/1 old=N new=M hunks=H deleted=D inserted=I", then per hunk
// "@ os ol ns nl" and one line per covered line prefixed =/-/+, deletions
// before insertions in each change run, up to 3 kept lines before and after,
// runs at most 6 kept lines apart sharing a hunk; a line ending its text with
// no newline is written with one and followed by a "%" line; identical texts
// are the header line alone.
//
// How it is faster than the house baseline (which builds a linked list of
// path objects per diagonal): lines are interned to integers in one Map pass;
// the search state is Int32Array V snapshots, one per depth, for
// backtracking; the snake runs on integer ids with unlike sentinels past each
// text's end, so it needs no bounds checks; and the search is pruned to the
// diagonals that can still sit on a shortest path, using an upper bound on
// the edit distance from patience anchors (lines occurring exactly once in
// each text, their longest increasing subsequence, with each gap between
// anchors diffed exactly). That bound is a real edit script's length, so it
// is >= the true distance — on the practice set it equals it — and a path to
// a kept diagonal never crosses a skipped one, so the pruned search, its
// tie-breaks and its backtrack are exactly the unpruned search's.
//
// Deterministic: no clock, no randomness, no network, no I/O; stdlib only.

const KEEP = 0;
const DEL = 1;
const INS = 2;

/** One patch line as makefun-diff writes it. */
function wline(op, parts, idx) {
  // The line at idx carries its "\n" exactly when it is not the text's last
  // part (a last part is a line only when it is non-empty, i.e. no newline).
  if (idx < parts.length - 1) return op + parts[idx] + '\n';
  return op + parts[idx] + '\n%\n';
}

/**
 * The edit distance of (a, b) alone, forward only, no snapshots: the same
 * greedy search and tie-break as myersRuns, so the distance is exact.
 * a and b are plain id views (no sentinels); the snake is bounds-checked.
 */
function myersDistance(a, b, n, m) {
  if (n === 0) return m;
  if (m === 0) return n;
  const K = n - m;
  let Vp = new Int32Array(1);
  let x = 0;
  let y = 0;
  while (x < n && y < m && a[x] === b[y]) {
    x++;
    y++;
  }
  Vp[0] = x;
  if (K === 0 && x === n) return 0;
  for (let d = 1; d <= n + m; d++) {
    const Vc = new Int32Array(2 * d + 1);
    for (let k = -d; k <= d; k += 2) {
      const xDel = k > -d ? Vp[k + d - 2] : -1;
      const xIns = k < d ? Vp[k + d] : -1;
      const delValid = xDel !== -1 && xDel < n;
      const insValid = xIns !== -1 && xIns - k <= m;
      let xx;
      if (delValid && (!insValid || xDel + 1 >= xIns)) xx = xDel + 1;
      else if (insValid) xx = xIns;
      else {
        Vc[k + d] = -1;
        continue;
      }
      let yy = xx - k;
      while (xx < n && yy < m && a[xx] === b[yy]) {
        xx++;
        yy++;
      }
      Vc[k + d] = xx;
      if (k === K && xx === n) return d;
    }
    Vp = Vc;
  }
  throw new Error('myersDistance: search ended without reaching both ends');
}

/**
 * A valid edit script's length, hence an upper bound on the true distance:
 * anchor on the lines occurring exactly once in each text (their longest
 * increasing subsequence is a common subsequence), then diff each gap between
 * consecutive anchors exactly. The anchors and the gap scripts together are
 * a real edit script, so the sum is >= the minimal distance, and it is
 * close to it because the anchors are dense.
 */
function upperBound(a, b, n, m, span) {
  const cntA = new Int32Array(span);
  const cntB = new Int32Array(span);
  for (let i = 0; i < n; i++) cntA[a[i]]++;
  for (let j = 0; j < m; j++) cntB[b[j]]++;
  const posB = new Int32Array(span);
  posB.fill(-1);
  for (let j = 0; j < m; j++) if (cntB[b[j]] === 1) posB[b[j]] = j;
  const ancI = [];
  const ancJ = [];
  for (let i = 0; i < n; i++) {
    const id = a[i];
    if (cntA[id] === 1 && cntB[id] === 1) {
      ancI.push(i);
      ancJ.push(posB[id]);
    }
  }
  const A = ancJ.length;
  if (A === 0) return n + m;
  // Patience LIS on ancJ, keeping each pile's predecessor for the chain.
  const pileTop = new Int32Array(A);
  const prev = new Int32Array(A);
  prev.fill(-1);
  let piles = 0;
  for (let i = 0; i < A; i++) {
    let lo = 0;
    let hi = piles;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ancJ[pileTop[mid]] < ancJ[i]) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = pileTop[lo - 1];
    pileTop[lo] = i;
    if (lo === piles) piles++;
  }
  const chain = [];
  let cur = pileTop[piles - 1];
  while (cur !== -1) {
    chain.push(cur);
    cur = prev[cur];
  }
  chain.reverse();
  let total = 0;
  let pi = 0;
  let pj = 0;
  for (const ci of chain) {
    const i = ancI[ci];
    const j = ancJ[ci];
    total += myersDistance(a.subarray(pi, i), b.subarray(pj, j), i - pi, j - pj);
    pi = i + 1;
    pj = j + 1;
  }
  total += myersDistance(a.subarray(pi, n), b.subarray(pj, m), n - pi, m - pj);
  return total;
}

/**
 * The edit runs of the middle (a, b) — [{kind, count}] with kind KEEP/DEL/INS
 * — following makefun-diff's rule. a and b are Int32Arrays of interned line
 * ids with a sentinel at a[n] / b[m] (sentinels differ, so a snake stops at
 * either text's end). n, m > 0. dUB is an upper bound on the edit distance:
 * a diagonal k at depth d is skipped when d + |k - (n - m)| > dUB, which
 * cannot touch the winning path — every diagonal on a shortest path obeys
 * d + |k - (n - m)| <= D <= dUB, and a path to a kept diagonal never crosses
 * a skipped one — so the search, the tie-breaks and the backtrack are
 * exactly the unpruned search's.
 */
function myersRuns(a, b, n, m, dUB) {
  const K = n - m;
  const Vs = [];
  // Depth 0: the initial snake from (0, 0).
  let x = 0;
  let y = 0;
  while (a[x] === b[y]) {
    x++;
    y++;
  }
  const v0 = new Int32Array(1);
  v0[0] = x;
  Vs.push(v0);
  if (K === 0 && x === n) return { D: 0, Vs, runs: [{ kind: KEEP, count: n }] };
  let D = -1;
  for (let d = 1; d <= n + m; d++) {
    const Vc = new Int32Array(2 * d + 1);
    const Vp = Vs[d - 1];
    // Only diagonals that can still sit on a shortest path: d + |k - K| <= dUB.
    const rem = dUB - d;
    let klo = K - rem;
    if (klo < -d) klo = -d;
    let khi = K + rem;
    if (khi > d) khi = d;
    if (((klo - d) & 1) !== 0) klo++;
    if (((khi - d) & 1) !== 0) khi--;
    for (let k = klo; k <= khi; k += 2) {
      // Predecessors on diagonals k-1 (deletion) and k+1 (insertion), read
      // from the previous depth. Out of range at the edges means no path.
      const xDel = k > -d ? Vp[k + d - 2] : -1;
      const xIns = k < d ? Vp[k + d] : -1;
      // A move past either text's end is no candidate (makefun-diff's rule,
      // not jsdiff's edge pruning).
      const delValid = xDel !== -1 && xDel < n;
      const insValid = xIns !== -1 && xIns - k <= m;
      let xx;
      // Furthest into the old text wins; the deletion wins a tie.
      if (delValid && (!insValid || xDel + 1 >= xIns)) xx = xDel + 1;
      else if (insValid) xx = xIns;
      else {
        Vc[k + d] = -1;
        continue;
      }
      // Follow every run of equal lines as far as it goes.
      let yy = xx - k;
      while (a[xx] === b[yy]) {
        xx++;
        yy++;
      }
      Vc[k + d] = xx;
      if (k === K && xx === n) {
        D = d;
        break;
      }
    }
    Vs.push(Vc);
    if (D !== -1) break;
  }
  if (D === -1) throw new Error('myers: search ended without reaching both ends');

  // Backtrack the winning path from (D, n, m), re-applying the same
  // predecessor choice the forward pass made at each (d, k).
  const edits = new Uint8Array(D + 1); // edits[d]: DEL or INS
  const snakes = new Int32Array(D + 1); // snakes[d]: equal lines after edit d
  x = n;
  y = m;
  for (let d = D; d >= 1; d--) {
    const k = x - y;
    const Vp = Vs[d - 1];
    const xDel = k > -d ? Vp[k + d - 2] : -1;
    const xIns = k < d ? Vp[k + d] : -1;
    const delValid = xDel !== -1 && xDel < n;
    const insValid = xIns !== -1 && xIns - k <= m;
    let isDel;
    if (delValid && (!insValid || xDel + 1 >= xIns)) isDel = true;
    else if (insValid) isDel = false;
    else throw new Error('myers: backtrack dead end at d=' + d);
    const xPrev = isDel ? xDel : xIns;
    const xMid = isDel ? xDel + 1 : xIns;
    snakes[d] = x - xMid;
    edits[d] = isDel ? DEL : INS;
    x = xPrev;
    y = xPrev - (isDel ? k - 1 : k + 1);
  }
  snakes[0] = x;

  const runs = [];
  const push = (kind, count) => {
    if (count <= 0) return;
    const last = runs.length ? runs[runs.length - 1] : undefined;
    if (last !== undefined && last.kind === kind) last.count += count;
    else runs.push({ kind, count });
  };
  push(KEEP, snakes[0]);
  for (let d = 1; d <= D; d++) {
    push(edits[d], 1);
    push(KEEP, snakes[d]);
  }
  return { D, Vs, runs };
}

/** makefun-diff 1.0.0's answer for one case's input { old, new }. */
export function run(input) {
  const pa = input.old.split('\n');
  const pb = input.new.split('\n');
  const na = pa.length - 1 + (pa[pa.length - 1] !== '' ? 1 : 0);
  const nb = pb.length - 1 + (pb[pb.length - 1] !== '' ? 1 : 0);

  // Intern every line part to an integer id. The last line of a text is a
  // different line when it has no "\n", so it gets its part's id shifted by
  // the vocabulary size: equal ids then mean equal lines, newline included.
  const map = new Map();
  let V = 0;
  const ida = new Int32Array(na);
  for (let i = 0; i < na; i++) {
    const s = pa[i];
    let id = map.get(s);
    if (id === undefined) {
      id = V++;
      map.set(s, id);
    }
    ida[i] = id;
  }
  const idb = new Int32Array(nb);
  for (let j = 0; j < nb; j++) {
    const s = pb[j];
    let id = map.get(s);
    if (id === undefined) {
      id = V++;
      map.set(s, id);
    }
    idb[j] = id;
  }
  if (na > 0 && pa.length === na) ida[na - 1] += V;
  if (nb > 0 && pb.length === nb) idb[nb - 1] += V;

  // The common prefix, then the common suffix of what is left.
  let prefix = 0;
  while (prefix < na && prefix < nb && ida[prefix] === idb[prefix]) prefix++;
  let suffix = 0;
  while (suffix < na - prefix && suffix < nb - prefix && ida[na - 1 - suffix] === idb[nb - 1 - suffix]) suffix++;
  const n = na - prefix - suffix;
  const m = nb - prefix - suffix;

  // The middle, as fresh id arrays with unlike sentinels past their ends.
  const a = new Int32Array(n + 1);
  const b = new Int32Array(m + 1);
  a.set(ida.subarray(prefix, prefix + n));
  b.set(idb.subarray(prefix, prefix + m));
  a[n] = -1;
  b[m] = -2;

  let midRuns;
  if (n === 0 && m === 0) midRuns = [];
  else if (n === 0) midRuns = [{ kind: INS, count: m }];
  else if (m === 0) midRuns = [{ kind: DEL, count: n }];
  else {
    const dUB = upperBound(a, b, n, m, 2 * V);
    midRuns = myersRuns(a, b, n, m, dUB).runs;
  }

  // The full run list: prefix kept, the middle's runs, suffix kept.
  const runs = [];
  const push = (kind, count) => {
    if (count <= 0) return;
    const last = runs.length ? runs[runs.length - 1] : undefined;
    if (last !== undefined && last.kind === kind) last.count += count;
    else runs.push({ kind, count });
  };
  push(KEEP, prefix);
  for (const r of midRuns) push(r.kind, r.count);
  push(KEEP, suffix);

  // The change runs: each a stretch of deletions and insertions between two
  // kept lines, at old line o and new line p.
  const changes = [];
  let o = 0;
  let p = 0;
  let deleted = 0;
  let inserted = 0;
  for (const r of runs) {
    if (r.kind === KEEP) {
      o += r.count;
      p += r.count;
      continue;
    }
    let c = changes.length ? changes[changes.length - 1] : undefined;
    if (c === undefined || c.o + c.dels !== o || c.p + c.ins !== p) {
      c = { o, p, dels: 0, ins: 0 };
      changes.push(c);
    }
    if (r.kind === DEL) {
      c.dels += r.count;
      o += r.count;
      deleted += r.count;
    } else {
      c.ins += r.count;
      p += r.count;
      inserted += r.count;
    }
  }

  // The hunks: change runs at most 6 kept lines apart share one.
  const hunks = [];
  for (const c of changes) {
    const h = hunks.length ? hunks[hunks.length - 1] : undefined;
    const prev = h !== undefined ? h[h.length - 1] : undefined;
    if (prev !== undefined && c.o - (prev.o + prev.dels) <= 6) h.push(c);
    else hunks.push([c]);
  }

  const out = [`makefun-diff/1 old=${na} new=${nb} hunks=${hunks.length} deleted=${deleted} inserted=${inserted}\n`];
  for (const h of hunks) {
    const first = h[0];
    const last = h[h.length - 1];
    const oldStart = Math.max(0, first.o - 3);
    const newStart = first.p - (first.o - oldStart);
    const after = Math.min(3, na - (last.o + last.dels));
    const oldEnd = last.o + last.dels + after;
    const newEnd = last.p + last.ins + after;
    out.push(`@ ${oldStart + 1} ${oldEnd - oldStart} ${newStart + 1} ${newEnd - newStart}\n`);
    let at = oldStart;
    for (const c of h) {
      for (; at < c.o; at++) out.push(wline('=', pa, at));
      for (let i = 0; i < c.dels; i++) out.push(wline('-', pa, c.o + i));
      for (let i = 0; i < c.ins; i++) out.push(wline('+', pb, c.p + i));
      at = c.o + c.dels;
    }
    for (; at < oldEnd; at++) out.push(wline('=', pa, at));
  }
  return out.join('');
}
