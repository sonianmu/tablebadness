/* Objective metrics measured from the REAL rendered table, using the v2 grid model only for structure
 * (cell roles, spans, unit boundaries). Independent of which algorithm chose the widths. */
(function (global) {
  'use strict';
  const MS = global.TBMeasure;
  const SHORT_EM = 8, LONG_EM = 20, SEVERE_EM = 6;

  function upperBound(arr, x) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= x) lo = m + 1; else hi = m; } return lo; }

  function cellBreaks(el, cell, range) {
    const { nodes, text } = MS.collectText(el);
    const gs = MS.graphemes(text);
    const starts = MS.lineStarts(nodes, gs, range);
    let natural = 0, token = 0, emergency = 0, forced = 0, soft = 0;
    for (let i = 1; i < starts.length; i++) {
      const off = gs[starts[i]][0];
      const u = upperBound(cell.unitStart, off) - 1;
      if (u >= 0 && cell.unitStart[u] === off) { const k = cell.K[u]; if (k === 0) natural++; else if (k === 1) token++; else if (k === 3) soft++; else forced++; }
      else emergency++;
    }
    return { lines: Math.max(1, starts.length), natural, token, emergency, forced, soft };
  }

  // M: model of a table with the same structure as `table` (cells in DOM order)
  function measure(M, table, W, wrap) {
    const range = document.createRange();
    const rect = table.getBoundingClientRect();
    const fs = M.fontSize;
    const els = []; for (const tr of table.rows) for (const td of tr.cells) els.push(td);
    const out = {
      heightPx: rect.height, tableWidthPx: rect.width,
      overflowPx: Math.max(0, Math.round((wrap ? wrap.scrollWidth - wrap.clientWidth : rect.width - W) * 10) / 10),
      dataCells: 0, shortCells: 0, shortIntact: 0, tokenBreaks: 0, emergencyBreaks: 0, longCells: 0, measureEmSum: 0, severeFrag: 0,
      totalLines: 0, maxLines: 0,
      colHeaders: 0, colHeaderSingle: 0, groupHeaders: 0, groupHeaderSingle: 0, headerHeightPx: 0,
      rowHeaders: 0, rowHeaderClean: 0, rowHeaderWrapped: 0, rowHeaderExtraPx: 0,
      spanCells: 0, clipped: 0, boundaryErrors: 0, termBreaks: 0,
      cellLines: [],
    };
    const n = M.cells.length;
    const lines = new Int32Array(n), contentH = new Float64Array(n), boxes = [];
    for (let i = 0; i < n; i++) {
      const c = M.cells[i], el = els[i], b = cellBreaks(el, c.m, range);
      lines[i] = b.lines; contentH[i] = b.lines * c.lh + c.padV;
      out.cellLines.push(b.lines);
      boxes.push(el.getBoundingClientRect());
      if (c.m.words <= 4) out.termBreaks += b.soft + b.token + b.emergency; // a short term split anywhere
      if (c.role === 'col') {
        out.colHeaders++; if (b.lines - b.forced === 1) out.colHeaderSingle++;
        if (c.cs > 1) { out.groupHeaders++; if (b.lines - b.forced === 1) out.groupHeaderSingle++; }
      } else if (c.role === 'row') {
        out.rowHeaders++; if (!b.token && !b.emergency) out.rowHeaderClean++; if (b.lines - b.forced > 1) out.rowHeaderWrapped++;
      } else {
        out.dataCells++; out.totalLines += b.lines; out.maxLines = Math.max(out.maxLines, b.lines);
        out.tokenBreaks += b.token; out.emergencyBreaks += b.emergency;
        const natEm = c.m.natural / fs;
        if (natEm <= SHORT_EM && c.m.text.trim()) { out.shortCells++; if (b.lines - b.forced === 1) out.shortIntact++; }
        if (natEm > LONG_EM) { out.longCells++; const meas = natEm / (b.lines - b.forced); out.measureEmSum += meas; if (meas < SEVERE_EM) out.severeFrag++; }
      }
      if (c.cs > 1 || c.rs > 1) {
        out.spanCells++;
        if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) out.clipped++;
      }
    }
    // extra height caused by single-row row headers: how much taller than the rest of its row it is
    for (let i = 0; i < n; i++) {
      const c = M.cells[i];
      if (c.role !== 'row' || c.rs !== 1) continue;
      let other = 0;
      for (let k = 0; k < n; k++) { const d = M.cells[k]; if (k !== i && d.r === c.r && d.rs === 1 && contentH[k] > other) other = contentH[k]; }
      out.rowHeaderExtraPx += Math.max(0, contentH[i] - other);
    }
    // grid boundary consistency (direction-agnostic): a spanning cell must cover exactly the horizontal
    // extent of the single-column cells of the columns it spans
    const ext = new Array(M.nCols).fill(null);
    M.cells.forEach((c, i) => { if (c.cs === 1 && !ext[c.c]) ext[c.c] = [boxes[i].left, boxes[i].right]; });
    M.cells.forEach((c, i) => {
      if (c.cs === 1) return;
      let lo = Infinity, hi = -Infinity, known = true;
      for (let j = c.c; j < c.c + c.cs; j++) { if (!ext[j]) { known = false; break; } lo = Math.min(lo, ext[j][0]); hi = Math.max(hi, ext[j][1]); }
      if (known && (Math.abs(boxes[i].left - lo) > 1.5 || Math.abs(boxes[i].right - hi) > 1.5)) out.boundaryErrors++;
    });
    // rows
    const trs = Array.from(table.rows);
    out.rowPx = trs.map(tr => Math.round(tr.getBoundingClientRect().height * 10) / 10);
    out.headerHeightPx = trs.reduce((s, tr) => s + (tr.parentNode.tagName === 'THEAD' ? tr.getBoundingClientRect().height : 0), 0);
    const body = out.rowPx.filter((_, r) => trs[r].parentNode.tagName !== 'THEAD').slice().sort((a, b) => a - b);
    const q = p => (body.length ? body[Math.min(body.length - 1, Math.floor(p * (body.length - 1) + 0.5))] : 0);
    out.rowMedianPx = q(0.5); out.rowP90Px = q(0.9); out.rowMaxPx = body.length ? body[body.length - 1] : 0;
    out.visibleRows600 = trs.filter(tr => tr.getBoundingClientRect().bottom - rect.top <= 600).length;
    // unused cell area (diagnostic): box minus content, area-weighted over body cells
    let un = 0, ar = 0;
    M.cells.forEach((c, i) => {
      if (trs[c.r].parentNode.tagName === 'THEAD') return;
      const bh = boxes[i].height, bw = boxes[i].width;
      un += Math.max(0, bh - contentH[i]) * bw; ar += bh * bw;
    });
    out.unusedFrac = ar ? un / ar : 0;
    out.shortIntactRate = out.shortCells ? out.shortIntact / out.shortCells : null;
    out.atomicBreaks = out.tokenBreaks + out.emergencyBreaks;
    out.meanMeasureEm = out.longCells ? out.measureEmSum / out.longCells : null;
    return out;
  }

  global.TBMetrics = { measure, cellBreaks, SHORT_EM, LONG_EM, SEVERE_EM };
})(typeof window !== 'undefined' ? window : globalThis);
