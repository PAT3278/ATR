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
  const TEXDRAW = {
    grass(g, S, r) { g.fillStyle = '#47883c'; g.fillRect(0, 0, S, S); for (let i = 0; i < 900; i++) { g.fillStyle = ['#3c7a34', '#57994a', '#63a552', '#346e2f'][i % 4]; const x = r() * S, y = r() * S; g.fillRect(x, y, 1.5, 3 + r() * 4); } speckle(g, S, S, r, 1500, 0.05); },
    paving(g, S, r) { g.fillStyle = '#cfc2a4'; g.fillRect(0, 0, S, S); const n = 4, w = S / n; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { g.fillStyle = `rgba(${150 + r() * 40},${135 + r() * 35},${110 + r() * 30},.35)`; g.fillRect(x * w + 2, y * w + 2, w - 4, w - 4); } g.fillStyle = D(0.25); for (let k = 0; k <= n; k++) { g.fillRect(k * w - 1, 0, 2, S); g.fillRect(0, k * w - 1, S, 2); } speckle(g, S, S, r, 1200, 0.06); },
    slate(g, S, r) { g.fillStyle = '#e3e8ec'; g.fillRect(0, 0, S, S); const n = 4, w = S / n; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const v = 205 + r() * 34; g.fillStyle = `rgba(${v - 6},${v},${v + 6},.6)`; g.fillRect(x * w + 1, y * w + 1, w - 2, w - 2); } g.fillStyle = 'rgba(90,120,150,.4)'; for (let k = 0; k <= n; k++) { g.fillRect(k * w - 0.75, 0, 1.5, S); g.fillRect(0, k * w - 0.75, S, 1.5); } speckle(g, S, S, r, 700, 0.025); },
    sand(g, S, r) { g.fillStyle = '#d6c08c'; g.fillRect(0, 0, S, S); speckle(g, S, S, r, 3000, 0.08); },
    path(g, S, r) { g.fillStyle = '#d3d8dc'; g.fillRect(0, 0, S, S); for (let i = 0; i < 120; i++) { g.fillStyle = r() < 0.5 ? '#c3c9ce' : '#e3e7ea'; g.beginPath(); g.arc(r() * S, r() * S, 1 + r() * 3, 0, 7); g.fill(); } speckle(g, S, S, r, 2000, 0.08); },
    asphalt(g, S, r) { g.fillStyle = '#2b2831'; g.fillRect(0, 0, S, S); speckle(g, S, S, r, 3000, 0.07); g.strokeStyle = D(0.4); for (let i = 0; i < 4; i++) { g.beginPath(); let x = r() * S, y = r() * S; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); } },
    checker(g, S) { const h = S / 2; g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, S, S); g.fillStyle = '#bdbdbd'; g.fillRect(0, 0, h, h); g.fillRect(h, h, h, h); },
    windows(g, S, r) { g.fillStyle = '#000'; g.fillRect(0, 0, S, S); const n = 4, w = S / n; const cols = ['#ffd27a', '#ffe9b8', '#9ff3ff', '#ff8ad8', '#ffd27a']; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { if (r() < 0.45) continue; g.fillStyle = cols[Math.floor(r() * cols.length)]; g.globalAlpha = 0.5 + r() * 0.5; g.fillRect(x * w + w * 0.2, y * w + w * 0.25, w * 0.6, w * 0.45); } g.globalAlpha = 1; },
  };
  const texBase = {}, texCache = {};
  function tex(kind, rx = 1, ry = 1) {
    const key = `${kind}:${rx}:${ry}`;
    if (texCache[key]) return texCache[key];
    if (!texBase[kind]) { const c = document.createElement('canvas'); c.width = c.height = 128; TEXDRAW[kind](c.getContext('2d'), 128, rng(kind.length * 977)); texBase[kind] = c; }
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
    uniforms: { tD: { value: rt.texture }, res: { value: new THREE.Vector2(1, 1) }, time: { value: 0 }, bloom: { value: 1.6 }, grain: { value: 0.022 }, vig: { value: 0.3 }, thr: { value: HDR ? 1.05 : 0.86 }, tint: { value: new THREE.Vector3(1, 1, 1) }, expo: { value: 1 }, sat: { value: 1 }, spd: { value: 0 }, sunUv: { value: new THREE.Vector2(0.5, 0.5) }, flare: { value: 0 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: `uniform sampler2D tD;uniform vec2 res;uniform float time,bloom,grain,vig,expo,thr,sat,spd,flare;uniform vec2 sunUv;uniform vec3 tint;varying vec2 vUv;
    vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
    void main(){vec2 q0=vUv-.5;vec3 c=vec3(0.);float rb=spd*.014*smoothstep(.05,.6,length(q0));
      for(int i=0;i<6;i++){c+=texture2D(tD,vUv-q0*rb*float(i)).rgb;}c/=6.;
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
      float l=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(l),c,sat);c=mix(c*vec3(.95,1.,1.06)+vec3(0.,.004,.012),c*vec3(1.02,1.,.985),smoothstep(.05,.7,l));
      c=pow(max(c,0.),vec3(1./2.2));c=mix(c,c*c*(3.-2.*c),.22);
      vec2 q=vUv-.5;c*=1.-vig*smoothstep(.25,.85,length(q*vec2(1.1,1.)));
      float n=fract(sin(dot(floor(vUv*res)+fract(time)*91.7,vec2(12.9898,78.233)))*43758.5453);c+=(n-.5)*grain;
      gl_FragColor=vec4(c,1.);}`,
    depthTest: false, depthWrite: false,
  });
  const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
  function resize() {
    const w = cv.clientWidth || innerWidth, h = cv.clientHeight || innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
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
  const whiteM = gloss('#c3ced8', { rough: 0.2, env: 0.75 });

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
      if(h>.01){vec2 uv=d.xz/(h+.2)*1.3+vec2(time*.006,time*.002);float n=fbm(uv);float den=smoothstep(.46,.8,n)*smoothstep(.01,.22,h);
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
  scene.add(planet);
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
  scene.add(farGroup);
  const hemi = new THREE.HemisphereLight(lin('#c6d8ff'), lin('#5d4b39'), 0.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 160 });
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  const pick = [];
  const circles = [], boxes = [];
  const interact = [];

  const ground = plane(400, 400, mat('#ffffff', { map: tex('grass', 170, 170) }, true));
  { const gg = new THREE.PlaneGeometry(400, 400, 72, 72), gp = gg.attributes.position, col = new Float32Array(gp.count * 3);
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
  const E = { rng, mat, plane, tex, textTex, bench, dot };
  const places = SW.SONGS.map((song, idx) => {
    const dx = song.x, dz = song.z, len = Math.hypot(dx, dz) || 1;
    const rot = Math.atan2(-dx / len, -dz / len);
    const c = Math.cos(rot), s = Math.sin(rot);
    const group = new THREE.Group();
    group.position.set(song.x, 0, song.z);
    group.rotation.y = rot;
    scene.add(group);
    const p = {
      song, idx, x: song.x, z: song.z, rot, group, dwell: 0, gain: 0, found: false,
      color: song.color || '#ffb428',
      toWorld: (lx, lz) => ({ x: song.x + lx * c + lz * s, z: song.z - lx * s + lz * c }),
      local: (wx, wz) => { const ax = wx - song.x, az = wz - song.z; return { x: ax * c - az * s, z: ax * s + az * c }; },
      addCircle(lx, lz, r) { const w = p.toWorld(lx, lz); circles.push({ x: w.x, z: w.z, r }); },
      addBox(lx, lz, hx, hz) { const w = p.toWorld(lx, lz); boxes.push({ x: w.x, z: w.z, hx, hz, c, s }); },
      pick(m) { m.userData.ground = true; pick.push(m); },
    };
    const builder = SW.PLACES[song.scene] || SW.PLACES.generic;
    builder.build(p, E);
    p.ground = p.ground || null;
    p.grade = prepGrade(p.grade, rot);
    return p;
  });

  function groundAt(x, z) {
    let h = 0;
    for (const p of places) if (p.ground) { const l = p.local(x, z); h = Math.max(h, p.ground(l.x, l.z)); }
    return h;
  }

  /* ---- grades (lighting the world blends into near each place) ---- */
  function prepGrade(g, rot) {
    const d = new THREE.Vector3(...g.sunDir);
    if (rot !== undefined) d.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    return { top: lin(g.top), bottom: lin(g.bottom), fog: lin(g.fog), near: g.near, far: g.far, sun: lin(g.sun), sunInt: g.sunInt, hemi: g.hemi, sunDir: d.normalize(), tint: new THREE.Vector3(...g.tint), expo: g.expo, sat: g.sat, stars: g.stars };
  }
  const BASE = prepGrade({ top: '#0f5fc6', bottom: '#a4d8fa', fog: '#c2e2f6', near: 45, far: 240, sun: '#fff4dc', sunInt: 2.45, hemi: 0.8, sunDir: [0.5, 0.62, 0.32], tint: [0.99, 1, 1.03], expo: 1, sat: 1.04, stars: 0 });
  const G = prepGrade({ top: '#000', bottom: '#000', fog: '#000', near: 0, far: 0, sun: '#000', sunInt: 0, hemi: 0, sunDir: [0, 1, 0], tint: [1, 1, 1], expo: 1, sat: 1, stars: 0 });
  function blendGrade(a, b, k) {
    G.top.copy(a.top).lerp(b.top, k); G.bottom.copy(a.bottom).lerp(b.bottom, k); G.fog.copy(a.fog).lerp(b.fog, k); G.sun.copy(a.sun).lerp(b.sun, k);
    G.near = a.near + (b.near - a.near) * k; G.far = a.far + (b.far - a.far) * k;
    G.sunInt = a.sunInt + (b.sunInt - a.sunInt) * k; G.hemi = a.hemi + (b.hemi - a.hemi) * k;
    G.sunDir.copy(a.sunDir).lerp(b.sunDir, k).normalize(); G.tint.copy(a.tint).lerp(b.tint, k);
    G.expo = a.expo + (b.expo - a.expo) * k; G.sat = a.sat + (b.sat - a.sat) * k; G.stars = a.stars + (b.stars - a.stars) * k;
  }
  function applyGrade() {
    skyU.top.value.copy(G.top); skyU.bottom.value.copy(G.bottom); skyU.sunDir.value.copy(G.sunDir); skyU.sunCol.value.copy(G.sun).multiplyScalar(Math.min(1, G.sunInt / 2));
    scene.fog.color.copy(G.fog); scene.fog.near = G.near; scene.fog.far = G.far;
    sun.color.copy(G.sun); sun.intensity = G.sunInt; hemi.intensity = G.hemi;
    post.uniforms.tint.value.copy(G.tint); post.uniforms.expo.value = G.expo; post.uniforms.sat.value = G.sat;
    starMat.opacity = G.stars;
    rimU.value.copy(G.bottom).lerp(G.sun, 0.3).multiplyScalar(0.3);
    skyU.aur.value = 0.09 + G.stars * 0.3;
    planetM.color.copy(G.bottom).lerp(G.top, 0.35).multiplyScalar(1.15); ringM.color.copy(planetM.color);
    farM.color.copy(G.fog).lerp(G.top, 0.3).multiplyScalar(0.85); farM2.color.copy(G.fog).lerp(G.top, 0.55).multiplyScalar(0.7);
  }

  /* ================= plaza, paths, trees ================= */
  const PLAZA_R = 11;
  {
    const pl = new THREE.Mesh(new THREE.CircleGeometry(PLAZA_R, 56), gloss('#93a6b8', { map: tex('slate', 6, 6), rough: 0.26, env: 0.5 }));
    pl.rotation.x = -Math.PI / 2; pl.position.y = 0.03; pl.receiveShadow = true;
    scene.add(pl); pick.push(pl); pl.userData.ground = true;
    const rim = new THREE.Mesh(new THREE.RingGeometry(PLAZA_R, PLAZA_R + 0.6, 56), whiteM);
    rim.rotation.x = -Math.PI / 2; rim.position.y = 0.035; rim.receiveShadow = true; scene.add(rim);
    // Reflecting pool with a pedestal; a glass orb floats above it (see below).
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(3.9, 4.05, 0.44, 56, 1, true), whiteM); wall.position.y = 0.22;
    const lip = new THREE.Mesh(new THREE.RingGeometry(3.6, 3.9, 56), whiteM); lip.rotation.x = -Math.PI / 2; lip.position.y = 0.44;
    const water = new THREE.Mesh(new THREE.CircleGeometry(3.6, 56), gloss('#1b9fdc', { rough: 0.05, metal: 0.9, env: 1.25 })); water.rotation.x = -Math.PI / 2; water.position.y = 0.38;
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 1.15, 2.7, 28), whiteM); ped.position.y = 1.65;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.42, 0.4, 28), whiteM); cup.position.y = 3.2;
    [wall, lip, ped, cup].forEach((m) => { m.castShadow = m.receiveShadow = true; });
    scene.add(wall, lip, water, ped, cup);
    circles.push({ x: 0, z: 0, r: 4.0 });
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2, x = Math.cos(a) * 9.6, z = Math.sin(a) * 9.6;
      const py = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 4.2, 12), whiteM); py.position.set(x, 2.1, z); py.castShadow = true;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14), new THREE.MeshBasicMaterial({ color: '#c9f2ff' })); cap.position.set(x, 4.4, z);
      scene.add(py, cap);
      circles.push({ x, z, r: 0.3 });
    }
  }

  const worldUpd = [];
  {
    const cy = lin('#6fdcff'), gn = lin('#a6f06a');
    const glowB = (c, o) => { const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }); m.userData.lin = true; return m; };
    const inlay = (c, o) => { const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false }); m.userData.lin = true; return m; };
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), glowB(cy.clone().multiplyScalar(1.6), 0.95)); crystal.scale.y = 1.6; crystal.position.y = 4.9; crystal.renderOrder = 1;
    const orb = new THREE.Mesh(new THREE.SphereGeometry(1.25, 40, 24), gloss('#e6f8ff', { rough: 0.03, metal: 1, env: 1.5, opacity: 0.42 })); orb.position.y = 4.9; orb.renderOrder = 2;
    const rings = [1.8, 2.25].map((r, i) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 6, 64), glowB(i ? gn : cy, 0.9)); m.position.y = 4.9; return m; });
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 30, 16, 1, true).translate(0, 19, 0), glowB(cy, 0.05));
    scene.add(crystal, orb, col, ...rings);
    const floor = [], aqua = lin('#2fb4ec');
    for (const [r0, r1] of [[4.3, 4.42], [7.3, 7.42], [10.3, 10.5]]) { const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 72), inlay(aqua, 0.8)); m.rotation.x = -Math.PI / 2; m.position.y = 0.06; scene.add(m); floor.push(m); }
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2, m = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 2.9), inlay(aqua, 0.7)); m.rotation.x = -Math.PI / 2; m.rotation.z = -a; m.position.set(Math.sin(a) * 5.86, 0.06, Math.cos(a) * 5.86); scene.add(m); floor.push(m); }
    const ripples = [0, 1, 2].map(() => { const m = new THREE.Mesh(new THREE.RingGeometry(0.965, 1, 64), inlay(lin('#ffffff'), 0.5)); m.rotation.x = -Math.PI / 2; m.position.y = 0.39; scene.add(m); return m; });
    const pl = new THREE.PointLight(cy, 1.0, 20, 1.8); pl.position.set(0, 4.9, 0); scene.add(pl);
    // Soap-bubble motes drifting up around the player everywhere.
    const bub = document.createElement('canvas'); bub.width = bub.height = 64;
    { const g = bub.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 31);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.68, 'rgba(255,255,255,.06)'); gr.addColorStop(0.88, 'rgba(255,255,255,.7)'); gr.addColorStop(0.96, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      const hg = g.createRadialGradient(22, 20, 0, 22, 20, 9); hg.addColorStop(0, 'rgba(255,255,255,.95)'); hg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = hg; g.fillRect(10, 8, 26, 26); }
    const N = 150, BX = 44, BY = 13, base = new Float32Array(N * 3), pos = new Float32Array(N * 3), colr = new Float32Array(N * 3), rr = rng(404);
    for (let i = 0; i < N; i++) { base.set([rr() * BX, rr() * BY, rr() * BX], i * 3); const k = rr(), c = k < 0.5 ? [1, 1, 1] : k < 0.8 ? [0.6, 0.92, 1] : [0.75, 1, 0.7]; colr.set(c, i * 3); }
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mg.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    const motes = new THREE.Points(mg, new THREE.PointsMaterial({ size: 0.4, map: new THREE.CanvasTexture(bub), vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false }));
    motes.material.userData.lin = true; motes.frustumCulled = false; scene.add(motes);
    const wrap = (v, m) => ((v % m) + m) % m;
    worldUpd.push((t) => {
      crystal.rotation.y = t * 0.8; crystal.position.y = orb.position.y = 4.9 + Math.sin(t * 1.1) * 0.14;
      rings[0].rotation.set(t * 0.7, t * 0.3, 0); rings[1].rotation.set(1.2 + t * 0.4, 0, t * 0.55);
      rings.forEach((m) => (m.position.y = orb.position.y));
      floor.forEach((m, i) => (m.material.opacity = 0.6 + 0.3 * Math.sin(t * 1.6 - i * 0.5)));
      ripples.forEach((m, i) => { const k = (t * 0.28 + i / 3) % 1, sc = 1.25 + k * 2.3; m.scale.set(sc, sc, 1); m.material.opacity = 0.55 * (1 - k); });
      for (let i = 0; i < N; i++) { const j = i * 3;
        pos[j] = P.x + wrap(base[j] + Math.sin(t * 0.3 + i) * 0.8 - P.x, BX) - BX / 2;
        pos[j + 1] = wrap(base[j + 1] + t * (0.3 + (i % 7) * 0.07), BY) + 0.2;
        pos[j + 2] = P.z + wrap(base[j + 2] - P.z, BX) - BX / 2; }
      mg.attributes.position.needsUpdate = true;
    });
  }

  // Paths: a smooth ribbon from the plaza edge to each place's entrance.
  function cubic(a, b, c, d, t) { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; }
  const pathMat = mat('#ffffff', { map: tex('path', 1, 1) });
  places.forEach((p) => {
    const len = Math.hypot(p.x, p.z), ux = p.x / len, uz = p.z / len;
    const a = { x: ux * (PLAZA_R - 0.5), z: uz * (PLAZA_R - 0.5) };
    const e = p.toWorld(0, p.pathEnd), eIn = p.toWorld(0, p.pathEnd + 14);
    const b = { x: a.x + ux * 12, z: a.z + uz * 12 };
    const pts = [];
    const N = 70;
    for (let i = 0; i <= N; i++) { const t = i / N; pts.push({ x: cubic(a.x, b.x, eIn.x, e.x, t), z: cubic(a.z, b.z, eIn.z, e.z, t) }); }
    // continue straight to the viewpoint
    const vp = p.toWorld(0, 0), last = pts[pts.length - 1];
    const extra = Math.ceil(Math.hypot(vp.x - last.x, vp.z - last.z) / 1.5);
    for (let i = 1; i <= extra; i++) pts.push({ x: last.x + ((vp.x - last.x) * i) / extra, z: last.z + ((vp.z - last.z) * i) / extra });
    p.path = pts;
    const pos = [], uv = [], idx = [];
    let acc = 0;
    const draw = pts.slice(0, N + 1);
    draw.forEach((q, i) => {
      const n = draw[Math.min(i + 1, draw.length - 1)], pv = draw[Math.max(i - 1, 0)];
      let tx = n.x - pv.x, tz = n.z - pv.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const w = 1.5;
      if (i > 0) acc += Math.hypot(q.x - pv.x, q.z - pv.z);
      for (const sd of [-1, 1]) {
        const x = q.x - tz * w * sd, z = q.z + tx * w * sd;
        pos.push(x, groundAt(x, z) + 0.045, z);
        uv.push(sd < 0 ? 0 : 1, acc / 3);
      }
      if (i < draw.length - 1) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
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
      if (Math.hypot(x, z) < PLAZA_R + 5) return false;
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
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.3, 2.6, 6).translate(0, 1.3, 0), mat('#4b3a2b'), n);
    const tops = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), n * 3);
    tops.material.userData.lin = true; tops.material.onBeforeCompile = rimPatch;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), ps = new THREE.Vector3(), sc = new THREE.Vector3();
    const greens = ['#2c6a3a', '#377a44', '#28603a', '#43894a', '#255636', '#4d8a3e'].map(lin);
    const TIER = [[2.0, 3.3, 1.5], [1.55, 3.0, 3.2], [1.05, 2.7, 4.9]];
    spots.forEach(([x, z, s], i) => {
      const hs = s * (0.9 + r() * 0.55);
      ps.set(x, 0, z); sc.set(s, hs, s); q.identity();
      trunks.setMatrixAt(i, m4.compose(ps, q, sc));
      const col = greens[Math.floor(r() * greens.length)];
      TIER.forEach(([rad, h, y], k) => {
        e.set((r() - 0.5) * 0.1, r() * 6.28, (r() - 0.5) * 0.1); q.setFromEuler(e);
        ps.set(x, y * hs, z); sc.set(rad * s, h * hs, rad * s);
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
    const vp = p.toWorld(0, 0), gy = groundAt(vp.x, vp.z);
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

    // Signpost on the plaza pointing down this place's path
    const len = Math.hypot(p.x, p.z), ux = p.x / len, uz = p.z / len, sx = ux * 8.4 - uz * 2.2, sz = uz * 8.4 + ux * 2.2;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 2.2, 10), whiteM);
    post.position.set(sx, 1.1, sz); post.castShadow = true;
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 0.04), additive(p.color, 0.45));
    board.position.set(sx + ux * 0.5, 1.85, sz + uz * 0.5); board.rotation.y = Math.atan2(uz, -ux) + Math.PI;
    scene.add(post, board);
    circles.push({ x: sx, z: sz, r: 0.25 });
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
    const skin = mat('#e1b18c', { rough: 0.65 }), hoodie = mat('#f2f5f8', { rough: 0.5 }), pants = mat('#1f2a44'), shoeM = mat('#f2f4f7', { rough: 0.5 }), hair = mat('#22160f', { rough: 0.55 }), phone = mat('#1b1b20', { rough: 0.4, metal: 0.3 }), cup = mat('#35bdf0', { rough: 0.3 });
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
    { const tm = new THREE.MeshBasicMaterial({ color: lin('#7fe9ff').multiplyScalar(1.5) }); tm.userData.lin = true;
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
    // Floating deck, ridden sideways.
    mk('side', 0.14, (g) => {
      const shell = gloss('#f1f5f8', { rough: 0.15, env: 1 });
      const deck = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 1.1), shell); deck.position.y = 0.1; deck.castShadow = true;
      for (const z of [-0.55, 0.55]) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 18), shell); cap.position.set(0, 0.1, z); cap.castShadow = true; g.add(cap); }
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.056, 1.25), led()); strip.position.y = 0.1;
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.2), additive('#4fd0ff', 0.35)); glow.rotation.x = -Math.PI / 2; glow.position.set(0, 0.03, -0.4);
      g.add(deck, strip, glow);
      return (t, bst) => { glow.material.opacity = 0.2 + bst * 0.3; g.position.y = Math.sin(t * 6) * 0.015; };
    });
    // Hover disc.
    mk('front', 0.22, (g) => {
      const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.36, 0.09, 28), gloss('#e9f4fb', { rough: 0.12, metal: 0.3, env: 1.1 })); dish.position.y = 0.13; dish.castShadow = true;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.025, 8, 12), led('#9cf06a')); rim.rotation.x = Math.PI / 2; rim.position.y = 0.175;
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.7, 24), additive('#9cf06a', 0.3)); glow.rotation.x = -Math.PI / 2; glow.position.y = -0.02;
      g.add(dish, rim, glow);
      return (t, bst) => { rim.rotation.z = t * 3; glow.material.opacity = 0.15 + bst * 0.3; g.position.y = 0.05 + Math.sin(t * 5) * 0.02; };
    });
    let cur = null, last = null, forced = null;
    let phase = 0;
    return {
      G: A,
      forceRide(i) { forced = i; if (cur) { cur.g.visible = false; cur = null; } },
      animate(dt, speed, bob, bst = 0, lean = 0) {
        const riding = bst > 0.3;
        if (riding && !cur) { do { cur = rides[Math.floor(Math.random() * rides.length)]; } while (cur === last); if (forced !== null) cur = rides[forced % rides.length]; last = cur; cur.g.visible = true; }
        if (!riding && cur) { cur.g.visible = false; cur = null; }
        const side = riding && cur.pose === 'side';
        body.rotation.z = lean;
        body.rotation.y = side ? 1.05 : 0; if (riding) { body.rotation.x = side ? 0 : 0.1; hips.rotation.y = 0; }
        head.rotation.y = side ? -0.95 : 0;
        arms.forEach((a, i) => (a.pivot.rotation.z = (i ? 1 : -1) * (side ? 0.95 : riding ? 0.3 : 0.08)));
        if (riding) {
          const tt = performance.now() / 1000;
          cur.upd(tt, bst, speed);
          if (side) {
            legs[0].pivot.rotation.x = 0.3; legs[1].pivot.rotation.x = -0.3;
            legs[0].pivot.rotation.z = -0.25; legs[1].pivot.rotation.z = 0.25;
            legs[0].knee.rotation.x = legs[1].knee.rotation.x = 0.35;
          } else {
            legs[0].pivot.rotation.x = legs[1].pivot.rotation.x = -0.14;
            legs[0].pivot.rotation.z = -0.11; legs[1].pivot.rotation.z = 0.11;
            legs[0].knee.rotation.x = legs[1].knee.rotation.x = 0.26;
          }
          arms[0].pivot.rotation.x = arms[1].pivot.rotation.x = side ? 0 : 0.12;
          arms.forEach((a) => (a.elbow.rotation.x = -0.25));
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
      },
    };
  }
  const avatar = makeAvatar();
  scene.add(avatar.G);
  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: lin('#4fd0ff') }));
  marker.material.userData.lin = true;
  marker.visible = false;
  scene.add(marker);

  /* ================= state ================= */
  const KEY = 'soundwalk-v1';
  const P = { x: 0, z: -7.5, y: 0, face: 0, speed: 0, v: 0, hx: 0, hz: 1, lean: 0, vy: 0, air: false };
  let boost = 0, dashOn = false, baseFov = 55, wind = null;
  function jump() { if (mode === 'walk' && !P.air) { P.air = true; P.vy = 8.5 + 2.5 * boost; } }
  let camYaw = Math.PI, camPitch = 0.3, mode = 'load', auto = null, focus = null, lastFocus, regionKey = '', viewPlace = null, t = 0;
  const camDist = 6.6;
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ found: places.filter((p) => p.found).map((p) => p.song.id), x: P.x, z: P.z, yaw: camYaw })); } catch (e) { /* storage blocked */ } }
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
      const dx = p.x - c.x, dz = p.z - c.z, rr = c.r + PR;
      if (Math.abs(dx) > rr || Math.abs(dz) > rr) continue;
      const d = Math.hypot(dx, dz);
      if (d < rr && d > 1e-5) { p.x = c.x + (dx / d) * rr; p.z = c.z + (dz / d) * rr; }
    }
    for (const b of boxes) {
      const dx = p.x - b.x, dz = p.z - b.z;
      const ux = dx * b.c - dz * b.s, uz = dx * b.s + dz * b.c;
      const ox = b.hx + PR - Math.abs(ux), oz = b.hz + PR - Math.abs(uz);
      if (ox <= 0 || oz <= 0) continue;
      let nx = ux, nz = uz;
      if (ox < oz) nx = Math.sign(ux || 1) * (b.hx + PR); else nz = Math.sign(uz || 1) * (b.hz + PR);
      p.x = b.x + nx * b.c + nz * b.s; p.z = b.z - nx * b.s + nz * b.c;
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
    const gp = pad();
    if (gp) { f += -gp.y; s += gp.x; }
    const m = Math.hypot(f, s);
    if (m > 1) { f /= m; s /= m; }
    return { f, s, m: Math.min(1, m) };
  }
  addEventListener('keydown', (e) => {
    if (e.key === 'Shift') running = true;
    if (mode === 'title') { if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); start(); } return; }
    if (mode === 'modal') { if (e.key === 'Escape' || e.code === 'KeyM' || e.code === 'KeyX') { e.preventDefault(); closeMap(); } return; }
    if (mode === 'dialog') { if (e.key === 'Enter' || e.key === 'Escape' || e.code === 'KeyZ' || e.code === 'Space') { e.preventDefault(); advance(); } return; }
    if (mode === 'view') { if (e.key === 'Escape' || e.code === 'KeyX' || e.key === 'Backspace') { e.preventDefault(); exitView(); } return; }
    if (mode !== 'walk') return;
    const k = KEYMAP[e.code];
    if (k) { e.preventDefault(); keys.add(k); auto = null; return; }
    if (e.code === 'KeyQ') camYaw += 0.2;
    else if (e.code === 'KeyE') camYaw -= 0.2;
    else if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) jump(); }
    else if (!e.repeat && (e.code === 'KeyZ' || e.key === 'Enter')) { e.preventDefault(); if (focus) act(focus); }
    else if (e.key === 'Escape' || e.code === 'KeyX' || e.code === 'KeyM') { e.preventDefault(); openMap(); }
  });
  addEventListener('keyup', (e) => { if (e.key === 'Shift') running = false; const k = KEYMAP[e.code]; if (k) keys.delete(k); });
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
    const r = cv.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(pick, false);
    for (const h of hits) {
      const ia = h.object.userData.ia;
      if (ia) {
        if (Math.hypot(ia.x - P.x, ia.z - P.z) < ia.r) { faceTo(ia); act(ia); return; }
        routeTo(ia.place, ia);
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
  let padPrev = [], padRun = false;
  function pad() {
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected) : null;
    if (!gp) return null;
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
    const pressed = gp.buttons.map((b) => b.pressed);
    const down = (i) => pressed[i] && !padPrev[i];
    if (down(0)) { if (mode === 'walk') pressA(); else if (mode === 'dialog') advance(); else if (mode === 'title') start(); }
    if (down(1)) { if (mode === 'view') exitView(); else if (mode === 'modal') closeMap(); }
    if (down(9) && mode === 'walk') openMap();
    padPrev = pressed;
    padRun = !!(pressed[7] || pressed[5] || pressed[2]);
    camYaw -= dz(gp.axes[2] || 0) * 0.04;
    camPitch = clamp(camPitch + dz(gp.axes[3] || 0) * 0.02, 0.04, 0.85);
    return { x: dz(gp.axes[0]), y: dz(gp.axes[1]) };
  }

  function pressA() { if (mode === 'dialog') { advance(); return; } if (mode === 'walk') { if (focus) act(focus); else jump(); } }
  $('#btnB').addEventListener('pointerdown', (e) => { e.preventDefault(); dashOn = !dashOn; $('#btnB').classList.toggle('on', dashOn); });
  function faceTo(ia) { P.face = Math.atan2(ia.x - P.x, ia.z - P.z); }
  function act(ia) {
    auto = null; keys.clear();
    if (ia.kind === 'view') { enterView(ia.place); return; }
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
      if (Math.abs(da) > 1.6) { const m = a + da / 2; pts.push({ x: Math.cos(m) * 7, z: Math.sin(m) * 7 }); }
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
  function drawMap() {
    const g = mg, W = mapCv.width;
    g.fillStyle = '#0d3a68'; g.fillRect(0, 0, W, W);
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
    g.strokeStyle = 'rgba(225,242,255,.85)'; g.lineWidth = 3 * MAP_S;
    places.forEach((p) => { g.beginPath(); p.path.forEach((q, i) => { const [x, y] = toMap(q.x, q.z); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke(); });
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(...toMap(0, 0), PLAZA_R * MAP_S, 0, 7); g.fill();
    g.textAlign = 'center';
    places.forEach((p) => {
      const [x, y] = toMap(p.vx, p.vz);
      g.fillStyle = p.found ? p.color : '#9aa8bc';
      g.beginPath(); g.arc(x, y, 15, 0, 7); g.fill();
      g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.stroke();
      g.font = '700 18px sans-serif'; g.textBaseline = 'middle'; g.fillStyle = '#06284a';
      g.fillText(p.found ? '♪' : '?', x, y + 1);
    });
    const [px, py] = toMap(P.x, P.z);
    g.save(); g.translate(px, py); g.rotate(-P.face + Math.PI);
    g.fillStyle = '#8fe6ff'; g.beginPath(); g.moveTo(0, -11); g.lineTo(8, 8); g.lineTo(0, 4); g.lineTo(-8, 8); g.closePath(); g.fill();
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
      const q = p.path[Math.max(0, p.path.length - 9)];
      P.x = q.x; P.z = q.z; P.y = groundAt(q.x, q.z); P.v = 0; auto = null;
      P.face = Math.atan2(p.vx - q.x, p.vz - q.z); P.hx = Math.sin(P.face); P.hz = Math.cos(P.face); camYaw = P.face + Math.PI;
      regionKey = ''; updateRegion(true); save();
      f.classList.remove('on'); mode = 'walk';
    }, 320);
  }
  $('#mapBtn').addEventListener('click', () => (mode === 'modal' ? closeMap() : openMap()));
  $('#mapClose').addEventListener('click', closeMap);
  mapCv.addEventListener('click', (e) => {
    const r = mapCv.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * mapCv.width / MAP_S - 150, z = ((e.clientY - r.top) / r.height) * mapCv.height / MAP_S - 150;
    let best = null, bd = 14;
    places.forEach((p) => { const d = Math.hypot(p.vx - x, p.vz - z); if (d < bd) { bd = d; best = p; } });
    closeMap();
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
  let npT = 0;
  function updateAudio(dt) {
    const A = SW.Audio, on = A.started;
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw), fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    let loud = null;
    places.forEach((p) => {
      const dx = p.vx - P.x, dz = p.vz - P.z, d = Math.hypot(dx, dz);
      const viewing = viewPlace === p;
      const pp = viewing ? 1 : clamp((R_AUD - d) / (R_AUD - R_VIEW), 0, 1);
      p.dwell = (d < 4.5 || viewing) ? Math.min(1, p.dwell + dt / 12) : Math.max(0, p.dwell - dt / 4);
      const prox = 0.4 * pp * pp;
      p.gain = prox + (1 - prox) * ease(p.dwell) * pp;
      p.pp = pp;
      if (!p.found && d < 20 && on) {
        p.found = true; refreshLabels(p); updateFound(); save();
        SW.Audio.chime();
        banner('♪ NEW', p.song.title); lastFocus = undefined;
      }
      if (!on) { p.f = SILENT; return; }
      const ch = A.channels[p.idx];
      if (d < R_AUD * 1.1 || viewing) ch.start();
      else if (d > R_AUD * 1.3 && ch.gain < 0.002) ch.stop();
      const cut = 260 * Math.pow(20000 / 260, clamp(pp * 1.25, 0, 1));
      const side = d > 0.01 ? (dx * rx + dz * rz) / d : 0;
      ch.setTargets(p.gain, viewing ? 0 : clamp(side * 0.85 * (1 - pp * pp), -0.85, 0.85), cut);
      p.f = ch.analyse(dt, t);
      p.dir = Math.atan2((dx * rx + dz * rz), (dx * fx + dz * fz));
      if (p.gain > 0.012 && (!loud || p.gain > loud.gain)) loud = p;
    });
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
  function update(dt) {
    if (mode === 'walk') {
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
        if (d < (lastPt ? 0.3 : 1.2)) {
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
        if (d > ia.r) continue;
        const dot = (dx * fx + dz * fz) / (d || 1);
        if (dot < 0.15 && d > 1.4) continue;
        const sc = d - dot;
        if (sc < best) { best = sc; focus = ia; }
      }
    } else {
      P.speed += (0 - P.speed) * Math.min(1, dt * 10); P.v = 0; P.lean = 0; boost += (0 - boost) * Math.min(1, dt * 4);
      if (mode === 'view') { let df = viewPlace.rot + viewPlace.face - P.face; df = Math.atan2(Math.sin(df), Math.cos(df)); P.face += df * Math.min(1, dt * 6); }
    }
    const gh = groundAt(P.x, P.z);
    if (P.air) { P.vy -= 24 * dt; P.y += P.vy * dt; if (P.vy <= 0 && P.y <= gh) { P.y = gh; P.air = false; } }
    else P.y += (gh - P.y) * Math.min(1, dt * 14);
    avatar.G.position.set(P.x, P.y, P.z);
    avatar.G.rotation.y = P.face;
    const vf = viewPlace ? viewPlace.f : null;
    avatar.animate(dt, P.speed, vf ? vf.pulse : 0, boost, P.lean);

    const show = focus && mode === 'walk';
    marker.visible = !!show;
    if (show) { marker.position.set(focus.x, focus.mark + Math.sin(t * 3) * 0.08, focus.z); marker.rotation.y = t * 2; }
    const fkey = show ? focus : null;
    if (fkey !== lastFocus) {
      lastFocus = fkey;
      $('#prompt').hidden = !fkey;
      if (fkey) {
        $('#promptKey').textContent = TOUCH ? 'A' : 'Z';
        const s = fkey.place.song;
        $('#promptText').textContent = fkey.place.found ? '♪ ' + s.title : '？';
      }
    }
    $('#btnA').classList.toggle('ready', !!fkey);

    updateAudio(dt);

    // Lighting: blend towards the closest place's grade.
    let bp = null, bw = 0;
    places.forEach((p) => {
      const d = Math.hypot(P.x - p.vx, P.z - p.vz);
      const w = viewPlace === p ? 1 : smooth(48, 16, d);
      if (w > bw) { bw = w; bp = p; }
    });
    if (bp) blendGrade(BASE, bp.grade, bw); else blendGrade(BASE, BASE, 0);
    applyGrade();

    places.forEach((p) => {
      const v = viewPlace === p ? 1 : smooth(60, 10, Math.hypot(P.x - p.vx, P.z - p.vz));
      const f = p.f || SILENT;
      if (v > 0.001 || viewPlace === p) p.update(t, dt, f, v, viewPlace === p);
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
      if (mode === 'title') { camYaw += dt * 0.06; }
      let cx = tx + Math.sin(camYaw) * Math.cos(camPitch) * (camDist + boost * 1.8), cy = ty + Math.sin(camPitch) * (camDist + boost * 1.8), cz = tz + Math.cos(camYaw) * Math.cos(camPitch) * (camDist + boost * 1.8);
      if (mode === 'title') { cx = Math.sin(camYaw) * 26; cz = Math.cos(camYaw) * 26; cy = 9; tx = 0; ty = 2; tz = 0; }
      cx = clamp(cx, -160, 160); cz = clamp(cz, -160, 160); cy = Math.min(40, Math.max(groundAt(cx, cz) + 0.5, cy));
      tmpV.set(cx, cy, cz); tmpL.set(tx, ty - 0.1, tz); tmpU.set(0, 1, 0);
    }
    if (camBlend < 1) {
      camBlend = Math.min(1, camBlend + dt / camBlendDur);
      const k = ease(camBlend);
      tmpV.lerpVectors(camFrom.pos, tmpV, k); tmpL.lerpVectors(camFrom.look, tmpL, k); tmpU.lerpVectors(camFrom.up, tmpU, k).normalize();
    }
    const fv = baseFov + (RM ? 0 : boost * 15 + clamp(P.v / 7.5, 0, 1) * (1 - boost) * 4);
    if (Math.abs(camera.fov - fv) > 0.05) { camera.fov = fv; camera.updateProjectionMatrix(); }
    const spd = boost * clamp(P.v / 16, 0, 1);
    post.uniforms.spd.value = RM ? 0 : spd;
    if (wind) { const ct = SW.Audio.ctx.currentTime; wind.g.gain.setTargetAtTime(0.12 * spd * spd, ct, 0.1); wind.f.frequency.setTargetAtTime(450 + 900 * spd, ct, 0.1); }
    camera.position.copy(tmpV); camera.up.copy(tmpU); camera.lookAt(tmpL); camLook.copy(tmpL);
    sky.position.copy(camera.position); stars.position.copy(camera.position);
    planet.position.set(camera.position.x - 260, camera.position.y + 250, camera.position.z - 380);
    worldUpd.forEach((f) => f(t, dt));
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
    g.fillStyle = 'rgba(10,52,98,.8)'; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(225,242,255,.85)'; g.lineWidth = 2.5; g.lineCap = 'round'; g.lineJoin = 'round';
    places.forEach((p) => { g.beginPath(); for (let i = 0; i < p.path.length; i += 3) { const [x, y] = tr(p.path[i].x, p.path[i].z); if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); });
    const [px, py] = tr(0, 0);
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(px, py, PLAZA_R * k, 0, 7); g.fill();
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
    g.fillStyle = '#8fe6ff'; g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath(); g.fill();
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
      n.connect(f).connect(g).connect(SW.Audio.master); n.start(); wind = { g, f }; }
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
      if (v3.z < 0) { v3.applyMatrix4(camera.projectionMatrix); fl = (1 - smooth(0.9, 1.5, Math.max(Math.abs(v3.x), Math.abs(v3.y)))) * Math.pow(clamp(G.sunInt / 2.6, 0, 1), 2) * (1 - clamp(G.stars * 1.5, 0, 1)); post.uniforms.sunUv.value.set(v3.x * 0.5 + 0.5, v3.y * 0.5 + 0.5); }
      post.uniforms.flare.value += ((RM ? fl * 0.5 : fl) - post.uniforms.flare.value) * 0.15; }
    if (!hintOut && mode === 'walk' && P.speed > 1 && (hintT += dt) > 3) { hintOut = true; $('#hint').classList.add('out'); }
    requestAnimationFrame(loop);
  }
  const fontsReady = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]) : Promise.resolve();
  fontsReady.then(() => {
    
    mode = 'title';
    $('#title').hidden = false;
    $('#loading').classList.add('out');
    requestAnimationFrame(loop);
    $('#startBtn').focus({ preventScroll: true });
  });

  // Exposed for automated checks.
  window.__soundwalk = { P, places, collide, avatar, get mode() { return mode; }, enterView, exitView, routeTo, start };
})();
