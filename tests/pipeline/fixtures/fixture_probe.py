"""Pipeline fixture: what tests/pipeline/pipeline.test.mjs measures through the real loader.
  * mesh "fixture_probe_mesh": three quads whose COLOR_0 is exactly 0.02, 0.5 and 1.0 (12-bit colour test), UV0.x = the
    quad index / 4 + 0.125 so the test can tell them apart;
  * bones root + lid, empties with nodePos, a lamp set with nodePos (node resolution test);
  * clip "flip": AUTHORED at 9 frames = 0.30 s while the manifest says 0.32 s (timing test); "idle": a 1.0 s loop."""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")   # never loop at the filesystem root
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
import math
import numpy as np
from lib import scene, mesh, uv, material, vcol, rig, anim, export, zone

ASSET = "fixture_probe"


def main():
    args = scene.asset_args("fixture_probe.py")
    scene.reset_scene()
    bm = mesh.new_bmesh()
    for i in range(3):
        x0 = -0.18 + i * 0.13
        bm.faces.new([bm.verts.new(p) for p in ((x0, -0.15, 0.02), (x0 + 0.1, -0.15, 0.02), (x0 + 0.1, -0.15, 0.28), (x0, -0.15, 0.28))])
    probe = mesh.new_mesh_object("probe_part", bm)
    material.assign(probe, "m_prop")
    col = np.ones((len(probe.data.loops), 4), dtype=np.float32); u = uv.get(probe)
    for p in probe.data.polygons:
        for li in range(p.loop_start, p.loop_start + p.loop_total):
            col[li, :3] = (0.02, 0.5, 1.0)[p.index]; u[li] = (p.index / 4 + 0.125, 0.5)
    vcol.set_colors(probe, col); uv.put(probe, u)
    lid = mesh.box("lid_part", (0.4, 0.3, 0.02), (0, 0, 0.3))
    material.assign(lid, "m_prop"); uv.map_to_palette(lid, "board"); vcol.fill_color(lid, (0.8, 0.8, 0.8))
    arm = rig.make_armature(ASSET + "_rig", [("root", (0, 0, 0), (0, 0, 0.1), None), ("lid", (0.0, 0.15, 0.3), (0.2, 0.15, 0.3), "root")])
    rig.join_as_rigid_skin({"root": [probe], "lid": [lid]}, arm, ASSET + "_mesh")
    zone.lamp_set("probe_lamps", [[(x - 0.02, -0.152, 0.13), (x + 0.02, -0.152, 0.13), (x + 0.02, -0.152, 0.17), (x - 0.02, -0.152, 0.17)] for x in (-0.1, 0, 0.1)],
                  origin=(0, -0.152, 0.15))
    export.marker("socket_a", (0.2, -0.25, 0.1)); export.marker("socket_b", (-0.2, 0.0, 0.3))
    tip = export.marker("tip", (0.0, -0.15, 0.3)); rig.parent_to_bone(tip, arm, "lid")
    flip = anim.new_action(arm, "flip")
    anim.key_pose(arm, 0, {"lid": {"rot": (0, 0, 0)}}); anim.key_pose(arm, 9, {"lid": {"rot": (0, math.radians(-110), 0)}})   # 9 frames = 0.30 s
    anim.reset_pose(arm)
    idle = anim.new_action(arm, "idle")
    for f, d in ((0, 0), (15, -8), (30, 0)): anim.key_pose(arm, f, {"lid": {"rot": (0, math.radians(d), 0)}})
    anim.push_to_nla(arm, [flip, idle])
    export.export_asset(ASSET, args.out, blend=args.blend)


if __name__ == "__main__":
    scene.run(main)
