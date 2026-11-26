// Calibrate the comfort-width scroll threshold on the DEV set only: match the browser's own scroll rate.
import { launch } from './browser.mjs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await launch(); const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
await p.goto(pathToFileURL(join(root, 'bench/harness.html')).href);
const out = await p.evaluate(() => {
  const dev = TB_CASES.filter(c => c.set === 'dev'), Ws = [320, 400, 480, 600, 760, 960];
  let cssScroll = 0, n = 0;
  const rates = [10, 20, 40, 80, 160, 320], sc = rates.map(() => 0);
  for (const c of dev) {
    TableBadness.clearCache();
    const { wrap, table } = TBX.render(c, 600, 15);
    const ctx = TBX.context(c, table);
    for (const W of Ws) {
      wrap.style.width = W + 'px'; TableBadness.clear(table); n++;
      if (wrap.scrollWidth > wrap.clientWidth + 0.5) cssScroll++;
      rates.forEach((r, k) => { ctx.M.opts.scrollRate = r; ctx.path.comfort = undefined; });
    }
    rates.forEach((r, k) => {
      const M = TableBadness.prepare(table, Object.assign({}, ctx.o, { scrollRate: r })), path = TableBadness.buildPath(M);
      for (const W of Ws) if (TableBadness.layout(M, path, W).scroll) sc[k]++;
    });
  }
  return { css: cssScroll / n, rates: rates.map((r, k) => [r, sc[k] / n]) };
});
console.log('browser scroll rate on dev:', (out.css * 100).toFixed(1) + '%');
for (const [r, x] of out.rates) console.log('scrollRate', r, '->', (x * 100).toFixed(1) + '%');
await b.close();
