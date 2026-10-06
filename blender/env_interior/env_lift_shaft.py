"""env_lift_shaft: the dark-ride shell drawn round the player during both lift rides (work order art-env-interior 4.5;
ART_BIBLE 7.3; code-world "Rides").

    node tools/build-assets.mjs --only env_lift_shaft

A square shaft section 12 m tall on a 6.4 x 6.4 m footprint, pivot = the cage floor's centre (code scales it to the cage
in use), cast concrete with steel guide rails, and six lamp bars 1.2 x 0.1 m as separate mesh nodes `lamp_bar_1..6`
(m_emis, code-driven: code scrolls them upward; never keyed).

The cage does not move in world space: only the lamp bars scroll. So EVERYTHING on the shell runs vertically and
unbroken from end to end (guide rails, the counterweight's guides and ropes, the lamp channel, conduits, the corner
angles, the formwork's vertical joints): there is no horizontal course, bracket or joint anywhere that could betray
that the walls stand still, and the walls carry the flat cell of the trim sheet, not a texture row.

Bake class VL, written by hand (vcol.mark_vertex_lit): light = ambient (#132547 x 0.22, the lift hall's) x AO + a dim
aqua wash that is strongest at the cage (1.6 m above the floor) and gone 5 m above it, so the shell falls to black
above and below the cage as a dark ride should. No lamp bar is in the bake (they move).
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import math
import bpy
import numpy as np
from mathutils import Vector
from lib import scene, mesh, uv, material, vcol, bake, export, manifest
import interior_common as ic
from interior_common import B, lin

ASSET = "env_lift_shaft"
H = 3.2                      # half the footprint
Y0, Y1 = 0.0, 12.0
YS = [0.0, 1.2, 2.6, 4.4, 7.0, 12.0]          # rows of the vertex light (finer where the cage stands)
AMBIENT = ic.ambient("#132547", 0.22, gain=0.5)                 # fix pass 1: the hall's re-calibrated ambient (a black shaft; the wash round the cage is the light)
# polish round 3 (visual critic, major: "both lift rides are near-black ... frames"; the ride frame measured L* p50 20,
# p95 32: a flat dim field behind the cage's mesh). The wash round the cage is the light of the lamp channel now:
# strong and near-white on the channel's wall, falling off round the shaft to the far corners (so the cage's lattice
# stands dark on a lit wall and the shaft has a near and a far side), still gone 5 m above the cage and below it.
# polish round 4 (visual critic, minor: "both lift rides are a wall of bright mesh squares"): a wash that kept 22 % on
# the far wall and fell off over 3.4 m lit every square of the cage's lattice. It is a pool on the channel's wall now:
# gone 2 m round the shaft from the channel (6 % left beyond), so three of the cage's four sides look into the dark and
# the lit wall is the one bright shape of the ride. The plan carries a vertex every metre so the pool has an edge.
WASH = (lin("#7CF2E2") * 0.45 + np.array([1.0, 0.88, 0.84], dtype=np.float32) * 0.55) * 0.80
WASH_FAR = 0.06                                                       # what the wall opposite the channel keeps of it
WASH_R = 2.0                                                          # plan distance over which the wash dies
CAGE_Y, REACH = 1.6, 4.6

parts = []


def add(o):
    parts.append(o); return o


def strip(name, pts, tint, region=None, close=False):
    """A vertical extrusion of the GAME plan polyline pts [(x, z), ...] from Y0 to Y1, with a vertex row at every YS,
    facing the shaft's axis."""
    f = []
    n = len(pts)
    for i in range(n if close else n - 1):
        a, b = pts[i], pts[(i + 1) % n]
        for y0, y1 in zip(YS[:-1], YS[1:]):
            f.append([(a[0], y0, a[1]), (b[0], y0, b[1]), (b[0], y1, b[1]), (a[0], y1, a[1])])
    cx = sum(p[0] for p in pts) / n; cz = sum(p[1] for p in pts) / n
    # look at the axis: away from a point pushed outward from the strip's middle
    out = Vector((cx, cz)); out = out.normalized() * (out.length + 2.0) if out.length > 1e-6 else Vector((0, 9))
    if close: return add(ic.from_faces(name, f, "m_pellam", tint, region, toward=(0.0, 6.0, 0.0), smooth=40, mpr=3.6, along=(0, 0, 1)))
    return add(ic.from_faces(name, f, "m_pellam", tint, region, away_from=(out.x, 6.0, out.y), smooth=40, mpr=3.6, along=(0, 0, 1)))


def rail_T(name, x, z, nx, nz, tint="steel"):
    """A T guide rail standing off a wall: foot at (x, z), pointing (nx, nz) into the shaft: web 0.05 wide and 0.14
    proud, head 0.16 wide and 0.04 thick."""
    tx, tz = -nz, nx
    def Pq(t, n): return (x + tx * t + nx * n, z + tz * t + nz * n)
    prof = [Pq(-0.025, 0.0), Pq(-0.025, 0.14), Pq(-0.08, 0.14), Pq(-0.08, 0.18), Pq(0.08, 0.18), Pq(0.08, 0.14), Pq(0.025, 0.14), Pq(0.025, 0.0)]
    f = []
    for a, b in zip(prof[:-1], prof[1:]):
        for y0, y1 in zip(YS[:-1], YS[1:]):
            f.append([(a[0], y0, a[1]), (b[0], y0, b[1]), (b[0], y1, b[1]), (a[0], y1, a[1])])
    c = Pq(0.0, 0.07)
    return add(ic.from_faces(name, f, "m_pellam", tint, "steel", away_from=(c[0], 6.0, c[1]), smooth=30, mpr=3.6, along=(0, 0, 1)))


def rope(name, x, z, r=0.03):
    pts = [(x, y, z) for y in YS]
    return add(ic.tube(name, pts, r, 3, "m_pellam", "cable", None))


def build():
    conc = "concrete"
    c = 0.35                                                            # the corners are chamfered 0.35 m: a steel angle stands in each
    # the four walls and the four corner chamfers as one closed octagon, vertical formwork joints every 1.2 m in the plan
    octa = [(H, -H + c), (H, H - c), (H - c, H), (-H + c, H), (-H, H - c), (-H, -H + c), (-H + c, -H), (H - c, -H)]
    plan = []
    for i in range(8):
        a, b = octa[i], octa[(i + 1) % 8]
        L = math.hypot(b[0] - a[0], b[1] - a[1]); n = max(1, int(round(L / 1.0)))
        for k in range(n): plan.append((a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n))
    walls = strip("walls", plan, conc, None, close=True)
    # corner angles (steel, 0.2 m legs, 20 mm proud of the chamfer)
    for k, (sx, sz) in enumerate(((1, 1), (-1, 1), (-1, -1), (1, -1))):
        a = (sx * (H - 0.02), sz * (H - c - 0.1)); b = (sx * (H - 0.02), sz * (H - c)); d = (sx * (H - c), sz * (H - 0.02)); e = (sx * (H - c - 0.1), sz * (H - 0.02))
        m1 = (sx * (H - 0.04), sz * (H - c + 0.02)); m2 = (sx * (H - c + 0.02), sz * (H - 0.04))
        strip(f"corner_{k}", [a, m1, m2, e][1 if sz > 0 else 0:4 if sz > 0 else 3] if False else [m1, ((m1[0] + m2[0]) / 2 - sx * 0.03, (m1[1] + m2[1]) / 2 - sz * 0.03), m2], "steel_dark", None)
    # the cage's guide rails: a T rail at the middle of the east and west walls, and a second lighter pair for the
    # counterweight on the north wall with its two ropes between them
    rail_T("guide_e", H, 0.0, -1, 0); rail_T("guide_w", -H, 0.0, 1, 0)
    for k, x in enumerate((-0.7, 0.7)):                                  # counterweight guides: a plain angle each
        sg = 1 if x > 0 else -1
        strip(f"cw_guide_{k}", [(x - sg * 0.1, -H + 0.004), (x - sg * 0.1, -H + 0.1), (x, -H + 0.1), (x, -H + 0.004)][::sg], "steel_dark", None)
    rope("rope_a", -0.14, -H + 0.2); rope("rope_b", 0.14, -H + 0.2)
    # the lamp channel on the south wall (the bars travel in it): a dark steel channel 1.4 wide with two lips, and a
    # conduit each side of it
    strip("lamp_channel", [(0.80, H - 0.0), (0.78, H - 0.07), (0.70, H - 0.02), (-0.70, H - 0.02), (-0.78, H - 0.07), (-0.80, H - 0.0)][::-1],
          tuple(lin("steel_dark") * 0.8), None)
    for k, x in enumerate((-1.1, 1.1)):
        cdt = ic.cyl(f"conduit_{k}", (x, Y0, H - 0.07), (x, Y1, H - 0.07), 0.05, 6, "m_pellam", "steel", None, cap=False, keep=lambda n: n.y > 0.3)
        mesh.tessellate_max_edge(cdt, 4.5); add(cdt)
    # a travelling cable loop on the east wall beside the guide (hangs free: two ropes)
    rope("trav_a", H - 0.16, 1.1, 0.025); rope("trav_b", H - 0.16, 1.3, 0.025)
    return walls


def light(objs):
    """COLOR_0 = tint x AO-shaded gradient x (ambient x AO + aqua wash round the cage) / 2, marked vertex-lit."""
    vcol.bake_ao_vertex(objs, distance=1.2)
    for k, o in enumerate(objs):
        ao = vcol.get_colors(o, "AO")[:, :1].copy()
        vcol.compose_vertex_color(o, mode='tint', ao_strength=0.0, gradient=(1.0, 1.0), jitter=0.0, seed=k)
        c = vcol.get_colors(o, "Color"); p = vcol.corner_positions(o)
        y = p[:, 2:3]                                                   # Blender z = game y
        w = np.clip(1.0 - ((y - CAGE_Y) / REACH) ** 2, 0.0, 1.0) ** 1.5
        fade = np.clip(1.0 - (y - 6.0) / 6.0, 0.0, 1.0)                 # the ambient itself dies toward the top: a black shaft
        dch = np.hypot(p[:, 0:1], p[:, 1:2] + H)                        # plan distance from the lamp channel (game z = +H is Blender y = -H)
        near = WASH_FAR + (1.0 - WASH_FAR) * np.exp(-(dch / WASH_R) ** 2)
        lightv = AMBIENT[None, :] * (0.35 + 0.65 * ao) * (0.4 + 0.6 * fade) + WASH[None, :] * w * near * (0.4 + 0.6 * ao)
        c[:, :3] = np.clip(c[:, :3] * lightv / vcol.VERTEX_LIGHT_SCALE, 0.0, 1.0)
        vcol.set_colors(o, c, "Color")
        vcol.mark_vertex_lit(o)


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build()
    bake.use_cycles('CPU', samples=64)
    light(parts)
    ic.weld_colors(parts)
    shell = mesh.join(parts, "env_lift_shaft_mesh")
    ic.snap_positions([shell])
    # the six lamp bars: 1.2 x 0.1 m, on the south wall's channel, 2 m apart; each its own node with its origin at its
    # centre (code moves the nodes; they are never keyed)
    for i in range(6):
        y = 1.0 + 2.0 * i; z = H - 0.035
        e = ic.emis(f"lamp_bar_{i + 1}", [[(0.6, y - 0.05, z), (-0.6, y - 0.05, z), (-0.6, y + 0.05, z), (0.6, y + 0.05, z)]], "aqua")
        if e.data.polygons[0].normal.dot(ic.Bd((0, 0, -1))) < 0: e.data.flip_normals()
        e["emit_strength"] = 1.0
        mesh.set_origin(e, B((0.0, y, H)))
    export.export_asset(ASSET, args.out, blend=args.blend)
    if args.preview: export.preview(ASSET, args.out)


if __name__ == "__main__":
    scene.run(main)
