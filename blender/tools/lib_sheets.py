"""Evidence scenes for the shared library pieces: saves blender/blend/lib_knot.blend (the knot: hex and clustered collars,
three seeds) and blender/blend/lib_mark.blend (the Pellam mark flat and in relief, a maker's plate, stencil numerals).

    node tools/preview-asset.mjs --lib          runs this script, then renders shots/foundation-pipeline/knot_sheet.png and
                                                mark_sheet.png from the front (a straight and a raking view, fitted)
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")   # never loop at the filesystem root
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
from lib import scene, mesh, uv, material, vcol, knot, brand, manifest


def backing(name, size, centre, colour):
    ob = mesh.finish(mesh.box(name, size, centre), bevel=0.01)
    material.assign(ob, "m_prop"); uv.map_to_palette(ob, colour); vcol.tint(ob, colour)
    vcol.compose_vertex_color(ob, mode='ratio', jitter=0.0, gradient=(0.9, 1.0))
    return ob


def knots():
    scene.reset_scene()
    for i, (collar, seed, r) in enumerate((("hex", 1, 0.16), ("hex", 5, 0.16), ("clustered", 2, 0.10), ("clustered", 7, 0.10))):
        k = knot.build_knot(r, collar, seed=seed, name=f"knot{i}")
        for o in k.values(): o.location = (i * 0.6 - 0.9, 0, 0.3)
        print(f"KNOT {collar} seed {seed}: lobes {mesh.tri_count(k['lobes'])} + collar {mesh.tri_count(k['collar'])} triangles")
    backing("wall", (2.6, 0.04, 0.6), (0, 0.02, 0.3), "enamel")
    scene.save_blend(os.path.join(manifest.ROOT, "blender", "blend", "lib_knot.blend"))


def marks():
    scene.reset_scene()
    flat = brand.pellam_mark(0.1, relief=0.0); flat.location = (-0.6, -0.002, 0.45)
    rel = brand.pellam_mark(0.1, relief=0.01); rel.location = (-0.2, 0, 0.45)
    small = brand.pellam_mark(0.04, relief=0.002, segments=8); small.location = (0.1, 0, 0.5)
    for o in (flat, rel, small): vcol.compose_vertex_color(o, mode='ratio', jitter=0.0, gradient=(1.0, 1.0))
    num = brand.numeral_mesh("4", 0.4, depth=0.006); num.location = (0.45, 0, 0.12)
    num2 = brand.numeral_mesh("1 2 3 8", 0.12, depth=0.0); num2.location = (0.45, -0.002, 0.6)
    for o in (num, num2): vcol.compose_vertex_color(o, mode='ratio', jitter=0.0, gradient=(1.0, 1.0))
    p = brand.maker_plate("4-205", bevel=0.0015)
    for o in p.values(): o.location = (0.05, 0, 0.2)
    vcol.compose_vertex_color(p["plate"], mode='ratio', jitter=0.0, gradient=(0.9, 1.0))
    backing("wall", (1.7, 0.04, 0.8), (0, 0.02, 0.4), "enamel")
    print(f"MARK flat {mesh.tri_count(flat)} / relief {mesh.tri_count(rel)} / small {mesh.tri_count(small)} triangles; numeral {mesh.tri_count(num)}; plate {mesh.tri_count(p['plate'])} + decals {mesh.tri_count(p['decals'])}")
    scene.save_blend(os.path.join(manifest.ROOT, "blender", "blend", "lib_mark.blend"))


if __name__ == "__main__":
    scene.run(lambda: (knots(), marks()))
