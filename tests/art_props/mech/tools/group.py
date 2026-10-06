"""Group scenes for art-props-mech's evidence sheets: several RAW exports placed together in one .blend, which
blender/tools/preview.py then renders (Cycles, the shared textures on, the lamps lit).

    tools/blender.sh -b --factory-startup --python-exit-code 1 -P tests/art_props/mech/tools/group.py -- <preset> <out.blend>

Presets place assets exactly as the game does: `layout.placement(marker, binding offset, scale)` (ARCHITECTURE 9.2).
It prints the camera shots to pass to preview.py (`--shots "eye>target;..."`, Blender coordinates)."""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py")): _d = os.path.dirname(_d)
sys.path.insert(0, os.path.join(_d, "blender"))
import bpy, math
from mathutils import Vector, Matrix, Euler
from lib import scene as sc, layout, manifest


def add(asset, loc=(0, 0, 0), rot_z=0.0, scale=1.0, hide=(), pose=None, bones=None):
    """Import one raw GLB and stand its root at a Blender location. pose = (clip, fraction): the clip's pose baked in.
    bones = {bone: (loc xyz in bone space)} extra pose (code-driven bones)."""
    before = set(bpy.data.objects)
    try: bpy.ops.import_scene.gltf(filepath=manifest.raw_path(asset), disable_bone_shape=True)
    except TypeError: bpy.ops.import_scene.gltf(filepath=manifest.raw_path(asset))
    new = [o for o in bpy.data.objects if o not in before]
    root = next(o for o in new if o.parent is None)
    for o in new:
        if o.name.split(".")[0] in hide: o.hide_render = True
    arms = [o for o in new if o.type == 'ARMATURE']
    movers = [o for o in new if o.animation_data]
    if pose is not None:
        clip, frac = pose
        for o in movers:
            ad = o.animation_data
            for tr in ad.nla_tracks:
                tr.mute = True
                if tr.name == clip and tr.strips:
                    st = tr.strips[0]; ad.action = st.action
                    if st.action.slots: ad.action_slot = st.action_slot or st.action.slots[0]
                    a, b = st.action.frame_range
                    bpy.context.scene.frame_set(int(round(a + (b - a) * frac)))
        bpy.context.view_layer.update()
        keep = {}
        for o in movers:
            if o.type == 'ARMATURE': keep[o.name] = {pb.name: pb.matrix_basis.copy() for pb in o.pose.bones}
            else: keep[o.name] = o.matrix_basis.copy()
        for o in movers:
            o.animation_data_clear()
            if o.type == 'ARMATURE':
                for pb in o.pose.bones: pb.matrix_basis = keep[o.name][pb.name]
            else: o.matrix_basis = keep[o.name]
    else:
        for o in movers: o.animation_data_clear()
        for a in arms:
            for pb in a.pose.bones: pb.matrix_basis = Matrix.Identity(4)
    if bones:
        for a in arms:
            for name, loc_b in bones.items():
                if name in a.pose.bones: a.pose.bones[name].location = loc_b
    root.matrix_world = Matrix.Translation(loc) @ Matrix.Rotation(rot_z, 4, 'Z') @ Matrix.Scale(scale, 4)
    return root


def at_marker(asset, marker_id, offset=(0, 0, 0), scale=1.0, **kw):
    loc, rz = layout.placement(marker_id, offset, scale)
    return add(asset, loc, rz, scale, **kw)


def backdrop(lo, hi, colour=(0.35, 0.33, 0.31), wall=True, floor=True, wall_y=None):
    """A floor (and a wall behind, at the larger y) so the props do not hang in grey."""
    from lib import mesh, material, vcol, uv
    out = []
    if floor:
        f = mesh.box("bd_floor", (hi[0] - lo[0], hi[1] - lo[1], 0.05), ((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2] - 0.025)); out.append(f)
    if wall:
        y = hi[1] if wall_y is None else wall_y
        w = mesh.box("bd_wall", (hi[0] - lo[0], 0.05, hi[2] - lo[2]), ((lo[0] + hi[0]) / 2, y + 0.025, (lo[2] + hi[2]) / 2)); out.append(w)
    for o in out:
        material.assign(o, "m_flat"); uv.map_to_palette(o, "concrete"); vcol.fill_color(o, (1, 1, 1))
    return out


def seam():
    """The seam objects in a row: what the town made of Pellam's parts."""
    g = add("prop_stock_gate", (0, 0, 0), math.pi)                     # the lip side (hooks, jugs) toward the camera
    for i, x in enumerate((-1.75, -1.05, -0.35, 0.35, 1.05, 1.75)):
        add("ia_jug", (-x, -0.15, 2.36), 0.3 * i, hide=("jug_broken",) if i != 3 else ("jug_intact",))
    add("ia_yard_door", (6.4, -0.1, 0), math.pi + 0.0)
    add("knot_mech", (6.4 - 2.25, -0.16, 1.3), 0.0)
    add("ia_ammo_box", (-3.6, 0.0, 0.0), 0.0)
    add("ia_shutter", (-5.4, -0.1, 1.4), 0.0)
    add("prop_share_cloth", (8.2, -0.3, 2.5), 0.0)
    backdrop((-6.6, -6, 0), (9.4, 0.0, 3.4), wall_y=0.0)
    print('SHOTS --shots=1.0,-11.5,1.8>1.5,0,1.5 --aspect 2.4 --lens 28')


def daylight():
    add("ia_shutter", (-3.0, -0.1, 2.1), 0.0)
    add("ia_shutter", (-1.3, -0.1, 2.1), 0.0, pose=("drop_open", 0.5))
    add("prop_share_cloth", (0.9, -0.5, 2.9), 0.0)
    add("prop_day_cell", (2.9, -0.3, 1.9), 0.0)
    for i, (frac, y) in enumerate(((0.0, -2.2), (0.15, -5.6), (1.0, -10.0))):
        add("ia_hatch", (0.0, y, 0.0), math.pi, pose=("open", frac))
    backdrop((-4.2, -12.5, -0.02), (4.4, 0.0, 3.4), wall_y=0.0, floor=False)
    print('SHOTS --shots=-6.5,-16.5,7.5>0.0,-4.6,0.6 --aspect 1.6 --lens 32')


def proving():
    """The step, the loop and knot_a/b/c exactly where the layout puts them; the camera is the layout's eye point."""
    B = manifest.load()["bindings"]
    at_marker("prop_proving_step", "pz_proving_mark", B["puzzleElement"]["pz_proving_mark"]["offset"])
    at_marker("prop_sighting_loop", "pz_sighting_loop", B["puzzleElement"]["pz_sighting_loop"]["offset"])
    for k in "abc":
        b = B["interactable"][f"knot_{k}"]
        at_marker("knot_mech", f"knot_{k}", b["offset"], b.get("scale", 1.0))
    eye = layout.to_blender(layout.marker("pz_proving_mark")["params"]["eye"]) if "eye" in layout.marker("pz_proving_mark").get("params", {}) else layout.to_blender((-82.2, -10.2, -15.0))
    ring = layout.to_blender(layout.marker("pz_sighting_loop")["pos"])
    kc = layout.to_blender(layout.marker("knot_c")["pos"])
    print("EYE", eye, "RING", ring)
    print(f'SHOTS --shots={eye[0]},{eye[1]},{eye[2]}>{kc[0]},{kc[1]},{kc[2]};{eye[0] - 3.2},{eye[1] - 4.5},{eye[2] + 0.6}>{ring[0]},{ring[1]},{ring[2] - 1.0} --aspect 1.78 --lens 60')


def asking():
    B = manifest.load()["bindings"]
    at_marker("ia_bore_door", "door_bore", B["door"]["door_bore"]["offset"])
    at_marker("ia_cradle", "ia_cradle", B["interactable"]["ia_cradle"]["offset"])
    at_marker("prop_station_plate", "prop_station_plate_4", B["prop"]["station_plate"]["offset"])
    d = layout.to_blender(layout.marker("door_bore")["pos"])
    from lib import mesh, material, vcol, uv
    w = mesh.box("bd_wall", (9, 0.05, 5), (d[0] - 1.0, d[1] - 0.15, d[2] + 2.5))        # the antechamber's door wall, a hole left to the eye
    material.assign(w, "m_flat"); uv.map_to_palette(w, "concrete"); vcol.fill_color(w, (0.8, 0.8, 0.8))
    f = mesh.box("bd_floor", (9, 8, 0.05), (d[0] - 1.0, d[1] + 4, d[2] - 0.025))
    material.assign(f, "m_flat"); uv.map_to_palette(f, "concrete"); vcol.fill_color(f, (0.7, 0.7, 0.7))
    print(f'SHOTS --shots={d[0] - 1.0},{d[1] + 6.0},{d[2] + 1.65}>{d[0] - 1.0},{d[1]},{d[2] + 1.5} --aspect 1.78 --lens 26')


if __name__ == "__main__":
    preset, out = sc.argv_after_dashes()[:2]
    sc.reset_scene()
    {"seam": seam, "daylight": daylight, "proving": proving, "asking": asking}[preset]()
    sc.save_blend(out)
