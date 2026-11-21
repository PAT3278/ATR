/*
 * The street under the viaduct: from the end of the street that turns north off FLIP's avenue under the ring road (in
 * places.js), on under the deck, round behind the funfair, under SHOT's expressway and through a cutting in the coast
 * hills, and down to the back of OHH's north-west beach, where it runs along the sand to the beach lay-by's lift. Along
 * the beach, tucked under and beside the viaduct: a car dealer's glass showroom (SEASIDE MOTORS, where you choose the car
 * that waits for you up at the beach lay-by), a two-bay garage with a car up on the lift, and a small used-car lot.
 *
 *   SW.Street.make(ring, places) -> the street's line and what the world asks of it (before the hills and the piers:
 *                                   the hills are cut away along it and no pier stands in it)
 *   SW.Street.build(S, E, w)     -> its meshes, colliders and the showroom; w: { scene, boxes, circles, interact, pick }
 *
 * The street runs on the ring road's outer side (the piers stand in a single row down the deck's middle), crossing
 * under the deck from the inner side where FLIP's street ends. Offsets o across it are measured along n, the normal
 * towards the outside of the town (on the beach road, the sea): the carriageway is -HW..HW, a kerbed pavement runs
 * along the outer side (HW..HW + PAVE), and along the beach road a second one on the land side, in front of the shops.
 */
(function () {
  'use strict';
  const SW = (window.SW = window.SW || {});
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const HW = 3.45, PAVE = 1.6, LAND = 1.2, RY = 0.03, PY = 0.15;
  // In OHH's frame (x along its road, +z towards the town): the beach road's centre line, and the shops' plots on its land side
  const BZ = -26.2, FRONT = BZ + HW + LAND;   // the shops' fronts (the land pavement's back edge)
  const PADS = {
    lot: { x0: 38.5, x1: 49, z0: FRONT, z1: -17, y: 0.04 },   // (short of the pier behind it)
    garage: { x0: 50.2, x1: 61.5, z0: FRONT, z1: -13.5, y: 0.06 },
    show: { x0: 64.5, x1: 78, z0: FRONT, z1: -12, y: 0.2 },
  };

  function make(ring, places) {
    const R = ring && ring.roads && ring.roads[0], find = (k) => places.find((p) => p.song.scene === k);
    const flip = find('flip'), ohh = find('ohh');
    if (!R || !R.X || !flip || !ohh || !flip.vd) return null;
    const br = flip.vd.branches.find((b) => b.dir === -1);
    if (!br || !br.length) return null;
    const N = R.N, W = (i) => ((i % N) + N) % N;
    const rs = (i) => {
      const j = W(i), a = W(i - 1), b = W(i + 1); let tx = R.X[b] - R.X[a], tz = R.Z[b] - R.Z[a]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      let nx = -tz, nz = tx; if (nx * R.X[j] + nz * R.Z[j] < 0) { nx = -nx; nz = -nz; }
      return { x: R.X[j], z: R.Z[j], nx, nz };
    };
    // the line: from FLIP's street's end (on the inner side, C in from the centre line) out across under the deck to its
    // outer side, on round the ring (against its s) until it comes down the coast towards OHH, then away from the deck down
    // to the back of the beach and along it
    const iE = br[br.length - 1].i, C0 = -flip.vd.C, O1 = 5.2, ctl = [];
    for (let k = 0; k < N; k += 2) {
      const q = rs(iE - k), o = C0 + (O1 - C0) * sm(2, 26, k);
      ctl.push(new THREE.Vector3(q.x + q.nx * o, 0, q.z + q.nz * o));
      if (k > 60 && ohh.local(q.x, q.z).z < 9) break;
    }
    for (const [lx, lz] of [[92.5, -5], [91, -15], [86, -22.6], [78, BZ], [64, BZ], [50, BZ], [39, BZ]]) { const w = ohh.toWorld(lx, lz); ctl.push(new THREE.Vector3(w.x, 0, w.z)); }
    const curve = new THREE.CatmullRomCurve3(ctl, false, 'centripetal'), n = Math.round(curve.getLength() / 1.6);
    const P = curve.getSpacedPoints(n).map((v) => ({ x: v.x, z: v.z }));
    P.forEach((q, k) => {
      const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)]; let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; q.tx = tx / l; q.tz = tz / l;
      q.nx = -q.tz; q.nz = q.tx;
    });
    { const m = P[Math.floor(P.length * 0.4)], s = m.nx * m.x + m.nz * m.z < 0 ? -1 : 1; P.forEach((q) => { q.nx *= s; q.nz *= s; }); }   // n: towards the outside of the town
    // under the deck: its height where the centre line of the street is under it; on the beach road: its land pavement
    P.forEach((q) => {
      let b = 1e9, j = 0; for (let i = 0; i < N; i++) { const d = Math.hypot(R.X[i] - q.x, R.Z[i] - q.z); if (d < b) { b = d; j = i; } }
      q.deck = b < R.HW[j] - 0.8 ? R.Y[j] : null;
      const l = ohh.local(q.x, q.z); q.beach = l.z < BZ + 1 && l.x < 80;
    });
    const lo = (k) => -HW - (P[k].beach ? LAND : 0), hi = HW + PAVE;

    // nearest point of the line: a coarse grid of the segments near each cell
    const G = 8, x0 = Math.min(...P.map((q) => q.x)) - 16, z0 = Math.min(...P.map((q) => q.z)) - 16, gx = Math.ceil((Math.max(...P.map((q) => q.x)) + 16 - x0) / G), gz = Math.ceil((Math.max(...P.map((q) => q.z)) + 16 - z0) / G);
    const cells = new Map();
    for (let k = 1; k < P.length; k++) {
      const a = P[k - 1], b = P[k], i0 = Math.floor((Math.min(a.x, b.x) - 12 - x0) / G), i1 = Math.floor((Math.max(a.x, b.x) + 12 - x0) / G), j0 = Math.floor((Math.min(a.z, b.z) - 12 - z0) / G), j1 = Math.floor((Math.max(a.z, b.z) + 12 - z0) / G);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const key = j * gx + i; if (!cells.has(key)) cells.set(key, []); cells.get(key).push(k); }
    }
    const Q = { d: 0, o: 0, k: 0 };
    const query = (x, z) => {   // -> Q (d: distance from the centre line, o: signed offset along n, k: the segment's end) or null when far off
      const i = Math.floor((x - x0) / G), j = Math.floor((z - z0) / G); if (i < 0 || j < 0 || i >= gx || j >= gz) return null;
      const list = cells.get(j * gx + i); if (!list) return null;
      let best = 1e9;
      for (const k of list) {
        const a = P[k - 1], b = P[k], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
        const px = a.x + dx * t, pz = a.z + dz * t, d = Math.hypot(x - px, z - pz);
        if (d < best) { best = d; Q.d = d; Q.k = k; Q.o = (x - px) * (a.nx + (b.nx - a.nx) * t) + (z - pz) * (a.nz + (b.nz - a.nz) * t); }
      }
      return best < 1e9 ? Q : null;
    };
    const padOf = (x, z) => { const l = ohh.local(x, z); let best = 1e9, pad = null; for (const k in PADS) { const p = PADS[k], d = Math.max(p.x0 - l.x, l.x - p.x1, p.z0 - l.z, l.z - p.z1); if (d < best) { best = d; pad = p; } } return { d: best, pad }; };
    const S = {
      P, HW, PAVE, LAND, PADS, BZ, FRONT, ohh, R,
      // how much of the hills may stand here: none on the street or the shops' plots, all of them 6 m off
      mask(x, z) { const q = query(x, z), m = q ? sm(hi + 0.2, hi + 6.5, q.d) : 1; return Math.min(m, sm(0.5, 6, padOf(x, z).d)); },
      // within m of the street (its pavements too) or of a plot: no tree, bush or stone
      clear(x, z, m) { const q = query(x, z); return (!!q && q.o > lo(q.k) - m && q.o < hi + m) || padOf(x, z).d < m; },
      // no pier in the street or its pavements (one standing beside it, as the ring road's own do down its middle, is fine)
      pier(x, z) { const q = query(x, z); return (!!q && q.o > lo(q.k) - 1.4 && q.o < hi + 1.4) || padOf(x, z).d < 1; },
      // the ground: the pavements' kerbed top, the carriageway, the plots' floors
      ground(x, z) {
        const pp = padOf(x, z); if (pp.d < 0) return pp.pad.y;
        const q = query(x, z); if (!q || q.o < lo(q.k) || q.o > hi) return 0;
        if ((q.k === 1 || q.k === P.length - 1) && Math.abs(q.o) < q.d - 0.05) return 0;   // past either end
        return q.o > HW || q.o < -HW ? PY : RY;
      },
    };
    return S;
  }

  function build(S, E, w) {
    const { P, ohh } = S, g = new THREE.Group(); w.scene.add(g);
    const lin = (m) => { m.userData.lin = true; return m; };
    // a ribbon along the line between two offsets, at height y (o0, o1 may be functions of the point); and an upright one
    const ribbon = (o0, o1, y, m, k0 = 0, k1 = P.length - 1, uvS = 7.5) => {
      const pos = [], uv = [], idx = [], F = (o, q) => (typeof o === 'function' ? o(q) : o);
      for (let k = k0; k <= k1; k++) { const q = P[k]; for (const o of [F(o0, q), F(o1, q)]) { const x = q.x + q.nx * o, z = q.z + q.nz * o; pos.push(x, y, z); uv.push(x / uvS, -z / uvS); } if (k > k0) { const v = (k - k0) * 2; idx.push(v - 2, v - 1, v, v - 1, v + 1, v); } }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
      const nrm = new Float32Array(pos.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1; geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      const me = new THREE.Mesh(geo, m); me.receiveShadow = true; g.add(me); return me;
    };
    const kerb = (o, y0, y1, m, k0 = 0, k1 = P.length - 1) => {
      const pos = [], idx = [];
      for (let k = k0; k <= k1; k++) { const q = P[k], x = q.x + q.nx * o, z = q.z + q.nz * o; pos.push(x, y0, z, x, y1, z); if (k > k0) { const v = (k - k0) * 2; idx.push(v - 2, v - 1, v, v - 1, v + 1, v); } }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      const me = new THREE.Mesh(geo, m); g.add(me); return me;
    };
    const asph = E.mat('#2b2830', { map: E.tex('asphalt', 1, 1), rough: 0.9 }, true), pave = E.mat('#a49e94', { map: E.tex('paving', 1, 1), rough: 0.9 }, true), kerbM = E.mat('#bdb7ab', { rough: 0.85 }, true), lineM = E.mat('#d9d4de', {}, true);
    for (const m of [asph, pave, kerbM, lineM]) m.side = THREE.DoubleSide;
    const kb = P.findIndex((q) => q.beach), last = P.length - 1;
    w.pick(ribbon(-S.HW, S.HW, RY, asph));
    w.pick(ribbon(S.HW, S.HW + S.PAVE, PY, pave)); kerb(S.HW, 0, PY, kerbM); kerb(S.HW + S.PAVE, -0.3, PY, kerbM);
    if (kb >= 0) { w.pick(ribbon(-S.HW - S.LAND, -S.HW, PY, pave, kb, last)); kerb(-S.HW, 0, PY, kerbM, kb, last); }
    // markings: the edge lines solid, a dashed line down the middle
    ribbon(-S.HW + 0.2, -S.HW + 0.32, 0.036, lineM); ribbon(S.HW - 0.32, S.HW - 0.2, 0.036, lineM);
    const B = E.batch(g), bx = B.box, whiteM = E.mat('#d9d4de'), postM = E.mat('#5a6068', { metal: 0.5, rough: 0.5 }), lampM = E.basic('#ffb04a'), lampW = E.basic('#fff1d0');
    for (let k = 1; k < P.length; k += 2) { const a = P[k - 1], q = P[k], d = bx(0.12, 0.012, 1.1, (a.x + q.x) / 2, 0.036, (a.z + q.z) / 2, whiteM, false); d.rotation.y = Math.atan2(q.x - a.x, q.z - a.z); }
    // lamps: sodium ones hung under the deck; out from under it, along the beach, posts on the sea side with a lantern
    for (let k = 3; k < P.length; k += 7) {
      const q = P[k];
      if (q.deck) { const l = bx(1.0, 0.12, 0.32, q.x, q.deck - 1.1, q.z, lampM, false); l.rotation.y = Math.atan2(q.nx, q.nz); bx(0.05, 0.5, 0.05, q.x, q.deck - 0.8, q.z, postM); continue; }
      const o = S.HW + S.PAVE - 0.35, x = q.x + q.nx * o, z = q.z + q.nz * o;
      bx(0.12, 4.6, 0.12, x, 2.3 + PY, z, postM); const arm = bx(0.08, 0.08, 1.2, x - q.nx * 0.55, 4.75, z - q.nz * 0.55, postM); arm.rotation.y = Math.atan2(q.nx, q.nz);
      bx(0.5, 0.16, 0.3, x - q.nx * 1.1, 4.65, z - q.nz * 1.1, lampW, false); w.circles.push({ x, z, r: 0.15 });
    }
    // where it ends: bollards across the road, the sand and the lift on past them
    { const q = P[last]; for (let o = -S.HW; o <= S.HW + 0.01; o += 1.15) { const x = q.x + q.nx * o + q.tx * 0.4, z = q.z + q.nz * o + q.tz * 0.4; bx(0.2, 0.9, 0.2, x, 0.45, z, E.mat('#e8c43a', { rough: 0.5 })); bx(0.21, 0.12, 0.21, x, 0.7, z, E.mat('#202226'), false); w.circles.push({ x, z, r: 0.18 }); } }
    // a sign where it sets off from FLIP's street, and one where it comes out from under the deck by the sea
    const signM = (txt) => { const m = new THREE.MeshBasicMaterial({ map: E.textTex(txt, { w: 512, h: 220, color: '#ffffff', bg: '#1f55b8', font: '700 76px "Hind","Noto Sans JP",sans-serif', font2: '700 44px "Hind","Noto Sans JP",sans-serif' }), side: THREE.DoubleSide }); m.userData.lin = true; return m; };
    for (const [k, txt] of [[Math.min(last, 14), 'BEACH  ↑\n海岸 · SEASIDE MOTORS'], [Math.max(0, kb - 30), 'BEACH  ↑\n海岸 · CAR SHOP']]) {
      const q = P[k], o = S.HW + S.PAVE - 0.4, x = q.x + q.nx * o, z = q.z + q.nz * o;
      bx(0.12, 3.2, 0.12, x, 1.6 + PY, z, postM); w.circles.push({ x, z, r: 0.15 });
      const s = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.82), signM(txt)); s.position.set(x - q.tx * 0.08, 3.0, z - q.tz * 0.08); s.rotation.y = Math.atan2(-q.tx, -q.tz); g.add(s);
    }
    B.flush();

    // ---- the shops, in OHH's frame ----
    const sg = new THREE.Group(); sg.position.set(ohh.x, 0, ohh.z); sg.rotation.y = ohh.rot; g.add(sg);
    const SB = E.batch(sg), sb = SB.box;
    const lbox = (lx, lz, hx, hz, y0 = -1e9, y1 = 1e9, yaw = 0) => { const p = ohh.toWorld(lx, lz), a = ohh.rot + yaw, b = { x: p.x, z: p.z, hx, hz, c: Math.cos(a), s: Math.sin(a), y0, y1 }; w.boxes.push(b); return b; };
    const lcirc = (lx, lz, r) => { const p = ohh.toWorld(lx, lz); w.circles.push({ x: p.x, z: p.z, r }); };
    const slab = (pad, m) => { const me = new THREE.Mesh(new THREE.BoxGeometry(pad.x1 - pad.x0, 0.3, pad.z1 - pad.z0), m); me.position.set((pad.x0 + pad.x1) / 2, pad.y - 0.15, (pad.z0 + pad.z1) / 2); me.receiveShadow = true; sg.add(me); w.pick(me); };
    const glassM = lin(new THREE.MeshStandardMaterial({ color: new THREE.Color('#9fc4d8').convertSRGBToLinear(), roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
    const frameM = E.mat('#2a2d33', { metal: 0.6, rough: 0.4 }), whiteW = E.mat('#f1eee8', { rough: 0.7 }), blockM = E.mat('#9a968e', { map: E.tex('concrete', 1, 1), rough: 0.92 }), panelL = E.basic('#f4f8ff');
    const yel = E.mat('#e8c43a', { rough: 0.5 }), red = E.mat('#c8312a', { rough: 0.5 }), dark = E.mat('#1c1d21', { rough: 0.8 }), tyreM = E.mat('#151517', { rough: 0.95 });
    const plate = (txt, w0, h0, o) => { const m = new THREE.MeshBasicMaterial({ map: E.textTex(txt, Object.assign({ w: 1024, h: 200, color: '#ffffff', bg: '#16233f', font: '900 104px "Hind","Noto Sans JP",sans-serif', font2: '700 46px "Hind","Noto Sans JP",sans-serif' }, o)), side: THREE.DoubleSide }); m.userData.lin = true; return new THREE.Mesh(new THREE.PlaneGeometry(w0, h0), m); };
    const cars = SW.Cars ? (i) => SW.Cars.make(E, i % SW.Cars.models.length) : null;
    const carAt = (parent, i, x, y, z, yaw) => { if (!cars) return null; const c = cars(i); c.position.set(x, y, z); c.rotation.y = yaw; parent.add(c); return c; };
    const carBox = (x, z, yaw, y0 = -1e9) => lbox(x, z, 0.95, 2.2, y0, 1e9, yaw);

    // SEASIDE MOTORS: a glass showroom facing the road and the sea, white inside, a car turning on a turntable in the middle
    // (the one you choose at the desk: it is the one that then waits up at the beach lay-by), two more either side of it
    const SH = S.PADS.show, sw = SH.x1 - SH.x0, sd = SH.z1 - SH.z0, sx = (SH.x0 + SH.x1) / 2, sz = (SH.z0 + SH.z1) / 2, H = 5.0, DOOR = 2.4;
    const turn = new THREE.Group(), turnAt = [sx, SH.y, sz + 0.6];
    const show = { turn, cache: [], cur: -1, desk: [SH.x0 + 2.1, SH.z1 - 1.0] };
    {
      slab(SH, E.mat('#e9e7e2', { rough: 0.25, metal: 0.05 }));
      sb(sw, H, 0.3, sx, SH.y + H / 2, SH.z1 - 0.15, whiteW); lbox(sx, SH.z1 - 0.15, sw / 2, 0.15);   // back wall
      sb(0.3, H, sd, SH.x0 + 0.15, SH.y + H / 2, sz, whiteW); lbox(SH.x0 + 0.15, sz, 0.15, sd / 2);   // west wall
      // the glass: the front either side of the doorway, and the east side
      for (const [a, b2] of [[SH.x0 + 0.3, sx - DOOR / 2], [sx + DOOR / 2, SH.x1]]) { const gl = new THREE.Mesh(new THREE.PlaneGeometry(b2 - a, H - 0.1), glassM); gl.position.set((a + b2) / 2, SH.y + H / 2, SH.z0 + 0.06); sg.add(gl); lbox((a + b2) / 2, SH.z0 + 0.06, (b2 - a) / 2, 0.1); }
      { const gl = new THREE.Mesh(new THREE.PlaneGeometry(sd, H - 0.1), glassM); gl.rotation.y = Math.PI / 2; gl.position.set(SH.x1 - 0.06, SH.y + H / 2, sz); sg.add(gl); lbox(SH.x1 - 0.06, sz, 0.1, sd / 2); }
      for (let x = SH.x0 + 0.3; x <= SH.x1 + 0.01; x += (sw - 0.3) / 5) sb(0.12, H, 0.14, x, SH.y + H / 2, SH.z0 + 0.06, frameM);
      for (const x of [sx - DOOR / 2, sx + DOOR / 2]) sb(0.14, H, 0.16, x, SH.y + H / 2, SH.z0 + 0.06, frameM);
      for (let z = SH.z0; z <= SH.z1 + 0.01; z += sd / 3) sb(0.14, H, 0.12, SH.x1 - 0.06, SH.y + H / 2, z, frameM);
      sb(sw, 0.12, 0.16, sx, SH.y + 2.9, SH.z0 + 0.06, frameM); sb(0.16, 0.12, sd, SH.x1 - 0.06, SH.y + 2.9, sz, frameM);
      sb(DOOR, 0.5, 0.18, sx, SH.y + H - 0.25, SH.z0 + 0.06, frameM);   // over the doorway
      // the roof, overhanging; the fascia over the glass with the name
      sb(sw + 1.0, 0.45, sd + 1.2, sx, SH.y + H + 0.22, sz - 0.3, whiteW);
      sb(sw + 1.0, 1.1, 0.22, sx, SH.y + H + 0.1, SH.z0 - 0.85, E.mat('#16233f', { rough: 0.6 }));
      { const n = plate('SEASIDE MOTORS\nシーサイドモータース  新車 · 中古車 · 試乗', sw * 0.82, 1.0); n.position.set(sx, SH.y + H + 0.12, SH.z0 - 0.97); n.rotation.y = Math.PI; sg.add(n); }
      // lights in the ceiling
      for (const z of [SH.z0 + 2, sz, SH.z1 - 2]) for (const x of [SH.x0 + 3, sx, SH.x1 - 3]) sb(1.8, 0.06, 0.5, x, SH.y + H - 0.05, z, panelL, false);
      // the turntable, with a ring of light round its rim
      { const tt = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.75, 0.14, 40), E.mat('#3a3c42', { rough: 0.35, metal: 0.5 })); tt.position.set(turnAt[0], turnAt[1] + 0.07, turnAt[2]); tt.receiveShadow = true; sg.add(tt);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(2.74, 0.04, 6, 48), E.basic('#bfe4ff')); rim.rotation.x = Math.PI / 2; rim.position.set(turnAt[0], turnAt[1] + 0.13, turnAt[2]); sg.add(rim);
        turn.position.set(turnAt[0], turnAt[1] + 0.14, turnAt[2]); sg.add(turn); lcirc(turnAt[0], turnAt[2], 2.75); }
      carAt(sg, 2, SH.x0 + 2.4, SH.y, sz + 0.2, Math.PI + 0.35); carBox(SH.x0 + 2.4, sz + 0.2, 0.35);
      carAt(sg, 6, SH.x1 - 2.4, SH.y, sz + 0.2, Math.PI - 0.35); carBox(SH.x1 - 2.4, sz + 0.2, -0.35);
      // the desk at the back, and a stand with the brochures
      sb(2.2, 0.95, 0.7, show.desk[0], SH.y + 0.475, show.desk[1], whiteW); sb(2.24, 0.05, 0.74, show.desk[0], SH.y + 0.97, show.desk[1], E.mat('#2a6fd0', { rough: 0.4 })); lbox(show.desk[0], show.desk[1], 1.1, 0.35);
      sb(0.5, 1.2, 0.3, SH.x1 - 1.2, SH.y + 0.6, SH.z1 - 0.5, E.mat('#2a6fd0', { rough: 0.4 }));
      // のぼり out front, and the welcome mat
      sb(DOOR, 0.02, 1.2, sx, SH.y + 0.01, SH.z0 + 0.8, E.mat('#1f3a6a', { rough: 0.9 }), false);
    }

    // PIT GARAGE: two bays in a block shed under the deck, roll-up doors, a car up on the two-post lift in one, another
    // in for a service in the other; tyres, a tool chest, a bench, drums by the door
    const GA = S.PADS.garage;
    {
      const gw = GA.x1 - GA.x0, gd = GA.z1 - GA.z0, gx = (GA.x0 + GA.x1) / 2, gz = (GA.z0 + GA.z1) / 2, GH = 4.4, mid = gx;
      slab(GA, E.mat('#8f8b84', { map: E.tex('concrete', 1, 1), rough: 0.85 }));
      sb(gw, GH, 0.3, gx, GA.y + GH / 2, GA.z1 - 0.15, blockM); lbox(gx, GA.z1 - 0.15, gw / 2, 0.15);
      for (const x of [GA.x0 + 0.15, GA.x1 - 0.15]) { sb(0.3, GH, gd, x, GA.y + GH / 2, gz, blockM); lbox(x, gz, 0.15, gd / 2); }
      sb(0.3, GH, gd - 1.2, mid, GA.y + GH / 2, gz + 0.6, blockM); lbox(mid, gz + 0.6, 0.15, (gd - 1.2) / 2);   // between the bays
      sb(gw + 0.4, 0.3, gd + 0.5, gx, GA.y + GH + 0.15, gz - 0.1, blockM);   // the roof
      sb(gw + 0.4, 0.8, 0.25, gx, GA.y + GH - 0.1, GA.z0 - 0.25, dark);   // the lintel, with the roll-up doors' drums behind it
      for (const x of [(GA.x0 + mid) / 2, (mid + GA.x1) / 2]) { const dr = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, gw / 2 - 0.5, 10), E.mat('#7a7e84', { metal: 0.4, rough: 0.5 })); dr.rotation.z = Math.PI / 2; dr.position.set(x, GA.y + GH - 0.35, GA.z0 + 0.3); sg.add(dr); }
      // the east bay's door half down
      { const x = (mid + GA.x1) / 2; for (let y = 2.5; y < GH - 0.55; y += 0.18) sb(gw / 2 - 0.5, 0.15, 0.06, x, GA.y + y, GA.z0 + 0.12, E.mat('#b8bcc2', { metal: 0.5, rough: 0.45 })); sb(gw / 2 - 0.5, 0.08, 0.1, x, GA.y + 2.45, GA.z0 + 0.12, dark); }
      { const n = plate('PIT GARAGE\n整備 · 車検 · カスタム', gw * 0.8, 0.62, { color: '#f2c230', bg: '#141414' }); n.position.set(gx, GA.y + GH - 0.12, GA.z0 - 0.4); n.rotation.y = Math.PI; sg.add(n); }
      // the lift in the west bay: two posts, arms under the car, the car up at 1.7 m
      const lx = (GA.x0 + mid) / 2, lz = gz + 0.3;
      for (const sd2 of [-1, 1]) { sb(0.32, 3.6, 0.32, lx + sd2 * 1.75, GA.y + 1.8, lz, E.mat('#2a5fb8', { rough: 0.5 })); lcirc(lx + sd2 * 1.75, lz, 0.25); for (const dz of [-0.9, 0.9]) sb(1.0, 0.08, 0.14, lx + sd2 * 1.15, GA.y + 1.62, lz + dz, dark); }
      carAt(sg, 0, lx, GA.y + 1.7, lz, Math.PI); carBox(lx, lz, 0);
      carAt(sg, 4, (mid + GA.x1) / 2, GA.y, lz, Math.PI); carBox((mid + GA.x1) / 2, lz, 0);
      // tyres, a red tool chest, the bench, drums outside
      for (let k = 0; k < 4; k++) { const t2 = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 14), tyreM); t2.position.set(GA.x0 + 0.65, GA.y + 0.11 + k * 0.23, GA.z1 - 0.75); sg.add(t2); }
      lcirc(GA.x0 + 0.65, GA.z1 - 0.75, 0.38);
      sb(1.1, 1.0, 0.5, GA.x1 - 1.2, GA.y + 0.5, GA.z1 - 0.55, red); sb(1.12, 0.06, 0.52, GA.x1 - 1.2, GA.y + 1.03, GA.z1 - 0.55, dark); lbox(GA.x1 - 1.2, GA.z1 - 0.55, 0.55, 0.25);
      sb(1.6, 0.9, 0.6, mid + 1.2, GA.y + 0.45, GA.z1 - 0.5, E.mat('#6a5a48', { rough: 0.8 })); lbox(mid + 1.2, GA.z1 - 0.5, 0.8, 0.3);
      for (const [dz, c] of [[0.75, '#2a6fd0'], [1.5, '#c8312a']]) { const x = GA.x1 + 0.55, dm = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12), E.mat(c, { rough: 0.5, metal: 0.3 })); dm.position.set(x, 0.45, GA.z0 + dz); dm.castShadow = true; sg.add(dm); lcirc(x, GA.z0 + dz, 0.32); }
    }

    // the used-car lot: two cars nose to the road, bunting on posts, のぼり
    const LT = S.PADS.lot;
    {
      slab(LT, E.mat('#3a3834', { map: E.tex('asphalt', 1, 1), rough: 0.95 }));
      [[LT.x0 + 2.4, 5], [LT.x0 + 5.8, 1]].forEach(([x, i]) => { const z = LT.z1 - 2.25; carAt(sg, i, x, LT.y, z, Math.PI); carBox(x, z, 0); });
      // bunting: three posts along the front, strings between them and on to the garage, pennants in turn
      const posts = [[LT.x0 + 0.3, LT.z0 + 0.25], [(LT.x0 + LT.x1) / 2, LT.z0 + 0.25], [LT.x1 - 0.3, LT.z0 + 0.25]];
      posts.forEach(([x, z]) => { sb(0.08, 3.4, 0.08, x, 1.7, z, postM); lcirc(x, z, 0.1); });
      const pos = [], col = [], PC = ['#e83a3a', '#f2c230', '#2a8ae8', '#3ac86a', '#ffffff'].map((c) => new THREE.Color(c).convertSRGBToLinear());
      let pk = 0;
      for (let s = 1; s < posts.length; s++) { const [ax, az] = posts[s - 1], [bx2, bz2] = posts[s], L = Math.hypot(bx2 - ax, bz2 - az), n2 = Math.floor(L / 0.45);
        for (let k = 0; k < n2; k++) { const t0 = k / n2, t1 = (k + 0.7) / n2, y0 = 3.3 - Math.sin(Math.PI * t0) * 0.45, y1 = 3.3 - Math.sin(Math.PI * t1) * 0.45, tm = (t0 + t1) / 2, ym = 3.3 - Math.sin(Math.PI * tm) * 0.45 - 0.32, c = PC[pk++ % PC.length];
          pos.push(ax + (bx2 - ax) * t0, y0, az + (bz2 - az) * t0, ax + (bx2 - ax) * t1, y1, az + (bz2 - az) * t1, ax + (bx2 - ax) * tm, ym, az + (bz2 - az) * tm); for (let v = 0; v < 3; v++) col.push(c.r, c.g, c.b); } }
      const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const bm = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }); bm.userData.lin = true; sg.add(new THREE.Mesh(bg, bm));
      // のぼり: tall narrow banners on poles along the land pavement, the words down them
      const nobori = (txt, bgc, fg) => { const c = document.createElement('canvas'); c.width = 128; c.height = 512; const x = c.getContext('2d'); x.fillStyle = bgc; x.fillRect(0, 0, 128, 512); x.fillStyle = fg; x.font = '900 92px "Noto Sans JP",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        const ch = [...txt]; ch.forEach((t, i) => x.fillText(t, 64, 512 * (i + 0.5) / ch.length)); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; const m = new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }); m.userData.lin = true; return m; };
      const NB = [['中古車', '#d8231a', '#ffffff'], ['決算セール', '#f2c230', '#d8231a'], ['試乗', '#1f55b8', '#ffffff'], ['車検', '#d8231a', '#ffffff'], ['新車', '#1f55b8', '#ffffff']].map(([t, b2, f]) => nobori(t, b2, f));
      [LT.x0 + 1.2, LT.x1 - 1.6, S.PADS.show.x0 + 0.9, S.PADS.show.x1 - 0.6, (S.PADS.show.x0 + S.PADS.show.x1) / 2 + 3.4].forEach((x, k) => {
        const z = S.BZ + S.HW + 0.5; sb(0.05, 3.3, 0.05, x, PY + 1.65, z, postM); lcirc(x, z, 0.08);
        const f = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 2.1), NB[k % NB.length]); f.position.set(x + 0.3, PY + 2.1, z); f.rotation.y = Math.PI; sg.add(f);
      });
    }

    // the people: someone at the desk, a mechanic by the lift, a customer looking round a car on the lot
    if (E.npc && E.npc.crowd) {
      const folk = E.npc.crowd(3, E.rng(7377), 3), o3 = new THREE.Object3D();
      [[show.desk[0], SH.y, show.desk[1] + 0.75, Math.PI], [(GA.x0 + (GA.x0 + GA.x1) / 2) / 2 + 2.25, GA.y, (GA.z0 + GA.z1) / 2 - 1.6, -Math.PI / 2], [LT.x0 + 4.1, LT.y, (LT.z0 + LT.z1) / 2 - 0.5, Math.PI / 2 + 0.4]].forEach(([x, y, z, yaw], i) => {
        o3.position.set(x, y, z); o3.rotation.set(0, yaw, 0); o3.updateMatrix(); folk.set(i, o3.matrix); lcirc(x, z, 0.3);
      });
      folk.done(); sg.add(folk.group);
    }
    SB.flush();

    // at the desk: choose the car (the game swaps it into the beach lay-by: showCar puts the same model on the turntable)
    const dk = ohh.toWorld(show.desk[0], show.desk[1] - 1.1);
    const ia = { kind: 'garage', x: dk.x, z: dk.z, sx: dk.x, sz: dk.z, r: 1.6, mark: 2.5 }; w.interact.push(ia);
    const showCar = (i) => {
      if (!cars || i < 0) return; i %= SW.Cars.models.length; if (i === show.cur) return;
      if (!show.cache[i]) { const c = cars(i); turn.add(c); show.cache[i] = c; }
      show.cache.forEach((c, k) => { if (c) c.visible = k === i; }); show.cur = i;
    };
    return {
      group: g, ia, showCar,
      update(t) { turn.rotation.y = t * 0.35; },
      // the map: the street and the plots
      map(mg, toMap, s) {
        mg.lineCap = 'round'; mg.lineJoin = 'round'; mg.strokeStyle = '#3d3f46'; mg.lineWidth = (S.HW * 2 + 1) * s; mg.beginPath();
        P.forEach((q, k) => { const [x, y] = toMap(q.x, q.z); if (k) mg.lineTo(x, y); else mg.moveTo(x, y); }); mg.stroke();
        mg.fillStyle = '#c9c4b8';
        for (const k in S.PADS) { const p = S.PADS[k]; mg.beginPath(); [[p.x0, p.z0], [p.x1, p.z0], [p.x1, p.z1], [p.x0, p.z1]].forEach(([a, b2], i) => { const v = ohh.toWorld(a, b2), [x, y] = toMap(v.x, v.z); if (i) mg.lineTo(x, y); else mg.moveTo(x, y); }); mg.closePath(); mg.fill(); }
      },
    };
  }

  SW.Street = { make, build };
})();
