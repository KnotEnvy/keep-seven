"""tx_palette_emis: 256 x 256 RGBA sRGB, same cell layout as tx_palette; black except the emissive cells
(flame, flame_core, aqua, aqua_core, violet, violet_core, violet_band, violet_band_core). ART_BIBLE 4.2.

    node tools/build-assets.mjs --only tx_palette_emis

The cells are defined in blender/tex/tx_palette.py (third value of a row-4 entry), so the two images cannot drift apart.
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _d)
import tx_palette                                    # noqa: E402  (sibling script: the single definition of the cells)
from lib import texdraw as td                        # noqa: E402  (tx_palette put blender/ on sys.path)


def main():
    out = sys.argv[sys.argv.index("--out") + 1]
    td.write_png(out, tx_palette.draw(True))
    n = sum(1 for c in tx_palette.table()["cells"].values() if "emis" in c)
    print(f"OK tx_palette_emis {n} emissive cells -> {out}")


if __name__ == "__main__":
    try: main()
    except SystemExit: raise
    except BaseException:
        import traceback; traceback.print_exc(); sys.exit(1)
