/* Minimal GFM table parser + inline renderer (code spans, bold, italic, links, <br>). */
(function (global) {
  'use strict';

  function splitRow(line) {
    let s = line.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
    const cells = [];
    let cur = '', inCode = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
      if (ch === '`') {
        let n = 1; while (s[i + n] === '`') n++;
        if (!inCode) inCode = n; else if (inCode === n) inCode = 0;
        cur += s.substr(i, n); i += n - 1; continue;
      }
      if (ch === '|' && !inCode) { cells.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  }

  const isDelim = line => /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(line);

  function parseTable(md) {
    const lines = md.replace(/\r\n?/g, '\n').split('\n');
    for (let i = 0; i + 1 < lines.length; i++) {
      if (lines[i].includes('|') && isDelim(lines[i + 1])) {
        const header = splitRow(lines[i]);
        const align = splitRow(lines[i + 1]).map(d => {
          const l = d.startsWith(':'), r = d.endsWith(':');
          return l && r ? 'center' : r ? 'right' : l ? 'left' : '';
        });
        const rows = [];
        for (let j = i + 2; j < lines.length; j++) {
          const ln = lines[j];
          if (!ln.trim() || !ln.includes('|')) break;
          const cells = splitRow(ln);
          while (cells.length < header.length) cells.push('');
          rows.push(cells.slice(0, header.length));
        }
        return { header, align, rows };
      }
    }
    return null;
  }

  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function inline(src) {
    // split out code spans first
    const parts = [];
    let i = 0;
    while (i < src.length) {
      const m = src.slice(i).match(/(`+)([\s\S]*?[^`])\1(?!`)/);
      if (!m) { parts.push({ t: src.slice(i) }); break; }
      if (m.index > 0) parts.push({ t: src.slice(i, i + m.index) });
      parts.push({ code: m[2].trim() });
      i += m.index + m[0].length;
    }
    return parts.map(p => {
      if (p.code !== undefined) return '<code>' + esc(p.code) + '</code>';
      let h = esc(p.t);
      h = h.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
      h = h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`);
      h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      h = h.replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, '$1<em>$2</em>');
      return h;
    }).join('');
  }

  function toHTML(t, cls) {
    const al = i => (t.align[i] ? ` style="text-align:${t.align[i]}"` : '');
    let h = `<table class="${cls || 'tb-table'}"><thead><tr>`;
    t.header.forEach((c, i) => { h += `<th${al(i)}>${inline(c)}</th>`; });
    h += '</tr></thead><tbody>';
    for (const r of t.rows) {
      h += '<tr>';
      r.forEach((c, i) => { h += `<td${al(i)}>${inline(c)}</td>`; });
      h += '</tr>';
    }
    return h + '</tbody></table>';
  }

  global.TBMarkdown = { parseTable, inline, toHTML, splitRow };
})(typeof window !== 'undefined' ? window : globalThis);
