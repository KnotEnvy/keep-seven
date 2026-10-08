"""env_backdrop_day: the far scenery of the surface set (docs/workorders/art-env-exterior.md 4.6). ONE m_flat mesh, UNLIT,
world coordinates: four rings of mesa silhouettes at 200 / 350 / 550 / 800 m, each lighter and nearer the fog colour;
the dark far rim 250 m due west of the yard where the Dowser stands (clear of the sun's disc and halo: 45 degrees of
azimuth away); the pylon line marching north toward the foot of the Rule, each card 0.6 x the last on screen; five
faceted flat-bottomed clouds in the western half; the plain under all of it. Empties socket_dowser, socket_rule_base.
Nothing on the northern horizon reads as a dark spire: the north is low and pale, the pylons fade into the haze."""
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

ASSET = "env_backdrop_day"
CENTRE = (-40.0, 0.0, 30.0)                      # the middle of the surface set
FOG_SUN = hexlin("#EDBB86"); FOG_AWAY = hexlin("#C9A592"); HORIZON = hexlin("#F3C58E")
TO_SUN = math.radians(315.0)


def fog_at(theta):
    """The fog colour of the L1 table: toward the sun / away from it (one dot product)."""
    t = 0.5 + 0.5 * math.cos(theta - TO_SUN)
    return mix(FOG_AWAY, FOG_SUN, t)


def dowser_clear(R, tgt, half):
    """The bearings (from CENTRE) at which a ring of radius R would stand between the yard and the Dowser's rim:
    -> clear(b0, b1). Every corner of trg_dowser against both ends of the rim, 4 degrees to spare."""
    tg = layout.marker("trg_dowser")
    bs = []
    for sx in (-0.5, 0.5):
        for sz in (-0.5, 0.5):
            e = (tg["pos"][0] + sx * tg["size"][0], tg["pos"][2] + sz * tg["size"][2])
            for dz in (-half, 0.0, half):
                t = (tgt[0], tgt[2] + dz)
                dx, dz_ = t[0] - e[0], t[1] - e[1]
                fx, fz = e[0] - CENTRE[0], e[1] - CENTRE[2]
                A = dx * dx + dz_ * dz_; B = 2 * (fx * dx + fz * dz_); Cq = fx * fx + fz * fz - R * R
                disc = B * B - 4 * A * Cq
                if disc <= 0: continue
                s = (-B + math.sqrt(disc)) / (2 * A)
                if not 0.0 < s < 1.0: continue
                x = e[0] + dx * s; z = e[1] + dz_ * s
                bs.append(math.atan2(x - CENTRE[0], -(z - CENTRE[2])) % (2 * math.pi))
    if not bs: return None
    lo = min(bs) - math.radians(4.0); hi = max(bs) + math.radians(4.0)
    return lambda b0, b1: b1 > lo and b0 < hi


def north_low(b):
    """0.3 within 25 degrees of north (nothing dark under the Rule), rising to 1 by 40 degrees."""
    n = abs(((b + math.pi) % (2 * math.pi)) - math.pi)
    return 0.3 + 0.7 * smooth((n - math.radians(25)) / math.radians(15))


def build(card):
    dw = layout.marker("vista_dowser"); tgt = dw["params"]["target"]
    HALF = 106.0                                                           # half the length of the Dowser's rim
    # the four rings, nearest first: darker, warmer rock; the farthest almost the fog. The runtime's fog does most of the
    # fading (69 % at 200 m, 88 % at 350 m); `f` is only the haze that separates one ring from the next.
    layers = [(200.0, 1, 34.0, 0.0), (350.0, 2, 46.0, 0.18), (550.0, 3, 60.0, 0.36), (800.0, 4, 70.0, 0.5)]
    lit_cliff = hexlin("#B65239"); sh_cliff = hexlin("#48272D"); lit_scree = hexlin("#C0704C"); sh_scree = hexlin("#6A4244"); cap = hexlin("#D08A5A")
    for (R, seed, H, f) in layers:
        def col(theta, level, f=f):
            # a face seen from the centre looks back at it: lit when the sun (315 degrees) is behind the viewer
            lit = clamp(0.5 - 0.75 * math.cos(theta - TO_SUN))
            fog = fog_at(theta)
            if level == 0: c = mix(sh_scree, lit_scree, lit * 0.8); h = f + 0.22
            elif level == 1: c = mix(sh_scree, lit_scree, lit); h = f + 0.06
            elif level == 2: c = mix(sh_cliff, lit_cliff, lit * 0.9); h = f + 0.03
            else: c = mix(mix(sh_cliff, lit_cliff, lit), cap, 0.35 + 0.3 * lit); h = f
            return mix(c, fog, clamp(h))
        forms = cards.mesas(seed, H, R, low=north_low, clear=dowser_clear(R, tgt, HALF + 8.0) if R < 600 else None)
        cards.mesa_cards(card, CENTRE, R, forms, col)
    # ---- the Dowser's rim, 250 m due west of the yard (polish round 3, lead ruling R4: "a dark, readable silhouette
    # against clear sky"). ONE lift: the mesa's top is the skyline and he stands on its highest knob (socket_dowser: his
    # feet), so the sky is behind the whole figure from every corner of trg_dowser, however tall the card is drawn.
    # Round 2 stood a darker upper cliff 9 m behind him: at 245 m the L1 fog lifts any rock to L* 72, so a pale card on
    # it was light on light. No rock of this backdrop stands above his feet within DOWSER_SKY degrees of his bearing
    # (tests/art_env_exterior/sightlines.test.mjs).
    rim_y = tgt[1]; xw = tgt[0]; z0 = tgt[2]
    dark = hexlin("#2B1A20"); dark2 = hexlin("#3A2228"); scree_c = hexlin("#6A4244"); foot_c = mix(hexlin("#6A4244"), fog_at(math.pi * 1.5), 0.3)
    E = lambda x, y, z: (x, y, z)
    # (offset along the rim from his feet, the top of the mesa above his feet): a caprock that sags, one notch, and the
    # knob he stands on; never above 0 (pass i3: the knob is 8.4 m wide, it was 3: the figure is drawn 9 m wide and both boots stand on rock)
    prof = [(-108.0, None), (-60.0, -30.0), (-55.0, -7.5), (-47.0, -5.6), (-41.0, -3.4), (-33.5, -2.7), (-30.0, -5.2), (-26.5, -2.3), (-17.0, -1.7),
            (-10.5, -1.3), (-7.0, -0.3), (-4.2, 0.0), (4.2, 0.0), (6.8, -0.35), (10.0, -1.2), (15.0, -1.9), (23.0, -2.5), (30.0, -2.1), (38.5, -3.6),
            (45.0, -6.0), (49.5, -30.0), (102.0, None)]
    scree_top = rim_y - 24.0
    for k in range(len(prof) - 1):
        (d0, b0), (d1, b1) = prof[k], prof[k + 1]
        za, zb = z0 + d0, z0 + d1
        if b0 is None or b1 is None:
            # the ends: scree running out onto the plain
            ya = scree_top if b0 is not None else -3.0; yb = scree_top if b1 is not None else -3.0
            q = [E(xw + 6.0, -3.0, za), E(xw + 6.0, -3.0, zb), E(xw + 6.0, yb, zb), E(xw + 6.0, ya, za)]
            card.poly(q[::-1], [foot_c, foot_c, scree_c, scree_c][::-1])
            continue
        # the scree apron (stands 6 m in front of the cliff's foot)
        q = [E(xw + 6.0, -3.0, za), E(xw + 6.0, -3.0, zb), E(xw + 6.0, scree_top, zb), E(xw + 6.0, scree_top, za)]
        card.poly(q[::-1], [foot_c, foot_c, scree_c, scree_c][::-1])
        # the cliff in two beds: the lower one from the scree's head, the caprock above it (the darkest band, under the sky)
        ba, bb = rim_y + max(b0, -24.0), rim_y + max(b1, -24.0)
        if ba > scree_top + 0.3 or bb > scree_top + 0.3:
            ma = min(ba, rim_y - 9.0 + 1.2 * math.sin(d0 * 0.21)); mb = min(bb, rim_y - 9.0 + 1.2 * math.sin(d1 * 0.21))
            q = [E(xw, scree_top - 1.0, za), E(xw, scree_top - 1.0, zb), E(xw, mb, zb), E(xw, ma, za)]
            card.poly(q[::-1], [dark2, dark2, dark2, dark2][::-1])
            if ba > ma + 0.2 or bb > mb + 0.2:
                q = [E(xw, ma, za), E(xw, mb, zb), E(xw, bb, zb), E(xw, ba, za)]
                card.poly(q[::-1], [dark, dark, dark, dark][::-1])
    # the plain: sand going to haze
    cards.disc(card, CENTRE, 120.0, 400.0, -0.6, hexlin("#C99A6B"), mix(hexlin("#C99A6B"), HORIZON, 0.6), segs=24)
    cards.disc(card, CENTRE, 400.0, 900.0, -1.5, mix(hexlin("#C99A6B"), HORIZON, 0.6), HORIZON, segs=24)
    # the pylon line: from the gully mouth north toward the foot of the Rule; each card 0.6 x the last on screen
    py = layout.marker("prop_pylon")["pos"]
    d = 70.0; h = 15.0
    for k in range(9):
        x = py[0] + 6.0 * math.sin(k * 0.7) + 2.0 * k; z = py[2] - d
        f = clamp(0.25 + 0.09 * k)
        pc = mix(hexlin("#6A5058"), fog_at(0.0), f)
        cards.pylon_card(card, (x, -0.5, z), h, (0.0, 1.0), pc, mix(pc, fog_at(0.0), 0.15))
        d *= 1.33; h *= 0.8
    # five faceted clouds, all in the western half, flat-bottomed
    lit = hexlin("#FFE0B0"); body = hexlin("#B9A79C")
    for k, (az, dist_c, el, w) in enumerate(((230.0, 700.0, 9.0, 150.0), (255.0, 820.0, 15.0, 190.0), (285.0, 760.0, 6.5, 120.0), (300.0, 880.0, 19.0, 160.0), (330.0, 720.0, 11.0, 110.0))):
        a = math.radians(az)
        cx = CENTRE[0] + math.sin(a) * dist_c; cz = CENTRE[2] - math.cos(a) * dist_c; cy = math.tan(math.radians(el)) * dist_c
        facing = (-math.sin(a), math.cos(a))
        # pass i2 (the visual reviewer: "flat orange polygons with hard straight edges that read as placeholders"): not drawn.
        # The sky draws soft clouds of its own now (src/render/sky.ts); cards.cloud stays for a script that wants one.
        if os.environ.get("KS_EXT_CARD_CLOUDS"): cards.cloud(card, (cx, cy, cz), w, w * 0.22, facing, lit, body, 40 + k)
    return tgt


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    card = cards.Card(ASSET + "_mesh")
    tgt = build(card)
    ob = card.realize("backdrop_day")
    tb = layout.to_blender
    export.marker("socket_dowser", tb(tgt))
    rule = layout.marker("vista_rule")["params"]["target"]
    export.marker("socket_rule_base", tb((rule[0], 0.0, CENTRE[2] - 820.0)))
    print(f"BACKDROP {ASSET}: {card.tris()} triangles")
    export.export_asset(ASSET, args.out, blend=args.blend)


if __name__ == "__main__":
    scene.run(main)
