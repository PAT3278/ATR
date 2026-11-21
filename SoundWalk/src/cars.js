// SoundWalk cars: seven original low-poly cars for the ring expressway.
// Each one is a lofted body (side profile + plan-view taper + wheel arches), a narrower greenhouse on top, details
// (lights, grilles, pillars, shut lines) cut into that shell, a few solids (wings, bumpers, mirrors, pipes) and four
// lathe-turned wheels, merged down to six meshes: one per material.
// Front is +Z, up is +Y, tyres touch y = 0, origin on the ground midway between the axles. Units are metres.
(function () {
  'use strict';
  const SW = (window.SW = window.SW || {});

  const lerp = (a, b, t) => a + (b - a) * t;
  const lerp2 = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];
  // Piecewise-linear lookup through [z, value] points (any order).
  function pl(pts) {
    const a = pts.slice().sort((p, q) => p[0] - q[0]), n = a.length;
    return (z) => {
      if (z <= a[0][0]) return a[0][1];
      for (let i = 1; i < n; i++) if (z <= a[i][0]) { const p = a[i - 1], q = a[i], d = q[0] - p[0]; return d < 1e-9 ? q[1] : lerp(p[1], q[1], (z - p[0]) / d); }
      return a[n - 1][1];
    };
  }
  const CREASE = Math.cos(31 * Math.PI / 180);   // edges sharper than this stay hard, the rest shade smooth
  const FLAT = Math.cos(14 * Math.PI / 180), FLAT2 = Math.cos(20 * Math.PI / 180);   // a four-sided face twisted less than this counts as flat
  const kf = (p) => Math.round(p[0] * 2000) + '_' + Math.round(p[1] * 2000) + '_' + Math.round(p[2] * 2000);

  // Crease-angle vertex normals for a list of faces {p: [points], n: unit normal, a: area weight}; returns one normal per face corner.
  function smooth(faces, keyOf) {
    const buckets = new Map();
    faces.forEach((F, fi) => F.p.forEach((p, vi) => { const k = keyOf(F, p); let b = buckets.get(k); if (!b) buckets.set(k, (b = [])); b.push(fi, vi); }));
    const out = faces.map((F) => F.p.map(() => null));
    buckets.forEach((b) => {
      for (let i = 0; i < b.length; i += 2) {
        const F = faces[b[i]]; let x = 0, y = 0, z = 0;
        for (let j = 0; j < b.length; j += 2) { const G = faces[b[j]]; if (F.n[0] * G.n[0] + F.n[1] * G.n[1] + F.n[2] * G.n[2] >= CREASE) { x += G.n[0] * G.a; y += G.n[1] * G.a; z += G.n[2] * G.a; } }
        const l = Math.hypot(x, y, z) || 1; out[b[i]][b[i + 1]] = [x / l, y / l, z / l];
      }
    });
    return out;
  }
  // Triangle soup (9 position + 9 normal floats per triangle) -> BufferGeometry. r128 core has no BufferGeometryUtils, so this is the merge.
  function toGeometry(tris, S) {
    const n = tris.length / 18, pos = new Float32Array(n * 9), nrm = new Float32Array(n * 9), uv = new Float32Array(n * 6);
    for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) {
      const v = t * 3 + k, o = t * 18 + k * 3;
      pos[v * 3] = tris[o]; pos[v * 3 + 1] = tris[o + 1]; pos[v * 3 + 2] = tris[o + 2];
      nrm[v * 3] = tris[o + 9]; nrm[v * 3 + 1] = tris[o + 10]; nrm[v * 3 + 2] = tris[o + 11];
      uv[v * 2] = tris[o + 2] / S.len + 0.5; uv[v * 2 + 1] = tris[o + 1] / S.hgt;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }

  // Orthographic views used to draw details: which way the view looks and which two coordinates span its drawing plane.
  const VIEWS = {
    front: { d: [0, 0, -1], iu: 0, iv: 1 },
    rear: { d: [0, 0, 1], iu: 0, iv: 1 },
    side: { d: [-1, 0, 0], iu: 2, iv: 1 },
    top: { d: [0, -1, 0], iu: 0, iv: 2 },
  };
  const rect = (u0, v0, u1, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  const loop = (p) => p.concat([p[0]]);
  const MID = { sym: false }, MID2 = { sym: false, on: 'trim' }, GL = { on: 'glass' };   // detail options: centred / centred on the grille field / on glass only
  const SIDE_ANG = [12, 35, 62, 90, 118, 145, 168];   // where the wheel arch is sampled, degrees round the wheel

  function build(S) {
    const alias = S.alias || {}, loose = [], cuts = [];
    let shell = [], lofting = true, miss = 0;
    const mx = (p) => [-p[0], p[1], p[2]];
    const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    // The lofted shell is kept as polygons so details can be cut into it; everything else goes straight to `loose`.
    function tri(slot, a, b, c) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx, l = Math.hypot(x, y, z);
      if (l < 1e-6) return;
      (lofting ? shell : loose).push({ p: [a, b, c], s: slot, n: [x / l, y / l, z / l], a: l });
    }
    function quad(slot, a, b, c, d) { if (d2(a, c) <= d2(b, d)) { tri(slot, a, b, c); tri(slot, a, c, d); } else { tri(slot, a, b, d); tri(slot, b, c, d); } }
    const crs = (a, b, c) => { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]; return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; };
    // A shell quad that is flat enough stays ONE four-sided face: a detail cut into it then makes half as many pieces.
    function face(slot, a, b, c, d) {
      const n1 = crs(a, b, c), n2 = crs(a, c, d), n3 = crs(a, b, d), n4 = crs(b, c, d), l1 = Math.hypot(...n1), l2 = Math.hypot(...n2), l3 = Math.hypot(...n3), l4 = Math.hypot(...n4);
      const n = [n1[0] + n2[0], n1[1] + n2[1], n1[2] + n2[2]], l = Math.hypot(...n), dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
      if (Math.min(l1, l2, l3, l4) < 1e-6 || dot(n1, n2) < FLAT * l1 * l2 || dot(n3, n) < FLAT2 * l3 * l || dot(n4, n) < FLAT2 * l4 * l) return quad(slot, a, b, c, d);
      shell.push({ p: [a, b, c, d], s: slot, n: [n[0] / l, n[1] / l, n[2] / l], a: l1 + l2 });
    }
    function quad2(slot, a, b, c, d) { face(slot, a, b, c, d); face(slot, mx(a), mx(d), mx(c), mx(b)); }
    // Same, but wound so the face looks along `dir`.
    function triF(slot, a, b, c, dir) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      if ((uy * vz - uz * vy) * dir[0] + (uz * vx - ux * vz) * dir[1] + (ux * vy - uy * vx) * dir[2] < 0) tri(slot, a, c, b); else tri(slot, a, b, c);
    }
    function quadF(slot, a, b, c, d, dir) {
      const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2], vx = d[0] - b[0], vy = d[1] - b[1], vz = d[2] - b[2];
      if ((uy * vz - uz * vy) * dir[0] + (uz * vx - ux * vz) * dir[1] + (ux * vy - uy * vx) * dir[2] < 0) quad(slot, a, d, c, b); else quad(slot, a, b, c, d);
    }

    // ---- the lofted shell -------------------------------------------------------------------
    const top = pl(S.top), belt = pl(S.belt), bot = pl(S.bot), plan = pl(S.plan), C = S.cab;
    const waist = S.waist ? pl(S.waist) : (z) => { const b = bot(z); return b + (belt(z) - b) * (S.waistF || 0.55); };
    const ledge = S.ledge ? pl(S.ledge) : () => 0.03, inK = S.inK ? pl(S.inK) : () => 1;
    const zF = S.top[0][0], zR = S.top[S.top.length - 1][0];
    const arches = S.ax.map((zc) => ({ zc, cy: S.R + (S.archLift || 0), Ra: S.R + S.archGap }));
    function archY(z) { for (const a of arches) { const dz = Math.abs(z - a.zc); if (dz < a.Ra - 1e-6) return a.cy + Math.sqrt(a.Ra * a.Ra - dz * dz); } return -1; }
    // Body side from the sill up to the shoulder; inside a wheel arch the lower points ride up onto the arch edge and its lip.
    function lower(z) {
      const W = plan(z), yb = bot(z), yB = Math.max(belt(z), yb + 0.03), yw = Math.min(Math.max(waist(z), yb + 0.01), yB - 0.01);
      const P = [[W - S.tuck, yb], [W - S.tuck, yb], [W, yw], [W - S.shIn, yB]], ya = archY(z);
      if (ya > yb + 0.002) {
        const k = Math.min(1, (ya - yb) / 0.08), f = (S.flare || 0) * k, bw = (S.archBand || 0) * k, yc = Math.min(ya, yB - 0.02 - bw);
        const at = (y) => (y <= yw ? lerp2(P[0], P[2], (y - yb) / (yw - yb)) : lerp2(P[2], P[3], Math.min(1, (y - yw) / (yB - yw))));
        const q0 = at(yc), q1 = at(yc + bw);
        P[2] = bw ? at(Math.max(yw, yc + bw + 0.012)) : yw > yc ? P[2] : [q0[0] + f, yc];
        P[0] = [q0[0] + f, yc]; P[1] = [q1[0] + f, yc + bw];      // arch edge and the top of its lip, both standing proud
      }
      return P;
    }
    function upHood(z, lo) {
      const xs = lo[3][0], yB = lo[3][1], yT = Math.max(top(z), yB + 0.004), h = yT - yB, k = inK(z), x6 = Math.max(xs - 0.13 * k, xs * 0.4);
      return [[xs - 0.055 * k, yB + 0.55 * h], [xs - 0.055 * k, yB + 0.55 * h], [x6, yB + 0.9 * h], [x6 * 0.5, yB + 0.98 * h], [0, yT]];
    }
    function upCab(z, lo) {
      const xs = lo[3][0], yB = lo[3][1], yT = Math.max(top(z), yB + 0.004), h = yT - yB, xg = xs - ledge(z), hg = Math.max(h - S.drop - S.rail, 0.01), x5 = xg - S.tum * hg, x6 = x5 - S.pw;
      return [[xg, yB + 0.012], [x5, yB + hg], [x6, yB + h - S.drop], [x6 * 0.5, yB + h - S.drop * 0.22], [0, yT]];
    }
    const key = { cowl: upHood(C.cowl, lower(C.cowl)), aTop: upCab(C.aTop, lower(C.aTop)), roofRear: upCab(C.roofRear, lower(C.roofRear)), base: upHood(C.base, lower(C.base)) };
    function ring(z) {
      const lo = lower(z); let up;
      if (z >= C.cowl || z <= C.base) up = upHood(z, lo);
      else if (z <= C.aTop && z >= C.roofRear) up = upCab(z, lo);
      else if (z > C.aTop) { const t = (C.cowl - z) / (C.cowl - C.aTop); up = key.cowl.map((p, i) => lerp2(p, key.aTop[i], t)); }
      else { const t = (C.roofRear - z) / (C.roofRear - C.base); up = key.roofRear.map((p, i) => lerp2(p, key.base[i], t)); }
      return lo.concat(up);
    }
    let zs = [];
    [S.top, S.belt, S.bot, S.plan, S.waist || [], S.ledge || [], S.inK || []].forEach((a) => a.forEach((p) => zs.push(p[0])));
    zs.push(C.cowl, C.aTop, C.roofRear, C.base, ...(S.extra || []));
    zs = zs.filter((z) => z <= zF && z >= zR).sort((a, b) => b - a).filter((z, i, a) => !i || a[i - 1] - z > 1e-4);
    const archOnly = new Set();   // stations that exist only to shape a wheel arch: they cut the body side, not the roof
    for (const a of arches) {
      for (const z of [a.zc + a.Ra, a.zc - a.Ra]) if (z < zF && z > zR && !zs.some((k) => Math.abs(k - z) < 0.002)) { zs.push(z); archOnly.add(z); }
      for (const d of SIDE_ANG) { const z = a.zc + a.Ra * Math.cos(d * Math.PI / 180); if (z < zF && z > zR && !zs.some((k) => Math.abs(k - z) < 0.012)) { zs.push(z); archOnly.add(z); } }
    }
    zs.sort((a, b) => b - a);
    const sg = S.sideGlass || [C.cowl, C.roofRear], lowSlot = S.clad ? 'clad' : 'paint', chin = S.chin, RT = S.rearTop;
    function slotFor(j, zm) {
      if (j <= 1) return lowSlot;
      if (j <= 2) return 'paint';
      if (j === 3) return S.beltSlot && zm < sg[0] && zm > sg[1] ? S.beltSlot : 'paint';
      const ws = zm < C.cowl && zm > C.aTop, rf = zm <= C.aTop && zm >= C.roofRear, bl = zm < C.roofRear && zm > C.base;
      const rt = RT && zm < RT[0] && zm > C.base ? RT[1] : null;       // a separate rear top section in its own colour
      if (j === 4) return zm < sg[0] && zm > sg[1] ? 'glass' : rt || 'paint';
      if (j === 5) return rt || (ws ? S.aPillar || 'paint' : rf ? S.railSlot || 'paint' : bl ? S.cPillar || 'paint' : 'paint');
      return ws || bl ? 'glass' : rf ? rt || S.roof || 'paint' : 'paint';
    }
    const st = zs.map((z) => ring(z).map((p) => [p[0], p[1], z]));
    const tri2 = (slot, a, b, c) => { tri(slot, a, b, c); tri(slot, mx(a), mx(c), mx(b)); };
    for (let i = 0, k = 0; i < st.length - 1; i = k) {
      for (k = i + 1; archOnly.has(zs[k]);) k++;                 // i and k are full stations, anything between is arch-only
      const A = st[i], B = st[k], zm = (zs[i] + zs[k]) / 2, mid = i + ((k - i) >> 1);
      for (let m = i; m < k; m++) {
        const P = st[m], Q = st[m + 1], z2 = (zs[m] + zs[m + 1]) / 2;
        for (let j = 0; j < 3; j++) quad2(slotFor(j, z2), P[j], Q[j], Q[j + 1], P[j + 1]);
        face(chin && (z2 > chin[0] || z2 < chin[1]) ? lowSlot : 'trim', P[0], mx(P[0]), mx(Q[0]), Q[0]);   // floor; over the axles it becomes the wheel tunnel
        tri2(slotFor(3, zm), P[3], Q[3], m < mid ? A[4] : B[4]);
      }
      tri2(slotFor(3, zm), st[mid][3], B[4], A[4]);
      for (let j = 4; j < 8; j++) quad2(slotFor(j, zm), A[j], B[j], B[j + 1], A[j + 1]);
    }
    { const F = st[0], Rr = st[st.length - 1];
      for (let j = 0; j < 8; j++) {
        const s = j <= 1 ? lowSlot : 'paint';
        face(s, F[j], F[j + 1], mx(F[j + 1]), mx(F[j]));
        face(s, Rr[j], mx(Rr[j]), mx(Rr[j + 1]), Rr[j + 1]);
      } }
    lofting = false;
    // Shading normals are fixed now, per colour, so cutting details in later cannot dent the surface. Points become [x, y, z, nx, ny, nz].
    { const N = smooth(shell, (F, p) => F.s + kf(p)); shell.forEach((F, i) => { F.p = F.p.map((p, k) => [p[0], p[1], p[2], N[i][k][0], N[i][k][1], N[i][k][2]]); }); }

    // ---- details: a convex outline drawn in one view is cut INTO the shell triangles it covers (no floating layers, so
    // nothing can z-fight in the game's coarse depth buffer). Mirrored to the other side unless sym: false.
    function decal(slot, view, poly, o = {}) {
      const V = VIEWS[view], n = poly.length, jump = o.jump || 0.4, graze = o.graze || 0.25, iu = V.iu, iv = V.iv;
      for (const sgn of o.sym === false ? [1] : [1, -1]) {
        const side = view === 'side', d = side ? [-sgn, 0, 0] : V.d;
        let P = side ? poly : poly.map((p) => [p[0] * sgn, p[1]]), ar = 0;
        for (let i = 0; i < n; i++) { const p = P[i], q = P[(i + 1) % n]; ar += p[0] * q[1] - q[0] * p[1]; }
        if (ar < 0) P = P.slice().reverse();
        const us = P.map((p) => p[0]), vs = P.map((p) => p[1]), u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs);
        const cand = new Map(); let ref = Infinity;
        shell.forEach((F, fi) => {
          if (o.on && F.s !== o.on) return;
          if (F.n[0] * d[0] + F.n[1] * d[1] + F.n[2] * d[2] > -graze) return;
          let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
          for (const p of F.p) { const u = p[iu], v = p[iv]; if (u < a0) a0 = u; if (u > a1) a1 = u; if (v < b0) b0 = v; if (v > b1) b1 = v; }
          if (a1 < u0 || a0 > u1 || b1 < v0 || b0 > v1) return;
          let cur = F.p.map((p) => [p[0], p[1], p[2], p[3], p[4], p[5], p[iu], p[iv]]);
          const outs = [];
          for (let i = 0; i < n && cur.length > 2; i++) {
            const A = P[i], B = P[(i + 1) % n], ex = B[0] - A[0], ey = B[1] - A[1], el = Math.hypot(ex, ey) || 1, ins = [], out = [];
            for (let k = 0; k < cur.length; k++) {
              const p = cur[k], q = cur[(k + 1) % cur.length], dp = (ex * (p[7] - A[1]) - ey * (p[6] - A[0])) / el, dq = (ex * (q[7] - A[1]) - ey * (q[6] - A[0])) / el;
              if (dp >= -1e-7) ins.push(p);
              if (dp <= 1e-7) out.push(p);
              if ((dp > 1e-7 && dq < -1e-7) || (dp < -1e-7 && dq > 1e-7)) { const t = dp / (dp - dq), m = p.map((x, c) => lerp(x, q[c], t)); ins.push(m); out.push(m); cuts.push(m); }
            }
            if (out.length > 2 && area(out) > 2e-7) outs.push(out);
            cur = ins;
          }
          if (cur.length < 3 || area(cur) < 2e-7) return;
          let t = 0; for (const p of cur) t += (p[0] * d[0] + p[1] * d[1] + p[2] * d[2]) / cur.length;
          ref = Math.min(ref, t); cand.set(fi, { cur, outs, t });
        });
        if (!cand.size) { miss++; continue; }
        const next = [];
        shell.forEach((F, fi) => {
          const c = cand.get(fi);
          if (!c || c.t - ref > jump) { next.push(F); return; }
          for (const q of c.outs) next.push({ p: q.map((p) => p.slice(0, 6)), s: F.s, n: F.n, a: F.a });
          next.push({ p: c.cur.map((p) => p.slice(0, 6)), s: slot, n: F.n, a: F.a });
        });
        shell = next;
      }
    }
    function area(pts) { let s = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += p[6] * q[7] - q[6] * p[7]; } return Math.abs(s) / 2; }
    function line(slot, view, pts, w, o) {
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i], q = pts[i + 1], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * w / 2, ny = dx / l * w / 2;
        decal(slot, view, [[p[0] - nx, p[1] - ny], [q[0] - nx, q[1] - ny], [q[0] + nx, q[1] + ny], [p[0] + nx, p[1] + ny]], o);
      }
    }
    // A lamp with a dark surround.
    function lamp(slot, view, poly, o = {}) {
      let cu = 0, cv = 0; for (const p of poly) { cu += p[0] / poly.length; cv += p[1] / poly.length; }
      const g = o.grow || 0.016;
      if (o.rim !== false) decal('trim', view, poly.map((p) => { const dx = p[0] - cu, dy = p[1] - cv, l = Math.hypot(dx, dy) || 1; return [p[0] + dx / l * g * 1.6, p[1] + Math.sign(dy) * g]; }), o);
      decal(slot, view, poly, o);
    }
    function disc(slot, view, cu, cv, ru, rv, n, o) {
      const P = []; for (let i = 0; i < n; i++) { const a = (i + 0.5) / n * Math.PI * 2; P.push([cu + Math.cos(a) * ru, cv + Math.sin(a) * rv]); }
      decal(slot, view, P, o);
    }

    // ---- solids --------------------------------------------------------------------------------
    const FACES = [[0, 2, 6, 4], [1, 3, 7, 5], [0, 1, 5, 4], [2, 3, 7, 6], [0, 1, 3, 2], [4, 5, 7, 6]];
    // Six-sided solid from 8 corners (index = ix + 2*iy + 4*iz). `skip` lists faces that are buried and need not be drawn: 0/1 = x ends, 2/3 = bottom/top, 4/5 = z ends.
    function hexa(slot, p, sym, skip) {
      const c = [0, 0, 0]; p.forEach((q) => { c[0] += q[0] / 8; c[1] += q[1] / 8; c[2] += q[2] / 8; });
      for (const f of FACES) {
        if (skip && skip.includes(FACES.indexOf(f))) continue;
        const a = p[f[0]], b = p[f[1]], cc = p[f[2]], d = p[f[3]], m = [(a[0] + cc[0]) / 2 - c[0], (a[1] + cc[1]) / 2 - c[1], (a[2] + cc[2]) / 2 - c[2]];
        quadF(slot, a, b, cc, d, m);
        if (sym) quadF(slot, mx(a), mx(b), mx(cc), mx(d), [-m[0], m[1], m[2]]);
      }
    }
    // Box corners, index = ix + 2*iy + 4*iz; `f` may nudge each corner (p, ix, iy, iz).
    function box(c, s, f) {
      const p = [];
      for (let iz = 0; iz < 2; iz++) for (let iy = 0; iy < 2; iy++) for (let ix = 0; ix < 2; ix++) {
        const q = [c[0] + (ix - 0.5) * s[0], c[1] + (iy - 0.5) * s[1], c[2] + (iz - 0.5) * s[2]]; if (f) f(q, ix, iy, iz); p.push(q);
      }
      return p;
    }
    // Surface of revolution about axis `a` through `c`; (u, v) span the plane of rotation. band() joins two (offset, radius) points.
    function lathe(c, a, u, v, seg, ph = 0) {
      const P = (x, r, th) => { const cu = Math.cos(th) * r, sv = Math.sin(th) * r; return [c[0] + a[0] * x + u[0] * cu + v[0] * sv, c[1] + a[1] * x + u[1] * cu + v[1] * sv, c[2] + a[2] * x + u[2] * cu + v[2] * sv]; };
      function band(slot, x1, r1, x2, r2) {
        const na = -(r2 - r1), nr = x2 - x1;
        for (let k = 0; k < seg; k++) {
          const t0 = ph + k / seg * Math.PI * 2, t1 = ph + (k + 1) / seg * Math.PI * 2, tm = (t0 + t1) / 2, cu = Math.cos(tm) * nr, sv = Math.sin(tm) * nr;
          quadF(slot, P(x1, r1, t0), P(x2, r2, t0), P(x2, r2, t1), P(x1, r1, t1), [a[0] * na + u[0] * cu + v[0] * sv, a[1] * na + u[1] * cu + v[1] * sv, a[2] * na + u[2] * cu + v[2] * sv]);
        }
      }
      return { P, band };
    }
    // A wheel: lathe-turned tyre, a polished lip dished inwards, a dark well behind, and flat spokes standing a few centimetres
    // in front of that well (far enough apart that the depth buffer never confuses the two).
    function wheelAt(c, a, u, v, W) {
      const seg = W.seg || 12, ph = -Math.PI / 2 - Math.round(seg * 0.75) * 2 * Math.PI / seg, L = lathe(c, a, u, v, seg, ph), R = W.R, Rr = W.rim, w = W.w, sp = W.spoke;
      for (let k = 1; k < seg - 1; k++) triF('trim', L.P(-w, R, ph), L.P(-w, R, ph + k / seg * Math.PI * 2), L.P(-w, R, ph + (k + 1) / seg * Math.PI * 2), [-a[0], -a[1], -a[2]]);   // flat inner face, so nothing shows through the wheel tunnel
      L.band('trim', -w, R, -0.035, R);
      L.band('trim', -0.035, R, 0, R - 0.035);
      L.band('trim', 0, R - 0.035, -0.004, Rr);
      const lipW = W.lipW || 0.025, ro = Rr - lipW, xl = -(W.lipD || 0.036), xt = -0.012, rt = Rr - lipW * (xt + 0.004) / (xl + 0.004);
      L.band(W.lip || 'metal', -0.004, Rr, xl, ro);
      L.band(sp.gap || 'trim', xl, ro, -(W.dish || 0.1), 0);
      const n = sp.n, per = Math.PI * 2 / n, wr = (sp.f || 0.3) * per / 2, wh = (sp.fh || 0.6) * per / 2, ri = sp.ri || 0.05, xh = -(sp.xh || 0.026), sS = sp.slot || 'metal';
      const hubC = L.P(xh + 0.01, 0, 0), arms = sp.vee ? [-sp.vee, sp.vee] : [0];
      for (let i = 0; i < n; i++) {
        const c0 = i * per + (sp.ph || 0), lh = L.P(xh, ri, c0 - wh), rh = L.P(xh, ri, c0 + wh);
        for (const dv of arms) {
          const cr = c0 + (sp.tw || 0) + dv, lr = L.P(xt, rt, cr - wr), rr = L.P(xt, rt, cr + wr);
          if (wr > 0.3) { const mr = L.P(xt, rt, cr); triF(sS, lh, lr, mr, a); triF(sS, lh, mr, rh, a); triF(sS, rh, mr, rr, a); } else quadF(sS, lr, rr, rh, lh, a);
        }
        triF(sS, hubC, lh, rh, a); triF(sS, hubC, rh, L.P(xh, ri, c0 + per - wh), a);
      }
      if (W.cal) {      // brake caliper: a small block in the upper front quarter, seen between the spokes
        const p = [], th = W.calAt === undefined ? 0.75 : W.calAt;
        for (let iz = 0; iz < 2; iz++) for (let iy = 0; iy < 2; iy++) for (let ix = 0; ix < 2; ix++) p.push(L.P(iz ? -0.03 : -0.09, ro * (iy ? 0.93 : 0.64), th + (ix - 0.5) * 0.62));
        hexa(W.cal, p);
      }
    }
    function tip(x, y, z, r, sym, sides = 6, len = 0.14) {   // exhaust tip pointing backwards
      for (const s of sym ? [1, -1] : [1]) { const L = lathe([x * s, y, z], [0, 0, -1], [1, 0, 0], [0, 1, 0], sides); L.band('metal', -len, r, 0, r); L.band('trim', 0, r, -0.03, 0); }
    }
    function mirrors(z, slot, k = 1) {
      const r = ring(z), x = r[4][0], y = r[4][1];
      hexa(slot, box([x + 0.03 + 0.09 * k, y + 0.075 * k, z], [0.18 * k, 0.115 * k, 0.085 * k], (p, ix, iy, iz) => { if (iz) { p[0] -= (ix - 0.5) * 0.05; p[1] -= (iy - 0.5) * 0.04; } if (!ix) { p[1] -= (iy - 0.5) * 0.03; } }), true);
      hexa('trim', box([x + 0.01, y + 0.035, z + 0.005], [0.09, 0.035, 0.05]), true);
    }
    const roofY = (x, z) => { const r = ring(z), a = x >= r[7][0] ? r[6] : r[7], b = x >= r[7][0] ? r[7] : r[8]; return lerp(a[1], b[1], (a[0] - x) / ((a[0] - b[0]) || 1)); };
    // Side-glass extent at z: [bottom, top].
    const gy = (z) => { const r = ring(z); return [r[4][1], r[5][1]]; };
    const pillar = (slot, z0, z1, o) => decal(slot, 'side', [[z0, 0], [z1, 0], [z1, 3], [z0, 3]], Object.assign({ on: 'glass', graze: 0.35 }, o));

    // wheels
    S.ax.forEach((zc, k) => {
      const W = Object.assign({ R: S.R, rim: S.rim, w: S.tw }, S.wheel, k ? S.wheelRear : null), xo = plan(zc) + (S.flare || 0) - (S.wheelIn || 0.02);
      wheelAt([xo, W.R, zc], [1, 0, 0], [0, 0, 1], [0, 1, 0], W);
      wheelAt([-xo, W.R, zc], [-1, 0, 0], [0, 0, 1], [0, 1, 0], W);
      // a dark wall down the middle of the wheel tunnel, so daylight from the far arch never shows round the tyre
      const A = arches[k], y0 = bot(zc), wall = [[0, y0, zc - A.Ra], [0, y0, zc + A.Ra], [0, A.cy + A.Ra, zc + A.Ra], [0, A.cy + A.Ra, zc - A.Ra]];
      quadF('trim', wall[0], wall[1], wall[2], wall[3], [1, 0, 0]); quadF('trim', wall[0], wall[1], wall[2], wall[3], [-1, 0, 0]);
    });
    if (S.cowlStrip !== false) decal('trim', 'top', [[-key.cowl[2][0], C.cowl - 0.003], [key.cowl[2][0], C.cowl - 0.003], [key.cowl[2][0] + 0.03, C.cowl + 0.055], [-key.cowl[2][0] - 0.03, C.cowl + 0.055]], { sym: false, on: 'paint' });
    const handle = (z, y, l = 0.13, slot = 'trim') => decal(slot, 'side', rect(z - l / 2, y, z + l / 2, y + 0.03));
    const flap = (z, y, w = 0.13) => {     // fuel flap, one side only: a dark square with the panel colour cut back into it leaves the outline
      const before = shell; decal('trim', 'side', rect(z - w / 2, y, z + w / 2, y + w), MID);
      const was = new Set(before); let own = null; for (const F of shell) if (F.s === 'trim' && !was.has(F)) { own = F; F.s = 'flap'; }
      if (own) decal('paint', 'side', rect(z - w / 2 + 0.01, y + 0.01, z + w / 2 - 0.01, y + w - 0.01), { sym: false, on: 'flap' });
      for (const F of shell) if (F.s === 'flap') F.s = 'trim';
    };
    if (S.detail) S.detail({ decal, lamp, line, disc, hexa, box, wheelAt, tip, mirrors, pillar, handle, flap, gy, roofY, zR });

    // ---- gather. First mend the T-junctions the cuts left behind: wherever a cut point sits on a neighbour's edge, give the
    // neighbour that very point too, so no pinholes can open between triangles.
    const buf = {}; let tris = 0;
    const put = (slot, p, q, r) => { slot = alias[slot] || slot; (buf[slot] || (buf[slot] = [])).push(p[0], p[1], p[2], q[0], q[1], q[2], r[0], r[1], r[2], p[3], p[4], p[5], q[3], q[4], q[5], r[3], r[4], r[5]); tris++; };
    { const seen = new Map(), fine = (p) => Math.round(p[0] * 5e4) + '_' + Math.round(p[1] * 5e4) + '_' + Math.round(p[2] * 5e4);
      const weld = (p) => { const k = fine(p), q = seen.get(k); if (q) { p[0] = q[0]; p[1] = q[1]; p[2] = q[2]; } else seen.set(k, p); return k; };
      for (const F of shell) for (const p of F.p) weld(p);
      const cp = [], ck = new Set();
      for (const m of cuts) { const k = fine(m), q = seen.get(k); if (q && !ck.has(k)) { ck.add(k); cp.push(q); } }
      cp.sort((a, b) => a[2] - b[2]);
      const from = (z) => { let lo = 0, hi = cp.length; while (lo < hi) { const m = (lo + hi) >> 1; if (cp[m][2] < z) lo = m + 1; else hi = m; } return lo; };
      for (const F of shell) {
        const out = [];
        for (let i = 0; i < F.p.length; i++) {
          const a = F.p[i], b = F.p[(i + 1) % F.p.length], ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2], len = Math.hypot(ex, ey, ez), on = [];
          out.push(a);
          if (len < 1e-4) continue;
          for (let k = from(Math.min(a[2], b[2]) - 1e-5); k < cp.length && cp[k][2] <= Math.max(a[2], b[2]) + 1e-5; k++) {
            const c = cp[k], t = ((c[0] - a[0]) * ex + (c[1] - a[1]) * ey + (c[2] - a[2]) * ez) / (len * len);
            if (t * len < 1e-4 || (1 - t) * len < 1e-4 || Math.hypot(a[0] + ex * t - c[0], a[1] + ey * t - c[1], a[2] + ez * t - c[2]) > 2e-5) continue;
            on.push([c[0], c[1], c[2], lerp(a[3], b[3], t), lerp(a[4], b[4], t), lerp(a[5], b[5], t), t]);
          }
          on.sort((p, q) => p[6] - q[6]).forEach((p) => out.push(p));
        }
        F.p = out;
      } }
    // Shell polygons fan out with their fixed normals (from a corner that leaves no sliver, else from the middle).
    const ar2 = (a, b, c) => { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]; return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx); };
    for (const F of shell) {
      let P = F.p; const n = P.length; let apex = -1;
      if (n === 4 && d2(P[0], P[2]) > d2(P[1], P[3])) P = [P[1], P[2], P[3], P[0]];
      for (let v = 0; v < n && apex < 0; v++) { let ok = true; for (let i = 1; i < n - 1 && ok; i++) ok = ar2(P[v], P[(v + i) % n], P[(v + i + 1) % n]) > 1e-8; if (ok) apex = v; }
      if (apex >= 0) { for (let i = 1; i < n - 1; i++) put(F.s, P[apex], P[(apex + i) % n], P[(apex + i + 1) % n]); continue; }
      const c = [0, 0, 0, 0, 0, 0]; for (const p of P) for (let k = 0; k < 6; k++) c[k] += p[k] / n;
      for (let i = 0; i < n; i++) if (ar2(c, P[i], P[(i + 1) % n]) > 1e-8) put(F.s, c, P[i], P[(i + 1) % n]);
    }
    { const N = smooth(loose, (F, p) => (alias[F.s] || F.s) + kf(p)); loose.forEach((F, i) => put(F.s, F.p[0].concat(N[i][0]), F.p[1].concat(N[i][1]), F.p[2].concat(N[i][2]))); }
    const geo = {};
    for (const k in buf) geo[k] = toGeometry(buf[k], S);
    return { geo, tris, miss };
  }

  // ---- the seven cars ------------------------------------------------------------------------------
  // Profiles run nose -> tail as [z, y]: `top` is the centreline silhouette, `belt` the shoulder line, `bot` the underside,
  // `plan` the half width. `cab` marks windscreen base, roof front, roof rear and rear-glass base.
  function sedan(id, name, paint) {
    return {
      id, name, geo: 'sedan', span: 2.07, paint, pm: { rough: 0.24, metal: 0.3, env: 1 },
      R: 0.33, rim: 0.255, tw: 0.25, ax: [1.4125, -1.4125], archGap: 0.05, flare: 0.012, archBand: 0.03, wheelIn: 0.022, tuck: 0.06, shIn: 0.045, tum: 0.42, pw: 0.06, drop: 0.035, rail: 0.03,
      top: [[2.29, 0.52], [2.275, 0.71], [2.19, 0.775], [1.3, 0.895], [1.02, 0.92], [0.2, 1.365], [-0.3, 1.4], [-0.8, 1.385], [-1.2, 1.335], [-1.86, 1.04], [-2.33, 1.02], [-2.4, 1.032], [-2.43, 0.985], [-2.4525, 0.6]],
      belt: [[2.29, 0.51], [2.275, 0.69], [2.19, 0.75], [1.3, 0.865], [1.02, 0.89], [-0.3, 0.925], [-1.2, 0.955], [-1.86, 1.005], [-2.33, 0.995], [-2.4, 1.0], [-2.43, 0.97], [-2.4525, 0.59]],
      bot: [[2.29, 0.25], [2.19, 0.14], [-1.86, 0.14], [-2.33, 0.21], [-2.4525, 0.33]],
      plan: [[2.29, 0.68], [2.275, 0.74], [2.19, 0.86], [1.3, 0.915], [-0.3, 0.925], [-1.2, 0.918], [-1.86, 0.9], [-2.33, 0.85], [-2.43, 0.78], [-2.4525, 0.7]],
      cab: { cowl: 1.02, aTop: 0.2, roofRear: -1.2, base: -1.86 }, extra: [-1.52], sideGlass: [1.02, -1.52], waistF: 0.6, beltSlot: 'metal',
      wheel: { lipW: 0.02, spoke: { n: 5, vee: 0.2, f: 0.1, fh: 0.5, ri: 0.055, ph: 0.31 } }, cowlStrip: false,
      detail(D) {
        // wide hexagonal grille: dark field, heavy bright frame, five bars
        const hex = [[-0.3, 0.3], [0.3, 0.3], [0.42, 0.5], [0.36, 0.675], [-0.36, 0.675], [-0.42, 0.5]];
        D.decal('trim', 'front', hex, MID);
        D.line('metal', 'front', loop(hex), 0.07, MID2);
        for (const y of [0.37, 0.435, 0.5, 0.56, 0.62]) D.line('metal', 'front', [[-0.42, y], [0.42, y]], 0.014, MID2);
        // sharp lamps: slim outer blade, deeper inner end stepping down towards the grille, a dark cut through the middle
        D.decal('head', 'front', [[0.47, 0.605], [0.89, 0.645], [0.89, 0.705], [0.47, 0.675]]);
        D.decal('head', 'front', [[0.47, 0.57], [0.64, 0.592], [0.64, 0.625], [0.47, 0.61]]);
        D.decal('head', 'side', [[2.3, 0.64], [2.3, 0.7], [2.06, 0.71], [2.12, 0.67]]);
        D.line('trim', 'front', [[0.67, 0.6], [0.67, 0.72]], 0.014, { on: 'head' });
        D.decal('trim', 'front', [[0.5, 0.3], [0.74, 0.32], [0.72, 0.45], [0.5, 0.44]]);
        D.line('metal', 'front', [[0.5, 0.37], [0.74, 0.385]], 0.022, { on: 'trim' });
        // tail: dark slim lamps with a bright line that runs on into the wing, recessed blank plate, dark valance, four pipes
        D.decal('trim', 'rear', [[0.22, 0.86], [0.92, 0.872], [0.92, 0.962], [0.22, 0.948]]);
        D.decal('tail', 'rear', [[0.26, 0.893], [0.92, 0.906], [0.92, 0.936], [0.26, 0.922]], { on: 'trim' });
        D.decal('trim', 'side', [[-2.46, 0.866], [-2.17, 0.9], [-2.17, 0.95], [-2.46, 0.962]]);
        D.decal('tail', 'side', [[-2.46, 0.902], [-2.2, 0.915], [-2.2, 0.938], [-2.46, 0.936]], { on: 'trim' });
        D.decal('trim', 'rear', [[-0.3, 0.67], [0.3, 0.67], [0.27, 0.82], [-0.27, 0.82]], MID);
        D.decal('metal', 'rear', rect(-0.17, 0.695, 0.17, 0.795), MID2);
        D.line('trim', 'rear', [[0.285, 0.675], [0.6, 0.675]], 0.012);
        D.decal('trim', 'rear', [[-0.72, 0.335], [0.72, 0.335], [0.68, 0.44], [-0.68, 0.44]], MID);
        D.tip(0.46, 0.305, -2.48, 0.052, true, 5); D.tip(0.585, 0.305, -2.48, 0.052, true, 5);
        D.line('trim', 'top', [[0, -1.93], [0.64, -1.93]], 0.012);
        // side: pillars, shut lines, handles (the bright window line is the belt moulding itself)
        D.pillar('trim', -0.1, -0.2); D.pillar('trim', -1.17, -1.21);
        D.line('trim', 'side', [[0.84, 0.855], [0.84, 0.2]], 0.012);
        D.line('trim', 'side', [[-0.15, 0.905], [-0.15, 0.2]], 0.012);
        D.line('trim', 'side', [[-1.22, 0.935], [-1.07, 0.7]], 0.012);
        D.handle(0.0, 0.83); D.handle(-0.94, 0.858);
        D.mirrors(0.8, 'metal');
      },
    };
  }
  const SPECS = [
    {
      id: 'z32', name: 'twin-turbo coupe', span: 1.96, paint: '#a9adb2', pm: { rough: 0.28, metal: 0.4, env: 1 }, alias: { metal: 'paint' },
      R: 0.315, rim: 0.245, tw: 0.26, ax: [1.225, -1.225], archGap: 0.045, archLift: -0.01, flare: 0.014, archBand: 0.03, wheelIn: 0.01, tuck: 0.07, shIn: 0.045, tum: 0.5, pw: 0.06, drop: 0.03, rail: 0.03,
      top: [[2.17, 0.42], [2.13, 0.5], [2.07, 0.6], [1.45, 0.745], [0.82, 0.825], [0.04, 1.2], [-0.14, 1.238], [-0.36, 1.25], [-0.62, 1.225], [-1.72, 0.93], [-1.98, 0.915], [-2.07, 0.9], [-2.125, 0.83], [-2.14, 0.56]],
      belt: [[2.17, 0.41], [2.13, 0.485], [2.07, 0.57], [1.45, 0.705], [0.82, 0.79], [0.04, 0.825], [-0.62, 0.85], [-1.72, 0.895], [-1.98, 0.895], [-2.07, 0.88], [-2.125, 0.815], [-2.14, 0.55]],
      bot: [[2.17, 0.3], [2.13, 0.19], [2.07, 0.15], [-1.72, 0.14], [-1.98, 0.19], [-2.07, 0.23], [-2.125, 0.27], [-2.14, 0.34]],
      plan: [[2.17, 0.5], [2.13, 0.66], [2.07, 0.745], [1.45, 0.885], [-0.36, 0.872], [-1.225, 0.9], [-1.72, 0.88], [-1.98, 0.845], [-2.07, 0.81], [-2.125, 0.77], [-2.14, 0.72]],
      cab: { cowl: 0.82, aTop: 0.04, roofRear: -0.62, base: -1.72 }, extra: [-1.5], sideGlass: [0.82, -1.5], beltSlot: 'trim', chin: [2.06, -9],
      ledge: [[0.82, 0.04], [-0.62, 0.07]], inK: [[0.82, 1], [-1.72, 1.7], [-2.14, 1]],
      wheel: { seg: 14, cal: 'red', lipW: 0.042, spoke: { n: 5, f: 0.2, fh: 0.75, ri: 0.06, slot: 'glass', ph: 0.63 } },
      detail(D) {
        // slim lamps let into the steep facet of the nose, small intakes in the bumper
        D.lamp('head', 'front', [[0.3, 0.522], [0.68, 0.526], [0.68, 0.572], [0.3, 0.58]], { graze: 0.3, grow: 0.012 });
        D.decal('trim', 'front', [[-0.38, 0.215], [0.38, 0.215], [0.34, 0.29], [-0.34, 0.29]], MID);
        D.decal('trim', 'front', [[0.26, 0.335], [0.42, 0.335], [0.42, 0.385], [0.26, 0.385]]);
        // dark tail panel with the lamps at its ends, pipes below
        D.decal('trim', 'rear', rect(-0.69, 0.6, 0.69, 0.79), MID);
        D.decal('tail', 'rear', rect(0.26, 0.625, 0.66, 0.765), { on: 'trim' });
        D.tip(0.5, 0.3, -2.185, 0.05, true);
        // the wing: a blade across the tail on two short feet
        D.hexa('paint', D.box([0, 0.972, -2.02], [1.5, 0.03, 0.2], (p, ix, iy, iz) => { if (!iz) p[1] += 0.02; else p[0] *= 0.97; }));
        D.hexa('paint', D.box([0.7, 0.925, -2.02], [0.08, 0.09, 0.16], (p, ix, iy, iz) => { if (!iz && iy) p[1] += 0.02; if (!iy) p[2] += iz ? 0.03 : -0.01; }), true, [2]);
        // T-top glass either side of a painted centre bar, and the hoop behind the doors
        D.decal('glass', 'top', rect(0.07, -0.55, 0.5, -0.03));
        D.pillar('paint', -0.5, -0.62);
        D.line('trim', 'side', [[0.66, 0.785], [0.66, 0.2]], 0.012);
        D.line('trim', 'side', [[-0.56, 0.84], [-0.6, 0.5], [-0.5, 0.2]], 0.012);
        D.handle(-0.36, 0.7); D.flap(-1.5, 0.66, 0.12);
        D.decal('red', 'side', rect(-1.9, 0.5, -1.74, 0.54));
        D.mirrors(0.52, 'paint', 0.95);
      },
    },
    {
      id: 'wagon', name: 'sport wagon', span: 1.97, paint: '#a6a9ad', pm: { rough: 0.3, metal: 0.4, env: 1 }, metal: '#f2f3f5', mm: { rough: 0.25, metal: 0.12, env: 1.3 },
      R: 0.322, rim: 0.258, tw: 0.24, ax: [1.335, -1.335], archGap: 0.035, archLift: -0.02, flare: 0.012, archBand: 0.03, wheelIn: 0.008, tuck: 0.05, shIn: 0.04, tum: 0.4, pw: 0.06, drop: 0.035, rail: 0.03,
      top: [[2.165, 0.44], [2.15, 0.59], [1.95, 0.7], [1.3, 0.825], [0.95, 0.865], [0.25, 1.345], [-0.3, 1.4], [-1.2, 1.385], [-1.72, 1.335], [-2.13, 1.02], [-2.19, 0.62], [-2.235, 0.57]],
      belt: [[2.165, 0.43], [2.15, 0.57], [1.95, 0.675], [1.3, 0.795], [0.95, 0.84], [-0.3, 0.9], [-1.2, 0.965], [-2.13, 1.0], [-2.19, 0.61], [-2.235, 0.56]],
      bot: [[2.165, 0.22], [1.95, 0.13], [-1.72, 0.13], [-2.235, 0.26]],
      plan: [[2.165, 0.6], [2.15, 0.66], [1.95, 0.83], [1.3, 0.86], [-1.72, 0.86], [-2.13, 0.8], [-2.19, 0.74], [-2.235, 0.66]],
      cab: { cowl: 0.95, aTop: 0.25, roofRear: -1.72, base: -2.13 }, extra: [-1.52], sideGlass: [0.95, -1.52], waistF: 0.6, beltSlot: 'trim',
      wheel: { lipW: 0.03, spoke: { n: 9, vee: Math.PI / 9, f: 0.16, fh: 0.5, ri: 0.045 } },
      detail(D) {
        // twin lamps under one cover, small grille with a bright surround
        D.lamp('head', 'front', [[0.4, 0.5], [0.82, 0.52], [0.82, 0.585], [0.4, 0.578]]);
        D.decal('head', 'side', [[2.17, 0.52], [2.17, 0.58], [1.98, 0.615], [2.03, 0.57]]);
        D.line('trim', 'front', [[0.6, 0.49], [0.6, 0.6]], 0.016, { on: 'head' });
        const gr = [[-0.31, 0.49], [0.31, 0.49], [0.34, 0.575], [-0.34, 0.575]];
        D.decal('trim', 'front', gr, MID);
        D.line('metal', 'front', loop(gr), 0.044, MID2);
        D.decal('trim', 'front', [[-0.5, 0.25], [0.5, 0.25], [0.46, 0.35], [-0.46, 0.35]], MID);
        // clear lamp housings with round red lamps, and a second pair on the tailgate
        D.decal('trim', 'rear', [[0.38, 0.69], [0.86, 0.715], [0.86, 0.93], [0.4, 0.93]]);
        D.decal('trim', 'side', [[-2.21, 0.705], [-2.21, 0.93], [-1.97, 0.93], [-2.05, 0.78]]);
        D.decal('metal', 'rear', [[0.415, 0.725], [0.86, 0.748], [0.86, 0.9], [0.435, 0.9]], { on: 'trim' });
        D.decal('metal', 'side', [[-2.21, 0.74], [-2.21, 0.9], [-2.01, 0.9], [-2.07, 0.805]], { on: 'trim' });
        D.disc('trim', 'rear', 0.61, 0.812, 0.08, 0.08, 8, { on: 'metal' });
        D.disc('tail', 'rear', 0.61, 0.812, 0.058, 0.058, 8, { on: 'trim' });
        D.disc('tail', 'rear', 0.29, 0.8, 0.05, 0.05, 8);
        D.decal('metal', 'rear', rect(-0.165, 0.655, 0.165, 0.76), MID);
        D.decal('trim', 'rear', rect(-0.6, 0.3, 0.6, 0.36), MID);
        D.tip(0.56, 0.24, -2.25, 0.048, false);
        // long roof ending in a spoiler: flush with the roof, turned down over the top of the hatch glass
        D.hexa('paint', [[0, 1.312, -1.89], [0.62, 1.28, -1.89], [0, 1.368, -1.865], [0.62, 1.333, -1.865], [0, 1.32, -1.56], [0.6, 1.285, -1.56], [0, 1.368, -1.56], [0.6, 1.333, -1.56]], true, [0]);
        // lowered: a skirt between the arches
        D.hexa('paint', [[0.77, 0.085, -0.95], [0.832, 0.085, -0.95], [0.77, 0.18, -0.95], [0.826, 0.155, -0.95], [0.77, 0.085, 0.95], [0.832, 0.085, 0.95], [0.77, 0.18, 0.95], [0.826, 0.155, 0.95]], true);
        D.pillar('trim', -0.06, -0.14); D.pillar('trim', -1.0, -1.07);
        // the third window: its lower edge kicks up into a thick body-colour pillar
        { const g = D.gy(-1.52), g0 = D.gy(-1.2);
          D.decal('paint', 'side', [[-1.2, g0[0] - 0.02], [-1.54, g[0] - 0.02], [-1.54, g[0] + 0.1], [-1.36, g[0] + 0.02]], GL);
          D.decal('paint', 'side', [[-1.36, g[0] + 0.02], [-1.54, g[0] + 0.1], [-1.54, g[1] + 0.03], [-1.49, g[1] + 0.03]], GL); }
        D.line('trim', 'side', [[0.74, 0.8], [0.74, 0.2]], 0.012);
        D.line('trim', 'side', [[-0.1, 0.89], [-0.1, 0.2]], 0.012);
        D.line('trim', 'side', [[-1.06, 0.94], [-1.05, 0.62]], 0.012);
        D.handle(0.04, 0.8); D.handle(-0.9, 0.85); D.flap(-1.72, 0.74);
        D.mirrors(0.76, 'paint');
      },
    },
    {
      id: 'suv', name: 'big SUV', span: 2.16, paint: '#16181c', pm: { rough: 0.22, metal: 0.15, env: 0.9 },
      R: 0.385, rim: 0.312, tw: 0.28, ax: [1.4275, -1.4275], archGap: 0.06, flare: 0.02, archBand: 0.028, wheelIn: 0.02, tuck: 0.07, shIn: 0.065, tum: 0.36, pw: 0.085, drop: 0.06, rail: 0.035,
      top: [[2.37, 0.56], [2.355, 0.74], [2.31, 0.9], [2.22, 0.98], [1.95, 1.05], [1.12, 1.15], [0.45, 1.64], [-0.25, 1.715], [-1.0, 1.722], [-1.72, 1.665], [-2.2, 1.21], [-2.33, 1.0], [-2.375, 0.78], [-2.39, 0.7]],
      belt: [[2.37, 0.55], [2.355, 0.72], [2.31, 0.86], [2.22, 0.925], [1.95, 0.99], [1.12, 1.09], [-1.72, 1.13], [-2.2, 1.17], [-2.33, 0.98], [-2.375, 0.77], [-2.39, 0.69]],
      bot: [[2.37, 0.4], [2.31, 0.3], [2.22, 0.27], [1.95, 0.25], [-1.72, 0.25], [-2.2, 0.32], [-2.33, 0.4], [-2.39, 0.5]],
      plan: [[2.37, 0.66], [2.355, 0.76], [2.31, 0.86], [2.22, 0.92], [1.95, 0.955], [1.12, 0.965], [-1.72, 0.965], [-2.2, 0.92], [-2.33, 0.85], [-2.375, 0.77], [-2.39, 0.7]],
      cab: { cowl: 1.12, aTop: 0.45, roofRear: -1.72, base: -2.2 }, extra: [-1.5], sideGlass: [1.12, -1.5], waistF: 0.5, beltSlot: 'metal', chin: [2.21, -2.19],
      inK: [[2.37, 1.6], [1.12, 1.3], [-2.2, 1.1], [-2.39, 1.6]],
      wheel: { lipW: 0.028, spoke: { n: 10, f: 0.24, fh: 0.5, ri: 0.06 } },
      detail(D) {
        // grille: dark field, bright surround and bars; tall twin-lens lamps level with it, wrapped round the corners
        const gr = [[-0.46, 0.75], [0.46, 0.75], [0.44, 0.89], [-0.44, 0.89]];
        D.decal('trim', 'front', gr, MID);
        D.line('metal', 'front', loop(gr), 0.06, MID2);
        for (const y of [0.798, 0.842]) D.line('metal', 'front', [[-0.46, y], [0.46, y]], 0.02, MID2);
        D.decal('head', 'front', [[0.5, 0.762], [0.78, 0.775], [0.86, 0.82], [0.86, 0.895], [0.5, 0.895]]);
        D.decal('head', 'side', [[2.365, 0.79], [2.365, 0.895], [2.15, 0.9], [2.22, 0.835]]);
        D.line('trim', 'front', [[0.665, 0.74], [0.665, 0.91]], 0.022, { on: 'head' });
        const lo = rect(-0.52, 0.44, 0.52, 0.61);
        D.decal('trim', 'front', lo, MID);
        D.line('metal', 'front', loop(lo), 0.06, MID2);
        D.decal('trim', 'front', [[0.6, 0.45], [0.8, 0.47], [0.8, 0.58], [0.6, 0.58]]);
        // tail
        D.decal('tail', 'rear', [[0.5, 0.9], [0.93, 0.9], [0.93, 1.13], [0.5, 1.11]]);
        D.decal('tail', 'side', [[-2.4, 0.9], [-2.4, 1.13], [-2.12, 1.14], [-2.22, 0.94]]);
        D.decal('metal', 'rear', rect(-0.17, 0.87, 0.17, 0.98), MID);
        D.decal('trim', 'rear', rect(-0.72, 0.52, 0.72, 0.62), MID);
        D.tip(0.52, 0.47, -2.42, 0.05, true); D.tip(0.645, 0.47, -2.42, 0.05, true);
        // chrome sill strip
        D.line('metal', 'side', [[0.95, 0.4], [-0.95, 0.4]], 0.045);
        D.pillar('trim', -0.05, -0.15); D.pillar('trim', -1.08, -1.16);
        // fast D-pillar: the rear edge of the last window leans forward
        { const g = D.gy(-1.5); D.decal('paint', 'side', [[-1.52, g[0] - 0.03], [-1.52, g[1] + 0.03], [-1.24, g[1] + 0.03]], GL); }
        D.line('trim', 'side', [[0.84, 1.06], [0.84, 0.32]], 0.014);
        D.line('trim', 'side', [[-0.1, 1.09], [-0.1, 0.32]], 0.014);
        D.line('trim', 'side', [[-1.16, 1.11], [-1.08, 0.76]], 0.014);
        D.handle(0.03, 1.0, 0.15, 'metal'); D.handle(-0.97, 1.02, 0.15, 'metal');
        D.mirrors(0.92, 'paint', 1.15);
      },
    },
    sedan('sedan_blue', 'sport sedan (navy)', '#10205c'),
    sedan('sedan_red', 'sport sedan (red)', '#c81414'),
    {
      id: 'svx', name: 'glass-canopy grand tourer', span: 1.93, paint: '#b9bcbf', pm: { rough: 0.3, metal: 0.35, env: 1 }, alias: { metal: 'paint' }, clad: '#4b4f54',
      R: 0.315, rim: 0.22, tw: 0.23, ax: [1.305, -1.305], archGap: 0.055, flare: 0.01, wheelIn: 0.025, tuck: 0.06, shIn: 0.06, tum: 0.5, pw: 0.06, drop: 0.04, rail: 0.03,
      top: [[2.28, 0.4], [2.265, 0.5], [2.2, 0.565], [1.95, 0.64], [1.4, 0.745], [1.08, 0.8], [0.22, 1.255], [-0.2, 1.3], [-0.75, 1.265], [-1.75, 0.975], [-2.2, 0.965], [-2.32, 0.93], [-2.345, 0.58]],
      belt: [[2.28, 0.39], [2.265, 0.48], [2.2, 0.535], [1.95, 0.6], [1.4, 0.7], [1.08, 0.755], [0.22, 0.81], [-0.75, 0.86], [-1.75, 0.915], [-2.2, 0.93], [-2.32, 0.905], [-2.345, 0.57]],
      bot: [[2.28, 0.27], [2.2, 0.16], [-1.75, 0.15], [-2.345, 0.3]],
      plan: [[2.28, 0.56], [2.265, 0.65], [2.2, 0.76], [1.95, 0.85], [1.4, 0.885], [-1.75, 0.885], [-2.2, 0.84], [-2.32, 0.74], [-2.345, 0.66]],
      waist: [[2.28, 0.37], [2.2, 0.385], [-2.2, 0.4], [-2.345, 0.39]],
      cab: { cowl: 1.08, aTop: 0.22, roofRear: -0.75, base: -1.75 }, sideGlass: [1.08, -1.75], aPillar: 'glass', railSlot: 'glass', roof: 'trim', cPillar: 'glass', chin: [2.19, -9],
      ledge: [[1.08, 0.035], [-0.75, 0.06]], inK: [[2.28, 1.5], [1.08, 1.3], [-1.75, 1.5], [-2.345, 1]],
      wheel: { seg: 14, lipW: 0.02, spoke: { n: 5, f: 0.42, fh: 0.9, ri: 0.07, tw: 0.3 } },
      detail(D) {
        // slim lamps on the steep facet of a smooth round nose, a thin slot between them
        D.lamp('head', 'front', [[0.29, 0.503], [0.74, 0.508], [0.74, 0.55], [0.29, 0.556]], { grow: 0.01, graze: 0.3 });
        D.decal('head', 'side', [[2.27, 0.5], [2.27, 0.548], [2.04, 0.585], [2.1, 0.55]]);
        D.decal('trim', 'front', rect(-0.25, 0.508, 0.25, 0.548), MID);
        D.decal('trim', 'front', rect(-0.46, 0.195, 0.46, 0.26), MID);
        // one red band right across the tail, round the corners too, dark in the middle
        D.decal('tail', 'rear', rect(-0.87, 0.74, 0.87, 0.87), MID);
        D.decal('tail', 'side', [[-2.36, 0.74], [-2.36, 0.87], [-2.14, 0.86], [-2.2, 0.78]]);
        D.decal('trim', 'rear', rect(-0.21, 0.752, 0.21, 0.858), { sym: false, on: 'tail' });
        D.tip(0.52, 0.275, -2.385, 0.048, true);
        // low spoiler growing out of the black canopy, and a body-colour core inside the canopy so the car's shadow has a cabin
        D.hexa('trim', [[-0.72, 0.93, -2.3], [0.72, 0.93, -2.3], [-0.71, 1.03, -2.29], [0.71, 1.03, -2.29], [-0.7, 0.94, -1.77], [0.7, 0.94, -1.77], [-0.7, 0.986, -1.77], [0.7, 0.986, -1.77]], false, [2]);
        D.hexa('paint', [[-0.6, 0.8, -1.55], [0.6, 0.8, -1.55], [-0.42, 1.2, -0.75], [0.42, 1.2, -0.75], [-0.6, 0.8, 0.9], [0.6, 0.8, 0.9], [-0.42, 1.2, 0.15], [0.42, 1.2, 0.15]]);
        D.hexa('paint', D.box([0, 0.28, 0], [1.6, 0.2, 1.8]));      // the same for the sill: a keel hidden inside the cladding
        // the window-within-a-window: a smaller opening pane set into each side glass
        const gl = (z, f) => { const g = D.gy(z); return g[0] + (g[1] - g[0]) * f; };
        D.line('clad', 'side', [[0.72, gl(0.72, 0.08)], [0.3, gl(0.3, 0.62)], [-0.52, gl(-0.52, 0.62)], [-0.6, gl(-0.6, 0.08)], [0.22, gl(0.22, 0.08)], [0.72, gl(0.72, 0.08)]], 0.03, GL);
        D.line('clad', 'side', [[-0.7, gl(-0.7, -0.05)], [-0.76, gl(-0.76, 0.62)], [-1.2, gl(-1.2, 0.7)], [-1.5, gl(-1.5, 0)]], 0.03, GL);
        D.pillar('clad', -0.63, -0.67);
        D.line('trim', 'side', [[0.78, 0.74], [0.78, 0.22]], 0.012);
        D.line('trim', 'side', [[-0.65, 0.835], [-0.66, 0.22]], 0.012);
        D.handle(-0.5, 0.73);
        D.mirrors(0.84, 'paint', 0.95);
      },
    },
    {
      id: 'mu', name: 'short three-door 4x4', span: 2.02, paint: '#868b91', pm: { rough: 0.34, metal: 0.3, env: 0.9 }, alias: { metal: 'paint' }, clad: '#3b3e43',
      R: 0.365, rim: 0.215, tw: 0.25, ax: [1.165, -1.165], archGap: 0.075, flare: 0.035, archBand: 0.06, wheelIn: 0.03, tuck: 0.05, shIn: 0.03, tum: 0.2, pw: 0.06, drop: 0.035, rail: 0.03,
      top: [[1.845, 0.975], [1.8, 1.03], [1.68, 1.055], [0.8, 1.11], [0.52, 1.645], [-0.28, 1.665], [-0.3, 1.695], [-1.72, 1.685], [-1.9, 1.12], [-1.94, 1.08], [-1.965, 0.61]],
      belt: [[1.845, 0.95], [1.8, 1.0], [1.68, 1.025], [0.8, 1.075], [-1.72, 1.09], [-1.9, 1.1], [-1.94, 1.07], [-1.965, 0.6]],
      bot: [[1.845, 0.5], [1.605, 0.36], [-1.605, 0.33], [-1.9, 0.42], [-1.965, 0.46]],
      plan: [[1.845, 0.8], [1.8, 0.835], [1.68, 0.85], [-1.72, 0.85], [-1.9, 0.83], [-1.94, 0.78], [-1.965, 0.75]],
      waist: [[1.845, 0.66], [-1.965, 0.66]],
      nose: 0.07, spare: 0.24, cab: { cowl: 0.8, aTop: 0.52, roofRear: -1.72, base: -1.9 }, extra: [-1.62], sideGlass: [0.8, -1.62], beltSlot: 'trim', rearTop: [-0.29, 'clad'],
      wheel: { seg: 14, lipW: 0.03, spoke: { n: 5, f: 0.36, fh: 0.86, ri: 0.085 } },
      detail(D) {
        // face: dark mask right across, body-colour grille surround, rectangular lamps with a corner lamp outboard
        D.decal('trim', 'front', rect(-0.75, 0.795, 0.75, 0.945), MID);
        D.decal('paint', 'front', [[-0.43, 0.795], [0.43, 0.795], [0.4, 0.945], [-0.4, 0.945]], MID2);
        D.decal('trim', 'front', [[-0.385, 0.822], [0.385, 0.822], [0.36, 0.918], [-0.36, 0.918]], { sym: false, on: 'paint' });
        D.decal('head', 'front', rect(0.47, 0.82, 0.635, 0.92), { on: 'trim' });
        D.decal('head', 'front', rect(0.665, 0.832, 0.74, 0.908), { on: 'trim' });
        // bumpers: solid bars standing proud, wrapped round the corners, with two recesses in the front one
        D.hexa('clad', D.box([0, 0.655, 1.81], [1.74, 0.2, 0.19], (p, ix, iy, iz) => { if (iz) { p[0] *= 0.93; if (!iy) p[2] -= 0.035; } }));
        D.hexa('trim', D.box([0.56, 0.66, 1.9], [0.2, 0.07, 0.03]), true, [4]);
        D.hexa('clad', D.box([0, 0.63, -1.925], [1.74, 0.18, 0.19], (p, ix, iy, iz) => { if (!iz) { p[0] *= 0.93; if (!iy) p[2] += 0.035; } }));
        D.lamp('tail', 'rear', rect(0.55, 0.8, 0.7, 1.03), { grow: 0.022 });
        // spare wheel on the tailgate, set to one side
        D.wheelAt([0.13, 1.0, D.zR - 0.24], [0, 0, -1], [1, 0, 0], [0, 1, 0], { R: 0.36, rim: 0.215, w: 0.24, lipW: 0.03, spoke: { n: 5, f: 0.36, fh: 0.86, ri: 0.085 } });
        // the hoop behind the doors, then the separate rear top
        D.pillar('paint', -0.12, -0.29);
        D.pillar('trim', -0.29, -0.325);
        D.hexa('paint', D.box([0, 0.5, 0], [1.56, 0.3, 1.36]));     // hidden inside the cladding, so the shadow has a sill
        D.line('trim', 'side', [[0.6, 1.05], [0.6, 0.4]], 0.014);
        D.line('trim', 'side', [[-0.2, 1.06], [-0.2, 0.4]], 0.014);
        D.line('clad', 'side', [[0.56, 0.85], [-0.16, 0.85]], 0.04);
        D.handle(-0.06, 0.97);
        D.mirrors(0.62, 'trim', 1.1);
      },
    },
  ];
  SPECS.forEach((S) => {
    S.front = +(S.top[0][0] + (S.nose || 0)).toFixed(3); S.rear = +(S.top[S.top.length - 1][0] - (S.spare || 0)).toFixed(3);
    S.len = +(S.front - S.rear).toFixed(3);
    S.wid = +(2 * Math.max(...S.plan.map((p) => p[1]))).toFixed(3);                // body width, mirrors and arch lips not counted
    S.hgt = +Math.max(...S.top.map((p) => p[1])).toFixed(3);
  });

  const built = {}, mats = new Map();
  const ORDER = ['paint', 'clad', 'glass', 'trim', 'metal', 'red', 'head', 'tail'];
  function geometry(S) {
    const key = S.geo || S.id;
    if (!built[key]) {
      const B = (built[key] = build(S));
      if (B.miss && typeof console !== 'undefined') console.warn('SW.Cars: ' + B.miss + ' detail(s) of ' + key + ' missed the body');
      SPECS.forEach((T, i) => { if ((T.geo || T.id) === key) SW.Cars.models[i].tris = B.tris; });
    }
    return built[key];
  }
  function materials(E, S) {
    let per = mats.get(E); if (!per) mats.set(E, (per = {}));
    return per[S.id] || (per[S.id] = {
      paint: E.gloss(S.paint, S.pm),
      glass: E.gloss('#0c1116', { rough: 0.07, metal: 0.55, env: 1.4 }),
      metal: S.alias && S.alias.metal ? null : E.gloss(S.metal || '#dadde0', S.mm || { rough: 0.2, metal: 0.5, env: 1.2 }),
    });
  }

  SW.Cars = {
    // len/wid/hgt describe the body; `span` is the full width across the door mirrors (use it where mirrors must not touch).
    models: SPECS.map((S) => ({ id: S.id, name: S.name, len: S.len, wid: S.wid, hgt: S.hgt, span: S.span, wheelbase: S.ax[0] - S.ax[1], front: S.front, rear: S.rear, wheelR: S.R })),
    make(E, i) {
      const S = SPECS[((i | 0) % SPECS.length + SPECS.length) % SPECS.length];
      const B = geometry(S), M = materials(E, S);
      const head = E.basic('#fff2d2'), tail = E.basic('#e01318');
      const slot = { paint: M.paint, glass: M.glass, metal: M.metal, head, tail };
      const g = new THREE.Group(); g.name = 'car:' + S.id;
      for (const k of ORDER) {
        if (!B.geo[k]) continue;
        const m = slot[k] || (k === 'trim' ? E.mat('#121316', { rough: 0.8 }) : k === 'clad' ? E.mat(S.clad, { rough: 0.6 }) : E.mat('#c01a1a', { rough: 0.45 }));
        const mesh = new THREE.Mesh(B.geo[k], m); mesh.name = k; mesh.castShadow = k === 'paint'; mesh.receiveShadow = true; g.add(mesh);
      }
      g.userData = { len: S.len, wid: S.wid, hgt: S.hgt, head, tail };
      return g;
    },
  };
  // Geometry is built once per model, on first use; warm the cache a model at a time after load so the first make() in play never hitches.
  if (typeof setTimeout === 'function') {
    let k = 0;
    const warm = () => { if (k >= SPECS.length) return; try { if (typeof THREE !== 'undefined') geometry(SPECS[k]); } catch (e) { k = SPECS.length; return; } k++; setTimeout(warm, 40); };
    setTimeout(warm, 250);
  }
})();
