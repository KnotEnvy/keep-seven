"""env_the_gallery: the peg stair, the proving bay and the 62 m gallery (work order art-env-interior 4.2;
ART_BIBLE 3.4, 7.3; LEVEL 4).

    node tools/build-assets.mjs --only env_the_gallery          (KS_Q=draft in the environment: quick bake)

Three chunks: `chunk_gl_stair` (three flights of cast concrete under a tall slot, peg rails on both walls: it holds
the seam), `chunk_gl_bay` (the proving bay) and `chunk_gl_gallery` (ONE 3.6 m module of floor plate, pipe racks,
cable trays and a ceiling strip, baked once and copied seventeen times, with three variant modules; the baffle
wall; the far door frame; the three knot seats on the puzzle's line).

Bake, mood L3: ambient #132547 x 0.30 x AO; the aqua strips themselves are the key (one per module, a smeared streak
under each); the strips of `strip_flicker` are NOT in the bake: their two modules have a lightmap of their own, baked
with the strip overhead dark. `lm_gallery`: stair treads and walls to head height, the bay, the baffle wall, the two
module bakes.
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
import bpy
import numpy as np
from mathutils import Vector, Matrix
from lib import scene, mesh, uv, material, vcol, bake, export, zone, layout, manifest, brand
import interior_common as ic
from interior_common import B, lin, cuts, frange

ASSET = "env_the_gallery"
LM = "lm_gallery"
AMBIENT = ic.ambient("#132547", 0.30, gain=0.36)
FLOOR, CEIL = -12.0, -7.0
GZ0, GZ1 = -17.5, -10.5                 # gallery walls (north, south faces)
WZ0, WZ1 = -15.5, -12.5                 # walkway
MOD = 3.6
WEST = [-81.0 + MOD * k for k in range(6)]        # module origins west of the baffle wall
EAST = [-58.6 + MOD * k for k in range(11)]       # and east of it
LIT_SLOT, DARK_SLOT = EAST[3], EAST[5]            # where the two module bakes stand (their neighbours are lit dummies)
FLICKER = [EAST[5], EAST[9]]                      # one strip in eight flickers: these two modules take the dark bake
VARIANT = {WEST[2]: "panel_off", EAST[1]: "valve", EAST[2]: "panel_off", EAST[4]: "cable", EAST[7]: "valve", EAST[8]: "panel_off", EAST[10]: "cable"}
RESERVE = {"rd_plate": 2.0 / 3.0}
# polish round 3 (visual critic, minor: "gallery and lift hall are one continuous saturated teal wash ... no warm or
# neutral accent"). As in the hall: the smear under each strip is a near-neutral white (the pool's core draws
# grey-white on the plate), the strip's wide light is half as saturated, the ambient stays the mood's deep blue, and
# sodium practicals stand at the line locker and the ammunition box of the proving bay and on the gauge panel of the
# two valve stations. Lead ruling R7 outranks ART_BIBLE 3.4's "muzzle pulse ... the only warm light"; request filed.
def _env(k, d): return float(os.environ.get(k, d))
CORE_C = (1.0, _env("KS_CORE_G", 0.88), _env("KS_CORE_B", 0.84))
WIDE_C = tuple(float(x) for x in (lin("#7CF2E2") * 0.5 + np.array(CORE_C, dtype=np.float32) * 0.5))
SODIUM = "#FF9A3C"
WARM_T, GAUGE_T = _env("KS_WARM_T", 0.8), _env("KS_GAUGE_T", 0.9)
WARM = []

parts, emb, dec, emi = [], [], [], []


def add(ob, into=None):
    (parts if into is None else into).append(ob); return ob


CONC = "concrete"
# fix pass 1 (critic round 1: value structure). The pipe banks and the walls behind them are the dark band of this
# zone (ART_BIBLE 2.3: darkest thing = pipe banks; 10 : 30 : 60): the glazed panel is the stained, shadowed variant
# of the enamel, darker again above the band; the walkway's plate and the streaks under the strips carry the light.
W_LOW = tuple(ic.mix("enamel_stain", "steel", 0.45))
W_HIGH = tuple(ic.mix("enamel_stain", "steel", 0.62))
W_END = tuple(ic.mix("enamel_stain", "steel", 0.5))


# ====================================================================================================== the peg stair
def stair_height(flight, t):
    """Height of the ramp of `flight` at run position t (x for flight 1, z for 2 and 3)."""
    if flight == 1: return -(t + 93.0) * (4.0 / 6.0)
    if flight == 2: return -4.0 - (t + 32.0) * (4.0 / 6.0)
    return -8.0 - (t + 24.0) * (4.0 / 6.0)


def build_stair(rng):
    N = 12; rise = 4.0 / N; run = 6.0 / N                              # 12 risers: the nav nodes at 0.5 and 3.0 m down a flight stand on nosings
    # ---- treads and risers (lightmapped), drawn through the ramp's plane (the collider is the 33.7 degree ramp)
    def flight(k, origin, d, w, y_top):
        """origin = top of the flight (GAME), d = unit run direction, w = unit width direction (2 m). The ramp collider
        is the line of the nosings: riser i stands at run i, tread i lies one rise lower and reaches run i + 1."""
        f = []
        o = Vector(origin); d = Vector(d); w = Vector(w); nb = 0.02
        def P(dist, y, side): q = o + d * dist + w * (2.0 * side); return (q.x, y, q.z)
        for i in range(N):
            d0 = run * i; yt = y_top - rise * i; yb = yt - rise
            f.append([P(d0 - nb, yt, 0), P(d0, yt - nb, 0), P(d0, yt - nb, 1), P(d0 - nb, yt, 1)])                  # the 20 mm arris of the nosing
            f.append([P(d0, yt - nb, 0), P(d0, yb, 0), P(d0, yb, 1), P(d0, yt - nb, 1)])                            # riser
            d1 = d0 + run - (nb if i < N - 1 else 0.0)
            f.append([P(d0, yb, 0), P(d1, yb, 0), P(d1, yb, 1), P(d0, yb, 1)])                                      # tread
        ref = o + w - d * 3.0
        ob = ic.from_faces(f"flight_{k}", f, "m_pellam", CONC, "concrete", lm=True, away_from=(ref.x, y_top - 12.0, ref.z), mpr=7.2)
        return add(ob)
    flight(1, (-93, 0, -34), (1, 0, 0), (0, 0, 1), 0.0)
    flight(2, (-87, 0, -32), (0, 0, 1), (1, 0, 0), -4.0)
    flight(3, (-87, 0, -24), (0, 0, 1), (1, 0, 0), -8.0)
    # landings
    add(ic.surface("landing_1", (0, -4.0, 0), (0, 0, 1), (1, 0, 0), [-34, -32], [-87, -85], "m_pellam", "concrete", CONC, lm=True))
    add(ic.surface("landing_2", (0, -8.0, 0), (0, 0, 1), (1, 0, 0), [-26, -24], [-87, -85, -83.6], "m_pellam", "concrete", CONC, lm=True))

    # ---- walls: one lattice per wall; cells below the stair are left out, the 3.2 m above it are lightmapped, the rest vertex-lit
    def wall(tag, o, u, v, us, y0, y1, hfun, lm_band=99.0, skip=None):
        vs = [y0 + 0.8 * i for i in range(int((y1 - y0) / 0.8 - 1e-6) + 1)] + [y1]      # 0.8 m lattice: three cells to a 2.4 m concrete course
        def low(uc, vc): return vc < hfun(uc) - 0.9
        def is_lm(uc, vc): return vc < hfun(uc) + lm_band
        sk = skip or (lambda uc, vc: False)
        a = ic.surface(f"swall_{tag}_lm", o, u, v, us, vs, "m_pellam", "concrete", CONC, vbase=y0, skip=lambda uc, vc: low(uc, vc) or not is_lm(uc, vc) or sk(uc, vc), lm=True)
        b = ic.surface(f"swall_{tag}_vl", o, u, v, us, vs, "m_pellam", "concrete", CONC, vbase=y0, skip=lambda uc, vc: low(uc, vc) or is_lm(uc, vc) or sk(uc, vc), lm=False)
        for q in (a, b):
            if len(q.data.polygons): add(q)
            else: bpy.data.objects.remove(q, do_unlink=True)
    h1 = lambda x: stair_height(1, min(max(x, -93.0), -87.0)) if x < -87 else -4.0
    # flight 1 and landing 1: north wall z -34 (looks +z), south wall z -32 (looks -z), west end x -93 (looks +x); ceiling: the Tally floor's underside
    wall("f1_n", (0, 0, -34), (1, 0, 0), (0, 1, 0), cuts(-93, -85, 1.2), -5.6, -0.3, h1)
    wall("f1_s", (0, 0, -32), (-1, 0, 0), (0, 1, 0), cuts(87, 93, 1.2), -5.6, -0.3, lambda u: h1(-u))
    add(ic.surface("f1_ceiling", (0, -0.3, 0), (1, 0, 0), (0, 0, 1), cuts(-89, -85, 1.0), [-34, -33, -32], "m_pellam", "concrete", CONC, lm=False))
    # flights 2, 3 and the landings: west wall x -87 (looks +x) z -32..-18; east wall x -85 (looks -x) with the niche; ceiling at y -1
    def h23(z):
        if z < -32: return -4.0
        if z < -26: return stair_height(2, z)
        if z < -24: return -8.0
        return stair_height(3, min(z, -18.0))
    wall("f23_w", (-87, 0, 0), (0, 0, -1), (0, 1, 0), cuts(18, 32, 1.2, [24, 26]), -13.6, -1.0, lambda u: h23(-u))
    wall("f23_e", (-85, 0, 0), (0, 0, 1), (0, 1, 0), cuts(-34, -18, 1.2, [-32, -26, -24]), -13.6, -1.0, h23,
         skip=lambda uc, vc: -26 < uc < -24 and vc < -6.4)                                # the niche opening, 2 m wide, 1.6 m high
    wall("l1_e_top", (-85, 0, 0), (0, 0, 1), (0, 1, 0), [-34, -33, -32], -1.0, -0.3, lambda u: -4.0, lm_band=0.0)
    add(ic.surface("f23_ceiling", (0, -1.0, 0), (1, 0, 0), (0, 0, 1), [-87, -86, -85], cuts(-32, -18, 1.4), "m_pellam", "concrete", CONC, lm=False))
    add(ic.from_faces("f2_head", [[(-87, -1.0, -32), (-85, -1.0, -32), (-85, -0.3, -32), (-87, -0.3, -32)]], "m_pellam", CONC, "concrete", toward=(-86, -0.6, -33), tess=1.0))
    add(ic.from_faces("shaft_end", [[(-87, CEIL, -18), (-85, CEIL, -18), (-85, -1.0, -18), (-87, -1.0, -18)]], "m_pellam", CONC, "concrete", toward=(-86, -4, -19), tess=1.2, mpr=7.2))
    # the niche off landing 2: x -85..-83.6, z -26..-24, y -8..-6.4 (the watcher sits here: left empty)
    ny0, ny1 = -8.0, -6.4
    nf = [[(-85, ny0, -26), (-83.6, ny0, -26), (-83.6, ny1, -26), (-85, ny1, -26)], [(-83.6, ny0, -24), (-85, ny0, -24), (-85, ny1, -24), (-83.6, ny1, -24)],
          [(-83.6, ny0, -26), (-83.6, ny0, -24), (-83.6, ny1, -24), (-83.6, ny1, -26)], [(-85, ny1, -26), (-83.6, ny1, -26), (-83.6, ny1, -24), (-85, ny1, -24)]]
    add(ic.from_faces("niche", nf, "m_pellam", CONC, "concrete", toward=(-84.3, -7.2, -25), lm=True, mpr=7.2))
    add(ic.box("niche_lintel", (-85.06, ny1, -26.2), (-84.9, ny1 + 0.24, -23.8), "m_pellam", "steel", "steel", bevel=0.02, drop="x+", tess=0.7, mpr=3.6))

    # ---- peg rails: a board 0.15 x 0.03 m at 1.6 m above the stair on both walls, pegs every 0.4 m; a LOW rail at 0.9 m,
    #      bare, on both walls of the lower half of flight 2 and on landing 2 (in the pool of the second strip)
    pegs = []            # (tip position, outward normal (x, z), height class 'high' | 'low', flight)
    def tread_level(fl, t):
        start, top = {1: (-93.0, 0.0), 2: (-32.0, -4.0), 3: (-24.0, -8.0)}[fl]
        i = min(N - 1, max(0, int(math.floor((t - start) / run))))
        return top - (i + 1) * rise

    def rail(tag, p0, p1, normal, height, cls, fl, landing=False):
        """A rail from GAME p0 to p1 (points ON the wall at stair level), raised `height`."""
        a = Vector(p0) + Vector((0, height, 0)); b = Vector(p1) + Vector((0, height, 0))
        n = Vector((normal[0], 0, normal[1])); L = (b - a).length; d = (b - a) / L
        hb = 0.075; t = 0.03
        up = Vector((0, 1, 0))
        f = []
        segs = max(1, int(round(L / 1.5)))
        for i in range(segs):
            q0 = a + d * (L * i / segs); q1 = a + d * (L * (i + 1) / segs)
            f.append([tuple(q0 - up * hb + n * t), tuple(q1 - up * hb + n * t), tuple(q1 + up * hb + n * t), tuple(q0 + up * hb + n * t)])   # face
            f.append([tuple(q0 + up * hb + n * t), tuple(q1 + up * hb + n * t), tuple(q1 + up * hb), tuple(q0 + up * hb)])                    # top
            f.append([tuple(q0 - up * hb), tuple(q1 - up * hb), tuple(q1 - up * hb + n * t), tuple(q0 - up * hb + n * t)])                    # underside
        mid = (a + b) / 2
        add(ic.from_faces(f"rail_{tag}", f, "m_pellam", "steel", "steel", away_from=tuple(mid - n * 0.5), mpr=3.6, along=tuple(ic.Bd(d))))
        k = int(L / 0.4)
        for i in range(k):
            q = a + d * (0.2 + 0.4 * i)
            tip = q + n * 0.15 + up * 0.02
            pg = ic.cyl(f"peg_{tag}_{i}", tuple(q + n * 0.02), tuple(tip), 0.015, 5, "m_pellam", "enamel", None, radius_b=0.019, cap=True)
            mesh.delete_faces(pg, lambda fc, c, nn: nn.dot(ic.Bd(n)) < -0.9)
            add(pg)
            ground = p0[1] if landing else tread_level(fl, q.x if fl == 1 else q.z)
            pegs.append((tuple(tip), (n.x, n.z), cls, fl, ground))
    # flight 1 (run +x)
    rail("f1n", (-89.9, stair_height(1, -89.9), -34), (-87.2, stair_height(1, -87.2), -34), (0, 1), 1.6, "high", 1)
    rail("f1s", (-89.9, stair_height(1, -89.9), -32), (-87.2, stair_height(1, -87.2), -32), (0, -1), 1.6, "high", 1)
    rail("l1n", (-86.8, -4, -34), (-85.2, -4, -34), (0, 1), 1.6, "high", 1, True)
    rail("l1e", (-85, -4, -33.8), (-85, -4, -32.2), (-1, 0), 1.6, "high", 1, True)
    # flight 2 (run +z)
    rail("f2w", (-87, stair_height(2, -31.8), -31.8), (-87, stair_height(2, -26.2), -26.2), (1, 0), 1.6, "high", 2)
    rail("f2e", (-85, stair_height(2, -31.8), -31.8), (-85, stair_height(2, -26.2), -26.2), (-1, 0), 1.6, "high", 2)
    rail("f2w_low", (-87, stair_height(2, -29.6), -29.6), (-87, stair_height(2, -26.2), -26.2), (1, 0), 0.9, "low", 2)
    rail("f2e_low", (-85, stair_height(2, -29.6), -29.6), (-85, stair_height(2, -26.2), -26.2), (-1, 0), 0.9, "low", 2)
    rail("l2w", (-87, -8, -25.8), (-87, -8, -24.2), (1, 0), 1.6, "high", 2, True)
    rail("l2w_low", (-87, -8, -25.8), (-87, -8, -24.2), (1, 0), 0.9, "low", 2, True)
    # flight 3
    rail("f3w", (-87, stair_height(3, -23.8), -23.8), (-87, stair_height(3, -18.2), -18.2), (1, 0), 1.6, "high", 3)
    rail("f3e", (-85, stair_height(3, -23.8), -23.8), (-85, stair_height(3, -18.2), -18.2), (-1, 0), 1.6, "high", 3)

    # ---- one aqua strip per flight (baked lit): a 1.2 m wall luminaire in a dark steel bezel, 2.5 m above the stair
    strips = []
    def strip(k, pos, along, normal):
        p = Vector(pos); a = Vector(along); n = Vector((normal[0], 0, normal[1])); up = Vector((0, 1, 0))
        lo = p - a * 0.68 - up * 0.09; hi = p + a * 0.68 + up * 0.09 + n * 0.07
        add(ic.box(f"strip_bezel_{k}", (min(lo.x, hi.x), lo.y, min(lo.z, hi.z)), (max(lo.x, hi.x), hi.y, max(lo.z, hi.z)), "m_pellam", "steel_dark", None, bevel=0.02, tess=0.7))
        q = p + n * 0.072
        poly = [tuple(q - a * 0.6 - up * 0.05), tuple(q + a * 0.6 - up * 0.05), tuple(q + a * 0.6 + up * 0.05), tuple(q - a * 0.6 + up * 0.05)]
        e = ic.emis(f"strip_stair_{k}", [poly])
        if e.data.polygons[0].normal.dot(ic.Bd(n)) < 0: e.data.flip_normals()
        emi.append(e)
        strips.append((tuple(q + n * 0.03), tuple(n)))
    s1 = layout.marker("light_stair_1")["pos"]; s2 = layout.marker("light_stair_2")["pos"]; s3 = layout.marker("light_stair_3")["pos"]
    strip(1, (s1[0], s1[1], -34.0), (1, 0, 0), (0, 1))
    strip(2, (-85.0, s2[1], s2[2]), (0, 0, 1), (-1, 0))
    strip(3, (-85.0, s3[1], s3[2]), (0, 0, 1), (-1, 0))
    return pegs, strips


# ====================================================================================================== the proving bay
def build_bay(rng):
    X0, X1, Z0, Z1 = -91.0, -81.0, -18.0, -10.0
    rows = cuts(FLOOR, CEIL, 1.2)                                       # concrete courses 2.4 m: 0, 2.4, 4.8
    rows = [FLOOR, FLOOR + 1.2, FLOOR + 2.4, FLOOR + 3.6, FLOOR + 4.8, CEIL]
    kw = dict(mat="m_pellam", region="concrete", tint=CONC, vbase=FLOOR, lm=True)
    add(ic.surface("bay_wall_w", (X0, 0, 0), (0, 0, -1), (0, 1, 0), cuts(-Z1, -Z0, 2.0), rows, **kw))
    add(ic.surface("bay_wall_s", (0, 0, Z1), (-1, 0, 0), (0, 1, 0), cuts(-X1, -X0, 2.0), rows, **kw))
    add(ic.surface("bay_wall_n", (0, 0, Z0), (1, 0, 0), (0, 1, 0), cuts(X0, X1, 2.0, [-87, -85]), rows, skip=lambda uc, vc: -87 < uc < -85, **kw))
    # returns at the gallery mouth (the gallery is 0.5 m narrower each side)
    add(ic.from_faces("bay_returns", [[(X1, FLOOR, Z0), (X1, FLOOR, GZ0), (X1, CEIL, GZ0), (X1, CEIL, Z0)], [(X1, FLOOR, GZ1), (X1, FLOOR, Z1), (X1, CEIL, Z1), (X1, CEIL, GZ1)]],
                      "m_pellam", CONC, "concrete", away_from=(X1 + 1, -9.5, -14), lm=True, mpr=7.2))
    # floor: satin plate on the 1.2 m module; ceiling: cast concrete
    add(ic.surface("bay_floor", (0, FLOOR, 0), (0, 0, 1), (1, 0, 0), cuts(Z0, Z1, 4.0), cuts(X0, X1, 1.2), "m_pellam", "floor", tuple(ic.mix("steel", "concrete", 0.55)), row=1.2, vbase=X0, lm=True))
    add(ic.surface("bay_ceiling", (0, CEIL, 0), (1, 0, 0), (0, 0, 1), cuts(X0, X1, 2.5), cuts(Z0, Z1, 2.0), "m_pellam", "concrete", CONC, row=2.0, vbase=Z0, lm=True))
    # kick plate (steel below 0.3 m) and the livery band at 1.2 m, round the bay, broken by the stair opening
    def skirt(name, pts, y0, y1, tint, region):
        f = []
        for a, b in zip(pts[:-1], pts[1:]):
            d = Vector((b[0] - a[0], b[1] - a[1])).normalized(); nx, nz = -d.y, d.x; o = 0.012
            f.append([(a[0] + nx * o, y0, a[1] + nz * o), (b[0] + nx * o, y0, b[1] + nz * o), (b[0] + nx * o, y1, b[1] + nz * o), (a[0] + nx * o, y1, a[1] + nz * o)])
            f.append([(a[0] + nx * o, y1, a[1] + nz * o), (b[0] + nx * o, y1, b[1] + nz * o), (b[0], y1 + 0.012, b[1]), (a[0], y1 + 0.012, a[1])])
        return ic.from_faces(name, f, "m_pellam", tint, region, lm=True, mpr=3.6)
    runs = [[(-85, Z0), (X1, Z0)], [(X1, Z1), (X0, Z1), (X0, Z0), (-87, Z0)]]
    for k, r in enumerate(runs):
        add(skirt(f"bay_kick_{k}", r, FLOOR, FLOOR + 0.3, "steel", "steel"))
        add(ic.band(f"bay_band_{k}", r, FLOOR + 1.2))
    # station identity: a 0.4 m geometry "4" on a ceramic plate on the west wall, LIFT STATION 4 beneath
    add(ic.box("bay_station_plate", (X0, -10.2, -14.6), (X0 + 0.04, -9.2, -13.4), "m_pellam", "enamel", None, bevel=0.02, drop="x-", tess=0.6))
    add(ic.numeral("4", 0.4, (X0 + 0.042, -9.85, -14.0), -90.0, depth=0.012, name="bay_numeral_4"))
    xs = X0 + 0.043
    dec.append(ic.decals("bay_station", [([(xs, -10.12, -13.48), (xs, -10.12, -14.52), (xs, -9.99, -14.52), (xs, -9.99, -13.48)], "station", None)], "steel_dark"))
    # the range: a tube rail on two wall arms, 0.95 m off the south wall, three hooks 1.5 m apart (the plates are props)
    hooks = [layout.marker(f"ia_range_plate_{i}")["pos"] for i in (1, 2, 3)]
    ry = hooks[0][1] + 0.45 + 0.09; rz = hooks[0][2]
    add(ic.cyl("range_rail", (hooks[2][0] - 0.7, ry, rz), (hooks[0][0] + 0.7, ry, rz), 0.035, 8, "m_pellam", "steel", "steel", tess=0.8, mpr=3.6))
    for k, hx in enumerate((hooks[2][0] - 0.55, hooks[0][0] + 0.55)):
        add(ic.box(f"range_arm_{k}", (hx - 0.035, ry - 0.045, rz - 0.04), (hx + 0.035, ry + 0.045, Z1), "m_pellam", "steel", "steel", bevel=0.01, drop="z+", tess=0.6, mpr=3.6))
        add(ic.box(f"range_arm_foot_{k}", (hx - 0.1, ry - 0.2, Z1 - 0.03), (hx + 0.1, ry + 0.12, Z1), "m_pellam", "steel_dark", None, bevel=0.01, drop="z+"))
    for k, h in enumerate(hooks):
        add(ic.box(f"range_hook_{k}", (h[0] - 0.02, ry - 0.11, rz - 0.03), (h[0] + 0.02, ry - 0.02, rz + 0.03), "m_pellam", "steel_dark", None, bevel=0.006))
    # a ceramic backstop panel on the west wall behind the row of plates, hazard diagonal across it
    add(ic.box("range_backstop", (X0, FLOOR + 0.3, rz - 0.75), (X0 + 0.06, FLOOR + 2.1, rz + 0.75), "m_pellam", "enamel_stain", None, bevel=0.02, drop="x-", tess=0.6))
    add(ic.from_faces("range_hazard", [[(X0 + 0.063, y, z) for z, y in ic.diagonal_band(rz - 0.7, FLOOR + 0.35, rz + 0.7, FLOOR + 2.05, 0.3)]], "m_pellam", "hazard", None, away_from=(X0 - 1, -10.5, rz)))
    # the proving step's mount: a steel floor frame round the 1.6 m step, under the one steady lamp
    st = layout.marker("pz_proving_mark")["pos"]
    fr = []
    o_ = ic.rounded_rect(st[0] - 0.95, st[2] - 0.95, st[0] + 0.95, st[2] + 0.95, 0.15, 3)
    add(ic.poly_prism("step_mount", o_, FLOOR, FLOOR + 0.02, "m_pellam", "steel_dark", None, bevel=0.008, tess=0.8))
    # hidden inside the step prop: its top is the layout's platform (gl_mark_step, 0.15 m), so the zone has a floor where the nav node stands
    sm = layout.solid("gl_mark_step"); sy = sm["pos"][1] + sm["size"][1] / 2 - 0.01
    add(ic.box("step_core", (st[0] - 0.76, FLOOR, st[2] - 0.76), (st[0] + 0.76, sy, st[2] + 0.76), "m_pellam", "steel_dark", None, bevel=0.0, drop="y-"))
    lamp = layout.marker("light_gallery_mark")["pos"]
    add(ic.box("mark_lamp_bezel", (lamp[0] - 0.3, CEIL - 0.07, lamp[2] - 0.3), (lamp[0] + 0.3, CEIL, lamp[2] + 0.3), "m_pellam", "steel_dark", None, bevel=0.02, drop="y+"))
    yq = CEIL - 0.072
    emi.append(ic.emis("mark_lamp", [[(lamp[0] - 0.22, yq, lamp[2] - 0.22), (lamp[0] + 0.22, yq, lamp[2] - 0.22), (lamp[0] + 0.22, yq, lamp[2] + 0.22), (lamp[0] - 0.22, yq, lamp[2] + 0.22)]], "aqua_core"))
    # fix pass 1: the bay's own two strips (ordinary, steady, dimmer than the mark's lamp): without them the bay was
    # lit by the ambient alone and its frame measured 0 : 4 : 96. One over the range (the three plates catch it), one
    # at the stair's foot.
    for k, (bx, bz) in enumerate(BAY_STRIPS):
        add(ic.box(f"bay_strip_bezel_{k}", (bx - 0.65, CEIL - 0.025, bz - 0.11), (bx + 0.65, CEIL, bz + 0.11), "m_pellam", "steel_dark", None, bevel=0.008, drop="y+"))
        yb = CEIL - 0.027
        emi.append(ic.emis(f"bay_strip_{k}", [[(bx - 0.6, yb, bz - 0.05), (bx + 0.6, yb, bz - 0.05), (bx + 0.6, yb, bz + 0.05), (bx - 0.6, yb, bz + 0.05)]], "aqua"))
        if emi[-1].data.polygons[0].normal.dot(ic.Bd((0, -1, 0))) < 0: emi[-1].data.flip_normals()
    add(ic.box("mark_lamp_conduit", (lamp[0] - 0.04, CEIL - 0.05, Z0), (lamp[0] + 0.04, CEIL, lamp[2] - 0.3), "m_pellam", "steel", None, bevel=0.01, drop="y+ z-", tess=0.8))
    # mounts on the walls for the props that hang there: the line locker (south wall), the ammunition box (north wall)
    lk = layout.marker("ia_line_locker_bay")["pos"]
    add(ic.box("locker_mount", (lk[0] - 0.42, FLOOR, lk[2]), (lk[0] + 0.42, FLOOR + 1.5, Z1), "m_pellam", W_LOW, None, bevel=0.02, drop="y- z+", tess=0.6))
    for o in ic.seat("locker_seat", (lk[0], FLOOR + 0.78, lk[2]), 0.0, 0.7, 1.3): add(o)
    am = layout.marker("ia_ammo_box_bay")["pos"]
    add(ic.box("ammo_mount", (am[0] - 0.4, FLOOR + 0.3, Z0), (am[0] + 0.4, FLOOR + 1.35, am[2]), "m_pellam", W_LOW, None, bevel=0.02, drop="z-", tess=0.6))
    for o in ic.seat("ammo_seat", (am[0], FLOOR + 0.825, am[2]), 180.0, 0.66, 0.9): add(o)
    # polish round 3: a sodium work lamp over each (the bay's two warm pools; the mark's lamp stays the brightest thing)
    for name, mx, zw, sg in (("locker", lk[0], Z1, -1.0), ("ammo", am[0], Z0, 1.0)):
        add(ic.box(f"warm_bezel_{name}", (mx - 0.36, FLOOR + 2.0, min(zw, zw + sg * 0.09)), (mx + 0.36, FLOOR + 2.2, max(zw, zw + sg * 0.09)), "m_pellam", "steel_dark", None, bevel=0.01, drop="z+" if sg < 0 else "z-"))
        zq = zw + sg * 0.095
        emi.append(ic.emis(f"warm_lamp_{name}", [[(mx - 0.3, FLOOR + 2.05, zq), (mx + 0.3, FLOOR + 2.05, zq), (mx + 0.3, FLOOR + 2.15, zq), (mx - 0.3, FLOOR + 2.15, zq)]], "flame"))
        if emi[-1].data.polygons[0].normal.dot(ic.Bd((0, 0, sg))) < 0: emi[-1].data.flip_normals()
        WARM.append((name, (mx, FLOOR + 2.1, zw + sg * 0.25), (mx, FLOOR, zw + sg * 1.6), (mx, FLOOR, zw + sg * 1.5)))
    # embedded plates (load-bearing: plate_proving is on the critical path, beside the mark)
    for mid, node in (("rd_plate_proving", "plate_proving"), ("rd_plate_line", "plate_line")):
        m = layout.marker(mid); loc, rz_ = layout.placement(m)
        obs = zone.embed_prop("rd_plate", node=node, location=loc, rot_z=rz_, material_name="m_pellam", lightmap=LM)
        for o in obs: o["lm"] = False; mesh.tessellate_max_edge(o, 0.5)
        emb.extend(obs)
        p = m["pos"]; wz = Z0 if p[2] < -14 else Z1
        add(ic.box(f"pad_{node}", (p[0] - 0.36, p[1] - 0.24, min(wz, p[2])), (p[0] + 0.36, p[1] + 0.24, max(wz, p[2])), "m_pellam", "steel", None, bevel=0.012, drop="z-" if wz == Z0 else "z+"))
    return lamp


# ====================================================================================================== the gallery module
BAY_STRIPS = [(-88.0, -12.6), (-86.0, -16.2)]
PIPE_TINT = [tuple(ic.mix("steel", "steel_dark", 0.85)), tuple(ic.mix("steel", "steel_dark", 0.6)), tuple(ic.mix("steel", "steel_dark", 0.3))]     # pass 3: the banks are the darkest thing in the room (ART_BIBLE 2.3)
PIPES = [(0.25, -16.15, -11.30, 12), (0.175, -16.6, -10.375, 10), (0.10, -15.92, -9.327, 8)]     # radius, z, y, segments (north bank; the south bank mirrors)


def mz(z, south):
    """Mirror a north-bank z to the south bank (about the walkway's centre line z -14)."""
    return -28.0 - z if south else z


def build_module(x0, tag, objs_out):
    """One 3.6 m module at x0..x0 + 3.6: floor, both pipe racks, walls, ceiling, the strip's bezel. Returns its objects."""
    out = []
    def a(ob): out.append(ob); return ob
    x1 = x0 + MOD
    us3 = [x0, x0 + 1.2, x0 + 2.4, x1]
    # walls on the 1.2 m module: four courses of ceramic panel and a steel cornice
    rows = [FLOOR, FLOOR + 1.2, FLOOR + 2.4, FLOOR + 3.6, FLOOR + 4.8, CEIL]
    def wcell(i, j, uc, vc): return {"region": "steel", "tint": "steel", "row": 0.6, "vbase": FLOOR + 4.8, "vrange": (0.0, 0.34)} if vc > FLOOR + 4.8 else {"tint": W_LOW if vc < FLOOR + 2.4 else W_HIGH}
    a(ic.surface(f"m{tag}_wall_n", (0, 0, GZ0), (1, 0, 0), (0, 1, 0), us3, rows, "m_pellam", "panel", W_HIGH, vbase=FLOOR, cell=wcell, lm=True))
    a(ic.surface(f"m{tag}_wall_s", (0, 0, GZ1), (-1, 0, 0), (0, 1, 0), [-u for u in reversed(us3)], rows, "m_pellam", "panel", W_HIGH, vbase=FLOOR, cell=wcell, lm=True))
    # floor: concrete under the racks, a steel edge, two rows of satin plate, a steel edge, concrete
    zs = [GZ0, WZ0, WZ0 + 0.3, WZ0 + 1.5, WZ1 - 0.3, WZ1, GZ1]
    def fcell(i, j, uc, vc):
        if vc < WZ0 or vc > WZ1: return {"region": "concrete", "tint": tuple(lin(CONC) * 0.55), "row": 2.0, "vbase": GZ0 if vc < WZ0 else WZ1}
        if vc < WZ0 + 0.3 or vc > WZ1 - 0.3: return {"region": "steel", "tint": "steel", "row": 0.3, "vbase": WZ0 if vc < -14 else WZ1 - 0.3}
        return {"region": "floor", "tint": tuple(ic.mix("steel", "concrete", 0.55)), "row": 1.2, "vbase": WZ0 + 0.3}
    a(ic.surface(f"m{tag}_floor", (0, FLOOR, 0), (-1, 0, 0), (0, 0, 1), [-u for u in reversed(us3)], zs, "m_pellam", "floor", "steel", lm=True, cell=fcell))
    # ceiling: five courses of panel across the 7 m
    a(ic.surface(f"m{tag}_ceiling", (0, CEIL, 0), (1, 0, 0), (0, 0, 1), us3, cuts(GZ0, GZ1, 1.4), "m_pellam", "panel", tuple(ic.mix("enamel_stain", "steel", 0.55)), row=1.4, vbase=GZ0, lm=True))
    for south in (False, True):
        s = "s" if south else "n"
        # kerb at the rack's foot (the collision face of the bank)
        zk0, zk1 = sorted((mz(WZ0 - 0.07, south), mz(WZ0, south)))
        a(ic.box(f"m{tag}_kerb_{s}", (x0, FLOOR, zk0), (x1, FLOOR + 0.3, zk1), "m_pellam", "steel", "steel", bevel=0.0, drop="y- x- x+" + (" z-" if not south else " z+"), lm=True, mpr=3.6))
        # livery band on the wall behind the pipes
        zb = mz(GZ0, south)
        pts = [(x0, zb), (x1, zb)] if not south else [(x1, zb), (x0, zb)]
        a(ic.band(f"m{tag}_band_{s}", pts, FLOOR + 1.2))
        # the three pipes, lightmapped (only the half the walkway sees)
        for k, (r, z, y, sg) in enumerate(PIPES):
            zz = mz(z, south)
            p = ic.cyl(f"m{tag}_pipe_{s}{k}", (x0, y, zz), (x1, y, zz), r, sg, "m_pellam", PIPE_TINT[k], "panel_rib" if k < 2 else "steel", cap=False, lm=True,
                       keep=(lambda n: n.y < 0.45) if not south else (lambda n: n.y > -0.45), mpr=3.6)
            a(p)
            if k < 2:                                                  # a bolted flange coupling at 2.7 m
                fx = x0 + 2.7
                a(ic.cyl(f"m{tag}_flange_{s}{k}", (fx - 0.045, y, zz), (fx + 0.045, y, zz), r + 0.07, sg, "m_pellam", "steel", None, cap=True,
                         keep=(lambda n: n.y < 0.5) if not south else (lambda n: n.y > -0.5)))
        # the rack frame at 0.9 m: two posts, three tiers, a saddle under each pipe
        fx = x0 + 0.9
        zf, zr = mz(WZ0 - 0.13, south), mz(GZ0 + 0.3, south)
        for e, zp in enumerate((zf, zr)):
            a(ic.box(f"m{tag}_post_{s}{e}", (fx - 0.05, FLOOR, zp - 0.05), (fx + 0.05, FLOOR + 3.0, zp + 0.05), "m_pellam", "steel", "steel", bevel=0.0, drop="y- y+" + (" z-" if (e == 1) != south else ""), tess=1.5, mpr=3.6))
        for k, (r, z, y, sg) in enumerate(PIPES):
            yb = y - r - 0.05
            za, zb2 = sorted((zf, zr))
            a(ic.box(f"m{tag}_tier_{s}{k}", (fx - 0.04, yb - 0.08, za), (fx + 0.04, yb, zb2), "m_pellam", "steel", "steel", bevel=0.0, drop="z- z+ y+", tess=0.9, mpr=3.6))
            zz = mz(z, south)
            a(ic.box(f"m{tag}_saddle_{s}{k}", (fx - 0.09, yb, zz - r * 0.75), (fx + 0.09, yb + r * 0.55, zz + r * 0.75), "m_pellam", "steel_dark", None, bevel=0.0, drop="y- y+"))
        # cable tray above the bank, on a wall bracket: a shallow channel with three cables
        ty = FLOOR + 3.25
        z0t, z1t = sorted((mz(GZ0 + 0.08, south), mz(GZ0 + 0.58, south)))
        tf = [[(x0, ty, z0t), (x1, ty, z0t), (x1, ty, z1t), (x0, ty, z1t)]]
        zlip = z1t if not south else z0t
        tf.append([(x0, ty, zlip), (x1, ty, zlip), (x1, ty + 0.07, zlip), (x0, ty + 0.07, zlip)])
        tray = ic.from_faces(f"m{tag}_tray_{s}", tf, "m_pellam", "steel", "steel", mpr=3.6, tess=1.2)
        # both sides of the tray's sheet are seen (from below and from the walkway): double it
        tb = ic.from_faces(f"m{tag}_trayb_{s}", [list(reversed(q)) for q in tf], "m_pellam", "steel_dark", None, tess=1.2)
        a(tray); a(tb)
        for c in range(2):
            zc = mz(GZ0 + 0.2 + 0.2 * c, south)
            a(ic.cyl(f"m{tag}_cable_{s}{c}", (x0, ty + 0.05, zc), (x1, ty + 0.05, zc), 0.04, 5, "m_pellam", "cable", "cable", cap=False, keep=(lambda n: n.z > -0.2), tess=1.2, mpr=0.8))
        a(ic.box(f"m{tag}_tray_arm_{s}", (fx - 0.03, ty - 0.07, z0t - 0.08 if not south else z0t), (fx + 0.03, ty, z1t if not south else z1t + 0.08), "m_pellam", "steel", None, bevel=0.0, drop="y+"))
    # the ceiling strip: a dark bezel 1.3 m long on the gallery axis
    a(ic.box(f"m{tag}_bezel", (x0 + 1.15, CEIL - 0.025, -14.11), (x0 + 2.45, CEIL, -13.89), "m_pellam", "steel_dark", None, bevel=0.008, drop="y+"))
    objs_out.extend(out)
    return out


def strip_poly(x0):
    y = CEIL - 0.027
    return [(x0 + 1.2, y, -14.05), (x0 + 2.4, y, -14.05), (x0 + 2.4, y, -13.95), (x0 + 1.2, y, -13.95)]


def variant_parts(x0, kind, tag):
    """What a variant module adds to the base module (vertex-lit; built at the module they are baked in)."""
    out = []
    if kind == "panel_off":
        # a wall panel is gone from the upper north wall (course 3, middle bay): steel ribs and a hanging cable in the recess
        xa, xb = x0 + 1.2, x0 + 2.4; ya, yb = FLOOR + 2.4, FLOOR + 3.6; zr = GZ0 - 0.22
        f = [[(xa, ya, zr), (xb, ya, zr), (xb, yb, zr), (xa, yb, zr)], [(xa, ya, GZ0), (xa, ya, zr), (xa, yb, zr), (xa, yb, GZ0)], [(xb, ya, GZ0), (xb, yb, GZ0), (xb, yb, zr), (xb, ya, zr)],
             [(xa, ya, GZ0), (xb, ya, GZ0), (xb, ya, zr), (xa, ya, zr)], [(xa, yb, GZ0), (xa, yb, zr), (xb, yb, zr), (xb, yb, GZ0)]]
        out.append(ic.from_faces(f"v{tag}_recess", f, "m_pellam", tuple(lin("steel_dark") * 0.7), None, toward=((xa + xb) / 2, (ya + yb) / 2, GZ0 + 0.2), tess=0.6))
        for e, x in enumerate((xa + 0.3, xb - 0.3)):
            out.append(ic.box(f"v{tag}_rib_{e}", (x - 0.04, ya, zr), (x + 0.04, yb, GZ0 - 0.04), "m_pellam", "steel", "steel", bevel=0.01, drop="y- y+ z-", tess=0.6, mpr=3.6))
        pts = [(xa + 0.55, yb - 0.02, GZ0 - 0.1)] + [(xa + 0.55 + 0.02 * i, yb - 0.25 * i - 0.02 * i * i, GZ0 - 0.1 + 0.035 * i) for i in range(1, 5)]
        out.append(ic.tube(f"v{tag}_cable", pts, 0.022, 5, "m_pellam", "cable", "cable", tess=None, mpr=0.8))
    elif kind == "valve":
        # a valve station on the middle pipe of the north bank: body, bonnet, handwheel, and a gauge panel at the walkway edge
        r, z, y, sg = PIPES[1]; xv = x0 + 1.75
        out.append(ic.box(f"v{tag}_body", (xv - 0.26, y - 0.26, z - 0.26), (xv + 0.26, y + 0.26, z + 0.26), "m_pellam", "steel", None, bevel=0.03, tess=0.5))
        out.append(ic.cyl(f"v{tag}_bonnet", (xv, y + 0.24, z), (xv, y + 0.62, z), 0.13, 8, "m_pellam", "steel", None, radius_b=0.09, tess=0.5))
        ring = [(xv + 0.24 * math.cos(2 * math.pi * i / 10), y + 0.66, z + 0.24 * math.sin(2 * math.pi * i / 10)) for i in range(10)]
        out.append(ic.tube(f"v{tag}_wheel", ring, 0.025, 5, "m_pellam", "hazard", None, closed=True))
        for e in range(2):
            a_ = math.pi / 2 * e
            out.append(ic.box(f"v{tag}_spoke_{e}", (-0.24, -0.012, -0.02), (0.24, 0.012, 0.02), "m_pellam", "steel_dark", None, bevel=0.0))
            ic.transform([out[-1]], Matrix.Translation(B((xv, y + 0.66, z))) @ Matrix.Rotation(a_, 4, 'Z'))
        out.append(ic.box(f"v{tag}_panel", (xv + 0.5, FLOOR + 1.1, WZ0 - 0.2), (xv + 1.0, FLOOR + 1.75, WZ0 - 0.1), "m_pellam", "enamel", None, bevel=0.02, tess=0.5))
        out.append(ic.box(f"v{tag}_panel_post", (xv + 0.72, FLOOR, WZ0 - 0.19), (xv + 0.78, FLOOR + 1.1, WZ0 - 0.13), "m_pellam", "steel", None, bevel=0.01, drop="y-", tess=0.6))
        zf = WZ0 - 0.098
        d = ic.decals(f"v{tag}_decals", [([(xv + 0.55, FLOOR + 1.3, zf), (xv + 0.75, FLOOR + 1.3, zf), (xv + 0.75, FLOOR + 1.5, zf), (xv + 0.55, FLOOR + 1.5, zf)], "picto_misc", 4),
                                         ([(xv + 0.78, FLOOR + 1.3, zf), (xv + 0.95, FLOOR + 1.3, zf), (xv + 0.95, FLOOR + 1.5, zf), (xv + 0.78, FLOOR + 1.5, zf)], "picto_misc", 3)], "steel_dark")
        out.append(d)
        pl, pd = ic.maker_plate("4-218", (xv + 0.75, FLOOR + 1.62, WZ0 - 0.098), 180.0, name=f"v{tag}_plate")
        ic.transform([pl] + ([pd] if pd else []), Matrix.Translation(B((xv + 0.75, FLOOR + 1.62, zf))) @ Matrix.Scale(0.6, 4) @ Matrix.Translation(-B((xv + 0.75, FLOOR + 1.62, zf))))
        out.append(pl)
        if pd is not None: out.append(pd)
    elif kind == "cable":
        # a cable has slipped from the south tray and sags over the rack (it stays over the bank: nothing enters the walkway)
        zc = mz(GZ0 + 0.52, True); ty = FLOOR + 3.3
        pts = []
        for i in range(9):
            t = i / 8.0; x = x0 + 0.5 + 2.6 * t
            pts.append((x, ty - 1.25 * math.sin(math.pi * t) ** 1.3, zc - 0.5 * math.sin(math.pi * t)))
        out.append(ic.tube(f"v{tag}_sag", pts, 0.04, 5, "m_pellam", "cable", "cable", mpr=0.8))
    for o in out: o["lm"] = False
    return out


# ====================================================================================================== ends, baffle, knots
def build_gallery_fixed(rng):
    # ---- the baffle wall at x -59 (1 m thick), opening 3 x 3 m; the lamp bar over the door is the prop's
    bx0, bx1 = -59.5, -58.5
    rows = [FLOOR, FLOOR + 1.2, FLOOR + 2.4, FLOOR + 3.0, FLOOR + 3.6, FLOOR + 4.8, CEIL]
    hole = lambda uc, vc: WZ0 < uc < WZ1 and vc < FLOOR + 3.0
    add(ic.surface("baffle_w", (bx0, 0, 0), (0, 0, 1), (0, 1, 0), cuts(GZ0, GZ1, 1.2, [WZ0, WZ1]), rows, "m_pellam", "panel", W_END, vbase=FLOOR, skip=hole, lm=True))
    add(ic.surface("baffle_e", (bx1, 0, 0), (0, 0, -1), (0, 1, 0), cuts(-GZ1, -GZ0, 1.2, [-WZ1, -WZ0]), rows, "m_pellam", "panel", W_END, vbase=FLOOR, skip=lambda uc, vc: hole(-uc, vc), lm=True))
    rv = [[(bx0, FLOOR, WZ0), (bx1, FLOOR, WZ0), (bx1, FLOOR + 3, WZ0), (bx0, FLOOR + 3, WZ0)], [(bx0, FLOOR, WZ1), (bx0, FLOOR + 3, WZ1), (bx1, FLOOR + 3, WZ1), (bx1, FLOOR, WZ1)],
          [(bx0, FLOOR + 3, WZ0), (bx1, FLOOR + 3, WZ0), (bx1, FLOOR + 3, WZ1), (bx0, FLOOR + 3, WZ1)]]
    add(ic.from_faces("baffle_reveal", rv, "m_pellam", "steel", "steel", toward=(-59, FLOOR + 1.5, -14), lm=True, mpr=3.6))
    add(ic.surface("baffle_sill", (0, FLOOR + 0.002, 0), (1, 0, 0), (0, 0, -1), [bx0, bx1], [-WZ1, -WZ0], "m_pellam", "steel", "steel_dark", row=3.0, vbase=-WZ1, lm=True))
    for e, x in enumerate((bx0 - 0.05, bx1)):                          # steel portal frames, 0.2 m wide, on both faces; hazard diagonals on the jambs
        fr = [((x, FLOOR, WZ0 - 0.2), (x + 0.05, FLOOR + 3.2, WZ0)), ((x, FLOOR, WZ1), (x + 0.05, FLOOR + 3.2, WZ1 + 0.2)), ((x, FLOOR + 3.0, WZ0), (x + 0.05, FLOOR + 3.2, WZ1))]
        for j, (lo, hi) in enumerate(fr):
            add(ic.box(f"baffle_frame_{e}_{j}", lo, hi, "m_pellam", "steel", "steel", bevel=0.02, drop=("x+" if e == 0 else "x-") + (" y-" if j < 2 else ""), tess=0.8, mpr=3.6))
        xf = x - 0.003 if e == 0 else x + 0.053
        for j, (za, zb) in enumerate(((WZ0 - 0.19, WZ0 - 0.01), (WZ1 + 0.01, WZ1 + 0.19))):
            add(ic.from_faces(f"baffle_hazard_{e}_{j}", [[(xf, y, z) for z, y in ic.diagonal_band(za, FLOOR + 0.4, zb, FLOOR + 1.6, 0.3, up=(j == 0))]], "m_pellam", "hazard", None, away_from=(-59, FLOOR + 1, (za + zb) / 2)))
    # pipe escutcheons where the two big pipes pass through the wall
    for e, x in enumerate((bx0 - 0.03, bx1)):
        for south in (False, True):
            for k in range(2):
                r, z, y, sg = PIPES[k]; zz = mz(z, south)
                add(ic.box(f"baffle_esc_{e}_{int(south)}_{k}", (x, y - r - 0.1, zz - r - 0.1), (x + 0.03, y + r + 0.1, zz + r + 0.1), "m_pellam", "steel", None, bevel=0.012, drop="x+" if e == 0 else "x-"))
    # ---- the violet hairline under the baffle door: 2 cm x 3 m (lamp set, violet, participates in wrong_fade)
    yh = FLOOR + 0.006
    hair = [[B(p) for p in ((-59.01, yh, WZ0), (-59.01, yh, WZ1), (-58.99, yh, WZ1), (-58.99, yh, WZ0))]]
    # ---- the far door wall at x -19 (the gallery's east end) and its reveal through to x -18
    add(ic.surface("far_wall", (-19.0, 0, 0), (0, 0, 1), (0, 1, 0), cuts(GZ0, GZ1, 1.2, [WZ0, WZ1]), rows, "m_pellam", "panel", W_END, vbase=FLOOR, skip=hole, lm=True))
    rv2 = [[(-19, FLOOR, WZ0), (-18, FLOOR, WZ0), (-18, FLOOR + 3, WZ0), (-19, FLOOR + 3, WZ0)], [(-19, FLOOR, WZ1), (-19, FLOOR + 3, WZ1), (-18, FLOOR + 3, WZ1), (-18, FLOOR, WZ1)],
           [(-19, FLOOR + 3, WZ0), (-18, FLOOR + 3, WZ0), (-18, FLOOR + 3, WZ1), (-19, FLOOR + 3, WZ1)]]
    add(ic.from_faces("far_reveal", rv2, "m_pellam", "steel", "steel", toward=(-18.5, FLOOR + 1.5, -14), lm=True, mpr=3.6))
    add(ic.surface("far_sill", (0, FLOOR + 0.002, 0), (1, 0, 0), (0, 0, -1), [-19.0, -18.0], [-WZ1, -WZ0], "m_pellam", "steel", "steel_dark", row=3.0, vbase=-WZ1, lm=True))
    fr = [((-19.05, FLOOR, WZ0 - 0.2), (-19.0, FLOOR + 3.2, WZ0)), ((-19.05, FLOOR, WZ1), (-19.0, FLOOR + 3.2, WZ1 + 0.2)), ((-19.05, FLOOR + 3.0, WZ0), (-19.0, FLOOR + 3.2, WZ1))]
    for j, (lo, hi) in enumerate(fr):
        add(ic.box(f"far_frame_{j}", lo, hi, "m_pellam", "steel", "steel", bevel=0.02, drop="x+" + (" y-" if j < 2 else ""), tess=0.8, mpr=3.6))
    for south in (False, True):
        for k in range(2):
            r, z, y, sg = PIPES[k]; zz = mz(z, south)
            add(ic.box(f"far_esc_{int(south)}_{k}", (-19.03, y - r - 0.1, zz - r - 0.1), (-19.0, y + r + 0.1, zz + r + 0.1), "m_pellam", "steel", None, bevel=0.012, drop="x+"))
    # ---- the west end of each bank: a ceramic header cabinet the pipes run into (louvre, plate, asset number)
    for south in (False, True):
        s = "s" if south else "n"
        z0c, z1c = sorted((mz(GZ0, south), mz(WZ0 - 0.02, south)))
        # fix pass 1: the cabinet beside the proving step was vertex-lit pale enamel under the mark lamp: near white, with the
        # louvre's and the plate's contact shadows smeared 0.3 m across it, and the cable tray's black end hanging in the
        # air over it. It is lightmapped now, in the shadowed panel tint, and stands 3.25 m: the tray dies into its top.
        add(ic.box(f"header_{s}", (-81.0, FLOOR, z0c), (-80.3, FLOOR + 3.25, z1c), "m_pellam", tuple(ic.mix("enamel_stain", "steel", 0.86)), "panel", bevel=0.02, drop="y-" + (" z-" if not south else " z+"), lm=True, mpr=3.6, fit='metric'))
        add(ic.box(f"header_kick_{s}", (-81.01, FLOOR, z0c - (0 if not south else 0.0)), (-80.29, FLOOR + 0.3, z1c + 0.0), "m_pellam", "steel", "steel", bevel=0.0, drop="y- y+" + (" z-" if not south else " z+"), tess=0.7, mpr=3.6))
        zc = (z0c + z1c) / 2; xw = -81.004
        items = [([(xw, FLOOR + 2.2, zc - 0.45), (xw, FLOOR + 2.2, zc + 0.45), (xw, FLOOR + 2.65, zc + 0.45), (xw, FLOOR + 2.65, zc - 0.45)], "louvre", None, "steel_dark")]
        dec.append(ic.decals(f"header_decals_{s}", items, "steel_dark"))
        add(ic.band(f"header_band_{s}", [(-81.0, z0c), (-81.0, z1c)], FLOOR + 1.2))
        pl, pd = ic.maker_plate("4-20" + ("2" if south else "1"), (-81.004, FLOOR + 1.55, zc), 90.0, name=f"header_plate_{s}")
        add(pl)
        if pd is not None: dec.append(pd)
    # ---- the three knot seats, on the line from the eye (the brass mark) through knot_a, knot_b, knot_c
    eye = Vector(layout.marker("pz_proving_mark")["params"]["eye"])
    seat_back = 0.10                                                   # knot_mech sits 0.08 x 1.25 behind its marker
    ka = Vector(layout.marker("knot_a")["pos"]); kb = Vector(layout.marker("knot_b")["pos"]); kc = Vector(layout.marker("knot_c")["pos"])
    line = (kc - eye).normalized()
    def seat(tag, k, radius=0.3, depth=0.06):
        """A flange disc facing back down the line, its face `seat_back` behind the marker."""
        c = k + line * seat_back
        ob = ic.cyl(f"seat_{tag}", tuple(c), tuple(c + line * depth), radius, 12, "m_pellam", "steel_dark", None, cap=True)
        add(ob); return c + line * depth
    # knot_a: a pipe elbow arching out of the north bank's top pipe, ending in a blank flange
    ca = seat("a", ka)
    r3, z3, y3, _ = PIPES[2]
    xa = ca.x + 0.75
    cen = (xa - 0.6 + 0.0, ca.y, ca.z - 0.6)                           # arc centre: the elbow turns from +z to -x with a true 0.6 m radius
    start = (xa, ca.y, ca.z - 0.6); end = (xa - 0.6, ca.y, ca.z)
    pts = [(xa, y3, z3), (xa, ca.y, z3 + 0.12)] + ic.arc3(cen, start, end, 6) + [tuple(ca)]
    add(ic.tube("elbow_a", pts, r3, 8, "m_pellam", "steel", "steel", tess=0.6, mpr=3.6))
    add(ic.cyl("elbow_a_tee", (xa - 0.16, y3, z3), (xa + 0.16, y3, z3), r3 + 0.035, 8, "m_pellam", "steel_dark", None, cap=True))
    add(ic.cyl("elbow_a_neck", tuple(ca - line * 0.0), tuple(ca + line * 0.1), r3 + 0.04, 8, "m_pellam", "steel", None, cap=False))
    # knot_b: a cross pipe wall to wall above the banks, with a valve whose bonnet faces the mark
    cb = seat("b", kb, radius=0.3, depth=0.07)
    xb = cb.x + 0.22
    add(ic.cyl("cross_b", (xb, kb.y, GZ0), (xb, kb.y, GZ1), 0.175, 10, "m_pellam", "enamel", "panel_rib", cap=False, tess=0.9, mpr=3.6))
    add(ic.box("valve_b", (xb - 0.27, kb.y - 0.3, kb.z - 0.3), (xb + 0.27, kb.y + 0.3, kb.z + 0.3), "m_pellam", "steel", None, bevel=0.03, tess=0.5))
    add(ic.cyl("valve_b_stem", (xb, kb.y + 0.28, kb.z), (xb, kb.y + 0.62, kb.z), 0.07, 8, "m_pellam", "steel_dark", None))
    for e, z in enumerate((kb.z - 0.42, kb.z + 0.42)):
        add(ic.cyl(f"valve_b_flange_{e}", (xb, kb.y, z - 0.035), (xb, kb.y, z + 0.035), 0.26, 10, "m_pellam", "steel", None))
    for e, z in enumerate((GZ0 + 0.02, GZ1 - 0.05)):
        add(ic.box(f"cross_b_esc_{e}", (xb - 0.3, kb.y - 0.3, z), (xb + 0.3, kb.y + 0.3, z + 0.03), "m_pellam", "steel", None, bevel=0.012, drop="z-" if e == 0 else "z+"))
    # knot_c: a conduit box hung from the ceiling on the baffle wall, right of the door; conduit runs to the ceiling
    cc = seat("c", kc, radius=0.3, depth=0.04)
    add(ic.box("box_c", (cc.x - 0.02, kc.y - 0.42, kc.z - 0.42), (bx0, CEIL, kc.z + 0.42), "m_pellam", "enamel", None, bevel=0.02, drop="y+ x+", tess=0.5))
    add(ic.box("box_c_conduit", (cc.x + 0.1, CEIL - 0.08, GZ0), (cc.x + 0.22, CEIL, kc.z - 0.42), "m_pellam", "steel", None, bevel=0.01, drop="y+ z-", tess=0.9))
    add(ic.band("box_c_band", [(cc.x - 0.02, kc.z - 0.42), (cc.x - 0.02, kc.z + 0.42)], CEIL - 0.25, height=0.06))
    return hair


# ====================================================================================================== main
def copy_module(objs, dx, suffix):
    out = []
    for o in objs:
        d = bpy.data.objects.new(f"{o.name}_{suffix}", o.data.copy()); scene.link(d)
        d.data.transform(Matrix.Translation((dx, 0, 0)))
        for k in o.keys(): d[k] = o[k]
        if o.name in ic.LM_FACES: ic.LM_FACES[d.name] = ic.LM_FACES[o.name]
        out.append(d)
    return out


def dressing(pegs, rng):
    """Coats (wind 1; exactly ONE with wind 0), hats and paired boots on the peg rails. About one high peg in five is
    empty; nothing hangs on, above or under the low rail but hats on the high pegs over it."""
    n = 0
    high = [p for p in pegs if p[2] == "high"]
    low_spans = [p for p in pegs if p[2] == "low"]
    def over_low(p):
        return any(abs(p[0][0] - q[0][0]) < 0.25 and abs(p[0][2] - q[0][2]) < 0.25 for q in low_spans)
    coats = ["coat_long", "coat_short", "coat_shawl"]
    still_done = False; count = {"coat": 0, "hat": 0, "boots": 0}
    for i, (tip, nrm, cls, fl, ground) in enumerate(high):
        r = rng.random()
        rot = math.atan2(nrm[0], nrm[1])
        if over_low(high[i]):
            if r < 0.45 and count["hat"] < 24:
                n += 1; zone.dressing_empty('inst', n, "prop_hat_hung", loc=layout.to_blender(tip), rot_z=rot); count["hat"] += 1
            continue
        if r < 0.2: continue                                           # one peg in five is empty
        if r < 0.62 and count["coat"] < 36:
            n += 1; node = coats[int(rng.random() * 3) % 3]
            wind = 1
            if not still_done and fl == 2 and count["coat"] >= 9: wind = 0; still_done = True; node = "coat_long"
            zone.dressing_empty('inst', n, "prop_coat_hung", node=node, loc=layout.to_blender(tip), rot_z=rot, wind=wind); count["coat"] += 1
            if rng.random() < 0.45 and count["boots"] < 15:
                n += 1
                zone.dressing_empty('inst', n, "prop_boots_pair", loc=layout.to_blender((tip[0] + nrm[0] * 0.05, ground, tip[2] + nrm[1] * 0.05)), rot_z=rot + rng.uniform(-0.3, 0.3)); count["boots"] += 1
        elif count["hat"] < 24:
            n += 1; zone.dressing_empty('inst', n, "prop_hat_hung", loc=layout.to_blender(tip), rot_z=rot); count["hat"] += 1
    if not still_done: raise RuntimeError("dressing: no still coat was placed")
    print(f"DRESSING {count} on {len(high)} high pegs; {len(low_spans)} low pegs bare")


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    rng = scene.rng(args.seed)
    t0 = time.perf_counter()
    pegs, stair_strips = build_stair(rng)
    mark_lamp = build_bay(rng)
    hair = build_gallery_fixed(rng)
    # ---- the two module bakes and their variant parts, built where they are baked
    lit, dark = [], []
    build_module(LIT_SLOT, "L", lit); build_module(DARK_SLOT, "D", dark)
    var_lit = {k: variant_parts(LIT_SLOT, k, k) for k in ("panel_off", "valve", "cable")}
    for k in var_lit: var_lit[k] = [o for o in var_lit[k]]
    dummies = []
    for x in (LIT_SLOT - 2 * MOD, LIT_SLOT - MOD, LIT_SLOT + MOD, DARK_SLOT + MOD, DARK_SLOT + 2 * MOD):
        dummies += copy_module(lit, x - LIT_SLOT, "dummy%d" % int(x * 10))
    # ---- paint
    base = parts + lit + dark
    vparts = [o for k in var_lit for o in var_lit[k]]
    vdec = [o for o in vparts if material.names(o) == ["m_mask"]]
    vgeo = [o for o in vparts if o not in vdec]
    ic.paint(base + vgeo, gradient=(0.97, 1.03), jitter=0.0, seed=args.seed, ao_strength=0.5, ao_distance=0.5)
    for o in dec + vdec:
        if "Tint" in o.data.color_attributes: ic.flat_paint(o)
    for o in dummies:
        if "Color" not in o.data.color_attributes: vcol.fill_color(o, (0.5, 0.5, 0.5))
    # ---- lights (mood L3)
    bake.use_cycles('CPU', samples=64); bake.set_world((0, 0, 0), 0.0)
    L = []
    def strip_lights(x0, tag):
        c = (x0 + 1.8, CEIL - 0.04, -14.0)
        wide = ic.area_light(f"strip_{tag}", c, (c[0], FLOOR, c[2]), WIDE_C, 1.2, 0.1, energy=60.0, spread_deg=170.0, euler=(0, 0, 0))
        streak = ic.area_light(f"streak_{tag}", c, (c[0], FLOOR, c[2]), CORE_C, 3.3, 0.12, energy=30.0, spread_deg=38.0, euler=(0, 0, 0))
        return [wide, streak]
    slots = [LIT_SLOT - 2 * MOD, LIT_SLOT - MOD, LIT_SLOT, LIT_SLOT + MOD, DARK_SLOT + MOD, DARK_SLOT + 2 * MOD]
    mods = {x: strip_lights(x, "m%d" % i) for i, x in enumerate(slots)}
    one = mods[LIT_SLOT]
    ic.set_reading(one[0], (LIT_SLOT + 1.8, FLOOR + 1.5, GZ0 + 0.05), (0, 0, 1), 0.11, group=[one[0]])
    r_w = float(ic.probe((LIT_SLOT + 1.8, FLOOR, -14.0), (0, 1, 0), lights=[one[0]]).max())
    r = ic.set_reading(one[1], (LIT_SLOT + 1.8, FLOOR, -14.0), (0, 1, 0), 1.2, group=[one[1]])
    for x, (w, s) in mods.items(): w.data.energy = one[0].data.energy; s.data.energy = one[1].data.energy
    print(f"CALIBRATED gallery strip: wall behind the pipes at 1.5 m reads 0.11 from the strip; the floor streak under it reads {r + r_w:.2f} (smear {r:.2f} + strip {r_w:.2f})")
    stair_l = []
    for k, (p, n) in enumerate(stair_strips):
        q = (p[0] + n[0] * 0.05, p[1], p[2] + n[2] * 0.05)
        l = ic.area_light(f"stair_strip_{k}", q, (q[0] + n[0] * 2 , q[1] - 2.2, q[2] + n[2] * 2), "#7CF2E2", 1.2, 0.1, energy=40.0, spread_deg=170.0, radius=9.0, power=1.5)
        stair_l.append(l)
    # the second strip's pool: the bare low pegs across the stair (west wall of flight 2) must sit in it
    r = ic.set_reading(stair_l[1], (-86.95, stair_height(2, -29.0) + 0.9, -29.0), (1, 0, 0), 0.9, group=[stair_l[1]])
    for l in stair_l: l.data.energy = stair_l[1].data.energy
    print(f"CALIBRATED stair strip 2: the wall at the low pegs reads {r:.2f} (target 0.9)")
    bay_l = [ic.area_light(f"bay_strip_l{k}", (bx, CEIL - 0.06, bz), (bx, FLOOR, bz), "#7CF2E2", 1.2, 0.1, energy=40.0, spread_deg=150.0, radius=8.5, power=1.3, euler=(0, 0, 0)) for k, (bx, bz) in enumerate(BAY_STRIPS)]
    r = ic.set_reading(bay_l[0], (BAY_STRIPS[0][0], FLOOR, BAY_STRIPS[0][1]), (0, 1, 0), 0.6, group=[bay_l[0]]); bay_l[1].data.energy = bay_l[0].data.energy
    print(f"CALIBRATED bay strips: the floor under one reads {r:.2f} (target 0.6; the mark's lamp is the brighter)")
    ml = ic.area_light("mark_lamp_light", (mark_lamp[0], CEIL - 0.09, mark_lamp[2]), (mark_lamp[0], FLOOR, mark_lamp[2]), "#E6FFFB", 0.44, 0.44, energy=80.0, spread_deg=50.0, euler=(0, 0, 0))      # fix pass 1: a 50 degree cone: the pool is the step and the floor round it, not the cabinet's face
    r = ic.set_reading(ml, (mark_lamp[0] - 0.9, FLOOR, mark_lamp[2] + 0.7), (0, 1, 0), 1.5)
    print(f"CALIBRATED the steady lamp over the mark: the floor beside the step reads {r:.2f} (target 1.5; brighter than a strip's streak)")
    # an up-facing strip cannot light the floor it lies on: the spill is a lamp just above the hairline, facing down
    vio = ic.area_light("violet_spill", (-59.0, FLOOR + 0.22, -14.0), (-59.0, FLOOR, -14.0), "#B24BFF", 0.05, 3.0, energy=5.0, spread_deg=180.0, radius=0.7, power=1.0, euler=(0, 0, 0))
    r = ic.set_reading(vio, (-59.25, FLOOR + 0.002, -14.0), (0, 1, 0), 0.5)
    print(f"CALIBRATED violet hairline: the sill 0.25 m from the strip reads {r:.2f} (target 0.5), nothing beyond 0.6 m")
    warm_l = []
    for name, pos, to, probe_at in WARM:
        l = ic.area_light(f"warm_{name}", pos, to, SODIUM, 0.6, 0.1, energy=30.0, spread_deg=170.0, radius=5.0, power=1.4)
        r = ic.set_reading(l, probe_at, (0, 1, 0), WARM_T)
        print(f"CALIBRATED sodium practical '{name}': the floor in front of it reads {r:.2f} (target {WARM_T}); reach 5 m")
        warm_l.append(l)
    # the valve station's gauge lamp: lights the station's own (vertex-lit) parts only; the module's lightmap is shared
    xv = LIT_SLOT + 1.75
    gauge_l = ic.point_light("gauge_lamp", (xv + 0.75, FLOOR + 1.9, WZ0 + 0.12), SODIUM, 2.6, energy=10.0, size=0.1, power=1.4)
    r = ic.set_reading(gauge_l, (xv + 0.75, FLOOR + 1.4, WZ0 - 0.09), (0, 0, 1), GAUGE_T)
    print(f"CALIBRATED valve station gauge lamp: the panel's face reads {r:.2f} (target {GAUGE_T})")
    gauge_l.hide_render = True
    # ---- unwrap + bake
    everything = parts + emb + dec + lit + dark + vparts
    ic.unwrap(everything + emi, LM)
    lm_objs = [o for o in everything if ic.is_lm(o)]
    vl_objs = [o for o in everything if ic.is_vl(o) and o not in vparts]
    for o in vparts: o.hide_render = True                               # a variant's parts must not shadow the bake that every module shares
    # pass 3: the stair is lit by ambient x AO almost alone, and its treads are 12 texels deep: at the common 48 AO samples
    # and 64 lamp samples they came out smudged; this zone bakes both at 160
    _ao = ic._ao_image
    ic._ao_image = lambda objs, tid, dist, spp: _ao(objs, tid, dist, spp if ic.DRAFT else 160)
    _, t_lm = ic.bake_lightmap(lm_objs, LM, AMBIENT, ao_distance=3.0, samples=None if ic.DRAFT else 160)
    t_vl = ic.bake_vertex(vl_objs, AMBIENT, ao_distance=3.0)
    for o in vparts: o.hide_render = False
    gauge_l.hide_render = False
    t_vl += ic.bake_vertex(vparts, AMBIENT, ao_distance=3.0)
    gauge_l.hide_render = True
    print(f"BAKED {LM} {t_lm:.1f}s, vertex light {sum(len(o.data.polygons) for o in vl_objs)} faces {t_vl:.1f}s; ambient at an open floor {AMBIENT.max():.2f}; build {time.perf_counter() - t0:.1f}s")
    ic.remove(dummies)
    ic.weld_colors(everything)
    # ---- copies: the lit bake everywhere but under a flickering strip; variant parts ride with their modules
    placed = []
    steady, flick = [], []
    for x in WEST + EAST:
        src, base_x = (dark, DARK_SLOT) if x in FLICKER else (lit, LIT_SLOT)
        if abs(x - base_x) < 1e-6: mod = list(src)
        else: mod = copy_module(src, x - base_x, "c%d" % int(round(x * 10)))
        kind = VARIANT.get(x)
        if kind:
            mod += copy_module(var_lit[kind], x - LIT_SLOT, "c%d" % int(round(x * 10)))
            if kind == "panel_off":                                    # take the wall panel out
                for o in mod:
                    if "_wall_n" in o.name:
                        mesh.delete_faces(o, lambda f, c, n, x=x: x + 1.2 < c.x < x + 2.4 and FLOOR + 2.4 < c.z < FLOOR + 3.6)
        placed += mod
        (flick if x in FLICKER else steady).append(strip_poly(x))
    if LIT_SLOT not in (WEST + EAST) or DARK_SLOT not in FLICKER: raise RuntimeError("the bake slots must be real modules")
    ic.remove([o for k in var_lit for o in var_lit[k]])
    emi.append(ic.emis("strips_steady", steady, "aqua"))
    gq = []
    for x, kind in VARIANT.items():
        if kind != "valve": continue
        xg = x + 1.75; zf = WZ0 - 0.097
        gq.append([(xg + 0.56, FLOOR + 1.67, zf), (xg + 0.94, FLOOR + 1.67, zf), (xg + 0.94, FLOOR + 1.72, zf), (xg + 0.56, FLOOR + 1.72, zf)])
    emi.append(ic.emis("gauge_lamps", gq, "flame"))
    for pg in emi[-1].data.polygons:
        if pg.normal.dot(ic.Bd((0, 0, 1))) < 0: emi[-1].data.flip_normals(); break
    final = parts + emb + dec + placed + emi
    emb_tris = ic.tris(emb)
    counts = zone.assign_chunks(final, ASSET)
    merged = zone.merge_chunks(ASSET)
    ct = ic.chunk_tris(merged)
    print("CHUNKS " + ", ".join(f"{k} {v}" for k, v in sorted(ct.items())))
    plan = {c["id"]: c["tris"] for c in manifest.asset(ASSET)["chunks"]}
    reserve = {"chunk_gl_bay": int(sum(manifest.asset(k)["triBudget"] * n for k, n in RESERVE.items())) - emb_tris}
    for c, t in ct.items():
        if t + max(0, reserve.get(c, 0)) > plan[c]: raise RuntimeError(f"{c}: {t} triangles (+ {reserve.get(c, 0)} reserved for final embedded props) > its share {plan[c]}")
    fl = zone.lamp_set("strip_flicker", [[[B(p) for p in poly] for poly in flick]], colour="aqua", intensity=1.0, flicker_group=0.5)
    vh = zone.lamp_set("violet_hairline", [hair], colour="violet", intensity=1.0, wrong_fade=1.0)
    fl["emit_strength"] = 0.0; vh["emit_strength"] = 0.0
    vh["thin_ok"] = 9.0                                               # the order asks for 2 cm x 3 m: a glowing hairline, read from the bay as a line of light
    ic.snap_positions(list(merged.values()) + [fl, vh])
    ic.vertex_report(list(merged.values()))
    dressing(pegs, rng)
    export.export_asset(ASSET, args.out, blend=args.blend)


if __name__ == "__main__":
    scene.run(main)
