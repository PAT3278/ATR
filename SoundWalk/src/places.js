/*
 * The places on the map — one 3D diorama per song.
 *
 * Every builder works in the place's local frame: the viewpoint (where you stand to look)
 * is the origin, the view looks towards local -Z, and the path from the plaza arrives
 * from local +Z. game.js positions and rotates the group.
 *
 * A builder fills in on the place object `p`:
 *   p.grade      lighting / colour grade the world blends into as you approach
 *   p.update     (t, dt, f, v, viewing) per frame; f = audio features, v = 0..1 closeness
 *   p.shot       (t, f) -> { pos, look, roll } local camera for the scenic view (the "MV loop")
 *   p.face       local yaw the avatar faces at the viewpoint
 *   p.pathEnd    local z where the path from the plaza ends
 *   p.blocks     (lx, lz) -> true where random trees must not grow
 *   p.scrubOut   optional (lx, lz) -> true where the hills' low scrub must not grow (else p.blocks): it may cross a view
 *   p.ground     optional (lx, lz, y) -> height; y is the walker's height (undefined: from above). A deck someone can
 *                walk under returns its height only when E.onDeck(deckY, y), so nobody underneath is lifted onto it
 *   p.shore      optional (lx, lz) -> true where the land runs on past the world's land edge (|x|, |z| > 145)
 *   p.trail      optional [[lx, lz], ...]: the bends of a trail of its own from the plaza to the viewpoint
 *   p.onHill     the hills are not flattened round it or its trail (KEYAKI's trail climbs over them)
 *   p.afterHills optional ({ groundAt, layTrail, path, boxes, circles }): build what has to stand on the hills, once they
 *                exist (boxes / circles: every collider so far, for a place that tunnels under others' things)
 *   p.rim        optional (lx, lz) -> metres outside its grounds: the hills rise right from that edge (the funfair)
 *   p.lookout    its view looks out over the world: the other places are not hidden while it is viewed
 *   p.relief     optional (lx, lz, out) -> metres of rock of its own laid into the hill field (out.rock: 0..1 how much is
 *                bare rock); game.js keeps it under the elevated roads (the funfair's crater wall)
 *   p.bore       optional (lx, lz, y) -> the floor of a tunnel through the hills when (lx, lz, y) is down in it, else null:
 *                groundAt then ignores the hill over it (the funfair's way in, the canal's cave)
 *   p.holeAt     optional (lx, lz, y, tri) -> true to drop the hill mesh's face there (y: its lowest corner) at a tunnel mouth;
 *                tri: its three corners in this frame (x, y, z three times), to drop whatever would stand inside a tunnel
 *   (a collider a place marks .keep, e.g. p.addCircle(...).keep = 1, is left alone by OHH's canal, which lifts what stands over it)
 *   p.carve      optional (lx, lz) -> 0..1 the hills and the relief are scaled by there: a cutting dug through them (OHH's canal)
 *   p.ceil       optional (lx, lz) -> the camera's ceiling under a vault
 * and uses p.addCircle / p.addBox for collisions (a box can be turned further: set its c, s to the cosine and sine
 * of p.rot plus the thing's own yaw), p.water / p.waterShape(fn) for water and p.pick for click-to-walk surfaces.
 */
(function () {
  'use strict';
  const SW = window.SW;
  const PLACES = {};

  // Average of one log-spaced spectrum band (i of n), 0..1.
  function band(f, i, n) {
    const s = f.spectrum;
    if (!s) return 0;
    const lo = Math.floor(2 * Math.pow(140, i / n));
    const hi = Math.max(lo + 1, Math.floor(2 * Math.pow(140, (i + 1) / n)));
    let a = 0;
    for (let k = lo; k < hi; k++) a += s[k];
    return a / (hi - lo) / 255;
  }
  SW.band = band;

  /* ------------------------------------------------------------------ */
  /* KEYAKI — a mountain trail up to a lookout under an old zelkova      */
  /* ------------------------------------------------------------------ */
  PLACES.keyaki = {
    build(p, E) {
      // The hills cover what was the zelkova avenue. KEYAKI is a trail now: from the plaza up the spur of the mountain
      // between OHH and the funfair (game.js PEAKS), in log steps where it is steep, past a log bench on the shoulder,
      // across the flank with a rope railing over the drop, round a hairpin and up a last flight of steps to a timber
      // lookout on the summit (the viewpoint: songs.js x/z), under an old zelkova, in the same golden afternoon with its
      // leaves coming down. The trail's bends are world metres because the hills are; everything along it waits for the
      // hills (p.afterHills) and stands on groundAt, so nothing floats or is buried.
      const g = p.group, r = E.rng(11);
      const TW = [[-26, -30], [-31, -38], [-37, -47], [-41, -53], [-36, -60], [-44, -64], [-40, -73]];   // past the loop, up the spur, the shoulder, across to the saddle, a hairpin, and up the summit's east side to the deck's steps
      const VW = [-0.966, -0.259], cr = Math.cos(p.rot), sr = Math.sin(p.rot);   // the way the lookout faces (world): west by north, over the hills and OHH's beach to the sea (SHOT's towers stay off to the right)
      const A = Math.atan2(-(VW[0] * cr - VW[1] * sr), -(VW[0] * sr + VW[1] * cr)), cA = Math.cos(A), sA = Math.sin(A);   // the deck's own frame: its -Z looks out
      const toDeck = (lx, lz) => [lx * cA - lz * sA, lx * sA + lz * cA], fromDeck = (u, v) => [u * cA + v * sA, -u * sA + v * cA];
      const DW = 3.4, DD = 2.3, RISE = 0.22, TREAD = 0.3;   // the deck's half-width along the rail and half-depth; the steps up onto it at the back
      p.trail = TW.map(([x, z]) => { const l = p.local(x, z); return [l.x, l.z]; }).concat([fromDeck(0, DD + 2.8), [0, 0]]);   // the last few metres straight up the deck's steps
      p.onHill = true; p.lookout = true;   // its view looks out over the other places, so they stay drawn
      let deckY = 0, nStep = 0, gAt = () => 0;
      p.ground = (lx, lz, y) => {
        if (!deckY || (y !== undefined && y < deckY - 6)) return 0;   // OHH's canal runs deep under the summit
        const [u, v] = toDeck(lx, lz);
        if (Math.abs(u) < DW && Math.abs(v) < DD) return deckY;
        const k = Math.ceil((v - DD) / TREAD); return Math.abs(u) < 1.1 && v > DD && k <= nStep ? deckY - k * RISE : 0;
      };
      p.face = Math.atan2(VW[0], VW[1]) - p.rot;
      p.pathEnd = 7; p.clearR = 7;
      p.blocks = (lx, lz) => { if (Math.hypot(lx, lz) < 8) return true; const [u, v] = toDeck(lx, lz); return v < 0 && v > -50 && Math.abs(u) < 7 - v * 0.95; };   // the deck's clearing, and no tall trees across the view (as wide as the view's drift)
      p.scrubOut = (lx, lz) => Math.hypot(lx, lz) < 9;   // low scrub may grow across the view, only not on the summit
      p.map = [{ t: 'circle', x: 0, z: 0, r: 3.2, c: '#9a7a4a' }];
      p.grade = {
        top: '#86b4d9', bottom: '#ffe6ad', fog: '#efdcaa', near: 50, far: 320,   // from the summit the haze opens out
        sun: '#ffd08a', sunInt: 2.5, hemi: 0.62, sunDir: [0.3, 0.42, -0.6],   // low in the north, ahead and to the right of the view: the old tree's leaves lit from behind, the sea still blue
        tint: [1.05, 1.0, 0.88], expo: 0.98, sat: 1.0, stars: 0,
      };

      const trunkM = E.mat('#5b4230'), wood = E.mat('#7a5a3a', { rough: 0.9 }), rope = E.mat('#b9a27c', { rough: 1 }), logM = E.mat('#9a8670', { map: E.tex('bark', 1, 1), rough: 0.95 });
      const rockM = E.mat('#a49a88', { map: E.tex('rock', 1, 1), rough: 0.95 });
      const leafMs = ['#5a9a44', '#6ba94b', '#86b04a', '#b8c55c', '#d6b84a', '#c9963e'].map((c) => E.mat(c, { flat: true }));   // late summer going gold
      const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t; };
      const plank = canvasTex(64, 256, (x) => { for (let i = 0; i < 8; i++) { x.fillStyle = ['#8a6a48', '#7d5f40', '#93714c', '#84653f'][i % 4]; x.fillRect(0, i * 32, 64, 31); x.fillStyle = '#3e2c1c'; x.fillRect(0, i * 32 + 31, 64, 1); } });
      plank.wrapS = plank.wrapT = THREE.RepeatWrapping; plank.repeat.set(3, 2.6);
      const carved = (lines, w, h, px, left) => canvasTex(w, h, (x) => { x.fillStyle = '#6b4a2c'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(0, h - 6, w, 6); x.fillStyle = '#f1e6cc'; x.font = `700 ${px}px "Noto Sans JP","Hind",sans-serif`; x.textBaseline = 'middle'; x.textAlign = left === undefined ? 'center' : left ? 'left' : 'right'; lines.forEach((ln, i) => x.fillText(ln, left === undefined ? w / 2 : left ? 18 : w - 18, (h * (i + 0.5)) / lines.length + 2)); });   // white letters on brown, as on park signposts

      // sticks: logs, posts, ropes and stakes, each kind one instanced draw; a stick runs from a to b ([x, y, z], local)
      const sticks = new Map(), up = new THREE.Vector3(0, 1, 0);
      const stick = (m, rad, a, b) => { if (!sticks.has(m)) sticks.set(m, []); sticks.get(m).push([rad, a, b]); };
      const flushSticks = () => {
        const geo = new THREE.CylinderGeometry(1, 1, 1, 7), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), ps = new THREE.Vector3(), sc = new THREE.Vector3(), d = new THREE.Vector3();
        sticks.forEach((list, m) => {
          const im = new THREE.InstancedMesh(geo, m, list.length);
          list.forEach(([rad, a, b], i) => { d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = d.length(); q.setFromUnitVectors(up, d.normalize()); ps.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); sc.set(rad, L, rad); im.setMatrixAt(i, m4.compose(ps, q, sc)); });
          im.castShadow = im.receiveShadow = true; g.add(im);
        });
      };

      // a zelkova: a short trunk that splits into limbs fanning up and out, under a wide round crown
      const trees = [];
      const zelkova = (x, y, z, s) => {
        const t = new THREE.Group(); t.position.set(x, y, z); t.rotation.y = r() * 6.28; t.scale.setScalar(s); g.add(t);
        const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.6, 3.4, 8), trunkM); tr.position.y = 1.4; tr.castShadow = true; t.add(tr);   // its foot sunk into the slope
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * 6.28 + r() * 0.6, lean = 0.42 + r() * 0.25, L = 3 + r(), dir = new THREE.Vector3(Math.cos(a) * Math.sin(lean), Math.cos(lean), Math.sin(a) * Math.sin(lean));
          const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.25, L, 6), trunkM); b.quaternion.setFromUnitVectors(up, dir); b.position.set((dir.x * L) / 2, 2.9 + (dir.y * L) / 2, (dir.z * L) / 2); b.castShadow = true; t.add(b);
        }
        const canopy = new THREE.Group(); canopy.position.y = 5.2; t.add(canopy);
        for (let k = 0; k < 13; k++) {
          const a = r() * 6.28, d = k ? 1.3 + r() * 2.3 : 0, m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2 + r() * 0.8, 0), leafMs[Math.floor(r() * leafMs.length)]);
          m.position.set(Math.cos(a) * d, 0.5 + (3.4 - d) * 0.5 + r() * 0.6, Math.sin(a) * d); m.rotation.set(r() * 3, r() * 3, 0); m.castShadow = true; canopy.add(m);
        }
        trees.push({ canopy, seed: r() * 6 });
        p.addCircle(x, z, 0.55 * s);
        return t;
      };
      const [KX, KZ] = fromDeck(-DW - 1.6, -DD + 0.4);   // the old zelkova, off the deck's left rail by the front; one long low limb reaches out over the rail into the view

      // falling leaves round the old tree and the deck (each lands where the slope is under it)
      const N = 420, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), seed = new Float32Array(N), floor = new Float32Array(N);
      const lc = ['#9bc75a', '#7fb24a', '#e3c55a', '#c99a45', '#b6d36a'].map((c) => new THREE.Color(c).convertSRGBToLinear());
      const drop = (i, high) => { const a = r() * 6.28, d = Math.sqrt(r()) * 12, x = KX * 0.4 + Math.cos(a) * d, z = KZ * 0.4 + Math.sin(a) * d, w = p.toWorld(x, z), f = gAt(w.x, w.z); floor[i] = f; pos[i * 3] = x; pos[i * 3 + 2] = z; pos[i * 3 + 1] = f + (high ? 7 + r() * 3 : r() * 10); };
      for (let i = 0; i < N; i++) { const c = lc[i % lc.length]; col.set([c.r, c.g, c.b], i * 3); seed[i] = r() * 10; }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      lg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const leaves = new THREE.Points(lg, new THREE.PointsMaterial({ size: 0.13, map: E.dot(), alphaTest: 0.3, vertexColors: true, transparent: true, depthWrite: false }));
      leaves.frustumCulled = false; g.add(leaves);

      // shafts of low sun through the old tree's crown
      const rays = [];
      for (let i = 0; i < 6; i++) {
        const m = new THREE.MeshBasicMaterial({ color: '#fff0bf', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
        rays.push({ m, ray: new THREE.Mesh(new THREE.PlaneGeometry(1.2 + r() * 1.4, 14), m), seed: r() * 6, ox: (r() - 0.5) * 9, oz: (r() - 0.5) * 7, ry: r() * Math.PI });
      }

      p.afterHills = (H) => {
        gAt = H.groundAt;
        const at = (lx, lz) => { const w = p.toWorld(lx, lz); return gAt(w.x, w.z); };
        // the deck: level with the summit's highest point under it, on posts, with steps up at the back
        let top = 0; for (const u of [-DW, 0, DW]) for (const v of [-DD, 0, DD]) { const [x, z] = fromDeck(u, v); top = Math.max(top, at(x, z)); }
        deckY = top + 0.28;
        while (nStep < 10) { const k = nStep + 1, [x, z] = fromDeck(0, DD + (k - 0.5) * TREAD); if (at(x, z) >= deckY - k * RISE - 0.04) break; nStep = k; }   // down until the ground meets a tread (the stair is steeper than the summit, so it does)
        const D = new THREE.Group(); D.position.y = deckY; D.rotation.y = A; g.add(D);
        const DB = E.batch(D), rot = (b) => { b.c = Math.cos(p.rot + A); b.s = Math.sin(p.rot + A); };   // colliders square to the deck
        const boards = new THREE.Mesh(new THREE.BoxGeometry(DW * 2, 0.14, DD * 2), [wood, wood, E.mat('#ffffff', { map: plank, rough: 0.85 }), wood, wood, wood]); boards.position.y = -0.07; boards.receiveShadow = boards.castShadow = true; D.add(boards); p.pick(boards);
        for (const u of [-DW + 0.2, 0, DW - 0.2]) for (const v of [-DD + 0.2, DD - 0.2]) { const [x, z] = fromDeck(u, v); stick(wood, 0.1, [x, at(x, z) - 0.3, z], [x, deckY - 0.1, z]); }
        const rail = (u0, v0, u1, v1) => {   // posts, a hand rail and a mid rail, and a collider along them
          const L = Math.hypot(u1 - u0, v1 - v0), n = Math.max(1, Math.round(L / 1.15));
          for (let i = 0; i <= n; i++) DB.box(0.11, 1.05, 0.11, u0 + ((u1 - u0) * i) / n, 0.52, v0 + ((v1 - v0) * i) / n, wood);
          for (const y of [1.02, 0.55]) { const o = DB.box(L, y > 1 ? 0.09 : 0.06, y > 1 ? 0.13 : 0.05, (u0 + u1) / 2, y, (v0 + v1) / 2, wood); o.rotation.y = Math.atan2(-(v1 - v0), u1 - u0); }
          const [x, z] = fromDeck((u0 + u1) / 2, (v0 + v1) / 2); rot(p.addBox(x, z, Math.abs(u1 - u0) / 2 + 0.08, Math.abs(v1 - v0) / 2 + 0.08));
        };
        const e = 0.06; rail(-DW + e, -DD + e, DW - e, -DD + e); rail(-DW + e, -DD + e, -DW + e, DD - e); rail(DW - e, -DD + e, DW - e, DD - e);
        rail(-DW + e, DD - e, -1.15, DD - e); rail(1.15, DD - e, DW - e, DD - e);   // the back, open in the middle for the steps
        for (let k = 1; k <= nStep; k++) { const v = DD + (k - 0.5) * TREAD, [x, z] = fromDeck(0, v), y1 = -k * RISE, y0 = Math.min(at(x, z) - deckY, y1) - 0.4; DB.box(2.2, y1 - y0, TREAD + 0.02, 0, (y0 + y1) / 2, v, wood); }
        for (const u of [-2, 2]) { E.bench(D, u, 1.3, Math.PI); const [x, z] = fromDeck(u, 1.3); rot(p.addBox(x, z, 1.05, 0.32)); }   // two benches looking out, a wide gap between them from the steps
        { const [x, z] = fromDeck(DW + 1.1, -DD + 0.5), y = at(x, z); stick(wood, 0.1, [x, y - 0.3, z], [x, y + 1.75, z]); p.addCircle(x, z, 0.16);   // the summit post
          const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.62), new THREE.MeshStandardMaterial({ map: carved(['けやき山', '展望台'], 256, 320, 64), roughness: 0.9 })); pl.position.set(x + Math.sin(A) * 0.11, y + 1.2, z + Math.cos(A) * 0.11); pl.rotation.y = A; g.add(pl); }
        DB.flush();
        zelkova(KX, at(KX, KZ) - 0.4, KZ, 1.45);
        { const y0 = at(KX, KZ) + 2.6, [tx, tz] = fromDeck(-0.3, -DD - 3.2), d = new THREE.Vector3(tx - KX, deckY + 3.9 - y0, tz - KZ), L = d.length();   // the low limb, swaying from its root
          const limb = new THREE.Group(); limb.position.set(KX, y0, KZ); g.add(limb); d.normalize();
          const br = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.22, L, 6), trunkM); br.quaternion.setFromUnitVectors(up, d); br.position.copy(d).multiplyScalar(L / 2); br.castShadow = true; limb.add(br);
          for (let k = 0; k < 7; k++) { const f = 0.45 + (k / 6) * 0.6, m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75 + r() * 0.5, 0), leafMs[Math.floor(r() * leafMs.length)]); m.position.copy(d).multiplyScalar(L * Math.min(f, 1.02)).add(new THREE.Vector3((r() - 0.5) * 1.4, 0.2 + (r() - 0.6) * 0.9, (r() - 0.5) * 1.4)); m.rotation.set(r() * 3, r() * 3, 0); m.castShadow = true; limb.add(m); }
          trees.push({ canopy: limb, seed: r() * 6 }); }
        rays.forEach((q) => { q.ray.position.set(KX + q.ox, deckY + 6, KZ + q.oz); q.ray.rotation.set(0, q.ry, 0.35); g.add(q.ray); });

        // the trail: resampled every 0.25 m with the ground under it, a tangent and its right-hand side
        const P = H.path.map((q) => p.local(q.x, q.z)), S = [];
        for (let i = 0; i < P.length - 1; i++) { const n = Math.max(1, Math.ceil(Math.hypot(P[i + 1].x - P[i].x, P[i + 1].z - P[i].z) / 0.25)); for (let k = 0; k < n; k++) S.push({ x: P[i].x + ((P[i + 1].x - P[i].x) * k) / n, z: P[i].z + ((P[i + 1].z - P[i].z) * k) / n }); }
        S.push({ x: P[P.length - 1].x, z: P[P.length - 1].z });
        S.forEach((q, i) => { q.s = i ? S[i - 1].s + Math.hypot(q.x - S[i - 1].x, q.z - S[i - 1].z) : 0; q.y = at(q.x, q.z); });
        S.forEach((q, i) => { const a = S[Math.max(0, i - 4)], b = S[Math.min(S.length - 1, i + 4)], l = Math.hypot(b.x - a.x, b.z - a.z) || 1; q.tx = (b.x - a.x) / l; q.tz = (b.z - a.z) / l; q.nx = -q.tz; q.nz = q.tx; });
        const atDeck = (q) => { const [u, v] = toDeck(q.x, q.z); return Math.abs(u) < DW + 0.4 && v > -DD - 0.4 && v < DD + nStep * TREAD + 0.25; };
        const T = S.filter((q, i) => !atDeck(q) && (i % 5 === 0)).map((q) => p.toWorld(q.x, q.z));
        H.layTrail(T, { w: 1.1 });   // worn earth, over the hill mesh
        // log steps where it is steep: a log across the trail every 0.26 m of height, a stake at each end on the downhill side
        let lastY = null;
        S.forEach((q, i) => {
          if (atDeck(q) || q.y < 0.3) { lastY = null; return; }
          const a = S[Math.max(0, i - 3)], b = S[Math.min(S.length - 1, i + 3)], gr = (b.y - a.y) / Math.max(0.1, b.s - a.s);
          if (Math.abs(gr) < 0.24) { lastY = null; return; }
          if (lastY !== null && Math.abs(q.y - lastY) < 0.26) return;
          lastY = q.y;
          const sg = gr > 0 ? -0.14 : 0.14, ends = [1, -1].map((sd) => { const x = q.x + q.nx * sd * 0.95, z = q.z + q.nz * sd * 0.95; return [x, at(x, z), z]; });
          stick(logM, 0.1, [ends[0][0], ends[0][1] + 0.01, ends[0][2]], [ends[1][0], ends[1][1] + 0.01, ends[1][2]]);
          ends.forEach(([x, y, z]) => stick(wood, 0.035, [x + q.tx * sg, y - 0.25, z + q.tz * sg], [x + q.tx * sg, y + 0.14, z + q.tz * sg]));
        });
        // a rope railing on the side that drops away: posts every 2.2 m wherever the ground 2.6 m out is a metre down
        const runs = { 1: [], '-1': [] }, fence = (run) => {
          if (run.length > 1) run.forEach(([x, y, z], k) => {
            stick(wood, 0.06, [x, y - 0.25, z], [x, y + 1.02, z]); p.addCircle(x, z, 0.1);
            const nx = run[k + 1]; if (!nx) return;
            for (const hh of [0.95, 0.55]) { const m = [(x + nx[0]) / 2, (y + nx[1]) / 2 + hh - 0.09, (z + nx[2]) / 2]; stick(rope, 0.018, [x, y + hh, z], m); stick(rope, 0.018, m, [nx[0], nx[1] + hh, nx[2]]); }
          });
          run.length = 0;
        };
        let lastS = -9;
        S.forEach((q) => {
          if (q.s - lastS < 2.2) return; lastS = q.s;
          for (const sd of [1, -1]) {
            const run = runs[sd];
            if (atDeck(q) || q.y < 0.5) { fence(run); continue; }
            const sx = q.x + q.nx * sd * 2.6, sz = q.z + q.nz * sd * 2.6;
            if (q.y - at(sx, sz) > 1) { const x = q.x + q.nx * sd * 1.45, z = q.z + q.nz * sd * 1.45; run.push([x, at(x, z), z]); } else fence(run);
          }
        });
        fence(runs[1]); fence(runs[-1]);
        // signposts: where the climb starts, on the shoulder and at the hairpin
        const near = (w) => { const l = p.local(w[0], w[1]); return S.reduce((b, q) => (Math.hypot(q.x - l.x, q.z - l.z) < Math.hypot(b.x - l.x, b.z - l.z) ? q : b), S[0]); };
        const sign = (q, sd, list) => {
          const x = q.x + q.nx * sd * 1.8, z = q.z + q.nz * sd * 1.8, y = at(x, z);
          stick(wood, 0.07, [x, y - 0.3, z], [x, y + 2.15, z]); p.addCircle(x, z, 0.12);
          list.forEach(([text, dir], k) => {
            const bd = new THREE.Group(); bd.position.set(x, y + 1.9 - k * 0.34, z); bd.rotation.y = Math.atan2(-q.tz * dir, q.tx * dir); g.add(bd);   // its +X points the way
            const bx = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.25, 0.05), wood); bx.position.x = 0.62; bx.castShadow = true; bd.add(bx);
            for (const f of [1, -1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.23), new THREE.MeshStandardMaterial({ map: carved([f > 0 ? text + ' ▶' : '◀ ' + text], 512, 96, 46, f < 0), roughness: 0.9 })); m.position.set(0.62, 0, f * 0.027); if (f < 0) m.rotation.y = Math.PI; bd.add(m); }   // the arrow at the end it points to, read from either side
          });
        };
        const climb = S.find((q) => q.y > 0.4) || S[0], head = S.reduce((b, q) => (Math.abs(q.s - (climb.s - 4)) < Math.abs(b.s - (climb.s - 4)) ? q : b), S[0]);
        sign(head, 1, [['けやき展望台', 1], ['広場', -1]]);
        const shoulder = near(TW[3]), hair = near(TW[5]);
        sign(hair, -1, [['展望台', 1], ['広場', -1]]);
        { // the rest on the shoulder: a log bench on two stumps on the open side, and a signpost across from it
          const sd = at(shoulder.x + shoulder.nx * 2.6, shoulder.z + shoulder.nz * 2.6) < at(shoulder.x - shoulder.nx * 2.6, shoulder.z - shoulder.nz * 2.6) ? 1 : -1;
          const cx = shoulder.x + shoulder.nx * sd * 2.4, cz = shoulder.z + shoulder.nz * sd * 2.4, ends = [1, -1].map((k) => { const x = cx + shoulder.tx * k * 0.85, z = cz + shoulder.tz * k * 0.85; return [x, at(x, z), z]; }), seat = Math.max(ends[0][1], ends[1][1]) + 0.34;
          ends.forEach(([x, y, z]) => { stick(logM, 0.17, [x, y - 0.2, z], [x, seat - 0.05, z]); p.addCircle(x, z, 0.3); });
          stick(logM, 0.16, [ends[0][0] + shoulder.tx * 0.25, seat, ends[0][2] + shoulder.tz * 0.25], [ends[1][0] - shoulder.tx * 0.25, seat, ends[1][2] - shoulder.tz * 0.25]);
          sign(shoulder, -sd, [['展望台', 1], ['広場', -1]]);
        }
        // boulders by the way, and young zelkovas on the upper slopes among the woods
        let nextRock = 6, nextTree = 30;
        S.forEach((q, i) => {
          if (atDeck(q) || q.y < 0.6) return;
          if (q.s > nextRock) { nextRock = q.s + 9 + r() * 8; const sd = i % 2 ? 1 : -1, d = 2 + r() * 1.2, x = q.x + q.nx * sd * d, z = q.z + q.nz * sd * d, s = 0.35 + r() * 0.5; const m = new THREE.Mesh(E.rockGeo(i), rockM); m.scale.setScalar(s); m.rotation.y = r() * 6; m.position.set(x, at(x, z) - s * 0.25, z); m.castShadow = m.receiveShadow = true; g.add(m); p.addCircle(x, z, s * 0.8); }
          if (q.y > 5 && q.s > nextTree) {
            nextTree = q.s + 7 + r() * 6;
            const sd = r() < 0.5 ? 1 : -1, d = 4.5 + r() * 2, x = q.x + q.nx * sd * d, z = q.z + q.nz * sd * d, s = 0.72 + r() * 0.3;
            if (Math.hypot(x, z) < 9 || p.blocks(x, z) || S.some((o) => Math.hypot(o.x - x, o.z - z) < 3.6)) return;
            zelkova(x, at(x, z) - 0.35 * s, z, s);
          }
        });
        flushSticks();
        for (let i = 0; i < N; i++) drop(i, false);
        lg.attributes.position.needsUpdate = true;
      };

      p.update = (t, dt, f, v) => {
        const sway = 0.022 * (1 + f.bass * 3);
        trees.forEach((tr) => { tr.canopy.rotation.z = Math.sin(t * 1.2 + tr.seed) * sway; tr.canopy.rotation.x = Math.cos(t * 0.9 + tr.seed) * sway * 0.7; });
        if (v > 0.01) {
          const fall = 0.45 + f.high * 1.8 + f.pulse * 0.5;
          for (let i = 0; i < N; i++) {
            const k = i * 3;
            pos[k + 1] -= dt * fall * (0.6 + (seed[i] % 1) * 0.8);
            pos[k] += Math.sin(t * 1.7 + seed[i]) * dt * 0.5;
            pos[k + 2] += Math.cos(t * 1.3 + seed[i]) * dt * 0.25;
            if (pos[k + 1] < floor[i] + 0.02) drop(i, true);
          }
          lg.attributes.position.needsUpdate = true;
        }
        rays.forEach((ry) => { ry.m.opacity = v * (0.025 + f.mid * 0.11) * (0.6 + 0.4 * Math.sin(t * 0.7 + ry.seed)); });
      };
      // the view: at the front rail of the deck, drifting along it, looking out over the hills under the old tree's branches
      p.shot = (t) => {
        const k = Math.sin(t * 0.07) * 1.5, ph = Math.sin(t * 0.045) * 0.3, [x, z] = fromDeck(k, -1.2), [lx, lz] = fromDeck(k + Math.sin(ph) * 60, -1.2 - Math.cos(ph) * 60);
        return { pos: [x, deckY + 1.62 + Math.sin(t * 0.3) * 0.03, z], look: [lx, deckY - 1.5, lz], roll: Math.sin(t * 0.3) * 0.01 };   // just under the horizon: the beach and the sea, the limb's leaves along the top
      };
    },
  };

  /* ------------------------------------------------------------------ */
  /* TAMA EXPRESSION — riverside at dusk, iron bridge, passing train     */
  /* ------------------------------------------------------------------ */
  PLACES.tama = {
    build(p, E) {
      const g = p.group, r = E.rng(23);
      const RZ = -14, RW = 12;

      const water = new THREE.Mesh(new THREE.PlaneGeometry(100, RW, 1, 1), new THREE.ShaderMaterial({
        uniforms: { t: { value: 0 }, level: { value: 0 }, a: { value: new THREE.Color('#ff9a5c') }, b: { value: new THREE.Color('#2d2456') }, nrm: { value: E.waterN }, sunD: { value: new THREE.Vector3(14, 5, -185).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), p.rot) } },
        vertexShader: 'varying vec2 vUv;varying vec3 vW;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
        fragmentShader: 'uniform float t,level;uniform vec3 a,b,sunD;uniform sampler2D nrm;varying vec2 vUv;varying vec3 vW;' +
          'void main(){float y=vUv.y;vec3 c=mix(b,a,pow(1.-y,1.6));' +
          'float s=sin(vUv.x*420.+t*1.3+sin(vUv.y*40.+t)*2.)*sin(vUv.y*90.-t*2.);' +
          'float glint=smoothstep(.55,1.,s)*(.25+level*1.2);' +
          'float col=exp(-pow((vUv.x-.53)*28.,2.));c+=vec3(1.,.75,.45)*glint*(.35+col*1.6);' +
          'c+=vec3(1.,.6,.35)*col*.25*(1.-y);' + E.WATER_GLSL + 'float wLt=clamp(.5+wN.x*1.6+wN.z*2.2,0.,1.);c*=.62+wLt*.62;c+=vec3(1.,.78,.5)*wSp*(1.6+level*1.6)+a*wFr*.35;gl_FragColor=vec4(pow(c,vec3(2.2)),1.);}'   // the same rippled water as the sea at OHH: light and shade on every little wave,
      }));
      water.rotation.x = -Math.PI / 2;
      water.position.set(0, 0.05, RZ);
      g.add(water); p.pick(water);
      p.water(0, RZ, 50, RW / 2);

      const sandM = E.mat('#cdb683', { map: E.tex('sand', 30, 1) });
      for (const z of [RZ + RW / 2 + 0.8, RZ - RW / 2 - 0.8]) {
        const s = E.plane(100, 1.8, sandM);
        s.position.set(0, 0.04, z);
        g.add(s);
      }
      // Reeds along both banks
      const reedN = 320;
      const reeds = new THREE.InstancedMesh(new THREE.ConeGeometry(0.05, 1.5, 3).translate(0, 0.75, 0), E.mat('#8a8a4a', { flat: true }), reedN);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), eu = new THREE.Euler();
      for (let i = 0; i < reedN; i++) {
        const near = i % 2 === 0;
        let x = (r() - 0.5) * 96;
        if (near && Math.abs(x) < 6) x += Math.sign(x || 1) * 8;
        ps.set(x, 0, near ? RZ + RW / 2 + 0.6 + r() * 1.6 : RZ - RW / 2 - 0.6 - r() * 2);
        eu.set((r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3); q.setFromEuler(eu);
        const h = 0.6 + r() * 0.8; sc.set(1, h, 1);
        reeds.setMatrixAt(i, m4.compose(ps, q, sc));
      }
      g.add(reeds);

      // Iron truss bridge carrying the railway across the river
      const BX = -18, steel = E.mat('#3e4452', { metal: 0.6, rough: 0.5 });
      const deck = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.7, 34), steel);
      deck.position.set(BX, 4, RZ); deck.castShadow = true;
      g.add(deck);
      for (const z of [RZ - 6, RZ, RZ + 6]) {
        const pier = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4, 2), E.mat('#8d8578'));
        pier.position.set(BX, 2, z); g.add(pier); p.addBox(BX, z, 1.25, 1.05);
      }
      for (const sx of [-1.6, 1.6]) {
        const top = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 30), steel);
        top.position.set(BX + sx, 7.6, RZ); g.add(top);
        for (let k = 0; k < 10; k++) {
          const z0 = RZ - 15 + k * 3;
          const d = new THREE.Mesh(new THREE.BoxGeometry(0.18, 4.4, 0.18), steel);
          d.position.set(BX + sx, 5.8, z0 + 1.5);
          d.rotation.x = k % 2 ? 0.6 : -0.6;
          g.add(d);
        }
      }
      // Embankments, a tunnel mouth on the near side
      const embM = E.mat('#56544f', { rough: 0.9 });
      const emb1 = new THREE.Mesh(new THREE.BoxGeometry(5, 3.6, 18), embM);
      emb1.position.set(BX, 1.8, RZ + 26); g.add(emb1);
      // on the far bank the embankment runs back through the town, opened by girder bridges where the streets pass under
      // (the shopping street at z -38.5..-49.5, the back street at -69..-75)
      for (const [z0, z1] of [[RZ - 17, -38.5], [-49.5, -69], [-75, RZ - 137]]) {
        const emb = new THREE.Mesh(new THREE.BoxGeometry(5, 3.6, z0 - z1), embM); emb.position.set(BX, 1.8, (z0 + z1) / 2); emb.castShadow = true; g.add(emb);
        p.addBox(BX, (z0 + z1) / 2, 2.55, (z0 - z1) / 2);
      }
      // Past the world's land edge the meadow south of OHH's beach runs on to the embankment's last stretch (p.shore: the
      // strip on its sea side, as long as it is): you walk it from the sand up to the embankment, and where the embankment
      // ends a post-and-rail fence runs from it out into the sea, so the land stops at something you can see.
      p.shore = (lx, lz) => lx > BX + 2.5 && lx < BX + 80 && lz >= RZ - 137 && lz <= -75;
      { const FB = E.batch(g), fb = FB.box, fm = E.mat('#6b5b48', { rough: 0.9 }), fz = RZ - 137, x0 = BX + 2.5, x1 = BX + 29.5;   // the sea is ~27 m out from the embankment here
        for (let x = x0 + 0.1; x < x1 + 0.1; x += 2.2) fb(0.14, 1.5, 0.14, x, 0.4, fz, fm);   // posts, their feet in the ground (or the water)
        for (const y of [0.5, 0.98]) fb(x1 - x0, 0.1, 0.05, (x0 + x1) / 2, y, fz + 0.09, fm);
        FB.flush(); p.addBox((x0 + x1) / 2, fz, (x1 - x0) / 2, 0.12); }
      // The track, all the way from the far end of the embankment over the bridge into the station: on the embankments and
      // the girder bridges a ballast bed with sloping shoulders, on the truss bridge sleepers laid straight on the deck;
      // concrete sleepers every 0.6 m and two rails, their tops at 4.45 like the station's.
      {
        const TB = E.batch(g), tb = TB.box, ballastM = E.mat('#6d665c', { map: E.tex('slate', 1, 6), rough: 1 }), slpM = E.mat('#8f8a80', { rough: 0.9 }), railM = E.mat('#6c6a66', { metal: 0.7, rough: 0.35 });
        const Z0 = RZ - 137, Z1 = RZ + 34, onBridge = (z) => z > RZ - 17 && z < RZ + 17;
        for (const [a, b2] of [[Z0, RZ - 17], [RZ + 17, Z1]]) { tb(3.0, 0.64, b2 - a, BX, 3.92, (a + b2) / 2, ballastM); for (const sx of [-1, 1]) { const sh = tb(0.75, 0.5, b2 - a, BX + sx * 1.55, 3.82, (a + b2) / 2, ballastM); sh.rotation.z = sx * 0.55; } }   // the bed and its shoulders
        for (let z = Z0 + 0.3; z < Z1; z += 0.6) tb(2.3, 0.1, 0.22, BX, onBridge(z) ? 4.33 : 4.27, z, slpM);
        for (const sx of [-0.72, 0.72]) { tb(0.07, 0.13, Z1 - Z0, BX + sx, 4.385, (Z0 + Z1) / 2, railM); tb(0.14, 0.03, Z1 - Z0, BX + sx, 4.335, (Z0 + Z1) / 2, railM); }   // rail head and foot
        TB.flush();
      }
      for (const [z0, z1] of [[-38.5, -49.5], [-69, -75]]) {
        const gd = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.8, z0 - z1 + 0.6), steel); gd.position.set(BX, 3.2, (z0 + z1) / 2); gd.castShadow = true; g.add(gd);
        for (const sx of [-2.05, 2.05]) { const rl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, z0 - z1 + 0.6), steel); rl.position.set(BX + sx, 4.1, (z0 + z1) / 2); g.add(rl); }
      }
      // Live house under the tracks: the train runs through the upper floor, the ground floor is an open venue.
      const CZ = RZ + 42, V = new THREE.Group(); V.position.set(BX, 0, CZ); g.add(V);
      const wallM = E.mat('#6a4436', { rough: 0.95 }), stageM = E.mat('#141316', { rough: 0.7 }), gearM = E.mat('#0f0f11', { rough: 0.6, metal: 0.3 });
      const VB = E.batch(V), vbox = (w, h, d, x, y, z, m = wallM) => VB.box(w, h, d, x, y, z, m);   // static boxes, drawn instanced after VB.flush()
      const vglow = (hex, o) => new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      // Ground floor: brick walls, a 7 m opening at the front. First floor: an open-sided station, the end of the line.
      const concM = E.mat('#8d8a82', { rough: 0.9 }), steelM = E.mat('#2c3a36', { rough: 0.6, metal: 0.4 }), roofM = E.mat('#33453f', { rough: 0.8 }), inM = E.mat('#151416', { rough: 0.9 });
      vbox(0.4, 3.6, 16, -6.8, 1.8, 0); vbox(14, 3.6, 0.4, 0, 1.8, -7.8); vbox(14, 3.6, 0.4, 0, 1.8, 7.8);
      vbox(0.4, 3.6, 4.5, 6.8, 1.8, -5.75); vbox(0.4, 3.6, 4.5, 6.8, 1.8, 5.75);
      vbox(13.2, 3.3, 0.06, 0, 1.65, -7.57, inM); vbox(13.2, 3.3, 0.06, 0, 1.65, 7.57, inM); vbox(0.06, 3.3, 15.2, -6.57, 1.65, 0, inM);   // dark lining inside the venue
      vbox(14.5, 0.32, 16.5, 0, 3.45, 0, concM);                                                                   // floor slab, showing as a concrete band outside
      for (const [z, hex] of [[-6.6, '#b3161d'], [-5.3, '#d8d2c0'], [5.3, '#2a6a8a'], [6.6, '#d8a02a']]) { const ps = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.35), new THREE.MeshBasicMaterial({ color: hex })); ps.position.set(7.02, 1.75, z); ps.rotation.y = Math.PI / 2; V.add(ps); }   // posters
      vbox(3.4, 0.75, 16, 0, 3.98, 0, E.mat('#4a443c', { rough: 1 }));                                               // track bed
      for (const x of [-0.72, 0.72]) vbox(0.08, 0.1, 16, x, 4.4, 0, steelM);                                         // rails
      vbox(5.0, 1.2, 16, 4.2, 4.2, 0, concM); vbox(4.9, 1.2, 16, -4.15, 4.2, 0, concM);                              // platforms (top at 4.8)
      { const edge = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 16), new THREE.MeshBasicMaterial({ color: '#c9a52e' })); edge.position.set(2.0, 4.81, 0); V.add(edge); }
      vbox(0.4, 4.2, 16, -6.8, 5.7, 0);                                                                              // back wall of the station
      for (const z of [-5.4, -1.8, 1.8, 5.4]) { const wn = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.3), new THREE.MeshBasicMaterial({ color: '#ffd9a0' })); wn.position.set(-6.58, 6.3, z); wn.rotation.y = Math.PI / 2; V.add(wn); }
      vbox(10, 4.2, 0.4, -2, 5.7, 7.8); vbox(1, 4.2, 0.4, 6.5, 5.7, 7.8); vbox(3, 0.6, 0.4, 4.5, 7.5, 7.8);         // end wall with a doorway to the stairs
      vbox(0.1, 1.1, 16, 6.75, 5.35, 0, steelM); vbox(4.9, 1.1, 0.1, 4.2, 5.35, -7.9, steelM);                       // railings
      for (const z of [-7, -3.5, 0, 3.5, 7]) { vbox(0.18, 3.3, 0.18, 6.55, 6.45, z, steelM); vbox(0.18, 3.3, 0.18, 1.75, 6.45, z, steelM).visible = z !== 0; }
      vbox(14.8, 0.16, 16.8, 0, 8.18, 0, roofM); vbox(14.8, 0.4, 0.12, 0, 7.95, -8.4, steelM); vbox(0.12, 0.4, 16.8, 7.4, 7.95, 0, steelM);   // canopy
      for (const z of [-5, 0, 5]) { const lp = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 1.6), new THREE.MeshBasicMaterial({ color: '#fff0c8' })); lp.position.set(4.2, 8.05, z); V.add(lp); }
      vbox(2.6, 1.0, 0.35, 0, 4.85, 6.9, E.mat('#a3181e'));                                                          // buffer stop
      { const sg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 2.6), E.mat('#e9e6dc')), st = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 2.6), new THREE.MeshBasicMaterial({ color: '#b3161d' })); sg.position.set(6.6, 7.2, -5); st.position.set(6.6, 7.2, -5); V.add(sg, st); }   // station sign: a plain board with a red stripe
      // stairs up the end wall to the platform
      for (let k = 0; k < 16; k++) vbox(0.5625, 0.3 * (k + 1), 2.6, -6.4 + 0.5625 * (k + 0.5), 0.15 * (k + 1), 9.3, concM);
      vbox(4.3, 4.8, 2.6, 4.75, 2.4, 9.3, wallM);
      { const rail = vbox(10.3, 0.08, 0.08, -1.9, 3.5, 10.55, steelM); rail.rotation.z = Math.atan2(4.8, 9); vbox(4.3, 0.08, 0.08, 4.75, 5.9, 10.55, steelM); vbox(0.08, 0.08, 2.6, 6.85, 5.9, 9.3, steelM);
        for (let k = 0; k <= 8; k++) vbox(0.06, 1.1, 0.06, -6.4 + k * 1.125, 0.6 * k + 0.55, 10.55, steelM);
        for (const x of [3.6, 4.75, 5.9, 6.85]) vbox(0.06, 1.1, 0.06, x, 5.35, 10.55, steelM); }
      const vfloor = E.plane(13.2, 15.2, E.mat('#2b2622', { rough: 0.65 })); vfloor.position.y = 0.05; V.add(vfloor); p.pick(vfloor);
      vbox(3.2, 0.7, 12, -4.9, 0.35, 0, stageM);                                                                  // stage
      for (const z of [-5.1, 5.1]) { vbox(0.95, 1.1, 0.95, -3.95, 1.25, z, gearM); vbox(0.85, 0.9, 0.85, -3.95, 2.25, z, gearM); } // PA stacks
      for (const z of [-2.2, 2.2]) vbox(0.45, 0.75, 0.9, -5.9, 1.08, z, gearM);                                   // amps
      { const kick = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.4, 16), gearM); kick.rotation.z = Math.PI / 2; kick.position.set(-5.5, 1.04, 0); V.add(kick);
        for (const [x, y, z, r] of [[-5.4, 1.45, -0.45, 0.2], [-5.4, 1.45, 0.45, 0.2], [-5.75, 1.2, 0.85, 0.26]]) { const tm = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.2, 12), gearM); tm.position.set(x, y, z); V.add(tm); }
        for (const z of [-0.95, 1.2]) { const cy = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.015, 14), E.mat('#8a7440', { metal: 0.8, rough: 0.35 })); cy.position.set(-5.5, 1.75, z); V.add(cy); }
        const mic = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 6), gearM); mic.position.set(-3.7, 1.45, 0); V.add(mic); }
      vbox(0.12, 0.12, 12.4, -3.6, 3.18, 0, gearM);                                                               // lighting truss
      const live = SW.CONFIG.live || { date: '', place: '' };
      const poster = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 2.5), new THREE.MeshBasicMaterial({ map: E.textTex(`NEXT LIVE\n${live.date}  ${live.place}`, { w: 1024, h: 344, color: '#d8d2c0', color2: '#e0262d', font: '400 92px "Special Elite","Courier New",monospace', font2: '400 118px "Special Elite","Courier New",monospace' }), transparent: true }));
      poster.position.set(-6.55, 2.05, 0); poster.rotation.y = Math.PI / 2; V.add(poster);
      const beams = [], cols = ['#ff2a6a', '#2ad4ff', '#ffb02a', '#b36bff', '#2ad4ff', '#ff2a6a'];
      cols.forEach((hex, i) => {
        const z = -5 + i * 2, can = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.26, 10), gearM); can.position.set(-3.6, 3.0, z); V.add(can);
        const m = vglow(hex, 0.16), beam = new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.3, 14, 1, true), m); beam.position.set(-4.2, 1.85, z); beam.rotation.z = 0.25; V.add(beam);
        beams.push({ m, beam, s: i * 1.3 });
      });
      // stage wash: coloured light on the floor and stage, faked with additive planes (real lights would cost every pixel in the world)
      const wash = [['#ff2a6a', -3], ['#2ad4ff', 3]].map(([hex, z]) => { const m = vglow(hex, 0.05), w1 = new THREE.Mesh(new THREE.PlaneGeometry(9, 6.5), m); w1.rotation.x = -Math.PI / 2; w1.position.set(-1.6, 0.09, z); const w2 = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 6), m); w2.rotation.x = -Math.PI / 2; w2.position.set(-4.9, 0.72, z); V.add(w1, w2); return m; });
      // The crowd: eighteen people in everyday clothes, each dressed from the shared decks (E.npc in game.js: the head and
      // hair, something on the head, a bag, a long-sleeved top, the layer that peeks out under it, trousers, shoes), so no
      // two look alike; each moves to the music in its own way.
      // Which crowd gets drawn is decided as each frame is drawn (the renderer calls a THREE.LOD's update(camera) before it
      // culls; this one looks at where the camera is, not only how far). The room is shut on three sides and under the
      // station floor, so from outside it shows only through the doorway: in the room, or in front of the door within 40 m
      // of the room's middle (33 m of the door; less the more side-on you look in, as less of the room shows, so the plaza,
      // 36 m off at 53 degrees and behind the pool hall, gets the far figures), the dressed crowd, ~90k triangles; in front
      // of it out to 110 m, eighteen plain figures in their clothes' colours, one draw call; anywhere else, nothing.
      const crowd = [], cr = E.rng(909), crowdLOD = new THREE.LOD(), crowdG = new THREE.Group(), farG = new THREE.Group(), farParts = [], eye = new THREE.Vector3();
      crowdLOD.add(crowdG, farG); V.add(crowdLOD);
      crowdLOD.update = (cam) => { const c = V.worldToLocal(eye.setFromMatrixPosition(cam.matrixWorld)), d = Math.hypot(c.x, c.z), inside = Math.abs(c.x) < 6.8 && Math.abs(c.z) < 7.8 && c.y < 3.4, door = c.x > 6.6;
        crowdG.visible = inside || (door && d < 40 * Math.min(1, Math.max(0.5, (1.4 * c.x) / d))); farG.visible = !crowdG.visible && door && d < 110; };
      {
        const K = E.swag, wr = E.rng(4410);
        const lightG = new THREE.PlaneGeometry(0.08, 0.14), lightM = new THREE.MeshBasicMaterial({ color: '#dfeaff', side: THREE.DoubleSide });
        for (let i = 0; i < 60 && crowd.length < 18; i++) {
          const x = -1.9 + cr() * 5.6, z = -5.6 + cr() * 11.2;
          if (Math.abs(z) < 1.4 && x < 0.6) continue;                                          // keep the spot in front of the stage free
          if (crowd.some((c) => Math.hypot(c.f.position.x - x, c.f.position.z - z) < 0.65)) continue;   // and nobody standing inside somebody else
          const d = E.npc.dress(wr), { f, up, head, arms } = d;
          const style = Math.floor(cr() * 4);                                                   // 0 pumping one fist, 1 both hands up, 2 filming with a phone, 3 swaying
          if (style === 2) { const ph = new THREE.Mesh(lightG, lightM); ph.position.set(0, -0.68, 0.03); ph.rotation.y = Math.PI; arms[1].add(ph); ph.userData.keep = true; }
          f.position.set(x, 0.05, z); f.rotation.y = -Math.PI / 2 + (cr() - 0.5) * 0.5;          // facing the stage
          f.scale.setScalar(0.9 + cr() * 0.2); crowdG.add(K.compact(f)); f.userData.look = d.look;
          { f.updateMatrix(); farParts.push([E.npc.bake(d.look), f.matrix.clone()]); }   // the far figure: the same outfit, plain
          crowd.push({ f, up, head, arms, style, s: cr() * 6.28, e: 0.6 + cr() * 0.7, jump: 0 });
          p.addCircle(BX + x, CZ + z, 0.3, -1e9, 3);
        }
        const farM = E.mat('#ffffff', { rough: 0.85 }, true); farM.vertexColors = true; farG.add(new THREE.Mesh(K.mergeGeos(farParts), farM)); farParts.forEach(([g]) => g.dispose());
      }
      // open entrance: lit frame, marquee, light spilling onto the ground outside
      const neon = new THREE.MeshBasicMaterial({ color: '#ff3a44' });
      for (const [w, h, d, y, z] of [[0.08, 0.08, 7.2, 3.58, 0], [0.08, 3.55, 0.08, 1.8, -3.55], [0.08, 3.55, 0.08, 1.8, 3.55]]) { const n = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), neon); n.position.set(7.04, y, z); V.add(n); }
      const marquee = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.3), new THREE.MeshBasicMaterial({ map: E.textTex(`LIVE  ${live.date}  ${live.place}`, { w: 1024, h: 208, color: '#f2e9d2', bg: '#16090a', font: '400 78px "Special Elite","Courier New",monospace' }) }));
      marquee.position.set(7.03, 4.55, 0); marquee.rotation.y = Math.PI / 2; V.add(marquee);
      const spill = new THREE.Mesh(new THREE.PlaneGeometry(9, 8), vglow('#ff6a5a', 0.1)); spill.rotation.x = -Math.PI / 2; spill.position.set(10.5, 0.06, 0); V.add(spill);
      VB.flush();
      p.addBox(BX - 6.8, CZ, 0.35, 8); p.addBox(BX, CZ - 7.8, 7, 0.35);
      p.addBox(BX, CZ + 7.8, 7, 0.35, -1e9, 3); p.addBox(BX - 2, CZ + 7.8, 5, 0.35, 3, 1e9); p.addBox(BX + 6.5, CZ + 7.8, 0.5, 0.35, 3, 1e9);   // end wall: solid below, a doorway upstairs
      p.addBox(BX + 6.8, CZ - 5.75, 0.35, 2.25); p.addBox(BX + 6.8, CZ + 5.75, 0.35, 2.25); p.addBox(BX - 4.9, CZ, 1.7, 6.1, -1e9, 3);
      p.addBox(BX + 6.8, CZ, 0.2, 3.5, 3, 1e9); p.addBox(BX + 1.5, CZ, 0.15, 8, 3, 1e9);                            // upstairs: railing over the entrance, platform edge
      p.addBox(BX + 0.2, CZ + 10.65, 6.7, 0.1); p.addBox(BX + 6.95, CZ + 9.3, 0.1, 1.4);                            // stair rails
      p.ground = (lx, lz, y) => {
        const vx = lx - BX, vz = lz - CZ;
        if (vz > 8 && vz < 10.6) { if (vx >= -6.4 && vx <= 2.6) return (4.8 * (vx + 6.4)) / 9; if (vx > 2.6 && vx < 6.9) return 4.8; }
        if (Math.abs(vz) <= 8 && vx > 1.55 && vx < 6.9 && y > 3) return 4.8;
        return 0;
      };
      p.info(BX - 2.3, CZ, 2.6, 2.5, [`NEXT LIVE\n${live.date}  ${live.place}`]);
      const venueUpd = (t, f, dt) => {
        beams.forEach((b) => { b.m.opacity = 0.08 + f.pulse * 0.22 + 0.05 * Math.sin(t * 2 + b.s); b.beam.rotation.x = Math.sin(t * 0.8 + b.s) * 0.25; });
        wash[0].opacity = 0.035 + f.pulse * 0.1; wash[1].opacity = 0.035 + f.high * 0.12;
        const en = 0.45 + f.level * 1.6;                                                        // how hard the room is going
        farG.position.y = f.pulse * 0.06;                                                      // from afar the room just bounces
        if (crowdG.visible) crowd.forEach((c) => {
          const k = en * c.e, ph = t * 3.4 + c.s, bounce = Math.abs(Math.sin(ph));
          if (f.beat && f.bass > 0.6 && Math.sin(c.s * 7 + f.beats) > 0.2) c.jump = 1;           // some of them jump on the big hits
          c.jump *= Math.exp(-dt * 5);
          c.f.position.y = 0.05 + bounce * 0.07 * k + f.pulse * 0.07 * c.e + Math.sin(Math.min(1, 1 - c.jump) * Math.PI) * 0.22 * (c.jump > 0.02 ? 1 : 0);
          c.up.rotation.z = Math.sin(ph * 0.5) * 0.09 * k; c.up.rotation.y = Math.sin(ph * 0.5 + 1) * 0.16 * k; c.up.rotation.x = 0.05 + f.pulse * 0.07;
          c.head.rotation.x = Math.min(0.5, bounce * 0.28 * k);
          const [L, R] = c.arms;
          if (c.style === 0) { R.rotation.x = -2.5 + Math.sin(ph * 2) * 0.5 * k; R.rotation.z = 0.15; L.rotation.x = -0.25 - bounce * 0.3 * k; L.rotation.z = -0.12; }
          else if (c.style === 1) { L.rotation.x = -2.7 + Math.sin(ph) * 0.3 * k; R.rotation.x = -2.7 + Math.sin(ph + 1.2) * 0.3 * k; L.rotation.z = -0.35 - Math.sin(ph) * 0.2; R.rotation.z = 0.35 + Math.sin(ph) * 0.2; }   // z turns first, in the hanging-arm frame: negative on the left is outward
          else if (c.style === 2) { R.rotation.x = -2.2 + Math.sin(t * 0.9 + c.s) * 0.06; R.rotation.z = 0.1; L.rotation.x = -0.2 - bounce * 0.25 * k; L.rotation.z = -0.12; }
          else { L.rotation.x = Math.sin(ph) * 0.5 * k - 0.2; R.rotation.x = -Math.sin(ph) * 0.5 * k - 0.2; L.rotation.z = -0.15; R.rotation.z = 0.15; }
        });
      };
      p.addBox(BX, RZ + 26, 2.6, 9);

      // Train
      const train = new THREE.Group(), doors = [];
      const bodyM = E.mat('#e8e2d2'), stripeM = E.mat('#f07a32'), winM = new THREE.MeshBasicMaterial({ color: '#ffe2a6' });
      for (let k = 0; k < 6; k++) {
        const car = new THREE.Group();
        const b = new THREE.Mesh(new THREE.BoxGeometry(2.7, 2.9, 12.6), bodyM); b.position.y = 1.45; b.castShadow = true;
        const s = new THREE.Mesh(new THREE.BoxGeometry(2.74, 0.35, 12.6), stripeM); s.position.y = 0.7;
        const w = new THREE.Mesh(new THREE.BoxGeometry(2.76, 0.7, 11), winM); w.position.y = 1.9;
        car.add(b, s, w);
        if (k === 0) for (const z of [-3, 3]) { const op = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.0), new THREE.MeshBasicMaterial({ color: '#ffe9bd' })); op.position.set(1.39, 1.45, z); op.rotation.y = Math.PI / 2; const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.0, 1.3), bodyM); leaf.position.set(1.4, 1.45, z); car.add(op, leaf); doors.push(leaf); }
        car.position.z = -k * 13;
        car.children.forEach((o) => { o.position.y += 0.5; });   // the body rides on its bogies, its floor level with the platform
        for (const bz of [-4.6, 4.6]) {   // two bogies a car: a dark frame and four small wheels on the rails (wheel tops under the body)
          const fr = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.28, 2.6), E.mat('#1c1d20', { metal: 0.4, rough: 0.6 })); fr.position.set(0, 0.36, bz); car.add(fr);
          for (const wx of [-0.72, 0.72]) for (const wz of [-0.85, 0.85]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.1, 12), E.mat('#2a2a2c', { metal: 0.6, rough: 0.4 })); wh.rotation.z = Math.PI / 2; wh.position.set(wx, 0.35, bz + wz); car.add(wh); }
        }
        train.add(car);
      }
      train.position.set(BX, 4.35, -230);
      train.visible = false;
      g.add(train);

      // Setting sun and the far skyline (its heights follow the spectrum)
      const sun = new THREE.Mesh(new THREE.CircleGeometry(10, 40), new THREE.MeshBasicMaterial({ color: '#ffc27a', fog: false }));
      sun.position.set(14, 5, -185);
      g.add(sun);
      const halo = new THREE.Mesh(new THREE.CircleGeometry(26, 40), new THREE.MeshBasicMaterial({ color: '#ff8a4a', transparent: true, opacity: 0.25, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.position.set(14, 5, -186);
      g.add(halo);
      // The far bank is a small port town: a stone quay with bollards and moored boats, red-brick warehouses, a crane
      // and stacked containers, a white lighthouse where the river runs on towards the sea, and a row of narrow houses
      // with lit windows behind. Everything is solid. The ring road and its junction fly over this bank, so nothing
      // under a deck grows taller than the clearance it leaves. The windows brighten with the mids, the crane and the
      // lighthouse blink on the beat, and the boats ride the swell.
      const city = [], port = { boats: [], blinks: [], feet: [] };
      const cityM = E.mat('#3a2c2a', { emissiveMap: E.tex('windows', 1, 2), emissive: '#ffcf8a', emissiveIntensity: 0.6, rough: 0.85 });
      {
        const PB = E.batch(g), pb = PB.box, pr = E.rng(2323);
        const roads = (E.ring && E.ring.roads) || [];
        const roof = (lx, lz, r0) => {   // how tall a thing here may stand: under a deck, a little below it
          const w = p.toWorld(lx, lz); let lim = 1e9;
          for (const Q of roads) for (let k = 0; k < Q.N; k += 1) { const d = Math.hypot(Q.X[k] - w.x, Q.Z[k] - w.z); if (d < Q.HW[k] + r0 + 1.5) lim = Math.min(lim, Q.Y[k] - 2.6); }
          return lim;
        };
        const prism = (w, rise, d) => { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, rise); s.lineTo(-w / 2, 0); const geo = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); geo.translate(0, 0, -d / 2); return geo; };
        const brick = E.mat('#8a4a36', { map: E.tex('brick', 3, 2), rough: 0.9 }), stone = E.mat('#8f8a80', { map: E.tex('concrete', 6, 1), rough: 0.95 }), slateR = E.mat('#3a3d42', { rough: 0.7, metal: 0.2 });
        const iron = E.mat('#22252a', { metal: 0.6, rough: 0.5 }), white = E.mat('#e8e4da', { rough: 0.6 }), red = E.mat('#b8402e', { rough: 0.6 });
        const lit = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd49a').convertSRGBToLinear() }); lit.userData.lin = true;
        const FZ = RZ - RW / 2;   // the far bank's edge
        // quay: a stone apron with a granite edge, bollards and lamps (a gap where the railway bridge lands)
        for (const [x0, x1] of [[-50, BX - 3.2], [BX + 3.2, 50]]) {
          const L = x1 - x0, xm = (x0 + x1) / 2;
          pb(L, 0.24, 7, xm, 0, FZ - 3.6, stone); pb(L, 0.3, 0.5, xm, 0.15, FZ - 0.3, white);   // low enough to walk over
          for (let x = x0 + 2; x < x1 - 1; x += 6) { pb(0.32, 0.55, 0.32, x, 0.39, FZ - 0.8, iron); pb(0.42, 0.08, 0.42, x, 0.68, FZ - 0.8, iron); p.addCircle(x, FZ - 0.8, 0.25); }
          for (let x = x0 + 5; x < x1 - 2; x += 14) { pb(0.12, 4.2, 0.12, x, 2.55, FZ - 6.4, iron); pb(0.5, 0.3, 0.35, x, 4.7, FZ - 6.1, lit, false); }
        }
        // boats at their moorings: hulls, a wheelhouse, a mast with a lamp
        [[-40, 0], [-6, 1], [12, 0], [33, 2]].forEach(([x, k]) => {
          const b = new THREE.Group(), hullC = ['#2e5c7a', '#b8402e', '#e8e4da'][k % 3];
          const hull = new THREE.Mesh(new THREE.BoxGeometry(7, 1.2, 2.4), E.mat(hullC, { rough: 0.6 })); hull.position.y = 0.3; b.add(hull);
          const bow = new THREE.Mesh(prism(2.4, 1.6, 1.2), E.mat(hullC, { rough: 0.6 })); bow.rotation.set(0, Math.PI / 2, -Math.PI / 2); bow.position.set(3.5, 0.9, 0); b.add(bow);
          const deck = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.08, 2.2), E.mat('#7a6a52', { rough: 0.9 })); deck.position.y = 0.92; b.add(deck);
          const wh = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 1.8), white); wh.position.set(-1.2, 1.75, 0); b.add(wh);
          const wg = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.5, 1.4), lit); wg.position.set(-1.2, 2.1, 0); b.add(wg);
          const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 4, 6), iron); mast.position.set(1, 3, 0); b.add(mast);
          const ml = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), lit); ml.position.set(1, 5, 0); b.add(ml);
          b.traverse((m) => { if (m.isMesh) m.castShadow = true; });
          b.position.set(x, 0, FZ + 1.9); g.add(b); port.boats.push({ b, s: x * 0.37 });
          p.addBox(x + 0.4, FZ + 1.9, 4, 1.3);
        });
        // red-brick warehouses with gabled slate roofs, big doors to the quay, a number painted on each
        const shed = (x, z, w, d, h0, n) => {
          const h = Math.min(h0, roof(x, z, Math.max(w, d) / 2) - 1.8); if (h < 4) return;
          pb(w, h, d, x, h / 2, z, brick); pb(w + 0.3, 0.35, d + 0.3, x, h, z, stone);
          const rf = new THREE.Mesh(prism(d + 0.6, 1.8, w + 0.4), slateR); rf.rotation.y = Math.PI / 2; rf.position.set(x, h + 0.15, z); rf.castShadow = true; g.add(rf);
          for (let k = 0; k < Math.floor(w / 5); k++) { const dx = x - w / 2 + 2.5 + k * 5; pb(3, Math.min(4, h - 1.2), 0.1, dx, Math.min(4, h - 1.2) / 2, z + d / 2 + 0.02, iron, false); for (const y of [h - 1.4]) pb(1.2, 1.0, 0.08, dx, y, z + d / 2 + 0.02, pr() < 0.6 ? lit : iron, false); }
          const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.9), new THREE.MeshBasicMaterial({ map: E.textTex(`${n}号倉庫`, { w: 512, h: 128, color: '#f2ead8', font: '700 76px "Noto Serif JP",serif' }), transparent: true }));
          sign.position.set(x, Math.min(h - 0.5, 5.2), z + d / 2 + 0.07); g.add(sign);
          p.addBox(x, z, w / 2 + 0.1, d / 2 + 0.1);
        };
        shed(-36, FZ - 14, 18, 9, 9, 1); shed(-14 + 33, FZ - 14, 10, 8, 8, 2); shed(33, FZ - 14, 10, 8, 8, 3);
        // the middle is open: a square runs from the quay straight back through the town, so the street meets the water
        { const SQX = 3, sqM = E.mat('#a69c8c', { map: E.tex('paving', 4, 8), rough: 0.9 });
          const sq = E.plane(14, 54, sqM); sq.position.set(SQX, 0.05, FZ - 31); g.add(sq); p.pick(sq);
          const clock = new THREE.Group(); clock.position.set(SQX, 0, FZ - 16); g.add(clock);
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 4.2, 8), iron); post.position.y = 2.1; clock.add(post);
          const face = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.18, 20), white); face.rotation.x = Math.PI / 2; face.position.y = 4.3; clock.add(face);
          for (const sd of [-1, 1]) { const hand = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.34, 0.02), iron); hand.position.set(0, 4.42, sd * 0.1); hand.rotation.z = sd * 0.9; clock.add(hand); }
          p.addCircle(SQX, FZ - 16, 0.3);
          for (const [x, z, ry] of [[SQX - 5, FZ - 15, Math.PI / 2], [SQX + 5, FZ - 15, -Math.PI / 2], [SQX - 5, FZ - 40, Math.PI / 2], [SQX + 5, FZ - 40, -Math.PI / 2]]) { E.bench(g, x, z, ry); p.addBox(x, z, 0.4, 1.2); }
          for (const [x, z] of [[SQX - 6, FZ - 33], [SQX + 6, FZ - 33], [SQX - 6, FZ - 48], [SQX + 6, FZ - 48]]) { const tr = new THREE.Mesh(new THREE.SphereGeometry(1.3, 9, 7), E.mat('#5a7a44', { flat: true })); tr.position.set(x, 2.8, z); tr.scale.y = 1.2; tr.castShadow = true; g.add(tr); const tk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 2, 6), E.mat('#5a4030')); tk.position.set(x, 1, z); g.add(tk); p.addCircle(x, z, 0.3); }
          port.square = { x0: SQX - 7, x1: SQX + 7 }; }
        // a dock crane and stacks of containers (where there is sky above)
        const cranes = [[42, FZ - 6], [-8, FZ - 6]].filter(([x, z]) => roof(x, z, 6) > 30 && Math.abs(x - 3) > 9);
        cranes.slice(0, 1).forEach(([x, z]) => {
          for (const [a, c] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) pb(0.45, 16, 0.45, x + a, 8, z + c, red);
          pb(5, 0.8, 5, x, 16.3, z, red); pb(1.2, 0.8, 26, x, 17, z + 4, red); pb(2.6, 2.2, 2.4, x, 15, z - 1.5, white);
          pb(0.06, 9, 0.06, x, 12.5, z + 11, iron, false); pb(2.4, 0.3, 1.2, x, 8, z + 11, iron);
          const bl = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff3a2a' })); bl.position.set(x, 17.7, z + 16.5); g.add(bl); port.blinks.push(bl);
          p.addCircle(x - 2.2, z - 2.2, 0.4); p.addCircle(x + 2.2, z - 2.2, 0.4); p.addCircle(x - 2.2, z + 2.2, 0.4); p.addCircle(x + 2.2, z + 2.2, 0.4);
        });
        const boxC = ['#2e5c7a', '#b8402e', '#d9a53a', '#3f7a52', '#7a3f6a', '#c8c4b8'].map((c) => E.mat(c, { rough: 0.7, metal: 0.2 }));
        [[44, FZ - 13.5]].forEach(([cx, cz]) => {   // a stack of containers at the east end of the quay
          const lim = roof(cx, cz, 7);
          for (let i = 0; i < 3; i++) for (let lv = 0; lv < 3; lv++) { if ((lv + 1) * 2.6 > lim || pr() < lv * 0.3) continue; pb(2.4, 2.55, 6, cx - 2.45 + i * 2.45, 1.3 + lv * 2.6, cz, boxC[Math.floor(pr() * boxC.length)]); }
          p.addBox(cx, cz, 3.8, 3.1);
        });
        // the lighthouse at the end of the quay, where the river heads for the sea
        { const x = 47, z = FZ - 2.2, H = Math.min(14, roof(x, z, 2) - 1);
          if (H > 6) { const tw = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.5, H, 16), white); tw.position.set(x, H / 2, z); tw.castShadow = true; g.add(tw);
            for (const y of [H * 0.3, H * 0.62]) pb(3.05 - y / H, 0.9, 3.05 - y / H, x, y, z, red, false);
            pb(2.6, 0.2, 2.6, x, H + 0.1, z, iron); const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.1, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2c8').convertSRGBToLinear().multiplyScalar(1.5) })); lamp.position.set(x, H + 0.8, z); g.add(lamp);
            const cap = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.0, 12), red); cap.position.set(x, H + 1.85, z); g.add(cap); port.blinks.push(lamp);
            p.addCircle(x, z, 1.6); } }
        // The town behind the warehouses, laid out like a real harbour town: a shopping street (港通り) running parallel to
        // the quay with shops on the ground floor, back-to-back rows of houses on a narrow alley behind it, a residential
        // back street with another row beyond, and two cross streets. To the east the town runs on to the beach: under
        // the ring road a car park between its piers, then beach houses facing the sea along a promenade above the sand.
        // Utility poles and wires, street lamps, vending machines, bicycles, balconies with washing and AC units.
        const walls = ['#d9c7a8', '#b9cbbf', '#e0b9a0', '#a9bccb', '#d8d0bc', '#c9a98f', '#ece6da', '#9fa7a8'].map((c) => E.mat(c, { rough: 0.9 }));
        const tiles = [E.mat('#4a3a34', { rough: 0.7 }), E.mat('#3a4048', { rough: 0.7 }), E.mat('#7a3a2a', { rough: 0.7 }), E.mat('#2f4a5a', { rough: 0.6, metal: 0.2 })];
        const wood = E.mat('#8a6a4a', { rough: 0.85 }), glassD = E.mat('#2a3038', { rough: 0.25, metal: 0.4 }), acM = E.mat('#e4e2dc', { rough: 0.6 });
        const roadM = (rx, ry) => E.mat('#34323a', { map: E.tex('asphalt', rx, ry), rough: 0.9 }), walkM = (rx, ry) => E.mat('#a49c8e', { map: E.tex('paving', rx, ry), rough: 0.9 });
        const lineM = E.mat('#e8e4da', { rough: 0.6 });
        const flat = (w, d, x, z, m, y = 0.05, yaw = 0) => { const pl = E.plane(w, d, m); pl.position.set(0, 0, 0); const holder = new THREE.Group(); holder.position.set(x, y, z); holder.rotation.y = yaw; holder.add(pl); g.add(holder); p.pick(pl); return holder; };
        // the coast: the beach's landward edge runs from C0 south-west; s is the distance inland from it, t along it
        const C0 = [86, -50], U = [-0.655, -0.756], N = [-0.756, 0.655];
        const sOf = (x, z) => (x - C0[0]) * N[0] + (z - C0[1]) * N[1], atST = (t, s) => [C0[0] + U[0] * t + N[0] * s, C0[1] + U[1] * t + N[1] * s];
        const SEA_YAW = Math.atan2(-N[0], -N[1]);   // a building whose front (+z) looks out to sea
        // where the ring road's piers stand (every 8th point along each deck), so nothing is built on one
        const pierPts = [];
        const RG = roads[0]; for (const Q of roads) for (let i = 3; i < Q.N; i += 8) { if (Q !== RG && Q.avoidRing && RG) { let b = 1e9; for (let k = 0; k < RG.N; k += 2) b = Math.min(b, Math.hypot(RG.X[k] - Q.X[i], RG.Z[k] - Q.Z[i])); if (b < RG.HW[0] + 3) continue; } const l = p.local(Q.X[i], Q.Z[i]); pierPts.push([l.x, l.z]); if (Q.stack) for (const sd of [-1, 1]) { const ll = p.local(Q.X[i] + Q.TZ[i] * sd * 6, Q.Z[i] - Q.TX[i] * sd * 6); pierPts.push([ll.x, ll.z]); } }
        const SHOPS = ['魚屋 丸八', '喫茶 みなと', '酒 さかや', '薬 くすり', '理容 ナミ', '食堂 かもめ', '雑貨 しおさい', '本 古書店', 'パン 灯台', '八百屋', '寿司 浜', 'ラーメン 汐', '花 はな', '金物 タナカ', 'クリーニング', '時計 メガネ', '珈琲 錨', 'たばこ'];
        const AWN = ['#b8402e', '#2e5c7a', '#3f7a52', '#d9a53a', '#7a3f6a', '#2a2a2c', '#c86a2a'].map((c) => E.mat(c, { rough: 0.7 }));
        const shopLit = ['#ffd9a0', '#fff2d6', '#ffe1b0', '#d6ecff'].map((c) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(c).convertSRGBToLinear() }); m.userData.lin = true; return m; });
        let shopK = 0;
        // one building: centre (x, z), width w (along its front), depth d, front facing local +z turned by yaw
        const building = (x, z, w, d, yaw, kind) => {
          const lim = roof(x, z, Math.max(w, d) / 2);
          let fl = kind === 'beach' ? 1 + (pr() < 0.5 ? 1 : 0) : 2 + Math.floor(pr() * 2);
          let h = Math.min(fl * 3 + 0.4, lim - 2.4); if (h < 3.2) return false;
          fl = Math.max(1, Math.floor((h - 0.4) / 3)); h = fl * 3 + 0.4;
          const c = Math.cos(yaw), sn = Math.sin(yaw), at = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c];
          const box = (bw, bh, bd, lx, ly, lz, m, sh = true) => { const [wx, wz] = at(lx, lz); const o = pb(bw, bh, bd, wx, ly, wz, m, sh); o.rotation.y = yaw; return o; };
          const wallM = kind === 'beach' ? (pr() < 0.5 ? walls[6] : wood) : walls[Math.floor(pr() * walls.length)];
          box(w, h, d, 0, h / 2, 0, wallM);
          const gable = kind === 'house' || (kind === 'shop' && pr() < 0.35);
          if (gable) { const rf = new THREE.Mesh(prism(w + 0.5, 1.5, d + 0.6), tiles[Math.floor(pr() * tiles.length)]); rf.position.set(x, h, z); rf.rotation.y = yaw; rf.castShadow = true; g.add(rf); }
          else { box(w + 0.1, 0.5, d + 0.1, 0, h + 0.25, 0, walls[7]); box(w - 0.6, 0.05, d - 0.6, 0, h + 0.03, 0, iron, false); if (pr() < 0.4) box(1.2, 1.4, 1.2, w / 4, h + 0.7, -d / 4, acM); }   // a flat roof with a parapet, a water tank
          const fz = d / 2 + 0.03;
          // upper floors: windows front and back, a balcony with washing on some
          for (let f = kind === 'house' ? 0 : 1; f < fl; f++) {
            const cols = w > 5.4 ? [-w / 4, w / 4] : [0];
            for (const dx of cols) { box(1.2, 1.3, 0.06, dx, 1.7 + f * 3, fz, cityM, false); box(1.2, 1.3, 0.06, dx, 1.7 + f * 3, -fz, cityM, false); }
            if (f > 0 && pr() < 0.45) { box(w - 0.8, 0.12, 1.0, 0, 0.6 + f * 3, fz + 0.5, walls[7]); box(w - 0.8, 0.9, 0.05, 0, 1.05 + f * 3, fz + 1.0, iron, false);
              if (pr() < 0.6) { box(w - 1.2, 0.03, 0.03, 0, 2.2 + f * 3, fz + 0.6, iron, false); for (let k = 0; k < 3; k++) box(0.5, 0.6, 0.02, -w / 4 + k * (w / 4), 1.85 + f * 3, fz + 0.6, walls[Math.floor(pr() * 6)], false); } }
            if (pr() < 0.5) box(0.8, 0.55, 0.3, (pr() < 0.5 ? -1 : 1) * (w / 2 - 0.7), 0.9 + f * 3, fz + 0.15, acM);   // an air conditioner
          }
          if (kind === 'shop' || kind === 'beach') {   // the ground floor is a shop: lit glass, an awning, a sign
            box(w - 0.8, 2.2, 0.06, 0, 1.25, fz, shopLit[Math.floor(pr() * shopLit.length)], false);
            box(w - 0.4, 0.08, 1.4, 0, 2.75, fz + 0.7, AWN[Math.floor(pr() * AWN.length)]);
            const name = kind === 'beach' ? ['海の家 なぎさ', 'SURF SHOP', 'カフェ 波音', '民宿 しおかぜ', 'かき氷', 'BEACH BAR', '貸しボート', '浜焼き'][shopK++ % 8] : SHOPS[shopK++ % SHOPS.length];
            const sm = new THREE.MeshBasicMaterial({ map: E.textTex(name, { w: 512, h: 112, color: '#f6efe0', bg: ['#2a2420', '#1e2a32', '#3a1a16', '#203424'][shopK % 4], font: '700 60px "Noto Serif JP",serif' }) }); sm.userData.lin = true;
            const sg = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(3.4, w - 0.8), 0.72), sm); const [sx, sz] = at(0, fz + 0.04); sg.position.set(sx, 3.5, sz); sg.rotation.y = yaw; g.add(sg);
            if (kind === 'beach') { box(w, 0.2, 3.2, 0, 0.1, d / 2 + 1.6, wood); for (const sd of [-1, 1]) box(0.12, 2.6, 0.12, sd * (w / 2 - 0.3), 1.3, d / 2 + 3.0, wood); box(w, 0.1, 3.4, 0, 2.6, d / 2 + 1.6, AWN[Math.floor(pr() * AWN.length)]); }   // a wooden deck under a canopy
          } else box(1.0, 2.1, 0.08, w > 5.4 ? -w / 4 : w / 4 - 0.3, 1.05, fz, wood, false);   // the front door
          // its walls, turned with it (a box turned by the place's and the building's angle together): no wider than it is, so the
          // gaps between the beach houses stay open from the promenade to the car park behind
          { const bb = p.addBox(x, z, w / 2 + 0.05, d / 2 + 0.05); bb.c = Math.cos(p.rot + yaw); bb.s = Math.sin(p.rot + yaw); }
          if (kind === 'beach') for (const sd of [-1, 1]) { const [cx, cz] = at(sd * (w / 2 - 0.3), d / 2 + 3.0); p.addCircle(cx, cz, 0.12); }   // the canopy's posts
          city.push(1); port.feet.push({ x, z, w, d, yaw });
          return true;
        };
        // a row of buildings along x from x0 to x1, centred on z, facing +z (dir 1) or -z (dir -1); stops where the
        // coast's car park begins (s < sMin), at the railway, the square and the cross streets
        const MZ = -44, BZ = -72, XS = [-26, 24], SQ = port.square;
        const gapAt = (a, b) => (b > BX - 4.5 && a < BX + 4.5) || (b > SQ.x0 - 0.5 && a < SQ.x1 + 0.5) || XS.some((cx) => b > cx - 3.5 && a < cx + 3.5);
        const row = (x0, x1, z, d, dir, kind) => {
          while (x1 > x0 && (sOf(x1, z + d / 2) < 26 || sOf(x1, z - d / 2) < 26)) x1 -= 0.5;   // stop short of the car park under the ring road
          const cuts = [[BX - 4.5, BX + 4.5], [SQ.x0 - 0.5, SQ.x1 + 0.5], ...XS.map((cx) => [cx - 3.5, cx + 3.5])].sort((m, n) => m[0] - n[0]);
          const segs = []; let st = x0; for (const [c0, c1] of cuts) { if (c0 > st) segs.push([st, Math.min(c0, x1)]); st = Math.max(st, c1); } if (st < x1) segs.push([st, x1]);
          for (const [s0, s1] of segs) for (let x = s0 + 0.2; x < s1 - 4.2;) {   // fill the stretch with frontages that fit it exactly
            let w = (kind === 'shop' ? 4.6 : 5.2) + pr() * 2.4; if (s1 - (x + w) < 4.6) w = s1 - x - 0.2; if (w > 9.5) w = (s1 - x - 0.2) / 2;
            const a = x, b = x + w; x = b + (pr() < 0.12 ? 1.4 : 0.25);
            building((a + b) / 2, z, w, d, dir > 0 ? 0 : Math.PI, kind);
          }
        };
        row(-50, 60, MZ - 10, 8, 1, 'shop');     // 港通り, south side: shops
        row(-50, 60, MZ - 21, 8, -1, 'house');   // back to back across the alley, facing the back street
        row(-50, 60, BZ - 7, 8, 1, 'house');     // across the back street
        // streets: the shopping street (car-free across the square), the alley, the back street, the cross streets
        const sEnd = (z) => { for (let x = 40; x < 63; x += 0.5) if (sOf(x, z) < 15) return x; return 63; };   // where a street running east meets the car park
        { const e = sEnd(MZ);
          for (const [a, b] of [[-52, SQ.x0], [SQ.x1, e]]) { flat(b - a, 6, (a + b) / 2, MZ, roadM((b - a) / 12, 1), 0.04); for (let x = a + 2; x < b - 2; x += 5) flat(2.4, 0.14, x + 1.2, MZ, lineM, 0.05); }
          flat(e + 52, 2.6, (e - 52) / 2, MZ + 4.3, walkM((e + 52) / 3, 1), 0.06); flat(e + 52, 2.6, (e - 52) / 2, MZ - 4.3, walkM((e + 52) / 3, 1), 0.06);
          flat(110, 3, 5, MZ - 15.5, walkM(30, 1), 0.04);   // the alley
          const eb = sEnd(BZ); flat(eb + 52, 5, (eb - 52) / 2, BZ, roadM((eb + 52) / 12, 1), 0.04);
          for (const sd of [-1, 1]) flat(eb + 52, 0.12, (eb - 52) / 2, BZ + sd * 2.3, lineM, 0.05);   // white edge lines, no kerb: a back street
          for (const cx of XS) { flat(6, 44, cx, MZ - 20, roadM(1, 4), 0.045); }
          for (let k = -3; k <= 3; k++) for (const cx of XS) flat(0.5, 3, cx + k * 0.8, MZ - 5.4 + 1.2, lineM, 0.056);   // zebra where each crosses the shopping street
        }
        // under the ring road: a car park between the piers (painted bays, parked cars), the length of the coast
        { const [cx, cz] = atST(27, 21); flat(38, 13, cx, cz, walkM(12, 4), 0.045, SEA_YAW);
          const cars = []; for (let t = 9; t < 45; t += 2.6) for (const s of [17.5, 25]) { const [bx, bz] = atST(t, s); if (pierPts.some(([px, pz]) => Math.hypot(px - bx, pz - bz) < 2.4)) continue; const [lx0, lz0] = atST(t - 1.3, s); flat(0.1, 5, lx0, lz0, lineM, 0.055, SEA_YAW); if (SW.Cars && pr() < 0.45) cars.push([bx, bz, s]); }
          cars.slice(0, 9).forEach(([bx, bz, s], i) => { const car = SW.Cars.make(E, i + 3); car.position.set(bx, 0.03, bz); car.rotation.y = SEA_YAW + (s > 20 ? Math.PI : 0); g.add(car); const cb = p.addBox(bx, bz, 0.95, 2.2); cb.c = Math.cos(p.rot + SEA_YAW); cb.s = Math.sin(p.rot + SEA_YAW); }); }   // each car's own outline, turned with it
        // the promenade along the top of the beach, and beach houses facing the sea
        { const [cx, cz] = atST(24, 3.5); flat(36, 4, cx, cz, walkM(12, 1.4), 0.07, SEA_YAW);
          for (let t = 8; t < 40;) { const w = 6 + pr() * 3, tc = t + w / 2; t += w + 1.8; const [bx, bz] = atST(tc, 10.5);
            if (roof(bx, bz, 5) < 6.5) continue; building(bx, bz, w, 7, SEA_YAW, 'beach'); }
          for (let t = 8; t < 41; t += 7) { const [lx, lz] = atST(t, 1.8); pb(0.12, 4, 0.12, lx, 2, lz, iron); pb(0.4, 0.25, 0.4, lx, 4.05, lz, lit, false); p.addCircle(lx, lz, 0.15); }   // lamps along the sea wall
          for (let t = 6.5; t < 41.5; t += 1.6) { const [lx, lz] = atST(t, 1.3); const o = pb(1.6, 0.06, 0.06, lx, 0.95, lz, white, false); o.rotation.y = SEA_YAW; } }   // the rail along it
        // utility poles with wires along the shopping street and the back street, a lamp on every other one
        { const poleM = E.mat('#9a968c', { rough: 0.8 });
          for (const [z, x1] of [[MZ - 5.4, sEnd(MZ) - 2], [BZ - 2.9, sEnd(BZ) - 2]]) {
            let prev = null;
            for (let x = -48, k = 0; x < x1; x += 11, k++) {
              if (Math.abs(x - BX) < 3 || (x > SQ.x0 - 1 && x < SQ.x1 + 1) || XS.some((cx) => Math.abs(x - cx) < 3.5)) { prev = null; continue; }
              const top = Math.min(8.5, roof(x, z, 1) - 0.6); if (top < 5) { prev = null; continue; }
              pb(0.28, top, 0.28, x, top / 2, z, poleM); pb(1.6, 0.12, 0.12, x, top - 0.6, z, poleM); p.addCircle(x, z, 0.22);
              if (k % 2 === 0) { pb(0.08, 0.08, 1.2, x, top - 2.2, z + 0.6, iron, false); pb(0.45, 0.14, 0.3, x, top - 2.3, z + 1.2, lit, false); }
              if (prev && prev.top > 5) for (const dz of [-0.6, 0, 0.6]) { const L = x - prev.x, y = Math.min(top, prev.top) - 0.65; pb(L, 0.035, 0.035, (x + prev.x) / 2, y - 0.25, z + dz * 1.0, iron, false); }
              prev = { x, top };
            }
          } }
        // vending machines, bicycles and potted plants along the shopping street
        { const vm = new THREE.MeshBasicMaterial({ color: new THREE.Color('#e8f4ff').convertSRGBToLinear() }); vm.userData.lin = true;
          for (const x of [-44, -28, -10, 15, 31, 41]) { if (gapAt(x - 1, x + 1)) continue; pb(1.0, 1.85, 0.75, x, 0.95, MZ - 5.4 - 0.3, red); pb(0.8, 1.2, 0.04, x, 1.15, MZ - 5.4 + 0.1, vm, false); p.addBox(x, MZ - 5.7, 0.5, 0.4); }
          for (const x of [-40, -22, 12, 20, 36]) { if (gapAt(x - 1, x + 1)) continue; for (const k of [0, 1]) { const bx = x + k * 0.7; pb(0.05, 0.62, 0.62, bx, 0.35, MZ - 5.2, iron, false); pb(0.05, 0.05, 1.5, bx, 0.75, MZ - 5.2, iron, false); } }
          for (const x of [-46, -31, -6, 18, 28, 44]) { if (gapAt(x - 0.5, x + 0.5)) continue; pb(0.5, 0.45, 0.5, x, 0.27, MZ - 5.5, E.mat('#7a5a40', { rough: 0.9 })); const pl = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), E.mat('#4a7a3c', { flat: true })); pl.position.set(x, 0.85, MZ - 5.5); g.add(pl); } }
        // people out on the shopping street and the promenade
        { const NPp = 34, folk = E.npc.crowd(NPp, E.rng(8343), 9);   // dressed from the shared decks: nine outfits, each drawn once for all who wear it
          port.peds = []; port.folk = folk;
          for (let i = 0; i < NPp; i++) {
            const prom = i % 3 === 2, k = pr();
            const path = prom ? { a: atST(8, 4.2), b: atST(40, 4.2) } : (i % 2 ? { a: [-48, MZ + 4.3 + (pr() - 0.5)], b: [sEnd(MZ) - 3, MZ + 4.3 + (pr() - 0.5)] } : { a: [-48, MZ - 4.3 + (pr() - 0.5)], b: [sEnd(MZ) - 3, MZ - 4.3 + (pr() - 0.5)] });
            port.peds.push({ path, t: k, dir: pr() < 0.5 ? 1 : -1, v: (0.9 + pr() * 0.5) / Math.hypot(path.b[0] - path.a[0], path.b[1] - path.a[1]), ph: pr() * 6 });
          }
          g.add(folk.group); }
        port.coast = { sOf, atST };
        PB.flush();
      }

      E.bench(g, 2.6, -2, Math.PI);
      p.addBox(2.6, -2, 1.2, 0.4);

      p.grade = {
        top: '#3a2e62', bottom: '#ff9566', fog: '#e48a68', near: 20, far: 150,
        sun: '#ff9a5a', sunInt: 2.2, hemi: 0.55, sunDir: [0.1, 0.12, -1],
        tint: [1.1, 0.95, 0.88], expo: 1.0, sat: 1.1, stars: 0.1,
      };
      p.map = [{ t: 'rect', x: 0, z: RZ, w: 100, h: RW, c: '#3f6f9e' }, { t: 'rect', x: 0, z: RZ - RW / 2 - 33, w: 100, h: 62, c: '#4a4038' }, { t: 'rect', x: BX, z: RZ - 40, w: 4, h: 150, c: '#56604a' }];
      p.face = Math.PI;
      p.pathEnd = 4;
      p.clearR = 9;
      p.blocks = (lx, lz) => (lz < -4 && lz > -90 && lx > -54 && lx < 64) || (lz < -36 && lz > -84 && lx >= 64 && lx < 90 && port.coast && port.coast.sOf(lx, lz) > -2) || (Math.abs(lx - BX) < 10 && lz > -150 && lz < 56) || Math.hypot(lx, lz) < 8;
      // the ring road crosses the railway: no pier on the tracks, nor through a house in the port town
      p.noPier = (lx, lz) => Math.abs(lx - BX) < 5.5 || port.feet.some((f) => { const dx = lx - f.x, dz = lz - f.z, c = Math.cos(f.yaw), sn = Math.sin(f.yaw), u = dx * c - dz * sn, v = dx * sn + dz * c; return Math.abs(u) < f.w / 2 + 1.4 && Math.abs(v) < f.d / 2 + 1.4; });

      let trainT = 6, trainS = 'wait';
      const STOP = CZ - 0.6, shop = SW.CONFIG.shop || {};
      p.dock = () => { trainS = 'dwell'; trainT = 20; train.visible = true; train.position.z = STOP; };   // put the train at the platform now (used by tests)
      const board = p.interact({ kind: 'travel', lx: BX + 2.3, lz: STOP + 3, r: 2.3, mark: 7.3, y0: 3, off: true, url: shop.url, name: shop.name });
      p.update = (t, dt, f, v) => {
        venueUpd(t, f, dt);
        water.material.uniforms.t.value = t;
        water.material.uniforms.level.value += (f.level - water.material.uniforms.level.value) * Math.min(1, dt * 8);
        const sS = 1 + f.bass * 0.07;
        sun.scale.set(sS, sS, 1);
        halo.material.opacity = 0.18 + f.bass * 0.25;
        cityM.emissiveIntensity = 0.4 + f.mid * 1.2;
        port.boats.forEach((o) => { o.b.position.y = Math.sin(t * 1.1 + o.s) * 0.08 + f.bass * 0.06; o.b.rotation.z = Math.sin(t * 0.8 + o.s) * 0.03; o.b.rotation.x = Math.sin(t * 0.9 + o.s * 2) * 0.02; });
        if (port.peds) { const folk = port.folk, m4 = port.m4 || (port.m4 = new THREE.Matrix4()), q = port.q || (port.q = new THREE.Quaternion()), up = new THREE.Vector3(0, 1, 0), ps = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
          port.peds.forEach((o, i) => { o.t += o.dir * o.v * dt; if (o.t > 1) { o.t = 1; o.dir = -1; } else if (o.t < 0) { o.t = 0; o.dir = 1; }
            const { a, b } = o.path, x = a[0] + (b[0] - a[0]) * o.t, z = a[1] + (b[1] - a[1]) * o.t;
            m4.compose(ps.set(x, Math.abs(Math.sin(t * 6 + o.ph)) * 0.04, z), q.setFromAxisAngle(up, Math.atan2((b[0] - a[0]) * o.dir, (b[1] - a[1]) * o.dir)), sc); folk.set(i, m4); }); folk.done(); }
        port.blinks.forEach((m, i) => { m.visible = f.pulse > 0.35 || Math.sin(t * 2.4 + i * 2) > 0.2; });
        // The train comes out of the haze across the river and disappears into the tunnel.
        // The train comes over the bridge, stops at the platform above the live house with its doors open, then goes back.
        trainT -= dt;
        if (trainS === 'wait' && trainT <= 0) { trainS = 'in'; train.visible = true; train.position.z = -230; }
        else if (trainS === 'in') { const left = STOP - train.position.z; train.position.z += Math.min(left, dt * Math.min(24, Math.max(1.2, left * 0.7))); if (left < 0.02) { trainS = 'dwell'; trainT = 22; } }
        else if (trainS === 'dwell' && trainT <= 0) trainS = 'out';
        else if (trainS === 'out') { const gone = STOP - train.position.z; train.position.z -= dt * Math.min(24, 1.5 + gone * 0.7); if (train.position.z < -230) { trainS = 'wait'; train.visible = false; trainT = 6 + r() * 5; } }
        const open = trainS === 'dwell' && trainT > 1.5 && trainT < 21;
        doors.forEach((d) => (d.visible = !open));
        board.off = !(open && board.url);
      };
      p.shot = (t) => ({ pos: [8 + Math.sin(t * 0.07) * 3, 2.3, 3.5], look: [-10, 4, -40], roll: 0 });
    },
  };

  /* ------------------------------------------------------------------ */
  /* FLIP DA HOODS — night crossing with an upside-down city overhead    */
  /* ------------------------------------------------------------------ */
  PLACES.flip = {
    build(p, E) {
      const g = p.group, r = E.rng(37);
      const asphaltM = E.mat('#27242e', { map: E.tex('asphalt', 8, 8), rough: 0.9 });
      const ground = E.plane(60, 50, asphaltM);
      ground.position.set(0, 0.03, -8);
      g.add(ground); p.pick(ground);
      const zebraM = E.mat('#d9d4de');
      const stripes = new THREE.Group();
      for (let d = 0; d < 4; d++) {
        const arm = new THREE.Group();
        arm.rotation.y = (d * Math.PI) / 2;
        for (let k = -4; k <= 4; k++) {
          const s = E.plane(0.7, 4, zebraM);
          s.position.set(k * 1.3, 0.04, -9);
          arm.add(s);
        }
        arm.position.z = -8;
        stripes.add(arm);
      }
      g.add(stripes);

      const city = new THREE.Group();
      const neonCols = ['#4fff9a', '#3ff0ff', '#ffe14f', '#9b6bff', '#ff9a2a'];   // no pink
      const buildings = [];
      const spots = [];
      // Narrow back alleys between the blocks (4-5 m); on the east side the cross street at the crossing is a real street.
      for (const x of [-25, -13]) for (const z of [-30, -18, -6, 6]) spots.push([x, z]);
      for (const x of [13, 25]) for (const z of [-31, -20.5, -3.5, 7]) spots.push([x, z]);
      const kit = SW.Buildings.kit(E, 4), kr = E.rng(7404), CX = 0, CZ = -12, coreFeet = [];
      // The side that faces FIELD's brownstones turns into their kind of street: brick walk-ups, lower, the nearer they stand.
      const fieldSong = SW.SONGS.find((q) => q.scene === 'field'), fieldAt = fieldSong ? (() => { const f = SW.Ring.frame(fieldSong), a = f.toWorld(2, 13), b = f.toWorld(2, 45); return p.local((a.x + b.x) / 2, (a.z + b.z) / 2); })() : null;
      // FIELD's street and the row across it are FIELD's: no block of this one stands on them
      const fieldF = fieldSong ? SW.Ring.frame(fieldSong) : null;
      const inFieldStreet = (x, z, rad = 0) => { if (!fieldF) return false; for (const [ox, oz] of [[0, 0], [rad, rad], [-rad, rad], [rad, -rad], [-rad, -rad]]) { const w = p.toWorld(x + ox, z + oz), l = fieldF.local(w.x, w.z); if (l.x > -28 && l.x < 18 && l.z > 6 && l.z < 63) return true; } return false; };
      const fieldWard = (x, z) => (fieldAt ? 1 - Math.max(0, Math.min(1, (Math.hypot(x - fieldAt.x, z - fieldAt.z) - 22) / 34)) : 0);   // 1 next to the row, 0 far from it
      const nyStyle = (t, rr) => (t > 0.55 ? 2 : t > 0.2 ? (rr() < 0.5 ? 2 : 1) : undefined);   // the middle of the block: the tallest towers stand here
      spots.forEach(([x, z], i) => {
        if (inFieldStreet(x, z, 5)) return;
        const w = 6.5 + r() * 1.5, d = 6.5 + r() * 1.5, dc = Math.hypot(x - CX, z - CZ), h = 16 + 44 * Math.pow(Math.max(0, 1 - dc / 36), 1.3) + r() * 8;   // tall in the middle, lower towards the edges
        const ft = fieldWard(x, z), hh = h + (12 + r() * 5 - h) * Math.min(1, ft * 1.3);
        const b = kit.mesh(w, hh, d, kr, nyStyle(ft, kr), true), m = b.material[0];
        b.position.set(x + (r() - 0.5) * 0.6, 0, z + (r() - 0.5) * 0.6); coreFeet.push({ x: b.position.x, z: b.position.z, w, d });
        b.castShadow = true;
        city.add(b);
        p.addBox(b.position.x, b.position.z, w / 2 + 0.3, d / 2 + 0.3);
        const nc = new THREE.Color(neonCols[i % neonCols.length]).convertSRGBToLinear();
        const nm = new THREE.MeshBasicMaterial({ color: nc.clone() });
        nm.userData.lin = true;
        const face = Math.abs(x) > 1 ? -Math.sign(x) : 1;
        const sign = new THREE.Mesh(new THREE.BoxGeometry(0.35, Math.min(9, hh * 0.45), 1.4), nm); sign.visible = ft < 0.55;   // no neon on the brownstone side
        if (Math.abs(x) > 1) sign.position.set(b.position.x + face * (w / 2 + 0.25), hh * 0.55, b.position.z + d * 0.3);
        else sign.position.set(b.position.x, hh * 0.55, b.position.z + d / 2 + 0.25);
        if (Math.abs(x) <= 1) sign.rotation.y = Math.PI / 2;
        city.add(sign);
        buildings.push({ m, k: i % 24, nm, nc, seed: r() * 6 });
      });
      // Pavements: a raised slab of paving under each side of the avenue (buildings stand on it), and later, out in the
      // outskirts, an apron round every building and footpaths between them (see p.afterSpill).
      const paveM = E.mat('#8f8b83', { map: E.tex('paving', 1, 1), rough: 0.9 }), slabs = [];
      const slabMesh = (list) => {
        const pos = [], uv = [], T = 2.5, v = (x, y, z, u, w) => { pos.push(x, y, z); uv.push(u / T, w / T); };
        for (const s of list) {
          const c = Math.cos(s.rot || 0), sn = Math.sin(s.rot || 0), P = (ax, az) => [s.cx + ax * c + az * sn, s.cz - ax * sn + az * c];
          const q = [P(-s.hx, -s.hz), P(s.hx, -s.hz), P(s.hx, s.hz), P(-s.hx, s.hz)];
          v(q[0][0], s.top, q[0][1], q[0][0], q[0][1]); v(q[3][0], s.top, q[3][1], q[3][0], q[3][1]); v(q[2][0], s.top, q[2][1], q[2][0], q[2][1]);
          v(q[0][0], s.top, q[0][1], q[0][0], q[0][1]); v(q[2][0], s.top, q[2][1], q[2][0], q[2][1]); v(q[1][0], s.top, q[1][1], q[1][0], q[1][1]);
          for (let k = 0; k < 4; k++) {   // the kerb
            const a = q[k], b = q[(k + 1) % 4], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
            v(a[0], 0, a[1], 0, 0); v(b[0], 0, b[1], L, 0); v(b[0], s.top, b[1], L, s.top); v(a[0], 0, a[1], 0, 0); v(b[0], s.top, b[1], L, s.top); v(a[0], s.top, a[1], 0, s.top);
          }
        }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, paveM); m.receiveShadow = true; p.pick(m); return m;
      };
      for (const [side, half] of [[-1, 0], [1, -1], [1, 1]]) {   // the two sides of the avenue (the east one split by its cross street), and the far end
        const fs = coreFeet.filter((f) => (side < 0 ? f.x < -2 : f.x > 2) && f.z > -32 && (!half || (half < 0 ? f.z < -12 : f.z > -12))), M = 2.8;
        if (!fs.length) continue;
        const x0 = Math.min(...fs.map((f) => f.x - f.w / 2)) - M, x1 = Math.max(...fs.map((f) => f.x + f.w / 2)) + M, z0 = Math.min(...fs.map((f) => f.z - f.d / 2)) - M, z1 = Math.max(...fs.map((f) => f.z + f.d / 2)) + M;
        slabs.push({ cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, top: 0.15 });
      }
      if (coreFeet.some((f) => f.z <= -31)) { const fs = coreFeet.filter((f) => f.z <= -31), M = 2.8, x0 = Math.min(...fs.map((f) => f.x - f.w / 2)) - M, x1 = Math.max(...fs.map((f) => f.x + f.w / 2)) + M, z0 = Math.min(...fs.map((f) => f.z - f.d / 2)) - M, z1 = Math.max(...fs.map((f) => f.z + f.d / 2)) + M;
        slabs.push({ cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, top: 0.149 }); }
      city.add(slabMesh(slabs));
      g.add(city);

      // Outskirts: the city thins out into the woods. Buildings get lower and further apart the further out they are,
      // and the trees grow in the gaps between them (see p.blocks below).
      const outskirts = new THREE.Group(), feet = [], others = SW.SONGS.filter((q) => q !== p.song);
      { const or = E.rng(3131);
        for (let k = 0; k < 2500 && feet.length < 90; k++) {
          const a = or() * Math.PI * 2, dist = 31 + Math.pow(or(), 0.9) * 44, x = CX + Math.cos(a) * dist, z = CZ + Math.sin(a) * dist;
          const fade = (dist - 31) / 44;                                         // 0 at the edge of the block, 1 deep in the woods
          if (or() < fade * 0.7) continue;                                      // fewer and fewer
          if (Math.abs(x) < 9 && z > 6) continue;                                // keep the path in from the plaza clear
          if (Math.abs(x) < 24 && z < -33) continue;                             // and the avenue's far stretch, which has its own blocks
          if (inFieldStreet(x, z, 6)) continue;
          const w = 6 + or() * 6 * (1 - fade * 0.5), d = 6 + or() * 6 * (1 - fade * 0.5), h = Math.max(4, (22 - fade * 18) * (0.7 + or() * 0.6));
          if (feet.some((f) => Math.abs(f.x - x) < (f.w + w) / 2 + 2 + fade * 3 && Math.abs(f.z - z) < (f.d + d) / 2 + 2 + fade * 3)) continue;   // wider gaps further out, for the trees
          const wp = p.toWorld(x, z), R = Math.hypot(wp.x, wp.z);
          if (R < 18 || Math.abs(R - 30) < 5.5) continue;                          // the plaza and the loop trail
          if (E.ring && E.ring.dist(wp.x, wp.z) < 13) continue;                  // the ring road
          if (others.some((q) => Math.hypot(wp.x - q.x, wp.z - q.z) < 30)) continue;   // the neighbouring places
          if (others.some((q) => { const L = Math.hypot(q.x, q.z), t = Math.max(0, Math.min(1, (wp.x * q.x + wp.z * q.z) / (L * L))); return Math.hypot(wp.x - q.x * t, wp.z - q.z * t) < 8; })) continue;   // their paths from the plaza
          const ft = fieldWard(x, z), b = kit.mesh(w, ft > 0.2 ? Math.min(h, 10 + or() * 4) : h, d, kr, nyStyle(ft, or)); b.position.set(x, 0, z); b.rotation.y = Math.round(or() * 4) * (Math.PI / 2) + (or() - 0.5) * 0.3; b.castShadow = true;
          const box = p.addBox(x, z, Math.max(w, d) / 2 + 0.3, Math.max(w, d) / 2 + 0.3);
          outskirts.add(b); feet.push({ x, z, w, d, rot: b.rotation.y, b, box });
        } }
      g.add(outskirts);
      p.spill = feet;   // the game drops any of these that land on another place once every place is built
      // ...then calls this: an apron round each remaining building and a footpath from each one to its neighbour nearer
      // the middle (or to the edge of the block), so the pavements branch out into the woods like the buildings do.
      const walks = [];
      p.afterSpill = () => {
        const out = [], inCore = (x, z) => slabs.some((s) => Math.abs(x - s.cx) < s.hx && Math.abs(z - s.cz) < s.hz);
        const dc = (f) => Math.hypot(f.x - CX, f.z - CZ);
        feet.forEach((f, i) => {
          out.push({ cx: f.x, cz: f.z, hx: f.w / 2 + 1.6, hz: f.d / 2 + 1.6, rot: f.rot, top: 0.12 - (i % 7) * 0.003 });
          let to = null, best = 1e9;
          for (const o of feet) { if (o === f || dc(o) >= dc(f)) continue; const d = Math.hypot(o.x - f.x, o.z - f.z); if (d < best) { best = d; to = o; } }
          let tx, tz;
          if (to && best < 30) { tx = to.x; tz = to.z; }
          else { // to the nearest edge of the block's pavement
            let bd = 1e9; for (const s of slabs) { const cx = Math.max(s.cx - s.hx + 0.5, Math.min(s.cx + s.hx - 0.5, f.x)), cz = Math.max(s.cz - s.hz + 0.5, Math.min(s.cz + s.hz - 0.5, f.z)), d = Math.hypot(cx - f.x, cz - f.z); if (d < bd) { bd = d; tx = cx; tz = cz; } }
          }
          const L = Math.hypot(tx - f.x, tz - f.z); if (L < 1) return;
          out.push({ cx: (f.x + tx) / 2, cz: (f.z + tz) / 2, hx: 1.1, hz: L / 2, rot: Math.atan2(tx - f.x, tz - f.z), top: 0.08 });
          walks.push([f.x, f.z, tx, tz]);
        });
        if (out.length) outskirts.add(slabMesh(out));
        allSlabs.push(...out);
      };
      const allSlabs = slabs.slice();

      // The avenue's far stretch: past the crossing it carries straight on, under the elevated ring road, between
      // narrower blocks, and opens into a station forecourt: a roundabout the cabs drive round to head back up the
      // avenue, a taxi rank, a bus stop and a canopy in front of the terminal that closes the view.
      let VD = null;   // the streets under the viaduct (below)
      const AV0 = -33, AV2 = -70, RC = [0, -82], RI = 4.5, RO = 10.5, TF = -97, ext = new THREE.Group(), extFeet = [], extSlabs = [], termClock = [];
      // The cabs' loop, closed: from the roundabout in front of the plaza's fountain down the southbound lane, round the
      // station's roundabout (keeping the island on the left), back up the avenue and round the fountain's roundabout again.
      const FC = [0, 32], FI = 3.6, FO = 9;   // the fountain's roundabout: centre (on the road, just short of the plaza), island and outer radius
      const cabLoop = (() => { const pts = [[2.8, FC[1] - FO - 0.6], [2.2, 18], [2.2, -40], [2.2, -62], [2.8, -70.5]]; const R = (RI + RO) / 2, Rf = (FI + FO) / 2;
        for (let a = 0.55; a < Math.PI * 2 - 0.5; a += 0.25) pts.push([RC[0] + Math.sin(a) * R, RC[1] + Math.cos(a) * R]);
        pts.push([-2.8, -70.5], [-2.2, -62], [-2.2, -40], [-2.2, 18], [-2.8, FC[1] - FO - 0.6]);
        for (let a = 0.6; a < Math.PI * 2 - 0.55; a += 0.25) pts.push([FC[0] - Math.sin(a) * Rf, FC[1] - Math.cos(a) * Rf]);   // the same way round, turned to face it
        const c = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal'), L = c.getLength(), n = Math.round(L / 0.5), P = c.getSpacedPoints(n);
        const slow = P.map((q) => (Math.hypot(q.x - RC[0], q.z - RC[1]) < RO + 2 || Math.hypot(q.x - FC[0], q.z - FC[1]) < FO + 2 ? 0.6 : 1));   // slower round either roundabout
        return { L, n, P, slow }; })();
      {
        const xr = E.rng(5151), MB = E.batch(ext), mb = MB.box;
        // Under the viaduct: where the avenue passes under the ring road, a street turns off left and right and runs on along
        // under the deck (on its inner side, clear of the single row of piers down its middle), as far as the next place.
        // VD.branches: points along the ring's centre line in this frame, each with the normal towards the town's middle.
        VD = (() => {
          const R = E.ring && E.ring.roads && E.ring.roads[0]; if (!R) return null;
          const N = R.N, at = (i) => { const j = ((i % N) + N) % N, l = p.local(R.X[j], R.Z[j]); return [l.x, l.z, R.Y[j]]; }, oc = p.local(0, 0);
          let i0 = 0, bd = 1e9; for (let i = 0; i < N; i++) { const [x, z] = at(i), d = Math.hypot(x, z + 66); if (d < bd) { bd = d; i0 = i; } }
          if (bd > 20) return null;
          const fieldS = SW.SONGS.find((q) => q.scene === 'field'), fF = fieldS ? SW.Ring.frame(fieldS) : null, parkS = SW.SONGS.find((q) => q.scene === 'park'), pF = parkS ? SW.Ring.frame(parkS) : null;
          const stop = (x, z) => { const w = p.toWorld(x, z); if (fF) { const l = fF.local(w.x, w.z); if (Math.abs(l.x) < 28 && l.z > -36 && l.z < 16) return true; } if (pF && Math.hypot(w.x - pF.x, w.z - pF.z) < 64) return true; return Math.abs(w.x) > 138 || Math.abs(w.z) > 138; };
          const branch = (dir) => { const pts = []; pts.dir = dir; let len = 0, prev = null;   // (dir: which way along the ring; each point keeps its ring index i, for the street that carries on past the end: street.js)
            for (let k = 0; k < 60; k++) { const i = i0 + dir * k, [x, z, y] = at(i), [x1, z1] = at(i + 1), [x0, z0] = at(i - 1); let tx = x1 - x0, tz = z1 - z0; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
              let nx = -tz, nz = tx; if (nx * (oc.x - x) + nz * (oc.z - z) < 0) { nx = -nx; nz = -nz; }
              if (prev) len += Math.hypot(x - prev[0], z - prev[1]); prev = [x, z];
              if (len > 58 || stop(x + nx * 5, z + nz * 5)) break;
              pts.push({ x, z, nx, nz, y, i: ((i % N) + N) % N }); }
            return pts; };
          const branches = [branch(-1), branch(1)].filter((b) => b.length > 3);
          const C = 4.95, RW = 3.45;   // the street's centre, out from the viaduct's centre line, and its half-width
          const near = (lx, lz, lo, hi) => branches.some((b) => b.some((q, k) => { if (k === b.length - 1) return false; const dx = lx - q.x, dz = lz - q.z, o = dx * q.nx + dz * q.nz, a = -dx * q.nz + dz * q.nx; return o > lo && o < hi && Math.abs(a) < 1.6; }));
          return { branches, C, RW, near, crossZ: (x) => { let best = null; for (const b of branches) for (let k = 1; k < b.length; k++) { const a = b[k - 1], c = b[k], ax = a.x + a.nx * C, cx = c.x + c.nx * C; if ((ax - x) * (cx - x) <= 0 && ax !== cx) { const t = (x - ax) / (cx - ax); best = a.z + a.nz * C + (c.z + c.nz * C - a.z - a.nz * C) * t; } } return best; } };
        })();
        p.vd = VD;   // (street.js carries the street on from the end of its north branch)
        const asph = E.mat('#27242e', { map: E.tex('asphalt', 1.5, 8), rough: 0.9 }), asphR = E.mat('#27242e', { map: E.tex('asphalt', 3, 3), rough: 0.9 });
        const road = E.plane(11, AV0 - (AV2 + 2), asph); road.position.set(0, 0.03, (AV0 + AV2 + 2) / 2); ext.add(road); p.pick(road);   // from the block's sheet to the forecourt's paving, overlapping neither (no flicker where two flat sheets lie in one plane)
        const lineM = E.mat('#e8c43a', { rough: 0.6 }), whiteM = E.mat('#d9d4de');
        for (const sd of [-0.12, 0.12]) { const l = E.plane(0.12, AV0 - AV2 - 6, lineM); l.position.set(sd, 0.045, (AV0 + AV2 + 6) / 2); ext.add(l); }   // the double yellow
        for (let z = AV0 - 4; z > AV2 + 6; z -= 6) for (const x of [-2.75, 2.75]) { const l = E.plane(0.12, 2.6, whiteM); l.position.set(x, 0.045, z); ext.add(l); }
        // the forecourt: paving wall to wall, the roundabout's carriageway, its island, a crossing on the avenue
        const paveF = E.plane(54, TF - (AV2 + 2) < 0 ? (AV2 + 2) - TF + 4 : 30, E.mat('#8f8b83', { map: E.tex('paving', 14, 8), rough: 0.9 })); paveF.position.set(0, 0.035, (AV2 + 2 + TF - 4) / 2); ext.add(paveF); p.pick(paveF);
        const ring = new THREE.Mesh(new THREE.RingGeometry(RI, RO, 48, 1), asphR); ring.rotation.x = -Math.PI / 2; ring.position.set(RC[0], 0.045, RC[1]); ring.receiveShadow = true; ext.add(ring); p.pick(ring);
        for (const r0 of [RI + 0.25, RO - 0.25]) { const e = new THREE.Mesh(new THREE.RingGeometry(r0 - 0.07, r0 + 0.07, 64, 1), whiteM); e.rotation.x = -Math.PI / 2; e.position.set(RC[0], 0.05, RC[1]); ext.add(e); }
        const isl = new THREE.Mesh(new THREE.CylinderGeometry(RI, RI, 0.3, 40), E.mat('#9a948a', { rough: 0.9 })); isl.position.set(RC[0], 0.15, RC[1]); ext.add(isl);
        const grass = new THREE.Mesh(new THREE.CircleGeometry(RI - 0.4, 40), E.mat('#5a7a44', { map: E.tex('grass', 2, 2), rough: 0.95 })); grass.rotation.x = -Math.PI / 2; grass.position.set(RC[0], 0.31, RC[1]); ext.add(grass);
        p.addCircle(RC[0], RC[1], RI);
        { const bed = E.mat('#3f6a34', { flat: true }); for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2, s = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), bed); s.position.set(RC[0] + Math.sin(a) * 2.6, 0.6, RC[1] + Math.cos(a) * 2.6); s.scale.y = 0.6; ext.add(s); } }
        { const sm = new THREE.MeshBasicMaterial({ map: E.textTex('CENTRAL TERMINAL', { w: 512, h: 96, color: '#f4f1e6', font: '700 52px "Hind",sans-serif', bg: '#1f3a6a' }), side: THREE.DoubleSide }); sm.userData.lin = true;   // a sign on the island, low enough for the ramp overhead
          mb(0.12, 2.2, 0.12, RC[0] - 1.2, 1.4, RC[1], E.mat('#2a2d32', { metal: 0.5 })); mb(0.12, 2.2, 0.12, RC[0] + 1.2, 1.4, RC[1], E.mat('#2a2d32', { metal: 0.5 }));
          const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.55), sm); sg.position.set(RC[0], 2.2, RC[1]); ext.add(sg); }
        for (let k = -4; k <= 4; k++) { const st = E.plane(0.7, 3.0, whiteM); st.position.set(k * 1.2, 0.05, AV2 + 3.5); ext.add(st); }   // a crossing where the avenue meets the forecourt
        // sidewalks either side of the avenue, as far as the forecourt
        for (const sd of [-1, 1]) {
          const zc = VD && VD.crossZ(sd * 8.25), z0 = AV2 + 2, z1 = AV0;   // (the side street crosses the pavement between zc - RW and zc + RW)
          const parts = zc == null ? [[z0, z1]] : [[z0, zc - VD.RW], [zc + VD.RW, z1]];
          for (const [a, b2] of parts) if (b2 - a > 0.5) extSlabs.push({ cx: sd * 8.25, cz: (a + b2) / 2, hx: 2.75, hz: (b2 - a) / 2, top: 0.15 });
        }
        // blocks either side; none under (or within a few metres of) the ring road and its ramps, none on the forecourt
        const roadNear = (x, z, r) => E.ring && [[0, 0], [r, r], [-r, r], [r, -r], [-r, -r], [r, 0], [-r, 0], [0, r], [0, -r]].some(([ox, oz]) => { const w = p.toWorld(x + ox, z + oz); return E.ring.dist(w.x, w.z) < 10; });
        for (const z of [-41, -50, -59]) for (const x of [-15.5, 15.5, -27, 27]) {
          const w = Math.abs(x) < 20 ? 6.6 + xr() * 0.8 : 8 + xr() * 2, d = 7.4 + xr() * 1.2;
          if (roadNear(x, z, Math.max(w, d) / 2 + 1)) continue;
          const h = (Math.abs(x) < 20 ? 20 : 14) + xr() * 22, style = xr() < 0.3 ? 2 : undefined;
          const b = kit.mesh(w, h, d, kr, style); b.position.set(x, 0, z); b.castShadow = true; ext.add(b);
          p.addBox(x, z, w / 2 + 0.3, d / 2 + 0.3); extFeet.push({ x, z, w, d });
          extSlabs.push({ cx: x, cz: z, hx: w / 2 + 2.2, hz: d / 2 + 1.2, top: 0.149 });
          if (Math.abs(x) < 20 && xr() < 0.75) {   // a shop front at street level: a lit window and an awning
            const sd = -Math.sign(x), fx = x + sd * (w / 2 + 0.05), col = ['#ffd9a0', '#bfe8ff', '#ffe9c4', '#c8ffd8'][Math.floor(xr() * 4)];
            const win = new THREE.Mesh(new THREE.PlaneGeometry(d - 2, 2.2), E.basic(col)); win.position.set(fx, 1.45, z); win.rotation.y = sd > 0 ? Math.PI / 2 : -Math.PI / 2; ext.add(win);
            mb(1.4, 0.12, d - 1.4, fx + sd * 0.7, 3.0, z, E.mat(['#7a1f22', '#1f4a32', '#2457c5', '#2a2a2c'][Math.floor(xr() * 4)], { rough: 0.7 }));
          }
        }
        // the forecourt's sides: low station wings (under the ramp's clearance) with shops along them
        for (const sd of [-1, 1]) { const wx = sd * 30, wz = -86; mb(8, 5.6, 26, wx, 2.8, wz, E.mat('#8d877c', { map: E.tex('concrete', 2, 4), rough: 0.85 })); mb(0.1, 2.2, 22, wx - sd * 4.05, 1.4, wz, E.basic(sd < 0 ? '#ffe2b0' : '#d6ecff'), false); mb(2, 0.12, 24, wx - sd * 5, 3.0, wz, E.mat(sd < 0 ? '#1f4a32' : '#7a1f22', { rough: 0.7 })); p.addBox(wx, wz, 4.1, 13.1); }
        // street lamps down both kerbs, and sodium lights hung under the ring road's deck where the avenue passes below
        const poleM = E.mat('#2a2d32', { metal: 0.5, rough: 0.5 }), bulb = E.basic('#ffe2b0'), sodium = E.basic('#ffb04a');
        for (let z = AV0 - 6; z > AV2 + 2; z -= 11) for (const sd of [-1, 1]) {
          const x = sd * 6.1, w0 = p.toWorld(x, z);
          if (E.ring && E.ring.dist(w0.x, w0.z) < 9) continue;
          mb(0.14, 5.2, 0.14, x, 2.75, z, poleM); mb(1.4, 0.1, 0.1, x - sd * 0.7, 5.3, z, poleM); mb(0.5, 0.12, 0.3, x - sd * 1.35, 5.22, z, bulb, false); p.addCircle(x, z, 0.2);
        }
        for (let z = AV0 - 3; z > TF; z -= 3) { const w0 = p.toWorld(0, z); if (E.ring && E.ring.dist(w0.x, w0.z) < 6) for (const x of [-3, 3]) mb(0.9, 0.1, 0.3, x, 6.4, z, sodium, false); }
        for (const [x, z] of [[-14, -74], [14, -74], [-14, -92], [14, -92], [-22, -82], [22, -82]]) { mb(0.14, 6, 0.14, x, 3, z, poleM); mb(0.6, 0.3, 0.6, x, 6.1, z, bulb, false); p.addCircle(x, z, 0.2); }   // lamps round the forecourt
        // the taxi rank on the east side: cabs waiting in line, a sign, people queueing; the bus stop on the west
        const cabP = (i) => { const c = SW.Cars ? SW.Cars.make(E, i) : new THREE.Group(); c.traverse((o) => { if (o.isMesh && o.name === 'paint') { o.material = o.material.clone(); o.material.color.set('#f2c21a').convertSRGBToLinear(); } }); const s = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.25), E.basic('#fff4d0')); s.position.set(0, (c.userData.hgt || 1.4) + 0.12, -0.1); c.add(s); return c; };
        for (let k = 0; k < 4; k++) { const c = cabP(k + 1), z = -76 - k * 5.2; c.position.set(15.5, 0.04, z); c.rotation.y = Math.PI; ext.add(c); p.addBox(15.5, z, 1.0, 2.4); }
        { const sm = new THREE.MeshBasicMaterial({ map: E.textTex('TAXI', { w: 256, h: 96, color: '#141210', font: '700 64px "Hind",sans-serif', bg: '#f2c21a' }), side: THREE.DoubleSide }); sm.userData.lin = true;
          mb(0.12, 3, 0.12, 18.2, 1.5, -73.5, poleM); const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.45), sm); sg.position.set(18.2, 3.1, -73.5); ext.add(sg); p.addCircle(18.2, -73.5, 0.2); }
        { const BXs = -15.5, BZs = -84, busM = E.mat('#e8e4da', { rough: 0.5, metal: 0.2 }), busS = E.mat('#2457c5', { rough: 0.5 }), winB = E.basic('#ffe9bd');   // a city bus at the stop, and the shelter
          mb(2.5, 2.9, 11, BXs, 1.75, BZs, busM); mb(2.52, 0.35, 11.02, BXs, 0.75, BZs, busS); mb(2.54, 0.9, 9.6, BXs, 2.3, BZs - 0.3, winB, false); mb(2.3, 0.6, 0.06, BXs, 2.75, BZs - 5.52, winB, false);
          for (const z of [BZs - 3.8, BZs + 3.4]) for (const sd of [-1, 1]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 14), E.mat('#141416', { rough: 0.8 })); wh.rotation.z = Math.PI / 2; wh.position.set(BXs + sd * 1.2, 0.5, z); ext.add(wh); }
          p.addBox(BXs, BZs, 1.3, 5.6);
          const sx = -19.2, sz = -85; mb(0.08, 2.5, 4, sx - 0.9, 1.3, sz, E.mat('#9aa6b0', { rough: 0.2, metal: 0.3 })); mb(1.9, 0.1, 4.4, sx, 2.6, sz, poleM); mb(0.6, 0.45, 3.4, sx - 0.5, 0.45, sz, E.mat('#6a5038', { rough: 0.8 }));
          p.addBox(sx - 0.9, sz, 0.15, 2.0);
          const sm = new THREE.MeshBasicMaterial({ map: E.textTex('BUS M42 · M50', { w: 512, h: 96, color: '#f4f1e6', font: '700 56px "Hind",sans-serif', bg: '#2457c5' }), side: THREE.DoubleSide }); sm.userData.lin = true; const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.42), sm); sg.position.set(sx, 2.95, sz); sg.rotation.y = Math.PI / 2; ext.add(sg); }
        // people waiting: a taxi queue, people at the bus stop and under the canopy (they shift their weight now and then)
        { const bodyM = E.mat('#ffffff', { rough: 0.7 }), coats = ['#1e2024', '#7a2f2a', '#c9ccd1', '#3a4038', '#d8d2c0', '#2457c5', '#8a6a3a'], skins = ['#e1b18c', '#c8946a', '#8a5a3c', '#f0c8a8'];
          const spots = []; for (let k = 0; k < 5; k++) spots.push([19.2, -76.5 - k * 1.1]); for (let k = 0; k < 4; k++) spots.push([-18.5 + (k % 2) * 0.6, -83.5 - k * 0.9]); for (let k = 0; k < 9; k++) spots.push([-10 + xr() * 20, -92.5 - xr() * 2.5]);
          const NB = spots.length, bI = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.26, 1.15, 8).translate(0, 0.72, 0), bodyM, NB), hI = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 10, 8).translate(0, 1.47, 0), E.mat('#ffffff', { rough: 0.6 }), NB);
          const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
          spots.forEach(([x, z], i) => { m4.compose(new THREE.Vector3(x, 0.04, z), q.setFromAxisAngle(up, xr() * 6.28), new THREE.Vector3(1, 1, 1)); bI.setMatrixAt(i, m4); hI.setMatrixAt(i, m4); bI.setColorAt(i, E.lin(coats[Math.floor(xr() * coats.length)])); hI.setColorAt(i, E.lin(skins[Math.floor(xr() * skins.length)])); p.addCircle(x, z, 0.3); });
          bI.castShadow = true; ext.add(bI, hI); }
        // the terminal: a granite hall with three tall arched windows, a clock and its name, and a canopy over the doors
        { const TZ = TF - 8, granite = E.mat('#8d877c', { map: E.tex('concrete', 4, 2), rough: 0.85 }), dark = E.mat('#3a3630', { rough: 0.8 });
          mb(46, 22, 16, 0, 11, TZ, granite); mb(48, 1.4, 17, 0, 22.5, TZ, dark); mb(20, 6, 12, 0, 26, TZ, granite);   // the hall, its cornice and the attic
          for (const x of [-22, 22]) mb(10, 34, 12, x, 17, TZ - 2, granite);   // two towers on the corners
          const glass = E.basic('#ffd08a');
          for (const x of [-8, 0, 8]) {
            mb(5.6, 12, 0.3, x, 10.5, TZ + 8.05, glass, false);
            const arch = new THREE.Mesh(new THREE.CircleGeometry(2.8, 20, 0, Math.PI), glass); arch.position.set(x, 16.5, TZ + 8.06); ext.add(arch);
            for (let k = 1; k < 4; k++) mb(0.18, 14.6, 0.1, x - 2.8 + k * 1.4, 11.6, TZ + 8.2, dark, false);
            mb(3.2, 3.2, 0.2, x, 1.6, TZ + 8.1, E.basic('#fff0cc'), false);   // the doors, open and lit
          }
          for (const x of [-12.5, -4, 4, 12.5]) mb(1.6, 20, 1.2, x, 11, TZ + 8.3, granite);   // columns between the windows
          const clock = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32), E.basic('#fff4d6')); clock.position.set(0, 26, TZ + 6.05); ext.add(clock);
          const hand = (len, a) => { const h = new THREE.Mesh(new THREE.PlaneGeometry(0.16, len), E.basic('#141210')); h.geometry.translate(0, len / 2, 0); h.position.set(0, 26, TZ + 6.07); h.rotation.z = a; ext.add(h); return h; };
          termClock.push(hand(1.3, 0), hand(1.9, 0));
          const nm = new THREE.MeshBasicMaterial({ map: E.textTex('CENTRAL TERMINAL', { w: 1024, h: 120, color: '#ffe9c4', glow: '#ffb03a', font: '700 74px "Hind",sans-serif' }), transparent: true, depthWrite: false }); nm.userData.lin = true;
          const sg = new THREE.Mesh(new THREE.PlaneGeometry(20, 2.3), nm); sg.position.set(0, 20.6, TZ + 8.4); ext.add(sg);
          // the canopy (glass on a steel frame) over the doors and the drop-off, and the departures board under it
          mb(30, 0.35, 7, 0, 4.8, TF + 3.5, poleM); mb(29, 0.05, 6.4, 0, 4.6, TF + 3.5, E.basic('#fff2d8'), false);
          for (const x of [-14, -7, 7, 14]) { mb(0.3, 4.8, 0.3, x, 2.4, TF + 6.6, poleM); p.addCircle(x, TF + 6.6, 0.25); }
          const dep = E.textTex('DEPARTURES  21:04 HUDSON LINE  ·  21:12 HARLEM LINE  ·  21:20 NEW HAVEN', { w: 2048, h: 96, color: '#ffb02a', font: '700 52px "Hind",sans-serif', bg: '#050505' });
          const dm = new THREE.MeshBasicMaterial({ map: dep }); dm.userData.lin = true; const db = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.7), dm); db.position.set(0, 3.9, TF + 0.6); ext.add(db); mb(14.4, 0.9, 0.2, 0, 3.9, TF + 0.45, poleM);
          p.addBox(0, TZ, 24, 8.2); }
        if (VD) {
          const { C, RW } = VD;
          // a strip between two offsets from the viaduct's centre line, cut off where its middle comes within |lx| < clip of the avenue
          const strip = (b, o0, o1, y, m, clip) => {
            const pts = []; const mid = (o0 + o1) / 2;
            for (let k = 0; k < b.length; k++) { const q = b[k], mx = q.x + q.nx * mid; if (Math.abs(mx) < clip) { if (pts.length) break; continue; }
              if (!pts.length && k > 0) { const a = b[k - 1], ax = a.x + a.nx * mid; if (Math.abs(ax) < clip) { const t = (clip - Math.abs(ax)) / (Math.abs(mx) - Math.abs(ax)); pts.push({ x: a.x + (q.x - a.x) * t, z: a.z + (q.z - a.z) * t, nx: a.nx + (q.nx - a.nx) * t, nz: a.nz + (q.nz - a.nz) * t, y: q.y }); } }
              pts.push(q); }
            if (pts.length < 2) return null;
            const pos = [], uv = [], idx = [];
            pts.forEach((q, k) => { for (const o of [o0, o1]) { const x = q.x + q.nx * o, z = q.z + q.nz * o; pos.push(x, y, z); uv.push(x / 7.5, -z / 7.5); } if (k) { const v = k * 2; idx.push(v - 2, v - 1, v, v - 1, v + 1, v); } });
            const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
            const nrm = new Float32Array(pos.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1; geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));   // (whichever way the strip winds, it faces up)
            const me = new THREE.Mesh(geo, m); me.receiveShadow = true; ext.add(me); p.pick(me); return pts;
          };
          const asphV = E.mat('#2b2830', { map: E.tex('asphalt', 1, 1), rough: 0.9 }, true), lotM = E.mat('#3a3834', { map: E.tex('asphalt', 1, 1), rough: 0.95 }, true), lineV = E.mat('#d9d4de', {}, true);
          for (const m of [asphV, lotM, lineV]) m.side = THREE.DoubleSide;
          const tag = (txt, a, b2) => { const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d'); x.translate(256, 128); x.rotate(-0.07); x.font = '900 118px "Arial Black","Hind",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
            const k = Math.min(1, 470 / x.measureText(txt).width); x.scale(k, k); x.lineWidth = 20; x.strokeStyle = '#101014'; x.strokeText(txt, 0, 4); const gr = x.createLinearGradient(0, -60, 0, 60); gr.addColorStop(0, a); gr.addColorStop(1, b2); x.fillStyle = gr; x.fillText(txt, 0, 4);
            const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; const m = E.mat('#ffffff', { map: t, rough: 0.8 }, true); m.transparent = true; m.depthWrite = false; m.polygonOffset = true; m.polygonOffsetFactor = -2; m.side = THREE.DoubleSide; return m; };
          const tags = [tag('FDH', '#ffe14f', '#ff8a2a'), tag('UNDER 9', '#3ff0ff', '#2a6aff'), tag('NYC', '#9bff6a', '#2ab04a'), tag('FLIP', '#ff6a9a', '#b02ad8')];
          const wallM = E.mat('#8a867e', { map: E.tex('concrete', 1, 1), rough: 0.9 }), postM = E.mat('#5a6068', { metal: 0.5, rough: 0.5 }), lampM = E.basic('#ffb04a');
          let carK = 0, tagK = 0;
          for (const b of VD.branches) {
            const road = strip(b, C - RW, C + RW, 0.03, asphV, 5.5);
            if (!road) continue;
            // markings: the edge lines solid, a dashed line down the middle, a stop line where it meets the avenue
            strip(b, C - RW + 0.2, C - RW + 0.32, 0.036, lineV, 5.5); strip(b, C + RW - 0.32, C + RW - 0.2, 0.036, lineV, 5.5);
            for (let k = 1; k < road.length; k += 2) { const a = road[k - 1], q = road[k], x = (a.x + q.x) / 2 + ((a.nx + q.nx) / 2) * C, z = (a.z + q.z) / 2 + ((a.nz + q.nz) / 2) * C; const d = mb(0.12, 0.012, 1.1, x, 0.036, z, whiteM, false); d.rotation.y = Math.atan2(q.x - a.x, q.z - a.z); }
            { const q = road[0], q1 = road[1], x = q.x + q.nx * C + (q1.x - q.x) * 0.3, z = q.z + q.nz * C + (q1.z - q.z) * 0.3, sl = mb(RW * 2 - 0.4, 0.012, 0.4, x, 0.036, z, whiteM, false); sl.rotation.y = Math.atan2(q.nx, q.nz) + Math.PI / 2; sl.rotation.y = Math.atan2(q1.x - q.x, q1.z - q.z); }
            // the pavement along its inner side, kerbed, in short turned pieces
            for (let k = 1; k < road.length; k++) { const a = road[k - 1], q = road[k], mx = (a.x + q.x) / 2, mz = (a.z + q.z) / 2, nx = (a.nx + q.nx) / 2, nz = (a.nz + q.nz) / 2, L = Math.hypot(q.x - a.x, q.z - a.z);
              if (Math.abs(mx + nx * (C + RW + 1)) < 11.2) continue;   // (the avenue's own pavement is there)
              extSlabs.push({ cx: mx + nx * (C + RW + 1), cz: mz + nz * (C + RW + 1), hx: L / 2 + 0.15, hz: 1, top: 0.15, rot: Math.atan2(a.z - q.z, q.x - a.x) }); }   // (a slab's own x runs along (cos rot, -sin rot): here along the street)
            // sodium lamps hung under the deck over the street
            for (let k = 2; k < road.length; k += 5) { const q = road[k], x = q.x + q.nx * C, z = q.z + q.nz * C, y = (q.y || 9) - 1.1; const l = mb(1.0, 0.12, 0.32, x, y, z, lampM, false); l.rotation.y = Math.atan2(q.nx, q.nz); mb(0.05, 0.5, 0.05, x, y + 0.3, z, postM); }
            // beyond the forecourt, a lot on the far side of the piers: parked cars nose to the wall, a block wall with tags and a rail on posts over it
            const lot = strip(b, -7.6, -1.5, 0.03, lotM, 29);
            if (lot) {
              for (let k = 1; k < lot.length; k++) {
                const a = lot[k - 1], q = lot[k], nx = (a.nx + q.nx) / 2, nz = (a.nz + q.nz) / 2, x = (a.x + q.x) / 2 - nx * 7.8, z = (a.z + q.z) / 2 - nz * 7.8, L = Math.hypot(q.x - a.x, q.z - a.z) + 0.05, yaw = Math.atan2(q.x - a.x, q.z - a.z);
                const w = mb(0.3, 1.1, L, x, 0.55, z, wallM); w.rotation.y = yaw;
                const bxW = p.addBox(x, z, 0.2, L / 2); bxW.c = Math.cos(p.rot + yaw); bxW.s = Math.sin(p.rot + yaw);
                if (k % 2) mb(0.06, 1.6, 0.06, x, 1.9, z, postM); const rail = mb(0.04, 0.04, L, x, 2.65, z, postM); rail.rotation.y = yaw;
                if (k % 3 === 1) { const t = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(2.6, L * 1.3), 0.95), tags[tagK++ % tags.length]); t.position.set(x + nx * 0.16, 0.6, z + nz * 0.16); t.rotation.y = Math.atan2(nx, nz); ext.add(t); }
              }
              for (let k = 1; k < lot.length; k += 2) { if (xr() < 0.25 || !SW.Cars) continue; const q = lot[k], yaw = Math.atan2(-q.nx, -q.nz) + (xr() < 0.5 ? Math.PI : 0), x = q.x - q.nx * 4.6, z = q.z - q.nz * 4.6;
                const car = SW.Cars.make(E, (carK++ * 3) % 7); car.position.set(x, 0.04, z); car.rotation.y = yaw; ext.add(car);
                const cb = p.addBox(x, z, 1.0, 2.3); cb.c = Math.cos(p.rot + yaw); cb.s = Math.sin(p.rot + yaw); }
            }
          }
        }
        MB.flush();
        allSlabs.push(...extSlabs); ext.add(slabMesh(extSlabs));
      }
      g.add(ext);
      // The avenue's near end, from the block up to the plaza, is FLIP's own street (the game lays no road strip of its own
      // here, p.road.own): one sheet of asphalt flush with the block's, its texture running on from it, as wide as the
      // block's carriageway, opening into the roundabout's disc; raised pavements with kerbs either side, lined up with the
      // block's; a kerb round the roundabout; a paved strip on to the plaza; and the markings painted on the road itself.
      const kerbOf = (sd) => { const ss = slabs.filter((s) => Math.sign(s.cx) === sd && s.cz + s.hz > 0); return ss.length ? Math.min(...ss.map((s) => Math.abs(s.cx) - s.hx)) : 5.5; };
      const IN = Math.max(5.5, Math.min(kerbOf(-1), kerbOf(1), 7.2)), RR = FO + 0.3, Z17 = 17, ZJ = FC[1] - Math.sqrt(RR * RR - IN * IN), CW = 4, PLAZA_Z = FC[1] + 11.4;
      const blockEnd = Math.max(Z17 - 4, ...slabs.filter((s) => s.cz + s.hz > 0).map((s) => s.cz + s.hz));
      {
        const sh = new THREE.Shape(), aJ = Math.asin(IN / RR), aC = Math.asin(CW / RR);   // the outline in (lx, -lz): the street, round the disc, the plaza side left open
        sh.moveTo(-IN, -Z17); sh.lineTo(IN, -Z17); sh.lineTo(IN, -ZJ);
        const arc = (a0, a1) => { const n = Math.ceil(Math.abs(a1 - a0) / 0.06); for (let i = 1; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; sh.lineTo(FC[0] + Math.sin(a) * RR, -(FC[1] - Math.cos(a) * RR)); } };
        arc(aJ, Math.PI * 2 - aJ); sh.lineTo(-IN, -Z17);
        const tx = E.tex('asphalt', 1 / 7.5, 1 / 6.25); tx.offset.set((30 * tx.repeat.x) % 1, (Z17 * tx.repeat.y) % 1); if (tx.nrm) { tx.nrm.repeat.copy(tx.repeat); tx.nrm.offset.copy(tx.offset); }   // the block's sheet repeats every 7.5 x 6.25 m: carry on in step with it
        const apron = new THREE.Mesh(new THREE.ShapeGeometry(sh, 1), E.mat('#27242e', { map: tx, rough: 0.9 })); apron.rotation.x = -Math.PI / 2; apron.position.y = 0.03; apron.receiveShadow = true; g.add(apron); p.pick(apron);
        const pv = E.plane(CW * 2, PLAZA_Z - FC[1] - RR + 0.6, E.mat('#8f8b83', { map: E.tex('paving', 2, 1), rough: 0.9 })); pv.position.set(FC[0], 0.034, (FC[1] + RR - 0.6 + PLAZA_Z) / 2); g.add(pv); p.pick(pv);   // a paved strip on to the plaza's rim
        const walks = [-1, 1].map((sd) => ({ cx: sd * (IN + 1.9), cz: (blockEnd + ZJ - 0.4) / 2, hx: 1.9, hz: (ZJ - 0.4 - blockEnd) / 2, top: 0.15 }));
        allSlabs.push(...walks); g.add(slabMesh(walks));
        const kerbM = E.mat('#9b968c', { rough: 0.85 });
        for (const [t0, t1] of [[aC, Math.PI - aJ], [Math.PI + aJ, Math.PI * 2 - aC]]) {   // the kerb round the disc, open where the street and the plaza strip join it
          const band = new THREE.Mesh(new THREE.CylinderGeometry(RR, RR, 0.15, 48, 1, true, t0, t1 - t0), kerbM); band.position.set(FC[0], 0.075, FC[1]); g.add(band);
          const top = new THREE.Mesh(new THREE.RingGeometry(RR, RR + 0.3, 48, 1, t0 - Math.PI / 2, t1 - t0), kerbM); top.rotation.x = -Math.PI / 2; top.position.set(FC[0], 0.15, FC[1]); g.add(top);
        }
        const lineY = 0.036, yel = E.mat('#e8c43a', { rough: 0.6 }), wht = E.mat('#d9d4de');
        for (const sd of [-0.12, 0.12]) { const l = E.plane(0.12, FC[1] - RR - 1.6 - Z17, yel); l.position.set(sd, lineY, (Z17 + FC[1] - RR - 1.6) / 2); g.add(l); }   // the double yellow up to the give-way line
        for (const sd of [-1, 1]) { const l = E.plane(0.12, ZJ - Z17, wht); l.position.set(sd * (IN - 0.45), lineY, (Z17 + ZJ) / 2); g.add(l); }   // the edge lines by the kerbs
      }
      // The roundabout in front of the plaza's fountain, where the avenue meets the plaza: the cabs come up the avenue,
      // go round it and head back down. A planted island with a lamp and a sign.
      {
        const fr = new THREE.Group(), FB = E.batch(fr), fb = FB.box, whiteM = E.mat('#d9d4de'), ry = 0.031;
        for (const r0 of [FI + 0.25, FO - 0.25]) { const e = new THREE.Mesh(new THREE.RingGeometry(r0 - 0.07, r0 + 0.07, 64, 1), whiteM); e.rotation.x = -Math.PI / 2; e.position.set(FC[0], ry + 0.005, FC[1]); fr.add(e); }
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 9) { const d = E.plane(0.12, 1.1, whiteM); d.position.set(FC[0] + Math.sin(a) * ((FI + FO) / 2), ry + 0.006, FC[1] + Math.cos(a) * ((FI + FO) / 2)); d.rotation.y = a + Math.PI / 2; fr.add(d); }   // the dashed lane line
        for (const sd of [-1, 1]) for (let k = 0; k < 4; k++) { const st = E.plane(0.6, 1.4, whiteM); st.position.set(sd * (1.1 + k * 1.0), ry + 0.006, FC[1] - FO - 1.4); fr.add(st); }   // give-way blocks where the avenue joins
        const isl = new THREE.Mesh(new THREE.CylinderGeometry(FI, FI, 0.3, 40), E.mat('#9a948a', { rough: 0.9 })); isl.position.set(FC[0], 0.15, FC[1]); fr.add(isl);
        const grass = new THREE.Mesh(new THREE.CircleGeometry(FI - 0.35, 40), E.mat('#5a7a44', { map: E.tex('grass', 2, 2), rough: 0.95 })); grass.rotation.x = -Math.PI / 2; grass.position.set(FC[0], 0.31, FC[1]); fr.add(grass);
        p.addCircle(FC[0], FC[1], FI);
        const bed = E.mat('#3f6a34', { flat: true }), blooms = ['#e8c43a', '#d8d2e8', '#c84a6a'].map((c) => E.mat(c, { flat: true }));
        for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2, sh = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), bed); sh.position.set(FC[0] + Math.sin(a) * 2.5, 0.55, FC[1] + Math.cos(a) * 2.5); sh.scale.y = 0.6; fr.add(sh);
          const fl = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), blooms[k % 3]); fl.position.set(FC[0] + Math.sin(a + 0.35) * 2.6, 0.5, FC[1] + Math.cos(a + 0.35) * 2.6); fr.add(fl); }
        const pole = E.mat('#2a2d32', { metal: 0.5 });
        fb(0.16, 4.4, 0.16, FC[0], 2.5, FC[1], pole); fb(1.6, 0.1, 0.1, FC[0], 4.6, FC[1], pole);   // a double street lamp in the middle
        const lampM = E.basic('#ffe2a8'); for (const sd of [-1, 1]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), lampM); b.position.set(FC[0] + sd * 0.8, 4.45, FC[1]); fr.add(b); }
        { const sm = new THREE.MeshBasicMaterial({ map: E.textTex('FLIP DA HOODS  ⟳', { w: 512, h: 96, color: '#f4f1e6', font: '700 50px "Hind",sans-serif', bg: '#3a1f6a' }), side: THREE.DoubleSide }); sm.userData.lin = true;
          fb(0.1, 1.6, 0.1, FC[0] - 1.1, 1.1, FC[1] - 1.6, pole); fb(0.1, 1.6, 0.1, FC[0] + 1.1, 1.1, FC[1] - 1.6, pole);
          const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.48), sm); sg.position.set(FC[0], 1.75, FC[1] - 1.6); fr.add(sg); }
        FB.flush(); g.add(fr);
      }
      const inSlab = (lx, lz) => { let top = 0; for (const s of allSlabs) { const c = Math.cos(s.rot || 0), sn = Math.sin(s.rot || 0), dx = lx - s.cx, dz = lz - s.cz, ax = dx * c - dz * sn, az = dx * sn + dz * c; if (Math.abs(ax) <= s.hx && Math.abs(az) <= s.hz) top = Math.max(top, s.top); } return top; };
      p.ground = (lx, lz) => (Math.abs(lx) < 80 && lz > -120 && lz < 70 ? inSlab(lx, lz) : 0);   // step up onto the pavement
      const nearWalk = (lx, lz) => walks.some(([ax, az, bx2, bz]) => { const vx = bx2 - ax, vz = bz - az, t = Math.max(0, Math.min(1, ((lx - ax) * vx + (lz - az) * vz) / (vx * vx + vz * vz))); return Math.hypot(lx - ax - vx * t, lz - az - vz * t) < 2.2; });

      // Billboard at the end of the street
      const bbTex = E.textTex('FLIP DA HOODS', { w: 1024, h: 256, color: '#3ff0ff', glow: '#3ff0ff', font: '700 150px "Hind", sans-serif' });
      const bb = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), new THREE.MeshBasicMaterial({ map: bbTex, transparent: true }));
      bb.position.set(1, 20, -27);
      g.add(bb);

      // ---- Midtown: big lit ad screens and a news ticker on the blocks round the crossing, yellow cabs (parked and
      // running up and down the avenue), crowds on the sidewalks, a subway entrance with its green globes, a food cart,
      // a newsstand, a theatre marquee, traffic lights and street signs at the crossing, steam out of the manholes.
      const mid = { screens: [], cabs: [], peds: null, ped: [], lights: [], steam: null, steamP: [], ticker: null, phase: 0 };
      {
        const mr = E.rng(4242), MB = E.batch(g), mb = MB.box;
        const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t; };
        const ADS = [
          ['ATR', 'NEW SINGLE OUT NOW', '#0b0b14', '#3ff0ff', '#ffe14f'], ['SOUND WALK', 'WALK · LISTEN · FIND', '#1a0a2a', '#9b6bff', '#f4f1e6'], ['FIELD', 'vas · stvn · p.pulpk · atr', '#2a0a0a', '#ff5a3a', '#f4f1e6'],
          ['CLOSET QUEST', 'NOW PLAYING', '#06210f', '#4fff9a', '#f4f1e6'], ['24/7', 'THE CITY NEVER SLEEPS', '#0a1a2a', '#3fa7ff', '#ffe14f'], ['TAMA EXPRESSION', 'NEXT LIVE 12.26 TOKYO', '#1a1a1a', '#ffe14f', '#3ff0ff'], ['OHH', 'COASTAL GORGE', '#081a24', '#5fd0ff', '#ffd08a'], ['KEYAKI', 'GOLDEN HOUR', '#1a1608', '#b6e07a', '#f4f1e6']];
        const adTex = (k) => { const [a, b, bg, c1, c2] = ADS[k % ADS.length]; return canvasTex(512, 640, (x, w, h) => { const gr = x.createLinearGradient(0, 0, w, h); gr.addColorStop(0, bg); gr.addColorStop(1, '#000'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
          x.strokeStyle = c1; x.lineWidth = 10; x.strokeRect(14, 14, w - 28, h - 28); for (let i = 0; i < 12; i++) { x.fillStyle = c1; x.globalAlpha = 0.15; x.fillRect(mr() * w, mr() * h, 60 + mr() * 140, 8); } x.globalAlpha = 1;
          x.fillStyle = c1; x.font = '700 120px "Hind", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowColor = c1; x.shadowBlur = 30; x.fillText(a, w / 2, h * 0.42, w - 60); x.shadowBlur = 0;
          x.fillStyle = c2; x.font = '700 36px "Hind", sans-serif'; x.fillText(b, w / 2, h * 0.62, w - 60); }); };
        // screens on the faces of the blocks that look onto the avenue and the crossing
        let k = 0;
        coreFeet.forEach((f) => {
          if (Math.abs(f.x) < 2 || f.z < -34) return;
          const sd = -Math.sign(f.x), fx = f.x + sd * (f.w / 2 + 0.06), near = Math.abs(f.z - CZ) < 14;
          const H0 = near ? 5.5 : 7, Hs = near ? 9 : 6.5, W0 = Math.min(f.d - 0.8, near ? 7.5 : 6);
          const m = new THREE.MeshBasicMaterial({ map: adTex(k), color: new THREE.Color(1, 1, 1) }); m.userData.lin = true;
          const s = new THREE.Mesh(new THREE.PlaneGeometry(W0, Hs), m); s.position.set(fx, H0 + Hs / 2, f.z); s.rotation.y = sd > 0 ? Math.PI / 2 : -Math.PI / 2; city.add(s);
          mb(0.3, Hs + 0.4, W0 + 0.4, fx - sd * 0.12, H0 + Hs / 2, f.z, E.mat('#141416', { metal: 0.4, rough: 0.5 }));
          mid.screens.push({ m, k, seed: mr() * 6 }); k++;
        });
        // a news ticker running round the block on the north-east corner of the crossing
        { const f = coreFeet.filter((q) => q.x > 0).sort((a, b) => Math.abs(a.z - CZ + 6) - Math.abs(b.z - CZ + 6))[0];
          if (f) { const tt = canvasTex(2048, 64, (x, w, h) => { x.fillStyle = '#050505'; x.fillRect(0, 0, w, h); x.fillStyle = '#ffd23a'; x.font = '700 44px "Hind", sans-serif'; x.textBaseline = 'middle'; x.fillText('★ ATR — NEW SINGLE OUT NOW  ★  SOUND WALK: WALK THE CITY, FIND THE SONGS  ★  NEXT LIVE 12.26 TOKYO  ★  FLIP DA HOODS  ★  ATR RECORDS ON THE PLAZA  ★', 10, h / 2); });
            tt.wrapS = THREE.RepeatWrapping; tt.repeat.set(0.35, 1);
            const m = new THREE.MeshBasicMaterial({ map: tt }); m.userData.lin = true; const tk = new THREE.Mesh(new THREE.PlaneGeometry(f.d + 0.4, 0.9), m); tk.position.set(f.x - (f.w / 2 + 0.08), 4.4, f.z); tk.rotation.y = -Math.PI / 2; city.add(tk); mid.ticker = tt; } }
        // a theatre marquee on the west side
        { const f = coreFeet.filter((q) => q.x < 0 && q.z < CZ - 8).sort((a, b) => b.z - a.z)[0];
          if (f) { const fx = f.x + f.w / 2; mb(1.8, 1.4, f.d - 1, fx + 0.9, 4.2, f.z, E.mat('#1a1a1c', { metal: 0.4, rough: 0.4 }));
            const sm = new THREE.MeshBasicMaterial({ map: E.textTex('TONIGHT  FLIP DA HOODS', { w: 1024, h: 120, color: '#ffe9b0', glow: '#ffb03a', font: '700 70px "Hind",sans-serif', bg: '#120d08' }) }); sm.userData.lin = true;
            const sg = new THREE.Mesh(new THREE.PlaneGeometry(f.d - 1.2, 0.9), sm); sg.position.set(fx + 1.82, 4.2, f.z); sg.rotation.y = Math.PI / 2; city.add(sg);
            const bulbs = []; for (let i = 0; i < 40; i++) { const t = i / 39; bulbs.push(fx + 1.83, 4.85, f.z - (f.d - 1) / 2 + t * (f.d - 1), fx + 1.83, 3.55, f.z - (f.d - 1) / 2 + t * (f.d - 1)); }
            const bg2 = new THREE.BufferGeometry(); bg2.setAttribute('position', new THREE.Float32BufferAttribute(bulbs, 3)); const pm = new THREE.PointsMaterial({ map: E.dot(), color: new THREE.Color('#ffd9a0'), size: 0.35, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); pm.userData.lin = true; city.add(new THREE.Points(bg2, pm)); } }
        // yellow cabs: parked along both kerbs, and two running up and down the avenue
        const cab = (i) => { const c = SW.Cars ? SW.Cars.make(E, i) : new THREE.Group(); c.traverse((o) => { if (o.isMesh && o.name === 'paint') { o.material = o.material.clone(); o.material.color.set('#f2c21a').convertSRGBToLinear(); } });
          const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.25), E.basic('#fff4d0')); sign.position.set(0, (c.userData.hgt || 1.4) + 0.12, -0.1); c.add(sign); return c; };
        for (const [x, z0, z1] of [[-5.1, -64, 14], [5.1, -64, 14]]) for (let z = z0 + 3; z < z1; z += 7 + mr() * 6) { if (Math.abs(z - CZ) < 8 || mr() < 0.35) continue; const c = cab(Math.floor(mr() * 7)); c.position.set(x, 0.03, z); c.rotation.y = x < 0 ? 0 : Math.PI; g.add(c); p.addBox(x, z, 1.0, 2.4); }
        for (let k = 0; k < 6; k++) { const c = cab(Math.floor(mr() * 7)); g.add(c); mid.cabs.push({ c, s: (k / 6) * cabLoop.L, v: 8, yaw: 0 }); }   // running the avenue between the two roundabouts
        // crowds on the sidewalks
        const NP = 110, folk = E.npc.crowd(NP, E.rng(1238), 14);   // dressed from the shared decks: fourteen outfits, each drawn once for all who wear it
        for (let i = 0; i < NP; i++) { const west = i % 2 === 0, x = (west ? -1 : 1) * (7.4 + mr() * 3.6); mid.ped.push({ x, z: -66 + mr() * 79, dir: mr() < 0.5 ? 1 : -1, v: 0.9 + mr() * 0.7, ph: mr() * 6 }); }
        g.add(folk.group); mid.peds = folk;
        // the subway entrance: stairs going down behind railings, green globes, a sign
        { const SX = -8.6, SZ = CZ + 9; mb(1.8, 0.02, 4.2, SX, 0.17, SZ, E.mat('#050505', { rough: 1 }), false);
          for (let s2 = 0; s2 < 6; s2++) mb(1.7, 0.04, 0.5, SX, 0.12 - s2 * 0.02, SZ - 1.6 + s2 * 0.6, E.mat('#3a3a3c'), false);
          const rail = E.mat('#1c2a20', { metal: 0.6, rough: 0.4 }); mb(0.08, 1.0, 4.2, SX - 0.95, 0.65, SZ, rail); mb(0.08, 1.0, 4.2, SX + 0.95, 0.65, SZ, rail); mb(1.9, 1.0, 0.08, SX, 0.65, SZ + 2.1, rail);
          p.addBox(SX, SZ, 1.0, 2.15);
          const globe = E.basic('#5fff8a'); for (const sd of [-1, 1]) { mb(0.1, 2.4, 0.1, SX + sd * 1.0, 1.35, SZ - 2.1, rail); const gl = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), globe); gl.position.set(SX + sd * 1.0, 2.7, SZ - 2.1); g.add(gl); }
          const sm = new THREE.MeshBasicMaterial({ map: E.textTex('SUBWAY  ① ② ③', { w: 512, h: 96, color: '#f4f1e6', font: '700 60px "Hind",sans-serif', bg: '#101010' }) }); sm.userData.lin = true; const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.36), sm); sg.position.set(SX, 1.35, SZ - 2.16); sg.rotation.y = Math.PI; g.add(sg); }
        // a food cart and a newsstand
        { const FX = 8.7, FZ = CZ + 13; mb(1.0, 1.1, 2.0, FX, 0.7, FZ, E.mat('#c9ced4', { metal: 0.8, rough: 0.3 })); mb(0.04, 0.5, 1.6, FX - 0.52, 1.0, FZ, E.basic('#fff2d0'), false);
          const um = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.5, 8), E.mat('#2457c5', { rough: 0.6 })); um.position.set(FX, 2.6, FZ); g.add(um); mb(0.05, 2.2, 0.05, FX, 1.5, FZ, E.mat('#9aa0a8'), false); p.addBox(FX, FZ, 0.6, 1.1);
          const sm = new THREE.MeshBasicMaterial({ map: E.textTex('HALAL FOOD', { w: 512, h: 96, color: '#d23a2a', font: '700 64px "Hind",sans-serif', bg: '#ffe14f' }) }); sm.userData.lin = true; const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.3), sm); sg.position.set(FX - 0.53, 1.45, FZ); sg.rotation.y = -Math.PI / 2; g.add(sg); }
        { const NX = -9.6, NZ = CZ - 12; mb(1.6, 2.4, 2.6, NX, 1.35, NZ, E.mat('#1f4a32', { rough: 0.6 })); mb(0.05, 1.0, 2.2, NX + 0.81, 1.3, NZ, E.mat('#e8e2d0', { rough: 0.8 }), false);
          for (let i = 0; i < 10; i++) mb(0.03, 0.32, 0.22, NX + 0.84, 1.05 + Math.floor(i / 5) * 0.4, NZ - 0.9 + (i % 5) * 0.42, E.mat(['#d23a2a', '#2457c5', '#f2c21a', '#1f8a4a', '#eeece6'][i % 5]), false);
          p.addBox(NX, NZ, 0.85, 1.35); }
        // traffic lights and street signs at the four corners of the crossing
        const red = E.basic('#ff3a2a'), amb = E.basic('#ffb02a'), grn = E.basic('#3aff8a'), off = E.mat('#1a1a1c', { rough: 0.5 }), poleM = E.mat('#2a2d32', { metal: 0.5, rough: 0.5 });
        for (const [x, z, ax] of [[-6.8, CZ - 6.6, 0], [6.8, CZ + 6.6, 0], [-6.8, CZ + 6.6, 1], [6.8, CZ - 6.6, 1]]) {
          mb(0.16, 5.6, 0.16, x, 3.0, z, poleM); p.addCircle(x, z, 0.2);
          const toRoad = ax ? -Math.sign(z - CZ) : -Math.sign(x), arm = ax ? mb(0.12, 0.12, 3.6, x, 5.6, z + toRoad * 1.8, poleM) : mb(3.6, 0.12, 0.12, x + toRoad * 1.8, 5.6, z, poleM);
          const hx = ax ? x : x + toRoad * 3.4, hz = ax ? z + toRoad * 3.4 : z;
          mb(0.42, 1.2, 0.42, hx, 5.0, hz, E.mat('#2a2a2c', { rough: 0.5 }));
          const lamps = [0.35, 0, -0.35].map((dy) => { const l = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), off); l.position.set(hx, 5.0 + dy, hz); g.add(l); return l; });
          mid.lights.push({ lamps, ax });
          const sg = (txt, rotY, yy) => { const m = new THREE.MeshBasicMaterial({ map: E.textTex(txt, { w: 512, h: 96, color: '#f4f1e6', font: '700 60px "Hind",sans-serif', bg: '#1f6a3a' }), side: THREE.DoubleSide }); m.userData.lin = true; const s = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.34), m); s.position.set(x, yy, z); s.rotation.y = rotY; g.add(s); };
          sg('BROADWAY', Math.PI / 2, 3.4); sg('W 46 ST', 0, 3.8);
        }
        mid.lampM = { red, amb, grn, off };
        // steam out of the manholes
        const holes = [[-2, CZ + 16], [2.6, CZ - 14], [-1, CZ - 6]], SN = 60, sp = new Float32Array(SN * 3);
        holes.forEach(([x, z]) => { const mh = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), E.mat('#141416', { metal: 0.5, rough: 0.4 })); mh.rotation.x = -Math.PI / 2; mh.position.set(x, 0.045, z); g.add(mh); });
        for (let i = 0; i < SN; i++) mid.steamP.push({ h: holes[i % holes.length], t: mr() * 3 });
        const sgm = new THREE.BufferGeometry(); sgm.setAttribute('position', new THREE.BufferAttribute(sp, 3));
        const sm2 = new THREE.PointsMaterial({ map: E.dot(), color: new THREE.Color('#d8d4e0'), size: 1.6, transparent: true, opacity: 0.22, depthWrite: false }); sm2.userData.lin = true;
        mid.steam = new THREE.Points(sgm, sm2); mid.steam.frustumCulled = false; g.add(mid.steam);
        MB.flush();
      }

      // The same city hanging upside down above the crossing
      const upside = new THREE.Group();
      upside.add(city.clone(), ground.clone(), stripes.clone(), bb.clone());
      upside.scale.y = -1;
      upside.position.y = 66;
      g.add(upside);

      const light = new THREE.PointLight('#7a5cff', 2, 45, 1.6);
      light.position.set(0, 7, -8);
      g.add(light);
      const light2 = new THREE.PointLight('#3ff0ff', 1.5, 40, 1.6);
      light2.position.set(0, 7, 10);
      g.add(light2);

      p.grade = {
        top: '#05040c', bottom: '#2b1146', fog: '#1d0f2e', near: 14, far: 110,
        sun: '#8a7cff', sunInt: 0.35, hemi: 0.22, sunDir: [-0.3, 0.8, 0.2],
        tint: [0.98, 0.92, 1.12], expo: 1.2, sat: 1.12, stars: 0.4,
      };
      p.map = [{ t: 'rect', x: 0, z: -8, w: 60, h: 50, c: '#2b2831' }, { t: 'rect', x: 0, z: -51.5, w: 11, h: 37, c: '#2b2831' }, { t: 'rect', x: 0, z: -84, w: 54, h: 28, c: '#55524c' }];
      p.face = Math.PI;
      p.pathEnd = 18;
      p.clearR = 14;
      p.wake = (lx, lz) => Math.hypot(lx - FC[0], lz - FC[1]) < 85;   // the cabs keep going round the fountain's roundabout while it is in sight
      p.road = { hw: 5, own: true };   // the avenue carries on to the fountain as a paved road (FLIP draws it itself: own)
      const onAvenue = (lx, lz) => Math.abs(lx) < 33 && lz <= -40 && lz > -116;   // the far stretch of the avenue and its blocks
      const underVD = (lx, lz) => !!VD && VD.near(lx, lz, -8.2, VD.C + VD.RW + 2.3);   // the streets and the lot under the viaduct
      p.core = (lx, lz) => (Math.abs(lx) < 34 && lz > -40 && lz < 20) || onAvenue(lx, lz) || underVD(lx, lz);   // the block itself; the outskirts are negotiable
      p.noPier = (lx, lz) => (Math.abs(lx) < 7.5 && lz < -30) || (!!VD && VD.near(lx, lz, VD.C - VD.RW - 0.4, VD.C + VD.RW + 2.3));   // the ring road steps over the avenue and the streets under it
      p.reach = (lx, lz) => (Math.abs(lx) < 20 && lz < -20 && lz > -112 ? 8 : null);   // down the avenue you are still in the city: its night and its traffic
      p.blocks = (lx, lz) => (Math.abs(lx) < 34 && lz > -40 && lz < 20) || onAvenue(lx, lz) || underVD(lx, lz) || Math.hypot(lx - FC[0], lz - FC[1]) < FO + 3 || feet.some((f) => Math.abs(f.x - lx) < Math.max(f.w, f.d) / 2 + 2.5 && Math.abs(f.z - lz) < Math.max(f.w, f.d) / 2 + 2.5) || nearWalk(lx, lz);

      let roll = 0, rollTarget = 0, lastFlip = 0;
      const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), ps = new THREE.Vector3(), sc = new THREE.Vector3(), upV = new THREE.Vector3(0, 1, 0);
      p.update = (t, dt, f) => {
        kit.glow(0.35 + f.mid * 1.1);   // the outskirts
        buildings.forEach((b) => {
          b.m.emissiveIntensity = 0.25 + band(f, b.k, 24) * 2.2;
          const s = 0.55 + 0.45 * Math.sin(t * 2 + b.seed) * 0.3 + f.pulse * 0.7;
          b.nm.color.copy(b.nc).multiplyScalar(Math.min(1.6, s + 0.3));
        });
        // Midtown: screens pulse with their bands, the ticker runs, cabs drive, people walk, the lights change, steam rises
        mid.screens.forEach((s2) => { const v = 0.55 + band(f, s2.k * 3 % 24, 24) * 0.8 + Math.sin(t * 1.3 + s2.seed) * 0.08; s2.m.color.setRGB(v, v, v); });
        if (mid.ticker) mid.ticker.offset.x = (t * 0.035) % 1;
        mid.cabs.forEach((c) => { const sl = cabLoop.slow[Math.min(cabLoop.n, Math.floor((c.s / cabLoop.L) * cabLoop.n))] || 1; c.s = (((c.s + c.v * sl * dt) % cabLoop.L) + cabLoop.L) % cabLoop.L; if (!(c.s >= 0)) c.s = 0;   // slower round the roundabouts; always on the loop, whatever dt was
          const u = (c.s / cabLoop.L) * cabLoop.n, i = Math.min(cabLoop.n - 1, Math.floor(u)), a = cabLoop.P[i], b2 = cabLoop.P[i + 1], k = u - i;
          c.c.position.set(a.x + (b2.x - a.x) * k, 0.03, a.z + (b2.z - a.z) * k);
          const want = Math.atan2(b2.x - a.x, b2.z - a.z), d = Math.atan2(Math.sin(want - c.yaw), Math.cos(want - c.yaw)); c.yaw = Math.abs(d) > 2.5 ? want : c.yaw + d * Math.min(1, dt * 8); c.c.rotation.y = c.yaw; });
        { const folk = mid.peds; mid.ped.forEach((q, i) => { q.z += q.dir * q.v * dt; if (q.z > 14) q.z = -66; if (q.z < -66) q.z = 14; m4.compose(ps.set(q.x, 0.15 + Math.abs(Math.sin(t * 6 * q.v + q.ph)) * 0.04, q.z), qq.setFromAxisAngle(upV, q.dir > 0 ? 0 : Math.PI), sc.set(1, 1, 1)); folk.set(i, m4); }); folk.done(); }
        { const ph2 = (t % 15) / 15, avenue = ph2 < 0.4 ? 'g' : ph2 < 0.5 ? 'a' : 'r', cross = ph2 < 0.5 ? 'r' : ph2 < 0.9 ? 'g' : 'a', L = mid.lampM;
          mid.lights.forEach((lt) => { const st = lt.ax ? cross : avenue; lt.lamps[0].material = st === 'r' ? L.red : L.off; lt.lamps[1].material = st === 'a' ? L.amb : L.off; lt.lamps[2].material = st === 'g' ? L.grn : L.off; }); }
        { const a = mid.steam.geometry.attributes.position; mid.steamP.forEach((q, i) => { q.t += dt * (0.6 + (i % 5) * 0.1); if (q.t > 3) q.t = 0; a.setXYZ(i, q.h[0] + Math.sin(q.t * 2 + i) * 0.25 * q.t, 0.2 + q.t * 1.3, q.h[1] + Math.cos(q.t * 1.7 + i) * 0.2 * q.t); }); a.needsUpdate = true; }
        if (termClock.length) { const d = new Date(), mnt = d.getMinutes() + d.getSeconds() / 60; termClock[0].rotation.z = -((d.getHours() % 12) + mnt / 60) / 12 * Math.PI * 2; termClock[1].rotation.z = -mnt / 60 * Math.PI * 2; }
        light.intensity = 1.2 + f.bass * 5;
        light2.intensity = 0.8 + f.high * 4;
        if (f.beat && f.beats % 16 === 0 && t - lastFlip > 5) { rollTarget += Math.PI; lastFlip = t; }
        roll += (rollTarget - roll) * Math.min(1, dt * 2.2);
      };
      p.shot = (t) => ({ pos: [Math.sin(t * 0.09) * 3, 2.2, 10], look: [0, 30, -14], roll });
    },
  };

  /* ------------------------------------------------------------------ */
  /* STEREOTYPE — monochrome grid of identical figures, one in colour    */
  /* ------------------------------------------------------------------ */
  PLACES.park = {
    build(p, E) {
      // The park's paint is quietened: every colour keeps its hue but loses most of its saturation and lifts a little toward
      // a pale cream, so the rides read as one painted set and only the lamps and the ride you are near catch the eye.
      const calm = (hex) => { if (typeof hex !== 'string' || hex[0] !== '#') return hex; const c = new THREE.Color(hex), h = {}; c.getHSL(h); c.setHSL(h.h, h.s * 0.32, h.l * 0.88 + 0.09); return '#' + c.getHexString(); };
      { const E0 = E; E = Object.assign(Object.create(E0), { mat: (hex, o, u) => E0.mat(calm(hex), o, u) }); }
      // The amusement park: a Ferris wheel at the back, a carousel in the middle, a drop tower and a little roller
      // coaster either side, a gate at the front, people queuing. Two songs live here, each heard riding something:
      // this place is the carousel's (its view rides a horse); the wheel's is PLACES.parkwheel, which borrows the wheel
      // built here (SW.parkRide). The rides keep time with the music.
      //
      // It stands in the crater of an old volcano: a ring of dark, craggy cliffs (the hills run on into it from KEYAKI's
      // mountain; game.js builds the rock from p.relief), a lagoon in the middle that boats can cross, and an iron harbour
      // of riveted plate, pipes, catwalks and steam round it. The fairground is a quay 0.9 m above the water (FY): the
      // group `g` holds everything that stands on it, `gw` what is placed at world heights (the water, the tunnels, the
      // cliff dressing). The way in from the plaza is a tunnel through the south wall, under C1; a cave in the west cliff
      // takes a canal out of the lagoon towards OHH (SW.Caldera.portal: the next tunnel starts there).
      const gw = p.group, g = new THREE.Group(), r = E.rng(53), FY = 0.9; g.position.y = FY; gw.add(g);
      const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
      const crLoop = (C, n) => { const out = [], N = C.length; for (let k = 0; k < N; k++) { const p0 = C[(k + N - 1) % N], p1 = C[k], p2 = C[(k + 1) % N], p3 = C[(k + 2) % N]; for (let i = 0; i < n; i++) { const t = i / n; out.push(p1.map((_, j) => 0.5 * (2 * p1[j] + (p2[j] - p0[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t * t * t))); } } return out; };   // a closed Catmull-Rom loop
      const inPoly = (P, x, z) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
      const polyD = (P, x, z, o) => { let best = 1e18, bi = 0; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[j], b = P[i], ex = b[0] - a[0], ez = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / (ex * ex + ez * ez))), dx = a[0] + ex * t - x, dz = a[1] + ez * t - z, d = dx * dx + dz * dz; if (d < best) { best = d; bi = t < 0.5 ? j : i; } } if (o) o.i = bi; return Math.sqrt(best); };
      // The crater floor: its edge is the foot of the cliffs. Each bend carries the height the wall rises to there and how
      // far its outer slope runs (game.js keeps it under the elevated roads: C1 flies just over the south wall, the ramp
      // from C1 to the ring road over the east one, so those stay lower; the west, towards KEYAKI, is the highest).
      const FLOOR = crLoop([[0, 10, 10, 8], [17, 12, 10, 8], [32, 1, 11, 9], [35, -18, 13, 10], [33, -35, 14, 10], [24, -50, 14, 9], [6, -50.5, 12, 8],   // (wider on the east than it was: the rides there stand apart, under the ramp to the ring road flying 13 m over the edge)
         [-10, -49, 13, 8], [-24, -44, 15, 10], [-33, -36, 17, 11], [-37.5, -24, 18, 10], [-36.5, -9, 17, 9], [-31.5, 0, 15, 8], [-23.5, 10.5, 12, 8], [-12, 13.5, 11, 8]], 12);
      const FB = FLOOR.reduce((o, [x, z]) => [Math.min(o[0], x), Math.max(o[1], x), Math.min(o[2], z), Math.max(o[3], z)], [1e9, -1e9, 1e9, -1e9]), NI = { i: 0 };
      const floorD = (lx, lz, o) => { if (lx < FB[0] - 40 || lx > FB[1] + 40 || lz < FB[2] - 40 || lz > FB[3] + 40) return 40; const d = polyD(FLOOR, lx, lz, o); return inPoly(FLOOR, lx, lz) ? -d : d; };   // metres outside the floor (negative inside)
      // The lagoon, in the ring the coaster runs round, with an arm out west into the cave the canal comes through.
      const CZ0 = -17, CWH = 3.4, CX0 = -37.6, CX1 = -44;   // the canal: its centre line, half its width, where the cliff is, where the cave comes out of the crater wall
      const LAGOON = crLoop([[-12.4, -5.5], [-15, -4], [-21, -3.8], [-27, -5.5], [-30.5, -9.5], [-32, CZ0 + CWH], [-35.4, CZ0 + CWH], [-37.4, CZ0 + 1.25], [CX1 - 0.6, CZ0 + 1.25], [CX1 - 0.6, CZ0 - CWH], [-36, CZ0 - CWH], [-32, CZ0 - CWH], [-30.5, -24], [-27, -27], [-21, -27.8], [-15.5, -26.5], [-12.6, -23], [-12, -17], [-12, -11]], 8);   // in the cave the arm keeps to its -z side: OHH's canal brings a towpath in along the +z side, level with the quay
      const SLIP = { z0: -9.6, z1: -6.6, x0: -15.6, x1: -12.2 };   // a slipway from the east quay's edge down into the water
      const PIER = { x0: -18.6, x1: -11.6, z0: -16.2, z1: -13.8 };   // the iron pier the submarine is moored to
      const inLagoon = (lx, lz) => lx > -46 && lx < -11 && lz > -29 && lz < -2.5 && inPoly(LAGOON, lx, lz);
      const inSlip = (lx, lz) => lz > SLIP.z0 && lz < SLIP.z1 && lx > SLIP.x0 && lx < SLIP.x1;
      const onPier = (lx, lz) => lx > PIER.x0 && lx < PIER.x1 && lz > PIER.z0 && lz < PIER.z1;
      const wet = (lx, lz) => inLagoon(lx, lz) || (inSlip(lx, lz) && lx < -12.4);
      p.waterShape(wet);
      // The way in: a tunnel through the south wall, from an open cutting under C1 (TZ1) up a gentle ramp to the quay (TZ0).
      const TW = 3, TZ0 = 10, TZ1 = 17.5, VH = 4.4, CZ_CAR = -9;   // CZ_CAR: where the carousel stands
      const SPIRES = [[-45, -31, 7, 4], [-42, -4, 5, 3.5], [33, -38, 4, 3.5], [-21, -54, 5, 3.5], [25, -52, 3, 3], [-46, -18, 4, 4]];
      const DC = 3.5, CWD = 2.5;   // the cliff's depth (foot to brink) and the crest's width
      // The multi-storey car park in the back right corner, half on the floor, half cut into the crater wall, under the
      // ramp up to the ring road (17-19 m over it): four levels (the ground and three decks, LV), a straight ramp up each
      // side lane in turn (west lane: ground to 1, then 2 to 3; east lane: 1 to 2), the decks in the middle, landings across
      // both ends. You walk in from the fair at its south face. cpY: the surface under you at your height (relative to the floor).
      const CP = { x0: 30, x1: 45, z0: -47, z1: -29, wl: 33, el: 42, n: -45, s: -31 }, LV = [0, 3.1, 6.2, 9.3];
      const inCP = (lx, lz, m = 0) => lx > CP.x0 - m && lx < CP.x1 + m && lz > CP.z0 - m && lz < CP.z1 + m;
      const cpD = (lx, lz) => Math.max(CP.x0 - lx, lx - CP.x1, CP.z0 - lz, lz - CP.z1);   // metres outside it (negative inside)
      const cpSurf = (lx, lz) => {
        const tN = Math.max(0, Math.min(1, (CP.s - lz) / (CP.s - CP.n))), mid = lx > CP.wl && lx < CP.el, along = lz > CP.n && lz < CP.s, out = [0];
        if (mid && along) out.push(LV[1], LV[2], LV[3]);
        if (lz <= CP.n) out.push(LV[1], LV[3]);
        if (lz >= CP.s) out.push(LV[2]);
        if (lx <= CP.wl && along) out.push(LV[1] * tN, LV[2] + (LV[3] - LV[2]) * tN);
        if (lx >= CP.el && along) out.push(LV[1] + (LV[2] - LV[1]) * (1 - tN));
        return out;
      };
      const cpY = (lx, lz, y) => { const c = cpSurf(lx, lz); if (y === undefined) return Math.max(...c); let b = 0; for (const h of c) if (h <= y + 0.7 && h > b) b = h; return b; };
      p.rim = (lx, lz) => Math.min(floorD(lx, lz), cpD(lx, lz));
      // The lagoon's zone, on your left as you come in from the tunnel: a ring of its own rock stands round the quay, up to
      // 11 m, open on the east towards the carousel (and over the slipway and the pier), the west closed by the crater wall
      // itself, where the canal comes in from OHH. It stays down where the coaster runs over it (coastPts, set once the
      // track exists) and clear of the carousel. A volcano smokes on an island in the lagoon (below).
      let coastPts = null;
      // The zone is shut on the west, north and south by the crater wall itself; on the east, between the coaster and the
      // rest of the fair, a ridge of its own rock runs north from the way in (the gap facing the carousel, over the slipway and
      // the pier) to the back of the crater, notched where the coaster's track crosses it.
      const EAST = [[-6.8, -38.5], [-6.6, -33], [-7.4, -26.5], [-8.2, -20.5], [-8.6, -18.2]];
      const segD = (pts, x, z) => { let b = 1e9, t0 = 0; for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx2, bz2] = pts[i + 1], ex = bx2 - ax, ez = bz2 - az, t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez))), d = Math.hypot(ax + ex * t - x, az + ez * t - z); if (d < b) { b = d; t0 = (i + t) / (pts.length - 1); } } return [b, t0]; };
      const innerRing = (lx, lz) => {
        if (lx > -1 || lx < -16 || lz > -14 || lz < -44) return 0;
        const [d, u] = segD(EAST, lx, lz); if (d > 4.2) return 0;
        let h = 10.5 * (1 - sm(1.0, 4.2, d)) * sm(0, 0.12, u) * sm(1, 0.82, u);   // down at both ends: into the back wall, and at the way in
        h *= sm(8.5, 11, Math.hypot(lx, lz - CZ_CAR));   // clear of the carousel
        h += (1.3 * Math.sin(lx * 0.9 + lz * 0.4) * Math.cos(lz * 0.8 - lx * 0.3) + 0.9 * Math.abs(Math.sin(lx * 2.1 + lz * 2.7))) * Math.min(1, h / 3);   // crags
        if (coastPts) for (const [x, z, y] of coastPts) if (Math.abs(x - lx) < 1.6 && Math.abs(z - lz) < 1.6) h = Math.min(h, y - 2.4);   // the coaster's track cuts its own notch through it
        return Math.max(0, h);
      };
      p.relief = (lx, lz, out) => {   // the crater wall, metres (game.js caps it under the roads and lays it in the hill field)
        const d = floorD(lx, lz, NI); if (d <= 0) { out.rock = 1; return innerRing(lx, lz); }
        if (d > 30) return 0;
        const q = FLOOR[NI.i], Hc = q[2], Wo = q[3];
        let h, t = 0;
        if (d < DC) { if (d < 0.8) return 0; h = Hc * Math.pow((d - 0.8) / (DC - 0.8), 0.8); }   // the foot starts a little out from the edge: the grid's 2 m cells would otherwise carry the slope in over the paving
        else if (d < DC + CWD) h = Hc;
        else { t = (d - DC - CWD) / Wo; if (t >= 1) return 0; h = Hc * Math.pow(1 - t, 1.5); }
        h += (1.4 * Math.sin(lx * 0.83 + lz * 0.37) * Math.cos(lz * 0.71 - lx * 0.29) + 0.9 * Math.sin(lx * 1.61 - lz * 1.27 + 1.3) + 0.7 * Math.abs(Math.sin(lx * 2.3 + lz * 2.9))) * Math.min(1, d / 2) * Math.min(1, h / 4);   // crags
        if (d > DC) for (const [sx, sz, sh, sr] of SPIRES) { const k = ((lx - sx) ** 2 + (lz - sz) ** 2) / (sr * sr); if (k < 6) h += sh * Math.exp(-k * 1.4); }
        if (lz > TZ1) h *= sm(TW + 0.4, TW + 3.6, Math.abs(lx));   // the cutting the path comes up to the tunnel in
        h *= sm(0.6, 5, cpD(lx, lz));   // cut back round the car park
        out.rock = 1 - 0.55 * t;
        return Math.max(0, h);
      };
      // In the tunnel the ground is its ramp, not the rock over it; in the cave, the canal.
      const inTun = (lx, lz) => Math.abs(lx) < TW + 0.2 && lz > TZ0 - 0.6 && lz < TZ1 + 0.2, inCave = (lx, lz) => Math.abs(lz - CZ0) < CWH + 0.6 && lx < CX0 + 0.8 && lx > CX1 - 0.6;
      p.bore = (lx, lz, y) => (inTun(lx, lz) && y < FY + 3 ? FY * Math.max(0, Math.min(1, (TZ1 - lz) / (TZ1 - TZ0))) : inCave(lx, lz) && y < 3 ? 0 : null);
      p.ceil = (lx, lz) => (Math.abs(lx) < TW + 0.6 && lz > TZ0 - 0.4 && lz < TZ1 + 0.3 ? FY + VH - 0.5 : inCave(lx, lz) && lx < CX0 - 0.6 ? 4.6 : null);   // the camera stays under the vault
      p.holeAt = (lx, lz, y) => (Math.abs(lx) < TW + 1.8 && lz > TZ0 - 1.6 && lz < TZ1 + 2.6 && y < FY + VH + 1.3) || (Math.abs(lz - CZ0) < CWH + 2 && lx > CX1 - 0.4 && lx < CX0 + 1.6 && y < 6.4);   // open the rock at the tunnel and cave mouths
      p.noPier = (lx, lz) => (Math.abs(lx) < 8 && lz > 6 && lz < 32) || floorD(lx, lz) < 2 || inCP(lx, lz, 2);   // no pier in the cutting, nor on the crater floor (the roads span it)
      p.ground = (lx, lz, y) => {
        if (inCP(lx, lz)) return FY + cpY(lx, lz, y === undefined ? undefined : y - FY);   // the car park's levels and ramps, for whoever is on them
        if (lx < FB[0] - 1 || lx > FB[1] + 1 || lz < FB[2] - 1 || lz > FB[3] + 1) return 0;
        if (inSlip(lx, lz)) return FY * Math.max(0, Math.min(1, (lx - SLIP.x0) / (SLIP.x1 - SLIP.x0)));
        if (onPier(lx, lz) && (y === undefined || y > 0.45)) return FY;   // a boat goes on under it (the piles keep it out)
        if (inLagoon(lx, lz)) return 0;
        return floorD(lx, lz) < 0.2 ? FY : 0;
      };

      // the floor: the crater's paving, round the lagoon (the lagoon cuts in where its cave arm crosses the edge)
      const minus = (F, W) => {   // F with what W covers cut away, where W's edge crosses F's twice (the cave arm): F's own edge outside W, then W's edge inside F
        const nF = F.length, nW = W.length, hits = [];
        for (let i = 0; i < nF; i++) for (let j = 0; j < nW; j++) {
          const a = F[i], b = F[(i + 1) % nF], c = W[j], d = W[(j + 1) % nW], rx = b[0] - a[0], rz = b[1] - a[1], sx = d[0] - c[0], sz = d[1] - c[1], den = rx * sz - rz * sx;
          if (Math.abs(den) < 1e-12) continue;
          const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / den, u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / den;
          if (t >= 0 && t < 1 && u >= 0 && u < 1) hits.push({ i, j, pt: [a[0] + rx * t, a[1] + rz * t] });
        }
        if (hits.length !== 2) return { outline: F, shore: W };
        let [S, T] = hits; if (inPoly(W, ...F[(S.i + 1) % nF])) [S, T] = [T, S];   // F's arc forward from S to T is the one outside W
        const out = [S.pt]; for (let i = (S.i + 1) % nF; ; i = (i + 1) % nF) { out.push(F[i]); if (i === T.i) break; } out.push(T.pt);
        const shore = [T.pt], fwd = inPoly(F, ...W[(T.j + 1) % nW]);   // then along W, the way that stays inside F, back to S
        for (let j = fwd ? (T.j + 1) % nW : T.j; ; j = (j + (fwd ? 1 : -1) + nW) % nW) { shore.push(W[j]); if (j === (fwd ? S.j : (S.j + 1) % nW)) break; }
        shore.push(S.pt);
        return { outline: out.concat(shore.slice(1, -1)), shore };
      };
      const FLOORM = minus(FLOOR.map(([x, z]) => [x, z]), LAGOON);   // .shore: the quay edge, from the cave's south bank round to its north bank
      { const sh = new THREE.Shape(FLOORM.outline.map(([x, z]) => new THREE.Vector2(x, -z))), geo = new THREE.ShapeGeometry(sh); geo.rotateX(-Math.PI / 2);
        const floor = new THREE.Mesh(geo, E.mat('#8f857a', { map: E.tex('paving', 0.24, 0.24), rough: 0.88 })); floor.position.y = 0.03; floor.receiveShadow = true; g.add(floor); p.pick(floor); }
      const PB = E.batch(g), pb = PB.box, PW = E.batch(gw), pw = PW.box;
      const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
      const stripes = (a, b, n) => canvasTex(256, 64, (c, w, h) => { for (let i = 0; i < n; i++) { c.fillStyle = calm(i % 2 ? b : a); c.fillRect((i * w) / n, 0, w / n + 1, h); } });
      const white = E.mat('#eeece6', { rough: 0.5 }), steel = E.mat('#b9bec4', { metal: 0.7, rough: 0.35 }), dark = E.mat('#2a2c30', { metal: 0.4, rough: 0.5 });
      const C = ['#e8b23a', '#3fa7d6', '#6cc070', '#9b7bd8', '#ef7a3a'].map((c) => E.mat(c, { rough: 0.5 }));
      const glow = (hex) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).convertSRGBToLinear().multiplyScalar(1.4) }); m.userData.lin = true; return m; };
      const glowMat = (hex) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).convertSRGBToLinear() }); m.userData.lin = true; return m; };
      // the harbour's iron: riveted plate gone rusty at the seams, darker iron, brass and copper fittings, the crater's basalt
      const plate = canvasTex(128, 128, (x, w, h) => { x.fillStyle = '#4c4139'; x.fillRect(0, 0, w, h); const q = E.rng(5);
        for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(${120 + q() * 40},${60 + q() * 25},${30 + q() * 15},${0.12 + q() * 0.2})`; x.beginPath(); x.ellipse(q() * w, q() * h, 4 + q() * 14, 2 + q() * 8, q() * 3, 0, 7); x.fill(); }
        for (let i = 0; i < 26; i++) { x.fillStyle = 'rgba(110,55,25,.22)'; const sx = q() * w; x.fillRect(sx, 0, 1 + q() * 2, h * (0.3 + q() * 0.7)); }   // rust running down
        x.fillStyle = '#2a231e'; x.fillRect(0, 0, w, 3); x.fillRect(0, 0, 3, h); x.fillRect(0, h / 2 - 1, w, 2);
        for (let k = 0; k < 2; k++) for (let i = 0; i < 8; i++) for (const [px, py] of [[i * 16 + 8, 7 + k * h / 2], [7, i * 16 + 8]]) { x.fillStyle = '#211b17'; x.beginPath(); x.arc(px + 0.6, py + 0.6, 2.2, 0, 7); x.fill(); x.fillStyle = '#8a7462'; x.beginPath(); x.arc(px, py, 1.6, 0, 7); x.fill(); } });
      const iron = E.mat('#ffffff', { map: plate, metal: 0.55, rough: 0.6 }), ironD = E.mat('#35302c', { metal: 0.6, rough: 0.5 }), rust = E.mat('#7a4a2e', { rough: 0.8, metal: 0.3 });
      const brass = E.mat('#c09848', { metal: 0.85, rough: 0.3 }), copper = E.mat('#b0683c', { metal: 0.8, rough: 0.35 }), basalt = E.mat('#5d554f', { map: E.tex('rock', 1, 1), rough: 0.95 }), basaltD = E.mat('#45403c', { map: E.tex('rock', 1, 1), rough: 0.95 });
      const lampM = glowMat('#ffc47a'), stoneM = E.mat('#6e665e', { map: E.tex('concrete', 1, 1), rough: 0.9 });
      const ribbon = (pts, prof, m, close) => {   // a strip along pts: prof(i, point, normal) -> [[x, y, z] ...] across, the same count each time
        const pos = [], uv = [], idx = []; let acc = 0, w = 0;
        pts.forEach((q, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, n = [(b[1] - a[1]) / l, -(b[0] - a[0]) / l];
          if (i) acc += Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]);
          const row = prof(i, q, n); w = row.length; row.forEach((v, k) => { pos.push(...v); uv.push(acc / 3, k / (row.length - 1)); });
          if (i < pts.length - 1) for (let k = 0; k < w - 1; k++) { const a0 = i * w + k, b0 = a0 + w; idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1); } });
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
        const o = new THREE.Mesh(geo, m); o.receiveShadow = true; return o; };

      const Y1 = new THREE.Vector3(0, 1, 0), along = (o, a, b) => { o.position.copy(a).add(b).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(Y1, b.clone().sub(a).normalize()); return o; };   // stand a y-axis mesh between a and b (its parent's frame: lookAt would take them as world points)
      // The lagoon: deep green water at the river's level (0.05, world), so a boat goes on from it into the canal.
      const lagoonM = new THREE.ShaderMaterial({
        uniforms: { t: { value: 0 }, level: { value: 0 }, a: { value: new THREE.Color('#ffc890') }, b: { value: new THREE.Color('#3f8a7e') }, c: { value: new THREE.Color('#1a4a46') }, nrm: { value: E.waterN }, sunD: { value: new THREE.Vector3(0.55, 0.45, 0.3).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), p.rot) } },
        vertexShader: 'varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
        fragmentShader: 'uniform float t,level;uniform vec3 a,b,c,sunD;uniform sampler2D nrm;varying vec3 vW;void main(){' + E.WATER_GLSL + 'vec3 col=mix(c,b,.3+.22*(wn1.x+wn2.y));col*=.86+(wn1.z+wn2.z)*.08;col+=a*wSp*(.6+level*1.2)+b*wFr*.5;gl_FragColor=vec4(pow(col,vec3(2.2)),1.);}',
      });
      { const geo = new THREE.ShapeGeometry(new THREE.Shape(LAGOON.map(([x, z]) => new THREE.Vector2(x, -z)))), gp = geo.attributes.position; for (let k = 0; k < gp.count; k++) gp.setX(k, Math.max(CX1, gp.getX(k))); geo.rotateX(-Math.PI / 2);   // the arm's rounded tip ends square at the cave's far end, where the canal's own water takes over (it showed in front of the canal's portal)
        lagoonM.polygonOffset = true; lagoonM.polygonOffsetFactor = -1; lagoonM.polygonOffsetUnits = -6;   // the ground plane is only 5 cm under it: from up on the rim the depth buffer can't tell them apart
        const w = new THREE.Mesh(geo, lagoonM); w.position.y = 0.05; gw.add(w); p.pick(w); }
      // The quay: a wall of riveted plate from under the water up to the paving, a stone coping, an iron railing (not at the
      // slipway or the pier), and posts that keep walkers on the quay and boats off it.
      const SH = FLOORM.shore, shoreIn = (q, n) => (inPoly(LAGOON, q[0] + n[0] * 0.3, q[1] + n[1] * 0.3) ? [-n[0], -n[1]] : n);   // the normal pointing in over the quay
      const gapAt = (x, z) => x > -13.2 && ((z > SLIP.z0 - 0.15 && z < SLIP.z1 + 0.15) || (z > PIER.z0 - 0.15 && z < PIER.z1 + 0.15));
      { const ds = (m) => { const c = m.clone(); c.side = THREE.DoubleSide; c.onBeforeCompile = m.onBeforeCompile; return c; };   // whichever way the shore happens to run
        gw.add(ribbon(SH, (i, q) => [[q[0], -0.7, q[1]], [q[0], FY + 0.05, q[1]]], ds(iron)));
        gw.add(ribbon(SH, (i, q, n) => { const m = shoreIn(q, n); return [[q[0] - m[0] * 0.08, FY + 0.12, q[1] - m[1] * 0.08], [q[0] + m[0] * 0.55, FY + 0.12, q[1] + m[1] * 0.55]]; }, ds(stoneM))); }
      { let last = null, n = 0; const R2 = [SH[0]];   // the shore again, a point every 0.75 m: posts that close up for walker and boat alike
        for (let i = 1; i < SH.length; i++) { const a = SH[i - 1], b = SH[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(L / 0.75)); for (let j = 1; j <= k; j++) R2.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]); }
        for (let i = 0; i < R2.length; i++) { const q = R2[i];
          const a = R2[Math.max(0, i - 1)], b = R2[Math.min(R2.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, m = shoreIn(q, [(b[1] - a[1]) / l, -(b[0] - a[0]) / l]), x = q[0] + m[0] * 0.2, z = q[1] + m[1] * 0.2;
          if (gapAt(x, z)) { last = null; continue; }
          p.addCircle(x, z, 0.42).keep = 1;   // keep: OHH's canal, which lifts what stands over its cave, leaves these be (they stand on the quay)
          if (n++ % 2) continue;   // a railing post every other one
          pw(0.07, 1.05, 0.07, x, FY + 0.6, z, ironD);
          if (last) { const o = pw(Math.hypot(x - last[0], z - last[1]) + 0.05, 0.06, 0.06, (x + last[0]) / 2, FY + 1.12, (z + last[1]) / 2, ironD, false); o.rotation.y = -Math.atan2(z - last[1], x - last[0]); const o2 = pw(Math.hypot(x - last[0], z - last[1]), 0.035, 0.035, (x + last[0]) / 2, FY + 0.62, (z + last[1]) / 2, ironD, false); o2.rotation.y = o.rotation.y; }
          last = [x, z]; } }
      // the slipway: a ramp of plate from the quay down under the water, railed both sides, for going out on the water
      { const x1 = SLIP.x1, len = x1 - SLIP.x0, zc = (SLIP.z0 + SLIP.z1) / 2, ang = Math.atan2(FY + 0.2, len), rp = pw(Math.hypot(len, FY + 0.2), 0.12, SLIP.z1 - SLIP.z0, (SLIP.x0 + x1) / 2, FY / 2 - 0.06, zc, iron); rp.rotation.z = ang;
        for (const z of [SLIP.z0, SLIP.z1]) { for (let x = SLIP.x0 + 0.4; x < x1; x += 0.8) p.addCircle(x, z + (z < zc ? -0.3 : 0.3), 0.35); const hr = pw(Math.hypot(len, FY), 0.05, 0.05, (SLIP.x0 + x1) / 2, FY / 2 + 0.95, z, ironD, false); hr.rotation.z = Math.atan2(FY, len); for (let k = 0; k <= 3; k++) { const x = SLIP.x0 + 0.3 + (k / 3) * (len - 0.4); pw(0.06, 1.0, 0.06, x, FY * ((x - SLIP.x0) / len) + 0.45, z, ironD); } } }
      // the iron pier, on piles; a boat can't get in under it
      { const { x0, x1, z0, z1 } = PIER, xc = (x0 + x1) / 2, zc = (z0 + z1) / 2;
        pw(x1 - x0, 0.18, z1 - z0, xc, FY + 0.02, zc, iron); pw(x1 - x0, 0.3, 0.12, xc, FY - 0.2, z0, ironD); pw(x1 - x0, 0.3, 0.12, xc, FY - 0.2, z1, ironD);
        for (let x = x0 + 0.2; x < x1 - 0.5; x += 1.4) for (const z of [z0, z1]) { pw(0.22, FY + 1, 0.22, x, (FY - 1) / 2, z, rust); p.addCircle(x, z, 0.4, -1e9, 0.5); }
        for (let z = z0 + 0.2; z <= z1 - 0.2; z += 0.6) p.addCircle(x0, z, 0.35, -1e9, 0.5);
        for (const z of [z1]) { for (let x = x0 + 0.3; x < x1 - 0.4; x += 0.9) p.addCircle(x, z + 0.05, 0.3, 0.45, 1e9); pw(x1 - x0 - 0.4, 0.06, 0.06, xc - 0.2, FY + 1.1, z, ironD, false); for (let x = x0 + 0.2; x < x1 - 0.3; x += 1.4) pw(0.06, 1.0, 0.06, x, FY + 0.6, z, ironD); }   // the south rail; the north side is the berth
        for (let z = z0 + 0.3; z < z1; z += 0.6) p.addCircle(x0 - 0.05, z, 0.3, 0.45, 1e9); pw(0.06, 0.06, z1 - z0, x0, FY + 1.1, zc, ironD, false);
        for (let x = x0 + 0.3; x < x1 - 0.2; x += 0.7) p.addCircle(x, z0 - 0.05, 0.3, 0.45, 1e9);   // the berth side: no rail (the lines and the gangway), but no stepping off either
        for (const x of [x0 + 1, x0 + 4.2, x1 - 1.2]) { const bo = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.42, 10), ironD); bo.position.set(x, FY + 0.3, z0 + 0.25); gw.add(bo); p.addCircle(x, z0 + 0.25, 0.25, 0.45, 1e9); } }
      // Walkers stop at the foot of the cliffs (the camera too: boxes along the edge, turned to it).
      { const out = (x, z, n) => (floorD(x + n[0] * 0.6, z + n[1] * 0.6) > 0 ? n : [-n[0], -n[1]]);
        let acc = 0, a = FLOOR[0];
        for (let i = 1; i <= FLOOR.length; i++) { const b = FLOOR[i % FLOOR.length]; acc += Math.hypot(b[0] - a[0], b[1] - a[1]); if (acc < 3.4 && i < FLOOR.length) continue;
          const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, n = out(mx, mz, [(b[1] - a[1]) / L, -(b[0] - a[0]) / L]);
          if (!(Math.abs(mx) < TW + 1 && mz > 6) && !(Math.abs(mz - CZ0) < CWH + 0.8 && mx < -34) && !inCP(mx, mz, 1.5)) { const bx = p.addBox(mx + n[0] * 0.6, mz + n[1] * 0.6, L / 2 + 0.25, 0.75, -1e9, FY + 3), al = p.rot + Math.atan2(-(b[1] - a[1]), b[0] - a[0]); bx.c = Math.cos(al); bx.s = Math.sin(al); }
          a = b; acc = 0; } }

      // The tunnel in from the plaza: lined with riveted plate on iron ribs, lamps along both walls, an iron gateway at
      // each end; it rises 0.9 m to the quay.
      { const ry = (z) => FY * Math.max(0, Math.min(1, (TZ1 - z) / (TZ1 - TZ0))), z0 = TZ0 - 0.4, z1 = TZ1 + 0.4, W2 = TW + 0.2, N = 10, zs = Array.from({ length: N + 1 }, (_, i) => z0 + ((z1 - z0) * i) / N);
        gw.add(ribbon(zs.map((z) => [0, z]), (i, q) => [[-W2, ry(q[1]) + 0.02, q[1]], [W2, ry(q[1]) + 0.02, q[1]]], E.mat('#8a8075', { map: E.tex('paving', 0.3, 0.3), rough: 0.88 })));
        const iron2 = iron.clone(), ironD2 = ironD.clone(); iron2.side = ironD2.side = THREE.DoubleSide; iron2.onBeforeCompile = ironD2.onBeforeCompile = iron.onBeforeCompile;   // seen from inside
        for (const sd of [-1, 1]) gw.add(ribbon(zs.map((z) => [0, z]), (i, q) => [[sd * W2, ry(q[1]) - 0.1, q[1]], [sd * W2, FY + VH, q[1]]], iron2));
        gw.add(ribbon(zs.map((z) => [0, z]), (i, q) => [[-W2, FY + VH, q[1]], [W2, FY + VH, q[1]]], ironD2));
        for (let z = z0 + 0.5; z < z1; z += 2) { for (const sd of [-1, 1]) pw(0.22, FY + VH - ry(z) + 0.1, 0.3, sd * (W2 - 0.1), (FY + VH + ry(z)) / 2, z, ironD); pw(2 * W2, 0.28, 0.3, 0, FY + VH - 0.14, z, ironD); }
        for (let z = z0 + 1.5; z < z1 - 0.5; z += 2) for (const sd of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.34, 0.5), lampM); l.position.set(sd * (W2 - 0.12), FY + 2.9, z); gw.add(l); }
        const tl = new THREE.PointLight(new THREE.Color('#ffb46a').convertSRGBToLinear(), 1.2, 16, 1.6); tl.position.set(0, FY + 3.6, (TZ0 + TZ1) / 2); gw.add(tl);
        for (const sd of [-1, 1]) { const b = p.addBox(sd * (W2 + 0.35), (TZ0 + TZ1) / 2, 0.4, (TZ1 - TZ0) / 2 + 0.6); b.y1 = 1e9; }
        // the gateways: an iron frame on rock at each mouth, the hill's edge hidden behind (game.js opens the rock there: p.holeAt)
        const gate = (z, sz, base, sign) => {
          for (const sd of [-1, 1]) { pw(2.6, 8.2, 2.2, sd * (W2 + 1.25), base + 3.5, z + sz * 0.6, basalt); pw(0.9, FY + VH + 1.4 - base, 1.0, sd * (W2 + 0.35), (FY + VH + 1.4 + base) / 2, z + sz * 0.1, iron); }
          pw(2 * W2 + 5.2, 3.2, 2.2, 0, FY + VH + 2.4, z + sz * 0.6, basalt); pw(2 * W2 + 1.6, 1.1, 1.0, 0, FY + VH + 0.55, z + sz * 0.1, iron);
          for (const sd of [-1, 1]) { const lp = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.6, 8), lampM); lp.position.set(sd * (W2 + 0.35), FY + VH - 0.6, z + sz * 0.7); gw.add(lp); pw(0.5, 0.08, 0.5, sd * (W2 + 0.35), FY + VH - 0.26, z + sz * 0.7, ironD); }
          for (let k = 0; k < 7; k++) { const gr = new THREE.Mesh(new THREE.TorusGeometry(0.42 + (k % 2) * 0.18, 0.07, 6, 14), brass); gr.position.set(-W2 + 0.6 + k * ((2 * W2 - 1.2) / 6), FY + VH + 0.55, z + sz * 0.62); gw.add(gr); }
          if (sign) { const sg = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 0.9), new THREE.MeshBasicMaterial({ map: E.textTex(sign, { w: 1024, h: 140, color: '#ffe2a8', glow: '#ff9a3a', font: '700 92px "Hind",sans-serif' }), transparent: true })); sg.position.set(0, FY + VH + 1.75, z + sz * 1.72); if (sz < 0) sg.rotation.y = Math.PI; gw.add(sg); }
          for (const sd of [-1, 1]) p.addCircle(sd * (W2 + 1.3), z + sz * 0.6, 1.3);
          for (let k = 0; k < 7; k++) { const sd = k % 2 ? 1 : -1, bo = new THREE.Mesh(E.rockGeo(k + (sz > 0 ? 2 : 0)), k % 3 ? basalt : basaltD), s0 = 1.1 + r() * 1.1; bo.scale.set(s0, s0 * (1 + r() * 0.6), s0); bo.position.set(k === 6 ? (r() - 0.5) * 3 : sd * (W2 + 2.2 + r() * 1.6), k === 6 ? FY + VH + 3.6 : base + (k < 2 ? 0.6 : k < 4 ? 3.4 : 6.2), z + sz * (1.2 + r() * 1.2)); bo.rotation.set(r(), r() * 6, r()); bo.castShadow = true; gw.add(bo); }   // rough the frame into the cliff
        };
        gate(TZ0, -1, FY, 'CRATER FUNFAIR'); gate(TZ1, 1, 0, 'CRATER FUNFAIR'); }

      // The canal's cave in the west cliff: a lit iron sluice frame at its mouth (the gate wound up out of the way) and a short
      // vaulted bore through the crater wall; at its far end OHH's old canal comes in (places2.js aqueduct, from SW.Caldera.portal),
      // its towpath along the +z side to the quay.
      const caveX = (SH[0][0] + SH[SH.length - 1][0]) / 2;   // where the cliff foot crosses the canal
      { const W3 = CWH + 0.5, len = caveX - CX1, xs = Array.from({ length: 9 }, (_, i) => caveX + 0.3 - ((len + 0.3) * i) / 8), VC = 5.6;
        gw.add(ribbon(xs.map((x) => [x, CZ0]), (i, q) => Array.from({ length: 13 }, (_, k) => { const a = (Math.PI * k) / 12, sz = Math.cos(a) * W3; return [q[0], k === 0 || k === 12 ? -0.6 : 1.4 + Math.sin(a) * (VC - 1.4), CZ0 + sz]; }), (() => { const m = E.mat('#5a524c', { map: E.tex('rock', 2, 1), rough: 0.95 }, true); m.side = THREE.DoubleSide; return m; })()));
        for (const sd of [-1, 1]) p.addBox((caveX + CX1) / 2, CZ0 + sd * (W3 + 0.3), (caveX - CX1) / 2 + 0.3, 0.4);
        for (let x = caveX - 1.2; x > CX1 + 0.6; x -= 2.2) for (const sd of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.12), lampM); l.position.set(x, sd > 0 ? 3.0 : 2.6, CZ0 + sd * (W3 - (sd > 0 ? 0.42 : 0.3))); gw.add(l); }   // over the towpath, above head height
        const cl = new THREE.PointLight(new THREE.Color('#ffa860').convertSRGBToLinear(), 1.3, 14, 1.6); cl.position.set((caveX + CX1) / 2, 3.2, CZ0); gw.add(cl);
        // the sluice frame: two riveted columns in guides, a girder with the winding gear, the gate wound up under it, lamps
        const fx = caveX + 0.35, fz = (sd) => CZ0 + sd * (W3 + 0.35);
        for (const sd of [-1, 1]) { pw(0.9, 8.6, 0.9, fx, 3.7, fz(sd), iron); pw(0.3, 7.6, 0.3, fx + 0.35, 3.4, fz(sd) - sd * 0.5, ironD); pw(2.8, 9.4, 2.6, fx - 1.2, 4.2, fz(sd) + sd * 1.6, basaltD); p.addCircle(fx, fz(sd), 0.5); }   // (just the column: the towpath squeezes past it)
        pw(1.0, 1.0, 2 * W3 + 1.6, fx, 7.9, CZ0, iron); pw(2.6, 2.8, 2 * W3 + 5.6, fx - 1.4, 9.4, CZ0, basaltD);
        pw(0.3, 1.6, 2 * CWH + 0.2, fx + 0.1, 6.5, CZ0, iron); for (let k = 0; k < 3; k++) pw(0.36, 0.12, 2 * CWH + 0.3, fx + 0.1, 5.9 + k * 0.6, CZ0, ironD);
        for (const sd of [-1, 1]) { const gr = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.12, 6, 20), brass); gr.position.set(fx + 0.6, 7.9, CZ0 + sd * 1.6); gr.rotation.y = Math.PI / 2; gw.add(gr); const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 10), copper); hub.rotation.z = Math.PI / 2; hub.position.set(fx + 0.6, 7.9, CZ0 + sd * 1.6); gw.add(hub);
          const lp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), lampM); lp.position.set(fx + 0.7, 5.1, fz(sd)); gw.add(lp); pw(0.6, 0.1, 0.6, fx + 0.7, 5.45, fz(sd), ironD); }
        for (let k = 0; k < 9; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), lampM); b.position.set(fx + 0.55, 7.35, CZ0 - CWH + (k * 2 * CWH) / 8); gw.add(b); }
        const pl2 = new THREE.PointLight(new THREE.Color('#ffb070').convertSRGBToLinear(), 1.1, 18, 1.8); pl2.position.set(fx + 2.5, 5.5, CZ0); gw.add(pl2);
        const W = p.toWorld(caveX, CZ0), Wend = p.toWorld(CX1, CZ0), dw = p.toWorld(caveX - 1, CZ0);
        SW.Caldera = {   // world coordinates: OHH's canal (places2.js aqueduct) runs on from the cave's far end along its line
          portal: { x: W.x, z: W.z, waterY: 0.05, dir: { x: dw.x - W.x, z: dw.z - W.z }, yaw: Math.atan2(dw.x - W.x, dw.z - W.z), halfWidth: CWH, vault: VC, end: { x: Wend.x, z: Wend.z }, place: p, local: { x: caveX, z: CZ0, endX: CX1 } },
          lagoon: { x: p.toWorld(-21, -16).x, z: p.toWorld(-21, -16).z, waterY: 0.05, quayY: FY, isWater: (x, z) => { const l = p.local(x, z); return wet(l.x, l.z); }, outline: LAGOON.map(([x, z]) => p.toWorld(x, z)) },
          floorY: FY, rim: (x, z) => { const l = p.local(x, z); return floorD(l.x, l.z); },
        }; }

      // the carousel
      const CZ = CZ_CAR, car = new THREE.Group(); car.position.set(0, 0, CZ); g.add(car);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.6, 0.5, 32), white); base.position.y = 0.25; base.receiveShadow = true; g.add(base); base.position.z = CZ;
      const plat = new THREE.Mesh(new THREE.CylinderGeometry(5.0, 5.0, 0.12, 32), E.mat('#b88a5a', { rough: 0.7 })); plat.position.y = 0.56; car.add(plat);
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 4, 16), E.mat('#ffffff', { map: stripes('#e8b23a', '#eeece6', 12) })); core.position.y = 2.5; car.add(core);
      const canopy = new THREE.Mesh(new THREE.ConeGeometry(5.9, 2.2, 24, 1, true), E.mat('#ffffff', { map: stripes('#eeece6', '#d24a3a', 24), side: THREE.DoubleSide })); canopy.position.y = 5.6; canopy.material.side = THREE.DoubleSide; car.add(canopy);
      const valance = new THREE.Mesh(new THREE.CylinderGeometry(5.9, 5.9, 0.6, 24, 1, true), E.mat('#ffffff', { map: stripes('#e8b23a', '#3fa7d6', 24) })); valance.position.y = 4.3; valance.material.side = THREE.DoubleSide; car.add(valance);
      const fin = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), C[0]); fin.position.y = 6.9; car.add(fin);
      const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 5), glow('#fff2c0'), 48);
      { const m4 = new THREE.Matrix4(); for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; bulbs.setMatrixAt(i, m4.makeTranslation(Math.cos(a) * 5.95, 4.0, Math.sin(a) * 5.95)); } car.add(bulbs); }
      const horses = [], horseMs = ['#f2f0ea', '#e8d8b0', '#8a5a3a', '#2a2826', '#b9b6ae', '#d9b24a'].map((c) => E.mat(c, { rough: 0.45 }));
      const horse = (m) => { const h = new THREE.Group(); const body = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 1.3), m); h.add(body); const neck = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.7, 0.35), m); neck.position.set(0, 0.45, 0.55); neck.rotation.x = -0.4; h.add(neck); const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.55), m); head.position.set(0, 0.8, 0.8); h.add(head); for (const [x, z, a] of [[-0.15, 0.5, 0.5], [0.15, 0.5, 0.5], [-0.15, -0.5, -0.4], [0.15, -0.5, -0.4]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.1), m); l.position.set(x, -0.45, z); l.rotation.x = a; h.add(l); } h.traverse((o) => { if (o.isMesh) o.castShadow = true; }); return h; };
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2, rad = i % 2 ? 3.9 : 2.8, hh = horse(horseMs[(i * 5) % horseMs.length]);
        hh.position.set(Math.cos(a) * rad, 1.6, Math.sin(a) * rad); hh.rotation.y = -a; car.add(hh);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 4.0, 6), steel); pole.position.set(Math.cos(a) * rad, 2.6, Math.sin(a) * rad); car.add(pole);
        horses.push({ h: hh, s: i, a, rad });
      }
      p.addCircle(0, CZ, 5.6);

      // the Ferris wheel
      const WX = 4, WZ = -31, WY = 13.2, WR = 11, wheel = new THREE.Group(); wheel.position.set(WX, WY, WZ); g.add(wheel);   // at the back of the crater, its top over the rim
      // It stands on two big A-frames, one either side of the wheel: each a pair of legs from the axle out to feet 7 m either
      // side, and a crossbar well above head height, so the middle under the wheel is open and you see straight through to
      // the boarding platform where the cabins come down.
      { const beam = (a, b, w, m) => { const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz), o = new THREE.Mesh(new THREE.BoxGeometry(w, L, w), m);
          o.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / L, dy / L, dz / L)); o.castShadow = true; g.add(o); return o; };
        const SPREAD = 7, BAR = 7.4, at = (lx, y, sd) => [WX + lx * SPREAD * (1 - y / WY), y, WZ + sd * (1.4 + 0.9 * (1 - y / WY))];
        for (const sd of [-1, 1]) { for (const lx of [-1, 1]) { beam(at(lx, WY, sd), at(lx, 0, sd), 0.55, steel); p.addCircle(...[at(lx, 0, sd)[0], at(lx, 0, sd)[2]], 0.5); } beam(at(-1, BAR, sd), at(1, BAR, sd), 0.32, steel); }
        pb(4.2, 0.3, 3.2, WX, 0.15, WZ + 0.4, E.mat('#bdb6aa', { rough: 0.9 })); pb(4.2, 0.02, 0.14, WX, 0.31, WZ + 1.95, E.mat('#e8c43a', { rough: 0.5 })); }   // the boarding platform, its yellow edge
      pb(0.5, 0.5, 3.4, WX, WY, WZ, dark);
      for (const sd of [-0.75, 0.75]) { const rim = new THREE.Mesh(new THREE.TorusGeometry(WR, 0.13, 6, 64), steel); rim.position.z = sd; wheel.add(rim); const rim2 = new THREE.Mesh(new THREE.TorusGeometry(WR * 0.55, 0.08, 6, 48), steel); rim2.position.z = sd; wheel.add(rim2); }
      const NG = 16, gond = [];
      for (let i = 0; i < NG; i++) {
        const a = (i / NG) * Math.PI * 2;
        for (const sd of [-0.75, 0.75]) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.08, WR, 0.08), steel); sp.position.set((Math.cos(a) * WR) / 2, (Math.sin(a) * WR) / 2, sd); sp.rotation.z = a - Math.PI / 2; wheel.add(sp); }
        const gp = new THREE.Group(); gp.position.set(Math.cos(a) * WR, Math.sin(a) * WR, 0); wheel.add(gp);
        // an open cabin big enough to stand in: a floor, half walls in the cabin's colour, four posts and a roof
        const cm = C[i % C.length];
        const fl = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 1.3), dark); fl.position.y = -2.15; gp.add(fl);
        for (const [x, z, w, d] of [[0, 0.62, 1.8, 0.06], [0, -0.62, 1.8, 0.06], [0.87, 0, 0.06, 1.3], [-0.87, 0, 0.06, 1.3]]) { const wl = new THREE.Mesh(new THREE.BoxGeometry(w, 0.85, d), cm); wl.position.set(x, -1.68, z); wl.castShadow = true; gp.add(wl); }
        for (const [x, z] of [[0.85, 0.6], [-0.85, 0.6], [0.85, -0.6], [-0.85, -0.6]]) { const po = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.85, 0.06), steel); po.position.set(x, -1.2, z); gp.add(po); }
        const rf = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.14, 1.45), cm); rf.position.y = -0.25; rf.castShadow = true; gp.add(rf);
        const hang = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 5), dark); hang.position.y = -0.05; gp.add(hang);
        gond.push(gp);
      }
      const rimL = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 6, 5), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 64); rimL.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(64 * 3), 3);
      { const m4 = new THREE.Matrix4(); for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2; rimL.setMatrixAt(i, m4.makeTranslation(Math.cos(a) * WR, Math.sin(a) * WR, 0.95)); } wheel.add(rimL); }

      // the drop tower, at the back on the right
      const DX = 24, DZ = -39, DH = 24;
      const mast = new THREE.Mesh(new THREE.BoxGeometry(1.1, DH, 1.1), E.mat('#ffffff', { map: stripes('#eeece6', '#3fa7d6', 2), rough: 0.5 })); mast.position.set(DX, DH / 2, DZ); mast.castShadow = true; g.add(mast);
      pb(2.4, 1.2, 2.4, DX, DH + 0.6, DZ, C[3]);
      const ring = new THREE.Group(); ring.position.set(DX, 2, DZ); g.add(ring);
      const seat = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.8, 16, 1, true), C[0]); seat.material.side = THREE.DoubleSide; ring.add(seat);
      const seatF = new THREE.Mesh(new THREE.RingGeometry(0.7, 2.3, 16), dark); seatF.rotation.x = -Math.PI / 2; seatF.position.y = -0.4; ring.add(seatF);
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, fig = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.9, 8), white); fig.position.set(Math.cos(a) * 1.9, 0.2, Math.sin(a) * 1.9); ring.add(fig); const hd = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), white); hd.position.set(Math.cos(a) * 1.9, 0.82, Math.sin(a) * 1.9); ring.add(hd); }
      p.addCircle(DX, DZ, 2.5);

      // THE COASTER flies round the whole fair: out of its station by the gate, a chain lift up the west cliff over the canal's
      // arm, a crest 27 m up, a long drop behind the volcano into a vertical loop, east over the bumper cars, south between
      // the wheel and the drop tower, high over the swing ride, down over the teacups and the balloon seller and home. Not
      // a design anyone would sign off: it stands on a handful of tall columns and otherwise just flies. A five-car train
      // with riders; it crawls up the lift, then runs on what the drop gave it.
      const CK = 0.9, CTX = 2, CTZ = -5;   // the layout as drawn, scaled and moved to run round the lagoon: the lift up the west cliff, the loop at the north end, the station on the south quay
      const CPTS = [[-8.8, 1.62, 0.4], [-16, 1.62, 0.4], [-23, 1.8, -0.6], [-29, 3.6, -3.6], [-33, 8, -9], [-34.5, 14, -16], [-34, 20, -23], [-32, 24.5, -29.5], [-27, 27, -34.5],   // (in the park's frame: the station as before)
        [-20, 24, -38.5], [-13, 13, -40.5], [-8, 6, -41], [-3.5, 9, -41.4], [-2, 14.5, -41.8], [-4.5, 18.5, -42.3], [-8.5, 16, -42.8], [-8.5, 10.5, -43.2], [-5, 6.6, -43.6], [1, 7.2, -43.6],
        [8, 10, -42], [14.5, 14.5, -38.5], [19.5, 17, -32], [20.2, 20, -24], [21, 22, -16], [18.5, 18.5, -6.5], [13, 12.5, -0.5], [6.5, 9.5, 3.5], [1, 7, 2.6], [-4, 3.8, 1.3]]
        .map(([x, y, z]) => new THREE.Vector3(x, y, z));
      const cXZ = (x, z) => [x * CK + CTX, z * CK + CTZ];   // the rest of the coaster's furniture moves with it
      const coaster = new THREE.CatmullRomCurve3(CPTS, true, 'centripetal'), NS = 600, CL = coaster.getLength();
      // frames by parallel transport, so the track banks through the loop instead of flipping
      const cP = coaster.getSpacedPoints(NS), cT = [], cN = [], cB = [];
      coastPts = cP.filter((_, i) => i % 2 === 0).map((v) => [v.x, v.z, v.y + FY]);   // (for the lagoon zone's rock, which keeps under the track)
      for (let i = 0; i <= NS; i++) cT.push(coaster.getTangentAt(Math.min(1, i / NS)).clone());
      cN[0] = new THREE.Vector3(0, 1, 0).addScaledVector(cT[0], -cT[0].y).normalize();
      for (let i = 1; i <= NS; i++) { const ax = new THREE.Vector3().crossVectors(cT[i - 1], cT[i]), s = ax.length(); const n = cN[i - 1].clone(); if (s > 1e-6) n.applyAxisAngle(ax.normalize(), Math.asin(Math.min(1, s))); cN[i] = n.addScaledVector(cT[i], -n.dot(cT[i])).normalize(); }
      { const twist = Math.atan2(new THREE.Vector3().crossVectors(cN[NS], cN[0]).dot(cT[0]), cN[NS].dot(cN[0])); for (let i = 0; i <= NS; i++) cN[i].applyAxisAngle(cT[i], (twist * i) / NS); }   // close the frame up
      for (let i = 0; i <= NS; i++) cB.push(new THREE.Vector3().crossVectors(cT[i], cN[i]).normalize());
      const railCurve = (off, up) => new THREE.CatmullRomCurve3(cP.slice(0, NS).map((v, i) => v.clone().addScaledVector(cB[i], off).addScaledVector(cN[i], up)), true);
      const redM = E.mat('#d24a3a', { metal: 0.4, rough: 0.35 }), steelM = E.mat('#c9ced4', { metal: 0.7, rough: 0.3 });
      for (const off of [-0.55, 0.55]) { const rl = new THREE.Mesh(new THREE.TubeGeometry(railCurve(off, 0), NS, 0.07, 6, true), redM); rl.castShadow = true; g.add(rl); }
      { const sp = new THREE.Mesh(new THREE.TubeGeometry(railCurve(0, -0.45), NS, 0.16, 8, true), redM); sp.castShadow = true; g.add(sp); }
      { const tieG = new THREE.BoxGeometry(1.25, 0.08, 0.14), ties = new THREE.InstancedMesh(tieG, steelM, Math.floor(NS / 2)), m4 = new THREE.Matrix4();
        for (let k = 0; k < Math.floor(NS / 2); k++) { const i = k * 2, mb = new THREE.Matrix4().makeBasis(cB[i], cN[i], cT[i]); m4.copy(mb).setPosition(cP[i].clone().addScaledVector(cN[i], -0.1)); ties.setMatrixAt(k, m4); }
        g.add(ties); }
      // supports: iron columns under the track (rust-red, like the harbour's iron), every few metres where it runs the right way up
      const legM = E.mat('#6e4636', { metal: 0.45, rough: 0.55 });
      { let last = -1e9; for (let i = 0; i < NS; i++) { const v = cP[i]; if (i - last < 95 || v.y < 3 || cN[i].y < 0.6 || inLagoon(v.x, v.z) || floorD(v.x, v.z) > -0.5) continue;   // a column every 95 samples or so (about six in all), none in the water
        last = i; const h = v.y - 0.55, col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.42, h, 10), legM); col.position.set(v.x, h / 2, v.z); col.castShadow = true; g.add(col); p.addCircle(v.x, v.z, 0.45); } }
      { const k0 = cP.findIndex((v) => inLagoon(v.x, v.z) && v.x < -32), k1 = cP.findLastIndex((v) => inLagoon(v.x, v.z) && v.x < -32);   // where the lift crosses the canal: an iron truss carries it over
        if (k0 >= 0) { const a = cP[Math.max(0, k0 - 3)], b = cP[Math.min(NS - 1, k1 + 3)], mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, L = Math.hypot(b.x - a.x, b.z - a.z), yaw = Math.atan2(b.x - a.x, b.z - a.z), y0 = Math.min(a.y, b.y) - 0.7;
          for (const sd of [-1, 1]) { const ch = pb(0.18, 0.5, L, mx + Math.cos(yaw) * sd * 0.7, y0, mz - Math.sin(yaw) * sd * 0.7, ironD); ch.rotation.y = yaw; for (let k = 0; k <= 6; k++) { const t = k / 6, d = pb(0.08, 0.08, 1.6, a.x + (b.x - a.x) * t + Math.cos(yaw) * sd * 0.7, y0 - 0.55, a.z + (b.z - a.z) * t - Math.sin(yaw) * sd * 0.7, ironD); d.rotation.set(0.6 * (k % 2 ? 1 : -1), yaw, 0, 'YXZ'); } }
          for (const v of [a, b]) for (const sd of [-1, 1]) { const x = v.x + Math.cos(yaw) * sd * 0.7, z = v.z - Math.sin(yaw) * sd * 0.7, h = y0 - 0.3; pb(0.32, h, 0.32, x, h / 2, z, iron); p.addCircle(x, z, 0.3); } } }
      // the station: a platform and a striped canopy over the start
      { const [sx, sz] = cXZ(-18.5, 8.6), [cx, cz] = cXZ(-18.5, 6.4); pb(13 * CK, 1.2, 3 * CK, sx, 0.6, sz, E.mat('#a8a49c', { rough: 0.9 })); pb(14 * CK, 0.2, 7 * CK, cx, 4.3, cz, E.mat('#ffffff', { map: stripes('#eeece6', '#d24a3a', 14) })); }
      for (const x of [-25, -12]) for (const z of [3.2, 9.6]) { const [px, pz] = cXZ(x, z); pb(0.18, 4.1, 0.18, px, 2.15, pz, steelM); }
      const loopSign = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.9), new THREE.MeshBasicMaterial({ map: E.textTex('THE LOOP', { w: 512, h: 96, color: '#fff2c8', glow: '#ff9a3a', font: '700 70px "Hind",sans-serif' }), transparent: true }));
      { const [x, z] = cXZ(-18.5, 9.95); loopSign.position.set(x, 4.95, z); g.add(loopSign); const [bx, bz] = cXZ(-18.5, 8.6); p.addBox(bx, bz, 6.5 * CK, 1.5 * CK); }
      // the train: five cars, two riders each
      const riderM = ['#2b2f3a', '#7a2f2a', '#3a5a40', '#c9c2b0', '#4a6a8a', '#8a6a3a'].map((c) => E.mat(c, { rough: 0.7 })), skinM = E.mat('#e1b18c', { rough: 0.6 });
      const cars = [0, 1, 2, 3, 4].map((k) => {
        const c = new THREE.Group(), body = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.55, 1.5), C[k % C.length]); body.position.y = 0.4; body.castShadow = true; c.add(body);
        const nose = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.35, 0.3), white); nose.position.set(0, 0.55, 0.75); c.add(nose);
        for (const sx of [-0.3, 0.3]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.55, 8), riderM[(k * 2 + (sx > 0 ? 1 : 0)) % riderM.length]); t.position.set(sx, 0.85, -0.1); c.add(t); const hd = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), skinM); hd.position.set(sx, 1.25, -0.1); c.add(hd);
          for (const ax of [-0.12, 0.12]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), riderM[k % riderM.length]); arm.position.set(sx + ax, 1.3, -0.05); c.add(arm); c.userData.arms = (c.userData.arms || []).concat(arm); } }
        g.add(c); return c; });
      // speed along the track: the chain lift drags it up at walking pace, after the crest it runs on gravity
      const crestI = (() => { let b = 0; for (let i = 0; i < NS; i++) if (cP[i].y > cP[b].y) b = i; return b; })(), liftA = Math.floor(NS * 0.06), vTab = [];
      for (let i = 0; i < NS; i++) { const y = cP[i].y, onLift = i >= liftA && i <= crestI; vTab.push(onLift ? 3.4 : Math.max(2.6, Math.sqrt(Math.max(0, 3.4 * 3.4 + 2 * 9.8 * 0.9 * (cP[crestI].y - y))))); }
      let cs = 0;   // distance along the track, metres

      // the swing ride (chair-o-plane): a tower whose top turns, chairs flying out on chains as it speeds up
      const SWX = 22, SWZ = -20, swing = new THREE.Group(); swing.position.set(SWX, 7.2, SWZ); g.add(swing);
      { const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 7.2, 12), E.mat('#ffffff', { map: stripes('#eeece6', '#9b7bd8', 10) })); tw.position.set(SWX, 3.6, SWZ); tw.castShadow = true; g.add(tw); p.addCircle(SWX, SWZ, 0.9);
        const top = new THREE.Mesh(new THREE.ConeGeometry(4.2, 1.6, 24), E.mat('#ffffff', { map: stripes('#eeece6', '#3fa7d6', 24) })); top.position.y = 0.9; swing.add(top); }
      const chairs = [];
      for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, arm = new THREE.Group(); arm.rotation.y = a; swing.add(arm);
        const piv = new THREE.Group(); piv.position.x = 3.8; arm.add(piv);
        const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3.6, 4), steelM); chain.position.y = -1.8; piv.add(chain);
        const ch = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), C[i % C.length]); ch.position.y = -3.6; piv.add(ch);
        const rd = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.5, 8), riderM[i % riderM.length]); rd.position.y = -3.3; piv.add(rd);
        chairs.push(piv); }
      let swingV = 0;

      // the teacups: a turntable of spinning cups
      const TCX = 19, TCZ = -1, cups = new THREE.Group(); cups.position.set(TCX, 0.25, TCZ); g.add(cups);
      { const deck = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.3, 32), E.mat('#ffffff', { map: stripes('#eeece6', '#6cc070', 16) })); deck.position.set(TCX, 0.15, TCZ); g.add(deck); p.addCircle(TCX, TCZ, 4.7); }
      const cupL = [];
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, cp = new THREE.Group(); cp.position.set(Math.cos(a) * 2.8, 0.2, Math.sin(a) * 2.8); cups.add(cp);
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.6, 0.9, 18, 1, true), C[i % C.length]); cup.material = cup.material.clone(); cup.material.side = THREE.DoubleSide; cup.position.y = 0.45; cp.add(cup);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.06, 6, 18), white); rim.rotation.x = Math.PI / 2; rim.position.y = 0.9; cp.add(rim);
        const hd = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.06, 6, 12), white); hd.position.set(1.0, 0.55, 0); cp.add(hd);
        for (const sx of [-0.3, 0.3]) { const rd = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), skinM); rd.position.set(sx, 1.05, 0); cp.add(rd); }
        cupL.push(cp); }

      // the bumper cars: a roofed floor at the back, cars nudging about
      const BCX = 5, BCZ = -44, bump = [];
      pb(12, 0.12, 8, BCX, 0.06, BCZ, E.mat('#3a3d44', { metal: 0.5, rough: 0.35 })); pb(12.6, 0.25, 8.6, BCX, 4.3, BCZ, E.mat('#ffffff', { map: stripes('#eeece6', '#ef7a1a', 18) }));
      for (const x of [BCX - 6, BCX + 6]) for (const z of [BCZ - 4, BCZ + 4]) { pb(0.2, 4.2, 0.2, x, 2.1, z, steelM); p.addCircle(x, z, 0.25); }
      for (let i = 0; i < 6; i++) { const bc = new THREE.Group(); const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 1.6), C[i % C.length]); body.position.y = 0.35; bc.add(body); const bp = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.12, 6, 16), dark); bp.rotation.x = Math.PI / 2; bp.scale.set(0.8, 1.15, 1); bp.position.y = 0.25; bc.add(bp);
        const pole2 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3.8, 4), steelM); pole2.position.set(0, 2.1, -0.6); bc.add(pole2); const rd = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.55, 8), riderM[i % riderM.length]); rd.position.y = 0.75; bc.add(rd);
        bc.position.set(BCX + (r() - 0.5) * 9, 0.12, BCZ + (r() - 0.5) * 5); g.add(bc); bump.push({ g: bc, a: r() * 6.28, v: 1.2 + r() * 0.8, turn: 0 }); }

      // stalls along the main walk: striped roofs, lit counters
      const stall = (x, z, rot, roofC, label) => { const sg = new THREE.Group(); sg.position.set(x, 0, z); sg.rotation.y = rot; g.add(sg);
        const add = (geo, m, px, py, pz) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.castShadow = true; sg.add(o); return o; };
        add(new THREE.BoxGeometry(2.6, 1.1, 1.4), E.mat('#eeece6', { rough: 0.6 }), 0, 0.55, 0); add(new THREE.BoxGeometry(2.4, 0.06, 1.2), glowMat('#fff2d0'), 0, 1.12, 0.05);
        add(new THREE.BoxGeometry(2.9, 0.2, 1.9), E.mat('#ffffff', { map: stripes('#eeece6', roofC, 10) }), 0, 2.6, 0.1);
        for (const sx of [-1.25, 1.25]) add(new THREE.BoxGeometry(0.08, 1.5, 0.08), steelM, sx, 1.85, 0.75);
        const sg2 = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.42), new THREE.MeshBasicMaterial({ map: E.textTex(label, { w: 512, h: 96, color: '#2a2420', font: '700 60px "Hind",sans-serif', bg: '#f2ead8' }), transparent: true })); sg2.position.set(0, 2.2, 1.06); sg.add(sg2);
        const w = p.toWorld(x, z); p.addCircle(x, z, 1.4); };
      stall(-4.6, 6.4, Math.PI / 2, '#d24a3a', 'HOT DOGS'); stall(30.5, -8, -Math.PI / 2, '#3fa7d6', 'ICE CREAM'); stall(-3.6, -18, Math.PI / 2, '#e8b23a', 'CANDY FLOSS'); stall(32.4, -24.5, -Math.PI / 2, '#6cc070', 'LEMONADE');
      stall(-5.5, -42.5, 0, '#9b7bd8', 'GAMES'); stall(12.5, -43.5, 0, '#ef7a1a', 'PRIZES');
      // the car park itself (CP above): concrete slabs on columns, sloped ramps with rails, parapets, cars on every level, lights
      {
        const conc = E.mat('#9a968e', { map: E.tex('concrete', 2, 2), rough: 0.92 }), concD = E.mat('#7c786f', { map: E.tex('concrete', 2, 2), rough: 0.95 }), railM = E.mat('#c9a830', { rough: 0.5, metal: 0.3 }), tubeM = E.basic('#e8f2ff');
        const W = CP.x1 - CP.x0, Lz = CP.s - CP.n, ang = Math.atan2(LV[1], Lz), len = Math.hypot(Lz, LV[1]), xm = (CP.x0 + CP.x1) / 2, zm = (CP.n + CP.s) / 2, wlx = (CP.x0 + CP.wl) / 2, elx = (CP.el + CP.x1) / 2, midW = CP.el - CP.wl;
        const box = (w, h, d, x, y, z, m, sh = true) => pb(w, h, d, x, y, z, m, sh);
        box(W, 0.2, CP.z1 - CP.z0, xm, -0.1, (CP.z0 + CP.z1) / 2, concD);   // the ground slab (its top level with the fair's floor)
        for (const L of [LV[1], LV[2], LV[3]]) box(midW, 0.3, Lz, (CP.wl + CP.el) / 2, L - 0.15, zm, conc);   // the decks
        for (const L of [LV[1], LV[3]]) box(W, 0.3, CP.n - CP.z0, xm, L - 0.15, (CP.z0 + CP.n) / 2, conc);   // the north landings
        box(W, 0.3, CP.z1 - CP.s, xm, LV[2] - 0.15, (CP.s + CP.z1) / 2, conc);   // the south landing
        const ramp = (x, y0, up) => { const o = box(CP.wl - CP.x0, 0.3, len, x, y0 + LV[1] / 2 - 0.15, zm, conc); o.rotation.x = up ? ang : -ang;   // up: rises northwards
          for (const sx of [-1, 1]) { const r2 = box(0.06, 0.06, len, x + sx * 1.45, y0 + LV[1] / 2 + 1.0, zm, railM, false); r2.rotation.x = up ? ang : -ang; }
          for (let k = 0; k <= 6; k++) { const z = CP.s - (Lz * k) / 6, t = k / 6, y = y0 + LV[1] * (up ? t : 1 - t); for (const sx of [-1, 1]) box(0.06, 1.0, 0.06, x + sx * 1.45, y + 0.5, z, railM, false); } };
        ramp(wlx, LV[0], true); ramp(wlx, LV[2], true); ramp(elx, LV[1], false);
        for (const x of [CP.x0 + 0.2, CP.wl, CP.el, CP.x1 - 0.2]) for (const z of [CP.z0 + 0.2, zm, CP.z1 - 0.2]) { box(0.45, LV[3] + 1.2, 0.45, x, (LV[3] + 1.2) / 2, z, concD); p.addCircle(x, z, 0.32); }
        // parapets: round the landings' outer edges and the decks' open ends; a band at each level along the long sides
        for (const L of [LV[1], LV[2], LV[3]]) {
          box(W, 1.0, 0.2, xm, L + 0.5, CP.z0 + 0.1, concD); box(W, 1.0, 0.2, xm, L + 0.5, CP.z1 - 0.1, concD);
          for (const x of [CP.x0 + 0.1, CP.x1 - 0.1]) box(0.2, 1.0, CP.z1 - CP.z0, x, L + 0.5, (CP.z0 + CP.z1) / 2, concD);
        }
        box(midW, 1.0, 0.2, (CP.wl + CP.el) / 2, LV[2] + 0.5, CP.n + 0.1, concD);   // deck 2's north end (no landing there)
        for (const L of [LV[1], LV[3]]) box(midW, 1.0, 0.2, (CP.wl + CP.el) / 2, L + 0.5, CP.s - 0.1, concD);   // decks 1 and 3's south ends
        // colliders: the outside (all the way up, open on the south at the ground), the decks' ends, the ramps' rails
        const FYw = (L) => FY + L;
        for (const [x, z, hx, hz, y0] of [[CP.x0, (CP.z0 + CP.z1) / 2, 0.15, (CP.z1 - CP.z0) / 2, -1e9], [CP.x1, (CP.z0 + CP.z1) / 2, 0.15, (CP.z1 - CP.z0) / 2, -1e9], [(CP.x0 + CP.wl) / 2, CP.z0, (CP.wl - CP.x0) / 2, 0.15, -1e9], [(CP.el + CP.x1) / 2, CP.z0, (CP.x1 - CP.el) / 2, 0.15, -1e9], [(CP.wl + CP.el) / 2, CP.z0, (CP.el - CP.wl) / 2, 0.15, FY + 2.6], [xm, CP.z1, W / 2, 0.15, FY + 1.6]]) p.addBox(x, z, hx, hz, y0, 1e9);   // (the north face open at the ground between the lanes: the way in by car, street.js)
        p.addBox((CP.wl + CP.el) / 2, CP.n, midW / 2, 0.12, FYw(LV[2]) - 0.6, FYw(LV[2]) + 1.6); for (const L of [LV[1], LV[3]]) p.addBox((CP.wl + CP.el) / 2, CP.s, midW / 2, 0.12, FYw(L) - 0.6, FYw(L) + 1.6);
        for (let k = 0; k < 7; k++) { const za = CP.s - (Lz * k) / 7, zb = CP.s - (Lz * (k + 1)) / 7, zc = (za + zb) / 2, ta = k / 7, tb = (k + 1) / 7;
          for (const [x, y0, up] of [[CP.wl, LV[0], true], [CP.wl, LV[2], true], [CP.el, LV[1], false]]) { const ya = y0 + LV[1] * (up ? ta : 1 - ta), yb = y0 + LV[1] * (up ? tb : 1 - tb); p.addBox(x, zc, 0.1, Lz / 14, FY + Math.min(ya, yb) - 0.4, FY + Math.max(ya, yb) + 1.3); } }
        p.addBox(wlx, CP.s - 6.5, (CP.wl - CP.x0) / 2, 0.15, -1e9, FY + 0.45);   // no walking in at the ground under the low end of the first ramp
        // lights under the decks and on the roof; cars on every level
        for (const L of [LV[1], LV[2], LV[3]]) for (const z of [-42, -38, -34]) box(0.12, 0.06, 1.6, (CP.wl + CP.el) / 2, L - 0.34, z, tubeM, false);
        for (const [x, z] of [[CP.x0 + 0.6, CP.z0 + 0.6], [CP.x1 - 0.6, CP.z0 + 0.6], [CP.x1 - 0.6, CP.z1 - 0.6]]) { box(0.12, 4, 0.12, x, LV[3] + 2, z, concD); box(0.5, 0.15, 0.5, x, LV[3] + 4, z, tubeM, false); }
        if (SW.Cars) { const cr2 = E.rng(4747); let k = 0;   // (none on the ground floor: it is kept clear to drive in, street.js)
          for (const L of LV.slice(1)) for (const [x, ry] of [[CP.wl + 2.4, -Math.PI / 2], [CP.el - 2.4, Math.PI / 2]]) for (const z of [-43.4, -40.6, -37.8, -35, -32.2]) {
            if (cr2() < 0.45) continue; const c = SW.Cars.make(E, (k++ * 5) % 7); c.position.set(x, L + 0.02, z); c.rotation.y = ry + (cr2() < 0.3 ? Math.PI : 0); g.add(c); p.addBox(x, z, 2.3, 1.0, FY + L - 0.5, FY + L + 1.6); } }
        // the sign: on the south face over the top, and on a post facing the fair
        { const sm = new THREE.MeshBasicMaterial({ map: E.textTex('P  立体駐車場\nPARKING  ·  CRATER FUNFAIR', { w: 768, h: 220, color: '#ffffff', bg: '#1f55b8', font: '900 104px "Hind","Noto Sans JP",sans-serif', font2: '700 40px "Hind","Noto Sans JP",sans-serif' }), side: THREE.DoubleSide }); sm.userData.lin = true;
          const a = new THREE.Mesh(new THREE.PlaneGeometry(7, 2), sm); a.position.set(xm, LV[3] + 2.4, CP.z1 + 0.05); g.add(a); box(7.2, 0.15, 0.15, xm, LV[3] + 1.35, CP.z1 + 0.05, concD);
          const b2 = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.75), sm); b2.position.set(CP.x0 + 1.5, 3.2, CP.z1 + 1.6); g.add(b2); box(0.12, 3, 0.12, CP.x0 + 1.5, 1.5, CP.z1 + 1.5, concD); p.addCircle(CP.x0 + 1.5, CP.z1 + 1.5, 0.15); }
      }
      // trees in round planters, benches and lamp posts along the walks
      for (const [x, z] of [[4.2, 7.4], [8, -11.5], [11, -16], [-2.5, -35], [16, -40], [11, 7]]) {
        pb(1.4, 0.45, 1.4, x, 0.22, z, E.mat('#bdb6aa', { rough: 0.9 }));
        const tr = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 8), E.mat('#4f7a3c', { rough: 0.9, flat: true })); tr.position.set(x, 3.0, z); tr.scale.y = 1.2; tr.castShadow = true; g.add(tr);
        const tk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 2.2, 6), E.mat('#5a4030')); tk.position.set(x, 1.4, z); g.add(tk); p.addCircle(x, z, 0.8); }
      for (const [x, z, ry] of [[3.2, -20, -Math.PI / 2], [12, -30, 0], [-10.4, -19.4, -Math.PI / 2], [-10.4, -10.9, -Math.PI / 2], [-10.4, -3.9, -Math.PI / 2]]) { E.bench(g, x, z, ry); p.addBox(x, z, ry ? 0.35 : 1.05, ry ? 1.05 : 0.35); }   // three on the quay, looking out over the lagoon
      const lampG = new THREE.CylinderGeometry(0.06, 0.08, 4, 6), bulbM = glowMat('#ffe2a0');
      for (const [x, z] of [[-3.5, 1.5], [4.5, 1.5], [6.2, -14], [9.5, -27], [16, -31], [-11, -5.2], [-11, -12.6], [-11, -21.5], [31, -14], [1, -46.5]]) {   // iron gas lamps: a fluted post, a caged lantern
        const l = new THREE.Mesh(lampG, ironD); l.position.set(x, 2, z); g.add(l); pb(0.36, 0.5, 0.36, x, 0.25, z, ironD);
        const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.46, 8), bulbM); b2.position.set(x, 4.25, z); g.add(b2); const cap = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.3, 8), ironD); cap.position.set(x, 4.62, z); g.add(cap); p.addCircle(x, z, 0.24); }

      // a balloon seller and a popcorn cart by the carousel
      { const bx = 5.5, bz = 4.5; const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 5), dark); pole.position.set(bx, 0.8, bz); g.add(pole);
        for (let i = 0; i < 9; i++) { const a = r() * 6.3, rr = 0.2 + r() * 0.5, h = 2.6 + r() * 0.9, bl = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), C[i % C.length]); bl.scale.y = 1.2; bl.position.set(bx + Math.cos(a) * rr, h, bz + Math.sin(a) * rr); g.add(bl); }
        const kx = -3.8, kz = 2.4; pb(1.6, 1.0, 0.9, kx, 0.5, kz, E.mat('#ffffff', { map: stripes('#eeece6', '#d24a3a', 10) })); pb(1.3, 0.9, 0.7, kx, 1.5, kz, new THREE.MeshStandardMaterial({ color: '#fff4cc', transparent: true, opacity: 0.6 }));
        const umb = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.6, 12), E.mat('#ffffff', { map: stripes('#eeece6', '#e8b23a', 12) })); umb.position.set(kx, 2.9, kz); g.add(umb); p.addBox(kx, kz, 0.85, 0.5); p.addCircle(bx, bz, 0.5); }
      // string lights from the gate to the carousel
      { const sl = []; for (const sd of [-1, 1]) for (let i = 0; i <= 20; i++) { const t = i / 20, x = sd * (3.6 + t * 0.2), z = 9.2 - t * 12.7, y = 5.2 - Math.sin(t * Math.PI) * 1.1 - t * 0.6; sl.push(x, y, z); }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(sl, 3)); const pm = new THREE.PointsMaterial({ map: E.dot(), color: E.lin('#ffe2a0'), size: 0.5, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); pm.userData.lin = true; g.add(new THREE.Points(geo, pm)); }

      // Every ride has its way on and its way off: a green のりば (ENTRANCE) gate with a railed queue lane, and an orange
      // おりば (EXIT) gate, each on a little platform facing out from the ride. The rides you can board start you at the
      // entrance and set you down at the exit.
      // each ride's colour and name, on its gates and on a sign on a pole beside the ride, so you can tell which gate is whose
      const RIDE = { carousel: { c: '#c8312a', jp: 'メリーゴーラウンド', en: 'CAROUSEL' }, wheel: { c: '#2a6ac8', jp: '観覧車', en: 'FERRIS WHEEL' }, teacups: { c: '#d88a1a', jp: 'コーヒーカップ', en: 'TEACUPS' },
        swing: { c: '#2a9a8a', jp: '空中ブランコ', en: 'SWING RIDE' }, drop: { c: '#8a3ac8', jp: 'フリーフォール', en: 'DROP TOWER' }, bumper: { c: '#d84a8a', jp: 'ゴーカート', en: 'BUMPER CARS' }, coaster: { c: '#3a8a2a', jp: 'ジェットコースター', en: 'ROLLER COASTER' } };
      const gateAt = {}, gateSign = {};
      const gate = (name, kind, x, z, ry) => {
        const G = new THREE.Group(); G.position.set(x, 0, z); G.rotation.y = ry; g.add(G);
        const c = Math.cos(ry), s2 = Math.sin(ry), toP = (lx, lz) => [x + lx * c + lz * s2, z - lx * s2 + lz * c];
        const add = (geo, m, px, py, pz) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.castShadow = true; G.add(o); return o; };
        const rc = RIDE[name] || { c: '#555555', jp: name, en: name }, col = E.mat(rc.c, { rough: 0.5 }), kc = E.mat(kind === 'in' ? '#2f8a4a' : '#d2602a', { rough: 0.5 });
        add(new THREE.BoxGeometry(2.8, 0.15, 2.4), E.mat('#c9c2b0', { rough: 0.9 }), 0, 0.075, 0);
        for (const sx of [-1.25, 1.25]) { add(new THREE.BoxGeometry(0.14, 2.7, 0.14), col, sx, 1.35, 0.9); p.addCircle(...toP(sx, 0.9), 0.15); }
        add(new THREE.BoxGeometry(2.64, 0.95, 0.14), col, 0, 2.98, 0.9); add(new THREE.BoxGeometry(2.64, 0.12, 0.16), kc, 0, 2.44, 0.9);   // the ride's colour; a stripe of green (on) or orange (off) under it
        const key = kind + name; if (!gateSign[key]) gateSign[key] = new THREE.MeshBasicMaterial({ map: E.textTex(`${rc.jp}\n${kind === 'in' ? 'のりば  ENTRANCE' : 'おりば  EXIT'}  ·  ${rc.en}`, { w: 512, h: 184, color: '#ffffff', bg: rc.c, font: `900 ${Math.min(64, Math.floor(460 / rc.jp.length))}px "Hind","Noto Sans JP",sans-serif`, font2: '700 30px "Hind","Noto Sans JP",sans-serif' }), side: THREE.DoubleSide });
        const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.9), gateSign[key]); sg.position.set(0, 2.98, 0.98); G.add(sg);
        if (kind === 'in') {   // the queue lane: two rails out from the gate
          for (const sx of [-0.65, 0.65]) { add(new THREE.BoxGeometry(0.05, 0.05, 3.6), steelM, sx, 0.95, 2.9); for (let k = 0; k < 4; k++) add(new THREE.BoxGeometry(0.06, 0.95, 0.06), steelM, sx, 0.48, 1.2 + k * 1.15); for (let k = 0; k < 6; k++) p.addCircle(...toP(sx, 1.2 + k * 0.7), 0.12); }
        }
        gateAt[key] = toP(0, 0);
        return toP;
      };
      const out = (cx, cz, dx, dz, r0) => { const l = Math.hypot(dx, dz); return [cx + (dx / l) * r0, cz + (dz / l) * r0, Math.atan2(dx, dz)]; };
      const ridesG = {
        carousel: [out(0, CZ, -0.6, 0.8, 7.0), out(0, CZ, 0.6, 0.8, 7.0)],
        wheel: [[WX - 2.8, WZ + 4.2, 0], [WX + 2.8, WZ + 4.2, 0]],
        teacups: [out(TCX, TCZ, -0.3, 1, 6.1), out(TCX, TCZ, 0.5, 1, 6.1)],
        swing: [out(SWX, SWZ, -0.45, 1, 8.2), out(SWX, SWZ, 0.15, 1, 8.2)],
        drop: [out(DX, DZ, -1, 0.4, 4.4), out(DX, DZ, 1, 0.4, 4.4)],
        bumper: [[BCX - 3.6, BCZ + 5.4, 0], [BCX + 3.6, BCZ + 5.4, 0]],
        coaster: [[...cXZ(-14, 12.4), 0], [...cXZ(-23, 12.4), 0]],
      };
      const queuePts = [];
      for (const [name, [a, b]] of Object.entries(ridesG)) { const toP = gate(name, 'in', ...a); gate(name, 'out', ...b); queuePts.push(toP(0, 1.7), toP(0, 2.8), toP(0, 3.9));
        { const rc = RIDE[name], [x, z] = toP(-2.2, 2.6), m = new THREE.MeshBasicMaterial({ map: E.textTex(`${rc.jp}\n${rc.en}`, { w: 512, h: 200, color: '#ffffff', bg: rc.c, font: `900 ${Math.min(72, Math.floor(460 / rc.jp.length))}px "Hind","Noto Sans JP",sans-serif`, font2: '700 40px "Hind","Noto Sans JP",sans-serif' }), side: THREE.DoubleSide });
          pb(0.12, 4.2, 0.12, x, 2.1, z, E.mat('#2a2c30', { metal: 0.4, rough: 0.5 })); const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.8), m); sg.position.set(x, 4.0, z); sg.rotation.y = a[2]; g.add(sg); p.addCircle(x, z, 0.15); } }   // a name board on a pole beside the queue, seen from across the park
      // a low fence round the swing ride, open at its two gates
      { const R0 = 7.6, aIn = Math.atan2(ridesG.swing[0][1] - SWZ, ridesG.swing[0][0] - SWX), aOut = Math.atan2(ridesG.swing[1][1] - SWZ, ridesG.swing[1][0] - SWX);
        for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2, gap = (q) => Math.abs(Math.atan2(Math.sin(a - q), Math.cos(a - q))) < 0.2; if (gap(aIn) || gap(aOut)) continue;
          const x = SWX + Math.cos(a) * R0, z = SWZ + Math.sin(a) * R0, rl = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.05), steelM); rl.position.set(x, 0.9, z); rl.rotation.y = -a + Math.PI / 2; g.add(rl);
          const po = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), steelM); po.position.set(x, 0.45, z); g.add(po); p.addCircle(x, z, 0.35); } }
      // the visitors: ordinary people in all sorts of clothes, queuing for the rides
      const bodyGeo = new THREE.CylinderGeometry(0.3, 0.42, 1.3, 10).translate(0, 0.65, 0), headGeo = new THREE.SphereGeometry(0.27, 14, 10).translate(0, 1.6, 0);
      const cells = [], queue = (x0, z0, dx, dz, n, col0) => { for (let i = 0; i < n; i++) { const x = x0 + dx * i + (r() - 0.5) * 0.3, z = z0 + dz * i + (r() - 0.5) * 0.3; cells.push({ x, z, col: (col0 + i) % 7 }); p.addCircle(x, z, 0.5); } };
      queuePts.forEach(([x, z], i) => queue(x, z, 0, 0, 1, i % 7));   // people waiting in each ride's queue lane
      const n = cells.length, bodies = new THREE.InstancedMesh(bodyGeo, E.mat('#ffffff', { rough: 0.7 }), n), heads = new THREE.InstancedMesh(headGeo, E.mat('#ffffff', { rough: 0.6 }), n);
      const clothes = ['#2b2f3a', '#7a2f2a', '#3a5a40', '#c9c2b0', '#1e1f22', '#4a6a8a', '#8a6a3a', '#5a3a5a', '#d8d2c0', '#2f4a5a'], skins = ['#e1b18c', '#c8946a', '#8a5a3c', '#f0c8a8', '#6a4430'];
      cells.forEach((c, i) => { bodies.setColorAt(i, E.lin(clothes[Math.floor(r() * clothes.length)])); heads.setColorAt(i, E.lin(skins[Math.floor(r() * skins.length)])); c.h = 0.9 + r() * 0.2; });
      bodies.castShadow = heads.castShadow = true; g.add(bodies, heads);
      // ---- the harbour in the crater ----
      // The submarine at the pier: a riveted iron hull with copper bands, a row of lit portholes, a conning tower with a
      // brass rail and a periscope, diving planes and a caged screw; a gangway from the pier. It rides the swell with the bass.
      const sub = new THREE.Group(); sub.position.set(-20.6, 0.05, -18.95); gw.add(sub);
      { const prof = [[0, -6.6], [0.5, -6.2], [1.0, -5.3], [1.32, -4], [1.45, -2], [1.45, 2], [1.3, 3.8], [0.95, 5.2], [0.55, 6.1], [0.3, 6.5], [0, 6.6]].map(([r0, y]) => new THREE.Vector2(r0, y));
        const hull = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), iron); hull.rotation.z = Math.PI / 2; hull.scale.set(1, 1, 0.92); hull.position.y = 0.38; hull.castShadow = true; sub.add(hull);   // bow to the west (-x), towards the canal
        for (const x of [-4.6, -2.2, 0.4, 2.8, 4.6]) { const rr = x < -3 ? 1.36 : x > 3.5 ? 1.34 : 1.47, b = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.07, 6, 24), copper); b.rotation.y = Math.PI / 2; b.scale.set(1, 1, 0.92); b.position.set(x, 0.38, 0); sub.add(b); }
        const deck = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.12, 1.3), ironD); deck.position.set(-0.4, 1.78, 0); sub.add(deck);
        for (const sd of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.04, 0.04), brass); rail.position.set(-0.4, 2.3, sd * 0.62); sub.add(rail); for (let k = 0; k < 8; k++) { const pst = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.04), brass); pst.position.set(-4.4 + k * 1.15, 2.05, sd * 0.62); sub.add(pst); } }
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.0, 1.7, 16), iron); tower.position.set(0.8, 2.6, 0); tower.scale.z = 0.8; sub.add(tower);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), copper); dome.position.set(0.8, 3.45, 0); dome.scale.z = 0.8; sub.add(dome);
        for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2, w = new THREE.Mesh(new THREE.CircleGeometry(0.17, 12), lampM); w.position.set(0.8 + Math.cos(a) * 0.87, 2.8, Math.sin(a) * 0.7); w.rotation.y = Math.atan2(Math.cos(a), Math.sin(a)); sub.add(w); }
        const peri = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), brass); peri.position.set(1.2, 4.3, 0); sub.add(peri); const ph = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.14), brass); ph.position.set(1.05, 5.1, 0); sub.add(ph);
        for (const sd of [-1, 1]) for (let k = 0; k < 7; k++) { const x = -4.2 + k * 1.3, pw2 = new THREE.Mesh(new THREE.CircleGeometry(0.2, 14), lampM), rimg = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 5, 14), brass); pw2.position.set(x, 0.75, sd * 1.36); rimg.position.copy(pw2.position); if (sd < 0) { pw2.rotation.y = Math.PI; } sub.add(pw2, rimg); }
        for (const [x, w] of [[-4.2, 1.5], [4.4, 1.3]]) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 2 * w + 2.4), ironD); fin.position.set(x, 0.3, 0); sub.add(fin); }
        const rud = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.9, 0.08), ironD); rud.position.set(6.1, 0.5, 0); sub.add(rud);
        const cage = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.06, 6, 18), brass); cage.rotation.y = Math.PI / 2; cage.position.set(6.4, 0.35, 0); sub.add(cage);
        const screw = new THREE.Group(); screw.position.set(6.5, 0.35, 0); sub.add(screw); for (let k = 0; k < 3; k++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.3), brass); bl.rotation.x = (k / 3) * Math.PI * 2; screw.add(bl); } sub.userData.screw = screw;
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), lampM); lamp.position.set(-5.4, 1.35, 0); sub.add(lamp);
        for (let k = 0; k < 6; k++) p.addCircle(-26.2 + k * 2.2, -18.95, k === 0 || k === 5 ? 1.0 : 1.45);
        // the gangway from the pier, and two mooring lines
        const gx = -16.4, gwy = pw(0.9, 0.08, 2.6, gx, FY + 0.35, (PIER.z0 - 17.5) / 2 - 0.1, iron); gwy.rotation.x = 0.12;
        for (const sd of [-1, 1]) { const hr = pw(0.04, 0.04, 2.6, gx + sd * 0.42, FY + 1.1, (PIER.z0 - 17.5) / 2 - 0.1, brass, false); hr.rotation.x = 0.12; }
        for (const [px, sx] of [[PIER.x0 + 1, -24.5], [PIER.x1 - 1.2, -15.5]]) { const a = new THREE.Vector3(px, FY + 0.45, PIER.z0 + 0.25), b = new THREE.Vector3(sx, 1.6, -17.7); gw.add(along(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, a.distanceTo(b), 4), E.mat('#cbb48a', { rough: 1 })), a, b)); } }
      // The volcano: a craggy cone of dark rock on an island in the north of the lagoon, about 15 m high, its crater glowing
      // and smoking; lava runs down its south side. The glow swells with the bass, a big kick makes it flare.
      const VX = -21, VZ = -19.5, VR = 5.6, volc = { smoke: null, sp: [], glow: [], light: null };
      {
        const vg = new THREE.Group(); vg.position.set(VX, 0, VZ); gw.add(vg);
        const prof = [[VR + 0.6, -0.6], [VR, 0.6], [VR - 0.6, 2.2], [4.3, 4.6], [3.4, 7.5], [2.7, 10.5], [2.2, 13.4], [2.05, 15.0], [1.7, 15.2], [1.35, 14.4], [0.2, 13.6]].map(([x, y]) => new THREE.Vector2(x, y));
        const cone = new THREE.LatheGeometry(prof, 28), a = cone.attributes.position;
        for (let i = 0; i < a.count; i++) { const x = a.getX(i), y = a.getY(i), z = a.getZ(i), rr = Math.hypot(x, z), an = Math.atan2(z, x), k = 1 + (0.13 * Math.sin(an * 5 + y * 0.7) + 0.08 * Math.sin(an * 11 - y * 1.3) + 0.06 * Math.cos(y * 2.1 + an * 3)) * Math.min(1, y / 2 + 0.3) * (rr > 1.6 ? 1 : 0.3); a.setXYZ(i, x * k, y + 0.25 * Math.sin(an * 7 + y), z * k); }
        cone.computeVertexNormals();
        const rockM = E.mat('#3a3330', { map: E.tex('rock', 3, 3), rough: 0.95, flat: true }), mt = new THREE.Mesh(cone, rockM); mt.castShadow = mt.receiveShadow = true; vg.add(mt); p.addCircle(VX, VZ, VR);
        const lavaM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff5a1a').convertSRGBToLinear().multiplyScalar(1.6) }); lavaM.userData.lin = true; volc.glow.push(lavaM);
        const pool2 = new THREE.Mesh(new THREE.CircleGeometry(1.45, 16), lavaM); pool2.rotation.x = -Math.PI / 2; pool2.position.y = 14.3; vg.add(pool2);
        for (const [an, len] of [[1.7, 9], [2.1, 6.5], [1.35, 5]]) {   // lava streaks down the south side
          const pts = []; for (let k = 0; k <= 10; k++) { const y = 14.8 - (len * k) / 10, rr = 2.0 + (14.8 - y) * 0.27 + 0.12, wob = Math.sin(k * 1.3 + an * 5) * 0.12; pts.push(new THREE.Vector3(Math.cos(an + wob) * rr, y, Math.sin(an + wob) * rr)); }
          vg.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.16, 5), lavaM)); }
        volc.light = new THREE.PointLight(new THREE.Color('#ff6a2a').convertSRGBToLinear(), 1.6, 34, 1.6); volc.light.position.set(0, 16.5, 0); vg.add(volc.light);
        // smoke: puffs rising from the crater and leaning off downwind
        const N = 46, pos = new Float32Array(N * 3), sm2 = new THREE.PointsMaterial({ map: E.dot(), color: new THREE.Color('#6a625c').convertSRGBToLinear(), size: 3.2, transparent: true, opacity: 0.42, depthWrite: false });
        sm2.userData.lin = true; const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        for (let i = 0; i < N; i++) volc.sp.push({ t: i / N, ox: (r() - 0.5) * 1.2, oz: (r() - 0.5) * 1.2, s: r() * 6 });
        volc.smoke = new THREE.Points(geo, sm2); volc.smoke.frustumCulled = false; vg.add(volc.smoke);
        volc.tick = (t, dt, f) => {
          const k = 1 + (f.bass || 0) * 1.4 + (f.beat && f.bass > 0.75 ? 1.2 : 0);
          volc.glow.forEach((m) => m.color.setRGB(1.6 * k * 1.0, 0.36 * k, 0.06 * k));
          volc.light.intensity = 1.2 + 2.2 * (f.bass || 0);
          for (let i = 0; i < N; i++) { const q = volc.sp[i]; q.t = (q.t + dt * 0.055) % 1; const h = q.t * 26, drift = q.t * q.t * 9; pos.set([q.ox * (1 + q.t * 3) + drift, 15 + h, q.oz * (1 + q.t * 3) + Math.sin(t * 0.3 + q.s) * q.t * 2], i * 3); }
          geo.attributes.position.needsUpdate = true;
        };
      }
      // A rock in the lagoon carries the harbour's light: an iron lattice tower with a lamp room that sweeps its beam round,
      // and a crane jib off it that swings slowly over the water.
      const LHX = -25, LHZ = -9.6, LHH = 12.5, lh = new THREE.Group(); lh.position.set(LHX, 0, LHZ); gw.add(lh);
      { const isl = new THREE.Mesh(E.rockGeo(3), basaltD); isl.scale.set(2.6, 1.5, 2.3); isl.position.y = 0.2; isl.castShadow = isl.receiveShadow = true; lh.add(isl); p.addCircle(LHX, LHZ, 2.5);
        const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.45, 0.8, 8), stoneM); plinth.position.y = 1.25; lh.add(plinth);
        const top = 1.65, b0 = 1.0, b1 = 0.55, LB = E.batch(lh);   // the lattice: posts, braces and rings, a few instanced draws
        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const dx = sx * (b0 + b1) / 2, dz = sz * (b0 + b1) / 2; LB.box(0.16, LHH + 0.2, 0.16, dx, top + LHH / 2, dz, ironD).rotation.set(-sz * Math.atan2(b0 - b1, LHH), 0, sx * Math.atan2(b0 - b1, LHH)); }
        for (let k = 0; k < 6; k++) { const y0 = top + (k * LHH) / 6, y1 = top + ((k + 1) * LHH) / 6, w0 = b0 - ((b0 - b1) * k) / 6, w1 = b0 - ((b0 - b1) * (k + 1)) / 6;
          for (let f2 = 0; f2 < 4; f2++) { const ry = (f2 * Math.PI) / 2, L = Math.hypot(w0 + w1, y1 - y0); for (const sd of [-1, 1]) { const wm = (w0 + w1) / 2, br = LB.box(0.06, L, 0.06, Math.sin(ry) * wm, (y0 + y1) / 2, Math.cos(ry) * wm, rust, false); br.rotation.set(0, ry, 0); br.rotateZ(sd * Math.atan2(w0 + w1, y1 - y0)); } }
          LB.box(2 * w1 + 0.1, 0.1, 2 * w1 + 0.1, 0, y1, 0, ironD); }
        LB.flush();
        const gal = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.14, 16), ironD); gal.position.y = top + LHH + 0.1; lh.add(gal);
        const galR = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.04, 5, 24), brass); galR.rotation.x = Math.PI / 2; galR.position.y = top + LHH + 0.75; lh.add(galR);
        const room = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.2, 12), glow('#ffd28a')); room.position.y = top + LHH + 0.8; lh.add(room);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.8, 12), copper); cap.position.y = top + LHH + 1.8; lh.add(cap); const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), brass); ball.position.y = top + LHH + 2.3; lh.add(ball);
        const beamM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a0').convertSRGBToLinear(), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); beamM.userData.lin = true;
        const beam = new THREE.Group(); beam.position.y = top + LHH + 0.8; lh.add(beam); { const cone = new THREE.Mesh(new THREE.ConeGeometry(2.2, 26, 16, 1, true), beamM); cone.rotation.z = Math.PI / 2; cone.position.x = 13; beam.add(cone); } lh.userData.beam = beam;
        // the crane: a lattice jib off the tower at two thirds of its height, a counterweight, a hook on its line
        const jib = new THREE.Group(); jib.position.y = top + LHH * 0.66; lh.add(jib); lh.userData.jib = jib;
        { const L = 7.5, JB = E.batch(jib); for (const [y, z] of [[0.35, 0.3], [0.35, -0.3], [-0.25, 0]]) JB.box(L, 0.08, 0.08, L / 2, y, z, rust); for (let k = 0; k < 8; k++) JB.box(0.05, 0.75, 0.05, 0.5 + k * 0.95, 0.05, 0, ironD, false).rotation.z = k % 2 ? 0.7 : -0.7; JB.flush();
          const cw = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 0.9), ironD); cw.position.set(-1.5, 0, 0); jib.add(cw); const tail = new THREE.Mesh(new THREE.BoxGeometry(2, 0.12, 0.12), rust); tail.position.set(-0.8, 0.3, 0); jib.add(tail);
          const line = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 4, 4), ironD); line.position.set(L - 0.3, -2.2, 0); jib.add(line); const hook = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 5, 10, Math.PI * 1.5), brass); hook.position.set(L - 0.3, -4.3, 0); jib.add(hook); const crate = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), E.mat('#7a5a3a', { rough: 0.9 })); crate.position.set(L - 0.3, -4.8, 0); jib.add(crate); } }
      // the geyser: a ring of rocks in the water at the north end; it breathes steam and throws up a jet on the big beats
      const GX = -16.8, GZ = -24.2;
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.3, m = new THREE.Mesh(E.rockGeo(k), basaltD); m.scale.set(0.7, 0.45, 0.6); m.position.set(GX + Math.cos(a) * 1.1, 0.1, GZ + Math.sin(a) * 1.1); m.rotation.y = a; gw.add(m); }
      p.addCircle(GX, GZ, 1.7);
      // steam: one cloud of soft puffs fed from vents round the crater foot, the geyser and the funnel by the cave
      const STEAM = 220, stP = new Float32Array(STEAM * 3), stC = new Float32Array(STEAM * 3), stL = new Float32Array(STEAM), stV = new Float32Array(STEAM * 3);
      const vents = [[GX, 0.2, GZ, 2.2]].concat([18, 30, 54, 78, 102, 132, 150].map((i) => { const a = FLOOR[i], b = FLOOR[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); let n = [(b[1] - a[1]) / L, -(b[0] - a[0]) / L]; if (floorD(a[0] + n[0], a[1] + n[1]) < 0) n = [-n[0], -n[1]]; return [a[0] + n[0] * 0.9, FY + 0.3, a[1] + n[1] * 0.9, 1]; }));   // x, y (world), z, how hard it blows: the geyser, and cracks at the foot of the cliffs
      const steamG = new THREE.BufferGeometry(); steamG.setAttribute('position', new THREE.BufferAttribute(stP, 3)); steamG.setAttribute('color', new THREE.BufferAttribute(stC, 3));
      const steamM = new THREE.PointsMaterial({ map: E.dot(), size: 3.2, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); steamM.userData.lin = true;
      const steam = new THREE.Points(steamG, steamM); steam.frustumCulled = false; gw.add(steam);
      for (let i = 0; i < STEAM; i++) stL[i] = -r() * 6;   // staggered starts
      const jetM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#e8eef0').convertSRGBToLinear(), transparent: true, opacity: 0, depthWrite: false }); jetM.userData.lin = true;
      const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.7, 1, 10, 1, true).translate(0, 0.5, 0), jetM); jet.position.set(GX, 0.05, GZ); gw.add(jet);
      let jetH = 0, jetV = 0;
      const calderaTick = (t, dt, f) => {
        lagoonM.uniforms.t.value = t; lagoonM.uniforms.level.value = f.level || 0;
        volc.tick(t, dt, f);
        sub.position.y = 0.05 + Math.sin(t * 0.7) * 0.05 + (f.bass || 0) * 0.06; sub.rotation.x = Math.sin(t * 0.5) * 0.015; sub.userData.screw.rotation.x += dt * 0.6;
        lh.userData.beam.rotation.y = t * 0.6; lh.userData.jib.rotation.y = Math.sin(t * 0.13) * 0.9 + 0.6;
        // the geyser jet: a strong kick throws it up, then it falls back
        if (f.beat && f.pulse > 0.75 && jetH < 1) jetV = 9 + f.pulse * 5;
        jetV -= dt * 14; jetH = Math.max(0, jetH + jetV * dt); if (jetH <= 0) jetV = Math.max(0, jetV);
        jet.scale.set(1, Math.max(0.01, jetH), 1); jetM.opacity = Math.min(0.55, jetH * 0.12);
        for (let i = 0; i < STEAM; i++) {
          stL[i] += dt;
          if (stL[i] > 5.5 || stL[i] < 0) { if (stL[i] < 0) { stC[i * 3] = stC[i * 3 + 1] = stC[i * 3 + 2] = 0; continue; } const v = vents[i % vents.length]; stL[i] = 0; stP.set([v[0] + (r() - 0.5) * 0.6, v[1], v[2] + (r() - 0.5) * 0.6], i * 3); stV.set([(r() - 0.5) * 0.3 + 0.25, (0.6 + r() * 0.7) * v[3] * (i % vents.length === 0 ? 1 + jetH * 0.2 : 1), (r() - 0.5) * 0.3], i * 3); }
          const k = stL[i] / 5.5, a = Math.sin(Math.PI * Math.min(1, k * 1.6)) * (1 - k) * 0.18;
          stP[i * 3] += stV[i * 3] * dt; stP[i * 3 + 1] += stV[i * 3 + 1] * dt; stP[i * 3 + 2] += stV[i * 3 + 2] * dt;
          stC[i * 3] = a; stC[i * 3 + 1] = a * 0.98; stC[i * 3 + 2] = a * 0.94;
        }
        steamG.attributes.position.needsUpdate = steamG.attributes.color.needsUpdate = true;
      };

      PB.flush();

      p.grade = {   // a smoky amber light inside the crater: haze off the steam, the sun low over the west wall
        top: '#7e93a8', bottom: '#e2c7a0', fog: '#b9a68e', near: 26, far: 175,
        sun: '#ffd7a0', sunInt: 2.3, hemi: 0.56, sunDir: [0.55, 0.45, 0.3],
        tint: [1.05, 0.99, 0.9], expo: 0.92, sat: 0.7, stars: 0,
      };
      p.map = [{ t: 'rect', x: (CP.x0 + CP.x1) / 2, z: (CP.z0 + CP.z1) / 2, w: CP.x1 - CP.x0, h: CP.z1 - CP.z0, c: '#7c786f' }, { t: 'poly', x: 0, z: 0, pts: FLOORM.outline, c: '#a39a8c' }, { t: 'poly', x: 0, z: 0, pts: LAGOON, c: '#3f7c86' }, { t: 'circle', x: VX, z: VZ, r: VR, c: '#3a3330' }];
      p.face = Math.PI;
      p.vp = [0, -2.5];   // in front of the carousel
      p.trail = [[0, TZ1 + 1], [0, TZ0 - 1.5], [0, -2.5]];   // up the cutting and through the tunnel: the path is laid only as far as its mouth
      p.pathEnd = 12;
      p.clearR = 12;
      p.blocks = (lx, lz) => floorD(lx, lz) < DC + CWD + 1.5;   // the floor, the cliffs and the crest: no trees (the outer slopes keep a few)
      // the way to the wheel (PLACES.parkwheel's trail): through the tunnel, then between the carousel and the teacups
      SW.parkRide = { wheel, gond, grade: p.grade, route: [[0, TZ1 + 1], [0, TZ0 - 1.5], [3.5, 3], [7, -3.5], [7.2, -11], [6, -17]].map(([x, z]) => p.toWorld(x, z)), board: () => p.toWorld(gateAt.inwheel[0], gateAt.inwheel[1]), exit: () => p.toWorld(gateAt.outwheel[0], gateAt.outwheel[1]), wheelHold: { on: false, i: 0, stopped: false } };
      // ride the carousel: walk up to the platform, climb onto an outside horse
      const hv = new THREE.Vector3(), hq = new THREE.Quaternion(), hf = new THREE.Vector3();
      let horseI = 1;
      p.ride = {
        board: () => p.toWorld(gateAt.incarousel[0], gateAt.incarousel[1]), exit: () => p.toWorld(gateAt.outcarousel[0], gateAt.outcarousel[1]),
        hold: (on) => { carHold = on; }, stopped: () => carSpin === 0,
        pick: () => { const b = p.toWorld(gateAt.incarousel[0], gateAt.incarousel[1]); let best = 1e9; horses.forEach((o, i) => { if (!(i % 2)) return; o.h.getWorldPosition(hv); const d = Math.hypot(hv.x - b.x, hv.z - b.z); if (d < best) { best = d; horseI = i; } }); },   // the outside horse nearest the gate
        seat: (v) => { const h = horses[horseI].h; h.getWorldPosition(v); v.y -= 0.62; h.getWorldQuaternion(hq); hf.set(0, 0, 1).applyQuaternion(hq); return Math.atan2(hf.x, hf.z); },
      };

      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), ps = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
      let drop = { y: 2, v: 0, st: 'up', wait: 0 }, carSpin = 0.35, carHold = false, teaSpin = 1;
      // the teacups as a ride: climb into the first cup; press in time (the game) to spin it faster
      const tq = new THREE.Quaternion(), tf = new THREE.Vector3();
      const tea = { boost: 0, held: false, game: true,
        board: () => p.toWorld(gateAt.inteacups[0], gateAt.inteacups[1]), exit: () => p.toWorld(gateAt.outteacups[0], gateAt.outteacups[1]), hold: (on) => { tea.held = on; }, stopped: () => teaSpin === 0,
        seat: (v) => { cupL[0].getWorldPosition(v); v.y += 0.05; cupL[0].getWorldQuaternion(tq); tf.set(0, 0, 1).applyQuaternion(tq); return Math.atan2(tf.x, tf.z); },
        spin: () => (0.5 + 1.2 + tea.boost * 2.4) * teaSpin };
      p.interact({ kind: 'ride', place: p, ride: tea, label: 'TEACUPS', lx: gateAt.inteacups[0], lz: gateAt.inteacups[1] + 2.6, r: 2.0, mark: 1.8 });   // at the head of the queue lane
      const cm4 = new THREE.Matrix4();
      p.update = (t, dt, f) => {
        const bob = f.pulse * 0.12;
        cells.forEach((c, i) => { ps.set(c.x, bob * ((i % 3) / 2), c.z); sc.set(1, c.h * (1 + band(f, c.col * 3 + 2, 24) * 0.08), 1); q.setFromAxisAngle(up, Math.sin(t * 0.5 + i) * 0.4); m4.compose(ps, q, sc); bodies.setMatrixAt(i, m4); heads.setMatrixAt(i, m4); });
        bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
        // carousel: turns faster with the level; the horses rise and fall in turn on the beat
        { const tgt = carHold ? 0 : 0.35 + (f.level || 0) * 0.5; carSpin += (tgt - carSpin) * Math.min(1, dt * (carHold ? 1.6 : 0.8)); if (carHold && carSpin < 0.02) carSpin = 0; car.rotation.y -= dt * carSpin; }   // clockwise seen from above, the way the horses face
        horses.forEach((o) => { o.h.position.y = 1.6 + Math.sin(t * 2.6 + o.s * 1.4) * 0.25 + (o.s % 2 ? f.pulse : f.bass) * 0.18; });
        // wheel: slow turn, cabins hang level, rim lights run round with the spectrum
        { const H = SW.parkRide && SW.parkRide.wheelHold;
          if (H && H.on) {   // bring the cabin round to the bottom and stop there
            const m = ((((H.i / NG) * Math.PI * 2 + wheel.rotation.z + Math.PI / 2) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
            if (m < 0.004 || m > Math.PI * 2 - 0.004) H.stopped = true; else { H.stopped = false; wheel.rotation.z -= Math.min(m, dt * Math.min(0.45, 0.05 + m * 0.6)); }
          } else wheel.rotation.z -= dt * 0.12;
          gond.forEach((gp) => { gp.rotation.z = -wheel.rotation.z; }); }
        for (let i = 0; i < 64; i++) { const v = band(f, i % 24, 24); col.setHSL(((i / 64 + t * 0.05) % 1), 0.8, 0.35 + v * 0.45); rimL.setColorAt(i, col); }
        rimL.instanceColor.needsUpdate = true;
        // drop tower: creeps up, waits at the top, and falls on a strong beat
        if (drop.st === 'up') { drop.y += dt * 2.2; if (drop.y >= DH - 2.5) { drop.y = DH - 2.5; drop.st = 'top'; drop.wait = 1.5; } }
        else if (drop.st === 'top') { drop.wait -= dt; if (drop.wait <= 0 && (f.pulse > 0.6 || drop.wait < -4)) { drop.st = 'fall'; drop.v = 0; } }
        else if (drop.st === 'fall') { drop.v += dt * 26; drop.y -= drop.v * dt; if (drop.y <= 2.2) { drop.y = 2.2; drop.st = 'rest'; drop.wait = 2.5; } }
        else { drop.wait -= dt; if (drop.wait <= 0) drop.st = 'up'; }
        ring.position.y = drop.y;
        // the coaster: up the lift at walking pace, then on gravity; riders' arms go up on the way down
        { const i0 = Math.floor(((cs / CL) % 1) * NS); cs = (cs + vTab[Math.max(0, Math.min(NS - 1, i0))] * dt) % CL; if (!(cs >= 0)) cs = 0;
          cars.forEach((c, k) => { const u = (((cs - k * 1.7) / CL) % 1 + 1) % 1, i = Math.min(NS - 1, Math.floor(u * NS)); c.position.copy(cP[i]).addScaledVector(cN[i], 0.05); c.quaternion.setFromRotationMatrix(cm4.makeBasis(cB[i], cN[i], cT[i]));
            const fast = vTab[i] > 9 ? 1 : 0; (c.userData.arms || []).forEach((a) => { a.rotation.x = fast ? 0 : 1.2; a.position.y = fast ? 1.45 : 1.05; }); }); }
        // the swing ride speeds up with the level; the chairs fly out
        swingV += ((0.9 + (f.level || 0) * 1.6) - swingV) * Math.min(1, dt * 0.4); swing.rotation.y += swingV * dt;
        chairs.forEach((c) => { c.rotation.z = Math.min(0.95, swingV * swingV * 0.38); });
        // the teacups turn, and each cup spins its own way
        { const tgt = tea.held ? 0 : 1; teaSpin += (tgt - teaSpin) * Math.min(1, dt * (tea.held ? 1.5 : 0.8)); if (tea.held && teaSpin < 0.02) teaSpin = 0;
          cups.rotation.y += dt * 0.5 * teaSpin; cupL.forEach((c, i) => { c.rotation.y += dt * (i === 0 ? 1.2 + tea.boost * 2.4 : 1.2 + (f.bass || 0) * 3) * teaSpin * (i % 2 ? 1 : -1); }); }
        // the bumper cars wander and bounce off the edges
        bump.forEach((b) => { b.turn += (Math.random() - 0.5) * dt * 3; b.turn *= 0.98; b.a += b.turn * dt; const nx = b.g.position.x + Math.sin(b.a) * b.v * dt, nz = b.g.position.z + Math.cos(b.a) * b.v * dt;
          if (Math.abs(nx - BCX) > 5.2 || Math.abs(nz - BCZ) > 3.2) b.a += Math.PI * (0.6 + Math.random() * 0.6); else { b.g.position.x = nx; b.g.position.z = nz; } b.g.rotation.y = b.a; });
      };
      // Once the rock exists (game.js builds it from p.relief): crags and columns of basalt on the cliffs, iron catwalks
      // along two of them with pipes and lamps, caves at their ends and at the foot, and posts along the brink so nobody
      // walks off the top into the crater.
      p.afterHills = ({ groundAt }) => {
        const H = (lx, lz) => { const w = p.toWorld(lx, lz); return groundAt(w.x, w.z); }, nF = FLOOR.length;
        const nrm = (i) => { const a = FLOOR[(i - 1 + nF) % nF], b = FLOOR[(i + 1) % nF], L = Math.hypot(b[0] - a[0], b[1] - a[1]); let n = [(b[1] - a[1]) / L, -(b[0] - a[0]) / L]; if (floorD(FLOOR[i][0] + n[0], FLOOR[i][1] + n[1]) < 0) n = [-n[0], -n[1]]; return n; };
        const nearGap = (x, z) => (Math.abs(x) < TW + 3.5 && z > 4) || (Math.abs(z - CZ0) < CWH + 3.2 && x < -33) || inCP(x, z, 1.5);   // (and nothing heaped in the car park)
        const faceD = (i, y) => { const [x0, z0] = FLOOR[i], n = nrm(i); for (let d = 0; d < 9; d += 0.15) if (H(x0 + n[0] * d, z0 + n[1] * d) >= y) return d; return -1; };
        // crags: boulders heaped against the foot and along the brink
        { const shapes = Array.from({ length: 6 }, () => []), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), ps = new THREE.Vector3(), sc = new THREE.Vector3();
          for (let i = 0; i < nF; i += 2) { const [x0, z0] = FLOOR[i], n = nrm(i);
            for (let k = 0; k < 3; k++) { const brink = k === 2, d = brink ? DC - 0.6 + r() * (CWD + 0.6) : 0.5 + r() * 2.6, x = x0 + n[0] * d + (r() - 0.5) * 1.4, z = z0 + n[1] * d + (r() - 0.5) * 1.4;
              if (nearGap(x, z) || floorD(x, z) < 0.35) continue;
              const h = H(x, z), sx = brink ? 1.2 + r() * 1.6 : Math.min(0.9 + r() * 1.8, (floorD(x, z) + 0.25) / 1.15), sy = sx * (0.9 + r() * 0.9), y = brink ? h - sy * 0.25 : Math.max(FY - 0.1, h - sy * 0.6);   // tall rather than flat: crags, not pebbles
              shapes[(i + k) % 6].push([x, y, z, sx, sy, sx * (0.7 + r() * 0.5), r() * 6.3, (r() - 0.5) * 0.5]); } }
          shapes.forEach((L, k) => { if (!L.length) return; const im = new THREE.InstancedMesh(E.rockGeo(k), k % 2 ? basalt : basaltD, L.length); L.forEach(([x, y, z, sx, sy, sz, ry, rx], j) => { q.setFromEuler(e.set(rx, ry, 0)); im.setMatrixAt(j, m4.compose(ps.set(x, y, z), q, sc.set(sx, sy, sz))); }); im.castShadow = im.receiveShadow = true; gw.add(im); }); }
        // columns of basalt, the way lava cracks as it cools: hexagonal prisms in clusters against the cliff
        { const cols = [], colM = E.mat('#4a4541', { map: E.tex('rock', 1, 2), rough: 0.92, flat: true });
          for (const ic of [44, 66, 92, 140, 160, 8]) { const n = nrm(ic), t2 = [-n[1], n[0]], [x0, z0] = FLOOR[ic];
            for (let k = 0; k < 16; k++) { const u = (r() - 0.5) * 6.5, d = 0.55 + r() * 1.9, x = x0 + t2[0] * u + n[0] * d, z = z0 + t2[1] * u + n[1] * d; if (nearGap(x, z) || floorD(x, z) < 0.5) continue;
              const top = Math.max(FY + 1.5, H(x, z) + (r() - 0.35) * 2.2) * (0.55 + 0.45 * Math.cos((u / 3.4) * 1.2)), rad = 0.38 + r() * 0.22; if (top < FY + 1) continue; cols.push([x, z, FY - 0.3, top, rad, r()]); } }
          const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6).translate(0, 0.5, 0), colM, cols.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), ps = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
          cols.forEach(([x, z, y0, y1, rad, a], j) => im.setMatrixAt(j, m4.compose(ps.set(x, y0, z), q.setFromAxisAngle(up, a), sc.set(rad, y1 - y0, rad)))); im.castShadow = im.receiveShadow = true; gw.add(im); }
        // caves: dark mouths glowing deep inside, barred with iron
        const caveTex = canvasTex(128, 160, (x, w, h) => { x.clearRect(0, 0, w, h); const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0c0907'); gr.addColorStop(0.55, '#1c120c'); gr.addColorStop(0.85, '#6a3412'); gr.addColorStop(1, '#a8571c'); x.fillStyle = gr; x.beginPath(); x.moveTo(8, h); x.lineTo(8, 64); x.quadraticCurveTo(10, 6, 64, 4); x.quadraticCurveTo(118, 6, 120, 64); x.lineTo(120, h); x.closePath(); x.fill(); });
        const caveM = new THREE.MeshBasicMaterial({ map: caveTex, alphaTest: 0.5 }); caveM.userData.lin = true;
        const cave = (i, y, wd, ht, barred) => { const d = faceD(i, y + ht + 0.6); if (d < 0) return null; const n = nrm(i), [x0, z0] = FLOOR[i], x = x0 + n[0] * (d - 0.15), z = z0 + n[1] * (d - 0.15), yaw = Math.atan2(-n[0], -n[1]); if (inCP(x, z, 2)) return null;
          const m = new THREE.Mesh(new THREE.PlaneGeometry(wd, ht), caveM); m.position.set(x, y + ht / 2, z); m.rotation.y = yaw; gw.add(m);
          if (barred) for (let k = 1; k < 6; k++) { const b = pw(0.06, ht * 0.9, 0.06, x - Math.cos(yaw) * (k / 6 - 0.5) * wd * 0.9 - n[0] * 0.08, y + ht * 0.45, z + Math.sin(yaw) * (k / 6 - 0.5) * wd * 0.9 - n[1] * 0.08, ironD); }
          for (const sd of [-1, 1]) { const bo = new THREE.Mesh(E.rockGeo(i + sd + 3), basaltD); bo.scale.set(0.9, ht * 0.55, 0.8); bo.position.set(x + Math.cos(yaw) * sd * (wd / 2 + 0.35) - n[0] * 0.1, y + ht * 0.4, z - Math.sin(yaw) * sd * (wd / 2 + 0.35) - n[1] * 0.1); gw.add(bo); }
          const l = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), lampM); l.position.set(x - Math.cos(yaw) * (wd / 2 + 0.2) - n[0] * 0.3, y + ht + 0.15, z + Math.sin(yaw) * (wd / 2 + 0.2) - n[1] * 0.3); gw.add(l);
          return { x, z, yaw }; };
        cave(30, FY, 2.6, 3.4, true); cave(86, FY, 2.4, 3.2, true); cave(57, FY, 2.2, 3.0, true);
        // catwalks: an iron deck on brackets along the face, railed on the open side, pipes along the rock, lamps; a cave at the far end
        const walk = (i0, i1, yC) => {
          const pts = []; for (let i = i0; i <= i1; i += 3) { const d = faceD(i, yC + 0.4); if (d < 0.6) { pts.push(null); continue; } const n = nrm(i), [x0, z0] = FLOOR[i]; pts.push({ i, n, x: x0 + n[0] * (d - 0.85), z: z0 + n[1] * (d - 0.85), fx: x0 + n[0] * (d - 0.1), fz: z0 + n[1] * (d - 0.1) }); }
          pts.forEach((a, k) => { const b = pts[k + 1]; if (!a) return;
            const ox = -a.n[0] * 0.65, oz = -a.n[1] * 0.65;   // the open (crater) side
            pw(0.07, 1.05, 0.07, a.x + ox, yC + 0.55, a.z + oz, ironD); if (k % 4 === 1) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), lampM); l.position.set(a.x + ox, yC + 1.2, a.z + oz); gw.add(l); }
            const st = pw(0.08, 1.7, 0.08, (a.x + a.fx) / 2 - a.n[0] * 0.2, yC - 0.8, (a.z + a.fz) / 2 - a.n[1] * 0.2, rust); st.rotation.set(0, Math.atan2(a.n[0], a.n[1]), 0.0); st.rotateX(-0.55);
            if (!b) return;
            const L = Math.hypot(b.x - a.x, b.z - a.z) + 0.1, yaw = Math.atan2(b.x - a.x, b.z - a.z);
            const dk = pw(1.35, 0.1, L, (a.x + b.x) / 2, yC, (a.z + b.z) / 2, iron); dk.rotation.y = yaw;
            const rl = pw(0.05, 0.05, L, (a.x + b.x) / 2 + ox, yC + 1.05, (a.z + b.z) / 2 + oz, ironD, false); rl.rotation.y = yaw; const rl2 = pw(0.04, 0.04, L, (a.x + b.x) / 2 + ox, yC + 0.55, (a.z + b.z) / 2 + oz, ironD, false); rl2.rotation.y = yaw;
            for (const [dy, rad, m] of [[0.55, 0.13, copper], [0.95, 0.09, rust]]) { const A = new THREE.Vector3(a.fx, yC + dy, a.fz), B = new THREE.Vector3(b.fx, yC + dy, b.fz); gw.add(along(new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, A.distanceTo(B) + 0.15, 8), m), A, B)); } });
          const last = pts.filter(Boolean).pop(); if (last) cave(last.i + 3, yC, 2.0, 2.7, false);
          const ends = pts.filter(Boolean);
          const first = pts.find(Boolean); if (first) { const ld = first.n, lx = first.x - ld[0] * 0.2, lz = first.z - ld[1] * 0.2; for (let y = FY + 0.3; y < yC; y += 0.35) pw(0.6, 0.05, 0.05, lx, y, lz, ironD, false); for (const sd of [-1, 1]) pw(0.05, yC - FY + 1, 0.05, lx + ld[1] * sd * 0.3, (yC + FY + 1) / 2, lz - ld[0] * sd * 0.3, ironD, false); }   // a ladder up from the quay
          return ends.length ? { a: ends[0], b: ends[ends.length - 1], y: yC } : null;
        };
        const w1 = walk(40, 76, FY + 6.4), w2 = walk(98, 117, FY + 8.4);
        if (w1 && w2) {   // a rope bridge slung across the crater's north-west corner, from the one catwalk to the other
          const A = new THREE.Vector3(w1.b.x, w1.y + 0.05, w1.b.z), B = new THREE.Vector3(w2.a.x, w2.y + 0.05, w2.a.z), N = 26, sag = 2.2, at = (t) => A.clone().lerp(B, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0)), yaw = Math.atan2(B.x - A.x, B.z - A.z), side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), ropeM = E.mat('#b49a6e', { rough: 1 }), plankM = E.mat('#7a5a3a', { rough: 0.95 });
          for (let k = 0; k < N; k++) { const c = at((k + 0.5) / N); pw(1.1, 0.06, 0.32, c.x, c.y, c.z, plankM).rotation.y = yaw; }   // planks and ropes go in the batch (two draws, not a hundred)
          for (const sd of [-1, 1]) for (let k = 0; k < N; k++) { const o = side.clone().multiplyScalar(sd * 0.6), a = at(k / N).add(o).setY(at(k / N).y + 1.0), b = at((k + 1) / N).add(o).setY(at((k + 1) / N).y + 1.0); along(pw(0.05, a.distanceTo(b) + 0.02, 0.05, 0, 0, 0, ropeM, false), a, b); if (k % 2 === 0) { const f0 = at(k / N).add(o); along(pw(0.025, 1.0, 0.025, 0, 0, 0, ropeM, false), f0, a); } } }
        // posts along the brink: walking in over the top you stop before the drop
        for (let i = 0; i < nF; i++) { const [x0, z0] = FLOOR[i], n = nrm(i), x = x0 + n[0] * (DC - 0.4), z = z0 + n[1] * (DC - 0.4); if (!inCP(x, z, 1.5)) p.addCircle(x, z, 0.95, Math.min(FY + 3, H(x, z) - 1.5), 1e9); }   // (none in the car park) above the foot's boxes (up to FY + 3), or lower where the wall is low: anyone that high here is on the rock, not in the crater or its tunnel
        PW.flush();
      };
      { const upd0 = p.update; p.update = (t, dt, f, v, viewing) => { upd0(t, dt, f, v, viewing); calderaTick(t, dt, f); }; }   // and the harbour round the lagoon
      // the view rides an outside horse, looking ahead and out at the park going round
      p.shot = () => {
        const o = horses[1], th = car.rotation.y, at = (a, rad, y) => { const x = Math.cos(a) * rad, z = Math.sin(a) * rad; return [x * Math.cos(th) + z * Math.sin(th), y + FY, CZ - x * Math.sin(th) + z * Math.cos(th)]; };   // the quay is FY up
        return { pos: at(o.a, o.rad, o.h.position.y + 1.3), look: at(o.a - 0.55, o.rad + 3.2, 1.9), roll: 0 };
      };
    },
  };

  /* The Ferris wheel's song: no buildings of its own (the park builds the wheel); its view rides a cabin round. */
  PLACES.parkwheel = {
    build(p) {
      const v = new THREE.Vector3(), w = new THREE.Vector3();
      p.grade = Object.assign({}, (SW.parkRide && SW.parkRide.grade) || {});
      p.face = Math.PI; p.pathEnd = 2; p.clearR = 4;
      if (SW.parkRide && SW.parkRide.route) p.trail = SW.parkRide.route.map((w) => { const l = p.local(w.x, w.z); return [l.x, l.z]; }).concat([[0, 0]]);   // in by the crater's tunnel, round the carousel
      p.blocks = (lx, lz) => Math.hypot(lx, lz) < 3;   // the park around it is the carousel's place
      p.map = []; p.update = () => {};
      let ride = -1, lastT = -1e9;
      p.ride = {   // board the cabin at the bottom and ride it round
        board: () => (SW.parkRide ? SW.parkRide.board() : p.toWorld(0, 0)),
        exit: () => (SW.parkRide ? SW.parkRide.exit() : p.toWorld(0, 0)),
        hold: (on, leaving) => { const R = SW.parkRide, H = R.wheelHold; if (!on) { H.on = false; return; }
          let pick = ride; if (!leaving) { let lo = 1e9; const n = R.gond.length; for (let i = 0; i < n; i++) { const m = ((((i / n) * Math.PI * 2 + R.wheel.rotation.z + Math.PI / 2) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); if (m < lo) { lo = m; pick = i; } } }   // the next cabin coming down to the bottom
          Object.assign(H, { on: true, i: pick, stopped: false }); ride = pick; },
        stopped: () => SW.parkRide.wheelHold.stopped,
        pick: () => { ride = SW.parkRide.wheelHold.i; },
        seat: (o) => { const R = SW.parkRide; R.gond[Math.max(0, ride)].getWorldPosition(o); o.y -= 2.1; const b = R.board(); return Math.atan2(o.x - b.x, o.z - b.z) + Math.PI; },
      };
      p.shot = (t) => {
        const R = SW.parkRide; if (!R) return { pos: [0, 2, 0], look: [0, 2, -5], roll: 0 };
        if (t - lastT > 0.5) {   // just got on: board the cabin at the bottom, then ride it round
          let lo = 1e9; R.gond.forEach((gp, i) => { gp.getWorldPosition(v); if (v.y < lo) { lo = v.y; ride = i; } });
        }
        lastT = t;
        R.gond[ride].getWorldPosition(v); v.y -= 0.85;
        w.set(-v.x, 0, -v.z).normalize();                                  // out towards the middle of town
        const a = p.group.worldToLocal(v.clone()), b = p.group.worldToLocal(v.clone().addScaledVector(w, 10).setY(v.y - 1.5));
        return { pos: a.toArray(), look: b.toArray(), roll: 0 };
      };
    },
  };

  /* ------------------------------------------------------------------ */
  /* NO JOBB (FLASH) — a hill at night; every kick sends up a firework   */
  /* ------------------------------------------------------------------ */
  PLACES.flash = {
    build(p, E) {
      const g = p.group, r = E.rng(71);
      const HR = 21, HH = 5;   // (21 m: its foot stops at FIELD's apartment house, whose north wing stands 14 m from the top)
      const height = (lx, lz) => { const d = Math.hypot(lx, lz); return d >= HR ? 0 : HH * 0.5 * (1 + Math.cos((Math.PI * d) / HR)); };
      p.ground = height;
      const hg = new THREE.RingGeometry(0.01, HR, 48, 18);
      const hp = hg.attributes.position;
      for (let i = 0; i < hp.count; i++) {
        const x = hp.getX(i), y = hp.getY(i);
        hp.setZ(i, height(x, -y) + (Math.hypot(x, y) < HR - 0.5 ? (r() - 0.5) * 0.15 : 0) + 0.01);
      }
      hg.computeVertexNormals();
      const hillM = E.mat('#6c9a50', { flat: true });
      const hill = new THREE.Mesh(hg, hillM);
      hill.rotation.x = -Math.PI / 2;
      hill.receiveShadow = true;
      g.add(hill); p.pick(hill);

      const h0 = height(0, 0);
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 4.4, 7), E.mat('#4f3a2a'));
      trunk.position.y = 2.2; trunk.castShadow = true;
      tree.add(trunk);
      [[0, 5.2, 0, 2.4], [1.4, 4.6, 0.6, 1.8], [-1.3, 4.7, -0.4, 1.8], [0.2, 6.4, 0.2, 1.6]].forEach(([x, y, z, s]) => {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), E.mat('#2f5a33', { flat: true }));
        m.position.set(x, y, z); m.castShadow = true; tree.add(m);
      });
      tree.position.set(-9, height(-9, 2) - 0.1, 2);
      g.add(tree);
      p.addCircle(-9, 2, 0.7);

      E.bench(g, 0, -1.4, Math.PI, h0 - 0.05);
      p.addBox(0, -1.4, 1.2, 0.4);
      const lamp = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3, 6), E.mat('#2a2a30'));
      post.position.y = 1.5; lamp.add(post);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffd9a0' }));
      bulb.position.y = 3.05; lamp.add(bulb);
      lamp.position.set(-2.2, height(-2.2, -0.8) - 0.05, -0.8);
      g.add(lamp);
      p.addCircle(-2.2, -0.8, 0.3);
      const lampLight = new THREE.PointLight('#ffc98a', 1.2, 12, 2);
      lampLight.position.set(-2.2, h0 + 2.8, -0.8);
      g.add(lampLight);

      // Distant town lights on the horizon
      const TN = 400, tpos = new Float32Array(TN * 3), tcol = new Float32Array(TN * 3);
      for (let i = 0; i < TN; i++) {
        tpos.set([(r() - 0.5) * 260, 0.3 + r() * 3, -120 - r() * 50], i * 3);
        const c = new THREE.Color(r() < 0.7 ? '#ffc77a' : '#9fd8ff').convertSRGBToLinear();
        tcol.set([c.r, c.g, c.b], i * 3);
      }
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.BufferAttribute(tpos, 3));
      tg.setAttribute('color', new THREE.BufferAttribute(tcol, 3));
      g.add(new THREE.Points(tg, new THREE.PointsMaterial({ size: 1.4, map: E.dot(), vertexColors: true, fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));

      // Fireworks
      const MAX = 2600;
      const fpos = new Float32Array(MAX * 3).fill(-999), fcol = new Float32Array(MAX * 3);
      const vel = new Float32Array(MAX * 3), life = new Float32Array(MAX), maxLife = new Float32Array(MAX), base = new Float32Array(MAX * 3);
      let head = 0;
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
      fg.setAttribute('color', new THREE.BufferAttribute(fcol, 3));
      const fw = new THREE.Points(fg, new THREE.PointsMaterial({ size: 1.6, map: E.dot(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      fw.frustumCulled = false;
      g.add(fw);
      const pal = ['#ff7ac8', '#ffd36b', '#8fd3ff', '#b9ff8f', '#ffffff', '#ff8a5a'].map((c) => new THREE.Color(c).convertSRGBToLinear());
      const rockets = [];
      const flash = new THREE.PointLight('#ffffff', 0, 140, 1.2);
      g.add(flash);
      let lastBurst = -9;
      const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

      function emit(x, y, z, vx, vy, vz, c, l) {
        const i = head; head = (head + 1) % MAX;
        fpos.set([x, y, z], i * 3); vel.set([vx, vy, vz], i * 3);
        base.set([c.r, c.g, c.b], i * 3);
        life[i] = l; maxLife[i] = l;
      }
      function burst(x, y, z, big) {
        const c1 = pal[Math.floor(r() * pal.length)], c2 = pal[Math.floor(r() * pal.length)];
        const n = big ? 220 : 130, sp = big ? 16 : 11;
        for (let k = 0; k < n; k++) {
          const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
          const v = sp * (0.75 + r() * 0.25);
          emit(x, y, z, Math.cos(a) * s * v, u * v, Math.sin(a) * s * v, k % 3 ? c1 : c2, 1.6 + r() * 0.9);
        }
        flash.position.set(x, y, z);
        flash.color.copy(c1);
        flash.intensity = RM ? 0.8 : big ? 5 : 3;
      }

      p.grade = {
        top: '#040619', bottom: '#201c55', fog: '#161a40', near: 18, far: 130,
        sun: '#7f8cff', sunInt: 0.32, hemi: 0.3, sunDir: [0.3, 0.8, 0.4],
        tint: [0.92, 0.96, 1.15], expo: 1.2, sat: 1.05, stars: 1,
      };
      p.map = [{ t: 'circle', x: 0, z: 0, r: HR, c: '#4f7a3e' }];
      p.face = Math.PI;
      p.pathEnd = 2.5;
      p.clearR = HR + 2;
      p.blocks = (lx, lz) => Math.hypot(lx, lz) < HR + 3 || (lz < 0 && lz > -100 && Math.abs(lx) < 20 - lz * 0.4);

      p.update = (t, dt, f, v) => {
        if (f.beat && v > 0.05 && t - lastBurst > 0.34) {
          lastBurst = t;
          const big = f.bass > 0.72;
          rockets.push({ x: (r() - 0.5) * 70, z: -50 - r() * 30, y: 0, ty: 26 + r() * 22, big, tr: 0 });
        }
        for (let i = rockets.length - 1; i >= 0; i--) {
          const k = rockets[i];
          k.y += dt * 46;
          k.tr += dt;
          if (k.tr > 0.02) { k.tr = 0; emit(k.x, k.y, k.z, (r() - 0.5), -2, (r() - 0.5), pal[1], 0.5); }
          if (k.y >= k.ty) { burst(k.x, k.y, k.z, k.big); rockets.splice(i, 1); }
        }
        for (let i = 0; i < MAX; i++) {
          if (life[i] <= 0) continue;
          const j = i * 3;
          life[i] -= dt;
          if (life[i] <= 0) { fpos[j + 1] = -999; fcol.fill(0, j, j + 3); continue; }
          vel[j] *= 0.985; vel[j + 1] = vel[j + 1] * 0.985 - 7 * dt; vel[j + 2] *= 0.985;
          fpos[j] += vel[j] * dt; fpos[j + 1] += vel[j + 1] * dt; fpos[j + 2] += vel[j + 2] * dt;
          const a = life[i] / maxLife[i], tw = a > 0.3 ? 1 : 0.5 + 0.5 * Math.sin(t * 40 + i);
          fcol[j] = base[j] * a * tw; fcol[j + 1] = base[j + 1] * a * tw; fcol[j + 2] = base[j + 2] * a * tw;
        }
        fg.attributes.position.needsUpdate = true;
        fg.attributes.color.needsUpdate = true;
        flash.intensity *= Math.exp(-dt * 7);
        lampLight.intensity = 1 + f.level * 0.6;
      };
      p.shot = (t) => ({ pos: [Math.sin(t * 0.05) * 2.5, h0 + 1.9, 6], look: [0, 24, -60], roll: 0 });
    },
  };

  /* ------------------------------------------------------------------ */
  /* Generic stage for songs with no dedicated scene                     */
  /* ------------------------------------------------------------------ */
  PLACES.generic = {
    build(p, E) {
      const g = p.group, color = new THREE.Color(p.song.color || '#ffb428');
      const stage = new THREE.Mesh(new THREE.CylinderGeometry(9, 9.4, 0.3, 40), E.mat('#2c2833'));
      stage.position.set(0, 0.15, -8); stage.receiveShadow = true;
      g.add(stage); p.pick(stage);
      const N = 40, bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 1, 0.5).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color }), N);
      g.add(bars);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), ps = new THREE.Vector3(), sc = new THREE.Vector3();
      p.grade = { top: '#14121c', bottom: '#3a2a4a', fog: '#241c30', near: 16, far: 120, sun: '#c0b0ff', sunInt: 0.6, hemi: 0.35, sunDir: [0.3, 0.8, 0.3], tint: [1, 0.96, 1.08], expo: 1.15, sat: 1.1, stars: 0.6 };
      p.map = [{ t: 'circle', x: 0, z: -8, r: 9, c: '#3a3442' }];
      p.face = Math.PI;
      p.pathEnd = 3;
      p.clearR = 14;
      p.blocks = (lx, lz) => Math.hypot(lx, lz + 8) < 14;
      p.update = (t, dt, f) => {
        for (let i = 0; i < N; i++) {
          const a = (i / N) * Math.PI * 2;
          ps.set(Math.cos(a) * 8, 0.3, -8 + Math.sin(a) * 8);
          sc.set(1, 0.2 + band(f, i % 24, 24) * 7, 1);
          bars.setMatrixAt(i, m4.compose(ps, q, sc));
        }
        bars.instanceMatrix.needsUpdate = true;
      };
      p.shot = (t) => ({ pos: [Math.sin(t * 0.1) * 12, 5, -8 + Math.cos(t * 0.1) * 12], look: [0, 2, -8], roll: 0 });
    },
  };

  SW.PLACES = PLACES;
})();
