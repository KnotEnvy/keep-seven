"""env_far_rim: the coda (docs/workorders/art-env-exterior.md 4.4): the ledge on the roof of the overhang at blue hour.

A ledge of rock and drifted sand at y 18; the black rock frame round the cage's 3 x 3 m opening (the overhang's mouth
mirrored: a layered lintel, the notch upper RIGHT, a fallen slab lower LEFT, so the last image answers the first); a
natural rock shelf at the north-west edge carrying the stone, its six spent banded cases and the note; two foreground
boulders; the broken lip and the drop to the plain. Its own bake: mood L6 (no sun; the sky dome from above, the
violet-grey ambient), lightmap lm_rim 512 x 512.

    node tools/build-assets.mjs --only env_far_rim
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _d)
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
import math, random
import bpy
from lib import scene, layout, manifest, bake, vcol, zone as zonelib, export
import ext_kit as kit
import ext_rock as rock
import ext_frontier as fr
from ext_kit import Part, lin, mix, mul, clamp, smooth, fbm, vnoise, row_uv, flat_uv, sand_uv, FT

ASSET = "env_far_rim"
LM = "lm_rim"
Z = "rim"
FAST = os.environ.get("KS_EXT_FAST") == "1"
SOL = {s["id"]: s for s in layout.solids("far_rim")}
FLOOR = SOL["rim_floor"]["pos"][1] + SOL["rim_floor"]["size"][1] / 2            # 18
ZENITH = "#A9B8E0"; HORIZON = "#4A5A96"
KEY, AMBIENT = 0.75, 0.50
STONE = layout.marker("ia_stone_round")
ROT = 20.0


# ---------------------------------------------------------------------------------------------------------- the ledge
def _sites():
    rng = random.Random(907)
    out = []
    for i in range(-1, 12):
        for j in range(-1, 5):
            out.append((-3.0 + i * 3.1 + rng.uniform(-1.1, 1.1), 99.0 + j * 3.0 + rng.uniform(-1.0, 1.0), rng.choice((0.0, 0.05, 0.1, 0.15)), rng.uniform(0.84, 1.08)))
    return out


SITES = _sites()


def plate(x, z):
    """The caprock is a pavement of thin plates: (height of the plate here, 0..1 how far inside a plate, its tone)."""
    best = sorted(((s[0] - x) ** 2 + (s[1] - z) ** 2, s) for s in SITES)[:2]
    d1 = math.sqrt(best[0][0]); d2 = math.sqrt(best[1][0])
    w = smooth((d2 - d1) / 0.4)
    h1 = best[0][1][2]; h2 = best[1][1][2]
    return (h1 + h2) / 2 + (h1 - (h1 + h2) / 2) * w, w, best[0][1][3]


def ledge_y(x, z):
    """The walked ledge: the layout's floor as a pavement of caprock plates (steps of 3-10 cm, ramped), sand lying
    deeper toward the cliff's foot."""
    back = clamp((z - 108.6) / 2.4)
    # in front of the cage's opening the rock is level with the cage floor (no sill, no crack to see the plain through)
    door = smooth((x - 11.3) / 0.9) * smooth((16.7 - x) / 0.9) * smooth((z - 109.6) / 1.2)
    return FLOOR + (plate(x, z)[0] * (1.0 - 0.7 * back) + 0.012 * fbm(x / 2.0, z / 2.0, 3, 2) + 0.16 * back ** 2) * (1.0 - door)


# polish round 2: the game shows the blue hour at exposure 1.8 (src/render/moods.ts L6), so the ledge's pale caprock and
# sand read as a blank near-white sheet (shots/r2-visual/static_low/A_cp_rim.png). Everything pale on the ledge is held
# to LEDGE_K of its old albedo: the walked surface lands at L* 45-50 in the game, between the rock and the sky.
LEDGE_K = 0.31                                   # polish round 3: 0.46 displayed L* 40 (the frame's mid tone, as the far land is); the walked ledge is now the dark foreground, about L* 30
ROCK_DARK = 0.34                                 # polish round 3: loose rock on the ledge, against its round-2 albedo


def ledge_colour(x, z):
    """Sand lying over a pavement of caprock (m_sand: the ripples): dust-grey sand in the joints and toward the cliff's
    foot, the plates' own darker stone where the wind keeps them swept, a damp-dark band under the cliff (the AO the
    512 px lightmap is too coarse to hold), paler at the worn lip."""
    h, w, tone = plate(x, z)
    cap = mul(mix(mix(lin("rock_cap"), lin("rock"), 0.35), lin("ash"), 0.3), tone * (0.9 + 0.2 * vnoise(x / 2.3, z / 2.3, 5)))
    sandc = mul(mix(lin("sand"), lin("ash"), 0.3), 0.9 + 0.25 * fbm(x / 3.7, z / 2.9, 31, 2))
    k = clamp(0.55 * (1.0 - w) + smooth((z - 108.3) / 2.2) + 0.7 * smooth((vnoise(x / 5.0, z / 3.5, 17) - 0.5) / 0.2))
    c = mix(cap, sandc, 0.85 * k)
    foot = 1.0 - 0.3 * smooth((z - 109.2) / 1.9)                          # under the cliff
    lip = 1.0 + 0.12 * smooth((101.6 - z) / 1.2)                          # the worn edge
    patch = 0.86 + 0.28 * vnoise(x / 6.5 + 3.0, z / 4.5, 41)              # broad, soft: cloud-coloured dust
    c = mul(c, LEDGE_K * foot * lip * patch)
    # polish round 4: the last half metre of the lip is swept bare and holds the afterglow: a warm rim along the
    # ledge's broken edge, between the dark sand she stands on and the dark land below
    e = smooth((edge_z(x) + 0.75 - z) / 0.75)
    return mix(mul(c, 1.0 + 1.5 * e), mul(SHEEN, kit.vlen(c) * 2.3), 0.4 * e)


def darken(part, start, k):
    """Multiply the final colours of the faces of `part` from index `start` by k."""
    for i in range(start, len(part.f)):
        idx, mat, uv0, col, ch, st, fin = part.f[i]
        part.f[i] = (idx, mat, uv0, [mul(c, k) for c in col], ch, st, fin)


SHEEN = (0.62, 0.30, 0.24)                       # what the afterglow leaves on a stone's top (linear, before the bake's light)


def sheen(part, start, k=2.3, warm=0.34, lo=0.55):
    """Polish round 4 (the last image: "give the near ledge a rim-lit edge"): the faces of `part` (from index `start`)
    that look UP hold the afterglow as a thin warm sheen, their sides stay the dark they were: every loose stone on the
    ledge is a dark shape with a lit top edge against the land below, instead of one brown lump."""
    for i in range(start, len(part.f)):
        idx, mat, uv0, col, ch, st, fin = part.f[i]
        a, b, c = part.v[idx[0]], part.v[idx[1]], part.v[idx[2]]
        n = kit.vcross(kit.vsub(b, a), kit.vsub(c, a)); l = kit.vlen(n) or 1.0
        up = n[1] / l
        t = smooth((up - lo) / (0.95 - lo))
        if t <= 0.0: continue
        part.f[i] = (idx, mat, uv0, [mix(mul(cc, 1.0 + (k - 1.0) * t), mul(SHEEN, kit.vlen(cc) * k), warm * t) for cc in col], ch, st, fin)


def _edge_blocks():
    rng = random.Random(411)
    out = []; x = -1.5
    while x < 29.5:
        out.append((x, rng.choice((0.0, 0.14, 0.3, 0.42, 0.55))))
        x += rng.uniform(1.4, 3.6)
    return out


EDGE = _edge_blocks()


def edge_z(x):
    """The broken north edge: the caprock has come away block by block (z of the edge at x)."""
    off = EDGE[0][1]
    for (x0, o) in EDGE:
        if x >= x0: off = o
    return 100.2 + off


def build_ledge(S):
    p = Part("rim_ledge", Z, smooth=40)
    ch_s = kit.chart("rim_ledge_top", 1.0)
    steps = [b[0] for b in EDGE[1:]]
    xs = sorted(set(fr.breaks(-1.5, 29.5, 0.95) + [round(s - 0.11, 3) for s in steps] + [round(s + 0.11, 3) for s in steps]))
    xs = [x for k, x in enumerate(xs) if k == 0 or x - xs[k - 1] > 0.02]
    zrows = [None, 101.3, 102.2, 103.1, 104.0, 104.9, 105.8, 106.7, 107.6, 108.5, 109.4, 110.3, 111.3]
    vid = {}

    def v(i, j):
        if (i, j) not in vid:
            x = xs[i]; z = edge_z(x) if j == 0 else zrows[j]
            y = ledge_y(x, z) - (0.03 if j == 0 else 0.0)
            vid[(i, j)] = (p.vert((x, y, z)), (x, y, z))
        return vid[(i, j)]
    for i in range(len(xs) - 1):
        for j in range(len(zrows) - 1):
            q = [v(i, j), v(i, j + 1), v(i + 1, j + 1), v(i + 1, j)]
            pts = [a[1] for a in q]
            p.face([a[0] for a in q], "m_sand", [sand_uv(a) for a in pts], [ledge_colour(a[0], a[2]) for a in pts], ch_s, [(a[0], a[2]) for a in pts], final=True)
    # the edge: the caprock's broken face (two beds, the lower undercut), then the drop
    lip = Part("rim_lip", Z, smooth=28)
    rows = [(0.0, 0.0), (-0.3, -0.06), (-0.34, 0.1), (-0.68, 0.07), (-0.72, -0.1), (-0.94, -0.12)]          # (dy, dz: negative = out over the drop)
    cols_ = []
    for i, x in enumerate(xs):
        top = v(i, 0)[1]; col = []
        for (dy, dz) in rows:
            z = max(100.03, top[2] + dz + (0.05 * fbm(x / 1.7, dy * 3.0, 7, 2) if dy < 0 else 0.0))
            col.append((lip.vert((x, top[1] + dy, z)) if dy < 0 else lip.vert(top), (x, top[1] + dy, z)))
        cols_.append(col)
    for i in range(len(xs) - 1):
        for r in range(len(rows) - 1):
            q = [cols_[i][r], cols_[i + 1][r], cols_[i + 1][r + 1], cols_[i][r + 1]]
            pts = [a[1] for a in q]
            lip.face([a[0] for a in q], "m_frontier", [rock.strata_uv(a[0], a[1]) for a in pts],
                     [mix(rock.rock_colour(a[1], 18.0, 0.0, 0.35 if r in (1, 2) else 0.15, 22, a[0], a[2]), lin("ash"), 0.25) for a in pts], final=True)
    # the ends of the ledge, west and east: the same broken face
    for (x0, sgn) in ((-1.5, -1.0), (29.5, 1.0)):
        i = 0 if sgn < 0 else len(xs) - 1
        zs = [edge_z(x0)] + zrows[1:]
        prof = [(0.0, 0.0), (-0.3, 0.07), (-0.34, -0.08), (-0.94, -0.02)]
        cc = []
        for j, z in enumerate(zs):
            top = v(i, j)[1]
            cc.append([(top[0] + sgn * (dx + (0.04 * fbm(z / 1.5, dy * 3.0, 9, 2) if dy < 0 else 0.0)), top[1] + dy, top[2]) for (dy, dx) in prof])
        for j in range(len(zs) - 1):
            for r in range(len(prof) - 1):
                q = [cc[j][r], cc[j + 1][r], cc[j + 1][r + 1], cc[j][r + 1]]
                if sgn < 0: q = q[::-1]
                lip.poly(q, "m_frontier", [rock.strata_uv(a[2], a[1]) for a in q], [mix(rock.rock_colour(a[1], 18.0, 0.0, 0.2, 23, a[0], a[2]), lin("ash"), 0.25) for a in q], final=True)
    # slabs of the caprock left lying at the edge, tilted: the ledge's outline against the plain (none over 0.42 m)
    blocks = Part("rim_edge_blocks", Z, smooth=28)
    rng = random.Random(433)
    cap = mix(mix(lin("rock_cap"), lin("sand_pale"), 0.5), lin("ash"), 0.42)
    for k, (x, L, hh, D) in enumerate(((3.9, 1.2, 0.26, 0.8), (8.2, 1.7, 0.38, 0.95), (12.6, 0.9, 0.2, 0.7), (17.3, 1.4, 0.32, 0.9), (22.9, 1.8, 0.4, 1.0), (26.4, 1.0, 0.22, 0.75), (-0.6, 1.1, 0.28, 0.8))):
        z = edge_z(x) + 0.12 + D / 2
        rock.rock_box(blocks, (x, ledge_y(x, z) + hh / 2 - 0.04, z), (L, hh, D), rot=rng.uniform(-14, 14), seed=440 + k, n=3, bulge=0.05, chamfer=0.09,
                      chart="rim_eb%d" % k, ground=ledge_y, cuts=4, slope=rng.uniform(-0.1, 0.1), cut_depth=(0.18, 0.38))
    rock.retint(blocks, 0, mul(cap, LEDGE_K * 1.25), 0.62)
    # polish round 3 (R7): the ledge's own rock is the dark third of the last frame. Pale caprock under the blue hour's
    # exposure (1.8) was the LIGHTEST thing in the picture (L* 60 to 65: paler than the sky); every loose block, the
    # parapet and the boulders are now the mesa's dark varnished stone and read under L* 25 (the value anchor the far
    # land cannot be: the coda's fog lifts every far card to L* 45 or more).
    darken(blocks, 0, ROCK_DARK)
    sheen(blocks, 0)
    # polish round 2: the edge is a broken parapet of the caprock, not a clean line: blocks the bed left standing on the
    # lip itself (inside the layout's rim_edge_n wall, z 100..101, so nobody meets them), dark against the plain and the
    # afterglow from anywhere on the ledge: the frame in the foreground of the last vista. Kept low where the line to
    # the fire (x 10) and to Plenty (x 2..6) cross the lip.
    par = Part("rim_parapet", Z, smooth=18)
    for k, (x, L, hh) in enumerate(((-0.9, 1.5, 1.05), (6.4, 1.3, 0.62), (14.9, 2.3, 0.95), (17.1, 1.0, 0.5), (20.4, 1.5, 0.7), (24.9, 2.1, 1.2), (28.7, 1.3, 0.85))):
        zc = 100.62
        rock.bedded_block(par, (x, FLOOR + hh / 2 - 0.2, zc), (L, hh + 0.4, 0.72), rot=rng.uniform(-7, 7), seed=470 + k, beds=2 if hh < 0.9 else 3, chart="rim_pp%d" % k,
                          ground=None, grow=0.0, bulge=0.05, inset_max=0.1, dark=0.25)
    darken(par, 0, ROCK_DARK)
    sheen(par, 0)
    return [p, lip, blocks, par]


def build_drifts(S):
    """Sand drifted against the cliff's foot and on the windward (north-west) side of the boulders (m_sand: ripples)."""
    p = Part("rim_drift", Z, smooth=40)
    ch = kit.chart("rim_drift", 1.0)
    xs = fr.breaks(-1.4, 29.4, 1.1)
    rows = [(0.0, 0.0), (0.4, 0.07), (0.8, 0.2), (1.2, 0.36)]                    # (distance in from the drift's toe, height)
    grid = []
    for x in xs:
        if 11.7 < x < 16.3: grid.append(None); continue                        # not in front of the cage opening
        big = min(1.3, 0.5 + 0.9 * vnoise(x / 3.1, 0.4, 61))                              # tongues: the drift is deep in places, thin in others
        toe = 110.95 - 1.15 * big
        grid.append([(x, ledge_y(x, min(toe + d * big, 110.98)) + h * big * (0.8 + 0.2 * vnoise(x / 1.7, d, 62)), min(toe + d * big, 110.98)) for (d, h) in rows])
    for i in range(len(xs) - 1):
        if grid[i] is None or grid[i + 1] is None: continue
        for r in range(len(rows) - 1):
            q = [grid[i][r], grid[i][r + 1], grid[i + 1][r + 1], grid[i + 1][r]]
            p.poly(q, "m_sand", [sand_uv(v) for v in q], [mul(mix(lin("sand"), lin("sand_pale"), 0.25 + 0.5 * clamp((v[1] - FLOOR) / 0.4)), LEDGE_K * 1.15) for v in q],
                   ch, [(v[0], v[2]) for v in q], final=True)
    n0 = len(p.f)
    for k, sid in enumerate(("rim_boulder_1", "rim_boulder_2")):
        s = SOL[sid]
        r = math.radians(s.get("rotY", 0))
        # the boulder's north-west corner region
        ax = s["pos"][0] - 0.33 * s["size"][0]; az = s["pos"][2] - 0.38 * s["size"][2]
        rock.drift_mound(p, (ax, FLOOR + (0.4 if k == 0 else 0.5) * s["size"][1], az), 1.9 + 0.3 * k, 315.0, 170.0, 7, chart="rim_bdrift%d" % k, ground=ledge_y, seed=70 + k)
    darken(p, n0, LEDGE_K * 1.15)
    return [p]


# ---------------------------------------------------------------------------------------------------------- the cliff
LOW = [(-0.3, 0.05), (0.55, 0.12), (0.6, -0.14), (1.7, -0.07), (1.75, 0.12), (2.95, 0.2), (3.0, 0.0)]     # (height above the ledge, z offset from the face: negative = out over the ledge)
LM_ROWS = 6                                                # cells below LOW[6] (3.0 m) are lightmapped
OPEN_TOP = [(12.5, 3.0), (13.4, 3.03), (14.3, 3.0), (14.62, 3.1), (15.15, 3.14), (15.5, 3.04)]      # the opening's top edge (polish round 5: it stepped up 0.56 m at the upper right, a notch with a plumb side that read as missing geometry; now a lintel that is only a little out of true)
# polish round 5 (the visual critic: "the cage interior is pure black with no lit surface"). The proving lift's cage is
# drawn from outside only (its panels are single-sided), so what she stands in when the gate opens is THIS rock room,
# and it was painted rock_dark x 0.9 and vertex-lit in a closed box: ink. It is the mesa's own stone now (ROOM_DARK of
# the way to rock_dark), and the afterglow that comes in through the opening lights it (setup_light: fill_cage).
ROOM_DARK = 0.40
JAMB_DARK = (0.5, 0.68)                                    # the reveal: toward the ledge, toward the room (it was 0.9 / 0.96)
CAGE_WATTS = float(os.environ.get("KS_RIM_CAGE", "28"))
JAMB = [0.0, 0.05, 0.0, 0.09, 0.02, 0.07, 0.0]             # how far each jamb row stands back from the 3 m opening (outward only)
SX0, SX1 = 10.6, 17.4                                      # the opening's surround: the profile is exact here (the cage's jambs and lintel are the layout's)
ZF = 111.0
NBED = 3


def seam_w(x):
    """0 in the opening's surround, 1 two metres away from it: how far the cliff may wander from the designed profile."""
    d = max(SX0 - x, x - SX1, 0.0)
    return smooth(d / 2.0)


def cliff_top(x):
    """Height of the rim rock above the ledge: a broken skyline in benches (never one line), two deep notches."""
    t = 5.45 + 1.25 * fbm(x / 6.5, 0.3, 65, 2) + 0.5 * fbm(x / 2.1, 1.7, 69, 2)
    t += 0.55 * (1.1 * math.floor(t / 1.1 + 0.5) - t)
    t -= 1.3 * smooth((1.6 - abs(x - 6.2)) / 1.2) + 1.0 * smooth((1.3 - abs(x - 23.6)) / 1.0)
    w = seam_w(x)
    t = t * w + 6.2 * (1.0 - w)                                # over the cage the rock is whole (the brow hangs from it)
    return clamp(t, 3.9, 6.88)


def cliff_column(x):
    """The cliff's profile at x: [(height above the ledge, z, kind)], the same number of rows in every column.
    kind 'lm' = the lightmapped foot (to 3 m), 'hi' = the vertex-lit cliff, 'cap' = the bleached top going back.
    Stratified like the Lip's walls (the same rock): hard beds stand proud over soft ones weathered back, the beds DIP
    along the face and change thickness, the whole battered back above 3 m, buttresses that lean out overhead,
    chimneys between them, an undercut base. No vertical joints, no courses of equal blocks."""
    w = seam_w(x)
    d1 = w * (0.26 * fbm(x / 7.0, 1.3, 61, 2) + 0.012 * (x - 14.0))
    d2 = w * (0.33 * fbm(x / 8.0, 4.1, 62, 2) + 0.02 * (x - 14.0))
    d3 = w * (0.22 * fbm(x / 6.0, 6.3, 60, 2))
    dh = [0.0, d1, d1, d2, d2, d3, d3]
    rows = []
    for r, (h, dz) in enumerate(LOW):
        o = dz * (1.0 + w * 0.5 * fbm(x / 3.0, r * 1.1, 63, 2)) + w * 0.1 * fbm(x / 5.0, r * 1.7, 64, 2) + 0.03 * fbm(x / 1.3, h * 1.7, 31, 2)
        rows.append((h + dh[r], clamp(o, -0.24, 0.3), "lm"))
    top = cliff_top(x)
    o = rows[-1][1]; y_prev = rows[-1][0]
    bump = max(0.0, vnoise(x / 7.5, 0.5, 67) - 0.5) / 0.5 * w
    chim = smooth((vnoise(x / 2.6, 7.7, 68) - 0.66) / 0.12) * w
    for k in range(NBED):
        by = (4.1, 5.2, 6.25)[k] + w * (0.4 * fbm(x / 9.0, k * 3.1, 66, 2) + 0.02 * (x - 14.0) * (k + 1) / 3.0)
        lip = 0.16 + 0.24 * vnoise(x / 5.0, k * 2.9, 15)
        o_s = o + 0.07 * max(0.0, by - y_prev) + 0.1 + 0.2 * vnoise(x / 4.0, k * 1.7, 17)
        ya = clamp(by, y_prev, top); yb = clamp(by + 0.06, y_prev, top)
        rows += [(ya, o_s, "hi"), (yb, o_s - lip, "hi")]
        o = o_s - lip; y_prev = yb
    o += 0.07 * max(0.0, top - y_prev)
    rows.append((top, o, "hi"))
    rows.append((top + 0.05, o + 1.2, "cap"))
    rows.append((top - 0.3, o + 3.4, "cap"))
    out = []
    for (h, o, kind) in rows:
        if kind != "lm":
            f = smooth((h - 2.4) / 2.0)
            o -= 0.95 * bump * f * (1.0 - 0.55 * smooth((h - top + 2.2) / 2.2))
            o += 0.6 * chim * smooth((h - 2.6) / 1.5)
            o += 0.12 * w * fbm(x / 3.1, h * 0.8, 93, 2) * f
        out.append((x, min(FLOOR + h, 24.95), min(ZF + o, 120.9), kind))
    return out


def brow_lip(x):
    """The brow over the cage's opening, as the camera in the cage sees it: (projection out from the face, height of
    its lower lip above the ledge). The overhang's mouth mirrored: a long low lip that droops at both ends, bitten out
    in a NOTCH at the upper right (the overhang has its notch upper left)."""
    shape = smooth((x - 9.3) / 1.8) * smooth((18.9 - x) / 1.8)
    proj = (2.05 + 0.18 * fbm(x / 1.9, 0.6, 81, 2)) * shape
    y = 2.82 + 0.05 * fbm(x / 1.3, 0.2, 82, 2) - 0.5 * (1.0 - smooth((x - 9.6) / 2.6)) - 0.45 * (1.0 - smooth((18.6 - x) / 2.6))
    # polish round 5 (the visual critic: "a stepped notch at the top that looks like missing geometry"): the notch was a
    # slot half a metre deep with one plumb side, cut 62 % back into the brow: from the cage it stood as a black
    # rectangle with a corner bitten out of it. It is a BITE now: a hand deep, its shoulders a pace long, the brow's
    # lip running through it unbroken (the overhang's mouth has the same kind of bite at its upper left).
    notch = smooth((x - 13.75) / 0.7) * smooth((16.05 - x) / 0.6)
    return proj * (1.0 - 0.22 * notch), y + 0.15 * notch


def build_frame(S):
    """The rock behind the ledge: a stratified cliff along z = 111 (cliff_column), and in it the cage's opening. The
    opening is DESIGNED: the overhang's mouth mirrored. Seen from the cage the frame is a letterbox like the mouth's:
    a brow of caprock hangs two metres out over the opening and droops at both ends (its lip is the frame's top, its
    shadow on the ledge the frame's foot), the notch is bitten out of the lip at the upper RIGHT, a fallen slab lies at
    the lower LEFT. Then the dark reveal, the frame's inner face and the rock room round the cage."""
    lmp = Part("rim_frame_lm", Z, smooth=28); hi = Part("rim_frame_vl", Z, smooth=28)
    zf = ZF
    xs = fr.breaks(-1.9, SX0, 1.05) + [11.55, 12.5, 13.4, 14.3, 14.62, 15.15, 15.5, 16.45] + fr.breaks(SX1, 29.9, 1.05)
    cols = []
    for x in xs:
        col = [(q[0], q[1], q[2]) for q in cliff_column(x)]
        kinds = [q[3] for q in cliff_column(x)]
        if x in (12.5, 15.5):
            for r in range(LM_ROWS + 1): col[r] = (col[r][0] + (-JAMB[r] if x == 12.5 else JAMB[r]), col[r][1], col[r][2])
        cols.append(col)
    nrow = len(cols[0])
    sarc = [0.0]
    for t in range(LM_ROWS): sarc.append(sarc[-1] + math.hypot(LOW[t + 1][0] - LOW[t][0], LOW[t + 1][1] - LOW[t][1]))
    for i in range(len(xs) - 1):
        in_open = 12.5 <= xs[i] and xs[i + 1] <= 15.5
        for r in range(nrow - 1):
            A, B, C, D = cols[i][r], cols[i][r + 1], cols[i + 1][r + 1], cols[i + 1][r]
            if in_open:
                if r < LM_ROWS: continue
                if r == LM_ROWS:
                    ta = next(t for (xx, t) in OPEN_TOP if abs(xx - xs[i]) < 1e-6); td = next(t for (xx, t) in OPEN_TOP if abs(xx - xs[i + 1]) < 1e-6)
                    A = (A[0], FLOOR + ta, A[2] + (B[2] - A[2]) * (ta - 3.0) / 1.1); D = (D[0], FLOOR + td, D[2] + (C[2] - D[2]) * (td - 3.0) / 1.1)
            q = [A, B, C, D]
            keep = [0]
            for t in range(1, 4):
                if all(kit.vlen(kit.vsub(q[t], q[s_])) > 0.02 for s_ in keep): keep.append(t)
            if len(keep) < 3: continue
            low = r < LM_ROWS
            part = lmp if low else hi
            dzr = (B[2] - A[2] + C[2] - D[2]) / 2; dyr = (B[1] - A[1] + C[1] - D[1]) / 2
            ledge_up = (dzr > 0.12 and dyr < 0.12) or r >= nrow - 3                     # the top of a hard bed; the cap
            under = dzr < -0.1 and dyr < 0.2                                             # the shadowed underside of one
            topy = FLOOR + cliff_top((A[0] + D[0]) / 2)
            cols_ = [rock.rock_colour(v[1], topy, 0.7 if ledge_up else 0.0, 0.5 if under else (0.3 if r in (0, 4) else 0.08), 34, v[0], v[2]) for v in q]
            st = [(A[0], sarc[r]), (B[0], sarc[r + 1]), (C[0], sarc[r + 1]), (D[0], sarc[r])] if low else None
            ch = kit.chart("rim_face_%d" % (0 if xs[i + 1] <= SX0 else (1 if xs[i] >= SX0 and xs[i + 1] <= SX1 else 2)), 1.0) if low else None
            part.poly([q[t] for t in keep], "m_frontier", [rock.strata_uv(q[t][0], q[t][1]) for t in keep], [cols_[t] for t in keep], ch, [st[t] for t in keep] if low else None, final=True, weld=True)
    # the cliff's two ends turn the corner (seen along the face from the ledge: the rock has a side, it is not a sheet)
    for (ci, sgn) in ((0, -1.0), (len(xs) - 1, 1.0)):
        col = cols[ci]
        for r in range(nrow - 3):
            A, B = col[r], col[r + 1]
            if B[1] - A[1] < 0.03 and abs(B[2] - A[2]) < 0.03: continue
            q = [A, B, (B[0] - sgn * 0.5, B[1], 119.5), (A[0] - sgn * 0.5, A[1], 119.5)]
            n = kit.vcross(kit.vsub(q[1], q[0]), kit.vsub(q[2], q[0]))
            if n[0] * sgn < 0: q = q[::-1]
            hi.poly(q, "m_frontier", [rock.strata_uv(v[2] * 1.2, v[1]) for v in q], [rock.rock_colour(v[1], FLOOR + cliff_top(xs[ci]), 0.0, 0.2, 51, v[0], v[2]) for v in q], final=True)
    # ---- the brow: three beds of caprock standing out over the opening
    brow = Part("rim_brow", Z, smooth=28)
    bx = fr.breaks(9.3, 18.9, 0.62, [14.35, 14.65, 15.3, 15.75])
    rings = []
    for x in bx:
        proj, ly = brow_lip(x)
        col = cliff_column(x)
        root = max(3.62, 3.2 + 0.0) if 12.3 <= x <= 15.7 else 3.3
        zr = ZF + 0.02
        z0 = zf - proj
        pts = [(x, FLOOR + root, zr),                                   # the underside's root on the face
               (x, FLOOR + ly, z0),                                     # the lip's lower edge
               (x, FLOOR + ly + 0.4, z0 - 0.1 * min(1.0, proj)),        # the lowest bed's face (it overhangs a hand)
               (x, FLOOR + ly + 0.47, z0 + 0.26 * min(1.0, proj)),      # a ledge
               (x, FLOOR + ly + 1.05, z0 + 0.34 * min(1.0, proj) + 0.05 * fbm(x / 1.1, 0.4, 83, 2)),
               (x, FLOOR + ly + 1.12, z0 + 0.8 * min(1.0, proj)),
               (x, FLOOR + ly + 1.7, z0 + 0.95 * min(1.0, proj)),
               (x, min(FLOOR + ly + 1.95, FLOOR + cliff_top(x) - 0.4), zr + 0.35)]   # back into the cliff
        rings.append(pts)
    for i in range(len(bx) - 1):
        for r in range(len(rings[0]) - 1):
            q = [rings[i][r], rings[i + 1][r], rings[i + 1][r + 1], rings[i][r + 1]]
            keep = [0]
            for t in range(1, 4):
                if all(kit.vlen(kit.vsub(q[t], q[s_])) > 0.02 for s_ in keep): keep.append(t)
            if len(keep) < 3: continue
            dark_ = 0.55 if r == 0 else (0.3 if r in (2, 4) else 0.05)      # (the underside was 0.85: an ink band over the view from the cage)
            up = 0.7 if r in (2, 4, 6) else 0.0
            keep = keep[::-1]                                              # outward: the underside looks down, the beds' faces north
            brow.poly([q[t] for t in keep], "m_frontier", [rock.strata_uv(q[t][0], q[t][1]) if r else rock.strata_uv(q[t][0], q[t][2] - 90.0) for t in keep],
                      [rock.rock_colour(q[t][1], FLOOR + 6.0, up, dark_, 36, q[t][0], q[t][2]) for t in keep], final=True, weld=True)
    # ---- the opening: reveal (1 m of rock, dark), the frame's inner face, the room round the cage
    iw = xs.index(12.5); ie = xs.index(15.5)
    room = Part("rim_room", Z, smooth=None)
    sbcols = cols
    dark = lambda v, k=0.88: rock.rock_colour(v[1], None, 0.0, k, 36, v[0], v[2])
    zi = zf + 1.0
    W = [sbcols[iw][r] for r in range(LM_ROWS + 1)]; E = [sbcols[ie][r] for r in range(LM_ROWS + 1)]
    E = E + [(E[-1][0], FLOOR + OPEN_TOP[-1][1], E[-1][2])]
    T = []                                                    # the top edge, west to east, on the face
    for (xx, t) in OPEN_TOP:
        c = sbcols[xs.index(xx)]
        T.append((W[-1][0] if xx == 12.5 else (E[-1][0] if xx == 15.5 else xx), FLOOR + t, c[6][2] + (c[7][2] - c[6][2]) * (t - 3.0) / 1.1))
    E[-1] = T[-1]
    ch_r = kit.chart("rim_reveal", 1.0)
    for r in range(len(W) - 1):                               # west jamb, faces east
        A, D = W[r], W[r + 1]
        q = [A, D, (D[0], D[1], zi), (A[0], A[1], zi)]
        lmp.poly(q, "m_frontier", [rock.strata_uv(v[2] * 2.0, v[1]) for v in q], [dark(v, JAMB_DARK[0] if v[2] < zi - 0.5 else JAMB_DARK[1]) for v in q], ch_r, [(v[2] - zf, v[1]) for v in q], final=True)
    for r in range(len(E) - 1):                               # east jamb, faces west
        A, D = E[r], E[r + 1]
        q = [A, (A[0], A[1], zi), (D[0], D[1], zi), D]
        lmp.poly(q, "m_frontier", [rock.strata_uv(v[2] * 2.0, v[1]) for v in q], [dark(v, JAMB_DARK[0] if v[2] < zi - 0.5 else JAMB_DARK[1]) for v in q], ch_r, [(v[2] - zf + 3.0, v[1]) for v in q], final=True)
    for i in range(len(T) - 1):                               # the lintel's underside
        A, Bq = T[i], T[i + 1]
        q = [A, Bq, (Bq[0], Bq[1], zi), (A[0], A[1], zi)]
        hi.poly(q, "m_frontier", [rock.strata_uv(v[0], v[2]) for v in q], [dark(v, 0.6) for v in q], final=True)
    # the frame's inner face (z = 112, toward the cage): opening outline -> the room's section
    O = [(v[0], v[1]) for v in W] + [(v[0], v[1]) for v in T[1:-1]] + [(v[0], v[1]) for v in E[::-1]]
    Q = [(12.0, v[1]) for v in W] + [(v[0], FLOOR + 3.5) for v in T[1:-1]] + [(16.0, v[1]) for v in E[::-1]]
    nW = len(W); nT = len(T) - 2
    ring = []
    for k in range(len(O)):
        ring.append((O[k], Q[k]))
        if k == nW - 1: ring.append((O[k], (12.0, FLOOR + 3.5))); ring.append((O[k], (O[k][0], FLOOR + 3.5)))
        if k == nW + nT - 1: ring.append((O[k + 1], (O[k + 1][0], FLOOR + 3.5))); ring.append((O[k + 1], (16.0, FLOOR + 3.5)))
    for k in range(len(ring) - 1):
        (o0, q0), (o1, q1) = ring[k], ring[k + 1]
        pts = [(o0[0], o0[1], zi), (o1[0], o1[1], zi), (q1[0], q1[1], zi), (q0[0], q0[1], zi)]
        pts = [v for t, v in enumerate(pts) if all(kit.vlen(kit.vsub(v, w_)) > 1e-4 for w_ in pts[:t])]
        if len(pts) < 3: continue
        n = kit.vcross(kit.vsub(pts[1], pts[0]), kit.vsub(pts[2], pts[0]))
        if n[2] < 0: pts = pts[::-1]
        room.poly(pts, "m_frontier", [rock.strata_uv(v[0], v[1]) for v in pts], [dark(v, ROOM_DARK + 0.15) for v in pts], final=True)
    room_y = FLOOR + 3.5
    walls = [((12.0, zi), (12.0, 116.0)), ((12.0, 116.0), (16.0, 116.0)), ((16.0, 116.0), (16.0, zi))]
    for (a, b_) in walls:
        q = [(a[0], FLOOR, a[1]), (a[0], room_y, a[1]), (b_[0], room_y, b_[1]), (b_[0], FLOOR, b_[1])]
        room.poly(q, "m_frontier", [rock.strata_uv(v[0] + v[2], v[1]) for v in q], [dark(v, ROOM_DARK) for v in q], final=True)
    room.poly([(12.0, room_y, zi), (16.0, room_y, zi), (16.0, room_y, 116.0), (12.0, room_y, 116.0)], "m_frontier", [rock.strata_uv(v[0], v[2] - 90.0) for v in ((12.0, room_y, zi), (16.0, room_y, zi), (16.0, room_y, 116.0), (12.0, room_y, 116.0))], rock.rock_colour(21.5, None, 0.0, ROOM_DARK + 0.2, 38), final=True)
    lmp.poly([(12.0, FLOOR, 111.3), (12.0, FLOOR, 116.0), (16.0, FLOOR, 116.0), (16.0, FLOOR, 111.3)], "m_frontier", flat_uv("m_frontier"),
             mul(rock.rock_colour(18.0, None, 0.0, 0.6, 39), 0.9), kit.chart("rim_cage_floor", 1.0), [(12.0, 111.3), (12.0, 116.0), (16.0, 116.0), (16.0, 111.3)], final=True)
    kit.tessellate(hi, 1.6)
    kit.tessellate(room, 0.95)                                 # vertex light needs vertices: the door's light falls off along these walls
    # the fallen slab: a bed of the brow that came down. It lies FLAT at the lower LEFT of the opening, one end propped
    # on the block it broke over: angular, struck-off corners, nothing upright (the overhang has its slab lower right)
    slab = Part("rim_slab", Z, smooth=20)
    # (it lies where the cage looks, between the nav links to the ledge's west half: no part of it stands over 0.33 m)
    c0 = (12.4, FLOOR + 0.14, 108.95)
    start = len(slab.v)
    rock.rock_box(slab, c0, (2.1, 0.3, 1.2), rot=-24.0, seed=303, n=3, bulge=0.02, chamfer=0.045, chart="rim_slab", ground=None, cuts=4, cut_depth=(0.2, 0.45))
    slab.transform(lambda p_: (p_[0], p_[1] + 0.035 * (c0[0] - p_[0]), p_[2]), start)
    # the piece it broke from still leans on the west jamb's foot: an angular block, struck-off corners (out of the links' way)
    rock.rock_box(slab, (10.95, FLOOR + 0.42, 110.5), (1.25, 0.95, 0.62), rot=14.0, seed=304, n=2, bulge=0.035, chamfer=0.06, chart="rim_slab2", ground=ledge_y, cuts=5, cut_depth=(0.22, 0.42), slope=0.22,
                  lean=(0.12, 0.2))
    rock.rock_box(slab, (13.75, FLOOR + 0.09, 108.2), (0.6, 0.22, 0.45), rot=-48.0, seed=305, n=2, bulge=0.03, chamfer=0.05, chart="rim_slab3", ground=ledge_y, cuts=3, cut_depth=(0.08, 0.16))
    return [lmp, hi, room, brow, slab]


def build_rocks(S):
    out = []
    for k, sid in enumerate(("rim_boulder_1", "rim_boulder_2")):
        s = SOL[sid]
        p = Part(sid, Z, smooth=18)
        rock.bedded_block(p, s["pos"], s["size"], rot=s.get("rotY", 0), seed=310 + k, beds=3 if s["size"][1] > 1.3 else 2, chart="rim_bo%d" % k, ground=ledge_y,
                          **(dict(grow=0.1) if k == 0 else dict(grow=0.0, bulge=0.05, inset_max=0.12)))        # boulder 2 stands half a metre from a nav node
        # a shard that came off it, lying against its lee side
        r = s.get("rotY", 0)
        sd = 1.0 if k == 0 else -1.0
        c = kit.rot_y((s["pos"][0] + sd * (s["size"][0] / 2 + 0.2), FLOOR + 0.2, s["pos"][2] + 0.25 * s["size"][2]), r, s["pos"])
        rock.rock_box(p, c, (0.5, 0.75, 1.1), rot=r + 12, seed=330 + k, n=2, bulge=0.04, chamfer=0.07, chart="rim_bs%d" % k, ground=ledge_y, lean=(-0.2 * sd, 0.0), cuts=2, cut_depth=(0.1, 0.2))
        darken(p, 0, ROCK_DARK)
        sheen(p, 0, k=2.0)
        out.append(p)
    # the natural shelf at the north-west edge the stone lies on: two beds of the caprock, the upper swept (its top 0.24 m above the ledge)
    s = SOL["rim_stone"]
    p = Part("rim_shelf", Z, smooth=28)
    # under the slab's middle: prop_rim_stone's pivot is seat 7 (at ia_stone_round), its slab runs 0.78 m along local -x
    # integration: the layout's rim_stone solid IS this shelf now (its centre is the shelf's, 0.33 m along the slab from seat 7)
    cx = s["pos"][0]; cz = s["pos"][2]
    rock.rock_box(p, (cx + 0.25, FLOOR - 0.06, cz + 0.2), (3.0, 0.3, 2.0), rot=ROT - 9, seed=321, n=3, bulge=0.012, chamfer=0.08, chart="rim_shelf0", ground=None, cuts=2, cut_depth=(0.15, 0.3))
    rock.rock_box(p, (cx, FLOOR, cz), (1.95, 0.48, 1.2), rot=ROT + 4, seed=320, n=3, bulge=0.012, chamfer=0.1, chart="rim_shelf", ground=None, cuts=1, cut_depth=(0.12, 0.2))
    rock.retint(p, 0, mul(mix(mix(lin("rock_cap"), lin("sand_pale"), 0.5), lin("ash"), 0.42), 0.62), 0.55)
    darken(p, 0, 0.62)                                                    # the shelf stays the paler stone the round lies on, a step under the sand
    out.append(p)
    # a rag pinned under a stone at the frame: the cloth the overhang has by its mouth, here too (the m_mask of this chunk)
    rag = Part("rim_rag", Z)
    F = fr.Frame((16.2, FLOOR, 110.72), (1.0, -0.15))
    fr.decal(rag, F, 0.0, 0.36, 0.02, 0.44, 0.56, "card_edges", 0, mul(lin("workcloth"), 1.1))
    st = Part("rim_ragstone", Z)
    rock.rock_chunk(st, (16.25, FLOOR + 0.62, 110.67), 0.19, seed=7, dark=0.4)
    out += [rag, st]
    # the rim's own seam (ART_BIBLE 5.5): the stump of a line pylon that stood on the caprock (intrusion: ceramic and
    # steel through the stone, broken off a man's height up), a length of its braided cable looped round it and pegged
    # as a hand-line toward the cage (salvage), and the town's brushed mark on the rock by the opening, as on a well
    # (misreading). Folded into the chunk's own material: colour in COLOR_0 on the flat cell (the rim has no m_pellam).
    sp = Part("rim_stump", Z, smooth=None)
    FLF = flat_uv("m_frontier")
    bx, bz = 27.9, 103.3
    by = ledge_y(bx, bz)
    enamel = lin("enamel"); stain = lin("enamel_stain"); steel = lin("steel"); conc = lin("concrete")
    kit.add_box(sp, (bx, by + 0.12, bz), (1.5, 0.34, 1.5), "m_frontier", mix(conc, lin("sand"), 0.25), rot=11.0, sides="nsewt", uv=FLF, final=True, taper=0.1)
    n = 8; rs = 0.62
    hs = [1.25, 1.05, 0.7, 0.82, 1.4, 1.62, 1.5, 1.18]                    # the break: ragged, highest on the lee side
    ring0 = [(bx + math.cos(2 * math.pi * i / n + 0.2) * rs, by + 0.28, bz + math.sin(2 * math.pi * i / n + 0.2) * rs) for i in range(n)]
    ringb = [(bx + math.cos(2 * math.pi * i / n + 0.2) * (rs - 0.01), by + 0.64, bz + math.sin(2 * math.pi * i / n + 0.2) * (rs - 0.01)) for i in range(n)]
    ring1 = [(bx + math.cos(2 * math.pi * i / n + 0.2) * (rs - 0.04) + 0.03, by + hs[i], bz + math.sin(2 * math.pi * i / n + 0.2) * (rs - 0.04) + 0.02) for i in range(n)]
    inner = [(bx + math.cos(2 * math.pi * i / n + 0.2) * (rs - 0.2) + 0.03, by + hs[i] - 0.14, bz + math.sin(2 * math.pi * i / n + 0.2) * (rs - 0.2) + 0.02) for i in range(n)]
    for i in range(n):
        j = (i + 1) % n
        sp.poly([ring0[j], ring0[i], ringb[i], ringb[j]], "m_frontier", FLF, [steel, steel, mix(steel, stain, 0.2), mix(steel, stain, 0.2)], final=True)
        sp.poly([ringb[j], ringb[i], ring1[i], ring1[j]], "m_frontier", FLF, [stain, stain, mix(enamel, stain, 0.3), mix(enamel, stain, 0.3)], final=True)
        sp.poly([ring1[j], ring1[i], inner[i], inner[j]], "m_frontier", FLF, mul(stain, 0.7), final=True)                      # the broken edge: 16 cm of ceramic
        sp.poly([inner[j], inner[i], (bx + 0.03, by + 0.45, bz + 0.02)], "m_frontier", FLF, [mul(lin("steel_dark"), 0.5), mul(lin("steel_dark"), 0.5), mul(lin("steel_dark"), 0.25)], final=True)
    band = [(bx + math.cos(2 * math.pi * i / n + 0.2) * (rs + 0.012), bz + math.sin(2 * math.pi * i / n + 0.2) * (rs + 0.012)) for i in range(n)]
    for i in range(n):
        j = (i + 1) % n
        if by + 0.62 > by + hs[i] - 0.1 or by + 0.62 > by + hs[j] - 0.1: continue
        sp.poly([(band[j][0], by + 0.52, band[j][1]), (band[i][0], by + 0.52, band[i][1]), (band[i][0], by + 0.62, band[i][1]), (band[j][0], by + 0.62, band[j][1])], "m_frontier", FLF, mul(lin("livery"), 0.8), final=True)
    for (a_, hh) in ((0.9, 1.75), (2.6, 1.3), (4.4, 1.95)):                 # reinforcing bars standing out of the break
        px_ = bx + math.cos(a_) * 0.36; pz_ = bz + math.sin(a_) * 0.36
        kit.add_prism(sp, (px_, by + 0.5, pz_), (px_ + 0.12 * math.cos(a_ + 1), by + hh, pz_ + 0.1 * math.sin(a_ + 1)), 0.06, 0.06, "m_frontier", mul(lin("rust"), 0.75), chamfer=0.0, segs=2, caps="b", final=True)
    # the cable: twice round the stump, then along the ledge to an iron pin near the cage (it lies on the rock: 7 cm thick)
    cab = lin("cable")
    loop = [(bx + math.cos(a_) * (rs + 0.05), by + 0.36 + 0.05 * k, bz + math.sin(a_) * (rs + 0.05)) for k, a_ in enumerate([0.2 + i * 2 * math.pi / 8 for i in range(11)])]
    for a_, b_ in zip(loop[:-1], loop[1:]): kit.add_prism(sp, a_, b_, 0.075, 0.075, "m_frontier", cab, chamfer=0.0, final=True)
    run = [loop[-1], (26.9, 0.0, 104.4), (25.2, 0.0, 106.9), (22.9, 0.0, 108.6), (20.2, 0.0, 109.6), (17.6, 0.0, 110.25)]
    run = [run[0]] + [(x, ledge_y(x, z) + 0.045, z) for (x, _, z) in run[1:]]
    for a_, b_ in zip(run[:-1], run[1:]): kit.add_prism(sp, a_, b_, 0.075, 0.075, "m_frontier", cab, chamfer=0.0, segs=2, final=True)
    pin = run[-1]
    kit.add_prism(sp, (pin[0], pin[1] - 0.1, pin[2]), (pin[0] + 0.04, pin[1] + 0.26, pin[2] + 0.03), 0.06, 0.06, "m_frontier", mul(lin("rust"), 0.7), chamfer=0.0, caps="b", final=True)
    # polish round 5: under the blue hour the stump's pale enamel was the lightest thing on the ledge (L* 65 beside rock
    # at 15: a blank blue-white shard in every view east). Weathered ceramic at dusk: a third of that.
    darken(sp, 0, 0.32)
    out.append(sp)
    mk = Part("rim_mark", Z)
    Fm = fr.Frame((16.05, FLOOR, ZF - 0.1), (-1.0, 0.0))                  # the face east of the opening, looking north
    fr.door_mark(mk, Fm, -0.75, 1.5, 0.0, "mark_brush_b", 0.44, strike=False)
    out.append(mk)
    t = Part("rim_scree", Z)
    rng = random.Random(330)
    for k in range(30):
        x = rng.uniform(-1.0, 29.0); z = rng.uniform(109.9, 110.8)
        if 11.6 < x < 16.5: continue
        rock.rock_chunk(t, (x, ledge_y(x, z) + 0.06, z), rng.uniform(0.1, 0.3), seed=rng.randrange(10 ** 6), dark=0.2)
    for sid in ("rim_boulder_1", "rim_boulder_2"):
        s = SOL[sid]
        for k in range(6):
            a = rng.uniform(0, 2 * math.pi); d = rng.uniform(0.9, 1.5)
            x = s["pos"][0] + math.cos(a) * (s["size"][0] / 2 + d * 0.5); z = s["pos"][2] + math.sin(a) * (s["size"][2] / 2 + d * 0.5)
            rock.rock_chunk(t, (x, ledge_y(x, z) + 0.02, z), rng.uniform(0.09, 0.2), seed=rng.randrange(10 ** 6), dark=0.15)
    out.append(t)
    return out


def setup_light():
    """Mood L6 (ART_BIBLE 3.7): no sun; a sky dome brightest overhead (#A9B8E0) going to the violet-grey ambient
    (#4A5A96) at the horizon, calibrated so that a white plane facing up reads 0.75 (the key from above)."""
    bake.use_cycles('CPU', samples=64)
    s = bpy.context.scene
    s.cycles.max_bounces = 2; s.cycles.diffuse_bounces = 2
    w = bpy.data.worlds.new("RimSky"); s.world = w; w.use_nodes = True
    nt = w.node_tree; N = nt.nodes; L = nt.links
    bg = N.get("Background")
    tc = N.new("ShaderNodeTexCoord"); sep = N.new("ShaderNodeSeparateXYZ"); L.new(tc.outputs["Generated"], sep.inputs[0])
    mx = N.new("ShaderNodeMath"); mx.operation = 'MAXIMUM'; mx.inputs[1].default_value = 0.0
    # Generated coordinates of the world = the view direction; Z is up in Blender
    nrm = N.new("ShaderNodeVectorMath"); nrm.operation = 'NORMALIZE'; L.new(tc.outputs["Generated"], nrm.inputs[0])
    sep2 = N.new("ShaderNodeSeparateXYZ"); L.new(nrm.outputs[0], sep2.inputs[0])
    L.new(sep2.outputs["Z"], mx.inputs[0])
    pw = N.new("ShaderNodeMath"); pw.operation = 'POWER'; pw.inputs[1].default_value = 0.6; L.new(mx.outputs[0], pw.inputs[0])
    mixc = N.new("ShaderNodeMix"); mixc.data_type = 'RGBA'
    mixc.inputs["A"].default_value = (*kit.lin(HORIZON), 1.0); mixc.inputs["B"].default_value = (*kit.lin(ZENITH), 1.0)
    L.new(pw.outputs[0], mixc.inputs["Factor"]); L.new(mixc.outputs["Result"], bg.inputs["Color"])
    sun_e, world_e, reading = bake.calibrate(KEY, KEY, sun=None, world=bg, samples=64 if FAST else 256)
    print(f"CALIBRATED (no sun) world {world_e:.3f} -> up-facing {reading['ambient']:.3f}")
    # the cage's room: the afterglow through the opening, as one soft ember area light standing just inside the frame
    # and looking in and a little down (a light, not a mesh: nothing exported). Brightest on the back wall and the
    # floor's middle, grazing on the side walls and the roof: the room is a warm dark that falls off away from the door.
    if CAGE_WATTS > 0:
        from mathutils import Vector
        # (name, at, looking at, size, colour, share of CAGE_WATTS). The second is what the lit back wall gives back to
        # the wall the opening is cut in: cool and weak, so the frame round the view is rock with beds, not a cut-out.
        for (nm, at, to, size, colour, k) in (("fill_cage", (14.0, FLOOR + 1.75, ZF + 0.05), (14.0, FLOOR + 1.2, 116.0), (2.7, 2.1), (1.0, 0.70, 0.58), 1.0),
                                              ("fill_brow", (14.0, FLOOR + 0.25, 109.9), (14.0, FLOOR + 3.0, 109.95), (5.0, 1.4), (0.58, 0.50, 0.92), 0.6),
                                              ("fill_cage_back", (14.0, FLOOR + 1.6, 115.85), (14.0, FLOOR + 2.0, ZF + 1.0), (3.4, 2.4), (0.62, 0.50, 0.95), 1.2)):
            ld = bpy.data.lights.new(nm, 'AREA'); ld.shape = 'RECTANGLE'; ld.size = size[0]; ld.size_y = size[1]
            ld.energy = CAGE_WATTS * k; ld.color = colour; ld.spread = math.radians(150.0)
            ob = bpy.data.objects.new(nm, ld); bpy.context.scene.collection.objects.link(ob)
            a = Vector(layout.to_blender(at)); b = Vector(layout.to_blender(to))
            ob.location = a; ob.rotation_euler = (b - a).to_track_quat('-Z', 'Y').to_euler()
            ob.visible_camera = False; ob.visible_glossy = False
    return world_e


def embed(S):
    tb = layout.to_blender
    s = SOL["rim_stone"]
    shelf_top = FLOOR + 0.24
    objs = zonelib.embed_prop("prop_rim_stone", location=tb((STONE["pos"][0], shelf_top, STONE["pos"][2])), rot_z=math.radians(ROT), material_name="m_frontier", lightmap=LM)   # pivot = seat 7 = ia_stone_round
    slab_top = shelf_top + manifest.asset("prop_rim_stone")["placeholder"]["size"][1]
    note = layout.marker("rd_note_stone")
    objs += zonelib.embed_prop("rd_note", node="note_stone", location=tb((note["pos"][0], slab_top + 0.002, note["pos"][2])), rot_z=math.radians(ROT + 6), material_name="m_frontier", lightmap=LM)
    # the six spent cases of seats 1-6 are part of prop_rim_stone itself since polish round 3 (2.6 x life size, so
    # they read from the walker's eye); the life-size zone copies that stood here were hidden inside them and are gone.
    # Seat 7 (at ia_stone_round) stays empty: the runtime round stands there at the same 2.6 x (manifest binding scale).
    for o in objs: o["chunk"] = "chunk_rim_ledge"; o["kzone"] = Z; o["klm"] = False
    return objs


def build_scene():
    """The rim's whole scene (geometry, props, light, atlas). Returns (objects, lightmapped objects)."""
    scene.reset_scene()
    kit.reset_charts()
    S = type("S", (), {})()
    parts = build_ledge(S) + build_drifts(S) + build_frame(S) + build_rocks(S)
    objs = []
    for p in parts: objs += kit.realize(p)
    objs += embed(S)
    setup_light()
    pack = kit.pack_charts(sorted(objs, key=lambda o: o.name), LM, target=18.0, margin=4, top_reserve=12)
    print(f"ATLAS {LM}: {pack[0]:.2f} texels/m, {100 * pack[1]:.1f} % in chart boxes, {len(pack[2])} charts; {sum(len(o.data.polygons) for o in objs)} faces")
    return objs, [o for o in objs if o.get("klm")]


def main():
    args = scene.asset_args(os.path.basename(__file__))
    objs, lm = build_scene()
    img, dt = bake.bake_lightmap(sorted(lm, key=lambda o: o.name), LM, samples=16 if FAST else 128)
    bake.save_lightmap(img, LM)
    vl = [o for o in objs if not o.get("klm")]
    t = vcol.bake_vertex_light(vl, samples=64 if FAST else 1024)
    kit.merge_corner_colours(vl)
    print(f"BAKED {LM} {dt:.1f}s; vertex light {sum(len(o.data.polygons) for o in vl)} faces {t:.1f}s")
    zonelib.assign_chunks(objs, ASSET)
    zonelib.merge_chunks(ASSET)
    export.export_asset(ASSET, args.out, blend=args.blend)


if __name__ == "__main__":
    scene.run(main)
