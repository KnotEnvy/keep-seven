"""Silhouette check (art-props order 7, item 5): every P0 props_mech asset over 0.3 m, black on white, from the front
and from 70 degrees round, one sheet: shots/art-props-mech/silhouettes.png.
    tools/blender.sh -b --factory-startup -P tests/art_props/mech/tools/sil.py"""
import sys, os
sys.dont_write_bytecode = True
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "blender")); sys.path.insert(0, os.path.join(ROOT, "blender", "tools"))
import bpy, math, tempfile
import numpy as np
from mathutils import Vector
import preview as pv
from lib import manifest, texdraw as td

ids = [k for k, a in manifest.load()["assets"].items() if a["owner"] == "props_mech" and a["priority"] == 0]
S = 300; tiles = []
for aid in ids:
    scene = pv.load(manifest.raw_path(aid))
    for o in scene.objects:
        if o.name.split(".")[0] in ("jug_broken",): o.hide_render = True
    mn, mx = pv.world_bounds(scene)
    if max(mx - mn) < 0.3: continue
    r = scene.render; r.engine = 'BLENDER_WORKBENCH'; r.resolution_x = S; r.resolution_y = S; r.resolution_percentage = 100
    scene.world = scene.world or bpy.data.worlds.new("W"); scene.world.color = (1, 1, 1)
    sh = scene.display.shading; sh.light = 'FLAT'; sh.color_type = 'SINGLE'; sh.single_color = (0, 0, 0)
    sh.show_object_outline = False; sh.show_cavity = False; sh.show_shadows = False
    scene.view_settings.view_transform = 'Standard'
    pts = pv.world_points(scene)
    for az, el in ((0, 5), (70, 15)):
        pv.orbit(scene, mn, mx, math.radians(az), math.radians(el), 50.0, 1.0, 1.0, True, 0.08, pts)
        f = os.path.join(tempfile.gettempdir(), "ks_sil.png"); r.filepath = f
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(f); px = np.empty(S * S * 4, dtype=np.float32); img.pixels.foreach_get(px); bpy.data.images.remove(img)
        t = np.clip(np.rint(px.reshape(S, S, 4)[::-1, :, :3] * 255), 0, 255).astype(np.uint8)
        t[:2, :] = 128; t[:, :2] = 128
        tiles.append(t)
    print("SIL", aid)
cols = 8; rows = math.ceil(len(tiles) / cols)
sheet = np.full((rows * S, cols * S, 3), 255, dtype=np.uint8)
for i, t in enumerate(tiles):
    rr, c = divmod(i, cols); sheet[rr * S:(rr + 1) * S, c * S:(c + 1) * S] = t
td.write_png(os.path.join(ROOT, "shots", "art-props-mech", "silhouettes.png"), sheet)
print("SHEET", len(tiles))
