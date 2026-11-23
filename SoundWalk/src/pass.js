/*
 * The mountain south of NO JOBB's palace, and the pass road over its shoulder.
 *
 * A range rises behind the palace: a summit over the expressway (the ring road runs through it in a tunnel, and so does
 * the inner ramp outside it), a west peak, and a knoll between. The street that runs under the viaduct from FLIP's
 * roundabout (places.js: FLIP's south branch) carries on under the deck past FIELD's back and across FIELD's street,
 * then leaves the viaduct and climbs as a mountain road along the range's north foot, round a hairpin on the west peak
 * (the pass: はなび峠) and down to the open loggia at the back of the palace.
 *
 *   SW.Pass.make(ring, places) -> the mountain's heights, the road's line, the tunnels; ground(x, z, y) for the game
 *   SW.Pass.build(M, E, w)     -> the meshes; w: { scene, circles, pick }. Returns { map(g, toMap, S) }
 *
 * The heights are a grid (1 m) over the range. Near an elevated road the mountain either keeps under its deck (4.5 m
 * below it, rising 1.6 m per metre out from the edge, as the rock does north of the plaza) or, where it stands high
 * over it, covers it: there the road runs in a tunnel, a concrete tube with portals, and the ground over it is kept at
 * least LIFT above the deck. Along the pass road the mountain is cut and filled to the road's own level.
 */
(function () {
  'use strict';
  const SW = (window.SW = window.SW || {});
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const X0 = -36, X1 = 78, Z0 = 66, Z1 = 142, D = 1;
  // [x, z, height, radius]: the summit over the ring road (drawn out along it), the outer flank over the ramp outside it,
  // the west peak the road turns round, the knoll between the road's two legs, and low ground tying them together
  const BLOBS = [[33, 120, 26, 18], [22, 122, 14, 11], [44, 113, 16, 12], [30, 134, 18, 14], [12, 132, 12, 11], [52, 108, 8, 9], [-20, 92, 26, 11], [-6, 104, 12, 9], [12, 92, 13, 7], [1, 93, 10, 8], [20, 107, 16, 10], [-26, 82, 12, 9], [-2, 82, 7, 7]];
  const LIFT = 9.5, TUN = 8, CAP = 4.5, TW = 0.9, TH = 7.4;   // TW: the tube's clearance past the deck's edge; TH: its height over the deck
  // the pass road, from where it leaves the viaduct to the palace's loggia: [x, z, y]
  const CTL = [[56.5, 98.4, 0.35], [49, 98.6, 1.2], [41, 99.4, 2.5], [33, 100.2, 3.9], [25, 100.4, 5.3], [17, 100, 6.7], [9.5, 99.1, 8.1], [3, 97.7, 9.3], [-2.2, 96.4, 10.1], [-6.2, 94.2, 10.6], [-8, 91, 10.8],
    [-6.6, 87.6, 10.6], [-2.6, 85.4, 10.2], [6, 84.2, 9.3], [14, 83.4, 8.3], [20.5, 81.6, 7.4], [23.2, 78.4, 6.6], [21.4, 75.4, 5.9], [17, 73.6, 5.3], [13, 72.6, 5.05]];
  const PASS_AT = 10;   // CTL index of the pass (the hairpin's apex)

  function make(ring, places) {
    const find = (k) => places.find((p) => p.song.scene === k);
    const flip = find('flip'), flash = find('flash'), field = find('field');
    const R0 = ring && ring.roads && ring.roads[0];
    if (!R0 || !R0.X || !flip || !flip.vd || !flash) return null;
    const br = flip.vd.branches.find((b) => b.dir === 1); if (!br || !br.length) return null;
    const nx = Math.round((X1 - X0) / D) + 1, nz = Math.round((Z1 - Z0) / D) + 1;

    // ---- the raw range: blobs, kept off NO JOBB's hill, FIELD's ground and the land's edge ----
    const DIRS = [[0, 0, 0]]; for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; DIRS.push([Math.cos(a) * 3, Math.sin(a) * 3, 0.25], [Math.cos(a) * 7, Math.sin(a) * 7, 0.75]); }
    const fieldHit = (x, z) => { if (!field || !field.core) return 1; let hit = 1; for (const [ox, oz, k] of DIRS) { const l = field.local(x + ox, z + oz); if (field.core(l.x, l.z)) { hit = Math.min(hit, k); if (!hit) break; } } return hit; };
    const raw = (x, z) => {
      let H = 0; for (const [bx, bz, bh, br2] of BLOBS) { const q = ((x - bx) ** 2 + (z - bz) ** 2) / (br2 * br2); if (q < 9) H += bh * Math.exp(-q * 1.6); }
      if (H < 0.02) return 0;
      H *= (1 + 0.08 * Math.sin(x * 0.23 + z * 0.07) * Math.cos(z * 0.19 - x * 0.06)) * sm(17, 25, Math.hypot(x - flash.x, z - flash.z)) * sm(141, 126, z);
      return H > 0.02 ? H * fieldHit(x, z) : 0;
    };

    // ---- the elevated roads through it: a tunnel where the range stands TUN over the deck for long enough ----
    const els = [];
    for (const r of ring.roads) {
      if (!r.X || r.ground) continue;
      const S = []; for (let i = 0; i < r.N; i++) { const x = r.X[i], z = r.Z[i]; if (x < X0 - 24 || x > X1 + 24 || z < Z0 - 24 || z > Z1 + 24) continue; S.push({ i, x, z, y: r.Y[i], hw: r.HW[i], t: false }); }
      if (!S.length) continue;
      S.forEach((s) => { s.t = raw(s.x, s.z) >= s.y + TUN; });
      if (r !== R0 && els.length) { const rs = els[0].S; S.forEach((s) => { let b = 1e9, t = s.t; for (const q of rs) { const d = Math.hypot(q.x - s.x, q.z - s.z); if (d < b) { b = d; t = q.t; } } if (b < 22) s.t = t; }); }   // (the ring road first: those alongside it share its portals)
      // runs: drop the short ones, fill short gaps
      const runs = []; let a = -1;
      for (let k = 0; k < S.length; k++) {
        const on = S[k].t && (a < 0 || S[k].i - S[k - 1].i === 1);
        if (on) { if (a < 0) a = k; } else { if (a >= 0) runs.push([a, k - 1]); a = S[k].t ? k : -1; }
      }
      if (a >= 0) runs.push([a, S.length - 1]);
      S.forEach((s) => { s.t = false; });
      const spans = [];
      for (let [p, q] of runs) if (q - p >= 7) {   // then out each way while the mountain still stands over the deck, so the portals sit at its foot, not in a cliff
        if (r === R0) { while (p > 0 && S[p - 1].i === S[p].i - 1 && raw(S[p - 1].x, S[p - 1].z) >= S[p - 1].y + 4.5) p--; while (q < S.length - 1 && S[q + 1].i === S[q].i + 1 && raw(S[q + 1].x, S[q + 1].z) >= S[q + 1].y + 4.5) q++; }
        for (let k = p; k <= q; k++) S[k].t = true; spans.push([p, q]);
      }
      S.forEach((s, k) => { const a2 = S[k - 1], b2 = S[k + 1]; s.tx = (b2 || s).x - (a2 || s).x; s.tz = (b2 || s).z - (a2 || s).z; const l = Math.hypot(s.tx, s.tz) || 1; s.tx /= l; s.tz /= l; });
      els.push({ r, S, spans });
    }
    const allS = els.flatMap((e) => e.S);

    // ---- the road's line: under the deck from the end of FLIP's street, then the pass road ----
    const N = R0.N, W = (i) => ((i % N) + N) % N;
    const inner = (i) => { const j = W(i), a = W(i - 1), b = W(i + 1); let tx = R0.X[b] - R0.X[a], tz = R0.Z[b] - R0.Z[a]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l; let nX = -tz, nZ = tx; if (nX * -R0.X[j] + nZ * -R0.Z[j] < 0) { nX = -nX; nZ = -nZ; } return { x: R0.X[j], z: R0.Z[j], nx: nX, nz: nZ }; };
    const C = flip.vd.C, iE = br[br.length - 1].i, ctl = [];
    let k = -3; for (; k < 60; k++) { const q = inner(iE + k), x = q.x + q.nx * C, z = q.z + q.nz * C; if (x < CTL[0][0] + 6) break; if (k % 2 === 0 || k === -3) ctl.push(new THREE.Vector3(x, 0.03, z)); }
    const nUnder = ctl.length;
    for (const [x, z, y] of CTL) ctl.push(new THREE.Vector3(x, y, z));
    const curve = new THREE.CatmullRomCurve3(ctl, false, 'centripetal'), L = curve.getLength(), n = Math.round(L / 1);
    const P = curve.getSpacedPoints(n).map((v) => ({ x: v.x, y: Math.max(0.03, v.y), z: v.z }));
    // where the pass road begins (the first CTL point) and the pass itself, by nearest point
    const nearK = (x, z) => { let b = 1e9, kk = 0; P.forEach((q, i) => { const d = Math.hypot(q.x - x, q.z - z); if (d < b) { b = d; kk = i; } }); return kk; };
    const kPass0 = nearK(CTL[0][0], CTL[0][1]), kTop = nearK(CTL[PASS_AT][0], CTL[PASS_AT][1]);
    P.forEach((q, i) => {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)]; let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; q.tx = tx / l; q.tz = tz / l; q.nx = -q.tz; q.nz = q.tx;
      q.hw = i < kPass0 - 12 ? flip.vd.RW : i < kPass0 ? flip.vd.RW + (2.9 - flip.vd.RW) * sm(kPass0 - 12, kPass0, i) : 2.9;
      q.under = i < kPass0;
    });
    // a coarse grid of the road's segments, for the nearest point
    const G = 6, cells = new Map(), gx = 1000, gx0 = -400, gz0 = -400;
    for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i]; for (let j = Math.floor((Math.min(a.z, b.z) - 9 - gz0) / G); j <= Math.floor((Math.max(a.z, b.z) + 9 - gz0) / G); j++) for (let ii = Math.floor((Math.min(a.x, b.x) - 9 - gx0) / G); ii <= Math.floor((Math.max(a.x, b.x) + 9 - gx0) / G); ii++) { const key = j * gx + ii; if (!cells.has(key)) cells.set(key, []); cells.get(key).push(i); } }
    const Q = { d: 0, y: 0, o: 0, k: 0, hw: 3 };
    const roadQ = (x, z) => {
      const list = cells.get(Math.floor((z - gz0) / G) * gx + Math.floor((x - gx0) / G)); if (!list) return null;
      let best = 1e9;
      for (const i of list) { const a = P[i - 1], b = P[i], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2)), px = a.x + dx * t, pz = a.z + dz * t, d = Math.hypot(x - px, z - pz);
        if (d < best) { best = d; Q.d = d; Q.y = a.y + (b.y - a.y) * t; Q.k = i; Q.hw = a.hw; Q.o = (x - px) * a.nx + (z - pz) * a.nz; } }
      return best < 1e9 ? Q : null;
    };

    // ---- the heights ----
    const h = new Float32Array(nx * nz), tun = new Float32Array(nx * nz).fill(NaN);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = X0 + i * D, z = Z0 + j * D;
      let H = raw(x, z), cap = 1e9, lift = 0, td = 1e9;
      for (const s of allS) {
        const dx = s.x - x, dz = s.z - z; if (dx > 36 || dx < -36 || dz > 36 || dz < -36) continue;
        const d = Math.hypot(dx, dz);
        if (s.t) { if (Math.abs(dx * s.tx + dz * s.tz) > 1.3) continue; if (d < s.hw + 7) lift = Math.max(lift, s.y + LIFT - Math.max(0, d - s.hw - 3) * 2.2); if (d < s.hw + TW + 0.6 && d < td) { td = d; tun[j * nx + i] = s.y; } }   // (only alongside the span: not out past its portals)
        else if (Math.abs(dx * s.tx + dz * s.tz) < 1.3 || d < s.hw + 1.5) cap = Math.min(cap, s.y - CAP + Math.max(0, d - s.hw - 1.5) * 1.6);   // (beside the deck: not on along past where it goes into the mountain)
      }
      H = Math.max(Math.min(H, Math.max(0, cap)), H > 0.3 || lift ? lift : 0);
      const q = roadQ(x, z);
      if (q && q.d < q.hw + 7) { const ry = q.y - 0.04, t = sm(q.hw + 0.7, q.hw + 6.5, q.d); H = q.k < kPass0 - 4 ? Math.min(H, ry + (H - ry) * t) : ry + (H - ry) * t; }   // (under the deck the street only cuts: it never raises the ground)
      if (lift > H && !(q && q.d < q.hw + 1.2)) H = lift;   // a tunnel stays covered even where the road cuts into the slope beside it (a rock face there)
      h[j * nx + i] = Math.max(0, H);
    }
    const at = (A, x, z) => {   // on the drawn facets (two triangles per cell, as PlaneGeometry makes them)
      const fx = (x - X0) / D, fz = (z - Z0) / D, i = Math.floor(fx), j = Math.floor(fz); if (i < 0 || j < 0 || i >= nx - 1 || j >= nz - 1) return 0;
      const u = fx - i, v = fz - j, h00 = A[j * nx + i], h10 = A[j * nx + i + 1], h01 = A[(j + 1) * nx + i], h11 = A[(j + 1) * nx + i + 1];
      return u + v <= 1 ? h00 + (h10 - h00) * u + (h01 - h00) * v : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
    };
    const tunAt = (x, z) => { const i = Math.round((x - X0) / D), j = Math.round((z - Z0) / D); if (i < 0 || j < 0 || i >= nx || j >= nz) return NaN; return tun[j * nx + i]; };
    const ground = (x, z, y) => {
      if (x < X0 || x > X1 || z < Z0 || z > Z1) return 0;
      const v = at(h, x, z); if (v <= 0) return 0;
      if (y !== undefined) { const ty = tunAt(x, z); if (ty === ty && y < ty + 5) return Math.min(v, Math.max(0, ty - CAP)); }   // down in a tunnel (or driving through one): the floor under the deck, not the mountain over it
      return v;
    };
    const clear = (x, z, m) => { const q = roadQ(x, z); return !!q && q.d < q.hw + m; };   // on (or within m of) the road
    return { X0, Z0, D, nx, nz, h, P, kPass0, kTop, nUnder, els, raw, roadQ, ground, tunAt, clear, flash };
  }

  function build(M, E, w) {
    const { X0, Z0, D, nx, nz, h, P, kPass0, kTop, els, roadQ } = M, scene = w.scene, rng = E.rng(4747);
    const grp = new THREE.Group(); grp.name = 'pass'; scene.add(grp);
    const pick = (m) => { if (w.pick) w.pick(m); };

    // ---- the mountain ----
    {
      const geo = new THREE.PlaneGeometry((nx - 1) * D, (nz - 1) * D, nx - 1, nz - 1); geo.rotateX(-Math.PI / 2);
      const pa = geo.attributes.position, col = new Float32Array(pa.count * 3), grass = new THREE.Color('#ffffff'), rock = new THREE.Color('#8c8478'), dry = new THREE.Color('#d6d2b4');
      for (let v = 0; v < pa.count; v++) {
        const x = pa.getX(v) + X0 + ((nx - 1) * D) / 2, z = pa.getZ(v) + Z0 + ((nz - 1) * D) / 2, i = Math.round((x - X0) / D), j = Math.round((z - Z0) / D), hh = h[j * nx + i];
        pa.setXYZ(v, x, hh > 0.03 ? hh : -0.4, z);
      }
      geo.computeVertexNormals();
      const nr = geo.attributes.normal;
      for (let v = 0; v < pa.count; v++) {
        const st = 1 - nr.getY(v), c = grass.clone().lerp(dry, sm(0.08, 0.25, st) * 0.5).lerp(rock, sm(0.32, 0.55, st));
        const q = roadQ(pa.getX(v), pa.getZ(v)); if (q && q.d < q.hw + 1.4 && !(q.k < kPass0)) c.lerp(new THREE.Color('#a89c86'), 0.6);   // the road's verges, worn
        col.set([c.r, c.g, c.b], v * 3);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      // drop the faces with nothing under them, and those that would hang across a tunnel's mouth (inside the tube's section)
      const ix = geo.index.array, keep = [];
      for (let t = 0; t < ix.length; t += 3) {
        let top = -1e9, low = 1e9, cx = 0, cz = 0; for (let k = 0; k < 3; k++) { const y = pa.getY(ix[t + k]); top = Math.max(top, y); low = Math.min(low, y); cx += pa.getX(ix[t + k]) / 3; cz += pa.getZ(ix[t + k]) / 3; }
        if (top < 0) continue;
        let cut = false;
        for (const e of els) { if (cut) break; for (const [a, b] of e.spans) { for (let k = Math.max(0, a - 2); k <= Math.min(e.S.length - 1, b + 2) && !cut; k++) { const s = e.S[k], dx = cx - s.x, dz = cz - s.z; if (Math.abs(dx * s.tx + dz * s.tz) < 1.2 && Math.abs(-dx * s.tz + dz * s.tx) < s.hw + TW + 0.4 && low < s.y + TH + 0.6) cut = true; } } }
        if (!cut) keep.push(ix[t], ix[t + 1], ix[t + 2]);
      }
      geo.setIndex(keep);
      const m = E.mat('#b8c4b2', { map: E.tex('grass', (nx * D) / 7, (nz * D) / 7), rough: 0.92 }, true); m.vertexColors = true;
      const mesh = new THREE.Mesh(geo, m); mesh.receiveShadow = true; mesh.name = 'mountain'; grp.add(mesh); pick(mesh);
    }

    // ---- the tunnels: a concrete tube over the deck, a portal at each end, lamps along the crown ----
    {
      const tubeM = E.mat('#8f8b84', { map: E.tex('concrete', 1, 1), rough: 0.9 }, true); tubeM.side = THREE.DoubleSide;
      const portM = E.mat('#b3aea4', { map: E.tex('concrete', 1, 1), rough: 0.85 }, true), lampM = E.basic('#ffc56a'), B = E.batch(grp), bx = B.box;
      const SEG = 14;
      for (const e of els) for (const [a, b] of e.spans) {
        const k0 = Math.max(0, a - 1), k1 = Math.min(e.S.length - 1, b + 1), pos = [], uv = [], idx = [];
        let along = 0;
        for (let k = k0; k <= k1; k++) {
          const s = e.S[k], nX = -s.tz, nZ = s.tx, Wd = s.hw + TW; if (k > k0) along += Math.hypot(s.x - e.S[k - 1].x, s.z - e.S[k - 1].z);
          for (let m = 0; m <= SEG + 2; m++) {
            let ox, oy;
            if (m === 0) { ox = Wd; oy = -1.6; } else if (m === SEG + 2) { ox = -Wd; oy = -1.6; } else { const an = ((m - 1) / SEG) * Math.PI; ox = Math.cos(an) * Wd; oy = 0.25 + Math.sin(an) * TH; }
            pos.push(s.x + nX * ox, s.y + oy, s.z + nZ * ox); uv.push(along / 4, m / 3);
          }
          if (k > k0) { const r0 = (k - k0 - 1) * (SEG + 3), r1 = (k - k0) * (SEG + 3); for (let m = 0; m < SEG + 2; m++) idx.push(r0 + m, r1 + m, r0 + m + 1, r1 + m, r1 + m + 1, r0 + m + 1); }
          if ((k - k0) % 2 === 0) for (const sd of [-1, 1]) { const an = Math.PI / 2 + sd * 0.55, ox = Math.cos(an) * Wd * 0.98, oy = 0.25 + Math.sin(an) * TH * 0.98; const l = bx(0.5, 0.12, 1.4, s.x + nX * ox, s.y + oy, s.z + nZ * ox, lampM, false); l.rotation.y = Math.atan2(s.tx, s.tz); }
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
        const tube = new THREE.Mesh(g, tubeM); tube.castShadow = true; tube.receiveShadow = true; grp.add(tube);
        // the portals: a wall square to the road with the tube's arch cut out of it, a cornice over it
        for (const [k, dir] of [[k0, -1], [k1, 1]]) {
          const s = e.S[k], Wd = s.hw + TW, PW = Wd + 0.7, PH = TH + 1.6, sh = new THREE.Shape();
          sh.moveTo(-PW, -2); sh.lineTo(-Wd, -2); sh.lineTo(-Wd, 0.25);
          for (let m = 1; m < SEG; m++) { const an = Math.PI - (m / SEG) * Math.PI; sh.lineTo(Math.cos(an) * Wd, 0.25 + Math.sin(an) * TH); }   // the arch: the tube's half-ellipse
          sh.lineTo(Wd, 0.25); sh.lineTo(Wd, -2); sh.lineTo(PW, -2); sh.lineTo(PW, PH); sh.lineTo(-PW, PH); sh.closePath();
          const pg = new THREE.ExtrudeGeometry(sh, { depth: 1.4, bevelEnabled: false }).translate(0, 0, -0.7);
          const pm = new THREE.Mesh(pg, portM); pm.position.set(s.x + s.tx * dir * 0.4, s.y, s.z + s.tz * dir * 0.4); pm.rotation.y = Math.atan2(s.tx, s.tz); pm.castShadow = pm.receiveShadow = true; grp.add(pm);
          const cn = bx(PW * 2 + 0.6, 0.5, 2.0, s.x + s.tx * dir * 0.4, s.y + PH + 0.25, s.z + s.tz * dir * 0.4, portM); cn.rotation.y = Math.atan2(s.tx, s.tz);
        }
      }
      B.flush();
    }

    // ---- the road: asphalt, its lines, lamps, guard rails on the drop side, the pass's sign ----
    {
      const asph = E.mat('#2b2830', { map: E.tex('asphalt', 1, 1), rough: 0.9 }, true); asph.polygonOffset = true; asph.polygonOffsetFactor = -2; asph.polygonOffsetUnits = -2;
      const white = E.mat('#e4e0e8', { rough: 0.6 }, true), yellow = E.mat('#e8b52a', { rough: 0.6 }, true); for (const m of [white, yellow]) { m.polygonOffset = true; m.polygonOffsetFactor = -4; m.polygonOffsetUnits = -4; }
      const ribbon = (o0, o1, lift, m, from = 0, to = P.length - 1, skip) => {
        const pos = [], uv = [], idx = []; let along = 0, rows = 0;
        for (let k = from; k <= to; k++) {
          const q = P[k]; if (k > from) along += Math.hypot(q.x - P[k - 1].x, q.z - P[k - 1].z);
          const a = typeof o0 === 'function' ? o0(q) : o0, b = typeof o1 === 'function' ? o1(q) : o1;
          pos.push(q.x + q.nx * a, q.y + lift, q.z + q.nz * a, q.x + q.nx * b, q.y + lift, q.z + q.nz * b); uv.push(a / 4, along / 4, b / 4, along / 4);
          if (rows > 0 && !(skip && skip(k))) { const r0 = (rows - 1) * 2, r1 = rows * 2; idx.push(r0, r0 + 1, r1, r0 + 1, r1 + 1, r1); }
          rows++;
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
        const ms = new THREE.Mesh(g, m); ms.receiveShadow = true; grp.add(ms); return ms;
      };
      const road = ribbon((q) => -q.hw, (q) => q.hw, 0.035, asph); pick(road);
      ribbon((q) => -q.hw + 0.2, (q) => -q.hw + 0.34, 0.04, white); ribbon((q) => q.hw - 0.34, (q) => q.hw - 0.2, 0.04, white);
      ribbon(-0.2, -0.07, 0.042, yellow, kPass0 - 2); ribbon(0.07, 0.2, 0.042, yellow, kPass0 - 2);   // the pass road: a double yellow line, no overtaking
      ribbon(-0.07, 0.07, 0.042, white, 0, kPass0 - 2, (k) => Math.floor(k / 2) % 3 !== 0);           // under the deck: a dashed white line
      const B = E.batch(grp), bx = B.box, railM = E.mat('#e6e8ea', { metal: 0.4, rough: 0.4 }), postM = E.mat('#c9ccd0', { metal: 0.5, rough: 0.5 }), lampM = E.basic('#ffb04a'), poleM = E.mat('#5a6068', { metal: 0.5, rough: 0.5 });
      // under the deck: sodium lamps hung from it over the street, as along FLIP's stretch
      for (let k = 2; k < kPass0 - 6; k += 9) { const q = P[k], y = 8.0, l = bx(1.0, 0.12, 0.32, q.x, y, q.z, lampM, false); l.rotation.y = Math.atan2(q.nx, q.nz); bx(0.05, 0.9, 0.05, q.x, y + 0.5, q.z, poleM); }
      // the guard rail: posts every 2 m and a beam, along whichever side drops away (where it does)
      for (let k = kPass0 + 2; k < P.length - 6; k += 2) {
        const q = P[k], dropL = q.y - M.ground(q.x - q.nx * (q.hw + 2.5), q.z - q.nz * (q.hw + 2.5)), dropR = q.y - M.ground(q.x + q.nx * (q.hw + 2.5), q.z + q.nz * (q.hw + 2.5));
        for (const [sd, dr] of [[-1, dropL], [1, dropR]]) {
          if (dr < 0.9) continue;
          const o = sd * (q.hw + 0.45), x = q.x + q.nx * o, z = q.z + q.nz * o, q2 = P[k + 2], x2 = q2.x + q2.nx * o, z2 = q2.z + q2.nz * o, L = Math.hypot(x2 - x, z2 - z);
          bx(0.1, 0.8, 0.1, x, q.y + 0.4, z, postM);
          const r = bx(0.06, 0.32, L + 0.05, (x + x2) / 2, (q.y + q2.y) / 2 + 0.62, (z + z2) / 2, railM); r.rotation.order = 'YXZ'; r.rotation.y = Math.atan2(x2 - x, z2 - z); r.rotation.x = -Math.atan2(q2.y - q.y, L);
          w.circles.push({ x: (x + x2) / 2, z: (z + z2) / 2, r: 0.35, y0: q.y - 1.5, y1: q.y + 3 });
        }
      }
      // lamps on the pass road: on the uphill side, every 24 m or so
      for (let k = kPass0 + 6; k < P.length - 4; k += 24) {
        const q = P[k], up = M.ground(q.x + q.nx * (q.hw + 2.5), q.z + q.nz * (q.hw + 2.5)) > M.ground(q.x - q.nx * (q.hw + 2.5), q.z - q.nz * (q.hw + 2.5)) ? 1 : -1, o = up * (q.hw + 0.9), x = q.x + q.nx * o, z = q.z + q.nz * o;
        bx(0.12, 5.2, 0.12, x, q.y + 2.6, z, poleM); const arm = bx(1.3, 0.1, 0.1, x - q.nx * up * 0.6, q.y + 5.15, z - q.nz * up * 0.6, poleM); arm.rotation.y = Math.atan2(-q.nz, q.nx);
        const l = bx(0.55, 0.14, 0.3, x - q.nx * up * 1.2, q.y + 5.05, z - q.nz * up * 1.2, lampM, false); l.rotation.y = Math.atan2(-q.nz, q.nx);
        w.circles.push({ x, z, r: 0.25, y0: q.y - 1.5, y1: q.y + 6 });
      }
      // the pass: a pull-off on the outside of the hairpin, its sign, a bench looking out west, and chevrons round the bend
      {
        const q = P[kTop], out = -1, sx = q.x + q.nx * out * (q.hw + 2.2), sz = q.z + q.nz * out * (q.hw + 2.2), gy = q.y;
        const signM = new THREE.MeshBasicMaterial({ map: E.textTex('はなび峠\nHANABI PASS', { w: 512, h: 256, color: '#ffffff', bg: '#1f55b8', font: '700 92px "Noto Sans JP","Hind",sans-serif', font2: '700 52px "Hind","Noto Sans JP",sans-serif' }), side: THREE.DoubleSide }); signM.userData.lin = true;
        const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), signM); sg.position.set(sx, gy + 2.6, sz); sg.rotation.y = Math.atan2(-q.nx * out, -q.nz * out); grp.add(sg);
        for (const u of [-0.9, 0.9]) bx(0.08, 2.4, 0.08, sx + q.tx * u, gy + 1.2, sz + q.tz * u, poleM);
        w.circles.push({ x: sx, z: sz, r: 1.1, y0: gy - 1.5, y1: gy + 4 });
        const chev = new THREE.MeshBasicMaterial({ map: E.textTex('<', { w: 128, h: 128, color: '#111111', bg: '#ffd21f', font: '900 120px "Arial Black",sans-serif' }), side: THREE.DoubleSide }); chev.userData.lin = true;
        for (const dk of [-9, -5, 5, 9]) { const c = P[Math.max(0, Math.min(P.length - 1, kTop + dk))], o = out * (c.hw + 0.6), cv = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), chev); cv.position.set(c.x + c.nx * o, c.y + 1.2, c.z + c.nz * o); cv.rotation.y = Math.atan2(-c.nx * out, -c.nz * out) + (dk < 0 ? 0 : Math.PI); grp.add(cv); bx(0.06, 0.9, 0.06, c.x + c.nx * o, c.y + 0.45, c.z + c.nz * o, poleM); }
        E.bench(grp, q.x + q.nx * out * (q.hw + 3.6) + q.tx * 2.2, q.z + q.nz * out * (q.hw + 3.6) + q.tz * 2.2, Math.atan2(q.nx * out, q.nz * out), gy);
      }
      B.flush();
    }

    // ---- trees: dark conifers over the slopes, off the road, the decks and the portals ----
    {
      const pts = [];
      for (let z = Z0 + 2; z < Z0 + (nz - 1) * D - 2; z += 4.2) for (let x = X0 + 2; x < X0 + (nx - 1) * D - 2; x += 4.2) {
        const px = x + (rng() - 0.5) * 3.4, pz = z + (rng() - 0.5) * 3.4, gy = M.ground(px, pz); if (gy < 1.2 || rng() < 0.3) continue;
        const q = roadQ(px, pz); if (q && q.d < q.hw + 3.2) continue;
        const sl = Math.abs(M.ground(px + 1, pz) - M.ground(px - 1, pz)) + Math.abs(M.ground(px, pz + 1) - M.ground(px, pz - 1)); if (sl > 2.6) continue;
        let bad = false; for (const e of els) { for (const s of e.S) { const d = Math.hypot(s.x - px, s.z - pz); if ((!s.t && d < s.hw + 9) || (s.t && d < s.hw + 2)) { bad = true; break; } } if (bad) break; }
        if (bad || Math.hypot(px - M.flash.x, pz - M.flash.z) < 24) continue;
        pts.push([px, gy, pz, 0.75 + rng() * 0.6]);
      }
      const trunkG = new THREE.CylinderGeometry(0.16, 0.24, 1.6, 6).translate(0, 0.8, 0), lowG = new THREE.ConeGeometry(1.5, 3.2, 7).translate(0, 2.8, 0), hiG = new THREE.ConeGeometry(1.05, 2.6, 7).translate(0, 4.6, 0);
      const trunkM = E.mat('#4a3a2c'), leafM = E.mat('#2c4a32', { flat: true, rough: 0.95 }), leafM2 = E.mat('#36573a', { flat: true, rough: 0.95 });
      const mk = (g2, m) => { const im = new THREE.InstancedMesh(g2, m, pts.length); im.castShadow = true; im.receiveShadow = true; grp.add(im); return im; };
      const T = mk(trunkG, trunkM), A = mk(lowG, leafM), Bm = mk(hiG, leafM2), o = new THREE.Object3D();
      pts.forEach(([x, y, z, s], i) => { o.position.set(x, y - 0.1, z); o.scale.setScalar(s); o.rotation.y = rng() * 6; o.updateMatrix(); T.setMatrixAt(i, o.matrix); A.setMatrixAt(i, o.matrix); Bm.setMatrixAt(i, o.matrix); w.circles.push({ x, z, r: 0.3 * s, y0: y - 1.5, y1: y + 6 }); });
    }

    // ---- the map: the range in greens, the road over it ----
    let mapCv = null;
    const map = (g, toMap, S) => {
      if (!mapCv) {
        mapCv = document.createElement('canvas'); mapCv.width = nx; mapCv.height = nz; const c = mapCv.getContext('2d'), im = c.createImageData(nx, nz);
        for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const v = h[j * nx + i], o = (j * nx + i) * 4; if (v < 0.6) continue; im.data[o] = 70 + v * 2.4; im.data[o + 1] = 96 + v * 3; im.data[o + 2] = 60 + v * 1.6; im.data[o + 3] = Math.min(230, 70 + v * 9); }
        c.putImageData(im, 0, 0);
      }
      const [ax, az] = toMap(X0, Z0), [bx2, bz] = toMap(X0 + (nx - 1) * D, Z0 + (nz - 1) * D); g.drawImage(mapCv, ax, az, bx2 - ax, bz - az);
      g.strokeStyle = 'rgba(214,208,196,.9)'; g.lineWidth = Math.max(1.5, 4.6 * S); g.lineJoin = g.lineCap = 'round'; g.beginPath();
      P.forEach((q, i) => { const [x, z] = toMap(q.x, q.z); if (i) g.lineTo(x, z); else g.moveTo(x, z); }); g.stroke();
    };
    return { map };
  }

  SW.Pass = { make, build };
})();
