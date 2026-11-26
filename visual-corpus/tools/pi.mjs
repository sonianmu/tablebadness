// Pi wrapper: one isolated, stateless call (fresh context) with images; timeout, retries, raw log, JSON extraction.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Model chain: use the first model that still has quota; a model that reports exhausted credits/quota is
// remembered (runs/_exhausted.json) and skipped from then on.
export const MODELS = (process.env.VC_MODELS || 'codex/gpt-6.1-terra,opencode-zen-free/deepseek-v4.1-flash-free').split(',');
export const MODEL = MODELS.join(' → ');
export const THINKING = process.env.VC_THINKING || 'medium';
const EXH = join(dirname(fileURLToPath(import.meta.url)), '../runs/_exhausted.json');
const exhausted = new Set(existsSync(EXH) ? JSON.parse(readFileSync(EXH, 'utf8')) : []);
const markExhausted = m => { exhausted.add(m); mkdirSync(dirname(EXH), { recursive: true }); writeFileSync(EXH, JSON.stringify([...exhausted])); console.error(`  ! model ${m} exhausted, falling back`); };
const isExhaustion = t => /exhaust|insufficient|quota|credit|billing|usage limit|limit reached|402/i.test(t);
export const currentModel = () => MODELS.find(m => !exhausted.has(m)) || null;

function once(prompt, images, { timeoutMs, thinking, cwd, model }) {
  return new Promise((resolve) => {
    const args = ['-p', '--model', model, '--thinking', thinking, '--no-tools', '--no-session', '--no-context-files',
      '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-mcp',
      ...images.map(p => '@' + basename(p)), prompt];
    const child = spawn('pi', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '', done = false;
    const t = setTimeout(() => { if (!done) { child.kill('SIGKILL'); } }, timeoutMs);
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('close', code => { done = true; clearTimeout(t); resolve({ code, out, err }); });
  });
}

export function extractJSON(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const cands = [];
  if (fence) cands.push(fence[1]);
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) cands.push(text.slice(a, b + 1));
  for (const c of cands) { try { return JSON.parse(c); } catch (e) { /* try next */ } }
  return null;
}

// images must all live in one directory (passed as cwd so @file references resolve)
export async function ask({ prompt, images = [], logPath, retries = 3, timeoutMs = 300000, thinking = THINKING, validate, onModel }) {
  const cwd = images.length ? dirname(images[0]) : process.cwd();
  const log = [];
  for (let attempt = 1; attempt <= retries; attempt++) {
    const model = currentModel();
    if (!model) throw new Error('all models exhausted: ' + MODELS.join(', '));
    const t0 = Date.now();
    const r = await once(prompt, images, { timeoutMs, thinking, cwd, model });
    if (r.code !== 0 && isExhaustion(r.out + r.err)) { markExhausted(model); log.push({ attempt, model, ms: Date.now() - t0, problem: 'exhausted' }); attempt--; continue; }
    const json = r.code === 0 ? extractJSON(r.out) : null;
    const problem = r.code !== 0 ? `exit ${r.code} ${r.err.slice(0, 300)}` : !json ? 'no JSON in reply' : validate ? validate(json) : null;
    log.push({ attempt, model, ms: Date.now() - t0, code: r.code, problem, raw: r.out.slice(0, 20000) });
    if (!problem) {
      if (logPath) { mkdirSync(dirname(logPath), { recursive: true }); writeFileSync(logPath, JSON.stringify({ model, thinking, images: images.map(p => basename(p)), prompt, log }, null, 1)); }
      if (onModel) onModel(model);
      return json;
    }
    if (attempt < retries && /JSON|invalid/.test(problem)) prompt += `\n\nYour previous reply was rejected: ${problem}. Reply again with ONLY the JSON object.`;
    await new Promise(res => setTimeout(res, 1500 * attempt));
  }
  if (logPath) { mkdirSync(dirname(logPath), { recursive: true }); writeFileSync(logPath, JSON.stringify({ model: MODEL, thinking, prompt, log, failed: true }, null, 1)); }
  throw new Error('pi call failed: ' + log.map(l => l.problem).join(' | '));
}
