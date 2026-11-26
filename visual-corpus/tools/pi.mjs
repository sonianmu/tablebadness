// Pi wrapper: one isolated, stateless call (fresh context) with images; timeout, retries, raw log, JSON extraction.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, basename } from 'node:path';

export const MODEL = process.env.VC_MODEL || 'workbuddy-ai/deepseek-v4.1-flash-sg';
export const THINKING = process.env.VC_THINKING || 'medium';

function once(prompt, images, { timeoutMs, thinking, cwd }) {
  return new Promise((resolve) => {
    const args = ['-p', '--model', MODEL, '--thinking', thinking, '--no-tools', '--no-session', '--no-context-files',
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
export async function ask({ prompt, images = [], logPath, retries = 3, timeoutMs = 240000, thinking = THINKING, validate }) {
  const cwd = images.length ? dirname(images[0]) : process.cwd();
  const log = [];
  for (let attempt = 1; attempt <= retries; attempt++) {
    const t0 = Date.now();
    const r = await once(prompt, images, { timeoutMs, thinking, cwd });
    const json = r.code === 0 ? extractJSON(r.out) : null;
    const problem = r.code !== 0 ? `exit ${r.code} ${r.err.slice(0, 300)}` : !json ? 'no JSON in reply' : validate ? validate(json) : null;
    log.push({ attempt, ms: Date.now() - t0, code: r.code, problem, raw: r.out.slice(0, 20000) });
    if (!problem) {
      if (logPath) { mkdirSync(dirname(logPath), { recursive: true }); writeFileSync(logPath, JSON.stringify({ model: MODEL, thinking, images: images.map(p => basename(p)), prompt, log }, null, 1)); }
      return json;
    }
    if (attempt < retries && /JSON|invalid/.test(problem)) prompt += `\n\nYour previous reply was rejected: ${problem}. Reply again with ONLY the JSON object.`;
    await new Promise(res => setTimeout(res, 1500 * attempt));
  }
  if (logPath) { mkdirSync(dirname(logPath), { recursive: true }); writeFileSync(logPath, JSON.stringify({ model: MODEL, thinking, prompt, log, failed: true }, null, 1)); }
  throw new Error('pi call failed: ' + log.map(l => l.problem).join(' | '));
}
