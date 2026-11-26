// Expand briefs into real tables (Pi, text-only), validate structure in the browser, assign splits. Resumable.
import { existsSync, writeFileSync, readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import briefs from '../tables/briefs.js';
import { ask } from './pi.mjs';
import { pool } from './pool.mjs';
import { launch } from '../../bench/browser.mjs';
import { pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '../tables/new');
mkdirSync(out, { recursive: true });

const NEEDS = { multihdr: ['colspan'], colspan: ['colspan'], rowspan: ['rowspan'], span2d: ['colspan', 'rowspan'], 'section-rows': ['colspan'], rowhdr: [], crosstab: [] };
const browser = await launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(join(here, 'render.html')).href);
async function check(html, structure) {
  return page.evaluate(([html, structure, needs]) => {
    const d = document.createElement('div'); d.innerHTML = html;
    const t = d.querySelector('table'); if (!t) return 'no <table>';
    if (!t.tHead) return 'no <thead>';
    const g = TableBadness.buildGrid(t);
    const occ = Array.from({ length: g.rows.length }, () => new Array(g.nCols).fill(0));
    for (const c of g.cells) for (let i = c.r; i < c.r + c.rs; i++) for (let j = c.c; j < c.c + c.cs; j++) occ[i][j]++;
    if (occ.some(r => r.some(v => v !== 1))) return 'grid is not a clean partition (row lengths / spans inconsistent)';
    if (g.rows.length < 3) return 'too few rows';
    const empty = g.cells.filter(c => !c.el.textContent.trim()).length;
    if (empty > g.cells.length * 0.25) return 'too many empty cells';
    for (const n of needs) if (!t.querySelector(`[${n}]`)) return 'missing required ' + n;
    if ((structure === 'rowhdr' || structure === 'crosstab') && !t.querySelector('tbody th')) return 'row headers must be <th scope="row"> in tbody';
    return null;
  }, [html, structure, NEEDS[structure] || []]);
}

const todo = briefs.filter(([id]) => !existsSync(join(out, id + '.json')));
console.log(`${briefs.length} briefs, ${todo.length} to generate`);
await pool(todo, 6, async ([id, lang, structure, brief]) => {
  const prompt = `Write ONE realistic, information-dense data table as it would appear in a real document. Language of all content: ${lang}. Structure: ${structure}. Subject and columns: ${brief}
Rules: 3–8 body rows; natural, varied, truthful-sounding content (no lorem ipsum, no "Item 1/Item 2"); vary cell lengths realistically; HTML only with <table><thead>…</thead><tbody>…</tbody></table>; column headers are <th> in <thead>; row headers (if any) are <th scope="row"> in <tbody>; use rowspan/colspan exactly as the structure requires and keep the grid consistent; no styles, classes, ids or attributes other than rowspan, colspan and scope; no markdown.
Reply ONLY JSON: {"title": "short title in ${lang}", "html": "<table>…</table>"}`;
  let last = null;
  for (let k = 0; k < 3; k++) {
    const j = await ask({ prompt: prompt + (last ? `\n\nPrevious attempt was invalid: ${last}. Fix it.` : ''), thinking: 'low', timeoutMs: 180000, logPath: join(here, '../runs/_gen', id + '.json'), validate: x => (typeof x.html === 'string' && x.html.includes('<table') ? null : 'missing html') });
    const html = j.html.replace(/\s(style|class|id)="[^"]*"/g, '');
    last = await check(html, structure);
    if (!last) {
      writeFileSync(join(out, id + '.json'), JSON.stringify({ id, family: id, lang, structure, brief, title: j.title, html, source: 'generated', generator: 'workbuddy-ai/deepseek-v4.1-flash-sg' }, null, 1));
      console.log('  ✓', id); return;
    }
  }
  throw new Error(id + ': ' + last);
});
await browser.close();
console.log('done:', readdirSync(out).length, 'tables');
