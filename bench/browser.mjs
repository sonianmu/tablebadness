// Shared headless-Chromium launcher (uses Playwright's cached Chromium; override with CHROME_PATH).
import { chromium } from 'playwright-core';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = join(homedir(), 'Library/Caches/ms-playwright');
  const linuxBase = join(homedir(), '.cache/ms-playwright');
  for (const b of [base, linuxBase]) {
    if (!existsSync(b)) continue;
    const dirs = readdirSync(b).filter(d => /^chromium-\d+$/.test(d)).sort().reverse();
    for (const d of dirs) {
      const cands = [
        join(b, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
        join(b, d, 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'),
        join(b, d, 'chrome-linux/chrome'),
        join(b, d, 'chrome-linux64/chrome'),
      ];
      for (const c of cands) if (existsSync(c)) return c;
    }
  }
  return undefined; // let playwright decide
}

export async function launch() {
  const executablePath = findChrome();
  return chromium.launch({ executablePath, headless: true });
}
