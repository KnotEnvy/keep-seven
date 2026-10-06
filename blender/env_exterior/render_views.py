"""render_views: eye-level Cycles previews of the exterior bake scene, lit by the real L1 light (not a build step).

    tools/blender.sh -b --factory-startup --python-exit-code 1 -P blender/env_exterior/render_views.py -- \
        --out shots/art-env-exterior --name lip --shots "x,y,z>x,y,z;..." [--samples 48] [--size 960x540] [--fog 1] [--lens 20]

Coordinates are GAME space (eye > target). The scene is surface_common.build() (both zones, sun + sky as baked), the
camera sees the L1 sky gradient, and the picture is fogged in post as the game will be (ART_BIBLE 3.2: 0.0058 / m,
fog colour toward / away from the sun). It is the LIT LOOK the bake aims at; the viewer frames show the baked result.
"""
import sys, os, math, argparse
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _d)
while not os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py")):
    if os.path.dirname(_d) == _d: raise SystemExit("blender/lib not found")
    _d = os.path.dirname(_d)
ROOT = _d
sys.path.insert(0, os.path.join(_d, "blender"))
import bpy
import numpy as np
from mathutils import Vector
from lib import scene, bake, layout, texdraw as td


def srgb(h):
    h = h.lstrip("#"); return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], dtype=np.float32)


def lin(h):
    c = srgb(h); return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def tone(x):
    """The game's shoulder-only curve (knee 0.8), per pixel on the brightest channel."""
    m = x.max(axis=2, keepdims=True)
    t = np.maximum(m - 0.8, 0.0)
    out = np.where(m > 0.8, 0.8 + 0.2 * t / (t + 0.2), m)
    return x * (out / np.maximum(m, 1e-6))


def add_far(ids):
    """The UNLIT far scenery as the game draws it: palette x COLOR_0, emitted (not lit by the bake's sun)."""
    from lib import manifest, vcol
    pal = manifest.palette_rgb("ui_pale")
    for aid in ids:
        path = manifest.raw_path(aid)
        if not os.path.isfile(path): continue
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=path)
        for o in [o for o in bpy.data.objects if o not in before and o.type == 'MESH']:
            vcol.adopt_imported(o)
            for i, m in enumerate(o.data.materials):
                emis = m is not None and m.name.startswith("m_emis")
                mm = bpy.data.materials.new("far_" + o.name); mm.use_nodes = True
                nt = mm.node_tree; N = nt.nodes; L = nt.links
                for n in list(N):
                    if n.type != 'OUTPUT_MATERIAL': N.remove(n)
                out = next(n for n in N if n.type == 'OUTPUT_MATERIAL')
                em = N.new("ShaderNodeEmission"); vc = N.new("ShaderNodeVertexColor"); vc.layer_name = "Color"
                mul = N.new("ShaderNodeMix"); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs["Factor"].default_value = 1.0
                mul.inputs["B"].default_value = (1.0, 0.58, 0.2, 1.0) if emis else (*pal, 1.0)
                L.new(vc.outputs["Color"], mul.inputs["A"]); L.new(mul.outputs["Result"], em.inputs["Color"])
                em.inputs["Strength"].default_value = 6.0 if emis else 1.0
                L.new(em.outputs[0], out.inputs["Surface"])
                o.data.materials[i] = mm
            o.visible_shadow = False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True); ap.add_argument("--name", default="view"); ap.add_argument("--shots", required=True)
    ap.add_argument("--samples", type=int, default=48); ap.add_argument("--size", default="960x540"); ap.add_argument("--fog", type=int, default=1)
    ap.add_argument("--lens", type=float, default=0.0); ap.add_argument("--mood", default="L1"); ap.add_argument("--scene", default="surface")
    ap.add_argument("--names", default=""); ap.add_argument("--silhouette", type=float, default=0.0)
    a = ap.parse_args(sys.argv[sys.argv.index("--") + 1:])
    W, H = [int(x) for x in a.size.split("x")]
    if a.scene == "surface":
        import surface_common
        S = surface_common.build()
        to_sun = Vector(layout.sun())
        sky = dict(zenith="#2C5A6E", mid="#8FB0A0", horizon="#F3C58E", below="#C9A592", fog_sun="#EDBB86", fog_away="#C9A592", density=0.0058)
    else:
        import env_far_rim
        env_far_rim.build_scene()
        to_sun = Vector(layout.to_blender((-0.70, 0.10, -0.70))).normalized()
        sky = dict(zenith="#1B2440", mid="#5D6690", horizon="#D9967A", below="#4D5578", fog_sun="#4D5578", fog_away="#4D5578", density=0.012)
    if not a.silhouette: add_far(["env_backdrop_day"] if a.scene == "surface" else ["env_backdrop_dusk", "rim_town_card"])
    s = bpy.context.scene
    dev = bake.use_cycles(os.environ.get("KS_EXT_DEVICE", "CUDA"), samples=a.samples)
    s.cycles.use_denoising = True; s.cycles.max_bounces = 3; s.cycles.diffuse_bounces = 3
    s.render.resolution_x = W; s.render.resolution_y = H; s.render.resolution_percentage = 100
    s.render.film_transparent = True
    s.render.image_settings.file_format = 'OPEN_EXR'; s.render.image_settings.color_mode = 'RGBA'; s.render.image_settings.color_depth = '32'
    s.view_settings.view_transform = 'Standard'
    s.view_layers[0].use_pass_z = True
    s.use_nodes = True
    nt = s.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    rl = nt.nodes.new("CompositorNodeRLayers"); comp = nt.nodes.new("CompositorNodeComposite")
    nt.links.new(rl.outputs["Image"], comp.inputs["Image"])
    fo = nt.nodes.new("CompositorNodeOutputFile"); fo.format.file_format = 'OPEN_EXR'; fo.format.color_mode = 'RGB'; fo.format.color_depth = '32'
    tmp = os.path.join(ROOT, "scratch", "art-env-exterior", "_rv"); os.makedirs(tmp, exist_ok=True)
    fo.base_path = tmp; fo.file_slots[0].path = "depth_"
    nt.links.new(rl.outputs["Depth"], fo.inputs[0])
    cd = bpy.data.cameras.new("cam"); cam = bpy.data.objects.new("cam", cd); s.collection.objects.link(cam); s.camera = cam
    # the game's camera: 75 degrees vertical FOV? keep the viewer's default (three: fov is vertical). 16:9 sensor fit horizontal
    fov_v = math.radians(70.0)
    cd.sensor_fit = 'VERTICAL'; cd.sensor_height = 24.0; cd.lens = a.lens if a.lens > 0 else 12.0 / math.tan(fov_v / 2)
    cd.clip_start = 0.05; cd.clip_end = 3000
    os.makedirs(a.out, exist_ok=True)
    names = [n for n in a.names.split(",") if n]
    for k, spec in enumerate(a.shots.split(";")):
        eye, tgt = spec.split(">")
        eye = Vector(layout.to_blender([float(x) for x in eye.split(",")])); tgt = Vector(layout.to_blender([float(x) for x in tgt.split(",")]))
        cam.location = eye; cam.rotation_euler = (tgt - eye).to_track_quat('-Z', 'Y').to_euler()
        s.frame_set(k + 1)
        s.render.filepath = os.path.join(tmp, f"beauty_{k:02d}.exr")
        scene.must(bpy.ops.render.render(write_still=True), "render")
        img = bpy.data.images.load(s.render.filepath); px = np.empty(W * H * 4, np.float32); img.pixels.foreach_get(px); bpy.data.images.remove(img)
        rgb = px.reshape(H, W, 4)[::-1]
        dpath = os.path.join(tmp, f"depth_{k + 1:04d}.exr")
        img = bpy.data.images.load(dpath); px = np.empty(W * H * 4, np.float32); img.pixels.foreach_get(px); bpy.data.images.remove(img)
        depth = px.reshape(H, W, 4)[::-1, :, 0]
        alpha = rgb[:, :, 3:4]; col = rgb[:, :, :3]
        # view rays
        bpy.context.view_layer.update()
        m = np.array(cam.matrix_world.to_3x3(), dtype=np.float32)
        tan_v = 12.0 / cd.lens; tan_h = tan_v * W / H
        xs = (np.arange(W) + 0.5) / W * 2 - 1; ys = 1 - (np.arange(H) + 0.5) / H * 2
        dx, dy = np.meshgrid(xs * tan_h, ys * tan_v)
        d = np.stack([dx, dy, -np.ones_like(dx)], axis=2) @ m.T
        d /= np.linalg.norm(d, axis=2, keepdims=True)
        elev = np.degrees(np.arcsin(np.clip(d[:, :, 2], -1, 1)))[..., None]
        hz = d[:, :, :2] / np.maximum(np.linalg.norm(d[:, :, :2], axis=2, keepdims=True), 1e-6)
        sh = np.array([to_sun.x, to_sun.y], np.float32); sh /= np.linalg.norm(sh)
        toward = np.clip((hz @ sh) * 0.5 + 0.5, 0, 1)[..., None]
        fogc = lin(sky["fog_away"]) * (1 - toward) + lin(sky["fog_sun"]) * toward
        t1 = np.clip(elev / 25.0, 0, 1); t2 = np.clip((elev - 25.0) / 65.0, 0, 1)
        skyc = np.where(elev < 0, lin(sky["below"]) * np.ones_like(col), np.where(elev < 25.0, fogc * (1 - t1) + lin(sky["mid"]) * t1, lin(sky["mid"]) * (1 - t2) + lin(sky["zenith"]) * t2))
        if a.scene == "surface":                                  # the sun's disc and halo (the sky shader's job in the game)
            cosang = np.clip(d @ np.array(to_sun, np.float32), -1, 1)[..., None]
            ang = np.degrees(np.arccos(cosang))
            skyc = skyc + lin("#FFE9B8") * (np.clip(1 - ang / 14.0, 0, 1) ** 2 * 0.6 + (ang < 1.6) * 4.0)
        if a.fog:
            f = 1.0 - np.exp(-sky["density"] * np.minimum(depth, 5000.0))[..., None]
            col = col * (1 - f) + fogc * f * alpha
        out = col + skyc * (1 - alpha)
        out = tone(np.clip(out, 0, None))
        if a.silhouette:                                                               # black on white: the shape alone
            fwd = -m[:, 2] / np.linalg.norm(m[:, 2])                                   # (--silhouette N: only what stands within N metres, measured along the view axis)
            planar = depth * (d @ fwd)
            out = np.ones_like(col) * (1 - ((alpha > 0.5) & (planar[..., None] < float(a.silhouette))))
        out8 = td.linear_to_srgb(np.clip(out, 0, 1))
        name = names[k] if k < len(names) else f"{a.name}_{k:02d}"
        td.write_png(os.path.join(a.out, name + ".png"), out8)
        print(f"VIEW {name} ({dev})", flush=True)


if __name__ == "__main__":
    scene.run(main)
