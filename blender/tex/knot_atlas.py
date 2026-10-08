"""knot_atlas: the crown knot of the townspeople, painted into FREE CELLS of tx_palette and tx_palette_emis
(look team creatures-props, pass i3).

Both visual reviewers of pass i3: "the crown knot is a flat-shaded violet and white gem ... a placeholder marker, not a
knot". The knot was a cluster of faceted lobes pointing at two flat emissive cells, so every facet was one flat colour.
It is now BOUND GLASS: a clouded glass bead with a light inside it, lashed down by three tarred cords and seated in a
grommet of twisted cord. The picture is here; the mesh (blender/enemies/bider_build.py `build_knot_bound`) is a smooth
dome and a smooth ring that point their UV0 into it. No new texture, no texture memory, no draw call, no shader term.

The block x 160..255, y 32..95 (columns 10-15 of rows 2-5: cells nobody ever named) holds

    knot        64 x 64 at (160, 32)   the knot seen from above, LIVE: albedo (grey glass, cords) in tx_palette and the
                                       light in the glass in tx_palette_emis (white-violet heart, violet body, deep
                                       violet toward the rim; black on the cords, a breath of violet where the cords
                                       and the grommet face the glass)
    knot_dead   32 x 32 at (224, 32)   the same picture at half size, tx_palette_emis BLACK: the knot of a freed Bider
    cord        32 x 16 at (224, 64)   a length of the lashing cord (U along it, V across; the ridge is the middle
                                       row); its two edges take a little of the glass's light in the emissive sheet
    cord_dead   32 x 16 at (224, 80)   the same cord, tx_palette_emis black

Units of the top view: the knot's `radius` (bider_build: 0.123 m, 0.075 m at the table) is R px; the grommet reaches
1.3 x radius (the old collar), the glass 0.80 x radius. COLOR_0 of a mesh on these regions is shade only (BASE white).
APPEND-ONLY like the cells and the cloth: a shipped region never moves.

Imported by blender/tex/tx_palette.py (`paint(img, emissive)`) and by the asset scripts (`top_uv`, `cord_uv`).
"""
import math
import numpy as np
from lib import texdraw as td

SIZE = 256
REGIONS = {"knot": (160, 32, 64, 64), "knot_dead": (224, 32, 32, 32), "cord": (224, 64, 32, 16), "cord_dead": (224, 80, 32, 16)}
BASE = {k: "#FFFFFF" for k in REGIONS}
BLOCK = (160, 32, 96, 64)          # the whole block of cells this atlas owns (tests skip it when they look for flat cells)
INSET = 0.75

# ---- the top view, in units of the knot's radius
R_OUT = 1.30                       # the grommet's outer foot (the old collar: 1.3 x the knot)
R_GLASS = 0.80                     # the glass bead
# the three lashing cords are chords of the bead: (the direction its normal points, degrees, the picture's +X = 0 and
# +Y up; how far from the middle it passes). Tied by hand: no two alike (three equal chords drew an emblem, not a lashing)
LASH = ((84.0, 0.40), (203.0, 0.47), (328.0, 0.36))
LASH_W = 0.066                     # half the cord's width
PX = 31.0 / R_OUT                  # px per radius in the 64 px view


def top_uv(rho, ang_deg, dead=False):
    """Blender UV of the point `rho` knot radii from the middle, at `ang_deg` (0 = the knot's +X, counter-clockwise seen
    from above the knot)."""
    rx, ry, rw, rh = REGIONS["knot_dead" if dead else "knot"]
    s = (rw / 64.0) * PX; a = math.radians(ang_deg)
    x = rw / 2.0 + rho * s * math.cos(a); y = rh / 2.0 - rho * s * math.sin(a)
    x = min(max(x, INSET), rw - INSET); y = min(max(y, INSET), rh - INSET)
    return ((rx + x) / SIZE, 1.0 - (ry + y) / SIZE)


def cord_uv(s, t, dead=False):
    """s 0..1 along the cord, t 0..1 across it (0.5 = the ridge)."""
    rx, ry, rw, rh = REGIONS["cord_dead" if dead else "cord"]
    x = min(max(s * rw, INSET), rw - INSET); y = min(max(t * rh, INSET + 0.5), rh - INSET - 0.5)
    return ((rx + x) / SIZE, 1.0 - (ry + y) / SIZE)


# ====================================================================================================== painting
def _g(v, c, w): return np.exp(-((v - c) / w) ** 2)
def _ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0); return t * t * (3.0 - 2.0 * t)
def _rgb(h): return np.asarray(td.hex_rgb(h), np.float32)


CORD_DARK, CORD_MID, CORD_LIT = "#1C1612", "#584432", "#9C8260"      # tarred hemp: near black in the lay, warm where a strand turns up
GLASS, GLASS_RIM = "#8A8A92", "#4A4A55"                                # husk grey (ART_BIBLE 6: a burst knot is grey)
VIOLET, HEART, DEEP = "#B24BFF", "#F0DCFF", "#3C1466"


def _rope(across, along, turns):
    """Shade of a laid rope: `across` -1..1 over its width, `along` in strand periods. -> (0..1 light, 0..1 lay shadow)."""
    round_ = np.sqrt(np.clip(1.0 - across * across, 0.0, 1.0))
    strand = 0.5 + 0.5 * np.cos(2.0 * math.pi * (along * turns + across * 0.55))
    return round_ * (0.35 + 0.65 * strand ** 1.5), (1.0 - strand) ** 2 * round_


def _top(W, ss=4):
    """The knot from above, W x W px. -> (albedo, emissive), sRGB floats."""
    X, Y = td.grid(W, W, ss)
    k = (W / 64.0) * PX
    x = (X - W / 2.0) / k; y = -(Y - W / 2.0) / k                    # knot radii, +y up
    rho = np.hypot(x, y); ang = np.arctan2(y, x)
    n1 = td.fbm(W * ss, W * ss, 5, 5, octaves=3, seed=41, tile_x=False, tile_y=False)
    n2 = td.fbm(W * ss, W * ss, 11, 11, octaves=3, seed=57, tile_x=False, tile_y=False)
    alb = np.empty(X.shape + (3,), np.float32); alb[:] = _rgb(CORD_DARK)
    emi = np.zeros(X.shape + (3,), np.float32)

    # ---------------------------------------------------------------- the glass
    q = np.clip(rho / R_GLASS, 0.0, 1.0)
    dome = np.sqrt(np.clip(1.0 - q * q, 0.0, 1.0))                   # how much the surface faces up
    glass = _rgb(GLASS)[None, None, :] * (0.52 + 0.50 * dome[:, :, None]) + (_rgb(GLASS_RIM) - _rgb(GLASS))[None, None, :] * (q ** 3)[:, :, None] * 0.6
    glass *= (0.90 + 0.20 * n2)[:, :, None]                          # clouded
    # hairline cracks from where it was struck once, and a seed bubble or two: seen when the light has gone out of it
    crack = np.zeros_like(rho)
    for a0, bend, ln in ((35.0, 0.9, 0.62), (150.0, -0.7, 0.55), (262.0, 0.5, 0.70), (318.0, -1.1, 0.40)):
        cx, cy = 0.16, -0.10
        dx, dy = x - cx, y - cy; rr = np.hypot(dx, dy); aa = np.degrees(np.arctan2(dy, dx))
        d = ((aa - (a0 + bend * 40.0 * rr) + 180.0) % 360.0) - 180.0
        crack += _g(d * rr, 0.0, 1.1) * (rr < ln) * _ss(0.02, 0.10, rr)
    glass *= (1.0 - 0.30 * np.clip(crack, 0, 1))[:, :, None]
    hl = _g(np.hypot(x + 0.27, y - 0.30), 0.0, 0.13) + 0.5 * _g(np.hypot(x + 0.40, y - 0.12), 0.0, 0.06)      # the window in it
    glass += (hl * 0.30)[:, :, None]
    in_glass = td.cover((rho - R_GLASS) * k, 1.0)
    td.over(alb, in_glass[:, :, None], glass)
    # the light in the glass: a white-violet heart, a violet body that swirls a little, deep violet toward the rim
    sw = 0.82 + 0.36 * n1
    # (the heart is 41 % of the knot across at half its height: ART_BIBLE 6, "at least 40 % of the knot's diameter". At
    # 28 % it was a point; at 50 % the bead seen from the front was a white dome with a violet edge, the reviewers'
    # "pure white" again. tests/art_enemies/bider_silhouette measures it against the cords: 60 L* and more)
    heart = _ss(0.62, 0.20, np.hypot(x - 0.03, y + 0.04) * (0.92 + 0.16 * n1))
    body = np.clip((1.0 - q ** 2.2) * sw, 0.0, 1.0)
    e = _rgb(DEEP)[None, None, :] + (_rgb(VIOLET) - _rgb(DEEP))[None, None, :] * body[:, :, None]
    e = e + (_rgb(HEART)[None, None, :] - e) * heart[:, :, None]
    e *= (0.76 + 0.24 * np.clip(dome * 1.6, 0, 1))[:, :, None]      # the rim of a bead is dimmer than its middle
    td.over(emi, in_glass[:, :, None], e)

    # ---------------------------------------------------------------- the three lashings over the glass
    for i, (a0, LASH_D) in enumerate(LASH):
        ca, sa = math.cos(math.radians(a0)), math.sin(math.radians(a0))
        across = (x * ca + y * sa - LASH_D) / LASH_W                # -1..1 over the cord
        along = (-x * sa + y * ca)
        on = td.cover((np.abs(across) - 1.0) * LASH_W * k, 1.0) * td.cover((rho - (R_GLASS + 0.06)) * k, 1.0)
        # the shade the cord lays on the glass either side of it (albedo), and the dark of it against the light
        sh = _g(across, 0.0, 1.9) * td.cover((rho - R_GLASS) * k, 1.0)
        alb *= (1.0 - 0.45 * sh)[:, :, None]
        emi *= (1.0 - 0.45 * _g(across, 0.0, 1.25))[:, :, None]
        lit, lay = _rope(np.clip(across, -1, 1), along + 0.13 * i, 7.0)
        c = _rgb(CORD_DARK)[None, None, :] + (_rgb(CORD_MID) - _rgb(CORD_DARK))[None, None, :] * lit[:, :, None] + (_rgb(CORD_LIT) - _rgb(CORD_MID))[None, None, :] * (lit ** 3)[:, :, None]
        td.over(alb, on[:, :, None], c)
        # black against the light, but its two flanks take a breath of violet from the glass under them
        flank = np.clip(np.abs(across), 0, 1) ** 2.2 * (0.55 + 0.25 * lit)
        td.over(emi, on[:, :, None], _rgb(VIOLET)[None, None, :] * flank[:, :, None] * 0.75)

    # ---------------------------------------------------------------- the grommet: two turns of twisted cord round the glass
    for j, (r0, hw, turns, ph) in enumerate(((0.905, 0.125, 19.0, 0.0), (1.150, 0.150, 23.0, 0.37))):
        across = (rho - r0) / hw
        on = td.cover((np.abs(across) - 1.0) * hw * k, 1.0)
        along = ang / (2.0 * math.pi) + ph
        lit, lay = _rope(np.clip(across, -1, 1), along, turns)
        # (the grommet lies in the shade of the bead and takes the mesh's baked occlusion on top: its lay is painted
        # lighter than the lashings' so that it still reads as rope, not as a black band)
        wear = np.clip(lit * (1.25 + 0.60 * n2), 0.0, 1.0)
        c = _rgb(CORD_DARK)[None, None, :] + (_rgb(CORD_MID) * 1.25 - _rgb(CORD_DARK))[None, None, :] * wear[:, :, None] + (_rgb("#C2A47C") - _rgb(CORD_MID) * 1.25)[None, None, :] * (wear ** 2.2)[:, :, None]
        td.over(alb, on[:, :, None], c)
        # the inner turn's inner flank faces the glass
        glow = (0.62 if j == 0 else 0.12) * np.clip(-across, 0, 1) ** 1.5 * (0.45 + 0.55 * lit)
        td.over(emi, on[:, :, None], _rgb(VIOLET)[None, None, :] * glow[:, :, None])
    # outside the grommet: its own dark (the mesh ends at R_OUT)
    out = td.cover((R_OUT - 0.01 - rho) * k, 1.0)
    alb *= (1.0 - 0.5 * out)[:, :, None]; emi *= (1.0 - out)[:, :, None]
    return np.clip(td.downsample(alb, ss), 0, 1), np.clip(td.downsample(emi, ss), 0, 1)


def _cord(W, H, ss=4):
    """A length of lashing cord: U along, V across. -> (albedo, emissive)."""
    X, Y = td.grid(W, H, ss)
    across = (Y / H - 0.5) * 2.0
    lit, lay = _rope(np.clip(across, -1, 1) * 0.96, X / W, 6.0)
    c = _rgb(CORD_DARK)[None, None, :] + (_rgb(CORD_MID) - _rgb(CORD_DARK))[None, None, :] * lit[:, :, None] + (_rgb(CORD_LIT) - _rgb(CORD_MID))[None, None, :] * (lit ** 3)[:, :, None]
    flank = np.clip(np.abs(across), 0, 1) ** 2.5 * (0.30 + 0.25 * lit)
    e = _rgb(VIOLET)[None, None, :] * flank[:, :, None] * 0.55
    return np.clip(td.downsample(c, ss), 0, 1), np.clip(td.downsample(e, ss), 0, 1)


def paint(img, emissive=False):
    """Draw the knot's regions into `img` (the 256 x 256 x 4 sRGB palette image, or the emissive sheet), in place."""
    for name, dead in (("knot", False), ("knot_dead", True)):
        x, y, w, h = REGIONS[name]
        alb, emi = _top(w)
        img[y:y + h, x:x + w, :3] = (0.0 if dead else emi) if emissive else alb
    for name, dead in (("cord", False), ("cord_dead", True)):
        x, y, w, h = REGIONS[name]
        alb, emi = _cord(w, h)
        img[y:y + h, x:x + w, :3] = (0.0 if dead else emi) if emissive else alb
    return img
