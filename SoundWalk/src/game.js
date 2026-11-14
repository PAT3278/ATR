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
  const TEXSIZE = { grass: 512, path: 256, slate: 512, trail: 256 };
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
    checker(g, S) { const h = S / 2; g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, S, S); g.fillStyle = '#bdbdbd'; g.fillRect(0, 0, h, h); g.fillRect(h, h, h, h); },
    windows(g, S, r) { g.fillStyle = '#000'; g.fillRect(0, 0, S, S); const n = 4, w = S / n; const cols = ['#ffd27a', '#ffe9b8', '#9ff3ff', '#ff8ad8', '#ffd27a']; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { if (r() < 0.45) continue; g.fillStyle = cols[Math.floor(r() * cols.length)]; g.globalAlpha = 0.5 + r() * 0.5; g.fillRect(x * w + w * 0.2, y * w + w * 0.25, w * 0.6, w * 0.45); } g.globalAlpha = 1; },
  };
  const texBase = {}, texCache = {};
  function tex(kind, rx = 1, ry = 1) {
    const key = `${kind}:${rx}:${ry}`;
    if (texCache[key]) return texCache[key];
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
    uniforms: { tD: { value: rt.texture }, res: { value: new THREE.Vector2(1, 1) }, time: { value: 0 }, bloom: { value: 1.0 }, grain: { value: 0.065 }, vig: { value: 0.6 }, thr: { value: HDR ? 1.0 : 0.85 }, tint: { value: new THREE.Vector3(1, 1, 1) }, expo: { value: 1 }, sat: { value: 1 }, spd: { value: 0 }, sunUv: { value: new THREE.Vector2(0.5, 0.5) }, flare: { value: 0 } },
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
      float l=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(l),c,sat);c=mix(c*vec3(.97,1.,.93)+vec3(.006,.008,0.),c*vec3(1.04,1.,.92),smoothstep(.05,.7,l));
      c=pow(max(c,0.),vec3(1./2.2));c=mix(c,c*c*(3.-2.*c),.36);
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
    gr.addColorStop(0, '#0f4fb0'); gr.addColorStop(0.3, '#3d97e6'); gr.addColorStop(0.49, '#d8f2ff'); gr.addColorStop(0.5, '#a9c9b0'); gr.addColorStop(0.62, '#4f8f48'); gr.addColorStop(1, '#2c5a30');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
    const r = rng(77);
    for (let i = 0; i < 26; i++) { const x = r() * 512, y = 30 + r() * 80, w = 30 + r() * 60, cg = g.createRadialGradient(x, y, 0, x, y, w); cg.addColorStop(0, 'rgba(255,255,255,.9)'); cg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = cg; g.save(); g.translate(x, y); g.scale(1, 0.35); g.translate(-x, -y); g.fillRect(x - w, y - w, w * 2, w * 2); g.restore(); }
    const sg = g.createRadialGradient(150, 60, 0, 150, 60, 40); sg.addColorStop(0, '#ffffff'); sg.addColorStop(0.2, 'rgba(255,250,230,.95)'); sg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = sg; g.fillRect(100, 10, 100, 100);
    const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.encoding = THREE.sRGBEncoding;
    try { const pm = new THREE.PMREMGenerator(renderer), out = pm.fromEquirectangular(t).texture; pm.dispose(); t.dispose(); return out; } catch (e) { return null; }
  })();
  function gloss(hex, o = {}) {
    const m = new THREE.MeshStandardMaterial({ color: lin(hex), roughness: o.rough ?? 0.2, metalness: o.metal ?? 0.05, envMap: envTex, envMapIntensity: o.env ?? 0.7, map: o.map || null, transparent: o.opacity !== undefined, opacity: o.opacity ?? 1, depthWrite: o.opacity === undefined });
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
    void main(){vec3 d=normalize(vD);float h=d.y;vec3 c=mix(bottom,top,pow(clamp(h,0.,1.),.55));c=mix(c,bottom*.55,clamp(-h*3.,0.,1.));
      float s=max(dot(d,normalize(sunDir)),0.);c+=sunCol*(pow(s,600.)*6.+pow(s,12.)*.35);
      if(h>.01){vec2 uv=d.xz/(h+.2)*1.3+vec2(time*.006,time*.002);float n=fbm(uv);float den=smoothstep(.3,.72,n)*smoothstep(.01,.22,h);
        vec3 cc=mix(mix(top,bottom,.5)*.8,bottom*1.25+sunCol*.3*pow(s,3.),smoothstep(.48,.9,n)*.75+pow(s,5.)*.25);c=mix(c,cc,den*.92);}
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
    for (let i = 0; i < 30; i++) { const a = (i / 30) * Math.PI * 2 + r() * 0.15, d = 300 + r() * 60, h = 30 + r() * 55, m = new THREE.Mesh(new THREE.ConeGeometry(45 + r() * 45, h, 6), farM); m.position.set(Math.cos(a) * d, h / 2 - 3, Math.sin(a) * d); m.rotation.y = r() * 3; farGroup.add(m); }
    for (let i = 0; i < 14; i++) { const a = r() * Math.PI * 2, d = 330 + r() * 90, h = 130 + r() * 190, w = 7 + r() * 9;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.2, w, h, 5), farM2); m.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d); farGroup.add(m);
      if (i % 2 === 0) { const ring = new THREE.Mesh(new THREE.TorusGeometry(w * 1.9, w * 0.12, 4, 24), farM2); ring.rotation.x = Math.PI / 2; ring.position.set(m.position.x, h * 0.72, m.position.z); farGroup.add(ring); }
      bl.push(m.position.x, h + 1.5, m.position.z, m.position.x, h * 0.72, m.position.z); }
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(bl, 3));
    farGroup.add(new THREE.Points(bg, farLights)); }
  scene.add(farGroup); farGroup.children.forEach((m) => { if (m.material !== farM) m.visible = false; });
  const hemi = new THREE.HemisphereLight(lin('#c6d8ff'), lin('#5d4b39'), 0.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 160 });
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  const pick = [];
  const circles = [], boxes = [], waters = [];
  function isWater(x, z) { for (const b of waters) { const dx = x - b.x, dz = z - b.z, ux = dx * b.c - dz * b.s, uz = dx * b.s + dz * b.c; if (Math.abs(ux) < b.hx && Math.abs(uz) < b.hz) return true; } return false; }
  const interact = [];

  const ground = plane(720, 720, mat('#ffffff', { map: tex('grass', 144, 144), rough: 1 }, true));
  ground.material.bumpMap = ground.material.map; ground.material.bumpScale = 0.035;
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
  const E = { rng, mat, plane, tex, textTex, bench, dot, batch, gloss, basic, lin, ring };
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
      addCircle(lx, lz, r, y0 = -1e9, y1 = 1e9) { const w = p.toWorld(lx, lz); circles.push({ x: w.x, z: w.z, r, y0, y1 }); },
      addBox(lx, lz, hx, hz, y0 = -1e9, y1 = 1e9) { const w = p.toWorld(lx, lz); boxes.push({ x: w.x, z: w.z, hx, hz, c, s, y0, y1 }); },
      interact(o) { const w = p.toWorld(o.lx, o.lz), ia = { ...o, x: w.x, z: w.z, sx: w.x, sz: w.z }; interact.push(ia); return ia; },
      water(lx, lz, hx, hz) { const w = p.toWorld(lx, lz); waters.push({ x: w.x, z: w.z, hx, hz, c, s }); },
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

  function groundAt(x, z, y) {   // y lets a place have two walkable levels (a platform above a room): pass the walker's current height
    let h = 0;
    for (const p of places) if (p.ground) { const l = p.local(x, z); h = Math.max(h, p.ground(l.x, l.z, y)); }
    return h;
  }

  /* ---- grades (lighting the world blends into near each place) ---- */
  function prepGrade(g, rot) {
    const d = new THREE.Vector3(...g.sunDir);
    if (rot !== undefined) d.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    return { top: lin(g.top), bottom: lin(g.bottom), fog: lin(g.fog), near: g.near, far: g.far, sun: lin(g.sun), sunInt: g.sunInt, hemi: g.hemi, sunDir: d.normalize(), tint: new THREE.Vector3(...g.tint), expo: g.expo, sat: g.sat, stars: g.stars };
  }
  const BASE = prepGrade({ top: '#565c5f', bottom: '#9a988d', fog: '#8f8d82', near: 12, far: 92, sun: '#d8d0bc', sunInt: 1.15, hemi: 0.78, sunDir: [0.4, 0.75, 0.3], tint: [1.03, 1, 0.93], expo: 0.95, sat: 0.55, stars: 0 });
  // Behind the wheel the day turns to a sodium-lit night (each place still pulls the light its own way).
  const DRIVE = prepGrade({ top: '#04050c', bottom: '#19243c', fog: '#0f1828', near: 26, far: 210, sun: '#9db6ff', sunInt: 0.34, hemi: 0.37, sunDir: [-0.35, 0.7, 0.3], tint: [0.94, 1.0, 1.08], expo: 1.3, sat: 1.05, stars: 0.3 });
  const blank = () => prepGrade({ top: '#000', bottom: '#000', fog: '#000', near: 0, far: 0, sun: '#000', sunInt: 0, hemi: 0, sunDir: [0, 1, 0], tint: [1, 1, 1], expo: 1, sat: 1, stars: 0 });
  const G = blank(), GB = blank();
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
    farM.color.copy(G.fog).lerp(G.top, 0.3).multiplyScalar(0.85); farM2.color.copy(G.fog).lerp(G.top, 0.55).multiplyScalar(0.7);
  }

  /* ================= ring road ================= */
  const ringView = SW.Ring.build(ring, E, {
    blocked: (x, z) => places.some((p) => { if (!p.noPier) return false; const l = p.local(x, z); return p.noPier(l.x, l.z); }),
    keepOut: (x, z) => places.some((p) => { const l = p.local(x, z); return p.blocks(l.x, l.z); }),
  });
  scene.add(ringView.group);
  ringView.piers.forEach((q) => circles.push({ x: q.x, z: q.z, r: q.r, y1: q.y1 }));

  /* ================= plaza, paths, trees ================= */
  const PLAZA_R = 11;
  {
    const pl = new THREE.Mesh(new THREE.CircleGeometry(PLAZA_R, 56), mat('#b4b1a8', { map: tex('slate', 9, 9), rough: 0.9 }, true));
    pl.material.bumpMap = pl.material.map; pl.material.bumpScale = 0.05;
    pl.rotation.x = -Math.PI / 2; pl.position.y = 0.03; pl.receiveShadow = true;
    scene.add(pl); pick.push(pl); pl.userData.ground = true;
    const rim = new THREE.Mesh(new THREE.RingGeometry(PLAZA_R, PLAZA_R + 0.6, 56), whiteM);
    rim.rotation.x = -Math.PI / 2; rim.position.y = 0.035; rim.receiveShadow = true; scene.add(rim);
    const iron = mat('#1c1a18', { rough: 0.6, metal: 0.6 });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(3.9, 4.05, 0.7, 14, 1, true), whiteM); wall.position.y = 0.35;
    const lip = new THREE.Mesh(new THREE.RingGeometry(3.5, 3.95, 14), whiteM); lip.rotation.x = -Math.PI / 2; lip.position.y = 0.7;
    const water = new THREE.Mesh(new THREE.CircleGeometry(3.5, 28), gloss('#141a17', { rough: 0.12, metal: 0.6, env: 0.25 })); water.rotation.x = -Math.PI / 2; water.position.y = 0.5;
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 2.6, 8), whiteM); ped.position.y = 1.5;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.45, 0.45, 10), iron); bowl.position.y = 3.0;
    [wall, lip, ped, bowl].forEach((m) => { m.castShadow = m.receiveShadow = true; });
    scene.add(wall, lip, water, ped, bowl);
    circles.push({ x: 0, z: 0, r: 4.0 });
  }

  const worldUpd = [];
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
  places.forEach((p) => {
    const len = Math.hypot(p.x, p.z), ux = p.x / len, uz = p.z / len;
    const a = { x: ux * (PLAZA_R - 0.5), z: uz * (PLAZA_R - 0.5) };
    const [vlx, vlz] = p.vp || [0, 0];   // a place may put its viewpoint (and so its sound) somewhere other than its own origin
    const e = p.toWorld(vlx, p.pathEnd), eIn = p.toWorld(vlx, p.pathEnd + 14);
    const b = { x: a.x + ux * 12, z: a.z + uz * 12 };
    const pts = [];
    const N = 70;
    for (let i = 0; i <= N; i++) { const t = i / N; pts.push({ x: cubic(a.x, b.x, eIn.x, e.x, t), z: cubic(a.z, b.z, eIn.z, e.z, t) }); }
    // continue straight to the viewpoint
    const vp = p.toWorld(vlx, vlz), last = pts[pts.length - 1];
    const extra = Math.ceil(Math.hypot(vp.x - last.x, vp.z - last.z) / 1.5);
    for (let i = 1; i <= extra; i++) pts.push({ x: last.x + ((vp.x - last.x) * i) / extra, z: last.z + ((vp.z - last.z) * i) / extra });
    p.path = pts;
    const pos = [], uv = [], idx = [], CN = 4;
    let acc = 0;
    const draw = pts.slice(0, N + 1);
    draw.forEach((q, i) => {
      const n = draw[Math.min(i + 1, draw.length - 1)], pv = draw[Math.max(i - 1, 0)];
      let tx = n.x - pv.x, tz = n.z - pv.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const w = 2.2;
      if (i > 0) acc += Math.hypot(q.x - pv.x, q.z - pv.z);
      for (let c = 0; c <= CN; c++) {
        const sd = -1 + (2 * c) / CN, x = q.x - tz * w * sd, z = q.z + tx * w * sd;
        pos.push(x, surfY(x, z) + 0.06, z);
        uv.push(c / CN, acc / 4.4);
      }
      if (i < draw.length - 1) for (let c = 0; c < CN; c++) { const k = i * (CN + 1) + c, k2 = k + CN + 1; idx.push(k, k + 1, k2, k + 1, k2 + 1, k2); }   // counter-clockwise seen from above: the top face is the front
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const ribbon = new THREE.Mesh(geo, pathMat);
    ribbon.receiveShadow = true; ribbon.userData.ground = true;
    scene.add(ribbon); pick.push(ribbon);
  });
  function distToPath(x, z, path) { let best = 1e9, bi = 0; for (let i = 0; i < path.length; i++) { const d = Math.hypot(path[i].x - x, path[i].z - z); if (d < best) { best = d; bi = i; } } return { d: best, i: bi }; }

  // Trees: everywhere that isn't a path, the plaza or a place.
  {
    const r = rng(99), spots = [];
    const ok = (x, z) => {
      if (Math.hypot(x, z) < PLAZA_R + 5 || ring.dist(x, z) < 13) return false;   // nothing grows up through the ring road
      for (const p of places) {
        if (Math.hypot(x - p.x, z - p.z) < p.clearR) return false;
        const l = p.local(x, z); if (p.blocks(l.x, l.z)) return false;
        if (distToPath(x, z, p.path).d < 4.5) return false;
      }
      return true;
    };
    for (let i = 0; i < 4000 && spots.length < 720; i++) { const x = (r() - 0.5) * 290, z = (r() - 0.5) * 290; if (ok(x, z)) spots.push([x, z, 0.8 + r() * 0.7]); }
    for (let i = 0; i < 240; i++) { const t = (i / 240) * 4, sd = Math.floor(t), f = (t % 1) * 304 - 152; const x = sd === 0 ? f : sd === 1 ? 152 : sd === 2 ? -f : -152, z = sd === 0 ? -152 : sd === 1 ? f : sd === 2 ? 152 : -f; if (places.some((p) => { const l = p.local(x, z); return p.blocks(l.x, l.z); })) continue; spots.push([x + (r() - 0.5) * 4, z + (r() - 0.5) * 4, 1 + r() * 0.8]); }
    const n = spots.length;
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.3, 2.6, 6).translate(0, 1.3, 0), mat('#2e261f'), n);
    const tops = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), n * 3);
    tops.material.userData.lin = true; tops.material.onBeforeCompile = rimPatch;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), ps = new THREE.Vector3(), sc = new THREE.Vector3();
    const greens = ['#2b3529', '#323b2c', '#262f26', '#3a3f2c', '#4a4034', '#51463a'].map(lin);
    const TIER = [[2.0, 3.3, 1.5], [1.55, 3.0, 3.2], [1.05, 2.7, 4.9]];
    spots.forEach(([x, z, s], i) => {
      const hs = s * (0.9 + r() * 0.55);
      ps.set(x, 0, z); sc.set(s, hs, s); q.identity();
      trunks.setMatrixAt(i, m4.compose(ps, q, sc));
      const ci = Math.floor(r() * greens.length), col = greens[ci], thin = ci >= 4 ? 0.5 : 1;
      TIER.forEach(([rad, h, y], k) => {
        e.set((r() - 0.5) * 0.1, r() * 6.28, (r() - 0.5) * 0.1); q.setFromEuler(e);
        ps.set(x, y * hs, z); sc.set(rad * s * thin, h * hs, rad * s * thin);
        tops.setMatrixAt(i * 3 + k, m4.compose(ps, q, sc));
        tops.setColorAt(i * 3 + k, col);
      });
      circles.push({ x, z, r: 0.45 * s });
    });
    trunks.castShadow = tops.castShadow = true;
    trunks.receiveShadow = tops.receiveShadow = true;
    scene.add(trunks, tops);
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
    const ia = { kind: 'view', place: p, x: vp.x, z: vp.z, r: 2.6, mark: gy + 2.6 };
    beam.userData.ia = ring.userData.ia = ia;
    pick.push(ring, beam);
    interact.push(ia);
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
    const skin = mat('#e1b18c', { rough: 0.65 }), hoodie = mat('#5b4533', { rough: 0.6 }), pants = mat('#2b2d33'), shoeM = mat('#2a2320', { rough: 0.7 }), hair = mat('#22160f', { rough: 0.55 }), phone = mat('#1b1b20', { rough: 0.4, metal: 0.3 }), cup = mat('#8c1c1c', { rough: 0.4 });
    const cyl = (rt, rb, h, m, seg = 12) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
    const hips = new THREE.Group(); hips.position.y = 0.95; body.add(hips);
    const legs = [-1, 1].map((sd) => {
      const pivot = new THREE.Group(); pivot.position.x = sd * 0.095; hips.add(pivot);
      const thigh = cyl(0.088, 0.07, 0.47, pants); thigh.position.y = -0.235; pivot.add(thigh);
      const knee = new THREE.Group(); knee.position.y = -0.47; pivot.add(knee);
      const shin = cyl(0.068, 0.054, 0.44, pants); shin.position.y = -0.22; knee.add(shin);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.26), shoeM); shoe.position.set(0, -0.46, 0.04); knee.add(shoe);
      return { pivot, knee };
    });
    const pelvis = cyl(0.165, 0.16, 0.16, pants); pelvis.scale.z = 0.7; hips.add(pelvis);
    const torso = cyl(0.2, 0.17, 0.58, hoodie); torso.position.y = 0.33; torso.scale.z = 0.66; hips.add(torso);
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), hoodie); sh.scale.set(1, 0.35, 0.66); sh.position.y = 0.61; hips.add(sh);
    const hood = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.05, 6, 14), hoodie); hood.rotation.x = Math.PI / 2; hood.position.set(0, 0.66, -0.04); hips.add(hood);
    const arms = [-1, 1].map((sd) => {
      const pivot = new THREE.Group(); pivot.position.set(sd * 0.245, 0.56, 0); hips.add(pivot);
      const upper = cyl(0.06, 0.054, 0.3, hoodie); upper.position.y = -0.15; pivot.add(upper);
      const elbow = new THREE.Group(); elbow.position.y = -0.3; pivot.add(elbow);
      const lower = cyl(0.054, 0.046, 0.27, hoodie); lower.position.y = -0.135; elbow.add(lower);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), skin); hand.position.y = -0.3; elbow.add(hand);
      pivot.rotation.z = sd * 0.08;
      return { pivot, elbow };
    });
    const neck = cyl(0.05, 0.055, 0.1, skin); neck.position.y = 0.68; hips.add(neck);
    const head = new THREE.Group(); head.position.y = 0.82; hips.add(head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.112, 18, 14), skin); skull.scale.set(0.95, 1.12, 1.02); head.add(skull);
    const hr = new THREE.Mesh(new THREE.SphereGeometry(0.12, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair); hr.scale.set(0.98, 1.08, 1.06); hr.position.set(0, 0.012, -0.006); hr.rotation.x = -0.25; head.add(hr);
    for (const sd of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 4), mat('#111111')); e.position.set(sd * 0.04, 0.01, 0.1); head.add(e); }
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.128, 0.014, 6, 18, Math.PI), phone); band.position.y = 0.02; head.add(band);
    for (const sd of [-1, 1]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 14), cup); c.rotation.z = Math.PI / 2; c.position.set(sd * 0.125, -0.005, 0); head.add(c); }
    A.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    { const tm = new THREE.MeshBasicMaterial({ color: lin('#2a2420') }); tm.userData.lin = true;
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.012, 5, 24), tm); band.rotation.x = Math.PI / 2; band.scale.y = 0.68; band.position.y = 0.2; hips.add(band);
      legs.forEach((l) => { const sole = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.02, 0.265), tm); sole.position.set(0, -0.505, 0.04); l.knee.add(sole); }); }
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
    let cur = null, last = null, forced = null;
    let phase = 0;
    return {
      G: A,
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
  const P = { x: 0, z: -7.5, y: 0, face: 0, speed: 0, v: 0, hx: 0, hz: 1, lean: 0, vy: 0, air: false };
  let boost = 0, dashOn = false, baseFov = 55, wind = null;
  function jump() { if (mode === 'walk' && !P.air && !drv) { P.air = true; P.vy = 8.5 + 2.5 * boost; } }
  let camYaw = Math.PI, camPitch = 0.2, mode = 'load', auto = null, focus = null, lastFocus, regionKey = '', viewPlace = null, t = 0;
  const camDist = 4.7;
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ found: places.filter((p) => p.found).map((p) => p.song.id), x: drv ? drv.from.place.vx : P.x, z: drv ? drv.from.place.vz : P.z, yaw: camYaw })); } catch (e) { /* storage blocked */ } }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!s) return;
      places.forEach((p) => { p.found = (s.found || []).includes(p.song.id); });
      if (Number.isFinite(s.x) && Number.isFinite(s.z) && Math.abs(s.x) < 143 && Math.abs(s.z) < 143) { P.x = s.x; P.z = s.z; }
      if (Number.isFinite(s.yaw)) camYaw = s.yaw;
    } catch (e) { /* ignore */ }
  }

  /* ================= collisions ================= */
  const PR = 0.35;
  function collide(p) {
    p.x = clamp(p.x, -145, 145); p.z = clamp(p.z, -145, 145);
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
  const makeCar = (i) => { const c = SW.Cars ? SW.Cars.make(E, i) : plainCar(i); c.rotation.order = 'YXZ'; if (c.userData.tail) c.userData.tail0 = c.userData.tail.color.clone(); return c; };
  const carsG = new THREE.Group(), trafficG = new THREE.Group(); scene.add(carsG, trafficG);
  const garage = Array.from({ length: NCAR }, (_, i) => { const c = makeCar(i); c.visible = false; carsG.add(c); return c; });
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  let drv = null, drvK = 0, driveHinted = false, padBrake = false, padGas = false, padFast = false;
  const freeCar = () => { const used = new Set(ring.pas.map((q) => q.car)); if (drv) used.add(drv.car); const free = garage.filter((c) => !used.has(c)); return free[Math.floor(Math.random() * free.length)] || garage[0]; };
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
    parkAt(pa, freeCar(), pa.slot);
  });
  function startDrive(pa) {
    if (drv || !pa.car) return;
    const car = pa.car;
    drv = { car, from: pa, pa, x: car.position.x, z: car.position.z, y: pa.y, yaw: car.rotation.y, v: 0, st: 0, hint: -1, side: -1, hit: 0, wall: 0 };
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
    ring.pas.forEach((q) => { if (q !== home) parkAt(q, freeCar(), q.slot); });
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
  const rp = { i: -1 }, rq = { s: 0, d: 0 }, ra = {};
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
    ring.proj(d.x, d.z, d.hint, rp);
    const tau0 = Math.atan2(rp.tx, rp.tz);
    d.yaw -= d.st * (d.v / (5.5 + (d.v * d.v) / 34)) * dt;   // yaw grows to the left, so steering right lowers it
    d.x += Math.sin(d.yaw) * d.v * dt; d.z += Math.cos(d.yaw) * d.v * dt;
    ring.proj(d.x, d.z, rp.i, rq); d.hint = rq.i;
    const tau = Math.atan2(rq.tx, rq.tz), med = rq.hw > 7.45, m = 1.4;
    if (!med) d.side = rq.d >= 0 ? 1 : -1;
    const lo = med && d.side > 0 ? 1.3 : -(rq.hw - m), hi = med && d.side < 0 ? -1.3 : rq.hw - m;
    const inBand = rq.d >= lo && rq.d <= hi;
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
      for (const c of traffic) {
        const dx = c.car.position.x - d.x, dz = c.car.position.z - d.z, ahead = dx * hx + dz * hz;
        if (ahead < 2 || ahead > 9 + d.v * 0.7 || Math.abs(dx * hz - dz * hx) > 1.5 || Math.cos(wrapA(d.yaw - c.car.rotation.y)) < 0.5) continue;
        const cap = c.v + Math.max(0, ahead - 8) * 0.9; if (d.v > cap) d.v -= Math.min(d.v - cap, 32 * dt);
      } }
    for (const c of traffic) {   // other cars are solid too: box against box, in the other car's frame
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
    const slope = (ring.Y[(rq.i + 1) % ring.N] - ring.Y[(rq.i + ring.N - 1) % ring.N]) / (2 * ring.ds);
    d.car.position.set(d.x, d.y, d.z);
    d.car.rotation.set(pa ? 0 : -Math.atan(slope * Math.cos(wrapA(d.yaw - tau))), d.yaw, clamp(d.st * d.v * 0.0022, -0.07, 0.07));
    if (u.tail0) u.tail.color.copy(u.tail0).multiplyScalar(brake || iv.f < -0.05 ? 2.4 : 1);
    P.x = d.x; P.z = d.z; P.y = d.y; P.face = d.yaw; P.v = 0; P.speed = 0; P.lean = 0; boost = 0;
    // You can get out once the car is stopped in a parking area with its whole body clear of the traffic lane.
    const here = idle ? null : ring.pas.find((q) => q.inside(d.x, d.z, body));
    const relY = wrapA(d.yaw - tau), reach = (Math.abs(Math.sin(relY)) * u.len + Math.abs(Math.cos(relY)) * u.wid) / 2;
    focus = here && Math.abs(d.v) < 5 && Math.abs(rq.d) - reach > laneD(rq.hw) + 1.15 ? Object.assign(here.out, { x: d.x, z: d.z, mark: d.y + u.hgt + 0.8 }) : null;
  }
  // Light traffic in the slow lane each way; it keeps its distance from the car in front, and from you.
  const traffic = [];
  { const r = rng(606); for (let k = 0; k < 12; k++) { const car = makeCar(Math.floor(r() * NCAR)), v0 = 19 + r() * 6; trafficG.add(car); traffic.push({ car, dir: k % 2 ? 1 : -1, s: ((k + r() * 0.6) / 12) * ring.L, v: v0, v0 }); } }
  const laneD = (hw) => 1.83 + 3.87 * clamp((hw - 4.5) / 3.5, 0, 1);
  function updTraffic(dt) {
    const L = ring.L, pv = drv ? drv.v : 0;
    for (const c of traffic) {
      let vt = c.v0;
      for (const o of traffic) { if (o === c || o.dir !== c.dir) continue; const gap = ((((o.s - c.s) * c.dir) % L) + L) % L; if (gap < 18) vt = Math.min(vt, gap < 9 ? 0 : o.v); }
      if (drv && !drv.pa && Math.abs(rq.d - c.dir * laneD(rq.hw)) < 2.3) {
        const gap = ((((rq.s - c.s) * c.dir) % L) + L) % L;
        if (gap < 20) vt = Math.min(vt, gap < 9 ? 0 : Math.max(0, pv * Math.cos(wrapA(drv.yaw - c.car.rotation.y))));
      }
      c.v += (vt - c.v) * Math.min(1, dt * (vt < c.v ? 3 : 0.8));
      c.s = (c.s + c.dir * c.v * dt + L) % L;
      ring.at(c.s, 0, ra);
      const dl = c.dir * laneD(ra.hw), slope = (ring.Y[(ra.i + 1) % ring.N] - ring.Y[ra.i]) / ring.ds;
      c.car.position.set(ra.x + ra.tz * dl, ra.y, ra.z - ra.tx * dl);
      c.car.rotation.set(-Math.atan(slope) * c.dir, Math.atan2(ra.tx, ra.tz) + (c.dir < 0 ? Math.PI : 0), 0);
      c.car.visible = Math.abs(ra.x - P.x) < 210 && Math.abs(ra.z - P.z) < 210;
    }
  }

  /* ================= UI helpers ================= */
  let bannerT, toastT;
  function banner(en, jp) { $('#bannerEn').textContent = en; $('#bannerJp').textContent = jp; const b = $('#banner'); b.classList.add('show'); clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.remove('show'), 1900); }
  function toast(msg, ms = 2600) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (el.hidden = true), ms); }
  function meterHTML(n) { return '<i></i>'.repeat(n); }
  $('#npMeter').innerHTML = meterHTML(8);
  $('#vVol').innerHTML = meterHTML(10);
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
  };
  let phView = 'home', phSong = null;
  const phScreen = $('#phScreen');
  function phRender() {
    const d = new Date();
    $('#phClock').textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    $('#phCount').textContent = `♪ ${places.filter((p) => p.found).length}/${places.length}`;
    let h = '';
    if (phView === 'home') {
      const apps = [['map', 'MAP'], ['music', 'MUSIC']];
      if (CFG.live) apps.push(['live', 'LIVE']);
      if (CFG.shop && CFG.shop.url) apps.push(['shop', 'SHOP']);
      h = '<div class="ph-grid">' + apps.map(([k, n]) => `<button class="ph-app" type="button" data-go="${k}">${PHI[k]}<span>${n}</span></button>`).join('') + '</div>';
    } else if (phView === 'music') {
      h = '<h3 class="ph-h">MUSIC</h3>' + places.map((p, i) => p.found
        ? `<button class="ph-row" type="button" data-song="${i}"><span class="dot" style="background:${esc(p.color)}"></span><span class="nm">${esc(p.song.title)}<small>${esc(p.song.artist || CFG.artist)}</small></span></button>`
        : '<button class="ph-row" type="button" disabled><span class="dot" style="background:#55524a"></span><span class="nm">？</span></button>').join('');
    } else if (phView === 'song' && phSong) {
      const s = phSong.song, links = (s.links || []).map((l) => `<a class="btn${l.kind === 'buy' ? ' primary' : ''}" href="${esc(l.url)}" target="_blank" rel="noopener" aria-label="${esc(l.label)}">${l.kind === 'buy' ? IC.cart + '<span>BUY ↗</span>' : IC.play + '<span>LISTEN ↗</span>'}</a>`).join('');
      h = `<h3 class="ph-h">MUSIC</h3><p class="ph-big">${esc(s.title)}</p><p class="ph-sub">${esc([(s.artist || CFG.artist), s.year].filter(Boolean).join(' · '))}</p><div class="ph-acts">${links}<button class="btn" type="button" data-warp="1">${PHI.map}<span>GO</span></button></div>`;
    } else if (phView === 'live') {
      h = `<h3 class="ph-h">NEXT LIVE</h3><p class="ph-big">${esc(CFG.live.date || '')}</p><p class="ph-sub">${esc(CFG.live.place || '')}</p>`;
    } else if (phView === 'shop') {
      let host = CFG.shop.url; try { host = new URL(CFG.shop.url).host; } catch (e) { /* keep */ }
      h = `<h3 class="ph-h">SHOP</h3><p class="ph-big">${esc(CFG.shop.name || host)}</p><p class="ph-sub">${esc(host)}</p><div class="ph-acts"><a class="btn primary" href="${esc(CFG.shop.url)}" target="_blank" rel="noopener">GO ↗</a></div>`;
    }
    phScreen.innerHTML = h;
    const first = phScreen.querySelector('button:not([disabled]), a');
    (first || $('#phClose')).focus({ preventScroll: true });
  }
  function openPhone() {
    if (mode !== 'walk') return;
    mode = 'phone'; keys.clear(); auto = null; phView = 'home';
    document.body.classList.add('busy'); avatar.setPhone(true);
    $('#phone').hidden = false; phRender();
  }
  function closePhone() {
    if (mode !== 'phone') return;
    mode = 'walk'; $('#phone').hidden = true; document.body.classList.remove('busy'); avatar.setPhone(false);
    cv.focus({ preventScroll: true });
  }
  function phoneBack() { if (phView === 'home') closePhone(); else { phView = phView === 'song' ? 'music' : 'home'; phRender(); } }
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
    const b = e.target.closest('[data-go], [data-song], [data-warp]');
    if (!b) return;
    if (b.dataset.go === 'map') { closePhone(); openMap(); }
    else if (b.dataset.go) { phView = b.dataset.go; phRender(); }
    else if (b.dataset.song !== undefined) { phSong = places[+b.dataset.song]; phView = 'song'; phRender(); }
    else if (b.dataset.warp && phSong) { closePhone(); warpTo(phSong); }
  });
  $('#phBack').addEventListener('click', phoneBack);
  $('#phHome').addEventListener('click', () => { phView = 'home'; phRender(); });
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
  addEventListener('keydown', (e) => {
    if (e.key === 'Shift') running = true;
    if (mode === 'title') { if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); start(); } return; }
    if (mode === 'modal') { if (e.key === 'Escape' || e.code === 'KeyM' || e.code === 'KeyX') { e.preventDefault(); if (!e.repeat) closeMap(); } return; }
    if (mode === 'phone') { phoneKey(e); return; }
    if (mode === 'confirm') { if (e.key === 'Escape' || e.code === 'KeyX') { e.preventDefault(); closeConfirm(); } else if (e.key === 'Enter' || e.code === 'KeyZ') { e.preventDefault(); $('#cfYes').click(); } return; }
    if (mode === 'dialog') { if (e.key === 'Enter' || e.key === 'Escape' || e.code === 'KeyZ' || e.code === 'Space') { e.preventDefault(); advance(); } return; }
    if (mode === 'view') { if (e.key === 'Escape' || e.code === 'KeyX' || e.key === 'Backspace') { e.preventDefault(); exitView(); } return; }
    if (mode !== 'walk') return;
    const k = KEYMAP[e.code];
    if (k) { e.preventDefault(); keys.add(k); auto = null; return; }
    if (e.code === 'KeyQ') camYaw += 0.2;
    else if (e.code === 'KeyE') camYaw -= 0.2;
    else if (e.code === 'Space') { e.preventDefault(); if (drv) keys.add('brake'); else if (!e.repeat) jump(); }
    else if (!e.repeat && (e.code === 'KeyZ' || e.key === 'Enter')) { e.preventDefault(); if (focus) act(focus); }
    else if (e.key === 'Escape' || e.code === 'KeyX' || e.code === 'KeyM') { e.preventDefault(); if (!e.repeat) openMap(); }
    else if (e.code === 'KeyP' || e.code === 'Tab') { e.preventDefault(); if (!e.repeat) openPhone(); }
  });
  addEventListener('keyup', (e) => { if (e.key === 'Shift') running = false; if (e.code === 'Space') keys.delete('brake'); const k = KEYMAP[e.code]; if (k) keys.delete(k); });
  addEventListener('blur', () => { keys.clear(); running = false; });

  let drag = null;
  cv.addEventListener('pointerdown', (e) => {
    if (mode === 'dialog') { advance(); return; }
    if (mode !== 'walk') return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
    try { cv.setPointerCapture(e.pointerId); } catch (_) { /* */ }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true;
    if (drag.moved) { camYaw -= dx * 0.006; camPitch = clamp(camPitch + dy * 0.004, 0.04, 0.85); }
  });
  cv.addEventListener('pointerup', (e) => { if (!drag || drag.id !== e.pointerId) return; const was = drag; drag = null; if (!was.moved && mode === 'walk') tap(e.clientX, e.clientY); });
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
        if (Math.hypot(ia.x - P.x, ia.z - P.z) < ia.r) { faceTo(ia); act(ia); return; }
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
    if (down(0)) { if (mode === 'walk') pressA(); else if (mode === 'dialog') advance(); else if (mode === 'title') start(); else if (mode === 'confirm') $('#cfYes').click(); else if (mode === 'phone') { const a = document.activeElement; if (a && $('#phone').contains(a)) a.click(); } }
    if (mode === 'phone') { if (down(12) || down(14)) phoneFocus(-1); else if (down(13) || down(15)) phoneFocus(1); }
    if (down(1)) { if (mode === 'view') exitView(); else if (mode === 'modal') closeMap(); else if (mode === 'confirm') closeConfirm(); }
    if (down(9) && mode === 'walk') openMap();
    if (down(1) && mode === 'phone') phoneBack();
    else if (down(3) || down(8)) { if (mode === 'walk') openPhone(); else if (mode === 'phone') closePhone(); }
    padPrev = pressed;
    padRun = !!(pressed[7] || pressed[5] || pressed[2]); padBrake = !!(pressed[6] || pressed[4]); padGas = !!pressed[7]; padFast = !!(pressed[5] || pressed[2]);
    if (mode === 'walk') { camYaw -= dz(gp.axes[2] || 0) * 0.04; camPitch = clamp(camPitch + dz(gp.axes[3] || 0) * 0.02, 0.04, 0.85); }
    return { x: dz(gp.axes[0]), y: dz(gp.axes[1]) };
  }

  function pressA() { if (mode === 'dialog') { advance(); return; } if (mode === 'walk') { if (focus) act(focus); else if (!drv) jump(); } }
  $('#btnB').addEventListener('pointerdown', (e) => { e.preventDefault(); dashOn = !dashOn; $('#btnB').classList.toggle('on', dashOn); });
  function faceTo(ia) { P.face = Math.atan2(ia.x - P.x, ia.z - P.z); }
  function act(ia) {
    auto = null; keys.clear();
    if (ia.kind === 'view') { enterView(ia.place); return; }
    if (ia.kind === 'board') { openMap(); return; }
    if (ia.kind === 'car') { startDrive(ia.pa); return; }
    if (ia.kind === 'exit') { endDrive(ia.pa); return; }
    if (ia.kind === 'info') { say(ia.lines.slice()); return; }
    if (ia.kind === 'travel') { openConfirm(ia); return; }
    if (ia.kind === 'sign') {
      const p = ia.place, s = p.song;
      say([`この道の先：${s.place}（${s.placeEn}）`, p.found ? `♪ ${s.title} が流れている場所。近づくほど音が大きくなる。` : 'どんな曲が流れているかは、行ってみないとわからない。']);
    }
  }

  // Walk along paths to a place (used by the map and by clicking a far beacon).
  function routeTo(p, then) {
    const pts = [];
    let near = null;
    for (const q of places) { const r = distToPath(P.x, P.z, q.path); if (r.d < 7 && (!near || r.d < near.d)) near = { q, ...r }; }
    if (near && near.q === p) {
      for (let i = near.i; i < p.path.length; i++) pts.push(p.path[i]);
    } else {
      if (near) for (let i = near.i; i >= 0; i -= 2) pts.push(near.q.path[i]);
      const a = near ? Math.atan2(near.q.z, near.q.x) : Math.atan2(P.z, P.x), b = Math.atan2(p.z, p.x);
      let da = Math.atan2(Math.sin(b - a), Math.cos(b - a));
      for (let k = 1, n = Math.ceil(Math.abs(da) / 0.5); k < n; k++) { const m = a + (da * k) / n; pts.push({ x: Math.cos(m) * 8.6, z: Math.sin(m) * 8.6 }); }   // round the plaza between the well/board and the lamps
      for (let i = 0; i < p.path.length; i++) pts.push(p.path[i]);
    }
    auto = { pts, i: 0, then: then || interact.find((ia) => ia.kind === 'view' && ia.place === p) };
  }

  /* ================= scenic view ================= */
  const camFrom = { pos: new THREE.Vector3(), look: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) };
  const camLook = new THREE.Vector3();
  let camBlend = 1, camBlendDur = 1;
  function snapCam() { camFrom.pos.copy(camera.position); camFrom.look.copy(camLook); camFrom.up.copy(camera.up); camBlend = 0; }
  function enterView(p) {
    snapCam(); camBlendDur = RM ? 0.01 : 1.6;
    mode = 'view'; viewPlace = p;
    P.x = p.vx; P.z = p.vz; P.face = p.rot + p.face; P.speed = 0; auto = null;
    document.body.classList.add('busy', 'viewing');
    const s = p.song;
    $('#vPlace').textContent = s.place;
    $('#vTitle').textContent = s.title;
    $('#vMeta').textContent = [(s.artist || CFG.artist) + (s.artistNote ? ` / ${s.artistNote}` : ''), s.year].filter(Boolean).join(' · ');
    const acts = $('#vActions');
    acts.innerHTML = '';
    const canCheckout = !!(CFG.checkoutEndpoint && s.price);
    if (canCheckout) {
      const b = document.createElement('button');
      b.className = 'btn primary'; b.type = 'button'; b.innerHTML = `${IC.cart}<span>${yen(s.price)}</span>`;
      b.addEventListener('click', () => checkout(s, b));
      acts.appendChild(b);
    }
    (s.links || []).forEach((l, i) => {
      const a = document.createElement('a');
      a.className = 'btn' + (!canCheckout && l.kind === 'buy' && i === 0 ? ' primary' : '');
      a.href = l.url; a.target = '_blank'; a.rel = 'noopener';
      a.innerHTML = l.kind === 'buy' ? `${IC.cart}<span>BUY ↗</span>` : `${IC.play}<span>LISTEN ↗</span>`; a.title = l.label; a.setAttribute('aria-label', l.label);
      acts.appendChild(a);
    });
    if (!acts.children.length) { const n = document.createElement('button'); n.className = 'btn'; n.type = 'button'; n.disabled = true; n.innerHTML = `${IC.cart}<span>SOON</span>`; n.setAttribute('aria-label', '購入ページは準備中'); acts.appendChild(n); }
    const ch = SW.Audio.channels[p.idx];
    $('#vSketch').hidden = !(ch && ch.mode === 'sketch');
    $('#view').hidden = false;
    $('#prompt').hidden = true; lastFocus = undefined;
    setTimeout(() => { const f = acts.querySelector('.btn'); if (f && !TOUCH) f.focus({ preventScroll: true }); }, 900);
  }
  function exitView() {
    if (mode !== 'view') return;
    snapCam(); camBlendDur = RM ? 0.01 : 0.9;
    mode = 'walk'; viewPlace = null;
    collide(P);   // the viewpoint may have a parked car standing on it: step out from inside it
    document.body.classList.remove('busy', 'viewing');
    $('#view').hidden = true;
    cv.focus({ preventScroll: true });
  }
  $('#backBtn').addEventListener('click', exitView);

  async function checkout(s, btn) {
    btn.disabled = true;
    const label = btn.innerHTML;
    btn.textContent = '…';
    try {
      const res = await fetch(CFG.checkoutEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ name: `${s.title} — ${CFG.artist} (Digital)`, price: s.price, quantity: 1 }] }) });
      const data = await res.json();
      if (data.url) { location.href = data.url; return; }
      if (data.sessionId && CFG.stripePublishableKey) {
        if (!window.Stripe) await new Promise((ok, ng) => { const sc = document.createElement('script'); sc.src = 'https://js.stripe.com/v3/'; sc.onload = ok; sc.onerror = ng; document.head.appendChild(sc); });
        await window.Stripe(CFG.stripePublishableKey).redirectToCheckout({ sessionId: data.sessionId });
        return;
      }
      throw new Error('no checkout url');
    } catch (e) {
      toast('購入ページを開けませんでした。ストアのリンクからお試しください。', 3600);
    } finally {
      btn.disabled = false; btn.innerHTML = label;
    }
  }

  /* ================= map ================= */
  const mapCv = $('#mapCanvas'), mg = mapCv.getContext('2d');
  const MAP_S = mapCv.width / 300;
  const toMap = (x, z) => [(x + 150) * MAP_S, (z + 150) * MAP_S];
  function drawMap(at) {
    const g = mg, W = mapCv.width;
    g.fillStyle = '#141412'; g.fillRect(0, 0, W, W);
    g.lineCap = 'round';
    places.forEach((p) => {
      (p.map || []).forEach((sh) => {
        g.save();
        const [cx, cz] = toMap(...Object.values(p.toWorld(sh.x, sh.z)));
        g.translate(cx, cz); g.rotate(-p.rot);
        g.fillStyle = sh.c;
        if (sh.t === 'rect') g.fillRect((-sh.w / 2) * MAP_S, (-sh.h / 2) * MAP_S, sh.w * MAP_S, sh.h * MAP_S);
        else { g.beginPath(); g.arc(0, 0, sh.r * MAP_S, 0, 7); g.fill(); }
        g.restore();
      });
    });
    g.strokeStyle = 'rgba(200,192,170,.8)'; g.lineWidth = 3 * MAP_S;
    places.forEach((p) => { g.beginPath(); p.path.forEach((q, i) => { const [x, y] = toMap(q.x, q.z); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke(); });
    g.fillStyle = '#8a8376'; g.beginPath(); g.arc(...toMap(0, 0), PLAZA_R * MAP_S, 0, 7); g.fill();
    g.lineJoin = 'round'; g.strokeStyle = '#4a4e58'; g.lineWidth = 15 * MAP_S; g.beginPath();   // the ring road, with the parking areas where a car waits
    for (let i = 0; i < ring.N; i += 2) { const [x, y] = toMap(ring.X[i], ring.Z[i]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.closePath(); g.stroke(); g.strokeStyle = 'rgba(232,226,208,.7)'; g.lineWidth = 1.5; g.setLineDash([9, 9]); g.stroke(); g.setLineDash([]);
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
    const [px, py] = toMap((at || P).x, (at || P).z);
    g.save(); g.translate(px, py); g.rotate(at ? 0 : -P.face + Math.PI); if (at) g.scale(1.6, 1.6);
    g.fillStyle = '#e8e2d0'; g.beginPath(); g.moveTo(0, -11); g.lineTo(8, 8); g.lineTo(0, 4); g.lineTo(-8, 8); g.closePath(); g.fill();
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
      P.x = q.x; P.z = q.z; P.y = groundAt(q.x, q.z); P.v = 0; auto = null;
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
  $('#soundBtn').addEventListener('click', () => {
    const m = !SW.Audio.muted;
    SW.Audio.setMuted(m);
    $('#soundBtn').setAttribute('aria-pressed', String(m));
  });

  /* ================= audio + discovery ================= */
  const R_AUD = 34, R_VIEW = 3.2;
  const SILENT = { bass: 0, mid: 0, high: 0, level: 0, beat: false, pulse: 0, beats: 0, spectrum: null };
  let npT = 0, loudP = null;
  function updateAudio(dt) {
    const A = SW.Audio, on = A.started;
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw), fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    let loud = null;
    places.forEach((p) => {
      const dx = p.vx - P.x, dz = p.vz - P.z, d = Math.hypot(dx, dz);
      const viewing = viewPlace === p;
      // Behind the wheel the car radio picks up whichever song you are driving past: by direction, not distance.
      const radio = drv && !viewing ? smooth(0.5, 0.12, Math.abs(wrapA(Math.atan2(P.z, P.x) - Math.atan2(p.z, p.x)))) : 0;
      const pp = Math.max(viewing ? 1 : clamp((R_AUD - d) / (R_AUD - R_VIEW), 0, 1), radio * 0.85);
      p.dwell = (d < 4.5 || viewing) ? Math.min(1, p.dwell + dt / 12) : Math.max(0, p.dwell - dt / 4);
      const prox = 0.4 * pp * pp;
      p.gain = Math.max(prox + (1 - prox) * ease(p.dwell) * pp, radio * 0.5);
      p.pp = pp;
      if (!p.found && d < 20 && on) {
        p.found = true; refreshLabels(p); updateFound(); save();
        SW.Audio.chime();
        banner('♪ NEW', p.song.title); lastFocus = undefined; guide.refresh();
      }
      if (!on) { p.f = SILENT; return; }
      const ch = A.channels[p.idx];
      if (d < R_AUD * 1.1 || viewing || radio > 0) ch.start();
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
      if (loud && mode === 'walk') {
        np.hidden = false;
        $('#npTitle').textContent = loud.found ? loud.song.title : '？';
        $('#npArrow').style.transform = `rotate(${loud.dir}rad)`;
        $('#npArrow').style.color = loud.color;
        setMeter($('#npMeter'), Math.sqrt(loud.gain));
      } else np.hidden = true;
      if (viewPlace) setMeter($('#vVol'), viewPlace.gain);
    }
  }

  /* ================= update ================= */
  const tmpV = new THREE.Vector3(), tmpL = new THREE.Vector3(), tmpU = new THREE.Vector3(), fwd = new THREE.Vector3();
  let lastKmh = -1;
  function update(dt) {
    padV = pad();
    if (drv) driveUpdate(dt, mode !== 'walk');
    else if (mode === 'walk') {
      const iv = inputVec();
      let mx = 0, mz = 0, sp = 0;
      // Hold run (or auto-travel a long way) to hop on the board: speed builds up, turns get wider.
      const want = running || dashOn || padRun || (auto && auto.pts.length - auto.i > 5);
      boost += ((want && (iv.m > 0.05 || auto) ? 1 : 0) - boost) * Math.min(1, dt * 2.2);
      const top = 7.5 + 9.5 * boost;
      if (iv.m > 0.05) {
        const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
        mx = fx * iv.f + rx * iv.s; mz = fz * iv.f + rz * iv.s;
        const m = Math.hypot(mx, mz) || 1; mx /= m; mz /= m; sp = top * iv.m; auto = null;
      } else if (auto) {
        const tg = auto.pts[auto.i], dx = tg.x - P.x, dz = tg.z - P.z, d = Math.hypot(dx, dz);
        const lastPt = auto.i === auto.pts.length - 1;
        if (d < (lastPt ? 0.3 : 1.2 + P.v * 0.25)) {   // faster means a wider turn, so count a waypoint as reached from further out
          if (!lastPt) auto.i++;
          else { const th = auto.then; auto = null; if (th) { faceTo(th); act(th); } }
        } else { mx = dx / d; mz = dz / d; sp = lastPt ? Math.min(top, d * 5 + 1) : top; }
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
          if (auto.stuck > 0.5) { const th = auto.then; auto = null; if (th && Math.hypot(th.x - P.x, th.z - P.z) < th.r + 1) { faceTo(th); act(th); } }
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
        if (d > ia.r || ia.off || (ia.y0 !== undefined && P.y < ia.y0) || (ia.y1 !== undefined && P.y > ia.y1)) continue;
        const dot = (dx * fx + dz * fz) / (d || 1);
        if (dot < 0.15 && d > 1.4) continue;
        const sc = d - dot;
        if (sc < best) { best = sc; focus = ia; }
      }
    } else {
      P.speed += (0 - P.speed) * Math.min(1, dt * 10); P.v = 0; P.lean = 0; boost += (0 - boost) * Math.min(1, dt * 4);
      if (mode === 'view') { let df = viewPlace.rot + viewPlace.face - P.face; df = Math.atan2(Math.sin(df), Math.cos(df)); P.face += df * Math.min(1, dt * 6); }
    }
    const gh = groundAt(P.x, P.z, P.y);
    if (drv) { /* the car sets the height */ }
    else if (P.air) { P.vy -= 24 * dt; P.y += P.vy * dt; if (P.vy <= 0 && P.y <= gh) { P.y = gh; P.air = false; } }
    else P.y += (gh - P.y) * Math.min(1, dt * 14);
    avatar.G.position.set(P.x, P.y, P.z);
    avatar.G.rotation.y = P.face;
    avatar.G.visible = !drv && !(viewPlace && viewPlace.soloView);   // some views are staged where you stand: step out of shot
    const vf = viewPlace ? viewPlace.f : null;
    avatar.animate(dt, P.speed, vf ? vf.pulse : 0, boost, P.lean, mode !== 'view' && gh < 0.1 && isWater(P.x, P.z));

    const show = focus && mode === 'walk';
    marker.visible = !!show;
    if (show) { marker.position.set(focus.x, focus.mark + Math.sin(t * 3) * 0.08, focus.z); marker.rotation.y = t * 2; }
    const fkey = show ? focus : null;
    if (fkey !== lastFocus) {
      lastFocus = fkey;
      $('#prompt').hidden = !fkey; $('#prompt').className = fkey ? 'k-' + fkey.kind : '';
      if (fkey) {
        $('#promptKey').textContent = TOUCH ? 'A' : 'Z';
        $('#promptText').textContent = !fkey.place ? '' : fkey.place.found ? '♪ ' + fkey.place.song.title : '？';
      }
    }
    { const ba = $('#btnA'); ba.classList.toggle('ready', !!fkey); ba.classList.toggle('k-car', !!fkey && fkey.kind === 'car'); ba.classList.toggle('k-exit', !!fkey && fkey.kind === 'exit'); }

    updateAudio(dt);
    updTraffic(dt);

    // Lighting: blend towards the closest place's grade.
    let bp = null, bw = 0;
    places.forEach((p) => {
      const d = Math.hypot(P.x - p.vx, P.z - p.vz);
      const w = viewPlace === p ? 1 : smooth(48, 16, d - (drv ? 20 : 0));   // from the road the places are a little further off, so reach for them sooner
      if (w > bw) { bw = w; bp = p; }
    });
    drvK += ((drv ? 1 : 0) - drvK) * Math.min(1, dt * 0.9);
    mixGrade(GB, BASE, DRIVE, ease(clamp(drvK, 0, 1)));
    mixGrade(G, GB, bp ? bp.grade : GB, bp ? bw : 0);
    applyGrade();
    ringView.upd(clamp(1 - G.sunInt / 1.1, 0, 1), loudP && loudP.f ? loudP.f.pulse : 0);
    ringView.group.visible = carsG.visible = trafficG.visible = !viewPlace || camBlend < 1;   // a view shows only its own place

    places.forEach((p) => {
      const v = viewPlace === p ? 1 : smooth(60, 10, Math.hypot(P.x - p.vx, P.z - p.vz));
      const f = p.f || SILENT;
      if (v > 0.001 || viewPlace === p || !p.ran) { p.ran = true; p.update(t, dt, f, v, viewPlace === p); }   // once at the start wherever you are: places set their out-in-the-world look in update()
      const d = Math.hypot(P.x - p.vx, P.z - p.vz);
      p.group.visible = !viewPlace || viewPlace === p || camBlend < 1;
      const hide = viewPlace === p || d < 7 || (viewPlace && camBlend >= 1);
      p.beam.visible = !hide;
      p.beam.material.opacity = (p.found ? 0.07 : 0.12) + f.pulse * 0.16;
      p.ringM.material.opacity = viewPlace === p ? 0 : 0.35 + f.pulse * 0.5 + Math.sin(t * 3) * 0.1;
      p.label.visible = false;
    });

    // Camera
    let tx = P.x, ty = P.y + 1.45, tz = P.z;
    if (mode === 'view' || (mode === 'modal' && viewPlace)) {
      const s = viewPlace.shot(t, viewPlace.f || SILENT);
      tmpV.set(...s.pos); viewPlace.group.localToWorld(tmpV);
      tmpL.set(...s.look); viewPlace.group.localToWorld(tmpL);
      fwd.copy(tmpL).sub(tmpV).normalize();
      tmpU.set(0, 1, 0).applyAxisAngle(fwd, s.roll || 0);
    } else {
      let cd = camDist + boost * 1.8;
      if (mode === 'title') { camYaw += dt * 0.06; }
      else if (drv) {   // chase camera: it swings round behind the car unless you are dragging the view
        if (!drag) { camYaw += wrapA(drv.yaw + Math.PI - camYaw) * Math.min(1, dt * (2.5 + Math.abs(drv.v) * 0.1)); camPitch += (0.19 - camPitch) * Math.min(1, dt * 2); }
        cd = 6.4 + Math.abs(drv.v) * 0.04; ty = P.y + 1.3 + (drv.hit > 0.4 && !RM ? Math.sin(t * 55) * 0.05 * drv.hit : 0);
      }
      else { const sh = 0.62 * (1 - boost * 0.6); tx += Math.cos(camYaw) * sh; tz -= Math.sin(camYaw) * sh; }
      let cx = tx + Math.sin(camYaw) * Math.cos(camPitch) * cd, cy = ty + Math.sin(camPitch) * cd, cz = tz + Math.cos(camYaw) * Math.cos(camPitch) * cd;
      if (mode === 'title') { cx = Math.sin(camYaw) * 26; cz = Math.cos(camYaw) * 26; cy = 9; tx = 0; ty = 2; tz = 0; }
      cx = clamp(cx, -160, 160); cz = clamp(cz, -160, 160); cy = Math.min(40, Math.max(groundAt(cx, cz) + 0.5, cy));
      tmpV.set(cx, cy, cz); tmpL.set(tx, ty - 0.1, tz); tmpU.set(0, 1, 0);
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
      wind.hg.gain.setTargetAtTime(0.03 + 0.03 * rpm, ct, 0.1); wind.o1.frequency.setTargetAtTime(44 + 62 * rpm, ct, 0.07); wind.o2.frequency.setTargetAtTime(66 + 93 * rpm, ct, 0.07);
    } else if (wind) { const ct = SW.Audio.ctx.currentTime; wind.g.gain.setTargetAtTime(0.035 * spd * spd, ct, 0.15); wind.f.frequency.setTargetAtTime(380 + 500 * spd, ct, 0.15); wind.hg.gain.setTargetAtTime(0.05 * Math.min(1, boost * 1.4) * (0.4 + 0.6 * spd), ct, 0.12); wind.o1.frequency.setTargetAtTime(82 + 58 * spd, ct, 0.2); wind.o2.frequency.setTargetAtTime(123.5 + 87 * spd, ct, 0.2); }
    camera.position.copy(tmpV); camera.up.copy(tmpU); camera.lookAt(tmpL); camLook.copy(tmpL);
    sky.position.copy(camera.position); stars.position.copy(camera.position);
    planet.position.set(camera.position.x - 260, camera.position.y + 250, camera.position.z - 380);
    worldUpd.forEach((f) => f(t, dt));
    if (drv) { const kmh = Math.round(dv * 3.6); if (kmh !== lastKmh) { lastKmh = kmh; $('#spdNum').textContent = kmh; $('#spdBar').firstElementChild.style.width = Math.min(100, kmh / 2.1) + '%'; } }
    farGroup.visible = !(viewPlace && camBlend >= 1); farLights.opacity = Math.sin(t * 2.2) > 0.2 ? 1 : 0.15;
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
    places.forEach((p) => { g.beginPath(); for (let i = 0; i < p.path.length; i += 3) { const [x, y] = tr(p.path[i].x, p.path[i].z); if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); });
    g.strokeStyle = 'rgba(96,104,118,.95)'; g.lineWidth = 6; g.beginPath();   // the ring road
    for (let i = 0; i <= ring.N; i += 2) { const [x, y] = tr(ring.X[i % ring.N], ring.Z[i % ring.N]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
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
      n.buffer = SW.Kit.noiseBuf; n.loop = true; f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 0.6; g.gain.value = 0;
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
  }
  $('#startBtn').addEventListener('click', start);

  load();
  places.forEach((p) => { if (p.found) refreshLabels(p); });
  updateFound();
  $('#tArtist').textContent = CFG.artist;
  $('#tTitle').textContent = CFG.title;
  document.title = CFG.title;
  resize();

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now; t += dt;
    if (mode === 'dialog') tickDlg(dt);
    update(dt);
    post.uniforms.time.value = t; skyU.time.value = t;
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
  window.__soundwalk = { P, places, collide, avatar, scene, setT(v) { t = v; }, setCam(y, pt) { camYaw = y; if (pt !== undefined) camPitch = pt; }, get mode() { return mode; }, enterView, exitView, routeTo, start, ring, rq, traffic, startDrive, endDrive, drive: () => drv, step(n, dt) { for (let i = 0; i < n; i++) { t += dt; update(dt); } } };
})();
