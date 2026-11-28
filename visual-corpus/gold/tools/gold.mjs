// Gold Reference pipeline, one scenario at a time, every step persisted (re-running resumes):
//   1. three independent designers (fresh contexts, different starting points, own render→critique→revise loops)
//   2. synthesis: anonymised comparison of all designers' finalists, new combined designs, render→critique loops
//   3. acceptance: three fresh blind reviewers over finalists + earlier references + neutral baselines
//   4. landscape: controlled width perturbations around the best layout, measured, then rated blind
//   node gold/tools/gold.mjs [--split s1,s2] [--only id1,id2] [--limit N] [--jobs 4] [--stage design|synth|accept|landscape]
import { readFileSync, mkdirSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ask, MODEL, THINKING, SCALE } from '../../tools/pi.mjs';
import { openRenderer } from '../../tools/render.mjs';
import { pool } from '../../tools/pool.mjs';
import { G, VC, safe, readJ, writeJ, locked, shuffle, geomText, describe, QUALITY, PERSONA, normalize, lineSig, lineCounts, breakStats, GRADE, DIMS, median, mean } from './lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const JOBS = +arg('jobs', 4), STAGE_LIMIT = arg('stage', 'landscape');
const STAGES = ['design', 'synth', 'accept', 'landscape'];
const MAX_DESIGN_ROUNDS = 5, MAX_SYNTH_ROUNDS = 3, N_DESIGNERS = 3, N_REVIEWERS = 3;
const man = readJ(join(G, 'manifest.json'));
let todo = man.scenarios;
if (arg('split')) todo = todo.filter(s => arg('split').split(',').includes(s.split));
if (arg('only')) todo = todo.filter(s => arg('only').split(',').includes(s.id));
if (arg('limit')) todo = todo.slice(0, +arg('limit'));
const LENS = {
  d1: 'Start from the reader: list the real tasks (look-up, comparison, sequential reading) and let them decide what deserves space.',
  d2: 'Start from the space: the proportions and rhythm of the column widths, alignment, white space and how the table sits in the viewport.',
  d3: 'Start from the content: the semantic units that must stay whole, which text is prose, and the structural roles of headers, row labels and groups.',
};
const same = (a, b) => lineSig(a) === lineSig(b) && a.colWidths.every((x, i) => Math.abs(x - b.colWidths[i]) <= 3);

async function runScenario(s, R) {
  const dir = join(G, 'runs', safe(s.id)), img = join(dir, 'img');
  mkdirSync(img, { recursive: true });
  const state = readJ(join(dir, 'state.json')) || { id: s.id, designs: {}, chains: {}, models: {} };
  const save = () => writeJ(join(dir, 'state.json'), state);
  const t = readJ(join(G, 'tables', s.family + '.json')), src = { lang: t.lang, html: t.html, md: t.md, rowHeader: t.rowHeader };
  const scroll = s.policy === 'scroll-allowed';
  const track = key => m => { state.models[key] = m; };
  const call = (key, o) => ask({ ...o, logPath: join(dir, `log-${key}.json`), onModel: track(key) });

  const ovPng = join(img, 'overview.png');
  const gNat = await R.render({ src, W: s.W, fs: s.fs, natural: true, ruler: false, label: 'Content overview — every cell on one line (not a layout proposal)' }, ovPng);
  const desc = describe(s, t, gNat);

  // render a design under its own name (for its designer) — full view (+ viewport view when it scrolls)
  async function renderDesign(name, widths, meta = {}) {
    const p = join(img, `${name}.png`), vp = join(img, `${name}.vp.png`);
    const g = await R.render({ src, W: s.W, fs: s.fs, widths, lines: true, label: meta.label || `Design ${name}`, viewportPng: scroll ? vp : undefined }, p);
    state.designs[name] = { ...(state.designs[name] || {}), ...meta, widths, geom: g, png: `${name}.png`, vp: scroll && g.overflow > 0.5 ? `${name}.vp.png` : null };
    return state.designs[name];
  }
  // render any design under an anonymous label for a blind/comparison call
  async function renderAnon(name, label, file) {
    const d = state.designs[name];
    const p = join(img, `${file}.png`), vp = join(img, `${file}.vp.png`);
    const g = await R.render({ src, W: s.W, fs: s.fs, widths: d.auto ? null : d.widths, lines: true, label, viewportPng: scroll ? vp : undefined }, p);
    return { imgs: [p, ...(scroll && g.overflow > 0.5 ? [vp] : [])], g };
  }
  const imagesOf = names => names.flatMap(n => [join(img, state.designs[n].png), ...(state.designs[n].vp ? [join(img, state.designs[n].vp)] : [])]);
  const imageGuide = (pairs) => pairs.map(([label, d]) => `${label}${d.vp ? ' (full view, then viewport view)' : ''}`).join(', ');
  const findDup = (g, except, by) => Object.entries(state.designs).find(([n, d]) => n !== except && d.geom && !d.auto && (!by || d.by === by) && same(d.geom, g));

  // ============ 1. independent designers ============
  async function designer(k) {
    const id = 'd' + k, ch = state.chains[id] = state.chains[id] || { rounds: [] };
    if (ch.done) return;
    if (!ch.rounds.length) {
      const j = await call(`${id}-r0`, {
        images: [ovPng],
        prompt: `${PERSONA}\n\n${QUALITY}\n\n${desc}\n\nThe image shows every cell on one line so you can read all content.\n${LENS[id]}\n\nFirst understand the table:\n- its purpose and the reader's actual tasks;\n- semantic relations between pieces of information;\n- the structural role of each row, column and header;\n- what must stay whole and what may wrap naturally;\n- which elements should share a similar visual scale and which should differ;\n- the trade-off between horizontal and vertical space here.\nThen propose 3 designs that are SUBSTANTIALLY different spatial strategies (not small adjustments of one layout).${scroll ? ' Include at least one that fits the viewport and one that scrolls.' : ''}\nReply ONLY JSON: {"understanding":{"purpose":"","tasks":[""],"relations":[""],"roles":[""],"keep_whole":[""],"may_wrap":[""],"same_scale":[""],"h_vs_v":""},"designs":[{"widths":[int px per column, column 1 first],"strategy":"one sentence"}]}`,
        validate: x => (Array.isArray(x.designs) && x.designs.length >= 2 && x.understanding ? null : 'need understanding and designs[]'),
      });
      ch.understanding = j.understanding;
      const names = [];
      for (const [i, d] of j.designs.slice(0, 4).entries()) {
        const name = `${id}r0${'ABCD'[i]}`, n = normalize(d.widths, s, gNat);
        const D = await renderDesign(name, n.widths, { by: id, round: 0, idea: d.strategy, notes: n.notes });
        const dup = findDup(D.geom, name, id); if (dup) D.duplicateOf = dup[0];
        names.push(name);
      }
      ch.rounds.push({ names }); save();
    }
    while (!ch.done && ch.rounds.length <= MAX_DESIGN_ROUNDS) {
      const r = ch.rounds.length, last = ch.rounds[r - 1];
      const best = (last.best || []).filter(n => state.designs[n] && !last.names.includes(n)).slice(0, 2);
      const show = [...last.names.filter(n => !state.designs[n].duplicateOf), ...best];
      if (!show.length) { ch.done = true; break; }
      const notes = show.map(n => (state.designs[n].notes || []).length ? `${n}: ${state.designs[n].notes.join('; ')}` : '').filter(Boolean).join('\n');
      const j = await call(`${id}-r${r}`, {
        images: [ovPng, ...imagesOf(show)],
        prompt: `${PERSONA}\n\n${QUALITY}\n\n${desc}\n\nYour understanding: ${JSON.stringify(ch.understanding)}\n\nImage 1 is the one-line content overview. Then real browser renders of: ${imageGuide(show.map(n => [n, state.designs[n]]))}.\nMeasured facts:\n${show.map(n => geomText(n, state.designs[n].geom, s.policy, s.W)).join('\n')}${notes ? '\nConstraint adjustments applied by code: ' + notes : ''}\n\nLook at each render as a whole and in detail. For each design: what works, what is visually wrong, and the cause (which width). ${r === 1 ? 'This is your first look at real renders: propose at least one improved or alternative design (refine the most promising, fix what you saw, or test an important idea you have not tried). "done" is not allowed yet.' : 'Then either propose up to 3 improved designs (refine the most promising, fix what you saw, or try an important unexplored idea) or, if further changes would not bring a meaningful improvement, set "done": true.'} Do not resubmit near-identical widths.\nReply ONLY JSON: {"critique":[{"design":"name","good":"","problems":"","cause":""}],"best":["your best design name(s) so far"],"done":false,"designs":[{"widths":[int px],"change":"what and why"}]}`,
        validate: x => (Array.isArray(x.critique) && Array.isArray(x.best) && x.best.every(n => state.designs[n]) ? (r === 1 && !(x.designs || []).length ? 'round 1 must propose at least one design' : null) : 'need critique[] and best[] naming shown designs: ' + show.join(',')),
      });
      if (r === 1) j.done = false;
      last.critique = j.critique; last.best = j.best;
      const names = [];
      if (!j.done) for (const [i, d] of (j.designs || []).slice(0, 3).entries()) {
        const name = `${id}r${r}${'ABC'[i]}`, n = normalize(d.widths, s, gNat);
        const D = await renderDesign(name, n.widths, { by: id, round: r, idea: d.change, notes: n.notes });
        const dup = findDup(D.geom, name, id); if (dup) D.duplicateOf = dup[0];
        names.push(name);
      }
      const fresh = names.filter(n => !state.designs[n].duplicateOf);
      if (j.done || !fresh.length) { ch.done = true; ch.finalists = j.best.slice(0, 2); ch.stop = j.done ? 'designer declared no further improvement' : 'only duplicates proposed'; }
      else ch.rounds.push({ names, best: j.best });
      if (!ch.done && ch.rounds.length > MAX_DESIGN_ROUNDS) { ch.done = true; ch.finalists = j.best.slice(0, 2); ch.stop = 'round cap'; }
      save();
    }
  }
  await Promise.all(Array.from({ length: N_DESIGNERS }, (_, i) => designer(i + 1)));
  for (const c of Object.values(state.chains)) if (!c.done || !c.finalists) { c.done = true; c.finalists = c.finalists || (c.rounds.at(-1).best || c.rounds.at(-1).names).slice(0, 2); c.stop = c.stop || 'round cap'; }
  save();
  if (STAGES.indexOf(STAGE_LIMIT) < 1) return state;

  // ============ 2. synthesis ============
  const sy = state.synth = state.synth || { rounds: [] };
  const designerFinalists = [...new Set(Object.values(state.chains).flatMap(c => c.finalists || []))].filter(n => state.designs[n]);
  if (!sy.letters) {
    const uniq = [];
    for (const n of designerFinalists) if (!uniq.some(u => same(state.designs[u].geom, state.designs[n].geom))) uniq.push(n);
    const order = shuffle(uniq, s.id + 'synth');
    sy.letters = Object.fromEntries(order.map((n, i) => ['PQRSTUVW'[i], n]));
    save();
  }
  const L2N = sy.letters, N2L = Object.fromEntries(Object.entries(L2N).map(([l, n]) => [n, l]));
  const label = n => N2L[n] ? `Layout ${N2L[n]}` : n;
  async function anonImgs(names, tag) {
    const out = [];
    for (const n of names) {
      if (N2L[n]) { const { imgs } = await renderAnon(n, `Layout ${N2L[n]}`, `${tag}-${N2L[n]}`); out.push(...imgs); }
      else out.push(...imagesOf([n]));
    }
    return out;
  }
  const facts = names => names.map(n => geomText(label(n), state.designs[n].geom, s.policy, s.W)).join('\n');
  while (!sy.done && sy.rounds.length <= MAX_SYNTH_ROUNDS) {
    const r = sy.rounds.length;
    const prev = sy.rounds[r - 1];
    const show = r === 0 ? Object.values(L2N) : [...new Set([...prev.names.filter(n => !state.designs[n].duplicateOf), ...(prev.best || []).filter(n => state.designs[n])])].slice(0, 6);
    const imgs = await anonImgs(show, `syn${r}`);
    const intro = r === 0
      ? `Several designers worked independently on this table. You see their final layouts, anonymised as ${Object.keys(L2N).map(l => 'Layout ' + l).join(', ')}, in that order after the overview: ${imageGuide(show.map(n => [label(n), state.designs[n]]))}.`
      : `You are continuing your synthesis. Shown after the overview: ${imageGuide(show.map(n => [label(n), state.designs[n]]))}.`;
    const j = await call(`syn-r${r}`, {
      images: [ovPng, ...imgs],
      prompt: `${PERSONA}\n\n${QUALITY}\n\n${desc}\n\n${intro}\nMeasured facts:\n${facts(show)}\n\n${r === 0
        ? 'Compare them side by side. For each layout name its strengths, its faults and the spatial logic behind it (how it distributes space and why). Do not just pick a winner: you may combine the strengths of several layouts, propose something new, or overturn all of them. Propose up to 3 new designs that you expect to be better than every layout shown; if you believe one shown layout cannot be improved, say so in "best" and propose fewer or none.'
        : 'Look again at the renders. Critique each, then propose up to 3 further refinements, or set "done": true if further changes would not bring a meaningful improvement.'}\nReply ONLY JSON: {"analysis":[{"layout":"name","strengths":"","faults":"","spatial_logic":""}],"insights":"what the comparison teaches about this table","best":["names of the best layout(s) so far"],"done":false,"designs":[{"widths":[int px],"idea":"what it combines or changes, and why"}]}`,
      validate: x => (Array.isArray(x.analysis) && Array.isArray(x.best) && x.best.every(n => L2N[n.replace(/^Layout /, '')] || state.designs[n]) ? null : 'best[] must name shown layouts/designs: ' + show.map(label).join(',')),
    });
    const best = j.best.map(n => L2N[n.replace(/^Layout /, '')] || n);
    const names = [];
    if (!j.done) for (const [i, d] of (j.designs || []).slice(0, 3).entries()) {
      const name = `s${r}${'ABC'[i]}`, n = normalize(d.widths, s, gNat);
      const D = await renderDesign(name, n.widths, { by: 'synth', round: r, idea: d.idea, notes: n.notes });
      const dup = findDup(D.geom, name); if (dup) D.duplicateOf = dup[0];
      names.push(name);
    }
    sy.rounds.push({ shown: show, analysis: j.analysis, insights: j.insights, best, names });
    if (j.done || !names.some(n => !state.designs[n].duplicateOf) || sy.rounds.length > MAX_SYNTH_ROUNDS) { sy.done = true; sy.stop = j.done ? 'declared no further improvement' : names.length ? 'only duplicates / round cap' : 'no new designs'; }
    save();
  }
  if (!state.synthFinal) {
    const lastBest = sy.rounds.at(-1).best;
    const synthNames = sy.rounds.flatMap(r => r.names).filter(n => !state.designs[n].duplicateOf);
    const show = [...new Set([...lastBest, ...synthNames.slice(-3), ...Object.values(L2N)])].slice(0, 9);
    const imgs = await anonImgs(show, 'synF');
    const j = await call('syn-final', {
      images: [ovPng, ...imgs],
      prompt: `${PERSONA}\n\n${QUALITY}\n\n${desc}\n\nCandidate layouts, rendered in a real browser, shown after the overview: ${imageGuide(show.map(n => [label(n), state.designs[n]]))}.\nMeasured facts:\n${facts(show)}\n\nDecide as the responsible designer:\n- "finalists": up to 3 layouts you would submit for independent acceptance, best first (more than one only if genuinely different and comparably good${scroll ? '; include the best fitting AND the best scrolling layout' : ''});\n- "acceptable": others a careful designer would still publish;\n- "bad": layouts with clear faults, each with the fault;\n- "contrast": ONE deliberately flawed but plausible layout (widths) that a hurried designer might produce, and what is wrong with it;\n- "same_function_groups": groups of columns (1-based) that play the same role, and whether they should share a scale here;\n- "rationale" (2–4 concrete sentences), "principles" {general: [likely to hold for other tables], specific: [this case only]}, "tradeoffs", "uncertain".\nReply ONLY JSON: {"finalists":["name"],"acceptable":["name"],"bad":[{"layout":"name","why":""}],"contrast":{"widths":[int px],"why":""},"same_function_groups":[{"columns":[1,2],"same_scale":true,"why":""}],"rationale":"","principles":{"general":[""],"specific":[""]},"tradeoffs":"","uncertain":""}`,
      validate: x => (Array.isArray(x.finalists) && (x.finalists.length || (Array.isArray(x.bad) && x.bad.length)) && x.finalists.every(n => L2N[n.replace(/^Layout /, '')] || state.designs[n]) ? null : 'finalists must name shown layouts: ' + show.map(label).join(',')),
    });
    const toName = n => L2N[String(n).replace(/^Layout /, '')] || n;
    j.finalists = j.finalists.map(toName); j.acceptable = (j.acceptable || []).map(toName).filter(n => state.designs[n]);
    j.bad = (j.bad || []).map(b => ({ ...b, layout: toName(b.layout) })).filter(b => state.designs[b.layout]);
    if (j.contrast && Array.isArray(j.contrast.widths)) {
      const n = normalize(j.contrast.widths, s, gNat);
      await renderDesign('contrast', n.widths, { by: 'synth', idea: j.contrast.why, notes: n.notes });
    }
    // a designer may refuse every candidate: recorded as a failure case; the least-bad layout still goes to blind review
    if (!j.finalists.length) { j.noFinalist = true; j.leastBad = j.bad[0] && j.bad[0].layout; }
    state.synthFinal = j; save();
  }
  if (STAGES.indexOf(STAGE_LIMIT) < 2) return state;

  // ============ 3. blind acceptance ============
  const acc = state.accept = state.accept || { reviews: [] };
  if (!acc.pool) {
    const want = [...state.synthFinal.finalists.slice(0, 3), ...(state.synthFinal.leastBad ? [state.synthFinal.leastBad] : [])];
    for (const c of Object.values(state.chains)) if (c.finalists && c.finalists[0]) want.push(c.finalists[0]);
    // the earlier Visual-Corpus preferred layout (hidden among the others), contrast, neutral baselines
    if (s.vc) {
      const v = readJ(join(VC, 'corpus', s.vc.file));
      if (v && v.preferred[0]) { if (!state.designs.vc_pref) await renderDesign('vc_pref', v.preferred[0].requestedWidths || v.preferred[0].colWidths, { by: 'visual-corpus-v1' }); want.push('vc_pref'); }
    }
    if (state.designs.contrast) want.push('contrast');
    if (!state.designs.ref_auto) { const g = await R.render({ src, W: s.W, fs: s.fs, widths: null, lines: true, label: 'Design ref_auto', viewportPng: scroll ? join(img, 'ref_auto.vp.png') : undefined }, join(img, 'ref_auto.png')); state.designs.ref_auto = { by: 'browser table-layout:auto', auto: true, widths: g.colWidths, geom: g, png: 'ref_auto.png', vp: scroll && g.overflow > 0.5 ? 'ref_auto.vp.png' : null }; }
    if (!state.designs.ref_equal) { const eq = Math.floor((s.W - gNat.tableExtra) / gNat.nCols); await renderDesign('ref_equal', normalize(Array(gNat.nCols).fill(eq), s, gNat).widths, { by: 'equal widths' }); }
    want.push('ref_auto', 'ref_equal');
    const poolN = [], aliases = {};
    for (const n of want) {
      const hit = poolN.find(p => same(state.designs[p].geom, state.designs[n].geom));
      if (hit) { if (hit !== n) (aliases[hit] = aliases[hit] || []).includes(n) || aliases[hit].push(n); } else poolN.push(n);
    }
    acc.pool = poolN.slice(0, 10); acc.aliases = aliases; save();
  }
  // v1 review prompt stated the budget as a column sum but reported table width incl. border: a layout exactly as wide
  // as the viewport could be misread as too wide. Such reviews are archived and redone under prompt v2.
  const fillsViewport = names => names.some(n => state.designs[n] && state.designs[n].geom.overflow <= 0.5 && Math.abs(state.designs[n].geom.tableWidth - s.W) < 1.5);
  if (acc.reviews.length && acc.promptVersion !== 'v2' && fillsViewport(acc.pool)) {
    acc.superseded = { reviews: acc.reviews, verdict: state.verdict, reason: 'review prompt v1: width limit stated as column sum while table width (incl. border) was reported; a layout exactly filling the viewport could be misread as too wide' };
    acc.reviews = []; delete state.verdict;
    if (state.landscape) { state.landscapeSuperseded = { ...state.landscape, reason: acc.superseded.reason }; delete state.landscape; }
    save();
  }
  if (!acc.reviews.length) acc.promptVersion = 'v2';
  for (let k = acc.reviews.length; k < N_REVIEWERS; k++) {
    const order = shuffle(acc.pool, s.id + 'accept' + k), letters = order.map((_, i) => String.fromCharCode(65 + i));
    const imgs = [], guide = [];
    for (const [i, n] of order.entries()) { const { imgs: im } = await renderAnon(n, `Layout ${letters[i]}`, `acc${k}-${letters[i]}`); imgs.push(...im); guide.push(`Layout ${letters[i]}${im.length > 1 ? ' (full view, then viewport view)' : ''}`); }
    const j = await call(`accept-${k}`, {
      images: [ovPng, ...imgs],
      prompt: reviewPrompt(desc, guide, order.map((n, i) => geomText('Layout ' + letters[i], state.designs[n].geom, s.policy, s.W)), letters, scroll),
      validate: x => (x.ratings && letters.every(l => x.ratings[l] && GRADE[x.ratings[l].grade]) && Array.isArray(x.best) ? null : 'need a valid grade for every layout ' + letters.join(',')),
    });
    acc.reviews.push({ order, letters, ...j }); save();
  }
  state.verdict = verdict(state, s); save();
  if (STAGES.indexOf(STAGE_LIMIT) < 3) return state;

  // ============ 4. quality landscape around the best layout ============
  const top = state.verdict.top;
  if (!top || state.designs[top].auto) return state; // nothing designed to explore around
  if (state.landscape && state.landscape.promptVersion !== 'v2' && state.landscape.reviews.length && fillsViewport([state.landscape.ref, ...(state.landscape.variants || [])])) {
    state.landscapeSuperseded = { ...state.landscape, reason: 'review prompt v1 (see accept.superseded)' }; delete state.landscape; save();
  }
  const ls = state.landscape = state.landscape || { ref: top, reviews: [], promptVersion: 'v2' };
  if (!ls.variants) {
    const ref = state.designs[top], w0 = ref.geom.colWidths.map(Math.round), T = w0.reduce((a, b) => a + b, 0), n = w0.length;
    const minCol = 21 + Math.ceil(s.fs * 1.1), gRef = ref.geom;
    const measure = async w => R.render({ src, W: s.W, fs: s.fs, widths: w, lines: true }, null);
    const all = [];
    const add = async (w, type, how) => {
      if (w.some(x => x < minCol) || w.every((x, i) => x === w0[i])) return null;
      const g = await measure(w); const v = { w, type, how, g }; all.push(v); return v;
    };
    // (a) adjacent transfers at constant total
    for (let j = 0; j < n - 1; j++) for (const f of [0.1, 0.25]) {
      const d = Math.max(4, Math.round(f * Math.min(w0[j], w0[j + 1])));
      for (const sg of [1, -1]) { const w = w0.slice(); w[j] -= sg * d; w[j + 1] += sg * d; await add(w, 'adjacent', `col ${j + 1} ${sg > 0 ? '−' : '+'}${d}px → col ${j + 2}`); }
    }
    // (b) same-function groups: equalise / exaggerate asymmetry inside the group, group total kept
    for (const grp of (state.synthFinal.same_function_groups || []).slice(0, 3)) {
      const idx = (grp.columns || []).map(c => c - 1).filter(c => c >= 0 && c < n); if (idx.length < 2) continue;
      const sum = idx.reduce((a, c) => a + w0[c], 0), w = w0.slice();
      idx.forEach((c, i) => { w[c] = Math.floor(sum / idx.length) + (i < sum % idx.length ? 1 : 0); });
      await add(w, 'group-equalise', `columns ${idx.map(c => c + 1).join(',')} equal (group total kept)`);
      const w2 = w0.slice(), d = Math.round(0.15 * Math.min(...idx.map(c => w0[c]))); w2[idx[0]] += d; w2[idx[1]] -= d;
      await add(w2, 'group-skew', `columns ${idx[0] + 1}/${idx[1] + 1} ±${d}px inside the group`);
    }
    // (c) row header vs body
    if (gRef.cells.some(c => c.role === 'row')) {
      const rh = 0; // logical first column (also in RTL tables)
      for (const f of [-0.2, 0.2]) {
        const d = Math.round(f * w0[rh]), rest = T - w0[rh], w = w0.map((x, i) => i === rh ? x + d : Math.round(x - d * x / rest));
        w[w.findIndex((_, i) => i !== rh)] += T - w.reduce((a, b) => a + b, 0);
        await add(w, 'rowheader-share', `row-header column ${f > 0 ? '+' : ''}${d}px, body proportionally`);
      }
    }
    // (d) seeded random redistributions at constant total
    let seed = [...s.id].reduce((a, c) => (a * 33 + c.charCodeAt(0)) % 2147483647, 11) || 1;
    const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    for (let k = 0; k < 48; k++) {
      const amp = k < 24 ? 0.12 : 0.3, raw = w0.map(x => x * (1 + amp * (rnd() * 2 - 1))), f = T / raw.reduce((a, b) => a + b, 0);
      const w = raw.map(x => Math.round(x * f)); w[w.indexOf(Math.max(...w))] += T - w.reduce((a, b) => a + b, 0);
      await add(w, 'random', `random redistribution ±${amp * 100}% (total kept)`);
    }
    // (e) sensitivity: smallest transfer out of each column (to its neighbour) that changes any cell's line count
    const sens = [];
    for (let j = 0; j < n; j++) {
      const nb = j < n - 1 ? j + 1 : j - 1, maxD = w0[j] - minCol;
      if (maxD < 1) { sens.push({ col: j + 1, shrinkToChange: null }); continue; }
      const changed = async d => { const w = w0.slice(); w[j] -= d; w[nb] += d; return lineCounts(await measure(w)) !== lineCounts(gRef); };
      if (!(await changed(maxD))) { sens.push({ col: j + 1, to: nb + 1, shrinkToChange: null, robustUpTo: maxD }); continue; }
      let lo = 0, hi = maxD; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (await changed(m)) hi = m; else lo = m; }
      sens.push({ col: j + 1, to: nb + 1, shrinkToChange: hi });
    }
    const fr = sens.filter(x => x.shrinkToChange).sort((a, b) => a.shrinkToChange - b.shrinkToChange)[0];
    if (fr) for (const d of [fr.shrinkToChange - 1, fr.shrinkToChange]) if (d > 0) { const w = w0.slice(); w[fr.col - 1] -= d; w[fr.to - 1] += d; await add(w, d === fr.shrinkToChange ? 'cliff-after' : 'cliff-before', `col ${fr.col} −${d}px → col ${fr.to} (first line-count change at ${fr.shrinkToChange}px)`); }
    // pick the research-relevant subset
    const L1 = v => v.w.reduce((a, x, i) => a + Math.abs(x - w0[i]), 0);
    const eqH = v => Math.abs(v.g.tableHeight - gRef.tableHeight) < 0.5;
    const chosen = [];
    const pick = (v, why) => { if (v && !chosen.some(c => c.w.every((x, i) => Math.abs(x - v.w[i]) <= 2))) chosen.push({ ...v, why }); };
    const twins = all.filter(v => lineSig(v.g) === lineSig(gRef) && eqH(v)).sort((a, b) => L1(b) - L1(a));
    pick(twins[0], 'metric twin: identical line breaks, height and width; only white space moves'); pick(twins.find(v => v !== twins[0] && L1(v) > 0.5 * L1(twins[0])), 'metric twin (second)');
    const near = all.filter(v => lineCounts(v.g) === lineCounts(gRef) && eqH(v) && lineSig(v.g) !== lineSig(gRef)).sort((a, b) => L1(b) - L1(a));
    pick(near[0], 'near twin: same line counts and height, different break positions');
    for (const v of all.filter(v => v.type.startsWith('cliff'))) pick(v, 'critical point of the most fragile column');
    for (const v of all.filter(v => v.type.startsWith('group') || v.type === 'rowheader-share')) pick(v, v.type);
    const changing = all.filter(v => v.type === 'adjacent' && lineCounts(v.g) !== lineCounts(gRef)).sort((a, b) => L1(a) - L1(b));
    const stable = all.filter(v => v.type === 'adjacent' && lineCounts(v.g) === lineCounts(gRef)).sort((a, b) => L1(b) - L1(a));
    for (let i = 0; chosen.length < 14 && (i < changing.length || i < stable.length); i++) { pick(stable[i], 'adjacent transfer, line counts unchanged'); if (chosen.length < 14) pick(changing[i], 'adjacent transfer, line counts change'); }
    const bigRandom = all.filter(v => v.type === 'random').sort((a, b) => L1(b) - L1(a));
    for (const v of bigRandom) { if (chosen.length >= 14) break; pick(v, 'random redistribution'); }
    ls.explored = all.map(v => ({ w: v.w, type: v.type, how: v.how, lineCounts: lineCounts(v.g), sameLines: lineSig(v.g) === lineSig(gRef), height: v.g.tableHeight, intraWord: breakStats(v.g).intraWord }));
    ls.sensitivity = sens;
    ls.variants = [];
    for (const [i, v] of chosen.slice(0, 14).entries()) {
      const name = `L${String(i + 1).padStart(2, '0')}`;
      await renderDesign(name, v.w, { by: 'landscape', idea: v.how, perturbation: v.type, why: v.why });
      ls.variants.push(name);
    }
    save();
  }
  const batches = [ls.variants.slice(0, 7), ls.variants.slice(7, 14)].filter(b => b.length);
  for (let k = ls.reviews.length; k < batches.length * 2; k++) {
    const b = Math.floor(k / 2), order = shuffle([ls.ref, ...batches[b]], s.id + 'land' + k), letters = order.map((_, i) => String.fromCharCode(65 + i));
    const imgs = [], guide = [];
    for (const [i, n] of order.entries()) { const { imgs: im } = await renderAnon(n, `Layout ${letters[i]}`, `land${k}-${letters[i]}`); imgs.push(...im); guide.push(`Layout ${letters[i]}${im.length > 1 ? ' (full view, then viewport view)' : ''}`); }
    const j = await call(`land-${k}`, {
      images: [ovPng, ...imgs],
      prompt: reviewPrompt(desc, guide, order.map((n, i) => geomText('Layout ' + letters[i], state.designs[n].geom, s.policy, s.W)), letters, scroll, true),
      validate: x => (x.ratings && letters.every(l => x.ratings[l] && GRADE[x.ratings[l].grade]) ? null : 'need a valid grade for every layout ' + letters.join(',')),
    });
    ls.reviews.push({ batch: b, order, letters, ...j }); save();
  }
  return state;
}

function reviewPrompt(desc, guide, factLines, letters, scroll, equivalence = false) {
  return `${PERSONA}\n\nYou are an independent reviewer. All layouts below show the same table with identical content, font, size, padding, borders and colours; only column widths (and the row heights they cause) differ. You do not know who or what produced any of them, and nothing about their order is meaningful.\n\n${QUALITY}\n\n${desc}\n\nImages after the content overview: ${guide.join(', ')}.\nMeasured facts (trust these for geometry; judge quality by looking):\n${factLines.join('\n')}\n${scroll ? '\nCompare fitting layouts and scrolling layouts each on their own terms; do not reward a layout merely for using more horizontal space than the viewport.\n' : ''}\nRate EACH layout independently: grade "excellent" | "good" | "acceptable" | "poor" | "bad"; a 0–100 score that can separate layouts of the same grade; 1–5 for each level (correctness, readability, function, order, rhythm, aesthetics); and a short reason that points at what you see. Then name the best layout(s) (ties allowed)${equivalence ? ', list groups of layouts whose quality you cannot tell apart' : ''}, your confidence (low/medium/high) and anything you are unsure about. Do not inflate grades; "excellent" means you would publish it as a model example.\nReply ONLY JSON: {"ratings":{${letters.map(l => `"${l}":{"grade":"","score":0,"dims":{"correctness":0,"readability":0,"function":0,"order":0,"rhythm":0,"aesthetics":0},"why":""}`).join(',')}},"best":["letter"],${equivalence ? '"indistinguishable":[["letter","letter"]],' : ''}"confidence":"","unsure":""}`;
}

// aggregate blind acceptance into labels; fitting and scrolling layouts are separate classes
function verdict(state, s) {
  const acc = state.accept, cands = {};
  for (const rv of acc.reviews) rv.order.forEach((n, i) => {
    const x = rv.ratings[rv.letters[i]];
    const c = cands[n] = cands[n] || { name: n, grades: [], scores: [], dims: [], whys: [], best: 0 };
    c.grades.push(GRADE[x.grade]); c.scores.push(+x.score || null); c.dims.push(x.dims || {}); c.whys.push(x.why);
    if ((rv.best || []).includes(rv.letters[i])) c.best++;
  });
  for (const c of Object.values(cands)) {
    const g = state.designs[c.name].geom;
    c.cls = g.overflow > 0.5 ? 'scroll' : 'fit';
    c.medianGrade = median(c.grades); c.meanScore = mean(c.scores); c.goodVotes = c.grades.filter(x => x >= 4).length;
    c.dimMeans = Object.fromEntries(DIMS.map(d => [d, mean(c.dims.map(x => +x[d] || null))]));
  }
  const labelOf = (c, topScore) => c.medianGrade >= 4 && c.goodVotes >= 2 && c.meanScore >= topScore - 5 ? 'gold' : c.medianGrade >= 4 && c.goodVotes >= 2 ? 'good' : c.medianGrade >= 3 ? 'acceptable' : c.medianGrade <= 2 ? 'bad' : 'unclear';
  const byClass = {};
  for (const cls of ['fit', 'scroll']) {
    const cs = Object.values(cands).filter(c => c.cls === cls).sort((a, b) => b.medianGrade - a.medianGrade || b.meanScore - a.meanScore);
    if (!cs.length) continue;
    const topScore = Math.max(...cs.filter(c => c.medianGrade === cs[0].medianGrade).map(c => c.meanScore));
    cs.forEach(c => { c.label = labelOf(c, topScore); });
    byClass[cls] = cs.map(c => c.name);
  }
  const primary = s.policy === 'fit' ? 'fit' : (byClass.fit && byClass.scroll ? (cands[byClass.fit[0]].medianGrade >= cands[byClass.scroll[0]].medianGrade ? 'fit' : 'scroll') : byClass.fit ? 'fit' : 'scroll');
  const top = (byClass[primary] || [])[0] || null;
  const golds = Object.values(cands).filter(c => c.label === 'gold');
  const status = golds.some(c => !state.designs[c.name].auto && c.name !== 'ref_equal' && c.name !== 'contrast') ? 'gold' : Object.values(cands).some(c => c.goodVotes >= 1 && c.medianGrade >= 3) ? 'contested' : 'unresolved';
  return { status, primaryClass: primary, top, topOrigin: top ? state.designs[top].by : null, byClass, candidates: cands };
}

// ---------------------------------------------------------------------------------------------
console.log(`${todo.length} scenarios, ${JOBS} parallel, model ${MODEL}, thinking ${THINKING}, image scale ${SCALE}, up to stage ${STAGE_LIMIT}`);
const renderers = await Promise.all(Array.from({ length: Math.min(JOBS, todo.length) }, async () => locked(await openRenderer())));
let done = 0;
await pool(todo, JOBS, async (s, w) => {
  const t0 = Date.now();
  const st = await runScenario(s, renderers[w]);
  const calls = readdirSync(join(G, 'runs', safe(s.id))).filter(f => /^log-/.test(f)).length;
  console.log(`  [${++done}/${todo.length}] ${s.id} → ${st.verdict ? st.verdict.status + ' top=' + st.verdict.top + ' (' + st.verdict.topOrigin + ')' : 'stage ' + STAGE_LIMIT + ' done'} · ${Object.keys(st.designs).length} renders · ${calls} calls · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
});
await Promise.all(renderers.map(r => r.close()));
