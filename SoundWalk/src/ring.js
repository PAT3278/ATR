/*
 * The ring road: one closed elevated expressway around the whole town.
 *
 * It runs straight through SHOT (the night expressway) and OHH (the coastal road), so
 * those two places are stops on the same loop, and swings out behind FIELD's office to
 * pass between the towers.
 *
 *   SW.Ring.make(SONGS)      -> the centre line and everything you can ask about it
 *   SW.Ring.build(R, E, o)   -> the meshes (deck, walls, piers, lamps, skyline)
 *
 * Road coordinates: s runs along the centre line (metres, increasing anticlockwise seen
 * on the map, which is +X in every place's local frame) and d is the sideways offset,
 * positive to the LEFT of that direction = the outer side. Traffic keeps left.
 */
(function () {
  'use strict';
  const SW = (window.SW = window.SW || {});
  const DEG = Math.PI / 180;
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const ROAD_Z = -15;   // local z of the road in SHOT and OHH

  // Same local frame the game gives each place: viewpoint at the origin, +Z towards the plaza, +X along the road.
  function frame(song) {
    const len = Math.hypot(song.x, song.z) || 1, rot = Math.atan2(-song.x / len, -song.z / len), c = Math.cos(rot), s = Math.sin(rot);
    return {
      x: song.x, z: song.z, rot, c, s, th: Math.atan2(song.z, song.x), dist: len,
      toWorld: (lx, lz) => ({ x: song.x + lx * c + lz * s, z: song.z - lx * s + lz * c }),
      local: (wx, wz) => { const ax = wx - song.x, az = wz - song.z; return { x: ax * c - az * s, z: ax * s + az * c }; },
    };
  }

  function make(SONGS) {
    const find = (k) => { const s = SONGS.find((q) => q.scene === k); return s ? frame(s) : null; };
    const shot = find('shot'), ohh = find('ohh'), field = find('field'), tama = find('tama');
    const H_SHOT = 7, H_OHH = 12, H_BASE = 9;

    // --- centre line, anticlockwise: a circle around the town, with a straight through OHH and one through SHOT ---
    const radius = (th) => 121 + (tama ? 6 * (1 - sm(10 * DEG, 40 * DEG, Math.abs(wrapA(th - tama.th)))) : 0);   // a little wider past the far bank of the river
    const height = (th) => H_BASE + (tama ? 3 * (1 - sm(18 * DEG, 50 * DEG, Math.abs(wrapA(th - tama.th)))) : 0);   // up and over the railway
    const onCircle = (th) => {
      const r = radius(th), dr = (radius(th + 0.01) - radius(th - 0.01)) / 0.02, tx = dr * Math.cos(th) - r * Math.sin(th), tz = dr * Math.sin(th) + r * Math.cos(th), l = Math.hypot(tx, tz);
      return { x: Math.cos(th) * r, z: Math.sin(th) * r, y: height(th), tx: tx / l, tz: tz / l, th };
    };
    const ctl = [];
    const HALF = 46, EASE = 45 * DEG;   // length of each straight either side of its place; how far round the circle a straight takes to merge back
    const ends = [[ohh, H_OHH], [shot, H_SHOT]].filter((e) => e[0]).map(([f, y]) => {
      const pt = (lx) => { const w = f.toWorld(lx, ROAD_Z); return { x: w.x, z: w.z, y, tx: f.c, tz: -f.s, th: Math.atan2(w.z, w.x) }; };
      return { f, y, a: pt(-HALF), b: pt(HALF) };
    }).sort((p, q) => p.a.th - q.a.th);
    // a smooth bend from one point-and-heading to another
    const bend = (p0, p1) => {
      const ch = Math.hypot(p1.x - p0.x, p1.z - p0.z), n = Math.max(8, Math.round(ch / 4));
      for (let k = 1; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t, h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
        ctl.push({ x: h00 * p0.x + h10 * p0.tx * ch + h01 * p1.x + h11 * p1.tx * ch, z: h00 * p0.z + h10 * p0.tz * ch + h01 * p1.z + h11 * p1.tz * ch, y: p0.y + (p1.y - p0.y) * sm(0, 1, t) });
      }
    };
    const arc = (t0, t1) => { const n = Math.max(1, Math.round((t1 - t0) / (2 * DEG))); for (let k = 0; k <= n; k++) ctl.push(onCircle(t0 + ((t1 - t0) * k) / n)); };
    if (!ends.length) arc(0, Math.PI * 2 - 2 * DEG);
    ends.forEach((e, k) => {
      const nx = ends[(k + 1) % ends.length];
      for (let x = -HALF; x <= HALF; x += 4) { const w = e.f.toWorld(x, ROAD_Z); ctl.push({ x: w.x, z: w.z, y: e.y }); }
      let gap = nx.a.th - e.b.th; while (gap <= 0) gap += Math.PI * 2;
      if (gap < 2 * EASE + 10 * DEG) bend(e.b, nx.a);                                    // close together: one bend straight into the next
      else { const c0 = onCircle(e.b.th + EASE), c1 = onCircle(e.b.th + gap - EASE); bend(e.b, c0); arc(c0.th, c1.th); bend(c1, nx.a); }
    });

    const curve = new THREE.CatmullRomCurve3(ctl.map((p) => new THREE.Vector3(p.x, p.y, p.z)), true, 'centripetal');
    const N = Math.round(curve.getLength() / 2), pts = curve.getSpacedPoints(N);
    const X = new Float32Array(N), Y = new Float32Array(N), Z = new Float32Array(N), TX = new Float32Array(N), TZ = new Float32Array(N), HW = new Float32Array(N), GAP = new Uint8Array(N);
    for (let i = 0; i < N; i++) { X[i] = pts[i].x; Y[i] = pts[i].y; Z[i] = pts[i].z; }
    let L = 0;
    for (let i = 0; i < N; i++) {
      const a = (i + N - 1) % N, b = (i + 1) % N, dx = X[b] - X[a], dz = Z[b] - Z[a], l = Math.hypot(dx, dz) || 1;
      TX[i] = dx / l; TZ[i] = dz / l;
      L += Math.hypot(X[b] - X[i], Z[b] - Z[i]);
    }
    const ds = L / N;
    const nearest = (x, z) => { let bi = 0, bd = 1e18; for (let i = 0; i < N; i++) { const dx = X[i] - x, dz = Z[i] - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; bi = i; } } return bi; };

    // Width: four lanes with a median, narrowing to two along the coast at OHH.
    const iOhh = ohh ? nearest(...Object.values(ohh.toWorld(0, ROAD_Z))) : -1;
    for (let i = 0; i < N; i++) {
      let w = 8;
      if (iOhh >= 0) { let k = Math.abs(i - iOhh); k = Math.min(k, N - k); w = 8 - 3.5 * (1 - sm(50, 78, k * ds)); }
      HW[i] = w;
    }

    // Parking areas: where you get in and out of a car. Each is a rectangle (in its place's frame) that opens onto the inner side.
    const pas = [];
    const addPA = (id, f, y, rect, slot, gap, walk, walls) => {
      const sw = f.toWorld(slot.lx, slot.lz), dw = { x: slot.dx * f.c + slot.dz * f.s, z: -slot.dx * f.s + slot.dz * f.c };
      const pa = {
        id, f, y, rect, gap,
        slot: { x: sw.x, z: sw.z, yaw: Math.atan2(dw.x, dw.z) },
        // Where the car's centre may be. Given the car ({ yaw, len, wid }) the limits pull in by however far its body
        // reaches towards each solid edge (walls = { x0, x1, z1 }; the road side is open), so a nose cannot poke through a rail.
        lim(car) {
          let x0 = rect.cx - rect.hx, x1 = rect.cx + rect.hx, z1 = rect.cz + rect.hz; const z0 = rect.cz - rect.hz;
          if (car) {
            const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), ax = Math.abs(fx * f.c - fz * f.s), az = Math.abs(fx * f.s + fz * f.c);
            const ex = (ax * car.len + az * car.wid) / 2, ez = (az * car.len + ax * car.wid) / 2;
            x0 = Math.max(x0, walls.x0 + ex); x1 = Math.min(x1, walls.x1 - ex); if (x0 > x1) x0 = x1 = (walls.x0 + walls.x1) / 2;
            z1 = Math.max(z0, Math.min(z1, walls.z1 - ez));
          }
          return [x0, x1, z0, z1];
        },
        inside(x, z, car) { const l = f.local(x, z), [x0, x1, z0, z1] = pa.lim(car); return l.x >= x0 && l.x <= x1 && l.z >= z0 && l.z <= z1; },
        canStand(x, z) { const l = f.local(x, z); return Math.abs(l.x - walk.cx) <= walk.hx && Math.abs(l.z - walk.cz) <= walk.hz; },   // where a person on foot fits
        clamp(x, z, car) { const l = f.local(x, z), [x0, x1, z0, z1] = pa.lim(car); return f.toWorld(Math.max(x0, Math.min(x1, l.x)), Math.max(z0, Math.min(z1, l.z))); },
      };
      for (let i = 0; i < N; i++) { const l = f.local(X[i], Z[i]); if (Math.abs(l.x) < gap && Math.abs(l.z - ROAD_Z) < 5) GAP[i] = 1; }
      pas.push(pa);
    };
    // rect = where the CAR'S CENTRE may be; it overlaps the road's own band so the two join up
    if (shot) addPA('shot', shot, H_SHOT, { cx: 0, cz: -2.6, hx: 3.25, hz: 6.1 }, { lx: 2.3, lz: -2.2, dx: -0.42, dz: -0.91 }, 4.7, { cx: 0, cz: -1.3, hx: 3.8, hz: 6.8 }, { x0: -4.2, x1: 4.2, z1: 5.9 });   // parked nosing towards the way out
    if (ohh) addPA('ohh', ohh, H_OHH, { cx: 0, cz: -10.55, hx: 9, hz: 1.65 }, { lx: 3, lz: -9.3, dx: -1, dz: 0 }, 9.6, { cx: 0, cz: -9.25, hx: 8.6, hz: 1.0 }, { x0: -11.2, x1: 11.2, z1: -7.75 });

    const R = {
      N, L, ds, X, Y, Z, TX, TZ, HW, GAP, pas, frames: { shot, ohh, field, tama }, H_SHOT, H_OHH,
      median: (i) => HW[((i % N) + N) % N] > 7.2,
      // Road coordinates of a world point. hint = a sample index from last time (searches only nearby); out is reused.
      proj(x, z, hint, out) {
        let bi = 0, bd = 1e18;
        if (hint >= 0) { for (let k = -14; k <= 14; k++) { const i = (hint + k + N) % N, dx = X[i] - x, dz = Z[i] - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; bi = i; } } }
        else bi = nearest(x, z);
        const dx = x - X[bi], dz = z - Z[bi], a = dx * TX[bi] + dz * TZ[bi], nb = (bi + (a >= 0 ? 1 : N - 1)) % N, k = Math.min(1, Math.abs(a) / ds);
        out.i = bi; out.s = bi * ds + a; out.d = dx * TZ[bi] - dz * TX[bi];
        out.y = Y[bi] + (Y[nb] - Y[bi]) * k; out.hw = HW[bi] + (HW[nb] - HW[bi]) * k;
        out.tx = TX[bi] + (TX[nb] - TX[bi]) * k; out.tz = TZ[bi] + (TZ[nb] - TZ[bi]) * k;
        const tl = Math.hypot(out.tx, out.tz) || 1; out.tx /= tl; out.tz /= tl;
        return out;
      },
      // World position of road coordinates (s, d).
      at(s, d, out) {
        let f = (s / ds) % N; if (f < 0) f += N;
        const i = Math.floor(f) % N, j = (i + 1) % N, k = f - Math.floor(f);
        let tx = TX[i] + (TX[j] - TX[i]) * k, tz = TZ[i] + (TZ[j] - TZ[i]) * k; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        out.x = X[i] + (X[j] - X[i]) * k + tz * d; out.z = Z[i] + (Z[j] - Z[i]) * k - tx * d;
        out.y = Y[i] + (Y[j] - Y[i]) * k; out.hw = HW[i] + (HW[j] - HW[i]) * k; out.tx = tx; out.tz = tz; out.i = i;
        return out;
      },
      // How far a point is from the centre line (for keeping trees and towers out of the way).
      dist(x, z) { const i = nearest(x, z); return Math.hypot(x - X[i], z - Z[i]); },
    };
    return R;
  }

  /* ---------------------------------------------------------------- meshes */
  function build(R, E, o = {}) {
    const { N, X, Y, Z, TX, TZ, HW, GAP, ds } = R;
    const g = new THREE.Group();
    const wr = (i) => ((i % N) + N) % N;
    const v = new THREE.Vector3();
    const at = (i, d, y) => { i = wr(i); return v.set(X[i] + TZ[i] * d, Y[i] + y, Z[i] - TX[i] * d); };

    // Sweep a cross-section along the road. prof(i) -> [[d, y], ...] (or null for "nothing here"); faces point
    // outwards when the section goes: +d along a top, down the +d side, -d along a bottom, up the -d side.
    function strip() {
      const pos = [], uv = [];
      const put = (i, p, u, vv) => { at(i, p[0], p[1]); pos.push(v.x, v.y, v.z); uv.push(u, vv); };
      return {
        add(prof, opt = {}) {
          const P = []; for (let i = 0; i < N; i++) P.push(prof(i));
          for (let i = 0; i < N; i++) {
            const a = P[i], b = P[(i + 1) % N];
            if (!a || !b || a.length !== b.length || (opt.seg && !opt.seg(i))) continue;
            const v0 = (i * ds) / (opt.vs || 8), v1 = ((i + 1) * ds) / (opt.vs || 8);
            for (let k = 0; k < a.length - 1; k++) {
              const u0 = opt.us ? a[k][0] / opt.us : k, u1 = opt.us ? a[k + 1][0] / opt.us : k + 1;
              put(i, a[k], u0, v0); put(i + 1, b[k], u0, v1); put(i, a[k + 1], u1, v0);
              put(i, a[k + 1], u1, v0); put(i + 1, b[k], u0, v1); put(i + 1, b[k + 1], u1, v1);
            }
          }
          return this;
        },
        mesh(m, shadow) {
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
          geo.computeVertexNormals();
          const me = new THREE.Mesh(geo, m); me.castShadow = !!shadow; me.receiveShadow = true; g.add(me);
          return me;
        },
      };
    }

    const city = (i) => sm(5, 7.5, HW[wr(i)]);            // 1 = city expressway (concrete walls), 0 = coast road (guard rails)
    const medH = (i) => 0.75 * sm(7.2, 7.95, HW[wr(i)]);  // the median fades out where the road narrows
    const hasMed = (i) => HW[wr(i)] > 7.2;

    // deck
    strip().add((i) => [[-HW[i], 0], [HW[i], 0]], { us: 8, vs: 8 }).mesh(E.mat('#2c2c31', { map: E.tex('asphalt', 1, 1), rough: 0.82 }), false);
    const conc = E.mat('#6e6a68'), concD = E.mat('#4a4746');
    strip().add((i) => { const w = HW[i]; return [[w, 0], [w, -0.5], [w - 1.3, -1.3], [-w + 1.3, -1.3], [-w, -0.5], [-w, 0]]; }).mesh(conc, true);
    // side walls (they shrink to a kerb along the coast), with gaps at the parking areas
    const wallH = (i) => 0.18 + 0.95 * city(i);
    strip()
      .add((i) => { const w = HW[i], h = wallH(i); return [[w - 0.4, 0], [w - 0.4, h], [w, h], [w, 0]]; })
      .add((i) => { if (GAP[i]) return null; const w = HW[i], h = wallH(i); return [[-w, 0], [-w, h], [-w + 0.4, h], [-w + 0.4, 0]]; })
      .add((i) => { const h = medH(i); return h > 0.02 ? [[-0.3, 0], [-0.24, h], [0.24, h], [0.3, 0]] : null; })
      .mesh(concD, true);
    // guard rails where the walls are low
    const railM = E.mat('#d8d6cf', { metal: 0.5, rough: 0.4 });
    const rail = (sd) => (i) => { if (city(i) > 0.6 || (sd < 0 && GAP[i])) return null; const d = sd * (HW[i] - 0.2); return [[d - 0.06, 0.6], [d - 0.06, 0.86], [d + 0.06, 0.86], [d + 0.06, 0.6], [d - 0.06, 0.6]]; };
    strip().add(rail(1)).add(rail(-1)).mesh(railM, false);
    // paint
    const paint = E.basic('#cfc9bb');
    const line = (d, w) => [[d - w, 0.025], [d + w, 0.025]];
    strip()
      .add((i) => line(HW[i] - 0.85, 0.07)).add((i) => line(-HW[i] + 0.85, 0.07))
      .add((i) => (hasMed(i) ? line(0.8, 0.06) : null)).add((i) => (hasMed(i) ? line(-0.8, 0.06) : null))
      .add((i) => (hasMed(i) ? line(HW[i] / 2 + 0.25, 0.08) : null), { seg: (i) => i % 3 === 0 })
      .add((i) => (hasMed(i) ? line(-HW[i] / 2 - 0.25, 0.08) : null), { seg: (i) => i % 3 === 0 })
      .add((i) => (hasMed(i) ? null : line(0, 0.08)), { seg: (i) => i % 3 === 0 })
      .mesh(paint, false);

    // Instanced bits
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), ps = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const inst = (geo, m, list, shadow) => {
      if (!list.length) return null;
      const im = new THREE.InstancedMesh(geo, m, list.length);
      list.forEach((r, k) => { q.setFromAxisAngle(up, r.yaw || 0); ps.set(r.x, r.y, r.z); sc.set(r.sx || 1, r.sy || 1, r.sz || 1); im.setMatrixAt(k, m4.compose(ps, q, sc)); });
      im.castShadow = !!shadow; im.receiveShadow = true; im.frustumCulled = false; g.add(im);
      return im;
    };
    const yawOf = (i) => Math.atan2(TX[i], TZ[i]);   // +Z of an instance along the road

    // piers with a cap beam
    const piers = [], pierL = [], capL = [];
    for (let i = 3; i < N; i += 8) {
      if (o.blocked && o.blocked(X[i], Z[i])) continue;
      const h = Y[i] - 2.3;
      pierL.push({ x: X[i], y: h / 2, z: Z[i], sy: h });
      capL.push({ x: X[i], y: Y[i] - 1.8, z: Z[i], yaw: yawOf(i), sx: HW[i] * 2 - 3 });
      piers.push({ x: X[i], z: Z[i], r: 1.3, y1: Y[i] - 2 });
    }
    inst(new THREE.CylinderGeometry(1, 1.15, 1, 10), concD, pierL, true);
    inst(new THREE.BoxGeometry(1, 1, 2.2), conc, capL, true);

    // sodium lamps on the median: a pole, a cross arm and two heads
    const poleM = E.mat('#3a3a40', { metal: 0.5 }), headM = E.basic('#ffb04a'), poleL = [], armL = [], headL = [], glowP = [], poolL = [];
    for (let i = 5; i < N; i += 9) {
      if (!hasMed(i) || medH(i) < 0.7) continue;
      const yw = yawOf(i);
      poleL.push({ x: X[i], y: Y[i] + 3.9, z: Z[i], sy: 6.6 });
      armL.push({ x: X[i], y: Y[i] + 7.2, z: Z[i], yaw: yw });
      for (const d of [-2.8, 2.8]) { at(i, d, 7.08); headL.push({ x: v.x, y: v.y, z: v.z, yaw: yw }); glowP.push(v.x, v.y - 0.1, v.z); }
      poolL.push({ x: X[i], y: Y[i] + 0.05, z: Z[i], yaw: yw });
    }
    inst(new THREE.CylinderGeometry(0.1, 0.13, 1, 6), poleM, poleL, false);
    inst(new THREE.BoxGeometry(6, 0.12, 0.12), poleM, armL, false);
    inst(new THREE.BoxGeometry(0.9, 0.16, 0.5), headM, headL, false);
    const glowM = new THREE.PointsMaterial({ map: E.dot(), color: E.lin('#ffa040'), size: 3.2, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
    glowM.userData.lin = true;
    { const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(glowP, 3)); const pt = new THREE.Points(gg, glowM); pt.frustumCulled = false; g.add(pt); }
    const poolM = new THREE.MeshBasicMaterial({ map: E.dot(), color: E.lin('#ff9a3c'), transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false });
    poolM.userData.lin = true;
    inst(new THREE.PlaneGeometry(15, 13).rotateX(-Math.PI / 2), poolM, poolL, false);

    // delineator posts along the coast rails
    const postL = [];
    for (let i = 0; i < N; i += 3) { if (city(i) > 0.6) continue; for (const sd of [-1, 1]) { if (sd < 0 && GAP[i]) continue; at(i, sd * (HW[i] - 0.2), 0.45); postL.push({ x: v.x, y: v.y, z: v.z, yaw: yawOf(i) }); } }
    inst(new THREE.BoxGeometry(0.14, 0.9, 0.14), railM, postL, false);

    // A blue "P" plate on the inner side at each end of a parking area, facing the traffic that can pull in.
    { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
      x.fillStyle = '#1f55b8'; x.fillRect(0, 0, 128, 128); x.strokeStyle = '#f4f1e6'; x.lineWidth = 7; x.strokeRect(7, 7, 114, 114);
      x.fillStyle = '#f4f1e6'; x.font = '700 96px Arial, Helvetica, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('P', 64, 70);
      const tx = new THREE.CanvasTexture(c); tx.encoding = THREE.sRGBEncoding;
      const plateM = new THREE.MeshBasicMaterial({ map: tx }); plateM.userData.lin = true;
      const postM2 = E.mat('#9aa0a8', { metal: 0.6, rough: 0.4 });
      for (const pa of R.pas) {
        const idx = []; for (let i = 0; i < N; i++) if (GAP[i]) { const l = pa.f.local(X[i], Z[i]); if (Math.abs(l.x) < pa.gap + 1 && Math.abs(l.z - ROAD_Z) < 6) idx.push(i); }
        if (!idx.length) continue;
        for (const [i, face] of [[idx[0] - 2, -1], [idx[idx.length - 1] + 2, 1]]) {   // face: +1 looks up the road (towards +s), -1 down it
          at(i, -(HW[wr(i)] + 0.15), 0); const px = v.x, py = v.y, pz = v.z;
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.4, 0.12), postM2); post.position.set(px, py + 1.7, pz); g.add(post);
          const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), plateM); plate.position.set(px, py + 3.1, pz); plate.rotation.y = yawOf(wr(i)) + (face > 0 ? 0 : Math.PI);
          plate.translateZ(0.08); g.add(plate);
        }
      } }

    // A lit skyline outside the loop (kept off the sea, the other places and the walkable square).
    const skyM = E.mat('#12151d', { emissiveMap: E.tex('windows', 2, 8), emissive: '#ffffff', emissiveIntensity: 0.5, rough: 0.62 });
    { const r = E.rng(4242), list = [];
      for (let k = 0; k < 400 && list.length < 84; k++) {
        const a = r() * Math.PI * 2, d = 176 + r() * 110, x = Math.cos(a) * d, z = Math.sin(a) * d, w = 9 + r() * 12, dp = 9 + r() * 12, h = 22 + r() * 70 * (0.4 + r() * 0.6);
        if (Math.max(Math.abs(x), Math.abs(z)) < 164 || (o.keepOut && o.keepOut(x, z))) continue;
        list.push({ x, y: h / 2, z, yaw: r() * 3, sx: w, sy: h, sz: dp });
      }
      inst(new THREE.BoxGeometry(1, 1, 1), skyM, list, false); }

    return {
      group: g, piers,
      // night 0..1 (how dark it is), pulse 0..1 (the beat of whatever is playing)
      upd(night, pulse) {
        headM.color.setRGB(1, 0.43, 0.06).multiplyScalar(0.75 + pulse * 0.8 + night * 0.25);
        glowM.opacity = 0.12 + night * 0.6 + pulse * 0.15;
        poolM.opacity = 0.02 + night * 0.075 + pulse * 0.04;
        skyM.emissiveIntensity = 0.3 + night * 0.7 + pulse * 0.25;
      },
    };
  }

  SW.Ring = { make, build, frame, ROAD_Z };
})();
