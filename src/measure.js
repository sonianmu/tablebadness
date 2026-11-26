/*
 * TBMeasure: browser-native text measurement shared by every layout engine.
 *   A (width:0, overflow-wrap:normal)  -> every soft-wrap opportunity becomes a line start
 *   B (nowrap)                         -> in-context widths of every unbreakable unit
 * plus the arithmetic greedy line layout and shrink-wrap descent (exact staircase of distinct layouts).
 */
(function (global) {
  'use strict';
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

  // word boundaries from the browser's own segmenter (ICU dictionaries for CJK, Thai, ...)
  const wordSegs = new Map();
  function wordInfo(text, lang) {
    if (!wordSegs.has(lang)) { let sg; try { sg = new Intl.Segmenter(lang || undefined, { granularity: 'word' }); } catch (e) { sg = new Intl.Segmenter(undefined, { granularity: 'word' }); } wordSegs.set(lang, sg); }
    const bounds = new Set([0, text.length]); let words = 0;
    for (const s of wordSegs.get(lang).segment(text)) { bounds.add(s.index); bounds.add(s.index + s.segment.length); if (s.isWordLike) words++; }
    return { bounds, words };
  }

  // Break kinds K: 0 natural, 1 intra-token (non-CJK token such as F-|12), 2 forced (<br>),
  // 3 intra-word inside a scriptio-continua word (毛利|率): costly only when the cell is a short term.
  function analyseCell(divA, divB, range, emergencyMinPx, lang) {
    const A = collectText(divA), B = collectText(divB);
    const text = A.text;
    const wi = wordInfo(text, lang);
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
          K[u] = (RE_CONT.test(prevG) || RE_CONT.test(curG)) ? (wi.bounds.has(a) ? 0 : 3) : 1;
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
    const cell = { text, n, C, ADV, K, unitStart, prefixes, natural: 0, minContent, maxGraph, graphemeCount: gs.length, words: wi.words };
    cell.natural = layoutCell(cell, 1e9).tight;
    return cell;
  }

  // ---------------------------------------------------------------------------
  // arithmetic layout (greedy, mirrors CSS white-space:normal + overflow-wrap:break-word)
  // ---------------------------------------------------------------------------
  function layoutCell(cell, w) {
    const { n, C, ADV, K, prefixes } = cell;
    let lines = 1, tok = 0, em = 0, soft = 0, x = 0, lineW = 0, tight = 0, empty = true, overflow = false;
    for (let k = 0; k < n; k++) {
      const c = C[k];
      if (!empty) {
        if (K[k] !== 2 && x + c <= w + EPS) { lineW = x + c; x += ADV[k]; continue; }
        if (lineW > tight) tight = lineW;
        lines++; if (K[k] === 1) tok++; else if (K[k] === 3) soft++; x = 0; lineW = 0; empty = true;
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
    return { lines, tok, em, soft, tight, overflow };
  }

  // Shrink-wrap descent: every distinct layout from natural width down to wMin.
  // Returns ascending arrays: widths[i] (tight width of layout i), lines/tok/em.
  function staircase(cell, wMin) {
    const W = [], L = [], T = [], M = [], S = [];
    let w = cell.natural + 1, prevTight = Infinity;
    for (let guard = 0; guard < 100000; guard++) {
      const r = layoutCell(cell, w);
      if (r.tight >= prevTight - 1e-9) break;
      W.push(r.tight); L.push(r.lines); T.push(r.tok); M.push(r.em); S.push(r.soft);
      prevTight = r.tight;
      const next = r.tight - 0.02;
      if (next < wMin) break;
      w = next;
    }
    W.reverse(); L.reverse(); T.reverse(); M.reverse(); S.reverse();
    return { w: Float64Array.from(W), lines: Int32Array.from(L), tok: Int32Array.from(T), em: Int32Array.from(M), soft: Int32Array.from(S) };
  }

  // index of the layout in effect at width w (largest step width <= w); -1 if below all
  function stepAt(st, w) {
    const a = st.w;
    let lo = 0, hi = a.length - 1, ans = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (a[mid] <= w + EPS) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return ans;
  }


  // Measure many cells in one batch (two reflows). items: [{key, html, header}] ; host context = table's class & lang.
  function measureCells(table, items, emergencyMinPx) {
    if (!items.length) return 0;
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
    const els = [];
    for (const it of items) {
      const parent = it.header ? thHost : tdHost;
      const a = document.createElement('div');
      a.style.cssText = 'width:0;white-space:normal;overflow-wrap:normal;word-wrap:normal;';
      a.innerHTML = it.html;
      const b = document.createElement('div');
      b.style.cssText = 'width:max-content;white-space:nowrap;';
      b.innerHTML = it.html;
      parent.appendChild(a); parent.appendChild(b);
      els.push([it.key, a, b]);
    }
    const range = document.createRange();
    const langEl = table.closest('[lang]'), lang = langEl ? langEl.getAttribute('lang') : '';
    for (const [key, a, b] of els) cellCache.set(key, analyseCell(a, b, range, emergencyMinPx, lang));
    host.remove();
    return els.length;
  }

  global.TBMeasure = {
    EPS, RE_CONT, collectText, widthOf, graphemes, lineStarts, fontSignature, cellCache, analyseCell,
    layoutCell, staircase, stepAt, measureCells, now,
  };
})(typeof window !== 'undefined' ? window : globalThis);
