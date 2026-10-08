"""weapon_revolver: the Assize six and the Reeve's hands, one armature, two meshes, fifteen clips (art-weapons 4.1).

    node tools/build-assets.mjs --only weapon_revolver        node tools/preview-asset.mjs weapon_revolver --clip all

Authored in CAMERA SPACE in the idle pose: the camera at the origin looking down game -Z (Blender +Y), +Y up.
  gun_mesh   m_gun, rigid-skinned (one weight per vertex): blender/weapons/assize.py builds it in gun space with its
             unique unwrap on tx_gun; revolver_rig.GUN_M places it (muzzle at game (0.075, -0.070, -0.56), bore on the
             crosshair at 12 m).
  arms_mesh  m_prop, smooth-skinned: blender/weapons/hands.py (gloves, wrists, cuffs, sleeves), plus the cartridges of
             the left arm from blender/weapons/ammo.py: the three rounds she handles (round_hand_lead / _line / _kept),
             the kept round in its leather loop on the back of the left cuff (kept_loop) and the two halves of its band.
  31 bones, the empties muzzle / eject (on `gun`) and cam_look (on `root`); clips: blender/weapons/revolver_anim.py.

THE BAND. No bone may be added, so the two falling halves of the kept round's band ride the bones of the rounds that
`load_kept` does not show: half A on round_hand_lead, half B on round_hand_line, each 0.75 m BEHIND its cartridge's
head. When a clip shows a lead or line round in the fingers its band half is behind the camera; when load_kept shows
the halves on the cuff, their cartridges are behind the camera. take_round shows both halves on round_hand_kept: the
band whole again. revolver_anim.py checks every frame of every clip for a hidden piece inside the frustum.
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")   # never loop at the filesystem root
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import math
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix
from lib import scene, mesh, uv, material, vcol, rig, anim, export, manifest
import assize, hands, ammo, revolver_rig as R

ASSET = "weapon_revolver"
MM = 0.001
Z2Y = Matrix.Rotation(math.radians(-90.0), 4, 'X')            # a cartridge stands along +Z: lay it along +Y (nose forward)
HALF_BACK = 0.75                                              # metres a band half sits behind its bone's cartridge
# Pass i3 (the visual reviewer: "the kept round in its loading close-up is as thick as two gloved fingers, visibly too
# large for the chamber it goes into"): a round in the left hand is 0.25 m from the eye and the cylinder 0.45 m, so a
# true 12 mm case drew nearly twice a chamber's width. The rounds the hands hold, the kept round in its loop, its band
# and the loop are this much of their true girth (their length stands; the world props and pickups are untouched).
HAND_ROUND_K = R.HAND_ROUND_K


def weight_all(ob, bone):
    vg = ob.vertex_groups.new(name=bone); vg.add(range(len(ob.data.vertices)), 1.0, 'REPLACE')


def band_half(name, sign):
    """Half of the kept round's band (enamel sleeve with the livery hairline), in its own frame: ring axis = X, the
    half bulges toward sign * Z, the centre of the round's axis at the origin. Millimetres -> metres."""
    bm = bmesh.new(); bm.loops.layers.uv.new("UVMap")
    ro, ri = (ammo.HAIR_R + 0.05) * HAND_ROUND_K, (ammo.CASE_R + 0.02) * HAND_ROUND_K
    xs = [(-4.5, "kept_band"), (-0.55, "livery"), (0.55, "kept_band"), (4.5, None)]
    n = 4; cols = {}
    def pt(x, r, k):
        a = math.radians(-88.0 + 176.0 * k / n)
        return bm.verts.new((x, r * math.sin(a), sign * r * math.cos(a)))
    outer = [[pt(x, ro if c != "kept_band" or True else ro, k) for k in range(n + 1)] for x, c in xs]
    inner = [[pt(x, ri, k) for k in range(n + 1)] for x in (xs[0][0], xs[-1][0])]
    for i in range(3):
        for k in range(n):
            f = bm.faces.new((outer[i][k], outer[i][k + 1], outer[i + 1][k + 1], outer[i + 1][k])); cols[f] = xs[i][1]
    for k in range(n):
        f = bm.faces.new((inner[0][k], inner[1][k], inner[1][k + 1], inner[0][k + 1])); cols[f] = "kept_band"
        f = bm.faces.new((outer[0][k], inner[0][k], inner[0][k + 1], outer[0][k + 1])); cols[f] = "kept_band"
        f = bm.faces.new((outer[3][k], outer[3][k + 1], inner[1][k + 1], inner[1][k])); cols[f] = "kept_band"
    for k in (0, n):                                            # the broken faces
        f = bm.faces.new((outer[0][k], outer[3][k], inner[1][k], inner[0][k])); cols[f] = "enamel_stain"
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.faces.index_update(); cf = [cols[f] for f in bm.faces]
    for f in bm.faces: f.smooth = True
    bmesh.ops.scale(bm, vec=(MM, MM, MM), verts=bm.verts[:])
    ob = mesh.new_mesh_object(name, bm)
    mesh.finish(ob, bevel=0.0, smooth_angle=50.0, weighted=False)
    material.assign(ob, "m_prop")
    by = {}
    for i, c in enumerate(cf): by.setdefault(c, []).append(i)
    for c, idx in by.items(): uv.map_to_palette(ob, c, idx); vcol.tint(ob, c, idx)
    return ob


def half_rest_frame():
    """Rest frame of a band half: 0.45 m behind the pinched cartridge's head; its ring axis is the pinch frame's X,
    the direction 'toward the camera when it sits on the cuff' is the pinch frame's +Y (the nose)."""
    return R.round_frames()["pinch"] @ Matrix.Translation((0.0, -HALF_BACK, 0.0))


def loop_strap(frame):
    """The leather loop on the cuff that holds the kept round near its head."""
    bm = bmesh.new(); bm.loops.layers.uv.new("UVMap")
    n = 6; r = ammo.CASE_R * HAND_ROUND_K + 1.3
    rows = []
    for y in (2.5, 10.5):
        row = []
        for k in range(n + 1):
            a = math.radians(-105.0 + 210.0 * k / n)
            row.append(bm.verts.new((r * math.sin(a), y, r * math.cos(a) - (2.5 if k in (0, n) else 0.0))))
        rows.append(row)
    for k in range(n): bm.faces.new((rows[0][k], rows[0][k + 1], rows[1][k + 1], rows[1][k]))
    lo = [[bm.verts.new((v.co.x * 0.86, v.co.y, v.co.z * 0.86 if abs(v.co.x) < r * 0.9 else v.co.z)) for v in row] for row in rows]
    for i in (0, 1):
        for k in range(n):
            q = (rows[i][k], lo[i][k], lo[i][k + 1], rows[i][k + 1])
            bm.faces.new(q if i == 0 else tuple(reversed(q)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in bm.faces: f.smooth = True
    bmesh.ops.scale(bm, vec=(MM, MM, MM), verts=bm.verts[:])
    bm.transform(frame)
    ob = mesh.new_mesh_object("h_loop", bm)
    mesh.finish(ob, bevel=0.0, smooth_angle=50.0, weighted=False)
    material.assign(ob, "m_prop"); uv.map_to_palette(ob, "leather"); vcol.tint(ob, "leather")
    weight_all(ob, "arm_l")
    return ob


def build_gun():
    parts = assize.build()
    assize.unwrap(parts)
    for o in parts:
        o.data.transform(R.GUN_M); o.data.update()
        material.assign(o, "m_gun"); vcol.tint(o, (1.0, 1.0, 1.0))
    return parts


def build_arms():
    rh, RM = R.right_hand(); lh, LM = R.left_hand()
    parts = rh.build(RM) + lh.build(LM)
    fr = R.round_frames()
    SLIM = Matrix.Diagonal((HAND_ROUND_K, HAND_ROUND_K, 1.0, 1.0))
    for name, kind, bone in (("lead", "lead", "round_hand_lead"), ("line", "line", "round_hand_line"), ("kept", "lead", "round_hand_kept")):
        ob = ammo.cartridge("h_round_" + name, kind, n=8, rim=True, nose="ogive2")
        ob.data.transform(fr["pinch"] @ Z2Y @ SLIM); weight_all(ob, bone); parts.append(ob)
    ob = ammo.cartridge("h_round_loop", "kept", n=8, rim=True, nose="ogive2")
    ob.data.transform(fr["loop"] @ Z2Y @ SLIM); weight_all(ob, "kept_loop"); parts.append(ob)
    parts.append(loop_strap(fr["loop"]))
    hf = half_rest_frame()
    for name, sign, bone in (("a", 1.0, "round_hand_lead"), ("b", -1.0, "round_hand_line")):
        ob = band_half("h_band_" + name, sign)
        ob.data.transform(hf); weight_all(ob, bone); parts.append(ob)
    return parts, (rh, RM, lh, LM)


def paint(gun, arms):
    """COLOR_0: AO x height ramp (no dust skirt: the gun is clean). The gun's albedo is tx_gun, the arms' the palette."""
    bpy.context.view_layer.update()
    vcol.bake_ao_vertex(gun + arms, samples=128, distance=0.035)
    for o in gun:
        a = vcol.get_colors(o, "AO")
        part = assize.PARTS[int(o["part"])]
        if part == "web": a[:, :3] = 0.92                         # under the closed gate at rest: it is seen only when the gate is open
        elif part == "case_head": a[:, :3] = np.maximum(a[:, :3], 0.7)
        elif part in ("gate",): a[:, :3] = np.maximum(a[:, :3], 0.45)
        elif part == "cylinder": a[:, :3] = np.maximum(a[:, :3], 0.4)
        else: a[:, :3] = np.maximum(a[:, :3], 0.25)
        if part == "frame":
            # pass i2 (the visual reviewer: "a constant cyan-white stripe on the lower frame"): the ledge of the cylinder
            # window lies 1 to 3 mm under the cylinder and faces straight up; its four corner vertices baked half open
            # (they see out sideways) and the whole face took the sky. It is in the cylinder's shadow: the shader lets a
            # texel this occluded mirror a fifth of the room (materials.ts GUN_OCC_*)
            Mi = R.GUN_M.inverted(); R3 = Mi.to_3x3()
            for poly in o.data.polygons:
                n = R3 @ poly.normal; c = (Mi @ poly.center) * 1000.0
                if n.z > 0.8 and -37.0 < c.z < -33.0 and -46.0 < c.y < 1.0: a[list(poly.loop_indices), :3] = 0.10
        vcol.set_colors(o, a, "AO")
    mn, mx = mesh.bounds(gun)
    for o in gun: vcol.compose_vertex_color(o, mode='tint', ao_strength=0.75, gradient=(0.80, 1.0), jitter=0.0, z_range=(mn.z, mx.z))
    for o in arms:
        # AO is baked in the rest pose, where the fingers are curled on the grip or pinched on a round: clamp it, or the
        # fingers open in a clip as dark brown twigs on a pale glove
        digit = any(o.name.startswith(p) for p in ("h_index", "h_middle", "h_ring", "h_pinky", "h_thumb"))
        own = o.data.materials[0].name == "m_hands"                # release pass p0 (R14): tx_hands is the albedo, COLOR_0 only shades it
        a = vcol.get_colors(o, "AO"); a[:, :3] = np.maximum(a[:, :3], 0.72 if digit else (0.6 if o.name.startswith("h_palm") else (0.55 if own else 0.35)))
        mn_at = o.data.attributes.get("ao_min")
        if mn_at is not None:
            me = o.data
            am = np.empty(len(me.vertices), dtype=np.float32); mn_at.data.foreach_get("value", am)
            li = np.empty(len(me.loops), dtype=np.int32); me.loops.foreach_get("vertex_index", li)
            a[:, :3] = np.maximum(a[:, :3], am[li][:, None])
            me.attributes.remove(mn_at)
        src = o.data.attributes.get("ao_from")
        if src is not None:                                      # a finger's root ring is buried in the palm: give it the AO of the ring above
            me = o.data
            af = np.empty(len(me.vertices), dtype=np.int32); src.data.foreach_get("value", af)
            li = np.empty(len(me.loops), dtype=np.int32); me.loops.foreach_get("vertex_index", li)
            per_v = np.zeros(len(me.vertices), dtype=np.float32); cnt = np.zeros(len(me.vertices), dtype=np.float32)
            np.add.at(per_v, li, a[:, 0]); np.add.at(cnt, li, 1.0); per_v /= np.maximum(cnt, 1.0)
            fix = af[li] >= 0
            a[fix, :3] = per_v[af[li][fix]][:, None]
            me.attributes.remove(src)
        vcol.set_colors(o, a, "AO")
        seam = "Seam" in o.data.color_attributes
        vcol.compose_vertex_color(o, mode='tint' if own else 'ratio', ao_strength=0.8, gradient=(0.92, 1.04) if not own else (0.96, 1.0), jitter=0.0, keep=("Seam",) if seam else ())
        if seam:                                                 # the stitched seam along the back of every finger, darker
            c = vcol.get_colors(o, "Color"); m = vcol.get_colors(o, "Seam")
            c[:, :3] *= m[:, :3]
            o.data.color_attributes.remove(o.data.color_attributes["Seam"]); vcol.set_colors(o, c, "Color")


def build(args):
    gun = build_gun()
    arms, (rh, RM, lh, LM) = build_arms()
    paint(gun, arms)
    arm = rig.make_armature(ASSET + "_rig", R.bone_table(rh, RM, lh, LM))
    by_bone = {}
    for o in gun: by_bone.setdefault(o["bone"], []).append(o)
    order = ["gun", "cylinder", "hammer", "trigger", "gate", "ejector"] + [f"round_{i}" for i in range(1, 7)]
    gun_mesh = rig.join_as_rigid_skin({b: by_bone[b] for b in order}, arm, "gun_mesh")
    for k in ("bone", "part", "role", "chart", "dens", "mirror", "sym", "cyl", "seam", "share"):
        if k in gun_mesh.keys(): del gun_mesh[k]
    arms_mesh = mesh.join(arms, "arms_mesh")
    rig.bind(arms_mesh, arm)
    # sockets
    d = R.gdir((0, 1, 0))
    for name, pos, bone in (("muzzle", R.MUZZLE, "gun"), ("eject", R.EJECT, "gun"), ("cam_look", R.CAM_LOOK, "root")):
        e = export.marker(name, pos)
        if name == "muzzle": e.rotation_euler = d.to_track_quat('Y', 'Z').to_euler()          # the node's game -Z runs along the bore
        e.empty_display_size = 0.02
        rig.parent_to_bone(e, arm, bone)
    return arm, gun_mesh, arms_mesh


def slim_clips(path, code_driven, keep_scale, thin=None):
    """Drop the animation channels that never leave the node's rest value (the exporter writes T/R/S for every bone in
    every clip: 93 channels a clip, and their JSON was most of the file). three.js restores a property that no
    running action animates to its original (rest) value, so nothing changes at run time. Channels of code-driven
    nodes go too (they are never keyed). `keep_scale`: nodes whose scale channel always stays (round_hand_*: keyed
    on every frame of every clip, and they carry each clip's full length). Rewrites the JSON chunk only; the optimiser
    prunes the orphaned accessors."""
    import json, struct
    with open(path, "rb") as f: data = bytearray(f.read())
    jlen = struct.unpack_from("<I", data, 12)[0]
    js = json.loads(bytes(data[20:20 + jlen]).decode("utf-8"))
    binoff = 20 + jlen + 8
    nodes = js["nodes"]; acc = js["accessors"]; bvs = js["bufferViews"]
    def values(ai):
        a = acc[ai]; bv = bvs[a["bufferView"]]
        n = {"SCALAR": 1, "VEC3": 3, "VEC4": 4}[a["type"]]
        off = binoff + bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        return np.frombuffer(bytes(data[off:off + 4 * n * a["count"]]), dtype=np.float32).reshape(a["count"], n)
    dropped = kept = 0
    for an in js.get("animations", []):
        chans = []; used = {}
        for ch in an["channels"]:
            node = nodes[ch["target"]["node"]]; name = node.get("name"); path_ = ch["target"]["path"]
            if name in code_driven: dropped += 1; continue
            if not (path_ == "scale" and name in keep_scale):
                v = values(an["samplers"][ch["sampler"]]["output"])
                rest = np.asarray(node.get(path_, {"translation": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1]}[path_]), dtype=np.float32)
                if path_ == "rotation": same = np.all(np.abs(np.abs(v @ rest) - 1.0) < 1e-6)
                else: same = np.all(np.abs(v - rest[None, :]) < 1e-6)
                if same: dropped += 1; continue
            if ch["sampler"] not in used: used[ch["sampler"]] = len(used)
            chans.append(dict(ch, sampler=used[ch["sampler"]])); kept += 1
        an["samplers"] = [an["samplers"][i] for i, _ in sorted(used.items(), key=lambda kv: kv[1])]
        an["channels"] = chans
    # thin the slow clips to every `step`-th key (new accessors appended to the binary chunk): see revolver_anim, idle
    binlen = struct.unpack_from("<I", data, 20 + jlen)[0]
    extra = bytearray(); base = js["buffers"][0]["byteLength"]
    def add(arr, typ, minmax=False):
        raw = np.ascontiguousarray(arr, dtype=np.float32).tobytes()
        bvs.append({"buffer": 0, "byteOffset": base + len(extra), "byteLength": len(raw)}); extra.extend(raw)
        a = {"bufferView": len(bvs) - 1, "componentType": 5126, "count": int(arr.shape[0]), "type": typ}
        if minmax: a["min"] = [float(arr.min())]; a["max"] = [float(arr.max())]
        acc.append(a); return len(acc) - 1
    for an in js.get("animations", []):
        step = (thin or {}).get(an.get("name"))
        if not step: continue
        for sm in an["samplers"]:
            t = values(sm["input"]); v = values(sm["output"]); n = len(t)
            keep = sorted(set(list(range(0, n, step)) + [n - 1]))
            typ = acc[sm["output"]]["type"]
            sm["input"] = add(t[keep], "SCALAR", True); sm["output"] = add(v[keep], typ)
        print(f"THIN {an['name']}: every {step}th key")
    js["buffers"][0]["byteLength"] = base + len(extra)
    bin_ = bytearray(data[binoff:binoff + binlen][:base]) + extra
    bin_ += b"\0" * ((4 - len(bin_) % 4) % 4)
    out = json.dumps(js, separators=(",", ":")).encode("utf-8")
    out += b" " * ((4 - len(out) % 4) % 4)
    new = bytearray(data[:12]) + struct.pack("<I", len(out)) + b"JSON" + out + struct.pack("<I", len(bin_)) + b"BIN\0" + bin_
    struct.pack_into("<I", new, 8, len(new))
    with open(path, "wb") as f: f.write(new)
    print(f"SLIM {kept} channels kept, {dropped} dropped (rest-valued or code-driven)")


def main():
    args = scene.asset_args(os.path.basename(__file__), extra=lambda p: p.add_argument("--wip", action="store_true", help="geometry only: no clips, no manifest check"))
    scene.reset_scene()
    arm, gun_mesh, arms_mesh = build(args)
    if args.wip:
        export.export_asset(ASSET, args.out, blend=args.blend, check=False)
        return
    import revolver_anim
    revolver_anim.animate(arm)
    export.export_asset(ASSET, args.out, blend=args.blend)
    a = manifest.asset(ASSET)
    slim_clips(args.out, set(a.get("codeDriven") or []), {"round_hand_lead", "round_hand_line", "round_hand_kept"}, thin={"idle": 9})
    if args.preview: export.preview(ASSET, args.out, clips=True)


if __name__ == "__main__":
    scene.run(main)
