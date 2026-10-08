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


def build_cage(asset, args, W, D, gate_w, gate_h, control=None, number="4-140", tight=False):
    """tight (pass i1, the proving cage): the cage stands INSIDE its W x H x D interior. The bore's lift shaft is exactly
    that interior (layout bo_plift_wall_*, bo_plift_ceiling): built round it, the posts, the walls and the roof of the
    cage were inside the shaft's masonry, and the player rode in "a plain teal box" that arrived at the rim as a meshed
    cage. The hall cage stands free and keeps its frame outside the interior.

    Both cages, pass i1 (the visual reviewers: "plain boxes", "two blank grey plates"): an enamel wainscot of riveted
    panels to the livery band at 1.2 m with the mesh above it, a steel handrail on brackets, a station board (the
    numeral, LIFT STATION 4, the maker's plate in brass) on the back wall, a strip lamp in the roof behind the gate
    with its pool of light painted on the floor, a grating strip down the worn middle of the floor."""
    hw, hd = W / 2, D / 2
    e = -1.0 if tight else 1.0                                                     # the frame stands inside / outside the interior
    gx, gy = hw + e * 0.03, hd + e * 0.03                                          # the grille's planes (side, back)
    ztop = H - 0.14 if tight else H                                                # underside of the wall-top beams
    zroof = H - 0.006 if tight else H + 0.16
    static, gate, over = [], [], []
    dec = mc.Decals()
    # ---- floor plate (seams are dark overlay lines on the 1.2 m module), a grating strip from the gate to the back wall
    floor = mc.slab("floor", (W + 0.3, D + 0.3, 0.10), (0, 0, -0.05), "steel", drop=("z-",))
    mesh.tessellate_max_edge(floor, 1.7 if not tight else 2.2)                     # loops: the bake and the painted pool need vertices in the open floor
    static.append(floor)
    for s in ((-1.2, 1.2) if W < 5 else (-1.8, 1.8)):
        over.append(mc.quad("seam_x", [(s - 0.017, -hd, 0.0015), (s + 0.017, -hd, 0.0015), (s + 0.017, hd, 0.0015), (s - 0.017, hd, 0.0015)], "steel_dark"))
    nt = int(round((D - 0.3) / 0.75)); tl = (D - 0.3) / nt
    for i in range(nt):
        for sx in (-1, 1):
            dec.add((sx * tl / 2, -hd + 0.15 + tl * (i + 0.5), 0.0), tl, tl, "grille", None, "steel_dark", "+z", lift=0.003)
    # ---- frame: corner posts, mid posts, wall-top beams
    px, py = hw + e * POST / 2, hd + e * POST / 2
    for sx in (-1, 1):
        for sy in (-1, 1):
            static.append(mc.slab("post", (POST, POST, ztop + 0.14), (sx * px, sy * py, (ztop + 0.14) / 2), "steel", drop=("z-", "z+") + ((("x+" if sx > 0 else "x-"), ("y+" if sy > 0 else "y-")) if tight else ())))
    for (x, y) in ((-(hw + e * 0.04), 0), (hw + e * 0.04, 0), (0, hd + e * 0.04)):
        static.append(mc.slab("mid_post", (0.08, 0.08, ztop), (x, y, ztop / 2), "steel", drop=("z-", "z+") + ((("x-" if x < 0 else "x+") if y == 0 else "y+",) if tight else ())))
    for sy in (-1, 1):
        static.append(mc.slab("beam_x", (W + (2 * POST if not tight else 0.0), POST + 0.02, 0.14), (0, sy * py, ztop + 0.07), "steel", drop=("x-", "x+") + (("z+", "y+" if sy > 0 else "y-") if tight else ())))
    for sx in (-1, 1):
        static.append(mc.slab("beam_y", (POST + 0.02, D - (2 * POST if tight else 0.0), 0.14), (sx * px, 0, ztop + 0.07), "steel", drop=("y-", "y+") + (("z+", "x+" if sx > 0 else "x-") if tight else ())))
    # ---- walls: kick plate, a wainscot of enamel panels (seams and a rivet row a panel), the livery band, a handrail
    walls = [("x", -1), ("x", 1), ("y", 1)]
    Z0, Z1 = 0.30, 1.15                                                            # the wainscot
    for axis, s in walls:
        length = D if axis == "x" else W
        npan = max(2, int(round(length / 1.3))); pl = length / npan
        if axis == "x":
            at = lambda u, off, z, s=s: (s * (gx - off), u, z)                     # u along the wall, off = how far it stands in from the grille
            nrm = "-x" if s > 0 else "+x"; back = "x+" if s > 0 else "x-"; ends = ("y-", "y+")
            size = lambda l, t, h: (t, l, h)
        else:
            at = lambda u, off, z: (u, gy - off, z)
            nrm = "-y"; back = "y+"; ends = ("x-", "x+")
            size = lambda l, t, h: (l, t, h)
        static.append(mc.slab("kick", size(length, 0.03, Z0), at(0, 0.027, Z0 / 2), "steel", drop=ends + ("z-", back)))
        for i in range(npan):
            u = -length / 2 + pl * (i + 0.5)
            pan = mc.slab("panel", size(pl - 0.012, 0.012, Z1 - Z0), at(u, 0.018, (Z0 + Z1) / 2), "enamel" if (i + (s > 0)) % 3 else "enamel_stain", drop=ends + ("z-", "z+", back))
            static.append(pan)
            dec.add(at(u, 0.024, Z1 - 0.055), pl - 0.06, (pl - 0.06) / 16.0, "rivets", None, "steel_dark", nrm, lift=0.0015)
            if i: over.append(mc.slab("pan_seam", size(0.034, 0.004, Z1 - Z0), at(-length / 2 + pl * i, 0.014, (Z0 + Z1) / 2), "steel_dark", drop=ends + ("z-", "z+", back)))
        static.append(mc.slab("rail", size(length, 0.045, 0.10), at(0, 0.034, 1.2), "livery", drop=ends + (back,)))
        static.append(mc.slab("hand", size(length - 0.5, 0.04, 0.04), at(0, 0.115, 0.98), "steel_dark", drop=ends + (back,)))
        for u in ((-length / 2 + 0.45, length / 2 - 0.45) if length < 5 else (-length / 2 + 0.45, 0.0, length / 2 - 0.45)):
            if axis == "y" and control is not None and abs(u - control[0]) < 0.3: continue
            static.append(mc.slab("hand_br", size(0.04, 0.085, 0.03), at(u, 0.068, 0.965), "steel_dark", drop=(back, "z+")))
    # ---- roof: a plate (its underside), cross beams above it where there is room, the strip lamp behind the gate
    roof = mc.slab("roof", (W + (0.1 if not tight else -0.02), D + (0.1 if not tight else -0.02), 0.04), (0, 0, zroof + 0.02), "steel_dark", drop=("x-", "x+", "y-", "y+", "z+") if tight else ("x-", "x+", "y-", "y+"))
    mesh.tessellate_max_edge(roof, 3.2 if not tight else 2.2)
    static.append(roof)
    if not tight:
        for y in (-hd / 2, hd / 2):
            static.append(mc.slab("roof_beam", (W, 0.10, 0.10), (0, y, H + 0.09), "steel", drop=("x-", "x+", "z+")))
    ly = -hd + 0.55                                                                # the strip lamp: a dark tray under the roof, the tube in it
    if tight:                                                                      # no room under the shaft's ceiling: the tray is a painted frame
        lz = zroof - 0.003
        over.append(mc.quad("lamp_tray", [(-0.62, ly - 0.11, zroof - 0.0015), (-0.62, ly + 0.11, zroof - 0.0015), (0.62, ly + 0.11, zroof - 0.0015), (0.62, ly - 0.11, zroof - 0.0015)], "enamel"))
    else:
        lz = zroof - 0.03
        static.append(mc.slab("lamp_tray", (1.24, 0.22, 0.03), (0, ly, zroof - 0.015), "enamel", drop=("z+",)))
    lamps = [[(-0.55, ly - 0.06, lz - 0.001), (-0.55, ly + 0.06, lz - 0.001), (0.55, ly + 0.06, lz - 0.001), (0.55, ly - 0.06, lz - 0.001)]]
    # ---- grille walls above the band: tiles of the mask's `grille`, facing inward
    rows = 3; zg0 = 1.25; th = (ztop - zg0) / rows
    def wall_tiles(axis, s, length):
        n = int(round(length / th)); tw = length / n
        for i in range(n):
            for r in range(rows):
                c = -length / 2 + tw * (i + 0.5); z = zg0 + th * (r + 0.5)
                if axis == "x": dec.add((s * gx, c, z), tw, th, "grille", None, "steel", "-x" if s > 0 else "+x", lift=0.0)
                else: dec.add((c, s * gy, z), tw, th, "grille", None, "steel", "-y", lift=0.0)
    for axis, s in walls: wall_tiles(axis, s, D if axis == "x" else W)
    # ---- the front: header and (when the gate is narrower than the cage) fixed side screens
    yg = -(hd - 0.05)
    yf = -(hd - 0.012) if tight else -(hd + 0.03)                                  # the plane of the front screens and the header
    if gate_w < W - 0.01:
        side = (W - gate_w) / 2
        for s in (-1, 1):
            cx = s * (gate_w / 2 + side / 2)
            for r in range(4):
                dec.add((cx, yf, 0.30 + (ztop - 0.30) / 4 * (r + 0.5)), side, (ztop - 0.30) / 4, "grille", None, "steel", "-y", lift=0.0)
            static.append(mc.slab("jamb", (0.08, 0.06, gate_h), (s * (gate_w / 2 + 0.04), yf - 0.01, gate_h / 2), "steel", drop=("z-", "z+")))
            static.append(mc.slab("kick_f", (side, 0.03, 0.30), (cx, yf + 0.015, 0.15), "steel", drop=("x-", "x+", "z-")))
    if gate_h < ztop - 0.01:
        static.append(mc.slab("header", (gate_w + 0.16, 0.024, ztop - gate_h), (0, yf, (ztop + gate_h) / 2), "steel", drop=("x-", "x+", "z+")))
    if not tight:                                                                  # the hall cage shows its lamp bar to the hall as well
        lamp_z = H + 0.07; lamp_y = -(py + POST / 2 + 0.01)
        static.append(mc.pillow("lamp_bezel", 1.0, 0.11, 0.02, 0.012, "steel_dark", centre=(0, lamp_y, lamp_z)))
        lamps.append(mc.lamp_rect((0, lamp_y - 0.0205, lamp_z), 0.9, 0.05))
    # ---- the gate: hanger rail, lattice, a hazard foot rail, two edge stiles
    gate.append(mc.slab("gate_top", (gate_w - 0.04, 0.05, 0.10), (0, yg, gate_h - 0.05), "steel_dark", drop=("x-", "x+")))
    gate.append(mc.slab("gate_foot", (gate_w - 0.04, 0.06, 0.12), (0, yg, 0.06), "hazard", drop=("x-", "x+")))
    for s in (-1, 1):
        gate.append(mc.slab("gate_stile", (0.07, 0.05, gate_h - 0.2), (s * (gate_w / 2 - 0.055), yg, gate_h / 2), "steel_dark", drop=("z-", "z+")))
    nx = int(round(gate_w)); nz = 4 if gate_h > 3.2 else 3
    lattice(gate, gate_w - 0.1, gate_h - 0.2, yg, (gate_w - 0.1) / nx, (gate_h - 0.2) / nz)
    for o in gate[4:]: o.data.transform(Matrix.Translation((0, 0, 0.1)))
    # ---- on the back wall, over the mesh: the station board (numeral 4, LIFT STATION 4), the maker's plate; the call station
    bx = -0.95 if control is None else -1.0; bz = 2.12; bw_, bh_ = 1.30, 0.62; yb = gy - 0.03
    static.append(mc.slab("board", (bw_, 0.03, bh_), (bx, yb + 0.015, bz), "enamel", drop=("y+",)))
    over.append(mc.slab("board_band", (bw_, 0.004, 0.07), (bx, yb - 0.002, bz - bh_ / 2 + 0.075), "livery", drop=("y+", "x-", "x+", "z-", "z+")))
    dec.add((bx - bw_ / 2 + 0.24, yb, bz + 0.055), 0.28, 0.42, "numerals", 4, "livery", "-y", lift=0.002)
    sw = bw_ - 0.56; dec.add((bx + 0.20, yb, bz + 0.10), sw, sw / 8.0, "station", None, "steel_dark", "-y", lift=0.002)
    dec.add((bx + 0.20, yb, bz - 0.04), sw, sw / 16.0, "rivets", None, "steel_dark", "-y", lift=0.002)
    mpx = 0.95 if control is None else 1.15
    plate = brand.maker_plate(number, bevel=0.0, rivet_segments=3)
    for o in plate.values(): mc.place(o, (mpx, yb + 0.004, 1.62), (0, 0, 0))
    static.append(mc.slab("plate_back", (0.40, 0.03, 0.26), (mpx, yb + 0.019, 1.62), "steel_dark", drop=("y+",)))
    mc.paint(plate["plate"], "brass")
    static.append(plate["plate"])
    if control is not None:
        cx, cy, cz = control                                                     # Blender point of the call plate's face
        static.append(mc.slab("call_box", (0.34, gy - cy, 0.46), (cx, (gy + cy) / 2, cz), "enamel", drop=("y+",), bevel=0.02))
        static.append(mc.slab("call_foot", (0.14, 0.12, cz - 0.23), (cx, gy - 0.07, (cz - 0.23) / 2), "steel", drop=("z-", "z+", "y+")))
        static.append(mc.lathe("call_ring", [(0.085, 0.0), (0.075, 0.014), (0.06, 0.004)], 6, "brass", centre=(cx, cy, cz + 0.07), rot=(math.radians(90), 0, 0)))
        static.append(mc.lathe("call_button", [(0.06, 0.004), (0.05, 0.02), (0.0, 0.024)], 6, "aqua", centre=(cx, cy, cz + 0.07), rot=(math.radians(90), 0, 0)))
        dec.add((cx, cy, cz - 0.11), 0.16, 0.16, "picto_misc", 0, "steel_dark", "-y", roll=math.pi / 2)
    arm = rig.make_armature(asset + "_rig", [("root", (0, 0, 0), (0, 0, 0.1), None), ("gate", (0, yg, 0), (0, yg, 0.1), "root")])
    ob = rig.join_as_rigid_skin({"root": static, "gate": gate}, arm, asset + "_mesh")
    pd = plate["decals"]
    vcol.fill_color(pd, "walnut")                                                  # dark letters on the brass
    mc.ao_compose(ob, distance=0.5, jitter=0.0, seed=args.seed, gradient=(0.80, 1.04), hidden=over + [pd], ao_strength=0.7)
    for o in over: o.vertex_groups.new(name="root").add(range(len(o.data.vertices)), 1.0, 'REPLACE')
    ob = mc.overlay_join(ob, over)
    # The floor plate and the roof panel are big faces whose corners sit under the posts and beams: floored, so no
    # corner is AO-black
    mc.lift(ob, lambda p, n: (np.abs(p[:, 2]) < 0.01) & (n[:, 2] > 0.9), 0.62)
    mc.lift(ob, lambda p, n: (p[:, 2] > zroof - 0.05) & (n[:, 2] < -0.9), 0.62)
    # the wainscot's panels have vertices only at their corners, behind the kick plate and the band: floored as well
    mc.lift(ob, lambda p, n: (np.abs(n[:, 2]) < 0.5) & (p[:, 2] > Z0 - 0.01) & (p[:, 2] < Z1 + 0.01), 0.86)
    lx, ly_ = 0.0, ly
    WAIN = 0.62                                                                    # old enamel, handled for a long time: not the white of a new panel
    def light(p, n):
        """What the strip lamp does, painted: its pool on the floor (and boots have worn the middle of the plate bright),
        the roof round the tray, the wall heads beside it; the wainscot is scuffed at knee height and stained at its foot."""
        d = np.hypot(p[:, 0] - lx, (p[:, 1] - ly_) * 0.8)
        fl = (np.abs(p[:, 2]) < 0.01) & (n[:, 2] > 0.9)
        pool = np.clip(1.0 - d / (2.6 if W < 5 else 3.4), 0, 1) ** 1.4
        k = np.where(fl, 0.58 + 0.42 * pool + 0.10 * np.clip(1.0 - np.abs(p[:, 0]) / 0.9, 0, 1), 1.0)
        rf = (p[:, 2] > zroof - 0.05) & (n[:, 2] < -0.9)
        k = np.where(rf, 0.50 + 0.50 * np.clip(1.0 - d / 2.2, 0, 1), k)
        up = (np.abs(n[:, 2]) < 0.5) & (p[:, 2] > 0.02)
        fall = 0.72 + 0.28 * np.clip(1.0 - np.hypot(d, (zroof - p[:, 2]) * 0.6) / (3.2 if W < 5 else 4.2), 0, 1)
        k = np.where(up, fall, k)
        wain = up & (p[:, 2] > Z0 - 0.01) & (p[:, 2] < Z1 + 0.01)
        k = np.where(wain, k * WAIN * (0.80 + 0.20 * np.clip((p[:, 2] - Z0) / 0.5, 0, 1)), k)
        sign = up & (p[:, 1] > gy - 0.05) & (p[:, 2] > bz - bh_ / 2 - 0.01) & (p[:, 2] < bz + bh_ / 2 + 0.01) & (np.abs(p[:, 0] - bx) < bw_ / 2 + 0.01)
        k = np.where(sign, k * (0.60 if tight else 0.80) * (0.86 + 0.14 * np.clip((p[:, 2] - (bz - bh_ / 2)) / bh_, 0, 1)), k)       # the board: chalky, greyer toward its foot
        if tight: k = np.where(wain & (p[:, 1] > gy - 0.2), k * 0.78, k)
        return k
    mc.shade(ob, light)
    # the hall's mood lights a thing from straight above: upright enamel took the ambient alone and the wainscot stood
    # navy-black under its mesh (shots/i1-team-creatures-props/wip5). Leaning normals, as the lockers' (mech_common.relight)
    # (not the proving cage: the bore's key comes from BELOW once it is proven, moods.ts L5p, and a leaning face loses it
    # and the mood's upright fill: tried, the wainscot went dark teal. Its back wall stands square to the rim's afterglow
    # instead and is toned down in `light`, so the enamel is not the brightest thing in the blue hour)
    if not tight: mc.relight(ob, 0.55)
    g = dec.build("grille_tiles")
    mesh.join([g, pd], "cage_grille")
    zone.lamp_set("gate_lamp", [lamps], colour="aqua")
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
