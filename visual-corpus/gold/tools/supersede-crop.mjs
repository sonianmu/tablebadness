// Renderer defect (fixed in tools/render-page.js): full-view screenshots of layouts wider than the viewport were cut at
// the viewport edge, so models never saw the scrolled part. Scenarios where a model saw such an image are redone:
//   - a scenario where any design overflowed: full redo (old run moved to runs/_superseded-crop/<id>, logs kept)
//   - otherwise, if a blind-review pool member overflowed (browser auto layout): reviews archived and redone
import { existsSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { G, safe, readJ, writeJ } from './lib.mjs';
const man = readJ(join(G, 'manifest.json')), full = [], reviews = [];
const REASON = 'renderer defect: full-view screenshots of layouts wider than the viewport were cut at the viewport edge (fixed); judgements that involved such images are redone';
for (const s of man.scenarios) {
  const dir = join(G, 'runs', safe(s.id)), st = readJ(join(dir, 'state.json')); if (!st) continue;
  const over = Object.entries(st.designs).filter(([n, d]) => d.geom && d.geom.overflow > 0.5);
  if (over.some(([n, d]) => !d.auto && n !== 'ref_equal')) {
    mkdirSync(join(G, 'runs/_superseded-crop'), { recursive: true });
    renameSync(dir, join(G, 'runs/_superseded-crop', safe(s.id)));
    writeJ(join(G, 'runs/_superseded-crop', safe(s.id), 'SUPERSEDED.json'), { reason: REASON, at: new Date().toISOString(), overflowingDesigns: over.map(([n]) => n) });
    full.push(s.id);
  } else if (over.length && st.accept) {
    st.accept.supersededCrop = { reason: REASON, reviews: st.accept.reviews, verdict: st.verdict };
    st.accept.reviews = []; delete st.verdict;
    if (st.landscape) { st.landscapeSupersededCrop = { ...st.landscape, reason: REASON }; delete st.landscape; }
    writeJ(join(dir, 'state.json'), st); reviews.push(s.id);
  }
}
console.log('full redo', full.length, full.join(' ')); console.log('reviews redo', reviews.length, reviews.join(' '));
