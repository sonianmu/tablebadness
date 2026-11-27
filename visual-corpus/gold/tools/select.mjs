// Choose the Gold scenarios: stratified greedy coverage over the 348 Visual-Corpus scenarios + real-document tables.
// Splits are inherited by family: VC research families (used in algorithm development) stay research;
// VC validation -> gold validation; VC holdout -> gold holdout; new real-document families alternate validation/holdout.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openRenderer } from '../../tools/render.mjs';
import REAL from '../tables/real-src.mjs';
const G = join(dirname(fileURLToPath(import.meta.url)), '..'), VC = join(G, '..');
const ix = JSON.parse(readFileSync(join(VC, 'corpus/index.json'), 'utf8'));
const man = JSON.parse(readFileSync(join(VC, 'manifest.json'), 'utf8'));
const fams = {};
for (const d of ['existing', 'new']) for (const f of readdirSync(join(VC, 'tables', d))) { const t = JSON.parse(readFileSync(join(VC, 'tables', d, f), 'utf8')); fams[t.id] = t; }
const QUOTA = { research: 18, validation: 15, holdout: 15 };

const cellsOf = t => (t.html ? [...t.html.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(m => m[1].replace(/<[^>]+>/g, ' ').trim()) : t.md.split('\n').filter(l => !/^\s*\|?\s*:?-{2,}/.test(l)).flatMap(l => l.split('|').map(x => x.trim()).filter(Boolean)));
function contentTags(t) {
  const c = cellsOf(t), n = c.length || 1, tags = [];
  if (c.filter(x => /^[-+−]?[\d.,%¥$€£ ]+[%万亿kKmM]?$/.test(x)).length / n > 0.35) tags.push('numeric');
  if (c.some(x => [...x].length > 60)) tags.push('longtext');
  if (c.filter(x => /[A-Za-z]+[-_./:][A-Za-z0-9]|^[A-Z]{2,}-?\d|\(\)|[{}\[\]=<>]/.test(x)).length / n > 0.15) tags.push('code');
  if (c.filter(x => /\d{4}[-/年.]\d{1,2}/.test(x)).length / n > 0.08) tags.push('date');
  if (c.every(x => [...x].length <= 12)) tags.push('short');
  return tags;
}
const script = l => /^zh/.test(l) ? 'zh' : /^(ja|ko)$/.test(l) ? l : /^(ar|he|fa)/.test(l) ? 'rtl' : /^(hi|ta|bn)/.test(l) ? 'indic' : /^(th|km|lo|my)/.test(l) ? 'sea' : l === 'en' ? 'en' : 'latin-other';
// structure from the markup itself (declared structure of older families is just 'html'/'markdown')
function structs(t) {
  const out = new Set([['html', 'markdown', 'plain'].includes(t.structure) ? 'plain' : t.structure]);
  const h = t.html || '', head = (h.match(/<thead[\s\S]*?<\/thead>/) || [''])[0], body = h.replace(head, '');
  if (/colspan="?[2-9]/.test(head)) out.add('multihdr');
  const rs = /rowspan="?[2-9]/.test(body), cs = /colspan="?[2-9]/.test(body);
  if (rs && cs) out.add('span2d'); else if (rs) out.add('rowspan'); else if (cs) out.add('colspan');
  if (t.rowHeader || /scope="row"/.test(h)) out.add('rowhdr');
  if (out.size > 1) out.delete('plain');
  return [...out];
}
const tight = (s) => s.policy === 'scroll-allowed' ? 'scroll' : s.W / s.Wnat >= 0.85 ? 'loose' : s.W / s.Wnat >= 0.5 ? 'medium' : s.W / s.Wnat >= 0.25 ? 'tight' : 'extreme';
function tagsOf(s, t, status) {
  const tg = [...structs(t).map(x => 'struct:' + x), 'script:' + script(t.lang), 'space:' + tight(s), ...contentTags(t).map(x => 'content:' + x)];
  if (status === 'rejected' || status === 'contested') tg.push('vc-failure', 'vc-' + status);
  return tg;
}
const vcStatus = Object.fromEntries(ix.scenarios.map(r => [r.id, r]));
const cands = man.scenarios.map(s => ({ ...s, origin: 'visual-corpus', inheritedSplit: s.split, vc: { status: vcStatus[s.id].status, file: vcStatus[s.id].file }, tags: tagsOf(s, fams[s.family], vcStatus[s.id].status) }));

// real-document families -> scenarios (phone + one wider width), measured like the VC manifest
const R = await openRenderer();
mkdirSync(join(G, 'tables'), { recursive: true });
const realScen = [];
REAL.forEach((t, i) => {
  t.family = t.id; t.split = i % 2 === 0 ? 'validation' : 'holdout'; t.rowHeader = false; t.source = t.source; fams[t.id] = t;
});
for (const t of REAL) {
  const g = await R.render({ src: { lang: t.lang, html: t.html }, W: 4000, fs: 15, natural: true, ruler: false }, null);
  const pad = g.facts.reduce((s, x) => s + x.padding, 0) + g.tableExtra;
  const Wmin = Math.ceil(pad + g.facts.reduce((s, x) => s + x.minContent, 0)), Wnat = Math.ceil(pad + g.facts.reduce((s, x) => s + x.natural, 0));
  const mid = Math.round(Wmin * Math.pow(Math.max(Math.min(Wnat, 1000), Wmin) / Wmin, 0.45));
  const list = [{ tag: 'phone', W: 360 }, { tag: Wnat > 780 ? 'desktop' : 'mid', W: Wnat > 780 ? 720 : Math.min(Wnat, Math.max(480, mid)) }];
  for (const x of list) {
    const s = { id: `${t.id}@${x.tag}`, family: t.id, split: t.split, lang: t.lang, structure: t.structure, W: x.W, fs: 15, policy: Wmin > x.W ? 'scroll-allowed' : 'fit', Wmin, Wnat };
    realScen.push({ ...s, origin: 'real-document', inheritedSplit: null, vc: null, tags: tagsOf(s, t, null) });
  }
}
await R.close();

// greedy: each pick maximises sum over its tags of 1/(1+times the tag is already covered in that split)
const picked = [], cover = {}, famCount = {};
const gain = c => c.tags.reduce((a, t) => a + 1 / (1 + ((cover[c.split] || {})[t] || 0)), 0) + (c.tags.includes('vc-failure') ? 0.6 : 0) - (famCount[c.family] ? 1.2 : 0);
const take = (c, why) => { picked.push({ ...c, why }); famCount[c.family] = (famCount[c.family] || 0) + 1; for (const t of c.tags) { cover[c.split] = cover[c.split] || {}; cover[c.split][t] = (cover[c.split][t] || 0) + 1; } };
// must-include: the w-gov counterexample of VISUAL_RESEARCH.md §1 (two widths), every real-document family once
for (const id of ['x-w-gov@mid', 'x-w-gov@phone']) take(cands.find(c => c.id === id), 'named counterexample in VISUAL_RESEARCH.md §1 (functional equivalence)');
const realPicked = new Set();
for (const c of realScen) if (!realPicked.has(c.family)) { realPicked.add(c.family); take(c, 'real-document table'); }
for (const c of realScen) if (!picked.some(p => p.id === c.id) && (c.policy === 'scroll-allowed' || c.W >= 600)) take(c, 'real-document table, second width');
for (const split of Object.keys(QUOTA)) {
  while (picked.filter(p => p.split === split && p.origin === 'visual-corpus').length < QUOTA[split]) {
    const pool = cands.filter(c => c.split === split && !picked.some(p => p.id === c.id) && (famCount[c.family] || 0) < 2);
    pool.sort((a, b) => gain(b) - gain(a) || a.id.localeCompare(b.id));
    const c = pool[0];
    take(c, 'coverage: ' + c.tags.filter(t => !((cover[split] || {})[t])).join(', ') || 'coverage (density)');
  }
}
for (const t of Object.values(fams).filter(f => picked.some(p => p.family === f.id))) writeFileSync(join(G, 'tables', t.id + '.json'), JSON.stringify(t, null, 1));
const count = (xs, f) => xs.reduce((m, x) => { for (const k of [].concat(f(x))) m[k] = (m[k] || 0) + 1; return m; }, {});
writeFileSync(join(G, 'manifest.json'), JSON.stringify({ version: 'gold-v1', created: new Date().toISOString(), quota: QUOTA, scenarios: picked }, null, 1));
console.log(picked.length, count(picked, p => p.split), count(picked, p => p.origin));
for (const sp of Object.keys(QUOTA)) console.log(sp, JSON.stringify(count(picked.filter(p => p.split === sp), p => p.tags)));
