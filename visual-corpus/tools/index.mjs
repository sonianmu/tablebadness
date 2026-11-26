// Aggregate corpus/*/*.json into corpus/index.json, run hard-constraint audit, print coverage.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const recs = [];
for (const split of ['research', 'validation', 'holdout']) {
  const d = join(root, 'corpus', split);
  if (!existsSync(d)) continue;
  for (const f of readdirSync(d).filter(f => f.endsWith('.json') && f !== 'FROZEN.json')) recs.push(JSON.parse(readFileSync(join(d, f), 'utf8')));
}
// hard-constraint audit of preferred layouts (measured in the browser at design time)
const audit = r => {
  const issues = [];
  for (const p of r.preferred) {
    if (p.overflow > 0.5 && r.conditions.policy === 'fit') issues.push(`${p.name}: overflows a fit-only scenario by ${p.overflow}px`);
    if (p.cellLines.some(([, , l]) => !l)) issues.push(`${p.name}: unmeasured cell`);
  }
  return issues;
};
const rows = recs.map(r => ({
  id: r.id, family: r.family, split: r.split, status: r.status, lang: r.table.lang, structure: r.table.structure,
  W: r.conditions.availableWidth, fs: r.conditions.fontSize, policy: r.conditions.policy,
  preferred: r.preferred.map(p => ({ name: p.name, colWidths: p.colWidths, tableWidth: p.tableWidth, tableHeight: p.tableHeight, overflow: p.overflow, screenshot: `${r.split}/${p.screenshot}` })),
  acceptable: r.acceptable.length, bad: r.bad.length, audit: audit(r),
  reviewerGrades: r.review.verdict.per.map(p => p.prefGrade), refAutoGrades: r.review.verdict.per.map(p => p.autoGrade), refEqualGrades: r.review.verdict.per.map(p => p.equalGrade),
  file: `${r.split}/${r.id.replace(/[^a-zA-Z0-9@._-]/g, '_')}.json`,
}));
const count = (xs, k) => xs.reduce((m, x) => (m[x[k]] = (m[x[k]] || 0) + 1, m), {});
const amDir = join(root, 'corpus/holdout-amendments');
const amendments = existsSync(amDir) ? readdirSync(amDir).filter(f => f.endsWith('.json') && f !== 'FROZEN.json').map(f => JSON.parse(readFileSync(join(amDir, f), 'utf8'))).map(r => ({ id: r.id, frozenStatus: r.amends.frozenStatus, status: r.status, file: `holdout-amendments/${f(r.id)}.json` })) : [];
function f(id) { return id.replace(/[^a-zA-Z0-9@._-]/g, '_'); }
const summary = {
  scenarios: { planned: manifest.scenarios.length, done: rows.length },
  families: new Set(rows.map(r => r.family)).size,
  bySplit: count(rows, 'split'), byStatus: count(rows, 'status'), byLang: count(rows, 'lang'), byStructure: count(rows, 'structure'), byPolicy: count(rows, 'policy'),
  auditIssues: rows.filter(r => r.audit.length).map(r => ({ id: r.id, audit: r.audit })),
  holdoutAmendments: { note: 'post-freeze re-reviews/redesigns of frozen holdout records; the frozen records stay canonical', count: amendments.length, list: amendments },
  meanGrade: { preferred: mean(rows.flatMap(r => r.reviewerGrades)), browserAuto: mean(rows.flatMap(r => r.refAutoGrades)), equalWidths: mean(rows.flatMap(r => r.refEqualGrades)) },
};
function mean(xs) { xs = xs.filter(x => x > 0); return xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : null; }
writeFileSync(join(root, 'corpus/index.json'), JSON.stringify({ generated: new Date().toISOString(), summary, scenarios: rows }, null, 1));
console.log(JSON.stringify(summary, null, 1));
