// Repack the people models for the game. Every one of them has the same skeleton (the same bone names), so the clips
// need to be shipped only once: name=file.glb keeps the body and drops its clips, name=file.glb+ keeps the clips too
// (all of them). Bytes nothing points at any more are dropped.
// node tools/pack-people.mjs <src dir> <out dir> name=file.glb[+] ...
// The models are Quaternius's "Ultimate Modular" men and women (CC0), from Poly Pizza.
import fs from 'fs';
import path from 'path';

function readGlb(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(file + ': not a GLB');
  let o = 12, json = null, bin = null;
  while (o < b.length) {
    const len = b.readUInt32LE(o), type = b.readUInt32LE(o + 4), data = b.subarray(o + 8, o + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8')); else if (type === 0x004e4942) bin = data;
    o += 8 + len;
  }
  return { json, bin };
}

function writeGlb(file, json, bin) {
  const pad = (buf, c) => (buf.length % 4 ? Buffer.concat([buf, Buffer.alloc(4 - (buf.length % 4), c)]) : buf);
  const j = pad(Buffer.from(JSON.stringify(json), 'utf8'), 0x20), d = pad(bin, 0);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + j.length + 8 + d.length, 8);
  const ch = (len, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(len, 0); h.writeUInt32LE(type, 4); return h; };
  fs.writeFileSync(file, Buffer.concat([head, ch(j.length, 0x4e4f534a), j, ch(d.length, 0x004e4942), d]));
}

// Smaller vertices, same look: bone indices and weights in a byte each (core glTF), normals in a signed byte each
// (KHR_mesh_quantization, padded to four bytes a vertex). Positions stay floats: a skinned mesh's own node transform is
// ignored, so there is nowhere to put the scale that quantized positions need.
function quantize(json, bin) {
  const F = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
  const N = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const read = (a) => {   // an accessor's values as plain numbers, a row per element
    const bv = json.bufferViews[a.bufferView], [T, sz] = F[a.componentType], n = N[a.type], stride = bv.byteStride || sz * n, base = (bv.byteOffset || 0) + (a.byteOffset || 0), out = [];
    for (let i = 0; i < a.count; i++) { const row = []; for (let k = 0; k < n; k++) { const o = bin.byteOffset + base + i * stride + k * sz; row.push(new T(bin.buffer.slice(o, o + sz))[0]); } out.push(row); }
    return out;
  };
  const view = (data, stride) => { json.bufferViews.push({ buffer: 0, byteLength: data.length, ...(stride ? { byteStride: stride } : {}), target: 34962, _data: data }); return json.bufferViews.length - 1; };
  const done = new Map();   // accessors shared by several primitives are converted once
  let usedExt = false;
  for (const m of json.meshes || []) for (const p of m.primitives) {
    for (const key of ['JOINTS_0', 'WEIGHTS_0', 'NORMAL']) {
      const ai = p.attributes[key]; if (ai === undefined) continue;
      if (done.has(ai)) { p.attributes[key] = done.get(ai); continue; }
      const a = json.accessors[ai], rows = read(a), n = rows.length;
      let acc;
      if (key === 'JOINTS_0') {
        if (rows.some((r) => r.some((v) => v > 255))) continue;
        const d = Buffer.alloc(n * 4); rows.forEach((r, i) => r.forEach((v, k) => d.writeUInt8(v, i * 4 + k)));
        acc = { bufferView: view(d, 4), componentType: 5121, count: n, type: 'VEC4' };
      } else if (key === 'WEIGHTS_0') {
        const d = Buffer.alloc(n * 4);
        rows.forEach((r, i) => { const s = r.reduce((x, y) => x + y, 0) || 1, q = r.map((v) => Math.round((v / s) * 255)); let big = 0; q.forEach((v, k) => { if (v > q[big]) big = k; }); q[big] += 255 - q.reduce((x, y) => x + y, 0); q.forEach((v, k) => d.writeUInt8(Math.max(0, Math.min(255, v)), i * 4 + k)); });
        acc = { bufferView: view(d, 4), componentType: 5121, normalized: true, count: n, type: 'VEC4' };
      } else {
        const d = Buffer.alloc(n * 4); rows.forEach((r, i) => { const l = Math.hypot(...r) || 1; r.forEach((v, k) => d.writeInt8(Math.max(-127, Math.min(127, Math.round((v / l) * 127))), i * 4 + k)); });
        acc = { bufferView: view(d, 4), componentType: 5120, normalized: true, count: n, type: 'VEC3' }; usedExt = true;
      }
      json.accessors.push(acc); done.set(ai, json.accessors.length - 1); p.attributes[key] = json.accessors.length - 1;
    }
  }
  // clips: rotations as normalized shorts (core glTF allows it for rotation outputs); times and translations stay floats
  for (const an of json.animations || []) for (const ch of an.channels) {
    if (ch.target.path !== 'rotation') continue;
    const s = an.samplers[ch.sampler]; if (done.has('r' + s.output)) { s.output = done.get('r' + s.output); continue; }
    const a = json.accessors[s.output]; if (a.componentType !== 5126) continue;
    const rows = read(a), d = Buffer.alloc(rows.length * 8);
    rows.forEach((r, i) => r.forEach((v, k) => d.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), i * 8 + k * 2)));
    json.bufferViews.push({ buffer: 0, byteLength: d.length, _data: d }); json.accessors.push({ bufferView: json.bufferViews.length - 1, componentType: 5122, normalized: true, count: rows.length, type: 'VEC4' });
    done.set('r' + s.output, json.accessors.length - 1); s.output = json.accessors.length - 1;
  }
  if (usedExt) for (const k of ['extensionsUsed', 'extensionsRequired']) json[k] = [...new Set([...(json[k] || []), 'KHR_mesh_quantization'])];
}

function pack(src, out, clips) {
  const { json, bin } = readGlb(src);
  if (!clips) json.animations = [];
  json.animations = json.animations || [];
  quantize(json, bin);
  // every accessor still in use
  const used = new Set(), use = (i) => { if (i !== undefined) used.add(i); };
  for (const m of json.meshes || []) for (const p of m.primitives) { Object.values(p.attributes).forEach(use); use(p.indices); (p.targets || []).forEach((t) => Object.values(t).forEach(use)); }
  for (const s of json.skins || []) use(s.inverseBindMatrices);
  for (const a of json.animations) for (const s of a.samplers) { use(s.input); use(s.output); }
  // copy the buffer views they sit in, in order, into a fresh buffer
  const views = [...new Set([...used].map((i) => json.accessors[i].bufferView))].sort((a, b) => a - b), vmap = new Map(), parts = [], newViews = [];
  let off = 0;
  for (const v of views) {
    const { _data, ...bv } = json.bufferViews[v], data = _data || bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    const padN = (4 - (off % 4)) % 4; if (padN) { parts.push(Buffer.alloc(padN)); off += padN; }
    vmap.set(v, newViews.length); newViews.push({ ...bv, buffer: 0, byteOffset: off, byteLength: data.length }); parts.push(data); off += data.length;
  }
  const amap = new Map(), newAcc = [];
  for (const i of [...used].sort((a, b) => a - b)) { amap.set(i, newAcc.length); newAcc.push({ ...json.accessors[i], bufferView: vmap.get(json.accessors[i].bufferView) }); }
  const ra = (i) => (i === undefined ? undefined : amap.get(i));
  for (const m of json.meshes || []) for (const p of m.primitives) { for (const k in p.attributes) p.attributes[k] = ra(p.attributes[k]); if (p.indices !== undefined) p.indices = ra(p.indices); (p.targets || []).forEach((t) => { for (const k in t) t[k] = ra(t[k]); }); }
  for (const s of json.skins || []) if (s.inverseBindMatrices !== undefined) s.inverseBindMatrices = ra(s.inverseBindMatrices);
  for (const a of json.animations) for (const s of a.samplers) { s.input = ra(s.input); s.output = ra(s.output); }
  json.accessors = newAcc; json.bufferViews = newViews;
  const nb = Buffer.concat(parts); json.buffers = [{ byteLength: nb.length }];
  writeGlb(out, json, nb);
  return { clips: json.animations.map((a) => a.name.split('|').pop()), kb: Math.round(fs.statSync(out).size / 1024) };
}

const [srcDir, outDir, ...pairs] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
for (const p of pairs) { const [name, f] = p.split('='), clips = f.endsWith('+'), file = clips ? f.slice(0, -1) : f; console.log(name, pack(path.join(srcDir, file), path.join(outDir, name + '.glb'), clips)); }
