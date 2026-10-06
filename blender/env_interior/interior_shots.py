"""Eye-level evidence frames of an interior zone as the game will draw its BAKED light, with the light layers that the
viewer's fallback material cannot show yet (work order art-env-interior section 5: "put the layer previews in Cycles
renders").

    tools/blender.sh -b --factory-startup --python-exit-code 1 -P blender/env_interior/interior_shots.py -- \
        <asset id> <out dir> --shots "name=px,py,pz>tx,ty,tz;name2=..." [--layer 0..1] [--layer-tint aqua|violet|#hex]
        [--on strip_hatch,mark_glows] [--fade 0..1] [--fov 62] [--fog #hex,density] [--stops 0] [--size 960x540]

Every surface EMITS what the runtime draws from the raw export (blender/export): COLOR_0 x shared texture x 2 x
(lightmap x 2 + tint x weight x layer x 2) on lightmapped faces (the neutral texel makes vertex-lit faces COLOR_0 x 2),
m_mask cut by tx_mask, lamp sets in their emissive colour (a lamp whose COLOR_0.G is 1 is "off until triggered": dark
unless its mesh is named in --on). --fade 1 = `wrong_fade` complete (lamp sets with COLOR_0.B = 1 turn aqua).
--fog mixes toward the mood's fog colour by 1 - exp(-density x distance): a PREVIEW of what code-render adds; frames
without it are the file's own light. Points are GAME coordinates. Not an asset script: nothing here is exported.
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
import argparse, math
import bpy
import numpy as np
from mathutils import Vector
from lib import scene as sc, manifest, layout, vcol

TINTS = {"aqua": "#7CF2E2", "violet": "#B24BFF"}


def lin(h):
    return manifest.hex_to_linear(TINTS.get(h, h))


def image(tid, colorspace):
    p = manifest.raw_texture_path(tid)
    if not os.path.isfile(p): return None
    img = bpy.data.images.load(p, check_existing=True); img.colorspace_settings.name = colorspace
    return img


def build_material(mat, kind, lm, layer, a, lamp_on):
    m = bpy.data.materials.new(f"shot_{mat}_{kind}_{lm}_{layer}_{lamp_on}"); m.use_nodes = True; m.use_backface_culling = True
    nt = m.node_tree; N = nt.nodes; L = nt.links
    for n in list(N): N.remove(n)
    out = N.new("ShaderNodeOutputMaterial")
    vc = N.new("ShaderNodeVertexColor"); vc.layer_name = "Color"
    def mul(x, y):
        n = N.new("ShaderNodeMix"); n.data_type = 'RGBA'; n.blend_type = 'MULTIPLY'; n.inputs["Factor"].default_value = 1.0
        for k, v in (("A", x), ("B", y)):
            if isinstance(v, tuple): n.inputs[k].default_value = (*v, 1.0)
            else: L.new(v, n.inputs[k])
        return n.outputs["Result"]
    def add(x, y):
        n = N.new("ShaderNodeMix"); n.data_type = 'RGBA'; n.blend_type = 'ADD'; n.inputs["Factor"].default_value = 1.0
        L.new(x, n.inputs["A"]); L.new(y, n.inputs["B"]); return n.outputs["Result"]
    def tex(img, uvname, interp='Linear', ext='REPEAT'):
        u = N.new("ShaderNodeUVMap"); u.uv_map = uvname
        t = N.new("ShaderNodeTexImage"); t.image = img; t.interpolation = interp; t.extension = ext
        L.new(u.outputs["UV"], t.inputs["Vector"]); return t
    em = N.new("ShaderNodeEmission")
    alpha = None
    if mat == "m_emis":
        img = image("tx_palette_emis", 'sRGB')
        sep = N.new("ShaderNodeSeparateColor"); L.new(vc.outputs["Color"], sep.inputs[0])
        col = tex(img, "UVMap", 'Closest').outputs["Color"] if img else (0.2, 0.9, 0.8)
        if a.fade > 0:                                                  # wrong_fade: B = 1 lamps turn aqua
            mixn = N.new("ShaderNodeMix"); mixn.data_type = 'RGBA'; mixn.blend_type = 'MIX'
            fac = N.new("ShaderNodeMath"); fac.operation = 'MULTIPLY'; fac.inputs[1].default_value = a.fade; L.new(sep.outputs[2], fac.inputs[0])
            L.new(fac.outputs[0], mixn.inputs["Factor"]); L.new(col, mixn.inputs["A"]); mixn.inputs["B"].default_value = (*lin("aqua"), 1.0)
            col = mixn.outputs["Result"]
        L.new(col, em.inputs["Color"]) if not isinstance(col, tuple) else None
        # intensity R; G = 1 means off until triggered
        off = N.new("ShaderNodeMath"); off.operation = 'LESS_THAN'; off.inputs[1].default_value = 0.9; L.new(sep.outputs[1], off.inputs[0])
        st = N.new("ShaderNodeMath"); st.operation = 'MULTIPLY'; L.new(sep.outputs[0], st.inputs[0])
        if lamp_on: st.inputs[1].default_value = 1.6
        else: L.new(off.outputs[0], st.inputs[1])
        k = N.new("ShaderNodeMath"); k.operation = 'MULTIPLY'; k.inputs[1].default_value = 1.6 * (2.0 ** a.stops); L.new(st.outputs[0], k.inputs[0])
        L.new(k.outputs[0], em.inputs["Strength"])
    else:
        col = vc.outputs["Color"]
        if mat in ("m_frontier", "m_pellam", "m_sand"):
            img = image(manifest.SHEET_OF[mat], 'Non-Color')
            if img is not None: col = mul(mul(col, tex(img, "UVMap").outputs["Color"]), (2.0, 2.0, 2.0))
        elif mat == "m_mask":
            img = image("tx_mask", 'Non-Color')
            if img is not None:
                gt = N.new("ShaderNodeMath"); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = 0.5
                L.new(tex(img, "UVMap").outputs["Color"], gt.inputs[0]); alpha = gt.outputs[0]
        light = None
        if kind == "LM" and lm:
            li = image(lm, 'sRGB')
            if li is not None: light = tex(li, "UVLight", ext='EXTEND').outputs["Color"]
            if layer and a.layer > 0:
                la = image(layer, 'Non-Color')
                if la is not None:
                    t = tuple(c * a.layer for c in lin(a.layer_tint))
                    lay = mul(tex(la, "UVLight", ext='EXTEND').outputs["Color"], t)
                    light = add(light, lay) if light is not None else lay
        if light is not None: col = mul(col, light)
        L.new(col, em.inputs["Color"])
        em.inputs["Strength"].default_value = (2.0 if kind in ("LM", "VL") else 1.0) * (2.0 ** a.stops)
    shader = em.outputs[0]
    if a.fog:
        fc, dens = a.fog
        cam = N.new("ShaderNodeCameraData")
        e = N.new("ShaderNodeMath"); e.operation = 'MULTIPLY'; e.inputs[1].default_value = -dens; L.new(cam.outputs["View Distance"], e.inputs[0])
        ex = N.new("ShaderNodeMath"); ex.operation = 'EXPONENT'; L.new(e.outputs[0], ex.inputs[0])
        fe = N.new("ShaderNodeEmission"); fe.inputs["Color"].default_value = (*fc, 1.0); fe.inputs["Strength"].default_value = 2.0 ** a.stops
        mx = N.new("ShaderNodeMixShader"); L.new(ex.outputs[0], mx.inputs[0]); L.new(fe.outputs[0], mx.inputs[1]); L.new(shader, mx.inputs[2]); shader = mx.outputs[0]
    geo = N.new("ShaderNodeNewGeometry"); tr = N.new("ShaderNodeBsdfTransparent")
    if alpha is not None:
        mx = N.new("ShaderNodeMixShader"); L.new(alpha, mx.inputs[0]); L.new(tr.outputs[0], mx.inputs[1]); L.new(shader, mx.inputs[2]); shader = mx.outputs[0]
    mx = N.new("ShaderNodeMixShader"); L.new(geo.outputs["Backfacing"], mx.inputs[0]); L.new(shader, mx.inputs[1]); L.new(tr.outputs[0], mx.inputs[2])
    L.new(mx.outputs[0], out.inputs["Surface"])
    return m


def main():
    p = argparse.ArgumentParser(prog="interior_shots.py")
    p.add_argument("asset"); p.add_argument("out")
    p.add_argument("--shots", required=True); p.add_argument("--layer", type=float, default=0.0); p.add_argument("--layer-tint", default="aqua")
    p.add_argument("--on", default=""); p.add_argument("--fade", type=float, default=0.0); p.add_argument("--fov", type=float, default=62.0)
    p.add_argument("--fog", default=None); p.add_argument("--stops", type=float, default=0.0); p.add_argument("--size", default="960x540")
    p.add_argument("--samples", type=int, default=12); p.add_argument("--extra", default="", help="more raw GLBs to show beside the zone (comma-separated asset ids)")
    a = p.parse_args(sc.argv_after_dashes())
    if a.fog:
        h, d = a.fog.split(","); a.fog = (lin(h), float(d))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for aid in [a.asset] + [x for x in a.extra.split(",") if x]:
        sc.must(bpy.ops.import_scene.gltf(filepath=manifest.raw_path(aid)), "import " + aid)
    s = bpy.context.scene
    on = set(x for x in a.on.split(",") if x)
    made = {}
    for ob in s.objects:
        if ob.type != 'MESH': continue
        me = ob.data
        vcol.adopt_imported(ob)
        if len(me.uv_layers): me.uv_layers[0].name = "UVMap"
        if len(me.uv_layers) > 1: me.uv_layers[1].name = "UVLight"
        kind = ob.get("bake"); lm = ob.get("lightmap") if kind == "LM" else None; layer = ob.get("lightLayer") if kind == "LM" else None
        for i, m in enumerate(me.materials):
            if m is None: continue
            base = m.name.split(".")[0]
            key = (base, kind, lm, layer, ob.name in on if base == "m_emis" else False)
            if key not in made: made[key] = build_material(base, kind, lm, layer, a, key[4])
            me.materials[i] = made[key]
    w, h = (int(x) for x in a.size.split("x"))
    r = s.render; r.engine = 'CYCLES'; r.resolution_x = w; r.resolution_y = h; r.resolution_percentage = 100
    r.image_settings.file_format = 'PNG'; r.film_transparent = False
    s.cycles.samples = a.samples; s.cycles.use_denoising = False; s.cycles.device = 'CPU'; s.cycles.transparent_max_bounces = 16
    s.cycles.max_bounces = 0
    s.view_settings.view_transform = 'Standard'; s.view_settings.look = 'None'
    if s.world is None: s.world = bpy.data.worlds.new("W")
    s.world.use_nodes = True
    bg = s.world.node_tree.nodes.get("Background"); bg.inputs["Color"].default_value = (*(a.fog[0] if a.fog else (0.0, 0.0, 0.0)), 1.0); bg.inputs["Strength"].default_value = 1.0 if a.fog else 0.0
    cd = bpy.data.cameras.new("ShotCam"); cam = bpy.data.objects.new("ShotCam", cd); s.collection.objects.link(cam); s.camera = cam
    cd.sensor_fit = 'VERTICAL'; cd.angle_y = math.radians(a.fov); cd.clip_start = 0.05; cd.clip_end = 500
    os.makedirs(a.out, exist_ok=True)
    for item in a.shots.split(";"):
        if not item.strip(): continue
        name, rest = item.split("=", 1); src, dst = rest.split(">")
        e = Vector(layout.to_blender([float(x) for x in src.split(",")])); t = Vector(layout.to_blender([float(x) for x in dst.split(",")]))
        cam.location = e; cam.rotation_euler = (t - e).to_track_quat('-Z', 'Y').to_euler()
        r.filepath = os.path.join(a.out, name.strip() + ".png")
        bpy.ops.render.render(write_still=True)
        print(f"SHOT {r.filepath}")


if __name__ == "__main__":
    sc.run(main)
