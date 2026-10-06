"""prop_camp_ash: a ring of seven fist stones, 0.7 m across, round a bed of grey ash with three charred stick ends,
swept clean round it (ART_BIBLE 7.4, P0). Two variant nodes (the zone embeds one):

    ash_cold     the town's own ash in the Tally House firebox, four days dead: grey, slumped, the sticks burnt out
    ash_embers   STOP THREE, the Dowser's only fire: neat; orange emissive cells between the sticks, one white-hot
                 (m_emis faces: they keep their material when the zone embeds the variant; G = 0.5: the flicker group)

Pivot: centre at ground. `m_prop` + `m_emis`.

    node tools/build-assets.mjs --only prop_camp_ash
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _d)
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
import math
import numpy as np
from mathutils import Vector, Matrix
from lib import scene, mesh, uv, material, vcol, export, manifest, layout
import dress_common as dc

ASSET = "prop_camp_ash"


R_RING = 0.275                 # stone centres; the ring is 0.7 m across over the stones


def variant(name, seed, embers):
    rng = scene.rng(seed)
    j = lambda a: rng.uniform(-a, a)
    parts = []
    # ---- seven fist stones, each its own shape, set shoulder to shoulder (the Dowser's are evenly spaced)
    for k in range(7):
        a = 2 * math.pi * (k + 0.5) / 7 + (j(0.03) if embers else j(0.11))
        r = R_RING + (j(0.006) if embers else j(0.03))
        sz = (rng.uniform(0.19, 0.235), rng.uniform(0.12, 0.15), rng.uniform(0.10, 0.135))   # long axis along the ring
        st = dc.rock(f"{name}_stone{k}", sz, rng, rough=0.17, flat_bottom=-0.6)
        dc.place(st, (math.cos(a) * r, math.sin(a) * r, sz[2] * 0.28), (j(0.12), j(0.12), a + math.pi / 2 + j(0.22)))
        dc.smooth(st, angle=48)
        dc.paint(st, "sand_pale", rng.choice(("#7E4A3A", "rock_dark", "#806658", "#735046", "#8C5B48")), shade=rng.uniform(0.82, 1.0))
        parts.append(st)
    # ---- the ash bed: a low mound, lumpy, a little higher where the fire's heart was
    seg = 8
    def lump(v):
        d = math.hypot(v.x, v.y)
        return Vector((v.x * (1 + j(0.05)), v.y * (1 + j(0.05)), v.z + (j(0.006) if d > 0.02 else 0.0)))
    bed = dc.lathe(f"{name}_ash", [(0.225, 0.004), (0.14, 0.032 if embers else 0.022), (0.0, 0.045 if embers else 0.028)], seg=seg, phase=j(0.4), warp=lump)
    dc.smooth(bed, angle=40)
    dc.paint(bed, "chalk", "ash", shade=0.95)
    parts.append(bed)
    # ---- three charred stick ends, laid in toward the middle like spokes (he feeds a fire from the ends)
    glow = []
    for k in range(3):
        a = (2.2 if embers else 2.0) * k + 0.5 + j(0.15)
        ca, sa = math.cos(a), math.sin(a)
        r0, r1 = (0.21 + j(0.015)), (0.07 + j(0.015))
        p0 = (ca * r0, sa * r0, 0.035 + j(0.004)); p1 = (ca * (r0 + r1) / 2, sa * (r0 + r1) / 2, 0.047); p2 = (ca * r1, sa * r1, 0.052 if embers else 0.04)
        st = dc.tube(f"{name}_stick{k}", [p0, p1, p2], r=[0.021, 0.019, 0.012], sides=4, cap=True, phase=j(0.6), up=(0, 0, 1))
        dc.smooth(st, angle=40)
        dc.paint(st, "chalk", "#2A2623" if not embers else "#3B2A22", shade=rng.uniform(0.85, 1.0))
        if embers: glow.append((st, p2))
        parts.append(st)
    if embers:
        # the heart of the fire: embers lying in the ash between the stick ends; one of them white-hot
        cells = []
        for k in range(6):
            a = 1.05 * k + 0.2 + j(0.2); r = (0.03 + 0.012 * k) if k else 0.0
            c = Vector((math.cos(a) * r, math.sin(a) * r, 0.049 - r * 0.07))
            s = 0.02 + j(0.004) if k else 0.024
            t = j(1.0)
            pts = [(c.x + math.cos(t + q * math.pi / 2) * s * (1.0 + (0.4 if q % 2 else 0.0)), c.y + math.sin(t + q * math.pi / 2) * s, c.z + (0.006 if q == 0 else 0.0)) for q in range(4)]
            cells.append(pts)
        em = dc.poly(f"{name}_embers", cells)
        dc.emis(em, "flame", intensity=0.85, flicker=0.5)
        dc.emis(em, "flame_core", faces=[0], intensity=1.0, flicker=0.5)
        parts.append(em)
    else:
        # four days dead: a few knuckles of charcoal, and the bed has been rained on by dust
        for k in range(3):
            a = 2.3 * k + 1.1; r = 0.07 + 0.03 * k
            ch = dc.rock(f"{name}_char{k}", (0.05, 0.035, 0.03), rng, centre=(math.cos(a) * r, math.sin(a) * r, 0.034), rough=0.25, flat_bottom=-0.4)
            dc.paint(ch, "chalk", "#2A2623", shade=rng.uniform(0.8, 1.1)); parts.append(ch)
    ob = dc.join(parts, name)
    dc.drop_faces(ob, lambda c, n: n.z < -0.75 and c.z < 0.02)         # undersides on the ground
    dc.bake_ao([ob], distance=0.2)

    def soot(p):
        rad = np.hypot(p.x, p.y)
        stone = (rad > 0.2) & (p.col[:, 0] < 0.45) & (p.col[:, 0] > 0.03)
        inward = -(p.nrm[:, 0] * p.x + p.nrm[:, 1] * p.y) / np.maximum(rad, 1e-4)
        p.mix(stone * np.clip(inward * 1.2, 0, 1) * 0.75, "#1E1A19")    # the stones are blacked on the fire side
        ash = (rad < 0.25) & (p.col[:, 0] > 0.2)
        p.mix(ash * np.clip(1.0 - rad / 0.16, 0, 1) * (0.55 if embers else 0.15), "#3A3330" if embers else "#C9C4BA")
        if embers:
            p.mix(ash * np.clip(1.0 - rad / 0.08, 0, 1) * 0.5, "#5A2A14")   # the ash under the embers is still lit from within
            stick = (p.col[:, 0] < 0.08) & (rad < 0.2)
            p.mix(stick * np.clip(1.0 - rad / 0.11, 0, 1) * 0.8, "#6B2A10") # the stick ends: charred to a red rind
        else:
            p.mix(ash * (p.nrm[:, 2] > 0.6) * 0.25, "sand")              # four days of dust
    dc.compose(ob, ao=0.85, gradient=(0.85, 1.05), part_jitter=0.06, face_jitter=0.0, seed=seed, painters=[soot], contact=(0.02, 0.65), quiet=True)
    return ob


def build(args):
    variant("ash_cold", args.seed + 10, False)
    variant("ash_embers", args.seed + 20, True)


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
