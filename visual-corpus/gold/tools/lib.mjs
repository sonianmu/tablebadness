// Shared pieces of the Gold pipeline: renderer lock, geometry summaries, prompts text, constraint enforcement.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const G = join(dirname(fileURLToPath(import.meta.url)), '..'), VC = join(G, '..');
export const safe = id => id.replace(/[^a-zA-Z0-9@._-]/g, '_');
export const readJ = p => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
export const writeJ = (p, x) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(x, null, 1)); };

// one Chromium page serves several concurrent design chains: serialize renders
export function locked(R) {
  let q = Promise.resolve();
  return { render: (spec, png) => (q = q.then(() => R.render(spec, png), () => R.render(spec, png))), close: () => R.close() };
}

// seeded shuffle (reproducible anonymisation)
export function shuffle(xs, seedStr) {
  let seed = [...seedStr].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 2147483647, 7) || 1;
  const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---- measured geometry facts ----
export function breakStats(g) {
  let intra = 0, wordB = 0;
  const li = g.lineInfo || [];
  li.forEach(ls => ls.forEach(l => { if (l.brk === 'intra-word') intra++; else if (l.brk === 'word-boundary') wordB++; }));
  return { intraWord: intra, wordBoundary: wordB };
}
export const lineSig = g => (g.lineInfo || []).map(ls => ls.map(l => l.text).join('│')).join('␞');
export const lineCounts = g => g.cells.map(c => c.lines).join(',');

export function geomText(name, g, policy, W) {
  const hdr = g.cells.filter(c => c.role === 'col'), wrappedHdr = hdr.filter(c => c.lines > 1).length;
  const maxL = g.cells.reduce((m, c) => Math.max(m, c.lines), 0), b = breakStats(g);
  const scroll = g.overflow > 0.5;
  return `${name}: column widths [${g.colWidths.join(', ')}] px · table ${Math.round(g.tableWidth)}×${Math.round(g.tableHeight)} px · row heights [${g.rowHeights.map(Math.round).join(', ')}] · column headers on >1 line: ${wrappedHdr}/${hdr.length} · tallest cell ${maxL} lines · measured breaks inside a word: ${b.intraWord}${scroll ? ` · WIDER than the viewport by ${Math.round(g.overflow)} px (horizontal scrolling)` : ` · fits the ${W ? W + ' px ' : ''}viewport (no scrolling)`}${g.clipped || g.cellOverflow ? ' · CONTENT OVERFLOWS A CELL' : ''}`;
}

export function describe(s, t, g) {
  const head = g.cells.filter(c => c.role === 'col');
  const cols = g.facts.map((f, j) => {
    const hdr = head.filter(c => j >= c.c && j < c.c + c.cs).sort((a, b) => a.r - b.r).map(c => c.text).join(' › ');
    return `  col ${j + 1}: header "${hdr || '(none)'}" · longest unbreakable unit ${f.minContent}px · widest one-line content ${f.natural}px`;
  }).join('\n');
  const rtl = /^(ar|he|fa)/.test(t.lang);
  const rowHdr = g.cells.some(c => c.role === 'row') ? 'Row headers: yes.' : 'Row headers: none declared.';
  const spans = g.cells.filter(c => c.cs > 1 || c.rs > 1).map(c => `"${c.text.slice(0, 24)}" spans ${c.cs} col × ${c.rs} row`).slice(0, 14).join('; ');
  const budget = s.W - g.tableExtra;
  return `Table: ${t.title} (language ${t.lang}${rtl ? ', right-to-left: column 1 is on the RIGHT' : ''}).
Grid: ${g.nCols} columns × ${g.nRows} rows. ${rowHdr}${spans ? '\nMerged cells: ' + spans + '.' : ''}
Measured content facts (text px at ${s.fs}px font, padding excluded):
${cols}
Each column adds 21px of padding+border to its text width.
Viewport: ${s.W}px wide (dashed pink box in the renders). ${s.policy === 'fit'
    ? `The table, including its 1px outer border, must be at most ${s.W}px wide (column widths sum to at most ${budget}px); no horizontal scrolling. A table exactly ${s.W}px wide fits.`
    : `At ${s.W}px some words cannot fit unsplit. Horizontal scrolling is ALLOWED: the table may be wider than ${s.W}px (column widths summing to more than ${budget}px) (the reader scrolls), or you may fit within ${budget}px and accept the consequences. Fitting and scrolling layouts are judged as two separate classes; propose good layouts of BOTH kinds.
Rendering convention: a full render shows the WHOLE table; anything right of the dashed box is not clipped — it is reached by scrolling. Where a layout scrolls, an extra "viewport view" image shows only what is visible at first sight.`}
Fixed: content, font, ${s.fs}px font size, padding, borders, colours, alignment. Only the column widths are designed; row heights follow from them.`;
}

export const QUALITY = `Judge a table layout on all of these levels, in this order of necessity but as one whole:
1. correctness — every character visible, structure intact, nothing clipped or overlapping;
2. readability — natural line breaks, words/numbers/identifiers/semantic units kept whole, continuous reading;
3. function — easy to look up, compare, locate and understand the information for this table's real reading tasks;
4. visual order — alignment, grouping, hierarchy, consistent scale for elements with the same role;
5. visual rhythm — proportion, density changes, distribution of white space, spatial relationships;
6. overall aesthetics — balance, restraint, naturalness, harmony.
Do not assume that equal widths, symmetry, minimum height, the fewest lines, the golden ratio or any fixed proportion is good in itself; decide from this table's function, content and reading task, and look for counter-examples to your own rules.`;

export const PERSONA = `You are a senior information designer and editorial typographer who sets data tables for high-quality publications (statistical yearbooks, reference works, financial reports, technical documentation) in many writing systems, including Chinese. You judge by looking at the real rendered result.`;

// hard constraints (code, not model): column count, minimum width, fit budget
export function normalize(widths, s, g) {
  const n = g.nCols, notes = [];
  let w = (Array.isArray(widths) ? widths : []).slice(0, n).map(x => Math.round(+x || 0));
  if (w.length !== n) { notes.push(`expected ${n} widths`); while (w.length < n) w.push(60); }
  const minCol = 21 + Math.ceil(s.fs * 1.1);
  w = w.map(x => { if (x < minCol) { notes.push(`raised a column to the minimum ${minCol}px`); return minCol; } return x; });
  const budget = s.W - g.tableExtra, sum = w.reduce((a, b) => a + b, 0);
  if (s.policy === 'fit' && sum > budget) {
    const f = budget / sum; w = w.map(x => Math.floor(x * f)); notes.push(`scaled down from ${sum}px to fit ${budget}px`);
  }
  return { widths: w, notes };
}

export const GRADE = { excellent: 5, good: 4, acceptable: 3, poor: 2, bad: 1 };
export const DIMS = ['correctness', 'readability', 'function', 'order', 'rhythm', 'aesthetics'];
export const median = xs => { const a = xs.filter(x => x != null).sort((p, q) => p - q); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null; };
export const mean = xs => { const a = xs.filter(x => x != null); return a.length ? +(a.reduce((p, q) => p + q, 0) / a.length).toFixed(2) : null; };
