// Freeze the holdout split: sha256 of every record and screenshot. Run BEFORE any layout algorithm sees it.
//   node tools/freeze.mjs          -> writes corpus/holdout/FROZEN.json (refuses to overwrite)
//   node tools/freeze.mjs --verify -> checks nothing changed
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), d = join(root, 'corpus/holdout'), out = join(d, 'FROZEN.json');
const files = [...readdirSync(d).filter(f => f.endsWith('.json') && f !== 'FROZEN.json'), ...readdirSync(join(d, 'img')).map(f => 'img/' + f)].sort();
const hashes = Object.fromEntries(files.map(f => [f, createHash('sha256').update(readFileSync(join(d, f))).digest('hex')]));
if (process.argv.includes('--verify')) {
  const frozen = JSON.parse(readFileSync(out, 'utf8'));
  const diff = Object.keys({ ...frozen.files, ...hashes }).filter(f => frozen.files[f] !== hashes[f]);
  console.log(diff.length ? `CHANGED since freeze (${diff.length}): ${diff.slice(0, 10).join(', ')}` : `holdout unchanged since ${frozen.frozenAt} (${files.length} files)`);
  process.exitCode = diff.length ? 1 : 0;
} else {
  if (existsSync(out)) {
    const frozen = JSON.parse(readFileSync(out, 'utf8'));
    if (!process.argv.includes('--append')) { console.log('already frozen at', frozen.frozenAt, '— use --verify, or --append to freeze newly finished holdout scenarios'); process.exit(0); }
    // --append: add files that did not exist at the last freeze; files already frozen must be unchanged
    const changed = Object.keys(frozen.files).filter(f => hashes[f] !== frozen.files[f]);
    if (changed.length) { console.log('refusing: frozen files changed:', changed.slice(0, 5)); process.exit(1); }
    const added = Object.keys(hashes).filter(f => !(f in frozen.files));
    for (const f of added) frozen.files[f] = hashes[f];
    (frozen.appended = frozen.appended || []).push({ at: new Date().toISOString(), files: added.length, note: 'scenarios finished after the first freeze; still no layout algorithm had been run on the holdout' });
    frozen.records = Object.keys(frozen.files).filter(f => f.endsWith('.json')).length;
    writeFileSync(out, JSON.stringify(frozen, null, 1));
    console.log('appended', added.length, 'files'); process.exit(0);
  }
  writeFileSync(out, JSON.stringify({ frozenAt: new Date().toISOString(), note: 'Frozen before any layout algorithm of this project was run on these tables.', records: files.filter(f => f.endsWith('.json')).length, files: hashes }, null, 1));
  console.log('frozen', files.length, 'files');
}
