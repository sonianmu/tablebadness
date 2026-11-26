// Builds dist/*.html: pages without the document skeleton (for hosts that add their own).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const pages = [['index.html', 'artifact.html'], ['eval.html', 'eval-artifact.html']];
mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
for (const [src, out] of pages) {
  const html = readFileSync(new URL('../' + src, import.meta.url), 'utf8');
  const head = html.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta charset[^>]*>\s*/, '').replace(/<meta name="viewport"[^>]*>\s*/, '');
  const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
  writeFileSync(new URL('../dist/' + out, import.meta.url), head.trim() + '\n' + body.trim() + '\n');
  console.log('dist/' + out + ' written');
}
