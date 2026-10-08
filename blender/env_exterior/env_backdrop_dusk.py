"""env_backdrop_dusk: the coda's horizon (docs/workorders/art-env-exterior.md 4.6): the same mesa rings re-coloured to
blue hour (L6), the ember band behind the north-west ones, the plain with the pylon line, and below the ledge the
gully the stage began in, as dark simple shapes (the surface set is not loaded in the coda). One m_flat mesh, UNLIT,
world coordinates. Empty socket_last_fire on the line of vista_fire's target."""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _d)
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
import math
from lib import scene, layout, export
import ext_cards as cards
from ext_cards import hexlin
from ext_kit import mix, mul, clamp, smooth, vnoise
import ext_rock as rock
import env_far_rim as rimz                         # the rim's own cliff: cliff_column() is continued east and west of the ledge (wings)

ASSET = "env_backdrop_dusk"
CENTRE = (14.0, 0.0, 60.0)                       # under the rim
FOG = hexlin("#4D5578"); EMBER = hexlin("#D9967A"); COLD = hexlin("#4D5578")
EMBER_AZ = math.radians(315.0)


def ember_at(a):
    t = clamp(math.cos(a - EMBER_AZ)) ** 3
    return mix(COLD, EMBER, t)


def north_low(b):
    """0.3 within 25 degrees of north (no dark spire under the Rule), rising to 1 by 40 degrees."""
    n = abs(((b + math.pi) % (2 * math.pi)) - math.pi)
    return 0.3 + 0.7 * smooth((n - math.radians(25)) / math.radians(15))


PLAIN = hexlin("#1C1F34")


def facing_poly(card, pts, cols, toward):
    """card.poly with the winding that makes the face look at `toward` (a point; (x, 1e6, z) = up)."""
    a, b, c = pts[0], pts[1], pts[2]
    ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]; vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
    n = (uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
    d = (toward[0] - a[0], toward[1] - a[1], toward[2] - a[2])
    if n[0] * d[0] + n[1] * d[1] + n[2] * d[2] < 0: pts = pts[::-1]; cols = cols[::-1]
    card.poly(pts, cols)


EYE = (10.0, 19.65, 103.0)                       # an eye on the ledge


def behind_rim(form):
    """Polish round 5: a landform of the far country that stands wholly within 60 degrees of SOUTH of the rim is never
    seen: the mesa the ledge is cut into (its cliff, 4 to 7 m over the eye at 0 to 40 m, and its wings east and west)
    covers every bearing south of the line through its two noses (-24, 106.5) and (57, 102.5) from anywhere she can
    stand (x -0.65 .. 29.65, z 101.35 .. 111). Those triangles pay for the wings."""
    return all(abs(((p[0] - math.pi + math.pi) % (2 * math.pi)) - math.pi) < math.radians(60.0) for p in form)


# ---- polish round 5 (the visual critic, major: "a flat, untextured maroon cuboid with hard edges next to the layered
# cliff: it reads as greybox in the zone that carries the last image"). The mesa the ledge is cut into went on east and
# west of it as five plain quads in two colours, 0.3 m from the ledge's ends. They are WINGS of the same cliff now:
# env_far_rim.cliff_column (the rim's own profile, continued along the wall's line with the same noise, so its beds,
# buttresses and broken skyline run on), drawn here because the zone's chunk may not leave its box (x -2 .. 30) and this
# card may. Unlit like everything on this card: the light is painted (the lit cliff beside it reads `#381C2A` on a
# bed's face, `#251626` in a recess and `#15132A` under a lip in the game at blue hour).
W_LIT = hexlin("#44232A"); W_MID = hexlin("#2A1820"); W_SHADE = hexlin("#14121F"); W_CAP = hexlin("#4C2C2E"); W_SCREE = hexlin("#221C2A")
WING_W = [(-1.9, 111.25), (-7.0, 110.75), (-12.0, 109.9), (-18.0, 108.3), (-24.0, 106.4), (-27.0, 107.3)]
WING_E = [(29.9, 111.25), (34.0, 110.5), (38.5, 108.7), (43.0, 106.2), (48.0, 104.0), (53.0, 102.9), (57.0, 102.4), (60.0, 103.1)]
WING_ROWS = (0, 2, 3, 5, 8, 10, 13)               # of cliff_column's rows: foot, the proud bed's foot and top, the recess's top, two lips, the rim


def _spline(ctrl, sub):
    """Catmull-Rom through the control points, `sub` steps a segment (one more on the two segments next to the ledge,
    where the wing is seen from a few metres): [(x, z)]."""
    P = [ctrl[0]] + list(ctrl) + [ctrl[-1]]
    out = []
    for k in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[k - 1], P[k], P[k + 1], P[k + 2]
        n = sub + (1 if k <= 2 else 0)
        for j in range(n):
            t = j / n
            out.append(tuple(0.5 * (2 * p1[a] + (p2[a] - p0[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t * t + (3 * p1[a] - p0[a] - 3 * p2[a] + p3[a]) * t ** 3) for a in (0, 1)))
    out.append(tuple(ctrl[-1]))
    return out


def wing(card, ctrl, sgn):
    """One wing of the rim's cliff along `ctrl` (plan, from the cliff's end outward; sgn -1 west, +1 east)."""
    pts = _spline(ctrl, 2)
    FL = rimz.FLOOR
    cols = []
    s_ = 0.0
    for i, (px, pz) in enumerate(pts):
        if i: s_ += math.hypot(px - pts[i - 1][0], pz - pts[i - 1][1])
        a = pts[max(i - 1, 0)]; b = pts[min(i + 1, len(pts) - 1)]
        tx, tz = b[0] - a[0], b[1] - a[1]; l = math.hypot(tx, tz) or 1.0
        nx, nz = tz / l, -tx / l                                   # across the wall ...
        if nz > 0: nx, nz = -nx, -nz                               # ... outward: toward the plain (north)
        xv = ctrl[0][0] + sgn * s_                                 # where this column would stand if the cliff ran straight on: the same beds
        prof = rimz.cliff_column(xv)
        top = prof[13][1]
        h0 = 8.0 + 2.0 * vnoise(px * 0.1, pz * 0.1, 5)             # the scree's head (as the old wall's foot)
        rows = [(h0 - 0.6, 1.0), (FL - 2.0 - 0.5 * vnoise(xv / 3.0, 0.2, 71), 0.55 + 0.3 * vnoise(xv / 4.0, 0.7, 72))]
        rows += [(prof[r][1], -(prof[r][2] - rimz.ZF)) for r in WING_ROWS]          # (height, how far out from the wall's line)
        cols.append(([(px + nx * o, y, pz + nz * o) for (y, o) in rows], (nx, nz), xv, top))
    for i in range(len(cols) - 1):
        (A, n0, xa, ta), (B, n1, xb, tb) = cols[i], cols[i + 1]
        toward = (A[3][0] + n0[0] * 400.0, 19.0, A[3][2] + n0[1] * 400.0)
        for r in range(len(A) - 1):
            q = [A[r], B[r], B[r + 1], A[r + 1]]
            if q[2][1] - q[1][1] < 0.04 and q[3][1] - q[0][1] < 0.04: continue      # a bed that the skyline cut off
            tone = [0.78 + 0.44 * vnoise(v[0] * 0.21 + v[2] * 0.17, v[1] * 0.5, 34) for v in q]
            bed = [rock.bed_tone(0.25 * sum(v[1] for v in q))] * 4                  # one bed, one tone
            if r == 0: lo, hi_ = W_SCREE, mix(W_SHADE, W_MID, 0.55)                 # the foot going into the scree
            elif r == 1: lo, hi_ = mix(W_SHADE, W_MID, 0.6), mix(W_MID, W_SHADE, 0.45)   # under the ledge's level, to the cliff's undercut foot
            elif r == 2: lo, hi_ = mix(W_MID, W_SHADE, 0.2), W_SHADE                # the soft bed under the proud one: dark under its lip
            elif r == 3: lo, hi_ = W_LIT, mix(W_LIT, W_CAP, 0.25)                   # the proud bed's face
            elif r == 4: lo, hi_ = mix(W_MID, W_LIT, 0.55), mix(W_MID, W_SHADE, 0.35)    # the recess over it, battered back
            elif r == 5: lo, hi_ = mix(W_MID, W_LIT, 0.3), W_SHADE                  # to the first lip: shadow under it
            elif r == 6: lo, hi_ = W_LIT, mix(W_MID, W_SHADE, 0.6)                  # between the lips
            else: lo, hi_ = mix(W_LIT, W_CAP, 0.35), mix(W_CAP, ember_at(math.atan2(q[0][0] - CENTRE[0], -(q[0][2] - CENTRE[2]))), 0.10)   # the rim rock: it holds the last light
            cl = [mul(lo, tone[0] * bed[0]), mul(lo, tone[1] * bed[1]), mul(hi_, tone[2] * bed[2]), mul(hi_, tone[3] * bed[3])]
            facing_poly(card, q, cl, toward)


def under_ledge(card):
    """The rock the ledge's two ends stand on (the zone draws 0.94 m of each end's broken face, then nothing): dark,
    battered out to the scree, seen only by looking down over an end."""
    FL = rimz.FLOOR
    for (x0, sgn) in ((-1.5, -1.0), (29.5, 1.0)):
        zs = [100.3, 105.6, 111.3]
        prof = [(FL - 0.9, 0.0, mix(W_MID, W_SHADE, 0.5)), (FL - 5.0, 0.9, mix(W_MID, W_SHADE, 0.75)), (8.4, 2.4, W_SCREE)]
        for j in range(len(zs) - 1):
            for r in range(len(prof) - 1):
                (ya, oa, ca), (yb, ob, cb) = prof[r], prof[r + 1]
                q = [(x0 + sgn * oa, ya, zs[j]), (x0 + sgn * oa, ya, zs[j + 1]), (x0 + sgn * ob, yb, zs[j + 1]), (x0 + sgn * ob, yb, zs[j])]
                facing_poly(card, q, [ca, ca, cb, cb], (x0 + sgn * 400.0, 19.0, 105.0))


def build(card):
    # the same country as the day backdrop (same seeds, heights and radii: cards.mesas), re-coloured to the blue hour.
    # The renderer fogs these cards by at most 55 % (FARFOG), so they are authored DARK: the land is the dark third of
    # the last frame, the ember band behind the north-west rims the light one.
    # polish round 3 (R5 / R7): the last fire is seen 3 degrees under the horizon, 4 degrees east of north from the ledge:
    # its line of sight meets the plain 360 m out. Nothing of the two near rings stands within 9 degrees of that bearing
    # (the fire was drawn in front of a mesa's scree): the fire burns on the open, dark plain.
    ft = layout.marker("vista_fire")["params"]["target"]
    fb_ = math.atan2(ft[0] - CENTRE[0], -(ft[2] - CENTRE[2])) % (2 * math.pi)
    fire_clear = lambda b0, b1: abs(((0.5 * (b0 + b1) - fb_ + math.pi) % (2 * math.pi)) - math.pi) < math.radians(9) + 0.5 * (b1 - b0)
    layers = [(200.0, 1, 34.0, 0.1), (350.0, 2, 46.0, 0.35), (550.0, 3, 60.0, 0.6), (800.0, 4, 70.0, 0.8)]
    near = hexlin("#15172A"); far = hexlin("#333A5E")
    for (R, seed, H, f) in layers:
        def col(theta, level, f=f):
            base = mix(near, far, f)
            if level == 0: return mix(base, mix(PLAIN, FOG, 0.5 * f), 0.6)                      # the scree's foot goes into the plain
            if level == 1: return mix(base, FOG, 0.12)
            if level == 2: return mul(base, 0.82)                                            # the cliff: the darkest band
            return mix(base, ember_at(theta), 0.22 + 0.2 * f)                                # the rim catches the afterglow
        forms = cards.mesas(seed, H, R, low=north_low, clear=fire_clear if R < 400 else None, detail=1.0 if R < 500 else 0.5)
        cards.mesa_cards(card, CENTRE, R, [f for f in forms if not behind_rim(f)], col)
    # the valley floor between the rim and the first mesas: low hogbacks, darker than the plain behind them (depth by
    # overlap: ART_BIBLE 2.3), none in the north where the pylon line runs out to the fire
    lowc = lambda theta, level: mix(hexlin("#121426"), PLAIN, 0.75 if level == 0 else 0.0)
    tp = layout.marker("vista_plenty")["params"]["target"]
    tb_ = math.atan2(tp[0] - CENTRE[0], -(tp[2] - CENTRE[2])) % (2 * math.pi)                 # the town's bearing: no ridge stands behind or before it
    town = lambda b0, b1: abs(((0.5 * (b0 + b1) - tb_ + math.pi) % (2 * math.pi)) - math.pi) < math.radians(38) + 0.5 * (b1 - b0)
    cards.mesa_cards(card, CENTRE, 118.0, [f for f in cards.mesas(9, 15.0, 118.0, low=lambda b: 0.55 * north_low(b), clear=town) if not behind_rim(f)], lowc, y0=-1.5)
    cards.disc(card, CENTRE, 2.0, 140.0, -0.6, PLAIN, PLAIN, segs=24)        # the plain under and round the rim: no hole below the town
    # the far plain goes to the haze of ITS bearing (cold in the east, the ember band's colour under the afterglow),
    # and never brighter than the mesas that stand on it: no flat blue wedge between two buttes
    plain = PLAIN
    haze = lambda a: mix(mix(plain, FOG, 0.3), ember_at(a), 0.08)
    cards.disc(card, CENTRE, 140.0, 450.0, -0.6, plain, lambda a: mix(plain, haze(a), 0.6), segs=24)
    cards.disc(card, CENTRE, 450.0, 950.0, -1.5, lambda a: mix(plain, haze(a), 0.6), haze, segs=24)
    # the mesa the rim is cut into, east and west of the ledge: its cliff goes on either side (dark, near: the fog has
    # not reached it), scree at its foot. (plan x, z, rim height)
    cliff = hexlin("#2E1A1E"); cliff_top = hexlin("#4A2A2C"); scree = hexlin("#221C2A")
    for line in ([(30.2, 112.5, 24.5), (37.0, 109.5, 25.5), (46.0, 104.5, 24.0), (57.0, 102.5, 25.0), (70.0, 106.0, 22.5), (86.0, 119.0, 21.5), (98.0, 140.0, 20.0)],
                 [(-48.0, 124.0, 20.5), (-36.0, 110.5, 22.0), (-24.0, 106.5, 23.5), (-12.0, 110.0, 23.0), (-2.2, 112.5, 24.5)]):
        for k in range(len(line) - 1):
            (x0, z0, t0), (x1, z1, t1) = line[k], line[k + 1]
            l = math.hypot(x1 - x0, z1 - z0); nx, nz = (z1 - z0) / l, -(x1 - x0) / l          # outward: toward the plain (north)
            if nz > 0: nx, nz = -nx, -nz
            h0 = 8.0 + 2.0 * vnoise(x0 * 0.1, z0 * 0.1, 5); h1 = 8.0 + 2.0 * vnoise(x1 * 0.1, z1 * 0.1, 5)
            q = [(x0, h0, z0), (x1, h1, z1), (x1, t1, z1), (x0, t0, z0)]
            n_ = ((q[1][1] - q[0][1]) * (q[2][2] - q[0][2]) - (q[1][2] - q[0][2]) * (q[2][1] - q[0][1]), 0.0, (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[1][1] - q[0][1]) * (q[2][0] - q[0][0]))
            cols = [cliff, cliff, cliff_top, cliff_top]
            if n_[0] * nx + n_[2] * nz < 0: q = q[::-1]; cols = cols[::-1]
            if not (-24.5 < 0.5 * (x0 + x1) < 57.5): card.poly(q, cols)                    # polish round 5: nearer than the two noses the cliff is a WING (below), not this quad
            f0 = (x0 + nx * 13.0, -0.6, z0 + nz * 13.0); f1 = (x1 + nx * 13.0, -0.6, z1 + nz * 13.0)
            q = [f0, f1, (x1, h1, z1), (x0, h0, z0)]
            n_y = (q[1][2] - q[0][2]) * (q[2][0] - q[0][0]) - (q[1][0] - q[0][0]) * (q[2][2] - q[0][2])
            cols = [PLAIN, PLAIN, scree, scree]
            if n_y < 0: q = q[::-1]; cols = cols[::-1]
            card.poly(q, cols)
    wing(card, WING_W, -1.0); wing(card, WING_E, 1.0); under_ledge(card)
    # the pylon line on the plain, north
    py = layout.marker("prop_pylon")["pos"]
    d = 70.0; h = 15.0
    for k in range(9):
        x = py[0] + 6.0 * math.sin(k * 0.7) + 2.0 * k; z = py[2] - d
        pc = mix(hexlin("#0E0F1C"), FOG, clamp(0.05 + 0.07 * k))
        cards.pylon_card(card, (x, -0.5, z), h, (0.0, 1.0), pc)
        d *= 1.33; h *= 0.8
    # ---- polish round 3 (R7, "the last image"): what lies between the ledge and the far country is composed, not left
    # as one flat sheet.
    # (1) THE PLAYA: the dry lake Plenty stands at the edge of holds the sky's last light: long pale streaks on the plain
    #     behind and beside the town (not a disc under it), so the town's roofline is a dark shape against them. Streaks
    #     are thin lenses lying along the plain (east-west), soft at every edge (vertex gradient to the plain's colour).
    PAL = hexlin("#5A6190")

    def lens(cx, cz, half_len, half_dep, ang_deg, k, y, n=8):
        """A pale lens on the plain: centre fan `k` x PAL -> the plain at the rim; long axis turned ang_deg from east."""
        a = math.radians(ang_deg); ca, sa = math.cos(a), math.sin(a)
        core = mix(PLAIN, PAL, k)
        ring = []; mid = []
        for i in range(n):
            t = 2 * math.pi * i / n
            wob = 0.82 + 0.36 * vnoise(i * 1.31, cx * 0.01 + cz * 0.013, 77)
            u = math.cos(t) * half_len * wob; w = math.sin(t) * half_dep * wob
            ring.append((cx + u * ca - w * sa, y, cz + u * sa + w * ca))
            mid.append((cx + 0.45 * (u * ca - w * sa), y, cz + 0.45 * (u * sa + w * ca)))
        for i in range(n):
            j = (i + 1) % n
            facing_poly(card, [(cx, y, cz), mid[j], mid[i]], [core, core, core], EYE)
            facing_poly(card, [mid[i], mid[j], ring[j], ring[i]], [core, core, PLAIN, PLAIN], EYE)
    lens(tp[0] - 40.0, tp[2] - 95.0, 250.0, 62.0, 14.0, 1.0, -0.42)           # the main sheet, beyond the town, running off west
    lens(tp[0] + 95.0, tp[2] - 40.0, 120.0, 22.0, 6.0, 0.7, -0.38)            # a tongue of it east of the town
    lens(tp[0] - 150.0, tp[2] + 30.0, 110.0, 18.0, 20.0, 0.55, -0.40)         # and one nearer, to the west
    lens(tp[0] + 8.0, tp[2] + 12.0, 62.0, 30.0, 10.0, 0.5, -0.36)             # the swept ground the town itself stands on (dim)
    # (2) THREE RIDGES between the rim and the town, in stepped values (the nearest the darkest), each under the line
    #     from any eye on the ledge to the town's foot and to the fire: depth by overlap where there was one flat tone.
    R_COL = (hexlin("#0B0C16"), hexlin("#14162A"), hexlin("#1D2038"))

    def ridge(pts, top_c, seed):
        """pts: (x, z, crest height). A hogback card: crest toothed by noise, the colour running down into the plain."""
        for k in range(len(pts) - 1):
            (x0, z0, h0), (x1, z1, h1) = pts[k], pts[k + 1]
            n = max(1, int(math.hypot(x1 - x0, z1 - z0) / 17.0))
            for i in range(n):
                ta, tb = i / n, (i + 1) / n
                xa, za = x0 + (x1 - x0) * ta, z0 + (z1 - z0) * ta; xb, zb = x0 + (x1 - x0) * tb, z0 + (z1 - z0) * tb
                ha = (h0 + (h1 - h0) * ta) * (0.72 + 0.5 * vnoise(xa * 0.045, za * 0.045, seed)) if 0 < k + ta < len(pts) - 1 else 0.0
                hb = (h0 + (h1 - h0) * tb) * (0.72 + 0.5 * vnoise(xb * 0.045, zb * 0.045, seed)) if k + tb < len(pts) - 1 else 0.0
                q = [(xa, -0.9, za), (xb, -0.9, zb), (xb, hb, zb), (xa, ha, za)]
                foot = mix(top_c, PLAIN, 0.7)
                if max(ha, hb) < 0.05: continue
                crest = mix(top_c, ember_at(math.atan2(xa - CENTRE[0], -(za - CENTRE[2]))), 0.045)          # pass i1: the crest holds the afterglow (a lit line over each dark ridge)
                facing_poly(card, q, [foot, foot, crest, crest], EYE)
                # its back slope lying away on the plain, catching a little of the afterglow (seen from above)
                bx, bz = -(zb - za), (xb - xa); l = math.hypot(bx, bz) or 1.0
                if bx * (14.0 - xa) + bz * (104.0 - za) > 0: bx, bz = -bx, -bz
                bx, bz = bx / l, bz / l
                lit = mix(top_c, ember_at(math.atan2(xa - CENTRE[0], -(za - CENTRE[2]))), 0.30)
                qb = [(xa, ha, za), (xb, hb, zb), (xb + bx * hb * 2.6, -0.5, zb + bz * hb * 2.6), (xa + bx * ha * 2.6, -0.5, za + bz * ha * 2.6)]
                facing_poly(card, qb, [lit, lit, PLAIN, PLAIN], EYE)
    # (the town stands 117 to 142 m from the ledge: the line from an eye there to its foot is 8.5 m up at 68 m, 5 m at 90 m)
    ridge([(-70.0, 74.0, 0.0), (-52.0, 62.0, 4.2), (-30.0, 47.0, 4.8), (-12.0, 35.0, 3.6), (4.0, 24.0, 4.4), (14.0, 14.0, 0.0)], R_COL[0], 3)
    ridge([(-92.0, 62.0, 0.0), (-72.0, 48.0, 2.4), (-52.0, 36.0, 2.8), (-30.0, 22.0, 2.2), (-8.0, 6.0, 2.6), (10.0, -6.0, 0.0)], R_COL[1], 5)
    ridge([(-150.0, 10.0, 0.0), (-128.0, -4.0, 3.5), (-108.0, -20.0, 4.5), (-96.0, -38.0, 3.0), (-84.0, -58.0, 0.0)], R_COL[2], 8)      # west of the town and beyond it
    # (3) UNDER THE LEDGE: the mesa's foot as land (it was a flat sheet with a straight edge): talus fans falling to the
    #     plain, fins of harder rock running down them, the gully cut down the middle with its sand floor a paler thread
    #     that leads north to the pylon line and the fire. Faceted and shaded per face (sky from above, the afterglow
    #     from the north-west): the darkest land in the frame, the value anchor under the horizon.
    def foot_h(x, z):
        s_ = clamp((z - 22.0) / 78.0)
        W = 24.0 + 20.0 * s_
        e = smooth((W - abs(x - 14.0) + 9.0 * (vnoise(z * 0.06, 0.3, 21) - 0.5)) / 16.0)
        base = 12.1 * s_ ** 1.35
        fin = (abs(math.sin(x * 0.19 + 1.6 * vnoise(z * 0.03, 1.0, 23))) ** 0.6) * 3.4 * s_ * (1.15 - s_) * 2.0
        xg = 15.0 + 3.5 * math.sin(z / 17.0)
        g = math.exp(-((x - xg) / 5.5) ** 2)
        y = (base + fin) * e - 5.2 * g * min(1.0, s_ * 3.0)
        y = max(y, -0.6) if e > 0.02 else -0.6
        return min(y, 12.4), g
    # look-dev, polish round 3 (R7): the foot was shaded per FACE on a 7 m grid: from the ledge it was a fan of big flat
    # facets in three hues with a blue wedge down the middle (the frame's whole lower half in the fire view). Now a 4.5 m
    # grid coloured per VERTEX from the slope of foot_h itself (shared corners share a colour: the form turns smoothly),
    # darker (the land under the ledge is the darkest thing in the last image), the fins catching a breath of the
    # afterglow on their north-west sides only, the gully's sand a dim thread that leads the eye north to the fire.
    DK = hexlin("#07070F"); MD = hexlin("#1A1B30"); SANDC = hexlin("#3B3558"); ROSE = hexlin("#A2605E")      # pass i1: ROSE was #6A4450 (the last image's lower half read as one dark slab again: the crests are rim-lit now)

    def foot_col(x, z):
        h, gk = foot_h(x, z)
        e = 1.5
        hx = (foot_h(x + e, z)[0] - foot_h(x - e, z)[0]) / (2 * e); hz = (foot_h(x, z + e)[0] - foot_h(x, z - e)[0]) / (2 * e)
        l = math.sqrt(hx * hx + 1.0 + hz * hz)
        nx, ny, nz = -hx / l, 1.0 / l, -hz / l
        up = ny ** 2
        glow = clamp(-0.70 * nx + 0.10 * ny - 0.70 * nz)
        c = mix(DK, MD, 0.10 + 0.55 * up)
        # polish round 4 ("the lower 40 % of the last frame is one flat dark violet slab"): the afterglow RAKES the foot.
        # A fin's north-west flank takes a dull rose, its lee side goes to the land's black: stripes of light and dark
        # running away from the ledge toward the town and the fire (it was 10 % of the glow squared: nothing).
        c = mix(c, DK, 0.6 * clamp(nx * 2.2))
        c = mix(c, ROSE, 0.72 * clamp((glow - 0.10) / 0.36) ** 1.3)
        c = mix(c, SANDC, 0.7 * gk * up)
        c = mix(c, DK, 0.30 * smooth((z - 86.0) / 13.0))                                   # right under the ledge: the dark anchor
        return mix(PLAIN, c, clamp((h + 0.6) / 1.2))                                       # the foot goes into the plain
    # (finer where the eye is: under the ledge and round the gully; the asset's budget is 2 000 triangles)
    gx = [-35.0, -23.0, -11.0] + [-5.0 + 4.0 * i for i in range(11)] + [43.0, 51.0, 63.0]
    gz = [23.0, 33.0, 44.0, 55.0] + [62.6 + 4.66 * j for j in range(8)] + [99.9]
    for i in range(len(gx) - 1):
        for j in range(len(gz) - 1):
            cs = [(gx[i], gz[j]), (gx[i], gz[j + 1]), (gx[i + 1], gz[j + 1]), (gx[i + 1], gz[j])]
            hs = [foot_h(x, z) for (x, z) in cs]
            if max(h[0] for h in hs) <= -0.59: continue
            pts = [(x, h[0], z) for (x, z), h in zip(cs, hs)]
            cl = [foot_col(x, z) for (x, z) in cs]
            # split along the diagonal whose ends are nearer in height (the crease follows the fins, not the grid)
            tris = ((0, 1, 2), (0, 2, 3)) if abs(hs[0][0] - hs[2][0]) <= abs(hs[1][0] - hs[3][0]) else ((0, 1, 3), (1, 2, 3))
            for tri in tris:
                a_, b_, c_ = (pts[t] for t in tri)
                facing_poly(card, [a_, b_, c_], [cl[t] for t in tri], (a_[0], 1e6, a_[2]))
    return layout.marker("vista_fire")["params"]["target"]


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    card = cards.Card(ASSET + "_mesh")
    fire = build(card)
    card.realize("backdrop_dusk")
    export.marker("socket_last_fire", layout.to_blender(fire))
    print(f"BACKDROP {ASSET}: {card.tris()} triangles")
    export.export_asset(ASSET, args.out, blend=args.blend)


if __name__ == "__main__":
    scene.run(main)
