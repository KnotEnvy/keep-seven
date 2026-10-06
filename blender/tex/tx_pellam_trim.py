"""tx_pellam_trim: 1024 x 512 greyscale detail (R8). Horizontal strips, each tiling in U (ART_BIBLE 4.1, 4.2, 5.5).

    node tools/build-assets.mjs --only tx_pellam_trim

Pellam is made by machines to a drawing: every row is exact, on the 1.2 m module (three modules per 3.6 m U repeat),
and carries NO random wear: variation comes from vertex colour (`enamel_stain`) and from which module is missing.
Neutral 0.5; values 0.38..0.62 except drawn seams, fasteners, slots and holes (down to 0.22). Rows (top to bottom):

    panel      128   1.2 m x 3.6 m   ceramic panel: flat, a seam line each side, four corner fasteners per module
    panel_rib   64   0.6 m x 3.6 m   ribbed ceramic: 8 soft flutes, module seams
    steel       64   0.6 m x 3.6 m   brushed structural steel, a bolt row (0.3 m pitch), a flange line
    floor      128   1.2 m x 3.6 m   satin floor plate: seams, a drain slot per plate
    concrete    96   2.4 m x 7.2 m   cast concrete: formwork board lines, tie holes, a pour joint
    cable       32   0.05 m x 0.8 m  braided cable
    flat        64 x 64 px inside the first panel: uniform 0.5 (128). Embedded props and flat parts point UV0 here.

The row table is written to blender/lib/tx_pellam_trim.json (`manifest.trim_v`, `uv.map_to_trim`).
APPEND-ONLY after phase 2: a row or the flat cell never moves. The sheet is full; a new strip needs a new texture.
"""
import sys, os, math
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")   # never loop at the filesystem root
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
import numpy as np
from lib import texdraw as td, manifest

W, H = 1024, 512
ROWS = [("panel", 128, 1.2, 3.6), ("panel_rib", 64, 0.6, 3.6), ("steel", 64, 0.6, 3.6), ("floor", 128, 1.2, 3.6),
        ("concrete", 96, 2.4, 7.2), ("cable", 32, 0.05, 0.8)]
FLAT = (138, 32, 64, 64)        # x, y, w, h (sheet pixels): centre of the first panel
MOD = W / 3.0                   # one 1.2 m module in pixels


def module_seams(a, seam, X, Y, w, half=1.1, value=0.24, lip=0.045):
    """Vertical seam at every module boundary: a dark joint with a lit arris each side (the 20 mm bevel)."""
    for k in range(3):
        x = k * MOD
        dx = td.wrap_dx(X, x, w)
        a += lip * np.clip(1.0 - np.abs(np.abs(dx) - 3.4) / 1.6, 0, 1)
        td.vline(a, seam, X, x, half, value, w)


def fastener(a, seam, X, Y, cx, cy, w, r=3.4):
    """A countersunk fastener: dark ring, paler head, one drive slot."""
    dx = td.wrap_dx(X, cx, w); dy = Y - cy; rr = np.hypot(dx, dy)
    ring = td.cover(np.abs(rr - r) - 0.75, 1.1)
    td.over(a, ring, 0.25); np.maximum(seam, ring, out=seam)
    head = td.cover(rr - (r - 0.9), 1.0)
    td.over(a, head, 0.545)
    slot = td.cover(np.abs(dy - dx * 0.0) - 0.55, 1.0) * (np.abs(dx) < r - 1.3)
    td.over(a, slot, 0.30); np.maximum(seam, slot, out=seam)


def panel(w, h, flat_local):
    X, Y = td.grid(w, h)
    a = np.full((h, w), 0.5, dtype=np.float32); seam = np.zeros((h, w), dtype=np.float32)
    # the glaze is not dead flat: a very slow pooling toward the lower edge of each module
    lx = (X % MOD) / MOD
    a += 0.018 * (Y / h - 0.5) + 0.010 * np.cos((lx - 0.5) * math.pi)
    module_seams(a, seam, X, Y, w)
    # top and bottom arris (the joint itself is geometry)
    edge = np.minimum(Y, h - Y)
    a -= 0.05 * np.clip(1.0 - edge / 2.5, 0, 1)
    a += 0.03 * np.clip(1.0 - np.abs(edge - 4.0) / 1.5, 0, 1)
    inset = 15.0
    for k in range(3):
        for sx in (inset, MOD - inset):
            for cy in (inset, h - inset):
                fastener(a, seam, X, Y, k * MOD + sx, cy, w)
    a = td.finish_detail(a, seam)
    fx, fy, fw, fh = flat_local
    d = td.sd_box(X, Y, fx + fw / 2, fy + fh / 2, fw / 2, fh / 2)
    k = np.clip(1.0 - d / 12.0, 0, 1)
    a = a * (1 - k) + (128.0 / 255.0) * k
    a[fy:fy + fh, fx:fx + fw] = 128.0 / 255.0
    return a


def panel_rib(w, h):
    X, Y = td.grid(w, h)
    seam = np.zeros((h, w), dtype=np.float32)
    ph = (Y / h * 8.0) % 1.0
    flute = np.sin(ph * math.pi)                                                   # 1 on the crown, 0 in the groove
    a = 0.5 + 0.10 * (flute - 0.64) + 0.03 * np.cos(ph * 2 * math.pi + 2.2)        # lit upper flank
    g = np.clip(1.0 - flute * 5.0, 0, 1)
    td.over(a, g * 0.85, 0.27); np.maximum(seam, g * 0.85, out=seam)
    module_seams(a, seam, X, Y, w)
    return td.finish_detail(a, seam)


def steel(w, h, seed):
    X, Y = td.grid(w, h)
    seam = np.zeros((h, w), dtype=np.float32)
    brushed = td.value_noise(w, h, 6, 64, seed) - 0.5                              # machine-brushed along U
    brushed2 = td.value_noise(w, h, 24, 64, seed + 1) - 0.5
    a = 0.5 + brushed * 0.050 + brushed2 * 0.03
    # rolled section: a flange along the top with the bolt row, a web below
    td.hline(a, seam, Y, 21.0, 0.9, 0.26)
    a += 0.04 * np.clip(1.0 - np.abs(Y - 23.5) / 1.6, 0, 1)                        # lit arris under the flange line
    a -= 0.035 * np.clip(1.0 - (Y - 21.0) / 14.0, 0, 1) * (Y > 21.0)               # shadow under the flange
    td.hline(a, seam, Y, h - 1.0, 1.0, 0.30); td.hline(a, seam, Y, 0.5, 1.0, 0.30)
    pitch = w / 12.0                                                               # a bolt every 0.3 m
    for k in range(12):
        cx = (k + 0.5) * pitch; cy = 10.5
        dx = td.wrap_dx(X, cx, w); dy = Y - cy
        ang = np.arctan2(dy, dx); rr = np.hypot(dx, dy)
        hexr = 5.2 / np.cos((ang + math.pi / 6) % (math.pi / 3) - math.pi / 6)     # hexagon radius by angle
        edge = td.cover(np.abs(rr - hexr) - 0.7, 1.1)
        td.over(a, edge, 0.25); np.maximum(seam, edge, out=seam)
        face = td.cover(rr - (hexr - 0.9), 1.0)
        td.over(a, face, 0.50 - 0.08 * (dx + dy) / 6.0)
        washer = td.cover(np.abs(rr - 7.6) - 0.5, 1.0)
        a -= 0.05 * washer
    module_seams(a, seam, X, Y, w, half=0.8, value=0.28, lip=0.02)
    return td.finish_detail(a, seam)


def floor(w, h, seed):
    X, Y = td.grid(w, h)
    seam = np.zeros((h, w), dtype=np.float32)
    satin = td.value_noise(w, h, 128, 8, seed) - 0.5                               # cross-brushed satin: faint
    satin2 = td.value_noise(w, h, 8, 128, seed + 1) - 0.5
    a = 0.5 + satin * 0.022 + satin2 * 0.018
    # raised anti-slip bars, exact: short dashes on a 0.1 m grid, alternate rows offset
    gx = MOD / 12.0; gy = h / 12.0
    row = np.floor(Y / gy)
    ux = ((X + (row % 2) * gx * 0.5) % gx) - gx / 2; uy = (Y % gy) - gy / 2
    dash = td.cover(td.sd_box(ux, uy, 0, 0, gx * 0.27, 1.25, 1.2), 1.2)
    a += dash * (0.05 - 0.085 * np.clip(uy / 1.6, -1, 1))                          # lit top edge, dark lower edge
    module_seams(a, seam, X, Y, w)
    td.hline(a, seam, Y, h - 0.6, 1.2, 0.24); a += 0.04 * np.clip(1.0 - np.abs(Y - (h - 4.5)) / 1.5, 0, 1)
    td.hline(a, seam, Y, 0.0, 0.8, 0.30)
    for k in range(3):                                                             # one drain slot per plate
        cx = (k + 0.5) * MOD; cy = h - 17.0
        dx = td.wrap_dx(X, cx, w)
        clear = td.cover(td.sd_box(dx, Y, 0, cy, 62.0, 9.0, 6.0), 1.5)
        a = a * (1 - clear) + 0.5 * clear                                          # a plain land round the slot
        slot = td.cover(td.sd_box(dx, Y, 0, cy, 52.0, 3.0, 3.0), 1.2)
        td.over(a, slot, 0.22); np.maximum(seam, slot, out=seam)
        a += 0.05 * td.cover(np.abs(td.sd_box(dx, Y, 0, cy, 54.5, 5.5, 5.0)) - 0.6, 1.0) * (1 - slot)
        for sx in (-MOD / 2 + 13.0, MOD / 2 - 13.0):
            fastener(a, seam, X, Y, cx + sx, 13.0, w, r=3.0)
    return td.finish_detail(a, seam)


def concrete(w, h, seed):
    X, Y = td.grid(w, h)
    seam = np.zeros((h, w), dtype=np.float32)
    bh = h / 4.0                                                                   # four formwork boards of 0.6 m
    bi = np.floor(Y / bh).astype(np.int64)
    tones = np.array([0.018, -0.02, 0.008, -0.012], dtype=np.float32)
    a = 0.5 + tones[bi]
    imprint = td.value_noise(w, h, 5, 96, seed) - 0.5                              # the boards' grain printed in the face
    imprint2 = td.fbm(w, h, 3, 24, octaves=2, seed=seed + 1) - 0.5
    cloud = td.fbm(w, h, 6, 2, octaves=3, seed=seed + 2) - 0.5
    pit = td.value_noise(w, h, 400, 40, seed + 3)
    a += imprint * 0.035 + imprint2 * 0.04 + cloud * 0.07 - 0.05 * np.clip((pit - 0.86) * 9.0, 0, 1)
    for k in range(1, 4):                                                          # board lines: a fin of grout, then shadow
        y = k * bh
        a += 0.035 * np.clip(1.0 - np.abs(Y - (y - 1.8)) / 1.4, 0, 1)
        td.hline(a, seam, Y, y, 0.7, 0.31)
    td.hline(a, seam, Y, 0.0, 0.8, 0.31); td.hline(a, seam, Y, float(h), 0.8, 0.31)
    # tie holes every 1.2 m, two heights. Revision 2 (art-env-interior fix pass 1): the row is 142 px/m along U and
    # 40 px/m along V, and the holes were drawn round IN PIXELS: on a wall they were ellipses 5 cm wide and 18 cm
    # tall with a 0.55 m drip under them, which read as smears on the peg stair's walls at arm's length. They are
    # round in METRES now (a 36 mm hole in a 90 mm cone, a 0.2 m weep under it). Nothing moves: same row, same
    # centres, same table (append-only holds).
    kx = w / 7.2; ky = h / 2.4                                                     # px per metre along U and V
    for k in range(6):
        cx = (k + 0.5) * w / 6.0
        for cy in (bh * 0.5, bh * 2.5):
            dx = td.wrap_dx(X, cx, w) / kx; dy = (Y - cy) / ky; rr = np.hypot(dx, dy)          # metres
            a += 0.035 * np.clip(1.0 - np.abs(rr - 0.045) / 0.018, 0, 1)           # cone rim
            hole = np.clip((0.024 - rr) / 0.012 + 0.5, 0, 1)
            td.over(a, hole, 0.25); np.maximum(seam, hole, out=seam)
            a -= 0.022 * np.clip(1.0 - np.abs(dx) / 0.02, 0, 1) * np.clip(dy / 0.04, 0, 1) * np.clip(1.0 - dy / 0.2, 0, 1)
    x = w * 0.5                                                                    # one pour joint per repeat
    td.vline(a, seam, X, x, 0.7, 0.30, w); a -= 0.03 * np.clip(1.0 - np.abs(td.wrap_dx(X, x + 4.0, w)) / 5.0, 0, 1)
    td.vline(a, seam, X, 0.0, 0.7, 0.30, w)
    return td.finish_detail(a, seam)


def cable(w, h):
    X, Y = td.grid(w, h)
    seam = np.zeros((h, w), dtype=np.float32)
    n = 64.0
    p1 = (X / w * n + Y / h * 2.0) % 1.0; p2 = (X / w * n - Y / h * 2.0) % 1.0
    s1 = np.sin(p1 * math.pi); s2 = np.sin(p2 * math.pi)
    chk = (np.floor(X / w * n + Y / h * 2.0) + np.floor(X / w * n - Y / h * 2.0)) % 2 # over / under weave
    strand = np.where(chk > 0.5, s1, s2)
    a = 0.5 + 0.09 * (strand - 0.6)
    g = np.clip(1.0 - np.minimum(s1, s2) * 3.0, 0, 1)
    td.over(a, g * 0.8, 0.27); np.maximum(seam, g * 0.8, out=seam)
    yy = (Y - h / 2) / (h / 2)
    a += 0.06 * np.sqrt(np.clip(1.0 - yy * yy, 0, 1)) - 0.045
    edge = np.clip(1.0 - (1.0 - np.abs(yy)) * h / 2 / 2.2, 0, 1)
    td.over(a, edge * 0.8, 0.30); np.maximum(seam, edge * 0.8, out=seam)
    return td.finish_detail(a, seam)


def build():
    sheet = np.full((H, W), 0.5, dtype=np.float32)
    regions = {}; y = 0
    for i, (name, hpx, mv, mu) in enumerate(ROWS):
        seed = 300 + 13 * i
        if name == "panel": row = panel(W, hpx, (FLAT[0], FLAT[1] - y, FLAT[2], FLAT[3]))
        elif name == "panel_rib": row = panel_rib(W, hpx)
        elif name == "steel": row = steel(W, hpx, seed)
        elif name == "floor": row = floor(W, hpx, seed)
        elif name == "concrete": row = concrete(W, hpx, seed)
        else: row = cable(W, hpx)
        sheet[y:y + hpx] = row
        regions[name] = {"px": [0, y, W, hpx], "metres_u": mu, "metres_v": mv}
        y += hpx
    assert y == H
    regions["flat"] = {"px": list(FLAT), "metres_u": 0, "metres_v": 0}
    return sheet, {"size": [W, H], "regions": regions}


def main():
    out = sys.argv[sys.argv.index("--out") + 1]
    sheet, tab = build()
    td.write_json_if_changed(os.path.join(manifest.LIB, "tx_pellam_trim.json"), tab)
    td.write_png(out, sheet)
    print(f"OK tx_pellam_trim rows {[r[0] for r in ROWS]} min {sheet.min():.3f} max {sheet.max():.3f} -> {out}")


if __name__ == "__main__":
    try: main()
    except SystemExit: raise
    except BaseException:
        import traceback; traceback.print_exc(); sys.exit(1)
