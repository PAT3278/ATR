# Makes the room's device models (Resources/models/*.glb) from their sources (see Resources/models/LICENSES.txt):
#   blender -b --factory-startup -P Tools/make-models.py -- <folder of source .glb files> Resources/models
# Every part is sorted into a few kinds (frame, back, glass, lens ...) that the page gives its own materials;
# screens, brand logos and invisible glass are left out. Units are metres. Phones and the tablet lie on their long
# side: +x is the top of the device, +z is where the screen faces, centred on the body.
# Positions and normals are quantised (KHR_mesh_quantization) to keep the files small.
import bpy, sys, os, json, struct, re
import numpy as np
from mathutils import Vector as V

src, out = sys.argv[sys.argv.index("--") + 1:][:2]

def rules(text):
    r = {}
    for line in text.strip().splitlines():
        kind, names = line.split(":"); r.update({n: kind.strip() for n in names.split()})
    return r

# material name (or its start) -> kind; "-" leaves it out
MODELS = {
    "se": dict(src="se3", face=1, length=0.1384, rules=rules("""
        frame: aiStandardSurface1
        -: aiStandardSurface2 Screen
        glass: BlackBase
        lens: Camera glasscamera
        steel: HomeButtonRim
        dark: lambert1 material"""), body="frame"),
    "11": dict(src="e11a", face=1, length=0.1509, rules=rules("""
        frame: rjZBcw lAnura XQgLyq
        line: daWPeT uYkxRu
        back: cpCRQJ
        bump: iqBhVD
        glass: TUrpJV ziZYLn
        lens: AmkcDM fKEoCd oqOsVy
        flash: GxwCmS ymzWHU ZOYWNb
        dark: ImsTha NVpZoG OtTboX hrISjd dgrLaH kwzRnY jahfiZ QAroVn
        -: zxfwxK HeITAT UKcVVy duQyXw duwmJx YmmlbdY uoUyWE"""), body="frame"),
    "13": dict(src="e13a", face=-1, length=0.1467, rules=rules("""
        frame: side_metal_ip
        back: body_utama_ip back_metal_ip
        line: white_mark
        glass: side_display_ip
        lens: lens camera_ip_2
        flash: light_ip_back
        steel: screww_ip
        dark: cam_black_ip cam_blk_ip blk_ip inside_down_ip ip_speaker_blk
        -: metallic_ip_logo kaca_cam_ip display_ip side_display_ip_2"""), body="frame"),
    "pro": dict(src="pro15", face=1, length=0.1466, rules=rules("""
        frame: bPkZQE lxyVil
        back: BUMSUc
        line: NcddIg UfLjSE
        bump: wvXBYk
        glass: CyhGvh
        screen: ZVpJka
        lens: XXuRSp DDTdMX vTiNuz ldlWJW JzwaDH nZERQg
        flash: bUGYdG nYXuzw
        steel: gDILPb Xeoexk cJikWZ
        dark: UMOyvm bkznUI OToSlI yCRJxq sBkPLo sZHQmI RsYjwd BIXrNI otyzQK Ktouhv WzoAyW tsbwpb fbSneR HIKssM
        -: bJOIXY WwsbjW lIkeUC jVNrbG FnknNy jaAOvx RrnnSe XoueRD"""), body="frame"),
    "android": dict(src="px", face=1, length=0.1620, rules=rules("""
        frame: Frame
        line: Antennas
        back: BackBottom Backtop
        glass: Bezel CamModule CamModuleBlack
        lens: Lens
        flash: Flash
        dark: CamGray Mic2 Sensor material
        -: Logo Screen CamGlass"""), body="frame"),
    "budget": dict(src="bud1", face=1, length=0.1645, skip=True, rules=rules("""
        frame: metal
        back: aiStandardSurface8
        glass: black_glass
        dark: black_plastic lambert1
        lens: reflective_glass
        -: glass screen"""), body="frame"),
    "tablet": dict(src="ipad1", face=1, length=0.1954, rules=rules("""
        frame: BaseColor
        line: BaseColorMatte
        dark: CamGray SpeakerMic Cam1 Port CamBlack
        lens: Lens
        flash: Flash
        glass: Bezel
        -: BaseColorLogo Screen CamGlass"""), body="frame"),
    "laptop": dict(src="mbp1", rules=rules("""
        frame: hPcehR zqeFZc
        pad: pZbDXF
        key: IlNnjE
        well: zWLcvv
        legend: NQXltf
        glass: fiqlel SELupp
        dark: mpJhsa lbGSuJ VfcxYm VqwNZw initialShadingGroup iPZiEn jRMWtd
        -: SKOFti ZpTrUi UpOvKw BczvixN"""), other=True),
    "monitor": dict(src="hs5", colours=True, rules=rules("""
        case: lambert2SG""")),
}

def kind_of(m, cfg):
    best = None
    for n, k in cfg["rules"].items():
        if m.name == n or (len(n) >= 6 and m.name.startswith(n)) or m.name.split(".")[0] == n:
            if best is None or len(n) > len(best[0]): best = (n, k)
    if best: return best[1]
    if cfg.get("other"):                                             # a laptop has many small parts: by how bright they are
        b = next((x for x in m.node_tree.nodes if x.type == "BSDF_PRINCIPLED"), None)
        if b: return "dark" if sum(b.inputs["Base Color"].default_value[:3]) / 3 < 0.2 else "steel"
    return None

def texture(m, socket="Base Color"):
    b = next(x for x in m.node_tree.nodes if x.type == "BSDF_PRINCIPLED")
    todo = [l.from_node for l in m.node_tree.links if l.to_node == b and l.to_socket.name == socket]
    while todo:
        n = todo.pop()
        if n.type == "TEX_IMAGE" and n.image:
            w, h = n.image.size; px = np.empty(w * h * 4, np.float32); n.image.pixels.foreach_get(px); return px.reshape(h, w, 4)
        todo += [l.from_node for l in m.node_tree.links if l.to_node == n]
    return None

def write_glb(path, parts, extras):
    """parts: {kind: (pos Nx3, nrm Nx3, col Nx3 or None, idx M)}"""
    js = {"asset": {"version": "2.0", "generator": "Tools/make-models.py"}, "extensionsUsed": ["KHR_mesh_quantization"], "extensionsRequired": ["KHR_mesh_quantization"],
          "scene": 0, "scenes": [{"nodes": []}], "nodes": [], "meshes": [], "materials": [], "accessors": [], "bufferViews": [], "buffers": [], "extras": extras}
    data = bytearray()
    def view(b, target, stride=None):
        while len(data) % 4: data.append(0)
        v = {"buffer": 0, "byteOffset": len(data), "byteLength": len(b), "target": target}
        if stride: v["byteStride"] = stride
        data.extend(b); js["bufferViews"].append(v); return len(js["bufferViews"]) - 1
    for kind, (pos, nrm, col, idx) in sorted(parts.items()):
        lo, hi = pos.min(0), pos.max(0); size = float(max((hi - lo).max(), 1e-6))
        q = np.zeros((len(pos), 4), np.uint16); q[:, :3] = np.round((pos - lo) / size * 65535)
        n = np.zeros((len(pos), 4), np.int8); n[:, :3] = np.round(np.clip(nrm, -1, 1) * 127)
        at = {}
        def acc(v, ct, typ, count, **kw): js["accessors"].append({"bufferView": v, "componentType": ct, "type": typ, "count": count, **kw}); return len(js["accessors"]) - 1
        at["POSITION"] = acc(view(q.tobytes(), 34962, 8), 5123, "VEC3", len(pos), normalized=True, min=[0, 0, 0], max=[float(x) for x in q[:, :3].max(0) / 65535])
        at["NORMAL"] = acc(view(n.tobytes(), 34962, 4), 5120, "VEC3", len(pos), normalized=True)
        if col is not None:
            c = np.full((len(pos), 4), 255, np.uint8); c[:, :3] = np.round(np.clip(col, 0, 1) * 255)
            at["COLOR_0"] = acc(view(c.tobytes(), 34962, 4), 5121, "VEC4", len(pos), normalized=True)
        big = len(pos) > 65535
        ii = acc(view(idx.astype(np.uint32 if big else np.uint16).tobytes(), 34963), 5125 if big else 5123, "SCALAR", len(idx))
        js["materials"].append({"name": kind}); js["meshes"].append({"name": kind, "primitives": [{"attributes": at, "indices": ii, "material": len(js["materials"]) - 1}]})
        js["nodes"].append({"name": kind, "mesh": len(js["meshes"]) - 1, "translation": [float(x) for x in lo], "scale": [size] * 3}); js["scenes"][0]["nodes"].append(len(js["nodes"]) - 1)
    while len(data) % 4: data.append(0)
    js["buffers"] = [{"byteLength": len(data)}]
    j = json.dumps(js, separators=(",", ":")).encode(); j += b" " * (-len(j) % 4)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(j) + 8 + len(data)) + struct.pack("<II", len(j), 0x4E4F534A) + j + struct.pack("<II", len(data), 0x004E4942) + data)

for name, cfg in MODELS.items():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(src, cfg["src"] + ".glb"))
    got, missed, extras = {}, {}, {}
    for o in [o for o in bpy.data.objects if o.type == "MESH"]:
        if "skip" in cfg and re.search(r"\.(0|00|001|0\.001)?$", o.name): continue
        me = o.data; me.calc_loop_triangles()
        m = me.materials[0] if me.materials else None
        k = kind_of(m, cfg) if m else None
        co = np.array([(o.matrix_world @ v.co)[:] for v in me.vertices])
        if k is None: missed[m.name if m else None] = len(me.polygons); continue
        if k == "screen" or m.name.startswith(("UpOvKw", "Screen", "display_ip", "UKcVVy", "NwYyqD", "screen")) or o.name.startswith("Screen"):
            extras.setdefault("_screen", []).append(co)
        if k in ("-", "screen"): continue
        nm = o.matrix_world.to_3x3().inverted().transposed()
        cn = np.array([(nm @ V(c.vector)).normalized()[:] for c in me.corner_normals])
        tl = np.array([t.loops[:] for t in me.loop_triangles]).reshape(-1); tv = np.array([t.vertices[:] for t in me.loop_triangles]).reshape(-1)
        if o.matrix_world.determinant() < 0: tl = tl.reshape(-1, 3)[:, ::-1].reshape(-1); tv = tv.reshape(-1, 3)[:, ::-1].reshape(-1)
        col = None
        if cfg.get("colours"):
            px = texture(m); uv = np.array([l.uv[:] for l in me.uv_layers[0].data])[tl]
            h, w = px.shape[:2]; col = px[(uv[:, 1] % 1 * (h - 1)).astype(int), (uv[:, 0] % 1 * (w - 1)).astype(int), :3]
            glow = texture(m, "Emission Color")
            if glow is not None: col = np.maximum(col, glow[(uv[:, 1] % 1 * (h - 1)).astype(int) * glow.shape[0] // h, (uv[:, 0] % 1 * (w - 1)).astype(int) * glow.shape[1] // w, :3])
        got.setdefault(k, []).append((co[tv], cn[tl], col))
    if missed: print("UNSORTED", name, missed)
    if "face" in cfg:                                                # phones and the tablet
        up, n = np.array([0, 0, 1.0]), np.array([0, cfg["face"] * 1.0, 0]); ax = np.stack([up, np.cross(n, up), n])
        body = np.concatenate([p for p, _, _ in got[cfg["body"]]]) @ ax.T
        # (buttons stick out and camera rims rise: the body's own size is where most of it is)
        lo, hi = body.min(0), body.max(0); s = cfg["length"] / (hi[0] - lo[0])
        if "glass" in got:
            g = np.concatenate([p for p, _, _ in got["glass"]]) @ ax.T; top = np.percentile(g[:, 2], 99.5)
        else: top = hi[2]
        front = max(hi[2], g[:, 2].max()); mid = (lo + hi) / 2
        pts = np.abs(body[:, 1] - mid[1]); ymid = mid[1]
        glassy = g[g[:, 2] > front - 0.004 * (hi[0] - lo[0])]
        ymid = (glassy[:, 1].min() + glassy[:, 1].max()) / 2; xmid = (lo[0] + hi[0]) / 2
        origin = np.array([xmid, ymid, 0]);
        back = np.percentile(body[:, 2], 2); origin[2] = (front + back) / 2
        f = lambda p: (p @ ax.T - origin) * s
        fn = lambda q: q @ ax.T
        gl = (glassy - origin) * s
        extras2 = {"front": float((front - origin[2]) * s), "glass": [float(x) for x in (gl[:, 0].min(), gl[:, 1].min(), gl[:, 0].max(), gl[:, 1].max())],
                   "body": [float(x) for x in ((lo - origin) * s).tolist() + ((hi - origin) * s).tolist()]}
        if "_screen" in extras:
            sc = (np.concatenate(extras["_screen"]) @ ax.T - origin) * s; extras2["screen"] = [float(x) for x in (sc[:, 0].min(), sc[:, 1].min(), sc[:, 0].max(), sc[:, 1].max())]
    else:
        allp = np.concatenate([p for l in got.values() for p, _, _ in l]); lo, hi = allp.min(0), allp.max(0)
        ax = np.array([[1.0, 0, 0], [0, 0, 1], [0, -1, 0]])                # right, up, toward the front
        s = {"laptop": 0.3126, "monitor": 0.17}[name] / (hi[0] - lo[0])
        origin = np.array([(lo[0] + hi[0]) / 2, lo[2], -(lo[1] + hi[1]) / 2 if name == "monitor" else 0.0])
        f = lambda p: (p @ ax.T - origin) * s
        fn = lambda q: q @ ax.T
        extras2 = {"size": [float(x) for x in (hi - lo) * s]}
        if "_screen" in extras:                                       # the lid's screen: its corners in its own plane
            sc = f(np.concatenate(extras["_screen"])); c = sc.mean(0); up = sc[sc[:, 1].argmax()] - sc[sc[:, 1].argmin()]; up[0] = 0; up /= np.linalg.norm(up)
            u, w = sc[:, 0], (sc - c) @ up
            extras2["screen"] = {"w": float(u.max() - u.min()), "h": float(w.max() - w.min()), "up": up.tolist(), "centre": (c + up * float((w.max() + w.min()) / 2)).tolist()}
    if name == "monitor":                                             # its cone moves on its own; the badge below it is painted over
        P = np.concatenate([f(p) for p, _, _ in got["case"]]); N = np.concatenate([q for _, q, _ in got["case"]]); C = np.concatenate([c for _, _, c in got["case"]])
        front = P[:, 2] > np.percentile(P[:, 2], 99) - 0.03; white = front & (C.min(1) > 0.8) & (np.abs(P[:, 0]) < 0.05) & (P[:, 1] > 0.05) & (P[:, 1] < 0.17)
        c0 = np.median(P[white], 0); r = np.percentile(np.hypot(P[white][:, 0] - c0[0], P[white][:, 1] - c0[1]), 98) + 0.0005
        C[~(np.hypot(P[:, 0], P[:, 1] - c0[1]) < r * 1.02)] = np.minimum(C[~(np.hypot(P[:, 0], P[:, 1] - c0[1]) < r * 1.02)], 0.2)
        tri = P.reshape(-1, 3, 3); m = np.repeat(((np.hypot(tri[:, :, 0], tri[:, :, 1] - c0[1]) < r).all(1)) & (tri[:, :, 2] > P[:, 2].max() - 0.05).all(1), 3)
        f = lambda p: p
        got = {"case": [(P[~m], N[~m], C[~m])], "woofer": [(P[m], N[m], C[m])]}; print("CONE", c0, r, int(m.sum() // 3))
    parts = {}
    for k, l in got.items():
        P = np.concatenate([f(p) for p, _, _ in l]); N = np.concatenate([fn(q) for _, q, _ in l]); C = np.concatenate([c for _, _, c in l]) if l[0][2] is not None else None
        key = [np.round(P * 2e6).astype(np.int64), np.round(N * 60).astype(np.int64)]
        if C is not None: key.append(np.round(C * 40).astype(np.int64))
        _, first, inv = np.unique(np.concatenate(key, 1), axis=0, return_index=True, return_inverse=True)
        parts[k] = (P[first], N[first], None if C is None else C[first], inv.reshape(-1))
    path = os.path.join(out, name + ".glb"); write_glb(path, parts, extras2)
    print("WROTE", name, os.path.getsize(path) // 1024, "KB", sum(len(p[3]) // 3 for p in parts.values()), "tris", {k: len(p[3]) // 3 for k, p in parts.items()}); print("  INFO", json.dumps(extras2))
