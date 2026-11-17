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
      // The crowd: people with their own clothes, skin and hair, each with a way of moving to the music.
      const crowd = [], cr = E.rng(909);
      {
        const skins = ['#f0c9a4', '#d9a57c', '#b07a52', '#8a5a3c', '#5e3d2a'].map((c) => E.mat(c, { rough: 0.7 }));
        // techwear: dark technical shells with a sheen, a few pale ones, olive and slate; nothing loud
        const tops = ['#1e2024', '#2c3036', '#3a4038', '#c9ccd1', '#14161a', '#4a4f58', '#2b2f3a', '#8a9098'].map((c) => E.gloss ? E.gloss(c, { rough: 0.5, metal: 0.12, env: 0.45 }) : E.mat(c, { rough: 0.6 }));
        const pantsM = ['#141518', '#1e2126', '#2a2e26'].map((c) => E.mat(c, { rough: 0.85 })), hairs = ['#0f0c0a', '#2a1a10', '#6a4a2a', '#b8b2a4'].map((c) => E.mat(c, { rough: 0.6 }));
        const legG = new THREE.BoxGeometry(0.3, 0.86, 0.2).translate(0, 0.43, 0), torsoG = new THREE.CylinderGeometry(0.21, 0.18, 0.6, 9).translate(0, 0.3, 0), headG = new THREE.SphereGeometry(0.13, 12, 9);
        const hairG = new THREE.SphereGeometry(0.14, 12, 8, 0, 6.3, 0, 1.7), armG = new THREE.CylinderGeometry(0.055, 0.045, 0.58, 7).translate(0, -0.29, 0), handG = new THREE.SphereGeometry(0.055, 7, 6);
        const lightG = new THREE.PlaneGeometry(0.08, 0.14), lightM = new THREE.MeshBasicMaterial({ color: '#dfeaff', side: THREE.DoubleSide });
        // more detail, shared geometry: two legs and trainers, a neck, a hood or a collar, a cap / beanie / bucket hat, a bag strap
        const legG1 = new THREE.CylinderGeometry(0.085, 0.07, 0.84, 7).translate(0, 0.42, 0), shoeG = new THREE.BoxGeometry(0.12, 0.08, 0.27).translate(0, 0.04, 0.04), neckG = new THREE.CylinderGeometry(0.055, 0.06, 0.12, 7);
        const hoodG = new THREE.SphereGeometry(0.14, 9, 6), collarG = new THREE.TorusGeometry(0.11, 0.035, 5, 10), capG = new THREE.SphereGeometry(0.142, 10, 6, 0, 6.3, 0, 1.4), brimG = new THREE.CylinderGeometry(0.1, 0.11, 0.012, 10);
        const beanieG = new THREE.SphereGeometry(0.145, 10, 7, 0, 6.3, 0, 1.55), bucketG = new THREE.CylinderGeometry(0.14, 0.2, 0.1, 12), strapG = new THREE.TorusGeometry(0.24, 0.012, 4, 16);
        const shoeMs = ['#eef0f2', '#121316', '#9aa0a8', '#d8dce0'].map((c) => E.mat(c, { rough: 0.45 })), hatMs = ['#121316', '#1e2228', '#3a4038', '#8a9098'].map((c) => E.mat(c, { rough: 0.7 })), strapM = E.mat('#0e0f12', { rough: 0.4, metal: 0.3 });
        // one cool accent, in thin lines: piping down a sleeve or the side of the body, visors on some
        const accM = E.basic ? E.basic('#7fe9ff') : lightM, accG = new THREE.BoxGeometry(0.012, 0.5, 0.012), visorG = new THREE.TorusGeometry(0.135, 0.02, 5, 16, Math.PI * 0.62), visorM = E.gloss ? E.gloss('#0a0c10', { rough: 0.08, metal: 0.6, env: 1.2 }) : strapM;
        for (let i = 0; i < 60 && crowd.length < 18; i++) {
          const x = -1.9 + cr() * 5.6, z = -5.6 + cr() * 11.2;
          if (Math.abs(z) < 1.4 && x < 0.6) continue;                                          // keep the spot in front of the stage free
          if (crowd.some((c) => Math.hypot(c.f.position.x - x, c.f.position.z - z) < 0.65)) continue;   // and nobody standing inside somebody else
          const f = new THREE.Group(), up = new THREE.Group(), skin = skins[Math.floor(cr() * skins.length)], top = tops[Math.floor(cr() * tops.length)];
          { const pm = pantsM[Math.floor(cr() * pantsM.length)], sm = shoeMs[Math.floor(cr() * shoeMs.length)];
            for (const sd of [-1, 1]) { const l = new THREE.Mesh(legG1, pm); l.position.x = sd * 0.09; f.add(l); const sh = new THREE.Mesh(shoeG, sm); sh.position.x = sd * 0.09; f.add(sh); } }
          up.position.y = 0.86; f.add(up);                                                      // everything above the hips sways and twists together
          const torso = new THREE.Mesh(torsoG, top); torso.scale.z = 0.68; up.add(torso);
          const head = new THREE.Mesh(headG, skin); head.position.y = 0.76; up.add(head);
          { const nk = new THREE.Mesh(neckG, skin); nk.position.y = 0.64; up.add(nk);
            if (cr() < 0.5) { const hd = new THREE.Mesh(hoodG, top); hd.position.set(0, 0.58, -0.13); hd.scale.set(1.1, 0.75, 0.6); up.add(hd); }   // a hoodie
            else { const cl = new THREE.Mesh(collarG, top); cl.rotation.x = Math.PI / 2; cl.position.y = 0.6; cl.scale.set(1, 0.8, 1); up.add(cl); }      // a jacket
            if (cr() < 0.55) { const ac = new THREE.Mesh(accG, accM); ac.position.set(cr() < 0.5 ? 0.2 : -0.2, 0.3, 0); up.add(ac); }   // piping
            if (cr() < 0.3) { const st = new THREE.Mesh(strapG, strapM); st.rotation.set(0, Math.PI / 2, 0.75); st.position.y = 0.32; st.scale.set(1, 1, 0.7); up.add(st); } }   // a bag across the body
          const hair = new THREE.Mesh(hairG, hairs[Math.floor(cr() * hairs.length)]); hair.position.y = 0.02; head.add(hair);   // on the head, so the nod shows
          if (cr() < 0.35) { const v = new THREE.Mesh(visorG, visorM); v.rotation.y = Math.PI * 0.69; v.scale.set(1, 0.9, 1.04); head.add(v); }   // a visor
          { const k = cr(), hm = hatMs[Math.floor(cr() * hatMs.length)];
            if (k < 0.3) { const c = new THREE.Mesh(capG, hm); c.position.y = 0.025; head.add(c); const b = new THREE.Mesh(brimG, hm); b.position.set(0, 0.035, 0.12); b.rotation.x = 0.15; b.scale.z = 0.8; head.add(b); if (cr() < 0.3) c.rotation.y = Math.PI; }
            else if (k < 0.5) { const c = new THREE.Mesh(beanieG, hm); c.position.y = 0.03; head.add(c); }
            else if (k < 0.62) { const c = new THREE.Mesh(bucketG, hm); c.position.y = 0.09; head.add(c); } }
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
          if (yaw === 0 || yaw === Math.PI) p.addBox(x, z, w / 2 + 0.05, d / 2 + 0.05);
          else for (let k = -1; k <= 1; k++) { const [cx, cz] = at(k * (w / 3), 0); p.addCircle(cx, cz, Math.max(w / 3, d / 2) * 0.95); }
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
          cars.slice(0, 9).forEach(([bx, bz, s], i) => { const car = SW.Cars.make(E, i + 3); car.position.set(bx, 0.03, bz); car.rotation.y = SEA_YAW + (s > 20 ? Math.PI : 0); g.add(car); p.addCircle(bx, bz, 1.4); }); }
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
        { const NPp = 34, bodyG = new THREE.CylinderGeometry(0.2, 0.25, 1.1, 8).translate(0, 0.7, 0), headG = new THREE.SphereGeometry(0.15, 10, 8).translate(0, 1.42, 0);
          const pbI = new THREE.InstancedMesh(bodyG, E.mat('#ffffff', { rough: 0.7 }), NPp), phI = new THREE.InstancedMesh(headG, E.mat('#ffffff', { rough: 0.6 }), NPp);
          const coats = ['#2c3036', '#c9ccd1', '#7a2f2a', '#3a5a7a', '#d8d2c0', '#e6e0d0', '#4a6a3a', '#2457c5'], skins = ['#e1b18c', '#c8946a', '#f0c8a8', '#d6a07c'];
          port.peds = []; port.pedI = [pbI, phI];
          for (let i = 0; i < NPp; i++) {
            const prom = i % 3 === 2, k = pr();
            const path = prom ? { a: atST(8, 4.2), b: atST(40, 4.2) } : (i % 2 ? { a: [-48, MZ + 4.3 + (pr() - 0.5)], b: [sEnd(MZ) - 3, MZ + 4.3 + (pr() - 0.5)] } : { a: [-48, MZ - 4.3 + (pr() - 0.5)], b: [sEnd(MZ) - 3, MZ - 4.3 + (pr() - 0.5)] });
            port.peds.push({ path, t: k, dir: pr() < 0.5 ? 1 : -1, v: (0.9 + pr() * 0.5) / Math.hypot(path.b[0] - path.a[0], path.b[1] - path.a[1]), ph: pr() * 6 });
            pbI.setColorAt(i, E.lin(coats[Math.floor(pr() * coats.length)])); phI.setColorAt(i, E.lin(skins[Math.floor(pr() * skins.length)]));
          }
          pbI.castShadow = true; pbI.frustumCulled = phI.frustumCulled = false; g.add(pbI, phI); }
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
        if (port.peds) { const [pbI, phI] = port.pedI, m4 = port.m4 || (port.m4 = new THREE.Matrix4()), q = port.q || (port.q = new THREE.Quaternion()), up = new THREE.Vector3(0, 1, 0), ps = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
          port.peds.forEach((o, i) => { o.t += o.dir * o.v * dt; if (o.t > 1) { o.t = 1; o.dir = -1; } else if (o.t < 0) { o.t = 0; o.dir = 1; }
            const { a, b } = o.path, x = a[0] + (b[0] - a[0]) * o.t, z = a[1] + (b[1] - a[1]) * o.t;
            m4.compose(ps.set(x, Math.abs(Math.sin(t * 6 + o.ph)) * 0.04, z), q.setFromAxisAngle(up, Math.atan2((b[0] - a[0]) * o.dir, (b[1] - a[1]) * o.dir)), sc); pbI.setMatrixAt(i, m4); phI.setMatrixAt(i, m4); });
          pbI.instanceMatrix.needsUpdate = phI.instanceMatrix.needsUpdate = true; }
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
      const AV0 = -33, AV2 = -70, RC = [0, -82], RI = 4.5, RO = 10.5, TF = -97, ext = new THREE.Group(), extFeet = [], extSlabs = [], termClock = [];
      // the cabs' loop: down the southbound lane, round the roundabout (keeping the island on the left), back up
      const cabLoop = (() => { const pts = [[2.2, 18], [2.2, -40], [2.2, -62], [2.8, -70.5]]; const R = (RI + RO) / 2;
        for (let a = 0.55; a < Math.PI * 2 - 0.5; a += 0.25) pts.push([RC[0] + Math.sin(a) * R, RC[1] + Math.cos(a) * R]);
        pts.push([-2.8, -70.5], [-2.2, -62], [-2.2, -40], [-2.2, 18]);
        const c = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal'), L = c.getLength(), n = Math.round(L / 0.5), P = c.getSpacedPoints(n);
        return { L, n, P }; })();
      {
        const xr = E.rng(5151), MB = E.batch(ext), mb = MB.box;
        const asph = E.mat('#27242e', { map: E.tex('asphalt', 1.5, 8), rough: 0.9 }), asphR = E.mat('#27242e', { map: E.tex('asphalt', 3, 3), rough: 0.9 });
        const road = E.plane(11, AV0 - AV2 + 1, asph); road.position.set(0, 0.03, (AV0 + AV2 - 1) / 2); ext.add(road); p.pick(road);
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
        for (const sd of [-1, 1]) extSlabs.push({ cx: sd * 8.25, cz: (AV0 + AV2 + 2) / 2, hx: 2.75, hz: (AV0 - AV2 - 2) / 2, top: 0.15 });
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
        MB.flush();
        allSlabs.push(...extSlabs); ext.add(slabMesh(extSlabs));
      }
      g.add(ext);
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
        for (let k = 0; k < 4; k++) { const c = cab(Math.floor(mr() * 7)); g.add(c); mid.cabs.push({ c, s: (k / 4) * cabLoop.L, v: 8, yaw: 0 }); }   // running the avenue and round the station's roundabout
        // crowds on the sidewalks
        const NP = 110, bodyG = new THREE.CylinderGeometry(0.2, 0.26, 1.15, 8).translate(0, 0.72, 0), headG = new THREE.SphereGeometry(0.15, 10, 8).translate(0, 1.47, 0);
        const pb = new THREE.InstancedMesh(bodyG, E.mat('#ffffff', { rough: 0.7 }), NP), ph = new THREE.InstancedMesh(headG, E.mat('#ffffff', { rough: 0.6 }), NP);
        const coats = ['#1e2024', '#2c3036', '#7a2f2a', '#3a4038', '#c9ccd1', '#4a4f58', '#8a6a3a', '#2b2f3a', '#d8d2c0', '#2457c5'], skins = ['#e1b18c', '#c8946a', '#8a5a3c', '#f0c8a8', '#6a4430'];
        for (let i = 0; i < NP; i++) { const west = i % 2 === 0, x = (west ? -1 : 1) * (7.4 + mr() * 3.6); mid.ped.push({ x, z: -66 + mr() * 79, dir: mr() < 0.5 ? 1 : -1, v: 0.9 + mr() * 0.7, ph: mr() * 6 }); pb.setColorAt(i, E.lin(coats[Math.floor(mr() * coats.length)])); ph.setColorAt(i, E.lin(skins[Math.floor(mr() * skins.length)])); }
        pb.castShadow = true; pb.frustumCulled = ph.frustumCulled = false; g.add(pb, ph); mid.peds = [pb, ph];
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
      p.road = { hw: 5 };   // the avenue carries on to the fountain as a paved road (drawn by the game along the path)
      const onAvenue = (lx, lz) => Math.abs(lx) < 33 && lz <= -40 && lz > -116;   // the far stretch of the avenue and its blocks
      p.core = (lx, lz) => (Math.abs(lx) < 34 && lz > -40 && lz < 20) || onAvenue(lx, lz);   // the block itself; the outskirts are negotiable
      p.noPier = (lx, lz) => Math.abs(lx) < 7.5 && lz < -30;   // the ring road steps over the avenue
      p.reach = (lx, lz) => (Math.abs(lx) < 20 && lz < -20 && lz > -112 ? 8 : null);   // down the avenue you are still in the city: its night and its traffic
      p.blocks = (lx, lz) => (Math.abs(lx) < 34 && lz > -40 && lz < 20) || onAvenue(lx, lz) || feet.some((f) => Math.abs(f.x - lx) < Math.max(f.w, f.d) / 2 + 2.5 && Math.abs(f.z - lz) < Math.max(f.w, f.d) / 2 + 2.5) || nearWalk(lx, lz);

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
        mid.cabs.forEach((c) => { const nearRb = (() => { const f = c.s / cabLoop.L; return f > 0.35 && f < 0.65; })(); c.s = (c.s + c.v * (nearRb ? 0.6 : 1) * dt) % cabLoop.L;   // slower round the roundabout
          const u = (c.s / cabLoop.L) * cabLoop.n, i = Math.min(cabLoop.n - 1, Math.floor(u)), a = cabLoop.P[i], b2 = cabLoop.P[i + 1], k = u - i;
          c.c.position.set(a.x + (b2.x - a.x) * k, 0.03, a.z + (b2.z - a.z) * k);
          const want = Math.atan2(b2.x - a.x, b2.z - a.z), d = Math.atan2(Math.sin(want - c.yaw), Math.cos(want - c.yaw)); c.yaw = Math.abs(d) > 2.5 ? want : c.yaw + d * Math.min(1, dt * 8); c.c.rotation.y = c.yaw; });
        { const [pb, ph] = mid.peds; mid.ped.forEach((q, i) => { q.z += q.dir * q.v * dt; if (q.z > 14) q.z = -66; if (q.z < -66) q.z = 14; m4.compose(ps.set(q.x, 0.15 + Math.abs(Math.sin(t * 6 * q.v + q.ph)) * 0.04, q.z), qq.setFromAxisAngle(upV, q.dir > 0 ? 0 : Math.PI), sc.set(1, 1, 1)); pb.setMatrixAt(i, m4); ph.setMatrixAt(i, m4); }); pb.instanceMatrix.needsUpdate = ph.instanceMatrix.needsUpdate = true; }
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
      // The amusement park: a Ferris wheel at the back, a carousel in the middle, a drop tower and a little roller
      // coaster either side, a gate at the front, people queuing. Two songs live here, each heard riding something:
      // this place is the carousel's (its view rides a horse); the wheel's is PLACES.parkwheel, which borrows the wheel
      // built here (SW.parkRide). The rides keep time with the music.
      const g = p.group, r = E.rng(53);
      const floor = E.plane(76, 68, E.mat('#9a948a', { map: E.tex('paving', 18, 16), rough: 0.85 }));
      floor.position.set(-9, 0.03, -19);
      g.add(floor); p.pick(floor);
      const PB = E.batch(g), pb = PB.box;
      const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t; };
      const stripes = (a, b, n) => canvasTex(256, 64, (c, w, h) => { for (let i = 0; i < n; i++) { c.fillStyle = i % 2 ? b : a; c.fillRect((i * w) / n, 0, w / n + 1, h); } });
      const white = E.mat('#eeece6', { rough: 0.5 }), steel = E.mat('#b9bec4', { metal: 0.7, rough: 0.35 }), dark = E.mat('#2a2c30', { metal: 0.4, rough: 0.5 });
      const C = ['#e8b23a', '#3fa7d6', '#6cc070', '#9b7bd8', '#ef7a3a'].map((c) => E.mat(c, { rough: 0.5 }));
      const glow = (hex) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).convertSRGBToLinear().multiplyScalar(1.4) }); m.userData.lin = true; return m; };

      // the gate
      for (const sd of [-1, 1]) { const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 6, 14), E.mat('#ffffff', { map: stripes('#eeece6', '#3fa7d6', 8), rough: 0.5 })); col.position.set(sd * 5, 3, 10); col.castShadow = true; g.add(col); const ball = new THREE.Mesh(new THREE.SphereGeometry(0.75, 14, 10), C[0]); ball.position.set(sd * 5, 6.5, 10); g.add(ball); p.addCircle(sd * 5, 10, 0.7); }
      pb(10.6, 1.3, 0.5, 0, 6.1, 10, dark);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 1.1), new THREE.MeshBasicMaterial({ map: E.textTex('FUNFAIR', { w: 1024, h: 120, color: '#ffe9a8', glow: '#ffb03a', font: '700 84px "Hind",sans-serif' }), transparent: true }));
      sign.position.set(0, 6.1, 10.27); g.add(sign); const sign2 = sign.clone(); sign2.rotation.y = Math.PI; sign2.position.z = 9.73; g.add(sign2);

      // the carousel
      const CZ = -9, car = new THREE.Group(); car.position.set(0, 0, CZ); g.add(car);
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
      const WZ = -28, WY = 13.2, WR = 11, wheel = new THREE.Group(); wheel.position.set(0, WY, WZ); g.add(wheel);
      for (const sd of [-1, 1]) for (const lx of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, WY / Math.cos(0.32) + 0.4, 0.5), steel); leg.position.set(lx * WY * Math.tan(0.32) / 2, WY / 2, WZ + sd * 1.4); leg.rotation.z = -lx * 0.32; leg.castShadow = true; g.add(leg); p.addCircle(lx * WY * Math.tan(0.32), WZ + sd * 1.4, 0.5); }
      pb(0.5, 0.5, 3.4, 0, WY, WZ, dark);
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
      const DX = 16, DZ = -38, DH = 24;
      const mast = new THREE.Mesh(new THREE.BoxGeometry(1.1, DH, 1.1), E.mat('#ffffff', { map: stripes('#eeece6', '#3fa7d6', 2), rough: 0.5 })); mast.position.set(DX, DH / 2, DZ); mast.castShadow = true; g.add(mast);
      pb(2.4, 1.2, 2.4, DX, DH + 0.6, DZ, C[3]);
      const ring = new THREE.Group(); ring.position.set(DX, 2, DZ); g.add(ring);
      const seat = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.8, 16, 1, true), C[0]); seat.material.side = THREE.DoubleSide; ring.add(seat);
      const seatF = new THREE.Mesh(new THREE.RingGeometry(0.7, 2.3, 16), dark); seatF.rotation.x = -Math.PI / 2; seatF.position.y = -0.4; ring.add(seatF);
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, fig = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.9, 8), white); fig.position.set(Math.cos(a) * 1.9, 0.2, Math.sin(a) * 1.9); ring.add(fig); const hd = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), white); hd.position.set(Math.cos(a) * 1.9, 0.82, Math.sin(a) * 1.9); ring.add(hd); }
      p.addCircle(DX, DZ, 2.5);

      // THE COASTER, across the west side of the park: a station by the gate, a chain lift up the far side, a big drop,
      // a vertical loop, an airtime hill and a run back past the carousel. A five-car train with riders; it crawls up the
      // lift, then runs on what the drop gave it.
      const CPTS = [[-12, 1.8, 6], [-20, 1.8, 6], [-27, 1.9, 5.5], [-33, 2.6, 3], [-38, 4.2, -2], [-40, 8, -10], [-40, 13, -18], [-39.5, 18, -25], [-37.5, 20.5, -30],
        [-33, 15, -34], [-28, 5, -36], [-23, 2.6, -34.5], [-17.5, 4.2, -33], [-15, 9, -32], [-17, 13.8, -31], [-21, 15.5, -30], [-25, 13.5, -29.2], [-26.5, 9, -28.4], [-24, 4.5, -27.6], [-19, 2.8, -26.8],
        [-13.5, 4.5, -24], [-11.5, 9.5, -19], [-11, 6, -12], [-11.5, 10, -4], [-10, 5, 2.5], [-8.5, 2.4, 6]].map(([x, y, z]) => new THREE.Vector3(x, y, z));
      const coaster = new THREE.CatmullRomCurve3(CPTS, true, 'centripetal'), NS = 600, CL = coaster.getLength();
      // frames by parallel transport, so the track banks through the loop instead of flipping
      const cP = coaster.getSpacedPoints(NS), cT = [], cN = [], cB = [];
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
      // supports: white columns under the track, every few metres where it runs the right way up
      for (let i = 0; i < NS; i += 9) { const v = cP[i]; if (v.y < 2.2 || cN[i].y < 0.3) continue; const h = v.y - 0.55, col = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, h, 8), white); col.position.set(v.x, h / 2, v.z); col.castShadow = true; g.add(col); p.addCircle(v.x, v.z, 0.3); }
      // the loop stands on two A-frames either side
      for (const sd of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 16, 0.3), white); leg.position.set(-21, 8, -30 + sd * 1.9); leg.rotation.x = sd * 0.12; g.add(leg); p.addCircle(-21, -30 + sd * 2.6, 0.4); }
      // the station: a platform and a striped canopy over the start
      pb(13, 1.2, 3, -18.5, 0.6, 8.6, E.mat('#a8a49c', { rough: 0.9 })); pb(14, 0.2, 7, -18.5, 4.6, 6.4, E.mat('#ffffff', { map: stripes('#eeece6', '#d24a3a', 14) }));
      for (const x of [-25, -12]) for (const z of [3.2, 9.6]) pb(0.18, 4.4, 0.18, x, 2.3, z, steelM);
      const loopSign = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.9), new THREE.MeshBasicMaterial({ map: E.textTex('THE LOOP', { w: 512, h: 96, color: '#fff2c8', glow: '#ff9a3a', font: '700 70px "Hind",sans-serif' }), transparent: true }));
      loopSign.position.set(-18.5, 5.3, 9.95); g.add(loopSign);
      p.addBox(-18.5, 8.6, 6.5, 1.5);
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
      const SWX = 14, SWZ = -20, swing = new THREE.Group(); swing.position.set(SWX, 7.2, SWZ); g.add(swing);
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
      const TCX = 11, TCZ = -4, cups = new THREE.Group(); cups.position.set(TCX, 0.25, TCZ); g.add(cups);
      { const deck = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.3, 32), E.mat('#ffffff', { map: stripes('#eeece6', '#6cc070', 16) })); deck.position.set(TCX, 0.15, TCZ); g.add(deck); p.addCircle(TCX, TCZ, 4.7); }
      const cupL = [];
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, cp = new THREE.Group(); cp.position.set(Math.cos(a) * 2.8, 0.2, Math.sin(a) * 2.8); cups.add(cp);
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.6, 0.9, 18, 1, true), C[i % C.length]); cup.material = cup.material.clone(); cup.material.side = THREE.DoubleSide; cup.position.y = 0.45; cp.add(cup);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.06, 6, 18), white); rim.rotation.x = Math.PI / 2; rim.position.y = 0.9; cp.add(rim);
        const hd = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.06, 6, 12), white); hd.position.set(1.0, 0.55, 0); cp.add(hd);
        for (const sx of [-0.3, 0.3]) { const rd = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), skinM); rd.position.set(sx, 1.05, 0); cp.add(rd); }
        cupL.push(cp); }

      // the bumper cars: a roofed floor at the back, cars nudging about
      const BCX = 2, BCZ = -45, bump = [];
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
      const glowMat = (hex) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).convertSRGBToLinear() }); m.userData.lin = true; return m; };
      stall(-6.5, 1.5, Math.PI / 2, '#d24a3a', 'HOT DOGS'); stall(6.5, -1.5, -Math.PI / 2, '#3fa7d6', 'ICE CREAM'); stall(-6, -17, Math.PI / 2, '#e8b23a', 'CANDY FLOSS'); stall(7, -16, -Math.PI / 2, '#6cc070', 'LEMONADE');
      stall(-9, -38, 0, '#9b7bd8', 'GAMES'); stall(8, -36, 0, '#ef7a1a', 'PRIZES');
      // trees in round planters, benches and lamp posts along the walks
      for (const [x, z] of [[-4, 8], [4, 8], [-8, -12], [8, -11], [-9, -24], [9, -26], [-4, -40], [11, -42], [18, -12], [20, -28], [-30, 12], [-44, -12], [-44, -32], [-6, -50], [22, -45]]) {
        pb(1.4, 0.45, 1.4, x, 0.22, z, E.mat('#bdb6aa', { rough: 0.9 }));
        const tr = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 8), E.mat('#4f7a3c', { rough: 0.9, flat: true })); tr.position.set(x, 3.0, z); tr.scale.y = 1.2; tr.castShadow = true; g.add(tr);
        const tk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 2.2, 6), E.mat('#5a4030')); tk.position.set(x, 1.4, z); g.add(tk); p.addCircle(x, z, 0.8); }
      for (const [x, z, ry] of [[-3.2, -20, Math.PI / 2], [3.2, -20, -Math.PI / 2], [-3, 2, Math.PI / 2], [12, -30, 0], [-6, -44, 0]]) E.bench(g, x, z, ry);
      const lampG = new THREE.CylinderGeometry(0.06, 0.08, 4, 6), bulbM = glowMat('#ffe2a0');
      for (const [x, z] of [[-4.5, -6], [4.5, -6], [-4.5, -16], [4.5, -16], [-4, -33], [5, -33], [10, -10], [16, -28], [-9, 10], [-28, 10]]) { const l = new THREE.Mesh(lampG, dark); l.position.set(x, 2, z); g.add(l); const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), bulbM); b2.position.set(x, 4.1, z); g.add(b2); p.addCircle(x, z, 0.2); }

      // a balloon seller and a popcorn cart by the carousel
      { const bx = -7, bz = 2; const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 5), dark); pole.position.set(bx, 0.8, bz); g.add(pole);
        for (let i = 0; i < 9; i++) { const a = r() * 6.3, rr = 0.2 + r() * 0.5, h = 2.6 + r() * 0.9, bl = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), C[i % C.length]); bl.scale.y = 1.2; bl.position.set(bx + Math.cos(a) * rr, h, bz + Math.sin(a) * rr); g.add(bl); }
        pb(1.6, 1.0, 0.9, 7, 0.5, 1.5, E.mat('#ffffff', { map: stripes('#eeece6', '#d24a3a', 10) })); pb(1.3, 0.9, 0.7, 7, 1.5, 1.5, new THREE.MeshStandardMaterial({ color: '#fff4cc', transparent: true, opacity: 0.6 }));
        const umb = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.6, 12), E.mat('#ffffff', { map: stripes('#eeece6', '#e8b23a', 12) })); umb.position.set(7, 2.9, 1.5); g.add(umb); p.addBox(7, 1.5, 0.85, 0.5); }
      // string lights from the gate to the carousel
      { const sl = []; for (const sd of [-1, 1]) for (let i = 0; i <= 20; i++) { const t = i / 20, x = sd * (5 - t * 1.5), z = 10 - t * 13.5, y = 5.6 - Math.sin(t * Math.PI) * 1.2 - t * 1.0; sl.push(x, y, z); }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(sl, 3)); const pm = new THREE.PointsMaterial({ map: E.dot(), color: E.lin('#ffe2a0'), size: 0.5, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); pm.userData.lin = true; g.add(new THREE.Points(geo, pm)); }

      // Every ride has its way on and its way off: a green のりば (ENTRANCE) gate with a railed queue lane, and an orange
      // おりば (EXIT) gate, each on a little platform facing out from the ride. The rides you can board start you at the
      // entrance and set you down at the exit.
      const gateAt = {}, gateSign = {};
      const gate = (name, kind, x, z, ry) => {
        const G = new THREE.Group(); G.position.set(x, 0, z); G.rotation.y = ry; g.add(G);
        const c = Math.cos(ry), s2 = Math.sin(ry), toP = (lx, lz) => [x + lx * c + lz * s2, z - lx * s2 + lz * c];
        const add = (geo, m, px, py, pz) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.castShadow = true; G.add(o); return o; };
        const col = E.mat(kind === 'in' ? '#2f8a4a' : '#d2602a', { rough: 0.5 });
        add(new THREE.BoxGeometry(2.8, 0.15, 2.4), E.mat('#c9c2b0', { rough: 0.9 }), 0, 0.075, 0);
        for (const sx of [-1.25, 1.25]) { add(new THREE.BoxGeometry(0.14, 2.7, 0.14), col, sx, 1.35, 0.9); p.addCircle(...toP(sx, 0.9), 0.15); }
        add(new THREE.BoxGeometry(2.64, 0.55, 0.14), col, 0, 2.78, 0.9);
        const key = kind + name; if (!gateSign[kind]) gateSign[kind] = new THREE.MeshBasicMaterial({ map: E.textTex(kind === 'in' ? 'のりば  ENTRANCE' : 'おりば  EXIT', { w: 512, h: 96, color: '#f4f1e6', font: '700 56px "Hind","Noto Sans JP",sans-serif' }), transparent: true, side: THREE.DoubleSide });
        const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.45), gateSign[kind]); sg.position.set(0, 2.78, 0.98); G.add(sg);
        if (kind === 'in') {   // the queue lane: two rails out from the gate
          for (const sx of [-0.65, 0.65]) { add(new THREE.BoxGeometry(0.05, 0.05, 3.6), steelM, sx, 0.95, 2.9); for (let k = 0; k < 4; k++) add(new THREE.BoxGeometry(0.06, 0.95, 0.06), steelM, sx, 0.48, 1.2 + k * 1.15); for (let k = 0; k < 6; k++) p.addCircle(...toP(sx, 1.2 + k * 0.7), 0.12); }
        }
        gateAt[key] = toP(0, 0);
        return toP;
      };
      const out = (cx, cz, dx, dz, r0) => { const l = Math.hypot(dx, dz); return [cx + (dx / l) * r0, cz + (dz / l) * r0, Math.atan2(dx, dz)]; };
      const ridesG = {
        carousel: [out(0, CZ, -0.6, 0.8, 7.0), out(0, CZ, 0.6, 0.8, 7.0)],
        wheel: [[-2.8, WZ + 4.2, 0], [2.8, WZ + 4.2, 0]],
        teacups: [out(TCX, TCZ, -0.3, 1, 6.1), out(TCX, TCZ, 0.5, 1, 6.1)],
        swing: [out(SWX, SWZ, -0.45, 1, 8.2), out(SWX, SWZ, 0.15, 1, 8.2)],
        drop: [out(DX, DZ, -1, 0.4, 4.4), out(DX, DZ, 1, 0.4, 4.4)],
        bumper: [[BCX - 3.6, BCZ + 5.4, 0], [BCX + 3.6, BCZ + 5.4, 0]],
        coaster: [[-14, 12.4, 0], [-23, 12.4, 0]],
      };
      const queuePts = [];
      for (const [name, [a, b]] of Object.entries(ridesG)) { const toP = gate(name, 'in', ...a); gate(name, 'out', ...b); queuePts.push(toP(0, 1.7), toP(0, 2.8), toP(0, 3.9)); }
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
      PB.flush();

      p.grade = {
        top: '#8aa6c8', bottom: '#e8d8c0', fog: '#c9c4bc', near: 30, far: 170,
        sun: '#fff1d8', sunInt: 2.3, hemi: 0.6, sunDir: [0.55, 0.45, 0.3],
        tint: [1.0, 1, 1.0], expo: 0.9, sat: 0.62, stars: 0,
      };
      p.map = [{ t: 'rect', x: -9, z: -19, w: 76, h: 68, c: '#bdb6aa' }];
      p.face = Math.PI;
      p.vp = [0, -2.5];   // in front of the carousel
      p.pathEnd = 12;
      p.clearR = 12;
      p.blocks = (lx, lz) => lx > -47 && lx < 29 && lz > -53 && lz < 15;
      SW.parkRide = { wheel, gond, grade: p.grade, board: () => p.toWorld(gateAt.inwheel[0], gateAt.inwheel[1]), exit: () => p.toWorld(gateAt.outwheel[0], gateAt.outwheel[1]), wheelHold: { on: false, i: 0, stopped: false } };
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
      // the view rides an outside horse, looking ahead and out at the park going round
      p.shot = () => {
        const o = horses[1], th = car.rotation.y, at = (a, rad, y) => { const x = Math.cos(a) * rad, z = Math.sin(a) * rad; return [x * Math.cos(th) + z * Math.sin(th), y, CZ - x * Math.sin(th) + z * Math.cos(th)]; };
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
