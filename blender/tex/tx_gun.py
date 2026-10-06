"""tx_gun: 1024 x 512 RGBA sRGB: RGB = the revolver's albedo on its unique unwrap, A = gloss mask (ART_BIBLE 4.2, 8.1).

    node tools/build-assets.mjs --only tx_gun        (run it with --force after editing blender/weapons/assize.py)

How it is made (no noise, no grunge, nothing photographed):
  1. blender/weapons/assize.py builds the gun and its deterministic unwrap: the same call weapon_revolver.py makes.
  2. Five data passes are baked through that unwrap at 2048 x 1024 (Cycles, emission): part / role ids, gun-space
     position, shading normal, a short-range cavity occlusion and a convex-edge mask (occlusion measured INSIDE the steel).
  3. numpy draws the texture from those passes: gun_blue; wear to gun_worn where a hand or a holster goes (edges, the
     front 30 mm of the barrel, the flute ridges, the hammer spur); walnut with grain drawn ALONG the grip, a worn
     heel and one hairline crack; brass case rims with darker primers and the pin; the bolt notches, the chamber
     mouths, the screw slots (not aligned), and under the loading gate the 9 mm stamp (brand.mark_coverage).
     Alpha = gloss: blue 0.75, worn 0.9, walnut 0.35, brass 0.6.
  4. Box-filtered to 1024 x 512, written as PNG. blender/weapons/tx_gun_points.json names four UV points (blue, worn,
     walnut, brass) for tests/art_weapons/textures.test.mjs.
"""
import sys, os, math, json
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")   # never loop at the filesystem root
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
import numpy as np
import bpy
from lib import texdraw as td, manifest, scene, mesh, vcol, brand, bake
sys.path.insert(0, os.path.join(manifest.ROOT, "blender", "weapons"))
import assize

W, H, SS = 1024, 512, 2
BW, BH = W * SS, H * SS
POS_MIN = np.array([-0.030, -0.160, -0.135], dtype=np.float32)        # gun-space box the position pass is normalised to
POS_MAX = np.array([0.030, 0.195, 0.045], dtype=np.float32)


def lin(name):
    return np.asarray(manifest.palette_rgb(name), dtype=np.float32)


def smooth(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


SRC = {"role": "Color", "pos": "Vector", "nrm": "Vector", "ao": "Color", "edge": "Color"}


def bake_pass(objs, mat, img, kind, samples):
    """Route one source into the emission of the shared bake material and bake every part into `img`."""
    nt = mat.node_tree; N = nt.nodes; L = nt.links
    em = N["em"]
    for l in list(em.inputs["Color"].links): L.remove(l)
    L.new(N[kind].outputs[SRC[kind]], em.inputs["Color"])
    s = bpy.context.scene
    s.cycles.samples = samples
    scene.deselect_all()
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    r = bpy.ops.object.bake(type='EMIT', margin=0, use_clear=False)
    if r != {'FINISHED'}: raise RuntimeError(f"bake {kind} failed: {r}")
    a = np.empty(BW * BH * 4, dtype=np.float32); img.pixels.foreach_get(a)
    return a.reshape(BH, BW, 4)[::-1].copy()                                 # row 0 = top


def bake_material():
    m = bpy.data.materials.new("gun_bake"); m.use_nodes = True
    nt = m.node_tree; N = nt.nodes; L = nt.links
    for n in list(N): N.remove(n)
    out = N.new("ShaderNodeOutputMaterial"); em = N.new("ShaderNodeEmission"); em.name = "em"
    L.new(em.outputs[0], out.inputs["Surface"])
    role = N.new("ShaderNodeVertexColor"); role.name = "role"; role.layer_name = "Role"
    geo = N.new("ShaderNodeNewGeometry")
    sub = N.new("ShaderNodeVectorMath"); sub.operation = 'SUBTRACT'; sub.inputs[1].default_value = tuple(POS_MIN)
    div = N.new("ShaderNodeVectorMath"); div.operation = 'DIVIDE'; div.name = "pos"; div.inputs[1].default_value = tuple(POS_MAX - POS_MIN)
    L.new(geo.outputs["Position"], sub.inputs[0]); L.new(sub.outputs["Vector"], div.inputs[0])
    nm = N.new("ShaderNodeVectorMath"); nm.operation = 'MULTIPLY_ADD'; nm.name = "nrm"
    nm.inputs[1].default_value = (0.5, 0.5, 0.5); nm.inputs[2].default_value = (0.5, 0.5, 0.5)
    L.new(geo.outputs["Normal"], nm.inputs[0])
    ao = N.new("ShaderNodeAmbientOcclusion"); ao.name = "ao"; ao.samples = 16; ao.inputs["Distance"].default_value = 0.008
    ed = N.new("ShaderNodeAmbientOcclusion"); ed.name = "edge"; ed.samples = 16; ed.inside = True; ed.only_local = True
    ed.inputs["Distance"].default_value = 0.0016
    img = bpy.data.images.new("gun_bake", BW, BH, alpha=True, float_buffer=True)
    img.colorspace_settings.name = 'Non-Color'
    tex = N.new("ShaderNodeTexImage"); tex.image = img; N.active = tex
    return m, img


def nearest(pos, mask, target):
    """Pixel (x, y) of the masked texel nearest a gun-space point (metres)."""
    d = ((pos - np.asarray(target, dtype=np.float32)[None, None, :]) ** 2).sum(axis=2)
    d[~mask] = 1e9
    i = int(np.argmin(d)); return i % d.shape[1], i // d.shape[1]


def main():
    out = sys.argv[sys.argv.index("--out") + 1]
    scene.reset_scene()
    parts = assize.build()
    density = assize.unwrap(parts, W, H)
    mat, img = bake_material()
    for o in parts:
        vcol.fill_color(o, (float(o["role"]) / 8.0, float(o["part"]) / 32.0, 0.0), name="Role")
        o.data.materials.clear(); o.data.materials.append(mat)
    bake.use_cycles('CPU', 8, denoise=False)
    s = bpy.context.scene
    s.cycles.use_adaptive_sampling = False
    px = np.zeros(BW * BH * 4, dtype=np.float32); img.pixels.foreach_set(px)

    def clear():
        img.pixels.foreach_set(px)

    clear(); role = bake_pass(parts, mat, img, "role", 1)
    clear(); posn = bake_pass(parts, mat, img, "pos", 4)
    clear(); nrmn = bake_pass(parts, mat, img, "nrm", 4)
    clear(); aoimg = bake_pass(parts, mat, img, "ao", 48)
    clear(); edimg = bake_pass(parts, mat, img, "edge", 48)

    covered = role[:, :, 3] > 0.5
    rid = np.rint(role[:, :, 0] * 8.0).astype(np.int32)
    pid = np.rint(role[:, :, 1] * 32.0).astype(np.int32)
    P = posn[:, :, :3] * (POS_MAX - POS_MIN)[None, None, :] + POS_MIN[None, None, :]
    X, Y, Z = P[:, :, 0] * 1000.0, P[:, :, 1] * 1000.0, P[:, :, 2] * 1000.0          # millimetres, gun space
    Nn = nrmn[:, :, :3] * 2.0 - 1.0
    ao = np.clip(aoimg[:, :, 0], 0, 1)
    edge = np.clip(1.0 - edimg[:, :, 0], 0, 1)
    edge = smooth((edge - 0.18) / 0.5)                                       # flats read 0, a bevel reads 1
    PIDN = assize.PID
    is_ = lambda n: pid == PIDN[n]

    blue, worn = lin("gun_blue"), lin("gun_worn")
    walnut, walnut_worn, brass = lin("walnut"), lin("walnut_worn"), lin("brass")
    dark = np.array([0.0030, 0.0036, 0.0052], dtype=np.float32)

    # ---------------------------------------------------------------- steel: where a hand or a holster goes
    k_edge = np.full(pid.shape, 0.45, dtype=np.float32)
    for name, k in (("barrel_oct", 0.6), ("barrel_round", 0.8), ("sight", 1.0), ("ejector_housing", 0.6), ("ejector_head", 1.0), ("base_pin", 0.8),
                    ("cylinder", 0.85), ("frame", 0.5), ("shield", 0.7), ("web", 0.1), ("gate", 1.0), ("screws", 0.6), ("guard", 0.85), ("straps", 0.9),
                    ("hammer", 0.95), ("trigger", 0.8)):
        k_edge[is_(name)] = k
    wear = edge * k_edge
    # the front 30 mm of the barrel has gone grey (holster and heat): full at the crown, gone by 160 mm
    front = smooth((Y - 158.0) / 26.0)
    muzzle = (is_("barrel_round") | is_("sight")) & (np.hypot(X, Z) > 6.4)
    wear = np.where(muzzle, np.maximum(wear, front), wear)
    wear = np.where(is_("ejector_housing") | is_("ejector_head"), np.maximum(wear, 0.55 * smooth((Y - 140.0) / 25.0)), wear)
    # the cylinder: the ridges between the flutes
    rc = np.hypot(X, Z - assize.CYL_Z)
    ang = np.degrees(np.arctan2(X, Z - assize.CYL_Z)) % 360.0
    side = is_("cylinder") & (np.abs(Nn[:, :, 1]) < 0.6)
    ridge = side & (rc > assize.CYL_R - 0.25) & (Y > -27.0)
    dflute = np.abs(((ang - 30.0) % 60.0 + 30.0) % 60.0 - 30.0)             # degrees from the nearest flute centre
    ridge_edge = smooth(1.0 - np.abs(dflute - assize.FLUTE_HALF) / 2.2)
    wear = np.where(ridge, np.maximum(wear, 0.22 + 0.7 * ridge_edge), wear)
    wear = np.where(side & (Y > -27.5), np.maximum(wear, 0.8 * ridge_edge * (rc > assize.CYL_R - 1.2)), wear)
    # the hammer spur: worn bright on top (the part is built at full cock: undo that to find the spur)
    piv = assize.HAMMER_PIVOT; c, sn = math.cos(-assize.HAMMER_COCK), math.sin(-assize.HAMMER_COCK)
    hy = piv[0] + (Y - piv[0]) * c - (Z - piv[1]) * sn; hz = piv[1] + (Y - piv[0]) * sn + (Z - piv[1]) * c
    ny = Nn[:, :, 1] * c - Nn[:, :, 2] * sn; nz = Nn[:, :, 1] * sn + Nn[:, :, 2] * c
    spur = is_("hammer") & (hy < -64.0) & (hz > 24.0)
    wear = np.where(spur, np.maximum(wear, 0.9 * smooth((nz + 0.55 * -ny - 0.25) / 0.5)), wear)
    # straps and guard: the faces a palm polishes
    wear = np.where(is_("straps") & (np.abs(Nn[:, :, 0]) < 0.5), np.maximum(wear, 0.38), wear)
    wear = np.where(is_("guard") & (Nn[:, :, 2] < -0.3) & (np.abs(Nn[:, :, 0]) < 0.5), np.maximum(wear, 0.3), wear)
    wear = np.where(is_("trigger") & (Nn[:, :, 1] > 0.5), np.maximum(wear, 0.5), wear)
    wear = np.clip(wear, 0.0, 1.0)

    rgb = blue[None, None, :] * (1.0 - wear[..., None]) + worn[None, None, :] * wear[..., None]
    gloss = 0.75 + 0.15 * wear
    occl = 0.5 + 0.5 * ao                                                     # cavity shade: quiet, keeps the blue deep
    rgb = rgb * occl[..., None]

    def paint(mask, colour, g=None, amount=1.0):
        m = np.clip(mask.astype(np.float32) * amount, 0, 1)[..., None]
        rgb[:] = rgb * (1 - m) + np.asarray(colour, dtype=np.float32)[None, None, :] * m
        if g is not None: gloss[:] = gloss * (1 - m[..., 0]) + g * m[..., 0]

    # ---------------------------------------------------------------- drawn detail on the steel
    # the bore, dark
    paint(is_("barrel_round") & (np.hypot(X, Z) < 6.0) & (Y < 189.2), dark, 0.0)
    # chamber mouths on the cylinder's two faces
    dch = np.full(pid.shape, 1e9, dtype=np.float32)
    for i in range(6):
        cx, cz = assize.chamber_centre(i)
        dch = np.minimum(dch, np.hypot(X - cx, Z - cz))
    face = is_("cylinder") & (np.abs(Nn[:, :, 1]) > 0.7) & (rc > 6.0)
    paint(face & (dch < 5.9), dark, 0.25)
    ring = face & (np.abs(dch - 6.15) < 0.28)
    paint(ring, worn, 0.9, 0.55)
    # bolt notches: a dark slot with a bright leading edge, in line with each flute, on the rear band
    arc = np.radians(dflute) * assize.CYL_R                                   # mm along the surface from the flute's centre line
    notch = side & (np.abs(Y + 35.2) < 2.3) & (arc < 1.7)
    paint(notch, dark * 2.0, 0.35)
    lead = side & (np.abs(Y + 35.2) < 2.3) & (arc >= 1.7) & (arc < 2.15)
    paint(lead, worn, 0.9, 0.7)
    # screw slots, not aligned (hand-turned)
    for (sy, sz, sa) in assize.SCREWS:
        ca, sa_ = math.cos(math.radians(sa)), math.sin(math.radians(sa))
        dy, dz = Y - sy, Z - sz
        across = np.abs(-dy * sa_ + dz * ca); r = np.hypot(dy, dz)
        head = is_("screws") & (r < 3.2) & (Nn[:, :, 0] < -0.6)
        paint(head & (across < 0.38) & (r < 2.15), dark * 1.5, 0.3)
        paint(head & (np.abs(across - 0.52) < 0.14) & (r < 2.15), worn, 0.9, 0.5)
    # the mark under the loading gate: stamped, 9 mm tall
    U = assize.MARK_H / 3.88
    mx = X - assize.MARK_C[0]; mz = Z - (assize.MARK_C[1] + 0.72 * U)
    sd = brand.mark_coverage(mx.astype(np.float32), mz.astype(np.float32), U)
    web = is_("web") & (Nn[:, :, 1] < -0.5)
    ink = np.clip(0.5 - sd / 0.09, 0, 1) * web
    paint(ink > 0, dark * 3.0, 0.45, ink)
    burr = np.clip(1.0 - np.abs(sd - 0.14) / 0.1, 0, 1) * web                # the raised lip a stamp throws up
    paint(burr > 0, worn, 0.9, burr * 0.45)

    # ---------------------------------------------------------------- walnut, grain along the grip
    wood = rid == assize.WALNUT
    ax = np.array(assize.GRIP_AXIS, dtype=np.float32)
    along = Y * ax[1] + Z * ax[2]; across = Y * (-ax[2]) + Z * ax[1]
    f = across + 0.9 * np.sin(along / 13.0 + 1.3 * np.sin(across / 5.5)) + 0.06 * np.abs(X)
    g1 = 0.5 + 0.5 * np.sin(2 * math.pi * f / 1.25 + 2.3 * np.sin(2 * math.pi * f / 7.7))
    g2 = 0.5 + 0.5 * np.sin(2 * math.pi * f / 5.9 + 1.1)
    line = smooth((g1 - 0.74) / 0.2)
    wcol = walnut[None, None, :] * (1.0 + 0.10 * (g2[..., None] - 0.5)) * (1.0 - 0.30 * line[..., None])
    heel = smooth(1.0 - np.hypot(Y + 146.0, Z + 113.0) / 30.0)
    thumb = smooth(1.0 - np.hypot(Y + 98.0, Z + 50.0) / 17.0) * (X < 0)
    swell = smooth((np.abs(X) - 12.6) / 2.4) * 0.35                           # the proud of the palm swell polishes
    rub = np.clip(np.maximum(np.maximum(heel, 0.7 * thumb), swell), 0, 1)
    wcol = wcol * (1 - rub[..., None]) + (walnut_worn[None, None, :] * (1.0 - 0.14 * line[..., None])) * rub[..., None]
    wcol = wcol * (0.6 + 0.4 * ao)[..., None]
    paint(wood, (0, 0, 0), 0.35); rgb[wood] = wcol[wood]
    # one hairline crack at the butt, along the grain, pinned
    ca = (-129.6, -123.0); cb = (-121.0, -100.0)
    dx_, dz_ = cb[0] - ca[0], cb[1] - ca[1]; Lc = math.hypot(dx_, dz_)
    t = np.clip(((Y - ca[0]) * dx_ + (Z - ca[1]) * dz_) / (Lc * Lc), 0, 1)
    dc = np.hypot(Y - (ca[0] + t * dx_), Z - (ca[1] + t * dz_) + 0.5 * np.sin(t * 9.0))
    crack = wood & (dc < 0.2 * (1.05 - t)) & (X < 0)
    paint(crack, walnut * 0.3, 0.2)

    # ---------------------------------------------------------------- brass: the pin and the six case heads
    br = rid == assize.BRASS
    bcol = brass[None, None, :] * (0.72 + 0.28 * ao)[..., None]
    paint(br, (0, 0, 0), 0.6); rgb[br] = bcol[br]
    head = is_("case_head") & (Nn[:, :, 1] < -0.6)
    paint(head & (dch < 2.35), brass * 0.5, 0.6)                              # the primer, darker
    paint(head & (np.abs(dch - 2.35) < 0.22), brass * 0.22, 0.6)             # its seat
    paint(head & (dch > 5.5), brass * 1.12, 0.6, 0.6)                         # a brighter rim

    # ---------------------------------------------------------------- down to size, sRGB, alpha = gloss
    full = np.concatenate([np.clip(rgb, 0, 1), np.clip(gloss, 0, 1)[..., None]], axis=2)
    full[~covered] = 0.0
    know = covered.copy()                                                     # spread every island into its gutter (and beyond)
    for _ in range(14 * SS):
        acc = np.zeros_like(full); cnt = np.zeros(know.shape, dtype=np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            acc += np.roll(full * know[..., None], (dy, dx), axis=(0, 1)); cnt += np.roll(know, (dy, dx), axis=(0, 1))
        new = ~know & (cnt > 0)
        full[new] = acc[new] / cnt[new][:, None]; know |= new
    full[~know] = np.concatenate([blue * 0.8, [0.75]])
    small = td.downsample(full, SS)
    outimg = np.empty((H, W, 4), dtype=np.float32)
    outimg[:, :, :3] = td.linear_to_srgb(small[:, :, :3]); outimg[:, :, 3] = small[:, :, 3]
    td.write_png(out, outimg)

    # ---------------------------------------------------------------- named points for the tests (pixel centres, 1024 x 512)
    flat = (edge < 0.02) & covered
    pts = {}
    for name, mask, target in (("blue", is_("frame") & flat & (wear < 0.02), (-0.0095, -0.060, -0.030)),
                               ("worn", is_("barrel_round") & (wear > 0.98), (0.0, 0.1872, 0.00885)),
                               ("walnut", wood & (np.abs(dc) > 3.0), (-0.0149, -0.105, -0.082)),
                               ("brass", head & (dch > 2.9) & (dch < 5.2), (assize.chamber_centre(2)[0] / 1000 + 0.004, -0.0438, assize.chamber_centre(2)[1] / 1000))):
        x, y = nearest(P, mask, target)
        pts[name] = {"px": [int(x // SS), int(y // SS)], "uv": [round((x // SS + 0.5) / W, 6), round(1.0 - (y // SS + 0.5) / H, 6)],
                     "gloss": {"blue": 0.75, "worn": 0.9, "walnut": 0.35, "brass": 0.6}[name]}
    bm = (rid == assize.STEEL) & covered & (wear < 0.05) & ~face & ~notch
    stats = {"density_px_per_m": round(float(density), 1), "size": [W, H],
             "blue_mean_srgb": [round(float(v), 2) for v in (td.linear_to_srgb(rgb[bm].mean(axis=0)) * 255.0)], "points": pts}
    td.write_json_if_changed(os.path.join(manifest.ROOT, "blender", "weapons", "tx_gun_points.json"), stats)
    # the gloss channel alone, for evidence (shots/art-weapons/tx_gun_gloss.png is made from the PNG's alpha by the tests)
    print(f"OK tx_gun -> {out}  density {density:.0f} px/m (weight 1)  blue mean sRGB {stats['blue_mean_srgb']}")


if __name__ == "__main__":
    try: main()
    except SystemExit: raise
    except BaseException:
        import traceback; traceback.print_exc(); sys.exit(1)
