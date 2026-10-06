"""Pipeline fixture: a small m_prop static prop (a three-board stool). Embedded into fixture_room by zone.embed_prop
and referenced by its dressing empty. Not a game asset (tests/pipeline/fixtures/manifest.json)."""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")   # never loop at the filesystem root
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
from lib import scene, mesh, uv, material, vcol, export

ASSET = "fixture_stool"


def part(name, size, centre, colour, rng, bevel=0.008, max_edge=None):
    ob = mesh.box(name, size, centre)
    ob.rotation_euler = (rng.uniform(-0.012, 0.012), rng.uniform(-0.012, 0.012), rng.uniform(-0.03, 0.03))     # Frontier jitter
    mesh.apply_transform(ob)
    mesh.finish(ob, bevel=bevel)
    if max_edge: mesh.tessellate_max_edge(ob, max_edge)             # before UVs and tint
    material.assign(ob, "m_prop"); uv.map_to_palette(ob, colour); vcol.tint(ob, colour)
    return ob


def main():
    args = scene.asset_args("fixture_stool.py")
    scene.reset_scene()
    rng = scene.rng(args.seed)
    parts = [part("seat_a", (0.19, 0.38, 0.03), (-0.1, 0, 0.435), "board_bleached", rng),
             part("seat_b", (0.20, 0.36, 0.03), (0.1, 0.005, 0.432), "board", rng)]
    for i, (x, y) in enumerate(((-0.15, -0.14), (0.15, -0.14), (0.15, 0.14), (-0.15, 0.14))):
        parts.append(part(f"leg_{i}", (0.045, 0.045, 0.42), (x, y, 0.21), "board_dark" if i == 2 else "board", rng, bevel=0.005, max_edge=0.25))
    # ^ max_edge: a leg has vertices only at its two ends, and both ends touch something (the floor, the seat). A vertex
    #   bake samples at vertices, so without the edge loop half-way up the whole leg bakes black (vcol prints a WARNING)
    ob = mesh.join(parts, ASSET + "_mesh")
    mesh.delete_faces(ob, lambda f, c, n: n.z < -0.9 and c.z < 0.02)             # leg bottoms
    vcol.bake_ao_vertex([ob], distance=0.5)
    vcol.compose_vertex_color(ob, mode='ratio', jitter=0.06, seed=args.seed)
    vcol.darken_contact(ob, height=0.06)
    export.export_asset(ASSET, args.out, blend=args.blend)


if __name__ == "__main__":
    scene.run(main)
