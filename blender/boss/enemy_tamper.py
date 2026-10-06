"""enemy_tamper: the walking pile-driver (ART_BIBLE 6.3 / 7.6, work order art-boss 4.2). Owner: art-boss-tamper.

    node tools/build-assets.mjs --only enemy_tamper
    node tools/preview-asset.mjs enemy_tamper --piece art-boss-tamper --cycles --game --clip all

One rigid-skinned mesh (m_prop, 1 draw call) on 12 bones; four empties. The parts and the pose solver are in
tamper_parts.py, the clips in tamper_clips.py.
Vent convention for code: rest = shut; +80 degrees about the vent bone's own X axis = fully open (both lids).
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
from lib import scene, mesh, rig, export
import tamper_parts as tp
import tamper_clips as tc

ASSET = "enemy_tamper"


def build(args):
    parts, info = tp.build_parts(clean=False, band="violet_band", number="4-141")
    rows = sorted(((mesh.tri_count(o, False), b, o.name) for b in parts for o in parts[b]), reverse=True)
    print("TRIS " + "  ".join(f"{n}:{t}" for t, b, n in rows))
    tp.bake_ao_groups(parts, distance=0.5)
    arm = rig.make_armature(ASSET + "_rig", tp.bone_table(info))
    body = rig.join_as_rigid_skin(parts, arm, "tamper_mesh")
    tp.compose(body)
    # sockets (empties riding bones): the two knot centres inside the cavities, the tamping face, the right toe
    for name, at, bone in (("vent_chest_knot", info["vent_chest_knot"], "barrel"), ("vent_back_knot", info["vent_back_knot"], "barrel"),
                           ("ram_head", info["ram_head"], "arm_r_ram"), ("foot_spark", info["foot_spark"], "leg_r_foot")):
        rig.parent_to_bone(export.marker(name, tuple(at)), arm, bone)
        print(f"SOCKET {name} game ({at.x:.3f}, {at.z:.3f}, {-at.y:.3f}) on {bone}")
    mn, mx = mesh.bounds([body])
    print(f"SIZE idle/rest: {mx.x - mn.x:.3f} wide, {mx.z - mn.z:.3f} high, {mx.y - mn.y:.3f} deep; tris {mesh.tri_count(body)}")
    tc.key_clips(arm, ASSET, info)


def main():
    # the frozen export call keeps a 2-key track for every bone and channel in every clip (36 per clip: 94 kB of JSON);
    # this switch drops the channels that are not keyed, so the vent bones have NO track outside their three clips
    export.EXPORT_SETTINGS["export_optimize_animation_keep_anim_armature"] = False
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    export.export_asset(ASSET, args.out, blend=args.blend)
    if args.preview: export.preview(ASSET, args.out, clips=True)


if __name__ == "__main__":
    scene.run(main)
