"""The nine game materials. In this project a material is a NAME: the runtime replaces each by name
(`render.material()`), and GLBs ship no textures (ARCHITECTURE 7.2, 8.1; ART_BIBLE 4.4).

    m_frontier  tx_frontier_trim   world shader: vcol x detail x 2 x baked light
    m_pellam    tx_pellam_trim     same
    m_sand      tx_sand            same (terrain only)
    m_flat      tx_palette         world shader with the palette (backdrops, the town card)
    m_mask      tx_mask            alpha test 0.5 (signage, grilles, cards)
    m_emis      tx_palette_emis    unlit lamp sets: COLOR_0 R = intensity, G = flicker group, B = wrong_fade
    m_prop      tx_palette (+ emis) every dynamic or instanced object: palette x COLOR_0 x runtime light
    m_gun       tx_gun + matcap    the revolver only (+ tx_gun_detail: one channel of height, ruling R14)
    m_hands     tx_hands           the view-model's hands and forearms only (+ tx_hands_detail; ruling R14)

`game_material(name)` is the only way a mesh should get a material. The node tree it builds is a PREVIEW (vertex
colour x the shared texture when its raw PNG exists in blender/export/tex/), so Cycles renders and bakes resemble
the game; nothing of it is exported except the name and back-face culling.
"""
import bpy, os
from . import manifest

GAME_MATERIALS = manifest.MATERIALS
_DETAIL = ("m_frontier", "m_pellam", "m_sand")


def _image(texture_id, colorspace):
    """The raw shared texture as a Blender image, or None when it has not been built yet."""
    name = "preview_" + texture_id
    img = bpy.data.images.get(name)
    if img is not None: return img
    try: path = manifest.raw_texture_path(texture_id)
    except KeyError: return None
    if not os.path.isfile(path): return None
    img = bpy.data.images.load(path, check_existing=True); img.name = name
    img.colorspace_settings.name = colorspace
    return img


def game_material(name, preview=True):
    """Return THE material called `name` (created once per file). `name` must be one of GAME_MATERIALS; anything else
    raises, because a mesh with an unknown material fails `check-glb`. Back-face culling is on (doubleSided: false):
    model both sides when both are seen. preview=False builds a bare vertex-colour material."""
    if name not in GAME_MATERIALS:
        raise ValueError(f"material '{name}' is not a game material; use one of {', '.join(GAME_MATERIALS)}")
    m = bpy.data.materials.get(name)
    if m is not None: return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    m.use_backface_culling = True
    nt = m.node_tree; N = nt.nodes; L = nt.links
    b = N["Principled BSDF"]
    b.inputs["Roughness"].default_value = 0.35 if name == "m_gun" else 0.6 if name == "m_hands" else 0.85
    b.inputs["Metallic"].default_value = 0.0                    # metals are painted, never simulated (ART_BIBLE 2.2)
    vc = N.new("ShaderNodeVertexColor"); vc.layer_name = "Color"
    colour = vc.outputs["Color"]
    if preview:
        sheet = manifest.SHEET_OF[name]
        img = _image(sheet, 'Non-Color' if name in _DETAIL or name == "m_mask" else 'sRGB')
        if img is not None and name != "m_emis":
            tex = N.new("ShaderNodeTexImage"); tex.image = img
            tex.interpolation = 'Closest' if name in ("m_prop", "m_flat") else 'Linear'
            if name == "m_mask":
                gt = N.new("ShaderNodeMath"); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = 0.5
                L.new(tex.outputs["Color"], gt.inputs[0]); L.new(gt.outputs[0], b.inputs["Alpha"])
            else:
                mix = N.new("ShaderNodeMix"); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs["Factor"].default_value = 1.0
                L.new(tex.outputs["Color"], mix.inputs["A"]); L.new(vc.outputs["Color"], mix.inputs["B"])
                colour = mix.outputs["Result"]
                if name in _DETAIL:                              # vcol x detail x 2
                    dbl = N.new("ShaderNodeMix"); dbl.data_type = 'RGBA'; dbl.blend_type = 'ADD'; dbl.inputs["Factor"].default_value = 1.0
                    L.new(colour, dbl.inputs["A"]); L.new(colour, dbl.inputs["B"])
                    colour = dbl.outputs["Result"]
        if name == "m_emis":
            b.inputs["Base Color"].default_value = (0.0, 0.0, 0.0, 1.0)
            img = _image("tx_palette_emis", 'sRGB')
            sep = N.new("ShaderNodeSeparateColor"); L.new(vc.outputs["Color"], sep.inputs[0])
            at = N.new("ShaderNodeAttribute"); at.attribute_type = 'OBJECT'; at.attribute_name = "emit_strength"
            mul = N.new("ShaderNodeMath"); mul.operation = 'MULTIPLY'
            L.new(sep.outputs[0], mul.inputs[0]); L.new(at.outputs["Fac"], mul.inputs[1])
            L.new(mul.outputs[0], b.inputs["Emission Strength"])
            if img is not None:
                tex = N.new("ShaderNodeTexImage"); tex.image = img; tex.interpolation = 'Closest'
                L.new(tex.outputs["Color"], b.inputs["Emission Color"])
            else:
                b.inputs["Emission Color"].default_value = (0.2, 0.9, 0.8, 1.0)
            return m
    if name != "m_emis": L.new(colour, b.inputs["Base Color"])
    return m


def assign(ob, name, faces=None):
    """Give `ob` the game material `name`: on every face, or on the polygon indices in `faces`. Adds a slot when needed."""
    m = game_material(name)
    me = ob.data
    idx = next((i for i, s in enumerate(me.materials) if s is not None and s.name == name), None)
    if idx is None:
        me.materials.append(m); idx = len(me.materials) - 1
    if faces is None:
        for p in me.polygons: p.material_index = idx
    else:
        for i in faces: me.polygons[i].material_index = idx
    return m


def names(ob):
    """Names of the materials actually used by faces of `ob`, sorted."""
    me = ob.data
    used = sorted({p.material_index for p in me.polygons})
    return sorted(me.materials[i].name for i in used if i < len(me.materials) and me.materials[i] is not None)
