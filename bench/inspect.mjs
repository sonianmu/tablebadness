// node bench/inspect.mjs <caseId> <W> [fontSize] [methods] [out.png] [--blind seed]
// Renders the methods side by side (real browser layout) and prints DOM metrics. With --blind, labels are
// replaced by letters in a seeded random order and the key is written next to the image (for unbiased review).
import { launch } from './browser.mjs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const blindAt = args.indexOf('--blind');
const seed = blindAt >= 0 ? +args[blindAt + 1] : 0;
const [id, W = '480', fs = '15', ms, outArg] = blindAt >= 0 ? args.slice(0, blindAt) : args;
let methods = (ms || 'css-auto,min-height,tb-v1,tb2-fit').split(',');
const b = await launch();
const p = await b.newPage({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 1 });
p.on('pageerror', e => console.error(e.message));
await p.goto(pathToFileURL(join(root, 'bench/harness.html')).href);
// size the viewport so no panel is ever cropped (a cropped panel looks like an overflowing table)
{ const n = methods.length, cols = +W > 560 ? 2 : Math.min(n, 3); await p.setViewportSize({ width: cols * (+W + 24) + (cols - 1) * 18 + 60, height: 900 }); }
const res = await p.evaluate(([id, W, fs, methods, seed]) => {
  const c = TB_CASES.find(c => c.id === id);
  if (!c.html === false) methods = methods.filter(m => m !== 'tb-v1');
  if (c.html) methods = methods.filter(m => m !== 'tb-v1');
  let order = methods.slice();
  if (seed) { let s = seed; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; } }
  const stage = document.getElementById('stage'); stage.innerHTML = '';
  stage.style.cssText = `display:grid;grid-template-columns:repeat(${W > 560 ? 2 : Math.min(order.length, 3)}, ${W + 24}px);gap:18px;padding:12px;align-items:start;font:13px system-ui;background:#fff`;
  const out = [];
  order.forEach((m, k) => {
    const box = document.createElement('div');
    const label = seed ? String.fromCharCode(65 + k) : m;
    box.innerHTML = `<div style="font:600 15px system-ui;margin-bottom:6px">${label}</div>`;
    stage.appendChild(box);
    const { wrap, table } = TBX.render(c, W, fs, box);
    wrap.style.outline = '1px dashed #e0465f';
    TableBadness.clearCache();
    const ctx = TBX.context(c, table);
    if (m !== 'css-auto') TableBadness.apply(table, TBX.layoutFor(m, ctx, W)); else TableBadness.clear(table);
    const met = TBMetrics.measure(ctx.M, table, W, wrap);
    out.push({ label, m, h: Math.round(met.heightPx), ovf: met.overflowPx, short: `${met.shortIntact}/${met.shortCells}`, atom: met.atomicBreaks, frag: `${met.severeFrag}/${met.longCells}`, col1: `${met.colHeaderSingle}/${met.colHeaders}`, grp1: `${met.groupHeaderSingle}/${met.groupHeaders}`, rowWrap: `${met.rowHeaderWrapped}/${met.rowHeaders}`, rowX: Math.round(met.rowHeaderExtraPx), hdrH: Math.round(met.headerHeightPx), cols: Array.from(table.rows).find(r => Array.from(r.cells).every(x => x.colSpan === 1) && r.cells.length === ctx.M.nCols)?.cells ? Array.from(Array.from(table.rows).find(r => Array.from(r.cells).every(x => x.colSpan === 1) && r.cells.length === ctx.M.nCols).cells, x => Math.round(x.getBoundingClientRect().width)).join('/') : '' });
  });
  return { out, order };
}, [id, +W, +fs, methods, seed]);
const shot = outArg || join(root, 'results', `inspect-${id}-${W}.png`);
const el = await p.$('#stage');
await el.screenshot({ path: shot });
if (seed) writeFileSync(shot.replace(/\.png$/, '.key.json'), JSON.stringify({ id, W: +W, fs: +fs, order: res.order, metrics: res.out }, null, 1));
else for (const r of res.out) console.log(r.m.padEnd(12), JSON.stringify(r));
console.log('screenshot', shot);
await b.close();
