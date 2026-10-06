"""TEMPLATE: copy this file to blender/<your folder>/<asset id>.py and change ASSET and build().

    node tools/build-assets.mjs --only <asset id>          # build -> optimise -> check, one line of result
    node tools/preview-asset.mjs <asset id> [--clip all]   # contact sheet in shots/<piece>/

The driver runs:  tools/blender.sh -b --factory-startup --python-exit-code 1 -P <this file> -- --out <raw glb> --seed 1
Rules that bite (docs/research/blender-pipeline.md "twelve things"; ARCHITECTURE 7.2):
  * author in Blender space: +Z up, the asset's FRONT is -Y; a game point (x, y, z) is Blender (x, -z, y);
  * the pivot (origin) is where the manifest's `pivot` says; `nodePos` values are asset-local GAME coordinates;
  * every name in the manifest's `nodes` / `bones` must exist exactly; a name in both is the BONE;
  * materials are names (material.assign); UV0 points at the shared texture; COLOR_0 carries the paint;
  * finish (bevel) BEFORE mapping UVs and tinting; only random.Random(seed) for randomness;
  * draw calls = one per MESH per material (two meshes sharing m_prop are two): join static parts, rigid-skin moving
    ones; write the GLB only to args.out and lightmaps only through bake.save_lightmap (the driver ships both, or neither).
The worked example below is art-props' first asset, ia_ammo_box, as a rigid-skinned prop with a lamp set and a clip.
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")   # never loop at the filesystem root
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
import math
from lib import scene, mesh, uv, material, vcol, rig, anim, export, manifest, zone, brand

ASSET = "ia_ammo_box"


def part(name, size, centre, colour, bevel=0.006):
    """One box part: bevel + weighted normals, then material, palette cell (UV0) and base tint."""
    ob = mesh.finish(mesh.box(name, size, centre), bevel=bevel)
    material.assign(ob, "m_prop"); uv.map_to_palette(ob, colour); vcol.tint(ob, colour)
    return ob


def build(args):
    rng = scene.rng(args.seed)                                              # the only random source
    # ---- parts, not a primitive: back-plate, enamel body, kick plate, chute, flap (pivot: back-plate centre at floor)
    back = part("back", (0.66, 0.02, 0.96), (0, -0.01, 0.48), "steel", bevel=0)
    body = part("body", (0.60, 0.21, 0.86), (0, -0.125, 0.47), "enamel", bevel=0.02)     # Pellam bevel: 20 mm, exact
    kick = part("kick", (0.61, 0.215, 0.10), (0, -0.126, 0.09), "steel", bevel=0)
    chute = part("chute", (0.30, 0.09, 0.13), (0, -0.265, 0.30), "steel_dark", bevel=0.004)
    flap = part("flap_leaf", (0.27, 0.012, 0.12), (0, -0.316, 0.295), "enamel_stain", bevel=0)
    band = brand.livery_band([(-0.3, -0.232), (0.3, -0.232)], z=0.70, height=0.06)     # livery, scaled to the box
    plate = brand.maker_plate("4-112")                                       # cast plate: mark, wordmark, asset number
    for o in plate.values(): o.location = (0.0, -0.231, 0.58)
    for o in (body, kick, chute): mesh.delete_faces(o, lambda f, c, n: n.y > 0.9)   # faces against the back-plate: never seen
    # ---- skeleton: `root` holds the static parts, `flap` is the one moving part (hinge along X at the chute's top)
    arm = rig.make_armature(ASSET + "_rig", [("root", (0, 0, 0), (0, 0, 0.1), None),
                                             ("flap", (-0.1, -0.316, 0.355), (0.1, -0.316, 0.355), "root")])
    box = rig.join_as_rigid_skin({"root": [back, body, kick, chute, band, plate["plate"]], "flap": [flap]}, arm, ASSET + "_mesh")
    # ---- paint: AO + height ramp into COLOR_0 (ratio mode: the palette cell supplies the colour). Pellam: no jitter
    vcol.bake_ao_vertex([box], distance=0.4)
    vcol.compose_vertex_color(box, mode='ratio', jitter=0.0, seed=args.seed)
    vcol.streak_under(box, [(-0.27, -0.232, 0.86), (0.27, -0.232, 0.86)], width=0.05, length=0.3)   # below the top fasteners
    # ---- lamp set (m_emis, one draw call for all its lamps) and the m_mask decals of the plate
    lamp = zone.lamp_set("lamp", [[(-0.2, -0.232, 0.80), (0.2, -0.232, 0.80), (0.2, -0.232, 0.83), (-0.2, -0.232, 0.83)]], colour="aqua")
    plate["decals"].name = "plate_decals"
    # ---- clip: named as in the manifest, frames 0 .. anim.frames(); the flap kicks OUT and settles.
    # A hinge bone turns about its local Y (head -> tail), right-hand rule: this one runs along +X at the flap's top, so
    # a NEGATIVE angle swings the hanging flap out toward the front (-Y); positive would push it into the chute
    # (anim.key_pose has the table; look at `preview-asset --clip` before trusting a sign)
    act = anim.new_action(arm, "dispense"); n = anim.frames(ASSET, "dispense")
    for f, deg in ((0, 0), (3, -55), (6, 12), (9, -5), (n, 0)):
        anim.key_pose(arm, f, {"flap": {"rot": (0.0, math.radians(deg), 0.0)}})
    anim.fix_quaternion_flips(act); anim.push_to_nla(arm, [act])


def main():
    args = scene.asset_args(os.path.basename(__file__))                      # --out --blend --seed --preview
    scene.reset_scene()
    build(args)
    export.export_asset(ASSET, args.out, blend=args.blend)                   # manifest self-check + budget + GLB
    if args.preview: export.preview(ASSET, args.out, clips=True)


if __name__ == "__main__":
    scene.run(main)                                                          # any failure -> traceback, exit 1
