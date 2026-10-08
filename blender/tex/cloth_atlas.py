"""cloth_atlas: the cloth of the townspeople, painted into the FREE rows of tx_palette (creatures-props, pass i2).

tx_palette is 256 x 256; its sixteen-pixel colour cells fill rows 0-5 (y 0..95). The 256 x 160 px under them were a
dull grey nobody sampled. They now hold four painted cloths, so a hood, a coat, a sleeve or a shawl of `m_prop` shows
weave, folds, seams and wear at NO cost: no new texture, no texture memory, no draw call, no shader term. The
reviewers of pass i2: "the nine hooded dead are smooth untextured eggs with a flat paper collar".

    hood    256 x 80 at (0, 96)     the sewn linen bag unrolled: U = the angle round the head (-180 .. 180, the face
                                    at the middle), V = crown (top) .. the cord .. the hem of the cape (bottom)
    coat    160 x 80 at (0, 176)    the work coat unrolled the same way: collar (top) .. hem
    sleeve   48 x 80 at (160, 176)  U round the arm, V shoulder (top) .. cuff
    weave    48 x 80 at (208, 176)  plain coarse cloth for anything else that hangs (the shawl, felt, sacking)

A mesh points UV0 into a region and carries its COLOUR in COLOR_0 as before, divided by the region's base colour
(`BASE`, what `Cell` is for a palette cell): the atlas is the cloth, the vertex colour is the dye, the dirt and the AO.
tx_palette_emis stays black here. APPEND-ONLY like the cells: a shipped region never moves.

Imported by blender/tex/tx_palette.py (`paint(img)`) and by the asset scripts (`hood_uv`, `cape_uv`, `coat_uv`,
`sleeve_uv`, `weave_uv`: Blender UVs, origin bottom-left).
"""
import math
import numpy as np
from lib import texdraw as td

SIZE = 256
REGIONS = {"hood": (0, 96, 256, 80), "coat": (0, 176, 160, 80), "sleeve": (160, 176, 48, 80), "weave": (208, 176, 48, 80)}
BASE = {"hood": "#D8CDB4", "coat": "#7A5B45", "sleeve": "#7A5B45", "weave": "#D8CDB4"}       # linen, workcloth_light
INSET = 0.75                       # px kept clear inside a region (linear filtering, the first mips)

# ---- the hood's rows (px inside the region, from its top)
HOOD_ZT, HOOD_ZN = 1.728, 1.392    # the crown and the cord, design-pose heights of bider_build
HOOD_Y0, HOOD_YN = 1.5, 58.0       # ... and their rows
CAPE_Y1, CAPE_YU = 74.5, 78.5      # the hem of the cape; the turned-under edge
# ---- the coat's rows
COAT_ZT, COAT_ZB = 1.378, 0.470
COAT_Y0, COAT_Y1, COAT_YIN = 1.5, 75.5, 78.5       # collar, hem, the dark inside of the skirt


def _uv(region, x, y):
    rx, ry, rw, rh = REGIONS[region]
    x = min(max(x, INSET), rw - INSET); y = min(max(y, INSET), rh - INSET)
    return ((rx + x) / SIZE, 1.0 - (ry + y) / SIZE)


def hood_row(z): return HOOD_Y0 + (HOOD_ZT - z) / (HOOD_ZT - HOOD_ZN) * (HOOD_YN - HOOD_Y0)
def hood_uv(a, z): return _uv("hood", (a / 360.0 + 0.5) * 256.0, hood_row(z))
def cape_uv(a, f):
    """f: 0 at the cord, 1 at the hem, up to 1.3 for the edge turned under."""
    y = HOOD_YN + f * (CAPE_Y1 - HOOD_YN) if f <= 1.0 else CAPE_Y1 + (f - 1.0) / 0.3 * (CAPE_YU - CAPE_Y1)
    return _uv("hood", (a / 360.0 + 0.5) * 256.0, y)
def coat_row(z): return COAT_Y0 + (COAT_ZT - z) / (COAT_ZT - COAT_ZB) * (COAT_Y1 - COAT_Y0)
def coat_uv(a, z, inside=False): return _uv("coat", (a / 360.0 + 0.5) * 160.0, COAT_YIN if inside else coat_row(z))
def sleeve_uv(s, t, inside=False): return _uv("sleeve", s * 48.0, 78.5 if inside else 1.5 + t * 74.0)
def weave_uv(s, t): return _uv("weave", s * 48.0, t * 80.0)


# ====================================================================================================== painting
def _g(v, c, w): return np.exp(-((v - c) / w) ** 2)
def _ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0); return t * t * (3.0 - 2.0 * t)


def _weave(w, h, seed, amp=0.035, slub=0.05):
    """Thread-level detail at the texture's own resolution (it must not be blurred by supersampling): a plain weave's
    one-pixel chequer, threads of uneven weight in both directions, and slubs."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w]
    a = 1.0 + amp * (((xx + yy) % 2) * 2.0 - 1.0)
    a *= 1.0 + slub * (rng.random((1, w), dtype=np.float32) - 0.5) * 1.2          # warp threads
    a *= 1.0 + slub * (rng.random((h, 1), dtype=np.float32) - 0.5) * 1.6          # weft threads
    a *= 1.0 + slub * 0.8 * (rng.random((h, w), dtype=np.float32) - 0.5)
    return a.astype(np.float32)


def _hood(ss=3):
    W, H = 256, 80
    X, Y = td.grid(W, H, ss)
    A = (X / W - 0.5) * 360.0
    Z = HOOD_ZT - (Y - HOOD_Y0) / (HOOD_YN - HOOD_Y0) * (HOOD_ZT - HOOD_ZN)          # only meaningful above the cord
    F = (Y - HOOD_YN) / (CAPE_Y1 - HOOD_YN)                                            # the cape's fall, 0 .. 1 (.. 1.3)
    hood = Y < HOOD_YN; cape = ~hood
    n1 = td.fbm(W * ss, H * ss, 6, 2, octaves=4, seed=11, tile_x=True, tile_y=False)
    n2 = td.fbm(W * ss, H * ss, 14, 5, octaves=3, seed=23, tile_x=True, tile_y=False)
    warp = (n1 - 0.5) * 26.0                                                           # degrees: no fold is straight
    sh = np.ones_like(X)
    front = np.clip(np.cos(np.radians(np.clip(np.abs(A), 0, 90))), 0, 1)

    # --- the bag is tied at the neck: a ring of pleats that open out upward and die on the jaw
    up = np.clip((Z - HOOD_ZN) / 0.115, 0.0, 1.0)
    pleat = 0.5 + 0.5 * np.cos(np.radians((A + warp * (0.25 + 0.75 * up)) * (360.0 / 26.0)))
    sh *= np.where(hood, 1.0 - 0.42 * (1.0 - up) ** 1.3 * (1.0 - pleat) ** 1.4, 1.0)
    sh *= np.where(hood, 1.0 + 0.06 * (1.0 - up) ** 1.3 * pleat ** 3, 1.0)
    # --- long creases that run on from some pleats up over the cheek and the back of the head
    for a0, lean, ztop, deep in ((-152.0, 20.0, 1.66, 0.26), (-104.0, -14.0, 1.60, 0.20), (-47.0, 16.0, 1.585, 0.22), (38.0, -10.0, 1.55, 0.16),
                                 (70.0, 22.0, 1.63, 0.24), (128.0, -18.0, 1.67, 0.22), (171.0, 6.0, 1.70, 0.30)):
        d = ((A - (a0 + lean * (Z - HOOD_ZN) / 0.2 + warp * 0.45) + 180.0) % 360.0) - 180.0
        fade = _ss(ztop, ztop - 0.07, Z) * (Z > HOOD_ZN)
        sh *= 1.0 - deep * fade * _g(d, 0.0, 2.6)
        sh *= 1.0 + 0.09 * fade * _g(d, -6.5, 4.0)
    # --- the head under the cloth: no face is drawn (ART_BIBLE 6.1), only where a face holds light and shade
    sh *= np.where(hood, 1.0 + 0.055 * _g(Z, 1.640, 0.030) * front ** 2, 1.0)                       # the brow takes the light
    sh *= np.where(hood, 1.0 - 0.17 * _g(Z, 1.574, 0.026) * _g(np.abs(A), 13.0, 13.0), 1.0)         # the hollows the slits sit in
    sh *= np.where(hood, 1.0 + 0.06 * _g(Z, 1.535, 0.022) * _g(A, 0.0, 7.0), 1.0)                   # the push of the nose
    sh *= np.where(hood, 1.0 - 0.12 * _g(Z, 1.502, 0.012) * _g(A, 0.0, 11.0), 1.0)                  # under it
    sh *= np.where(hood, 1.0 - 0.16 * _g(Z, 1.440, 0.035) * front, 1.0)                             # the fall under the chin
    sh *= np.where(hood, 1.0 - 0.08 * _g(Z, 1.590, 0.060) * _g(np.abs(A), 86.0, 20.0), 1.0)         # the temples
    # --- the shade of the bag's own rim on the neck, and of the cord on the cloth above and below it
    sh *= np.where(hood, 1.0 - 0.36 * _ss(HOOD_ZN + 0.030, HOOD_ZN, Z), 1.0)
    sh *= np.where(cape, 1.0 - 0.34 * _ss(0.30, 0.0, F), 1.0)
    # --- the felled seam over the crown, ear to ear: a proud band, lit on its front edge, with its row of stitches
    for a0 in (-90.0, 90.0):
        d = A - a0 + warp * 0.06
        on = (Z > HOOD_ZN + 0.035) * hood
        sh *= 1.0 + 0.085 * on * _g(d, -1.6, 1.3)
        sh *= 1.0 - 0.22 * on * _g(d, 1.9, 1.2)
        stitch = (np.sin(Y * 2.0 * math.pi / 2.6) > 0.15)
        sh *= 1.0 - 0.20 * on * stitch * _g(d, -3.6, 0.75)
    # --- the cape: the pleats run on under the cord and fan out, a stitched and turned hem
    pleat2 = 0.5 + 0.5 * np.cos(np.radians((A + warp * 0.5) * (360.0 / 26.0)))
    Fc = np.clip(F, 0.0, 1.0)
    sh *= np.where(cape, 1.0 - (0.34 - 0.16 * Fc) * (1.0 - pleat2) ** 1.5, 1.0)
    sh *= np.where(cape, 1.0 + 0.05 * pleat2 ** 3, 1.0)
    hem = _g(F, 0.90, 0.045)
    sh *= np.where(cape, 1.0 + 0.07 * hem, 1.0)                                                     # the roll of the hem
    sh *= np.where(cape, 1.0 - 0.24 * _g(F, 0.76, 0.028) * (np.sin(X * 2.0 * math.pi / 2.4) > -0.2), 1.0)   # its stitches
    sh *= np.where(cape, 1.0 - 0.62 * _ss(0.99, 1.10, F), 1.0)                                      # the edge and what is turned under
    # --- wear: uneven dye, grime
    sh *= 0.93 + 0.11 * n2
    col = np.empty(X.shape + (3,), np.float32); col[:] = td.hex_rgb(BASE["hood"])
    col *= sh[:, :, None]
    def stain(amount, rgb): col[:] = col * (1.0 - amount[:, :, None]) + col * np.asarray(rgb, np.float32)[None, None, :] * amount[:, :, None]
    # breath: the cloth over the mouth has gone brown
    stain(np.clip(_g(Z, 1.487, 0.024) * _g(A, 1.0, 14.0) * (0.30 + 0.6 * n2), 0, 1) * hood, (0.80, 0.70, 0.58))
    # sweat round the neck and under the cord; dust from the hem up
    stain(np.clip(_ss(HOOD_ZN + 0.075, HOOD_ZN, Z) * (0.25 + 0.7 * n1), 0, 1) * 0.5 * hood, (0.80, 0.70, 0.56))
    stain(np.clip(_ss(0.35, 1.0, F) * (0.3 + 0.7 * n1), 0, 1) * 0.45 * cape, (0.90, 0.76, 0.58))
    # the growth on the crown is in the cloth: bruise-coloured threads run down from under the knot
    veins = np.zeros_like(X)
    for k, (a0, ln) in enumerate(((-64.0, 0.07), (-38.0, 0.115), (-17.0, 0.085), (9.0, 0.125), (31.0, 0.075), (55.0, 0.10), (-100.0, 0.05), (95.0, 0.055), (150.0, 0.04), (-150.0, 0.045))):
        d = A - (a0 + warp * 0.5 + 2.2 * np.sin((Z - 1.6) * 45.0 + k))
        veins += _g(d, 0.0, 1.5) * _ss(HOOD_ZT - ln - 0.03, HOOD_ZT - 0.03, Z) * hood
    stain(np.clip(veins, 0, 1) * 0.5, (0.60, 0.50, 0.72))
    stain(np.clip(_ss(HOOD_ZT - 0.075, HOOD_ZT, Z) * (0.35 + 0.65 * n2), 0, 1) * 0.42 * hood, (0.70, 0.64, 0.80))
    # --- the two slits: cut with a knife, the edges frayed pale, the inside dark (the mesh lays a hard dark face over them)
    for sg, dz in ((1.0, 0.0), (-1.0, -0.0025)):
        cx = (sg * 10.5 / 360.0 + 0.5) * W; cy = hood_row(1.5685 + dz)
        sd = td.sd_box(X, Y - sg * (X - cx) * 0.03, cx, cy, 5.6, 0.75, 0.6)
        td.over(col, td.cover(sd - 1.0, 1.4)[:, :, None] * 0.35, np.asarray(td.hex_rgb("#F0E8D4"), np.float32) * 0.92)
        td.over(col, td.cover(sd, 0.8)[:, :, None] * 0.94, np.asarray(td.hex_rgb("#1B1F24"), np.float32))
    out = td.downsample(col, ss)
    out *= _weave(W, H, 5, 0.030, 0.06)[:, :, None]
    return np.clip(out, 0.0, 1.0)


def _coat(ss=3):
    W, H = 160, 80
    X, Y = td.grid(W, H, ss)
    A = (X / W - 0.5) * 360.0
    Z = COAT_ZT - (Y - COAT_Y0) / (COAT_Y1 - COAT_Y0) * (COAT_ZT - COAT_ZB)
    n1 = td.fbm(W * ss, H * ss, 5, 2, octaves=4, seed=31, tile_x=True, tile_y=False)
    n2 = td.fbm(W * ss, H * ss, 12, 6, octaves=3, seed=47, tile_x=True, tile_y=False)
    warp = (n1 - 0.5) * 22.0
    sh = 0.90 + 0.16 * n2
    # the skirt hangs in long folds that deepen to the hem; the back and the belly hold short creases
    down = _ss(1.00, 0.52, Z)
    fold = 0.5 + 0.5 * np.cos(np.radians((A + warp * (0.4 + 0.6 * down)) * (360.0 / 30.0)))
    sh *= 1.0 - (0.05 + 0.27 * down) * (1.0 - fold) ** 1.5
    sh *= 1.0 + 0.07 * down * fold ** 3
    crease = 0.5 + 0.5 * np.sin((Z + 0.012 * np.sin(np.radians(A * 3.0)) + (n1 - 0.5) * 0.05) * 2.0 * math.pi / 0.055)
    sh *= 1.0 - 0.13 * _g(Z, 1.09, 0.07) * crease ** 2 * (0.4 + 0.6 * np.clip(np.cos(np.radians(A)), 0, 1))
    # seams: the yoke, the sides, the middle of the back down to the vent
    dash = np.sin(X * 2.0 * math.pi / 2.2) > -0.1
    sh *= 1.0 - 0.20 * _g(Z, 1.292, 0.007) * dash
    sh *= 1.0 + 0.06 * _g(Z, 1.306, 0.008)
    for a0 in (-90.0, 90.0): sh *= 1.0 - 0.17 * _g(A - a0 + warp * 0.08, 0.0, 1.5) * (Z < 1.28)
    back = 180.0 - np.abs(A)
    sh *= 1.0 - 0.22 * _g(back, 0.0, 2.0) * (Z > 0.88) - 0.5 * _g(back, 0.0, 2.6) * (Z <= 0.88)
    col = np.empty(X.shape + (3,), np.float32); col[:] = td.hex_rgb(BASE["coat"])
    col *= sh[:, :, None]
    def mul(m, k): col[:] = col * (1.0 + (k - 1.0) * np.clip(m, 0, 1))[:, :, None]
    def mix(m, hexc): td.over(col, np.clip(m, 0, 1)[:, :, None], np.asarray(td.hex_rgb(hexc), np.float32))
    # the front: left laps over right, a faced edge with its shadow and a row of stitching
    plk = (A > 4.0) & (A < 20.0) & (Z < 1.31)
    mul(plk, 1.13)
    mul(_g(A, 3.2, 1.3) * (Z < 1.31), 0.52)
    mul(_g(A, 17.8, 0.8) * (Z < 1.31) * (np.sin(Y * 2.0 * math.pi / 2.2) > -0.1), 0.74)
    # three horn toggles in cord loops
    for z0 in (1.235, 1.115, 0.900):
        cx = (10.5 / 360.0 + 0.5) * W; cy = coat_row(z0)
        mix(td.cover(td.sd_segment(X, Y, cx - 6.2, cy, cx + 2.0, cy, 0.42), 0.8) * 0.8, "#2B1F18")       # the loop
        mix(td.cover(td.sd_box(X, Y, cx + 0.2, cy, 2.5, 0.72, 0.6), 0.8), "#9A6E48")                     # horn
        mul(td.cover(td.sd_box(X, Y, cx + 0.2, cy + 1.25, 2.6, 0.5, 0.4), 0.9), 0.62)                    # its shadow
    # the sash: sags at the front, tied on the left hip, two ends
    zs = 1.012 - 0.030 * (0.5 + 0.5 * np.cos(np.radians(A))) + 0.012 * (0.5 - 0.5 * np.cos(np.radians(A)))
    on = np.abs(Z - zs) < 0.027
    mul(on, 1.22)
    mul(on * (0.5 + 0.5 * np.sin(np.radians(A * 9.0) + (Z - zs) * 160.0)) ** 3, 0.80)                  # its twist
    mul(_g(Z, zs - 0.037, 0.011), 0.60)                                                                 # the shadow under it
    mul(_g(Z, zs + 0.031, 0.006), 0.78)
    kx = (38.0 / 360.0 + 0.5) * W; ky = coat_row(1.0)
    mix(td.cover(td.sd_circle(X, Y, kx, ky, 2.3), 0.9) * 0.9, "#94705A")
    mul(td.cover(td.sd_circle(X, Y, kx + 0.5, ky + 0.9, 3.1), 1.2) * (1.0 - td.cover(td.sd_circle(X, Y, kx, ky, 2.3), 0.9)), 0.66)
    for dx, ln in ((-1.6, 11.0), (1.9, 8.5)):
        mix(td.cover(td.sd_segment(X, Y, kx + dx * 0.5, ky + 1.5, kx + dx * 1.6, ky + ln, 0.95), 0.9) * 0.88, "#8C6A54")
        mul(td.cover(td.sd_segment(X, Y, kx + dx * 0.5 + 1.2, ky + 1.5, kx + dx * 1.6 + 1.2, ky + ln, 0.6), 0.9), 0.72)
    # a patch pocket on the right hip, sagging open; a mend on the left of the skirt
    def rect(a0, a1, z0, z1): return ((a0 / 360.0 + 0.5) * W, (a1 / 360.0 + 0.5) * W, coat_row(z1), coat_row(z0))
    x0, x1, y0, y1 = rect(-52.0, -22.0, 0.700, 0.835)
    sd = td.sd_box(X, Y, 0.5 * (x0 + x1), 0.5 * (y0 + y1), 0.5 * (x1 - x0), 0.5 * (y1 - y0), 1.0)
    mul(td.cover(sd, 0.9), 1.09)
    mul(td.cover(np.abs(sd + 1.2) - 0.35, 0.7) * (np.sin((X + Y) * 2.0 * math.pi / 2.3) > -0.2) * (Y > y0 + 1.0), 0.70)
    mul(td.cover(td.sd_box(X, Y, 0.5 * (x0 + x1), y0 + 0.6, 0.5 * (x1 - x0) - 0.6, 0.55, 0.3), 0.8), 0.45)      # the dark of its mouth
    mul(td.cover(td.sd_box(X, Y, 0.5 * (x0 + x1) + 0.6, y1 + 0.9, 0.5 * (x1 - x0), 0.5, 0.3), 1.0), 0.72)
    x0, x1, y0, y1 = rect(62.0, 96.0, 0.560, 0.660)
    sd = td.sd_box(X, Y, 0.5 * (x0 + x1), 0.5 * (y0 + y1), 0.5 * (x1 - x0), 0.5 * (y1 - y0), 0.4)
    mix(td.cover(sd, 0.9) * 0.55, "#9C7A5E")
    mul(td.cover(np.abs(sd + 0.9) - 0.3, 0.7) * (np.sin((X - Y) * 2.0 * math.pi / 2.0) > 0.0), 0.62)
    # the ground comes up the skirt; the hem is frayed; the inside is dark
    dust = _ss(0.86, 0.50, Z) * (0.45 + 0.75 * n1)
    mix(dust * 0.42, "#B48E66")
    fray = td.value_noise(W * ss, H * ss, 53, 1, seed=9, tile_x=True, tile_y=False)
    mul((Y > COAT_Y1 - 1.2 - 2.4 * fray) & (Y <= COAT_Y1 + 0.6), 0.70)
    mul(Y > COAT_Y1 + 0.6, 0.30)
    out = td.downsample(col, ss)
    w = _weave(W, H, 7, 0.030, 0.07)
    yy, xx = np.mgrid[0:H, 0:W]
    w *= 1.0 + 0.035 * (((xx + 2 * yy) % 4) < 2)                                                        # a twill's slant
    out *= w[:, :, None]
    return np.clip(out, 0.0, 1.0)


def _sleeve(ss=3):
    W, H = 48, 80
    X, Y = td.grid(W, H, ss)
    S = X / W; T = (Y - 1.5) / 74.0
    n1 = td.fbm(W * ss, H * ss, 3, 4, octaves=3, seed=61, tile_x=True, tile_y=False)
    sh = 0.90 + 0.17 * n1
    # the crook of the elbow: creases crowd together there and thin out toward the shoulder and the cuff
    crowd = 0.25 + 0.75 * _g(T, 0.52, 0.16)
    ph = T * 2.0 * math.pi * 9.0 + 2.4 * np.sin(S * 2.0 * math.pi) + (n1 - 0.5) * 7.0
    cr = 0.5 + 0.5 * np.sin(ph)
    sh *= 1.0 - 0.30 * crowd * cr ** 3
    sh *= 1.0 + 0.07 * crowd * (1.0 - cr) ** 3
    sh *= 1.0 - 0.16 * _g(S, 0.75, 0.02)                                                                # the seam down the under side
    sh *= 1.0 - 0.22 * _g(T, 0.045, 0.012) * (np.sin(X * 2.0 * math.pi / 2.2) > -0.1)                  # the shoulder seam
    col = np.empty(X.shape + (3,), np.float32); col[:] = td.hex_rgb(BASE["sleeve"])
    col *= sh[:, :, None]
    cuff = T > 0.905
    col[cuff] *= 1.20                                                                                   # a turned cuff
    col *= (1.0 - 0.45 * _g(T, 0.895, 0.012))[:, :, None]
    col *= (1.0 - 0.20 * _g(T, 0.955, 0.008) * (np.sin(X * 2.0 * math.pi / 2.2) > -0.1))[:, :, None]
    td.over(col, (np.clip(_ss(0.45, 1.0, T) * (0.3 + 0.8 * n1), 0, 1) * 0.30)[:, :, None], np.asarray(td.hex_rgb("#B48E66"), np.float32))
    col[Y > 77.2] *= 0.28                                                                               # inside the cuff
    out = td.downsample(col, ss)
    w = _weave(W, H, 13, 0.030, 0.07)
    yy, xx = np.mgrid[0:H, 0:W]
    w *= 1.0 + 0.035 * (((xx + 2 * yy) % 4) < 2)
    out *= w[:, :, None]
    return np.clip(out, 0.0, 1.0)


def _plain(ss=2):
    W, H = 48, 80
    n1 = td.fbm(W, H, 3, 5, octaves=3, seed=71, tile_x=True, tile_y=True)
    sh = 0.90 + 0.12 * n1
    col = np.empty((H, W, 3), np.float32); col[:] = td.hex_rgb(BASE["weave"])
    col *= sh[:, :, None]
    yy, xx = np.mgrid[0:H, 0:W]
    w = _weave(W, H, 17, 0.060, 0.10)
    w *= 1.0 - 0.07 * ((yy % 7) == 3)                                                                   # a heavier weft every few picks
    return np.clip(col * w[:, :, None], 0.0, 0.94)


def paint(img):
    """Draw the four cloths into `img` (the 256 x 256 x 4 sRGB palette image), in place."""
    for name, fn in (("hood", _hood), ("coat", _coat), ("sleeve", _sleeve), ("weave", _plain)):
        x, y, w, h = REGIONS[name]
        img[y:y + h, x:x + w, :3] = fn()
    return img


def map_by_position(ob, uv_module, fn, faces=None):
    """UV0 of `ob` (or of the polygon indices `faces`) from each corner's own position: fn(x, y, z) -> a Blender UV
    (one of the *_uv functions above). For meshes whose cloth is laid flat enough to project: the hung coats."""
    me = ob.data
    a = uv_module.get(ob)
    sel = set(faces) if faces is not None else None
    for p in me.polygons:
        if sel is not None and p.index not in sel: continue
        for li, vi in zip(p.loop_indices, p.vertices):
            c = me.vertices[vi].co
            a[li] = fn(c.x, c.y, c.z)
    uv_module.put(ob, a)

