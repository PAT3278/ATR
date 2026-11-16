/*
 * Pool: the physics of one table, with no drawing of its own. The game plays it on the table in the pool hall on the
 * plaza (src/game.js), in the world, with the camera brought down over the cloth.
 *
 *   const s = SW.PoolSim.rack()          // { balls: [{ n, x, z, vx, vz, in }], potted: [] }; ball 0 is the cue ball
 *   SW.PoolSim.step(s, dt) -> moving     // advance; potted balls are flagged .in and pushed to s.potted
 *   SW.PoolSim.aimHit(s, angle)          // where the aim line first meets a ball or a cushion: { t, b }
 *   SW.PoolSim.respot(s)                 // the cue ball back behind the head string
 *
 * Metres, x along the table's length, z across it, origin at the middle.
 */
(function () {
  'use strict';
  const SW = (window.SW = window.SW || {});
  const L = 2.24, W = 1.12, R = 0.0286, HEAD = -L / 4, FOOT = L / 4;
  const POCK = [[-L / 2, -W / 2, 0.072], [0, -W / 2, 0.062], [L / 2, -W / 2, 0.072], [-L / 2, W / 2, 0.072], [0, W / 2, 0.062], [L / 2, W / 2, 0.072]];
  const COLS = { 1: '#f1c232', 2: '#2457c5', 3: '#d23a2a', 4: '#5b2d8f', 5: '#ef7a1a', 6: '#1f8a4a', 7: '#7a1f22', 8: '#111111' };
  const colOf = (n) => (n === 0 ? '#f4f1e6' : COLS[n > 8 ? n - 8 : n]);

  function rack() {
    const balls = [{ n: 0, x: HEAD, z: 0, vx: 0, vz: 0, in: false }];
    const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];   // the 8 in the middle of the third row
    let k = 0;
    for (let row = 0; row < 5; row++) for (let i = 0; i <= row; i++) balls.push({ n: order[k++], x: FOOT + row * R * 1.75, z: (i - row / 2) * R * 2.02, vx: 0, vz: 0, in: false });
    return { balls, potted: [] };
  }

  function step(s, dt) {
    const balls = s.balls; let any = false;
    for (const b of balls) {
      if (b.in) continue;
      const sp = Math.hypot(b.vx, b.vz);
      if (sp > 0) { const ns = Math.max(0, sp - 0.32 * dt); b.vx *= ns / sp; b.vz *= ns / sp; if (ns < 0.004) b.vx = b.vz = 0; else any = true; }
      b.x += b.vx * dt; b.z += b.vz * dt;
      for (const [qx, qz, qr] of POCK) if (Math.hypot(b.x - qx, b.z - qz) < qr) { b.in = true; b.px = qx; b.pz = qz; b.vx = b.vz = 0; s.potted.push(b); break; }
      if (b.in) continue;
      const nearPocket = POCK.some(([qx, qz, qr]) => Math.hypot(b.x - qx, b.z - qz) < qr + R * 1.6);
      if (!nearPocket) {   // cushions, except across a pocket's mouth
        if (b.x < -L / 2 + R) { b.x = -L / 2 + R; b.vx = -b.vx * 0.78; } else if (b.x > L / 2 - R) { b.x = L / 2 - R; b.vx = -b.vx * 0.78; }
        if (b.z < -W / 2 + R) { b.z = -W / 2 + R; b.vz = -b.vz * 0.78; } else if (b.z > W / 2 - R) { b.z = W / 2 - R; b.vz = -b.vz * 0.78; }
      } else if (Math.abs(b.x) > L / 2 + R * 2 || Math.abs(b.z) > W / 2 + R * 2) { b.in = true; b.px = b.x; b.pz = b.z; b.vx = b.vz = 0; s.potted.push(b); }
    }
    for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i], b = balls[j]; if (a.in || b.in) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d >= 2 * R || d === 0) continue;
      const nx = dx / d, nz = dz / d, over = 2 * R - d;
      a.x -= (nx * over) / 2; a.z -= (nz * over) / 2; b.x += (nx * over) / 2; b.z += (nz * over) / 2;
      const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (rel > 0) { const k = rel * 0.97; a.vx -= k * nx; a.vz -= k * nz; b.vx += k * nx; b.vz += k * nz; any = true; }
    }
    return any;
  }

  function aimHit(s, aim) {
    const c = s.balls[0], dx = Math.cos(aim), dz = Math.sin(aim);
    let best = 1e9, hitB = null;
    for (const b of s.balls) { if (b === c || b.in) continue; const fx = b.x - c.x, fz = b.z - c.z, t = fx * dx + fz * dz; if (t <= 0) continue; const d2 = fx * fx + fz * fz - t * t, rr = 4 * R * R; if (d2 > rr) continue; const tt = t - Math.sqrt(rr - d2); if (tt < best) { best = tt; hitB = b; } }
    const tx = dx > 0 ? (L / 2 - R - c.x) / dx : dx < 0 ? (-L / 2 + R - c.x) / dx : 1e9, tz = dz > 0 ? (W / 2 - R - c.z) / dz : dz < 0 ? (-W / 2 + R - c.z) / dz : 1e9;
    const tw = Math.min(tx, tz);
    return hitB && best < tw ? { t: best, b: hitB } : { t: tw, b: null };
  }

  function respot(s) { const c = s.balls[0]; c.in = false; c.vx = c.vz = 0; c.x = HEAD; c.z = 0; while (s.balls.some((b) => b !== c && !b.in && Math.hypot(b.x - c.x, b.z - c.z) < 2.2 * R)) c.z += R * 2.2; }

  SW.PoolSim = { L, W, R, HEAD, FOOT, POCK, colOf, rack, step, aimHit, respot };
})();
