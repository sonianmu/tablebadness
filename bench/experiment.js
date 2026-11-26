/* In-page experiment driver (headless Chromium via bench/run.mjs). */
(function (global) {
  'use strict';
  const TB = global.TableBadness, BL = global.TBBaselines, MT = global.TBMetrics, MD = global.TBMarkdown, V1 = global.TableBadnessV1;
  const now = () => performance.now();

  function tableHTML(c) {
    if (c.html) return c.html.replace('<table', '<table class="tb-table"');
    return MD.toHTML(MD.parseTable(c.md));
  }
  function render(c, W, fontSize, host) {
    const stage = host || document.getElementById('stage');
    if (!host) stage.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'tb-wrap';
    wrap.style.width = W + 'px';
    wrap.style.setProperty('--tb-font-size', fontSize + 'px');
    wrap.lang = c.lang;
    wrap.dir = /^(ar|he|fa|ur)/.test(c.lang) ? 'rtl' : 'ltr';
    wrap.innerHTML = tableHTML(c);
    stage.appendChild(wrap);
    return { wrap, table: wrap.querySelector('table') };
  }

  const METHODS = ['css-auto', 'equal', 'proportional', 'min-height', 'tb-v1', 'tb2-fit', 'tb2', 'tb2-ls', 'tb2-noroles', 'tb2-norow', 'tb2-nofrag'];
  const isPlain = c => !c.html;

  function context(c, table, extra) {
    const o = Object.assign({ rowHeader: !!c.rowHeader }, extra || {});
    const M = TB.prepare(table, o);
    const path = TB.buildPath(M);
    return { c, table, M, path, o };
  }
  function variants(ctx) {
    if (ctx.vars) return ctx.vars;
    const { table, o } = ctx;
    const mk = x => { const M = TB.prepare(table, Object.assign({}, o, x)); return { M, path: TB.buildPath(M) }; };
    ctx.vars = { noroles: mk({ roles: false }), norow: mk({ rowWeight: 0 }), nofrag: mk({ fragCost: 0 }) };
    if (isPlain(ctx.c) && V1) { const P = V1.prepareTable(table, { scroll: false }); ctx.vars.v1 = { P, path: V1.buildPath(P) }; }
    return ctx.vars;
  }

  function layoutFor(method, ctx, W) {
    const { M, path } = ctx;
    switch (method) {
      case 'equal': return BL.equal(M, W);
      case 'proportional': return BL.proportional(M, W);
      case 'min-height': return BL.minHeight(M, W, [TB.layout(M, path, W, { scroll: false }).widths, BL.proportional(M, W).widths]);
      case 'tb2-fit': return TB.layout(M, path, W, { scroll: false });
      case 'tb2': return TB.layout(M, path, W);
      case 'tb2-ls': return BL.tbLocalSearch(M, W, [TB.layout(M, path, W, { scroll: false }).widths, BL.proportional(M, W).widths]);
      case 'tb2-noroles': { const v = variants(ctx).noroles; return TB.layout(v.M, v.path, W, { scroll: false }); }
      case 'tb2-norow': { const v = variants(ctx).norow; return TB.layout(v.M, v.path, W, { scroll: false }); }
      case 'tb2-nofrag': { const v = variants(ctx).nofrag; return TB.layout(v.M, v.path, W, { scroll: false }); }
      case 'tb-v1': { const v = variants(ctx).v1; return v ? V1.layoutAt(v.P, v.path, W) : null; }
    }
    return null;
  }

  function runCase(c, widths, fontSize, methods) {
    methods = methods || METHODS;
    TB.clearCache();
    const { wrap, table } = render(c, widths[0], fontSize);
    const t0 = now();
    const ctx = context(c, table);
    const prepMs = now() - t0;
    const out = { id: c.id, set: c.set, kind: c.kind || 'plain', tags: c.tags, adversarial: !!c.adversarial, fontSize, prepare: ctx.M.timing, pathMs: ctx.path.buildMs, prepAllMs: prepMs, results: [] };
    for (const W of widths) {
      wrap.style.width = W + 'px';
      for (const m of methods) {
        let L = null;
        if (m === 'css-auto') TB.clear(table);
        else { L = layoutFor(m, ctx, W); if (!L) { out.results.push({ W, method: m, na: true }); continue; } TB.apply(table, L); }
        const met = MT.measure(ctx.M, table, W, wrap);
        const r = { W, method: m, ms: L ? L.ms : null, scroll: met.overflowPx > 0.5, metrics: met };
        const ref = Array.from(table.rows).find(tr => tr.cells.length === ctx.M.nCols && Array.from(tr.cells).every(x => x.colSpan === 1));
        if (ref || (L && L.widths)) {
          const ws = L && L.widths && m !== 'tb-v1' ? L.widths : Array.from(ref.cells, (x, j) => x.getBoundingClientRect().width - ctx.M.colPad[j] - ctx.M.opts.safety + 0.25);
          const e = TB.evaluate(ctx.M, ws);
          r.cost = e.cost;
          let agree = 0; e.lines.forEach((l, i) => { if (l === met.cellLines[i]) agree++; });
          r.predAgree = agree / e.lines.length;
        }
        delete met.cellLines; delete met.rowPx;
        out.results.push(r);
      }
    }
    return out;
  }

  // Greedy path vs per-width optimum of the same objective (exhaustive where small, local search otherwise)
  function gap(c, widths, fontSize) {
    TB.clearCache();
    const { wrap, table } = render(c, widths[0], fontSize);
    const ctx = context(c, table);
    const rows = [];
    for (const W of widths) {
      wrap.style.width = W + 'px';
      const g = TB.layout(ctx.M, ctx.path, W, { scroll: false });
      if (g.overflow > 0.5) continue;
      const gc = TB.evaluate(ctx.M, g.widths).cost;
      const ex = BL.exhaustive(ctx.M, W, 4e5);
      const ls = BL.tbLocalSearch(ctx.M, W, [g.widths, BL.proportional(ctx.M, W).widths]);
      rows.push({ W, greedy: gc, ls: TB.evaluate(ctx.M, ls.widths).cost, exact: ex ? ex.value : null });
    }
    return { id: c.id, kind: c.kind || 'plain', rows };
  }

  function stability(c, fontSize, Wmin, Wmax, step, methods) {
    TB.clearCache();
    const { wrap, table } = render(c, Wmin, fontSize);
    const ctx = context(c, table);
    const res = {};
    for (const m of methods) {
      let prev = null, jitter = 0, reversals = 0, steps = 0, t = 0;
      for (let W = Wmin; W <= Wmax; W += step) {
        wrap.style.width = W + 'px';
        let ws;
        const a = now();
        if (m === 'css-auto') {
          TB.clear(table);
          const ref = Array.from(table.rows).find(tr => Array.from(tr.cells).every(x => x.colSpan === 1) && tr.cells.length === ctx.M.nCols);
          ws = ref ? Array.from(ref.cells, x => x.getBoundingClientRect().width) : null;
        } else { const L = layoutFor(m, ctx, W); ws = L ? L.colPx : null; }
        t += now() - a;
        if (!ws) break;
        if (prev) {
          const dT = Math.abs(ws.reduce((x, y) => x + y, 0) - prev.reduce((x, y) => x + y, 0));
          let mv = 0; ws.forEach((x, j) => { mv += Math.abs(x - prev[j]); if (x < prev[j] - 0.5) reversals++; });
          jitter += Math.max(0, mv - dT); steps++;
        }
        prev = ws;
      }
      if (steps) res[m] = { excessMovePx: jitter / steps, shrinksPerStep: reversals / steps, layoutMs: t / (steps + 1) };
    }
    return { id: c.id, kind: c.kind || 'plain', res };
  }

  // Performance on synthetic plain and spanning tables built from real rows
  function perf(rowsTarget, fontSize, withSpans) {
    TB.clearCache();
    const src = global.TB_CASES.filter(c => c.set === 'dev' && !c.html).map(c => MD.parseTable(c.md)).filter(t => t.header.length === 5);
    const rows = [];
    for (let k = 0; rows.length < rowsTarget; k++) { const t = src[k % src.length]; const r = t.rows[Math.floor(k / src.length) % t.rows.length]; rows.push(r.map((x, j) => (j === 0 ? x + ' ' + rows.length : x))); }
    const esc = s => MD.inline(s);
    let html = '<table><thead><tr>' + src[0].header.map(h => `<th>${esc(h)}</th>`).join('') + '</tr></thead><tbody>';
    rows.forEach((r, i) => {
      if (withSpans && i % 10 === 0 && i + 1 < rows.length) html += `<tr><th scope="rowgroup" rowspan="2">${esc(r[0])}</th><td colspan="2">${esc(r[1])} ${esc(r[2])}</td><td>${esc(r[3])}</td><td>${esc(r[4])}</td></tr>`;
      else if (withSpans && i % 10 === 1) html += `<tr>${r.slice(1).map(x => `<td>${esc(x)}</td>`).join('')}</tr>`;
      else html += `<tr>${r.map(x => `<td>${esc(x)}</td>`).join('')}</tr>`;
    });
    html += '</tbody></table>';
    const { wrap, table } = render({ html, lang: 'zh-CN' }, 720, fontSize);
    const t0 = now(); const M = TB.prepare(table); const t1 = now(); const path = TB.buildPath(M); const t2 = now();
    TB.prepare(table); const t3 = now();
    let q = 0; const Q = 2000; const a = now();
    for (let i = 0; i < Q; i++) q += TB.layout(M, path, 320 + (i * 7) % 900).tableWidth;
    const qus = (now() - a) / Q * 1000;
    let tApply = 0, tAuto = 0; const R = 20;
    for (let i = 0; i < R; i++) { wrap.style.width = (360 + i * 30) + 'px'; const b = now(); TB.apply(table, TB.layout(M, path, 360 + i * 30)); void table.offsetHeight; tApply += now() - b; }
    TB.clear(table);
    for (let i = 0; i < R; i++) { wrap.style.width = (360 + i * 30) + 'px'; const b = now(); void table.offsetHeight; tAuto += now() - b; }
    let steps = 0; for (const c of M.cells) steps += c.st.w.length;
    return { rows: rowsTarget, spans: !!withSpans, cells: M.cells.length, distinct: M.timing.distinctCells, steps, segments: path.segs.length,
      prepareMs: t1 - t0, measureMs: M.timing.measureMs, pathMs: t2 - t1, warmPrepareMs: t3 - t2, queryUs: qus,
      applyReflowMs: tApply / R, cssAutoReflowMs: tAuto / R, _: q > 0 };
  }

  // engine accuracy: predicted line count vs real layout of each distinct cell at random widths
  function accuracy(c, fontSize, samples, seed) {
    TB.clearCache();
    const { table } = render(c, 800, fontSize);
    const M = TB.prepare(table, { rowHeader: !!c.rowHeader });
    let s = seed || 1; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const host = document.createElement('div'); host.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;';
    const mt = document.createElement('table'); mt.className = table.className;
    mt.innerHTML = '<thead><tr><th></th></tr></thead><tbody><tr><td></td></tr></tbody>';
    host.appendChild(mt); table.parentNode.appendChild(host);
    const items = [], seen = new Set();
    for (const cell of M.cells) {
      if (seen.has(cell.key)) continue; seen.add(cell.key);
      const lo = Math.max(cell.m.maxGraph, 20), hi = cell.m.natural + 4;
      for (let k = 0; k < samples; k++) {
        const w = lo + (hi - lo) * rnd(), d = document.createElement('div');
        d.style.width = w + 'px'; d.innerHTML = cell.el.innerHTML;
        (cell.el.tagName === 'TH' ? mt.querySelector('th') : mt.querySelector('td')).appendChild(d);
        items.push({ d, w, cell });
      }
    }
    const range = document.createRange(); let agree = 0;
    for (const it of items) {
      const { nodes, text } = TBMeasure.collectText(it.d);
      const actual = Math.max(1, TBMeasure.lineStarts(nodes, TBMeasure.graphemes(text), range).length);
      if (actual === TBMeasure.layoutCell(it.cell.m, it.w).lines) agree++;
    }
    host.remove();
    return { id: c.id, tags: c.tags, n: items.length, agree: items.length ? agree / items.length : 1 };
  }

  global.TBX = { accuracy, render, runCase, gap, stability, perf, METHODS, context, layoutFor, tableHTML };
})(window);
