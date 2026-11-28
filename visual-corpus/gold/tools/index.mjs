// Index + aggregate facts of the Gold corpus (gold/corpus/index.json). Pure bookkeeping over the records.
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { G, readJ, writeJ, mean, median } from './lib.mjs';

const recs = [];
for (const split of ['research', 'validation', 'holdout']) {
  const d = join(G, 'corpus', split); if (!existsSync(d)) continue;
  for (const f of readdirSync(d).filter(f => f.endsWith('.json') && f !== 'FROZEN.json')) recs.push(readJ(join(d, f)));
}
const man = readJ(join(G, 'manifest.json'));
const count = (xs, f) => xs.reduce((m, x) => { for (const k of [].concat(f(x))) m[k] = (m[k] || 0) + 1; return m; }, {});
const origin = (by, name) => name === 'contrast' ? 'synthesis contrast (deliberately flawed)' : /^d\d$/.test(by) ? 'independent designer' : by === 'synth' ? 'synthesis' : by === 'visual-corpus-v1' ? 'visual-corpus v1 preferred' : by;
const cands = recs.flatMap(r => r.candidates.map(c => ({ ...c, rid: r.id })));
const variants = recs.flatMap(r => ((r.landscape && r.landscape.variants) || []).map(v => ({ ...v, rid: r.id })));
const byType = {};
for (const v of variants) {
  const k = v.perturbation + (v.sameLinesAsRef ? ' (same lines)' : '');
  (byType[k] = byType[k] || []).push(v);
}
const sens = recs.flatMap(r => (r.landscape && r.landscape.sensitivity) || []);
const summary = {
  version: 'gold-v1', scenarios: { planned: man.scenarios.length, done: recs.length },
  bySplit: count(recs, r => r.split), byOrigin: count(recs, r => r.origin), byStatus: count(recs, r => r.status), byPrimaryClass: count(recs, r => r.primaryClass),
  topOrigin: count(recs, r => (r.topOrigins || [r.topOrigin]).map(origin)),
  topReachedByDesigners: count(recs, r => String((r.topOrigins || []).filter(o => /^d\d$/.test(o)).length)),
  designersConvergedOnSomeFinalLayout: recs.filter(r => (r.convergence || []).length).length,
  goldLayoutsPerScenario: count(recs, r => String(r.gold.length)),
  meanGradeByOrigin: Object.fromEntries(Object.entries(cands.reduce((m, c) => ((m[origin(c.origin, c.name)] = m[origin(c.origin, c.name)] || []).push(c.review.medianGrade), m), {})).map(([k, xs]) => [k, { n: xs.length, meanMedianGrade: mean(xs) }])),
  landscape: {
    scenarios: recs.filter(r => r.landscape).length, ratedVariants: variants.length,
    byPerturbation: Object.fromEntries(Object.entries(byType).map(([k, vs]) => [k, { n: vs.length, meanDScore: mean(vs.map(v => v.meanDScore)), medianDScore: median(vs.map(v => v.meanDScore)), shareWithin3Points: +(vs.filter(v => Math.abs(v.meanDScore) <= 3).length / vs.length).toFixed(2), shareJudgedIndistinguishable: +(vs.filter(v => v.ratings.some(x => x.indistinguishableFromRef)).length / vs.length).toFixed(2) }])),
    nearTwins: (() => { const t = variants.filter(v => !v.sameLinesAsRef && v.sameLineCountsAsRef && v.sameHeightAsRef); return { note: 'same line counts, height and total width as the reference; different break positions', n: t.length, meanDScore: mean(t.map(v => v.meanDScore)), list: t.map(v => ({ id: v.rid, name: v.name, dScore: v.meanDScore, l1: v.l1FromRef })) }; })(),
    metricTwins: (() => { const t = variants.filter(v => v.sameLinesAsRef && v.sameHeightAsRef); return { n: t.length, meanDScore: mean(t.map(v => v.meanDScore)), worse5plus: t.filter(v => v.meanDScore <= -5).map(v => ({ id: v.rid, name: v.name, dScore: v.meanDScore, l1: v.l1FromRef })) }; })(),
    columnSensitivity: { columns: sens.length, changeAt1px: sens.filter(x => x.shrinkToChange === 1).length, changeWithin5px: sens.filter(x => x.shrinkToChange && x.shrinkToChange <= 5).length, neverWithinMinWidth: sens.filter(x => x.shrinkToChange == null).length },
  },
};
const rows = recs.map(r => ({ id: r.id, split: r.split, origin: r.origin, status: r.status, lang: r.table.lang, structure: r.table.structure, W: r.conditions.availableWidth, fs: r.conditions.fontSize, policy: r.conditions.policy, top: r.top, topOrigin: r.topOrigin, gold: r.gold, file: `${r.split}/${r.id.replace(/[^a-zA-Z0-9@._-]/g, '_')}.json` }));
writeJ(join(G, 'corpus/index.json'), { generated: new Date().toISOString(), summary, scenarios: rows });
console.log(JSON.stringify(summary, null, 1));
