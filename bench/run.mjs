// Experiment runner: node bench/run.mjs <test|accuracy|experiment|gap|stability|perf|all>
import { launch } from './browser.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'results');
mkdirSync(outDir, { recursive: true });
const mode = process.argv[2] || 'all';
const WIDTHS = [320, 400, 480, 600, 760, 960];
const FONTS = [14, 16];

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', e => console.error('PAGE ERROR', e.message));
await page.goto(pathToFileURL(join(root, 'bench/harness.html')).href);
const cases = await page.evaluate(() => TB_CASES.map(c => ({ id: c.id, set: c.set, kind: c.kind || 'plain', tags: c.tags, adversarial: !!c.adversarial })));
const save = (name, data) => writeFileSync(join(outDir, name), JSON.stringify(data, null, 1));
const pct = x => (x == null || isNaN(x) ? '   — ' : (100 * x).toFixed(1).padStart(5) + '%');
const num = (x, d = 1) => (x == null || isNaN(x) ? '—' : x.toFixed(d));

async function accuracy() {
  const res = [];
  for (const c of cases) for (const fs of FONTS) res.push(await page.evaluate(([id, fs]) => TBX.accuracy(TB_CASES.find(c => c.id === id), fs, 10, 7), [c.id, fs]));
  save('accuracy.json', res);
  const N = res.reduce((s, r) => s + r.n, 0), A = res.reduce((s, r) => s + r.agree * r.n, 0);
  console.log(`\nEngine line-count prediction vs Chromium layout (random widths): ${pct(A / N)} of ${N} samples`);
  for (const r of res) if (r.agree < 0.985) console.log('  lower:', r.id, pct(r.agree));
}

const GROUPS = {
  'plain-dev': c => c.kind === 'plain' && c.set === 'dev',
  'plain-val': c => c.kind === 'plain' && c.set === 'val',
  'struct-dev': c => c.kind === 'struct' && c.set === 'dev',
  'struct-val': c => c.kind === 'struct' && c.set === 'val',
  'adversarial': c => c.adversarial,
  'val2 (fresh held-out)': c => c.set === 'val2',
};

function aggregate(all, filter, Wfilter) {
  const rows = {};
  for (const cr of all) {
    if (!filter(cr)) continue;
    for (const r of cr.results) {
      if (r.na || (Wfilter && !Wfilter(r.W))) continue;
      const m = r.metrics, a = (rows[r.method] ||= { n: 0, short: 0, shortN: 0, atomic: 0, frag: 0, longN: 0, hRel: 0, scroll: 0, col1: 0, colN: 0, hdrRel: 0, hdrN: 0, rhW: 0, rhN: 0, rhX: 0, grp1: 0, grpN: 0, clip: 0, bnd: 0, p90: 0, max: 0, ms: 0, msN: 0, pred: 0, predN: 0, cost: 0 });
      const css = cr.results.find(x => x.W === r.W && x.method === 'css-auto').metrics;
      a.n++;
      a.short += m.shortIntact; a.shortN += m.shortCells; a.atomic += m.atomicBreaks;
      a.frag += m.severeFrag; a.longN += m.longCells;
      a.hRel += m.heightPx / css.heightPx; a.scroll += m.overflowPx > 0.5 ? 1 : 0;
      a.col1 += m.colHeaderSingle; a.colN += m.colHeaders;
      if (css.headerHeightPx > 0) { a.hdrRel += m.headerHeightPx / css.headerHeightPx; a.hdrN++; }
      a.rhW += m.rowHeaderWrapped; a.rhN += m.rowHeaders; a.rhX += m.rowHeaderExtraPx;
      a.grp1 += m.groupHeaderSingle; a.grpN += m.groupHeaders;
      a.clip += m.clipped; a.bnd += m.boundaryErrors;
      a.p90 += m.rowP90Px / Math.max(1, css.rowP90Px); a.max += m.rowMaxPx / Math.max(1, css.rowMaxPx);
      if (r.ms != null) { a.ms += r.ms; a.msN++; }
      if (r.predAgree != null && r.method.startsWith('tb2')) { a.pred += r.predAgree; a.predN++; }
      if (r.cost != null) a.cost += r.cost;
    }
  }
  return rows;
}
function printGroup(title, rows) {
  console.log(`\n${title}`);
  console.log('method        short1line atomic/tbl sevFrag  h/css  scroll  colHdr1 hdrH/css rowHdrWrap rowHdrExtra/tbl grpHdr1 p90/css max/css clip bnd  ms/layout pred');
  for (const [k, a] of Object.entries(rows)) {
    console.log(`${k.padEnd(13)} ${pct(a.short / a.shortN).padStart(9)} ${num(a.atomic / a.n, 2).padStart(10)} ${pct(a.frag / a.longN).padStart(7)} ${num(a.hRel / a.n, 3).padStart(6)} ${pct(a.scroll / a.n).padStart(7)} ${pct(a.col1 / a.colN).padStart(8)} ${num(a.hdrRel / a.hdrN, 3).padStart(8)} ${pct(a.rhW / a.rhN).padStart(10)} ${num(a.rhX / a.n, 1).padStart(15)}px ${pct(a.grp1 / a.grpN).padStart(7)} ${num(a.p90 / a.n, 3).padStart(7)} ${num(a.max / a.n, 3).padStart(7)} ${String(a.clip).padStart(4)} ${String(a.bnd).padStart(3)} ${a.msN ? num(a.ms / a.msN, 3).padStart(9) : '        —'} ${a.predN ? pct(a.pred / a.predN) : '  —'}`);
  }
}

async function experiment() {
  const all = [];
  for (const c of cases) for (const fs of FONTS) all.push(await page.evaluate(([id, W, fs]) => TBX.runCase(TB_CASES.find(c => c.id === id), W, fs), [c.id, WIDTHS, fs]));
  save('experiment.json', all);
  for (const [g, f] of Object.entries(GROUPS)) printGroup(`== ${g} (${all.filter(f).length} case×font × ${WIDTHS.length} widths; ratios vs css-auto)`, aggregate(all, f));
  printGroup('== all cases, tight widths only (320/400)', aggregate(all, () => true, W => W <= 400));
}

async function gap() {
  const res = [];
  for (const c of cases) res.push(await page.evaluate(([id, W]) => TBX.gap(TB_CASES.find(c => c.id === id), W, 15), [c.id, [360, 480, 640, 800]]));
  save('gap.json', res);
  const rows = res.flatMap(r => r.rows.map(x => ({ ...x, id: r.id })));
  const rel = rows.map(x => (x.greedy - Math.min(x.ls, x.exact ?? Infinity)) / Math.max(1, Math.min(x.ls, x.exact ?? Infinity)));
  const ex = rows.filter(x => x.exact != null);
  console.log(`\nGreedy path vs per-width optimum of the same objective (${rows.length} case×width, ${ex.length} solved exhaustively)`);
  console.log(`  mean relative excess ${pct(rel.reduce((a, b) => a + b, 0) / rel.length)}, median ${pct(rel.slice().sort((a, b) => a - b)[rel.length >> 1])}, worst ${pct(Math.max(...rel))}`);
  console.log(`  exact optimum reached by greedy: ${ex.filter(x => x.greedy <= x.exact + 1e-6).length}/${ex.length}; local search ≤ exact+1e-6: ${ex.filter(x => x.ls <= x.exact + 1e-6).length}/${ex.length}`);
  const worst = rows.map((x, i) => [rel[i], x]).sort((a, b) => b[0] - a[0]).slice(0, 5);
  for (const [r, x] of worst) console.log(`  worst: ${x.id} @${x.W}: greedy ${x.greedy.toFixed(1)} vs best ${Math.min(x.ls, x.exact ?? Infinity).toFixed(1)} (${pct(r)})`);
}

async function stability() {
  const methods = ['css-auto', 'min-height', 'tb-v1', 'tb2-fit', 'tb2', 'tb2-ls'];
  const res = [];
  for (const c of cases) res.push(await page.evaluate(([id, m]) => TBX.stability(TB_CASES.find(c => c.id === id), 15, 300, 1000, 10, m), [c.id, methods]));
  save('stability.json', res);
  console.log('\nResize stability, W = 300..1000 step 10px (mean over cases where the method applies)');
  console.log('method        excessMove px/step  colShrinks/step  layout ms');
  for (const m of methods) {
    const xs = res.map(r => r.res[m]).filter(Boolean);
    const avg = k => xs.reduce((s, x) => s + x[k], 0) / xs.length;
    console.log(`${m.padEnd(13)} ${num(avg('excessMovePx'), 2).padStart(18)} ${num(avg('shrinksPerStep'), 3).padStart(16)} ${num(avg('layoutMs'), 3).padStart(10)}   (n=${xs.length})`);
  }
}

async function perf() {
  const res = [];
  for (const spans of [false, true]) for (const n of [10, 100, 1000]) res.push(await page.evaluate(([n, s]) => TBX.perf(n, 15, s), [n, spans]));
  save('perf.json', res);
  console.log('\nPerformance (5 columns; "spans" adds a rowspan row header + colspan every 10 rows)');
  console.log('rows spans cells distinct  steps segs  prepare ms (measure)  path ms  warm prep ms  query µs  apply+reflow ms  cssAuto reflow ms');
  for (const r of res) console.log(`${String(r.rows).padStart(4)} ${String(r.spans).padEnd(5)} ${String(r.cells).padStart(5)} ${String(r.distinct).padStart(8)} ${String(r.steps).padStart(6)} ${String(r.segments).padStart(4)} ${num(r.prepareMs, 1).padStart(10)} (${num(r.measureMs, 1)}) ${num(r.pathMs, 1).padStart(10)} ${num(r.warmPrepareMs, 1).padStart(12)} ${num(r.queryUs, 1).padStart(9)} ${num(r.applyReflowMs, 2).padStart(16)} ${num(r.cssAutoReflowMs, 2).padStart(18)}`);
}

async function test() {
  const r = await page.evaluate(() => {
    const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
    const t = TBMarkdown.parseTable('| a | `b|c` | d\\|e |\n|:-|-:|:-:|\n| 1 | 2 | 3 |');
    ok(t && t.header[1] === '`b|c`' && t.header[2] === 'd|e' && t.align.join() === 'left,right,center', 'parser');
    for (const c of TB_CASES) {
      TableBadness.clearCache();
      const { table } = TBX.render(c, 600, 15);
      const M = TableBadness.prepare(table, { rowHeader: !!c.rowHeader });
      // grid: every slot covered exactly once
      const occ = Array.from({ length: M.rows }, () => new Array(M.nCols).fill(0));
      for (const x of M.cells) for (let i = x.r; i < x.r + x.rs; i++) for (let j = x.c; j < x.c + x.cs; j++) occ[i][j]++;
      if (occ.some(row => row.some(v => v !== 1))) fails.push(c.id + ': grid not a partition');
      for (const x of M.cells) { const st = x.st; for (let i = 1; i < st.w.length; i++) if (st.lines[i] > st.lines[i - 1] || !(st.w[i] > st.w[i - 1])) { fails.push(c.id + ': staircase'); break; } }
      // longest path equals sum of row maxima when there is no rowspan
      const w = M.naturals.map((n, j) => (n + M.floors[j]) / 2), e = TableBadness.evaluate(M, w);
      const y = TableBadness.rowBoundaries(M, e.h);
      ok(Math.abs(y[M.rows] - e.H) < 1e-6, c.id + ': height model');
      // path: monotone, within budget, comfort >= floors
      const path = TableBadness.buildPath(M);
      ok(path.comfort >= path.T[0] - 1e-9, c.id + ': comfort below floors');
      let prev = null;
      for (let W = 200; W <= 1400; W += 7) {
        const L = TableBadness.layout(M, path, W), B = TableBadness.budgetOf(M, W);
        if (!L.scroll) ok(L.widths.reduce((a, b) => a + b, 0) <= B + 1e-6, c.id + ': budget');
        if (prev) L.widths.forEach((x, j) => { if (x < prev[j] - 1e-9) fails.push(c.id + ': non-monotone at ' + W); });
        prev = L.widths;
      }
      // path cost bookkeeping equals full evaluation at vertices
      for (let i = 0; i < path.segs.length; i += Math.max(1, path.segs.length >> 2)) {
        const ws = TableBadness.widthsAlongPath(path, path.T[i]);
        ok(Math.abs(TableBadness.evaluate(M, ws).cost - path.cost[i]) < 1e-6 * Math.max(1, path.cost[i]) + 1e-6, c.id + ': path cost mismatch at ' + i);
      }
    }
    return [...new Set(fails)];
  });
  if (r.length) { console.log('FAIL\n' + r.slice(0, 40).join('\n')); process.exitCode = 1; } else console.log('all tests passed');
}

if (mode === 'test') await test();
if (mode === 'accuracy' || mode === 'all') await accuracy();
if (mode === 'experiment' || mode === 'all') await experiment();
if (mode === 'gap' || mode === 'all') await gap();
if (mode === 'stability' || mode === 'all') await stability();
if (mode === 'perf' || mode === 'all') await perf();
await browser.close();
