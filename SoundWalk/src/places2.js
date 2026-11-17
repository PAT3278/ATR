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
      const fieldKit = SW.Buildings.kit(E, 1), kr = E.rng(7101);
      const towers = [];
      for (let i = 0; i < 70; i++) {
        const lx = (r() - 0.5) * 190, lz = -36 - r() * 110;
        if (Math.abs(lx) < 24 && lz > -40) continue;
        const w = 6 + r() * 9, d = 6 + r() * 9, h = 25 + r() * 95;
        { const wp = p.toWorld(lx, lz); if (E.ring && E.ring.dist(wp.x, wp.z) < Math.max(w, d) / 2 + 8) continue; }   // the expressway threads between the towers
        const b = fieldKit.mesh(w, h, d, kr);   // one of several designs
        b.position.set(lx, 0, lz); g.add(b); r();
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
      const perf = []; let stoopUp = 0, songT = 0, camLead = -1;
      // Who has the verse, by position in the track (seconds), from songs.js. Times below are in the same clock.
      const PARTS = p.song.parts || [{ at: 0, who: 'stvn' }], LEN = p.song.length || 125.2;
      const whoAt = (T) => { let w = PARTS[0].who; for (const s of PARTS) if (T >= s.at) w = s.who; return w; };
      const GO_IN = 61, COME_OUT = 119;                                     // walk in before the 1:07 verse, come back out before the loop
      const CUTAWAYS = [];   // the office is on hold for now: the view stays on the two performers. (Cuts to the firefight were [[18, 23], [35, 40], [52, 57], [84, 89], [104, 109]].)
      {
        const cr = E.rng(212), X = 6.6; var neonM = null, neighbourhood = [], wedge = null, wedgeIn = () => false, streetLife = null;
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
        // The two performers, modelled in detail. stvn: red puffer with a hood, cuffed beanie, chain. vas: white track jacket with a stripe, blue cap, lighter jeans.
        // Same handles as fig() (f, arms, torso, head), so the performance code drives both.
        const figPro = (o) => {
          const f = new THREE.Group(), M = (hex, o) => E.mat(hex, { ...o, emissive: hex, emissiveIntensity: 0.42 });   // lit a little from within, as if by a stoop lamp: the street is dark
          const skin = M(o.skin, { rough: 0.7 }), skinD = M(o.skinD, { rough: 0.7 }), red = M(o.jacket, { rough: 0.75 }), redD = M(o.jacketD, { rough: 0.8 }), blk = M(o.trim, { rough: 0.85 });
          const denim = M(o.pants, { rough: 0.9 }), white = M(o.shoe, { rough: 0.6 }), capM = M(o.hat, { rough: 0.8 }), sole = M('#f4f1e6', { rough: 0.5 }), gold = M('#d9b24a', { rough: 0.3, metal: 0.8 }), eye = M('#0d0c0b', { rough: 0.3 });
          const add = (par, geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); par.add(o); return o; };
          const cyl = (rt, rb, h, n = 10) => new THREE.CylinderGeometry(rt, rb, h, n), sph = (r, a = 12, b = 9) => new THREE.SphereGeometry(r, a, b);
          // legs: baggy, stacked at the ankle, over chunky trainers (front of the figure is +Z)
          for (const sx of [-0.105, 0.105]) {
            add(f, cyl(0.105, 0.1, 0.46), denim, sx, 0.72, 0);
            add(f, cyl(0.1, 0.105, 0.36), denim, sx, 0.32, 0.005);
            add(f, cyl(0.112, 0.118, 0.07), denim, sx, 0.135, 0.008);                                   // the stack
            add(f, new THREE.BoxGeometry(0.125, 0.075, 0.3), white, sx, 0.075, 0.045);
            add(f, new THREE.BoxGeometry(0.13, 0.035, 0.31), sole, sx, 0.02, 0.045);
            add(f, new THREE.BoxGeometry(0.127, 0.03, 0.1), o.puffer ? red : capM, sx, 0.085, 0.02);
          }
          add(f, cyl(0.2, 0.19, 0.16), denim, 0, 0.93, 0).scale.z = 0.72;                               // hips
          // jacket: quilted puffer in three rolls, wider at the shoulders, with a collar and a hood down the back
          const torso = new THREE.Group(); torso.position.y = 1.2; f.add(torso);
          if (o.puffer) [[-0.24, 0.235, 0.215], [-0.07, 0.25, 0.24], [0.1, 0.262, 0.25], [0.245, 0.25, 0.262]].forEach(([y, rt, rb], k) => { const q = add(torso, cyl(rt, rb, 0.165, 12), k % 2 ? red : redD, 0, y, 0); q.scale.z = 0.74; });
          else {   // track jacket: smooth body, a coloured band across the chest, a pocket line
            add(torso, cyl(0.245, 0.205, 0.5, 14), red, 0, -0.07, 0).scale.z = 0.72; add(torso, cyl(0.235, 0.247, 0.15, 14), red, 0, 0.255, 0).scale.z = 0.72;
            add(torso, cyl(0.249, 0.246, 0.07, 14), capM, 0, 0.12, 0).scale.z = 0.725; add(torso, cyl(0.25, 0.248, 0.018, 14), blk, 0, 0.07, 0).scale.z = 0.725;
          }
          add(torso, cyl(0.205, 0.22, 0.05, 12), blk, 0, -0.335, 0).scale.z = 0.74;                      // hem band
          add(torso, new THREE.BoxGeometry(0.03, 0.6, 0.02), blk, 0, 0, 0.185);                          // zip
          add(torso, new THREE.TorusGeometry(0.115, 0.045, 6, 12), red, 0, 0.345, 0.0, Math.PI / 2).scale.set(1, 0.8, 1);   // collar
          if (o.puffer) add(torso, sph(0.15, 10, 8), redD, 0, 0.29, -0.15).scale.set(1.15, 0.85, 0.6);                 // hood
          if (o.chain) { add(torso, new THREE.TorusGeometry(0.1, 0.008, 4, 16, Math.PI), gold, 0, 0.22, 0.165, 0.25, 0, Math.PI); add(torso, new THREE.BoxGeometry(0.035, 0.045, 0.012), gold, 0, 0.115, 0.19); }
          add(f, cyl(0.055, 0.062, 0.1, 8), skin, 0, 1.56, 0);                                           // neck
          // head: skull, jaw, ears, nose, brow, eyes, a short beard, and a beanie with a cuff
          const head = new THREE.Group(); head.position.y = 1.68; f.add(head);
          add(head, sph(0.122, 14, 11), skin, 0, 0.005, 0).scale.set(0.94, 1.06, 1);
          add(head, sph(0.095, 10, 8), skin, 0, -0.062, 0.02).scale.set(0.95, 0.8, 0.95);                // jaw
          if (o.beard) add(head, sph(0.097, 10, 8), skinD, 0, -0.075, 0.018).scale.set(0.97, 0.62, 0.97);             // beard shadow
          for (const sx of [-1, 1]) { add(head, sph(0.03, 6, 5), skin, sx * 0.116, -0.005, -0.005).scale.set(0.5, 1, 0.8); add(head, sph(0.014, 6, 5), eye, sx * 0.043, 0.012, 0.108); add(head, new THREE.BoxGeometry(0.045, 0.012, 0.02), eye, sx * 0.043, 0.04, 0.104, 0, 0, -sx * 0.12); }
          add(head, new THREE.ConeGeometry(0.02, 0.055, 5), skin, 0, -0.012, 0.122, 1.25);               // nose
          add(head, new THREE.BoxGeometry(0.05, 0.008, 0.01), skinD, 0, -0.058, 0.105);                  // mouth
          if (o.beanie) {
            add(head, new THREE.SphereGeometry(0.132, 14, 9, 0, 6.3, 0, 1.45), capM, 0, 0.035, -0.004);
            add(head, cyl(0.136, 0.134, 0.055, 14), M('#232326', { rough: 0.9 }), 0, 0.045, -0.004);       // its cuff
            add(head, sph(0.03, 6, 5), capM, 0, 0.165, -0.01);
          } else {   // baseball cap, brim forward and a touch up; short hair showing at the back
            add(head, new THREE.SphereGeometry(0.13, 14, 9, 0, 6.3, 0, 1.25), capM, 0, 0.045, -0.004);
            add(head, cyl(0.105, 0.115, 0.012, 12), capM, 0, 0.062, 0.115, 0.12).scale.set(1, 1, 0.75);
            add(head, sph(0.012, 5, 4), capM, 0, 0.175, -0.004);
            add(head, new THREE.SphereGeometry(0.126, 12, 8, 0, 6.3, 1.2, 0.75), M('#15100c', { rough: 0.9 }), 0, 0.02, -0.012);
          }
          // arms: puffer sleeves with an elbow, ribbed cuff, hand with a thumb. The mic is in the right hand.
          const arms = [-1, 1].map((sd) => {
            const piv = new THREE.Group(); piv.position.set(sd * 0.3, 1.46, 0); f.add(piv);
            add(piv, sph(0.092, 9, 7), red, 0, -0.01, 0);                                                // shoulder
            add(piv, cyl(0.082, 0.074, 0.15, 9), redD, 0, -0.1, 0); add(piv, cyl(0.078, 0.072, 0.14, 9), red, 0, -0.235, 0);
            const el = new THREE.Group(); el.position.y = -0.31; el.rotation.x = -0.55; piv.add(el);      // forearm, always a little bent
            add(el, sph(0.074, 8, 6), redD, 0, 0, 0);
            add(el, cyl(0.072, 0.066, 0.13, 9), red, 0, -0.085, 0); add(el, cyl(0.068, 0.06, 0.1, 9), redD, 0, -0.195, 0);
            add(el, cyl(0.05, 0.05, 0.035, 9), blk, 0, -0.26, 0);
            add(el, sph(0.05, 8, 6), skin, 0, -0.31, 0).scale.set(0.8, 1.1, 1); add(el, sph(0.02, 5, 4), skin, -sd * 0.04, -0.3, 0.02);
            if (sd > 0) { add(el, cyl(0.02, 0.017, 0.17, 8), ironM, 0, -0.36, 0.03, -0.5); add(el, sph(0.036, 8, 6), M('#3a3a40', { metal: 0.6, rough: 0.5 }), 0, -0.44, 0.075); }
            return piv;
          });
          f.traverse((m) => { if (m.isMesh) m.castShadow = true; });
          return { f, arms, torso, head };
        };
        for (let i = 0; i < 4; i++) {
          const z0 = 17 + i * 6.2, H = 10.4 + (i % 2) * 0.9, wall = E.mat(['#b07a62', '#c0705c', '#a07060', '#c08a6a'][i], { map: E.tex('brick', 2, 3), rough: 0.9 }), dz = z0 - 1.6;
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
            const m = figPro(i === 1
              ? { puffer: true, chain: true, beard: true, beanie: true, skin: '#8a5a3c', skinD: '#6f452c', jacket: '#b3161d', jacketD: '#8c1016', trim: '#141416', hat: '#141416', pants: '#23262e', shoe: '#e6e2d6' }
              : { skin: '#b07a52', skinD: '#8f5f3d', jacket: '#dcd6c4', jacketD: '#c4bda9', trim: '#16181c', hat: '#2a4a8a', pants: '#4a5d78', shoe: '#17181c' });
            const w = new THREE.Group(); w.add(m.f); g.add(w);
            perf.push({ ...m, w, sash, hinge, X, dz, z0, zo: i === 1 ? 0.25 : -0.25, yaw: i === 1 ? 0.3 : -0.3, s: i * 2.1, name: i === 1 ? 'stvn' : 'vas', off: i === 1 ? 0 : 9.4, amp: 0.3, up: 0 });   // red jacket = stvn, white jacket = vas
          }
        }

        // A New York deli on the corner, at the end of the row: brick, a lit storefront full of shelves, a green awning,
        // a backlit sign, a neon OPEN, flowers and fruit out front.
        {
          const zc = 42.0, H = 8.2, sign = (txt, o, w, h) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), (() => { const m = new THREE.MeshBasicMaterial({ map: E.textTex(txt, o), transparent: true }); m.userData.lin = true; return m; })());
          const brick = E.mat('#6e4434', { map: E.tex('brick', 2, 3), rough: 0.9 }), awnM = E.mat('#1d5a34', { rough: 0.8 }), dark = E.mat('#141416', { rough: 0.6 });
          const shopGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe6b0').convertSRGBToLinear().multiplyScalar(0.9) }); shopGlow.userData.lin = true;
          const doorGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color('#d8f0ff').convertSRGBToLinear().multiplyScalar(0.8) }); doorGlow.userData.lin = true;
          bx(8, H, 6.1, X + 4, H / 2, zc, brick);
          bx(0.7, 0.45, 6.3, X - 0.15, H - 0.1, zc, trimM); bx(0.3, 0.2, 6.2, X - 0.05, 4.6, zc, trimM, false);
          for (const z of [-1.6, 1.6]) { bx(0.06, 1.6, 1.0, X - 0.03, 6.2, zc + z, cr() < 0.5 ? winLit : winDark, false); bx(0.18, 0.1, 1.2, X - 0.08, 5.35, zc + z, trimM, false); }
          // storefront: a lit window, shelves of tins and bottles silhouetted in it, a glass door
          bx(0.05, 2.5, 3.9, X - 0.03, 1.55, zc - 0.75, shopGlow, false);
          const tins = ['#c8202a', '#e8c020', '#2a62c8', '#f4f1e6', '#1f8a3a', '#d86a20', '#8a2ab8'].map((c) => E.mat(c, { rough: 0.5 }));
          for (const y of [0.75, 1.35, 1.95, 2.5]) {
            bx(0.1, 0.05, 3.8, X - 0.12, y, zc - 0.75, dark, false);
            for (let k = 0; k < 11; k++) bx(0.08, 0.16 + cr() * 0.18, 0.2 + cr() * 0.12, X - 0.12, y + 0.12, zc - 2.5 + k * 0.33 + cr() * 0.05, tins[Math.floor(cr() * tins.length)], false);
          }
          bx(0.07, 2.45, 1.05, X - 0.03, 1.3, zc + 2.15, doorGlow, false); bx(0.12, 2.6, 0.08, X - 0.06, 1.3, zc + 1.6, dark, false); bx(0.12, 2.6, 0.08, X - 0.06, 1.3, zc + 2.7, dark, false);
          bx(0.14, 0.35, 6.1, X - 0.07, 0.17, zc, dark, false);                                                                 // kick plate
          // awning: a sloped green canopy with a printed valance
          const awn = bx(1.7, 0.06, 6.3, X - 0.82, 3.25, zc, awnM, false); awn.rotation.z = 0.32;
          bx(0.04, 0.42, 6.3, X - 1.62, 2.82, zc, awnM, false);
          const val = sign('DELI & GROCERY  ·  OPEN 24 HRS', { w: 1024, h: 80, color: '#f4f1e6', font: '700 50px "Hind",sans-serif' }, 6.2, 0.48); val.position.set(X - 1.65, 2.82, zc); val.rotation.y = -Math.PI / 2; g.add(val);
          // backlit sign board above the awning
          bx(0.22, 1.0, 5.6, X - 0.11, 4.05, zc, E.mat('#e8e2d0', { emissive: '#fff4d8', emissiveIntensity: 0.55, rough: 0.5 }), false);
          const board = sign('DELI\nSANDWICHES · COFFEE · BEER', { w: 1024, h: 200, color: '#c41e24', color2: '#1d4a2c', font: '700 104px "Hind",sans-serif', font2: '700 40px "Hind",sans-serif' }, 5.4, 1.0); board.position.set(X - 0.23, 4.05, zc); board.rotation.y = -Math.PI / 2; g.add(board);
          // neon OPEN in the window
          const neon = sign('OPEN', { w: 256, h: 96, color: '#ff4f6a', glow: '#ff2a50', font: '700 66px "Hind",sans-serif' }, 0.95, 0.36); neon.position.set(X - 0.09, 2.3, zc - 2.0); neon.rotation.y = -Math.PI / 2; g.add(neon);
          // out front: buckets of flowers, crates of fruit, a blue newspaper box, a bin
          const bucket = E.mat('#2a2a2e', { metal: 0.4, rough: 0.5 }), crate = E.mat('#7a5a38', { rough: 0.95 });
          const bloom = ['#e83a5a', '#f2d23a', '#f4f1e6', '#c24ac8', '#ff8a3a'].map((c) => E.mat(c, { rough: 0.7 })), fruit = ['#f08a1c', '#d42a2a', '#e8d23a', '#7ac23a'].map((c) => E.mat(c, { rough: 0.5 }));
          for (let k = 0; k < 4; k++) {
            const z = zc - 2.6 + k * 0.62, b = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.42, 10), bucket); b.position.set(X - 0.6, 0.25, z); g.add(b);
            for (let q = 0; q < 6; q++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), bloom[(k + q) % bloom.length]); f.position.set(X - 0.6 + (cr() - 0.5) * 0.28, 0.6 + cr() * 0.3, z + (cr() - 0.5) * 0.28); g.add(f); }
          }
          for (let k = 0; k < 2; k++) {
            const z = zc + 0.1 + k * 0.75; bx(0.6, 0.35, 0.65, X - 0.75, 0.42, z, crate);
            for (let q = 0; q < 9; q++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.075, 7, 5), fruit[(k * 2 + (q % 2)) % fruit.length]); f.position.set(X - 0.95 + (q % 3) * 0.2, 0.66, z - 0.2 + Math.floor(q / 3) * 0.2); g.add(f); }
          }
          bx(0.5, 1.05, 0.45, X - 2.9, 0.58, zc + 3.6, E.mat('#2a52b8', { rough: 0.5 }));                                     // newspaper box
          bx(0.45, 0.9, 0.45, X - 2.9, 0.5, zc - 3.5, E.mat('#2c3a2e', { rough: 0.8 }));                                     // bin
          // light from the shop spilling across the pavement
          const pool = new THREE.Mesh(new THREE.PlaneGeometry(5, 7), new THREE.MeshBasicMaterial({ map: E.dot(), color: new THREE.Color('#ffd08a').convertSRGBToLinear(), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
          pool.material.userData.lin = true; pool.rotation.x = -Math.PI / 2; pool.position.set(X - 2.2, 0.06, zc); g.add(pool);
          p.addBox(X + 4, zc, 4.05, 3.1); p.addBox(X - 0.75, zc, 0.4, 3.0); p.addBox(X - 2.9, zc + 3.6, 0.3, 0.3); p.addBox(X - 2.9, zc - 3.5, 0.3, 0.3);
          neonM = neon.material;
        }
        const box2 = bx(0.6, 0.36, 0.28, X - 2.9 + 1 * 0.36, 0.45 + 0.18, 17 + 2 * 6.2 - 1.6 + 0.5, E.mat('#1a1a1d', { metal: 0.4 }));                               // boombox on a step
        box2.rotation.y = 0.3;
        BB.flush();

        // The neighbourhood between here and FLIP DA HOODS: streets of rowhouses like these across the way, then taller
        // brick apartment blocks the nearer you get to FLIP's towers. Anything that would land on FLIP, a path or another
        // place is dropped by the game (p.spill); the survivors are drawn once that is settled (p.afterSpill).
        {
          const NB = E.batch(g), nb = NB.box, nr = E.rng(4747), kit = SW.Buildings.kit(E, 5), kr = E.rng(4848);
          const walls = ['#b07a62', '#c0705c', '#a07060', '#c08a6a', '#b08068', '#9a6a5c', '#b88a6c'].map((c) => E.mat(c, { map: E.tex('brick', 2, 3), rough: 0.9 }));   // photographed brick, tinted per house
          const paveM = E.mat('#77736c', { map: E.tex('paving', 1, 1), rough: 0.9 });
          const spill = [], holder = new THREE.Group(); g.add(holder);
          // xb0..xb1: the body across x; o: which way the front faces (+1 = +x, -1 = -x)
          const rowhouse = (xb0, xb1, o, zc, H) => {
            const wall = walls[Math.floor(nr() * walls.length)], xm = (xb0 + xb1) / 2, xf = o > 0 ? xb1 : xb0, dz = zc - 1.6, lit = () => (nr() < 0.4 ? winLit : winDark);
            return () => {
              nb(xb1 - xb0, H, 6.1, xm, H / 2, zc, wall);
              nb(0.7, 0.5, 6.3, xf + o * 0.15, H - 0.1, zc, trimM); nb(0.3, 0.18, 6.2, xf + o * 0.05, 4.75, zc, trimM, false);
              const win = (y, z, h = 1.7) => { nb(0.06, h, 0.95, xf + o * 0.03, y, z, lit(), false); nb(0.16, 0.2, 1.2, xf + o * 0.06, y + h / 2 + 0.14, z, trimM, false); nb(0.2, 0.1, 1.15, xf + o * 0.08, y - h / 2 - 0.05, z, trimM, false); };
              win(3.25, zc + 0.35, 1.9); win(3.25, zc + 2.0, 1.9); win(0.95, zc + 1.2, 0.9);
              for (let y = 6.3; y < H - 1.2; y += 2.3) for (const z of [-1.85, 0, 1.85]) win(y, zc + z);
              nb(0.08, 2.4, 1.15, xf + o * 0.04, 3.0, dz, doorM, false); nb(0.3, 0.3, 1.6, xf + o * 0.1, 4.35, dz, trimM, false); nb(0.1, 0.22, 0.14, xf + o * 0.08, 3.4, dz + 0.85, winLit, false);
              for (let k = 0; k < 8; k++) nb(0.37, 0.225 * (k + 1), 1.75, xf + o * (2.9 - k * 0.36), 0.1125 * (k + 1), dz, stepM);
              for (const sd of [-1, 1]) { const rl = nb(3.45, 0.05, 0.05, xf + o * 1.5, 1.85, dz + sd * 0.95, ironM, false); rl.rotation.z = -o * 0.556; nb(0.12, 1.15, 0.12, xf + o * 3.1, 0.58, dz + sd * 0.95, ironM, false); }
              for (let k = 0; k < 9; k++) nb(0.03, 0.8, 0.03, xf + o * 3.1, 0.4, zc + 0.1 + k * 0.34, ironM, false);
              nb(4.4, 0.08, 6.1, xf + o * 2.2, 0.04, zc, paveM, false);                                                // the pavement in front
              p.addBox(xf + o * 1.5, dz, 1.6, 1.0);
            };
          };
          const place = (x, z, w, d, b, draw) => { b = b || new THREE.Object3D(); if (!b.parent) holder.add(b); spill.push({ x, z, w, d, b, draw, box: p.addBox(x, z, w / 2 + 0.05, d / 2 + 0.05) }); };
          p.spill = spill;
          p.afterSpill = () => { spill.forEach((f) => f.draw && f.draw()); NB.flush(); };

          // The wedge of land where this street and FLIP's block meet at an angle: a Flatiron-style building fills it.
          const flipSong = SW.SONGS.find((q) => q.scene === 'flip');
          if (flipSong) {
            const lf = SW.Ring.frame(flipSong), loc = (lx, lz) => { const w = lf.toWorld(lx, lz); return p.local(w.x, w.z); };
            let a = loc(30, -33), b = loc(30, 17); if (a.z > b.z) [a, b] = [b, a];   // FLIP's kerb on this side
            const dx = b.x - a.x, dz = b.z - a.z, dl = Math.hypot(dx, dz), ux = dx / dl, uz = dz / dl;
            let nx = uz, nz = -ux; if ((-4 - a.x) * nx + (30 - a.z) * nz < 0) { nx = -nx; nz = -nz; }        // pointing this way
            const ox = a.x + nx * 4.5, oz = a.z + nz * 4.5, X1 = -26, Z0 = 18;   // behind the row across the street                                // a street's width off each kerb
            const t1 = (X1 - ox) / ux, apex = [X1, oz + uz * t1], t0 = (Z0 - oz) / uz, foot = [ox + ux * t0, Z0];
            if (Math.abs(ux) > 0.05 && apex[1] - Z0 > 9 && X1 - foot[0] > 6) {
              const tri = [apex, [X1, Z0], foot], h = 22 + kr() * 4;
              const w = kit.plot(tri, h, kr, kr() < 0.6 ? 1 : 2); w.castShadow = true; w.receiveShadow = true; g.add(w);
              wedge = tri;
              const inTri = (x, z) => { let s = 0; for (let i = 0; i < 3; i++) { const [x1, z1] = tri[i], [x2, z2] = tri[(i + 1) % 3], c = (x2 - x1) * (z - z1) - (z2 - z1) * (x - x1); if (c !== 0) { if (s === 0) s = Math.sign(c); else if (Math.sign(c) !== s) return false; } } return true; };
              for (let x = foot[0]; x <= X1; x += 1.6) for (let z = Z0; z <= apex[1]; z += 1.6) if (inTri(x, z)) p.addCircle(x, z, 1.05);
              wedgeIn = (lx, lz) => inTri(lx, lz) || tri.some(([x, z]) => Math.hypot(lx - x, lz - z) < 3);
              nb(Math.abs(X1 - foot[0]) + 6, 0.08, 4, (X1 + foot[0]) / 2, 0.04, Z0 - 2, paveM, false);              // the pavement along its base
            }
          }
          neighbourhood = spill;
          // ---- The street itself, Harlem style: a one-way side street between two rows of brownstones. Sidewalks with
          // kerbs, street trees in pits, cars parked along both kerbs, hydrants, trash cans, cobra-head street lamps, a
          // mailbox; a barbershop and a laundromat in the ground floors across the way; neighbours on their stoops, kids
          // with a ball, someone walking a dog. The houses across the street face this row, stoop to stoop.
          const ZA = 8.8, ZB = 60, CURB_E = 1.6, CURB_W = -7.4, FRONT_W = -14;
          for (let k = 0; k < 8; k++) {   // the row across the street (part of this place now, not negotiable spill)
            const zc = 13 + k * 6.2, ha = 10.4 + (k % 2) * 0.9 + nr() * 0.6, draw = rowhouse(-22, FRONT_W, 1, zc, ha); draw();
            // its back is a real back: sash windows on every floor, a back door, and a fire escape zigzagging down
            for (let y = 1.6; y < ha - 1.2; y += 2.3) for (const dz of [-1.85, 0, 1.85]) { nb(0.06, 1.5, 0.9, -22.03, y + 0.6, zc + dz, nr() < 0.35 ? winLit : winDark, false); nb(0.14, 0.12, 1.1, -22.06, y - 0.2, zc + dz, trimM, false); nb(0.12, 0.16, 1.1, -22.06, y + 1.42, zc + dz, trimM, false); }
            nb(0.08, 2.2, 1.1, -22.04, 1.1, zc - 1.85, doorM, false);
            for (const y of [3.9, 6.2, 8.5]) { if (y > ha - 1.5) continue; nb(1.1, 0.06, 2.8, -22.6, y, zc + 0.6, ironM, false); nb(0.04, 0.9, 2.8, -23.13, y + 0.45, zc + 0.6, ironM, false); for (const zz of [-1.35, 1.35]) nb(1.1, 0.9, 0.04, -22.6, y + 0.45, zc + 0.6 + zz, ironM, false); }
            for (const y of [3.9, 6.2]) { if (y + 2.3 > ha - 1.5) continue; const st = nb(0.5, 0.05, 2.7, -22.65, y + 1.15, zc + 0.6, ironM, false); st.rotation.x = 0.72; }
            p.addBox(-18, zc, 4.05, 3.1);
          }
          { const road = E.plane(CURB_E - CURB_W, ZB - ZA, E.mat('#2c2a30', { map: E.tex('asphalt', 3, 16), rough: 0.88 })); road.position.set((CURB_E + CURB_W) / 2, 0.04, (ZA + ZB) / 2); g.add(road); p.pick(road);
            for (const [x0, x1] of [[CURB_E, X], [FRONT_W, CURB_W]]) { const sw = E.plane(x1 - x0, ZB - ZA, E.mat('#8a857c', { map: E.tex('paving', 2, 20), rough: 0.9 })); sw.position.set((x0 + x1) / 2, 0.16, (ZA + ZB) / 2); g.add(sw); p.pick(sw); }
            for (const x of [CURB_E, CURB_W]) nb(0.22, 0.18, ZB - ZA, x, 0.09, (ZA + ZB) / 2, E.mat('#b4b0a8', { rough: 0.8 }));
            nb(0.12, 0.02, ZB - ZA, CURB_W + 2.4, 0.045, (ZA + ZB) / 2, E.basic('#cfc9bb'), false); nb(0.12, 0.02, ZB - ZA, CURB_E - 2.4, 0.045, (ZA + ZB) / 2, E.basic('#cfc9bb'), false);   // parking-lane lines
          }
          const onWalk = (lx, lz) => lz > ZA && lz < ZB && ((lx > CURB_E && lx < X) || (lx > FRONT_W && lx < CURB_W));
          // street trees in pits along both kerbs
          const leafM = [E.mat('#4f6f3a', { rough: 0.9, flat: true }), E.mat('#5d7a40', { rough: 0.9, flat: true })], barkM = E.mat('#4a3a2c', { rough: 0.9 });
          for (const [x, z0] of [[CURB_E + 1.0, 12], [CURB_W - 1.0, 15]]) for (let z = z0; z < ZB - 2; z += 9.5) {
            if (x > 0 && z > 20 && z < 34) continue;   // keep the view of the two stoops clear
            nb(1.3, 0.04, 1.3, x, 0.17, z, E.mat('#3a3026', { rough: 1 }), false);
            const tk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 4.2, 7), barkM); tk.position.set(x, 2.1, z); tk.castShadow = true; g.add(tk);
            for (let c = 0; c < 4; c++) { const lf = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3 + nr() * 0.6, 0), leafM[c % 2]); lf.position.set(x + (nr() - 0.5) * 1.6, 4.6 + nr() * 1.4, z + (nr() - 0.5) * 1.6); lf.castShadow = true; g.add(lf); }
            p.addCircle(x, z, 0.25);
          }
          // cars parked nose to tail along both kerbs (the street runs one way: they all point the same way)
          if (SW.Cars) for (const [x, side] of [[CURB_E - 1.2, 1], [CURB_W + 1.2, -1]]) for (let z = ZA + 3.5, k = 0; z < ZB - 3; k++) {
            const car = SW.Cars.make(E, Math.floor(nr() * 7)), len = car.userData.len || 4.5;
            if (side > 0 && z + len / 2 > 19 && z - len / 2 < 35) { z = 35 + len / 2; continue; }
            car.position.set(x, 0.04, z + len / 2); car.rotation.y = Math.PI; g.add(car);
            p.addBox(x, z + len / 2, (car.userData.wid || 1.8) / 2 + 0.1, len / 2 + 0.1);
            z += len + 1.2 + nr() * 2.5;
          }
          // hydrants, trash cans, a mailbox, street lamps
          const red = E.mat('#b8312a', { rough: 0.6 }), canM = E.mat('#2f4a3a', { rough: 0.7 }), lampPole = E.mat('#3a3d42', { metal: 0.5, rough: 0.5 }), lampHead = E.basic('#ffd9a0');
          for (const [x, z] of [[CURB_E + 0.5, 18], [CURB_W - 0.5, 40], [CURB_E + 0.5, 50]]) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.75, 10), red); h.position.set(x, 0.55, z); g.add(h); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 6, 0, 6.3, 0, 1.6), red); cap.position.set(x, 0.93, z); g.add(cap); p.addCircle(x, z, 0.25); }
          for (const [x, z] of [[CURB_E + 0.6, 37], [CURB_W - 0.6, 21], [CURB_W - 0.6, 53]]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.95, 12), canM); c.position.set(x, 0.63, z); g.add(c); p.addCircle(x, z, 0.35); }
          { const mb = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.1, 0.5), E.mat('#2a4a8a', { rough: 0.5 })); mb.position.set(CURB_W - 0.6, 0.71, 31); g.add(mb); p.addCircle(CURB_W - 0.6, 31, 0.35); }
          for (const [x, z, sd] of [[CURB_E + 0.4, 14, -1], [CURB_W - 0.4, 27, 1], [CURB_E + 0.4, 38, -1], [CURB_W - 0.4, 52, 1]]) {
            nb(0.16, 7.2, 0.16, x, 3.6, z, lampPole); nb(1.8, 0.1, 0.1, x + sd * 0.9, 7.15, z, lampPole); nb(0.6, 0.12, 0.3, x + sd * 1.8, 7.05, z, lampHead, false); p.addCircle(x, z, 0.2);
          }
          // a barbershop and a laundromat in the ground floors across the way
          const shopFront = (zc, label, glow, pole) => {
            const sh = (txt, o) => { const m = new THREE.MeshBasicMaterial({ map: E.textTex(txt, o), transparent: true }); m.userData.lin = true; return m; };
            const sg = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.7), sh(label, { w: 1024, h: 140, color: '#fff2d8', glow, font: '700 92px "Hind",sans-serif', bg: '#1a1a1c' })); sg.position.set(FRONT_W + 0.08, 2.9, zc + 0.4); sg.rotation.y = Math.PI / 2; g.add(sg);
            const lit = new THREE.MeshBasicMaterial({ color: new THREE.Color(glow).convertSRGBToLinear().multiplyScalar(0.7) }); lit.userData.lin = true;
            nb(0.05, 1.8, 3.2, FRONT_W + 0.04, 1.2, zc + 0.4, lit, false);
            if (pole) { const bp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.1, 12), new THREE.MeshBasicMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = 32; c.height = 64; const x = c.getContext('2d'); for (let i = -4; i < 8; i++) { x.fillStyle = ['#d23a2a', '#f4f1e6', '#2457c5', '#f4f1e6'][((i % 4) + 4) % 4]; x.save(); x.translate(0, i * 10); x.transform(1, 0.5, 0, 1, 0, 0); x.fillRect(0, 0, 32, 10); x.restore(); } const t = new THREE.CanvasTexture(c); t.wrapT = THREE.RepeatWrapping; return t; })() })); bp.position.set(FRONT_W + 0.35, 2.0, zc - 1.6); g.add(bp); barberPole = bp; }
          };
          let barberPole = null;
          shopFront(13 + 1 * 6.2, 'BARBER SHOP', '#9ff3ff', true); shopFront(13 + 6 * 6.2, 'LAUNDROMAT  24H', '#cfe6ff', false);
          // the neighbours: on their stoops, chatting on the sidewalk, kids with a ball, someone with a dog
          const folk = [['#2a2c30', '#141416'], ['#7a2f2a', '#2a4a8a'], ['#3a5a40', '#141416'], ['#c9c2b0', '#6a3a2a'], ['#4a6a8a', '#d9b24a'], ['#8a6a3a', '#141416'], ['#2f4a5a', '#c9c2b0']];
          const person = (x, z, ry, k, sit, s = 1) => { const m = fig(folk[k % folk.length][0], folk[k % folk.length][1]); m.f.position.set(x, sit ? sit : 0.16, z); m.f.rotation.y = ry; m.f.scale.setScalar(s); if (sit) { m.f.scale.y = s * 0.78; } g.add(m.f); neighbours.push({ m, k, base: m.f.position.y }); p.addCircle(x, z, 0.35 * s); return m; };
          const neighbours = [];
          person(FRONT_W + 2.0, 13 + 3 * 6.2 - 1.6, Math.PI / 2, 0, 0.9); person(FRONT_W + 1.6, 13 + 3 * 6.2 - 1.2, Math.PI / 2, 1, 0.68);    // two on a stoop across the way
          person(X - 2.6, 13 + 0 * 6.2 - 1.6, -Math.PI / 2, 2, 0.6);                                                                       // one on a stoop at the end of this row
          person(CURB_W - 1.6, 46, 0.4, 3); person(CURB_W - 2.4, 46.9, -2.5, 4);                                                          // chatting on the sidewalk
          person(CURB_E + 1.8, 45, Math.PI, 5);                                                                                            // walking the dog
          { const dog = new THREE.Group(), dm = E.mat('#6a4a30', { rough: 0.8 }); const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.7), dm); b.position.y = 0.42; dog.add(b); const hd = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.26), dm); hd.position.set(0, 0.6, -0.42); dog.add(hd); for (const [lx, lz] of [[-0.1, -0.25], [0.1, -0.25], [-0.1, 0.25], [0.1, 0.25]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.07), dm); l.position.set(lx, 0.15, lz); dog.add(l); } dog.position.set(CURB_E + 1.9, 0.16, 43.6); g.add(dog); }
          for (const [x, z, k] of [[-3.5, 55, 6], [-1.4, 57, 2], [-4.6, 57.6, 4]]) person(x, z, nr() * 6, k, 0, 0.72);                // kids in the street
          { const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), E.mat('#c8602a', { rough: 0.7 })); ball.position.set(-2.6, 0.16, 56); g.add(ball); neighbours.ball = ball; }
          streetLife = { neighbours, barberPole };
          p.ground = ((g0) => (lx, lz, y) => Math.max(onWalk(lx, lz) ? 0.16 : 0, g0 ? g0(lx, lz, y) : 0))(p.ground);
        }
      }
      // The courts behind the row: a basketball court boxed in by brick, New York projects style. It runs along under the
      // expressway; two tall brick project towers stand over it on the far side, with a raised walk in front of them and
      // wide concrete steps down to the court that double as bleachers; the backs of the brownstones close the near end,
      // and you come in through a gate in the chain-link from the alley between the row and the office.
      // Built in its own frame (u across the court, v along it), turned to lie along the expressway.
      const CO = { x: 36.6, z: 16 }, toL = (u, v) => [CO.x - v, CO.z + u];   // court frame -> this place's frame
      const CT = { x: 0, z: 0, W: 15.2, L: 28.6 }, TER = { x0: 12, x1: 18.5, z0: -15.5, z1: 15.5, y: 1.5 }, STEP0 = 9.4;
      const inCourts = (lx, lz) => lx > 19 && lx < 54 && lz > 5 && lz < 48;
      {
        const cg = new THREE.Group(); cg.position.set(CO.x, 0, CO.z); cg.rotation.y = -Math.PI / 2; g.add(cg);
        const addB = (u, v, hu, hv) => { const [x, z] = toL(u, v); p.addBox(x, z, hv, hu); }, addC = (u, v, r0) => { const [x, z] = toL(u, v); p.addCircle(x, z, r0); };
        const CB = E.batch(cg), cb = CB.box, cr2 = E.rng(5150), FB = E.batch(g);
        const ironM = E.mat('#0f0e10', { metal: 0.6, rough: 0.5 });
        const canvas = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; return t; };
        // the court surface: worn green with brick-red keys and white lines, on a dark asphalt apron
        const AP = 1.6, PW = CT.W + AP * 2, PL = CT.L + AP * 2, PX = 512 / PW;
        const courtTex = canvas(512, Math.round(512 * PL / PW), (c, w, h) => {
          const m = (v) => v * PX, cx = w / 2, cz = h / 2;
          c.fillStyle = '#2b2d2c'; c.fillRect(0, 0, w, h);
          c.fillStyle = '#2f5a45'; c.fillRect(m(AP), m(AP), m(CT.W), m(CT.L));
          for (const sd of [-1, 1]) { const by = cz + sd * m(CT.L / 2); c.fillStyle = '#8a3a2c'; c.fillRect(cx - m(2.45), sd < 0 ? by : by - m(5.8), m(4.9), m(5.8)); }
          c.strokeStyle = '#e9e6dc'; c.lineWidth = m(0.06);
          c.strokeRect(m(AP), m(AP), m(CT.W), m(CT.L));
          c.beginPath(); c.moveTo(m(AP), cz); c.lineTo(w - m(AP), cz); c.stroke();
          c.beginPath(); c.arc(cx, cz, m(1.8), 0, 7); c.stroke();
          for (const sd of [-1, 1]) {
            const by = cz + sd * m(CT.L / 2), hy = by - sd * m(1.575);
            c.strokeRect(cx - m(2.45), sd < 0 ? by : by - m(5.8), m(4.9), m(5.8));
            c.beginPath(); c.arc(cx, by - sd * m(5.8), m(1.8), 0, 7); c.stroke();
            c.beginPath(); const a = Math.acos(Math.min(1, (m(6.6)) / m(6.75))); if (sd < 0) c.arc(cx, hy, m(6.75), a, Math.PI - a); else c.arc(cx, hy, m(6.75), Math.PI + a, 2 * Math.PI - a); c.stroke();
            for (const s2 of [-1, 1]) { c.beginPath(); c.moveTo(cx + s2 * m(6.6), by); c.lineTo(cx + s2 * m(6.6), hy + sd * m(6.75) * Math.sin(Math.acos(6.6 / 6.75)) * -1); c.stroke(); }
          }
          for (let i = 0; i < 2600; i++) { c.fillStyle = `rgba(${cr2() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + cr2() * 0.06})`; c.fillRect(cr2() * w, cr2() * h, 1 + cr2() * 3, 1 + cr2() * 3); }   // wear
          c.fillStyle = 'rgba(0,0,0,.18)'; for (let i = 0; i < 6; i++) { c.beginPath(); c.ellipse(cr2() * w, cr2() * h, 20 + cr2() * 40, 10 + cr2() * 20, cr2() * 3, 0, 7); c.fill(); }
        });
        const court = E.plane(PW, PL, E.mat('#ffffff', { map: courtTex, rough: 0.75 })); court.position.set(CT.x, 0.05, CT.z); cg.add(court); p.pick(court);
        // the hoops: a steel post behind each baseline, an arm out to a fan-shaped steel backboard, an orange rim and a chain net
        const steel = E.mat('#3d4a44', { metal: 0.6, rough: 0.45 }), white = E.mat('#e9e6dc', { rough: 0.6 }), rimM = E.mat('#d0561e', { metal: 0.4, rough: 0.4 });
        const chainM = new THREE.LineBasicMaterial({ color: new THREE.Color('#b9bcc0').convertSRGBToLinear() }); chainM.userData.lin = true;
        for (const sd of [-1, 1]) {
          const bz = CT.z + sd * CT.L / 2, pz = bz + sd * 1.1, fz = bz - sd * 1.2, h = new THREE.Group(); cg.add(h);
          cb(0.2, 3.6, 0.2, CT.x, 1.8, pz, steel); cb(0.16, 0.16, Math.abs(pz - fz) + 0.1, CT.x, 3.5, (pz + fz) / 2, steel);
          const fan = new THREE.Mesh(new THREE.CircleGeometry(0.95, 20, 0, Math.PI), steel); fan.position.set(CT.x, 2.95, fz); fan.rotation.y = sd > 0 ? Math.PI : 0; fan.castShadow = true; h.add(fan);
          const fan2 = fan.clone(); fan2.rotation.y += Math.PI; h.add(fan2);
          cb(1.9, 0.08, 0.05, CT.x, 2.95, fz, steel); cb(0.6, 0.04, 0.06, CT.x, 3.32, fz - sd * 0.01, white, false);
          const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.018, 6, 20), rimM); rim.rotation.x = Math.PI / 2; rim.position.set(CT.x, 3.05, fz - sd * 0.38); h.add(rim);
          cb(0.05, 0.05, 0.16, CT.x, 3.05, fz - sd * 0.08, rimM);
          const pts = [], cx0 = CT.x, cz0 = fz - sd * 0.38;
          for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2, a2 = a + 0.5; pts.push(cx0 + Math.cos(a) * 0.23, 3.04, cz0 + Math.sin(a) * 0.23, cx0 + Math.cos(a2) * 0.13, 2.62, cz0 + Math.sin(a2) * 0.13); }
          const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); h.add(new THREE.LineSegments(ng, chainM));
          addC(CT.x, pz, 0.3);
        }
        // where to stand for free throws, and where the rims are (in the world), for the game's free-throw challenge
        p.freeThrow = [-1, 1].map((sd) => { const bz = CT.z + sd * CT.L / 2, rim = toL(CT.x, bz - sd * 1.58), spot = toL(CT.x, bz - sd * 5.8), rw = p.toWorld(rim[0], rim[1]), sw = p.toWorld(spot[0], spot[1]); return { rim: { x: rw.x, y: 3.05, z: rw.z }, spot: { x: sw.x, z: sw.z } }; });
        // a ball left by the free-throw line
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), E.mat('#c8602a', { rough: 0.7 })); ball.position.set(CT.x + 1.4, 0.17, CT.z - CT.L / 2 + 6.2); ball.castShadow = true; cg.add(ball);
        // chain-link: on the brownstone side, at the expressway end, and along the open end with a gate in it
        const linkTex = canvas(64, 64, (c) => { c.clearRect(0, 0, 64, 64); c.strokeStyle = '#c7cbcf'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, 32); c.lineTo(32, 0); c.lineTo(64, 32); c.lineTo(32, 64); c.closePath(); c.stroke(); });
        linkTex.wrapS = linkTex.wrapT = THREE.RepeatWrapping;
        const FH = 3.6, fence = (x0, z0, x1, z1) => {
          const len = Math.hypot(x1 - x0, z1 - z0), t = linkTex.clone(); t.needsUpdate = true; t.repeat.set(len / 0.55, FH / 0.55);
          const m = new THREE.MeshStandardMaterial({ map: t, transparent: false, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.5 }); m.userData.lin = true;
          const f = new THREE.Mesh(new THREE.PlaneGeometry(len, FH), m); f.position.set((x0 + x1) / 2, FH / 2, (z0 + z1) / 2); f.rotation.y = -Math.atan2(z1 - z0, x1 - x0); cg.add(f);
          const n = Math.max(1, Math.round(len / 2.6));
          for (let k = 0; k <= n; k++) cb(0.07, FH + 0.1, 0.07, x0 + ((x1 - x0) * k) / n, (FH + 0.1) / 2, z0 + ((z1 - z0) * k) / n, steel);
          const top = cb(len, 0.06, 0.06, (x0 + x1) / 2, FH + 0.05, (z0 + z1) / 2, steel, false); top.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
          addB((x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) / 2 + 0.08, Math.abs(z1 - z0) / 2 + 0.08);
        };
        const fx0 = CT.x - PW / 2, fx1 = STEP0, fz0 = CT.z - PL / 2, fz1 = CT.z + PL / 2;
        fence(fx0, fz0, fx0, fz1); fence(fx0, fz0, fx1, fz0);
        const GX = CT.x - 4.4;                                                                   // the gate, off to one side of the hoop, facing the alley
        fence(fx0, fz1, GX - 1.3, fz1); fence(GX + 1.3, fz1, fx1, fz1);
        cb(0.12, FH + 0.4, 0.12, GX - 1.3, (FH + 0.4) / 2, fz1, steel); cb(0.12, FH + 0.4, 0.12, GX + 1.3, (FH + 0.4) / 2, fz1, steel); cb(2.72, 0.1, 0.1, GX, FH + 0.4, fz1, steel);
        // the steps (bleachers) and the raised walk in front of the towers
        const conc = E.mat('#8d8a83', { map: E.tex('concrete', 2, 2), rough: 0.9 }), concD = E.mat('#6f6c66', { map: E.tex('concrete', 2, 2), rough: 0.95 });
        const NS = 6, SW_ = (TER.x0 - STEP0) / NS;
        for (let k = 0; k < NS; k++) { const hgt = (TER.y * (k + 1)) / NS; cb(SW_ * (NS - k), hgt, TER.z1 - TER.z0, STEP0 + SW_ * k + (SW_ * (NS - k)) / 2, hgt / 2, (TER.z0 + TER.z1) / 2, k % 2 ? conc : concD); }
        cb(TER.x1 - TER.x0, TER.y, TER.z1 - TER.z0, (TER.x0 + TER.x1) / 2, TER.y / 2, (TER.z0 + TER.z1) / 2, conc);
        for (const z of [TER.z0, TER.z1]) cb(TER.x1 - STEP0, 1.0, 0.18, (STEP0 + TER.x1) / 2, TER.y + 0.5, z, steel, false);     // railings at the open ends of the walk
        for (let k = 0; k < 4; k++) { const z = TER.z0 + 4 + k * 8; cb(0.5, 0.45, 2.2, TER.x1 - 1.2, TER.y + 0.22, z, E.mat('#3a3f3a', { rough: 0.6 })); }   // benches
        // the project towers: plain brick slabs, rows of small windows, a water tank on the roof
        const projTex = (lit) => canvas(512, 256, (c, w, h) => {
          c.fillStyle = lit ? '#000' : '#7b4434'; c.fillRect(0, 0, w, h);
          if (!lit) for (let y = 0; y < h; y += 4) { c.fillStyle = `rgba(0,0,0,${0.08 + cr2() * 0.1})`; c.fillRect(0, y, w, 1); for (let x = (y / 4) % 2 ? 0 : 6; x < w; x += 12) c.fillRect(x, y, 1, 4); }
          const bw = w / 8, fh = h / 4;
          for (let fy = 0; fy < 4; fy++) for (let bxI = 0; bxI < 8; bxI++) for (const off of [0.18, 0.56]) {
            const x = bxI * bw + off * bw, y = fy * fh + fh * 0.25, ww = bw * 0.26, hh = fh * 0.5, on = cr2() < 0.32;
            if (lit) { if (on) { c.fillStyle = ['#ffd9a0', '#fff1d6', '#cfe6ff', '#ffc27a'][Math.floor(cr2() * 4)]; c.fillRect(x + 2, y + 2, ww - 4, hh - 4); } continue; }
            c.fillStyle = '#e8e4da'; c.fillRect(x, y, ww, hh); c.fillStyle = on ? '#3a3226' : '#14171b'; c.fillRect(x + 2, y + 2, ww - 4, hh - 4); c.fillStyle = '#e8e4da'; c.fillRect(x, y + hh / 2 - 1, ww, 2);
          }
        });
        const tower = (x, z, w, d, floors) => {
          const H = floors * 2.75, base = projTex(false), glow = projTex(true);
          for (const t of [base, glow]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(Math.max(w, d) / 25.6, floors / 4); }
          const m = E.mat('#ffffff', { map: base, emissiveMap: glow, emissive: '#ffffff', emissiveIntensity: 0.9, rough: 0.9 });
          const b = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), m); b.position.set(x, H / 2, z); b.castShadow = b.receiveShadow = true; cg.add(b);
          cb(w + 0.3, 0.4, d + 0.3, x, H + 0.2, z, concD);                                                          // parapet
          cb(w * 0.3, 2.6, d * 0.3, x - w * 0.2, H + 1.3, z, E.mat('#6e3a2c', { rough: 0.9 }));                       // stair bulkhead
          const wt = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.6, 14), E.mat('#5a4636', { rough: 0.95 })); wt.position.set(x + w * 0.2, H + 3.2, z); wt.castShadow = true; cg.add(wt);
          const roof = new THREE.Mesh(new THREE.ConeGeometry(1.55, 1.0, 14), E.mat('#3a2c22')); roof.position.set(x + w * 0.2, H + 5.0, z); cg.add(roof);
          for (const [a, c2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cb(0.12, 1.9, 0.12, x + w * 0.2 + a * 1.0, H + 0.95, z + c2 * 1.0, steel, false);
          addB(x, z, w / 2 + 0.05, d / 2 + 0.05);
          return { H };
        };
        tower(25, -6.6, 12, 13, 13); tower(25, 10, 12, 12, 12);
        // the doors face the walk: a lit entrance and a canopy for each tower
        for (const z of [-6.6, 10]) { cb(0.1, 2.4, 1.8, 18.98, TER.y + 1.2, z, new THREE.MeshBasicMaterial({ color: '#d8f0ff' }), false); cb(1.4, 0.15, 2.6, 18.3, TER.y + 2.7, z, steel); }
        // court lights: four tall poles with cool-white heads, and a light that actually lights the court
        const headM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#eef6ff').convertSRGBToLinear().multiplyScalar(1.6) }); headM.userData.lin = true;
        for (const [x, z] of [[fx0 + 0.3, fz0 + 0.3], [fx0 + 0.3, fz1 - 0.3], [STEP0 - 0.3, fz0 + 0.3], [STEP0 - 0.3, fz1 - 0.3]]) {
          cb(0.14, 7.5, 0.14, x, 3.75, z, steel); cb(0.7, 0.22, 0.4, x + (x < CT.x ? 0.35 : -0.35), 7.5, z + (z < CT.z ? 0.3 : -0.3), headM, false);
        }
        const cl = new THREE.PointLight(new THREE.Color('#dfeaff').convertSRGBToLinear(), 1.6, 34, 1.4); cl.position.set(CT.x, 8, CT.z); cg.add(cl);
        // fire escapes on the backs of the brownstones, looking down on the court
        for (let i = 0; i < 4; i++) {
          const z0 = 17 + i * 6.2;
          for (const y of [4.1, 6.4, 8.7]) { FB.box(1.1, 0.06, 2.6, 15.15, y, z0 + 0.6, ironM, false); FB.box(0.04, 0.9, 2.6, 15.68, y + 0.45, z0 + 0.6, ironM, false); for (const zz of [-1.25, 1.25]) FB.box(1.1, 0.9, 0.04, 15.15, y + 0.45, z0 + 0.6 + zz, ironM, false); }
          for (const y of [4.1, 6.4]) { const st = FB.box(0.5, 0.05, 2.7, 15.2, y + 1.15, z0 + 0.6, ironM, false); st.rotation.x = 0.72; }
        }
        CB.flush(); FB.flush();
      }
      const courtGround = (lx, lz) => {
        const u = lz - CO.z, v = CO.x - lx; lx = u; lz = v;   // into the court's frame
        if (lz < TER.z0 || lz > TER.z1) return 0;
        if (lx >= TER.x0 && lx <= TER.x1) return TER.y;
        if (lx > STEP0 && lx < TER.x0) return (Math.ceil(((lx - STEP0) / (TER.x0 - STEP0)) * 6) * TER.y) / 6;   // one riser at a time
        return 0;
      };
      p.ground = ((g0) => (lx, lz, y) => Math.max(courtGround(lx, lz), g0 ? g0(lx, lz, y) : 0))(p.ground);   // with the sidewalks' kerb height
      p.map = [{ t: 'rect', x: 36.6, z: 16, w: 31.8, h: 18.4, c: '#2f5a45' }, { t: 'rect', x: 35, z: 41, w: 30, h: 12, c: '#5a3a30' }, { t: 'rect', x: 10.6, z: 29.4, w: 8, h: 31, c: '#5a3d30' }, { t: 'rect', x: 0, z: -10, w: W * 2, h: Z0 - Z1, c: '#3c3e46' }, { t: 'rect', x: 0, z: -90, w: 190, h: 110, c: '#1c2230' }];
      p.grade = {
        top: '#05070f', bottom: '#1a2234', fog: '#0f141e', near: 24, far: 190,
        sun: '#9fb4ff', sunInt: 0.3, hemi: 0.28, sunDir: [0.2, 0.8, -0.4],
        tint: [0.96, 1.0, 1.1], expo: 1.25, sat: 0.95, stars: 0.15,
      };
      p.face = Math.PI / 2;   // facing the stoops
      p.soloView = true;
      p.vp = [2, 26.3];   // the music lives on the pavement in front of the two performers, not in the office
      p.pathEnd = 41;
      p.clearR = 26;
      p.noPier = (lx, lz) => Math.abs(lx) < W + 2 && lz < Z0 + 2 && lz > Z1 - 2;   // the ring road crosses above the office: keep its piers out of the floor
      p.core = (lx, lz) => inCourts(lx, lz) || wedgeIn(lx, lz) || (lx > -27 && lx < 17 && lz >= 8 && lz < 61) || (Math.abs(lx) < 24 && lz < 13 && lz > -32);   // the row and the office
      p.spillRank = 1;   // its rowhouses win over FLIP's outskirts where they meet
      p.blocks = (lx, lz) => inCourts(lx, lz) || wedgeIn(lx, lz) || (lx > -27 && lx < 17 && lz >= 8 && lz < 61) || neighbourhood.some((f) => Math.abs(f.x - lx) < f.w / 2 + 4.5 && Math.abs(f.z - lz) < f.d / 2 + 2) || (lx > -8 && lx < 17 && lz >= 12 && lz < 48) || (Math.abs(lx) < 24 && lz < 13 && lz > -32) || (lz < -30 && lz > -150 && Math.abs(lx) < 100);

      p.update = (t, dt, f, v) => {
        if (streetLife) {   // the barber's pole turns; the neighbours nod along when the music is up
          if (streetLife.barberPole) streetLife.barberPole.material.map.offset.y = (t * 0.6) % 1;
          streetLife.neighbours.forEach((n, i) => { n.m.f.position.y = n.base + Math.max(0, Math.sin(t * 6 + i)) * 0.03 * (f.level || 0) * 3; if (n.m.head) n.m.head.rotation.x = Math.sin(t * 4 + i * 1.3) * 0.12 * (f.pulse || 0); });
        }
        if (neonM) neonM.opacity = Math.sin(t * 37) > 0.97 || (t % 7 > 6.85) ? 0.25 : 1;   // the deli's OPEN sign, buzzing
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
        fieldKit.glow(0.4 + f.level * 0.6);
        // The two performers follow the song (p.songT, the track's playback position): whoever has the verse leads,
        // the other backs them up. First half on the stoop, then up the steps and in through the door to perform
        // from the first-floor windows for the second half, and back down for the loop.
        // p.songT is the playing track's position. Before the track starts (further away, or still loading) use the clock it will be
        // synced to, so nothing jumps when the audio comes in.
        { const A = SW.Audio; songT = p.songT != null ? p.songT : A && A.ctx ? (((A.ctx.currentTime - A.epoch) % LEN) + LEN) % LEN : t % LEN; }
        const leadName = whoAt(songT);
        let upMax = 0;
        perf.forEach((m, i) => {
          const tc = (((songT - m.off) % LEN) + LEN) % LEN, lead = m.name === leadName, b = Math.abs(Math.sin(t * 3.6 + m.s));   // each has their own clock, offset so they only move while the other has the verse
          m.amp += ((lead ? 1 : 0.3) - m.amp) * Math.min(1, dt * 3);                    // hand the lead over smoothly at a verse change
          const e = (0.35 + f.level * 1.4) * m.amp;
          const sx = m.X - 1.46, doorX = m.X + 0.6, lerp = (a, c, k) => a + (c - a) * k;
          const stairY = (x) => 0.225 * (Math.max(0, Math.min(7, Math.floor((x - (m.X - 3.085)) / 0.36))) + 1);
          let x = sx, y = 0.225 * 5, z = m.dz + m.zo, yaw = -Math.PI / 2 + m.yaw, lean = 0, door = 0, up = 0, vis = true, act = true;
          if (tc >= GO_IN && tc < GO_IN + 3) { const k = (tc - GO_IN) / 3; x = lerp(sx, doorX, k); y = stairY(x); z = m.dz + m.zo * (1 - Math.min(1, k * 2)); yaw = Math.PI / 2; door = sstep(0, 0.3, k); act = false; vis = x < m.X + 0.25; }
          else if (tc >= GO_IN + 3 && tc < GO_IN + 5) { vis = false; door = 1 - sstep(GO_IN + 3, GO_IN + 3.8, tc); }
          else if (tc >= GO_IN + 5 && tc < COME_OUT - 2) { up = sstep(GO_IN + 5.2, GO_IN + 6.2, tc) * (1 - sstep(COME_OUT - 3.3, COME_OUT - 2.2, tc)); x = m.X + 0.56 + (1 - up) * 0.3; y = 4.52; z = m.z0; yaw = -Math.PI / 2 + m.yaw * 0.5; lean = 0.44 * up; vis = up > 0.03; }
          else if (tc >= COME_OUT - 2 && tc < COME_OUT) { vis = false; door = sstep(COME_OUT - 0.8, COME_OUT, tc); }
          else if (tc >= COME_OUT && tc < COME_OUT + 3) { const k = (tc - COME_OUT) / 3; x = lerp(doorX, sx, k); y = stairY(x); z = m.dz + m.zo * Math.max(0, k * 2 - 1); door = 1 - sstep(0.6, 0.95, k); act = false; vis = x < m.X + 0.25; }
          upMax = Math.max(upMax, up); m.up = up;
          m.w.visible = vis;
          m.w.position.set(x, y + (act ? b * 0.05 * e + f.pulse * 0.06 * m.amp : Math.abs(Math.sin(t * 9)) * 0.04), z);
          m.w.rotation.y = yaw; m.f.rotation.x = lean;
          m.hinge.rotation.y = 1.35 * door;   // swings inward, into the dark hallway, so it never crosses the performer
          const so = Math.max(up, 0); m.sash.scale.y = 1 - 0.6 * so; m.sash.position.y = 6.3 + 1.7 * 0.3 * so;
          m.torso.rotation.z = act ? Math.sin(t * 1.8 + m.s) * 0.1 * e : 0; m.head.rotation.x = act ? -f.pulse * 0.25 * m.amp : 0;
          if (act) {
            const a = m.amp, k = (a - 0.3) / 0.7;                                                                                  // 1 = leading, 0 = backing
            m.arms[1].rotation.x = lerp(-0.95, -1.9, k) + Math.sin(t * 2.2 + m.s) * 0.12; m.arms[1].rotation.z = -0.35;           // mic at the mouth when leading, at the chest when not
            m.arms[0].rotation.x = lerp(-0.25, -0.9, k) - Math.sin(t * 3.6 + m.s) * 0.6 * e; m.arms[0].rotation.z = (i ? 1 : -1) * 0.2 - 0.3; // free hand: big gestures when leading
          } else { const sw = Math.sin(t * 9) * 0.5; m.arms[0].rotation.set(sw, 0, 0); m.arms[1].rotation.set(-sw, 0, 0); }       // walking
        });
        { const li = perf.findIndex((m) => m.name === leadName), lm = perf[li < 0 ? 0 : li];   // the camera follows whoever has the verse: up to their window, and across to their side
          stoopUp += (lm.up - stoopUp) * Math.min(1, dt * 2.5);
          camLead += ((li === 1 ? 1 : -1) - camLead) * Math.min(1, dt * 1.5); }
      };
      p.shot = (t, f) => {
        if (!CUTAWAYS.some(([a, c]) => songT >= a && songT < c)) {   // the performance; pulls back and tilts up when they are at the windows. Short cutaways go to the firefight.
          const narrow = innerWidth / innerHeight < 0.8, who = perf.findIndex((m) => m.name === whoAt(songT)) === 1 ? 1 : 0, u = RM ? (stoopUp > 0.5 ? 1 : 0) : stoopUp;
          // a portrait screen frames whoever has the verse; a wide one keeps both in frame and leans towards the lead
          const asp = innerWidth / innerHeight, ln = camLead * (asp < 1.3 ? 0.8 : 0.8 * Math.max(0, Math.min(1, (asp - 1.5) / 0.28)));   // lean only as far as both still fit
          const zs = narrow ? (who ? 27.55 : 21.85) : 24.7 + ln, zw = narrow ? (who ? 29.4 : 23.2) : 26.3 + ln, zc = zs + (zw - zs) * u, a = Math.sin(t * 0.25) * (narrow ? 0.5 : 1.2);
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
  /* A small expressway parking area in the style of the Shuto's Komagata PA: a lay-by beside the carriageway with long
     tapers in and out, stalls painted at an angle, a little building with toilets and glowing vending machines, a bench,
     tall lamps and a few cars parked. In the place's frame; the road runs along x with its inner edge at z = zr.
       o: { y, zr, depth, half, taper, name, kiosk: [x0, x1], walkway: [x0, x1, z1] | null, ground(lx, lz), skip(lx, lz), slotX } */
  function parkingArea(p, E, g, o) {
    const { y, zr, depth, half, taper } = o, AB = (x, z, hx, hz) => p.addBox(x, z, hx, hz, y - 1.2, 1e9), AC = (x, z, r0) => p.addCircle(x, z, r0, y - 1.2, 1e9),   // up on the deck only: whatever runs underneath (a tunnel, a walk) is not blocked
      zb = zr + depth, BB = E.batch(g), bx = BB.box, rr = E.rng(9191);
    const asph = E.mat('#3a3a3e', { map: E.tex('asphalt', 1, 1), rough: 0.85 }), conc = E.mat('#8a8680', { map: E.tex('concrete', 1, 1), rough: 0.9 }), concD = E.mat('#5a5754'), rail = E.mat('#9aa0a8', { metal: 0.6, rough: 0.4 }), paint = E.basic('#e9e4d6');
    // the deck: a trapezoid, wide at the road (the tapers) and the stalls' depth along the middle
    { const sh = new THREE.Shape(), T = 2.2; sh.moveTo(-half - taper, -zr); sh.lineTo(half + taper, -zr); sh.lineTo(half, -(zr + T)); sh.lineTo(half, -zb); sh.lineTo(-half, -zb); sh.lineTo(-half, -(zr + T)); sh.lineTo(-half - taper, -zr);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.6, bevelEnabled: false }); geo.rotateX(-Math.PI / 2); geo.translate(0, y - 0.6, 0);
      const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 6, uv.getY(i) / 6);
      const deck = new THREE.Mesh(geo, [asph, concD]); deck.receiveShadow = deck.castShadow = true; g.add(deck); p.pick(deck); }
    if (o.kiosk) { const [k0, k1] = o.kiosk; bx(k1 - k0, 0.6, 4.4, (k0 + k1) / 2, y - 0.3, zb + 2.2, conc); }
    if (o.walkway) { const [w0, w1, wz] = o.walkway; bx(w1 - w0, 0.6, wz - zb, (w0 + w1) / 2, y - 0.3, (zb + wz) / 2, conc); }
    // paint: a dashed line along the road edge and stalls at sixty degrees, nosing towards the way out (+x)
    for (let x = -half - taper + 2; x < half + taper - 2; x += 3) bx(1.6, 0.02, 0.12, x, y + 0.012, zr + 0.25, paint, false);
    const stallZ = zb - 2.6, stalls = [];
    for (let x = -half + 3; x <= half - 3; x += 2.9) { const l = bx(0.1, 0.02, 5.2, x, y + 0.012, stallZ, paint, false); l.rotation.y = -0.52; stalls.push(x + 1.45); }
    bx(half * 2, 0.02, 0.12, 0, y + 0.012, zb - 0.25, paint, false);
    // the back rail (open where you walk in), and a low barrier on the road side that only stops people on foot
    const openings = [o.walkway ? [o.walkway[0], o.walkway[1]] : null, o.kiosk ? [o.kiosk[0] - 0.5, o.kiosk[1] + 0.5] : null, ...(o.open || [])].filter(Boolean);
    let xs = -half; const cuts = openings.slice().sort((a, b) => a[0] - b[0]);
    for (const [a, b] of cuts.concat([[half, half]])) { if (a > xs + 0.3) { bx(a - xs, 1.05, 0.12, (a + xs) / 2, y + 0.52, zb, rail); AB((a + xs) / 2, zb, (a - xs) / 2, 0.2); } xs = Math.max(xs, b); }
    for (const sd of [-1, 1]) { const len = Math.hypot(taper, depth - 2.2), r2 = bx(len, 1.05, 0.12, sd * (half + taper / 2), y + 0.52, zr + 2.2 + (depth - 2.2) / 2, rail); r2.rotation.y = sd * Math.atan2(depth - 2.2, taper); }
    AB(0, zr + 0.45, half + taper, 0.2);
    // the building: toilets on one side, vending machines glowing under a deep roof, a bench
    if (o.kiosk) {
      const [k0, k1] = o.kiosk, kx = (k0 + k1) / 2, kz = zb + 2.4, W = k1 - k0 - 1;
      bx(W, 3.0, 3.2, kx, y + 1.5, kz + 0.4, E.mat('#d8d4cc', { rough: 0.8 })); bx(W + 2, 0.25, 4.6, kx, y + 3.15, kz - 0.1, E.mat('#3a3d42', { rough: 0.5 }));
      AB(kx, kz + 0.4, W / 2 + 0.1, 1.7);
      const sign = (txt, w, x, yy, z, col, bg) => { const m = new THREE.MeshBasicMaterial({ map: E.textTex(txt, { w: 512, h: 96, color: col, bg, font: '700 62px "Hind","Noto Sans JP",sans-serif' }), transparent: true }); m.userData.lin = true; const s = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.19), m); s.position.set(x, yy, z); s.rotation.y = Math.PI; g.add(s); };
      sign(o.name, 4, kx, y + 3.55, kz - 2.42, '#f4f1e6', '#1f55b8');
      sign('トイレ  WC', 2.2, kx - W / 4, y + 2.6, kz - 1.22, '#1a1a1c', '#f4f1e6');
      bx(0.9, 2.2, 0.05, kx - W / 4, y + 1.1, kz - 1.21, E.mat('#5a6a7a', { rough: 0.6 }), false);
      const vend = ['#f4f1e6', '#d23a2a', '#2457c5'].map((c) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(c).convertSRGBToLinear().multiplyScalar(0.9) }); m.userData.lin = true; return m; });
      for (let k = 0; k < 3; k++) { const vx = kx + 0.4 + k * 1.05; bx(0.95, 1.85, 0.75, vx, y + 0.93, kz - 1.55, E.mat('#e4e2dc', { rough: 0.5 })); bx(0.75, 1.1, 0.02, vx, y + 1.15, kz - 1.93, vend[k], false); }
      AB(kx + 1.45, kz - 1.55, 1.6, 0.4);
      E.bench(g, kx - W / 2 + 0.8, kz - 1.8, Math.PI, y);
    }
    // lamps along the back, and pillars under the deck where it stands out over lower ground
    for (let x = -half + 2; x <= half - 2; x += 14) { bx(0.16, 7.5, 0.16, x, y + 3.75, zb - 0.3, concD); bx(0.2, 0.1, 2.2, x, y + 7.45, zb - 1.3, concD); bx(0.6, 0.12, 0.35, x, y + 7.35, zb - 2.3, E.basic('#ffd9a0'), false); AC(x, zb - 0.3, 0.15); }
    for (let x = -half - taper + 4; x <= half + taper - 4; x += 8) for (const z of [zr + 1.2, zb - 1.2]) {
      if (z > zr + 2.2 && Math.abs(x) > half - 0.5) continue;
      const g0 = o.ground ? o.ground(x, z) : 0; if (y - g0 < 1.6 || (o.skip && o.skip(x, z))) continue;
      bx(0.7, y - 0.6 - g0, 0.7, x, g0 + (y - 0.6 - g0) / 2, z, concD); p.addCircle(x, z, 0.45, -1e9, y - 1);
    }
    // a few cars already parked (not in the stall the game parks yours in)
    if (SW.Cars) { let n = 0; for (const sx of stalls) { if (Math.abs(sx - o.slotX) < 4 || rr() < 0.55 || n >= 3) continue; const car = SW.Cars.make(E, Math.floor(rr() * 7)); car.position.set(sx, y, stallZ + 0.2); car.rotation.y = Math.PI / 2 - 0.52; g.add(car); n++; } }
    BB.flush();
    return { stallZ };
  }

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
      // the parking area beside the expressway, reached on foot by the ramp
      parkingArea(p, E, g, { y: H, zr: -7, depth: 6.4, half: 24, taper: 12, name: 'SHOT PA', kiosk: [9, 18], walkway: [-2.5, 2.5, 6], slotX: 6 });
      p.ground = (lx, lz) => {
        if (Math.abs(lx) < 2.6 && lz >= 6 && lz <= 26) return (H * (26 - lz)) / 20;
        if (lz >= -7.2 && lz <= -0.6 && Math.abs(lx) < 24 + 12 * Math.max(0, Math.min(1, (-4.8 - lz) / 2.2))) return H;   // the lay-by and its tapers
        if (Math.abs(lx) < 2.6 && lz > -0.6 && lz <= 6) return H;    // the walkway to the ramp
        if (lx > 9 && lx < 18 && lz > -0.6 && lz < 3.8) return H;    // in front of the building
        return 0;
      };
      p.addBox(-3.7, 6.2, 0.6, 0.2, -1e9, H - 2); p.addBox(3.7, 6.2, 0.6, 0.2, -1e9, H - 2); p.addBox(-2.75, 2.7, 0.2, 3.2); p.addBox(2.75, 2.7, 0.2, 3.2);   // the walkway's sides
      p.addBox(-2.85, 16, 0.25, 10); p.addBox(2.85, 16, 0.25, 10);

      // The expressway. In the world it is a stretch of the ring road (drawn by the game); this straight copy is
      // only shown while viewing, when the scenery streams past it.
      const own = new THREE.Group(); own.visible = false; g.add(own);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 60, 1, WD), E.mat('#2a2a2f', { map: E.tex('asphalt', 30, 4), rough: 0.8 }));
      deck.position.set(0, H - 0.53, ZC); deck.receiveShadow = true; own.add(deck);
      for (const z of [ZC + WD / 2, ZC - WD / 2]) { const w = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 60, 1.4, 0.35), concD); w.position.set(0, H + 0.7, z); own.add(w); }
      const div = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 60, 0.6, 0.5), conc); div.position.set(0, H + 0.3, ZC); own.add(div);

      // Roadside things that stream past while viewing
      const tm = treadmill(HALF + 30), viewOnly = [];   // viewOnly: the ring road has its own lane marks and lamps
      const lampHeadM = basic('#ffb04a'), dashM = basic('#d8d2c4'), poleM = E.mat('#3a3a40', { metal: 0.5 });
      for (let x = -HALF - 30; x < HALF + 30; x += 6) {
        for (const z of [ZC + 4, ZC - 4]) { const d = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.03, 0.18), dashM); d.position.set(x, H + 0.02, z); g.add(tm.add(d)); viewOnly.push(d); }
      }
      const lampGroup = [];
      for (let x = -HALF - 30; x < HALF + 30; x += 18) {
        const lp = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 7, 6), poleM); pole.position.y = 3.5;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 6), poleM); arm.position.set(0, 7, 0);
        lp.add(pole, arm);
        for (const z of [-2.8, 2.8]) { const hd = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.5), lampHeadM); hd.position.set(0, 6.9, z); lp.add(hd); }
        lp.position.set(x, H, ZC);
        g.add(tm.add(lp)); lampGroup.push(lp); viewOnly.push(lp);
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
      const shotKit = SW.Buildings.kit(E, 2), kr = E.rng(7202);
      const blocks = [];
      for (let i = 0; i < 46; i++) {
        const x = -HALF - 30 + r() * (HALF * 2 + 60);
        const far = r() < 0.75;
        const z = far ? ZC - WD / 2 - 6 - r() * 40 : ZC + WD / 2 + 4 + r() * 3;
        if (!far && Math.abs(x) < 14) continue;
        const w = 7 + r() * 8, d = 7 + r() * 8, h = far ? 10 + r() * 34 : 4 + r() * 4;
        const b = shotKit.mesh(w, h, d, kr);
        b.position.set(x, 0, z); g.add(tm.add(b));
        blocks.push({ b, h, k: i % 24 });
      }
      p.addBox(0, ZC - WD / 2 - 27, HALF + 30, 22);

      // Traffic
      const lanes = [{ z: ZC - 2, v: 27 }, { z: ZC - 5.5, v: 22 }, { z: ZC + 2, v: -29 }, { z: ZC + 5.5, v: -24 }];   // keep left: +X on the outer side, fast lane by the median
      const palette = ['#d8d8dc', '#1d1f26', '#b8202a', '#2c4a8a', '#e0b030', '#5a5f66'];
      const cars = [];
      for (let i = 0; i < 18; i++) {
        const ln = lanes[i % 4];
        const c = car(E, palette[Math.floor(r() * palette.length)], r);
        c.position.set(-HALF + r() * HALF * 2, H, ln.z);
        if (ln.v < 0) c.rotation.y = Math.PI;
        c.userData.v = ln.v * (0.85 + r() * 0.3);
        c.visible = false; g.add(c); cars.push(c);
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
        own.visible = viewing; viewOnly.forEach((o) => (o.visible = viewing));
        const L = (HALF + 30) * 2;
        cars.forEach((c) => {
          c.position.x += (c.userData.v - speed) * dt;
          if (c.position.x > HALF + 30) c.position.x -= L;
          if (c.position.x < -HALF - 30) c.position.x += L;
          c.visible = viewing;   // out in the world the ring road has its own traffic
        });
        lampHeadM.color.setRGB(1, 0.43, 0.06).multiplyScalar(0.8 + f.pulse * 0.9);
        shotKit.glow(0.35 + f.mid * 1.4);
        blocks.forEach((B) => { B.b.scale.y += (B.h * (0.75 + band(f, B.k, 24) * 0.5) - B.b.scale.y) * Math.min(1, dt * 8); });
      };
      p.shot = (t, f) => {
        const s = RM ? 0 : f.pulse * 0.06;
        return { pos: [-40, H + 1.25 + s, ZC - 3.8 - Math.sin(t * 0.4) * 0.6], look: [10, H + 1.0, ZC - 2.5 - Math.sin(t * 0.4 + 0.6) * 1.5], roll: -Math.sin(t * 0.4) * 0.02 };
      };
    },
  };

  /* ------------------------------------------------------------------ */
  /* OHH — speeding along a coastal road through a gorge at golden hour  */
  /* ------------------------------------------------------------------ */
  PLACES.ohh = {
    build(p, E) {
      const g = p.group, r = E.rng(151);
      let tunnelLamps = null, chanMap = [], chanWater = null; const harbourLamps = [], harbourBoats = [];
      const HR = 36, HH = 12, PL = 9, RZ = -15, RH = 12, HALF = 60;   // the road is level with the top of the hill
      const height = (lx, lz) => {
        const d = Math.hypot(lx, lz);
        if (d <= PL) return HH;
        if (d >= HR) return 0;
        return HH * 0.5 * (1 + Math.cos((Math.PI * (d - PL)) / (HR - PL)));
      };
      // TAMA EXPRESSION's river runs on through a tunnel under this hill and out across the beach into the sea.
      // The channel is a smooth curve in this place's frame: from the end of the river, into the hill, out on the sea side.
      const tama = SW.SONGS.find((q) => q.scene === 'tama');
      let chan = null, inChan = () => false, chanD = () => 1e9;
      if (tama) {
        const tf = SW.Ring.frame(tama), a = p.local(...Object.values(tf.toWorld(50, -14))), a2 = p.local(...Object.values(tf.toWorld(38, -14)));   // the river's west end, the one by this hill
        const dx = a.x - a2.x, dz = a.z - a2.z, dl = Math.hypot(dx, dz), ux = dx / dl, uz = dz / dl;   // the way the river flows, out of TAMA
        const pts = [[a.x - ux * 3, a.z - uz * 3], [a.x + ux * 5, a.z + uz * 5], [-12, 4], [-11, -14], [-16, -30], [-22, -44]];   // deep under the hill, so the bore is buried right up to each portal
        const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
        const N = Math.round(curve.getLength() / 1.5), P = curve.getSpacedPoints(N).map((v) => [v.x, v.z]);
        const inside = P.map(([x, z]) => height(x, z) > 6.6);   // the portals stand where the hill is higher than the vault
        chan = { P, W: 5, first: inside.indexOf(true), last: inside.lastIndexOf(true) };
        chanD = (lx, lz) => { let b = 1e9; for (const [x, z] of P) b = Math.min(b, Math.hypot(lx - x, lz - z)); return b; };
        inChan = (lx, lz) => chanD(lx, lz) < chan.W;
        // under the hill the vault is the ceiling: the camera stays below it
        p.ceil = (lx, lz) => { if (chan.first < 0) return null; let b = 1e9, bi = 0; P.forEach(([x, z], i) => { const d = Math.hypot(lx - x, lz - z); if (d < b) { b = d; bi = i; } }); return b < chan.W + 1.2 && bi >= chan.first && bi <= chan.last ? 4.6 : null; };
      }
      // Outside the tunnel the channel runs in an open cutting: the hill is dug away along it, up to each portal.
      const carve = (lx, lz) => {
        if (!chan) return 1;
        let b = 1e9, bi = 0; chan.P.forEach(([x, z], i) => { const d = Math.hypot(lx - x, lz - z); if (d < b) { b = d; bi = i; } });
        if (bi >= chan.first && bi <= chan.last && chan.first >= 0) return 1;
        return Math.max(0, Math.min(1, (b - chan.W - 0.8) / 3.5));
      };
      const heightC = (lx, lz) => height(lx, lz) * carve(lx, lz);
      p.noPier = (lx, lz) => chanD(lx, lz) < 8;   // the ring road steps over the channel
      // Inside the tunnel (low down, within the channel) the ground is the water; anywhere else, the hill.
      p.ground = (lx, lz, y) => (!(y !== undefined && y < 6 && inChan(lx, lz)) && lz < -4.1 && lz > -10.7 && Math.abs(lx) < 18 + 10 * Math.max(0, Math.min(1, (-8.3 - lz) / 2.2)) ? RH + 0.03 : lx > 9 && lx < 17 && lz >= -4.1 && lz < 0.3 ? RH + 0.03 : y !== undefined && y < 4 && inChan(lx, lz) && height(lx, lz) > 0.2 ? 0 : heightC(lx, lz));
      const hg = new THREE.RingGeometry(0.01, HR, 120, 48);
      const hp = hg.attributes.position;
      for (let i = 0; i < hp.count; i++) {
        const x = hp.getX(i), y = hp.getY(i);
        const kc = carve(x, -y); hp.setZ(i, height(x, -y) * kc + (Math.hypot(x, y) > PL + 1 && Math.hypot(x, y) < HR - 1 ? (r() - 0.5) * 0.5 * kc : 0) + 0.01);
      }
      let hgeo = hg;
      if (chan && chan.first >= 0) {   // drop the faces that would hang across the tunnel mouths (the slope between the cutting and the hill above the bore)
        const ni = hg.toNonIndexed(), pa = ni.attributes.position.array, keep = [];
        for (let i = 0; i < pa.length; i += 9) {
          const x = (pa[i] + pa[i + 3] + pa[i + 6]) / 3, z = -(pa[i + 1] + pa[i + 4] + pa[i + 7]) / 3, y = (pa[i + 2] + pa[i + 5] + pa[i + 8]) / 3;
          if (chanD(x, z) < chan.W + 1.4 && y < 7.2) continue;
          for (let k = 0; k < 9; k++) keep.push(pa[i + k]);
        }
        hgeo = new THREE.BufferGeometry(); hgeo.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
      }
      hgeo.computeVertexNormals();
      const hill = new THREE.Mesh(hgeo, E.mat('#b4c08e', { map: E.tex('grass', 16, 16), rough: 0.95 }));   // photographed grass (Poly Haven, CC0)
      hill.rotation.x = -Math.PI / 2; hill.receiveShadow = true;
      g.add(hill); p.pick(hill);
      const rockM = E.mat('#b0a696', { map: E.tex('rock', 1, 1), rough: 0.95 }), rockD = E.mat('#8a8070', { map: E.tex('rock', 1, 1), rough: 0.95 });   // photographed rock (Poly Haven, CC0)
      for (let i = 0; i < 18; i++) {
        const a = r() * Math.PI * 2, d = PL + 4 + r() * 20;
        const lx = Math.cos(a) * d, lz = Math.sin(a) * d;
        if (lz > -2 && Math.abs(lx) < 6) continue;
        const s = 0.8 + r() * 1.8;
        if (chanD(lx, lz) < s + 8) continue;   // nothing over or in the tunnel
        const m = new THREE.Mesh(E.rockGeo(i), r() < 0.5 ? rockM : rockD); m.scale.setScalar(s);
        m.position.set(lx, height(lx, lz) + s * 0.3, lz); m.rotation.set(r() * 3, r() * 3, 0); m.castShadow = true;
        if (lz + s > RZ - 4.5 && lz - s < (Math.abs(lx) < 28 + s ? 0.5 : RZ + 4.5) && height(lx, lz) + s * 1.3 > RH - 0.9) continue;   // it would poke up through the road or the lay-by
        g.add(m); p.addCircle(lx, lz, s * 0.8);
      }
      if (chan) {
        const { P, W } = chan, n = P.length;
        const tan = (i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
        // the water: one strip along the whole channel
        { const pos = [], idx = [];
          const uvs = [];
          P.forEach(([x, z], i) => { const [tx, tz] = tan(i); pos.push(x - tz * W, 0.05, z + tx * W, x + tz * W, 0.05, z - tx * W); uvs.push((x - tz * W) / 14, (z + tx * W) / 14, (x + tz * W) / 14, (z - tx * W) / 14); if (i < n - 1) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); } });
          const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(idx); geo.computeVertexNormals();
          const wm = E.gloss('#1d3a4c', { rough: 0.12, metal: 0.2, env: 1.1 }); wm.side = THREE.DoubleSide;
          wm.normalMap = E.waterN; wm.normalScale.set(0.55, 0.55); chanWater = wm;   // only the channel scrolls this texture's offset; the shaders do their own
          const w = new THREE.Mesh(geo, wm); w.receiveShadow = true; g.add(w); p.pick(w);
          P.forEach(([x, z], i) => { if (i % 2 === 0) p.water(x, z, W - 0.6, W - 0.6); }); }
        // the tunnel: where the hill stands over the channel, a vaulted bore with lamps; a stone portal at each end
        const { first, last } = chan;
        if (first >= 0) {
          const R = W + 0.6, HV = 5.4, pos = [], idx = [], SEG = 12;
          for (let i = first; i <= last; i++) {
            const [x, z] = P[i], [tx, tz] = tan(i);
            for (let k = 0; k <= SEG; k++) { const a = Math.PI * (k / SEG), sx = Math.cos(a) * R, y = k === 0 || k === SEG ? 0 : 1.6 + Math.sin(a) * (HV - 1.6); pos.push(x - tz * sx, y, z + tx * sx); }
            if (i < last) for (let k = 0; k < SEG; k++) { const b = (i - first) * (SEG + 1) + k, c = b + SEG + 1; idx.push(b, c, b + 1, b + 1, c, c + 1); }
          }
          const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
          const vm = E.mat('#55524c', { map: E.tex('concrete', 2, 6), rough: 0.95 }); const vault = new THREE.Mesh(geo, vm.clone()); vault.material.side = THREE.DoubleSide; g.add(vault);
          const lampM = basic('#ffcf8a'), lamps = [];
          for (let i = first + 2; i < last - 1; i += 5) for (const sd of [-1, 1]) { const [x, z] = P[i], [tx, tz] = tan(i), l = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.18, 1.2), lampM); l.position.set(x - tz * sd * (R - 0.3), 3.6, z + tx * sd * (R - 0.3)); l.rotation.y = Math.atan2(tx, tz); g.add(l); lamps.push(l); }
          const glowL = new THREE.PointLight(new THREE.Color('#ffb46a').convertSRGBToLinear(), 1.4, 30, 1.6); glowL.position.set(...(() => { const m = P[Math.round((first + last) / 2)]; return [m[0], 3.5, m[1]]; })()); g.add(glowL);
          const stone = E.mat('#7a7468', { map: E.tex('concrete', 2, 2), rough: 0.9 });
          for (const i of [first, last]) {   // portal: two piers, a deep lintel and wing walls holding the hill back
            const [x, z] = P[i], [tx, tz] = tan(i), ry = Math.atan2(tx, tz), por = new THREE.Group(); por.position.set(x, 0, z); por.rotation.y = ry;
            const bxp = (w, h, d, px, py, pz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stone); m.position.set(px, py, pz); m.castShadow = m.receiveShadow = true; por.add(m); };
            bxp(1.4, HV + 1.4, 1.2, -R - 0.7, (HV + 1.4) / 2, 0); bxp(1.4, HV + 1.4, 1.2, R + 0.7, (HV + 1.4) / 2, 0); bxp(2 * R + 2.8, 1.6, 1.4, 0, HV + 0.6, 0);
            bxp(5, 3.2, 0.8, -R - 3.6, 1.6, 0.3); bxp(5, 3.2, 0.8, R + 3.6, 1.6, 0.3);
            g.add(por);
          }
          // a headwall round each mouth: a stone face from the water to above the hill line, with the arch cut out of it,
          // so the slope over the bore never shows a gap
          p.chanPts = P.map(([x, z]) => { const w = p.toWorld(x, z); return [w.x, w.z]; });   // for tests
          p.mouths = [[first, -1], [last, 1]].map(([i, out]) => { const [x, z] = P[i], [tx, tz] = tan(i), w = p.toWorld(x + tx * out * 12, z + tz * out * 12), m = p.toWorld(x, z); return { from: [w.x, w.z], at: [m.x, m.z] }; });   // for tests
          for (const [i, out] of [[first, -1], [last, 1]]) {
            const [x, z] = P[i], [tx, tz] = tan(i), WW = R + 8, HH = 9.5, sh = new THREE.Shape();
            sh.moveTo(-WW, 0); sh.lineTo(WW, 0); sh.lineTo(WW, HH); sh.lineTo(-WW, HH); sh.lineTo(-WW, 0);
            const hole = new THREE.Path(); hole.moveTo(-R, 0); hole.lineTo(-R, 1.6); hole.absellipse(0, 1.6, R, HV - 1.6, Math.PI, 0, true); hole.lineTo(R, 0); hole.lineTo(-R, 0); sh.holes.push(hole);
            const hw = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 1.6, bevelEnabled: false }), stone); hw.castShadow = hw.receiveShadow = true;
            const fr = new THREE.Group(); fr.position.set(x + tx * out * 0.4, 0, z + tz * out * 0.4); fr.rotation.y = Math.atan2(tx, tz) + (out > 0 ? 0 : Math.PI); hw.position.z = -0.8; fr.add(hw); g.add(fr);
          }
          // up on the hill: a rail along the top of each headwall and along the rims of the open cutting, so you cannot walk
          // off the edge onto the water; they only stop things up at hill level, never the craft in the channel
          for (const i of [first, last]) { const [x, z] = P[i], [tx, tz] = tan(i); for (let s3 = -(R + 7); s3 <= R + 7; s3 += 1.2) p.addCircle(x - tz * s3, z + tx * s3, 0.7, 3.5, 1e9); }
          for (let i = 0; i < n; i++) { if (i >= first && i <= last) continue; const [x, z] = P[i], [tx, tz] = tan(i); for (const sd of [-1, 1]) { const ox = x - tz * sd * (W + 3.2), oz = z + tx * sd * (W + 3.2); if (heightC(ox, oz) > 1.2) p.addCircle(ox, oz, 1.0, 1.0, 1e9); } }
          // keep walkers and craft inside the bore: its walls are solid below the hill
          for (let i = first; i <= last; i++) { const [x, z] = P[i], [tx, tz] = tan(i); for (const sd of [-1, 1]) p.addCircle(x - tz * sd * (R + 0.8), z + tx * sd * (R + 0.8), 1.1, -1e9, 4); }
          tunnelLamps = { lampM, lamps };
        }
        // rock banks along the open channel, from the water's edge up to where the hill's own surface takes over
        { const pos = [], uv = [], bankM = E.mat('#8a8070', { map: E.tex('rock', 1, 1), rough: 0.95 });
          for (const sd of [-1, 1]) for (let i = 0; i < n - 1; i++) {
            if (first >= 0 && i >= first && i < last) continue;   // inside the bore its walls do this
            const q = [i, i + 1].map((k) => { const [x, z] = P[k], [tx, tz] = tan(k), ix = x - tz * sd * (W - 0.2), iz = z + tx * sd * (W - 0.2), ox = x - tz * sd * (W + 2.6), oz = z + tx * sd * (W + 2.6); return [ix, 0.0, iz, ox, Math.max(0.4, heightC(ox, oz)) + 0.05, oz]; });
            const [a0, b0] = [q[0], q[1]], tri = (A, B, C) => { pos.push(...A, ...B, ...C); uv.push(A[0] / 3, A[2] / 3, B[0] / 3, B[2] / 3, C[0] / 3, C[2] / 3); };
            const ai = a0.slice(0, 3), ao = a0.slice(3), bi = b0.slice(0, 3), bo = b0.slice(3);
            if (sd > 0) { tri(ai, bi, ao); tri(ao, bi, bo); } else { tri(ai, ao, bi); tri(ao, bo, bi); }
          }
          const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.computeVertexNormals();
          const bank = new THREE.Mesh(geo, bankM); bank.material.side = THREE.DoubleSide; bank.receiveShadow = true; g.add(bank); }
        chanMap = P.filter((_, i) => i % 2 === 0).map(([x, z]) => ({ t: 'circle', x, z, r: W, c: '#3f6f9e' }));
      }
      // Overlook: guardrail at the edge, a bench
      const railM = E.mat('#d8d6cf', { metal: 0.5, rough: 0.4 });
      const gr = new THREE.Mesh(new THREE.BoxGeometry(12, 0.35, 0.15), railM);
      gr.position.set(0, HH + 0.75, -7.6); g.add(gr);
      for (let x = -6; x <= 6; x += 2) { const pp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), railM); pp.position.set(x, HH + 0.4, -7.6); g.add(pp); }
      p.addBox(0, -7.8, 6.5, 0.3);
      // ...and the hill under the deck is too high to stand on. Both barriers stop either side of the river channel, so
      // the craft can run out of the tunnel to the sea.
      for (let x = -30; x < 30; x += 2) { if (chanD(x + 1, -10.85) > 7) p.addBox(x + 1, -10.85, 1, 0.2, -1e9, RH - 2.5); }
      for (let x = -14; x < 14; x += 2) for (let z = -19.9; z < -10.7; z += 2.3) { if (chanD(x + 1, z + 1.15) > 6.5) p.addBox(x + 1, z + 1.15, 1, 1.15); }   // on foot you stay off the road
      parkingArea(p, E, g, { y: RH + 0.03, zr: -10.5, depth: 6.4, half: 18, taper: 10, name: 'OHH PA', kiosk: [9, 17], walkway: null, open: [[-9, 8.5]], slotX: 4, ground: (lx, lz) => heightC(lx, lz), skip: (lx, lz) => inChan(lx, lz) || chanD(lx, lz) < 7 });   // the hill top behind it is open to walk on
      E.bench(g, 3.2, -5.6, Math.PI, HH);
      p.addBox(3.2, -5.6, 1.2, 0.4);

      // Sea below and beyond
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(700, 380), new THREE.ShaderMaterial({
        uniforms: { t: { value: 0 }, level: { value: 0 }, a: { value: new THREE.Color('#ffd08a') }, b: { value: new THREE.Color('#1f5f86') }, c: { value: new THREE.Color('#0d3552') }, nrm: { value: E.waterN }, sunD: { value: new THREE.Vector3(30, 22, -420).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), p.rot) } },
        vertexShader: 'varying vec2 vUv;varying vec3 vW;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
        fragmentShader: 'uniform float t,level;uniform vec3 a,b,c,sunD;uniform sampler2D nrm;varying vec2 vUv;varying vec3 vW;void main(){float y=vUv.y;vec3 col=mix(c,b,y);' +
          'float w=sin(vUv.x*900.+t*1.1+sin(vUv.y*300.+t*.7)*3.)*sin(vUv.y*520.-t*1.6);' +
          'float path=exp(-pow((vUv.x-.5)*9.,2.))*smoothstep(.2,1.,y);' +
          'col+=a*smoothstep(.6,1.,w)*(.15+path*(1.4+level*2.));col=mix(col,a*.9,pow(y,8.)*.6);' + E.WATER_GLSL + 'col*=.86+(wn1.z+wn2.z)*.07;col+=a*wSp*(.8+level*1.2)+b*wFr*.3;gl_FragColor=vec4(pow(col,vec3(2.2)),1.);}',
      }));
      sea.rotation.x = -Math.PI / 2; sea.position.set(0, 0.07, -230);
      g.add(sea); p.pick(sea);
      p.water(0, -230, 350, 190);
      const beach = E.plane(260, 8, E.mat('#e2cf9e', { map: E.tex('sand', 60, 2) }));
      beach.position.set(0, 0.06, -37); g.add(beach);
      // A fishing harbour where the river comes out of the tunnel into the sea: two rubble breakwaters with a beacon at
      // each head (red and white), a concrete wharf along the beach split by the river mouth with a footbridge over it,
      // fishing boats moored along it, a fish market under an open roof, crates, nets drying on racks and buoys.
      const HB = { x0: -56, x1: 14, z0: -41, mouth: [-36, -9] };
      const inHarbour = (x, z) => x > HB.x0 - 8 && x < HB.x1 + 8 && z < -38 && z > -92;
      {
        const HBB = E.batch(g), hb = HBB.box, hr = E.rng(4646), concH = E.mat('#9a968e', { map: E.tex('concrete', 4, 1), rough: 0.9 }), ironH = E.mat('#22252a', { metal: 0.6, rough: 0.5 }), wood = E.mat('#6e5137', { rough: 0.85 });
        // breakwaters: a line of big rocks with a concrete cap, out from the beach and hooking round to the mouth
        const arms = [[[HB.x0, -40], [HB.x0 - 2, -62], [HB.x0 + 6, -80], [HB.mouth[0], -84]], [[HB.x1, -40], [HB.x1 + 2, -60], [HB.x1 - 4, -78], [HB.mouth[1], -83]]];
        const rockG = E.rockGeo(5), rocks = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), ps = new THREE.Vector3(), sc = new THREE.Vector3(), eu = new THREE.Euler();
        arms.forEach((A, k) => {
          const cv = new THREE.CatmullRomCurve3(A.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal'), L = cv.getLength(), n = Math.round(L / 1.6);
          cv.getSpacedPoints(n).forEach((v, i) => { for (const off of [-1.8, 0, 1.8]) { const t = cv.getTangentAt(i / n), s2 = 1.3 + hr() * 0.8; rocks.push([v.x - t.z * off + (hr() - 0.5), s2 * 0.35, v.z + t.x * off + (hr() - 0.5), s2]); } p.addCircle(v.x, v.z, 2.4); });
          const capPts = cv.getSpacedPoints(Math.round(L / 3));
          capPts.forEach((v, i) => { if (i === capPts.length - 1) return; const w2 = capPts[i + 1], len = Math.hypot(w2.x - v.x, w2.z - v.z), cap = hb(2.2, 0.5, len + 0.3, (v.x + w2.x) / 2, 1.15, (v.z + w2.z) / 2, concH); cap.rotation.y = Math.atan2(w2.x - v.x, w2.z - v.z); });
          // a beacon at the head: red on one arm, white on the other
          const hd = A[A.length - 1], col = k ? '#d24a3a' : '#eeece6';
          const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 6, 12), E.mat(col, { rough: 0.6 })); tw.position.set(hd[0], 4.2, hd[1]); tw.castShadow = true; g.add(tw);
          hb(1.8, 0.2, 1.8, hd[0], 7.3, hd[1], ironH); const lm = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.7, 10), new THREE.MeshBasicMaterial({ color: k ? '#ff5a3a' : '#9fff9a' })); lm.position.set(hd[0], 7.8, hd[1]); g.add(lm); harbourLamps.push(lm);
        });
        const rockIM = new THREE.InstancedMesh(rockG, rockD, rocks.length);
        rocks.forEach(([x, y, z, s2], i) => { eu.set(hr() * 3, hr() * 3, 0); q.setFromEuler(eu); rockIM.setMatrixAt(i, m4.compose(ps.set(x, y, z), q, sc.set(s2, s2 * 0.8, s2))); });
        rockIM.castShadow = rockIM.receiveShadow = true; g.add(rockIM);
        // the wharf along the beach, either side of the river mouth, and a footbridge across it
        const CX = chan ? chan.P[chan.P.length - 1][0] : -22;
        for (const [x0, x1] of [[HB.x0 + 1, CX - 6.5], [CX + 6.5, HB.x1 - 1]]) {
          const L2 = x1 - x0; hb(L2, 0.9, 6, (x0 + x1) / 2, 0.25, -43.5, concH);
          for (let x = x0 + 2; x < x1 - 1; x += 5) { hb(0.3, 0.45, 0.3, x, 0.92, -46.2, ironH); }
          for (let x = x0 + 1; x < x1 - 1; x += 3.2) hb(0.3, 1.6, 0.3, x, -0.3, -46.6, wood, false);   // the timber fender piles
        }
        p.ground = ((g0) => (lx, lz, y) => (lz < -40.5 && lz > -46.5 && lx > HB.x0 && lx < HB.x1 && Math.abs(lx - CX) > 6.5 ? 0.7 : Math.abs(lx - CX) <= 7.7 && lz < -41.3 && lz > -43.7 && (y === undefined || y > 0.5) ? 1.75 : g0(lx, lz, y)))(p.ground);   // the wharf, and the footbridge over the river mouth
        { const br = hb(14, 0.3, 2.2, CX, 1.6, -42.5, wood); for (const sd of [-1, 1]) hb(14, 0.9, 0.08, CX, 2.2, -42.5 + sd * 1.05, ironH, false); for (const x of [CX - 6.6, CX + 6.6]) { hb(2.2, 1.6, 2.2, x, 0.8, -42.5, concH); } }
        // fishing boats moored along the wharf
        const boatC = ['#2e5c7a', '#b8402e', '#eeece6', '#3f7a52', '#d9a53a'];
        [[-50, 0], [-43, 1], [-31, 2], [-12, 3], [-2, 4], [7, 0]].forEach(([x, k]) => {
          const b = new THREE.Group(), hull = new THREE.Mesh(new THREE.BoxGeometry(6.5, 1.1, 2.3), E.mat(boatC[k % 5], { rough: 0.6 })); hull.position.y = 0.3; b.add(hull);
          const bow = new THREE.Mesh(new THREE.ConeGeometry(1.15, 1.6, 4), hull.material); bow.rotation.z = -Math.PI / 2; bow.rotation.x = Math.PI / 4; bow.position.set(4, 0.3, 0); b.add(bow);
          const wh = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.5, 1.6), E.mat('#eeece6', { rough: 0.6 })); wh.position.set(-1.2, 1.6, 0); b.add(wh);
          const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 4.5, 6), ironH); mast.position.set(1.2, 3, 0); b.add(mast);
          const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3, 6), ironH); boom.rotation.z = 1.1; boom.position.set(2.2, 3.4, 0); b.add(boom);
          for (let f = 0; f < 4; f++) { const fl = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), E.mat(f % 2 ? '#ef7a1a' : '#eeece6')); fl.position.set(-2.4 + f * 1.4, 0.95, 1.2); b.add(fl); }
          b.traverse((m) => { if (m.isMesh) m.castShadow = true; });
          b.position.set(x, 0, -49); b.rotation.y = Math.PI / 2 + (hr() - 0.5) * 0.1; b.rotation.y = 0; g.add(b); harbourBoats.push({ b, s: x });
          p.addBox(x, -49, 3.6, 1.3);
        });
        // the fish market: an open roof on posts, tables of fish in ice, stacks of crates
        { const MX = -44, MZ = -37.5; hb(12, 0.25, 6, MX, 4.2, MZ, E.mat('#3a5a6a', { metal: 0.3, rough: 0.5 }));
          for (const x of [MX - 5.6, MX, MX + 5.6]) for (const z of [MZ - 2.8, MZ + 2.8]) { hb(0.22, 4.1, 0.22, x, 2.05, z, ironH); p.addCircle(x, z, 0.25); }
          for (let k = 0; k < 3; k++) { hb(3, 0.85, 1.2, MX - 4 + k * 4, 0.43, MZ, E.mat('#d8dce0', { metal: 0.5, rough: 0.3 })); for (let f = 0; f < 6; f++) hb(0.42, 0.1, 0.16, MX - 5.2 + k * 4 + f * 0.48, 0.9, MZ + (hr() - 0.5) * 0.6, E.mat(['#8a9aa8', '#c0603a', '#d9c2a0'][f % 3], { metal: 0.3, rough: 0.35 }), false); p.addBox(MX - 4 + k * 4, MZ, 1.6, 0.7); }
          const sgn = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.9), new THREE.MeshBasicMaterial({ map: E.textTex('魚市場', { w: 512, h: 96, color: '#f2ead8', font: '700 70px "Noto Serif JP",serif' }), transparent: true })); sgn.position.set(MX, 3.7, MZ - 3.05); sgn.rotation.y = Math.PI; g.add(sgn);
          const crateM = [E.mat('#2e5c7a', { rough: 0.7 }), E.mat('#d9a53a', { rough: 0.7 }), E.mat('#3f7a52', { rough: 0.7 })];
          for (let k = 0; k < 14; k++) { const x = MX + 7 + (k % 4) * 0.7, z = MZ - 2 + Math.floor(k / 4) * 0.55, y = 0.2 + (k % 2) * 0.4; hb(0.65, 0.38, 0.5, x, y, z, crateM[k % 3]); }
          p.addBox(MX + 8, MZ - 1, 1.6, 1.4);
          // nets drying on racks
          for (let k = 0; k < 2; k++) { const x = MX + 14 + k * 4; for (const sx of [-1.5, 1.5]) hb(0.12, 2.2, 0.12, x + sx, 1.1, MZ, wood); hb(3.2, 0.08, 0.08, x, 2.2, MZ, wood); const net = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.8), new THREE.MeshStandardMaterial({ color: '#4a6a5a', transparent: true, opacity: 0.75, side: THREE.DoubleSide, roughness: 1 })); net.position.set(x, 1.3, MZ); g.add(net); p.addBox(x, MZ, 1.6, 0.2); }
        }
        HBB.flush();
      }
      // Wide sandy beaches either side of the harbour, raised just clear of the water so you walk on them (only the
      // sea itself turns you into a boat), with people: under parasols on loungers, a game of beach volleyball, someone
      // doing pull-ups on a bar, a lifeguard tower.
      const BE = { x0: 13, x1: 128, z1: -64 }, BW = { x0: -132, x1: -55.5, z1: -64 };   // they meet the wharf's ends: no water you can step into by mistake
      const onBeach = (lx, lz) => chanD(lx, lz) > (chan ? chan.W + 0.4 : 0) && (lz <= -32 && lz >= -41.5 && !(lx > HB.x0 && lx < HB.x1 && lz < -40.3)) || (lz <= -32 && lz >= BE.z1 && lx >= BE.x0 && lx <= BE.x1) || (lz <= -32 && lz >= BW.z1 && lx >= BW.x0 && lx <= BW.x1);
      p.ground = ((g0) => (lx, lz, y) => Math.max(onBeach(lx, lz) ? 0.14 : 0, g0(lx, lz, y)))(p.ground);
      const beachLife = { players: [], ball: null, puller: null };
      {
        const sandM = E.mat('#e2cf9e', { map: E.tex('sand', 30, 8) }), wetM = E.mat('#b9a477', { map: E.tex('sand', 30, 1), rough: 0.6 });
        for (const B of [BE, BW]) { const w = B.x1 - B.x0, d = -32 - B.z1, s = E.plane(w, d, sandM); s.position.set((B.x0 + B.x1) / 2, 0.13, (-32 + B.z1) / 2); g.add(s); p.pick(s);
          const wet = E.plane(w, 2.2, wetM); wet.position.set((B.x0 + B.x1) / 2, 0.1, B.z1 - 0.9); g.add(wet); }
        const BB2 = E.batch(g), bb = BB2.box, br2 = E.rng(5757);
        const skins = ['#e1b18c', '#c8946a', '#8a5a3c', '#f0c8a8', '#6a4430'].map((c) => E.mat(c, { rough: 0.6 })), suits = ['#d23a2a', '#2457c5', '#1f8a4a', '#e8b23a', '#141416', '#9b7bd8', '#ef7a1a'].map((c) => E.mat(c, { rough: 0.6 }));
        // a person: torso, head, arms and legs on pivots, so they can lie, stand or hang
        const person = (k) => {
          const f = new THREE.Group(), sk = skins[k % skins.length], su = suits[(k * 3) % suits.length], add = (geo, m, x, y, z, par = f) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; par.add(o); return o; };
          add(new THREE.CylinderGeometry(0.19, 0.17, 0.62, 10), sk, 0, 1.2, 0).scale.z = 0.7;
          add(new THREE.CylinderGeometry(0.2, 0.19, 0.22, 10), su, 0, 0.98, 0).scale.z = 0.72;
          add(new THREE.SphereGeometry(0.12, 12, 9), sk, 0, 1.66, 0);
          const limb = (x, y, len, m) => { const pv = new THREE.Group(); pv.position.set(x, y, 0); f.add(pv); add(new THREE.CylinderGeometry(0.055, 0.045, len, 8), m, 0, -len / 2, 0, pv); return pv; };
          const arms = [limb(-0.25, 1.48, 0.6, sk), limb(0.25, 1.48, 0.6, sk)], legs = [limb(-0.1, 0.9, 0.86, sk), limb(0.1, 0.9, 0.86, sk)];
          return { f, arms, legs };
        };
        // parasols with loungers and people lying in the sun
        const stripes = ['#d23a2a', '#2457c5', '#1f8a4a', '#e8b23a', '#ef7a1a'];
        const parasol = (x, z, k) => {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.5, 6), E.mat('#eeece6')); pole.position.set(x, 1.37, z); g.add(pole);
          const c = document.createElement('canvas'); c.width = 256; c.height = 32; const x2 = c.getContext('2d'); for (let i = 0; i < 16; i++) { x2.fillStyle = i % 2 ? '#f4f1e6' : stripes[k % stripes.length]; x2.fillRect(i * 16, 0, 16, 32); }
          const tx = new THREE.CanvasTexture(c); tx.encoding = THREE.sRGBEncoding;
          const top = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.6, 16, 1, true), new THREE.MeshStandardMaterial({ map: tx, side: THREE.DoubleSide, roughness: 0.8 })); top.material.userData.lin = true; top.position.set(x, 2.55, z); top.castShadow = true; g.add(top);
          p.addCircle(x, z, 0.15);
          for (const sd of [-1, 1]) {
            const lx = x + sd * 0.75, lz = z - 0.2;
            bb(0.62, 0.08, 1.8, lx, 0.42, lz, E.mat('#f4f1e6', { rough: 0.6 })); const back = bb(0.62, 0.08, 0.7, lx, 0.7, lz - 1.05, E.mat('#f4f1e6', { rough: 0.6 })); back.rotation.x = -0.9;
            for (const [ax, az] of [[-0.25, 0.8], [0.25, 0.8], [-0.25, -0.8], [0.25, -0.8]]) bb(0.04, 0.38, 0.04, lx + ax, 0.27, lz + az, E.mat('#b9bec4', { metal: 0.6 }), false);
            p.addBox(lx, lz, 0.35, 1.0);
            if (br2() < 0.75) {   // someone lying back on it
              const m = person(k * 2 + sd + 3); m.f.rotation.x = -Math.PI / 2 + 0.35; m.f.position.set(lx, 0.52, lz + 0.55); m.legs.forEach((l) => (l.rotation.x = 0.05)); m.arms.forEach((a, i) => { a.rotation.z = (i ? -1 : 1) * 0.3; }); g.add(m.f);
            }
          }
          if (br2() < 0.6) bb(0.45, 0.35, 0.3, x + 0.2, 0.3, z + 1.1, E.mat('#2457c5', { rough: 0.5 }));   // a cool box
          bb(0.9, 0.02, 1.7, x + 0.1, 0.15, z + 1.6, E.mat(stripes[(k + 2) % stripes.length], { rough: 0.9 }), false);   // a towel
        };
        for (let i = 0; i < 6; i++) parasol(26 + i * 9.5, -44 - (i % 2) * 6, i);
        for (let i = 0; i < 4; i++) parasol(-120 + i * 12, -46 - (i % 2) * 5, i + 6);
        // beach volleyball: a net, a rope court and four players; the ball goes back and forth over the net
        { const VX = 92, VZ = -50;
          for (const sd of [-1, 1]) { bb(0.1, 2.6, 0.1, VX, 1.43, VZ + sd * 4.6, E.mat('#eeece6')); p.addCircle(VX, VZ + sd * 4.6, 0.15); }
          const net = new THREE.Mesh(new THREE.PlaneGeometry(9, 0.9), new THREE.MeshStandardMaterial({ color: '#202428', transparent: true, opacity: 0.7, side: THREE.DoubleSide })); net.rotation.y = Math.PI / 2; net.position.set(VX, 2.15, VZ); g.add(net);
          bb(0.04, 0.06, 9, VX, 2.62, VZ, E.mat('#f4f1e6'), false);
          const rope = E.mat('#2457c5', { rough: 0.6 }); bb(16, 0.03, 0.06, VX, 0.16, VZ - 4, rope, false); bb(16, 0.03, 0.06, VX, 0.16, VZ + 4, rope, false); bb(0.06, 0.03, 8, VX - 8, 0.16, VZ, rope, false); bb(0.06, 0.03, 8, VX + 8, 0.16, VZ, rope, false);
          for (const [dx, dz, k] of [[-4, -1.8, 1], [-5.5, 2, 2], [4.5, 1.5, 3], [5.5, -2.2, 4]]) { const m = person(k + 10); m.f.position.set(VX + dx, 0.14, VZ + dz); m.f.rotation.y = dx < 0 ? Math.PI / 2 : -Math.PI / 2; g.add(m.f); beachLife.players.push({ m, x: VX + dx, z: VZ + dz, side: Math.sign(dx) }); p.addCircle(VX + dx, VZ + dz, 0.35); }
          const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 9), E.mat('#f2e8a0', { rough: 0.5 })); ball.castShadow = true; g.add(ball); beachLife.ball = ball; }
        // a pull-up bar and parallel bars, and someone doing pull-ups
        { const PX = 112, PZ = -40, steelB = E.mat('#9aa0a8', { metal: 0.7, rough: 0.35 });
          for (const sd of [-1, 1]) { bb(0.1, 2.5, 0.1, PX + sd * 0.9, 1.39, PZ, steelB); p.addCircle(PX + sd * 0.9, PZ, 0.15); }
          bb(1.9, 0.05, 0.05, PX, 2.62, PZ, steelB);
          for (const sd of [-1, 1]) for (const ex of [-1, 1]) bb(0.08, 1.2, 0.08, PX + 3 + ex * 1.1, 0.74, PZ + sd * 0.3, steelB);
          for (const sd of [-1, 1]) bb(2.4, 0.05, 0.05, PX + 3, 1.33, PZ + sd * 0.3, steelB);
          const m = person(20); m.f.position.set(PX, 0.6, PZ); m.arms.forEach((a, i) => { a.rotation.z = (i ? 1 : -1) * Math.PI * 0.94; }); m.legs[0].rotation.x = 0.3; m.legs[1].rotation.x = 0.4; g.add(m.f); beachLife.puller = m; }
        // a lifeguard tower
        { const LX = 60, LZ = -36; for (const [ax, az] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) { bb(0.12, 2.6, 0.12, LX + ax, 1.43, LZ + az, E.mat('#eeece6')); p.addCircle(LX + ax, LZ + az, 0.12); }
          bb(2, 0.12, 2, LX, 2.8, LZ, E.mat('#d23a2a', { rough: 0.6 })); bb(2.1, 0.12, 2.1, LX, 4.4, LZ, E.mat('#eeece6')); for (const [ax, az] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) bb(0.08, 1.5, 0.08, LX + ax, 3.6, LZ + az, E.mat('#eeece6'), false);
          const m = person(22); m.f.position.set(LX, 2.86, LZ); m.f.rotation.y = Math.PI; g.add(m.f); }
        BB2.flush();
      }
      // Sea stacks and the far mountains
      for (let i = 0; i < 9; i++) {
        const s = 4 + r() * 9;
        const m = new THREE.Mesh(E.rockGeo(i + 2), rockD); m.scale.setScalar(s);
        m.position.set(-110 + i * 27 + r() * 10, s * 0.6, -55 - r() * 50); if (inHarbour(m.position.x, m.position.z)) { m.position.x += 90; } if (m.position.z > -78 + s) m.position.z = -78 - s;   // keep the stacks off the beaches m.scale.y = s * (1.6 + r()); m.castShadow = true; g.add(m); p.addCircle(m.position.x, m.position.z, s * 0.9);
      }
      const mtnM = E.mat('#6f86a6', { flat: true });
      for (let i = 0; i < 9; i++) {
        const h = 60 + r() * 90, rad = 50 + r() * 60;
        const m = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 7), mtnM);
        m.position.set(-300 + i * 80 + r() * 30, h / 2 - 2, -330 - r() * 60); m.rotation.y = r() * 3; g.add(m);
      }
      const sun = new THREE.Mesh(new THREE.CircleGeometry(16, 40), basic('#fff0c2', { fog: false }));
      sun.position.set(30, 22, -420); g.add(sun);

      // The coastal road. In the world it is a stretch of the ring road (drawn by the game); this straight copy is
      // only shown while viewing, when the scenery streams past it.
      const own = new THREE.Group(); own.visible = false; g.add(own);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 40, 0.8, 8), E.mat('#3a393c', { map: E.tex('asphalt', 30, 2) }));
      deck.position.set(0, RH - 0.43, RZ); deck.receiveShadow = true; own.add(deck);
      for (let x = -HALF - 20; x <= HALF + 20; x += 16) {
        const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, RH, 8), E.mat('#bdb6a8')); pl.position.set(x, RH / 2 - 0.4, RZ); own.add(pl);
      }
      const tm = treadmill(HALF + 20);
      const dashM = basic('#f2efe4'), postM = E.mat('#e8e6df', { metal: 0.4 });
      for (let x = -HALF - 20; x < HALF + 20; x += 5) {
        const d = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.03, 0.16), dashM); d.position.set(x, RH + 0.02, RZ); g.add(tm.add(d));
        for (const z of [RZ - 4.1, RZ + 4.1]) { const pp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.9, 0.14), postM); pp.position.set(x, RH + 0.45, z); g.add(tm.add(pp)); }
      }
      // Gorge walls and pines that flank the road
      const wallM = E.mat('#a49682', { map: E.tex('rock', 1, 1), rough: 0.95 }), pineM = E.mat('#2e5a36', { flat: true });
      const walls = [];
      for (let i = 0; i < 22; i++) {
        const x = -HALF - 20 + i * ((HALF * 2 + 40) / 22);
        const s = 6 + r() * 8;
        const m = new THREE.Mesh(E.rockGeo(i + 4), wallM); m.scale.setScalar(s);
        m.position.set(x, RH - 3 + s * 0.5, RZ + 7 + s * 0.5);
        m.scale.y = s * (1.3 + r() * 1.2); m.rotation.y = r() * 3; m.castShadow = true;
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
        c.position.set(-HALF + r() * HALF * 2, RH, RZ + (east ? -1.9 : 1.9));   // keep left
        if (!east) c.rotation.y = Math.PI;
        c.userData.v = (east ? 1 : -1) * (20 + r() * 8);
        g.add(c); cars.push(c);
      }

      p.map = [{ t: 'circle', x: 0, z: 0, r: HR, c: '#5d7342' }, { t: 'rect', x: 0, z: -230, w: 700, h: 400, c: '#244f73' }, { t: 'rect', x: 0, z: RZ, w: HALF * 2, h: 8, c: '#3a393c' }].concat(chanMap);
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
        if (chanWater) chanWater.normalMap.offset.set(t * 0.012, t * 0.02);
        { const BL = beachLife, ph = (t * 0.55) % 2, k = ph < 1 ? ph : 2 - ph, A = BL.players[0], Bp = BL.players[3];   // the volleyball goes back and forth
          if (BL.ball && A && Bp) { BL.ball.position.set(A.x + (Bp.x - A.x) * k, 2.2 + Math.sin(Math.PI * k) * 3.2, A.z + (Bp.z - A.z) * k); BL.players.forEach((q, i) => { const near = (q.side < 0) === (ph > 1.75 || ph < 0.25); q.m.arms.forEach((a, j) => { a.rotation.z = near ? (j ? 1 : -1) * 2.6 : (j ? 1 : -1) * 0.3; }); q.m.f.position.y = 0.14 + (near ? Math.max(0, Math.sin(t * 8)) * 0.15 : 0); }); }
          if (BL.puller) BL.puller.f.position.y = 0.55 + (0.5 - 0.5 * Math.cos(t * 2.4)) * 0.42; }
        harbourBoats.forEach((o) => { o.b.position.y = Math.sin(t * 1.1 + o.s) * 0.07; o.b.rotation.z = Math.sin(t * 0.8 + o.s) * 0.03; });
        harbourLamps.forEach((m, i) => { m.visible = Math.sin(t * 2.2 + i * 1.7) > -0.2 || f.pulse > 0.5; });
        sea.material.uniforms.level.value += (f.level - sea.material.uniforms.level.value) * Math.min(1, dt * 6);
        const target = viewing ? 28 + f.level * 30 + f.pulse * 6 : 0;
        speed += (target - speed) * Math.min(1, dt * (viewing ? 1.2 : 4));
        tm.move(-speed * dt);
        tm.clip(viewing, -1); own.visible = viewing;   // out in the world the ring road has its own rails and lane marks
        walls.forEach((w) => (w.visible = viewing));
        const L = (HALF + 20) * 2;
        cars.forEach((c) => {
          c.position.x += (c.userData.v - speed) * dt;
          if (c.position.x > HALF + 20) c.position.x -= L;
          if (c.position.x < -HALF - 20) c.position.x += L;
          c.visible = viewing && c.userData.v < 0; // keep the camera's own lane clear while driving
        });
        const s = 1 + f.bass * 0.05;
        sun.scale.set(s, s, 1);
      };
      p.shot = (t) => ({ pos: [-34, RH + 1.4 + Math.sin(t * 0.9) * 0.08, RZ - 1.9 + Math.sin(t * 0.35) * 0.8], look: [20, RH - 3, RZ - 30 + Math.sin(t * 0.35 + 0.8) * 8], roll: Math.sin(t * 0.35) * 0.05 });
    },
  };
})();
