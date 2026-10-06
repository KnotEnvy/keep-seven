"""prop_coat_hung: a work coat on a peg, 0.5 x 1.1 x 0.15 m, `workcloth` family colours (ART_BIBLE 7.4, peg stair; P0).
Three variant nodes, each ONE mesh and one material (instanced dressing with wind):

    coat_long    a long coat hung by its collar: slumped shoulders, flat empty sleeves against the flanks, a ragged hem at 1.1 m
    coat_short   a short jacket, a patched elbow, one sleeve turned
    coat_shawl   a three-cornered shawl thrown over the peg: the long point down the back, one end thrown across the front, a fringe

Pivot: the peg (top; the fixed end): the meshes hang BELOW the origin, so the wind weight is the distance below the
pivot (mesh extra `wind` = 1). The peg itself is zone geometry. The back, against the wall, is not modelled.

    node tools/build-assets.mjs --only prop_coat_hung
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

ASSET = "prop_coat_hung"
BAND = "ks_band"


import random


def _rows(vs):
    """Rows of a sheet at chosen heights instead of even ones (a row at the shoulder line, one at the hem)."""
    n = len(vs) - 1
    def remap(v): return vs[min(n, int(round(v * n)))]
    return remap


def coat(name, seed, H, cell, colour, sleeves, nu=6):
    """A coat hung by the loop inside its collar: everything falls from one point, so the shoulders slump into two
    slopes, the fronts hang open over a dark gap, and the empty sleeves hang flat against the flanks (wide face to the
    room, their inner half lost in the body: no daylight between sleeve and coat)."""
    rng = random.Random(seed)
    hem = [rng.uniform(-0.045, 0.02) for _ in range(nu + 1)]
    fold = [0.0, 0.9, -0.5, 1.0, -0.7, 0.8, 0.0]                        # the long folds, front out / back in, never even
    SH = 0.15                                                           # the shoulder line, as a fraction of the height
    row = _rows([0.0, SH, 0.42, 0.74, 1.0])
    def width(v):
        if v < SH: return 0.07 + (0.37 - 0.07) * (v / SH) ** 0.7
        return 0.37 + 0.09 * (v - SH) / (1 - SH)                       # it flares to the hem
    def depth(v):
        if v < SH: return 0.045 + 0.085 * (v / SH)
        return 0.13 - 0.02 * (v - SH) / (1 - SH)
    def fn(u, v):
        v = row(v)
        iu = min(nu, int(round(u * nu)))
        e = abs(2 * u - 1)
        x = (u - 0.5) * width(v)
        y = -depth(v) * math.sin(math.pi * u) ** 0.42 - 0.024 * fold[iu] * min(1.0, v * 3.0)
        z = -H * v - 0.085 * e ** 1.4 * min(1.0, v / SH) * max(0.0, 1 - (v - SH) * 2.2) - 0.012 + hem[iu] * v ** 3
        return (x, y, z)
    body = dc.sheet(name + "_body", nu, 4, fn, flip=True)
    dc.paint(body, cell, colour)
    parts = [body]
    zs = -H * SH - 0.07                                                 # where a sleeve leaves the shoulder
    for s, (length, turn) in zip((-1, 1), sleeves):
        if length <= 0: continue
        xs = s * 0.185
        pts = [(s * 0.15, -0.062, zs + 0.035), (xs + s * 0.012, -0.082 - turn * 0.012, zs - length * 0.52),
               (xs + s * (0.004 - turn * 0.02), -0.070 - turn * 0.02, zs - length)]
        sl = dc.tube(f"{name}_sleeve{s}", pts, r=[0.062, 0.088, 0.074], sides=4, cap=True, flat=(1.0, 0.42), phase=math.pi / 4, up=(1, 0, 0))
        dc.drop_faces(sl, lambda c, n: n.z > 0.5)                       # the shoulder end is inside the coat
        dc.paint(sl, cell, colour, shade=0.9); parts.append(sl)
    # the collar: two lapels falling open from the peg, and the near front edge turned back down the opening
    col = dc.poly(name + "_collar", [[(-0.004, -0.050, -0.004), (-0.105, -0.128, -0.135), (-0.020, -0.150, -0.245)],
                                     [(0.004, -0.050, -0.004), (0.020, -0.150, -0.235), (0.10, -0.128, -0.125)]])
    dc.paint(col, cell, colour, shade=1.15); parts.append(col)
    zt = -H * 0.97
    zm = -0.24 + (zt + 0.24) * 0.5
    placket = dc.poly(name + "_front", [[(0.012, -0.150, -0.23), (0.012, -0.166, zm), (0.052, -0.156, zm), (0.042, -0.146, -0.23)],
                                        [(0.012, -0.166, zm), (0.02, -0.150, zt), (0.064, -0.140, zt + 0.02), (0.052, -0.156, zm)]])
    dc.paint(placket, cell, colour, shade=1.08); parts.append(placket)
    return parts


STRIPE = "#4E736E"            # the town's paint, as yarn: the woven border of the shawl
STRIPE_BODY = (0.80, 0.90)    # the border band, as fractions of the back layer's fall
FRINGE = 0.045


def shawl(name, seed, cell, colour):
    """A woven shawl folded over the peg: gathered at the top, falling wide and square, the back layer long with a
    shallow point, one end thrown across the front and hanging shorter. Each layer ends in a border stripe (its own
    row of faces, sharp-edged so the colour is a band and not a blur) and a fringe of long teeth below it."""
    rng = random.Random(seed)
    nu = 8
    H = 0.86
    row = _rows([0.0, 0.14, STRIPE_BODY[0], STRIPE_BODY[1], 1.0])
    ripple = [0.0, 0.8, -0.6, 1.0, -0.3, 0.9, -0.7, 0.6, 0.0]
    def back(u, v):
        v = row(v)
        iu = min(nu, int(round(u * nu)))
        e = abs(2 * u - 1)
        w = 0.08 + 0.36 * min(1.0, v / 0.14) ** 0.7 + 0.06 * v
        x = (u - 0.5) * w
        y = -(0.04 + 0.06 * min(1.0, v / 0.14)) * math.sin(math.pi * u) ** 0.5 - 0.024 * ripple[iu] * min(1.0, v * 3.0)
        z = -0.012 - H * v * (1.0 - 0.20 * abs(2 * u - 1.1) ** 1.3) - 0.07 * e ** 1.4 * min(1.0, v / 0.14) * max(0.0, 1 - v * 1.6)
        if v > 0.99: z += (-FRINGE if iu % 2 else 0.012)                # the fringe: long teeth
        return (x, y, z)
    body = dc.sheet(name + "_body", nu, 4, back, flip=True)
    dc.paint(body, cell, colour)
    mu = 4
    rip2 = [0.0, 0.7, -0.5, 0.8, 0.0]
    rowf = _rows([0.0, 0.14, 0.80, 1.0])
    def front(u, v):
        v = rowf(v)
        iu = min(mu, int(round(u * mu)))
        w0, w1 = -0.225, 0.045                                          # the thrown end covers the left half
        x = w0 + (w1 - w0) * u + 0.03 * v
        y = -0.066 - 0.075 * min(1.0, v / 0.14) * math.sin(math.pi * (0.12 + 0.76 * u)) ** 0.5 - 0.020 * rip2[iu] * min(1.0, v * 3.0)
        z = -0.035 * (1 - u) - 0.006 - 0.50 * v * (0.72 + 0.28 * u) - 0.05 * (1 - u) * min(1.0, v / 0.14)
        if v > 0.99: z += (-FRINGE * 0.8 if iu % 2 else 0.01)
        if v < 0.01: x, y, z = 0.012 * (2 * u - 1) - 0.01, -0.052, -0.006   # gathered on the peg
        return (x, y, z)
    flap = dc.sheet(name + "_flap", mu, 3, front, flip=True)
    dc.paint(flap, cell, colour, shade=1.12)
    body["stripe_rows"] = 1; flap["stripe_rows"] = 1
    return [body, flap]


def build(args):
    specs = [("coat_long", coat("coat_long", args.seed + 1, 1.085, "linen", "#54402F", ((0.60, 0.0), (0.64, 0.5)))),
             ("coat_short", coat("coat_short", args.seed + 2, 0.70, "linen", "workcloth_light", ((0.50, 1.0), (0.45, 0.0)))),
             ("coat_shawl", shawl("coat_shawl", args.seed + 3, "linen", "#9A8266"))]
    for name, parts in specs:
        if name == "coat_shawl":                                        # mark the border faces (by sheet row) before the join
            for o, (nu_, nv_, band, fringe) in zip(parts, ((8, 4, 2, 3), (4, 3, 2, 2))):
                at = o.data.attributes.new(BAND, 'INT', 'FACE')
                vals = [(2 if (i // nu_) == fringe and fringe != band else 1 if (i // nu_) == band else 0) for i in range(len(o.data.polygons))]
                at.data.foreach_set("value", vals)
        ob = dc.join(parts, name)
        dc.smooth(ob, angle=38)
        band_of = None
        if BAND in ob.data.attributes:
            me = ob.data
            bv = np.zeros(len(me.polygons), dtype=np.int32); me.attributes[BAND].data.foreach_get("value", bv)
            me.attributes.remove(me.attributes[BAND])
            # the edges between a border face and its neighbours are sharp: a hard colour step
            import bmesh
            bm = bmesh.new(); bm.from_mesh(me); bm.edges.ensure_lookup_table()
            sharp = [e.index for e in bm.edges if len(e.link_faces) == 2 and bv[e.link_faces[0].index] != bv[e.link_faces[1].index]]
            bm.free()
            for i in sharp: me.edges[i].use_edge_sharp = True
            me.update()
            band_of = bv
        dc.bake_ao([ob], distance=0.25, ground=None)
        zmin = min(v.co.z for v in ob.data.vertices)

        def cloth(p, name=name, zmin=zmin, band_of=band_of):
            t = np.clip(p.z / zmin, 0, 1)
            p.mix(np.clip((t - 0.78) / 0.22, 0, 1) * 0.5, "sand")      # the hem drags in the dust of the stair
            p.mul(np.clip(1.0 - t / 0.10, 0, 1), 0.75)                  # gathered dark at the peg
            p.mul(np.clip(-p.nrm[:, 0] * np.sign(p.x), 0, 1) * (np.abs(p.x) < 0.17), 0.8)   # the insides of the folds
            if name != "coat_shawl":
                gap = np.clip(1.0 - np.abs(p.x - 0.004) / 0.012, 0, 1) * (p.y < -0.1) * (t > 0.2)
                p.mix(gap * 0.75, "#1F1714")                           # the dark of the open front
                p.mix((np.abs(np.abs(p.x) - 0.17) < 0.07) * np.clip(1.0 - np.abs(t - 0.17) / 0.09, 0, 1) * 0.35, "#8A7462")   # shoulders rubbed pale
                p.mix((p.fnrm[:, 2] < -0.8) * 0.9, "#1F1714")           # the dark inside a cuff
            if name == "coat_short":
                p.mix(dc.P.near(p, (0.20, -0.10, -0.42), 0.11) * 0.9, "#9A846E")   # the patched elbow: paler cloth
            if name == "coat_shawl":
                b = band_of[p.face]
                p.mix((b == 1) * 0.95, STRIPE)                          # the woven border
                p.mix((b == 2) * 0.55, "#D8CDB4")                       # the fringe: undyed yarn, paler than the cloth
                p.mul((b == 2) * np.clip(1.0 - np.abs(np.sin(p.x * 60.0)), 0, 1), 0.8)
            if name == "coat_long":
                p.mul(dc.P.near(p, (-0.11, -0.14, -0.58), 0.17), 0.8)   # a pocket's worth of old stain
        dc.compose(ob, ao=0.9, gradient=(1.0, 1.0), part_jitter=0.04, face_jitter=0.0, seed=args.seed, painters=[cloth], quiet=True)
        ob["wind"] = 1


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
