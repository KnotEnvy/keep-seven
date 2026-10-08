"""tx_palette: 256 x 256 RGBA sRGB, 16 x 16 cells of 16 px, one palette colour per cell (ART_BIBLE 2.1, 4.2).

    node tools/build-assets.mjs --only tx_palette
    (= tools/blender.sh -b --factory-startup --python-exit-code 1 -P blender/tex/tx_palette.py -- --out blender/export/tex/tx_palette.png)

Also writes the name -> cell table blender/lib/palette.json, read by `manifest.palette_uv(name)`, `manifest.palette_rgb(name)`
and by blender/tex/tx_palette_emis.py (same layout).

APPEND-ONLY: a shipped cell never moves and never changes colour. Add new colours in free cells at the END of a row.
Columns 10-15 of rows 2-5 (x 160..255, y 32..95) are NOT free either: pass i3 put the crown knot there
(blender/tex/knot_atlas.py), in this sheet and in tx_palette_emis: never append a cell past column 9 in rows 2-5.
Rows 6-15 (y 96..255) are NOT free: pass i2 put the cloth atlas there (blender/tex/cloth_atlas.py, its REGIONS:
the painted hood, coat, sleeve and plain weave that m_prop cloth points its UV0 into). Rows by family: 0 ground, 1 frontier, 2 pellam, 3 gun / Reeve, 4 emissive (the albedo UNDER each
emissive cell), 5 UI-in-world and specials.
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")   # never loop at the filesystem root
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
import numpy as np
from lib import texdraw as td, manifest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cloth_atlas
import knot_atlas

SIZE = 256; CELL = 16
UNUSED = "#3C3836"       # free cells: a dull warm grey (never sampled)

# (name, hex, emissive hex or None). Order within a row = column. NEVER reorder: append.
ROWS = [
    # 0 ground
    [("sand", "#CDA070"), ("sand_pale", "#DDB98C"), ("rock", "#A3563A"), ("rock_dark", "#63302A"), ("rock_cap", "#C27A55"),
     ("adobe", "#B98A62"), ("adobe_base", "#8E6549"), ("clay", "#A9623F"), ("ash", "#8C8780"), ("ash_dark", "#2A2623"),
     ("chalk", "#E9E4D6")],
    # 1 frontier
    [("board", "#6E4E38"), ("board_bleached", "#927560"), ("board_dark", "#3B2A22"), ("tin", "#8B8478"), ("rust", "#B5522B"),
     ("linen", "#D8CDB4"), ("cord", "#A58B63"), ("leather", "#7A4E32"), ("workcloth", "#5E4636"), ("workcloth_light", "#7A5B45"),
     ("town_paint", "#6F9A94"), ("graphite", "#3A3A40")],
    # 2 pellam
    [("enamel", "#CFD6CC"), ("enamel_stain", "#AEB6A8"), ("steel", "#36525A"), ("steel_dark", "#1E2F36"), ("concrete", "#6F7A76"),
     ("cable", "#1B1F24"), ("livery", "#4FB8AC"), ("hazard", "#B58A3C"), ("brass", "#B88A3A"), ("lens", "#0E1418")],
    # 3 gun and the Reeve
    [("gun_blue", "#1C2230"), ("gun_worn", "#6B7078"), ("walnut", "#3A2318"), ("walnut_worn", "#5A3824"), ("glove", "#8A6A48"),
     ("glove_worn", "#A58460"), ("skin", "#9A6B4F"), ("cuff", "#3A3432"), ("kept_band", "#CFD6CC")],
    # 4 emissive cells: (name, albedo under the glow, emissive colour)
    [("flame", "#2A2623", "#FF9433"), ("flame_core", "#2A2623", "#FFE9B8"), ("aqua", "#0E1418", "#7CF2E2"),
     ("aqua_core", "#0E1418", "#E6FFFB"), ("violet", "#8A8A92", "#B24BFF"), ("violet_core", "#8A8A92", "#F0DCFF"),
     ("violet_band", "#1E2F36", "#B24BFF"), ("violet_band_core", "#1E2F36", "#F0DCFF")],
    # 5 UI-in-world and specials
    [("ui_bone", "#E9E2D0"), ("ui_ink", "#14110F"), ("ui_brass", "#C9A14A"), ("ui_brass_dim", "#6E5A2E"), ("ui_pale", "#F3E6CF"),
     ("husk", "#8A8A92"), ("dowser_pale", "#D9D2BF"), ("stake_cool", "#B5522B")],
]


def table():
    cells = {}
    for row, entries in enumerate(ROWS):
        for col, e in enumerate(entries):
            if e[0] in cells: raise RuntimeError(f"palette: duplicate name {e[0]}")
            c = {"col": col, "row": row, "hex": e[1]}
            if len(e) > 2: c["emis"] = e[2]
            cells[e[0]] = c
    return {"size": SIZE, "cell": CELL, "cells": cells}


def draw(emissive=False):
    """The palette image (h, w, 4) sRGB floats. emissive=True: black except the emissive cells."""
    img = np.zeros((SIZE, SIZE, 4), dtype=np.float32); img[:, :, 3] = 1.0
    img[:, :, :3] = (0, 0, 0) if emissive else td.hex_rgb(UNUSED)
    for name, c in table()["cells"].items():
        hx = c.get("emis") if emissive else c["hex"]
        if hx is None: continue
        y, x = c["row"] * CELL, c["col"] * CELL
        img[y:y + CELL, x:x + CELL, :3] = td.hex_rgb(hx)
    # pass i2 (creatures-props): the free rows 6-15 (y 96..255) hold the painted cloth of the townspeople: a hood, a
    # coat, a sleeve and a plain weave (blender/tex/cloth_atlas.py). The emissive sheet stays black there
    if not emissive: cloth_atlas.paint(img)
    # pass i3 (creatures-props): the cells of columns 10-15, rows 2-5 (x 160..255, y 32..95; never named) hold the crown
    # knot: bound glass seen from above and a length of its cord (blender/tex/knot_atlas.py), in BOTH sheets
    knot_atlas.paint(img, emissive)
    return img


def main():
    out = sys.argv[sys.argv.index("--out") + 1]
    td.write_json_if_changed(os.path.join(manifest.LIB, "palette.json"), table())
    td.write_png(out, draw(False))
    print(f"OK tx_palette {len(table()['cells'])} cells -> {out}")


if __name__ == "__main__":
    try: main()
    except SystemExit: raise
    except BaseException:
        import traceback; traceback.print_exc(); sys.exit(1)
