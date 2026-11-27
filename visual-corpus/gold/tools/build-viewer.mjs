// Build gold/viewer/index.html: a self-contained browser for the Gold corpus (data + table CSS embedded).
// Layouts are re-rendered live with the exact corpus CSS and column widths; screenshots load when opened from the repo.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { G, VC, readJ } from './lib.mjs';

const repo = join(VC, '..');
const ctx = { window: {} }; ctx.global = ctx.window; vm.createContext(ctx);
vm.runInContext(readFileSync(join(repo, 'src/markdown.js'), 'utf8'), ctx);
const MD = ctx.window.TBMarkdown || ctx.TBMarkdown;
const css = readFileSync(join(repo, 'src/table.css'), 'utf8');
const pick = (o, ks) => Object.fromEntries(ks.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
const data = [];
for (const split of ['research', 'validation', 'holdout']) {
  const d = join(G, 'corpus', split); if (!existsSync(d)) continue;
  for (const f of readdirSync(d).filter(f => f.endsWith('.json') && f !== 'FROZEN.json').sort()) {
    const r = readJ(join(d, f));
    const html = (r.table.html || MD.toHTML(MD.parseTable(r.table.md))).replace(/<table(?![^>]*tb-table)/, '<table class="tb-table"');
    const geo = c => pick(c, ['name', 'origin', 'origins', 'label', 'idea', 'aliases', 'colWidths', 'requestedWidths', 'tableWidth', 'tableHeight', 'rowHeights', 'overflow', 'cls', 'breaks']);
    const shot = p => (p ? `../corpus/${split}/${p}` : null);
    data.push({
      id: r.id, split: r.split, origin: r.origin, inheritedSplit: r.inheritedSplit, status: r.status, primaryClass: r.primaryClass, top: r.top, gold: r.gold, byClass: r.byClass,
      table: { title: r.table.title, lang: r.table.lang, structure: r.table.structure, html, source: r.table.source, licence: r.table.licence, edits: r.table.edits, rowHeader: r.table.rowHeader },
      cond: r.conditions, why: r.selection.why, vc: r.selection.visualCorpus,
      candidates: r.candidates.map(c => ({ ...geo(c), review: pick(c.review, ['grades', 'medianGrade', 'scores', 'meanScore', 'goodVotes', 'bestVotes', 'dimMeans', 'whys']), shot: shot(c.screenshot), vp: shot(c.viewport) })),
      landscape: r.landscape && { ref: r.landscape.ref, sensitivity: r.landscape.sensitivity, explored: r.landscape.explored.length,
        exploredSameLines: r.landscape.explored.filter(x => x.sameLines).length,
        variants: r.landscape.variants.map(v => ({ ...geo(v), perturbation: v.perturbation, how: v.how, why: v.why, sameLinesAsRef: v.sameLinesAsRef, sameHeightAsRef: v.sameHeightAsRef, l1: v.l1FromRef, meanDScore: v.meanDScore, meanDGrade: v.meanDGrade,
          ratings: v.ratings.map(x => pick(x, ['grade', 'score', 'refScore', 'dScore', 'why', 'indistinguishableFromRef'])), shot: shot(v.screenshot) })) },
      understanding: r.understanding,
      synthesis: pick(r.synthesis, ['letters', 'rounds', 'finalists', 'acceptable', 'bad', 'contrast', 'sameFunctionGroups', 'rationale', 'principles', 'tradeoffs', 'uncertain', 'stop']),
      history: r.designHistory,
      designs: Object.fromEntries(Object.entries(r.designs).map(([k, x]) => [k, pick(x, ['by', 'round', 'idea', 'duplicateOf', 'colWidths', 'requestedWidths', 'tableHeight', 'overflow'])])),
      overview: shot(r.overview), provenance: pick(r.provenance, ['pi', 'calls', 'created', 'note']), model: Object.values(r.provenance.models).find(m => m && m.model),
    });
  }
}
const index = readJ(join(G, 'corpus/index.json'));
const tpl = readFileSync(join(G, 'tools/viewer-template.html'), 'utf8');
const json = s => JSON.stringify(s).replace(/</g, '\\u003c');
const out = tpl.replace('/*TABLE_CSS*/', css).replace('/*DATA*/', `window.GOLD=${json(data)};window.GOLD_INDEX=${json(index ? index.summary : null)};`);
mkdirSync(join(G, 'viewer'), { recursive: true });
// local file (full document; screenshots load from ../corpus) and an artifact body (wrapped by the host)
writeFileSync(join(G, 'viewer/index.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${out}</body></html>`);
writeFileSync(join(G, 'viewer/artifact.html'), out);
console.log('viewer', data.length, 'scenarios', (out.length / 1e6).toFixed(2), 'MB');
