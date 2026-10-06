"""Armatures and skinning. Verified on Blender 4.5.14 (docs/research/blender-pipeline.md 6).

Rules (ARCHITECTURE 7.2): names are snake_case and unique across objects, meshes AND bones (letters, digits, `_`).
A multi-part animated asset is ONE rigid-skinned mesh per material (each part weighted 1.0 to one bone): one draw
call. A manifest name listed in both `nodes` and `bones` is the bone. Bone-local +Y runs along the bone (head -> tail):
a hinge bone laid along its hinge turns with a local Y rotation. Each bone becomes a glTF node with its rest pose.
"""
import bpy, math
from mathutils import Vector, Matrix
from .scene import link, deselect_all, select_only, must


def make_armature(name, bones, coll=None):
    """bones: list of (name, head, tail, parent_name | None[, roll]) in Blender space, metres. Bones are never
    connected (each can translate). Without a roll the bone's local Z is aligned to world +Z (to -Y for vertical
    bones). Pose rotation mode is QUATERNION. Returns the armature object (name it `<asset id>_rig`)."""
    arm = bpy.data.armatures.new(name)
    ob = bpy.data.objects.new(name, arm)
    link(ob, coll)
    select_only(ob)
    must(bpy.ops.object.mode_set(mode='EDIT'), "armature edit mode")
    for spec in bones:
        bname, head, tail, parent = spec[:4]
        eb = arm.edit_bones.new(bname)
        eb.head = head; eb.tail = tail
        if (Vector(tail) - Vector(head)).length < 1e-5: raise ValueError(f"bone {bname}: head and tail coincide")
        if len(spec) > 4: eb.roll = spec[4]
        else: eb.align_roll(Vector((0, 0, 1)) if abs((Vector(tail) - Vector(head)).normalized().z) < 0.99 else Vector((0, -1, 0)))
        if parent:
            eb.parent = arm.edit_bones[parent]; eb.use_connect = False
    must(bpy.ops.object.mode_set(mode='OBJECT'), "armature object mode")
    for pb in ob.pose.bones: pb.rotation_mode = 'QUATERNION'
    return ob


def bind(mesh_ob, arm_ob):
    """Parent a mesh to an armature and add the Armature modifier (vertex groups named after bones do the rest)."""
    bpy.context.view_layer.update()
    mesh_ob.parent = arm_ob
    mesh_ob.matrix_parent_inverse = arm_ob.matrix_world.inverted()
    mod = mesh_ob.modifiers.new("Armature", 'ARMATURE'); mod.object = arm_ob


def skin_rigid(mesh_ob, arm_ob, assign):
    """Rigid skinning by rule: assign(vertex) -> bone name; every vertex gets weight 1.0 to exactly one bone."""
    groups = {}
    for v in mesh_ob.data.vertices:
        groups.setdefault(assign(v), []).append(v.index)
    for b in sorted(groups):
        if b not in arm_ob.data.bones: raise KeyError(f"skin_rigid: no bone '{b}' in {arm_ob.name}")
        vg = mesh_ob.vertex_groups.get(b) or mesh_ob.vertex_groups.new(name=b)
        vg.add(groups[b], 1.0, 'REPLACE')
    bind(mesh_ob, arm_ob)


def join_as_rigid_skin(parts, arm_ob, name):
    """parts: {bone name: [objects]}. Joins everything into one mesh named `name`; each source object's vertices are
    weighted 1.0 to its bone. Model each part where it sits in the rest pose. (One mesh per MATERIAL keeps the draw
    calls at the manifest's count: call once per material when an asset has several.)"""
    tagged = []
    for bone in parts:                                             # dict order = insertion order: deterministic
        if bone not in arm_ob.data.bones: raise KeyError(f"join_as_rigid_skin: no bone '{bone}' in {arm_ob.name}")
        for o in parts[bone]:
            vg = o.vertex_groups.new(name=bone)
            vg.add(range(len(o.data.vertices)), 1.0, 'REPLACE')
            tagged.append(o)
    if not tagged: raise RuntimeError("join_as_rigid_skin: no parts")
    from .mesh import harmonise
    harmonise(tagged)
    bpy.context.view_layer.update()
    if len(tagged) > 1:
        deselect_all()
        for o in tagged: o.select_set(True)
        bpy.context.view_layer.objects.active = tagged[0]
        must(bpy.ops.object.join(), "join rigid parts")
    ob = tagged[0]; ob.name = name; ob.data.name = "me_" + name
    bind(ob, arm_ob)
    return ob


def auto_weights(mesh_ob, arm_ob):
    """Bone-heat automatic weights (works headless). Raises if any vertex ended up unweighted. For organic parts;
    prefer rigid skin for anything mechanical."""
    deselect_all()
    mesh_ob.select_set(True); arm_ob.select_set(True); bpy.context.view_layer.objects.active = arm_ob
    must(bpy.ops.object.parent_set(type='ARMATURE_AUTO'), "automatic weights")
    if not all(len(v.groups) > 0 for v in mesh_ob.data.vertices):
        raise RuntimeError(f"bone heat failed on {mesh_ob.name}: unweighted vertices")


def unweighted(mesh_ob):
    """Indices of vertices with no weight (check-glb fails a skinned asset on any)."""
    return [v.index for v in mesh_ob.data.vertices if sum(g.weight for g in v.groups) <= 1e-6]


def parent_to_bone(ob, arm_ob, bone_name):
    """Attach an object (an empty: a muzzle, a hit point, a socket) to a bone WITHOUT skinning, keeping its world
    transform. It exports as a child node of the joint and follows every clip."""
    bpy.context.view_layer.update()
    mw = ob.matrix_world.copy()
    ob.parent = arm_ob; ob.parent_type = 'BONE'; ob.parent_bone = bone_name
    bpy.context.view_layer.update()
    bone = arm_ob.pose.bones[bone_name]
    parent_m = arm_ob.matrix_world @ bone.matrix @ Matrix.Translation((0, bone.length, 0))    # bone-parent space is at the TAIL
    ob.matrix_parent_inverse = parent_m.inverted()
    ob.matrix_world = mw


def bone_head_world(arm_ob, bone_name):
    """World position of a bone's head in the rest pose (what `nodePos` is measured against)."""
    return arm_ob.matrix_world @ arm_ob.data.bones[bone_name].head_local
