/*
 * Table Badness v2 — readability-aware layout of text tables on a boundary grid.
 *
 * Model (one representation for plain grids, spanning cells and multi-level headers)
 *   Column boundaries x0..xm and row boundaries y0..yn. A cell covering columns [a,b) and rows [c,d)
 *   gets content width  W = x_b - x_a - (its own padding/border)  and needs height  h(W) = lines(W)*lh + pad.
 *   Natural table height is a LONGEST PATH over row boundaries: y_d >= y_c + h(cell) for every cell.
 *   The plain "row height = tallest cell" rule is the special case where every cell spans one row.
 *
 * Loss (in line units)
 *   sum over cells  alpha(role) * [ (lines-1) + A*intraTokenBreaks + E*emergencyBreaks + fragmentation ]
 *   + lambda * (natural table height) / line-height
 *   One structural principle sets alpha: a header is an index the reader scans along one axis.
 *   A line break stacks text vertically, i.e. ACROSS the scan of a column header (alpha = 1+sigma)
 *   and ALONG the scan of a row header (alpha = 1-sigma). Data cells: alpha = 1.
 *   Row headers therefore wrap "for free" only where the longest-path height already has slack.
 *
 * Solver
 *   Shrink-wrap staircases give every distinct layout of every cell (TBMeasure). An event-driven
 *   marginal-utility path widens one column at a time; a column's next events are the staircase steps of
 *   the cells that cover it (for a spanning cell: its next step minus its current width). The path is
 *   built once, is monotone in the available width, and a resize is a binary search on it.
 *   Comfort width D: the narrowest point of the path below which widening still buys more than
 *   scrolling costs. Scrolling happens only for W < D, so column widths stay monotone in W.
 */
(function (global) {
  'use strict';
  const MS = global.TBMeasure;
  const { EPS, layoutCell, staircase, stepAt, fontSignature, cellCache, measureCells, now } = MS;

  const DEFAULTS = {
    tokenCost: 1,       // A
    emergencyCost: 2,   // E
    fragEm: 12,         // m0: comfortable measure for long text (em)
    fragCost: 0,        // phi (off by default: double-counted line cost and hurt narrow tables in dev + blind review; ablation kept)
    rowWeight: 2,       // lambda: cost of one line-height of table height
    scanSkew: 0.5,      // sigma: column header lines cost 1+sigma, row header lines 1-sigma
    roles: true,        // use header roles at all
    rowHeader: false,   // caller declares the first logical body column as row headers
    floorEm: 4,         // a column is never narrower than min(min-content, floorEm)
    safety: 1,          // px of slack per rendered column
    maxCandidates: 160, // per-column static candidate cap (quantised up beyond it)
    eventsPerCell: 4,   // look-ahead steps per spanning cell
    termWords: 4,       // a cell with at most this many words is a term: breaking inside its words costs A
    termFloorEm: 16,    // ...and its min-content is a hard floor (up to this width; longer tokens may still be split)
    cutMoves: true,     // joint moves that lower a row whose height is set by several tied cells
    scroll: true,       // allow horizontal scroll below the comfort width
    scrollRate: 80,     // rho: scrolling a full viewport costs rho per row (calibrated on dev: matches the browser scroll rate)
  };

  // ---------------------------------------------------------------------------
  // grid & roles
  // ---------------------------------------------------------------------------
  function buildGrid(table) {
    const rows = Array.from(table.rows);
    const occ = [];
    const cells = [];
    let nCols = 0;
    rows.forEach((tr, r) => {
      occ[r] = occ[r] || [];
      let c = 0;
      for (const el of tr.cells) {
        while (occ[r][c]) c++;
        const cs = Math.max(1, el.colSpan | 0);
        const rs0 = el.rowSpan | 0;
        const rs = rs0 === 0 ? rows.length - r : Math.max(1, Math.min(rs0, rows.length - r));
        for (let i = r; i < r + rs; i++) { occ[i] = occ[i] || []; for (let j = c; j < c + cs; j++) occ[i][j] = true; }
        cells.push({ el, r, c, rs, cs });
        c += cs;
        nCols = Math.max(nCols, c);
      }
    });
    return { rows, cells, nCols };
  }

  function roleOf(cell, o) {
    if (!o.roles) return 'data';
    const el = cell.el, sec = el.parentNode.parentNode.tagName;
    if (el.tagName === 'TH') {
      const scope = (el.getAttribute('scope') || '').toLowerCase();
      if (scope === 'row' || scope === 'rowgroup') return 'row';
      if (scope === 'col' || scope === 'colgroup') return 'col';
      if (sec === 'THEAD') return 'col';
      return cell.c === 0 ? 'row' : 'col';
    }
    if (o.rowHeader && cell.c === 0 && sec !== 'THEAD') return 'row';
    return 'data';
  }

  const px = v => parseFloat(v) || 0;

  // ---------------------------------------------------------------------------
  // prepare: measure + model (width independent)
  // ---------------------------------------------------------------------------
  function prepare(table, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const t0 = now();
    const g = buildGrid(table);
    const anyCell = g.cells[0].el;
    const fontSize = px(getComputedStyle(table.querySelector('td') || anyCell).fontSize) || 16;
    const floorPx = o.floorEm * fontSize;
    const sigCache = new Map();
    const sig = el => { const k = el.tagName; if (!sigCache.has(k)) sigCache.set(k, fontSignature(el)); return sigCache.get(k); };

    const pending = new Map();
    for (const cell of g.cells) {
      const el = cell.el, cs = getComputedStyle(el);
      cell.role = roleOf(cell, o);
      cell.alpha = cell.role === 'col' ? 1 + o.scanSkew : cell.role === 'row' ? 1 - o.scanSkew : 1;
      cell.padH = px(cs.paddingLeft) + px(cs.paddingRight) + px(cs.borderLeftWidth) + px(cs.borderRightWidth);
      cell.padV = px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth);
      cell.lh = cs.lineHeight === 'normal' ? 1.2 * px(cs.fontSize) : px(cs.lineHeight);
      const html = el.innerHTML.trim();
      cell.key = sig(el) + '\u0000' + (el.tagName === 'TH' ? 'H' : 'D') + '\u0000' + html;
      if (!cellCache.has(cell.key) && !pending.has(cell.key)) pending.set(cell.key, { key: cell.key, html, header: el.tagName === 'TH' });
    }
    const measured = measureCells(table, Array.from(pending.values()), floorPx * 0.5);
    const tMeasure = now();
    for (const cell of g.cells) cell.m = cellCache.get(cell.key);

    const m = g.nCols, R = g.rows.length;
    const colPad = new Array(m).fill(null);
    for (const cell of g.cells) if (cell.cs === 1 && colPad[cell.c] === null) colPad[cell.c] = cell.padH;
    for (let j = 0; j < m; j++) if (colPad[j] === null) colPad[j] = g.cells[0].padH;
    for (const cell of g.cells) {
      let s = 0; for (let j = cell.c; j < cell.c + cell.cs; j++) s += colPad[j] + o.safety;
      cell.ext = s - cell.padH - o.safety; // content width = sum of covered column content widths + ext
    }
    // floors & naturals (spanning cells push their deficit onto the columns they cover)
    const floors = new Array(m).fill(0), naturals = new Array(m).fill(0), minC = new Array(m).fill(0), maxG = new Array(m).fill(0);
    const hasSingle = new Array(m).fill(false);
    // a term (short label, ID, header word) is never split mid-word by choice: its min-content is a floor
    const termCap = o.termFloorEm * fontSize;
    const isTerm = cell => cell.m.words <= o.termWords && cell.m.minContent <= termCap;
    const termNeed = new Array(m).fill(0);
    for (const cell of g.cells) if (cell.cs === 1) {
      hasSingle[cell.c] = true;
      if (isTerm(cell)) termNeed[cell.c] = Math.max(termNeed[cell.c], cell.m.minContent);
      minC[cell.c] = Math.max(minC[cell.c], cell.m.minContent);
      maxG[cell.c] = Math.max(maxG[cell.c], cell.m.maxGraph);
      naturals[cell.c] = Math.max(naturals[cell.c], cell.m.natural);
    }
    for (let j = 0; j < m; j++) floors[j] = hasSingle[j] ? Math.max(maxG[j], Math.min(minC[j], floorPx), termNeed[j]) : fontSize;
    const spans = g.cells.filter(c => c.cs > 1).sort((a, b) => a.cs - b.cs);
    for (const cell of spans) {
      let s = cell.ext; for (let j = cell.c; j < cell.c + cell.cs; j++) s += floors[j];
      const need = Math.max(cell.m.maxGraph, Math.min(cell.m.minContent, floorPx), isTerm(cell) ? cell.m.minContent : 0);
      if (need > s) for (let j = cell.c; j < cell.c + cell.cs; j++) floors[j] += (need - s) / cell.cs;
    }
    for (let j = 0; j < m; j++) naturals[j] = Math.max(naturals[j], floors[j]);
    for (const cell of spans) {
      let s = cell.ext, base = 0;
      for (let j = cell.c; j < cell.c + cell.cs; j++) { s += naturals[j]; base += naturals[j]; }
      const def = cell.m.natural - s;
      if (def > 0) for (let j = cell.c; j < cell.c + cell.cs; j++) naturals[j] += def * (base ? naturals[j] / base : 1 / cell.cs);
    }
    // upper bound per column: enough to finish any spanning cell it belongs to on its own
    const upper = naturals.slice();
    for (const cell of spans) {
      let others = cell.ext; for (let j = cell.c; j < cell.c + cell.cs; j++) others += floors[j];
      for (let j = cell.c; j < cell.c + cell.cs; j++) upper[j] = Math.max(upper[j], cell.m.natural - (others - floors[j]));
    }
    for (const cell of g.cells) {
      let fl = cell.ext; for (let j = cell.c; j < cell.c + cell.cs; j++) fl += floors[j];
      const wMin = Math.max(cell.m.maxGraph, Math.min(cell.m.minContent, fl));
      const sk = 'st' + wMin.toFixed(2);
      if (!cell.m[sk]) cell.m[sk] = staircase(cell.m, wMin);
      cell.st = cell.m[sk];
    }
    const tcs = getComputedStyle(table);
    const M = {
      table, opts: o, rows: R, nCols: m, cells: g.cells, fontSize, floors, naturals, upper, colPad,
      tableExtra: px(tcs.borderLeftWidth) + px(tcs.borderRightWidth),
      lhBase: (g.cells.find(c => c.el.tagName === 'TD') || g.cells[0]).lh,
      hasRowspan: g.cells.some(c => c.rs > 1),
      hasColspan: g.cells.some(c => c.cs > 1),
    };
    indexModel(M);
    buildStatic(M);
    const tEnd = now();
    M.timing = { measureMs: tMeasure - t0, modelMs: tEnd - tMeasure, prepareMs: tEnd - t0, measuredCells: measured, distinctCells: pending.size, cells: g.cells.length };
    return M;
  }

  function indexModel(M) {
    const m = M.nCols, R = M.rows;
    M.colCells = Array.from({ length: m }, () => []);
    M.colSingle = Array.from({ length: m }, () => []);
    M.colSpan = Array.from({ length: m }, () => []);
    M.rowCells = Array.from({ length: R }, () => []);
    M.endCells = Array.from({ length: R + 1 }, () => []);
    M.cells.forEach((cell, i) => {
      cell.i = i;
      for (let j = cell.c; j < cell.c + cell.cs; j++) { M.colCells[j].push(i); (cell.cs === 1 ? M.colSingle : M.colSpan)[j].push(i); }
      M.rowCells[cell.r].push(i);
      M.endCells[cell.r + cell.rs].push(i);
    });
  }

  // soft = breaks inside a CJK/Thai word; they count like intra-token breaks only in short "term" cells
  function readLoss(lines, tok, em, t, N, o, fs, soft, term) {
    let v = (lines - 1) + o.tokenCost * (tok + (term ? soft || 0 : 0)) + o.emergencyCost * em;
    const m0 = o.fragEm * fs;
    if (o.fragCost > 0 && N > m0 && lines > 1) { const x = m0 / Math.max(t, 1) - 1; if (x > 0) v += o.fragCost * lines * x * x; }
    return v;
  }
  function cellState(M, cell, x) {
    const st = cell.st, i = stepAt(st, x);
    let lines, tok, em, t, soft;
    if (i < 0) { const r = layoutCell(cell.m, x); lines = r.lines; tok = r.tok; em = r.em; t = r.tight; soft = r.soft; }
    else { lines = st.lines[i]; tok = st.tok[i]; em = st.em[i]; t = st.w[i]; soft = st.soft ? st.soft[i] : 0; }
    const term = cell.m.words <= M.opts.termWords;
    return { lines, tok, em, soft, loss: cell.alpha * readLoss(lines, tok, em, t, cell.m.natural, M.opts, M.fontSize, soft, term), h: lines * cell.lh + cell.padV };
  }
  const cellWidth = (cell, w) => { let s = cell.ext; for (let j = cell.c; j < cell.c + cell.cs; j++) s += w[j]; return s; };

  // Static candidate tables for single-column cells (independent of other columns).
  function buildStatic(M) {
    const o = M.opts;
    M.cand = []; M.Fsum = []; M.Hs = [];
    for (let j = 0; j < M.nCols; j++) {
      const lo = M.floors[j], hi = M.naturals[j];
      const ws = [lo];
      for (const i of M.colSingle[j]) for (const w of M.cells[i].st.w) if (w > lo + EPS && w <= hi + EPS) ws.push(w);
      ws.sort((a, b) => a - b);
      let u = []; for (const w of ws) if (!u.length || w - u[u.length - 1] > 1e-6) u.push(w);
      if (u.length > o.maxCandidates) {
        const q = (hi - lo) / (o.maxCandidates - 1), s = new Set([lo]);
        for (const w of u) s.add(Math.min(hi, lo + Math.ceil((w - lo) / q - 1e-9) * q));
        u = [...s].sort((a, b) => a - b);
      }
      const K = u.length, F = new Float64Array(K), H = M.colSingle[j].map(() => new Float32Array(K));
      M.colSingle[j].forEach((ci, n) => {
        const cell = M.cells[ci];
        for (let k = 0; k < K; k++) { const s = cellState(M, cell, u[k]); F[k] += s.loss; H[n][k] = s.h; }
      });
      M.cand.push(Float64Array.from(u)); M.Fsum.push(F); M.Hs.push(H);
    }
  }
  function snap(arr, x) { let lo = 0, hi = arr.length - 1, a = 0; while (lo <= hi) { const mid = (lo + hi) >> 1; if (arr[mid] <= x + EPS) { a = mid; lo = mid + 1; } else hi = mid - 1; } return a; }

  function rowBoundaries(M, h) {
    const y = new Float64Array(M.rows + 1);
    for (let d = 1; d <= M.rows; d++) {
      let v = y[d - 1];
      for (const i of M.endCells[d]) { const c = M.cells[i]; const t = y[c.r] + h[i]; if (t > v) v = t; }
      y[d] = v;
    }
    return y;
  }
  function heightOf(M, h) {
    if (!M.hasRowspan) {
      let H = 0;
      for (let r = 0; r < M.rows; r++) { let mx = 0; for (const i of M.rowCells[r]) if (h[i] > mx) mx = h[i]; H += mx; }
      return H;
    }
    return rowBoundaries(M, h)[M.rows];
  }

  function evaluate(M, w) {
    const n = M.cells.length, h = new Float64Array(n), lines = new Int32Array(n);
    let loss = 0;
    for (let i = 0; i < n; i++) { const c = M.cells[i]; const s = cellState(M, c, cellWidth(c, w)); h[i] = s.h; lines[i] = s.lines; loss += s.loss; }
    const H = heightOf(M, h);
    return { cost: loss + M.opts.rowWeight * H / M.lhBase, loss, H, h, lines };
  }

  // ---------------------------------------------------------------------------
  // event-driven marginal-utility path
  // ---------------------------------------------------------------------------
  function buildPath(M) {
    const t0 = now();
    const o = M.opts, m = M.nCols, R = M.rows, lam = o.rowWeight / M.lhBase;
    const w = M.floors.slice();
    const n = M.cells.length;
    const x = new Float64Array(n), h = new Float64Array(n), L = new Float64Array(n);
    const kcur = new Int32Array(m);
    for (let i = 0; i < n; i++) { const c = M.cells[i]; x[i] = cellWidth(c, w); const s = cellState(M, c, x[i]); h[i] = s.h; L[i] = s.loss; }
    let H = heightOf(M, h), lossSum = 0;
    for (let i = 0; i < n; i++) lossSum += L[i];
    const cost0 = lossSum + lam * H;
    const segs = [];
    const rowMax = new Float64Array(R);
    const other = Array.from({ length: m }, () => new Float64Array(R));
    const colRows = M.colCells.map(list => [...new Set(list.map(i => M.cells[i].r))]);
    const rowHasSpan = M.rowCells.map(list => list.some(i => M.cells[i].cs > 1));
    const refreshRows = () => {
      if (M.hasRowspan) return;
      for (let r = 0; r < R; r++) {
        const list = M.rowCells[r];
        if (!rowHasSpan[r]) {
          // plain row: max over the other columns from the top two values, O(cells)
          let t1 = 0, t1c = -1, n1 = 0, t2 = 0;
          for (const i of list) { const v = h[i]; if (v > t1 + 1e-9) { t2 = t1; t1 = v; t1c = M.cells[i].c; n1 = 1; } else if (Math.abs(v - t1) <= 1e-9) n1++; else if (v > t2) t2 = v; }
          rowMax[r] = t1;
          for (let j = 0; j < m; j++) other[j][r] = (j === t1c && n1 === 1) ? t2 : t1;
          continue;
        }
        let mx = 0; for (const i of list) if (h[i] > mx) mx = h[i];
        rowMax[r] = mx;
        for (let j = 0; j < m; j++) {
          let om = 0;
          for (const i of list) { const c = M.cells[i]; if (j >= c.c && j < c.c + c.cs) continue; if (h[i] > om) om = h[i]; }
          other[j][r] = om;
        }
      }
    };
    refreshRows();
    const hTmp = new Float64Array(n);
    const newRow = new Float64Array(R);
    for (let guard = 0; guard < 100000; guard++) {
      let best = null;
      for (let j = 0; j < m; j++) {
        if (w[j] >= M.upper[j] - EPS) continue;
        const cand = M.cand[j];
        const xs = [];
        for (let k = kcur[j] + 1; k < cand.length; k++) xs.push(cand[k]);
        for (const i of M.colSpan[j]) {
          const st = M.cells[i].st, idx = stepAt(st, x[i]);
          for (let t = 1; t <= o.eventsPerCell && idx + t < st.w.length; t++) xs.push(w[j] + (st.w[idx + t] - x[i]));
          // and the next widths where its line count actually drops (may be many steps ahead)
          let lc = idx < 0 ? Infinity : st.lines[idx], k = idx + 1;
          for (let found = 0; k < st.w.length && found < 3; k++) if (st.lines[k] < lc) { xs.push(w[j] + (st.w[k] - x[i])); lc = st.lines[k]; found++; }
        }
        if (!xs.length) continue;
        xs.sort((a, b) => a - b);
        let prev = -1;
        for (const xv of xs) {
          const xn = Math.min(xv, xv > M.naturals[j] ? M.upper[j] : M.naturals[j]);
          if (xn <= w[j] + EPS || xn - prev < 1e-6) continue;
          prev = xn;
          const d = xn - w[j];
          const kn = snap(cand, xn);
          let dLoss = M.Fsum[j][kn] - M.Fsum[j][kcur[j]];
          const spanS = [];
          for (const i of M.colSpan[j]) { const s = cellState(M, M.cells[i], x[i] + d); dLoss += s.loss - L[i]; spanS.push([i, s.h]); }
          let dH = 0;
          if (!M.hasRowspan) {
            for (const r of colRows[j]) newRow[r] = other[j][r];
            M.colSingle[j].forEach((ci, q) => { const r = M.cells[ci].r, v = M.Hs[j][q][kn]; if (v > newRow[r]) newRow[r] = v; });
            for (const [i, hv] of spanS) { const r = M.cells[i].r; if (hv > newRow[r]) newRow[r] = hv; }
            for (const r of colRows[j]) dH += newRow[r] - rowMax[r];
          } else {
            hTmp.set(h);
            M.colSingle[j].forEach((ci, q) => { hTmp[ci] = M.Hs[j][q][kn]; });
            for (const [i, hv] of spanS) hTmp[i] = hv;
            dH = heightOf(M, hTmp) - H;
          }
          const gain = -(dLoss + lam * dH);
          if (gain <= 1e-9) continue;
          const ratio = gain / d;
          if (!best || ratio > best.ratio + 1e-12) best = { cols: [[j, w[j], xn]], ratio, gain, d };
        }
      }
      // joint "cut" moves: a row whose height is set by several tied cells only gets lower if all of them do
      if (o.cutMoves) {
        // group rows by the set of columns their tied cells occupy; keep the cheapest proposal per set
        const groups = new Map();
        for (let r = 0; r < R; r++) {
          const tie = [];
          let mx = 0; for (const i of M.rowCells[r]) if (M.cells[i].rs === 1 && h[i] > mx) mx = h[i];
          for (const i of M.rowCells[r]) if (M.cells[i].rs === 1 && h[i] > mx - 0.5 && h[i] > M.cells[i].lh + M.cells[i].padV + 0.5) tie.push(i);
          if (tie.length < 2) continue;
          const need = new Map(); let ok = true;
          for (const i of tie) {
            const c = M.cells[i], st = c.st, cur = stepAt(st, x[i]); const lcur = cur < 0 ? Infinity : st.lines[cur];
            let k = cur + 1; while (k < st.w.length && st.lines[k] >= lcur) k++;
            if (k >= st.w.length) { ok = false; break; }
            const per = (st.w[k] - x[i] + 1e-6) / c.cs;
            for (let j = c.c; j < c.c + c.cs; j++) need.set(j, Math.max(need.get(j) || 0, per));
          }
          if (!ok) continue;
          const key = [...need.keys()].sort((a, b) => a - b).join(',');
          let tot = 0; for (const v of need.values()) tot += v;
          const g = groups.get(key);
          if (!g || tot < g.tot) groups.set(key, { need, tot });
        }
        for (const { need } of groups.values()) {
          const wn = w.slice(); let d = 0, capped = false;
          for (const [j, v] of need) { const t = Math.min(M.upper[j], w[j] + v); if (t < w[j] + v - 1e-6) capped = true; d += t - w[j]; wn[j] = t; }
          if (capped || d <= EPS) continue;
          const touched = new Set(); for (const j of need.keys()) for (const i of M.colCells[j]) touched.add(i);
          hTmp.set(h); let dLoss = 0;
          for (const i of touched) { const s = cellState(M, M.cells[i], cellWidth(M.cells[i], wn)); dLoss += s.loss - L[i]; hTmp[i] = s.h; }
          const gain = -(dLoss + lam * (heightOf(M, hTmp) - H));
          if (gain <= 1e-9) continue;
          const ratio = gain / d;
          if (!best || ratio > best.ratio + 1e-12) best = { cols: [...need.keys()].map(j => [j, w[j], wn[j]]), ratio, gain, d };
        }
      }
      if (!best) break;
      segs.push({ cols: best.cols, d: best.d, gain: best.gain, slope: best.ratio });
      const moved = new Set();
      for (const [j, , to] of best.cols) { w[j] = to; kcur[j] = snap(M.cand[j], to); moved.add(j); }
      const touched = new Set(); for (const j of moved) for (const i of M.colCells[j]) touched.add(i);
      for (const i of touched) { const c = M.cells[i]; x[i] = cellWidth(c, w); const s = cellState(M, c, x[i]); lossSum += s.loss - L[i]; L[i] = s.loss; h[i] = s.h; }
      H = heightOf(M, h);
      refreshRows();
    }
    const T = new Float64Array(segs.length + 1), cost = new Float64Array(segs.length + 1);
    T[0] = M.floors.reduce((a, b) => a + b, 0); cost[0] = cost0;
    for (let i = 0; i < segs.length; i++) { T[i + 1] = T[i] + segs[i].d; cost[i + 1] = cost[i] - segs[i].gain; }
    const path = { segs, T, cost, floors: M.floors.slice(), checkpoints: [] };
    let cur = path.floors.slice();
    for (let i = 0; i <= segs.length; i++) { if (i % 32 === 0) path.checkpoints.push(cur.slice()); if (i < segs.length) for (const [j, , to] of segs[i].cols) cur[j] = to; }
    path.comfort = comfortWidth(M, path);
    path.buildMs = now() - t0;
    return path;
  }

  // Comfort width D (content budget): end of the last path step whose value per px exceeds what scrolling
  // costs per hidden px (rho * rows / viewport). Fixed point, because the threshold depends on D.
  function comfortWidth(M, path) {
    const ov = overheadOf(M);
    let D = path.T[path.T.length - 1];
    for (let it = 0; it < 4; it++) {
      const theta = M.opts.scrollRate * M.rows / (D + ov);
      let k = -1;
      for (let i = 0; i < path.segs.length; i++) if (path.segs[i].slope >= theta) k = i;
      D = path.T[k + 1];
    }
    return D;
  }

  function overheadOf(M) { let ov = M.tableExtra; for (let j = 0; j < M.nCols; j++) ov += M.colPad[j] + M.opts.safety; return ov; }
  function budgetOf(M, W) { return W - overheadOf(M); }

  function widthsAlongPath(path, B) {
    const { T, segs } = path;
    if (B <= T[0]) return path.floors.slice();
    let lo = 0, hi = T.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (T[mid] <= B) lo = mid; else hi = mid - 1; }
    const cp = lo >> 5, w = path.checkpoints[cp].slice();
    for (let i = cp * 32; i < lo; i++) for (const [j, , to] of segs[i].cols) w[j] = to;
    if (lo < segs.length) { const sg = segs[lo], t = (B - T[lo]) / sg.d; for (const [j, from, to] of sg.cols) w[j] = from + (to - from) * t; }
    return w;
  }

  function layout(M, path, W, opts) {
    const t0 = now();
    const scrollOK = opts && 'scroll' in opts ? opts.scroll : M.opts.scroll;
    const B = budgetOf(M, W), Tend = path.T[path.T.length - 1];
    let target = Math.min(B, Tend), scroll = false;
    if (B < path.T[0]) { target = path.T[0]; scroll = true; }
    else if (scrollOK && B < path.comfort) { target = path.comfort; scroll = true; }
    return finish(M, widthsAlongPath(path, target), W, now() - t0, scroll);
  }

  function finish(M, w, W, ms, scroll) {
    const colPx = w.map((x, j) => x + M.opts.safety + M.colPad[j]);
    const tableWidth = colPx.reduce((a, b) => a + b, 0) + M.tableExtra;
    return { widths: w, colPx, tableWidth, overflow: Math.max(0, tableWidth - W), ms, scroll: !!scroll || tableWidth > W + 0.5 };
  }

  function apply(table, L) {
    let cg = table.querySelector('colgroup[data-tb]');
    if (!cg) { cg = document.createElement('colgroup'); cg.setAttribute('data-tb', ''); table.insertBefore(cg, table.firstChild); }
    cg.innerHTML = L.colPx.map(x => `<col style="width:${x.toFixed(3)}px">`).join('');
    table.style.tableLayout = 'fixed';
    table.style.width = L.tableWidth.toFixed(3) + 'px';
    table.style.maxWidth = 'none';
  }
  function clear(table) {
    const cg = table.querySelector('colgroup[data-tb]');
    if (cg) cg.remove();
    table.style.tableLayout = ''; table.style.width = ''; table.style.maxWidth = '';
  }

  global.TableBadness = {
    DEFAULTS, prepare, buildPath, layout, evaluate, finish, apply, clear, budgetOf, overheadOf, widthsAlongPath,
    cellState, cellWidth, heightOf, rowBoundaries, readLoss, snap, buildGrid, roleOf,
    clearCache: () => cellCache.clear(), _cache: cellCache,
  };
})(typeof window !== 'undefined' ? window : globalThis);
