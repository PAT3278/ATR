/*
 * More places: FIELD (combat inside a New York high-rise), SHOT (racing an elevated
 * expressway at night), OHH (speeding along a coastal mountain road).
 * Same conventions as places.js: viewpoint at the origin, view towards local -Z,
 * path arriving from +Z.
 *
 * SHOT and OHH use a "treadmill": while you are looking at the view, the roadside
 * scenery slides past and wraps around, so the camera seems to drive forever.
 */
(function () {
  'use strict';
  const SW = window.SW;
  const PLACES = SW.PLACES;
  const band = SW.band;
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lin = (h) => new THREE.Color(h).convertSRGBToLinear();
  const basic = (hex, o = {}) => { const m = new THREE.MeshBasicMaterial({ color: lin(hex), ...o }); m.userData.lin = true; return m; };
  const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const glowM = (hex, opacity = 1) => basic(hex, { transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });

  // Things that slide along local X and wrap within [-half, half].
  function treadmill(half) {
    const items = [];
    let off = 0;
    return {
      add(obj) { items.push({ obj, base: obj.position.x }); return obj; },
      // Outside the view, keep only what lies along the real road so it doesn't spill into neighbours.
      clip(show, limit) { for (const it of items) it.obj.visible = show || Math.abs(it.obj.position.x) < limit; },
      move(dx) {
        off += dx;
        const L = half * 2;
        for (const it of items) { let x = (it.base + off + half) % L; if (x < 0) x += L; it.obj.position.x = x - half; }
      },
    };
  }

  // A small car: body plus head and tail lights. Faces +X.
  function car(E, color, r) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.1, 1.9), E.mat(color, { rough: 0.35, metal: 0.4 }));
    body.position.y = 0.75; body.castShadow = true;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 1.7), E.mat('#151820', { rough: 0.2, metal: 0.5 }));
    cab.position.set(-0.3, 1.6, 0);
    g.add(body, cab);
    for (const z of [-0.65, 0.65]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.4), basic('#fff6d8')); h.position.set(2.12, 0.85, z);
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.45), basic('#ff2a2a')); t.position.set(-2.12, 0.9, z);
      g.add(h, t);
    }
    g.userData.v = 0;
    return g;
  }

  /* ------------------------------------------------------------------ */
  /* FIELD — firefight on an office floor in a New York high-rise        */
  /* ------------------------------------------------------------------ */
  PLACES.field = {
    build(p, E) {
      const g = p.group, r = E.rng(101);
      const W = 20, Z0 = 8, Z1 = -28, H = 4.4;
      const floor = E.plane(W * 2, Z0 - Z1, E.mat('#4b4d55', { map: E.tex('paving', 10, 9), rough: 0.5, metal: 0.1 }));
      floor.position.set(0, 0.04, (Z0 + Z1) / 2);
      g.add(floor); p.pick(floor);
      const ceil = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 0.4, 0.4, Z0 - Z1 + 0.4), E.mat('#202228'));
      ceil.position.set(0, H + 0.2, (Z0 + Z1) / 2); ceil.castShadow = true;
      g.add(ceil);

      // Pillars
      for (const x of [-12, -4, 4, 12]) for (const z of [-3, -11, -19]) {
        const pl = new THREE.Mesh(new THREE.BoxGeometry(0.9, H, 0.9), E.mat('#6a6c74'));
        pl.position.set(x, H / 2, z); pl.castShadow = true; g.add(pl);
        p.addBox(x, z, 0.45, 0.45);
      }
      // Glass curtain walls with mullions; the front has a doorway.
      const glassM = new THREE.MeshStandardMaterial({ color: lin('#7fa6c8'), transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.6, depthWrite: false });
      glassM.userData.lin = true;
      const mullM = E.mat('#2d3038', { metal: 0.6, rough: 0.4 });
      const wall = (x0, z0, x1, z1) => {
        const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0);
        const gl = new THREE.Mesh(new THREE.PlaneGeometry(len, H), glassM);
        gl.position.set((x0 + x1) / 2, H / 2, (z0 + z1) / 2); gl.rotation.y = -ang; g.add(gl);
        const n = Math.round(len / 4);
        for (let k = 0; k <= n; k++) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, H, 0.12), mullM);
          m.position.set(x0 + ((x1 - x0) * k) / n, H / 2, z0 + ((z1 - z0) * k) / n); g.add(m);
        }
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        p.addBox(cx, cz, Math.abs(x1 - x0) / 2 + 0.15, Math.abs(z1 - z0) / 2 + 0.15);
      };
      wall(-W, Z1, W, Z1); wall(-W, Z1, -W, Z0); wall(W, Z1, W, Z0);
      wall(-W, Z0, -3.5, Z0); wall(3.5, Z0, W, Z0);

      // Ceiling light strips
      const lights = [];
      for (const x of [-8, 0, 8]) for (const z of [1, -7, -15, -23]) {
        const m = basic('#dfe9ff');
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.06, 3.2), m);
        s.position.set(x, H - 0.04, z); g.add(s);
        lights.push({ m, base: m.color.clone(), seed: r() * 10 });
      }
      const fill = new THREE.PointLight(lin('#b9ccff'), 1.2, 40, 1.6);
      fill.position.set(0, H - 0.6, -10); g.add(fill);

      // Cover: desks on their side, crates, a server rack
      const deskM = E.mat('#8b8f99'), crateM = E.mat('#5a5040');
      [[-7, -6, 0.3], [6, -8, -0.2], [-2, -14, 0.1], [9, -16, 0.5], [-10, -18, -0.4], [2, -22, 0], [-14, -9, 1.3], [14, -4, 1.4]].forEach(([x, z, a], i) => {
        const big = i % 3 === 2;
        const m = new THREE.Mesh(new THREE.BoxGeometry(big ? 1.2 : 2.2, big ? 1.2 : 0.95, big ? 1.2 : 0.9), big ? crateM : deskM);
        m.position.set(x, big ? 0.6 : 0.48, z); m.rotation.y = a; m.castShadow = true; g.add(m);
        p.addBox(x, z, big ? 0.8 : 1.2, big ? 0.8 : 0.8);
      });

      // Manhattan outside the glass
      const winTex = E.tex('windows', 2, 10);
      const towerM = E.mat('#141821', { emissiveMap: winTex, emissive: '#ffffff', emissiveIntensity: 0.55, rough: 0.6 });
      const towers = [];
      for (let i = 0; i < 70; i++) {
        const lx = (r() - 0.5) * 190, lz = -36 - r() * 110;
        if (Math.abs(lx) < 24 && lz > -40) continue;
        const w = 6 + r() * 9, d = 6 + r() * 9, h = 25 + r() * 95;
        const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), towerM);
        b.position.set(lx, 0, lz); b.scale.set(w, h, d); g.add(b);
        if (r() < 0.25) { const sp = new THREE.Mesh(new THREE.ConeGeometry(w * 0.25, h * 0.25, 4), towerM); sp.position.set(lx, h + h * 0.12, lz); g.add(sp); }
        p.addBox(lx, lz, w / 2 + 0.3, d / 2 + 0.3);
        towers.push({ b, k: i % 24, h });
      }
      for (const [x, z] of [[-30, -60], [32, -75]]) {
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 4, 140, 16, 1, true).translate(0, 70, 0), glowM('#a9c4ff', 0.08));
        beam.position.set(x, 0, z); g.add(beam);
        towers.push({ beam, seed: x });
      }

      // Combat: red laser sights from the back, tracers and muzzle flashes on the beat, sparks.
      const lasers = [];
      for (let i = 0; i < 4; i++) {
        const m = glowM('#ff2626', 0.5);
        const l = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 34, 6).rotateX(Math.PI / 2).translate(0, 0, 17), m);
        l.position.set(-9 + i * 6, 1.35, -25.5); g.add(l);
        lasers.push({ l, m, seed: i * 1.7 });
      }
      const tracers = [];
      for (let i = 0; i < 14; i++) {
        const m = glowM('#ffd27a', 0);
        const tr = new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 0.05), m);
        tr.visible = false; g.add(tr);
        tracers.push({ tr, m, life: 0 });
      }
      const flashes = [0].map(() => { const l = new THREE.PointLight(lin('#ffb060'), 0, 18, 2); g.add(l); return l; });
      let ti = 0, fi = 0, lastShot = -1;
      const SP = 500, spos = new Float32Array(SP * 3).fill(-999), svel = new Float32Array(SP * 3), slife = new Float32Array(SP);
      let sh = 0;
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(spos, 3));
      const sparks = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.12, map: E.dot(), color: lin('#ffcf7a'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      sparks.material.userData.lin = true;
      sparks.frustumCulled = false; g.add(sparks);
      const covers = [[-7, -6], [6, -8], [-2, -14], [9, -16], [-10, -18], [2, -22], [-14, -9], [14, -4]];
      const shoot = (big) => {
        const a = covers[Math.floor(r() * covers.length)];
        let b = covers[Math.floor(r() * covers.length)];
        if (b === a) b = covers[(covers.indexOf(a) + 3) % covers.length];
        const ax = a[0], az = a[1], bx = b[0] + (r() - 0.5) * 2, bz = b[1] + (r() - 0.5) * 2, y = 1 + r() * 0.5;
        const t = tracers[ti]; ti = (ti + 1) % tracers.length;
        const len = Math.hypot(bx - ax, bz - az);
        t.tr.position.set((ax + bx) / 2, y, (az + bz) / 2);
        t.tr.scale.set(len, 1, 1);
        t.tr.rotation.y = -Math.atan2(bz - az, bx - ax);
        t.tr.visible = true; t.life = 0.14;
        const fl = flashes[fi]; fi = (fi + 1) % flashes.length;
        fl.position.set(ax, y, az); fl.intensity = RM ? 1 : big ? 6 : 3.5;
        for (let k = 0; k < (big ? 26 : 12); k++) {
          const i = sh; sh = (sh + 1) % SP;
          spos.set([bx, y, bz], i * 3);
          svel.set([(r() - 0.5) * 6, r() * 4, (r() - 0.5) * 6], i * 3);
          slife[i] = 0.4 + r() * 0.4;
        }
      };

      // Uptown brownstones along the approach: stoops with iron rails, and two performers on the steps.
      const perf = []; let stoopUp = 0;
      {
        const cr = E.rng(212), X = 6.6;
        const trimM = E.mat('#4a342a'), stepM = E.mat('#6b4c3c', { rough: 0.95 }), ironM = E.mat('#0f0e10', { metal: 0.6, rough: 0.5 }), doorM = E.mat('#24160f'), winDark = E.mat('#12141a', { rough: 0.2, metal: 0.5 }), winLit = new THREE.MeshBasicMaterial({ color: '#ffc980' });
        const BB = E.batch(g), bx = BB.box;   // static boxes, drawn instanced after BB.flush()
        const fig = (jacket, cap) => {
          const f = new THREE.Group(), skin = E.mat('#8a5a3c'), jm = E.mat(jacket, { rough: 0.8 }), pm = E.mat('#1d1f26');
          for (const sx of [-0.1, 0.1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.9, 8), pm); l.position.set(sx, 0.45, 0); f.add(l); }
          const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.19, 0.62, 10), jm); torso.position.y = 1.2; torso.scale.z = 0.7; f.add(torso);
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 10), skin); head.position.y = 1.68; f.add(head);
          const hat = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 8, 0, 6.3, 0, 1.6), E.mat(cap)); hat.position.y = 1.7; f.add(hat);
          const arms = [-1, 1].map((sd) => { const piv = new THREE.Group(); piv.position.set(sd * 0.27, 1.45, 0); const a = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.56, 8), jm); a.position.y = -0.28; piv.add(a); const hd = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), skin); hd.position.y = -0.6; piv.add(hd); f.add(piv); return piv; });
          const mic = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.2, 8), ironM); mic.position.y = -0.68; arms[1].add(mic);
          f.traverse((m) => { if (m.isMesh) m.castShadow = true; });
          return { f, arms, torso, head };
        };
        for (let i = 0; i < 4; i++) {
          const z0 = 17 + i * 6.2, H = 10.4 + (i % 2) * 0.9, wall = E.mat(['#6a4636', '#7d4034', '#5c4136', '#86563f'][i]), dz = z0 - 1.6;
          bx(8, H, 6.1, X + 4, H / 2, z0, wall);
          bx(0.7, 0.5, 6.3, X - 0.15, H - 0.1, z0, trimM); bx(0.3, 0.25, 6.2, X - 0.05, H - 0.75, z0, trimM, false);        // cornice
          bx(0.3, 0.18, 6.2, X - 0.05, 4.75, z0, trimM, false);                                                             // string course
          const win = (y, z, h = 1.7) => { bx(0.06, h, 0.95, X - 0.03, y, z, cr() < 0.45 ? winLit : winDark, false); bx(0.16, 0.2, 1.2, X - 0.06, y + h / 2 + 0.14, z, trimM, false); bx(0.2, 0.1, 1.15, X - 0.08, y - h / 2 - 0.05, z, trimM, false); };
          win(3.25, z0 + 0.35, 1.9); win(3.25, z0 + 2.0, 1.9); win(0.95, z0 + 1.2, 0.9);
          const star = i === 1 || i === 2;                                                                                 // the two houses with a performer
          for (const y of [6.3, 8.6]) for (const z of [-1.85, 0, 1.85]) if (!(star && y === 6.3 && z === 0)) win(y, z0 + z);
          let sash = null, hinge = null;
          if (star) {
            // the window they lean out of: a lit room behind a sash that slides up
            bx(0.03, 1.7, 0.95, X - 0.012, 6.3, z0, new THREE.MeshBasicMaterial({ color: '#c98a4a' }), false);
            sash = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.7, 0.95), winDark); sash.position.set(X - 0.045, 6.3, z0); g.add(sash);   // a real mesh: it slides
            bx(0.16, 0.2, 1.2, X - 0.06, 7.29, z0, trimM, false); bx(0.24, 0.1, 1.15, X - 0.1, 5.4, z0, trimM, false);
            // the door swings out on its hinge; behind it the hallway is dark
            bx(0.03, 2.4, 1.15, X - 0.012, 3.0, dz, new THREE.MeshBasicMaterial({ color: '#070606' }), false);
            hinge = new THREE.Group(); hinge.position.set(X - 0.05, 3.0, dz - 0.575); g.add(hinge);
            const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.4, 1.15), doorM); leaf.position.z = 0.575; hinge.add(leaf);
          } else bx(0.08, 2.4, 1.15, X - 0.04, 3.0, dz, doorM, false);
          bx(0.3, 0.3, 1.6, X - 0.1, 4.35, dz, trimM, false);                                                              // door hood
          bx(0.1, 0.22, 0.14, X - 0.08, 3.4, dz + 0.85, winLit, false);                                                     // door lamp
          for (let k = 0; k < 8; k++) bx(0.37, 0.225 * (k + 1), 1.75, X - 2.9 + k * 0.36, 0.1125 * (k + 1), dz, stepM);    // stoop
          for (const sd of [-1, 1]) {
            const rz = dz + sd * 0.95, rail = bx(3.45, 0.05, 0.05, X - 1.5, 1.85, rz, ironM, false); rail.rotation.z = 0.556;
            for (let k = 0; k < 7; k++) bx(0.03, 0.9, 0.03, X - 2.9 + k * 0.46, 0.5 + k * 0.288, rz, ironM, false);
            bx(0.12, 1.15, 0.12, X - 3.1, 0.58, rz, ironM, false);
          }
          for (let k = 0; k < 9; k++) bx(0.03, 0.8, 0.03, X - 3.1, 0.4, z0 + 0.1 + k * 0.34, ironM, false);                 // area railing
          bx(0.04, 0.04, 3.0, X - 3.1, 0.8, z0 + 1.5, ironM, false);
          p.addBox(X + 4, z0, 4.05, 3.1); p.addBox(X - 1.5, dz, 1.6, 1.0); p.addBox(X - 3.1, z0 + 1.5, 0.15, 1.55);
          if (i === 1 || i === 2) {
            const m = fig(i === 1 ? '#b3161d' : '#d8d2c0', i === 1 ? '#111111' : '#2a4a8a');
            const w = new THREE.Group(); w.add(m.f); g.add(w);
            perf.push({ ...m, w, sash, hinge, X, dz, z0, zo: i === 1 ? 0.25 : -0.25, yaw: i === 1 ? 0.3 : -0.3, s: i * 2.1 });
          }
        }
        const walk = E.plane(4, 26, E.mat('#77736c', { map: E.tex('paving', 2, 13), rough: 0.9 })); walk.position.set(X - 4.6, 0.045, 26.3); g.add(walk); p.pick(walk);
        const box2 = bx(0.6, 0.36, 0.28, X - 2.9 + 1 * 0.36, 0.45 + 0.18, 17 + 2 * 6.2 - 1.6 + 0.5, E.mat('#1a1a1d', { metal: 0.4 }));                               // boombox on a step
        box2.rotation.y = 0.3;
        BB.flush();
      }
      p.map = [{ t: 'rect', x: 10.6, z: 26.3, w: 8, h: 25, c: '#5a3d30' }, { t: 'rect', x: 0, z: -10, w: W * 2, h: Z0 - Z1, c: '#3c3e46' }, { t: 'rect', x: 0, z: -90, w: 190, h: 110, c: '#1c2230' }];
      p.grade = {
        top: '#05070f', bottom: '#1a2234', fog: '#0f141e', near: 24, far: 190,
        sun: '#9fb4ff', sunInt: 0.3, hemi: 0.28, sunDir: [0.2, 0.8, -0.4],
        tint: [0.96, 1.0, 1.1], expo: 1.25, sat: 0.95, stars: 0.15,
      };
      p.face = Math.PI;
      p.pathEnd = 11;
      p.clearR = 26;
      p.blocks = (lx, lz) => (lx > -8 && lx < 17 && lz >= 12 && lz < 44) || (Math.abs(lx) < 24 && lz < 13 && lz > -32) || (lz < -30 && lz > -150 && Math.abs(lx) < 100);

      p.update = (t, dt, f, v) => {
        // Shots on the kick, a burst on hard hits; a slow trickle so it never goes fully quiet.
        if (v > 0.05 && ((f.beat && t - lastShot > 0.1) || (f.level > 0.25 && t - lastShot > 1.6))) {
          lastShot = t;
          shoot(f.bass > 0.8);
          if (f.bass > 0.8) shoot(false);
        }
        tracers.forEach((tr) => {
          if (tr.life <= 0) return;
          tr.life -= dt;
          tr.m.opacity = Math.max(0, tr.life / 0.14);
          if (tr.life <= 0) tr.tr.visible = false;
        });
        flashes.forEach((l) => (l.intensity *= Math.exp(-dt * 18)));
        for (let i = 0; i < SP; i++) {
          if (slife[i] <= 0) continue;
          const j = i * 3;
          slife[i] -= dt;
          if (slife[i] <= 0) { spos[j + 1] = -999; continue; }
          svel[j + 1] -= 12 * dt;
          spos[j] += svel[j] * dt; spos[j + 1] = Math.max(0.05, spos[j + 1] + svel[j + 1] * dt); spos[j + 2] += svel[j + 2] * dt;
        }
        sg.attributes.position.needsUpdate = true;
        lasers.forEach((L, i) => {
          L.l.rotation.y = Math.sin(t * 0.6 + L.seed) * 0.45 + (i - 1.5) * 0.12;
          L.l.rotation.x = Math.sin(t * 0.9 + L.seed * 2) * 0.03;
          L.m.opacity = 0.25 + f.mid * 0.7;
        });
        lights.forEach((L) => {
          const flick = !RM && f.high > 0.35 && Math.sin(t * 37 + L.seed * 9) > 0.92 ? 0.15 : 1;
          L.m.color.copy(L.base).multiplyScalar(flick * (1 - f.pulse * 0.45));
        });
        fill.intensity = 0.9 * (1 - f.pulse * 0.5);
        towers.forEach((T) => {
          if (T.beam) { T.beam.rotation.z = Math.sin(t * 0.25 + T.seed) * 0.35; T.beam.material.opacity = 0.05 + f.mid * 0.1; }
        });
        towerM.emissiveIntensity = 0.4 + f.level * 0.6;
        // The two performers loop through: on the stoop -> up the steps and in through the door ->
        // leaning out of the first-floor window -> back down. 64 s per loop, matching the view's cuts.
        let upMax = 0;
        perf.forEach((m, i) => {
          const tc = (((t - i * 1.3) % 64) + 64) % 64, e = 0.35 + f.level * 1.4, b = Math.abs(Math.sin(t * 3.6 + m.s));
          const sx = m.X - 1.46, doorX = m.X + 0.6, lerp = (a, c, k) => a + (c - a) * k;
          const stairY = (x) => 0.225 * (Math.max(0, Math.min(7, Math.floor((x - (m.X - 3.085)) / 0.36))) + 1);
          let x = sx, y = 0.225 * 5, z = m.dz + m.zo, yaw = -Math.PI / 2 + m.yaw, lean = 0, door = 0, up = 0, vis = true, act = true;
          if (tc >= 24 && tc < 27) { const k = (tc - 24) / 3; x = lerp(sx, doorX, k); y = stairY(x); z = m.dz + m.zo * (1 - Math.min(1, k * 2)); yaw = Math.PI / 2; door = sstep(0, 0.3, k); act = false; vis = x < m.X + 0.25; }
          else if (tc >= 27 && tc < 29) { vis = false; door = 1 - sstep(27, 27.8, tc); }
          else if (tc >= 29 && tc < 56) { up = sstep(29.2, 30.4, tc) * (1 - sstep(54.6, 55.8, tc)); x = m.X + 0.56 + (1 - up) * 0.3; y = 4.52; z = m.z0; yaw = -Math.PI / 2 + m.yaw * 0.5; lean = 0.44 * up; vis = up > 0.03; }
          else if (tc >= 56 && tc < 58) { vis = false; door = sstep(57.2, 58, tc); }
          else if (tc >= 58 && tc < 61) { const k = (tc - 58) / 3; x = lerp(doorX, sx, k); y = stairY(x); z = m.dz + m.zo * Math.max(0, k * 2 - 1); door = 1 - sstep(0.6, 0.95, k); act = false; vis = x < m.X + 0.25; }
          upMax = Math.max(upMax, up);
          m.w.visible = vis;
          m.w.position.set(x, y + (act ? b * 0.05 * e + f.pulse * 0.06 : Math.abs(Math.sin(t * 9)) * 0.04), z);
          m.w.rotation.y = yaw; m.f.rotation.x = lean;
          m.hinge.rotation.y = 1.35 * door;   // swings inward, into the dark hallway, so it never crosses the performer
          const so = Math.max(up, 0); m.sash.scale.y = 1 - 0.6 * so; m.sash.position.y = 6.3 + 1.7 * 0.3 * so;
          m.torso.rotation.z = act ? Math.sin(t * 1.8 + m.s) * 0.1 * e : 0; m.head.rotation.x = act ? -f.pulse * 0.25 : 0;
          if (act) {
            m.arms[1].rotation.x = -1.9 + Math.sin(t * 2.2 + m.s) * 0.12; m.arms[1].rotation.z = -0.35;                         // mic hand up
            m.arms[0].rotation.x = -0.9 - Math.sin(t * 3.6 + m.s) * 0.6 * e; m.arms[0].rotation.z = (i ? 1 : -1) * 0.2 - 0.3; // free hand gesturing
          } else { const sw = Math.sin(t * 9) * 0.5; m.arms[0].rotation.set(sw, 0, 0); m.arms[1].rotation.set(-sw, 0, 0); }       // walking
        });
        stoopUp = upMax;
      };
      p.shot = (t, f) => {
        if (Math.floor(t / 16) % 2 === 1) {   // the stoop performance; pulls back and tilts up when they are at the windows
          const narrow = innerWidth / innerHeight < 0.8, who = Math.floor(t / 32) % 2, u = RM ? (stoopUp > 0.5 ? 1 : 0) : stoopUp;   // a portrait screen frames one performer per cut
          const zs = narrow ? (who ? 27.55 : 21.85) : 24.7, zw = narrow ? (who ? 29.4 : 23.2) : 26.3, zc = zs + (zw - zs) * u, a = Math.sin(t * 0.25) * (narrow ? 0.5 : 1.8);
          return { pos: [0.6 - 4.6 * u, 1.15 + 0.25 * u, zc + a * (1 - 0.6 * u)], look: [6.6, 2.5 + 3.5 * u, zc + a * 0.3], roll: Math.sin(t * 0.3) * 0.015 };
        }
        const k = RM ? 0 : f.pulse * 0.05;
        const x = Math.sin(t * 0.13) * 7;
        return { pos: [x + (Math.random() - 0.5) * k, 1.15 + (Math.random() - 0.5) * k, 3], look: [x * 0.4, 1.5, -24], roll: Math.sin(t * 0.2) * 0.02 };
      };
    },
  };

  /* ------------------------------------------------------------------ */
  /* SHOT — night run on an elevated expressway                          */
  /* ------------------------------------------------------------------ */
  PLACES.shot = {
    build(p, E) {
      const g = p.group, r = E.rng(131);
      const H = 7, HALF = 52, ZC = -15, WD = 16;
      const conc = E.mat('#6e6a68'), concD = E.mat('#4a4746');

      // Ramp up to an overlook platform beside the expressway
      const rampLen = Math.hypot(20, H), ang = Math.atan2(H, 20);
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(5, 0.5, rampLen), conc);
      ramp.position.set(0, H / 2 - 0.25, 16); ramp.rotation.x = ang; ramp.castShadow = ramp.receiveShadow = true;
      g.add(ramp); p.pick(ramp);
      const plat = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.5, 14.5), conc);
      plat.position.set(0, H - 0.25, -1.2); plat.castShadow = plat.receiveShadow = true;
      g.add(plat); p.pick(plat);
      for (const [x, z] of [[-3.6, -7], [3.6, -7], [-3.6, 4], [3.6, 4]]) {
        const pl = new THREE.Mesh(new THREE.BoxGeometry(0.8, H, 0.8), concD); pl.position.set(x, H / 2, z); g.add(pl);
      }
      const railM = E.mat('#9aa0a8', { metal: 0.6, rough: 0.4 });
      const rail = (x, z, w, d) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.05, d), railM); m.position.set(x, H + 0.5, z); g.add(m); };
      rail(0, -8.4, 8.6, 0.12); rail(-4.3, -1.2, 0.12, 14.5); rail(4.3, -1.2, 0.12, 14.5);
      p.ground = (lx, lz) => {
        if (Math.abs(lx) < 2.6 && lz >= 6 && lz <= 26) return (H * (26 - lz)) / 20;
        if (Math.abs(lx) < 4.4 && lz >= -8.6 && lz < 6) return H;
        return 0;
      };
      p.addBox(0, -8.7, 4.6, 0.25); p.addBox(-4.55, -1.2, 0.25, 7.6); p.addBox(4.55, -1.2, 0.25, 7.6);
      p.addBox(-2.85, 16, 0.25, 10); p.addBox(2.85, 16, 0.25, 10);

      // The expressway
      const deck = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 20, 1, WD), E.mat('#2a2a2f', { map: E.tex('asphalt', 30, 4), rough: 0.8 }));
      deck.position.set(0, H - 0.5, ZC); deck.receiveShadow = true; g.add(deck);
      for (const z of [ZC + WD / 2, ZC - WD / 2]) { const w = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 20, 1.4, 0.35), concD); w.position.set(0, H + 0.7, z); g.add(w); }
      const div = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 20, 0.6, 0.5), conc); div.position.set(0, H + 0.3, ZC); g.add(div);
      for (let x = -HALF; x <= HALF; x += 13) {
        const pl = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.2, H - 1, 10), concD); pl.position.set(x, (H - 1) / 2, ZC); g.add(pl);
        p.addCircle(x, ZC, 1.3);
      }
      // Tunnel mouths at both ends (hidden while viewing so the road seems endless)
      const tunnels = [];
      for (const s of [-1, 1]) {
        const tb = new THREE.Mesh(new THREE.BoxGeometry(14, H + 9, WD + 8), concD);
        tb.position.set(s * (HALF + 7), (H + 9) / 2, ZC); g.add(tb);
        const hole = new THREE.Mesh(new THREE.PlaneGeometry(WD - 1, 6), basic('#050407'));
        hole.position.set(s * HALF - s * 0.05, H + 3, ZC); hole.rotation.y = -s * Math.PI / 2; g.add(hole);
        tunnels.push(tb, hole);
        p.addBox(s * (HALF + 7), ZC, 7, WD / 2 + 4);
      }

      // Roadside things that stream past while viewing
      const tm = treadmill(HALF + 30);
      const lampHeadM = basic('#ffb04a'), dashM = basic('#d8d2c4'), poleM = E.mat('#3a3a40', { metal: 0.5 });
      for (let x = -HALF - 30; x < HALF + 30; x += 6) {
        for (const z of [ZC + 4, ZC - 4]) { const d = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.03, 0.18), dashM); d.position.set(x, H + 0.02, z); g.add(tm.add(d)); }
      }
      const lampGroup = [];
      for (let x = -HALF - 30; x < HALF + 30; x += 18) {
        const lp = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 7, 6), poleM); pole.position.y = 3.5;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 6), poleM); arm.position.set(0, 7, 0);
        lp.add(pole, arm);
        for (const z of [-2.8, 2.8]) { const hd = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.5), lampHeadM); hd.position.set(0, 6.9, z); lp.add(hd); }
        lp.position.set(x, H, ZC);
        g.add(tm.add(lp)); lampGroup.push(lp);
      }
      const signTex = E.textTex('SHOT  →  EXIT\n出口  1km', { w: 512, h: 256, color: '#ffffff', font: '700 72px "Hind","Noto Sans JP",sans-serif', font2: '700 56px "Noto Sans JP",sans-serif' });
      for (const x of [-30, 30]) {
        const gt = new THREE.Group();
        for (const z of [-WD / 2, WD / 2]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7, 0.4), poleM); c.position.set(0, 3.5, z); gt.add(c); }
        const beam = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, WD), poleM); beam.position.y = 7; gt.add(beam);
        const sign = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.6, 6), basic('#0e6b3c'));
        sign.position.set(0, 6.2, -3.6); gt.add(sign);
        const face = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 2.4), new THREE.MeshBasicMaterial({ map: signTex, transparent: true }));
        face.material.userData.lin = true;
        face.position.set(-0.11, 6.2, -3.6); face.rotation.y = -Math.PI / 2; gt.add(face);
        gt.position.set(x, H, ZC);
        g.add(tm.add(gt));
      }
      // City blocks around the expressway
      const winTex = E.tex('windows', 2, 6);
      const cityM = E.mat('#17141f', { emissiveMap: winTex, emissive: '#ffffff', emissiveIntensity: 0.6 });
      const blocks = [];
      for (let i = 0; i < 46; i++) {
        const x = -HALF - 30 + r() * (HALF * 2 + 60);
        const far = r() < 0.75;
        const z = far ? ZC - WD / 2 - 6 - r() * 40 : ZC + WD / 2 + 4 + r() * 3;
        if (!far && Math.abs(x) < 14) continue;
        const w = 7 + r() * 8, d = 7 + r() * 8, h = far ? 10 + r() * 34 : 4 + r() * 4;
        const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), cityM);
        b.position.set(x, 0, z); b.scale.set(w, h, d); g.add(tm.add(b));
        blocks.push({ b, h, k: i % 24 });
      }
      p.addBox(0, ZC - WD / 2 - 27, HALF + 30, 22);

      // Traffic
      const lanes = [{ z: ZC + 2, v: 22 }, { z: ZC + 5.5, v: 27 }, { z: ZC - 2, v: -24 }, { z: ZC - 5.5, v: -29 }];
      const palette = ['#d8d8dc', '#1d1f26', '#b8202a', '#2c4a8a', '#e0b030', '#5a5f66'];
      const cars = [];
      for (let i = 0; i < 18; i++) {
        const ln = lanes[i % 4];
        const c = car(E, palette[Math.floor(r() * palette.length)], r);
        c.position.set(-HALF + r() * HALF * 2, H, ln.z);
        if (ln.v < 0) c.rotation.y = Math.PI;
        c.userData.v = ln.v * (0.85 + r() * 0.3);
        g.add(c); cars.push(c);
      }

      p.map = [{ t: 'rect', x: 0, z: ZC, w: HALF * 2, h: WD, c: '#3a3840' }, { t: 'rect', x: 0, z: 16, w: 5, h: 20, c: '#6e6a68' }];
      p.grade = {
        top: '#07050e', bottom: '#2b1730', fog: '#1d1424', near: 18, far: 125,
        sun: '#ffb36b', sunInt: 0.3, hemi: 0.3, sunDir: [-0.3, 0.7, -0.4],
        tint: [1.08, 0.97, 0.9], expo: 1.25, sat: 1.1, stars: 0.2,
      };
      p.face = Math.PI;
      p.pathEnd = 27;
      p.clearR = 14;
      p.blocks = (lx, lz) => (Math.abs(lx) < HALF + 32 && lz < 0 && lz > -80) || (Math.abs(lx) < 8 && lz < 30);

      let speed = 0;
      p.update = (t, dt, f, v, viewing) => {
        const target = viewing ? 34 + f.level * 26 + f.pulse * 8 : 0;
        speed += (target - speed) * Math.min(1, dt * (viewing ? 1.5 : 4));
        tm.move(-speed * dt);
        tm.clip(viewing, HALF - 4);
        tunnels.forEach((o) => (o.visible = !viewing));
        const L = (HALF + 30) * 2;
        cars.forEach((c) => {
          c.position.x += (c.userData.v - speed) * dt;
          if (c.position.x > HALF + 30) c.position.x -= L;
          if (c.position.x < -HALF - 30) c.position.x += L;
          c.visible = viewing || Math.abs(c.position.x) < HALF;
        });
        lampHeadM.color.setRGB(1, 0.43, 0.06).multiplyScalar(0.8 + f.pulse * 0.9);
        cityM.emissiveIntensity = 0.35 + f.mid * 1.4;
        blocks.forEach((B) => { B.b.scale.y += (B.h * (0.75 + band(f, B.k, 24) * 0.5) - B.b.scale.y) * Math.min(1, dt * 8); });
      };
      p.shot = (t, f) => {
        const s = RM ? 0 : f.pulse * 0.06;
        return { pos: [-40, H + 1.25 + s, ZC + 3.8 + Math.sin(t * 0.4) * 0.6], look: [10, H + 1.0, ZC + 2.5 + Math.sin(t * 0.4 + 0.6) * 1.5], roll: Math.sin(t * 0.4) * 0.02 };
      };
    },
  };

  /* ------------------------------------------------------------------ */
  /* OHH — speeding along a coastal road through a gorge at golden hour  */
  /* ------------------------------------------------------------------ */
  PLACES.ohh = {
    build(p, E) {
      const g = p.group, r = E.rng(151);
      const HR = 36, HH = 12, PL = 9, RZ = -15, RH = 11.5, HALF = 60;
      const height = (lx, lz) => {
        const d = Math.hypot(lx, lz);
        if (d <= PL) return HH;
        if (d >= HR) return 0;
        return HH * 0.5 * (1 + Math.cos((Math.PI * (d - PL)) / (HR - PL)));
      };
      p.ground = height;
      const hg = new THREE.RingGeometry(0.01, HR, 56, 22);
      const hp = hg.attributes.position;
      for (let i = 0; i < hp.count; i++) {
        const x = hp.getX(i), y = hp.getY(i);
        hp.setZ(i, height(x, -y) + (Math.hypot(x, y) > PL + 1 && Math.hypot(x, y) < HR - 1 ? (r() - 0.5) * 0.5 : 0) + 0.01);
      }
      hg.computeVertexNormals();
      const hill = new THREE.Mesh(hg, E.mat('#728a4c', { flat: true }));
      hill.rotation.x = -Math.PI / 2; hill.receiveShadow = true;
      g.add(hill); p.pick(hill);
      const rockM = E.mat('#8a7f70', { flat: true }), rockD = E.mat('#6c6255', { flat: true });
      for (let i = 0; i < 18; i++) {
        const a = r() * Math.PI * 2, d = PL + 4 + r() * 20;
        const lx = Math.cos(a) * d, lz = Math.sin(a) * d;
        if (lz > -2 && Math.abs(lx) < 6) continue;
        const s = 0.8 + r() * 1.8;
        const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), r() < 0.5 ? rockM : rockD);
        m.position.set(lx, height(lx, lz) + s * 0.3, lz); m.rotation.set(r() * 3, r() * 3, 0); m.castShadow = true; g.add(m);
        p.addCircle(lx, lz, s * 0.8);
      }
      // Overlook: guardrail at the edge, a bench
      const railM = E.mat('#d8d6cf', { metal: 0.5, rough: 0.4 });
      const gr = new THREE.Mesh(new THREE.BoxGeometry(12, 0.35, 0.15), railM);
      gr.position.set(0, HH + 0.75, -7.6); g.add(gr);
      for (let x = -6; x <= 6; x += 2) { const pp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), railM); pp.position.set(x, HH + 0.4, -7.6); g.add(pp); }
      p.addBox(0, -7.8, 6.5, 0.3);
      E.bench(g, 3.2, -5.6, Math.PI, HH);
      p.addBox(3.2, -5.6, 1.2, 0.4);

      // Sea below and beyond
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(700, 380), new THREE.ShaderMaterial({
        uniforms: { t: { value: 0 }, level: { value: 0 }, a: { value: new THREE.Color('#ffd08a') }, b: { value: new THREE.Color('#1f5f86') }, c: { value: new THREE.Color('#0d3552') } },
        vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: 'uniform float t,level;uniform vec3 a,b,c;varying vec2 vUv;void main(){float y=vUv.y;vec3 col=mix(c,b,y);' +
          'float w=sin(vUv.x*900.+t*1.1+sin(vUv.y*300.+t*.7)*3.)*sin(vUv.y*520.-t*1.6);' +
          'float path=exp(-pow((vUv.x-.5)*9.,2.))*smoothstep(.2,1.,y);' +
          'col+=a*smoothstep(.6,1.,w)*(.15+path*(1.4+level*2.));col=mix(col,a*.9,pow(y,8.)*.6);gl_FragColor=vec4(pow(col,vec3(2.2)),1.);}',
      }));
      sea.rotation.x = -Math.PI / 2; sea.position.set(0, 0.07, -230);
      g.add(sea); p.pick(sea);
      p.water(0, -230, 350, 190);
      const beach = E.plane(260, 8, E.mat('#e2cf9e', { map: E.tex('sand', 60, 2) }));
      beach.position.set(0, 0.06, -37); g.add(beach);
      // Sea stacks and the far mountains
      for (let i = 0; i < 9; i++) {
        const s = 4 + r() * 9;
        const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockD);
        m.position.set(-110 + i * 27 + r() * 10, s * 0.6, -55 - r() * 50); m.scale.y = 1.6 + r(); m.castShadow = true; g.add(m); p.addCircle(m.position.x, m.position.z, s * 0.9);
      }
      const mtnM = E.mat('#6f86a6', { flat: true });
      for (let i = 0; i < 9; i++) {
        const h = 60 + r() * 90, rad = 50 + r() * 60;
        const m = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 7), mtnM);
        m.position.set(-300 + i * 80 + r() * 30, h / 2 - 2, -330 - r() * 60); m.rotation.y = r() * 3; g.add(m);
      }
      const sun = new THREE.Mesh(new THREE.CircleGeometry(16, 40), basic('#fff0c2', { fog: false }));
      sun.position.set(30, 22, -420); g.add(sun);

      // Coastal viaduct running past the overlook
      const deck = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 40, 0.8, 8), E.mat('#3a393c', { map: E.tex('asphalt', 30, 2) }));
      deck.position.set(0, RH - 0.4, RZ); deck.receiveShadow = true; g.add(deck);
      for (let x = -HALF - 20; x <= HALF + 20; x += 16) {
        const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, RH, 8), E.mat('#bdb6a8')); pl.position.set(x, RH / 2 - 0.4, RZ); g.add(pl);
        if (Math.abs(x) > 8) p.addCircle(x, RZ, 1.2);
      }
      const tm = treadmill(HALF + 20);
      const dashM = basic('#f2efe4'), postM = E.mat('#e8e6df', { metal: 0.4 });
      for (let x = -HALF - 20; x < HALF + 20; x += 5) {
        const d = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.03, 0.16), dashM); d.position.set(x, RH + 0.02, RZ); g.add(tm.add(d));
        for (const z of [RZ - 4.1, RZ + 4.1]) { const pp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.9, 0.14), postM); pp.position.set(x, RH + 0.45, z); g.add(tm.add(pp)); }
      }
      // Gorge walls and pines that flank the road
      const wallM = E.mat('#857664', { flat: true }), pineM = E.mat('#2e5a36', { flat: true });
      const walls = [];
      for (let i = 0; i < 22; i++) {
        const x = -HALF - 20 + i * ((HALF * 2 + 40) / 22);
        const s = 6 + r() * 8;
        const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), wallM);
        m.position.set(x, RH - 3 + s * 0.5, RZ + 7 + s * 0.5);
        m.scale.y = 1.3 + r() * 1.2; m.rotation.y = r() * 3; m.castShadow = true;
        m.visible = false;
        g.add(tm.add(m)); walls.push(m);
        const pine = new THREE.Mesh(new THREE.ConeGeometry(1.4, 5, 6), pineM);
        pine.position.set(x + 3, RH + 2.5, RZ + 5.5); pine.visible = false;
        g.add(tm.add(pine)); walls.push(pine);
      }
      const cars = [];
      const palette = ['#e8e6e0', '#c23a2a', '#2a5bc2', '#1b1c22'];
      for (let i = 0; i < 6; i++) {
        const c = car(E, palette[i % palette.length], r);
        const east = i % 2 === 0;
        c.position.set(-HALF + r() * HALF * 2, RH, RZ + (east ? 1.9 : -1.9));
        if (!east) c.rotation.y = Math.PI;
        c.userData.v = (east ? 1 : -1) * (20 + r() * 8);
        g.add(c); cars.push(c);
      }

      p.map = [{ t: 'circle', x: 0, z: 0, r: HR, c: '#5d7342' }, { t: 'rect', x: 0, z: -230, w: 700, h: 400, c: '#244f73' }, { t: 'rect', x: 0, z: RZ, w: HALF * 2, h: 8, c: '#3a393c' }];
      p.grade = {
        top: '#4c86c8', bottom: '#ffd69c', fog: '#f1c99c', near: 70, far: 460,
        sun: '#ffd08a', sunInt: 2.9, hemi: 0.75, sunDir: [0.07, 0.06, -1],
        tint: [1.08, 1.0, 0.9], expo: 1.04, sat: 1.15, stars: 0,
      };
      p.face = Math.PI;
      p.pathEnd = 3;
      p.clearR = HR + 3;
      p.blocks = (lx, lz) => Math.hypot(lx, lz) < HR + 4 || (lz < -6 && lz > -500 && Math.abs(lx) < 360);

      let speed = 0;
      p.update = (t, dt, f, v, viewing) => {
        sea.material.uniforms.t.value = t;
        sea.material.uniforms.level.value += (f.level - sea.material.uniforms.level.value) * Math.min(1, dt * 6);
        const target = viewing ? 28 + f.level * 30 + f.pulse * 6 : 0;
        speed += (target - speed) * Math.min(1, dt * (viewing ? 1.2 : 4));
        tm.move(-speed * dt);
        walls.forEach((w) => (w.visible = viewing));
        const L = (HALF + 20) * 2;
        cars.forEach((c) => {
          c.position.x += (c.userData.v - speed) * dt;
          if (c.position.x > HALF + 20) c.position.x -= L;
          if (c.position.x < -HALF - 20) c.position.x += L;
          c.visible = !viewing || c.userData.v < 0; // keep the camera's own lane clear while driving
        });
        const s = 1 + f.bass * 0.05;
        sun.scale.set(s, s, 1);
      };
      p.shot = (t) => ({ pos: [-34, RH + 1.4 + Math.sin(t * 0.9) * 0.08, RZ + 1.9 + Math.sin(t * 0.35) * 0.8], look: [20, RH - 3, RZ - 30 + Math.sin(t * 0.35 + 0.8) * 8], roll: Math.sin(t * 0.35) * 0.05 });
    },
  };
})();
