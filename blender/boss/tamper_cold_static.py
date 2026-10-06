"""tamper_cold_static: the cold-bay Tamper (ART_BIBLE 7.6, work order art-boss 4.4). Owner: art-boss-tamper.

    node tools/build-assets.mjs --only tamper_cold_static

The Tamper's own parts (tamper_parts.py) posed upright with the ram parked and both lids shut; the band in `livery`
paint, nothing emissive, no stain, no streak: the cleanest object in the game. One static mesh, no armature; its zone
(env_lift_hall) embeds and lights it, so this file carries tint x AO x height ramp only (the pipeline stamps a 'VL' +
placedBy 'zone' asset 'AO': FOUNDATION_REPORT 8c).
The chest hatch is seated flush on the drum (tamper_parts.build_parts(chest_plumb=False)): the fighting unit's hatch
stands plumb on a barrel pitched 15 degrees, and stood upright that housing would lean off the wall.
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _d)
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
import math
from lib import scene, mesh, vcol, export
import tamper_parts as tp

ASSET = "tamper_cold_static"
# upright: the barrel's 15 degree pitch taken out; parked: the arm plumb, the piston drawn right up into the casing
POSE = dict(bp=-math.degrees(tp.PITCH), ae=-0.38)


def build(args):
    parts, info = tp.build_parts(clean=True, band="livery", number="4-142", chest_plumb=False)
    # standing the barrel up swings the hanging arm forward; take that out and leave the arm leaning by the head's rake,
    # so the parked tamping face sits level
    pose = dict(POSE); pose["as"] = -math.degrees(tp.ARM_REST) + POSE["bp"] + math.degrees(tp.HEAD_RAKE)
    D = tp.solve(pose, info)
    objs = []
    for bone, obs in parts.items():
        for o in obs:
            tp.xf(o, D[bone]); objs.append(o)
    vcol.bake_ao_vertex(objs, distance=0.5)
    for o in objs:
        if o.get("flat_ao"): vcol.fill_color(o, (1.0, 1.0, 1.0), "AO")
    body = mesh.join(objs, "tamper_cold_mesh")
    # spotless: a gentle ramp and soft occlusion, no stain layer at all (build_parts(clean=True) adds none)
    tp.compose(body, gradient=(0.97, 1.05), ao_strength=0.22)
    mn, mx = mesh.bounds([body])
    print(f"SIZE cold: {mx.x - mn.x:.3f} wide, {mx.z - mn.z:.3f} high, {mx.y - mn.y:.3f} deep; base z {mn.z:.3f}; tris {mesh.tri_count(body)}")


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    export.export_asset(ASSET, args.out, blend=args.blend)
    if args.preview: export.preview(ASSET, args.out)


if __name__ == "__main__":
    scene.run(main)
