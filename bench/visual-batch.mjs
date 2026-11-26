// Blind visual review set: validation cases at a moderately tight width, methods in seeded random order.
// Writes results/visual/<id>.png and <id>.key.json (do not open keys before judging).
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { launch } from './browser.mjs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await launch(); const p = await b.newPage();
await p.goto(pathToFileURL(join(root, 'bench/harness.html')).href);
const SETNAME = process.argv[2] || 'val';
const OUT = join(root, 'results/visual', SETNAME === 'val2' ? 'val2' : '');
const plan = await p.evaluate((SETNAME) => {
  const SET = SETNAME; const pick = SET === 'val2' ? TB_CASES.filter(c => c.set === 'val2') : TB_CASES.filter(c => c.set === 'val' && (c.kind === 'struct' || ['v-zh-hr', 'v-zh-legal', 'v-en-deps', 'v-h-shift', 'v-h-co', 'v-ar-he'].includes(c.id)));
  return pick.map(c => {
    TableBadness.clearCache();
    const { table } = TBX.render(c, 900, 15); const ctx = TBX.context(c, table), M = ctx.M;
    const ov = TableBadness.overheadOf(M), fit = ov + ctx.path.T[0], top = Math.max(fit, Math.min(ov + M.naturals.reduce((a, b) => a + b, 0), 960));
    return { id: c.id, W: Math.round(fit * Math.pow(top / fit, 0.35)), plain: !c.html };
  });
}, SETNAME);
await b.close();
mkdirSync(OUT, { recursive: true });
let seed = SETNAME === 'val2' ? 501 : 11;
for (const t of plan) {
  const methods = t.plain ? 'css-auto,min-height,tb-v1,tb2-fit' : 'css-auto,min-height,tb2-fit';
  execFileSync('node', [join(root, 'bench/inspect.mjs'), t.id, String(t.W), '15', methods, join(OUT, t.id + '.png'), '--blind', String(seed += 7)]);
  console.log(t.id, t.W);
}
