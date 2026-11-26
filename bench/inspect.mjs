// node bench/inspect.mjs <caseId> <W> [fontSize] [methods] -> widths & metrics per method, and a screenshot
import { launch } from './browser.mjs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [id, W = '400', fs = '15', ms] = process.argv.slice(2);
const methods = (ms || 'css-auto,proportional,min-height,tb-dp,tb-fit,tb-path').split(',');
const b = await launch(); const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
p.on('pageerror', e => console.error(e.message));
await p.goto(pathToFileURL(join(root, 'bench/harness.html')).href);
const out = await p.evaluate(([id, W, fs, methods]) => {
  const c = TB_CASES.find(c => c.id === id);
  const r = TBX.runCase(c, [W], fs, {}, methods);
  const { P } = TBX.prepareCtx(document.querySelector('table'), {});
  return { r, floors: P.cols.map(c => +c.floor.toFixed(1)), naturals: P.cols.map(c => +c.natural.toFixed(1)), overhead: P.overhead };
}, [id, +W, +fs, methods]);
console.log('floors', out.floors.join(' '), ' naturals', out.naturals.join(' '));
for (const r of out.r.results) {
  const m = r.metrics;
  console.log(r.method.padEnd(13), 'cols', m.colWidths.map(x => x.toFixed(0)).join(' ').padEnd(30), `short ${m.shortIntact}/${m.shortCells} atom ${m.atomicBreaks} long ${m.longCells} sev ${m.severeFrag} meas ${(m.meanMeasureEm||0).toFixed(1)} h ${m.heightPx.toFixed(0)} ovf ${m.overflowPx} loss ${r.loss.toFixed(1)}`);
}
// side-by-side screenshot
await p.evaluate(([id, W, fs, methods]) => {
  const c = TB_CASES.find(c => c.id === id);
  const stage = document.getElementById('stage'); stage.innerHTML = '';
  const grid = document.createElement('div'); grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start';
  stage.appendChild(grid);
  for (const m of methods) {
    const box = document.createElement('div'); box.innerHTML = `<div style="font:12px monospace">${m}</div>`;
    const wrap = document.createElement('div'); wrap.className = 'tb-wrap'; wrap.style.width = W + 'px'; wrap.style.outline = '1px dashed #f0a'; wrap.style.setProperty('--tb-font-size', fs + 'px'); wrap.lang = c.lang;
    wrap.innerHTML = TBMarkdown.toHTML(TBMarkdown.parseTable(c.md)); box.appendChild(wrap); grid.appendChild(box);
    const table = wrap.querySelector('table');
    if (m !== 'css-auto') { const ctx = TBX.prepareCtx(table, {}); const L = ({ 'tb-path': () => TableBadness.layoutAt(ctx.P, ctx.path, W), 'tb-fit': () => TableBadness.layoutAt(ctx.Pf, ctx.path, W), 'tb-dp': () => TBBaselines.dpExact(ctx.P, W), 'min-height': () => TBBaselines.minHeight(ctx.P, W, [TableBadness.layoutAt(ctx.P, ctx.path, W).widths]), proportional: () => TBBaselines.proportional(ctx.P, W), equal: () => TBBaselines.equal(ctx.P, W) })[m](); TableBadness.applyWidths(table, L); }
  }
}, [id, +W, +fs, methods]);
const shot = process.env.SHOT || join(root, 'results', `inspect-${id}-${W}.png`);
await p.screenshot({ path: shot, fullPage: true });
console.log('screenshot', shot);
await b.close();
