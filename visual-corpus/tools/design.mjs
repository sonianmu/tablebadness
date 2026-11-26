// Visual design loop for one scenario + independent blind review. Every step is persisted; re-running resumes.
//   node tools/design.mjs [--split holdout,validation] [--only id1,id2] [--limit N] [--jobs 6]
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ask, MODEL } from './pi.mjs';
import { openRenderer } from './render.mjs';
import { pool } from './pool.mjs';
import { execSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const JOBS = +arg('jobs', 6), MAX_ROUNDS = +arg('rounds', 3);
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const fams = {};
for (const d of ['existing', 'new']) for (const f of readdirSync(join(root, 'tables', d))) { const t = JSON.parse(readFileSync(join(root, 'tables', d, f), 'utf8')); fams[t.id] = t; }
let todo = manifest.scenarios;
if (arg('split')) todo = todo.filter(s => arg('split').split(',').includes(s.split));
if (arg('only')) todo = todo.filter(s => arg('only').split(',').includes(s.id));
if (arg('limit')) todo = todo.slice(0, +arg('limit'));
const PI_VERSION = execSync('pi --version').toString().trim();
const REDO = process.argv.includes('--redo-rejected');
const REREVIEW = arg('rereview-policy', null); // e.g. scroll-allowed: keep designs, redo blind reviews

const safe = id => id.replace(/[^a-zA-Z0-9@._-]/g, '_');
const readJ = p => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const writeJ = (p, x) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(x, null, 1)); };

// ---------------------------------------------------------------------------------------------
// structure description given to the model (facts about content, never any algorithm output)
function describe(s, t, g) {
  const head = g.cells.filter(c => c.role === 'col');
  const cols = g.facts.map((f, j) => {
    const hdr = head.filter(c => j >= c.c && j < c.c + c.cs).sort((a, b) => a.r - b.r).map(c => c.text).join(' › ');
    return `  col ${j + 1}: header "${hdr || '(none)'}" · longest unbreakable word ${f.minContent}px · one-line width ${f.natural}px`;
  }).join('\n');
  const rowHdr = g.cells.some(c => c.role === 'row') ? 'Row headers: yes (first logical column identifies each row).' : 'Row headers: none declared.';
  const spans = g.cells.filter(c => c.cs > 1 || c.rs > 1).map(c => `"${c.text.slice(0, 24)}" spans ${c.cs} col × ${c.rs} row`).slice(0, 12).join('; ');
  const extra = g.tableExtra;
  return `Table: ${t.title} (language ${t.lang}${/^(ar|he)/.test(t.lang) ? ', right-to-left: column 1 is on the RIGHT' : ''}).
Grid: ${g.nCols} columns × ${g.nRows} rows. ${rowHdr}${spans ? '\nMerged cells: ' + spans + '.' : ''}
Per-column content facts (content px at ${s.fs}px font, excluding padding):
${cols}
Each column also has 21px of padding+border, so a column given width w px shows w−21 px of text.
Available width: ${s.W}px (the dashed pink box = the reader's viewport). The column widths you choose must sum to at most ${s.W - extra}px.${s.policy === 'scroll-allowed' ? `\nThis table cannot fit without splitting words at ${s.W}px. You MAY choose a total wider than ${s.W - extra}px (the reader then scrolls horizontally), or squeeze and accept splits — a design decision.\nRendering convention: the screenshot always shows the WHOLE table. Anything beyond the dashed box is not clipped; it is the part a reader reaches by scrolling sideways, so judge both what fits in the box at first sight and the cost of scrolling to the rest.` : ''}
Fixed: content, font, ${s.fs}px font size, padding, borders, colours, alignment. You control ONLY the column widths.`;
}

const PERSONA = `You are a senior typographer and information designer. You lay out data tables for publication. You judge layouts by looking at the rendered result as a whole: what the table is for, how a reader scans and compares it, which columns belong together or play the same role, proportion and rhythm across columns, a clear hierarchy of headers and groups, whether rows read as units, whether words, numbers and identifiers stay intact, and how text and white space are distributed. Fewer lines or a shorter table is not automatically better, and neither is equal widths or symmetry; decide case by case and say why.`;

function geomText(name, g) {
  const wrappedHdr = g.cells.filter(c => c.role === 'col' && c.lines > 1).length, hdr = g.cells.filter(c => c.role === 'col').length;
  const maxL = g.cells.reduce((m, c) => Math.max(m, c.lines), 0);
  return `${name}: widths [${g.colWidths.join(', ')}] · table ${Math.round(g.tableWidth)}×${Math.round(g.tableHeight)}px · row heights [${g.rowHeights.map(Math.round).join(', ')}] · column headers wrapped ${wrappedHdr}/${hdr} · tallest cell ${maxL} lines · mid-word splits ${g.emergencyBreaks}${g.overflow > 0.5 ? ` · OVERFLOWS the box by ${Math.round(g.overflow)}px` : ''}${g.clipped ? ' · CLIPPED CONTENT' : ''}`;
}

// enforce hard constraints; returns {widths, notes}
function normalize(widths, s, g, nCols) {
  const notes = [];
  let w = (Array.isArray(widths) ? widths : []).slice(0, nCols).map(x => Math.round(+x || 0));
  if (w.length !== nCols) { notes.push(`expected ${nCols} widths`); while (w.length < nCols) w.push(60); }
  const minCol = 21 + Math.ceil(s.fs * 1.1);
  w = w.map(x => { if (x < minCol) { notes.push(`raised a column to the minimum ${minCol}px`); return minCol; } return x; });
  const budget = s.W - g.tableExtra, sum = w.reduce((a, b) => a + b, 0);
  if (s.policy === 'fit' && sum > budget + 0.5) {
    const f = budget / sum; w = w.map(x => Math.floor(x * f)); notes.push(`scaled down from ${sum}px to fit ${budget}px`);
  }
  return { widths: w, notes };
}

// ---------------------------------------------------------------------------------------------
async function runScenario(s, R) {
  const dir = join(root, 'runs', safe(s.id)), img = join(dir, 'img');
  mkdirSync(img, { recursive: true });
  let state = readJ(join(dir, 'state.json')) || { id: s.id, steps: {}, designs: {} };
  const save = () => writeJ(join(dir, 'state.json'), state);
  if (REREVIEW && s.policy === REREVIEW && state.reviews && state.reviews.length && !state.rereviewed && state.reviewPrompt !== 'v2') {
    state.reviewsOld = state.reviews; state.reviews = []; state.rereviewed = true; save();
  }
  if (REDO && state.final && state.reviews && state.reviews.length >= 2 && verdict(state).status === 'rejected' && !state.redone) {
    const feedback = state.reviews.map(rv => Object.entries(rv.ratings).map(([l, x]) => `${rv.order[rv.letters.indexOf(l)] === state.final.preferred[0] ? 'your previous preferred design' : 'another layout'} was rated ${x.grade}: ${x.why}`).join(' | ')).join('\n');
    writeJ(join(dir, 'state-attempt1.json'), state);
    state = { id: s.id, steps: {}, designs: {}, redone: true, reviewerFeedback: feedback };
    save();
  }
  if (state.final && state.reviews && state.reviews.length >= 2 && !(REDO && verdict(state).status === 'rejected' && !state.redone)) return state;
  const t = fams[s.family], src = { lang: t.lang, html: t.html, md: t.md, rowHeader: t.rowHeader };
  // content overview (natural, no wrapping) + facts
  const ov = join(img, 'overview.png');
  const gNat = await R.render({ src, W: s.W, fs: s.fs, natural: true, ruler: false, label: 'Content overview (every cell on one line; not a layout proposal)' }, ov);
  const desc = describe(s, t, gNat);
  const renderDesign = async (name, widths) => {
    const p = join(img, `d-${name}.png`);
    const g = await R.render({ src, W: s.W, fs: s.fs, widths, label: `Design ${name}` }, p);
    state.designs[name] = { widths, geom: g, png: `d-${name}.png` };
    return g;
  };
  const designList = names => names.map(n => geomText(`Design ${n}`, state.designs[n].geom)).join('\n');

  // ---- round 0: understand + propose ----
  if (!state.steps.r0) {
    const j = await ask({ onModel: m => { (state.modelsUsed = state.modelsUsed || []).includes(m) || state.modelsUsed.push(m); },
      images: [ov], logPath: join(dir, 'log-r0.json'),
      prompt: `${PERSONA}\n\n${desc}\n\nThe image shows the table's content with every cell on one line, so you can read everything. Study it first.\n1) Understand it: what is the table for, how will people read, scan and compare it, which columns play the same or similar role, which values must stay intact, which text may wrap naturally, and where existing row height could absorb wrapping.\n2) Propose 3 genuinely different column-width designs for ${s.W}px (different strategies, not small variations).${state.reviewerFeedback ? '\nAn earlier design attempt for this table was rejected by independent reviewers. Their comments: ' + state.reviewerFeedback.slice(0, 2500) : ''}\nReply ONLY JSON: {"understanding":{"purpose":"","reading":"","groups":["columns that belong together and why"],"keep_intact":[""],"may_wrap":[""]},"designs":[{"name":"A","widths":[int px per column, column 1 first],"idea":"one sentence"}]}`,
      validate: x => (Array.isArray(x.designs) && x.designs.length >= 2 ? null : 'need designs[]'),
    });
    state.understanding = j.understanding;
    const names = [];
    for (const [k, d] of j.designs.slice(0, 4).entries()) {
      const name = 'r0' + String.fromCharCode(65 + k);
      const n = normalize(d.widths, s, gNat, gNat.nCols);
      await renderDesign(name, n.widths);
      state.designs[name].idea = d.idea; state.designs[name].notes = n.notes;
      names.push(name);
    }
    state.steps.r0 = { names }; save();
  }
  // ---- critique / revise rounds ----
  let current = state.steps.r0.names;
  for (let r = 1; r <= MAX_ROUNDS; r++) {
    const key = 'r' + r;
    if (state.steps[key]) { current = state.steps[key].names; if (state.steps[key].done) break; continue; }
    const imgs = current.map(n => join(img, state.designs[n].png));
    const notes = current.map(n => (state.designs[n].notes || []).length ? `${n}: ${state.designs[n].notes.join('; ')}` : '').filter(Boolean).join('\n');
    const j = await ask({ onModel: m => { (state.modelsUsed = state.modelsUsed || []).includes(m) || state.modelsUsed.push(m); },
      images: [ov, ...imgs], logPath: join(dir, `log-${key}.json`),
      prompt: `${PERSONA}\n\n${desc}\n\nYour understanding so far: ${JSON.stringify(state.understanding)}\n\nThe first image is the one-line content overview. The other images are real browser renders of your current designs:\n${designList(current)}${notes ? '\nConstraint adjustments applied: ' + notes : ''}\n\nLook carefully at each render as a whole and in detail. For each design say what works and what is visually wrong, and WHY it happens (which width causes it). Then propose up to 3 improved designs: refine the most promising, fix the problems you saw, and try a new idea if an important alternative is unexplored. If no design can be meaningfully improved, set "done": true and return no new designs.\nReply ONLY JSON: {"critique":[{"design":"name","good":"","problems":"","cause":""}],"done":false,"designs":[{"name":"short-name","widths":[int px],"change":"what you changed and why"}]}`,
      validate: x => (Array.isArray(x.critique) ? null : 'need critique[]'),
    });
    const names = [];
    for (const [k, d] of (j.done ? [] : (j.designs || []).slice(0, 3)).entries()) {
      const name = key + String.fromCharCode(65 + k);
      const n = normalize(d.widths, s, gNat, gNat.nCols);
      await renderDesign(name, n.widths);
      state.designs[name].idea = d.change; state.designs[name].notes = n.notes; state.designs[name].parentRound = r - 1;
      names.push(name);
    }
    state.steps[key] = { critique: j.critique, done: !!j.done || !names.length, names: names.length ? names : current };
    save();
    current = state.steps[key].names;
    if (state.steps[key].done) break;
  }
  // ---- final selection over every rendered design ----
  if (!state.final) {
    const all = Object.keys(state.designs);
    // keep the image count manageable: the latest round plus every design never criticised as a problem
    const pick = all.slice(-8);
    const j = await ask({ onModel: m => { (state.modelsUsed = state.modelsUsed || []).includes(m) || state.modelsUsed.push(m); },
      images: [ov, ...pick.map(n => join(img, state.designs[n].png))], logPath: join(dir, 'log-final.json'),
      prompt: `${PERSONA}\n\n${desc}\n\nThese are all candidate designs you produced, rendered in a real browser:\n${designList(pick)}\n\nDecide as a designer:\n- "preferred": the best design(s). Name more than one only if they are genuinely equally good.\n- "acceptable": other designs a careful designer would still publish.\n- "bad": designs with clear visual faults, each with the fault. If none of these is clearly bad, also return ONE deliberately bad but plausible alternative as "contrast" widths and say what is wrong with it.\n- "ranges": for each column, the px range within which the preferred design stays equally good (keep other columns' proportions).\n- "rationale": 2–4 concrete sentences about this table.\n- "principles": observations that seem GENERAL (likely to hold for other tables) vs SPECIFIC to this case.\n- "tradeoffs" and "uncertain": what reasonable designers could disagree on.\nReply ONLY JSON: {"preferred":["name"],"acceptable":["name"],"bad":[{"design":"name","why":""}],"contrast":{"widths":[int px],"why":""} or null,"ranges":[[min,max]],"rationale":"","principles":{"general":[""],"specific":[""]},"tradeoffs":"","uncertain":""}`,
      validate: x => (Array.isArray(x.preferred) && x.preferred.length && x.preferred.every(n => pick.includes(n)) ? null : 'preferred must name rendered designs: ' + pick.join(',')),
    });
    if (j.contrast && Array.isArray(j.contrast.widths)) {
      const n = normalize(j.contrast.widths, s, gNat, gNat.nCols);
      await renderDesign('contrast', n.widths);
      state.designs.contrast.idea = j.contrast.why;
      (j.bad = j.bad || []).push({ design: 'contrast', why: j.contrast.why });
    }
    state.final = j; save();
  }
  // ---- two independent blind reviews (fresh contexts, shuffled, generator identity hidden) ----
  state.reviews = state.reviews || [];
  for (let k = state.reviews.length; k < 2; k++) {
    const pref = state.final.preferred[0];
    const pool_ = [pref, ...(state.final.acceptable || []).filter(n => state.designs[n]).slice(0, 2), ...(state.final.bad || []).map(b => b.design).filter(n => state.designs[n]).slice(0, 1)];
    // neutral references (not produced by any layout algorithm of this project): browser auto layout, equal widths
    if (!state.designs.ref_auto) await renderAuto();
    if (!state.designs.ref_equal) await renderDesign('ref_equal', normalize(Array(gNat.nCols).fill(Math.floor((s.W - gNat.tableExtra) / gNat.nCols)), s, gNat, gNat.nCols).widths);
    pool_.push('ref_auto', 'ref_equal');
    const uniq = [...new Set(pool_)];
    let seed = (s.id.length * 7919 + k * 104729) % 2147483647;
    const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    for (let i = uniq.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [uniq[i], uniq[j]] = [uniq[j], uniq[i]]; }
    const letters = uniq.map((_, i) => String.fromCharCode(65 + i));
    const imgs = [];
    for (const [i, n] of uniq.entries()) {
      const p = join(img, `rv${k}-${letters[i]}.png`);
      await R.render({ src, W: s.W, fs: s.fs, widths: state.designs[n].auto ? null : state.designs[n].widths, label: `Layout ${letters[i]}` }, p);
      imgs.push(p);
    }
    const j = await ask({ onModel: m => { (state.modelsUsed = state.modelsUsed || []).includes(m) || state.modelsUsed.push(m); },
      images: [ov, ...imgs], logPath: join(dir, `log-review${k}.json`),
      prompt: `${PERSONA}\n\nYou are reviewing layouts of one table, all rendered in a real browser with identical content, font, padding and colours; only column widths differ. You do not know who or what produced them. The first image is the content overview (every cell on one line).\n${describe(s, t, gNat)}\n\nRate EACH layout independently: "excellent" | "good" | "acceptable" | "poor" | "bad", with a short reason that points at what you see. Then name the best layout(s) (ties allowed), say how confident you are (low/medium/high), and note anything you are unsure about.\nReply ONLY JSON: {"ratings":{${letters.map(l => `"${l}":{"grade":"","why":""}`).join(',')}},"best":["letter"],"confidence":"","unsure":""}`,
      validate: x => (x.ratings && Array.isArray(x.best) && letters.every(l => x.ratings[l]) ? null : 'need ratings for ' + letters.join(',')),
    });
    state.reviews.push({ order: uniq, letters, ...j }); state.reviewPrompt = 'v2'; save();
  }
  async function renderAuto() {
    const p = join(img, 'd-ref_auto.png');
    const g = await R.render({ src, W: s.W, fs: s.fs, widths: null, label: 'Design ref_auto' }, p);
    state.designs.ref_auto = { widths: g.colWidths, geom: g, png: 'd-ref_auto.png', auto: true };
  }
  return state;
}

// ---------------------------------------------------------------------------------------------
const GRADE = { excellent: 5, good: 4, acceptable: 3, poor: 2, bad: 1 };
function verdict(state) {
  const pref = state.final.preferred;
  const per = state.reviews.map(rv => {
    const name = n => rv.letters[rv.order.indexOf(n)];
    const g = n => GRADE[(rv.ratings[name(n)] || {}).grade] || 0;
    const prefGrade = Math.max(...pref.filter(n => rv.order.includes(n)).map(g));
    const bestNames = rv.best.map(l => rv.order[rv.letters.indexOf(l)]);
    const badGrades = (state.final.bad || []).map(b => b.design).filter(n => rv.order.includes(n)).map(g);
    return { prefGrade, prefIsBest: bestNames.some(n => pref.includes(n)), bestNames, badGrades, autoGrade: g('ref_auto'), equalGrade: g('ref_equal') };
  });
  const ok = per.filter(p => p.prefGrade >= 4).length;
  const status = ok === 2 && per.every(p => p.prefIsBest || p.prefGrade >= 4) ? 'confirmed' : ok >= 1 ? 'contested' : 'rejected';
  return { status, per };
}

// which model answered each step, read back from the saved call logs
function modelsFromLogs(dir) {
  const out = {};
  for (const f of readdirSync(dir).filter(f => /^log-.*\.json$/.test(f))) {
    const l = readJ(join(dir, f)); out[f.replace(/^log-|\.json$/g, '')] = l.failed ? 'failed' : l.model;
  }
  return out;
}

function finalize(s, state) {
  const dir = join(root, 'runs', safe(s.id)), out = join(root, 'corpus', s.split), imgOut = join(out, 'img');
  mkdirSync(imgOut, { recursive: true });
  const copy = n => { const f = `${safe(s.id)}__${n}.png`; copyFileSync(join(dir, 'img', state.designs[n].png), join(imgOut, f)); return `img/${f}`; };
  const t = fams[s.family];
  const layout = n => ({ name: n, colWidths: state.designs[n].geom.colWidths, requestedWidths: state.designs[n].widths, tableWidth: state.designs[n].geom.tableWidth, tableHeight: state.designs[n].geom.tableHeight, rowHeights: state.designs[n].geom.rowHeights, cellLines: state.designs[n].geom.cells.map(c => [c.r, c.c, c.lines]), overflow: state.designs[n].geom.overflow, screenshot: copy(n), note: state.designs[n].idea || null });
  const v = verdict(state);
  const rec = {
    id: s.id, family: s.family, split: s.split, status: v.status,
    table: { title: t.title, lang: t.lang, structure: t.structure, html: t.html || null, md: t.md || null, rowHeader: !!t.rowHeader, source: t.source, brief: t.brief || null },
    conditions: { availableWidth: s.W, fontSize: s.fs, policy: s.policy, css: 'src/table.css (padding 6px 10px, 1px borders, line-height 1.55)', browser: 'Chromium (Playwright build), macOS system fonts', contentFacts: { WminNoSplit: s.Wmin, WallOneLine: s.Wnat } },
    understanding: state.understanding,
    preferred: state.final.preferred.map(layout),
    acceptable: (state.final.acceptable || []).filter(n => state.designs[n] && !state.final.preferred.includes(n)).map(layout),
    bad: (state.final.bad || []).filter(b => state.designs[b.design]).map(b => ({ ...layout(b.design), why: b.why })),
    ranges: state.final.ranges, rationale: state.final.rationale, principles: state.final.principles, tradeoffs: state.final.tradeoffs, uncertain: state.final.uncertain,
    designHistory: Object.fromEntries(Object.entries(state.steps).map(([k, x]) => [k, { critique: x.critique || null, designs: x.names }])),
    review: { method: 'two fresh-context blind reviews; letters shuffled; includes browser auto layout and equal widths as neutral references', verdict: v, raw: state.reviews.map(r => ({ order: r.order, best: r.best.map(l => r.order[r.letters.indexOf(l)]), ratings: Object.fromEntries(Object.entries(r.ratings).map(([l, x]) => [r.order[r.letters.indexOf(l)], x])), confidence: r.confidence, unsure: r.unsure })) },
    provenance: { models: modelsFromLogs(dir), modelChain: MODEL, pi: PI_VERSION, created: new Date().toISOString(), note: 'AI visual design judgement; not a human reading study' },
  };
  writeJ(join(out, safe(s.id) + '.json'), rec);
  return rec;
}

// ---------------------------------------------------------------------------------------------
console.log(`${todo.length} scenarios, ${JOBS} parallel, model ${MODEL}`);
const renderers = await Promise.all(Array.from({ length: Math.min(JOBS, todo.length) }, () => openRenderer()));
let n = 0;
await pool(todo, JOBS, async (s, w) => {
  const t0 = Date.now();
  const state = await runScenario(s, renderers[w]);
  const rec = finalize(s, state);
  console.log(`  [${++n}/${todo.length}] ${s.id} → ${rec.status} (${rec.preferred.map(p => p.name).join('/')}, ${Object.keys(state.designs).length} renders, ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
});
await Promise.all(renderers.map(r => r.close()));
