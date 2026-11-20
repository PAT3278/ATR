// Frame timing on this computer's GPU: opens a window, auto-walks round the places for ~30 s and reports fps and stalls
// (frames over 50 / 100 ms, and where they happened). npm run perf (with npm run play's server, or any on :8000).
import { chromium } from 'playwright';
const b = await chromium.launch({ headless: false, args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:8000/?mute=1'); await p.waitForFunction(() => window.__soundwalk && window.__soundwalk.mode === 'title', null, { timeout: 120000 });
await p.click('#startBtn'); await p.waitForTimeout(1500);
await p.evaluate(() => { const L = (window.__ft = []); let last = performance.now(); const f = (t) => { L.push([t - last, window.__soundwalk.P.x, window.__soundwalk.P.z]); last = t; requestAnimationFrame(f); }; requestAnimationFrame(f); });
const order = ['field', 'flip', 'tama', 'ohh', 'shot', 'park', 'keyaki'];
for (const s of order) { await p.evaluate((s) => { const sw = window.__soundwalk; if (sw.mode === 'view') sw.exitView(); const q = sw.places.find((x) => x.song.scene === s); if (q) sw.routeTo(q); }, s); await p.waitForTimeout(4500); }
const r = await p.evaluate(() => { const ft = window.__ft.slice(5).map((x) => x[0]), s = [...ft].sort((a, b) => a - b), q = (k) => s[Math.floor(s.length * k)];
  const spikes = window.__ft.slice(5).filter((x) => x[0] > 50).map((x) => [Math.round(x[0]), Math.round(x[1]), Math.round(x[2])]);
  return { frames: ft.length, fps: +(1000 / q(0.5)).toFixed(0), p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), p99: +q(0.99).toFixed(1), max: Math.round(s[s.length - 1]), over50ms: spikes.length, over100ms: spikes.filter((x) => x[0] > 100).length, spikes: spikes.slice(0, 15), gpu: (() => { const g = document.createElement('canvas').getContext('webgl'); const e = g && g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; })() }; });
console.log(JSON.stringify(r)); console.log('errors', errs.length ? errs : 'none'); await b.close();
