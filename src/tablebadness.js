/*
 * Table Badness — readability-aware automatic table layout.
 *
 * Structure of the method (see README):
 *   1. prepare (width-independent, once per distinct cell content):
 *      the browser itself lays each cell out twice in a hidden host —
 *        A: width 0, overflow-wrap normal  -> every soft-wrap opportunity becomes a line start
 *        B: nowrap                         -> in-context advance widths of every unbreakable unit
 *      so break opportunities follow the browser's own UAX#14 / dictionary / kinsoku rules.
 *   2. staircase (width-independent, pure arithmetic):
 *      "shrink-wrap descent" enumerates every distinct greedy layout of a cell exactly:
 *      w <- tightWidth(layout(w - eps)). No bisection, no DOM.
 *   3. column profile: f_j(w) = sum over distinct cells (count x loss(w)) — a step function.
 *   4. allocation path: the upper concave hull of each column's gain curve, merged by slope,
 *      gives ONE monotone path of column widths for every available width W.
 *      Resizing = O(log P) lookup; column widths are continuous and non-decreasing in W.
 *
 * Loss of a cell layout (in "extra line" units):
 *      (lines - 1) + A * intraTokenBreaks + E * emergencyBreaks
 *   intraTokenBreak: a browser-legal break that is neither after whitespace nor adjacent to a
 *   scriptio-continua character (Han, Kana, Thai, ...): e.g. "F-|12", "2024-|01", "한|국".
 *   emergencyBreak: overflow-wrap break inside an unbreakable unit.
 */
(function (global) {
  'use strict';

  const DEFAULTS = {
    tokenCost: 1,      // A: extra cost of an intra-token break
    emergencyCost: 2,  // E: extra cost of an emergency (overflow-wrap) break
    floorEm: 4,        // a column is never narrower than min(min-content, floorEm)
    safety: 1,         // px added to every rendered column to absorb sub-px rounding
    fragEm: 12,        // m0: comfortable measure; long text set narrower than m0 pays a convex penalty
    fragCost: 1,       // phi: weight of the fragmentation penalty (0 = purely linear in lines)
    scroll: true,      // allow voluntary horizontal scroll when squeezing costs more than scrolling
    scrollEntry: 3,    // kappa0: fixed cost per row of having to scroll at all
    scrollCost: 40,    // rho: additional cost per row per viewport-width of hidden table
    rowWeight: 2,      // lambda: cost of each extra line of ROW height (0 = separable, cell-only model)
    maxCandidates: 160,// cap on candidate widths per column (quantised beyond this)
  };

  const EPS = 0.01;
  const RE_SPACE = /^\s+$/u;
  // scripts written without inter-word spaces (+ CJK symbols & fullwidth forms)
  const RE_CONT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Bopomofo}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\p{Script=Tibetan}\p{Script=Yi}　-〿＀-￯ー︰-﹏]/u;
  const graphemeSeg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

  const now = () => (global.performance ? performance.now() : Date.now());

  // ---------------------------------------------------------------------------
  // DOM text helpers
  // ---------------------------------------------------------------------------
  function collectText(el) {
    const nodes = [];
    let text = '';
    const forced = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = walker.nextNode())) {
      if (n.nodeType === 1) { if (n.tagName === 'BR') forced.push(text.length); continue; }
      nodes.push({ node: n, start: text.length, end: text.length + n.data.length });
      text += n.data;
    }
    return { text, nodes, forced };
  }

  function nodeIndexAt(nodes, idx) {
    let lo = 0, hi = nodes.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (nodes[mid].start <= idx) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  // Sum of text-rect widths for flat-text range [a, b). Works per text node so element
  // boxes are not double counted; summing rects is bidi-safe.
  function widthOf(nodes, a, b, range) {
    if (b <= a) return 0;
    let w = 0;
    for (let i = nodeIndexAt(nodes, a); i < nodes.length && nodes[i].start < b; i++) {
      const nd = nodes[i];
      const s = Math.max(a, nd.start) - nd.start, e = Math.min(b, nd.end) - nd.start;
      if (e <= s) continue;
      range.setStart(nd.node, s);
      range.setEnd(nd.node, e);
      const rs = range.getClientRects();
      for (let k = 0; k < rs.length; k++) w += rs[k].width;
    }
    return w;
  }

  function firstRect(nodes, a, b, range) {
    const i = nodeIndexAt(nodes, a);
    const nd = nodes[i];
    range.setStart(nd.node, a - nd.start);
    const j = nodeIndexAt(nodes, b - 1);
    range.setEnd(nodes[j].node, b - nodes[j].start);
    const rs = range.getClientRects();
    return rs.length ? rs[0] : null;
  }

  function graphemes(text) {
    const out = [];
    for (const g of graphemeSeg.segment(text)) out.push([g.index, g.index + g.segment.length, RE_SPACE.test(g.segment)]);
    return out;
  }

  // Line starts (grapheme indices into gs) of an element as actually laid out by the browser.
  // A new line starts when a glyph's vertical midpoint is below the previous glyph's bottom.
  function lineStarts(nodes, gs, range) {
    const starts = [];
    let prev = null;
    for (let g = 0; g < gs.length; g++) {
      if (gs[g][2]) continue;
      const r = firstRect(nodes, gs[g][0], gs[g][1], range);
      if (!r || (r.width === 0 && r.height === 0)) continue;
      if (prev === null) { starts.push(g); prev = r; continue; }
      if ((r.top + r.bottom) / 2 > prev.bottom) starts.push(g);
      prev = r;
    }
    return starts;
  }

  // ---------------------------------------------------------------------------
  // prepare: cells -> units (unbreakable runs) with widths and break kinds
  // ---------------------------------------------------------------------------
  function fontSignature(el) {
    const cs = getComputedStyle(el);
    return [cs.font, cs.letterSpacing, cs.wordSpacing, cs.wordBreak, cs.lineBreak, cs.fontFeatureSettings,
      el.closest('[lang]') ? el.closest('[lang]').getAttribute('lang') : ''].join('|');
  }

  const cellCache = new Map(); // key -> prepared cell (reused across tables, viewports and edits)

  function analyseCell(divA, divB, range, emergencyMinPx) {
    const A = collectText(divA), B = collectText(divB);
    const text = A.text;
    const gs = graphemes(text);
    const starts = lineStarts(A.nodes, gs, range); // grapheme indices
    const n = starts.length;
    const C = new Float64Array(n), ADV = new Float64Array(n), K = new Uint8Array(n);
    const unitStart = new Int32Array(n); // char offsets
    const prefixes = new Array(n);
    let maxGraph = 0;
    for (let u = 0; u < n; u++) {
      const g0 = starts[u], g1 = u + 1 < n ? starts[u + 1] : gs.length;
      let gl = g1 - 1; while (gl > g0 && gs[gl][2]) gl--; // last non-space grapheme
      const a = gs[g0][0], contentEnd = gs[gl][1], advEnd = g1 < gs.length ? gs[g1][0] : contentEnd;
      unitStart[u] = a;
      C[u] = widthOf(B.nodes, a, contentEnd, range);
      ADV[u] = u + 1 < n ? widthOf(B.nodes, a, advEnd, range) : C[u];
      if (u > 0) {
        const before = text[a - 1];
        let isForced = false;
        for (const fp of A.forced) if (fp <= a && fp >= gs[starts[u - 1]][0] && /^\s*$/u.test(text.slice(fp, a))) isForced = true;
        if (isForced) K[u] = 2;
        else if (/\s/u.test(before)) K[u] = 0;
        else {
          let gp = g0 - 1; while (gp > 0 && gs[gp][2]) gp--;
          const prevG = text.slice(gs[gp][0], gs[gp][1]), curG = text.slice(gs[g0][0], gs[g0][1]);
          K[u] = (RE_CONT.test(prevG) || RE_CONT.test(curG)) ? 0 : 1;
        }
      }
      if (C[u] > emergencyMinPx) {
        // grapheme prefix widths (needed for emergency breaks and for maxGraph)
        const P = [0];
        let last = 0;
        for (let g = g0; g <= gl; g++) {
          const w = widthOf(B.nodes, a, gs[g][1], range);
          maxGraph = Math.max(maxGraph, w - last);
          last = w;
          P.push(w);
        }
        P[P.length - 1] = C[u];
        prefixes[u] = Float64Array.from(P);
      } else {
        maxGraph = Math.max(maxGraph, C[u]);
      }
    }
    let minContent = 0;
    for (let u = 0; u < n; u++) minContent = Math.max(minContent, C[u]);
    const cell = { text, n, C, ADV, K, unitStart, prefixes, natural: 0, minContent, maxGraph, graphemeCount: gs.length };
    cell.natural = layoutCell(cell, 1e9).tight;
    return cell;
  }

  // ---------------------------------------------------------------------------
  // arithmetic layout (greedy, mirrors CSS white-space:normal + overflow-wrap:break-word)
  // ---------------------------------------------------------------------------
  function layoutCell(cell, w) {
    const { n, C, ADV, K, prefixes } = cell;
    let lines = 1, tok = 0, em = 0, x = 0, lineW = 0, tight = 0, empty = true, overflow = false;
    for (let k = 0; k < n; k++) {
      const c = C[k];
      if (!empty) {
        if (K[k] !== 2 && x + c <= w + EPS) { lineW = x + c; x += ADV[k]; continue; }
        if (lineW > tight) tight = lineW;
        lines++; if (K[k] === 1) tok++; x = 0; lineW = 0; empty = true;
      }
      if (c <= w + EPS) { lineW = c; x = ADV[k]; empty = false; continue; }
      const P = prefixes[k];
      if (!P) { lineW = c; x = ADV[k]; empty = false; overflow = true; continue; }
      const G = P.length - 1;
      let s = 0;
      while (P[G] - P[s] > w + EPS) {
        let e = s + 1;
        while (e < G && P[e + 1] - P[s] <= w + EPS) e++;
        const seg = P[e] - P[s];
        if (seg > tight) tight = seg;
        if (seg > w + EPS) overflow = true;
        lines++; em++; s = e;
      }
      lineW = P[G] - P[s]; x = ADV[k] - P[s]; empty = false;
    }
    if (lineW > tight) tight = lineW;
    return { lines, tok, em, tight, overflow };
  }

  // Loss of one cell layout. lines/tok/em from the layout, t = its tight width, N = natural width.
  function cellLoss(lines, tok, em, t, N, o, fs) {
    let v = (lines - 1) + o.tokenCost * tok + o.emergencyCost * em;
    const m0 = o.fragEm * fs;
    if (o.fragCost > 0 && N > m0 && lines > 1) {
      const x = m0 / Math.max(t, 1) - 1;
      if (x > 0) v += o.fragCost * lines * x * x;
    }
    return v;
  }
  function lossOf(r, o, cell, fs) { return cellLoss(r.lines, r.tok, r.em, r.tight, cell.natural, o, fs); }

  // Shrink-wrap descent: every distinct layout from natural width down to wMin.
  // Returns ascending arrays: widths[i] (tight width of layout i), lines/tok/em.
  function staircase(cell, wMin) {
    const W = [], L = [], T = [], M = [];
    let w = cell.natural + 1, prevTight = Infinity;
    for (let guard = 0; guard < 100000; guard++) {
      const r = layoutCell(cell, w);
      if (r.tight >= prevTight - 1e-9) break;
      W.push(r.tight); L.push(r.lines); T.push(r.tok); M.push(r.em);
      prevTight = r.tight;
      const next = r.tight - 0.02;
      if (next < wMin) break;
      w = next;
    }
    W.reverse(); L.reverse(); T.reverse(); M.reverse();
    return { w: Float64Array.from(W), lines: Int32Array.from(L), tok: Int32Array.from(T), em: Int32Array.from(M) };
  }

  // index of the layout in effect at width w (largest step width <= w); -1 if below all
  function stepAt(st, w) {
    const a = st.w;
    let lo = 0, hi = a.length - 1, ans = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (a[mid] <= w + EPS) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return ans;
  }

  // ---------------------------------------------------------------------------
  // prepareTable
  // ---------------------------------------------------------------------------
  function prepareTable(table, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const t0 = now();
    const rows = Array.from(table.rows);
    const nCols = rows.reduce((m, r) => Math.max(m, r.cells.length), 0);
    const sampleTd = table.querySelector('td') || table.querySelector('th');
    const sampleTh = table.querySelector('th') || sampleTd;
    const fontSize = parseFloat(getComputedStyle(sampleTd).fontSize) || 16;
    const floorPx = o.floorEm * fontSize;
    const sigTd = fontSignature(sampleTd), sigTh = fontSignature(sampleTh);

    // distinct cells per column, with counts
    const grid = []; // grid[r][c] = key
    const colMaps = Array.from({ length: nCols }, () => new Map());
    const pending = new Map(); // key -> {html, header}
    rows.forEach((row, ri) => {
      grid[ri] = [];
      for (let c = 0; c < nCols; c++) {
        const cellEl = row.cells[c];
        const header = cellEl ? cellEl.tagName === 'TH' : false;
        const html = cellEl ? cellEl.innerHTML.trim() : '';
        const key = (header ? sigTh : sigTd) + '\u0000' + (header ? 'H' : 'D') + '\u0000' + html;
        grid[ri][c] = key;
        const m = colMaps[c];
        m.set(key, (m.get(key) || 0) + 1);
        if (!cellCache.has(key) && !pending.has(key)) pending.set(key, { html, header });
      }
    });

    // measure all new distinct cells in one batch (two reflows total)
    let measured = 0;
    if (pending.size) {
      const host = document.createElement('div');
      host.setAttribute('aria-hidden', 'true');
      host.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;overflow:hidden;visibility:hidden;contain:strict;';
      const mt = document.createElement('table');
      mt.className = table.className;
      mt.style.cssText = 'position:absolute;table-layout:auto;width:auto;';
      mt.innerHTML = '<thead><tr><th></th></tr></thead><tbody><tr><td></td></tr></tbody>';
      host.appendChild(mt);
      table.parentNode.insertBefore(host, table);
      const thHost = mt.querySelector('th'), tdHost = mt.querySelector('td');
      const items = [];
      for (const [key, it] of pending) {
        const parent = it.header ? thHost : tdHost;
        const a = document.createElement('div');
        a.style.cssText = 'width:0;white-space:normal;overflow-wrap:normal;word-wrap:normal;';
        a.innerHTML = it.html;
        const b = document.createElement('div');
        b.style.cssText = 'width:max-content;white-space:nowrap;';
        b.innerHTML = it.html;
        parent.appendChild(a); parent.appendChild(b);
        items.push([key, a, b]);
      }
      const range = document.createRange();
      for (const [key, a, b] of items) {
        const cell = analyseCell(a, b, range, floorPx * 0.5);
        cellCache.set(key, cell);
        measured++;
      }
      host.remove();
    }
    const tMeasure = now();

    // staircases + column profiles
    const cols = [];
    const isHeaderRow = rows.map(r => r.cells[0] && r.cells[0].tagName === 'TH' && r.parentNode.tagName === 'THEAD');
    for (let c = 0; c < nCols; c++) {
      const entries = [];
      let minContent = 0, natural = 0, maxGraph = 0;
      for (const [key, count] of colMaps[c]) {
        const cell = cellCache.get(key);
        entries.push({ key, count, cell });
        minContent = Math.max(minContent, cell.minContent);
        natural = Math.max(natural, cell.natural);
        maxGraph = Math.max(maxGraph, cell.maxGraph);
      }
      const floor = Math.max(maxGraph, Math.min(minContent, floorPx));
      for (const e of entries) {
        const wMin = Math.max(e.cell.maxGraph, Math.min(e.cell.minContent, floor));
        const sk = 'st' + wMin.toFixed(2);
        if (!e.cell[sk]) e.cell[sk] = staircase(e.cell, wMin);
        e.st = e.cell[sk];
      }
      cols.push({ entries, floor, natural: Math.max(natural, floor), minContent, maxGraph });
    }
    const P = { table, rows: rows.length, nCols, grid, cols, fontSize, opts: o, isHeaderRow };
    buildCandidates(P);
    // per-column overhead (padding + borders) and table borders
    const ref = rows.find(r => r.cells.length === nCols) || rows[0];
    P.overhead = [];
    for (let c = 0; c < nCols; c++) {
      const cs = getComputedStyle(ref.cells[c] || sampleTd);
      P.overhead.push(parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth));
    }
    const tcs = getComputedStyle(table);
    P.tableExtra = parseFloat(tcs.borderLeftWidth) + parseFloat(tcs.borderRightWidth);
    const tEnd = now();
    P.timing = { measureMs: tMeasure - t0, staircaseMs: tEnd - tMeasure, prepareMs: tEnd - t0, measuredCells: measured, distinctCells: pending.size };
    return P;
  }

  // Candidate widths of each column = union of its cells' staircase widths in [floor, natural]
  // (every width at which some cell's layout changes; nothing in between can matter).
  // For each candidate: line count of every row (Uint16) and the column's summed cell loss.
  // Very large columns are quantised to at most maxCandidates widths (rounded UP, never optimistic).
  function buildCandidates(P) {
    const o = P.opts, fs = P.fontSize;
    P.cols.forEach((col, j) => {
      let ws = [];
      for (const e of col.entries) for (const w of e.st.w) if (w > col.floor + EPS && w <= col.natural + EPS) ws.push(w);
      ws.push(col.floor);
      ws.sort((a, b) => a - b);
      const uniq = [];
      for (const w of ws) if (!uniq.length || w - uniq[uniq.length - 1] > 1e-6) uniq.push(w);
      let cand = uniq;
      if (cand.length > o.maxCandidates) {
        const span = col.natural - col.floor, q = span / (o.maxCandidates - 1);
        const qs = new Set([col.floor]);
        for (const w of uniq) qs.add(Math.min(col.natural, col.floor + Math.ceil((w - col.floor) / q - 1e-9) * q));
        cand = [...qs].sort((a, b) => a - b);
      }
      const K = cand.length;
      const byKey = new Map(col.entries.map(e => [e.key, e]));
      // per distinct cell: lines & loss at each candidate
      const per = new Map();
      for (const e of col.entries) {
        const L = new Uint16Array(K), F = new Float64Array(K);
        for (let k = 0; k < K; k++) {
          const i = stepAt(e.st, cand[k]);
          let lines, tok, em, t;
          if (i < 0) { const r = layoutCell(e.cell, cand[k]); lines = r.lines; tok = r.tok; em = r.em; t = r.tight; }
          else { lines = e.st.lines[i]; tok = e.st.tok[i]; em = e.st.em[i]; t = e.st.w[i]; }
          L[k] = lines; F[k] = cellLoss(lines, tok, em, t, e.cell.natural, o, fs);
        }
        per.set(e.key, { L, F, count: e.count });
      }
      const lines = new Array(K), f = new Float64Array(K);
      for (let k = 0; k < K; k++) lines[k] = new Uint16Array(P.rows);
      for (let r = 0; r < P.rows; r++) {
        const pc = per.get(P.grid[r][j]);
        for (let k = 0; k < K; k++) { lines[k][r] = pc.L[k]; f[k] += pc.F[k]; }
      }
      col.cand = Float64Array.from(cand);
      col.lines = lines;
      col.profile = { w: col.cand, f }; // separable part of the loss
      void byKey;
    });
  }

  function snapIdx(col, w) {
    const a = col.cand;
    let lo = 0, hi = a.length - 1, ans = 0;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (a[mid] <= w + EPS) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return ans;
  }
  function profileAt(col, w) { return col.profile.f[snapIdx(col, w)]; }

  // Full objective: sum of cell losses + rowWeight * sum over rows of (row height in lines - 1)
  function costOfIdx(P, idx) {
    let s = 0;
    for (let j = 0; j < P.nCols; j++) s += P.cols[j].profile.f[idx[j]];
    const lam = P.opts.rowWeight;
    if (lam) {
      for (let r = 0; r < P.rows; r++) {
        let mx = 1;
        for (let j = 0; j < P.nCols; j++) { const l = P.cols[j].lines[idx[j]][r]; if (l > mx) mx = l; }
        s += lam * (mx - 1);
      }
    }
    return s;
  }
  function costOf(P, widths) { return costOfIdx(P, widths.map((w, j) => snapIdx(P.cols[j], w))); }

  // ---------------------------------------------------------------------------
  // allocation path
  // ---------------------------------------------------------------------------
  function makePath(P, segs, t0) {
    const T = new Float64Array(segs.length + 1);
    const cost = new Float64Array(segs.length + 1);
    T[0] = P.cols.reduce((s, c) => s + c.floor, 0);
    cost[0] = costOfIdx(P, P.cols.map(() => 0));
    for (let i = 0; i < segs.length; i++) { T[i + 1] = T[i] + (segs[i].to - segs[i].from); cost[i + 1] = cost[i] - segs[i].gain; }
    const path = { segs, T, cost, floors: P.cols.map(c => c.floor), checkpoints: [] };
    let cur = path.floors.slice();
    for (let i = 0; i <= segs.length; i++) {
      if (i % 32 === 0) path.checkpoints.push(cur.slice());
      if (i < segs.length) cur[segs[i].col] = segs[i].to;
    }
    path.buildMs = now() - t0;
    return path;
  }

  // Greedy marginal-utility path on the coupled objective: repeatedly widen the one column whose
  // jump to some larger candidate buys the most loss reduction per pixel. Every step only widens,
  // so the path is a monotone width schedule valid for ALL available widths at once.
  function buildPath(P) {
    if (!P.opts.rowWeight) return buildHullPath(P);
    const t0 = now();
    const m = P.nCols, R = P.rows, lam = P.opts.rowWeight;
    const cols = P.cols;
    const idx = new Int32Array(m);
    const top1 = new Int32Array(R), top1n = new Int32Array(R), top2 = new Int32Array(R);
    const segs = [];
    const recomputeTops = () => {
      for (let r = 0; r < R; r++) {
        let a = 1, an = 0, b = 1;
        for (let j = 0; j < m; j++) {
          const l = cols[j].lines[idx[j]][r];
          if (l > a) { b = a; a = l; an = 1; } else if (l === a) an++; else if (l > b) b = l;
        }
        top1[r] = a; top1n[r] = an; top2[r] = b;
      }
    };
    for (let guard = 0; guard < 1e6; guard++) {
      recomputeTops();
      let best = -1, bestK = -1, bestRatio = 0, bestGain = 0;
      for (let j = 0; j < m; j++) {
        const col = cols[j], cur = idx[j], Lc = col.lines[cur], fc = col.profile.f[cur];
        const K = col.cand.length;
        if (cur === K - 1) continue;
        for (let k = cur + 1; k < K; k++) {
          const Lk = col.lines[k];
          let g = fc - col.profile.f[k];
          for (let r = 0; r < R; r++) {
            const lc = Lc[r], lk = Lk[r];
            if (lk === lc) continue;
            const om = (lc === top1[r] && top1n[r] === 1) ? top2[r] : top1[r];
            g += lam * ((lc > om ? lc : om) - (lk > om ? lk : om));
          }
          if (g <= 1e-9) continue;
          const ratio = g / (col.cand[k] - col.cand[cur]);
          if (ratio > bestRatio + 1e-12) { bestRatio = ratio; best = j; bestK = k; bestGain = g; }
        }
      }
      if (best < 0) break;
      segs.push({ col: best, from: cols[best].cand[idx[best]], to: cols[best].cand[bestK], gain: bestGain, slope: bestRatio });
      idx[best] = bestK;
    }
    return makePath(P, segs, t0);
  }

  // Separable special case (rowWeight = 0): merge upper concave hulls of column gain curves by slope.
  function buildHullPath(P) {
    const t0 = now();
    const segs = [];
    P.cols.forEach((col, j) => {
      const { w, f } = col.profile;
      let best = 0;
      for (let i = 1; i < f.length; i++) if (f[i] < f[best] - 1e-9) best = i;
      const hull = [0];
      for (let i = 1; i <= best; i++) {
        if (f[i] >= f[hull[hull.length - 1]] - 1e-9) continue;
        while (hull.length >= 2) {
          const a = hull[hull.length - 2], b = hull[hull.length - 1];
          const s1 = (f[a] - f[b]) / (w[b] - w[a]);
          const s2 = (f[a] - f[i]) / (w[i] - w[a]);
          if (s2 >= s1 - 1e-12) hull.pop(); else break;
        }
        hull.push(i);
      }
      for (let k = 1; k < hull.length; k++) {
        const a = hull[k - 1], b = hull[k];
        segs.push({ col: j, from: w[a], to: w[b], gain: f[a] - f[b], slope: (f[a] - f[b]) / (w[b] - w[a]) });
      }
    });
    segs.sort((x, y) => y.slope - x.slope || x.col - y.col);
    return makePath(P, segs, t0);
  }

  function budgetOf(P, W) {
    let ov = P.tableExtra;
    for (let c = 0; c < P.nCols; c++) ov += P.overhead[c] + P.opts.safety;
    return W - ov;
  }

  function widthsAlongPath(path, B) {
    const { T, segs } = path;
    if (B <= T[0]) return path.floors.slice();
    let lo = 0, hi = T.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (T[mid] <= B) lo = mid; else hi = mid - 1; }
    const k = lo;
    const cp = k >> 5;
    const w = path.checkpoints[cp].slice();
    for (let i = cp * 32; i < k; i++) w[segs[i].col] = segs[i].to;
    if (k < segs.length) w[segs[k].col] = segs[k].from + (B - T[k]);
    return w;
  }

  // Layout for available width W (px, including borders/padding).
  function layoutAt(P, path, W) {
    const t0 = now();
    const o = P.opts;
    const B = budgetOf(P, W);
    let widths = widthsAlongPath(path, Math.min(B, path.T[path.T.length - 1]));
    let cost = costOf(P, widths);
    const scrollPenalty = T => P.rows * (o.scrollEntry + o.scrollCost * (T - B) / Math.max(W, 1));
    let scroll = B < path.T[0] - EPS;
    if (scroll) cost += scrollPenalty(path.T[0]);
    if (o.scroll) {
      // voluntary horizontal scroll: a wider path vertex may be cheaper than squeezing
      for (let i = 0; i < path.T.length; i++) {
        if (path.T[i] <= B + EPS) continue;
        const c = path.cost[i] + scrollPenalty(path.T[i]);
        if (c < cost - 1e-9) { cost = c; widths = widthsAlongPath(path, path.T[i]); scroll = true; }
      }
    }
    return finish(P, widths, W, cost, now() - t0, scroll);
  }

  function finish(P, widths, W, cost, ms, scroll) {
    const o = P.opts;
    const colPx = widths.map((w, c) => w + o.safety + P.overhead[c]);
    const tableWidth = colPx.reduce((a, b) => a + b, 0) + P.tableExtra;
    return { widths, colPx, tableWidth, overflow: Math.max(0, tableWidth - W), cost, ms, scroll: !!scroll };
  }

  // Predicted per-cell layouts for given content widths (used by experiments & demo)
  function predict(P, widths) {
    const o = P.opts;
    const out = { rowLines: [], cells: [] };
    for (let r = 0; r < P.rows; r++) {
      let mx = 1;
      const row = [];
      for (let c = 0; c < P.nCols; c++) {
        const cell = cellCache.get(P.grid[r][c]);
        const ent = P.cols[c].entries.find(e => e.key === P.grid[r][c]);
        const st = ent.st;
        let i = stepAt(st, widths[c]);
        let res;
        if (i < 0) res = layoutCell(cell, widths[c]); else res = { lines: st.lines[i], tok: st.tok[i], em: st.em[i], tight: st.w[i] };
        res.cell = cell;
        row.push(res);
        if (res.lines > mx) mx = res.lines;
      }
      out.rowLines.push(mx); out.cells.push(row);
    }
    out.loss = 0;
    out.cells.forEach(row => row.forEach(r => { out.loss += lossOf(r, o, r.cell, P.fontSize); delete r.cell; }));
    out.cellLoss = out.loss;
    out.loss += o.rowWeight * out.rowLines.reduce((a, b) => a + b - 1, 0);
    return out;
  }

  function applyWidths(table, layout) {
    let cg = table.querySelector('colgroup[data-tb]');
    if (!cg) { cg = document.createElement('colgroup'); cg.setAttribute('data-tb', ''); table.insertBefore(cg, table.firstChild); }
    cg.innerHTML = layout.colPx.map(w => `<col style="width:${w.toFixed(3)}px">`).join('');
    table.style.tableLayout = 'fixed';
    table.style.width = layout.tableWidth.toFixed(3) + 'px';
    table.style.maxWidth = 'none';
  }

  function clearWidths(table) {
    const cg = table.querySelector('colgroup[data-tb]');
    if (cg) cg.remove();
    table.style.tableLayout = '';
    table.style.width = '';
    table.style.maxWidth = '';
  }

  function clearCache() { cellCache.clear(); }

  global.TableBadness = {
    DEFAULTS, prepareTable, buildPath, buildHullPath, layoutAt, costOfIdx, snapIdx, widthsAlongPath, budgetOf, costOf, profileAt, finish,
    predict, applyWidths, clearWidths, clearCache, layoutCell, staircase, stepAt, lossOf, cellLoss,
    collectText, graphemes, lineStarts, _cache: cellCache, RE_CONT,
  };
})(typeof window !== 'undefined' ? window : globalThis);
