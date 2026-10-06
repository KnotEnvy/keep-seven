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
        cards.mesa_cards(card, CENTRE, R, forms, col)
    # the valley floor between the rim and the first mesas: low hogbacks, darker than the plain behind them (depth by
    # overlap: ART_BIBLE 2.3), none in the north where the pylon line runs out to the fire
    lowc = lambda theta, level: mix(hexlin("#121426"), PLAIN, 0.75 if level == 0 else 0.0)
    tp = layout.marker("vista_plenty")["params"]["target"]
    tb_ = math.atan2(tp[0] - CENTRE[0], -(tp[2] - CENTRE[2])) % (2 * math.pi)                 # the town's bearing: no ridge stands behind or before it
    town = lambda b0, b1: abs(((0.5 * (b0 + b1) - tb_ + math.pi) % (2 * math.pi)) - math.pi) < math.radians(38) + 0.5 * (b1 - b0)
    cards.mesa_cards(card, CENTRE, 118.0, cards.mesas(9, 15.0, 118.0, low=lambda b: 0.55 * north_low(b), clear=town), lowc, y0=-1.5)
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
            card.poly(q, cols)
            f0 = (x0 + nx * 13.0, -0.6, z0 + nz * 13.0); f1 = (x1 + nx * 13.0, -0.6, z1 + nz * 13.0)
            q = [f0, f1, (x1, h1, z1), (x0, h0, z0)]
            n_y = (q[1][2] - q[0][2]) * (q[2][0] - q[0][0]) - (q[1][0] - q[0][0]) * (q[2][2] - q[0][2])
            cols = [PLAIN, PLAIN, scree, scree]
            if n_y < 0: q = q[::-1]; cols = cols[::-1]
            card.poly(q, cols)
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
                facing_poly(card, q, [foot, foot, top_c, top_c], EYE)
                # its back slope lying away on the plain, catching a little of the afterglow (seen from above)
                bx, bz = -(zb - za), (xb - xa); l = math.hypot(bx, bz) or 1.0
                if bx * (14.0 - xa) + bz * (104.0 - za) > 0: bx, bz = -bx, -bz
                bx, bz = bx / l, bz / l
                lit = mix(top_c, ember_at(math.atan2(xa - CENTRE[0], -(za - CENTRE[2]))), 0.10)
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
    DK = hexlin("#07070F"); MD = hexlin("#1A1B30"); SANDC = hexlin("#2C2A44"); ROSE = hexlin("#6A4450")

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
        c = mix(c, ROSE, 0.55 * clamp((glow - 0.14) / 0.42))
        c = mix(c, SANDC, 0.7 * gk * up)
        c = mix(c, DK, 0.45 * smooth((z - 84.0) / 15.0))                                   # right under the ledge: the dark anchor
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
