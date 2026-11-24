/*
 * More places: FIELD (combat inside a New York high-rise), SHOT (racing an elevated
 * expressway at night), OHH (speeding along a coastal mountain road), and OHH's old canal
 * (aqueduct: from the river tunnel under OHH's hill to the funfair's lagoon).
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
      // The office floor of the firefight that stood here is gone: FIELD's street runs straight on from here, under the ring
      // road and past the land's edge, to the airport (airport.js). (W, Z0, Z1: where it stood, still kept clear of piers.)
      const lights = [], fill = { intensity: 0 };
      const AIR = SW.Airport ? SW.Airport.build(p, E) : null;

      // Manhattan beyond the street's end, either side of the way out to the airport
      const winTex = E.tex('windows', 2, 10);
      const fieldKit = SW.Buildings.kit(E, 1), kr = E.rng(7101);
      const towers = [];
      for (let i = 0; i < 70; i++) {
        const lx = (r() - 0.5) * 190, lz = -36 - r() * 110;
        if ((Math.abs(lx) < 24 && lz > -40) || Math.abs(lx + 3) < 18 || lz < -84) continue;   // (clear of the street and the airport)
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

      // Uptown brownstones along the approach: stoops with iron rails, and two performers on the steps.
      const perf = []; let stoopUp = 0, songT = 0, camLead = -1;
      // Who has the verse, by position in the track (seconds), from songs.js. Times below are in the same clock.
      const PARTS = p.song.parts || [{ at: 0, who: 'stvn' }], LEN = p.song.length || 125.2;
      const whoAt = (T) => { let w = PARTS[0].who; for (const s of PARTS) if (T >= s.at) w = s.who; return w; };
      const GO_IN = 61, COME_OUT = 119;                                     // walk in before the 1:07 verse, come back out before the loop
      const CUTAWAYS = [];   // the office is on hold for now: the view stays on the two performers. (Cuts to the firefight were [[18, 23], [35, 40], [52, 57], [84, 89], [104, 109]].)
      {
        const cr = E.rng(212), X = 6.6; var mapP = (v) => v, neonM = null, neighbourhood = [], wedge = null, wedgeIn = () => false, streetLife = null;
        const trimM = E.mat('#4a342a'), stepM = E.mat('#6b4c3c', { rough: 0.95 }), ironM = E.mat('#0f0e10', { metal: 0.6, rough: 0.5 }), doorM = E.mat('#24160f'), winDark = E.mat('#12141a', { rough: 0.2, metal: 0.5 }), winLit = new THREE.MeshBasicMaterial({ color: '#ffc980' });
        const BB = E.batch(g), bx = BB.box;   // static boxes, drawn instanced after BB.flush()
        const figR = E.rng(6060), fig = () => { const d = E.npc.dress(figR); return { f: d.f, arms: d.arms, torso: d.torso, head: d.head, pose: d.pose }; };   // the neighbours: everyday clothes from the shared decks (E.npc)
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
        // The performers' two brownstones stand in the row across the street (houses 2 and 3 of it, which it leaves out). They are
        // built as they always were, facing -x at X, inside PG: a group turned half round about the middle of the street
        // (MX, MZ), which carries them, their stoops, doors, windows and the performers over to face this way. Everything
        // the performance code does stays in their own frame; the camera's shots are turned back with them (mapP).
        const MX = (X - 14) / 2, MZ = 27.4, PG = new THREE.Group(); PG.position.set(2 * MX, 0, 2 * MZ); PG.rotation.y = Math.PI; g.add(PG);
        const PB = E.batch(PG), pbx = PB.box, addBoxM = (x, z, hx, hz) => p.addBox(2 * MX - x, 2 * MZ - z, hx, hz);
        mapP = (v) => [2 * MX - v[0], v[1], 2 * MZ - v[2]];
        for (const i of [1, 2]) {   // only the two houses with a performer: built facing -x as before, in PG, which turns them to face this way across the street
          const z0 = 17 + i * 6.2, H = 10.4 + (i % 2) * 0.9, wall = E.mat(['#b07a62', '#c0705c', '#a07060', '#c08a6a'][i], { map: E.tex('brick', 2, 3), rough: 0.9 }), dz = z0 - 1.6;
          pbx(8, H, 6.1, X + 4, H / 2, z0, wall);
          pbx(0.7, 0.5, 6.3, X - 0.15, H - 0.1, z0, trimM); pbx(0.3, 0.25, 6.2, X - 0.05, H - 0.75, z0, trimM, false);        // cornice
          pbx(0.3, 0.18, 6.2, X - 0.05, 4.75, z0, trimM, false);                                                             // string course
          const win = (y, z, h = 1.7) => { pbx(0.06, h, 0.95, X - 0.03, y, z, cr() < 0.45 ? winLit : winDark, false); pbx(0.16, 0.2, 1.2, X - 0.06, y + h / 2 + 0.14, z, trimM, false); pbx(0.2, 0.1, 1.15, X - 0.08, y - h / 2 - 0.05, z, trimM, false); };
          win(3.25, z0 + 0.35, 1.9); win(3.25, z0 + 2.0, 1.9); win(0.95, z0 + 1.2, 0.9);
          const star = i === 1 || i === 2;                                                                                 // the two houses with a performer
          for (const y of [6.3, 8.6]) for (const z of [-1.85, 0, 1.85]) if (!(star && y === 6.3 && z === 0)) win(y, z0 + z);
          let sash = null, hinge = null;
          if (star) {
            // the window they lean out of: a lit room behind a sash that slides up
            pbx(0.03, 1.7, 0.95, X - 0.012, 6.3, z0, new THREE.MeshBasicMaterial({ color: '#c98a4a' }), false);
            sash = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.7, 0.95), winDark); sash.position.set(X - 0.045, 6.3, z0); PG.add(sash);   // a real mesh: it slides
            pbx(0.16, 0.2, 1.2, X - 0.06, 7.29, z0, trimM, false); pbx(0.24, 0.1, 1.15, X - 0.1, 5.4, z0, trimM, false);
            // the door swings out on its hinge; behind it the hallway is dark
            pbx(0.03, 2.4, 1.15, X - 0.012, 3.0, dz, new THREE.MeshBasicMaterial({ color: '#070606' }), false);
            hinge = new THREE.Group(); hinge.position.set(X - 0.05, 3.0, dz - 0.575); PG.add(hinge);
            const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.4, 1.15), doorM); leaf.position.z = 0.575; hinge.add(leaf);
          } else pbx(0.08, 2.4, 1.15, X - 0.04, 3.0, dz, doorM, false);
          pbx(0.3, 0.3, 1.6, X - 0.1, 4.35, dz, trimM, false);                                                              // door hood
          pbx(0.1, 0.22, 0.14, X - 0.08, 3.4, dz + 0.85, winLit, false);                                                     // door lamp
          for (let k = 0; k < 8; k++) pbx(0.37, 0.225 * (k + 1), 1.75, X - 2.9 + k * 0.36, 0.1125 * (k + 1), dz, stepM);    // stoop
          for (const sd of [-1, 1]) {
            const rz = dz + sd * 0.95, rail = pbx(3.45, 0.05, 0.05, X - 1.5, 1.85, rz, ironM, false); rail.rotation.z = 0.556;
            for (let k = 0; k < 7; k++) pbx(0.03, 0.9, 0.03, X - 2.9 + k * 0.46, 0.5 + k * 0.288, rz, ironM, false);
            pbx(0.12, 1.15, 0.12, X - 3.1, 0.58, rz, ironM, false);
          }
          for (let k = 0; k < 9; k++) pbx(0.03, 0.8, 0.03, X - 3.1, 0.4, z0 + 0.1 + k * 0.34, ironM, false);                 // area railing
          pbx(0.04, 0.04, 3.0, X - 3.1, 0.8, z0 + 1.5, ironM, false);
          addBoxM(X + 4, z0, 4.05, 3.1); addBoxM(X - 1.5, dz, 1.6, 1.0); addBoxM(X - 3.1, z0 + 1.5, 0.15, 1.55);
          if (i === 1 || i === 2) {
            const m = figPro(i === 1
              ? { puffer: true, chain: true, beard: true, beanie: true, skin: '#8a5a3c', skinD: '#6f452c', jacket: '#b3161d', jacketD: '#8c1016', trim: '#141416', hat: '#141416', pants: '#23262e', shoe: '#e6e2d6' }
              : { skin: '#b07a52', skinD: '#8f5f3d', jacket: '#dcd6c4', jacketD: '#c4bda9', trim: '#16181c', hat: '#2a4a8a', pants: '#4a5d78', shoe: '#17181c' });
            const w = new THREE.Group(); w.add(m.f); PG.add(w);
            perf.push({ ...m, w, sash, hinge, X, dz, z0, zo: i === 1 ? 0.25 : -0.25, yaw: i === 1 ? 0.3 : -0.3, s: i * 2.1, name: i === 1 ? 'stvn' : 'vas', off: i === 1 ? 0 : 9.4, amp: 0.3, up: 0 });   // red jacket = stvn, white jacket = vas
          }
        }

        // A New York deli on the corner, at the end of the row: brick, a lit storefront full of shelves, a green awning,
        // a backlit sign, a neon OPEN, flowers and fruit out front.
        {
          const zc = 38.25, H = 8.2, sign = (txt, o, w, h) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), (() => { const m = new THREE.MeshBasicMaterial({ map: E.textTex(txt, o), transparent: true }); m.userData.lin = true; return m; })());
          const brick = E.mat('#6e4434', { map: E.tex('brick', 2, 3), rough: 0.9 }), awnM = E.mat('#1d5a34', { rough: 0.8 }), dark = E.mat('#141416', { rough: 0.6 });
          const shopGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe6b0').convertSRGBToLinear().multiplyScalar(0.9) }); shopGlow.userData.lin = true;
          const doorGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color('#d8f0ff').convertSRGBToLinear().multiplyScalar(0.8) }); doorGlow.userData.lin = true;
          void brick;   // (the shop is in the ground floor of the apartment house's wing: its wall, windows and cornice are the house's)
          bx(0.3, 0.2, 6.6, X - 0.05, 4.1, zc, trimM, false);                                                                 // a band over the shopfront
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
          p.addBox(X - 0.75, zc, 0.4, 3.0); p.addBox(X - 2.9, zc + 3.6, 0.3, 0.3); p.addBox(X - 2.9, zc - 3.5, 0.3, 0.3);
          neonM = neon.material;
        }
        const box2 = pbx(0.6, 0.36, 0.28, X - 2.9 + 1 * 0.36, 0.45 + 0.18, 17 + 2 * 6.2 - 1.6 + 0.5, E.mat('#1a1a1d', { metal: 0.4 }));                               // boombox on a step
        box2.rotation.y = 0.3;
        BB.flush(); PB.flush();

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
            const zc = 13 + k * 6.2, ha = 10.4 + (k % 2) * 0.9 + nr() * 0.6, draw = rowhouse(-22, FRONT_W, 1, zc, ha); if (k !== 2 && k !== 3) draw();   // 2 and 3: the performers' houses (PG)
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
            if (x < 0 && z > 20 && z < 37) continue;   // keep the view of the two stoops clear
            nb(1.3, 0.04, 1.3, x, 0.17, z, E.mat('#3a3026', { rough: 1 }), false);
            const tk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 4.2, 7), barkM); tk.position.set(x, 2.1, z); tk.castShadow = true; g.add(tk);
            for (let c = 0; c < 4; c++) { const lf = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3 + nr() * 0.6, 0), leafM[c % 2]); lf.position.set(x + (nr() - 0.5) * 1.6, 4.6 + nr() * 1.4, z + (nr() - 0.5) * 1.6); lf.castShadow = true; g.add(lf); }
            p.addCircle(x, z, 0.25);
          }
          // cars parked nose to tail along both kerbs (the street runs one way: they all point the same way)
          if (SW.Cars) for (const [x, side] of [[CURB_E - 1.2, 1], [CURB_W + 1.2, -1]]) for (let z = ZA + 3.5, k = 0; z < ZB - 3; k++) {
            const car = SW.Cars.make(E, Math.floor(nr() * 7)), len = car.userData.len || 4.5;
            if (side < 0 && z + len / 2 > 21 && z - len / 2 < 37) { z = 37 + len / 2; continue; }
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
          const person = (x, z, ry, k, sit, s = 1) => { const m = fig(); m.f.position.set(x, sit ? sit : 0.16, z); m.f.rotation.y = ry; m.f.scale.setScalar(s); if (sit) { if (m.pose) { m.pose('Sitting', 1); m.f.position.y = sit - 0.38 * s; } else m.f.scale.y = s * 0.78; } g.add(m.f);   // a real person sits on the step (feet on the one below); a hand-built figure is squashed to look seated
 neighbours.push({ m, k, base: m.f.position.y }); p.addCircle(x, z, 0.35 * s); return m; };
          const neighbours = [];
          person(FRONT_W + 2.0, 13 + 5 * 6.2 - 1.6, Math.PI / 2, 0, 0.9); person(FRONT_W + 1.6, 13 + 5 * 6.2 - 1.2, Math.PI / 2, 1, 0.68);    // two on a stoop across the way
          person(FRONT_W + 2.6, 13 + 7 * 6.2 - 1.6, Math.PI / 2, 2, 0.6);                                                                  // one on a stoop at the far end of the row
          person(CURB_W - 1.6, 46, 0.4, 3); person(CURB_W - 2.4, 46.9, -2.5, 4);                                                          // chatting on the sidewalk
          person(CURB_E + 1.8, 45, Math.PI, 5);                                                                                            // walking the dog
          { const dog = new THREE.Group(), dm = E.mat('#6a4a30', { rough: 0.8 }); const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.7), dm); b.position.y = 0.42; dog.add(b); const hd = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.26), dm); hd.position.set(0, 0.6, -0.42); dog.add(hd); for (const [lx, lz] of [[-0.1, -0.25], [0.1, -0.25], [-0.1, 0.25], [0.1, 0.25]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.07), dm); l.position.set(lx, 0.15, lz); dog.add(l); } dog.position.set(CURB_E + 1.9, 0.16, 43.6); g.add(dog); }
          for (const [x, z, k] of [[-3.5, 55, 6], [-1.4, 57, 2], [-4.6, 57.6, 4]]) person(x, z, nr() * 6, k, 0, 0.72);                // kids in the street
          { const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), E.mat('#c8602a', { rough: 0.7 })); ball.position.set(-2.6, 0.16, 56); g.add(ball); neighbours.ball = ball; }
          streetLife = { neighbours, barberPole };
          p.ground = ((g0) => (lx, lz, y) => Math.max(onWalk(lx, lz) ? 0.16 : 0, g0 ? g0(lx, lz, y) : 0))(p.ground);
        }
      }
      // The apartment house: six storeys of brick round three sides of a courtyard that opens onto the street, the way the
      // walk-up blocks stand on Harlem's side streets (two wings running back from the pavement and a spine across the back).
      // In the courtyard, behind a chain-link fence with a gate off the pavement, a basketball court: its free-throw lines
      // are where the game's free-throw challenge is played. The deli has the ground floor of the north wing.
      // (It keeps to the ground the old row and its courts stood on: NO JOBB's place begins some 13 m past its north wing.)
      const UX0 = 6.6, UX1 = 34, UZ0 = 8.5, UZ1 = 42, WG = 7.5, SPN = 9, WX1 = UX1 - SPN - 4;   // its extent, the wings' depth along the street, the spine's depth
      // A half court: its baseline and hoop by the spine, the half-court line towards the street. The court's frame is
      // turned so that its v runs from the street towards the spine (this place's +x) and u along the street (-z).
      const CO = { x: UX1 - SPN - 1.4 - 14.3, z: (UZ0 + UZ1) / 2 }, toL = (u, v) => [CO.x + v, CO.z - u];
      const CT = { x: 0, z: 0, W: 15.2, L: 28.6 };
      const inCourts = (lx, lz) => (lx > UX0 - 0.5 && lx < UX1 + 1 && lz > UZ0 - 0.5 && lz < UZ1 + 0.5) || (lx > 1.4 && lx < UX1 - SPN + 0.5 && lz > -3.6 && lz < UZ0) || (lx > WX1 - 0.5 && lx < UX1 - SPN + 0.5 && lz >= UZ1 && lz < UZ1 + 3);   // the houses, the garden and the pavement round the corner, the passages' ends
      {
        const cg = new THREE.Group(); cg.position.set(CO.x, 0, CO.z); cg.rotation.y = Math.PI / 2; g.add(cg);
        const hg = new THREE.Group(); g.add(hg); const HB = E.batch(hg), hb = HB.box;   // the house itself, in this place's own frame
        const addB = (u, v, hu, hv, y0, y1) => { const [x, z] = toL(u, v); p.addBox(x, z, hv, hu, y0, y1); }, addC = (u, v, r0) => { const [x, z] = toL(u, v); p.addCircle(x, z, r0); };
        const CB = E.batch(cg), cb = CB.box, cr2 = E.rng(5150);
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
        courtTex.repeat.set(1, 0.5);   // only the half by the spine (the +v half of the drawing)
        const court = E.plane(PW, PL / 2, E.mat('#ffffff', { map: courtTex, rough: 0.75 })); court.position.set(CT.x, 0.05, CT.z + PL / 4); cg.add(court); p.pick(court);
        { const v0 = UX0 - CO.x, v1 = UX1 - SPN - CO.x, yard = E.plane(UZ1 - UZ0 - 2 * WG, v1 - v0, E.mat('#3a3a3c', { map: E.tex('asphalt', 3, 3), rough: 0.9 })); yard.position.set(0, 0.045, (v0 + v1) / 2); cg.add(yard); p.pick(yard); }   // the courtyard's asphalt round the court
        // the hoops: a steel post behind each baseline, an arm out to a fan-shaped steel backboard, an orange rim and a chain net
        const steel = E.mat('#3d4a44', { metal: 0.6, rough: 0.45 }), white = E.mat('#e9e6dc', { rough: 0.6 }), rimM = E.mat('#d0561e', { metal: 0.4, rough: 0.4 });
        const chainM = new THREE.LineBasicMaterial({ color: new THREE.Color('#b9bcc0').convertSRGBToLinear() }); chainM.userData.lin = true;
        for (const sd of [1]) {
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
        p.freeThrow = [1].map((sd) => { const bz = CT.z + sd * CT.L / 2, rim = toL(CT.x, bz - sd * 1.58), spot = toL(CT.x, bz - sd * 5.8), rw = p.toWorld(rim[0], rim[1]), sw = p.toWorld(spot[0], spot[1]); return { rim: { x: rw.x, y: 3.05, z: rw.z }, spot: { x: sw.x, z: sw.z } }; });
        // a ball left by the free-throw line
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), E.mat('#c8602a', { rough: 0.7 })); ball.position.set(CT.x + 1.4, 0.17, CT.z + CT.L / 2 - 6.2); ball.castShadow = true; cg.add(ball);
        // chain-link along the street side of the court, with a gate in the middle; the house closes the other three sides
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
        const YW = (UZ1 - UZ0 - 2 * WG) / 2 - 0.05, FZ = UX0 + 1.0 - CO.x, fx0 = -PW / 2, fz0 = -1.2, fz1 = CT.z + PL / 2 - 0.3;   // the fence across the courtyard's mouth, a metre in from the pavement
        fence(-YW, FZ, -1.3, FZ); fence(1.3, FZ, YW, FZ);
        cb(0.12, FH + 0.4, 0.12, -1.3, (FH + 0.4) / 2, FZ, steel); cb(0.12, FH + 0.4, 0.12, 1.3, (FH + 0.4) / 2, FZ, steel); cb(2.72, 0.1, 0.1, 0, FH + 0.4, FZ, steel);
        // court lights on the corners of the court
        const headM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#eef6ff').convertSRGBToLinear().multiplyScalar(1.6) }); headM.userData.lin = true;
        for (const [x, z] of [[fx0 + 0.3, fz0], [fx0 + 0.3, fz1], [-fx0 - 0.3, fz0], [-fx0 - 0.3, fz1]]) { cb(0.14, 7.5, 0.14, x, 3.75, z, steel); cb(0.4, 0.22, 0.7, x + (x < CT.x ? 0.3 : -0.3), 7.5, z + (z < CT.z ? 0.35 : -0.35), headM, false); addC(x, z, 0.15); }
        const cl = new THREE.PointLight(new THREE.Color('#dfeaff').convertSRGBToLinear(), 1.6, 34, 1.4); cl.position.set(CT.x, 8, CT.z); cg.add(cl);
        // The houses: three walk-ups, each its own building, round three sides of the courtyard, the way they stand on
        // West 112th Street: a wing either side running back from the pavement and a back house across the end, with a
        // passage between each wing and the back house (out of the court's back corners to the side streets). Each has its
        // own brick, height, cornice and water tank; rows of windows (lit after dark), fire escapes down the fronts.
        const projTex = (lit, brick) => canvas(512, 256, (c, w, h) => {
          c.fillStyle = lit ? '#000' : brick; c.fillRect(0, 0, w, h);
          if (!lit) for (let y = 0; y < h; y += 4) { c.fillStyle = `rgba(0,0,0,${0.08 + cr2() * 0.1})`; c.fillRect(0, y, w, 1); for (let x = (y / 4) % 2 ? 0 : 6; x < w; x += 12) c.fillRect(x, y, 1, 4); }
          const bw = w / 8, fh = h / 4;
          for (let fy = 0; fy < 4; fy++) for (let bxI = 0; bxI < 8; bxI++) for (const off of [0.18, 0.56]) {
            const x = bxI * bw + off * bw, y = fy * fh + fh * 0.25, ww = bw * 0.26, hh = fh * 0.5, on = cr2() < 0.32;
            if (lit) { if (on) { c.fillStyle = ['#ffd9a0', '#fff1d6', '#cfe6ff', '#ffc27a'][Math.floor(cr2() * 4)]; c.fillRect(x + 2, y + 2, ww - 4, hh - 4); } continue; }
            c.fillStyle = '#e8e4da'; c.fillRect(x, y, ww, hh); c.fillStyle = on ? '#3a3226' : '#14171b'; c.fillRect(x + 2, y + 2, ww - 4, hh - 4); c.fillStyle = '#e8e4da'; c.fillRect(x, y + hh / 2 - 1, ww, 2);
            c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(x - 2, y + hh, ww + 4, 3);   // the sill's shadow
          }
        });
        const concD = E.mat('#6f6c66', { map: E.tex('concrete', 2, 2), rough: 0.95 }), glowT = projTex(true, '');
        glowT.wrapS = glowT.wrapT = THREE.RepeatWrapping;
        const houseTop = {};
        // one house: x0..x1 (from the pavement back), z0..z1 (along the street); its faces' windows keep their size
        // whatever the face's length (the box's UVs are scaled per face: 8 bays to 25.6 m, 4 floors to the picture)
        const house = (key, x0, x1, z0, z1, floors, brick, corn) => {
          const w = x1 - x0, d = z1 - z0, H = floors * 2.75, base = projTex(false, brick);
          base.wrapS = base.wrapT = THREE.RepeatWrapping;
          const m = E.mat('#ffffff', { map: base, emissiveMap: glowT, emissive: '#ffffff', emissiveIntensity: 0.9, rough: 0.9 });
          const geo = new THREE.BoxGeometry(w, H, d), uv = geo.attributes.uv;
          for (let f = 0; f < 6; f++) { const len = f < 2 ? d : f < 4 ? w : w; for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * len / 25.6, uv.getY(i) * floors / 4); } }
          const b = new THREE.Mesh(geo, m); b.position.set((x0 + x1) / 2, H / 2, (z0 + z1) / 2); b.castShadow = b.receiveShadow = true; hg.add(b);
          hb(w + 0.5, 0.55, d + 0.5, (x0 + x1) / 2, H + 0.2, (z0 + z1) / 2, corn);                     // the cornice (and the roof under it)
          hb(w + 0.6, 0.3, d + 0.6, (x0 + x1) / 2, H - 0.25, (z0 + z1) / 2, corn, false);                // its bracket course
          hb(w + 0.16, 0.2, d + 0.16, (x0 + x1) / 2, 3.2, (z0 + z1) / 2, corn, false);                    // over the ground floor
          p.addBox((x0 + x1) / 2, (z0 + z1) / 2, w / 2 + 0.05, d / 2 + 0.05);
          houseTop[key] = H;
          return H;
        };
        const cornA = E.mat('#5d5953', { rough: 0.85 }), cornB = E.mat('#7d776c', { rough: 0.85 }), cornC = E.mat('#3f3d3a', { rough: 0.85 });
        const HA = house('a', UX0, WX1, UZ0, UZ0 + WG, 5, '#7b4434', cornA);              // the south wing: red-brown, five storeys
        const HBk = house('b', UX0, WX1, UZ1 - WG, UZ1, 7, '#8d6a4c', cornB);              // the north wing: buff brick, seven (the deli's)
        const HC = house('c', UX1 - SPN, UX1, UZ0, UZ1, 6, '#5f3430', cornC);              // the back house: dark brick, six, across the whole end
        // a water tank on each roof
        const tankM = E.mat('#5a4636', { rough: 0.95 }), tankRoof = E.mat('#3a2c22');
        for (const [tx, tz, top] of [[UX0 + 9.5, UZ0 + WG / 2, HA], [UX0 + 4.5, UZ1 - WG / 2, HBk], [UX1 - SPN / 2, CO.z + 4, HC]]) {
          const wt = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.8, 14), tankM); wt.position.set(tx, top + 3.1, tz); wt.castShadow = true; hg.add(wt);
          const roof = new THREE.Mesh(new THREE.ConeGeometry(1.75, 1.1, 14), tankRoof); roof.position.set(tx, top + 5.05, tz); hg.add(roof);
          for (const [a2, c2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) hb(0.12, 1.9, 0.12, tx + a2 * 1.1, top + 0.95, tz + c2 * 1.1, steel, false);
        }
        // the entrance in the middle of the back house, facing the court: a lit doorway, a canopy, three steps
        { const ex = UX1 - SPN, ez = CO.z + 6.2; hb(0.1, 2.5, 2.2, ex - 0.03, 1.25 + 0.45, ez, new THREE.MeshBasicMaterial({ color: '#d8f0ff' }), false); hb(1.6, 0.15, 3.2, ex - 0.8, 3.1, ez, steel);   // off to one side of the hoop
          for (let k = 0; k < 3; k++) hb(1.6 - k * 0.45, 0.15 * (k + 1), 3.0, ex - 0.8 + k * 0.22, 0.075 * (k + 1), ez, concD); }
        // fire escapes: down the wings' faces over the courtyard, and down the fronts of the wings over the pavement
        const escape = (axis, face, sd, c, y0, top) => {   // axis 'z': a face at z = face, sd its outward side; 'x': a face at x = face
          for (let y = y0; y < top - 1; y += 2.75) {
            const o = face + sd * 0.55, up = y + 2.75 < top - 1;
            // (a, b): along the face and out from it, mapped to x / z; the railing is rails and balusters, not a plate
            const at = (a, b) => (axis === 'z' ? [c + a, o + b] : [o + b, c + a]), bx2 = (la, lb, hgt, a, yy, b) => { const [x, z] = at(a, b); return axis === 'z' ? hb(la, hgt, lb, x, yy, z, ironM, false) : hb(lb, hgt, la, x, yy, z, ironM, false); };
            bx2(2.8, 1.1, 0.05, 0, y, 0);                                                                   // the grating
            for (const ry of [0.45, 0.9]) { bx2(2.8, 0.035, 0.035, 0, y + ry, sd * 0.53); for (const e of [-1.38, 1.38]) bx2(0.035, 1.1, 0.035, e, y + ry, 0); }
            for (let k = 0; k <= 9; k++) bx2(0.025, 0.025, 0.9, -1.38 + k * 0.307, y + 0.45, sd * 0.53);
            for (const e of [-1.38, 1.38]) for (const q of [0.05, 0.5]) bx2(0.025, 0.025, 0.9, e, y + 0.45, sd * q);
            if (up) { const st = bx2(2.7, 0.5, 0.05, 0, y + 1.38, 0); if (axis === 'z') st.rotation.z = (y / 2.75) % 2 < 1 ? 0.72 : -0.72; else st.rotation.x = (y / 2.75) % 2 < 1 ? 0.72 : -0.72; }
          }
        };
        for (const [zf, sd, top] of [[UZ0 + WG, 1, HA], [UZ1 - WG, -1, HBk]]) for (const xc of [UX0 + 5, UX0 + 11]) escape('z', zf, sd, xc, 3.6, top);
        escape('x', UX0, -1, UZ0 + WG / 2, 3.6, HA); escape('x', UX0, -1, UZ1 - WG / 2 - 1.2, 6.35, HBk);   // (the deli's sign has the north wing's first floor)

        // The passages between the wings and the back house: asphalt, a side door with a lamp, a dumpster, bags of rubbish
        // out for collection, a tag or two on the brick.
        const alleyM = E.mat('#343437', { map: E.tex('asphalt', 1, 3), rough: 0.92 });
        for (const [za, zb] of [[UZ0 - 2.5, UZ0 + WG], [UZ1 - WG, UZ1 + 2.5]]) {
          const pl = E.plane(UX1 - SPN - WX1 + 0.2, zb - za, alleyM); pl.position.set((WX1 + UX1 - SPN) / 2, 0.03, (za + zb) / 2); hg.add(pl); p.pick(pl);
        }
        const doorM = E.mat('#2a2622', { rough: 0.7 }), lampM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a0').convertSRGBToLinear().multiplyScalar(1.4) }); lampM.userData.lin = true;
        for (const zc of [UZ0 + WG / 2, UZ1 - WG / 2]) { hb(0.08, 2.3, 1.1, WX1 + 0.04, 1.15, zc + 1.2, doorM, false); hb(0.16, 0.2, 0.3, WX1 + 0.1, 2.65, zc + 1.2, lampM, false); hb(0.5, 0.06, 1.4, WX1 + 0.25, 2.5, zc + 1.2, steel, false); }
        { const dm = E.mat('#2c4a36', { rough: 0.6, metal: 0.3 }), x = UX1 - SPN - 0.65, z = UZ0 + 3.2; hb(1.1, 1.25, 2.1, x, 0.68, z, dm); const lid = hb(1.2, 0.08, 2.2, x - 0.08, 1.36, z, E.mat('#1a1c1e', { rough: 0.6 })); lid.rotation.z = 0.12; p.addBox(x, z, 0.6, 1.1); }
        { const bagM = E.mat('#151517', { rough: 0.35, metal: 0.1 }), br = E.rng(9191);
          for (const [bx0, bz0, n] of [[UX1 - SPN - 0.8, UZ1 + 1.2, 6], [UX0 - 0.9, UZ0 + 0.6, 4]]) {
            for (let k = 0; k < n; k++) { const s = 0.32 + br() * 0.16, bg2 = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), bagM); bg2.scale.y = 0.78; bg2.position.set(bx0 + (br() - 0.5) * 1.2, 0.12 + s * 0.7 + (k > 3 ? 0.35 : 0), bz0 + (br() - 0.5) * 1.4); bg2.rotation.y = br() * 3; hg.add(bg2); }
            p.addCircle(bx0, bz0, 0.8);
          }
        }
        // tags on the passage walls (the wings' ends)
        const tagTex = (seed) => canvas(256, 128, (c, w, h) => {
          const tr = E.rng(seed); c.clearRect(0, 0, w, h); c.lineCap = 'round'; c.lineJoin = 'round';
          for (let s = 0; s < 3; s++) {
            c.strokeStyle = ['#e8e4da', '#c23a2e', '#3a8ac8', '#e0b25a', '#1a1a1a'][Math.floor(tr() * 5)]; c.lineWidth = 5 + tr() * 7; c.beginPath();
            let x = 20 + tr() * 40, y = 40 + tr() * 50; c.moveTo(x, y);
            for (let k = 0; k < 9; k++) { x += 12 + tr() * 18; y = 30 + tr() * 70; c.quadraticCurveTo(x - 8, tr() * h, x, y); }
            c.stroke();
          }
        });
        for (const [zc, seed] of [[UZ0 + 2.2, 31], [UZ1 - 2.6, 47]]) { const m = new THREE.MeshStandardMaterial({ map: tagTex(seed), transparent: true, roughness: 0.9 }); const t = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), m); t.position.set(WX1 + 0.03, 1.5, zc); t.rotation.y = Math.PI / 2; hg.add(t); }

        // The side of the south wing over the corner: a big painted mural, the kind Harlem's blank walls carry. Below it a
        // pavement round the corner, and across that a community garden behind an iron fence: raised beds, sunflowers, a
        // casita, a bench under a tree. A green street sign on the corner.
        {
          const mural = canvas(1024, 640, (c, w, h) => {
            const mr = E.rng(1120);
            c.fillStyle = '#20393f'; c.fillRect(0, 0, w, h);
            const cx = w * 0.62, cy = h * 0.58;
            for (let k = 0; k < 24; k++) { c.fillStyle = k % 2 ? '#c9a24e' : '#b8613e'; c.beginPath(); c.moveTo(cx, cy); const a = (k / 24) * Math.PI * 2; c.arc(cx, cy, w, a, a + Math.PI / 24); c.closePath(); c.globalAlpha = 0.55; c.fill(); }
            c.globalAlpha = 1;
            c.fillStyle = '#e9dcc0'; c.beginPath(); c.arc(cx, cy, h * 0.24, 0, 7); c.fill();
            c.fillStyle = '#20393f'; c.beginPath(); c.arc(cx, cy, h * 0.17, 0, 7); c.fill();
            c.fillStyle = '#c9a24e'; c.beginPath(); c.arc(cx, cy, h * 0.05, 0, 7); c.fill();
            for (let k = 0; k < 40; k++) { c.strokeStyle = 'rgba(233,220,192,.35)'; c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, h * 0.18 + k * 1.6, 0, 7); c.stroke(); }   // the record's grooves
            c.fillStyle = '#121e22';   // a skyline of walk-ups and water tanks along the foot
            let x = 0; while (x < w) { const bw = 40 + mr() * 70, bh = 60 + mr() * 110; c.fillRect(x, h - bh, bw + 1, bh); if (mr() < 0.4) { c.fillRect(x + bw * 0.3, h - bh - 26, 22, 22); c.beginPath(); c.moveTo(x + bw * 0.3 - 3, h - bh - 26); c.lineTo(x + bw * 0.3 + 11, h - bh - 40); c.lineTo(x + bw * 0.3 + 25, h - bh - 26); c.fill(); } x += bw; }
            c.font = '700 150px "Hind", sans-serif'; c.fillStyle = '#e9dcc0'; c.textBaseline = 'top'; c.fillText('UPTOWN', 46, 40);
            c.font = '700 44px "Hind", sans-serif'; c.fillStyle = '#c9a24e'; c.fillText('W 112 ST  ·  KEEP THE MUSIC PLAYING', 52, 196);
            for (let i = 0; i < 2600; i++) { c.fillStyle = `rgba(${mr() < 0.5 ? '0,0,0' : '255,255,255'},${0.04 + mr() * 0.06})`; c.fillRect(mr() * w, mr() * h, 1 + mr() * 3, 1 + mr() * 3); }   // weathered
          });
          const mw = WX1 - UX0 - 1.6, mh = Math.min(HA - 2.2, mw * 0.625);
          const mm = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), E.mat('#ffffff', { map: mural, rough: 0.95 })); mm.position.set((UX0 + WX1) / 2, 1.0 + mh / 2, UZ0 - 0.04); mm.rotation.y = Math.PI; hg.add(mm);
          // the pavement round the corner, along the wing's side to the passage
          const pave = E.plane(UX1 - SPN - 1.6, 2.4, E.mat('#8a857c', { map: E.tex('paving', 8, 1), rough: 0.9 })); pave.position.set((1.6 + UX1 - SPN) / 2, 0.16, UZ0 - 1.2); hg.add(pave); p.pick(pave);
          hb(UX1 - SPN - 1.6, 0.18, 0.22, (1.6 + UX1 - SPN) / 2, 0.09, UZ0 - 2.4, E.mat('#b4b0a8', { rough: 0.8 }));   // its kerb
          // the garden
          const GX0 = UX0 + 0.6, GX1 = WX1 - 0.4, GZ0 = -3.2, GZ1 = UZ0 - 2.7;
          const soil = E.plane(GX1 - GX0, GZ1 - GZ0, E.mat('#4a3f30', { rough: 1 })); soil.position.set((GX0 + GX1) / 2, 0.02, (GZ0 + GZ1) / 2); hg.add(soil); p.pick(soil);
          const iron = ironM, gate = [(GX0 + GX1) / 2 - 0.9, (GX0 + GX1) / 2 + 0.9];
          const pickets = (ax, a0, a1, fixed) => {   // an iron fence along x (ax 'x', at z = fixed) or along z (at x = fixed), 1.4 m
            for (let a = a0; a <= a1 + 1e-6; a += 0.22) { if (ax === 'x' && fixed === GZ1 && a > gate[0] && a < gate[1]) continue; if (ax === 'x') hb(0.035, 1.4, 0.035, a, 0.7, fixed, iron, false); else hb(0.035, 1.4, 0.035, fixed, 0.7, a, iron, false); }
            for (const y of [0.25, 1.32]) {
              if (ax === 'x' && fixed === GZ1) { hb(gate[0] - a0, 0.05, 0.05, (a0 + gate[0]) / 2, y, fixed, iron, false); hb(a1 - gate[1], 0.05, 0.05, (gate[1] + a1) / 2, y, fixed, iron, false); }
              else if (ax === 'x') hb(a1 - a0, 0.05, 0.05, (a0 + a1) / 2, y, fixed, iron, false); else hb(0.05, 0.05, a1 - a0, fixed, y, (a0 + a1) / 2, iron, false);
            }
            if (ax === 'x' && fixed === GZ1) { p.addBox((a0 + gate[0]) / 2, fixed, (gate[0] - a0) / 2, 0.08); p.addBox((gate[1] + a1) / 2, fixed, (a1 - gate[1]) / 2, 0.08); }
            else if (ax === 'x') p.addBox((a0 + a1) / 2, fixed, (a1 - a0) / 2, 0.08); else p.addBox(fixed, (a0 + a1) / 2, 0.08, (a1 - a0) / 2);
          };
          pickets('x', GX0, GX1, GZ1); pickets('x', GX0, GX1, GZ0); pickets('z', GZ0, GZ1, GX0); pickets('z', GZ0, GZ1, GX1);
          { const gs = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.42), new THREE.MeshBasicMaterial({ map: E.textTex('COMMUNITY GARDEN', { w: 512, h: 140, color: '#f4f1e6', font: '700 64px "Hind",sans-serif', bg: '#2d5a3a' }) })); gs.material.userData.lin = true; gs.position.set(gate[0] - 0.9, 1.05, GZ1 + 0.05); hg.add(gs); }
          const woodM = E.mat('#7a5a3c', { rough: 0.95 }), leafA = E.mat('#5a7a3e', { rough: 0.9, flat: true }), leafB = E.mat('#46663a', { rough: 0.9, flat: true }), sunM = E.mat('#d8b23a', { rough: 0.7 }), sunC = E.mat('#4a3020', { rough: 0.9 }), stemM = E.mat('#4f6a32', { rough: 0.9 });
          const gr = E.rng(1121);
          for (const [bx0, bz0] of [[GX0 + 2.2, GZ0 + 2.2], [GX0 + 2.2, GZ0 + 5.0], [GX0 + 6.2, GZ0 + 2.2], [GX0 + 6.2, GZ0 + 5.0]]) {
            hb(2.6, 0.45, 1.1, bx0, 0.23, bz0, woodM); p.addBox(bx0, bz0, 1.3, 0.55);
            for (let k = 0; k < 6; k++) { const lf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22 + gr() * 0.18, 0), k % 2 ? leafA : leafB); lf.position.set(bx0 - 1.0 + k * 0.4, 0.55 + gr() * 0.15, bz0 + (gr() - 0.5) * 0.5); hg.add(lf); }
          }
          for (let k = 0; k < 5; k++) {   // sunflowers along the fence
            const sx = GX0 + 0.6 + k * 0.7, sz = GZ1 - 0.5, sh = 1.7 + gr() * 0.6;
            hb(0.04, sh, 0.04, sx, sh / 2, sz, stemM, false);
            const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 12), sunM); fl.position.set(sx, sh, sz + 0.03); fl.rotation.x = Math.PI / 2 - 0.3; hg.add(fl);
            const cn = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 10), sunC); cn.position.set(sx, sh, sz + 0.05); cn.rotation.x = Math.PI / 2 - 0.3; hg.add(cn);
          }
          // the casita: a little clapboard house with a porch
          { const cx = GX1 - 2.2, cz = GZ0 + 2.4, cas = E.mat('#5f8c8a', { rough: 0.85 }), trimW = E.mat('#e8e2d0', { rough: 0.8 });
            hb(3.0, 2.4, 2.6, cx, 1.2, cz, cas); hb(3.4, 0.12, 3.0, cx, 2.46, cz, E.mat('#3a3430', { rough: 0.9 }));
            hb(0.06, 1.9, 0.9, cx - 1.52, 0.95, cz + 0.5, doorM, false); hb(0.06, 0.7, 0.8, cx - 1.52, 1.5, cz - 0.6, lampM, false); hb(0.08, 0.12, 0.95, cx - 1.54, 1.88, cz - 0.6, trimW, false);
            hb(1.2, 0.1, 3.0, cx - 2.05, 2.2, cz, trimW, false); for (const zz of [-1.35, 1.35]) hb(0.08, 2.2, 0.08, cx - 2.6, 1.1, cz + zz, trimW, false);
            p.addBox(cx, cz, 1.55, 1.35); }
          // a tree and a bench under it
          { const tx = GX0 + 4.2, tz = GZ0 + 0.9, tk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 4.6, 8), E.mat('#4a3a2c', { rough: 0.9 })); tk.position.set(tx, 2.3, tz); tk.castShadow = true; hg.add(tk);
            for (let c2 = 0; c2 < 5; c2++) { const lf = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5 + gr() * 0.7, 0), c2 % 2 ? leafA : leafB); lf.position.set(tx + (gr() - 0.5) * 2, 5 + gr() * 1.4, tz + (gr() - 0.5) * 2); lf.castShadow = true; hg.add(lf); }
            p.addCircle(tx, tz, 0.3);
            hb(1.8, 0.08, 0.45, tx + 1.6, 0.45, tz + 0.2, woodM); hb(1.8, 0.45, 0.06, tx + 1.6, 0.7, tz - 0.05, woodM, false); p.addBox(tx + 1.6, tz + 0.1, 0.9, 0.3); }
          // the street sign on the corner: two green blades on a pole
          { const sx = 1.6 + 0.5, sz = UZ0 - 2.2, blade = (txt) => { const m = new THREE.MeshBasicMaterial({ map: E.textTex(txt, { w: 512, h: 96, color: '#ffffff', font: '700 60px "Hind",sans-serif', bg: '#1d5c3a' }) }); m.userData.lin = true; const gb = new THREE.Group(), f1 = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.3), m), f2 = f1.clone(); f1.position.z = 0.012; f2.rotation.y = Math.PI; f2.position.z = -0.012; gb.add(f1, f2); return gb; };   // printed both sides, readable from either
            hb(0.08, 3.4, 0.08, sx, 1.7, sz, E.mat('#3a3d42', { metal: 0.5, rough: 0.5 })); p.addCircle(sx, sz, 0.12);
            const a = blade('W 112 ST'); a.position.set(sx + 0.75, 3.15, sz); hg.add(a);
            const b2 = blade('UPTOWN AV'); b2.position.set(sx, 3.5, sz + 0.75); b2.rotation.y = Math.PI / 2; hg.add(b2); }
        }
        CB.flush(); HB.flush();
        p.ground = ((g0) => (lx, lz, y) => Math.max(lx > 1.6 && lx < UX1 - SPN && lz > UZ0 - 2.4 && lz < UZ0 ? 0.16 : 0, g0 ? g0(lx, lz, y) : 0))(p.ground);   // the pavement round the corner
      }
      p.map = [{ t: 'rect', x: 13.8, z: 12.25, w: 14.4, h: 7.5, c: '#5a3d30' }, { t: 'rect', x: 13.8, z: 38.25, w: 14.4, h: 7.5, c: '#5a3d30' }, { t: 'rect', x: 29.5, z: 25.25, w: 9, h: 33.5, c: '#5a3d30' }, { t: 'rect', x: 13.9, z: 1.3, w: 13.4, h: 9, c: '#3f5236' }, { t: 'rect', x: 16.5, z: 25.25, w: 15.9, h: 18.4, c: '#2f5a45' }, { t: 'rect', x: -18, z: 28.5, w: 8, h: 12.4, c: '#5a3d30' }, { t: 'rect', x: 0, z: -10, w: W * 2, h: Z0 - Z1, c: '#3c3e46' }, { t: 'rect', x: 0, z: -90, w: 190, h: 110, c: '#1c2230' }];
      p.grade = {
        top: '#05070f', bottom: '#1a2234', fog: '#0f141e', near: 24, far: 190,
        sun: '#9fb4ff', sunInt: 0.3, hemi: 0.28, sunDir: [0.2, 0.8, -0.4],
        tint: [0.96, 1.0, 1.1], expo: 1.25, sat: 0.95, stars: 0.15,
      };
      p.face = -Math.PI / 2;   // facing the stoops across the street
      p.soloView = true;
      p.vp = [3.4, 28.5];   // the music lives on the pavement in front of the apartment house's courtyard, across the street from the two performers
      p.pathEnd = 41;
      p.clearR = 26;
      p.noPier = (lx, lz) => (AIR && AIR.road(lx, lz)) || (Math.abs(lx) < W + 2 && lz < Z0 + 2 && lz > Z1 - 2);   // the ring road crosses above the street on its way out: keep its piers out of the street
      p.shore = (lx, lz) => !!AIR && (AIR.zone(lx, lz) || AIR.road(lx, lz));   // past the land's edge: the street out to the airport, and the airport
      p.wake = (lx, lz) => !!AIR && AIR.zone(lx, lz);   // out at the airport, far from the street, it still moves
      p.farClear = (lx, lz) => !!AIR && AIR.zone(lx, lz);   // the far mountains keep off it (game.js)
      p.core = (lx, lz) => inCourts(lx, lz) || wedgeIn(lx, lz) || (lx > -27 && lx < 17 && lz >= 8 && lz < 61) || (!!AIR && (AIR.road(lx, lz) || AIR.zone(lx, lz)));   // the row, the street out and the airport
      p.spillRank = 1;   // its rowhouses win over FLIP's outskirts where they meet
      p.blocks = (lx, lz) => inCourts(lx, lz) || wedgeIn(lx, lz) || (lx > -27 && lx < 17 && lz >= 8 && lz < 61) || neighbourhood.some((f) => Math.abs(f.x - lx) < f.w / 2 + 4.5 && Math.abs(f.z - lz) < f.d / 2 + 2) || (lx > -8 && lx < 17 && lz >= 12 && lz < 48) || (!!AIR && (AIR.road(lx, lz) || AIR.zone(lx, lz))) || (lz < -30 && lz > -150 && Math.abs(lx) < 100);

      p.update = (t, dt, f, v) => {
        if (streetLife) {   // the barber's pole turns; the neighbours nod along when the music is up
          if (streetLife.barberPole) streetLife.barberPole.material.map.offset.y = (t * 0.6) % 1;
          streetLife.neighbours.forEach((n, i) => { n.m.f.position.y = n.base + Math.max(0, Math.sin(t * 6 + i)) * 0.03 * (f.level || 0) * 3; if (n.m.head) n.m.head.rotation.x = Math.sin(t * 4 + i * 1.3) * 0.12 * (f.pulse || 0); });
        }
        if (neonM) neonM.opacity = Math.sin(t * 37) > 0.97 || (t % 7 > 6.85) ? 0.25 : 1;   // the deli's OPEN sign, buzzing
        if (AIR) AIR.update(t, dt);
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
          return { pos: mapP([0.6 - 4.6 * u, 1.15 + 0.25 * u, zc + a * (1 - 0.6 * u)]), look: mapP([6.6, 2.5 + 3.5 * u, zc + a * 0.3]), roll: Math.sin(t * 0.3) * 0.015 };   // (in the performers' own frame, turned across the street)
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
       o: { y, zr, depth, half, taper, name, kiosk: [x0, x1], walkway: [x0, x1, z1] | null, ground(lx, lz), skip(lx, lz), slotX }
     Returns { stallZ, ground(lx, lz, y) }: the deck's height where you stand on it (for someone up there), else 0. */
  function parkingArea(p, E, g, o) {
    const { y, zr, depth, half, taper } = o, AB = (x, z, hx, hz) => p.addBox(x, z, hx, hz, y - E.DECK_STEP, 1e9), AC = (x, z, r0) => p.addCircle(x, z, r0, y - E.DECK_STEP, 1e9),   // up on the deck only: whatever runs underneath (a tunnel, a walk) is not blocked
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
    const openings = [o.walkway ? [o.walkway[0], o.walkway[1]] : null, o.kiosk ? [o.kiosk[0], o.kiosk[1]] : null, ...(o.open || [])].filter(Boolean);
    let xs = -half; const cuts = openings.slice().sort((a, b) => a[0] - b[0]);
    for (const [a, b] of cuts.concat([[half, half]])) { if (a > xs + 0.3) { bx(a - xs, 1.05, 0.12, (a + xs) / 2, y + 0.52, zb, rail); AB((a + xs) / 2, zb, (a - xs) / 2, 0.2); } xs = Math.max(xs, b); }
    // and rails along the deck's other open edges (each taper's slant and the side behind it, the sides of the building's
    // apron and of the walkway in), wherever the ground below is more than a step down: on the deck you stay on it
    const G = (x, z) => (o.ground ? o.ground(x, z) : 0);
    const edge = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 0.5)), at = (k) => [x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n];
      const put = (k0, k1) => { if (k1 <= k0) return; const [ax, az] = at(k0), [cx, cz] = at(k1), rl = bx(Math.hypot(cx - ax, cz - az), 1.05, 0.12, (ax + cx) / 2, y + 0.52, (az + cz) / 2, rail); rl.rotation.y = -Math.atan2(cz - az, cx - ax); };
      let run = -1;
      for (let k = 0; k <= n; k++) { const [x, z] = at(k); if (y - G(x, z) > E.DECK_STEP) { AC(x, z, 0.2); if (run < 0) run = k; } else if (run >= 0) { put(run, k - 1); run = -1; } }
      if (run >= 0) put(run, n);
    };
    for (const sd of [-1, 1]) { edge(sd * (half + taper), zr, sd * half, zr + 2.2); edge(sd * half, zr + 2.2, sd * half, zb); }
    if (o.kiosk) for (const x of o.kiosk) edge(x, zb, x, zb + 4.4);   // its back is the building's back wall
    if (o.walkway) for (const x of o.walkway.slice(0, 2)) edge(x, zb, x, o.walkway[2]);
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
    // where a person on foot stands on this deck (the lay-by and its tapers, the apron in front of the building, the walkway
    // in), as the place's ground: only for someone up at its level, so walking about underneath never lifts you onto it
    const on = (lx, lz) => (lz >= zr - 0.2 && lz <= zb && Math.abs(lx) < half + taper * Math.max(0, Math.min(1, (zr + 2.2 - lz) / 2.2)))
      || (o.kiosk && lx > o.kiosk[0] && lx < o.kiosk[1] && lz >= zb && lz < zb + 4.4) || (o.walkway && lx > o.walkway[0] - 0.1 && lx < o.walkway[1] + 0.1 && lz >= zb && lz <= o.walkway[2]);
    // Where the ground under the deck comes up closer than a person can stand under it (OHH's hill) but is still more than a
    // step below, the deck's edge stops whoever is down there (rows of 1 m cells, run together): from the hill you either step
    // up onto the deck or walk under it with room to spare. Only for those near that height, so a craft in a tunnel passes.
    // (Runs stop at 3 m: boxes that small never pull the camera in.)
    if (o.ground) {
      const lo = y - E.HEADROOM, hi = y - E.DECK_STEP, X = half + taper, z1 = Math.max(zb, o.kiosk ? zb + 4.4 : zb, o.walkway ? o.walkway[2] : zb);
      for (let z = zr - 0.2; z < z1; z += 1) {
        let run = null; const flush = () => { if (run) p.addBox((run[0] + run[1]) / 2, z + 0.5, (run[1] - run[0]) / 2, 0.5, lo - 1.5, hi); run = null; };
        for (let x = -X; x < X; x += 1) {
          const tight = on(x + 0.5, z + 0.5) && [[0.5, 0.5], [0, 0], [1, 0], [0, 1], [1, 1]].some(([a, c]) => { if (!on(x + a, z + c)) return false; const h = o.ground(x + a, z + c); return h > lo && h < hi; });
          if (!tight) flush(); else if (run && run[1] === x && x - run[0] < 3) run[1] = x + 1; else { flush(); run = [x, x + 1]; }
        }
        flush();
      }
    }
    return { stallZ, ground: (lx, lz, wy) => (on(lx, lz) && E.onDeck(y, wy) ? y : 0) };
  }

  /* SHOT on foot: the way there and the climb. The trail from the plaza comes up to SHOT along lx = 0 of its frame, and its
     last stretch is the back way to an expressway: utility poles carry wires and small lamps over it (blue plates strapped
     to them count down the metres), the woods on the west rise in a cutting held by a block retaining wall (drain holes,
     tags sprayed on it, a fence along its top), a little fox shrine stands in the trees with its lanterns lit, and the
     trail ends on a paved forecourt short of the parking area: a sign gate, two vending machines glowing, a bench, cones,
     tags on the expressway's piers beyond. There a steel stair tower climbs in five flights inside a mesh cage, the
     landings numbered, a fluorescent tube over each (one of them flickers), to a long footbridge across onto the walkway
     into the parking area at deck height H. The tower stands back from the deck so the bridge spans the strip where OHH's
     canal crosses the way in an open cutting (where the world has it: open() below). All in its own group, hidden while
     the view streams the road past.
     Returns { group, ground(lx, lz, y), stairs(lx, lz), blocks(lx, lz), lead(lx, lz, y), open(za, zb), route, BZ0, ZN, ZS,
     update(t) }. route: [lx, lz, level, tight] on from the forecourt to the viewpoint; the tight ones (in the tower) are
     walked slowly and reached exactly, so the auto-walk turns at each landing instead of cutting into the flight's partition. */
  function shotWay(p, E, g, H) {
    const wg = new THREE.Group(); g.add(wg);
    const rr = E.rng(7311), PI = Math.PI;
    // what stands on the ground under the bridge is made while U is set: into its own group, its colliders kept in uCols, so
    // that if OHH's canal runs through there (open) it can all step out of the way
    const ug = new THREE.Group(), uCols = []; wg.add(ug); let U = false;
    const cvT = (w, h, draw, srgb = true) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); if (srgb) t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
    const rep = (t, x, y) => { const c = t.clone(); c.needsUpdate = true; c.repeat.set(x, y); return c; };
    const add = (geo, m, x, y, z, ry = 0, sh = true) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = sh; o.receiveShadow = true; (U ? ug : wg).add(o); return o; };
    const inst = (geo, m, list, sh = true) => {   // its bounds made to hold every copy, so it is culled where none of them shows (and drawn where any does)
      const im = new THREE.InstancedMesh(geo, m, list.length), o = new THREE.Object3D(), bb = new THREE.Box3();
      list.forEach(([x, y, z, ry = 0, rx = 0], i) => { o.position.set(x, y, z); o.rotation.set(rx, ry, 0, 'YXZ'); o.updateMatrix(); im.setMatrixAt(i, o.matrix); bb.expandByPoint(o.position); });
      geo.computeBoundingSphere(); const sp = bb.getBoundingSphere(new THREE.Sphere()); sp.radius += geo.boundingSphere.radius; geo.boundingSphere = sp;
      im.castShadow = sh; im.receiveShadow = true; (U ? ug : wg).add(im); return im; };
    // everything that stands still and needs no handle is merged per material at the end, one draw each (as the batch does for boxes)
    // (and in stretches of 30 m along the trail, so what is behind the camera is culled), boxes included
    const MG = new Map(), addG = (geo, m, mx, sh, z) => { const k = m.uuid + (sh ? 's' : '') + (U ? 'u' : '') + Math.floor(z / 30); if (!MG.has(k)) MG.set(k, { m, sh, u: U, list: [] }); MG.get(k).list.push((geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(mx)); };
    const addM = (geo, m, x, y, z, ry = 0, sh = true, rx = 0, rz = 0) => { const o = new THREE.Object3D(); o.position.set(x, y, z); o.rotation.set(rx, ry, rz, 'YXZ'); o.updateMatrix(); addG(geo, m, o.matrix, sh, z); };
    const boxes = [], unit = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), bx = (w, h, d, x, y, z, m, sh = true) => { const o = new THREE.Object3D(); o.position.set(x, y, z); o.scale.set(w, h, d); boxes.push({ o, m, sh, u: U }); return o; };   // set its rotation before the end
    const flushM = () => { for (const { o, m, sh, u } of boxes) { o.updateMatrix(); U = u; addG(unit, m, o.matrix, sh, o.position.z); } U = false; for (const { m, sh, u, list } of MG.values()) { const out = new THREE.BufferGeometry(); for (const [nm, k] of [['position', 3], ['normal', 3], ['uv', 2]]) { const arrs = list.map((q) => q.attributes[nm].array), all = new Float32Array(arrs.reduce((a, b) => a + b.length, 0)); let o = 0; for (const a of arrs) { all.set(a, o); o += a.length; } out.setAttribute(nm, new THREE.BufferAttribute(all, k)); } const me = new THREE.Mesh(out, m); me.castShadow = sh; me.receiveShadow = true; (u ? ug : wg).add(me); } };
    const glowMs = {}, glowM = (hex, k = 1, own = false) => { if (!own && glowMs[hex + k]) return glowMs[hex + k]; const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).convertSRGBToLinear().multiplyScalar(k) }); m.userData.lin = true; if (!own) glowMs[hex + k] = m; return m; };
    const halo = (hex, s, x, y, z, o = 0.45) => { const m = new THREE.SpriteMaterial({ map: E.dot(), color: new THREE.Color(hex).convertSRGBToLinear(), transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false }); m.userData.lin = true; const sp = new THREE.Sprite(m); sp.scale.set(s, s, 1); sp.position.set(x, y, z); wg.add(sp); return sp; };
    const poolMs = {}, poolM = (hex, o) => { const m = new THREE.MeshBasicMaterial({ map: E.dot(), color: new THREE.Color(hex).convertSRGBToLinear(), transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false }); m.userData.lin = true; return m; };
    const pool = (hex, s, x, y, z, o = 0.22, own = false) => { const geo = new THREE.PlaneGeometry(s, s).rotateX(-PI / 2); if (own) return add(geo, poolM(hex, o), x, y, z, 0, false); addM(geo, poolMs[hex + o] || (poolMs[hex + o] = poolM(hex, o)), x, y, z, 0, false); return null; };   // the light a lamp throws on the ground (own: one that dims)
    // a printed plate, lit by the scene (it shows up where a lamp is) with a little of its own so it still reads at night
    const AT = { c: document.createElement('canvas'), x: 0, y: 0, row: 0, list: [] }; AT.c.width = 2048; AT.c.height = 1024; const atx = AT.c.getContext('2d');
    const plate = (txt, w, h, x, y, z, ry, o) => {   // painted into one atlas, so all of them together are a few draws
      const src = E.textTex(txt, o).image, pw = src.width, ph = src.height;
      if (AT.x + pw > AT.c.width) { AT.x = 0; AT.y += AT.row + 6; AT.row = 0; }
      atx.drawImage(src, AT.x, AT.y); const u0 = AT.x / AT.c.width, u1 = (AT.x + pw) / AT.c.width, v0 = 1 - (AT.y + ph) / AT.c.height, v1 = 1 - AT.y / AT.c.height;
      AT.x += pw + 6; AT.row = Math.max(AT.row, ph);
      const geo = new THREE.PlaneGeometry(w, h), uv = geo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) ? u1 : u0, uv.getY(k) ? v1 : v0);
      AT.list.push([geo, x, y, z, ry, o.lit ?? 0.4, U]);
    };
    const flushPlates = () => { const t = new THREE.CanvasTexture(AT.c), ms = {}; t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
      for (const [geo, x, y, z, ry, lit, u] of AT.list) (U = u), addM(geo, ms[lit] || (ms[lit] = (() => { const m = E.mat('#ffffff', { map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: lit, rough: 0.6 }, true); m.transparent = true; return m; })()), x, y, z, ry, false); };
    const JP = '"Hind","Noto Sans JP",sans-serif';

    // steel grating, half open: close up you see down through it, from afar it reads as a floor
    const grate = cvT(64, 64, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#c4c6c2'; for (let x = 0; x < w; x += 8) c.fillRect(x, 0, 4, h); for (let y = 0; y < h; y += 16) c.fillRect(0, y, w, 2); });
    const grateM = (rx, ry) => { const m = E.mat('#8d948f', { map: rep(grate, rx, ry), rough: 0.6, metal: 0.5 }, true); m.alphaTest = 0.5; m.side = THREE.DoubleSide; return m; };
    // expanded metal for the cage and the fences: a diamond lattice, blended, so from afar it greys over what is behind
    const lattice = cvT(32, 32, (c, w, h) => { c.clearRect(0, 0, w, h); c.strokeStyle = '#e2e4e0'; c.lineWidth = 2.6; for (const o of [-32, 0, 32]) { c.beginPath(); c.moveTo(o, 0); c.lineTo(o + 32, 32); c.moveTo(o + 32, 0); c.lineTo(o, 32); c.stroke(); } });
    const meshMs = {}, meshM = (hex) => meshMs[hex] || (meshMs[hex] = (() => { const m = E.mat(hex, { map: lattice, rough: 0.55, metal: 0.4 }, true); m.transparent = true; m.alphaTest = 0.04; m.depthWrite = false; m.side = THREE.DoubleSide; return m; })());
    const cells = (geo, w, h, cell) => { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / cell, (uv.getY(i) * h) / cell); return geo; };
    const panel = (w, h, x, y, z, ry, hex = '#7f8c86', cell = 0.14) => addM(cells(new THREE.PlaneGeometry(w, h), w, h, cell), meshM(hex), x, y, z, ry, false);
    // tags, sprayed: fat letters with a dark outline, a highlight, a few drips
    const tag = (txt, cols, o = {}) => cvT(512, 256, (c, w, h) => {
      c.clearRect(0, 0, w, h); c.translate(w / 2, h / 2); c.rotate(o.tilt ?? -0.08); c.font = o.font || `900 ${o.size || 132}px "Arial Black","Hind",sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
      { const k = Math.min(1, 440 / c.measureText(txt).width); c.scale(k, k); }   // squeezed to fit, as a writer runs out of wall
      c.lineWidth = 22; c.strokeStyle = cols[2] || '#101014'; c.strokeText(txt, 0, 6);
      const gr = c.createLinearGradient(0, -60, 0, 60); gr.addColorStop(0, cols[0]); gr.addColorStop(1, cols[1]); c.fillStyle = gr; c.fillText(txt, 0, 6);
      c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,.55)'; c.strokeText(txt, -3, 1);
      c.fillStyle = cols[1]; for (let i = 0; i < 9; i++) { const x = (rr() - 0.5) * c.measureText(txt).width * 0.9, l = 14 + rr() * 50; c.fillRect(x, 44, 3, l); c.beginPath(); c.arc(x + 1.5, 44 + l, 3, 0, 7); c.fill(); }
    }, true);
    const decalMs = {}, decal = (t, w, h, x, y, z, ry) => { const m = decalMs[t.uuid] || (decalMs[t.uuid] = (() => { const d = E.mat('#ffffff', { map: t, rough: 0.8 }, true); d.transparent = true; d.depthWrite = false; d.polygonOffset = true; d.polygonOffsetFactor = -2; return d; })()); addM(new THREE.PlaneGeometry(w, h), m, x, y, z, ry, false); };

    const steel = E.mat('#56635d', { rough: 0.5, metal: 0.55 }), steelD = E.mat('#39423e', { rough: 0.55, metal: 0.5 }), yellow = E.mat('#d8b02a', { rough: 0.45, metal: 0.3 });
    const conc = E.mat('#8e8a84', { map: E.tex('concrete', 1, 1), rough: 0.9 }), concD = E.mat('#6a6762', { rough: 0.9 }), white = E.mat('#e6e4de', { rough: 0.5 });
    const tubeM = glowM('#e4f2ff', 1.2), warmM = glowM('#ffd49a', 1.1);
    const lamps = [];   // tubes: { tb: the tube itself (only the failing ones, which go dark), h: halo, p: the pool on the floor, k: landing, pole }

    /* ---- the ramp: one long straight run from the end of the trail up to the footbridge, in line with it, so you can run
       (or ride) up it and over the bridge into the parking area without letting go of the key. A concrete deck with
       yellow edges and non-slip strips, railings, lamps on the west rail; steel piers where it is high enough to walk
       under, a solid concrete wedge at its foot where it is not. ---- */
    const PY = 0.075;   // the forecourt's paving: over the end of the trail, which runs on under it (the trail lies 6 cm up)
    const ZN = 18.3, ZS = 23.7, XO = 1.76;   // ZN: the ramp's top, where the bridge begins; ZS: the forecourt's things are measured from it
    const BX = -0.3, BW = 1.45, BZ0 = 6, BE = BX + BW;   // the footbridge (and the ramp): centre and half-width, its far end; BE its east edge
    const RL = 44, RZ1 = ZN + RL, rampH = (lz) => (H * (RZ1 - lz)) / RL, SOLID = 2.4, ZSOL = RZ1 - (SOLID * RL) / H;   // its run, its foot, its height along it; solid below SOLID
    const onRamp = (lx, lz) => Math.abs(lx - BX) < BW && lz > ZN - 0.05 && lz < RZ1;
    let crossed = false;   // OHH's canal runs under the bridge (open)
    {
      const ang = Math.atan2(H, RL), len = Math.hypot(RL, H), cs = Math.cos(ang), sn = Math.sin(ang), MZ = (ZN + RZ1) / 2;
      const deck = new THREE.Mesh(new THREE.BoxGeometry(BW * 2, 0.4, len), conc); deck.position.set(BX, H / 2 - 0.2, MZ); deck.rotation.x = ang; deck.castShadow = deck.receiveShadow = true; wg.add(deck); p.pick(deck);
      const along = (w, h, d, x, off, m, sh = false) => { const o = bx(w, h, d, x, H / 2 + off * cs, MZ + off * sn, m, sh); o.rotation.x = ang; return o; };   // laid along the slope, off above its surface
      for (const sd of [-1, 1]) { along(0.1, 0.012, len, BX + sd * (BW - 0.12), 0.006, yellow); along(0.06, 0.06, len, BX + sd * BW, 1.1, yellow); along(0.04, 0.04, len, BX + sd * BW, 0.6, steel); along(0.16, 0.3, len, BX + sd * (BW + 0.02), -0.12, steelD, true); }
      for (let z = ZN + 1.2; z < RZ1 - 0.8; z += 1.6) bx(BW * 2 - 0.5, 0.012, 0.14, BX, rampH(z) + 0.008, z, white, false).rotation.x = ang;   // non-slip strips
      for (let z = ZN + 0.3; z < RZ1; z += 2.2) for (const sd of [-1, 1]) bx(0.06, 1.1, 0.06, BX + sd * BW, rampH(z) + 0.55, z, steel);
      for (let k = 0, z = ZN + 4; z < RZ1 - 3; z += 11, k++) { const x = BX - BW, y = rampH(z); bx(0.08, 1.0, 0.08, x - 0.05, y + 1.6, z, steel); bx(0.24, 0.12, 0.24, x + 0.05, y + 2.12, z, steelD); bx(0.18, 0.04, 0.18, x + 0.05, y + 2.05, z, warmM, false); halo('#ffd49a', 1.4, x + 0.05, y + 2.0, z, 0.45); }
      // piers where it is high enough to walk under, a cross beam under the deck on each
      for (let z = ZN + 3.5; z < ZSOL - 0.5; z += 6.5) { const h = rampH(z) - 0.45; for (const sd of [-1, 1]) { bx(0.3, h, 0.3, BX + sd * (BW - 0.3), h / 2, z, steelD); p.addCircle(BX + sd * (BW - 0.3), z, 0.22, -1e9, h); } bx(BW * 2, 0.25, 0.3, BX, h - 0.05, z, steelD); }
      // the solid foot: a concrete wedge from the ground up under the deck
      { const sh = new THREE.Shape(); sh.moveTo(ZSOL, 0); sh.lineTo(RZ1 - (0.4 * RL) / H, 0); sh.lineTo(ZSOL, SOLID - 0.4); sh.lineTo(ZSOL, 0);
        const geo = new THREE.ExtrudeGeometry(sh, { depth: BW * 2, bevelEnabled: false }); geo.rotateY(-PI / 2); geo.translate(BX + BW, 0, 0);
        const w = new THREE.Mesh(geo, concD); w.castShadow = w.receiveShadow = true; wg.add(w); }
      p.addBox(BX, ZSOL, BW, 0.08, -1e9, SOLID - 1.2);   // its face
      const N = 22;
      for (let k = 0; k < N; k++) { const z0 = ZN + (RL * k) / N, z1 = ZN + (RL * (k + 1)) / N, zc = (z0 + z1) / 2, hz = (z1 - z0) / 2;
        for (const sd of [-1, 1]) {
          p.addBox(BX + sd * (BW + 0.03), zc, 0.06, hz, rampH(z1) - 1.0, 1e9);   // the railings, for someone up on it
          if (z0 >= ZSOL - 0.1) p.addBox(BX + sd * (BW + 0.05), zc, 0.08, hz, -1e9, rampH(z1) - 1.2);   // the wedge's sides, for someone beside it
        } }
      plate('SHOT PA  ↑\n歩行者スロープ  RAMP', 1.5, 0.42, BX, 1.6, RZ1 + 0.4, 0, { w: 512, h: 144, color: '#ffffff', bg: '#1f55b8', font: `700 52px ${JP}`, font2: `700 34px ${JP}`, lit: 0.7 });
      bx(0.08, 1.4, 0.08, BX - 0.6, 0.7, RZ1 + 0.42, steel); bx(0.08, 1.4, 0.08, BX + 0.6, 0.7, RZ1 + 0.42, steel);
    }
    // the bridge's end wall below its top (where the ramp meets it), so nobody walks in under there from the canal side
    p.addBox(BX, ZN - 0.05, BW, 0.07, -1e9, H - 1.4);

    /* ---- the footbridge across to the walkway, and the walkway's end ---- */
    // its deck is grating on two edge channels and a few cross members: from under it (where the camera often is, behind
    // you on the flights that climb south) you see through it
    { const bd = add(new THREE.PlaneGeometry(BW * 2, ZN - BZ0).rotateX(-PI / 2), grateM((BW * 2) / 0.32, (ZN - BZ0) / 0.32), BX, H - 0.015, (BZ0 + ZN) / 2, 0, false);
      // a camera right in its plane (behind you on the third landing and the fourth flight) would see nothing but grating: it is not drawn for that camera
      bd.onBeforeRender = (r, s, cam) => { const c = cam.position, l = p.local(c.x, c.z); bd.geometry.drawRange.count = Math.abs(c.y - H) < 0.8 && Math.abs(l.x - BX) < BW + 0.6 && l.z > BZ0 - 0.6 && l.z < ZN + 0.6 ? 0 : Infinity; }; }
    for (const sd of [-1, 1]) { bx(0.12, 0.34, ZN - BZ0, BX + sd * (BW + 0.02), H - 0.17, (BZ0 + ZN) / 2, steelD); bx(0.06, 0.012, ZN - BZ0, BX + sd * (BW - 0.12), H + 0.006, (BZ0 + ZN) / 2, yellow, false); }
    for (let z = BZ0 + 0.7; z < ZN; z += 1.4) bx(BW * 2, 0.08, 0.08, BX, H - 0.07, z, steelD);
    for (const sd of [-1, 1]) {
      for (let z = BZ0 + 0.2; z <= ZN - 0.1; z += 1.35) bx(0.06, 1.1, 0.06, BX + sd * BW, H + 0.55, z, steel);
      bx(0.06, 0.06, ZN - BZ0, BX + sd * BW, H + 1.1, (BZ0 + ZN) / 2, yellow, false);
      panel(ZN - BZ0, 1.0, BX + sd * BW, H + 0.55, (BZ0 + ZN) / 2, PI / 2);
      for (let k = 0; k < 4; k++) p.addBox(BX + sd * (BW + 0.03), BZ0 + (ZN - BZ0) * (k + 0.5) / 4, 0.06, (ZN - BZ0) / 8, H - 1.4, 1e9);
    }
    for (const [k, z] of [BZ0 + 2.2, (BZ0 + ZN) / 2 + 0.4, ZN - 1.8].entries()) { const sx = BX + (k % 2 ? BW : -BW); bx(0.08, 0.9, 0.08, sx, H + 1.55, z, steel); bx(0.24, 0.12, 0.24, sx, H + 2.04, z, steelD); bx(0.18, 0.04, 0.18, sx, H + 1.97, z, warmM, false); halo('#ffd49a', 1.3, sx, H + 1.95, z, 0.45); pool('#ffc98a', 3.4, (sx + BX) / 2, H + 0.03, z, 0.22); }
    // the walkway's end: a rail either side of where the bridge comes in, and below it a fence (no way in under the deck)
    for (const [x0, x1] of [[-2.5, BX - BW], [BE, 2.5]]) { const xc = (x0 + x1) / 2, w = x1 - x0; bx(w, 0.06, 0.06, xc, H + 1.05, BZ0, yellow, false); for (const x of [x0 + 0.05, xc, x1 - 0.05]) bx(0.06, 1.05, 0.06, x, H + 0.52, BZ0, steel); panel(w, 0.95, xc, H + 0.5, BZ0, 0); p.addBox(xc, BZ0, w / 2 + 0.05, 0.07, H - 1.4, 1e9); }
    U = true;
    for (const sd of [-1, 1]) { panel(2.6, 2.3, sd * 1.3, 1.2, BZ0 + 0.12, 0, '#4f6a58', 0.1); bx(0.08, 2.4, 0.08, sd * 2.6, 1.2, BZ0 + 0.12, steelD); uCols.push(p.addBox(sd * 1.38, BZ0 + 0.12, 1.36, 0.08, -1e9, H - 2)); }
    bx(0.08, 2.4, 0.08, 0, 1.2, BZ0 + 0.12, steelD); bx(5.2, 0.07, 0.07, 0, 2.38, BZ0 + 0.12, steelD);
    plate('関係者以外立入禁止\nNO ENTRY', 0.9, 0.42, 0.9, 1.35, BZ0 + 0.18, 0, { w: 384, h: 180, color: '#c2201c', bg: '#f4f1e6', font: `900 40px ${JP}`, font2: `700 30px ${JP}` });

    /* ---- the forecourt: paving from the trail's end to the tower and on in under the bridge, the gate, vending machines, a bench, cones ---- */
    { const FZ0 = BZ0 - 1.5, FZ1 = ZN - 0.2, FZ2 = ZS + 9.1, pm = E.mat('#8a867e', { map: E.tex('concrete', 4, 9.5), rough: 0.92 });
      for (const [z0, z1, u] of [[FZ0, FZ1, true], [FZ1, FZ2, false]]) { U = u; const pv = E.plane(9.6, z1 - z0, pm); pv.position.set(-2.2, PY, (z0 + z1) / 2); (u ? ug : wg).add(pv); if (!u) p.pick(pv); for (const x of [-7, 2.6]) bx(0.18, 0.13, z1 - z0, x, 0.065, (z0 + z1) / 2, conc); }
      U = false; }
    // the gate: two posts, a lit sign across, the mesh leaves folded back open
    { const GZ = RZ1 + 3.4, GX = 2.15;
      for (const sd of [-1, 1]) { bx(0.16, 3.4, 0.16, sd * GX, 1.7, GZ, steel); p.addCircle(sd * GX, GZ, 0.16); panel(1.9, 1.6, sd * (GX + 0.12), 0.95, GZ - 0.95, PI / 2); bx(0.05, 1.6, 0.05, sd * (GX + 0.12), 0.95, GZ - 1.9, steel); bx(0.05, 0.05, 1.9, sd * (GX + 0.12), 1.75, GZ - 0.95, steel); p.addBox(sd * (GX + 0.12), GZ - 0.95, 0.05, 0.95); }
      bx(GX * 2 + 0.3, 0.14, 0.14, 0, 3.25, GZ, steel);
      bx(3.6, 0.95, 0.08, 0, 3.85, GZ, steelD);
      plate('SHOT PA\n歩行者通路  PEDESTRIAN WAY', 3.5, 0.88, 0, 3.85, GZ + 0.05, 0, { w: 768, h: 192, color: '#ffffff', bg: '#1f55b8', font: `700 92px ${JP}`, font2: `700 40px ${JP}`, lit: 0.7 });
      bx(1.2, 0.05, 0.1, 0, 4.4, GZ + 0.25, steelD); bx(1.1, 0.03, 0.05, 0, 4.37, GZ + 0.27, tubeM, false);
      pool('#d6ecff', 6, 0, PY + 0.01, GZ + 0.6, 0.18); }
    // vending machines facing down the trail (their glow is the first thing you see of the forecourt), a can bin, a bench
    { const VZ = ZS + 1.7, fronts = [['#f2f6ff', '#2457c5'], ['#fff4ea', '#d23a2a']];
      const drinks = cvT(128, 160, (c, w, h) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h); const cols = ['#c83a2a', '#2a7ac8', '#e8c040', '#3aa058', '#8a5a3a', '#7a3ab0', '#f08a2a', '#4ab0c8'];
        for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) { const x = 8 + i * 19.5, y = 10 + r * 50; c.fillStyle = cols[(i * 3 + r * 5) % cols.length]; c.fillRect(x, y, 13, 30); c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(x + 2, y + 3, 3, 22); c.fillStyle = '#d23a2a'; c.fillRect(x + 3, y + 36, 7, 5); } });
      const drinkM = new THREE.MeshBasicMaterial({ map: drinks, color: new THREE.Color('#ffffff').convertSRGBToLinear().multiplyScalar(0.95) }); drinkM.userData.lin = true;
      fronts.forEach(([lit, body], k) => { const x = -3.9 - k * 1.08; bx(1.0, 1.85, 0.75, x, 0.93, VZ, E.mat(body, { rough: 0.4, metal: 0.2 })); bx(0.86, 1.05, 0.03, x, 1.2, VZ + 0.38, drinkM, false); bx(0.86, 0.14, 0.03, x, 1.83, VZ + 0.38, glowM(body, 1.2), false);
        bx(0.6, 0.12, 0.08, x, 0.3, VZ + 0.36, steelD); halo(lit, 2.4, x, 1.2, VZ + 0.6, 0.32); });
      pool('#d6ecff', 5, -4.45, PY + 0.012, VZ + 1.6, 0.18);
      p.addBox(-4.44, VZ, 1.1, 0.4);   // (a metre and more clear of the open door leaf: the way round the tower's west side comes past them)
      bx(0.5, 0.9, 0.42, -6.05, 0.45, VZ + 0.05, E.mat('#2f7a4a', { rough: 0.6 })); plate('空きかん\nCANS', 0.36, 0.22, -6.05, 0.65, VZ + 0.27, 0, { w: 192, h: 116, color: '#ffffff', font: `700 44px ${JP}`, font2: `700 30px ${JP}` }); p.addCircle(-6.05, VZ + 0.05, 0.32);
      E.bench(wg, -5.6, ZS + 4.5, PI / 2, 0); p.addBox(-5.6, ZS + 4.5, 0.35, 1.05); }
    // cones: a few along the forecourt's east edge, and under the bridge a row and a striped barrier
    { const coneG = [new THREE.ConeGeometry(0.16, 0.62, 10).translate(0, 0.35, 0), new THREE.CylinderGeometry(0.105, 0.125, 0.09, 10, 1, true).translate(0, 0.42, 0), new THREE.BoxGeometry(0.38, 0.05, 0.38).translate(0, 0.025, 0)], coneM = [E.mat('#ff5a1a', { rough: 0.6 }), white, E.mat('#202022', { rough: 0.8 })];
      for (const [u, cones] of [[false, [[2.25, ZS + 2.4], [2.4, ZS + 3.3], [2.15, ZS + 4.5]]], [true, [[-1.6, 7.3], [-0.5, 7.4], [0.6, 7.3], [1.7, 7.4], [-6.3, 9.5]]]]) {
        U = u; coneG.forEach((geo, k) => inst(geo, coneM[k], cones.map(([x, z]) => [x, PY, z]), k !== 1));
        cones.forEach(([x, z]) => { const b = p.addBox(x, z, 0.17, 0.17, -1e9, 2); if (u) uCols.push(b); });   // down on the ground only: some stand under the bridge
      }
      U = true;
      const stripe = cvT(128, 32, (c, w, h) => { c.fillStyle = '#f4f1e6'; c.fillRect(0, 0, w, h); c.fillStyle = '#e8501c'; for (let i = -1; i < 5; i++) { c.beginPath(); c.moveTo(i * 32, h); c.lineTo(i * 32 + 16, h); c.lineTo(i * 32 + 32, 0); c.lineTo(i * 32 + 16, 0); c.fill(); } });
      for (const z of [8.4]) { bx(2.2, 0.22, 0.04, 0, 0.82, z, E.mat('#ffffff', { map: stripe, rough: 0.6 })); bx(2.2, 0.22, 0.04, 0, 0.42, z, E.mat('#ffffff', { map: stripe, rough: 0.6 })); for (const sd of [-1, 1]) { bx(0.06, 0.95, 0.06, sd * 1.05, 0.48, z - 0.18, E.mat('#e8501c', { rough: 0.6 })).rotation.x = 0.18; bx(0.06, 0.95, 0.06, sd * 1.05, 0.48, z + 0.18, E.mat('#e8501c', { rough: 0.6 })).rotation.x = -0.18; } uCols.push(p.addBox(0, z, 1.15, 0.25, -1e9, 2)); }
      U = false; }

    /* ---- tags on the expressway's piers beyond (curved to the pier, square to its ten faces) ---- */
    { const R = E.ring && E.ring.roads && E.ring.roads[0], tags = [tag('夜露死苦', ['#ffffff', '#c8c8c8'], { font: `900 120px ${JP}`, tilt: 0.04 }), tag('OTU', ['#9cff5a', '#2ab04a'], { size: 170 })];
      if (R) for (let i = 3, n = 0; i < R.N; i += 8) {
        const l = p.local(R.X[i], R.Z[i]); if (Math.abs(l.x) > 14 || l.z > -10 || l.z < -22) continue;
        const h = R.Y[i] - 2.3, rAt = (y) => 1.15 - 0.15 * y / h + 0.025, geo = new THREE.CylinderGeometry(rAt(2.5), rAt(0.5), 2.0, 3, 1, true, -PI / 5 - p.rot, (3 * PI) / 5);
        const m = E.mat('#ffffff', { map: tags[n++ % tags.length], rough: 0.8 }, true); m.transparent = true; m.depthWrite = false; m.polygonOffset = true; m.polygonOffsetFactor = -2;
        add(geo, m, l.x, 1.5, l.z, 0, false);
      } }

    /* ---- the cutting: a block retaining wall on the west, a grassy bank behind it, a fence along its top ---- */
    const CX = -3.4, CZ0 = 40, CZ1 = 62, CH = 2.3;
    const wallH = (lz) => CH * sstep(CZ0, CZ0 + 4.5, lz) * sstep(CZ1, CZ1 - 4.5, lz);
    const bankY = (lx, lz) => { const d = CX - lx; if (d < 0 || d > 12.4 || lz < CZ0 || lz > CZ1) return 0; return wallH(lz) * (1 + 0.4 * sstep(0, 4.5, d) - 1.4 * sstep(5.5, 12, d)); };
    { // kenchi blocks: squares set on the diagonal, each its own shade, in mortar
      const kt = cvT(256, 256, (c, w, h) => { const S = 64; for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
          const u = (x + y) / S, v2 = (x - y + 512) / S, a = Math.floor(u), b = Math.floor(v2), fu = u - a, fv = v2 - b;
          let v = 178 + ((a * 37 + b * 61) % 7) * 7 + (rr() - 0.5) * 22;
          if (fu < 0.08 || fv < 0.08) v += 26; else if (fu > 0.92 || fv > 0.92) v -= 46;   // a bevel: the upper edges catch the light
          c.fillStyle = `rgb(${v},${v - 4},${v - 12})`; c.fillRect(x, y, 2, 2); }
        c.strokeStyle = 'rgba(52,48,42,.85)'; c.lineWidth = 2; for (let k = -8; k <= 8; k++) { c.beginPath(); c.moveTo(k * S, 0); c.lineTo(k * S + h, h); c.moveTo(k * S, 0); c.lineTo(k * S - h, h); c.stroke(); } });
      const pos = [], uv = [], idx = [], N = Math.round((CZ1 - CZ0) / 0.5);
      for (let i = 0; i <= N; i++) { const z = CZ0 + (i * (CZ1 - CZ0)) / N, h = wallH(z) + 0.06; pos.push(CX, -0.05, z, CX, h, z); uv.push(z / 0.9, 0, z / 0.9, (h + 0.05) / 0.9); if (i < N) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3); }
      const wgeo = new THREE.BufferGeometry(); wgeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); wgeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); wgeo.setIndex(idx); wgeo.computeVertexNormals();
      const wall = new THREE.Mesh(wgeo, E.mat('#bdb8ae', { map: kt, rough: 0.95 })); wall.material.side = THREE.DoubleSide; wall.receiveShadow = true; wg.add(wall);
      // the bank: a grid draped over bankY, tucked under the ground where it runs out
      const bg = new THREE.PlaneGeometry(12.4, CZ1 - CZ0, 31, 38); bg.rotateX(-PI / 2); const bp = bg.attributes.position;
      for (let k = 0; k < bp.count; k++) { const x = CX - 6.2 + bp.getX(k), z = (CZ0 + CZ1) / 2 + bp.getZ(k), hh = bankY(x - 1e-3, z); bp.setXYZ(k, x, hh > 0.03 ? hh : -0.08, z); }
      bg.computeVertexNormals(); const bank = new THREE.Mesh(bg, E.mat('#b4c08e', { map: E.tex('grass', 4, 7), rough: 0.95 })); bank.receiveShadow = true; wg.add(bank); p.pick(bank);
      const fenceG = E.mat('#2f5d3a', { rough: 0.6, metal: 0.3 }), fp = [], fu = [], fi = []; let nf = 0;
      for (let z = CZ0; z < CZ1; z += 1) {
        const h = wallH(z), h2 = wallH(z + 1); if (h > 0.05 || h2 > 0.05) bx(0.34, 0.12, Math.hypot(1, h2 - h) + 0.02, CX - 0.1, (h + h2) / 2 + 0.07, z + 0.5, conc, false).rotation.x = -Math.atan2(h2 - h, 1);
        if (h > 0.45) { if (Math.round(z) % 2 === 0) bx(0.05, 1.3, 0.05, CX - 0.12, h + 0.7, z, fenceG); fp.push(CX - 0.12, h + 0.12, z, CX - 0.12, h + 1.3, z); fu.push(z / 0.14, 0, z / 0.14, 1.18 / 0.14); if (nf) fi.push(nf * 2 - 2, nf * 2, nf * 2 - 1, nf * 2 - 1, nf * 2, nf * 2 + 1); nf++; }
        if (h > 0.3) p.addBox(CX - 0.1, z, 0.12, 0.55);   // the wall and its fence, in metre lengths
      }
      const fgeo = new THREE.BufferGeometry(); fgeo.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); fgeo.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2)); fgeo.setIndex(fi); fgeo.computeVertexNormals();
      wg.add(new THREE.Mesh(fgeo, meshM('#3f7a4c')));
      // drain holes every couple of metres, each with its rust-dark streak; tags along the wall
      const streak = cvT(32, 128, (c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(30,24,16,.75)'); gr.addColorStop(1, 'rgba(30,24,16,0)'); c.fillStyle = gr; c.fillRect(6, 0, 20, h); });
      const drains = []; for (let z = CZ0 + 3; z < CZ1 - 2; z += 2.4) if (wallH(z) > 1.0) { drains.push([CX + 0.06, 0.55, z, 0, PI / 2]); decal(streak, 0.16, 0.5, CX + 0.012, 0.28, z, PI / 2); }
      inst(new THREE.CylinderGeometry(0.055, 0.055, 0.16, 8, 1, true), E.mat('#3a3a3c', { rough: 0.7 }), drains.map(([x, y, z]) => [x, y, z, PI / 2, PI / 2]), false);
      decal(tag('SOUND WALK', ['#ff6ad8', '#8a3aff'], { size: 92, tilt: -0.05 }), 4.2, 1.6, CX + 0.02, 1.15, 50.5, PI / 2);
      decal(tag('SHOT', ['#ffe14a', '#ff8a1a'], { size: 150, tilt: 0.1 }), 1.6, 0.8, CX + 0.02, 0.85, 56.2, PI / 2);
      decal(tag('ATR', ['#e8e8e8', '#9aa0a8']), 1.2, 0.6, CX + 0.02, 1.25, 45.2, PI / 2);
      // on the bank: clipped shrubs along the top of the wall, and its own trees (the game's grow from the hill under the bank,
      // so they are kept off it, blocks): young firs and pines from the same photographed cards (tex/trees.png, six across,
      // a front view above a side view), standing on the bank on bare trunks
      const shrubM = E.mat('#46573e', { rough: 0.95, flat: true });
      for (let z = CZ0 + 3.2; z < CZ1 - 3; z += 1.5 + rr() * 0.9) { const x = CX - 0.9 - rr() * 0.8, s = 0.38 + rr() * 0.24, h = bankY(x, z); if (h < 0.8) continue; addM(new THREE.IcosahedronGeometry(1, 1).scale(s * 1.3, s * 0.85, s * 1.2), shrubM, x, h + s * 0.45, z, rr() * PI); }
      const atlas = new THREE.TextureLoader().load('tex/trees.png'); atlas.encoding = THREE.sRGBEncoding; atlas.anisotropy = 4;
      const cardM = E.mat('#7f8a76', { map: atlas, rough: 0.95 }, true); cardM.alphaTest = 0.5; cardM.side = THREE.DoubleSide;
      const barkM = E.mat('#6b5f52', { map: E.tex('bark', 1, 3), rough: 0.95 }), ASPECT = [0.661, 0.672, 0.853, 0.507, 0.605, 0.534];
      for (let i = 0; i < 7; i++) {
        const z = CZ0 + 3.5 + i * 2.6 + rr() * 1.4, x = CX - 4.2 - rr() * 5.5, h = bankY(x, z), k = Math.floor(rr() * 6), ht = 7 + rr() * 4, sc = ht / Math.min(1, 0.5 / ASPECT[k]), lift = Math.max(2.6, ht * 0.26);
        const pos = [], uv = [], nor = [], idx = [];   // three cards at sixty degrees, as the game's
        [[0, 0], [1, PI / 3], [0, (2 * PI) / 3]].forEach(([v, a]) => { const cx = Math.cos(a) * 0.25 * sc, cz = Math.sin(a) * 0.25 * sc, b = pos.length / 3, vb = v ? 0 : 0.5; pos.push(-cx, 0, -cz, cx, 0, cz, cx, sc, cz, -cx, sc, -cz); uv.push(k / 6, vb, (k + 1) / 6, vb, (k + 1) / 6, vb + 0.5, k / 6, vb + 0.5); for (let j = 0; j < 4; j++) nor.push(0, 0.85, 0.53); idx.push(b, b + 1, b + 2, b, b + 2, b + 3); });
        const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); cg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); cg.setIndex(idx);
        addM(cg, cardM, x, h + lift, z, rr() * PI, false);
        const tr = 0.14 + rr() * 0.05; addM(new THREE.CylinderGeometry(tr * 0.55, tr, lift + ht * 0.45, 7, 1, true).translate(0, (lift + ht * 0.45) / 2, 0), barkM, x, h - 0.3, z);
        p.addCircle(x, z, 0.3);
      } }

    /* ---- a little fox shrine in the trees, facing the trail ---- */
    { const SZ = 34.5, red = E.mat('#c23a22', { rough: 0.6 }), black = E.mat('#1c1a18', { rough: 0.6 }), stone = E.mat('#9c978c', { map: E.tex('rock', 0.5, 0.5), rough: 0.95 }), wood = E.mat('#5a3a26', { rough: 0.8 });
      // the torii
      for (const dz of [-0.75, 0.75]) { addM(new THREE.CylinderGeometry(0.085, 0.1, 2.1, 10), red, -2.95, 1.05, SZ + dz); addM(new THREE.CylinderGeometry(0.11, 0.11, 0.18, 10), black, -2.95, 0.09, SZ + dz); p.addCircle(-2.95, SZ + dz, 0.14); }
      bx(0.16, 0.12, 2.0, -2.95, 2.1, SZ, red); bx(0.22, 0.07, 2.2, -2.95, 2.19, SZ, black); bx(0.09, 0.09, 1.8, -2.95, 1.72, SZ, red); bx(0.05, 0.3, 0.2, -2.92, 1.92, SZ, black);
      // stepping stones, two lit lanterns, two foxes in red bibs, the shrine on its stone base with a rope across it
      for (const x of [-3.6, -4.3, -5.0, -5.7]) bx(0.48, 0.06, 0.62, x, 0.03, SZ + (rr() - 0.5) * 0.08, stone);
      for (const dz of [-0.95, 0.95]) {
        const x = -4.4, z = SZ + dz; bx(0.42, 0.12, 0.42, x, 0.06, z, stone); addM(new THREE.CylinderGeometry(0.08, 0.11, 0.62, 8), stone, x, 0.43, z); bx(0.34, 0.08, 0.34, x, 0.78, z, stone);
        bx(0.26, 0.24, 0.26, x, 0.94, z, stone); bx(0.18, 0.14, 0.27, x, 0.95, z, warmM, false); bx(0.27, 0.14, 0.18, x, 0.95, z, warmM, false);
        addM(new THREE.ConeGeometry(0.3, 0.2, 4), stone, x, 1.16, z, PI / 4); addM(new THREE.SphereGeometry(0.05, 8, 6), stone, x, 1.29, z);
        p.addCircle(x, z, 0.24);
        const fx = -5.65, fz = SZ + dz * 0.62; bx(0.34, 0.5, 0.34, fx, 0.25, fz, stone);
        addM(new THREE.CylinderGeometry(0.09, 0.14, 0.4, 8), white, fx, 0.7, fz); addM(new THREE.SphereGeometry(0.095, 10, 8), white, fx + 0.02, 0.95, fz);
        addM(new THREE.ConeGeometry(0.05, 0.14, 6), white, fx + 0.11, 0.93, fz, 0, true, 0, -PI / 2);
        for (const e of [-0.05, 0.05]) addM(new THREE.ConeGeometry(0.03, 0.1, 5), white, fx, 1.07, fz + e);
        addM(new THREE.CylinderGeometry(0.12, 0.15, 0.12, 10, 1, true), red, fx, 0.82, fz); p.addCircle(fx, fz, 0.24);
      }
      const HX = -6.8; bx(1.1, 0.5, 1.0, HX, 0.25, SZ, stone); bx(0.72, 0.62, 0.66, HX, 0.81, SZ, wood);
      for (const sd of [-1, 1]) bx(0.6, 0.05, 0.98, HX + sd * 0.25, 1.24, SZ, E.mat('#4a7a6a', { rough: 0.6, metal: 0.3 })).rotation.z = -sd * 0.62;
      bx(0.03, 0.4, 0.44, HX + 0.37, 0.82, SZ, E.mat('#2a1a10', { rough: 0.7 })); bx(0.02, 0.36, 0.4, HX + 0.385, 0.82, SZ, glowM('#ffb060', 0.35), false);
      addM(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), E.mat('#d8c890', { rough: 0.9 }), HX + 0.42, 1.12, SZ, 0, true, PI / 2);
      for (const dz of [-0.25, 0, 0.25]) bx(0.01, 0.16, 0.06, HX + 0.43, 0.98, SZ + dz, white, false);
      bx(0.3, 0.22, 0.24, HX + 0.62, 0.11, SZ, wood);
      p.addBox(HX, SZ, 0.6, 0.55);
      // red banners up the approach
      const nob = cvT(64, 320, (c, w, h) => { c.fillStyle = '#c8281c'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffffff'; c.font = `700 34px ${JP}`; c.textAlign = 'center'; c.textBaseline = 'middle'; [...'正一位稲荷大明神'].forEach((ch, i) => c.fillText(ch, w / 2, 26 + i * 36)); });
      const nm = E.mat('#ffffff', { map: nob, rough: 0.8 }, true); nm.side = THREE.DoubleSide;
      for (const [x, z] of [[-3.5, SZ - 1.55], [-3.5, SZ + 1.55], [-5.0, SZ - 1.45], [-5.0, SZ + 1.45]]) { addM(new THREE.CylinderGeometry(0.02, 0.02, 2.5, 5), E.mat('#3a3a3a'), x, 1.25, z); addM(new THREE.PlaneGeometry(0.36, 1.8), nm, x, 1.4, z + (z < SZ ? 0.2 : -0.2), PI / 2, false); p.addCircle(x, z, 0.06); } }

    /* ---- utility poles along the trail: wires overhead, a small lamp each, plates counting down the metres ---- */
    { const PX = -2.75, PZ = [78, 64, 51, 38], pole = E.mat('#a29f97', { map: E.tex('concrete', 0.3, 2), rough: 0.9 });
      inst(new THREE.CylinderGeometry(0.12, 0.17, 8.6, 10).translate(0, 4.3, 0), pole, PZ.map((z) => [PX, 0, z]));
      const ins = [], tiger = cvT(32, 64, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#141414' : '#f2c40c'; c.beginPath(); c.moveTo(0, i * 16 - 8); c.lineTo(w, i * 16 - 24); c.lineTo(w, i * 16 - 8); c.lineTo(0, i * 16 + 8); c.fill(); } });
      PZ.forEach((z, i) => {
        bx(1.6, 0.1, 0.1, PX, 7.9, z, steelD); bx(0.7, 0.08, 0.08, PX + 0.2, 6.85, z, steelD);
        for (const dx of [-0.7, 0, 0.7]) ins.push([PX + dx, 8.0, z]);
        bx(0.9, 0.06, 0.06, PX + 0.45, 5.35, z, steelD).rotation.z = 0.12; bx(0.42, 0.11, 0.2, PX + 0.98, 5.4, z, white);
        const tb = i === 1 ? add(new THREE.BoxGeometry(0.36, 0.02, 0.14), glowM('#e4f2ff', 1.2, true), PX + 0.98, 5.34, z, 0, false) : (bx(0.36, 0.02, 0.14, PX + 0.98, 5.34, z, tubeM, false), null);
        lamps.push({ tb, h: halo('#dff0ff', 1.4, PX + 0.98, 5.3, z, 0.4), p: pool('#d6ecff', 5, PX + 1.2, 0.07, z, 0.18, i === 1), pole: i });
        plate(`SHOT\n${12 + i}`, 0.18, 0.3, PX, 2.1, z + 0.17, 0, { w: 112, h: 186, color: '#1a1a1c', bg: '#f0eee6', font: `700 40px ${JP}` });
        if (i % 2 === 0) { const m = E.mat('#ffffff', { map: tiger, rough: 0.6 }); m.map.repeat.set(1, 2); addM(new THREE.CylinderGeometry(0.19, 0.2, 1.8, 10, 1, true), m, PX, 0.9, z); }
        p.addCircle(PX, z, 0.2);
        const dist = Math.round(z / 5) * 5;   // to the parking area
        if (i < 3) plate(`SHOT PA  ↑  ${dist} m\n歩行者通路`, 0.9, 0.46, PX + 0.12, 2.85, z + 0.22, 0.25, { w: 384, h: 196, color: '#ffffff', bg: '#1f55b8', font: `700 58px ${JP}`, font2: `700 38px ${JP}`, lit: 0.7 });
      });
      inst(new THREE.CylinderGeometry(0.05, 0.07, 0.16, 8), white, ins, false);
      // the wires: two crossed ribbons each, so they show from any side; the last span drops to the tower
      const wp = [], wi = [];
      const wire = (a, b, sag, th = 0.022) => { const n = 12, pts = []; for (let k = 0; k <= n; k++) { const t = k / n; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]); }
        for (const [ox, oy] of [[th, 0], [0, th]]) { const s = wp.length / 3; pts.forEach(([x, y, z]) => wp.push(x - ox, y - oy, z, x + ox, y + oy, z)); for (let k = 0; k < n; k++) wi.push(s + k * 2, s + k * 2 + 2, s + k * 2 + 1, s + k * 2 + 1, s + k * 2 + 2, s + k * 2 + 3); } };
      for (let i = 0; i < PZ.length - 1; i++) { for (const dx of [-0.7, 0, 0.7]) wire([PX + dx, 8.08, PZ[i]], [PX + dx, 8.08, PZ[i + 1]], 0.42 + dx * 0.05); wire([PX + 0.45, 6.9, PZ[i]], [PX + 0.45, 6.9, PZ[i + 1]], 0.36); }
      const wgeo = new THREE.BufferGeometry(); wgeo.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); wgeo.setIndex(wi); wgeo.computeVertexNormals();
      const wm = E.mat('#1a1a1c', { rough: 0.6 }, true); wm.side = THREE.DoubleSide; wg.add(new THREE.Mesh(wgeo, wm)); }

    flushPlates(); flushM();
    // [lx, lz, the level it is at, tight]: the level, so the auto-walk starts from the landing you are on and not the one
    // above or below it, and a warp lands up on the bridge
    const ROUTE = [[0, RZ1 + 4, 0], ...Array.from({ length: 23 }, (_, k) => { const z = RZ1 + 0.4 - ((RZ1 - ZN) * k) / 22; return [BX, z, Math.max(0.07, rampH(z))]; }),   // a point every 2 m up the ramp (the hills are kept off the path point by point)
      [-0.4, ZN - 1, H], [-0.35, ZN - 3.7, H], [-0.3, ZN - 6.4, H], [-0.25, ZN - 9.1, H], [-0.15, BZ0 + 0.5, H], [0, 4.5, H], [0, 3, H], [0, 1.5, H], [0, 0, H]];   // the last nine are the bridge and walkway: a warp to the place lands at the top of the ramp
    return {
      group: wg, route: ROUTE,
      // someone on the ground under the bridge or beside the tower, sent off by the map, is led to the door first: down the
      // tower's west side past the open door leaf (east of it a tree of the funfair's stands too close), or from its east
      // side round its south-east corner. Under the bridge is OHH's canal where it runs there (crossed): its towpath has its own way.
      lead: (lx, lz, y) => {   // someone down beside or under the ramp, sent off by the map, goes round to its foot first (east of it, clear of the poles)
        if (!(y < 1.5) || lx < -7.6 || lx > 3.6 || lz < BZ0 + 0.2 || lz > RZ1 + 0.5 || (crossed && lz < ZN)) return null;
        return [[1.7, Math.max(lz, ZN + 1)], [1.7, RZ1 + 1.2], [BX, RZ1 + 1.2]];
      },
      // OHH's canal crosses here, under the bridge, between za and zb on lx = 0 (it stands its piers there): the paving,
      // the fence, the cones and the barrier down there make way for its cutting
      open(za, zb) { crossed = true; wg.remove(ug); uCols.forEach((b) => (b.y0 = 1e9)); },
      BZ0, ZN, ZS, RZ1,
      ground: (lx, lz, y) => {
        if (onRamp(lx, lz)) { const h = rampH(lz); if (y === undefined || y > h - 1.2) return h; }   // the ramp, for someone on it (under it, the ground)
        if (Math.abs(lx - BX) < BW && lz >= BZ0 - 0.1 && lz <= ZN && (y === undefined || y > H - 1.4)) return H;   // the bridge, for someone up on it
        return bankY(lx, lz);
      },
      stairs: () => false,   // no stairs: the ramp can be run and ridden
      blocks: (lx, lz) => (Math.abs(lx - BX) < BW + 2 && lz > ZN && lz < RZ1 + 4) || (lx > CX - 13 && lx < CX + 0.6 && lz > CZ0 - 1 && lz < CZ1 + 1) || (lx > -8.5 && lx < -2.4 && lz > 31.5 && lz < 37.5) || (lx > -11 && lx < 3 && lz > 3 && lz < ZS + 10),
      update(t) {
        // the tube on the third landing is failing: dark stutters every few seconds; a lamp out on the trail does the same, slower
        const fl = (t % 6.3 < 1.1 && Math.sin(t * 53) * Math.sin(t * 17) > -0.1) ? 0.12 : 1, fl2 = (t % 9.7 < 0.6 && Math.sin(t * 41) > 0) ? 0.2 : 1;
        for (const L of lamps) { if (!L.tb) continue; const k = L.k === 3 ? fl : fl2; L.h.material.opacity = 0.42 * k; L.p.material.opacity = (L.k ? 0.2 : 0.16) * k; L.tb.visible = k > 0.5; }
      },
    };
  }

  PLACES.shot = {
    build(p, E) {
      const g = p.group, r = E.rng(131);
      const H = 7, HALF = 52, ZC = -15, WD = 16;
      const conc = E.mat('#6e6a68'), concD = E.mat('#4a4746');

      // the parking area beside the expressway, reached on foot by a stair tower and a footbridge (shotWay, above)
      parkingArea(p, E, g, { y: H, zr: -7, depth: 6.4, half: 24, taper: 12, name: 'SHOT PA', kiosk: [9, 18], walkway: [-2.5, 2.5, 6], slotX: 6 });
      const way = shotWay(p, E, g, H);
      p.ground = (lx, lz, y) => {
        if (y === undefined || y > H - 1.4) {   // the deck is the ground only for someone up on it (or set down from above): below it, on the forecourt, you stay on the floor
          if (lz >= -7.2 && lz <= -0.6 && Math.abs(lx) < 24 + 12 * Math.max(0, Math.min(1, (-4.8 - lz) / 2.2))) return H;   // the lay-by and its tapers
          if (Math.abs(lx) < 2.6 && lz > -0.6 && lz <= 6) return H;    // the walkway to the bridge
          if (lx > 9 && lx < 18 && lz > -0.6 && lz < 3.8) return H;    // in front of the building
        }
        return way.ground(lx, lz, y);   // the stair tower, the footbridge, the bank over the cutting
      };
      p.stairs = way.stairs; p.lead = way.lead;
      // OHH's canal crosses the way in an open cutting under the footbridge (where the world has it): it stands a pier either
      // side of it under the deck (between z0 and z1 on lx = 0, hw either side, at y(lz)), keeps the camera under it, and
      // calls open() so that what stood on the ground there makes way
      SW.Ramp = { place: p, hw: 1.8, z0: way.BZ0, z1: way.ZN, y: () => H + 0.16, open: way.open };   // (y: a pier stops 0.5 under it, so up against the bridge's channels)
      // the game laid the path from the trail's end straight on to the viewpoint; from the ramp's foot it goes up the ramp and over the bridge instead
      p.afterSpill = () => { const keep = p.path.filter((q) => p.local(q.x, q.z).z > way.RZ1 + 4); p.path.length = 0; p.path.push(...keep, ...way.route.map(([lx, lz, y, tight]) => Object.assign(p.toWorld(lx, lz), { y }, tight ? { tight: true } : {}))); };
      p.addBox(-3.7, 6.2, 0.6, 0.2, -1e9, H - 2); p.addBox(3.7, 6.2, 0.6, 0.2, -1e9, H - 2); p.addBox(-2.75, 2.7, 0.2, 3.2); p.addBox(2.75, 2.7, 0.2, 3.2);   // the walkway's sides

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
        b.position.set(x, 0, far ? Math.min(z, ZC - WD / 2 - 6 - d / 2) : z); g.add(tm.add(b));   // (the far ones clear of the street under the expressway: street.js)
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

      p.map = [{ t: 'rect', x: 0, z: ZC, w: HALF * 2, h: WD, c: '#3a3840' }, { t: 'rect', x: -0.3, z: (way.BZ0 + way.ZN) / 2, w: 2.9, h: way.ZN - way.BZ0, c: '#6e6a68' }, { t: 'rect', x: -0.3, z: (way.ZN + way.RZ1) / 2, w: 2.9, h: way.RZ1 - way.ZN, c: '#8a8680' }];   // the bridge, the ramp
      p.grade = {
        top: '#07050e', bottom: '#2b1730', fog: '#1d1424', near: 18, far: 125,
        sun: '#ffb36b', sunInt: 0.3, hemi: 0.3, sunDir: [-0.3, 0.7, -0.4],
        tint: [1.08, 0.97, 0.9], expo: 1.25, sat: 1.1, stars: 0.2,
      };
      p.face = Math.PI;
      p.pathEnd = 27;
      p.clearR = 14;
      // the core: the deck and the road, the forecourt, and the shrine and the cutting beside the trail (no rock or hill
      // comes up over them where the world raises one there: the funfair's crater wall)
      p.core = (lx, lz) => (Math.abs(lx) < HALF + 32 && lz < 0 && lz > -80) || (Math.abs(lx) < 8 && lz < 30) || (lx > -8 && lx < 3 && lz < way.ZS + 10) || (lx > -9 && lx < -2.4 && lz > 31 && lz < 63);
      p.blocks = (lx, lz) => p.core(lx, lz) || way.blocks(lx, lz);   // no trees on the bank or in the shrine

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
        way.update(t); way.group.visible = !viewing;   // the way up stays put while the view streams the road past, so it steps out of it
        blocks.forEach((B) => { B.b.scale.y += (B.h * (0.75 + band(f, B.k, 24) * 0.5) - B.b.scale.y) * Math.min(1, dt * 8); });
      };
      p.shot = (t, f) => {
        const s = RM ? 0 : f.pulse * 0.06;
        return { pos: [-40, H + 1.25 + s, ZC - 3.8 - Math.sin(t * 0.4) * 0.6], look: [10, H + 1.0, ZC - 2.5 - Math.sin(t * 0.4 + 0.6) * 1.5], roll: -Math.sin(t * 0.4) * 0.02 };
      };
    },
  };

  /* ------------------------------------------------------------------ */
  /* OHH's old canal: from the river tunnel under OHH's hill to the crater */
  /* ------------------------------------------------------------------ */
  // An irrigation canal of an old waterworks branches off the river tunnel under OHH's hill in a vaulted chamber (a
  // landing with steps down to the water, a pump room through a door, a grating up to the hilltop letting the day in),
  // runs north and then east in a brick bore under the hills and KEYAKI's mountain (under its trail), comes out by SHOT's
  // way into an open cutting (SHOT's ramp carries the path over it on two piers) and goes in through a portal in the
  // crater wall, along the cave and out on the funfair's lagoon (SW.Caldera). The water is at the river's and the lagoon's
  // level the whole way, so a boat runs it end to end; a towpath runs along its right bank (going towards the crater),
  // level with the funfair's quay, so you can walk from the chamber to the lagoon. Inside the hill nothing sees the sun:
  // lining, towpath, water and fittings are drawn with the light of the lamps (and of the gratings) baked into their
  // colours, and fade to black with distance instead of into the day's fog. The river tunnel is relined the same way, so
  // the two read as one work. In OHH's frame; o: { P (the river channel's centre line, a point every 1.5 m), W (its half
  // width), first, last (the river's bore), height(lx, lz) (OHH's hill) }. Returns the hooks OHH folds into its own.
  function aqueduct(p, E, g, o) {
    const { P, W, first, last } = o, n = P.length, tanP = (i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const BW = 3.6, KE = 1.2, TY = 0.9, SY = 2.9, CY = 5.6, RV = W + 0.6, HV = 5.4;   // the canal's bore (half width), the towpath's water edge (u > KE is towpath), its height, the vault's springing and crown; the river bore's half width and crown
    const vaultY = (u) => SY + (CY - SY) * Math.sqrt(Math.max(0, 1 - (u / BW) ** 2));
    // The chamber, between river sections I0 and I1: s along the river (towards the sea), b across it (+b towards the canal).
    const I0 = 12, I1 = 21, A0 = P[I0], A1 = P[I1], LC = Math.hypot(A1[0] - A0[0], A1[1] - A0[1]), H2 = LC / 2, e1 = [(A1[0] - A0[0]) / LC, (A1[1] - A0[1]) / LC], e2 = [-e1[1], e1[0]], O = [(A0[0] + A1[0]) / 2, (A0[1] + A1[1]) / 2];
    const ch = (s, b) => [O[0] + e1[0] * s + e2[0] * b, O[1] + e1[1] * s + e2[1] * b], chIn = (x, z) => { const dx = x - O[0], dz = z - O[1]; return [dx * e1[0] + dz * e1[1], dx * e2[0] + dz * e2[1]]; };
    const yS = Math.atan2(e1[0], e1[1]), yB = Math.atan2(e2[0], e2[1]);   // a box's +z along s / along b (its x then runs along the other)
    const SC = 1.5, BM = -6.6, BP = 10.5, CH = 6.8, LB = 5.2, LG = BM + 1.3;   // where the canal leaves (s), the chamber's side walls (b), its ceiling, the landing's water edge, the far ledge's
    const RM = { s0: -H2 - 4.4, s1: -H2, b0: 7.3, b1: BP, top: TY + 2.9, door: [8.4, 10] };   // the pump room, through the upstream wall beside the river's arch
    const STP = [-5.6, -3.2];   // steps from the landing down into the water
    const SHF = [-4.7, -1.7, 0.6, 3.6];   // the grating's shaft from the ceiling up to OHH's hilltop (s0, s1, b0, b1)
    const inCh = (s, b) => s > -H2 - 0.05 && s < H2 + 0.05 && b > BM && b < BP + 0.05, inRoom = (s, b) => s > RM.s0 && s < RM.s1 && b > RM.b0 && b < RM.b1;

    // The canal's centre line: out of the chamber at s = SC, north under OHH's hill, east under the hills and KEYAKI's
    // mountain (crossing under its trail), out of the hill by SHOT's way, then straight along the cave's line into the crater.
    const W2L = (x, z) => { const l = p.local(x, z); return [l.x, l.z]; }, CP = SW.Caldera.portal, AX = (t) => W2L(CP.end.x + CP.dir.x * t, CP.end.z + CP.dir.z * t);
    const KP = [ch(SC, LB), ch(SC, 7.85), ch(SC, BP), ch(SC, 13.5), ...[[-92.5, -39], [-86, -47], [-72, -57], [-57, -64], [-43, -69], [-38.5, -79.5], [-35.5, -85], [-28, -91]].map(([x, z]) => W2L(x, z)), AX(17), AX(11), AX(5), AX(0), W2L(CP.x, CP.z)];
    const cv = new THREE.CatmullRomCurve3(KP.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal'), C = [], at = [];
    for (let k = 0; k < KP.length - 1; k++) { at[k] = C.length; const m = Math.max(1, Math.ceil(Math.hypot(KP[k + 1][0] - KP[k][0], KP[k + 1][1] - KP[k][1]))); for (let j = 0; j < m; j++) { const v = cv.getPoint((k + j / m) / (KP.length - 1)); C.push([v.x, v.z]); } }
    at[KP.length - 1] = C.length; C.push(KP[KP.length - 1]);
    const NC = C.length, iW = at[2], iP = at[10], iE = at[15], iM = at[16];   // the chamber's wall, the portal out of the hill, the crater wall, the cave's mouth on the lagoon
    const T = C.map((_, i) => { const a = C[Math.max(0, i - 1)], b = C[Math.min(NC - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; });
    const R = T.map(([x, z]) => [-z, x]), S = [0];   // R: the right bank (the towpath's side), S: metres along
    for (let i = 1; i < NC; i++) S.push(S[i - 1] + Math.hypot(C[i][0] - C[i - 1][0], C[i][1] - C[i - 1][1]));
    const pt = (i, u) => [C[i][0] + R[i][0] * u, C[i][1] + R[i][1] * u], yawT = (i) => Math.atan2(T[i][0], T[i][1]);   // yawT: a box's +z along the canal, its +x across it (to the left)
    const iAt = (v) => { const i = S.findIndex((s2) => s2 >= v); return i < 0 ? NC - 1 : i; };
    // nearest point of the centre line, through a 4 m grid of the segments; past either end counts as nowhere
    const grid = new Map(), key = (x, z) => Math.floor(x / 4) * 4096 + Math.floor(z / 4);
    for (let i = 0; i < NC - 1; i++) { const a = C[i], b = C[i + 1]; for (let gx = Math.floor((Math.min(a[0], b[0]) - 10) / 4); gx <= Math.floor((Math.max(a[0], b[0]) + 10) / 4); gx++) for (let gz = Math.floor((Math.min(a[1], b[1]) - 10) / 4); gz <= Math.floor((Math.max(a[1], b[1]) + 10) / 4); gz++) { const k = gx * 4096 + gz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); } }
    const Q = { i: -1, u: 0, v: 0, d: 1e9 };
    const near = (x, z) => { Q.i = -1; Q.d = 1e9; const list = grid.get(key(x, z)); if (!list) return Q; let tt = 0;
      for (const i of list) { const a = C[i], ex = C[i + 1][0] - a[0], ez = C[i + 1][1] - a[1], L = Math.hypot(ex, ez) || 1e-6, t = clamp(((x - a[0]) * ex + (z - a[1]) * ez) / (L * L), 0, 1), px = a[0] + ex * t, pz = a[1] + ez * t, d = Math.hypot(x - px, z - pz); if (d < Q.d) { Q.d = d; Q.i = i; Q.u = ((x - px) * -ez + (z - pz) * ex) / L; Q.v = S[i] + t * L; tt = t; } }
      if ((Q.i === NC - 2 && tt >= 1 && plane(NC - 1, x, z)[0] > 1.6) || (Q.i === 0 && tt <= 0)) Q.i = -1; return Q; };   // (the towpath runs on a little past the cave's mouth, onto the quay)
    const zone = (i) => (i < 0 ? -1 : i < iW ? 0 : i < iP ? 1 : i < iE ? 2 : 3);   // 0 the chamber's mouth, 1 the bore, 2 the open cutting, 3 the crater's cave
    const plane = (i, x, z) => [(x - C[i][0]) * T[i][0] + (z - C[i][1]) * T[i][1], (x - C[i][0]) * R[i][0] + (z - C[i][1]) * R[i][1]];   // along, across a section
    const IA = at[7] + 2, IB = IA + 4, BD = 2.4, inBay = (i, u) => i >= IA && i < IB && u > BW - 0.2 && u < BW + BD;   // the sluice-keeper's bay, off the towpath where the line runs straight
    const iST = at[12] + Math.round((at[13] - at[12]) * 0.45), stairAt = (u, v) => Math.abs(v - S[iST]) < 0.85 && u > BW - 0.1 && u < BW + 2.4;   // steps down to SHOT's way, between its ramp and the portal
    const RP = SW.Ramp, rampAt = RP ? (x, z) => { const w = p.toWorld(x, z), l = RP.place.local(w.x, w.z); return Math.abs(l.x) < RP.hw && l.z > RP.z0 && l.z < RP.z1 ? RP.y(l.z) : null; } : () => null;   // SHOT's ramp, over the cutting
    // the light shafts up through the hills: squares on the hills' 2 m grid (world), so the hole in the hill is exactly the square
    const SQ = [[-80, -54, -76, -50], [-64, -64, -60, -60]], inSq = (lx, lz) => { const w = p.toWorld(lx, lz); return SQ.findIndex(([x0, z0, x1, z1]) => w.x > x0 && w.x < x1 && w.z > z0 && w.z < z1); };

    /* ---- the hooks ---- */
    // underfoot, down in the canal (y below 3): the towpath, the water, the chamber's landing and ledge, the pump room, the bay
    const floor = (lx, lz, y) => {
      if (y === undefined || y > 3) return null;
      const [s, b] = chIn(lx, lz);
      if (inRoom(s, b)) return TY;
      if (inCh(s, b)) { if (b > LB) return s < SC - KE || s > SC + BW ? TY : 0; if (b < LG) return TY; return s > STP[0] && s < STP[1] && b > LB - 1.9 ? TY * clamp((b - (LB - 1.8)) / 1.8, 0, 1) : 0; }
      const q = near(lx, lz), zn = zone(q.i);
      if (zn <= 0) return null;
      if (zn === 1 && inBay(q.i, q.u)) return TY;
      if (zn === 2 && stairAt(q.u, q.v)) return TY * clamp(1 - (q.u - BW) / 2.2, 0, 1);
      if (Math.abs(q.u) > (zn === 3 ? 3.95 : BW + 0.1)) return null;
      return q.u >= KE ? TY : 0;
    };
    const water = (lx, lz) => { const [s, b] = chIn(lx, lz); if (inCh(s, b)) return b > LB ? s > SC - KE && s < SC + BW : b > LG; const q = near(lx, lz), zn = zone(q.i); return (zn === 1 || zn === 2) && q.u > -BW && q.u < KE; };
    // the camera keeps under the vault, the chamber's ceiling, the room's and the bay's, SHOT's ramp
    const ceil = (lx, lz) => {
      const [s, b] = chIn(lx, lz);
      if (inRoom(s, b)) return RM.top - 0.35;
      if (inCh(s, b)) return CH - 0.45;
      const q = near(lx, lz), zn = zone(q.i);
      if (zn === 1 && inBay(q.i, q.u)) return SY - 0.3;
      if (zn === 1 && Math.abs(q.u) < BW + 0.6) return vaultY(Math.min(Math.abs(q.u), 3.3)) - 0.35;
      if (zn === 2 && Math.abs(q.u) < BW + 0.6) { const h = rampAt(lx, lz); if (h != null) return Math.max(1.7, h - 0.85); }
      return null;
    };
    // the hills: dug away along the open cutting (its banks rise from beside the parapets) right up to the face of each portal
    // (the crater wall's rock too, which otherwise ran down into the water in front of its portal), opened at the portals' mouths and over the shafts
    const carve = (lx, lz) => { const q = near(lx, lz); if (q.i < iP - 2 || q.i > iE + 1) return 1; if (plane(iP, lx, lz)[0] < 0.6 || plane(iE, lx, lz)[0] > -0.6) return 1; const t = clamp((Math.abs(q.u) - BW - 1.8) / 4.2, 0, 1); return t * t * (3 - 2 * t); };
    // the air the canal needs inside the hill (the bore under its vault, the bay, the chamber, the pump room): a hill's mesh
    // must not stand in it. OHH's hill covers the first stretch from above and the game's hills the rest, but each mesh on
    // its own still runs on underneath the other, so whichever is the lower one would fill the bore; cuts(tri) tests a face
    // (9 numbers: three corners x, y, z in this frame) at 15 points over it, so a face that only grazes the vault goes too.
    const inAir = (lx, lz, y) => {
      const [s, b] = chIn(lx, lz);
      if (inRoom(s, b)) return y < RM.top + 0.3;
      if (inCh(s, b)) return y < CH + 0.3;
      const q = near(lx, lz); if (zone(q.i) !== 1) return false;
      if (inBay(q.i, q.u)) return y < SY + 0.3;
      return Math.abs(q.u) < BW + 0.3 && y < vaultY(Math.min(Math.abs(q.u), BW)) + 0.3;
    };
    const cuts = (t) => {
      const cx = (t[0] + t[3] + t[6]) / 3, cz = (t[2] + t[5] + t[8]) / 3, [s, b] = chIn(cx, cz);
      if (!(s > RM.s0 - 3 && s < H2 + 3 && b > BM - 3 && b < BP + 3)) { const q = near(cx, cz); if (zone(q.i) !== 1 || Math.abs(q.u) > BW + BD + 2) return false; }   // nowhere near
      for (let i = 0; i <= 4; i++) for (let j = 0; i + j <= 4; j++) { const a = i / 4, c = j / 4, d = 1 - a - c; if (inAir(t[0] * a + t[3] * c + t[6] * d, t[2] * a + t[5] * c + t[8] * d, t[1] * a + t[4] * c + t[7] * d)) return true; }
      return false;
    };
    const holeAt = (lx, lz, y, tri) => { if (inSq(lx, lz) >= 0 || (tri && cuts(tri))) return true; const [a, c] = plane(iP, lx, lz); if (a > -1.4 && a < 3 && Math.abs(c) < BW + 2 && y < CY + 2.5) return true; const [a2, c2] = plane(iE, lx, lz); return a2 > -3 && a2 < 1.4 && Math.abs(c2) < BW + 2 && y < CY + 2.5; };   // (the crater's portal faces the other way)
    const blocks = (lx, lz) => { const q = near(lx, lz); if (zone(q.i) >= 2 && Math.abs(q.u) < BW + 4) return true; const w = p.toWorld(lx, lz); return SQ.some(([x0, z0, x1, z1]) => w.x > x0 - 3 && w.x < x1 + 3 && w.z > z0 - 3 && w.z < z1 + 3); };   // no trees in the cutting or by the shafts' heads
    const noPier = (lx, lz) => { const q = near(lx, lz); return zone(q.i) === 2 && Math.abs(q.u) < BW + 3; };

    /* ---- light, baked ---- */
    const lamps = [], days = [], AMB = [0.04, 0.045, 0.05], LCOL = [1.0, 0.68, 0.4], DCOL = [0.7, 0.78, 0.86];
    const lamp = (x, y, z, I = 1, r = 2.4) => lamps.push([x, y, z, I, r * r, (r * 6) ** 2]), day = (x, y, z, I = 1.2, r = 4) => days.push([x, y, z, I, r * r, (r * 6) ** 2]);
    const bake = (x, y, z, nx, ny, nz, out, k) => {
      let r = AMB[0], gg = AMB[1], bb = AMB[2];
      for (const [L, col] of [[lamps, LCOL], [days, DCOL]]) for (const q of L) { const dx = q[0] - x, dy = q[1] - y, dz = q[2] - z, d2 = dx * dx + dy * dy + dz * dz; if (d2 > q[5]) continue; const f = (q[3] / (1 + d2 / q[4])) * (0.3 + 0.7 * Math.max(0, (dx * nx + dy * ny + dz * nz) / (Math.sqrt(d2) || 1))); r += col[0] * f; gg += col[1] * f; bb += col[2] * f; }
      out[k] = r; out[k + 1] = gg; out[k + 2] = bb; return out; };
    // inside the hill: unlit colours times the baked light, out of the fog, fading to black with distance
    const dark = (sh) => { sh.vertexShader = 'varying float vTd;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvTd = length(mvPosition.xyz);'); sh.fragmentShader = 'varying float vTd;\n' + sh.fragmentShader.replace('#include <fog_fragment>', 'gl_FragColor.rgb *= exp(-max(0., vTd - 9.) * .045);\n#include <fog_fragment>'); };
    const tm = (hex, kind) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).convertSRGBToLinear(), map: kind ? E.tex(kind, 1, 1) : null, vertexColors: true, side: THREE.DoubleSide, fog: false }); m.userData.lin = true; m.onBeforeCompile = dark; return m; };
    const brickM = tm('#c4ad98', 'brick'), stoneM = tm('#d4cab8', 'concrete'), paveM = tm('#b8ae9e', 'paving'), ironM = tm('#4a4440'), rustM = tm('#7a4a30'), brassM = tm('#a88440'), copperM = tm('#8a5634'), woodM = tm('#7a5638'), voidM = tm('#0e0c0b'), plateM = tm('#2e4a3a');
    const glowM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc47a').convertSRGBToLinear().multiplyScalar(1.15), fog: false }); glowM.userData.lin = true;
    // the water down here: black-green, the lamps' light lying on it, broken up by the ripples
    const waterM = new THREE.ShaderMaterial({ vertexColors: true, side: THREE.DoubleSide, uniforms: { t: { value: 0 }, nrm: { value: E.waterN } },
      vertexShader: 'varying vec3 vC;varying vec3 vW;varying float vTd;void main(){vC=color;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vec4 mv=viewMatrix*w;vTd=length(mv.xyz);gl_Position=projectionMatrix*mv;}',
      fragmentShader: 'uniform float t;uniform sampler2D nrm;varying vec3 vC;varying vec3 vW;varying float vTd;void main(){vec3 n1=texture2D(nrm,vW.xz*.035+vec2(t*.011,t*.007)).rgb*2.-1.;vec3 n2=texture2D(nrm,vW.xz*.075-vec2(t*.009,-t*.012)).rgb*2.-1.;' +
        'vec3 N=normalize(vec3((n1.x+n2.x)*.35,1.,(n1.y+n2.y)*.35));vec3 V=normalize(cameraPosition-vW);float fr=pow(1.-max(dot(N,V),0.),3.);float rp=clamp(.5+.5*(n1.x*.6+n2.y*.7),0.,1.),gl=pow(rp,30.);' +
        'vec3 col=vec3(.003,.006,.007)+vC*(.012+.3*fr*(.35+rp))+vC*gl*1.4;col*=exp(-max(0.,vTd-9.)*.045);gl_FragColor=vec4(col,1.);}' });
    // out in the day (the cutting, the portals, the shafts' heads): ordinary lit materials
    const ds = (m) => { const c = m.clone(); c.side = THREE.DoubleSide; c.onBeforeCompile = m.onBeforeCompile; return c; };
    const brickO = ds(E.mat('#9a7e6a', { map: E.tex('brick', 1, 1), rough: 0.9 })), stoneO = ds(E.mat('#a8a094', { map: E.tex('concrete', 1, 1), rough: 0.9 })), paveO = ds(E.mat('#8a8075', { map: E.tex('paving', 1, 1), rough: 0.88 })), ironO = E.mat('#2c2c30', { metal: 0.6, rough: 0.45 }), stoneB = E.mat('#a8a094', { rough: 0.9 }), collarM = E.mat('#6c675b', { map: E.tex('concrete', 1, 1), rough: 0.95 });
    const OB = E.batch(g), ob = OB.box;
    // geometry with the light baked in: normals turned towards the open side (inPt(x, y, z) -> a point in the open)
    const geoOf = (pos, uv, idx) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); if (idx) geo.setIndex(idx); geo.computeVertexNormals(); return geo; };
    const lit = (geo, inPt) => { const pa = geo.attributes.position, na = geo.attributes.normal, col = new Float32Array(pa.count * 3);
      for (let k = 0; k < pa.count; k++) { const x = pa.getX(k), y = pa.getY(k), z = pa.getZ(k); let nx = na.getX(k), ny = na.getY(k), nz = na.getZ(k); const q = inPt(x, y, z); if ((q[0] - x) * nx + (q[1] - y) * ny + (q[2] - z) * nz < 0) { nx = -nx; ny = -ny; nz = -nz; } bake(x, y, z, nx, ny, nz, col, k * 3); }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); return geo; };
    const inCanal = (x, y, z) => { const q = near(x, z); if (q.i < 0) return [x, y + 1, z]; const c = C[q.i]; return [c[0], 2.6, c[1]]; }, inChamber = () => { const [x, z] = ch(0, 2); return [x, 3.2, z]; }, up = (x, y, z) => [x, y + 1, z];
    // a strip along the canal: prof(i) -> [[u, y], ...] (the same count every time); metres along and around for the texture
    const ribbon = (i0, i1, prof, tile, skip) => { const pos = [], uv = [], idx = []; let w = 0;
      for (let i = i0; i <= i1; i++) { const pr = prof(i); w = pr.length; let acc = 0; pr.forEach(([u, y], k) => { if (k) acc += Math.hypot(u - pr[k - 1][0], y - pr[k - 1][1]); const [x, z] = pt(i, u); pos.push(x, y, z); uv.push(S[i] / tile, acc / tile); });
        if (i < i1) for (let k = 0; k < w - 1; k++) { if (skip && skip(i, k)) continue; const a = (i - i0) * w + k, b = a + w; idx.push(a, b, a + 1, a + 1, b, b + 1); } }
      return geoOf(pos, uv, idx); };
    // a flat face in a vertical plane: outline and holes in (a, y), placed by at2(a) -> [x, z]; a flat face at height y, outline in the chamber's (s, b)
    const face = (outline, holes, at2, tile) => { const sh = new THREE.Shape(outline.map(([a, y]) => new THREE.Vector2(a, y))); holes.forEach((h) => sh.holes.push(new THREE.Path(h.map(([a, y]) => new THREE.Vector2(a, y))))); const sg = new THREE.ShapeGeometry(sh), pa = sg.attributes.position, pos = [], uv = [];
      for (let k = 0; k < pa.count; k++) { const a = pa.getX(k), y = pa.getY(k), [x, z] = at2(a); pos.push(x, y, z); uv.push(a / tile, y / tile); }
      return geoOf(pos, uv, Array.from(sg.index.array)); };
    const slab = (outline, holes, y, tile) => { const sh = new THREE.Shape(outline.map(([s, b]) => new THREE.Vector2(s, b))); holes.forEach((h) => sh.holes.push(new THREE.Path(h.map(([s, b]) => new THREE.Vector2(s, b))))); const sg = new THREE.ShapeGeometry(sh), pa = sg.attributes.position, pos = [], uv = [];
      for (let k = 0; k < pa.count; k++) { const [x, z] = ch(pa.getX(k), pa.getY(k)); pos.push(x, y, z); uv.push(x / tile, z / tile); }
      return geoOf(pos, uv, Array.from(sg.index.array)); };
    // everything lit in the dark is gathered per material and drawn as one mesh (flushQ): the chamber alone is dozens of faces
    const QG = new Map(), add = (geo, m, inPt, pick) => { if (!QG.has(m)) QG.set(m, { geos: [], pick: false }); const q = QG.get(m); q.geos.push(lit(geo, inPt).index ? geo.toNonIndexed() : geo); q.pick = q.pick || !!pick; };
    const flushQ = () => { for (const [m, q] of QG) { const names = ['position', 'normal', 'uv', 'color'], arr = names.map(() => []);
        q.geos.forEach((geo) => names.forEach((nm, k) => { const a = geo.attributes[nm]; for (let i = 0; i < a.count * a.itemSize; i++) arr[k].push(a.array[i]); }));
        const geo = new THREE.BufferGeometry(); names.forEach((nm, k) => geo.setAttribute(nm, new THREE.Float32BufferAttribute(arr[k], nm === 'uv' ? 2 : 3)));
        const o2 = new THREE.Mesh(geo, m); g.add(o2); if (q.pick) p.pick(o2); }
      QG.clear(); };
    const addO = (geo, m, pick) => { const o2 = new THREE.Mesh(geo, m); o2.receiveShadow = o2.castShadow = true; g.add(o2); if (pick) p.pick(o2); return o2; };
    // small fittings in the dark: boxes, one instanced draw per material, each lit by the light where it stands (its faces shaded by a fixed amount)
    const ub = new THREE.BoxGeometry(1, 1, 1); { const na = ub.attributes.normal, c = new Float32Array(na.count * 3); for (let k = 0; k < na.count; k++) c.fill(na.getY(k) > 0.5 ? 1 : na.getY(k) < -0.5 ? 0.45 : 0.72 + 0.1 * na.getX(k), k * 3, k * 3 + 3); ub.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
    const TB = [], tb = (w, h, d, x, y, z, yaw, m) => { TB.push([w, h, d, x, y, z, yaw || 0, m]); };
    const flushTB = () => { const by = new Map(); TB.forEach((r) => { if (!by.has(r[7])) by.set(r[7], []); by.get(r[7]).push(r); }); const o3 = new THREE.Object3D(), cc = new THREE.Color(), tmp = [0, 0, 0];
      for (const [m, list] of by) { const im = new THREE.InstancedMesh(ub, m, list.length); list.forEach(([w, h, d, x, y, z, yaw], k) => { o3.position.set(x, y, z); o3.rotation.set(0, yaw, 0); o3.scale.set(w, h, d); o3.updateMatrix(); im.setMatrixAt(k, o3.matrix); bake(x, y + h / 2, z, 0, 1, 0, tmp, 0); im.setColorAt(k, cc.setRGB(tmp[0], tmp[1], tmp[2])); }); im.frustumCulled = false; g.add(im); }
      TB.length = 0; };
    const bulbs = [], bulb = (x, y, z, r = 0.1) => bulbs.push([x, y, z, r]);
    const wheel = (x, y, z, yaw, r, m = brassM) => { const parts = [new THREE.TorusGeometry(r, r * 0.07, 6, 22), new THREE.CylinderGeometry(r * 0.16, r * 0.16, r * 0.3, 10).rotateX(Math.PI / 2)]; for (let k = 0; k < 3; k++) parts.push(new THREE.BoxGeometry(r * 2, r * 0.07, r * 0.07).rotateZ((k * Math.PI) / 3));
      parts.forEach((geo) => { geo.rotateY(yaw); geo.translate(x, y, z); const ng = geo.toNonIndexed(); ng.deleteAttribute('normal'); ng.computeVertexNormals(); add(ng, m, (px, py, pz) => [px + Math.sin(yaw) * 2, py, pz + Math.cos(yaw) * 2]); }); };   // facing along yaw
    // colliders: boxes turned to a direction in this frame, marked as the canal's own
    const rbox = (x, z, hx, hz, dx, dz, y0 = -1e9, y1 = 1e9) => { const b = p.addBox(x, z, hx, hz, y0, y1), al = p.rot - Math.atan2(dz, dx); b.c = Math.cos(al); b.s = Math.sin(al); b.cn = 1; return b; };
    const alongBox = (i0, i1, u, hz, y0, y1, step = 3) => { for (let i = i0; i < i1; i += step) { const j = Math.min(i1, i + step), a = pt(i, u), b = pt(j, u); rbox((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.hypot(b[0] - a[0], b[1] - a[1]) / 2 + 0.3, hz, b[0] - a[0], b[1] - a[1], y0, y1); } };
    const chBox = (s0, s1, b0, b1, y0 = -1e9, y1 = 4.5) => { const [x, z] = ch((s0 + s1) / 2, (b0 + b1) / 2); return rbox(x, z, (s1 - s0) / 2, (b1 - b0) / 2, e1[0], e1[1], y0, y1); };
    // the light shafts' heads, out on the hill: a stone collar from below the grass to above it, a grating, the beam down to the water
    const beams = [], beamM = (() => { const c = document.createElement('canvas'); c.width = 4; c.height = 128; const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.05, 'rgba(255,255,255,.7)'); gr.addColorStop(0.35, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 4, 128); const m = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), color: new THREE.Color('#fff0d0').convertSRGBToLinear().multiplyScalar(0.08), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }); m.userData.lin = true; return m; })();
    const shaftHead = (B, cx, cz, top, bot, yaw, w) => { const yv = [Math.cos(yaw), Math.sin(yaw)], at2 = (ox, oz) => [cx + ox * yv[0] + oz * yv[1], cz - ox * yv[1] + oz * yv[0]];
      for (const [ox, oz, ww, dd] of [[0, w / 2 + 0.35, w + 1.4, 0.7], [0, -w / 2 - 0.35, w + 1.4, 0.7], [w / 2 + 0.35, 0, 0.7, w], [-w / 2 - 0.35, 0, 0.7, w]]) { const [x, z] = at2(ox, oz); B.box(ww, top - bot, dd, x, (top + bot) / 2, z, collarM).rotation.y = yaw; }
      for (let k = -2; k <= 2; k++) { const [x1, z1] = at2((k * w) / 5, 0), [x2, z2] = at2(0, (k * w) / 5); B.box(0.08, 0.1, w + 0.2, x1, top - 0.05, z1, ironO).rotation.y = yaw; B.box(w + 0.2, 0.1, 0.08, x2, top - 0.02, z2, ironO).rotation.y = yaw; }
      const bm = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.5, w * 0.62, top - 0.1, 4, 1, true), beamM); bm.position.set(cx, (top - 0.1) / 2 + 0.05, cz); bm.rotation.y = yaw + Math.PI / 4; g.add(bm); beams.push(bm); };

    /* ---- where the light comes from (all of it before anything is baked) ---- */
    const niches = [];
    for (let v = S[iW] + 4, k = 0; v < S[iP] - 3; v += 7, k++) { const i = iAt(v); if (i > iP - 3) continue; const ok = (j, sd) => !(sd > 0 && j >= IA - 1 && j <= IB + 1) && inSq(...pt(j, sd * BW)) < 0; if (ok(i, 1)) niches.push([i, 1]); const j = Math.min(iP - 3, i + 3); if (k % 2 && ok(j, -1)) niches.push([j, -1]); }
    niches.forEach(([i, sd]) => { const [x, z] = pt(i, sd * (BW - 0.25)); lamp(x, 2.35, z, 1.0, 2.3); });
    for (const [s, b, y] of [[SC - BW - 0.9, BP - 0.3, 3.6], [SC + BW + 0.6, BP - 0.3, 3.6], [-H2 + 0.3, 6.3, 3.4], [H2 - 0.3, -5.9, 3.4], [0, BM + 0.3, 3.6], [-2.6, 7.6, 4.6]]) { const [x, z] = ch(s, b); lamp(x, y, z, 1.25, 3.2); bulb(x, y, z, 0.14); }
    { const [x, z] = ch((RM.s0 + RM.s1) / 2, (RM.b0 + RM.b1) / 2); lamp(x, RM.top - 0.5, z, 0.6, 2.0); bulb(x, RM.top - 0.25, z, 0.11); }
    { const [x, z] = pt(IA + 2, BW + BD - 0.15); lamp(x, SY - 0.35, z, 1.0, 2.0); bulb(x, SY - 0.35, z, 0.1); }
    const RL = [first + 2, last - 2]; for (const i of RL) for (const sd of [-1, 1]) { const [x, z] = P[i], [tx, tz] = tanP(i), lx = x - tz * sd * (RV - 0.25), lz = z + tx * sd * (RV - 0.25); lamp(lx, 3.6, lz, 0.9, 2.6); bulb(lx, 3.6, lz, 0.12); tb(0.3, 0.08, 0.3, lx, 3.78, lz, 0, ironM); }   // the river bore's own lamps
    const SH0 = ch((SHF[0] + SHF[1]) / 2, (SHF[2] + SHF[3]) / 2); day(SH0[0], CH - 0.4, SH0[1], 1.0, 2.6); day(SH0[0], 0.4, SH0[1], 0.8, 2.6);
    SQ.forEach(([x0, z0, x1, z1]) => { const c = W2L((x0 + x1) / 2, (z0 + z1) / 2); day(c[0], CY + 0.5, c[1], 0.45, 2.0); day(c[0], 0.6, c[1], 0.45, 2.0); });
    for (const i of [first, last]) { const [x, z] = P[i], [tx, tz] = tanP(i), s2 = i === first ? -1 : 1; day(x + tx * s2 * 2, 2.6, z + tz * s2 * 2, 1.4, 4.5); }   // the river's portals
    { const [x, z] = pt(iP, 0); day(x + T[iP][0] * 2, 2.8, z + T[iP][1] * 2, 1.5, 4.5); }   // the canal's

    /* ---- the river's bore, relined: brick on its old profile, its water dark; cut away where the chamber opens ---- */
    const RSEG = 12, rsec = (i, k) => { const a = Math.PI * (k / RSEG), sx = Math.cos(a) * RV, y = k === 0 || k === RSEG ? -0.8 : 1.6 + Math.sin(a) * (HV - 1.6), [x, z] = P[i], q = i === I0 || i === I1 ? e2 : (([tx, tz]) => [-tz, tx])(tanP(i)); return [x + q[0] * sx, y, z + q[1] * sx]; };
    for (const [i0, i1] of [[first, I0], [I1, last]]) {
      const pos = [], uv = [], idx = []; for (let i = i0; i <= i1; i++) { for (let k = 0; k <= RSEG; k++) { pos.push(...rsec(i, k)); uv.push((i * 1.5) / 2, (k * 1.4) / 2); } if (i < i1) for (let k = 0; k < RSEG; k++) { const b = (i - i0) * (RSEG + 1) + k, c = b + RSEG + 1; idx.push(b, c, b + 1, b + 1, c, c + 1); } }
      add(geoOf(pos, uv, idx), brickM, (x, y, z) => { let b = 1e9, bi = 0; for (let i = i0; i <= i1; i++) { const d = Math.hypot(P[i][0] - x, P[i][1] - z); if (d < b) { b = d; bi = i; } } return [P[bi][0], 2.6, P[bi][1]]; });
      const wp = [], wu = [], wi = []; for (let i = i0; i <= i1; i++) { const q = i === I0 || i === I1 ? e2 : (([tx, tz]) => [-tz, tx])(tanP(i)); for (const sd of [-1, 1]) { wp.push(P[i][0] + q[0] * sd * (RV + 0.05), 0.05, P[i][1] + q[1] * sd * (RV + 0.05)); wu.push(0, 0); } if (i < i1) { const k = (i - i0) * 2; wi.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); } }
      add(geoOf(wp, wu, wi), waterM, up, true);
    }

    /* ---- the chamber ---- */
    const RIV = Array.from({ length: RSEG + 1 }, (_, k) => { const a = Math.PI * (k / RSEG); return [Math.cos(a) * RV, k === 0 || k === RSEG ? -0.8 : 1.6 + Math.sin(a) * (HV - 1.6)]; });   // the river's arch (b, y)
    const VA = Array.from({ length: 13 }, (_, k) => [-BW * Math.cos((Math.PI * k) / 12), SY + (CY - SY) * Math.sin((Math.PI * k) / 12)]);   // the canal's vault, left springing to right (u, y)
    const CAN = [[-BW, -0.8], ...VA, [BW, -0.8]];   // the canal's section
    const wallR = (b0, b1) => [[b0, -1], [b1, -1], [b1, CH], [b0, CH]];
    add(face(wallR(BM, BP), [RIV, [[RM.door[0], TY], [RM.door[1], TY], [RM.door[1], TY + 2.3], [RM.door[0], TY + 2.3]]], (b) => ch(-H2, b), 2), brickM, inChamber);   // upstream: the river's arch, the pump room's door
    add(face(wallR(BM, BP), [RIV], (b) => ch(H2, b), 2), brickM, inChamber);   // downstream: the river's way on to the sea
    add(face(wallR(-H2, H2), [CAN.map(([u, y]) => [SC - u, y])], (s) => ch(s, BP), 2), brickM, inChamber);   // the canal's arch
    add(face(wallR(-H2, H2), [], (s) => ch(s, BM), 2), brickM, inChamber);   // the far wall
    add(slab([[-H2, BM], [H2, BM], [H2, BP], [-H2, BP]], [[[SHF[0], SHF[2]], [SHF[1], SHF[2]], [SHF[1], SHF[3]], [SHF[0], SHF[3]]]], CH, 2), brickM, inChamber);   // the ceiling, open to the grating's shaft
    add(slab([[-H2, LB], [SC - KE, LB], [SC - KE, BP], [-H2, BP]], [], TY, 1.6), paveM, inChamber, true);   // the landing
    add(slab([[-H2, BM], [H2, BM], [H2, LG], [-H2, LG]], [], TY, 1.6), paveM, inChamber);   // the far ledge
    add(face([[-H2, -0.8], [STP[0], -0.8], [STP[0], TY], [-H2, TY]], [], (s) => ch(s, LB), 2), stoneM, inChamber); add(face([[STP[1], -0.8], [SC - KE, -0.8], [SC - KE, TY], [STP[1], TY]], [], (s) => ch(s, LB), 2), stoneM, inChamber); add(face([[STP[0], TY - 0.2], [STP[1], TY - 0.2], [STP[1], TY], [STP[0], TY]], [], (s) => ch(s, LB), 2), stoneM, inChamber);   // the landing's edge
    add(face([[LB, -0.8], [BP, -0.8], [BP, TY], [LB, TY]], [], (b) => ch(SC - KE, b), 2), stoneM, inChamber); add(face([[-H2, -0.8], [H2, -0.8], [H2, TY], [-H2, TY]], [], (s) => ch(s, LG), 2), stoneM, inChamber);
    add(face([[LB, -0.8], [BP, -0.8], [BP, CH], [LB, CH]], [], (b) => ch(SC + BW, b), 2), brickM, inChamber); add(face([[SC + BW, -0.8], [H2, -0.8], [H2, CH], [SC + BW, CH]], [], (s) => ch(s, LB), 2), brickM, inChamber);   // the pier between the canal's mouth and the river's way out
    add(slab([[-H2 - 0.6, LG - 0.1], [H2 + 0.6, LG - 0.1], [H2 + 0.6, LB + 0.1], [SC + BW, LB + 0.1], [SC + BW, BP + 0.4], [SC - KE - 0.05, BP + 0.4], [SC - KE - 0.05, LB + 0.1], [-H2 - 0.6, LB + 0.1]], [], 0.05, 4), waterM, up, true);
    for (let k = 0; k < 4; k++) { const h = TY * (1 - (k + 1) / 4.5), [x, z] = ch((STP[0] + STP[1]) / 2, LB - 0.225 - k * 0.45); tb(0.45, h + 0.8, STP[1] - STP[0], x, (h - 0.8) / 2, z, yS, stoneM); }   // steps into the water
    for (let s = -H2 + 1.2; s < H2 - 0.5; s += 2.6) { const [x, z] = ch(s, (BM + BP) / 2); tb(0.3, 0.45, BP - BM, x, CH - 0.25, z, yB, ironM); }   // girders under the ceiling
    // the grating's shaft up to the hilltop
    { const top = Math.max(...[[SHF[0], SHF[2]], [SHF[1], SHF[2]], [SHF[1], SHF[3]], [SHF[0], SHF[3]]].map(([s, b]) => o.height(...ch(s, b)))) + 0.35, bot = Math.min(...[[SHF[0], SHF[2]], [SHF[1], SHF[3]]].map(([s, b]) => o.height(...ch(s, b)))) - 0.5, w = SHF[1] - SHF[0];
      day(SH0[0], top - 1, SH0[1], 1.3, 2.2);
      for (const [a, sd] of [[0, -1], [0, 1], [1, -1], [1, 1]]) add(face([[-w / 2, CH - 0.2], [w / 2, CH - 0.2], [w / 2, bot + 0.3], [-w / 2, bot + 0.3]], [], a ? (t) => ch((SHF[0] + SHF[1]) / 2 + t, sd > 0 ? SHF[3] : SHF[2]) : (t) => ch(sd > 0 ? SHF[1] : SHF[0], (SHF[2] + SHF[3]) / 2 + t), 2), stoneM, () => [SH0[0], (CH + top) / 2, SH0[1]]);
      shaftHead(OB, SH0[0], SH0[1], top, bot, yS, w);
      for (let y = CH + 0.3; y < bot; y += 0.32) { const [x, z] = ch(SHF[0] + 0.12, (SHF[2] + SHF[3]) / 2); tb(0.05, 0.05, 0.5, x, y, z, yS, ironM); } }   // rungs up it
    // the sluice at the canal's mouth: iron guides either side of the arch, the gate wound up under the ceiling, its gear on the landing
    { const b = BP - 0.25; for (const s of [SC - BW - 0.2, SC + BW + 0.2]) { const [x, z] = ch(s, b); tb(0.4, CH + 0.8, 0.45, x, CH / 2 - 0.4, z, yS, ironM); }
      { const [x, z] = ch(SC + 1.2, b - 0.15); tb(0.18, 1.9, 5.2, x, CH - 1.25, z, yS, rustM); for (let k = 0; k < 4; k++) tb(0.26, 0.12, 5.3, x, CH - 2.1 + k * 0.55, z, yS, ironM); }
      { const [x, z] = ch(SC - BW - 1.1, BP - 0.7); wheel(x, TY + 1.7, z, yB + Math.PI, 0.62); tb(0.36, 1.7, 0.36, x, TY + 0.85, z, yS, ironM); chBox(SC - BW - 1.4, SC - BW - 0.8, BP - 1.0, BP - 0.4); } }
    // the pump room: brick walls and vault, a plank floor, a pump with its wheel, a desk and its lamp, pipes, a ladder to a hatch
    { const { s0, s1, b0, b1, top } = RM, inR = () => { const [x, z] = ch((s0 + s1) / 2, (b0 + b1) / 2); return [x, 2, z]; };
      add(slab([[s0, b0], [s1, b0], [s1, b1], [s0, b1]], [], TY, 1.2), woodM, inR, true); add(slab([[s0, b0], [s1, b0], [s1, b1], [s0, b1]], [], top, 2), brickM, inR);
      add(face([[s0, -0.8], [s1, -0.8], [s1, top + 0.2], [s0, top + 0.2]], [], (s) => ch(s, b0), 2), brickM, inR); add(face([[s0, -0.8], [s1, -0.8], [s1, top + 0.2], [s0, top + 0.2]], [], (s) => ch(s, b1), 2), brickM, inR); add(face([[b0, -0.8], [b1, -0.8], [b1, top + 0.2], [b0, top + 0.2]], [], (b) => ch(s0, b), 2), brickM, inR);
      { const [x, z] = ch(s0 + 1.1, b0 + 0.9); tb(1.0, 1.1, 1.3, x, TY + 0.55, z, yS, ironM); tb(0.9, 0.9, 0.9, x, TY + 1.4, z, yS, copperM); tb(0.12, 1.8, 0.12, x, TY + 2.2, z, yS, brassM); chBox(s0 + 0.4, s0 + 1.8, b0, b0 + 1.6); }   // the pump
      { const [x, z] = ch(s0 + 2.7, b0 + 0.16); wheel(x, TY + 1.5, z, yB, 0.55); }   // its wheel, on the wall
      { const [x, z] = ch(s1 - 1.0, b1 - 0.55); tb(0.8, 0.08, 1.4, x, TY + 0.78, z, yS, woodM); for (const [ds2, db] of [[-0.6, -0.3], [0.6, -0.3], [-0.6, 0.3], [0.6, 0.3]]) { const [x2, z2] = ch(s1 - 1.0 + ds2, b1 - 0.55 + db); tb(0.06, 0.76, 0.06, x2, TY + 0.38, z2, 0, woodM); } const [x3, z3] = ch(s1 - 1.3, b1 - 0.55); bulb(x3, TY + 1.0, z3, 0.08); lamp(x3, TY + 1.0, z3, 0.5, 1.2); const [x4, z4] = ch(s1 - 0.7, b1 - 0.55); tb(0.35, 0.3, 0.45, x4, TY + 0.97, z4, yS, plateM); chBox(s1 - 1.8, s1 - 0.2, b1 - 1.0, b1); }   // the desk, its lamp, a ledger box
      for (let y = TY + 0.3; y < top; y += 0.3) { const [x, z] = ch(s0 + 0.12, b1 - 0.9); tb(0.05, 0.05, 0.45, x, y, z, yB, ironM); }   // the ladder to a hatch
      { const [x, z] = ch(s0 + 0.5, b1 - 0.9); tb(0.9, 0.08, 0.9, x, top - 0.02, z, yS, ironM); }
      { const [x, z] = ch((s0 + s1) / 2, b0 + 0.18); tb(0.14, 0.14, s1 - s0, x, top - 0.4, z, yS, copperM); tb(0.18, 0.18, s1 - s0, x, top - 0.75, z, yS, ironM); }
      chBox(s0, s1, b0 - 0.4, b0); chBox(s0 - 0.4, s0, b0, b1); }
    // the chamber's colliders: kerbs at the water's edges (low: they keep walkers out of the water and boats on it), the walls
    chBox(-H2, STP[0], LB - 0.1, LB + 0.14, -1e9, 1.0); chBox(STP[1], SC - KE, LB - 0.1, LB + 0.14, -1e9, 1.0); chBox(SC - KE - 0.14, SC - KE + 0.1, LB, BP + 0.3, -1e9, 1.0); chBox(-H2, H2, LG - 0.14, LG + 0.1, -1e9, 1.0);
    chBox(-H2 - 0.4, -H2, RV, RM.door[0]); chBox(-H2 - 0.4, -H2, RM.door[1], BP); chBox(-H2 - 0.4, -H2, BM, -RV); chBox(H2, H2 + 0.4, BM, -RV);
    chBox(SC + BW, H2, LB, BP); chBox(-H2, SC - BW, BP, BP + 0.5); chBox(-H2, H2, BM - 0.5, BM);
    { const pl = new THREE.PointLight(new THREE.Color('#ffb46a').convertSRGBToLinear(), 1.3, 24, 1.6), [x, z] = ch(0, 3); pl.position.set(x, 4.6, z); g.add(pl); }   // for whatever moves in here (you, a boat)

    /* ---- the bore under the hills ---- */
    const LIN = [[-BW, -0.8], ...VA, [BW, TY - 0.05]];
    const shaftQuad = (i, k) => { if (k === 0 || k >= LIN.length - 2) return false; const [uA] = LIN[k], [uB] = LIN[k + 1]; return [pt(i, uA), pt(i, uB), pt(i + 1, uA), pt(i + 1, uB)].every(([x, z]) => inSq(x, z) >= 0); };
    add(ribbon(iW, iP, () => LIN, 2, (i, k) => (k === LIN.length - 2 && i >= IA && i < IB) || shaftQuad(i, k)), brickM, inCanal);
    add(ribbon(iW, iP, () => [[BW, TY], [KE + 0.35, TY]], 1.6), paveM, inCanal, true);
    add(ribbon(iW, iP, () => [[KE + 0.35, TY], [KE + 0.35, TY + 0.07], [KE, TY + 0.07], [KE, -0.8]], 2), stoneM, inCanal);
    add(ribbon(iW, iP, () => [[-BW - 0.05, 0.05], [KE + 0.05, 0.05]], 4), waterM, up, true);
    alongBox(iW, IA, BW + 0.45, 0.45, -1e9, 4.5, 4); alongBox(IB, iP, BW + 0.45, 0.45, -1e9, 4.5, 4); alongBox(iW, iP, -BW - 0.45, 0.45, -1e9, 4.5, 4); alongBox(iW, iM, KE + 0.12, 0.12, -1e9, 1.0);   // walls long enough for the camera to keep inside them; the kerb low, out of its way
    // the sluice-keeper's bay: a recess off the towpath with a bench, a tool rack, a stove, the wheel of the sluice beside it
    { const a0 = pt(IA, BW), a1 = pt(IB, BW), tx = a1[0] - a0[0], tz = a1[1] - a0[1], L = Math.hypot(tx, tz), ux = tx / L, uz = tz / L, rx = -uz, rz = ux, c = (f, d) => [a0[0] + tx * f + rx * d, a0[1] + tz * f + rz * d], inB = () => { const [x, z] = c(0.5, 0.8); return [x, 1.8, z]; }, yb = Math.atan2(ux, uz);
      const qd = (q, tile) => { const pos = [], uv = []; q.forEach(([x, y, z], k) => { pos.push(x, y, z); uv.push(k === 1 || k === 2 ? L / tile : 0, k >= 2 ? 2 / tile : 0); }); return geoOf(pos, uv, [0, 1, 2, 0, 2, 3]); };
      const b0 = c(0, BD), b1 = c(1, BD);
      add(qd([[b0[0], -0.2, b0[1]], [b1[0], -0.2, b1[1]], [b1[0], SY, b1[1]], [b0[0], SY, b0[1]]], 2), brickM, inB);
      add(qd([[a0[0], -0.2, a0[1]], [b0[0], -0.2, b0[1]], [b0[0], SY, b0[1]], [a0[0], SY, a0[1]]], 2), brickM, inB); add(qd([[a1[0], -0.2, a1[1]], [b1[0], -0.2, b1[1]], [b1[0], SY, b1[1]], [a1[0], SY, a1[1]]], 2), brickM, inB);
      add(qd([[a0[0], SY, a0[1]], [a1[0], SY, a1[1]], [b1[0], SY, b1[1]], [b0[0], SY, b0[1]]], 2), brickM, inB); add(qd([[a0[0], TY, a0[1]], [a1[0], TY, a1[1]], [b1[0], TY, b1[1]], [b0[0], TY, b0[1]]], 1.6), paveM, inB, true);
      { const [x, z] = c(0.5, BD - 0.3); tb(0.4, 0.08, 1.6, x, TY + 0.45, z, yb, woodM); tb(0.36, 0.45, 0.08, ...[x, TY + 0.22, z], yb, woodM); }   // the bench
      { const [x, z] = c(0.18, BD - 0.06); tb(0.05, 1.2, 1.0, x, TY + 1.4, z, yb, woodM); for (let k = 0; k < 5; k++) { const [x2, z2] = c(0.08 + k * 0.05, BD - 0.14); tb(0.04, 1.0 + (k % 2) * 0.2, 0.04, x2, TY + 1.3, z2, yb, k % 2 ? ironM : woodM); } }   // the tool rack
      { const [x, z] = c(0.86, BD - 0.5); tb(0.6, 0.8, 0.6, x, TY + 0.4, z, yb, ironM); tb(0.12, 1.4, 0.12, x, TY + 1.5, z, 0, ironM); bulb(x, TY + 0.45, z, 0.09); rbox(x, z, 0.45, 0.45, ux, uz, -1e9, 4.5); }   // the stove, a glow at its door
      { const [x, z] = c(0.15, 1.3); wheel(x, TY + 1.35, z, yb, 0.6); tb(0.3, 1.3, 0.3, x, TY + 0.65, z, 0, ironM); rbox(x, z, 0.4, 0.4, ux, uz, -1e9, 4.5); }   // the sluice's winding wheel
      rbox(...c(0.5, BD + 0.4), L / 2 + 0.6, 0.4, ux, uz, -1e9, 4.5); rbox(...c(0, BD / 2), BD / 2 + 0.3, 0.3, rx, rz, -1e9, 4.5); rbox(...c(1, BD / 2), BD / 2 + 0.3, 0.3, rx, rz, -1e9, 4.5);
      // the sluice across the canal beside the bay: guides on both walls, the gate wound up under the vault
      { const k = IB + 2, yk = yawT(k); for (const u of [-BW + 0.2, BW - 0.2]) { const [x, z] = pt(k, u); tb(0.3, SY + 0.8, 0.45, x, (SY + 0.8) / 2 - 0.8, z, yk, ironM); } const [xc, zc] = pt(k, -0.8); tb(4.0, 0.7, 0.22, xc, SY + 0.6, zc, yk, rustM); tb(4.2, 0.12, 0.3, xc, SY + 0.98, zc, yk, ironM); } }
    // the lamps in their niches
    niches.forEach(([i, sd]) => { const [x, z] = pt(i, sd * (BW - 0.04)), [x2, z2] = pt(i, sd * (BW - 0.1)), [x4, z4] = pt(i, sd * (BW - 0.25)), y = yawT(i); tb(0.06, 1.0, 0.7, x, 2.15, z, y, voidM); tb(0.14, 0.12, 0.95, x2, 2.7, z2, y, stoneM); for (const o2 of [-0.42, 0.42]) tb(0.14, 1.1, 0.14, x2 + T[i][0] * o2, 2.1, z2 + T[i][1] * o2, y, stoneM); bulb(x4, 2.35, z4, 0.1); tb(0.22, 0.05, 0.22, x4, 2.55, z4, y, brassM); });
    // pipes along the left wall on brackets, a cable along the right, enamel plates with the metres from the chamber, bollards
    { const pipe = (u, y, r, m) => { const pts = []; for (let i = iW + 1; i <= iP - 1; i += 2) { const [x, z] = pt(i, u); pts.push(new THREE.Vector3(x, y, z)); } add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, r, 7, false), m, inCanal); };
      pipe(-BW + 0.3, 3.15, 0.16, copperM); pipe(-BW + 0.28, 2.7, 0.11, ironM); pipe(BW - 0.08, 2.75, 0.035, ironM);
      for (let i = iW + 2; i < iP - 1; i += 3) { const [x, z] = pt(i, -BW + 0.18), y = yawT(i); tb(0.36, 0.06, 0.08, x, 2.95, z, y, ironM); tb(0.36, 0.06, 0.08, x, 2.5, z, y, ironM); if ((i - iW) % 12 === 2) { const [x2, z2] = pt(i, -BW + 0.48); tb(0.08, 0.5, 0.5, x2, 3.15, z2, y, brassM); } }
      for (let v = 25; v < S[iP] - S[iW]; v += 25) { const i = iAt(S[iW] + v); if (i >= IA - 1 && i <= IB + 1) continue; const [x, z] = pt(i, BW - 0.03), m = new THREE.MeshBasicMaterial({ map: E.textTex(`${v} m`, { w: 256, h: 128, color: '#f2ead8', bg: '#1f3f6a', font: '700 72px "Hind",sans-serif' }), fog: false }), cc = bake(x, 1.8, z, -R[i][0], 0, -R[i][1], [0, 0, 0], 0); m.color.setRGB(Math.min(1, cc[0] * 1.6), Math.min(1, cc[1] * 1.6), Math.min(1, cc[2] * 1.6)); m.userData.lin = true; const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), m); pl.position.set(x, 1.85, z); pl.rotation.y = yawT(i) + Math.PI / 2; g.add(pl); }
      for (let i = iW + 5; i < iP - 2; i += 9) { if (i >= IA - 1 && i <= IB + 1) continue; const [x, z] = pt(i, KE + 0.3); tb(0.2, 0.36, 0.2, x, TY + 0.18, z, 0, ironM); } }

    /* ---- out of the hill: the open cutting across SHOT's way, in the day ---- */
    const PH = 1.6, gapST = (i) => Math.abs(S[i] - S[iST]) < 0.95;
    addO(ribbon(iP, iE, () => [[-BW, -0.8], [-BW, PH], [-BW - 0.55, PH], [-BW - 0.55, -0.6]], 2), brickO);
    addO(ribbon(iP, iE, () => [[BW, TY - 0.05], [BW, TY + 0.6], [BW + 0.55, TY + 0.6], [BW + 0.55, -0.6]], 2, (i) => gapST(i) || gapST(i + 1)), brickO);
    addO(ribbon(iP, iE, () => [[BW, TY], [KE + 0.35, TY]], 1.6), paveO, true);
    addO(ribbon(iP, iE, () => [[KE + 0.35, TY], [KE + 0.35, TY + 0.07], [KE, TY + 0.07], [KE, -0.8]], 2), stoneO);
    { const wm = E.gloss('#1d3a4c', { rough: 0.12, metal: 0.2, env: 1.1 }); wm.side = THREE.DoubleSide; wm.normalMap = E.waterN; wm.normalScale.set(0.55, 0.55); addO(ribbon(iP, iE, () => [[-BW - 0.05, 0.05], [KE + 0.05, 0.05]], 14), wm, true).castShadow = false; }
    alongBox(iP, iE, -BW - 0.3, 0.3, -1e9, 2.6, 4); alongBox(iP, iST - 1, BW + 0.28, 0.28, -1e9, 2.6, 4); alongBox(iST + 2, iE, BW + 0.28, 0.28, -1e9, 2.6, 4);
    for (let i = iP + 1; i < iE; i += 2) { if (gapST(i)) continue; const [x, z] = pt(i, BW + 0.27); ob(0.08, 1.0, 0.08, x, TY + 1.1, z, ironO); }   // the railing on the towpath's parapet
    { let rl = []; const flushR = () => { if (rl.length > 1) g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rl.map(([x, z]) => new THREE.Vector3(x, TY + 1.58, z))), rl.length * 2, 0.04, 5), ironO)); rl = []; }; for (let i = iP + 1; i <= iE; i++) { if (gapST(i)) { flushR(); continue; } rl.push(pt(i, BW + 0.27)); } flushR(); }
    for (let k = 0; k < 4; k++) { const h = TY * (1 - (k + 1) / 4.6), [x, z] = pt(iST, BW + 0.35 + k * 0.5); ob(0.52, h + 0.6, 1.6, x, (h - 0.6) / 2, z, stoneO).rotation.y = yawT(iST); }   // steps down to SHOT's way
    for (const sd of [-1, 1]) { const [x, z] = pt(iST, BW + 1.2); rbox(x + T[iST][0] * sd * 1.0, z + T[iST][1] * sd * 1.0, 1.3, 0.12, R[iST][0], R[iST][1], -1e9, 2.6); }
    for (const v of [S[iP] + 4, S[iST] + 5]) { const i = iAt(v), [x, z] = pt(i, BW + 0.27); ob(0.14, 3.2, 0.14, x, TY + 1.6, z, ironO); ob(0.5, 0.12, 0.12, x - R[i][0] * 0.2, TY + 3.15, z - R[i][1] * 0.2, ironO).rotation.y = yawT(i); const lt = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), glowM); lt.position.set(x - R[i][0] * 0.42, TY + 2.95, z - R[i][1] * 0.42); g.add(lt); }   // two lamp posts
    // the sluice by the portal: an iron gantry over the water, the gate wound up into it, its wheel
    { const k = iP + 4, yk = yawT(k); for (const u of [-BW - 0.25, BW + 0.25]) { const [x, z] = pt(k, u); ob(0.35, 5.8, 0.35, x, 2.6, z, ironO).rotation.y = yk; } const [xc, zc] = pt(k, 0); ob(2 * BW + 1.2, 0.5, 0.45, xc, 5.4, zc, ironO).rotation.y = yk; const [xg, zg] = pt(k, -1.2); ob(4.9, 1.7, 0.22, xg, 4.3, zg, E.mat('#7a4a30', { rough: 0.8, metal: 0.3 })).rotation.y = yk; const [xw, zw] = pt(k, BW + 0.25); const wh = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.06, 6, 18), E.mat('#c09848', { metal: 0.85, rough: 0.3 })); wh.position.set(xw, 4.4, zw); wh.rotation.y = yk; g.add(wh); }
    // SHOT's ramp over the cutting: a pier either side of the canal, and its walls opened between them for the canal to run under
    if (RP) {
      // the span: wherever the canal and its parapets pass under any of the ramp's width (the cutting crosses it on the slant,
      // its north edge under the walkway's end), so neither pier stands in the water or on a parapet
      const rl = (lz, lx = 0) => { const w = RP.place.toWorld(lx, lz); return W2L(w.x, w.z); }, top = RP.y(RP.z0);
      let za = null, zb = null; for (let lz = RP.z0 - 6; lz < RP.z1 - 0.5; lz += 0.1) for (const lx of [-RP.hw - 0.25, 0, RP.hw + 0.25]) { const [x, z] = rl(lz, lx), q = near(x, z); if (zone(q.i) !== 2 || Math.abs(q.u) > BW + 0.65) continue; if (za == null) za = lz; zb = lz; }
      if (za != null) { za -= 0.55; zb += 0.55; const yawR = RP.place.rot - p.rot;
        for (const lz of [za, zb]) { const [x, z] = rl(lz), h = Math.min(top, RP.y(lz)) - 0.5; ob(RP.hw * 2 + 0.4, h, 0.9, x, h / 2, z, stoneO).rotation.y = yawR; const w = RP.place.toWorld(0, lz), b = p.addBox(0, 0, RP.hw + 0.25, 0.5, -1e9, h); Object.assign(b, { x: w.x, z: w.z, c: Math.cos(RP.place.rot), s: Math.sin(RP.place.rot), cn: 1 }); }   // (the north one under the walkway, up to its deck)
        RP.open(za, zb); } }
    /* ---- in the crater's cave: the towpath along its right side, to the quay ---- */
    addO(ribbon(iE, iM, () => [[3.95, TY], [KE + 0.35, TY]], 1.6), paveO, true); addO(ribbon(iE, iM, () => [[KE + 0.35, TY], [KE + 0.35, TY + 0.07], [KE, TY + 0.07], [KE, -0.8]], 2), stoneO);
    { const T1 = T[iM], q = (u, a, y) => { const [x, z] = pt(iM, u); return [x + T1[0] * a, y, z + T1[1] * a]; }, slabQ = (pts, m) => { const pos = [], uv = []; pts.forEach((v, k) => { pos.push(...v); uv.push(k === 1 || k === 2 ? 1 : 0, k >= 2 ? 1 : 0); }); addO(geoOf(pos, uv, [0, 1, 2, 0, 2, 3]), m); };
      slabQ([q(KE + 0.35, 0, TY - 0.005), q(3.95, 0, TY - 0.005), q(3.95, 1.6, TY - 0.005), q(KE + 0.35, 1.6, TY - 0.005)], paveO); slabQ([q(KE, 0, TY + 0.07), q(KE + 0.35, 0, TY + 0.07), q(KE + 0.35, 1.6, TY + 0.07), q(KE, 1.6, TY + 0.07)], stoneO); slabQ([q(KE, 0, -0.8), q(KE, 0, TY + 0.07), q(KE, 1.6, TY + 0.07), q(KE, 1.6, -0.8)], stoneO);
      const [x, z] = pt(iM, KE + 0.12); rbox(x + T1[0] * 0.8, z + T1[1] * 0.8, 1.1, 0.12, T1[0], T1[1], -1e9, 1.0); }   // on past the mouth to meet the quay
    OB.flush();
    flushTB(); flushQ();
    { const im = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), glowM, bulbs.length), o3 = new THREE.Object3D(); bulbs.forEach(([x, y, z, r], k) => { o3.position.set(x, y, z); o3.scale.setScalar(r); o3.updateMatrix(); im.setMatrixAt(k, o3.matrix); }); im.frustumCulled = false; g.add(im); }   // the bulbs, one draw

    /* ---- once the hills exist ---- */
    const afterHills = ({ groundAt, boxes, circles }) => {
      // whatever stands on the hill over the canal (rocks, KEYAKI's boulders, a brink post over the cave) only blocks up there;
      // in the open cutting, whatever stood on the ground where it now runs (stubs of wall under SHOT's walkway) only above it.
      // In the crater only what stands over the cave itself (back from its mouth), never the quay's posts round the lagoon;
      // and nothing a place marks keep (those posts, SHOT's ramp walls, which it opens for the canal itself).
      const topAt = (x, z, pad) => { const l = p.local(x, z), [s, b] = chIn(l.x, l.z); if (s > -H2 - pad && s < H2 + pad && b > BM - pad && b < BP + pad) return CH + 0.6; if (s > RM.s0 - pad && s < RM.s1 + pad && b > RM.b0 - pad && b < RM.b1 + pad) return RM.top + 0.6; const q = near(l.x, l.z), zn = zone(q.i); if (zn === 1 && q.u > -BW - pad && q.u < (q.i >= IA && q.i < IB ? BW + BD : BW) + pad) return CY + 0.6; if (zn === 3 && Math.abs(q.u) < 3.5 + pad && plane(iM, l.x, l.z)[0] < -0.5) return 6.2; if (zn === 2 && Math.abs(q.u) < BW + pad) return 2.6; return 0; };
      for (const c of circles) { if (c.cn || c.keep || (c.y1 !== undefined && c.y1 < 4.5)) continue; const top = topAt(c.x, c.z, c.r); if (top && !(c.y0 > top)) c.y0 = top; }
      for (const b of boxes) { if (b.cn || b.keep || (b.y1 !== undefined && b.y1 < 4.5)) continue; let top = 0; const cc = b.c ?? 1, ss = b.s ?? 0, st = Math.min(1, 1 / Math.max(b.hx, 0.5)); for (let a = -1; a <= 1.0001; a += st) for (const e of [-1, 0, 1]) { const ux = a * b.hx, uz = e * b.hz; top = Math.max(top, topAt(b.x + ux * cc + uz * ss, b.z - ux * ss + uz * cc, 0)); } if (top && !(b.y0 > top)) b.y0 = top; }
      const gw = (x, z) => { const w = p.toWorld(x, z); return groundAt(w.x, w.z); }, B2 = E.batch(g);
      // the portal out of the hill and the one into the crater wall: a face of masonry across the cutting, its top following the ground behind
      const portal = (i, dir, hole, wide, depth, m, sign) => {
        const tops = []; for (let u = -wide; u <= wide + 1e-6; u += 1) { let h = 0; for (const a of [0, -dir * depth * 0.5, -dir * depth]) { const [x, z] = pt(i, u); h = Math.max(h, gw(x + T[i][0] * a, z + T[i][1] * a)); } tops.push([u, Math.max(CY + 1.2, h + 0.5)]); }
        const sh = new THREE.Shape([new THREE.Vector2(-wide, -0.8), new THREE.Vector2(wide, -0.8), ...tops.slice().reverse().map(([u, y]) => new THREE.Vector2(u, y))]); sh.holes.push(new THREE.Path(hole.map(([u, y]) => new THREE.Vector2(u, y))));
        const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false }), pa = geo.attributes.position, uv = geo.attributes.uv;
        for (let k = 0; k < pa.count; k++) { const u = pa.getX(k), y = pa.getY(k), d = dir * (0.6 - pa.getZ(k)), [x, z] = pt(i, u); pa.setXYZ(k, x + T[i][0] * d, y, z + T[i][1] * d); }
        for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) / 2.5, uv.getY(k) / 2.5);
        geo.computeVertexNormals(); const mm = new THREE.Mesh(geo, m); mm.castShadow = mm.receiveShadow = true; g.add(mm);
        for (let k = 1; k < hole.length - 2; k++) { const [u0, y0] = hole[k], [u1, y1] = hole[k + 1], [x, z] = pt(i, (u0 + u1) / 2), dd = dir * 0.66; B2.box(Math.hypot(u1 - u0, y1 - y0) + 0.06, 0.42, 0.3, x + T[i][0] * dd, (y0 + y1) / 2, z + T[i][1] * dd, stoneB).rotation.set(0, yawT(i) + Math.PI, Math.atan2(y1 - y0, u1 - u0), 'YXZ'); }   // the arch's ring of dressed stone
        if (sign) { const [x, z] = pt(i, 0), top = Math.max(...hole.map(([, y]) => y)), sm = new THREE.MeshBasicMaterial({ map: E.textTex(sign, { w: 512, h: 110, color: '#efe2c4', bg: '#2a3a30', font: '700 64px "Hind",sans-serif' }) }), sg = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.56), sm); sg.position.set(x + T[i][0] * dir * 0.84, top + 0.75, z + T[i][1] * dir * 0.84); sg.rotation.y = yawT(i) + (dir > 0 ? 0 : Math.PI); g.add(sg); }
      };
      portal(iP, 1, CAN, BW + 3.2, 2.2, brickO, 'OHH CANAL  1898');
      { const W3 = CP.halfWidth + 0.5, VC = CP.vault, cave = Array.from({ length: 13 }, (_, k) => { const a = (Math.PI * k) / 12; return [-W3 * Math.cos(a), k === 0 || k === 12 ? -0.8 : 1.4 + Math.sin(a) * (VC - 1.4)]; }); portal(iE, -1, [[-W3, -0.8], ...cave.slice(1, -1), [W3, -0.8]], 7.5, 2.4, ds(E.mat('#5d554f', { map: E.tex('rock', 1, 1), rough: 0.95 })), 'TO OHH'); }
      // the shafts' heads on the hillside: lined from under the vault up to the grass, a stone collar, a grating, the beam;
      // the collar is old weathered stone, and where the slope leaves it standing proud a heap of rocks and some scrub hide its foot
      const heap = [], scrub = [], hr = E.rng(173);
      SQ.forEach(([x0, z0, x1, z1]) => {
        const hs = [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [(x0 + x1) / 2, z0], [x1, (z0 + z1) / 2], [(x0 + x1) / 2, z1], [x0, (z0 + z1) / 2]].map(([x, z]) => groundAt(x, z)), top = Math.max(...hs) + 0.4, bot = Math.min(...hs) - 0.4, c = W2L((x0 + x1) / 2, (z0 + z1) / 2), cn = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => W2L(x, z));
        day(c[0], bot - 0.6, c[1], 0.6, 2.0);
        for (let k = 0; k < 4; k++) { const a = cn[k], b = cn[(k + 1) % 4], L = Math.hypot(b[0] - a[0], b[1] - a[1]), pos = [], uv = [], idx = [], NS = 12;
          for (let j = 0; j <= NS; j++) { const t = j / NS, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, q = near(x, z), yb2 = zone(q.i) === 1 && Math.abs(q.u) < BW ? vaultY(q.u) - 0.06 : SY; pos.push(x, yb2, z, x, bot + 0.3, z); uv.push((t * L) / 2, yb2 / 2, (t * L) / 2, (bot + 0.3) / 2); if (j < NS) idx.push(j * 2, j * 2 + 2, j * 2 + 1, j * 2 + 1, j * 2 + 2, j * 2 + 3); }   // from the vault's surface along the edge up to the collar
          add(geoOf(pos, uv, idx), brickM, () => [c[0], (SY + top) / 2, c[1]]); }
        shaftHead(B2, c[0], c[1], top, bot, -p.rot, x1 - x0);
        for (let k = 0; k < 4; k++) { const [ax, az] = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]][k], [bx, bz] = [[x1, z0], [x1, z1], [x0, z1], [x0, z0]][k], nx = Math.sign(ax + bx - x0 - x1) * (k % 2 ? 1 : 0), nz = Math.sign(az + bz - z0 - z1) * (k % 2 ? 0 : 1);
          for (let t = -0.15; t <= 1.15; t += 0.2 + hr() * 0.12) { const o = 0.9 + hr() * 0.6, x = ax + (bx - ax) * t + nx * o, z = az + (bz - az) * t + nz * o, gh = groundAt(x, z), up = top - gh, l = W2L(x, z);
            if (up > 0.5) heap.push([l[0], gh - 0.2, l[1], 0.55 + hr() * 0.45, Math.min(1.0, up * 0.7) * (0.65 + hr() * 0.35), hr() * 6.3, (hr() - 0.5) * 0.5]); else if (hr() < 0.3) scrub.push([l[0], gh + 0.05, l[1], 0.35 + hr() * 0.35]); } }   // its foot: rocks where it stands proud, scrub elsewhere
        for (let k = 0; k < 6; k++) { const a = hr() * 6.3, d = (x1 - x0) / 2 + 2 + hr() * 2.5, x = (x0 + x1) / 2 + Math.cos(a) * d, z = (z0 + z1) / 2 + Math.sin(a) * d, l = W2L(x, z); scrub.push([l[0], groundAt(x, z) + 0.05, l[1], 0.4 + hr() * 0.5]); }
        const box = p.addBox(c[0], c[1], (x1 - x0) / 2 + 1.4, (z1 - z0) / 2 + 1.4, bot, 1e9); Object.assign(box, { c: 1, s: 0, cn: 1 });   // you walk round the head and its heap, not over them
        for (let y = CY; y < bot; y += 0.32) { const [x, z] = W2L((x0 + x1) / 2, z1 - 0.12); tb(0.5, 0.05, 0.05, x, y, z, -p.rot, ironM); }   // rungs up the shaft
      });
      { const o3 = new THREE.Object3D(), rockH = new THREE.InstancedMesh(E.rockGeo(4, true), E.mat('#8e8574', { map: E.tex('rock', 1, 1), rough: 0.95 }), heap.length), bush = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), E.mat('#4f6a34', { flat: true, rough: 1 }), scrub.length);
        heap.forEach(([x, y, z, r2, h, a, tl], k) => { o3.position.set(x, y, z); o3.rotation.set(tl, a, tl * 0.7); o3.scale.set(r2, h, r2 * 0.85); o3.updateMatrix(); rockH.setMatrixAt(k, o3.matrix); });
        scrub.forEach(([x, y, z, r2], k) => { o3.position.set(x, y, z); o3.rotation.set(0, k, 0); o3.scale.set(r2 * 1.3, r2 * 0.75, r2 * 1.1); o3.updateMatrix(); bush.setMatrixAt(k, o3.matrix); });
        for (const m of [rockH, bush]) { m.castShadow = m.receiveShadow = true; g.add(m); } }
      B2.flush(); flushTB(); flushQ();
    };
    const update = (t) => { waterM.uniforms.t.value = t; beams.forEach((b, k) => { b.scale.x = b.scale.z = 1 + Math.sin(t * 0.3 + k) * 0.03; }); };
    // the map: the canal and the chamber, faintly
    const mapPts = []; for (let i = iW; i <= iM; i++) mapPts.push(pt(i, -BW)); for (let i = iM; i >= iW; i--) mapPts.push(pt(i, BW));
    const map = [{ t: 'poly', x: 0, z: 0, pts: mapPts, c: 'rgba(96,140,180,.3)' }, { t: 'poly', x: 0, z: 0, pts: [ch(-H2, BM), ch(H2, BM), ch(H2, BP), ch(-H2, BP)], c: 'rgba(96,140,180,.3)' }];
    const chamberAt = (lx, lz) => { const [s, b] = chIn(lx, lz); return inCh(s, b) || inRoom(s, b); };
    const shaftHole = (lx, lz) => { const [s, b] = chIn(lx, lz); return s > SHF[0] && s < SHF[1] && b > SHF[2] && b < SHF[3]; };
    return { floor, ceil, water, carve, holeAt, cuts, blocks, noPier, map, afterHills, update, chamberAt, shaftHole, I0, I1, C, S, at, iW, iP, iE, iM, iST, pt, near, zone };
  }

  /* ------------------------------------------------------------------ */
  /* OHH — speeding along a coastal road through a gorge at golden hour  */
  /* ------------------------------------------------------------------ */
  PLACES.ohh = {
    build(p, E) {
      const g = p.group, r = E.rng(151);
      let chanMap = [], chanWater = null, cn = null; const harbourLamps = [], harbourBoats = [];   // cn: the old canal off the river tunnel (aqueduct, above)
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
      let chan = null, inChan = () => false, chanD = () => 1e9, inBore = () => false;
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
        // inside the bore, out to its walls (a little wider than the water, so as far as they let a craft go)
        inBore = (lx, lz) => { if (chan.first < 0) return false; let b = 1e9, bi = 0; P.forEach(([x, z], i) => { const d = Math.hypot(lx - x, lz - z); if (d < b) { b = d; bi = i; } }); return b < chan.W + 1.2 && bi >= chan.first && bi <= chan.last; };
        // under the hill the vault is the ceiling: the camera stays below it
        p.ceil = (lx, lz) => (inBore(lx, lz) ? 4.6 : null);
        if (chan.first >= 0 && SW.Caldera) cn = aqueduct(p, E, g, { P, W: chan.W, first: chan.first, last: chan.last, height });   // it relines the bore too (below, the old lining is left out)
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
      // On the lay-by and in front of its building you stand on the deck (it is built further down); below it, on the hill's
      // flanks or afloat in the channel, you stay on the hill or the water: inside the tunnel (low down, within the channel or
      // the bore right out to its walls, where the hill stands over you) the ground is the water; anywhere else, the hill.
      let PA = null;
      p.ground = (lx, lz, y) => (PA && PA.ground(lx, lz, y)) || (y !== undefined && y < 4 && (inChan(lx, lz) || inBore(lx, lz)) && height(lx, lz) > 0.2 ? 0 : heightC(lx, lz));
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
          if ((chanD(x, z) < chan.W + 1.4 && y < 7.2) || (cn && (cn.shaftHole(x, z) || cn.cuts([pa[i], pa[i + 2], -pa[i + 1], pa[i + 3], pa[i + 5], -pa[i + 4], pa[i + 6], pa[i + 8], -pa[i + 7]])))) continue;   // and the canal chamber's grating, and wherever it would stand in the canal (under the game's hills, past the fork)
          for (let k = 0; k < 9; k++) keep.push(pa[i + k]);
        }
        hgeo = new THREE.BufferGeometry(); hgeo.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
      }
      hgeo.computeVertexNormals();
      const hill = new THREE.Mesh(hgeo, E.mat('#b4c08e', { map: E.tex('grass', 16, 16), rough: 0.95 }));   // photographed grass (Poly Haven, CC0)
      hill.rotation.x = -Math.PI / 2; hill.receiveShadow = true; hill.name = 'ohhHill';
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
        // the water: a strip along the channel (out in the day; under the hill the canal draws its own, dark)
        { const wm = E.gloss('#1d3a4c', { rough: 0.12, metal: 0.2, env: 1.1 }); wm.side = THREE.DoubleSide;
          wm.normalMap = E.waterN; wm.normalScale.set(0.55, 0.55); chanWater = wm;   // only the channel scrolls this texture's offset; the shaders do their own
          for (const [i0, i1] of cn ? [[0, chan.first], [chan.last, n - 1]] : [[0, n - 1]]) {
            const pos = [], idx = [], uvs = [];
            for (let i = i0; i <= i1; i++) { const [x, z] = P[i], [tx, tz] = tan(i); pos.push(x - tz * W, 0.05, z + tx * W, x + tz * W, 0.05, z - tx * W); uvs.push((x - tz * W) / 14, (z + tx * W) / 14, (x + tz * W) / 14, (z - tx * W) / 14); if (i < i1) { const k = (i - i0) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); } }
            const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(idx); geo.computeVertexNormals();
            const w = new THREE.Mesh(geo, wm); w.receiveShadow = true; g.add(w); p.pick(w); }
          P.forEach(([x, z], i) => { if (i % 2 === 0) p.water(x, z, W - 0.6, W - 0.6); }); }
        // the tunnel: where the hill stands over the channel, a vaulted bore with lamps; a stone portal at each end
        const { first, last } = chan;
        if (first >= 0) {
          const R = W + 0.6, HV = 5.4, pos = [], idx = [], SEG = 12;
          if (!cn) {   // the plain lining, lamps and light (with the canal there, it relines the bore in brick)
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
          }
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
          // (the rims' rail is drawn, posts and a top rail following the ground: what stops you there is what you see)
          { const RB = E.batch(g), railR = E.mat('#9aa0a8', { metal: 0.6, rough: 0.4 }), rimAt = (i, sd) => { const [x, z] = P[i], [tx, tz] = tan(i), ox = x - tz * sd * (W + 3.2), oz = z + tx * sd * (W + 3.2), h = heightC(ox, oz); return i >= first && i <= last ? null : h > 1.2 ? [ox, h, oz] : null; };
            for (const sd of [-1, 1]) for (let i = 0; i < n; i++) {
              const a = rimAt(i, sd); if (!a) continue;
              RB.box(0.08, 1.0, 0.08, a[0], a[1] + 0.5, a[2], railR); p.addCircle(a[0], a[2], 0.35, 1.0, 1e9);
              const c = i + 1 < n ? rimAt(i + 1, sd) : null; if (!c) continue;
              const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2], len = Math.hypot(dx, dy, dz);
              const top = RB.box(0.07, 0.07, len, (a[0] + c[0]) / 2, (a[1] + c[1]) / 2 + 0.98, (a[2] + c[2]) / 2, railR); top.rotation.set(-Math.asin(dy / len), Math.atan2(dx, dz), 0, 'YXZ');
              p.addCircle((a[0] + c[0]) / 2, (a[2] + c[2]) / 2, 0.35, 1.0, 1e9);
            }
            RB.flush(); }
          // keep walkers and craft inside the bore: its walls are solid below the hill
          for (let i = first; i <= last; i++) { if (cn && i >= cn.I0 && i <= cn.I1) continue; const [x, z] = P[i], [tx, tz] = tan(i); for (const sd of [-1, 1]) p.addCircle(x - tz * sd * (R + 0.8), z + tx * sd * (R + 0.8), 1.1, -1e9, 4); }   // (the canal's chamber has walls of its own)
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
      // ...and where the hill comes up under the road closer than you could stand under its deck (1.3 m deep in the middle), you
      // stay off the road (1 m cells, run together in rows of up to 3 m, too small to pull the camera in). Further down the
      // flanks the deck stands clear above you and nothing stands in the way under it (no barrier where nothing shows): you walk
      // on under it, down to the sea side. Over the river's tunnel they only stop those up on the hill, so the craft can run out
      // of the tunnel to the sea.
      const noRoom = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, (z0 + z1) / 2]].some(([x, z]) => heightC(x, z) > RH - 1.3 - 1.8);
      for (const nearChan of [false, true]) for (let z = -19.9; z < -10.75; z += 0.92) {
        let run = null; const flush = () => { if (run) p.addBox((run[0] + run[1]) / 2, z + 0.46, (run[1] - run[0]) / 2, 0.46, nearChan ? 4 : -1e9, 1e9); run = null; };
        for (let x = -16; x < 16; x += 1) { if (!((chanD(x + 0.5, z + 0.46) < 6.5) === nearChan && noRoom(x, z, x + 1, z + 0.92))) flush(); else if (run && run[1] === x && x - run[0] < 3) run[1] = x + 1; else { flush(); run = [x, x + 1]; } }
        flush();
      }
      PA = parkingArea(p, E, g, { y: RH + 0.03, zr: -10.5, depth: 6.4, half: 18, taper: 10, name: 'OHH PA', kiosk: [9, 17], walkway: null, open: [[-9, 8.5]], slotX: 4, ground: (lx, lz) => heightC(lx, lz), skip: (lx, lz) => inChan(lx, lz) || chanD(lx, lz) < 7 });   // the hill top behind it is open to walk on
      E.bench(g, 3.2, -5.6, Math.PI, HH);
      p.addBox(3.2, -5.6, 1.2, 0.4);
      // A second lay-by on the sea side of the road, over the east beach: your car can wait here too (ring.js 'beach'). It is
      // the same parkingArea, built in the frame ring.js gives it: the road's frame turned half round about (17, -15)
      // (x' = 34 - lx, z' = -30 - lz). A short walkway goes out from its back to a lift that runs up and down by itself
      // between the deck and the sand: stand on its platform and it takes you (no stairs).
      { const flip = (x, z) => [34 - x, -30 - z], g2 = new THREE.Group(); g2.position.set(34, 0, -30); g2.rotation.y = Math.PI; g.add(g2);
        const p2 = { addBox: (x, z, hx, hz, y0, y1) => p.addBox(...flip(x, z), hx, hz, y0, y1), addCircle: (x, z, r0, y0, y1) => p.addCircle(...flip(x, z), r0, y0, y1), pick: (m) => p.pick(m) };
        const LY = RH + 0.03, PB2 = parkingArea(p2, E, g2, { y: LY, zr: -10.5, depth: 6.4, half: 8, taper: 6, name: 'BEACH PA', kiosk: null, walkway: [-1.3, 1.3, 2.9], open: [], slotX: 2, ground: (x, z) => Math.max(heightC(...flip(x, z)), 0.14) });
        // the lift: a steel cage on the sand at the end of the walkway, open to the beach at the bottom and to the walkway at the top
        const LX0 = 32.8, LX1 = 35.2, LZ0 = -35.4, LZ1 = -33, BOT = 0.14, steelL = E.mat('#5a6460', { metal: 0.5, rough: 0.5 }), yel = E.mat('#e8c43a', { rough: 0.5 });
        const LB = E.batch(g), lb = LB.box, lc = [(LX0 + LX1) / 2, (LZ0 + LZ1) / 2];
        for (const x of [LX0, LX1]) for (const z of [LZ0, LZ1]) lb(0.14, LY + 3, 0.14, x, (LY + 3) / 2, z, steelL);
        for (let y = 2.6; y < LY + 3; y += 1.6) { lb(LX1 - LX0, 0.08, 0.08, lc[0], y, LZ0, steelL); for (const x of [LX0, LX1]) lb(0.08, 0.08, LZ1 - LZ0, x, y, lc[1], steelL); }   // bars round the open cage
        for (let y = 0.6; y < LY - 1; y += 1.6) lb(LX1 - LX0, 0.08, 0.08, lc[0], y, LZ1, steelL);
        lb(LX1 - LX0 + 0.4, 0.2, LZ1 - LZ0 + 0.4, lc[0], LY + 3, lc[1], steelL); lb(0.5, 0.2, 0.3, lc[0], LY + 2.7, lc[1], E.basic('#ffe2b0'), false);
        LB.flush();
        for (const x of [LX0 - 0.05, LX1 + 0.05]) p.addBox(x, lc[1], 0.08, (LZ1 - LZ0) / 2 + 0.05);           // its sides
        p.addBox(lc[0], LZ0 - 0.05, (LX1 - LX0) / 2, 0.08, BOT + 2.4, 1e9);                                       // the sea side, above the way in from the sand
        p.addBox(lc[0], LZ1 + 0.05, (LX1 - LX0) / 2, 0.08, -1e9, LY - 1.6);                                       // the land side, below the way out onto the walkway
        const plat = new THREE.Group(); g.add(plat);
        { const pm = new THREE.Mesh(new THREE.BoxGeometry(LX1 - LX0 - 0.1, 0.16, LZ1 - LZ0 - 0.1), E.mat('#8d948f', { metal: 0.5, rough: 0.6 })); pm.position.set(lc[0], -0.08, lc[1]); pm.castShadow = pm.receiveShadow = true; plat.add(pm); p.pick(pm);
          const st = new THREE.Mesh(new THREE.BoxGeometry(LX1 - LX0 - 0.1, 0.02, 0.12), yel); st.position.set(lc[0], 0.01, LZ0 + 0.1); plat.add(st); }
        { const m = new THREE.MeshBasicMaterial({ map: E.textTex('BEACH PA  ↑\nエレベーター  LIFT', { w: 512, h: 150, color: '#ffffff', bg: '#1f55b8', font: '700 56px "Hind","Noto Sans JP",sans-serif', font2: '700 34px "Hind","Noto Sans JP",sans-serif' }), side: THREE.DoubleSide }); m.userData.lin = true;
          const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.53), m); sg.position.set(lc[0], 3.0, LZ0 - 0.12); g.add(sg); }
        // up and down: 4 s at the bottom, 5 s up, 4 s at the top, 5 s down
        const liftY = (t) => { const u = ((t % 18) + 18) % 18, e = (k) => k * k * (3 - 2 * k); return u < 4 ? BOT : u < 9 ? BOT + (LY - BOT) * e((u - 4) / 5) : u < 13 ? LY : LY - (LY - BOT) * e((u - 13) / 5); };
        const lift = { y: BOT }; p.beachLift = lift;
        const inCage = (lx, lz) => lx > LX0 + 0.1 && lx < LX1 - 0.1 && lz > LZ0 + 0.05 && lz < LZ1 - 0.05;
        p.ground = ((g0) => (lx, lz, y) => { const a = PB2.ground(...flip(lx, lz), y); if (a) return a; if (inCage(lx, lz) && E.onDeck(lift.y, y)) return Math.max(lift.y, BOT); return g0(lx, lz, y); })(p.ground);
        p.liftTick = (t) => { lift.y = liftY(t); plat.position.y = lift.y; };
        p.map2 = [{ t: 'rect', x: 34, z: -22.2, w: 16, h: 6.4, c: '#3a3a3e' }];
      }

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
      const piers = [];   // the breakwaters' centre lines (people fish off them)
      {
        const HBB = E.batch(g), hb = HBB.box, hr = E.rng(4646), concH = E.mat('#9a968e', { map: E.tex('concrete', 4, 1), rough: 0.9 }), ironH = E.mat('#22252a', { metal: 0.6, rough: 0.5 }), wood = E.mat('#6e5137', { rough: 0.85 });
        // breakwaters: a line of big rocks with a concrete cap, out from the beach and hooking round to the mouth
        const arms = [[[HB.x0, -40], [HB.x0 - 2, -62], [HB.x0 + 6, -80], [HB.mouth[0], -84]], [[HB.x1, -40], [HB.x1 + 2, -60], [HB.x1 - 4, -78], [HB.mouth[1], -83]]];
        const rockG = E.rockGeo(5), rocks = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), ps = new THREE.Vector3(), sc = new THREE.Vector3(), eu = new THREE.Euler();
        arms.forEach((A, k) => {
          const cv = new THREE.CatmullRomCurve3(A.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal'), L = cv.getLength(), n = Math.round(L / 1.6); piers.push(cv);
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
      // sea itself turns you into a boat), and busy. Family camps lie over the whole sand in loose clusters, thicker in
      // some stretches than others (windbreaks, pop-up tents, parasols, towels, cool boxes, bags, flip-flops, buckets and
      // spades, beach balls, sandcastles, surfboards stuck in the sand); along the back an ice-cream stand, a shaved-ice
      // stand and a shower; a row of kayaks; the volleyball court, the pull-up bar and the lifeguard tower. A lane along
      // the water's edge, the river mouth, the breakwaters and the routes people walk stay clear. And the people: lying in
      // the sun (some turn over now and then), sitting, reading, swimming and bobbing in the shallows, kids running in and
      // out of the waves, frisbee and catch, a dog walked along the water and one fetching a ball, joggers, a couple
      // strolling, sandcastles being built, photos being taken, anglers on both breakwaters, kites, a kayak out at sea,
      // someone under the shower, a queue at the ice-cream stand and people walking from one spot to the next.
      const BE = { x0: 13, x1: 128, z1: -64 }, BW = { x0: -132, x1: -55.5, z1: -64 };   // they meet the wharf's ends: no water you can step into by mistake
      // The sand runs out past the world's land edge (south, past TAMA's port town, and north): you can walk all of it (p.shore
      // lets you past that edge), but only as far as it is drawn, not on along the sea.
      const onBeach = (lx, lz) => chanD(lx, lz) > (chan ? chan.W + 0.4 : 0) && (lz <= -32 && lz >= -41.5 && lx >= BW.x0 && lx <= BE.x1 && !(lx > HB.x0 && lx < HB.x1 && lz < -40.3)) || (lz <= -32 && lz >= BE.z1 && lx >= BE.x0 && lx <= BE.x1) || (lz <= -32 && lz >= BW.z1 && lx >= BW.x0 && lx <= BW.x1);
      p.ground = ((g0) => (lx, lz, y) => Math.max(onBeach(lx, lz) ? 0.14 : 0, g0(lx, lz, y)))(p.ground);
      if (cn) {   // the canal: down in it, its towpath and water, not the hill over it; its ceilings; its water for the boat; its cutting through the hills
        p.ground = ((g0) => (lx, lz, y) => { const f = cn.floor(lx, lz, y); return f != null ? f : g0(lx, lz, y); })(p.ground);
        p.bore = cn.floor; p.waterShape(cn.water); p.holeAt = cn.holeAt; p.carve = cn.carve; p.afterHills = cn.afterHills;
        p.ceil = ((c0) => (lx, lz) => { const a = cn.ceil(lx, lz); if (cn.chamberAt(lx, lz)) return a; const b = c0(lx, lz); return a == null ? b : b == null ? a : Math.min(a, b); })(p.ceil);
        p.noPier = ((n0) => (lx, lz) => n0(lx, lz) || cn.noPier(lx, lz))(p.noPier);
        p.canal = cn;   // for tests
      }
      p.shore = (lx, lz) => onBeach(lx, lz) || (lx >= BW.x0 && lx < BW.x1 + 12 && lz > -32 && lz < -10);   // past the land's edge: the sand, and the grass behind the south beach that leads onto it
      p.hillMask = (lx, lz) => sstep(-31, -21, lz);   // the rolling hills (game.js) come down behind the sand: never over the beaches, the harbour or the sea
      p.wake = (lx, lz) => (lz < -24 && lz > -100 && Math.abs(lx) < 140) || (Math.abs(lx - 34) < 30 && lz < -14 && lz > -40);   // far along the beaches, out of this place's light, the people still move
      const BL = { acts: [], after: [], lives: [], roots: [], kit: {}, seg: [], players: [], ball: null, puller: null, at: {}, tick: () => {} }; p.beach = BL;   // BL.at: a few of them by name, for tests
      {
        const sandM = E.mat('#e2cf9e', { map: E.tex('sand', 30, 8) }), wetM = E.mat('#b9a477', { map: E.tex('sand', 30, 1), rough: 0.6 });
        for (const B of [BE, BW]) { const w = B.x1 - B.x0, d = -32 - B.z1, s = E.plane(w, d, sandM); s.position.set((B.x0 + B.x1) / 2, 0.13, (-32 + B.z1) / 2); g.add(s); p.pick(s);
          const wet = E.plane(w, 2.2, wetM); wet.position.set((B.x0 + B.x1) / 2, 0.1, B.z1 - 0.9); g.add(wet); }
        const BB2 = E.batch(g), bb = BB2.box, br2 = E.rng(5757), rc = E.rng(6262), V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), PI = Math.PI;
        // One instanced mesh per shape for everything on the sand and everyone on it, each piece in its own colour (a
        // couple of dozen draws for the lot). A piece is an empty node; a person is a rig of them (placement, hips, limbs
        // on pivots). Still pieces are written once; every frame the update poses the moving rigs and copies only theirs.
        const K = BL.kit, kit = (n, geo, o = {}) => { const m = E.mat('#ffffff', { rough: o.rough ?? 0.7, map: o.map || null }, true); if (o.side) m.side = o.side; if (o.vc) m.vertexColors = true; K[n] = { geo, m, list: [], flat: !!o.flat }; };
        const stripeTex = (cols, n, w = 256, h = 32) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x2 = c.getContext('2d'); for (let i = 0; i < n; i++) { x2.fillStyle = cols[i % cols.length]; x2.fillRect((i * w) / n, 0, w / n + 1, h); } const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; };
        kit('box', new THREE.BoxGeometry(1, 1, 1)); kit('cyl', new THREE.CylinderGeometry(1, 1, 1, 12)); kit('cone', new THREE.ConeGeometry(1, 1, 12));
        kit('taper', new THREE.CylinderGeometry(1, 0.88, 1, 7), { rough: 0.6 }); kit('limb', new THREE.CylinderGeometry(1, 0.8, 1, 5).translate(0, -0.5, 0), { rough: 0.6 });   // low-poly: there are a couple of hundred people
        kit('head', new THREE.SphereGeometry(1, 8, 6), { rough: 0.45 }); kit('cap', new THREE.SphereGeometry(1, 8, 3, 0, PI * 2, 0, PI * 0.56), { rough: 0.9 }); kit('sph', new THREE.SphereGeometry(1, 10, 7), { rough: 0.45 });
        kit('flat', new THREE.PlaneGeometry(1, 1).rotateX(-PI / 2), { flat: true });   // towels, mats, flip-flops: their top face only, and no shadow of their own
        kit('torus', new THREE.TorusGeometry(1, 0.32, 8, 18), { rough: 0.5 }); kit('dome', new THREE.SphereGeometry(1, 16, 8, 0, PI, 0, PI / 2), { side: THREE.DoubleSide, rough: 0.8 });   // a pop-up tent: a quarter sphere, open towards -Z
        kit('ball', new THREE.SphereGeometry(1, 14, 10), { map: stripeTex(['#d23a2a', '#f4f1e6', '#2457c5', '#e8d03a', '#f4f1e6', '#1f8a4a'], 6), rough: 0.4 });
        { const P = [[0, 0.62], [0.46, 0.12], [0, -0.58], [-0.46, 0.12]], pos = [], col = []; for (let i = 0; i < 4; i++) { const a = P[i], b = P[(i + 1) % 4], v = i % 2 ? 1 : 0.5; pos.push(0, 0.12, 0, a[0], a[1], 0, b[0], b[1], 0); for (let j = 0; j < 9; j++) col.push(v); }   // a diamond kite in two shades of its colour
          const kg = new THREE.BufferGeometry(); kg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); kg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); kg.computeVertexNormals(); kit('kite', kg, { side: THREE.DoubleSide, vc: true, rough: 0.8 }); }
        const stripes = ['#d23a2a', '#2457c5', '#1f8a4a', '#e8b23a', '#ef7a1a'];
        stripes.forEach((c, i) => kit('para' + i, new THREE.ConeGeometry(1.6, 0.6, 16, 1, true), { map: stripeTex([c, '#f4f1e6'], 16), side: THREE.DoubleSide, rough: 0.8 }));   // parasol tops, one mesh per colour
        [['#2457c5', '#f4f1e6'], ['#d23a2a', '#f4f1e6'], ['#1f8a4a', '#e8d03a']].forEach((cs, i) => kit('wb' + i, new THREE.PlaneGeometry(1, 1), { map: stripeTex(cs, 6, 128, 16), side: THREE.DoubleSide, rough: 0.9 }));   // windbreak cloth and awnings
        const node = (x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0) => { const o = new THREE.Object3D(); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(rx, ry, rz); return o; };
        const put = (k, o, c, par) => { if (par) par.add(o); const e = { o, c: lin(c) }; K[k].list.push(e); return e; };
        const S = (k, c, par, ...a) => put(k, node(...a), c, par).o;   // a still piece: kit, colour, the frame it sits in (or null), then node()'s position, size and turn
        const frame = (par, x, z, ry = 0, y = 0) => { const o = new THREE.Object3D(); o.position.set(x, y, z); o.rotation.y = ry; if (par) par.add(o); return o; };
        const live = (x) => { BL.lives.push(x); return x; };   // a rig (or a single piece) that moves
        const hold = (m, k, c, par, ...a) => { const e = put(k, node(...a), c, par); m.ents.push(e); return e.o; };   // something a rig carries, moving with it
        const col = (F, x, z, rr) => { const c = Math.cos(F.rotation.y), s = Math.sin(F.rotation.y); p.addCircle(F.position.x + x * c + z * s, F.position.z - x * s + z * c, rr); };   // a collider for a piece in a frame
        // people
        const skins = ['#e1b18c', '#c8946a', '#8a5a3c', '#f0c8a8', '#6a4430'], suits = ['#d23a2a', '#2457c5', '#1f8a4a', '#e8b23a', '#141416', '#9b7bd8', '#ef7a1a'];
        const hairs = ['#1c1612', '#3b2a1c', '#6b4a2c', '#b88a52', '#d9c9a0', '#2a2420', '#7a7470'], tees = ['#f4f1e6', '#2a9fd6', '#e8b23a', '#d23a2a', '#3f7a52', '#9b7bd8', '#22252a', '#7ad0c8'];
        const person = (k, o = {}) => {   // o: x, z, ry, par (a frame), kid, top, suit, legs, sleeves, hat, bald
          const f = frame(o.par || null, o.x || 0, o.z || 0, o.ry || 0), b = new THREE.Object3D(); f.rotation.order = 'YXZ'; b.position.y = 0.9; f.add(b);   // b: the hips, which every posture turns about
          const sk = skins[k % skins.length], ents = [], pt = (kk, par, c, ...a) => { const n = node(...a); ents.push(put(kk, n, c, par)); return n; };
          pt('taper', b, o.top || (k % 3 === 1 ? suits[(k * 3 + 2) % suits.length] : sk), 0, 0.3, 0, 0.19, 0.62, 0.133);   // a third in a one-piece or a top
          pt('taper', b, o.suit || suits[(k * 3) % suits.length], 0, 0.08, 0, 0.2, 0.22, 0.144);
          pt('head', b, sk, 0, 0.76, 0, 0.12, 0.125, 0.12);
          if (!o.bald) pt('cap', b, o.hat || hairs[(k * 5 + 1) % hairs.length], 0, 0.78, -0.014, 0.13, 0.13, 0.13, 0, -0.42);   // hair (or a cap), tipped back off the face
          const limb = (x, y, len, rr, c) => { const pv = new THREE.Object3D(); pv.position.set(x, y, 0); b.add(pv); pt('limb', pv, c, 0, 0, 0, rr, len, rr); return pv; };
          const arms = [limb(-0.25, 0.56, 0.6, 0.055, o.sleeves || sk), limb(0.25, 0.56, 0.6, 0.055, o.sleeves || sk)], legs = [limb(-0.1, 0, 0.86, 0.068, o.legs || sk), limb(0.1, 0, 0.86, 0.068, o.legs || sk)];
          if (o.kid) f.scale.setScalar(0.62);
          return { f, b, arms, legs, ents, s: f.scale.y, ph: 0 };
        };
        // postures, by where the hips go over the ground gy (people face +Z; lying, the head is towards -Z)
        const pose = (m, kind, gy = 0.14) => {
          const s = m.s, A = m.arms, L = m.legs; m.b.rotation.set(0, 0, 0); A.forEach((a, i) => a.rotation.set(0, 0, (i ? 1 : -1) * 0.09)); L.forEach((l) => l.rotation.set(0, 0, 0));
          if (kind === 'stand') m.f.position.y = gy - 0.03 * s;
          else if (kind === 'sit') { m.f.position.y = gy - 0.83 * s; m.b.rotation.x = -0.2; L.forEach((l, i) => l.rotation.set(-1.4, 0, (i ? -1 : 1) * 0.1)); A.forEach((a, i) => a.rotation.set(0.5, 0, (i ? 1 : -1) * 0.28)); }   // legs out, leaning back on the hands
          else if (kind === 'kneel') { m.f.position.y = gy - 0.58 * s; m.b.rotation.x = 0.3; L.forEach((l) => (l.rotation.x = 0.9)); }   // sitting back on the heels, leaning in
          else if (kind === 'back') { m.f.position.y = gy - 0.75 * s; m.b.rotation.x = -PI / 2; A.forEach((a, i) => (a.rotation.z = (i ? 1 : -1) * 0.14)); }
          return m;
        };
        const gait = (m, ph, a) => { const s = Math.sin(ph); m.legs[0].rotation.x = s * a; m.legs[1].rotation.x = -s * a; m.arms[0].rotation.x = -s * a * 0.9; m.arms[1].rotation.x = s * a * 0.9; };
        const turn = (o, yaw, dt, k = 5) => { if (yaw == null) return; o.rotation.y += Math.atan2(Math.sin(yaw - o.rotation.y), Math.cos(yaw - o.rotation.y)) * Math.min(1, dt * k); };
        const face = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az);
        const hand = (m, i, v) => m.arms[i].localToWorld(v.set(0, -0.62, 0));
        // a loop of waypoints walked at a pace, with a pause at some of them: where along it someone is at time t
        const route = (pts, v, pause = []) => { const seg = []; let T = 0; pts.forEach((a, i) => { const b2 = pts[(i + 1) % pts.length], w = pause[(i + 1) % pts.length] || 0, t1 = T + Math.hypot(b2[0] - a[0], b2[1] - a[1]) / v; seg.push({ a, b: b2, t0: T, t1, w }); BL.seg.push([a, b2]); T = t1 + w; }); return { seg, T, v }; };
        const along = (R, t) => { const u = ((t % R.T) + R.T) % R.T; for (const s of R.seg) { if (u < s.t1) { const k = (u - s.t0) / (s.t1 - s.t0 || 1); return { x: s.a[0] + (s.b[0] - s.a[0]) * k, z: s.a[1] + (s.b[1] - s.a[1]) * k, yaw: face(s.a[0], s.a[1], s.b[0], s.b[1]), go: true }; } if (u < s.t1 + s.w) return { x: s.b[0], z: s.b[1], yaw: null, go: false }; } return { x: R.seg[0].a[0], z: R.seg[0].a[1], yaw: null, go: false }; };
        // someone following a route, walking or running; o.after(m, t, q) poses what the gait leaves alone
        const crossers = [];   // where everyone walking about will be at time t: the kids running down to the sea wait for them to go by
        const walker = (m, R, o = {}) => { live(pose(m, 'stand')); if (o.side) R.seg.forEach(({ a, b }) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ox = (-(b[1] - a[1]) / L) * o.side, oz = ((b[0] - a[0]) / L) * o.side; BL.seg.push([[a[0] + ox, a[1] + oz], [b[0] + ox, b[1] + oz]]); });   // walking beside the line: keep that clear too
          crossers.push((t) => { const q = along(R, t + (o.off || 0)), sd = o.side || 0, fy = q.yaw ?? 0; return [q.x + (o.dx || 0) - Math.cos(fy) * sd, q.z + (o.dz || 0) + Math.sin(fy) * sd]; });
          BL.acts.push((t, dt) => { const q = along(R, t + (o.off || 0)), s = m.s;
          turn(m.f, q.yaw, dt, o.run ? 8 : 5); const sd = o.side || 0, fy = m.f.rotation.y;   // o.side: that far to the right of the line, by the way they face (so it swings round smoothly at the corners)
          m.f.position.x = q.x + (o.dx || 0) - Math.cos(fy) * sd; m.f.position.z = q.z + (o.dz || 0) + Math.sin(fy) * sd;
          if (q.go) { m.ph += dt * R.v * (o.run ? 2.9 : 4.4) / s; gait(m, m.ph, o.run ? 0.85 : 0.42); m.f.position.y = 0.14 - 0.03 * s + Math.abs(Math.cos(m.ph)) * (o.run ? 0.07 : 0.025); m.b.rotation.x = o.run ? 0.14 : 0.03; }
          else { gait(m, 0, 0); m.f.position.y = 0.14 - 0.03 * s; m.b.rotation.x = 0; }
          if (o.after) o.after(m, t, q); }); return m; };

        // where things may go: on the sand, out of the lane along the water and off the back edge, clear of the breakwaters,
        // the river mouth, the routes people walk and everything already placed
        const taken = [], keepRect = [];
        const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], k = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - a[0] - dx * k, z - a[1] - dz * k); };
        const free = (x, z, rr) => { if (!((x > 21 + rr && x < BE.x1 - 2 - rr) || (x > BW.x0 + 2 + rr && x < -63 - rr)) || z > -34.2 - rr || z < -59.4 + rr) return false;
          if (taken.some(([a, b, q]) => Math.hypot(x - a, z - b) < rr + q) || keepRect.some(([x0, z0, x1, z1]) => x > x0 - rr && x < x1 + rr && z > z0 - rr && z < z1 + rr)) return false;
          return !BL.seg.some(([a, b]) => segD(x, z, a, b) < rr + 0.9); };
        const take = (x, z, rr) => taken.push([x, z, rr]);
        const seaClear = (x, z, rr) => z < -66.5 - rr * 0.2 && !(x > HB.x0 - 10 && x < HB.x1 + 10);   // out past the wet sand, clear of the harbour

        // parasols with loungers and people lying in the sun (the tops, one instanced mesh per colour)
        const parasol = (x, z, k, F = null, loungers = true) => {
          S('cyl', '#eeece6', F, x, 1.37, z, 0.04, 2.5, 0.04); S('para' + (k % stripes.length), '#ffffff', F, x, 2.55, z, 1, 1, 1, k * 0.7);
          if (F) col(F, x, z, 0.15); else p.addCircle(x, z, 0.15);
          if (!loungers) return;
          take(x, z + 0.4, 2.9);
          for (const sd of [-1, 1]) {
            const lx = x + sd * 0.75, lz = z - 0.2;
            bb(0.62, 0.08, 1.8, lx, 0.42, lz, E.mat('#f4f1e6', { rough: 0.6 })); const back = bb(0.62, 0.08, 0.7, lx, 0.7, lz - 1.05, E.mat('#f4f1e6', { rough: 0.6 })); back.rotation.x = -0.9;
            for (const [ax, az] of [[-0.25, 0.8], [0.25, 0.8], [-0.25, -0.8], [0.25, -0.8]]) bb(0.04, 0.38, 0.04, lx + ax, 0.27, lz + az, E.mat('#b9bec4', { metal: 0.6 }), false);
            p.addBox(lx, lz, 0.35, 1.0);
            if (br2() < 0.75) {   // someone lying back on it, head up, legs flat
              const m = person(k * 2 + sd + 3, { x: lx, z: lz + 0.05 }); m.f.position.y = 0.58 - 0.9; m.b.rotation.x = -PI / 2 + 0.35; m.legs.forEach((l) => (l.rotation.x = -0.35)); m.arms.forEach((a, i) => (a.rotation.z = (i ? 1 : -1) * 0.2));
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
          const net = new THREE.Mesh(new THREE.PlaneGeometry(9, 0.9), new THREE.MeshStandardMaterial({ color: '#202428', transparent: true, opacity: 0.7, side: THREE.DoubleSide })); net.rotation.y = PI / 2; net.position.set(VX, 2.15, VZ); g.add(net);
          bb(0.04, 0.06, 9, VX, 2.62, VZ, E.mat('#f4f1e6'), false);
          const rope = E.mat('#2457c5', { rough: 0.6 }); bb(16, 0.03, 0.06, VX, 0.16, VZ - 4, rope, false); bb(16, 0.03, 0.06, VX, 0.16, VZ + 4, rope, false); bb(0.06, 0.03, 8, VX - 8, 0.16, VZ, rope, false); bb(0.06, 0.03, 8, VX + 8, 0.16, VZ, rope, false);
          for (const [dx, dz, k] of [[-4, -1.8, 1], [-5.5, 2, 2], [4.5, 1.5, 3], [5.5, -2.2, 4]]) { const m = live(pose(person(k + 10, { x: VX + dx, z: VZ + dz, ry: dx < 0 ? PI / 2 : -PI / 2 }), 'stand')); BL.players.push({ m, x: VX + dx, z: VZ + dz, side: Math.sign(dx) }); p.addCircle(VX + dx, VZ + dz, 0.35); }
          BL.ball = live(put('sph', node(VX, 2, VZ, 0.11, 0.11, 0.11), '#f2e8a0')).o;
          keepRect.push([VX - 9.5, VZ - 5.6, VX + 9.5, VZ + 5.6]);
          BL.acts.push((t) => { const ph = (t * 0.55) % 2, k = ph < 1 ? ph : 2 - ph, A = BL.players[0], Bp = BL.players[3];
            BL.ball.position.set(A.x + (Bp.x - A.x) * k, 2.2 + Math.sin(PI * k) * 3.2, A.z + (Bp.z - A.z) * k);
            BL.players.forEach((q) => { const near = (q.side < 0) === (ph > 1.75 || ph < 0.25); q.m.arms.forEach((a, j) => { a.rotation.z = near ? (j ? 1 : -1) * 2.6 : (j ? 1 : -1) * 0.3; }); q.m.f.position.y = 0.11 + (near ? Math.max(0, Math.sin(t * 8)) * 0.15 : 0); }); }); }
        // a pull-up bar and parallel bars, and someone doing pull-ups
        { const PX = 112, PZ = -40, steelB = E.mat('#9aa0a8', { metal: 0.7, rough: 0.35 });
          for (const sd of [-1, 1]) { bb(0.1, 2.5, 0.1, PX + sd * 0.9, 1.39, PZ, steelB); p.addCircle(PX + sd * 0.9, PZ, 0.15); }
          bb(1.9, 0.05, 0.05, PX, 2.62, PZ, steelB);
          for (const sd of [-1, 1]) for (const ex of [-1, 1]) bb(0.08, 1.2, 0.08, PX + 3 + ex * 1.1, 0.74, PZ + sd * 0.3, steelB);
          for (const sd of [-1, 1]) bb(2.4, 0.05, 0.05, PX + 3, 1.33, PZ + sd * 0.3, steelB);
          const m = BL.puller = live(person(20, { x: PX, z: PZ })); m.arms.forEach((a, i) => { a.rotation.z = (i ? 1 : -1) * PI * 0.94; }); m.legs[0].rotation.x = 0.3; m.legs[1].rotation.x = 0.4;
          BL.acts.push((t) => (m.f.position.y = 0.55 + (0.5 - 0.5 * Math.cos(t * 2.4)) * 0.42));
          keepRect.push([PX - 1.8, PZ - 1.4, PX + 4.9, PZ + 1.4]); }
        // a lifeguard tower, a lifebuoy on its rail and a flag; the lifeguard scans the water, now and then with binoculars
        { const LX = 60, LZ = -36; for (const [ax, az] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) { bb(0.12, 2.6, 0.12, LX + ax, 1.43, LZ + az, E.mat('#eeece6')); p.addCircle(LX + ax, LZ + az, 0.12); }
          bb(2, 0.12, 2, LX, 2.8, LZ, E.mat('#d23a2a', { rough: 0.6 })); bb(2.1, 0.12, 2.1, LX, 4.4, LZ, E.mat('#eeece6')); for (const [ax, az] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) bb(0.08, 1.5, 0.08, LX + ax, 3.6, LZ + az, E.mat('#eeece6'), false);
          bb(0.06, 0.9, 2, LX - 1.0, 3.3, LZ, E.mat('#d23a2a', { rough: 0.6 }), false);   // a rail with the lifebuoy on it
          S('torus', '#ef5a2a', null, LX - 1.06, 3.25, LZ + 0.2, 0.28, 0.28, 0.28, PI / 2); S('cyl', '#eeece6', null, LX + 0.9, 5.4, LZ + 0.9, 0.03, 2.2, 0.03); S('box', '#d23a2a', null, LX + 0.9, 6.25, LZ + 0.55, 0.02, 0.4, 0.66);
          const m = live(pose(person(22, { x: LX, z: LZ, ry: PI, top: '#d23a2a', hat: '#e8d03a' }), 'stand', 2.89)), bin = hold(m, 'box', '#1a1c20', m.arms[1], 0, -0.64, 0.05, 0.2, 0.08, 0.1);
          BL.acts.push((t) => { const u = t % 13, up = sstep(0, 0.6, u) * (1 - sstep(4.5, 5.1, u)); m.f.rotation.y = PI + Math.sin(t * 0.27) * 0.55; m.arms.forEach((a, i) => a.rotation.set(-2.1 * up, 0, (i ? 1 : -1) * (0.09 - 0.55 * up))); bin.scale.set(0.2 * up + 0.001, 0.08 * up + 0.001, 0.1 * up + 0.001); });   // instances ignore .visible: hide by size
          take(LX, LZ, 2.4); }

        // the ice-cream stand (east) and the shaved-ice stand (west): a kitchen at the back, a serving booth under a striped
        // awning, a counter, a big cone or a 氷 flag on the roof, a freezer, a menu board; someone serving, a queue
        const stand = (x, z, o) => {
          const F = frame(null, x, z), wall = o.wall;
          S('box', wall, F, 0, 1.24, 0.95, 3.4, 2.24, 1.5); for (const sd of [-1, 1]) S('box', wall, F, sd * 1.62, 1.24, -0.2, 0.16, 2.24, 0.9);
          S('box', '#3a3430', F, 0, 1.4, 0.19, 3.1, 1.6, 0.02); S('box', '#e8e2d4', F, 0, 2.43, 0.3, 3.7, 0.14, 2.9);
          for (const [bx, bz, w, d] of [[0, 1.71, 3.42, 0.02], [-1.71, 0.95, 0.02, 1.52], [1.71, 0.95, 0.02, 1.52]]) S('box', o.counter, F, bx, 0.45, bz, w, 0.5, d);   // a band of colour round the kitchen
          S('box', '#6e5137', F, 0.9, 1.05, 1.715, 0.8, 1.85, 0.03); S('box', '#c8ccd0', F, -1.0, 1.55, 1.715, 0.9, 0.6, 0.03);   // its back door and a vent
          for (let i = 0; i < 3; i++) S('box', ['#f4c2d0', '#bfe8c8', '#f2e6b0'][i], F, -0.9 + i * 0.9, 1.75, 0.15, 0.5, 0.3, 0.08);   // the flavours on the back wall
          S('box', o.counter, F, 0, 0.6, -0.62, 3.3, 0.96, 0.36); S('box', '#f4f1e6', F, 0, 1.11, -0.66, 3.44, 0.06, 0.5);
          S(o.awn, '#ffffff', F, 0, 2.15, -1.42, 3.7, 1.0, 1, 0, 1.05);
          S('box', '#f4f1e6', F, 2.35, 0.55, -0.3, 0.75, 0.82, 0.6); S('box', o.counter, F, 2.35, 0.99, -0.3, 0.78, 0.07, 0.63); col(F, 2.35, -0.3, 0.45);   // the freezer
          S('box', '#2a2622', F, -2.35, 0.95, -0.9, 0.62, 0.8, 0.05, 0.25); S('box', '#6e5137', F, -2.35, 0.45, -0.88, 0.05, 0.7, 0.05, 0.25); col(F, -2.35, -0.9, 0.35);   // the menu board
          p.addBox(x, z + 0.32, 1.85, 1.15);
          const sg = new THREE.Mesh(new THREE.PlaneGeometry(o.sw, o.sh), new THREE.MeshBasicMaterial({ map: o.sign, transparent: true })); sg.position.set(x, o.sy, z - 1.16); sg.rotation.y = PI; g.add(sg);
          const v = live(pose(person(o.k, { par: F, x: 0.3, z: -0.15, ry: PI, top: '#f4f1e6', hat: '#f4f1e6' }), 'stand'));
          BL.acts.push((t) => { v.arms[1].rotation.x = -0.9 + Math.sin(t * 2.3) * 0.35; v.arms[0].rotation.x = -0.5; v.f.position.x = 0.3 + Math.sin(t * 0.4) * 0.6; });
          [[0.3, -1.6], [-0.15, -2.35], [0.25, -3.1]].forEach(([qx, qz], i) => { const q = live(pose(person(o.k + 3 + i * 2, { par: F, x: qx, z: qz, top: i === 1 ? tees[i + o.k % 4] : undefined, kid: i === 2 && o.k % 2 === 0 }), 'stand')); col(F, qx, qz, 0.3);
            BL.acts.push((t) => { q.b.rotation.z = Math.sin(t * 0.6 + i * 2) * 0.035; q.f.rotation.y = Math.sin(t * 0.25 + i * 1.7) * 0.35; if (i === 1) { const ph2 = sstep(0.2, 0.5, Math.sin(t * 0.2 + i)); q.arms[1].rotation.x = -1.3 * ph2; } }); });
          take(x, z - 1.2, 3.6); return F;
        };
        const iceSign = E.textTex('ICE CREAM', { w: 512, h: 112, color: '#d8406a', bg: '#fff6e8', font: '700 78px "Hind",sans-serif' });
        { const F = stand(44, -33.0, { wall: '#f6efe0', counter: '#7ad0c8', awn: 'wb1', sign: iceSign, sw: 2.6, sh: 0.57, sy: 2.85, k: 30 });
          S('cone', '#d9a55a', F, 0, 3.05, 0.4, 0.34, 0.9, 0.34, 0, PI); S('sph', '#f4c2d0', F, 0, 3.62, 0.4, 0.42, 0.36, 0.42); S('sph', '#bfe8c8', F, 0, 3.95, 0.4, 0.33, 0.29, 0.33); S('sph', '#d23a2a', F, 0.05, 4.27, 0.4, 0.07, 0.07, 0.07); }   // a giant cone on the roof
        const iceFlag = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 160; const x2 = c.getContext('2d'); x2.fillStyle = '#ffffff'; x2.fillRect(0, 0, 128, 160); x2.fillStyle = '#2a6fd0'; for (let i = 0; i < 4; i++) { x2.beginPath(); x2.arc(16 + i * 32, 160, 18, PI, 0); x2.fill(); }
          x2.fillStyle = '#d8262a'; x2.font = '700 96px "Noto Serif JP",serif'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.fillText('氷', 64, 70); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; })();   // the kakigori flag: red 氷 over blue waves
        { const F = stand(-70, -42.4, { wall: '#eef2f4', counter: '#2a6fd0', awn: 'wb0', sign: iceFlag, sw: 0.7, sh: 0.88, sy: 2.95, k: 41 });
          S('cyl', '#6e5137', F, 1.95, 1.75, -1.25, 0.03, 3.3, 0.03);   // and a flag on a pole by the counter: two one-sided sheets back to back, so 氷 reads the right way round from either side
          { const fg = new THREE.PlaneGeometry(0.62, 0.78), fm = new THREE.MeshBasicMaterial({ map: iceFlag }); for (const ry of [0, PI]) { const fl = new THREE.Mesh(fg, fm); fl.position.set(-70 + 1.95 - 0.33, 2.95, -42.4 - 1.25); fl.rotation.y = ry; g.add(fl); } }
          S('box', '#c8ccd0', F, -1.2, 1.38, -0.62, 0.3, 0.5, 0.3); S('cyl', '#d23a2a', F, -1.2, 1.7, -0.62, 0.1, 0.15, 0.1); }   // the shaving machine
        // a shower post on a slatted floor, and someone rinsing off under it
        { const SX = 53, SZ = -35.4;
          S('box', '#9a7a55', null, SX, 0.17, SZ, 1.5, 0.05, 1.5); for (let k = -2; k <= 2; k++) S('box', '#7a5a3a', null, SX, 0.2, SZ + k * 0.3, 1.5, 0.02, 0.13);
          S('cyl', '#c8ccd0', null, SX - 0.55, 1.42, SZ + 0.55, 0.05, 2.5, 0.05); S('box', '#c8ccd0', null, SX - 0.275, 2.62, SZ + 0.275, 0.05, 0.05, 0.8, PI * 0.75); S('cyl', '#c8ccd0', null, SX, 2.56, SZ, 0.13, 0.05, 0.13); S('box', '#2457c5', null, SX - 0.55, 1.0, SZ + 0.42, 0.08, 0.08, 0.14);
          p.addCircle(SX - 0.55, SZ + 0.55, 0.15);
          const spray = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.3, 2.3, 12, 1, true), new THREE.MeshBasicMaterial({ color: lin('#bfe6ff'), transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); spray.material.userData.lin = true; spray.position.set(SX, 1.38, SZ); g.add(spray);
          const m = live(pose(person(33, { x: SX, z: SZ }), 'stand', 0.2));
          BL.acts.push((t) => { spray.material.opacity = 0.08 + Math.sin(t * 37) * 0.025; m.f.rotation.y = t * 0.45; m.arms.forEach((a, i) => a.rotation.set(-0.5 + Math.sin(t * 5 + i * 2) * 0.25, 0, (i ? 1 : -1) * (2.45 + Math.sin(t * 5 + i) * 0.15))); });
          take(SX, SZ, 1.8); }
        // a row of kayaks for hire, with paddles
        { const KX = 104, KZ = -56.6, kc = ['#e8b23a', '#d23a2a', '#ef7a1a', '#7ad0c8'];
          kc.forEach((c, i) => { const x = KX + i * 1.05; S('sph', c, null, x, 0.29, KZ, 0.34, 0.17, 1.7); S('sph', '#22252a', null, x, 0.42, KZ + 0.15, 0.17, 0.04, 0.36); });
          for (let i = 0; i < 2; i++) { S('box', '#22252a', null, KX + 4.4 + i * 0.5, 0.17, KZ, 0.04, 0.03, 2.0, 0.1); for (const e of [-1, 1]) S('box', '#e8b23a', null, KX + 4.4 + i * 0.5 + e * 0.1, 0.17, KZ + e * 1.0, 0.16, 0.02, 0.42, 0.1); }
          p.addBox(KX + 2.2, KZ, 3.0, 1.8); take(KX + 2.2, KZ, 3.2); }

        // pieces that camps and people share
        const towelC = ['#d23a2a', '#2457c5', '#1f8a4a', '#e8b23a', '#ef7a1a', '#9b7bd8', '#7ad0c8', '#f4f1e6', '#22252a'], coolC = ['#2457c5', '#d23a2a', '#1f8a4a', '#ef7a1a'];
        const bagC = ['#e8d2a8', '#2457c5', '#d23a2a', '#22252a', '#7ad0c8', '#c86a2a'], toyC = ['#d23a2a', '#2457c5', '#e8b23a', '#1f8a4a', '#ef7a1a'], boardC = ['#f4f1e6', '#2a9fd6', '#e8b23a', '#d23a2a', '#1f8a4a', '#ef7a1a', '#7ad0c8'];
        const towel = (F, x, z, ry, k) => { const T = frame(F, x, z, ry); S('flat', towelC[k % towelC.length], T, 0, 0.154, 0, 0.88, 1, 1.76); if (k % 3 !== 2) for (const dz of [-0.6, 0.6]) S('flat', towelC[(k + 4) % towelC.length], T, 0, 0.158, dz, 0.89, 1, 0.18); return T; };
        const cooler = (F, x, z, ry, k) => { const T = frame(F, x, z, ry); S('box', coolC[k % coolC.length], T, 0, 0.32, 0, 0.56, 0.36, 0.36); S('box', '#f4f1e6', T, 0, 0.53, 0, 0.58, 0.07, 0.38); S('box', '#f4f1e6', T, 0, 0.6, 0, 0.34, 0.04, 0.05); col(F, x, z, 0.36); };
        const bag = (F, x, z, ry, k) => { const T = frame(F, x, z, ry); S('box', bagC[k % bagC.length], T, 0, 0.3, 0, 0.44, 0.32, 0.16, 0, 0, 0.1); S('box', bagC[(k + 3) % bagC.length], T, 0.03, 0.52, 0, 0.3, 0.14, 0.02, 0, 0, 0.1); };
        const flops = (F, x, z, ry, k) => { const T = frame(F, x, z, ry); for (const sx of [-0.08, 0.08]) S('flat', toyC[k % toyC.length], T, sx, 0.157, sx * 0.8, 0.1, 1, 0.26, sx * 1.6); };
        const bucket = (F, x, z, k) => { S('cyl', toyC[k % toyC.length], F, x, 0.25, z, 0.12, 0.22, 0.12); const T = frame(F, x + 0.3, z + 0.12, 0.6 + k); S('box', toyC[(k + 1) % toyC.length], T, 0, 0.155, 0, 0.13, 0.02, 0.15); S('box', toyC[(k + 1) % toyC.length], T, 0, 0.16, 0.22, 0.03, 0.03, 0.3); };
        const ball = (F, x, z) => S('ball', '#ffffff', F, x, 0.34, z, 0.2, 0.2, 0.2, rc() * 6, rc() * 3);
        const boards = (F, x, z, n, k) => { for (let i = 0; i < n; i++) { const bx = x + (i - (n - 1) / 2) * 0.62; S('sph', boardC[(k + i * 3) % boardC.length], F, bx, 0.84, z + (rc() - 0.5) * 0.3, 0.27, 1.0, 0.045, (rc() - 0.5) * 0.5, (rc() - 0.5) * 0.2, (rc() - 0.5) * 0.25); col(F, bx, z, 0.3); } };   // stuck upright in the sand
        const windbreak = (F, R, a0, a1, n, k) => { const pts = []; for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push([Math.sin(a) * R, -Math.cos(a) * R]); }
          pts.forEach(([x, z]) => S('box', '#8a6a48', F, x, 0.72, z, 0.05, 1.18, 0.05));
          for (let i = 0; i < n; i++) { const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0); S('wb' + (k % 3), '#ffffff', F, (x0 + x1) / 2, 0.66, (z0 + z1) / 2, L, 0.95, 1, Math.atan2(-(z1 - z0), x1 - x0)); col(F, (x0 + x1) / 2, (z0 + z1) / 2, L / 2); } };
        const castle = (F, x, z, ry) => { const T = frame(F, x, z, ry), dry = '#d9c18c', wet = '#b89a68';   // a moat, a mound, a keep and four towers with walls between, and a flag
          S('torus', wet, T, 0, 0.14, 0, 0.95, 0.95, 0.12, 0, PI / 2); S('cyl', wet, T, 0, 0.22, 0, 0.62, 0.18, 0.62); S('cyl', dry, T, 0, 0.55, 0, 0.22, 0.5, 0.22); S('cone', dry, T, 0, 0.95, 0, 0.25, 0.3, 0.25);
          for (const [a, b2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { S('cyl', dry, T, a * 0.4, 0.45, b2 * 0.4, 0.13, 0.36, 0.13); S('cone', dry, T, a * 0.4, 0.74, b2 * 0.4, 0.15, 0.22, 0.15); }
          for (const [a, b2, ry2] of [[0, -0.4, 0], [0.4, 0, PI / 2], [0, 0.4, 0], [-0.4, 0, PI / 2]]) S('box', dry, T, a, 0.42, b2, 0.6, 0.16, 0.09, ry2);
          S('box', '#f4f1e6', T, 0, 1.2, 0, 0.012, 0.3, 0.012); S('box', '#d23a2a', T, 0.06, 1.3, 0, 0.12, 0.08, 0.01); col(F, x, z, 0.8); return T; };
        // someone lying on a towel who turns over every half a minute or so: on the back, a roll, on the front with the arms up by the head
        const turner = (m) => { live(m); const T = 18 + rc() * 22, ph = rc() * 60, gy = m.f.position.y; BL.acts.push((t) => { const u = ((t + ph) % (2 * T)) / T, h = Math.floor(u), k = sstep(0, 1.5 / T, u - h), roll = (h + k) * PI, up = (1 - Math.cos(roll)) / 2;
          m.b.rotation.y = roll; m.f.position.y = gy + Math.sin(k * PI) * 0.13 * m.s; m.arms.forEach((a, i) => a.rotation.set(-2.9 * up, 0, (i ? 1 : -1) * (0.14 + 0.3 * up))); }); return m; };
        const lie = (F, k, x, z, ry, o = {}) => { const m = pose(person(k, { par: F, x, z, ry, ...o }), 'back', 0.15); col(F, x, z, 0.6); return rc() < 0.4 ? turner(m) : m; };
        const sitter = (F, k, x, z, ry, o = {}) => { const m = pose(person(k, { par: F, x, z, ry, ...o }), 'sit', 0.15); const u = rc();
          if (u < 0.3) { m.arms.forEach((a, i) => a.rotation.set(-1.0, 0, (i ? -1 : 1) * 0.35)); S('box', toyC[k % toyC.length], m.b, 0, 0.36, 0.42, 0.24, 0.3, 0.03, 0, -0.6); }   // reading
          else if (u < 0.5) { m.b.rotation.x = 0.18; m.arms.forEach((a, i) => a.rotation.set(-0.75, 0, (i ? -1 : 1) * 0.2)); }   // leaning forward, hands on the legs
          col(F, x, z, 0.45); return m; };

        // the people out and about (placed before the camps, which keep clear of where they go)
        // swimmers: bobbing and treading water, floating on their backs, swimming lengths, kids in rubber rings
        const KIDS = [[56.4, 80, 0], [59.6, 81, 2.6], [101, 82, 1.1], [-115, 83, 0.4], [-111.8, 84, 3.9]];   // where kids run into the waves (x), well apart
        const swim = (B, n, seed) => { for (let i = 0, made = 0; i < 60 && made < n; i++) { const x = B.x0 + 8 + rc() * (B.x1 - B.x0 - 14), z = -67.6 - rc() * 8.5, k = seed + made; if (!seaClear(x, z, 3) || KIDS.some(([kx]) => Math.abs(x - kx) < 2.5 && z > -70.5)) continue; made++;
          const kind = made % 5 === 2 ? 'float' : made % 5 === 4 ? 'ring' : 'tread', m = live(person(k, { x, z, ry: PI + (rc() - 0.5) * 2, kid: kind === 'ring' })), ph = rc() * 9;
          if (kind === 'float') { m.b.rotation.x = -PI / 2 + 0.06; m.f.position.y = -0.88; m.arms.forEach((a, j) => (a.rotation.z = (j ? 1 : -1) * 1.35)); m.legs.forEach((l, j) => (l.rotation.z = (j ? -1 : 1) * 0.25)); }
          if (kind === 'ring') hold(m, 'torus', toyC[k % toyC.length], m.f, 0, 1.06, 0, 0.36, 0.36, 0.36, 0, PI / 2);
          const base = kind === 'float' ? -0.88 : kind === 'ring' ? -0.6 : -1.02;
          BL.acts.push((t) => { m.f.position.y = base + Math.sin(t * 1.5 + ph) * (kind === 'float' ? 0.03 : 0.07);
            if (kind === 'float') { m.f.rotation.y += 0.0006 * Math.sin(t * 0.1 + ph); return; }
            m.arms.forEach((a, j) => a.rotation.set(Math.sin(t * 2.2 + ph + j) * 0.35, 0, (j ? 1 : -1) * (1.15 + Math.sin(t * 2.2 + ph) * 0.25))); m.legs.forEach((l, j) => (l.rotation.x = Math.sin(t * 2 + ph + j * 3) * 0.3)); }); } };
        swim(BE, 9, 50); swim(BW, 6, 70);
        // swimming lengths, crawl, parallel to the beach
        for (const [x0, x1, z, k] of [[30, 72, -70.5, 61], [80, 118, -73.5, 62], [-122, -80, -71, 63]]) {
          if (!seaClear(x0, z, 2) || !seaClear(x1, z, 2)) continue;
          const m = live(person(k, { x: x0, z, bald: k % 2 === 0, hat: '#f4f1e6' })), R = route([[x0, z], [x1, z], [x1, z - 1.5], [x0, z - 1.5]], 0.75); m.b.rotation.x = PI / 2 - 0.08; m.f.position.y = -0.82;
          BL.acts.push((t, dt) => { const q = along(R, t); m.f.position.x = q.x; m.f.position.z = q.z; turn(m.f, q.yaw, dt, 1.5); m.arms.forEach((a, j) => a.rotation.set(-t * 3.1 - j * PI, 0, (j ? 1 : -1) * 0.25)); m.legs.forEach((l, j) => (l.rotation.x = Math.sin(t * 9 + j * PI) * 0.22)); m.f.position.y = -0.82 + Math.sin(t * 3.1) * 0.03; });
          BL.seg.length -= 4;   // out at sea: nothing on the sand to keep off this route
        }
        // kids running into the waves, splashing about and running back out; at the top of the wet sand they wait for whoever
        // is coming along the water's edge (strollers, joggers, the dog) to go by before they dash across
        const zD = -59, zW = -67.2, runZ = (u) => (u < 2.3 ? zD + (zW - zD) * (u / 2.3) : u < 3.8 ? zW + Math.sin((u - 2.3) * 4) * 0.4 : u < 6.1 ? zW + (zD - zW) * ((u - 3.8) / 2.3) : zD);
        const clearRun = (x, t) => { for (let s = 0; s <= 6.1; s += 0.3) { const z = runZ(s); for (const c of crossers) { const q = c(t + s); if (Math.abs(q[0] - x) < 1.7 && Math.abs(q[1] - z) < 0.9) return false; } } return true; };
        const waves = (x, k, ph) => { const m = live(pose(person(k, { kid: true, x, z: zD, top: k % 2 ? undefined : tees[k % tees.length] }), 'stand')), fx = [0, 1, 2].map(() => live(put('sph', node(x, 0.08, -66, 0.001, 0.001, 0.001), '#f4f6f8')).o), st = { t0: -ph };
          take(x, zD, 1.3);
          BL.acts.push((t, dt) => { let u = t - st.t0; if (u < 0 || u >= 7.5) { if (clearRun(x, t)) { st.t0 = t; u = 0; } else u = 7; }   // a run starts only when it is clear the whole way out and back
            const z = runZ(u); let go = 0, yaw;
            if (u < 2.3) { go = 1; yaw = PI; } else if (u < 3.8) { go = 0.3; yaw = PI + Math.sin(u * 3) * 0.7; } else if (u < 6.1) { go = 1; yaw = 0; } else yaw = PI;
            const gy = z > -64 ? 0.14 : 0.14 - Math.min(0.3, (-64 - z) * 0.12), splash = u > 2.3 && u < 3.8;
            m.f.position.set(x + Math.sin(t * 0.5 + ph) * 0.7, gy - 0.03 * m.s + (splash ? Math.abs(Math.sin(u * 7)) * 0.16 : 0), z); turn(m.f, yaw, dt, 9);
            m.arms.forEach((a, i) => a.rotation.set(0, 0, (i ? 1 : -1) * 0.12)); m.ph += dt * go * 11; gait(m, m.ph, 0.9 * go); if (splash) m.arms.forEach((a, i) => a.rotation.set(-0.3, 0, (i ? 1 : -1) * (1.6 + Math.sin(u * 9 + i) * 0.5)));
            const sp = z < -64.3 ? (splash ? 1 : 0.6) : 0; fx.forEach((o, i) => { o.position.set(m.f.position.x + Math.cos(t * 7 + i * 2.1) * 0.3, 0.08, z + Math.sin(t * 7 + i * 2.1) * 0.3); o.scale.set(0.16 * sp, 0.07 * sp + 0.001, 0.16 * sp); }); }); };
        KIDS.forEach(([x, k, ph]) => waves(x, k, ph));
        // frisbee and catch: something thrown back and forth, a disc in a flat curving arc, a ball lobbed high
        const toss = (A, B2, kA, kB, o) => {
          const P = [A, B2].map((q, i) => live(pose(person(i ? kB : kA, { x: q[0], z: q[1], ry: i ? face(B2[0], B2[1], A[0], A[1]) : face(A[0], A[1], B2[0], B2[1]), kid: o.kids && i === 1 }), 'stand'))), it = live(put(o.k, node(A[0], 1.2, A[1], ...o.s), o.c)).o;
          BL.seg.push([A, B2]); take(A[0], A[1], 1); take(B2[0], B2[1], 1); BL.at[o.k === 'cyl' ? 'frisbee' : 'catch'] = it;
          const thr = (w) => (w < 0.1 ? 0.7 - 2.2 * (w / 0.1) : w < 0.4 ? -1.5 + 1.4 * ((w - 0.1) / 0.3) : -0.1), cat = (w) => (w < 0.45 ? -0.1 : w < 0.68 ? -0.1 - 1.3 * ((w - 0.45) / 0.23) : w < 0.85 ? -1.4 : -1.4 + 2.1 * ((w - 0.85) / 0.15));
          BL.acts.push((t) => { const u = ((t + o.ph) / o.T) % 2, h = Math.floor(u), w = u - h; P.forEach((m, i) => { m.arms[1].rotation.set(i === h ? thr(w) : cat(w), 0, 0.15); m.arms[0].rotation.set(-0.15, 0, -0.18); m.b.rotation.z = Math.sin(t * 0.8 + i) * 0.03; }); });
          BL.after.push((t) => { const u = ((t + o.ph) / o.T) % 2, h = Math.floor(u), w = u - h, a = hand(P[h], 1, V1), b2 = hand(P[1 - h], 1, V2), kf = Math.min(1, w / 0.7);
            if (kf >= 1) it.position.copy(b2); else { const arc = Math.sin(PI * kf), dx = b2.x - a.x, dz = b2.z - a.z, L = Math.hypot(dx, dz) || 1; it.position.set(a.x + dx * kf + (-dz / L) * arc * o.curve, a.y + (b2.y - a.y) * kf + arc * o.arc, a.z + dz * kf + (dx / L) * arc * o.curve); }
            it.rotation.set(o.tilt || 0, t * (o.spin || 0), 0); it.updateMatrixWorld(true); }); };
        toss([121, -45], [113, -55.5], 90, 91, { k: 'cyl', s: [0.14, 0.022, 0.14], c: '#ff6a2a', T: 1.7, ph: 0, arc: 0.7, curve: 1.3, spin: 25, tilt: 0.15 });
        toss([-127, -44.5], [-125.5, -55], 92, 93, { k: 'ball', s: [0.13, 0.13, 0.13], c: '#ffffff', T: 1.9, ph: 0.7, arc: 3.2, curve: 0, spin: 3, kids: true });
        // a dog: a body, a head with ears and a snout, a wagging tail and four legs, all boxes
        const dog = (c, c2, x, z) => { const d = frame(null, x, z), ents = [], pt = (par, cc, ...a) => { ents.push(put('box', node(...a), cc, par)); };
          d.rotation.order = 'YXZ'; d.position.y = 0.12; pt(d, c, 0, 0.45, 0, 0.26, 0.26, 0.62); const head = frame(d, 0, 0.36, 0, 0.58); pt(head, c, 0, 0.06, 0.04, 0.2, 0.2, 0.22); pt(head, c2, 0, 0.0, 0.19, 0.11, 0.1, 0.14); for (const sx of [-0.08, 0.08]) pt(head, c2, sx, 0.18, -0.02, 0.05, 0.11, 0.07, 0, 0, sx * 2);
          const tail = frame(d, 0, -0.3, 0, 0.55); pt(tail, c, 0, 0.12, -0.05, 0.05, 0.26, 0.05, 0, -0.5);
          const legs = [[-0.09, 0.22], [0.09, 0.22], [-0.09, -0.22], [0.09, -0.22]].map(([lx, lz]) => { const pv = frame(d, lx, lz, 0, 0.36); pt(pv, c, 0, -0.16, 0, 0.07, 0.34, 0.07); return pv; });
          return live({ f: d, head, tail, legs, ents, ph: 0 }); };
        const trot = (dg, go, t, dt, v = 1) => { dg.ph += dt * go * v * 7; dg.legs.forEach((l, i) => (l.rotation.x = Math.sin(dg.ph + ((i === 0 || i === 3) ? 0 : PI)) * 0.55 * go)); dg.tail.rotation.z = Math.sin(t * 14) * 0.6; dg.head.rotation.x = Math.sin(dg.ph * 2) * 0.06 * go; };
        const lines = []; BL.after.push(() => lines.forEach((l, i) => { const [a, b2] = l(); BL.lp.set([a.x, a.y, a.z, b2.x, b2.y, b2.z], i * 6); }));   // strings: leashes, fishing lines and kite strings, one draw for all
        // someone walking a dog along the water's edge, on a lead
        { const R = route([[22, -63.3], [122, -63.3], [122, -63.7], [22, -63.7]], 1.15), dg = dog('#c89a5a', '#8a5a2a', 22, -63.8); dg.f.position.y = 0.1;   // the lowest lane, at the top of the wet sand, the dog on the sea side
          const wm = walker(person(95, { top: tees[1], legs: '#3a4a6a' }), R, { after: (m) => { m.arms[1].rotation.set(-0.45, 0, 0.12); } });
          const at = (t) => { const q = along(R, t); return [q.x + Math.round(Math.sin(q.yaw)) * 0.75, q.z - 0.62, q.yaw]; };   // a step ahead, always on the sea side: at each end it swings round on that side, never back through its walker
          BL.acts.push((t, dt) => { const [x, z, yaw] = at(t), k = Math.min(1, dt * 4); dg.f.position.x += (x + Math.sin(t * 0.7) * 0.12 - dg.f.position.x) * k; dg.f.position.z += (z - dg.f.position.z) * k; turn(dg.f, yaw, dt, 6); trot(dg, 1, t, dt, 1.2); });
          crossers.push(at);
          lines.push(() => [hand(wm, 1, V1).clone(), dg.head.localToWorld(V2.set(0, 0, 0)).clone()]); BL.at.dog = dg.f; }
        // ...and one fetching a ball, out to where it lands and back
        { const O = [-77, -50], spots = [[-75.5, -56.2], [-80.5, -55.8], [-78, -57.2]], dg = dog('#22201e', '#f4f1e6', O[0], O[1] - 1), m = live(pose(person(96, { x: O[0], z: O[1], ry: PI, top: tees[4] }), 'stand')), bl = live(put('ball', node(0, 0, 0, 0.11, 0.11, 0.11), '#ffffff')).o;
          take(-78, -53.6, 4.8); BL.at.fetch = dg.f;   // east of the old parasols: every run out and back keeps clear of their loungers
          BL.acts.push((t, dt) => { const T = 7, n = Math.floor(t / T), u = t - n * T, L = spots[((n % 3) + 3) % 3], H = [O[0], O[1] - 0.9];
            m.f.rotation.y = face(O[0], O[1], L[0], L[1]); m.arms[1].rotation.set(u < 0.5 ? 0.8 - 3.2 * (u / 0.5) : u < 0.9 ? -2.4 + 2.3 * ((u - 0.5) / 0.4) : u > 5.6 ? -0.8 : -0.1, 0, 0.12);
            let dx, dz, go = 0, yaw;
            if (u < 0.6) { dx = H[0]; dz = H[1]; yaw = face(H[0], H[1], L[0], L[1]); }
            else if (u < 2.4) { const k = sstep(0, 1, (u - 0.6) / 1.8); dx = H[0] + (L[0] - H[0]) * k; dz = H[1] + (L[1] - H[1]) * k; go = 1; yaw = face(H[0], H[1], L[0], L[1]); }
            else if (u < 2.9) { dx = L[0]; dz = L[1]; yaw = null; }
            else if (u < 5.0) { const k = sstep(0, 1, (u - 2.9) / 2.1); dx = L[0] + (H[0] - L[0]) * k; dz = L[1] + (H[1] - L[1]) * k; go = 0.8; yaw = face(L[0], L[1], H[0], H[1]); }
            else { dx = H[0]; dz = H[1]; yaw = face(H[0], H[1], O[0], O[1]); }
            dg.f.position.x = dx; dg.f.position.z = dz; turn(dg.f, yaw, dt, 8); trot(dg, go, t, dt, 1.6); dg.head.rotation.x = u > 2.4 && u < 2.9 ? 0.6 : dg.head.rotation.x;
            bl.userData.u = u; bl.userData.L = L; });
          BL.after.push(() => { const u = bl.userData.u, L = bl.userData.L;
            if (u < 0.45) hand(m, 1, bl.position); else if (u < 1.6) { const k = (u - 0.45) / 1.15; hand(m, 1, V1); bl.position.set(V1.x + (L[0] - V1.x) * k, V1.y + (0.25 - V1.y) * k + Math.sin(PI * k) * 3, V1.z + (L[1] - V1.z) * k); }
            else if (u < 2.6) bl.position.set(L[0], 0.25, L[1]); else if (u < 5.6) dg.head.localToWorld(bl.position.set(0, -0.02, 0.27)); else hand(m, 1, bl.position);
            bl.updateMatrixWorld(true); }); }
        // joggers along the water's edge, and a couple strolling hand in hand
        { const R = route([[20, -61.3], [125, -61.3], [125, -62.3], [20, -62.3]], 2.9);   // the same pace on the same loop half a lap apart: they pass each other a metre apart and never catch up
          walker(person(97, { top: tees[2], legs: '#22252a', hat: '#22252a' }), R, { run: true }); walker(person(98, { top: '#22252a', legs: '#22252a' }), R, { run: true, off: R.T / 2 }); }
        walker(person(99, { top: tees[5] }), route([[-129, -61.3], [-64, -61.3], [-64, -62.1], [-129, -62.1]], 2.9), { run: true, off: 7 });
        { const R = route([[24, -60.2], [100, -60.2]], 0.9, [8, 8]); for (const [k, dz] of [[100, 0.3], [101, -0.3]]) walker(person(k, { top: k % 2 ? tees[3] : undefined }), R, { dz, after: (m) => { const sd = dz * Math.sin(m.f.rotation.y) > 0 ? 1 : 0; m.arms[sd].rotation.set(-0.15, 0, (sd ? 1 : -1) * 0.3); } }); }   // the inner hands reach for each other's
        // people walking from one spot to the next: from the ice-cream stand down to the water and back past the shower; a
        // surfer carrying a board down to the water; from the shaved-ice stand to the water and round the parasols
        { const m = person(102, { top: tees[6] }), hf = frame(m.arms[1], 0, 0, 0, -0.62); hf.rotation.x = 1.05; hold(m, 'cone', '#d9a55a', hf, 0, 0, 0.05, 0.04, 0.12, 0.04, 0, PI); hold(m, 'sph', '#f4c2d0', hf, 0, 0.09, 0.05, 0.05, 0.05, 0.05);   // an ice cream, held upright
          walker(m, route([[45.8, -34.6], [49.7, -42], [49.7, -59.2], [59.2, -57], [59.2, -40], [53, -37.1]], 1.05, [3, 0, 5, 0, 0, 4]), { after: (q, t) => q.arms[1].rotation.set(-1.05 - Math.max(0, Math.sin(t * 0.7)) * 0.7, 0, 0.1) }); }
        { const m = person(103, { top: '#141416', sleeves: '#141416', legs: '#141416' }); hold(m, 'sph', boardC[1], m.f, 0.36, 1.02, 0.1, 0.04, 0.27, 1.0);
          walker(m, route([[80, -36.2], [79.6, -58.3], [80.6, -58.3], [81, -36.2]], 1.0, [4, 0, 6]), { after: (q) => q.arms[1].rotation.set(0, 0, 0.3) }); }
        { const R = route([[-67.6, -44.4], [-71, -59.3], [-90, -59.3], [-90.5, -46.6], [-72.8, -47.6], [-67.6, -47.4]], 1.1, [3, 4, 0, 2, 0, 0]); walker(person(104, { top: tees[0] }), R); walker(person(105, { kid: true }), R, { side: 0.75 }); }   // a parent and a kid, back round the front of the queue, not through it
        // photos: someone snapping a couple posing with the sea behind them, the flash going off; someone shooting the sunset
        { const m = live(pose(person(106, { x: 31, z: -55.6, ry: PI, top: tees[7] }), 'stand')), ph = hold(m, 'box', '#1a1c20', m.arms[1], 0.1, -0.64, 0.05, 0.08, 0.15, 0.02), fl = hold(m, 'sph', '#ffffff', m.arms[1], 0.1, -0.66, 0.0, 0.001, 0.001, 0.001);
          const cp = [[30.4, -59.2, 107], [31.5, -59.3, 108]].map(([x, z, k]) => live(pose(person(k, { x, z }), 'stand')));
          take(31, -57.4, 2.6);
          BL.acts.push((t) => { const u = t % 6, n = Math.floor(t / 6) % 3, up = sstep(0, 0.6, u) * (1 - sstep(4.6, 5.4, u)), fx = u > 3.2 && u < 3.32;
            m.arms.forEach((a, i) => a.rotation.set(-1.45 * up, 0, (i ? -1 : 1) * 0.36 * up + (i ? 1 : -1) * 0.09)); fl.scale.setScalar(fx ? 0.09 : 0.001);
            cp.forEach((q, i) => { const P2 = up > 0.5; q.f.position.y = 0.11 + (n === 2 && P2 ? Math.abs(Math.sin(u * 5)) * 0.25 : 0);
              q.arms[i ? 0 : 1].rotation.set(0, 0, (i ? -1 : 1) * 0.6);   // an arm round each other
              q.arms[i ? 1 : 0].rotation.set(n === 0 && P2 ? -0.3 : 0, 0, (i ? 1 : -1) * (n === 0 && P2 ? 2.6 : n === 1 && P2 ? 1.2 : 0.09)); }); }); }
        { const m = live(pose(person(109, { x: -100, z: -58.6, ry: PI, top: tees[3], hat: '#e8d2a8' }), 'stand')); hold(m, 'box', '#22252a', m.arms[1], 0.0, -0.64, 0.06, 0.14, 0.09, 0.1);   // a camera
          take(-100, -58.6, 1.2);
          BL.acts.push((t) => { const u = t % 9, up = u < 6 ? 1 : 0.45; m.f.rotation.y = PI + Math.sin(t * 0.18) * 0.45; m.arms.forEach((a, i) => a.rotation.set(-1.85 * up, 0, (i ? -1 : 1) * 0.5 * up)); }); }
        // sandcastles being built: kids kneeling round it patting the sand, a grown-up watching
        for (const [x, z, k] of [[66, -56, 110], [89, -58, 112], [-96, -57.5, 114]]) {
          const F = frame(null, x, z, (rc() - 0.5) * 0.6); castle(F, 0, 0, rc() * 3); bucket(F, 1.0, 0.7, k); bucket(F, -0.9, -0.9, k + 1); take(x, z, 2.5);
          [[-1.15, 0.2, PI / 2], [0.35, 1.2, PI]].forEach(([bx, bz, ry], i) => { const m = live(pose(person(k + i, { par: F, x: bx, z: bz, ry, kid: true }), 'kneel', 0.14)), ph = rc() * 6;
            BL.acts.push((t) => m.arms.forEach((a, j) => a.rotation.set(-0.95 + Math.sin(t * (4 + i) + ph + j * 1.7) * 0.32, 0, (j ? -1 : 1) * 0.25))); });
          sitter(F, k + 5, 1.7, -0.2, -PI / 2 - 0.4);
        }
        // anglers on both breakwaters, facing the open sea: rods out, lines to bobbing floats; now and then a bite and a strike
        { const HC = [(HB.x0 + HB.x1) / 2, -62];
          piers.forEach((cv, k) => [0.56, 0.8].forEach((tt, i) => {   // out past the beaches, where the outer side is the sea
            const pt = cv.getPointAt(tt), tg = cv.getTangentAt(tt); let nx = -tg.z, nz = tg.x; if (nx * (pt.x - HC[0]) + nz * (pt.z - HC[1]) < 0) { nx = -nx; nz = -nz; }
            const x = pt.x + nx * 0.5, z = pt.z + nz * 0.5, kk = 115 + k * 2 + i, m = live(pose(person(kk, { x, z, ry: Math.atan2(nx, nz), top: ['#3f5a3a', '#6a5a4a', '#2a3a5a', '#7a2a2a'][kk % 4], legs: '#4a4a52', sleeves: kk % 2 ? '#3f5a3a' : undefined, hat: '#d8c8a0' }), 'stand', 1.4));
            const rp = frame(m.f, 0.12, 0.35, 0, 1.1); hold(m, 'box', '#22252a', rp, 0, 1.8, 0, 0.03, 3.6, 0.03); hold(m, 'box', '#c8ccd0', rp, 0, 0.25, 0.05, 0.08, 0.08, 0.08);   // the rod, and its reel
            const fl = live(put('sph', node(x + nx * 7.5, 0.1, z + nz * 7.5, 0.07, 0.09, 0.07), '#ef3a2a')).o, ph = rc() * 30;
            S('box', '#2457c5', null, x - tg.x * 0.9, 1.62, z - tg.z * 0.9, 0.5, 0.36, 0.34, Math.atan2(tg.x, tg.z)); S('cyl', '#e8e2d4', null, x + tg.x * 0.8, 1.55, z + tg.z * 0.8, 0.14, 0.26, 0.14);   // a cool box and a bait bucket
            BL.acts.push((t) => { const u = (t + ph) % 16, bite = u > 11 && u < 11.8, strike = sstep(11.8, 12.1, u) * (1 - sstep(12.6, 13.6, u));
              rp.rotation.x = 0.95 + (bite ? 0.25 + Math.sin(u * 30) * 0.05 : 0) - strike * 0.6; m.arms.forEach((a, j) => a.rotation.set(-0.8 - strike * 0.5, 0, (j ? -1 : 1) * 0.22));
              fl.position.y = 0.09 + Math.sin(t * 1.6 + ph) * 0.04 - (bite ? 0.12 : 0); });
            lines.push(() => [rp.localToWorld(V1.set(0, 3.6, 0)).clone(), fl.position]);
          })); }
        // kites over the sand, high over the water's edge, their strings to someone holding on with both hands
        for (const [x, z, k, c] of [[71, -37.6, 120, '#d23a2a'], [100, -36.8, 121, '#2a9fd6'], [-104, -42.2, 122, '#e8b23a']]) {
          const m = live(pose(person(k, { x, z, ry: PI, top: tees[k % tees.length] }), 'stand')), kt = live(put('kite', node(x, 14, z - 16, 1.3, 1.3, 1.3), c)).o, tail = [0, 1, 2, 3, 4, 5].map((i) => live(put('box', node(x, 12, z, 0.16, 0.05, 0.05), i % 2 ? '#f4f1e6' : c)).o), ph = rc() * 9;
          take(x, z, 1.4);
          BL.acts.push((t) => { kt.position.set(x + Math.sin(t * 0.23 + ph) * 5, 14 + Math.sin(t * 0.41 + ph) * 2.2, z - 17 + Math.cos(t * 0.19 + ph) * 3); kt.lookAt(x, 1.7, z); kt.rotateZ(Math.sin(t * 1.7 + ph) * 0.35);
            tail.forEach((o, i) => o.position.set(kt.position.x + Math.sin(t * 4 - i * 0.9 + ph) * 0.22 * (i + 1) / 6, kt.position.y - 0.75 - i * 0.3, kt.position.z - 0.2 - i * 0.2));
            m.arms.forEach((a, i) => a.rotation.set(-2.1 + Math.sin(t * 1.3 + ph) * 0.12 + i * 0.25, 0, (i ? -1 : 1) * 0.2)); m.f.rotation.y = PI + Math.sin(t * 0.23 + ph) * 0.25; });
          lines.push(() => [hand(m, 0, V1).clone(), kt.position]);
        }
        // a kayak out at sea, paddling up and down off the east beach
        for (const zk of [-78, -80.5, -83, -86]) {
          let ok = true; for (let x = 30; x <= 118; x += 4) ok = ok && seaClear(x, zk, 4) && seaClear(x, zk - 3, 4); if (!ok) continue;
          const m = live(person(123, { x: 30, z: zk, top: '#ef7a1a' })); pose(m, 'sit', 0.08); hold(m, 'sph', '#e8b23a', m.f, 0, 0.83, 0.1, 0.36, 0.2, 1.75); const pd = hold(m, 'box', '#22252a', m.b, 0, 0.42, 0.42, 2.2, 0.03, 0.05);
          for (const e of [-1, 1]) hold(m, 'box', '#e8b23a', pd, e * 0.4, 0, 0, 0.2, 0.67, 3.4);   // the blades (sized in the shaft's stretched frame)
          const R = route([[30, zk], [118, zk], [118, zk - 3], [30, zk - 3]], 1.4); BL.seg.length -= 4;
          BL.at.kayak = m.f; BL.acts.push((t, dt) => { const q = along(R, t); m.f.position.x = q.x; m.f.position.z = q.z; turn(m.f, q.yaw, dt, 1.2); m.f.position.y = 0.08 - 0.83 + Math.sin(t * 1.4) * 0.03; pd.rotation.set(0, Math.sin(t * 2.4) * 0.35, Math.sin(t * 2.4) * 0.45); m.arms.forEach((a, i) => a.rotation.set(-1.2 + Math.sin(t * 2.4 + i * PI) * 0.3, 0, (i ? -1 : 1) * 0.3)); });
          break;
        }

        // Camps: centres gathered round a few spots per beach (a loose crowd here, a gap there), never on a grid
        const camps = [];
        for (const [B, n, hot] of [[BE, 44, 10], [BW, 26, 6]]) {
          const xa = B === BE ? 24 : B.x0 + 4, xb = B === BE ? B.x1 - 4 : -66, spots = []; for (let i = 0; i < hot; i++) spots.push([xa + rc() * (xb - xa), -37 - rc() * 20, 4 + rc() * 7]);   // where they gather, and how loosely
          for (let i = 0, made = 0; i < 3000 && made < n; i++) { const h = spots[i % hot], a = rc() * PI * 2, d = Math.sqrt(-2 * Math.log(1 - rc() * 0.999)) * h[2], x = h[0] + Math.cos(a) * d, z = h[1] + Math.sin(a) * d * 0.7; if (!free(x, z, 2.4)) continue; take(x, z, 2.6); camps.push([x, z]); made++; }
        }
        camps.forEach(([x, z], ci) => {
          const F = frame(null, x, z, (rc() - 0.5) * 0.7), u = rc(), k = 130 + ci * 3;   // -Z towards the sea
          if (u < 0.2) {   // a family behind a windbreak: towels, a cool box, a bag, a bucket and spade, a ball, one lying, one sitting, a kid
            windbreak(F, 2.3, -1.2, 1.2, 4, ci); towel(F, -0.6, 0.3, 0.1, k); towel(F, 0.6, 0.4, -0.08, k + 1); cooler(F, 1.6, 1.4, 0.3, k); bag(F, -1.5, 1.2, -0.4, k); flops(F, -0.6, 1.5, 0.2, k); flops(F, 0.7, 1.6, -0.3, k + 1); bucket(F, 0.2, -1.2, k); if (rc() < 0.6) ball(F, -1.3, -0.6);
            lie(F, k, -0.6, 0.3, rc() < 0.5 ? 0.1 : PI + 0.1); sitter(F, k + 1, 0.6, 0.9, PI - 0.08); if (rc() < 0.6) sitter(F, k + 2, 0.4, -0.9, PI * 0.8, { kid: true });
          } else if (u < 0.4) {   // a parasol over two towels
            parasol(0, 0, ci, F, false); towel(F, -0.55, 0.4, 0.05, k); towel(F, 0.55, 0.3, -0.05, k + 2); cooler(F, 1.4, -0.6, 0.2, k + 1); bag(F, -1.3, 1.1, 0.3, k + 1); flops(F, 0.3, 1.6, 0, k);
            lie(F, k, -0.55, 0.4, 0.05); if (rc() < 0.6) lie(F, k + 1, 0.55, 0.3, PI - 0.05); else sitter(F, k + 1, 0.55, 0.8, PI - 0.05); if (rc() < 0.4) ball(F, 1.5, 1.2);
          } else if (u < 0.55) {   // a pop-up tent open to the sea, someone lying half in it
            S('dome', ['#2a7fd0', '#ef7a1a', '#3fae6a', '#e8d03a', '#c84a8a'][ci % 5], F, 0, 0.13, 0.4, 1.15, 0.95, 1.05); col(F, 0, 0.9, 0.9);
            towel(F, 0, 0.6, 0, k); towel(F, 0.2, -1.2, 0.15, k + 1); cooler(F, 1.4, 0.5, 0.4, k); bag(F, -1.35, 0.3, 0.2, k); flops(F, -0.4, -2.3, 0.1, k + 1);
            pose(person(k, { par: F, x: 0, z: 0.25, ry: PI }), 'back', 0.15); if (rc() < 0.6) sitter(F, k + 1, 0.2, -0.75, PI); if (rc() < 0.5) bucket(F, 1.0, -1.6, k);
          } else if (u < 0.72) {   // a couple side by side in the sun
            towel(F, -0.5, 0, 0.06, k); towel(F, 0.5, 0.1, -0.04, k + 3); bag(F, 0, 1.3, 0.1, k); flops(F, -0.5, 1.4, 0, k); flops(F, 0.5, 1.5, 0.2, k + 2); if (rc() < 0.5) cooler(F, 1.3, 0.8, 0.5, k);
            lie(F, k, -0.5, 0, 0.06); lie(F, k + 1, 0.5, 0.1, -0.04);
          } else if (u < 0.84) {   // surfers: boards stuck in the sand, one lying flat, wetsuits
            boards(F, 0, 1.3, 2 + (ci % 2), ci); towel(F, 0.2, -0.3, 0.1, k); S('sph', boardC[(ci + 5) % boardC.length], F, -1.3, 0.19, -0.4, 0.27, 0.045, 1.0, 0.2); bag(F, 1.6, 0.9, 0, k);
            sitter(F, k, 0.2, 0.1, PI, { top: '#141416', legs: '#141416', sleeves: '#141416' }); if (rc() < 0.5) { towel(F, 1.4, -0.6, -0.1, k + 1); lie(F, k + 1, 1.4, -0.6, -0.1 + PI); }
          } else if (u < 0.94) {   // friends round a cool box on a big mat, with a ball
            S('flat', towelC[ci % towelC.length], F, 0, 0.154, 0, 3.0, 1, 3.0, 0.3); cooler(F, 0, 0, 0.3, k); ball(F, 2.0, -1.5); bag(F, -1.9, 1.6, 0, k); bag(F, 1.8, 1.6, 0.6, k + 2);
            for (let i = 0; i < 3; i++) { const a = (i / 3) * PI * 2 + 0.4; sitter(F, k + i, Math.sin(a) * 1.4, Math.cos(a) * 1.4, a + PI); }
          } else {   // someone on their own with a book and a bag
            towel(F, 0, 0, 0, k); bag(F, 0.8, 0.9, 0.3, k); flops(F, -0.7, 1.0, 0, k); sitter(F, k, 0, 0.5, PI);
          }
        });

        // ...and in the gaps between the camps, one-person spots and things left lying about: a towel and someone in the
        // sun, a low beach chair, a bag with flip-flops and toys, a surfboard or two stuck in the sand
        const chair = (F, x, z, ry, k) => { const T = frame(F, x, z, ry), c = towelC[(k + 1) % towelC.length]; S('box', c, T, 0, 0.3, 0, 0.56, 0.04, 0.5); S('box', c, T, 0, 0.55, 0.3, 0.56, 0.56, 0.04, 0, -0.35);
          for (const [ax, az] of [[-0.26, -0.22], [0.26, -0.22], [-0.26, 0.24], [0.26, 0.24]]) S('box', '#b9bec4', T, ax, 0.22, az, 0.03, 0.18, 0.03); col(F, x, z, 0.45); return T; };
        for (let i = 0, made = 0; i < 2500 && made < 70; i++) {
          const east = i % 3 !== 2, x = east ? 22 + rc() * 104 : BW.x0 + 3 + rc() * (-65 - BW.x0), z = -35.5 - rc() * 22.5; if (!free(x, z, 1.1)) continue; take(x, z, 1.3); made++;
          const F = frame(null, x, z, (rc() - 0.5) * 0.9), u = rc(), k = 400 + made * 2;
          if (u < 0.4) { towel(F, 0, 0, 0, k); lie(F, k, 0, 0, rc() < 0.5 ? 0 : PI); if (rc() < 0.6) flops(F, 0.6, 1.0, 0.3, k); if (rc() < 0.4) bag(F, -0.65, 0.7, 0.2, k); }
          else if (u < 0.6) { chair(F, 0, 0, 0, k); const m = pose(person(k, { par: F, x: 0, z: 0.05, ry: PI }), 'sit', 0.33); m.b.rotation.x = -0.35; m.legs.forEach((l, j) => l.rotation.set(-0.95, 0, (j ? -1 : 1) * 0.12)); m.arms.forEach((a, j) => a.rotation.set(-0.7, 0, (j ? -1 : 1) * 0.3)); if (rc() < 0.5) S('box', toyC[k % toyC.length], m.b, 0, 0.32, 0.4, 0.22, 0.28, 0.03, 0, -0.5); bag(F, 0.6, 0.2, 0.4, k); }   // in a low chair, mostly reading
          else if (u < 0.75) { bag(F, 0, 0, rc() * 3, k); flops(F, 0.5, 0.3, rc() * 3, k + 1); if (rc() < 0.5) ball(F, -0.5, 0.4); else bucket(F, -0.5, 0.3, k); }
          else if (u < 0.85) boards(F, 0, 0, 1 + (made % 2), k);
          else { towel(F, 0, 0, 0, k); sitter(F, k, 0, 0.45, PI); }
        }
        // build the meshes: per kit, one for each stretch of sand about 40 m long with its still pieces, written once, and one
        // for each side of the harbour with everything that moves, the only ones copied again every frame. Each has a bounding
        // sphere round its own pieces (round the whole side and out to sea for the moving ones), so the renderer skips it when
        // it is out of the picture, and the shadow pass skips it when it is out of the sun's shadow box; p.lod hides what the
        // fog has swallowed. A couple of hundred thousand triangles no longer go out every frame wherever you are.
        BL.lives.forEach((x) => { (x.ents || [x]).forEach((e) => (e.dyn = true)); BL.roots.push(x.f || x.o); });
        const HM = (HB.x0 + HB.x1) / 2, VP = new THREE.Vector3(), MS = BL.meshes = [];
        for (const n in K) { const q = K[n]; if (!q.list.length) continue; const few = q.list.length < 40, grp = {};
          q.list.forEach((e) => { e.o.updateWorldMatrix(true, false); const x = e.o.matrixWorld.elements[12], sd = x > HM ? 'E' : 'W', key = sd + (e.dyn ? 'L' : few ? 'S' : Math.floor((x - (sd === 'E' ? BE.x0 : BW.x0)) / 40)); (grp[key] = grp[key] || { sd, dyn: !!e.dyn, list: [] }).list.push(e); });
          for (const key in grp) { const G = grp[key], geo = new THREE.BufferGeometry(), bx = new THREE.Box3();
            geo.index = q.geo.index; for (const a in q.geo.attributes) geo.setAttribute(a, q.geo.attributes[a]);   // the kit's own buffers (uploaded once), bounds of its own
            G.list.forEach((e) => { const m = e.o.matrixWorld.elements, r = Math.max(Math.hypot(m[0], m[1], m[2]), Math.hypot(m[4], m[5], m[6]), Math.hypot(m[8], m[9], m[10])) * 1.8 + 0.1; bx.expandByPoint(VP.set(m[12] - r, m[13] - r, m[14] - r)).expandByPoint(VP.set(m[12] + r, m[13] + r, m[14] + r)); });
            if (G.dyn) { const B = G.sd === 'E' ? BE : BW; bx.expandByScalar(9).expandByPoint(VP.set(B.x0 - 2, -1.5, B.z1 - 4)).expandByPoint(VP.set(B.x1 + 2, 3, -30)); }   // where they go: all along their side, out to sea, up with the kites
            geo.boundingBox = bx; geo.boundingSphere = bx.getBoundingSphere(new THREE.Sphere());
            const im = new THREE.InstancedMesh(geo, q.m, G.list.length); G.list.forEach((e, i) => { im.setMatrixAt(i, e.o.matrixWorld); im.setColorAt(i, e.c); });
            im.castShadow = !q.flat; im.receiveShadow = true; im.frustumCulled = true; g.add(im); MS.push({ im, list: G.list, dyn: G.dyn, box: bx, kit: n }); } }   // r128's InstancedMesh turns culling off: the sphere above makes it safe to turn back on
        { const lg = new THREE.BufferGeometry(); BL.lp = new Float32Array(Math.max(1, lines.length) * 6); lg.setAttribute('position', new THREE.BufferAttribute(BL.lp, 3));
          const lm = new THREE.LineBasicMaterial({ color: lin('#ece6d6'), transparent: true, opacity: 0.55 }); lm.userData.lin = true; const ls = new THREE.LineSegments(lg, lm); ls.frustumCulled = false; g.add(ls); BL.lg = lg; BL.ls = ls; }
        BL.tick = (t, dt) => {
          BL.acts.forEach((a) => a(t, dt)); BL.roots.forEach((o) => o.updateMatrixWorld(true)); BL.after.forEach((a) => a(t));
          for (const M of MS) { if (!M.dyn || !M.im.visible) continue; M.list.forEach((e, i) => M.im.setMatrixAt(i, e.o.matrixWorld)); M.im.instanceMatrix.needsUpdate = true; }
          BL.lg.attributes.position.needsUpdate = true;
        };
        // out of sight in the fog: a mesh whose nearest point is further than 1.5x the fog's far end (anywhere in the picture
        // the depth the fog goes by is at least two thirds of the distance) is not drawn at all
        p.lod = (lx, lz, far) => { const R = far * 1.5 + 12; let any = false; for (const M of MS) { const b = M.box, dx = Math.max(b.min.x - lx, 0, lx - b.max.x), dz = Math.max(b.min.z - lz, 0, lz - b.max.z); M.im.visible = dx * dx + dz * dz < R * R; any = any || (M.dyn && M.im.visible); } BL.ls.visible = any; };
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

      p.map = [{ t: 'circle', x: 0, z: 0, r: HR, c: '#5d7342' }, { t: 'rect', x: 0, z: -230, w: 700, h: 400, c: '#244f73' }, { t: 'rect', x: 0, z: RZ, w: HALF * 2, h: 8, c: '#3a393c' }].concat(chanMap, cn ? cn.map : []).concat(p.map2 || []);
      p.grade = {
        top: '#4c86c8', bottom: '#ffd69c', fog: '#f1c99c', near: 70, far: 460,
        sun: '#ffd08a', sunInt: 2.9, hemi: 0.75, sunDir: [0.07, 0.06, -1],
        tint: [1.08, 1.0, 0.9], expo: 1.04, sat: 1.15, stars: 0,
      };
      p.face = Math.PI;
      p.pathEnd = 3;
      p.clearR = HR + 3;
      p.core = (lx, lz) => Math.hypot(lx, lz) < HR + 4 || (lz < -6 && lz > -500 && Math.abs(lx) < 360);
      p.blocks = (lx, lz) => p.core(lx, lz) || (cn && cn.blocks(lx, lz));   // no trees in the canal's cutting either (its core alone keeps the hills off)
      p.scrubOut = (lx, lz) => Math.hypot(lx, lz) < HR + 4 || (cn && cn.blocks(lx, lz));   // the game's hills on the sea side may carry scrub (its hill, the cutting and the shafts' heads not)

      let speed = 0;
      p.update = (t, dt, f, v, viewing) => {
        sea.material.uniforms.t.value = t;
        if (p.liftTick) p.liftTick(t);   // the beach lay-by's lift
        if (chanWater) chanWater.normalMap.offset.set(t * 0.012, t * 0.02);
        if (cn) cn.update(t);
        BL.tick(t, dt);   // everyone on the beaches
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
