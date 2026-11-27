// Turn run state into versioned Gold records: gold/corpus/<split>/<id>.json + screenshots.
// Geometry comes from the browser; judgements from the blind reviews; nothing here is decided by a model.
import { readdirSync, copyFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { G, safe, readJ, writeJ, lineSig, breakStats, GRADE, DIMS, mean } from './lib.mjs';

const VERSION = 'gold-v1';
const man = readJ(join(G, 'manifest.json'));
const PI = execSync('pi --version').toString().trim();
const frozen = readJ(join(G, 'corpus/holdout/FROZEN.json'));
let n = 0, skipped = [];
for (const s of man.scenarios) {
  const dir = join(G, 'runs', safe(s.id)), st = readJ(join(dir, 'state.json'));
  const out = join(G, 'corpus', s.split), imgOut = join(out, 'img'), rec = safe(s.id);
  if (frozen && (rec + '.json') in frozen.files) { skipped.push(s.id + ' (frozen)'); continue; }
  // a stale record (e.g. reviews superseded and not yet redone) is removed together with its images
  const clear = () => { if (existsSync(join(out, rec + '.json'))) unlinkSync(join(out, rec + '.json')); if (existsSync(imgOut)) for (const f of readdirSync(imgOut)) if (f.startsWith(rec + '__')) unlinkSync(join(imgOut, f)); };
  if (!st || !st.verdict || (st.verdict.top && !st.designs[st.verdict.top].auto && !(st.landscape && st.landscape.variants && st.landscape.reviews && st.landscape.reviews.length >= 2 * Math.ceil(st.landscape.variants.length / 7)))) { clear(); skipped.push(s.id); continue; }
  clear();
  mkdirSync(imgOut, { recursive: true });
  const t = readJ(join(G, 'tables', s.family + '.json'));
  const cp = f => { if (!f) return null; const to = `${rec}__${f}`; copyFileSync(join(dir, 'img', f), join(imgOut, to)); return `img/${to}`; };
  const geo = (d, withLines = true) => {
    const g = d.geom;
    return { requestedWidths: d.auto ? null : d.widths, colWidths: g.colWidths, tableWidth: g.tableWidth, tableHeight: g.tableHeight, rowHeights: g.rowHeights,
      cellLines: g.cells.map(c => [c.r, c.c, c.lines]), overflow: g.overflow, cls: g.overflow > 0.5 ? 'scroll' : 'fit', breaks: breakStats(g), cellOverflow: g.cellOverflow, clipped: g.clipped,
      ...(withLines ? { lineInfo: g.lineInfo } : {}) };
  };
  const V = st.verdict, acc = st.accept;
  const candidates = acc.pool.map(name => {
    const d = st.designs[name], c = V.candidates[name];
    const aliases = (acc.aliases || {})[name] || [];
    return { name, origin: d.by, origins: [...new Set([d.by, ...aliases.map(a => st.designs[a].by)])], idea: d.idea || null, aliases, label: c.label, ...geo(d),
      review: { grades: c.grades, medianGrade: c.medianGrade, scores: c.scores, meanScore: c.meanScore, goodVotes: c.goodVotes, bestVotes: c.best, dimMeans: c.dimMeans, dims: c.dims, whys: c.whys },
      screenshot: cp(d.png), viewport: cp(d.vp) };
  });
  // landscape
  let landscape = null;
  if (st.landscape && st.landscape.variants) {
    const L = st.landscape, ref = st.designs[L.ref];
    const per = {};
    for (const rv of L.reviews) {
      const gOf = nm => rv.ratings[rv.letters[rv.order.indexOf(nm)]];
      const r0 = gOf(L.ref);
      rv.order.forEach((nm, i) => {
        if (nm === L.ref) return;
        const x = rv.ratings[rv.letters[i]], indist = (rv.indistinguishable || []).some(gp => gp.includes(rv.letters[i]) && gp.includes(rv.letters[rv.order.indexOf(L.ref)]));
        (per[nm] = per[nm] || []).push({ grade: GRADE[x.grade], score: +x.score || null, dims: x.dims, why: x.why, refGrade: GRADE[r0.grade], refScore: +r0.score || null, dScore: (+x.score || 0) - (+r0.score || 0), dGrade: GRADE[x.grade] - GRADE[r0.grade], indistinguishableFromRef: indist, best: (rv.best || []).includes(rv.letters[i]) });
      });
    }
    landscape = {
      ref: L.ref, refGeometry: geo(ref, false), sensitivity: L.sensitivity, explored: L.explored,
      variants: L.variants.map(nm => { const d = st.designs[nm], r = per[nm] || [];
        return { name: nm, perturbation: d.perturbation, how: d.idea, why: d.why, sameLinesAsRef: lineSig(d.geom) === lineSig(ref.geom), sameLineCountsAsRef: d.geom.cells.map(c => c.lines).join() === ref.geom.cells.map(c => c.lines).join(), sameHeightAsRef: Math.abs(d.geom.tableHeight - ref.geom.tableHeight) < 0.5,
          l1FromRef: d.geom.colWidths.reduce((a, x, i) => a + Math.abs(x - ref.geom.colWidths[i]), 0), ...geo(d), ratings: r,
          meanDScore: mean(r.map(x => x.dScore)), meanDGrade: mean(r.map(x => x.dGrade)), screenshot: cp(d.png), viewport: cp(d.vp) }; }),
    };
  }
  const mapReview = rv => ({ order: rv.order, ratings: Object.fromEntries(rv.order.map((nm, i) => [nm, rv.ratings[rv.letters[i]]])), best: (rv.best || []).map(l => rv.order[rv.letters.indexOf(l)]), indistinguishable: (rv.indistinguishable || []).map(gp => gp.map(l => rv.order[rv.letters.indexOf(l)])), confidence: rv.confidence, unsure: rv.unsure });
  const sf = st.synthFinal, L2N = st.synth.letters;
  const models = {}; for (const f of readdirSync(dir).filter(f => /^log-/.test(f))) { const l = readJ(join(dir, f)); models[f.slice(4, -5)] = l.failed ? 'failed' : { model: l.model, thinking: l.thinking, imageScale: l.imageScale }; }
  const record = {
    version: VERSION, id: s.id, family: s.family, split: s.split, inheritedSplit: s.inheritedSplit, origin: s.origin, selection: { why: s.why, tags: s.tags, visualCorpus: s.vc },
    status: V.status, primaryClass: V.primaryClass, top: V.top, topOrigin: V.topOrigin, topOrigins: null,
    gold: candidates.filter(c => c.label === 'gold').map(c => c.name), byClass: V.byClass,
    table: { title: t.title, lang: t.lang, structure: t.structure, html: t.html || null, md: t.md || null, rowHeader: !!t.rowHeader, source: t.source, licence: t.licence || null, edits: t.edits || null, brief: t.brief || null },
    conditions: { availableWidth: s.W, fontSize: s.fs, policy: s.policy, budget: s.W - st.designs[acc.pool[0]].geom.tableExtra, css: 'src/table.css (padding 6px 10px, 1px borders, line-height 1.55)', browser: 'Chromium (Playwright build), macOS system fonts, deviceScaleFactor 1', contentFacts: { WminNoSplit: s.Wmin, WallOneLine: s.Wnat } },
    candidates,
    understanding: Object.fromEntries(Object.entries(st.chains).map(([k, c]) => [k, c.understanding])),
    synthesis: { letters: L2N, rounds: st.synth.rounds.map(r => ({ shown: r.shown, analysis: r.analysis, insights: r.insights, best: r.best, proposed: r.names })), stop: st.synth.stop,
      finalists: sf.finalists, acceptable: sf.acceptable, bad: sf.bad, contrast: sf.contrast, sameFunctionGroups: sf.same_function_groups, rationale: sf.rationale, principles: sf.principles, tradeoffs: sf.tradeoffs, uncertain: sf.uncertain },
    designHistory: Object.fromEntries(Object.entries(st.chains).map(([k, c]) => [k, { stop: c.stop, finalists: c.finalists, rounds: c.rounds.map(r => ({ designs: r.names, critique: r.critique || null, best: r.best || null })) }])),
    designs: Object.fromEntries(Object.entries(st.designs).filter(([nm]) => !/^L\d\d$/.test(nm)).map(([nm, d]) => [nm, { by: d.by, round: d.round ?? null, idea: d.idea || null, duplicateOf: d.duplicateOf || null, notes: d.notes || [], ...geo(d, false) }])),
    reviews: { acceptance: acc.reviews.map(mapReview), landscape: st.landscape ? st.landscape.reviews.map(rv => ({ batch: rv.batch, ...mapReview(rv) })) : [] },
    landscape,
    supersededReviews: acc.superseded ? { reason: acc.superseded.reason, acceptance: acc.superseded.reviews.map(mapReview), landscape: st.landscapeSuperseded ? { ref: st.landscapeSuperseded.ref, reviews: st.landscapeSuperseded.reviews.map(mapReview) } : null } : null,
    provenance: { pipeline: 'gold/tools/gold.mjs', reviewPrompt: acc.promptVersion || 'v1', landscapePrompt: st.landscape ? st.landscape.promptVersion || 'v1' : null, models, pi: PI, calls: Object.keys(models).length, created: new Date().toISOString(),
      note: 'AI visual design judgement (one model, independent fresh contexts); not cross-model validation, not human preference or reading data' },
  };
  record.topOrigins = (candidates.find(c => c.name === V.top) || {}).origins || null;
  // how many independent designers reached the same final layout (convergence)
  record.convergence = candidates.filter(c => c.origins.filter(o => /^d\d$/.test(o)).length > 1).map(c => ({ name: c.name, designers: c.origins.filter(o => /^d\d$/.test(o)) }));
  record.overview = cp('overview.png');
  writeJ(join(out, rec + '.json'), record);
  n++;
}
console.log('records written', n, '· not ready', skipped.length, skipped.slice(0, 8).join(' '));
