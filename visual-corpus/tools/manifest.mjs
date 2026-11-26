// Build tables/existing (research split) and the scenario manifest. Splits are by FAMILY, never by scenario.
import { writeFileSync, readFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { openRenderer } from './render.mjs';
const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..'), repo = join(root, '..');
// 1. existing project tables -> research split (they were used while developing the algorithms)
const ctx = { window: {} }; vm.createContext(ctx);
for (const f of ['data/cases.js', 'data/struct-cases.js', 'data/val2-cases.js']) vm.runInContext(readFileSync(join(repo, f), 'utf8'), ctx);
mkdirSync(join(root, 'tables/existing'), { recursive: true });
for (const c of ctx.window.TB_CASES) writeFileSync(join(root, 'tables/existing', c.id + '.json'), JSON.stringify({ id: 'x-' + c.id, family: 'x-' + c.id, lang: c.lang, structure: c.html ? 'html' : 'markdown', title: c.title, html: c.html, md: c.md, rowHeader: !!c.rowHeader, tags: c.tags, source: 'project data/ (used during algorithm development)' }, null, 1));
// 2. families and splits
const fam = [];
for (const d of ['existing', 'new']) for (const f of readdirSync(join(root, 'tables', d)).filter(f => f.endsWith('.json'))) fam.push(JSON.parse(readFileSync(join(root, 'tables', d, f), 'utf8')));
const newOnes = fam.filter(f => f.source === 'generated').sort((a, b) => (a.structure + a.id).localeCompare(b.structure + b.id));
newOnes.forEach((f, i) => { f.split = i % 2 === 0 ? 'validation' : 'holdout'; });
fam.filter(f => f.source !== 'generated').forEach(f => { f.split = 'research'; });
// 3. scenarios per family from measured content facts
const r = await openRenderer();
const scenarios = [];
let k = 0;
for (const f of fam) {
  const src = { lang: f.lang, html: f.html, md: f.md, rowHeader: f.rowHeader };
  const g = await r.render({ src, W: 4000, fs: 15, natural: true, ruler: false }, null);
  const pad = g.facts.reduce((s, x) => s + x.padding, 0) + g.tableExtra;
  const Wmin = Math.ceil(pad + g.facts.reduce((s, x) => s + x.minContent, 0));
  const Wnat = Math.ceil(pad + g.facts.reduce((s, x) => s + x.natural, 0));
  const top = Math.min(Wnat, 1000);
  const mid = Math.round(Wmin * Math.pow(Math.max(top, Wmin) / Wmin, 0.45));
  const list = [{ tag: 'phone', W: 360 }];
  if (Math.abs(mid - 360) > 70 && mid < 900) list.push({ tag: 'mid', W: mid });
  if (Wnat > 780) list.push({ tag: 'desktop', W: 720 });
  if (list.length === 1) list.push({ tag: 'mid', W: Math.min(Wnat, Math.max(480, mid)) });
  for (const s of list) {
    const fs = s.tag === 'mid' && k % 3 === 1 ? 13 : s.tag === 'mid' && k % 3 === 2 ? 17 : 15;
    const policy = Wmin > s.W ? 'scroll-allowed' : 'fit';
    scenarios.push({ id: `${f.id}@${s.tag}${fs !== 15 ? '-' + fs : ''}`, family: f.id, split: f.split, lang: f.lang, structure: f.structure, W: s.W, fs, policy, Wmin, Wnat });
  }
  k++;
  writeFileSync(join(root, 'tables', f.source === 'generated' ? 'new' : 'existing', (f.source === 'generated' ? f.id : f.id.slice(2)) + '.json'), JSON.stringify(f, null, 1));
}
await r.close();
writeFileSync(join(root, 'manifest.json'), JSON.stringify({ created: new Date().toISOString(), families: fam.map(f => ({ id: f.id, split: f.split, lang: f.lang, structure: f.structure, title: f.title })), scenarios }, null, 1));
const by = s => scenarios.reduce((m, x) => (m[x[s]] = (m[x[s]] || 0) + 1, m), {});
console.log('families', fam.length, 'scenarios', scenarios.length, by('split'), by('policy'));
