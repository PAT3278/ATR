// Smoke test in a real browser (Playwright): the title loads, you start, walk, jump, open and close the map and view a
// place, on a desktop window and on a phone. Any page error or console error fails it. Screenshots go to tests/out/.
//   npm run setup   (once: installs Playwright and its Chromium)
//   npm test        (or `npm run test:headed` to watch it)
// It serves this folder itself on a free port, so no server needs to be running.
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))), OUT = path.join(ROOT, 'tests', 'out');
const headed = process.argv.includes('--headed');
mkdirSync(OUT, { recursive: true });

const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => res(port)); }); });
const port = await freePort(), base = `http://localhost:${port}/`;
const server = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'serve', 'build', 'main.js'), '-l', String(port), '--no-clipboard', ROOT], { stdio: 'ignore' });
const stop = () => { try { server.kill(); } catch { /* */ } };
process.on('exit', stop);
for (let i = 0; i < 100; i++) { try { await fetch(base); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: !headed, args: ['--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'] });
let failed = 0;
for (const [name, ctxOpts] of [['desktop', { viewport: { width: 1280, height: 720 } }], ['phone', { ...devices['iPhone 13'] }]]) {
  const ctx = await browser.newContext(ctxOpts), page = await ctx.newPage(), errors = []; page.setDefaultTimeout(300000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  if (process.env.THREE_PATH) {   // offline: serve three.js from a local copy instead of the CDN
    await page.route('https://cdnjs.cloudflare.com/**', (r) => r.fulfill({ path: process.env.THREE_PATH, contentType: 'application/javascript' }));
    await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  }
  const t0 = Date.now();
  await page.goto(base);
  await page.waitForFunction(() => window.__soundwalk && window.__soundwalk.mode === 'title', null, { timeout: 300000 });
  const load = ((Date.now() - t0) / 1000).toFixed(1);
  await page.screenshot({ path: path.join(OUT, `${name}-title.png`) });
  await page.click('#startBtn'); await page.waitForTimeout(1500);
  if (name === 'desktop') { await page.keyboard.down('KeyW'); await page.waitForTimeout(3000); await page.keyboard.press('Space'); await page.waitForTimeout(500); await page.keyboard.up('KeyW'); }
  await page.screenshot({ path: path.join(OUT, `${name}-walk.png`) });
  await page.click('#mapBtn'); await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, `${name}-map.png`) });
  await page.click('#mapClose');
  const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const s = performance.now(); const f = () => { n++; if (performance.now() - s < 2000) requestAnimationFrame(f); else res(n / 2); }; requestAnimationFrame(f); }));
  await page.evaluate(() => { const sw = window.__soundwalk; sw.enterView(sw.places[0]); });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, `${name}-view.png`) });
  const ok = errors.length === 0; if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: loaded in ${load}s, ~${Math.round(fps)} fps${ok ? '' : '\n  ' + errors.join('\n  ')}`);
  await ctx.close();
}
await browser.close(); stop();
console.log(`screenshots: ${OUT}`);
process.exit(failed ? 1 : 0);
