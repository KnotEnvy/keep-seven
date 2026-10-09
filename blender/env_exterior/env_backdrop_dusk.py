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
_TZ = 98.5 - 2.6 * 22                            # where the wash leaves the rock (build_foot zs[-1])
TRACK_X = lambda z: (15.0 + 3.5 * math.sin(max(z, _TZ) / 17.0)) + (0.0 if z >= _TZ else 0.10 * (_TZ - z) + 2.6 * math.sin((_TZ - z) / 9.0) * clamp((_TZ - z) / 12.0))   # the track on the plain (build_foot xw)


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


FOOT_LEVELS = (0.25, 1.1, 2.0, 3.0, 4.1, 5.2, 6.4, 7.6, 8.8, 10.0, 11.1, 12.0)      # the beds that hold the talus (heights over the plain)
FOOT_X = [-36.0, -27.0, -19.0, -13.5] + [-10.0 + 2.0 * i + 1.1 * (vnoise(i * 1.37, 0.5, 91) - 0.5) for i in range(19)] + [29.5, 34.0, 41.0, 50.0, 63.0]
FOOT_EYES = ((0.0, 19.65, 102.0), (14.0, 19.65, 102.0), (29.0, 19.65, 102.0), (14.0, 19.65, 110.0))
NW = (-0.7071, -0.7071)                          # toward the afterglow (plan)
LIP_W = (0.85, 0.75); LIP_PEAK = 0.58            # pass i6: the lit band's width (m: base, + noise) and its peak against pass i5's
LIPC = hexlin("#9A5A52")                         # a lip in the afterglow: a dull rose, under the town's lamps and the fire in value


def build_foot(card, foot_h, DK, MD, ROSE, CREST, THREAD):
    Hf = lambda x, z: foot_h(x, z)[0]
    Z0, Z1 = 39.0, 99.9

    def contour(x, lv):
        """z of the bed `lv` in the column x: the lowest z from which the ground stays at or over it up to the ledge."""
        if Hf(x, Z1) < lv: return Z1
        z = Z1
        while z > Z0 and Hf(x, z - 1.0) >= lv: z -= 1.0
        if z <= Z0: return Z0
        lo, hi = z - 1.0, z
        for _ in range(12):
            m = 0.5 * (lo + hi)
            if Hf(x, m) >= lv: hi = m
            else: lo = m
        return hi
    C = [[contour(x, lv) for x in FOOT_X] for lv in FOOT_LEVELS]
    C.append([Z1] * len(FOOT_X))
    nx_ = len(FOOT_X)

    def up_n(k, i):
        """The uphill direction (plan) of contour k at column i."""
        a = (FOOT_X[max(i - 1, 0)], C[k][max(i - 1, 0)]); b = (FOOT_X[min(i + 1, nx_ - 1)], C[k][min(i + 1, nx_ - 1)])
        tx, tz = b[0] - a[0], b[1] - a[1]; l = math.hypot(tx, tz) or 1.0
        n = (-tz / l, tx / l)
        return n if n[1] >= 0 else (-n[0], -n[1])                                 # the ledge is uphill (+z) of every bed

    def bed_c(lv, x, z):
        """A tread's own tone: the land's dark, each bed a little its own, violet under the sky."""
        t = rock.bed_tone(lv * 1.5 + 0.3) * (0.82 + 0.36 * vnoise(x * 0.11, z * 0.13 + lv, 41))
        warm = 0.5 + 0.5 * math.sin(lv * 2.1 + 0.6)
        return mul(mix(mix(DK, MD, 0.55), hexlin("#22141E"), 0.40 * warm), t)
    fade = lambda lv, c: mix(PLAIN, c, clamp((lv + 0.5) / 2.2))                    # the lowest beds go into the plain
    n_tread = n_lip = n_riser = 0
    for k, lv in enumerate(FOOT_LEVELS):
        y = lv
        for i in range(nx_ - 1):
            xa, xb = FOOT_X[i], FOOT_X[i + 1]
            a0, a1 = C[k][i], C[k][i + 1]; b0, b1 = C[k + 1][i], C[k + 1][i + 1]
            d0, d1 = b0 - a0, b1 - a1
            if max(d0, d1) < 0.08: continue
            if min(a0, a1) >= Z1 - 0.01: continue
            na, nb = up_n(k, i), up_n(k, i + 1)
            # the lip: the outer hand's breadth of the tread holds the afterglow, brightest where it looks north-west,
            # and not everywhere: a lip is broken, sanded over or in a neighbour's lee for half its length
            # pass i6 (both visual reviewers: "near-black terraces whose every edge is traced by a thin bright orange line,
            # reading as outlined polygons"): the afterglow lies ACROSS a bed's top. The lit band is a pace to two wide
            # (it was a hand, 0.26 to 0.42 m), feathered to the tread's own tone at its inner side, and its peak is
            # LIP_PEAK of the old one: a soft rim light on the terrace, not a drawn line
            wa = min(LIP_W[0] + LIP_W[1] * vnoise(xa * 0.3, lv, 43), 0.62 * d0); wb = min(LIP_W[0] + LIP_W[1] * vnoise(xb * 0.3, lv, 43), 0.62 * d1)
            A0 = (xa, y, a0); A1 = (xb, y, a1)
            L0 = (xa, y, a0 + wa); L1 = (xb, y, a1 + wb)
            B0 = (xa, y, max(b0, a0 + wa)); B1 = (xb, y, max(b1, a1 + wb))
            tx, tz = xb - xa, a1 - a0; l = math.hypot(tx, tz) or 1.0
            out = (tz / l, -tx / l)
            if out[1] > 0: out = (-out[0], -out[1])                               # the lip looks downhill
            g = clamp(0.22 + 0.78 * (out[0] * NW[0] + out[1] * NW[1]))
            tc0 = fade(lv, bed_c(lv, xa, a0)); tc1 = fade(lv, bed_c(lv, xb, a1))
            near = clamp((0.5 * (a0 + a1) - 44.0) / 30.0)                         # the far beds are fainter: they are small in the frame
            def edge(tc, x_, z_):
                live = smooth((vnoise(x_ * 0.19 + lv * 1.7, z_ * 0.07, 47) - 0.36) / 0.22)
                return mix(tc, mul(LIPC, 0.7 + 0.5 * vnoise(x_ * 0.4, lv * 3.0, 48)), clamp(LIP_PEAK * (0.05 + 0.62 * g ** 1.4) * (0.35 + 0.65 * live) * (0.45 + 0.55 * near) * clamp((lv + 0.4) / 1.6)))
            e0, e1 = edge(tc0, xa, a0), edge(tc1, xb, a1)
            lit = max(abs(e0[0] - tc0[0]), abs(e1[0] - tc1[0])) > 0.004
            if lit and min(wa, wb) > 0.03:
                facing_poly(card, [A0, A1, L1, L0], [e0, e1, mix(tc1, e1, 0.04), mix(tc0, e0, 0.04)], (xa, 1e6, a0)); n_lip += 1
            else: L0, L1 = A0, A1
            # the tread behind the lip: darker toward the riser that stands over it
            if max(B0[2] - L0[2], B1[2] - L1[2]) > 0.05:
                in0 = mul(tc0, 0.5); in1 = mul(tc1, 0.5)
                facing_poly(card, [L0, L1, B1, B0], [tc0, tc1, in1, in0], (xa, 1e6, a0)); n_tread += 1
            # the riser over this tread (bed k + 1's face), where an eye on the ledge can see it
            if k + 1 < len(FOOT_LEVELS) and max(b0, b1) < Z1 - 0.01:
                y1 = FOOT_LEVELS[k + 1]
                rx, rz = xb - xa, b1 - b0; l = math.hypot(rx, rz) or 1.0
                rn = (rz / l, -rx / l)
                if rn[1] > 0: rn = (-rn[0], -rn[1])
                mid = (0.5 * (xa + xb), 0.5 * (y + y1), 0.5 * (b0 + b1))
                if any(rn[0] * (e[0] - mid[0]) + rn[1] * (e[2] - mid[2]) > 0.8 for e in FOOT_EYES):
                    gr = clamp(0.15 + 0.85 * (rn[0] * NW[0] + rn[1] * NW[1]))
                    tone = rock.bed_tone(y1 * 1.5 + 0.3) * (0.8 + 0.4 * vnoise(mid[0] * 0.23, mid[2] * 0.19, 53))
                    face = mul(mix(mix(DK, hexlin("#1C121C"), 0.6), ROSE, 0.42 * gr ** 1.3), tone)
                    lo_ = fade(lv, mul(face, 0.55)); hi_ = fade(y1, face)
                    facing_poly(card, [(xa, y, b0), (xb, y, b1), (xb, y1, b1), (xa, y1, b0)], [lo_, lo_, hi_, hi_], (mid[0] + rn[0] * 50.0, mid[1], mid[2] + rn[1] * 50.0)); n_riser += 1
    # the wash: the sand floor of the gully, a hand over each tread it crosses, breaking at every bed's pour-over
    xg = lambda z: 15.0 + 3.5 * math.sin(z / 17.0)
    lev = lambda z: max([lv for lv in FOOT_LEVELS if Hf(xg(z), z) >= lv] or [-0.6])
    zs = [98.5 - 2.6 * j for j in range(23)]
    n_wash = 0
    for j in range(len(zs) - 1):
        za, zb = zs[j], zs[j + 1]
        la, lb = lev(za), lev(zb)
        cuts = [(za, zb, la)]
        if la != lb:
            lo, hi = zb, za
            for _ in range(10):
                m = 0.5 * (lo + hi)
                if lev(m) == la: hi = m
                else: lo = m
            cuts = [(za, hi + 0.15, la), (hi - 0.15, zb, lb)]
        for (u0, u1, lv) in cuts:
            if lv < 0.0 or u0 - u1 < 0.2: continue
            w0 = 0.75 + 0.5 * vnoise(u0 * 0.21, 1.0, 59); w1 = 0.75 + 0.5 * vnoise(u1 * 0.21, 1.0, 59)
            c0 = fade(lv, mul(THREAD, 0.26 + 0.12 * vnoise(u0 * 0.3, 2.0, 61))); c1 = fade(lv, mul(THREAD, 0.26 + 0.12 * vnoise(u1 * 0.3, 2.0, 61)))
            q = [(xg(u0) - w0, lv + 0.07, u0), (xg(u0) + w0, lv + 0.07, u0), (xg(u1) + w1, lv + 0.07, u1), (xg(u1) - w1, lv + 0.07, u1)]
            facing_poly(card, q, [c0, c0, c1, c1], (q[0][0], 1e6, q[0][2])); n_wash += 1
    # ... and out over the plain: the wash runs on as a faint pale line toward the pylon line and the fire (the eye is
    # led from the rock at her feet to the light), thinner and fainter until the plain has it
    zs2 = [zs[-1] + 1.0 - 5.5 * j for j in range(17)]
    xw = lambda z: xg(max(z, zs[-1])) + (0.0 if z >= zs[-1] else 0.10 * (zs[-1] - z) + 2.6 * math.sin((zs[-1] - z) / 9.0) * clamp((zs[-1] - z) / 12.0))
    kw = lambda j: clamp(j / 2.0) * (1.0 - j / (len(zs2) - 1)) ** 0.8          # it comes out of the rock's shadow, then thins away
    for j in range(len(zs2) - 1):
        u0, u1 = zs2[j], zs2[j + 1]
        k0, k1 = kw(j), kw(j + 1)
        w0 = 0.35 + 0.6 * k0; w1 = 0.35 + 0.6 * k1
        c0 = mix(PLAIN, mul(THREAD, 0.42), 0.80 * k0); c1 = mix(PLAIN, mul(THREAD, 0.42), 0.80 * k1)      # pass i6: 0.30 at 0.55 (the track to the fire was all but lost on the plain)
        q = [(xw(u0) - w0, -0.52, u0), (xw(u0) + w0, -0.52, u0), (xw(u1) + w1, -0.52, u1), (xw(u1) - w1, -0.52, u1)]
        facing_poly(card, q, [c0, c0, c1, c1], (q[0][0], 1e6, q[0][2])); n_wash += 1
    # (the plain's inner disc starts 2 m from CENTRE: the old foot covered that hole, the wash's floor does not)
    facing_poly(card, [(CENTRE[0] + 2.3 * math.sin(t * math.pi / 4), -0.6, CENTRE[2] - 2.3 * math.cos(t * math.pi / 4)) for t in range(8)], [PLAIN] * 8, (CENTRE[0], 1e6, CENTRE[2]))
    # loose blocks that came off the lips: dark, a lit facet toward the afterglow (four faces each)
    import random as _r
    rng = _r.Random(515)
    n_block = 0
    for _ in range(60):
        if n_block >= 16: break
        x = rng.uniform(-9.0, 27.0); z = rng.uniform(58.0, 92.0)
        h = Hf(x, z); lv = max([l_ for l_ in FOOT_LEVELS if h >= l_] or [-1.0])
        if lv < 1.0 or abs(x - xg(z)) < 2.2: continue
        s_ = rng.uniform(0.55, 1.5); a0 = rng.uniform(0, 6.283)
        base = [(x + math.cos(a0 + t) * s_ * rng.uniform(0.7, 1.1), lv, z + math.sin(a0 + t) * s_ * rng.uniform(0.7, 1.1)) for t in (0.0, 1.7, 3.2, 4.8)]
        apex = (x + rng.uniform(-0.3, 0.3) * s_, lv + s_ * rng.uniform(0.55, 0.95), z + rng.uniform(-0.3, 0.3) * s_)
        for t in range(4):
            p0, p1 = base[t], base[(t + 1) % 4]
            mx, mz = 0.5 * (p0[0] + p1[0]) - x, 0.5 * (p0[2] + p1[2]) - z; l = math.hypot(mx, mz) or 1.0
            gb = clamp((mx * NW[0] + mz * NW[1]) / l)
            cb = mix(mul(DK, 1.6), ROSE, 0.55 * gb ** 1.2)
            facing_poly(card, [p0, p1, apex], [mul(cb, 0.6), mul(cb, 0.6), mix(cb, CREST, 0.35 * gb)], (x + mx * 50, lv + 20.0, z + mz * 50))
        n_block += 1
    print("FOOT under the pylon (-7.7, 61):", max([l_ for l_ in FOOT_LEVELS if Hf(-7.7, 61.0) >= l_] or [-0.6]), round(Hf(-7.7, 61.0), 2))
    print(f"FOOT: {n_lip} lips, {n_tread} treads, {n_riser} risers, {n_wash} wash, {n_block} blocks")


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
    # ---- pass i6 (both visual reviewers: "the ground between the rim and the town is a featureless dark violet field",
    # "break the dark slope below the town with two or three faint lit ridges or the path"): the flat east of the gully's
    # line had nothing on it. (a) Two low swells there, in stepped values, their back slopes holding the sky's cold
    # light; (b) a dry wash that leaves the track under the apron's toe and wanders off east, pale where its bed is
    # swept (it catches the sky as the playa does), coming and going; (c) scrub along its banks and the track's: dark
    # tufts, read against the paler beds. All flat tones on the plain, under every line from the ledge to the fire.
    ridge([(34.0, 33.0, 0.0), (48.0, 26.0, 2.0), (66.0, 18.0, 2.7), (88.0, 12.0, 2.0), (112.0, 10.0, 0.0)], hexlin("#0F111E"), 13)
    ridge([(38.0, -2.0, 0.0), (58.0, -10.0, 2.4), (82.0, -17.0, 3.2), (106.0, -20.0, 2.3), (132.0, -19.0, 0.0)], hexlin("#181B30"), 17)
    ridge([(-46.0, 86.0, 0.0), (-36.0, 74.0, 1.5), (-27.0, 63.0, 2.1), (-19.0, 53.0, 1.5), (-12.0, 45.0, 0.0)], hexlin("#10121E"), 21)      # ... and one west of the apron, under the dead pylon's line
    wz = lambda x: 41.0 - 0.21 * (x - 17.0) + 2.6 * math.sin((x - 17.0) / 8.5) + 1.3 * math.sin((x - 17.0) / 3.7 + 1.0)
    wk = lambda x: clamp((x - 17.0) / 8.0) * clamp((99.0 - x) / 40.0) * smooth((vnoise(x * 0.085, 0.4, 83) - 0.30) / 0.30)
    xs_ = [17.0 + 5.2 * j for j in range(17)]
    for j in range(len(xs_) - 1):
        x0, x1 = xs_[j], xs_[j + 1]
        k0, k1 = wk(x0), wk(x1)
        if max(k0, k1) < 0.05: continue
        h0, h1 = 0.55 + 0.9 * vnoise(x0 * 0.2, 1.7, 84), 0.55 + 0.9 * vnoise(x1 * 0.2, 1.7, 84)
        c0 = mix(PLAIN, PAL, clamp(0.40 * k0)); c1 = mix(PLAIN, PAL, clamp(0.40 * k1))
        facing_poly(card, [(x0, -0.50, wz(x0) - h0), (x1, -0.50, wz(x1) - h1), (x1, -0.50, wz(x1) + h1), (x0, -0.50, wz(x0) + h0)], [c0, c1, mix(PLAIN, c1, 0.55), mix(PLAIN, c0, 0.55)], (x0, 1e6, 0.0))
    import random as _r6
    rg = _r6.Random(606)
    SCRUB = hexlin("#090A14")
    def tuft(x, z, w, h):
        tx = (EYE[2] - z, -(EYE[0] - x)); l = math.hypot(*tx) or 1.0; tx = (tx[0] / l, tx[1] / l)       # across the view from the ledge
        pts = [(x - tx[0] * w, -0.55, z - tx[1] * w), (x + tx[0] * w, -0.55, z + tx[1] * w), (x + tx[0] * w * rg.uniform(0.2, 0.7), h, z + tx[1] * w * 0.4), (x - tx[0] * w * rg.uniform(0.3, 0.8), h * rg.uniform(0.6, 0.95), z - tx[1] * w * 0.5)]
        facing_poly(card, pts, [SCRUB, SCRUB, mul(SCRUB, 1.5), mul(SCRUB, 1.5)], EYE)
    for j in range(9):                                # in twos and threes, not a row: thickets where the bed holds water longest
        x = rg.uniform(24.0, 90.0); side = rg.choice((-1.0, 1.0)); z = wz(x) + side * rg.uniform(1.8, 5.5)
        for m in range(rg.choice((1, 2, 2, 3))):
            tuft(x + rg.uniform(-2.6, 2.6), z + rg.uniform(-1.6, 1.6), rg.uniform(0.6, 1.7), rg.uniform(0.5, 1.3))
    for j in range(6):
        z = rg.uniform(-34.0, 30.0)
        tuft(TRACK_X(z) + rg.choice((-1.0, 1.0)) * rg.uniform(3.0, 11.0), z, rg.uniform(0.7, 1.6), rg.uniform(0.6, 1.2))
    for (x, z) in ((-30.0, 78.0), (-22.0, 70.0), (-33.0, 58.0), (-17.0, 60.0), (-40.0, 66.0)):
        tuft(x + rg.uniform(-2.0, 2.0), z + rg.uniform(-2.0, 2.0), rg.uniform(0.7, 1.5), rg.uniform(0.6, 1.2))
    # (3) UNDER THE LEDGE: the mesa's foot as land (it was a flat sheet with a straight edge): talus fans falling to the
    #     plain, fins of harder rock running down them, the gully cut down the middle with its sand floor a paler thread
    #     that leads north to the pylon line and the fire. Faceted and shaded per face (sky from above, the afterglow
    #     from the north-west): the darkest land in the frame, the value anchor under the horizon.
    def foot_h(x, z):
        # pass i5: the apron reaches the plain 60 m out (it ran 78 m: with the last view level it filled the frame's lower
        # 30 %), its spurs are rounded buttresses with broken edges (the two |sin| families drew chevrons on the benches)
        s_ = clamp((z - 40.0) / 60.0)
        W = 24.0 + 20.0 * s_
        e = smooth((W - abs(x - 14.0) + 9.0 * (vnoise(z * 0.06, 0.3, 21) - 0.5)) / 16.0)
        base = 12.1 * s_ ** 1.25
        k_ = s_ * (1.15 - s_) * 2.0
        fin = 2.9 * (0.5 + 0.5 * math.cos(x * 0.31 + 1.9 * vnoise(z * 0.035, 1.0, 23))) ** 1.6 * k_
        fin += 1.5 * (vnoise(x * 0.42, z * 0.16, 27) - 0.5) * clamp(s_ * 5.0)                # blocks that came away: every lip is broken
        fin += 0.7 * (vnoise(x * 1.1, z * 0.45, 31) - 0.5) * clamp(s_ * 5.0)
        xg = 15.0 + 3.5 * math.sin(z / 17.0)
        g = math.exp(-((x - xg) / 4.6) ** 2)
        y = (base + fin) * e - 5.4 * g * min(1.0, s_ * 3.0)
        y = max(y, -0.6) if e > 0.02 else -0.6
        return min(y, 12.4), g
    # look-dev, polish round 3 (R7): the foot was shaded per FACE on a 7 m grid: from the ledge it was a fan of big flat
    # facets in three hues with a blue wedge down the middle (the frame's whole lower half in the fire view). Now a 4.5 m
    # grid coloured per VERTEX from the slope of foot_h itself (shared corners share a colour: the form turns smoothly),
    # darker (the land under the ledge is the darkest thing in the last image), the fins catching a breath of the
    # afterglow on their north-west sides only, the gully's sand a dim thread that leads the eye north to the fire.
    DK = hexlin("#07070F"); MD = hexlin("#1A1B30"); SANDC = hexlin("#3B3558"); ROSE = hexlin("#A2605E")      # pass i1: ROSE was #6A4450 (the last image's lower half read as one dark slab again: the crests are rim-lit now)

    CREST = hexlin("#C9806A"); THREAD = hexlin("#6C5E8C")

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
        # pass i4: a CREST is a line of light. Where the ground stands over its neighbours two metres to either side (a
        # fin's or a rib's top, a bench's lip) it holds the afterglow as a thin apricot edge; the hollow between two of
        # them goes to the land's black. The gully's floor is a paler thread that runs out toward the fire
        e2 = 2.2
        crest = h - 0.25 * (foot_h(x + e2, z)[0] + foot_h(x - e2, z)[0] + foot_h(x, z + e2)[0] + foot_h(x, z - e2)[0])
        c = mix(c, DK, 0.7 * clamp((0.12 - crest) / 0.5))
        c = mix(c, CREST, 0.72 * clamp((crest - 0.30) / 0.55) ** 1.6 * (0.35 + 0.65 * clamp(0.5 - 0.5 * nx - 0.4 * nz)))
        c = mix(c, THREAD, 0.55 * clamp((gk - 0.72) / 0.28) * up)
        c = mix(c, DK, 0.30 * smooth((z - 86.0) / 13.0))                                   # right under the ledge: the dark anchor
        return mix(PLAIN, c, clamp((h + 0.6) / 1.2))                                       # the foot goes into the plain
    # ---- pass i5 (both visual reviewers, a major each: "the bottom 30 % of the last image is a smooth low-detail pink
    # mound with a pale lavender streak down its middle", "smooth-shaded, untextured pink clay with a blurry blue-white
    # smear": the foot was a 2 x 3 m grid coloured per VERTEX, so every form on it was an airbrushed gradient beside the
    # ledge's crisp rock). The foot is now BENCHED RIMROCK, built from the same height field: every bed that holds the
    # talus is a level tread ending in a broken lip, the lips hold the afterglow as thin lines (brightest where they
    # face the north-west), the treads are the land's dark, the risers show only where the beds turn into the wash
    # (lit rose on the flank that faces the afterglow, black on the other). The wash itself is a dry floor of sand that
    # steps down bench by bench toward the pylon line and the fire: the gully she came up, seen from over it. Flat tones
    # with hard edges, as the cliff's wings and the loose rock on the ledge are drawn: no gradient wider than a lip.
    build_foot(card, foot_h, DK, MD, ROSE, CREST, THREAD)
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
