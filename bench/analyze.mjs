// Per-width breakdown of results/experiment.json
import { readFileSync } from 'node:fs';
const all = JSON.parse(readFileSync(new URL('../results/experiment.json', import.meta.url)));
const methods = process.argv[2] ? process.argv[2].split(',') : ['css-auto','proportional','min-height','tb-dp','tb-path'];
const set = process.argv[3] || null;
const Ws = [...new Set(all[0].results.map(r => r.W))];
const pct = x => (isNaN(x) ? '  —  ' : (100*x).toFixed(0).padStart(3)+'%');
console.log('W     ' + methods.map(m => m.padEnd(34)).join(''));
console.log('      ' + methods.map(() => 'short atom sevFrag scroll h/css  '.padEnd(34)).join(''));
for (const W of Ws) {
  let line = String(W).padEnd(6);
  for (const m of methods) {
    let s=0,sn=0,a=0,f=0,fn=0,sc=0,n=0,h=0;
    for (const c of all) { if (set && c.set!==set) continue; const r = c.results.find(x=>x.W===W&&x.method===m); const ref=c.results.find(x=>x.W===W&&x.method==='css-auto'); const M=r.metrics; s+=M.shortIntact; sn+=M.shortCells; a+=M.atomicBreaks; f+=M.severeFrag; fn+=M.longCells; sc+=M.overflowPx>0.5?1:0; n++; h+=M.heightPx/ref.metrics.heightPx; }
    line += `${pct(s/sn)} ${(a/n).toFixed(1).padStart(4)} ${pct(f/fn).padStart(6)}  ${pct(sc/n)}  ${(h/n).toFixed(2)}   `.padEnd(34);
  }
  console.log(line);
}
