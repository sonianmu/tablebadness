/* Objective metrics measured from the REAL rendered table (not from the engine's predictions). */
(function (global) {
  'use strict';
  const TB = global.TableBadness;

  const SHORT_EM = 8;   // "short value": single-line natural width <= 8em
  const LONG_EM = 20;   // "long text":  single-line natural width  > 20em
  const SEVERE_EM = 6;  // long text whose mean line measure < 6em counts as severely fragmented

  function upperBound(arr, x) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= x) lo = m + 1; else hi = m; } return lo; }

  // breaks of one rendered cell, classified with the prepared unit structure
  function cellBreaks(td, cell, range) {
    const { nodes, text } = TB.collectText(td);
    const gs = TB.graphemes(text);
    const starts = TB.lineStarts(nodes, gs, range);
    let natural = 0, token = 0, emergency = 0, forced = 0;
    for (let i = 1; i < starts.length; i++) {
      const off = gs[starts[i]][0];
      const u = upperBound(cell.unitStart, off) - 1;
      if (u >= 0 && cell.unitStart[u] === off) {
        const k = cell.K[u];
        if (k === 0) natural++; else if (k === 1) token++; else forced++;
      } else emergency++;
    }
    return { lines: Math.max(1, starts.length), natural, token, emergency, forced };
  }

  function measure(P, W, wrap) {
    const table = P.table;
    const range = document.createRange();
    const rect = table.getBoundingClientRect();
    const fs = P.fontSize;
    const m = {
      heightPx: rect.height, tableWidthPx: rect.width,
      overflowPx: Math.max(0, Math.round((wrap ? wrap.scrollWidth - wrap.clientWidth : rect.width - W) * 10) / 10),
      bodyCells: 0, shortCells: 0, shortIntact: 0, tokenBreaks: 0, emergencyBreaks: 0,
      longCells: 0, measureEmSum: 0, severeFrag: 0, totalLines: 0, maxLines: 0, headerLines: 0,
      colWidths: [], cellLines: [],
    };
    const ref = Array.from(table.rows).find(r => r.cells.length === P.nCols);
    if (ref) for (const c of ref.cells) m.colWidths.push(c.getBoundingClientRect().width);
    Array.from(table.rows).forEach((row, r) => {
      const rowLines = [];
      for (let c = 0; c < row.cells.length; c++) {
        const td = row.cells[c];
        const cell = TB._cache.get(P.grid[r][c]);
        const b = cellBreaks(td, cell, range);
        rowLines.push(b.lines);
        if (td.tagName === 'TH') { m.headerLines += b.lines; continue; }
        m.bodyCells++;
        m.totalLines += b.lines;
        m.maxLines = Math.max(m.maxLines, b.lines);
        m.tokenBreaks += b.token; m.emergencyBreaks += b.emergency;
        const natEm = cell.natural / fs;
        if (natEm <= SHORT_EM && cell.text.trim()) { m.shortCells++; if (b.lines - b.forced === 1) m.shortIntact++; }
        if (natEm > LONG_EM) {
          m.longCells++;
          const meas = natEm / (b.lines - b.forced);
          m.measureEmSum += meas;
          if (meas < SEVERE_EM) m.severeFrag++;
        }
      }
      m.cellLines.push(rowLines);
    });
    m.shortIntactRate = m.shortCells ? m.shortIntact / m.shortCells : null;
    m.atomicBreaks = m.tokenBreaks + m.emergencyBreaks;
    m.meanMeasureEm = m.longCells ? m.measureEmSum / m.longCells : null;
    m.severeFragRate = m.longCells ? m.severeFrag / m.longCells : null;
    return m;
  }

  global.TBMetrics = { measure, cellBreaks, SHORT_EM, LONG_EM, SEVERE_EM };
})(typeof window !== 'undefined' ? window : globalThis);
