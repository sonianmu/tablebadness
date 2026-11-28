/* In-page rendering + geometry for the visual corpus. Uses the project's measurement layer only
 * (no layout algorithm decides anything here). */
(function () {
  const MD = window.TBMarkdown, TB = window.TableBadness, MT = window.TBMetrics, MS = window.TBMeasure;
  function tableHTML(src) {
    if (src.html) return src.html.replace('<table', '<table class="tb-table"');
    return MD.toHTML(MD.parseTable(src.md));
  }
  // spec: {src, W, fs, widths (border-box col px) | null, label}
  window.VC = {
    render(spec) {
      const frame = document.getElementById('frame');
      frame.innerHTML = '';
      if (spec.label) { const l = document.createElement('div'); l.textContent = spec.label; l.style.cssText = 'font:600 15px system-ui;margin-bottom:6px'; frame.appendChild(l); }
      const wrap = document.createElement('div');
      wrap.className = 'tb-wrap' + (spec.ruler === false ? '' : ' ruler');
      wrap.style.width = spec.W + 'px';
      wrap.style.overflow = 'visible';
      wrap.style.setProperty('--tb-font-size', spec.fs + 'px');
      wrap.lang = spec.src.lang; wrap.dir = spec.src.dir || (/^(ar|he|fa|ur)/.test(spec.src.lang) ? 'rtl' : 'ltr');
      wrap.innerHTML = tableHTML(spec.src);
      frame.appendChild(wrap);
      const table = wrap.querySelector('table');
      if (spec.widths) {
        const cg = document.createElement('colgroup');
        cg.innerHTML = spec.widths.map(w => `<col style="width:${w}px">`).join('');
        table.insertBefore(cg, table.firstChild);
        const tcs = getComputedStyle(table);
        const extra = parseFloat(tcs.borderLeftWidth) + parseFloat(tcs.borderRightWidth);
        table.style.tableLayout = 'fixed';
        table.style.width = (spec.widths.reduce((a, b) => a + b, 0) + extra) + 'px';
        table.style.maxWidth = 'none';
      } else if (spec.natural) {
        table.querySelectorAll('th,td').forEach(c => { c.style.whiteSpace = 'nowrap'; });
      }
      const geom = this.geometry(spec, wrap, table);
      // the frame must contain the whole table: an overflowing table does not widen the inline-block frame,
      // and the element screenshot would otherwise be cut at the viewport edge
      frame.style.minWidth = Math.ceil(Math.max(spec.W, geom.tableWidth) + 2) + 'px';
      return geom;
    },
    geometry(spec, wrap, table) {
      TB.clearCache();
      const M = TB.prepare(table, { rowHeader: !!spec.src.rowHeader });
      const met = MT.measure(M, table, spec.W, null);
      const els = []; for (const tr of table.rows) for (const td of tr.cells) els.push(td);
      const colW = new Array(M.nCols).fill(null);
      M.cells.forEach((c, i) => { if (c.cs === 1 && colW[c.c] == null) colW[c.c] = +els[i].getBoundingClientRect().width.toFixed(1); });
      const tr = table.getBoundingClientRect();
      // per-column facts a designer would know: widest unbreakable unit and one-line width (content px, excl. padding)
      const facts = Array.from({ length: M.nCols }, (_, j) => {
        let minC = 0, nat = 0;
        for (const i of M.colSingle[j]) { minC = Math.max(minC, M.cells[i].m.minContent); nat = Math.max(nat, M.cells[i].m.natural); }
        return { minContent: Math.ceil(minC), natural: Math.ceil(nat), padding: M.colPad[j] };
      });
      return {
        nCols: M.nCols, nRows: M.rows, tableWidth: +tr.width.toFixed(1), tableHeight: +tr.height.toFixed(1),
        overflow: +Math.max(0, tr.width - spec.W).toFixed(1), colWidths: colW, rowHeights: met.rowPx,
        cells: M.cells.map((c, i) => ({ r: c.r, c: c.c, rs: c.rs, cs: c.cs, role: c.role, text: c.m.text.slice(0, 60), lines: met.cellLines[i] })),
        clipped: met.clipped, emergencyBreaks: met.emergencyBreaks, tokenBreaks: met.tokenBreaks,
        tableExtra: M.tableExtra, facts, frameW: Math.ceil(Math.max(spec.W, tr.width) + 34),
        lineInfo: spec.lines ? els.map(td => this.cellLines(td, spec.src.lang)) : undefined,
        cellOverflow: els.filter(td => td.scrollWidth > td.clientWidth + 1).length,
        tableLeft: +(tr.left - wrap.getBoundingClientRect().left).toFixed(1),
      };
    },
    // Real line boxes of one cell: text, x-extent and break kind at each line start (measured, not predicted).
    cellLines(td, lang) {
      const G = new Intl.Segmenter(lang, { granularity: 'grapheme' }), Wd = new Intl.Segmenter(lang, { granularity: 'word' });
      const cr = td.getBoundingClientRect(), lines = [];
      let full = '';
      const walker = document.createTreeWalker(td, NodeFilter.SHOW_TEXT);
      const rng = document.createRange();
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        for (const g of G.segment(n.data)) {
          rng.setStart(n, g.index); rng.setEnd(n, g.index + g.segment.length);
          const rs = rng.getClientRects(); const at = full.length; full += g.segment;
          if (!rs.length || /^\s+$/.test(g.segment)) { if (lines.length) lines[lines.length - 1].text += g.segment; continue; }
          const r = rs[0], L = lines[lines.length - 1];
          if (!L || Math.abs(r.top - L.top) > r.height * 0.5) lines.push({ top: r.top, start: at, text: g.segment, l: r.left, r: r.right });
          else { L.text += g.segment; L.l = Math.min(L.l, r.left); L.r = Math.max(L.r, r.right); }
        }
      }
      const bounds = new Set([0, full.length]);
      for (const w of Wd.segment(full)) { bounds.add(w.index); bounds.add(w.index + w.segment.length); }
      return lines.map((L, i) => ({
        text: L.text.trim(), w: +(L.r - L.l).toFixed(1), x: +(L.l - cr.left).toFixed(1),
        brk: i === 0 ? null : /\s/.test(full[L.start - 1] || ' ') || /\n/.test(full.slice(lines[i - 1].start, L.start)) ? 'natural' : bounds.has(L.start) ? 'word-boundary' : 'intra-word',
      }));
    },
  };
})();
