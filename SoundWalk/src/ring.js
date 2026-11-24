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
    // flare (optional): the mouth widens towards the road by `add` metres a side, from local z `zt` down to `zr`, so you
    // can turn in at an angle instead of square
    const OGAP0 = new Uint8Array(N);   // the outer side opened for a lay-by there (joined into R.OGAP below)
    const addPA = (id, f, y, rect, slot, gap, walk, walls, flare, side = 'in') => {
      const widen = (lz) => (flare && lz !== undefined ? flare.add * Math.max(0, Math.min(1, (flare.zt - lz) / (flare.zt - flare.zr))) : 0);
      const sw = f.toWorld(slot.lx, slot.lz), dw = { x: slot.dx * f.c + slot.dz * f.s, z: -slot.dx * f.s + slot.dz * f.c };
      const pa = {
        id, f, y, rect, gap, flare, side,
        slot: { x: sw.x, z: sw.z, yaw: Math.atan2(dw.x, dw.z) },
        // Where the car's centre may be. Given the car ({ yaw, len, wid }) the limits pull in by however far its body
        // reaches towards each solid edge (walls = { x0, x1, z1 }; the road side is open), so a nose cannot poke through a rail.
        lim(car, lz) {
          const wd = widen(lz);
          let x0 = rect.cx - rect.hx - wd, x1 = rect.cx + rect.hx + wd, z1 = rect.cz + rect.hz; const z0 = rect.cz - rect.hz;
          if (car) {
            const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), ax = Math.abs(fx * f.c - fz * f.s), az = Math.abs(fx * f.s + fz * f.c);
            const ex = (ax * car.len + az * car.wid) / 2, ez = (az * car.len + ax * car.wid) / 2;
            x0 = Math.max(x0, walls.x0 - wd + ex); x1 = Math.min(x1, walls.x1 + wd - ex); if (x0 > x1) x0 = x1 = (walls.x0 + walls.x1) / 2;
            z1 = Math.max(z0, Math.min(z1, walls.z1 - ez));
          }
          return [x0, x1, z0, z1];
        },
        inside(x, z, car) { const l = f.local(x, z), [x0, x1, z0, z1] = pa.lim(car, l.z); return l.x >= x0 && l.x <= x1 && l.z >= z0 && l.z <= z1; },
        canStand(x, z) { const l = f.local(x, z); return Math.abs(l.x - walk.cx) <= walk.hx && Math.abs(l.z - walk.cz) <= walk.hz; },   // where a person on foot fits
        clamp(x, z, car) { const l = f.local(x, z), [x0, x1, z0, z1] = pa.lim(car, l.z); return f.toWorld(Math.max(x0, Math.min(x1, l.x)), Math.max(z0, Math.min(z1, l.z))); },
      };
      for (let i = 0; i < N; i++) { const l = f.local(X[i], Z[i]); if (Math.abs(l.x) < gap && Math.abs(l.z - ROAD_Z) < 5) (side === 'out' ? OGAP0 : GAP)[i] = 1; }   // the wall opens on the lay-by's side
      pas.push(pa);
    };
    // rect = where the CAR'S CENTRE may be; it overlaps the road's own band so the two join up
    // both are lay-bys beside the carriageway in the style of the Shuto's Komagata PA: a long taper at each end and
    // stalls at sixty degrees; your car waits in one of them, nosing towards the way out (see places2.js parkingArea)
    if (shot) addPA('shot', shot, H_SHOT, { cx: 0, cz: -4.7, hx: 24, hz: 4.1 }, { lx: 6, lz: -3.6, dx: 0.87, dz: -0.5 }, 38, { cx: 0, cz: 2.7, hx: 2.3, hz: 3 }, { x0: -24.5, x1: 24.5, z1: -0.7 }, { zr: -7.1, zt: -4.8, add: 12 });
    if (ohh) addPA('ohh', ohh, H_OHH, { cx: 0, cz: -7.9, hx: 18, hz: 4.5 }, { lx: 4, lz: -7.2, dx: 0.87, dz: -0.5 }, 30, { cx: 0, cz: -2.5, hx: 7, hz: 1.4 }, { x0: -18.5, x1: 18.5, z1: -4.2 }, { zr: -10.6, zt: -8.3, add: 10 });
    // a second lay-by on OHH's straight, on the sea side over the east beach (a lift goes down to the sand; places2.js OHH):
    // in OHH's frame turned half round about (17, -15), so the road is at ROAD_Z and the lay-by on its +z side as usual
    if (ohh) { const fb = { x: ohh.x, z: ohh.z, rot: ohh.rot + Math.PI, c: -ohh.c, s: -ohh.s, th: ohh.th, dist: ohh.dist, toWorld: (lx, lz) => ohh.toWorld(34 - lx, -30 - lz), local: (wx, wz) => { const l = ohh.local(wx, wz); return { x: 34 - l.x, z: -30 - l.z }; } };
      addPA('beach', fb, H_OHH, { cx: 0, cz: -7.9, hx: 8, hz: 4.5 }, { lx: 2, lz: -7.2, dx: 0.87, dz: -0.5 }, 15, { cx: 0, cz: -2.5, hx: 4, hz: 1.4 }, { x0: -8.5, x1: 8.5, z1: -4.2 }, { zr: -10.6, zt: -8.3, add: 6 }, 'out'); }

    const R = {
      N, L, ds, X, Y, Z, TX, TZ, HW, GAP, OGAP: OGAP0, pas, frames: { shot, ohh, field, tama }, H_SHOT, H_OHH,
      median: (i) => HW[((i % N) + N) % N] > 7.2,
      // Road coordinates of a world point. hint = a sample index from last time (searches only nearby); out is reused.
      proj(x, z, hint, out) {
        let bi = 0, bd = 1e18;
        if (hint >= 0) { for (let k = -14; k <= 14; k++) { const i = (hint + k + N) % N, dx = X[i] - x, dz = Z[i] - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; bi = i; } } }
        if (hint < 0 || bd > 900) bi = nearest(x, z);   // no hint, or a stale one (the car was moved): search everywhere
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
    R.id = 'ring'; R.closed = true;

    // --- C1: like the Shuto Expressway's inner loop, a one-way elevated route (two lanes, 50 km/h-class corners) that
    // runs from the loop's east side, right through the middle of town over the walks, to its west side. No level
    // crossings: you join and leave only by ramps, as on the Shuto Expressway -
    //   in the east:  from the inner (clockwise) carriageway, a left-hand diverge;
    //                 from the outer (anticlockwise) carriageway, a RIGHT-hand diverge out of the fast lane that climbs
    //                 along the median and flies over the clockwise carriageway (the Shuto's notorious right-side ramps);
    //   in the west:  a left-hand merge into the clockwise carriageway, and a flyover that comes down along the median
    //                 and merges from the right into the fast lane of the anticlockwise one.
    // Back from west to east you take the loop.
    {
      // a junction's frame: u along the loop's +s, v towards the middle, heights relative to the loop's deck there
      const frameAt = (deg) => { const th = deg * DEG; let bi = 0, bd = 1e9; for (let i = 0; i < N; i++) { let a = Math.atan2(Z[i], X[i]) - th; a = Math.abs(Math.atan2(Math.sin(a), Math.cos(a))); if (a < bd) { bd = a; bi = i; } }
        const tx = TX[bi], tz = TZ[bi]; let nx = -tz, nz = tx; if (nx * -X[bi] + nz * -Z[bi] < 0) { nx = -nx; nz = -nz; }
        const tmp = {}, sv = Math.sign(-(tz * nx - tx * nz)) || 1;   // which sign of the loop's d points to the middle
        const f = (u, v, dy) => { const o = R.at(bi * ds + u, -sv * v, tmp); return [o.x, o.y + dy, o.z]; };
        f.hw = (u) => HW[(((bi + Math.round(u / ds)) % N) + N) % N];   // the loop's half-width there
        return f; };   // u runs along the loop's curve, v straight across it, heights follow its deck
      const JA = frameAt(-30), JB = frameAt(120);   // east, between SHOT and FLIP; north-west, between NO JOBB and TAMA (clear of the narrow coast road)
      const roadFrom = (id, pts, hw, o = {}) => {
        const cb = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal'), NB = Math.max(4, Math.round(cb.getLength() / 2)), pb = cb.getSpacedPoints(NB - 1);
        const B = Object.assign({ id, closed: false, avoidRing: true, N: NB, X: new Float32Array(NB), Y: new Float32Array(NB), Z: new Float32Array(NB), TX: new Float32Array(NB), TZ: new Float32Array(NB), HW: new Float32Array(NB).fill(hw), GAP: new Uint8Array(NB), OGAP: new Uint8Array(NB), urban: true, lift: 0.015 }, o);
        pb.forEach((v, i) => { B.X[i] = v.x; B.Y[i] = v.y; B.Z[i] = v.z; });
        let LB = 0;
        for (let i = 0; i < NB; i++) { const a = Math.max(0, i - 1), b = Math.min(NB - 1, i + 1), dx = B.X[b] - B.X[a], dz = B.Z[b] - B.Z[a], l = Math.hypot(dx, dz) || 1; B.TX[i] = dx / l; B.TZ[i] = dz / l; if (i < NB - 1) LB += Math.hypot(B.X[i + 1] - B.X[i], B.Z[i + 1] - B.Z[i]); }
        B.L = LB; B.ds = LB / (NB - 1);
        const nearB = (x, z) => { let bi = 0, bd = 1e18; for (let i = 0; i < NB; i++) { const dx = B.X[i] - x, dz = B.Z[i] - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; bi = i; } } return bi; };
        B.nearest = nearB;
        B.proj = (x, z, hint, out) => {
          let bi = 0, bd = 1e18;
          if (hint >= 0) { for (let k = -14; k <= 14; k++) { const i = Math.max(0, Math.min(NB - 1, hint + k)), dx = B.X[i] - x, dz = B.Z[i] - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; bi = i; } } }
          if (hint < 0 || bd > 900) bi = nearB(x, z);
          const dx = x - B.X[bi], dz = z - B.Z[bi], a = dx * B.TX[bi] + dz * B.TZ[bi], nb = Math.max(0, Math.min(NB - 1, bi + (a >= 0 ? 1 : -1))), k = Math.min(1, Math.abs(a) / B.ds);
          out.i = bi; out.s = bi * B.ds + a; out.d = dx * B.TZ[bi] - dz * B.TX[bi];
          out.y = B.Y[bi] + (B.Y[nb] - B.Y[bi]) * k; out.hw = B.HW[bi];
          out.tx = B.TX[bi]; out.tz = B.TZ[bi]; out.R = B;
          out.off = (bi === 0 && a < 0) || (bi === NB - 1 && a > 0);   // past either end
          return out;
        };
        B.dist = (x, z) => { const i = nearB(x, z); return Math.hypot(x - B.X[i], z - B.Z[i]); };
        return B;
      };
      // the route itself, one-way east to west
      const mid = [[44, -37, 13], [28, -24, 13.6], [10, -23, 14], [-8, -14, 14.2], [-24, -13, 14.2], [-40, -2, 14.3], [-52, 12, 14.4], [-55, 30, 14.6], [-50, 48, 14.8]].map(([x, z, y]) => [x, y, z]);
      for (let i = 1; i < mid.length - 1; i++) { const a = mid[i - 1], b = mid[i + 1]; for (const k of [0, 2]) mid[i][k] += ((a[k] + b[k]) / 2 - mid[i][k]) * 0.33; }
      // the route begins and ends a little inside the junctions, where its two ramps run side by side into it (or out of it)
      const B = roadFrom('c1', [JA(0, 34, 3.5), JA(0, 42, 3.6), ...mid, JB(0, 42, 3.6), JB(0, 34, 3.5)], 4.6, { oneWay: true, lift: 0.03 });
      for (let i = 0; i < B.N; i++) B.HW[i] = 4.6 + 0.6 * Math.max(0, 1 - i / 8, 1 - (B.N - 1 - i) / 8);   // widens to take both ramps
      const RW = 2.6;   // ramp half-width; the two ramps meet the route at u = +-RW, edge to edge
      // the ramps, in the junction frames (u, v, height); see above
      // Both ramps leave (and join) each carriageway on its own outside edge, the usual left-hand way: you steer onto the
      // ramp from just inside the edge (keeping to your lane takes you past), and the ramp peels off, climbs beside the
      // road and turns in to the route. r1 serves the inner carriageway and climbs inwards; r2 serves the outer one, so
      // it climbs outside the loop first and then crosses over both carriageways.
      // r1 grows out of the side of the road: it begins as the slow lane itself, slides out sideways level with the deck
      // (the deck widening by a lane, the wall opening along it), runs on beside it, and only then turns in and climbs
      const r1 = (h) => [[120, h(120) - RW - 0.3, 0], [106, h(106) - RW - 0.3, 0], [94, h(94) - 0.4, 0], [82, h(82) + RW + 0.4, 0], [66, h(66) + RW + 0.9, 0.02], [50, h(50) + RW + 1.8, 0.15], [36, h(36) + RW + 2.8, 0.45], [24, 15.5, 0.9], [13, 20, 1.6], [6, 27, 2.7], [RW, 34, 3.5], [RW, 38, 3.55]];
      const r2 = (h) => [[-100, -(h(-100) - 0.5), 0], [-84, -(h(-84) - 0.3), 0], [-70, -(h(-70) + 0.6), 0], [-58, -(h(-58) + 2.4), 0.3], [-46, -(h(-46) + 4.4), 1.3],
        [-34, -(h(-34) + 5.6), 2.5], [-23, -(h(-23) + 5.4), 3.6], [-14, -(h(-14) + 3), 4.5], [-8, -3, 5], [-4.5, 5, 5.1], [-RW, 15, 4.8], [-RW, 24, 4.2], [-RW, 34, 3.5], [-RW, 38, 3.55]];
      const mirror = (pts) => pts.slice().reverse().map(([u, v, dy]) => [-u, v, dy]);   // the west end is the east end turned round
      const r2W = r2((u) => JB.hw(-u)); r2W[0] = [-100, -(JB.hw(100) - 2.1), 0];   // the merge finishes inside the slow lane
      const ramps = [
        roadFrom('inL', r1(JA.hw).map((p) => JA(...p)), RW, { oneLane: true, opens: 'right' }),   // opens: the side that is open to the loop's lanes beside it
        roadFrom('inR', r2(JA.hw).map((p) => JA(...p)), RW, { oneLane: true, opens: 'right' }),
        roadFrom('outL', mirror([[84, 5.9, 0], [68, 6.6, 0], [52, 8.6, 0.05], [38, 12, 0.6], [24, 15.5, 1.4], [13, 21, 2.1], [6, 27.5, 2.8], [RW, 34, 3.5], [RW, 38, 3.55]]).map((p) => JB(...p)), RW, { oneLane: true, opens: 'right' }),   // the exits finish inside a lane; the west deck lies lower, so this one is longer
        roadFrom('outR', mirror(r2W).map((p) => JB(...p)), RW, { oneLane: true, opens: 'right' }),   // mirrored, the side towards the loop stays the same
      ];
      // The other way, west to east: C1 for the opposite direction, a second deck stacked 7 m above the first along the
      // whole route (a double-deck viaduct, as on parts of the Shuto). Its ramps take the free sides of the same two
      // junctions: in the north-west you join it from either carriageway, in the east you leave to either. They are
      // longer than the lower deck's, to climb the extra height at a sensible grade.
      const UP = 7, midB = mid.slice().reverse().map(([x, y, z]) => [x, y + UP, z]);
      const B2 = roadFrom('c1b', [JB(0, 34, 3.5 + UP), JB(0, 42, 3.6 + UP), ...midB, JA(0, 42, 3.6 + UP), JA(0, 34, 3.5 + UP)], 4.6, { oneWay: true, lift: 0.03, stack: B });
      for (let i = 0; i < B2.N; i++) B2.HW[i] = 4.6 + 0.6 * Math.max(0, 1 - i / 8, 1 - (B2.N - 1 - i) / 8);
      const H2 = 3.5 + UP;
      // the same plan shapes as the lower ramps, lengthened at the loop end; heights rise smoothly with distance travelled
      const climb = (pts, h0, h1, flat) => { let L = 0; const d = [0]; for (let k = 1; k < pts.length; k++) { L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); d.push(L); }
        return pts.map(([u, v], k) => { const t = Math.max(0, Math.min(1, (d[k] - flat) / (L - flat - 4))), e = t * t * (3 - 2 * t); return [u, v, h0 + (h1 - h0) * e]; }); };
      const r1x = (h) => climb([[130, h(130) - RW - 0.3], [118, h(118) - RW - 0.3], [106, h(106) - 0.3], [94, h(94) + RW + 0.4], [80, h(80) + RW + 0.8], [66, h(66) + RW + 1.1], [50, h(50) + RW + 1.6], [36, h(36) + RW + 2.6], [24, 15.5], [13, 20], [6, 27], [RW, 34], [RW, 38]], 0, H2, 40);   // (grown out of the side of the slow lane, as r1)   // the start follows the loop's edge (it narrows towards the coast)
      const r2x = (h) => climb([[-140, -(h(-140) - 0.5)], [-122, -(h(-122) - 0.3)], [-106, -(h(-106) + 0.6)], [-92, -(h(-92) + 2.4)], [-78, -(h(-78) + 4.4)], [-62, -(h(-62) + 5.6)], [-46, -(h(-46) + 5.4)],
        [-30, -(h(-30) + 3)], [-17, -3], [-10, 5], [-RW, 15], [-RW, 24], [-RW, 34], [-RW, 38]], 0, H2, 30);
      const r2xW = r2x((u) => JA.hw(-u)); r2xW[0] = [-140, -(JA.hw(140) - 2.1), 0];
      const ramps2 = [
        roadFrom('inLb', r1x(JB.hw).map((p) => JB(...p)), RW, { oneLane: true, opens: 'right' }),
        roadFrom('inRb', r2x(JB.hw).map((p) => JB(...p)), RW, { oneLane: true, opens: 'right' }),
        roadFrom('outLb', mirror([[130, JA.hw(-130) - 2.1, 0], ...r1x((u) => JA.hw(-u)).slice(1)]).map((p) => JA(...p)), RW, { oneLane: true, opens: 'right' }),
        roadFrom('outRb', mirror(r2xW).map((p) => JA(...p)), RW, { oneLane: true, opens: 'right' }),
      ];
      ramps.push(...ramps2);
      const all = [B, B2, ...ramps];
      // where a ramp lies on the loop's deck: no walls on the ramp; the loop's median drops where a ramp runs along it, and
      // its inner wall opens where a ramp leaves or joins from the inside
      R.MGAP = new Uint8Array(N); R.JGAP = new Uint8Array(N); R.OGAP = R.OGAP || new Uint8Array(N);
      for (const Rd of ramps) for (let i = 0; i < Rd.N; i++) {
        const j = nearest(Rd.X[i], Rd.Z[i]), dx = Rd.X[i] - X[j], dz = Rd.Z[i] - Z[j], d = dx * TZ[j] - dz * TX[j], dy = Rd.Y[i] - Y[j];
        // walls open only where the two decks really join: level with each other, and the ramp reaching over the loop's
        // edge. Where the ramp has climbed away or runs alongside with a gap, both keep their walls.
        const ad = Math.abs(d), RW0 = Rd.HW[i];
        if (Math.abs(dy) > 0.6 || ad - RW0 > HW[j] - 0.2) continue;
        if (Rd.opens === 'left') Rd.OGAP[i] = 1; else Rd.GAP[i] = 1;   // the far side keeps its wall
        const straddles = ad - RW0 < HW[j] - 0.5 && ad + RW0 > HW[j] + 1.2;   // a ramp just grazing the edge leaves the wall standing
        for (let k = -1; k <= 1; k++) { const q = (j + k + N) % N; if (ad < RW0 + 0.6) R.MGAP[q] = 1; if (straddles && d < 0) { GAP[q] = 1; R.JGAP[q] = 1; } if (straddles && d > 0) R.OGAP[q] = 1; }
      }
      // where two of the new roads meet (a ramp joining the route), no walls between them either
      for (const A of all) for (const Bb of all) { if (A === Bb) continue; for (let i = 0; i < A.N; i++) { const j = Bb.nearest(A.X[i], A.Z[i]); const wx = Bb.X[j] - A.X[i], wz = Bb.Z[j] - A.Z[i], sd = wx * A.TZ[i] - wz * A.TX[i];
        const along = -(wx * Bb.TX[j] + wz * Bb.TZ[j]);   // past the other road's end there is nothing to join
        if ((j === Bb.N - 1 && along > 0.5) || (j === 0 && along < -0.5)) continue;
        if (Math.abs(A.Y[i] - Bb.Y[j]) < 1.5 && Math.hypot(wx, wz) < A.HW[i] + Bb.HW[j] + 0.3) { if (sd > -1) A.OGAP[i] = 1; if (sd < 1) A.GAP[i] = 1; } } }   // only the side that faces the other road
      R.branch = B; R.branch2 = B2; R.ramps = ramps; R.roads = [R, ...all];
      const rDist = R.dist; R.dist = (x, z) => Math.min(rDist(x, z), ...all.map((q) => q.dist(x, z)));
    }
    const rProj = R.proj; R.proj = (x, z, hint, out) => { rProj(x, z, hint, out); out.R = R; out.off = false; return out; };
    return R;
  }

  /* ---------------------------------------------------------------- meshes */
  function build(R, E, o = {}) {
    const g = new THREE.Group(), parts = R.roads.map((Rd) => buildRoad(Rd, R, E, o, g));
    return { group: g, piers: [].concat(...parts.map((p) => p.piers)), upd(night, pulse) { parts.forEach((p) => p.upd(night, pulse)); } };
  }
  function buildRoad(Rd, R, E, o, g) {
    const { N, X, Y, Z, TX, TZ, HW, GAP } = Rd, closed = Rd.closed !== false, ds = Rd.ds, OG = Rd.OGAP || new Uint8Array(N), MG = Rd.MGAP || new Uint8Array(N), JG = Rd.JGAP || new Uint8Array(N), lift = Rd.lift || 0;
    const wr = closed ? (i) => ((i % N) + N) % N : (i) => Math.max(0, Math.min(N - 1, i));
    const v = new THREE.Vector3();
    const at = (i, d, y) => { i = wr(i); return v.set(X[i] + TZ[i] * d, Y[i] + y + lift, Z[i] - TX[i] * d); };

    // Sweep a cross-section along the road. prof(i) -> [[d, y], ...] (or null for "nothing here"); faces point
    // outwards when the section goes: +d along a top, down the +d side, -d along a bottom, up the -d side.
    function strip() {
      const pos = [], uv = [];
      const put = (i, p, u, vv) => { at(i, p[0], p[1]); pos.push(v.x, v.y, v.z); uv.push(u, vv); };
      return {
        add(prof, opt = {}) {
          const P = []; for (let i = 0; i < N; i++) P.push(prof(i));
          for (let i = 0; i < (closed ? N : N - 1); i++) {
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

    const city = Rd.urban ? () => 1 : (i) => sm(5, 7.5, HW[wr(i)]);            // 1 = city expressway (concrete walls), 0 = coast road (guard rails)
    const medH = (i) => (MG[wr(i)] ? 0 : 0.75 * sm(7.2, 7.95, HW[wr(i)]));  // the median fades out where the road narrows, and opens at a junction
    const hasMed = (i) => HW[wr(i)] > 7.2 && !MG[wr(i)];

    // deck
    strip().add((i) => [[-HW[i], 0], [HW[i], 0]], { us: 8, vs: 8 }).mesh(E.mat('#2c2c31', { map: E.tex('asphalt', 1, 1), rough: 0.82 }), false);
    const conc = E.mat('#6e6a68'), concD = E.mat('#4a4746');
    strip().add((i) => { const w = HW[i]; return [[w, 0], [w, -0.5], [w - 1.3, -1.3], [-w + 1.3, -1.3], [-w, -0.5], [-w, 0]]; }).mesh(conc, true);
    // side walls (they shrink to a kerb along the coast), with gaps at the parking areas
    const wallH = (i) => 0.18 + 0.95 * city(i);
    strip()
      .add((i) => { if (OG[i]) return null; const w = HW[i], h = wallH(i); return [[w - 0.4, 0], [w - 0.4, h], [w, h], [w, 0]]; })
      .add((i) => { if (GAP[i]) return null; const w = HW[i], h = wallH(i); return [[-w, 0], [-w, h], [-w + 0.4, h], [-w + 0.4, 0]]; })
      .add((i) => { const h = medH(i); return h > 0.02 ? [[-0.3, 0], [-0.24, h], [0.24, h], [0.3, 0]] : null; })
      .mesh(concD, true);
    // guard rails where the walls are low
    const railM = E.mat('#d8d6cf', { metal: 0.5, rough: 0.4 });
    const rail = (sd) => (i) => { if (city(i) > 0.6 || (sd < 0 && GAP[i]) || (sd > 0 && OG[i])) return null; const d = sd * (HW[i] - 0.2); return [[d - 0.06, 0.6], [d - 0.06, 0.86], [d + 0.06, 0.86], [d + 0.06, 0.6], [d - 0.06, 0.6]]; };
    strip().add(rail(1)).add(rail(-1)).mesh(railM, false);
    // paint
    const paint = E.basic('#cfc9bb');
    const line = (d, w) => [[d - w, 0.025], [d + w, 0.025]];
    strip()
      .add((i) => (OG[i] ? null : line(HW[i] - 0.85, 0.07))).add((i) => (GAP[i] && (!Rd.pas || JG[i]) ? null : line(-HW[i] + 0.85, 0.07)))
      .add((i) => (hasMed(i) ? line(0.8, 0.06) : null)).add((i) => (hasMed(i) ? line(-0.8, 0.06) : null))
      .add((i) => (hasMed(i) ? line(HW[i] / 2 + 0.25, 0.08) : null), { seg: (i) => i % 3 === 0 })
      .add((i) => (hasMed(i) ? line(-HW[i] / 2 - 0.25, 0.08) : null), { seg: (i) => i % 3 === 0 })
      .add((i) => (hasMed(i) || Rd.oneLane ? null : line(0, 0.08)), { seg: (i) => i % 3 === 0 })
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

    // piers with a cap beam. None in a place's way (o.blocked), and none (nor a double deck's leg) that would come up
    // through something: a building or a parked bus (o.solid: TAMA's brick block stands under the north-west junction,
    // FLIP's station forecourt under the upper deck's exit ramp) or another road's deck lower down (at both junctions the
    // upper deck's ramps pass over the lower deck's)
    const piers = [], pierL = [], capL = [];
    const through = (x, z, r, top) => (R.roads || []).some((Q) => { if (Q === Rd || Q === Rd.stack) return false; let bd = 1e18, j = 0; for (let k = 0; k < Q.N; k++) { const e = (Q.X[k] - x) ** 2 + (Q.Z[k] - z) ** 2; if (e < bd) { bd = e; j = k; } } return Math.sqrt(bd) < Q.HW[j] + r && Q.Y[j] - 1.3 < top; });
    const hits = (x, z, r, top) => (o.solid && o.solid(x, z, r, top)) || through(x, z, r, top);
    for (let i = 3; i < N; i += 8) {
      if (o.blocked && o.blocked(X[i], Z[i])) continue;
      if (Rd.avoidRing && R.dist && (() => { let b = 1e9; for (let k = 0; k < R.N; k += 2) b = Math.min(b, Math.hypot(R.X[k] - X[i], R.Z[k] - Z[i])); return b < R.HW[0] + 3; })()) continue;   // not through the loop's deck
      if (Rd.stack) {   // over the lower deck: two legs either side of it and a beam across
        const L0 = Rd.stack; let b = 1e9, j = 0; for (let k = 0; k < L0.N; k++) { const e = Math.hypot(L0.X[k] - X[i], L0.Z[k] - Z[i]); if (e < b) { b = e; j = k; } }
        if (b < L0.HW[j] + 2) {
          const dd = L0.HW[j] + 1.1, h2 = Y[i] - 2.3;
          if ([-1, 1].some((sd) => (at(i, sd * dd, 0), hits(v.x, v.z, 0.85, h2)))) continue;
          for (const sd of [-1, 1]) { at(i, sd * dd, 0); pierL.push({ x: v.x, y: (h2 - lift) / 2 - (Y[i] - h2) * 0 , z: v.z, sy: h2, sx: 0.7, sz: 0.7 }); piers.push({ x: v.x, z: v.z, r: 0.9, y1: Y[i] - 2 }); }
          capL.push({ x: X[i], y: Y[i] - 1.8, z: Z[i], yaw: yawOf(i), sx: dd * 2 + 1 });
          continue;
        }
      }
      const h = Y[i] - 2.3;
      if (hits(X[i], Z[i], 1.2, h)) continue;
      pierL.push({ x: X[i], y: h / 2, z: Z[i], sy: h });
      capL.push({ x: X[i], y: Y[i] - 1.8, z: Z[i], yaw: yawOf(i), sx: HW[i] * 2 - 3 });
      piers.push({ x: X[i], z: Z[i], r: 1.3, y1: Y[i] - 2 });
    }
    inst(new THREE.CylinderGeometry(1, 1.15, 1, 10), concD, pierL, true);
    inst(new THREE.BoxGeometry(1, 1, 2.2), conc, capL, true);

    // sodium lamps on the median: a pole, a cross arm and two heads
    const poleM = E.mat('#3a3a40', { metal: 0.5 }), headM = E.basic('#ffb04a'), poleL = [], armL = [], headL = [], glowP = [], poolL = [];
    // a lamp never stands on, through or under another road's deck
    const others = (R.roads || []).filter((q) => q !== Rd);
    const clear = (x, y, z) => { for (const Q of others) { let j = 0, bd = 1e18; for (let k = 0; k < Q.N; k++) { const e = (Q.X[k] - x) ** 2 + (Q.Z[k] - z) ** 2; if (e < bd) { bd = e; j = k; } } const dy = Q.Y[j] - y; if (Math.sqrt(bd) < Q.HW[j] + 1 && dy > -1.6 && dy < 8.5) return false; } return true; };
    for (let i = 5; i < N; i += 9) {
      if (!hasMed(i) || medH(i) < 0.7 || (o.noLamp && o.noLamp(X[i], Z[i]))) continue;   // (o.noLamp: in a tunnel, which has its own lights in its crown)
      if (!clear(X[i], Y[i], Z[i]) || ![-2.8, 2.8].every((d) => (at(i, d, 0), clear(v.x, Y[wr(i)], v.z)))) continue;
      const yw = yawOf(i);
      poleL.push({ x: X[i], y: Y[i] + 3.9, z: Z[i], sy: 6.6 });
      (R.lampAt || (R.lampAt = [])).push({ id: Rd.id, i, x: X[i], y: Y[i], z: Z[i], kind: 'median' });
      armL.push({ x: X[i], y: Y[i] + 7.2, z: Z[i], yaw: yw });
      for (const d of [-2.8, 2.8]) { at(i, d, 7.08); headL.push({ x: v.x, y: v.y, z: v.z, yaw: yw }); glowP.push(v.x, v.y - 0.1, v.z); }
      poolL.push({ x: X[i], y: Y[i] + 0.05, z: Z[i], yaw: yw });
    }
    if (Rd.urban) for (let i = 4, k = 0; i < N - 2; i += 7, k++) {   // no median: lamps on alternate walls, the arm reaching over the lanes
      const sd = k % 2 ? 1 : -1, yw = yawOf(i);
      if ((sd < 0 && GAP[i]) || (sd > 0 && OG[i]) || (o.noLamp && o.noLamp(X[i], Z[i]))) continue;   // not on an open side, nor in a tunnel
      if (!clear(...(at(i, sd * (HW[i] - 0.25), 0), [v.x, Y[i], v.z])) || !clear(...(at(i, sd * (HW[i] - 2.9), 0), [v.x, Y[i], v.z]))) continue; at(i, sd * (HW[i] - 0.25), 0); const bx = v.x, by = v.y, bz = v.z;
      poleL.push({ x: bx, y: by + 3.6, z: bz, sy: 6 }); (R.lampAt || (R.lampAt = [])).push({ id: Rd.id, i, sd, x: bx, y: by, z: bz, kind: 'side' }); at(i, sd * (HW[i] - 1.6), 6.6); armL.push({ x: v.x, y: v.y, z: v.z, yaw: yw, sx: 0.47 });
      at(i, sd * (HW[i] - 2.9), 6.48); headL.push({ x: v.x, y: v.y, z: v.z, yaw: yw }); glowP.push(v.x, v.y - 0.1, v.z); at(i, sd * (HW[i] - 3), 0.05); poolL.push({ x: v.x, y: v.y, z: v.z, yaw: yw });
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
    for (let i = 0; i < N; i += 3) { if (city(i) > 0.6) continue; for (const sd of [-1, 1]) { if ((sd < 0 && GAP[i]) || (sd > 0 && OG[i])) continue; at(i, sd * (HW[i] - 0.2), 0.45); postL.push({ x: v.x, y: v.y, z: v.z, yaw: yawOf(i) }); } }
    inst(new THREE.BoxGeometry(0.14, 0.9, 0.14), railM, postL, false);

    // A blue "P" plate on the inner side at each end of a parking area, facing the traffic that can pull in.
    if (Rd.pas) { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
      x.fillStyle = '#1f55b8'; x.fillRect(0, 0, 128, 128); x.strokeStyle = '#f4f1e6'; x.lineWidth = 7; x.strokeRect(7, 7, 114, 114);
      x.fillStyle = '#f4f1e6'; x.font = '700 96px Arial, Helvetica, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('P', 64, 70);
      const tx = new THREE.CanvasTexture(c); tx.encoding = THREE.sRGBEncoding;
      const plateM = new THREE.MeshBasicMaterial({ map: tx }); plateM.userData.lin = true;
      const postM2 = E.mat('#9aa0a8', { metal: 0.6, rough: 0.4 });
      for (const pa of Rd.pas) {
        const out = pa.side === 'out', OPEN = out ? (Rd.OGAP || []) : GAP, idx = []; for (let i = 0; i < N; i++) if (OPEN[i]) { const l = pa.f.local(X[i], Z[i]); if (Math.abs(l.x) < pa.gap + 1 && Math.abs(l.z - ROAD_Z) < 6) idx.push(i); }
        if (!idx.length) continue;
        for (const [i, face] of [[idx[0] - 2, -1], [idx[idx.length - 1] + 2, 1]]) {   // face: +1 looks up the road (towards +s), -1 down it
          at(i, (out ? 1 : -1) * (HW[wr(i)] + 0.15), 0); const px = v.x, py = v.y, pz = v.z;
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.4, 0.12), postM2); post.position.set(px, py + 1.7, pz); g.add(post);
          const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), plateM); plate.position.set(px, py + 3.1, pz); plate.rotation.y = yawOf(wr(i)) + (face > 0 ? 0 : Math.PI);
          plate.translateZ(0.08); g.add(plate);
        }
      } }

    // A lit skyline outside the loop (kept off the sea, the other places, the walkable square and the roads).
    const skyKit = Rd.pas ? SW.Buildings.kit(E, 3) : null;
    if (skyKit) { const r = E.rng(4242), list = [];
      for (let k = 0; k < 400 && list.length < 84; k++) {
        const a = r() * Math.PI * 2, d = 176 + r() * 110, x = Math.cos(a) * d, z = Math.sin(a) * d, w = 9 + r() * 12, dp = 9 + r() * 12, h = 22 + r() * 70 * (0.4 + r() * 0.6);
        if (Math.max(Math.abs(x), Math.abs(z)) < 164 || (o.keepOut && o.keepOut(x, z)) || R.dist(x, z) < Math.max(w, dp) / 2 + 9) continue;
        list.push({ x, z, yaw: r() * 3, w, h, d: dp });
      }
      g.add(skyKit.bake(list, E.rng(4343))); }

    return {
      piers,
      // night 0..1 (how dark it is), pulse 0..1 (the beat of whatever is playing)
      upd(night, pulse) {
        headM.color.setRGB(1, 0.43, 0.06).multiplyScalar(0.75 + pulse * 0.8 + night * 0.25);
        glowM.opacity = 0.12 + night * 0.6 + pulse * 0.15;
        poolM.opacity = 0.02 + night * 0.075 + pulse * 0.04;
        if (skyKit) skyKit.glow(0.3 + night * 0.7 + pulse * 0.25);
      },
    };
  }

  SW.Ring = { make, build, frame, ROAD_Z };
})();
