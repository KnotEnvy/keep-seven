"""The lift cage, built from one set of parts on the 1.2 m module for both lifts (ia_lift_cage: interior 6 x 3.5 x 6;
ia_proving_lift_cage: interior 4 x 3.5 x 4 with a 3 x 3 gate). Never scaled: `build_cage` lays the same posts, beams,
rails, grille tiles and gate lattice out to the size it is given.

Pivot: floor centre. The gate is on the asset's front (+Z game, Blender -Y), its bone `gate` at the sill centre
(0, 0, D/2 - 0.05) game. The gate is a scissor lattice hung from the header: `gate_open` folds it upward (the bone's
height scale goes to 7 %: the diamonds flatten as a real lattice's do) and parks the folded bundle above the opening,
in front of the header beam, so the whole opening is clear. Walls and roof panel are grille tiles of tx_mask on
m_mask (alpha-tested, drawn two-sided); the steel is m_prop; `gate_lamp` is the lamp bar on the header."""
import math
import numpy as np
from mathutils import Vector, Matrix
from lib import scene, mesh, uv, material, vcol, rig, anim, export, zone, brand, manifest
import mech_common as mc

H = 3.5
POST = 0.12
FOLD = 0.07


def lattice(parts, gw, gh, y, cw, chh, bar=0.07):
    """Diamond lattice strips in the plane y, over x -gw/2..gw/2, z 0..gh. Two faces a strip (front and back)."""
    x0, x1 = -gw / 2, gw / 2
    nx = int(round(gw / cw)); nz = int(round(gh / chh)); slope = chh / cw
    for sgn in (1, -1):
        for k in range(-nz + 1, nx):
            # the line z = slope * (sgn * x - c): clip to the rectangle
            pts = []
            xa = x0 + k * cw if sgn > 0 else x1 - k * cw
            # walk from (xa, 0) upward in direction (sgn, slope)
            t0 = 0.0; t1 = gh / slope
            xs0 = xa; xs1 = xa + sgn * t1
            # clip in x
            def clipt(xv): return (xv - xa) / sgn
            ta, tb = sorted((clipt(x0), clipt(x1)))
            t0 = max(t0, ta); t1 = min(t1, tb)
            if t1 - t0 < 0.05: continue
            a = Vector((xa + sgn * t0, y, slope * t0)); b = Vector((xa + sgn * t1, y, slope * t1))
            d = (b - a).normalized(); nrm = Vector((-d.z, 0, d.x)) * (bar / 2)
            q = [a - nrm, b - nrm, b + nrm, a + nrm]
            yo = 0.004 * sgn
            f = [(p.x, p.y + yo, p.z) for p in q]
            parts.append(mc.quad("lat", f if (Vector(f[1]) - Vector(f[0])).cross(Vector(f[3]) - Vector(f[0])).y < 0 else f[::-1], "steel_dark"))
            g = [(p.x, p.y + yo + 0.012, p.z) for p in q]
            parts.append(mc.quad("lat_b", g if (Vector(g[1]) - Vector(g[0])).cross(Vector(g[3]) - Vector(g[0])).y > 0 else g[::-1], "steel_dark"))


def build_cage(asset, args, W, D, gate_w, gate_h, control=None, number="4-140"):
    hw, hd = W / 2, D / 2
    roomy = manifest.asset(asset)["triBudget"] >= 850                              # the hall cage has triangles for real loops
    static, gate, over = [], [], []
    dec = mc.Decals()
    # ---- floor plate on the 1.2 m module (seams are dark overlay lines), kerb
    floor = mc.slab("floor", (W + 0.3, D + 0.3, 0.10), (0, 0, -0.05), "steel", drop=("z-",))
    # the plate's only vertices would be its corners, under the posts: its vertex AO would be black from end to end.
    # Loops on the 1.2 m module (hall cage) or through the centre (proving cage: 18 triangles to spare) let the bake see
    # the open floor
    if roomy: mesh.tessellate_max_edge(floor, 1.7)
    else: mesh.bisect(floor, (0, 0, 0), (1, 0, 0)); mesh.bisect(floor, (0, 0, 0), (0, 1, 0))
    static.append(floor)
    for k in range(-2, 3):
        s = k * 1.2 + 0.6 if (W / 1.2) % 2 < 0.5 or True else k * 1.2
        if abs(s) < hw - 0.05:
            over.append(mc.quad("seam_x", [(s - 0.017, -hd, 0.0015), (s + 0.017, -hd, 0.0015), (s + 0.017, hd, 0.0015), (s - 0.017, hd, 0.0015)], "steel_dark"))
        if abs(s) < hd - 0.05:
            over.append(mc.quad("seam_y", [(-hw, s - 0.017, 0.0015), (hw, s - 0.017, 0.0015), (hw, s + 0.017, 0.0015), (-hw, s + 0.017, 0.0015)], "steel_dark"))
    # ---- frame: corner posts, mid posts on the side and back walls, top beams, the livery rail at 1.2 m, kick plates
    px, py = hw + POST / 2, hd + POST / 2
    for sx in (-1, 1):
        for sy in (-1, 1):
            static.append(mc.slab("post", (POST, POST, H + 0.14), (sx * px, sy * py, (H + 0.14) / 2), "steel", drop=("z-", "z+")))
    mids = [(-px, 0, 0), (px, 0, 0), (0, py, 1)]
    for (x, y, ax) in mids:
        static.append(mc.slab("mid_post", (0.08, 0.08, H), (x, y, H / 2), "steel", drop=("z-", "z+")))
    for sy in (-1, 1):
        static.append(mc.slab("beam_x", (W + 2 * POST, POST + 0.02, 0.14), (0, sy * py, H + 0.07), "steel", drop=("x-", "x+")))
    for sx in (-1, 1):
        static.append(mc.slab("beam_y", (POST + 0.02, D, 0.14), (sx * px, 0, H + 0.07), "steel", drop=("y-", "y+")))
    walls = [("x", -1), ("x", 1), ("y", 1)]
    for axis, s in walls:
        if axis == "x":
            static.append(mc.slab("rail", (0.05, D, 0.10), (s * (hw + 0.02), 0, 1.2), "livery", drop=("y-", "y+", "x+" if s > 0 else "x-")))
            static.append(mc.slab("kick", (0.03, D, 0.30), (s * (hw + 0.015), 0, 0.15), "steel", drop=("y-", "y+", "z-", "x+" if s > 0 else "x-")))
        else:
            static.append(mc.slab("rail", (W, 0.05, 0.10), (0, s * (hd + 0.02), 1.2), "livery", drop=("x-", "x+", "y+")))
            static.append(mc.slab("kick", (W, 0.03, 0.30), (0, s * (hd + 0.015), 0.15), "steel", drop=("x-", "x+", "z-", "y+")))
    # ---- roof: a plate with a framed grille hatch; two cross beams
    roof = mc.slab("roof", (W + 0.1, D + 0.1, 0.04), (0, 0, H + 0.16), "steel_dark", drop=("x-", "x+", "y-", "y+"))
    if roomy: mesh.tessellate_max_edge(roof, 3.2)
    static.append(roof)
    for y in (-hd / 2, hd / 2):
        static.append(mc.slab("roof_beam", (W, 0.10, 0.10), (0, y, H + 0.09), "steel", drop=("x-", "x+", "z+")))
    # ---- grille walls: tiles of the mask's `grille`, about 0.6 m a tile, facing inward
    rows = 5; z0 = 0.30; th = (H - z0) / rows
    def wall_tiles(axis, s, length):
        n = int(round(length / 0.6)); tw = length / n
        for i in range(n):
            for r in range(rows):
                c = -length / 2 + tw * (i + 0.5); z = z0 + th * (r + 0.5)
                if axis == "x": dec.add((s * (hw + 0.03), c, z), tw, th, "grille", None, "steel", "-x" if s > 0 else "+x", lift=0.0)
                else: dec.add((c, s * (hd + 0.03), z), tw, th, "grille", None, "steel", "-y", lift=0.0)
    for axis, s in walls: wall_tiles(axis, s, D if axis == "x" else W)
    # ---- the front: header and (when the gate is narrower than the cage) fixed side screens
    yg = -(hd - 0.05)
    if gate_w < W - 0.01:
        side = (W - gate_w) / 2
        for s in (-1, 1):
            cx = s * (gate_w / 2 + side / 2)
            for r in range(rows):
                dec.add((cx, -(hd + 0.03), z0 + th * (r + 0.5)), side, th, "grille", None, "steel", "-y", lift=0.0)
            static.append(mc.slab("jamb", (0.08, 0.10, gate_h), (s * (gate_w / 2 + 0.04), -(hd + 0.03), gate_h / 2), "steel", drop=("z-", "z+")))
            static.append(mc.slab("kick_f", (side, 0.03, 0.30), (cx, -(hd + 0.015), 0.15), "steel", drop=("x-", "x+", "z-")))
    if gate_h < H - 0.01:
        static.append(mc.slab("header", (gate_w + 0.16, 0.06, H - gate_h), (0, -(hd + 0.03), (H + gate_h) / 2), "steel", drop=("x-", "x+", "z+")))
        lamp_z = (H + gate_h) / 2; lamp_y = -(hd + 0.06)
    else:
        lamp_z = H + 0.07; lamp_y = -(py + POST / 2 + 0.01)
    static.append(mc.pillow("lamp_bezel", 1.0, 0.11, 0.02, 0.012, "steel_dark", centre=(0, lamp_y, lamp_z)))
    lamp = mc.lamp_rect((0, lamp_y - 0.0205, lamp_z), 0.9, 0.05)
    # ---- the gate: hanger rail, lattice, a hazard foot rail, two edge stiles
    gate.append(mc.slab("gate_top", (gate_w - 0.04, 0.05, 0.10), (0, yg, gate_h - 0.05), "steel_dark", drop=("x-", "x+")))
    gate.append(mc.slab("gate_foot", (gate_w - 0.04, 0.06, 0.12), (0, yg, 0.06), "hazard", drop=("x-", "x+")))
    for s in (-1, 1):
        gate.append(mc.slab("gate_stile", (0.07, 0.05, gate_h - 0.2), (s * (gate_w / 2 - 0.055), yg, gate_h / 2), "steel_dark", drop=("z-", "z+")))
    nx = int(round(gate_w)); nz = 4 if gate_h > 3.2 else 3
    lattice(gate, gate_w - 0.1, gate_h - 0.2, yg, (gate_w - 0.1) / nx, (gate_h - 0.2) / nz)
    for o in gate[4:]: o.data.transform(Matrix.Translation((0, 0, 0.1)))
    # ---- inside, on the back wall: the cast plate and the station numeral; the call station when asked for
    plate = brand.maker_plate(number, bevel=0.0, rivet_segments=3)
    for o in plate.values(): mc.place(o, (0.9 if control is None else 1.1, hd + 0.018, 1.62), (0, 0, 0))
    static.append(mc.slab("plate_back", (0.44, 0.03, 0.30), (0.9 if control is None else 1.1, hd + 0.02, 1.62), "steel", drop=("y+",)))
    for o in plate.values(): o.data.transform(Matrix.Translation((0, -0.036, 0)))
    static.append(plate["plate"])
    dec.add((-1.0 if control is None else -1.15, hd - 0.0, 2.2), 0.42, 0.63, "numerals", 4, "enamel", "-y", lift=-0.02)
    static.append(mc.slab("num_back", (0.62, 0.03, 0.80), (-1.0 if control is None else -1.15, hd + 0.02, 2.2), "steel", drop=("y+",)))
    if control is not None:
        cx, cy, cz = control                                                     # Blender point of the call plate's face
        static.append(mc.slab("call_box", (0.34, hd - cy + 0.03, 0.46), (cx, (hd + 0.03 + cy) / 2, cz), "enamel", drop=("y+",), bevel=0.02))
        static.append(mc.slab("call_foot", (0.14, 0.12, cz - 0.23), (cx, hd - 0.05, (cz - 0.23) / 2), "steel", drop=("z-", "z+", "y+")))
        static.append(mc.lathe("call_ring", [(0.085, 0.0), (0.075, 0.014), (0.06, 0.004)], 8, "brass", centre=(cx, cy, cz + 0.07), rot=(math.radians(90), 0, 0)))
        static.append(mc.lathe("call_button", [(0.06, 0.004), (0.05, 0.02), (0.0, 0.024)], 8, "aqua", centre=(cx, cy, cz + 0.07), rot=(math.radians(90), 0, 0)))
        dec.add((cx, cy, cz - 0.11), 0.16, 0.16, "picto_misc", 0, "steel_dark", "-y", roll=math.pi / 2)
    arm = rig.make_armature(asset + "_rig", [("root", (0, 0, 0), (0, 0, 0.1), None), ("gate", (0, yg, 0), (0, yg, 0.1), "root")])
    ob = rig.join_as_rigid_skin({"root": static, "gate": gate}, arm, asset + "_mesh")
    pd = plate["decals"]
    mc.ao_compose(ob, distance=0.5, jitter=0.0, seed=args.seed, gradient=(0.80, 1.04), hidden=over + [pd], ao_strength=0.7)
    for o in over: o.vertex_groups.new(name="root").add(range(len(o.data.vertices)), 1.0, 'REPLACE')
    ob = mc.overlay_join(ob, over)
    # boots wear the middle of the floor; the kick plates are scuffed
    def wear(p, n):
        fl = (np.abs(p[:, 2]) < 0.01)
        return np.where(fl, 1.0 - 0.18 * np.clip(1.0 - np.hypot(p[:, 0], p[:, 1]) / (hw * 0.9), 0, 1), 1.0)
    # the floor plate and the roof panel are single big faces whose corners sit under the posts and beams: their vertex
    # AO is black at every corner and grades across the whole cage. Floor and roof take a flat, near-open value instead
    # (the floor now carries loops and keeps its baked AO, floored at 0.62 so the corners under the posts are not black;
    # the proving cage's roof panel has no triangles for loops and keeps the flat value)
    mc.lift(ob, lambda p, n: (np.abs(p[:, 2]) < 0.01) & (n[:, 2] > 0.9), 0.62)
    mc.lift(ob, lambda p, n: (p[:, 2] > H + 0.13) & (np.abs(n[:, 2]) > 0.9), 0.62 if roomy else 0.9)
    mc.shade(ob, wear)
    g = dec.build("grille_tiles")
    mesh.join([g, pd], "cage_grille")
    zone.lamp_set("gate_lamp", [lamp], colour="aqua")
    ob["thin_ok"] = 20.0
    # ---- clips: bone `gate` is vertical: scale y = height, loc y = up
    n = anim.frames(asset, "gate_open")
    a1 = anim.new_action(arm, "gate_open")
    # The gate HANGS from the header: the bone scales about the sill, so the lift is a function of the scale and the
    # hanger rail never leaves the header line (lift = gate_h * (1 - sc)). Only as the last quarter folds does the
    # bundle draw up past the header into its park (+ FOLD * gate_h), so the opening ends fully clear. Keyed on every
    # frame: scale and lift then cannot drift apart between keys.
    def hang(sc):
        k = min(1.0, max(0.0, (1.0 - sc) / (1.0 - FOLD)))                          # 0 shut .. 1 folded
        s = min(1.0, max(0.0, (k - 0.72) / 0.28)); s = s * s * (3 - 2 * s)
        return gate_h * (1.0 - sc) + FOLD * gate_h * s
    def curve(keys, f):
        for (f0, v0), (f1, v1) in zip(keys, keys[1:]):
            if f0 <= f <= f1:
                t = (f - f0) / max(1, f1 - f0); t = t * t * (3 - 2 * t)
                return v0 + (v1 - v0) * t
        return keys[-1][1]
    # open: the latch jolts (the lattice sags 1.5 %), the fold gathers speed, slams home a touch too far, settles
    k_open = [(0, 1.0), (2, 1.0), (4, 0.985), (6, 0.97), (12, 0.62), (18, 0.24), (22, FOLD - 0.012), (24, FOLD + 0.022), (26, FOLD - 0.004), (28, FOLD), (n, FOLD)]
    for f in range(n + 1):
        sc = curve(k_open, f)
        anim.key_pose(arm, f, {"gate": {"scale": (1.0, sc, 1.0), "loc": (0.0, hang(sc), 0.0)}})
    anim.reset_pose(arm)
    for pb in arm.pose.bones: pb.scale = (1, 1, 1)
    a2 = anim.new_action(arm, "gate_close")
    # close: the bundle drops out of its park, the lattice runs down under its own weight, the foot rail hits the
    # sill, the lattice bounces 1.5 % and rests
    k_close = [(0, FOLD), (2, FOLD), (4, FOLD + 0.03), (11, 0.40), (17, 0.86), (20, 1.0), (22, 0.984), (24, 1.0), (25, 0.995), (26, 1.0), (n, 1.0)]
    for f in range(n + 1):
        sc = curve(k_close, f)
        anim.key_pose(arm, f, {"gate": {"scale": (1.0, sc, 1.0), "loc": (0.0, hang(sc), 0.0)}})
    mc.finish_actions(arm, [a1, a2])
    for pb in arm.pose.bones: pb.scale = (1, 1, 1)
    return arm
