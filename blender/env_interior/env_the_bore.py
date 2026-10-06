"""env_the_bore: the round bore chamber, its catwalk, stair and antechamber (work order art-env-interior 4.4;
ART_BIBLE 3.6, 7.3; LEVEL 6; GDD 8, 13.4).

    node tools/build-assets.mjs --only env_the_bore          (KS_Q=draft in the environment: quick bake)

The chamber is ONE 60-degree sector cut rib-centre to rib-centre (bearings 30..90: one bay, its lamp, its proving
mark, half a rib each side), modelled whole and clipped to the wedge, baked once with five lit dummy sectors round
it, then copied five times about `bore_axis`: the six sectors share their lightmap UVs and their vertex light, so the
bake is six-fold symmetric (ART_BIBLE checklist 30). The door bay, the proving-lift gate, the catwalk and its wall
openings, the cartridge-point and locker seats and the kerb-foot grates are placed on top afterwards and are NOT in
the sector bake.

`lm_bore` is the FILL: six aqua bay lamps (3 m pools), the embers, the cradle lamp, ambient x AO (#1A1030 x 0.2 in the
chamber and on the catwalk; a warm dark in the antechamber and on its stair since polish round 2, see AMB_AN); no bore light. `lm_bore_glow` is the bore's light alone
(greyscale; the runtime tints it violet -> aqua, bottom-up by world height): strong on the rib inner faces, weaker on
the ceiling, on the catwalk's underside.
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import math, random, time
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix
from lib import scene, mesh, uv, material, vcol, bake, export, zone, layout, manifest, brand
import interior_common as ic
from interior_common import B, lin, cuts, frange

ASSET = "env_the_bore"
LM, GLOW = "lm_bore", "lm_bore_glow"
AX = (14.0, -44.0, 96.0)
FL, CE = -44.0, -30.0
R_WALL, R_KERB0, R_KERB1, R_MARK = 15.0, 3.0, 3.6, 4.9
B0, B1 = 30.0, 90.0                                                  # the sector: rib centre to rib centre
SHAFT_LOW = -50.9                                                    # the chunk box stops at -51; deeper is the bore_glow column
AMB_CH = ic.ambient("#1A1030", 0.2, gain=0.50)
# polish round 2 (visual critic, major: "antechamber is violet where the bible says embers"; walls and floor measured
# #2d1e44 / #2f1c41 in the game). The antechamber's fill was the mood's `#132547 x 0.2`, a saturated blue, and the L5
# grade (lift 0.025, 0.010, 0.045) carries blue-violet on top of it: together a violet room, against ART_BIBLE 2.4
# ("the antechamber is not violet: it belongs to the Dowser's embers"). 2.4 outranks the fill's hex: the fill is a warm
# dark now (fog #1A1420 turned toward the embers), at the same level, and the embers' own bounce (EMBER_FAR) carries
# across the room to the door wall.
def _env(k, d): return float(os.environ.get(k, d))
# look-dev, polish round 3 (lead ruling R7): that warm fill was a YELLOW one (1, 0.95, 0.25): every wall, the floor and the
# ceiling of the antechamber baked to one even mustard (frame L* 21 / 27 / 44, 86 % of it between L* 21 and 31) and the
# embers were a 20 px dot in it. The room is a cold vault with one fire in it: a cool grey fill at a lower level (neither
# yellow nor violet), and the warmth is the embers' own light, larger (reach 4 -> 6.5 m, the floor beside them 0.8 -> 1.3)
# and carried to the door wall by their bounce.
AMB_AN = np.array([_env("KS_AN_R", 0.70), _env("KS_AN_G", 0.82), _env("KS_AN_B", 1.0)], dtype=np.float32) * _env("KS_AN_AMB", 0.085)
EMBER_FAR = _env("KS_EMBER_FAR", 0.24)                               # what the cradle's wall (10 m off) reads from the embers' bounce
EMBER_T, EMBER_R = _env("KS_EMBER_T", 1.3), _env("KS_EMBER_R", 6.5)
# look-dev, polish round 3: the chamber's walls took the fill and a bounce only (from the flank and from behind, 89 to 93 %
# of a boss frame under L* 35 and the Windlass a dark mass on dark walls). Each bay lamp also throws a scallop down its
# own wall: the lining reads WALL_WASH_T at 2.4 m and is gone by the kick plate and above the lamp, so the lower wall
# is the room's mid mass and the upper wall stays the dark the machine's lit edge stands on.
WALL_WASH_T, WALL_WASH_R = _env("KS_WALLW_T", 0.6), _env("KS_WALLW_R", 7.5)
BAY_NAMES = ("arrival_well", "bulkhead_bay", "arrival_floor", "bay_lamp_bezel", "bay_hazard_", "hatch_threshold", "hatch_reveal", "bay_wash_bezel_", "bay_band")
# polish round 3 (visual critic, major: the bore arrival, the catwalk and the proving-lift room are near-black frames)
CAT_PANEL = tuple(ic.mix("enamel", "concrete", 0.35)); CAT_PANEL_LOW = tuple(ic.mix("enamel_stain", "steel", 0.45))
BAY_T = tuple(ic.mix("enamel_stain", "steel", 0.5)); BULK_T = tuple(ic.mix("enamel_stain", "concrete", 0.45))
LIFT_T = tuple(ic.mix("enamel_stain", "steel", 0.35)); LIFT_LOW = tuple(ic.mix("enamel_stain", "steel", 0.65))
CAT_LAMP_T, BAY_WASH_T, BAY_LAMP_T, LIFT_LAMP_T, LIFT_WASH_T = _env("KS_CAT_T", 0.20), _env("KS_WASH_T", 0.5), _env("KS_BAYL_T", 0.42), _env("KS_LIFT_T", 0.55), _env("KS_LIFTW_T", 0.45)
# polish round 4 (visual critic, minor: "the bore arrival is a wall of bright mesh squares"): the bay lamp reads 0.42 on
# the floor (0.7) and dies within 5.5 m (8): the bay's three closed walls, seen through the cage's lattice, fall from a
# pool under the lamp to dark at the far corners; the bulkhead she faces keeps its two washers.
CAT_LAMPS, BAY_WASH = [], []
DECK_T = tuple(ic.mix("steel", "concrete", 0.5))
RESERVE_ANTE = {"prop_camp_ash": 0.5, "prop_kettle": 1.0, "rd_note": 0.25}
RESERVE_CH = {"ia_proving_mark": 6.0}
ROWS = cuts(FL, CE, 1.2, [FL + 0.3, FL + 3.0, -36.3, -33.4, -32.0])
# fix pass 1 (critic round 1): the satin floor must be the lightest large surface of the chamber and the ribs its
# darkest (ART_BIBLE 2.3 / 3.6); in the first build the wall panels and ribs were pale enamel and out-shone the floor
# in the fill bake. The lining is the shadowed, stained glaze now, darker above the livery band; the floor is paler.
FLOOR_T = tuple(ic.mix("concrete", "enamel", 0.6))
WALL_LOW = tuple(ic.mix("enamel_stain", "steel", 0.42))
WALL_HIGH = tuple(ic.mix("enamel_stain", "steel", 0.62))
RIB_T = tuple(ic.mix("enamel_stain", "steel", 0.38))

sector, extra_ch, ante, emb, dec, emi, ante_dec = [], [], [], [], [], [], []      # the clipped sector / chamber parts on top / antechamber + stair


def P(r, b, y):
    """GAME point at radius r and compass bearing b (degrees, 0 = north = -z, clockwise) from the bore axis, height y."""
    return (AX[0] + r * math.sin(math.radians(b)), y, AX[2] - r * math.cos(math.radians(b)))


def bearing(x, z):
    return math.degrees(math.atan2(x - AX[0], -(z - AX[2]))) % 360.0


def rnd(a): return round(a, 6)


# ====================================================================================================== polar builders
def polar(name, rs, bs, y, region, tint, lm=True, down=False, mpr=3.6, row=1.2, rbase=None, cell=None):
    """A flat polar grid at height y (rings rs x bearings bs), UV: U along the ring's arc, V across the ring rows."""
    sheet = ic.SHEET["m_pellam"]
    rr = manifest.trim_region(sheet, region); v0, v1 = manifest.trim_v(sheet, region)
    bm = mesh.new_bmesh(); uvl = bm.loops.layers.uv[0]; cl = bm.loops.layers.float_color.new("Tint")
    vt = {}
    def V(i, j):
        key = (i, 0) if rs[i] < 1e-6 else (i, j)                       # the axis is one vertex
        if key not in vt: vt[key] = bm.verts.new(B(P(rs[i], bs[key[1]], y)))
        return vt[key]
    rb = rbase if rbase is not None else rs[0]
    for i in range(len(rs) - 1):
        for j in range(len(bs) - 1):
            if rs[i + 1] - rs[i] < 1e-6: continue
            ov = cell(i, j) if cell else None
            if ov is False: continue
            q = [V(i, j), V(i, j + 1), V(i + 1, j + 1), V(i + 1, j)] if not down else [V(i, j), V(i + 1, j), V(i + 1, j + 1), V(i, j + 1)]
            try: f = bm.faces.new(list(dict.fromkeys(q)))
            except ValueError: continue
            rmid = (rs[i] + rs[i + 1]) / 2
            k = math.floor((rs[i] - rb) / row + 1e-6)
            c = lin((ov or {}).get("tint", tint))
            for lp in f.loops:
                vv = next(key for key, val in vt.items() if val is lp.vert)
                ri, bj = rs[vv[0]], bs[vv[1]]
                u = rmid * math.radians(bj) / mpr
                fr = min(1.0, max(0.0, (ri - rb) / row - k))
                lp[uvl].uv = (u, v0 + fr * (v1 - v0)); lp[cl] = (float(c[0]), float(c[1]), float(c[2]), 1.0)
    bm.normal_update()
    if not down:
        for f in bm.faces:
            if f.normal.z < 0: f.normal_flip()
    else:
        for f in bm.faces:
            if f.normal.z > 0: f.normal_flip()
    ob = mesh.new_mesh_object(name, bm); material.assign(ob, "m_pellam")
    for p in ob.data.polygons: p.use_smooth = True
    ob["lm"] = bool(lm)
    return ob


def ring_wall(name, r, bs, ys, inward, region, tint, lm=True, mpr=3.6, cell=None, vbase=None):
    """A round wall (radius r) between bearings bs and heights ys, facing the axis (inward) or away from it."""
    sheet = ic.SHEET["m_pellam"]
    rr = manifest.trim_region(sheet, region); v0, v1 = manifest.trim_v(sheet, region); row = rr["metres_v"]
    vb = ys[0] if vbase is None else vbase
    bm = mesh.new_bmesh(); uvl = bm.loops.layers.uv[0]; cl = bm.loops.layers.float_color.new("Tint")
    vt = {}
    def V(j, i):
        if (j, i) not in vt: vt[(j, i)] = bm.verts.new(B(P(r, bs[j], ys[i])))
        return vt[(j, i)]
    for i in range(len(ys) - 1):
        for j in range(len(bs) - 1):
            ov = cell(i, j, (ys[i] + ys[i + 1]) / 2) if cell else None
            if ov is False: continue
            q = [V(j, i), V(j + 1, i), V(j + 1, i + 1), V(j, i + 1)]
            if not inward: q = q[::-1]
            f = bm.faces.new(q)
            k = math.floor((ys[i] - vb) / row + 1e-6)
            c = lin((ov or {}).get("tint", tint))
            for lp in f.loops:
                jj, ii = next(key for key, val in vt.items() if val is lp.vert)
                fr = min(1.0, max(0.0, (ys[ii] - vb) / row - k))
                lp[uvl].uv = (r * math.radians(bs[jj]) / mpr, v0 + fr * (v1 - v0)); lp[cl] = (float(c[0]), float(c[1]), float(c[2]), 1.0)
    bm.normal_update()
    cen = B((AX[0], 0, AX[2]))
    for f in bm.faces:
        c = f.calc_center_median(); to_axis = Vector((cen.x - c.x, cen.y - c.y, 0))
        if (f.normal.dot(to_axis) < 0) == inward: f.normal_flip()
    ob = mesh.new_mesh_object(name, bm); material.assign(ob, "m_pellam")
    for p in ob.data.polygons: p.use_smooth = True
    ob["lm"] = bool(lm)
    return ob


def clip_wedge(objs, b0=B0, b1=B1):
    """Cut every object to the wedge of bearings b0..b1 about the bore axis (parts built whole across the edges, then
    halved: the copies about the axis put the halves back together)."""
    keep = []
    for o in objs:
        bm = bmesh.new(); bm.from_mesh(o.data)
        a = B((AX[0], 0, AX[2])); a.z = 0
        for b, sgn in ((b0, -1.0), (b1, 1.0)):
            t = Vector((math.cos(math.radians(b)), 0, math.sin(math.radians(b))))     # GAME tangent (increasing bearing)
            n = ic.Bd(t) * sgn
            geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
            bmesh.ops.bisect_plane(bm, geom=geom, plane_co=a, plane_no=n, clear_outer=True, dist=1e-5)
        bm.to_mesh(o.data); bm.free(); o.data.update()
        if len(o.data.polygons): keep.append(o)
        else: bpy.data.objects.remove(o, do_unlink=True)
    return keep


def in_wedge(x, z, b0, b1):
    b = bearing(x, z); return (b - b0) % 360.0 <= (b1 - b0) % 360.0


# ====================================================================================================== the sector
def facet_points(f, r=R_WALL):
    """The two ends of the wall facet tangent at bearing f (the room is a 24-gon: facets every 15 degrees)."""
    re = r / math.cos(math.radians(7.5))
    return P(re, f - 7.5, 0), P(re, f + 7.5, 0)


def build_sector():
    s = []
    def add(o): s.append(o); return o
    bs = frange(B0 - 7.5, B1 + 7.5, 7.5)                               # whole facets/ribs at the edges, clipped later
    floor_t = FLOOR_T
    rs = [R_KERB1, 4.8, 6.0, 7.2, 8.4, 9.6, 10.8, 12.0, 13.2, 14.4, 15.25]
    add(polar("floor", rs, frange(B0, B1, 7.5), FL, "floor", floor_t, lm=True, rbase=R_KERB1))
    add(polar("floor_joint", [R_KERB1, R_KERB1 + 0.15], frange(B0, B1, 7.5), FL + 0.004, "steel", "steel", lm=False, row=0.6))
    # the bore shaft lining (panel courses down to the chunk's floor) and the kerb, notch and merlons
    add(ring_wall("shaft", R_KERB0, frange(B0, B1, 7.5), [SHAFT_LOW, -49.6, -48.4, -47.2, -46.0, -44.8, FL], True, "panel", tuple(ic.mix("enamel", "steel", 0.25)), lm=True, vbase=SHAFT_LOW))
    kb = [B0 - 12.5, B0 - 6.25, B0, B0 + 6.25, B0 + 12.5, 48.33, 54.17, 60.0, 65.83, 71.67, B1 - 12.5, B1 - 6.25, B1, B1 + 6.25, B1 + 12.5]
    def top(b):
        d = min(abs(b - B0), abs(b - B1))
        return FL + 1.2 if d <= 12.5 + 1e-6 else FL + 0.6
    f = []
    for j in range(len(kb) - 1):
        ba, bb = kb[j], kb[j + 1]; mid = (ba + bb) / 2; t = top(mid)
        for r, inward in ((R_KERB0, True), (R_KERB1, False)):
            q = [P(r, ba, FL), P(r, bb, FL), P(r, bb, t), P(r, ba, t)]
            f.append(q if inward else q[::-1])
        f.append([P(R_KERB0, ba, t), P(R_KERB0, bb, t), P(R_KERB1, bb, t), P(R_KERB1, ba, t)][::-1])
    for b in (B0 - 12.5, B0 + 12.5, B1 - 12.5, B1 + 12.5):                # merlon ends
        f.append([P(R_KERB0, b, FL + 0.6), P(R_KERB1, b, FL + 0.6), P(R_KERB1, b, FL + 1.2), P(R_KERB0, b, FL + 1.2)])
    kerb = ic.from_faces("kerb", f, "m_pellam", "enamel_stain", None, bevel=0.0, lm=True, smooth=20)
    _orient_kerb(kerb)
    mesh.finish(kerb, bevel=0.02, smooth_angle=20)
    add(kerb)
    # pass 2: the kerb is a cast ring, not a drum: a dark steel foot (0.12 m, 30 mm proud) and a steel band under its
    # top edge on the outer face, a joint strip down each merlon end's corner; nothing is added on top (the notch's
    # 0.6 m is the kept shot's sight line)
    tf = []
    for j in range(len(kb) - 1):
        ba, bb = kb[j], kb[j + 1]; t = top((ba + bb) / 2)
        r1 = R_KERB1 + 0.03
        tf.append(("foot", [P(r1, bb, FL), P(r1, ba, FL), P(r1, ba, FL + 0.12), P(r1, bb, FL + 0.12)]))
        tf.append(("foot", [P(r1, bb, FL + 0.12), P(r1, ba, FL + 0.12), P(R_KERB1, ba, FL + 0.15), P(R_KERB1, bb, FL + 0.15)]))
        r2 = R_KERB1 + 0.012
        tf.append(("band", [P(r2, bb, t - 0.2), P(r2, ba, t - 0.2), P(r2, ba, t - 0.08), P(r2, bb, t - 0.08)]))
    add(ic.from_faces("kerb_foot", [q for k, q in tf if k == "foot"], "m_pellam", "steel_dark", None, away_from=(AX[0], FL, AX[2]), lm=False, smooth=20))
    add(ic.from_faces("kerb_band", [q for k, q in tf if k == "band"], "m_pellam", "steel", "steel", away_from=(AX[0], FL + 0.5, AX[2]), lm=False, smooth=20, mpr=3.6))
    # the shaft's courses: a steel ring at every 1.2 m joint of the lining (dark against the lit lining, receding down)
    sb = frange(B0, B1, 7.5); rf = []
    for y in (-45.2, -46.4, -47.6, -48.8, -50.0):
        for ba, bb in zip(sb[:-1], sb[1:]):
            ri = R_KERB0 - 0.07
            rf.append([P(ri, ba, y - 0.05), P(ri, bb, y - 0.05), P(ri, bb, y + 0.05), P(ri, ba, y + 0.05)])
            rf.append([P(ri, ba, y + 0.05), P(ri, bb, y + 0.05), P(R_KERB0, bb, y + 0.05), P(R_KERB0, ba, y + 0.05)])
            rf.append([P(R_KERB0, ba, y - 0.05), P(R_KERB0, bb, y - 0.05), P(ri, bb, y - 0.05), P(ri, ba, y - 0.05)])
    add(ic.from_faces("shaft_rings", rf, "m_pellam", "steel_dark", None, recalc=True, lm=False, smooth=20))
    # a broad ochre hazard diagonal across each merlon's top
    for rb in (B0, B1):
        poly = ic.diagonal_band(-0.8, R_KERB0 + 0.02, 0.8, R_KERB1 - 0.02, 0.3)
        add(ic.from_faces(f"merlon_hazard_{int(rb)}", [[P(sr, rb + math.degrees(t / 3.3), FL + 1.204) for t, sr in poly]], "m_pellam", "hazard", None, away_from=(AX[0], FL - 3, AX[2]), lm=False))
    # walls: 24 facets tangent at r 15, panel courses, kick plate, livery band; columns at +-1.5 m (door / gate widths)
    for fb in (B0, 45.0, 60.0, 75.0, B1):
        a, b = facet_points(fb)
        av, bv = Vector(a), Vector(b); w = (bv - av).length; d = (bv - av) / w
        us = [0.0, w / 2 - 1.5, w / 2 + 1.5, w]
        def wcell(i, j, uc, vc):
            if vc < FL + 0.3: return {"region": "steel", "tint": "steel", "row": 0.6, "vbase": FL, "vrange": (0.0, 0.5)}
            return {"tint": WALL_LOW if vc < FL + 1.2 else WALL_HIGH}
        add(ic.surface(f"wall_{int(fb)}", (a[0], 0, a[2]), (d.x, 0, d.z), (0, 1, 0), us, ROWS, "m_pellam", "panel", WALL_HIGH, vbase=FL, mpr=w, cell=wcell, lm=True))
        # facing check: the wall must look at the axis
        o = s[-1]; c = o.data.polygons[0].center; to = B((AX[0], c.z, AX[2])) - c
        if o.data.polygons[0].normal.dot(to) < 0: o.data.flip_normals()
        n_in = Vector((AX[0] - (a[0] + b[0]) / 2, AX[2] - (a[2] + b[2]) / 2)).normalized() * 0.006
        # fix pass 1 (bake-dark warnings triaged): the band's four vertices lay under the lesenes at the facet joints, so
        # the brand's own line baked black round the whole chamber. It stops at the lesenes' edges and carries a loop.
        ba = (a[0] + d.x * 0.125, a[2] + d.z * 0.125); bb = (b[0] - d.x * 0.125, b[2] - d.z * 0.125)
        add(ic.from_faces(f"band_{int(fb)}", [[(ba[0] + n_in.x, FL + 1.15, ba[1] + n_in.y), (bb[0] + n_in.x, FL + 1.15, bb[1] + n_in.y), (bb[0] + n_in.x, FL + 1.25, bb[1] + n_in.y), (ba[0] + n_in.x, FL + 1.25, ba[1] + n_in.y)]],
                          "m_pellam", "livery", None, toward=(AX[0], FL + 1.2, AX[2]), tess=1.0))
        # a steel lesene at each facet joint (vertical, 0.24 m, 0.06 proud): the 24-gon reads as built
        ja = Vector((a[0], a[2])); n2 = Vector((AX[0] - a[0], AX[2] - a[2])).normalized()
        tg = Vector((-n2.y, n2.x))
        q = lambda dt, dn, y: (a[0] + tg.x * dt + n2.x * dn, y, a[2] + tg.y * dt + n2.y * dn)
        les = [[q(-0.12, 0.06, FL), q(0.12, 0.06, FL), q(0.12, 0.06, CE), q(-0.12, 0.06, CE)],
               [q(-0.12, 0.0, FL), q(-0.12, 0.06, FL), q(-0.12, 0.06, CE), q(-0.12, 0.0, CE)], [q(0.12, 0.06, FL), q(0.12, 0.0, FL), q(0.12, 0.0, CE), q(0.12, 0.06, CE)]]
        add(ic.from_faces(f"lesene_{int(fb)}", les, "m_pellam", "steel", "steel", away_from=(a[0] - n2.x, -37, a[2] - n2.y), lm=True, mpr=3.6, along=(0, 0, 1)))
    # the ribs at 30 and 90 (built whole, halved by the clip): ceramic piers 1.6 x 3.0 m, r 7.5..10.5, a 0.6 m fillet into the vault
    for rb in (B0, B1):
        _rib(rb, add)
    # the bay lamp housing at 5 m on the bay's facet (its lamp belongs to the lamp set bay_lamps)
    lamp_c = P(R_WALL - 0.13, 60.0, FL + 5.0)
    hb = Vector((math.cos(math.radians(60)), 0, math.sin(math.radians(60))))
    n60 = Vector((-math.sin(math.radians(60)), 0, math.cos(math.radians(60))))
    lc = Vector(lamp_c)
    hous = []
    for (dt0, dt1, dy0, dy1, dn0, dn1) in ((-0.75, 0.75, -0.17, 0.17, -0.13, 0.0),):
        pts = lambda t, yy, nn: tuple(lc + hb * t + Vector((0, yy, 0)) + n60 * nn)
        hous = [[pts(dt0, dy0, dn0), pts(dt1, dy0, dn0), pts(dt1, dy1, dn0), pts(dt0, dy1, dn0)],
                [pts(dt0, dy1, dn0), pts(dt1, dy1, dn0), pts(dt1, dy1, dn1), pts(dt0, dy1, dn1)],
                [pts(dt0, dy0, dn1), pts(dt1, dy0, dn1), pts(dt1, dy0, dn0), pts(dt0, dy0, dn0)],
                [pts(dt0, dy0, dn1), pts(dt0, dy0, dn0), pts(dt0, dy1, dn0), pts(dt0, dy1, dn1)],
                [pts(dt1, dy0, dn0), pts(dt1, dy0, dn1), pts(dt1, dy1, dn1), pts(dt1, dy1, dn0)]]
    add(ic.from_faces("bay_lamp_housing", hous, "m_pellam", "steel_dark", None, bevel=0.02, away_from=tuple(lc + n60 * 0.2), tess=0.6))
    q0 = lc + n60 * (-0.132)
    bay_lamp = [tuple(q0 + hb * t + Vector((0, yy, 0))) for t, yy in ((0.65, -0.1), (-0.65, -0.1), (-0.65, 0.1), (0.65, 0.1))]
    # fix pass 1 (critic: plain panel courses, 40 % of the budget unspent): what a working wall of this station carries.
    # On the bay's facet a conduit drops from the lamp housing to a junction box above the band; the two facets beside
    # it carry a bolted access panel each (one of them the stained variant); a service main runs round the room at
    # 8 m on a bracket at every lesene. All of it is built per facet in the facet's own frame and vertex-lit.
    def facet_frame(fb):
        a_, b_ = facet_points(fb); c_ = (Vector(a_) + Vector(b_)) / 2; d_ = (Vector(b_) - Vector(a_)).normalized()
        n_ = Vector((AX[0] - c_.x, 0, AX[2] - c_.z)).normalized()
        return (lambda t, y, off: (c_.x + d_.x * t + n_.x * off, y, c_.z + d_.z * t + n_.z * off)), (c_.x + n_.x * 3, c_.z + n_.z * 3)
    def fbox(name, fb, t0, t1, y0, y1, depth, tint, bevel=0.0, tess=None, back=0.0):
        Q, inside = facet_frame(fb)
        fs = [[Q(t0, y0, depth), Q(t1, y0, depth), Q(t1, y1, depth), Q(t0, y1, depth)],
              [Q(t0, y1, back), Q(t0, y1, depth), Q(t1, y1, depth), Q(t1, y1, back)], [Q(t0, y0, depth), Q(t0, y0, back), Q(t1, y0, back), Q(t1, y0, depth)],
              [Q(t0, y0, back), Q(t0, y0, depth), Q(t0, y1, depth), Q(t0, y1, back)], [Q(t1, y0, depth), Q(t1, y0, back), Q(t1, y1, back), Q(t1, y1, depth)]]
        mid = Q((t0 + t1) / 2, (y0 + y1) / 2, back - 0.5)
        return add(ic.from_faces(name, fs, "m_pellam", tint, None, bevel=bevel, away_from=mid, tess=tess))
    fbox("lamp_conduit", 60.0, -0.035, 0.035, FL + 1.78, FL + 4.83, 0.05, "steel", tess=0.8)
    fbox("lamp_jbox", 60.0, -0.17, 0.17, FL + 1.42, FL + 1.78, 0.11, "steel_dark", bevel=0.015)
    fbox("lamp_jbox_lid", 60.0, -0.11, 0.11, FL + 1.48, FL + 1.72, 0.125, "steel", back=0.11)
    for fb, tint in ((45.0, WALL_LOW), (75.0, tuple(ic.mix("enamel_stain", "steel", 0.25)))):
        fbox(f"access_{int(fb)}", fb, -0.55, 0.55, FL + 1.5, FL + 2.9, 0.035, tint, bevel=0.012, tess=0.6)
        for k, (t, y) in enumerate(((-0.47, FL + 1.58), (0.47, FL + 1.58), (0.47, FL + 2.82), (-0.47, FL + 2.82))):
            fbox(f"access_{int(fb)}_bolt{k}", fb, t - 0.025, t + 0.025, y - 0.025, y + 0.025, 0.05, "steel", back=0.035)
        fbox(f"access_{int(fb)}_pull", fb, -0.12, 0.12, FL + 2.12, FL + 2.18, 0.065, "steel_dark", back=0.035)
    main_y = FL + 6.9                                                   # below the catwalk's wall slots (y -36.3 and up)
    for fb in (B0, 45.0, 60.0, 75.0, B1):
        Qm, _ = facet_frame(fb); hw_ = (Vector(facet_points(fb)[1]) - Vector(facet_points(fb)[0])).length / 2
        add(ic.cyl(f"main_{int(fb)}", Qm(-hw_ + 0.02, main_y, 0.34), Qm(hw_ - 0.02, main_y, 0.34), 0.11, 8, "m_pellam", "steel", "steel", cap=False, tess=1.4, mpr=3.6))
        fbox(f"main_arm_{int(fb)}", fb, -hw_ - 0.04, -hw_ + 0.04, main_y - 0.2, main_y - 0.11, 0.46, "steel_dark")
        fbox(f"main_strap_{int(fb)}", fb, -hw_ + 0.18, -hw_ + 0.26, main_y - 0.13, main_y + 0.13, 0.47, "steel_dark", back=0.2)
    # ceiling: a polar wedge, panel courses; the ring girder round the axis; radial beams on the rib bearings; a cable run to the bay
    add(polar("ceiling", [0.0, 3.0, 4.2, 6.0, 8.4, 10.8, 13.2, 15.25], frange(B0, B1, 7.5), CE, "panel", tuple(ic.mix("enamel_stain", "concrete", 0.5)), lm=True, down=True, rbase=0.0))
    gb = frange(B0 - 7.5, B1 + 7.5, 7.5)
    add(ring_wall("girder_out", 3.0, gb, [CE - 0.9, CE - 0.6, CE], False, "steel", "steel", lm=True))
    add(ring_wall("girder_in", 2.2, gb, [CE - 0.9, CE], True, "steel", "steel_dark", lm=True))
    add(polar("girder_bot", [2.2, 3.0], gb, CE - 0.9, "steel", "steel", lm=True, down=True, row=0.6, rbase=2.2))
    add(ring_wall("girder_flange", 3.06, gb, [CE - 0.95, CE - 0.85], False, "steel", "steel_dark", lm=False))
    for rb in (B0, B1):
        a = Vector(P(3.0, rb, CE)); bpt = Vector(P(R_WALL - 0.1, rb, CE)); d = (bpt - a).normalized(); t2 = Vector((-d.z, 0, d.x))
        f = []
        w, h = 0.22, 0.55
        def Q(p, tt, yy): return tuple(p + t2 * tt + Vector((0, yy, 0)))
        f += [[Q(a, -w, -h), Q(bpt, -w, -h), Q(bpt, w, -h), Q(a, w, -h)], [Q(a, -w, 0), Q(bpt, -w, 0), Q(bpt, -w, -h), Q(a, -w, -h)], [Q(a, w, -h), Q(bpt, w, -h), Q(bpt, w, 0), Q(a, w, 0)]]
        add(ic.from_faces(f"beam_{int(rb)}", f, "m_pellam", "steel", "steel", away_from=tuple((a + bpt) / 2 + Vector((0, 1.0, 0))), lm=True, mpr=3.6))
    tr = []
    a = Vector(P(3.1, 60.0, CE - 0.35)); bpt = Vector(P(R_WALL - 0.15, 60.0, CE - 0.35)); d = (bpt - a).normalized(); t2 = Vector((-d.z, 0, d.x))
    tr.append([tuple(a - t2 * 0.25), tuple(bpt - t2 * 0.25), tuple(bpt + t2 * 0.25), tuple(a + t2 * 0.25)])
    add(ic.from_faces("tray_60", tr, "m_pellam", "steel_dark", "steel", away_from=tuple((a + bpt) / 2 + Vector((0, 2, 0))), mpr=3.6, tess=1.5))
    for k, o_ in enumerate((-0.12, 0.08)):
        pts = []
        for i in range(9):
            t = i / 8.0; p = a + (bpt - a) * t + t2 * o_
            pts.append(tuple(p + Vector((0, 0.05 - 0.35 * math.sin(math.pi * t) * (1 if k else 0.6), 0))))
        add(ic.tube(f"cable_60_{k}", pts, 0.045, 6, "m_pellam", "cable", "cable", mpr=0.8))
    for t in (0.33, 0.66):
        p = a + (bpt - a) * t
        add(ic.cyl(f"hanger_60_{int(t * 100)}", tuple(p + Vector((0, 0.35, 0))), tuple(p), 0.02, 5, "m_pellam", "steel", None))
    # the proving mark (embedded, dark brass, flush; lightmapped with the floor) and its glow (lamp set mark_glows)
    loc, rz = layout.placement("ia_proving_mark_2")
    obs = zone.embed_prop("ia_proving_mark", node=None, location=loc, rot_z=rz, material_name="m_pellam", lightmap=LM)
    for o in obs:
        o["lm"] = False; ic.lm_some(o, lambda p: p.normal.z > 0.9 and p.area > 0.002)
    s.extend(obs)
    mk = P(R_MARK, 60.0, FL + 0.016)
    mark_disc = [tuple(Vector(mk) + Vector((0.25 * math.cos(2 * math.pi * i / 16), 0, -0.25 * math.sin(2 * math.pi * i / 16)))) for i in range(16)]
    s = clip_wedge(s)
    return s, bay_lamp, mark_disc


def _orient_kerb(ob):
    """Kerb faces: inner ones toward the axis, outer ones away, tops up, merlon ends along the arc."""
    me = ob.data; cen = B((AX[0], 0, AX[2]))
    bm = bmesh.new(); bm.from_mesh(me)
    for f in bm.faces:
        c = f.calc_center_median(); rad = math.hypot(c.x - cen.x, c.y - cen.y)
        if abs(f.normal.z) > 0.7:
            if f.normal.z < 0: f.normal_flip()
            continue
        radial = Vector((c.x - cen.x, c.y - cen.y, 0)).normalized()
        if abs(f.normal.dot(radial)) > 0.5:
            want_out = rad > (R_KERB0 + R_KERB1) / 2
            if (f.normal.dot(radial) > 0) != want_out: f.normal_flip()
        else:                                                         # merlon end: faces away from its merlon (the lower notch side)
            b = bearing(*([layout.to_game(c)[0], layout.to_game(c)[2]]))
            near = min((B0, B1), key=lambda rb: abs(((b - rb + 180) % 360) - 180))
            tg = Vector((math.cos(math.radians(b)), -math.sin(math.radians(b)), 0))           # Blender tangent of increasing bearing
            sgn = 1.0 if ((b - near + 180) % 360) - 180 > 0 else -1.0
            if f.normal.dot(tg) * sgn < 0: f.normal_flip()
    bm.to_mesh(me); bm.free(); me.update()


def _course_rows(ob, region="panel"):
    """Polish round 5 (visual critic: "dark vertical claw-like streaks on the pillars at cover distance"). A rib's side
    was ONE island 13 m tall, and uv.map_to_trim uses a trim row once across an island: the panel row (1.2 m of ceramic
    with a 7 mm fastener in each corner) was stretched eleven times in height, and its fasteners drew as pairs of dark
    0.6 m streaks beside every seam at eye height. Each course of the rib (ROWS: 0.3 to 1.2 m) now shows the row once,
    bottom to top: fasteners are dots again, and every course has its own joint line (the cladding reads as lifts)."""
    v0, v1 = manifest.trim_v(ic.SHEET["m_pellam"], region)
    me = ob.data; a = uv.get(ob); mw = ob.matrix_world; n = 0
    for p in me.polygons:
        zs = [(mw @ me.vertices[me.loops[li].vertex_index].co).z for li in p.loop_indices]
        lo, hi = min(zs), max(zs)
        if hi - lo < 1e-4: continue
        for li, z in zip(p.loop_indices, zs): a[li][1] = v0 + (z - lo) / (hi - lo) * (v1 - v0)
        n += 1
    uv.put(ob, a)
    return n


def _rib(rb, add):
    """A rib on bearing rb: plan 1.6 (tangential) x 3.0 (radial), r 7.5..10.5, corners rounded 0.15, full height, a 0.6 m
    fillet into the vault, kick plate, band, a cast plate on the face turned to the bore."""
    t_hat = Vector((math.cos(math.radians(rb)), math.sin(math.radians(rb))))          # (x, z) tangent
    r_hat = Vector((math.sin(math.radians(rb)), -math.cos(math.radians(rb))))
    def W(t, sr): v = Vector((AX[0], AX[2])) + r_hat * sr + t_hat * t; return (v.x, v.y)
    plan_local = ic.rounded_rect(-0.8, 7.5, 0.8, 10.5, 0.15, 3)        # (t, r)
    plan = [W(t, sr) for t, sr in plan_local]
    n = len(plan)
    f = []
    for j in range(len(ROWS) - 1):
        for i in range(n):
            a, b = plan[i], plan[(i + 1) % n]
            f.append([(a[0], ROWS[j], a[1]), (b[0], ROWS[j], b[1]), (b[0], ROWS[j + 1], b[1]), (a[0], ROWS[j + 1], a[1])])
    cx, cz = W(0, 9.0)
    o = ic.from_faces(f"rib_{int(rb)}", f, "m_pellam", RIB_T, "panel", away_from=(cx, -37, cz), lm=True, smooth=50, mpr=3.6, fit='metric')
    _course_rows(o)
    add(o)
    # fillet: quarter circle r 0.6 out onto the ceiling (corner points move along their corner's normal)
    prof = [(math.sin(math.radians(a)) * 0.6, CE - 0.6 + (1 - math.cos(math.radians(a))) * 0.6) for a in (0, 30, 60, 90)]
    def off(pl, k):
        t, sr = pl
        ct, cr = max(-0.65, min(0.65, t)), max(7.65, min(10.35, sr))
        v = Vector((t - ct, sr - cr))
        if v.length < 1e-6: v = Vector((0, 0))
        else: v.normalize()
        return W(t + v.x * prof[k][0], sr + v.y * prof[k][0])
    ff = []
    for i in range(n):
        a, b = plan_local[i], plan_local[(i + 1) % n]
        for k in range(3):
            A0, B0_, B1_, A1 = off(a, k), off(b, k), off(b, k + 1), off(a, k + 1)
            ff.append([(A0[0], prof[k][1], A0[1]), (B0_[0], prof[k][1], B0_[1]), (B1_[0], prof[k + 1][1], B1_[1]), (A1[0], prof[k + 1][1], A1[1])])
    add(ic.from_faces(f"rib_{int(rb)}_fillet", ff, "m_pellam", RIB_T, None, away_from=(cx, CE - 3, cz), lm=True, smooth=50))
    e = 0.012
    big = [W(t, sr) for t, sr in ic.rounded_rect(-0.8 - e, 7.5 - e, 0.8 + e, 10.5 + e, 0.15 + e, 3)]
    kick = [[(a[0], FL, a[1]), (b[0], FL, b[1]), (b[0], FL + 0.3, b[1]), (a[0], FL + 0.3, a[1])] for a, b in zip(big, big[1:] + big[:1])]
    band = [[(a[0], FL + 1.15, a[1]), (b[0], FL + 1.15, b[1]), (b[0], FL + 1.25, b[1]), (a[0], FL + 1.25, a[1])] for a, b in zip(big, big[1:] + big[:1])]
    add(ic.from_faces(f"rib_{int(rb)}_kick", kick, "m_pellam", "steel", "steel", away_from=(cx, FL, cz), lm=True, mpr=3.6))
    add(ic.from_faces(f"rib_{int(rb)}_band", band, "m_pellam", "livery", None, away_from=(cx, FL + 1.2, cz)))
    # fix pass 1: cladding joints. Three steel collars round every rib (25 mm proud, 0.12 m high) where the ceramic
    # courses meet: the pier reads as clad in lifts, and the collars stay dark when the bore's layer lights the lining.
    big2 = [W(t, sr) for t, sr in ic.rounded_rect(-0.8 - 0.025, 7.5 - 0.025, 0.8 + 0.025, 10.5 + 0.025, 0.175, 3)]
    col = []
    for yc in (FL + 3.0, FL + 6.6, FL + 10.2):
        for (a, b), (pa, pb) in zip(zip(big2, big2[1:] + big2[:1]), zip(plan, plan[1:] + plan[:1])):
            col.append([(a[0], yc - 0.06, a[1]), (b[0], yc - 0.06, b[1]), (b[0], yc + 0.06, b[1]), (a[0], yc + 0.06, a[1])])
            col.append([(a[0], yc + 0.06, a[1]), (b[0], yc + 0.06, b[1]), (pb[0], yc + 0.08, pb[1]), (pa[0], yc + 0.08, pa[1])])
            col.append([(pa[0], yc - 0.08, pa[1]), (pb[0], yc - 0.08, pb[1]), (b[0], yc - 0.06, b[1]), (a[0], yc - 0.06, a[1])])
    add(ic.from_faces(f"rib_{int(rb)}_collars", col, "m_pellam", "steel", "steel", away_from=(cx, FL + 6.6, cz), mpr=3.6, smooth=50))
    face = W(0, 7.5 - e)
    pl, pd = ic.maker_plate("4-300", (face[0], FL + 1.6, face[1]), 180.0, name=f"rib_plate_{int(rb)}")
    _aim_plate([pl] + ([pd] if pd else []), (face[0], FL + 1.6, face[1]), (-r_hat.x, -r_hat.y))
    add(pl)
    if pd is not None: pd["lm"] = False; add(pd)


def _aim_plate(objs, pos, facing_xz):
    """Turn plate objects (built facing game +z about pos) so that they face the game direction facing_xz."""
    yaw = math.atan2(facing_xz[0], facing_xz[1])                       # +z = 0, rotation toward +x positive
    c = B(pos)
    # the plates were built facing rotY (input) + 180 -> first undo, then face the wanted direction
    for o in objs:
        me = o.data
        # measure the current facing from the largest face
        p = max(me.polygons, key=lambda q: q.area); nz = Vector((p.normal.x, p.normal.y))
        cur = math.atan2(nz.x, -nz.y)                                  # Blender (x, y) -> game facing angle measured as above
        o.data.transform(Matrix.Translation(c) @ Matrix.Rotation(yaw - cur, 4, 'Z') @ Matrix.Translation(-c))


# ====================================================================================================== chamber parts on top
def delete_region(objs, pred):
    """Delete faces (world/Blender centre) for which pred(game x, y, z) holds, on every object."""
    for o in objs:
        mesh.delete_faces(o, lambda f, c, n: pred(c.x, c.z, -c.y))


def build_on_top(all_sector):
    out = []
    def add(o): out.append(o); return o
    # ---- the door bay (0 degrees): the 3 x 3 m opening through the door wall (z 80..81), its reveal and a steel frame
    delete_region(all_sector, lambda x, y, z: abs(x - 14.0) < 1.5 and y < FL + 3.0 and z < 81.6 and z > 80.0 and bearing(x, z) < 10 or (abs(x - 14.0) < 1.5 and y < FL + 3.0 and z < 81.6 and bearing(x, z) > 350))
    rv = [[(12.5, FL, 81), (12.5, FL, 80), (12.5, FL + 3, 80), (12.5, FL + 3, 81)], [(15.5, FL, 80), (15.5, FL, 81), (15.5, FL + 3, 81), (15.5, FL + 3, 80)],
          [(12.5, FL + 3, 81), (12.5, FL + 3, 80), (15.5, FL + 3, 80), (15.5, FL + 3, 81)], [(12.5, FL + 0.001, 80), (15.5, FL + 0.001, 80), (15.5, FL + 0.001, 81), (12.5, FL + 0.001, 81)]]
    add(ic.from_faces("door_reveal", rv, "m_pellam", "steel", "steel", toward=(14, FL + 1.5, 80.5), lm=True, mpr=3.6))
    fr = [((12.3, FL, 81.0), (12.5, FL + 3.2, 81.06)), ((15.5, FL, 81.0), (15.7, FL + 3.2, 81.06)), ((12.3, FL + 3.0, 81.0), (15.7, FL + 3.2, 81.06))]
    for k, (lo, hi) in enumerate(fr):
        add(ic.box(f"door_frame_{k}", lo, hi, "m_pellam", "steel", "steel", bevel=0.02, drop="z-" + (" y-" if k < 2 else ""), tess=0.8, mpr=3.6))
    for j, (za, zb) in enumerate(((12.31, 12.49), (15.51, 15.69))):
        add(ic.from_faces(f"door_hazard_{j}", [[(x, y, 81.064) for x, y in ic.diagonal_band(za, FL + 0.35, zb, FL + 1.55, 0.3, up=(j == 0))]], "m_pellam", "hazard", None, away_from=(14, FL + 1, 79)))
    # ---- the proving-lift gate (180 degrees): 3 x 3 m through a 1 m wall to the lift room (x 12..16, z 112..116, 3.5 m)
    delete_region(all_sector, lambda x, y, z: abs(x - 14.0) < 1.5 and y < FL + 3.0 and z > 110.4 and 170 < bearing(x, z) < 190)
    rv = [[(12.5, FL, 111), (12.5, FL, 112), (12.5, FL + 3, 112), (12.5, FL + 3, 111)], [(15.5, FL, 112), (15.5, FL, 111), (15.5, FL + 3, 111), (15.5, FL + 3, 112)],
          [(12.5, FL + 3, 112), (12.5, FL + 3, 111), (15.5, FL + 3, 111), (15.5, FL + 3, 112)]]
    add(ic.from_faces("gate_reveal", rv, "m_pellam", "steel", "steel", toward=(14, FL + 1.5, 111.5), lm=True, mpr=3.6))
    wb = FL + 1.25                                                      # polish round 3: the three walls start at the band's top (the dado is the wall below it)
    lr = [[(12, wb, 112), (12, wb, 116), (12, FL + 3.5, 116), (12, FL + 3.5, 112)], [(16, wb, 116), (16, wb, 112), (16, FL + 3.5, 112), (16, FL + 3.5, 116)],
          [(12, wb, 116), (16, wb, 116), (16, FL + 3.5, 116), (12, FL + 3.5, 116)], [(12, FL + 3.5, 112), (12, FL + 3.5, 116), (16, FL + 3.5, 116), (16, FL + 3.5, 112)],
          [(12.5, FL + 3, 112), (15.5, FL + 3, 112), (15.5, FL + 3.5, 112), (12.5, FL + 3.5, 112)], [(12, FL, 112), (12.5, FL, 112), (12.5, FL + 3.5, 112), (12, FL + 3.5, 112)],
          [(15.5, FL, 112), (16, FL, 112), (16, FL + 3.5, 112), (15.5, FL + 3.5, 112)]]
    # polish round 3 (visual critic, major: "the lift ride frames are a flat dark field with a single prompt": the frame
    # at the lever was this room's back wall, steel x 0.8 under one bar that shines away from it). The room is lined in
    # pale enamel over a darker dado with the livery band, and a second bar on the inside of the lintel washes the
    # lever's wall.
    add(ic.from_faces("lift_room", lr, "m_pellam", LIFT_T, "steel", toward=(14, FL + 1.7, 114), tess=0.7, mpr=3.6))
    dado = [[(12, FL, 116), (12, FL, 112), (12, FL + 1.15, 112), (12, FL + 1.15, 116)], [(16, FL, 112), (16, FL, 116), (16, FL + 1.15, 116), (16, FL + 1.15, 112)],
            [(16, FL, 116), (12, FL, 116), (12, FL + 1.15, 116), (16, FL + 1.15, 116)]]
    add(ic.from_faces("lift_dado", dado, "m_pellam", LIFT_LOW, "steel", toward=(14, FL + 0.6, 114), tess=0.7, mpr=3.6))
    bandq = [[(12.004, FL + 1.15, 116), (12.004, FL + 1.15, 112), (12.004, FL + 1.25, 112), (12.004, FL + 1.25, 116)], [(15.996, FL + 1.15, 112), (15.996, FL + 1.15, 116), (15.996, FL + 1.25, 116), (15.996, FL + 1.25, 112)],
             [(16, FL + 1.15, 115.996), (12, FL + 1.15, 115.996), (12, FL + 1.25, 115.996), (16, FL + 1.25, 115.996)]]
    add(ic.from_faces("lift_band", bandq, "m_pellam", "livery", None, toward=(14, FL + 1.2, 114), tess=0.7))
    add(ic.box("lift_wash_bezel", (13.3, FL + 3.12, 112.0), (14.7, FL + 3.38, 112.08), "m_pellam", "steel_dark", None, bevel=0.01, drop="z-"))
    emi.append(ic.emis("lift_wash", [[(14.6, FL + 3.18, 112.085), (13.4, FL + 3.18, 112.085), (13.4, FL + 3.32, 112.085), (14.6, FL + 3.32, 112.085)]], "aqua_core"))
    if emi[-1].data.polygons[0].normal.dot(ic.Bd((0, 0, 1))) < 0: emi[-1].data.flip_normals()
    add(ic.box("gate_lamp_bezel", (13.4, FL + 3.15, 115.9), (14.6, FL + 3.35, 116.0), "m_pellam", "steel_dark", None, bevel=0.01, drop="z+"))
    emi.append(ic.emis("gate_lamp", [[(13.5, FL + 3.2, 115.89), (14.5, FL + 3.2, 115.89), (14.5, FL + 3.3, 115.89), (13.5, FL + 3.3, 115.89)]], "aqua"))
    add(ic.surface("lift_floor", (0, FL, 0), (1, 0, 0), (0, 0, -1), [12, 14, 16], [-116, -114, -111], "m_pellam", "floor", "steel", row=1.2, vbase=-116, lm=True))
    for k, (lo, hi) in enumerate((((12.3, FL, 110.94), (12.5, FL + 3.2, 111.0)), ((15.5, FL, 110.94), (15.7, FL + 3.2, 111.0)), ((12.3, FL + 3.0, 110.94), (15.7, FL + 3.2, 111.0)))):
        add(ic.box(f"gate_frame_{k}", lo, hi, "m_pellam", "steel", "steel", bevel=0.02, drop="z+" + (" y-" if k < 2 else ""), tess=0.8, mpr=3.6))
    # ---- catwalk openings in the wall: facets 30 and 45 (y -36.3..-33.4), 315 and 330 (y -36.3..-32): dark backs behind
    def slot(fb, y0, y1):
        delete_region(all_sector, lambda x, y, z: y0 < y < y1 and math.hypot(x - AX[0], z - AX[2]) > 14.5 and abs(((bearing(x, z) - fb + 180) % 360) - 180) < 7.0)
        a, b = facet_points(fb); a2, b2 = facet_points(fb, R_WALL + 0.9)
        f = [[(a[0], y0, a[2]), (b[0], y0, b[2]), (b2[0], y0, b2[2]), (a2[0], y0, a2[2])], [(a2[0], y1, a2[2]), (b2[0], y1, b2[2]), (b[0], y1, b[2]), (a[0], y1, a[2])]]
        # polish round 3: the dark back stood ACROSS the tube (it is tangent 0.9 m outside the wall, the tube is a chord):
        # walking east she saw the catwalk end in a black panel and walked through it. The back stops at the tube now.
        def pt(t, y): return (a2[0] + (b2[0] - a2[0]) * t, y, a2[2] + (b2[2] - a2[2]) * t)
        ta, tb = sorted(min(1.0, max(0.0, (zc - a2[2]) / (b2[2] - a2[2]))) for zc in (81.9, 84.1))
        yt = min(y1, -33.3)
        for s0, s1 in ((0.0, ta), (tb, 1.0)):
            if s1 - s0 > 0.02: f.append([pt(s0, y0), pt(s1, y0), pt(s1, yt), pt(s0, yt)])
        if y1 > yt + 0.01: f.append([pt(0.0, yt), pt(1.0, yt), pt(1.0, y1), pt(0.0, y1)])
        add(ic.from_faces(f"slot_{fb}", f, "m_pellam", tuple(lin("steel_dark") * 0.55), None, toward=P(R_WALL + 0.3, fb, (y0 + y1) / 2), tess=1.0))
    slot(30.0, -36.3, -33.4); slot(45.0, -36.3, -33.4); slot(315.0, -36.3, -32.0); slot(330.0, -36.3, -32.0)
    # ---- seats for the cartridge points (90, 270) and the line locker (168); frames for the kerb-foot grates (90, 210, 330)
    for o in all_sector:                                                # the access panel of facet 165 gives way to the locker's seat
        if o.name.startswith("access_") and len(o.data.vertices):
            c = sum((o.matrix_world @ v.co for v in o.data.vertices), Vector()) / len(o.data.vertices); g = layout.to_game(c)
            if 160.0 < bearing(g[0], g[2]) < 170.0: mesh.delete_faces(o, lambda f, cc, n: True)
    for mid, depth, w, h in (("ia_ammo_box_bore_e", 0.25, 0.8, 1.2), ("ia_ammo_box_bore_w", 0.25, 0.8, 1.2), ("ia_line_locker_bore", 0.32, 0.8, 1.5)):
        p = layout.marker(mid)["pos"]; b = bearing(p[0], p[2]); rr = math.hypot(p[0] - AX[0], p[2] - AX[2])
        c = Vector(P(rr + depth / 2 + 0.02, b, FL)); t = Vector((math.cos(math.radians(b)), 0, math.sin(math.radians(b)))); rh = Vector((math.sin(math.radians(b)), 0, -math.cos(math.radians(b))))
        def Q(dt, dr, y): v = c + t * dt + rh * dr; return (v.x, y, v.z)
        f = [[Q(-w / 2, -depth / 2, FL), Q(w / 2, -depth / 2, FL), Q(w / 2, -depth / 2, FL + h), Q(-w / 2, -depth / 2, FL + h)],
             [Q(-w / 2, -depth / 2, FL + h), Q(w / 2, -depth / 2, FL + h), Q(w / 2, depth / 2, FL + h), Q(-w / 2, depth / 2, FL + h)],
             [Q(-w / 2, depth / 2, FL), Q(-w / 2, -depth / 2, FL), Q(-w / 2, -depth / 2, FL + h), Q(-w / 2, depth / 2, FL + h)],
             [Q(w / 2, -depth / 2, FL), Q(w / 2, depth / 2, FL), Q(w / 2, depth / 2, FL + h), Q(w / 2, -depth / 2, FL + h)]]
        add(ic.from_faces(f"seat_{mid}", f, "m_pellam", WALL_LOW, None, bevel=0.02, away_from=tuple(c + rh * 1.0 + Vector((0, -0.5, 0))), tess=0.6))
        for o in ic.seat(f"seatface_{mid}", P(rr + 0.02 - 0.001, b, FL + h / 2 + 0.03), b + 180.0, w - 0.12, h - 0.14): add(o)
    for k in (1, 2, 3):
        p = layout.marker(f"sp_bore_grate_{k}")["pos"]; b = bearing(p[0], p[2])
        t = Vector((math.cos(math.radians(b)), 0, math.sin(math.radians(b)))); rh = Vector((math.sin(math.radians(b)), 0, -math.cos(math.radians(b))))
        c = Vector(p)
        def Q(dt, dr, y): v = c + t * dt + rh * dr; return (v.x, y, v.z)
        ring = []
        for (o0, o1) in (((-0.6, -0.6), (0.6, -0.6)), ((0.6, -0.6), (0.6, 0.6)), ((0.6, 0.6), (-0.6, 0.6)), ((-0.6, 0.6), (-0.6, -0.6))):
            s0 = 1.2 / 0.6 * 0.1
            ring.append([Q(o0[0], o0[1], FL + 0.008), Q(o1[0], o1[1], FL + 0.008), Q(o1[0] * 1.17, o1[1] * 1.17, FL + 0.008), Q(o0[0] * 1.17, o0[1] * 1.17, FL + 0.008)])
        add(ic.from_faces(f"grate_frame_{k}", ring, "m_pellam", "steel_dark", None, away_from=(p[0], FL - 2, p[2]), tess=0.8))
        add(ic.from_faces(f"grate_well_{k}", [[Q(-0.6, -0.6, FL + 0.005), Q(0.6, -0.6, FL + 0.005), Q(0.6, 0.6, FL + 0.005), Q(-0.6, 0.6, FL + 0.005)]], "m_pellam", tuple(lin("steel_dark") * 0.35), None, away_from=(p[0], FL - 2, p[2])))
    return out


# ====================================================================================================== catwalk, arrival bay, stair, antechamber
def build_catwalk():
    out, cards = [], []
    def add(o): out.append(o); return o
    x0, x1, z0, z1, deck, top = 5.4, 22.6, 82.0, 84.0, -36.0, -33.4
    # deck: a steel frame of two box girders (their undersides catch the bore's light) with grille decking
    for k, (za, zb) in enumerate(((z0, z0 + 0.25), (z1 - 0.25, z1))):
        add(ic.box(f"girder_{k}", (x0, deck - 0.45, za), (x1, deck - 0.012, zb), "m_pellam", "steel", "steel", bevel=0.0, drop="x- x+", lm=True, mpr=3.6))
    # hoops every 1.2 m: posts and a head beam; the tube is closed with grille cards on both faces
    xs = frange(x0, x1, 1.2)
    for k, x in enumerate(xs):
        for z in (z0 + 0.03, z1 - 0.03):
            foot = deck + 1.75 if (z > 83.0 and k in (7, 8)) else deck   # the viewing bay: no posts below its head rail
            add(ic.box(f"hoop_post_{k}_{int(z)}", (x - 0.04, foot, z - 0.03), (x + 0.04, top, z + 0.03), "m_pellam", "steel", None, bevel=0.0, tess=0.9))    # fix pass 1: a loop along each post and head: both ends are buried (bake-dark warnings triaged)
        add(ic.box(f"hoop_head_{k}", (x - 0.04, top - 0.08, z0), (x + 0.04, top, z1), "m_pellam", "steel", None, bevel=0.0, tess=0.7))
        if k < len(xs) - 1:
            add(ic.box(f"deck_cross_{k}", (x - 0.03, deck - 0.12, z0 + 0.25), (x + 0.03, deck - 0.01, z1 - 0.25), "m_pellam", "steel", None, bevel=0.0, drop="x- x+"))
    add(ic.box("top_rail_n", (x0, top - 0.06, z0), (x1, top, z0 + 0.06), "m_pellam", "steel", "steel", bevel=0.0, tess=1.2, mpr=3.6))
    add(ic.box("top_rail_s", (x0, top - 0.06, z1 - 0.06), (x1, top, z1), "m_pellam", "steel", "steel", bevel=0.0, tess=1.2, mpr=3.6))
    add(ic.box("hand_rail_n", (x0, deck + 1.0, z0 + 0.04), (x1, deck + 1.06, z0 + 0.1), "m_pellam", "steel", "steel", bevel=0.0, tess=1.2, mpr=3.6))
    add(ic.box("hand_rail_s", (x0, deck + 1.0, z1 - 0.1), (x1, deck + 1.06, z1 - 0.04), "m_pellam", "steel", "steel", bevel=0.0, tess=1.2, mpr=3.6))
    T = 0.48
    def tiles(a0, a1, b0, b1):
        out_ = []
        na = max(1, int(round((a1 - a0) / T))); nb = max(1, int(round((b1 - b0) / T)))
        for i in range(na):
            for j in range(nb):
                out_.append((a0 + (a1 - a0) * i / na, a0 + (a1 - a0) * (i + 1) / na, b0 + (b1 - b0) * j / nb, b0 + (b1 - b0) * (j + 1) / nb))
        return out_
    for (a0, a1, b0, b1) in tiles(x0, x1, z0 + 0.25, z1 - 0.25):          # decking (seen from above and below)
        q = [(a0, deck - 0.01, b1), (a1, deck - 0.01, b1), (a1, deck - 0.01, b0), (a0, deck - 0.01, b0)]
        cards.append((q, "grille", None, DECK_T))                        # polish round 2: ONE card per tile. m_mask is drawn double-sided
        #   (src/render/materials.ts), so the second, reversed card of each tile lay coplanar with the first and the two
        #   z-fought in rows wherever their vertex light differed (visual critic: "the grate ... shows the same row banding")
    # fix pass 1 (critic round 1, major): the order asks for "a clear view from its centre down to the drum" and the
    # tube was grille from end to end: at vista_windlass 62 % of the frame was bar. Three bays of the SOUTH side at the
    # centre (between the hoops at x 12.28 and 15.72) are a viewing bay now: no grille below 1.75 m, a kick plate, a
    # the hand rail alone (the layout's blocker still stands there: request filed with level-design), grille above.
    va, vb, vy = xs[6], xs[9], deck + 1.75
    def side(z, a_lo, a_hi, y_lo, y_hi):
        for (a0, a1, b0, b1) in tiles(a_lo, a_hi, y_lo, y_hi):
            q = [(a0, b0, z), (a1, b0, z), (a1, b1, z), (a0, b1, z)]
            cards.append((q, "grille", None, "steel"))
    side(z0 + 0.01, x0, x1, deck + 0.05, top - 0.08)                    # north side: whole
    # polish round 3 (visual critic, major: "bore arrival ... near-black, empty": at the hatch 99 % of the frame under
    # L* 35, the tube a violet-black lattice from end to end, the Windlass seen only from the three bays at the centre).
    # The SOUTH side is open at eye level along the whole run now (grille below the hand rail and above a head rail at
    # 1.75 m: the Windlass is in view below from the first step out of the hatchway; the layout's blocker still spans it),
    # the NORTH side is backed by pale enamel panels that the tube's own work lamps wash (the mesh reads as a dark
    # lattice on a lit wall), and a 1 m aqua-white work lamp hangs under the roof in every second hoop bay.
    side(z1 - 0.01, x0, va, deck + 0.05, deck + 1.0); side(z1 - 0.01, vb, x1, deck + 0.05, deck + 1.0)
    side(z1 - 0.01, x0, x1, vy + 0.04, top - 0.08)                      # the transom over the open band
    add(ic.box("view_head", (x0, vy - 0.04, z1 - 0.07), (x1, vy + 0.04, z1), "m_pellam", "steel", "steel", bevel=0.0, tess=1.2, mpr=3.6))
    add(ic.surface("cat_back", (0, 0, z0 - 0.05), (1, 0, 0), (0, 1, 0), [8.6] + [x for x in xs if x > 8.7], [deck - 0.012, deck + 1.2, top], "m_pellam", "panel", CAT_PANEL,
                   row=1.2, vbase=deck - 0.012, mpr=3.6, lm=True,
                   cell=lambda i, j, uc, vc: {"tint": CAT_PANEL_LOW} if vc < deck + 1.2 else None))
    add(ic.from_faces("cat_back_band", [[(8.6, deck + 1.15, z0 - 0.044), (x1, deck + 1.15, z0 - 0.044), (x1, deck + 1.25, z0 - 0.044), (8.6, deck + 1.25, z0 - 0.044)]],
                      "m_pellam", "livery", None, toward=(14, deck + 1.2, 83), tess=1.2))
    for k in range(1, len(xs) - 1, 2):
        xc = (xs[k] + xs[k + 1]) / 2
        # (on the SOUTH head, thrown north and down at the back panels: the south mesh stays a dark lattice over the room)
        add(ic.box(f"cat_lamp_bezel_{k}", (xc - 0.56, top - 0.16, z1 - 0.3), (xc + 0.56, top - 0.08, z1 - 0.08), "m_pellam", "steel_dark", None, bevel=0.0, drop="y+"))
        emi.append(ic.emis(f"cat_lamp_{k}", [[(xc - 0.5, top - 0.165, z1 - 0.26), (xc + 0.5, top - 0.165, z1 - 0.26), (xc + 0.5, top - 0.165, z1 - 0.12), (xc - 0.5, top - 0.165, z1 - 0.12)]], "aqua_core"))
        if emi[-1].data.polygons[0].normal.dot(ic.Bd((0, -1, 0))) < 0: emi[-1].data.flip_normals()
        CAT_LAMPS.append((xc, top - 0.2, z1 - 0.19))
    xc = 24.6                                                           # and one over the east landing (its north wall faces the tube)
    add(ic.box("cat_lamp_bezel_land", (xc - 0.56, top - 0.09, z1 - 0.3), (xc + 0.56, top - 0.01, z1 - 0.08), "m_pellam", "steel_dark", None, bevel=0.0, drop="y+"))
    emi.append(ic.emis("cat_lamp_land", [[(xc - 0.5, top - 0.095, z1 - 0.26), (xc + 0.5, top - 0.095, z1 - 0.26), (xc + 0.5, top - 0.095, z1 - 0.12), (xc - 0.5, top - 0.095, z1 - 0.12)]], "aqua_core"))
    if emi[-1].data.polygons[0].normal.dot(ic.Bd((0, -1, 0))) < 0: emi[-1].data.flip_normals()
    CAT_LAMPS.append((xc, top - 0.13, z1 - 0.19))
    add(ic.box("view_kick", (va, deck - 0.01, z1 - 0.03), (vb, deck + 0.14, z1 - 0.01), "m_pellam", "steel_dark", None, bevel=0.0, tess=1.2))
    for k, x in enumerate((va, vb)):                                    # the bay's jambs: a heavier post each side, a hazard diagonal on it
        add(ic.box(f"view_jamb_{k}", (x - 0.07, deck, z1 - 0.1), (x + 0.07, vy + 0.04, z1 + 0.02), "m_pellam", "steel", None, bevel=0.012, tess=0.7))
    for (a0, a1, b0, b1) in tiles(x0, x1, z0 + 0.06, z1 - 0.06):          # the roof of the tube
        q = [(a0, top - 0.02, b0), (a1, top - 0.02, b0), (a1, top - 0.02, b1), (a0, top - 0.02, b1)]
        cards.append((q, "grille", None, "steel"))
    dec.append(ic.decals("catwalk_grille", cards, "steel"))
    # the arrival bulkhead (x 5..5.4) with its 2 x 2.6 m hatchway, the pass to the chamber, and the cage well behind it
    bk = ic.surface("bulkhead", (5.4, 0, 0), (0, 0, -1), (0, 1, 0), [-86.0, -84.0, -82.0, -80.0], [-36.3, deck, top, -32.0], "m_pellam", "steel", "steel", row=0.6, vbase=-36.3,
                    skip=lambda uc, vc: -84 < uc < -82 and deck < vc < top, lm=True)
    add(bk)
    add(ic.from_faces("hatch_reveal", [[(5.0, deck, 82), (5.4, deck, 82), (5.4, top, 82), (5.0, top, 82)], [(5.4, deck, 84), (5.0, deck, 84), (5.0, top, 84), (5.4, top, 84)],
                                       [(5.0, top, 82), (5.4, top, 82), (5.4, top, 84), (5.0, top, 84)]], "m_pellam", "steel_dark", None, toward=(5.2, deck + 1.3, 83)))
    add(ic.from_faces("pass", [[(5.4, deck, 82), (8.6, deck, 82), (8.6, -33.3, 82), (5.4, -33.3, 82)], [(5.4, -33.3, 82), (9.0, -33.3, 82), (9.0, -33.3, 86), (5.4, -33.3, 86)],
                               [(8.6, deck - 0.5, 86), (5.4, deck - 0.5, 86), (5.4, -33.3, 86), (8.6, -33.3, 86)]], "m_pellam", CAT_PANEL_LOW, "steel", toward=(7.0, deck + 1.2, 84), tess=1.0, mpr=3.6))
    # polish round 2 (visual critic, major: "stair-stepped, row-banded baked shadow on the bore catwalk arrival"). It was
    # not a shadow. `ia_lift_cage` stands in this bay (lift_arrival_bore: 6.3 m square, floor slab 0..-0.1, roof slab
    # 3.5..3.68) and the bay's floor (y -36) and ceiling (y -32.5) were coplanar with the cage's floor top and roof
    # underside: the dark dynamic-lit cage floor z-fought the lit lightmapped bay floor in combed rows. The bay's floor
    # now lies 0.11 m under the cage's (vertex-lit: it is never seen while the cage stands there) and its ceiling 0.2 m
    # over the cage's roof; a threshold plate bridges the 0.25 m between the cage's slab and the catwalk deck.
    # closer, polish round 2: the floor is 0.04 m under, not 0.11 (n_bo_arrival stands here and tests/pipeline/greybox holds
    # a zone floor within 0.05 m of every nav node); inside the cage's 0.1 m slab, still never coplanar with its top
    BAY_TOP, BAY_FL = -32.3, -36.04
    # polish round 3 (resumed): the bay's three closed walls stand 0.035 m outside the cage's 6 m interior. `ia_lift_cage`
    # carries its lattice and a kick plate on local +-3.000..3.030: flush walls hid the lattice here (the cage read as a
    # plain room at this end of the ride and as a cage at the other) and z-fought the kick plate in the hall's well.
    KW, KN, KS = -1.035, 79.965, 86.035
    cw = [[(KW, -36.3, KN), (5.0, -36.3, KN), (5.0, BAY_TOP, KN), (KW, BAY_TOP, KN)], [(5.0, -36.3, KS), (KW, -36.3, KS), (KW, BAY_TOP, KS), (5.0, BAY_TOP, KS)],
          [(KW, -36.3, KS), (KW, -36.3, KN), (KW, BAY_TOP, KN), (KW, BAY_TOP, KS)], [(KW, BAY_TOP, KN), (5.0, BAY_TOP, KN), (5.0, BAY_TOP, KS), (KW, BAY_TOP, KS)]]
    # fix pass 1 (critic round 1, major): the bay the player steps out of the cage into baked black (dark steel x the
    # ambient alone) and had no east wall at all on its own side. It is lined in brushed steel and lightmapped, the
    # bulkhead has a face toward the bay, and an aqua lamp bar over the hatchway lights the floor (bake target 0.45).
    # polish round 3: the bay's lining is pale (it was steel x concrete, 0.08 linear: a lamp at 0.7 drew it L* 30) and
    # the bulkhead, the wall she faces through the cage's gate, is washed by a vertical aqua-white strip in each east
    # corner (the lamp bar over the hatchway shines away from it): the gate's lattice stands dark on a lit wall.
    cw += [[(5.0, -36.3, KN), (5.0, -36.3, 80.0), (5.0, BAY_TOP, 80.0), (5.0, BAY_TOP, KN)], [(5.0, -36.3, 86.0), (5.0, -36.3, KS), (5.0, BAY_TOP, KS), (5.0, BAY_TOP, 86.0)]]   # the two 35 mm returns to the bulkhead
    add(ic.from_faces("arrival_well", cw, "m_pellam", BAY_T, "steel", toward=(2, -34.3, 83), lm=True, mpr=3.6))
    add(ic.surface("bulkhead_bay", (5.0, 0, 0), (0, 0, 1), (0, 1, 0), [80.0, 82.0, 84.0, 86.0], [-36.3, deck, top, BAY_TOP], "m_pellam", "steel", BULK_T, row=0.6, vbase=-36.3,
                       skip=lambda uc, vc: 82 < uc < 84 and deck < vc < top, lm=True))
    bq = [[(KW + 0.006, deck + 1.15, KS), (KW + 0.006, deck + 1.15, KN), (KW + 0.006, deck + 1.25, KN), (KW + 0.006, deck + 1.25, KS)],
          [(KW, deck + 1.15, KN + 0.006), (5.0, deck + 1.15, KN + 0.006), (5.0, deck + 1.25, KN + 0.006), (KW, deck + 1.25, KN + 0.006)], [(5.0, deck + 1.15, KS - 0.006), (KW, deck + 1.15, KS - 0.006), (KW, deck + 1.25, KS - 0.006), (5.0, deck + 1.25, KS - 0.006)],
          [(4.994, deck + 1.15, 80), (4.994, deck + 1.15, 81.8), (4.994, deck + 1.25, 81.8), (4.994, deck + 1.25, 80)], [(4.994, deck + 1.15, 84.2), (4.994, deck + 1.15, 86), (4.994, deck + 1.25, 86), (4.994, deck + 1.25, 84.2)]]
    add(ic.from_faces("bay_band", bq, "m_pellam", "livery", None, toward=(2, deck + 1.2, 83), tess=1.0))
    for k, (zw, sg) in enumerate(((80.0, 1.0), (86.0, -1.0))):
        add(ic.box(f"bay_wash_bezel_{k}", (4.3, -35.5, min(zw, zw + sg * 0.06)), (4.56, -33.1, max(zw, zw + sg * 0.06)), "m_pellam", "steel_dark", None, bevel=0.0, drop="z-" if sg > 0 else "z+"))
        q = [(4.36, -35.4, zw + sg * 0.065), (4.5, -35.4, zw + sg * 0.065), (4.5, -33.2, zw + sg * 0.065), (4.36, -33.2, zw + sg * 0.065)]
        emi.append(ic.emis(f"bay_wash_{k}", [q], "aqua_core"))
        if emi[-1].data.polygons[0].normal.dot(ic.Bd((0, 0, sg))) < 0: emi[-1].data.flip_normals()
        BAY_WASH.append(((4.43, -34.3, zw + sg * 0.1), sg))
    add(ic.box("bay_lamp_bezel", (4.9, -33.24, 82.3), (5.0, -32.96, 83.7), "m_pellam", "steel_dark", None, bevel=0.02, drop="x+"))
    emi.append(ic.emis("bay_arrival_lamp", [[(4.895, -33.17, 82.4), (4.895, -33.17, 83.6), (4.895, -33.03, 83.6), (4.895, -33.03, 82.4)]], "aqua"))
    if emi[-1].data.polygons[0].normal.dot(ic.Bd((-1, 0, 0))) < 0: emi[-1].data.flip_normals()
    for k, (za, zb) in enumerate(((81.8, 82.0), (84.0, 84.2))):          # hazard diagonals on the hatchway's jambs, bay side
        add(ic.from_faces(f"bay_hazard_{k}", [[(4.994, y, z) for z, y in ic.diagonal_band(za, deck + 0.3, zb, deck + 1.5, 0.3, up=(k == 0))]], "m_pellam", "hazard", None, away_from=(6, -35, 83)))
    add(ic.surface("arrival_floor", (0, BAY_FL, 0), (1, 0, 0), (0, 0, -1), cuts(-1.0, 5.0, 1.5), cuts(-86.0, -80.0, 1.5), "m_pellam", "floor", "steel", row=1.2, vbase=-86.0, lm=False))
    add(ic.from_faces("hatch_threshold", [[(5.16, deck, 82), (5.4, deck, 82), (5.4, deck, 84), (5.16, deck, 84)], [(5.16, deck - 0.3, 82), (5.16, deck, 82), (5.16, deck, 84), (5.16, deck - 0.3, 84)]],
                      "m_pellam", "steel", None, away_from=(5.6, deck - 2.0, 83)))
    return out


def stair_flight(name, top_pt, d, w, y_top, N=12):
    """Cast steps over a 33.7 degree ramp: risers on the nosing line (see env_the_gallery)."""
    rise = 4.0 / N; run = 6.0 / N; nb = 0.02
    o = Vector(top_pt); d = Vector(d); w = Vector(w)
    def Pp(dist, y, side): q = o + d * dist + w * (2.0 * side); return (q.x, y, q.z)
    f = []
    for i in range(N):
        d0 = run * i; yt = y_top - rise * i; yb = yt - rise
        f.append([Pp(d0 - nb, yt, 0), Pp(d0, yt - nb, 0), Pp(d0, yt - nb, 1), Pp(d0 - nb, yt, 1)])
        f.append([Pp(d0, yt - nb, 0), Pp(d0, yb, 0), Pp(d0, yb, 1), Pp(d0, yt - nb, 1)])
        d1 = d0 + run - (nb if i < N - 1 else 0.0)
        f.append([Pp(d0, yb, 0), Pp(d1, yb, 0), Pp(d1, yb, 1), Pp(d0, yb, 1)])
    ref = o + w - d * 3.0
    return ic.from_faces(name, f, "m_pellam", "concrete", "concrete", lm=True, away_from=(ref.x, y_top - 12.0, ref.z), mpr=7.2)


def build_stair():
    out = []
    def add(o): out.append(o); return o
    # catwalk landing (x 22.6..28, z 82..84, y -36), flight 1 north (x 26..28, z 82 -> 76), landing (z 74..76, y -40), flight 2 west (x 26 -> 20)
    add(ic.surface("landing_e", (0, -36.0, 0), (1, 0, 0), (0, 0, -1), [22.6, 25.0, 28.0], [-84.0, -82.0], "m_pellam", "floor", "steel", row=1.2, vbase=-84.0, lm=True))
    add(stair_flight("flight_1", (26.0, 0, 82.0), (0, 0, -1), (1, 0, 0), -36.0))
    add(ic.surface("landing_s", (0, -40.0, 0), (1, 0, 0), (0, 0, -1), [26.0, 28.0], [-76.0, -74.0], "m_pellam", "concrete", "concrete", lm=True))
    add(stair_flight("flight_2", (26.0, 0, 76.0), (-1, 0, 0), (0, 0, -1), -40.0))
    def h(fl, t):
        if fl == 1: return -36.0 - (82.0 - t) * 4 / 6
        return -40.0 - (26.0 - t) * 4 / 6
    def wall(name, o, u, us, hfun, y1=-33.4, skip=None):
        vs = [-44.0 + 0.8 * i for i in range(int((y1 + 44.0) / 0.8 - 1e-6) + 1)] + [y1]
        sk = skip or (lambda uc, vc: False)
        a = ic.surface(name + "_lm", o, u, (0, 1, 0), us, vs, "m_pellam", "concrete", "concrete", vbase=-44.0, lm=True,
                       skip=lambda uc, vc: vc < hfun(uc) - 0.9 or vc > hfun(uc) + 3.2 or sk(uc, vc))
        b = ic.surface(name + "_vl", o, u, (0, 1, 0), us, vs, "m_pellam", "concrete", "concrete", vbase=-44.0, lm=False,
                       skip=lambda uc, vc: vc < hfun(uc) - 0.9 or vc <= hfun(uc) + 3.2 or sk(uc, vc))
        for q in (a, b):
            if len(q.data.polygons): add(q)
            else: bpy.data.objects.remove(q, do_unlink=True)
    # flight 1: east wall x 28 (looks -x, u = +z), west wall x 26 (looks +x, u = -z) from z 76 to 82
    wall("st1_e", (28.0, 0, 0), (0, 0, 1), cuts(73.0, 84.0, 1.2, [74.0, 76.0, 80.3, 82.0]), lambda z: -40.0 if z < 76 else (h(1, z) if z < 82 else -36.0))
    wall("st1_w", (26.0, 0, 0), (0, 0, -1), cuts(-82.0, -76.0, 1.2), lambda u: h(1, -u))
    # flight 2: north wall z 74 (looks +z, u = +x), south wall z 76 (looks -z, u = -x) up to -37 (above it the flight-1 well)
    wall("st2_n", (0, 0, 74.0), (1, 0, 0), cuts(19.0, 28.0, 1.2, [20.0, 26.0]), lambda x: -44.0 if x < 20 else (h(2, x) if x < 26 else -40.0))
    wall("st2_s", (0, 0, 76.0), (-1, 0, 0), cuts(-26.0, -20.0, 1.2), lambda u: h(2, -u), y1=-37.0)
    # catwalk landing walls: north (z 82, x 22.6..26), south (z 84, x 22.6..28), and the well's ceiling at -33.4
    add(ic.surface("land_n", (0, 0, 82.0), (1, 0, 0), (0, 1, 0), [22.6, 24.3, 26.0], [-36.0, -34.8, -33.4], "m_pellam", "concrete", "concrete", vbase=-36.0, lm=True))
    add(ic.surface("land_s", (0, 0, 84.0), (-1, 0, 0), (0, 1, 0), [-28.0, -25.3, -22.6], [-36.0, -34.8, -33.4], "m_pellam", "concrete", "concrete", vbase=-36.0, lm=True))
    add(ic.surface("st_ceiling", (0, -33.4, 0), (1, 0, 0), (0, 0, 1), cuts(20.0, 28.0, 2.0), cuts(74.0, 84.0, 2.5, [80.3]), "m_pellam", "concrete", "concrete", row=2.4, vbase=74.0, lm=False))
    # one aqua wall lamp over the landing (part of the chunk, steady)
    lp = (27.96, -37.4, 75.0)
    add(ic.box("st_lamp_bezel", (27.84, -37.55, 74.4), (28.0, -37.25, 75.6), "m_pellam", "steel_dark", None, bevel=0.02, drop="x+"))
    emi.append(ic.emis("st_lamp", [[(27.83, -37.48, 74.48), (27.83, -37.48, 75.52), (27.83, -37.32, 75.52), (27.83, -37.32, 74.48)][::-1]], "aqua"))
    add(ic.box("st_lamp2_bezel", (27.84, -34.45, 82.4), (28.0, -34.15, 83.6), "m_pellam", "steel_dark", None, bevel=0.02, drop="x+"))
    emi.append(ic.emis("st_lamp2", [[(27.83, -34.38, 82.48), (27.83, -34.38, 83.52), (27.83, -34.22, 83.52), (27.83, -34.22, 82.48)][::-1]], "aqua"))
    return out


def build_ante():
    """The antechamber x 9..19, z 66..80, floor -44, 5 m: dusty concrete, livery band; the door wall with the frame of
    the 3 m disc, the cradle's surround (right of the door as faced), the station plate's place and the wall diagram (left)."""
    out = []
    def add(o): out.append(o); return o
    X0, X1, Z0, Z1, top = 9.0, 19.0, 66.0, 80.0, -39.0
    rows = [FL, FL + 0.3, FL + 1.2, FL + 2.4, FL + 3.0, FL + 3.6, top]
    dusty = tuple(ic.mix("concrete", "ash", 0.35))
    def wcell(i, j, uc, vc):
        if vc < FL + 0.3: return {"region": "steel", "tint": "steel", "row": 0.6, "vbase": FL, "vrange": (0.0, 0.5)}
        return {"tint": tuple(ic.mix(dusty, "sand", 0.18)) if vc < FL + 1.2 else dusty, "row": 2.4, "vbase": FL}
    kw = dict(mat="m_pellam", region="concrete", tint=dusty, vbase=FL, cell=wcell, lm=True)
    add(ic.surface("an_wall_w", (X0, 0, 0), (0, 0, -1), (0, 1, 0), cuts(-Z1, -Z0, 3.6), rows, **kw))
    add(ic.surface("an_wall_n", (0, 0, Z0), (1, 0, 0), (0, 1, 0), cuts(X0, X1, 3.4), rows, **kw))
    add(ic.surface("an_wall_e", (X1, 0, 0), (0, 0, 1), (0, 1, 0), cuts(Z0, Z1, 3.6, [74.0, 76.0]), rows, skip=lambda uc, vc: 74 < uc < 76 and vc < FL + 3.0, **kw))
    add(ic.surface("an_wall_s", (0, 0, Z1), (-1, 0, 0), (0, 1, 0), cuts(-X1, -X0, 1.5, [-15.5, -12.5]), rows, skip=lambda uc, vc: -15.5 < uc < -12.5 and vc < FL + 3.0, **kw))
    add(ic.from_faces("an_e_reveal", [[(X1, FL, 74), (X1 + 1, FL, 74), (X1 + 1, FL + 3, 74), (X1, FL + 3, 74)], [(X1 + 1, FL, 76), (X1, FL, 76), (X1, FL + 3, 76), (X1 + 1, FL + 3, 76)],
                                       [(X1, FL + 3, 74), (X1 + 1, FL + 3, 74), (X1 + 1, FL + 3, 76), (X1, FL + 3, 76)],
                                       # integration (polish round 2): the threshold's floor was missing (a 1 x 2 m hole to the void between the
                                       # antechamber floor and the foot of the stair; tests/pipeline greybox: n_bo_011 had no floor under it)
                                       [(X1, FL, 76), (X1 + 1, FL, 76), (X1 + 1, FL, 74), (X1, FL, 74)]], "m_pellam", "concrete", "concrete", toward=(X1 + 0.5, FL + 1.5, 75), lm=True, mpr=7.2))
    # floor: dusty concrete; a cleaner tracked path from the stair to the door, the camp's swept patch
    def ftint(p):
        x, z = p[0], p[2]
        path = abs(z - 75.0) < 1.0 and x > 13.0 or (abs(x - 14.0) < 1.2 and z > 74.0)
        camp = math.hypot(x - 11.5, z - 70.0) < 1.4
        return tuple(ic.mix(dusty, "sand", 0.0 if (path or camp) else 0.22))
    add(ic.surface("an_floor", (0, FL, 0), (1, 0, 0), (0, 0, -1), cuts(X0, X1, 1.2), [-z for z in reversed(cuts(Z0, Z1, 1.4, [74.0, 76.0]))], "m_pellam", "concrete", ftint, row=2.4, vbase=-Z1, lm=True))
    add(ic.surface("an_ceiling", (0, top, 0), (1, 0, 0), (0, 0, 1), cuts(X0, X1, 2.5), cuts(Z0, Z1, 2.8), "m_pellam", "concrete", dusty, row=2.4, vbase=Z0, lm=False))
    for k, pts in enumerate(([(X0, Z1), (X0, Z0), (X1, Z0), (X1, 74.0)], [(X1, 76.0), (X1, Z1), (15.7, Z1)], [(12.3, Z1), (X0, Z1)])):
        add(ic.band(f"an_band_{k}", pts[::-1] if False else _ccw(pts), FL + 1.2))
    # the door frame on the antechamber side: a ceramic panel with a true circle cut for the 3 m disc (the disc is a prop)
    dc = layout.marker("door_bore")["pos"]; cy = dc[1] + 1.5; cx = dc[0]; zf = Z1 - 0.03
    n = 32
    circ = [(cx + 1.5 * math.cos(2 * math.pi * i / n), cy + 1.5 * math.sin(2 * math.pi * i / n)) for i in range(n)]
    sq = []
    for i in range(n):
        a = 2 * math.pi * i / n; c, s = math.cos(a), math.sin(a); k = 1.9 / max(abs(c), abs(s))
        sq.append((cx + c * k, max(FL, cy + s * k)))
    f = []
    for i in range(n):
        j = (i + 1) % n
        f.append([(circ[i][0], circ[i][1], zf), (circ[j][0], circ[j][1], zf), (sq[j][0], sq[j][1], zf), (sq[i][0], sq[i][1], zf)])
    add(ic.from_faces("door_surround", f, "m_pellam", "enamel", None, bevel=0.02, away_from=(cx, cy, Z1 + 1), lm=True))
    ring = [(cx + 1.62 * math.cos(2 * math.pi * i / n), cy + 1.62 * math.sin(2 * math.pi * i / n), zf - 0.025) for i in range(n + 1)]
    add(ic.tube("door_ring", ring, 0.05, 8, "m_pellam", "steel", None))
    for j, (xa, xb) in enumerate(((cx - 1.9, cx - 1.6), (cx + 1.6, cx + 1.9))):
        add(ic.from_faces(f"door_hazard_{j}", [[(x, y, zf - 0.005) for x, y in ic.diagonal_band(xa, FL + 0.1, xb, FL + 1.0, 0.25, up=(j == 0))]], "m_pellam", "hazard", None, away_from=(cx, FL, Z1 + 1)))
    add(ic.from_faces("door_plinth", [[(cx - 1.9, FL + 0.001, zf - 0.6), (cx + 1.9, FL + 0.001, zf - 0.6), (cx + 1.9, FL + 0.001, Z1), (cx - 1.9, FL + 0.001, Z1)][::-1]], "m_pellam", "steel_dark", "steel", away_from=(cx, FL - 1, 79), lm=True, mpr=3.6))
    # over the door, on the antechamber side: LIFT STATION 4, stencilled; a hands-off pictogram by the ports
    ys = cy + 2.25
    dec.append(ic.decals("an_station", [([(cx + 1.3, ys, zf - 0.004), (cx - 1.3, ys, zf - 0.004), (cx - 1.3, ys + 0.32, zf - 0.004), (cx + 1.3, ys + 0.32, zf - 0.004)], "station", None, "steel_dark"),
                                        ([(cx + 2.35, FL + 1.45, Z1 - 0.004), (cx + 2.05, FL + 1.45, Z1 - 0.004), (cx + 2.05, FL + 1.75, Z1 - 0.004), (cx + 2.35, FL + 1.75, Z1 - 0.004)], "picto_misc", 2, "steel_dark")]))
    ante_dec.append(dec[-1])
    # station identity on the west wall, facing the stair's door and lit by the embers: a 0.5 m geometry "4" on a ceramic plate
    add(ic.box("an_station_plate", (X0, FL + 1.55, 69.9), (X0 + 0.04, FL + 2.75, 71.3), "m_pellam", "enamel", None, bevel=0.02, drop="x-", tess=0.6))
    add(ic.numeral("4", 0.5, (X0 + 0.042, FL + 1.95, 70.6), -90.0, depth=0.012, name="an_numeral_4"))
    # the cradle's place: a clean steel surround on the dusty wall (the cradle itself is a prop)
    cr = layout.marker("ia_cradle")["pos"]
    for k, (lo, hi) in enumerate((((cr[0] - 0.42, cr[1] - 0.72, Z1 - 0.025), (cr[0] - 0.34, cr[1] + 0.72, Z1)), ((cr[0] + 0.34, cr[1] - 0.72, Z1 - 0.025), (cr[0] + 0.42, cr[1] + 0.72, Z1)),
                                  ((cr[0] - 0.42, cr[1] + 0.64, Z1 - 0.025), (cr[0] + 0.42, cr[1] + 0.72, Z1)), ((cr[0] - 0.42, cr[1] - 0.72, Z1 - 0.025), (cr[0] + 0.42, cr[1] - 0.64, Z1)))):
        add(ic.box(f"cradle_surround_{k}", lo, hi, "m_pellam", "steel", None, bevel=0.008, drop="z+"))
    # the wall diagram (prop_ante_diagram, 2.4 m) and its lamps
    m = layout.marker("prop_ante_diagram"); H = m["params"]["height"]; dx = m["pos"][0]; y0 = m["pos"][1]
    U = H / brand.MARK_H; ring_y = y0 + H / 2.0 + brand.mark_centre_offset(U); zd = Z1 - 0.05
    add(ic.box("an_diagram_panel", (dx - 1.0, y0 - 0.15, zd), (dx + 1.0, y0 + H + 0.15, Z1), "m_pellam", "enamel", None, bevel=0.02, drop="z+", lm=True))
    mk = brand.pellam_mark(U, relief=0.02, segments=12, name="an_mark", colour="steel_dark", mat="m_prop")
    mk.matrix_world = Matrix.Translation(B((dx, ring_y, zd))) @ Matrix.Rotation(math.pi, 4, 'Z')
    mesh.apply_transform(mk); zone.fold_flat(mk, "m_pellam"); vcol.tint(mk, "steel_dark"); mk["lm"] = False
    add(mk)
    lamps = []
    for k, (u, v) in enumerate(brand.mark_disc_centres(U)):
        s = 0.07 if k < 6 else 0.1
        zl = zd - 0.023; xc = dx - u; yc = ring_y + v                   # facing -z (north): the mark's right (+u) is toward -x
        lamps.append([B((xc + s, yc - s, zl)), B((xc - s, yc - s, zl)), B((xc - s, yc + s, zl)), B((xc + s, yc + s, zl))])
    # embedded: the embers and the kettle (the only fire he leaves), the note under the cradle
    def put(asset, node, loc_game, rot):
        obs = zone.embed_prop(asset, node=node, location=layout.to_blender(loc_game), rot_z=math.radians(rot) + math.pi, material_name="m_pellam", lightmap=LM)
        for o in obs: o["lm"] = False; mesh.tessellate_max_edge(o, 0.6)
        emb.extend(obs); return obs
    camp = layout.marker("prop_camp_three")["pos"]
    put("prop_camp_ash", "ash_embers", camp, 0.0)
    put("prop_kettle", None, (camp[0] + 0.3, camp[1], camp[2] + 0.12), 25.0)
    loc, rz = layout.placement("rd_note_cradle")
    obs = zone.embed_prop("rd_note", node="note_cradle", location=loc, rot_z=rz, material_name="m_pellam", lightmap=LM)
    for o in obs: o["lm"] = False
    emb.extend(obs)
    am = layout.marker("ia_ammo_box_ante")["pos"]
    add(ic.box("an_ammo_mount", (X0, FL + 0.25, am[2] - 0.4), (am[0], FL + 1.3, am[2] + 0.4), "m_pellam", "enamel_stain", None, bevel=0.02, drop="x-", tess=0.6))
    for o in ic.seat("an_ammo_seat", (am[0], FL + 0.775, am[2]), 90.0, 0.66, 0.9): add(o)
    return out, lamps, (cr, camp)


# ---- polish round 4 (visual critic, major: "bore chamber pillars and the well kerb show blotchy, mottled baked light at
# cover distance"). The ribs and the kerb are the two things in the room the player stands against, and both baked as
# clouds: the fill's AO and the bore layer's soft lights (a 5.6 m disc 7 m under the kerb, four 1 m spheres) at 64 to 256
# adaptive samples left noise that the denoiser turned into 20 to 40 cm blobs. Three changes: no adaptive sampling in
# this bake (it stops early exactly where the light is low), four to sixteen times the samples on the sector, and the
# islands of the ribs and the kerb are then smoothed inside their own outline (a gaussian of SOFT_SIGMA texels, about
# 0.15 m, normalised by the island's coverage so nothing leaks in from the atlas; the bake margin is grown again).
SOFT_SIGMA = _env("KS_SOFT_SIGMA", 2.6)
WELL_KEEP = _env("KS_WELL_KEEP", 0.35)


def _uv_mask(objs, res):
    """Texels of the atlas covered by the lightmapped faces of `objs` (rows bottom-up, as the bake's arrays)."""
    m = np.zeros((res, res), dtype=bool)
    for o in objs:
        me = o.data
        if "UVLight" not in me.uv_layers: continue
        n = len(me.loops); uvs = np.empty(n * 2, dtype=np.float32); me.uv_layers["UVLight"].data.foreach_get("uv", uvs); uvs = uvs.reshape(-1, 2) * res
        idx = ic.LM_FACES.get(o.name)
        polys = me.polygons if idx is None else [me.polygons[i] for i in idx]
        for p in polys:
            q = uvs[list(p.loop_indices)]
            for k in range(1, len(q) - 1):
                t = q[[0, k, k + 1]]
                area = (t[1, 0] - t[0, 0]) * (t[2, 1] - t[0, 1]) - (t[2, 0] - t[0, 0]) * (t[1, 1] - t[0, 1])
                if abs(area) < 1e-6: continue
                x0, x1 = max(int(math.floor(t[:, 0].min() - 1)), 0), min(int(math.ceil(t[:, 0].max() + 1)), res - 1)
                y0, y1 = max(int(math.floor(t[:, 1].min() - 1)), 0), min(int(math.ceil(t[:, 1].max() + 1)), res - 1)
                if x1 < x0 or y1 < y0: continue
                xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
                inside = np.ones(xs.shape, dtype=bool); sg = 1.0 if area > 0 else -1.0
                for a, b in ((0, 1), (1, 2), (2, 0)):
                    ex, ey = t[b, 0] - t[a, 0], t[b, 1] - t[a, 1]; el = math.hypot(ex, ey) or 1.0
                    inside &= sg * (ex * (ys - t[a, 1]) - ey * (xs - t[a, 0])) / el >= -0.71      # the texel centre within 0.71 px of the triangle
                m[y0:y1 + 1, x0:x1 + 1] |= inside
    return m


def _blur(a, sigma):
    r = max(1, int(math.ceil(sigma * 3))); k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2).astype(np.float32); k /= k.sum()
    for axis in (0, 1):
        pad = [(0, 0)] * a.ndim; pad[axis] = (r, r); b = np.pad(a, pad, mode='constant'); out = np.zeros_like(a)
        for i, w in enumerate(k):
            sl = [slice(None)] * a.ndim; sl[axis] = slice(i, i + a.shape[axis]); out += w * b[tuple(sl)]
        a = out
    return a


def _soften(arr, soft, cover, sigma=None, margin=5):
    """Smooth `arr` (h, w, 3 bottom-up) inside the texels `soft`; then grow the result `margin` texels into what no
    island covers (`cover` = every island of the atlas), as the bake's own margin was."""
    sigma = sigma or SOFT_SIGMA
    m = soft.astype(np.float32)
    num = _blur(arr * m[:, :, None], sigma); den = _blur(m, sigma)
    out = arr.copy(); out[soft] = (num / np.maximum(den, 1e-6)[:, :, None])[soft]
    filled = soft.copy(); free = ~cover
    for _ in range(margin):
        acc = np.zeros_like(out); cnt = np.zeros(filled.shape, dtype=np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            f = np.roll(filled, (dy, dx), axis=(0, 1)); v = np.roll(out, (dy, dx), axis=(0, 1))
            acc += v * f[:, :, None]; cnt += f
        grow = free & ~filled & (cnt > 0)
        out[grow] = acc[grow] / cnt[grow][:, None]
        filled |= grow
    return out



def _ccw(pts):
    """Band runs: walk the antechamber's walls so that the band faces into the room (inside on the right)."""
    return pts


# ====================================================================================================== main
def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    rng = scene.rng(args.seed)
    t0 = time.perf_counter()
    base, bay_lamp, mark_disc = build_sector()
    ante_parts, an_lamps, (cradle, camp) = build_ante()
    stair = build_stair()
    cat = build_catwalk()
    # ---- paint (embedded props keep their own colours)
    geo = [o for o in base + ante_parts + stair + cat if "Tint" in o.data.color_attributes and material.names(o) != ["m_mask"]]
    ic.paint(geo, z_range=(FL, CE), gradient=(0.96, 1.03), jitter=0.0, seed=args.seed, ao_strength=0.5, ao_distance=0.6)
    for o in dec + [o for o in base + ante_parts if material.names(o) == ["m_mask"]]:
        if "Tint" in o.data.color_attributes: ic.flat_paint(o)
    # ---- dummies: the five other sectors, as shadow casters and bounce for the sector bake
    axis_b = B(AX)
    for o in base: mesh.apply_transform(o)
    dummies = zone.copy_about_axis(base, (axis_b.x, axis_b.y), 6, name_suffix="_dummy")[len(base):]
    for o in dummies:
        o.name = o.name.replace(".", "_")
    # ---- lights (mood L5)
    bake.use_cycles('CPU', samples=64); bake.set_world((0, 0, 0), 0.0)
    bpy.context.scene.cycles.use_adaptive_sampling = False       # polish round 4: see _soften
    bay_l = []
    for k in range(6):
        b = 60.0 * k
        p = P(R_WALL - 0.35, b, FL + 4.85); t = P(R_WALL - 4.0, b, FL)
        bay_l.append(ic.area_light(f"bay_lamp_{k + 1}", p, t, "#7CF2E2", 1.3, 0.2, energy=100.0, spread_deg=84.0, radius=11.0, power=1.3))     # fix pass 1: the pools reach the kerb
    k2 = bay_l[1]
    r = ic.set_reading(k2, P(R_WALL - 3.6, 60.0, FL), (0, 1, 0), 1.3, group=[k2])
    for l in bay_l: l.data.energy = k2.data.energy
    wall_l = []
    for k in range(6):
        b = 60.0 * k
        wall_l.append(ic.area_light(f"bay_wall_{k + 1}", P(R_WALL - 0.45, b, FL + 4.6), P(R_WALL - 0.05, b, FL + 0.6), "#A8F4EA", 1.6, 0.2, energy=40.0, spread_deg=150.0, radius=WALL_WASH_R, power=1.4))
    w2 = wall_l[1]; pw = P(R_WALL - 0.02, 60.0, FL + 2.4); nw = (AX[0] - pw[0], 0.0, AX[2] - pw[2])
    rw_ = ic.set_reading(w2, pw, nw, WALL_WASH_T, group=[w2])
    for l in wall_l: l.data.energy = w2.data.energy
    print(f"CALIBRATED bay wall scallops: the lining 2.4 m up under a bay lamp reads {rw_:.2f} (target {WALL_WASH_T})")
    print(f"CALIBRATED bay lamps: the pool on the floor 3.6 m in from the wall reads {r:.2f} (target 1.3)")
    emb_l = ic.point_light("embers", (camp[0], FL + 0.25, camp[2]), "#FF9433", EMBER_R, size=0.25, power=1.6)
    r = ic.set_reading(emb_l, (camp[0] + 1.5, FL, camp[2]), (0, 1, 0), EMBER_T)
    print(f"CALIBRATED embers: the floor 1.5 m from the fire reads {r:.2f} (target {EMBER_T}); reach {EMBER_R} m")
    emb_far = ic.point_light("embers_far", (camp[0], FL + 0.7, camp[2]), "#FFB36B", 14.0, size=0.6, power=1.0)       # flame off dusty concrete: paler than the flame
    r = ic.set_reading(emb_far, (cradle[0] + 1.2, cradle[1], 79.97), (0, 0, -1), EMBER_FAR)
    print(f"CALIBRATED embers' bounce: the door wall beside the cradle reads {r:.2f} (target {EMBER_FAR}); reach 14 m")
    cr_l = ic.area_light("cradle_lamp", (cradle[0], cradle[1] + 0.55, 79.6), (cradle[0], cradle[1] - 0.6, 79.5), "#E6FFFB", 0.3, 0.2, energy=10.0, spread_deg=120.0, radius=2.2, power=1.4)
    r = ic.set_reading(cr_l, (cradle[0], cradle[1] - 0.3, 79.97), (0, 0, -1), 0.9)
    print(f"CALIBRATED cradle lamp: the wall under the cradle reads {r:.2f} (target 0.9), tight")
    # the stair's two wall lamps (fill): the landing wall across each reads 0.55; the proving-lift room's lamp
    st_l = [ic.area_light("st_lamp_l", (27.78, -37.4, 75.0), (25.0, -39.5, 75.0), "#7CF2E2", 1.0, 0.16, energy=30.0, spread_deg=170.0, radius=9.0, power=1.4),
            ic.area_light("st_lamp2_l", (27.78, -34.3, 83.0), (25.0, -36.0, 83.0), "#7CF2E2", 1.0, 0.16, energy=30.0, spread_deg=170.0, radius=9.0, power=1.4)]
    r = ic.set_reading(st_l[0], (26.0, -39.5, 75.0), (1, 0, 0), 0.55, group=[st_l[0]]); st_l[1].data.energy = st_l[0].data.energy
    print(f"CALIBRATED stair lamps: the wall across the landing reads {r:.2f} (target 0.55)")
    arr_l = ic.area_light("bay_arrival_l", (4.82, -33.1, 83.0), (2.0, -36.0, 83.0), "#7CF2E2", 1.2, 0.14, energy=30.0, spread_deg=170.0, radius=5.5, power=1.4)
    r = ic.set_reading(arr_l, (2.0, -36.0, 83.0), (0, 1, 0), BAY_LAMP_T)      # polish round 2: 0.45 -> 0.7 (the cage's own floor and roof are dark; the walls carry the bay); round 3: 0.9
    print(f"CALIBRATED arrival bay lamp: the floor in the middle of the bay reads {r:.2f} (target {BAY_LAMP_T})")
    gate_l = ic.area_light("gate_lamp_l", (14.0, FL + 3.25, 115.85), (14.0, FL, 113.5), "#7CF2E2", 1.0, 0.1, energy=20.0, spread_deg=170.0, radius=6.0, power=1.4)
    r = ic.set_reading(gate_l, (14.0, FL, 113.8), (0, 1, 0), LIFT_LAMP_T)
    # polish round 3: the practicals of the three dark transitions (see build_catwalk / build_on_top)
    lift_w = ic.area_light("lift_wash_l", (14.0, FL + 3.25, 112.14), (14.0, FL + 1.3, 116.0), "#CFFFF6", 1.2, 0.14, energy=20.0, spread_deg=170.0, radius=7.0, power=1.4)
    r2 = ic.set_reading(lift_w, (14.6, FL + 1.6, 115.97), (0, 0, -1), LIFT_WASH_T, group=[lift_w])
    print(f"CALIBRATED proving-lift room: the floor under the gate lamp reads {r:.2f} (target {LIFT_LAMP_T}), the lever's wall {r2:.2f} (target {LIFT_WASH_T})")
    wash_l = [ic.area_light(f"bay_wash_l_{k}", p, (5.0, -34.4, 83.0), "#CFFFF6", 0.14, 2.2, energy=20.0, spread_deg=170.0, radius=7.0, power=1.4) for k, (p, sg) in enumerate(BAY_WASH)]
    r = ic.set_reading(wash_l[0], (4.99, -34.6, 81.0), (-1, 0, 0), BAY_WASH_T, group=wash_l)
    print(f"CALIBRATED arrival bay washers: the bulkhead beside the hatchway reads {r:.2f} (target {BAY_WASH_T})")
    cat_l = [ic.area_light(f"cat_lamp_l_{k}", p, (p[0], -35.4, 82.0), "#CFFFF6", 1.0, 0.14, energy=20.0, spread_deg=160.0, radius=6.0, power=1.4) for k, p in enumerate(CAT_LAMPS)]
    # (the tube's grille cards are opaque planes to Cycles: out of the render wherever something else is lit through them)
    grille = [o for o in dec if o.name == "catwalk_grille"]
    for g in grille: g.hide_render = True
    mid = cat_l[3]; pm = CAT_LAMPS[3]
    r = ic.set_reading(mid, (pm[0], -34.8, 81.96), (0, 0, 1), CAT_LAMP_T, group=[mid])
    for l in cat_l: l.data.energy = mid.data.energy
    rb = float(ic.probe((pm[0], -35.99, 83.0), (0, 1, 0), lights=cat_l).max())
    for g in grille: g.hide_render = False
    print(f"CALIBRATED catwalk work lamps ({len(cat_l)}): the back panel at 1.2 m opposite one reads {r:.2f} (target {CAT_LAMP_T}); the deck under it reads {rb:.2f}")
    # the bore's own light (the layer only): a disc of light down the shaft and a column of it
    glow = [ic.area_light("bore_disc", (AX[0], SHAFT_LOW + 0.2, AX[2]), (AX[0], FL + 5, AX[2]), (1, 1, 1), 5.6, 5.6, energy=1000.0, spread_deg=180.0, euler=(math.pi, 0, 0))]
    glow[0].data.shape = 'DISK'
    col = [ic.point_light(f"bore_col_{k}", (AX[0], -46.0 + 2.5 * k, AX[2]), (1, 1, 1), 13.5, size=1.0, power=1.0) for k in range(4)]       # pass 3: the column's light dies before the wall: ribs back-lit, the perimeter left to the bay lamps
    up = ic.area_light("bore_up", (AX[0], -42.7, AX[2]), (AX[0], CE, AX[2]), (1, 1, 1), 5.0, 5.0, energy=500.0, spread_deg=110.0, euler=(math.pi, 0, 0))
    up.data.shape = 'DISK'
    groups = [[glow[0]], col, [up]]
    glow = glow + col + [up]
    for g in glow: g.hide_render = True
    # ---- unwrap (everything into one atlas)
    everything = base + ante_parts + stair + cat + emb + dec
    ic.unwrap(everything + emi, LM)
    for g in glow: g.hide_render = False
    # the bore's light: a disc down the shaft and a column of light above it, scaled so the rib inner faces read 0.8;
    # the ceiling and the catwalk's underside then get a top-up of their own (their own bake passes), so that they read
    # the art bible's 0.4 and 0.6 of that (#8A3CCC x 0.8 / x 0.4 / x 0.6)
    probes = {"rib": (P(7.45, 30.5, -38.0), (-math.sin(math.radians(30.5)), 0, math.cos(math.radians(30.5))), 0.8),
              "ceiling": (P(9.0, 45.0, CE - 0.01), (0, -1, 0), 0.4), "catwalk": ((14.0, -36.47, 83.0), (0, -1, 0), 0.6)}
    # (pass 3: the ceiling probe stood at bearing 60, in the shadow of the cable tray that runs along that bearing 0.35 m
    #  under the ceiling: it read 0.05, the top-up was scaled to fill the "missing" light, and the whole ceiling baked at
    #  2.0 and clipped. It now stands at 45 degrees, clear of tray and beams. Targets are the order's: ribs 0.8, ceiling
    #  0.4, catwalk undersides 0.6.)
    up.hide_render = True; glow = [l for l in glow if l is not up]; ic.remove([up])
    r = ic.set_reading(glow[1], probes["rib"][0], probes["rib"][1], 0.8, group=glow)
    base_c = float(ic.probe(*probes["ceiling"][:2], lights=glow).max()); base_w = float(ic.probe(*probes["catwalk"][:2], lights=glow).max())
    top_c = ic.point_light("glow_ceiling", (AX[0], -40.0, AX[2]), (1, 1, 1), 30.0, size=2.0, power=1.0)
    top_w = ic.point_light("glow_catwalk", (AX[0], -42.0, AX[2]), (1, 1, 1), 30.0, size=2.0, power=1.0)
    rc = ic.set_reading(top_c, *probes["ceiling"][:2], max(0.01, 0.4 - base_c), group=[top_c])
    rw = ic.set_reading(top_w, *probes["catwalk"][:2], max(0.01, 0.6 - base_w), group=[top_w])
    ceil_k = min(1.0, 0.4 / max(base_c, 1e-3))
    print(f"CALIBRATED bore light (layer): rib inner face {r:.2f} (target 0.80); ceiling {base_c:.2f} x {ceil_k:.2f} + top-up {rc:.2f} (target 0.40); catwalk underside {base_w:.2f} + top-up {rw:.2f} (target 0.60)")
    for g in (top_c, top_w): g.hide_render = True
    for g in glow: g.hide_render = True
    # ---- bake: the sector with the asymmetric parts hidden; then the rest with everything in place
    t1 = time.perf_counter()
    sec_lm = [o for o in base if ic.is_lm(o)]
    other = ante_parts + stair + cat + dec
    hide_for_sector = other + emb + cat_l + wash_l + [lift_w]         # polish round 3: the new practicals stand outside the six-fold pattern
    hide_for_sector = [o for o in hide_for_sector if o not in base]
    # fix pass 1: 256 lamp samples and 192 AO samples for the sector (64 / 48 left the ribs and the kerb blotched once the
    # ambient no longer drowned the noise), 128 / 96 for the rest
    # polish round 4: 1024 / 512 for the sector (see _soften), and its ribs and kerb smoothed in their islands
    Q1 = dict(samples=None if ic.DRAFT else 1024, ao_samples=512); Q2 = dict(samples=None if ic.DRAFT else 128, ao_samples=96)
    GQ = None if ic.DRAFT else 1024
    a = ic.lm_pass(sec_lm, LM, AMB_CH, ao_distance=3.0, hide=hide_for_sector, **Q1)
    res = manifest.texture(LM)["size"][0]
    # polish round 5: the lining's facets as well (at arm's length their fill still showed a faint mottle on High)
    soft_objs = [o for o in sec_lm if o.name == "kerb" or o.name.startswith(("rib_", "wall_"))]
    soft = _uv_mask(soft_objs, res); cover = _uv_mask([o for o in everything + emi if ic.is_lm(o)], res)
    print(f"NOTE soften: {len(soft_objs)} objects ({', '.join(sorted(o.name for o in soft_objs))}), {int(soft.sum())} texels of {int(cover.sum())} covered, sigma {SOFT_SIGMA}")
    a = _soften(a, soft, cover)
    # polish round 2: the arrival bay is baked alone. Its south-east corner lies inside the chamber's radius (r < 15 at
    # (5, 84)), so the chamber's wall facets and the dummy sectors stood INSIDE the closed bay during the bake and cut a
    # hard black triangle out of its floor, walls and ceiling. The stair (north of z 80.3: the antechamber's mood) takes
    # the antechamber's fill.
    is_bay = lambda o: o.name.startswith(BAY_NAMES)
    bay_side = [o for o in cat if ic.is_lm(o) and is_bay(o)]
    chamber_side = [o for o in cat if ic.is_lm(o) and not is_bay(o)]
    stair_side = [o for o in stair if ic.is_lm(o)]
    ante_side = [o for o in ante_parts + emb if ic.is_lm(o) and o not in base]
    # polish round 3: the tube runs THROUGH the chamber's wall at both ends (the slots are cut after the bake), so the
    # sector's and the dummies' wall facets stood across it and shadowed its first and last 3 m: the tube is baked
    # without the chamber round it (the bay lamps, 9 m below and thrown down, never reached it anyway)
    b = ic.lm_pass(chamber_side, LM, AMB_CH, ao_distance=3.0, hide=grille + base + dummies, **Q2) if chamber_side else 0
    bay_pass = ic.lm_pass(bay_side, LM, AMB_CH, ao_distance=3.0, hide=base + dummies, **Q2)
    # polish round 4 (visual critic, minor: "the bore arrival is a wall of bright mesh squares"): the bay's three closed
    # walls and its ceiling are seen only through the cage's lattice, and under the catwalk's exposure (x1.7) even the
    # dimmed bay lamp drew every opening of the lattice as a teal square. They keep WELL_KEEP of their baked light: the
    # lattice is dark on dark there, and the lit bulkhead with the hatchway is the one bright wall of the arrival.
    well = _uv_mask([o for o in bay_side if o.name == "arrival_well"], res)
    grown = well.copy()
    for _ in range(5):
        g2 = grown.copy()
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)): g2 |= np.roll(grown, (dy, dx), axis=(0, 1))
        grown = well | (g2 & ~cover)
    bay_pass[grown] *= WELL_KEEP
    print(f"NOTE arrival well: {int(well.sum())} texels (+{int(grown.sum() - well.sum())} margin) x {WELL_KEEP}")
    b = b + bay_pass
    b = b + ic.lm_pass(stair_side, LM, AMB_AN, ao_distance=3.0, hide=grille + base + dummies, **Q2)
    c = ic.lm_pass(ante_side, LM, AMB_AN, ao_distance=2.5, **Q2) if ante_side else 0
    ic.save_lm(a + b + c, LM)
    for g in glow: g.hide_render = False
    # three passes over the sector that add up: the ceiling (scaled down to its target if the bore's own light already
    # exceeds it), the shaft lining (so close to the disc that it bakes far over 2.0: scaled so that only its brightest
    # twentieth clips and the lining keeps its gradient down the bore), and everything else as baked
    ceil_objs = [o for o in sec_lm if o.name.startswith(("ceiling", "girder_bot", "beam_"))]
    shaft_objs = [o for o in sec_lm if o.name == "shaft"]
    rest_objs = [o for o in sec_lm if o not in ceil_objs and o not in shaft_objs]
    ga = _soften(ic.layer_pass(rest_objs, GLOW, glow, hide=hide_for_sector, samples=GQ), soft, cover)
    ga = ga + ic.layer_pass(ceil_objs, GLOW, glow, hide=hide_for_sector) * ceil_k
    gs = ic.layer_pass(shaft_objs, GLOW, glow, hide=hide_for_sector)
    lit = gs[:, :, 0][gs[:, :, 0] > 0.02]
    p95 = float(np.percentile(lit, 95)) if lit.size else 1.0
    shaft_k = min(1.0, 1.9 / max(p95, 1e-3))
    print(f"NOTE shaft lining: 95th percentile of the bore's light on it {p95:.2f}, scaled x {shaft_k:.2f} (a layer stores at most 2.0)")
    ga = ga + gs * shaft_k
    gb = ic.layer_pass(chamber_side + stair_side + ante_side, GLOW, glow)
    top_c.hide_render = False
    gc = ic.layer_pass(ceil_objs, GLOW, [top_c], hide=hide_for_sector)
    top_c.hide_render = True; top_w.hide_render = False
    gw = ic.layer_pass([o for o in cat if ic.is_lm(o) and o.name.startswith("girder_")], GLOW, [top_w])
    top_w.hide_render = True
    ic.save_lm(ga + gb + gc + gw, GLOW)
    for g in glow: g.hide_render = True
    t_lm = time.perf_counter() - t1
    for o in hide_for_sector: o.hide_render = True
    t_vl = ic.bake_vertex([o for o in base if ic.is_vl(o)], AMB_CH, ao_distance=3.0)
    for o in hide_for_sector: o.hide_render = False
    an_names = [x.name for x in ante_parts]
    for g in grille + base + dummies: g.hide_render = True
    t_vl += ic.bake_vertex([o for o in cat + dec if ic.is_vl(o) and o.name not in an_names and not is_bay(o) and o not in ante_dec and o not in grille], AMB_CH, ao_distance=3.0)
    for g in grille: g.hide_render = False
    t_vl += ic.bake_vertex(grille, AMB_CH, ao_distance=3.0)
    for g in base + dummies: g.hide_render = False
    t_vl += ic.bake_vertex([o for o in stair + ante_dec if ic.is_vl(o)], AMB_AN, ao_distance=3.0)
    for o in base + dummies: o.hide_render = True
    t_vl += ic.bake_vertex([o for o in cat if ic.is_vl(o) and is_bay(o)], AMB_CH, ao_distance=3.0)
    for o in base + dummies: o.hide_render = False
    t_vl += ic.bake_vertex([o for o in ante_parts + emb if ic.is_vl(o)], AMB_AN, ao_distance=2.5)
    print(f"BAKED {LM} + {GLOW} {t_lm:.1f}s, vertex light {t_vl:.1f}s; ambient chamber {AMB_CH.max():.2f}, antechamber {AMB_AN.max():.2f}; build {time.perf_counter() - t0:.1f}s")
    ic.remove(dummies)
    ic.weld_colors(everything)
    # ---- the six sectors, then what stands on top of them
    sectors = zone.copy_about_axis(base, (axis_b.x, axis_b.y), 6)
    on_top = build_on_top(sectors)
    ic.paint([o for o in on_top if "Tint" in o.data.color_attributes], z_range=(FL, CE), gradient=(0.96, 1.03), jitter=0.0, ao_strength=0.5, ao_distance=0.6)
    for o in on_top:
        uv.ensure_layers(o, lightmap=True)
    # the parts on top are vertex-lit in place (the lightmap atlas is closed: their few lightmapped faces become vertex-lit)
    for o in on_top:
        o["lm"] = False; ic.LM_FACES.pop(o.name, None); bake.set_vertex_lit_uv1(o, None, LM)
    for g in glow: g.hide_render = True
    ic.bake_vertex(on_top, AMB_CH, ao_distance=3.0)
    ic.weld_colors(on_top)
    final = [o for o in sectors + on_top + ante_parts + stair + cat + emb + dec + emi if len(o.data.polygons)]
    ic.remove([o for o in sectors + on_top if len(o.data.polygons) == 0])
    zone.assign_chunks(final, ASSET)
    merged = zone.merge_chunks(ASSET)
    ct = ic.chunk_tris(merged)
    ic.box_report(ASSET, merged)
    print("CHUNKS " + ", ".join(f"{k} {v}" for k, v in sorted(ct.items())))
    # ---- named nodes: bore_axis, bore_glow, bay_lamps, mark_glows, ante_diagram_lamps
    export.marker("bore_axis", B(AX))
    nseg = 32; deep = FL - 30.0
    disc = [B((AX[0] + 2.98 * math.cos(2 * math.pi * i / nseg), deep, AX[2] - 2.98 * math.sin(2 * math.pi * i / nseg))) for i in range(nseg)]
    col = []
    ys = [deep, deep + 6.0, deep + 12.0, deep + 18.0, SHAFT_LOW]
    for j in range(len(ys) - 1):
        for i in range(nseg):
            a0, a1 = 2 * math.pi * i / nseg, 2 * math.pi * (i + 1) / nseg
            q = [(AX[0] + 2.99 * math.cos(a0), ys[j], AX[2] - 2.99 * math.sin(a0)), (AX[0] + 2.99 * math.cos(a0), ys[j + 1], AX[2] - 2.99 * math.sin(a0)),
                 (AX[0] + 2.99 * math.cos(a1), ys[j + 1], AX[2] - 2.99 * math.sin(a1)), (AX[0] + 2.99 * math.cos(a1), ys[j], AX[2] - 2.99 * math.sin(a1))]
            col.append([B(p) for p in q])
    bg = zone.lamp_set("bore_glow", [[disc] + col], colour="violet_band", intensity=1.0, wrong_fade=1.0, origin=B(AX))
    me = bg.data; bmx = bmesh.new(); bmx.from_mesh(me)
    for f in bmx.faces:                                                # everything faces the axis (the column) or up (the disc)
        cc = f.calc_center_median()
        if abs(f.normal.z) > 0.9:
            if f.normal.z < 0: f.normal_flip()
        else:
            to = Vector((-cc.x, -cc.y, 0))
            if f.normal.dot(to) < 0: f.normal_flip()
    bmx.to_mesh(me); bmx.free()
    cc_ = vcol.get_colors(bg, "Color"); pos = vcol.corner_positions(bg)
    cc_[:, 0] = np.clip(0.35 + 0.65 * (SHAFT_LOW - pos[:, 2]) / (SHAFT_LOW - deep), 0.35, 1.0)
    vcol.set_colors(bg, cc_, "Color")
    bl = zone.lamp_set("bay_lamps", [[_rot(bay_lamp, 60.0 * k - 60.0)] for k in range(6)], colour="aqua", intensity=1.0)
    mg = zone.lamp_set("mark_glows", [[_rot(mark_disc, 60.0 * k - 60.0)] for k in range(6)], colour="aqua", intensity=1.0, flicker_group=1.0)
    ad = zone.lamp_set("ante_diagram_lamps", [[q] for q in an_lamps], colour=["aqua"] * 6 + ["aqua_core"], intensity=1.0)
    c_ = vcol.get_colors(ad, "Color"); c_[:24, 0] = 0.55; vcol.set_colors(ad, c_, "Color")
    for o in (bg, bl, mg, ad): o["emit_strength"] = 0.0
    _face(bl, lambda c: Vector((AX[0], -AX[2], 0)) - Vector((c.x, c.y, 0)))          # bay lamps look at the axis
    _face(mg, lambda c: Vector((0, 0, 1)))                                           # mark glows look up
    _face(ad, lambda c: Vector((0, 1, 0)))                                           # the antechamber diagram looks north (-z game = +y Blender)
    ic.snap_positions(list(merged.values()) + [bl, mg, ad])
    ic.vertex_report(list(merged.values()))
    plan = {c["id"]: c["tris"] for c in manifest.asset(ASSET)["chunks"]}
    for cid, t in ct.items():
        if t > plan[cid]: raise RuntimeError(f"{cid}: {t} triangles > its share {plan[cid]}")
    n = 0
    for (aid, x, z, rr) in (("prop_crate", 9.6, 66.6, 0.2), ("prop_barrel", 10.4, 66.5, 0.0), ("prop_crate", 18.4, 66.7, -0.3)):
        n += 1; zone.dressing_empty('inst', n, aid, loc=layout.to_blender((x, FL, z)), rot_z=rr)
    export.export_asset(ASSET, args.out, blend=args.blend)


def _face(ob, want):
    """Flip the faces of a lamp-set mesh that look away from want(world centre) (a Blender direction)."""
    me = ob.data; bm = bmesh.new(); bm.from_mesh(me)
    mw = ob.matrix_world
    for f in bm.faces:
        if f.normal.dot(want(mw @ f.calc_center_median())) < 0: f.normal_flip()
    bm.to_mesh(me); bm.free(); me.update()


def _rot(poly, deg):
    """Rotate GAME points about the bore axis by `deg` of bearing (clockwise from above) -> Blender points."""
    out = []
    for p in poly:
        b = bearing(p[0], p[2]); r = math.hypot(p[0] - AX[0], p[2] - AX[2])
        out.append(B(P(r, b + deg, p[1])))
    return out


if __name__ == "__main__":
    scene.run(main)
