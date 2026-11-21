// Test play in one step: serves this folder on http://localhost:8000 (unless something already answers there) and opens
// the game in the default browser with the sound off (?mute=1; the speaker button turns it on).
//   npm run play            (or double-click play.cmd)
//   npm run play -- --sound (start with the sound on)
// The server keeps running in the background so the next launch opens at once; `npm run stop` ends it.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))), PORT = 8000;
const url = `http://localhost:${PORT}/${process.argv.includes('--sound') ? '' : '?mute=1'}`;
const up = async () => { try { await fetch(`http://localhost:${PORT}/`); return true; } catch { return false; } };

if (process.argv.includes('--stop')) {   // end whatever is listening on the port
  const { execSync } = await import('node:child_process');
  try {
    if (process.platform === 'win32') {
      const pids = new Set(execSync(`netstat -ano -p tcp`, { encoding: 'utf8' }).split('\n').filter((l) => new RegExp(`:${PORT}\\s.*LISTENING`).test(l)).map((l) => l.trim().split(/\s+/).pop()));
      pids.forEach((pid) => execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' }));
      console.log(pids.size ? `stopped (pid ${[...pids].join(', ')})` : 'not running');
    } else { execSync(`kill $(lsof -t -i :${PORT}) 2>/dev/null || true`, { shell: '/bin/sh' }); console.log('stopped'); }
  } catch (e) { console.log('could not stop:', e.message); }
  process.exit(0);
}
if (!(await up())) {
  const srv = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'serve', 'build', 'main.js'), '-l', String(PORT), '--no-clipboard', ROOT], { detached: true, stdio: 'ignore', windowsHide: true });
  srv.unref();
  for (let i = 0; i < 100 && !(await up()); i++) await new Promise((r) => setTimeout(r, 100));
}
const opener = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
spawn(opener[0], opener[1], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
console.log(`SOUND WALK: ${url}`);
