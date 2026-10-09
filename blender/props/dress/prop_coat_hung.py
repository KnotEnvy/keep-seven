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
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "tex"))
import cloth_atlas as cl            # pass i2: the painted cloth in the free rows of tx_palette

ASSET = "prop_coat_hung"
BAND = "ks_band"


import random


def _cloth(ob, region, fn, colour, shade=1.0):
    """Pass i2 (the reviewer: "faceted black ribbons", "a cloth texture with a baked fold shadow"): the part's UV0 goes
    into a painted region of tx_palette (blender/tex/cloth_atlas.py) and its colour is divided by that region's base."""
    cl.map_by_position(ob, uv, fn)
    vcol.fill_color(ob, cl.BASE[region], dc.CELL)
    lim = np.asarray(vcol.rgb(cl.BASE[region]), np.float32)
    vcol.fill_color(ob, tuple(np.minimum(np.asarray(vcol.rgb(colour), np.float32) * shade, lim)), dc.TINT)


def _as_coat(H):
    """The hung coat laid on the Biders' own coat cloth, true to scale: the peg is the collar, x runs round the front."""
    k = (cl.COAT_ZT - cl.COAT_ZB) / 1.085
    return lambda x, y, z: cl.coat_uv(max(-172.0, min(172.0, x / 0.20 * 62.0)), max(cl.COAT_ZB, cl.COAT_ZT + z * k))


def _as_weave():
    """Plain cloth of the coat's own dye for the small parts (lapels, the collar's roll): the middle of the sleeve cloth,
    clear of its cuff and its elbow creases."""
    return lambda x, y, z: cl.sleeve_uv(min(0.9, max(0.1, 0.5 + x * 2.2)), min(0.42, max(0.12, 0.12 - z * 1.1)))


def _rows(vs):
    """Rows of a sheet at chosen heights instead of even ones (a row at the shoulder line, one at the hem)."""
    n = len(vs) - 1
    def remap(v): return vs[min(n, int(round(v * n)))]
    return remap


def slab(name, nu, nv, fn, nb=2, back=0.035, top=0.012):
    """Pass i3 (the reviewer: "flat paper ribbons ... single-sided strips, no thickness ... cut from card"). A hanging cloth
    with a FAR SIDE: the front is the sheet fn(u, v) exactly as `dc.sheet(..., flip=True)` made it (same vertices, same
    face order: faces 0 .. nu * nv - 1), and behind it a flatter back of `nb` columns that hangs `back` metres behind
    the front's own edges (the peg stands that proud of the wall), joined to it down both sides, across the hem (the
    dark inside, seen from the flight below) and over the top. One closed, welded shell: smooth round its edges.
    -> (object, {'front': [...], 'back': [...], 'side': [...], 'hem': [...]}) polygon indices."""
    import bmesh
    bm = mesh.new_bmesh()
    g = [[bm.verts.new(Vector(fn(i / nu, j / nv))) for i in range(nu + 1)] for j in range(nv + 1)]
    idx = {"front": [], "back": [], "side": [], "hem": []}
    def add(vs, kind): idx[kind].append(len(bm.faces)); bm.faces.new(vs)
    for j in range(nv):
        for i in range(nu): add((g[j][i], g[j + 1][i], g[j + 1][i + 1], g[j][i + 1]), "front")
    h = []
    for j in range(nv + 1):
        v = j / nv; row = []
        e0, e1 = Vector(fn(0.0, v)), Vector(fn(1.0, v))
        d = top + (back - top) * min(1.0, v / 0.2)
        for k in range(nb + 1):
            u = k / nb; pf = Vector(fn(0.08 + 0.84 * u, v)); pe = e0.lerp(e1, u)
            row.append(bm.verts.new((pe.x * 0.97, max(e0.y, e1.y) + d * (0.75 + 0.25 * math.sin(math.pi * u)), pf.z)))
        h.append(row)
    for j in range(nv):
        for k in range(nb): add((h[j][k], h[j][k + 1], h[j + 1][k + 1], h[j + 1][k]), "back")
        add((g[j][0], h[j][0], h[j + 1][0], g[j + 1][0]), "side")
        add((g[j][nu], g[j + 1][nu], h[j + 1][nb], h[j][nb]), "side")
    add(list(g[nv]) + list(reversed(h[nv])), "hem")
    add(list(reversed(g[0])) + list(h[0]), "side")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    ob = dc._obj(name, bm)
    return ob, idx


def _as_coat_back(H):
    """The far side of a hung coat: the BACK of the Biders' coat cloth (the back seam at the middle)."""
    k = (cl.COAT_ZT - cl.COAT_ZB) / 1.085
    return lambda x, y, z: cl.coat_uv((1.0 if x >= 0 else -1.0) * max(118.0, 176.0 - abs(x) / 0.20 * 58.0), max(cl.COAT_ZB, cl.COAT_ZT + z * k))


def coat(name, seed, H, cell, colour, sleeves, nu=6):
    """A coat hung by the loop inside its collar: everything falls from one point, so the shoulders slump into two
    slopes, the fronts hang open under a turned collar, and the empty sleeves hang flat against the flanks (wide face
    to the room, their inner half lost in the body: no daylight between sleeve and coat).

    Release pass p0 (the reviewer: "faceted olive blobs at arm's length"): the body is a thin smooth-shaded sheet (9 cm
    at the shoulder, was 13) whose long folds deepen toward the hem; the collar is two notched lapels (quads) standing
    4 cm proud of a dark neck; one front edge laps the other. The form is in COLOR_0 (`cloth` below): the stair lights
    every upright face the same, so the folds are painted, not left to the facets."""
    rng = random.Random(seed)
    hem = [rng.uniform(-0.028, 0.012) for _ in range(nu + 1)]             # pass i1: was -0.05 .. 0.02, a saw-toothed hem
    fold = [0.0, 0.9, -0.8, 0.15, 1.0, -0.9, 0.0]                       # the long folds, front out / back in, never even
    SH = 0.15                                                           # the shoulder line, as a fraction of the height
    WS = 0.38
    row = _rows([0.0, SH, 0.40, 0.72, 1.0])
    def width(v):
        if v < SH: return 0.08 + (WS - 0.08) * (v / SH) ** 0.75
        return WS + 0.05 * (v - SH) / (1 - SH)                          # it flares a little to the hem
    def depth(v):
        if v < SH: return 0.04 + 0.05 * (v / SH)
        return 0.09 - 0.025 * (v - SH) / (1 - SH)
    def fn(u, v):
        v = row(v)
        iu = min(nu, int(round(u * nu)))
        e = abs(2 * u - 1)
        x = (u - 0.5) * width(v)
        # pass i1 (the reviewer: "a few flat triangles with hard facets"): the folds were 3.6 cm deep at 6 cm apart, sharper
        # than the 80 degrees `smooth` keeps soft, so every fold was a hard facet. Heavy cloth: 2 cm deep, all of it smooth
        y = -depth(v) * math.sin(math.pi * u) ** 0.6 - (0.007 + 0.014 * v) * fold[iu] * min(1.0, v / SH)
        z = -H * v - 0.085 * e ** 1.4 * min(1.0, v / SH) * max(0.0, 1 - (v - SH) * 2.2) - 0.012 + hem[iu] * v ** 3 + 0.034 * e ** 5 * v ** 8      # (pass i3: the hem's corners are cut round)
        return (x, y, z)
    # pass i3: a closed body (front, far side, flanks, the hem's dark inside), not a single-sided sheet
    body, bi = slab(name + "_body", nu, 4, fn)
    dc.paint(body, cell, colour); _cloth(body, "coat", _as_coat(H), colour)
    cl.map_by_position(body, uv, _as_coat_back(H), faces=bi["back"])
    parts = [body]
    zs = -H * SH - 0.07                                                 # where a sleeve leaves the shoulder
    for s, (length, turn) in zip((-1, 1), sleeves):
        if length <= 0: continue
        xs = s * 0.2
        pts = [(s * 0.16, -0.05, zs + 0.035), (xs + s * 0.008, -0.068 - turn * 0.012, zs - length * 0.52),
               (xs + s * (0.0 - turn * 0.02), -0.058 - turn * 0.02, zs - length)]
        sl = dc.tube(f"{name}_sleeve{s}", pts, r=[0.056, 0.074, 0.066], sides=6, cap=True, flat=(1.0, 0.50), phase=math.pi / 6, up=(1, 0, 0))   # pass i3: six sides (four were a plank)
        dc.drop_faces(sl, lambda c, n: n.z > 0.5)                       # the shoulder end is inside the coat
        dc.paint(sl, cell, colour, shade=0.92); _cloth(sl, "coat", _as_coat(H), colour, 0.92); parts.append(sl)
    # the collar: two notched lapels falling open from the peg, proud of the neck
    col = dc.poly(name + "_collar", [[(-0.004, -0.052, -0.004), (-0.118, -0.112, -0.115), (-0.082, -0.134, -0.205), (-0.014, -0.128, -0.275)],
                                     [(0.004, -0.052, -0.004), (0.016, -0.130, -0.262), (0.078, -0.134, -0.195), (0.112, -0.112, -0.105)]])
    dc.paint(col, cell, colour, shade=1.2); _cloth(col, "sleeve", _as_weave(), colour, 1.2); parts.append(col)   # pass i3: the lapels are cloth too (plain weave, no seams)
    # pass i3: ... and the ROLL of the collar itself, round the back of the neck and down the outside of both lapels (the
    # lapels were two flat quads with a knife edge: the roll gives them a thickness and the peg something to hang by)
    roll = dc.tube(name + "_roll", [(-0.090, -0.128, -0.200), (-0.124, -0.104, -0.108), (0.0, -0.022, 0.002),
                                    (0.118, -0.104, -0.100), (0.086, -0.128, -0.190)],
                   r=[0.012, 0.022, 0.026, 0.022, 0.012], sides=3, cap=True, flat=(1.0, 0.7), phase=math.pi / 6, up=(0, -1, 0.4))
    dc.paint(roll, cell, colour, shade=1.12); _cloth(roll, "sleeve", _as_weave(), colour, 1.12); parts.append(roll)
    # the near front edge, lapping the other from the collar to the hem
    zt = -H * 0.975
    placket = dc.poly(name + "_front", [[(0.010, -0.132, -0.262), (0.014, -0.118, zt), (0.060, -0.104, zt + 0.02), (0.054, -0.122, -0.262)]])
    dc.paint(placket, cell, colour, shade=1.1); _cloth(placket, "coat", _as_coat(H), colour, 1.1); parts.append(placket)
    return parts


STRIPE = "#4E736E"            # the town's paint, as yarn: the woven border of the shawl
STRIPE_BODY = (0.80, 0.90)    # the border band, as fractions of the back layer's fall
FRINGE = 0.045
FOLD = (0.66, 0.46)       # the painted light on the folds: floor and swing (COLOR_0)
FOLD_SHAWL = (0.56, 0.60)


def shawl(name, seed, cell, colour):
    """A woven shawl thrown over the peg: bunched on the peg, its two ends hanging side by side, the back one long and
    to the right, the front one shorter, to the left and lapping it. Each end is cut on the slant (a low corner), with
    the border stripe (its own row of faces, sharp-edged so the colour is a band and not a blur) and a fringe of long
    teeth below it.

    Release pass p0: it was one wide square fall with a flap, 0.45 m across from the peg down: at arm's length on the
    stair "a faceted olive blob". Two narrow ends with deep long folds and a slanted hem have a silhouette."""
    rng = random.Random(seed)
    nu = 5
    def end(tag, H, x0, drift, wide, low, rip, y0, rows):
        row = _rows(rows)
        def fn(u, v):
            v = row(v)
            iu = min(nu, int(round(u * nu)))
            g = min(1.0, v / 0.34) ** 0.8                               # gathered at the peg, fanning out over the first third
            w = 0.035 + (wide - 0.035) * g + 0.03 * v
            x = x0 * g + drift * v + (u - 0.5) * w
            y = y0 - 0.03 * g * math.sin(math.pi * (0.1 + 0.8 * u)) ** 0.6 - (0.008 + 0.014 * v) * rip[iu] * g      # pass i1: soft folds (it was 4.4 cm deep at 5 cm apart: facets)
            slant = (u if low > 0 else 1 - u)                           # the low corner
            z = -0.010 - H * v * (1.0 - 0.17 * (1 - slant)) - 0.03 * abs(2 * u - 1) ** 1.4 * g * max(0.0, 1 - v * 1.6)
            if v > 0.99: z += (-FRINGE if iu % 2 else -FRINGE * 0.62)   # the fringe: an uneven edge of yarn (pass i1: it was 5.7 cm teeth, "shards")
            return (x, y, z)
        o, _ = slab(f"{name}_{tag}", nu, 4, fn, nb=2, back=0.016, top=0.008)      # pass i3: wool has a thickness and a far side
        o["stripe_rows"] = 1
        return o
    body = end("body", 0.90, 0.075, 0.035, 0.25, 1, [0.0, 0.9, -0.8, 0.7, -0.5, 0.0], -0.035, [0.0, 0.10, STRIPE_BODY[0], STRIPE_BODY[1], 1.0])
    dc.paint(body, cell, colour)
    wv = lambda x0, w, Hh: (lambda x, y, z: cl.weave_uv(min(1.0, max(0.0, (x - x0) / w + 0.5)), min(1.0, max(0.0, -z / (Hh + FRINGE)))))
    cl.map_by_position(body, uv, wv(0.09, 0.34, 0.90))
    flap = end("flap", 0.60, -0.075, -0.03, 0.22, -1, [0.0, -0.6, 0.9, -0.7, 0.8, 0.0], -0.062, [0.0, 0.14, 0.74, 0.88, 1.0])
    dc.paint(flap, cell, colour, shade=1.1)
    cl.map_by_position(flap, uv, wv(-0.09, 0.30, 0.60))
    # the turn of the cloth over the peg, in front of where both ends are gathered
    knot = dc.tube(name + "_bunch", [(0.004, -0.004, -0.004), (-0.004, -0.092, -0.050)], r=[0.040, 0.046], sides=3, cap=True, flat=(1.0, 0.7), phase=math.pi / 2, up=(0, 0, 1))
    dc.paint(knot, cell, colour, shade=0.85)
    return [body, flap, knot]


def _khaki(colour, k=0.85):
    """Pass i5 (visual reviewer: "the coats are a saturated olive that sits outside the teal palette"): the dyes were
    browns, and a brown under the stair's teal light turns olive green. Each is taken `k` of the way to the grey of its
    own lightness (a hair warm), so the cloth takes the room's hue and sits in it. -> linear rgb."""
    c = np.asarray(vcol.rgb(colour), np.float32)
    y = float(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2])
    g = np.asarray((y * 1.05, y, y * 0.93), np.float32)
    return tuple(float(v) for v in c * (1 - k) + g * k)


def build(args):
    specs = [("coat_long", coat("coat_long", args.seed + 1, 1.085, "linen", _khaki("#604A38"), ((0.60, 0.0), (0.64, 0.5)))),
             ("coat_short", coat("coat_short", args.seed + 2, 0.70, "linen", _khaki("workcloth_light"), ((0.50, 1.0), (0.45, 0.0)))),
             ("coat_shawl", shawl("coat_shawl", args.seed + 3, "linen", "#8C7A66"))]
    for name, parts in specs:
        if name == "coat_shawl":                                        # mark the border faces (by sheet row) before the join
            for o, (nu_, nv_, band, fringe) in zip(parts, ((5, 4, 2, 3), (5, 4, 2, 3), (1, 0, -1, -1))):
                at = o.data.attributes.new(BAND, 'INT', 'FACE')
                vals = [(2 if (i // nu_) == fringe and fringe != band else 1 if (i // nu_) == band else 0) for i in range(len(o.data.polygons))]
                at.data.foreach_set("value", vals)
        ob = dc.join(parts, name)
        print(f"COAT {name}: {dc.tris(ob)} triangles (200 a variant is what the gallery's dressing allowance counts)")
        dc.smooth(ob, angle=80)
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
            if name == "coat_shawl":
                bnd = band_of[p.face]
                p.mix((bnd == 1) * 0.95, STRIPE)                        # the woven border
                p.mix((bnd == 2) * 0.55, "#DCC7A0")                     # the fringe: undyed yarn, paler and warmer than the cloth
                p.mul((bnd == 2) * np.clip(1.0 - np.abs(np.sin(p.x * 60.0)), 0, 1), 0.8)
            # the stair lights every upright face alike: the folds are painted. A light from the upper left of the room
            # side, on the smooth normals: a fold's left flank is light, its right flank and its valley dark
            lit = np.clip(p.nrm[:, 0] * -0.52 + p.nrm[:, 1] * -0.60 + p.nrm[:, 2] * 0.60, -0.3, 1.0)
            k0, k1 = FOLD_SHAWL if name == "coat_shawl" else FOLD
            p.col[:] = p.col * (k0 + k1 * lit)[:, None]
            if name != "coat_shawl":
                body = p.y > -0.105 - 0.03 * t                           # not the collar or the lapped front (they stand proud)
                neck = np.clip(1.0 - np.abs(p.x) / (0.012 + 0.075 * np.clip(1.0 + p.z / 0.29, 0, 1)), 0, 1) * (p.z > -0.30) * body
                p.mix(np.clip(neck * 1.6, 0, 1) * 0.85, "#1F1714")      # the dark of the neck between the lapels
                gap = np.clip(1.0 - np.abs(p.x - 0.004) / 0.012, 0, 1) * body * (t > 0.2)
                p.mix(gap * 0.7, "#1F1714")                            # the shadow under the lapped front edge
                p.mix((np.abs(np.abs(p.x) - 0.17) < 0.07) * np.clip(1.0 - np.abs(t - 0.17) / 0.09, 0, 1) * 0.35, "#8A7462")   # shoulders rubbed pale
                p.mix((p.fnrm[:, 2] < -0.8) * 0.9, "#1F1714")           # the dark inside a cuff
            if name == "coat_short":
                p.mix(dc.P.near(p, (0.20, -0.10, -0.42), 0.11) * 0.9, "#9A846E")   # the patched elbow: paler cloth
            if name == "coat_long":
                p.mul(dc.P.near(p, (-0.11, -0.14, -0.58), 0.17), 0.8)   # a pocket's worth of old stain
        dc.compose(ob, ao=0.6, gradient=(1.0, 1.0), part_jitter=0.04, face_jitter=0.0, seed=args.seed, painters=[cloth], quiet=True)
        ob["wind"] = 1


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
