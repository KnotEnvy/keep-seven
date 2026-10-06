"""Evidence sheets of the shared textures (run by `node tools/preview-asset.mjs --textures`):

    tools/blender.sh -b --factory-startup --python-exit-code 1 -P blender/tools/texture_sheets.py -- <out dir> [texture ids...]

For every raw texture in blender/export/tex/ (default: the six final ones):
    tx_<id>.png          the texture as stored; detail textures also "as used" below it (vertex colour x detail x 2)
    tx_<id>_tiled.png    2 x 2 tiling of the as-used view (trim sheets and tx_sand)
    palette_named.png    every palette cell with its name (and the emissive colour beside it)
    mask_regions.png     tx_mask with every region and cell outlined and named
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")   # never loop at the filesystem root
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
import bpy
import numpy as np
from lib import scene as sc, texdraw as td, manifest, brand

ROW_TINT = {"plank_a": "board", "plank_b": "board_bleached", "plank_end": "board", "adobe": "adobe", "tin": "tin", "strata": "rock",
            "strap": "rust", "cord": "cord", "panel": "enamel", "panel_rib": "enamel", "steel": "steel", "floor": "concrete",
            "concrete": "concrete", "cable": "cable"}
_label_cache = {}


def label(text, cap_px):
    """Coverage image of a text label (capitals, digits, punctuation) at capital height cap_px."""
    key = (text, cap_px)
    if key not in _label_cache:
        tris, tw, th = brand.text_triangles(text.upper().replace("_", "-"), 1.0, bridges=False, widen=1.0)
        s = cap_px / max(th, 1e-6)
        w = int(tw * s) + 4; h = int(cap_px * 1.5) + 4
        px = np.empty_like(tris); px[:, :, 0] = tris[:, :, 0] * s + 2; px[:, :, 1] = (th - tris[:, :, 1]) * s + 2 + cap_px * 0.25
        _label_cache[key] = td.raster_triangles(px, w, h, ss=3)
    return _label_cache[key]


def stamp(img, text, x, y, cap_px=9, colour=(1.0, 1.0, 1.0), back=(0.0, 0.0, 0.0)):
    """Draw a label with a dark backing at (x, y) top-left on an RGB float image."""
    a = label(text, cap_px); h, w = a.shape
    x = int(max(0, min(img.shape[1] - w, x))); y = int(max(0, min(img.shape[0] - h, y)))
    h = min(h, img.shape[0] - y); w = min(w, img.shape[1] - x); a = a[:h, :w]
    reg = img[y:y + h, x:x + w]
    reg[:] = reg * 0.35 + np.asarray(back, dtype=np.float32) * 0.65
    reg[:] = reg * (1 - a[..., None]) + np.asarray(colour, dtype=np.float32) * a[..., None]


def as_used(grey, tint_rows):
    """vertex colour x detail x 2, displayed (sRGB). tint_rows: [(y0, y1, palette name)] or one palette name."""
    lin = np.zeros(grey.shape + (3,), dtype=np.float32)
    rows = [(0, grey.shape[0], tint_rows)] if isinstance(tint_rows, str) else tint_rows
    for y0, y1, name in rows:
        lin[y0:y1] = np.asarray(manifest.palette_rgb(name), dtype=np.float32)[None, None, :] * grey[y0:y1, :, None] * 2.0
    return td.linear_to_srgb(lin).astype(np.float32)


def outline(img, x, y, w, h, colour):
    c = np.asarray(colour, dtype=np.float32)
    img[y, x:x + w] = c; img[y + h - 1, x:x + w] = c; img[y:y + h, x] = c; img[y:y + h, x + w - 1] = c


def main():
    argv = sc.argv_after_dashes()
    out = os.path.abspath(argv[0]); os.makedirs(out, exist_ok=True)
    ids = argv[1:] or ["tx_frontier_trim", "tx_pellam_trim", "tx_sand", "tx_mask", "tx_palette", "tx_palette_emis"]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    done = []
    for tid in ids:
        path = manifest.raw_texture_path(tid)
        if not os.path.isfile(path): print(f"SKIP {tid}: no raw texture at {path}"); continue
        a = td.read_png(path)[0].astype(np.float32) / 255.0
        if tid in ("tx_frontier_trim", "tx_pellam_trim"):
            tab = manifest.trim(tid)
            rows = [(r["px"][1], r["px"][1] + r["px"][3], ROW_TINT.get(n, "concrete")) for n, r in tab["regions"].items() if n != "flat"]
            used = as_used(a, rows)
            sheet = np.concatenate([np.repeat(a[..., None], 3, axis=2), used], axis=0)
            for n, r in tab["regions"].items():
                x, y, w, h = r["px"]
                if n == "flat":
                    for off in (0, a.shape[0]): outline(sheet, x, y + off, w, h, (1.0, 0.3, 0.9))
                    stamp(sheet, "flat", x + 2, y + a.shape[0] + 2, 8)
                else: stamp(sheet, f"{n} {h}px {r['metres_v']}m x {r['metres_u']}m", 4, y + a.shape[0] + 2, 9)
            td.write_png(os.path.join(out, f"{tid}.png"), sheet)
            td.write_png(os.path.join(out, f"{tid}_tiled.png"), td.tile(used, 2, 2))
        elif tid == "tx_sand":
            used = as_used(a, "sand")
            td.write_png(os.path.join(out, f"{tid}.png"), np.concatenate([np.repeat(a[..., None], 3, axis=2), used], axis=1))
            td.write_png(os.path.join(out, f"{tid}_tiled.png"), td.tile(used, 2, 2))
        elif tid == "tx_mask":
            td.write_png(os.path.join(out, f"{tid}.png"), a)
            img = np.repeat(a[..., None], 3, axis=2) * 0.8 + 0.08
            tab = manifest.mask_regions()
            for n in sorted(tab["regions"]):
                r = tab["regions"][n]
                for c in r.get("cells", []): outline(img, c[0], c[1], c[2], c[3], (0.2, 0.55, 0.9))
                x, y, w, h = r["px"]; outline(img, x, y, w, h, (1.0, 0.75, 0.1))
                stamp(img, n, x + 2, y + 1, 8, (1.0, 0.85, 0.3))
            big = np.repeat(np.repeat(img, 2, axis=0), 2, axis=1)
            td.write_png(os.path.join(out, "mask_regions.png"), big)
        elif tid in ("tx_palette", "tx_palette_emis"):
            td.write_png(os.path.join(out, f"{tid}.png"), np.repeat(np.repeat(a[:, :, :3], 3, axis=0), 3, axis=1))
            if tid == "tx_palette":
                pal = manifest.palette(); cw, ch = 150, 74
                rows = max(c["row"] for c in pal["cells"].values()) + 1; cols = max(c["col"] for c in pal["cells"].values()) + 1
                img = np.full((rows * ch, cols * cw, 3), 0.12, dtype=np.float32)
                for name, c in pal["cells"].items():
                    x, y = c["col"] * cw, c["row"] * ch
                    img[y + 3:y + ch - 20, x + 3:x + cw - 3] = td.hex_rgb(c["hex"])
                    if "emis" in c: img[y + 3:y + ch - 20, x + cw // 2:x + cw - 3] = td.hex_rgb(c["emis"])
                    stamp(img, name, x + 3, y + ch - 19, 8, (0.95, 0.95, 0.9), (0.12, 0.12, 0.12))
                    stamp(img, c["hex"] + (" + " + c["emis"] if "emis" in c else ""), x + 4, y + 4, 6, (1, 1, 1))
                td.write_png(os.path.join(out, "palette_named.png"), img)
        else:
            td.write_png(os.path.join(out, f"{tid}.png"), a)
        done.append(tid)
    print(f"SHEETS {', '.join(done)} -> {out}")


if __name__ == "__main__":
    sc.run(main)
