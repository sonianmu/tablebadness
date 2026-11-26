/* Baselines and reference optimisers on the v2 grid model (spans supported uniformly). */
(function (global) {
  'use strict';
  const TB = global.TableBadness;
  const now = () => performance.now();

  function target(M, W) {
    const B = TB.budgetOf(M, W), nat = M.naturals.reduce((a, b) => a + b, 0);
    return Math.max(0, Math.min(B, nat));
  }

  function equal(M, W) {
    const t0 = now(), T = target(M, W);
    return TB.finish(M, M.naturals.map(() => T / M.nCols), W, now() - t0, false);
  }

  // proportional to the mean natural width of the column's single-column cells
  function proportional(M, W) {
    const t0 = now(), T = target(M, W);
    const mean = M.colSingle.map((list, j) => {
      let s = 0, n = 0; for (const i of list) { s += M.cells[i].m.natural; n++; }
      return n ? s / n : M.naturals[j];
    });
    const tot = mean.reduce((a, b) => a + b, 0) || 1;
    let w = mean.map(x => T * x / tot);
    for (let it = 0; it < M.nCols; it++) {
      let excess = 0, free = 0;
      w = w.map((x, j) => { if (x > M.naturals[j]) { excess += x - M.naturals[j]; return M.naturals[j]; } return x; });
      w.forEach((x, j) => { if (x < M.naturals[j] - 1e-6) free += mean[j]; });
      if (excess < 1e-6 || !free) break;
      w = w.map((x, j) => (x < M.naturals[j] - 1e-6 ? x + excess * mean[j] / free : x));
    }
    return TB.finish(M, w, W, now() - t0, false);
  }

  // Candidate widths per column: static staircase candidates, plus widths at which a spanning cell
  // covering the column would cross a step if this column alone absorbed the difference (others at floor).
  function candidates(M) {
    if (M._cands) return M._cands;
    M._cands = M.cand.map((c, j) => {
      const s = new Set(c);
      for (const i of M.colSpan[j]) {
        const cell = M.cells[i];
        let base = cell.ext; for (let k = cell.c; k < cell.c + cell.cs; k++) if (k !== j) base += M.floors[k];
        for (const sw of cell.st.w) { const x = sw - base; if (x > M.floors[j] && x <= M.upper[j]) s.add(x); }
      }
      return Float64Array.from([...s].sort((a, b) => a - b));
    });
    return M._cands;
  }
  const snapDown = (c, w) => { let lo = 0, hi = c.length - 1, a = 0; while (lo <= hi) { const m = (lo + hi) >> 1; if (c[m] <= w + 0.01) { a = m; lo = m + 1; } else hi = m - 1; } return a; };

  // pairwise-exchange local search, multi-start; objective(w): lower is better
  function localSearch(M, W, objective, starts, maxIter) {
    const t0 = now(), C = candidates(M), m = M.nCols, B = TB.budgetOf(M, W);
    const floorSum = C.reduce((s, c) => s + c[0], 0);
    if (B <= floorSum) return { w: C.map(c => c[0]), ms: now() - t0, scroll: B < floorSum };
    const wOf = idx => idx.map((k, j) => C[j][k]);
    const used = idx => idx.reduce((s, k, j) => s + C[j][k], 0);
    const memo = new Map();
    const f = idx => { const key = idx.join(','); if (!memo.has(key)) memo.set(key, objective(wOf(idx))); return memo.get(key); };
    const fill = idx => {
      for (;;) {
        let best = null, bv = f(idx); const u = used(idx);
        for (let j = 0; j < m; j++) for (let k = idx[j] + 1; k < C[j].length; k++) {
          if (u - C[j][idx[j]] + C[j][k] > B + 0.01) break;
          const t = idx.slice(); t[j] = k; const v = f(t); if (v < bv - 1e-9) { bv = v; best = t; }
        }
        if (!best) return idx; idx = best;
      }
    };
    const local = idx => {
      idx = fill(idx); let cur = f(idx);
      for (let it = 0; it < (maxIter || 60); it++) {
        let best = null, bv = cur; const u = used(idx);
        for (let j = 0; j < m; j++) for (let k = 0; k < C[j].length; k++) {
          if (k === idx[j]) continue;
          const dj = C[j][k] - C[j][idx[j]];
          for (let i = 0; i < m; i++) {
            if (i === j) continue;
            const room = B - (u + dj - C[i][idx[i]]);
            if (room < C[i][0] - 0.01) continue;
            const t = idx.slice(); t[j] = k; t[i] = snapDown(C[i], room);
            const v = f(t); if (v < bv - 1e-9) { bv = v; best = t; }
          }
        }
        if (!best) break; idx = fill(best); cur = f(idx);
      }
      return idx;
    };
    const list = (starts || []).map(ws => ws.map((w, j) => snapDown(C[j], w)));
    list.push(C.map(() => 0));
    let bestIdx = null, bv = Infinity;
    for (const s of list) { if (used(s) > B + 0.01) continue; const r = local(s), v = f(r); if (v < bv) { bv = v; bestIdx = r; } }
    let w = wOf(bestIdx);
    const u = w.reduce((a, b) => a + b, 0), T = target(M, W);
    if (T > u) w = w.map(x => x + (T - u) * x / u);
    return { w, value: bv, ms: now() - t0, scroll: false, evals: memo.size };
  }

  // Minimal-height baseline (same longest-path height, so spans are handled); tie-break: total lines
  function minHeight(M, W, starts) {
    const r = localSearch(M, W, w => { const e = TB.evaluate(M, w); let L = 0; for (const x of e.lines) L += x; return e.H * 1e3 + L; }, starts);
    return TB.finish(M, r.w, W, r.ms, r.scroll);
  }
  // Near-optimal reference for the Table Badness objective (per width, not monotone across widths)
  function tbLocalSearch(M, W, starts) {
    const r = localSearch(M, W, w => TB.evaluate(M, w).cost, starts);
    return TB.finish(M, r.w, W, r.ms, r.scroll);
  }
  // Exhaustive optimum over the candidate grid (small instances only); null when too large
  function exhaustive(M, W, limit) {
    const C = candidates(M), B = TB.budgetOf(M, W);
    let size = 1; for (const c of C) size *= c.length;
    if (size > (limit || 3e5)) return null;
    const t0 = now(), m = M.nCols, w = new Array(m);
    let best = Infinity, bw = null;
    const rec = (j, used) => {
      if (j === m) { const v = TB.evaluate(M, w).cost; if (v < best) { best = v; bw = w.slice(); } return; }
      for (let k = 0; k < C[j].length; k++) { const x = C[j][k]; if (used + x > B + 0.01) break; w[j] = x; rec(j + 1, used + x); }
    };
    rec(0, 0);
    if (!bw) return null;
    const res = TB.finish(M, bw, W, now() - t0, false); res.value = best; return res;
  }

  global.TBBaselines = { equal, proportional, minHeight, tbLocalSearch, exhaustive, localSearch, candidates };
})(typeof window !== 'undefined' ? window : globalThis);
