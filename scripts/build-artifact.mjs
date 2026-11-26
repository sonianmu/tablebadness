// Builds dist/artifact.html: index.html without the document skeleton (for hosts that add their own).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const head = src.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta charset[^>]*>\s*/, '').replace(/<meta name="viewport"[^>]*>\s*/, '');
const body = src.match(/<body>([\s\S]*?)<\/body>/)[1];
mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist/artifact.html', import.meta.url), head.trim() + '\n' + body.trim() + '\n');
console.log('dist/artifact.html written');
