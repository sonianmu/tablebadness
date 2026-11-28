// Audit every Gold record against a fresh browser render. Writes gold/corpus/audit.json (records are not modified,
// so frozen holdout files stay untouched). Checks geometry consistency, visibility, word integrity, grid integrity,
// scroll state, screenshot completeness/legibility, review-text vs measured-geometry consistency, candidate distinctness.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { openRenderer } from '../../tools/render.mjs';
import { G, readJ, writeJ } from './lib.mjs';

const R = await openRenderer();
const pngSize = p => { const b = readFileSync(p); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
const sig = li => (li || []).map(ls => ls.map(l => l.text).join('│')).join('␞');
const CLIP_WORDS = /clipp|cut off|truncat|overlap|hidden|obscur|截断|裁切|裁剪|遮挡|重叠|被切|看不到|显示不全/i;
const SCROLL_WORDS = /scroll|overflow|exceed|beyond the (viewport|box)|too wide|滚动|溢出|超出|超过/i;
const out = { generated: new Date().toISOString(), records: {} };
let nIssues = 0;
for (const split of ['research', 'validation', 'holdout']) {
  const d = join(G, 'corpus', split); if (!existsSync(d)) continue;
  for (const f of readdirSync(d).filter(f => f.endsWith('.json') && f !== 'FROZEN.json')) {
    const r = readJ(join(d, f)), issues = [], notes = [];
    const src = { lang: r.table.lang, html: r.table.html, md: r.table.md, rowHeader: r.table.rowHeader };
    const scroll = r.conditions.policy === 'scroll-allowed';
    // grid integrity from the source markup
    const h = r.table.html || '';
    const srcCells = h ? (h.match(/<t[dh][\s>]/g) || []).length : null;
    const layouts = [...r.candidates.map(c => ({ ...c, kind: 'candidate' })), ...((r.landscape && r.landscape.variants) || []).map(v => ({ ...v, kind: 'landscape' }))];
    for (const c of layouts) {
      const g = await R.render({ src, W: r.conditions.availableWidth, fs: r.conditions.fontSize, widths: c.requestedWidths, lines: true }, null);
      const tag = `${c.kind} ${c.name}`;
      if (g.colWidths.some((x, i) => Math.abs(x - c.colWidths[i]) > 0.5)) issues.push(`${tag}: column widths differ on re-render`);
      if (g.rowHeights.some((x, i) => Math.abs(x - c.rowHeights[i]) > 0.5)) issues.push(`${tag}: row heights differ on re-render`);
      if (c.lineInfo && sig(g.lineInfo) !== sig(c.lineInfo)) issues.push(`${tag}: line breaks differ on re-render`);
      if (g.cellOverflow || g.clipped) issues.push(`${tag}: content overflows a cell (${g.cellOverflow} cells, ${g.clipped} clipped)`);
      // every line box inside its cell's content box
      g.cells.forEach((cell, i) => {
        const w = g.colWidths.slice(cell.c, cell.c + cell.cs).reduce((a, b) => a + (b || 0), 0);
        for (const l of g.lineInfo[i]) if (l.x + l.w > w - 9 + 1 || l.x < 9) { issues.push(`${tag}: a line of cell r${cell.r}c${cell.c} leaves its content box`); break; }
      });
      if (srcCells != null && g.cells.length !== srcCells) issues.push(`${tag}: ${g.cells.length} cells rendered, ${srcCells} in source`);
      if (!scroll && g.overflow > 0.5 && c.name !== 'ref_auto') issues.push(`${tag}: wider than a fit-only viewport by ${g.overflow}px`);
      if (!scroll && g.overflow > 0.5 && c.name === 'ref_auto') notes.push(`browser auto layout overflows a fit-only viewport by ${g.overflow}px`);
      const intra = g.lineInfo.flat().filter(l => l.brk === 'intra-word').length;
      if (c.kind === 'candidate' && c.label === 'gold' && intra) notes.push(`gold layout ${c.name} has ${intra} measured break(s) inside a word`);
      // screenshots
      for (const [k, p] of [['screenshot', c.screenshot], ['viewport', c.viewport]]) {
        if (!p) { if (k === 'viewport' && scroll && g.overflow > 0.5) issues.push(`${tag}: scrolling layout without a viewport image`); continue; }
        const fp = join(d, p); if (!existsSync(fp)) { issues.push(`${tag}: missing ${k} file`); continue; }
        const s = pngSize(fp);
        if (k === 'screenshot' && (s.w < Math.min(g.tableWidth, 4000) + 16 || s.h < g.tableHeight + 16)) issues.push(`${tag}: screenshot ${s.w}×${s.h} smaller than table ${Math.round(g.tableWidth)}×${Math.round(g.tableHeight)}`);
        if (k === 'viewport' && s.w > r.conditions.availableWidth + 40) issues.push(`${tag}: viewport image wider than the viewport`);
      }
      // review text vs geometry
      if (c.kind === 'candidate') c.review.whys.forEach((w, k) => {
        if (CLIP_WORDS.test(w || '') && !g.cellOverflow && !g.clipped) notes.push(`reviewer ${k} mentions clipping/overlap for ${c.name}; none measured: "${String(w).slice(0, 140)}"`);
        // negated mentions ("without horizontal scrolling", "no scrolling", "无需滚动") are not claims
        const claim = String(w || '').replace(/(without|no|not|never|avoid\w*|无需|不需|不必|无|没有)\s+(any\s+|the\s+need\s+(for|to)\s+)?(horizontal\s+)?(scroll\w*|横向滚动|滚动)/gi, '');
        if (SCROLL_WORDS.test(claim) && g.overflow <= 0.5 && /scroll|exceed|too wide|滚动|超出|超过/i.test(claim)) issues.push(`reviewer ${k} says ${c.name} scrolls/exceeds the width but it fits (measured): "${String(w).slice(0, 140)}"`);
      });
    }
    // distinct candidates
    for (let i = 0; i < r.candidates.length; i++) for (let j = i + 1; j < r.candidates.length; j++) {
      const a = r.candidates[i], b = r.candidates[j];
      if (sig(a.lineInfo) === sig(b.lineInfo) && a.colWidths.every((x, k) => Math.abs(x - b.colWidths[k]) <= 3)) issues.push(`candidates ${a.name} and ${b.name} are visually identical`);
    }
    // legibility of model inputs
    const scales = Object.values(r.provenance.models).map(m => m && m.imageScale).filter(Boolean);
    const minPx = r.conditions.fontSize * Math.min(1, ...scales);
    if (minPx < 10) issues.push(`model saw text at ${minPx.toFixed(1)}px (below 10px)`);
    out.records[r.id] = { split, status: r.status, issues, notes };
    nIssues += issues.length;
  }
}
await R.close();
out.summary = { records: Object.keys(out.records).length, withIssues: Object.values(out.records).filter(x => x.issues.length).length, issues: nIssues, notes: Object.values(out.records).reduce((a, x) => a + x.notes.length, 0) };
writeJ(join(G, 'corpus', 'audit.json'), out);
console.log(JSON.stringify(out.summary));
for (const [id, x] of Object.entries(out.records)) if (x.issues.length) console.log(id, x.issues.slice(0, 4));
