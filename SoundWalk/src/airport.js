/*
 * FIELD's airport. FIELD's street (its Harlem side street, local x about -2.9, running along z) carries on straight
 * out past where the firefight office stood, under the ring road and on past the land's edge to an airport in the
 * north-east corner: a forecourt, a glass terminal with a jet bridge out to the one wide-body airliner, a private
 * aviation terminal (FBO) and an open hangar, private jets parked across the apron (the most of what flies from here),
 * a taxiway, a runway with its markings and lights, a control tower, a windsock and the vehicles of an apron.
 *
 *   SW.Airport.build(p, E) -> { zone(lx, lz), road(lx, lz), update(t, dt) }   (in FIELD's frame: +z towards the town)
 */
(function () {
  'use strict';
  const SW = (window.SW = window.SW || {});
  const SX = -2.9, SHW = 4.5, SZ0 = 8.8, SZ1 = -96;   // the street: centre, half-width, from where FIELD's ends to the forecourt
  const FC = { x0: -62, x1: 62, z0: -110, z1: SZ1 };   // the forecourt in front of the terminal
  const TM = { x0: -55, x1: 55, z0: -127, z1: -110, h: 12 };   // the terminal
  const AP = { x0: -150, x1: 150, z0: -196, z1: -127 };   // the apron
  const TW = { z: -200, hw: 8, x0: -140, x1: 140 };   // the taxiway
  const RW = { z: -232, hw: 20, x0: -125, x1: 125 };   // the runway
  const ZONE = { x0: -158, x1: 158, z0: -262, z1: -86 };

  // An aeroplane, nose towards +z, its wheels on the ground at y 0. o: L length, R fuselage radius, span, chord (at the
  // root), sweep (rad), wz (where the wing sits, as a fraction of the length from the tail), engines 'wing' | 'rear',
  // tH (the fin's height), tee (a T-tail), body / tail / stripe colours, name (on the fin)
  function plane(E, o) {
    const g = new THREE.Group(), L = o.L, R = o.R, cy = o.belly + R;
    const body = E.gloss ? E.gloss(o.body, { rough: 0.25, metal: 0.15, env: 0.8 }) : E.mat(o.body, { rough: 0.3 });
    const tailM = E.mat(o.tail, { rough: 0.35, metal: 0.1 }), stripeM = E.mat(o.stripe, { rough: 0.35 }), dark = E.mat('#15171c', { rough: 0.2, metal: 0.4 }), grey = E.mat('#8d939b', { rough: 0.45, metal: 0.5 }), tyre = E.mat('#121214', { rough: 0.9 });
    const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0, sh = true) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.rotation.set(rx, ry, rz); me.castShadow = sh; me.receiveShadow = true; g.add(me); return me; };
    const zN = L / 2, zT = -L / 2, nose = R * 2.2, tc = R * 3.2;   // the nose's length, the tail cone's
    add(new THREE.CylinderGeometry(R, R, L - nose - tc, 24), body, 0, cy, (zN - nose + zT + tc) / 2, Math.PI / 2);
    { const s = add(new THREE.SphereGeometry(R, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), body, 0, cy, zN - nose, Math.PI / 2); s.scale.set(1, nose / R, 1); }   // (the half-sphere's pole points along +z once turned)
    add(new THREE.CylinderGeometry(R * 0.28, R, tc, 24), body, 0, cy, zT + tc / 2, -Math.PI / 2);   // the tail cone
    // windows: a dark band down each side, the cockpit's glazing at the nose
    for (const sd of [-1, 1]) add(new THREE.BoxGeometry(0.04, R * 0.16, L - nose - tc - R * 1.2), dark, sd * R * 0.995, cy + R * 0.28, (zN - nose + zT + tc) / 2 - R * 0.2, 0, 0, 0, false);
    add(new THREE.BoxGeometry(R * 1.3, R * 0.22, R * 0.5), dark, 0, cy + R * 0.42, zN - nose * 0.55, -0.55, 0, 0, false);
    if (o.stripe) for (const sd of [-1, 1]) add(new THREE.BoxGeometry(0.04, R * 0.12, L - nose - tc), stripeM, sd * R * 1.0, cy - R * 0.08, (zN - nose + zT + tc) / 2, 0, 0, 0, false);
    // a flat surface in plan (wing, tailplane): root chord at x 0 from z a0 back to a1, tip at x span/2 (swept back), thickness t
    const surf = (half, root, tip, sweep, t, m, x, y, z, side, dihedral = 0) => {   // (the left one is drawn mirrored in the shape itself, so its faces still face out)
      const sh = new THREE.Shape(), back = Math.tan(sweep) * half, h = half * side;
      sh.moveTo(0, 0); sh.lineTo(h, -back); sh.lineTo(h, -back - tip); sh.lineTo(0, -root); sh.lineTo(0, 0);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false }); geo.rotateX(Math.PI / 2); geo.translate(0, t / 2, 0);   // plan in x-z (z backwards = -y of the shape)
      const me = add(geo, m, x, y, z, 0, 0, 0); me.rotation.z = side * dihedral; return me;
    };
    const wz = zT + L * o.wz, wy = o.engines === 'wing' ? cy - R * 0.55 : cy - R * 0.45;
    for (const sd of [-1, 1]) surf(o.span / 2, o.chord, o.chord * 0.28, o.sweep, R * 0.14, body, sd * R * 0.6, wy, wz + o.chord * 0.5, sd, 0.06);
    // the fin, and the tailplane (low on an airliner, on top of the fin for a T-tail)
    const fin = new THREE.Shape(), fb = o.tH * Math.tan(0.7);   // (in x-y, x backwards: turned so that x runs to -z)
    fin.moveTo(0, 0); fin.lineTo(-fb, o.tH); fin.lineTo(-fb - o.tH * 0.38, o.tH); fin.lineTo(-o.tH * 0.95, 0); fin.lineTo(0, 0);
    { const geo = new THREE.ExtrudeGeometry(fin, { depth: R * 0.14, bevelEnabled: false }); geo.translate(0, 0, -R * 0.07); geo.rotateY(-Math.PI / 2); add(geo, tailM, 0, cy + R * 0.5, zT + tc * 0.95); }
    const tpY = o.tee ? cy + R * 0.5 + o.tH : cy + R * 0.25, tpZ = o.tee ? zT + tc * 0.95 - fb - o.tH * 0.02 : zT + tc * 0.8;
    for (const sd of [-1, 1]) surf(o.span * (o.tee ? 0.2 : 0.18), o.tH * 0.42, o.tH * 0.16, 0.55, R * 0.1, o.tee ? tailM : body, sd * (o.tee ? 0.05 : R * 0.3), tpY, tpZ, sd, 0.04);
    if (o.name) {   // the name on the fin, both sides
      const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.font = '900 112px "Hind","Arial Black",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(o.name, 256, 128);
      const tx = new THREE.CanvasTexture(c); tx.encoding = THREE.sRGBEncoding; const m = new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false }); m.userData.lin = true;   // (one-sided: each side's own reads the right way round)
      for (const sd of [-1, 1]) { const q = add(new THREE.PlaneGeometry(o.tH * 0.55, o.tH * 0.28), m, sd * (R * 0.08 + 0.02), cy + R * 0.5 + o.tH * 0.45, zT + tc * 0.95 - fb * 0.5 - o.tH * 0.35, 0, sd * Math.PI / 2, 0, false); q.rotation.y = sd > 0 ? Math.PI / 2 : -Math.PI / 2; }
    }
    // engines: under the wings, or on the rear fuselage
    const nac = (x, y, z, r, l) => { add(new THREE.CylinderGeometry(r, r * 0.86, l, 18, 1, true), grey, x, y, z, Math.PI / 2); add(new THREE.CircleGeometry(r * 0.92, 18), dark, x, y, z + l / 2 - 0.05, 0, 0, 0, false); add(new THREE.CylinderGeometry(r * 0.5, r * 0.2, l * 0.35, 12), grey, x, y, z - l * 0.6, Math.PI / 2); };
    if (o.engines === 'wing') for (const sd of [-1, 1]) { const x = sd * o.span * 0.18, z = wz + o.chord * 0.5 - Math.tan(o.sweep) * o.span * 0.18 + o.eng * 0.9; nac(x, wy - o.eng * 0.9, z, o.eng, o.eng * 3.2); add(new THREE.BoxGeometry(0.25, o.eng * 0.8, o.eng * 2), body, x, wy - o.eng * 0.3, z - o.eng * 0.4); }
    else for (const sd of [-1, 1]) { const x = sd * (R + o.eng * 1.1), z = zT + tc + o.eng * 1.6; nac(x, cy + R * 0.35, z, o.eng, o.eng * 3.4); add(new THREE.BoxGeometry(o.eng * 1.2, 0.18, o.eng * 1.6), body, sd * (R + o.eng * 0.4), cy + R * 0.35, z); }
    // the landing gear: a nose leg, and the main legs under the wings
    const leg = (x, z, n, r) => { add(new THREE.CylinderGeometry(0.08 * r * 4, 0.08 * r * 4, o.belly + 0.2, 8), grey, x, (o.belly + 0.2) / 2, z); for (let k = 0; k < n; k++) for (const sd of [-1, 1]) add(new THREE.CylinderGeometry(r, r, r * 0.8, 14), tyre, x + sd * r * 0.55, r, z + (k - (n - 1) / 2) * r * 2.2, 0, 0, Math.PI / 2); };
    leg(0, zN - nose * 1.4, 1, o.belly * 0.22);
    for (const sd of [-1, 1]) leg(sd * R * 1.05, wz - o.chord * 0.1, o.L > 40 ? 2 : 1, o.belly * 0.26);
    g.userData = { L, span: o.span, R, cy };
    return g;
  }

  function build(p, E) {
    const g = new THREE.Group(); p.group.add(g);
    const B = E.batch(g), bx = B.box;
    const pick = (m) => { m.receiveShadow = true; g.add(m); p.pick(m); return m; };
    const flat = (x0, x1, z0, z1, y, m) => { const pl = E.plane(x1 - x0, z1 - z0, m); pl.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); return pick(pl); };
    const asph = (rx, rz) => E.mat('#2c2a30', { map: E.tex('asphalt', rx, rz), rough: 0.88 }, true);
    const yel = E.mat('#e8c43a', { rough: 0.6 }), white = E.basic('#e9e6dc'), whiteS = E.mat('#e9e6dc', { rough: 0.6 }), steel = E.mat('#5a6068', { metal: 0.5, rough: 0.5 }), conc = E.mat('#a8a49b', { map: E.tex('concrete', 1, 1), rough: 0.9 }), glass = new THREE.MeshStandardMaterial({ color: new THREE.Color('#8fb4cc').convertSRGBToLinear(), roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
    glass.userData.lin = true;
    const text = (txt, w, h, o = {}) => { const m = new THREE.MeshBasicMaterial({ map: E.textTex(txt, Object.assign({ w: 1024, h: 220, color: '#ffffff', bg: '#16233f', font: '900 104px "Hind","Noto Sans JP",sans-serif', font2: '700 48px "Hind","Noto Sans JP",sans-serif' }, o)), side: THREE.DoubleSide }); m.userData.lin = true; return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); };

    // ---- the street, on straight out: under the ring road, past the land's edge, to the forecourt ----
    flat(SX - SHW, SX + SHW, SZ1, SZ0, 0.04, asph(3, 30));
    for (const sd of [-1, 1]) { flat(sd > 0 ? SX + SHW : SX - SHW - 2.4, sd > 0 ? SX + SHW + 2.4 : SX - SHW, SZ1, SZ0, 0.16, E.mat('#8a857c', { map: E.tex('paving', 2, 40), rough: 0.9 }, true)); bx(0.22, 0.18, SZ0 - SZ1, SX + sd * SHW, 0.09, (SZ0 + SZ1) / 2, E.mat('#b4b0a8', { rough: 0.8 })); }
    for (const dx of [-0.18, 0.18]) bx(0.12, 0.02, SZ0 - SZ1, SX + dx, 0.05, (SZ0 + SZ1) / 2, yel, false);   // a double yellow line down the middle
    for (let z = SZ0 - 6; z > SZ1 + 2; z -= 16) for (const sd of [-1, 1]) {   // cobra-head lamps
      const x = SX + sd * (SHW + 1.8); bx(0.14, 6.4, 0.14, x, 3.2, z, steel); bx(1.8, 0.1, 0.12, x - sd * 0.9, 6.35, z, steel); bx(0.6, 0.14, 0.32, x - sd * 1.75, 6.25, z, E.basic('#ffd9a0'), false); p.addCircle(x, z, 0.15);
    }
    { const s = text('AIRPORT  ✈  空港\nFIELD INTERNATIONAL', 3.2, 0.9, { bg: '#0e6b3c' }); s.position.set(SX + SHW + 1.8, 4.6, SZ0 - 22); s.rotation.y = 0; g.add(s); bx(0.12, 4.2, 0.12, SX + SHW + 1.8, 2.1, SZ0 - 22.08, steel); }

    // ---- the forecourt: a drop-off lane along the terminal's front, an island, cabs waiting ----
    flat(FC.x0, FC.x1, FC.z0, FC.z1, 0.035, asph(12, 2));
    flat(FC.x0, FC.x1, FC.z0, FC.z0 + 3, 0.16, E.mat('#a49e94', { map: E.tex('paving', 24, 1.2), rough: 0.9 }, true));   // the kerb along the doors
    bx(FC.x1 - FC.x0 - 24, 0.16, 2.2, 0, 0.08, -103.5, E.mat('#8e9a7a', { rough: 0.95 }));   // the island
    for (let x = FC.x0 + 14; x < FC.x1 - 14; x += 9) { const t = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), E.mat('#4f6e3c', { flat: true })); t.position.set(x, 2.4, -103.5); t.castShadow = true; g.add(t); bx(0.18, 1.8, 0.18, x, 0.9, -103.5, E.mat('#5a4636')); p.addCircle(x, -103.5, 0.3); }
    if (SW.Cars) for (const [x, k] of [[-30, 2], [-22, 5], [14, 0], [36, 3]]) { const c = SW.Cars.make(E, k); c.position.set(x, 0.04, -107.6); c.rotation.y = -Math.PI / 2; g.add(c); p.addBox(x, -107.6, 2.2, 1.0); }

    // ---- the terminal: glass both sides, a deep roof, the name along the front; doors through to the apron ----
    const tw = TM.x1 - TM.x0, td = TM.z1 - TM.z0, tx = (TM.x0 + TM.x1) / 2, tz = (TM.z0 + TM.z1) / 2;
    flat(TM.x0, TM.x1, TM.z0, TM.z1, 0.04, E.mat('#d9d5cc', { rough: 0.3, metal: 0.05 }, true));
    const DOORS = [-30, 0, 30];
    for (const [z, doors] of [[TM.z1, DOORS], [TM.z0, [-18, 22]]]) {
      let x0 = TM.x0;
      for (const d of [...doors, TM.x1 + 2]) { const x1 = Math.min(TM.x1, d - 1.8); if (x1 > x0) { const gl = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, TM.h - 0.4), glass); gl.position.set((x0 + x1) / 2, (TM.h - 0.4) / 2, z); g.add(gl); p.addBox((x0 + x1) / 2, z, (x1 - x0) / 2, 0.2); } x0 = d + 1.8; }
      for (let x = TM.x0; x <= TM.x1 + 0.01; x += 5) bx(0.22, TM.h, 0.3, x, TM.h / 2, z, steel);
      bx(tw, 0.25, 0.3, tx, 3.4, z, steel);
    }
    for (const x of [TM.x0, TM.x1]) { bx(0.5, TM.h, td, x, TM.h / 2, tz, conc); p.addBox(x, tz, 0.25, td / 2); }
    bx(tw + 6, 0.8, td + 10, tx, TM.h + 0.4, tz + 1, E.mat('#e4e1da', { rough: 0.5 }));   // the roof, overhanging the kerb
    for (let x = TM.x0 - 2; x <= TM.x1 + 2; x += 6) bx(0.4, 0.5, td + 10, x, TM.h - 0.05, tz + 1, steel);   // its ribs
    { const n = text('FIELD INTERNATIONAL AIRPORT\nフィールド国際空港', 34, 3.2); n.position.set(tx, TM.h + 2.4, TM.z1 + 5.1); g.add(n); bx(34.4, 3.6, 0.3, tx, TM.h + 2.4, TM.z1 + 4.9, E.mat('#16233f')); }
    // inside: check-in islands, a departures board
    for (const x of [-38, -14, 14, 38]) { bx(10, 1.1, 1.4, x, 0.55, -116, E.mat('#2a6fd0', { rough: 0.4 })); bx(10, 1.6, 0.2, x, 2.5, -117.2, E.mat('#e9e6dc')); p.addBox(x, -116.3, 5, 1); }
    { const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const x = c.getContext('2d'); x.fillStyle = '#0c0d10'; x.fillRect(0, 0, 1024, 512); x.font = '700 40px "Hind",monospace'; x.fillStyle = '#ffd34a'; x.fillText('DEPARTURES  出発', 30, 60);
      [['08:40', 'FW 101', 'TOKYO HANEDA', 'BOARDING'], ['09:15', 'PVT', 'NEW YORK  TEB', 'ON TIME'], ['09:30', 'PVT', 'LOS ANGELES  VNY', 'ON TIME'], ['10:05', 'PVT', 'NICE', 'ON TIME'], ['10:40', 'PVT', 'IBIZA', 'DELAYED'], ['11:20', 'PVT', 'LONDON  FAB', 'ON TIME']].forEach((r, i) => { x.fillStyle = i ? '#e8e8e8' : '#7dff9a'; x.fillText(r.join('   '), 30, 130 + i * 62); });
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; const m = new THREE.MeshBasicMaterial({ map: t }); m.userData.lin = true; const s = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), m); s.position.set(0, 6.5, -124.5); g.add(s); }

    // ---- the apron, the taxiway, the runway ----
    flat(AP.x0, AP.x1, AP.z0, AP.z1, 0.03, E.mat('#9d9a92', { map: E.tex('concrete', 30, 7), rough: 0.9 }, true));
    flat(TW.x0, TW.x1, TW.z - TW.hw, TW.z + TW.hw, 0.032, asph(28, 2));
    for (const x of [-110, 110]) flat(x - 9, x + 9, RW.z + RW.hw, TW.z - TW.hw, 0.031, asph(2, 1));   // the links onto the runway
    flat(RW.x0, RW.x1, RW.z - RW.hw, RW.z + RW.hw, 0.03, E.mat('#24232a', { map: E.tex('asphalt', 25, 4), rough: 0.9 }, true));
    for (let x = TW.x0 + 2; x < TW.x1; x += 4) bx(2.4, 0.01, 0.18, x, 0.045, TW.z, yel, false);   // the taxiway's centre line
    for (const sx of [-1, 1]) for (let z = AP.z1 - 4; z > AP.z0; z -= 6) bx(0.18, 0.01, 3.2, sx * 140, 0.045, z, yel, false);
    for (let x = RW.x0 + 30; x < RW.x1 - 30; x += 12) bx(6, 0.012, 0.5, x, 0.045, RW.z, white, false);   // the runway's centre line
    for (const sd of [-1, 1]) {   // threshold bars and the touchdown zone at each end
      const xe = sd > 0 ? RW.x1 : RW.x0;
      for (let k = -7; k <= 7; k++) if (k) bx(10, 0.012, 1.4, xe - sd * 8, 0.045, RW.z + k * 2.3, white, false);
      for (const dz of [-6, 6]) bx(14, 0.012, 2.6, xe - sd * 55, 0.045, RW.z + dz, white, false);
      const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.font = '900 190px "Hind","Arial Black",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(sd > 0 ? '04' : '22', 128, 130);
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }); m.userData.lin = true;
      const n = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), m); n.rotation.set(-Math.PI / 2, 0, sd > 0 ? Math.PI / 2 : -Math.PI / 2); n.position.set(xe - sd * 26, 0.05, RW.z); g.add(n);
    }
    for (const sd of [-1, 1]) bx(RW.x1 - RW.x0, 0.012, 0.4, 0, 0.045, RW.z + sd * (RW.hw - 1), white, false);   // its edge lines
    // lights: white along the runway's edges, green across its ends, blue along the taxiway (they twinkle in update)
    const lamps = [], lampW = E.basic('#fff6dc'), lampG = E.basic('#5dff7a'), lampB = E.basic('#4a7dff');
    for (let x = RW.x0; x <= RW.x1; x += 10) for (const sd of [-1, 1]) lamps.push(bx(0.35, 0.25, 0.35, x, 0.13, RW.z + sd * (RW.hw + 0.6), lampW, false));
    for (const xe of [RW.x0 - 1, RW.x1 + 1]) for (let z = RW.z - RW.hw; z <= RW.z + RW.hw; z += 4) bx(0.35, 0.25, 0.35, xe, 0.13, z, lampG, false);
    for (let x = TW.x0; x <= TW.x1; x += 12) for (const sd of [-1, 1]) bx(0.3, 0.3, 0.3, x, 0.15, TW.z + sd * (TW.hw + 0.5), lampB, false);
    // apron floodlight masts
    for (const x of [-120, -60, 60, 120]) { bx(0.5, 22, 0.5, x, 11, AP.z1 - 3, steel); bx(3.4, 1.2, 0.8, x, 22, AP.z1 - 3.2, E.basic('#fff4da'), false); p.addCircle(x, AP.z1 - 3, 0.4); }

    // ---- the one big airliner, at the terminal's jet bridge ----
    const liner = plane(E, { L: 62, R: 3.1, span: 60, chord: 11, sweep: 0.55, wz: 0.38, engines: 'wing', eng: 1.6, tH: 10.5, tee: false, belly: 2.2, body: '#f3f2ee', tail: '#1d3b8c', stripe: '#c8312a', name: 'FW' });
    liner.position.set(-25, 0, -134 - 31); g.add(liner);
    p.addBox(-25, -165, 3.2, 30); for (const sd of [-1, 1]) p.addBox(-25 + sd * 11, -168, 1.8, 3.5);   // its body, and the engines (walk under the wings)
    // the jet bridge: from the terminal's back wall out to the door behind the cockpit, on a leg with wheels
    { const a = { x: -12, z: TM.z0 }, b = { x: -25 + 3.1 + 1.2, z: -144 }, L2 = Math.hypot(b.x - a.x, b.z - a.z), yaw = Math.atan2(b.x - a.x, b.z - a.z), y = 2.2 + 3.1 + 0.2;
      const br = bx(2.8, 3, L2, (a.x + b.x) / 2, y, (a.z + b.z) / 2, E.mat('#c9cdd2', { metal: 0.3, rough: 0.5 })); br.rotation.y = yaw;
      bx(3.4, 3.4, 3.4, b.x - 0.6, y, b.z + 1.2, E.mat('#b8bcc2', { metal: 0.3, rough: 0.5 }));
      bx(0.5, y - 1.5, 0.5, (a.x * 0.3 + b.x * 0.7), (y - 1.5) / 2, (a.z * 0.3 + b.z * 0.7), steel); p.addCircle(a.x * 0.3 + b.x * 0.7, a.z * 0.3 + b.z * 0.7, 0.5); }
    // a tug at its nose, baggage carts, a catering truck
    bx(2.4, 1.3, 4.2, -25, 0.65, -130, E.mat('#f2c230', { rough: 0.5 })); p.addBox(-25, -130, 1.2, 2.1);
    for (let k = 0; k < 4; k++) { bx(1.6, 1.2, 2.4, -8 + k * 2.8, 0.8, -158, E.mat('#5a6068', { rough: 0.6 })); p.addBox(-8 + k * 2.8, -158, 0.8, 1.2); }
    bx(2.6, 3.2, 6, -40, 1.6, -150, E.mat('#e9e6dc', { rough: 0.5 })); p.addBox(-40, -150, 1.3, 3);

    // ---- private aviation: the FBO, an open hangar with a jet inside, the jets across the apron ----
    { const x0 = 62, x1 = 92, z0 = -124, z1 = -110, h = 6.5;
      flat(x0, x1, z0, z1, 0.04, E.mat('#e9e6dc', { rough: 0.35 }, true));
      for (const [a, b2] of [[x0, 76.5], [79.5, x1]]) { bx(b2 - a, h, 0.4, (a + b2) / 2, h / 2, z0, E.mat('#1c1d21', { rough: 0.3, metal: 0.3 })); p.addBox((a + b2) / 2, z0, (b2 - a) / 2, 0.2); }   // its airside door onto the carpet
      bx(3, h - 3, 0.4, 78, h - (h - 3) / 2, z0, E.mat('#1c1d21', { rough: 0.3, metal: 0.3 }));
      flat(62, 140, -110, -98, 0.035, E.mat('#3a3834', { map: E.tex('asphalt', 6, 1), rough: 0.95 }, true));   // its landside lot, and the hangar's
      for (const x of [x0, x1]) { bx(0.4, h, z1 - z0, x, h / 2, (z0 + z1) / 2, E.mat('#1c1d21', { rough: 0.3, metal: 0.3 })); p.addBox(x, (z0 + z1) / 2, 0.2, (z1 - z0) / 2); }
      { const gl = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 - 4, h - 0.4), glass); gl.position.set((x0 + x1) / 2 + 2, (h - 0.4) / 2, z1); g.add(gl); p.addBox((x0 + x1) / 2 + 2.5, z1, (x1 - x0 - 5) / 2, 0.2); }
      bx(x1 - x0 + 3, 0.5, z1 - z0 + 4, (x0 + x1) / 2, h + 0.25, (z0 + z1) / 2 + 1, E.mat('#2a2c31', { rough: 0.4, metal: 0.4 }));
      { const n = text('PRIVATE AVIATION\nプライベートジェット · FBO', 14, 2, { bg: '#0c0d10', color: '#e6c78a' }); n.position.set((x0 + x1) / 2, h + 1.6, z1 + 3.1); g.add(n); }
      // a red carpet out of its airside door to the nearest jet
      bx(2, 0.02, 14, 78, 0.05, z0 - 7, E.mat('#a3141c', { rough: 0.9 }), false);
      for (const sd of [-1, 1]) for (let k = 0; k < 4; k++) { bx(0.1, 0.9, 0.1, 78 + sd * 1.4, 0.45, z0 - 2 - k * 3.6, E.mat('#d9b24a', { metal: 0.8, rough: 0.3 })); p.addCircle(78 + sd * 1.4, z0 - 2 - k * 3.6, 0.1); }
    }
    { const x0 = 98, x1 = 140, z0 = -138, z1 = -108, h = 14, hm = E.mat('#c5c8cc', { metal: 0.45, rough: 0.45 });
      flat(x0, x1, z0, z1, 0.04, E.mat('#b5b2aa', { rough: 0.4 }, true));
      bx(x1 - x0, h, 0.4, (x0 + x1) / 2, h / 2, z1, hm); p.addBox((x0 + x1) / 2, z1, (x1 - x0) / 2, 0.2);
      for (const x of [x0, x1]) { bx(0.4, h, z1 - z0, x, h / 2, (z0 + z1) / 2, hm); p.addBox(x, (z0 + z1) / 2, 0.2, (z1 - z0) / 2); }
      const roof = new THREE.Mesh(new THREE.CylinderGeometry((x1 - x0) / 2 + 0.4, (x1 - x0) / 2 + 0.4, z1 - z0 + 0.4, 24, 1, true, -Math.PI / 2, Math.PI), hm); roof.rotation.x = Math.PI / 2; roof.scale.set(1, 1, 0.22); roof.position.set((x0 + x1) / 2, h, (z0 + z1) / 2); roof.castShadow = true; g.add(roof);
      { const n = text('HANGAR 2', 10, 1.6, { bg: '#1c1d21' }); n.position.set((x0 + x1) / 2, h - 1.6, z0 - 0.05); n.rotation.y = Math.PI; g.add(n); }
    }
    const jets = [], JL = 20;
    const jet = (x, z, yaw, liv, solid = true) => { const j = plane(E, { L: JL, R: 1.15, span: 17, chord: 3.6, sweep: 0.5, wz: 0.42, engines: 'rear', eng: 0.62, tH: 3.6, tee: true, belly: 1.0, body: '#f4f4f2', tail: liv[0], stripe: liv[1], name: liv[2] }); j.position.set(x, 0, z); j.rotation.y = yaw; g.add(j); jets.push(j);
      if (solid) { const b2 = p.addBox(x, z, 1.3, JL / 2 - 0.5); b2.c = Math.cos(p.rot + yaw); b2.s = Math.sin(p.rot + yaw); } return j; };
    const LIV = [['#111316', '#d9b24a', 'ATR'], ['#7a1420', '#d9b24a', 'NO JOBB'], ['#14365c', '#9fb4ff', 'TAMA'], ['#2b2d31', '#e8c43a', 'FLIP'], ['#0e6b3c', '#e9e6dc', 'KEYAKI'], ['#4a2a6a', '#ff7ad9', 'FLASH'], ['#c8312a', '#111316', 'SHOT'], ['#d8d4cc', '#2a6fd0', 'OHH']];
    [[30, -146, 0.7], [54, -146, 0.7], [78, -146, 0.7], [102, -146, 0.7], [126, -146, 0.7], [40, -176, -2.4], [70, -176, -2.4], [100, -176, -2.4]].forEach(([x, z, yaw], i) => jet(x, z, yaw, LIV[i % LIV.length]));
    jet(119, -124, Math.PI, LIV[7 % LIV.length]);   // in the hangar, nose out
    // airstairs down from one, a fuel truck by another
    bx(1, 1.2, 3.2, 30 + 3.3, 0.6, -146 + 1.5, E.mat('#e9e6dc', { rough: 0.5 }));
    bx(2.4, 2.6, 7.5, 64, 1.3, -160, E.mat('#d23a2a', { rough: 0.5 })); p.addBox(64, -160, 1.2, 3.7);
    // one taxiing out and back along the taxiway, slowly
    const taxi = jet(0, TW.z, Math.PI / 2, LIV[0], false);

    // ---- the control tower, a windsock ----
    { const x = -84, z = -118, H = 32;
      bx(4, H, 4, x, H / 2, z, conc); p.addBox(x, z, 2, 2);
      const cab = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 3.6, 4, 8), glass); cab.position.set(x, H + 2, z); g.add(cab);
      bx(9.6, 0.5, 9.6, x, H + 4.25, z, E.mat('#2a2c31', { rough: 0.4 })); bx(8.8, 0.4, 8.8, x, H - 0.2, z, E.mat('#2a2c31', { rough: 0.4 }));
      bx(0.12, 4, 0.12, x, H + 6.4, z, steel); }
    const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), E.basic('#ff3a2a')); beacon.position.set(-84, 32 + 8.6, -118); g.add(beacon);
    { const x = 140, z = RW.z + RW.hw + 14; bx(0.12, 6, 0.12, x, 3, z, steel); p.addCircle(x, z, 0.1);
      const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.55, 3, 10, 1, true), E.mat('#ff6a1a', { rough: 0.8 })); sock.rotation.z = Math.PI / 2; sock.position.set(x - 1.6, 5.8, z); g.add(sock); jets.sock = sock; }

    // the fence between the landside and the field, either side of the terminal
    for (const [a, b2] of [[-150, TM.x0], [TM.x1, 62], [92, 98], [140, 150]]) { const len = b2 - a, n2 = Math.round(len / 4); for (let k = 0; k <= n2; k++) bx(0.1, 2.6, 0.1, a + (len * k) / n2, 1.3, -126.5, steel); const net = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.5), E.mat('#7a8088', { rough: 0.6, metal: 0.3 }, true)); net.material.transparent = true; net.material.opacity = 0.35; net.material.side = THREE.DoubleSide; net.position.set((a + b2) / 2, 1.3, -126.5); g.add(net); p.addBox((a + b2) / 2, -126.5, len / 2, 0.15); }
    B.flush();

    const inRect = (q, lx, lz, m = 0) => lx > q.x0 - m && lx < q.x1 + m && lz > q.z0 - m && lz < q.z1 + m;
    return {
      zone: (lx, lz) => inRect(ZONE, lx, lz),
      road: (lx, lz) => Math.abs(lx - SX) < SHW + 3 && lz < SZ0 + 1 && lz > SZ1 - 1,
      update(t) {
        // the jet taxiing: out along the taxiway and back, turning at each end
        const P2 = 260, u = (t * 4) % (P2 * 2), x = u < P2 ? -130 + u : 130 - (u - P2), dir = u < P2 ? 1 : -1;
        taxi.position.set(x, 0, TW.z); taxi.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        beacon.visible = Math.sin(t * 6) > 0;
        if (jets.sock) jets.sock.rotation.y = Math.sin(t * 0.7) * 0.3;
      },
    };
  }

  SW.Airport = { build, plane, SX, ZONE };
})();
