"""Rigging + animation helpers (prototype for blender/lib/rig.py and anim.py). Verified on Blender 4.5.14."""
import bpy, bmesh, math
from mathutils import Vector, Quaternion, Euler, Matrix
from common import *

def make_armature(name, bones, coll=None):
    """bones: list of (name, head, tail, parent_name|None[, roll]). Blender space, metres. Returns armature object.
    Bones are NOT connected (use_connect=False) so each can translate; roll is aligned so local Z ~ world Z unless given."""
    arm = bpy.data.armatures.new(name)
    ob = bpy.data.objects.new(name, arm)
    link(ob, coll)
    select_only(ob)
    bpy.ops.object.mode_set(mode='EDIT')
    for spec in bones:
        bname, head, tail, parent = spec[:4]
        eb = arm.edit_bones.new(bname)
        eb.head = head; eb.tail = tail
        if len(spec) > 4: eb.roll = spec[4]
        else: eb.align_roll(Vector((0, 0, 1)) if abs((Vector(tail) - Vector(head)).normalized().z) < 0.99 else Vector((0, -1, 0)))
        if parent:
            eb.parent = arm.edit_bones[parent]; eb.use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in ob.pose.bones: pb.rotation_mode = 'QUATERNION'
    return ob

def skin_rigid(mesh_ob, arm_ob, assign):
    """assign: callable(vertex) -> bone name. Every vertex gets weight 1.0 to exactly one bone (rigid skinning, 1 draw call)."""
    groups = {}
    for v in mesh_ob.data.vertices:
        b = assign(v)
        groups.setdefault(b, []).append(v.index)
    for b, idx in groups.items():
        vg = mesh_ob.vertex_groups.get(b) or mesh_ob.vertex_groups.new(name=b)
        vg.add(idx, 1.0, 'REPLACE')
    bind(mesh_ob, arm_ob)

def bind(mesh_ob, arm_ob):
    mesh_ob.parent = arm_ob
    mesh_ob.matrix_parent_inverse = arm_ob.matrix_world.inverted()
    mod = mesh_ob.modifiers.new("Armature", 'ARMATURE'); mod.object = arm_ob

def join_as_rigid_skin(parts, arm_ob, name):
    """parts: {bone_name: [objects]}. Joins all objects into one mesh; each source object's vertices are weighted 1.0 to its bone."""
    tagged = []
    for bone, obs in parts.items():
        for o in obs:
            vg = o.vertex_groups.new(name=bone)
            vg.add(range(len(o.data.vertices)), 1.0, 'REPLACE')
            tagged.append(o)
    deselect_all()
    for o in tagged: o.select_set(True)
    bpy.context.view_layer.objects.active = tagged[0]
    bpy.ops.object.join()
    ob = tagged[0]; ob.name = name; ob.data.name = name
    bind(ob, arm_ob)
    return ob

def auto_weights(mesh_ob, arm_ob):
    """Bone-heat automatic weights (works headless). Raises if any vertex ended up unweighted."""
    deselect_all()
    mesh_ob.select_set(True); arm_ob.select_set(True); bpy.context.view_layer.objects.active = arm_ob
    r = bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    if r != {'FINISHED'}: raise RuntimeError(f"auto weights -> {r}")
    if not all(len(v.groups) > 0 for v in mesh_ob.data.vertices):
        raise RuntimeError("bone heat failed: unweighted vertices")

def parent_to_bone(ob, arm_ob, bone_name):
    """Rigid attach WITHOUT skinning: exported as a child node of the joint. Keeps the object's world transform."""
    mw = ob.matrix_world.copy()
    ob.parent = arm_ob; ob.parent_type = 'BONE'; ob.parent_bone = bone_name
    bpy.context.view_layer.update()
    # bone-parent space is at the bone TAIL: compute the inverse so the object stays where it was
    bone = arm_ob.pose.bones[bone_name]
    parent_m = arm_ob.matrix_world @ bone.matrix @ Matrix.Translation((0, bone.length, 0))
    ob.matrix_parent_inverse = parent_m.inverted()
    ob.matrix_world = mw

# ---------------- animation ----------------
def new_action(arm_ob, name):
    """Create an Action, make it the active one on arm_ob (slot is auto-created by the first keyframe_insert)."""
    if arm_ob.animation_data is None: arm_ob.animation_data_create()
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm_ob.animation_data.action = act
    return act

def reset_pose(arm_ob):
    for pb in arm_ob.pose.bones:
        pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)

def key_pose(arm_ob, frame, pose, interpolation=None):
    """pose: {bone: {'loc': (x,y,z), 'rot': (rx,ry,rz) euler radians in bone-local axes | Quaternion, 'scale': (..)}}"""
    for bname, ch in pose.items():
        pb = arm_ob.pose.bones[bname]
        if 'loc' in ch:
            pb.location = ch['loc']; pb.keyframe_insert("location", frame=frame)
        if 'rot' in ch:
            r = ch['rot']
            q = r if isinstance(r, Quaternion) else Euler(r, 'XYZ').to_quaternion()
            pb.rotation_quaternion = q; pb.keyframe_insert("rotation_quaternion", frame=frame)
        if 'scale' in ch:
            pb.scale = ch['scale']; pb.keyframe_insert("scale", frame=frame)

def action_fcurves(act):
    """All F-curves of an action, for both the 4.4+ layered API and the legacy proxy."""
    out = []
    for layer in act.layers:
        for strip in layer.strips:
            for cb in strip.channelbags:
                out.extend(cb.fcurves)
    return out

def set_interpolation(act, interp='BEZIER', easing=None):
    for fc in action_fcurves(act):
        for kp in fc.keyframe_points:
            kp.interpolation = interp
            if easing: kp.easing = easing
        fc.update()

def fix_quaternion_flips(act):
    """Make consecutive quaternion keys take the short path (keyframe_insert does not do this for you)."""
    by_path = {}
    for fc in action_fcurves(act):
        if fc.data_path.endswith("rotation_quaternion"):
            by_path.setdefault(fc.data_path, [None] * 4)[fc.array_index] = fc
    for path, fcs in by_path.items():
        if any(f is None for f in fcs): continue
        n = len(fcs[0].keyframe_points)
        prev = None
        for i in range(n):
            q = Quaternion([fcs[k].keyframe_points[i].co[1] for k in range(4)])
            if prev is not None and prev.dot(q) < 0:
                for k in range(4):
                    kp = fcs[k].keyframe_points[i]
                    kp.co[1] = -kp.co[1]; kp.handle_left[1] = -kp.handle_left[1]; kp.handle_right[1] = -kp.handle_right[1]
                q = -q
            prev = q
        for f in fcs: f.update()

def push_to_nla(arm_ob, actions):
    """One NLA track per action, track name = clip name. Required for export_animation_mode='NLA_TRACKS'."""
    ad = arm_ob.animation_data
    ad.action = None
    for act in actions:
        tr = ad.nla_tracks.new(); tr.name = act.name
        start = int(act.frame_range[0])
        st = tr.strips.new(act.name, start, act)
        st.name = act.name
        if st.action_slot is None and act.slots: st.action_slot = act.slots[0]
        tr.mute = False
    return ad.nla_tracks
