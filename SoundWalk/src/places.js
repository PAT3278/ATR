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
 *   p.ground     optional (lx, lz) -> height
 * and uses p.addCircle / p.addBox for collisions and p.pick for click-to-walk surfaces.
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
  /* KEYAKI — zelkova avenue in golden afternoon light                   */
  /* ------------------------------------------------------------------ */
  PLACES.keyaki = {
    build(p, E) {
      const g = p.group, r = E.rng(11);
      const pave = E.plane(7.5, 66, E.mat('#d2c3a2', { map: E.tex('paving', 2, 17) }));
      pave.position.set(0, 0.03, -27);
      g.add(pave); p.pick(pave);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(6, 32), E.mat('#d2c3a2', { map: E.tex('paving', 3, 3) }));
      disc.rotation.x = -Math.PI / 2; disc.position.y = 0.035; disc.receiveShadow = true;
      g.add(disc); p.pick(disc);

      const trunkM = E.mat('#5b4230');
      const leafMs = ['#4c8a3b', '#5a9a44', '#6ba94b', '#86b04a', '#b8c55c'].map((c) => E.mat(c, { flat: true }));
      const trees = [];
      const blobs = [[0, 2.4, 0, 2.1], [1.7, 1.7, 0.4, 1.6], [-1.7, 1.8, -0.3, 1.6], [0.3, 1.6, 1.6, 1.5], [-0.2, 1.5, -1.6, 1.5], [1.1, 3.2, -0.6, 1.4], [-1, 3.3, 0.7, 1.4], [0, 4, 0, 1.2]];
      for (let i = 0; i < 11; i++) {
        for (const side of [-1, 1]) {
          const x = side * 5.2, z = 3 - i * 5.6;
          const tree = new THREE.Group();
          tree.position.set(x, 0, z);
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.45, 3.8, 7), trunkM);
          trunk.position.y = 1.9; trunk.castShadow = true;
          tree.add(trunk);
          for (const s of [-1, 1]) {
            const br = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 2.2, 5), trunkM);
            br.position.set(s * 0.5, 3.8, 0); br.rotation.z = -s * 0.5;
            tree.add(br);
          }
          const canopy = new THREE.Group();
          canopy.position.y = 3.4;
          for (const [bx, by, bz, br] of blobs) {
            const m = new THREE.Mesh(new THREE.IcosahedronGeometry(br * (0.85 + r() * 0.3), 0), leafMs[Math.floor(r() * leafMs.length)]);
            m.position.set(bx * 1.1, by, bz);
            m.rotation.set(r() * 3, r() * 3, 0);
            m.castShadow = true;
            canopy.add(m);
          }
          tree.add(canopy);
          g.add(tree);
          trees.push({ canopy, seed: r() * 6 });
          p.addCircle(x, z, 0.6);
        }
      }
      E.bench(g, -2.6, 1.2, Math.PI);
      p.addBox(-2.6, 1.2, 1.2, 0.4);

      // Falling leaves
      const N = 460, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), seed = new Float32Array(N);
      const lc = ['#9bc75a', '#7fb24a', '#e3c55a', '#c99a45', '#b6d36a'].map((c) => new THREE.Color(c).convertSRGBToLinear());
      for (let i = 0; i < N; i++) {
        pos[i * 3] = (r() - 0.5) * 16; pos[i * 3 + 1] = r() * 8; pos[i * 3 + 2] = 6 - r() * 62;
        const c = lc[i % lc.length]; col.set([c.r, c.g, c.b], i * 3); seed[i] = r() * 10;
      }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      lg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const leaves = new THREE.Points(lg, new THREE.PointsMaterial({ size: 0.13, map: E.dot(), alphaTest: 0.3, vertexColors: true, transparent: true, depthWrite: false }));
      g.add(leaves);

      // Shafts of light through the canopy
      const rays = [];
      for (let i = 0; i < 7; i++) {
        const m = new THREE.MeshBasicMaterial({ color: '#fff0bf', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
        const ray = new THREE.Mesh(new THREE.PlaneGeometry(1.2 + r() * 1.4, 14), m);
        ray.position.set((r() - 0.5) * 7, 5, -4 - i * 7);
        ray.rotation.set(0, r() * Math.PI, 0.35);
        g.add(ray);
        rays.push({ m, seed: r() * 6 });
      }

      p.grade = {
        top: '#86b4d9', bottom: '#ffe6ad', fog: '#efdcaa', near: 22, far: 120,
        sun: '#ffd08a', sunInt: 2.5, hemi: 0.62, sunDir: [0.3, 0.42, -0.6],
        tint: [1.05, 1.0, 0.88], expo: 0.98, sat: 1.0, stars: 0,
      };
      p.map = [{ t: 'rect', x: 0, z: -27, w: 16, h: 66, c: '#4f7a3a' }, { t: 'rect', x: 0, z: -27, w: 7.5, h: 66, c: '#cdbf9f' }];
      p.face = Math.PI;
      p.pathEnd = 7;
      p.clearR = 10;
      p.blocks = (lx, lz) => Math.abs(lx) < 9.5 && lz > -66 && lz < 9;

      p.update = (t, dt, f, v) => {
        const sway = 0.022 * (1 + f.bass * 3);
        trees.forEach((tr) => {
          tr.canopy.rotation.z = Math.sin(t * 1.2 + tr.seed) * sway;
          tr.canopy.rotation.x = Math.cos(t * 0.9 + tr.seed) * sway * 0.7;
        });
        if (v > 0.01) {
          const fall = 0.45 + f.high * 1.8 + f.pulse * 0.5;
          for (let i = 0; i < N; i++) {
            const k = i * 3;
            pos[k + 1] -= dt * fall * (0.6 + (seed[i] % 1) * 0.8);
            pos[k] += Math.sin(t * 1.7 + seed[i]) * dt * 0.5;
            pos[k + 2] += Math.cos(t * 1.3 + seed[i]) * dt * 0.25;
            if (pos[k + 1] < 0.02) { pos[k + 1] = 6 + r() * 2.5; pos[k] = (r() - 0.5) * 16; pos[k + 2] = 6 - r() * 62; }
          }
          lg.attributes.position.needsUpdate = true;
        }
        rays.forEach((ry) => { ry.m.opacity = v * (0.025 + f.mid * 0.11) * (0.6 + 0.4 * Math.sin(t * 0.7 + ry.seed)); });
      };
      p.shot = (t, f) => {
        const k = Math.sin(t * 0.11) * 0.5 + 0.5;
        return { pos: [Math.sin(t * 0.21) * 0.5, 1.7, 2 - k * 18], look: [0, 3.4, -70], roll: Math.sin(t * 0.3) * 0.01 };
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
        uniforms: { t: { value: 0 }, level: { value: 0 }, a: { value: new THREE.Color('#ff9a5c') }, b: { value: new THREE.Color('#2d2456') } },
        vertexShader: 'varying vec2 vUv;varying vec3 vW;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
        fragmentShader: 'uniform float t,level;uniform vec3 a,b;varying vec2 vUv;varying vec3 vW;' +
          'void main(){float y=vUv.y;vec3 c=mix(b,a,pow(1.-y,1.6));' +
          'float s=sin(vUv.x*420.+t*1.3+sin(vUv.y*40.+t)*2.)*sin(vUv.y*90.-t*2.);' +
          'float glint=smoothstep(.55,1.,s)*(.25+level*1.2);' +
          'float col=exp(-pow((vUv.x-.53)*28.,2.));c+=vec3(1.,.75,.45)*glint*(.35+col*1.6);' +
          'c+=vec3(1.,.6,.35)*col*.25*(1.-y);gl_FragColor=vec4(pow(c,vec3(2.2)),1.);}',
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
      const emb2 = new THREE.Mesh(new THREE.BoxGeometry(5, 3.6, 120), embM);
      emb2.position.set(BX, 1.8, RZ - 77); g.add(emb2);
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
      // The crowd: people with their own clothes, skin and hair, each with a way of moving to the music.
      const crowd = [], cr = E.rng(909);
      {
        const skins = ['#f0c9a4', '#d9a57c', '#b07a52', '#8a5a3c', '#5e3d2a'].map((c) => E.mat(c, { rough: 0.7 }));
        const tops = ['#b3161d', '#d8d2c0', '#1f3a5a', '#2c2c30', '#6a4a2a', '#3d5a3a', '#c9a52e', '#5a2a5a'].map((c) => E.mat(c, { rough: 0.85 }));
        const pantsM = ['#17181c', '#262b36', '#3a3026'].map((c) => E.mat(c, { rough: 0.9 })), hairs = ['#0f0c0a', '#2a1a10', '#6a4a2a', '#b8b2a4'].map((c) => E.mat(c, { rough: 0.6 }));
        const legG = new THREE.BoxGeometry(0.3, 0.86, 0.2).translate(0, 0.43, 0), torsoG = new THREE.CylinderGeometry(0.21, 0.18, 0.6, 9).translate(0, 0.3, 0), headG = new THREE.SphereGeometry(0.13, 12, 9);
        const hairG = new THREE.SphereGeometry(0.14, 12, 8, 0, 6.3, 0, 1.7), armG = new THREE.CylinderGeometry(0.055, 0.045, 0.58, 7).translate(0, -0.29, 0), handG = new THREE.SphereGeometry(0.055, 7, 6);
        const lightG = new THREE.PlaneGeometry(0.08, 0.14), lightM = new THREE.MeshBasicMaterial({ color: '#dfeaff', side: THREE.DoubleSide });
        for (let i = 0; i < 60 && crowd.length < 18; i++) {
          const x = -1.9 + cr() * 5.6, z = -5.6 + cr() * 11.2;
          if (Math.abs(z) < 1.4 && x < 0.6) continue;                                          // keep the spot in front of the stage free
          if (crowd.some((c) => Math.hypot(c.f.position.x - x, c.f.position.z - z) < 0.65)) continue;   // and nobody standing inside somebody else
          const f = new THREE.Group(), up = new THREE.Group(), skin = skins[Math.floor(cr() * skins.length)], top = tops[Math.floor(cr() * tops.length)];
          f.add(new THREE.Mesh(legG, pantsM[Math.floor(cr() * pantsM.length)]));
          up.position.y = 0.86; f.add(up);                                                      // everything above the hips sways and twists together
          const torso = new THREE.Mesh(torsoG, top); torso.scale.z = 0.68; up.add(torso);
          const head = new THREE.Mesh(headG, skin); head.position.y = 0.76; up.add(head);
          const hair = new THREE.Mesh(hairG, hairs[Math.floor(cr() * hairs.length)]); hair.position.y = 0.02; head.add(hair);   // on the head, so the nod shows
          const arms = [-1, 1].map((sd) => { const piv = new THREE.Group(); piv.position.set(sd * 0.26, 0.56, 0); piv.add(new THREE.Mesh(armG, top)); const hd = new THREE.Mesh(handG, skin); hd.position.y = -0.6; piv.add(hd); up.add(piv); return piv; });
          const style = Math.floor(cr() * 4);                                                   // 0 pumping one fist, 1 both hands up, 2 filming with a phone, 3 swaying
          if (style === 2) { const ph = new THREE.Mesh(lightG, lightM); ph.position.set(0, -0.68, 0.03); ph.rotation.y = Math.PI; arms[1].add(ph); }
          f.position.set(x, 0.05, z); f.rotation.y = -Math.PI / 2 + (cr() - 0.5) * 0.5;          // facing the stage
          f.scale.setScalar(0.9 + cr() * 0.2); V.add(f);
          crowd.push({ f, up, head, arms, style, s: cr() * 6.28, e: 0.6 + cr() * 0.7, jump: 0 });
          p.addCircle(BX + x, CZ + z, 0.3, -1e9, 3);
        }
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
        crowd.forEach((c) => {
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
      const cityM = E.mat('#2a2140', { emissiveMap: E.tex('windows', 1, 3), emissive: '#ffcf8a', emissiveIntensity: 0.6 });
      const city = [];
      for (let i = 0; i < 38; i++) {
        const bgeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
        const b = new THREE.Mesh(bgeo, cityM);
        const base = 4 + r() * 12;
        b.position.set(-80 + i * 4.3 + r() * 2, 0, -62 - r() * 16);
        b.scale.set(3 + r() * 2, base, 3 + r() * 2);
        g.add(b);
        city.push({ b, base, k: i % 24 });
      }

      E.bench(g, 2.6, -2, Math.PI);
      p.addBox(2.6, -2, 1.2, 0.4);

      p.grade = {
        top: '#3a2e62', bottom: '#ff9566', fog: '#e48a68', near: 20, far: 150,
        sun: '#ff9a5a', sunInt: 2.2, hemi: 0.55, sunDir: [0.1, 0.12, -1],
        tint: [1.1, 0.95, 0.88], expo: 1.0, sat: 1.1, stars: 0.1,
      };
      p.map = [{ t: 'rect', x: 0, z: RZ, w: 100, h: RW, c: '#3f6f9e' }, { t: 'rect', x: BX, z: RZ - 40, w: 4, h: 150, c: '#56604a' }];
      p.face = Math.PI;
      p.pathEnd = 4;
      p.clearR = 9;
      p.blocks = (lx, lz) => (lz < -4 && lz > -60 && Math.abs(lx) < 52) || (Math.abs(lx - BX) < 10 && lz > -150 && lz < 56) || Math.hypot(lx, lz) < 8;
      p.noPier = (lx) => Math.abs(lx - BX) < 5.5;   // the ring road crosses the railway: no pier on the tracks

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
        city.forEach((c) => { c.b.scale.y += (c.base * (0.65 + band(f, c.k, 24) * 0.9) - c.b.scale.y) * Math.min(1, dt * 10); });
        cityM.emissiveIntensity = 0.4 + f.mid * 1.2;
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
      const neonCols = ['#ff3fb0', '#3ff0ff', '#ffe14f', '#9b6bff', '#ff6b3f'];
      const buildings = [];
      const spots = [];
      for (const x of [-25, -13, 13, 25]) for (const z of [-30, -18, -6, 6]) spots.push([x, z]);
      spots.push([-4, -33], [6, -33]);
      spots.forEach(([x, z], i) => {
        const w = 8 + r() * 3, d = 8 + r() * 3, h = 12 + r() * 26;
        const tex = E.tex('windows', Math.max(1, Math.round(w / 4)), Math.max(1, Math.round(h / 4))).clone();
        tex.needsUpdate = true;
        const m = E.mat('#1b1724', { emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.6, rough: 0.7 }, true);
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
        b.position.set(x + (r() - 0.5) * 2, h / 2, z + (r() - 0.5) * 2);
        b.castShadow = true;
        city.add(b);
        p.addBox(b.position.x, b.position.z, w / 2 + 0.3, d / 2 + 0.3);
        const nc = new THREE.Color(neonCols[i % neonCols.length]).convertSRGBToLinear();
        const nm = new THREE.MeshBasicMaterial({ color: nc.clone() });
        nm.userData.lin = true;
        const face = Math.abs(x) > 1 ? -Math.sign(x) : 1;
        const sign = new THREE.Mesh(new THREE.BoxGeometry(0.35, Math.min(9, h * 0.45), 1.4), nm);
        if (Math.abs(x) > 1) sign.position.set(b.position.x + face * (w / 2 + 0.25), h * 0.55, b.position.z + d * 0.3);
        else sign.position.set(b.position.x, h * 0.55, b.position.z + d / 2 + 0.25);
        if (Math.abs(x) <= 1) sign.rotation.y = Math.PI / 2;
        city.add(sign);
        buildings.push({ m, k: i % 24, nm, nc, seed: r() * 6 });
      });
      g.add(city);

      // Billboard at the end of the street
      const bbTex = E.textTex('FLIP DA HOODS', { w: 1024, h: 256, color: '#ff3fb0', glow: '#ff3fb0', font: '700 150px "Hind", sans-serif' });
      const bb = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), new THREE.MeshBasicMaterial({ map: bbTex, transparent: true }));
      bb.position.set(1, 20, -27);
      g.add(bb);

      // The same city hanging upside down above the crossing
      const upside = new THREE.Group();
      upside.add(city.clone(), ground.clone(), stripes.clone(), bb.clone());
      upside.scale.y = -1;
      upside.position.y = 66;
      g.add(upside);

      const light = new THREE.PointLight('#ff3fb0', 2, 45, 1.6);
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
      p.map = [{ t: 'rect', x: 0, z: -8, w: 60, h: 50, c: '#2b2831' }];
      p.face = Math.PI;
      p.pathEnd = 18;
      p.clearR = 14;
      p.blocks = (lx, lz) => Math.abs(lx) < 34 && lz > -40 && lz < 20;

      let roll = 0, rollTarget = 0, lastFlip = 0;
      p.update = (t, dt, f) => {
        buildings.forEach((b) => {
          b.m.emissiveIntensity = 0.25 + band(f, b.k, 24) * 2.2;
          const s = 0.55 + 0.45 * Math.sin(t * 2 + b.seed) * 0.3 + f.pulse * 0.7;
          b.nm.color.copy(b.nc).multiplyScalar(Math.min(1.6, s + 0.3));
        });
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
  PLACES.stereotype = {
    build(p, E) {
      const g = p.group, r = E.rng(53);
      const floor = E.plane(44, 44, E.mat('#8d8d8d', { map: E.tex('checker', 11, 11), rough: 0.6 }));
      floor.position.set(0, 0.03, -10);
      g.add(floor); p.pick(floor);

      const COLS = 7, ROWS = 5, n = COLS * ROWS;
      const figM = E.mat('#d8d8d8', { rough: 0.6 });
      const bodyGeo = new THREE.CylinderGeometry(0.3, 0.42, 1.3, 10).translate(0, 0.65, 0);
      const headGeo = new THREE.SphereGeometry(0.3, 14, 10).translate(0, 1.62, 0);
      const bodies = new THREE.InstancedMesh(bodyGeo, figM, n);
      const heads = new THREE.InstancedMesh(headGeo, figM, n);
      bodies.castShadow = heads.castShadow = true;
      const cells = [];
      for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
        const x = (col - (COLS - 1) / 2) * 3, z = -5 - row * 3.8;
        cells.push({ x, z, col });
        p.addCircle(x, z, 0.6);
      }
      g.add(bodies, heads);
      const oddM = new THREE.MeshStandardMaterial({ color: '#ff3fa8', emissive: '#ff2f9a', emissiveIntensity: 1.6, roughness: 0.5 });
      const odd = new THREE.Group();
      odd.add(new THREE.Mesh(bodyGeo, oddM), new THREE.Mesh(headGeo, oddM));
      odd.children.forEach((m) => { m.castShadow = true; });
      g.add(odd);

      // A wall of test-pattern bars at the back, heights from the spectrum
      const bars = [];
      for (let i = 0; i < 16; i++) {
        const shade = Math.round(40 + (i % 8) * 28);
        const m = E.mat(`rgb(${shade},${shade},${shade})`);
        const b = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1, 1).translate(0, 0.5, 0), m);
        b.position.set(-18.4 + i * 2.45, 0, -29);
        b.castShadow = true;
        g.add(b);
        bars.push(b);
      }
      p.addBox(0, -29, 20, 0.8);

      p.grade = {
        top: '#7f8288', bottom: '#c9c9c9', fog: '#a9aaae', near: 30, far: 170,
        sun: '#ffffff', sunInt: 2.2, hemi: 0.55, sunDir: [0.55, 0.45, 0.3],
        tint: [0.98, 1, 1.02], expo: 0.86, sat: 0.36, stars: 0,
      };
      p.map = [{ t: 'rect', x: 0, z: -10, w: 44, h: 44, c: '#d8d8d8' }];
      p.face = Math.PI;
      p.pathEnd = 12;
      p.clearR = 12;
      p.blocks = (lx, lz) => Math.abs(lx) < 25 && lz > -34 && lz < 14;

      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), ps = new THREE.Vector3(), sc = new THREE.Vector3();
      let oddIdx = 17, lastBeats = 0, timer = 0;
      p.update = (t, dt, f) => {
        timer += dt;
        if ((f.beats !== lastBeats && f.beats % 8 === 0) || timer > 6) {
          lastBeats = f.beats; timer = 0;
          let nx = oddIdx;
          while (nx === oddIdx) nx = Math.floor(r() * n);
          oddIdx = nx;
        }
        lastBeats = f.beats;
        const bob = f.pulse * 0.16;
        cells.forEach((c, i) => {
          const s = i === oddIdx ? 0.0001 : 1 + band(f, c.col * 3 + 2, 24) * 0.35;
          ps.set(c.x, bob, c.z); sc.set(1, s, 1);
          m4.compose(ps, q, sc);
          bodies.setMatrixAt(i, m4);
          heads.setMatrixAt(i, m4);
        });
        bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
        const oc = cells[oddIdx];
        odd.position.x += (oc.x - odd.position.x) * Math.min(1, dt * 6);
        odd.position.z += (oc.z - odd.position.z) * Math.min(1, dt * 6);
        odd.position.y = bob * 1.6;
        odd.rotation.y = Math.sin(t * 2) * 0.6;
        bars.forEach((b, i) => { b.scale.y += (0.4 + band(f, i + 4, 24) * 9 - b.scale.y) * Math.min(1, dt * 12); });
      };
      p.shot = (t) => ({ pos: [Math.sin(t * 0.07) * 4, 6.5, 5], look: [0, 0.6, -14], roll: 0 });
    },
  };

  /* ------------------------------------------------------------------ */
  /* NO JOBB (FLASH) — a hill at night; every kick sends up a firework   */
  /* ------------------------------------------------------------------ */
  PLACES.flash = {
    build(p, E) {
      const g = p.group, r = E.rng(71);
      const HR = 30, HH = 5;
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
