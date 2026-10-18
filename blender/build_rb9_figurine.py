"""
Build a 1:18 collectible-style figurine of the 2013 Red Bull RB9 and export it
as a GLB for the portfolio.

The livery uses the RB9's colours only (dark blue, purple, yellow and red) and
carries no team, sponsor or series logos. Proportions follow the car's
published dimensions: 5,080 mm long, 1,800 mm wide, 950 mm tall, 3,100 mm
wheelbase, 13-inch wheels (12 in wide front, 13.7 in rear), car number 1.

Everything is modelled at 1:1 in metres (X forward, Y left, Z up) and scaled to
1:18 on export. Exported nodes:
  rb9 (root, 1:18 scale)
    body       every static part, merged and grouped by material
    drs_flap   upper rear-wing element, origin on its pivot (trailing edge)
    wheel_fl / wheel_fr / wheel_rl / wheel_rr   origin on the hub centre

Usage:
  blender -b -P blender/build_rb9_figurine.py -- \
      --out public/models/rb9.glb [--preview /tmp/rb9-preview] [--samples 64]
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

# ---------------------------------------------------------------------------
# Arguments
# ---------------------------------------------------------------------------


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    opts = {"out": None, "preview": None, "samples": "64"}
    for i, token in enumerate(argv):
        key = token.lstrip("-")
        if key in opts and i + 1 < len(argv):
            opts[key] = argv[i + 1]
    opts["samples"] = int(opts["samples"])
    return opts


ARGS = parse_args()

# ---------------------------------------------------------------------------
# Car constants (metres, 1:1)
# ---------------------------------------------------------------------------

SCALE = 1.0 / 18.0
RAKE_DEG = 1.1  # nose-down stance: Red Bull ran a lot of rake in this era
FRONT_AXLE_X = 1.55
REAR_AXLE_X = -1.55  # 3,100 mm wheelbase
TYRE_R = 0.33  # 660 mm tyres on 13-inch rims
FRONT_TYRE_W = 0.325
REAR_TYRE_W = 0.375
FRONT_TRACK_Y = 0.90 - FRONT_TYRE_W / 2  # outer tyre faces at the 1,800 mm width
REAR_TRACK_Y = 0.90 - REAR_TYRE_W / 2

RAKE = (
    Matrix.Translation((FRONT_AXLE_X, 0.0, 0.10))
    @ Matrix.Rotation(math.radians(RAKE_DEG), 4, "Y")
    @ Matrix.Translation((-FRONT_AXLE_X, 0.0, -0.10))
)
IDENTITY = Matrix.Identity(4)

# ---------------------------------------------------------------------------
# Materials. The web app replaces these by name with tuned three.js materials;
# the values here drive the Blender preview renders.
# ---------------------------------------------------------------------------

MATERIAL_SPECS = {
    # name: (sRGB hex, metallic, roughness, clear coat, emission strength)
    "paint_navy": ("#1B2150", 0.35, 0.34, 1.0, 0.0),
    "paint_purple": ("#4B2D8F", 0.35, 0.34, 1.0, 0.0),
    "paint_yellow": ("#F5C400", 0.10, 0.30, 1.0, 0.0),
    "paint_red": ("#D3122E", 0.10, 0.30, 1.0, 0.0),
    "carbon": ("#141518", 0.20, 0.38, 0.6, 0.0),
    "rubber": ("#161616", 0.00, 0.78, 0.0, 0.0),
    "tyre_band": ("#F2C200", 0.00, 0.55, 0.0, 0.0),
    "rim_metal": ("#B8BDC4", 1.00, 0.24, 0.0, 0.0),
    "hub_dark": ("#2B2D31", 0.85, 0.35, 0.0, 0.0),
    "helmet_white": ("#F1F1EE", 0.00, 0.22, 1.0, 0.0),
    "helmet_red": ("#C8102E", 0.00, 0.25, 1.0, 0.0),
    "visor": ("#0A0C12", 0.60, 0.06, 1.0, 0.0),
    "mirror_glass": ("#A7AFB8", 1.00, 0.03, 0.0, 0.0),
    "decal_white": ("#F4F4F2", 0.00, 0.40, 1.0, 0.0),
    "padding": ("#191D38", 0.00, 0.80, 0.0, 0.0),
    "inlet_black": ("#040405", 0.00, 0.90, 0.0, 0.0),
    "rain_light": ("#FF2A1F", 0.00, 0.30, 0.0, 2.0),
}

MATS = {}


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(value):
    value = value.lstrip("#")
    rgb = [srgb_to_linear(int(value[i:i + 2], 16) / 255.0) for i in (0, 2, 4)]
    return (rgb[0], rgb[1], rgb[2], 1.0)


def set_input(node, name, value):
    if name in node.inputs:
        node.inputs[name].default_value = value


def principled(material):
    if material.node_tree is None:
        try:
            material.use_nodes = True
        except AttributeError:
            pass
    return next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def new_material(name, hex_colour, metallic, roughness, coat, emission):
    material = bpy.data.materials.new(name)
    bsdf = principled(material)
    colour = hex_rgba(hex_colour)
    set_input(bsdf, "Base Color", colour)
    set_input(bsdf, "Metallic", metallic)
    set_input(bsdf, "Roughness", roughness)
    set_input(bsdf, "Coat Weight", coat)
    set_input(bsdf, "Coat Roughness", 0.04)
    if emission:
        set_input(bsdf, "Emission Color", colour)
        set_input(bsdf, "Emission Strength", emission)
    material.diffuse_color = colour
    return material


def build_materials():
    for name, spec in MATERIAL_SPECS.items():
        MATS[name] = new_material(name, *spec)


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def make_object(name, bm, materials, smooth=True, subdiv=0, bevel=0.0):
    """Turn a bmesh into a linked object. Face material indices refer to
    `materials` in order."""
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for material in materials:
        mesh.materials.append(MATS[material])
    for poly in mesh.polygons:
        poly.use_smooth = smooth
    obj = link(bpy.data.objects.new(name, mesh))
    if bevel > 0:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40)
    if subdiv > 0:
        mod = obj.modifiers.new("subdivision", "SUBSURF")
        mod.levels = subdiv
        mod.render_levels = subdiv
    return obj


def recalc(bm):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.normal_update()
    return bm


def assign(bm, pick):
    """Set each face's material index from pick(face_centre, face_normal)."""
    bm.normal_update()
    for face in bm.faces:
        face.material_index = pick(face.calc_center_median(), face.normal)
    return bm


def append_bmesh(dst, src):
    vmap = {v: dst.verts.new(v.co) for v in src.verts}
    for face in src.faces:
        new_face = dst.faces.new([vmap[v] for v in face.verts])
        new_face.material_index = face.material_index
        new_face.smooth = face.smooth


def loft(rings, cap_start=True, cap_end=True, closed_path=False):
    """Skin a list of equal-length point rings into a closed shell."""
    bm = bmesh.new()
    vrings = [[bm.verts.new(p) for p in ring] for ring in rings]
    n = len(rings[0])
    pairs = list(zip(vrings[:-1], vrings[1:]))
    if closed_path:
        pairs.append((vrings[-1], vrings[0]))
    for a, b in pairs:
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if not closed_path:
        if cap_start:
            bm.faces.new(vrings[0])
        if cap_end:
            bm.faces.new(vrings[-1])
    return recalc(bm)


def disc(ring, axis):
    """A thin closed plate from a ring of points, thickness along `axis`."""
    half = axis * 0.5
    return loft([[p + half for p in ring], [p - half for p in ring]])


def body_ring(x, hw, z_top, z_bot, waist=0.45, n_top=2.6, n_bot=3.5, cy=0.0, count=32):
    """Cross-section perpendicular to X: a superellipse whose top and bottom
    halves can have different heights and squareness."""
    cz = z_bot + (z_top - z_bot) * waist
    h_top, h_bot = z_top - cz, cz - z_bot
    pts = []
    for i in range(count):
        t = 2.0 * math.pi * i / count
        c, s = math.cos(t), math.sin(t)
        n = n_top if s >= 0 else n_bot
        y = cy + hw * math.copysign(abs(c) ** (2.0 / n), c)
        z = cz + (h_top if s >= 0 else h_bot) * math.copysign(abs(s) ** (2.0 / n), s)
        pts.append(Vector((x, y, z)))
    return pts


def naca4(m, p, t, n=18):
    """Closed NACA 4-digit outline as (u, v) pairs, chord 0..1: trailing edge
    over the top to the leading edge and back along the bottom."""
    upper, lower = [], []
    for i in range(n + 1):
        u = 0.5 * (1.0 - math.cos(math.pi * i / n))
        yt = 5.0 * t * (0.2969 * math.sqrt(u) - 0.1260 * u - 0.3516 * u ** 2
                        + 0.2843 * u ** 3 - 0.1015 * u ** 4)
        if u < p:
            yc = m / p ** 2 * (2 * p * u - u ** 2)
            dyc = 2 * m / p ** 2 * (p - u)
        else:
            yc = m / (1 - p) ** 2 * ((1 - 2 * p) + 2 * p * u - u ** 2)
            dyc = 2 * m / (1 - p) ** 2 * (p - u)
        th = math.atan(dyc)
        upper.append((u - yt * math.sin(th), yc + yt * math.cos(th)))
        lower.append((u + yt * math.sin(th), yc - yt * math.cos(th)))
    return list(reversed(upper)) + lower[1:]


def wing_ring(y, le_x, le_z, chord, angle_deg, foil):
    """Airfoil section at span position y. Positive angle lifts the trailing
    edge (air flows towards -X); camber is inverted for downforce."""
    a = math.radians(angle_deg)
    along = Vector((-math.cos(a), 0.0, math.sin(a)))
    normal = Vector((math.sin(a), 0.0, math.cos(a)))
    le = Vector((le_x, y, le_z))
    return [le + along * (u * chord) - normal * (v * chord) for u, v in foil]


def plate(outline, plane, offset, thickness):
    """Extrude a 2D outline into a thin plate. plane 'XZ' (normal Y),
    'XY' (normal Z) or 'YZ' (normal X)."""

    def to3(a, b, w):
        if plane == "XZ":
            return Vector((a, w, b))
        if plane == "XY":
            return Vector((a, b, w))
        return Vector((w, a, b))

    bm = bmesh.new()
    lo = [bm.verts.new(to3(a, b, offset - thickness / 2)) for a, b in outline]
    hi = [bm.verts.new(to3(a, b, offset + thickness / 2)) for a, b in outline]
    bm.faces.new(lo)
    bm.faces.new(hi)
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    return recalc(bm)


def lathe(profile, segments=72):
    """Revolve a closed (radius, axial) profile around the Y axis (the axle)."""
    bm = bmesh.new()
    rings = []
    for k in range(segments):
        th = 2.0 * math.pi * k / segments
        c, s = math.cos(th), math.sin(th)
        rings.append([bm.verts.new((r * c, a, r * s)) for r, a in profile])
    n = len(profile)
    for k in range(segments):
        ring_a, ring_b = rings[k], rings[(k + 1) % segments]
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((ring_a[i], ring_a[j], ring_b[j], ring_b[i]))
    return recalc(bm)


def rod(p1, p2, radius, flatten=1.0, segments=10):
    """Tube between two points. flatten < 1 squashes it vertically, like an
    aerodynamic wishbone."""
    p1, p2 = Vector(p1), Vector(p2)
    d = p2 - p1
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments,
                          radius1=radius, radius2=radius, depth=d.length)
    bmesh.ops.scale(bm, vec=(1.0, flatten, 1.0), verts=bm.verts)
    rot = d.normalized().to_track_quat("Z", "Y").to_matrix().to_4x4()
    bm.transform(Matrix.Translation((p1 + p2) / 2) @ rot)
    return recalc(bm)


def box(center, size):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    bmesh.ops.translate(bm, vec=center, verts=bm.verts)
    return recalc(bm)


def ellipsoid(center, radii, u=24, v=12):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=1.0)
    bmesh.ops.scale(bm, vec=radii, verts=bm.verts)
    bmesh.ops.translate(bm, vec=center, verts=bm.verts)
    return recalc(bm)


def sweep_closed(path, radius, segments=8):
    """Tube following a closed path."""
    rings = []
    n = len(path)
    for i, p in enumerate(path):
        tangent = (path[(i + 1) % n] - path[i - 1]).normalized()
        side = tangent.cross(Vector((0, 0, 1))).normalized()
        up = side.cross(tangent).normalized()
        ring = []
        for k in range(segments):
            a = 2.0 * math.pi * k / segments
            ring.append(p + (side * math.cos(a) + up * math.sin(a)) * radius)
        rings.append(ring)
    return loft(rings, closed_path=True)


def text_bm(body, size, depth):
    curve = bpy.data.curves.new("text", type="FONT")
    curve.body = body
    curve.size = size
    curve.extrude = depth
    curve.offset = size * 0.035  # embolden the thin default font
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    obj = link(bpy.data.objects.new("text", curve))
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.curves.remove(curve)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bpy.data.meshes.remove(mesh)
    return recalc(bm)


def merge_parts(name, parts):
    """Merge (object, transform) pairs into one mesh object with modifiers
    applied, keeping per-face materials and smoothing."""
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    order = []
    combined = bmesh.new()
    for obj, xform in parts:
        tmp = bmesh.new()
        tmp.from_object(obj, depsgraph)
        tmp.transform(xform @ obj.matrix_world)
        names = [slot.material.name for slot in obj.material_slots]
        for mat_name in names:
            if mat_name not in order:
                order.append(mat_name)
        for face in tmp.faces:
            idx = min(face.material_index, len(names) - 1)
            face.material_index = order.index(names[idx])
        append_bmesh(combined, tmp)
        tmp.free()
    for obj, _ in parts:
        bpy.data.objects.remove(obj, do_unlink=True)
    mesh = bpy.data.meshes.new(name)
    combined.to_mesh(mesh)
    combined.free()
    for mat_name in order:
        mesh.materials.append(MATS[mat_name])
    return link(bpy.data.objects.new(name, mesh))


# ---------------------------------------------------------------------------
# Body shapes
# ---------------------------------------------------------------------------

# Monocoque, nose and engine cover as one loft.
# (x, half width, top z, bottom z, waist, top squareness, bottom squareness)
CHASSIS = [
    (2.37, 0.070, 0.472, 0.408, 0.50, 2.4, 2.4),
    (2.34, 0.112, 0.495, 0.385, 0.50, 2.4, 2.8),
    (2.26, 0.122, 0.505, 0.370, 0.50, 2.6, 3.0),
    (2.05, 0.132, 0.525, 0.350, 0.50, 2.8, 3.2),
    (1.80, 0.140, 0.550, 0.320, 0.48, 3.0, 3.4),
    (1.55, 0.150, 0.575, 0.285, 0.46, 3.0, 3.4),
    (1.30, 0.162, 0.600, 0.240, 0.44, 3.2, 3.4),
    (1.05, 0.185, 0.625, 0.160, 0.42, 3.4, 3.6),
    (0.80, 0.228, 0.655, 0.085, 0.40, 4.0, 3.8),
    (0.55, 0.262, 0.690, 0.065, 0.38, 6.0, 4.0),
    (0.30, 0.280, 0.705, 0.062, 0.36, 6.0, 4.0),
    (0.05, 0.285, 0.708, 0.062, 0.36, 6.0, 4.0),
    (-0.15, 0.282, 0.712, 0.062, 0.38, 4.5, 4.0),
    (-0.45, 0.258, 0.690, 0.062, 0.40, 3.2, 4.0),
    (-0.80, 0.212, 0.625, 0.064, 0.42, 3.0, 4.0),
    (-1.10, 0.168, 0.550, 0.080, 0.44, 2.8, 3.6),
    (-1.40, 0.128, 0.480, 0.110, 0.46, 2.6, 3.2),
    (-1.70, 0.098, 0.425, 0.140, 0.48, 2.5, 3.0),
    (-1.95, 0.074, 0.385, 0.170, 0.50, 2.4, 2.8),
    (-2.10, 0.050, 0.350, 0.200, 0.50, 2.4, 2.6),
    (-2.14, 0.028, 0.330, 0.220, 0.50, 2.4, 2.4),
]

# Sidepods with the RB9's deep undercut and steep downwash ramp.
# (x, centre y, half width, top z, bottom z, waist, top sq., bottom sq.)
SIDEPOD = [
    (0.74, 0.440, 0.185, 0.560, 0.260, 0.45, 3.6, 3.4),
    (0.62, 0.438, 0.205, 0.580, 0.215, 0.45, 4.0, 3.8),
    (0.35, 0.425, 0.205, 0.572, 0.150, 0.50, 4.2, 4.2),
    (0.00, 0.395, 0.190, 0.525, 0.092, 0.55, 4.0, 4.4),
    (-0.35, 0.355, 0.165, 0.455, 0.075, 0.55, 3.6, 4.5),
    (-0.70, 0.305, 0.130, 0.380, 0.072, 0.55, 3.2, 4.5),
    (-1.00, 0.255, 0.092, 0.315, 0.072, 0.55, 2.6, 4.2),
    (-1.22, 0.215, 0.055, 0.262, 0.078, 0.55, 2.4, 3.6),
    (-1.36, 0.185, 0.028, 0.228, 0.092, 0.55, 2.2, 3.0),
]

# Airbox above and behind the driver, flaring into the engine cover:
# (x, half width, bottom z, top z)
AIRBOX = [
    (0.040, 0.112, 0.650, 0.952),
    (-0.060, 0.125, 0.645, 0.958),
    (-0.220, 0.150, 0.630, 0.925),
    (-0.420, 0.175, 0.600, 0.845),
    (-0.620, 0.185, 0.560, 0.745),
    (-0.840, 0.170, 0.520, 0.652),
    (-1.050, 0.140, 0.480, 0.572),
]


def station_at(stations, x):
    if x >= stations[0][0]:
        return stations[0]
    if x <= stations[-1][0]:
        return stations[-1]
    for a, b in zip(stations, stations[1:]):
        if a[0] >= x >= b[0]:
            t = (a[0] - x) / (a[0] - b[0])
            return tuple(av + (bv - av) * t for av, bv in zip(a, b))
    return stations[-1]


def chassis_half_width(x, z):
    _, hw, z_top, z_bot, waist, n_top, n_bot = station_at(CHASSIS, x)
    cz = z_bot + (z_top - z_bot) * waist
    h, n = (z_top - cz, n_top) if z >= cz else (cz - z_bot, n_bot)
    r = min(1.0, abs(z - cz) / h)
    return hw * (1.0 - r ** n) ** (1.0 / n)


def chassis_top(x):
    return station_at(CHASSIS, x)[2]


def airbox_ring(x, hw, z_bot, z_top, count=28):
    """Rounded section whose top is pinched into the RB9's triangular intake."""
    cz = z_bot + (z_top - z_bot) * 0.45
    pts = []
    for i in range(count):
        t = 2.0 * math.pi * i / count
        c, s = math.cos(t), math.sin(t)
        n = 2.4 if s >= 0 else 3.5
        y = hw * math.copysign(abs(c) ** (2.0 / n), c)
        h = (z_top - cz) if s >= 0 else (cz - z_bot)
        z = cz + h * math.copysign(abs(s) ** (2.0 / n), s)
        k = max(0.0, (z - cz) / (z_top - cz))
        y *= 1.0 - 0.55 * k ** 1.4
        pts.append(Vector((x, y, z)))
    return pts


def build_chassis():
    rings = [body_ring(x, hw, zt, zb, w, nt, nb) for (x, hw, zt, zb, w, nt, nb) in CHASSIS]
    bm = loft(rings)

    assign(bm, lambda c, n: 1 if c.x > 1.90 else 0)  # yellow nose tip
    return [make_object("chassis", bm, ["paint_navy", "paint_yellow"], subdiv=2)]


def build_airbox():
    parts = []
    bm = loft([airbox_ring(*row) for row in AIRBOX])
    assign(bm, lambda c, n: 1 if c.x > -0.36 else 0)  # yellow intake, blue spine
    parts.append(make_object("airbox", bm, ["paint_navy", "paint_yellow"], subdiv=2))

    front = airbox_ring(0.043, *AIRBOX[0][1:])
    centre = sum(front, Vector()) / len(front)
    intake = [centre + (p - centre) * 0.68 + Vector((0, 0, 0.012)) for p in front]
    parts.append(make_object("airbox_intake", disc(intake, Vector((0.004, 0, 0))), ["inlet_black"]))

    parts.append(make_object("tcam", box((-0.07, 0.0, 0.972), (0.12, 0.07, 0.026)),
                             ["inlet_black"], smooth=False, bevel=0.006))
    return parts


def build_sidepods():
    parts = []
    for s in (1, -1):
        rings = [body_ring(x, hw, zt, zb, w, nt, nb, cy=s * cy)
                 for (x, cy, hw, zt, zb, w, nt, nb) in SIDEPOD]
        bm = loft(rings)
        # purple on the outward flank, dark blue on top
        assign(bm, lambda c, n, s=s: 1 if (n.y * s > 0.45 and n.z < 0.55) else 0)
        tag = "l" if s > 0 else "r"
        parts.append(make_object(f"sidepod_{tag}", bm, ["paint_navy", "paint_purple"], subdiv=2))

        x0, cy, hw, zt, zb, w, nt, nb = SIDEPOD[0]
        inlet = body_ring(x0 + 0.006, hw * 0.74, zb + (zt - zb) * 0.88, zb + (zt - zb) * 0.22,
                          0.5, nt, nb, cy=s * (cy + 0.006))
        parts.append(make_object(f"sidepod_inlet_{tag}", disc(inlet, Vector((0.004, 0, 0))),
                                 ["inlet_black"]))

        # Coanda exhaust exit on the sidepod ramp
        ring = [Vector((0.045 * math.cos(a), 0.028 * math.sin(a), 0.0))
                for a in (2 * math.pi * k / 16 for k in range(16))]
        tilt = Matrix.Translation((-0.98, s * 0.262, 0.318)) @ Matrix.Rotation(math.radians(-13), 4, "Y")
        ring = [tilt @ p for p in ring]
        parts.append(make_object(f"exhaust_{tag}", disc(ring, Vector((0, 0, 0.006))), ["inlet_black"]))
    return parts


def build_floor():
    parts = []
    right = [(0.95, 0.16), (0.72, 0.28), (0.52, 0.60), (0.38, 0.70), (-0.95, 0.70),
             (-1.12, 0.60), (-1.26, 0.50), (-1.44, 0.49)]
    outline = right + [(x, -y) for (x, y) in reversed(right)]
    parts.append(make_object("floor", plate(outline, "XY", 0.056, 0.012), ["carbon"],
                             smooth=False, bevel=0.003))

    # Diffuser ramp
    def ramp_ring(x, z):
        return [Vector((x, -0.50, z)), Vector((x, 0.50, z)),
                Vector((x, 0.50, z + 0.012)), Vector((x, -0.50, z + 0.012))]

    ramp = loft([ramp_ring(-1.44, 0.050), ramp_ring(-1.70, 0.105), ramp_ring(-2.02, 0.228)])
    parts.append(make_object("diffuser", ramp, ["carbon"], smooth=False))
    fence = [(-1.50, 0.062), (-2.02, 0.236), (-2.02, 0.075), (-1.75, 0.052)]
    for y in (0.14, 0.33, 0.50):
        for s in (1, -1):
            parts.append(make_object(f"strake_{y}_{s}", plate(fence, "XZ", s * y, 0.008),
                                     ["carbon"], smooth=False))

    # T-tray splitter under the nose and its stays
    tray = [(1.60, 0.0), (1.57, 0.20), (1.40, 0.25), (0.95, 0.25),
            (0.95, -0.25), (1.40, -0.25), (1.57, -0.20)]
    parts.append(make_object("t_tray", plate(tray, "XY", 0.052, 0.010), ["carbon"],
                             smooth=False, bevel=0.003))
    stay = [(1.02, 0.056), (1.46, 0.056), (1.40, 0.245), (1.05, 0.15)]
    for s in (1, -1):
        parts.append(make_object(f"tray_stay_{s}", plate(stay, "XZ", s * 0.09, 0.010),
                                 ["carbon"], smooth=False))
    return parts


def build_front_wing():
    parts = []
    main_foil = naca4(0.05, 0.40, 0.09)
    spans = [-0.89, -0.78, -0.62, -0.42, -0.26, 0.0, 0.26, 0.42, 0.62, 0.78, 0.89]

    def main_station(y):
        k = max(0.0, (abs(y) - 0.26) / 0.63)  # 0 in the neutral centre section
        return (y, 2.60, 0.088 - 0.008 * k, 0.40 - 0.06 * k, 4 + 4 * k)

    bm = loft([wing_ring(*main_station(y), main_foil) for y in spans])
    parts.append(make_object("fw_main", bm, ["carbon"]))

    flap_foil = naca4(0.08, 0.40, 0.08)
    for s in (1, -1):
        tag = "l" if s > 0 else "r"
        flap_spans = [0.27, 0.40, 0.55, 0.70, 0.80, 0.87]

        def flap(y, le_x, le_z, chord, angle, curl_z, curl_angle):
            k = (y - 0.27) / 0.60  # flaps curl upwards towards the endplates
            return (s * y, le_x, le_z + curl_z * k ** 2, chord, angle + curl_angle * k ** 2)

        flap1 = [flap(y, 2.33, 0.132, 0.175, 20, 0.030, 10) for y in flap_spans]
        flap2 = [flap(y, 2.20, 0.215, 0.125, 32, 0.060, 8) for y in flap_spans]
        for label, st in (("f1", flap1), ("f2", flap2)):
            bm = loft([wing_ring(y, lx, lz, c, a, flap_foil) for (y, lx, lz, c, a) in st])
            parts.append(make_object(f"fw_{label}_{tag}", bm, ["paint_navy"]))

        endplate = [(2.62, 0.060), (2.64, 0.16), (2.55, 0.36), (2.08, 0.37),
                    (2.00, 0.24), (2.02, 0.060)]
        parts.append(make_object(f"fw_endplate_{tag}", plate(endplate, "XZ", s * 0.893, 0.014),
                                 ["paint_purple"], smooth=False, bevel=0.003))
        panel = [(2.50, 0.078), (2.50, 0.176), (2.10, 0.176), (2.10, 0.078)]
        parts.append(make_object(f"fw_panel_{tag}", plate(panel, "XZ", s * 0.9015, 0.004),
                                 ["paint_red"], smooth=False))
        foot = [(2.62, 0.83), (2.62, 0.90), (2.02, 0.90), (2.02, 0.80)]
        foot = [(x, s * y) for x, y in foot]
        parts.append(make_object(f"fw_foot_{tag}", plate(foot, "XY", 0.058, 0.008),
                                 ["carbon"], smooth=False))
        pylon = [(2.34, 0.378), (2.37, 0.112), (2.18, 0.108), (2.14, 0.362)]
        parts.append(make_object(f"fw_pylon_{tag}", plate(pylon, "XZ", s * 0.058, 0.012),
                                 ["paint_navy"], smooth=False, bevel=0.003))
    return parts


def build_rear_wing_static():
    parts = []
    foil = naca4(0.06, 0.40, 0.11)
    stations = [(-0.372, -2.03, 0.785, 0.27, 12), (0.0, -2.03, 0.785, 0.27, 12),
                (0.372, -2.03, 0.785, 0.27, 12)]
    bm = loft([wing_ring(y, lx, lz, c, a, foil) for (y, lx, lz, c, a) in stations])
    parts.append(make_object("rw_main", bm, ["paint_navy"]))

    beam_foil = naca4(0.05, 0.40, 0.12)
    beam = [(-0.36, -1.985, 0.350, 0.15, 10), (0.36, -1.985, 0.350, 0.15, 10)]
    bm = loft([wing_ring(y, lx, lz, c, a, beam_foil) for (y, lx, lz, c, a) in beam])
    parts.append(make_object("rw_beam", bm, ["carbon"]))

    for s in (1, -1):
        tag = "l" if s > 0 else "r"
        endplate = [(-1.975, 0.36), (-1.965, 0.975), (-2.465, 0.975), (-2.475, 0.42),
                    (-2.33, 0.31), (-2.06, 0.31)]
        parts.append(make_object(f"rw_endplate_{tag}", plate(endplate, "XZ", s * 0.379, 0.012),
                                 ["paint_navy"], smooth=False, bevel=0.003))
        panel = [(-2.00, 0.44), (-2.00, 0.80), (-2.43, 0.80), (-2.43, 0.44)]
        parts.append(make_object(f"rw_panel_{tag}", plate(panel, "XZ", s * 0.3875, 0.004),
                                 ["paint_red"], smooth=False))

    pylon = [(-2.02, 0.33), (-2.03, 0.79), (-2.19, 0.815), (-2.18, 0.33)]
    parts.append(make_object("rw_pylon", plate(pylon, "XZ", 0.0, 0.014), ["carbon"],
                             smooth=False, bevel=0.003))
    parts.append(make_object("rain_light", box((-2.146, 0.0, 0.275), (0.012, 0.10, 0.035)),
                             ["rain_light"], smooth=False))
    return parts


def build_details():
    parts = []

    # Cockpit opening, padded rim, headrest and the driver's helmet
    def outline_point(t):
        c, s = math.cos(t), math.sin(t)
        x = 0.30 + 0.32 * math.copysign(abs(c) ** (2 / 3), c)
        half = 0.195 * (1.0 - 0.35 * max(0.0, (x - 0.30) / 0.32))
        y = half * math.copysign(abs(s) ** (2 / 3), s)
        return x, y

    outline = [outline_point(2 * math.pi * k / 48) for k in range(48)]
    well = [Vector((x, y, chassis_top(x) + 0.001)) for x, y in outline]
    parts.append(make_object("cockpit_well", disc(well, Vector((0, 0, 0.004))), ["inlet_black"]))
    rim = [Vector((x, y, chassis_top(x) + 0.004)) for x, y in outline]
    parts.append(make_object("cockpit_rim", sweep_closed(rim, 0.016), ["padding"]))

    for s in (1, -1):
        parts.append(make_object(f"headrest_{s}", box((0.16, s * 0.165, 0.742), (0.30, 0.05, 0.085)),
                                 ["padding"], smooth=True, bevel=0.018))
    parts.append(make_object("headrest_back", box((0.045, 0.0, 0.742), (0.05, 0.28, 0.085)),
                             ["padding"], smooth=True, bevel=0.018))

    helmet = ellipsoid((0.20, 0.0, 0.785), (0.140, 0.119, 0.125), u=40, v=20)
    centre = Vector((0.20, 0.0, 0.785))

    def helmet_paint(c, n):
        d = (c - centre).normalized()
        if d.x > 0.45 and -0.10 < d.z < 0.38:
            return 2  # visor
        if 0.40 < d.z < 0.52:
            return 1  # stripe
        return 0

    assign(helmet, helmet_paint)
    parts.append(make_object("helmet", helmet, ["helmet_white", "helmet_red", "visor"]))

    # Mirrors on stalks
    for s in (1, -1):
        tag = "l" if s > 0 else "r"
        parts.append(make_object(f"mirror_{tag}", ellipsoid((0.63, s * 0.46, 0.665), (0.03, 0.075, 0.028)),
                                 ["paint_navy"]))
        glass = [Vector((0.598, s * 0.46 + 0.066 * math.cos(a), 0.665 + 0.022 * math.sin(a)))
                 for a in (2 * math.pi * k / 20 for k in range(20))]
        parts.append(make_object(f"mirror_glass_{tag}", disc(glass, Vector((0.002, 0, 0))),
                                 ["mirror_glass"]))
        parts.append(make_object(f"mirror_stalk_{tag}",
                                 rod((0.66, s * 0.40, 0.575), (0.635, s * 0.445, 0.645), 0.008, 0.6),
                                 ["paint_navy"]))

    # Bargeboards / turning vanes ahead of the sidepods
    vane_a = [(1.20, 0.075), (1.22, 0.30), (1.10, 0.33), (0.92, 0.28), (0.90, 0.075)]
    vane_b = [(1.12, 0.075), (1.13, 0.22), (1.00, 0.24), (0.92, 0.075)]
    for s in (1, -1):
        for label, outline_2d, y in (("a", vane_a, 0.40), ("b", vane_b, 0.52)):
            bm = plate(outline_2d, "XZ", s * y, 0.008)
            pivot = Vector((1.05, s * y, 0.0))
            bm.transform(Matrix.Translation(pivot) @ Matrix.Rotation(math.radians(s * 8), 4, "Z")
                         @ Matrix.Translation(-pivot))
            parts.append(make_object(f"vane_{label}_{s}", bm, ["carbon"], smooth=False))

    # Red pinstripe along the nose and chassis side
    for s in (1, -1):
        rings = []
        z, h, t = 0.415, 0.008, 0.002
        for i in range(41):
            x = 2.02 - (2.02 - 0.72) * i / 40
            y = chassis_half_width(x, z) + 0.001
            rings.append([Vector((x, s * y, z - h)), Vector((x, s * (y + t), z - h)),
                          Vector((x, s * (y + t), z + h)), Vector((x, s * y, z + h))])
        parts.append(make_object(f"pinstripe_{s}", loft(rings), ["paint_red"]))

    # Car number 1 on each side of the chassis
    for s in (1, -1):
        bm = text_bm("1", 0.15, 0.0015)
        x, z = 0.90, 0.405
        y = chassis_half_width(x, z) + 0.003
        rot = Matrix.Rotation(math.radians(90), 4, "X")
        if s > 0:
            rot = Matrix.Rotation(math.radians(180), 4, "Z") @ rot
        bm.transform(Matrix.Translation((x, s * y, z)) @ rot)
        parts.append(make_object(f"number_{s}", bm, ["decal_white"], smooth=False))
    return parts


def build_suspension():
    """Wishbones and rods. Inner pickups sit on the raked body, outer ends at
    the (un-raked) uprights, so these parts are already in world space."""
    parts = []

    def body(x, y, z):
        return RAKE @ Vector((x, y, z))

    for s in (1, -1):
        rods = [
            (body(1.72, s * 0.12, 0.47), Vector((1.55, s * 0.60, 0.43)), 0.013, 0.45),
            (body(1.40, s * 0.13, 0.49), Vector((1.55, s * 0.60, 0.43)), 0.013, 0.45),
            (body(1.78, s * 0.11, 0.30), Vector((1.56, s * 0.62, 0.22)), 0.013, 0.45),
            (body(1.34, s * 0.13, 0.27), Vector((1.56, s * 0.62, 0.22)), 0.013, 0.45),
            (Vector((1.555, s * 0.60, 0.235)), body(1.46, s * 0.12, 0.56), 0.011, 0.8),
            (body(1.64, s * 0.12, 0.33), Vector((1.64, s * 0.60, 0.33)), 0.009, 0.7),
            (body(-1.40, s * 0.09, 0.42), Vector((-1.55, s * 0.56, 0.44)), 0.013, 0.45),
            (body(-1.70, s * 0.09, 0.42), Vector((-1.55, s * 0.56, 0.44)), 0.013, 0.45),
            (body(-1.34, s * 0.10, 0.20), Vector((-1.55, s * 0.58, 0.22)), 0.013, 0.45),
            (body(-1.74, s * 0.10, 0.20), Vector((-1.55, s * 0.58, 0.22)), 0.013, 0.45),
            (Vector((-1.55, s * 0.56, 0.43)), body(-1.63, s * 0.10, 0.19), 0.011, 0.8),
            (body(-1.80, s * 0.10, 0.30), Vector((-1.74, s * 0.57, 0.31)), 0.009, 0.7),
        ]
        for i, (a, b, radius, flatten) in enumerate(rods):
            parts.append(make_object(f"susp_{s}_{i}", rod(a, b, radius, flatten), ["carbon"]))
        parts.append(make_object(f"driveshaft_{s}",
                                 rod(body(-1.56, s * 0.10, 0.31), Vector((-1.55, s * 0.55, 0.33)), 0.020),
                                 ["hub_dark"]))
    return parts


def build_drs_flap():
    foil = naca4(0.08, 0.40, 0.10)
    le_x, le_z, chord, angle = -2.262, 0.853, 0.195, 30
    stations = [(-0.372, le_x, le_z, chord, angle), (0.0, le_x, le_z, chord, angle),
                (0.372, le_x, le_z, chord, angle)]
    bm = loft([wing_ring(y, lx, lz, c, a, foil) for (y, lx, lz, c, a) in stations])
    a = math.radians(angle)
    trailing_edge = Vector((le_x - chord * math.cos(a), 0.0, le_z + chord * math.sin(a)))
    pivot = RAKE @ trailing_edge
    bm.transform(Matrix.Translation(-pivot) @ RAKE)
    flap = make_object("drs_flap", bm, ["paint_navy"])
    flap.location = pivot
    return flap


# ---------------------------------------------------------------------------
# Wheels
# ---------------------------------------------------------------------------


def tyre_profile(width, rb=0.172, shoulder=0.035):
    h, R = width / 2, TYRE_R
    pts = [(rb, -h + 0.015), (0.21, -h - 0.001), (0.25, -h - 0.004), (0.285, -h - 0.002)]
    for k in range(5):  # inner shoulder
        p = math.pi * 0.5 * k / 4
        pts.append((R - shoulder + shoulder * math.sin(p), -h + shoulder - shoulder * math.cos(p)))
    pts += [(R + 0.003, -h * 0.35), (R + 0.004, 0.0), (R + 0.003, h * 0.35)]
    for k in range(5):  # outer shoulder
        p = math.pi * 0.5 * k / 4
        pts.append((R - shoulder + shoulder * math.cos(p), h - shoulder + shoulder * math.sin(p)))
    pts += [(0.285, h + 0.002), (0.25, h + 0.004), (0.21, h + 0.001), (rb, h - 0.015), (rb - 0.004, 0.0)]
    return pts


def spoke_bm(angle, h):
    """One tapered spoke of the forged multi-spoke wheel."""
    radial = Vector((math.cos(angle), 0.0, math.sin(angle)))
    tangent = Vector((-math.sin(angle), 0.0, math.cos(angle)))
    r1, r2, w1, w2 = 0.040, 0.156, 0.022, 0.013
    a0, a1 = h - 0.062, h - 0.046
    bm = bmesh.new()
    corners = []
    for r, w in ((r1, w1), (r2, w2)):
        for side in (-0.5, 0.5):
            for a in (a0, a1):
                corners.append(bm.verts.new(radial * r + tangent * (w * side) + Vector((0, a, 0))))
    v = corners  # index = end*4 + side*2 + axial
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    for f in faces:
        bm.faces.new([v[i] for i in f])
    return recalc(bm)


def wheel(name, location, width, mirror):
    h = width / 2
    pieces = [
        (lathe(tyre_profile(width)), "rubber", True),
        (lathe([(0.262, h + 0.0034), (0.276, h + 0.0030), (0.276, h + 0.0046), (0.262, h + 0.0050)]),
         "tyre_band", True),
        (lathe([(0.150, -h + 0.020), (0.166, -h + 0.020), (0.166, h - 0.026), (0.181, h - 0.014),
                (0.182, h - 0.004), (0.172, h - 0.003), (0.160, h - 0.018), (0.150, h - 0.030)]),
         "rim_metal", True),
        (lathe([(0.001, h - 0.075), (0.052, h - 0.075), (0.052, h - 0.045), (0.034, h - 0.030),
                (0.034, h - 0.014), (0.001, h - 0.014)], segments=36), "hub_dark", True),
        (lathe([(0.001, h - 0.016), (0.030, h - 0.016), (0.030, h - 0.004), (0.001, h - 0.004)],
               segments=6), "hub_dark", False),
        (lathe([(0.020, -h + 0.030), (0.158, -h + 0.030), (0.158, h - 0.075), (0.020, h - 0.075)],
               segments=36), "carbon", True),
    ]
    for k in range(10):
        pieces.append((spoke_bm(2 * math.pi * k / 10, h), "rim_metal", False))

    order = []
    combined = bmesh.new()
    for bm, material, smooth in pieces:
        if material not in order:
            order.append(material)
        for face in bm.faces:
            face.material_index = order.index(material)
            face.smooth = smooth
        append_bmesh(combined, bm)
        bm.free()
    if mirror:  # right-hand wheels: outer face points to -Y
        combined.transform(Matrix.Scale(-1.0, 4, (0.0, 1.0, 0.0)))
        bmesh.ops.reverse_faces(combined, faces=combined.faces[:])
    mesh = bpy.data.meshes.new(name)
    combined.to_mesh(mesh)
    combined.free()
    for material in order:
        mesh.materials.append(MATS[material])
    obj = link(bpy.data.objects.new(name, mesh))
    obj.location = location
    return obj


def build_wheels():
    return [
        wheel("wheel_fl", (FRONT_AXLE_X, FRONT_TRACK_Y, TYRE_R), FRONT_TYRE_W, False),
        wheel("wheel_fr", (FRONT_AXLE_X, -FRONT_TRACK_Y, TYRE_R), FRONT_TYRE_W, True),
        wheel("wheel_rl", (REAR_AXLE_X, REAR_TRACK_Y, TYRE_R), REAR_TYRE_W, False),
        wheel("wheel_rr", (REAR_AXLE_X, -REAR_TRACK_Y, TYRE_R), REAR_TYRE_W, True),
    ]


# ---------------------------------------------------------------------------
# Export and preview
# ---------------------------------------------------------------------------


def export_glb(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    op = bpy.ops.export_scene.gltf
    available = {p.identifier for p in op.get_rna_type().properties}
    wanted = dict(
        filepath=path, export_format="GLB", use_selection=False, export_apply=True,
        export_yup=True, export_cameras=False, export_lights=False, export_extras=False,
        export_texcoords=False, export_normals=True, export_materials="EXPORT",
        export_animations=False,
    )
    op(**{k: v for k, v in wanted.items() if k in available})
    print(f"[rb9] exported {path} ({os.path.getsize(path) / 1024:.0f} KiB)")


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render_previews(folder, samples):
    os.makedirs(folder, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for device in prefs.devices:
            device.use = True
        scene.cycles.device = "GPU"
    except Exception as exc:  # noqa: BLE001 - fall back to CPU rendering
        print("[rb9] GPU unavailable, rendering on CPU:", exc)
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    try:
        scene.view_settings.view_transform = "AgX"
    except TypeError:
        pass

    world = bpy.data.worlds.new("preview_world")
    scene.world = world
    try:
        world.use_nodes = True
    except AttributeError:
        pass
    if world.node_tree:
        bg = world.node_tree.nodes.get("Background")
        if bg:
            bg.inputs["Color"].default_value = (0.012, 0.013, 0.018, 1.0)
            bg.inputs["Strength"].default_value = 1.0

    floor_mat = new_material("preview_floor", "#0E0F12", 0.0, 0.42, 0.0, 0.0)
    MATS["preview_floor"] = floor_mat
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=1.5)
    bmesh.ops.translate(bm, vec=(0, 0, -0.0004), verts=bm.verts)
    make_object("preview_floor", bm, ["preview_floor"], smooth=False)

    def area(name, loc, target, size, size_y, power):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = power
        data.shape = "RECTANGLE"
        data.size = size
        data.size_y = size_y
        obj = link(bpy.data.objects.new(name, data))
        obj.location = loc
        look_at(obj, target)

    area("key", (0.30, -0.35, 0.40), (0, 0, 0.02), 0.35, 0.20, 18)
    area("fill", (-0.35, 0.30, 0.25), (0, 0, 0.02), 0.40, 0.40, 8)
    area("top", (0.0, 0.0, 0.45), (0, 0, 0.0), 0.45, 0.20, 20)
    area("rim", (-0.40, -0.25, 0.12), (0, 0, 0.03), 0.20, 0.10, 10)

    cam_data = bpy.data.cameras.new("camera")
    cam_data.clip_start = 0.005
    cam = link(bpy.data.objects.new("camera", cam_data))
    scene.camera = cam

    shots = {
        "34front": ((0.34, 0.27, 0.15), (0.01, 0.0, 0.02), None, (1280, 720)),
        "side": ((0.0, 1.0, 0.028), (0.0, 0.0, 0.028), 0.31, (1600, 560)),
        "top": ((0.0, 0.0, 1.0), (0.0, 0.0, 0.0), 0.31, (1600, 720)),
        "34rear": ((-0.34, -0.27, 0.16), (-0.01, 0.0, 0.025), None, (1280, 720)),
    }
    for name, (loc, target, ortho, (w, h)) in shots.items():
        cam.location = loc
        look_at(cam, target)
        if ortho:
            cam_data.type = "ORTHO"
            cam_data.ortho_scale = ortho
        else:
            cam_data.type = "PERSP"
            cam_data.lens = 70
        scene.render.resolution_x, scene.render.resolution_y = w, h
        scene.render.filepath = os.path.join(folder, f"{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"[rb9] rendered {scene.render.filepath}")


def triangle_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    build_materials()

    raked = (build_chassis() + build_airbox() + build_sidepods() + build_floor()
             + build_front_wing() + build_rear_wing_static() + build_details())
    fixed = build_suspension()
    body = merge_parts("body", [(p, RAKE) for p in raked] + [(p, IDENTITY) for p in fixed])
    flap = build_drs_flap()
    wheels = build_wheels()

    root = link(bpy.data.objects.new("rb9", None))
    root.scale = (SCALE, SCALE, SCALE)
    for obj in [body, flap] + wheels:
        obj.parent = root

    bpy.context.view_layer.update()
    total = triangle_count(body) + sum(triangle_count(w) for w in wheels)
    print(f"[rb9] body tris {triangle_count(body)}, wheels {sum(triangle_count(w) for w in wheels)}, "
          f"total ~{total} (+ flap after subdivision)")
    corners = [body.matrix_world @ Vector(c) for c in body.bound_box]
    for axis, label in ((0, "length"), (1, "width"), (2, "height")):
        span = max(c[axis] for c in corners) - min(c[axis] for c in corners)
        print(f"[rb9] body {label}: {span * 1000:.1f} mm at 1:18 ({span / SCALE * 1000:.0f} mm 1:1)")

    if ARGS["out"]:
        export_glb(os.path.abspath(ARGS["out"]))
    if ARGS["preview"]:
        render_previews(os.path.abspath(ARGS["preview"]), ARGS["samples"])


main()
