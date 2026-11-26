// Experiment runner: node bench/run.mjs <test|accuracy|experiment|stability|perf|all>
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
const cases = await page.evaluate(() => TB_CASES.map(c => ({ id: c.id, set: c.set, tags: c.tags })));
const save = (name, data) => writeFileSync(join(outDir, name), JSON.stringify(data, null, 1));

const pct = x => (x == null ? '  —  ' : (100 * x).toFixed(1).padStart(5) + '%');
const num = (x, d = 1) => (x == null ? '—' : x.toFixed(d));

async function accuracy() {
  const res = [];
  for (const c of cases) for (const fs of FONTS) res.push(await page.evaluate(([id, fs]) => TBX.accuracy(TB_CASES.find(c => c.id === id), fs, 12, 7), [c.id, fs]));
  save('accuracy.json', res);
  const byTag = {};
  for (const r of res) for (const t of r.tags) { (byTag[t] ||= { n: 0, a: 0, s: 0 }); byTag[t].n += r.n; byTag[t].a += r.agree * r.n; byTag[t].s += r.agreeSafe * r.n; }
  const N = res.reduce((s, r) => s + r.n, 0), A = res.reduce((s, r) => s + r.agree * r.n, 0);
  console.log(`\nEngine line-count prediction vs Chromium layout, random widths: ${pct(A / N)} of ${N} samples`);
  for (const [t, v] of Object.entries(byTag).sort()) console.log(`  ${t.padEnd(14)} ${pct(v.a / v.n)}  (n=${v.n})`);
  for (const r of res) if (r.agree < 0.99) console.log('  low:', r.id, r.tags.join(','), pct(r.agree), JSON.stringify(r.misses.slice(0, 2)));
  return res;
}

function aggregate(all, filter) {
  const rows = {};
  for (const cr of all) {
    if (!filter(cr)) continue;
    for (const r of cr.results) {
      const a = (rows[r.method] ||= { rowP90: 0, rowMax: 0, vis: 0, unused: 0, co: 0, n: 0, short: 0, shortN: 0, atomic: 0, emerg: 0, frag: 0, longN: 0, measure: 0, height: 0, heightRel: 0, overflow: 0, scroll: 0, loss: 0, lossRel: 0, maxLines: 0, ms: 0, msN: 0, pred: 0, predN: 0 });
      const m = r.metrics;
      a.n++;
      a.short += m.shortIntact; a.shortN += m.shortCells;
      a.atomic += m.atomicBreaks; a.emerg += m.emergencyBreaks;
      a.frag += m.severeFrag; a.longN += m.longCells; a.measure += m.measureEmSum;
      a.height += m.heightPx; a.overflow += m.overflowPx; a.scroll += m.overflowPx > 0.5 ? 1 : 0;
      a.loss += r.loss; a.maxLines += m.maxLines;
      a.rowP90 += m.rowP90Px; a.rowMax += m.rowMaxPx; a.vis += m.visibleRows600; a.unused += m.unusedFrac; a.co += m.coBottleneckRows;
      const ref = cr.results.find(x => x.W === r.W && x.method === 'css-auto');
      a.heightRel += m.heightPx / ref.metrics.heightPx;
      if (r.ms != null) { a.ms += r.ms; a.msN++; }
      if (r.predAgree != null) { a.pred += r.predAgree; a.predN++; }
    }
  }
  return rows;
}

function printTable(title, rows) {
  console.log(`\n${title}`);
  console.log('method          shortIntact atomicBrk/tbl emerg/tbl severeFrag meanMeasure  height  h/css  overflowPx scroll%  TBloss  maxLines  ms/layout predAgree');
  for (const [k, a] of Object.entries(rows)) {
    console.log(`${k.padEnd(15)} ${pct(a.short / a.shortN).padStart(10)} ${num(a.atomic / a.n, 2).padStart(12)} ${num(a.emerg / a.n, 2).padStart(9)} ${pct(a.frag / a.longN).padStart(10)} ${num(a.measure / a.longN, 1).padStart(9)}em ${num(a.height / a.n, 0).padStart(7)} ${num(a.heightRel / a.n, 3).padStart(6)} ${num(a.overflow / a.n, 1).padStart(10)} ${pct(a.scroll / a.n).padStart(7)} ${num(a.loss / a.n, 2).padStart(7)} ${num(a.maxLines / a.n, 2).padStart(8)} ${a.msN ? num(a.ms / a.msN, 3).padStart(9) : '        —'} ${a.predN ? pct(a.pred / a.predN) : '  —'}`);
  }
  console.log('  row structure:   method          rowP90px  rowMaxPx  visibleRows@600px  unusedCellArea  coBottleneckRows');
  for (const [k, a] of Object.entries(rows)) console.log(`                   ${k.padEnd(15)} ${num(a.rowP90 / a.n, 0).padStart(8)} ${num(a.rowMax / a.n, 0).padStart(9)} ${num(a.vis / a.n, 2).padStart(18)} ${pct(a.unused / a.n).padStart(15)} ${num(a.co / a.n, 2).padStart(17)}`);
}

async function experiment() {
  const all = [];
  for (const c of cases) for (const fs of FONTS) {
    all.push(await page.evaluate(([id, W, fs]) => TBX.runCase(TB_CASES.find(c => c.id === id), W, fs, {}), [c.id, WIDTHS, fs]));
  }
  save('experiment.json', all);
  for (const set of ['dev', 'val']) printTable(`== ${set.toUpperCase()} set (${all.filter(r => r.set === set).length} case×font, widths ${WIDTHS.join('/')}) ==`, aggregate(all, r => r.set === set));
  // per script on validation+dev for tb-path vs css-auto
  const tags = [...new Set(cases.flatMap(c => c.tags))].sort();
  console.log('\nPer tag (all sets): shortIntact / atomicBreaks per table / severeFrag / height rel. to css-auto');
  console.log('tag            ' + ['css-auto', 'proportional', 'min-height', 'tb-path'].map(m => m.padEnd(30)).join(''));
  for (const t of tags) {
    const rows = aggregate(all, r => r.tags.includes(t));
    let line = t.padEnd(15);
    for (const m of ['css-auto', 'proportional', 'min-height', 'tb-path']) {
      const a = rows[m];
      line += `${pct(a.short / a.shortN)} ${num(a.atomic / a.n, 1).padStart(4)} ${pct(a.frag / a.longN)} ${num(a.heightRel / a.n, 2)}`.padEnd(30);
    }
    console.log(line);
  }
  return all;
}

async function stability() {
  const methods = ['css-auto', 'proportional', 'min-height', 'tb-ls', 'tb-fit', 'tb-path'];
  const res = [];
  for (const c of cases) res.push(await page.evaluate(([id, m]) => TBX.stability(TB_CASES.find(c => c.id === id), 15, 300, 1000, 5, m), [c.id, methods]));
  save('stability.json', res);
  console.log('\nResize stability, W = 300..1000 step 5px (mean over cases)');
  console.log('method          excessMove px/step  colShrinks/step  rowLineChange/step  layout ms');
  for (const m of methods) {
    const xs = res.map(r => r.res[m]);
    const avg = k => xs.reduce((s, x) => s + x[k], 0) / xs.length;
    console.log(`${m.padEnd(15)} ${num(avg('meanExcessMovePx'), 2).padStart(18)} ${num(avg('reversalsPerStep'), 3).padStart(16)} ${num(avg('lineChangeRate'), 3).padStart(19)} ${num(avg('meanLayoutMs'), 3).padStart(10)}`);
  }
  return res;
}

async function perf() {
  const res = [];
  for (const n of [10, 100, 1000]) res.push(await page.evaluate(n => TBX.perf(n, 15), n));
  save('perf.json', res);
  console.log('\nPerformance (5 columns, Chromium headless)');
  console.log('rows  distinct  units  steps   prepare ms (measure/stair)  path ms  warm prep ms  query µs  apply+reflow ms  cssAuto reflow ms  DOM-probe×32 ms  arith×32 ms');
  for (const r of res) console.log(`${String(r.rows).padStart(4)} ${String(r.distinct).padStart(9)} ${String(r.units).padStart(6)} ${String(r.staircaseSteps).padStart(6)} ${num(r.prepareMs, 1).padStart(10)} (${num(r.measureMs, 1)}/${num(r.staircaseMs, 1)})  ${num(r.pathMs, 2).padStart(10)} ${num(r.warmPrepareMs, 1).padStart(12)} ${num(r.queryUs, 1).padStart(9)} ${num(r.applyPlusReflowMs, 2).padStart(16)} ${num(r.cssAutoReflowMs, 2).padStart(18)} ${num(r.domProbe32Ms, 1).padStart(16)} ${num(r.arith32Ms, 2).padStart(12)}`);
  return res;
}

async function test() {
  const r = await page.evaluate(() => {
    const fails = [];
    const ok = (c, m) => { if (!c) fails.push(m); };
    // parser
    const t = TBMarkdown.parseTable('| a | `b|c` | d\\|e |\n|:-|-:|:-:|\n| 1 | 2 | 3 |');
    ok(t && t.header.length === 3 && t.header[1] === '`b|c`' && t.header[2] === 'd|e', 'parser: pipes in code / escaped');
    ok(t.align.join() === 'left,right,center', 'parser: alignment');
    for (const c of TB_CASES) {
      TableBadness.clearCache();
      const { table } = TBX.render(c, 600, 15);
      const P = TableBadness.prepareTable(table);
      // staircase monotone: lines non-increasing in width; widths strictly increasing
      for (const col of P.cols) for (const e of col.entries) {
        const st = e.st;
        for (let i = 1; i < st.w.length; i++) {
          if (!(st.w[i] > st.w[i - 1])) { fails.push(c.id + ': staircase widths not increasing'); break; }
          if (st.lines[i] > st.lines[i - 1]) { fails.push(c.id + ': lines increase with width'); break; }
        }
        ok(Math.abs(TableBadness.layoutCell(e.cell, e.cell.natural + 0.5).lines - (1 + Array.from(e.cell.K).filter(k => k === 2).length)) === 0, c.id + ': natural width is single line');
      }
      // path: widths monotone in W, budget respected
      const path = TableBadness.buildPath(P);
      let prev = null;
      for (let W = 200; W <= 1400; W += 3) {
        const B = TableBadness.budgetOf(P, W);
        const ws = TableBadness.widthsAlongPath(path, Math.min(B, path.T[path.T.length - 1]));
        const sum = ws.reduce((a, b) => a + b, 0);
        if (B >= path.T[0]) ok(sum <= B + 1e-6, c.id + ': budget exceeded at W=' + W);
        if (prev) ws.forEach((w, j) => { if (w < prev[j] - 1e-9) fails.push(c.id + ': non-monotone column ' + j + ' at W=' + W); });
        prev = ws;
      }
      // DP never worse than path on the separable objective (same budget)
      for (const W of [360, 600]) {
        const Ps = TableBadness.prepareTable(table, { rowWeight: 0, scroll: false }); const a = TBBaselines.dpExact(Ps, W), b = TableBadness.layoutAt(Ps, TableBadness.buildPath(Ps), W);
        if (!b.scroll && !a.scroll) ok(a.cost <= b.cost + 1e-6, c.id + ': dp worse than path at ' + W + ' ' + a.cost + ' > ' + b.cost);
      }
    }
    return fails;
  });
  if (r.length) { console.log('FAIL\n' + [...new Set(r)].slice(0, 40).join('\n')); process.exitCode = 1; } else console.log('all tests passed');
}

async function sweep() {
  // Pareto sweep of the fragmentation dial (dev set only; validation set is never used for choosing)
  const configs = process.env.SWEEP ? JSON.parse(process.env.SWEEP) : [
    { rowWeight: 0 }, { rowWeight: 1 }, { rowWeight: 2 }, { rowWeight: 3 }, { rowWeight: 4 },
    { rowWeight: 2, fragCost: 0 }, { rowWeight: 2, fragEm: 12 }, { rowWeight: 2, tokenCost: 0.5 }, { rowWeight: 2, tokenCost: 2 },
    { rowWeight: 3, fragEm: 12 },
  ];
  const out = [];
  const M = process.env.METHOD || 'tb-fit';
  console.log(`\nSweep on DEV (${M})`);
  console.log('config                         shortIntact atomic/tbl severeFrag meanMeasure  h/css   maxLines  scroll%');
  for (const cfg of configs) {
    const all = [];
    for (const c of cases.filter(c => c.set === 'dev')) for (const fs of FONTS)
      all.push(await page.evaluate(([id, W, fs, cfg, M]) => TBX.runCase(TB_CASES.find(c => c.id === id), W, fs, cfg, ['css-auto', 'min-height', M]), [c.id, WIDTHS, fs, cfg, M]));
    if (!out.length) { const b = aggregate(all, () => true)['min-height']; console.log(`${'(min-height baseline)'.padEnd(30)} ${pct(b.short / b.shortN).padStart(10)} ${num(b.atomic / b.n, 2).padStart(10)} ${pct(b.frag / b.longN).padStart(10)} ${num(b.measure / b.longN, 1).padStart(9)}em ${num(b.heightRel / b.n, 3).padStart(7)} ${num(b.maxLines / b.n, 2).padStart(9)}`); }
    const a = aggregate(all, () => true)[M];
    out.push({ cfg, a });
    console.log(`${JSON.stringify(cfg).padEnd(30)} ${pct(a.short / a.shortN).padStart(10)} ${num(a.atomic / a.n, 2).padStart(10)} ${pct(a.frag / a.longN).padStart(10)} ${num(a.measure / a.longN, 1).padStart(9)}em ${num(a.heightRel / a.n, 3).padStart(7)} ${num(a.maxLines / a.n, 2).padStart(9)} ${pct(a.scroll / a.n)}`);
  }
  save('sweep.json', out);
}

if (mode === 'sweep') await sweep();
if (mode === 'test') await test();
if (mode === 'accuracy' || mode === 'all') await accuracy();
if (mode === 'experiment' || mode === 'all') await experiment();
if (mode === 'stability' || mode === 'all') await stability();
if (mode === 'perf' || mode === 'all') await perf();
await browser.close();
