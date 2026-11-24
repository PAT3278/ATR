// SoundWalk people: real low-poly men and women (Quaternius "Ultimate Modular Men/Women", CC0, via Poly Pizza) for the
// crowds, the neighbours and the people out and about. Loaded before game.js, which this file starts once they are in
// (or after a timeout without them: E.npc then falls back to the figures it builds itself).
//
// Light on bytes, many looks:
// - eight bodies share one skeleton (the same bone names), so the clips ship once: man1 carries the men's, woman1 the
//   women's, and every body plays them. tools/pack-people.mjs repacks the files (bytes for bone indices, weights and
//   normals, shorts for clip rotations): 1.5 MB for the lot.
// - each body comes as one mesh per material (shirt, skin, hair...). They are merged into one mesh whose colours are in
//   the vertices, so a person is one draw, and every person gets their own colours per part from the palettes below:
//   eight bodies make thousands of different people at no cost in bytes.
//
// SW.People (when .ready):
//   look(r, o)        an outfit: { m (body), c (colour per part), h (height in m), pose, t } (r: a 0..1 random source)
//   dress(L, mat)     one person to animate: { f (feet at the origin, front +z), up, head, arms[2], legs[2] (pivots:
//                     turn them like the hand-built figures' — arms hang down -y, x swings them forward/up, z outward
//                     on arms[0] when negative), torso: up, mixer, pose(name, t), play(name, t0, speed), look }
//   bake(L)           the same person in pose L.pose at time L.t as a plain geometry, colours in its vertices (for crowds)
//   clipNames         every clip there is
(function () {
  'use strict';
  const SW = (window.SW = window.SW || {});
  const BASE = SW.PEOPLE_BASE || 'models/people/';
  const BODIES = [
    { id: 'man1', sex: 'm', clips: true }, { id: 'man2', sex: 'm' }, { id: 'man3', sex: 'm' }, { id: 'suit', sex: 'm', formal: true },
    { id: 'woman1', sex: 'f', clips: true }, { id: 'woman2', sex: 'f' }, { id: 'woman3', sex: 'f' }, { id: 'woman4', sex: 'f' },
  ];
  // what each material is, by its name
  const PART = (n) => (/skin/i.test(n) ? 'skin' : /brow|hair/i.test(n) ? 'hair' : /eye/i.test(n) ? 'eye' : /pant/i.test(n) ? 'pants'
    : /shoe/i.test(n) ? 'shoe' : /sock/i.test(n) ? 'sock' : /^shirt$|dress/i.test(n) ? 'top' : /jacket/i.test(n) ? 'top2' : /shirt|tie|detail/i.test(n) ? 'layer' : 'keep');
  const C = {
    skin: ['#f1cfae', '#e1b18c', '#c8946a', '#a0704c', '#7a4e33', '#4e3222'],
    hair: ['#14100d', '#2b1d14', '#4a3222', '#7a5a3a', '#b8a080', '#8f8f8f', '#14100d', '#2b1d14'],
    top: ['#1e2024', '#2f3238', '#5b5f66', '#9aa0a6', '#d9d4c8', '#efece4', '#2f4a3a', '#5a6a3a', '#3a4a6a', '#20304a', '#6a2a26', '#8a5a3a', '#c8a24a', '#a8462e', '#4a3a5a', '#7a8a9a'],
    layer: ['#efece4', '#1e2024', '#c8312a', '#e8c43a', '#3a7ad8', '#9aa0a6', '#5aa46a', '#e88a3a', '#d8b8c8', '#8a6ad0'],
    pants: ['#1c1d22', '#2a2c33', '#4a4d55', '#33456e', '#6e83a6', '#c9bfa8', '#6b5a44', '#3d4a35', '#7a7468'],
    shoe: ['#f1efe9', '#1a1a1c', '#7a5a3a', '#b8b2a6', '#c8312a', '#3a5aa8', '#3a3a3a'],
    formal: ['#1a1b1f', '#23262d', '#2f3542', '#3b3a38', '#4a4d55'],
  };
  const P = (SW.People = { ready: false, bodies: [], clips: { m: {}, f: {} }, clipNames: [], C });

  const startGame = (() => { let go = false; return () => { if (go) return; go = true; const s = document.createElement('script'); s.src = 'src/game.js'; document.body.appendChild(s); }; })();
  if (!window.THREE || !THREE.GLTFLoader || !THREE.SkeletonUtils) { startGame(); return; }
  setTimeout(startGame, 15000);   // never hold the world back for long: without the people it still runs, with its own figures

  // A value out of an attribute as the number it stands for (this three.js hands out the raw bytes of a quantized one).
  const NORM = (a) => (a instanceof Int8Array ? 127 : a instanceof Uint8Array ? 255 : a instanceof Int16Array ? 32767 : a instanceof Uint16Array ? 65535 : 1);
  const val = (A, v, c) => { const arr = A.isInterleavedBufferAttribute ? A.data.array : A.array, x = A.isInterleavedBufferAttribute ? arr[v * A.data.stride + A.offset + c] : arr[v * A.itemSize + c]; return A.normalized ? Math.max(-1, x / NORM(arr)) : x; };

  // ---- turn a loaded body into a template: one mesh, a part index per vertex ----------------------------------------
  function template(gltf, B) {
    const root = gltf.scene, prims = [];
    root.traverse((o) => { if (o.isSkinnedMesh) prims.push(o); });
    root.updateMatrixWorld(true);
    const parts = [], base = [];   // part name per material slot, its own colour
    let nv = 0, ni = 0;
    for (const m of prims) { nv += m.geometry.attributes.position.count; ni += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count; }
    const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4), slot = new Uint8Array(nv), idx = new Uint32Array(ni);
    let v0 = 0, i0 = 0;
    prims.forEach((m, k) => {
      const g = m.geometry, n = g.attributes.position.count, A = g.attributes;
      parts.push(PART(m.material.name || '')); base.push(m.material.color.clone());
      for (let v = 0; v < n; v++) {
        for (let c = 0; c < 3; c++) { pos[(v0 + v) * 3 + c] = val(A.position, v, c); nrm[(v0 + v) * 3 + c] = val(A.normal, v, c); }
        for (let c = 0; c < 4; c++) { si[(v0 + v) * 4 + c] = val(A.skinIndex, v, c); sw[(v0 + v) * 4 + c] = val(A.skinWeight, v, c); }
        slot[v0 + v] = k;
      }
      if (g.index) for (let j = 0; j < g.index.count; j++) idx[i0 + j] = g.index.getX(j) + v0; else for (let j = 0; j < n; j++) idx[i0 + j] = j + v0;
      v0 += n; i0 += g.index ? g.index.count : n;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const first = prims[0], mesh = new THREE.SkinnedMesh(geo, first.material);
    mesh.name = 'body'; first.parent.add(mesh); mesh.bind(first.skeleton, first.bindMatrix);
    prims.forEach((m) => m.parent.remove(m));
    // height in the bind pose (arms out, so only feet to crown counts), and where the feet are
    let y0 = Infinity, y1 = -Infinity; const p = new THREE.Vector3();
    for (let v = 0; v < nv; v++) { p.fromArray(pos, v * 3).applyMatrix4(first.matrixWorld); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    return { ...B, root, geo, slot, parts, base, height: y1 - y0, foot: y0 };
  }

  // ---- outfits --------------------------------------------------------------------------------------------------------
  const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
  P.look = (r, o = {}) => {
    const bodies = P.bodies.filter((b) => !o.sex || b.sex === o.sex), b = o.m != null ? P.bodies[o.m] : pick(r, bodies), m = P.bodies.indexOf(b);
    const c = {}, top = b.formal ? pick(r, C.formal) : pick(r, C.top);
    c.skin = pick(r, C.skin); c.hair = r() < 0.12 ? '#8f8f8f' : pick(r, C.hair); c.top = top; c.top2 = r() < 0.5 ? pick(r, C.top) : top;
    c.layer = b.formal ? (r() < 0.7 ? '#efece4' : pick(r, C.layer)) : pick(r, C.layer); if (c.layer === c.top) c.layer = C.layer[(C.layer.indexOf(c.layer) + 3) % C.layer.length];
    c.pants = b.formal ? (r() < 0.6 ? top : pick(r, C.formal)) : pick(r, C.pants); c.shoe = b.formal ? (r() < 0.8 ? '#1a1a1c' : '#5a3a26') : pick(r, C.shoe); c.sock = r() < 0.6 ? '#efece4' : '#1e2024';
    return { m, c, h: (b.sex === 'm' ? 1.72 : 1.62) + (r() - 0.5) * 0.14, pose: o.pose || 'Idle', t: o.t != null ? o.t : r() };
  };
  const colorsFor = (T, L) => {
    const col = T.parts.map((part, k) => (L.c[part] ? new THREE.Color(L.c[part]).convertSRGBToLinear() : T.base[k]));
    const a = new Float32Array(T.slot.length * 3);
    for (let v = 0; v < T.slot.length; v++) { const c = col[T.slot[v]]; a[v * 3] = c.r; a[v * 3 + 1] = c.g; a[v * 3 + 2] = c.b; }
    return new THREE.BufferAttribute(a, 3);
  };
  const clipOf = (T, name) => P.clips[T.sex][name] || P.clips[T.sex === 'm' ? 'f' : 'm'][name] || P.clips[T.sex].Idle;

  // ---- one person, to animate ------------------------------------------------------------------------------------------
  function build(L, mat) {
    const T = P.bodies[L.m], inner = THREE.SkeletonUtils.clone(T.root), f = new THREE.Group();
    let mesh = null; inner.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
    const g = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'skinIndex', 'skinWeight']) g.setAttribute(k, T.geo.attributes[k]);
    g.setIndex(T.geo.index); g.setAttribute('color', colorsFor(T, L)); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 1.2);
    mesh.geometry = g; if (mat) mesh.material = mat; mesh.castShadow = true; mesh.frustumCulled = false;
    const k = L.h / T.height; inner.scale.setScalar(k); inner.position.y = -T.foot * k; f.add(inner);
    const mixer = new THREE.AnimationMixer(inner);
    let cur = null;
    const pose = (name, t) => { const a = mixer.clipAction(clipOf(T, name)); if (cur && cur !== a) cur.stop(); a.play(); a.paused = false; a.time = (t || 0) * a.getClip().duration; mixer.update(0); a.paused = true; cur = a; };
    const play = (name, t0, speed = 1) => { const a = mixer.clipAction(clipOf(T, name)); if (cur && cur !== a) cur.stop(); a.play(); a.paused = false; a.timeScale = speed; a.time = (t0 || 0) * a.getClip().duration; cur = a; };
    pose(L.pose, L.t);
    return { f, inner, mesh, mixer, pose, play, T };
  }
  // A turning handle between a bone and its parent: turn it about the body's own axes and the limb turns at its joint;
  // with no turn the bone sits exactly where its clip puts it, so clips and handles work together.
  function handle(B, f) {
    const Pb = B.parent; f.updateMatrixWorld(true);
    const q0 = Pb.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(f.getWorldQuaternion(new THREE.Quaternion()));
    const align = new THREE.Group(), piv = new THREE.Group(), fix = new THREE.Group();
    align.position.copy(B.position); align.quaternion.copy(q0);
    fix.quaternion.copy(q0).invert(); fix.position.copy(B.position).negate().applyQuaternion(fix.quaternion);
    Pb.add(align); align.add(piv); piv.add(fix); fix.add(B);
    return piv;
  }
  P.dress = (L, mat) => {
    const d = build(L, mat), bone = (n) => d.inner.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(n));
    const up = handle(bone('Abdomen'), d.f), head = handle(bone('Head'), d.f);
    const arms = [handle(bone('UpperArm.R'), d.f), handle(bone('UpperArm.L'), d.f)], legs = [handle(bone('UpperLeg.R'), d.f), handle(bone('UpperLeg.L'), d.f)];
    return { f: d.f, up, head, arms, legs, torso: up, mixer: d.mixer, pose: d.pose, play: d.play, look: L, mesh: d.mesh };
  };

  // ---- the same person as a plain posed geometry (skinned on the CPU once) ---------------------------------------------
  const baked = new Map();
  P.bake = (L) => {
    const key = JSON.stringify(L); if (baked.has(key)) return baked.get(key).clone();
    const d = build(L, null), mesh = d.mesh, T = d.T;
    d.f.updateMatrixWorld(true); mesh.skeleton.update();
    const bm = mesh.skeleton.boneMatrices, n = T.slot.length, A = T.geo.attributes, pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
    const M = new THREE.Matrix4(), B = new THREE.Matrix4(), toF = new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse), v = new THREE.Vector3(), nm = new THREE.Matrix3();
    for (let i = 0; i < n; i++) {
      M.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      for (let k = 0; k < 4; k++) {
        const w = A.skinWeight.array[i * 4 + k]; if (!w) continue;
        B.fromArray(bm, A.skinIndex.array[i * 4 + k] * 16); for (let e = 0; e < 16; e++) M.elements[e] += B.elements[e] * w;
      }
      M.premultiply(toF).multiply(mesh.bindMatrix);
      v.fromArray(A.position.array, i * 3).applyMatrix4(M).toArray(pos, i * 3);
      nm.getNormalMatrix(M); v.fromArray(A.normal.array, i * 3).applyMatrix3(nm).normalize().toArray(nrm, i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); g.setAttribute('color', colorsFor(T, L)); g.setIndex(T.geo.index);
    g.computeBoundingSphere(); g.computeBoundingBox();
    baked.set(key, g); return g.clone();
  };

  // ---- load ------------------------------------------------------------------------------------------------------------
  const loader = new THREE.GLTFLoader();
  Promise.all(BODIES.map((B) => new Promise((ok, no) => loader.load(BASE + B.id + '.glb', (g) => ok([B, g]), undefined, no))))
    .then((list) => {
      for (const [B, g] of list) {
        P.bodies.push(template(g, B));
        if (B.clips) for (const c of g.animations) { const n = c.name.split('|').pop().replace(/^(Man|Female)_/, ''); P.clips[B.sex][n] = c; }
      }
      P.clipNames = [...new Set([...Object.keys(P.clips.m), ...Object.keys(P.clips.f)])];
      P.ready = true;
    })
    .catch((e) => { if (typeof console !== 'undefined') console.warn('SW.People: no people models', e); })
    .then(startGame);
})();
