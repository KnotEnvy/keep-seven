"""lm_surface: the one 2048 x 2048 lightmap of env_the_lip and env_plenty_street (mood L1, Long Light).

The same scene as the two zone scripts (surface_common.build(): same geometry, same light, same atlas), baked once:
Cycles diffuse light, 64 samples + OIDN, two bounces. --out is ignored: bake.save_lightmap writes the staged path.
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _d)
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
from lib import scene, bake
import surface_common


def main():
    S = surface_common.build()
    objs = sorted(S.lm, key=lambda o: o.name)
    # small fittings on a big lightmapped surface (the drum's numeral, plate and cup) do not cast into the lightmap:
    # at 14 texels a metre their contact shadow is a smudge three times their size
    for z in S.objs:
        for o in S.objs[z]:
            if o.get("kfit"): o.hide_render = True
    # pass i4 (the visual reviewer: "lighter patches with dark hard outlines ... read as decals"): a drift, a wedge of banked
    # sand or the swept ring lies ON a ground sheet. In the bake it shut the sky and the sun out of the sheet under it:
    # those texels baked near black, and the lightmap's own filter drew them as a dark rim round every patch. Loose sand
    # takes light and casts none (its lee side is darker by its own slope and colour).
    import re
    loose = re.compile(r"(_sd(_|\.|$)|dune|drift|rib_sand)")
    n_loose = 0
    for z in S.objs:
        for o in S.objs[z]:
            if loose.search(o.name): o.visible_shadow = False; o.visible_diffuse = False; n_loose += 1
    print(f"LOOSE SAND: {n_loose} objects cast nothing in the lightmap bake")
    device = bake.use_cycles(os.environ.get("KS_EXT_DEVICE", "CUDA"), samples=64)
    img, dt = bake.bake_lightmap(objs, surface_common.LM, samples=16 if surface_common.FAST else 64, margin_px=4)
    print(f"BAKED {surface_common.LM} on {device}: {len(objs)} objects, {sum(len(o.data.polygons) for o in objs)} faces, {dt:.1f}s")
    import ground_paint
    ground_paint.apply(S, img)                                        # pass i1: ruts, boot prints, the trodden line, wind streaks (no triangles)
    import wall_paint
    wall_paint.apply(S, img)                                          # pass i2: the walls' weather, courses, cracks; the rock's beds; the drum's plates and rust
    bake.save_lightmap(img, surface_common.LM)


if __name__ == "__main__":
    scene.run(main)
