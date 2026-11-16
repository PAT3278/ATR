/*
 * Pool: a table seen from above, opened from the pool hall on the plaza.
 *
 *   SW.Pool.open({ best, onClose(best) })   // best: fewest shots so far to clear the table (or null)
 *
 * Fifteen balls in a rack; pot them all in as few shots as you can. Potting the cue ball costs a shot and the cue ball
 * goes back behind the line. Aim with the pointer (or ←/→, or the left stick), hold to build power (click and hold,
 * Z / Space, or the A button) and let go to strike. Esc, ✕ or the B button leaves.
 */
(function () {
  'use strict';
  const SW = (window.SW = window.SW || {});
  // the table in metres (playing surface), x along the length
  const L = 2.24, W = 1.12, R = 0.0286, POCK = [[-L / 2, -W / 2, 0.072], [0, -W / 2, 0.062], [L / 2, -W / 2, 0.072], [-L / 2, W / 2, 0.072], [0, W / 2, 0.062], [L / 2, W / 2, 0.072]];
  const COLS = { 1: '#f1c232', 2: '#2457c5', 3: '#d23a2a', 4: '#5b2d8f', 5: '#ef7a1a', 6: '#1f8a4a', 7: '#7a1f22', 8: '#111111' };
  const colOf = (n) => COLS[n > 8 ? n - 8 : n];
  const HEAD = -L / 4, FOOT = L / 4;

  function rack() {
    const balls = [{ n: 0, x: HEAD, z: 0, vx: 0, vz: 0, in: false }];
    const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];   // the 8 in the middle of the third row
    let k = 0;
    for (let row = 0; row < 5; row++) for (let i = 0; i <= row; i++) {
      balls.push({ n: order[k++], x: FOOT + row * R * 1.75, z: (i - row / 2) * R * 2.02, vx: 0, vz: 0, in: false });
    }
    return balls;
  }

  function open(o = {}) {
    if (document.getElementById('pool')) return;
    const root = document.createElement('div'); root.id = 'pool'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'ビリヤード');
    root.innerHTML = '<div class="pool-top"><span class="pool-t">POOL</span><span id="poolShots"></span><span id="poolBest"></span><button id="poolX" class="ibtn" type="button" aria-label="やめる">✕</button></div><canvas id="poolCv"></canvas><p class="pool-how"><span class="pc">ポインタで狙う ・ 長押しで力をためて離すと打つ ・ ←→ / Z でも</span><span class="touch">指で狙う ・ 押したまま力をためて離すと打つ</span></p><div id="poolMsg" hidden></div>';
    document.getElementById('app').appendChild(root);
    const cv = root.querySelector('#poolCv'), g = cv.getContext('2d');
    let balls = rack(), shots = 0, aim = Math.PI, hold = false, holdT = 0, power = 0, moving = false, done = false, best = o.best || null, potted = [], keyAim = 0, alive = true, padPrev = [];
    let S = 300, ox = 0, oz = 0, DPR = 1;   // pixels per metre and the table's top-left on the canvas
    const hud = () => { root.querySelector('#poolShots').textContent = `SHOTS ${shots}`; root.querySelector('#poolBest').textContent = best ? `BEST ${best}` : ''; };
    const fit = () => {
      DPR = Math.min(2, window.devicePixelRatio || 1);
      const bw = root.clientWidth - 24, bh = root.clientHeight - 120, rail = 0.11, tw = L + rail * 2, th = W + rail * 2;
      S = Math.max(120, Math.min(bw / tw, bh / th));
      cv.style.width = `${Math.round(tw * S)}px`; cv.style.height = `${Math.round(th * S)}px`;
      cv.width = Math.round(tw * S * DPR); cv.height = Math.round(th * S * DPR);
      ox = rail * S; oz = rail * S;
    };
    fit(); addEventListener('resize', fit); hud();
    const px = (x) => ox + (x + L / 2) * S, pz = (z) => oz + (z + W / 2) * S;
    const cue = () => balls[0];

    // where the aim line first touches a ball or a cushion
    function aimHit() {
      const c = cue(), dx = Math.cos(aim), dz = Math.sin(aim);
      let best = 1e9, hitB = null;
      for (const b of balls) { if (b === c || b.in) continue; const fx = b.x - c.x, fz = b.z - c.z, t = fx * dx + fz * dz; if (t <= 0) continue; const d2 = fx * fx + fz * fz - t * t, rr = 4 * R * R; if (d2 > rr) continue; const tt = t - Math.sqrt(rr - d2); if (tt < best) { best = tt; hitB = b; } }
      const tx = dx > 0 ? (L / 2 - R - c.x) / dx : dx < 0 ? (-L / 2 + R - c.x) / dx : 1e9, tz = dz > 0 ? (W / 2 - R - c.z) / dz : dz < 0 ? (-W / 2 + R - c.z) / dz : 1e9;
      const tw = Math.min(tx, tz);
      return hitB && best < tw ? { t: best, b: hitB } : { t: tw, b: null };
    }

    function step(dt) {
      let any = false;
      for (const b of balls) {
        if (b.in) continue;
        const sp = Math.hypot(b.vx, b.vz);
        if (sp > 0) { const ns = Math.max(0, sp - 0.32 * dt); b.vx *= ns / sp; b.vz *= ns / sp; if (ns < 0.004) b.vx = b.vz = 0; else any = true; }
        b.x += b.vx * dt; b.z += b.vz * dt;
        // pockets
        for (const [qx, qz, qr] of POCK) if (Math.hypot(b.x - qx, b.z - qz) < qr) { b.in = true; b.vx = b.vz = 0; potted.push(b); break; }
        if (b.in) continue;
        // cushions, except across a pocket's mouth
        const nearPocket = POCK.some(([qx, qz, qr]) => Math.hypot(b.x - qx, b.z - qz) < qr + R * 1.6);
        if (!nearPocket) {
          if (b.x < -L / 2 + R) { b.x = -L / 2 + R; b.vx = -b.vx * 0.78; } else if (b.x > L / 2 - R) { b.x = L / 2 - R; b.vx = -b.vx * 0.78; }
          if (b.z < -W / 2 + R) { b.z = -W / 2 + R; b.vz = -b.vz * 0.78; } else if (b.z > W / 2 - R) { b.z = W / 2 - R; b.vz = -b.vz * 0.78; }
        } else if (Math.abs(b.x) > L / 2 + R * 2 || Math.abs(b.z) > W / 2 + R * 2) { b.in = true; b.vx = b.vz = 0; potted.push(b); }
      }
      // ball on ball
      for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i], b = balls[j]; if (a.in || b.in) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
        if (d >= 2 * R || d === 0) continue;
        const nx = dx / d, nz = dz / d, over = 2 * R - d;
        a.x -= nx * over / 2; a.z -= nz * over / 2; b.x += nx * over / 2; b.z += nz * over / 2;
        const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        if (rel > 0) { const k = rel * 0.97; a.vx -= k * nx; a.vz -= k * nz; b.vx += k * nx; b.vz += k * nz; any = true; }
      }
      return any;
    }

    function settle() {   // all still: score the shot
      moving = false;
      const c = cue();
      if (c.in) {   // a scratch: one shot added, the cue ball back behind the line
        shots++; c.in = false; c.vx = c.vz = 0; c.x = HEAD; c.z = 0;
        while (balls.some((b) => b !== c && !b.in && Math.hypot(b.x - c.x, b.z - c.z) < 2.2 * R)) c.z += R * 2.2;
        msg('スクラッチ +1', 1200);
      }
      potted = potted.filter((b) => b.n);
      if (balls.every((b) => !b.n || b.in)) {
        done = true; const prev = best; if (!best || shots < best) best = shots; hud();
        msg(`CLEAR!  ${shots} SHOTS${!prev || shots < prev ? '  — BEST' : ''}`, 0, true);
        if (o.onBest) o.onBest(best);
      }
      hud();
    }
    let msgT = null;
    function msg(text, ms, again) {
      const m = root.querySelector('#poolMsg'); m.hidden = false; m.innerHTML = '';
      const s = document.createElement('span'); s.textContent = text; m.appendChild(s);
      if (again) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn primary'; b.textContent = 'もう一度'; b.addEventListener('click', reset); m.appendChild(b); setTimeout(() => b.focus(), 50); }
      clearTimeout(msgT); if (ms) msgT = setTimeout(() => { m.hidden = true; }, ms);
    }
    function reset() { balls = rack(); shots = 0; done = false; potted = []; root.querySelector('#poolMsg').hidden = true; hud(); }
    function shoot() {
      if (moving || done) return;
      const sp = 0.35 + power * 3.9, c = cue();
      c.vx = Math.cos(aim) * sp; c.vz = Math.sin(aim) * sp; shots++; moving = true; hold = false; power = 0; hud();
    }

    // input
    const toTable = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left - ox) / S - L / 2, z: (e.clientY - r.top - oz) / S - W / 2 }; };
    const aimAt = (e) => { if (moving || done) return; const p = toTable(e), c = cue(); aim = Math.atan2(p.z - c.z, p.x - c.x); };
    cv.addEventListener('pointermove', aimAt);
    cv.addEventListener('pointerdown', (e) => { e.preventDefault(); aimAt(e); if (!moving && !done) { hold = true; holdT = 0; } try { cv.setPointerCapture(e.pointerId); } catch (_) { /* */ } });
    cv.addEventListener('pointerup', () => { if (hold) shoot(); });
    cv.addEventListener('pointercancel', () => { hold = false; power = 0; });
    const onKey = (e) => {
      e.stopImmediatePropagation();   // while the table is open, its keys are its own
      if (e.key === 'Escape' || e.code === 'KeyX') { e.preventDefault(); close(); return; }
      if (e.key === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); keyAim = e.type === 'keydown' ? -1 : 0; }
      if (e.key === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); keyAim = e.type === 'keydown' ? 1 : 0; }
      if (e.code === 'KeyZ' || e.code === 'Space' || e.key === 'Enter') {
        if (e.target && e.target.tagName === 'BUTTON') return;
        e.preventDefault();
        if (e.type === 'keydown' && !e.repeat && !moving && !done) { hold = true; holdT = 0; }
        if (e.type === 'keyup' && hold) shoot();
      }
    };
    addEventListener('keydown', onKey, true); addEventListener('keyup', onKey, true);
    root.querySelector('#poolX').addEventListener('click', close);

    function close() {
      if (!alive) return; alive = false;
      removeEventListener('keydown', onKey, true); removeEventListener('keyup', onKey, true); removeEventListener('resize', fit);
      root.remove(); if (o.onClose) o.onClose(best);
    }

    // drawing
    function ballDraw(b, x, z, rr) {
      const c = b.n === 0 ? '#f4f1e6' : colOf(b.n), stripe = b.n > 8;
      g.save(); g.beginPath(); g.arc(x, z, rr, 0, 7); g.clip();
      g.fillStyle = stripe ? '#f4f1e6' : c; g.fillRect(x - rr, z - rr, rr * 2, rr * 2);
      if (stripe) { g.fillStyle = c; g.fillRect(x - rr, z - rr * 0.55, rr * 2, rr * 1.1); }
      if (b.n) { g.fillStyle = '#f4f1e6'; g.beginPath(); g.arc(x, z, rr * 0.48, 0, 7); g.fill(); g.fillStyle = '#111'; g.font = `700 ${Math.round(rr * 0.62)}px Hind, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(b.n), x, z + rr * 0.04); }
      const sh = g.createRadialGradient(x - rr * 0.35, z - rr * 0.4, rr * 0.1, x, z, rr * 1.05); sh.addColorStop(0, 'rgba(255,255,255,.55)'); sh.addColorStop(0.35, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.35)');
      g.fillStyle = sh; g.fillRect(x - rr, z - rr, rr * 2, rr * 2); g.restore();
    }
    function draw() {
      g.setTransform(DPR, 0, 0, DPR, 0, 0);
      const tw = cv.width / DPR, th = cv.height / DPR;
      // rails and felt
      const wood = g.createLinearGradient(0, 0, 0, th); wood.addColorStop(0, '#5a3220'); wood.addColorStop(1, '#3a1f14');
      g.fillStyle = wood; g.beginPath(); g.roundRect ? g.roundRect(0, 0, tw, th, 14) : g.rect(0, 0, tw, th); g.fill();
      const felt = g.createRadialGradient(tw / 2, th / 2, 10, tw / 2, th / 2, tw * 0.6); felt.addColorStop(0, '#1d7a5a'); felt.addColorStop(1, '#0f4f3a');
      g.fillStyle = felt; g.fillRect(ox - R * S * 0.6, oz - R * S * 0.6, L * S + R * S * 1.2, W * S + R * S * 1.2);
      g.fillStyle = 'rgba(255,255,255,.18)'; for (let i = 1; i < 8; i++) { if (i === 4) continue; for (const zz of [oz - 0.055 * S, oz + W * S + 0.055 * S]) { g.beginPath(); g.arc(ox + (i * L * S) / 8, zz, 2.2, 0, 7); g.fill(); } }
      for (let i = 1; i < 4; i++) for (const xx of [ox - 0.055 * S, ox + L * S + 0.055 * S]) { g.beginPath(); g.arc(xx, oz + (i * W * S) / 4, 2.2, 0, 7); g.fill(); }
      g.strokeStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.moveTo(px(HEAD), pz(-W / 2)); g.lineTo(px(HEAD), pz(W / 2)); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.arc(px(FOOT), pz(0), 2, 0, 7); g.fill();
      for (const [qx, qz, qr] of POCK) { g.fillStyle = '#060606'; g.beginPath(); g.arc(px(qx), pz(qz), qr * S * 0.92, 0, 7); g.fill(); }
      // aim line, ghost ball and cue stick
      const c = cue();
      if (!moving && !done && !c.in) {
        const h = aimHit(), dx = Math.cos(aim), dz = Math.sin(aim), ex = c.x + dx * h.t, ez = c.z + dz * h.t;
        g.setLineDash([4, 5]); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(px(c.x), pz(c.z)); g.lineTo(px(ex), pz(ez)); g.stroke(); g.setLineDash([]);
        g.strokeStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(px(ex), pz(ez), R * S, 0, 7); g.stroke();
        if (h.b) { const nx = h.b.x - ex, nz = h.b.z - ez, nl = Math.hypot(nx, nz) || 1; g.strokeStyle = 'rgba(255,230,160,.6)'; g.beginPath(); g.moveTo(px(h.b.x), pz(h.b.z)); g.lineTo(px(h.b.x + (nx / nl) * 0.25), pz(h.b.z + (nz / nl) * 0.25)); g.stroke(); }
        const back = 0.03 + power * 0.18, sx = c.x - dx * (R + back), sz = c.z - dz * (R + back), ex2 = sx - dx * 1.1, ez2 = sz - dz * 1.1;
        const cg = g.createLinearGradient(px(sx), pz(sz), px(ex2), pz(ez2)); cg.addColorStop(0, '#e8dcc0'); cg.addColorStop(0.03, '#3a6ab0'); cg.addColorStop(0.05, '#d9b98a'); cg.addColorStop(0.7, '#8a5a32'); cg.addColorStop(1, '#2a1610');
        g.strokeStyle = cg; g.lineCap = 'round'; g.lineWidth = Math.max(3, S * 0.012); g.beginPath(); g.moveTo(px(sx), pz(sz)); g.lineTo(px(ex2), pz(ez2)); g.stroke();
      }
      for (const b of balls) if (!b.in) { g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.arc(px(b.x) + 2, pz(b.z) + 3, R * S, 0, 7); g.fill(); }
      for (const b of balls) if (!b.in) ballDraw(b, px(b.x), pz(b.z), R * S);
      // potted balls along the bottom rail, and the power gauge on the right
      potted.filter((b) => b.n).forEach((b, i) => ballDraw(b, ox + i * R * S * 2.3 + R * S, th - oz * 0.5, R * S * 0.8));
      if (hold || power > 0) { const gh = th - oz * 2, gy = oz + gh * (1 - power); g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(tw - ox * 0.62, oz, ox * 0.3, gh); g.fillStyle = power > 0.8 ? '#ff7a3a' : '#ffd27a'; g.fillRect(tw - ox * 0.62, gy, ox * 0.3, oz + gh - gy); }
    }

    let last = performance.now();
    function frame(now) {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      // a gamepad: left stick aims, A holds and strikes, B leaves
      const gp = navigator.getGamepads ? [...navigator.getGamepads()].find((q) => q && q.connected) : null;
      if (gp) { const pr = gp.buttons.map((b) => b.pressed), dn = (i) => pr[i] && !padPrev[i], up = (i) => !pr[i] && padPrev[i];
        const ax = gp.axes[0] || 0, az = gp.axes[1] || 0; if (!moving && Math.hypot(ax, az) > 0.5) aim = Math.atan2(az, ax);
        if (dn(0) && !moving && !done) { hold = true; holdT = 0; } if (up(0) && hold) shoot(); if (dn(1)) { close(); return; } padPrev = pr; }
      if (keyAim && !moving) aim += keyAim * dt * 1.1;
      if (hold) { holdT += dt; power = 0.5 - 0.5 * Math.cos(holdT * 2.6); }
      if (moving) { let any = false; for (let k = 0; k < 8; k++) any = step(dt / 8) || any; if (!any) settle(); }
      draw();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return { close };
  }

  SW.Pool = { open };
})();
