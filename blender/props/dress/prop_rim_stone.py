"""prop_rim_stone: the stone on the far rim: a capstone 0.9 x 0.12 x 0.5 m, its top swept clean, with SEVEN shallow
seats in a row, 0.11 m apart, each fitting a 12 mm case head, lying on a bed of caprock (pass i4: the bed is part of
this asset and swallows the zone's shelf box; see the note above `build`). Embedded (`placedBy: zone`).

SEATS (asset-local, game space: +X right, +Y up, +Z front): seat n (1..7) is at x = -0.11 * (7 - n), y = 0.12, z = 0.
Seat 7 is the ORIGIN column: it stands on the layout's `ia_stone_round` when the slab stands at `rim_stone`
(1.6, 18, 102.4), as the work order asks. The row therefore runs 0.66 m to the -X side, and the slab's body lies from
x = -0.78 to +0.12 (the order's 0.11 m pitch does not fit a 0.9 m slab centred on seat 7; docs/requests/art-props-dress.md).

    node tools/build-assets.mjs --only prop_rim_stone
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _d)
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
import math
import numpy as np
from mathutils import Vector, Matrix
from lib import scene, mesh, uv, material, vcol, export, manifest, layout
import dress_common as dc

ASSET = "prop_rim_stone"


PITCH = 0.11
TOP = 0.12
CASE_H = 0.105
BRASS = "#D2A650"; BRASS_LIT = "#DDB96C"; BRASS_FOOT = "#7E5C28"; BORE = "#20140C"      # (pass i4: the body is near the pale cell's own limit: under the blue hour's light #B88A3A showed as a dull brown beside the lit round)
# Pass i4 (lead ruling R19; the visual reviewer: "an untextured mauve box slab with a small tray on it ... on a pale patch
# with hard polygon edges"). The stone is a hero prop now and it is the whole OUTCROP, not a tray on the zone's box:
#   the BED      a table of caprock 2.3 x 1.5 m that swallows the zone's shelf box (blender/env_exterior/env_far_rim.py
#                `rim_shelf`: 1.95 x 1.2 m, its top at this asset's z = 0): an uneven swept top a hand above the box, a
#                knocked arris, two beds with a dark joint between them, a battered foot that goes down under the sand,
#                two fractures cut INTO it (real grooves: a vertex colour cannot draw a line);
#   the CAPSTONE the flag the seats are cut in (the old slab's outline and size: 0.9 x 0.5 m, its top at 0.12): an
#                undercut foot, a belly, a knocked and chipped arris, a worn top paler along the row;
#   the CASES    eight sides, a rolled mouth, a dark bore, a lit flank toward the walker;
#   loose stone  the flake that spalled off the capstone's back, a low marker stack at the bed's far end, pebbles.
# (Wedges of blown sand against the bed's foot were tried: vertex-lit plain faces beside the ledge's rippled, lightmapped
# sand read as more rock. The bed's battered foot goes down under the zone's sand instead.)
# Everything is COLOR_0 on one pale cell (the zone folds it onto its flat trim cell and lights it per vertex): form and
# value are in the geometry. KIND marks what a face is for the painter.
KIND = "ks_kind"
K_BED_TOP, K_BED_SIDE, K_GROOVE, K_CAP_TOP, K_CAP_SIDE, K_CASE, K_SEAT, K_LOOSE, K_SAND, K_CHIP, K_LAMINA, K_LOW, K_JOINT, K_ARRIS = range(1, 15)
CX = -0.33                                                              # the capstone's and the bed's centre (seat 4)
BOX = (0.975, 0.6)                                                      # half extents of the zone's shelf box about (CX, 0)


def _noise(pos, freq, seed):
    """Smooth value noise 0..1 at points (n, 3)."""
    q = pos.astype(np.float64) * freq + seed * 17.13
    i = np.floor(q); f = q - i; f = f * f * (3 - 2 * f)
    def h(a, b, c):
        return np.abs(np.modf(np.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453)[0])
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (f[:, 0] if dx else 1 - f[:, 0]) * (f[:, 1] if dy else 1 - f[:, 1]) * (f[:, 2] if dz else 1 - f[:, 2])
                out = out + w * h(i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz)
    return out.astype(np.float32)


def _ray_radius(outline, ang):
    """Distance from (CX, 0) to the polygon `outline` along direction `ang`."""
    dx, dy = math.cos(ang), math.sin(ang); best = 0.0
    n = len(outline)
    for k in range(n):
        ax, ay = outline[k][0] - CX, outline[k][1]; bx, by = outline[(k + 1) % n][0] - CX, outline[(k + 1) % n][1]
        ex, ey = bx - ax, by - ay
        den = dx * ey - dy * ex
        if abs(den) < 1e-9: continue
        t = (ax * ey - ay * ex) / den; u = (ax * dy - ay * dx) / den
        if t > 0 and -1e-6 <= u <= 1 + 1e-6: best = max(best, t)
    return best


def _loft(bm, kl, rings, kinds, closed_top=None):
    """Quads between consecutive rings (same count, counter-clockwise seen from above, rising or going in)."""
    n = len(rings[0])
    for (a, b), kind in zip(zip(rings[:-1], rings[1:]), kinds):
        for k in range(n):
            j = (k + 1) % n
            f = bm.faces.new((a[k], a[j], b[j], b[k])); f[kl] = kind(k) if callable(kind) else kind
    if closed_top is not None:
        f = bm.faces.new(rings[-1]); f[kl] = closed_top


def build(args):
    # Pass i5 (both visual reviewers: "a stack of flat polygon slabs with a single matte fill ... reads as cut card").
    # What read as card in pass i4: the bed's top was one level sheet with its colour at five sparse rings, the two
    # laminae were flat n-gons lying on it, and every side was a plumb extrusion of one height. Now:
    #   - the bed's top is TWO levels in one skin: a terrace the capstone lies on and a lower swept bed round it, the
    #     step between them a ragged contour (lobes and bays), so the top has form and its colour has vertices;
    #   - the bed's edge is not one height: it is knocked back in bays (chips), and the upper course overhangs a
    #     weathered-back joint over the darker lower course;
    #   - the capstone is a DRESSED flag (a tooled groove a thumb inside its arris): hewn stone on natural stone;
    #   - the colour is three values, not one: dark risers and joints, a mid mottled top, pale struck arrises, a warm
    #     side toward the afterglow; and, where the manifest allows `m_frontier` for this asset, the rock faces carry
    #     the cliffs' own strata row (see TEXTURED below).
    rng = scene.rng(args.seed)
    TEXTURED = "m_frontier" in manifest.asset(ASSET)["materials"]
    # ------------------------------------------------------------------------------------------------ the bed
    hx, hy = BOX
    base = [(-hx, -hy, 0.10), (-0.52, -hy, 0.24), (-0.02, -hy, 0.13), (0.46, -hy, 0.33), (hx, -hy, 0.14), (hx + 0.02, -0.18, 0.22), (hx, 0.2, 0.11),
            (hx, hy, 0.12), (0.5, hy, 0.26), (0.05, hy, 0.11), (-0.42, hy, 0.21), (-hx, hy, 0.30), (-hx - 0.04, 0.22, 0.40), (-hx, -0.2, 0.15)]
    cols = []                                                           # (angle, radius of the bed's top edge)
    for (x, y, m) in base:
        r = math.hypot(x, y); cols.append((math.atan2(y, x), r + m))
    cols.sort()
    dense = []
    for k, (a, r) in enumerate(cols):                                   # a column wherever two are more than 0.4 rad apart: the top's colour lives at vertices
        a2, r2 = cols[(k + 1) % len(cols)]
        if k == len(cols) - 1: a2 += 2 * math.pi
        dense.append((a, r))
        if a2 - a > 0.4: dense.append(((a + a2) / 2, (r + r2) / 2 * rng.uniform(0.985, 1.03)))
    cols = sorted(((a + math.pi) % (2 * math.pi) - math.pi, r) for a, r in dense)
    # bays knocked out of the arris (column index: how far back, how far down)
    bays = {1: (0.07, 0.03), 6: (0.05, 0.022), 11: (0.085, 0.035), 15: (0.045, 0.02)}
    # three fractures: each a groove of three columns (lip, bottom, lip) let into the ring of columns
    cracks = (cols[2][0] + 0.21, cols[9][0] + 0.17, cols[14][0] + 0.12)
    ang = []
    for k, (a, r) in enumerate(cols): ang.append((a, r, 0, bays.get(k, (0.0, 0.0))))
    for c in cracks:
        ra = np.interp(c, [q[0] for q in cols], [q[1] for q in cols])
        for d, tag in ((-1, 1), (0, 2), (1, 1)): ang.append((c + d * 0.012, float(ra), tag, (0.0, 0.0)))
    ang.sort()
    N = len(ang)
    cap_out = [(-0.45, -0.10), (-0.36, -0.235), (-0.05, -0.25), (0.30, -0.215), (0.45, -0.07), (0.41, 0.16), (0.27, 0.245),
               (0.20, 0.17), (0.07, 0.19), (-0.22, 0.235), (-0.43, 0.12)]     # the capstone: the back edge has lost a bite (where the flake came from)
    cap_out = [(CX + x, y) for x, y in cap_out]
    bm = mesh.new_bmesh(); kl = bm.faces.layers.int.new(KIND)
    ZT, ZL = 0.046, 0.017                                               # the terrace the capstone lies on; the swept bed round it
    def bed_ring(rad, z, jitter=0.0, wob=0.0, sink=0.0, zj=0.006, bay=0.0):
        vs = []
        for k, (a, r, tag, (bin_, bdn)) in enumerate(ang):
            rr = rad(a, r) * (1.0 + (rng.uniform(-jitter, jitter) if tag == 0 else 0.0)) - bin_ * bay
            aa = a + (wob * math.sin(7.0 * rr + 3.0 * a) if tag else 0.0)          # a fracture wanders as it runs out
            zz = z + (rng.uniform(-zj, zj) if (tag == 0 and jitter) else 0.0) - (sink if tag == 2 else 0.0) - bdn * bay
            vs.append(bm.verts.new((CX + math.cos(aa) * rr, math.sin(aa) * rr, zz)))
        return vs
    rc = lambda a: _ray_radius(cap_out, a)
    def terrace(a, r):                                                  # the terrace's edge: lobes and bays between the capstone and the bed's edge
        t = 0.46 + 0.30 * math.sin(2.0 * a + 1.1) + 0.17 * math.sin(5.0 * a + 0.3) + 0.08 * math.sin(9.0 * a + 2.0)
        t = min(0.86, max(0.10, t))
        return (rc(a) + 0.11) * (1 - t) + (r - 0.13) * t
    rC = bed_ring(lambda a, r: rc(a) * 0.86, ZT, sink=0.0)                                   # under the capstone's overhang (holds the contact shadow)
    rT0 = bed_ring(lambda a, r: (rc(a) + 0.06) * 0.5 + terrace(a, r) * 0.5, ZT + 0.002, jitter=0.02, wob=0.02, sink=0.012, zj=0.004)
    rT1 = bed_ring(terrace, ZT - 0.003, wob=0.03, sink=0.014)                                # the terrace's knocked edge
    rT2 = bed_ring(lambda a, r: terrace(a, r) + 0.026, ZL + 0.003, wob=0.032, sink=0.012)    # its foot
    rM = bed_ring(lambda a, r: (terrace(a, r) + 0.026) * 0.45 + r * 0.55, ZL, jitter=0.03, wob=0.04, sink=0.016)
    rA = bed_ring(lambda a, r: r - 0.012, ZL - 0.005, wob=0.05, sink=0.016, bay=1.0)         # the top's edge
    for v in rA: v.co.z = max(v.co.z, 0.0065)                           # (stays above the zone's shelf box: its top is this asset's z = 0)
    rA2 = bed_ring(lambda a, r: r + 0.020, ZL - 0.042, jitter=0.012, wob=0.05, sink=0.016, bay=0.8)   # the knocked arris
    rU1 = bed_ring(lambda a, r: r + 0.046, -0.072, jitter=0.02, wob=0.055, sink=0.02, bay=0.3)        # the upper course's belly: it overhangs
    rU0 = bed_ring(lambda a, r: r + 0.030, -0.112, jitter=0.012, wob=0.055, sink=0.016)      # its foot
    rJ = bed_ring(lambda a, r: r + 0.004, -0.130, jitter=0.008, wob=0.055, sink=0.010)       # the joint: weathered back, dark
    # the lower bed stands out from under it as an apron, and covers the zone's second shelf box (3.0 x 2.0 m, its top at
    # z = -0.15, 0.2-0.3 m off this centre: its corners showed as pale hard-edged lobes in the sand); the ledge's sand
    # lies over most of it, so what shows is a ragged line of dark rock, and its edge goes down under the sand
    LOW = (0.235, -0.19, 1.72, 1.22)                                    # that box in this frame, with its turn allowed for: centre, half extents
    def apron(a, r):
        dx, dy = math.cos(a), math.sin(a)
        tx = ((LOW[2] if dx > 0 else -LOW[2]) + LOW[0]) / dx if abs(dx) > 1e-6 else 1e9
        ty = ((LOW[3] if dy > 0 else -LOW[3]) + LOW[1]) / dy if abs(dy) > 1e-6 else 1e9
        return max(r + 0.085, min(tx, ty) * 0.97 + 0.05)                # (the box's corners are chamfered: 3 % inside the sharp corner)
    rP1 = bed_ring(lambda a, r: (r + 0.004) * 0.5 + apron(a, r) * 0.5, -0.108, jitter=0.03, wob=0.06, sink=0.0)
    for v in rP1: v.co.z += rng.uniform(-0.016, 0.026)                  # an uneven shelf (stays above the box's top at -0.138)
    rP0 = bed_ring(apron, -0.112, jitter=0.03, wob=0.06, sink=0.0)
    for v in rP0: v.co.z += rng.uniform(-0.02, 0.02)
    rF = bed_ring(lambda a, r: apron(a, r) + 0.3, -0.38, jitter=0.04, wob=0.06, sink=0.0)
    groove = lambda k: K_GROOVE if (ang[k][2] + ang[(k + 1) % N][2]) == 3 else None
    top = lambda k: groove(k) or K_BED_TOP
    side = lambda k: groove(k) or K_BED_SIDE
    riser = lambda k: groove(k) or K_LAMINA                             # the terrace's broken edge
    lowk = lambda k: groove(k) or K_LOW                                 # the lower bed (the apron)
    jointk = lambda k: groove(k) or K_JOINT
    arrisk = lambda k: groove(k) or K_ARRIS
    _loft(bm, kl, [rF, rP0, rP1, rJ, rU0, rU1, rA2, rA, rM, rT2, rT1, rT0, rC], [lowk, lowk, lowk, jointk, side, side, arrisk, top, top, riser, top, top])
    TV = {}                                                             # vertex (rounded) -> where it sits across the strata row (TEXTURED)
    tkey = lambda co: (round(co[0], 4), round(co[1], 4), round(co[2], 4))
    for ring, t in ((rF, 0.0), (rP0, 0.32), (rP1, 0.62), (rJ, 0.97), (rU0, 0.8), (rU1, 0.52), (rA2, 0.2), (rA, 0.04), (rM, 0.5), (rT2, 0.9), (rT1, 1.0), (rT0, 0.45), (rC, 0.05)):
        for v in ring: TV[tkey(v.co)] = t
    bed = mesh.new_mesh_object("bed", bm)
    # ------------------------------------------------------------------------------------------------ the capstone
    bm = mesh.new_bmesh(); kl = bm.faces.layers.int.new(KIND)
    M = len(cap_out)
    chip = {4: 0.045, 9: 0.03, 1: 0.022}                                 # corners knocked off the arris (index: how far)
    def cap_ring(scale, z, dz=0.0, chips=0.0):
        vs = []
        for k, (x, y) in enumerate(cap_out):
            c = chip.get(k, 0.0) * chips
            s = scale - c / max(0.2, math.hypot(x - CX, y))
            vs.append(bm.verts.new((CX + (x - CX) * s, y * s, z + rng.uniform(-dz, dz) - c * 0.5)))
        return vs
    c0 = cap_ring(0.90, ZT - 0.004)
    for i, v in enumerate(c0):                                          # the undercut is uneven: the lower bed weathers back in places
        k = (0.94, 1.03, 0.90, 1.0, 0.92, 1.03, 0.96, 0.93, 0.98, 0.91, 1.03)[i % 11]
        v.co.x = CX + (v.co.x - CX) * k; v.co.y *= k
    c1 = cap_ring(1.0, 0.074, 0.008); c3 = cap_ring(0.985, TOP - 0.010, 0.002, chips=0.8); c4 = cap_ring(0.948, TOP, chips=1.0)
    g1 = cap_ring(0.875, TOP); g2 = cap_ring(0.850, TOP - 0.009); g3 = cap_ring(0.825, TOP)      # the tooled groove
    c5 = cap_ring(0.50, TOP)
    _loft(bm, kl, [c0, c1, c3, c4, g1, g2, g3, c5], [K_CAP_SIDE, K_CAP_SIDE, K_CHIP, K_CAP_TOP, K_SAND, K_SAND, K_CAP_TOP], closed_top=K_CAP_TOP)
    for ring, t in ((c0, 0.1), (c1, 0.55), (c3, 0.9), (c4, 1.0)):
        for v in ring: TV[tkey(v.co)] = t
    cap = mesh.new_mesh_object("capstone", bm)
    dc.smooth(bed, angle=30); dc.smooth(cap, angle=30)
    dc.paint(bed, "sand_pale", "#7C5A50"); dc.paint(cap, "sand_pale", "#B48A78")
    parts = [bed, cap]

    def kind_of(ob, kind):
        me = ob.data
        attr = me.attributes.get(KIND) or me.attributes.new(KIND, 'INT', 'FACE')
        attr.data.foreach_set("value", np.full(len(me.polygons), kind, dtype=np.int32))
        return ob

    # ---- seat 7 (the origin) is the one empty cup
    s7 = 0.019
    seats = dc.poly("seats", [[(dx, dy, TOP + 0.0014) for dx, dy in ((-s7, 0.0), (0.0, -s7), (s7, 0.0), (0.0, s7))]])
    dc.paint(seats, "sand_pale", "#2B1716"); parts.append(kind_of(seats, K_SEAT))
    # ---- the six kept cases in seats 1..6: spent, mouth up, each turned and leaning its own hair
    for i in range(6):
        x = -PITCH * (6 - i)
        c = dc.lathe(f"case{i}", [(0.0185, 0.0), (0.0190, CASE_H), (0.0150, CASE_H - 0.013)], seg=8, phase=0.5 * i, cap_last=True)
        dc.smooth(c, angle=62)                                          # round wall, hard mouth
        # the lean is 1.5 degrees at most: the bore ring must stay 11 mm from the seat's axis (tests/art_props/dress/variants.test.mjs)
        dc.place(c, (x, 0.0, TOP - 0.002), (math.radians(rng.uniform(-1.5, 1.5)), math.radians(rng.uniform(-1.5, 1.5)), 0.0))
        dc.paint(c, "sand_pale", BRASS)                                 # the pale cell: the lit mouth is paler than the `brass` cell allows
        parts.append(kind_of(c, K_CASE))
    # ---- loose stone
    def stone(name, size, centre, rot=(0, 0, 0), rough=0.16, shade=1.0, colour="#7A5850", subdiv=1):
        r = dc.rock(name, size, rng, subdiv=subdiv, rough=rough, flat_bottom=-0.6)
        dc.place(r, centre, rot); dc.smooth(r, angle=38)
        dc.paint(r, "sand_pale", colour, shade=shade)
        parts.append(kind_of(r, K_LOOSE)); return r
    flake = dc.prism("flake", [(-0.09, 0.0), (0.10, 0.0), (0.02, 0.075)], 0.028, axis='y', cap_back=False)
    dc.place(flake, (CX + 0.15, 0.335, ZT + 0.004), (math.radians(-74), 0.0, math.radians(8)))   # the flake that spalled off the back, lying on the terrace
    dc.paint(flake, "sand_pale", "#B48A78", shade=0.9); parts.append(kind_of(flake, K_LOOSE))
    # a low marker stack at the bed's far (left) end: three flat stones, the way a place is marked where nothing else stands
    sx, sy = CX - 0.80, 0.30
    stone("stack0", (0.34, 0.27, 0.11), (sx, sy, ZL + 0.045), (0.05, -0.04, 0.5), colour="#6E4E48")
    stone("stack1", (0.25, 0.21, 0.09), (sx + 0.015, sy - 0.01, ZL + 0.125), (-0.06, 0.05, 1.7), colour="#8A6258")
    stone("stack2", (0.16, 0.14, 0.085), (sx - 0.005, sy + 0.012, ZL + 0.195), (0.04, 0.09, 0.3), colour="#7C5A52")
    for (px, py, sz, h) in ((CX + 0.78, 0.44, 0.10, 0.05), (CX - 0.62, -0.50, 0.09, 0.045)):
        stone("pebble", (sz, sz * 0.8, h), (px, py, ZL + h * 0.3), (0.0, 0.0, rng.uniform(0, 3.0)), colour="#74524C", shade=rng.uniform(0.85, 1.1))
    ob = dc.join(parts, ASSET + "_mesh")

    dc.bake_ao([ob], distance=0.3, ground=-0.24)

    me = ob.data
    kv = np.zeros(len(me.polygons), dtype=np.int32); me.attributes[KIND].data.foreach_get("value", kv)

    def paint(p):
        k = kv[p.face]
        def mulv(mask, arr): p.col[mask] *= arr[mask, None]
        n1 = _noise(p.pos, 5.0, 1); n2 = _noise(p.pos, 17.0, 2); n3 = _noise(p.pos, 2.2, 3); n4 = _noise(p.pos, 9.0, 4)
        r = np.hypot(p.x - CX, p.y)
        bed_top = k == K_BED_TOP; bed_side = k == K_BED_SIDE; cap_top = k == K_CAP_TOP; cap_side = k == K_CAP_SIDE
        case = k == K_CASE; groove = k == K_GROOVE; loose = k == K_LOOSE; tool = k == K_SAND; arris = k == K_CHIP; riser = k == K_LAMINA
        fz = p.fcen[:, 2]; up = p.fnrm[:, 2]
        joint = k == K_JOINT; low = k == K_LOW; barris = k == K_ARRIS
        upper = bed_side | barris
        terr = bed_top & (p.z > (ZT + ZL) / 2)                          # the terrace's top
        low_top = bed_top & ~terr
        # the bed's top: three values going up (the apron darkest, the swept bed, the terrace), each broken by hand-sized
        # patches: desert varnish (dark, with an edge) and wind-polished stone (pale), a finer grain over both
        st = lambda n, a, b: np.clip((n - a) / (b - a), 0, 1) ** 2 * (3 - 2 * np.clip((n - a) / (b - a), 0, 1))
        p.col[low_top] = np.asarray(vcol.rgb("#6C5048"), dtype=np.float32)[None, :] * (p.col[low_top] / np.asarray(vcol.rgb("#7C5A50"), dtype=np.float32)[None, :])
        p.mix(terr * 0.85, "#927060")
        p.mix(bed_top * st(n3, 0.50, 0.62) * 0.8, "#402E2C")            # varnish
        p.mix(bed_top * st(n1, 0.56, 0.66) * 0.75, "#B8927C")           # polished
        p.mix(low_top * np.clip((r - 0.8) / 0.35, 0, 1) * st(n4, 0.4, 0.6) * 0.5, "#8C6A5C")   # blown dust toward the edge
        mulv(bed_top | bed_side | riser | barris, 0.86 + 0.28 * n2)
        p.mix(riser * 0.8, "#33222A")                                   # the step: in its own shade
        p.mix(riser * (up > 0.35) * 0.5, "#C29A84")                     # ... and struck pale where it breaks over
        p.mix(upper * 0.45, "#96604E")                                  # the upper course: a redder stone
        p.mix(upper * np.clip((-0.02 - p.z) / 0.09, 0, 1) * 0.55, "#4A3030")                 # darker down its face (it overhangs)
        p.mix(joint * 0.9, "#22161A")                                   # the joint
        p.mix(low * 0.92, "#2E2222")                                    # the lower bed: the darkest stone (the frame's dark anchor under the pale flag)
        p.mix(low * st(n1, 0.5, 0.65) * 0.5, "#4E3A36")
        mulv(low, 0.8 + 0.4 * n3)
        p.mix(barris * 0.8, "#C8A08A")                                  # the knocked arris: pale where it was struck
        p.mix(groove * 0.94, "#1E1215")                                 # the fractures
        # the afterglow lies on what faces it (the far side, +y here): a warm side, as the cliffs have
        warm = np.clip(p.nrm[:, 1] * 1.4, 0, 1) * np.clip(1.0 - np.abs(up), 0, 1)
        p.mix((upper | riser | cap_side | loose) * warm * 0.45, "#C8704A")
        # the capstone: a dressed flag: paler, swept; worn palest along the row; a tooled groove; dark in the undercut
        p.mix(cap_top * 0.8, "#BC907C")
        p.mix(cap_top * dc.P.near(p, (CX, 0.0, TOP), 0.5, scale=(1.0, 0.36, 1.0)) * 0.5, "#D8B098")
        mulv(cap_top, 0.92 + 0.16 * n2)
        p.mix(cap_top * np.clip((n1 - 0.55) * 3.0, 0, 1) * 0.3, "#9A7062")
        p.mix(tool * 0.9, "#4A3230")
        p.mix(cap_side * 0.45, "#8A5548")
        p.mix(cap_side * np.clip(1.0 - (p.z - ZT) / 0.03, 0, 1) * 0.8, "#2A1B22")
        p.mix(arris * 0.85, "#D6B09A")                                  # the arris and its chips: fresh stone
        mulv(cap_side | arris, 0.9 + 0.2 * n2)
        # loose stone: each its own value (part jitter), dust on what faces up
        p.mix(loose * np.clip(p.nrm[:, 2], 0, 1) * 0.4, "#A88474")
        mulv(loose, 0.85 + 0.3 * n1)
        # the cases: brass, tarnished at the foot, bright at the mouth, a lit flank toward the walker
        upf = p.fnrm[:, 2] > 0.6
        h = np.clip((p.z - TOP) / CASE_H, 0, 1)
        p.col[case] = np.asarray(vcol.rgb(BRASS), dtype=np.float32)[None, :]      # no stone AO on brass: it must read at dusk
        p.mix(case * (1.0 - h) ** 1.5 * 0.6, BRASS_FOOT)
        flank = np.clip(0.5 + 0.5 * (p.nrm[:, 0] * 0.35 - p.nrm[:, 1] * 0.94), 0, 1)   # the side that faces the walker is the lit one
        p.col[case & ~upf] *= (0.7 + 0.3 * flank[case & ~upf, None])
        p.mix(case * ~upf * flank ** 6 * 0.75, BRASS_LIT)               # the highlight: a narrow bright line down the lit flank
        p.mix(case * ~upf * np.clip((h - 0.6) / 0.4, 0, 1) * 0.6, BRASS_LIT)       # the mouth
        p.mix(case * upf * 1.0, BORE)                                   # the bore: its far wall is the lit rim

    if TEXTURED:
        # The rock (not the brass, not the seat) goes on the zone's own structure material with the cliffs' strata row:
        # zone.embed_prop keeps the material and UV0 of a face that is not m_prop / m_flat, and the chunk stays one
        # m_frontier mesh. COLOR_0 is then the true colour (texture 0.5 x 2), not a ratio over a palette cell.
        rock_faces = [i for i in range(len(me.polygons)) if kv[i] not in (K_CASE, K_SEAT)]
        material.assign(ob, "m_frontier", rock_faces)
        vcol.fill_color(ob, (1.0, 1.0, 1.0), dc.CELL, rock_faces)
        reg = manifest.trim_region("tx_frontier_trim", "strata"); v0, v1 = manifest.trim_v("tx_frontier_trim", "strata", 2.0)
        uvs = uv.get(ob, uv.UV0)
        # Across the row (V) by RING, not by a plane: the row does not tile in V, and a plane across 2.4 m of top would
        # show it at 50 texels a metre. Each ring of the skin sits at its own place in the row, turning back at the
        # terrace's edge and at the joint, so the beds follow the stone's own contours a few centimetres apart, the way
        # a weathered outcrop shows its laminae; along the row (U) three repeats round the stone (no seam).
        for i in rock_faces:
            pl = me.polygons[i]; kd = kv[i]
            a0 = math.atan2(pl.center.y, pl.center.x - CX)
            for li in pl.loop_indices:
                co_ = me.vertices[me.loops[li].vertex_index].co; x, y, z = co_
                t = TV.get(tkey(co_))
                if kd in (K_CAP_TOP, K_SAND) or t is None:               # the flag's dressed top, loose stone: a plane
                    u = (x * 0.94 + y * 0.34) / 0.9
                    t = 0.25 + 0.5 * (y + 0.26) / 0.52 if kd in (K_CAP_TOP, K_SAND) else 0.2 + 2.2 * (z - ZL)
                else:
                    a = math.atan2(y, x - CX)
                    a = a0 + (a - a0 + math.pi) % (2 * math.pi) - math.pi          # (no face spans the seam at +-pi)
                    u = a / (2 * math.pi) * 3.0
                uvs[li] = (u, v0 + (v1 - v0) * min(1.0, max(0.0, t)))
        uv.put(ob, uvs, uv.UV0)
    dc.compose(ob, ao=0.9, gradient=(1.0, 1.0), part_jitter=0.07, face_jitter=0.03, seed=args.seed, painters=[paint], contact=None, z_range=(-0.36, TOP + CASE_H))
    if KIND in ob.data.attributes: ob.data.attributes.remove(ob.data.attributes[KIND])
    if TEXTURED:
        # one mesh per material: zone.embed_prop reads a mesh's material slots after clearing them, so a mesh with two
        # slots comes through as all m_prop (and is folded flat); two meshes of one slot each keep their materials
        import bpy
        scene.select_only(ob); bpy.context.view_layer.objects.active = ob
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.separate(type='MATERIAL'); bpy.ops.object.mode_set(mode='OBJECT')
        for o in [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name.startswith(ASSET + "_mesh")]:
            names = [m.name.split(".")[0] for m in o.data.materials if m]
            o.name = ASSET + ("_mesh" if "m_frontier" in names else "_brass")


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
