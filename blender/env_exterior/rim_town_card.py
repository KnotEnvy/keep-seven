"""rim_town_card: Plenty from the far rim at blue hour (docs/workorders/art-env-exterior.md 4.5): a 60 x 14 m card set in
three layers at the layout's vista_plenty target: the yard's drum and wind-pump, the Tally House's flat roof, the
false fronts of Front Street, the gatehouse. Silhouette in m_flat (UNLIT); the 48 window quads are ONE m_emis lamp set
`town_windows` (quad i has UV1.x = (i + 0.5) / 48; lighting order spreads outward from the Tally House; COLOR_0
R = intensity, flame cell). Empty `socket_thread` at the base of the plumb aqua thread (the drum's top)."""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _d)
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
import math, random
from lib import scene, layout, export, zone as zonelib
import ext_cards as cards
from ext_cards import hexlin
from ext_kit import mix, mul, clamp, vnoise

ASSET = "rim_town_card"
N_WIN = 48


def main():
    """Polish round 2: the card is the town at its own scale (fronts 6-9 m wide and 5-7 m tall, the Tally House 14 m, the
    drum 8 x 6 m, the derrick to 14 m), standing on the dusk backdrop's plain (y -0.6; it used to start 1.4 m under it,
    which buried the lower windows), darkest in front, every building with the sky's light on its roof (a paler sheared
    band over a dark wall: what makes a silhouette read as roofs), and the 48 windows at 0.9 x 1.1 m, each one on a wall.
    The pale ridge that stood behind the town is gone: it was the lightest shape in the frame."""
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    vp = layout.marker("vista_plenty"); tgt = vp["params"]["target"]; eye = vp["pos"]
    dx = eye[0] - tgt[0]; dz = eye[2] - tgt[2]; l = math.hypot(dx, dz)
    f = (dx / l, dz / l)                                     # toward the viewer
    r = (f[1], -f[0])                                        # across the card, viewer's right = east
    base_y = -0.6
    # look-dev, polish round 3 (R5 / R7, "a real town under lit windows"): at its own scale the town was 280 x 30 px of a
    # 1280 px frame, its windows 3 x 6 px: a row of boxes with dots. A far card is a picture, not a survey: everything
    # on it is drawn K times its size about the card's centre foot (a long lens on the town), so a front stands 45 to
    # 60 px tall, a lit sash is 6 x 11 px, and the derrick and its rotor break the horizon.
    K = 1.7
    # polish round 4 (R5): the picture stands SH metres east of the vista's target. The end card's panel covers the right
    # 36 to 40 % of the last frame, so the view is eased less far toward the town (src/world/ending.ts TURN_TOWARD_TOWN:
    # the fire 5 degrees right of centre, it was 12) and the town comes 5.6 degrees toward the fire to stay whole in the
    # frame's left half.
    SH = 12.5
    P = lambda u, y, w=0.0: (tgt[0] + r[0] * (u * K + SH) - f[0] * w, base_y + y * K, tgt[2] + r[1] * (u * K + SH) - f[1] * w)
    G = lambda u, w, y=0.42: (tgt[0] + r[0] * (u * K + SH) - f[0] * w, base_y + y, tgt[2] + r[1] * (u * K + SH) - f[1] * w)     # a point lying on the swept ground (w metres behind the card's plane; negative = toward the rim)
    card = cards.Card("town")
    rng = random.Random(77)
    FRONT = hexlin("#10121F"); MID = hexlin("#171A2E"); BACK = hexlin("#20243C"); ROOF = hexlin("#39416A"); GROUND = hexlin("#232842")
    wins = []

    stacks = []

    def house(u0, u1, h, w, col, kind="flat", roof=0.75, shear=0.9, rows=(1.0,), per=2, win=True, porch=False):
        """One building: a wall with its top (flat / stepped false front / pediment), and behind it the roof going
        back from the eave: a paler band sheared to one side."""
        he = h - (0.9 if kind != "flat" else 0.0)                         # the eave behind a false front
        card.poly([P(u0 + shear, he, w + 0.4), P(u1 + shear, he, w + 0.4), P(u1 + shear * 1.6, he + roof, w + 0.4), P(u0 + shear * 1.6, he + roof, w + 0.4)], [mix(col, ROOF, 0.55), mix(col, ROOF, 0.55), ROOF, ROOF])
        foot = mix(col, GROUND, 0.5)
        if kind == "step":
            a = (u1 - u0) * 0.22
            for (a0, a1, hh) in ((u0, u0 + a, h - 0.9), (u0 + a, u1 - a, h), (u1 - a, u1, h - 0.9)):
                card.poly([P(a0, 0, w), P(a1, 0, w), P(a1, hh, w), P(a0, hh, w)], [foot, foot, col, col])
        elif kind == "ped":
            card.poly([P(u0, 0, w), P(u1, 0, w), P(u1, h - 0.9, w), P(u0, h - 0.9, w)], [foot, foot, col, col])
            card.poly([P(u0, h - 0.9, w), P(u1, h - 0.9, w), P((u0 + u1) / 2, h, w)], col)
        elif kind == "gable":
            # a pitched roof seen end-on: the wall to the eave, the gable above it, a stack on the ridge
            card.poly([P(u0, 0, w), P(u1, 0, w), P(u1, h - 1.9, w), P(u0, h - 1.9, w)], [foot, foot, col, col])
            card.poly([P(u0 - 0.35, h - 1.9, w), P(u1 + 0.35, h - 1.9, w), P((u0 + u1) / 2, h, w)], col)
            sx = u0 + (u1 - u0) * 0.72
            card.poly([P(sx, h - 1.5, w), P(sx + 0.6, h - 1.5, w), P(sx + 0.6, h + 0.7, w), P(sx, h + 0.7, w)], col)
        elif kind == "side":
            # polish round 4 ("five boxes"): a pitched roof seen from its long side: the wall to the eave, then the roof's
            # near slope as a paler trapezoid (it holds the sky), hipped in at both ends, a stack through it
            he2 = h - 1.7
            card.poly([P(u0, 0, w), P(u1, 0, w), P(u1, he2, w), P(u0, he2, w)], [foot, foot, col, col])
            rc = mix(col, ROOF, 0.62)
            card.poly([P(u0 - 0.4, he2, w - 0.05), P(u1 + 0.4, he2, w - 0.05), P(u1 - 0.9, h, w - 0.05), P(u0 + 0.9, h, w - 0.05)], [mix(col, ROOF, 0.35), mix(col, ROOF, 0.35), rc, rc])
            sx = u0 + (u1 - u0) * 0.3
            card.poly([P(sx, h - 0.9, w - 0.06), P(sx + 0.55, h - 0.9, w - 0.06), P(sx + 0.55, h + 0.75, w - 0.06), P(sx, h + 0.75, w - 0.06)], col)
            stacks.append((sx + 0.27, h + 0.75, w))
        else:
            card.poly([P(u0, 0, w), P(u1, 0, w), P(u1, h, w), P(u0, h, w)], [foot, foot, col, col])
        if kind == "gable":
            stacks.append((u0 + (u1 - u0) * 0.72 + 0.3, h + 0.7, w))
            # the gable's two verges hold a line of the sky
            vc = mix(col, ROOF, 0.7); mu = (u0 + u1) / 2
            card.poly([P(u0 - 0.35, h - 1.9, w - 0.05), P(mu, h, w - 0.05), P(mu, h - 0.28, w - 0.05), P(u0 - 0.02, h - 1.9, w - 0.05)][::-1], vc)
            card.poly([P(mu, h, w - 0.05), P(u1 + 0.35, h - 1.9, w - 0.05), P(u1 + 0.02, h - 1.9, w - 0.05), P(mu, h - 0.28, w - 0.05)][::-1], mix(col, ROOF, 0.4))
        if porch:
            # a boardwalk awning across the front: a sloped band that holds the sky's light, three posts under it
            ya = 2.75
            pc_ = mix(col, ROOF, 0.5)
            card.poly([P(u0 - 0.3, ya - 0.42, w - 0.12), P(u1 + 0.3, ya - 0.42, w - 0.12), P(u1 + 0.1, ya, w - 0.12), P(u0 - 0.1, ya, w - 0.12)], [mix(col, ROOF, 0.22), mix(col, ROOF, 0.22), pc_, pc_])
            for t in (0.0, 0.5, 1.0):
                px = u0 - 0.22 + (u1 - u0 + 0.3) * t
                card.poly([P(px, 0, w - 0.12), P(px + 0.14, 0, w - 0.12), P(px + 0.14, ya - 0.42, w - 0.12), P(px, ya - 0.42, w - 0.12)], col)
        if win:
            n = per
            for yy in rows:
                for k in range(n):
                    wins.append((u0 + (u1 - u0) * (k + 0.5) / n + rng.uniform(-0.25, 0.25), yy, w))

    # polish round 3 (R7): the pale flat the town stood on is gone (a ten-sided fan of one colour: it read as a sprite
    # disc under the houses). The light behind the town is the playa of env_backdrop_dusk (long streaks on the plain);
    # the card is the town alone: one dark roofline of gables, stepped fronts, stacks, the derrick and the tank.
    # back: the street's far row, low
    u = -4.0; k = 0
    while u < 29.0:
        wd = rng.uniform(6.0, 8.5); h = rng.uniform(4.6, 6.2)
        house(u, min(30.0, u + wd), h + (1.4 if k % 4 == 1 else 0.0), 10.0, BACK, ("side", "gable", "ped", "step")[k % 4], roof=0.6, rows=(h - 2.6,), per=3 if wd > 7.0 else 2)
        u += wd + rng.uniform(1.5, 3.0); k += 1
    # the yard wall running out to the left, behind the Tally House
    card.poly([P(-30.0, 0, 9.0), P(-4.0, 0, 9.0), P(-4.0, 3.0, 9.0), P(-30.0, 3.0, 9.0)], [mix(BACK, GROUND, 0.5), mix(BACK, GROUND, 0.5), BACK, BACK])
    # middle: the Tally House (14 x 5.6 m, flat roof and parapet), the drum, the derrick and its rotor, the tank on its stilts
    tally = (-21.0, 5.6, 14.0)
    house(tally[0] - 7.0, tally[0] + 7.0, tally[1], 5.0, MID, "flat", roof=0.5, shear=0.6, rows=(0.7,), per=5)
    wins.append((tally[0] - 4.4, 3.3, 5.0)); wins.append((tally[0] + 3.1, 3.3, 5.0))            # two lights upstairs, not a grid
    du = -8.6
    drum_c = mix(MID, hexlin("#5D6690"), 0.3)
    card.poly([P(du - 4.0, 0, 4.5), P(du + 4.0, 0, 4.5), P(du + 4.0, 6.0, 4.5), P(du - 4.0, 6.0, 4.5)], [mix(drum_c, GROUND, 0.5), mix(drum_c, GROUND, 0.5), drum_c, drum_c])     # pale ceramic even now
    card.poly([P(du - 4.0, 6.0, 4.5), P(du + 4.0, 6.0, 4.5), P(du + 3.4, 6.5, 4.5), P(du - 3.4, 6.5, 4.5)], mix(drum_c, ROOF, 0.6))
    for sgn in (-1.0, 1.0):                                               # the derrick's two legs and a brace (0.5 m: fat at 120 m)
        card.poly([P(du + sgn * 2.3, 6.0, 4.4), P(du + sgn * 2.3 + 0.55, 6.0, 4.4), P(du + sgn * 0.45 + 0.4, 14.0, 4.4), P(du + sgn * 0.45 - 0.15, 14.0, 4.4)], MID)
    card.poly([P(du - 1.9, 8.2, 4.4), P(du + 2.0, 8.2, 4.4), P(du + 1.5, 8.7, 4.4), P(du - 1.4, 8.7, 4.4)], MID)
    card.poly([P(du - 1.3, 11.0, 4.4), P(du + 1.6, 11.0, 4.4), P(du + 1.6, 11.45, 4.4), P(du - 1.3, 11.45, 4.4)], MID)
    hub = (du - 0.4, 13.25)
    for k in range(7):
        if k == 4: continue                                               # the missing vane
        a = 2 * math.pi * k / 7 + 0.3
        b = a + 0.3
        card.poly([P(hub[0], hub[1], 4.3), P(hub[0] + math.cos(a) * 2.5, hub[1] + math.sin(a) * 2.5, 4.3), P(hub[0] + math.cos(b) * 2.5, hub[1] + math.sin(b) * 2.5, 4.3)], MID)
    card.poly([P(du + 0.5, 12.95, 4.3), P(du + 3.6, 12.5, 4.3), P(du + 3.6, 14.1, 4.3), P(du + 0.5, 13.55, 4.3)], MID)                # the tail
    tk = -30.5
    card.poly([P(tk - 1.5, 3.5, 4.0), P(tk + 1.5, 3.5, 4.0), P(tk + 1.5, 6.1, 4.0), P(tk - 1.5, 6.1, 4.0)], MID)
    for sgn in (-1.0, 1.0):
        card.poly([P(tk + sgn * 1.2 - 0.25, 0, 4.0), P(tk + sgn * 1.2 + 0.25, 0, 4.0), P(tk + sgn * 1.2 + 0.25, 3.5, 4.0), P(tk + sgn * 1.2 - 0.25, 3.5, 4.0)], MID)
    wins.append((du + 3.1, 1.3, 4.5))                                     # the drum's lamp niche
    # front: the near row of false fronts, no two alike
    u = -2.0; k = 0
    kinds = ("step", "gable", "ped", "side", "step", "gable")
    fronts = []
    while u < 29.5 and k < 6:
        wd = rng.uniform(6.0, 9.0); h = rng.uniform(5.0, 7.0)
        u1 = min(30.0, u + wd)
        two = h > 5.8
        house(u, u1, h + (1.6 if kinds[k] in ("gable", "side") else 0.0), 0.0, FRONT, kinds[k], roof=0.8, rows=(0.7, 3.2) if two else (0.7,), per=3 if (u1 - u) > 7.4 else 2, porch=kinds[k] in ("step", "ped"))
        fronts.append((u, u1))
        u = u1 + rng.uniform(1.2, 3.0); k += 1
    # polish round 4: the street in front of the near row and the yard before the Tally House lie in the houses' own
    # shadow (a dark apron with a ragged near edge: the town stands ON the pale swept ground, it no longer floats on it),
    # and that is where the lit doors and sashes throw their pools (below)
    APRON = mix(FRONT, GROUND, 0.25)
    def apron(a0, a1, wall_w, depth, seed):
        n = max(2, int((a1 - a0) / 5.0)); pts_n = []; pts_f = []
        for i in range(n + 1):
            uu = a0 + (a1 - a0) * i / n
            pts_f.append(G(uu, wall_w + 0.3)); pts_n.append(G(uu, wall_w - depth * (0.75 + 0.5 * vnoise(uu * 0.31, 0.7, seed))))
        for i in range(n):
            card.poly([pts_n[i], pts_n[i + 1], pts_f[i + 1], pts_f[i]], [mix(APRON, GROUND, 0.55), mix(APRON, GROUND, 0.55), APRON, APRON])
    apron(fronts[0][0] - 1.5, fronts[-1][1] + 1.5, 0.0, 9.0, 3)
    apron(tally[0] - 8.0, tally[0] + 8.0, 5.0, 8.0, 5)
    # smoke standing from three stacks, leaning east with the evening wind (as the last fire's does): a thin ribbon that
    # narrows to nothing; dark against the afterglow
    SMOKE = hexlin("#2A2440")
    SMOKE_T = hexlin("#8A5E62")                                           # where it thins it takes the afterglow behind it
    NS = 7
    for n_, (su, sy, sw) in enumerate(sorted(stacks, key=lambda q: q[2])[:1] + sorted(stacks, key=lambda q: -q[2])[:1]):
        hh = 6.0 + 2.5 * n_; pts = []
        for i in range(NS + 1):
            t = i / NS
            off = 2.6 * t ** 1.6 + 0.22 * math.sin(t * 7.0 + 1.7 * n_) * t
            wd_ = 0.11 + 0.10 * math.sin(math.pi * min(1.0, t * 1.5)) if i < NS else 0.0
            pts.append(((su + off - wd_, sy + hh * t), (su + off + wd_, sy + hh * t)))
        for i in range(NS):
            c0 = mix(SMOKE, SMOKE_T, (i / NS) ** 0.7); c1 = mix(SMOKE, SMOKE_T, ((i + 1) / NS) ** 0.7)
            card.poly([P(pts[i][0][0], pts[i][0][1], sw - 0.07), P(pts[i][1][0], pts[i][1][1], sw - 0.07), P(pts[i + 1][1][0], pts[i + 1][1][1], sw - 0.07), P(pts[i + 1][0][0], pts[i + 1][0][1], sw - 0.07)], [c0, c0, c1, c1])
    # ---- polish round 4 (the last image's dead foreground): ONE dead line pylon standing on the mesa's foot between the
    # ledge and the plain, 42 m out, leaning: a dark lattice that crosses the dark land and breaks the horizon between
    # the town and the fire (the pylon line runs on to the fire: env_backdrop_dusk). A card in a plane across the view
    # from the stone; thin enough that from no place on the ledge it hides the fire or a lit window.
    eye_s = (2.9, 103.0); pb = (-7.7, 61.0); H_ = 21.5; y0_ = 2.0   # (pass i5: 3.2 -> 2.0, the bench of the rebuilt foot it stands on: env_backdrop_dusk.build_foot prints it)
    # pass i2: 6.8 m west (it stood in one column with the Rule and the fire); from no place on the ledge (x -2 .. 30) is it in line with the fire
    vx, vz = pb[0] - eye_s[0], pb[1] - eye_s[1]; vl = math.hypot(vx, vz)
    ax, az = -vz / vl, vx / vl                                             # across the view, viewer's right
    lean = math.radians(6.5); cl, sl = math.cos(lean), math.sin(lean)
    def Q(a, v):
        aa = a * cl + v * sl; vv = -a * sl + v * cl
        return (pb[0] + ax * aa, y0_ + vv, pb[1] + az * aa)
    PYL = hexlin("#090A13"); PYL_T = hexlin("#11122A"); RIMC = hexlin("#7A4E4A")
    pcol = lambda v: mix(PYL, PYL_T, clamp(v / H_))
    def bar(a0, v0, a1, v1, wd):
        dx_, dy_ = a1 - a0, v1 - v0; l_ = math.hypot(dx_, dy_) or 1.0; nx_, ny_ = -dy_ / l_ * wd / 2, dx_ / l_ * wd / 2
        card.poly([Q(a0 - nx_, v0 - ny_), Q(a1 - nx_, v1 - ny_), Q(a1 + nx_, v1 + ny_), Q(a0 + nx_, v0 + ny_)], [pcol(v0), pcol(v1), pcol(v1), pcol(v0)])
    half = lambda v: 1.45 - 1.05 * (v / H_)                               # the mast's half width
    bays = [0.0, 5.2, 9.8, 13.8, 17.2, 20.0, H_]
    for sgn in (-1.0, 1.0): bar(sgn * half(0.0), 0.0, sgn * half(H_), H_, 0.3)
    for i in range(len(bays) - 1):
        v0, v1 = bays[i], bays[i + 1]
        if i < 5:
            bar(-half(v0), v0, half(v1), v1, 0.15)
            if i != 2: bar(half(v0), v0, -half(v1), v1, 0.15)             # one brace is gone
        bar(-half(v1), v1, half(v1), v1, 0.17)
    # the afterglow along the mast's north-west leg: one thin warm line (the rim light of the frame's dark anchor)
    card.poly([Q(-half(7.0) - 0.15, 7.0), Q(-half(7.0) - 0.04, 7.0), Q(-half(H_) - 0.04, H_), Q(-half(H_) - 0.15, H_)], [mix(PYL, RIMC, 0.25), mix(PYL, RIMC, 0.25), RIMC, RIMC])
    # the arms: the lower one whole on the left and broken short on the right, its end hanging; the upper one a stub
    va = 15.6
    card.poly([Q(-half(va), va - 0.3), Q(-half(va) - 3.9, va + 0.22), Q(-half(va) - 3.9, va + 0.5), Q(-half(va), va + 0.42)][::-1], pcol(va))
    card.poly([Q(half(va), va - 0.3), Q(half(va), va + 0.42), Q(half(va) + 1.5, va + 0.45), Q(half(va) + 1.3, va + 0.05)][::-1], pcol(va))
    card.poly([Q(half(va) + 1.25, va + 0.3), Q(half(va) + 1.55, va + 0.4), Q(half(va) + 2.35, va - 2.3), Q(half(va) + 2.1, va - 2.4)][::-1], pcol(va))
    vb = 19.2
    card.poly([Q(-half(vb), vb - 0.2), Q(-half(vb) - 2.3, vb + 0.15), Q(-half(vb) - 2.3, vb + 0.38), Q(-half(vb), vb + 0.38)][::-1], pcol(vb))
    card.poly([Q(half(vb), vb - 0.2), Q(half(vb), vb + 0.38), Q(half(vb) + 2.1, vb + 0.36), Q(half(vb) + 2.1, vb + 0.14)][::-1], pcol(vb))
    card.poly([Q(-half(H_) - 0.1, H_), Q(half(H_) + 0.1, H_), Q(0.0, H_ + 1.1)], PYL_T)
    for (aa_, vv_) in ((-half(va) - 3.7, va + 0.2), (-half(vb) - 2.1, vb + 0.14), (half(vb) + 1.9, vb + 0.14)):                     # insulators hanging under the arm ends
        card.poly([Q(aa_ - 0.14, vv_ - 0.75), Q(aa_ + 0.14, vv_ - 0.75), Q(aa_ + 0.1, vv_), Q(aa_ - 0.1, vv_)], pcol(vv_))
    # the line itself, parted: it hangs from the whole arm's insulator in a slack curve to the ground west of the mast
    cab = [(-half(va) - 3.7, va - 0.55), (-half(va) - 4.3, va - 5.2), (-half(va) - 6.4, va - 9.6), (-half(va) - 10.5, va - 12.9), (-half(va) - 16.0, va - 14.6)]
    for i in range(len(cab) - 1): bar(cab[i][0], cab[i][1], cab[i + 1][0], cab[i + 1][1], 0.1)
    # the 48 windows: lighting order spreads outward from the Tally House
    # (look-dev: the order is still outward from the Tally House, but shuffled within a wide band, so the nine lamps
    # of a run that freed nobody are a street's worth of scattered lights, not one building's whole face)
    orng = random.Random(5)
    wins.sort(key=lambda p: (abs(p[0] - tally[0]) + 0.3 * p[1] + orng.uniform(0.0, 55.0), p[0]))
    wins = wins[:N_WIN]
    # polish round 4: the card was 12 panes short, and the twelve were stacked in seven places on the Tally House's
    # face (coplanar pairs, a second row that read as a checkerboard). The last lamps of a full house are now its
    # upper floor (five sashes between the two that were there) and lanterns along the yard wall and under the tank.
    extra = [(tally[0] - 6.0 + 1.7 * k_, 3.3, 5.0) for k_ in (0, 2, 3, 4, 6)] + [(-30.5, 1.2, 3.9)] + [(-27.5 + 4.6 * k_, 1.3, 9.0) for k_ in range(5)] + [(du - 3.0, 1.3, 4.5), (tally[0] - 6.6, 0.7, 5.0)]
    extra += [(31.5, 1.0, 0.0), (-3.2, 1.0, 0.0)] + [(-29.0 + 4.6 * k_, 1.3, 9.0) for k_ in range(5)] + [(tally[0] + 6.6, 3.3, 5.0), (tally[0] - 2.9, 0.7, 5.0)]
    print(f"CARD {ASSET}: {len(wins)} windows on the houses, {len(extra)} spare places")
    k = 0
    while len(wins) < N_WIN and k < len(extra):
        wins.append(extra[k]); k += 1
    assert len(wins) == N_WIN, len(wins)
    # polish round 3: panes with a shape. A ground-floor light is a tall sash (0.9 x 1.7 m) or, one in four, an open
    # door (1.2 x 2.1 m, from the sill down to the step) or a shop front (1.9 x 1.3 m); an upper one a sash (0.9 x 1.5).
    # At 250 m a 0.9 x 1.1 m pane was 2.5 x 3 px: with its halo, a round dot.
    lamps = []
    srng = random.Random(91)
    for (uc, yy, ww) in wins:
        r_ = srng.random()
        if yy < 1.2:
            if r_ < 0.25: hw, y0, y1 = 0.6, 0.15, 2.25
            elif r_ < 0.45: hw, y0, y1 = 0.95, yy, yy + 1.3
            else: hw, y0, y1 = 0.45, yy, yy + 1.7
        else: hw, y0, y1 = 0.45, yy, yy + 1.5
        q = [P(uc - hw, y0, ww - 0.06), P(uc + hw, y0, ww - 0.06), P(uc + hw, y1, ww - 0.06), P(uc - hw, y1, ww - 0.06)]
        if yy < 1.2 and ww < 6.0:
            # polish round 4: a ground-floor light of the near row or the Tally House throws a pool on the street before
            # it: a second face of the SAME lamp (it lights with its window), lying on the apron, its far end at intensity 0
            # (unlit it is the lamp shader's dark, which is the apron's)
            d0, d1 = ww - 0.5, ww - 0.5 - (7.0 if hw > 0.5 else 5.5)
            g = [G(uc - hw - 0.9 / K, d1, 0.5), G(uc + hw + 0.9 / K, d1, 0.5), G(uc + hw + 0.1, d0, 0.5), G(uc - hw - 0.1, d0, 0.5)]
            lamps.append([[layout.to_blender(p) for p in q], [layout.to_blender(p) for p in g]])
        else:
            lamps.append([layout.to_blender(p) for p in q])
    sil = card.realize("town_silhouette")
    tw_ob = zonelib.lamp_set("town_windows", lamps, colour="flame", intensity=0.9, emit_strength=0.0)
    # the pools' intensities, per corner (lamp_set wrote 0.9 everywhere): near the wall 0.42, the far end 0
    from lib import vcol as _vcol
    cols_ = _vcol.get_colors(tw_ob, _vcol.COLOR)
    k = 0; npool = 0
    for lamp in lamps:
        if isinstance(lamp[0][0], (list, tuple)):
            k += 4
            cols_[k + 0][0] = 0.0; cols_[k + 1][0] = 0.0; cols_[k + 2][0] = 0.42; cols_[k + 3][0] = 0.42
            k += 4; npool += 1
        else: k += 4
    assert k == len(cols_), (k, len(cols_))
    _vcol.set_colors(tw_ob, cols_, _vcol.COLOR)
    print(f"CARD {ASSET}: {npool} pools")
    export.marker("socket_thread", layout.to_blender(P(du, 14.2, 4.3)))
    print(f"CARD {ASSET}: silhouette {card.tris()} triangles, {len(lamps)} windows ({len(wins)} placed)")
    export.export_asset(ASSET, args.out, blend=args.blend)


if __name__ == "__main__":
    scene.run(main)
