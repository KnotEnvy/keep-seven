"""Clips. Verified on Blender 4.5.14 (docs/research/blender-pipeline.md 7).

Contract (ARCHITECTURE 7.2): one NLA track per clip, named exactly as in the manifest; 30 fps; keys on whole frames
from frame 0 to `manifest.clip_frames(asset, clip)`; a loop has identical first and last frames; no root motion;
bones listed in `codeDriven` are never keyed. The game plays every clip at the manifest's seconds whatever its
authored length, so author to the nearest frame and do not worry about the remainder.

    act = anim.new_action(arm, "open")                       # or an object (animated empty)
    anim.key_pose(arm, 0,  {"leaf": {"rot": (0, 0, 0)}})
    anim.key_pose(arm, anim.frames("ia_yard_door", "open"), {"leaf": {"rot": (0, math.radians(95), 0)}})   # a vertical hinge bone: about its Y
    ...                                                      # more actions
    anim.push_to_nla(arm, [act, ...])                        # once, after ALL actions exist
"""
import bpy, math
from mathutils import Quaternion, Euler
from . import manifest


def frames(asset_id, clip):
    """Authored length of a manifest clip in frames (30 fps): key it on frames 0 .. frames()."""
    return manifest.clip_frames(asset_id, clip)


def new_action(ob, name):
    """Create an Action called `name` (the clip name) and make it the active one on `ob` (armature or object).
    The slot is created by the first keyframe_insert. Actions get a fake user so they survive saving."""
    if ob.animation_data is None: ob.animation_data_create()
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    ob.animation_data.action = act
    return act


def reset_pose(arm_ob):
    """Return every pose bone to its rest pose (call before keying the next action and before export)."""
    for pb in arm_ob.pose.bones:
        pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)


def key_pose(arm_ob, frame, pose):
    """Key bones at `frame`. pose: {bone: {'loc': (x, y, z), 'rot': (rx, ry, rz) radians in BONE-LOCAL axes or a
    Quaternion, 'scale': (x, y, z)}}. Location is relative to the rest pose, in bone-local axes.

    WHICH WAY A HINGE TURNS. A bone's local Y runs from its HEAD to its TAIL, so a hinge bone laid along the hinge
    line turns about Y: 'rot': (0, angle, 0). The sign is the right-hand rule about head -> tail (thumb from head to
    tail, the fingers curl the positive way). Measured with `rig.make_armature` bones:
      * hinge along +X (head on the left as you stand in front of the asset, at -Y): a POSITIVE angle LOWERS what lies in
        front of the hinge and RAISES what lies behind it. A lid hinged at its back edge therefore opens upward with a
        NEGATIVE angle, a flap hanging from a hinge at its top swings out toward you with a NEGATIVE angle;
      * hinge along -X (head on the right): the opposite: that lid opens with a positive angle;
      * hinge along +Z (a door post, head at the bottom): a positive angle swings what is in front (-Y) toward +X:
        counter-clockwise seen from above.
    Swung the wrong way? Negate the angle or swap the bone's head and tail; look at
    `node tools/preview-asset.mjs <id> --clip <name>` before anything else. Local X and Z depend on the bone's roll
    (`make_armature`: local Z is aligned to world +Z, to -Y for a vertical bone)."""
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


def key_object(ob, frame, loc=None, rot=None, scale=None):
    """Key an object (an animated empty such as a door `leaf`) at `frame`. rot = Euler XYZ radians; the object's
    rotation mode is set to XYZ. Values are the object's local transform."""
    if loc is not None:
        ob.location = loc; ob.keyframe_insert("location", frame=frame)
    if rot is not None:
        ob.rotation_mode = 'XYZ'; ob.rotation_euler = rot; ob.keyframe_insert("rotation_euler", frame=frame)
    if scale is not None:
        ob.scale = scale; ob.keyframe_insert("scale", frame=frame)


def action_fcurves(act):
    """All F-curves of an action (4.4+ layered actions)."""
    out = []
    for layer in act.layers:
        for strip in layer.strips:
            for cb in strip.channelbags:
                out.extend(cb.fcurves)
    return out


def set_interpolation(act, interp='BEZIER', easing=None):
    """Set the interpolation ('BEZIER', 'LINEAR', 'CONSTANT', 'BACK', 'BOUNCE', ...) and optionally the easing
    ('EASE_IN', 'EASE_OUT', 'EASE_IN_OUT') of every key of an action. Export samples every frame, so anything works."""
    for fc in action_fcurves(act):
        for kp in fc.keyframe_points:
            kp.interpolation = interp
            if easing: kp.easing = easing
        fc.update()


def fix_quaternion_flips(act):
    """Make consecutive quaternion keys take the short way round (keyframe_insert does not). Call on every action
    that keys rotations."""
    by_path = {}
    for fc in action_fcurves(act):
        if fc.data_path.endswith("rotation_quaternion"):
            by_path.setdefault(fc.data_path, [None] * 4)[fc.array_index] = fc
    for path in sorted(by_path):
        fcs = by_path[path]
        if any(f is None for f in fcs): continue
        prev = None
        for i in range(len(fcs[0].keyframe_points)):
            q = Quaternion([fcs[k].keyframe_points[i].co[1] for k in range(4)])
            if prev is not None and prev.dot(q) < 0:
                for k in range(4):
                    kp = fcs[k].keyframe_points[i]
                    kp.co[1] = -kp.co[1]; kp.handle_left[1] = -kp.handle_left[1]; kp.handle_right[1] = -kp.handle_right[1]
                q = -q
            prev = q
        for f in fcs: f.update()


def push_to_nla(ob, actions):
    """One NLA track per action on `ob`, track name = clip name (export_animation_mode='NLA_TRACKS'). Tracks with the
    same name on several objects merge into one clip. Call once per animated object, after all its actions exist."""
    ad = ob.animation_data
    if ad is None: raise RuntimeError(f"push_to_nla: {ob.name} has no animation data")
    ad.action = None
    for act in actions:
        tr = ad.nla_tracks.new(); tr.name = act.name
        st = tr.strips.new(act.name, int(act.frame_range[0]), act)
        st.name = act.name
        if st.action_slot is None and act.slots: st.action_slot = act.slots[0]
        tr.mute = False
    if ob.type == 'ARMATURE': reset_pose(ob)
    return ad.nla_tracks


def tracks(ob):
    """[(clip name, first frame, last frame, action)] of the NLA tracks on `ob`."""
    out = []
    if ob.animation_data:
        for tr in ob.animation_data.nla_tracks:
            for st in tr.strips:
                out.append((tr.name, st.action.frame_range[0], st.action.frame_range[1], st.action))
    return out
