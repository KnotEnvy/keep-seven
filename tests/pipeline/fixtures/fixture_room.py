"""Pipeline fixture (b): a 6 x 4 m test room that exercises the whole zone path of blender/lib:
a lightmapped floor and vertex-lit walls IN ONE MESH (UV1 of the walls on the neutral texel), one embedded prop
(zone.embed_prop), a lamp set, a light layer, bake calibration, chunk assignment and merge, a dressing empty.
Read it as the worked example for a zone script. Not a game asset (tests/pipeline/fixtures/manifest.json)."""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")   # never loop at the filesystem root
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
import math, time
import bpy, bmesh
from lib import scene, mesh, uv, material, vcol, bake, export, zone, layout, manifest

ASSET = "fixture_room"
LM, LAYER = "lm_fixture_room", "lm_fixture_room_layer"
PT = "tx_pellam_trim"
W, D, H = 6.0, 4.0, 3.0            # x, y, z (Blender); the room is centred on the origin, floor at z = 0


def quad(name, pts, tint, region, flip=False):
    """One interior face (only what is seen is built): a quad from 4 Blender points, wound to face into the room."""
    bm = mesh.new_bmesh()
    f = bm.faces.new([bm.verts.new(p) for p in (reversed(pts) if flip else pts)])
    ob = mesh.new_mesh_object(name, bm)
    material.assign(ob, "m_pellam")
    if region: uv.map_to_trim(ob, None, PT, region)
    vcol.tint(ob, tint)
    return ob


def build():
    hx, hy = W / 2, D / 2
    floor = [quad(f"floor{i}", [(-hx, -hy + i, 0), (hx, -hy + i, 0), (hx, -hy + i + 1, 0), (-hx, -hy + i + 1, 0)], "concrete", "floor") for i in range(4)]
    walls = []
    def wall(name, a, b, z0, z1, tint, region):                      # a -> b seen from inside runs left to right
        walls.append(quad(name, [(a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z1), (a[0], a[1], z1)], tint, region))
    for tag, a, b in (("n", (-hx, hy), (hx, hy)), ("e", (hx, hy), (hx, -hy)), ("s", (hx, -hy), (-hx, -hy))):
        wall(f"w{tag}0", a, b, 0.0, 1.2, "enamel_stain", "panel"); wall(f"w{tag}1", a, b, 1.2, 2.4, "enamel", "panel")
        wall(f"w{tag}2", a, b, 2.4, H, "steel", "steel")
    # the west wall has a window (y -1..1, z 0.8..2.4): the sun comes in through it
    wall("ww_l", (-hx, -hy), (-hx, -1.0), 0.0, H, "enamel", "panel"); wall("ww_r", (-hx, 1.0), (-hx, hy), 0.0, H, "enamel", "panel")
    wall("ww_b", (-hx, -1.0), (-hx, 1.0), 0.0, 0.8, "enamel_stain", "panel"); wall("ww_t", (-hx, -1.0), (-hx, 1.0), 2.4, H, "steel", "steel")
    ceil = quad("ceiling", [(-hx, -hy, H), (-hx, hy, H), (hx, hy, H), (hx, -hy, H)], "concrete", "concrete")
    for o in walls + [ceil]: mesh.tessellate_max_edge(o, 0.5)        # vertex light needs vertices
    return floor, walls + [ceil]


def main():
    args = scene.asset_args("fixture_room.py")
    scene.reset_scene()
    floor, lit = build()
    # an embedded prop: imported from its raw export, folded into the chunk's structure material, vertex-lit in place
    stool = zone.embed_prop("fixture_stool", location=(1.4, 0.7, 0.0), rot_z=0.5, material_name="m_pellam", lightmap=LM)
    lamps = zone.lamp_set("room_lamps", [[(x - 0.6, -0.05, H - 0.02), (x - 0.6, 0.05, H - 0.02), (x + 0.6, 0.05, H - 0.02), (x + 0.6, -0.05, H - 0.02)] for x in (-1.8, 0.0, 1.8)],
                          colour="aqua", emit_strength=60.0)
    # ---- light: the level's sun through the window + sky, calibrated on a white test plane (ART_BIBLE 3)
    device = bake.use_cycles('CPU', samples=64)
    sun = bake.add_sun(layout.sun(), strength=3.0); bake.set_world((0.19, 0.24, 0.69), 1.0)
    sun_e, world_e, reading = bake.calibrate(1.30, 0.90, sun=sun)
    print(f"CALIBRATED sun {sun_e:.3f} world {world_e:.3f} -> key {reading['key']:.3f} ambient {reading['ambient']:.3f} ({device})")
    hatch = bpy.data.objects.new("layer_light", bpy.data.lights.new("layer_light", 'POINT')); scene.link(hatch)
    hatch.location = (2.2, -1.2, 0.4); hatch.data.energy = 60.0; hatch.data.color = (1, 1, 1); hatch.hide_render = True
    # ---- paint: AO into vertex colour, then tint x AO (lightmapped) / tint x gradients (vertex-lit)
    everything = floor + lit + stool
    vcol.bake_ao_vertex(floor + lit, distance=1.2)
    for o in floor + lit: vcol.compose_vertex_color(o, mode='tint', jitter=0.0, gradient=(1.0, 1.0))
    # ---- UV1: floor faces into the atlas, everything else on the neutral texel. A faces argument is None (all), a list
    # of polygon indices ([] = none) or callable(polygon) -> bool: ONE argument, object space (not the three-argument
    # predicate of mesh.delete_faces)
    uv.unwrap_lightmap(everything, LM, faces={o.name: (lambda p: p.normal.z > 0.9) for o in floor} | {o.name: [] for o in lit + stool})
    density = uv.uv_density(floor, res=manifest.texture(LM)["size"][0])[0]
    img, t_lm = bake.bake_lightmap(floor, LM, samples=64)
    bake.save_lightmap(img, LM)
    hatch.hide_render = False
    layer, t_layer = bake.bake_light_layer(floor, LAYER, [hatch], samples=64)
    bake.save_lightmap(layer, LAYER)
    hatch.hide_render = True
    # ---- vertex light for everything that is not lightmapped (UV1 on the neutral texel). Each vertex is one path-traced
    # point and nothing denoises it: the sample count is the quality (256 while iterating, the default 2048 to look at,
    # 4096 for a final interior). It marks the faces it lit; zone.merge_chunks raises for a vertex-lit face without the mark
    t_vl = vcol.bake_vertex_light(lit + stool, samples=4096)
    print(f"BAKED lightmap {manifest.texture(LM)['size']} {t_lm:.2f}s ({density:.1f} texels/m), layer {t_layer:.2f}s, vertex light {sum(len(o.data.polygons) for o in lit + stool)} faces {t_vl:.2f}s")
    # ---- chunks: every face to its chunk, then one mesh per (chunk, material)
    zone.assign_chunks(everything, ASSET)
    zone.merge_chunks(ASSET)
    zone.dressing_empty('inst', 1, "fixture_stool", loc=(-1.5, -1.0, 0.0), rot_z=1.2)
    export.export_asset(ASSET, args.out, blend=args.blend)


if __name__ == "__main__":
    scene.run(main)
