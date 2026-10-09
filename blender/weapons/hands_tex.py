"""The drawing of the hands' texture set (helper of blender/tex/tx_hands.py and tx_hands_detail.py; ruling R14).

`draw()` returns (albedo linear (H, W, 3), gloss (H, W), height (H, W)) at 512 x 512, drawn at twice that and box-filtered.
Everything is drawn by numpy in each part's own (s, v) space, which blender/weapons/hands.py writes into UV0
(hands.LAYOUT, hands.rect_uv, the stations FINGER_S / THUMB_S): s runs along the part, v round it (0.5 = the back).
Nothing is baked: the sheet does not depend on the pose, and the two hands share it.

What is drawn (weathered buckskin work gloves, an oilcloth cuff):
  fingers / thumb   a seam down each side with its row of stitches and a seam across the fingertip; three fine wrinkles
                    over each joint on the back and one deep crease inside it; the knuckle and the pads worn paler and
                    smoother; the sides and the root darker (the gap between two fingers)
  palm              the three stitched "points" on the back of the hand, the worn knuckle row, the seam round the edge;
                    the palm side worn pale with its two creases
  gauntlet          flex wrinkles at the wrist, a rolled and stitched edge, a seam on the inside
  wrist             skin
  sleeve            a leather-bound edge with its stitch row, dark slate oilcloth: a twill weave, soft lengthwise folds
  cord, button      the tie cord's twist; a horn button with two holes
Height: 0.5 = flat (seams and creases below, welts, stitches and bindings above). Gloss (alpha): leather 0.22, worn
0.45, cloth 0.08, skin 0.30, horn 0.6.
"""
import math
import numpy as np
from lib import texdraw as td
import hands

W = H = hands.SHEET
SS = 2


def lin(h):
    return td.srgb_to_linear(np.asarray(td.hex_rgb(h), dtype=np.float32))


LEATHER = lin("#685848"); WORN = lin("#8E7A62"); DEEP = lin("#30261F"); THREAD = lin("#B09C7C")
BIND = lin("#4A382A"); SKIN = lin("#7C6156"); CLOTH = lin("#3B3843"); CLOTH_HI = lin("#524E5C")
# Pass i5 (the visual reviewer: "both hands are the same flat tan ... in the loading pose they overlap into a single lump"):
# the palm side of the glove is a second hide, a dark rough-out patch sewn on over the palm and the insides of the
# fingers, as a work glove's is. The off hand shows its palm in the loading pose and the gun hand its back: two tones.
PALM = lin("#4A382B"); PALM_WORN = lin("#6C5743")
CORD = lin("#75624A"); HORN = lin("#5A4E42"); HORN_HI = lin("#8A7A68")


def sm(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


def line(d, half, soft):
    """Coverage of a line of half-width `half` with a `soft` falloff, d = signed distance (same units)."""
    return np.clip(1.0 - (np.abs(d) - half) / soft, 0.0, 1.0)


class Rect:
    """One part's rectangle at the working resolution: S, V grids (the gutter runs a little outside 0..1), noise that
    wraps in v, and the three outputs."""
    def __init__(self, part, length_mm, round_mm, seed):
        x, y, w, h, rot = hands.LAYOUT[part]
        self.box = (x * SS, y * SS, w * SS, h * SS)
        px = (np.arange(w * SS, dtype=np.float32) + 0.5) / SS; py = (np.arange(h * SS, dtype=np.float32) + 0.5) / SS
        PX, PY = np.meshgrid(px, py)
        i = hands.INSET
        if rot: self.V = (PX - i) / (w - 2 * i); self.S = (PY - i) / (h - 2 * i)
        else: self.S = (PX - i) / (w - 2 * i); self.V = (PY - i) / (h - 2 * i)
        self.rot = rot; self.L = length_mm; self.C = round_mm; self.seed = seed
        self.x = self.S * length_mm                       # mm along
        self.y = (self.V - 0.5) * round_mm                # mm round, 0 on the back
        self.alb = np.zeros((h * SS, w * SS, 3), dtype=np.float32); self.gloss = np.zeros((h * SS, w * SS), dtype=np.float32)
        self.hgt = np.full((h * SS, w * SS), 0.5, dtype=np.float32)

    def noise(self, cells_s, cells_v, octaves=3, k=0):
        """fbm in 0..1 that wraps in v (the tube closes on the inside without a line)."""
        h, w = self.S.shape
        cx, cy = (cells_v, cells_s) if self.rot else (cells_s, cells_v)
        return td.fbm(w, h, max(1, cx), max(1, cy), octaves=octaves, seed=self.seed * 31 + k, tile_x=bool(self.rot), tile_y=not self.rot)

    def leather(self, base=LEATHER, mottle=0.16, grain=0.05):
        m = self.noise(5, 3, 3, 1); g = self.noise(int(self.L / 1.3), int(self.C / 1.3), 2, 2); p = self.noise(int(self.L / 3.5), int(self.C / 3.5), 2, 3)
        self.alb[:] = base[None, None, :] * (1.0 + mottle * (m[..., None] - 0.5) * 2.0) * (1.0 - 0.10 * sm((p[..., None] - 0.55) / 0.2))
        self.gloss[:] = 0.22 + 0.06 * (m - 0.5)
        self.hgt[:] = 0.5 + grain * (g - 0.5) * 2.0 + 0.03 * (p - 0.5) * 2.0

    def mix(self, colour, k):
        k = np.clip(k, 0, 1)[..., None]
        self.alb[:] = self.alb * (1 - k) + np.asarray(colour, dtype=np.float32)[None, None, :] * k

    def shade(self, k):
        self.alb *= np.clip(k, 0, 2)[..., None]

    def seam(self, d, along, on=1.0, period=2.3, stitch_side=1.0, depth=0.26):
        """A sewn seam along the line d = 0 (mm): a dark groove, a soft welt either side, one row of stitches."""
        groove = line(d, 0.16, 0.30) * on
        welt = line(np.abs(d) - 0.95, 0.35, 0.55) * on
        st = line(d * stitch_side - 1.25, 0.20, 0.22) * (np.mod(along / period, 1.0) < 0.56) * on
        self.shade(1.0 - 0.38 * groove)
        self.mix(THREAD, 0.85 * st)
        self.hgt += -depth * groove + 0.10 * welt + 0.16 * st
        self.gloss -= 0.10 * groove
        return groove


PIPE = lin("#3E2E22"); PIPE_HI = lin("#9A8468")


def piping(r, d, along, on=1.0, period=2.6):
    """Pass i6 (the visual reviewer: "smooth sausages with one stitch line ... add seam piping"): a piped seam along d = 0
    (mm): a dark welted cord 1.3 mm across standing proud between the two hides, its crown rubbed pale, a shadow line
    either side and a row of stitches on each hide. Drawn broad: the sheet gives a finger two texels a millimetre."""
    bead = line(d, 0.42, 0.40) * on
    crown = line(d, 0.10, 0.28) * on
    gap = line(np.abs(d) - 1.05, 0.14, 0.32) * on
    st = line(np.abs(d) - 1.95, 0.24, 0.26) * (np.mod(along / period + 0.5 * (d > 0), 1.0) < 0.58) * on
    r.mix(PIPE, 0.85 * bead); r.mix(PIPE_HI, 0.55 * crown)
    r.shade(1.0 - 0.42 * gap)
    r.mix(THREAD, 0.85 * st)
    r.hgt += 0.30 * bead - 0.22 * gap + 0.14 * st
    r.gloss += 0.14 * crown - 0.06 * gap
    return bead


NAIL = lin("#9C8880"); NAIL_TIP = lin("#A99C90"); SKIN_PAD = lin("#8A6E62"); SKIN_DEEP = lin("#5E3A2A")


def bare(r, stations, cut, thumb):
    """The bare end of a digit beyond the glove's edge at s = cut: skin, the end joint's creases, a nail on the back."""
    x, y, S, L, C = r.x, r.y, r.S, r.L, r.C; ay = np.abs(y)
    skin = sm((S - cut) / 0.006)
    n = r.noise(7, 3, 3, 21); g = r.noise(int(L / 1.6), int(C / 1.6), 2, 22)
    inside = sm((ay - C * 0.28) / (C * 0.10))
    col = SKIN[None, None, :] * (0.92 + 0.16 * n[..., None]) * (1 - 0.5 * inside[..., None]) + SKIN_PAD[None, None, :] * 0.5 * inside[..., None]
    hgt = 0.5 + 0.012 * (g - 0.5)
    gl = 0.30 + 0.06 * inside
    # the end joint: three creases across the back, two folds inside
    xj = stations[3] * L
    for o, wob, half in ((-1.5, 0.3, 0.10), (0.0, 1.1, 0.15), (1.4, 2.2, 0.09)):
        wr = line(x - (xj + o + 0.3 * np.sin(y * 0.9 + wob)), 0.10, 0.30) * (1.0 - sm((ay - C * half) / (C * 0.05)))
        col *= (1.0 - 0.22 * wr)[..., None]; hgt -= 0.10 * wr
    knk = np.exp(-((x - xj) / 3.0) ** 2 - (y / (C * 0.13)) ** 2)             # the knuckle of the end joint: a shade darker and drier
    col *= (1.0 - 0.10 * knk)[..., None]
    cr = line(x - (xj + 0.2 * np.sin(y * 0.6)), 0.16, 0.55) * sm((ay - C * 0.36) / (C * 0.06))
    col *= (1.0 - 0.26 * cr)[..., None]; hgt -= 0.16 * cr
    # the nail: a third of the way round, the last 13 % of the digit; a pale edge, a dark line where it leaves the skin
    half = C * (0.150 if thumb else 0.135)
    s0, s1 = 0.845, 0.972
    u = (S - s0) / (s1 - s0)
    wide = half * (0.80 + 0.20 * np.sin(np.clip(u, 0, 1) * math.pi * 0.5))
    cx = (s0 + s1) * 0.5 * L; hl = (s1 - s0) * 0.5 * L; rr = np.minimum(wide, hl) * 0.8
    qx = np.abs(x - cx) - hl + rr; qy = ay - wide + rr
    dn = np.minimum(np.maximum(qx, qy), 0.0) + np.hypot(np.maximum(qx, 0.0), np.maximum(qy, 0.0)) - rr      # mm outside the nail (negative inside)
    nail = sm(-dn / 0.35)
    ncol = NAIL[None, None, :] * (1.0 - 0.10 * np.clip(u, 0, 1)[..., None]) * (1.0 + 0.05 * np.cos(y / wide * 1.4)[..., None])
    tipk = sm((u - 0.84) / 0.06)[..., None]
    ncol = ncol * (1 - tipk) + NAIL_TIP[None, None, :] * tipk
    k = nail[..., None]
    col = col * (1 - k) + ncol * k
    rimn = line(dn, 0.16, 0.3)
    col *= (1.0 - 0.45 * rimn * (1.0 - 0.6 * tipk[..., 0]))[..., None]
    grime = line(u - 0.83, 0.012, 0.02) * nail
    col *= (1.0 - 0.35 * grime)[..., None]
    hgt += 0.10 * nail - 0.16 * rimn
    gl = gl * (1 - nail) + 0.70 * nail
    # the fingertip's pad is fuller and paler; the sides sit in shade
    side = np.exp(-((ay - C * 0.25) / (C * 0.08)) ** 2)
    col *= (1.0 - 0.14 * side * (1 - nail))[..., None]
    # the shade the glove's edge throws on the finger
    col *= (0.60 + 0.40 * sm((S - cut - 0.004) / 0.03))[..., None]
    k = skin[..., None]
    r.alb[:] = r.alb * (1 - k) + col * k
    r.gloss[:] = r.gloss * (1 - skin) + gl * skin
    r.hgt[:] = r.hgt * (1 - skin) + hgt * skin
    # the rolled edge of the leather: a hem with its stitch row, worn pale on its crown
    hem = sm((S - (cut - 0.034)) / 0.006) * (1.0 - skin)
    r.shade(1.0 - 0.18 * hem); r.hgt += 0.24 * hem * sm((cut - S) / 0.008 + 0.3)
    crown = line(S - (cut - 0.012), 0.006, 0.01) * (1.0 - skin)
    r.mix(WORN, 0.5 * crown)
    st = line(x - (cut - 0.040) * L, 0.22, 0.2) * (np.mod(y / 2.2, 1.0) < 0.55)
    r.mix(THREAD, 0.8 * st); r.hgt += 0.14 * st


def digit(part, stations, L, C, seed, worn=0.0, thumb=False):
    r = Rect(part, L, C, seed); r.leather()
    x, y, S = r.x, r.y, r.S; ay = np.abs(y)
    cj = hands.THUMB_CUT if thumb else hands.FINGER_CUT
    cut = hands.cut_station(stations, cj) if cj is not None else 2.0          # None: a whole glove (pass i1)
    n1 = r.noise(6, 2, 2, 7)
    # wear: the pads on the inside, the fingertip all round, the knuckles; a trigger finger is worn all over
    inside = sm((ay - C * 0.30) / (C * 0.10))
    tipw = sm((S - 0.80) / 0.10)
    kn = np.zeros_like(S)
    for j in (1, 2, 3):
        kn = np.maximum(kn, np.exp(-((x - stations[j] * L) / (4.2 if j == 1 else 3.2)) ** 2 - (y / (C * 0.12)) ** 2))
    pads = np.zeros_like(S)                                                  # the middle of each phalanx, on the inside
    for j in (1, 2, 3):
        pads = np.maximum(pads, np.exp(-((x - 0.5 * (stations[j] + stations[j + 1]) * L) / (0.20 * (stations[j + 1] - stations[j]) * L)) ** 2))
    if thumb:                                                                # the thumb is cut from the back's hide (its ball is what the idle frame shows of the hand)
        wear = np.clip(0.55 * inside + 0.55 * tipw + 0.75 * kn + worn, 0, 1) * (0.55 + 0.9 * n1)
        r.mix(WORN, 0.85 * np.clip(wear, 0, 1)); r.gloss += 0.26 * np.clip(wear, 0, 1)
    else:
        r.mix(PALM * (0.92 + 0.16 * n1[..., None]), 0.80 * inside * (1.0 - 0.6 * tipw))     # pass i5: the palm hide runs up the inside of each finger
        r.gloss -= 0.06 * inside
        wear = np.clip(0.55 * tipw + 0.75 * kn + worn * (1.0 - inside), 0, 1) * (0.55 + 0.9 * n1)
        r.mix(WORN, 0.85 * np.clip(wear, 0, 1) * (1.0 - 0.55 * inside)); r.gloss += 0.26 * np.clip(wear, 0, 1)
        padw = inside * pads * (0.45 + 0.7 * n1)
        r.mix(PALM_WORN, 0.75 * np.clip(padw, 0, 1)); r.gloss += 0.16 * np.clip(padw, 0, 1)
    r.hgt += 0.05 * kn
    # joints: fine wrinkles across the back, one deep crease on the inside
    for j in ((2, 3) if not thumb else (2, 3)):
        xj = stations[j] * L
        back = 1.0 - sm((ay - C * 0.17) / (C * 0.09))
        # pass i6 ("add knuckle creases"): three hairlines of 0.9 mm were under two texels of the sheet and did not reach the
        # screen. Five folds, broad and deep, the outer ones shorter, the leather standing up between them
        for o, wob, reach in ((-3.4, 0.3, 0.11), (-1.7, 1.7, 0.16), (0.0, 1.1, 0.19), (1.7, 2.2, 0.16), (3.3, 0.6, 0.10)):
            d = x - (xj + o + 0.40 * np.sin(y * 0.8 + wob))
            wr = line(d, 0.24, 0.42) * (1.0 - sm((ay - C * reach) / (C * 0.07)))
            puff = line(d - 0.85, 0.20, 0.45) * (1.0 - sm((ay - C * reach) / (C * 0.07)))
            r.shade(1.0 - 0.52 * wr); r.hgt -= 0.26 * wr
            r.shade(1.0 + 0.10 * puff); r.hgt += 0.07 * puff
        for o, wob, k in ((-1.1, 0.5, 0.7), (0.5, 1.9, 1.0)):                # the crease inside the joint: two soft folds, not a ring
            cr = line(x - (xj + o + 0.5 * np.sin(y * 0.5 + wob)), 0.22, 0.6) * sm((ay - C * 0.30) / (C * 0.07)) * k
            r.shade(1.0 - 0.36 * cr); r.hgt -= 0.24 * cr; r.gloss -= 0.08 * cr
    # the knuckle: two arcs
    xk = stations[1] * L
    for o in (-2.6, 2.4):
        d = x - (xk + o + 0.05 * y * y * (1 if o > 0 else -1) * 0.6)
        wr = line(d, 0.24, 0.40) * (1.0 - sm((ay - C * 0.16) / (C * 0.08)))
        r.shade(1.0 - 0.46 * wr); r.hgt -= 0.22 * wr
    # the seams: one down each side from the knuckle to the tip seam, and the tip seam over the back
    # (the two meet over the end of the finger in an arch: no seam ACROSS the fingertip, which drew a ring round it)
    arch = C * 0.25 * np.sqrt(np.clip(1.0 - np.clip((S - 0.86) / 0.125, 0.0, 1.0) ** 2, 0.0, 1.0))
    on = sm((S - (stations[1] - 0.02)) / 0.04) * (1.0 - sm((S - (cut - 0.036)) / 0.004))
    piping(r, ay - arch, x, on=on)
    # pass i6: the fourchette's other seam, where the palm hide is sewn on (a plain stitched seam, no cord)
    r.seam(ay - C * 0.365, x, on=sm((S - (stations[1] + 0.02)) / 0.04) * (1.0 - sm((S - 0.80) / 0.05)), stitch_side=1.0, depth=0.20)
    # the sides and the root sit in the shade of the next finger
    side = np.exp(-((ay - C * 0.25) / (C * 0.085)) ** 2)
    r.shade(1.0 - 0.20 * side)
    r.shade(0.62 + 0.38 * sm((S - 0.03) / 0.13))
    if cj is not None: bare(r, stations, cut, thumb)
    return r


def palm(seed):
    L, C = 106.0, 200.0
    r = Rect("palm", L, C, seed); r.leather()
    x, y = r.x, r.y; ay = np.abs(y)
    back = 1.0 - sm((ay - 44.0) / 10.0)                      # 1 on the back of the hand
    n1 = r.noise(5, 6, 3, 11)
    # the palm side: worn pale and smooth, two creases and the line round the ball of the thumb
    inner = 1.0 - back
    yy = np.where(y > 0, y - 100.0, y + 100.0)               # mm from the middle of the palm, thumb side negative
    # pass i5: the palm patch (PALM), worn smooth and paler on the heel, the ball of the thumb and under the knuckles
    patch = sm((ay - 50.0) / 8.0)                            # the patch is sewn on 4 mm inside the edge seam: the hand's two edges stay the back's hide
    thenar = 1.0 - sm((yy + 4.0) / 8.0)                      # ... and so does the thumb's half of the palm (what the idle frame shows of the gun hand, between the grip and the frame's edge)
    patch = patch * (1.0 - thenar)
    r.seam(yy + 0.0, x, on=sm((x - 10.0) / 6.0) * (1.0 - sm((x - 96.0) / 4.0)) * sm((ay - 56.0) / 4.0), stitch_side=1.0, depth=0.16)      # the patch's inner edge, down the middle of the palm
    r.mix(PALM * (0.90 + 0.20 * n1[..., None]), 0.94 * patch); r.gloss -= 0.05 * patch
    off = np.clip(inner - patch, 0.0, 1.0)                    # the palm side the patch leaves bare is worn pale and smooth, as it was
    r.mix(WORN, off * (0.50 + 0.5 * n1)); r.gloss += 0.20 * off
    rubp = np.maximum(np.maximum(np.exp(-((x - 20.0) / 15.0) ** 2 - ((yy - 14.0) / 20.0) ** 2), np.exp(-((x - 26.0) / 17.0) ** 2 - ((yy + 24.0) / 15.0) ** 2)),
                      0.8 * np.exp(-((x - 86.0) / 9.0) ** 2 - (yy / 34.0) ** 2))
    r.mix(PALM_WORN, patch * np.clip(rubp * (0.5 + 0.8 * n1), 0, 1) * 0.8); r.gloss += 0.20 * patch * rubp
    r.seam(ay - 50.0, x, on=sm((x - 10.0) / 6.0) * (1.0 - sm((x - 96.0) / 4.0)), stitch_side=1.0, depth=0.18)      # the patch's own stitch row
    for (x0, k, c0) in ((72.0, 0.10, 0.0), (56.0, -0.14, 6.0)):
        d = x - (x0 + k * yy + 3.0 * np.sin(yy / 17.0 + c0))
        cr = line(d, 0.35, 0.7) * inner * (np.abs(yy) < 36.0)
        r.shade(1.0 - 0.45 * cr); r.hgt -= 0.24 * cr
    d = np.hypot(x - 22.0, yy + 34.0) - 30.0
    cr = line(d, 0.35, 0.7) * inner * (yy > -34.0) * (x > 20.0)
    r.shade(1.0 - 0.40 * cr); r.hgt -= 0.22 * cr
    # the back: three stitched points fanning from the wrist toward the knuckles
    for y0 in (-18.0, 1.0, 19.5):
        t = np.clip((x - 36.0) / 56.0, 0, 1)
        d = y - y0 * (0.60 + 0.40 * t)
        on = back * sm((x - 34.0) / 4.0) * (1.0 - sm((x - 91.0) / 3.0))
        ridge = line(d, 0.8, 0.9) * on
        r.hgt += 0.20 * ridge; r.shade(1.0 + 0.10 * ridge)
        for sgn in (-1.0, 1.0):
            g = line(d - sgn * 1.9, 0.18, 0.3) * on
            r.shade(1.0 - 0.45 * g); r.hgt -= 0.16 * g
            st = line(d - sgn * 1.9, 0.26, 0.2) * (np.mod(x / 2.4 + 0.25 * sgn, 1.0) < 0.5) * on
            r.mix(THREAD, 0.8 * st); r.hgt += 0.2 * st
    # the knuckle row: four worn crowns with a wrinkle behind each
    for y0 in (-27.0, -8.0, 11.0, 27.0):
        k = np.exp(-((x - 94.0) / 7.0) ** 2 - ((y - y0) / 6.5) ** 2) * back
        r.mix(WORN, 0.75 * k); r.gloss += 0.22 * k; r.hgt += 0.07 * k
        d = np.hypot(x - 96.0, y - y0) - 9.0
        wr = line(d, 0.18, 0.35) * back * (x < 93.0)
        r.shade(1.0 - 0.28 * wr); r.hgt -= 0.12 * wr
    # the seam round the edge of the hand, and the hollow between the tendons
    r.seam(ay - 46.0, x, on=sm((x - 6.0) / 6.0), stitch_side=-1.0)
    r.shade(1.0 - 0.10 * back * (0.5 + 0.5 * np.cos(y / 9.5 * math.pi)) * sm((x - 40.0) / 20.0))
    # flex wrinkles where the wrist bends
    for o in (5.0, 9.5, 13.0):
        d = x - (o + 0.8 * np.sin(y / 9.0 + o))
        wr = line(d, 0.25, 0.5)
        r.shade(1.0 - 0.30 * wr); r.hgt -= 0.18 * wr
    return r


def gauntlet(seed):
    L, C = 56.0, 190.0
    r = Rect("gauntlet", L, C, seed); r.leather(base=LEATHER * 0.74, mottle=0.20)     # pass i5: the gauntlet a shade under the hand (the wrist reads as a joint)
    x, y, S = r.x, r.y, r.S; ay = np.abs(y)
    for o in (4.0, 8.5, 13.5, 19.0):
        d = x - (o + 1.1 * np.sin(y / 11.0 + o * 0.7))
        wr = line(d, 0.3, 0.6) * (0.5 + 0.5 * np.cos(y / 30.0 + o))
        r.shade(1.0 - 0.32 * wr); r.hgt -= 0.20 * wr
    # the rolled, bound edge and its stitch row
    edge = sm((S - 0.80) / 0.02)
    r.mix(BIND, 0.9 * edge); r.hgt += 0.22 * edge * (1.0 - sm((S - 0.96) / 0.02)); r.gloss += 0.12 * edge
    hi = line(S - 0.905, 0.012, 0.02)
    r.mix(WORN, 0.45 * hi)
    st = line(x - 0.765 * L, 0.26, 0.22) * (np.mod(y / 2.4, 1.0) < 0.55)
    r.mix(THREAD, 0.85 * st); r.hgt += 0.18 * st
    g = line(x - 0.765 * L, 0.5, 0.5); r.hgt -= 0.08 * g
    r.seam(ay - C * 0.5 + 1.5, x, on=1.0 - edge, stitch_side=-1.0)
    r.shade(1.0 - 0.6 * sm((S - 0.955) / 0.03))                 # the inside of the flare
    return r


def wrist(seed):
    r = Rect("wrist", 40.0, 150.0, seed)
    n = r.noise(3, 3, 3, 1)
    r.alb[:] = SKIN[None, None, :] * (0.92 + 0.16 * n[..., None]); r.gloss[:] = 0.30
    t = np.exp(-((r.y - 8.0) / 5.0) ** 2) + np.exp(-((r.y + 10.0) / 5.0) ** 2)        # two tendons
    r.hgt[:] = 0.5 + 0.08 * t + 0.02 * (n - 0.5); r.shade(1.0 + 0.06 * t)
    return r


def sleeve(seed):
    L, C = 188.0, 270.0
    r = Rect("sleeve", L, C, seed)
    x, y, S, V = r.x, r.y, r.S, r.V
    n = r.noise(4, 5, 3, 1); n2 = r.noise(9, 14, 2, 2)
    # soft lengthwise folds (the geometry carries the large ones: sixteen sides, every fourth falls in)
    a = V * 2.0 * math.pi
    fold = 0.55 * np.sin(8.0 * a + 2.2 * n * 2.0 + x / 60.0) + 0.45 * np.sin(13.0 * a + 1.0 + 3.0 * n2)
    twill = np.sin(2.0 * math.pi * (x + y) / 1.9) * np.sin(2.0 * math.pi * (x - y) / 3.8)
    r.alb[:] = (CLOTH[None, None, :] * (1 - sm(0.5 + 0.5 * fold)[..., None]) + CLOTH_HI[None, None, :] * sm(0.5 + 0.5 * fold)[..., None]) * (0.90 + 0.20 * n[..., None])
    r.alb *= (1.0 + 0.07 * twill)[..., None]
    r.gloss[:] = 0.08 + 0.10 * sm(0.5 + 0.5 * fold) * n
    r.hgt[:] = 0.5 + 0.16 * fold + 0.05 * twill
    # worn paler where the cuff rubs: the first centimetres behind the binding
    rub = (1.0 - sm((x - 16.0) / 26.0)) * (0.4 + 0.6 * n2)
    r.mix(CLOTH_HI * 1.25, 0.5 * rub)
    # the leather-bound edge (s 0 .. 0.069) with its stitch row, the sleeve seam on the inside
    bind = 1.0 - sm((S - 0.066) / 0.006)
    g = r.noise(140, 200, 2, 5)
    r.mix(BIND, bind); r.shade(1.0 - bind * 0.2 * (n - 0.5)); r.gloss[:] = r.gloss * (1 - bind) + 0.30 * bind
    r.hgt[:] = r.hgt * (1 - bind) + (0.74 + 0.04 * (g - 0.5)) * bind
    hi = line(x - 6.0, 1.2, 2.0) * bind
    r.mix(WORN * 0.8, 0.35 * hi)
    st = line(x - 10.6, 0.3, 0.25) * (np.mod(y / 2.6, 1.0) < 0.55)
    r.mix(THREAD, 0.85 * st); r.hgt += 0.14 * st
    lip = line(x - 13.6, 0.5, 0.8)
    r.shade(1.0 - 0.45 * lip); r.hgt -= 0.2 * lip
    d = np.abs(y) - (C * 0.5 - 2.0)
    r.seam(d, x, on=1.0 - bind, period=3.0, stitch_side=-1.0, depth=0.2)
    return r


def cord(seed):
    r = Rect("cord", 50.0, 40.0, seed)
    tw = np.sin(2.0 * math.pi * (r.x / 2.2 + r.y / 5.0))
    r.alb[:] = CORD[None, None, :] * (0.85 + 0.2 * tw[..., None]); r.gloss[:] = 0.12; r.hgt[:] = 0.5 + 0.2 * tw
    return r


def button(seed):
    r = Rect("button", 2.0, 2.0, seed)
    u = (r.S - 0.5) / 0.46; v = (r.V - 0.5) / 0.46; rad = np.hypot(u, v)
    n = r.noise(3, 3, 3, 1)
    swirl = 0.5 + 0.5 * np.sin(7.0 * rad + 4.0 * n + 2.0 * np.arctan2(v, u))
    r.alb[:] = HORN[None, None, :] * (1 - 0.6 * swirl[..., None]) + HORN_HI[None, None, :] * 0.6 * swirl[..., None]
    rim = sm((rad - 0.62) / 0.1)
    r.hgt[:] = 0.5 + 0.18 * rim - 0.06 * (1 - rim)
    for cx in (-0.2, 0.2):
        hole = 1.0 - sm((np.hypot(u - cx, v) - 0.085) / 0.04)
        r.mix(DEEP, hole); r.hgt -= 0.4 * hole
    th = line(v, 0.035, 0.03) * (np.abs(u) < 0.2)
    r.mix(THREAD, 0.9 * th); r.hgt += 0.15 * th
    r.gloss[:] = 0.6 - 0.4 * np.maximum(th, 0)
    return r


def draw():
    """(albedo linear (H, W, 3), gloss (H, W), height (H, W)), row 0 = top."""
    FS, TS = hands.FINGER_S, hands.THUMB_S
    rects = [digit("index", FS, 109.0, 58.0, 1, worn=0.30), digit("middle", FS, 117.0, 59.0, 2), digit("ring", FS, 110.0, 57.0, 3),
             digit("pinky", FS, 92.0, 51.0, 4), digit("thumb", TS, 105.0, 66.0, 5, thumb=True),
             palm(6), gauntlet(7), wrist(8), sleeve(9), cord(10), button(11)]
    BW, BH = W * SS, H * SS
    full = np.zeros((BH, BW, 5), dtype=np.float32); know = np.zeros((BH, BW), dtype=bool)
    for r in rects:
        x, y, w, h = r.box
        full[y:y + h, x:x + w, :3] = np.clip(r.alb, 0, 1); full[y:y + h, x:x + w, 3] = np.clip(r.gloss, 0, 1); full[y:y + h, x:x + w, 4] = np.clip(r.hgt, 0, 1)
        know[y:y + h, x:x + w] = True
    for _ in range(6 * SS):                                   # spread every rectangle into the gaps between them
        acc = np.zeros_like(full); cnt = np.zeros(know.shape, dtype=np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            acc += np.roll(full * know[..., None], (dy, dx), axis=(0, 1)); cnt += np.roll(know, (dy, dx), axis=(0, 1))
        new = ~know & (cnt > 0)
        full[new] = acc[new] / cnt[new][:, None]; know |= new
    full[~know] = np.concatenate([LEATHER, [0.22, 0.5]])
    small = td.downsample(full, SS)
    return small[:, :, :3], small[:, :, 3], small[:, :, 4]
