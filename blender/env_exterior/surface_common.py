"""surface_common: the ONE scene behind env_the_lip, env_plenty_street and lm_surface (blender/env_exterior/README.md).

`build()` makes, deterministically, every mesh of BOTH zones in world coordinates, embeds the zone-lit props, sets up
the Long Light (mood L1: sun azimuth 315, elevation 14, calibrated to the art bible's bake targets) and lays every
lightmapped face of both zones into the one 2048 x 2048 atlas of `lm_surface` (`ext_kit.pack_charts`: arithmetic, not
smart_project, so the three scripts that import this module arrive at the same UV1 without talking to each other).

    env_the_lip.py / env_plenty_street.py   build() -> vertex-light their own vertex-lit objects -> chunks -> export
    bake_surface.py                         build() -> bake.bake_lightmap(every lightmapped object) -> save_lightmap

KS_EXT_FAST=1 in the environment: iteration quality (fewer samples); the default is the final quality.
"""
import os, math
import bpy
import numpy as np
from mathutils import Vector
from lib import scene, layout, bake, vcol, zone as zonelib, manifest
import ext_kit as kit

LM = "lm_surface"
FAST = os.environ.get("KS_EXT_FAST") == "1"
SKELETON = os.environ.get("KS_EXT_SKELETON") == "1"
SUN_COLOUR = "#FFD09A"; SKY_COLOUR = "#7A86D8"
KEY, AMBIENT = 1.30, 0.90


class Surface:
    """What build() returns: objs[zone] = every mesh object of the zone; lm = the lightmapped objects of both zones;
    vl[zone] = the objects with vertex-lit faces; extra[zone] = dict of named things the zone script places (drawn nodes,
    the collider, dressing)."""
    def __init__(self):
        self.objs = {"lip": [], "street": []}; self.extra = {"lip": {}, "street": {}}
        self.pack = None; self.light = None

    @property
    def lm(self): return [o for z in ("lip", "street") for o in self.objs[z] if o.get("klm")]

    def vl(self, z): return [o for o in self.objs[z] if not o.get("klm")]


def skeleton_parts():
    """Day-one skeleton: both zones from the layout solids only (floors lightmapped, the rest vertex-lit)."""
    parts = []
    for zid, zk in (("the_lip", "lip"), ("plenty_street", "street")):
        for s in layout.solids(zid):
            if s.get("invisible") or s.get("dynamic"): continue
            mat = layout.surface_material(s["surface"])
            if mat not in ("m_sand", "m_frontier", "m_pellam"): mat = "m_frontier"
            col = kit.lin({"m_sand": "sand", "m_pellam": "enamel"}.get(mat, "rock" if s["surface"] == "stone" else "adobe"))
            p = kit.Part("sk_" + s["id"], zk)
            ground = s["role"] in ("terrain", "floor") and s["surface"] == "sand"
            kit.solid_part(p, s, mat, col, chart="top" if ground else None)
            kit.tessellate(p, 3.0)
            parts.append(p)
    return parts


def setup_light():
    """Mood L1 (ART_BIBLE 3.2): the level's sun, 4 degrees across, and the violet-blue ambient, two bounces,
    calibrated on a white test plane: sun-facing reads #FFD09A x 1.30, open shade facing up #7A86D8 x 0.90."""
    bake.use_cycles('CPU', samples=64)
    s = bpy.context.scene
    s.cycles.max_bounces = 2; s.cycles.diffuse_bounces = 2; s.cycles.glossy_bounces = 0; s.cycles.transmission_bounces = 0
    s.cycles.transparent_max_bounces = 8
    sun = bake.add_sun(layout.sun(), strength=3.0, colour=kit.lin(SUN_COLOUR), angle_deg=4.0)
    bake.set_world(kit.lin(SKY_COLOUR), 1.0)
    sun_e, world_e, reading = bake.calibrate(KEY, AMBIENT, sun=sun, samples=64 if FAST else 256)
    print(f"CALIBRATED sun {sun_e:.3f} world {world_e:.3f} -> key {reading['key']:.3f} ambient {reading['ambient']:.3f}")
    return {"sun": sun_e, "world": world_e, "reading": reading}


FILL_COLOUR = (0.33, 0.48, 1.0)          # the valley's light as it comes in under the roof: the violet-blue ambient, a little greener
FILL_WATTS = float(os.environ.get("KS_EXT_FILL", "340"))
BOUNCE_WATTS = float(os.environ.get("KS_EXT_BOUNCE", "120"))
PATCH_WATTS = float(os.environ.get("KS_EXT_PATCH", "40000"))
SHAFT_WATTS = float(os.environ.get("KS_EXT_SHAFTS", "17000"))   # pass i3: the gully's three sun shafts (0 switches them off)
SHAFT_RISE = 3.7


def area_fill(name, pos, at, size, colour, watts, spread_deg=180.0):
    """A fill light (GAME space: at `pos`, looking at `at`; size = (across, up) metres). A light, not a mesh: it
    occludes nothing, is not exported, and is seen by all three scripts (vertex light and lightmap agree)."""
    ld = bpy.data.lights.new(name, 'AREA'); ld.shape = 'RECTANGLE'; ld.size = size[0]; ld.size_y = size[1]
    ld.energy = watts; ld.color = colour; ld.spread = math.radians(spread_deg)
    ob = bpy.data.objects.new(name, ld); bpy.context.scene.collection.objects.link(ob)
    a = Vector(layout.to_blender(pos)); b = Vector(layout.to_blender(at))
    ob.location = a; ob.rotation_euler = (b - a).to_track_quat('-Z', 'Y').to_euler()
    ob.visible_camera = False              # (the strength was probed WITH this flag: the bake's first hit counts as a camera ray)
    ob.visible_glossy = False              # no sheen in the Cycles previews: the game's surfaces are unlit, the bake is diffuse only
    return ob


def notch_gobo(ld, rc, narrow, seed=1.0, ragged=0.7):
    """The shape of a notch in a rock rim, as a spot light's own shader (no blocker mesh: a card in the air would shade
    the sky's light under it). In the light's frame (it looks down -Z, +Y is up): u = x / -z, v = y / -z; the light is
    1 inside an ellipse of half height rc and half width rc x narrow whose edge is pushed in and out by a noise
    (`ragged`), 0 outside, with a short soft edge. On the floor the low angle draws it out into a long broken streak."""
    ld.use_nodes = True
    nt = ld.node_tree; N = nt.nodes; Lk = nt.links
    em = next(n for n in N if n.type == 'EMISSION')
    tc = N.new('ShaderNodeTexCoord'); sep = N.new('ShaderNodeSeparateXYZ'); Lk.new(tc.outputs['Normal'], sep.inputs[0])

    def math_(op, a, b=None):
        n = N.new('ShaderNodeMath'); n.operation = op
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[i].default_value = float(v)
            else: Lk.new(v, n.inputs[i])
        return n.outputs[0]
    nz = math_('MULTIPLY', sep.outputs['Z'], -1.0)
    u = math_('DIVIDE', sep.outputs['X'], nz); v = math_('DIVIDE', sep.outputs['Y'], nz)
    comb = N.new('ShaderNodeCombineXYZ'); Lk.new(u, comb.inputs[0]); Lk.new(v, comb.inputs[1]); comb.inputs[2].default_value = seed
    noise = N.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 1.9 / rc; noise.inputs['Detail'].default_value = 2.0
    Lk.new(comb.outputs[0], noise.inputs['Vector'])
    un = math_('DIVIDE', u, rc * narrow); vn = math_('DIVIDE', v, rc)
    r = math_('SQRT', math_('ADD', math_('MULTIPLY', un, un), math_('MULTIPLY', vn, vn)))
    f = math_('ADD', math_('SUBTRACT', 1.0, r), math_('MULTIPLY', math_('SUBTRACT', noise.outputs['Fac'], 0.5), ragged * 2.0))
    mr = N.new('ShaderNodeMapRange'); mr.interpolation_type = 'SMOOTHSTEP'
    Lk.new(f, mr.inputs['Value']); mr.inputs['From Min'].default_value = 0.0; mr.inputs['From Max'].default_value = 0.14
    Lk.new(mr.outputs['Result'], em.inputs['Strength'])


def add_fills():
    """The overhang (ART_BIBLE 3.1: "no direct sun; baked bounce only. Rock reads #2A1A1E-#48272D"). Two bounces of a
    sun that never reaches the first reach's floor leave the room at 2 % of open shade: black, not dark. The glare of
    the valley that the eye sees through the mouth is what lights this room, and the bake's sky cannot carry it (the
    first reach's walls stand in the way), so it is given as one soft area light the size of the mouth, in the mouth,
    looking in and a little down: brightest on the back wall and the floor's middle, least on the roof (grazing). Its
    lower edge stands a metre over the floor, so its light comes on gradually behind the lip (an emitter that touches
    the floor draws a hard line across it)."""
    if SKELETON: return []
    out = [area_fill("fill_overhang", (14.0, 15.9, 101.0), (14.0, 14.4, 109.0), (11.0, 1.4), FILL_COLOUR, FILL_WATTS, spread_deg=125.0)]
    # polish round 3 (R7, "the first image"): two thirds of the opening frame was one grey-mauve (64 % under L* 35, 2 %
    # over 70: shots/r3-visual/tour/low_01_start.png). Two more lights, both standing for the Long Light outside:
    # - the BOUNCE: the lit sand of the first reach throws warm light in low under the lip: a warm area light lying in
    #   the mouth's lower half, looking in and down: the floor's first metres and the roof's lip go warm, fading inward;
    # - the SUN PATCH: one shaft of the low sun through the notch at the mouth's upper left, raking across the
    #   foreground sand between the start and the mouth (a long ellipse with a firm edge): the frame's light third indoors.
    #   (The bounce stands 4 m OUTSIDE the mouth, its lower edge clear of the sand: in the mouth it drew a line across the floor.)
    if BOUNCE_WATTS > 0:
        out.append(area_fill("bounce_overhang", (14.6, 14.95, 97.0), (15.0, 14.2, 105.0), (7.0, 0.9), (1.0, 0.56, 0.30), BOUNCE_WATTS, spread_deg=180.0))
    if PATCH_WATTS > 0:
        ld = bpy.data.lights.new("sun_patch", 'SPOT'); ld.energy = PATCH_WATTS; ld.color = kit.lin(SUN_COLOUR)
        ld.spot_size = math.radians(8.0); ld.spot_blend = 0.14; ld.shadow_soft_size = 0.12
        ob = bpy.data.objects.new("sun_patch", ld); bpy.context.scene.collection.objects.link(ob)
        a = Vector(layout.to_blender((9.8, 16.6, 96.0))); b = Vector(layout.to_blender((14.5, 14.0, 102.8)))
        ob.location = a; ob.rotation_euler = (b - a).to_track_quat('-Z', 'Y').to_euler()
        ob.visible_camera = False; ob.visible_glossy = False
        out.append(ob)
        # the notch is not a round hole: a second, narrower shaft beside the first makes the patch a broken shape
        ld2 = bpy.data.lights.new("sun_patch_b", 'SPOT'); ld2.energy = PATCH_WATTS * 0.9; ld2.color = kit.lin(SUN_COLOUR)
        ld2.spot_size = math.radians(3.6); ld2.spot_blend = 0.2; ld2.shadow_soft_size = 0.1
        ob2 = bpy.data.objects.new("sun_patch_b", ld2); bpy.context.scene.collection.objects.link(ob2)
        b2 = Vector(layout.to_blender((16.3, 14.0, 103.9)))
        ob2.location = a; ob2.rotation_euler = (b2 - a).to_track_quat('-Z', 'Y').to_euler()
        ob2.visible_camera = False; ob2.visible_glossy = False
        out.append(ob2)
    # pass i3 (both visual reviewers: the walk down the gully is "a wall left, a wall right and empty floor"; "a second sun
    # shaft across the path"): the walls stand 12 to 16 m over a floor the 14 degree sun never reaches, so every reach was
    # one even shade. Three more shafts of the same low sun through notches of the west rim, one a reach, each raking
    # across the path toward the south-east (lip_dress.SHAFTS: where it lands, where it comes from): the mule's bones,
    # the open floor of the second reach, the uncovered main. A spot each, standing in the air of the gully 5 m up
    # (bake only; the rocks, the bones and the pipe throw their own long shadows inside the patch).
    if SHAFT_WATTS > 0:
        import lip_dress, lip_fields
        for k, ((tx, tz), (fx, fz)) in enumerate(lip_dress.SHAFTS):
            ty = lip_fields.ground(tx, tz)
            ld = bpy.data.lights.new("sun_shaft%d" % k, 'SPOT'); ld.energy = SHAFT_WATTS * (1.0, 1.0, 0.62)[k]      # (the third lies on pale enamel: at 0.9 the main drew white); ld.color = kit.mix(kit.lin(SUN_COLOUR), (1.0, 1.0, 1.0), 0.22)
            rc = math.tan(math.radians((8.6, 8.0, 7.4)[k]))                    # the notch's half height as the shaft sees it
            ld.spot_size = 2.0 * math.atan(rc * 1.7); ld.spot_blend = 0.1; ld.shadow_soft_size = 0.03
            notch_gobo(ld, rc, 0.58, seed=3.1 + 7.7 * k)
            ob = bpy.data.objects.new("sun_shaft%d" % k, ld); bpy.context.scene.collection.objects.link(ob)
            a = Vector(layout.to_blender((fx, ty + SHAFT_RISE, fz))); b = Vector(layout.to_blender((tx, ty, tz)))
            ob.location = a; ob.rotation_euler = (b - a).to_track_quat('-Z', 'Y').to_euler()
            ob.visible_camera = False; ob.visible_glossy = False
            out.append(ob)
    return out


def heal_buried(objs, before, ref):
    """After the vertex-light bake: a face whose every corner touches or sits inside a neighbouring part baked BLACK
    although it stands in the open (lib.vcol.buried_faces: the sign board between its frame timbers, a beam's end
    caps, a strut between a post and a rail). Give each such corner the light of the nearest corner of the same
    object that was sampled in the open (x 0.8: it is a contact), or the object's median light when none is near.
    `before` = {name: tint before the bake}. A part flagged o["kfit"] (a small fitting on a big surface: numeral,
    plate, cup) takes ONE light for all its corners: that of its best-lit quarter."""
    from mathutils import kdtree
    healed = 0
    for o in objs:
        b = before.get(o.name)
        if b is None or not len(o.data.polygons): continue
        a = vcol.get_colors(o, "Color")
        tint = b[:, :3]; ok = tint.max(axis=1) > 0.02
        if not ok.any(): continue
        light = np.zeros_like(tint); light[ok] = a[ok, :3] / np.maximum(tint[ok], 1e-3)          # = light / 2
        lum = light.max(axis=1)
        if o.get("kfit"):
            sel = ok & (lum >= np.percentile(lum[ok], 75))
            L = light[sel].mean(axis=0)
            a[:, :3] = np.clip(tint * L, 0.0, 1.0); vcol.set_colors(o, a, "Color"); healed += len(o.data.polygons)
            continue
        idx, area, _ = vcol.buried_faces(o, lum * 2.0, ref, None, dark=0.05)
        if not idx: continue
        me = o.data
        pos = vcol.corner_positions(o)
        dark_loop = np.zeros(len(me.loops), bool)
        for i in idx:
            p = me.polygons[i]; dark_loop[p.loop_start:p.loop_start + p.loop_total] = True
        good = np.nonzero(ok & ~dark_loop & (lum * 2.0 > 0.12 * ref))[0]
        if len(good):
            if len(good) > 4000: good = good[:: len(good) // 4000 + 1]
            kd = kdtree.KDTree(len(good))
            for k, gi in enumerate(good): kd.insert(pos[gi], k)
            kd.balance()
            med = np.median(light[good], axis=0)
        for li in np.nonzero(dark_loop & ok)[0]:
            if len(good):
                co, k, d = kd.find(pos[li])
                L = light[good[k]] * 0.8 if d < 2.5 else med * 0.6
            else: L = np.array([0.03, 0.035, 0.07], np.float32)
            a[li, :3] = np.clip(tint[li] * np.maximum(L, light[li]), 0.0, 1.0)
        vcol.set_colors(o, a, "Color"); healed += len(idx)
    return healed


def heal_black(objs, before, ref):
    """Integration pass (polish round 2): a vertex-lit face whose EVERY corner baked pitch black (under 1.5 % of the
    reference light) and which heal_buried left alone because it does not 'stand in the open' by its ray test: the rim of
    the overhang's roof slab where it meets the wall tops showed as a black line round the first room's ceiling. Such a
    face takes 0.6 x the light of the nearest lit vertex-lit corner of the same object (within 2.5 m), else 0.4 x the
    object's median: still the darkest thing near it, never a hole. Faces nobody sees lose nothing by it."""
    from mathutils import kdtree
    healed = 0
    for o in objs:
        b = before.get(o.name)
        me = o.data
        if b is None or not len(me.polygons): continue
        lit_faces = np.nonzero(vcol.vertex_lit_faces(o))[0]
        if not len(lit_faces): continue
        a = vcol.get_colors(o, "Color")
        tint = b[:, :3]; ok = tint.max(axis=1) > 0.02
        light = np.zeros_like(tint); light[ok] = a[ok, :3] / np.maximum(tint[ok], 1e-3)
        lum = light.max(axis=1) * 2.0
        vl_loop = np.zeros(len(me.loops), bool); black_loop = np.zeros(len(me.loops), bool)
        n = 0
        for i in lit_faces:
            pl = me.polygons[int(i)]; sl = slice(pl.loop_start, pl.loop_start + pl.loop_total)
            vl_loop[sl] = True
            if ok[sl].all() and lum[sl].max() < 0.015 * ref: black_loop[sl] = True; n += 1
        if not n: continue
        good = np.nonzero(vl_loop & ok & ~black_loop & (lum > 0.08 * ref))[0]
        if not len(good): continue
        if len(good) > 6000: good = good[:: len(good) // 6000 + 1]
        pos = vcol.corner_positions(o)
        kd = kdtree.KDTree(len(good))
        for k, gi in enumerate(good): kd.insert(pos[gi], k)
        kd.balance()
        med = np.median(light[good], axis=0)
        for li in np.nonzero(black_loop)[0]:
            co, k, d = kd.find(pos[li])
            L = light[good[k]] * 0.6 if d < 2.5 else med * 0.4
            a[li, :3] = np.clip(tint[li] * L, 0.0, 1.0)
        vcol.set_colors(o, a, "Color"); healed += n
    return healed


def add_casters():
    """Integration (polish round 2): the Tally House is another owner's zone and was not in this bake, so the low sun shone
    THROUGH it: a blade of sunlight lay on the yard floor in front of door_tally and door_alley. A plain box of its volume
    (layout zone bounds, walls to the roof deck at 5 m) stands in the bake scene as a shadow caster; it is never exported
    (finish_zone removes every object that is not the zone's own)."""
    tb = layout.to_blender
    w = layout.solid("ty_wall_w"); e = layout.solid("ty_wall_e"); so = layout.solid("ty_wall_s_0")
    x0 = w["pos"][0] - w["size"][0] / 2 + 0.05; x1 = e["pos"][0] + e["size"][0] / 2 - 0.05
    z1 = so["pos"][2] - so["size"][2] / 2 - 0.05                       # just inside the south wall the yard draws
    z0 = z1 - 21.9; y0 = 0.05; y1 = so["pos"][1] + so["size"][1] / 2
    corners = [tb((x, y, z)) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    me = bpy.data.meshes.new("me_caster_tally_house"); me.from_pydata(corners, [], faces); me.update()
    ob = bpy.data.objects.new("caster_tally_house", me); bpy.context.scene.collection.objects.link(ob)
    return [ob]


def build():
    scene.reset_scene()
    kit.reset_charts()
    S = Surface()
    if SKELETON: parts = skeleton_parts()
    else:
        import lip_parts, street_parts
        parts = lip_parts.build(S) + street_parts.build(S)
    with scene.Timer("realize"):
        for p in parts: S.objs[p.zone].extend(kit.realize(p))
    # integration: the dark underlays under the ground (street_parts / lip_parts build_ground) take no part in any bake.
    # Under the sand they would shut out the sky light that reaches the buried feet of posts and frames from below, and
    # every timber standing in sand would grade to black over its lower half (seen at the wash-house door).
    for z in S.objs:
        for o in S.objs[z]:
            if "_underlay_" in o.name: o.hide_render = True; o["kunder"] = 1
    if not SKELETON:
        import lip_parts, street_parts
        lip_parts.embed(S); street_parts.embed(S)
    S.light = setup_light()
    S.fills = add_fills()
    add_casters()
    everything = sorted(S.objs["lip"] + S.objs["street"], key=lambda o: o.name)
    S.pack = kit.pack_charts(everything, LM, target=16.0)
    print(f"ATLAS {LM}: {S.pack[0]:.2f} texels/m, {100 * S.pack[1]:.1f} % of the atlas in chart boxes, {len(S.pack[2])} charts")
    tris = {z: sum(len(p.vertices) - 2 for o in S.objs[z] for p in o.data.polygons) for z in S.objs}
    print(f"BUILT lip {tris['lip']} tris in {len(S.objs['lip'])} objects, street {tris['street']} tris in {len(S.objs['street'])} objects")
    return S


def finish_zone(S, zk, asset, args, vl_samples=None):
    """The common tail of the two zone scripts: vertex light, drop the other zone, chunks, export."""
    from lib import export
    mine = S.objs[zk]
    vl = [o for o in S.vl(zk) if not o.get("kunder")]
    extra_vl = [o for o in S.extra[zk].get("vl_nodes", [])]
    if vl or extra_vl:
        before = {o.name: vcol.get_colors(o, "Color").copy() for o in vl + extra_vl if "Color" in o.data.color_attributes}
        t = vcol.bake_vertex_light(vl + extra_vl, samples=vl_samples or (64 if FAST else 512))
        ref = 0.0
        for o in vl + extra_vl:
            b = before.get(o.name)
            if b is None: continue
            m = b[:, :3].max(axis=1) > 0.02
            if m.any(): ref = max(ref, float(np.percentile((vcol.get_colors(o, "Color")[m, :3] / np.maximum(b[m, :3], 1e-3)).max(axis=1) * 2.0, 95)))
        n = heal_buried(vl + extra_vl, before, ref)
        nb = heal_black(vl + extra_vl, before, ref)
        print(f"VERTEX LIGHT {zk}: HEALED {nb} pitch-black faces (integration pass)")
        kit.merge_corner_colours(vl + extra_vl)
        print(f"VERTEX LIGHT {zk}: {sum(len(o.data.polygons) for o in vl + extra_vl)} faces {t:.1f}s; HEALED {n} buried faces (reference light {ref:.2f})")
    for o in mine:
        if o.get("kunder"):                                   # near-black by decree, not by a bake
            vcol.fill_color(o, (0.012, 0.012, 0.016)); vcol.mark_vertex_lit(o); o.hide_render = False
    keep = set(o.name for o in mine) | set(o.name for o in S.extra[zk].get("keep", []))
    for o in list(bpy.context.scene.objects):
        if o.type == 'MESH' and o.name not in keep: bpy.data.objects.remove(o, do_unlink=True)
    zonelib.assign_chunks(mine, asset)
    merged = zonelib.merge_chunks(asset)
    for name in sorted(merged): print(f"CHUNK {name}: {sum(len(p.vertices) - 2 for p in merged[name].data.polygons)} triangles")
    post = S.extra[zk].get("post")
    if post: post(S)
    export.export_asset(asset, args.out, blend=args.blend)
