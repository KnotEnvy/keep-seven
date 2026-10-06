"""proj_canister: the Windlass's lobbed canister (ART_BIBLE 7.7, order art-boss 4.3). Builder: art-boss-windlass.

    node tools/build-assets.mjs --only proj_canister
    node tools/preview-asset.mjs proj_canister --cycles --game --piece art-boss-windlass

A squat ceramic pot 0.35 m across and 0.30 m tall, pivot at its centre: a turned foot, a stained belly, a `flame` emissive
seam sunk between the belly and a steel band, a domed shoulder and a flat steel lid. One mesh, m_prop, 76 triangles of 80
(instanced: no skin, no clips). An 8-sided lathe whose normals are those of the true surface of revolution (set by rule,
not by face angle), so it shades round in flight; only the lid, the foot and the seam's two lips are hard edges, and the
seam is its own ring so the glow is a hard, countable line at 20 m.
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
import math
import numpy as np
from lib import scene, mesh, uv, material, vcol, export

ASSET = "proj_canister"
SIDES = 8
# (radius, z, palette cell of the ring of faces ABOVE this profile point)
PROFILE = [
    (0.112, -0.150, "enamel_stain"),      # foot -> belly: the stained lower third
    (0.178, -0.040, "flame"),             # belly -> seam: the emissive line, 30 mm, sunk 14 mm
    (0.164, -0.012, "steel"),             # seam -> band: the steel band, 55 mm, proud of the seam
    (0.178, 0.043, "enamel"),             # band -> lid: the domed shoulder
    (0.092, 0.150, None),                 # lid rim (the cap closes it)
]


def build(args):
    bm = mesh.new_bmesh()
    rings = []
    for (r, z, _) in PROFILE:
        rings.append([bm.verts.new((math.cos(2 * math.pi * (k + 0.5) / SIDES) * r, math.sin(2 * math.pi * (k + 0.5) / SIDES) * r, z)) for k in range(SIDES)])
    cells = []
    for i in range(len(PROFILE) - 1):
        for k in range(SIDES):
            j = (k + 1) % SIDES
            bm.faces.new((rings[i][k], rings[i][j], rings[i + 1][j], rings[i + 1][k])); cells.append(PROFILE[i][2])
    bm.faces.new(list(reversed(rings[0]))); cells.append("steel_dark")            # the foot
    bm.faces.new(rings[-1]); cells.append("steel")                                 # the lid
    ob = mesh.new_mesh_object(ASSET + "_mesh", bm)
    mesh.finish(ob, bevel=0.0, smooth_angle=180, weighted=False)
    material.assign(ob, "m_prop")
    for name in sorted(set(cells)):
        fs = [i for i, c in enumerate(cells) if c == name]
        uv.map_to_palette(ob, name, faces=fs); vcol.tint(ob, name, faces=fs)
    # normals by rule: every side corner gets the normal of the revolved profile of ITS band at that vertex (radial, tipped
    # by the band's slope), so the eight flats shade as one round body and each band keeps its own crisp lip; caps are flat
    me = ob.data
    nrm = [None] * len(me.loops)
    for p in me.polygons:
        band = p.index // SIDES if p.index < SIDES * (len(PROFILE) - 1) else None
        for li in p.loop_indices:
            if band is None: nrm[li] = tuple(p.normal); continue
            co = me.vertices[me.loops[li].vertex_index].co
            (r0, z0, _), (r1, z1, _) = PROFILE[band], PROFILE[band + 1]
            L = math.hypot(r1 - r0, z1 - z0); nr = (z1 - z0) / L; nz = -(r1 - r0) / L
            rad = math.hypot(co.x, co.y)
            nrm[li] = (co.x / rad * nr, co.y / rad * nr, nz)
    me.normals_split_custom_set(nrm)
    vcol.bake_ao_vertex([ob], distance=0.25)
    vcol.compose_vertex_color(ob, mode='ratio', gradient=(0.72, 1.08), jitter=0.0, seed=args.seed)
    # the seam is light: AO and the ramp must not dim it. The belly under the seam and the shoulder over the band carry the
    # stain every Pellam seam has; the band's lower edge is scorched warm by the seam it sits on
    a = vcol.get_colors(ob); pos = vcol.corner_positions(ob); pol = vcol.poly_of_loop(ob)
    cell = np.array(cells, dtype=object)[pol]
    a[cell == "flame", :3] = 1.0
    stain = (cell == "enamel_stain") & (pos[:, 2] > -0.06)
    a[stain, :3] *= np.array([0.86, 0.74, 0.62], np.float32)                       # scorched under the seam
    scorch = (cell == "steel") & (pos[:, 2] < 0.0) & (np.hypot(pos[:, 0], pos[:, 1]) > 0.12)
    a[scorch, :3] = np.clip(a[scorch, :3] * np.array([1.0, 0.78, 0.6], np.float32), 0.0, 1.0)
    under_lid = (cell == "enamel") & (pos[:, 2] > 0.14)
    a[under_lid, :3] *= 0.82
    vcol.set_colors(ob, a)


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    export.export_asset(ASSET, args.out, blend=args.blend)
    if args.preview: export.preview(ASSET, args.out)


if __name__ == "__main__":
    scene.run(main)
