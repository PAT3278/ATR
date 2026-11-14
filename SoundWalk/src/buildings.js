/*
 * Buildings in several designs, picked at random.
 *
 *   const kit = SW.Buildings.kit(E, seed)   // one kit per district: it owns its materials, so each can glow on its own
 *   kit.mesh(w, h, d, r)   -> THREE.Mesh, 1 unit tall and scaled to h (so scale.y can still dance to the music)
 *   kit.bake(list)         -> THREE.Group of a few merged meshes for buildings that never move ({ x, z, yaw, w, h, d })
 *   kit.glow(v)            -> window brightness
 *
 * Designs: 0 glass tower with a crown, 1 stepped deco tower with a spire, 2 brick apartment block with a cornice and a
 * water tank, 3 office with ribbon windows and plant on the roof, 4 slab block with balconies, 5 podium and tower.
 * Each is a handful of boxes: the walls carry a facade texture (a daytime face and a lit-window map), everything else is trim.
 */
(function () {
  'use strict';
  const SW = (window.SW = window.SW || {});
  const BAY = 3, FLOOR = 3.25, CELLS = 4;   // one texture tile is 4 bays by 4 floors

  // ---- facade textures: [daytime face, lit windows] per design ----
  function facades(E, seed) {
    const r = E.rng(seed), S = 256, c = S / CELLS;
    const make = (wall, paint) => {
      const out = [0, 1].map(() => { const cv = document.createElement('canvas'); cv.width = cv.height = S; return cv; });
      const a = out[0].getContext('2d'), b = out[1].getContext('2d');
      a.fillStyle = wall; a.fillRect(0, 0, S, S); b.fillStyle = '#000'; b.fillRect(0, 0, S, S);
      for (let i = 0; i < 900; i++) { a.fillStyle = r() < 0.5 ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.04)'; a.fillRect(r() * S, r() * S, 1 + r() * 3, 1 + r() * 2); }
      for (let y = 0; y < CELLS; y++) for (let x = 0; x < CELLS; x++) paint(a, b, x * c, y * c, c, r);
      return out.map((cv) => { const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; });
    };
    const warm = ['#ffd27a', '#ffe9b8', '#ffc864', '#fff1cf'], cool = ['#bfe9ff', '#dff4ff', '#9fd8ff', '#ffe9b8'];
    const win = (a, b, x, y, w, h, r, pal, lit, glass = '#161c26') => {
      a.fillStyle = glass; a.fillRect(x, y, w, h); a.fillStyle = 'rgba(160,190,220,.10)'; a.fillRect(x, y, w, h * 0.45);
      if (r() < lit) { b.fillStyle = pal[Math.floor(r() * pal.length)]; b.globalAlpha = 0.55 + r() * 0.45; b.fillRect(x, y, w, h); b.globalAlpha = 1; if (r() < 0.3) { b.fillStyle = 'rgba(0,0,0,.45)'; b.fillRect(x, y, w, h * (0.3 + r() * 0.4)); } }
    };
    return [
      // 0 glass: floor-to-ceiling panes between thin mullions
      make('#27313d', (a, b, x, y, c, r) => { win(a, b, x + 2, y + 5, c / 2 - 3, c - 8, r, cool, 0.5, '#1a2733'); win(a, b, x + c / 2 + 1, y + 5, c / 2 - 3, c - 8, r, cool, 0.5, '#1a2733'); a.fillStyle = '#3a4756'; a.fillRect(x, y, c, 3); }),
      // 1 deco: tall narrow windows in pale stone piers
      make('#7a7468', (a, b, x, y, c, r) => { for (const k of [0.16, 0.58]) win(a, b, x + c * k, y + c * 0.18, c * 0.26, c * 0.66, r, warm, 0.42); a.fillStyle = 'rgba(0,0,0,.18)'; a.fillRect(x, y, 2, c); }),
      // 2 brick: courses of brick, sash windows with pale sills and lintels
      make('#6a3a2c', (a, b, x, y, c, r) => {
        a.strokeStyle = 'rgba(30,14,10,.5)'; a.lineWidth = 1; for (let k = 0; k < 8; k++) { a.beginPath(); a.moveTo(x, y + k * c / 8); a.lineTo(x + c, y + k * c / 8); a.stroke(); }
        win(a, b, x + c * 0.3, y + c * 0.22, c * 0.4, c * 0.56, r, warm, 0.38);
        a.fillStyle = '#b9ab95'; a.fillRect(x + c * 0.26, y + c * 0.78, c * 0.48, 3); a.fillRect(x + c * 0.26, y + c * 0.17, c * 0.48, 3); a.fillStyle = '#2a1712'; a.fillRect(x + c * 0.3, y + c * 0.49, c * 0.4, 2);
      }),
      // 3 office: a ribbon of window over a concrete spandrel
      make('#8a8a86', (a, b, x, y, c, r) => { win(a, b, x, y + c * 0.2, c / 2 - 1, c * 0.42, r, cool, 0.55); win(a, b, x + c / 2 + 1, y + c * 0.2, c / 2 - 2, c * 0.42, r, cool, 0.55); a.fillStyle = 'rgba(0,0,0,.2)'; a.fillRect(x, y + c * 0.62, c, 2); }),
      // 4 slab: a window and a balcony door per bay, painted render
      make('#9a9488', (a, b, x, y, c, r) => { win(a, b, x + c * 0.1, y + c * 0.26, c * 0.3, c * 0.44, r, warm, 0.45); win(a, b, x + c * 0.56, y + c * 0.16, c * 0.3, c * 0.7, r, warm, 0.45); a.fillStyle = 'rgba(0,0,0,.25)'; a.fillRect(x, y + c - 4, c, 4); }),
      // 5 podium and tower: dark glass grid
      make('#1f2630', (a, b, x, y, c, r) => { for (let k = 0; k < 3; k++) win(a, b, x + 2 + (k * c) / 3, y + 4, c / 3 - 3, c - 7, r, cool, 0.4, '#152030'); a.fillStyle = '#39424e'; a.fillRect(x, y, c, 2); }),
    ];
  }

  // ---- geometry: boxes with wall quads (facade) and everything else (trim); 1 unit tall ----
  function shape(style, w, d, h, r) {
    const F = { p: [], u: [] }, T = { p: [], u: [] }, uo = r() * CELLS, vo = Math.floor(r() * CELLS);
    const quad = (o, a, b, c, e, U, V) => { o.p.push(...a, ...b, ...c, ...a, ...c, ...e); const u0 = o === F ? uo : 0, v0 = o === F ? vo / CELLS : 0; o.u.push(u0, v0, u0 + U, v0, u0 + U, v0 + V, u0, v0, u0 + U, v0 + V, u0, v0 + V); };
    // a box in metres across and in metres up (y0, y1); wall = facade walls, otherwise all trim
    const box = (x0, x1, y0, y1, z0, z1, wall) => {
      const o = wall ? F : T, a = y0 / h, b = y1 / h, V = (y1 - y0) / (FLOOR * CELLS), ux = (x1 - x0) / (BAY * CELLS), uz = (z1 - z0) / (BAY * CELLS);
      quad(o, [x0, a, z1], [x1, a, z1], [x1, b, z1], [x0, b, z1], ux, V);
      quad(o, [x1, a, z0], [x0, a, z0], [x0, b, z0], [x1, b, z0], ux, V);
      quad(o, [x1, a, z1], [x1, a, z0], [x1, b, z0], [x1, b, z1], uz, V);
      quad(o, [x0, a, z0], [x0, a, z1], [x0, b, z1], [x0, b, z0], uz, V);
      quad(T, [x0, b, z1], [x1, b, z1], [x1, b, z0], [x0, b, z0], 1, 1);
    };
    const X = w / 2, Z = d / 2, top = h;
    if (style === 0) {          // glass tower: shaft, a set-in crown, a mast
      box(-X, X, 0, top - 4, -Z, Z, true); box(-X * 0.86, X * 0.86, top - 4, top, -Z * 0.86, Z * 0.86, false);
      box(-0.25, 0.25, top, top + Math.min(9, h * 0.14), -0.25, 0.25, false);
    } else if (style === 1) {   // deco: three steps and a spire
      const a = top * 0.62, b = top * 0.86;
      box(-X, X, 0, a, -Z, Z, true); box(-X * 0.76, X * 0.76, a, b, -Z * 0.76, Z * 0.76, true); box(-X * 0.5, X * 0.5, b, top, -Z * 0.5, Z * 0.5, true);
      box(-X, X, a - 0.5, a, -Z, Z, false); box(-X * 0.14, X * 0.14, top, top + h * 0.12, -Z * 0.14, Z * 0.14, false); box(-X * 0.05, X * 0.05, top + h * 0.12, top + h * 0.22, -Z * 0.05, Z * 0.05, false);
    } else if (style === 2) {   // brick apartments: cornice, stair bulkhead, water tank on legs
      box(-X, X, 0, top, -Z, Z, true); box(-X - 0.35, X + 0.35, top - 0.7, top, -Z - 0.35, Z + 0.35, false);
      box(-X * 0.5, -X * 0.1, top, top + 2.6, -Z * 0.3, Z * 0.2, false);
      const tx = X * 0.35, tz = -Z * 0.2; for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(tx + sx * 0.8 - 0.08, tx + sx * 0.8 + 0.08, top, top + 1.8, tz + sz * 0.8 - 0.08, tz + sz * 0.8 + 0.08, false);
      box(tx - 1.05, tx + 1.05, top + 1.8, top + 4.2, tz - 1.05, tz + 1.05, false);
    } else if (style === 3) {   // office: parapet and a field of plant
      box(-X, X, 0, top, -Z, Z, true); box(-X, X, top, top + 0.9, -Z, -Z + 0.3, false); box(-X, X, top, top + 0.9, Z - 0.3, Z, false); box(-X, -X + 0.3, top, top + 0.9, -Z, Z, false); box(X - 0.3, X, top, top + 0.9, -Z, Z, false);
      for (let k = 0; k < 3; k++) { const px = (r() - 0.5) * w * 0.6, pz = (r() - 0.5) * d * 0.6, s = 0.8 + r() * 1.2; box(px - s, px + s, top, top + 1 + r() * 1.6, pz - s * 0.7, pz + s * 0.7, false); }
    } else if (style === 4) {   // slab block: balconies along the long faces
      box(-X, X, 0, top, -Z, Z, true); const long = w >= d;
      for (let y = FLOOR; y < top - 1; y += FLOOR * 2) { if (long) { box(-X * 0.9, X * 0.9, y, y + 1.0, Z, Z + 0.9, false); box(-X * 0.9, X * 0.9, y, y + 1.0, -Z - 0.9, -Z, false); } else { box(X, X + 0.9, y, y + 1.0, -Z * 0.9, Z * 0.9, false); box(-X - 0.9, -X, y, y + 1.0, -Z * 0.9, Z * 0.9, false); } }
      box(-X * 0.25, X * 0.25, top, top + 2.4, -Z * 0.4, Z * 0.4, false);
    } else {                    // podium and tower
      const ph = Math.min(top * 0.3, 12), ox = (r() - 0.5) * X * 0.5;
      box(-X, X, 0, ph, -Z, Z, true); box(ox - X * 0.6, ox + X * 0.6, ph, top, -Z * 0.7, Z * 0.7, true); box(ox - X * 0.6, ox + X * 0.6, top, top + 1.2, -Z * 0.7, -Z * 0.7 + 0.3, false); box(ox - X * 0.2, ox + X * 0.2, top, top + 3, -Z * 0.2, Z * 0.2, false);
    }
    return { F, T };
  }
  function toGeo(F, T) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(F.p.concat(T.p), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(F.u.concat(T.u), 2));
    g.addGroup(0, F.p.length / 3, 0); g.addGroup(F.p.length / 3, T.p.length / 3, 1);
    g.computeVertexNormals();
    return g;
  }

  function kit(E, seed = 1) {
    const tex = facades(E, 900 + seed);
    const trim = [E.lin('#2a2d33'), E.lin('#4a463e'), E.lin('#3a2620'), E.lin('#5a5a58'), E.lin('#6a665e'), E.lin('#20252c')];
    const mats = tex.map(([day, lit], i) => {
      const f = new THREE.MeshStandardMaterial({ map: day, emissiveMap: lit, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0.5, roughness: i === 0 || i === 5 ? 0.35 : 0.85, metalness: i === 0 || i === 5 ? 0.3 : 0 });
      const t = new THREE.MeshStandardMaterial({ color: trim[i], roughness: 0.9 });
      f.userData.lin = t.userData.lin = true;
      return [f, t];
    });
    // tall things lean towards towers, low things towards blocks
    const pick = (h, r) => { const k = r(); return h > 45 ? (k < 0.38 ? 0 : k < 0.62 ? 1 : k < 0.82 ? 5 : 3) : h > 20 ? (k < 0.2 ? 0 : k < 0.36 ? 1 : k < 0.56 ? 3 : k < 0.76 ? 4 : k < 0.9 ? 5 : 2) : (k < 0.42 ? 2 : k < 0.7 ? 3 : k < 0.9 ? 4 : 5); };
    return {
      mats,
      mesh(w, h, d, r, style) {
        const s = style === undefined ? pick(h, r) : style, { F, T } = shape(s, w, d, h, r), m = new THREE.Mesh(toGeo(F, T), mats[s]);
        m.scale.y = h; m.userData.style = s;
        return m;
      },
      bake(list, r) {
        const acc = mats.map(() => ({ F: { p: [], u: [] }, T: { p: [], u: [] } })), g = new THREE.Group();
        for (const b of list) {
          const s = pick(b.h, r), { F, T } = shape(s, b.w, b.d, b.h, r), c = Math.cos(b.yaw || 0), sn = Math.sin(b.yaw || 0);
          for (const [src, dst] of [[F, acc[s].F], [T, acc[s].T]]) {
            for (let i = 0; i < src.p.length; i += 3) { const x = src.p[i], z = src.p[i + 2]; dst.p.push(b.x + x * c + z * sn, src.p[i + 1] * b.h, b.z - x * sn + z * c); }
            for (let i = 0; i < src.u.length; i++) dst.u.push(src.u[i]);
          }
        }
        acc.forEach((a, s) => { if (!a.F.p.length) return; const m = new THREE.Mesh(toGeo(a.F, a.T), mats[s]); m.frustumCulled = false; g.add(m); });
        return g;
      },
      glow(v) { for (const [f] of mats) f.emissiveIntensity = v; },
    };
  }

  SW.Buildings = { kit };
})();
