"""Material constructors that survive glTF export. Verified on Blender 4.5.14 (see docs/research/blender-pipeline.md section 3)."""
import bpy

def principled(name, base=(0.8, 0.8, 0.8, 1), metallic=0.0, roughness=0.5, emission=None, emission_strength=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    m.use_backface_culling = True                                       # -> doubleSided: false
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = base
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Roughness"].default_value = roughness
    if emission:
        b.inputs["Emission Color"].default_value = (*emission, 1)      # 4.x socket names: "Emission Color", "Emission Strength"
        b.inputs["Emission Strength"].default_value = emission_strength
    return m

def textured(name, albedo_png, rough_png=None, normal_png=None):
    m = principled(name); nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    def tex(path, cs):
        i = bpy.data.images.load(path); i.colorspace_settings.name = cs       # 'sRGB' or 'Non-Color'
        n = nt.nodes.new("ShaderNodeTexImage"); n.image = i; return n
    nt.links.new(tex(albedo_png, 'sRGB').outputs["Color"], b.inputs["Base Color"])
    if rough_png: nt.links.new(tex(rough_png, 'Non-Color').outputs["Color"], b.inputs["Roughness"])
    if normal_png:
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(tex(normal_png, 'Non-Color').outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    return m

def alpha_mask(m, threshold=0.5):
    """Route the alpha of the image feeding Base Color through Math(GREATER_THAN) -> exports alphaMode MASK (alpha test)."""
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    tex = b.inputs["Base Color"].links[0].from_node
    mt = nt.nodes.new("ShaderNodeMath"); mt.operation = 'GREATER_THAN'; mt.inputs[1].default_value = threshold
    nt.links.new(tex.outputs["Alpha"], mt.inputs[0]); nt.links.new(mt.outputs[0], b.inputs["Alpha"])
    return m

def gltf_occlusion_group():
    """The exporter looks for a node GROUP named 'glTF Material Output' with an 'Occlusion' input."""
    g = bpy.data.node_groups.get("glTF Material Output")
    if g is None:
        g = bpy.data.node_groups.new("glTF Material Output", 'ShaderNodeTree')
        g.interface.new_socket("Occlusion", in_out='INPUT', socket_type='NodeSocketFloat')
        g.nodes.new("NodeGroupInput")
    return g

def set_occlusion_map(m, image, uv_name="UVLight"):
    """Greyscale AO image sampled with a named UV layer -> glTF occlusionTexture (texCoord = index of that layer)."""
    nt = m.node_tree
    uvn = nt.nodes.new("ShaderNodeUVMap"); uvn.uv_map = uv_name
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = image
    grp = nt.nodes.new("ShaderNodeGroup"); grp.node_tree = gltf_occlusion_group()
    nt.links.new(uvn.outputs["UV"], tex.inputs["Vector"]); nt.links.new(tex.outputs["Color"], grp.inputs["Occlusion"])
    return m
