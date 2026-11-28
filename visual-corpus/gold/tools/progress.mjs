// Progress of the Gold run per stage; exit code 0 only when every scenario is complete.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { G, safe, readJ } from './lib.mjs';
const man = readJ(join(G, 'manifest.json')), out = {};
for (const s of man.scenarios) {
  const st = readJ(join(G, 'runs', safe(s.id), 'state.json'));
  const done = st && st.verdict && (!st.verdict.top || (st.designs[st.verdict.top] || {}).auto || (st.landscape && st.landscape.variants && st.landscape.reviews.length >= 2 * Math.ceil(st.landscape.variants.length / 7)));
  const k = done ? 'complete' : !st ? 'not started' : st.verdict ? 'landscape' : st.synthFinal ? 'acceptance' : st.synth ? 'synthesis' : 'design';
  out[k] = (out[k] || 0) + 1;
}
console.log(JSON.stringify(out));
process.exitCode = out.complete === man.scenarios.length ? 0 : 1;
