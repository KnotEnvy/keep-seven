"""enemy_transit: the Marksman (GDD 7.2, ART_BIBLE 6.2 / 7.6, work order art-enemies 4.3).

    node tools/build-assets.mjs --only enemy_transit
    node tools/preview-asset.mjs enemy_transit --clip all --game --cycles --piece art-enemies-transit

A Pellam bore-survey instrument that never stopped taking sightings: a pale drum with one deep eye on three ceramic
legs. 2 000 triangles, ONE rigid-skinned mesh, one material (m_prop), 8 bones, 10 clips.

Layout (Blender: +Z up, front = -Y; game (x, y, z) = (x, -z, y)):
    drum     0.45 across, 0.30 deep, axis along Y, centre at z 1.575 (its top at 1.80); a forked sighting vane, a 0.25 m
             blade 0.12 m wide at the top, hinged on the back face and standing to 1.94
    lens     0.24 across, 86 mm deep in a steel_dark bezel 0.05 thick; a 0.10 m `violet_core` disc with a `violet` rim
             (both emissive cells: husk grey when the runtime switches the glow off)
    head     bone at the BALL JOINT under the drum (z 1.25): yaw, dip and roll all turn about it, so the drum, its neck,
             the stake rack under its chin, the vane, the plate and both sockets move as one
    hub      a hexagonal steel block (root) holding the ball socket and three ball hips at radius 0.15, z 1.185
    legs     a = rear, b = front-left (+X), c = front-right: nothing stands in front of the eye. 0.13 m thick chamfered
             ceramic beams: upper 0.84 m and lower 0.82 m as parts (hip-knee 0.596, knee-foot 0.712 between pivots),
             a cast steel clamp band on each segment and a steel_dark cuff over the foot, a coned steel_dark hinge disc
             with a bright axle end at the knee, a hazard-ochre pointed foot, a round ground plate, a steel spike.
             Feet on a 0.55 m circle: 1.1 m across.
    root     at the asset origin on the ground: it only rises, falls and tilts about that point (no horizontal root
             motion: code moves the enemy)
Clips are authored with a two-bone solver (transit_common.Tripod) and exported as plain FK keys on every frame.
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import math
import numpy as np
from mathutils import Vector, Matrix
from lib import scene, mesh, uv, vcol, rig, anim, export, manifest, brand
import transit_common as tc
from transit_common import ease, ease_in, ease_out, span, lerp, keys

ASSET = "enemy_transit"
ASSET_NUMBER = "4-111"                                 # ART_BIBLE 5: `4-` + three digits; no 19, no 99, no sevens
RAD = math.radians

# ------------------------------------------------------------------------------------------------ dimensions
DRUM_Z, DRUM_R, DRUM_H = 1.575, 0.225, 0.15            # centre height, radius, half depth
PIVOT = Vector((0.0, 0.0, 1.25))                       # the ball joint (bone `head`)
HIP_R, HIP_Z = 0.15, 1.185
KNEE_R, KNEE_Z = 0.50, 0.71
FOOT_R = 0.55
AZ = {"a": 180.0, "b": 60.0, "c": 300.0}               # degrees from the front (game +Z) toward the creature's left (+X)
SEG_DRUM, SEG_LENS = 24, 16
MUZZLE_Y = -0.42                                       # the tips of the racked stakes
LENS_FRONT = -(DRUM_H + 0.036)                         # the bezel's front plane (drum-local h)


def e_r(leg): a = RAD(AZ[leg]); return Vector((math.sin(a), -math.cos(a), 0.0))
def e_t(leg): a = RAD(AZ[leg]); return Vector((math.cos(a), math.sin(a), 0.0))
def hip(leg): return e_r(leg) * HIP_R + Vector((0, 0, HIP_Z))
def knee(leg): return e_r(leg) * KNEE_R + Vector((0, 0, KNEE_Z))
def foot(leg, r=FOOT_R, z=0.0): return e_r(leg) * r + Vector((0, 0, z))


# the drum's own frame: lathe +Z (h) -> Blender +Y (h < 0 is the front), lathe +Y -> Blender -Z
DRUM = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, DRUM_Z), (0, 0, 0, 1)))
ALONG = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))


# ------------------------------------------------------------------------------------------------ the drum (bone `head`)
def build_head():
    P = []
    # the enamel shell: front annulus, 20 mm bevel, barrel, bevel, back face
    P.append(tc.lathe("drum_shell", [(0.166, -DRUM_H), (0.205, -DRUM_H), (DRUM_R, -DRUM_H + 0.02), (DRUM_R, DRUM_H - 0.02),
                                     (0.205, DRUM_H), (0.052, DRUM_H)], SEG_DRUM, "enamel", M=DRUM))
    # the livery band: aqua PAINT, a hair proud of the barrel
    P.append(tc.lathe("drum_band", [(DRUM_R + 0.0025, 0.050), (DRUM_R + 0.0025, 0.108)], SEG_DRUM, "livery", M=DRUM))
    # the bezel: 0.05 thick, 36 mm proud of the face, its inner wall running 86 mm back to the glass
    P.append(tc.lathe("lens_bezel", [(0.120, -0.094), (0.120, LENS_FRONT + 0.010), (0.130, LENS_FRONT), (0.160, LENS_FRONT),
                                     (0.170, LENS_FRONT + 0.010), (0.170, -DRUM_H + 0.002)], SEG_LENS, "steel_dark", M=DRUM))
    # the eye: a 0.10 m near-white core, a violet rim, dark glass (slightly domed toward the front)
    P.append(tc.lathe("lens_core", [(0.0, -0.1035), (0.050, -0.1005)], SEG_LENS, "violet_core", M=DRUM, emis=True))
    P.append(tc.lathe("lens_rim", [(0.050, -0.1005), (0.066, -0.0995)], SEG_LENS, "violet", M=DRUM, emis=True))
    P.append(tc.lathe("lens_glass", [(0.066, -0.0995), (0.122, -0.094)], SEG_LENS, "lens", M=DRUM))
    # graduated marks round the front rim: 12 ticks, the four cardinal ones long (filled dark: they read without light)
    ticks = []
    for k in range(12):
        a = tc.TAU * k / 12
        r0 = 0.1735 if k % 3 == 0 else 0.182; r1 = 0.2005; w = 0.0062 if k % 3 == 0 else 0.0042
        c, s = math.cos(a), math.sin(a)
        pts = [(r0 * c + w * s, r0 * s - w * c), (r0 * c - w * s, r0 * s + w * c), (r1 * c - w * s, r1 * s + w * c), (r1 * c + w * s, r1 * s - w * c)]
        ticks.append([(x, y, -DRUM_H - 0.002) for (x, y) in pts])
    P.append(tc.quads("drum_ticks", ticks, "steel_dark", M=DRUM, facing=(0, 0, -1)))
    # the eyepiece on the back face
    P.append(tc.lathe("eyepiece", [(0.055, DRUM_H - 0.002), (0.055, DRUM_H + 0.046), (0.044, DRUM_H + 0.058), (0.0, DRUM_H + 0.058)], 6, "steel_dark", M=DRUM))
    # the folding sighting vane: a hinge bracket on the back face and a 0.25 m blade standing up from it, 0.12 m wide
    # at its forked top (0.14 m clear above the drum: it breaks the round outline from the front and the back)
    P.append(tc.slab("vane_bracket", (0.11, 0.055, 0.05), (0.0, DRUM_H + 0.0275, 1.69), "steel_dark", drop=("y-",)))
    blade = [(-0.030, 1.69), (0.030, 1.69), (0.060, 1.94), (0.026, 1.94), (0.0, 1.868), (-0.026, 1.94), (-0.060, 1.94)]
    P.append(tc.loft("vane_blade", [[(x, 0.204, z) for (x, z) in blade], [(x, 0.172, z) for (x, z) in blade]], "steel_dark", cap_start=True, cap_end=True))
    # a level vial on top (it is a level): a brass tube in two saddles
    top = DRUM_Z + DRUM_R
    P.append(tc.lathe("level_vial", [(0.0, -0.07), (0.019, -0.07), (0.019, 0.07), (0.0, 0.07)], 6, "brass",
                      M=tc.frame((0.0, -0.055, top + 0.024), (1, 0, 0), (0, 0, 1))))
    for sx in (-1, 1):
        P.append(tc.slab(f"level_saddle_{'l' if sx > 0 else 'r'}", (0.022, 0.052, 0.03), (sx * 0.045, -0.055, top + 0.004), "steel_dark", drop=("z-",)))
    # the neck and ball: the head turns in the hub's socket
    P.append(tc.lathe("neck", [(0.034, 1.193), (0.066, 1.242), (0.050, 1.292), (0.088, 1.358)], 8, "steel_dark"))
    # the stake magazine under the chin: a rear block, a front bar, two hangers and three hot-tipped rods
    rz = 1.305
    P.append(tc.slab("rack_block", (0.25, 0.04, 0.055), (0.0, -0.075, rz), "steel_dark"))
    P.append(tc.slab("rack_bar", (0.25, 0.022, 0.042), (0.0, -0.225, rz), "steel_dark"))
    for sx in (-1, 1):
        P.append(tc.slab(f"rack_hanger_{'l' if sx > 0 else 'r'}", (0.016, 0.172, 0.085), (sx * 0.117, -0.150, rz + 0.04), "steel_dark", drop=("z+",)))
    for i, x in enumerate((-0.08, 0.0, 0.08)):
        M = Matrix.Translation((x, MUZZLE_Y, rz)) @ ALONG
        # the front 0.365 m of proj_stake, to its numbers (head widest 0.07 m from the tip, neck at 0.20, the shaft
        # thickening toward the butt): the rack holds three of the thing that is fired
        a = tc.square(0.020, 0.07, turn=True); b = tc.square(0.0125, 0.20, turn=True); c = tc.square(0.0163, 0.365, turn=True)
        P.append(tc.loft(f"rod{i}_point", [[(0, 0, 0)], a], "flame_core", M=M, emis=True, smooth=20))
        P.append(tc.loft(f"rod{i}_head", [a, b], "flame", M=M, emis=True, smooth=20))
        P.append(tc.loft(f"rod{i}_shaft", [b, c], "steel", M=M, smooth=20))
    # the cast maker's plate on its right side, on a flat pad (the plate is flat, the barrel is not)
    P.append(tc.slab("plate_pad", (0.012, 0.204, 0.118), (-0.2255, -0.045, DRUM_Z), "enamel", drop=("x+",)))
    plate = brand.maker_plate(None, name="maker_plate", decals=False, rivet_segments=4)["plate"]
    plate.scale = (0.6, 0.6, 0.6); plate.rotation_euler = (0, 0, RAD(-90)); plate.location = (-0.2315, -0.045, DRUM_Z)
    mesh.apply_transform(plate)
    P.append(plate)
    # cast on the plate: two raised bars for the wordmark's two lines (lettering is m_mask, which this one-material
    # asset may not use) and, beneath, the asset number as geometry (station 4; cast, so no stencil bridges)
    xb = -0.2315 - 0.0032
    bars = [[(xb, y0, DRUM_Z + z0), (xb, y1, DRUM_Z + z0), (xb, y1, DRUM_Z + z1), (xb, y0, DRUM_Z + z1)]
            for (y0, y1, z0, z1) in ((-0.105, -0.005, 0.026, 0.037), (-0.105, -0.030, 0.009, 0.019))]
    P.append(tc.quads("plate_bars", bars, "steel_dark", facing=(-1, 0, 0)))
    num = brand.numeral_mesh(ASSET_NUMBER, 0.036, depth=0.0, name="plate_number", colour="steel_dark", bridges=False)
    num.rotation_euler = (0, 0, RAD(-90)); num.location = (xb, -0.045, DRUM_Z - 0.040)
    mesh.apply_transform(num)
    vcol.tint(num, "steel_dark")
    P.append(num)
    # a braided cable from the back of the drum down into the neck: the one thing on it that hangs
    P.append(tc.tube("drum_cable", [(0.105, 0.14, 1.50), (0.115, 0.215, 1.455), (0.085, 0.20, 1.365), (0.045, 0.10, 1.315), (0.02, 0.03, 1.31)], 0.017, "cable", sides=3))
    # the mark, stencilled in steel_dark on the enamel of its left side (Pellam's hand: exact, plumb), laid on the barrel
    mark = brand.pellam_mark(0.038, relief=0.0, segments=6, name="drum_mark", colour="steel_dark")
    mark.rotation_euler = (0, 0, RAD(90)); mark.location = (0.0, -0.062, DRUM_Z + 0.046)
    mesh.apply_transform(mark)
    for v in mark.data.vertices:
        dz = v.co.z - DRUM_Z
        v.co.x = math.sqrt((DRUM_R + 0.002) ** 2 - dz * dz)
    P.append(mark)
    return P


# ------------------------------------------------------------------------------------------------ the hub (bone `root`)
def build_hub():
    P = []
    P.append(tc.lathe("hub", [(0.0, 1.135), (0.110, 1.135), (0.165, 1.160), (0.165, 1.205), (0.120, 1.230), (0.095, 1.230),
                              (0.095, 1.250), (0.068, 1.250)], 6, "steel", phase=0.5, smooth=30))
    # a plumb bob under the hub: the instrument centres itself over its station
    P.append(tc.lathe("plumb_rod", [(0.012, 0.93), (0.012, 1.14)], 4, "steel_dark"))
    P.append(tc.lathe("plumb_bob", [(0.0, 0.83), (0.034, 0.905), (0.034, 0.918), (0.012, 0.938)], 5, "brass"))
    return P


# ------------------------------------------------------------------------------------------------ a leg (two bones)
def ring(name, M, w, z0, z1, colour="steel", proud=0.010):
    """A cast clamp band round a leg beam of half-width w: a 12 mm chamfer up from the beam, then the band; its far
    edge (toward the ground: nobody sees it from 1.65 m) is left open."""
    return tc.loft(name, [tc.section(w, 0.02, z0), tc.section(w + proud, 0.024, z0 + 0.012), tc.section(w + proud, 0.024, z1)], colour, M=M)


def build_leg(leg):
    H, K, F = hip(leg), knee(leg), foot(leg)
    U = (K - H).length; L = (F - K).length
    Mu = tc.frame(H, K - H, e_t(leg)); Ml = tc.frame(K, F - K, e_t(leg))
    Mk = tc.frame(K, e_t(leg), (0, 0, 1))
    up, lo = [], []
    n = f"leg_{leg}"
    # upper: ball hip, shoulder collar, ceramic beam with one clamp band, the knee hinge
    up.append(tc.lathe(n + "_hip", [(0.0, -0.068), (0.062, 0.0), (0.0, 0.068)], 6, "steel_dark", M=Mu, smooth=50))
    up.append(tc.loft(n + "_collar", [tc.section(0.074, 0.024, 0.045), tc.section(0.074, 0.024, 0.115)], "steel_dark", cap_end=True, M=Mu))
    up.append(tc.loft(n + "_upper", [tc.section(0.065, 0.02, 0.06), tc.section(0.0645, 0.02, 0.205), tc.section(0.063, 0.02, U - 0.01)], "enamel", M=Mu))   # the middle ring of vertices stands in the open: it carries the AO
    up.append(ring(n + "_band_u", Mu, 0.0645, 0.285, 0.345))
    # the knee: a hinge disc, coned to a boss on either cheek, with a bright axle end in each boss
    up.append(tc.lathe(n + "_knee", [(0.036, -0.090), (0.084, -0.058), (0.084, 0.058), (0.036, 0.090)], 8, "steel_dark", M=Mk))
    up.append(tc.lathe(n + "_axle", [(0.0, -0.090), (0.036, -0.090)], 8, "steel", M=Mk))
    up.append(tc.lathe(n + "_axle2", [(0.036, 0.090), (0.0, 0.090)], 8, "steel", M=Mk))
    # lower: a fork band under the knee, the ceramic beam tapering 19 %, a cuff where the hazard-ochre pointed foot
    # begins, a round ground plate and a steel spike under it
    lo.append(tc.loft(n + "_lower", [tc.section(0.064, 0.02, 0.0), tc.section(0.059, 0.019, 0.335), tc.section(0.052, 0.017, L - 0.15)], "enamel", M=Ml))
    lo.append(ring(n + "_band_k", Ml, 0.062, 0.105, 0.165))
    lo.append(ring(n + "_cuff", Ml, 0.053, L - 0.205, L - 0.150, colour="steel_dark", proud=0.009))
    lo.append(tc.loft(n + "_foot", [tc.section(0.052, 0.017, L - 0.15), tc.section(0.028, 0.009, L - 0.018)], "hazard", M=Ml))
    lo.append(tc.lathe(n + "_plate", [(0.100, 0.002), (0.028, 0.024)], 8, "hazard", M=Matrix.Translation(F)))
    lo.append(tc.lathe(n + "_spike", [(0.0, -0.05), (0.022, 0.0)], 6, "steel_dark", M=Matrix.Translation(F)))
    return up, lo


# ------------------------------------------------------------------------------------------------ paint
def paint_body(body):
    vcol.bake_ao_vertex([body], distance=0.35)
    vcol.compose_vertex_color(body, mode='ratio', jitter=0.0, gradient=(0.78, 1.10), z_range=(0.0, 1.92), dust=0.22, dust_height=0.45)
    # Old-World ceramic does not rot: it stains. The lower third goes to enamel_stain, streaks hang below every joint
    # and under the livery band, and the drum's belly is a shade down.
    en = np.array(manifest.palette_rgb("enamel")); st = np.array(manifest.palette_rgb("enamel_stain"))
    ratio = (st / en).astype(np.float32)
    def stain(p):
        t = tc.smoothstep(0.16, 0.66, p[:, 2])[:, None]
        return ratio[None, :] * (1 - t) + t
    tc.multiply(body, stain, cells=("enamel",))
    tc.multiply(body, lambda p: 1.0 - 0.14 * tc.smoothstep(KNEE_Z - 0.02, KNEE_Z - 0.20, p[:, 2]) * tc.smoothstep(KNEE_Z - 0.34, KNEE_Z - 0.20, p[:, 2]), cells=("enamel",))
    tc.multiply(body, lambda p: 1.0 - 0.13 * tc.smoothstep(DRUM_Z + 0.02, DRUM_Z - DRUM_R, p[:, 2]) * (p[:, 2] > 1.34), cells=("enamel",))
    vcol.darken_contact(body, height=0.05, factor=0.72)
    tc.whiten(body, ("violet", "violet_core", "flame", "flame_core"))


# ------------------------------------------------------------------------------------------------ clips
LEGS = ("a", "b", "c")
STANCE_R = 0.575                                        # the planted (braced) stance; the drum sits 2 cm lower in it
STANCE_Z = -0.02
DIP = RAD(12.0)


def lift(s, h, p=0.7):
    """A foot's arc over one swing (s 0..1): it snaps up, hangs, and comes down at speed (the clack)."""
    return h * math.sin(math.pi * tc.clamp01(s)) ** p if 0 < s < 1 else 0.0


def lean(d, angle):
    """hub_rot that tips the top of the body `angle` radians toward the horizontal direction d."""
    d = Vector((d[0], d[1], 0.0))
    if d.length < 1e-9: return (0.0, 0.0, 0.0)
    d.normalize()
    return (-d.y * angle, d.x * angle, 0.0)


def planted(): return {l: foot(l, STANCE_R) for l in LEGS}


def clip_idle_scan(T, f, n):
    # the drum steps left, holds, steps on, holds, steps back; then the same to the right. Each step is a 2-frame snap
    # with a small overshoot and a settle: never a pan
    table = [(0, 0.0)]; cur = 0.0
    for fs, tgt in ((6, 14.0), (20, 28.0), (40, 14.0), (47, 0.0), (54, -14.0), (64, -28.0), (80, -14.0), (86, 0.0)):
        table += [(fs, cur), (fs + 2, tgt + 0.12 * (tgt - cur), ease_out), (fs + 4, tgt)]
        cur = tgt
    yaw = RAD(keys(f, table))
    pitch = RAD(keys(f, [(0, 0.0), (20, 0.0), (23, 3.5), (40, 3.5), (43, 0.0), (64, 0.0), (67, 3.5), (80, 3.5), (83, 0.0)]))
    # the rear leg re-seats: up, 4 cm out, down hard; later it comes back in
    r = FOOT_R; z = 0.0
    if 26 <= f <= 33: s = span(f, 26, 33); r = lerp(FOOT_R, FOOT_R + 0.045, ease(s)); z = lift(s, 0.075)
    elif 33 < f < 68: r = FOOT_R + 0.045
    elif 68 <= f <= 75: s = span(f, 68, 75); r = lerp(FOOT_R + 0.045, FOOT_R, ease(s)); z = lift(s, 0.075)
    hz = -0.005 * (lift(span(f, 32, 37), 1.0, 1.0) + lift(span(f, 74, 79), 1.0, 1.0))
    lz = lean(-e_r("a"), RAD(0.5) * (lift(span(f, 25, 34), 1.0, 1.0) + lift(span(f, 67, 76), 1.0, 1.0)))
    return T.solve(hub_z=hz, hub_rot=lz, head=(yaw, pitch, 0.0), level=True, feet={"a": foot("a", r, z)})


WALK_ORDER = {"b": 0.0, "c": 1.0 / 3.0, "a": 2.0 / 3.0}
WALK_CYCLES = 2                                         # gait cycles in the 0.9 s clip: six clacks
WALK_STRIDE = 0.84                                      # metres a planted foot travels back under the body per stance
WALK_SPEED = WALK_STRIDE / (0.9 / WALK_CYCLES * 2.0 / 3.0)   # = 2.8 m/s: the ground speed at which no foot slides
WALK_HUB_Z = -0.14                                      # it walks crouched: the legs need the reach
WALK_BIAS = {"a": -0.07, "b": 0.0, "c": 0.0}           # stride centre (Blender y): the rear leg cannot reach as far back


def clip_walk(T, f, n):
    # three beats, twice in the clip: one leg in the air at a time, each for a third of a cycle, thrown the whole
    # reach of the leg (0.84 m) in a high arc; the stance feet travel back at a steady 2.8 m/s (root motion is
    # code's); the body rocks 0.7 degrees off the lifted leg and the drum does not move at all
    feet = {}; rock = Vector((0, 0, 0))
    for l in LEGS:
        u = (WALK_CYCLES * f / n - WALK_ORDER[l]) % 1.0
        base = foot(l)
        if u < 1.0 / 3.0 - 1e-9:
            s = u * 3.0
            y = WALK_STRIDE / 2 - WALK_STRIDE * (0.35 * s + 0.65 * ease(s)); z = lift(s, 0.24, 0.6)
            rock -= e_r(l) * math.sin(math.pi * s)
        else:
            s = (u - 1.0 / 3.0) * 1.5
            y = -WALK_STRIDE / 2 + WALK_STRIDE * s; z = 0.0
        feet[l] = base + Vector((0.0, y + WALK_BIAS[l], z))
    return T.solve(hub_z=WALK_HUB_Z, hub_rot=lean(rock, RAD(0.7) * min(1.0, rock.length)), level=True, steady=True, feet=feet)


def clip_plant(T, f, n):
    # a hitch up, then three feet strike together a little wider; the drum sinks, comes back and settles 2 cm low
    r = keys(f, [(0, FOOT_R), (3, FOOT_R - 0.05, ease_out), (5, STANCE_R, ease_in)])
    z = keys(f, [(0, 0.0), (2, 0.055, ease_out), (3, 0.06), (5, 0.0, ease_in)])
    hz = keys(f, [(0, 0.0), (3, 0.03, ease_out), (5, 0.0, ease_in), (6, -0.045, ease_out), (8, -0.012), (n, STANCE_Z)])
    pitch = RAD(keys(f, [(0, 0.0), (5, 0.0), (6, 2.5, ease_out), (n, 0.0)]))
    return T.solve(hub_z=hz, head=(0.0, pitch, 0.0), feet={l: foot(l, r, z) for l in LEGS})


def clip_aim_hold(T, f, n):
    # dipped 12 degrees and perfectly still, but for a 1 mm tremor at the tip of the vane (three beats in 0.6 s)
    roll = RAD(0.085) * math.sin(tc.TAU * 3.0 * f / n)
    return T.solve(hub_z=STANCE_Z, head=(0.0, DIP, roll), feet=planted())


def clip_fire(T, f, n):
    # the drum snaps 6 cm back at the lens in two frames (3.5 cm on its seat, the rest a 3 degree flip of the muzzle
    # and the body rocking back over the rear leg), hangs a frame, and comes forward slowly, a hair past, and is still
    back = keys(f, [(0, 0.0), (1, 0.026, ease_out), (2, 0.035, ease_out), (3, 0.033), (n - 1, -0.003), (n, 0.0)])
    pitch = keys(f, [(0, DIP), (1, DIP - RAD(2.4), ease_out), (2, DIP - RAD(3.0), ease_out), (3, DIP - RAD(2.6)), (n - 1, DIP + RAD(0.5)), (n, DIP)])
    tilt = keys(f, [(0, 0.0), (2, -RAD(0.3), ease_out), (n - 1, RAD(0.05)), (n, 0.0)])
    hz = keys(f, [(0, STANCE_Z), (2, STANCE_Z - 0.010, ease_out), (n - 1, STANCE_Z + 0.002), (n, STANCE_Z)])
    return T.solve(hub_z=hz, hub_rot=(tilt, 0.0, 0.0), head=(0.0, pitch, 0.0), head_loc=(0.0, back, 0.0), feet=planted())


def clip_flinch(T, f, n):
    # hit: the drum snaps 20 degrees aside and rolls, the body is knocked back off its front-right leg, which comes up
    yaw = RAD(keys(f, [(0, 0.0), (2, 24.0, ease_out), (3, 20.0), (5, 20.0), (n, 0.0)]))
    roll = RAD(keys(f, [(0, 0.0), (2, 7.0, ease_out), (5, 4.0), (n, 0.0)]))
    pitch = RAD(keys(f, [(0, 0.0), (2, -5.0, ease_out), (5, -2.0), (n, 0.0)]))
    tip = RAD(keys(f, [(0, 0.0), (2, 2.6, ease_out), (5, 1.4), (n, 0.0)]))
    s = span(f, 0, 6)
    c = foot("c", lerp(FOOT_R, FOOT_R - 0.09, math.sin(math.pi * s)), lift(s, 0.15, 0.6))
    return T.solve(hub_rot=lean(-e_r("c"), tip), head=(yaw, pitch, roll), feet={"c": c})


def clip_sidestep(T, f, n, sign):
    # a crab step toward +X (sign +1: its left) or -X: the leading leg reaches out and strikes, the body leans after
    # it, the other two follow one at a time. The 1.5 m of travel is code's: grounded feet slide back under the body
    lead, trail = ("b", "c") if sign > 0 else ("c", "b")
    feet = {}
    s = span(f, 0, 4)
    x = keys(f, [(0, 0.0), (4, 0.20, ease_out), (n, 0.0, lambda t: t)])
    feet[lead] = foot(lead) + Vector((sign * x, 0.0, lift(s, 0.13)))
    s = span(f, 5, 9)
    x = keys(f, [(0, 0.0), (5, -0.13, lambda t: t), (9, 0.07, ease), (n, 0.0, lambda t: t)])
    feet[trail] = foot(trail) + Vector((sign * x, 0.0, lift(s, 0.11)))
    s = span(f, 7, 11)
    x = keys(f, [(0, 0.0), (7, -0.15, lambda t: t), (11, 0.02, ease), (n, 0.0, lambda t: t)])
    feet["a"] = foot("a") + Vector((sign * x, 0.0, lift(s, 0.11)))
    tip = RAD(keys(f, [(0, 0.0), (3, 3.2, ease_out), (7, 2.0), (n, 0.0)]))
    hz = keys(f, [(0, 0.0), (4, -0.035, ease_out), (9, -0.02), (n, 0.0)])
    return T.solve(hub_z=hz, hub_rot=lean((sign, 0, 0), tip), level=True, feet=feet)


FOLD_A = RAD(40.0)                                      # the upper legs point down and out, 40 degrees off plumb
FOLD_Z = 0.088 + 0.596 * math.cos(RAD(40.0)) - HIP_Z    # the hub's drop in the folded bundle (the knee discs on the ground)
FOLD_PITCH = 62.0                                       # the drum bowed right over between the front shins: 1.1 m overall


FOLD_UP = 40.0                                          # degrees of the upper leg from plumb, toward the outside
FOLD_SHIN = 180.0 + 9.0                                 # the shin: straight up from the knee, leaning 9 degrees in
EMERGE_START = {"b": 1, "c": 6, "a": 11}                # first frame of each leg's swing
EMERGE_SWING = 14                                       # frames a leg takes: strikes on frames 15, 20 and 25


def leg_dir(l, deg):
    """Unit vector in leg l's radial plane, `deg` from straight down toward the outside (90 = out, 180 = up)."""
    a = RAD(deg)
    return e_r(l) * math.sin(a) - Vector((0, 0, math.cos(a)))


def leg_angles(l, h, k, f):
    """(upper, shin) angles as leg_dir measures them, of a leg whose hip, knee and foot lie in its radial plane."""
    u = k - h; s = f - k
    return math.degrees(math.atan2(u.dot(e_r(l)), -u.z)), math.degrees(math.atan2(s.dot(e_r(l)), -s.z))


def clip_emerge(T, f, n):
    # folded: squatting on its three knees, shins stood up beside the drum, the drum bowed over. Each leg UNFOLDS as
    # two hinges (FK, never a pole vector: the knee crosses the hip-foot line on the way): the shin leans in a hair
    # (anticipation), the upper leg lifts the knee off the ground and up past the hub while the shin swings out and
    # over through the horizontal, the foot hangs a frame above its mark, and the upper leg drops it: a strike.
    # One (front-left), two (front-right), three (rear); on the third strike the hub is pushed up between the knees,
    # past its height, and settles; the drum lifts last and snaps level
    feet = {}; knees = {}
    hz = keys(f, [(0, FOLD_Z), (25, FOLD_Z), (31, 0.03), (34, -0.008), (n, 0.0)])
    for l in LEGS:
        u = span(f, EMERGE_START[l], EMERGE_START[l] + EMERGE_SWING)
        if u >= 1.0: continue                                         # planted: the solver holds the foot from here
        g = T.legs[l]
        h = hip(l) + Vector((0, 0, FOLD_Z))
        k1, f1 = T.knee(l, h, foot(l), e_r(l) + Vector((0, 0, 0.35)))
        up1, shin1 = leg_angles(l, h, k1, f1)                         # the planted pose under the folded hub: 104, -14
        up = keys(u, [(0, FOLD_UP), (0.5, up1 + 21.0, lambda t: ease_out(t, 1.7)), (0.84, up1 + 8.0), (1.0, up1, lambda t: ease_in(t, 1.8))])
        shin = keys(u, [(0, FOLD_SHIN), (0.12, FOLD_SHIN + 6.0, ease_out), (0.84, shin1), (1.0, shin1)])
        k = h + leg_dir(l, up) * g["U"]
        knees[l] = k; feet[l] = k + leg_dir(l, shin) * g["L"]
    pitch = RAD(keys(f, [(0, FOLD_PITCH), (1, FOLD_PITCH), (3, FOLD_PITCH + 2.5, ease_out), (6, FOLD_PITCH), (24, FOLD_PITCH), (26, FOLD_PITCH + 3.0),
                         (32, -3.0), (34, 1.0), (n, 0.0)]))
    return T.solve(hub_z=hz, head=(0.0, pitch, 0.0), feet=feet, knees=knees)


DIE = dict(tilt=0.50, hz=-0.735, pitch=1.50, yaw=0.10, roll=0.12, loc=(0.03, -0.07, 0.09),
           b=(1.33, -0.56, 0.032), c=(-0.64, -0.14, 0.0), a=(0.05, 0.47, 0.04))


def clip_die_fold(T, f, n):
    # a dropped tripod: the shot knocks the drum back; the front-left leg slides out from under it; the hub falls
    # forward between the legs until the plumb bob stabs the ground and props it; the drum tips right over, comes
    # off its seat and lands on its eye and the tips of its rods, rings once (a bounce) and lies still.
    # It STARTS ON THE AIM POSE (planted stance, hub 2 cm low, drum dipped 12 degrees): it is killed through the lens
    # while it holds still to fire, and the knock-back of frames 0 to 2 throws the dip off
    D = DIE; P = planted(); Z = STANCE_Z
    fall = lambda t: ease_in(t, 2.2)
    tilt = keys(f, [(0, 0.0), (2, -0.035, ease_out), (10, 0.11), (20, D["tilt"], fall), (22, D["tilt"] - 0.03, ease_out), (25, D["tilt"], ease_in)])
    hz = keys(f, [(0, Z), (2, Z + 0.012, ease_out), (10, -0.11), (20, D["hz"], fall), (22, D["hz"] + 0.03, ease_out), (25, D["hz"], ease_in)])
    pitch = keys(f, [(0, DIP), (2, -RAD(7.0), ease_out), (10, 0.16), (20, D["pitch"], fall), (22, D["pitch"] - 0.13, ease_out), (25, D["pitch"], ease_in)])
    yaw = keys(f, [(0, 0.0), (10, 0.0), (20, D["yaw"])])
    roll = keys(f, [(0, 0.0), (2, RAD(4.0), ease_out), (10, 0.0), (20, D["roll"]), (22, D["roll"] + 0.04), (25, D["roll"])])
    off = keys(f, [(0, 0.0), (12, 0.0), (20, 1.0, fall)])
    feet = {}; poles = {}
    kb = keys(f, [(0, 0.0), (2, 0.02), (12, 0.55, fall), (20, 1.0, lambda t: t)])
    feet["b"] = P["b"].lerp(Vector(D["b"]), kb)
    poles["b"] = (e_r("b") + Vector((0, 0, 0.35))).lerp(e_r("b") * 0.25 + Vector((0, 0, 1.0)), span(f, 4, 20))
    kc = keys(f, [(0, 0.0), (11, 0.0), (20, 1.0)])
    feet["c"] = P["c"].lerp(Vector(D["c"]), kc)
    poles["c"] = (e_r("c") + Vector((0, 0, 0.35))).lerp(Vector((-0.75, 0.55, 0.45)), span(f, 7, 20))
    ka = keys(f, [(0, 0.0), (13, 0.0), (21, 1.0)])
    feet["a"] = P["a"].lerp(Vector(D["a"]), ka)
    poles["a"] = (e_r("a") + Vector((0, 0, 0.35))).lerp(Vector((0.95, 0.1, 0.32)), span(f, 7, 21))
    return T.solve(hub_z=hz, hub_rot=(tilt, 0.0, 0.0), head=(yaw, pitch, roll), head_loc=tuple(v * off for v in D["loc"]), feet=feet, poles=poles)


CLIPS = {
    "idle_scan": clip_idle_scan, "walk": clip_walk, "emerge": clip_emerge, "plant": clip_plant, "aim_hold": clip_aim_hold,
    "fire": clip_fire, "flinch": clip_flinch, "die_fold": clip_die_fold,
    "sidestep_l": lambda T, f, n: clip_sidestep(T, f, n, 1.0), "sidestep_r": lambda T, f, n: clip_sidestep(T, f, n, -1.0),
}


def animate(arm, T):
    acts = []
    for c in manifest.asset(ASSET)["animations"]:
        name = c["name"]; n = anim.frames(ASSET, name); fn = CLIPS[name]
        act = anim.new_action(arm, name)
        for f in range(n + 1):
            anim.key_pose(arm, f, fn(T, 0 if (c["loop"] and f == n) else f, n))      # a loop ends on its first pose, exactly
        anim.set_interpolation(act, 'LINEAR')
        anim.fix_quaternion_flips(act)
        acts.append(act)
    anim.push_to_nla(arm, acts)


# ------------------------------------------------------------------------------------------------ build
def build(args):
    bones = [("root", (0, 0, 0), (0, 0, 0.2), None), ("head", tuple(PIVOT), (0, 0, DRUM_Z), "root")]
    for l in LEGS:
        bones.append((f"leg_{l}_upper", tuple(hip(l)), tuple(knee(l)), "root"))
        bones.append((f"leg_{l}_lower", tuple(knee(l)), tuple(foot(l)), f"leg_{l}_upper"))
    arm = rig.make_armature(ASSET + "_rig", bones)
    parts = {"root": build_hub(), "head": build_head()}
    for l in LEGS:
        parts[f"leg_{l}_upper"], parts[f"leg_{l}_lower"] = build_leg(l)
    body = rig.join_as_rigid_skin(parts, arm, ASSET + "_mesh")
    paint_body(body)
    # sockets ride the head: the centre of the weak point (and the thread's origin), and where a stake leaves the rack
    lens = export.marker("lens", (0.0, LENS_FRONT + 0.016, DRUM_Z))
    muzzle = export.marker("stake_muzzle", (0.0, MUZZLE_Y, 1.305))
    rig.parent_to_bone(lens, arm, "head"); rig.parent_to_bone(muzzle, arm, "head")
    T = tc.Tripod(arm, {l: {"H": hip(l), "K": knee(l), "F": foot(l), "er": e_r(l)} for l in LEGS}, PIVOT)
    animate(arm, T)


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    export.export_asset(ASSET, args.out, blend=args.blend)
    if args.preview: export.preview(ASSET, args.out, clips=True)


if __name__ == "__main__":
    scene.run(main)
