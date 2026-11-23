/*
 * SOUND WALK — the game: renderer, world, avatar, controls, proximity audio, scenic views.
 * Controls follow Closet Quest: WASD/arrows move relative to the camera, drag or Q/E turns
 * the view, click walks there, Z/Enter/Space interacts, touch gets a stick and an A button.
 */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  if (!window.THREE) { $('#loading').innerHTML = '<span>3Dエンジンを読み込めませんでした。ページを再読み込みしてください。</span>'; return; }
  const SW = window.SW, CFG = SW.CONFIG;
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const IC = {
    cart: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.5 11h10L20 7H6.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/></svg>',
    play: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8V4z"/></svg>',
    pause: '<svg class="ic i-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z"/></svg>',
    check: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5"/></svg>',
  };
  const TOUCH = matchMedia('(hover: none)').matches;

  /* ================= utils ================= */
  function rng(seed) { return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const ease = (x) => x * x * (3 - 2 * x);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const yen = (n) => '¥' + Number(n).toLocaleString('ja-JP');
  const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
  const D = (a) => `rgba(0,0,0,${a})`, Lw = (a) => `rgba(255,255,255,${a})`;
  function speckle(g, W, H, r, n, a) { for (let i = 0; i < n; i++) { g.fillStyle = r() < 0.5 ? D(a) : Lw(a * 0.8); g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2); } }

  /* ================= textures & materials ================= */
  // Tileable value noise and fbm for painting natural-looking ground.
  const h2 = (x, y) => { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  function pnoise(x, y, per, seed) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const w = (a) => ((a % per) + per) % per, a = h2(w(xi) + seed, w(yi)), b = h2(w(xi + 1) + seed, w(yi)), c = h2(w(xi) + seed, w(yi + 1)), d = h2(w(xi + 1) + seed, w(yi + 1));
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, per, seed, oct = 5) { let s = 0, a = 0.5, t = 0; for (let i = 0; i < oct; i++) { s += a * pnoise(x * per, y * per, per, seed + i * 131); t += a; a *= 0.5; per *= 2; } return s / t; }
  const sst = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function paintGround(g, S, cols, o) {
    const img = g.createImageData(S, S), d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const a = fbm(u, v, 3, 11), b = fbm(u, v, 5, 47), c = fbm(u, v, 4, 93), fine = fbm(u, v, 48, 7, 3);
      let k1 = sst(0.35, 0.65, a), k2 = sst(o.dry[0], o.dry[1], b), k3 = sst(o.dirt[0], o.dirt[1], c);
      const sh = 0.72 + 0.56 * fine;
      const i = (y * S + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        let col = cols[0][ch] + (cols[1][ch] - cols[0][ch]) * k1;
        col += (cols[2][ch] - col) * k2;
        col += (cols[3][ch] - col) * k3;
        d[i + ch] = Math.max(0, Math.min(255, col * sh));
      }
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const TEXSIZE = { grass: 512, path: 256, slate: 512, trail: 256, camo: 256 };
  const TEXDRAW = {
    grass(g, S, r) {
      paintGround(g, S, ['#353f27', '#56603a', '#857a4f', '#57483a'].map(rgb), { dry: [0.5, 0.72], dirt: [0.6, 0.72] });
      // blades, fallen needles and leaves, a few stones
      for (let i = 0; i < 5200; i++) { const x = r() * S, y = r() * S, l = 3 + r() * 6, a = -1.57 + (r() - 0.5) * 1.3; g.strokeStyle = ['rgba(120,128,78,.5)', 'rgba(38,46,28,.55)', 'rgba(150,140,90,.4)', 'rgba(70,84,48,.5)'][i % 4]; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
      for (let i = 0; i < 120; i++) { g.fillStyle = ['rgba(96,70,44,.75)', 'rgba(130,96,52,.7)', 'rgba(70,56,40,.75)'][i % 3]; g.beginPath(); g.ellipse(r() * S, r() * S, 2 + r() * 3, 1 + r() * 1.6, r() * 3, 0, 7); g.fill(); }
      for (let i = 0; i < 26; i++) { const x = r() * S, y = r() * S, q = 1.5 + r() * 3.5; g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(x + 1, y + 1.5, q, q * 0.8, 0, 0, 7); g.fill(); g.fillStyle = `rgb(${120 + r() * 40},${116 + r() * 36},${104 + r() * 30})`; g.beginPath(); g.ellipse(x, y, q, q * 0.8, r() * 3, 0, 7); g.fill(); }
    },
    paving(g, S, r) { g.fillStyle = '#cfc2a4'; g.fillRect(0, 0, S, S); const n = 4, w = S / n; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { g.fillStyle = `rgba(${150 + r() * 40},${135 + r() * 35},${110 + r() * 30},.35)`; g.fillRect(x * w + 2, y * w + 2, w - 4, w - 4); } g.fillStyle = D(0.25); for (let k = 0; k <= n; k++) { g.fillRect(k * w - 1, 0, 2, S); g.fillRect(0, k * w - 1, S, 2); } speckle(g, S, S, r, 1200, 0.06); },
    trail(g, S, r) { // a footpath: dark packed earth with a paler trodden line down the middle, gravel, and grass creeping in at the edges
      paintGround(g, S, ['#3f3124', '#57432f', '#66523c', '#2f251b'].map(rgb), { dry: [0.45, 0.75], dirt: [0.6, 0.78] });
      const img = g.getImageData(0, 0, S, S), d = img.data;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S, edge = 1 - Math.abs(2 * u - 1), n = fbm(u, v, 5, 31) - 0.5, i = (y * S + x) * 4;
        const tread = sst(0.62, 0.9, edge + n * 0.5) * 0.55;                                 // paler where feet land most
        d[i] += (150 - d[i]) * tread; d[i + 1] += (128 - d[i + 1]) * tread; d[i + 2] += (98 - d[i + 2]) * tread;
        const core = sst(0.2, 0.36, edge + n * 0.3);                                         // solid path
        const fray = sst(0.04, 0.24, edge + n * 0.6) * (0.3 + 0.7 * sst(0.4, 0.6, fbm(u, v, 12, 57)));   // broken edge
        d[i + 3] = Math.round(255 * Math.min(1, Math.max(core, fray * 0.8)));
      }
      g.putImageData(img, 0, 0);
      for (let i = 0; i < 170; i++) { const x = S * (0.16 + r() * 0.68), y = r() * S, q = 0.8 + r() * 2.6; g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(x + 1, y + 1, q, q * 0.8, 0, 0, 7); g.fill(); g.fillStyle = `rgb(${140 + r() * 55},${132 + r() * 50},${116 + r() * 44})`; g.beginPath(); g.ellipse(x, y, q, q * 0.8, r() * 3, 0, 7); g.fill(); }
      for (let i = 0; i < 240; i++) { const x = S * (r() < 0.5 ? 0.12 + r() * 0.1 : 0.78 + r() * 0.1), y = r() * S, l = 3 + r() * 6, a = -1.57 + (r() - 0.5) * 1.2; g.strokeStyle = ['rgba(70,82,44,.85)', 'rgba(96,104,60,.8)', 'rgba(48,58,34,.85)'][i % 3]; g.lineWidth = 1.3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    },
    slate(g, S, r) { // pale rectangular pavers in running bond: old, cracked, chipped and stained
      g.fillStyle = '#34322c'; g.fillRect(0, 0, S, S);
      const cols = 4, rows = 8, bw = S / cols, bh = S / rows;
      const bricks = [];
      for (let y = 0; y < rows; y++) for (let x = -1; x < cols; x++) {
        const ox = x * bw + (y % 2 ? bw / 2 : 0), oy = y * bh;
        const k = r(), v = k < 0.12 ? 96 + r() * 30 : k < 0.3 ? 132 + r() * 26 : 160 + r() * 48;   // a few dark, replaced or soaked bricks
        const warm = k > 0.85 ? 16 : r() * 8, j = 1.5 + r() * 2.2, sink = r() < 0.1;
        for (const dx of [0, S]) {
          g.save(); g.translate(dx + ox, oy);
          const gr = g.createLinearGradient(0, 0, bw, bh);
          gr.addColorStop(0, `rgb(${v + 10 + warm},${v + 8},${v + 2 - warm})`); gr.addColorStop(1, `rgb(${v - 14 + warm},${v - 16},${v - 22 - warm})`);
          g.fillStyle = gr;
          // uneven outline: each corner pulled in a little, some corners broken off
          const c = [0, 1, 2, 3].map(() => (r() < 0.22 ? 5 + r() * 12 : r() * 2.5));
          g.beginPath(); g.moveTo(j + c[0], j); g.lineTo(bw - j - c[1], j); g.lineTo(bw - j, j + c[1]); g.lineTo(bw - j, bh - j - c[2]); g.lineTo(bw - j - c[2], bh - j); g.lineTo(j + c[3], bh - j); g.lineTo(j, bh - j - c[3]); g.lineTo(j, j + c[0]); g.closePath(); g.fill();
          if (sink) { g.fillStyle = 'rgba(0,0,0,.28)'; g.fill(); }
          // worn, darker edges
          g.strokeStyle = 'rgba(40,36,30,.35)'; g.lineWidth = 3; g.stroke();
          g.restore();
        }
        bricks.push([ox, oy]);
      }
      // cracks: jagged lines across one or two bricks, some splitting a brick in half
      const crack = (x, y, a, len, w) => { g.beginPath(); g.moveTo(x, y); for (let d = 0; d < len; d += 5 + r() * 6) { a += (r() - 0.5) * 0.9; x += Math.cos(a) * 7; y += Math.sin(a) * 7; g.lineTo(x, y); if (r() < 0.12) crack(x, y, a + (r() < 0.5 ? 0.9 : -0.9), len * 0.3, w * 0.6); } g.strokeStyle = 'rgba(22,20,17,.85)'; g.lineWidth = w; g.stroke(); g.strokeStyle = 'rgba(235,230,215,.18)'; g.lineWidth = 0.7; g.stroke(); };
      for (let i = 0; i < 26; i++) { const x = S * (0.08 + r() * 0.84), y = S * (0.08 + r() * 0.84); crack(x, y, r() * 6.28, 30 + r() * 80, 0.8 + r() * 1.4); }
      // pitting and small chips
      for (let i = 0; i < 420; i++) { g.fillStyle = `rgba(30,27,22,${0.25 + r() * 0.4})`; g.beginPath(); g.ellipse(r() * S, r() * S, 0.6 + r() * 2.2, 0.5 + r() * 1.6, r() * 3, 0, 7); g.fill(); }
      // grime, damp stains, moss creeping out of the joints
      const img = g.getImageData(0, 0, S, S), d = img.data;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S, i = (y * S + x) * 4;
        const stain = fbm(u, v, 3, 21), fine = fbm(u, v, 40, 5, 2), moss = fbm(u, v, 6, 77);
        let k = 0.55 + 0.62 * stain + 0.2 * (fine - 0.5);
        k *= 1 - 0.45 * sst(0.6, 0.75, fbm(u, v, 5, 140));           // dark damp patches
        d[i] *= k; d[i + 1] *= k; d[i + 2] *= k * 0.97;
        const lum = d[i + 1], m = sst(0.56, 0.7, moss) * (lum < 90 ? 0.75 : 0.22);   // moss favours joints and dark bricks
        d[i] += (58 - d[i]) * m; d[i + 1] += (74 - d[i + 1]) * m; d[i + 2] += (40 - d[i + 2]) * m;
      }
      g.putImageData(img, 0, 0);
    },
    sand(g, S, r) { g.fillStyle = '#d6c08c'; g.fillRect(0, 0, S, S); speckle(g, S, S, r, 3000, 0.08); },
    path(g, S, r) {
      paintGround(g, S, ['#4f4233', '#6e5d47', '#857560', '#3d342a'].map(rgb), { dry: [0.5, 0.75], dirt: [0.58, 0.72] });
      for (let i = 0; i < 90; i++) { const x = r() * S, y = r() * S, q = 1 + r() * 3; g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(x + 1, y + 1, q, q * 0.8, 0, 0, 7); g.fill(); g.fillStyle = `rgb(${125 + r() * 45},${118 + r() * 40},${104 + r() * 34})`; g.beginPath(); g.ellipse(x, y, q, q * 0.8, r() * 3, 0, 7); g.fill(); }
    },
    asphalt(g, S, r) { g.fillStyle = '#2b2831'; g.fillRect(0, 0, S, S); speckle(g, S, S, r, 3000, 0.07); g.strokeStyle = D(0.4); for (let i = 0; i < 4; i++) { g.beginPath(); let x = r() * S, y = r() * S; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); } },
    // Clothes. Both are painted in greys and tinted by the material colour, so one tile gives every colourway:
    // camo in four tones (tonal camo, the expensive streetwear kind), denim with a diagonal twill and worn fades.
    camo(g, S) {
      const img = g.createImageData(S, S), d = img.data;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S, i = (y * S + x) * 4;
        const k = fbm(u, v, 3, 501, 3) > 0.53 ? (fbm(u, v, 4, 733, 3) > 0.56 ? 3 : 1) : fbm(u, v, 3, 911, 3) > 0.58 ? 2 : 0;   // blobs over blobs, each tone its own noise
        d[i] = d[i + 1] = d[i + 2] = [235, 168, 104, 52][k]; d[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    },
    denim(g, S, r) {
      g.fillStyle = '#d4d4d4'; g.fillRect(0, 0, S, S);
      for (let i = -S; i < S; i += 2) { g.strokeStyle = i % 4 ? 'rgba(0,0,0,.16)' : 'rgba(255,255,255,.12)'; g.lineWidth = 1; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + S, S); g.stroke(); }   // twill
      for (let i = 0; i < 26; i++) { const x = r() * S, w = 2 + r() * 7; g.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.07})`; g.fillRect(x, 0, w, S); }   // fades down the leg
      speckle(g, S, S, r, 900, 0.06);
    },
    checker(g, S) { const h = S / 2; g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, S, S); g.fillStyle = '#bdbdbd'; g.fillRect(0, 0, h, h); g.fillRect(h, h, h, h); },
    windows(g, S, r) { g.fillStyle = '#000'; g.fillRect(0, 0, S, S); const n = 4, w = S / n; const cols = ['#ffd27a', '#ffe9b8', '#9ff3ff', '#ff8ad8', '#ffd27a']; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { if (r() < 0.45) continue; g.fillStyle = cols[Math.floor(r() * cols.length)]; g.globalAlpha = 0.5 + r() * 0.5; g.fillRect(x * w + w * 0.2, y * w + w * 0.25, w * 0.6, w * 0.45); } g.globalAlpha = 1; },
  };
  const texBase = {}, texCache = {}, texLoader = new THREE.TextureLoader();
  const PHOTO = { grass: 1.5, slate: 1, asphalt: 1, paving: 1, sand: 1, concrete: 1, brick: 1, bark: 1, rock: 1 };   // kind -> how many times finer than the old drawn tile
  function tex(kind, rx = 1, ry = 1) {
    const key = `${kind}:${rx}:${ry}`;
    if (texCache[key]) return texCache[key];
    if (PHOTO[kind]) {   // photographed surfaces (CC0, Poly Haven): colour plus a normal map riding along as .nrm
      const k = PHOTO[kind], mk = (suf, srgb) => { const t = texLoader.load(`tex/${kind}_${suf}.jpg`); if (srgb) t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx * k, ry * k); return t; };
      const t = mk('d', true); t.nrm = mk('n', false);
      return (texCache[key] = t);
    }
    if (!texBase[kind]) { const c = document.createElement('canvas'), sz = TEXSIZE[kind] || 128; c.width = c.height = sz; TEXDRAW[kind](c.getContext('2d'), sz, rng(kind.length * 977)); texBase[kind] = c; }
    const t = new THREE.CanvasTexture(texBase[kind]);
    t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
    return (texCache[key] = t);
  }
  // Soft fresnel rim on every surface, tinted by the sky: the mid-2000s console look.
  const rimU = { value: new THREE.Color(0, 0, 0) };
  function rimPatch(sh) {
    sh.uniforms.rimC = rimU;
    sh.fragmentShader = 'uniform vec3 rimC;\n' + sh.fragmentShader.replace('#include <tonemapping_fragment>', 'gl_FragColor.rgb += rimC * pow(1. - clamp(dot(normalize(normal), normalize(vViewPosition)), 0., 1.), 3.);\n#include <tonemapping_fragment>');
  }
  const matCache = {};
  function mat(hex, o = {}, unique) {
    const key = hex + JSON.stringify(o, (k, v) => (v && v.isTexture ? v.uuid : v));
    if (!unique && matCache[key]) return matCache[key];
    const m = new THREE.MeshStandardMaterial({ color: hex, roughness: o.rough ?? 0.85, metalness: o.metal ?? 0, flatShading: !!o.flat, map: o.map || null, emissiveMap: o.emissiveMap || null, emissive: o.emissive || '#000000', emissiveIntensity: o.emissiveIntensity ?? 1 });
    m.color.convertSRGBToLinear(); m.emissive.convertSRGBToLinear(); m.userData.lin = true;
    if (o.map && o.map.nrm) { m.normalMap = o.map.nrm; m.normalScale.set(o.bump ?? 1, o.bump ?? 1); }
    m.onBeforeCompile = rimPatch;
    if (!unique) matCache[key] = m;
    return m;
  }
  function plane(w, h, m) { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.rotation.x = -Math.PI / 2; p.receiveShadow = true; return p; }
  function textTex(text, o = {}) {
    const c = document.createElement('canvas'); c.width = o.w || 512; c.height = o.h || 128;
    const g = c.getContext('2d');
    g.font = o.font || '700 64px "Hind","Noto Sans JP",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const lines = String(text).split('\n');
    const lh = c.height / (lines.length + 0.4);
    lines.forEach((ln, i) => {
      const y = c.height / 2 + (i - (lines.length - 1) / 2) * lh;
      if (o.bg) { const w = g.measureText(ln).width + 40; g.fillStyle = o.bg; g.fillRect(c.width / 2 - w / 2, y - lh * 0.42, w, lh * 0.84); }
      if (o.glow) { g.shadowColor = o.glow; g.shadowBlur = 24; }
      g.fillStyle = i === 0 ? (o.color || '#fff') : (o.color2 || o.color || '#fff');
      if (i > 0 && o.font2) g.font = o.font2;
      g.fillText(ln, c.width / 2, y);
      g.shadowBlur = 0;
    });
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    return t;
  }
  function bench(group, x, z, rotY, y = 0) {
    const b = new THREE.Group(), wood = mat('#8a5a35'), iron = mat('#2a2a30', { metal: 0.5, rough: 0.5 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 0.55), wood); seat.position.y = 0.48;
    const back = new THREE.Mesh(new THREE.BoxGeometry(2, 0.42, 0.08), wood); back.position.set(0, 0.85, -0.26); back.rotation.x = -0.12;
    b.add(seat, back);
    for (const sx of [-0.85, 0.85]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.48, 0.5), iron); leg.position.set(sx, 0.24, 0); b.add(leg); }
    b.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    b.position.set(x, y, z); b.rotation.y = rotY;
    group.add(b);
    return b;
  }

  /* ================= renderer & post (console-resolution look, as in Closet Quest) ================= */
  const cv = $('#cv');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: false, powerPreference: 'high-performance' }); }
  catch (e) { $('#loading').innerHTML = '<span>このブラウザではWebGLが使えないため表示できません。</span>'; return; }
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 900);
  const HDR = renderer.capabilities.isWebGL2 && !!(renderer.extensions.get('EXT_color_buffer_float') || renderer.extensions.get('EXT_color_buffer_half_float'));
  const RT_H = 720;
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: HDR ? THREE.HalfFloatType : THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const post = new THREE.ShaderMaterial({
    uniforms: { tD: { value: rt.texture }, res: { value: new THREE.Vector2(1, 1) }, time: { value: 0 }, bloom: { value: 1.0 }, grain: { value: 0 }, vig: { value: 0.22 }, thr: { value: HDR ? 1.0 : 0.85 }, tint: { value: new THREE.Vector3(1, 1, 1) }, expo: { value: 1 }, sat: { value: 1 }, spd: { value: 0 }, sunUv: { value: new THREE.Vector2(0.5, 0.5) }, flare: { value: 0 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: `uniform sampler2D tD;uniform vec2 res;uniform float time,bloom,grain,vig,expo,thr,sat,spd,flare;uniform vec2 sunUv;uniform vec3 tint;varying vec2 vUv;
    vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
    void main(){vec2 q0=vUv-.5;vec3 c=vec3(0.);float rb=spd*.014*smoothstep(.05,.6,length(q0));
      if(spd>.001){for(int i=0;i<6;i++){c+=texture2D(tD,vUv-q0*rb*float(i)).rgb;}c/=6.;}else c=texture2D(tD,vUv).rgb;
      float an=atan(q0.y,q0.x);float ln=step(.975,fract(sin(floor(an*46.)*12.9898+floor(time*18.)*7.7)*43758.5453))*smoothstep(.28,.62,length(q0))*spd;c+=ln*.35;
      vec3 b=vec3(0.),sf=vec3(0.);vec2 px=1./res;
      for(int i=0;i<12;i++){float a=float(i)*.5236;vec2 d=vec2(cos(a),sin(a))*px;
        b+=max(texture2D(tD,vUv+d*3.).rgb-thr,0.)*.5+max(texture2D(tD,vUv+d*8.).rgb-thr,0.)*.35+max(texture2D(tD,vUv+d*15.).rgb-thr,0.)*.25+max(texture2D(tD,vUv+d*32.).rgb-thr,0.)*.22;sf+=texture2D(tD,vUv+d*7.).rgb;}
      sf/=12.;c=mix(c,sf,.1)+sf*.03;c+=b/12.*bloom;
      if(flare>.001){float asp=res.x/res.y;vec2 sv=vUv-sunUv;sv.x*=asp;float dd=length(sv);
        vec3 fl=vec3(1.,.96,.88)*(.1/(dd*12.+.22))+vec3(1.,.92,.75)*pow(max(1.-dd*1.7,0.),6.)*.55;
        fl+=vec3(.55,.85,1.)*exp(-abs(sv.y)*70.)*exp(-abs(sv.x)*2.2)*.4;
        vec2 ax=vec2(.5)-sunUv;for(int i=1;i<=4;i++){float fi=float(i);vec2 gv=vUv-(sunUv+ax*(fi*.52+.3));gv.x*=asp;float gr=.03+.022*fi;float gl=length(gv);
          fl+=mix(vec3(.35,.9,1.),vec3(.6,1.,.6),fract(fi*.5))*(smoothstep(gr,gr*.82,gl)*.05+smoothstep(gr*.12,0.,abs(gl-gr))*.05);}
        c+=fl*flare;}
      c=aces(c*expo)*tint;
      float l=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(l),c,sat);
      c=pow(max(c,0.),vec3(1./2.2));c=mix(c,c*c*(3.-2.*c),.22);c=mix(c,c*vec3(.97,1.,1.03)+vec3(.03,.045,.065)*(1.-c),.55);
      vec2 q=vUv-.5;c*=1.-vig*smoothstep(.25,.85,length(q*vec2(1.1,1.)));
      float n=fract(sin(dot(floor(vUv*res)+fract(time)*91.7,vec2(12.9898,78.233)))*43758.5453);c+=(n-.5)*grain;
      gl_FragColor=vec4(c,1.);}`,
    depthTest: false, depthWrite: false,
  });
  const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
  function resize() {
    const w = cv.clientWidth || innerWidth, h = cv.clientHeight || innerHeight, dpr = TOUCH ? Math.min(devicePixelRatio || 1, Math.max(1, RT_H / h)) : Math.min(2, devicePixelRatio || 1);   // on phones the canvas need not exceed the 720-line scene
    renderer.setSize(Math.round(w * dpr), Math.round(h * dpr), false);
    camera.aspect = w / h; baseFov = w / h < 0.8 ? 68 : 55; camera.fov = baseFov; camera.updateProjectionMatrix();
    const ih = Math.min(RT_H, Math.round(h * dpr)), iw = Math.max(1, Math.round((ih * w) / h));
    rt.setSize(iw, ih); post.uniforms.res.value.set(iw, ih);
  }
  addEventListener('resize', resize);

  // A small painted sky used as the reflection on glossy things (glass, water, ceramic).
  const envTex = (() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#2a5eb4'); gr.addColorStop(0.28, '#6d9bd8'); gr.addColorStop(0.46, '#dce9f5'); gr.addColorStop(0.5, '#f2f6fa'); gr.addColorStop(0.51, '#a3abb2'); gr.addColorStop(0.65, '#838c93'); gr.addColorStop(1, '#4e565c');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
    const r = rng(77);
    for (let i = 0; i < 26; i++) { const x = r() * 512, y = 30 + r() * 80, w = 30 + r() * 60, cg = g.createRadialGradient(x, y, 0, x, y, w); cg.addColorStop(0, 'rgba(255,255,255,.9)'); cg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = cg; g.save(); g.translate(x, y); g.scale(1, 0.35); g.translate(-x, -y); g.fillRect(x - w, y - w, w * 2, w * 2); g.restore(); }
    const sg = g.createRadialGradient(150, 60, 0, 150, 60, 40); sg.addColorStop(0, '#ffffff'); sg.addColorStop(0.2, 'rgba(255,250,230,.95)'); sg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = sg; g.fillRect(100, 10, 100, 100);
    const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.encoding = THREE.sRGBEncoding;
    try { const pm = new THREE.PMREMGenerator(renderer), out = pm.fromEquirectangular(t).texture; pm.dispose(); t.dispose(); return out; } catch (e) { return null; }
  })();
  // The jeweller's light box, for gold, silver and ice: warm white overhead, softboxes round the sides, a dark floor. A metal
  // shows nothing but its reflection, and under the sky above every flat bit of gold that faced the grass came out lime.
  const studioTex = (() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#fff4e0'); gr.addColorStop(0.3, '#a8a19a'); gr.addColorStop(0.5, '#6a645e'); gr.addColorStop(0.62, '#3a3633'); gr.addColorStop(1, '#1c1b1a');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
    for (const [x, y, w, h] of [[40, 70, 70, 60], [200, 50, 40, 90], [300, 80, 90, 34], [430, 60, 46, 76], [130, 150, 120, 10], [380, 148, 90, 8]]) {   // softboxes, two strip lights low down
      const sg = g.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, Math.max(w, h) * 0.7); sg.addColorStop(0, '#ffffff'); sg.addColorStop(0.6, 'rgba(255,250,240,.9)'); sg.addColorStop(1, 'rgba(255,250,240,0)');
      g.fillStyle = sg; g.fillRect(x - w * 0.2, y - h * 0.2, w * 1.4, h * 1.4);
    }
    const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.encoding = THREE.sRGBEncoding;
    try { const pm = new THREE.PMREMGenerator(renderer), out = pm.fromEquirectangular(t).texture; pm.dispose(); t.dispose(); return out; } catch (e) { return null; }
  })();
  function gloss(hex, o = {}) {
    const m = new THREE.MeshStandardMaterial({ color: lin(hex), roughness: o.rough ?? 0.2, metalness: o.metal ?? 0.05, envMap: o.envMap || envTex, envMapIntensity: o.env ?? 0.7, map: o.map || null, transparent: o.opacity !== undefined, opacity: o.opacity ?? 1, depthWrite: o.opacity === undefined });
    m.userData.lin = true; m.onBeforeCompile = rimPatch;
    return m;
  }
  const whiteM = mat('#6d675c', { rough: 0.95 }, true); // weathered stone

  /* ================= scene ================= */
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, 30, 150);
  const skyU = { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, time: { value: 0 }, aur: { value: 0.1 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
    vertexShader: 'varying vec3 vD;void main(){vD=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform vec3 top,bottom,sunDir,sunCol;uniform float time,aur;varying vec3 vD;
    float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float ns(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y);}
    float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*ns(p);p=p*2.03+vec2(17.,9.);a*=.5;}return s;}
    void main(){vec3 d=normalize(vD);float h=d.y;vec3 c=mix(bottom,top,pow(clamp(h,0.,1.),.42));c=mix(c,bottom*1.12+vec3(.04),exp(-max(h,0.)*14.)*.65);c=mix(c,bottom*.55,clamp(-h*3.,0.,1.));
      float s=max(dot(d,normalize(sunDir)),0.);c+=sunCol*(smoothstep(.9994,.9997,s)*7.+pow(s,90.)*.9+pow(s,9.)*.32);
      if(h>.01){vec2 uv=d.xz/(h+.2)*1.3+vec2(time*.006,time*.002);float n=fbm(uv);float den=smoothstep(.3,.72,n)*smoothstep(.01,.22,h);
        float lit=smoothstep(.35,.85,fbm(uv+vec2(.07,.05)*1.)-n*.4+.5);vec3 cc=mix(mix(top,vec3(.75,.78,.86),.6)*.85,vec3(1.)*1.15+sunCol*.25*pow(s,3.),lit*.85+pow(s,5.)*.15);c=mix(c,cc,smoothstep(.46,.7,n)*smoothstep(.01,.2,h)*.95);}
      float az=atan(d.z,d.x),rb=0.;
      for(int i=0;i<3;i++){float fi=float(i);float y0=.3+.11*fi+.05*sin(az*2.+time*.12+fi*2.1)+.025*sin(az*5.-time*.09+fi);float w=exp(-pow((h-y0)/.03,2.));rb+=w*(.45+.55*sin(az*3.+time*.17+fi*1.7));}
      c+=mix(vec3(.35,1.,.75),vec3(.45,.8,1.),.5+.5*sin(az*2.+time*.05))*max(rb,0.)*aur;
      gl_FragColor=vec4(c,1.);}`,
  }));
  sky.renderOrder = -1;
  scene.add(sky);
  const starGeo = new THREE.BufferGeometry();
  { const r = rng(5), a = new Float32Array(1400 * 3); for (let i = 0; i < 1400; i++) { const u = r() * 0.9 + 0.08, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u); a.set([Math.cos(th) * s * 560, u * 560, Math.sin(th) * s * 560], i * 3); } starGeo.setAttribute('position', new THREE.BufferAttribute(a, 3)); }
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  starMat.userData.lin = true;
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);
  const planetM = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, fog: false, depthWrite: false });
  const ringM = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.28, fog: false, depthWrite: false, side: THREE.DoubleSide });
  planetM.userData.lin = ringM.userData.lin = true;
  const planet = new THREE.Group();
  { const b = new THREE.Mesh(new THREE.SphereGeometry(70, 32, 20), planetM), r1 = new THREE.Mesh(new THREE.RingGeometry(92, 128, 64), ringM), r2 = new THREE.Mesh(new THREE.RingGeometry(134, 142, 64), ringM);
    r1.rotation.x = r2.rotation.x = 1.25; r1.rotation.y = r2.rotation.y = 0.35; planet.add(b, r1, r2); }
  scene.add(planet); planet.visible = false;
  // Far silhouettes in the haze: a ridge line and thin megastructures with warning lights, tinted by the sky.
  const farM = new THREE.MeshBasicMaterial({ fog: false }), farM2 = new THREE.MeshBasicMaterial({ fog: false });
  farM.userData.lin = farM2.userData.lin = true;
  const farGroup = new THREE.Group();
  const farLights = new THREE.PointsMaterial({ color: new THREE.Color(1, 0.12, 0.08), size: 3, sizeAttenuation: false, fog: false, transparent: true, depthWrite: false });
  farLights.userData.lin = true;
  { const r = rng(808), bl = [];
    // Bryce's fractal mountains: a cone (so a place that clears them can still read its radius) pushed about by octaves
    // of noise, coloured by altitude and slope (rock strata, snow on the tops) and lit from the sun's side once
    const fh = (x, z, k) => { let v = 0, a = 1, f = 0.035; for (let o = 0; o < 5; o++) { v += a * Math.sin(x * f + k * 1.7 + Math.sin(z * f * 1.3 + o)) * Math.cos(z * f - k + Math.sin(x * f * 0.7 - o)); a *= 0.5; f *= 2.1; } return v; };
    for (let i = 0; i < 30; i++) { const a = (i / 30) * Math.PI * 2 + r() * 0.15, d = 300 + r() * 60, h = 45 + r() * 70, rad = 45 + r() * 45, geo = new THREE.ConeGeometry(rad, h, 48, 14), pa = geo.attributes.position, col = new Float32Array(pa.count * 3);
      for (let k = 0; k < pa.count; k++) { const x = pa.getX(k), y = pa.getY(k), z = pa.getZ(k), t = (y + h / 2) / h, rr = Math.hypot(x, z), n = fh(x, z, i) * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, t * 1.2))); const sc = 1 + n * 0.28; pa.setXYZ(k, x * sc, y + n * h * 0.12 * (1 - t * 0.3), z * sc); }
      geo.computeVertexNormals(); const nm = geo.attributes.normal, sd = new THREE.Vector3(0.45, 0.62, 0.35).normalize();
      for (let k = 0; k < pa.count; k++) { const y = pa.getY(k), t = (y + h / 2) / h, ny = nm.getY(k), lam = 0.45 + 0.75 * Math.max(0, nm.getX(k) * sd.x + ny * sd.y + nm.getZ(k) * sd.z), band = (y * 0.18 + fh(pa.getX(k), pa.getZ(k), i + 5) * 0.6) % 1;
        let c = band < 0.3 ? [0.56, 0.59, 0.65] : band < 0.55 ? [0.7, 0.73, 0.78] : band < 0.8 ? [0.49, 0.52, 0.58] : [0.8, 0.82, 0.86];
        if (t < 0.18) c = [0.52, 0.57, 0.55]; if (t > 0.72 - ny * 0.15) c = [1, 1, 1.04];
        col.set([c[0] * lam, c[1] * lam, c[2] * lam], k * 3); }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const m = new THREE.Mesh(geo, farM); m.position.set(Math.cos(a) * d, h / 2 - 3, Math.sin(a) * d); m.rotation.y = r() * 3; farGroup.add(m); }
    farM.vertexColors = true;
    for (let i = 0; i < 14; i++) { const a = r() * Math.PI * 2, d = 330 + r() * 90, h = 130 + r() * 190, w = 7 + r() * 9;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.2, w, h, 5), farM2); m.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d); farGroup.add(m);
      if (i % 2 === 0) { const ring = new THREE.Mesh(new THREE.TorusGeometry(w * 1.9, w * 0.12, 4, 24), farM2); ring.rotation.x = Math.PI / 2; ring.position.set(m.position.x, h * 0.72, m.position.z); farGroup.add(ring); }
      bl.push(m.position.x, h + 1.5, m.position.z, m.position.x, h * 0.72, m.position.z); }
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(bl, 3));
    farGroup.add(new THREE.Points(bg, farLights)); }
  scene.add(farGroup); farGroup.children.forEach((m) => { if (m.material !== farM) m.visible = false; });
  const hemi = new THREE.HemisphereLight(lin('#d2e2ff'), lin('#78808a'), 0.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 160 });
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  const pick = [];
  const circles = [], boxes = [], waters = [], rooms = [], lids = [];   // rooms: small buildings you can walk into (the camera stays under their roof); lids: the camera keeps above these
  function isWater(x, z) { for (const b of waters) { if (b.fn) { if (b.fn(x, z)) return true; continue; } const dx = x - b.x, dz = z - b.z, ux = dx * b.c - dz * b.s, uz = dx * b.s + dz * b.c; if (Math.abs(ux) < b.hx && Math.abs(uz) < b.hz) return true; } return false; }   // b.fn: water of any shape (the funfair's lagoon)
  const interact = [];

  const ground = plane(720, 720, mat('#ffffff', { map: tex('grass', 144, 144), rough: 1 }, true));
  if (!ground.material.normalMap) { ground.material.bumpMap = ground.material.map; ground.material.bumpScale = 0.035; }
  ground.material.onBeforeCompile = (sh) => { rimPatch(sh); sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', 'vec4 tA=mapTexelToLinear(texture2D(map,vUv));float lB=dot(mapTexelToLinear(texture2D(map,vUv*.173+.31)).rgb,vec3(4.));float lC=dot(mapTexelToLinear(texture2D(map,vUv*.031+.7)).rgb,vec3(4.));diffuseColor.rgb*=tA.rgb*mix(1.,lB,.45)*mix(1.,lC,.5);'); };
  { const gg = new THREE.PlaneGeometry(720, 720, 110, 110), gp = gg.attributes.position, col = new Float32Array(gp.count * 3);
    for (let i = 0; i < gp.count; i++) { const x = gp.getX(i), y = gp.getY(i); const v = 0.8 + 0.2 * Math.sin(x * 0.05 + Math.sin(y * 0.031) * 2.2) * Math.cos(y * 0.043 + x * 0.012); col.set([v * 0.93, v, v * 0.8], i * 3); }
    gg.setAttribute('color', new THREE.BufferAttribute(col, 3)); ground.geometry = gg; ground.material.vertexColors = true; }
  ground.userData.ground = true;
  scene.add(ground); pick.push(ground);

  /* ================= places ================= */
  let dotTex = null;
  function dot() {
    if (dotTex) return dotTex;
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    return (dotTex = new THREE.CanvasTexture(c));
  }
  // Static boxes: collected while a place is built, then drawn as one instanced mesh per material (one draw call instead of hundreds).
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  function batch(parent) {
    const recs = [];
    return {
      box(w, h, d, x, y, z, m, shadow = true) { const o = new THREE.Object3D(); o.position.set(x, y, z); o.scale.set(w, h, d); recs.push({ o, m, shadow }); return o; },   // callers may still set rotation / visible before flush()
      flush() {
        const groups = new Map();
        for (const r of recs) { if (!r.o.visible) continue; const k = r.m.uuid + (r.shadow ? 's' : 'n'); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
        for (const list of groups.values()) {
          const im = new THREE.InstancedMesh(unitBox, list[0].m, list.length);
          list.forEach((r, i) => { r.o.updateMatrix(); im.setMatrixAt(i, r.o.matrix); });
          im.castShadow = list[0].shadow; im.receiveShadow = true; im.frustumCulled = false;
          parent.add(im);
        }
        recs.length = 0;
      },
    };
  }
  const basic = (hex, o = {}) => { const m = new THREE.MeshBasicMaterial({ color: lin(hex), ...o }); m.userData.lin = true; return m; };
  const ring = SW.Ring.make(SW.SONGS);   // the expressway that loops the town (centre line only; its meshes are built once the places exist)
  // A lumpy boulder: a subdivided sphere pushed about by low-frequency noise and flattened a little, with box-projected UVs
  // for the rock photo. A handful of shapes are made once and shared.
  const rockGeos = [], stoneGeos = [];
  function rockGeo(seed, lo) {   // lo: a small stone of 80 faces instead of 1280, for scattering by the hundred
    const k = seed % 6, cache = lo ? stoneGeos : rockGeos; if (cache[k]) return cache[k];
    const g = new THREE.IcosahedronGeometry(1, lo ? 1 : 3), p = g.attributes.position, r = rng(300 + k), ph = [r() * 9, r() * 9, r() * 9], uv = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 1 + 0.22 * Math.sin(x * 2.3 + ph[0]) * Math.cos(z * 2.1 + ph[1]) + 0.12 * Math.sin(y * 3.7 + ph[2]) + 0.06 * Math.sin((x + z) * 6.1 + ph[0]);
      p.setXYZ(i, x * n, y * n * (y < 0 ? 0.55 : 0.85), z * n * (0.85 + 0.2 * Math.sin(ph[1])));
      const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
      uv.push(...(ay > ax && ay > az ? [x * 0.5 + 0.5, z * 0.5 + 0.5] : ax > az ? [z * 0.5 + 0.5, y * 0.5 + 0.5] : [x * 0.5 + 0.5, y * 0.5 + 0.5]));
    }
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
    return (cache[k] = g);
  }
  // ripples for every water surface: a tiling water normal map (three.js examples, MIT), sampled twice and scrolled
  const waterN = texLoader.load('tex/water_n.jpg'); waterN.wrapS = waterN.wrapT = THREE.RepeatWrapping;
  // a water shader's lighting, shared: two scrolling normal samples, a sun glint and a fresnel lift. Needs vW, t, nrm, sunD.
  const WATER_GLSL = 'vec3 wn1=texture2D(nrm,vW.xz*.05+vec2(t*.012,t*.008)).rgb*2.-1.;vec3 wn2=texture2D(nrm,vW.xz*.11-vec2(t*.01,-t*.014)).rgb*2.-1.;' +
    'vec3 wN=normalize(vec3((wn1.x+wn2.x)*.32,1.,(wn1.y+wn2.y)*.32));vec3 wV=normalize(cameraPosition-vW);' +
    'float wSp=pow(max(dot(reflect(-wV,wN),sunD),0.),70.);float wFr=pow(1.-max(dot(wN,wV),0.),4.);';

  /* ================= streetwear kit ================= */
  // The swag-era rap look (around 2009-14) that the player and the crowds wear: dreadlocks, braids and twists, flat-brim
  // fitteds, shutter shades, chunky gold chains with an iced piece, puffers, stacked skinny denim and loud high-tops.
  // A style, not anybody's likeness: no faces, tattoos or logos. Pieces are shared geometries, cached by their
  // measurements, in the frame of the bone they hang on (a head: centre at the origin, face towards +z).
  const kitCache = {}, kc = (key, f) => kitCache[key] || (kitCache[key] = f());
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const M4 = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V3(sx, sy, sz));
  function mergeGeos(list) {   // [[geometry, matrix?], ...] -> one indexed geometry: each shared vertex is stored and shaded once
    const gs = list.map(([g, m]) => { const n = g.clone(); if (m) n.applyMatrix4(m); return n; }), nv = gs.reduce((s, g) => s + g.attributes.position.count, 0);
    const out = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'uv', 'color'].filter((k) => gs.every((g) => g.attributes[k]))) {
      const sz = gs[0].attributes[k].itemSize, arr = new Float32Array(nv * sz); let o = 0;
      for (const g of gs) { const n = g.attributes[k].count * sz; arr.set(g.attributes[k].array.subarray(0, n), o); o += n; }
      out.setAttribute(k, new THREE.BufferAttribute(arr, sz));
    }
    const idx = new (nv > 65535 ? Uint32Array : Uint16Array)(gs.reduce((s, g) => s + (g.index ? g.index.count : g.attributes.position.count), 0)); let o = 0, base = 0;
    for (const g of gs) { const n = g.attributes.position.count; if (g.index) for (let i = 0; i < g.index.count; i++) idx[o++] = g.index.array[i] + base; else for (let i = 0; i < n; i++) idx[o++] = i + base; base += n; }   // a non-indexed part counts its vertices in order
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    gs.forEach((g) => g.dispose()); return out;
  }
  // Texture scale per part, in the geometry's own uvs: a tileable print (camo, denim) keeps one size from the chest to the
  // cuff, and a whole number of repeats round a body or a sleeve hides the seam that cylinders and lathes have at the front.
  const uvs = (g, su, sv) => { const a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * su, a.getY(i) * sv); return g; };
  // Gold, silver and ice: real metal in the jeweller's light box above. A little warm glow keeps gold gold-coloured even
  // where it can only reflect the dark floor.
  const jewel = (hex, o = {}) => { const m = gloss(hex, { rough: 0.16, metal: 1, env: 1.3, ...o, envMap: studioTex }); m.emissive.copy(lin(o.glow || '#000000')); return m; };
  // A dressed figure is a hundred small parts; merge each bone's leaf meshes per material, so it draws in a handful of calls
  // and every pose still works (only meshes with no children of their own are merged; userData.keep opts one out).
  function compact(root) {
    const nodes = []; root.traverse((o) => nodes.push(o));
    for (const n of nodes) {
      const by = new Map();
      for (const c of n.children) if (c.isMesh && !c.isInstancedMesh && !c.children.length && c.visible && !c.userData.keep && !Array.isArray(c.material)) { if (!by.has(c.material)) by.set(c.material, []); by.get(c.material).push(c); }
      for (const [m, list] of by) if (list.length > 1) {
        const o = new THREE.Mesh(mergeGeos(list.map((c) => { c.updateMatrix(); return [c.geometry, c.matrix]; })), m);
        o.castShadow = list.some((c) => c.castShadow); o.receiveShadow = list.some((c) => c.receiveShadow); list.forEach((c) => n.remove(c)); n.add(o);
      }
    }
    return root;
  }
  // Locs on a head of radius R. Under a cap they start at the rim (o.cap = its elevation in radians); bare, all over the
  // scalp. Each runs out over the skull and hangs, longest down the back (o.drape tips them back over the shoulders);
  // o.len / o.n / o.th / o.out make long dreads,
  // thin box braids or short twists that stick out. o.front adds locks either side of the face; o.seg / o.rad thin out the
  // mesh for a crowd. o.tilt lifts the roots towards the face, following a cap's rim (o.bulge: how far they stand off the
  // scalp just below the roots, so a cap's rim can hide them); o.clear lists ellipsoids
  // [cx, cy, cz, rx, ry, rz] (a hood, the shoulders, the back) the locs lie over instead of passing through. Returns the hair, the
  // dyed ends (o.tips of them) and gold cuffs (o.cuffs of them) as three geometries.
  function locs(R, o = {}) {
    return kc('locs' + R + JSON.stringify(o), () => {
      const r = rng(o.seed || 7), n = o.n || 30, th = o.th || R * 0.09, hair = [], tips = [], cuffs = [];
      const fit = (pts) => { for (const p of pts) for (const [cx, cy, cz, ...e] of o.clear) {   // push each point out onto the surface it would sink into (grown by a lock's thickness)
        const [ex, ey, ez] = e.map((v) => v + th * 1.4), qx = (p.x - cx) / ex, qy = (p.y - cy) / ey, qz = (p.z - cz) / ez, l = Math.hypot(qx, qy, qz);
        if (l < 1) p.set(cx + (qx / l) * ex, cy + (qy / l) * ey, cz + (qz / l) * ez); } return pts; };
      const drape = (pts) => { fit(pts); for (let it = 0; it < 4; it++) { const q = pts.map((p) => p.clone()); for (let k = 1; k < pts.length - 1; k++) pts[k].copy(q[k - 1]).add(q[k + 1]).multiplyScalar(0.25).addScaledVector(q[k], 0.5); fit(pts); } return pts; };   // pushed out, then relaxed so it bends over a hump instead of kinking
      const one = (a, e, L, out) => {
        const sa = Math.sin(a), ca = Math.cos(a), h0 = R * Math.cos(e), y0 = R * Math.sin(e), bulge = o.bulge ?? (o.cap !== undefined ? 1.09 : 1.1 + 0.12 * Math.sin(e));
        let c = new THREE.QuadraticBezierCurve3(V3(sa * h0, y0, ca * h0), V3(sa * R * bulge, y0 + 0.012, ca * R * bulge), V3(sa * (R * 1.06 + out), y0 - L, ca * (R * 1.06 + out) - L * (o.drape ?? 0.1)));
        if (o.clear) c = new THREE.CatmullRomCurve3(drape(Array.from({ length: 11 }, (_, k) => c.getPoint(k / 10))));
        const t = th * (0.85 + r() * 0.3); hair.push([new THREE.TubeGeometry(c, o.seg || 6, t, o.rad || 5)]);
        if (r() < (o.tips || 0)) {   // the dyed end: a sleeve over the lock's own last segments, wide enough that the lock's corners never poke through
          const sg = o.seg || 6, i0 = Math.round(sg * 0.7), path = new THREE.CurvePath(); for (let i = i0; i < sg; i++) path.add(new THREE.LineCurve3(c.getPointAt(i / sg), c.getPointAt((i + 1) / sg)));
          tips.push([new THREE.TubeGeometry(path, sg - i0, (t * 1.06) / Math.cos(Math.PI / (o.rad || 5)), o.rad || 5)]); }
        if (r() < (o.cuffs || 0)) { const k = 0.3 + r() * 0.3, p = c.getPoint(k), q = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), c.getTangent(k)); cuffs.push([new THREE.TorusGeometry(t * 1.15, t * 0.45, 4, 8), new THREE.Matrix4().compose(p, q, V3(1, 1, 1))]); }
      };
      for (let i = 0; i < n; i++) {
        const a = 0.62 + ((i + r() * 0.8) / n) * (Math.PI * 2 - 1.24), back = (1 - Math.cos(a)) / 2;   // round the sides and back: the face stays clear
        one(a, o.cap !== undefined ? o.cap + (o.tilt || 0) * Math.cos(a) + (r() - 0.5) * 0.1 : 0.1 + r() * 1.2, (o.len || 0.3) * (0.55 + 0.45 * back) * (0.85 + r() * 0.3), (o.out ?? 0.03) * (0.5 + r()));
      }
      for (let i = 0; i < (o.front || 0); i++) for (const sd of [-1, 1]) { const fa = 0.5 + i * 0.16 + r() * 0.05; one(sd * fa, o.cap !== undefined ? o.cap + (o.tilt || 0) * Math.cos(fa) : 0.5, (o.len || 0.3) * 0.62, 0.004); }
      return { hair: mergeGeos(hair), tips: tips.length ? mergeGeos(tips) : null, cuffs: cuffs.length ? mergeGeos(cuffs) : null };
    });
  }
  // Cornrows: tight rows from the hairline over the top to the nape.
  const cornrows = (R, n = 7) => kc('rows' + R + n, () => mergeGeos(Array.from({ length: n }, (_, k) => {
    const x = (k / (n - 1) - 0.5) * 1.45 * R, rr = Math.sqrt(R * R - x * x) * 1.02, pts = [];
    for (let j = 0; j <= 10; j++) { const b = 0.42 + (j / 10) * (Math.PI - 0.12); pts.push(V3(x, rr * Math.sin(b), rr * Math.cos(b))); }
    return [new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, R * 0.06, 5)];
  })));
  // A fitted / snapback, origin at the centre of its rim (radius a, the crown h tall): a structured crown with its top button,
  // a dead-flat brim, the green underbrim, the round sticker left on the brim, and the strap at the back.
  const capGeos = (a, h) => kc('cap' + a + h, () => {
    const crown = new THREE.LatheGeometry([[1, 0], [0.99, 0.33], [0.95, 0.58], [0.86, 0.77], [0.68, 0.9], [0.38, 0.98], [0, 1]].map(([r, y]) => new THREE.Vector2(r * a, y * h)), 22); crown.scale(1, 1, 1.08);
    const brim = new THREE.CylinderGeometry(a * 0.95, a * 0.95, 0.008, 24); brim.scale(1, 1, 0.78); brim.translate(0, 0.003, a * 0.97);
    const under = new THREE.CircleGeometry(a * 0.945, 24); under.rotateX(Math.PI / 2); under.scale(1, 1, 0.78); under.translate(0, -0.0012, a * 0.97);
    return { crown: mergeGeos([[crown], [new THREE.SphereGeometry(a * 0.11, 8, 6), M4(0, h, 0, 0, 0, 0, 1, 0.5, 1)]]), brim, under,
      sticker: new THREE.CylinderGeometry(a * 0.14, a * 0.14, 0.002, 14).translate(a * 0.32, 0.0075, a * 1.45), strap: new THREE.BoxGeometry(a * 0.6, 0.014, 0.01).translate(0, 0.016, -a * 1.075) };
  });
  // A ski mask: the whole head, an open slot for the eyes.
  const maskGeo = (R) => kc('mask' + R, () => { const r = R * 1.05; return mergeGeos([[new THREE.SphereGeometry(r, 16, 7, 0, Math.PI * 2, 0, 1.38)], [new THREE.SphereGeometry(r, 16, 6, 0, Math.PI * 2, 1.68, 1.25)], [new THREE.SphereGeometry(r, 12, 2, Math.PI / 2 + 0.62, Math.PI * 2 - 1.24, 1.38, 0.3)], [new THREE.SphereGeometry(r * 0.3, 8, 6), M4(0, r * 0.97, 0, 0, 0, 0, 1, 0.6, 1)]]); });
  // A bandana: tied round the head with the knot and tails at the back, or (o.face) over nose and mouth.
  const bandanaGeo = (R, face) => kc('band' + R + face, () => face
    ? mergeGeos([[new THREE.CylinderGeometry(R * 1.04, R * 1.1, R * 0.6, 16, 1, true), M4(0, -R * 0.38, 0)], [new THREE.ConeGeometry(R * 0.5, R * 0.55, 3), M4(0, -R * 0.82, R * 0.86, Math.PI, 0, 0, 1, 1, 0.25)], [new THREE.SphereGeometry(R * 0.13, 6, 5), M4(0, -R * 0.25, -R * 1.08)]])
    : mergeGeos([[new THREE.CylinderGeometry(R * 1.04, R * 1.06, R * 0.38, 16, 1, true), M4(0, R * 0.42, 0, -0.18)], [new THREE.SphereGeometry(R * 0.14, 6, 5), M4(0, R * 0.3, -R * 1.08)], [new THREE.BoxGeometry(R * 0.16, R * 0.6, R * 0.04), M4(-R * 0.08, 0, -R * 1.1, 0.15, 0, 0.25)], [new THREE.BoxGeometry(R * 0.16, R * 0.5, R * 0.04), M4(R * 0.1, 0.03 * R, -R * 1.1, 0.15, 0, -0.3)]]));
  // Glasses for a head of radius R: 'shutter' shades (a frame with horizontal slats over each eye) or 'dark' designer
  // shades (frame + separate lenses). Returns { frame, lens }.
  const shadesGeo = (R, kind) => kc('sh' + R + kind, () => {
    const s = R / 0.115, frame = [], lens = [], B = (to, w, h, d, x, y, z, ry = 0) => to.push([new THREE.BoxGeometry(w * s, h * s, d * s), M4(x * s, y * s, z * s, 0, ry, 0)]);
    for (const sd of [-1, 1]) {
      const x = sd * 0.047, ry = sd * 0.16;
      B(frame, 0.1, 0.011, 0.012, sd * 0.05, 0.04, 0.114, ry);                                   // brow bar
      B(frame, 0.006, 0.008, 0.11, sd * 0.096, 0.034, 0.055);                                     // arm back to the ear
      if (kind === 'shutter') {
        B(frame, 0.086, 0.008, 0.01, x, -0.016, 0.112, ry); B(frame, 0.008, 0.06, 0.01, sd * 0.091, 0.012, 0.106, ry);   // lower rim, outer edge
        for (let k = 0; k < 4; k++) B(frame, 0.082, 0.0045, 0.008, x, -0.005 + k * 0.0105, 0.113, ry);                    // the shutters
      } else { B(lens, 0.08, 0.05, 0.006, x, 0.012, 0.111, ry); B(frame, 0.008, 0.05, 0.01, sd * 0.09, 0.016, 0.105, ry); }
    }
    B(frame, 0.014, 0.012, 0.01, 0, 0.03, 0.118);                                                 // bridge
    return { frame: mergeGeos(frame), lens: lens.length ? mergeGeos(lens) : null };
  });
  // A necklace round the neck and down the chest, in a bone's frame: neck at height yn with radius rn, chest front at zc,
  // hanging `drop`. With o.links it is real interlocked links (Cuban: flattened and twisted to lie on the chest), else a
  // heavy rope. o.pend (radius) hangs an iced medallion: { chain, bezel, ice }. o.lo: fewer facets, for a crowd.
  const chainGeo = (o) => kc('chain' + JSON.stringify(o), () => {
    const { yn, rn, zc, drop, w = rn * 0.95, th = 0.006 } = o;
    const curve = new THREE.CatmullRomCurve3([V3(0, yn + 0.012, -rn), V3(rn, yn + 0.006, -rn * 0.15), V3(w, yn - drop * 0.32, zc * 0.93), V3(w * 0.55, yn - drop * 0.8, zc + 0.006), V3(0, yn - drop, zc + 0.01), V3(-w * 0.55, yn - drop * 0.8, zc + 0.006), V3(-w, yn - drop * 0.32, zc * 0.93), V3(-rn, yn + 0.006, -rn * 0.15)], true, 'centripetal');
    let chain;
    if (o.links) {
      const N = Math.round(curve.getLength() / (th * 2.4)), link = new THREE.TorusGeometry(th * 1.25, th * 0.5, o.lo ? 3 : 4, o.lo ? 5 : 10), parts = [];
      for (let k = 0; k < N; k++) {
        const u = k / N, p = curve.getPointAt(u), X = curve.getTangentAt(u), out = V3(p.x, 0, p.z).normalize(), Z0 = out.sub(X.clone().multiplyScalar(out.dot(X))).normalize(), B = X.clone().cross(Z0), tw = k % 2 ? 0.7 : -0.7;
        const Z = Z0.clone().multiplyScalar(Math.cos(tw)).addScaledVector(B, Math.sin(tw)), Y = Z.clone().cross(X);
        parts.push([link, new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(p).multiply(new THREE.Matrix4().makeScale(1.35, 1, 0.75))]);
      }
      chain = mergeGeos(parts);
    } else chain = new THREE.TubeGeometry(curve, o.lo ? 36 : 64, th, o.lo ? 5 : 6, true);
    if (!o.pend) return { chain };
    const r = o.pend, y = yn - drop - r - th * 1.5, z = zc + 0.014;
    return { chain: mergeGeos([[chain], [new THREE.TorusGeometry(th * 1.3, th * 0.5, 4, 10), M4(0, yn - drop - th * 0.8, zc + 0.01)]]), bezel: new THREE.TorusGeometry(r, r * 0.16, o.lo ? 4 : 6, o.lo ? 14 : 24).translate(0, y, z),
      ice: new THREE.IcosahedronGeometry(r * 0.92, 1).scale(1, 1, 0.32).translate(0, y, z) };
  });
  // High-tops for a foot whose sole sits at y = 0 under the ankle (toe to +z): the base upper, overlays (toe and heel),
  // the tall collar with the outsole in the same colour, and white midsole and laces. Loud colourways come from mixing them.
  const hightopGeo = (w, len) => kc('ht' + w + len, () => {
    const cz = 0.04, B = (bw, h, d, x, y, z, rx = 0) => [new THREE.BoxGeometry(bw, h, d), M4(x, y, cz + z, rx)];
    return {
      base: mergeGeos([B(w, 0.07, len * 0.62, 0, 0.07, -len * 0.19), B(w * 0.94, 0.05, len * 0.42, 0, 0.09, len * 0.14, 0.32)]),   // quarter, the vamp sloping down to the toe cap
      accent: mergeGeos([B(w + 0.008, 0.032, len + 0.004, 0, 0.05, 0), [new THREE.SphereGeometry(w * 0.53, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), M4(0, 0.034, cz + len * 0.5 - w * 0.5, 0, 0, 0, 1, 0.8, 1)], B(w + 0.008, 0.08, 0.06, 0, 0.08, -len / 2 + 0.028)]),   // mudguard, toe cap, heel counter
      collar: mergeGeos([[new THREE.CylinderGeometry(w * 0.56, w * 0.62, 0.12, 12), M4(0, 0.15, -0.012)], B(w + 0.012, 0.01, len + 0.014, 0, 0.005, 0)]),   // the high collar; the outsole matches it
      white: mergeGeos([B(w + 0.014, 0.032, len + 0.018, 0, 0.026, 0), ...[0, 1, 2, 3].map((k) => B(w * 0.62, 0.009, 0.014, 0, 0.122 - k * 0.0095, 0.03 + k * 0.03, 0.32))]),   // midsole, laces
    };
  });
  // Skinny jeans stacked on the shoe: three uneven folds of denim bunched at the ankle (r = the leg there; seg: round it).
  const stackGeo = (r, h, seg = 12) => kc('stack' + r + h + seg, () => mergeGeos([0, 1, 2].map((k) => { const pts = []; for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector2(r * (1 + 0.1 * Math.sin(t * Math.PI)), t * h * 0.42)); } return [new THREE.LatheGeometry(pts, seg), M4(0, k * h * 0.29, 0, [0.14, -0.1, 0.06][k], 0, [-0.08, 0.12, -0.04][k])]; })));
  // A quilted puffer body (lathe with a roll every `h / rolls`), wider than the man inside it; `gap` leaves the front open.
  const pufferGeo = (rt, rb, h, rolls, gap = 0, y0 = 0, seg = 22) => kc('puf' + [rt, rb, h, rolls, gap, y0, seg], () => {
    const pts = [new THREE.Vector2(rb * 0.92, y0 - 0.01)], N = rolls * 6;
    for (let i = 0; i <= N; i++) { const t = i / N; pts.push(new THREE.Vector2((rb + (rt - rb) * t) * (1 + 0.075 * Math.pow(Math.abs(Math.sin(Math.PI * t * rolls)), 0.7)), y0 + t * h)); }
    pts.push(new THREE.Vector2(rt * 0.75, y0 + h + 0.035), new THREE.Vector2(rt * 0.45, y0 + h + 0.05));
    return new THREE.LatheGeometry(pts, seg, gap / 2, Math.PI * 2 - gap);
  });
  /* ================= everyday clothes for the people in the world ================= */
  // Everybody is dressed from separate decks of parts, so the same few shapes and colours make a great many different
  // people: the head (skin, hair), something on the head, a bag or none, a long-sleeved top, the layer under it that
  // peeks out at the hem and the neck, trousers (or a long skirt), shoes. Every deck is drawn on its own, colours too.
  //   npc.look(r)           a random outfit (r: an E.rng)
  //   npc.dress(r, look?)   one person to animate: { f (feet at the origin, front +z), up (everything above the hips, at
  //                         0.86), head, arms (shoulder pivots, the arm hanging down -y), legs, torso: up, look }
  //   npc.crowd(n, r, nv)   n walkers drawn as nv outfits, each one instanced mesh in vertex colours (one draw per outfit):
  //                         { group, set(i, matrix), done() }
  const npc = (() => {
    const C = {
      skin: ['#f1cfae', '#e1b18c', '#c8946a', '#a0704c', '#7a4e33', '#4e3222'],
      hair: ['#14100d', '#2b1d14', '#4a3222', '#7a5a3a', '#b8a080', '#8f8f8f'],
      top: ['#1e2024', '#2f3238', '#5b5f66', '#9aa0a6', '#d9d4c8', '#efece4', '#2f4a3a', '#5a6a3a', '#3a4a6a', '#20304a', '#6a2a26', '#8a5a3a', '#c8a24a', '#a8462e', '#4a3a5a', '#7a8a9a'],
      layer: ['#efece4', '#1e2024', '#c8312a', '#e8c43a', '#3a7ad8', '#9aa0a6', '#5aa46a', '#e88a3a', '#d8b8c8', '#8a6ad0'],
      pants: ['#1c1d22', '#2a2c33', '#4a4d55', '#33456e', '#6e83a6', '#c9bfa8', '#6b5a44', '#3d4a35', '#7a7468'],
      shoe: ['#f1efe9', '#1a1a1c', '#7a5a3a', '#b8b2a6', '#c8312a', '#3a5aa8', '#3a3a3a'],
      bag: ['#1a1a1c', '#3a3a36', '#7a6a50', '#c9bfa8', '#2f3a4a', '#6a2a26', '#4a5a3a', '#c8a24a'],
      hat: ['#1a1a1c', '#3a3a3e', '#7a7468', '#c9bfa8', '#2a3a5a', '#6a2a26', '#d8b04a', '#3d4a35'],
    };
    const DECK = {
      hair: ['crop', 'crop', 'buzz', 'long', 'long', 'bun', 'afro', 'curly', 'bob', 'bald'],
      head: ['none', 'none', 'none', 'beanie', 'beanie', 'cap', 'capback', 'bucket', 'hood', 'headphones', 'glasses', 'glasses'],
      bag: ['none', 'none', 'none', 'backpack', 'backpack', 'sling', 'sling', 'tote', 'messenger', 'shoulder'],
      top: ['hoodie', 'hoodie', 'crew', 'crew', 'coat', 'puffer', 'chore', 'tee', 'cardigan', 'shirt'],
      pants: ['straight', 'straight', 'wide', 'wide', 'slim', 'jogger', 'cargo', 'skirt'],
      shoes: ['sneaker', 'sneaker', 'runner', 'boot', 'loafer', 'hightop'],
    };
    const pick = (r, a) => a[Math.floor(r() * a.length)];
    function look(r) {
      const L = { skin: pick(r, C.skin), hairC: pick(r, C.hair), hair: pick(r, DECK.hair), head: pick(r, DECK.head), hatC: pick(r, C.hat), bag: pick(r, DECK.bag), bagC: pick(r, C.bag),
        top: pick(r, DECK.top), topC: pick(r, C.top), layer: pick(r, C.layer), pants: pick(r, DECK.pants), pantsC: pick(r, C.pants), shoes: pick(r, DECK.shoes), shoeC: pick(r, C.shoe), sole: r() < 0.7 ? '#efece4' : '#2a2a2a' };
      if (L.head === 'hood' && L.top !== 'hoodie') L.head = 'beanie';   // only a hoodie has a hood to put up
      if (L.layer === L.topC) L.layer = C.layer[(C.layer.indexOf(L.layer) + 3) % C.layer.length];
      return L;
    }
    const MC = {}, m = (hex) => MC[hex] || (MC[hex] = mat(hex, { rough: 0.85 }));
    const GC = {}, G = (key, f) => GC[key] || (GC[key] = f());
    const cyl = (rt, rb, h, n) => new THREE.CylinderGeometry(rt, rb, h, n), sph = (rr, a, b, ...o) => new THREE.SphereGeometry(rr, a, b, ...o), box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    function dress(r, L = look(r), lo = false) {
      const S = lo ? 6 : 10, f = new THREE.Group(), up = new THREE.Group(); up.position.y = 0.86; f.add(up);
      const add = (par, geo, hex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(geo, m(hex)); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.scale.set(sx, sy, sz); par.add(o); return o; };
      const dark = (hex, k = 0.8) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
      // legs and shoes
      const P = L.pantsC, legs = [-1, 1].map((sd) => { const piv = new THREE.Group(); piv.position.set(sd * 0.095, 0.86, 0); f.add(piv); return piv; });
      const pantsG = { straight: [0.086, 0.076], wide: [0.1, 0.118], slim: [0.076, 0.056], jogger: [0.088, 0.062], cargo: [0.1, 0.104], skirt: [0.05, 0.045] }[L.pants];
      legs.forEach((lg, i) => {
        add(lg, G(`leg${L.pants}${S}`, () => cyl(pantsG[0], pantsG[1], 0.8, S).translate(0, -0.4, 0)), L.pants === 'skirt' ? dark(L.skin, 0.35) : P);
        if (L.pants === 'jogger') add(lg, G('cuffJ' + S, () => cyl(0.066, 0.064, 0.07, S)), dark(P, 0.75), 0, -0.76);
        if (L.pants === 'cargo') add(lg, G('pocketC', () => box(0.06, 0.16, 0.14)), dark(P, 0.88), (i ? 1 : -1) * 0.1, -0.38);
      });
      const shoe = { sneaker: [0.11, 0.08, 0.27, 0.025], runner: [0.125, 0.1, 0.29, 0.045], boot: [0.12, 0.18, 0.26, 0.03], loafer: [0.1, 0.055, 0.26, 0.015], hightop: [0.115, 0.15, 0.27, 0.03] }[L.shoes];
      for (const sd of [-1, 1]) {
        const x = sd * 0.095, sole = L.shoes === 'loafer' || L.shoes === 'boot' ? dark(L.shoeC, 0.5) : L.sole;
        add(f, G(`shoe${L.shoes}`, () => box(shoe[0], shoe[1], shoe[2])), L.shoeC, x, shoe[3] + shoe[1] / 2, 0.045);
        add(f, G(`sole${L.shoes}`, () => box(shoe[0] + 0.01, shoe[3], shoe[2] + 0.01)), sole, x, shoe[3] / 2, 0.045);
      }
      if (L.pants === 'skirt') add(up, G('skirt' + S, () => cyl(0.2, 0.33, 0.62, S + 4).translate(0, -0.31, 0)), P, 0, 0.04, 0, 0, 0, 0, 1, 1, 0.8);
      else add(up, G('seat' + S, () => cyl(0.19, 0.19, 0.16, S)), P, 0, 0.02, 0, 0, 0, 0, 1, 1, 0.7);
      // the top, its sleeves, and the layer peeking out at the hem and the neck
      const T = L.topC, Ly = L.layer, long = L.top === 'coat';
      const body = { hoodie: [0.215, 0.205, 0.6], crew: [0.205, 0.198, 0.58], coat: [0.215, 0.27, 1.05], puffer: [0.24, 0.235, 0.58], chore: [0.222, 0.225, 0.6], tee: [0.198, 0.188, 0.6], cardigan: [0.208, 0.205, 0.6], shirt: [0.2, 0.192, 0.6] }[L.top];
      add(up, G(`body${L.top}${S}`, () => cyl(body[0], body[1], body[2], S + 2).translate(0, 0.62 - body[2] / 2, 0)), T, 0, 0, 0, 0, 0, 0, 1, 1, 0.7);
      if (!long) add(up, G('hem' + S, () => cyl(0.2, 0.2, 0.07, S + 2)), Ly, 0, 0.0, 0, 0, 0, 0, 1, 1, 0.68);   // the longer layer under it shows below the hem
      add(up, G('neckRing', () => new THREE.TorusGeometry(0.085, 0.022, 5, 10)), Ly, 0, 0.615, 0, Math.PI / 2, 0, 0, 1, 1, 0.8);   // ...and at the neck
      if (L.top === 'hoodie') { add(up, G('pouch', () => box(0.24, 0.12, 0.03)), T, 0, 0.2, 0.135); if (L.head !== 'hood') add(up, G('hoodDown' + S, () => sph(0.14, S, 6)), T, 0, 0.56, -0.13, 0, 0, 0, 1.1, 0.7, 0.55); add(up, G('hemRib' + S, () => cyl(0.2, 0.2, 0.04, S + 2)), dark(T, 0.85), 0, 0.045, 0, 0, 0, 0, 1, 1, 0.71); }
      if (L.top === 'crew') add(up, G('hemRib' + S, () => cyl(0.2, 0.2, 0.04, S + 2)), dark(T, 0.85), 0, 0.045, 0, 0, 0, 0, 1, 1, 0.71);
      if (L.top === 'puffer') for (const y of [0.18, 0.38]) add(up, G('roll' + S, () => cyl(0.25, 0.25, 0.03, S + 2)), dark(T, 0.75), 0, y, 0, 0, 0, 0, 1, 1, 0.72);
      if (L.top === 'coat') { for (const sd of [-1, 1]) add(up, G('lapel', () => box(0.07, 0.3, 0.02)), dark(T, 0.85), sd * 0.06, 0.46, 0.152, 0, 0, sd * 0.25); add(up, G('belt' + S, () => cyl(0.225, 0.225, 0.05, S + 2)), dark(T, 0.7), 0, 0.12, 0, 0, 0, 0, 1, 1, 0.71); }
      if (L.top === 'chore') { for (const sd of [-1, 1]) add(up, G('chestPk', () => box(0.09, 0.09, 0.02)), dark(T, 0.85), sd * 0.09, 0.4, 0.158); add(up, G('placket', () => box(0.03, 0.56, 0.02)), dark(T, 0.8), 0, 0.31, 0.158); }
      if (L.top === 'cardigan') { add(up, G('open', () => box(0.07, 0.55, 0.02)), Ly, 0, 0.32, 0.146); for (let k = 0; k < 4; k++) add(up, G('btn', () => sph(0.012, 4, 3)), dark(T, 0.6), 0.045, 0.14 + k * 0.12, 0.148); }
      if (L.top === 'shirt') { for (const sd of [-1, 1]) add(up, G('collarPt', () => box(0.07, 0.05, 0.015)), T, sd * 0.05, 0.6, 0.11, 0, 0, sd * 0.5); add(up, G('placket', () => box(0.03, 0.56, 0.02)), dark(T, 0.9), 0, 0.31, 0.142); }
      const sleeve = L.top === 'puffer' ? [0.08, 0.068] : L.top === 'coat' ? [0.07, 0.064] : L.top === 'tee' ? [0.058, 0.05] : [0.064, 0.056];
      const arms = [-1, 1].map((sd) => {
        const piv = new THREE.Group(); piv.position.set(sd * 0.255, 0.56, 0); up.add(piv);
        add(piv, G(`sleeve${L.top}${S}`, () => cyl(sleeve[0], sleeve[1], 0.56, S).translate(0, -0.28, 0)), T);
        if (L.top === 'hoodie' || L.top === 'crew' || L.top === 'cardigan') add(piv, G('cuff' + S, () => cyl(0.052, 0.05, 0.04, S)), Ly, 0, -0.565);   // a sleeve of the layer under it at the wrist
        add(piv, G('hand', () => sph(0.048, 7, 5)), L.skin, 0, -0.61, 0);
        piv.rotation.z = sd * 0.06; return piv;
      });
      add(up, G('neck', () => cyl(0.05, 0.056, 0.12, 7)), L.skin, 0, 0.66, 0);
      // the head, the hair, what is on it
      const head = new THREE.Group(); head.position.y = 0.78; up.add(head);
      add(head, G('skull' + S, () => sph(0.118, S + 2, S)), L.skin, 0, 0, 0, 0, 0, 0, 0.95, 1.08, 1);
      if (!lo) for (const sd of [-1, 1]) add(head, G('eye', () => sph(0.012, 5, 4)), '#0e0c0b', sd * 0.04, 0.015, 0.105);
      const H = L.hairC, covered = L.head === 'beanie' || L.head === 'hood' || L.head === 'bucket';
      const cap = (k) => G('hairCap' + k + S, () => sph(0.124, S + 2, 6, 0, Math.PI * 2, 0, k));
      if (L.hair !== 'bald' && !(covered && (L.hair === 'crop' || L.hair === 'buzz'))) {
        if (L.hair === 'buzz') add(head, cap(1.3), H, 0, 0.005, -0.004, -0.2);
        else if (L.hair !== 'afro') add(head, cap(1.6), H, 0, 0.008, -0.006, -0.25);
        if (L.hair === 'long') add(head, G('longBack' + S, () => new THREE.CylinderGeometry(0.11, 0.12, 0.3, S, 1, true, Math.PI * 0.55, Math.PI * 0.9)), H, 0, -0.12, -0.01);
        if (L.hair === 'bob') add(head, G('bob' + S, () => new THREE.CylinderGeometry(0.128, 0.13, 0.13, S + 2, 1, true, Math.PI * 0.35, Math.PI * 1.3)), H, 0, -0.03, 0);
        if (L.hair === 'bun' && !covered) add(head, G('bun', () => sph(0.055, 7, 5)), H, 0, 0.1, -0.09);
        if (L.hair === 'afro' && !covered) add(head, G('afro' + S, () => sph(0.17, S + 2, S)), H, 0, 0.05, -0.03);
        if (L.hair === 'curly' && !covered) for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; add(head, G('curl', () => sph(0.045, 5, 4)), H, Math.sin(a) * 0.09, 0.08, Math.cos(a) * 0.09 - 0.02); }
      }
      const HC = L.hatC;
      if (L.head === 'beanie') { add(head, G('beanie' + S, () => sph(0.13, S + 2, 6, 0, Math.PI * 2, 0, 1.55)), HC, 0, 0.02, -0.005); add(head, G('beanieCuff' + S, () => cyl(0.133, 0.133, 0.05, S + 2)), dark(HC, 0.85), 0, 0.03, -0.005); }
      if (L.head === 'cap' || L.head === 'capback') { const g2 = new THREE.Group(); g2.position.set(0, 0.03, 0); g2.rotation.y = L.head === 'capback' ? Math.PI : 0; head.add(g2);
        add(g2, G('capCrown' + S, () => sph(0.128, S + 2, 6, 0, Math.PI * 2, 0, 1.35)), HC); add(g2, G('capBrim', () => cyl(0.1, 0.1, 0.012, 10).scale(1, 1, 0.75)), HC, 0, 0.02, 0.12, 0.12); }
      if (L.head === 'bucket') { add(head, G('bucketTop' + S, () => cyl(0.11, 0.13, 0.11, S + 2)), HC, 0, 0.08, 0); add(head, G('bucketBrim' + S, () => cyl(0.135, 0.19, 0.04, S + 2)), HC, 0, 0.025, 0); }
      if (L.head === 'hood') add(head, G('hoodUp' + S, () => sph(0.15, S + 2, 7, Math.PI / 2 + 0.75, Math.PI * 2 - 1.5, 0, Math.PI * 0.72)), T, 0, 0.012, -0.012, 0, 0, 0, 1, 1.08, 1.05);
      if (L.head === 'headphones') { add(head, G('band', () => new THREE.TorusGeometry(0.128, 0.012, 4, 14, Math.PI)), HC, 0, 0.01, 0, 0, 0, 0); for (const sd of [-1, 1]) add(head, G('cup', () => cyl(0.045, 0.045, 0.03, 10)), HC, sd * 0.125, 0, 0, 0, 0, Math.PI / 2); }
      if (L.head === 'glasses') { add(head, G('frame', () => box(0.17, 0.035, 0.012)), HC === '#d8b04a' ? '#c8a24a' : '#141414', 0, 0.015, 0.115); }
      // the bag
      const B = L.bagC, strap = (rz, z) => add(up, G('strap', () => box(0.035, 0.82, 0.012)), dark(B, 0.8), 0, 0.3, z, 0, 0, rz);
      if (L.bag === 'backpack') { add(up, G('pack', () => box(0.3, 0.38, 0.15)), B, 0, 0.36, -0.22); add(up, G('packPk', () => box(0.22, 0.14, 0.04)), dark(B, 0.85), 0, 0.26, -0.31); for (const sd of [-1, 1]) add(up, G('pStrap', () => box(0.04, 0.42, 0.012)), dark(B, 0.8), sd * 0.1, 0.38, 0.15); }
      if (L.bag === 'sling') { strap(0.75, 0.152); strap(-0.75, -0.152); add(up, G('slingBag', () => box(0.22, 0.11, 0.07)), B, -0.04, 0.42, 0.18, 0, 0, 0.6); }
      if (L.bag === 'tote') { add(up, G('toteStrap', () => box(0.03, 0.45, 0.012)), dark(B, 0.85), 0.2, 0.36, 0.06); add(up, G('tote', () => box(0.06, 0.36, 0.3)), B, 0.27, 0.0, 0.0, 0, 0, 0.08); }
      if (L.bag === 'messenger') { strap(0.6, 0.152); strap(-0.6, -0.152); add(up, G('mess', () => box(0.08, 0.26, 0.32)), B, -0.25, 0.02, -0.03); }
      if (L.bag === 'shoulder') { add(up, G('shStrap', () => box(0.025, 0.32, 0.012)), dark(B, 0.8), -0.2, 0.42, 0.04); add(up, G('shBag', () => box(0.08, 0.16, 0.22)), B, -0.25, 0.24, 0.0); }
      f.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      return { f, up, head, arms, legs, torso: up, look: L };
    }
    // one person in one geometry, its colours in the vertices (for a crowd drawn instanced)
    function bake(L) {
      const d = dress(null, L, true), list = []; d.f.updateMatrixWorld(true);
      d.f.traverse((o) => { if (!o.isMesh) return; const g = o.geometry.clone(), c = o.material.color, n = g.attributes.position.count, a = new Float32Array(n * 3); for (let k = 0; k < n; k++) a.set([c.r, c.g, c.b], k * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g.attributes.uv) g.deleteAttribute('uv'); list.push([g, o.matrixWorld]); });
      const out = mergeGeos(list); list.forEach(([g]) => g.dispose()); return out;
    }
    let crowdM = null;
    function crowd(n, r, nv = 10) {
      crowdM = crowdM || (() => { const cm = mat('#ffffff', { rough: 0.85 }, true); cm.vertexColors = true; return cm; })();
      const group = new THREE.Group(), slot = [], counts = new Array(nv).fill(0);
      for (let i = 0; i < n; i++) { const v = Math.floor(r() * nv); slot.push([v, counts[v]++]); }
      const meshes = counts.map((c) => { const im = new THREE.InstancedMesh(bake(look(r)), crowdM, Math.max(1, c)); im.count = c; im.castShadow = true; im.frustumCulled = false; group.add(im); return im; });
      return { group, set(i, m4) { const [v, k] = slot[i]; meshes[v].setMatrixAt(k, m4); }, done() { meshes.forEach((im) => (im.instanceMatrix.needsUpdate = true)); } };
    }
    return { C, look, dress: (r, L, lo) => dress(r, L || look(r), lo), bake, crowd };
  })();
  const swag = { locs, cornrows, capGeos, maskGeo, bandanaGeo, shadesGeo, chainGeo, hightopGeo, stackGeo, pufferGeo, mergeGeos, compact, uvs, jewel, studio: studioTex };
  // A deck you can walk under (a parking area, its walkway, a ramp) is the ground only for someone already up at its level,
  // within a step of it (DECK_STEP, the height from which a deck's rails stop you too), or being set down from above (no y).
  // Anyone lower is underneath and stays on the floor: a p.ground that returns a deck height asks onDeck(h, y) first, or
  // walking under it lifts you onto it. Where the floor comes up closer under a deck than you could stand, the place walls
  // that strip off for those below (see parkingArea in places2.js) rather than letting them walk in with their head in it.
  const DECK_STEP = 1.2, HEADROOM = 2.4;
  const onDeck = (h, y) => y === undefined || y > h - DECK_STEP;
  const E = { rng, mat, plane, tex, textTex, bench, dot, batch, gloss, basic, lin, ring, rockGeo, waterN, WATER_GLSL, swag, npc, onDeck, DECK_STEP, HEADROOM };
  const places = SW.SONGS.map((song, idx) => {
    const dx = song.x, dz = song.z, len = Math.hypot(dx, dz) || 1;
    const rot = Math.atan2(-dx / len, -dz / len);
    const c = Math.cos(rot), s = Math.sin(rot);
    const root = new THREE.Group(), group = new THREE.Group();   // root carries the transform and the lights; group holds the meshes and is what gets hidden
    root.position.set(song.x, 0, song.z);
    root.rotation.y = rot;
    root.add(group); scene.add(root);
    const p = {
      song, idx, x: song.x, z: song.z, rot, group, dwell: 0, gain: 0, found: false,
      color: song.color || '#ffb428',
      toWorld: (lx, lz) => ({ x: song.x + lx * c + lz * s, z: song.z - lx * s + lz * c }),
      local: (wx, wz) => { const ax = wx - song.x, az = wz - song.z; return { x: ax * c - az * s, z: ax * s + az * c }; },
      addCircle(lx, lz, r, y0 = -1e9, y1 = 1e9) { const w = p.toWorld(lx, lz), c = { x: w.x, z: w.z, r, y0, y1 }; circles.push(c); return c; },
      addBox(lx, lz, hx, hz, y0 = -1e9, y1 = 1e9) { const w = p.toWorld(lx, lz), b = { x: w.x, z: w.z, hx, hz, c, s, y0, y1 }; boxes.push(b); return b; },
      interact(o) { const w = p.toWorld(o.lx, o.lz), ia = { ...o, x: w.x, z: w.z, sx: w.x, sz: w.z }; interact.push(ia); return ia; },
      water(lx, lz, hx, hz) { const w = p.toWorld(lx, lz); waters.push({ x: w.x, z: w.z, hx, hz, c, s }); },
      waterShape(fn) { waters.push({ fn: (x, z) => { const l = p.local(x, z); return fn(l.x, l.z); } }); },   // fn(lx, lz) -> true over its water
      pick(m) { m.userData.ground = true; pick.push(m); },
      info(lx, lz, r, mark, lines) { const w = p.toWorld(lx, lz); interact.push({ kind: 'info', x: w.x, z: w.z, sx: w.x, sz: w.z, r, mark, lines }); },
    };
    const builder = SW.PLACES[song.scene] || SW.PLACES.generic;
    builder.build(p, E);
    { const lights = []; group.traverse((o) => { if (o.isLight) lights.push(o); }); root.updateMatrixWorld(true); lights.forEach((l) => root.attach(l)); }
    p.ground = p.ground || null;
    p.grade = prepGrade(p.grade, rot);
    return p;
  });

  // the far ring of mountains keeps off whatever a place spreads out past the land's edge (p.farClear: FIELD's airport)
  for (const m of farGroup.children.slice()) { if (m.material !== farM) continue; const r = (m.geometry.parameters && m.geometry.parameters.radius) || 60; if (places.some((p) => p.farClear && [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].some(([ox, oz]) => { const l = p.local(m.position.x + ox, m.position.z + oz); return p.farClear(l.x, l.z); }))) farGroup.remove(m); }
  // Buildings a place lets spill out into the woods (FLIP's outskirts, FIELD's neighbourhood) give way to every other
  // place proper (p.core, or its blocks) and to its viewpoint; where two places' spill overlaps, the higher p.spillRank keeps it.
  const coreOf = (q) => q.core || q.blocks;
  places.forEach((p) => {
    if (!p.spill) return;
    for (let i = p.spill.length - 1; i >= 0; i--) {
      const f = p.spill[i], w = p.toWorld(f.x, f.z), r = Math.max(f.w, f.d) / 2 + 3;
      const hit = places.some((q) => q !== p && [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].some(([ox, oz]) => { const l = q.local(w.x + ox, w.z + oz); return coreOf(q)(l.x, l.z); }))
        || places.some((q) => q !== p && Math.hypot(w.x - q.toWorld(...(q.vp || [0, 0])).x, w.z - q.toWorld(...(q.vp || [0, 0])).z) < r + 10);
      if (hit) { f.b.parent.remove(f.b); boxes.splice(boxes.indexOf(f.box), 1); p.spill.splice(i, 1); }
    }
  });
  places.forEach((p) => {
    if (!p.spill) return;
    for (let i = p.spill.length - 1; i >= 0; i--) {
      const f = p.spill[i], w = p.toWorld(f.x, f.z), r = Math.max(f.w, f.d) / 2;
      const beaten = places.some((q) => q !== p && q.spill && (q.spillRank || 0) > (p.spillRank || 0) && q.spill.some((o) => { const v = q.toWorld(o.x, o.z); return Math.hypot(v.x - w.x, v.z - w.z) < r + Math.max(o.w, o.d) / 2 + 3; }));
      if (beaten) { f.b.parent.remove(f.b); boxes.splice(boxes.indexOf(f.box), 1); p.spill.splice(i, 1); }
    }
  });

  var hillField = null;
  var street = null, streetView = null, pass = null, passView = null;   // pass: the mountain south of NO JOBB and its pass road (pass.js)
    // the street under the viaduct, from FLIP's north branch to the beach (street.js): planned before the piers and the hills, built after   // the rolling hills north of OHH (built once the places and paths exist, below)
  function hillAt(x, z) {   // the height of the drawn hill mesh: each grid cell is the same two triangles PlaneGeometry makes, so feet, trails and signposts sit on the facets
    const F = hillField; if (!F) return 0;
    const fx = (x - F.x0) / F.d, fz = (z - F.z0) / F.d; if (fx < 0 || fz < 0 || fx >= F.nx - 1 || fz >= F.nz - 1) return 0;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, H = F.h, n = F.nx;
    const a = H[j * n + i], b = H[(j + 1) * n + i], c = H[(j + 1) * n + i + 1], d = H[j * n + i + 1];
    return u + v <= 1 ? a + (d - a) * u + (b - a) * v : c + (b - c) * (1 - u) + (d - c) * (1 - v);
  }
  function groundAt(x, z, y) {   // y lets a place have two walkable levels (a platform above a room, a deck above a street): pass the walker's current height; without it you get the top
    let h = hillAt(x, z);
    if (y !== undefined) for (const p of places) if (p.bore) { const l = p.local(x, z), b = p.bore(l.x, l.z, y); if (b != null) { h = b; break; } }   // down in a tunnel through the hills: its floor, not the hill over it
    for (const p of places) if (p.ground) { const l = p.local(x, z); h = Math.max(h, p.ground(l.x, l.z, y)); }
    if (street) h = Math.max(h, street.ground(x, z, y));
    if (pass) h = Math.max(h, pass.ground(x, z, y));
    return h;
  }

  /* ---- grades (lighting the world blends into near each place) ---- */
  function prepGrade(g, rot) {
    const d = new THREE.Vector3(...g.sunDir);
    if (rot !== undefined) d.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    const tn = g.tint.map((v) => 1 + (v - 1) * 0.25);   // (a place's own tint, mostly let go: colour is the sky's and the sun's)
    // every place's light is pulled toward the same pale, cool air: its hues kept but quietened and nudged blue-white,
    // so the world reads as one picture and colour is left for what should catch the eye
    // (each colour moves toward the clear sky's own, at the brightness the place gave it: a night stays dark, but dark blue)
    const lum = (c) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
    const toward = (hex, tgt, k) => { const c = lin(hex), t = lin(tgt); return c.lerp(t.multiplyScalar(Math.min(1.2, lum(c) / Math.max(1e-4, lum(t)))), k); };
    return { top: toward(g.top, '#3f78c4', 0.85), bottom: toward(g.bottom, '#e6eef6', 0.85), fog: toward(g.fog, '#d6e1ec', 0.85), near: g.far ? Math.max(g.near, 60) : g.near, far: g.far ? Math.max(g.far, 330) : g.far, sun: toward(g.sun, '#f7faff', 0.5), sunInt: g.sunInt, hemi: g.hemi, sunDir: d.normalize(), tint: new THREE.Vector3(...tn), expo: g.expo, sat: Math.min(0.9, g.sat * 0.85), stars: g.stars };
  }
  const BASE = prepGrade({ top: '#3f78c4', bottom: '#e6eef6', fog: '#d6e1ec', near: 70, far: 400, sun: '#f7faff', sunInt: 1.7, hemi: 0.85, sunDir: [0.45, 0.62, 0.35], tint: [0.98, 1, 1.03], expo: 1.0, sat: 0.95, stars: 0 });   // Bryce's day: a clear blue overhead paling to white at the horizon, a hard white sun
  // Behind the wheel the day turns to a sodium-lit night (each place still pulls the light its own way).
  const DRIVE = prepGrade({ top: '#04050c', bottom: '#19243c', fog: '#0f1828', near: 26, far: 210, sun: '#9db6ff', sunInt: 0.34, hemi: 0.37, sunDir: [-0.35, 0.7, 0.3], tint: [0.94, 1.0, 1.08], expo: 1.3, sat: 1.05, stars: 0.3 });
  const blank = () => prepGrade({ top: '#000', bottom: '#000', fog: '#000', near: 0, far: 0, sun: '#000', sunInt: 0, hemi: 0, sunDir: [0, 1, 0], tint: [1, 1, 1], expo: 1, sat: 1, stars: 0 });
  const G = blank(), GB = blank(), GA = blank(), GR = blank();
  function mixGrade(o, a, b, k) {
    o.top.copy(a.top).lerp(b.top, k); o.bottom.copy(a.bottom).lerp(b.bottom, k); o.fog.copy(a.fog).lerp(b.fog, k); o.sun.copy(a.sun).lerp(b.sun, k);
    o.near = a.near + (b.near - a.near) * k; o.far = a.far + (b.far - a.far) * k;
    o.sunInt = a.sunInt + (b.sunInt - a.sunInt) * k; o.hemi = a.hemi + (b.hemi - a.hemi) * k;
    o.sunDir.copy(a.sunDir).lerp(b.sunDir, k).normalize(); o.tint.copy(a.tint).lerp(b.tint, k);
    o.expo = a.expo + (b.expo - a.expo) * k; o.sat = a.sat + (b.sat - a.sat) * k; o.stars = a.stars + (b.stars - a.stars) * k;
  }
  function applyGrade() {
    skyU.top.value.copy(G.top); skyU.bottom.value.copy(G.bottom); skyU.sunDir.value.copy(G.sunDir); skyU.sunCol.value.copy(G.sun).multiplyScalar(Math.min(1, G.sunInt / 2));
    scene.fog.color.copy(G.fog); scene.fog.near = G.near; scene.fog.far = G.far;
    sun.color.copy(G.sun); sun.intensity = G.sunInt; hemi.intensity = G.hemi;
    post.uniforms.tint.value.copy(G.tint); post.uniforms.expo.value = G.expo; post.uniforms.sat.value = G.sat;
    starMat.opacity = G.stars;
    rimU.value.copy(G.bottom).lerp(G.sun, 0.3).multiplyScalar(0.16);
    skyU.aur.value = 0;
    planetM.color.copy(G.bottom).lerp(G.top, 0.35).multiplyScalar(1.15); ringM.color.copy(planetM.color);
    farM.color.setRGB(1, 1, 1).lerp(G.fog, 0.42).multiplyScalar(0.55 + 0.5 * Math.min(1, G.sunInt / 1.4)); farM2.color.copy(G.fog).lerp(G.top, 0.55).multiplyScalar(0.7);
  }

  /* ================= plaza, paths, trees ================= */
  const PLAZA_R = 11;
  {
    const pl = new THREE.Mesh(new THREE.CircleGeometry(PLAZA_R, 56), mat('#b4b1a8', { map: tex('slate', 9, 9), rough: 0.9 }, true));
    if (!pl.material.normalMap) { pl.material.bumpMap = pl.material.map; pl.material.bumpScale = 0.05; }
    pl.rotation.x = -Math.PI / 2; pl.position.y = 0.03; pl.receiveShadow = true;
    scene.add(pl); pick.push(pl); pl.userData.ground = true;
    const rim = new THREE.Mesh(new THREE.RingGeometry(PLAZA_R, PLAZA_R + 0.6, 56), whiteM);
    rim.rotation.x = -Math.PI / 2; rim.position.y = 0.035; rim.receiveShadow = true; scene.add(rim);
    const iron = mat('#1c1a18', { rough: 0.6, metal: 0.6 });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(3.9, 4.05, 0.7, 14, 1, true), whiteM); wall.position.y = 0.35;
    const lip = new THREE.Mesh(new THREE.RingGeometry(3.5, 3.95, 14), whiteM); lip.rotation.x = -Math.PI / 2; lip.position.y = 0.7;
    const water = new THREE.Mesh(new THREE.CircleGeometry(3.5, 28), gloss('#141a17', { rough: 0.12, metal: 0.6, env: 0.25 })); water.rotation.x = -Math.PI / 2; water.position.y = 0.5;
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 2.6, 8), whiteM); ped.position.y = 1.5;
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(1.15, 48, 32), gloss('#ffffff', { rough: 0.04, metal: 1, env: 1.25 })); bowl.position.y = 3.95;   // Bryce's chrome ball
    [wall, lip, ped, bowl].forEach((m) => { m.castShadow = m.receiveShadow = true; });
    scene.add(wall, lip, water, ped, bowl);
    circles.push({ x: 0, z: 0, r: 4.0 });
  }

  // The record shop on the edge of the plaza, in the widest gap between the walks out to the places: step up to its
  // counter to buy the songs (the same store is an app on the phone).
  const shopAt = (() => {
    const dirs = places.map((p) => Math.atan2(p.x, p.z)); let bestA = 0, bestG = -1;
    for (let k = 0; k < 360; k++) { const a = (k * Math.PI) / 180, g = Math.min(...dirs.map((d) => Math.abs(Math.atan2(Math.sin(a - d), Math.cos(a - d))))); if (g > bestG) { bestG = g; bestA = a; } }
    const R0 = PLAZA_R + 4.2, ux = Math.sin(bestA), uz = Math.cos(bestA);
    return { x: ux * R0, z: uz * R0, yaw: Math.atan2(-ux, -uz), ux, uz };
  })();
  {
    const S = new THREE.Group(); S.position.set(shopAt.x, 0, shopAt.z); S.rotation.y = shopAt.yaw;
    const W = 6, D = 4.4, H = 3.6, brick = mat('#8a5a46', { map: tex('brick', 1.5, 1) }), trim = mat('#1b1c1f', { rough: 0.5, metal: 0.3 }), glass = gloss('#0c1013', { rough: 0.06, metal: 0.5, env: 1 });
    const put = (g, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; S.add(o); return o; };
    // the shell: back and sides of brick, a shopfront of black steel and glass facing the plaza (+z)
    put(new THREE.BoxGeometry(W, H, 0.3), brick, 0, H / 2, -D / 2 + 0.15);
    for (const sd of [-1, 1]) put(new THREE.BoxGeometry(0.3, H, D), brick, sd * (W / 2 - 0.15), H / 2, 0);
    put(new THREE.BoxGeometry(W + 0.3, 0.35, D + 0.5), trim, 0, H + 0.17, 0.1);   // roof slab with a cornice
    put(new THREE.BoxGeometry(W, 0.9, 0.12), trim, 0, H - 0.45, D / 2);            // fascia for the sign
    put(new THREE.BoxGeometry(W, 0.5, 0.12), trim, 0, 0.25, D / 2);                 // stall riser
    for (const x of [-W / 2 + 0.1, -0.8, 0.8, W / 2 - 0.1]) put(new THREE.BoxGeometry(0.12, H - 1.4, 0.14), trim, x, 0.5 + (H - 1.4) / 2, D / 2);
    put(new THREE.BoxGeometry(W / 2 - 0.9, H - 1.4, 0.04), glass, -(W / 4 + 0.4), 0.5 + (H - 1.4) / 2, D / 2 - 0.02);   // shop windows either side of the open door
    put(new THREE.BoxGeometry(W / 2 - 0.9, H - 1.4, 0.04), glass, W / 4 + 0.4, 0.5 + (H - 1.4) / 2, D / 2 - 0.02);
    put(new THREE.BoxGeometry(W - 0.3, 0.06, D - 0.3), mat('#2a2622', { rough: 0.8 }), 0, 0.03, 0);   // floor inside
    // inside: a warm light, racks of sleeves in the songs' colours, a counter with a listening deck
    const warm = new THREE.PointLight(lin('#ffcf9a'), 1.4, 9, 1.8); warm.position.set(0, H - 0.6, 0.4); S.add(warm);
    put(new THREE.BoxGeometry(W - 0.8, 0.08, 0.5), basic('#ffe2bf'), 0, H - 0.08, 0);
    const sleeveG = new THREE.BoxGeometry(0.32, 0.32, 0.02);
    for (let r = 0; r < 2; r++) for (let i = 0; i < 9; i++) { const p = places[(i + r * 3) % places.length], sl = put(sleeveG, mat(p.color, { rough: 0.55 }), -W / 2 + 0.7 + i * 0.52, 1.3 + r * 0.5, -D / 2 + 0.33); sl.rotation.x = -0.12; }
    for (const sd of [-1, 1]) { put(new THREE.BoxGeometry(1.2, 0.8, 0.6), mat('#3a2c22', { rough: 0.7 }), sd * 1.8, 0.4, -0.2); for (let i = 0; i < 6; i++) { const sl = put(sleeveG, mat(places[(i + (sd > 0 ? 4 : 0)) % places.length].color, { rough: 0.55 }), sd * 1.8 - 0.45 + i * 0.18, 0.92, -0.2); sl.rotation.x = -0.9; sl.rotation.y = Math.PI / 2; } }
    put(new THREE.BoxGeometry(2.2, 1.0, 0.7), trim, 0, 0.5, -1.2);
    const deck = put(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 24), mat('#0b0b0c', { rough: 0.3 }), -0.5, 1.03, -1.2);
    // the sign: lit letters over the door, and a projecting blade sign you can read from along the plaza
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.6, 0.8), new THREE.MeshBasicMaterial({ map: textTex((CFG.store && CFG.store.name) || 'RECORDS', { w: 1024, h: 140, font: '700 74px "Hind",sans-serif', color: '#ffe9c4', glow: '#ff9a3c' }), transparent: true, depthWrite: false }));
    sign.position.set(0, H - 0.45, D / 2 + 0.07); S.add(sign);
    const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.5), new THREE.MeshBasicMaterial({ map: textTex('RECORDS', { w: 512, h: 128, font: '700 70px "Hind",sans-serif', color: '#9ff3ff', glow: '#3ff0ff' }), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    blade.rotation.y = Math.PI / 2; blade.rotation.x = 0; blade.material.map.center.set(0.5, 0.5); blade.material.map.rotation = Math.PI / 2;
    blade.position.set(W / 2 + 0.4, H - 0.9, D / 2 - 0.2); S.add(blade);
    put(new THREE.BoxGeometry(0.06, 0.06, 0.6), trim, W / 2 + 0.2, H - 0.1, D / 2 - 0.2);
    // outside: a crate of records and an A-board
    const crate = put(new THREE.BoxGeometry(0.9, 0.5, 0.6), mat('#6e5137', { rough: 0.85 }), -W / 2 + 0.8, 0.25, D / 2 + 0.7);
    for (let i = 0; i < 5; i++) { const sl = put(sleeveG, mat(places[(i + 2) % places.length].color, { rough: 0.55 }), -W / 2 + 0.5 + i * 0.15, 0.62, D / 2 + 0.7); sl.rotation.y = Math.PI / 2; sl.rotation.z = -0.25; }
    scene.add(S);
    // walls stop you; the open door lets you step in to the counter
    const c = Math.cos(shopAt.yaw), sn = Math.sin(shopAt.yaw), wpt = (lx, lz) => ({ x: shopAt.x + lx * c + lz * sn, z: shopAt.z - lx * sn + lz * c });
    const addB = (lx, lz, hx, hz) => { const w = wpt(lx, lz); boxes.push({ x: w.x, z: w.z, hx, hz, c, s: sn }); };
    addB(0, -D / 2 + 0.15, W / 2, 0.2); addB(-W / 2 + 0.15, 0, 0.2, D / 2); addB(W / 2 - 0.15, 0, 0.2, D / 2);
    addB(-(W / 4 + 0.45), D / 2, W / 4 - 0.45, 0.15); addB(W / 4 + 0.45, D / 2, W / 4 - 0.45, 0.15);   // shopfront, with the door between
    addB(0, -1.2, 1.1, 0.4); addB(-1.8, -0.2, 0.65, 0.35); addB(1.8, -0.2, 0.65, 0.35);
    const ci = wpt(-W / 2 + 0.8, D / 2 + 0.7); circles.push({ x: ci.x, z: ci.z, r: 0.5 });
    const at = wpt(0, D / 2 - 0.4);   // the counter is served from the doorway: no need to squeeze the camera inside
    interact.push({ kind: 'store', x: at.x, z: at.z, sx: at.x, sz: at.z, r: 3, mark: 2.6 });
    shopAt.deck = deck;
    rooms.push({ x: shopAt.x, z: shopAt.z, c, s: sn, hx: W / 2, hz: D / 2, y: H });
  }

  const worldUpd = [(t) => { shopAt.deck.rotation.y = t * 3.5; }];   // the record on the shop's listening deck
  {
    const glowB = (c, o) => { const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }); m.userData.lin = true; return m; };
    // Brazier fire on the well: flickering flame, embers and a warm light.
    const fireC = lin('#ff8a2a');
    const flames = [0, 1, 2].map((i) => { const m = new THREE.Mesh(new THREE.ConeGeometry(0.55 - i * 0.12, 1.3 + i * 0.25, 7, 1, true), glowB(fireC.clone().multiplyScalar(1.4 + i * 0.5), 0.55)); m.position.y = 3.85 + i * 0.12; scene.add(m); return m; });
    const fireL = new THREE.PointLight(fireC, 2.4, 30, 1.6); fireL.position.set(0, 4.2, 0); scene.add(fireL);
    const EN = 46, epos = new Float32Array(EN * 3), er = rng(505), eseed = Array.from({ length: EN }, () => er());
    const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(epos, 3));
    const embers = new THREE.Points(eg, new THREE.PointsMaterial({ size: 0.09, map: dot(), color: fireC.clone().multiplyScalar(2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    embers.material.userData.lin = true; embers.frustumCulled = false; scene.add(embers);
    // Gas lamps around the plaza: cast-iron post, ladder bar, tapered glass lantern with a small flame.
    const lampIron = mat('#171614', { rough: 0.55, metal: 0.7 }), warm = lin('#ffb766'), gas = [];
    const haloM = () => { const m = new THREE.SpriteMaterial({ map: dot(), color: warm, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }); m.userData.lin = true; return m; };
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 6 + (k * Math.PI) / 3, x = Math.cos(a) * 9.7, z = Math.sin(a) * 9.7, L = new THREE.Group();
      const add = (geo, m, y, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.y = y; o.rotation.y = ry; o.castShadow = m === lampIron; L.add(o); return o; };
      add(new THREE.CylinderGeometry(0.2, 0.27, 0.45, 8), lampIron, 0.225);
      add(new THREE.CylinderGeometry(0.13, 0.2, 0.3, 8), lampIron, 0.6);
      add(new THREE.CylinderGeometry(0.15, 0.15, 0.07, 8), lampIron, 0.78);
      add(new THREE.CylinderGeometry(0.05, 0.085, 2.6, 8), lampIron, 2.1);
      add(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 8), lampIron, 1.25);
      add(new THREE.CylinderGeometry(0.085, 0.085, 0.07, 8), lampIron, 3.12);
      const bar = add(new THREE.BoxGeometry(0.72, 0.035, 0.035), lampIron, 3.2); bar.rotation.y = -a + Math.PI / 2;
      for (const sd of [-1, 1]) { const kn = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), lampIron); kn.position.set(sd * 0.36, 0, 0); bar.add(kn); }
      add(new THREE.CylinderGeometry(0.17, 0.05, 0.2, 4), lampIron, 3.5, Math.PI / 4);                       // cradle
      add(new THREE.CylinderGeometry(0.19, 0.19, 0.03, 4), lampIron, 3.61, Math.PI / 4);                     // lower frame
      add(new THREE.CylinderGeometry(0.26, 0.17, 0.5, 4, 1, true), glowB(warm, 0.3), 3.87, Math.PI / 4);    // glass
      for (let c = 0; c < 4; c++) { const ca = Math.PI / 4 + (c * Math.PI) / 2, rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.52, 4), lampIron); rod.position.set(Math.cos(ca) * 0.215, 3.87, Math.sin(ca) * 0.215); rod.rotation.z = -Math.cos(ca) * 0.17; rod.rotation.x = Math.sin(ca) * 0.17; L.add(rod); }
      add(new THREE.CylinderGeometry(0.29, 0.29, 0.03, 4), lampIron, 4.13, Math.PI / 4);                     // upper frame
      add(new THREE.ConeGeometry(0.33, 0.28, 4), lampIron, 4.28, Math.PI / 4);                               // roof
      add(new THREE.CylinderGeometry(0.035, 0.06, 0.1, 6), lampIron, 4.46);
      add(new THREE.SphereGeometry(0.04, 8, 6), lampIron, 4.54);
      const flame = add(new THREE.SphereGeometry(0.05, 8, 8), glowB(lin('#ffe2b0').multiplyScalar(2.5), 1), 3.82); flame.scale.y = 1.8;
      const halo = new THREE.Sprite(haloM()); halo.scale.set(1.9, 1.9, 1); halo.position.y = 3.87; L.add(halo);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: dot(), color: warm, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }));
      pool.material.userData.lin = true; pool.rotation.x = -Math.PI / 2; pool.position.y = 0.07; L.add(pool);
      L.position.set(x, 0, z); scene.add(L);
      circles.push({ x, z, r: 0.32 });
      gas.push({ flame, halo, pool, s: k * 1.7 });
    }
    // Dust and ash drifting down around the player everywhere.
    const N = 170, BX = 36, BY = 11, base = new Float32Array(N * 3), pos = new Float32Array(N * 3), rr = rng(404);
    for (let i = 0; i < N; i++) base.set([rr() * BX, rr() * BY, rr() * BX], i * 3);
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const motes = new THREE.Points(mg, new THREE.PointsMaterial({ size: 0.07, map: dot(), color: lin('#b9b2a2'), transparent: true, opacity: 0.55, depthWrite: false }));
    motes.material.userData.lin = true; motes.frustumCulled = false; scene.add(motes);
    const wrap = (v, m) => ((v % m) + m) % m;
    worldUpd.push((t) => {
      const fl = 0.8 + 0.2 * Math.sin(t * 11) * Math.sin(t * 7.3) + 0.1 * Math.sin(t * 23);
      flames.forEach((m, i) => { m.scale.set(1 + 0.12 * Math.sin(t * 9 + i * 2), fl * (1 + 0.1 * Math.sin(t * 13 + i)), 1 + 0.12 * Math.cos(t * 8 + i)); m.rotation.y = t * (1 + i); });
      fireL.intensity = 2.1 * fl + 0.5;
      gas.forEach((q) => { const f = 0.85 + 0.1 * Math.sin(t * 9 + q.s) + 0.05 * Math.sin(t * 23 + q.s * 3); q.flame.scale.set(1, 1.8 * f, 1); q.halo.material.opacity = 0.4 * f; q.pool.material.opacity = 0.2 * f; });
      for (let i = 0; i < EN; i++) { const k = (t * (0.25 + eseed[i] * 0.3) + eseed[i] * 7) % 1, a = eseed[i] * 40 + t * 0.6; epos[i * 3] = Math.cos(a) * (0.2 + k * 1.2 * eseed[i]); epos[i * 3 + 1] = 3.9 + k * 4.5; epos[i * 3 + 2] = Math.sin(a) * (0.2 + k * 1.2 * eseed[i]); }
      eg.attributes.position.needsUpdate = true;
      for (let i = 0; i < N; i++) { const j = i * 3;
        pos[j] = P.x + wrap(base[j] + Math.sin(t * 0.4 + i) * 0.6 + t * 0.35 - P.x, BX) - BX / 2;
        pos[j + 1] = wrap(base[j + 1] - t * (0.18 + (i % 5) * 0.05), BY) + 0.1;
        pos[j + 2] = P.z + wrap(base[j + 2] - P.z, BX) - BX / 2; }
      mg.attributes.position.needsUpdate = true;
    });
  }

  // Paths: a smooth ribbon from the plaza edge to each place's entrance.
  function cubic(a, b, c, d, t) { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; }
  // Height of the surface actually drawn at (x, z): hills are faceted meshes, so the analytic height is not enough for a ribbon lying on them.
  scene.updateMatrixWorld(true);
  const dray = new THREE.Raycaster(), dfrom = new THREE.Vector3(), ddown = new THREE.Vector3(0, -1, 0);
  const surfY = (x, z) => { const g0 = groundAt(x, z); if (g0 <= 0) return 0; dray.set(dfrom.set(x, g0 + 3, z), ddown); const hit = dray.intersectObjects(pick, false)[0]; return hit ? Math.max(hit.point.y, 0) : g0; };
  const pathMat = mat('#ffffff', { map: tex('trail', 1, 1), rough: 1 }, true);
  pathMat.transparent = true; pathMat.depthWrite = false; pathMat.polygonOffset = true; pathMat.polygonOffsetFactor = -2;
  function layTrail(draw, o = {}) {   // o: { w: half-width, mat, y: height over the ground, vs: metres per texture repeat }
    const pos = [], uv = [], idx = [], CN = 4;
    let acc = 0;
    draw.forEach((q, i) => {
      const n = draw[Math.min(i + 1, draw.length - 1)], pv = draw[Math.max(i - 1, 0)];
      let tx = n.x - pv.x, tz = n.z - pv.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const w = o.w || 2.2;
      if (i > 0) acc += Math.hypot(q.x - pv.x, q.z - pv.z);
      for (let c = 0; c <= CN; c++) {
        const sd = -1 + (2 * c) / CN, x = q.x - tz * w * sd, z = q.z + tx * w * sd;
        pos.push(x, surfY(x, z) + (o.y || 0.06), z);
        uv.push(o.us ? (sd * w) / o.us : c / CN, acc / (o.vs || 4.4));
      }
      if (i < draw.length - 1) for (let c = 0; c < CN; c++) { const k = i * (CN + 1) + c, k2 = k + CN + 1; idx.push(k, k + 1, k2, k + 1, k2 + 1, k2); }   // counter-clockwise seen from above: the top face is the front
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const ribbon = new THREE.Mesh(geo, o.mat || pathMat);
    ribbon.receiveShadow = true; ribbon.userData.ground = true;
    scene.add(ribbon); pick.push(ribbon);
  }
  places.forEach((p) => {
    const len = Math.hypot(p.x, p.z), ux = p.x / len, uz = p.z / len;
    const a = { x: ux * (PLAZA_R - 0.5), z: uz * (PLAZA_R - 0.5) };
    const [vlx, vlz] = p.vp || [0, 0];   // a place may put its viewpoint (and so its sound) somewhere other than its own origin
    const T = p.trail && p.trail.map(([lx, lz]) => p.toWorld(lx, lz));   // a trail of its own (KEYAKI's, over the hills): to its first bend, then through its bends to the viewpoint
    const e = T ? T[0] : p.toWorld(vlx, p.pathEnd), eIn = T ? { x: e.x - ((T[1].x - e.x) / Math.hypot(T[1].x - e.x, T[1].z - e.z)) * 10, z: e.z - ((T[1].z - e.z) / Math.hypot(T[1].x - e.x, T[1].z - e.z)) * 10 } : p.toWorld(vlx, p.pathEnd + 14);
    const b = { x: a.x + ux * 12, z: a.z + uz * 12 };
    const pts = [];
    const N = 70;
    for (let i = 0; i <= N; i++) { const t = i / N; pts.push({ x: cubic(a.x, b.x, eIn.x, e.x, t), z: cubic(a.z, b.z, eIn.z, e.z, t) }); }
    if (T) for (let k = 0; k < T.length - 1; k++) {   // Catmull-Rom through the bends, a point every 1.2 m or so
      const p0 = T[Math.max(0, k - 1)], p1 = T[k], p2 = T[k + 1], p3 = T[Math.min(T.length - 1, k + 2)], n = Math.ceil(Math.hypot(p2.x - p1.x, p2.z - p1.z) / 1.2);
      const cr = (a0, a1, a2, a3, t) => 0.5 * (2 * a1 + (a2 - a0) * t + (2 * a0 - 5 * a1 + 4 * a2 - a3) * t * t + (3 * a1 - a0 - 3 * a2 + a3) * t * t * t);
      for (let i = 1; i <= n; i++) pts.push({ x: cr(p0.x, p1.x, p2.x, p3.x, i / n), z: cr(p0.z, p1.z, p2.z, p3.z, i / n) });
    } else {   // continue straight to the viewpoint
      const vp = p.toWorld(vlx, vlz), last = pts[pts.length - 1];
      const extra = Math.ceil(Math.hypot(vp.x - last.x, vp.z - last.z) / 1.5);
      for (let i = 1; i <= extra; i++) pts.push({ x: last.x + ((vp.x - last.x) * i) / extra, z: last.z + ((vp.z - last.z) * i) / extra });
    }
    p.path = pts;
    if (p.onHill) { /* laid over the hills once they exist (p.afterHills, below) */ }
    else if (p.road && p.road.own) { /* the place paves its road itself (FLIP's avenue, flush with its own street) */ }
    else if (p.road) {   // a paved road instead of a trail: asphalt, a dashed centre line, and the trees kept further back
      const tr = [{ x: ux * 4.6, z: uz * 4.6 }, { x: ux * 7.5, z: uz * 7.5 }, ...pts.slice(0, N + 1)];   // right up to the fountain's rim
      layTrail(tr, { w: p.road.hw, mat: mat('#2a2830', { map: tex('asphalt', 1, 1), rough: 0.88 }), us: 8, vs: 8, y: 0.065 });
      const dash = (() => { const c = document.createElement('canvas'); c.width = 8; c.height = 64; const g2 = c.getContext('2d'); g2.clearRect(0, 0, 8, 64); g2.fillStyle = '#e8e2d4'; g2.fillRect(0, 0, 8, 34); const tt = new THREE.CanvasTexture(c); tt.wrapS = tt.wrapT = THREE.RepeatWrapping; return tt; })();
      const dm = new THREE.MeshBasicMaterial({ map: dash, transparent: true, alphaTest: 0.5, color: lin('#cfc9bb') }), edgeM = new THREE.MeshBasicMaterial({ color: lin('#cfc9bb') }); dm.userData.lin = edgeM.userData.lin = true;
      layTrail(tr, { w: 0.08, mat: dm, vs: 6, y: 0.075 });
      for (const sd of [-1, 1]) layTrail(tr.map((q, i) => { const n = tr[Math.min(i + 1, tr.length - 1)], pv = tr[Math.max(i - 1, 0)]; let tx = n.x - pv.x, tz = n.z - pv.z; const l = Math.hypot(tx, tz) || 1; return { x: q.x - (tz / l) * sd * (p.road.hw - 0.5), z: q.z + (tx / l) * sd * (p.road.hw - 0.5) }; }), { w: 0.07, mat: edgeM, y: 0.075 });   // edge lines
    } else layTrail(pts.slice(0, N + 1));
  });
  // A loop trail through the woods joins the spokes, so you can walk from one place to the next without going back to the plaza.
  const LOOP_R = 30, LOOP_AT = 1.8, LOOP_DIP = 12, loopPath = [];
  for (let i = 0; i <= 180; i++) { const a = (i / 180) * Math.PI * 2, r = LOOP_R - LOOP_DIP * (1 - smooth(0.12, 0.62, Math.abs(Math.atan2(Math.sin(a - LOOP_AT), Math.cos(a - LOOP_AT))))); loopPath.push({ x: Math.cos(a) * r, z: Math.sin(a) * r }); }   // it swings inside the live house
  layTrail(loopPath);
  function distToPath(x, z, path) { let best = 1e9, bi = 0; for (let i = 0; i < path.length; i++) { const d = Math.hypot(path[i].x - x, path[i].z - z); if (d < best) { best = d; bi = i; } } return { d: best, i: bi }; }

  // ...and the paths, now that they exist.
  places.forEach((p) => {
    if (!p.spill) return;
    for (let i = p.spill.length - 1; i >= 0; i--) {
      const f = p.spill[i], w = p.toWorld(f.x, f.z), r = Math.max(f.w, f.d) / 2 + 4;
      if (places.some((q) => q !== p && distToPath(w.x, w.z, q.path).d < r) || distToPath(w.x, w.z, loopPath).d < r) { f.b.parent.remove(f.b); boxes.splice(boxes.indexOf(f.box), 1); p.spill.splice(i, 1); }
    }
  });
  places.forEach((p) => p.afterSpill && p.afterSpill());

  // The pool hall: a tall brick hall round a pool table three times life size. It needs far more room than the gaps on
  // the plaza's rim, so it goes where there is most: every half-metre cell round the plaza learns how far it is from
  // anything in the way (the walks and roads, the loop, the ring road, whatever is built already, the places themselves),
  // then the hall's footprint is tried at every bearing, distance and a slight turn, its door to the fountain, and the
  // spot with the most room to spare wins; a second, finer pass round that spot settles it to a few centimetres.
  const HALL = { W: 9, D: 12, H: 7, K: 3, TOP: 1.3 };   // K: the table's scale; TOP: the cloth's height, kept low so you see over the rails
  const hallAt = (() => {
    const { W, D } = HALL, CAP = 3, R1 = 38;
    const hyp = (a, b) => Math.sqrt(a * a + b * b);   // Math.hypot is several times slower, and this runs half a million times
    const raster = (X0, Z0, size, G) => {   // how far each cell of a square is from anything in the way (CAP at most); returns a lookup
      const n = Math.round(size / G), free = new Float32Array(n * n).fill(CAP), at = (i, o) => o + (i + 0.5) * G;
      const near = (x, z, r) => x > X0 - r - CAP && x < X0 + size + r + CAP && z > Z0 - r - CAP && z < Z0 + size + r + CAP;
      const paint = (x0, z0, x1, z1, f) => {   // f(x, z): how far a cell is from the thing, for every cell within CAP of its bounds
        const i0 = Math.max(0, Math.floor((x0 - CAP - X0) / G)), i1 = Math.min(n - 1, Math.floor((x1 + CAP - X0) / G)), j0 = Math.max(0, Math.floor((z0 - CAP - Z0) / G)), j1 = Math.min(n - 1, Math.floor((z1 + CAP - Z0) / G));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const d = f(at(i, X0), at(j, Z0)); if (d < free[j * n + i]) free[j * n + i] = d; }
      };
      const seg = (a, b, hw) => { if (!near((a.x + b.x) / 2, (a.z + b.z) / 2, hw + hyp(b.x - a.x, b.z - a.z))) return; const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1e-9; paint(Math.min(a.x, b.x) - hw, Math.min(a.z, b.z) - hw, Math.max(a.x, b.x) + hw, Math.max(a.z, b.z) + hw, (x, z) => { const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / L2, 0, 1); return hyp(x - a.x - t * dx, z - a.z - t * dz) - hw; }); };
      for (const p of places) p.path.forEach((q, k, a) => { if (k) seg(a[k - 1], q, p.road ? p.road.hw : 2.2); });
      loopPath.forEach((q, k, a) => { if (k) seg(a[k - 1], q, 2.2); });
      for (const r of ring.roads) for (let k = 0; k < r.N; k++) { const q = { x: r.X[k], z: r.Z[k] }; seg(q, q, r.HW[k] + 1.5); }   // the deck and its walls, overhead or not
      for (const c of circles) seg(c, c, c.r);
      for (const b of boxes) { const e = hyp(b.hx, b.hz), c = b.c ?? 1, s = b.s ?? 0; if (near(b.x, b.z, e)) paint(b.x - e, b.z - e, b.x + e, b.z + e, (x, z) => { const dx = x - b.x, dz = z - b.z; return hyp(Math.max(0, Math.abs(dx * c - dz * s) - b.hx), Math.max(0, Math.abs(dx * s + dz * c) - b.hz)); }); }
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const k = j * n + i, x = at(i, X0), z = at(j, Z0); free[k] = Math.min(free[k], hyp(x, z) - PLAZA_R - 0.6);
        if (free[k] > 0 && places.some((p) => { const l = p.local(x, z); return p.blocks(l.x, l.z); })) free[k] = -1;
      }
      return (x, z) => { const i = Math.round((x - X0) / G - 0.5), j = Math.round((z - Z0) / G - 0.5); return i < 0 || j < 0 || i >= n || j >= n ? -1e9 : free[j * n + i]; };
    };
    let look = raster(-R1, -R1, 2 * R1, 0.5), us, vs, best = { m: -1e9 };
    const grid = (step) => { us = []; vs = []; for (let u = -W / 2; u <= W / 2 + 1e-6; u += step) us.push(u); for (let v = -D / 2; v <= D / 2 + 1e-6; v += step) vs.push(v); };
    const tryAt = (a, R0, dy) => {   // a: bearing in degrees, R0: distance out, dy: turn off facing the fountain
      const ux = Math.sin((a * Math.PI) / 180), uz = Math.cos((a * Math.PI) / 180), yaw = Math.atan2(-ux, -uz) + dy, c = Math.cos(yaw), s = Math.sin(yaw), x0 = ux * R0, z0 = uz * R0; let m = CAP;
      const at = (u, v) => { m = Math.min(m, look(x0 + u * c + v * s, z0 - u * s + v * c)); return m > best.m; };
      // the walls first: the least room is nearly always there, so most spots are thrown out after a few looks; only a spot
      // that beats the best so far has its whole floor looked at (for anything standing wholly inside it)
      const nu = us.length - 1, nv = vs.length - 1;
      for (let i = 0; i <= nu && m > best.m; i++) at(us[i], vs[0]) && at(us[i], vs[nv]);
      for (let j = 0; j <= nv && m > best.m; j++) at(us[0], vs[j]) && at(us[nu], vs[j]);
      for (let i = 1; i < nu && m > best.m; i++) for (let j = 1; j < nv && m > best.m; j++) at(us[i], vs[j]);
      if (m > best.m) best = { m, x: x0, z: z0, yaw, ux, uz, a, R0, dy };
    };
    grid(0.5);   // the first pass looks at the footprint on the raster's own half-metre spacing
    for (let a = 0; a < 360; a += 2) for (let R0 = PLAZA_R + 1 + D / 2; R0 < R1 - D / 2; R0 += 0.5) for (let k = -4; k <= 4; k++) tryAt(a, R0, k * 0.1);
    const b0 = best; look = raster(b0.x - 10, b0.z - 10, 20, 0.2); grid(0.2); best = { m: -1e9 };   // then a finer look round the best, on a finer grid
    for (let a = -8; a <= 8; a++) for (let r = -8; r <= 8; r++) for (let k = -4; k <= 4; k++) tryAt(b0.a + a / 4, b0.R0 + r / 8, b0.dy + k / 40);
    const c = Math.cos(best.yaw), s = Math.sin(best.yaw);
    best.local = (x, z) => { const dx = x - best.x, dz = z - best.z; return { x: dx * c - dz * s, z: dx * s + dz * c }; };
    best.near = (x, z, m) => { const l = best.local(x, z); return Math.abs(l.x) < W / 2 + m && Math.abs(l.z) < D / 2 + m; };   // for keeping trees and piers out
    if (best.m < 0.1) console.warn(`pool hall: only ${best.m.toFixed(2)} m to spare round it at (${best.x.toFixed(1)}, ${best.z.toFixed(1)}): something moved in; make HALL smaller`);   // below 0 it overlaps
    return best;
  })();
  {
    const { W, D, H, K, TOP: TW } = HALL, SF = 4.2;   // SF: the top of the shopfront; brick above it carries the sign
    const S = new THREE.Group(); S.position.set(hallAt.x, 0, hallAt.z); S.rotation.y = hallAt.yaw;
    const brick = (w, h) => mat('#6e4a3e', { map: tex('brick', Math.round(w / 0.39) / 10, Math.round(h / 0.36) / 10) }), trim = mat('#16171a', { rough: 0.5, metal: 0.3 }), glass = gloss('#0c1013', { rough: 0.06, metal: 0.5, env: 1 });
    const put = (geo, m, x, y, z, P = S) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; P.add(o); return o; };
    put(new THREE.BoxGeometry(W, H, 0.3), brick(W, H), 0, H / 2, -D / 2 + 0.15);
    for (const sd of [-1, 1]) put(new THREE.BoxGeometry(0.3, H, D), brick(D, H), sd * (W / 2 - 0.15), H / 2, 0);
    put(new THREE.BoxGeometry(W + 0.3, 0.35, D + 0.5), trim, 0, H + 0.17, 0.1);
    put(new THREE.BoxGeometry(W, H - SF, 0.3), brick(W, H - SF), 0, (H + SF) / 2, D / 2 - 0.15);   // brick over the shopfront
    put(new THREE.BoxGeometry(W, 0.24, 0.22), trim, 0, SF, D / 2);
    for (const x of [-W / 2 + 0.1, -1.4, 1.4, W / 2 - 0.1]) put(new THREE.BoxGeometry(0.14, SF, 0.16), trim, x, SF / 2, D / 2);
    const pw = W / 2 - 1.5, px = (1.4 + W / 2 - 0.1) / 2;   // a tall window either side of the open door, on a low riser
    for (const sd of [-1, 1]) { put(new THREE.BoxGeometry(pw, SF - 0.75, 0.04), glass, sd * px, 0.6 + (SF - 0.75) / 2, D / 2 - 0.02); put(new THREE.BoxGeometry(pw, 0.6, 0.12), trim, sd * px, 0.3, D / 2); }
    put(new THREE.BoxGeometry(W - 0.3, 0.06, D - 0.3), mat('#2a2420', { rough: 0.8 }), 0, 0.03, 0);
    // The table. What sits on the physics' metres (cloth, cushions, rails, pockets, balls, the lamp, and the cue and aim
    // line added in "pool" below) is built life size in its own group, turned to run down the hall and scaled up K times;
    // the body under it is built to measure, so the cloth stands at TW. The head (where the cue ball starts) is by the door.
    const TX = 0, TZ = -0.2, TOP = 0.88, felt = mat('#1d6a50', { rough: 0.95 }), wood = mat('#4a2a1a', { rough: 0.55 }), PS = SW.PoolSim;
    const TG = new THREE.Group(); TG.position.set(TX, TW - TOP * K, TZ); TG.rotation.y = Math.PI / 2; TG.scale.setScalar(K); S.add(TG);
    put(new THREE.BoxGeometry(2.5, 0.12, 1.3), felt, 0, 0.82, 0, TG);
    for (const [x, z, w, d] of [[0, -0.72, 2.7, 0.14], [0, 0.72, 2.7, 0.14], [-1.32, 0, 0.14, 1.58], [1.32, 0, 0.14, 1.58]]) put(new THREE.BoxGeometry(w, 0.16, d), wood, x, 0.9, z, TG);
    // the cushions, where the physics bounces the balls, stopping short of each pocket's mouth as it does
    const cush = mat('#17573f', { rough: 0.9 }), gapC = 0.072 + PS.R * 1.6, gapM = 0.062 + PS.R * 1.6;
    for (const sd of [-1, 1]) {
      for (const h of [-1, 1]) { const x0 = h * (gapM), x1 = h * (PS.L / 2 - gapC); put(new THREE.BoxGeometry(Math.abs(x1 - x0), 0.04, 0.65 - PS.W / 2), cush, (x0 + x1) / 2, TOP + 0.02, sd * (PS.W / 4 + 0.325), TG); }
      put(new THREE.BoxGeometry(1.25 - PS.L / 2, 0.04, PS.W - 2 * gapC), cush, sd * (PS.L / 4 + 0.625), TOP + 0.02, 0, TG);
    }
    const pearl = basic('#efe6cf'), dia = new THREE.CircleGeometry(0.009, 10);   // the sights on the rails
    for (const sd of [-1, 1]) {
      for (const x of [-3, -2, -1, 1, 2, 3]) { const m = new THREE.Mesh(dia, pearl); m.rotation.x = -Math.PI / 2; m.position.set((x * PS.L) / 8, 0.981, sd * 0.72); TG.add(m); }
      for (const z of [-1, 0, 1]) { const m = new THREE.Mesh(dia, pearl); m.rotation.x = -Math.PI / 2; m.position.set(sd * 1.32, 0.981, (z * PS.W) / 4); TG.add(m); }
    }
    put(new THREE.BoxGeometry(0.022, 0.022, 0.022), mat('#2f6fd0', { rough: 0.9 }), 1.31, 0.991, 0.71, TG);   // a cube of chalk on the corner
    const bodyH = TW - 0.12 * K - 0.62;   // the frame under the slate, on six squat turned legs
    put(new THREE.BoxGeometry(1.1 * K, bodyH, 2.3 * K), wood, TX, 0.62 + bodyH / 2, TZ);
    put(new THREE.BoxGeometry(1.1 * K + 0.12, 0.1, 2.3 * K + 0.12), wood, TX, 0.62, TZ);
    for (const x of [-1, 1]) for (const z of [-1, 0, 1]) { put(new THREE.CylinderGeometry(0.26, 0.2, 0.6, 12), wood, TX + x * 1.35, 0.3, TZ + z * 3.1); put(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 12), wood, TX + x * 1.35, 0.5, TZ + z * 3.1); }
    // the balls are real: the table is played where it stands (see "pool" below). Numbered balls, painted on canvas.
    const ballTex = (n) => { const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d'), col = PS.colOf(n);
      x.fillStyle = n > 8 ? '#f4f1e6' : col; x.fillRect(0, 0, 128, 64); if (n > 8) { x.fillStyle = col; x.fillRect(0, 18, 128, 28); }
      if (n) for (const cx of [32, 96]) { x.fillStyle = '#f4f1e6'; x.beginPath(); x.ellipse(cx, 32, 9, 12, 0, 0, 7); x.fill(); x.fillStyle = '#111'; x.font = '700 15px Hind, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(n), cx, 33); }
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; };
    const ballGeo = new THREE.SphereGeometry(PS.R, 24, 16), state = PS.rack();
    const meshes = state.balls.map((b) => { const m = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ map: ballTex(b.n), roughness: 0.18, metalness: 0 })); m.material.userData.lin = true; m.castShadow = true; TG.add(m); return m; });
    for (const [px2, pz, pr] of PS.POCK) { const pk = new THREE.Mesh(new THREE.CircleGeometry(pr * 0.95, 18), mat('#070707', { rough: 1 })); pk.rotation.x = -Math.PI / 2; pk.position.set(px2, TOP + 0.002, pz); TG.add(pk); }
    const IX = W / 2 - 0.65, IZ = D / 2 - 0.65;   // how far in from the walls a camera may go
    hallAt.table = { S, G: TG, K, TOP, state, meshes, inside: (lx, lz) => Math.abs(TX + K * lz) < IX && Math.abs(TZ - K * lx) < IZ,   // inside: a table-local point, kept off the walls
      rack() { this.state = PS.rack(); meshes.forEach((m) => m.quaternion.identity()); hallAt.syncBalls(); },   // a fresh rack is a new state object: everything reads table.state, never a copy of it
      walls: [(TZ - D / 2 + 0.3) / K, (TZ + D / 2 - 0.3) / K, (-W / 2 + 0.3 - TX) / K, (W / 2 - 0.3 - TX) / K] };   // the hall's inner faces in table units (x0, x1, z0, z1), for the cue
    hallAt.syncBalls = () => { hallAt.table.state.balls.forEach((b, i) => { const m = meshes[i]; if (b.in) { if (b.dropT === undefined) b.dropT = 0; m.visible = b.dropT < 0.6; m.position.set(b.px, TOP + PS.R - b.dropT * 0.25, b.pz); return; } b.dropT = undefined; m.visible = true; m.position.set(b.x, TOP + PS.R, b.z); }); };
    hallAt.syncBalls();
    for (const z of [-1.2, -0.8]) { const cueS = put(new THREE.CylinderGeometry(0.012 * K, 0.02 * K, 1.45 * K, 8), mat('#c9a06a', { rough: 0.5 }), -W / 2 + 0.45, 0.725 * K, z); cueS.rotation.z = 0.035; }   // two of its cues stood against the wall
    // the lamp over it: a long green shade glowing underneath, hung from the roof on two rods
    const lampM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe7b8').convertSRGBToLinear().multiplyScalar(1.4) }); lampM.userData.lin = true;
    put(new THREE.BoxGeometry(1.6, 0.18, 0.5), mat('#1f5a40', { rough: 0.5 }), 0, 2.25, 0, TG); put(new THREE.BoxGeometry(1.5, 0.04, 0.42), lampM, 0, 2.15, 0, TG);
    const lampTop = TW + (2.34 - TOP) * K;
    for (const sd of [-1, 1]) put(new THREE.CylinderGeometry(0.03, 0.03, H - lampTop, 6), trim, TX, (H + lampTop) / 2, TZ + sd * 0.6 * K);
    const tl = new THREE.PointLight(lin('#ffe2b0'), 1.8, 7 * K, 1.6); tl.position.set(TX, TW + (2.0 - TOP) * K, TZ); S.add(tl);   // the hall's one light: every light costs every lit surface in the world
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(W - 1.2, 1.1), new THREE.MeshBasicMaterial({ map: textTex('POOL · BILLIARDS', { w: 1024, h: 140, font: '700 74px "Hind",sans-serif', color: '#c8ffe0', glow: '#4fff9a' }), transparent: true, depthWrite: false }));
    sign.position.set(0, (H + SF) / 2 + 0.1, D / 2 + 0.03); S.add(sign);
    scene.add(S);
    const c = Math.cos(hallAt.yaw), sn = Math.sin(hallAt.yaw), wpt = (lx, lz) => ({ x: hallAt.x + lx * c + lz * sn, z: hallAt.z - lx * sn + lz * c });
    const addB = (lx, lz, hx, hz, o) => { const w = wpt(lx, lz), b = { x: w.x, z: w.z, hx, hz, c, s: sn, ...o }; boxes.push(b); return b; };
    addB(0, -D / 2 + 0.15, W / 2, 0.2); addB(-W / 2 + 0.15, 0, 0.2, D / 2); addB(W / 2 - 0.15, 0, 0.2, D / 2);
    addB(-(1.4 + W / 2) / 2, D / 2, (W / 2 - 1.4) / 2, 0.15); addB((1.4 + W / 2) / 2, D / 2, (W / 2 - 1.4) / 2, 0.15);   // the shopfront, with the door between
    addB(-W / 2 + 0.45, -1.0, 0.16, 0.3, { noCam: true });   // the feet of the cues against the wall
    const tb = addB(TX, TZ, 0.79 * K, 1.39 * K, { noCam: true });   // the table stops you, but the camera may pass over it...
    lids.push({ ...tb, y: TW + 0.1 * K + 0.4 });   // ...keeping above its rails
    const at = wpt(0, D / 2 - 1.0);   // just inside the door, at the head of the table
    interact.push({ kind: 'pool', x: at.x, z: at.z, sx: at.x, sz: at.z, r: 3, mark: 2.6 });
    rooms.push({ x: hallAt.x, z: hallAt.z, c, s: sn, hx: W / 2, hz: D / 2, y: H });
    hallAt.door = wpt(0, D / 2 + 1.5);
    // a short walk over from the plaza, straight out of the door along the hall's own axis (so walking up it takes you in
    // square to the door) until it meets the plaza's rim
    const dw = wpt(0, D / 2 + 0.2), ox = sn, oz = c, pb = dw.x * ox + dw.z * oz, pr = PLAZA_R - 0.3, pt = -pb - Math.sqrt(Math.max(0, pb * pb - (dw.x * dw.x + dw.z * dw.z - pr * pr)));
    const rim = { x: dw.x + ox * pt, z: dw.z + oz * pt };
    layTrail([dw, { x: (rim.x + dw.x) / 2, z: (rim.z + dw.z) / 2 }, rim], { w: 1.5 });
  }

  street = SW.Street ? SW.Street.make(ring, places) : null;
  pass = SW.Pass ? SW.Pass.make(ring, places) : null;   // the mountain behind NO JOBB: its heights and its road (built below, with the street)
  if (street) {   // the ground roads cut through the crater wall to the car park: whatever stood across their way at ground level goes
    const inWay = (o) => (o.y0 === undefined || o.y0 < 2) && street.lines.some((L) => L.y < 2 && Math.hypot(L.x - o.x, L.z - o.z) < L.hw + 0.6);
    for (let i = boxes.length - 1; i >= 0; i--) if (inWay(boxes[i])) boxes.splice(i, 1);
    for (let i = circles.length - 1; i >= 0; i--) if (inWay(circles[i])) circles.splice(i, 1);
  }

  /* ================= ring road ================= */
  const ringView = SW.Ring.build(ring, E, {
    blocked: (x, z) => Math.hypot(x, z) < PLAZA_R + 4 || (!!street && street.pier(x, z)) || (!!pass && pass.pier(x, z)) || Math.hypot(x - shopAt.x, z - shopAt.z) < 6 || hallAt.near(x, z, 2) || distToPath(x, z, loopPath).d < 4 || places.some((p) => { if (distToPath(x, z, p.path).d < 4) return true; if (!p.noPier) return false; const l = p.local(x, z); return p.noPier(l.x, l.z); }),   // no pier in a place's way, on a path or in the plaza
    noLamp: (x, z) => !!pass && !Number.isNaN(pass.tunAt(x, z)),   // under the mountain the tunnel's own lights take over
    keepOut: (x, z) => (!!pass && pass.keep(x, z)) || places.some((p) => { const l = p.local(x, z); return p.blocks(l.x, l.z); }),
    // nor up through a building or a parked bus: a collider box that big, standing below the pier's top (a pier may stand
    // among the thin ones: rails, kerbs, benches set round it)
    solid: (x, z, r, top) => boxes.some((b) => { if (Math.min(b.hx, b.hz) < 1.2 || (b.y0 ?? -1e9) > top || (b.y1 ?? 1e9) < 0.3) return false; const dx = x - b.x, dz = z - b.z; return Math.abs(dx * b.c - dz * b.s) < b.hx + r && Math.abs(dx * b.s + dz * b.c) < b.hz + r; }),
  });
  scene.add(ringView.group);
  ringView.piers.forEach((q) => circles.push({ x: q.x, z: q.z, r: q.r, y1: q.y1 }));

  // Hills: OHH's hill runs on north, then north-east towards the funfair, as a chain of grassy rolling hills, and
  // between them KEYAKI's mountain rises higher and runs on east to the funfair's edge. They sink to nothing at every
  // path (the paths pass through in cuttings), at the ring road and its ramps, at the plaza and the loop, and round
  // every other place, so nothing that stands on flat ground ends up buried. A place that lives on the hills (p.onHill:
  // KEYAKI's trail climbs over them) keeps them; one with an edge (p.rim, the funfair) has them come right up to it.
  // A place can add relief of its own (p.relief: the crater wall round the funfair). That rock is not cut back from the
  // roads the way the hills are: the elevated roads fly over it, so it only keeps under each deck (4.5 m below it,
  // rising 1.6 m per metre out from the deck's edge); paths to places on its floor come in through its own tunnels
  // (p.bore), any other path runs in a narrow gorge along it, the rock rising sheer from the path's edge. It is drawn in dark rock instead of grass.
  {
    const BLOBS = [[-84, -48, 12, 14], [-78, -66, 10, 12], [-60, -80, 13, 13], [-44, -82, 12, 12], [-28, -84, 9, 10]];   // crests: north of OHH inside the ring road, then north-east towards the funfair; outside the ring road is OHH's coast, which the hills stay off
    const PEAKS = [[-50, -70, 15, 16], [-40, -53, 7, 10], [-33, -44, 4, 9], [-36, -64, 8, 11], [-27, -61, 11, 10], [-19, -51, 7, 7], [-69, -58, 8, 10], [-87, -45, 3, 6], [-33, -88, 9, 7]];   // KEYAKI's mountain (its summit, the spur its trail climbs from the plaza side), the ridge on east and two knolls against the funfair's south-west corner, piled on top; the last three keep OHH's canal buried (a saddle west of the mountain, a knoll north of OHH, the mountain's foot by SHOT's way)
    // The coast range: from KEYAKI's mountain the hills climb on west and north-west to the coast, highest just behind
    // OHH's northern beach. Unlike the crests above it is not cut back from the ring road: the road flies over it on its
    // piers, and the range only keeps under the deck (like the crater rock, deckCap). It stays off the sand (OHH's
    // hillMask), and keeps low in the line KEYAKI's lookout looks along, so the sea is still seen from the summit.
    const COAST = [[-66, -96, 22, 10], [-80, -104, 20, 9], [-62, -128, 34, 12], [-78, -136, 50, 13], [-96, -138, 60, 12], [-108, -126, 46, 10], [-112, -148, 40, 11], [-94, -86, 18, 8]];   // up from KEYAKI's north-west flank, a saddle under the ring road, then the high ground behind the north-west beach
    const keyP = places.find((q) => q.song.scene === 'keyaki'), KV = keyP ? keyP.toWorld(...(keyP.vp || [0, 0])) : null, KVD = [-0.966, -0.259];
    const X0 = -176, X1 = 92, Z0 = -176, Z1 = -18, D = 2, nx = Math.round((X1 - X0) / D) + 1, nz = Math.round((Z1 - Z0) / D) + 1, h = new Float32Array(nx * nz), rk = new Float32Array(nx * nz);
    const ohh = places.find((q) => q.song.scene === 'ohh'), others = places.filter((q) => q !== ohh);
    places.forEach((q) => { q.vpW = q.toWorld(...(q.vp || [0, 0])); });   // where each one is viewed from (p.vx is set later)
    const dirs = [[0, 0]]; for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; dirs.push([Math.cos(a) * 7, Math.sin(a) * 7], [Math.cos(a) * 14, Math.sin(a) * 14]); }
    const reliefs = places.filter((q) => q.relief), RO = { rock: 0 }, carvers = places.filter((q) => q.carve);   // carve: a cutting a place digs through the hills and the rock alike (OHH's canal where it runs in the open)
    const inside = (p, q) => { if (!p.rim) return false; const l = p.local(q.vpW.x, q.vpW.z); return p.rim(l.x, l.z) < 0; };   // its viewpoint is on p's floor: its path comes in by p's tunnel
    const decks = ring.roads.filter((r) => r.X && r.N).map((r) => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let i = 0; i < r.N; i++) { x0 = Math.min(x0, r.X[i]); x1 = Math.max(x1, r.X[i]); z0 = Math.min(z0, r.Z[i]); z1 = Math.max(z1, r.Z[i]); } return { r, x0: x0 - 30, x1: x1 + 30, z0: z0 - 30, z1: z1 + 30 }; });
    const deckCap = (x, z) => {   // how high rock may stand here and still clear every elevated road
      let cap = 1e9;
      for (const { r, x0, x1, z0, z1 } of decks) {
        if (x < x0 || x > x1 || z < z0 || z > z1) continue;
        for (let i = 0; i < r.N; i += 2) { const dx = r.X[i] - x, dz = r.Z[i] - z; if (Math.abs(dx) > 28 || Math.abs(dz) > 28) continue; cap = Math.min(cap, r.Y[i] - 4.5 + Math.max(0, Math.hypot(dx, dz) - r.HW[i] - 1.5) * 1.6); }
      }
      return cap;
    };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = X0 + i * D, z = Z0 + j * D;
      let H = 0, M = 0; for (const [bx, bz, bh, br] of BLOBS) { const q = ((x - bx) ** 2 + (z - bz) ** 2) / (br * br); if (q < 9) H += bh * Math.exp(-q * 1.6); }
      for (const [bx, bz, bh, br] of PEAKS) { const q = ((x - bx) ** 2 + (z - bz) ** 2) / (br * br); if (q < 9) M += bh * Math.exp(-q * 1.6); }
      let R = 0, Rk = 0, own = null; for (const p of reliefs) { const l = p.local(x, z), v = p.relief(l.x, l.z, RO); if (v > R) { R = v; Rk = RO.rock; own = p; } }
      let C = 0; for (const [bx, bz, bh, br] of COAST) { const q = ((x - bx) ** 2 + (z - bz) ** 2) / (br * br); if (q < 9) C += bh * Math.exp(-q * 1.6); }
      if (H + M < 0.05 && R <= 0 && C < 0.05) continue;
      if (H + M >= 0.05) {
        H = (16 * (1 - Math.exp(-H / 16)) + 24 * (1 - Math.exp(-M / 24))) * (1 + 0.12 * Math.sin(x * 0.21 + z * 0.07) * Math.cos(z * 0.17 - x * 0.05));   // soft-capped, with a little unevenness
        let m = smooth(PLAZA_R + 26, PLAZA_R + 44, Math.hypot(x, z)) * smooth(5, 16, distToPath(x, z, loopPath).d) * smooth(9, 21, ring.dist(x, z));
        m *= smooth(8, 18, Math.hypot(x - shopAt.x, z - shopAt.z)) * smooth(10, 20, Math.hypot(x - hallAt.x, z - hallAt.z));
        for (const p of places) { if (m <= 0) break; if (p.onHill) continue; const hw = p.road ? p.road.hw : 1.6; m *= smooth(hw + 1.2, hw + 11, distToPath(x, z, p.path).d); }
        for (const p of others) {
          if (m <= 0) break;
          if (p.onHill || Math.hypot(x - p.x, z - p.z) > 140) continue;
          if (p.rim) { const l = p.local(x, z); m *= smooth(1.5, 7, p.rim(l.x, l.z)); continue; }   // the hills rise from its edge (from 1.5 m out, so no slope reaches in over it): its own ground stays flat
          m *= smooth((p.clearR || 8) + 2, (p.clearR || 8) + 14, Math.hypot(x - p.vpW.x, z - p.vpW.z));
          const core = coreOf(p); let hit = 1;
          for (let k = 0; k < dirs.length; k++) { const l = p.local(x + dirs[k][0], z + dirs[k][1]); if (core(l.x, l.z)) { hit = Math.min(hit, k === 0 ? 0 : k % 2 ? 0.3 : 0.8); if (!hit) break; } }
          m *= hit;
        }
        for (const p of carvers) { if (m <= 0) break; const l = p.local(x, z); m *= p.carve(l.x, l.z); }
        if (street && m > 0) m *= street.mask(x, z);   // cut away along the street under the viaduct and round its shops
        H *= m;
      } else H = 0;
      if (R > 0) {   // the relief: kept clear of the plaza, the loop, other places and their paths (a narrow gorge), and below the decks
        let m = smooth(PLAZA_R + 16, PLAZA_R + 26, Math.hypot(x, z)) * smooth(4, 8, distToPath(x, z, loopPath).d);
        for (const p of places) { if (m <= 0) break; if (p === own || p.onHill || inside(own, p)) continue; const hw = p.road ? p.road.hw : 1.6; m *= smooth(hw + 0.4, hw + 1.4, distToPath(x, z, p.path).d); const l = p.local(x, z); if (coreOf(p)(l.x, l.z)) m = 0; }
        for (const p of carvers) { if (m <= 0) break; const l = p.local(x, z); m *= p.carve(l.x, l.z); }
        if (street && m > 0) m *= street.mask(x, z);
        R = Math.min(R * m, Math.max(0, deckCap(x, z)));
      }
      if (C >= 0.05) {   // the coast range: masked like the crests, except at the ring road, where it keeps under the deck instead
        C = 36 * (1 - Math.exp(-C / 36)) * (1 + 0.1 * Math.sin(x * 0.19 - z * 0.08) * Math.cos(z * 0.15 + x * 0.06));
        let m = smooth(PLAZA_R + 26, PLAZA_R + 44, Math.hypot(x, z)) * smooth(5, 16, distToPath(x, z, loopPath).d);
        for (const p of places) { if (m <= 0) break; if (p.onHill) continue; const hw = p.road ? p.road.hw : 1.6; m *= smooth(hw + 1.2, hw + 11, distToPath(x, z, p.path).d); }
        for (const p of others) { if (m <= 0) break; if (p.onHill || p.rim || Math.hypot(x - p.x, z - p.z) > 140) continue; m *= smooth((p.clearR || 8) + 2, (p.clearR || 8) + 14, Math.hypot(x - p.vpW.x, z - p.vpW.z)); const l = p.local(x, z); if (Math.hypot(x - p.x, z - p.z) < 50 && coreOf(p)(l.x, l.z)) m = 0; }   // (a place's core only near it: SHOT's reaches out along the whole expressway)
        for (const p of carvers) { if (m <= 0) break; const l = p.local(x, z); m *= p.carve(l.x, l.z); }
        if (street && m > 0) m *= street.mask(x, z);
        C = Math.min(C * m, Math.max(0, deckCap(x, z) + 1));
        if (KV) { const dx = x - KV.x, dz = z - KV.z, d = Math.hypot(dx, dz), a = d > 1 ? (dx * KVD[0] + dz * KVD[1]) / d : 0; if (d > 18) C = Math.min(C, 13 + 30 * smooth(0.93, 0.85, a)); }   // the lookout's line of sight to the sea
        H = Math.max(H, C);
      }
      if (H > 0 && ohh && ohh.hillMask) { const l = ohh.local(x, z); H *= ohh.hillMask(l.x, l.z); }   // OHH's coast: the hills come down behind its beaches, never over the sand, the harbour or the sea
      h[j * nx + i] = Math.max(H, R); rk[j * nx + i] = R > H ? Rk : 0;
    }
    hillField = { x0: X0, z0: Z0, d: D, nx, nz, h, rk };
    // the mesh: one grid over the whole field, its flat parts tucked just under the ground
    const geo = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, nx - 1, nz - 1); geo.rotateX(-Math.PI / 2);
    const pa = geo.attributes.position, rkv = new Float32Array(pa.count);
    for (let k = 0; k < pa.count; k++) { const x = pa.getX(k) + (X0 + X1) / 2, z = pa.getZ(k) + (Z0 + Z1) / 2, hh = hillAt(x, z); pa.setXYZ(k, x, hh > 0.03 ? hh : -0.35, z); rkv[k] = rk[Math.round((z - Z0) / D) * nx + Math.round((x - X0) / D)]; }
    geo.setAttribute('rk', new THREE.BufferAttribute(rkv, 1));
    geo.computeVertexNormals();
    { const holes = places.filter((q) => q.holeAt), ix = geo.index.array, tri = new Array(9);   // tunnel mouths: drop the faces that would hang across them (normals stay as they were, so the rest stays smooth); y is a face's lowest corner, so no sliver from the cutting up to the rock is left across a mouth
      // tri: the face's corners in the place's frame (x, y, z three times), for a place that drops whatever stands in its tunnels (OHH's canal)
      const faceIn = (q, t, cx, cy, cz) => { const l = q.local(cx, cz); if (q.holeAt.length > 3) for (let k = 0; k < 3; k++) { const v = ix[t + k], m = q.local(pa.getX(v), pa.getZ(v)); tri[k * 3] = m.x; tri[k * 3 + 1] = pa.getY(v); tri[k * 3 + 2] = m.z; } return q.holeAt(l.x, l.z, cy, tri); };
      if (holes.length) { const keep = []; for (let t = 0; t < ix.length; t += 3) { let cx = 0, cy = 1e9, cz = 0; for (let k = 0; k < 3; k++) { cx += pa.getX(ix[t + k]) / 3; cy = Math.min(cy, pa.getY(ix[t + k])); cz += pa.getZ(ix[t + k]) / 3; } if (holes.some((q) => faceIn(q, t, cx, cy, cz))) continue; keep.push(ix[t], ix[t + 1], ix[t + 2]); } geo.setIndex(keep); } }
    const hmat = mat('#b8c4b2', { map: tex('grass', 44, 27), rough: 0.9 }, true), rockT = tex('rock', 1, 1);
    hmat.onBeforeCompile = (sh) => {   // where the relief is (attribute rk), dark volcanic rock projected from the three axes instead of the grass
      rimPatch(sh); sh.uniforms.rockMap = { value: rockT }; sh.uniforms.rockC = { value: lin('#55504c') };
      sh.vertexShader = 'attribute float rk;varying float vRk;varying vec3 vWp;varying vec3 vWn;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRk=rk;vWp=(modelMatrix*vec4(transformed,1.)).xyz;vWn=normalize(mat3(modelMatrix)*objectNormal);');
      sh.fragmentShader = 'uniform sampler2D rockMap;uniform vec3 rockC;varying float vRk;varying vec3 vWp;varying vec3 vWn;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n{float hn=sin(vWp.x*.13+sin(vWp.z*.07)*2.)*.9+sin(vWp.z*.11-vWp.x*.05)*.7;float y=vWp.y+hn;float st=clamp(1.-normalize(vWn).y,0.,1.); float bd=fract(y*.42);vec3 s1=vec3(.56,.58,.63),s2=vec3(.72,.74,.77),s3=vec3(.5,.52,.57),s4=vec3(.82,.84,.86); vec3 strata=bd<.25?s1:bd<.5?mix(s2,s1,.25):bd<.72?s3:s4;strata*=.86+.14*sin(y*7.3); vec3 low=diffuseColor.rgb*vec3(.9,.98,.94);float rockAmt=clamp(smoothstep(1.2,6.,y)+smoothstep(.25,.55,st),0.,1.); vec3 col=mix(low,strata*(.85+.3*diffuseColor.g),rockAmt);col=mix(col,vec3(1.02,1.03,1.06),smoothstep(17.,22.,y)*(1.-smoothstep(.45,.75,st))); diffuseColor.rgb=col;} if(vRk>.01){vec3 bw=pow(abs(normalize(vWn)),vec3(4.));bw/=bw.x+bw.y+bw.z;vec3 rc=mapTexelToLinear(texture2D(rockMap,vWp.zy*.09)).rgb*bw.x+mapTexelToLinear(texture2D(rockMap,vWp.xz*.09)).rgb*bw.y+mapTexelToLinear(texture2D(rockMap,vWp.xy*.09)).rgb*bw.z;rc*=rockC*(1.3+.45*sin(vWp.y*1.3+vWp.x*.2));diffuseColor.rgb=mix(diffuseColor.rgb,rc,clamp(vRk,0.,1.));}');
    };
    const hm = new THREE.Mesh(geo, hmat);
    hm.receiveShadow = true; hm.castShadow = false; hm.name = 'hills'; scene.add(hm);
    hm.userData.ground = true; pick.push(hm); hm.updateMatrixWorld(true);   // click to walk up a slope; trails laid from here on drape over it
    // the map: the hills drawn once, in shades of green (the relief's rock in grey-brown), under everything else
    const hc = document.createElement('canvas'); hc.width = hc.height = 300; const hg = hc.getContext('2d');
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const v = h[j * nx + i], q = rk[j * nx + i]; if (v < 0.6) continue; hg.fillStyle = q > 0.5 ? `rgba(${58 + v * 3},${52 + v * 2.6},${48 + v * 2.2},${Math.min(0.9, 0.35 + v / 12)})` : `rgba(${70 + v * 3},${92 + v * 4},${58 + v * 2},${Math.min(0.85, 0.25 + v / 14)})`; hg.fillRect(X0 + i * D + 150 - D / 2, Z0 + j * D + 150 - D / 2, D + 0.4, D + 0.4); }
    hillField.mapCanvas = hc;
  }
  // A place that lives on the hills (KEYAKI) lays its trail over them now they exist, and dresses it on groundAt.
  places.forEach((p) => p.afterHills && p.afterHills({ groundAt, layTrail, path: p.path, boxes, circles }));   // boxes / circles: every collider so far (OHH's canal lifts those standing on the hill over it out of its way)

  // Scrub: the hills keep only copses of trees, so their open slopes are dotted with low bushes and stones instead
  // (from KEYAKI's lookout, in the golden light, bare grass read as sand dunes). Low enough to be in nobody's view, they
  // keep off only what a place marks p.scrubOut (else its p.blocks): KEYAKI's view and OHH's sea side, where no tree may
  // stand, still get them. A few instanced draws, from an rng of their own so no tree moves.
  {
    const r = rng(97), bush = [[], [], []], stones = [], F = hillField;
    const rockAt = (x, z) => { const i = Math.round((x - F.x0) / F.d), j = Math.round((z - F.z0) / F.d); return i < 0 || j < 0 || i >= F.nx || j >= F.nz ? 1 : F.rk[j * F.nx + i]; };
    const ok = (x, z) => {
      if (Math.abs(x) > 145 || Math.abs(z) > 145 || (!!street && street.clear(x, z, 1.5)) || Math.hypot(x, z) < PLAZA_R + 5 || ring.dist(x, z) < 11 || distToPath(x, z, loopPath).d < 4) return false;
      for (const p of places) { if (Math.hypot(x - p.x, z - p.z) < p.clearR) return false; const l = p.local(x, z); if ((p.scrubOut || p.blocks)(l.x, l.z)) return false; if (distToPath(x, z, p.path).d < (p.road ? p.road.hw + 2 : 2.6)) return false; }
      return true;
    };
    for (let i = 0; i < 14000 && bush[0].length + bush[1].length + bush[2].length + stones.length < 900; i++) {
      const x = F.x0 + r() * (F.nx - 1) * F.d, z = F.z0 + r() * (F.nz - 1) * F.d, h = hillAt(x, z), k = r(), s = r();
      if (h < 1.5 || rockAt(x, z) > 0.3 || !ok(x, z)) continue;
      if (k < 0.2) stones.push([x, h - 0.12, z, 0.3 + s * 0.5]); else bush[k < 0.5 ? 0 : k < 0.8 ? 1 : 2].push([x, h + 0.05, z, 0.45 + s * 0.6]);
    }
    const o3 = new THREE.Object3D(), put = (geo, m, list, sy) => { const im = new THREE.InstancedMesh(geo, m, list.length); list.forEach(([x, y, z, s], k) => { o3.position.set(x, y, z); o3.rotation.set(0, k * 2.4, 0); o3.scale.set(s * 1.25, s * sy, s); o3.updateMatrix(); im.setMatrixAt(k, o3.matrix); }); im.receiveShadow = true; scene.add(im); };
    const ico = new THREE.IcosahedronGeometry(1, 0);
    ['#5d6a40', '#6e7444', '#80784a'].forEach((c, k) => put(ico, mat(c, { flat: true, rough: 1 }), bush[k], 0.6));
    put(rockGeo(5, true), mat('#8a8272', { map: tex('rock', 1, 1), rough: 0.95 }), stones, 0.65);
  }

  // Trees: everywhere that isn't a path, the plaza or a place.
  {
    const r = rng(99), spots = [];
    const ok = (x, z) => {
      if ((!!street && street.clear(x, z, 2.5)) || (!!pass && (pass.ground(x, z) > 0.4 || pass.clear(x, z, 2.5))) || Math.hypot(x, z) < PLAZA_R + 5 || Math.hypot(x - shopAt.x, z - shopAt.z) < 6 || hallAt.near(x, z, 2.5) || ring.dist(x, z) < 13 || distToPath(x, z, loopPath).d < 4.5) return false;   // nothing grows up through the ring road
      for (const p of places) {
        if (Math.hypot(x - p.x, z - p.z) < p.clearR) return false;
        const l = p.local(x, z); if (p.blocks(l.x, l.z)) return false;
        if (distToPath(x, z, p.path).d < (p.road ? p.road.hw + 2.5 : 4.5)) return false;
      }
      return true;
    };
    const woods = (x, z) => places.some((p) => p.onHill && distToPath(x, z, p.path).d < 26);   // ...but a trail over them climbs through woods
    const rockAt = (x, z) => { const F = hillField, i = Math.round((x - F.x0) / F.d), j = Math.round((z - F.z0) / F.d); return i < 0 || j < 0 || i >= F.nx || j >= F.nz ? 0 : F.rk[j * F.nx + i]; };
    for (let i = 0; i < 9000 && spots.length < 1500; i++) { const x = (r() - 0.5) * 290, z = (r() - 0.5) * 290; if (ok(x, z) && rockAt(x, z) < 0.7 && !(hillAt(x, z) > 1.5 && r() < (woods(x, z) ? 0.3 : rockAt(x, z) > 0.4 ? 0.96 : 0.85))) spots.push([x, z, 0.8 + r() * 0.7]); }   // the hills keep only copses: open grass between
    for (let i = 0; i < 240; i++) { const t = (i / 240) * 4, sd = Math.floor(t), f = (t % 1) * 304 - 152; const x = sd === 0 ? f : sd === 1 ? 152 : sd === 2 ? -f : -152, z = sd === 0 ? -152 : sd === 1 ? f : sd === 2 ? 152 : -f; if (places.some((p) => { const l = p.local(x, z); return p.blocks(l.x, l.z); })) continue; spots.push([x + (r() - 0.5) * 4, z + (r() - 0.5) * 4, 1 + r() * 0.8]); }
    // Each tree is crossed cards cut from photographed trees (Poly Haven, CC0), baked into one atlas (tex/trees.png):
    // six young firs and pines in 256-px cells, then a young broadleaf (tree_small_02) in a 512-px cell, because its
    // crown spreads wider than it is tall. A front view on the top row and a side view below. One draw per kind.
    // ASPECT: width/height of each view's box, the box being as wide as its cell. SPAN: each cell's width in 256 px.
    const ASPECT = [[0.661, 0.634], [0.672, 0.862], [0.853, 0.859], [0.507, 0.698], [0.605, 0.557], [0.534, 0.604], [1.488, 1.488]], CELLS = ASPECT.length;
    const SPAN = [1, 1, 1, 1, 1, 1, 2], U0 = SPAN.map((n, k) => SPAN.slice(0, k).reduce((a, b) => a + b, 0)), UNITS = U0[CELLS - 1] + SPAN[CELLS - 1], BROAD = 6;
    // The broadleaf's cell holds only its crown, from the fork up. Its leaning, curving trunk is a 3D stem traced from the
    // model (centre and radius up to the fork), and its two cards stand where the model was baked from (45 and 135 degrees)
    // and pass through the fork, so the limbs on the cards grow out of the top of the stem from every side.
    // In card units (1 = the cell's height = 4.63 m of the model): FORK is the fork above the stem's foot; STEM is x, y, z, radius
    // (five rings are enough for its gentle bends). It ends at the fork: on the pictures the trunk already parts there into
    // the main limb and a smaller one, so anything higher would poke up between them.
    const FORK = [0.041, 0.3067, 0.0389], STEM = [[0, -0.0043, 0, 0.0177], [0.0155, 0.1404, -0.0009, 0.0168], [0.0231, 0.2268, 0.0138, 0.0145], [0.032, 0.27, 0.0276, 0.0147], [...FORK, 0.0173]];
    const CN = [0, 0.85, 0.53];   // the cards' normal: lit like a crown, from above, whichever way you look
    const atlas = texLoader.load('tex/trees.png'); atlas.encoding = THREE.sRGBEncoding; atlas.anisotropy = 4;
    const treeM = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95, metalness: 0 });
    treeM.userData.lin = true; treeM.onBeforeCompile = rimPatch;
    // The broadleaf's cards keep that normal on their back faces too (a double-sided card would turn it to point down there), so
    // the picture's trunk is lit the same from every side, and so is the top of the 3D stem that meets it.
    const broadM = treeM.clone(); broadM.userData.lin = true;
    broadM.onBeforeCompile = (sh) => { rimPatch(sh); sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n\tnormal *= faceDirection;'); };
    const depthM = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlas, alphaTest: 0.5, side: THREE.DoubleSide });
    const cardGeo = (k) => {
      const pos = [], uv = [], nor = [], idx = [], o = k === BROAD ? FORK : [0, 0, 0];
      (k === BROAD ? [[0, -Math.PI / 4], [1, (-3 * Math.PI) / 4]] : [[0, 0], [1, Math.PI / 3], [0, (2 * Math.PI) / 3]]).forEach(([v, a]) => {   // conifers: three cards at 60 degrees, so the crown looks full from every side
        const w = 0.25 * SPAN[k], u0 = U0[k] / UNITS, u1 = (U0[k] + SPAN[k]) / UNITS, vb = v ? 0 : 0.5, vt = vb + 0.5;   // the card is the whole cell (1:2; the broadleaf's 1:1); the tree (the broadleaf's crown) stands on its bottom edge, trunk (fork) on the centre line
        const cx = Math.cos(a) * w, cz = Math.sin(a) * w, b = pos.length / 3, P = [[-cx, 0, -cz], [cx, 0, cz], [cx, 1, cz], [-cx, 1, -cz]];
        P.forEach((p) => pos.push(p[0] + o[0], p[1] + o[1], p[2] + o[2])); uv.push(u0, vb, u1, vb, u1, vt, u0, vt);
        for (let i = 0; i < 4; i++) nor.push(...CN);
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
      return g;
    };
    const kinds = Array.from({ length: CELLS }, () => []);
    // About one tree in five is the broadleaf, gathered in loose groves that come and go across the map and thin out on
    // the hills; the firs and pines share the rest evenly. One draw from r per spot, as before.
    spots.forEach((sp) => { const [x, z] = sp, u = r(), g = Math.max(0, 0.2 + 0.24 * Math.sin(x * 0.05 + 1.3) * Math.sin(z * 0.043 - 0.7)) * (hillAt(x, z) > 1.5 ? 0.4 : 1); kinds[u < g ? BROAD : Math.floor(((u - g) / (1 - g)) * BROAD)].push(sp); });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), ps = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    const tints = ['#7f8a76', '#8a9177', '#6f7a68', '#8e8a70', '#9a9078', '#7a7f70'].map(lin);   // muted, in the survival-horror palette
    // The conifers' crowns are lifted off the ground on a bare trunk, so the lowest branches start above head height and
    // you can see through the woods between the trunks. The broadleaf already has its own clear trunk up to where it forks.
    const trunks = [], trunkGeo = new THREE.CylinderGeometry(0.55, 1, 1, 7, 1, true).translate(0, 0.5, 0), barkM = mat('#6b5f52', { map: tex('bark', 1, 3), rough: 0.95 });
    // The stem must look like the trunk on the pictures where the two meet: the same grey bark (this colour times the reddish
    // bark photo averages the picture's trunk at the fork, rgb 80,76,62), the same tint per tree, and the same light. Its normals
    // turn from round to the cards' own over its top third, and it does not shadow itself there: its shadow is cast from a
    // little further from the sun, so its far side is lit like the picture above it while it still shades the ground and others.
    const stemM = mat('#c8e9f2', { map: tex('bark', 1, 3), rough: 0.95 });
    const stemDepthM = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    stemDepthM.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n\tmvPosition.z -= 0.12 * length(instanceMatrix[0].xyz) * smoothstep(0.15, 0.22, position.y);\n\tgl_Position = projectionMatrix * mvPosition;'); };
    const stemGeo = (() => {   // the broadleaf's trunk: rings of 7 along STEM, kept level (it leans only a little), shut by a flat lid
      const pos = [], uv = [], nor = [], idx = [], N = 7; let len = 0;
      STEM.forEach(([x, y, z, rad], i) => {
        if (i) len += Math.hypot(x - STEM[i - 1][0], y - STEM[i - 1][1], z - STEM[i - 1][2]);
        const k = smooth(0.19, FORK[1], y);
        for (let j = 0; j <= N; j++) { const a = (j / N) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a), n = [c * (1 - k) + CN[0] * k, CN[1] * k, sn * (1 - k) + CN[2] * k], nl = Math.hypot(...n); pos.push(x + c * rad, y, z + sn * rad); nor.push(n[0] / nl, n[1] / nl, n[2] / nl); uv.push(j / N, len * 1.5); }
        if (i) for (let j = 0; j < N; j++) { const a = (i - 1) * (N + 1) + j, b = a + N + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
      });
      const T = (STEM.length - 1) * (N + 1), [x, y, z] = STEM[STEM.length - 1]; pos.push(x, y, z); nor.push(...CN); uv.push(0.5, len * 1.5);
      for (let j = 0; j < N; j++) idx.push(T + N + 1, T + j + 1, T + j);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
      return g;
    })();
    kinds.forEach((list, k) => {
      if (!list.length) return;
      const broad = k === BROAD, im = new THREE.InstancedMesh(cardGeo(k), broad ? broadM : treeM, list.length), stems = broad ? new THREE.InstancedMesh(stemGeo, stemM, list.length) : null;
      list.forEach(([x, z, s0], j) => {
        const s = broad ? Math.min(s0, 1.3) : s0;   // a broadleaf is a 4.6 m sapling blown up: past ~20 m its leaves look too big
        const ht = (9 + r() * 7) * s, h = ht / ((broad ? FORK[1] : 0) + Math.max(...ASPECT[k].map((a) => Math.min(1, (0.5 * SPAN[k]) / a))));   // so the tree itself, not its card, is 8-14 m
        const lift = broad ? -0.25 : Math.max(2.8, ht * 0.26) * (0.9 + r() * 0.25);   // bare trunk below the first branches (the broadleaf's foot sunk a little, for slopes)
        q.setFromAxisAngle(up, r() * (broad ? 6.28 : Math.PI)); ps.set(x, lift + hillAt(x, z), z); sc.set(h, h, h);
        if (!broad) trunks.push([x, z, lift + ht * 0.45, (0.13 + r() * 0.06) * s]);
        im.setMatrixAt(j, m4.compose(ps, q, sc)); im.setColorAt(j, col.copy(tints[Math.floor(r() * tints.length)]).multiplyScalar(0.85 + r() * 0.3));
        if (stems) { stems.setMatrixAt(j, m4); stems.setColorAt(j, col); }
        circles.push({ x, z, r: 0.3 * s, y0: hillAt(x, z) - 1.5 });   // the trunk stands on the hill: it doesn't reach down into a tunnel under it
      });
      im.castShadow = im.receiveShadow = true; im.customDepthMaterial = depthM;
      scene.add(im);
      if (stems) { stems.castShadow = stems.receiveShadow = true; stems.customDepthMaterial = stemDepthM; scene.add(stems); }
    });
    {
      const tm = new THREE.InstancedMesh(trunkGeo, barkM, trunks.length);
      trunks.forEach(([x, z, th, rad], j) => { q.setFromAxisAngle(up, r() * 6.28); ps.set(x, hillAt(x, z) - 0.3, z); sc.set(rad, th, rad); tm.setMatrixAt(j, m4.compose(ps, q, sc)); });
      tm.castShadow = tm.receiveShadow = true; scene.add(tm);
    }
  }

  /* ================= per-place beacons, labels, signposts ================= */
  const additive = (color, opacity) => { const m = new THREE.MeshBasicMaterial({ color: lin(color), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }); m.userData.lin = true; return m; };
  places.forEach((p) => {
    const vp = p.toWorld(...(p.vp || [0, 0])), gy = groundAt(vp.x, vp.z);
    p.vx = vp.x; p.vz = vp.z; p.vy = gy;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 70, 20, 1, true).translate(0, 35, 0), additive(p.color, 0.12));
    beam.position.set(vp.x, gy, vp.z);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.1, 48), additive(p.color, 0.6));
    ring.rotation.x = -Math.PI / 2; ring.position.set(vp.x, gy + 0.08, vp.z);
    scene.add(beam, ring);
    // The beam and ring mark where the song is (clicking one walks you there). Only a place with a ride (p.ride) has
    // something to do there: board it (Z). There is no fixed "view" any more: songs are chosen on a vehicle's radio.
    const ia = { kind: p.ride ? 'seat' : 'spot', place: p, x: vp.x, z: vp.z, r: 2.6, mark: gy + 2.6, y0: gy - DECK_STEP, y1: gy + 2.5 };   // only at the viewpoint's level: SHOT's is up on a walkway you can also walk under
    beam.userData.ia = ring.userData.ia = ia;
    pick.push(ring, beam);
    if (p.ride) interact.push(ia);
    p.beam = beam; p.ringM = ring;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTex('♪ ？？？'), transparent: true, depthWrite: false, fog: false }));
    label.scale.set(8, 2, 1); label.position.set(vp.x, gy + 7.5, vp.z);
    scene.add(label);
    p.label = label;

  });
  function refreshLabels() { /* no floating words in the world: places are told apart by colour and shape */ }

  // Colours given as plain hex in place builders are sRGB; convert once to linear like E.mat does.
  scene.traverse((o) => {
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    ms.forEach((m) => {
      if (m.userData.lin || m.isShaderMaterial) return;
      if (m.color) m.color.convertSRGBToLinear();
      if (m.emissive) m.emissive.convertSRGBToLinear();
      m.userData.lin = true;
    });
  });

  /* ================= avatar ================= */
  function makeAvatar() {
    const A = new THREE.Group(), body = new THREE.Group(); A.add(body);
    // Dressed to be forgotten: clothes so plain and universal they belong to no year and no scene, the way someone who
    // lives outside dresses. Function first, layers on layers, everything oversized and washed out, no logos, no jewellery,
    // no brand, no face: a heavyweight hoodie in faded black with the hood up over a black knit face covering (just the eyes
    // showing), a longer bone-coloured thermal hanging out under it, a worn brown blanket scarf wound round the neck, a
    // canvas tote on a long strap, wide washed charcoal trousers pooling over chunky mud-grey boots.
    const skin = mat('#c99a78', { rough: 0.65 }), hoodie = mat('#2a2928', { rough: 0.97 }), pants = mat('#45423d', { rough: 0.96 });
    const knit = mat('#141414', { rough: 1 }), thermal = mat('#b8ae9c', { rough: 0.95 }), scarf = mat('#5b4a3b', { rough: 1 }), canvas = mat('#8c8370', { rough: 0.95 });
    const bootM = mat('#6e6a62', { rough: 0.9 }), soleM = mat('#2b2a28', { rough: 0.95 });
    const cyl = (rt, rb, h, m, seg = 12) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
    const hips = new THREE.Group(); hips.position.y = 0.95; body.add(hips);
    const legs = [-1, 1].map((sd) => {   // wide and straight, the fabric hanging off the knee
      const pivot = new THREE.Group(); pivot.position.x = sd * 0.1; hips.add(pivot);
      const thigh = cyl(0.112, 0.104, 0.47, pants); thigh.position.y = -0.235; pivot.add(thigh);
      const knee = new THREE.Group(); knee.position.y = -0.47; pivot.add(knee);
      const shin = cyl(0.104, 0.112, 0.44, pants); shin.position.y = -0.22; knee.add(shin);
      return { pivot, knee };
    });
    const pelvis = cyl(0.205, 0.215, 0.22, pants); pelvis.position.y = 0.02; pelvis.scale.z = 0.72; hips.add(pelvis);
    // the hoodie: boxy, dropped shoulders, long enough to cover the seat
    const torso = cyl(0.235, 0.25, 0.66, hoodie); torso.position.y = 0.3; torso.scale.z = 0.7; hips.add(torso);
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.236, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), hoodie); sh.scale.set(1, 0.32, 0.7); sh.position.y = 0.63; hips.add(sh);
    const hood = new THREE.Group(); hips.add(hood);   // (the hood itself goes on the head, below; this was the collar ring)
    const arms = [-1, 1].map((sd) => {   // long wide sleeves: the hands only just show
      const pivot = new THREE.Group(); pivot.position.set(sd * 0.265, 0.57, 0); hips.add(pivot);
      const upper = cyl(0.085, 0.08, 0.3, hoodie); upper.position.y = -0.15; pivot.add(upper);
      const elbow = new THREE.Group(); elbow.position.y = -0.3; pivot.add(elbow);
      const lower = cyl(0.08, 0.077, 0.29, hoodie); lower.position.y = -0.145; elbow.add(lower);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.044, 10, 8), skin); hand.position.y = -0.31; elbow.add(hand);
      pivot.rotation.z = sd * 0.1;
      return { pivot, elbow };
    });
    const neck = cyl(0.05, 0.055, 0.1, knit); neck.position.y = 0.68; hips.add(neck);
    const head = new THREE.Group(); head.position.y = 0.82; hips.add(head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.112, 18, 14), knit); skull.scale.set(0.95, 1.12, 1.02); head.add(skull);   // the face covering
    {
      const add = (par, geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.scale.set(sx, sy, sz); par.add(o); return o; };
      const cg = (rt, rb, h, n = 12) => new THREE.CylinderGeometry(rt, rb, h, n);
      // the eye opening: a band of skin, two eyes, nothing else of the face
      add(head, new THREE.SphereGeometry(0.1135, 18, 4, Math.PI / 2 - 0.5, 1.0, Math.PI / 2 - 0.24, 0.17), skin, 0, 0, 0, 0, 0, 0, 0.955, 1.12, 1.025);
      for (const sd of [-1, 1]) add(head, new THREE.SphereGeometry(0.012, 6, 4), mat('#0e0c0b'), sd * 0.038, 0.022, 0.108);
      // the hood up: a loose shell round the head, open at the face, its edge turned back, falling onto the shoulders behind
      const hoodM = mat('#2a2928', { rough: 0.97 }, true); hoodM.side = THREE.DoubleSide;
      add(head, new THREE.SphereGeometry(0.155, 18, 12, Math.PI / 2 + 0.75, Math.PI * 2 - 1.5, 0, Math.PI * 0.72), hoodM, 0, 0.015, -0.012, 0, 0, 0, 1, 1.1, 1.05);
      add(head, cg(0.15, 0.2, 0.2, 14), hoodie, 0, -0.17, -0.05, 0.12, 0, 0, 1, 1, 0.72);   // hood fabric gathering at the neck and back
      // the thermal hanging out below the hem, the blanket scarf wound twice round the neck
      add(hips, cg(0.226, 0.236, 0.07, 16), thermal, 0, -0.06, 0, 0, 0, 0, 1, 1, 0.7);
      add(hips, new THREE.TorusGeometry(0.115, 0.05, 8, 16), scarf, 0, 0.69, 0.01, Math.PI / 2 + 0.15, 0, 0, 1, 1, 0.9);
      add(hips, new THREE.TorusGeometry(0.105, 0.042, 8, 16), scarf, 0, 0.735, 0.0, Math.PI / 2 - 0.1, 0, 0.3, 1, 1, 0.9);
      add(hips, new THREE.BoxGeometry(0.1, 0.24, 0.035), scarf, 0.07, 0.53, 0.175, 0.12, 0, -0.08);   // its loose end down the front
      // a kangaroo pocket, cuffs pushed down over the wrists
      add(hips, new THREE.BoxGeometry(0.28, 0.13, 0.03), hoodie, 0, 0.16, 0.172);
      arms.forEach(({ elbow }) => add(elbow, cg(0.075, 0.07, 0.05), hoodie, 0, -0.27, 0));
      // the tote: a long strap across from the right shoulder, the bag at the left hip
      add(hips, new THREE.BoxGeometry(0.26, 0.3, 0.06), canvas, -0.27, 0.06, 0.02, 0, 0.1, 0.05);
      add(hips, new THREE.BoxGeometry(0.03, 0.82, 0.008), canvas, 0, 0.36, 0.18, 0, 0, -0.62);
      add(hips, new THREE.BoxGeometry(0.03, 0.82, 0.008), canvas, 0, 0.36, -0.18, 0, 0, -0.62);
      // the trousers pooling over the boots in loose folds; chunky boots with thick soles
      legs.forEach(({ knee }) => {
        add(knee, swag.stackGeo(0.11, 0.12), pants, 0, -0.43, 0.004);
        add(knee, new THREE.SphereGeometry(0.075, 12, 8), bootM, 0, -0.5, 0.045, 0, 0, 0, 1.15, 0.75, 1.75);
        add(knee, new THREE.BoxGeometry(0.15, 0.06, 0.29), soleM, 0, -0.545, 0.045);
      });
    }
    A.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    swag.compact(body);
    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02; A.add(blob);
    // Rides: a different one at random every time you hop on.
    const rides = [];
    const mk = (pose, h, build) => { const g = new THREE.Group(); g.visible = false; A.add(g); rides.push({ g, pose, h, upd: build(g) }); };
    const rubber = mat('#15161a', { rough: 0.9 }), chrome = gloss('#cfd6de', { rough: 0.15, metal: 1, env: 1.2 });
    const led = (hex = '#59c8ff') => { const m = new THREE.MeshBasicMaterial({ color: lin(hex).multiplyScalar(1.6) }); m.userData.lin = true; return m; };
    // Self-balancing two-wheel board (feet side by side, facing forward) in four body colours.
    ['#d8232a', '#1f49c8', '#f1f3f5', '#17181c'].forEach((hex) => mk('front', 0.22, (g) => {
      const shell = gloss(hex, { rough: 0.18, metal: 0.1, env: 0.9 }), hubs = [];
      for (const sd of [-1, 1]) {
        const pad = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), shell); pad.scale.set(0.2, 0.065, 0.16); pad.position.set(sd * 0.19, 0.15, 0);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.2), rubber); grip.position.set(sd * 0.19, 0.212, 0);
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 20), rubber); wheel.rotation.z = Math.PI / 2; wheel.position.set(sd * 0.41, 0.14, 0);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.086, 6), chrome); hub.rotation.z = Math.PI / 2; hub.position.copy(wheel.position);
        const fender = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.035, 8, 16, Math.PI), shell); fender.rotation.y = Math.PI / 2; fender.position.set(sd * 0.395, 0.15, 0);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.022, 0.02), led()); lamp.position.set(sd * 0.19, 0.13, 0.155);
        g.add(pad, grip, wheel, hub, fender, lamp); hubs.push(hub);
      }
      const joint = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 12), shell); joint.rotation.z = Math.PI / 2; joint.position.y = 0.15; g.add(joint);
      g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
      return (t, bst, speed) => { hubs.forEach((hb) => (hb.rotation.x = t * speed * 4)); };
    }));
    // Hover boards, ridden sideways: wheel-less decks floating a hand above the ground.
    const blobM = () => { const m = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }); m.userData.lin = true; return m; };
    const deckShape = (g, m, w, len, y, th) => {
      const mid = new THREE.Mesh(new THREE.BoxGeometry(w, th, len - w), m); mid.position.y = y; mid.castShadow = true; g.add(mid);
      for (const sd of [-1, 1]) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, th, 20), m); cap.position.set(0, y, sd * (len - w) / 2); cap.castShadow = true; g.add(cap); }
    };
    // Retro deck: bright shell, striped grip, two lifter pads underneath.
    [['#e0457b', '#35b8a8', '#f2d24a'], ['#3f8fd8', '#f2f2ee', '#e0457b'], ['#e8762c', '#2a2a2e', '#f2f2ee']].forEach(([body, s1, s2]) => mk('side', 0.335, (g) => {
      const Y = 0.3;
      deckShape(g, gloss(body, { rough: 0.3, env: 0.5 }), 0.3, 1.12, Y, 0.045);
      deckShape(g, mat(s1, { rough: 0.8 }), 0.22, 0.98, Y + 0.024, 0.008);
      for (const z of [-0.2, 0, 0.2]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.01, 0.035), mat(s2, { rough: 0.8 })); st.position.set(0, Y + 0.026, z); g.add(st); }
      for (const z of [-0.3, 0.3]) {
        const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.1, 0.05, 18), rubber); pad.position.set(0, Y - 0.045, z);
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.052, 14), chrome); ring.position.copy(pad.position); ring.position.y -= 0.004;
        g.add(pad, ring);
      }
      const sh = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), blobM()); sh.rotation.x = -Math.PI / 2; sh.scale.set(0.5, 1.25, 1); sh.position.y = 0.025; g.add(sh);
      return (t) => { const b = Math.sin(t * 4) * 0.02; g.position.y = b; sh.position.y = 0.025 - b; g.rotation.z = Math.sin(t * 2.3) * 0.03; };
    }));
    // Engine board: black oval deck on four round hover engines with a faint blue wash on the ground.
    mk('side', 0.375, (g) => {
      const Y = 0.34, black = gloss('#1b1c20', { rough: 0.25, metal: 0.4, env: 0.7 });
      const deck = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.035, 32), black); deck.scale.set(0.21, 1, 0.62); deck.position.y = Y; deck.castShadow = true;
      const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.8), mat('#2a2b30', { rough: 0.5, metal: 0.5 })); chassis.position.y = Y - 0.045;
      g.add(deck, chassis);
      const rings = [];
      for (const x of [-0.13, 0.13]) for (const z of [-0.3, 0.3]) {
        const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.075, 18), black); eng.position.set(x, Y - 0.105, z); eng.castShadow = true;
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.01, 16), led('#3d8bff')); ring.position.set(x, Y - 0.146, z);
        g.add(eng, ring); rings.push(ring);
      }
      const wash = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), additive('#2f7bff', 0.18)); wash.rotation.x = -Math.PI / 2; wash.scale.set(0.6, 1.3, 1); wash.position.y = 0.03;
      const sh = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), blobM()); sh.rotation.x = -Math.PI / 2; sh.scale.set(0.55, 1.3, 1); sh.position.y = 0.025;
      g.add(sh, wash);
      return (t, bst) => { const b = Math.sin(t * 5) * 0.015; g.position.y = b; sh.position.y = 0.025 - b; wash.position.y = 0.03 - b; wash.material.opacity = 0.1 + bst * 0.12 + Math.sin(t * 20) * 0.02; };
    });
    // Kinto-un: a golden cloud you stand on, with a tail of puffs streaming behind.
    mk('front', 0.5, (g) => {
      const cm = mat('#f1c544', { rough: 1, emissive: '#7a5a10', emissiveIntensity: 0.5 }, true), puffs = [], tail = [];
      [[0, 0.3, 0, 0.3], [0.26, 0.27, 0.05, 0.24], [-0.26, 0.27, 0.03, 0.24], [0.1, 0.26, 0.24, 0.22], [-0.12, 0.26, 0.22, 0.22], [0.14, 0.27, -0.2, 0.23], [-0.14, 0.27, -0.22, 0.23], [0.4, 0.24, -0.08, 0.16], [-0.4, 0.24, -0.1, 0.16]].forEach(([x, y, z, r]) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), cm); m.position.set(x, y, z); m.scale.y = 0.72; m.castShadow = true; g.add(m); puffs.push({ m, y, s: x * 7 + z * 5 });
      });
      [[-0.45, 0.2], [-0.72, 0.15], [-0.95, 0.11], [-1.14, 0.07]].forEach(([z, r]) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), cm); m.position.set(0, 0.26, z); m.castShadow = true; g.add(m); tail.push(m); });
      return (t, bst, speed) => {
        g.position.y = Math.sin(t * 3) * 0.03;
        puffs.forEach((p) => (p.m.position.y = p.y + Math.sin(t * 4 + p.s) * 0.015));
        tail.forEach((m, i) => { m.position.x = Math.sin(t * 6 - i * 0.9) * 0.05 * (i + 1); m.position.y = 0.26 + Math.sin(t * 5 - i) * 0.03; m.visible = speed > 2; });
      };
    });
    // Water craft: you switch to it automatically over rivers and the sea.
    const wg = new THREE.Group(); wg.visible = false; A.add(wg);
    const waterRide = { g: wg, pose: 'bars', h: 0.34, upd: (() => {
      const hullM = gloss('#e9e6dc', { rough: 0.25, env: 0.6 }), redM = gloss('#a3181e', { rough: 0.3, env: 0.5 });
      const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), hullM); hull.scale.set(0.42, 0.2, 1.05); hull.position.y = 0.2; hull.castShadow = true;
      const deck = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 1.0), rubber); deck.position.set(0, 0.33, -0.15);
      const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), redM); nose.scale.set(0.3, 0.16, 0.5); nose.position.set(0, 0.33, 0.55);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.95, 8), chrome); col.position.set(0, 0.82, 0.42); col.rotation.x = -0.25;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.62, 8), rubber); bar.rotation.z = Math.PI / 2; bar.position.set(0, 1.27, 0.3);
      const skirt = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.09, 8, 24), rubber); skirt.rotation.x = Math.PI / 2; skirt.scale.set(0.85, 1.9, 1); skirt.position.y = 0.1;
      wg.add(hull, deck, nose, col, bar, skirt);
      const wake = [-1, 1].map((sd) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 3.2), additive('#ffffff', 0.3)); m.rotation.x = -Math.PI / 2; m.rotation.z = sd * 0.22; m.position.set(sd * 0.5, 0.04, -1.9); wg.add(m); return m; });
      const foam = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.9, 24), additive('#ffffff', 0.25)); foam.rotation.x = -Math.PI / 2; foam.scale.set(0.9, 1.8, 1); foam.position.y = 0.03; wg.add(foam);
      return (t, bst, speed) => { const k = Math.min(1, speed / 9); wg.position.y = Math.sin(t * 3) * 0.03; wg.rotation.x = -0.05 - k * 0.07; wake.forEach((m) => { m.material.opacity = 0.35 * k; m.scale.y = 0.5 + k; }); foam.material.opacity = 0.12 + 0.2 * k + 0.05 * Math.sin(t * 9); };
    })() };
    const handset = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.15, 0.012), new THREE.MeshBasicMaterial({ color: lin('#cfe3ff') })); handset.material.userData.lin = true; handset.position.set(0, -0.36, 0.05); handset.visible = false; arms[1].elbow.add(handset);
    let phoneOn = false;
    const pose = { up: 0, dribble: 0 };   // up: both arms raised (a shot, a contest), dribble: the right hand down at the ball
    let cur = null, last = null, forced = null;
    let phase = 0;
    return {
      G: A, pose,
      forceRide(i) { forced = i; if (cur) { cur.g.visible = false; cur = null; } },
      setPhone(on) { phoneOn = on; handset.visible = on; },
      animate(dt, speed, bob, bst = 0, lean = 0, onWater = false) {
        const riding = bst > 0.3 || onWater;
        if (cur && (cur === waterRide) !== onWater) { cur.g.visible = false; cur = null; }
        if (onWater && !cur) { cur = waterRide; cur.g.visible = true; }
        if (riding && !cur) { do { cur = rides[Math.floor(Math.random() * rides.length)]; } while (cur === last); if (forced !== null) cur = rides[forced % rides.length]; last = cur; cur.g.visible = true; }
        if (!riding && cur) { cur.g.visible = false; cur = null; }
        const side = riding && cur.pose === 'side';
        body.rotation.z = lean;
        body.rotation.y = side ? 1.4 : 0; if (riding) { body.rotation.x = side ? 0 : 0.1; hips.rotation.y = 0; }
        head.rotation.y = side ? -1.2 : 0;
        arms.forEach((a, i) => (a.pivot.rotation.z = (i ? 1 : -1) * (side ? 0.95 : riding ? 0.3 : 0.08)));
        if (riding) {
          const tt = performance.now() / 1000;
          cur.upd(tt, bst, speed);
          if (side) {
            legs[0].pivot.rotation.x = legs[1].pivot.rotation.x = -0.1;
            legs[0].pivot.rotation.z = -0.3; legs[1].pivot.rotation.z = 0.3;
            legs[0].knee.rotation.x = legs[1].knee.rotation.x = 0.2;
          } else {
            legs[0].pivot.rotation.x = legs[1].pivot.rotation.x = -0.14;
            legs[0].pivot.rotation.z = -0.11; legs[1].pivot.rotation.z = 0.11;
            legs[0].knee.rotation.x = legs[1].knee.rotation.x = 0.26;
          }
          const bars = cur.pose === 'bars';
          arms[0].pivot.rotation.x = arms[1].pivot.rotation.x = side ? 0 : bars ? -0.95 : 0.12;
          arms.forEach((a, i) => { a.elbow.rotation.x = bars ? -0.35 : -0.25; if (bars) a.pivot.rotation.z = (i ? 1 : -1) * 0.12; });
          body.position.y = cur.h + cur.g.position.y + Math.sin(tt * 6) * 0.006;
          head.rotation.x = 0;
          return;
        }
        legs[0].pivot.rotation.z = legs[1].pivot.rotation.z = 0;
        const k = Math.min(1, speed / 7.5), run = Math.max(0, Math.min(1, (speed - 2.5) / 4));
        if (speed > 0.05) phase += dt * (4.5 + speed * 1.25);
        const sw = Math.sin(phase) * (0.6 + 0.45 * run) * Math.min(1, speed / 2.5);
        legs[0].pivot.rotation.x = sw; legs[1].pivot.rotation.x = -sw;
        const kn = (0.7 + 0.9 * run) * Math.min(1, speed / 2.5);
        legs[0].knee.rotation.x = Math.max(0, -Math.sin(phase - 0.6)) * kn + 0.15 * run; legs[1].knee.rotation.x = Math.max(0, Math.sin(phase - 0.6)) * kn + 0.15 * run;
        arms[0].pivot.rotation.x = -sw * (0.75 + 0.35 * run); arms[1].pivot.rotation.x = sw * (0.75 + 0.35 * run);
        arms.forEach((a) => (a.elbow.rotation.x = -0.15 - 0.25 * k - 1.25 * run));
        body.rotation.x = 0.2 * run; hips.rotation.y = Math.sin(phase) * 0.14 * run;
        body.position.y = Math.abs(Math.sin(phase)) * (0.035 + 0.075 * run) * k;
        if (k < 0.05) { phase = 0; body.position.y = Math.sin(performance.now() / 700) * 0.006 + bob * 0.03; head.rotation.x = -bob * 0.12; }
        else head.rotation.x = 0;
        if (phoneOn && k < 0.05) { arms[1].pivot.rotation.x = -0.75; arms[1].elbow.rotation.x = -1.35; arms[1].pivot.rotation.z = -0.2; head.rotation.x = 0.32; }   // looking down at the phone
        if (pose.dribble > 0) { const d = pose.dribble; arms[1].pivot.rotation.x += (-0.55 - arms[1].pivot.rotation.x) * d; arms[1].elbow.rotation.x += (-0.4 + Math.sin(performance.now() / 70) * 0.25 - arms[1].elbow.rotation.x) * d; arms[1].pivot.rotation.z = -0.25 * d; body.rotation.x = Math.max(body.rotation.x, 0.22 * d); }
        if (pose.up > 0) { const u = pose.up; arms.forEach((a, i) => { a.pivot.rotation.x += (-2.9 - a.pivot.rotation.x) * u; a.elbow.rotation.x += (-0.25 - a.elbow.rotation.x) * u; a.pivot.rotation.z = (i ? 1 : -1) * 0.12 * u; }); }
      },
    };
  }
  const avatar = makeAvatar();
  scene.add(avatar.G);
  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: lin('#e8e2d0') }));
  marker.material.userData.lin = true;
  marker.visible = false;
  scene.add(marker);

  /* ================= state ================= */
  const KEY = 'soundwalk-v1';
  const P = { x: 0, z: -7.5, y: 0, face: 0, speed: 0, v: 0, hx: 0, hz: 1, lean: 0, vy: 0, air: false, jy: 0 };
  let boost = 0, dashOn = false, baseFov = 55, wind = null;
  function jump() { if (mode === 'walk' && !P.air && !drv) { P.air = true; P.vy = 8.5 + 2.5 * boost; P.jy = P.y; } }   // jy: where you took off (see update)
  let camPull = null, camFloor = null;   // the camera's eased distance when a wall pulls it in, and its eased floor
  let camYaw = Math.PI, camPitch = 0.2, lookT = -9, mode = 'load', auto = null, focus = null, lastFocus, regionKey = '', t = 0;
  const camDist = 4.7;
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ found: places.filter((p) => p.found).map((p) => p.song.id), x: drv ? drv.from.place.vx : P.x, z: drv ? drv.from.place.vz : P.z, y: drv ? null : P.y, yaw: camYaw })); } catch (e) { /* storage blocked */ } }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!s) return;
      places.forEach((p) => { p.found = (s.found || []).includes(p.song.id); });
      if (Number.isFinite(s.x) && Number.isFinite(s.z) && canBe(s.x, s.z)) { P.x = s.x; P.z = s.z; P.y = groundAt(P.x, P.z, Number.isFinite(s.y) ? s.y : undefined); }   // back on the deck or under it, as you were
      if (Number.isFinite(s.yaw)) camYaw = s.yaw;
    } catch (e) { /* ignore */ }
  }

  /* ================= collisions ================= */
  const PR = 0.35;
  // The land ends at |x|, |z| = 145. Past it you go on only afloat, or where a place says its shore runs on (p.shore: OHH's
  // beaches reach out beyond that edge, south past the port town), as far as the edge of the world. A step that would
  // take you anywhere else slides along the edge instead.
  const LAND = 145, WORLD = 330;
  const canBe = (x, z) => (Math.abs(x) <= LAND && Math.abs(z) <= LAND) || (!!pass && pass.land(x, z)) || (Math.abs(x) <= WORLD && Math.abs(z) <= WORLD && (isWater(x, z) || places.some((q) => { if (!q.shore) return false; const l = q.local(x, z); return q.shore(l.x, l.z); })));
  // Where a place cuts the hill's surface away to show a tunnel's mouth (p.holeAt: the canal's portals and light shafts,
  // the funfair's tunnel and cave), there is nothing to stand on up at the hill's height: someone walking on the hill stops
  // at its edge, as at a wall, instead of walking out over the hole on ground that is not drawn. Down in the tunnel or the
  // cutting (well below the hill there) you pass as before. A 1 m grid over the hills, made once.
  let holeMask = null;
  function holeAtHill(x, z) {
    const F = hillField; if (!F) return false;
    if (!holeMask) {
      const holers = places.filter((q) => q.holeAt), W = Math.round((F.nx - 1) * F.d), Hh = Math.round((F.nz - 1) * F.d); holeMask = new Uint8Array(W * Hh);
      for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) { const x0 = F.x0 + i + 0.5, z0 = F.z0 + j + 0.5, h = hillAt(x0, z0); if (h < 1.2) continue; if (holers.some((q) => { const l = q.local(x0, z0); return q.holeAt(l.x, l.z, h); })) holeMask[j * W + i] = 1; }
      holeMask.W = W; holeMask.H = Hh;
    }
    const i = Math.floor(x - F.x0), j = Math.floor(z - F.z0);
    return i >= 0 && j >= 0 && i < holeMask.W && j < holeMask.H && holeMask[j * holeMask.W + i] === 1;
  }
  function collide(p) {
    // the edge of a hole in the hill (above). Only for someone up on the hill: at a tunnel's mouth the hill over it is
    // still low, and someone walking in on the floor (the funfair's road at 0 m, its quay at 0.9 m) must not be stopped there.
    if (p !== P && P.y >= 1.2 && P.y > hillAt(P.x, P.z) - 1.2 && holeAtHill(p.x, p.z) && !holeAtHill(P.x, P.z) && P.y > hillAt(p.x, p.z) - 1.2) { p.x = P.x; p.z = P.z; }
    if (!canBe(p.x, p.z)) {
      if (p !== P && canBe(p.x, P.z)) p.z = P.z; else if (p !== P && canBe(P.x, p.z)) p.x = P.x; else if (p !== P && canBe(P.x, P.z)) { p.x = P.x; p.z = P.z; }
      else { const lim = isWater(p.x, p.z) ? WORLD : LAND; p.x = clamp(p.x, -lim, lim); p.z = clamp(p.z, -lim, lim); }   // set down somewhere it cannot be: back onto the land
    }
    for (const c of circles) {
      if (P.y < c.y0 || P.y > c.y1) continue;
      const dx = p.x - c.x, dz = p.z - c.z, rr = c.r + PR;
      if (Math.abs(dx) > rr || Math.abs(dz) > rr) continue;
      const d = Math.hypot(dx, dz);
      if (d < rr && d > 1e-5) { p.x = c.x + (dx / d) * rr; p.z = c.z + (dz / d) * rr; }
    }
    for (const b of boxes) {
      if (P.y < b.y0 || P.y > b.y1) continue;
      const dx = p.x - b.x, dz = p.z - b.z;
      const ux = dx * b.c - dz * b.s, uz = dx * b.s + dz * b.c;
      const ox = b.hx + PR - Math.abs(ux), oz = b.hz + PR - Math.abs(uz);
      if (ox <= 0 || oz <= 0) continue;
      let nx = ux, nz = uz;
      if (ox < oz) nx = Math.sign(ux || 1) * (b.hx + PR); else nz = Math.sign(uz || 1) * (b.hz + PR);
      p.x = b.x + nx * b.c + nz * b.s; p.z = b.z - nx * b.s + nz * b.c;
    }
  }

  /* ================= cars on the ring road ================= */
  // A garage of cars; one waits in each parking area, picked afresh every time you leave one.
  function plainCar(i) {   // stand-in if cars.js is missing
    const g = new THREE.Group(), col = ['#c9ccd1', '#15161a', '#1f3a7a', '#b3161d'][i % 4];
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 4.3), gloss(col, { rough: 0.3, metal: 0.4 })); body.position.y = 0.6; body.castShadow = true;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 2.1), gloss('#0c0f14', { rough: 0.1 })); cab.position.set(0, 1.2, -0.2);
    const head = basic('#fff3d0'), tail = basic('#ff2a2a');
    const h = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.06), head); h.position.set(0, 0.7, 2.16);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.06), tail); tl.position.set(0, 0.75, -2.16);
    g.add(body, cab, h, tl); g.userData = { len: 4.3, wid: 1.8, hgt: 1.5, head, tail };
    return g;
  }
  const NCAR = SW.Cars ? SW.Cars.models.length : 4;
  const makeCar = (i, o) => { const c = SW.Cars ? SW.Cars.make(E, i, o) : plainCar(i); c.rotation.order = 'YXZ'; if (c.userData.tail) c.userData.tail0 = c.userData.tail.color.clone(); return c; };
  const carsG = new THREE.Group(), trafficG = new THREE.Group(); scene.add(carsG, trafficG);
  const garage = Array.from({ length: NCAR * 2 }, (_, i) => { const c = makeCar(i % NCAR, { black: i >= NCAR }); c.visible = false; carsG.add(c); return c; });   // every model twice: silver wheels, then black
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  let drv = null, drvK = 0, driveHinted = false, padBrake = false, padGas = false, padFast = false;
  let carPick = -1;   // the model chosen at SEASIDE MOTORS (street.js): it is the one that waits at the beach lay-by
  const freeCar = (pa) => { const used = new Set(ring.pas.map((q) => q.car)); if (drv) used.add(drv.car); if (pa && pa.id === 'beach' && carPick >= 0 && !used.has(garage[carPick])) return garage[carPick]; const free = garage.filter((c) => !used.has(c)); return free[Math.floor(Math.random() * free.length)] || garage[0]; };
  function parkAt(pa, car, pose) {
    const u = car.userData, c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
    pa.car = car; car.visible = true; car.position.set(pose.x, pa.y, pose.z); car.rotation.set(0, pose.yaw, 0);
    Object.assign(pa.box, { x: pose.x, z: pose.z, c, s, hx: u.wid / 2 + 0.05, hz: u.len / 2 + 0.05, y0: pa.y - 1.5, y1: pa.y + 3 });
    Object.assign(pa.ia, { x: pose.x, z: pose.z, sx: pose.x, sz: pose.z, mark: pa.y + u.hgt + 0.7, off: false });
  }
  ring.pas.forEach((pa) => {
    pa.place = places.find((p) => p.song.scene === pa.id);
    pa.box = { x: 0, z: 0, hx: 1, hz: 2, c: 1, s: 0, y0: 1e9, y1: 1e9 }; boxes.push(pa.box);
    pa.ia = { kind: 'car', pa, x: 0, z: 0, sx: 0, sz: 0, r: 3.4, mark: 0, y0: pa.y - 1.2, y1: pa.y + 2.5 }; interact.push(pa.ia);
    pa.out = { kind: 'exit', pa, x: 0, z: 0, mark: 0 };
    parkAt(pa, freeCar(pa), pa.slot);
  });
  // The street under the viaduct and its shops (street.js). At SEASIDE MOTORS' desk you choose the car that waits for you
  // at the beach lay-by: each go brings the next model round (swapping it with whichever bay had it) and onto the turntable.
  streetView = street ? SW.Street.build(street, E, { scene, boxes, circles, interact, pick: (m) => { m.userData.ground = true; pick.push(m); } }) : null;
  passView = pass ? SW.Pass.build(pass, E, { scene, circles, pick: (m) => { m.userData.ground = true; pick.push(m); } }) : null;
  // its ground roads join the ones you can drive (after everything built from the ring road's own: piers, decks, the hills
  // under them), and its two parking areas (the garage's east bay, the car park's ground floor) are set up like the others
  if (street) {
    ring.roads.push(...street.roads);
    for (const pa of street.pas) {
      ring.pas.push(pa); pa.place = places.find((p) => p.song.scene === pa.placeId);
      pa.box = { x: 0, z: 0, hx: 1, hz: 2, c: 1, s: 0, y0: 1e9, y1: 1e9 }; boxes.push(pa.box);
      pa.ia = { kind: 'car', pa, x: 0, z: 0, sx: 0, sz: 0, r: 3.4, mark: 0, y0: pa.y - 1.2, y1: pa.y + 2.5 }; interact.push(pa.ia);
      pa.out = { kind: 'exit', pa, x: 0, z: 0, mark: 0 };
      parkAt(pa, freeCar(pa), pa.slot);
    }
  }
  // the pass road over the mountain behind NO JOBB (pass.js) is a road you can drive too, from under the viaduct at FLIP's
  // avenue to the palace; a car waits at the mountain's foot, at the pass and at the palace end
  if (pass) {
    ring.roads.push(pass.road);
    for (const pa of pass.pas) {
      ring.pas.push(pa); pa.place = places.find((p) => p.song.scene === pa.placeId);
      pa.box = { x: 0, z: 0, hx: 1, hz: 2, c: 1, s: 0, y0: 1e9, y1: 1e9 }; boxes.push(pa.box);
      pa.ia = { kind: 'car', pa, x: 0, z: 0, sx: 0, sz: 0, r: 3.4, mark: 0, y0: pa.y - 1.2, y1: pa.y + 2.5 }; interact.push(pa.ia);
      pa.out = { kind: 'exit', pa, x: 0, z: 0, mark: 0 };
      parkAt(pa, freeCar(pa), pa.slot);
    }
  }
  const beachPA = ring.pas.find((q) => q.id === 'beach');
  if (streetView && beachPA) streetView.showCar(garage.indexOf(beachPA.car));
  function pickCar() {
    if (drv || !beachPA || !beachPA.car || !streetView) return;
    const i = (garage.indexOf(beachPA.car) + 1) % garage.length, want = garage[i], other = ring.pas.find((q) => q !== beachPA && q.car === want);
    carPick = i;
    if (other) parkAt(other, beachPA.car, other.slot);
    parkAt(beachPA, want, beachPA.slot);
    streetView.showCar(i);
    say([`SEASIDE MOTORS: ${SW.Cars ? SW.Cars.models[i % NCAR].name.toUpperCase() : 'CAR ' + (i % NCAR + 1)}${i >= NCAR ? ' · BLACK WHEELS' : ''}`, 'この車が上の BEACH PA で待っています。エレベーターで上がって乗ってください。']);
  }
  function startDrive(pa) {
    if (drv || !pa.car) return;
    const car = pa.car;
    drv = { car, from: pa, pa, x: car.position.x, z: car.position.z, y: pa.y, yaw: car.rotation.y, v: 0, st: 0, hint: -1, hints: {}, road: ring, side: -1, hit: 0, wall: 0 };
    ring.pas.forEach((q) => { if (q !== pa && q.car) q.car.visible = false; q.box.y0 = 1e9; q.ia.off = true; });   // the other bays stay clear, so there is always room to pull in
    pa.car = null;
    avatar.G.visible = false; auto = null; keys.clear(); boost = 0; P.v = 0; P.air = false; P.vy = 0;
    document.body.classList.add('driving');
    snapCam(); camBlendDur = RM ? 0.01 : 0.9;
    if (!driveHinted) { driveHinted = true; const h = $('#dhint'); h.classList.add('show'); setTimeout(() => h.classList.remove('show'), 9000); }
  }
  // pa = the parking area we stopped in; null = give the car back (warping away, for instance)
  function endDrive(pa) {
    const d = drv; if (!d) return;
    drv = null; keys.clear();
    document.body.classList.remove('driving'); $('#dhint').classList.remove('show');
    avatar.G.visible = true;
    const home = pa || d.from;
    ring.pas.forEach((q) => (q.car = null));
    parkAt(home, d.car, pa ? { x: d.x, z: d.z, yaw: d.yaw } : home.slot);
    ring.pas.forEach((q) => { if (q !== home) parkAt(q, freeCar(q), q.slot); });
    garage.forEach((c) => { if (!ring.pas.some((q) => q.car === c)) c.visible = false; });
    let spot = null;
    if (pa) {
      const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw), w = d.car.userData.wid / 2 + 0.75, l = d.car.userData.len / 2 + 0.8;
      spot = [[-fz * w, fx * w], [fz * w, -fx * w], [-fx * l, -fz * l], [fx * l, fz * l]].map(([ox, oz]) => ({ x: d.x + ox, z: d.z + oz })).find((q) => pa.canStand(q.x, q.z));   // driver's side first
    }
    if (!spot) spot = { x: home.place.vx, z: home.place.vz };
    P.x = spot.x; P.z = spot.z; P.y = groundAt(P.x, P.z, home.y); P.v = 0; P.air = false;
    P.face = Math.atan2(d.x - P.x, d.z - P.z); P.hx = Math.sin(P.face); P.hz = Math.cos(P.face);
    snapCam(); camBlendDur = RM ? 0.01 : 0.8;
    regionKey = ''; save();
  }
  const rp = { i: -1 }, rq = { s: 0, d: 0 }, ra = {}, rqs = {};
  // The car is steered freely, but the road carries it round its bends and it settles back into its lane when you
  // let go of the wheel, so holding "forward" is enough to do a lap. Walls and the median are solid.
  function driveUpdate(dt, idle) {
    const d = drv, iv = idle ? { f: 0, s: 0 } : inputVec(), u = d.car.userData;
    if (!idle && padGas) iv.f = Math.max(iv.f, 1);   // pad: right trigger is the accelerator, left trigger the brake
    const fast = !idle && (running || dashOn || padFast), brake = idle || keys.has('brake') || padBrake, vmax = fast ? 58 : 41;
    let a = 0;
    if (iv.f > 0.05) a = d.v < -0.5 ? 30 * iv.f : 17 * iv.f * Math.max(0, 1 - d.v / vmax);
    else if (iv.f < -0.05) a = d.v > 0.5 ? 36 * iv.f : 10 * iv.f * Math.max(0, 1 + d.v / 9);
    d.v += a * dt;
    d.v -= d.v * 0.05 * dt + Math.sign(d.v) * Math.min(Math.abs(d.v), (Math.abs(iv.f) < 0.05 ? 2.2 : 0) * dt);
    if (d.v > vmax) d.v -= (d.v - vmax) * Math.min(1, dt * 1.2);
    if (brake) d.v -= Math.sign(d.v) * Math.min(Math.abs(d.v), (idle ? 14 : 44) * dt);
    d.st += (iv.s - d.st) * Math.min(1, dt * 8);
    const R0 = d.road || ring;
    R0.proj(d.x, d.z, d.hints[R0.id] ?? -1, rp, d.y);
    let tau0 = Math.atan2(rp.tx, rp.tz);
    d.yaw -= d.st * (d.v / (5.5 + (d.v * d.v) / 34)) * dt;   // yaw grows to the left, so steering right lowers it
    d.x += Math.sin(d.yaw) * d.v * dt; d.z += Math.cos(d.yaw) * d.v * dt;
    // Which road is the car on? The loop and the branch run side by side where they meet; take whichever the car is
    // more squarely on (the current one unless the other is clearly better), else stay on the one it was on.
    const m = 1.4, band = (o) => {
      const med = o.hw > 7.45 && !(o.R.MGAP && o.R.MGAP[o.i]), xo = o.R.XO ? o.R.XO[o.i] : 0, side = med ? (o.d >= 0 ? 1 : -1) : 0;
      const R0 = o.R, jIn = R0 === ring && R0.JGAP && R0.JGAP[o.i] ? 3 : 0, jOut = R0 === ring && R0.OGAP && R0.OGAP[o.i] ? 3 : 0;   // where a ramp leaves or joins, the loop's wall is open: you may cross onto the ramp
      return [(med && side > 0 ? 1.3 : -(o.hw - m)) - jIn, (med && side < 0 ? -1.3 : o.hw - m) + (o.d > 0 ? xo : 0) + jOut];
    };
    let best = null, bestK = 1e9;
    for (const Rd of ring.roads) {
      const o = rqs[Rd.id] || (rqs[Rd.id] = {}); Rd.proj(d.x, d.z, d.hints[Rd.id] ?? -1, o, d.y); d.hints[Rd.id] = o.i;
      if (o.off || Math.abs(o.y - d.y) > 3) continue;
      if (Rd !== R0 && (Rd.oneWay || Rd.oneLane) && Math.cos(d.yaw + (d.v < 0 ? Math.PI : 0) - Math.atan2(o.tx, o.tz)) < -0.2) continue;   // never onto a one-way ramp against its traffic
      const [lo2, hi2] = band(o); if (o.d < lo2 || o.d > hi2) continue;
      const al = Math.abs(Math.cos(d.yaw - Math.atan2(o.tx, o.tz)));   // how well the car points along this road
      // how far the car is from the middle of this road's nearest lane: a ramp beside a lane wins once you steer onto it
      const ld = o.hw < 3.5 ? [0] : o.hw > 7.45 ? [2.5, laneD(o.hw)] : [laneD(o.hw)], off = Math.min(...ld.map((c) => Math.abs(Math.abs(o.d) - c)));
      const k = off / o.hw + 0.9 * (1 - al) - (Rd === R0 ? 0.08 : 0); if (k < bestK) { bestK = k; best = o; }
    }
    // on a ramp or the route with a wall beside you, you stay on it (the wall holds you) unless you run off its end
    { const c = rqs[R0.id], walled = R0 !== ring && !c.off && !(R0.GAP[c.i] && R0.OGAP[c.i]);
      if (walled && best && best.R !== R0) { const [l2, h2] = band(c); const inside = c.d >= l2 && c.d <= h2;
        const sideWall = c.d > 0 ? !R0.OGAP[c.i] : !R0.GAP[c.i];   // the wall on the side the car is pushing towards
        if (inside || sideWall) best = inside ? c : null; } }
    // run off the end of a ramp a little wide of the loop's lanes: you are on the loop, and its wall eases you back in
    const runOff = !best && R0 !== ring && rqs[R0.id].off && Math.abs(rqs[ring.id].y - d.y) < 3 ? rqs[ring.id] : null;
    Object.assign(rq, best || runOff || rqs[R0.id]);
    if (rq.R !== R0) tau0 = Math.atan2(rq.tx, rq.tz);   // just changed road: no jump in heading
    d.road = rq.R; d.hint = rq.i;
    const tau = Math.atan2(rq.tx, rq.tz), med = rq.hw > 7.45 && !(rq.R.MGAP && rq.R.MGAP[rq.i]);
    if (!med) d.side = rq.d >= 0 ? 1 : -1;
    const [lo, hi] = (() => { const b = band(rq); if (med) { if (d.side > 0) b[0] = 1.3; else b[1] = -1.3; } return b; })();
    const inBand = !!best;
    const body = { yaw: d.yaw, len: u.len, wid: u.wid };
    let pa = inBand ? null : ring.pas.find((q) => q.inside(d.x, d.z, body)) || null;
    if (!inBand && !pa) {
      if (d.pa) {   // against the edge of a parking area: the car stops there (speed falls to what it actually moved)
        const w = d.pa.clamp(d.x, d.z, body), push = Math.hypot(w.x - d.x, w.z - d.z), went = Math.abs(d.v) * dt;
        d.x = w.x; d.z = w.z; pa = d.pa; d.v *= clamp(1 - push / (went + 1e-6), 0, 1);
      }
      else {   // scraping a wall: pushed back in, turned along it, slowed a little
        const k = clamp(rq.d, lo, hi) - rq.d; d.x += rq.tz * k; d.z -= rq.tx * k; rq.d += k;
        const rel = wrapA(d.yaw - tau), off = wrapA(rel - (Math.abs(rel) < Math.PI / 2 ? 0 : Math.PI));
        d.yaw -= off * Math.min(1, dt * 9); d.v -= d.v * Math.min(0.9, (Math.abs(Math.sin(off)) * 5 + 0.4) * dt);
        d.wall = 1;
      }
    }
    d.pa = pa;
    {
      if (!pa) d.yaw += wrapA(tau - tau0);
      const rel = wrapA(d.yaw - tau), lane = med || pa ? (d.side > 0 ? 0 : Math.PI) : Math.abs(rel) < Math.PI / 2 ? 0 : Math.PI;
      let off = wrapA(rel - lane), way = lane ? -1 : 1; if (Math.abs(off) > 1.75) { off = wrapA(off - Math.PI); way = -way; }   // deliberately facing the other way: line up that way instead
      // ...and drift to the middle of the nearest lane (yaw grows to the left, which is +d when heading with s)
      const ad = Math.abs(rq.d), slow = laneD(rq.hw), mid = med && ad < (2.5 + slow) / 2 ? 2.5 : slow, side = pa ? -1 : Math.sign(rq.d || d.side);
      off -= way * (d.v < 0 ? -1 : 1) * clamp((side * mid - rq.d) * (pa ? 0.16 : 0.07), pa ? -0.34 : -0.12, pa ? 0.34 : 0.12);   // reversing, the same nose angle carries the car the other way
      // in a parking area this only helps a car that is already pointing along the road (a lay-by): it eases it out into the lane
      if (!pa || Math.abs(wrapA(rel - lane)) < 0.7) {   // turns in harder the further off line it is (pulling out of a parking area), but never tighter than the car could steer
        const turn = off * Math.min(1, dt * (1.8 + 2.2 * Math.abs(off))) * clamp(Math.abs(d.v) / 8, 0, 1) * (1 - Math.min(1, Math.abs(d.st) * 1.6)), most = (Math.abs(d.v) / 3.5) * dt;
        d.yaw -= clamp(turn, -most, most);
      }
    }
    // ease off behind a slower car in the same lane instead of running into it (steer out to overtake)
    { const hx = Math.sin(d.yaw), hz = Math.cos(d.yaw);
      for (const c of traffic.concat(ctraffic)) {
        if (!c.car.visible) continue;
        const dx = c.car.position.x - d.x, dz = c.car.position.z - d.z, ahead = dx * hx + dz * hz;
        if (ahead < 2 || ahead > 9 + d.v * 0.7 || Math.abs(dx * hz - dz * hx) > 1.5 || Math.cos(wrapA(d.yaw - c.car.rotation.y)) < 0.5) continue;
        const cap = c.v + Math.max(0, ahead - 8) * 0.9; if (d.v > cap) d.v -= Math.min(d.v - cap, 32 * dt);
      } }
    // other cars are solid too: box against box, in the other car's frame. Only the ones you can see: a C1 car that has
    // finished its route waits hidden wherever it left the loop (in the slow lane), and was an invisible wall there.
    for (const c of traffic.concat(ctraffic)) {
      if (!c.car.visible) continue;
      const dx = d.x - c.car.position.x, dz = d.z - c.car.position.z;
      if (Math.abs(dx) > 6 || Math.abs(dz) > 6 || Math.abs(d.y - c.car.position.y) > 2) continue;
      const cy = c.car.rotation.y, ax = Math.sin(cy), az = Math.cos(cy), along = dx * ax + dz * az, lat = dx * az - dz * ax, cu = c.car.userData;
      const co = Math.abs(Math.cos(d.yaw - cy)), si = Math.abs(Math.sin(d.yaw - cy));
      const pA = (cu.len + co * u.len + si * u.wid) / 2 - Math.abs(along), pL = (cu.wid + co * u.wid + si * u.len) / 2 - Math.abs(lat);
      if (pA <= 0 || pL <= 0) continue;
      if (pL < pA) { const k = Math.sign(lat || 1) * pL; d.x += az * k; d.z -= ax * k; if (pL > 0.03 && d.hit < 0.3) d.v *= 0.9; }   // a side swipe
      else { const k = Math.sign(along || 1) * pA; d.x += ax * k; d.z += az * k; if (pA > 0.03 && d.hit < 0.3) d.v = Math.cos(wrapA(d.yaw - cy)) > 0 ? Math.min(d.v, c.v * 0.85) : -Math.abs(d.v) * 0.25; }
      if (Math.min(pA, pL) > 0.03) d.hit = 1;   // resting against one another is not a new knock
    }
    d.hit = Math.max(0, d.hit - dt * 3); d.wall = Math.max(0, d.wall - dt * 4);
    d.y += ((pa ? pa.y : rq.y) - d.y) * Math.min(1, dt * 12);
    const RR = rq.R, slope = (RR.Y[Math.min(RR.N - 1, rq.i + 1) % RR.N] - RR.Y[Math.max(0, rq.i - 1 + (RR.closed ? RR.N : 0)) % RR.N]) / (2 * RR.ds);
    d.car.position.set(d.x, d.y, d.z);
    d.car.rotation.set(pa ? 0 : -Math.atan(slope * Math.cos(wrapA(d.yaw - tau))), d.yaw, clamp(d.st * d.v * 0.0022, -0.07, 0.07));
    if (u.tail0) u.tail.color.copy(u.tail0).multiplyScalar(brake || iv.f < -0.05 ? 2.4 : 1);
    P.x = d.x; P.z = d.z; P.y = d.y; P.face = d.yaw; P.v = 0; P.speed = 0; P.lean = 0; boost = 0;
    // You can get out once the car is stopped in a parking area with its whole body clear of the traffic lane.
    const here = idle ? null : ring.pas.find((q) => q.inside(d.x, d.z, body));
    const relY = wrapA(d.yaw - tau), reach = (Math.abs(Math.sin(relY)) * u.len + Math.abs(Math.cos(relY)) * u.wid) / 2;
    focus = here && Math.abs(d.v) < 5 && Math.abs(rq.d) - reach > laneD(rq.hw) + 1.15 ? Object.assign(here.out, { x: d.x, z: d.z, mark: d.y + u.hgt + 0.8 }) : null;
  }
  // Light traffic each way, at its own pace: it keeps to the slow lane, pulls out into the fast lane to pass a slower car
  // when that lane is clear (where the loop has two lanes), and back in once past; it keeps its distance from the car in
  // front in its lane, and from you. (Without passing, the faster cars bunched up behind the slowest into a column.)
  const traffic = [];
  { const r = rng(606); for (let k = 0; k < 12; k++) { const car = makeCar(Math.floor(r() * NCAR)), v0 = 15 + r() * 12; trafficG.add(car); traffic.push({ car, dir: k % 2 ? 1 : -1, s: ((Math.floor(k / 2) + r() * 0.8) / 6 + (k % 2) * 0.083) * ring.L % ring.L, v: v0, v0, lane: 0, lo: 0, hw: 0, lt: 0 }); } }
  const FAST = 3.6, twoLane = (hw) => hw >= 7;   // the fast lane: this much nearer the middle
  const laneD = (hw) => (hw < 3.5 ? 0 : 1.83 + 3.87 * clamp((hw - 4.5) / 3.5, 0, 1));   // a one-lane ramp: keep to its middle
  function updTraffic(dt) {
    const L = ring.L, pv = drv ? drv.v : 0;
    const gapTo = (c, o) => ((((o.s - c.s) * c.dir) % L) + L) % L;   // how far o is ahead of c, round the loop
    const clear = (c, lane, back, fwd) => !traffic.some((o) => o !== c && o.dir === c.dir && (o.lane === lane || Math.abs(o.lo - (laneD(c.hw) - lane * FAST)) < 2) && (gapTo(c, o) < fwd || gapTo(o, c) < back));
    for (const c of traffic) {
      let vt = c.v0, lead = null, lg = 1e9;
      for (const o of traffic) { if (o === c || o.dir !== c.dir || Math.abs(o.lo - c.lo) > 2) continue; const gap = gapTo(c, o); if (gap < lg) { lg = gap; lead = o; } }
      c.lt += dt;
      if (!twoLane(c.hw)) { if (c.lane) { c.lane = 0; c.lt = 0; } }
      else if (c.lane === 0 && lead && lg < 30 && lead.v0 < c.v0 - 1 && c.lt > 2 && clear(c, 1, 10, 26)) { c.lane = 1; c.lt = 0; }      // pull out to pass
      else if (c.lane === 1 && c.lt > 4 && clear(c, 0, 9, 22)) { c.lane = 0; c.lt = 0; }                                                   // and back in once past
      if (lead && lg < 18) vt = Math.min(vt, lg < 9 ? 0 : lead.v);
      if (drv && !drv.pa && rq.R === ring && Math.abs(rq.d - c.dir * c.lo) < 2.3) {
        const gap = ((((rq.s - c.s) * c.dir) % L) + L) % L;
        if (gap < 20) vt = Math.min(vt, gap < 9 ? 0 : Math.max(0, pv * Math.cos(wrapA(drv.yaw - c.car.rotation.y))));
      }
      c.v += (vt - c.v) * Math.min(1, dt * (vt < c.v ? 3 : 0.8));
      c.s = (c.s + c.dir * c.v * dt + L) % L;
      ring.at(c.s, 0, ra); c.hw = ra.hw;
      const want = Math.max(0, laneD(ra.hw) - (c.lane ? FAST : 0));
      c.lo = c.lo ? c.lo + (want - c.lo) * Math.min(1, dt * 1.1) : want;
      const dl = c.dir * c.lo, slope = (ring.Y[(ra.i + 1) % ring.N] - ring.Y[ra.i]) / ring.ds;
      c.car.position.set(ra.x + ra.tz * dl, ra.y, ra.z - ra.tx * dl);
      c.car.rotation.set(-Math.atan(slope) * c.dir, Math.atan2(ra.tx, ra.tz) + (c.dir < 0 ? Math.PI : 0), 0);
      c.car.visible = Math.abs(ra.x - P.x) < 210 && Math.abs(ra.z - P.z) < 210;
    }
  }

  // Traffic on C1, both decks: each car runs a route from the loop up an entry ramp, along the deck and down an exit
  // ramp back onto the loop, where it carries on in its lane until it is well out of sight, then starts the route again
  // (only when the start too is out of sight). It keeps its distance from the car in front on its route, and from you.
  const ctraffic = [];
  {
    const byId = (id) => ring.roads.find((q) => q.id === id), r = rng(616), ln = laneD(4.6);
    const route = (inId, mainId, outId) => {
      const A = byId(inId), M = byId(mainId), O = byId(outId); if (!A || !M || !O) return null;
      const lat = (x, z) => { const j = M.nearest(x, z); return [(x - M.X[j]) * M.TZ[j] - (z - M.Z[j]) * M.TX[j], j]; };   // the signed offset from M's centre line, as Rd.proj gives it
      const [dA, jA] = lat(A.X[A.N - 1], A.Z[A.N - 1]), [dO, jO] = lat(O.X[0], O.Z[0]), sA = Math.sign(dA) || 1, sO = Math.sign(dO) || 1, pts = [];
      for (let i = 0; i < A.N - 1; i++) pts.push(new THREE.Vector3(A.X[i], A.Y[i], A.Z[i]));
      for (let j = jA + 3; j <= jO - 3; j++) { const k = smooth(0.35, 0.65, (j - jA) / (jO - jA)), l = (sA + (sO - sA) * k) * ln; pts.push(new THREE.Vector3(M.X[j] + M.TZ[j] * l, M.Y[j], M.Z[j] - M.TX[j] * l)); }
      for (let i = 1; i < O.N; i++) pts.push(new THREE.Vector3(O.X[i], O.Y[i], O.Z[i]));
      const cv = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), n = Math.round(cv.getLength());
      const P = cv.getSpacedPoints(n);
      return { P, L: n, ds: cv.getLength() / n };
    };
    const routes = [['inL', 'c1', 'outL', 3], ['inR', 'c1', 'outR', 3], ['inLb', 'c1b', 'outLb', 2], ['inRb', 'c1b', 'outRb', 2]].map(([a, m, o, k]) => ({ R: route(a, m, o), k })).filter((q) => q.R);
    for (const { R, k } of routes) for (let i = 0; i < k; i++) {
      const car = makeCar(Math.floor(r() * NCAR)), v0 = 15 + r() * 10; trafficG.add(car);
      ctraffic.push({ car, R, st: 'run', s: ((i + 0.2 + r() * 0.4) / k) * R.L * R.ds * 0.9, v: v0, v0, rs: 0, dir: 1, d: 0, t: 0, hold: r() * 8 });
    }
  }
  const cAt = (R, s) => { const u = Math.max(0, Math.min(R.L - 1e-3, s / R.ds)), i = Math.floor(u), k = u - i, a = R.P[i], b = R.P[Math.min(R.L, i + 1)]; return [a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k, b.x - a.x, b.y - a.y, b.z - a.z]; };
  const cro = {};
  function updCTraffic(dt) {
    const far = (x, z) => Math.hypot(x - P.x, z - P.z) > 95;
    for (const c of ctraffic) {
      const R = c.R, len = R.L * R.ds;
      if (c.st === 'wait') {   // hidden at the start until nobody would see it appear, and the start is clear
        const a = R.P[0]; c.car.visible = false;
        if (far(a.x, a.z) && !ctraffic.some((o) => o !== c && o.R === R && o.st === 'run' && o.s < 14) && (c.hold -= dt) < 0) { c.st = 'run'; c.s = 0; c.v = c.v0 * 0.8; c.hold = 3 + Math.random() * 14; }   // (a while apart: released back to back they ran as a column)
        continue;
      }
      let vt = c.v0;
      if (c.st === 'run') {
        for (const o of ctraffic) { if (o === c || o.R !== R || o.st !== 'run') continue; const gap = o.s - c.s; if (gap > 0 && gap < 18) vt = Math.min(vt, gap < 9 ? 0 : o.v); }
      }
      { const hx = Math.sin(c.car.rotation.y), hz = Math.cos(c.car.rotation.y), dx = P.x - c.car.position.x, dz = P.z - c.car.position.z, ahead = dx * hx + dz * hz;   // you, just ahead in its lane
        if (drv && ahead > 0 && ahead < 18 && Math.abs(dx * hz - dz * hx) < 2.2 && Math.abs(P.y - c.car.position.y) < 2) vt = Math.min(vt, ahead < 8 ? 0 : Math.max(0, drv.v)); }
      c.v += (vt - c.v) * Math.min(1, dt * (vt < c.v ? 3 : 0.8));
      if (c.st === 'run') {
        c.s += c.v * dt;
        if (c.s >= len) {   // off the end of the exit ramp: on along the loop in this lane
          const e = R.P[R.L], e0 = R.P[R.L - 2]; ring.proj(e.x, e.z, -1, cro);
          c.st = 'ring'; c.rs = cro.s; c.d = cro.d; c.dir = (e.x - e0.x) * cro.tx + (e.z - e0.z) * cro.tz >= 0 ? 1 : -1; c.t = 0;
        } else {
          const [x, y, z, tx, ty, tz] = cAt(R, c.s), h = Math.hypot(tx, tz) || 1;
          c.car.position.set(x, y, z); c.car.rotation.set(-Math.atan(ty / h), Math.atan2(tx, tz), 0);
        }
      }
      if (c.st === 'ring') {
        c.rs = (c.rs + c.dir * c.v * dt + ring.L) % ring.L; c.t += dt; ring.at(c.rs, 0, ra);
        c.d += (c.dir * laneD(ra.hw) - c.d) * Math.min(1, dt * 0.8);   // into the slow lane
        c.car.position.set(ra.x + ra.tz * c.d, ra.y, ra.z - ra.tx * c.d); c.car.rotation.set(0, Math.atan2(ra.tx, ra.tz) + (c.dir < 0 ? Math.PI : 0), 0);
        if (far(c.car.position.x, c.car.position.z) || c.t > 40) { c.st = 'wait'; c.car.visible = false; continue; }
      }
      c.car.visible = Math.abs(c.car.position.x - P.x) < 210 && Math.abs(c.car.position.z - P.z) < 210;
    }
  }

  /* ================= UI helpers ================= */
  let bannerT, toastT;
  function banner(en, jp) { $('#bannerEn').textContent = en; $('#bannerJp').textContent = jp; const b = $('#banner'); b.classList.add('show'); clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.remove('show'), 1900); }
  function toast(msg, ms = 2600) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (el.hidden = true), ms); }
  function meterHTML(n) { return '<i></i>'.repeat(n); }
  $('#npMeter').innerHTML = meterHTML(8);
  function setMeter(el, v) { const is = el.children, on = Math.round(clamp(v, 0, 1) * is.length); for (let i = 0; i < is.length; i++) is[i].classList.toggle('on', i < on); }
  function updateFound() { $('#discs').innerHTML = places.map((p) => (p.found ? `<i class="on" style="background:${esc(p.color)}"></i>` : '<i></i>')).join(''); }

  function region() {
    let best = null, bd = 1e9;
    for (const p of places) { const d = Math.hypot(P.x - p.vx, P.z - p.vz); if (d < bd) { bd = d; best = p; } }
    if (best && bd < 26) return [best.song.placeEn, best.song.place, best];
    if (Math.hypot(P.x, P.z) < PLAZA_R + 4) return ['PLAZA', 'はじまりの広場'];
    return ['FIELD', '野原'];
  }
  function updateRegion(show) {
    const [en, jp] = region();
    if (en === regionKey) return;
    regionKey = en;
    $('#locName').textContent = jp;
  }

  /* ================= in-game phone ================= */
  // The player's own device: pull it out for the map, the songs found so far, the next show and the shop.
  const PHI = {
    map: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6zM9 4v14M15 6v14"/></svg>',
    music: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/></svg>',
    live: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="10" rx="1.5"/><path d="M8 7v10M16 7v10M11 12h2"/></svg>',
    shop: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1.2 12H6.2L5 8z"/><path d="M9 8V6a3 3 0 016 0v2"/></svg>',
    store: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3a9 9 0 019 9"/></svg>',
  };
  /* ================= the shop: purchases, previews, play counts ================= */
  // Songs bought here are kept per device, and only once the shop server (CFG.api, the NS HACK site) has asked Stripe
  // whether the Checkout Session was paid. Without CFG.api nothing here talks to a server: the buy buttons open each
  // song's store link and no play counts are shown. Which songs are previews is SW.isPreview (audio.js).
  const API = CFG.api ? String(CFG.api).replace(/\/+$/, '') : null, OWN_KEY = 'soundwalk-owned', PEND_KEY = 'soundwalk-pending';
  try { Object.assign(SW.owned, JSON.parse(localStorage.getItem(OWN_KEY) || '{}') || {}); } catch (e) { /* storage blocked */ }
  const saveOwned = () => { try { localStorage.setItem(OWN_KEY, JSON.stringify(SW.owned)); } catch (e) { /* storage blocked: owned for this visit only */ } };
  const pend = (sid) => { try { if (sid) localStorage.setItem(PEND_KEY, sid); else localStorage.removeItem(PEND_KEY); } catch (e) { /* storage blocked */ } };
  const shop = { counts: null, prices: null, at: 0, ok: null, checkout: false, failUntil: 0, notes: [] };
  const apiCall = (path, body) => fetch(API + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
    .then((r) => r.json().catch(() => ({})).then((d) => (r.ok ? d : Promise.reject(Object.assign(new Error(d.error || 'HTTP ' + r.status), { status: r.status })))));
  // The server's catalogue decides the price. A price button is shown only once the server has answered and says it can
  // take payments (a STRIPE_SECRET_KEY is set); before that, while it cannot be reached, and for a while after a Checkout
  // that failed, the buttons are the songs' store links instead.
  const priceOf = (s) => (API ? (shop.prices && shop.prices[s.id]) || null : s.price || null);
  const canCheckout = (s) => !!(API && shop.ok && shop.checkout && Date.now() > shop.failUntil && priceOf(s));
  const buttonsKey = () => places.map((p) => +canCheckout(p.song) + ':' + priceOf(p.song)).join();
  const isOwned = (s) => !!SW.owned[s.id];
  const fmtPlays = (n) => (n < 1000 ? String(n) : n < 1e6 ? (n / 1e3).toFixed(n < 1e4 ? 1 : 0).replace(/\.0$/, '') + 'K' : (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M');
  const playsOf = (s) => (shop.counts && Number.isFinite(shop.counts[s.id]) && (s.src || shop.counts[s.id] > 0) ? shop.counts[s.id] : null);   // a sketch's zero says nothing
  // Messages from the shop wait for the title screen to go.
  function note(msg) { if (mode === 'load' || mode === 'title') shop.notes.push(msg); else toast(msg, 4600); }
  function loadCounts(force) {
    if (!API || (!force && Date.now() - shop.at < 30000)) return;
    shop.at = Date.now();
    const before = buttonsKey();
    apiCall('/plays').then((d) => {
      shop.counts = d.counts || {}; if (d.prices) shop.prices = d.prices; shop.ok = true; shop.checkout = d.checkout !== false;
      shopRefresh(buttonsKey() !== before);
    }).catch(() => { shop.ok = false; shop.at -= 20000; shopRefresh(buttonsKey() !== before); });   // store links for now; the next look after 10 s asks again
  }
  function postPlay(id) {
    if (!API) return;
    apiCall('/play', { songId: id }).then((d) => { if (Number.isFinite(d.plays)) { (shop.counts = shop.counts || {})[id] = d.plays; shopRefresh(); } }).catch(() => {});
  }
  // Back from Checkout: ?sw_paid=<session id> is only a claim until the shop server has asked Stripe about it.
  // A failed check (offline, server down) is kept and asked again at the next visit or the next look at the store; right
  // after Checkout (loud) it is first tried twice more within seconds, and the buyer is told it is still being checked.
  // A payment that completes later (a convenience-store payment, a bank transfer) comes back as pending and is kept too.
  let checking = null;
  function verify(sid, loud, tries = 0) {
    if (!API || !sid || (checking === sid && !tries)) return;
    checking = sid;
    apiCall('/verify?session_id=' + encodeURIComponent(sid)).then((d) => {
      checking = null;
      if (d.pending) { pend(sid); if (loud) note('お支払いの完了を待っています。済みしだい、この端末でフルで聴けるようになります'); return; }
      pend(null);
      const p = d.paid && places.find((q) => q.song.id === d.songId);
      if (!p) { note('お支払いを確認できませんでした'); return; }
      SW.owned[p.song.id] = { sid, at: Date.now() }; saveOwned();
      if (SW.Audio.ctx) SW.Audio.unlock(p.song.id);
      note(`♪ ${p.song.title} — ありがとうございます。この端末ではフルで聴けます`);
      shopRefresh(true);
    }).catch((e) => {
      checking = null;
      if (e.status && e.status < 500) { pend(null); note('お支払いを確認できませんでした'); return; }
      pend(sid);
      if (loud && tries < 2) setTimeout(() => verify(sid, true, tries + 1), 3000 * (tries + 1));
      else if (loud) note('お支払いを確認しています… つながりしだい、もう一度確認します');
    });
  }
  {
    const q = new URLSearchParams(location.search), sid = q.get('sw_paid'), cancel = q.get('sw_cancel');
    if (sid !== null || cancel !== null) {
      history.replaceState(null, '', location.pathname + location.hash);   // a reload must not ask again
      if (sid) verify(sid, true); else note('購入をキャンセルしました');
    } else retryPending();
  }
  function retryPending() { let sid = null; try { sid = localStorage.getItem(PEND_KEY); } catch (e) { /* storage blocked */ } verify(sid); }
  async function buy(p, btn) {
    const s = p.song, link = (s.links || []).find((l) => l.kind === 'buy');
    if (!canCheckout(s)) { if (link) window.open(link.url, '_blank', 'noopener'); return; }
    btn.disabled = true; const label = btn.innerHTML; btn.textContent = '…';
    try {
      const d = await apiCall('/checkout', { songId: s.id, returnUrl: location.origin + location.pathname });
      if (!d.url) throw new Error('no checkout url');
      save(); SW.Audio.player.stop();   // Checkout replaces this page; it comes back to the same spot
      location.href = d.url;
      return;
    } catch (e) {
      shop.failUntil = Date.now() + 120000;   // the buttons fall back to the store links for a couple of minutes
      toast(link ? '購入ページを開けませんでした。ストアのリンクからどうぞ。' : '購入ページを開けませんでした。時間をおいてお試しください。', 3800);
      shopRefresh(true);
    }
    btn.disabled = false; btn.innerHTML = label;
  }
  // The main button for a song: owned, a direct sale through the shop server, the store link, or not yet.
  function buyHTML(p, i) {
    const s = p.song, link = (s.links || []).find((l) => l.kind === 'buy');
    if (isOwned(s)) return `<button class="btn owned" type="button" disabled aria-label="${esc(s.title)} は購入済み">${IC.check}<span>OWNED</span></button>`;
    if (canCheckout(s)) return `<button class="btn primary" type="button" data-buy="${i}" aria-label="${esc(s.title)} を ${yen(priceOf(s))} で買う">${IC.cart}<span>${yen(priceOf(s))}</span></button>`;
    if (link) return `<a class="btn primary" href="${esc(link.url)}" target="_blank" rel="noopener" aria-label="${esc(s.title)}：${esc(link.label)}">${IC.cart}<span>BUY ↗</span></a>`;
    return '<button class="btn" type="button" disabled aria-label="準備中">SOON</button>';
  }
  // What kind of listen it is: a preview of the unreleased, the full song, or the stand-in sketch.
  function tagOf(s) {
    if (!s.src) return CFG.demo ? '<span class="tr-tag">DEMO</span>' : '<span class="tr-tag">COMING SOON</span>';
    if (SW.isPreview(s)) return `<span class="tr-tag pv">PREVIEW ${CFG.preview || 20}s</span>`;
    return '<span class="tr-tag">FULL</span>';
  }

  // The store player (SoundCloud-like): play / pause, the waveform with the playhead (a preview lights the stretch of the
  // song it is playing), time, plays, and the buy button. The waveform is the real one once the file has been read on
  // this device, a stand-in until then; it is the same row in the phone's STORE and MUSIC and at the shop's counter.
  const player = SW.Audio.player, waves = {};
  function waveOf(s) {
    if (waves[s.id]) return waves[s.id];
    const real = SW.Audio.cachedPeaks(s);
    if (real) return (waves[s.id] = { pk: real, real: true });
    let h = 2166136261; for (const ch of s.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    const r = rng(h), n = 120; let v = 0.55;
    return (waves[s.id] = { real: false, pk: Array.from({ length: n }, (_, i) => { v = clamp(v + (r() - 0.5) * 0.3, 0.25, 1); return Math.max(0.06, v * (0.55 + 0.45 * r()) * Math.min(1, (i + 1) / 6, (n - i) / 8)); }) });
  }
  const mmss = (x) => { x = Math.max(0, Math.floor(x || 0)); return `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`; };
  function timeOf(inf) {
    if (inf.demo) return mmss(inf.el);   // a sketch loops: just how long it has been on
    if (inf.a != null && inf.state !== 'stop') return `${mmss(clamp(inf.t - inf.a, 0, inf.len))} / ${mmss(inf.len)}`;
    if (inf.preview) return `0:00 / ${mmss(inf.len)}`;
    return `${mmss(inf.state === 'stop' ? 0 : inf.t)} / ${inf.dur ? mmss(inf.dur) : '-:--'}`;
  }
  function trackHTML(p, i, bare, noBuy) {
    const s = p.song, n = playsOf(s), sub = [s.artist || CFG.artist, s.year, p.found ? s.place : '未発見'].filter(Boolean).join(' · ');
    const lis = !bare && (s.links || []).find((l) => l.kind !== 'buy');   // the song where it is out already (SoundCloud): a demo here is not it
    return `<div class="tr" data-tr="${i}" style="--c:${esc(p.found ? p.color : '#b3161d')}">`
      + `<button class="tr-play" type="button" data-play="${i}" aria-label="${esc(s.title)} を再生"${!s.src && !CFG.demo ? ' disabled' : ''}>${IC.play}${IC.pause}</button>`
      + `<div class="tr-main">${bare ? '' : `<span class="nm">${esc(s.title)}<small>${esc(sub)}</small></span>`}`
      + `<canvas class="tr-wave" data-seek="${i}" aria-hidden="true"></canvas>`
      + `<div class="tr-foot"><span class="tr-time">${timeOf(player.info(s))}</span>${tagOf(s)}<span class="tr-plays" data-plays="${esc(s.id)}"${n == null ? ' hidden' : ''}>▶ ${n == null ? '' : fmtPlays(n)}</span>`
      + (lis ? `<a class="tr-lis" href="${esc(lis.url)}" target="_blank" rel="noopener" title="${esc(lis.label)}" aria-label="${esc(s.title)}：${esc(lis.label)}">${IC.play}<span>LISTEN ↗</span></a>` : '')
      + (noBuy ? '' : `<span class="tr-buy">${buyHTML(p, i)}</span>`) + '</div></div></div>';
  }
  function drawWave(cv, p, inf) {
    const dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d'), w = waveOf(p.song), n = w.pk.length, bw = W / n, base = H * 0.74;
    const dur = inf.dur || 0, head = inf.state !== 'stop' && dur ? clamp(inf.t / dur, 0, 1) : 0;
    const a = inf.a != null && dur ? inf.a / dur : null, b = a != null ? (inf.a + inf.len) / dur : null;
    const col = getComputedStyle(cv.closest('.tr')).getPropertyValue('--c').trim() || '#b3161d';
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    if (a != null) { g.fillStyle = 'rgba(224,178,90,.12)'; g.fillRect(a * W, 0, (b - a) * W, H); }   // the excerpt's stretch
    for (let k = 0; k < n; k++) {
      const x = k * bw, u = (k + 0.5) / n, h = Math.max(1.5, w.pk[k] * base * (w.real ? 1 : 0.8));
      const lit = inf.state !== 'stop' && u <= head && (a == null || u >= a);
      g.globalAlpha = lit ? 1 : a != null && u >= a && u <= b ? 0.62 : inf.preview && a == null ? 0.3 : 0.42;
      g.fillStyle = lit ? col : '#d8d2c0';
      g.fillRect(x + bw * 0.18, base - h, Math.max(1, bw * 0.64), h);
      g.globalAlpha *= 0.35; g.fillRect(x + bw * 0.18, base + 1, Math.max(1, bw * 0.64), h * 0.3);   // the reflection
    }
    g.globalAlpha = 1;
    if (inf.state !== 'stop' && dur) { g.fillStyle = '#d8d2c0'; g.fillRect(Math.round(head * W) - 0.5, 0, 1, H); }
  }
  // Each frame while the phone or the counter is open: only rows whose state moved are redrawn.
  let plT = 0;
  function playerUI(dt) {
    if ((plT -= dt) > 0) return;
    plT = 1 / 20;
    for (const el of phScreen.querySelectorAll('[data-tr]')) {
      const p = places[+el.dataset.tr], inf = player.info(p.song), cv = el.querySelector('.tr-wave');
      const on = inf.state === 'play';
      if (el.classList.contains('on') !== on) { el.classList.toggle('on', on); el.querySelector('.tr-play').setAttribute('aria-label', `${p.song.title} を${on ? '一時停止' : '再生'}`); }
      el.classList.toggle('wait', !!inf.waiting);
      const tx = timeOf(inf), tEl = el.querySelector('.tr-time'); if (tEl.textContent !== tx) tEl.textContent = tx;
      const key = `${inf.state}${(inf.t || 0).toFixed(2)}${inf.a}${cv.clientWidth}${waveOf(p.song).real}`;
      if (cv.dataset.k !== key) { cv.dataset.k = key; drawWave(cv, p, inf); }
    }
  }
  function wantWave(s) { if (s.src && !waveOf(s).real) SW.Audio.peaks(s).then((pk) => { if (pk) { waves[s.id] = { pk, real: true }; plT = 0; } }); }
  function playTrack(p) { player.toggle(p.song); wantWave(p.song); }
  // The counts, prices and owned marks changed: update what is on screen (the whole list only when a button changes).
  function shopRefresh(buttons) {
    if (buttons && spot.p) spotRender();
    if (buttons && mode === 'phone' && (phView === 'store' || phView === 'song')) phRender(true);
    else for (const el of document.querySelectorAll('[data-plays]')) { const p = places.find((q) => q.song.id === el.dataset.plays), n = p ? playsOf(p.song) : null; el.hidden = n == null; if (n != null) el.textContent = '▶ ' + fmtPlays(n); }
  }
  // Play counts: a play is one real listen — the song itself heard on its own (the store player, its view, or riding it)
  // for PLAY_S seconds. It counts once, and again only after it has been out of earshot for a while (a replay).
  // Listening time is read off the song's own clock (what was actually played), so a slow frame rate cannot skew it; a
  // step of it counts when it fits the time that passed, so a seek or the next excerpt (a jump) does not, a long frame does.
  const PLAY_S = 6, listens = {};
  let countAt = 0;
  function countTick() {
    if (!API || !SW.Audio.started) return;
    const A = SW.Audio, now = performance.now() / 1000, wall = countAt ? now - countAt : 0, dt = Math.min(2, wall);
    countAt = now;
    let ch = player.state === 'play' ? player.ch : null;
    if (!ch) { const p = ride && ride.p; ch = p ? A.channels[p.idx] : null; }
    const id = ch && ch.mode === 'media' && ch.audible() && !A.muted && A.ctx.state === 'running' ? ch.song.id : null;
    for (const k in listens) if (k !== id) { const L = listens[k]; L.at = null; if ((L.idle += dt) > 30) delete listens[k]; }
    if (!id) return;
    const L = (listens[id] = listens[id] || { heard: 0, sent: false, idle: 0, at: null }), ct = ch.el.currentTime, d = L.at == null ? 0 : ct - L.at;
    L.idle = 0; L.at = ct;
    if (d > 0 && d <= wall + 0.5) L.heard += d;
    if (!L.sent && L.heard >= PLAY_S) { L.sent = true; postPlay(id); }
  }

  // The record store: every song as a player row, with its price and where to buy it. The same list is the phone's STORE
  // app and the counter of the record shop on the plaza. Songs you have not found yet are on sale too; the list just says so.
  function storeHTML() {
    const STORE = CFG.store || { name: 'RECORDS' }, rows = places.map((p, i) => (p.song.store === false ? '' : trackHTML(p, i))).join('');
    return `<h3 class="ph-h">${esc(STORE.name)}</h3><p class="ph-sub">${places.filter((p) => p.song.store !== false).length} SONGS · DIGITAL</p>${rows}`;
  }
  let phView = 'home', phSong = null;
  const phScreen = $('#phScreen');
  function phRender(keep) {
    const d = new Date(), was = keep && document.activeElement && phScreen.contains(document.activeElement) ? document.activeElement : null;
    const wasSel = was && ['data-play', 'data-buy', 'data-go', 'data-song', 'data-warp'].map((a) => (was.hasAttribute(a) ? `[${a}="${was.getAttribute(a)}"]` : '')).find(Boolean);
    $('#phClock').textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    $('#phCount').textContent = `♪ ${places.filter((p) => p.found).length}/${places.length}`;
    let h = '';
    if (phView === 'home') {
      const apps = [['map', 'MAP'], ['music', 'MUSIC'], ['store', 'STORE']];
      if (CFG.live) apps.push(['live', 'LIVE']);
      if (CFG.shop && CFG.shop.url) apps.push(['shop', 'SHOP']);
      h = '<div class="ph-grid">' + apps.map(([k, n]) => `<button class="ph-app" type="button" data-go="${k}">${PHI[k]}<span>${n}</span></button>`).join('') + '</div>';
    } else if (phView === 'music') {
      h = '<h3 class="ph-h">MUSIC</h3>' + places.map((p, i) => p.found
        ? `<button class="ph-row" type="button" data-song="${i}"><span class="dot" style="background:${esc(p.color)}"></span><span class="nm">${esc(p.song.title)}<small>${esc(p.song.artist || CFG.artist)}</small></span></button>`
        : '<button class="ph-row" type="button" disabled><span class="dot" style="background:#55524a"></span><span class="nm">？</span></button>').join('');
    } else if (phView === 'song' && phSong) {
      const s = phSong.song, links = (s.links || []).filter((l) => l.kind !== 'buy' || canCheckout(s) || isOwned(s)).map((l) => `<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener" aria-label="${esc(l.label)}">${l.kind === 'buy' ? IC.cart + '<span>STORE ↗</span>' : IC.play + '<span>LISTEN ↗</span>'}</a>`).join('');
      h = songPage(phSong, links);
    } else if (phView === 'store') {
      h = storeHTML();
    } else if (phView === 'live') {
      h = `<h3 class="ph-h">NEXT LIVE</h3><p class="ph-big">${esc(CFG.live.date || '')}</p><p class="ph-sub">${esc(CFG.live.place || '')}</p>`;
    } else if (phView === 'shop') {
      let host = CFG.shop.url; try { host = new URL(CFG.shop.url).host; } catch (e) { /* keep */ }
      h = `<h3 class="ph-h">SHOP</h3><p class="ph-big">${esc(CFG.shop.name || host)}</p><p class="ph-sub">${esc(host)}</p><div class="ph-acts"><a class="btn primary" href="${esc(CFG.shop.url)}" target="_blank" rel="noopener">GO ↗</a></div>`;
    }
    const top = phScreen.scrollTop;
    phScreen.innerHTML = h;
    if (keep) phScreen.scrollTop = top;
    const first = (wasSel && phScreen.querySelector(wasSel)) || phScreen.querySelector('button:not([disabled]), a');
    (first || $('#phClose')).focus({ preventScroll: true });
    plT = 0; playerUI(0);
  }
  // The song's page, the purchase screen: anyone should see at a glance what it is and what to press. A jacket in the
  // song's colour, the title, the player (▶ to listen), then ONE big button that says in words what it does (buy for
  // ¥200 / buy at the store / bought / not yet), a line saying what happens next, and the lesser links below.
  function songPage(p, links) {
    const s = p.song, i = places.indexOf(p), link = (s.links || []).find((l) => l.kind === 'buy');
    let big, note;
    if (isOwned(s)) { big = `<button class="btn owned big" type="button" disabled>${IC.check}<span>購入済み</span></button>`; note = 'この端末で、いつでもフルで聴けます。'; }
    else if (canCheckout(s)) { big = `<button class="btn primary big" type="button" data-buy="${i}" aria-label="${esc(s.title)} を ${yen(priceOf(s))} で買う">${IC.cart}<span>${yen(priceOf(s))} で買う</span></button>`; note = 'お支払いの画面に進みます（カードなど）。買うと、この端末でフルで聴けます。'; }
    else if (link) { big = `<a class="btn primary big" href="${esc(link.url)}" target="_blank" rel="noopener">${IC.cart}<span>ストアで買う ↗</span></a>`; note = '配信ストアのページが開きます。'; }
    else { big = '<button class="btn big" type="button" disabled><span>準備中</span></button>'; note = 'まだ買えません。'; }
    if (SW.isPreview(s) && !isOwned(s)) note = `▶ で${CFG.preview || 20}秒だけ試聴できます。` + note;
    const sub = [s.artist || CFG.artist, s.year].filter(Boolean).join(' · ');
    return `<div class="ph-head"><div class="ph-jacket" style="--c:${esc(p.color)}" aria-hidden="true"></div><div class="ph-t"><p class="ph-big">${esc(s.title)}</p><p class="ph-sub">${esc(sub)}</p>${p.found ? `<p class="ph-sub">${esc(s.place)}</p>` : ''}</div></div>`
      + trackHTML(p, i, true, true) + `<div class="ph-buy">${big}</div><p class="ph-note">${note}</p>`
      + `<div class="ph-acts">${links}${phDirect ? '<button class="btn" type="button" data-back="1"><span>‹ もどる</span></button>' : `<button class="btn" type="button" data-warp="1">${PHI.map}<span>ここへ行く</span></button>`}</div>`;
  }
  let phDirect = false;   // the page was opened straight from a light ring: back goes back to the world
  function openSong(p) { if (mode !== 'walk' || !p) return; phSong = p; openPhone('song'); phDirect = true; phRender(); }
  function openPhone(view, counter) {
    if (mode !== 'walk') return;
    mode = 'phone'; keys.clear(); auto = null; phView = view || 'home'; phDirect = false;
    document.body.classList.add('busy'); if (!counter) { avatar.setPhone(true); document.body.classList.add('phoning'); }
    $('#phone').classList.toggle('counter', !!counter);   // at the shop's counter the store opens as a big catalogue, not on the phone
    $('#phone').hidden = false; phRender();
    loadCounts(); retryPending();
  }
  const openStore = () => openPhone('store', true);
  function closePhone() {
    if (mode !== 'phone') return;
    mode = 'walk'; $('#phone').hidden = true; $('#phone').classList.remove('counter'); document.body.classList.remove('busy', 'phoning'); avatar.setPhone(false); phDirect = false;
    player.stop();   // the store player is a listening booth: the places take over again
    cv.focus({ preventScroll: true });
  }
  function phoneBack() { if (phView === 'home' || phDirect || $('#phone').classList.contains('counter')) closePhone(); else { phView = phView === 'song' ? 'music' : 'home'; phRender(); } }
  function phoneKey(e) {
    if (e.code === 'KeyP' || e.code === 'Tab') { e.preventDefault(); if (!e.repeat) closePhone(); return; }
    if (e.key === 'Escape' || e.key === 'Backspace' || e.code === 'KeyX') { e.preventDefault(); if (!e.repeat) phoneBack(); return; }
    const dir = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (dir) { e.preventDefault(); phoneFocus(dir); }
  }
  function phoneFocus(dir) {
    const list = [...phScreen.querySelectorAll('button:not([disabled]), a')];
    if (list.length) { const i = list.indexOf(document.activeElement); list[(i + dir + list.length) % list.length].focus({ preventScroll: true }); }
  }
  phScreen.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go], [data-song], [data-warp], [data-buy], [data-play], [data-seek], [data-back]');
    if (!b) return;
    if (b.dataset.buy !== undefined) { buy(places[+b.dataset.buy], b); return; }
    if (b.dataset.play !== undefined) { playTrack(places[+b.dataset.play]); plT = 0; return; }
    if (b.dataset.seek !== undefined) {   // a full song jumps there; a preview just plays (its excerpt is chosen for you)
      const p = places[+b.dataset.seek], r = b.getBoundingClientRect();
      if (player.seek(p.song, (e.clientX - r.left) / r.width)) wantWave(p.song); else if (player.song !== p.song || player.state !== 'play') playTrack(p);
      plT = 0; return;
    }
    if (b.dataset.go === 'map') { closePhone(); openMap(); }
    else if (b.dataset.go) { phView = b.dataset.go; phRender(); }
    else if (b.dataset.song !== undefined) { phSong = places[+b.dataset.song]; phView = 'song'; phRender(); }
    else if (b.dataset.warp && phSong) { closePhone(); warpTo(phSong); }
    else if (b.dataset.back) phoneBack();
  });
  $('#phBack').addEventListener('click', phoneBack);
  $('#phHome').addEventListener('click', () => { if ($('#phone').classList.contains('counter')) { closePhone(); return; } phView = 'home'; phRender(); });
  $('#phClose').addEventListener('click', closePhone);
  $('#phoneBtn').addEventListener('click', () => (mode === 'phone' ? closePhone() : openPhone()));

  /* ================= leaving for another site ================= */
  function openConfirm(ia) {
    if (!ia.url) return;
    mode = 'confirm'; keys.clear(); auto = null; document.body.classList.add('busy');
    let host = ia.url; try { host = new URL(ia.url).host; } catch (e) { /* keep as written */ }
    $('#cfName').textContent = ia.name || host;
    $('#cfHost').textContent = host;
    $('#cfYes').href = ia.url;
    $('#confirm').hidden = false;
    $('#cfYes').focus({ preventScroll: true });
  }
  function closeConfirm() { if (mode !== 'confirm') return; mode = 'walk'; $('#confirm').hidden = true; document.body.classList.remove('busy'); cv.focus({ preventScroll: true }); }
  $('#cfNo').addEventListener('click', closeConfirm);
  $('#cfYes').addEventListener('click', () => setTimeout(closeConfirm, 300));   // the link itself opens the site (a real click, so it is not blocked)

  /* ================= dialog ================= */
  let dlg = null;
  function say(lines) { mode = 'dialog'; keys.clear(); dlg = { lines, i: 0, shown: 0 }; $('#dialog').hidden = false; document.body.classList.add('busy'); renderDlg(); }
  function renderDlg() { $('#dlgText').textContent = dlg.lines[dlg.i].slice(0, Math.floor(dlg.shown)); }
  function tickDlg(dt) { if (!dlg) return; const L = dlg.lines[dlg.i].length; if (dlg.shown < L) { dlg.shown = Math.min(L, dlg.shown + dt * 55); renderDlg(); } }
  function advance() {
    if (!dlg) return;
    const L = dlg.lines[dlg.i].length;
    if (dlg.shown < L) { dlg.shown = L; renderDlg(); return; }
    dlg.i++;
    if (dlg.i >= dlg.lines.length) { dlg = null; $('#dialog').hidden = true; document.body.classList.remove('busy'); mode = 'walk'; return; }
    dlg.shown = 0; renderDlg();
  }

  /* ================= input ================= */
  const keys = new Set(), stick = { x: 0, y: 0, id: null };
  const KEYMAP = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
  let running = false;
  function inputVec() {
    let f = 0, s = 0;
    if (keys.has('f')) f += 1; if (keys.has('b')) f -= 1; if (keys.has('r')) s += 1; if (keys.has('l')) s -= 1;
    f += -stick.y; s += stick.x;
    if (padV) { f += -padV.y; s += padV.x; }
    const m = Math.hypot(f, s);
    if (m > 1) { f /= m; s /= m; }
    return { f, s, m: Math.min(1, m) };
  }
  /* ================= mini-games: free throws on FIELD's court, pool in the hall on the plaza ================= */
  const MG_KEY = 'soundwalk-games';
  const mgBest = (() => { try { return JSON.parse(localStorage.getItem(MG_KEY) || '{}') || {}; } catch (e) { return {}; } })();
  const mgSave = () => { try { localStorage.setItem(MG_KEY, JSON.stringify(mgBest)); } catch (e) { /* storage blocked */ } };
  const fieldPlace = places.find((q) => q.song.scene === 'field');
  ((fieldPlace && fieldPlace.freeThrow) || []).forEach((h) => interact.push({ kind: 'hoop', hoop: h, x: h.spot.x, z: h.spot.z, sx: h.spot.x, sz: h.spot.z, r: 1.8, mark: 2.4 }));
  // Free throws: a marker runs up and down the meter; stop it in the green band. On the beat of the music the band is
  // a little more forgiving. Too low and the ball falls short off the front of the rim, too high and it comes off the board.
  let hoop = null;
  function hoopHud(say) {
    $('#miScore').textContent = `${hoop.made} / ${hoop.shots}\nSTREAK ${hoop.streak}\nBEST ${mgBest.hoop || 0}`;
    if (say !== undefined) $('#miSay').textContent = say;
  }
  function startHoop(h) {
    mode = 'hoop'; keys.clear(); auto = null; document.body.classList.add('busy'); $('#prompt').hidden = true; lastFocus = undefined;
    P.x = h.spot.x; P.z = h.spot.z; P.face = Math.atan2(h.rim.x - P.x, h.rim.z - P.z); P.speed = 0;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), mat('#c8602a', { rough: 0.7 })); ball.castShadow = true; scene.add(ball);
    hoop = { h, ball, st: 'aim', ph: Math.random() * 3, m: 0, wait: 0, segs: [], made: 0, shots: 0, streak: 0, dx: Math.sin(P.face), dz: Math.cos(P.face) };
    $('#mgame').hidden = false; $('#miTitle').textContent = 'FREE THROW'; hoopHud('緑で止めてシュート');
    camHold = (c) => { const H = hoop; if (!H) return; c.up.set(0, 1, 0); c.position.set(H.h.spot.x - H.dx * 3.6 + H.dz * 0.9, P.y + 2.4, H.h.spot.z - H.dz * 3.6 - H.dx * 0.9); c.lookAt(H.h.rim.x, 2.6, H.h.rim.z); };
    if (!TOUCH) $('#miShoot').focus({ preventScroll: true });
  }
  function endHoop() {
    if (!hoop) return;
    scene.remove(hoop.ball); hoop = null; camHold = null;
    mode = 'walk'; $('#mgame').hidden = true; document.body.classList.remove('busy');
    snapCam(); camBlendDur = 0.6; cv.focus({ preventScroll: true });
  }
  function hoopShoot() {
    const H = hoop; if (!H || H.st !== 'aim') return;
    const pulse = (fieldPlace && fieldPlace.f && fieldPlace.f.pulse) || 0, tol = pulse > 0.5 ? 0.02 : 0, e = H.m - 0.85;
    const R = H.h.rim, dx = H.dx, dz = H.dz, sx = -dz, sz = dx, side = (Math.random() - 0.5) * 1.6, at = (f, y, s = 0) => [R.x + dx * f + sx * s, y, R.z + dz * f + sz * s];
    const hands = [P.x + dx * 0.35, 1.6, P.z + dz * 0.35];
    let res, segs;
    if (Math.abs(e) <= 0.05 + tol) { res = 'SWISH!'; segs = [[hands, at(0, R.y + 0.14), 0.95, 1.7], [null, at(0, 0.12), 0.45, 0], [null, at(-2.2, 0.12, side), 0.9, 0.5]]; }
    else if (Math.abs(e) <= 0.1 + tol) { res = 'IN'; segs = [[hands, at(e < 0 ? -0.2 : 0.18, R.y + 0.1), 0.95, 1.7], [null, at(e < 0 ? 0.08 : -0.06, R.y + 0.42), 0.28, 0], [null, at(0, 0.12), 0.6, 0.15], [null, at(-2, 0.12, side), 0.9, 0.5]]; }
    else if (e < 0) { res = 'SHORT'; segs = [[hands, at(-0.32, R.y + 0.04), 0.95, 1.6 + e], [null, at(-2.4, 0.12, side), 0.85, 0.7]]; }
    else { res = 'LONG'; segs = [[hands, at(0.42, R.y + 0.55), 0.95, 1.5], [null, at(-0.5, R.y + 0.15, side * 0.4), 0.35, 0.2], [null, at(-1.8, 0.12, side), 0.6, 0.35]]; }
    const made = res === 'SWISH!' || res === 'IN';
    H.shots++; if (made) { H.made++; H.streak++; if (H.streak > (mgBest.hoop || 0)) { mgBest.hoop = H.streak; mgSave(); } } else H.streak = 0;
    H.segs = segs.map(([a, b, dur, arc]) => ({ a, b, dur, arc, t: 0 })); H.st = 'fly'; H.res = res; H.said = false;
    hoopHud('');
  }
  function hoopTick(dt) {
    const H = hoop; if (!H) return;
    const pulse = (fieldPlace && fieldPlace.f && fieldPlace.f.pulse) || 0;
    $('.mi-meter').classList.toggle('hot', pulse > 0.5);
    if (H.st === 'aim') {
      H.ph += dt * 3.1; H.m = 0.5 - 0.5 * Math.cos(H.ph); $('#miMark').style.bottom = `${(H.m * 100).toFixed(1)}%`;
      H.ball.position.set(P.x + H.dx * 0.35, 1.6 + Math.sin(H.ph * 2) * 0.03, P.z + H.dz * 0.35);
    } else if (H.st === 'fly') {
      const s = H.segs[0]; if (!s.a) s.a = H.ball.position.toArray();
      s.t += dt; const k = Math.min(1, s.t / s.dur);
      H.ball.position.set(s.a[0] + (s.b[0] - s.a[0]) * k, s.a[1] + (s.b[1] - s.a[1]) * k + s.arc * 4 * k * (1 - k), s.a[2] + (s.b[2] - s.a[2]) * k);
      H.ball.rotation.x -= dt * 8;
      if (k >= 1) {
        H.segs.shift();
        if (!H.said) { H.said = true; hoopHud(H.res); if (H.res === 'SWISH!' || H.res === 'IN') SW.Audio.chime && SW.Audio.chime(); }
        if (!H.segs.length) { H.st = 'wait'; H.wait = 0.5; }
        else if (!H.segs[0].a) H.segs[0].a = H.ball.position.toArray();
      }
    } else if (H.st === 'wait') { H.wait -= dt; if (H.wait <= 0) { H.st = 'aim'; hoopHud(''); } }
  }
  $('#miShoot').addEventListener('click', () => hoopShoot());
  $('#miQuit').addEventListener('click', () => endHoop());
  // Pool: the table opens over the screen (src/pool.js); the best is the fewest shots to clear it.
  // Pool, played on the table where it stands: the camera comes down behind the cue ball. Drag (or ←→, or the stick)
  // to aim, hold SHOT / Z / Space / the A button to build power and let go to strike. While the balls run, the camera
  // stands back over the table. Clear the fifteen in as few shots as you can (a scratch costs a shot). The table is
  // drawn K times life size (see the hall) while the physics stays in metres: everything here is placed in the table's
  // own scaled group (T.G), so the aim line, the cue and its pull, and the camera's offsets all grow with it.
  let pool = null;
  const PSIM = SW.PoolSim;
  function poolHud(say) {
    const T = hallAt.table, left = T.state.balls.filter((b) => b.n && !b.in).length;
    $('#miScore').textContent = `SHOTS ${pool.shots}\nLEFT ${left}\nBEST ${mgBest.pool || '-'}`;
    if (say !== undefined) $('#miSay').textContent = say;
  }
  function startPool() {
    const T = hallAt.table; if (!T || !PSIM) return;
    mode = 'pool'; keys.clear(); auto = null; document.body.classList.add('busy'); $('#prompt').hidden = true; lastFocus = undefined;
    if (T.state.balls.every((b) => !b.n || b.in)) T.rack();
    if (!T.aimG) {   // the aim line, a ghost ball where it meets, and the cue
      const lm = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }); lm.userData.lin = true;
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
      T.aimLine = new THREE.LineSegments(lg, lm); T.G.add(T.aimLine);
      T.ghost = new THREE.Mesh(new THREE.RingGeometry(PSIM.R * 0.85, PSIM.R, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })); T.ghost.rotation.x = -Math.PI / 2; T.G.add(T.ghost);
      T.aimG = new THREE.Group(); T.G.add(T.aimG);
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.0135, 0.007, 1.45, 10), mat('#b98a56', { rough: 0.45 })); stick.rotation.z = Math.PI / 2; stick.position.x = -0.725; stick.castShadow = true;
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.0072, 0.0072, 0.02, 8), mat('#3a6ab0', { rough: 0.6 })); tip.rotation.z = Math.PI / 2; tip.position.x = -0.005;
      const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.0145, 0.4, 10), mat('#2a1610', { rough: 0.4 })); butt.rotation.z = Math.PI / 2; butt.position.x = -1.25;
      T.cuePivot = new THREE.Group(); T.cuePivot.add(stick, tip, butt); T.aimG.add(T.cuePivot);   // the shaft's top turns to -x: thick at the butt
    }
    const c = T.state.balls[0];
    pool = { aim: Math.atan2(-c.z, PSIM.FOOT - c.x), hold: false, holdT: 0, power: 0, moving: false, shots: T.state.shotsSoFar || 0, keyAim: 0, drag: null, camP: camera.position.clone(), camL: camLook.clone(), last: performance.now(), done: false };
    avatar.G.visible = false;
    $('#mgame').hidden = false; $('#miTitle').textContent = 'POOL'; $('#miShoot').firstChild.textContent = 'SHOT ';
    poolHud('ドラッグ / ←→ で狙う・長押しで力をためて離す');
    camHold = poolCam;
  }
  function endPool() {
    if (!pool) return;
    const T = hallAt.table; T.state.shotsSoFar = pool.shots; T.aimLine.visible = T.ghost.visible = T.aimG.visible = false;
    pool = null; camHold = null; avatar.G.visible = true;
    mode = 'walk'; $('#mgame').hidden = true; $('#miShoot').firstChild.textContent = 'SHOOT '; document.body.classList.remove('busy');
    snapCam(); camBlendDur = 0.6; cv.focus({ preventScroll: true });
  }
  function poolHold(on) {
    if (!pool) return;
    if (on) { if (pool.done) { hallAt.table.rack(); pool.done = false; pool.shots = 0; pool.aim = 0; poolHud(''); return; } if (!pool.moving) { pool.hold = true; pool.holdT = 0; } return; }
    if (!pool.hold) return;
    const T = hallAt.table, c = T.state.balls[0], sp = 0.35 + pool.power * 3.9;
    c.vx = Math.cos(pool.aim) * sp; c.vz = Math.sin(pool.aim) * sp; pool.shots++; pool.moving = true; pool.hold = false; pool.power = 0; poolHud('');
  }
  const pv = new THREE.Vector3(), pl = new THREE.Vector3(), pd = new THREE.Vector3(), paxis = new THREE.Vector3(), pq = new THREE.Quaternion();
  function poolCam(cam) {
    if (!pool) return;
    const T = hallAt.table, now = performance.now(), dt = Math.min(0.1, (now - pool.last) / 1000); pool.last = now;
    const c = T.state.balls[0];
    if (pool.moving || c.in) {   // stand back high over the head of the table, looking down its length, while the balls run
      const near = camera.aspect < 1 ? 0.5 : 0;   // a narrow (taller) view tips down a little more
      pv.set(0, HALL.H - 0.75, HALL.D / 2 - 0.7); T.S.localToWorld(pv); pl.set(0, HALL.TOP, HALL.D / 2 - 4.7 + near); T.S.localToWorld(pl);
    } else {                     // down behind the cue ball, looking along the shot; near a wall it comes in and climbs, to stay inside
      pd.set(Math.cos(pool.aim), 0, Math.sin(pool.aim));
      let b = 1.05; while (b > 0.25 && !T.inside(c.x - pd.x * b, c.z - pd.z * b)) b -= 0.05;
      const overCue = T.TOP + PSIM.R + (pool.lift || 0) + Math.max(0, b - PSIM.R - 0.02) * Math.tan(pool.tilt || 0.07) + 0.14;   // above the cue when its butt is jacked up
      pv.set(c.x - pd.x * b, Math.max(T.TOP + 0.42 + (1.05 - b) * 0.6, overCue), c.z - pd.z * b); T.G.localToWorld(pv);
      pl.set(c.x + pd.x * 0.9, T.TOP - 0.02, c.z + pd.z * 0.9); T.G.localToWorld(pl);
    }
    const k = 1 - Math.exp(-dt * 6); pool.camP.lerp(pv, k); pool.camL.lerp(pl, k);
    cam.up.set(0, 1, 0); cam.position.copy(pool.camP); cam.lookAt(pool.camL);
  }
  function poolTick(dt) {
    if (!pool) return;
    const T = hallAt.table, S = T.state, c = S.balls[0];
    if (pool.keyAim && !pool.moving) pool.aim += pool.keyAim * dt * 0.9;
    if (pool.hold) { pool.holdT += dt; pool.power = 0.5 - 0.5 * Math.cos(pool.holdT * 2.6); }
    $('#miMark').style.bottom = `${(pool.power * 100).toFixed(1)}%`;
    if (pool.moving) {
      let any = false; for (let k = 0; k < 8; k++) any = PSIM.step(S, dt / 8) || any;
      S.balls.forEach((b, i) => { const sp = Math.hypot(b.vx, b.vz); if (sp > 0 && !b.in) { paxis.set(b.vz, 0, -b.vx).normalize(); T.meshes[i].quaternion.premultiply(pq.setFromAxisAngle(paxis, (sp * dt) / PSIM.R)); } });
      if (!any) {   // all still: score the shot
        pool.moving = false;
        if (c.in) { pool.shots++; PSIM.respot(S); poolHud('スクラッチ +1'); }
        if (S.balls.every((b) => !b.n || b.in)) { const prev = mgBest.pool; if (!prev || pool.shots < prev) { mgBest.pool = pool.shots; mgSave(); } pool.done = true; poolHud(`CLEAR! ${pool.shots} SHOTS — SHOT でもう一度`); SW.Audio.chime && SW.Audio.chime(); }
        else poolHud();
      }
    }
    S.balls.forEach((b) => { if (b.in && b.dropT !== undefined && b.dropT < 0.6) b.dropT += dt; });
    hallAt.syncBalls();
    // the aim line, the ghost ball and the cue
    const aimOn = !pool.moving && !pool.done && !c.in;
    T.aimLine.visible = T.ghost.visible = T.aimG.visible = aimOn;
    if (aimOn) {
      const h = PSIM.aimHit(S, pool.aim), dx = Math.cos(pool.aim), dz = Math.sin(pool.aim), ex = c.x + dx * h.t, ez = c.z + dz * h.t, y = T.TOP + PSIM.R, a = T.aimLine.geometry.attributes.position;
      a.setXYZ(0, c.x, y, c.z); a.setXYZ(1, ex, y, ez);
      if (h.b) { const nx = h.b.x - ex, nz = h.b.z - ez, nl = Math.hypot(nx, nz) || 1; a.setXYZ(2, h.b.x, y, h.b.z); a.setXYZ(3, h.b.x + (nx / nl) * 0.3, y, h.b.z + (nz / nl) * 0.3); } else { a.setXYZ(2, 0, -9, 0); a.setXYZ(3, 0, -9, 0); }
      a.needsUpdate = true; T.ghost.position.set(ex, T.TOP + 0.003, ez);
      // the cue: three times as long as a real one, so it is tipped up just enough to pass over the cushion and the rail behind
      // the ball (steeply when the ball is near them, as a player jacks the butt up), drawn back along its own line, and
      // shortened when the hall's wall is nearer than its butt would reach. poolCam keeps above it.
      const o0 = PSIM.R + 0.02, back = (x0, x1, z0, z1) => Math.min(dx < -1e-6 ? (x1 - c.x) / -dx : dx > 1e-6 ? (c.x - x0) / dx : 9, dz < -1e-6 ? (z1 - c.z) / -dz : dz > 1e-6 ? (c.z - z0) / dz : 9);   // how far behind the ball to a box's side
      const tr = back(-1.25, 1.25, -0.65, 0.65) - o0, tc = back(-PSIM.L / 2, PSIM.L / 2, -PSIM.W / 2, PSIM.W / 2) - o0;   // from the tip to the rail's and the cushion's inner edges
      const tilt = Math.min(0.85, Math.max(0.07, Math.atan2(0.995 - y, Math.max(0.01, tr)), Math.atan2(0.935 - y, Math.max(0.01, tc))));   // over the rails' tops (0.98) and the cushions' (0.92)
      const ta = Math.tan(tilt), lift = Math.max(0, 0.995 - y - Math.max(0, tr) * ta, 0.935 - y - Math.max(0, tc) * ta);   // a ball frozen on the cushion: the tip rides up over it
      const pull = pool.power * 0.22, cs = Math.cos(tilt); pool.tilt = tilt; pool.lift = lift;
      T.aimG.position.set(c.x, y, c.z); T.aimG.rotation.y = -pool.aim; T.cuePivot.rotation.z = -tilt; T.cuePivot.position.set(-(o0 + pull * cs), lift + pull * Math.sin(tilt), 0);
      T.cuePivot.scale.x = clamp((back(...T.walls) - 0.04 - o0 - pull * cs) / (1.45 * cs), 0.3, 1);
    }
  }
  $('#miShoot').addEventListener('pointerdown', (e) => { if (mode === 'pool') { e.preventDefault(); poolHold(true); } else if (mode === 'ride') { e.preventDefault(); teaPress(); } });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) $('#miShoot').addEventListener(ev, () => { if (mode === 'pool') poolHold(false); });
  $('#miQuit').addEventListener('click', () => { if (mode === 'pool') endPool(); else if (mode === 'ride') endRide(); });


  addEventListener('keydown', (e) => {
    if (e.key === 'Shift') running = true;
    if (mode === 'title') { if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); start(); } return; }
    if (mode === 'modal') { if (e.key === 'Escape' || e.code === 'KeyM' || e.code === 'KeyX') { e.preventDefault(); if (!e.repeat) closeMap(); } return; }
    if (mode === 'phone') { phoneKey(e); return; }
    if (mode === 'hoop') { if (e.key === 'Escape' || e.code === 'KeyX') { e.preventDefault(); endHoop(); } else if ((e.code === 'KeyZ' || e.code === 'Space' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); hoopShoot(); } return; }
    if (mode === 'pool') {
      e.preventDefault();
      if (e.key === 'Escape' || e.code === 'KeyX') endPool();
      else if (e.key === 'ArrowLeft' || e.code === 'KeyA') pool.keyAim = -1;
      else if (e.key === 'ArrowRight' || e.code === 'KeyD') pool.keyAim = 1;
      else if ((e.code === 'KeyZ' || e.code === 'Space' || e.key === 'Enter') && !e.repeat) poolHold(true);
      return;
    }
    if (mode === 'confirm') { if (e.key === 'Escape' || e.code === 'KeyX') { e.preventDefault(); closeConfirm(); } else if (e.key === 'Enter' || e.code === 'KeyZ') { e.preventDefault(); $('#cfYes').click(); } return; }
    if (mode === 'dialog') { if (e.key === 'Enter' || e.key === 'Escape' || e.code === 'KeyZ' || e.code === 'Space') { e.preventDefault(); advance(); } return; }
    if (radio.open && radioKey(e)) return;
    if ((mode === 'ride' || (mode === 'walk' && drv)) && e.code === 'KeyR') { e.preventDefault(); if (!e.repeat) radioOpen(!radio.open); return; }
    if (mode === 'ride') { if (e.key === 'Escape' || e.code === 'KeyX' || e.key === 'Backspace') { e.preventDefault(); endRide(); } else if ((e.code === 'KeyZ' || e.code === 'Space' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); teaPress(); } return; }
    if (mode !== 'walk') return;
    if (e.code === 'KeyB' && spot.p) { e.preventDefault(); if (!e.repeat) spotBuy(); return; }
    const k = KEYMAP[e.code];
    if (k) { e.preventDefault(); keys.add(k); auto = null; return; }
    if (e.code === 'KeyQ') { camYaw += 0.2; lookT = t; }
    else if (e.code === 'KeyE') { camYaw -= 0.2; lookT = t; }
    else if (e.code === 'Space') { e.preventDefault(); if (drv) keys.add('brake'); else if (!e.repeat) jump(); }
    else if (!e.repeat && (e.code === 'KeyZ' || e.key === 'Enter')) { e.preventDefault(); if (focus) act(focus); }
    else if (e.key === 'Escape' || e.code === 'KeyX' || e.code === 'KeyM') { e.preventDefault(); if (!e.repeat) openMap(); }
    else if (e.code === 'KeyP' || e.code === 'Tab') { e.preventDefault(); if (!e.repeat) openPhone(); }
  });
  addEventListener('keyup', (e) => { if (mode === 'pool' && pool) { if (e.code === 'KeyZ' || e.code === 'Space' || e.key === 'Enter') poolHold(false); if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code) || e.key === 'ArrowLeft' || e.key === 'ArrowRight') pool.keyAim = 0; return; } if (e.key === 'Shift') running = false; if (e.code === 'Space') keys.delete('brake'); const k = KEYMAP[e.code]; if (k) keys.delete(k); });
  addEventListener('blur', () => { keys.clear(); running = false; });

  let drag = null;
  cv.addEventListener('pointerdown', (e) => {
    if (mode === 'dialog') { advance(); return; }
    if (mode === 'pool' && pool) { pool.drag = { id: e.pointerId, x: e.clientX }; try { cv.setPointerCapture(e.pointerId); } catch (_) { /* */ } return; }
    if (mode !== 'walk' && mode !== 'ride') return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
    try { cv.setPointerCapture(e.pointerId); } catch (_) { /* */ }
  });
  cv.addEventListener('pointermove', (e) => {
    if (pool && pool.drag && pool.drag.id === e.pointerId) { if (!pool.moving) pool.aim -= (e.clientX - pool.drag.x) * 0.0035; pool.drag.x = e.clientX; return; }
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true;
    if (drag.moved) { if (ride && ride.st !== 'walk') { ride.lookYaw -= dx * 0.006; ride.lookPitch = clamp(ride.lookPitch + dy * 0.004, -0.9, 1.1); } else { camYaw -= dx * 0.006; camPitch = clamp(camPitch + dy * 0.004, 0.04, 0.85); lookT = t; } }
  });
  cv.addEventListener('pointerup', (e) => { if (pool && pool.drag && pool.drag.id === e.pointerId) { pool.drag = null; return; } if (!drag || drag.id !== e.pointerId) return; const was = drag; drag = null; if (!was.moved && mode === 'walk') tap(e.clientX, e.clientY); });
  cv.addEventListener('pointercancel', () => (drag = null));
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function tap(cx, cy) {
    if (drv) return;
    const r = cv.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(pick, false);
    for (const h of hits) {
      const ia = h.object.userData.ia;
      if (ia) {
        if (Math.hypot(ia.x - P.x, ia.z - P.z) < ia.r && level(ia)) { faceTo(ia); act(ia); return; }
        if (ia.place) routeTo(ia.place, ia); else auto = { pts: [{ x: ia.sx, z: ia.sz }], i: 0, then: ia };
        return;
      }
      if (h.object.userData.ground) { auto = { pts: [{ x: h.point.x, z: h.point.z }], i: 0 }; return; }
    }
  }
  const stickEl = $('#stick'), knob = $('#knob');
  stickEl.addEventListener('pointerdown', (e) => { if (mode !== 'walk') return; stick.id = e.pointerId; try { stickEl.setPointerCapture(e.pointerId); } catch (_) { /* */ } moveStick(e); auto = null; });
  stickEl.addEventListener('pointermove', (e) => { if (stick.id === e.pointerId) moveStick(e); });
  const stickEnd = (e) => { if (stick.id !== e.pointerId) return; stick.id = null; stick.x = stick.y = 0; knob.style.transform = ''; };
  stickEl.addEventListener('pointerup', stickEnd);
  stickEl.addEventListener('pointercancel', stickEnd);
  function moveStick(e) { const r = stickEl.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = r.width / 2 - 14; let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; } stick.x = dx / R; stick.y = dy / R; knob.style.transform = `translate(${dx}px,${dy}px)`; }
  $('#btnA').addEventListener('pointerdown', (e) => { e.preventDefault(); pressA(); });
  $('#dialog').addEventListener('click', advance);

  // Gamepad: left stick moves, right stick turns the view, A interacts, B backs out.
  let padPrev = [], padRun = false, padV = null;   // pad() is polled once a frame in every mode, so its buttons work in menus too
  function pad() {
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected) : null;
    if (!gp) { padRun = padBrake = padGas = padFast = false; padPrev = []; return null; }   // a pad that drops out must not leave its triggers held
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
    const pressed = gp.buttons.map((b) => b.pressed);
    const down = (i) => pressed[i] && !padPrev[i];
    if (mode === 'hoop') { if (down(0)) hoopShoot(); if (down(1)) endHoop(); }
    if (mode === 'pool' && pool) { if (down(0)) poolHold(true); if (!pressed[0] && padPrev[0]) poolHold(false); if (down(1)) endPool(); if (!pool.moving && Math.abs(gp.axes[0] || 0) > 0.2) pool.aim += (gp.axes[0] || 0) * 0.02; }
    if (down(0)) { if (mode === 'walk') pressA(); else if (mode === 'dialog') advance(); else if (mode === 'title') start(); else if (mode === 'confirm') $('#cfYes').click(); else if (mode === 'phone') { const a = document.activeElement; if (a && $('#phone').contains(a)) a.click(); } }
    if (mode === 'phone') { if (down(12) || down(14)) phoneFocus(-1); else if (down(13) || down(15)) phoneFocus(1); }
    if (down(1)) { if (mode === 'modal') closeMap(); else if (mode === 'confirm') closeConfirm(); }
    if (down(2) && mode === 'walk' && spot.p) spotBuy();
    if (radio.on && (mode === 'walk' || mode === 'ride')) { if (down(14)) radioStep(-1); else if (down(15)) radioStep(1); }   // the radio: ← → on the pad
    if (down(9) && mode === 'walk') openMap();
    if (down(1) && mode === 'phone') phoneBack();
    else if (down(3) || down(8)) { if (mode === 'walk') openPhone(); else if (mode === 'phone') closePhone(); }
    padPrev = pressed;
    padRun = !!(pressed[7] || pressed[5] || pressed[2]); padBrake = !!(pressed[6] || pressed[4]); padGas = !!pressed[7]; padFast = !!(pressed[5] || pressed[2]);
    if (mode === 'ride' && down(1)) endRide();
    if (mode === 'ride' && ride && ride.st !== 'walk') { ride.lookYaw -= dz(gp.axes[2] || 0) * 0.04; ride.lookPitch = clamp(ride.lookPitch + dz(gp.axes[3] || 0) * 0.02, -0.9, 1.1); if (down(0)) teaPress(); }
    else if (mode === 'walk' || mode === 'ride') { const ax = dz(gp.axes[2] || 0), ay = dz(gp.axes[3] || 0); camYaw -= ax * 0.04; camPitch = clamp(camPitch + ay * 0.02, 0.04, 0.85); if (ax || ay) lookT = t; }
    return { x: dz(gp.axes[0]), y: dz(gp.axes[1]) };
  }

  function pressA() { if (mode === 'hoop') { hoopShoot(); return; } if (mode === 'dialog') { advance(); return; } if (mode === 'walk') { if (focus) act(focus); else if (!drv) jump(); } }
  $('#btnB').addEventListener('pointerdown', (e) => { e.preventDefault(); dashOn = !dashOn; $('#btnB').classList.toggle('on', dashOn); });
  function faceTo(ia) { P.face = Math.atan2(ia.x - P.x, ia.z - P.z); }
  function level(ia) { return (ia.y0 === undefined || P.y >= ia.y0) && (ia.y1 === undefined || P.y <= ia.y1); }   // at its height too: a thing on a deck is not yours from under it
  function act(ia) {
    auto = null; keys.clear();
    if (ia.kind === 'seat') { startRide(ia.place); return; }
    if (ia.kind === 'ride') { startRide(ia.place, ia.ride); return; }
    if (ia.kind === 'board') { openMap(); return; }
    if (ia.kind === 'car') { startDrive(ia.pa); return; }
    if (ia.kind === 'exit') { endDrive(ia.pa); return; }
    if (ia.kind === 'info') { say(ia.lines.slice()); return; }
    if (ia.kind === 'travel') { openConfirm(ia); return; }
    if (ia.kind === 'store') { openStore(); return; }
    if (ia.kind === 'hoop') { startHoop(ia.hoop); return; }
    if (ia.kind === 'pool') { startPool(); return; }
    if (ia.kind === 'garage') { pickCar(); return; }
    if (ia.kind === 'sign') {
      const p = ia.place, s = p.song;
      say([`この道の先：${s.place}（${s.placeEn}）`, p.found ? `♪ ${s.title} が流れている場所。近づくほど音が大きくなる。` : 'どんな曲が流れているかは、行ってみないとわからない。']);
    }
  }

  // Walk along paths to a place (used by the map and by clicking a far beacon). A path's points may carry y (SHOT's
  // stair tower, where the landings stand one above another): then the nearest is the nearest at your height. A place
  // can first lead you off its path round what stands in the way (p.lead(lx, lz, y) -> local [x, z] points: from under
  // SHOT's footbridge round its tower to the door). Walking back, the tight points (a flight's turns) are all taken.
  function routeTo(p, then) {
    const pts = [];
    let fx = P.x, fz = P.z;
    for (const q of places) { if (!q.lead) continue; const l = q.local(P.x, P.z), w = q.lead(l.x, l.z, P.y); if (w) for (const [lx, lz] of w) { const o = Object.assign(q.toWorld(lx, lz), { tight: true }); pts.push(o); fx = o.x; fz = o.z; } }   // tight: walked, and each corner turned where it is
    let near = null;
    for (const q of places) for (let i = 0; i < q.path.length; i++) { const c = q.path[i], d = Math.hypot(c.x - fx, c.z - fz) + (c.y === undefined ? 0 : 3 * Math.abs(c.y - P.y)); if (d < 7 && (!near || d < near.d)) near = { q, i, d }; }
    if (near && near.q === p) {
      for (let i = near.i; i < p.path.length; i++) pts.push(p.path[i]);
    } else {
      if (near) for (let i = near.i; i >= 0; i -= near.q.path[i].tight || (near.q.path[i - 1] || {}).tight ? 1 : 2) pts.push(near.q.path[i]);
      const a = near ? Math.atan2(near.q.z, near.q.x) : Math.atan2(P.z, P.x), b = Math.atan2(p.z, p.x);
      let da = Math.atan2(Math.sin(b - a), Math.cos(b - a));
      for (let k = 1, n = Math.ceil(Math.abs(da) / 0.5); k < n; k++) { const m = a + (da * k) / n; pts.push({ x: Math.cos(m) * 8.6, z: Math.sin(m) * 8.6 }); }   // round the plaza between the well/board and the lamps
      for (let i = 0; i < p.path.length; i++) pts.push(p.path[i]);
    }
    auto = { pts, i: 0, then: then || interact.find((ia) => ia.kind === 'seat' && ia.place === p) };
  }

  /* ================= scenic view ================= */
  const camFrom = { pos: new THREE.Vector3(), look: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) };
  const camLook = new THREE.Vector3();
  let camBlend = 1, camBlendDur = 1;
  function snapCam() { camFrom.pos.copy(camera.position); camFrom.look.copy(camLook); camFrom.up.copy(camera.up); camBlend = 0; }
  // Riding: a place may offer a ride instead of a fixed view (p.ride: board() -> world spot, pick(), seat(v) -> yaw).
  // You walk to the boarding spot, climb on, and ride it with the camera free to look round (drag / right stick);
  // Esc, B or the back button gets you off. The song plays as it does in a view.
  let ride = null;
  const rv = new THREE.Vector3();
  // A ride (p.ride, or one handed in): board() -> world spot, hold(on) to stop it for boarding / start it again,
  // stopped(), pick() (choose your seat once it has stopped), seat(v) -> yaw, and optionally game (the teacups).
  // You walk up, wait for it to stop, climb on, it starts; on board you see through your own eyes and can look round
  // (drag / right stick). Esc / B / back: it stops again and you get off.
  function startRide(p, R = p.ride) {
    if (!R || mode !== 'walk') return;
    mode = 'ride'; document.body.classList.add('busy', 'riding'); $('#prompt').hidden = true; lastFocus = undefined; keys.clear(); auto = null; P.speed = 0;
    camBlend = 1;
    R.hold && R.hold(true);
    ride = { p, R, st: 'walk', t: 0, from: null, b: R.board(), lookYaw: 0, lookPitch: 0.08 };
    if (R.game) { R.boost = 0; $('#mgame').hidden = false; $('#miTitle').textContent = 'TEACUPS'; $('#miShoot').firstChild.textContent = 'SPIN '; ride.ph = 0; teaHud('乗ったら、緑で SPIN'); }
  }
  function endRide() {
    if (!ride || ride.st === 'off' || ride.st === 'stopping') return;
    if (ride.st === 'walk') { ride.R.hold && ride.R.hold(false); finishRide(); return; }
    ride.R.hold && ride.R.hold(true, true); ride.st = 'stopping';
    if (ride.R.game) teaHud('止まるまで待ってね');
  }
  function finishRide() {
    const r = ride; ride = null; mode = 'walk'; P.y = groundAt(P.x, P.z);
    if (r && r.R.game) { $('#mgame').hidden = true; $('#miShoot').firstChild.textContent = 'SHOOT '; }
    document.body.classList.remove('busy', 'riding'); collide(P); snapCam(); camBlendDur = 0.6; cv.focus({ preventScroll: true });
  }
  function teaHud(say) {
    const R = ride && ride.R; if (!R) return;
    const rpm = Math.round(((R.spin ? R.spin() : 0) * 60) / (Math.PI * 2));
    $('#miScore').textContent = `SPIN ${rpm} rpm\nBEST ${mgBest.cups || 0} rpm`;
    if (say !== undefined) $('#miSay').textContent = say;
  }
  function teaPress() {   // the teacups: press while the marker is in the green band to spin faster
    const r = ride; if (!r || !r.R.game || r.st !== 'on') return;
    const m = r.mark || 0;
    if (m > 0.8 && m < 0.9) { r.R.boost = Math.min(9, r.R.boost + 1.4); teaHud('PERFECT!'); }
    else if (m > 0.72 && m < 0.97) { r.R.boost = Math.min(9, r.R.boost + 0.7); teaHud('GOOD'); }
    else { r.R.boost = Math.max(0, r.R.boost - 0.6); teaHud('MISS'); }
  }
  function rideTick(dt) {
    const r = ride; if (!r) return;
    const R = r.R;
    if (r.st === 'walk') {
      const dx = r.b.x - P.x, dz = r.b.z - P.z, d = Math.hypot(dx, dz);
      if (d < 0.15) { P.speed = 0; if (!R.stopped || R.stopped()) { R.pick && R.pick(); r.st = 'climb'; r.t = 0; r.from = { x: P.x, y: P.y, z: P.z }; } }   // wait at the gate until it has stopped
      else { const s = Math.min(d, dt * 3.2); P.x += (dx / d) * s; P.z += (dz / d) * s; P.face = Math.atan2(dx, dz); P.speed = 3.2; }
      return;
    }
    const yaw = R.seat(rv);
    if (r.st === 'climb') {
      r.t = Math.min(1, r.t + dt / 0.9); const k = ease(r.t);
      P.x = r.from.x + (rv.x - r.from.x) * k; P.z = r.from.z + (rv.z - r.from.z) * k; P.y = r.from.y + (rv.y - r.from.y) * k + Math.sin(Math.PI * r.t) * 0.5;
      P.face += wrapA(yaw - P.face) * Math.min(1, dt * 8);
      if (r.t >= 1) { r.st = 'on'; r.lookYaw = 0; r.lookPitch = 0.08; R.hold && R.hold(false); toast('ドラッグで見回せます · Esc で降りる', 3200); }
    } else if (r.st === 'on' || r.st === 'stopping') {
      P.x = rv.x; P.y = rv.y; P.z = rv.z; P.face = yaw; P.speed = 0;
      if (r.st === 'stopping' && (!R.stopped || R.stopped())) { r.st = 'off'; r.t = 0; r.from = { x: P.x, y: P.y, z: P.z }; }
      if (R.game) {
        r.ph = (r.ph + dt / 0.8) % 1; r.mark = r.ph; $('#miMark').style.bottom = `${(r.ph * 100).toFixed(1)}%`;
        R.boost = Math.max(0, R.boost - dt * 0.35);
        const rpm = Math.round(((R.spin ? R.spin() : 0) * 60) / (Math.PI * 2)); if (rpm > (mgBest.cups || 0)) { mgBest.cups = rpm; mgSave(); }
        if (Math.random() < dt * 6) teaHud();
      }
    } else if (r.st === 'off') {
      if (!r.ex) r.ex = R.exit ? R.exit() : r.b;   // off at the exit gate
      r.t = Math.min(1, r.t + dt / 0.9); const k = ease(r.t), g0 = groundAt(r.ex.x, r.ex.z);
      P.x = r.from.x + (r.ex.x - r.from.x) * k; P.z = r.from.z + (r.ex.z - r.from.z) * k; P.y = r.from.y + (g0 - r.from.y) * k + Math.sin(Math.PI * r.t) * 0.4;
      if (r.t >= 1) { R.hold && R.hold(false); finishRide(); }
    }
  }
  $('#backBtn').addEventListener('click', () => endRide());

  /* ================= radio ================= */
  // In a car or on a ride there is a radio. AUTO is the old way: behind the wheel, whichever song you are driving past;
  // on a ride, the ride's own song. Every song you have found is a station of its own, played on the store player (whole
  // once bought, else as its preview) while the world's sound sinks under it; when it ends the radio moves on to the next
  // found song. R opens the station list (↑ ↓ to choose, Z / Enter to tune, Esc / R to close: the car keeps driving on
  // W A S D); ◀ ▶ (or the pad's ← →) step through the stations. The station stays tuned from one ride to the next.
  const radio = { st: 0, open: false, cur: 0, was: false, nosig: 0, on: false, uiT: 0 };   // st: 0 = AUTO, else the place's index + 1
  const radioEl = $('#radio'), radioList = $('#radioList');
  const freq = (i) => (76.4 + i * 1.6).toFixed(1);
  const radioSongs = (playable) => places.map((p, i) => i + 1).filter((s) => places[s - 1].found && (!playable || places[s - 1].song.src || CFG.demo));   // playable: with a file to play
  function radioTune(st) {
    radio.st = st; radio.was = false; radio.nosig = 0;
    if (!st) player.stop();
    else { const p = places[st - 1]; player.stop(); player.play(p.song); wantWave(p.song); radio.was = player.state === 'play' && player.song === p.song; radio.nosig = radio.was ? 0 : 1; }   // (a song with no file leaves the radio silent: NO SIGNAL)
    radio.uiT = 0; if (radio.open) radioListRender();
  }
  function radioStep(dir, songsOnly) {
    const list = songsOnly ? radioSongs(true) : [0, ...radioSongs()];
    if (!list.length) { radioTune(0); return; }
    let k = list.indexOf(radio.st); if (k < 0) k = dir > 0 ? -1 : 0;
    radioTune(list[(k + dir + list.length) % list.length]);
  }
  function radioListRender() {
    const rows = [`<button class="rd-row${radio.st === 0 ? ' on' : ''}" type="button" data-st="0"><span class="rd-f">AUTO</span><span class="nm">${ride ? 'この乗り物の曲' : '近くの曲を受信'}</span></button>`]
      .concat(places.map((p, i) => (p.found
        ? `<button class="rd-row${radio.st === i + 1 ? ' on' : ''}" type="button" data-st="${i + 1}" style="--c:${esc(p.color)}"><span class="rd-f">${freq(i)}</span><span class="nm">${esc(p.song.title)}<small>${esc(p.song.artist || CFG.artist)}</small></span></button>`
        : `<button class="rd-row" type="button" disabled><span class="rd-f">${freq(i)}</span><span class="nm">？<small>未発見</small></span></button>`)));
    radioList.innerHTML = `<div class="rd-h">STATIONS <span>${radioSongs().length}/${places.length}</span></div>` + rows.join('');
    radioCursor(0);
  }
  function radioCursor(dir) {
    const rows = [...radioList.querySelectorAll('.rd-row:not([disabled])')];
    if (!rows.length) return;
    if (!dir) radio.cur = Math.max(0, rows.findIndex((r) => r.classList.contains('on')));
    else radio.cur = (radio.cur + dir + rows.length) % rows.length;
    rows.forEach((r, k) => r.classList.toggle('sel', k === radio.cur));
    rows[radio.cur].scrollIntoView({ block: 'nearest' });
  }
  function radioOpen(on) {
    if (on && !radio.on) return;
    radio.open = on; radioList.hidden = !on; radioEl.classList.toggle('open', on);
    if (on) radioListRender();
  }
  function radioKey(e) {   // while the list is open: true if the key was the radio's
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); radioCursor(e.key === 'ArrowUp' ? -1 : 1); return true; }
    if (e.key === 'Enter' || e.code === 'KeyZ') { e.preventDefault(); if (!e.repeat) { const r = radioList.querySelectorAll('.rd-row:not([disabled])')[radio.cur]; if (r) radioTune(+r.dataset.st); } return true; }
    if (e.key === 'Escape' || e.code === 'KeyR' || e.code === 'KeyX' || e.key === 'Backspace') { e.preventDefault(); if (!e.repeat) radioOpen(false); return true; }
    return false;
  }
  radioList.addEventListener('click', (e) => { const r = e.target.closest('.rd-row:not([disabled])'); if (r) { radioTune(+r.dataset.st); cv.focus({ preventScroll: true }); } });
  $('#rdPrev').addEventListener('click', () => { radioStep(-1); cv.focus({ preventScroll: true }); });
  $('#rdNext').addEventListener('click', () => { radioStep(1); cv.focus({ preventScroll: true }); });
  $('#rdMain').addEventListener('click', () => { radioOpen(!radio.open); cv.focus({ preventScroll: true }); });
  // Each frame: on in a car or on a ride (not while the phone is out: its player has the speaker then), the tuned song
  // played on, and the display.
  function radioTick(dt) {
    const want = (!!drv || !!ride) && mode !== 'phone';
    if (want !== radio.on) {
      radio.on = want; radioEl.hidden = !want;
      if (want) { if (radio.st) radioTune(radio.st); }
      else { radioOpen(false); if (radio.st && mode !== 'phone') player.stop(); }
    }
    if (!want) return;
    if (radio.st) {
      if (player.state === 'play' && player.song === places[radio.st - 1].song) radio.was = true;
      else if (radio.was && player.state === 'stop') radioStep(1, true);   // the song ended: on to the next one
    }
    if ((radio.uiT -= dt) > 0) return;
    radio.uiT = 0.1;
    let band = 'AUTO', title = '— — —', sub = '', col = '';
    if (radio.st) {
      const p = places[radio.st - 1], inf = player.info(p.song);
      band = 'FM ' + freq(radio.st - 1); title = p.song.title; col = p.color;
      sub = radio.nosig > 0 ? 'NO SIGNAL' : [p.song.artist || CFG.artist, inf.preview ? `PREVIEW ${CFG.preview || 20}s` : '', inf.waiting ? '…' : inf.state === 'play' ? timeOf(inf) : ''].filter(Boolean).join(' · ');
    } else {
      const p = ride ? ride.p : loudP;
      if (p) { title = p.found ? p.song.title : '？'; sub = p.found ? (p.song.artist || CFG.artist) : '受信中'; col = p.found ? p.color : ''; }
      else sub = '受信中';
    }
    $('#rdBand').textContent = band; $('#rdTitle').textContent = title; $('#rdSub').textContent = sub;
    radioEl.style.setProperty('--c', col || '#86b53a');
    const lv = radio.st ? (player.state === 'play' ? 0.75 : 0) : (ride ? ride.p.gain : loudP ? loudP.gain : 0);
    radioEl.querySelectorAll('.rd-eq i').forEach((b, k) => { const v = lv * (0.3 + 0.7 * Math.abs(Math.sin(t * (2.3 + k * 1.7) + k * 2))); b.style.transform = `scaleY(${clamp(v, 0.06, 1).toFixed(2)})`; });
  }

  // The song's card at its light ring: standing on the ring on foot, which song this is and the button to buy it (the
  // same button as at the record shop's counter and in the phone's STORE). B buys from the keyboard, X on a pad.
  const spotEl = $('#spot'), spot = { p: null };
  function spotRender() {
    const p = spot.p; if (!p) return;
    const s = p.song, i = places.indexOf(p), lis = (s.links || []).find((l) => l.kind !== 'buy');
    spotEl.style.setProperty('--c', p.color);
    $('#spTitle').textContent = s.title;
    $('#spSub').textContent = [s.artist || CFG.artist, s.year, s.place].filter(Boolean).join(' · ');
    $('#spTag').innerHTML = tagOf(s);
    const label = isOwned(s) ? `${IC.check}<span>購入済み</span>` : canCheckout(s) ? `${IC.cart}<span>${yen(priceOf(s))} で買う</span>` : (s.links || []).some((l) => l.kind === 'buy') ? `${IC.cart}<span>買う</span>` : '<span>くわしく</span>';
    void lis; void i;
    $('#spAct').innerHTML = `<button class="btn ${isOwned(s) ? 'owned' : 'primary'}" type="button" data-song-open="1" aria-label="${esc(s.title)} の曲のページ（試聴・購入）">${label}</button>` + (TOUCH ? '' : '<kbd>B</kbd>');
  }
  function spotBuy() { if (spot.p) openSong(spot.p); }   // B / the pad's X / the card's button: the song's page on the phone
  spotEl.addEventListener('click', (e) => { if (e.target.closest('[data-song-open]') && spot.p) openSong(spot.p); });
  function spotTick() {
    let at = null;
    if (mode === 'walk' && !drv) for (const p of places) {
      if (p.found && p.song.store !== false && Math.hypot(P.x - p.vx, P.z - p.vz) < 3 && P.y > p.vy - DECK_STEP && P.y < p.vy + 2.5) { at = p; break; }   // on the ring, at its level
    }
    if (at === spot.p) return;
    spot.p = at; spotEl.hidden = !at;
    if (at) spotRender();
  }

  /* ================= map ================= */
  const mapCv = $('#mapCanvas'), mg = mapCv.getContext('2d');
  const MAP_S = mapCv.width / 300;
  const toMap = (x, z) => [(x + 150) * MAP_S, (z + 150) * MAP_S];
  function drawMap(at) {
    const g = mg, W = mapCv.width;
    g.fillStyle = '#141412'; g.fillRect(0, 0, W, W);
    if (hillField && hillField.mapCanvas) g.drawImage(hillField.mapCanvas, 0, 0, W, W);   // the hills, drawn once (the map spans -150..150)
    g.lineCap = 'round';
    places.forEach((p) => {
      (p.map || []).forEach((sh) => {
        g.save();
        const [cx, cz] = toMap(...Object.values(p.toWorld(sh.x, sh.z)));
        g.translate(cx, cz); g.rotate(-p.rot);
        g.fillStyle = sh.c;
        if (sh.t === 'rect') g.fillRect((-sh.w / 2) * MAP_S, (-sh.h / 2) * MAP_S, sh.w * MAP_S, sh.h * MAP_S);
        else if (sh.t === 'poly') { g.beginPath(); sh.pts.forEach(([a, b], i) => g[i ? 'lineTo' : 'moveTo']((a - sh.x) * MAP_S, (b - sh.z) * MAP_S)); g.closePath(); g.fill(); }   // local points round (x, z)
        else { g.beginPath(); g.arc(0, 0, sh.r * MAP_S, 0, 7); g.fill(); }
        g.restore();
      });
    });
    if (passView) passView.map(g, toMap, MAP_S);   // the mountain behind NO JOBB and its road
    if (streetView) streetView.map(g, toMap, MAP_S);   // the street under the viaduct, and the shops by the beach
    g.strokeStyle = 'rgba(200,192,170,.8)'; g.lineWidth = 3 * MAP_S;
    g.beginPath(); loopPath.forEach((q, i) => { const [x, y] = toMap(q.x, q.z); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
    places.forEach((p) => { g.beginPath(); p.path.forEach((q, i) => { const [x, y] = toMap(q.x, q.z); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke(); });
    g.fillStyle = '#8a8376'; g.beginPath(); g.arc(...toMap(0, 0), PLAZA_R * MAP_S, 0, 7); g.fill();
    g.lineJoin = 'round'; g.strokeStyle = '#4a4e58'; g.lineWidth = 15 * MAP_S; g.beginPath();   // the ring road, with the parking areas where a car waits
    for (let i = 0; i < ring.N; i += 2) { const [x, y] = toMap(ring.X[i], ring.Z[i]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.closePath(); for (const B of ring.roads.slice(1)) { g.moveTo(...toMap(B.X[0], B.Z[0])); for (let i = 1; i < B.N; i++) g.lineTo(...toMap(B.X[i], B.Z[i])); } g.stroke(); g.strokeStyle = 'rgba(232,226,208,.7)'; g.lineWidth = 1.5; g.setLineDash([9, 9]); g.stroke(); g.setLineDash([]);
    g.textAlign = 'center';
    places.forEach((p) => {
      const [x, y] = toMap(p.vx, p.vz);
      g.fillStyle = p.found ? p.color : '#9aa8bc';
      g.beginPath(); g.arc(x, y, 15, 0, 7); g.fill();
      g.strokeStyle = '#d8d2c0'; g.lineWidth = 3; g.stroke();
      g.font = '700 18px sans-serif'; g.textBaseline = 'middle'; g.fillStyle = '#141412';
      g.fillText(p.found ? '♪' : '?', x, y + 1);
    });
    ring.pas.forEach((pa) => { const [x, y] = toMap(...Object.values(pa.f.toWorld(10, -10))); g.save(); g.translate(x, y); g.fillStyle = '#e8e2d0'; g.strokeStyle = '#141412'; g.lineWidth = 2;
      g.beginPath(); g.rect(-9, -5, 18, 8); g.rect(-5, -10, 10, 5); g.fill(); g.stroke(); g.fillStyle = '#141412'; g.beginPath(); g.arc(-5, 4, 3, 0, 7); g.arc(5, 4, 3, 0, 7); g.fill(); g.restore(); });
    let [px, py] = toMap((at || P).x, (at || P).z); const off = Math.min(px, py) < 12 || Math.max(px, py) > W - 12;   // out past the map's 150 m (OHH's far beaches): kept at its edge, drawn hollow
    px = clamp(px, 12, W - 12); py = clamp(py, 12, W - 12);
    g.save(); g.translate(px, py); g.rotate(at ? 0 : -P.face + Math.PI); if (at) g.scale(1.6, 1.6);
    g.fillStyle = g.strokeStyle = '#e8e2d0'; g.lineWidth = 3; g.lineJoin = 'round'; g.beginPath(); g.moveTo(0, -11); g.lineTo(8, 8); g.lineTo(0, 4); g.lineTo(-8, 8); g.closePath(); if (off) g.stroke(); else g.fill();
    g.restore();
  }
  function openMap() {
    if (mode !== 'walk') return;
    mode = 'modal'; keys.clear(); document.body.classList.add('busy');
    drawMap();
    $('#modal').hidden = false;
    $('#mapClose').focus({ preventScroll: true });
  }
  function closeMap() { if (mode !== 'modal') return; mode = 'walk'; $('#modal').hidden = true; document.body.classList.remove('busy'); cv.focus({ preventScroll: true }); }
  function warpTo(p) {
    const f = $('#fade'); f.classList.add('on'); mode = 'fade';
    setTimeout(() => {
      if (drv) { endDrive(null); camBlend = 1; }   // no camera glide from the road: the fade covers the jump
      const q = p.path[Math.max(0, p.path.length - 9)];
      P.x = q.x; P.z = q.z; P.y = groundAt(q.x, q.z, q.y ?? 0); P.v = 0; P.air = false; auto = null;   // a path runs on the ground (where it passes under a deck you land under it, not up on it), or at q.y: the level its path runs at there (the top of SHOT's stairs)
      P.face = Math.atan2(p.vx - q.x, p.vz - q.z); P.hx = Math.sin(P.face); P.hz = Math.cos(P.face); camYaw = P.face + Math.PI;
      regionKey = ''; updateRegion(true); save();
      f.classList.remove('on'); mode = 'walk';
    }, 320);
  }
  $('#mapBtn').addEventListener('click', () => (mode === 'modal' ? closeMap() : openMap()));
  $('#mapClose').addEventListener('click', closeMap);
  const guide = (() => {
    const bx = -4.6, bz = -3.4, rot = Math.atan2(4.6, -4.1), g = new THREE.Group();
    const wood = mat('#3d3024', { rough: 0.9 }), woodD = mat('#2c221a', { rough: 0.9 });
    const cv2 = document.createElement('canvas'); cv2.width = cv2.height = 512;
    const tex2 = new THREE.CanvasTexture(cv2); tex2.encoding = THREE.sRGBEncoding; tex2.anisotropy = 4;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.3), new THREE.MeshBasicMaterial({ map: tex2 }));
    face.material.userData.lin = true; face.material.color.setScalar(0.8); face.position.set(0, 2.05, 0.07);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 0.1), woodD); back.position.y = 2.05;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.12, 0.7), wood); roof.position.y = 3.5; 
    const roof2 = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.12, 0.45), wood); roof2.position.set(0, 3.42, 0.42); roof2.rotation.x = 0.5;
    g.add(face, back, roof, roof2);
    for (const sx of [-1.4, 1.4]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.5, 0.16), wood); p.position.set(sx, 1.75, 0); g.add(p); }
    g.traverse((m) => { if (m.isMesh && m !== face) m.castShadow = true; });
    g.position.set(bx, 0, bz); g.rotation.y = rot;
    scene.add(g);
    const c = Math.cos(rot), s = Math.sin(rot);
    boxes.push({ x: bx, z: bz, hx: 1.5, hz: 0.25, c, s });
    const ia = { kind: 'board', x: bx, z: bz, r: 3, mark: 4.1, sx: bx + s * 1.6, sz: bz + c * 1.6 };
    interact.push(ia);
    back.userData.ia = face.userData.ia = ia; pick.push(back, face);
    return { refresh() { drawMap({ x: bx + s * 1.2, z: bz + c * 1.2 }); cv2.getContext('2d').drawImage(mapCv, 0, 0, 512, 512); tex2.needsUpdate = true; } };
  })();
  mapCv.addEventListener('click', (e) => {
    const r = mapCv.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * mapCv.width / MAP_S - 150, z = ((e.clientY - r.top) / r.height) * mapCv.height / MAP_S - 150;
    let best = null, bd = 14;
    places.forEach((p) => { const d = Math.hypot(p.vx - x, p.vz - z); if (d < bd) { bd = d; best = p; } });
    if (drv && !best) return;   // behind the wheel a tap on open ground means nothing
    closeMap();
    if (drv && !best.found) endDrive(null);   // hand the car back and set off on foot
    if (best && best.found) warpTo(best);
    else if (best) routeTo(best);
    else auto = { pts: [{ x, z }], i: 0 };
  });
  // ?mute=1 (the test-play launcher, npm run play) starts with the sound off; the speaker button turns it back on
  try { const mq = new URLSearchParams(location.search).get('mute'); if (mq !== null && mq !== '0' && mq !== 'false') { SW.Audio.muted = true; $('#soundBtn').setAttribute('aria-pressed', 'true'); } } catch (e) { /* no location */ }
  $('#soundBtn').addEventListener('click', () => {
    const m = !SW.Audio.muted;
    SW.Audio.setMuted(m);
    $('#soundBtn').setAttribute('aria-pressed', String(m));
  });

  /* ================= audio + discovery ================= */
  // How far the player is from a place for its light and its animation: from the viewpoint, or less where the place
  // reaches out further (p.reach(lx, lz) -> a distance, e.g. FLIP's long avenue counts as being in the city).
  const reachD = (p) => { const d = Math.hypot(P.x - p.vx, P.z - p.vz); if (!p.reach || d > 160) return d; const l = p.local(P.x, P.z), r = p.reach(l.x, l.z); return r == null ? d : Math.min(d, r); };
  const R_AUD = 34, R_VIEW = 3.2;
  const SILENT = { bass: 0, mid: 0, high: 0, level: 0, beat: false, pulse: 0, beats: 0, spectrum: null };
  let npT = 0, loudP = null;
  function updateAudio(dt) {
    const A = SW.Audio, on = A.started;
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw), fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    let loud = null;
    places.forEach((p) => {
      const dx = p.vx - P.x, dz = p.vz - P.z, d = Math.hypot(dx, dz);
      const viewing = !!(ride && ride.p === p);   // riding it: its song as if you were in it
      // Behind the wheel the car radio picks up whichever song you are driving past: by direction, not distance.
      const tuned = drv && !viewing ? smooth(0.5, 0.12, Math.abs(wrapA(Math.atan2(P.z, P.x) - Math.atan2(p.z, p.x)))) : 0;
      const pp = Math.max(viewing ? 1 : clamp((R_AUD - d) / (R_AUD - R_VIEW), 0, 1), tuned * 0.85);
      p.dwell = ((d < 4.5 && P.y > p.vy - DECK_STEP) || viewing) ? Math.min(1, p.dwell + dt / 12) : Math.max(0, p.dwell - dt / 4);   // lingering at the viewpoint, not under it
      const prox = 0.4 * pp * pp;
      p.gain = Math.max(prox + (1 - prox) * ease(p.dwell) * pp, tuned * 0.5);
      p.pp = pp;
      if (!p.found && d < 20 && on) {
        p.found = true; refreshLabels(p); updateFound(); save();
        SW.Audio.chime();
        banner('♪ NEW', p.song.title); lastFocus = undefined; guide.refresh();
      }
      if (!on) { p.f = SILENT; return; }
      const ch = A.channels[p.idx];
      if (d < R_AUD * 1.1 || viewing || tuned > 0) ch.start();
      else if (d > R_AUD * 1.3 && ch.gain < 0.002) ch.stop();
      const cut = 260 * Math.pow(20000 / 260, clamp(pp * 1.25, 0, 1));
      const side = d > 0.01 ? (dx * rx + dz * rz) / d : 0;
      ch.setTargets(p.gain, viewing ? 0 : clamp(side * 0.85 * (1 - pp * pp), -0.85, 0.85), cut);
      p.f = ch.analyse(dt, t);
      p.songT = ch.mode === 'media' && ch.el && ch.playing && ch.synced && isFinite(ch.el.currentTime) ? ch.el.currentTime : null;   // where the real track is, for scenery that follows the song
      p.dir = Math.atan2((dx * rx + dz * rz), (dx * fx + dz * fz));
      if (p.gain > 0.012 && (!loud || p.gain > loud.gain)) loud = p;
    });
    loudP = loud;
    npT -= dt;
    if (npT <= 0) {
      npT = 0.08;
      const np = $('#np');
      if (loud && mode === 'walk' && !drv) {   // behind the wheel the radio shows it
        np.hidden = false;
        $('#npTitle').textContent = loud.found ? loud.song.title : '？';
        $('#npArrow').style.transform = `rotate(${loud.dir}rad)`;
        $('#npArrow').style.color = loud.color;
        setMeter($('#npMeter'), Math.sqrt(loud.gain));
      } else np.hidden = true;
    }
  }

  /* ================= update ================= */
  const tmpV = new THREE.Vector3(), tmpL = new THREE.Vector3(), tmpU = new THREE.Vector3(), fwd = new THREE.Vector3();
  let lastKmh = -1;
  // In a stairwell (p.stairs: SHOT's stair tower) you go on foot: no board, no jumping (the flight above would be in your
  // head), and your feet stay on the treads instead of easing after them. A path's points marked tight (its flights) are
  // walked at a walking pace and reached exactly, so the auto-walk turns at each landing.
  const stairAt = (x, z) => places.some((q) => { if (!q.stairs) return false; const l = q.local(x, z); return q.stairs(l.x, l.z); });
  function update(dt) {
    padV = pad();
    if (drv) driveUpdate(dt, mode !== 'walk');
    else if (mode === 'walk') {
      const iv = inputVec();
      let mx = 0, mz = 0, sp = 0;
      // Hold run (or auto-travel a long way) to hop on the board: speed builds up, turns get wider.
      const want = (running || dashOn || padRun || (auto && auto.pts.length - auto.i > 5 && !auto.pts[auto.i].tight)) && !stairAt(P.x, P.z);
      boost += ((want && (iv.m > 0.05 || auto) ? 1 : 0) - boost) * Math.min(1, dt * 2.2);
      const top = 7.5 + 9.5 * boost;
      if (iv.m > 0.05) {
        const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
        mx = fx * iv.f + rx * iv.s; mz = fz * iv.f + rz * iv.s;
        const m = Math.hypot(mx, mz) || 1; mx /= m; mz /= m; sp = top * iv.m; auto = null;
      } else if (auto) {
        const tg = auto.pts[auto.i], dx = tg.x - P.x, dz = tg.z - P.z, d = Math.hypot(dx, dz);
        const lastPt = auto.i === auto.pts.length - 1;
        if (d < (lastPt ? 0.3 : tg.tight ? 0.4 : 1.2 + P.v * 0.25)) {   // faster means a wider turn, so count a waypoint as reached from further out
          if (!lastPt) auto.i++;
          else { const th = auto.then; auto = null; if (th && level(th)) { faceTo(th); act(th); } }
        } else { mx = dx / d; mz = dz / d; sp = lastPt ? Math.min(top, d * 5 + 1) : tg.tight ? Math.min(top, 3.6) : top; }
      }
      if (sp > 0) {
        const tr = Math.min(1, dt * (14 - 9.5 * boost));
        P.hx += (mx - P.hx) * tr; P.hz += (mz - P.hz) * tr;
        const hl = Math.hypot(P.hx, P.hz) || 1; P.hx /= hl; P.hz /= hl;
      }
      P.v += (sp - P.v) * Math.min(1, dt * (auto && sp < top ? 10 : sp > P.v ? 8 : 4));
      let turn = 0;
      if (P.v > 0.05) {
        const ox = P.x, oz = P.z, np = { x: P.x + P.hx * P.v * dt, z: P.z + P.hz * P.v * dt };
        collide(np); P.x = np.x; P.z = np.z;
        const moved = Math.hypot(P.x - ox, P.z - oz);
        if (auto && moved < P.v * dt * 0.2) {
          auto.stuck = (auto.stuck || 0) + dt;
          if (auto.stuck > 0.5) { const th = auto.then; auto = null; if (th && Math.hypot(th.x - P.x, th.z - P.z) < th.r + 1 && level(th)) { faceTo(th); act(th); } }
        } else if (auto) auto.stuck = 0;
        if (moved < P.v * dt * 0.4) P.v *= 0.8;
        let df = Math.atan2(P.hx, P.hz) - P.face; df = Math.atan2(Math.sin(df), Math.cos(df)); P.face += df * Math.min(1, dt * 12);
        turn = df;
        updateRegion(true);
      }
      P.lean += (clamp(-turn * 4, -0.45, 0.45) * boost - P.lean) * Math.min(1, dt * 6);
      P.speed = P.v;
      focus = null;
      let best = 1e9;
      const fx = Math.sin(P.face), fz = Math.cos(P.face);
      for (const ia of interact) {
        const dx = ia.x - P.x, dz = ia.z - P.z, d = Math.hypot(dx, dz);
        if (d > ia.r || ia.off || !level(ia)) continue;
        const dot = (dx * fx + dz * fz) / (d || 1);
        if (dot < 0.15 && d > 1.4) continue;
        const sc = d - dot;
        if (sc < best) { best = sc; focus = ia; }
      }
    } else {
      P.speed += (0 - P.speed) * Math.min(1, dt * 10); P.v = 0; P.lean = 0; boost += (0 - boost) * Math.min(1, dt * 4);
    }
    // In the air you land only on what was within reach of where you took off (a deck up to two steps above it), and never
    // on one you jump at from underneath, however high the jump: a deck you are under is your ceiling (head stops below it).
    const gh = groundAt(P.x, P.z, P.air ? Math.min(P.y, P.jy + DECK_STEP) : P.y);
    if (!drv && !ride && stairAt(P.x, P.z)) { P.air = false; P.vy = 0; P.y = gh; boost = 0; }   // on the stairs (see stairAt)
    if (drv) { /* the car sets the height */ }
    else if (ride) rideTick(dt);   // the ride sets it
    else if (P.air) {
      const top = groundAt(P.x, P.z), under = top > gh && !onDeck(top, P.y);
      P.vy -= 24 * dt; P.y += P.vy * dt;
      if (under && P.y > Math.max(gh, top - HEADROOM)) { P.y = Math.max(gh, top - HEADROOM); P.vy = Math.min(P.vy, 0); }
      if (P.vy <= 0 && P.y <= gh) { P.y = gh; P.air = false; }
    }
    else { P.y += (gh - P.y) * Math.min(1, dt * 14); if (hillAt(P.x, P.z) > 0.05) P.y = clamp(P.y, gh - 0.06, gh + 0.12); }   // the easing that softens a kerb would lag a long slope, sinking the feet into it going up
    avatar.G.position.set(P.x, P.y, P.z);
    avatar.G.rotation.y = P.face;
    avatar.G.visible = !drv && !pool && !(ride && (ride.st === 'on' || ride.st === 'stopping'));
    const onW = gh < 0.1 && isWater(P.x, P.z);
    avatar.animate(dt, P.speed, 0, boost, P.lean, onW);
    wakeTick(dt, onW && !drv, P.x, P.z, P.face, P.speed);

    const show = focus && mode === 'walk';
    marker.visible = !!show;
    if (show) { marker.position.set(focus.x, focus.mark + Math.sin(t * 3) * 0.08, focus.z); marker.rotation.y = t * 2; }
    const fkey = show ? focus : null;
    if (fkey !== lastFocus) {
      lastFocus = fkey;
      $('#prompt').hidden = !fkey; $('#prompt').className = fkey ? 'k-' + fkey.kind : '';
      if (fkey) {
        $('#promptKey').textContent = TOUCH ? 'A' : 'Z';
        $('#promptText').textContent = fkey.kind === 'ride' ? fkey.label : fkey.kind === 'store' ? 'RECORDS' : fkey.kind === 'hoop' ? 'FREE THROW' : fkey.kind === 'pool' ? 'POOL' : fkey.kind === 'garage' ? 'CHOOSE A CAR' : !fkey.place ? '' : fkey.place.found ? '♪ ' + fkey.place.song.title : '？';
      }
    }
    { const ba = $('#btnA'); ba.classList.toggle('ready', !!fkey); ba.classList.toggle('k-car', !!fkey && fkey.kind === 'car'); ba.classList.toggle('k-exit', !!fkey && fkey.kind === 'exit'); }

    updateAudio(dt); radioTick(dt); spotTick();
    updTraffic(dt); updCTraffic(dt);

    // Lighting: blend towards the closest place's grade.
    let bp = null, bw = 0, wsum = 0, wfar = 0;
    places.forEach((p) => {
      const d = reachD(p);
      const w = smooth(48, 16, d - (drv ? 20 : 0));   // from the road the places are a little further off, so reach for them sooner
      if (w > bw) { bw = w; bp = p; }
      // the wider region: every place within ~115 m pulls the light a little its way, so day does not flip to night at a line
      const wf = smooth(115, 28, d) ** 2;
      if (wf > 0) { wsum += wf; mixGrade(GA, GA, p.grade, wf / wsum); wfar = Math.max(wfar, wf); }
    });
    drvK += ((drv ? 1 : 0) - drvK) * Math.min(1, dt * 0.9);
    mixGrade(GB, BASE, DRIVE, ease(clamp(drvK, 0, 1)));
    mixGrade(GR, GB, wsum > 0 ? GA : GB, wsum > 0 ? 0.55 * wfar : 0);
    mixGrade(G, GR, bp ? bp.grade : GR, bp ? bw : 0);
    applyGrade();
    ringView.upd(clamp(1 - G.sunInt / 1.1, 0, 1), loudP && loudP.f ? loudP.f.pulse : 0);
    if (streetView) streetView.update(t);

    places.forEach((p) => {
      const v = smooth(60, 10, reachD(p));
      const f = p.f || SILENT;
      const l = (p.wake || p.lod) && p.local(P.x, P.z);
      if (p.lod) p.lod(l.x, l.z, scene.fog.far);   // a place spread far and wide (OHH's beaches) leaves out what the fog has swallowed, wherever you are
      const awake = v > 0.001 || (p.wake && p.wake(l.x, l.z));   // a place whose life reaches further than its light (OHH's beaches) keeps moving while you are out there
      if (awake || !p.ran) { p.ran = true; p.update(t, dt, f, v, false); }   // once at the start wherever you are: places set their out-in-the-world look in update()
      const d = Math.hypot(P.x - p.vx, P.z - p.vz);
      const hide = d < 7;
      p.beam.visible = !hide;
      p.beam.material.opacity = (p.found ? 0.07 : 0.12) + f.pulse * 0.16;
      p.ringM.material.opacity = 0.35 + f.pulse * 0.5 + Math.sin(t * 3) * 0.1;
      p.label.visible = false;
    });

    // Camera
    let tx = P.x, ty = P.y + 1.45, tz = P.z;
    if (ride && (ride.st === 'on' || ride.st === 'stopping')) {   // on a ride: through your own eyes, free to look round
      const yaw = P.face + ride.lookYaw, pt = ride.lookPitch;
      tmpV.set(P.x, P.y + 1.55, P.z); tmpL.set(P.x + Math.sin(yaw) * Math.cos(pt), P.y + 1.55 - Math.sin(pt), P.z + Math.cos(yaw) * Math.cos(pt)); tmpU.set(0, 1, 0);
    } else {
      let cd = camDist + boost * 1.8;
      if (mode === 'title') { camYaw += dt * 0.06; }
      else if (drv) {   // chase camera: it swings round behind the car unless you are dragging the view
        if (!drag) { camYaw += wrapA(drv.yaw + Math.PI - camYaw) * Math.min(1, dt * (2.5 + Math.abs(drv.v) * 0.1)); camPitch += (0.19 - camPitch) * Math.min(1, dt * 2); }
        cd = 6.4 + Math.abs(drv.v) * 0.04; ty = P.y + 1.3 + (drv.hit > 0.4 && !RM ? Math.sin(t * 55) * 0.05 * drv.hit : 0);
      }
      else {
        // Walking: the camera drifts round behind you the way you are heading, like a camera operator following on foot.
        // It waits a moment after you turn the view by hand, swings faster the faster you go, follows fully when you walk away
        // from it, a good deal when you walk across the screen too (A / D swings the view round with you) and not at all when you
        // walk towards it (S turns you round to face the camera instead of spinning it).
        if (mode === 'walk' && !drag && !pool && !hoop && P.v > 0.4) {
          const away = Math.cos(wrapA(P.face + Math.PI - camYaw)), hand = smooth(0.8, 2.2, t - lookT);
          const k = (auto ? 1 : clamp(away + 0.75, 0, 1)) * hand * smooth(0.4, 3, P.v) * (2.2 + boost * 1.8);
          camYaw += wrapA(P.face + Math.PI - camYaw) * Math.min(1, dt * k);
          camPitch += (0.2 + boost * 0.02 - camPitch) * Math.min(1, dt * 0.6 * hand * smooth(0.4, 4, P.v));   // and settles back to its usual height
        }
        const sh = 0.62 * (1 - boost * 0.6); tx += Math.cos(camYaw) * sh; tz -= Math.sin(camYaw) * sh;
      }
      let cx = tx + Math.sin(camYaw) * Math.cos(camPitch) * cd, cy = ty + Math.sin(camPitch) * cd, cz = tz + Math.cos(camYaw) * Math.cos(camPitch) * cd, ahead = 0;
      if (mode === 'title') { cx = Math.sin(camYaw) * 26; cz = Math.cos(camYaw) * 26; cy = 9; tx = 0; ty = 2; tz = 0; }
      else if (!drv) {   // on foot: a wall between you and the camera pulls the camera in front of it (inside a shop it stays inside)
        const inside = (r, x, z) => { const dx = x - r.x, dz = z - r.z; return Math.abs(dx * r.c - dz * r.s) < r.hx && Math.abs(dx * r.s + dz * r.c) < r.hz; };
        for (const r of rooms) if (inside(r, P.x, P.z)) {   // in a room the over-the-shoulder offset may not carry the camera's pivot into the wall beside you (camBlock lets a camera that starts in a wall be)
          const ex = tx - r.x, ez = tz - r.z, u = ex * r.c - ez * r.s, v = ex * r.s + ez * r.c, du = clamp(u, 0.35 - r.hx, r.hx - 0.35) - u, dv = clamp(v, 0.35 - r.hz, r.hz - 0.35) - v;
          const mx = du * r.c + dv * r.s, mz = -du * r.s + dv * r.c; tx += mx; tz += mz; cx += mx; cz += mz;
        }
        let k = camBlock(tx, tz, cx, cz, ty), inRoom = null;
        for (const r of rooms) {   // inside a shop the camera stays inside it, even when the line runs out through the door
          if (!inside(r, P.x, P.z)) continue;   // (whether you are in it, not where the shoulder offset points)
          const L = (x, z) => { const dx = x - r.x, dz = z - r.z; return [dx * r.c - dz * r.s, dx * r.s + dz * r.c]; }, [u0, v0] = L(tx, tz), [u1, v1] = L(cx, cz), hx = r.hx - 0.35, hz = r.hz - 0.35;
          inRoom = { r, u0, v0 }; let te = 1; for (const [p0, d, h] of [[u0, u1 - u0, hx], [v0, v1 - v0, hz]]) if (Math.abs(d) > 1e-9) te = Math.min(te, Math.max(0, ((d > 0 ? h : -h) - p0) / d));
          k = Math.min(k, te + 0.35 / Math.max(1, cd));
        }
        if (!inRoom) {   // outdoors the distance a wall pulls the camera in to is eased back out (in at once, so no wall ever hides you), not snapped back as the corner passes
          const want = k < 1 ? Math.max(0.6, cd * k - 0.35) : cd;
          camPull = camPull == null || want < camPull ? want : camPull + (want - camPull) * Math.min(1, dt * 2.5);
          if (camPull < cd - 0.01) k = (camPull + 0.35) / cd - 1e-6; else k = 1;
        } else camPull = null;
        if (k < 1) { const c2 = Math.max(inRoom ? 0.05 : 0.6, cd * k - 0.35); cx = tx + Math.sin(camYaw) * Math.cos(camPitch) * c2; cy = ty + Math.sin(camPitch) * (inRoom ? cd - (cd - c2) * 0.2 : c2); cz = tz + Math.cos(camYaw) * Math.cos(camPitch) * c2; if (inRoom) ahead = Math.min(2.4, (cd - c2) * 0.6); }   // indoors, squeezed: it keeps up high and looks past you (over the pool table's rails), and may come right in over you rather than out through a wall
        if (ahead > 0) {   // ...but not into the wall in front of you: the point it looks at stays a metre clear of the room's walls
          const { r, u0, v0 } = inRoom, sy = -Math.sin(camYaw), sz = -Math.cos(camYaw), du = sy * r.c - sz * r.s, dv = sy * r.s + sz * r.c; let te = 9;
          for (const [p0, d, h] of [[u0, du, r.hx - 0.35], [v0, dv, r.hz - 0.35]]) if (Math.abs(d) > 1e-9) te = Math.min(te, ((d > 0 ? h : -h) - p0) / d);
          ahead = Math.min(ahead, Math.max(0, te - 1));
        }
        for (const r of rooms) { const dx = tx - r.x, dz = tz - r.z, u = dx * r.c - dz * r.s, v = dx * r.s + dz * r.c; if (Math.abs(u) < r.hx && Math.abs(v) < r.hz) cy = Math.min(cy, r.y - 0.35); }   // and under its roof
        for (const l of lids) { const dx = cx - l.x, dz = cz - l.z; if (Math.abs(dx * l.c - dz * l.s) < l.hx && Math.abs(dx * l.s + dz * l.c) < l.hz) cy = Math.max(cy, l.y); }   // over the pool table, not through it
      }
      else camPull = null;
      cx = clamp(cx, -345, 345); cz = clamp(cz, -345, 345);
      { const fl = groundAt(cx, cz, P.y) + 0.5; camFloor = camFloor == null || fl > camFloor || mode === 'title' ? fl : camFloor + (fl - camFloor) * Math.min(1, dt * 6); }   // over a kerb or a deck edge the camera's floor rises at once but sinks back gently
      cy = Math.min(40, Math.max(camFloor, cy));
      for (const q of places) if (q.ceil && P.y < 3) { const l = q.local(cx, cz), lp = q.local(P.x, P.z), c = q.ceil(l.x, l.z) ?? q.ceil(lp.x, lp.z); if (c != null) cy = Math.min(cy, c); }   // under a roof (a tunnel): keep below it   // P.y: the camera follows you into a tunnel or onto an upper floor
      tmpV.set(cx, cy, cz); tmpL.set(tx - Math.sin(camYaw) * ahead, ty - 0.1 - ahead * 0.25, tz - Math.cos(camYaw) * ahead); tmpU.set(0, 1, 0);
    }
    // The phone out (not the shop's counter): the camera comes in close over your right shoulder, the way a film frames
    // someone reading their phone, you on the left of the picture; the phone fills the right and the world behind it
    // softens (body.phoning, style.css).
    phCam += ((mode === 'phone' && !drv && !$('#phone').classList.contains('counter') ? 1 : 0) - phCam) * Math.min(1, dt * (mode === 'phone' ? 3.2 : 5));
    if (phCam > 0.002) {
      const fx = Math.sin(P.face), fz = Math.cos(P.face), rx = -fz, rz = fx, k = ease(clamp(phCam, 0, 1)), wide = innerWidth > innerHeight;
      const back = wide ? 2.15 : 2.3, side = wide ? 0.95 : 0.35, look = wide ? 1.25 : 0.2;
      phV.set(P.x - fx * back + rx * side, P.y + 1.72, P.z - fz * back + rz * side); phL.set(P.x + fx * 2.2 + rx * look, P.y + 1.3, P.z + fz * 2.2 + rz * look);
      tmpV.lerp(phV, k); tmpL.lerp(phL, k);
    }
    if (camBlend < 1) {
      camBlend = Math.min(1, camBlend + dt / camBlendDur);
      const k = ease(camBlend);
      tmpV.lerpVectors(camFrom.pos, tmpV, k); tmpL.lerpVectors(camFrom.look, tmpL, k); tmpU.lerpVectors(camFrom.up, tmpU, k).normalize();
    }
    const dv = drv ? Math.abs(drv.v) : 0;
    const fv = baseFov + (RM ? 0 : drv ? clamp(dv / 58, 0, 1) * 24 : boost * 15 + clamp(P.v / 7.5, 0, 1) * (1 - boost) * 4);
    if (Math.abs(camera.fov - fv) > 0.05) { camera.fov = fv; camera.updateProjectionMatrix(); }
    const spd = drv ? clamp((dv - 22) / 34, 0, 1) : boost * clamp(P.v / 16, 0, 1);
    post.uniforms.spd.value = RM ? 0 : spd;
    if (wind && drv) {   // the same two voices play the engine: pitch climbs through each gear and drops on the shift
      const ct = SW.Audio.ctx.currentTime, GEARS = [0, 9, 18, 28, 40, 62]; let gi = 0; while (gi < 4 && dv >= GEARS[gi + 1]) gi++;
      const rpm = 0.3 + 0.7 * clamp((dv - GEARS[gi]) / (GEARS[gi + 1] - GEARS[gi]), 0, 1);
      wind.g.gain.setTargetAtTime(0.012 + 0.03 * spd * spd, ct, 0.15); wind.f.frequency.setTargetAtTime(300 + 500 * clamp(dv / 58, 0, 1), ct, 0.15);
      wind.hg.gain.setTargetAtTime(0.015 + 0.015 * rpm, ct, 0.1); wind.o1.frequency.setTargetAtTime(44 + 62 * rpm, ct, 0.07); wind.o2.frequency.setTargetAtTime(66 + 93 * rpm, ct, 0.07);
    } else if (wind) { const ct = SW.Audio.ctx.currentTime, w = smooth(0.35, 1, spd); wind.g.gain.setTargetAtTime(0.01 * w * w, ct, 0.4); wind.f.frequency.setTargetAtTime(220 + 180 * spd, ct, 0.4); wind.hg.gain.setTargetAtTime(0, ct, 0.1); }   // on foot and on a board: no hum, only a faint, low rush of air at full speed
    camera.position.copy(tmpV); camera.up.copy(tmpU); camera.lookAt(tmpL); camLook.copy(tmpL);
    sky.position.copy(camera.position); stars.position.copy(camera.position);
    planet.position.set(camera.position.x - 260, camera.position.y + 250, camera.position.z - 380);
    worldUpd.forEach((f) => f(t, dt));
    if (drv) { const kmh = Math.round(dv * 3.6); if (kmh !== lastKmh) { lastKmh = kmh; $('#spdNum').textContent = kmh; $('#spdBar').firstElementChild.style.width = Math.min(100, kmh / 2.1) + '%'; } }
    farLights.opacity = Math.sin(t * 2.2) > 0.2 ? 1 : 0.15;
    sun.position.set(P.x + G.sunDir.x * 60, P.y + G.sunDir.y * 60, P.z + G.sunDir.z * 60);
    sun.target.position.set(P.x, P.y, P.z);
  }

  /* ================= minimap & edge markers ================= */
  const mini = $('#mini'), mc = mini.getContext('2d');
  function drawMini() {
    const g = mc, S = mini.width, c = S / 2, Rm = c - 3, k = Rm / 75;
    const cy = Math.cos(camYaw), sy = Math.sin(camYaw);
    const tr = (x, z) => { const dx = x - P.x, dz = z - P.z; return [c + (dx * cy - dz * sy) * k, c + (dx * sy + dz * cy) * k]; };
    g.clearRect(0, 0, S, S);
    g.save(); g.beginPath(); g.arc(c, c, Rm, 0, 7); g.clip();
    g.fillStyle = 'rgba(12,12,11,.88)'; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(200,192,170,.8)'; g.lineWidth = 2.5; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); for (let i = 0; i < loopPath.length; i += 2) { const [x, y] = tr(loopPath[i].x, loopPath[i].z); if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke();
    places.forEach((p) => { g.beginPath(); for (let i = 0; i < p.path.length; i += 3) { const [x, y] = tr(p.path[i].x, p.path[i].z); if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); });
    g.strokeStyle = 'rgba(96,104,118,.95)'; g.lineWidth = 6; g.beginPath();   // the ring road
    for (let i = 0; i <= ring.N; i += 2) { const [x, y] = tr(ring.X[i % ring.N], ring.Z[i % ring.N]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    for (const B of ring.roads.slice(1)) { g.moveTo(...tr(B.X[0], B.Z[0])); for (let i = 2; i < B.N; i += 2) g.lineTo(...tr(B.X[i], B.Z[i])); }
    g.stroke(); g.strokeStyle = 'rgba(232,226,208,.55)'; g.lineWidth = 1; g.setLineDash([4, 5]); g.stroke(); g.setLineDash([]);
    ring.pas.forEach((pa) => { const [x, y] = tr(pa.slot.x, pa.slot.z); g.fillStyle = '#2f6fd0'; g.fillRect(x - 5, y - 5, 10, 10); g.strokeStyle = '#e8e2d0'; g.lineWidth = 1.5; g.strokeRect(x - 5, y - 5, 10, 10); });   // parking areas
    const [px, py] = tr(0, 0);
    g.fillStyle = '#8a8376'; g.beginPath(); g.arc(px, py, PLAZA_R * k, 0, 7); g.fill();
    g.restore();
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 9px sans-serif';
    places.forEach((p) => {
      let [x, y] = tr(p.vx, p.vz);
      const dx = x - c, dy = y - c, d = Math.hypot(dx, dy), out = d > Rm - 6;
      if (out) { x = c + (dx / d) * (Rm - 5); y = c + (dy / d) * (Rm - 5); }
      g.beginPath(); g.arc(x, y, out ? 4 : 6.5, 0, 7); g.fillStyle = p.found ? p.color : '#9aa0b0'; g.fill();
      g.lineWidth = 1.5; g.strokeStyle = '#05060a'; g.stroke();
      if (!out) { g.fillStyle = '#05060a'; g.fillText(p.found ? '♪' : '?', x, y + 0.5); }
    });
    g.save(); g.translate(c, c); g.rotate(Math.PI - (P.face - camYaw));
    g.fillStyle = '#e8e2d0'; g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath(); g.fill();
    g.lineWidth = 1.5; g.strokeStyle = '#05060a'; g.stroke(); g.restore();
    g.beginPath(); g.arc(c, c, Rm, 0, 7); g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.4)'; g.stroke();
  }
  // Arrows at the screen edge pointing at the nearest places that are off screen (with distance).
  const v3 = new THREE.Vector3();
  places.forEach((p) => { const el = document.createElement('div'); el.className = 'edge-i'; el.hidden = true; el.innerHTML = '<i></i><b></b>'; $('#edge').appendChild(el); p.edge = el; });
  function updateEdge() {
    const W = innerWidth, H = innerHeight, cand = [];
    places.forEach((p) => {
      p.edge.hidden = true;
      if (mode !== 'walk') return;
      const d = Math.hypot(P.x - p.vx, P.z - p.vz);
      if (d < 14) return;
      v3.set(p.vx, p.vy + 4, p.vz).applyMatrix4(camera.matrixWorldInverse);
      let x, y;
      if (v3.z < 0) { v3.applyMatrix4(camera.projectionMatrix); x = v3.x; y = v3.y; if (Math.abs(x) < 0.85 && Math.abs(y) < 0.8) return; }
      else { x = v3.x || 1; y = -Math.abs(v3.x) * 0.35; }
      cand.push({ p, d, x, y });
    });
    cand.sort((a, b) => a.d - b.d).slice(0, 3).forEach(({ p, d, x, y }) => {
      const l = Math.hypot(x, y) || 1, ux = x / l, uy = y / l;
      const sc = Math.min((W / 2 - 34) / Math.abs(ux || 1e-6), (H / 2 - 78) / Math.abs(uy || 1e-6));
      const el = p.edge;
      el.hidden = false;
      el.style.transform = `translate(${W / 2 + ux * sc}px,${H / 2 - uy * sc}px)`;
      el.style.color = p.found ? p.color : '#eef0f5';
      el.firstChild.style.transform = `rotate(${Math.atan2(ux, uy)}rad)`;
      el.lastChild.textContent = Math.round(d) + 'm';
    });
  }
  let hintT = 0, hintOut = false;
  stickEl.addEventListener('pointerdown', () => stickEl.classList.add('used'));

  /* ================= start ================= */
  function start() {
    if (mode !== 'title') return;
    SW.Audio.init();
    SW.Audio.resume();
    { const ctx = SW.Audio.ctx, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      n.buffer = SW.Kit.noiseBuf; n.loop = true; f.type = 'lowpass'; f.frequency.value = 250; f.Q.value = 0.3; g.gain.value = 0;
      n.connect(f).connect(g).connect(SW.Audio.master); n.start();
      // the ride's own voice: a soft two-note hum that rises with speed, with a slow wobble
      const hg = ctx.createGain(), lp = ctx.createBiquadFilter(), o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      hg.gain.value = 0; lp.type = 'lowpass'; lp.frequency.value = 520; o1.type = 'triangle'; o2.type = 'sine'; lfo.frequency.value = 5.5; lg.gain.value = 3;
      lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
      o1.connect(lp); o2.connect(lp); lp.connect(hg).connect(SW.Audio.master); o1.start(); o2.start(); lfo.start();
      wind = { g, f, hg, o1, o2 }; }
    document.body.classList.remove('pre');
    $('#title').classList.add('out');
    setTimeout(() => ($('#title').hidden = true), 650);
    snapCam(); camBlendDur = 1.4;
    mode = 'walk';
    updateRegion(false);
    cv.focus({ preventScroll: true });
    loadCounts(true);
    if (shop.notes.length) setTimeout(() => toast(shop.notes.splice(0).join(' / '), 5200), 1400);   // e.g. back from Checkout
  }
  $('#startBtn').addEventListener('click', start);

  load();
  places.forEach((p) => { if (p.found) refreshLabels(p); });
  updateFound();
  $('#tArtist').textContent = CFG.artist;
  $('#tTitle').textContent = CFG.title;
  document.title = CFG.title;
  resize();

  // How far along the line from the player (x0, z0) to the camera (x1, z1) the first building-sized collider starts (1 = clear).
  // The wake: foam left on the water behind the craft. Each puff drifts out sideways from the stern (so together they open
  // into a V), spreads and fades; a line of larger puffs marks the track itself.
  const foamTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,.05)'); gr.addColorStop(0.75, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 90; i++) { const a = Math.random() * 6.28, r = 16 + Math.random() * 14; x.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.4})`; x.fillRect(32 + Math.cos(a) * r, 32 + Math.sin(a) * r, 1.5, 1.5); }
    return new THREE.CanvasTexture(c); })();   // a broken ring of foam
  const WAKE_N = 360, wakeM = new THREE.MeshBasicMaterial({ map: foamTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
  wakeM.userData.lin = true;
  const wakeMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), wakeM, WAKE_N);
  wakeMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(WAKE_N * 3), 3); wakeMesh.frustumCulled = false; wakeMesh.renderOrder = 2; scene.add(wakeMesh);
  const wakeP = Array.from({ length: WAKE_N }, () => ({ life: 0, max: 1, x: 0, z: 0, vx: 0, vz: 0, s0: 1, s1: 1, a: 0 }));
  let wakeI = 0, wakeAcc = 0; const wm4 = new THREE.Matrix4(), wq = new THREE.Quaternion(), wps = new THREE.Vector3(), wsc = new THREE.Vector3(), wcol = new THREE.Color();
  function wakeTick(dt, on, x, z, face, speed) {
    if (on && speed > 0.8) {
      wakeAcc += dt * (4 + speed * 0.9);
      const fx = Math.sin(face), fz = Math.cos(face), rx = fz, rz = -fx;
      while (wakeAcc >= 1) {
        wakeAcc -= 1;
        for (const sd of [-1, 1, 0]) {
          const q = wakeP[wakeI]; wakeI = (wakeI + 1) % WAKE_N;
          const out = sd * (0.5 + speed * 0.09);
          q.x = x - fx * 1.05 + rx * sd * 0.42 + (Math.random() - 0.5) * 0.2; q.z = z - fz * 1.05 + rz * sd * 0.42 + (Math.random() - 0.5) * 0.2;
          q.vx = rx * out - fx * 0.3; q.vz = rz * out - fz * 0.3;
          q.life = q.max = sd ? 2.6 + Math.random() * 0.8 : 1.6; q.s0 = sd ? 0.5 : 0.9; q.s1 = sd ? 1.8 + speed * 0.08 : 2.4; q.a = Math.min(0.2, 0.07 + speed * 0.008);
        }
      }
    }
    for (let i = 0; i < WAKE_N; i++) {
      const q = wakeP[i];
      if (q.life <= 0) { wsc.set(0, 0, 0); wm4.compose(wps.set(0, -50, 0), wq, wsc); wakeMesh.setMatrixAt(i, wm4); continue; }
      q.life -= dt; q.x += q.vx * dt; q.z += q.vz * dt; q.vx *= 1 - dt * 0.6; q.vz *= 1 - dt * 0.6;
      const k = 1 - Math.max(0, q.life) / q.max, s = q.s0 + (q.s1 - q.s0) * Math.sqrt(k);
      wps.set(q.x, 0.1, q.z); wsc.set(s, 1, s * 1.4); wm4.compose(wps, wq, wsc); wakeMesh.setMatrixAt(i, wm4);
      const a = q.a * (1 - k) * (1 - k); wakeMesh.setColorAt(i, wcol.setRGB(a, a, a));
    }
    wakeMesh.instanceMatrix.needsUpdate = true; wakeMesh.instanceColor.needsUpdate = true;
  }
  function camBlock(x0, z0, x1, z1, y) {
    let best = 1; const L = Math.hypot(x1 - x0, z1 - z0) + 4;
    for (const b of boxes) {
      if (b.noCam || Math.max(b.hx, b.hz) < 1.8 || (b.y1 !== undefined && b.y1 < y) || (b.y0 !== undefined && b.y0 > y)) continue;
      const ex = Math.abs(b.x - x0), ez = Math.abs(b.z - z0); if (ex > L + b.hx + b.hz || ez > L + b.hx + b.hz) continue;
      const c = b.c ?? 1, s = b.s ?? 0, loc = (x, z) => { const dx = x - b.x, dz = z - b.z; return [dx * c - dz * s, dx * s + dz * c]; };
      const [u0, v0] = loc(x0, z0), [u1, v1] = loc(x1, z1), hx = b.hx + 0.15, hz = b.hz + 0.15;
      if (Math.abs(u0) < hx && Math.abs(v0) < hz) continue;   // hugging it: leave the camera be
      let t0 = 0, t1 = 1, ok = true;
      for (const [p, d, h] of [[u0, u1 - u0, hx], [v0, v1 - v0, hz]]) {
        if (Math.abs(d) < 1e-9) { if (Math.abs(p) > h) { ok = false; break; } continue; }
        let ta = (-h - p) / d, tb = (h - p) / d; if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) { ok = false; break; }
      }
      if (ok && t0 < best) best = t0;
    }
    return best;
  }
  let last = performance.now(), camHold = null, phCam = 0;
  const phV = new THREE.Vector3(), phL = new THREE.Vector3();
  // No stalls when a place comes into or goes out of view. three.js builds every material's shader for one number of
  // lights, and rebuilds all of them (a few hundred: a stall of a third of a second or more on a laptop GPU) whenever that
  // number changes, as it did each time a place's group was shown or hidden with its lamps in it. So every lamp a place
  // owns is stood in for by a stand-in kept at the scene's root, always counted: it takes the lamp's place, colour and
  // brightness each frame, and goes dark (instead of away) while the lamp or anything it hangs from is hidden.
  // The place's own lamp stays where it was for its code to drive, but is never drawn (its visible always reads false).
  const pins = [];
  {
    const holder = new THREE.Group(); holder.name = 'lamp stand-ins'; scene.add(holder);
    const own = []; scene.traverse((o) => { if (o.isPointLight && o.parent && o.parent !== scene) own.push(o); });
    for (const L of own) {
      const c = new THREE.PointLight(L.color, 0, L.distance, L.decay); holder.add(c);
      const s = { L, c, on: L.visible !== false }; pins.push(s);
      Object.defineProperty(L, 'visible', { configurable: true, get: () => false, set: (v) => { s.on = !!v; } });
    }
  }
  function syncPins() {
    for (const s of pins) {
      const { L, c } = s; let on = s.on; for (let q = L.parent; on && q; q = q.parent) if (!q.visible) on = false;
      c.intensity = on ? L.intensity : 0;
      if (on) { c.color.copy(L.color); c.distance = L.distance; c.decay = L.decay; L.getWorldPosition(c.position); }
    }
  }
  // ...and every shader is built while the loading screen is up, not the first time its thing comes into view
  try { syncPins(); renderer.setRenderTarget(rt); renderer.compile(scene, camera); renderer.setRenderTarget(null); } catch (e) { console.warn('shader warm-up skipped', e); }

  function loop(now) {
    const dt = clamp((now - last) / 1000, 0, 0.05);   // the first frame's stamp can predate the clock read after a long build: never run time backwards (FLIP's cabs index off their loop)
    last = now; t += dt;
    if (mode === 'dialog') tickDlg(dt);
    update(dt);
    if (hoop) hoopTick(dt);
    if (pool) poolTick(dt);
    if (mode === 'phone') playerUI(dt);
    countTick();
    if (camHold) camHold(camera);   // debug: a test can fly the camera
    post.uniforms.time.value = t; skyU.time.value = t;
    syncPins();
    renderer.setRenderTarget(rt); renderer.render(scene, camera);
    renderer.setRenderTarget(null); renderer.render(postScene, postCam);
    if (mode === 'walk') drawMini();
    updateEdge();
    { v3.copy(camera.position).addScaledVector(G.sunDir, 400).applyMatrix4(camera.matrixWorldInverse);
      let fl = 0;
      if (v3.z < 0) { v3.applyMatrix4(camera.projectionMatrix); fl = (1 - smooth(0.9, 1.5, Math.max(Math.abs(v3.x), Math.abs(v3.y)))) * (G.sunInt > 2 ? 0.6 : 0) * (1 - clamp(G.stars * 1.5, 0, 1)); post.uniforms.sunUv.value.set(v3.x * 0.5 + 0.5, v3.y * 0.5 + 0.5); }
      post.uniforms.flare.value += ((RM ? fl * 0.5 : fl) - post.uniforms.flare.value) * 0.15; }
    if (!hintOut && mode === 'walk' && P.speed > 1 && (hintT += dt) > 3) { hintOut = true; $('#hint').classList.add('out'); }
    requestAnimationFrame(loop);
  }
  const fontsReady = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]) : Promise.resolve();
  fontsReady.then(() => {
    
    mode = 'title';
    $('#title').hidden = false;
    guide.refresh();
    $('#loading').classList.add('out');
    requestAnimationFrame(loop);
    $('#startBtn').focus({ preventScroll: true });
  });

  // Exposed for automated checks.
  window.__soundwalk = { holdCam(f) { camHold = f; }, groundAt, hills: () => hillField, isWater, camera, rooms, camBlock, hallAt, get hoop() { return hoop; }, get pool() { return pool; }, poolHold, poolTick, poolCam, hoopShoot, endHoop, hoopTick, startHoop, startPool, boxes, circles, shopAt, P, places, collide, shop, player, owned: SW.owned, verify, loadCounts, avatar, scene, setT(v) { t = v; }, setCam(y, pt) { camYaw = y; if (pt !== undefined) camPitch = pt; }, get mode() { return mode; }, routeTo, radio, radioTune, radioStep, radioOpen, spot, openSong, start, ring, rq, traffic, startDrive, endDrive, ctraffic, loopPath, drive: () => drv, step(n, dt) { for (let i = 0; i < n; i++) { t += dt; update(dt); } } };
})();
