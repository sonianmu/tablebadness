/* In-page experiment driver (runs inside headless Chromium via bench/run.mjs). */
(function (global) {
  'use strict';
  const TB = global.TableBadness, BL = global.TBBaselines, MT = global.TBMetrics, MD = global.TBMarkdown;
  const now = () => performance.now();

  function render(c, W, fontSize) {
    const stage = document.getElementById('stage');
    stage.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'tb-wrap';
    wrap.style.width = W + 'px';
    wrap.style.setProperty('--tb-font-size', fontSize + 'px');
    wrap.lang = c.lang;
    wrap.innerHTML = MD.toHTML(MD.parseTable(c.md));
    stage.appendChild(wrap);
    return { wrap, table: wrap.querySelector('table') };
  }

  const METHODS = ['css-auto', 'equal', 'proportional', 'min-height', 'tb-ls', 'tb-fit', 'tb-path', 'tb-separable', 'tb-nofrag', 'tb-lines-only'];

  function layoutFor(method, ctx, W) {
    const { P, path, P0, path0, Pf, Pn, pathN, Ps, pathS } = ctx;
    switch (method) {
      case 'equal': return BL.equal(P, W);
      case 'proportional': return BL.proportional(P, W);
      case 'min-height': {
        const starts = [TB.layoutAt(P, path, W).widths, BL.proportional(P, W).widths];
        return BL.minHeight(P, W, starts);
      }
      case 'tb-dp': return BL.dpExact(Ps, W);
      case 'tb-separable': return TB.layoutAt(Ps, pathS, W);
      case 'tb-ls': return BL.tbLocalSearch(Pf, W, [TB.layoutAt(Pf, path, W).widths, BL.proportional(P, W).widths]);
      case 'tb-path': return TB.layoutAt(P, path, W);
      case 'tb-fit': return TB.layoutAt(Pf, path, W);
      case 'tb-nofrag': return TB.layoutAt(Pn, pathN, W);
      case 'tb-lines-only': return TB.layoutAt(P0, path0, W);
    }
    return null;
  }

  function prepareCtx(table, opts) {
    const P = TB.prepareTable(table, opts);
    const path = TB.buildPath(P);
    const fit = Object.assign({}, P.opts, { scroll: false });
    const P0 = TB.prepareTable(table, Object.assign({}, fit, { tokenCost: 0, emergencyCost: 0, fragCost: 0 }));
    const path0 = TB.buildPath(P0);
    const Pn = TB.prepareTable(table, Object.assign({}, fit, { fragCost: 0 }));
    const pathN = TB.buildPath(Pn);
    const Pf = Object.assign({}, P, { opts: fit });
    const Ps = TB.prepareTable(table, Object.assign({}, fit, { rowWeight: 0 }));
    const pathS = TB.buildPath(Ps);
    return { P, path, P0, path0, Pf, Pn, pathN, Ps, pathS };
  }

  function runCase(c, widths, fontSize, opts, methods) {
    methods = methods || METHODS;
    TB.clearCache();
    const { wrap, table } = render(c, widths[0], fontSize);
    const t0 = now();
    const ctx = prepareCtx(table, opts);
    const prepMs = now() - t0;
    const out = { id: c.id, set: c.set, tags: c.tags, fontSize, prepare: ctx.P.timing, pathBuildMs: ctx.path.buildMs, prepAllMs: prepMs, results: [] };
    for (const W of widths) {
      wrap.style.width = W + 'px';
      for (const m of methods) {
        let L = null;
        if (m === 'css-auto') { TB.clearWidths(table); }
        else { L = layoutFor(m, ctx, W); TB.applyWidths(table, L); }
        const met = MT.measure(ctx.P, W, wrap);
        const r = { W, method: m, ms: L ? L.ms : null, scroll: L ? L.scroll : met.overflowPx > 0.5, metrics: met };
        // engine prediction vs real DOM (lines per cell)
        if (L) {
          const pred = TB.predict(ctx.P, L.widths);
          let agree = 0, total = 0;
          pred.cells.forEach((row, ri) => row.forEach((p, ci) => { total++; if (p.lines === met.cellLines[ri][ci]) agree++; }));
          r.predAgree = agree / total;
          r.loss = pred.loss;
        } else {
          // evaluate TB loss of the browser's widths (content width = measured col width - overhead)
          const ws = met.colWidths.map((w, j) => w - ctx.P.overhead[j]);
          r.loss = TB.predict(ctx.P, ws).loss;
        }
        delete met.cellLines; delete met.bottlenecks;
        out.results.push(r);
      }
    }
    return out;
  }

  // Prediction accuracy of the arithmetic engine against real browser layout at random widths.
  function accuracy(c, fontSize, samples, seed) {
    TB.clearCache();
    const { table } = render(c, 800, fontSize);
    const P = TB.prepareTable(table);
    let s = seed || 1;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;';
    const mt = document.createElement('table');
    mt.className = table.className;
    mt.innerHTML = '<thead><tr><th></th></tr></thead><tbody><tr><td></td></tr></tbody>';
    host.appendChild(mt);
    table.parentNode.appendChild(host);
    const items = [];
    const seen = new Set();
    for (const col of P.cols) for (const e of col.entries) {
      if (seen.has(e.key)) continue; seen.add(e.key);
      const header = e.key.split('\u0000')[1] === 'H';
      const lo = Math.max(e.cell.maxGraph, col.floor * 0.5), hi = e.cell.natural + 4;
      for (let k = 0; k < samples; k++) {
        const w = lo + (hi - lo) * rnd();
        const d = document.createElement('div');
        d.style.cssText = `width:${w}px;`;
        d.innerHTML = e.key.split('\u0000')[2];
        (header ? mt.querySelector('th') : mt.querySelector('td')).appendChild(d);
        items.push({ d, w, cell: e.cell });
      }
    }
    const range = document.createRange();
    let agree = 0, off = 0, agreeSafe = 0;
    const misses = [];
    for (const it of items) {
      const { nodes, text } = TB.collectText(it.d);
      const gs = TB.graphemes(text);
      const actual = Math.max(1, TB.lineStarts(nodes, gs, range).length);
      const pred = TB.layoutCell(it.cell, it.w).lines;
      if (actual === pred) agree++; else { off += Math.abs(actual - pred); if (misses.length < 5) misses.push({ text: it.cell.text.slice(0, 40), w: +it.w.toFixed(2), pred, actual }); }
    }
    // same test with the 1px safety margin used in rendering: predict at w, render at w+1
    for (const it of items) it.d.style.width = (it.w + 1) + 'px';
    for (const it of items) {
      const { nodes, text } = TB.collectText(it.d);
      const actual = Math.max(1, TB.lineStarts(nodes, TB.graphemes(text), range).length);
      const pred = TB.layoutCell(it.cell, it.w).lines;
      if (actual === pred) agreeSafe++;
    }
    host.remove();
    return { id: c.id, tags: c.tags, n: items.length, agree: agree / items.length, agreeSafe: agreeSafe / items.length, meanAbsErr: off / items.length, misses };
  }

  // Stability: sweep available width; column widths (from layout or DOM for css-auto)
  function stability(c, fontSize, Wmin, Wmax, step, methods) {
    TB.clearCache();
    const { wrap, table } = render(c, Wmin, fontSize);
    const ctx = prepareCtx(table, {});
    const res = {};
    for (const m of methods) {
      let prev = null, jitter = 0, reversals = 0, steps = 0, lineChanges = 0, prevLines = null, timeSum = 0;
      for (let W = Wmin; W <= Wmax; W += step) {
        wrap.style.width = W + 'px';
        let ws, lines;
        if (m === 'css-auto') {
          TB.clearWidths(table);
          const t0 = now();
          const ref = Array.from(table.rows).find(r => r.cells.length === ctx.P.nCols);
          ws = Array.from(ref.cells, x => x.getBoundingClientRect().width);
          timeSum += now() - t0;
          lines = TB.predict(ctx.P, ws.map((w, j) => w - ctx.P.overhead[j])).rowLines.reduce((a, b) => a + b, 0);
        } else {
          const t0 = now();
          const L = layoutFor(m, ctx, W);
          timeSum += now() - t0;
          ws = L.colPx;
          lines = TB.predict(ctx.P, L.widths).rowLines.reduce((a, b) => a + b, 0);
        }
        if (prev) {
          const dT = Math.abs(ws.reduce((a, b) => a + b, 0) - prev.reduce((a, b) => a + b, 0));
          let mv = 0;
          ws.forEach((w, j) => { mv += Math.abs(w - prev[j]); if (w < prev[j] - 0.5) reversals++; });
          jitter += Math.max(0, mv - dT);
          if (lines !== prevLines) lineChanges++;
          steps++;
        }
        prev = ws; prevLines = lines;
      }
      res[m] = { meanExcessMovePx: jitter / steps, reversalsPerStep: reversals / steps, lineChangeRate: lineChanges / steps, meanLayoutMs: timeSum / (steps + 1) };
    }
    return { id: c.id, tags: c.tags, res };
  }

  // Performance scaling on synthetic tables built from real case rows.
  function perf(rowsTarget, fontSize) {
    TB.clearCache();
    const src = global.TB_CASES.filter(c => c.set === 'dev');
    // concatenate rows of 5-column tables, varying text so that cells are distinct
    const tables = src.map(c => MD.parseTable(c.md)).filter(t => t.header.length === 5);
    const header = tables[0].header;
    const rows = [];
    let k = 0;
    while (rows.length < rowsTarget) {
      const t = tables[k % tables.length];
      const r = t.rows[Math.floor(k / tables.length) % t.rows.length];
      rows.push(r.map((x, j) => (j === 0 ? x + ' ' + rows.length : x)));
      k++;
    }
    const md = '| ' + header.join(' | ') + ' |\n|' + header.map(() => '---').join('|') + '|\n' + rows.map(r => '| ' + r.join(' | ') + ' |').join('\n');
    const { wrap, table } = render({ md, lang: 'zh-CN' }, 720, fontSize);
    const t0 = now();
    const P = TB.prepareTable(table);
    const t1 = now();
    const path = TB.buildPath(P);
    const t2 = now();
    // warm: re-prepare with everything cached (e.g. after an edit or a font-independent re-render)
    const P2 = TB.prepareTable(table);
    const t3 = now();
    let q = 0;
    const Q = 2000;
    const tq0 = now();
    for (let i = 0; i < Q; i++) q += TB.layoutAt(P, path, 320 + (i * 7) % 900).tableWidth;
    const tq = (now() - tq0) / Q;
    // full per-resize pipeline for our method: lookup + apply + browser fixed layout
    let tApply = 0, tAuto = 0;
    const R = 20;
    for (let i = 0; i < R; i++) {
      const W = 360 + i * 30;
      wrap.style.width = W + 'px';
      const a = now();
      TB.applyWidths(table, TB.layoutAt(P, path, W));
      void table.offsetHeight;
      tApply += now() - a;
    }
    TB.clearWidths(table);
    for (let i = 0; i < R; i++) {
      wrap.style.width = (360 + i * 30) + 'px';
      const a = now();
      void table.offsetHeight;
      tAuto += now() - a;
    }
    // DOM probing alternative: line counts of every cell at 32 candidate widths of every column via reflow
    const ref = Array.from(table.rows).find(r => r.cells.length === P.nCols);
    let tProbe = 0;
    {
      const a = now();
      const K = 32;
      for (let kk = 0; kk < K; kk++) {
        const ws = P.cols.map(c => c.floor + (c.natural - c.floor) * kk / (K - 1));
        TB.applyWidths(table, TB.finish(P, ws, 720, 0, 0, false));
        let s = 0;
        for (const row of table.rows) for (const cell of row.cells) s += cell.getBoundingClientRect().height;
        void s;
      }
      tProbe = now() - a;
    }
    // arithmetic equivalent: the same 32 x (all cells) evaluations
    let tArith;
    {
      const a = now();
      let s = 0;
      for (let kk = 0; kk < 32; kk++) {
        const ws = P.cols.map(c => c.floor + (c.natural - c.floor) * kk / 31);
        P.cols.forEach((col, j) => { for (const e of col.entries) s += e.count * TB.layoutCell(e.cell, ws[j]).lines; });
      }
      tArith = now() - a;
      void s;
    }
    let steps = 0, units = 0;
    for (const col of P.cols) for (const e of col.entries) { steps += e.st.w.length; units += e.cell.n; }
    return {
      rows: rowsTarget, cells: rowsTarget * P.nCols, distinct: P.timing.distinctCells, units, staircaseSteps: steps,
      segments: path.segs.length,
      prepareMs: t1 - t0, measureMs: P.timing.measureMs, staircaseMs: P.timing.staircaseMs, pathMs: t2 - t1,
      warmPrepareMs: t3 - t2, queryUs: tq * 1000, applyPlusReflowMs: tApply / R, cssAutoReflowMs: tAuto / R,
      domProbe32Ms: tProbe, arith32Ms: tArith, _: q > 0,
    };
  }

  global.TBX = { render, runCase, accuracy, stability, perf, METHODS, prepareCtx };
})(window);
