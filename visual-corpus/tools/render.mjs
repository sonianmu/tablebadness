// Node-side renderer: one Chromium per process, renders specs to PNG + geometry JSON.
import { launch } from '../../bench/browser.mjs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));

export async function openRenderer() {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('render page error', e.message));
  await page.goto(pathToFileURL(join(here, 'render.html')).href);
  await page.evaluate(() => document.fonts.ready);
  return {
    async render(spec, pngPath) {
      const geom = await page.evaluate(s => window.VC.render(s), spec);
      await page.setViewportSize({ width: Math.max(320, geom.frameW + 20), height: 1000 });
      const frame = await page.$('#frame');
      if (pngPath) await frame.screenshot({ path: pngPath });
      return geom;
    },
    close: () => browser.close(),
  };
}
