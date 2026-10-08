"""The drawing of the revolver's texture set (helper of blender/tex/tx_gun.py and tx_gun_detail.py).

  passes()  the five data passes baked through the gun's unwrap at 2048 x 1024 (Cycles, emission): part / role ids,
            gun-space position, shading normal, a short-range cavity occlusion and a convex-edge mask. They depend only
            on blender/weapons/assize.py, so they are cached (blender/export/.cache/gun_passes_<hash>.npz) and the two
            texture scripts bake once between them.
  draw()    numpy draws from those passes:
              rgb    the albedo (linear): gun_blue; wear to gun_worn where a hand or a holster goes; walnut with its grain
                     along the grip; brass; the drawn detail (bolt notches, chamber mouths, screw slots, the stamp)
              gloss  blue 0.75, worn 0.9, walnut 0.35, brass 0.6
              height one channel, 0.5 = flat (ruling R14, tx_gun_detail): what the shader bends the steel's mirror with
                     and shades the hollows by
Release pass p0 (ruling R13: "surface detail, material breakup, wear, not a smooth casting"). Round 1 drew the steel as
one clean blue with wear on its edges ("no noise, no grunge"), and from 0.4 m the frame was a blank slab. Now:
  material breakup   the frame, the gate and the hammer are colour-case-hardened (the blue-black broken by slate and
                     tobacco clouds, as a Colt's frame is), the barrel, cylinder and straps stay blued, thinned to a
                     plum-grey where the holster and the hand have had them for eleven years
  tool marks         draw-filing along the barrel and the frame's flats, turning rings on the recoil shield and the
                     cylinder's faces, a sparse pitting
  joints             the seam of the grip frame under the frame and behind it, a milled panel on each flank, a
                     counterbore round every screw, the screw slots, the ejector's slot, a turned line round the cylinder
  the walnut         raised grain, pores, three dents
"""
import sys, os, math, hashlib
import numpy as np
import bpy
from lib import texdraw as td, manifest, scene, mesh, vcol, brand, bake
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




def _key():
    h = hashlib.sha1()
    with open(os.path.join(manifest.ROOT, "blender", "weapons", "assize.py"), "rb") as f: h.update(f.read())
    h.update(f"{W}x{H}x{SS}:v2".encode())
    return h.hexdigest()[:16]


def passes():
    """{'role', 'pos', 'nrm', 'ao', 'edge'} (BH, BW, 4) float32, row 0 = top, and 'density' (px per metre at weight 1)."""
    cache = os.path.join(manifest.ROOT, "blender", "export", ".cache", f"gun_passes_{_key()}.npz")
    if os.path.isfile(cache):
        z = np.load(cache)
        print(f"gun_tex: passes from {cache}")
        return {k: z[k] for k in z.files}
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
    px = np.zeros(BW * BH * 4, dtype=np.float32)
    out = {}
    for kind, n in (("role", 1), ("pos", 4), ("nrm", 4), ("ao", 48), ("edge", 48)):
        img.pixels.foreach_set(px)
        out[kind] = bake_pass(parts, mat, img, kind, n).astype(np.float16 if kind in ("ao", "edge", "role") else np.float32)
    out["density"] = np.asarray([density], dtype=np.float32)
    os.makedirs(os.path.dirname(cache), exist_ok=True)
    for old in os.listdir(os.path.dirname(cache)):
        if old.startswith("gun_passes_"): os.remove(os.path.join(os.path.dirname(cache), old))
    np.savez_compressed(cache, **out)
    return out


def _hash3(ix, iy, iz, seed):
    h = (ix.astype(np.uint32) * np.uint32(374761393) + iy.astype(np.uint32) * np.uint32(668265263) + iz.astype(np.uint32) * np.uint32(2147483647) + np.uint32(seed * 144665 + 7)) & np.uint32(0xFFFFFFFF)
    h = (h ^ (h >> np.uint32(13))) * np.uint32(1274126177)
    h = h ^ (h >> np.uint32(16))
    return (h & np.uint32(0xFFFFFF)).astype(np.float32) / np.float32(0xFFFFFF)


def noise3(x, y, z, seed=1):
    """Value noise in 0..1 at the points (x, y, z) (lattice spacing 1)."""
    x0 = np.floor(x); y0 = np.floor(y); z0 = np.floor(z)
    fx = x - x0; fy = y - y0; fz = z - z0
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz)
    ix = x0.astype(np.int64); iy = y0.astype(np.int64); iz = z0.astype(np.int64)
    out = np.zeros(x.shape, dtype=np.float32)
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (fx if dx else 1 - fx) * (fy if dy else 1 - fy) * (fz if dz else 1 - fz)
                out += w.astype(np.float32) * _hash3(ix + dx, iy + dy, iz + dz, seed)
    return out


def fbm3(x, y, z, octaves=3, seed=1):
    a = np.zeros(x.shape, dtype=np.float32); amp = 1.0; tot = 0.0
    for o in range(octaves):
        k = float(1 << o)
        a += amp * noise3(x * k, y * k, z * k, seed + 17 * o); tot += amp; amp *= 0.5
    return a / tot


def stroke(d, half, soft):
    return np.clip(1.0 - (np.abs(d) - half) / soft, 0.0, 1.0)


def seg_dist(Y, Z, pts):
    """Distance (mm) in the Y-Z plane to a polyline [(y, z)]."""
    d = np.full(Y.shape, 1e9, dtype=np.float32)
    for (a, b) in zip(pts[:-1], pts[1:]):
        vy, vz = b[0] - a[0], b[1] - a[1]; L2 = vy * vy + vz * vz
        t = np.clip(((Y - a[0]) * vy + (Z - a[1]) * vz) / L2, 0, 1)
        d = np.minimum(d, np.hypot(Y - (a[0] + t * vy), Z - (a[1] + t * vz)))
    return d


def draw():
    """{'rgb' (BH, BW, 3) linear, 'gloss', 'height', 'covered', 'density', 'points', 'blue_mean'} at the working size."""
    ps = passes()
    role, posn, nrmn, aoimg, edimg = (ps[k].astype(np.float32) for k in ("role", "pos", "nrm", "ao", "edge"))
    density = float(ps["density"][0])
    covered = role[:, :, 3] > 0.5
    rid = np.rint(role[:, :, 0] * 8.0).astype(np.int32)
    pid = np.rint(role[:, :, 1] * 32.0).astype(np.int32)
    P = posn[:, :, :3] * (POS_MAX - POS_MIN)[None, None, :] + POS_MIN[None, None, :]
    X, Y, Z = P[:, :, 0] * 1000.0, P[:, :, 1] * 1000.0, P[:, :, 2] * 1000.0          # millimetres, gun space
    Nn = nrmn[:, :, :3] * 2.0 - 1.0
    ao = np.clip(aoimg[:, :, 0], 0, 1)
    edge = np.clip(1.0 - edimg[:, :, 0], 0, 1)
    edge = smooth((edge - 0.12) / 0.40)                                      # flats read 0, a bevel reads 1 (pass i1: a wider worn edge, 0.18 / 0.5 before)
    PIDN = assize.PID
    is_ = lambda n: pid == PIDN[n]

    blue, worn = lin("gun_blue"), lin("gun_worn")
    # pass i1 (the reviewers: "one glossy cobalt colour", "no wood grip"): the blue is a blue-BLACK (the palette's cell held
    # 35 % toward its own grey and a third darker: the shader tints what the steel mirrors with this hue), the worn steel a
    # touch brighter (the shader reads a bright texel as bare metal and lets it mirror three times as much), and the
    # walnut is an oiled red-brown the eye can tell from the steel in every mood
    blue = (blue * 0.65 + blue.mean() * 0.35) * 0.60     # (pass i3: 0.625; the long edges are part-worn now and count in the mean)        # (pass i2: 0.64; the seam and panel lines are whole lines now and lifted the mean)
    worn = worn * 1.15
    walnut, walnut_worn, brass = lin("walnut") * np.array([2.3, 1.9, 1.5], dtype=np.float32), lin("walnut_worn") * np.array([1.9, 1.6, 1.3], dtype=np.float32), lin("brass")
    dark = np.array([0.0030, 0.0036, 0.0052], dtype=np.float32)

    # ---------------------------------------------------------------- steel: where a hand or a holster goes
    k_edge = np.full(pid.shape, 0.45, dtype=np.float32)
    # pass i3 (both visual reviewers: "the top rib reads as saw teeth", "teeth along the ejector housing in every panel"):
    # a worn edge is two texels wide at this sheet's density, and the shader lets a bright texel mirror three times as
    # much: along every long straight edge (the top strap, the barrel's flats, the housing, the straps) the bilinear
    # steps of a full-bright line drew a row of lit dashes. Those edges keep a third to a half of their wear (a soft
    # lighter line); the short and round ones (cylinder, shield, hammer, sight) keep theirs.
    for name, k in (("barrel_oct", 0.30), ("barrel_round", 0.55), ("sight", 1.0), ("ejector_housing", 0.22), ("ejector_head", 0.8), ("base_pin", 0.5),
                    ("cylinder", 1.0), ("frame", 0.48), ("shield", 0.9), ("web", 0.1), ("gate", 0.9), ("screws", 0.9), ("guard", 0.6), ("straps", 0.55),
                    ("hammer", 0.85), ("trigger", 0.8)):
        k_edge[is_(name)] = k
    wear = edge * k_edge
    # the front 30 mm of the barrel has gone grey (holster and heat): full at the crown, gone by 160 mm
    # pass i3 (both visual reviewers: "the muzzle crown carries a hot highlight that reads as a glowing tip in every
    # mood"): the whole last 30 mm was bare bright steel, and bare steel mirrors three times as much. The holster has
    # thinned the blue there (a third toward grey); only the crown's own lip, the last 2 mm, is worn bright.
    front = np.maximum(0.34 * smooth((Y - 150.0) / 32.0), smooth((Y - 186.5) / 1.1))
    muzzle = (is_("barrel_round") | is_("sight")) & (np.hypot(X, Z) > 6.4)
    wear = np.where(muzzle, np.maximum(wear, front), wear)
    wear = np.where(is_("ejector_housing") | is_("ejector_head"), np.maximum(wear, 0.22 * smooth((Y - 140.0) / 25.0)), wear)
    # the cylinder: the ridges between the flutes
    rc = np.hypot(X, Z - assize.CYL_Z)
    ang = np.degrees(np.arctan2(X, Z - assize.CYL_Z)) % 360.0
    side = is_("cylinder") & (np.abs(Nn[:, :, 1]) < 0.6)
    ridge = side & (rc > assize.CYL_R - 0.25) & (Y > -27.0)
    dflute = np.abs(((ang - 30.0) % 60.0 + 30.0) % 60.0 - 30.0)             # degrees from the nearest flute centre
    ridge_edge = smooth(1.0 - np.abs(dflute - assize.FLUTE_HALF) / 2.2)
    wear = np.where(ridge, np.maximum(wear, 0.10 + 0.7 * ridge_edge), wear)                 # (pass i3: the lands 0.22 -> 0.10: with the holster rub the whole cylinder drew as pale silver at dusk)
    wear = np.where(side & (Y > -27.5), np.maximum(wear, 0.8 * ridge_edge * (rc > assize.CYL_R - 1.2)), wear)
    # the hammer spur: worn bright on top (the part is built at full cock: undo that to find the spur)
    piv = assize.HAMMER_PIVOT; c, sn = math.cos(-assize.HAMMER_COCK), math.sin(-assize.HAMMER_COCK)
    hy = piv[0] + (Y - piv[0]) * c - (Z - piv[1]) * sn; hz = piv[1] + (Y - piv[0]) * sn + (Z - piv[1]) * c
    ny = Nn[:, :, 1] * c - Nn[:, :, 2] * sn; nz = Nn[:, :, 1] * sn + Nn[:, :, 2] * c
    spur = is_("hammer") & (hy < -66.0) & (hz > 17.5)                      # (pass i2: was hz > 24, above the spur pass i1 lowered: nothing was worn)
    wear = np.where(spur, np.maximum(wear, 0.5 * smooth((nz + 0.55 * -ny - 0.25) / 0.5)), wear)
    # straps and guard: the faces a palm polishes
    wear = np.where(is_("straps") & (np.abs(Nn[:, :, 0]) < 0.5), np.maximum(wear, 0.38), wear)
    wear = np.where(is_("guard") & (Nn[:, :, 2] < -0.3) & (np.abs(Nn[:, :, 0]) < 0.5), np.maximum(wear, 0.3), wear)
    wear = np.where(is_("trigger") & (Nn[:, :, 1] > 0.5), np.maximum(wear, 0.5), wear)
    # pass i1: holster rub. Eleven years in leather thin the blue in soft patches on what stands proud: the barrel's two
    # sides, the lands of the cylinder, the shield's face and rim, the top strap's shoulders, the guard's bow
    rub_n = smooth((fbm3(X / 13.0 + 2.0, Y / 30.0, Z / 13.0 + 5.0, 3, 71) - 0.44) / 0.22)
    rub_f = fbm3(X / 2.2, Y / 9.0, Z / 2.2, 2, 73)
    rubk = np.zeros(pid.shape, dtype=np.float32)
    rubk = np.where(is_("barrel_oct") | is_("barrel_round"), 0.50 * smooth((np.abs(Nn[:, :, 0]) - 0.35) / 0.4) * smooth((Y - 30.0) / 40.0), rubk)
    rubk = np.where(side & (rc > assize.CYL_R - 0.4), 0.36, rubk)
    rubk = np.where(is_("shield") | is_("gate"), 0.50, rubk)
    rubk = np.where(is_("frame") & (Nn[:, :, 2] > 0.35), 0.45, rubk)
    rubk = np.where(is_("guard") & (Nn[:, :, 2] < -0.3), 0.55, rubk)
    rubk = np.where(is_("ejector_housing"), 0.45 * smooth((Nn[:, :, 0] - 0.2) / 0.5), rubk)
    wear = np.maximum(wear, rubk * rub_n * (0.45 + 0.75 * rub_f))
    # pass i2: nothing rubs the walls of the cylinder window; its ledge under the cylinder was drawn worn bright (an edge
    # either side and the holster rub of every upward face), and bright steel mirrors three times as much: the "cyan-white
    # stripe on the lower frame" of every mood
    inwin = is_("frame") & (np.abs(X) < 9.3) & (Y > -44.9) & (Y < 0.3) & (Z > -35.3) & (Z < 8.9) & (np.abs(Nn[:, :, 0]) < 0.5)
    wear = np.where(inwin, 0.0, wear)
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


    # ================================================================ release pass p0: breakup, tool marks, joints
    steel = (rid == assize.STEEL) & covered
    Nx, Ny, Nz = Nn[:, :, 0], Nn[:, :, 1], Nn[:, :, 2]
    hgt = np.full(pid.shape, 0.5, dtype=np.float32)
    n_lo = fbm3(X / 22.0, Y / 22.0, Z / 22.0, 3, 3)                           # clouds 2 cm across
    n_mid = fbm3(X / 7.0, Y / 7.0, Z / 7.0, 3, 5)
    n_hi = noise3(X / 0.9, Y / 0.9, Z / 0.9, 9)
    hard = (is_("frame") | is_("shield") | is_("gate") | is_("hammer") | is_("web")) & steel       # the case-hardened parts
    blued = steel & ~hard
    # --- colour case hardening: clouds of slate and tobacco in the blue-black, kept dark (it still reads as the gun's blue in shade)
    slate = np.array([0.026, 0.034, 0.050], dtype=np.float32); tobacco = np.array([0.046, 0.027, 0.016], dtype=np.float32); straw = np.array([0.060, 0.047, 0.026], dtype=np.float32)   # pass i1: about twice as light (the clouds did not survive the shader)
    c1 = smooth((n_lo - 0.42) / 0.22) * (0.55 + 0.45 * n_mid); c2 = smooth((fbm3(X / 15.0 + 9.0, Y / 15.0, Z / 15.0 + 4.0, 3, 21) - 0.50) / 0.18)
    c3 = smooth((n_mid - 0.62) / 0.12) * c2
    case = rgb.copy()
    case = case * (1 - 0.70 * c1[..., None]) + slate[None, None, :] * 0.70 * c1[..., None] * occl[..., None]
    case = case * (1 - 0.55 * c2[..., None]) + tobacco[None, None, :] * 0.55 * c2[..., None] * occl[..., None]
    case = case * (1 - 0.55 * c3[..., None]) + straw[None, None, :] * 0.55 * c3[..., None] * occl[..., None]
    keep = np.clip(wear * 1.4, 0, 1)[..., None]                                # worn edges stay bright steel
    rgb[hard] = (case * (1 - keep) + rgb * keep)[hard]
    # --- the blued parts: thinned to plum-grey in patches where the holster and the hand have had them
    plum = np.array([0.026, 0.021, 0.027], dtype=np.float32)
    thin = smooth((n_lo - 0.50) / 0.25) * (0.35 + 0.65 * smooth((np.abs(Nx) - 0.2) / 0.6)) * 0.55
    thin = np.where(is_("straps") | is_("guard"), np.maximum(thin, 0.35 * n_mid), thin)
    k = (thin * (1 - np.clip(wear * 1.4, 0, 1)))[..., None]
    rgb[blued] = (rgb * (1 - k) + plum[None, None, :] * occl[..., None] * k)[blued]
    rgb[steel] *= (0.70 + 0.28 * n_mid)[steel][:, None]                       # a breath of unevenness everywhere
    # --- edge wear is ragged, not a ruled line; fine scratches along the gun on the flats a holster rubs
    # pass i2 (the visual reviewer: "the underside of the barrel shows a row of regular teeth ... reads as a saw"): the
    # raggedness was a 0.9 mm value noise times a 7 mm one, both on lattices that lie ALONG the barrel, so a worn edge that
    # runs along it (the octagon's lower flats, the ejector housing) was cut into dashes at an even 7 mm, and the shader,
    # which lets a bright texel mirror three times as much, drew them as a row of lit teeth. The breakup is now a soft
    # one on a lattice turned out of the gun's axes (no edge runs along it), a fifth deep instead of a half
    rx = 0.62 * X + 0.55 * Y + 0.56 * Z; ry = -0.68 * X + 0.73 * Y + 0.04 * Z; rz = -0.39 * X - 0.40 * Y + 0.83 * Z
    ragged = np.clip(wear * (0.80 + 0.28 * fbm3(rx / 2.9, ry / 2.9, rz / 2.9, 3, 77)), 0, 1)
    # ... and the edges nothing rubs (what looks down: the barrel's lower flats, the housing's belly) keep most of their blue
    under = smooth((-Nz - 0.15) / 0.5) * (is_("barrel_oct") | is_("ejector_housing") | is_("base_pin")).astype(np.float32)
    scr = noise3(X / 0.35, Y / 14.0, Z / 0.35, 31)
    scratch = smooth((scr - 0.86) / 0.06) * smooth((fbm3(X / 9.0, Y / 30.0, Z / 9.0, 2, 33) - 0.45) / 0.2) * (np.abs(Ny) < 0.5)
    scratch *= (is_("barrel_oct") | is_("barrel_round") | is_("cylinder") | is_("frame") | is_("ejector_housing")).astype(np.float32)
    add = np.clip(ragged - wear, -1, 0) * 0.6 + 0.30 * scratch
    rgb[steel] = (rgb + (worn[None, None, :] * occl[..., None] - rgb) * np.clip(add, -0.0, 1.0)[..., None])[steel]
    rgb[steel] = (rgb * (1.0 + np.clip(ragged - wear, -1, 0) * 0.35)[..., None])[steel]
    k_un = (0.75 * under * np.clip(wear, 0, 1))[..., None]
    rgb[steel] = (rgb * (1 - k_un) + blue[None, None, :] * occl[..., None] * (0.70 + 0.28 * n_mid)[..., None] * k_un)[steel]
    gloss[steel] = (gloss - 0.12 * k_un[..., 0])[steel]
    # (pass i1: the case colours are a satin, not the blue's polish: a cloud takes up to 0.035 off the gloss)
    gloss[inwin] = 0.5
    gloss[steel] = np.clip(gloss + 0.03 * scratch - 0.035 * (np.maximum(np.maximum(c1, c2), c3) * hard), 0.0, 1.0)[steel]
    # --- tool marks (height): draw-filing along Y on the barrel, the frame's flats and the straps; turning rings on the
    # shield, the gate and the cylinder's faces and band; pitting
    filing = (noise3(X / 0.85, Y / 30.0, Z / 0.85, 41) - 0.5) * 2.0          # (pass i2: 0.45 mm marks were under two pixels of the idle frame: a moire on the flank)
    rings = np.sin(2.0 * math.pi * rc / 1.7 + 3.0 * n_mid)
    turned = ((is_("shield") | is_("gate")) & (Ny < -0.45)) | face
    flats = (np.abs(Nx) > 0.85) | is_("barrel_oct") | is_("barrel_round")           # filed flats and the barrel only: on a rounded hump the marks drew stripes
    hgt += np.where(turned, 0.010 * rings, 0.0045 * filing * flats * (np.abs(Ny) < 0.6) * ~is_("hammer")) * steel       # (pass i2: not on the hammer, whose flanks are polished: turned 48 degrees the marks were a diagonal hatch)
    cyl_side = side & ~notch
    hgt += 0.006 * np.sin(2.0 * math.pi * Y / 1.5) * cyl_side * (rc > assize.CYL_R - 0.3)
    pit = smooth((noise3(X / 0.55 + 3.0, Y / 0.55, Z / 0.55 + 7.0, 51) - 0.80) / 0.10) * smooth((n_lo - 0.35) / 0.3)
    hgt -= 0.03 * pit * steel; rgb[steel] *= (1.0 - 0.22 * pit)[steel][:, None]
    hgt -= 0.07 * (1.0 - ao) * steel                                           # every inside corner sits a little low: the shader shades it
    # --- joints on the frame's two flanks (|Nx| high): the grip frame's seam, a milled panel, counterbores
    flank = is_("frame") & (np.abs(Nx) > 0.85)
    seam1 = seg_dist(Y, Z, [(14.0, -29.0), (9.0, -35.0), (4.0, -38.0), (-2.0, -38.8), (-50.0, -40.2), (-73.5, -43.4)])
    seam2 = seg_dist(Y, Z, [(-99.6, -21.0), (-96.0, -30.0), (-86.0, -37.5), (-73.5, -43.4)])
    for sd_ in (seam1, seam2):
        g = stroke(sd_, 0.16, 0.30) * flank
        hgt -= 0.34 * g; rgb *= (1.0 - 0.55 * g)[..., None]; gloss[:] = gloss - 0.2 * g
        lip = stroke(sd_ - 0.75, 0.2, 0.4) * flank
        rgb[:] = rgb + (worn[None, None, :] - rgb) * (0.17 * lip * (0.75 + 0.5 * n_lo))[..., None]      # (pass i2: a line, not a row of dots: n_hi cut it every 0.9 mm)
    # the milled panel behind the cylinder: a flat 0.3 mm proud with a bevelled border (the border is all the eye gets: a line of light)
    panel = td.sd_polygon(Y, Z, [(-49.5, 10.5), (-62.0, 9.8), (-76.0, 5.6), (-88.0, -2.0), (-95.0, -12.0), (-96.4, -22.0), (-93.0, -29.5), (-84.0, -34.2), (-74.0, -39.0), (-52.0, -36.6), (-49.5, -30.0)])
    step = smooth(-panel / 1.1) * flank
    hgt += 0.16 * step
    bord = stroke(panel, 0.25, 0.5) * flank
    rgb[:] = rgb + (worn[None, None, :] * occl[..., None] - rgb) * (0.21 * bord * (0.70 + 0.6 * n_lo))[..., None]   # (pass i2: as the seam's lip)
    gloss[:] = gloss + 0.05 * bord
    # screws: a counterbore in the frame round each, a domed head, a cut slot; the two lower ones are pins on the right
    for (sy, sz, sa) in assize.SCREWS:
        r_ = np.hypot(Y - sy, Z - sz)
        bore = stroke(r_ - 3.25, 0.30, 0.35) * flank * (Nx < 0)
        hgt -= 0.30 * bore; rgb *= (1.0 - 0.5 * bore)[..., None]
        pinr = stroke(r_ - 1.6, 0.14, 0.3) * flank * (Nx > 0)                    # the same screws' ends, flush, on the gate side
        hgt -= 0.24 * pinr; rgb *= (1.0 - 0.45 * pinr)[..., None]
        ca, sa_ = math.cos(math.radians(sa)), math.sin(math.radians(sa))
        acr = np.abs(-(Y - sy) * sa_ + (Z - sz) * ca)
        shead = is_("screws") & (r_ < 3.2) & (Nx < -0.6)
        hgt += np.where(shead, 0.10 * (1.0 - (r_ / 2.4) ** 2), 0.0)
        hgt -= 0.45 * (shead & (acr < 0.40) & (r_ < 2.2))
    # pass i2: the ejector housing's screw (assize.ejector): a slot across its domed head
    ecx, ecz = assize.EJ_C[0] + 0.80 * 5.0, assize.EJ_C[1] - 0.60 * 5.0
    ew = (X - ecx) * 0.6 + (Z - ecz) * 0.8; er = np.hypot(Y - 31.0, ew)
    ehead = is_("screws") & (Y > 20.0) & (er < 1.9)
    hgt -= 0.45 * (ehead & (np.abs(ew) < 0.36)); rgb[ehead & (np.abs(ew) < 0.36)] = dark * 1.5; gloss[ehead & (np.abs(ew) < 0.36)] = 0.3
    # pass i2: the hammer's thumb-piece is chequered (it was five ribs of geometry: a comb on the skyline): fine diamonds
    # 1.5 mm across cut into the pad's top, shallow; the cut steel is matt and a little darker than the polished flanks
    pad = is_("hammer") & (hy < -68.5) & (hy > -82.5) & (hz > 18.0) & ((nz - 0.25 * ny) > 0.55) & (np.abs(X) < 3.9)
    kn = 0.5 + 0.5 * np.sin(2.0 * math.pi * (X + hy) / 1.5) * np.sin(2.0 * math.pi * (X - hy) / 1.5)
    hgt += np.where(pad, 0.11 * (kn - 0.62), 0.0)
    rgb[pad] = (rgb * (0.72 + 0.34 * kn)[..., None])[pad]; gloss[pad] = (gloss - 0.10 + 0.06 * kn)[pad]
    # the barrel: a turned line at the shoulder, two at the crown; the ejector housing's slot
    for y0 in (112.6, 184.0, 186.2):
        g = stroke(Y - y0, 0.18, 0.3) * is_("barrel_round") * (np.hypot(X, Z) > 6.4)
        hgt -= 0.22 * g; rgb *= (1.0 - 0.35 * g)[..., None]
    ea = np.degrees(np.arctan2(X - assize.EJ_C[0], Z - assize.EJ_C[1])) % 360.0
    slot = is_("ejector_housing") & (np.abs(((ea - 100.0 + 180.0) % 360.0) - 180.0) * math.pi / 180.0 * 5.2 < 0.9) & (Y > 52.0) & (Y < 150.0)
    hgt -= 0.20 * slot                                                         # (pass i3: cut in the height only; drawn dark it was a dashed line under the barrel at the idle frame's scale)
    # the cylinder: the bolt notches are cut in, each with its lead; a turned line behind the flutes; the chambers are holes
    hgt -= 0.45 * notch + 0.5 * (face & (dch < 5.9))
    lead_in = side & (np.abs(Y + 35.2) < 1.6) & (arc >= 1.7) & (arc < 6.5)
    hgt -= np.where(lead_in, 0.22 * (1.0 - (arc - 1.7) / 4.8), 0.0)
    g = stroke(Y + 29.4, 0.16, 0.3) * side * (rc > assize.CYL_R - 0.4)
    hgt -= 0.2 * g; rgb *= (1.0 - 0.35 * g)[..., None]
    # the stamp is struck in
    hgt -= 0.4 * np.clip(ink, 0, 1) - 0.12 * np.clip(burr, 0, 1)
    # the hammer's flanks: polished in arcs about its screw
    hr = np.hypot(Y - assize.HAMMER_PIVOT[0], Z - assize.HAMMER_PIVOT[1])
    hgt += 0.0022 * np.sin(2.0 * math.pi * hr / 2.6) * (is_("hammer") & (np.abs(Nx) > 0.8))     # (pass i2: 0.008 at 1.6 mm drew a ridged plate at the idle frame's scale)
    # --- the walnut: raised grain, pores, three dents; the oil has gone from the worn places
    pores = smooth((noise3(across / 0.5, along / 2.6, X / 3.0, 61) - 0.72) / 0.12)
    hw = 0.5 - 0.05 * line - 0.05 * pores + 0.02 * (g2 - 0.5)
    for (dy_, dz_, rr) in ((-118.0, -84.0, 2.6), (-104.0, -112.0, 1.9), (-136.0, -104.0, 2.2)):
        dent = smooth(1.0 - np.hypot(Y - dy_, Z - dz_) / rr) * (X < 0)
        hw -= 0.3 * dent; rgb[wood] = (rgb * (1.0 - 0.25 * dent[..., None]))[wood]
    hgt[wood] = hw[wood]
    rgb[wood] = (rgb * (1.0 - 0.22 * pores * (1 - rub))[..., None])[wood]
    gloss[wood] = (0.35 + 0.05 * rub - 0.04 * pores)[wood]
    # brass: the primer sits in a ring
    hgt -= 0.3 * (head & (np.abs(dch - 2.35) < 0.3)) - 0.06 * (head & (dch < 2.1))
    hgt = np.clip(hgt, 0.0, 1.0)
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
    bm_ = (rid == assize.STEEL) & covered & (wear < 0.05) & ~face & ~notch
    stats = {"density_px_per_m": round(float(density), 1), "size": [W, H],
             "blue_mean_srgb": [round(float(v), 2) for v in (td.linear_to_srgb(rgb[bm_].mean(axis=0)) * 255.0)], "points": pts}
    return {"rgb": rgb, "gloss": gloss, "height": hgt, "covered": covered, "density": density, "points": pts,
            "blue_mean": [round(float(v), 2) for v in (td.linear_to_srgb(rgb[bm_].mean(axis=0)) * 255.0)]}


def spread(full, covered, fill):
    """Spread every island into its gutter (and beyond), then box-filter down to W x H."""
    know = covered.copy(); full = full.copy(); full[~covered] = 0.0
    for _ in range(14 * SS):
        acc = np.zeros_like(full); cnt = np.zeros(know.shape, dtype=np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            acc += np.roll(full * know[..., None], (dy, dx), axis=(0, 1)); cnt += np.roll(know, (dy, dx), axis=(0, 1))
        new = ~know & (cnt > 0)
        full[new] = acc[new] / cnt[new][:, None]; know |= new
    full[~know] = np.asarray(fill, dtype=np.float32)
    return td.downsample(full, SS)
