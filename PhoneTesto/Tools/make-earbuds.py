# Makes Resources/models/earbuds.glb from the source model (see Resources/models/LICENSES.txt):
#   blender -b --factory-startup -P Tools/make-earbuds.py -- source.glb Resources/models/earbuds.glb
# The source is a first-generation AirPod, the same shell as the wired EarPods. What changes: the metal
# charging ring is taken off and the stem closed, the light sensors are closed, the slots near the
# stem's end are added, the surface is evened out, and it's scaled to life (metres, head at the origin).
import bpy, bmesh, sys, math
from mathutils import Vector as V
src, out = sys.argv[sys.argv.index("--") + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
parts = {o.name: o for o in bpy.data.objects if o.type == "MESH"}
S = 0.18 / 1000                      # the source is 225 units tall, the real one 40.5 mm
C = V((91.0, -22.0, 52.0))           # the middle of the head

def load(o):
    bm = bmesh.new(); bm.from_mesh(o.data); bm.transform(o.matrix_world)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.01); return bm

def islands(bm):
    seen, res = set(), []
    for v in bm.verts:
        if v in seen: continue
        stack, grp = [v], []; seen.add(v)
        while stack:
            x = stack.pop(); grp.append(x)
            for e in x.link_edges:
                y = e.other_vert(x)
                if y not in seen: seen.add(y); stack.append(y)
        res.append(grp)
    return res

# the shell: close the stem's end, even the surface out (the openings' rims stay put)
shell = load(parts["Object_4"])
end = min(v.co.z for v in shell.verts)
rim = [e for e in shell.edges if e.is_boundary and all(v.co.z < end + 8 for v in e.verts)]
bmesh.ops.holes_fill(shell, edges=rim, sides=0)
cap = [f for f in shell.faces if all(v.co.z < end + 8 for v in f.verts) and len(f.verts) > 4]
bmesh.ops.triangulate(shell, faces=cap)
# the light sensors' and the microphone's holes: closed
SENSORS = [V((131, 18.6, 27)), V((109.5, -48, 52.4)), V((63, -52.6, 52.6))]
for c in SENSORS:
    es = [e for e in shell.edges if e.is_boundary and all((v.co - c).length < 9 for v in e.verts)]
    r = bmesh.ops.holes_fill(shell, edges=es, sides=0)
    r = bmesh.ops.triangulate(shell, faces=r["faces"])
    bmesh.ops.subdivide_edges(shell, edges=list({e for f in r["faces"] for e in f.edges if not any(len(g.verts) and g not in r["faces"] for g in e.link_faces)}), cuts=2)
bmesh.ops.triangulate(shell, faces=[f for f in shell.faces if len(f.verts) > 3])
# even the scan's ripple out (the last passes without shrinking: Taubin), rims held
shell.verts.ensure_lookup_table()
hold = {v for v in shell.verts if v.is_boundary or v.co.z < -100}
for k in range(80):
    for lam in (0.6,) if k < 34 else (0.6, -0.62):
        new = {v: v.co + lam * (sum((e.other_vert(v).co for e in v.link_edges), V()) / len(v.link_edges) - v.co) for v in shell.verts if v not in hold and v.link_edges}
        for v, p in new.items(): v.co = p
# then settle the stretch between the rims and the rest
for _ in range(3):
    bmesh.ops.smooth_vert(shell, verts=[v for v in shell.verts if v not in hold], factor=0.4, use_axis_x=True, use_axis_y=True, use_axis_z=True)
bmesh.ops.recalc_face_normals(shell, faces=shell.faces)
ringv = [v.co for v in shell.verts if -100 < v.co.z < -60]
cx, cy = (sum(p[i] for p in ringv) / len(ringv) for i in (0, 1))
R = sum(math.hypot(p.x - cx, p.y - cy) for p in ringv) / len(ringv)
print("STEM", cx, cy, R, end)

openings = load(parts["Object_3"])
dark, white = bmesh.new(), []
drop = []
for grp in islands(openings):
    lo = V([min(v.co[i] for v in grp) for i in range(3)]); hi = V([max(v.co[i] for v in grp) for i in range(3)])
    faces = {f for v in grp for f in v.link_faces}
    size = (hi - lo).length
    if hi.z < -100: drop += grp                                  # the charging ring
    elif size < 16 and lo.z < 60: drop += grp                    # the sensors and the microphone (their holes are closed above)
    else: print("DARK", lo, hi)
bmesh.ops.delete(openings, geom=drop, context="VERTS")

# the slots near the stem's end: stadiums laid on the stem's sides
h, w, zc = 17.0, 3.6, end + 24
def at(u, t, a0):
    a = a0 + u / R; return V((cx + (R + 0.12) * math.cos(a), cy + (R + 0.12) * math.sin(a), zc + t))
pts = []
for k in range(12): b = math.pi * k / 11; pts.append((w / 2 * math.cos(b), h / 2 - w / 2 + w / 2 * math.sin(b)))
for k in range(12): b = math.pi + math.pi * k / 11; pts.append((w / 2 * math.cos(b), -h / 2 + w / 2 + w / 2 * math.sin(b)))
for a0 in (0.12, math.pi - 0.12):                                # one on either side
    openings.faces.new([openings.verts.new(at(u, t, a0)) for u, t in pts])

def make(name, bm, mats):
    bmesh.ops.triangulate(bm, faces=bm.faces)
    for v in bm.verts: v.co = (v.co - C) * S
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    if name == "shell":                                          # and the shading with it
        near = [[] for _ in me.vertices]
        for e in me.edges: a, b = e.vertices; near[a].append(b); near[b].append(a)
        rim = set()
        count = {}
        for p in me.polygons:
            for k in p.edge_keys: count[k] = count.get(k, 0) + 1
        for k, c in count.items():
            if c == 1: rim.update(k)
        ns = [v.normal.copy() for v in me.vertices]
        for _ in range(10):
            ns = [n if i in rim or me.vertices[i].co.z < -0.027 else (n + sum((ns[j] for j in near[i]), V())).normalized() for i, n in enumerate(ns)]
        me.normals_split_custom_set_from_vertices(ns)
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); return o
for o in list(parts.values()): bpy.data.objects.remove(o)
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
mw, md = bpy.data.materials.new("shell"), bpy.data.materials.new("opening")
make("shell", shell, [mw]); make("openings", openings, [md])
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_texcoords=False, export_yup=True, export_apply=True)
