/* Baseline and reference layout methods. All return content widths for the same table model. */
(function (global) {
  'use strict';
  const TB = global.TableBadness;
  const now = () => performance.now();

  function shrinkBudget(P, W) {
    const B = TB.budgetOf(P, W);
    const nat = P.cols.reduce((s, c) => s + c.natural, 0);
    return Math.max(0, Math.min(B, nat));
  }

  // Equal column widths.
  function equal(P, W) {
    const t0 = now();
    const T = shrinkBudget(P, W);
    const w = P.cols.map(() => T / P.nCols);
    return TB.finish(P, w, W, TB.costOf(P, w), now() - t0, false);
  }

  // Width proportional to mean natural (single-line) content width of the column.
  function proportional(P, W) {
    const t0 = now();
    const T = shrinkBudget(P, W);
    const mean = P.cols.map(col => {
      let s = 0, n = 0;
      for (const e of col.entries) { s += e.count * e.cell.natural; n += e.count; }
      return s / n;
    });
    const tot = mean.reduce((a, b) => a + b, 0) || 1;
    let w = mean.map(m => T * m / tot);
    // never exceed natural; redistribute the excess
    for (let it = 0; it < P.nCols; it++) {
      let excess = 0, free = 0;
      w = w.map((x, j) => { const n = P.cols[j].natural; if (x > n) { excess += x - n; return n; } return x; });
      w.forEach((x, j) => { if (x < P.cols[j].natural - 1e-6) free += mean[j]; });
      if (excess < 1e-6 || !free) break;
      w = w.map((x, j) => (x < P.cols[j].natural - 1e-6 ? x + excess * mean[j] / free : x));
    }
    return TB.finish(P, w, W, TB.costOf(P, w), now() - t0, false);
  }

  function snapDown(cand, w) {
    let lo = 0, hi = cand.length - 1, ans = 0;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (cand[m] <= w + 0.01) { ans = m; lo = m + 1; } else hi = m - 1; }
    return ans;
  }

  // Pairwise-exchange local search over the candidate widths of every column (multi-start).
  // evalIdx(idx) -> objective (lower is better). Used as a strong (non-path) optimiser.
  function localSearch(P, W, evalIdx, starts) {
    const t0 = now();
    const m = P.nCols;
    const C = P.cols.map(c => c.cand);
    const B = TB.budgetOf(P, W);
    const floorSum = C.reduce((s, c) => s + c[0], 0);
    if (B <= floorSum) {
      const w = C.map(c => c[0]);
      return { idx: C.map(() => 0), w, ms: now() - t0, scroll: B < floorSum };
    }
    const widthOfIdx = idx => idx.reduce((s, k, j) => s + C[j][k], 0);
    const fill = idx => {
      for (;;) {
        let best = null, bestV = evalIdx(idx);
        const used = widthOfIdx(idx);
        for (let j = 0; j < m; j++) {
          for (let k = idx[j] + 1; k < C[j].length; k++) {
            if (used - C[j][idx[j]] + C[j][k] > B + 0.01) break;
            const t = idx.slice(); t[j] = k;
            const v = evalIdx(t);
            if (v < bestV - 1e-9) { bestV = v; best = t; }
          }
        }
        if (!best) return idx;
        idx = best;
      }
    };
    const local = idx => {
      idx = fill(idx);
      let cur = evalIdx(idx);
      for (let iter = 0; iter < 200; iter++) {
        let best = null, bestV = cur;
        const used = widthOfIdx(idx);
        for (let j = 0; j < m; j++) {
          for (let k = 0; k < C[j].length; k++) {
            if (k === idx[j]) continue;
            const dj = C[j][k] - C[j][idx[j]];
            for (let i = 0; i < m; i++) {
              if (i === j) continue;
              const room = B - (used + dj - C[i][idx[i]]);
              if (room < C[i][0] - 0.01) continue;
              const t = idx.slice(); t[j] = k; t[i] = snapDown(C[i], room);
              const v = evalIdx(t);
              if (v < bestV - 1e-9) { bestV = v; best = t; }
            }
          }
        }
        if (!best) break;
        idx = fill(best); cur = evalIdx(idx);
      }
      return idx;
    };
    const startList = (starts || []).map(ws => ws.map((w, j) => snapDown(C[j], w)));
    startList.push(C.map(() => 0));
    let bestIdx = null, bestV = Infinity;
    for (const s of startList) {
      if (widthOfIdx(s) > B + 0.01) continue;
      const r = local(s);
      const v = evalIdx(r);
      if (v < bestV) { bestV = v; bestIdx = r; }
    }
    let w = bestIdx.map((k, j) => C[j][k]);
    const used = w.reduce((a, b) => a + b, 0);
    const T = Math.min(B, P.cols.reduce((s, c) => s + c.natural, 0));
    if (T > used) w = w.map(x => x + (T - used) * x / used);
    return { idx: bestIdx, w, value: bestV, ms: now() - t0, scroll: false };
  }

  // Minimal-height baseline: minimise total row height (lines); tie-break on total cell lines.
  function minHeight(P, W, starts) {
    const R = P.rows, m = P.nCols;
    const evalIdx = idx => {
      let h = 0, tot = 0;
      for (let r = 0; r < R; r++) {
        let mx = 0;
        for (let j = 0; j < m; j++) { const l = P.cols[j].lines[idx[j]][r]; tot += l; if (l > mx) mx = l; }
        h += mx;
      }
      return h * 1e4 + tot;
    };
    const r = localSearch(P, W, evalIdx, starts);
    const res = TB.finish(P, r.w, W, TB.costOf(P, r.w), r.ms, r.scroll);
    return res;
  }

  // Near-optimal reference for the coupled Table-Badness objective (not monotone in W).
  function tbLocalSearch(P, W, starts) {
    const r = localSearch(P, W, idx => TB.costOfIdx(P, idx), starts);
    return TB.finish(P, r.w, W, TB.costOf(P, r.w), r.ms, r.scroll);
  }

  // Exact optimum of the separable Table-Badness objective for one budget (1px DP, multiple-choice knapsack).
  // Exact optimum of the separable Table-Badness objective: Pareto-frontier DP over real-valued
  // candidate widths (multiple-choice knapsack), pruned at the budget.
  function dpExact(P, W) {
    const t0 = now();
    const B = TB.budgetOf(P, W);
    const m = P.nCols;
    const fsum = P.cols.reduce((s, c) => s + c.profile.w[0], 0);
    if (B < fsum - 1e-9) {
      const w = P.cols.map(c => c.floor);
      return TB.finish(P, w, W, TB.costOf(P, w), now() - t0, true);
    }
    let front = [{ w: 0, c: 0, back: null, k: -1 }];
    for (let j = 0; j < m; j++) {
      const { w, f } = P.cols[j].profile;
      let rest = 0; for (let i = j + 1; i < m; i++) rest += P.cols[i].profile.w[0];
      const cand = [];
      for (const p of front) for (let k = 0; k < w.length; k++) {
        const nw = p.w + w[k];
        if (nw + rest > B + 1e-9) break;
        cand.push({ w: nw, c: p.c + f[k], back: p, k });
      }
      cand.sort((a, b) => a.w - b.w || a.c - b.c);
      front = [];
      let best = Infinity;
      for (const q of cand) if (q.c < best - 1e-9) { front.push(q); best = q.c; }
    }
    let p = front[front.length - 1]; // widest feasible = cheapest
    const wk = new Array(m);
    for (let j = m - 1; j >= 0; j--) { wk[j] = P.cols[j].profile.w[p.k]; p = p.back; }
    let w = wk;
    const used = w.reduce((a, c) => a + c, 0);
    const T = Math.min(B, P.cols.reduce((s, c) => s + c.natural, 0));
    if (T > used) w = w.map(x => x + (T - used) * x / used);
    const r = TB.finish(P, w, W, TB.costOf(P, w), now() - t0, false);
    r.frontier = front.length;
    return r;
  }

  global.TBBaselines = { equal, proportional, minHeight, dpExact, localSearch, tbLocalSearch };
})(typeof window !== 'undefined' ? window : globalThis);
