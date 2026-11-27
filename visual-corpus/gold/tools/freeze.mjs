// Freeze the Gold holdout: sha256 of every record and image + data version + render conditions.
//   node gold/tools/freeze.mjs            write corpus/holdout/FROZEN.json (refuses if it exists; --append adds new files only)
//   node gold/tools/freeze.mjs --verify   check nothing changed
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { G, VC } from './lib.mjs';
const d = join(G, 'corpus/holdout'), out = join(d, 'FROZEN.json');
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const files = [...readdirSync(d).filter(f => f.endsWith('.json') && f !== 'FROZEN.json'), ...readdirSync(join(d, 'img')).map(f => 'img/' + f)].sort();
const hashes = Object.fromEntries(files.map(f => [f, sha(join(d, f))]));
if (process.argv.includes('--verify')) {
  const fz = JSON.parse(readFileSync(out, 'utf8'));
  const diff = Object.keys({ ...fz.files, ...hashes }).filter(f => fz.files[f] !== hashes[f]);
  console.log(diff.length ? `CHANGED since freeze (${diff.length}): ${diff.slice(0, 8).join(', ')}` : `gold holdout unchanged since ${fz.frozenAt} (${files.length} files, ${fz.records} records)`);
  process.exitCode = diff.length ? 1 : 0;
} else if (existsSync(out)) {
  const fz = JSON.parse(readFileSync(out, 'utf8'));
  if (!process.argv.includes('--append')) { console.log('already frozen at', fz.frozenAt); process.exit(0); }
  const changed = Object.keys(fz.files).filter(f => hashes[f] !== fz.files[f]);
  if (changed.length) { console.log('refusing: frozen files changed:', changed.slice(0, 5)); process.exit(1); }
  const added = Object.keys(hashes).filter(f => !(f in fz.files));
  if (!added.length) { console.log('nothing new to append'); process.exit(0); }
  for (const f of added) fz.files[f] = hashes[f];
  (fz.appended = fz.appended || []).push({ at: new Date().toISOString(), files: added.length });
  fz.records = Object.keys(fz.files).filter(f => f.endsWith('.json')).length;
  writeFileSync(out, JSON.stringify(fz, null, 1)); console.log('appended', added.length);
} else {
  const repo = join(VC, '..');
  let chromium = 'unknown'; try { chromium = execSync(`node -e "import('${join(repo, 'bench/browser.mjs')}').then(async m=>{const b=await m.launch();console.log(b.version());await b.close()})"`).toString().trim(); } catch (e) { /* keep unknown */ }
  writeFileSync(out, JSON.stringify({
    version: 'gold-v1', frozenAt: new Date().toISOString(),
    note: 'Gold holdout frozen before any layout algorithm of this project was run on these tables or scenarios.',
    renderConditions: { chromium, platform: `${process.platform} ${execSync('sw_vers -productVersion').toString().trim()}`, deviceScaleFactor: 1, fonts: 'system fonts (see src/table.css font stack)',
      tableCss: sha(join(repo, 'src/table.css')), renderPage: sha(join(VC, 'tools/render-page.js')), measure: sha(join(repo, 'src/measure.js')) },
    records: files.filter(f => f.endsWith('.json')).length, files: hashes,
  }, null, 1));
  console.log('frozen', files.length, 'files');
}
