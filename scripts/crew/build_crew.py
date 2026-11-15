#!/usr/bin/env python3
"""
Build two rigged crew characters for the Lunaspis project.

Run headless:
    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
        --python scripts/crew/build_crew.py -- [--no-render]

Outputs:
    public/models/crew/crew_a.glb
    public/models/crew/crew_b.glb
    scripts/crew/crew_characters.blend
    scripts/crew/previews/*.png

The characters are ~1.90 m / 1.77 m tall, face -Y in Blender (+Z after glTF
Y-up conversion), stand with their feet on Z=0, and share the bone naming
convention used by the existing astronaut GLBs:

    hips, spine, spine1, chest, neck, head,
    shoulder_L/R, upperarm_L/R, forearm_L/R, hand_L/R,
    thigh_L/R, calf_L/R, foot_L/R, toe_L/R

Animation clips: idle, walk, look_around, wave.
"""

import bpy
import bmesh
import math
import os
import sys
from math import radians, sin, cos, pi
from mathutils import Vector, Matrix, Quaternion

# ---------------------------------------------------------------------------
# Paths / CLI
# ---------------------------------------------------------------------------

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT_DIR = os.path.join(ROOT, "public", "models", "crew")
PREV_DIR = os.path.join(HERE, "previews")
BLEND_PATH = os.path.join(HERE, "crew_characters.blend")
os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(PREV_DIR, exist_ok=True)

_argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
DO_RENDER = "--no-render" not in _argv
QUICK = "--quick" in _argv

# ---------------------------------------------------------------------------
# Scene helpers
# ---------------------------------------------------------------------------

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1.0
scene.render.fps = 30

CHAR_COLL = bpy.data.collections.new("CHARACTERS")
scene.collection.children.link(CHAR_COLL)
PREVIEW_COLL = bpy.data.collections.new("PREVIEW")
scene.collection.children.link(PREVIEW_COLL)


def activate_collection(col):
    def find(lc):
        if lc.collection == col:
            return lc
        for child in lc.children:
            hit = find(child)
            if hit:
                return hit
        return None
    match = find(bpy.context.view_layer.layer_collection)
    if match:
        bpy.context.view_layer.active_layer_collection = match


activate_collection(CHAR_COLL)


def deselect_all():
    for ob in bpy.context.view_layer.objects:
        ob.select_set(False)


def select_only(objs):
    deselect_all()
    for ob in objs:
        ob.select_set(True)
    if objs:
        bpy.context.view_layer.objects.active = objs[0]


def apply_transform(obj):
    select_only([obj])
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def join_objects(objs, name):
    objs = [o for o in objs if o is not None]
    if not objs:
        return None
    if len(objs) == 1:
        objs[0].name = name
        return objs[0]
    select_only(objs)
    bpy.ops.object.join()
    result = bpy.context.view_layer.objects.active
    result.name = name
    return result


def apply_modifier(obj, mod):
    select_only([obj])
    bpy.ops.object.modifier_apply(modifier=mod.name)


def shade_smooth(obj):
    select_only([obj])
    bpy.ops.object.shade_smooth()


def set_material(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.material_index = 0


def tag_region(obj, tag):
    """Tag every vertex with a region marker used by the skinning solver."""
    vg = obj.vertex_groups.new(name=tag)
    vg.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    return obj


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

def srgb_to_linear(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_lin(value):
    value = value.lstrip("#")
    return (
        srgb_to_linear(int(value[0:2], 16)),
        srgb_to_linear(int(value[2:4], 16)),
        srgb_to_linear(int(value[4:6], 16)),
    )


def make_material(name, hex_color, roughness=0.5, metallic=0.0,
                  emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = False
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    rgb = hex_lin(hex_color)
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = 0.0
    if emission:
        er = hex_lin(emission)
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*er, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    mat.diffuse_color = (*rgb, 1.0)
    return mat


MAT = {
    "skin_a": make_material("Skin_A", "#9A6A4C", 0.58, 0.0),
    "skin_b": make_material("Skin_B", "#D9A47F", 0.58, 0.0),
    "inner_ear_a": make_material("InnerEar_A", "#744733", 0.65),
    "inner_ear_b": make_material("InnerEar_B", "#B87A5B", 0.65),
    "lips_a": make_material("Lips_A", "#8C4E46", 0.56),
    "lips_b": make_material("Lips_B", "#B25F5D", 0.54),
    "mouth_line": make_material("Mouth_Line", "#5A2B26", 0.6),
    "hair_a": make_material("Hair_A", "#171310", 0.78),
    "hair_b": make_material("Hair_B", "#2B1A12", 0.74),
    "sclera": make_material("Eye_Sclera", "#F2EDE4", 0.18),
    "iris_a": make_material("Eye_Iris_A", "#432A16", 0.24),
    "iris_b": make_material("Eye_Iris_B", "#54663B", 0.24),
    "pupil": make_material("Eye_Pupil", "#080606", 0.16),
    "eye_glint": make_material("Eye_Glint", "#FFFFFF", 0.1,
                               emission="#FFFFFF", emission_strength=0.6),
    "lash_a": make_material("Lash_A", "#1C1512", 0.5),
    "lash_b": make_material("Lash_B", "#20150F", 0.5),
    "gold": make_material("Gold_Stud", "#C9A24A", 0.28, 0.85),
    "jersey": make_material("Crew_Jersey_Blue", "#17427A", 0.82),
    "jersey_alt": make_material("Crew_Jersey_Deep", "#0E2E5A", 0.84),
    "pants": make_material("Crew_Pants_Navy", "#0A2350", 0.85),
    "trim": make_material("Crew_Trim_White", "#EDEDE9", 0.78),
    "stripe": make_material("Crew_Stripe_White", "#F2F2EE", 0.74),
    "print": make_material("Crew_Print_White", "#F6F6F2", 0.62),
    "red": make_material("Crew_Print_Red", "#C8102E", 0.6),
    "shoe": make_material("Shoe_White", "#EDECE6", 0.58),
    "shoe_panel": make_material("Shoe_Blue", "#17427A", 0.55),
    "shoe_red": make_material("Shoe_Red", "#C8102E", 0.55),
    "sole": make_material("Shoe_Sole", "#D8D6CE", 0.72),
    "outsole": make_material("Shoe_Outsole", "#35393F", 0.8),
    "sock": make_material("Sock_White", "#F4F4F0", 0.8),
    "undershirt": make_material("Undershirt", "#E8E8E4", 0.8),
}

MAT_SKIN = {"a": MAT["skin_a"], "b": MAT["skin_b"]}
MAT_INNER_EAR = {"a": MAT["inner_ear_a"], "b": MAT["inner_ear_b"]}
MAT_LIPS = {"a": MAT["lips_a"], "b": MAT["lips_b"]}
MAT_HAIR = {"a": MAT["hair_a"], "b": MAT["hair_b"]}
MAT_IRIS = {"a": MAT["iris_a"], "b": MAT["iris_b"]}
MAT_LASH = {"a": MAT["lash_a"], "b": MAT["lash_b"]}

# ---------------------------------------------------------------------------
# Geometry primitives
# ---------------------------------------------------------------------------

def ellipsoid(name, center, radii, axes=None, segs=24, rings=14):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segs, ring_count=rings, radius=1.0, location=(0, 0, 0)
    )
    obj = bpy.context.object
    obj.name = name
    rot = axes if axes is not None else Matrix.Identity(3)
    scale = Matrix.Diagonal(Vector((radii[0], radii[1], radii[2], 1.0)))
    obj.matrix_world = Matrix.Translation(Vector(center)) @ rot.to_4x4() @ scale
    apply_transform(obj)
    return obj


def box(name, center, size, bevel=0.0, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    obj.rotation_euler = rotation
    apply_transform(obj)
    if bevel > 0:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 3
        apply_modifier(obj, mod)
    return obj


def tube_between(name, p1, p2, r1, r2, rings=8, segs=20, cap_start=False, cap_end=False):
    p1 = Vector(p1)
    p2 = Vector(p2)
    axis = (p2 - p1).normalized()
    helper = Vector((0, 1, 0))
    if abs(axis.dot(helper)) > 0.92:
        helper = Vector((1, 0, 0))
    u = (helper - axis * axis.dot(helper)).normalized()
    v = axis.cross(u).normalized()
    ring_list = []
    for i in range(rings + 1):
        t = i / rings
        center = p1.lerp(p2, t)
        r = r1 + (r2 - r1) * t
        ring_list.append([
            center + u * (cos(2 * pi * j / segs) * r) + v * (sin(2 * pi * j / segs) * r)
            for j in range(segs)
        ])
    return loft(name, ring_list, cap_start, cap_end)


def chain(name, p1, p2, r1, r2, n=7, bulge=0.0, segs=20, rings=12):
    """A tapered capsule made of overlapping spheres (fused later by remesh)."""
    p1 = Vector(p1)
    p2 = Vector(p2)
    parts = []
    for i in range(n + 1):
        t = i / n
        p = p1.lerp(p2, t)
        r = r1 + (r2 - r1) * t + bulge * sin(pi * t)
        parts.append(ellipsoid(f"{name}_s{i}", p, (r, r, r), segs=segs, rings=rings))
    return parts


def profile_tube(name, p1, p2, radius_fn, rings=14, segs=24,
                 cap_start=True, cap_end=True):
    """Smooth tapered limb tube with an arbitrary radius profile."""
    p1 = Vector(p1)
    p2 = Vector(p2)
    axis = (p2 - p1).normalized()
    helper = Vector((0, 1, 0))
    if abs(axis.dot(helper)) > 0.92:
        helper = Vector((1, 0, 0))
    u = (helper - axis * axis.dot(helper)).normalized()
    v = axis.cross(u).normalized()
    ring_list = []
    for i in range(rings + 1):
        t = i / rings
        center = p1.lerp(p2, t)
        r = radius_fn(t)
        ring_list.append([
            center + u * (cos(2 * pi * j / segs) * r) + v * (sin(2 * pi * j / segs) * r)
            for j in range(segs)
        ])
    return loft(name, ring_list, cap_start, cap_end)


def capsule_tube(name, p1, p2, r0, r1, rings=9, segs=28, dome_rings=4, dome_scale=1.0):
    """A tapered sleeve with a rounded closed top (no separate shoulder pad).

    ``dome_scale`` flattens the cap along the limb axis. A full hemisphere
    makes a T-shirt sleeve look like a shoulder pad; 0.5-0.6 keeps the top
    rounded without inflating the silhouette.
    """
    p1 = Vector(p1)
    p2 = Vector(p2)
    axis = (p2 - p1).normalized()
    helper = Vector((0, 1, 0))
    if abs(axis.dot(helper)) > 0.92:
        helper = Vector((1, 0, 0))
    u = (helper - axis * axis.dot(helper)).normalized()
    v = axis.cross(u).normalized()
    length = (p2 - p1).length
    ring_list = []

    def ring_at(center, r):
        return [
            center + u * (cos(2 * pi * j / segs) * r) + v * (sin(2 * pi * j / segs) * r)
            for j in range(segs)
        ]

    for i in range(dome_rings):
        ang = (pi / 2) * i / max(1, dome_rings - 1)
        s = -r0 * cos(ang) * dome_scale
        rad = max(1e-4, r0 * sin(ang))
        ring_list.append(ring_at(p1 + axis * s, rad))
    for i in range(1, rings + 1):
        t = i / rings
        r = r0 + (r1 - r0) * t
        ring_list.append(ring_at(p1 + axis * (length * t), r))
    return loft(name, ring_list, cap_start=True, cap_end=False)


def loft(name, rings, cap_start=False, cap_end=False):
    """Ring loft. Rings go bottom->top, each CCW looking down -Z."""
    n = len(rings[0])
    verts = [tuple(v) for ring in rings for v in ring]
    faces = []
    for i in range(len(rings) - 1):
        base = i * n
        nxt = (i + 1) * n
        for j in range(n):
            j2 = (j + 1) % n
            faces.append((base + j, base + j2, nxt + j2, nxt + j))
    if cap_start:
        faces.append(tuple(reversed(range(n))))
    if cap_end:
        base = (len(rings) - 1) * n
        faces.append(tuple(base + j for j in range(n)))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def superellipse_ring(center, width, depth_front, depth_back, segs=40, power=2.35):
    cx, cy, z = center
    pts = []
    for i in range(segs):
        t = 2 * pi * i / segs
        c, s = cos(t), sin(t)
        x = width * math.copysign(abs(c) ** (2.0 / power), c)
        d = depth_front if s < 0 else depth_back
        y = d * math.copysign(abs(s) ** (2.0 / power), s)
        pts.append(Vector((cx + x, cy + y, z)))
    return pts


def ellipse_ring(center, rx, ry, segs=32):
    cx, cy, z = center
    return [Vector((cx + rx * cos(2 * pi * i / segs),
                    cy + ry * sin(2 * pi * i / segs), z))
            for i in range(segs)]


def finalize_organic(obj, voxel, smooth_iters=3, smooth_factor=0.5,
                     decimate_ratio=0.5, label=""):
    mod = obj.modifiers.new("Remesh", "REMESH")
    mod.mode = "VOXEL"
    mod.voxel_size = voxel
    mod.use_smooth_shade = True
    apply_modifier(obj, mod)
    if smooth_iters:
        sm = obj.modifiers.new("Smooth", "SMOOTH")
        sm.factor = smooth_factor
        sm.iterations = smooth_iters
        apply_modifier(obj, sm)
    if decimate_ratio < 1.0:
        dec = obj.modifiers.new("Decimate", "DECIMATE")
        dec.decimate_type = "COLLAPSE"
        dec.ratio = decimate_ratio
        apply_modifier(obj, dec)
    shade_smooth(obj)
    print(f"  [mesh] {label or obj.name}: {len(obj.data.vertices)} verts / "
          f"{len(obj.data.polygons)} faces")
    return obj


def solidify(obj, thickness=0.004, offset=-1.0):
    mod = obj.modifiers.new("Solidify", "SOLIDIFY")
    mod.thickness = thickness
    mod.offset = offset
    mod.use_rim = True
    apply_modifier(obj, mod)
    shade_smooth(obj)
    return obj


def curve_ribbon(name, points, half_widths, normal_hint, material=None):
    """A flat ribbon through 3D points, facing normal_hint."""
    pts = [Vector(p) for p in points]
    verts = []
    for i, p in enumerate(pts):
        if i == 0:
            tangent = (pts[1] - p).normalized()
        elif i == len(pts) - 1:
            tangent = (p - pts[i - 1]).normalized()
        else:
            tangent = (pts[i + 1] - pts[i - 1]).normalized()
        n = Vector(normal_hint)
        side = tangent.cross(n)
        if side.length < 1e-6:
            side = Vector((1, 0, 0))
        side.normalize()
        verts.append(tuple(p - side * half_widths[i]))
        verts.append(tuple(p + side * half_widths[i]))
    faces = []
    for i in range(len(pts) - 1):
        a = i * 2
        faces.append((a, a + 1, a + 3, a + 2))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if material:
        set_material(obj, material)
    return obj


def surface_ribbon(name, points, normals, half_widths, material=None):
    """A ribbon that follows a curved surface with per-point normals."""
    pts = [Vector(p) for p in points]
    verts = []
    for i, p in enumerate(pts):
        if i == 0:
            tangent = (pts[1] - p).normalized()
        elif i == len(pts) - 1:
            tangent = (p - pts[i - 1]).normalized()
        else:
            tangent = (pts[i + 1] - pts[i - 1]).normalized()
        n = Vector(normals[i]).normalized()
        side = tangent.cross(n)
        if side.length < 1e-6:
            side = Vector((1, 0, 0))
        side.normalize()
        verts.append(tuple(p - side * half_widths[i]))
        verts.append(tuple(p + side * half_widths[i]))
    faces = []
    for i in range(len(pts) - 1):
        a = i * 2
        faces.append((a, a + 1, a + 3, a + 2))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if material:
        set_material(obj, material)
    return obj


def torus(name, center, major_r, minor_r, axis="Z", scale=(1, 1, 1), material=None, segs=32):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_r, minor_radius=minor_r,
        major_segments=segs, minor_segments=10, location=center
    )
    obj = bpy.context.object
    obj.name = name
    if axis == "X":
        obj.rotation_euler = (0, pi / 2, 0)
    elif axis == "Y":
        obj.rotation_euler = (pi / 2, 0, 0)
    obj.scale = scale
    apply_transform(obj)
    shade_smooth(obj)
    if material:
        set_material(obj, material)
    return obj


# ---------------------------------------------------------------------------
# Character proportions
# ---------------------------------------------------------------------------

CHARS = {
    "a": {
        "id": "crew_a",
        "label": "Crew A",
        "height": 1.90,
        "shoulder_w": 1.00,
        "hip_w": 1.00,
        "chest_ease": 0.98,
        "limb": 1.00,
        "head": 1.02,
        "hand": 1.00,
        "female": False,
        "number": "01",
    },
    "b": {
        "id": "crew_b",
        "label": "Crew B",
        "height": 1.77,
        "shoulder_w": 0.91,
        "hip_w": 1.00,
        "chest_ease": 0.92,
        "limb": 0.92,
        "head": 1.00,
        "hand": 0.94,
        "female": True,
        "number": "02",
    },
}


def build_proportions(cfg):
    s = cfg["height"] / 1.90
    hs = cfg["head"] * s
    p = {
        "s": s,
        "h": cfg["height"],
        "height": cfg["height"],
        "female": cfg["female"],
        "number": cfg["number"],
        "id": cfg["id"],
        "label": cfg["label"],
        # vertical landmarks (A proportions scaled)
        "ankle_z": 0.095 * s,
        "knee_z": 0.515 * s,
        "hip_joint_z": 0.940 * s,
        "waist_z": 1.125 * s,
        "chest_z": 1.365 * s,
        "shoulder_z": 1.490 * s,
        "neck_base_z": 1.535 * s,
        "collar_z": 1.596 * s,
        "chin_z": 1.661 * s,
        "head_c_z": cfg["height"] - 0.124 * hs - 0.012 * s,
        "head_top_z": 1.900 * s,
        # widths
        "shoulder_x": 0.186 * cfg["shoulder_w"] * s,
        "hip_x": 0.099 * cfg["hip_w"] * s,
        "chest_w": 0.176 * cfg["chest_ease"] * s,
        "waist_w": 0.136 * cfg["chest_ease"] * s,
        "pelvis_w": 0.148 * (1.03 if cfg["female"] else 1.0) * s,
        "limb": cfg["limb"] * s,
        "head_scale": hs,
        "hand_scale": cfg["hand"] * s,
    }

    # Arm chain in a relaxed A-pose. The old 22-degree splay read as a
    # mannequin stance; a narrower 14/7-degree hang clears the hips while
    # keeping the silhouette close to a real standing person.
    p["arms"] = {}
    for side, key in ((-1, "R"), (1, "L")):
        sx = side * p["shoulder_x"]
        shoulder = Vector((sx, 0.0, p["shoulder_z"]))
        upper_len = 0.305 * s
        fore_len = 0.265 * s
        a1 = radians(22.0)
        a2 = radians(13.0)
        elbow = shoulder + Vector((side * sin(a1) * upper_len, 0.0, -cos(a1) * upper_len))
        wrist = elbow + Vector((side * sin(a2) * fore_len, 0.0, -cos(a2) * fore_len))
        hand_dir = (wrist - elbow).normalized()
        hand_dir = (hand_dir + Vector((0, 0.0, -0.22))).normalized()
        hand_len = 0.171 * p["hand_scale"]
        fingertip = wrist + hand_dir * hand_len
        palm_normal = Vector((-side, 0.0, 0.0))
        p["arms"][key] = {
            "shoulder": shoulder,
            "elbow": elbow,
            "wrist": wrist,
            "hand_dir": hand_dir,
            "fingertip": fingertip,
            "palm_normal": palm_normal,
            "side": side,
            "upper_len": upper_len,
            "fore_len": fore_len,
        }

    p["legs"] = {}
    for side, key in ((-1, "R"), (1, "L")):
        hip = Vector((side * p["hip_x"], 0.004 * s, p["hip_joint_z"]))
        knee = Vector((side * (p["hip_x"] + 0.010 * s), -0.014 * s, p["knee_z"]))
        ankle = Vector((side * (p["hip_x"] + 0.016 * s), 0.0, p["ankle_z"]))
        toe = Vector((ankle.x + side * 0.006 * s, -0.145 * s, 0.030 * s))
        p["legs"][key] = {"hip": hip, "knee": knee, "ankle": ankle, "toe": toe, "side": side}
    return p


# ---------------------------------------------------------------------------
# Body
# ---------------------------------------------------------------------------

def build_body(P, key):
    s = P["s"]
    limb = P["limb"]
    parts = []

    # Torso masses (mostly hidden under the jersey, but keeps the silhouette
    # anatomical instead of a straight tube at the shoulders and hips).
    parts.append(ellipsoid("pelvis", (0, 0.004 * s, 0.985 * s),
                           (0.148 * s * (1.03 if P['female'] else 1.0), 0.104 * s, 0.112 * s),
                           segs=32, rings=18))
    parts.append(ellipsoid("waist", (0, 0.0, 1.120 * s),
                           (0.127 * s, 0.092 * s, 0.102 * s), segs=32, rings=18))
    parts.append(ellipsoid("ribs", (0, -0.004 * s, 1.300 * s),
                           (0.165 * s, 0.109 * s, 0.148 * s), segs=32, rings=18))
    parts.append(ellipsoid("chest", (0, -0.010 * s, 1.425 * s),
                           (0.168 * s, 0.112 * s, 0.108 * s), segs=32, rings=18))
    # Sloped trapezius / clavicle shelf: the jersey sits on this, so it keeps
    # the shoulders from ending in a flat ledge.
    parts.append(ellipsoid("trapezius", (0, 0.012 * s, 1.505 * s),
                           (0.158 * s, 0.075 * s, 0.050 * s), segs=32, rings=16))
    parts.append(ellipsoid("clavicle_shelf", (0, -0.006 * s, 1.475 * s),
                           (0.175 * s, 0.088 * s, 0.042 * s), segs=32, rings=16))

    # Neck (thicker at the base, tapering into the jaw)
    for ob in chain("neck", (0, 0.012 * s, 1.500 * s), (0, 0.004 * s, 1.705 * s),
                    0.070 * s, 0.054 * s, n=7, segs=24, rings=14):
        parts.append(ob)

    # Arms
    for k, A in P["arms"].items():
        sh, el, wr = A["shoulder"], A["elbow"], A["wrist"]
        parts.append(ellipsoid(f"deltoid_{k}", sh + Vector((0, 0, 0.000 * s)),
                               (0.060 * s, 0.061 * s, 0.047 * s), segs=24, rings=14))
        parts.append(profile_tube(
            f"upperarm_{k}", sh, el,
            lambda t: (0.054 * limb) + (0.042 - 0.054) * limb * t + 0.003 * limb * sin(pi * t),
            rings=14, segs=24, cap_start=True, cap_end=True))
        parts.append(ellipsoid(f"elbow_{k}", el, (0.042 * limb,) * 3, segs=20, rings=12))
        parts.append(profile_tube(
            f"forearm_{k}", el, wr,
            lambda t: (0.047 + (0.0295 - 0.047) * t) * limb +
                      (0.009 * limb * sin(pi * t) * (1.0 - 0.35 * t)),
            rings=16, segs=24, cap_start=True, cap_end=True))
        parts.append(ellipsoid(f"wrist_{k}", wr, (0.0285 * limb,) * 3, segs=20, rings=12))

    # Legs (hidden under pants)
    for k, L in P["legs"].items():
        hip, knee, ankle = L["hip"], L["knee"], L["ankle"]
        parts.append(profile_tube(
            f"thigh_{k}", hip, knee,
            lambda t: (0.086 + (0.056 - 0.086) * t) * limb + 0.005 * limb * sin(pi * t),
            rings=14, segs=24, cap_start=True, cap_end=True))
        parts.append(ellipsoid(f"knee_{k}", knee, (0.054 * limb,) * 3, segs=20, rings=12))
        parts.append(profile_tube(
            f"calf_{k}", knee, ankle,
            lambda t: (0.059 + (0.033 - 0.059) * t) * limb +
                      (0.011 * limb * (sin(pi * t) ** 1.4)),
            rings=14, segs=24, cap_start=True, cap_end=True))
        parts.append(ellipsoid(f"heel_{k}", ankle + Vector((0, 0.012 * s, 0)),
                               (0.043 * limb, 0.050 * limb, 0.060 * limb),
                               segs=20, rings=12))
        parts.append(ellipsoid(f"foot_{k}", (ankle.x, -0.055 * s, 0.045 * s),
                               (0.048 * limb, 0.105 * s, 0.045 * s),
                               segs=24, rings=12))

    body = join_objects(parts, f"{P['id']}_BodyBase")
    set_material(body, MAT_SKIN[key])
    finalize_organic(body, voxel=0.0070 * s, smooth_iters=5,
                     smooth_factor=0.5, decimate_ratio=0.42,
                     label=f"{P['label']} body")
    return body


def build_head(P, key):
    s = P["s"]
    hs = P["head_scale"]
    hc = P["head_c_z"]
    female = P["female"]

    # A single lofted skull gives smooth cheeks and a proper jaw/chin taper.
    # (z offset, half-width, front depth, back depth) in reference head units.
    # Compared with the first pass, the jaw is wider, the chin shorter and the
    # cranium slightly rounder so the head no longer reads as a long tube.
    profile = [
        (-0.100, 0.024, 0.034, 0.018),
        (-0.094, 0.034, 0.046, 0.030),
        (-0.086, 0.046, 0.058, 0.048),
        (-0.076, 0.055, 0.068, 0.062),
        (-0.065, 0.061, 0.074, 0.074),
        (-0.052, 0.065, 0.079, 0.083),
        (-0.038, 0.068, 0.082, 0.090),
        (-0.022, 0.070, 0.084, 0.094),
        (0.000, 0.071, 0.085, 0.097),
        (0.024, 0.072, 0.086, 0.099),
        (0.047, 0.070, 0.084, 0.099),
        (0.070, 0.065, 0.079, 0.098),
        (0.090, 0.055, 0.070, 0.093),
        (0.105, 0.039, 0.054, 0.085),
        (0.114, 0.018, 0.026, 0.040),
        (0.118, 0.002, 0.004, 0.006),
    ]
    if female:
        # Softer jaw and chin, slightly fuller cheeks, same cranium.
        profile = [
            (z, w * 0.985, df * (1.010 if z < -0.03 else 1.0),
             db * (1.0 if z < 0.02 else 1.01))
            for (z, w, df, db) in profile
        ]
    P["head_profile"] = profile
    rings = []
    for z, w, df, db in profile:
        rings.append(superellipse_ring((0, 0, hc + z * hs),
                                       w * hs, df * hs, db * hs,
                                       segs=48, power=2.15))
    head = loft(f"{P['id']}_HeadBase", rings, cap_start=True, cap_end=True)

    parts = [head]

    # Nose: bridge, tip and wings fused with the skull by the voxel remesh.
    parts.append(ellipsoid("nose_bridge", (0, -0.075 * hs, hc + 0.004 * hs),
                           (0.008 * hs, 0.014 * hs, 0.027 * hs),
                           segs=24, rings=14))
    parts.append(ellipsoid("nose_tip", (0, -0.084 * hs, hc - 0.024 * hs),
                           ((0.009 if female else 0.010) * hs, 0.012 * hs, 0.010 * hs),
                           segs=24, rings=14))
    for side in (-1, 1):
        parts.append(ellipsoid(f"nose_wing_{side}",
                               (side * 0.010 * hs, -0.079 * hs, hc - 0.028 * hs),
                               (0.006 * hs, 0.007 * hs, 0.006 * hs),
                               segs=20, rings=12))
    # Ears
    for side in (-1, 1):
        parts.append(ellipsoid(f"ear_{side}", (side * 0.073 * hs, 0.006 * hs, hc - 0.006 * hs),
                               (0.009 * hs, 0.019 * hs, 0.027 * hs),
                               segs=24, rings=14))

    head = join_objects(parts, f"{P['id']}_HeadBase")
    set_material(head, MAT_SKIN[key])
    finalize_organic(head, voxel=0.0024 * hs, smooth_iters=3,
                     smooth_factor=0.42, decimate_ratio=0.44,
                     label=f"{P['label']} head")
    return head


def build_hands(P, key):
    hs = P["hand_scale"]
    hands = []
    for k, A in P["arms"].items():
        wrist = A["wrist"]
        L = A["hand_dir"].normalized()
        N = A["palm_normal"].normalized()
        W = L.cross(N).normalized()  # roughly +Y (backward)
        if W.y < 0:
            W = -W
        axes = Matrix((L, W, N)).transposed()
        side = A["side"]

        parts = []
        # wrist + palm masses
        parts.append(ellipsoid(f"wrist_{k}", wrist + L * 0.010 * hs,
                               (0.024 * hs, 0.033 * hs, 0.020 * hs),
                               axes=axes, segs=20, rings=12))
        parts.append(ellipsoid(f"palm_{k}", wrist + L * 0.054 * hs,
                               (0.049 * hs, 0.043 * hs, 0.0155 * hs),
                               axes=axes, segs=24, rings=14))
        parts.append(ellipsoid(f"knuckles_{k}", wrist + L * 0.091 * hs,
                               (0.017 * hs, 0.043 * hs, 0.014 * hs),
                               axes=axes, segs=20, rings=12))

        # four fingers: index at -W (front), pinky at +W (back). The old
        # spacing left 1.3 cm gaps between fingers and read as a claw; these
        # nearly touch and curl a little more naturally.
        offsets = [-0.0225, -0.0075, 0.0075, 0.0210]
        lengths = [0.054, 0.060, 0.057, 0.046]
        radii = [0.0098, 0.0100, 0.0094, 0.0083]
        curls = [20, 26, 31, 38]
        for fi, (off, length, rad, curl) in enumerate(zip(offsets, lengths, radii, curls)):
            start = wrist + L * 0.099 * hs + W * (off * hs)
            direction = L.copy()
            pos = start
            total = length * hs
            fr = rad * hs
            seg_frac = [0.42, 0.33, 0.25]
            for seg_i, frac in enumerate(seg_frac):
                bend = radians(curl * (seg_i + 1) * 0.65)
                direction = (L * cos(bend) + N * sin(bend)).normalized()
                seg_end = pos + direction * (total * frac)
                parts += chain(f"finger_{k}_{fi}_{seg_i}", pos, seg_end,
                               fr, fr * 0.88, n=3, segs=14, rings=8)
                pos = seg_end
                fr *= 0.86
            parts.append(ellipsoid(f"finger_tip_{k}_{fi}", pos,
                                   (fr * 0.9, fr * 0.9, fr * 0.9),
                                   segs=12, rings=8))

        # thumb
        tbase = wrist + L * 0.028 * hs - W * 0.034 * hs + N * 0.012 * hs
        tdir = (L * 0.62 - W * 0.55 + N * 0.26).normalized()
        tmid = tbase + tdir * 0.031 * hs
        ttip_dir = (L * 0.48 - W * 0.62 + N * 0.36).normalized()
        ttip = tmid + ttip_dir * 0.028 * hs
        parts += chain(f"thumb_{k}_a", tbase, tmid, 0.0104 * hs, 0.0092 * hs,
                       n=3, segs=14, rings=8)
        parts += chain(f"thumb_{k}_b", tmid, ttip, 0.0092 * hs, 0.0070 * hs,
                       n=3, segs=14, rings=8)
        parts.append(ellipsoid(f"thumb_tip_{k}", ttip, (0.0068 * hs,) * 3,
                               segs=12, rings=8))

        hand = join_objects(parts, f"{P['id']}_Hand_{k}")
        set_material(hand, MAT_SKIN[key])
        finalize_organic(hand, voxel=0.0020 * hs, smooth_iters=2,
                         smooth_factor=0.45, decimate_ratio=0.42,
                         label=f"{P['label']} hand {k}")
        hands.append(hand)

    return hands


# ---------------------------------------------------------------------------
# Head details: eyes, brows, lashes, lips, hair
# ---------------------------------------------------------------------------

def surface_hit(obj, x, z, front=True):
    origin = Vector((x, -1.5 if front else 1.5, z))
    direction = Vector((0, 1, 0)) if front else Vector((0, -1, 0))
    hit, loc, normal, idx = obj.ray_cast(origin, direction)
    if not hit:
        return None
    return loc, normal


def build_eye(P, key, head, side):
    hs = P["head_scale"]
    hc = P["head_c_z"]
    female = P["female"]
    R = (0.0128 if female else 0.0122) * hs
    ex = side * 0.029 * hs
    ez = hc + 0.004 * hs
    # Seat the eyeball just proud of the face. Too deep (0.96R) buried the
    # sclera behind the convex cheek and left a slit; too shallow (0.78R) made
    # the whole white sphere visible. 0.82R keeps a believable almond opening.
    hit = surface_hit(head, ex, ez, front=True)
    face_y = hit[0].y if hit else -0.083 * hs
    eye_y = face_y + R * 0.82
    center = Vector((ex, eye_y, ez))

    # A flattened eye ellipsoid catches the convex face and leaves an almond
    # opening without the puffy spherical eyelid shells used previously. The
    # old shells read as swollen skin folds around a slit even after their face
    # selection was fixed.
    sclera_rx = R * 1.18
    sclera_ry = R * 0.30
    sclera_rz = R * 0.60
    eye_center = Vector((ex, face_y + sclera_ry * 0.60, ez))
    sclera = ellipsoid(f"sclera_{key}_{side}", eye_center,
                       (sclera_rx, sclera_ry, sclera_rz),
                       segs=32, rings=18)
    set_material(sclera, MAT["sclera"])

    iris_r = R * 0.71
    iris_y = eye_center.y - sclera_ry * 0.96
    iris = ellipsoid(f"iris_{key}_{side}",
                     (eye_center.x, iris_y, eye_center.z),
                     (iris_r, R * 0.055, iris_r), segs=24, rings=12)
    set_material(iris, MAT_IRIS[key])

    pupil_r = iris_r * 0.47
    pupil = ellipsoid(f"pupil_{key}_{side}",
                      (eye_center.x, iris_y - R * 0.045, eye_center.z),
                      (pupil_r, R * 0.05, pupil_r), segs=20, rings=10)
    set_material(pupil, MAT["pupil"])

    glint = ellipsoid(f"glint_{key}_{side}",
                      (eye_center.x - side * iris_r * 0.28,
                       iris_y - R * 0.085,
                       eye_center.z + iris_r * 0.32),
                      (R * 0.080, R * 0.045, R * 0.080), segs=12, rings=8)
    set_material(glint, MAT["eye_glint"])

    # Upper lash: a thin curved ribbon pinned to the face just above the
    # sclera, with a small wing at the outer corner.
    pts = []
    widths = []
    for i in range(11):
        t = i / 10.0
        xx = (-1 + 2 * t) * R * 1.12
        xnorm = min(1.0, abs(xx) / (R * 1.12))
        zz = R * 0.46 * ((1.0 - xnorm * xnorm) ** 0.55)
        hz = ez + zz
        hit = surface_hit(head, ex + xx, hz, front=True)
        if not hit:
            continue
        loc, normal = hit
        pts.append(loc + normal * 0.0014)
        wing = 0.016 + 0.010 * math.sin(pi * t)
        if side > 0 and t > 0.82:
            wing += (t - 0.82) * 0.10
        widths.append(R * wing)
    lash = curve_ribbon(f"lash_{key}_{side}", pts, widths, Vector((0, -1, 0)),
                        MAT_LASH[key])
    thick = lash.modifiers.new("Solidify", "SOLIDIFY")
    thick.thickness = 0.0004 * hs
    thick.offset = 0.0
    apply_modifier(lash, thick)

    return [sclera, iris, pupil, glint, lash]


def build_face_details(P, key, head):
    hs = P["head_scale"]
    hc = P["head_c_z"]
    female = P["female"]
    details = []
    for side in (-1, 1):
        details += build_eye(P, key, head, side)

    # Eyebrows: conform to the actual forehead surface. Slightly thinner and
    # closer to the eye than the first pass, with the arch biased outward.
    for side in (-1, 1):
        pts = []
        widths = []
        for i in range(9):
            t = i / 8.0
            hx = side * (0.012 + 0.039 * t) * hs
            hz = hc + (0.016 + 0.007 * sin(pi * (0.20 + 0.65 * t)) - 0.003 * t) * hs
            hit = surface_hit(head, hx, hz, front=True)
            if hit:
                loc, normal = hit
                loc = loc + normal * 0.0010 * hs
                pts.append(loc)
                widths.append((0.00070 + 0.00050 * sin(pi * t)) * hs)
        if len(pts) >= 2:
            brow = curve_ribbon(f"brow_{key}_{side}", pts, widths,
                                Vector((0, -1, 0)), MAT_HAIR[key])
            details.append(brow)

    # Lips: compact and close to the face. The upper lip is thinner, the lower
    # lip fuller, and the mouth line sits in the crease between them.
    lip_z = hc - 0.050 * hs
    lip_y = -0.078 * hs
    lip_w = 0.0235 if female else 0.022
    upper = ellipsoid(f"upper_lip_{key}", (0, lip_y, lip_z + 0.0020 * hs),
                      (lip_w * hs, 0.0032 * hs, 0.0032 * hs),
                      segs=24, rings=12)
    set_material(upper, MAT_LIPS[key])
    lower = ellipsoid(f"lower_lip_{key}", (0, lip_y + 0.0012 * hs, lip_z - 0.0034 * hs),
                      ((lip_w - 0.0012) * hs, 0.0038 * hs, 0.0038 * hs),
                      segs=24, rings=12)
    set_material(lower, MAT_LIPS[key])
    # Smile line
    smile_pts = []
    for i in range(9):
        t = -1.0 + 2.0 * i / 8.0
        x = t * lip_w * 0.88 * hs
        z = lip_z + 0.0015 * hs * (t * t) - 0.0002 * hs
        y = lip_y - 0.0038 * hs + 0.0012 * hs * (t * t)
        smile_pts.append(Vector((x, y, z)))
    smile = curve_ribbon(f"smile_{key}", smile_pts,
                         [0.0008 * hs] * len(smile_pts),
                         Vector((0, -1, 0)), MAT["mouth_line"])
    details += [upper, lower, smile]

    # Inner ear
    for side in (-1, 1):
        inner = ellipsoid(f"inner_ear_{key}_{side}",
                          (side * 0.0795 * hs, 0.002 * hs, hc - 0.006 * hs),
                          (0.0020 * hs, 0.0070 * hs, 0.012 * hs),
                          segs=18, rings=10)
        set_material(inner, MAT_INNER_EAR[key])
        details.append(inner)

    # A single gold earring for Crew B
    if female:
        for side in (-1, 1):
            ring = torus(f"earring_{key}_{side}",
                         (side * 0.0815 * hs, 0.006 * hs, hc - 0.033 * hs),
                         0.0090 * hs, 0.0012 * hs, axis="X",
                         material=MAT["gold"])
            details.append(ring)

    return details


def build_hair(P, key, head):
    hs = P["head_scale"]
    hc = P["head_c_z"]
    female = P["female"]
    hair_mat = MAT_HAIR[key]
    parts = []
    profile = P["head_profile"]

    def profile_at(z):
        zs = [p[0] for p in profile]
        if z <= zs[0]:
            _, w, df, db = profile[0]
            return w, df, db
        if z >= zs[-1]:
            _, w, df, db = profile[-1]
            return w, df, db
        for i in range(len(zs) - 1):
            if zs[i] <= z <= zs[i + 1]:
                t = (z - zs[i]) / max(1e-6, zs[i + 1] - zs[i])
                _, w0, df0, db0 = profile[i]
                _, w1, df1, db1 = profile[i + 1]
                return (w0 + (w1 - w0) * t,
                        df0 + (df1 - df0) * t,
                        db0 + (db1 - db0) * t)
        return profile[-1][1:]

    # Hair shell follows the actual head cross-sections, offset by a few mm.
    # The lower boundary is an analytic hairline (high at the forehead, low at
    # the nape) which gives a clean smooth edge in every direction.
    off = (0.0065 if female else 0.0068) * hs
    z_top = hc + 0.116 * hs
    segs = 72
    rows = 22
    power = 2.15
    verts = []
    faces = []
    for i in range(rows):
        trow = i / (rows - 1)
        for j in range(segs):
            ang = 2 * pi * j / segs
            c = cos(ang)
            s = sin(ang)
            zn = -s  # +1 at the front, -1 at the back
            # Hairline: high at the forehead, receding slightly at the temples
            # and low at the nape. The old curve sat too low and read as a
            # smooth helmet in every view.
            temple = abs(c) ** 3
            z_rel = 0.020 + 0.043 * zn - 0.010 * zn * zn - 0.006 * temple
            z_h = hc + z_rel * hs
            z = z_h + (z_top - z_h) * trow
            w, df, db = profile_at((z - hc) / hs)
            w += off / hs
            df += off / hs
            db += off / hs
            x = w * math.copysign(abs(c) ** (2.0 / power), c)
            dd = df if s < 0 else db
            y = dd * math.copysign(abs(s) ** (2.0 / power), s)
            verts.append((x * hs, y * hs, z))
    for i in range(rows - 1):
        for j in range(segs):
            j2 = (j + 1) % segs
            a = i * segs + j
            b = i * segs + j2
            c2 = (i + 1) * segs + j2
            d = (i + 1) * segs + j
            faces.append((a, b, c2, d))
    top_index = len(verts)
    verts.append((0, 0, hc + 0.118 * hs))
    base = (rows - 1) * segs
    for j in range(segs):
        faces.append((base + j, base + (j + 1) % segs, top_index))

    mesh = bpy.data.meshes.new(f"hair_cap_{key}")
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()
    cap = bpy.data.objects.new(f"hair_cap_{key}", mesh)
    bpy.context.collection.objects.link(cap)
    set_material(cap, hair_mat)

    solid = cap.modifiers.new("Solidify", "SOLIDIFY")
    solid.thickness = (0.0028 if female else 0.0034) * hs
    solid.offset = 1.0
    apply_modifier(cap, solid)

    tex = bpy.data.textures.new(f"hair_noise_{key}", "CLOUDS")
    tex.noise_scale = (0.0085 if female else 0.0065) * hs
    tex.noise_depth = 3
    disp = cap.modifiers.new("Displace", "DISPLACE")
    disp.texture = tex
    disp.direction = "NORMAL"
    disp.strength = (0.0022 if female else 0.0032) * hs
    disp.mid_level = 0.5
    apply_modifier(cap, disp)
    shade_smooth(cap)
    parts.append(cap)

    if female:
        # low back mass and a smaller, lower bun (the first pass looked like a
        # ball balanced on the crown)
        back = ellipsoid("hair_back", (0, 0.068 * hs, hc + 0.002 * hs),
                         (0.066 * hs, 0.042 * hs, 0.064 * hs),
                         segs=28, rings=16)
        set_material(back, hair_mat)
        parts.append(back)
        bun = ellipsoid("hair_bun", (0, 0.098 * hs, hc + 0.018 * hs),
                        (0.038 * hs, 0.033 * hs, 0.038 * hs),
                        segs=28, rings=16)
        set_material(bun, hair_mat)
        parts.append(bun)
        tie = torus("hair_tie", (0, 0.076 * hs, hc + 0.018 * hs),
                    0.031 * hs, 0.0045 * hs, axis="Y",
                    material=hair_mat, scale=(1.0, 1.0, 0.95))
        parts.append(tie)
        # Pulled-back strand ridges over the crown, a cheap way to break up
        # the smooth cap without another texture or material.
        for n in (-2, -1, 1, 2):
            pts = []
            for i in range(7):
                t = i / 6.0
                side = n * 0.014 * hs
                zz = hc + (0.104 - 0.070 * t) * hs
                hit = surface_hit(cap, side * (1.0 - 0.4 * t), zz, front=False)
                if hit:
                    pts.append(hit[0] + hit[1] * 0.0012 * hs + Vector((0, 0, 0.0)))
            if len(pts) >= 2:
                ribbon = curve_ribbon(f"hair_strand_{key}_{n}", pts,
                                      [0.0016 * hs] * len(pts),
                                      Vector((0, 0, 1)), hair_mat)
                parts.append(ribbon)
    hair = join_objects(parts, f"{P['id']}_Hair")
    return hair


# ---------------------------------------------------------------------------
# Clothing
# ---------------------------------------------------------------------------

def build_jersey(P, key):
    s = P["s"]
    female = P["female"]
    chest_w = P["chest_w"]

    # Loose crew jersey with sloped shoulders. Values are in the 1.90 m
    # reference space. The old top rings flared wider than the chest and the
    # separate sleeve caps sat on top of them, producing the puffy-shoulder
    # "action figure" silhouette. This loft now narrows continuously from the
    # chest through the clavicle into the collar, and the sleeves are smaller.
    rings_spec = [
        (0.940, 0.210, 0.132, 0.138),
        (0.966, 0.207, 0.128, 0.134),
        (1.020, 0.197, 0.121, 0.126),
        (1.090, 0.188, 0.116, 0.120),
        (1.160, 0.186, 0.116, 0.117),
        (1.230, 0.194, 0.122, 0.121),
        (1.295, 0.202, 0.130, 0.126),
        (1.350, 0.207, 0.136, 0.130),
        (1.400, 0.205, 0.134, 0.128),
        (1.440, 0.197, 0.126, 0.124),
        (1.470, 0.205, 0.116, 0.119),
        (1.492, 0.208, 0.108, 0.113),
        (1.510, 0.204, 0.100, 0.107),
        (1.528, 0.188, 0.091, 0.099),
        (1.546, 0.160, 0.084, 0.092),
        (1.564, 0.125, 0.078, 0.085),
        (1.580, 0.090, 0.074, 0.079),
        (1.598, 0.074, 0.072, 0.076),
    ]
    # Scale widths lightly with the character's shoulder/chest measurements.
    wide_scale = chest_w / (0.176 * s)
    wscale = 0.55 + 0.45 * wide_scale
    rings = []
    for z, w, df, db in rings_spec:
        ww = w * wscale * s
        df *= s
        db *= s
        if female:
            if 1.24 < z < 1.40:
                df *= 1.06
            if 1.05 < z < 1.20:
                ww *= 0.98
        rings.append(superellipse_ring((0, 0, z * s), ww, df, db, segs=48, power=2.3))

    jersey = loft(f"{P['id']}_Jersey_Body", rings, cap_start=True, cap_end=False)
    set_material(jersey, MAT["jersey"])
    solidify(jersey, 0.0040, -1.0)
    tag_region(jersey, "REG_torso")
    parts = [jersey]

    # Thin white hem band. It follows the jersey waist instead of flaring out
    # like a tutu.
    hem_rings = []
    for z, w, df, db in [(0.938, 0.211, 0.133, 0.139),
                         (0.956, 0.209, 0.131, 0.137),
                         (0.972, 0.207, 0.128, 0.134)]:
        hem_rings.append(superellipse_ring((0, 0, z * s),
                                           w * wscale * s, df * s, db * s,
                                           segs=48, power=2.3))
    hem = loft(f"{P['id']}_Jersey_Hem", hem_rings, cap_start=False, cap_end=False)
    set_material(hem, MAT["trim"])
    solidify(hem, 0.0032, -1.0)
    tag_region(hem, "REG_torso")
    parts.append(hem)

    # Ribbed crew-neck collar, raised to the base of the jaw.
    collar_rings = []
    for z, w, d in [(1.598, 0.076, 0.074),
                    (1.614, 0.074, 0.072),
                    (1.630, 0.072, 0.070)]:
        collar_rings.append(superellipse_ring((0, 0, z * s),
                                              w * wscale * s, d * s, d * s,
                                              segs=40, power=2.1))
    collar = loft(f"{P['id']}_Jersey_Collar", collar_rings, cap_start=False, cap_end=False)
    set_material(collar, MAT["trim"])
    solidify(collar, 0.0042, -1.0)
    tag_region(collar, "REG_torso")
    parts.append(collar)

    # One-piece cap sleeves with a rounded top. The sleeve weights blend
    # shoulder/upper-arm so a swinging arm keeps the shoulder covered. Starting
    # the capsule a little down the arm keeps the dome from riding above the
    # clavicle; the smaller radii remove the shoulder-pad bulk.
    for k, A in P["arms"].items():
        sh, el = A["shoulder"], A["elbow"]
        direction = (el - sh).normalized()

        start = sh - direction * (0.006 * s)
        end = sh + (el - sh) * (0.60 if female else 0.63)
        r0 = (0.064 if female else 0.068) * s
        r1 = (0.053 if female else 0.058) * s
        sleeve = capsule_tube(f"{P['id']}_Sleeve_{k}", start, end, r0, r1,
                              rings=10, segs=32, dome_rings=5, dome_scale=0.85)
        set_material(sleeve, MAT["jersey"])
        solidify(sleeve, 0.0040, -1.0)
        tag_region(sleeve, f"REG_sleeve_{k}")
        parts.append(sleeve)

        cuff = tube_between(f"{P['id']}_Cuff_{k}",
                            end - direction * (0.012 * s), end + direction * (0.005 * s),
                            r1 + 0.0028 * s, r1 + 0.0018 * s,
                            rings=2, segs=32, cap_start=False, cap_end=False)
        set_material(cuff, MAT["trim"])
        solidify(cuff, 0.0038, -1.0)
        tag_region(cuff, f"REG_sleeve_{k}")
        parts.append(cuff)

    jersey_obj = join_objects(parts, f"{P['id']}_Jersey")
    shade_smooth(jersey_obj)
    return jersey_obj


def build_pants(P, key):
    s = P["s"]
    parts = []
    for k, L in P["legs"].items():
        hip, knee, ankle = L["hip"], L["knee"], L["ankle"]
        top_z = 0.995 * s
        bottom_z = 0.140 * s
        zs = [top_z, 0.985 * s, 0.930 * s, 0.860 * s, 0.780 * s, 0.700 * s,
              0.620 * s, 0.560 * s, 0.515 * s, 0.470 * s, 0.410 * s, 0.340 * s,
              0.280 * s, 0.225 * s, 0.180 * s, bottom_z]
        # leg centre line interpolation
        def leg_center(z):
            if z >= knee.z:
                t = (z - knee.z) / max(1e-5, hip.z - knee.z)
                c = knee.lerp(hip, t)
            else:
                t = (z - ankle.z) / max(1e-5, knee.z - ankle.z)
                c = ankle.lerp(knee, t)
            return c
        # Tapered jogger silhouette. The old lower leg was nearly as wide as
        # the thigh, which made both characters look like they were wearing
        # bell-bottoms.
        widths = [0.086, 0.092, 0.096, 0.098, 0.096, 0.093,
                  0.089, 0.085, 0.082, 0.084, 0.084, 0.080,
                  0.074, 0.068, 0.062, 0.059]
        rings = []
        for z, w in zip(zs, widths):
            c = leg_center(z)
            ww = w * s * (1.0 + 0.025 if P["female"] else 1.0)
            rings.append(ellipse_ring((c.x, c.y, z), ww, ww * 1.06, segs=32))
        leg = loft(f"{P['id']}_PantLeg_{k}", rings, cap_start=True, cap_end=False)
        set_material(leg, MAT["pants"])
        solidify(leg, 0.0045, -1.0)
        tag_region(leg, f"REG_pants_{k}")
        parts.append(leg)

        # elastic cuff, slightly raised
        cuff_rings = []
        for z, w in [(bottom_z - 0.004 * s, 0.063), (bottom_z + 0.010 * s, 0.065),
                     (bottom_z + 0.026 * s, 0.067)]:
            c = leg_center(z)
            ww = w * s * (1.0 + 0.025 if P["female"] else 1.0)
            cuff_rings.append(ellipse_ring((c.x, c.y, z), ww, ww * 1.06, segs=32))
        cuff = loft(f"{P['id']}_PantCuff_{k}", cuff_rings, cap_start=False, cap_end=False)
        set_material(cuff, MAT["pants"])
        solidify(cuff, 0.006, 1.0)
        tag_region(cuff, f"REG_pants_{k}")
        parts.append(cuff)

        # white outer side stripe (two rails around the leg surface)
        stripe_rings = []
        for z, w in zip(zs, widths):
            c = leg_center(z)
            ww = w * s * (1.0 + 0.025 if P["female"] else 1.0)
            ring_pts = []
            for ang_deg in (29, 38):
                a = radians(ang_deg)
                x = c.x + L["side"] * cos(a) * ww * 1.008
                y = c.y - sin(a) * ww * 1.06 * 1.008
                ring_pts.append(Vector((x, y, z + 0.0015 * s)))
            stripe_rings.append(ring_pts)
        # build a thin quad strip between the two rails
        verts = []
        for pair in stripe_rings:
            verts += [tuple(pair[0]), tuple(pair[1])]
        faces = []
        for i in range(len(stripe_rings) - 1):
            a = i * 2
            faces.append((a, a + 1, a + 3, a + 2))
        mesh = bpy.data.meshes.new(f"{P['id']}_PantStripe_{k}")
        mesh.from_pydata(verts, [], faces)
        mesh.validate()
        mesh.update()
        stripe = bpy.data.objects.new(f"{P['id']}_PantStripe_{k}", mesh)
        bpy.context.collection.objects.link(stripe)
        set_material(stripe, MAT["stripe"])
        solid = stripe.modifiers.new("Solidify", "SOLIDIFY")
        solid.thickness = 0.0016 * s
        solid.offset = 0.0
        apply_modifier(stripe, solid)
        shade_smooth(stripe)
        tag_region(stripe, f"REG_pants_{k}")
        parts.append(stripe)

    # A broad, high seat gusset closes the V between the two pant legs and
    # blends into the waist. It replaces the narrow low ellipsoid that used to
    # read as a lump under the jersey hem.
    seat = ellipsoid(f"{P['id']}_PantSeat",
                     (0, 0.004 * s, 0.948 * s),
                     ((0.146 if P['female'] else 0.141) * s, 0.110 * s, 0.093 * s),
                     segs=32, rings=18)
    set_material(seat, MAT["pants"])
    tag_region(seat, "REG_pants_seat")
    parts.append(seat)

    pants = join_objects(parts, f"{P['id']}_Pants")
    shade_smooth(pants)
    return pants


# ---------------------------------------------------------------------------
# Shoe
# ---------------------------------------------------------------------------

def build_shoes(P, key):
    s = P["s"]
    parts = []
    for k, L in P["legs"].items():
        ankle = L["ankle"]
        x = ankle.x
        y = ankle.y
        foot_scale = 0.95 if P["female"] else 1.0
        fs = s * foot_scale
        side = 1 if x > 0 else -1
        side_parts = []

        # Dark outsole rim and white midsole. The first pair were nearly 30 cm
        # long and 11 cm wide even on the female character; this is a normal
        # game-size sneaker with the same layered construction.
        outsole = box(f"{P['id']}_Outsole_{k}", (x, y - 0.056 * fs, 0.006 * fs),
                      (0.098 * fs, 0.264 * fs, 0.012 * fs),
                      bevel=0.005 * fs)
        set_material(outsole, MAT["outsole"])
        side_parts.append(outsole)

        sole = box(f"{P['id']}_Sole_{k}", (x, y - 0.056 * fs, 0.019 * fs),
                   (0.095 * fs, 0.261 * fs, 0.031 * fs),
                   bevel=0.013 * fs)
        set_material(sole, MAT["sole"])
        side_parts.append(sole)

        # Upper, fused
        upper_parts = [
            ellipsoid("toe", (x, y - 0.136 * fs, 0.055 * fs),
                      (0.046 * fs, 0.068 * fs, 0.039 * fs), segs=24, rings=14),
            ellipsoid("ball", (x, y - 0.066 * fs, 0.062 * fs),
                      (0.049 * fs, 0.080 * fs, 0.047 * fs), segs=24, rings=14),
            ellipsoid("instep", (x, y + 0.002 * fs, 0.064 * fs),
                      (0.048 * fs, 0.071 * fs, 0.050 * fs), segs=24, rings=14),
            ellipsoid("heel", (x, y + 0.049 * fs, 0.060 * fs),
                      (0.043 * fs, 0.049 * fs, 0.048 * fs), segs=24, rings=14),
            ellipsoid("collar", (x, y + 0.028 * fs, 0.095 * fs),
                      (0.040 * fs, 0.042 * fs, 0.029 * fs), segs=24, rings=14),
        ]
        upper = join_objects(upper_parts, f"{P['id']}_ShoeUpper_{k}")
        finalize_organic(upper, voxel=0.0042 * fs, smooth_iters=2,
                         smooth_factor=0.5, decimate_ratio=0.4,
                         label=f"{P['label']} shoe upper {k}")
        set_material(upper, MAT["shoe"])
        side_parts.append(upper)

        # Blue panel on the outer side
        panel = ellipsoid(f"{P['id']}_ShoePanel_{k}",
                          (x + side * 0.047 * fs, y - 0.055 * fs, 0.062 * fs),
                          (0.0055 * fs, 0.072 * fs, 0.022 * fs),
                          segs=24, rings=12)
        set_material(panel, MAT["shoe_panel"])
        side_parts.append(panel)

        # Blue toe cap
        toe_cap = ellipsoid(f"{P['id']}_ToeCap_{k}",
                            (x, y - 0.196 * fs, 0.061 * fs),
                            (0.043 * fs, 0.018 * fs, 0.022 * fs),
                            segs=24, rings=12)
        set_material(toe_cap, MAT["shoe_panel"])
        side_parts.append(toe_cap)

        # Blue heel counter
        heel = ellipsoid(f"{P['id']}_HeelCounter_{k}",
                         (x, y + 0.073 * fs, 0.060 * fs),
                         (0.049 * fs, 0.020 * fs, 0.040 * fs),
                         segs=24, rings=12)
        set_material(heel, MAT["shoe_panel"])
        side_parts.append(heel)

        # Blue collar ring
        collar_ring = torus(f"{P['id']}_ShoeCollar_{k}",
                            (x, y + 0.026 * fs, 0.107 * fs),
                            0.041 * fs, 0.008 * fs,
                            axis="Z", scale=(1.0, 1.10, 1.0),
                            material=MAT["shoe_panel"])
        side_parts.append(collar_ring)

        # Tongue
        tongue = ellipsoid(f"{P['id']}_Tongue_{k}",
                           (x, y - 0.020 * fs, 0.098 * fs),
                           (0.030 * fs, 0.042 * fs, 0.014 * fs),
                           axes=Matrix.Rotation(radians(17), 3, "X"),
                           segs=20, rings=12)
        set_material(tongue, MAT["shoe_panel"])
        side_parts.append(tongue)

        # Red heel tab
        tab = box(f"{P['id']}_HeelTab_{k}",
                  (x, y + 0.090 * fs, 0.095 * fs),
                  (0.018 * fs, 0.007 * fs, 0.026 * fs),
                  bevel=0.003 * fs, rotation=(radians(-14), 0, 0))
        set_material(tab, MAT["shoe_red"])
        side_parts.append(tab)

        # Laces
        for i in range(4):
            t = i / 3.0
            lace = box(f"{P['id']}_Lace_{k}_{i}",
                       (x, y - 0.065 * fs - t * 0.067 * fs,
                        0.100 * fs - t * 0.026 * fs),
                       (0.068 * fs - t * 0.012 * fs, 0.007 * fs, 0.005 * fs),
                       bevel=0.002 * fs,
                       rotation=(radians(7 + t * 5), 0, 0))
            set_material(lace, MAT["trim"])
            side_parts.append(lace)

        # Socks (white band between shoe and pants cuff)
        sock_rings = []
        for z, r in [(0.075 * fs, 0.037), (0.105 * fs, 0.037),
                     (0.145 * fs, 0.0355), (0.160 * fs, 0.0345)]:
            sock_rings.append(ellipse_ring((x, y, z), r * fs, r * fs * 1.03, segs=24))
        sock = loft(f"{P['id']}_Sock_{k}", sock_rings, cap_start=False, cap_end=False)
        set_material(sock, MAT["sock"])
        solidify(sock, 0.002, -1.0)
        side_parts.append(sock)

        for ob in side_parts:
            tag_region(ob, f"REG_shoe_{k}")
        parts += side_parts

    shoes = join_objects(parts, f"{P['id']}_Shoes")
    shade_smooth(shoes)
    return shoes


# ---------------------------------------------------------------------------
# Flat print / text conforming
# ---------------------------------------------------------------------------

FONT_PATH = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
_font = None
try:
    _font = bpy.data.fonts.load(FONT_PATH)
except Exception:
    _font = None


def make_flat_text(name, text, target_width, target_height=None,
                   location=(0, 0, 0), rotation_z=0.0):
    """Create a flat mesh text in the XZ plane facing -Y, centred at location."""
    curve = bpy.data.curves.new(name + "_curve", type="FONT")
    curve.body = text
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.size = 0.10
    curve.resolution_u = 5
    curve.extrude = 0.0
    if _font:
        curve.font = _font
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    select_only([obj])
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.object
    obj.name = name

    # Scale to the requested width (keep aspect)
    bbox = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    minx = min(v.x for v in bbox); maxx = max(v.x for v in bbox)
    minz = min(v.z for v in bbox); maxz = max(v.z for v in bbox)
    width = max(1e-5, maxx - minx)
    height = max(1e-5, maxz - minz)
    if target_height is not None:
        factor = target_height / height
    else:
        factor = target_width / width
    obj.scale = (factor, factor, factor)
    apply_transform(obj)

    # rotate from native XY plane to XZ plane (normal -Y)
    obj.rotation_euler = (pi / 2, 0, 0)
    apply_transform(obj)
    obj.rotation_euler = (0, 0, rotation_z)
    apply_transform(obj)

    bbox = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    cx = (min(v.x for v in bbox) + max(v.x for v in bbox)) / 2
    cz = (min(v.z for v in bbox) + max(v.z for v in bbox)) / 2
    obj.location = (location[0] - cx, location[1], location[2] - cz)
    apply_transform(obj)
    return obj


def conform_to_surface(obj, target, front=True, offset=0.0012):
    """Project every vertex onto target's surface along Y, preserving X/Z."""
    me = obj.data
    for v in me.vertices:
        x, y, z = v.co
        hit, loc, normal, idx = target.ray_cast(
            Vector((x, -2.0 if front else 2.0, z)),
            Vector((0, 1, 0)) if front else Vector((0, -1, 0))
        )
        if hit:
            v.co.y = loc.y + (offset if not front else -offset)
    me.update()
    return obj


def conform_to_smooth_decals(obj, target, center_z, front=True, x_center=0.0,
                             offset=0.0018, dx=0.07, dz=0.035):
    """Wrap a flat print onto a smooth quadratic approximation of the garment
    surface. This keeps letterforms crisp on curved chests/busts."""
    def surf_y(x, z):
        hit = surface_hit(target, x, z, front=front)
        return hit[0].y if hit else None

    yc = surf_y(x_center, center_z)
    if yc is None:
        return obj
    ym = surf_y(x_center, center_z - dz)
    yp = surf_y(x_center, center_z + dz)
    yl = surf_y(x_center - dx, center_z)
    yr = surf_y(x_center + dx, center_z)
    a = ((yp - ym) / (2 * dz)) if (ym is not None and yp is not None) else 0.0
    if ym is not None and yp is not None:
        b = (yp + ym - 2 * yc) / (2 * dz * dz)
    else:
        b = 0.0
    if yl is not None and yr is not None:
        kx = ((yl + yr) * 0.5 - yc) / (dx * dx)
    else:
        kx = 0.0

    for v in obj.data.vertices:
        dxv = v.co.x - x_center
        dzv = v.co.z - center_z
        v.co.y = yc + kx * dxv * dxv + a * dzv + b * dzv * dzv + \
            (-offset if front else offset)
    obj.data.update()
    return obj


def make_jersey_marks(P, key, jersey):
    s = P["s"]
    parts = []

    # Back number
    number_z = 1.300 * s
    number = make_flat_text(f"{P['id']}_BackNumber", P["number"],
                            target_width=0.078 * s,
                            location=(0, 0, number_z), rotation_z=pi)
    conform_to_smooth_decals(number, jersey, number_z, front=False, x_center=0,
                             offset=0.0018, dx=0.030 * s, dz=0.020 * s)
    set_material(number, MAT["print"])
    parts.append(number)

    # Red underline below the back number
    underline_pts = []
    for i in range(2):
        x = (-0.045 + i * 0.090) * s
        z = 1.265 * s
        hit = surface_hit(jersey, x, z, front=False)
        if hit:
            underline_pts.append(hit[0] + hit[1] * 0.0016)
    if len(underline_pts) == 2:
        underline = curve_ribbon(f"{P['id']}_BackUnderline", underline_pts,
                                 [0.0022 * s, 0.0022 * s],
                                 Vector((0, -1, 0)), MAT["red"])
        parts.append(underline)

    marks = join_objects(parts, f"{P['id']}_JerseyMarks")
    for p in marks.data.polygons:
        p.use_smooth = False
    return marks


# ---------------------------------------------------------------------------
# Armature
# ---------------------------------------------------------------------------

def create_rig(P):
    arm_data = bpy.data.armatures.new(f"{P['id']}_Skeleton")
    arm_obj = bpy.data.objects.new(f"{P['id']}_Rig", arm_data)
    bpy.context.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    arm_obj.show_in_front = True
    arm_obj.data.display_type = "OCTAHEDRAL"

    bpy.ops.object.mode_set(mode="EDIT")
    ebones = arm_data.edit_bones
    s = P["s"]

    def add(name, head, tail, parent=None, connect=False):
        b = ebones.new(name)
        b.head = Vector(head)
        b.tail = Vector(tail)
        b.roll = 0.0
        b.use_deform = True
        if parent:
            b.parent = ebones[parent]
            b.use_connect = connect
        return b

    add("hips", (0, 0, 0.940 * s), (0, 0, 1.050 * s))
    add("spine", (0, 0, 1.050 * s), (0, 0, 1.180 * s), "hips", True)
    add("spine1", (0, 0, 1.180 * s), (0, 0, 1.310 * s), "spine", True)
    add("chest", (0, 0, 1.310 * s), (0, 0, 1.520 * s), "spine1", True)
    add("neck", (0, 0.002 * s, 1.520 * s), (0, 0.002 * s, 1.640 * s), "chest", True)
    add("head", (0, 0.002 * s, 1.640 * s), (0, 0.002 * s, 1.875 * s), "neck", True)

    for k, A in P["arms"].items():
        side = A["side"]
        sh, el, wr, finger = A["shoulder"], A["elbow"], A["wrist"], A["fingertip"]
        add(f"shoulder_{k}", (side * 0.020 * s, 0, 1.470 * s), sh, "chest", False)
        add(f"upperarm_{k}", sh, el, f"shoulder_{k}", True)
        add(f"forearm_{k}", el, wr, f"upperarm_{k}", True)
        add(f"hand_{k}", wr, finger, f"forearm_{k}", True)

    for k, L in P["legs"].items():
        side = L["side"]
        hip, knee, ankle, toe = L["hip"], L["knee"], L["ankle"], L["toe"]
        add(f"thigh_{k}", hip, knee, "hips", False)
        add(f"calf_{k}", knee, ankle, f"thigh_{k}", True)
        add(f"foot_{k}", ankle, toe, f"calf_{k}", True)
        add(f"toe_{k}", toe, (toe.x, toe.y - 0.070 * s, toe.z), f"foot_{k}", True)

    bpy.ops.object.mode_set(mode="OBJECT")

    # Bone segment radii used for skin weighting.
    radii = {
        "hips": 0.19, "spine": 0.17, "spine1": 0.18, "chest": 0.20,
        "neck": 0.105, "head": 0.175,
        "shoulder": 0.100, "upperarm": 0.085, "forearm": 0.062, "hand": 0.058,
        "thigh": 0.125, "calf": 0.095, "foot": 0.090, "toe": 0.070,
    }
    segments = []
    for b in arm_data.bones:
        base = b.name.split("_")[0]
        segments.append({
            "name": b.name,
            "head": b.head_local.copy(),
            "tail": b.tail_local.copy(),
            "radius": radii.get(base, 0.08) * (P["limb"] / P["s"] if "arm" in base or base in
                                               ("thigh", "calf", "foot", "toe", "hand") else 1.0),
            "side": 1 if b.name.endswith("_L") else (-1 if b.name.endswith("_R") else 0),
        })
    return arm_obj, segments


# ---------------------------------------------------------------------------
# Skinning
# ---------------------------------------------------------------------------

def point_segment_distance(p, a, b):
    ab = b - a
    denom = ab.length_squared
    if denom < 1e-12:
        return (p - a).length
    t = max(0.0, min(1.0, (p - a).dot(ab) / denom))
    return (p - (a + ab * t)).length


def compute_weights(obj, segments, smoothing_iters=2, rigid_bone=None,
                    scale=1.0, allowed_by_region=None):
    if rigid_bone:
        for vg in list(obj.vertex_groups):
            obj.vertex_groups.remove(vg)
        vg = obj.vertex_groups.new(name=rigid_bone)
        vg.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
        return

    # Region tags let clothing follow only the bones that make anatomical
    # sense (no chest influence on sleeves, no sleeve influence on pants...).
    region_allowed = [None] * len(obj.data.vertices)
    if allowed_by_region:
        tag_lookup = {
            vg.index: vg.name for vg in obj.vertex_groups
            if vg.name in allowed_by_region
        }
        for vi, v in enumerate(obj.data.vertices):
            for g in v.groups:
                tag = tag_lookup.get(g.group)
                if tag:
                    region_allowed[vi] = set(allowed_by_region[tag])
                    break

    # Clear groups (keep region tags for now)
    for vg in list(obj.vertex_groups):
        if not vg.name.startswith("REG_"):
            obj.vertex_groups.remove(vg)

    mesh = obj.data
    nverts = len(mesh.vertices)
    weights = [dict() for _ in range(nverts)]
    use_sides = {"thigh", "calf", "foot", "toe", "shoulder", "upperarm", "forearm", "hand"}

    def anatomy_gate(base, p):
        x, y, z = p
        ax = abs(x)
        if base in ("hips", "spine", "spine1", "chest"):
            if ax > 0.26 * scale:
                return False
            if base == "chest" and z < 0.95 * scale:
                return False
            if base == "hips" and z > 1.24 * scale:
                return False
            if base in ("spine", "spine1") and z > 1.55 * scale:
                return False
            return True
        if base == "neck":
            return ax < 0.15 * scale and z > 1.35 * scale
        if base == "head":
            return ax < 0.18 * scale and z > 1.50 * scale
        if base in ("shoulder", "upperarm", "forearm", "hand"):
            if base == "shoulder":
                return ax > 0.055 * scale and z > 1.34 * scale
            if base == "upperarm" and z > 1.25 * scale:
                # Keep the upper-arm bone off the torso side. The previous
                # early return let it capture chest vertices when the arm was
                # close to the body, producing long triangular spikes during
                # the wave emote.
                if ax < 0.16 * scale:
                    return False
            if z > 1.48 * scale:
                torso_w = 0.205 * scale
            elif z > 1.25 * scale:
                torso_w = 0.192 * scale
            elif z > 1.05 * scale:
                torso_w = 0.177 * scale
            elif z > 0.88 * scale:
                torso_w = 0.190 * scale
            else:
                torso_w = 0.150 * scale
            if ax < torso_w + 0.012 * scale:
                return False
            if base == "upperarm" and z < 1.10 * scale:
                return False
            if base == "forearm" and z < 0.70 * scale:
                return False
            if base == "hand" and z < 0.70 * scale:
                return False
            return True
        if base in ("thigh", "calf", "foot", "toe"):
            if z > 1.03 * scale or ax > 0.26 * scale:
                return False
            return True
        return True

    for vi, v in enumerate(mesh.vertices):
        p = v.co
        allowed = region_allowed[vi]
        cand = []
        for seg in segments:
            base = seg["name"].split("_")[0]
            if allowed is not None:
                if seg["name"] not in allowed:
                    continue
            elif not anatomy_gate(base, p):
                continue
            if seg["side"] != 0 and base in use_sides:
                if seg["side"] == 1 and p.x < -0.012:
                    continue
                if seg["side"] == -1 and p.x > 0.012:
                    continue
            d = point_segment_distance(p, seg["head"], seg["tail"])
            r = max(0.02, seg["radius"])
            f = math.exp(-(d / (r * 1.75)) ** 2)
            # Near the shoulder caps, torso influence would pin the fabric to
            # the chest while the arm rotates. Let the shoulder/arm dominate.
            if allowed is None and base in ("chest", "neck"):
                if p.z > 1.46 * scale and abs(p.x) > 0.13 * scale:
                    f *= 0.45
            if f > 0.002:
                cand.append((f, seg["name"]))
        if not cand:
            # Transition vertices (armpit, hip crease, neck) can fall outside
            # every anatomy gate. The old fallback pinned them 100% to the
            # single nearest bone, which produced stretched triangular spikes
            # when the arm was raised. Blend the nearest few bones instead.
            pool = [
                s for s in segments
                if allowed is None or s["name"] in allowed
            ]
            pool.sort(key=lambda s: point_segment_distance(p, s["head"], s["tail"]))
            nearest = pool[:3]
            for s in nearest:
                d = point_segment_distance(p, s["head"], s["tail"])
                r = max(0.02, s["radius"])
                cand.append((math.exp(-(d / (r * 1.9)) ** 2) + 1e-4, s["name"]))
        cand.sort(reverse=True)
        cand = cand[:4]
        total = sum(w for w, _ in cand)
        for w, name in cand:
            weights[vi][name] = w / total

    # Laplacian weight smoothing across mesh edges (keeps joints supple).
    if smoothing_iters > 0:
        neighbors = [set() for _ in range(nverts)]
        for e in mesh.edges:
            a, b = e.vertices
            neighbors[a].add(b)
            neighbors[b].add(a)
        for _ in range(smoothing_iters):
            new_weights = []
            for vi in range(nverts):
                acc = dict(weights[vi])
                for name in acc:
                    acc[name] *= 0.55
                neigh = neighbors[vi]
                if neigh:
                    factor = 0.45 / len(neigh)
                    for ni in neigh:
                        for name, w in weights[ni].items():
                            acc[name] = acc.get(name, 0.0) + w * factor
                items = sorted(acc.items(), key=lambda kv: kv[1], reverse=True)[:4]
                total = sum(w for _, w in items) or 1.0
                new_weights.append({name: w / total for name, w in items})
            weights = new_weights

    # The visible upper arm sits right under the sleeve. Bind it rigidly to the
    # upper-arm bone so it can never bulge through the fabric during a swing.
    if allowed_by_region is None:
        upperarms = [s for s in segments if s["name"] in ("upperarm_L", "upperarm_R")]
        for vi, v in enumerate(mesh.vertices):
            p = v.co
            if p.z < 1.18 * scale or p.z > 1.47 * scale:
                continue
            if abs(p.x) < 0.15 * scale:
                continue
            best = None
            best_d = 1e9
            for seg in upperarms:
                d = point_segment_distance(p, seg["head"], seg["tail"])
                if d < best_d:
                    best_d = d
                    best = seg
            if best is not None and best_d < 0.070 * scale:
                weights[vi] = {best["name"]: 1.0}

    # Push to vertex groups
    group_cache = {}
    for vi, wmap in enumerate(weights):
        for name, w in wmap.items():
            if w < 0.001:
                continue
            vg = group_cache.get(name)
            if vg is None:
                vg = obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name)
                group_cache[name] = vg
            vg.add([vi], w, "REPLACE")

    # Remove the region tags; only deform bone groups should remain.
    for vg in list(obj.vertex_groups):
        if vg.name.startswith("REG_"):
            obj.vertex_groups.remove(vg)


def bind_mesh(obj, arm_obj):
    obj.parent = arm_obj
    obj.matrix_parent_inverse = arm_obj.matrix_world.inverted()
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm_obj
    mod.use_vertex_groups = True


def rigid_weights(obj, bone_name):
    for vg in list(obj.vertex_groups):
        obj.vertex_groups.remove(vg)
    vg = obj.vertex_groups.new(name=bone_name)
    vg.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")


# ---------------------------------------------------------------------------
# Animation
# ---------------------------------------------------------------------------

def reset_pose(arm_obj):
    for pb in arm_obj.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = Quaternion((1, 0, 0, 0))
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)


def set_rot(arm_obj, bone_name, rx=0.0, ry=0.0, rz=0.0):
    pb = arm_obj.pose.bones[bone_name]
    q = (Quaternion((0, 0, 1), radians(rz)) @
         Quaternion((0, 1, 0), radians(ry)) @
         Quaternion((1, 0, 0), radians(rx)))
    rest_q = pb.bone.matrix_local.to_quaternion()
    pb.rotation_quaternion = rest_q.inverted() @ q @ rest_q


def set_hips_offset(arm_obj, offset):
    pb = arm_obj.pose.bones["hips"]
    rest_q = pb.bone.matrix_local.to_quaternion()
    pb.location = rest_q.inverted() @ Vector(offset)


def aim_pose_bone(arm_obj, bone_name, direction):
    """Aim a pose bone's rest Y axis along an armature-space direction."""
    pb = arm_obj.pose.bones[bone_name]
    d = Vector(direction)
    if d.length < 1e-6:
        return
    d.normalize()
    head = pb.head.copy()
    rest_dir = (pb.bone.tail_local - pb.bone.head_local).normalized()
    rest_rot = pb.bone.matrix_local.to_3x3()
    q = rest_dir.rotation_difference(d).to_matrix()
    pb.matrix = Matrix.Translation(head) @ (q @ rest_rot).to_4x4()
    bpy.context.view_layer.update()


ANIM_BONES = [
    "spine", "spine1", "chest", "neck", "head",
    "shoulder_L", "upperarm_L", "forearm_L", "hand_L",
    "shoulder_R", "upperarm_R", "forearm_R", "hand_R",
    "thigh_L", "calf_L", "foot_L", "toe_L",
    "thigh_R", "calf_R", "foot_R", "toe_R",
]


def idle_pose(arm_obj, phase, look=False):
    breathe = sin(phase)
    settle = sin(phase * 2.0)
    set_hips_offset(arm_obj, (0.0025 * sin(phase), 0.0, 0.0035 * breathe))
    set_rot(arm_obj, "hips", rz=1.2 * sin(phase))
    set_rot(arm_obj, "spine", rx=0.8 * breathe, rz=-0.5 * sin(phase))
    set_rot(arm_obj, "spine1", rx=0.5 * breathe)
    set_rot(arm_obj, "chest", rx=-0.7 * breathe, rz=1.0 * sin(phase))
    set_rot(arm_obj, "neck", rx=0.5 * sin(phase + 0.7))
    if look:
        set_rot(arm_obj, "head", rx=2.0 * sin(phase * 2 + 0.2),
                rz=30.0 * sin(phase), ry=2.0 * sin(phase * 2))
    else:
        set_rot(arm_obj, "head", rx=1.0 * sin(phase + 0.5), rz=1.2 * sin(phase))

    # relaxed arms, a little closer to the body than the A-pose
    set_rot(arm_obj, "shoulder_L", rz=-1.5, ry=1.0 * breathe)
    set_rot(arm_obj, "shoulder_R", rz=1.5, ry=-1.0 * breathe)
    set_rot(arm_obj, "upperarm_L", rx=-1.5 * breathe, ry=9.5, rz=-1.0)
    set_rot(arm_obj, "upperarm_R", rx=-1.5 * breathe, ry=-9.5, rz=1.0)
    set_rot(arm_obj, "forearm_L", rx=-7.0 + 1.2 * settle, ry=1.0)
    set_rot(arm_obj, "forearm_R", rx=-7.0 + 1.2 * settle, ry=-1.0)
    set_rot(arm_obj, "hand_L", rx=-2.0 + 1.0 * settle)
    set_rot(arm_obj, "hand_R", rx=-2.0 + 1.0 * settle)
    set_rot(arm_obj, "thigh_L", rx=1.0 * breathe, ry=0.4)
    set_rot(arm_obj, "thigh_R", rx=1.0 * breathe, ry=-0.4)
    set_rot(arm_obj, "calf_L", rx=2.0)
    set_rot(arm_obj, "calf_R", rx=2.0)
    set_rot(arm_obj, "foot_L", rx=-1.0)
    set_rot(arm_obj, "foot_R", rx=-1.0)


def walk_pose(arm_obj, phase):
    sw = sin(phase)
    cw = cos(phase)
    set_hips_offset(arm_obj, (0.010 * sw, 0.0, -0.012 + 0.013 * cos(2 * phase)))
    set_rot(arm_obj, "hips", rz=4.0 * sw, ry=1.5 * sw)
    set_rot(arm_obj, "spine", rx=2.0, rz=-2.0 * sw)
    set_rot(arm_obj, "spine1", rx=-1.0, rz=-2.0 * sw)
    set_rot(arm_obj, "chest", rz=-3.0 * sw, rx=1.0)
    set_rot(arm_obj, "neck", rx=-1.0, rz=1.5 * sw)
    set_rot(arm_obj, "head", rz=-1.0 * sw, rx=-1.0)

    set_rot(arm_obj, "thigh_L", rx=-26.0 * sw, ry=1.0)
    set_rot(arm_obj, "thigh_R", rx=26.0 * sw, ry=-1.0)
    knee_l = 6.0 + 34.0 * max(0.0, cw) ** 1.8
    knee_r = 6.0 + 34.0 * max(0.0, -cw) ** 1.8
    set_rot(arm_obj, "calf_L", rx=knee_l)
    set_rot(arm_obj, "calf_R", rx=knee_r)
    set_rot(arm_obj, "foot_L", rx=-6.0 + 8.0 * sw - knee_l * 0.35)
    set_rot(arm_obj, "foot_R", rx=-6.0 - 8.0 * sw - knee_r * 0.35)
    set_rot(arm_obj, "toe_L", rx=4.0 * max(0.0, -sw))
    set_rot(arm_obj, "toe_R", rx=4.0 * max(0.0, sw))

    set_rot(arm_obj, "shoulder_L", rz=-1.0, ry=1.0)
    set_rot(arm_obj, "shoulder_R", rz=1.0, ry=-1.0)
    set_rot(arm_obj, "upperarm_L", rx=14.0 * sw, ry=9.5)
    set_rot(arm_obj, "upperarm_R", rx=-14.0 * sw, ry=-9.5)
    set_rot(arm_obj, "forearm_L", rx=-14.0 - 6.0 * max(0.0, sw), ry=1.0)
    set_rot(arm_obj, "forearm_R", rx=-14.0 - 6.0 * max(0.0, -sw), ry=-1.0)
    set_rot(arm_obj, "hand_L", rx=-2.0)
    set_rot(arm_obj, "hand_R", rx=-2.0)


def wave_pose(arm_obj, P, t):
    # idle body base, then a natural two-bone IK hand-up wave on the right arm
    idle_pose(arm_obj, 2 * pi * t * 0.5, look=False)

    if t < 0.16:
        k = t / 0.16
        k = k * k * (3 - 2 * k)
    elif t > 0.84:
        k = (1.0 - t) / 0.16
        k = k * k * (3 - 2 * k)
    else:
        k = 1.0

    set_hips_offset(arm_obj, (0.006 * k, 0.0, 0.002 * sin(2 * pi * t * 2)))
    set_rot(arm_obj, "hips", rz=-2.0 * k)
    set_rot(arm_obj, "spine", rx=1.0, rz=1.0 * k)
    set_rot(arm_obj, "spine1", rx=0.5, rz=1.0 * k)
    set_rot(arm_obj, "chest", rx=-1.0 * k, rz=2.0 * k)
    set_rot(arm_obj, "neck", rx=-1.0 * k, rz=-3.0 * k)
    set_rot(arm_obj, "head", rx=-1.5 * k, rz=-6.0 * k, ry=3.0 * k)
    set_rot(arm_obj, "shoulder_R", rz=1.5 - 3.0 * k, ry=-1.0 + 7.0 * k)
    bpy.context.view_layer.update()
    if k < 0.001:
        return

    pb_up = arm_obj.pose.bones["upperarm_R"]
    pb_fore = arm_obj.pose.bones["forearm_R"]
    pb_hand = arm_obj.pose.bones["hand_R"]
    S = pb_up.head.copy()
    wrist_idle = pb_hand.head.copy()
    elbow_idle = pb_fore.head.copy()

    osc = 0.0
    if 0.16 < t < 0.84:
        osc = sin(2 * pi * 3.1 * (t - 0.16) / 0.68)
    target_wave = S + Vector((
        -0.185 * P["s"] + 0.018 * P["s"] * osc,
        -0.110 * P["s"] - 0.006 * P["s"] * abs(osc),
        0.095 * P["s"] + 0.012 * P["s"] * osc,
    ))
    wrist = wrist_idle.lerp(target_wave, k)

    pole_wave = Vector((-1.0, 0.22, -0.38)).normalized()
    pole_idle = (elbow_idle - S)
    if pole_idle.length < 1e-5:
        pole_idle = Vector((-1.0, 0.0, -0.4))
    pole = pole_idle.normalized().lerp(pole_wave, k)
    if pole.length < 1e-5:
        pole = pole_wave
    pole.normalize()

    L1 = pb_up.bone.length
    L2 = pb_fore.bone.length
    to = wrist - S
    dist = max(abs(L1 - L2) + 0.004, min(L1 + L2 - 0.004, to.length))
    dn = to.normalized()
    wrist = S + dn * dist
    along = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist)
    h = math.sqrt(max(0.0, L1 * L1 - along * along))
    perp = pole - dn * pole.dot(dn)
    if perp.length < 1e-5:
        perp = Vector((0, 1, 0)) - dn * dn.y
    perp.normalize()
    elbow = S + dn * along + perp * h

    aim_pose_bone(arm_obj, "upperarm_R", elbow - S)
    aim_pose_bone(arm_obj, "forearm_R", wrist - arm_obj.pose.bones["forearm_R"].head)
    fore_dir = (wrist - arm_obj.pose.bones["forearm_R"].head)
    aim_pose_bone(arm_obj, "hand_R", fore_dir)

    set_rot(arm_obj, "upperarm_L", rx=-1.0, ry=9.5, rz=-1.0)
    set_rot(arm_obj, "forearm_L", rx=-8.0, ry=1.0)
    set_rot(arm_obj, "hand_L", rx=-2.0)
    set_rot(arm_obj, "thigh_L", ry=0.4)
    set_rot(arm_obj, "thigh_R", ry=-0.4)
    set_rot(arm_obj, "calf_L", rx=2.0)
    set_rot(arm_obj, "calf_R", rx=2.0)
    set_rot(arm_obj, "foot_L", rx=-1.0)
    set_rot(arm_obj, "foot_R", rx=-1.0)


def action_fcurves(action):
    """Blender 5.x slotted actions expose curves through channelbags."""
    if hasattr(action, "fcurves"):
        yield from action.fcurves
        return
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in strip.channelbags:
                yield from channelbag.fcurves


def bake_action(arm_obj, name, frames, pose_fn, loop=True):
    ad = arm_obj.animation_data or arm_obj.animation_data_create()
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    ad.action = action

    # frames: number of intervals; key at frames 1..frames+1 for a loop,
    # or 1..frames for a one-shot.
    end = frames + 1 if loop else frames
    step = 2 if frames <= 48 else 4
    keyed = 0
    for f in range(1, end + 1, step):
        reset_pose(arm_obj)
        t = (f - 1) / frames
        if loop:
            pose_fn(t)
        else:
            pose_fn(t)
        bpy.context.view_layer.update()
        for bname in ANIM_BONES:
            arm_obj.pose.bones[bname].keyframe_insert("rotation_quaternion", frame=f)
        arm_obj.pose.bones["hips"].keyframe_insert("location", frame=f)
        keyed += 1
    if (end - 1) % step != 0:
        # make sure the final pose is exact for a clean loop
        reset_pose(arm_obj)
        t = 1.0 if loop else 1.0
        pose_fn(t)
        bpy.context.view_layer.update()
        for bname in ANIM_BONES:
            arm_obj.pose.bones[bname].keyframe_insert("rotation_quaternion", frame=end)
        arm_obj.pose.bones["hips"].keyframe_insert("location", frame=end)
        keyed += 1

    curves = list(action_fcurves(action))
    for fc in curves:
        for kp in fc.keyframe_points:
            kp.interpolation = "BEZIER"
            kp.handle_left_type = "AUTO_CLAMPED"
            kp.handle_right_type = "AUTO_CLAMPED"
    print(f"  [anim] {name}: {end} frames, {keyed} keys, {len(curves)} curves")
    ad.action = None
    reset_pose(arm_obj)
    return action


def create_animations(arm_obj, P):
    idle_frames = 120
    look_frames = 180
    walk_frames = 32
    wave_frames = 96

    act_idle = bake_action(
        arm_obj, "idle", idle_frames,
        lambda t: idle_pose(arm_obj, 2 * pi * t, look=False), loop=True
    )
    act_look = bake_action(
        arm_obj, "look_around", look_frames,
        lambda t: idle_pose(arm_obj, 2 * pi * t, look=True), loop=True
    )
    act_walk = bake_action(
        arm_obj, "walk", walk_frames,
        lambda t: walk_pose(arm_obj, 2 * pi * t), loop=True
    )
    act_wave = bake_action(
        arm_obj, "wave", wave_frames,
        lambda t: wave_pose(arm_obj, P, t), loop=False
    )
    return {"idle": act_idle, "look_around": act_look, "walk": act_walk, "wave": act_wave}


def stash_actions(arm_obj, actions):
    """Expose each clip as an NLA track so glTF NLA_TRACKS export is scoped
    to this armature and cannot leak actions from the other character."""
    ad = arm_obj.animation_data or arm_obj.animation_data_create()
    ad.action = None
    for name in ("idle", "look_around", "walk", "wave"):
        act = actions[name]
        track = ad.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, int(act.frame_range[0]), act)
        strip.name = name
        # Muted tracks still export in NLA_TRACKS mode, and muting lets the
        # preview/active action play without NLA layering.
        track.mute = True
    ad.action = actions["idle"]


# ---------------------------------------------------------------------------
# Build a character
# ---------------------------------------------------------------------------

def build_character(key, cfg):
    print(f"\n=== Building {cfg['label']} ===")
    P = build_proportions(cfg)
    body = build_body(P, key)
    head = build_head(P, key)
    hand_objs = build_hands(P, key)
    jersey = build_jersey(P, key)
    pants = build_pants(P, key)
    shoes = build_shoes(P, key)

    # Face details use raycasts against the finished head, so build them before
    # merging the head into the body.
    face_details = build_face_details(P, key, head)
    hair = build_hair(P, key, head)

    # Jersey marks use raycasts against the finished garment.
    jersey_marks = make_jersey_marks(P, key, jersey)

    # Merge the base head into the body mesh (same skin material), keep hands
    # separate so they can be rigidly bound to the hand bones.
    body = join_objects([body, head], f"{P['id']}_Body")
    set_material(body, MAT_SKIN[key])
    shade_smooth(body)

    head_details = join_objects(face_details + [hair], f"{P['id']}_HeadDetails")
    shade_smooth(head_details)

    rig, segments = create_rig(P)

    allowed_regions = {
        "REG_torso": {"hips", "spine", "spine1", "chest", "neck",
                      "shoulder_L", "shoulder_R"},
        "REG_sleeve_L": {"upperarm_L"},
        "REG_sleeve_R": {"upperarm_R"},
        "REG_pants_L": {"hips", "thigh_L", "calf_L", "foot_L"},
        "REG_pants_R": {"hips", "thigh_R", "calf_R", "foot_R"},
        "REG_pants_seat": {"hips", "thigh_L", "thigh_R"},
        "REG_shoe_L": {"calf_L", "foot_L", "toe_L"},
        "REG_shoe_R": {"calf_R", "foot_R", "toe_R"},
    }

    compute_weights(body, segments, smoothing_iters=4, scale=P["s"])
    bind_mesh(body, rig)

    # Each hand -> its hand bone
    for hobj in hand_objs:
        bone = "hand_L" if hobj.name.endswith("_L") else "hand_R"
        rigid_weights(hobj, bone)
        bind_mesh(hobj, rig)

    rigid_weights(head_details, "head")
    bind_mesh(head_details, rig)

    compute_weights(jersey, segments, smoothing_iters=2, scale=P["s"],
                    allowed_by_region=allowed_regions)
    bind_mesh(jersey, rig)

    compute_weights(pants, segments, smoothing_iters=2, scale=P["s"],
                    allowed_by_region=allowed_regions)
    bind_mesh(pants, rig)

    compute_weights(shoes, segments, smoothing_iters=1, scale=P["s"],
                    allowed_by_region=allowed_regions)
    bind_mesh(shoes, rig)

    if jersey_marks:
        rigid_weights(jersey_marks, "chest")
        bind_mesh(jersey_marks, rig)

    actions = create_animations(rig, P)
    stash_actions(rig, actions)

    # Store some useful metadata
    rig["character"] = cfg["label"]
    rig["height_m"] = round(P["height"], 2)
    rig["rig_type"] = "humanoid"
    rig["clips"] = "idle,walk,look_around,wave"

    print(f"=== Finished {cfg['label']} ===")
    return {
        "key": key, "P": P, "rig": rig, "actions": actions,
        "objects": [body] + hand_objs + [head_details, jersey, pants, shoes,
                                        jersey_marks],
        "armature": rig,
    }


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

def export_glb(char, path):
    rig = char["rig"]
    data_objects = [rig] + [o for o in char["objects"] if o]
    select_only(data_objects)
    bpy.context.view_layer.objects.active = rig

    # Use the rest pose for the bind pose; animations still export as actions.
    ad = rig.animation_data
    if ad:
        ad.action = None
    reset_pose(rig)
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()

    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_yup=True,
        export_skins=True,
        export_influence_nb=4,
        export_all_influences=False,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_rest_position_armature=True,
        export_force_sampling=True,
        export_bake_animation=False,
        export_anim_slide_to_zero=True,
        export_optimize_animation_size=True,
        export_optimize_animation_keep_anim_armature=True,
        export_anim_single_armature=True,
        export_materials="EXPORT",
        export_extras=True,
        export_cameras=False,
        export_lights=False,
    )
    print(f"  [glb] wrote {path} ({os.path.getsize(path) / (1024 * 1024):.2f} MB)")


# ---------------------------------------------------------------------------
# Preview scene / rendering
# ---------------------------------------------------------------------------

def look_at(camera, target):
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def setup_preview():
    activate_collection(PREVIEW_COLL)
    world = bpy.data.worlds.new("StudioWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.010, 0.015, 0.025, 1.0)
    bg.inputs[1].default_value = 0.6

    # Sweeping studio cyclorama: flat floor + curved wall.
    verts = []
    faces = []
    xs = [-7.0, -4.0, -2.0, 0.0, 2.0, 4.0, 7.0]
    # floor strip
    floor_y = [-6.0, -3.0, -1.0, 0.0, 0.8]
    for x in xs:
        for y in floor_y:
            verts.append((x, y, 0.0))
    nx = len(xs)
    ny = len(floor_y)
    for ix in range(nx - 1):
        for iy in range(ny - 1):
            a = ix * ny + iy
            b = (ix + 1) * ny + iy
            faces.append((a, b, b + 1, a + 1))
    # curved wall rising from y=0.8
    arc_steps = 12
    radius = 2.4
    base_index = len(verts)
    for x in xs:
        for i in range(arc_steps + 1):
            ang = (pi / 2) * i / arc_steps
            y = 0.8 + radius * (1 - cos(ang))
            z = radius * sin(ang)
            verts.append((x, y, z))
    for ix in range(nx - 1):
        for i in range(arc_steps):
            a = base_index + ix * (arc_steps + 1) + i
            b = base_index + (ix + 1) * (arc_steps + 1) + i
            faces.append((a, b, b + 1, a + 1))
    mesh = bpy.data.meshes.new("StudioCyclorama")
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()
    cyc = bpy.data.objects.new("StudioCyclorama", mesh)
    PREVIEW_COLL.objects.link(cyc)
    ground_mat = make_material("Studio_Backdrop", "#4E545F", 0.86)
    set_material(cyc, ground_mat)
    shade_smooth(cyc)

    # Lights
    def area(name, loc, target, power, size, color):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = power
        data.shape = "DISK"
        data.size = size
        data.color = color
        ob = bpy.data.objects.new(name, data)
        PREVIEW_COLL.objects.link(ob)
        ob.location = loc
        look_at(ob, target)
        return ob

    area("Key", (-2.8, -3.4, 3.2), (0, 0, 1.25), 430, 2.2, (1.0, 0.93, 0.84))
    area("Fill", (2.6, -2.2, 2.0), (0, 0, 1.1), 150, 2.4, (0.72, 0.84, 1.0))
    area("Rim", (1.1, 2.6, 3.4), (0, 0, 1.4), 500, 1.8, (0.55, 0.72, 1.0))
    area("Top", (0, 0.2, 4.6), (0, 0, 1.2), 120, 2.5, (1.0, 1.0, 1.0))

    # Camera
    cam_data = bpy.data.cameras.new("PreviewCamera")
    cam_data.lens = 78
    cam_data.sensor_width = 36
    cam = bpy.data.objects.new("PreviewCamera", cam_data)
    PREVIEW_COLL.objects.link(cam)
    scene.camera = cam

    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1200
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.eevee.taa_render_samples = 128 if not QUICK else 16
    scene.eevee.use_shadows = True
    try:
        scene.eevee.use_raytracing = True
    except Exception:
        pass
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.exposure = 0.0
    scene.view_settings.look = "AgX - Medium High Contrast"
    return cam


def render_shot(cam, loc, target, path, lens=78):
    cam.data.lens = lens
    cam.location = loc
    look_at(cam, target)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"  [render] {path}")


def set_action(char, name, frame=1):
    rig = char["rig"]
    ad = rig.animation_data or rig.animation_data_create()
    ad.action = char["actions"][name]
    scene.frame_set(frame)


def clear_action(char):
    ad = char["rig"].animation_data
    if ad:
        ad.action = None
    reset_pose(char["rig"])


def hide_character(char, hidden=True):
    for ob in [char["rig"]] + char["objects"]:
        if ob:
            ob.hide_render = hidden
            ob.hide_viewport = hidden


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    chars = {}
    for key in ("a", "b"):
        chars[key] = build_character(key, CHARS[key])
        path = os.path.join(OUT_DIR, f"{chars[key]['P']['id']}.glb")
        export_glb(chars[key], path)

    # Move the characters into a studio lineup for the source file/previews.
    chars["a"]["rig"].location.x = -0.54
    chars["b"]["rig"].location.x = 0.54

    cam = setup_preview()

    # Rest/idle default in the saved blend
    set_action(chars["a"], "idle", 1)
    set_action(chars["b"], "idle", 1)
    scene.frame_start = 1
    scene.frame_end = 121
    scene.frame_set(1)

    if DO_RENDER:
        # lineup
        hide_character(chars["a"], False)
        hide_character(chars["b"], False)
        render_shot(cam, (0.0, -5.4, 1.28), (0, 0, 1.10),
                    os.path.join(PREV_DIR, "01_crew_lineup.png"), lens=72)

        # individual front / back / face
        for key, tag in (("a", "02_crew_a"), ("b", "03_crew_b")):
            hide_character(chars["a"], True)
            hide_character(chars["b"], True)
            hide_character(chars[key], False)
            set_action(chars[key], "idle", 1)
            pos = chars[key]["rig"].location.x
            render_shot(cam, (pos, -3.65, 1.12), (pos, 0, 1.01),
                        os.path.join(PREV_DIR, f"{tag}_front.png"), lens=82)
            # The studio cyclorama faces the front camera; turn the character
            # around for a clean back view instead of moving the camera behind
            # the backdrop.
            rig = chars[key]["rig"]
            old_rot = rig.rotation_euler.copy()
            rig.rotation_euler[2] = pi
            bpy.context.view_layer.update()
            render_shot(cam, (pos, -3.65, 1.12), (pos, 0, 1.01),
                        os.path.join(PREV_DIR, f"{tag}_back.png"), lens=82)
            rig.rotation_euler = old_rot
            bpy.context.view_layer.update()
            head_z = chars[key]["P"]["head_c_z"]
            render_shot(cam, (pos + 0.20, -1.12, head_z + 0.012),
                        (pos, 0, head_z - 0.012),
                        os.path.join(PREV_DIR, f"{tag}_face.png"), lens=95)

        # rig demos
        hide_character(chars["a"], True)
        hide_character(chars["b"], True)
        hide_character(chars["a"], False)
        set_action(chars["a"], "wave", 38)
        pa = chars["a"]["rig"].location.x
        render_shot(cam, (pa - 0.16, -4.25, 1.28), (pa, 0, 1.12),
                    os.path.join(PREV_DIR, "08_crew_a_wave.png"), lens=72)
        hide_character(chars["a"], True)
        hide_character(chars["b"], False)
        set_action(chars["b"], "walk", 9)
        pb = chars["b"]["rig"].location.x
        render_shot(cam, (pb + 1.05, -2.9, 1.28), (pb, 0, 1.02),
                    os.path.join(PREV_DIR, "09_crew_b_walk.png"), lens=80)

        # reset to idle
        set_action(chars["a"], "idle", 1)
        set_action(chars["b"], "idle", 1)
        hide_character(chars["a"], False)
        hide_character(chars["b"], False)

    # Embed a small rig readme in the .blend
    text = bpy.data.texts.new("README_RIG")
    text.write(
        "INTERFELLAS — CREW CHARACTERS\n"
        "=============================\n"
        "Two rigged, game-ready crew characters in blue jerseys and pants.\n\n"
        "Files:\n"
        "  public/models/crew/crew_a.glb\n"
        "  public/models/crew/crew_b.glb\n\n"
        "Scale: metres. Feet at Z=0 (Blender), Y=0 in glTF.\n"
        "Facing: -Y in Blender -> +Z in glTF.\n\n"
        "Bones: hips, spine, spine1, chest, neck, head,\n"
        "       shoulder_L/R, upperarm_L/R, forearm_L/R, hand_L/R,\n"
        "       thigh_L/R, calf_L/R, foot_L/R, toe_L/R.\n\n"
        "Clips: idle (4.0s), walk (1.07s), look_around (6.0s), wave (3.2s).\n"
        "Materials use Principled BSDF and export as glTF PBR.\n"
        "Regenerate with: blender -b --factory-startup --python scripts/crew/build_crew.py\n"
    )

    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
    print(f"\nSaved {BLEND_PATH}")

    # Validate the exported GLBs from Python (JSON chunk).
    for key in ("a", "b"):
        glb = os.path.join(OUT_DIR, f"{chars[key]['P']['id']}.glb")
        print(f"  -> {glb} exists: {os.path.exists(glb)}")


if __name__ == "__main__":
    main()
